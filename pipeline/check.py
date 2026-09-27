"""python -m pipeline check [<id>]: the automated G1 rules (docs/GATES.md). Prints PASS/FAIL per rule.

A partitioned layer (M7) runs rules 2-15 on every partition's files, rule 16 on the layer, and rule 17 on the set.
"""
import csv
import json
import math
from pathlib import Path

import geopandas as gpd
import pyarrow.parquet as pq
import pyarrow.types as pat
import pyogrio

from pipeline.levels import TAG_COLUMNS
from pipeline.outputs import MAX_FILE_BYTES, csv_columns, data_dir, table_columns
from pipeline.partitions import file_base, partition_codes
from pipeline.recipes import load_recipes, load_schema, validate

NJ_BOX = (-75.8, 38.7, -73.7, 41.5)  # census tracts reach 38.79 in the ocean south of Cape May
MAX_CHECKLIST_VALUES = 60
SELFTEST_REQUIRED = True  # turned on in M3-T9: every build writes self-tests
PLACE_CODE_PATTERNS = {"county_fips": r"\d{3}", "mun_code": r"\d{4}( \d{4})*", "tract_geoid": r"34\d{9}",
                       "bg_geoid": r"34\d{10}"}
DATA_MODES = ("all", "all_by_district")
DEFAULT_DROPPED_SHARE = 0.05  # D-065, as reviewed by the owner on 2026-09-27


def inside_box(xmin, ymin, xmax, ymax) -> bool:
    west, south, east, north = NJ_BOX
    return west <= xmin <= xmax <= east and south <= ymin <= ymax <= north


def check_files(recipe: dict, folder: Path, base: str, meta: dict, low: float, high: float, rule) -> None:
    """Rules 2-15 for one set of files: a layer's, or one partition's (then low/high are 0/inf)."""
    needed = ["parquet", "pmtiles", "csv"] + (["geojson"] if meta["files"].get("geojson") else [])
    missing = [kind for kind in needed if not (folder / f"{base}.{kind}").exists()]
    if not rule("2 files exist", not missing, f"missing {missing}"):
        return

    parquet_path, csv_path = folder / f"{base}.parquet", folder / f"{base}.csv"
    frame = gpd.read_parquet(parquet_path)
    with csv_path.open(encoding="utf-8-sig", newline="") as stream:
        csv_rows = list(csv.reader(stream))
    counts = (meta["rows"], len(frame), len(csv_rows) - 1)
    rule("3 row counts agree and are expected",
         len(set(counts)) == 1 and low <= meta["rows"] <= high
         and meta["rows"] == meta["source_count"] - meta["dropped_empty_shapes"],
         f"meta/parquet/csv = {counts}, expected {low}-{high}, source {meta['source_count']}, "
         f"dropped {meta['dropped_empty_shapes']}")

    ids = frame["atlas_id"]
    rule("4 atlas_id unique and present", ids.notna().all() and not ids.duplicated().any(),
         f"{int(ids.isna().sum())} missing, {int(ids.duplicated().sum())} duplicated")

    expected_columns = table_columns(recipe) + ["geometry"]
    rule("5 column order", list(frame.columns) == expected_columns, f"got {list(frame.columns)}")

    schema = pq.read_schema(parquet_path)
    bad_types = [f"{name}:{kind}" for name, kind in zip(schema.names, schema.types)
                 if name != "geometry" and not (pat.is_string(kind) or pat.is_large_string(kind) or pat.is_float64(kind))]
    rule("6 types are string or float64", not bad_types, ", ".join(bad_types))

    rule("7 CRS is EPSG:4326", frame.crs is not None and frame.crs.to_epsg() == 4326, str(frame.crs))
    rule("8 bounds inside New Jersey box", inside_box(*frame.total_bounds),
         str([round(float(v), 4) for v in frame.total_bounds]))

    lon, lat = frame["lon"], frame["lat"]
    points_ok = lon.notna().all() and lat.notna().all() and lon.between(NJ_BOX[0], NJ_BOX[2]).all() \
        and lat.between(NJ_BOX[1], NJ_BOX[3]).all()
    rule("9 lon/lat present and inside box", bool(points_ok), f"{int(lon.isna().sum())} missing")

    if "county_fips" not in frame:
        rule("10 place codes well-formed and covered", None, "this layer has no place columns")
    else:
        malformed = [column for column, pattern in PLACE_CODE_PATTERNS.items()
                     if column in frame and not frame[column].dropna().astype(str).str.fullmatch(pattern).all()]
        coverage = float(frame["county_fips"].notna().mean()) if len(frame) else 0.0
        needed_coverage = 0.99 if recipe["place_tags"] in DATA_MODES else 1.0
        covered = coverage >= needed_coverage
        detail = f"county coverage {coverage:.4f} (need {needed_coverage})"
        if "bg_geoid" in TAG_COLUMNS[recipe["place_tags"]]:
            bg_coverage = float(frame["bg_geoid"].notna().mean()) if len(frame) else 0.0
            covered = covered and bg_coverage >= 0.99
            detail += f", block group coverage {bg_coverage:.4f} (need 0.99)"
        if malformed:
            detail += f", malformed {malformed}"
        rule("10 place codes well-formed and covered", not malformed and covered, detail)

    tiles_path = folder / f"{base}.pmtiles"
    layers = [layer[0] for layer in pyogrio.list_layers(tiles_path)]
    tile_fields = set(pyogrio.read_info(tiles_path, layer=layers[0])["fields"]) if layers else set()
    wanted = {"atlas_id"} | {f["name"] for f in recipe["fields"] if f["filter"] != "none"}
    rule("11 tile layer named after the layer with filter fields", layers == [recipe["id"]] and wanted <= tile_fields,
         f"layers {layers}, missing fields {sorted(wanted - tile_fields)}")

    too_many = {f["name"]: int(frame[f["name"]].nunique()) for f in recipe["fields"] if f["filter"] == "checklist"
                and frame[f["name"]].nunique() > MAX_CHECKLIST_VALUES}
    rule("12 checklists have at most 60 values", not too_many, f"use search for {too_many}")

    checklists = {f["name"] for f in recipe["fields"] if f["filter"] == "checklist"}
    ranges = {f["name"] for f in recipe["fields"] if f["filter"] == "range"}
    rule("13 meta has values and ranges", checklists <= set(meta["values"]) and ranges <= set(meta["ranges"]),
         f"values {sorted(meta['values'])}, ranges {sorted(meta['ranges'])}")

    too_big = {p.name: p.stat().st_size for p in folder.iterdir() if p.is_file() and p.stat().st_size > MAX_FILE_BYTES}
    rule("14 files at most 95 MB", not too_big, str(too_big))

    header = csv_rows[0] if csv_rows else []
    starts_with_bom = csv_path.read_bytes()[:3] == b"\xef\xbb\xbf"
    rule("15 CSV has BOM and labelled header", starts_with_bom and header == [h for _, h in csv_columns(recipe)],
         f"header {header}")


def check_selftest(recipe: dict, meta: dict, expected_all: int, rule) -> None:
    selftest = meta.get("selftest") or []
    if not selftest and not SELFTEST_REQUIRED:
        rule("16 self-tests present", None, "not generated until M3")
        return
    labels = [case["label"] for case in selftest]
    examples_present = all(example["label"] in labels for example in recipe["examples"])
    no_filter = [c for c in selftest if not c["state"]["conditions"] and not any(c["state"]["place"].values())]
    rule("16 self-tests present",
         examples_present and len(labels) == len(set(labels)) and bool(no_filter) and no_filter[0]["expected"] == expected_all,
         f"{len(selftest)} cases for {len(recipe['examples'])} examples")


def check_partitioned(root: Path, recipe: dict, meta: dict, rule) -> None:
    """Rules 2-15 on every partition (one line per rule), 16 on the layer, 17 on the whole set."""
    folder = data_dir(root, recipe["id"])
    partitions = json.loads((folder / "partitions.json").read_text(encoding="utf-8"))
    by_rule: dict[str, list] = {}
    for code in partitions:
        part_meta = json.loads((folder / code / "meta.json").read_text(encoding="utf-8"))

        def part_rule(name, passed, detail="", code=code):
            passed = None if passed is None else bool(passed)
            by_rule.setdefault(name, []).append((code, passed, detail))
            return passed

        check_files(recipe, folder / code, file_base(recipe, code), part_meta, 0, math.inf, part_rule)
    for name, entries in by_rule.items():
        failures = [f"{code}: {detail}" for code, passed, detail in entries if passed is False]
        skipped = all(passed is None for _, passed, _ in entries)
        rule(name, None if skipped else not failures,
             f"{len(entries)} partitions" + (f"; failing {len(failures)}: {failures[:3]}" if failures else ""))
    test_code = recipe["partition"]["selftest"]
    check_selftest(recipe, meta, partitions.get(test_code, {}).get("rows", -1), rule)
    codes = set(partition_codes(root))
    total = sum(part["rows"] for part in partitions.values())
    low, high = recipe["source"]["expected_count"]["min"], recipe["source"]["expected_count"]["max"]
    missing = sorted(codes - set(partitions))
    rule("17 partitions cover every municipality and add up",
         not missing and total == meta["rows"] and low <= total <= high
         and meta["rows"] == meta["source_count"] - meta["dropped_empty_shapes"],
         f"{len(partitions)} of {len(codes)} municipalities, {total} rows (expected {low}-{high}), "
         f"missing {missing[:5]}{'…' if len(missing) > 5 else ''}")


def check_layer(root: Path, layer_id: str) -> list[tuple[str, bool | None, str]]:
    """Return (rule, passed, detail); passed None means skipped."""
    results = []

    def rule(name, passed, detail=""):
        passed = None if passed is None else bool(passed)  # numpy bools must not slip through identity checks
        results.append((name, passed, detail))
        return passed

    path = root / "catalog" / "layers" / f"{layer_id}.json"
    if not path.exists():
        rule("1 recipe is valid", False, f"no recipe {path.name}")
        return results
    recipe = json.loads(path.read_text(encoding="utf-8"))
    problems = validate(recipe, load_schema(root), layer_id)
    if not rule("1 recipe is valid", not problems, "; ".join(problems)):
        return results
    if recipe["access"] == "live":
        rule("2 files exist", None, "live layer: nothing is built to check (D-030)")
        return results
    if recipe["access"] == "hybrid":
        check_hybrid(root, recipe, rule)
        return results

    folder = data_dir(root, layer_id)
    meta_path = folder / "meta.json"
    if not meta_path.exists():
        rule("2 files exist", False, "meta.json missing; build the layer first")
        return results
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if recipe.get("partition"):
        check_partitioned(root, recipe, meta, rule)
        return results
    low, high = recipe["source"]["expected_count"]["min"], recipe["source"]["expected_count"]["max"]
    check_files(recipe, folder, layer_id, meta, low, high, rule)
    if results[-1][0] != "2 files exist":  # rule 2 failing stops the file rules, and 16 with them
        check_selftest(recipe, meta, meta["rows"], rule)
    return results


def check_hybrid(root: Path, recipe: dict, rule) -> None:
    """Hybrid layers ship map tiles only (D-037): the file, its row count and its extent."""
    folder = data_dir(root, recipe["id"])
    meta_path = folder / "meta.json"
    tiles = folder / f"{recipe['id']}.pmtiles"
    if not rule("2 files exist", meta_path.exists() and tiles.exists(), "build the layer: python -m pipeline build " + recipe["id"]):
        return
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    rule("H1 map copy matches its record", meta["files"]["pmtiles"]["bytes"] == tiles.stat().st_size, "the tiles changed after the build")
    # Map copies are downloaded generalized to about 1 m (pipeline/hybrid.py); shapes that collapse to nothing are
    # dropped from the copy only, since counts, lists and exports stay live (D-065). Every record is accounted for.
    low, high = recipe["source"]["expected_count"]["min"], recipe["source"]["expected_count"]["max"]
    dropped = meta.get("dropped_empty_shapes", 0)
    rule("H2 rows plus dropped slivers within expected_count", low <= meta["rows"] + dropped <= high,
         f"{meta['rows']} rows + {dropped} dropped, expected {low}-{high}")
    allowed = recipe["tiles"].get("max_dropped_share", DEFAULT_DROPPED_SHARE)
    rule(f"H2b at most {allowed:.0%} dropped as zero-area slivers", dropped <= allowed * max(1, meta["source_count"]),
         f"{dropped} of {meta['source_count']} dropped; above {DEFAULT_DROPPED_SHARE:.0%} needs a reviewed tiles.max_dropped_share (D-065)")
    rule("H3 extent inside New Jersey", inside_box(*meta["bounds"]), f"bounds {meta['bounds']}")
    fields = {f["name"] for f in recipe["fields"]}
    rule("H4 map copy carries only recipe fields", set(meta["tile_fields"]) <= fields | {"atlas_id"}, f"{meta['tile_fields']}")


def built_layers(root: Path) -> list[str]:
    return [r["id"] for r in load_recipes(root)
            if r.get("access") in ("copy", "hybrid") and (data_dir(root, r["id"]) / "meta.json").exists()]


def catalog_layers(root: Path) -> list[str]:
    path = root / "site" / "data" / "catalog.json"
    return [layer["id"] for layer in json.loads(path.read_text(encoding="utf-8"))["layers"]] if path.exists() else []


def run_checks(root: Path, layer_id: str | None = None, echo=print, catalog_only: bool = False) -> bool:
    """Check one layer, every built layer, or (catalog_only) the layers in site/data/catalog.json."""
    layer_ids = [layer_id] if layer_id else (catalog_layers(root) if catalog_only else built_layers(root))
    if not layer_ids:
        echo("No built layers to check. Run: python -m pipeline build <id> --include-drafts")
        return False
    all_passed = True
    for current in layer_ids:
        echo(f"== {current}")
        for name, passed, detail in check_layer(root, current):
            label = "SKIP" if passed is None else ("PASS" if passed else "FAIL")
            echo(f"{label} {name}" + (f": {detail}" if detail and passed is not True else ""))
            all_passed &= passed is not False
    echo("CHECK: PASS" if all_passed else "CHECK: FAIL")
    return all_passed
