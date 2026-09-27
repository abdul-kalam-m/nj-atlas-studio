"""Load and validate layer recipes (catalog/layers/*.json). See OPERATING_GUIDE.md §6.1."""
import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from pipeline.levels import DATA_PLACE_TAGS, DISTRICT_FIELD, LEVEL_BY_LAYER, TAG_COLUMNS

RESERVED = {"atlas_id", "lon", "lat", "geometry"}
PLACE_COLUMNS = TAG_COLUMNS
FILTER_FOR_OP = {"in": "checklist", "contains": "search", "range": "range"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Source fields no recipe may request, whatever its leave_out says: owner names are personal data in every NJ source.
NEVER_REQUEST = {"OWNER_NAME"}
# Which geometry a style key applies to (IMPLEMENTATION_GUIDE.md §4.3).
STYLE_KEY_GEOMETRY = {"fill": "polygon", "radius": "point", "widths": "line"}


class RecipeError(ValueError):
    """A recipe is missing, invalid, or not allowed in this build."""


def schema_path(root: Path) -> Path:
    return root / "catalog" / "layer.schema.json"


def load_schema(root: Path) -> dict:
    return json.loads(schema_path(root).read_text(encoding="utf-8"))


def recipe_files(root: Path) -> list[Path]:
    return sorted((root / "catalog" / "layers").glob("*.json"))


def load_recipes(root: Path) -> list[dict]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in recipe_files(root)]


def validate(recipe: dict, schema: dict, file_stem: str) -> list[str]:
    """Return readable problems; an empty list means the recipe is valid."""
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = []
    for error in sorted(validator.iter_errors(recipe), key=lambda e: list(e.absolute_path)):
        location = "/".join(str(part) for part in error.absolute_path) or "(top level)"
        errors.append(f"{location}: {error.message}")
    if errors:
        return errors  # the extra rules assume the schema's shape
    return extra_rule_errors(recipe, file_stem)


def extra_rule_errors(recipe: dict, file_stem: str) -> list[str]:
    errors = []
    if recipe["id"] != file_stem:
        errors.append(f"id '{recipe['id']}' must equal the file name '{file_stem}'")
    names = [f["name"] for f in recipe["fields"]]
    sources = [f["source"] for f in recipe["fields"]]
    for label, values in (("output name", names), ("source field", sources)):
        duplicates = sorted({v for v in values if values.count(v) > 1})
        if duplicates:
            errors.append(f"duplicate {label}(s): {', '.join(duplicates)}")
    if recipe["label_field"] not in names:
        errors.append(f"label_field '{recipe['label_field']}' is not one of the output field names")
    level = LEVEL_BY_LAYER.get(recipe["id"])
    if level and recipe["access"] != "copy":
        errors.append("a boundary layer must have access 'copy' (D-030)")
    if "place_tags" in recipe:  # copy layers only; the schema enforces that
        errors.extend(place_tag_errors(recipe, names, level))
    own = [level["name"], level["code"]] if level else []
    missing_own = [column for column in own if column and column not in names]
    if missing_own:
        errors.append(f"a boundary layer must define its own field(s) {', '.join(missing_own)}")
    low, high = recipe["source"]["expected_count"]["min"], recipe["source"]["expected_count"]["max"]
    if low > high:
        errors.append(f"expected_count min {low} is greater than max {high}")
    if "tiles" in recipe and recipe["tiles"]["min_zoom"] > recipe["tiles"]["max_zoom"]:
        errors.append("tiles.min_zoom is greater than tiles.max_zoom")
    by_name = {f["name"]: f for f in recipe["fields"]}
    for index, example in enumerate(recipe["examples"]):
        for condition in example["conditions"]:
            errors.extend(f"examples/{index}: {problem}" for problem in condition_errors(condition, by_name))
    errors.extend(style_errors(recipe, by_name))
    errors.extend(list_field_errors(recipe, by_name))
    errors.extend(personal_data_errors(recipe))
    for index, answer in enumerate(recipe.get("known_answers", [])):
        if answer["expected"]["min"] > answer["expected"]["max"]:
            errors.append(f"known_answers/{index}: expected min is greater than max")
    return errors


def place_tag_errors(recipe: dict, names: list[str], level: dict | None) -> list[str]:
    errors = []
    clashing = sorted(set(names) & (RESERVED | set(PLACE_COLUMNS[recipe["place_tags"]])))
    if clashing:
        errors.append(f"field name(s) {', '.join(clashing)} are reserved for columns the build adds")
    wanted_tags = (level["place_tags"],) if level else DATA_PLACE_TAGS
    if recipe["place_tags"] not in wanted_tags:
        errors.append(f"place_tags must be {' or '.join(repr(t) for t in wanted_tags)} for this layer "
                      "(see pipeline/levels.py)")
    district = next((f for f in recipe["fields"] if f["name"] == DISTRICT_FIELD), None)
    if recipe["place_tags"] == "all_by_district" and district is None:
        errors.append(f"place_tags 'all_by_district' needs a text field named {DISTRICT_FIELD}")
    partition = recipe.get("partition")
    if partition:
        if recipe["place_tags"] != "all_by_district":
            errors.append("a partitioned layer must use place_tags 'all_by_district'")
        elif district and district["source"] != partition["field"]:
            errors.append(f"partition.field must be the source of {DISTRICT_FIELD} ({district['source']})")
    return errors


def style_errors(recipe: dict, fields_by_name: dict) -> list[str]:
    """Style presets name real output fields of the right type, and keys that fit the layer's geometry."""
    errors = []
    styles = recipe["styles"]
    if recipe["default_style"] not in styles:
        errors.append(f"default_style '{recipe['default_style']}' is not a key in styles")
    elif recipe["access"] == "copy" and styles[recipe["default_style"]]["kind"] != "single":
        errors.append("a copy layer's default style must be 'single' (the atlas draws one color per layer)")
    for key, style in styles.items():
        where = f"styles/{key}"
        field = fields_by_name.get(style.get("field")) if "field" in style else None
        if "field" in style and field is None:
            errors.append(f"{where}: field '{style['field']}' is not one of the output field names")
        elif style["kind"] == "graduated" and field["type"] != "number":
            errors.append(f"{where}: a graduated style needs a number field, but '{field['name']}' is {field['type']}")
        elif style["kind"] == "categories" and field["type"] not in ("category", "text"):
            errors.append(f"{where}: a categories style needs a category or text field, but '{field['name']}' is "
                          f"{field['type']}")
        if "labels" in style and style["labels"]["field"] not in fields_by_name:
            errors.append(f"{where}: labels.field '{style['labels']['field']}' is not one of the output field names")
        for style_key, geometry in STYLE_KEY_GEOMETRY.items():
            if style_key in style and recipe["geometry"] != geometry:
                errors.append(f"{where}: '{style_key}' is only for {geometry} layers")
        breaks = style.get("breaks")
        if breaks is not None:
            if len(breaks) != style["classes"] - 1:
                errors.append(f"{where}: {style['classes']} classes need {style['classes'] - 1} breaks")
            if breaks != sorted(set(breaks)):
                errors.append(f"{where}: breaks must be ascending with no repeats")
    return errors


def list_field_errors(recipe: dict, fields_by_name: dict) -> list[str]:
    errors = []
    for name in recipe.get("list_fields", []):
        if name not in fields_by_name:
            errors.append(f"list_fields: '{name}' is not one of the output field names")
        elif name == recipe["label_field"]:
            errors.append(f"list_fields: '{name}' is the label field, which the list already shows")
    return errors


def personal_data_errors(recipe: dict) -> list[str]:
    """Nothing in leave_out, and no owner name, may be requested: not as a field, an area code or a known answer."""
    leave_out = set(recipe["leave_out"])
    banned = {name.upper() for name in leave_out | NEVER_REQUEST}
    errors = []
    for field in recipe["fields"]:
        if field["source"] in leave_out:
            errors.append(f"field '{field['name']}' requests '{field['source']}', which is in leave_out")
        elif field["source"].upper() in NEVER_REQUEST:
            errors.append(f"field '{field['name']}' requests '{field['source']}': owner names are never requested")
    for level, code in recipe.get("area_codes", {}).items():
        if code["field"].upper() in banned:
            errors.append(f"area_codes/{level}: '{code['field']}' is personal data and cannot be queried")
    for index, answer in enumerate(recipe.get("known_answers", [])):
        named = sorted(name for name in banned if re.search(rf"\b{re.escape(name)}\b", answer["where"], re.IGNORECASE))
        if named:
            errors.append(f"known_answers/{index}: where uses {', '.join(named)}, which is personal data")
    return errors


def condition_errors(condition: dict, fields_by_name: dict) -> list[str]:
    field = fields_by_name.get(condition["field"])
    if field is None:
        return [f"condition names unknown field '{condition['field']}'"]
    op = condition["op"]
    if field["filter"] != FILTER_FOR_OP[op]:
        return [f"'{op}' needs a {FILTER_FOR_OP[op]} field, but '{field['name']}' has filter '{field['filter']}'"]
    if op == "range":
        problems = []
        for bound in ("min", "max"):
            value = condition.get(bound)
            if value is None:
                continue
            if field["type"] == "number" and not isinstance(value, (int, float)):
                problems.append(f"range {bound} for number field '{field['name']}' must be a number")
            if field["type"] == "date" and not (isinstance(value, str) and DATE.match(value)):
                problems.append(f"range {bound} for date field '{field['name']}' must be YYYY-MM-DD")
        if condition.get("min") is None and condition.get("max") is None:
            problems.append("range needs a min or a max")
        return problems
    return []


def validate_all(root: Path) -> dict[str, list[str]]:
    schema = load_schema(root)
    results = {}
    for path in recipe_files(root):
        try:
            recipe = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            results[path.stem] = [f"not valid JSON: {error}"]
            continue
        results[path.stem] = validate(recipe, schema, path.stem)
    return results


def get_recipe(root: Path, layer_id: str) -> dict:
    """Load one recipe and refuse to continue if it is invalid."""
    path = root / "catalog" / "layers" / f"{layer_id}.json"
    if not path.exists():
        raise RecipeError(f"No recipe named {layer_id}: expected {path.relative_to(root)}")
    recipe = json.loads(path.read_text(encoding="utf-8"))
    problems = validate(recipe, load_schema(root), path.stem)
    if problems:
        raise RecipeError(f"Recipe {layer_id} is invalid:\n  " + "\n  ".join(problems))
    return recipe


def place_columns(recipe: dict) -> list[str]:
    return PLACE_COLUMNS[recipe["place_tags"]]


def is_copy(recipe: dict) -> bool:
    """Only copy layers are fetched and built in full (D-030); live layers are never stored."""
    return recipe["access"] == "copy"


def require_buildable(recipe: dict) -> None:
    """Copy layers build in full and hybrid layers build map tiles only; live layers are never built (D-030)."""
    if recipe["access"] == "live":
        raise RecipeError(f"{recipe['id']} is a live layer (D-030): nothing is fetched or built; Studio queries the "
                          "source at view time")
