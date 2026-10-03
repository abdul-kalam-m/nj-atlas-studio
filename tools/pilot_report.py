"""The six-week pilot's weekly report (IMPLEMENTATION_GUIDE.md S6-T4, docs/studio/PILOT.md) from the export counter's
totals (D-044): which pilots exported a map each week, and the share of exports that failed.

    python tools/pilot_report.py --pilots 0714,1709,0905,1310,0300                       # reads counter_url
    python tools/pilot_report.py --pilots 0714,1709 --from-file totals.json              # a saved GET answer

The read key comes from the NJ_ATLAS_READ_KEY environment variable and is never printed or written. The counter
holds totals only, so the report names organizations by their pilot code and nothing else.
"""
import argparse
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MAP_EVENTS = ("pdf", "png", "link", "map_file", "embed")  # a map leaves Studio
DATA_EVENTS = ("csv", "geojson")
TARGET_PILOTS_SHARE = 0.8  # at least 4 of 5 pilots export a map every week (S6-T4)
TARGET_FAILED = 0.02  # export failures under 2% (S6-T4)


def weekly(totals: list[dict], pilots: list[str]) -> list[dict]:
    """One row per ISO week, oldest first: per pilot, maps, data and failed exports; the public's exports; whether
    the week met both targets."""
    weeks = sorted({row["week"] for row in totals})
    out = []
    for week in weeks:
        rows = [row for row in totals if row["week"] == week]
        per = {code: {"maps": 0, "data": 0, "failed": 0} for code in pilots}
        public = {"maps": 0, "data": 0, "failed": 0}
        for row in rows:
            target = per.get(row["pilot"], public)
            n = int(row["n"])
            if row["outcome"] == "failed":
                target["failed"] += n
            elif row["event"] in MAP_EVENTS:
                target["maps"] += n
            elif row["event"] in DATA_EVENTS:
                target["data"] += n
        attempts = sum(int(row["n"]) for row in rows if row["pilot"] in per)
        failed = sum(counts["failed"] for counts in per.values())
        mapping = sum(1 for counts in per.values() if counts["maps"] > 0)
        share = failed / attempts if attempts else 0.0
        out.append({"week": week, "pilots": per, "public": public, "pilots_with_maps": mapping, "attempts": attempts,
                    "failed": failed, "failed_share": share,
                    "met": bool(pilots) and mapping >= TARGET_PILOTS_SHARE * len(pilots) and share < TARGET_FAILED})
    return out


def markdown(weeks: list[dict], pilots: list[str]) -> str:
    """The report for PROGRESS.md: a line per week and a table per week."""
    if not weeks:
        return "No exports counted yet."
    lines = [f"Pilot weeks counted: {len(weeks)}; weeks meeting both targets: {sum(w['met'] for w in weeks)} "
             f"(a map from at least {round(TARGET_PILOTS_SHARE * len(pilots))} of {len(pilots)} pilots, failures under "
             f"{TARGET_FAILED:.0%})."]
    for week in weeks:
        lines += ["", f"#### {week['week']}: {'met' if week['met'] else 'not met'}",
                  f"Pilots with a map export: {week['pilots_with_maps']} of {len(pilots)}. Failed exports: {week['failed']} "
                  f"of {week['attempts']} ({week['failed_share']:.1%}). Public (not a pilot): {week['public']['maps']} maps, "
                  f"{week['public']['data']} data.", "", "| Pilot | Maps | Data | Failed |", "| --- | --- | --- | --- |"]
        lines += [f"| {code} | {c['maps']} | {c['data']} | {c['failed']} |" for code, c in week["pilots"].items()]
    return "\n".join(lines) + "\n"


def fetch_totals(url: str, key: str) -> list[dict]:
    request = Request(url, headers={"Authorization": f"Bearer {key}", "User-Agent": "nj-atlas-pilot-report"})
    with urlopen(request, timeout=60) as response:
        body = json.loads(response.read())
    if body.get("v") != 1 or not isinstance(body.get("totals"), list):
        raise ValueError("The counter's answer is not the D-044 format")
    return body["totals"]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Weekly pilot report from the export counter")
    parser.add_argument("--pilots", required=True, help="The pilot codes, comma-separated (4 digits each)")
    parser.add_argument("--from-file", help="A saved answer from GET /v1/count, instead of asking the counter")
    args = parser.parse_args(argv)
    pilots = [code.strip() for code in args.pilots.split(",") if code.strip()]
    if not pilots or not all(len(code) == 4 and code.isdigit() for code in pilots):
        print("ERROR: pilot codes are 4 digits, comma-separated", file=sys.stderr)
        return 2
    if args.from_file:
        totals = json.loads(Path(args.from_file).read_text(encoding="utf-8"))["totals"]
    else:
        hosting = json.loads((ROOT / "catalog" / "hosting.json").read_text(encoding="utf-8"))
        url, key = hosting.get("counter_url"), os.environ.get("NJ_ATLAS_READ_KEY")
        if not url or not key:
            print("ERROR: needs counter_url in catalog/hosting.json and NJ_ATLAS_READ_KEY in the environment", file=sys.stderr)
            return 2
        totals = fetch_totals(url, key)
    print(markdown(weekly(totals, pilots), pilots), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
