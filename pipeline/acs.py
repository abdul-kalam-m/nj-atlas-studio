"""ACS 5-year estimates for the Demographics layers (D-086): python -m pipeline acs.

Reads catalog/acs_variables.json, downloads each table's national summary file from the Census Bureau (no key),
keeps New Jersey's tracts and block groups, and writes one lookup table per level
(catalog/lookups/acs_<vintage>_tract.json and ..._block_group.json), keyed by GEOID. The Demographics recipes join
them at build time (D-085 lookups). NJ extracts are cached in build/raw/acs/<vintage>/, so a rebuild reads nothing
again unless --refresh is given.

Special values (Census ACS summary file notes): estimates of -666666666 (and the other negative codes) cannot be
computed and become blank. Margins of error of -555555555 mean the estimate is controlled (no sampling error, 0);
other negative codes are blank. Median top and bottom codes (250001 for income) become the limit they stand for.
Derived percentages carry an approximate margin of error (the Census Bureau's formulas for sums and proportions),
and the coefficient of variation sets a reliability class (high up to 12%, low above 40%, medium between).
"""
import json
import math
import socket
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pipeline.arcgis import USER_AGENT, FetchError, RetryableError, http_get_json, with_retries
from pipeline.lookups import lookup_path

PREFIX = {"tract": "1400000US34", "block_group": "1500000US34"}
GEOID_LENGTH = {"tract": 11, "block_group": 12}
# TIGERweb 2020 layers, for land area (density).
TIGER = {"tract": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/6",
         "block_group": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/8"}
SQ_M_PER_SQ_MI = 2_589_988.110336
CONTROLLED = -555555555
Z90 = 1.645
RELIABILITY = {"high": "High", "medium": "Medium", "low": "Low"}


class AcsError(ValueError):
    """The ACS tables could not be built."""


def load_config(root: Path) -> dict:
    return json.loads((root / "catalog" / "acs_variables.json").read_text(encoding="utf-8"))


def tables_of(config: dict) -> list[str]:
    cells = []
    for variable in config["variables"]:
        cells += [variable["cell"]] if "cell" in variable else variable["numerator"] + variable["denominator"]
    return sorted({cell.split("_")[0] for cell in cells})


# ---- pure rules, tested offline ----

def estimate(raw) -> float | None:
    if raw in (None, ""):
        return None
    value = float(raw)
    return None if value < 0 else value


def margin(raw) -> float | None:
    if raw in (None, ""):
        return None
    value = float(raw)
    if value == CONTROLLED:
        return 0.0
    return None if value < 0 else value


def sum_cells(row: dict, cells: list[str]) -> tuple[float | None, float | None]:
    """Sum of estimates and its approximate margin: the root of the summed squares."""
    values = [estimate(row.get(cell)) for cell in cells]
    if any(v is None for v in values):
        return None, None
    margins = [margin(row.get(cell.replace("_E", "_M"))) for cell in cells]
    moe = None if any(m is None for m in margins) else math.sqrt(sum(m * m for m in margins))
    return sum(values), moe


def proportion(numerator, num_moe, denominator, den_moe) -> tuple[float | None, float | None]:
    """Percent and its approximate margin (ACS handbook: the proportion formula, or the ratio formula when the
    proportion formula's radicand is negative)."""
    if numerator is None or not denominator:
        return None, None
    p = numerator / denominator
    if num_moe is None or den_moe is None:
        return 100 * p, None
    radicand = num_moe ** 2 - p ** 2 * den_moe ** 2
    if radicand < 0:
        radicand = num_moe ** 2 + p ** 2 * den_moe ** 2
    return 100 * p, 100 * math.sqrt(radicand) / denominator


def coded_median(value: float | None, variable: dict) -> float | None:
    """A top or bottom code becomes the limit it stands for ('or more', 'or less')."""
    if value is None:
        return None
    for key in ("top", "bottom"):
        if key in variable and value == variable[key][0]:
            return float(variable[key][1])
    return value


def reliability(value: float | None, moe: float | None, limits: dict) -> str | None:
    """High, Medium or Low, by the coefficient of variation; blank when it cannot be computed."""
    if value is None or moe is None:
        return None
    if value == 0:
        return "Low" if moe > 0 else "High"
    cv = 100 * (moe / Z90) / value
    return "High" if cv <= limits["high"] else "Low" if cv > limits["low"] else "Medium"


def compute(row: dict, variable: dict, land_sq_mi: float | None) -> tuple[float | None, float | None]:
    kind = variable["kind"]
    if kind in ("value", "median", "density"):
        value = estimate(row.get(variable["cell"]))
        moe = margin(row.get(variable["cell"].replace("_E", "_M")))
        if kind == "median":
            if value is not None and any(key in variable and value == variable[key][0] for key in ("top", "bottom")):
                moe = None  # coded medians have no margin (-333333333)
            value = coded_median(value, variable)
        if kind == "density":
            if value is None or not land_sq_mi:
                return None, None
            return value / land_sq_mi, (moe / land_sq_mi if moe is not None else None)
        return value, moe
    if kind == "percent":
        numerator, num_moe = sum_cells(row, variable["numerator"])
        denominator, den_moe = sum_cells(row, variable["denominator"])
        return proportion(numerator, num_moe, denominator, den_moe)
    raise AcsError(f"Unknown kind {kind} for {variable['name']}")


def columns_for(config: dict, level: str) -> list[str]:
    columns = []
    for variable in config["variables"]:
        if level not in variable.get("levels", ["tract", "block_group"]):
            continue
        columns.append(variable["name"])
        if variable.get("moe"):
            columns.append(f"{variable['name']}_moe")
        if variable.get("reliability"):
            columns.append(f"{variable['name']}_reliability")
    return columns


def level_rows(config: dict, level: str, rows: dict[str, dict], land: dict[str, float]) -> dict[str, list]:
    """GEOID -> values in columns_for order, rounded to each variable's decimals."""
    out = {}
    for geoid in sorted(rows):
        row, values = rows[geoid], []
        for variable in config["variables"]:
            if level not in variable.get("levels", ["tract", "block_group"]):
                continue
            value, moe = compute(row, variable, land.get(geoid))
            places = variable["decimals"]
            values.append(None if value is None else round(value, places) if places else round(value))
            if variable.get("moe"):
                values.append(None if moe is None else round(moe, max(places, 1)) if places else round(moe))
            if variable.get("reliability"):
                values.append(reliability(value, moe, config["reliability"]))
        out[geoid] = values
    return out


# ---- network ----

def nj_extract(config: dict, table: str, cache: Path, refresh: bool = False, echo=print) -> dict[str, dict]:
    """{GEOID with summary-level prefix: {column: raw text}} for NJ tracts and block groups of one table."""
    path = cache / f"{table.lower()}.dat"
    if refresh or not path.exists():
        url = config["base_url"].format(table=table.lower())
        echo(f"downloading {url}")

        def download():
            request = Request(url, headers={"User-Agent": USER_AGENT})
            try:
                with urlopen(request, timeout=300) as response:
                    header = response.readline().decode("utf-8").rstrip("\r\n")
                    keep = [header]
                    for raw in response:
                        line = raw.decode("utf-8")
                        if line.startswith(PREFIX["tract"]) or line.startswith(PREFIX["block_group"]):
                            keep.append(line.rstrip("\r\n"))
                    return keep
            except HTTPError as error:
                if 500 <= error.code < 600:
                    raise RetryableError(f"HTTP {error.code} from {url}") from error
                raise FetchError(f"HTTP {error.code} from {url}") from error
            except (URLError, TimeoutError, socket.timeout, ConnectionError) as error:
                raise RetryableError(f"{type(error).__name__} for {url}: {error}") from error
        lines = with_retries(download)
        cache.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    lines = path.read_text(encoding="utf-8").splitlines()
    header = lines[0].split("|")
    return {parts[0]: dict(zip(header, parts)) for parts in (line.split("|") for line in lines[1:] if line)}


def land_areas(level: str, get_json=http_get_json) -> dict[str, float]:
    """GEOID -> land square miles from TIGERweb (2020)."""
    out, offset = {}, 0
    while True:
        page = get_json(TIGER[level] + "/query", {"where": "STATE='34'", "outFields": "GEOID,AREALAND",
                                                 "returnGeometry": "false", "orderByFields": "GEOID",
                                                 "resultOffset": offset, "resultRecordCount": 1000, "f": "json"})
        features = page.get("features", [])
        for feature in features:
            attributes = feature["attributes"]
            out[attributes["GEOID"]] = (attributes["AREALAND"] or 0) / SQ_M_PER_SQ_MI
        if not features or not page.get("exceededTransferLimit") and len(features) < 1000:
            return out
        offset += len(features)


def build_acs(root: Path, refresh: bool = False, echo=print, get_json=http_get_json) -> dict:
    config = load_config(root)
    cache = root / "build" / "raw" / "acs" / str(config["vintage"])
    merged: dict[str, dict] = {}
    for table in tables_of(config):
        for geoid, row in nj_extract(config, table, cache, refresh, echo).items():
            merged.setdefault(geoid, {}).update(row)
    written = {}
    for level, prefix in PREFIX.items():
        rows = {geoid[len(prefix) - 2:]: row for geoid, row in merged.items() if geoid.startswith(prefix)}
        bad = [g for g in rows if len(g) != GEOID_LENGTH[level]]
        if bad:
            raise AcsError(f"{level}: unexpected GEOIDs {bad[:3]}")
        land = land_areas(level, get_json)
        missing = sorted(set(land) - set(rows))
        if missing:
            raise AcsError(f"{level}: {len(missing)} TIGERweb GEOIDs have no ACS row (e.g. {missing[:3]})")
        table = {
            "description": f"{config['label']} for New Jersey {level.replace('_', ' ')}s, from acs_variables.json (D-086). "
                           "Percentages carry approximate margins of error; reliability is the coefficient-of-variation "
                           f"class (High up to {config['reliability']['high']}%, Low over {config['reliability']['low']}%). "
                           "Medians at a Census limit are the limit ('or more' / 'or less').",
            "key": "GEOID",
            "source": {"publisher": "U.S. Census Bureau, American Community Survey 5-year summary file",
                       "url": config["base_url"].rsplit("/", 1)[0] + "/", "vintage": config["vintage"],
                       "queried_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "keys": len(rows)},
            "columns": columns_for(config, level),
            "rows": level_rows(config, level, rows, land),
        }
        name = f"acs_{config['vintage']}_{level}"
        write_table(root, name, table)
        written[level] = len(rows)
        echo(f"{name}: {len(rows)} rows, {len(table['columns'])} columns")
    return written


def write_table(root: Path, name: str, table: dict) -> None:
    path = lookup_path(root, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = ",\n".join(f"    {json.dumps(key)}: {json.dumps(row, separators=(',', ':'))}" for key, row in table["rows"].items())
    head = json.dumps({k: v for k, v in table.items() if k != "rows"}, indent=2, ensure_ascii=False)[:-2]
    path.write_text(f"{head},\n  \"rows\": {{\n{rows}\n  }}\n}}\n", encoding="utf-8", newline="\n")
