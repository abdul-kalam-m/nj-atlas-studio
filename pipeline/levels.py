"""Boundary levels and place tags. See OPERATING_GUIDE.md §6.2.

This is the only file in pipeline/ or site/ that names layer IDs. No heavy imports, so `validate` stays fast.
"""
STATE_LAYER = "nj_state"
COUNTY_LAYER = "nj_counties"
MUNICIPALITY_LAYER = "nj_municipalities"
TRACT_LAYER = "nj_census_tracts"
BLOCK_GROUP_LAYER = "nj_block_groups"

# Largest to smallest; this is the order of the Boundary list in the viewer. `name` and `code` are output fields
# the boundary layer defines for itself, and place tags copy them onto other layers. `parent` is the level that
# must be picked before this level's picker lists anything. `place_tags` is the mode the layer's recipe must use.
LEVELS = [
    {"id": "state", "layer": STATE_LAYER, "name": None, "code": None, "parent": None, "place_tags": "none"},
    {"id": "county", "layer": COUNTY_LAYER, "name": "county", "code": "county_fips", "parent": None,
     "place_tags": "none"},
    {"id": "municipality", "layer": MUNICIPALITY_LAYER, "name": "municipality", "code": "mun_code",
     "parent": "county", "place_tags": "county"},
    {"id": "tract", "layer": TRACT_LAYER, "name": "tract", "code": "tract_geoid", "parent": "county",
     "place_tags": "county_overlap"},
    {"id": "block_group", "layer": BLOCK_GROUP_LAYER, "name": "block_group", "code": "bg_geoid", "parent": "tract",
     "place_tags": "county_overlap_tract"},
]
LEVEL_BY_LAYER = {level["layer"]: level for level in LEVELS}
# Data layers drawn on a level's own units (D-086) take that level's place tags, so an area lists every unit that
# overlaps it, as the boundary layer does. They must define the level's code field.
TWINS = {"nj_acs_tracts": TRACT_LAYER, "nj_acs_block_groups": BLOCK_GROUP_LAYER}
DATA_PLACE_TAGS = ("all", "all_by_district")  # every layer that is not a boundary level (D-023, D-026)
DISTRICT_FIELD = "district_code"  # all_by_district: the layer's own 4-digit municipal code

# place_tags mode -> steps. Each step copies `columns` (names first, the code last) from a boundary layer, matched:
#   point:   by the boundary area containing the item's representative point (D-006, D-019);
#   code:    by a code cut from the item's own census or tax district code, e.g. county "007" from tract
#            "34007600100", or municipality "1709" from a parcel's district_code (D-026);
#   overlap: by every municipality sharing enough area with the item; codes are joined with spaces (D-021).
TAG_STEPS = {
    "none": [],
    "county": [{"match": "point", "layer": COUNTY_LAYER, "columns": ["county", "county_fips"]}],
    "county_overlap": [
        {"match": "code", "layer": COUNTY_LAYER, "columns": ["county", "county_fips"], "from": "tract_geoid",
         "chars": [2, 5]},
        {"match": "overlap", "layer": MUNICIPALITY_LAYER, "columns": ["municipality", "mun_code"]},
    ],
    "county_overlap_tract": [
        {"match": "code", "layer": COUNTY_LAYER, "columns": ["county", "county_fips"], "from": "bg_geoid",
         "chars": [2, 5]},
        {"match": "overlap", "layer": MUNICIPALITY_LAYER, "columns": ["municipality", "mun_code"]},
        {"match": "code", "layer": TRACT_LAYER, "columns": ["tract", "tract_geoid"], "from": "bg_geoid",
         "chars": [0, 11]},
    ],
    "all": [
        {"match": "point", "layer": MUNICIPALITY_LAYER, "columns": ["county", "county_fips", "municipality", "mun_code"]},
        {"match": "point", "layer": BLOCK_GROUP_LAYER, "columns": ["tract", "tract_geoid", "block_group", "bg_geoid"]},
    ],
    "all_by_district": [
        {"match": "code", "layer": MUNICIPALITY_LAYER, "columns": ["county", "county_fips", "municipality", "mun_code"],
         "from": DISTRICT_FIELD, "chars": [0, 4]},
        {"match": "point", "layer": BLOCK_GROUP_LAYER, "columns": ["tract", "tract_geoid", "block_group", "bg_geoid"]},
    ],
}
TAG_COLUMNS = {mode: [column for step in steps for column in step["columns"]] for mode, steps in TAG_STEPS.items()}
BUILD_ORDER = {"none": 0, "county": 1, "county_overlap": 2, "county_overlap_tract": 3, "all": 4, "all_by_district": 4}
