"""Series (D-091): the two cycles of each compared layer join on their key at the source. NJDEP numbered 2022's
assessment units 02040105240060-01 and 2024's HUC02040105240060; the 2022 recipes read the key from HUC14, which holds
the 2024 form. If NJDEP renumbers again, this test fails before the Changes tool reports every unit as new."""
import json

import pytest

from pipeline import ROOT
from pipeline.arcgis import http_get_json


def recipe(layer_id):
    return json.loads((ROOT / "catalog" / "layers" / f"{layer_id}.json").read_text(encoding="utf-8"))


def keys(entry, key):
    source = next(field["source"] for field in entry["fields"] if field["name"] == key)
    out, offset = set(), 0
    while True:
        page = http_get_json(entry["source"]["url"] + "/query", {"where": entry["source"]["where"], "outFields": source,
                                                                 "returnGeometry": "false", "resultOffset": str(offset),
                                                                 "resultRecordCount": "2000", "f": "json"})
        out |= {feature["attributes"][source] for feature in page.get("features", [])}
        if len(page.get("features", [])) < 2000:
            return out
        offset += 2000


@pytest.mark.network
@pytest.mark.parametrize("later_id", sorted(p.stem for p in (ROOT / "catalog" / "layers").glob("*.json")
                                            if "compare" in recipe(p.stem)))
def test_both_cycles_of_a_series_join_on_their_key(later_id):
    later = recipe(later_id)
    earlier = recipe(later["compare"]["with"])
    now, before = keys(later, later["compare"]["key"]), keys(earlier, later["compare"]["key"])
    shared = now & before
    assert len(shared) >= 0.98 * max(len(now), len(before)), (len(now), len(before), sorted(now ^ before)[:10])
