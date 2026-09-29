"""Lookup tables (D-085): values a live layer's source does not carry, joined in the browser by a key the source
does carry. A recipe field names one with `lookup` ({"table", "column"}); Studio's catalog turns the column into
the field's value_labels, so filters, styles, popups and downloads use the joined values as they use any coded
field. Tables live in catalog/lookups/<table>.json and are rebuilt with: python -m pipeline lookup <table>.

nj_soils_ssurgo: USDA NRCS soil survey ratings by map unit key (MUKEY), from Soil Data Access, for the map units in
NJDEP's soils layer. Map units NJDEP has that the current survey no longer has get blank values.
"""
import json
import socket
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pipeline.arcgis import USER_AGENT, FetchError, RetryableError, http_get_json, with_retries

SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"
SOILS_URL = "https://mapsdep.nj.gov/arcgis/rest/services/Features/Geology/MapServer/11"
SEPTIC_RULE = "ENG - Septic Tank Absorption Fields"
# The more limiting class wins a tie in the dominant condition, as in NRCS's own aggregation.
SEPTIC_ORDER = ["Very limited", "Somewhat limited", "Not limited", "Not rated"]
CM_PER_FT = 30.48


class LookupTableError(ValueError):
    """A lookup table is unknown or could not be built."""


def lookup_path(root: Path, table: str) -> Path:
    return root / "catalog" / "lookups" / f"{table}.json"


def load_lookup(root: Path, table: str) -> dict:
    path = lookup_path(root, table)
    if not path.exists():
        raise LookupTableError(f"No lookup table {table}: expected {path.relative_to(root)}; run: python -m pipeline lookup {table}")
    return json.loads(path.read_text(encoding="utf-8"))


def column_labels(table: dict, column: str) -> dict:
    """{source key: displayed value} for one column; blank values map to null."""
    index = table["columns"].index(column)
    return {key: row[index] for key, row in table["rows"].items()}


# ---- nj_soils_ssurgo: pure rules, tested offline ----

def dominant_septic(components: list[tuple[int | None, str | None]]) -> str:
    """NRCS 'dominant condition': the rating whose components cover the largest share of the map unit."""
    shares = defaultdict(int)
    for percent, rating in components:
        shares[rating or "Not rated"] += percent or 0
    if not shares:
        return "Not rated"
    return max(shares, key=lambda rating: (shares[rating], -SEPTIC_ORDER.index(rating) if rating in SEPTIC_ORDER else -99))


def water_table_band(depth_cm, rated: bool) -> str:
    """The shallowest annual depth to a water table, in bands a planner reads in feet."""
    if not rated:
        return "Not rated"
    if depth_cm is None:
        return "Deeper than 6.5 ft"
    feet = float(depth_cm) / CM_PER_FT
    if feet < 1:
        return "Under 1 ft"
    if feet < 2:
        return "1 to 2 ft"
    if feet < 4:
        return "2 to 4 ft"
    return "4 to 6.5 ft"


def hydric_class(percent) -> str | None:
    if percent is None:
        return None
    percent = int(percent)
    return "All hydric" if percent >= 100 else "Not hydric" if percent == 0 else "Partly hydric"


def main_limitation(reasons: list[tuple[str, float | None]]) -> str | None:
    """The reasons that limit a component most (those with its highest rating value), in name order; 'Not rated'
    reasons are not limitations."""
    limits = [(value or 0, reason) for reason, value in reasons if reason and not reason.startswith("Not rated")]
    if not limits:
        return None
    top = max(value for value, _ in limits)
    return "; ".join(sorted({reason for value, reason in limits if value == top}))


def soils_rows(keys: list[str], components: list[list], aggregates: list[list], reasons: list[list] = ()) -> dict:
    """keys: NJDEP's MUKEYs. components: [mukey, cokey, comppct_r, compkind, septic rating]. aggregates: [mukey,
    drainage, hydrologic group, flooding, hydric percent, water table depth in cm]. reasons: [cokey, septic reason,
    rating value]."""
    by_unit = defaultdict(list)
    for mukey, cokey, percent, kind, rating in components:
        by_unit[mukey].append((int(percent) if percent is not None else 0, cokey, kind, rating))
    why = defaultdict(list)
    for cokey, reason, value in reasons:
        why[cokey].append((reason, float(value) if value is not None else None))
    aggregate = {row[0]: row[1:] for row in aggregates}
    rows = {}
    for key in sorted(keys, key=int):
        parts = by_unit.get(key)
        if not parts or key not in aggregate:
            rows[key] = [None] * len(SOILS_COLUMNS)
            continue
        drainage, group, flooding, hydric, depth = aggregate[key]
        main = max(parts, key=lambda part: part[0])
        rated = main[2] != "Miscellaneous area"
        septic = dominant_septic([(percent, rating) for percent, _, _, rating in parts])
        limit = main_limitation(why[main[1]]) if septic in ("Very limited", "Somewhat limited") else None
        rows[key] = [septic, limit, drainage, water_table_band(depth, rated), flooding, hydric_class(hydric), group]
    return rows


SOILS_COLUMNS = ["septic", "septic_limit", "drainage", "water_table", "flooding", "hydric", "hydrologic_group"]


def sda_query(query: str) -> list[list]:
    body = json.dumps({"format": "JSON", "query": query}).encode("utf-8")

    def send():
        request = Request(SDA_URL, data=body, headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=300) as response:
                return json.loads(response.read()).get("Table", [])
        except HTTPError as error:
            if 500 <= error.code < 600:
                raise RetryableError(f"HTTP {error.code} from Soil Data Access") from error
            raise FetchError(f"HTTP {error.code} from Soil Data Access") from error
        except (URLError, TimeoutError, socket.timeout) as error:
            raise RetryableError(str(error)) from error
    return with_retries(send)


def build_soils(get_json=http_get_json, query=sda_query) -> dict:
    page = get_json(SOILS_URL + "/query", {"where": "1=1", "outFields": "MUKEY", "returnDistinctValues": "true",
                                           "returnGeometry": "false", "f": "json"})
    if page.get("exceededTransferLimit"):
        raise LookupTableError("NJDEP's soils layer has more map unit keys than one page returns")
    keys = sorted({str(f["attributes"]["MUKEY"]) for f in page["features"] if f["attributes"].get("MUKEY")}, key=int)
    nj = "l.areasymbol LIKE 'NJ%'"
    components = query(
        "SELECT m.mukey, c.cokey, c.comppct_r, c.compkind, ci.interphrc FROM legend l JOIN mapunit m ON m.lkey = l.lkey "
        "JOIN component c ON c.mukey = m.mukey LEFT JOIN cointerp ci ON ci.cokey = c.cokey AND ci.ruledepth = 0 "
        f"AND ci.mrulename = '{SEPTIC_RULE}' WHERE {nj}")
    aggregates = query(
        "SELECT m.mukey, a.drclassdcd, a.hydgrpdcd, a.flodfreqdcd, a.hydclprs, a.wtdepannmin FROM legend l "
        f"JOIN mapunit m ON m.lkey = l.lkey JOIN muaggatt a ON a.mukey = m.mukey WHERE {nj}")
    reasons = query(
        "SELECT c.cokey, ci.interphrc, ci.interphr FROM legend l JOIN mapunit m ON m.lkey = l.lkey JOIN component c "
        f"ON c.mukey = m.mukey JOIN cointerp ci ON ci.cokey = c.cokey AND ci.ruledepth = 1 AND ci.mrulename = '{SEPTIC_RULE}' "
        f"WHERE {nj}")
    rows = soils_rows(keys, components, aggregates, reasons)
    matched = sum(1 for row in rows.values() if row[0] is not None)
    return {
        "description": "USDA NRCS soil survey (SSURGO) ratings for the map units in NJDEP's soils layer, by MUKEY (D-085). "
                       "septic: the dominant condition of the national rating 'ENG - Septic Tank Absorption Fields'; "
                       "septic_limit: the limitations that rate highest for the map unit's largest component. "
                       "drainage, flooding and hydrologic_group: NRCS's dominant condition. water_table: the shallowest "
                       "annual depth to a water table, banded. hydric: all, part or none of the map unit's components are "
                       "hydric. Map units the current survey no longer has are blank.",
        "key": "MUKEY",
        "source": {"publisher": "USDA Natural Resources Conservation Service, Soil Data Access",
                   "url": "https://sdmdataaccess.sc.egov.usda.gov/",
                   "queried_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "keys": len(rows), "matched": matched},
        "columns": SOILS_COLUMNS,
        "rows": rows,
    }


BUILDERS = {"nj_soils_ssurgo": build_soils}


def write_lookup(root: Path, table: str, echo=print) -> dict:
    if table not in BUILDERS:
        raise LookupTableError(f"No builder for lookup table {table}; known: {', '.join(BUILDERS)}")
    data = BUILDERS[table]()
    path = lookup_path(root, table)
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = ",\n".join(f"    {json.dumps(key)}: {json.dumps(row)}" for key, row in data["rows"].items())
    head = json.dumps({k: v for k, v in data.items() if k != "rows"}, indent=2, ensure_ascii=False)[:-2]
    path.write_text(f"{head},\n  \"rows\": {{\n{rows}\n  }}\n}}\n", encoding="utf-8", newline="\n")
    echo(f"{table}: {data['source']['matched']} of {data['source']['keys']} keys matched; wrote {path.relative_to(root)}")
    return data
