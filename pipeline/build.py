"""python -m pipeline build: fetch -> normalize -> place tags -> outputs."""
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import geopandas as gpd

from pipeline.fetch import fetch, fetch_partitions, raw_dir
from pipeline.hybrid import build_hybrid
from pipeline.levels import BUILD_ORDER
from pipeline.lookups import field_lookups
from pipeline.normalize import normalize
from pipeline.outputs import write_outputs, write_partitioned_meta
from pipeline.partitions import check_code, is_partitioned, partition_codes
from pipeline.places import load_boundaries, tag_places
from pipeline.recipes import RecipeError, get_recipe, is_copy, load_recipes, require_buildable


def build_frame(root: Path, recipe: dict, receipt: dict, boundaries: dict, partition: str | None = None) -> dict:
    """normalize -> place tags -> outputs for one downloaded layer or partition."""
    source = raw_dir(root, recipe["id"], partition) / "source.geojson"
    collection = json.loads(source.read_text(encoding="utf-8"))
    raw = gpd.GeoDataFrame.from_features(collection["features"], crs="EPSG:4326")
    frame = normalize(recipe, raw, field_lookups(root, recipe))
    stats = dict(frame.attrs)
    frame = tag_places(frame, recipe["place_tags"], boundaries)
    stats["tagged_by_nearest"] = frame.attrs.get("tagged_by_nearest", 0)
    return write_outputs(recipe, frame, root, receipt, stats, selftest=None, partition=partition)


WORKER = {}  # per-process state for parallel partition builds


def start_worker(root: str, recipe: dict) -> None:
    WORKER.update(root=Path(root), recipe=recipe, boundaries=load_boundaries(Path(root), recipe["place_tags"]))


def build_partition(code: str, root: Path | None = None, recipe: dict | None = None, boundaries: dict | None = None,
                    refresh: bool = False) -> tuple[str, int | None]:
    """Build one municipality; returns (code, rows), with rows None when the source has no records for it."""
    root, recipe = root or WORKER["root"], recipe or WORKER["recipe"]
    boundaries = boundaries or WORKER["boundaries"]
    receipt = fetch(recipe, root, refresh=refresh, echo=lambda *_: None, partition=code)
    if receipt["count"] == 0:
        return code, None
    return code, build_frame(root, recipe, receipt, boundaries, partition=code)["rows"]


def build_partitioned(root: Path, recipe: dict, refresh: bool = False, echo=print, only: str | None = None,
                      jobs: int = 1) -> dict:
    """Build every municipality of a partitioned layer (or just `only`), then combine their meta (§6.9).

    With jobs > 1, every download is first fetched or confirmed one request at a time (§7), then several
    municipalities are built at once, each worker loading the boundary layers once.
    """
    codes = [check_code(only)] if only else partition_codes(root)
    if jobs > 1 and not only:
        fetch_partitions(recipe, root, refresh=refresh, echo=lambda *_: None)
        with ProcessPoolExecutor(max_workers=jobs, initializer=start_worker, initargs=(str(root), recipe)) as pool:
            results = pool.map(build_partition, codes, chunksize=2)
            for number, (code, rows) in enumerate(results, start=1):
                echo(f"[{number}/{len(codes)}] {recipe['id']}/{code}: " + ("no records, skipped" if rows is None else f"{rows} rows"))
    else:
        boundaries = load_boundaries(root, recipe["place_tags"])  # read once for all partitions
        for number, code in enumerate(codes, start=1):
            _, rows = build_partition(code, root, recipe, boundaries, refresh=refresh)
            echo(f"[{number}/{len(codes)}] {recipe['id']}/{code}: " + ("no records, skipped" if rows is None else f"{rows} rows"))
    meta = write_partitioned_meta(recipe, root)
    echo(f"{recipe['id']}: {meta['rows']} rows in {meta['partitions']['count']} partitions "
         f"({meta['partitions']['bytes'] / 1e6:.0f} MB)")
    return meta


def build_layer(root: Path, recipe: dict, refresh: bool = False, echo=print, partition: str | None = None,
                jobs: int = 1) -> dict:
    if is_partitioned(recipe):
        return build_partitioned(root, recipe, refresh=refresh, echo=echo, only=partition, jobs=jobs)
    if partition:
        raise RecipeError(f"{recipe['id']} is not partitioned; leave out --partition")
    receipt = fetch(recipe, root, refresh=refresh, echo=echo)
    meta = build_frame(root, recipe, receipt, load_boundaries(root, recipe["place_tags"]))
    files = ", ".join(f"{kind} {entry['bytes'] / 1e6:.2f} MB" for kind, entry in meta["files"].items() if entry)
    echo(f"{recipe['id']}: {meta['rows']} rows written ({files})")
    if meta["files"]["geojson"] is None:
        echo(f"{recipe['id']}: GeoJSON skipped because it would exceed 95 MB")
    return meta


def build_order(recipes: list[dict]) -> list[dict]:
    return sorted(recipes, key=lambda r: (BUILD_ORDER[r["place_tags"]], r["id"]))


def run_build(root: Path, layer: str | None, build_all: bool, include_drafts: bool, refresh: bool, echo=print,
              partition: str | None = None, jobs: int = 1) -> None:
    if build_all:
        recipes = [get_recipe(root, r["id"]) for r in load_recipes(root)]
        live = sorted(r["id"] for r in recipes if r["access"] == "live")
        if live:
            echo(f"Skipping live layers (nothing to build, D-030): {', '.join(live)}")
        hybrid = sorted(r["id"] for r in recipes if r["access"] == "hybrid")
        if hybrid:
            echo(f"Skipping hybrid layers (large; build each by name): {', '.join(hybrid)}")
        recipes = [r for r in recipes if is_copy(r)]
        chosen = [r for r in recipes if (include_drafts or r["status"] == "published") and not is_partitioned(r)]
        skipped = sorted(r["id"] for r in recipes if r not in chosen and not is_partitioned(r))
        if skipped:
            echo(f"Skipping drafts (use --include-drafts): {', '.join(skipped)}")
        large = sorted(r["id"] for r in recipes if is_partitioned(r))
        if large:
            echo(f"Skipping large layers (build each by name): {', '.join(large)}")
        for recipe in build_order(chosen):
            build_layer(root, recipe, refresh=refresh, echo=echo)
        return
    if not layer:
        raise RecipeError("Name a layer or pass --all")
    recipe = get_recipe(root, layer)
    require_buildable(recipe)
    if recipe["status"] == "draft" and not include_drafts:
        raise RecipeError(f"{layer} is a draft; pass --include-drafts to build it")
    if recipe["access"] == "hybrid":
        build_hybrid(root, recipe, refresh=refresh, echo=echo)
        return
    build_layer(root, recipe, refresh=refresh, echo=echo, partition=partition, jobs=jobs)
