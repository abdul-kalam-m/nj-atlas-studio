"""Studio's catalog (site/data/studio.json) and area outlines (site/data/outlines/<level>/<code>.json).

The atlas keeps its own catalog.json (copy layers only). Studio lists every chosen recipe, live and hybrid
included, with the recipe v2 fields the browser needs (docs/studio/IMPLEMENTATION_GUIDE.md §4.1). `leave_out`
never leaves the recipe: Studio requests only the fields listed here.
"""
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import shapely

from pipeline.catalog import CatalogError, layer_entry, load_hosting
from pipeline.levels import LEVELS
from pipeline.outputs import data_dir
from pipeline.places import boundary_path
from pipeline.recipes import get_recipe, load_recipes, load_schema

# Keys of a field the browser needs to query live sources and apply display-time transforms.
STUDIO_FIELD_KEYS = ("source", "name", "label", "type", "filter", "popup", "unit", "decimals", "transform",
                     "value_labels")
SHARED_KEYS = ("id", "title", "category", "status", "geometry", "noun", "summary", "label_field", "access",
               "area_mode", "area_codes", "min_zoom", "styles", "default_style", "legend", "buffer_role",
               "distance_query", "list_fields", "clip_mode", "refresh_cadence", "export_notes", "examples")
# About 10 m in degrees. The trial (docs/studio/TRIAL.md) found query time follows outline detail: a 961-point
# outline took 3.8 s against NJDEP flood zones, a 318-point one 1.3 s, with counts within 1%.
OUTLINE_TOLERANCE = 0.0001
STATE_CODE = "34"


def read_meta(root: Path, layer_id: str) -> dict | None:
    path = data_dir(root, layer_id) / "meta.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def studio_entry(recipe: dict, meta: dict | None, hosting: dict, for_release: bool) -> dict:
    entry = {key: recipe[key] for key in SHARED_KEYS if key in recipe}
    source = recipe["source"]
    entry["source"] = {key: source[key] for key in ("url", "where", "id_field", "publisher", "landing_page")}
    entry["license"] = {key: recipe["license"][key] for key in ("name", "url", "attribution")}
    entry["fields"] = [{key: field[key] for key in STUDIO_FIELD_KEYS if key in field} for field in recipe["fields"]]
    if recipe["access"] == "copy":
        if meta is None:
            raise CatalogError(f"{recipe['id']} has no build output; run: python -m pipeline build {recipe['id']}")
        atlas = layer_entry(recipe, meta)
        for key in ("place_tags", "rows", "fetched_at", "bounds", "files", "values", "ranges", "table_columns",
                    "csv_columns", "partition"):
            if key in atlas:
                entry[key] = atlas[key]
        entry["tiles"] = {"url": None, "path": f"{recipe['id']}/{recipe['id']}.pmtiles", **recipe["tiles"]}
    elif recipe["access"] == "hybrid":
        tiles_url = hosting.get("tiles_base_url")
        built = meta is not None and meta.get("access") == "hybrid"
        # Local builds draw hybrid layers from site/data; a release needs the tile host (O-6), and without one the
        # layer is drawn live, like a live layer, until the host exists.
        if built and (not for_release or tiles_url):
            entry["tiles"] = {"url": tiles_url if for_release else None,
                              "path": f"{recipe['id']}/{recipe['id']}.pmtiles", **recipe["tiles"],
                              "built_at": meta["built_at"], "fields": meta["tile_fields"]}
            entry["values"] = meta["values"]
        else:
            entry["tiles"] = None
            entry["min_zoom"] = recipe["tiles"]["min_zoom"] + 3  # drawn live: start closer in
    return entry


def build_studio_catalog(root: Path, include_drafts: bool, for_release: bool = False, notes: list | None = None) -> dict:
    notes = [] if notes is None else notes
    hosting = load_hosting(root)
    order = load_schema(root)["properties"]["category"]["enum"]
    layers = []
    for recipe in (get_recipe(root, r["id"]) for r in load_recipes(root)):
        if recipe["status"] != "published" and not include_drafts:
            continue
        if recipe.get("partition"):
            notes.append(f"{recipe['id']} left out of Studio: split layers are parked (D-031)")
            continue
        entry = studio_entry(recipe, read_meta(root, recipe["id"]), hosting, for_release)
        if recipe["access"] == "hybrid" and entry["tiles"] is None:
            notes.append(f"{recipe['id']}: no map tiles in this build, so Studio draws it live")
        layers.append(entry)
    search = json.loads((root / "catalog" / "search.json").read_text(encoding="utf-8"))
    templates = json.loads((root / "catalog" / "templates.json").read_text(encoding="utf-8"))
    ids = {layer["id"] for layer in layers}
    for name, template in templates.items():
        if name == "description":
            continue
        missing = [layer["id"] for layer in template["layers"] if layer["id"] not in ids]
        if missing:
            raise CatalogError(f"template {name} names layers that are not in this build: {', '.join(missing)}")
    return {
        "version": 2,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_base_url": "data/",
        "counter_url": hosting.get("counter_url") if for_release else None,
        "search": {key: value for key, value in search.items() if key != "description"},
        "templates": {name: value for name, value in templates.items() if name != "description"},
        "categories": [category for category in order if any(layer["category"] == category for layer in layers)],
        "layers": sorted(layers, key=lambda layer: (order.index(layer["category"]), layer["title"])),
    }


def outline_geometry(geometry) -> dict:
    simple = shapely.simplify(geometry, OUTLINE_TOLERANCE, preserve_topology=True)
    simple = shapely.set_precision(simple, 0.000001)
    if not simple.is_valid:
        simple = shapely.make_valid(simple)
    return json.loads(shapely.to_geojson(simple))


def write_outlines(root: Path, echo=print) -> dict[str, int]:
    """One small GeoJSON geometry per area, fetched only for the area a map uses."""
    folder = root / "site" / "data" / "outlines"
    shutil.rmtree(folder, ignore_errors=True)
    counts = {}
    for level in LEVELS:
        path = boundary_path(root, level["layer"])
        if not path.exists():
            continue
        frame = gpd.read_parquet(path)
        out = folder / level["id"]
        out.mkdir(parents=True, exist_ok=True)
        for row in frame.itertuples():
            code = getattr(row, level["code"]) if level["code"] else STATE_CODE
            text = json.dumps(outline_geometry(row.geometry), separators=(",", ":"))
            (out / f"{code}.json").write_text(text + "\n", encoding="utf-8", newline="\n")
        counts[level["id"]] = len(frame)
    size = sum(p.stat().st_size for p in folder.rglob("*.json"))
    echo("outlines: " + ", ".join(f"{level} ({n})" for level, n in counts.items()) + f", {size / 1e6:.1f} MB")
    return counts


def write_studio_catalog(root: Path, include_drafts: bool, for_release: bool = False, echo=print) -> dict:
    notes = []
    catalog = build_studio_catalog(root, include_drafts, for_release, notes)
    for note in notes:
        echo(note)
    path = root / "site" / "data" / "studio.json"
    path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8",
                    newline="\n")
    kinds = {access: sum(1 for layer in catalog["layers"] if layer["access"] == access)
             for access in ("copy", "hybrid", "live")}
    echo(f"studio.json: {len(catalog['layers'])} layer(s): " + ", ".join(f"{n} {k}" for k, n in kinds.items()))
    write_outlines(root, echo)
    return catalog
