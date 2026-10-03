"""Deadlines for Studio's calendar (D-093): what is due for an area, and when.

Two inputs, both in catalog/deadlines/:
- deadlines.json, written by hand: obligations whose dates a permit or rule sets, each with its source and the date
  someone checked it. Studio lists them for the areas they apply to.
- fema_hmp.json, rebuilt with `python -m pipeline deadlines`: FEMA's hazard mitigation plan statuses (OpenFEMA,
  HazardMitigationPlanStatuses v1) for New Jersey's counties and towns, keyed by Studio's own codes, so a release
  needs no network and a rebuild shows what changed in review.
`python -m pipeline catalog` merges them into site/data/calendar.json.
"""
import json
from datetime import date, datetime, timezone
from pathlib import Path

from pipeline.arcgis import http_get_json
from pipeline.levels import CENSUS_CODE_FIELD, LEVELS
from pipeline.places import boundary_path

FEMA_URL = "https://www.fema.gov/api/open/v1/HazardMitigationPlanStatuses"
FEMA_PAGE = "https://www.fema.gov/openfema-data-page/hazard-mitigation-plan-statuses-v1"
FEMA_DATASETS = "https://www.fema.gov/api/open/v1/DataSets"
STATE_FIPS = "34"
PENDING = ("Plan in Progress", "In Review", "APA")  # FEMA: an update under way; APA is approvable pending adoption
COUNTY_TYPE = "County/Parish/Municipio"


class DeadlineError(ValueError):
    """The deadline inputs are missing or inconsistent."""


def deadlines_dir(root: Path) -> Path:
    return root / "catalog" / "deadlines"


def day(value: str | None) -> str | None:
    return value[:10] if value else None


def plan_summary(rows: list[dict], today: str) -> dict | None:
    """One jurisdiction's plans -> the plan that covers it now and any update under way.
    The current plan is the approved plan that expires last; its `town_status` is the jurisdiction's own status in
    it (a town that has not adopted the county plan is not 'Approved'). An approved plan past its expiration date is
    reported as expired, since FEMA may list it until the update is approved."""
    approved = [r for r in rows if r.get("planStatus") == "Approved" and r.get("planExpirationDate")]
    pending = [r for r in rows if r.get("planStatus") in PENDING]
    if not approved and not pending:
        return None
    out = {}
    if approved:
        current = max(approved, key=lambda r: (r["planExpirationDate"], r.get("planId") or 0))
        out.update({"plan": current.get("planTitle"), "approved": day(current.get("planApprovalDate")),
                    "expires": day(current["planExpirationDate"]), "town_status": current.get("jurisdictionStatus"),
                    "expired": day(current["planExpirationDate"]) < today})
    if pending:
        update = max(pending, key=lambda r: (r.get("planId") or 0))
        out["update"] = {"plan": update.get("planTitle"), "status": update.get("planStatus")}
    return out


def hmp_snapshot(rows: list[dict], crosswalk: dict[str, str], today: str) -> dict:
    """FEMA rows -> {counties: {county_fips: summary}, municipalities: {mun_code: summary}, unmatched: [...]}.
    `crosswalk` maps a town's 10-digit Census code to its 4-digit NJ municipal code. A county's summary also counts
    the towns in its current plan and those whose status in it is not Approved."""
    by_county, by_town, unmatched = {}, {}, set()
    for row in rows:
        geoid = str(row.get("mppGeoid") or "")
        if not geoid.startswith(STATE_FIPS):
            continue
        if row.get("jurisdictionType") == COUNTY_TYPE and len(geoid) == 5:
            by_county.setdefault(geoid[2:], []).append(row)
        elif len(geoid) in (7, 10):
            # FEMA codes townships by county subdivision (34 + county + 5 digits) and cities, boroughs and towns by
            # Census place (34 + 5 digits); in New Jersey both share the 5-digit FIPS code of the municipality.
            code = crosswalk.get(geoid) or crosswalk.get(STATE_FIPS + geoid[-5:])
            if code:
                by_town.setdefault(code, []).append(row)
            else:
                unmatched.add(f"{row.get('placeName')} ({geoid})")
    counties = {fips: plan_summary(rows, today) for fips, rows in sorted(by_county.items())}
    towns = {code: plan_summary(rows, today) for code, rows in sorted(by_town.items())}
    for fips, summary in counties.items():
        if not summary or "plan" not in summary:
            continue
        members = [s for code, s in towns.items() if s and s.get("plan") == summary["plan"]]
        summary["towns"] = len(members)
        summary["towns_not_approved"] = sum(1 for s in members if s.get("town_status") != "Approved")
    return {"counties": {k: v for k, v in counties.items() if v}, "municipalities": {k: v for k, v in towns.items() if v},
            "unmatched": sorted(unmatched)}


def fetch_fema(get_json=http_get_json, page_size: int = 1000) -> list[dict]:
    rows, skip = [], 0
    while True:
        page = get_json(FEMA_URL, {"$filter": "stateAbbreviation eq 'NJ'", "$top": str(page_size), "$skip": str(skip),
                                   "$orderby": "id"})
        batch = page.get("HazardMitigationPlanStatuses", [])
        rows.extend(batch)
        if len(batch) < page_size:
            return rows
        skip += page_size


def municipal_crosswalk(root: Path) -> dict[str, str]:
    """{Census code: NJ municipal code} from the built municipal boundary layer."""
    import pandas as pd
    level = next(level for level in LEVELS if level["id"] == "municipality")
    path = boundary_path(root, level["layer"])
    if not path.exists():
        raise DeadlineError(f"Build {level['layer']} first (python -m pipeline build {level['layer']})")
    try:
        frame = pd.read_parquet(path, columns=[level["code"], CENSUS_CODE_FIELD])
    except (KeyError, ValueError) as error:
        raise DeadlineError(f"{level['layer']} has no {CENSUS_CODE_FIELD}; rebuild it with --refresh") from error
    out = {}
    for code, census in zip(frame[level["code"]], frame[CENSUS_CODE_FIELD]):
        if census:
            out[str(census)] = str(code)  # 3401351000: county subdivision
            out[STATE_FIPS + str(census)[-5:]] = str(code)  # 3451000: the same municipality as a Census place
    return out


def fema_refreshed(get_json=http_get_json) -> str | None:
    """When FEMA last refreshed the dataset (OpenFEMA's own catalog), as YYYY-MM-DD, or None."""
    try:
        page = get_json(FEMA_DATASETS, {"$filter": "name eq 'HazardMitigationPlanStatuses'", "$select": "lastRefresh"})
        return day(max(d["lastRefresh"] for d in page["DataSets"] if d.get("lastRefresh")))
    except (KeyError, ValueError, TypeError):
        return None


def write_fema_snapshot(root: Path, get_json=http_get_json, echo=print) -> dict:
    rows = fetch_fema(get_json)
    today = date.today().isoformat()
    snapshot = hmp_snapshot(rows, municipal_crosswalk(root), today)
    data = {
        "description": "FEMA hazard mitigation plan statuses for New Jersey (D-093): for each county and town, the "
                       "approved plan that covers it now (its approval and expiration dates, and the town's own status "
                       "in it) and any update under way. Rebuilt with: python -m pipeline deadlines.",
        "source": {"publisher": "Federal Emergency Management Agency (FEMA), OpenFEMA", "url": FEMA_URL, "page": FEMA_PAGE,
                   "queried_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "rows": len(rows),
                   "refreshed": fema_refreshed(get_json)},
        **snapshot,
    }
    folder = deadlines_dir(root)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "fema_hmp.json"
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    echo(f"fema_hmp.json: {len(rows)} FEMA rows; {len(data['counties'])} counties, {len(data['municipalities'])} towns; "
         f"{len(data['unmatched'])} unmatched")
    return data


def obligation_errors(obligation: dict) -> list[str]:
    where = f"obligation {obligation.get('id', '?')}"
    errors = []
    for key in ("id", "title", "program", "level", "source", "verified_on"):
        if key not in obligation:
            errors.append(f"{where}: missing '{key}'")
    if obligation.get("level") not in ("municipality", "county", "state"):
        errors.append(f"{where}: level must be municipality, county or state")
    dated = "date" in obligation
    yearly = "yearly" in obligation
    if dated == yearly:
        errors.append(f"{where}: give either a date or a yearly month and day")
    if yearly and not (1 <= obligation["yearly"].get("month", 0) <= 12 and 1 <= obligation["yearly"].get("day", 0) <= 31):
        errors.append(f"{where}: yearly needs a month and a day")
    for key in ("date", "verified_on", "until"):
        if key in obligation:
            try:
                date.fromisoformat(obligation[key])
            except (TypeError, ValueError):
                errors.append(f"{where}: {key} must be YYYY-MM-DD")
    source = obligation.get("source", {})
    if not str(source.get("url", "")).startswith("https://") or not source.get("label"):
        errors.append(f"{where}: source needs a label and an https url")
    return errors


def calendar_data(root: Path, kits: set[str] | None = None) -> dict:
    """site/data/calendar.json: the hand-kept obligations and FEMA's plan statuses. An obligation naming a kit that is
    not in the build keeps its date but loses the link."""
    folder = deadlines_dir(root)
    path = folder / "deadlines.json"
    if not path.exists():
        return {"obligations": [], "hmp": None}
    hand = json.loads(path.read_text(encoding="utf-8"))
    errors = [problem for obligation in hand["obligations"] for problem in obligation_errors(obligation)]
    ids = [obligation["id"] for obligation in hand["obligations"]]
    errors += [f"obligation {i} is listed twice" for i in sorted({i for i in ids if ids.count(i) > 1})]
    if errors:
        raise DeadlineError("; ".join(errors))
    obligations = []
    for obligation in hand["obligations"]:
        item = {key: value for key, value in obligation.items() if key != "kit"}
        if obligation.get("kit") and (kits is None or obligation["kit"] in kits):
            item["kit"] = obligation["kit"]
        obligations.append(item)
    kit = hand.get("hazard_mitigation_kit")
    hmp_kit = kit if kit and (kits is None or kit in kits) else None
    fema_path = folder / "fema_hmp.json"
    hmp = json.loads(fema_path.read_text(encoding="utf-8")) if fema_path.exists() else None
    return {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "obligations": obligations,
        "hmp": None if hmp is None else {"source": hmp["source"], "counties": hmp["counties"],
                                         "municipalities": hmp["municipalities"], "kit": hmp_kit},
    }
