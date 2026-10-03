"""The pilot's weekly report (S6-T4) from the counter's totals. No network."""
import json

from tools import pilot_report

PILOTS = ["0714", "1709", "0905", "1310", "0300"]


def total(week, pilot, event, outcome, n):
    return {"week": week, "pilot": pilot, "event": event, "outcome": outcome, "n": n}


TOTALS = [
    total("2026-W41", "0714", "pdf", "ok", 3), total("2026-W41", "1709", "png", "ok", 1), total("2026-W41", "0905", "link", "ok", 2),
    total("2026-W41", "1310", "map_file", "ok", 1), total("2026-W41", "0300", "csv", "ok", 4),  # data only: no map
    total("2026-W41", "public", "pdf", "ok", 9), total("2026-W41", "0714", "pdf", "failed", 1),
    total("2026-W42", "0714", "pdf", "ok", 2), total("2026-W42", "1709", "embed", "ok", 1), total("2026-W42", "0905", "png", "ok", 2),
    total("2026-W42", "1310", "pdf", "ok", 1), total("2026-W42", "0300", "pdf", "ok", 1), total("2026-W42", "9999", "pdf", "ok", 5),
]


def test_a_week_counts_maps_data_and_failures_per_pilot():
    weeks = pilot_report.weekly(TOTALS, PILOTS)
    assert [w["week"] for w in weeks] == ["2026-W41", "2026-W42"]
    first = weeks[0]
    assert first["pilots"]["0714"] == {"maps": 3, "data": 0, "failed": 1}
    assert first["pilots"]["0300"] == {"maps": 0, "data": 4, "failed": 0}
    assert first["pilots_with_maps"] == 4
    assert first["attempts"] == 12 and first["failed"] == 1
    assert not first["met"]  # 4 of 5 is enough, but 1 of 12 failed is over 2%
    assert first["public"]["maps"] == 9


def test_a_week_meets_both_targets_and_unknown_codes_count_as_public():
    second = pilot_report.weekly(TOTALS, PILOTS)[1]
    assert second["pilots_with_maps"] == 5 and second["failed"] == 0 and second["met"]
    assert second["public"]["maps"] == 5  # 9999 is not a pilot


def test_the_markdown_report_names_codes_only(capsys, tmp_path):
    path = tmp_path / "totals.json"
    path.write_text(json.dumps({"v": 1, "totals": TOTALS}), encoding="utf-8")
    assert pilot_report.main(["--pilots", ",".join(PILOTS), "--from-file", str(path)]) == 0
    text = capsys.readouterr().out
    assert "weeks meeting both targets: 1" in text
    assert "#### 2026-W41: not met" in text and "| 0300 | 0 | 4 | 0 |" in text
    assert pilot_report.main(["--pilots", "714", "--from-file", str(path)]) == 2
    assert pilot_report.markdown([], PILOTS) == "No exports counted yet."
