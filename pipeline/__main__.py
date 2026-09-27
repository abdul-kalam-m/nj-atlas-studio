"""Command line: python -m pipeline <command>."""
import argparse
import sys


from pipeline import ROOT


def not_implemented(args):
    print("not implemented yet")
    return 2


def cmd_validate(args):
    from pipeline.recipes import validate_all
    results = validate_all(ROOT)
    if not results:
        print("No recipes found in catalog/layers/")
        return 1
    ok = True
    for layer_id, problems in results.items():
        if problems:
            ok = False
            print(f"INVALID {layer_id}")
            for problem in problems:
                print(f"  - {problem}")
        else:
            print(f"OK {layer_id}")
    return 0 if ok else 1


def cmd_inspect(args):
    from pipeline.inspect import describe
    describe(args.url)
    return 0


def cmd_fetch(args):
    from pipeline.fetch import fetch, fetch_partitions
    from pipeline.recipes import get_recipe, require_buildable
    recipe = get_recipe(ROOT, args.layer)
    require_buildable(recipe)
    if recipe["access"] == "hybrid":
        from pipeline.hybrid import fetch_stream
        fetch_stream(recipe, ROOT, refresh=args.refresh)
    elif recipe.get("partition") and not args.partition:
        receipts = fetch_partitions(recipe, ROOT, refresh=args.refresh)
        print(f"{args.layer}: {sum(r['count'] for r in receipts.values())} records in {len(receipts)} partitions")
    else:
        fetch(recipe, ROOT, refresh=args.refresh, partition=args.partition)
    return 0


def cmd_build(args):
    from pipeline.build import run_build
    run_build(ROOT, args.layer, args.all, args.include_drafts, args.refresh, partition=args.partition, jobs=args.jobs)
    return 0


def cmd_catalog(args):
    from pipeline.catalog import write_catalog
    write_catalog(ROOT, args.include_drafts, for_release=args.for_release)
    from pipeline.studio import write_studio_catalog
    write_studio_catalog(ROOT, args.include_drafts, for_release=args.for_release)
    return 0


def cmd_check(args):
    from pipeline.check import run_checks
    return 0 if run_checks(ROOT, args.layer, catalog_only=args.catalog) else 1


EXPECTED_ERRORS = ("RecipeError", "FetchError", "MissingBoundaryError", "CatalogError", "PartitionError",
                   "ValueError")


def parser():
    p = argparse.ArgumentParser(prog="python -m pipeline", description="NJ-Atlas data build")
    commands = p.add_subparsers(dest="command", required=True)
    commands.add_parser("validate", help="Check every recipe in catalog/layers (offline)")
    inspect = commands.add_parser("inspect", help="Describe an ArcGIS layer before writing a recipe")
    inspect.add_argument("url")
    fetch = commands.add_parser("fetch", help="Download a layer's source records into build/raw")
    fetch.add_argument("layer")
    fetch.add_argument("--refresh", action="store_true", help="Download again even if cached")
    fetch.add_argument("--partition", help="Partitioned layers: fetch one municipality only (4-digit code)")
    build = commands.add_parser("build", help="Fetch, normalize and write a layer's files")
    build.add_argument("layer", nargs="?")
    build.add_argument("--all", action="store_true", help="Build every recipe in dependency order")
    build.add_argument("--refresh", action="store_true", help="Download again even if cached")
    build.add_argument("--include-drafts", action="store_true", help="Also build draft recipes")
    build.add_argument("--partition", help="Partitioned layers: build one municipality only (4-digit code)")
    build.add_argument("--jobs", type=int, default=1,
                       help="Partitioned layers: build this many municipalities at once (downloads stay sequential)")
    catalog = commands.add_parser("catalog", help="Write site/data/catalog.json and places.json")
    catalog.add_argument("--include-drafts", action="store_true")
    catalog.add_argument("--for-release", action="store_true",
                         help="Point R2-hosted layers at catalog/hosting.json (used by tools/release.py)")
    check = commands.add_parser("check", help="Run the G1 data checks on built layers")
    check.add_argument("layer", nargs="?")
    check.add_argument("--catalog", action="store_true", help="Check only the layers in site/data/catalog.json")
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    handler = {"validate": cmd_validate, "inspect": cmd_inspect, "fetch": cmd_fetch,
               "build": cmd_build, "catalog": cmd_catalog, "check": cmd_check}[args.command]
    try:
        return handler(args)
    except Exception as error:  # show expected problems as one clear line, not a traceback
        if type(error).__name__ in EXPECTED_ERRORS:
            print(f"ERROR: {error}", file=sys.stderr)
            return 1
        raise


if __name__ == "__main__":
    sys.exit(main())
