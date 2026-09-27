"""Place tags: county, municipality, census tract and block group columns. See OPERATING_GUIDE.md §6.2.

The steps for each place_tags mode are listed in pipeline/levels.py.
"""
from pathlib import Path

import geopandas as gpd
import pandas as pd
import shapely

from pipeline.levels import TAG_COLUMNS, TAG_STEPS

NEAREST_MAX_FEET = 1000  # D-019: points just outside every boundary (e.g. beach lots) take the nearest area
OVERLAP_MIN_SHARE = 0.05  # D-021: shared area must be at least 5% of the item or of the municipality
FEET_CRS = "EPSG:3424"  # NJ State Plane, US feet


class MissingBoundaryError(RuntimeError):
    """A layer needs a boundary layer that has not been built yet."""


def boundary_path(root: Path, layer_id: str) -> Path:
    return root / "site" / "data" / layer_id / f"{layer_id}.parquet"


def load_boundaries(root: Path, mode: str) -> dict[str, gpd.GeoDataFrame]:
    """The built boundary layers a place_tags mode needs, keyed by layer ID."""
    frames = {}
    for step in TAG_STEPS[mode]:
        path = boundary_path(root, step["layer"])
        if not path.exists():
            raise MissingBoundaryError(f"Build {step['layer']} before layers with place_tags '{mode}'")
        frames[step["layer"]] = gpd.read_parquet(path)
    return frames


def text_or_none(values) -> list:
    return [None if pd.isna(v) else str(v) for v in values]


def match_point(frame: gpd.GeoDataFrame, areas: gpd.GeoDataFrame, columns: list[str]) -> tuple[pd.DataFrame, set]:
    """Columns from the area containing each item's point; ties go to the lowest code, near misses to the nearest."""
    key = columns[-1]
    points = gpd.GeoDataFrame({"_row": range(len(frame))}, geometry=gpd.points_from_xy(frame["lon"], frame["lat"]),
                              crs="EPSG:4326")
    areas = areas[columns + ["geometry"]].to_crs("EPSG:4326")
    joined = gpd.sjoin(points, areas, how="left", predicate="intersects")
    joined = joined.sort_values(["_row", key], na_position="last").drop_duplicates("_row", keep="first")
    joined = joined.set_index("_row").reindex(range(len(frame)))
    outside = joined[key].isna()
    nearest_rows = set()
    if outside.any():
        loose = points[points["_row"].isin(joined.index[outside])].to_crs(FEET_CRS)
        near = gpd.sjoin_nearest(loose, areas.to_crs(FEET_CRS), how="inner", max_distance=NEAREST_MAX_FEET)
        near = near.sort_values(["_row", key]).drop_duplicates("_row", keep="first").set_index("_row")
        for column in columns:
            joined.loc[near.index, column] = near[column]
        nearest_rows = set(near.index)
    return joined[columns], nearest_rows


def match_code(frame: gpd.GeoDataFrame, areas: gpd.GeoDataFrame, columns: list[str], source: str,
               chars: list[int]) -> pd.DataFrame:
    """The code cut from the item's own census code, and the matching names from the boundary layer."""
    key = columns[-1]
    codes = [None if pd.isna(v) else str(v)[chars[0]:chars[1]] for v in frame[source]]
    lookup = areas.drop_duplicates(key).set_index(key)
    result = pd.DataFrame({key: codes})
    for column in columns[:-1]:
        names = lookup[column].to_dict()
        result[column] = [names.get(code) if code else None for code in codes]
    return result[columns]


def match_overlap(frame: gpd.GeoDataFrame, areas: gpd.GeoDataFrame, columns: list[str]) -> pd.DataFrame:
    """Every area sharing at least OVERLAP_MIN_SHARE of the item's area or of its own area (D-021).

    Codes are joined with single spaces and names with "; ", both sorted by name.
    """
    name, key = columns
    items = gpd.GeoDataFrame({"_row": range(len(frame))}, geometry=frame.geometry.to_crs(FEET_CRS).values,
                             crs=FEET_CRS)
    areas = areas[[name, key, "geometry"]].to_crs(FEET_CRS).reset_index(drop=True)
    pairs = gpd.sjoin(items, areas, how="inner", predicate="intersects")
    item_shapes = items.geometry.values[pairs["_row"].to_numpy()]
    area_shapes = areas.geometry.values[pairs["index_right"].to_numpy()]
    shared = shapely.area(shapely.intersection(item_shapes, area_shapes))
    keep = (shared >= OVERLAP_MIN_SHARE * shapely.area(item_shapes)) | \
           (shared >= OVERLAP_MIN_SHARE * shapely.area(area_shapes))
    kept = pairs.loc[keep, ["_row", name, key]].astype({name: str, key: str}).sort_values(["_row", name, key])
    grouped = kept.groupby("_row").agg({name: "; ".join, key: " ".join})
    return grouped.reindex(range(len(frame)))[columns]


def tag_places(frame: gpd.GeoDataFrame, mode: str, boundaries: dict[str, gpd.GeoDataFrame]) -> gpd.GeoDataFrame:
    """Add the tag columns for `mode`, inserted before lon/lat."""
    columns = TAG_COLUMNS[mode]
    if not columns:
        return frame
    tags = pd.DataFrame(index=range(len(frame)))
    nearest_rows = set()
    for step in TAG_STEPS[mode]:
        areas = boundaries[step["layer"]]
        if step["match"] == "point":
            found, near = match_point(frame, areas, step["columns"])
            nearest_rows |= near
        elif step["match"] == "code":
            found = match_code(frame, areas, step["columns"], step["from"], step["chars"])
        else:
            found = match_overlap(frame, areas, step["columns"])
        for column in step["columns"]:
            tags[column] = text_or_none(found[column])
    result = frame.copy()
    for column in columns:
        result[column] = pd.Series(tags[column].tolist(), index=frame.index, dtype="string")
    order = [c for c in frame.columns if c not in ("lon", "lat", "geometry")] + columns + ["lon", "lat", "geometry"]
    result = result[order]
    result.attrs = {**frame.attrs, "tagged_by_nearest": len(nearest_rows)}
    return result
