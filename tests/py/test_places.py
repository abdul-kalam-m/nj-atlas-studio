import geopandas as gpd
import pandas as pd
from shapely.geometry import box

from pipeline.levels import BLOCK_GROUP_LAYER, COUNTY_LAYER, MUNICIPALITY_LAYER, TAG_COLUMNS, TRACT_LAYER
from pipeline.places import tag_places


def municipalities():
    return gpd.GeoDataFrame(
        {"municipality": ["West Town", "East Town"], "mun_code": ["1702", "1701"],
         "county": ["Salem County", "Salem County"], "county_fips": ["033", "033"]},
        geometry=[box(-75.0, 39.0, -74.5, 39.5), box(-74.5, 39.0, -74.0, 39.5)], crs="EPSG:4326")


def block_groups():
    return gpd.GeoDataFrame(
        {"tract": ["Census Tract 1", "Census Tract 1"], "tract_geoid": ["34033000100", "34033000100"],
         "block_group": ["Block Group 1", "Block Group 2"], "bg_geoid": ["340330001001", "340330001002"]},
        geometry=[box(-75.0, 39.0, -74.5, 39.5), box(-74.5, 39.0, -74.0, 39.5)], crs="EPSG:4326")


def data_boundaries():
    return {MUNICIPALITY_LAYER: municipalities(), BLOCK_GROUP_LAYER: block_groups()}


def items(points):
    return gpd.GeoDataFrame({"atlas_id": [str(i) for i in range(len(points))],
                             "lon": [p[0] for p in points], "lat": [p[1] for p in points]},
                            geometry=gpd.points_from_xy([p[0] for p in points], [p[1] for p in points]),
                            crs="EPSG:4326")


def areas(codes, shapes, code_column):
    frame = gpd.GeoDataFrame({code_column: codes}, geometry=shapes, crs="EPSG:4326")
    points = frame.geometry.representative_point()
    frame.insert(1, "lon", points.x)
    frame.insert(2, "lat", points.y)
    return frame


def test_inside_edge_and_outside():
    tagged = tag_places(items([(-74.8, 39.2), (-74.5, 39.2), (-70.0, 30.0)]), "all", data_boundaries())
    assert tagged["mun_code"].iloc[0] == "1702"
    assert tagged["mun_code"].iloc[1] == "1701"  # on the shared edge: lowest code wins
    assert pd.isna(tagged["mun_code"].iloc[2]) and pd.isna(tagged["county_fips"].iloc[2])
    assert tagged["county"].iloc[0] == "Salem County" and tagged["county_fips"].iloc[0] == "033"
    assert tagged["bg_geoid"].tolist()[:2] == ["340330001001", "340330001001"]  # edge: lowest block group code
    assert tagged["tract_geoid"].iloc[0] == "34033000100" and tagged["block_group"].iloc[0] == "Block Group 1"
    assert pd.isna(tagged["bg_geoid"].iloc[2])


def test_near_miss_takes_the_nearest_area_but_far_points_stay_blank():
    # About 300 ft south of West Town's edge, and about 4 miles away (D-019).
    tagged = tag_places(items([(-74.8, 38.9992), (-74.8, 38.94)]), "all", data_boundaries())
    assert tagged["mun_code"].iloc[0] == "1702" and tagged["county_fips"].iloc[0] == "033"
    assert tagged["bg_geoid"].iloc[0] == "340330001001"
    assert pd.isna(tagged["mun_code"].iloc[1]) and pd.isna(tagged["bg_geoid"].iloc[1])
    assert tagged.attrs["tagged_by_nearest"] == 1  # one item, counted once although two steps used the nearest


def test_columns_go_before_lon_lat_and_rows_are_kept():
    tagged = tag_places(items([(-74.8, 39.2), (-74.2, 39.2)]), "all", data_boundaries())
    assert list(tagged.columns) == ["atlas_id", "county", "county_fips", "municipality", "mun_code", "tract",
                                    "tract_geoid", "block_group", "bg_geoid", "lon", "lat", "geometry"]
    assert list(tagged.columns[1:-3]) == TAG_COLUMNS["all"]
    assert len(tagged) == 2


def test_county_mode_and_none_mode():
    counties = gpd.GeoDataFrame({"county": ["Salem County"], "county_fips": ["033"]},
                                geometry=[box(-75.0, 39.0, -74.0, 39.5)], crs="EPSG:4326")
    tagged = tag_places(items([(-74.8, 39.2)]), "county", {COUNTY_LAYER: counties})
    assert tagged["county_fips"].tolist() == ["033"] and "mun_code" not in tagged
    same = items([(-74.8, 39.2)])
    assert tag_places(same, "none", {}) is same


def test_tracts_take_their_county_from_their_code_and_every_municipality_they_share():
    counties = gpd.GeoDataFrame({"county": ["Salem County"], "county_fips": ["033"]},
                                geometry=[box(-80.0, 30.0, -79.0, 31.0)], crs="EPSG:4326")  # far away on purpose
    tracts = areas(["34033000100", "34033000200", "34033000300"],
                   [box(-74.8, 39.1, -74.3, 39.4),       # half in each town
                    box(-74.9, 39.1, -74.498, 39.4),     # West Town, plus a sliver of East Town
                    box(-73.0, 39.1, -72.9, 39.4)],      # offshore: no town at all
                   "tract_geoid")
    tagged = tag_places(tracts, "county_overlap", {COUNTY_LAYER: counties, MUNICIPALITY_LAYER: municipalities()})
    assert tagged["county_fips"].tolist() == ["033", "033", "033"]
    assert tagged["county"].tolist() == ["Salem County"] * 3
    assert tagged["mun_code"].iloc[0] == "1701 1702"  # sorted by name: East Town, West Town
    assert tagged["municipality"].iloc[0] == "East Town; West Town"
    assert tagged["mun_code"].iloc[1] == "1702"  # the 0.5% sliver of East Town is left out
    assert pd.isna(tagged["mun_code"].iloc[2])


def test_a_small_town_inside_a_big_tract_is_listed():
    town = gpd.GeoDataFrame({"municipality": ["Tiny Borough"], "mun_code": ["1799"]},
                            geometry=[box(-74.60, 39.20, -74.59, 39.21)], crs="EPSG:4326")
    tract = areas(["34033000100"], [box(-75.0, 39.0, -74.0, 39.5)], "tract_geoid")
    counties = gpd.GeoDataFrame({"county": ["Salem County"], "county_fips": ["033"]},
                                geometry=[box(-75.0, 39.0, -74.0, 39.5)], crs="EPSG:4326")
    tagged = tag_places(tract, "county_overlap", {COUNTY_LAYER: counties, MUNICIPALITY_LAYER: town})
    assert tagged["mun_code"].tolist() == ["1799"]  # 0.02% of the tract, but all of the town


def test_block_groups_take_their_tract_from_their_code():
    counties = gpd.GeoDataFrame({"county": ["Salem County"], "county_fips": ["033"]},
                                geometry=[box(-75.0, 39.0, -74.0, 39.5)], crs="EPSG:4326")
    tract_layer = gpd.GeoDataFrame({"tract": ["Census Tract 1"], "tract_geoid": ["34033000100"]},
                                   geometry=[box(-75.0, 39.0, -74.0, 39.5)], crs="EPSG:4326")
    groups = areas(["340330001002"], [box(-74.4, 39.1, -74.3, 39.2)], "bg_geoid")
    tagged = tag_places(groups, "county_overlap_tract", {COUNTY_LAYER: counties, MUNICIPALITY_LAYER: municipalities(),
                                                         TRACT_LAYER: tract_layer})
    assert tagged.iloc[0][["county_fips", "mun_code", "tract", "tract_geoid"]].tolist() == [
        "033", "1701", "Census Tract 1", "34033000100"]
