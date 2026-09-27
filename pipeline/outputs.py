"""Write a layer's files into site/data/<id>/. See OPERATING_GUIDE.md §6.4-6.5."""
import json
import math
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio

from pipeline.filters import count
from pipeline.levels import TAG_COLUMNS
from pipeline.partitions import file_base

MAX_FILE_BYTES = 95 * 1024 * 1024
PLACE_HEADERS = {"county": "County", "municipality": "Municipality", "tract": "Census tract",
                 "tract_geoid": "Census tract code", "block_group": "Block group", "bg_geoid": "Block group code"}
PLACE_KEYS = ("county_fips", "mun_code", "tract_geoid", "bg_geoid")
FORMULA_START = ("=", "+", "-", "@")


def data_dir(root: Path, layer_id: str) -> Path:
    return root / "site" / "data" / layer_id


def tag_columns(recipe: dict) -> list[str]:
    return TAG_COLUMNS[recipe["place_tags"]]


def table_columns(recipe: dict) -> list[str]:
    """Every Parquet column except geometry, in file order."""
    return ["atlas_id", *[f["name"] for f in recipe["fields"]], *tag_columns(recipe), "lon", "lat"]


def tile_columns(recipe: dict) -> list[str]:
    """Properties written into the map tiles: IDs, place codes and names, filtered and popup fields."""
    columns = ["atlas_id"]
    for field in recipe["fields"]:
        name = field["name"]
        if field["filter"] != "none" or field["popup"] or name in ("county_fips", "mun_code", recipe["label_field"]):
            columns.append(name)
    columns += [c for c in tag_columns(recipe) if c not in columns]
    return columns


def csv_columns(recipe: dict) -> list[list[str]]:
    """[column, header] pairs: recipe labels, then place tags (names, and census codes), Longitude, Latitude,
    Atlas ID."""
    pairs = [[f["name"], f["label"]] for f in recipe["fields"]]
    pairs += [[c, PLACE_HEADERS[c]] for c in tag_columns(recipe) if c in PLACE_HEADERS]
    return pairs + [["lon", "Longitude"], ["lat", "Latitude"], ["atlas_id", "Atlas ID"]]


def is_missing(value) -> bool:
    return value is None or value is pd.NA or (isinstance(value, float) and math.isnan(value))


def plain_number(value, decimals: int) -> str:
    """Fixed decimals without trailing zeros: 610.60 -> '610.6', 274534.0 -> '274534'."""
    if is_missing(value):
        return ""
    text = f"{value:.{decimals}f}"
    if decimals > 0:
        text = text.rstrip("0").rstrip(".")
    return "0" if text == "-0" else text


def safe_text(value) -> str:
    """Blank for missing values; a leading ' stops spreadsheets treating text as a formula."""
    if is_missing(value):
        return ""
    text = str(value)
    return "'" + text if text.startswith(FORMULA_START) else text


def records(frame: pd.DataFrame, columns: list[str]) -> list[dict]:
    """Plain Python rows (None for missing) for filtering and self-tests."""
    rows = frame[columns].to_dict("records")
    return [{k: (None if is_missing(v) else v) for k, v in row.items()} for row in rows]


def write_csv(recipe: dict, frame: gpd.GeoDataFrame, path: Path) -> None:
    decimals = {f["name"]: f.get("decimals", 2) for f in recipe["fields"] if f["type"] == "number"}
    decimals.update({"lon": 6, "lat": 6})
    out = {}
    for column, header in csv_columns(recipe):
        values = frame[column].tolist()
        if column in decimals:
            out[header] = [plain_number(v, decimals[column]) for v in values]
        else:
            out[header] = [safe_text(v) for v in values]
    pd.DataFrame(out).to_csv(path, index=False, encoding="utf-8-sig", lineterminator="\r\n")


def value_counts(series: pd.Series) -> list[dict]:
    counts = series.value_counts(dropna=True)
    items = sorted(({"value": str(v), "count": int(n)} for v, n in counts.items()), key=lambda item: item["value"])
    blanks = int(series.isna().sum())
    if blanks:
        items.append({"value": None, "count": blanks})
    return items


def value_range(series: pd.Series, kind: str) -> dict:
    present = series.dropna()
    if present.empty:
        return {"min": None, "max": None}
    if kind == "number":
        return {"min": float(present.min()), "max": float(present.max())}
    return {"min": str(present.min()), "max": str(present.max())}


def selftest_cases(recipe: dict, frame: pd.DataFrame) -> list[dict]:
    """Recipe examples plus two automatic cases, with counts from pipeline/filters.py (GATES.md G1 rule 16)."""
    rows = records(frame, table_columns(recipe))
    no_place = dict.fromkeys(PLACE_KEYS)
    cases = []
    for example in recipe["examples"]:
        place = {**no_place, **(example.get("place") or {})}
        state = {"layer": recipe["id"], "place": place, "conditions": example["conditions"]}
        cases.append({"label": example["label"], "state": state, "expected": count(state, rows, recipe["fields"])})
    cases.append({"label": f"All {recipe['noun']['plural']}", "expected": len(rows),
                  "state": {"layer": recipe["id"], "place": no_place, "conditions": []}})
    tagged = sorted((row for row in rows if row.get("county_fips")), key=lambda row: row["atlas_id"])
    if tagged:
        first = tagged[0]
        state = {"layer": recipe["id"], "place": {**no_place, "county_fips": first["county_fips"]}, "conditions": []}
        cases.append({"label": f"Place check: {first.get('county') or first['county_fips']}", "state": state,
                      "expected": count(state, rows, recipe["fields"])})
        # Every place code the first row has, down to its block group. A row listing several municipalities
        # (census tracts and block groups, D-021) is checked with the first one.
        deep = {key: str(first[key]).split(" ")[0] for key in PLACE_KEYS if first.get(key)}
        if len(deep) > 1:
            names = [str(first[name]).split("; ")[0] for name in ("block_group", "tract", "municipality")
                     if first.get(name)]
            state = {"layer": recipe["id"], "place": {**no_place, **deep}, "conditions": []}
            cases.append({"label": f"Area check: {', '.join(names[:2])}", "state": state,
                          "expected": count(state, rows, recipe["fields"])})
    return cases


def file_entry(root_data: Path, path: Path) -> dict:
    return {"path": path.relative_to(root_data).as_posix(), "bytes": path.stat().st_size}


def write_outputs(recipe: dict, frame: gpd.GeoDataFrame, root: Path, receipt: dict, stats: dict,
                  selftest: list | None = None, partition: str | None = None) -> dict:
    """Write Parquet, PMTiles, CSV, GeoJSON (when small enough) and meta.json. Returns meta.

    With `partition`, the files go to site/data/<id>/<code>/<id>_<code>.<ext>, without GeoJSON (D-027).
    """
    layer_id = recipe["id"]
    folder = data_dir(root, layer_id) / partition if partition else data_dir(root, layer_id)
    base = file_base(recipe, partition) if partition else layer_id
    folder.mkdir(parents=True, exist_ok=True)
    paths = {kind: folder / f"{base}.{kind}" for kind in ("parquet", "pmtiles", "csv", "geojson")}
    for path in [*paths.values(), folder / "meta.json"]:
        path.unlink(missing_ok=True)

    frame = frame[[*table_columns(recipe), "geometry"]]
    frame.to_parquet(paths["parquet"], compression="snappy", index=False)
    pyogrio.write_dataframe(frame[[*tile_columns(recipe), "geometry"]], paths["pmtiles"], layer=layer_id,
                            driver="PMTiles", dataset_options={"MINZOOM": str(recipe["tiles"]["min_zoom"]),
                                                               "MAXZOOM": str(recipe["tiles"]["max_zoom"]),
                                                               "NAME": recipe["title"]})
    write_csv(recipe, frame, paths["csv"])
    if not partition:
        pyogrio.write_dataframe(frame, paths["geojson"], driver="GeoJSON",
                                layer_options={"RFC7946": "YES", "COORDINATE_PRECISION": "6"})
        if paths["geojson"].stat().st_size > MAX_FILE_BYTES:
            paths["geojson"].unlink()

    root_data = root / "site" / "data"
    files = {kind: (file_entry(root_data, path) if path.exists() else None) for kind, path in paths.items()}
    fields = recipe["fields"]
    meta = {
        "id": layer_id,
        **({"partition": partition} if partition else {}),
        "rows": int(len(frame)),
        "source_count": int(receipt["count"]),
        "fetched_at": receipt["fetched_at"],
        "bounds": [round(float(v), 6) for v in frame.total_bounds],
        "files": files,
        "repaired_shapes": int(stats.get("repaired_shapes", 0)),
        "dropped_empty_shapes": int(stats.get("dropped_empty_shapes", 0)),
        "tagged_by_nearest": int(stats.get("tagged_by_nearest", 0)),
        "place_tag_coverage": round(float(frame["county_fips"].notna().mean()), 4)
        if len(frame) and "county_fips" in frame else None,
        "values": {f["name"]: value_counts(frame[f["name"]]) for f in fields if f["filter"] == "checklist"},
        "ranges": {f["name"]: value_range(frame[f["name"]], f["type"]) for f in fields if f["filter"] == "range"},
        "selftest": selftest if selftest is not None else selftest_cases(recipe, frame),
    }
    (folder / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return meta


def merge_values(lists: list[list[dict]]) -> list[dict]:
    totals = {}
    for items in lists:
        for item in items:
            totals[item["value"]] = totals.get(item["value"], 0) + item["count"]
    known = sorted((value for value in totals if value is not None))
    return [{"value": value, "count": totals[value]} for value in known] + \
        ([{"value": None, "count": totals[None]}] if None in totals else [])


def merge_ranges(ranges: list[dict]) -> dict:
    lows = [r["min"] for r in ranges if r["min"] is not None]
    highs = [r["max"] for r in ranges if r["max"] is not None]
    return {"min": min(lows) if lows else None, "max": max(highs) if highs else None}


def write_partitioned_meta(recipe: dict, root: Path) -> dict:
    """Combine every built partition's meta.json into the layer's meta.json and partitions.json (§6.9)."""
    folder = data_dir(root, recipe["id"])
    metas = {path.parent.name: json.loads(path.read_text(encoding="utf-8"))
             for path in sorted(folder.glob("*/meta.json"))}
    if not metas:
        raise ValueError(f"{recipe['id']}: no partitions have been built")
    rows = sum(meta["rows"] for meta in metas.values())
    boxes = [meta["bounds"] for meta in metas.values()]
    partitions = {code: {"rows": meta["rows"], "bounds": meta["bounds"], "files": meta["files"]}
                  for code, meta in metas.items()}
    test_code = recipe["partition"]["selftest"]
    selftest = [{**case, "partition": test_code} for case in metas.get(test_code, {}).get("selftest", [])]
    covered = sum((meta["place_tag_coverage"] or 0) * meta["rows"] for meta in metas.values())
    fields = recipe["fields"]
    partitions_path = folder / "partitions.json"
    partitions_path.write_text(json.dumps(partitions, ensure_ascii=False, separators=(",", ":")) + "\n",
                               encoding="utf-8")
    meta = {
        "id": recipe["id"],
        "partitioned": True,
        "rows": rows,
        "source_count": sum(meta["source_count"] for meta in metas.values()),
        "fetched_at": min(meta["fetched_at"] for meta in metas.values()),
        "bounds": [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)],
        "files": None,
        "partitions": {"count": len(metas), "path": file_entry(root / "site" / "data", partitions_path)["path"],
                       "bytes": sum(entry["bytes"] for meta in metas.values() for entry in meta["files"].values() if entry)},
        "repaired_shapes": sum(meta["repaired_shapes"] for meta in metas.values()),
        "dropped_empty_shapes": sum(meta["dropped_empty_shapes"] for meta in metas.values()),
        "tagged_by_nearest": sum(meta["tagged_by_nearest"] for meta in metas.values()),
        "place_tag_coverage": round(covered / rows, 4) if rows else None,
        "values": {f["name"]: merge_values([m["values"][f["name"]] for m in metas.values()])
                   for f in fields if f["filter"] == "checklist"},
        "ranges": {f["name"]: merge_ranges([m["ranges"][f["name"]] for m in metas.values()])
                   for f in fields if f["filter"] == "range"},
        "selftest": selftest,
    }
    (folder / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return meta

