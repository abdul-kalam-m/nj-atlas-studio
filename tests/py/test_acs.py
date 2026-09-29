"""ACS tables for the Demographics layers (D-086). No network."""
import json

import geopandas as gpd
import pytest
from shapely.geometry import box

from pipeline import ROOT
from pipeline.acs import (coded_median, columns_for, compute, estimate, level_rows, load_config, margin, proportion,
                          reliability, sum_cells, tables_of)
from pipeline.catalog import atlas_color
from pipeline.lookups import field_lookups
from pipeline.normalize import normalize
from pipeline.recipes import load_schema, validate

CONFIG = load_config(ROOT)
LIMITS = CONFIG["reliability"]


def test_special_codes_become_blank_and_controlled_margins_zero():
    assert estimate("-666666666") is None and estimate("") is None and estimate("12") == 12
    assert margin("-555555555") == 0 and margin("-222222222") is None and margin("-333333333") is None


def test_sums_and_proportions_carry_margins():
    row = {"X_E001": "30", "X_M001": "3", "X_E002": "40", "X_M002": "4", "T_E001": "100", "T_M001": "0"}
    total, moe = sum_cells(row, ["X_E001", "X_E002"])
    assert total == 70 and moe == 5
    percent, pmoe = proportion(70, 5, 100, 0)
    assert percent == 70 and pmoe == pytest.approx(5)
    assert proportion(5, 1, 0, 1) == (None, None)
    assert proportion(10, 1, 10, 20)[1] > 0  # a negative radicand falls back to the ratio formula


def test_coded_medians_become_their_limit_without_a_margin():
    income = next(v for v in CONFIG["variables"] if v["name"] == "median_hh_income")
    assert coded_median(250001, income) == 250000
    assert coded_median(2499, income) == 2500
    assert compute({"B19013_E001": "250001", "B19013_M001": "-333333333"}, income, None) == (250000, None)
    assert compute({"B19013_E001": "-666666666", "B19013_M001": "-222222222"}, income, None) == (None, None)


def test_reliability_classes_by_coefficient_of_variation():
    assert reliability(100, 1.645 * 11.9, LIMITS) == "High"
    assert reliability(100, 1.645 * 20, LIMITS) == "Medium"
    assert reliability(100, 1.645 * 41, LIMITS) == "Low"
    assert reliability(None, 3, LIMITS) is None and reliability(5, None, LIMITS) is None


def test_density_uses_land_area():
    density = next(v for v in CONFIG["variables"] if v["name"] == "density")
    assert compute({"B01003_E001": "5000", "B01003_M001": "-555555555"}, density, 2.0) == (2500, 0)
    assert compute({"B01003_E001": "5000"}, density, 0) == (None, None)


def test_disability_is_tract_only_and_columns_follow_the_config():
    assert "disability_pct" in columns_for(CONFIG, "tract")
    assert "disability_pct" not in columns_for(CONFIG, "block_group")
    assert "B18101" in tables_of(CONFIG) and "C17002" in tables_of(CONFIG)
    rows = level_rows(CONFIG, "block_group", {"340330210001": {}}, {})
    assert len(rows["340330210001"]) == len(columns_for(CONFIG, "block_group"))


def test_the_committed_tables_cover_the_state():
    for level, count in (("tract", 2181), ("block_group", 6599)):
        table = json.loads((ROOT / "catalog" / "lookups" / f"acs_2024_{level}.json").read_text(encoding="utf-8"))
        assert len(table["rows"]) == count and table["columns"] == columns_for(CONFIG, level)
        population = sum(row[0] or 0 for row in table["rows"].values())
        assert population == 9343809  # the summary file's own New Jersey total (0400000US34)


def test_copy_layers_join_numbers_at_build_time():
    recipe = json.loads((ROOT / "catalog" / "layers" / "nj_acs_tracts.json").read_text(encoding="utf-8"))
    assert validate(recipe, load_schema(ROOT), "nj_acs_tracts") == []
    lookups = field_lookups(ROOT, recipe)
    raw = gpd.GeoDataFrame({"GEOID": ["34033021000"], "NAME": ["Census Tract 210"]}, geometry=[box(-75.5, 39.6, -75.4, 39.7)],
                           crs="EPSG:4326")
    frame = normalize(recipe, raw, lookups)
    assert frame.loc[0, "population"] == 1176 and frame.loc[0, "median_hh_income_reliability"] == "High"
    raw.loc[0, "GEOID"] = "34999999999"
    with pytest.raises(ValueError, match="lacks 1 key"):
        normalize(recipe, raw, lookups)


def test_demographics_rules():
    recipe = json.loads((ROOT / "catalog" / "layers" / "nj_acs_block_groups.json").read_text(encoding="utf-8"))
    assert recipe["place_tags"] == "county_overlap_tract"  # the block group level's own tags (TWINS)
    assert atlas_color(recipe) == recipe["styles"]["outline"]["color"]
    bad = json.loads(json.dumps(recipe))
    bad["place_tags"] = "all"
    assert any("place_tags" in problem for problem in validate(bad, load_schema(ROOT), "nj_acs_block_groups"))
    bad = json.loads(json.dumps(recipe))
    bad["buffer_role"] = "both"
    assert any("cannot be buffered" in problem for problem in validate(bad, load_schema(ROOT), "nj_acs_block_groups"))
    bad = json.loads(json.dumps(recipe))
    del bad["styles"]["outline"]
    assert any("'single' style" in problem for problem in validate(bad, load_schema(ROOT), "nj_acs_block_groups"))
