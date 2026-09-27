"""Filter meaning shared with site/js/filters.js. See OPERATING_GUIDE.md §6.7.

Both implementations must pass tests/fixtures/filter_cases.json. Change them together or not at all.
"""
import math

FILTER_FOR_OP = {"in": "checklist", "contains": "search", "range": "range"}
PLACE_KEYS = ("county_fips", "mun_code", "tract_geoid", "bg_geoid")


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return None if math.isnan(value) or math.isinf(value) else value
    text = str(value).strip()
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return None if math.isnan(number) or math.isinf(number) else number


def _text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def clean_state(state: dict, fields: list[dict] | None = None) -> dict:
    """Drop conditions that cannot apply; trim search text; convert number bounds."""
    place = state.get("place") or {}
    by_name = {f["name"]: f for f in fields} if fields is not None else None
    conditions = []
    for condition in state.get("conditions") or []:
        if not isinstance(condition, dict):
            continue
        name, op = condition.get("field"), condition.get("op")
        field = by_name.get(name) if by_name is not None else None
        if by_name is not None and (field is None or FILTER_FOR_OP.get(op) != field["filter"]):
            continue
        if op == "in":
            values = [str(v) for v in condition.get("values") or []]
            include_blank = bool(condition.get("include_blank"))
            if values or include_blank:
                conditions.append({"field": name, "op": "in", "values": values, "include_blank": include_blank})
        elif op == "contains":
            value = _text(condition.get("value"))
            if value:
                conditions.append({"field": name, "op": "contains", "value": value})
        elif op == "range":
            convert = _number if field is None or field["type"] == "number" else _text
            low, high = convert(condition.get("min")), convert(condition.get("max"))
            if low is not None or high is not None:
                conditions.append({"field": name, "op": "range", "min": low, "max": high})
    return {
        "layer": state.get("layer"),
        "place": {key: _text(place.get(key)) for key in PLACE_KEYS},
        "conditions": conditions,
    }


def place_matches(value, code: str) -> bool:
    """A place tag holds one code, or several separated by single spaces (mun_code of tracts, D-021)."""
    return value is not None and (value == code or code in str(value).split(" "))


def matches(clean: dict, row: dict) -> bool:
    """True when the row passes a cleaned state."""
    for key, code in clean["place"].items():
        if code and not place_matches(row.get(key), code):
            return False
    for condition in clean["conditions"]:
        value = row.get(condition["field"])
        op = condition["op"]
        if op == "in":
            ok = condition["include_blank"] if value is None else str(value) in condition["values"]
        elif op == "contains":
            ok = value is not None and condition["value"].lower() in str(value).lower()
        else:
            ok = value is not None \
                and (condition["min"] is None or value >= condition["min"]) \
                and (condition["max"] is None or value <= condition["max"])
        if not ok:
            return False
    return True


def count(state: dict, rows: list[dict], fields: list[dict] | None = None) -> int:
    clean = clean_state(state, fields)
    return sum(1 for row in rows if matches(clean, row))


def matching_ids(state: dict, rows: list[dict], fields: list[dict] | None = None) -> list[str]:
    clean = clean_state(state, fields)
    return [row["atlas_id"] for row in rows if matches(clean, row)]
