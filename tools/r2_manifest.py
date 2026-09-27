"""List the files of R2-hosted layers for the owner to upload (M7-T5, docs/RELEASE.md). Uploads nothing.

    python tools/r2_manifest.py            # writes build/r2_manifest.csv and prints the totals and an upload command

Each row is: key (the path inside the bucket, equal to the path under site/data), bytes, content type.
The agent never holds R2 credentials; the owner uploads with their own tool, e.g. rclone.
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.recipes import load_recipes  # noqa: E402

DATA = ROOT / "site" / "data"
OUT = ROOT / "build" / "r2_manifest.csv"
CONTENT_TYPES = {".pmtiles": "application/octet-stream", ".parquet": "application/octet-stream",
                 ".csv": "text/csv; charset=utf-8", ".json": "application/json", ".geojson": "application/geo+json"}


class ManifestError(RuntimeError):
    pass


def manifest_rows(root: Path = ROOT) -> list[dict]:
    data = root / "site" / "data"
    rows = []
    for recipe in load_recipes(root):
        if (recipe.get("partition") or {}).get("host") != "r2":
            continue
        folder = data / recipe["id"]
        if not (folder / "meta.json").exists():
            raise ManifestError(f"{recipe['id']} is not built; run: python -m pipeline build {recipe['id']} --include-drafts")
        meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        partitions = json.loads((folder / "partitions.json").read_text(encoding="utf-8"))
        listed = [meta["partitions"]["path"]]
        listed += [entry["path"] for part in partitions.values() for entry in part["files"].values() if entry]
        for key in listed:
            path = data / key
            if not path.exists():
                raise ManifestError(f"{key} is listed in {recipe['id']}'s partitions but missing on disk")
            rows.append({"key": key, "bytes": path.stat().st_size,
                         "content_type": CONTENT_TYPES.get(path.suffix, "application/octet-stream")})
    return rows


def main() -> int:
    try:
        rows = manifest_rows()
    except ManifestError as error:
        print(f"R2 MANIFEST: FAIL. {error}")
        return 1
    if not rows:
        print("No layers are hosted on R2.")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["key", "bytes", "content_type"])
        writer.writeheader()
        writer.writerows(rows)
    layers = sorted({row["key"].split("/")[0] for row in rows})
    print(f"{len(rows)} files, {sum(row['bytes'] for row in rows) / 1e9:.2f} GB, layers: {', '.join(layers)}")
    print(f"Wrote {OUT.relative_to(ROOT)}. Upload each layer folder with your own credentials, for example:")
    for layer in layers:
        print(f"  rclone copy site/data/{layer} <your-r2-remote>:<bucket>/{layer} --exclude meta.json --exclude '*/meta.json'")
    return 0


if __name__ == "__main__":
    sys.exit(main())
