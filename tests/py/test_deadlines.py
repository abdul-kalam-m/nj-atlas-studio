"""The calendar's inputs (D-093): FEMA plan statuses keyed by Studio's codes, and the hand-kept obligations. No network."""
import json

import pytest

from pipeline import ROOT
from pipeline.deadlines import (DeadlineError, calendar_data, hmp_snapshot, municipal_crosswalk, obligation_errors,
                                plan_summary)


def row(title, status, expires=None, town="Approved", plan_id=1, geoid="3401351000", kind="City", place="Newark city",
        approved="2025-04-28T00:00:00.000Z"):
    return {"planTitle": title, "planStatus": status, "planExpirationDate": expires, "planApprovalDate": approved,
            "jurisdictionStatus": town, "planId": plan_id, "mppGeoid": geoid, "jurisdictionType": kind, "placeName": place}


def test_the_current_plan_is_the_approved_one_that_expires_last():
    rows = [row("Essex County 2019", "Approved", "2024-04-01T00:00:00.000Z", plan_id=1),
            row("Essex County 2025", "Approved", "2030-04-27T00:00:00.000Z", plan_id=2)]
    summary = plan_summary(rows, "2026-10-03")
    assert summary == {"plan": "Essex County 2025", "approved": "2025-04-28", "expires": "2030-04-27",
                       "town_status": "Approved", "expired": False}


def test_an_update_under_way_is_reported_with_the_plan_it_replaces():
    rows = [row("Mercer County 2021", "Approved", "2026-12-09T00:00:00.000Z", plan_id=5),
            row("Mercer County 2026", "Plan in Progress", plan_id=9)]
    summary = plan_summary(rows, "2026-10-03")
    assert summary["expires"] == "2026-12-09" and not summary["expired"]
    assert summary["update"] == {"plan": "Mercer County 2026", "status": "Plan in Progress"}


def test_an_expired_plan_is_marked_and_a_town_outside_any_approved_plan_has_only_its_update():
    assert plan_summary([row("Old 2018", "Approved", "2023-01-01T00:00:00.000Z")], "2026-10-03")["expired"] is True
    only_update = plan_summary([row("Camden County 2027", "Plan in Progress")], "2026-10-03")
    assert only_update == {"update": {"plan": "Camden County 2027", "status": "Plan in Progress"}}
    assert plan_summary([], "2026-10-03") is None


def test_a_town_that_has_not_adopted_keeps_its_own_status():
    summary = plan_summary([row("Essex County 2025", "Approved", "2030-04-27T00:00:00.000Z", town="Plan in Progress")],
                           "2026-10-03")
    assert summary["town_status"] == "Plan in Progress"


def test_towns_match_by_county_subdivision_or_place_code():
    crosswalk = {"3401351000": "0714", "3451000": "0714", "3401304695": "0701", "3404695": "0701"}
    rows = [row("Essex County 2025", "Approved", "2030-04-27T00:00:00.000Z", geoid="34013", kind="County/Parish/Municipio",
                place=None),
            row("Essex County 2025", "Approved", "2030-04-27T00:00:00.000Z", geoid="3451000", place="Newark city"),
            row("Essex County 2025", "Approved", "2030-04-27T00:00:00.000Z", geoid="3401304695", town="Plan in Progress",
                place="Belleville township"),
            row("Essex County 2025", "Approved", "2030-04-27T00:00:00.000Z", geoid="3499999", place="Gone borough"),
            row("New Jersey 2024", "Approved", "2029-04-23T00:00:00.000Z", geoid="34", kind="State/District/Territory")]
    snapshot = hmp_snapshot(rows, crosswalk, "2026-10-03")
    assert set(snapshot["municipalities"]) == {"0714", "0701"}
    assert snapshot["counties"]["013"]["towns"] == 2
    assert snapshot["counties"]["013"]["towns_not_approved"] == 1
    assert snapshot["unmatched"] == ["Gone borough (3499999)"]


def test_the_crosswalk_reads_both_codes_from_the_built_municipalities(mini_atlas):
    crosswalk = municipal_crosswalk(mini_atlas)
    assert crosswalk["3403357960"] == "1709"
    assert crosswalk["3457960"] == "1709"


def obligation(**changes):
    base = {"id": "x", "title": "X", "program": "P", "level": "municipality", "date": "2027-01-01",
            "source": {"label": "Permit", "url": "https://example.org/permit"}, "verified_on": "2026-10-03"}
    return {**base, **changes}


def test_an_obligation_has_one_kind_of_date_and_an_https_source():
    assert obligation_errors(obligation()) == []
    assert obligation_errors({**obligation(), "yearly": {"month": 5, "day": 2}})  # both a date and yearly
    yearly = obligation(yearly={"month": 5, "day": 2})
    del yearly["date"]
    assert obligation_errors(yearly) == []
    assert any("https" in e for e in obligation_errors(obligation(source={"label": "P", "url": "http://example.org"})))
    assert any("YYYY-MM-DD" in e for e in obligation_errors(obligation(date="2027-13-01")))
    assert any("level" in e for e in obligation_errors(obligation(level="town")))


def test_the_calendar_links_only_to_kits_in_the_build(tmp_path):
    folder = tmp_path / "catalog" / "deadlines"
    folder.mkdir(parents=True)
    (folder / "deadlines.json").write_text(json.dumps({"obligations": [obligation(id="a", kit="ms4_watershed"),
                                                                        obligation(id="b")]}), encoding="utf-8")
    calendar = calendar_data(tmp_path, kits={"grant_project_area"})
    assert [o.get("kit") for o in calendar["obligations"]] == [None, None]
    assert calendar_data(tmp_path, kits={"ms4_watershed"})["obligations"][0]["kit"] == "ms4_watershed"
    assert calendar["hmp"] is None
    (folder / "deadlines.json").write_text(json.dumps({"obligations": [obligation(id="a"), obligation(id="a")]}),
                                           encoding="utf-8")
    with pytest.raises(DeadlineError, match="listed twice"):
        calendar_data(tmp_path)


def test_the_real_deadlines_are_valid_and_sourced():
    calendar = calendar_data(ROOT)
    assert {o["id"] for o in calendar["obligations"]} >= {"ms4_annual_report", "ms4_assessment_report"}
    annual = next(o for o in calendar["obligations"] if o["id"] == "ms4_annual_report")
    assert annual["yearly"] == {"month": 5, "day": 2}
    if calendar["hmp"]:
        assert len(calendar["hmp"]["counties"]) == 21
        assert calendar["hmp"]["kit"] == "hazard_mitigation"
        assert calendar_data(ROOT, kits=set())["hmp"]["kit"] is None
