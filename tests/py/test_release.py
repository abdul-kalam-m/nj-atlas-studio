import pytest

from tools import release


TAGS = {"nj_counties": "none", "nj_municipalities": "county", "nj_trails": "all"}


def recipes(*pairs):
    return [{"id": layer_id, "status": status, "access": "copy", "place_tags": TAGS[layer_id]}
            for layer_id, status in pairs]


def test_no_published_layers_stops_before_touching_data(monkeypatch):
    monkeypatch.setattr(release, "load_recipes", lambda root: recipes(("nj_counties", "draft"), ("nj_trails", "draft")))
    with pytest.raises(release.ReleaseError, match="O-3"):
        release.chosen_layers(rehearsal=False)


def test_boundaries_must_be_published(monkeypatch):
    monkeypatch.setattr(release, "load_recipes", lambda root: recipes(("nj_counties", "published"),
                                                                      ("nj_municipalities", "draft")))
    with pytest.raises(release.ReleaseError, match="nj_municipalities"):
        release.chosen_layers(rehearsal=False)


def test_data_layers_need_the_census_boundaries(monkeypatch):
    monkeypatch.setattr(release, "load_recipes", lambda root: [
        {"id": "nj_counties", "status": "published", "access": "copy", "place_tags": "none"},
        {"id": "nj_municipalities", "status": "published", "access": "copy", "place_tags": "county"},
        {"id": "nj_trails", "status": "published", "access": "copy", "place_tags": "all"},
        {"id": "nj_census_tracts", "status": "draft", "access": "copy", "place_tags": "county_overlap"}])
    with pytest.raises(release.ReleaseError, match="nj_block_groups, nj_census_tracts"):
        release.chosen_layers(rehearsal=False)


def test_published_release_leaves_drafts_out(monkeypatch):
    monkeypatch.setattr(release, "load_recipes", lambda root: recipes(("nj_counties", "published"),
                                                                      ("nj_municipalities", "published"), ("nj_trails", "draft")))
    assert [r["id"] for r in release.chosen_layers(rehearsal=False)] == ["nj_counties", "nj_municipalities"]


def test_rehearsal_includes_drafts(monkeypatch):
    monkeypatch.setattr(release, "load_recipes", lambda root: recipes(("nj_counties", "draft"), ("nj_municipalities", "draft")))
    assert len(release.chosen_layers(rehearsal=True)) == 2


def test_remove_tree_deletes_read_only_files(tmp_path):
    # git marks its object files read-only; on Windows a plain rmtree refuses them (found in the M6 rehearsal).
    target = tmp_path / "pages" / ".git" / "objects"
    target.mkdir(parents=True)
    locked = target / "0a1b"
    locked.write_text("x", encoding="utf-8")
    locked.chmod(0o444)
    release.remove_tree(tmp_path / "pages")
    assert not (tmp_path / "pages").exists()


def test_a_release_publishes_the_health_file_checked_last():
    older = '{"checked_at": "2026-09-27T19:58:27Z", "layers": {}}'
    newer = '{"checked_at": "2026-10-02T12:34:39Z", "layers": {}}'
    assert release.newer_health(older, newer) == newer
    assert release.newer_health(newer, older) == newer
    assert release.newer_health(older, None) == older
    assert release.newer_health(None, newer) == newer
    assert release.newer_health(older, "not json") == older
    assert "calendar.json" in release.DATA_FILES
