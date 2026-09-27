"""Turn raw source records into the recipe's columns and types. See OPERATING_GUIDE.md §6.2-6.3."""
import math
import re

import geopandas as gpd
import pandas as pd
import shapely

KIND_TYPES = {
    "polygon": ("Polygon", "MultiPolygon"),
    "line": ("LineString", "MultiLineString"),
    "point": ("Point", "MultiPoint"),
}


def as_text(value) -> str | None:
    """Stripped string, or None for missing/empty. Whole-number floats lose their '.0'."""
    if value is None or value is pd.NA:
        return None
    if isinstance(value, float):
        if math.isnan(value):
            return None
        if value.is_integer():
            return str(int(value))
    text = str(value).strip()
    return text or None


def titlecase(text: str) -> str:
    """'CAPE MAY' -> 'Cape May', "DON'T" -> "Don't", 'WILKES-BARRE' -> 'Wilkes-Barre'."""
    return re.sub(r"(^|[\s\-/(])([a-z])", lambda m: m.group(1) + m.group(2).upper(), text.lower())


SQ_M_PER_SQ_MI = 2_589_988.110336  # exact: 1 mile = 1,609.344 m
YY_PIVOT = 30  # yymmdd: 00-29 are 2000-2029, 30-99 are 1930-1999


def yymmdd(value) -> str | None:
    """'941008' -> '1994-10-08'; anything that is not a real calendar day becomes None."""
    text = as_text(value)
    if not text or not re.fullmatch(r"\d{6}", text):
        return None
    yy, mm, dd = int(text[:2]), text[2:4], text[4:]
    year = 2000 + yy if yy < YY_PIVOT else 1900 + yy
    stamp = pd.to_datetime(f"{year}-{mm}-{dd}", format="%Y-%m-%d", errors="coerce")
    return None if pd.isna(stamp) else stamp.strftime("%Y-%m-%d")

TRANSFORMS = {
    "last3": lambda s: s[-3:],
    "zfill3": lambda s: s.zfill(3),
    "zfill4": lambda s: s.zfill(4),
    "titlecase": titlecase,
    "upper": str.upper,
}


def text_values(series: pd.Series, transform: str | None, labels: dict | None = None) -> list:
    values = [as_text(v) for v in series]
    if transform:
        values = [TRANSFORMS[transform](v) if v is not None else None for v in values]
    if labels:  # D-017: coded values become plain words; a null label blanks the value
        values = [labels.get(v, v) if v is not None else None for v in values]
    return values


def convert(series: pd.Series, field: dict) -> pd.Series:
    kind, transform = field["type"], field.get("transform")
    if kind in ("text", "category"):
        return pd.Series(text_values(series, transform, field.get("value_labels")), index=series.index, dtype="string")
    if kind == "number" and transform == "sq_m_to_sq_mi":  # D-022
        return (pd.to_numeric(series, errors="coerce") / SQ_M_PER_SQ_MI).astype("float64")
    if kind == "number" and transform == "zero_is_blank":  # D-028: e.g. year built 0 means unknown
        numbers = pd.to_numeric(series, errors="coerce").astype("float64")
        return numbers.where(numbers != 0)
    if kind == "date" and transform == "yymmdd":  # D-028
        return pd.Series([yymmdd(v) for v in series], index=series.index, dtype="string")
    source = pd.Series(text_values(series, transform), index=series.index) if transform else series
    if kind == "number":
        # Full precision is kept so filters agree with the source at boundaries; `decimals` only affects
        # display and CSV (D-018).
        return pd.to_numeric(source, errors="coerce").astype("float64")
    if kind == "date":
        numeric = pd.to_numeric(source, errors="coerce")
        stamps = pd.to_datetime(numeric, unit="ms", utc=True, errors="coerce")
        needs_text_parse = numeric.isna() & source.notna()
        if needs_text_parse.any():
            parsed = pd.to_datetime(source[needs_text_parse].astype(str), utc=True, errors="coerce")
            stamps = stamps.where(~needs_text_parse, parsed)
        dates = stamps.dt.strftime("%Y-%m-%d")
        return pd.Series([d if isinstance(d, str) else None for d in dates], index=series.index, dtype="string")
    raise ValueError(f"Unknown field type {kind}")


def _fix(geometry):
    """One shape made valid: GEOS's default repair, then the structure repair without collapsed parts, then
    buffer(0). None when all three fail."""
    for attempt in (lambda g: shapely.make_valid(g),
                    lambda g: shapely.make_valid(g, method="structure", keep_collapsed=False),
                    lambda g: g.buffer(0)):
        try:
            fixed = attempt(geometry)
        except shapely.errors.GEOSException:
            continue
        if fixed is not None and not fixed.is_empty and fixed.is_valid:
            return fixed
    return None


def repair(geometry, kind: str):
    """A valid shape of the layer's kind. Some sources mix dimensions inside one shape (NJDEP flood zones, found
    2026-09-27), which the default repair refuses; those get the fallbacks in _fix, whole and then part by part.
    A shape nothing can repair comes back empty and is counted in dropped_empty_shapes."""
    fixed = _fix(geometry)
    if fixed is None:
        parts = [_fix(part) for part in shapely.get_parts(geometry) if part.geom_type in KIND_TYPES[kind]]
        parts = [part for part in parts if part is not None]
        fixed = shapely.union_all(parts) if parts else None
    return keep_kind(fixed, kind) if fixed is not None else shapely.GeometryCollection()


def keep_kind(geometry, kind: str):
    """After make_valid, keep only the parts matching the layer's geometry kind."""
    if geometry is None or geometry.is_empty or geometry.geom_type in KIND_TYPES[kind]:
        return geometry
    parts = [part for part in shapely.get_parts(geometry) if part.geom_type in KIND_TYPES[kind]]
    return shapely.union_all(parts) if parts else shapely.GeometryCollection()


def normalize(recipe: dict, raw: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Keep, rename and convert recipe fields; add atlas_id, lon and lat. No network access."""
    source = recipe["source"]
    wanted = [source["id_field"]] + [field["source"] for field in recipe["fields"]]
    missing = sorted(set(wanted) - set(raw.columns))
    if missing:
        raise ValueError(f"{recipe['id']}: source data lacks column(s) {', '.join(missing)}")

    geometries = raw.geometry.values
    empty = pd.Series(shapely.is_missing(geometries) | shapely.is_empty(geometries), index=raw.index)
    invalid = pd.Series(~shapely.is_valid(geometries), index=raw.index) & ~empty
    geometry = raw.geometry.copy()
    if invalid.any():
        geometry[invalid] = [repair(g, recipe["geometry"]) for g in geometry[invalid].values]
        empty |= pd.Series(shapely.is_empty(geometry.values), index=raw.index)

    columns = {"atlas_id": pd.Series([as_text(v) for v in raw[source["id_field"]]], index=raw.index, dtype="string")}
    for field in recipe["fields"]:
        columns[field["name"]] = convert(raw[field["source"]], field)
    frame = gpd.GeoDataFrame(columns, geometry=geometry, crs=raw.crs or "EPSG:4326")
    frame = frame.loc[~empty].copy()
    if frame.crs.to_epsg() != 4326:
        frame = frame.to_crs(4326)

    ids = frame["atlas_id"]
    if ids.isna().any():
        raise ValueError(f"{recipe['id']}: {int(ids.isna().sum())} record(s) have no {source['id_field']} value")
    duplicates = ids[ids.duplicated()].unique().tolist()
    if duplicates:
        raise ValueError(f"{recipe['id']}: {source['id_field']} is not unique (e.g. {duplicates[:5]}); "
                         "choose another id_field")

    points = frame.geometry.representative_point()
    frame["lon"] = points.x.round(6).astype("float64")
    frame["lat"] = points.y.round(6).astype("float64")
    frame = frame[["atlas_id", *[f["name"] for f in recipe["fields"]], "lon", "lat", "geometry"]]
    frame.attrs["repaired_shapes"] = int(invalid.sum())
    frame.attrs["dropped_empty_shapes"] = int(empty.sum())
    return frame
