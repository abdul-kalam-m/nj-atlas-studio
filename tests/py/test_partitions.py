"""Large layers split by municipality (M7, D-025 to D-028), built from cached downloads with no network.

Parked by D-031: the real parcels recipe is live, so these tests use the partitioned copy recipe kept in
tests/fixtures/parked/."""
import json

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import box

from pipeline import ROOT
from pipeline.build import build_layer
from pipeline.catalog import build_catalog
from pipeline.check import check_layer
from pipeline.fetch import raw_dir
from pipeline.normalize import normalize
from pipeline.partitions import PartitionError, file_base, partition_where
from pipeline.recipes import load_schema, validate
from tools import r2_manifest, release

PARKED_PARCELS = ROOT / "tests" / "fixtures" / "parked" / "nj_parcels.json"

PARCELS = {  # municipality -> parcels; the boxes sit inside census_atlas's towns and block groups
    "1709": [({"PROP_CLASS": "1", "CALC_ACRE": 12.0, "YR_CONSTR": 0, "DEED_DATE": "941008", "SALE_PRICE": 0},
              box(-75.36, 39.64, -75.34, 39.66)),
             ({"PROP_CLASS": "2", "CALC_ACRE": 0.2, "YR_CONSTR": 1950, "DEED_DATE": "200306", "SALE_PRICE": 250000},
              box(-75.45, 39.72, -75.44, 39.73))],
    "1713": [({"PROP_CLASS": "4A", "CALC_ACRE": 1.5, "YR_CONSTR": 1990, "DEED_DATE": "", "SALE_PRICE": 10},
              box(-75.26, 39.56, -75.24, 39.58))],
    "0502": [({"PROP_CLASS": "15C", "CALC_ACRE": 3.0, "YR_CONSTR": 0, "DEED_DATE": "991301", "SALE_PRICE": 0},
              box(-74.95, 38.95, -74.94, 38.96))],
}


def parcels_recipe(root, expected):
    recipe = json.loads(PARKED_PARCELS.read_text(encoding="utf-8"))
    recipe["source"]["expected_count"] = {"min": expected, "max": expected}
    recipe["status"] = "draft"
    (root / "catalog" / "layers" / "nj_parcels.json").write_text(json.dumps(recipe), encoding="utf-8")
    return recipe


def cache_download(root, code, parcels, start):
    """Save what a fetch of one municipality would have saved, so the build never touches the network."""
    rows = []
    for number, (values, _) in enumerate(parcels, start=start):
        rows.append({"OBJECTID": number, "PROP_LOC": f"{number} MAIN ST", "PCL_MUN": code, "PCLBLOCK": "1",
                     "PCLLOT": str(number), "PCLQCODE": None, "PAMS_PIN": f"{code}_1_{number}", "LAND_VAL": 1000,
                     "IMPRVT_VAL": 2000, "NET_VALUE": 3000, "DWELL": 1, **values})
    frame = gpd.GeoDataFrame(rows, geometry=[shape for _, shape in parcels], crs="EPSG:4326")
    folder = raw_dir(root, "nj_parcels", code)
    folder.mkdir(parents=True)
    (folder / "source.geojson").write_text(frame.to_json(), encoding="utf-8")
    (folder / "fetch.json").write_text(json.dumps({"count": len(rows), "fetched_at": "2026-09-26T08:00:00Z"}),
                                       encoding="utf-8")


@pytest.fixture
def parcels_atlas(census_atlas):
    recipe = parcels_recipe(census_atlas, 4)
    start = 1
    for code, parcels in PARCELS.items():
        cache_download(census_atlas, code, parcels, start)
        start += len(parcels)
    build_layer(census_atlas, recipe, echo=lambda *_: None)
    return census_atlas


def test_where_clause_and_file_names_accept_only_municipal_codes():
    recipe = json.loads(PARKED_PARCELS.read_text(encoding="utf-8"))
    assert partition_where(recipe, "1709") == "(1=1) AND PCL_MUN = '1709'"
    assert file_base(recipe, "1709") == "nj_parcels_1709"
    for bad in ("170", "1709' OR '1'='1", "17 9"):
        with pytest.raises(PartitionError):
            partition_where(recipe, bad)


def test_one_folder_per_municipality_without_geojson(parcels_atlas):
    folder = parcels_atlas / "site" / "data" / "nj_parcels"
    partitions = json.loads((folder / "partitions.json").read_text(encoding="utf-8"))
    assert sorted(partitions) == ["0502", "1709", "1713"]
    assert sorted(p.name for p in (folder / "1709").iterdir()) == [
        "meta.json", "nj_parcels_1709.csv", "nj_parcels_1709.parquet", "nj_parcels_1709.pmtiles"]
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    assert meta["rows"] == 4 and meta["partitioned"] and meta["files"] is None
    assert meta["partitions"] == {**meta["partitions"], "count": 3, "path": "nj_parcels/partitions.json"}
    classes = {item["value"]: item["count"] for item in meta["values"]["property_class"]}
    assert classes == {"Vacant land": 1, "Residential (up to 4 families)": 1, "Commercial": 1, "Public property": 1}
    assert meta["ranges"]["acres"] == {"min": 0.2, "max": 12.0}
    assert {case["partition"] for case in meta["selftest"]} == {"1709"}


def test_place_columns_come_from_the_tax_district(parcels_atlas):
    rows = pd.read_parquet(parcels_atlas / "site" / "data" / "nj_parcels" / "1709" / "nj_parcels_1709.parquet")
    assert rows["mun_code"].tolist() == ["1709", "1709"]
    assert rows["county"].tolist() == ["Salem County", "Salem County"]
    assert rows["bg_geoid"].tolist() == ["340330010001", "340330009001"]
    assert rows["sale_date"].tolist() == ["1994-10-08", "2020-03-06"]
    assert pd.isna(rows["year_built"].iloc[0]) and pd.isna(rows["sale_price"].iloc[0])  # zero means unknown


def test_check_runs_every_rule_on_every_partition(parcels_atlas):
    results = {name: passed for name, passed, _ in check_layer(parcels_atlas, "nj_parcels")}
    assert results["17 partitions cover every municipality and add up"] is True
    assert all(passed is not False for passed in results.values()), results


def test_check_reports_missing_municipalities(census_atlas):
    recipe = parcels_recipe(census_atlas, 2)
    cache_download(census_atlas, "1709", PARCELS["1709"], 1)
    build_layer(census_atlas, recipe, echo=lambda *_: None, partition="1709")
    results = {name: (passed, detail) for name, passed, detail in check_layer(census_atlas, "nj_parcels")}
    passed, detail = results["17 partitions cover every municipality and add up"]
    assert passed is False and "missing ['0502', '1713']" in detail


def test_catalog_serves_partitions_locally_and_from_r2_only_when_configured(parcels_atlas):
    catalog, _, _ = build_catalog(parcels_atlas, include_drafts=True)
    entry = next(layer for layer in catalog["layers"] if layer["id"] == "nj_parcels")
    assert entry["partition"]["path"] == "nj_parcels/partitions.json" and entry["base_url"] is None
    notes = []
    catalog, _, _ = build_catalog(parcels_atlas, include_drafts=True, for_release=True, notes=notes)
    assert "nj_parcels" not in [layer["id"] for layer in catalog["layers"]]
    assert "hosting.json has no r2_base_url" in notes[0]
    (parcels_atlas / "catalog" / "hosting.json").write_text('{"r2_base_url": "https://data.example.org/"}',
                                                            encoding="utf-8")
    catalog, _, _ = build_catalog(parcels_atlas, include_drafts=True, for_release=True)
    entry = next(layer for layer in catalog["layers"] if layer["id"] == "nj_parcels")
    assert entry["base_url"] == "https://data.example.org/"


def test_r2_manifest_lists_every_partition_file(parcels_atlas):
    rows = r2_manifest.manifest_rows(parcels_atlas)
    keys = [row["key"] for row in rows]
    assert keys[0] == "nj_parcels/partitions.json" and len(keys) == 1 + 3 * 3
    assert all(row["bytes"] > 0 for row in rows)
    (parcels_atlas / "site" / "data" / "nj_parcels" / "1713" / "nj_parcels_1713.csv").unlink()
    with pytest.raises(r2_manifest.ManifestError, match="nj_parcels_1713.csv"):
        r2_manifest.manifest_rows(parcels_atlas)


def test_release_clears_data_but_keeps_large_layers(tmp_path):
    for name in ("nj_parcels/1709/a.parquet", "nj_trails/b.parquet", "catalog.json"):
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_text("x", encoding="utf-8")
    release.clear_data(tmp_path, keep=["nj_parcels"])
    assert [p.name for p in tmp_path.iterdir()] == ["nj_parcels"]


def test_partition_rules_in_recipes():
    recipe = json.loads(PARKED_PARCELS.read_text(encoding="utf-8"))
    schema = load_schema(ROOT)
    assert validate(recipe, schema, "nj_parcels") == []
    wrong_field = {**recipe, "partition": {**recipe["partition"], "field": "PAMS_PIN"}}
    assert any("partition.field must be the source of district_code" in p for p in validate(wrong_field, schema, "nj_parcels"))
    point_tags = {**recipe, "place_tags": "all"}
    assert any("must use place_tags 'all_by_district'" in p for p in validate(point_tags, schema, "nj_parcels"))
    no_district = {**recipe, "partition": None, "fields": [f for f in recipe["fields"] if f["name"] != "district_code"]}
    no_district.pop("partition")
    assert any("needs a text field named district_code" in p for p in validate(no_district, schema, "nj_parcels"))


def test_zero_is_blank_and_yymmdd():
    recipe = {"id": "nj_test", "geometry": "polygon", "source": {"id_field": "ID"}, "fields": [
        {"source": "Y", "name": "year", "label": "Year", "type": "number", "filter": "range", "popup": True,
         "transform": "zero_is_blank"},
        {"source": "D", "name": "day", "label": "Day", "type": "date", "filter": "range", "popup": True,
         "transform": "yymmdd"}]}
    raw = gpd.GeoDataFrame({"ID": [1, 2, 3, 4], "Y": [0, 1935, None, 2024],
                            "D": ["941008", "290101", "300101", "000000"]},
                           geometry=[box(-74.5 + i, 40, -74.4 + i, 40.1) for i in range(4)], crs="EPSG:4326")
    frame = normalize(recipe, raw)
    assert frame["year"].isna().tolist() == [True, False, True, False]
    assert frame["day"].tolist()[:3] == ["1994-10-08", "2029-01-01", "1930-01-01"]
    assert pd.isna(frame["day"].iloc[3])


def test_parallel_build_matches_the_sequential_one(census_atlas):
    recipe = parcels_recipe(census_atlas, 4)
    start = 1
    for code, parcels in PARCELS.items():
        cache_download(census_atlas, code, parcels, start)
        start += len(parcels)
    meta = build_layer(census_atlas, recipe, echo=lambda *_: None, jobs=2)
    assert meta["rows"] == 4 and meta["partitions"]["count"] == 3
    results = {name: passed for name, passed, _ in check_layer(census_atlas, "nj_parcels")}
    assert all(passed is not False for passed in results.values()), results

