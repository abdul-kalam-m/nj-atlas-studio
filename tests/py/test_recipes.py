import json
from pathlib import Path

import pytest

from pipeline import ROOT
from pipeline.recipes import RecipeError, load_schema, require_buildable, validate, validate_all

FIXTURES = ROOT / "tests" / "fixtures" / "recipes"
EXPECTED_PROBLEM = {
    "bad_id_mismatch": "must equal the file name",
    "bad_duplicate_name": "duplicate output name",
    "bad_label_field": "label_field",
    "bad_reserved_name": "reserved",
    "bad_example_op": "needs a checklist field",
    "bad_published_unreviewed": "license",
}


def test_reference_recipes_are_valid():
    results = validate_all(ROOT)
    assert "nj_counties" in results
    assert all(problems == [] for problems in results.values()), results


@pytest.mark.parametrize("name", sorted(EXPECTED_PROBLEM))
def test_bad_fixture_is_rejected(name):
    recipe = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    problems = validate(recipe, load_schema(ROOT), "nj_counties")
    assert problems, f"{name} should be rejected"
    assert any(EXPECTED_PROBLEM[name] in problem for problem in problems), problems


def test_every_fixture_has_an_expectation():
    names = {path.stem for path in FIXTURES.glob("*.json")}
    assert names == set(EXPECTED_PROBLEM)


def test_place_tags_follow_the_levels():
    counties = json.loads((ROOT / "catalog" / "layers" / "nj_counties.json").read_text(encoding="utf-8"))
    counties["place_tags"] = "all"
    assert any("place_tags must be 'none'" in p for p in validate(counties, load_schema(ROOT), "nj_counties"))
    trails = json.loads((ROOT / "catalog" / "layers" / "nj_trails.json").read_text(encoding="utf-8"))
    trails["place_tags"] = "county"
    assert any("place_tags must be 'all'" in p for p in validate(trails, load_schema(ROOT), "nj_trails"))


def test_boundary_layers_define_their_own_name_and_code():
    tracts = json.loads((ROOT / "catalog" / "layers" / "nj_census_tracts.json").read_text(encoding="utf-8"))
    tracts["fields"] = [f for f in tracts["fields"] if f["name"] != "tract_geoid"]
    problems = validate(tracts, load_schema(ROOT), "nj_census_tracts")
    assert any("must define its own field(s) tract_geoid" in p for p in problems), problems


def test_square_meters_transform_is_for_numbers_only():
    tracts = json.loads((ROOT / "catalog" / "layers" / "nj_census_tracts.json").read_text(encoding="utf-8"))
    tracts["fields"][0]["transform"] = "sq_m_to_sq_mi"
    assert validate(tracts, load_schema(ROOT), "nj_census_tracts")


def test_range_bounds_must_match_field_type():
    recipe = json.loads((ROOT / "catalog" / "layers" / "nj_counties.json").read_text(encoding="utf-8"))
    recipe["examples"][0]["conditions"][0]["min"] = "500000"
    problems = validate(recipe, load_schema(ROOT), "nj_counties")
    assert any("must be a number" in p for p in problems), problems


# Recipe v2 (Studio S0-T2, IMPLEMENTATION_GUIDE.md §4.1)

def load(layer_id):
    return json.loads((ROOT / "catalog" / "layers" / f"{layer_id}.json").read_text(encoding="utf-8"))


def problems_for(recipe):
    return validate(recipe, load_schema(ROOT), recipe["id"])


def has(problems, text):
    return any(text in problem for problem in problems)


def test_owner_names_are_never_requested():
    parcels = load("nj_parcels")
    parcels["fields"].append({"source": "OWNER_NAME", "name": "owner", "label": "Owner", "type": "text",
                              "filter": "search", "popup": True})
    assert has(problems_for(parcels), "which is in leave_out")
    parcels["leave_out"] = []
    assert has(problems_for(parcels), "owner names are never requested")


def test_leave_out_fields_cannot_be_queried_another_way():
    parcels = load("nj_parcels")
    parcels["known_answers"][0]["where"] = "zip5 = '08070'"
    assert has(problems_for(parcels), "where uses ZIP5")
    parcels = load("nj_parcels")
    parcels["area_codes"]["municipality"]["field"] = "CITY_STATE"
    assert has(problems_for(parcels), "area_codes/municipality: 'CITY_STATE' is personal data")


def test_every_recipe_names_its_access_mode():
    for layer_id in ("nj_counties", "nj_trails"):
        assert load(layer_id)["access"] == "copy"
    for layer_id in ("nj_parcels", "nj_contaminated_sites", "nj_overburdened_communities"):
        recipe = load(layer_id)
        assert recipe["access"] == "live" and "partition" not in recipe and "place_tags" not in recipe


def test_live_layers_are_not_built_and_copies_are():
    live = load("nj_contaminated_sites")
    live["tiles"] = {"min_zoom": 7, "max_zoom": 14}
    assert problems_for(live)  # a live layer has no tiles
    live = load("nj_contaminated_sites")
    live.pop("min_zoom")
    assert problems_for(live)
    copy = load("nj_trails")
    copy["min_zoom"] = 9
    assert problems_for(copy)
    copy = load("nj_trails")
    copy["refresh_cadence"] = "live"
    assert problems_for(copy)


def test_boundary_layers_must_be_copies():
    counties = load("nj_counties")
    for key in ("place_tags", "tiles"):
        counties.pop(key)
    counties.update(access="live", area_mode="intersects", min_zoom=5, distance_query=True, refresh_cadence="live")
    assert has(problems_for(counties), "a boundary layer must have access 'copy'")


def test_boundary_layers_cannot_be_buffered():
    for layer_id in ("nj_municipalities", "nj_wards", "nj_subwatersheds", "nj_tax_blocks", "nj_sewer_service_areas", "nj_highlands_areas"):
        recipe = load(layer_id)
        assert not problems_for(recipe)
        recipe["buffer_role"] = "both"
        assert has(problems_for(recipe), "a boundary layer cannot be buffered")
    schools = load("nj_schools")
    assert schools["buffer_role"] == "both" and not problems_for(schools)


def test_farm_owner_names_are_never_requested():
    farms = load("nj_preserved_farmland")
    assert not problems_for(farms)
    for source in ("ORIG_OWNER", "LATEST_LANDOWNER"):
        bad = load("nj_preserved_farmland")
        bad["leave_out"] = []
        bad["fields"].append({"source": source, "name": "owner", "label": "Owner", "type": "text", "filter": "none", "popup": True})
        assert has(problems_for(bad), "owner names are never requested")


def test_location_restricted_history_stays_out():
    for layer_id in ("nj_historic_districts", "nj_historic_properties"):
        where = load(layer_id)["source"]["where"]
        assert "LOC_RESTR" in where and "DIGIPOST" in where


def test_area_codes_go_with_code_mode_only():
    parcels = load("nj_parcels")
    parcels.pop("area_codes")
    assert problems_for(parcels)
    parcels = load("nj_parcels")
    parcels["area_mode"] = "intersects"
    assert problems_for(parcels)


def test_list_fields_go_with_buffer_targets():
    parcels = load("nj_parcels")
    parcels["buffer_role"] = "source"
    assert problems_for(parcels)
    parcels = load("nj_parcels")
    parcels.pop("list_fields")
    assert problems_for(parcels)
    parcels = load("nj_parcels")
    parcels["list_fields"] = ["address"]
    assert has(problems_for(parcels), "is the label field")
    parcels["list_fields"] = ["PROP_CLASS"]
    assert has(problems_for(parcels), "'PROP_CLASS' is not one of the output field names")


def test_style_presets_fit_the_fields_and_geometry():
    parcels = load("nj_parcels")
    parcels["default_style"] = "missing"
    assert has(problems_for(parcels), "default_style 'missing' is not a key in styles")
    parcels = load("nj_parcels")
    parcels["styles"]["by_value"] = {"label": "By value", "kind": "graduated", "field": "address", "classes": 5,
                                     "method": "quantile", "palette": "blues"}
    assert has(problems_for(parcels), "a graduated style needs a number field")
    parcels["styles"]["by_value"].update(field="assessed_value", breaks=[1, 2])
    assert has(problems_for(parcels), "5 classes need 4 breaks")
    parcels["styles"]["by_value"]["breaks"] = [4, 3, 2, 1]
    assert has(problems_for(parcels), "breaks must be ascending")
    parcels["styles"]["by_value"]["breaks"] = [100000, 200000, 400000, 800000]
    assert problems_for(parcels) == []
    parcels["styles"]["outline"]["radius"] = 4
    assert has(problems_for(parcels), "'radius' is only for point layers")


def test_style_kinds_take_only_their_own_keys():
    parcels = load("nj_parcels")
    parcels["styles"]["by_class"]["color"] = "#000000"
    assert problems_for(parcels)
    parcels = load("nj_parcels")
    parcels["styles"]["by_class"]["palette"] = "blues"  # a graduated palette
    assert problems_for(parcels)
    parcels = load("nj_parcels")
    parcels["styles"]["by_class"]["colors"] = {"Residential": "#E8483F"}  # colors and palette together
    assert problems_for(parcels)


def test_copy_layers_keep_one_color_for_the_atlas():
    trails = load("nj_trails")
    trails["default_style"] = "by_difficulty"
    assert not has(problems_for(trails), "'single' style")  # the atlas takes the single style's color (D-086)
    trails["styles"] = {"by_difficulty": trails["styles"]["by_difficulty"]}
    assert has(problems_for(trails), "needs a 'single' style")


def test_points_are_never_cut():
    sites = load("nj_contaminated_sites")
    sites["clip_mode"] = "cut"
    assert problems_for(sites)


def test_known_answer_ranges():
    parcels = load("nj_parcels")
    parcels["known_answers"][0]["expected"] = {"min": 7000, "max": 6000}
    assert has(problems_for(parcels), "expected min is greater than max")


def test_live_layers_are_never_fetched_or_built():
    with pytest.raises(RecipeError, match="live layer"):
        require_buildable(load("nj_parcels"))
    require_buildable(load("nj_land_use"))  # hybrid: map tiles only
    require_buildable(load("nj_trails"))


def test_export_notes_name_their_outputs():
    parcels = load("nj_parcels")
    assert parcels["export_notes"][0]["on"] == ["list", "export", "print"]
    parcels["export_notes"][0]["on"] = ["mail"]
    assert problems_for(parcels)


def test_map_copies_may_drop_at_most_ten_percent_as_slivers():
    flood = load("nj_flood_zones")
    assert flood["tiles"]["max_dropped_share"] == 0.08
    flood["tiles"]["max_dropped_share"] = 0.2
    assert problems_for(flood)
