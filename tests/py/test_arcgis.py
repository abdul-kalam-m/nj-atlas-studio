import copy
import json

import pytest

from pipeline import ROOT
from pipeline import arcgis
from pipeline.arcgis import FetchError, RetryableError, batches, fetch_features, object_ids, with_retries

FIXTURES = ROOT / "tests" / "fixtures" / "arcgis"
URL = "https://example.test/arcgis/rest/services/Test/MapServer/0"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def feature(oid):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-74.5, 40.0 + oid / 100]},
            "properties": {"OBJECTID": oid, "NAME": f"Item {oid}", "ACRES": oid * 1.5}}


class FakeService:
    """Answers like an ArcGIS layer with object IDs 1-5 and maxRecordCount 2."""

    def __init__(self, drop_id=None):
        self.drop_id = drop_id
        self.posts = []

    def get_json(self, url, params):
        if url == URL:
            return load("layer_info.json")
        if params.get("returnIdsOnly") == "true":
            return load("object_ids.json")
        raise AssertionError(f"unexpected GET {url} {params}")

    def post_json(self, url, params):
        self.posts.append(params)
        ids = [int(x) for x in params["objectIds"].split(",")]
        return {"type": "FeatureCollection", "features": [feature(i) for i in ids if i != self.drop_id]}


def test_object_ids_are_sorted():
    assert object_ids(URL, "1=1", FakeService().get_json) == [1, 2, 3, 4, 5]


def test_batches():
    assert batches([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]


def test_fetch_pages_by_max_record_count():
    service = FakeService()
    collection = fetch_features(URL, "1=1", ["NAME"], service.get_json, service.post_json)
    assert [f["properties"]["OBJECTID"] for f in collection["features"]] == [1, 2, 3, 4, 5]
    assert [p["objectIds"] for p in service.posts] == ["1,2", "3,4", "5"]
    assert all(p["outSR"] == "4326" and p["f"] == "geojson" for p in service.posts)
    assert service.posts[0]["outFields"] == "NAME,OBJECTID"


def test_missing_id_in_a_page_fails():
    service = FakeService(drop_id=4)
    with pytest.raises(FetchError, match="incomplete"):
        fetch_features(URL, "1=1", ["NAME"], service.get_json, service.post_json)


def test_retry_after_503_then_success():
    calls = []

    def call():
        calls.append(1)
        if len(calls) == 1:
            raise RetryableError("HTTP 503")
        return {"ok": True}

    waits = []
    assert with_retries(call, sleep=waits.append) == {"ok": True}
    assert len(calls) == 2 and waits == [2]


def test_no_retry_after_400():
    calls = []

    def call():
        calls.append(1)
        raise FetchError("HTTP 400")

    with pytest.raises(FetchError, match="400"):
        with_retries(call, sleep=lambda s: None)
    assert len(calls) == 1


def test_gives_up_after_three_retries():
    calls = []

    def call():
        calls.append(1)
        raise RetryableError("timeout")

    waits = []
    with pytest.raises(FetchError, match="Gave up"):
        with_retries(call, sleep=waits.append)
    assert len(calls) == 4 and waits == [2, 4, 8]


def test_arcgis_error_body_is_classified(monkeypatch):
    class Response:
        def __init__(self, body):
            self.body = body
        def read(self):
            return self.body
        def __enter__(self):
            return self
        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(arcgis, "MIN_INTERVAL_SECONDS", 0)
    monkeypatch.setattr(arcgis, "urlopen", lambda request, timeout: Response(b'{"error": {"code": 400, "message": "bad where"}}'))
    with pytest.raises(FetchError, match="bad where"):
        arcgis._send(URL, None)
    monkeypatch.setattr(arcgis, "urlopen", lambda request, timeout: Response(b'{"error": {"code": 503, "message": "busy"}}'))
    with pytest.raises(RetryableError, match="busy"):
        arcgis._send(URL, None)


def test_esri_json_fallback_converts_pages():
    info = copy.deepcopy(load("layer_info.json"))
    info["supportedQueryFormats"] = "JSON"
    info["maxRecordCount"] = 10
    page = load("esri_page.json")

    def get_json(url, params):
        if url == URL:
            return info
        return {"objectIds": [2, 1]}

    def post_json(url, params):
        assert params["f"] == "json"
        return page

    collection = fetch_features(URL, "1=1", ["NAME"], get_json, post_json)
    assert [f["properties"]["NAME"] for f in collection["features"]] == ["Square", "Other"]
    assert collection["features"][0]["geometry"]["type"] == "Polygon"
