"""python -m pipeline catalog: write site/data/catalog.json, places.json and places/<level>.json.

See OPERATING_GUIDE.md §6.6.
"""
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd

from pipeline.outputs import csv_columns, data_dir, table_columns
from pipeline.levels import COUNTY_LAYER, LEVELS, MUNICIPALITY_LAYER
from pipeline.places import boundary_path
from pipeline.recipes import get_recipe, load_recipes, load_schema

PUBLIC_FIELD_KEYS = ("name", "label", "type", "filter", "popup", "unit", "decimals")


class CatalogError(RuntimeError):
    """The catalog cannot be written, usually because a layer has not been built."""


def read_meta(root: Path, layer_id: str) -> dict:
    path = data_dir(root, layer_id) / "meta.json"
    if not path.exists():
        raise CatalogError(f"{layer_id} has no build output; run: python -m pipeline build {layer_id} --include-drafts")
    return json.loads(path.read_text(encoding="utf-8"))


def load_hosting(root: Path) -> dict:
    path = root / "catalog" / "hosting.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"r2_base_url": None}


def layer_entry(recipe: dict, meta: dict, base_url: str | None = None) -> dict:
    """One catalog layer. Partitioned layers (§6.9) name their partitions file instead of files, and base_url says
    where their files live (null: next to the site, under data_base_url)."""
    partition = recipe.get("partition")
    extra = {"partition": {"by": partition["by"], "host": partition["host"], "path": meta["partitions"]["path"],
                           "count": meta["partitions"]["count"], "selftest": partition["selftest"]},
             "base_url": base_url} if partition else {}
    return {
        "id": recipe["id"],
        "title": recipe["title"],
        "category": recipe["category"],
        "status": recipe["status"],
        "geometry": recipe["geometry"],
        "noun": recipe["noun"],
        "summary": recipe["summary"],
        "source": {key: recipe["source"][key] for key in ("type", "url", "publisher", "landing_page")},
        "license": recipe["license"],
        "fields": [{key: field[key] for key in PUBLIC_FIELD_KEYS if key in field} for field in recipe["fields"]],
        "label_field": recipe["label_field"],
        "place_tags": recipe["place_tags"],
        "style": {"color": recipe["styles"][recipe["default_style"]]["color"]},  # the atlas draws one color
        "tiles": recipe["tiles"],
        "examples": recipe["examples"],
        "table_columns": table_columns(recipe),
        "csv_columns": csv_columns(recipe),
        "rows": meta["rows"],
        "fetched_at": meta["fetched_at"],
        "bounds": meta["bounds"],
        "files": meta["files"],
        "values": meta["values"],
        "ranges": meta["ranges"],
        "selftest": meta["selftest"],
        **extra,
    }


def rounded_bounds(geometry) -> list[float]:
    return [round(float(v), 5) for v in geometry.bounds]


def natural_key(text: str) -> list:
    """'Census Tract 9' sorts before 'Census Tract 10'."""
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", text)]


def level_units(level: dict, frame) -> list[dict]:
    """One picker entry per area: code, name, the codes of the areas above it, and its bounds."""
    units = []
    for row in frame.to_dict("records"):
        unit = {"code": row[level["code"]], "name": row[level["name"]]}
        if level["code"] != "county_fips" and row.get("county_fips"):
            unit["county"] = row["county_fips"]
        if level["id"] == "block_group":
            unit["tract"] = row["tract_geoid"]
        if level["id"] in ("tract", "block_group"):  # every municipality sharing enough area (D-021)
            unit["muns"] = str(row["mun_code"]).split(" ") if row.get("mun_code") else []
        unit["bounds"] = rounded_bounds(row["geometry"])
        units.append(unit)
    return sorted(units, key=lambda unit: (natural_key(unit["name"]), unit["code"]))


def build_places(root: Path, layer_ids: set[str]) -> tuple[dict, dict[str, list]]:
    """places.json lists the boundary levels in the catalog; each level's areas go in their own file."""
    missing = [layer for layer in (COUNTY_LAYER, MUNICIPALITY_LAYER)
               if layer not in layer_ids or not boundary_path(root, layer).exists()]
    if missing:
        raise CatalogError(f"The place pickers need {' and '.join(missing)}: build them, and publish them or pass "
                           "--include-drafts")
    levels, units = [], {}
    for level in LEVELS:
        layer = level["layer"]
        if layer not in layer_ids:
            continue
        entry = {"id": level["id"], "layer": layer, "tiles": f"{layer}/{layer}.pmtiles"}
        if level["code"]:
            units[level["id"]] = level_units(level, gpd.read_parquet(boundary_path(root, layer)))
            entry.update({"code": level["code"], "name": level["name"], "parent": level["parent"],
                          "units": f"places/{level['id']}.json", "count": len(units[level["id"]])})
        levels.append(entry)
    return {"version": 2, "levels": levels}, units


def build_catalog(root: Path, include_drafts: bool, for_release: bool = False,
                  notes: list | None = None) -> tuple[dict, dict, dict]:
    """With for_release, layers hosted on R2 point at catalog/hosting.json's r2_base_url, or are left out while
    it is null. Partitioned layers that have not been built are left out with a note (build --all skips them)."""
    notes = [] if notes is None else notes
    recipes = [get_recipe(root, r["id"]) for r in load_recipes(root)]
    # The atlas catalog lists copy layers only; Studio's entries for live and hybrid layers come with S1-T1.
    chosen = [r for r in recipes if r["access"] == "copy" and (include_drafts or r["status"] == "published")]
    r2_url = load_hosting(root).get("r2_base_url")
    layers = []
    for recipe in chosen:
        base_url = None
        if recipe.get("partition"):
            if not (data_dir(root, recipe["id"]) / "meta.json").exists():
                notes.append(f"{recipe['id']} left out: not built (python -m pipeline build {recipe['id']})")
                continue
            if for_release and recipe["partition"]["host"] == "r2":
                if not r2_url:
                    notes.append(f"{recipe['id']} left out: catalog/hosting.json has no r2_base_url yet (O-6)")
                    continue
                base_url = r2_url
        layers.append(layer_entry(recipe, read_meta(root, recipe["id"]), base_url))
    order = load_schema(root)["properties"]["category"]["enum"]
    used = {layer["category"] for layer in layers}
    catalog = {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_base_url": "data/",
        "categories": [category for category in order if category in used],
        "layers": sorted(layers, key=lambda layer: (order.index(layer["category"]), layer["title"])),
    }
    return (catalog, *build_places(root, {layer["id"] for layer in layers}))


def write_catalog(root: Path, include_drafts: bool, echo=print, for_release: bool = False) -> None:
    notes = []
    catalog, places, units = build_catalog(root, include_drafts, for_release=for_release, notes=notes)
    for note in notes:
        echo(note)
    folder = root / "site" / "data"
    shutil.rmtree(folder / "places", ignore_errors=True)  # a level left out of this catalog must not linger
    (folder / "places").mkdir(parents=True)
    files = {"catalog.json": catalog, "places.json": places}
    files.update({f"places/{level}.json": areas for level, areas in units.items()})
    for name, content in files.items():
        (folder / name).write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n",
                                   encoding="utf-8")
    echo(f"catalog.json: {len(catalog['layers'])} layer(s) ({', '.join(l['id'] for l in catalog['layers'])})")
    echo("places.json: " + ", ".join(f"{level['id']} ({level.get('count', 1)})" for level in places["levels"]))
