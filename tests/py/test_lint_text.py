from tools.lint_text import jargon_problems, library_problems

TEXT_JS = """
export const TEXT = {
  good: 'Choose data to see it on the map.',
  templated: (n) => `${n} municipalities match`,
  downloads: { geojson: 'GeoJSON (for mapping apps)', nested: { parquet: 'GeoParquet' } },
};
"""


def test_clean_text_passes_and_downloads_are_exempt():
    assert jargon_problems(TEXT_JS) == []


def test_banned_word_fails_case_insensitively():
    problems = jargon_problems(TEXT_JS.replace("see it on the map", "see its Polygons"))
    assert len(problems) == 1 and "Polygons" in problems[0]


def test_banned_word_in_template_literal_fails():
    assert jargon_problems("export const TEXT = { a: (n) => `${n} tiles loaded` };")


def test_whole_words_only():
    assert jargon_problems("export const TEXT = { a: 'Featured parks, nullified? no: multitile' };") == []


def test_pinned_jsdelivr_passes():
    files = {"site/js/map.js": "import { Protocol } from 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm';",
             "site/index.html": '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.css">'}
    assert library_problems(files) == []


def test_latest_or_other_hosts_fail():
    files = {"site/js/a.js": "const m = await import('https://cdn.jsdelivr.net/npm/maplibre-gl@latest/dist/x.mjs');",
             "site/js/b.js": "import x from 'https://unpkg.com/hyparquet@1.31.1/src/index.js';",
             "site/index.html": '<script src="https://cdn.jsdelivr.net/npm/pmtiles/dist/pmtiles.js"></script>'}
    problems = library_problems(files)
    assert len(problems) == 3


def test_basemap_style_url_is_allowed():
    files = {"site/js/map.js": "const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';"}
    assert library_problems(files) == []
