"""Hybrid layers (DECISIONS.md D-030, D-037): map tiles only.

The download streams to build/raw/<id>/source.geojsonl one page at a time, so a layer of 600,000 polygons never
sits in memory as JSON. The build writes site/data/<id>/<id>.pmtiles and meta.json. Counts, lists and exports
of hybrid layers are queried live by Studio, so no Parquet, CSV or GeoJSON is written.
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pyogrio

from pipeline.arcgis import (FetchError, batches, esri_page_to_features, http_get_json, http_post_json, layer_info,
                             object_id_field, object_ids, supports_geojson)
from pipeline.normalize import normalize
from pipeline.outputs import data_dir, file_entry, value_counts, value_range

MAX_BATCH = 1000
# About 1 m in degrees: far finer than a zoom-14 tile needs, and it keeps downloads of detailed shapes small.
MAX_ALLOWABLE_OFFSET = 0.00001


def raw_folder(root: Path, layer_id: str) -> Path:
    return root / "build" / "raw" / layer_id


def style_fields(recipe: dict) -> set[str]:
    names = set()
    for style in recipe["styles"].values():
        names.update(name for name in (style.get("field"), (style.get("labels") or {}).get("field")) if name)
    return names


def tile_fields(recipe: dict) -> list[str]:
    """The fields a hybrid layer's tiles carry: those its styles, labels, filters and popups use (D-037)."""
    wanted = style_fields(recipe) | {recipe["label_field"]}
    return [f["name"] for f in recipe["fields"] if f["name"] in wanted or f["filter"] != "none" or f["popup"]]


def fetch_stream(recipe: dict, root: Path, refresh: bool = False, get_json=http_get_json, post_json=http_post_json,
                 echo=print) -> dict:
    folder = raw_folder(root, recipe["id"])
    source_path, receipt_path = folder / "source.geojsonl", folder / "fetch.json"
    if source_path.exists() and receipt_path.exists() and not refresh:
        echo(f"{recipe['id']}: using cached download from {receipt_path.relative_to(root)}")
        return json.loads(receipt_path.read_text(encoding="utf-8"))
    source = recipe["source"]
    url, where = source["url"], source["where"]
    info = layer_info(url, get_json)
    available = {field["name"] for field in info.get("fields", [])}
    wanted = [field["source"] for field in recipe["fields"]] + [source["id_field"]]
    missing = sorted(set(wanted) - available)
    if missing:
        raise FetchError(f"{recipe['id']}: the source has no field(s) {', '.join(missing)}. Stop and ask the human.")
    ids = object_ids(url, where, get_json)
    low, high = source["expected_count"]["min"], source["expected_count"]["max"]
    if not low <= len(ids) <= high:
        raise FetchError(f"{recipe['id']}: the source reports {len(ids)} records, outside expected_count "
                         f"{low}-{high}. Stop and ask the human.")
    oid_field = object_id_field(info)
    use_geojson = supports_geojson(info)
    fields = ",".join(sorted(set(wanted) | {oid_field}))
    pages = batches(ids, min(int(info.get("maxRecordCount") or MAX_BATCH), MAX_BATCH))
    folder.mkdir(parents=True, exist_ok=True)
    partial = source_path.with_suffix(".partial")
    digest = hashlib.sha256()
    count = 0
    echo(f"{recipe['id']}: downloading {len(ids)} records in {len(pages)} pages")
    with partial.open("wb") as out:
        for number, batch in enumerate(pages, start=1):
            params = {"where": where, "objectIds": ",".join(map(str, batch)), "outFields": fields,
                      "returnGeometry": "true", "outSR": "4326", "geometryPrecision": "6",
                      "maxAllowableOffset": str(MAX_ALLOWABLE_OFFSET), "f": "geojson" if use_geojson else "json"}
            page = post_json(url + "/query", params)
            features = page.get("features", []) if use_geojson else esri_page_to_features(page)
            returned = sorted(feature.get("properties", {}).get(oid_field) for feature in features)
            if returned != batch:
                raise FetchError(f"{recipe['id']}: page {number} of {len(pages)} is incomplete")
            for feature in features:
                line = (json.dumps(feature, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
                digest.update(line)
                out.write(line)
            count += len(features)
            if number % 50 == 0 or number == len(pages):
                echo(f"  page {number}/{len(pages)}")
    partial.replace(source_path)
    receipt = {"id": recipe["id"], "url": url, "where": where, "count": count,
               "max_record_count": info.get("maxRecordCount"), "format": "geojsonl",
               "max_allowable_offset": MAX_ALLOWABLE_OFFSET,
               "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "sha256": digest.hexdigest()}
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    echo(f"{recipe['id']}: saved {count} records to {source_path.relative_to(root)}")
    return receipt


def build_hybrid(root: Path, recipe: dict, refresh: bool = False, echo=print) -> dict:
    receipt = fetch_stream(recipe, root, refresh=refresh, echo=echo)
    raw = gpd.read_file(raw_folder(root, recipe["id"]) / "source.geojsonl", engine="pyogrio")
    if raw.crs is None:
        raw = raw.set_crs(4326)
    frame = normalize(recipe, raw)
    stats = dict(frame.attrs)
    folder = data_dir(root, recipe["id"])
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{recipe['id']}.pmtiles"
    for old in (path, folder / "meta.json"):
        old.unlink(missing_ok=True)
    columns = ["atlas_id", *tile_fields(recipe)]
    pyogrio.write_dataframe(frame[[*columns, "geometry"]], path, layer=recipe["id"], driver="PMTiles",
                            dataset_options={"MINZOOM": str(recipe["tiles"]["min_zoom"]),
                                             "MAXZOOM": str(recipe["tiles"]["max_zoom"]), "NAME": recipe["title"]})
    fields = recipe["fields"]
    meta = {
        "id": recipe["id"], "access": "hybrid", "rows": int(len(frame)), "source_count": int(receipt["count"]),
        "fetched_at": receipt["fetched_at"],
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "bounds": [round(float(v), 6) for v in frame.total_bounds],
        "files": {"pmtiles": file_entry(root / "site" / "data", path)},
        "tile_fields": columns,
        "repaired_shapes": int(stats.get("repaired_shapes", 0)),
        "dropped_empty_shapes": int(stats.get("dropped_empty_shapes", 0)),
        "values": {f["name"]: value_counts(frame[f["name"]]) for f in fields if f["filter"] == "checklist"},
        "ranges": {f["name"]: value_range(frame[f["name"]], f["type"]) for f in fields if f["filter"] == "range"},
    }
    (folder / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    echo(f"{recipe['id']}: {meta['rows']} rows, tiles {path.stat().st_size / 1e6:.1f} MB")
    return meta
