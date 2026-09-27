"""List the hybrid layers' map copies for the owner to upload (IMPLEMENTATION_GUIDE.md S2-T2, D-037).

    python tools/publish_tiles.py

Writes build/tiles_manifest.csv (file, bucket key, bytes) and prints the upload commands. The agent never holds
storage credentials: the owner runs the commands, or the manual `tiles` workflow does with repository secrets.
After the upload, put the bucket's public address in catalog/hosting.json as tiles_base_url and release.
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.recipes import load_recipes  # noqa: E402


def manifest(root: Path = ROOT) -> list[tuple[Path, str, int]]:
    rows = []
    for recipe in load_recipes(root):
        if recipe["access"] != "hybrid":
            continue
        path = root / "site" / "data" / recipe["id"] / f"{recipe['id']}.pmtiles"
        meta = root / "site" / "data" / recipe["id"] / "meta.json"
        if not path.exists() or not meta.exists():
            raise SystemExit(f"{recipe['id']} is not built: python -m pipeline build {recipe['id']}")
        if json.loads(meta.read_text(encoding="utf-8"))["files"]["pmtiles"]["bytes"] != path.stat().st_size:
            raise SystemExit(f"{recipe['id']}: the map copy changed after its build; run the check first")
        rows.append((path, f"{recipe['id']}/{recipe['id']}.pmtiles", path.stat().st_size))
    return rows


def main() -> int:
    rows = manifest()
    out = ROOT / "build" / "tiles_manifest.csv"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["file", "key", "bytes"])
        for path, key, size in rows:
            writer.writerow([path.relative_to(ROOT).as_posix(), key, size])
    total = sum(size for *_, size in rows)
    print(f"{len(rows)} map copies, {total / 1e6:.0f} MB, listed in {out.relative_to(ROOT)}")
    print("Upload each file to its key, for example with Wrangler (Cloudflare R2):")
    for path, key, _ in rows:
        print(f"  npx wrangler r2 object put <bucket>/{key} --file \"{path.relative_to(ROOT).as_posix()}\" --remote")
    print("Then set tiles_base_url in catalog/hosting.json to the bucket's public address and release.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
