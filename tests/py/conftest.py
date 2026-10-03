import json
import shutil

import geopandas as gpd
import pytest
from shapely.geometry import box

from pipeline import ROOT
from pipeline.normalize import normalize
from pipeline.outputs import write_outputs
from pipeline.places import load_boundaries, tag_places


def copy_recipe(root, layer_id, expected):
    recipe = json.loads((ROOT / "catalog" / "layers" / f"{layer_id}.json").read_text(encoding="utf-8"))
    recipe["source"]["expected_count"] = {"min": expected, "max": expected}
    recipe["status"] = "draft"  # tests exercise draft handling whatever the real recipe's status is
    (root / "catalog" / "layers" / f"{layer_id}.json").write_text(json.dumps(recipe), encoding="utf-8")
    return recipe


def build_from_raw(root, recipe, raw, selftest=None):
    frame = normalize(recipe, raw)
    stats = dict(frame.attrs)
    frame = tag_places(frame, recipe["place_tags"], load_boundaries(root, recipe["place_tags"]))
    return write_outputs(recipe, frame, root, {"count": len(raw), "fetched_at": "2026-09-25T12:00:00Z"}, stats,
                         selftest=selftest)


@pytest.fixture
def mini_atlas(tmp_path):
    """A two-county, three-municipality atlas built through the real pipeline steps (no network)."""
    (tmp_path / "catalog" / "layers").mkdir(parents=True)
    shutil.copy(ROOT / "catalog" / "layer.schema.json", tmp_path / "catalog" / "layer.schema.json")
    counties = copy_recipe(tmp_path, "nj_counties", 2)
    municipalities = copy_recipe(tmp_path, "nj_municipalities", 3)
    county_raw = gpd.GeoDataFrame(
        {"COUNTY_LABEL": ["Salem County", "Cape May County"], "FIPSSTCO": ["34033", "34009"],
         "REGION": ["SOUTHERN", "COASTAL"], "POP2020": [64837, 95263], "POPDEN2020": [195, 380],
         "SQ_MILES": [332.1, 251.4]},
        geometry=[box(-75.5, 39.4, -75.1, 39.8), box(-75.0, 38.9, -74.6, 39.3)], crs="EPSG:4326")
    build_from_raw(tmp_path, counties, county_raw)
    mun_raw = gpd.GeoDataFrame(
        {"MUN_LABEL": ["Pennsville Township", "Salem City", "Cape May City"], "MUN_CODE": ["1709", "1713", "0502"],
         "MUN_TYPE": ["Township", "City", "City"], "CENSUS2020": ["3403357960", "3403365490", "3400910270"],
         "POP2020": [12684, 5296, 2768], "POPDEN2020": [500, 2000, 960],
         "SQ_MILES": [24.6, 2.6, 2.9]},
        geometry=[box(-75.5, 39.6, -75.3, 39.8), box(-75.3, 39.5, -75.1, 39.6), box(-75.0, 38.9, -74.8, 39.0)],
        crs="EPSG:4326")
    build_from_raw(tmp_path, municipalities, mun_raw)
    return tmp_path


def census(names, codes, shapes):
    return gpd.GeoDataFrame({"NAME": names, "GEOID": codes, "POP100": [1000.0] * len(codes),
                             "HU100": [400.0] * len(codes), "AREALAND": [2_589_988.110336] * len(codes)},
                            geometry=shapes, crs="EPSG:4326")


POINTS_RECIPE = {
    "id": "nj_test_points", "title": "Test points", "category": "environment", "status": "draft",
    "geometry": "point", "noun": {"singular": "point", "plural": "points"},
    "summary": "Three test points, one in each of three towns.",
    "source": {"type": "arcgis", "url": "https://example.test/arcgis/rest/services/x/MapServer/0", "where": "1=1",
               "id_field": "ID", "publisher": "Test", "landing_page": "https://example.test",
               "expected_count": {"min": 3, "max": 3}},
    "license": {"name": None, "url": None, "attribution": "Test", "reviewed_by": None, "reviewed_on": None},
    "fields": [{"source": "N", "name": "name", "label": "Name", "type": "text", "filter": "search", "popup": True}],
    "label_field": "name", "access": "copy", "area_mode": "tags", "place_tags": "all",
    "tiles": {"min_zoom": 5, "max_zoom": 12},
    "styles": {"points": {"label": "Points", "kind": "single", "color": "#000000"}}, "default_style": "points",
    "legend": {"title": "Test points"}, "buffer_role": "none", "clip_mode": "mask", "refresh_cadence": "static",
    "leave_out": [], "examples": [],
}


@pytest.fixture
def census_atlas(mini_atlas):
    """mini_atlas plus four census tracts, five block groups and three points (no network).

    Tract 10 spans Pennsville and Salem City; tract 11 only grazes Salem City (a sliver, D-021); block group
    340330010001 lies in Pennsville, 340330010002 in Salem City.
    """
    tracts = copy_recipe(mini_atlas, "nj_census_tracts", 4)
    block_groups = copy_recipe(mini_atlas, "nj_block_groups", 5)
    build_from_raw(mini_atlas, tracts, census(
        ["Census Tract 10", "Census Tract 9", "Census Tract 2.01", "Census Tract 11"],
        ["34033001000", "34033000900", "34009000201", "34033001100"],
        [box(-75.4, 39.55, -75.2, 39.7), box(-75.5, 39.7, -75.4, 39.8), box(-75.0, 38.9, -74.8, 39.0),
         box(-75.1005, 39.45, -75.0, 39.55)]))
    build_from_raw(mini_atlas, block_groups, census(
        ["Block Group 1", "Block Group 2", "Block Group 1", "Block Group 1", "Block Group 1"],
        ["340330010001", "340330010002", "340330009001", "340090002011", "340330011001"],
        [box(-75.4, 39.55, -75.3, 39.7), box(-75.3, 39.55, -75.2, 39.7), box(-75.5, 39.7, -75.4, 39.8),
         box(-75.0, 38.9, -74.8, 39.0), box(-75.1005, 39.45, -75.0, 39.55)]))
    (mini_atlas / "catalog" / "layers" / "nj_test_points.json").write_text(json.dumps(POINTS_RECIPE), encoding="utf-8")
    points = gpd.GeoDataFrame({"ID": ["p1", "p2", "p3"], "N": ["Pennsville point", "Salem point", "Cape May point"]},
                              geometry=gpd.points_from_xy([-75.35, -75.25, -74.9], [39.65, 39.575, 38.95]),
                              crs="EPSG:4326")
    build_from_raw(mini_atlas, POINTS_RECIPE, points)
    return mini_atlas
