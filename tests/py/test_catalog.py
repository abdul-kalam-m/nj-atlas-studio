import json

import geopandas as gpd
import pytest

from pipeline.catalog import CatalogError, build_catalog, natural_key, write_catalog
from pipeline.check import run_checks
from pipeline.filters import count


def test_catalog_with_drafts(mini_atlas):
    catalog, _, _ = build_catalog(mini_atlas, include_drafts=True)
    assert catalog["version"] == 1 and catalog["data_base_url"] == "data/"
    assert catalog["categories"] == ["boundaries"]
    assert [layer["id"] for layer in catalog["layers"]] == ["nj_counties", "nj_municipalities"]
    counties = catalog["layers"][0]
    assert counties["status"] == "draft" and counties["rows"] == 2
    assert counties["files"]["pmtiles"]["path"] == "nj_counties/nj_counties.pmtiles"
    assert "where" not in counties["source"] and "transform" not in json.dumps(counties["fields"])
    assert counties["table_columns"][0] == "atlas_id" and counties["csv_columns"][-1] == ["atlas_id", "Atlas ID"]


def test_places_list_the_built_levels_with_sorted_areas(mini_atlas):
    _, places, units = build_catalog(mini_atlas, include_drafts=True)
    assert places["version"] == 2
    assert [level["id"] for level in places["levels"]] == ["county", "municipality"]  # others are not built here
    county, municipality = places["levels"]
    assert county == {"id": "county", "layer": "nj_counties", "tiles": "nj_counties/nj_counties.pmtiles",
                      "code": "county_fips", "name": "county", "parent": None, "units": "places/county.json",
                      "count": 2}
    assert municipality["parent"] == "county" and municipality["code"] == "mun_code"
    assert [c["name"] for c in units["county"]] == ["Cape May County", "Salem County"]
    assert units["county"][1]["code"] == "033" and "county" not in units["county"][1]
    assert [(m["name"], m["county"]) for m in units["municipality"]] == [
        ("Cape May City", "009"), ("Pennsville Township", "033"), ("Salem City", "033")]
    assert len(units["county"][0]["bounds"]) == 4


def test_census_levels_list_their_parents(census_atlas):
    _, places, units = build_catalog(census_atlas, include_drafts=True)
    assert [level["id"] for level in places["levels"]] == ["county", "municipality", "tract", "block_group"]
    assert places["levels"][3]["parent"] == "tract"
    tracts = {unit["name"]: unit for unit in units["tract"]}
    assert [unit["name"] for unit in units["tract"]] == ["Census Tract 2.01", "Census Tract 9", "Census Tract 10",
                                                         "Census Tract 11"]
    assert tracts["Census Tract 10"]["muns"] == ["1709", "1713"] and tracts["Census Tract 10"]["county"] == "033"
    assert tracts["Census Tract 11"]["muns"] == []  # a sliver of Salem City only (D-021)
    group = next(unit for unit in units["block_group"] if unit["code"] == "340330010002")
    assert group == {**group, "name": "Block Group 2", "county": "033", "tract": "34033001000", "muns": ["1713"]}


def test_census_atlas_passes_the_checks_and_slices_by_every_level(census_atlas):
    assert run_checks(census_atlas, echo=lambda *_: None) is True
    points = gpd.read_parquet(census_atlas / "site" / "data" / "nj_test_points" / "nj_test_points.parquet")
    rows = points.drop(columns="geometry").to_dict("records")
    assert points["bg_geoid"].tolist() == ["340330010001", "340330010002", "340090002011"]
    assert count({"place": {"tract_geoid": "34033001000"}}, rows) == 2
    assert count({"place": {"mun_code": "1709", "tract_geoid": "34033001000"}}, rows) == 1
    tracts = gpd.read_parquet(census_atlas / "site" / "data" / "nj_census_tracts" / "nj_census_tracts.parquet")
    tract_rows = tracts.drop(columns="geometry").to_dict("records")
    assert count({"place": {"county_fips": "033", "mun_code": "1713"}}, tract_rows) == 1  # tract 10 lists 1713
    assert tracts["land_sq_mi"].tolist() == [1.0] * 4  # square meters became square miles (D-022)


def test_natural_sort():
    names = ["Census Tract 10", "Census Tract 9", "Census Tract 2.01", "census tract 2"]
    assert sorted(names, key=natural_key) == ["census tract 2", "Census Tract 2.01", "Census Tract 9",
                                              "Census Tract 10"]


def test_drafts_are_left_out_by_default(mini_atlas):
    with pytest.raises(CatalogError, match="The place pickers need nj_counties and nj_municipalities"):
        build_catalog(mini_atlas, include_drafts=False)


def test_unbuilt_layer_is_reported(mini_atlas):
    (mini_atlas / "site" / "data" / "nj_counties" / "meta.json").unlink()
    with pytest.raises(CatalogError, match="no build output"):
        build_catalog(mini_atlas, include_drafts=True)


def test_files_are_written(mini_atlas):
    stale = mini_atlas / "site" / "data" / "places" / "tract.json"
    stale.parent.mkdir(parents=True)
    stale.write_text("[]", encoding="utf-8")
    write_catalog(mini_atlas, include_drafts=True, echo=lambda *_: None)
    folder = mini_atlas / "site" / "data"
    assert json.loads((folder / "catalog.json").read_text(encoding="utf-8"))["layers"]
    assert len(json.loads((folder / "places" / "municipality.json").read_text(encoding="utf-8"))) == 3
    assert json.loads((folder / "places.json").read_text(encoding="utf-8"))["levels"][0]["id"] == "county"
    assert not stale.exists()
