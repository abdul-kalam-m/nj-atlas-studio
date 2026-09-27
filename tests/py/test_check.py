import json

import geopandas as gpd
import pyogrio

from pipeline.check import check_layer, run_checks


def failed_rules(root, layer_id):
    return [name for name, passed, _ in check_layer(root, layer_id) if passed is False]


def layer_file(root, layer_id, suffix):
    return root / "site" / "data" / layer_id / f"{layer_id}.{suffix}"


def test_clean_build_passes(mini_atlas):
    assert failed_rules(mini_atlas, "nj_counties") == []
    assert failed_rules(mini_atlas, "nj_municipalities") == []
    assert run_checks(mini_atlas, echo=lambda *_: None) is True


def test_missing_file_fails_rule_2(mini_atlas):
    layer_file(mini_atlas, "nj_counties", "csv").unlink()
    assert failed_rules(mini_atlas, "nj_counties") == ["2 files exist"]


def test_count_mismatch_fails_rule_3(mini_atlas):
    meta_path = mini_atlas / "site" / "data" / "nj_counties" / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["rows"] += 1
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    assert "3 row counts agree and are expected" in failed_rules(mini_atlas, "nj_counties")


def test_int64_column_fails_rules_5_and_6(mini_atlas):
    path = layer_file(mini_atlas, "nj_counties", "parquet")
    frame = gpd.read_parquet(path)
    frame.insert(1, "count", 1)
    frame.to_parquet(path, index=False)
    failed = failed_rules(mini_atlas, "nj_counties")
    assert "5 column order" in failed and "6 types are string or float64" in failed


def test_outside_new_jersey_fails_rule_8_and_overall(mini_atlas):
    path = layer_file(mini_atlas, "nj_counties", "parquet")
    frame = gpd.read_parquet(path)
    frame["geometry"] = frame.geometry.translate(xoff=20)
    frame.to_parquet(path, index=False)
    assert "8 bounds inside New Jersey box" in failed_rules(mini_atlas, "nj_counties")
    assert run_checks(mini_atlas, "nj_counties", echo=lambda *_: None) is False


def test_wrong_tile_layer_name_fails_rule_11(mini_atlas):
    path = layer_file(mini_atlas, "nj_counties", "pmtiles")
    frame = gpd.read_parquet(layer_file(mini_atlas, "nj_counties", "parquet"))
    path.unlink()
    pyogrio.write_dataframe(frame[["atlas_id", "geometry"]], path, layer="wrong", driver="PMTiles")
    assert "11 tile layer named after the layer with filter fields" in failed_rules(mini_atlas, "nj_counties")


def test_csv_header_change_fails_rule_15(mini_atlas):
    path = layer_file(mini_atlas, "nj_counties", "csv")
    text = path.read_text(encoding="utf-8-sig").replace("Region", "REGION", 1)
    path.write_text(text, encoding="utf-8-sig")
    assert failed_rules(mini_atlas, "nj_counties") == ["15 CSV has BOM and labelled header"]


def test_missing_selftests_fail_rule_16(mini_atlas):
    meta_path = mini_atlas / "site" / "data" / "nj_counties" / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert len(meta["selftest"]) == 4  # 2 recipe examples + 2 automatic cases
    meta["selftest"] = []
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    assert failed_rules(mini_atlas, "nj_counties") == ["16 self-tests present"]


def test_place_tags_come_from_the_county_polygons(mini_atlas):
    frame = gpd.read_parquet(layer_file(mini_atlas, "nj_municipalities", "parquet"))
    assert dict(zip(frame.mun_code, frame.county_fips)) == {"1709": "033", "1713": "033", "0502": "009"}
