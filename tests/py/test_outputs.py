import json

import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq
import pyogrio
from shapely.geometry import box

from pipeline.outputs import csv_columns, plain_number, safe_text, tile_columns, write_outputs


def recipe():
    return {
        "id": "nj_test", "title": "Test places", "place_tags": "all", "label_field": "name",
        "tiles": {"min_zoom": 5, "max_zoom": 10}, "noun": {"singular": "place", "plural": "places"},
        "examples": [{"label": "Parks", "conditions": [{"field": "kind", "op": "in", "values": ["Park"]}]}],
        "fields": [
            {"source": "N", "name": "name", "label": "Name", "type": "text", "filter": "search", "popup": True},
            {"source": "K", "name": "kind", "label": "Kind", "type": "category", "filter": "checklist", "popup": True},
            {"source": "A", "name": "acres", "label": "Area", "type": "number", "filter": "range", "popup": True,
             "decimals": 1, "unit": "acres"},
            {"source": "X", "name": "note", "label": "Note", "type": "text", "filter": "none", "popup": False},
        ],
    }


def frame():
    return gpd.GeoDataFrame({
        "atlas_id": pd.Series(["1", "2"], dtype="string"),
        "name": pd.Series(["=SUM(1)", "Élan Park"], dtype="string"),
        "kind": pd.Series(["Park", None], dtype="string"),
        "acres": [12.5, 3.0],
        "note": pd.Series(["x", None], dtype="string"),
        "county": pd.Series(["Salem County", "Salem County"], dtype="string"),
        "county_fips": pd.Series(["033", "033"], dtype="string"),
        "municipality": pd.Series(["Pennsville Township", None], dtype="string"),
        "mun_code": pd.Series(["1709", None], dtype="string"),
        "tract": pd.Series(["Census Tract 201", None], dtype="string"),
        "tract_geoid": pd.Series(["34033020100", None], dtype="string"),
        "block_group": pd.Series(["Block Group 1", None], dtype="string"),
        "bg_geoid": pd.Series(["340330201001", None], dtype="string"),
        "lon": [-75.5, -75.4], "lat": [39.6, 39.7],
    }, geometry=[box(-75.51, 39.59, -75.49, 39.61), box(-75.41, 39.69, -75.39, 39.71)], crs="EPSG:4326")


def build(tmp_path):
    receipt = {"count": 2, "fetched_at": "2026-09-25T12:00:00Z"}
    return write_outputs(recipe(), frame(), tmp_path, receipt, {"repaired_shapes": 0, "dropped_empty_shapes": 0})


def test_files_and_meta(tmp_path):
    meta = build(tmp_path)
    folder = tmp_path / "site" / "data" / "nj_test"
    assert sorted(p.name for p in folder.iterdir()) == ["meta.json", "nj_test.csv", "nj_test.geojson",
                                                         "nj_test.parquet", "nj_test.pmtiles"]
    assert meta["rows"] == 2 and meta["files"]["parquet"]["path"] == "nj_test/nj_test.parquet"
    assert meta["values"]["kind"] == [{"value": "Park", "count": 1}, {"value": None, "count": 1}]
    assert meta["ranges"]["acres"] == {"min": 3.0, "max": 12.5}
    assert meta["place_tag_coverage"] == 1.0
    assert json.loads((folder / "meta.json").read_text(encoding="utf-8"))["id"] == "nj_test"


def test_pmtiles_layer_name_and_fields(tmp_path):
    build(tmp_path)
    path = tmp_path / "site" / "data" / "nj_test" / "nj_test.pmtiles"
    assert [layer[0] for layer in pyogrio.list_layers(path)] == ["nj_test"]
    fields = set(pyogrio.read_info(path, layer="nj_test")["fields"])
    assert {"atlas_id", "name", "kind", "acres", "county_fips", "mun_code", "tract_geoid", "bg_geoid"} <= fields
    assert "note" not in fields
    assert tile_columns(recipe())[0] == "atlas_id"


def test_parquet_has_no_int64(tmp_path):
    build(tmp_path)
    schema = pq.read_schema(tmp_path / "site" / "data" / "nj_test" / "nj_test.parquet")
    assert "int64" not in [str(t) for t in schema.types]
    assert schema.names == ["atlas_id", "name", "kind", "acres", "note", "county", "county_fips", "municipality",
                            "mun_code", "tract", "tract_geoid", "block_group", "bg_geoid", "lon", "lat", "geometry"]


def test_csv_headers_bom_and_formula_guard(tmp_path):
    build(tmp_path)
    raw = (tmp_path / "site" / "data" / "nj_test" / "nj_test.csv").read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf")
    lines = raw.decode("utf-8-sig").split("\r\n")
    assert lines[0] == ("Name,Kind,Area,Note,County,Municipality,Census tract,Census tract code,Block group,"
                        "Block group code,Longitude,Latitude,Atlas ID")
    assert lines[1].startswith("'=SUM(1),Park,12.5,x,Salem County,Pennsville Township,Census Tract 201,34033020100,"
                               "Block Group 1,340330201001,-75.5,39.6,1")
    assert lines[2].startswith("Élan Park,,3,,Salem County,,,,,,-75.4,39.7,2")


def test_selftest_cases_use_the_python_filter(tmp_path):
    meta = build(tmp_path)
    assert [(case["label"], case["expected"]) for case in meta["selftest"]] == [
        ("Parks", 1), ("All places", 2), ("Place check: Salem County", 2),
        ("Area check: Block Group 1, Census Tract 201", 1)]
    assert meta["selftest"][0]["state"]["place"] == {"county_fips": None, "mun_code": None, "tract_geoid": None,
                                                     "bg_geoid": None}
    assert meta["selftest"][3]["state"]["place"] == {"county_fips": "033", "mun_code": "1709",
                                                     "tract_geoid": "34033020100", "bg_geoid": "340330201001"}


def test_helpers():
    assert plain_number(610.6, 1) == "610.6" and plain_number(274534.0, 0) == "274534"
    assert plain_number(2.50, 2) == "2.5" and plain_number(None, 2) == ""
    assert safe_text("@home") == "'@home" and safe_text("-5 dollars") == "'-5 dollars" and safe_text(None) == ""
    assert [h for _, h in csv_columns(recipe())][-3:] == ["Longitude", "Latitude", "Atlas ID"]
