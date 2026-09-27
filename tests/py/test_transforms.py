"""pipeline/normalize.py and site/js/studio/transform.js follow the same transform rules (shared fixture)."""
import json
import math

import pandas as pd
import pytest

from pipeline import ROOT
from pipeline.normalize import convert

FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "transform_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=[case["label"] for case in FIXTURE["cases"]])
def test_shared_transform_case(case):
    field = {"name": "x", "label": "X", "filter": "none", "popup": True, **case["field"]}
    value = convert(pd.Series([case["value"]], dtype="object"), field).iloc[0]
    if value is pd.NA or (isinstance(value, float) and math.isnan(value)):
        value = None
    if isinstance(case["expected"], float):
        assert value == pytest.approx(case["expected"])
    else:
        assert value == case["expected"]


def test_mixed_dimension_shapes_are_repaired_part_by_part():
    from shapely.geometry import GeometryCollection, LineString, Polygon
    from pipeline.normalize import repair
    bowtie = Polygon([(0, 0), (1, 1), (1, 0), (0, 1), (0, 0)])  # invalid: it crosses itself
    fixed = repair(GeometryCollection([bowtie, LineString([(0, 0), (2, 2)])]), "polygon")
    assert fixed.geom_type in ("Polygon", "MultiPolygon") and fixed.is_valid and fixed.area > 0
