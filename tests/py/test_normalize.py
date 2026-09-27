import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Polygon, box

from pipeline.normalize import as_text, normalize, titlecase


def field(source, name, kind, **extra):
    filters = {"text": "search", "category": "checklist", "number": "range", "date": "range"}
    return {"source": source, "name": name, "label": name, "type": kind, "filter": filters[kind], "popup": True, **extra}


def recipe(fields, geometry="polygon"):
    return {"id": "nj_test", "geometry": geometry, "source": {"id_field": "ID"}, "fields": fields}


def raw(rows, geometries=None):
    geometries = geometries or [box(-74.5 + i, 40.0, -74.4 + i, 40.1) for i in range(len(rows))]
    return gpd.GeoDataFrame(rows, geometry=geometries, crs="EPSG:4326")


def test_transforms():
    frame = normalize(recipe([field("A", "a", "text", transform="zfill3"),
                              field("B", "b", "text", transform="last3"),
                              field("C", "c", "category", transform="titlecase"),
                              field("D", "d", "category", transform="zfill4"),
                              field("E", "e", "category", transform="upper")]),
                      raw([{"ID": 1, "A": "1", "B": "34033", "C": "CAPE MAY", "D": 503, "E": "coastal"}]))
    row = frame.iloc[0]
    assert (row.a, row.b, row.c, row.d, row.e) == ("001", "033", "Cape May", "0503", "COASTAL")


def test_value_labels_replace_codes_and_can_blank():
    labels = {"Y": "Yes", "N": "No", "U": "Unknown", "<Null>": None}
    frame = normalize(recipe([field("H", "hiking", "category", value_labels=labels)]),
                      raw([{"ID": 1, "H": "Y"}, {"ID": 2, "H": "N"}, {"ID": 3, "H": "U"}, {"ID": 4, "H": "<Null>"},
                           {"ID": 5, "H": "Yes"}, {"ID": 6, "H": " "}]))
    values = frame["hiking"].tolist()
    assert values[:3] == ["Yes", "No", "Unknown"] and values[4] == "Yes"
    assert pd.isna(values[3]) and pd.isna(values[5])


def test_value_labels_are_rejected_on_number_fields():
    import json
    from pipeline import ROOT
    from pipeline.recipes import load_schema, validate
    counties = json.loads((ROOT / "catalog" / "layers" / "nj_counties.json").read_text(encoding="utf-8"))
    counties["fields"][3]["value_labels"] = {"1": "One"}
    assert validate(counties, load_schema(ROOT), "nj_counties")


def test_titlecase_edge_cases():
    assert titlecase("DON'T STOP") == "Don't Stop"
    assert titlecase("WILKES-BARRE") == "Wilkes-Barre"


def test_dates_from_epoch_ms_in_utc():
    frame = normalize(recipe([field("T", "when", "date")]),
                      raw([{"ID": 1, "T": 1577836800000}, {"ID": 2, "T": None}]))
    assert frame["when"].tolist()[0] == "2020-01-01"
    assert pd.isna(frame["when"].tolist()[1])


def test_numbers_are_float64_with_full_precision():
    frame = normalize(recipe([field("N", "n", "number", decimals=1)]), raw([{"ID": 1, "N": 7}, {"ID": 2, "N": 49.95093229}]))
    assert str(frame["n"].dtype) == "float64"
    assert frame["n"].tolist() == [7.0, 49.95093229]  # not 50.0: rounding would move filter boundaries
    assert not any(str(t).startswith("int") for t in frame.dtypes)


def test_empty_string_becomes_null_and_ids_are_strings():
    frame = normalize(recipe([field("S", "s", "text")]), raw([{"ID": 10.0, "S": "  "}, {"ID": 11, "S": " x "}]))
    assert pd.isna(frame["s"].iloc[0]) and frame["s"].iloc[1] == "x"
    assert frame["atlas_id"].tolist() == ["10", "11"]


def test_duplicate_id_raises():
    with pytest.raises(ValueError, match="not unique"):
        normalize(recipe([field("S", "s", "text")]), raw([{"ID": 1, "S": "a"}, {"ID": 1, "S": "b"}]))


def test_invalid_shapes_are_repaired_and_empty_dropped():
    bowtie = Polygon([(-74.5, 40.0), (-74.4, 40.1), (-74.4, 40.0), (-74.5, 40.1), (-74.5, 40.0)])
    frame = normalize(recipe([field("S", "s", "text")]),
                      raw([{"ID": 1, "S": "a"}, {"ID": 2, "S": "b"}, {"ID": 3, "S": "c"}],
                          [bowtie, Polygon(), box(-74.3, 40.0, -74.2, 40.1)]))
    assert frame.attrs == {"repaired_shapes": 1, "dropped_empty_shapes": 1}
    assert frame["atlas_id"].tolist() == ["1", "3"]
    assert frame.geometry.is_valid.all()


def test_column_order_and_representative_point():
    frame = normalize(recipe([field("S", "s", "text")]), raw([{"ID": 1, "S": "a"}]))
    assert list(frame.columns) == ["atlas_id", "s", "lon", "lat", "geometry"]
    assert frame.geometry.iloc[0].contains(gpd.points_from_xy(frame.lon, frame.lat)[0])


def test_as_text():
    assert as_text(None) is None and as_text(float("nan")) is None
    assert as_text(3.0) == "3" and as_text(3.5) == "3.5" and as_text(" a ") == "a"
