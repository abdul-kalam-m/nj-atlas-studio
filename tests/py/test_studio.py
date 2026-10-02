"""Studio's catalog (site/data/studio.json) and area outlines, built from the mini atlas with no network."""
import json
import shutil

import pytest

from pipeline import ROOT
from pipeline.catalog import CatalogError
from pipeline.studio import build_studio_catalog, studio_entry, write_outlines


def add_recipe(root, layer_id):
    recipe = json.loads((ROOT / "catalog" / "layers" / f"{layer_id}.json").read_text(encoding="utf-8"))
    (root / "catalog" / "layers" / f"{layer_id}.json").write_text(json.dumps(recipe), encoding="utf-8")
    return recipe


@pytest.fixture
def studio_atlas(mini_atlas):
    shutil.copy(ROOT / "catalog" / "search.json", mini_atlas / "catalog" / "search.json")
    (mini_atlas / "catalog" / "templates.json").write_text(json.dumps({
        "description": "test", "site_screening": {"site_layer": "nj_parcels", "layers": [{"id": "nj_parcels", "preset": "outline"}],
                                                  "targets": [], "distance_ft": 300, "layout": {}}}), encoding="utf-8")
    add_recipe(mini_atlas, "nj_parcels")
    add_recipe(mini_atlas, "nj_wetlands")
    return mini_atlas


def test_live_entries_never_carry_leave_out_fields(studio_atlas):
    catalog = build_studio_catalog(studio_atlas, include_drafts=True)
    parcels = next(layer for layer in catalog["layers"] if layer["id"] == "nj_parcels")
    text = json.dumps(parcels)
    for personal in ("OWNER_NAME", "ST_ADDRESS", "CITY_STATE", "ZIP5", "ZIP_PLUS4", "leave_out"):
        assert personal not in text
    assert parcels["access"] == "live" and parcels["min_zoom"] == 15
    assert all("source" in field for field in parcels["fields"])
    assert parcels["export_notes"] == [{"text": "Parcel data can lag the municipal tax list. This is not a certified list of property owners.", "on": ["list", "export", "print"]}]  # D-041 wording


def test_copy_entries_point_at_their_files(studio_atlas):
    catalog = build_studio_catalog(studio_atlas, include_drafts=True)
    counties = next(layer for layer in catalog["layers"] if layer["id"] == "nj_counties")
    assert counties["tiles"]["path"] == "nj_counties/nj_counties.pmtiles"
    assert counties["files"]["parquet"]["path"].endswith(".parquet")
    assert counties["rows"] == 2


def test_hybrid_layers_are_drawn_live_without_their_map_copy(studio_atlas):
    catalog = build_studio_catalog(studio_atlas, include_drafts=True)
    wetlands = next(layer for layer in catalog["layers"] if layer["id"] == "nj_wetlands")
    assert wetlands["tiles"] is None
    assert wetlands["min_zoom"] == 11  # tiles would start at 9; drawn live from the recipe's live_min_zoom (D-081)


def test_a_built_hybrid_layer_needs_the_tile_host_in_a_release():
    recipe = json.loads((ROOT / "catalog" / "layers" / "nj_wetlands.json").read_text(encoding="utf-8"))
    meta = {"access": "hybrid", "built_at": "2026-09-27T07:56:00Z", "tile_fields": ["atlas_id", "wetland_type"], "values": {}}
    local = studio_entry(recipe, meta, {"tiles_base_url": None}, for_release=False)
    assert local["tiles"]["url"] is None and local["tiles"]["path"] == "nj_wetlands/nj_wetlands.pmtiles"
    assert studio_entry(recipe, meta, {"tiles_base_url": None}, for_release=True)["tiles"] is None
    hosted = studio_entry(recipe, meta, {"tiles_base_url": "https://tiles.example.org/"}, for_release=True)
    assert hosted["tiles"]["url"] == "https://tiles.example.org/"


def test_templates_must_name_layers_in_the_build(studio_atlas):
    (studio_atlas / "catalog" / "layers" / "nj_parcels.json").unlink()
    with pytest.raises(CatalogError, match="nj_parcels"):
        build_studio_catalog(studio_atlas, include_drafts=True)


def test_search_and_templates_travel_with_the_catalog(studio_atlas):
    catalog = build_studio_catalog(studio_atlas, include_drafts=True)
    assert catalog["search"]["url"].endswith("/GeocodeServer")
    assert catalog["templates"]["site_screening"]["site_layer"] == "nj_parcels"
    assert catalog["counter_url"] is None  # never in a local build


def test_outlines_are_one_small_geometry_per_area(mini_atlas):
    counts = write_outlines(mini_atlas, echo=lambda *_: None)
    assert counts == {"county": 2, "municipality": 3}
    geometry = json.loads((mini_atlas / "site" / "data" / "outlines" / "municipality" / "1709.json").read_text(encoding="utf-8"))
    assert geometry["type"] in ("Polygon", "MultiPolygon")


def test_core_layers_lead_the_catalog_and_must_have_recipes(studio_atlas):
    (studio_atlas / "catalog" / "core.json").write_text(json.dumps({"core": ["nj_wetlands", "nj_parcels"]}), encoding="utf-8")
    assert build_studio_catalog(studio_atlas, include_drafts=True)["core"] == ["nj_wetlands", "nj_parcels"]
    (studio_atlas / "catalog" / "core.json").write_text(json.dumps({"core": ["nj_nothing"]}), encoding="utf-8")
    with pytest.raises(CatalogError, match="no recipe"):
        build_studio_catalog(studio_atlas, include_drafts=True)


def test_the_real_core_list_and_templates_name_published_layers():
    core = json.loads((ROOT / "catalog" / "core.json").read_text(encoding="utf-8"))["core"]
    templates = json.loads((ROOT / "catalog" / "templates.json").read_text(encoding="utf-8"))
    status = {p.stem: json.loads(p.read_text(encoding="utf-8"))["status"] for p in (ROOT / "catalog" / "layers").glob("*.json")}
    named = set(core) | {layer["id"] for key, t in templates.items() if key != "description" for layer in t["layers"]}
    assert all(status[layer_id] == "published" for layer_id in named), named
    for key, template in templates.items():
        if key != "description":
            assert len(template["layers"]) <= 8 and set(template.get("targets", [])) <= {layer["id"] for layer in template["layers"]}
