"""Lookup tables (D-085): the soil ratings joined to NJDEP's soils layer by MUKEY. No network."""
import json

from pipeline import ROOT
from pipeline.lookups import (SOILS_COLUMNS, build_soils, column_labels, dominant_septic, hydric_class, load_lookup,
                              main_limitation, soils_rows, water_table_band)
from pipeline.recipes import load_schema, lookup_errors, validate
from pipeline.studio import studio_entry


def test_septic_takes_the_rating_covering_most_of_the_map_unit():
    assert dominant_septic([(60, "Very limited"), (40, "Not limited")]) == "Very limited"
    assert dominant_septic([(30, "Very limited"), (35, "Somewhat limited"), (35, "Not limited")]) == "Somewhat limited"
    assert dominant_septic([(50, None), (50, "Not limited")]) == "Not limited"
    assert dominant_septic([(80, None), (20, "Not limited")]) == "Not rated"
    assert dominant_septic([]) == "Not rated"


def test_limitations_are_the_top_rated_reasons_in_name_order():
    assert main_limitation([("Slope", 0.4), ("Seepage, bottom layer", 1.0), ("Depth to saturated zone", 1.0)]) == \
        "Depth to saturated zone; Seepage, bottom layer"
    assert main_limitation([("Not rated, subaqueous", 1.0)]) is None
    assert main_limitation([]) is None


def test_water_table_bands_are_in_feet():
    assert water_table_band(0, True) == "Under 1 ft"
    assert water_table_band(30, True) == "Under 1 ft"
    assert water_table_band(31, True) == "1 to 2 ft"
    assert water_table_band(61, True) == "2 to 4 ft"
    assert water_table_band(122, True) == "4 to 6.5 ft"
    assert water_table_band(None, True) == "Deeper than 6.5 ft"
    assert water_table_band(None, False) == "Not rated"


def test_hydric_classes():
    assert [hydric_class(p) for p in (0, 5, 99, 100, None)] == ["Not hydric", "Partly hydric", "Partly hydric", "All hydric", None]


def test_rows_join_by_key_and_leave_unknown_keys_blank():
    components = [["1", "11", "85", "Series", "Very limited"], ["1", "12", "15", "Series", "Not limited"],
                  ["2", "21", "100", "Miscellaneous area", None]]
    aggregates = [["1", "Poorly drained", "B/D", "None", "85", "15"], ["2", None, None, None, "0", None]]
    reasons = [["11", "Depth to saturated zone", "1"], ["11", "Slope", "0.2"]]
    rows = soils_rows(["2", "1", "3"], components, aggregates, reasons)
    assert list(rows) == ["1", "2", "3"]
    assert rows["1"] == ["Very limited", "Depth to saturated zone", "Poorly drained", "Under 1 ft", "None", "Partly hydric", "B/D"]
    assert rows["2"][0] == "Not rated" and rows["2"][1] is None and rows["2"][3] == "Not rated"
    assert rows["3"] == [None] * len(SOILS_COLUMNS)


def test_build_reads_the_keys_from_njdep_and_the_ratings_from_nrcs():
    def get_json(url, params):
        assert params["returnDistinctValues"] == "true"
        return {"features": [{"attributes": {"MUKEY": "1"}}, {"attributes": {"MUKEY": "9"}}]}

    def query(sql):
        if "muaggatt" in sql:
            return [["1", "Well drained", "A", "None", "0", None]]
        if "ruledepth = 1" in sql:
            return [["11", "Seepage, bottom layer", "1"]]
        return [["1", "11", "90", "Series", "Very limited"]]
    table = build_soils(get_json, query)
    assert table["key"] == "MUKEY" and table["source"]["keys"] == 2 and table["source"]["matched"] == 1
    assert table["rows"]["1"][:2] == ["Very limited", "Seepage, bottom layer"]


def test_the_soils_recipe_joins_its_table():
    recipe = json.loads((ROOT / "catalog" / "layers" / "nj_soils.json").read_text(encoding="utf-8"))
    assert lookup_errors(ROOT, recipe) == []
    entry = studio_entry(recipe, None, {}, False, ROOT)
    septic = next(field for field in entry["fields"] if field["name"] == "septic")
    table = load_lookup(ROOT, "nj_soils_ssurgo")
    assert septic["lookup"] == "nj_soils_ssurgo" and septic["value_labels"] == column_labels(table, "septic")
    assert set(septic["value_labels"]) == set(table["rows"])
    assert "lookup" not in next(field for field in entry["fields"] if field["name"] == "name")


def test_lookup_rules():
    recipe = json.loads((ROOT / "catalog" / "layers" / "nj_soils.json").read_text(encoding="utf-8"))
    bad = json.loads(json.dumps(recipe))
    bad["fields"][2]["lookup"] = {"table": "nj_nothing_here", "column": "septic"}
    assert any("missing" in problem for problem in lookup_errors(ROOT, bad))
    bad["fields"][2]["lookup"] = {"table": "nj_soils_ssurgo", "column": "colour"}
    assert any("no column" in problem for problem in lookup_errors(ROOT, bad))
    bad = json.loads(json.dumps(recipe))
    bad["fields"][2]["value_labels"] = {"1": "x"}
    assert validate(bad, load_schema(ROOT), "nj_soils")
    bad = json.loads(json.dumps(recipe))
    del bad["fields"][2]["lookup"], bad["fields"][4]["lookup"]
    assert any("duplicate source field" in problem for problem in validate(bad, load_schema(ROOT), "nj_soils"))


def test_stormwater_listings_cover_every_subwatershed_in_plain_words():
    from pipeline.lookups import STORMWATER_COLUMNS, stormwater_rows
    rows = stormwater_rows(["A", "B", "C"], [
        ("A", "PHOSPHORUS, TOTAL", "Aquatic Life"), ("A", "ESCHERICHIA COLI (E. COLI)", "Recreation.Primary"),
        ("A", "PHOSPHORUS, TOTAL", "Aquatic Life, Aquatic Life Trout"), ("B", "SOMETHING NEW", " "), ("Z", "PH", "Shellfish"),
        ("C", " ", "Aquatic Life")])
    assert STORMWATER_COLUMNS == ["impairments", "uses", "listed", "listings"]
    assert rows["A"] == ["E. coli; Total phosphorus", "Aquatic life; Primary recreation; Trout aquatic life", "Listed", "2"]
    assert rows["B"] == ["SOMETHING NEW", None, "Listed", "1"]
    assert rows["C"] == [None, None, "Not listed", "0"]
    assert "Z" not in rows  # only the layer's own subwatersheds


def test_the_stormwater_table_joins_the_layer_by_huc14():
    recipe = json.loads((ROOT / "catalog" / "layers" / "nj_stormwater_impairments.json").read_text(encoding="utf-8"))
    assert lookup_errors(ROOT, recipe) == []
    table = load_lookup(ROOT, "nj_stormwater_303d")
    assert table["key"] == "HUC14" and table["source"]["keys"] >= 940
    entry = studio_entry(recipe, None, {}, False, ROOT)
    listed = next(f for f in entry["fields"] if f["name"] == "listed")
    assert set(listed["value_labels"].values()) == {"Listed", "Not listed"}
