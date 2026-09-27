import json

import pytest

from pipeline.arcgis import FetchError
from pipeline.fetch import fetch

URL = "https://example.test/arcgis/rest/services/Test/MapServer/0"
INFO = {"objectIdField": "OBJECTID", "maxRecordCount": 1000, "supportedQueryFormats": "JSON, geoJSON",
        "fields": [{"name": "OBJECTID", "type": "esriFieldTypeOID"}, {"name": "NAME", "type": "esriFieldTypeString"},
                   {"name": "CODE", "type": "esriFieldTypeString"}]}


def recipe(expected=(1, 10), fields=("NAME",)):
    return {"id": "nj_test", "source": {"url": URL, "where": "1=1", "id_field": "CODE",
                                        "expected_count": {"min": expected[0], "max": expected[1]}},
            "fields": [{"source": name} for name in fields]}


class Service:
    def __init__(self, ids=(1, 2, 3)):
        self.ids = list(ids)
        self.calls = 0

    def get_json(self, url, params):
        self.calls += 1
        if url == URL:
            return INFO
        return {"objectIds": self.ids}

    def post_json(self, url, params):
        self.calls += 1
        wanted = [int(i) for i in params["objectIds"].split(",")]
        return {"features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [-74.5, 40.1]},
                              "properties": {"OBJECTID": i, "NAME": f"n{i}", "CODE": f"c{i}"}} for i in wanted]}


def test_fetch_writes_source_and_receipt(tmp_path):
    service = Service()
    receipt = fetch(recipe(), tmp_path, get_json=service.get_json, post_json=service.post_json, echo=lambda *_: None)
    folder = tmp_path / "build" / "raw" / "nj_test"
    data = json.loads((folder / "source.geojson").read_text(encoding="utf-8"))
    assert len(data["features"]) == 3 and receipt["count"] == 3
    saved = json.loads((folder / "fetch.json").read_text(encoding="utf-8"))
    assert saved["url"] == URL and saved["format"] == "geojson" and len(saved["sha256"]) == 64
    assert saved["fetched_at"].endswith("Z")


def test_cache_is_reused_unless_refresh(tmp_path):
    service = Service()
    fetch(recipe(), tmp_path, get_json=service.get_json, post_json=service.post_json, echo=lambda *_: None)
    calls = service.calls
    lines = []
    fetch(recipe(), tmp_path, get_json=service.get_json, post_json=service.post_json, echo=lines.append)
    assert service.calls == calls and "using cached download" in lines[0]
    fetch(recipe(), tmp_path, refresh=True, get_json=service.get_json, post_json=service.post_json, echo=lambda *_: None)
    assert service.calls > calls


def test_count_outside_expected_range_stops(tmp_path):
    service = Service(ids=range(1, 21))
    with pytest.raises(FetchError, match="outside expected_count"):
        fetch(recipe(expected=(1, 10)), tmp_path, get_json=service.get_json, post_json=service.post_json,
              echo=lambda *_: None)
    assert not (tmp_path / "build").exists()


def test_missing_source_field_stops(tmp_path):
    service = Service()
    with pytest.raises(FetchError, match="no field"):
        fetch(recipe(fields=("NAME", "NOT_THERE")), tmp_path, get_json=service.get_json,
              post_json=service.post_json, echo=lambda *_: None)
