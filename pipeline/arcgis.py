"""Polite, verified reads from ArcGIS REST layers. See OPERATING_GUIDE.md §7.

Every network call goes through get_json / post_json so tests can pass fakes instead.
"""
import io
import json
import socket
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

USER_AGENT = "NJ-Atlas/0.1 (open-data atlas build)"
TIMEOUT_SECONDS = 60
RETRY_DELAYS = (2, 4, 8)
MIN_INTERVAL_SECONDS = 0.5
MAX_BATCH = 1000


class FetchError(RuntimeError):
    """The source could not be read completely and correctly."""


class RetryableError(Exception):
    """A temporary failure: HTTP 5xx, a timeout, or an ArcGIS 5xx error body."""


_last_request_at = [0.0]


def _throttle():
    wait = MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request_at[0])
    if wait > 0:
        time.sleep(wait)
    _last_request_at[0] = time.monotonic()


def with_retries(call, sleep=time.sleep):
    """Run call(); retry RetryableError after 2, 4 and 8 seconds. Other errors are raised at once."""
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            return call()
        except RetryableError as error:
            if attempt == len(RETRY_DELAYS):
                raise FetchError(f"Gave up after {attempt + 1} attempts: {error}") from error
            sleep(RETRY_DELAYS[attempt])


def _send(url: str, data: bytes | None) -> dict:
    _throttle()
    request = Request(url, data=data, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = response.read()
    except HTTPError as error:
        if 500 <= error.code < 600:
            raise RetryableError(f"HTTP {error.code} from {url}") from error
        raise FetchError(f"HTTP {error.code} from {url}") from error
    except (URLError, TimeoutError, socket.timeout) as error:
        raise RetryableError(f"{type(error).__name__} for {url}: {error}") from error
    payload = json.loads(body)
    if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
        code = payload["error"].get("code") or 0
        message = f"ArcGIS error {code} from {url}: {payload['error'].get('message')}"
        if 500 <= code < 600:
            raise RetryableError(message)
        raise FetchError(message)
    return payload


def http_get_json(url: str, params: dict) -> dict:
    full = url + ("?" + urlencode(params) if params else "")
    return with_retries(lambda: _send(full, None))


def http_post_json(url: str, params: dict) -> dict:
    body = urlencode(params).encode("utf-8")
    return with_retries(lambda: _send(url, body))


def layer_info(url: str, get_json=http_get_json) -> dict:
    return get_json(url, {"f": "json"})


def object_id_field(info: dict) -> str:
    if info.get("objectIdField"):
        return info["objectIdField"]
    for field in info.get("fields", []):
        if field.get("type") == "esriFieldTypeOID":
            return field["name"]
    raise FetchError("The layer does not report an object ID field")


def supports_geojson(info: dict) -> bool:
    return "geojson" in str(info.get("supportedQueryFormats", "")).lower()


def record_count(url: str, where: str, get_json=http_get_json) -> int:
    return int(get_json(url + "/query", {"where": where, "returnCountOnly": "true", "f": "json"})["count"])


def object_ids(url: str, where: str, get_json=http_get_json) -> list[int]:
    response = get_json(url + "/query", {"where": where, "returnIdsOnly": "true", "f": "json"})
    ids = response.get("objectIds") or []
    if len(ids) != len(set(ids)):
        raise FetchError("The layer returned duplicate object IDs")
    return sorted(ids)


def batches(ids: list[int], size: int) -> list[list[int]]:
    return [ids[start:start + size] for start in range(0, len(ids), size)]


def esri_page_to_features(page: dict) -> list[dict]:
    """Convert an Esri JSON page to GeoJSON features using GDAL's ESRIJSON reader."""
    import pyogrio
    frame = pyogrio.read_dataframe(io.BytesIO(json.dumps(page).encode("utf-8")))
    if frame.crs is not None and frame.crs.to_epsg() != 4326:
        frame = frame.to_crs(4326)
    return json.loads(frame.to_json(na="null", drop_id=True))["features"]


def fetch_features(url: str, where: str, out_fields: list[str], get_json=http_get_json,
                   post_json=http_post_json, info: dict | None = None, progress=None) -> dict:
    """Return every matching record as a GeoJSON FeatureCollection in EPSG:4326, verified page by page."""
    info = info or layer_info(url, get_json)
    oid_field = object_id_field(info)
    batch_size = min(int(info.get("maxRecordCount") or MAX_BATCH), MAX_BATCH)
    use_geojson = supports_geojson(info)
    ids = object_ids(url, where, get_json)
    fields = sorted(set(out_fields) | {oid_field})
    features = []
    pages = batches(ids, batch_size)
    for number, batch in enumerate(pages, start=1):
        params = {"where": where, "objectIds": ",".join(map(str, batch)), "outFields": ",".join(fields),
                  "returnGeometry": "true", "outSR": "4326", "f": "geojson" if use_geojson else "json"}
        page = post_json(url + "/query", params)
        page_features = page.get("features", []) if use_geojson else esri_page_to_features(page)
        returned = [feature.get("properties", {}).get(oid_field) for feature in page_features]
        if sorted(returned) != batch:
            missing = sorted(set(batch) - set(returned))[:5]
            extra = sorted(set(returned) - set(batch), key=str)[:5]
            raise FetchError(f"Page {number} of {len(pages)} is incomplete: missing {missing}, unexpected {extra}")
        features.extend(page_features)
        if progress:
            progress(number, len(pages))
    return {"type": "FeatureCollection", "features": features}
