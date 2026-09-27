import json

import pytest

from pipeline import ROOT
from pipeline.filters import clean_state, matching_ids

FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "filter_cases.json").read_text(encoding="utf-8"))


def test_fixture_is_big_enough():
    assert len(FIXTURE["cases"]) >= 20
    assert sum(1 for case in FIXTURE["cases"] if "map_filter" in case) >= 8
    assert len({case["name"] for case in FIXTURE["cases"]}) == len(FIXTURE["cases"])


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=[case["name"] for case in FIXTURE["cases"]])
def test_shared_case(case):
    assert matching_ids(case["state"], FIXTURE["rows"], FIXTURE["fields"]) == case["expected_ids"]


def test_clean_state_trims_and_converts():
    clean = clean_state({"layer": "x", "place": {"county_fips": "", "mun_code": None},
                         "conditions": [{"field": "name", "op": "contains", "value": "  Penn "},
                                        {"field": "size", "op": "range", "min": "25", "max": ""}]},
                        FIXTURE["fields"])
    assert clean["place"] == {"county_fips": None, "mun_code": None, "tract_geoid": None, "bg_geoid": None}
    assert clean["conditions"] == [{"field": "name", "op": "contains", "value": "Penn"},
                                   {"field": "size", "op": "range", "min": 25.0, "max": None}]
