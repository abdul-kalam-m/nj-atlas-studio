"""Download a layer's source records into build/raw/<id>/ (or build/raw/<id>/<code>/ per partition) with a receipt."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from pipeline.arcgis import (FetchError, fetch_features, http_get_json, http_post_json, layer_info,
                             object_ids, supports_geojson)
from pipeline.partitions import partition_codes, partition_where


def raw_dir(root: Path, layer_id: str, partition: str | None = None) -> Path:
    base = root / "build" / "raw" / layer_id
    return base / partition if partition else base


def fetch(recipe: dict, root: Path, refresh: bool = False, get_json=http_get_json, post_json=http_post_json,
          echo=print, partition: str | None = None, info: dict | None = None) -> dict:
    """Return the fetch receipt, downloading only when there is no cached copy or refresh is set.

    With `partition` (a municipal code), fetch only that municipality of a partitioned layer; the layer's
    expected_count is then checked over all partitions by fetch_partitions, not here.
    """
    label = f"{recipe['id']}/{partition}" if partition else recipe["id"]
    folder = raw_dir(root, recipe["id"], partition)
    source_path, receipt_path = folder / "source.geojson", folder / "fetch.json"
    if source_path.exists() and receipt_path.exists() and not refresh:
        echo(f"{label}: using cached download from {receipt_path.relative_to(root)}")
        return json.loads(receipt_path.read_text(encoding="utf-8"))

    source = recipe["source"]
    url = source["url"]
    where = partition_where(recipe, partition) if partition else source["where"]
    info = info or layer_info(url, get_json)
    available = {field["name"] for field in info.get("fields", [])}
    wanted = [field["source"] for field in recipe["fields"]] + [source["id_field"]]
    missing = sorted(set(wanted) - available)
    if missing:
        raise FetchError(f"{recipe['id']}: the source has no field(s) {', '.join(missing)}. Stop and ask the human.")

    low, high = source["expected_count"]["min"], source["expected_count"]["max"]
    ids = object_ids(url, where, get_json)
    if partition is None and not low <= len(ids) <= high:
        raise FetchError(f"{recipe['id']}: the source reports {len(ids)} records, outside expected_count "
                         f"{low}-{high}. Stop and ask the human.")

    echo(f"{label}: downloading {len(ids)} records")
    collection = fetch_features(url, where, wanted, get_json, post_json, info=info,
                                progress=lambda n, total: echo(f"  page {n}/{total}") if total > 1 else None)
    count = len(collection["features"])
    if count != len(ids):
        raise FetchError(f"{label}: received {count} records but the source listed {len(ids)}")

    folder.mkdir(parents=True, exist_ok=True)
    data = json.dumps(collection, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    source_path.write_bytes(data)
    receipt = {
        "id": recipe["id"],
        "url": url,
        "where": where,
        "partition": partition,
        "count": count,
        "max_record_count": info.get("maxRecordCount"),
        "format": "geojson" if supports_geojson(info) else "esrijson",
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    echo(f"{label}: saved {count} records to {source_path.relative_to(root)}")
    return receipt


def fetch_partitions(recipe: dict, root: Path, refresh: bool = False, get_json=http_get_json,
                     post_json=http_post_json, echo=print) -> dict[str, dict]:
    """Fetch every municipality of a partitioned layer (cached ones are reused); returns receipts by code.

    Stops if the total record count falls outside the recipe's expected_count.
    """
    info = layer_info(recipe["source"]["url"], get_json)
    codes = partition_codes(root)
    receipts = {}
    for number, code in enumerate(codes, start=1):
        echo(f"[{number}/{len(codes)}] {code}")
        receipts[code] = fetch(recipe, root, refresh=refresh, get_json=get_json, post_json=post_json,
                               echo=echo, partition=code, info=info)
    total = sum(receipt["count"] for receipt in receipts.values())
    low, high = recipe["source"]["expected_count"]["min"], recipe["source"]["expected_count"]["max"]
    if not low <= total <= high:
        raise FetchError(f"{recipe['id']}: the partitions hold {total} records, outside expected_count "
                         f"{low}-{high}. Stop and ask the human.")
    return receipts
