# NJ-Atlas milestones

Work from top to bottom. Execute one task card per session, following the work loop in [OPERATING_GUIDE.md §4](OPERATING_GUIDE.md#4-the-work-loop-one-task-per-session). A milestone is finished when its gate in [GATES.md](GATES.md) passes and the human signs it off in [PROGRESS.md](PROGRESS.md).

| Milestone | Delivers | Gate | Who |
| --- | --- | --- | --- |
| M0 Workspace | Environment, CLI skeleton, dev server, recipe validation, CI | G0 | Agent |
| M1 Boundary data | Counties and municipalities built into Parquet, PMTiles, CSV, GeoJSON and catalog | G1 | Agent |
| M2 Viewer | A map where you pick a layer, click items and read about the data | G2 | Agent |
| M3 Filter and slice | Place picker, generated filters, live counts, results table, share links, self-test | G3 | Agent |
| M4 More layers | Contaminated sites, preserved open space, plus up to two layers the human picks | G1 per layer, then G3 | Agent, human picks |
| M5 Downloads and plain language | Filtered CSV, copy link, help, empty states, mobile, accessibility | G4 and G5 | Agent |
| M5B Boundary and data filters | Boundary levels from state to block group with cascading area pickers; datasets as a grouped filter (D-020) | G1 per new layer, then G3, G4 and G5 | Agent, owner-requested |
| M6 Publish v1 | License sign-off and a live site on GitHub Pages | G6 | Human and agent |
| M7 Large layers (optional) | Parcels split by municipality (D-025), hosted on Cloudflare R2 | G7 | Human and agent |

Task card fields: **Read** (inputs), **Write** (files created or changed), **Do** (steps), **Done when** (checks that must pass), **Don't** (common mistakes).

---

## M0 · Workspace

Goal: a clean project that installs, runs empty commands and tests, serves files with Range support, and validates recipes.

#### M0-T1 · Skeleton and environment
- [x] Done
- **Read:** OPERATING_GUIDE.md §5 and §9, `requirements.txt`, `constraints.txt`
- **Write:** `package.json`, `pytest.ini`, `pipeline/__init__.py`, `pipeline/__main__.py`, `tests/py/test_cli.py`, `tests/js/smoke.test.js`
- **Do:**
  1. Create `.venv` and install: `python -m pip install -r requirements.txt -c constraints.txt`.
  2. `pipeline/__main__.py`: an argparse CLI with the subcommands `validate`, `inspect`, `fetch`, `build`, `catalog` and `check`. Each prints `not implemented yet` and exits with code 2.
  3. `pytest.ini`: `testpaths = tests/py`, and register the marker `network: needs internet`.
  4. `package.json` exactly as in OPERATING_GUIDE.md §9. `tests/js/smoke.test.js` holds one passing test using `node:test` and `node:assert`.
  5. `tests/py/test_cli.py`: runs `python -m pipeline --help` via `subprocess` and asserts that all six subcommand names appear.
- **Done when:**
  - `.venv\Scripts\python -c "import pyogrio; assert pyogrio.list_drivers()['PMTiles'] == 'rw'; print('PMTiles ok')"` prints `PMTiles ok`
  - `.venv\Scripts\python -m pytest -m "not network"` passes
  - `npm test` passes
- **Don't:** add any dependency, or implement subcommands early.

#### M0-T2 · Dev server with Range support
- [x] Done
- **Read:** OPERATING_GUIDE.md §12 (why Range matters)
- **Write:** `tools/serve.py`, `tests/py/test_serve.py`
- **Do:**
  1. Standard library only (`http.server`, `ThreadingHTTPServer`). Serve `site/` on `127.0.0.1`; the port comes from `--port` (default 8080).
  2. Support `GET` and `HEAD`, plus `Range: bytes=start-end` and `bytes=start-`: reply 206 with `Content-Range` and `Accept-Ranges: bytes`. A range past the end of the file gets 416.
  3. MIME types: `.pmtiles` and `.parquet` → `application/octet-stream`, `.geojson` → `application/geo+json`, `.js` → `text/javascript`, `.json` → `application/json`, `.csv` → `text/csv; charset=utf-8`.
  4. Send `Access-Control-Allow-Origin: *` and `Cache-Control: no-store`.
  5. Refuse paths that escape `site/` (reply 404).
  6. Tests: start the server on port 0 in a thread against a temporary folder containing a 100-byte file, then assert:
     - `Range: bytes=0-9` gives 206 with 10 bytes;
     - `bytes=90-` gives 10 bytes;
     - `bytes=200-` gives 416;
     - `HEAD` gives the right `Content-Length`;
     - `/../x` gives 404.
- **Done when:** `.venv\Scripts\python -m pytest tests/py/test_serve.py` passes.
- **Don't:** bind to `0.0.0.0`.

#### M0-T3 · Recipe validation
- [x] Done
- **Read:** OPERATING_GUIDE.md §6.1, `catalog/layer.schema.json`, `catalog/layers/nj_counties.json`
- **Write:** `pipeline/recipes.py`, `pipeline/__main__.py` (the `validate` subcommand), `tests/py/test_recipes.py`, `tests/fixtures/recipes/` (bad recipes)
- **Do:**
  1. `load_recipes(root) -> list[dict]` reads `catalog/layers/*.json`, sorted by file name.
  2. `validate(recipe, schema, file_stem) -> list[str]` returns readable errors. It combines jsonschema Draft 2020-12 errors with the extra rules in §6.1.
  3. `python -m pipeline validate` prints `OK <id>` or each error, then exits 0 only if every recipe is valid.
  4. Fixtures, one broken rule each:
     - `bad_id_mismatch.json`, `bad_duplicate_name.json`, `bad_label_field.json`, `bad_reserved_name.json`, `bad_example_op.json`;
     - `bad_published_unreviewed.json` (schema rule).
- **Done when:** `.venv\Scripts\python -m pipeline validate` prints `OK nj_counties`, and `.venv\Scripts\python -m pytest tests/py/test_recipes.py` passes with each bad fixture rejected.
- **Don't:** edit the schema to make a fixture pass.

#### M0-T4 · Gate runner
- [x] Done
- **Read:** GATES.md (the "Automated" block of every gate)
- **Write:** `tools/gate.py`, `tests/py/test_gate.py`
- **Do:**
  1. `python tools/gate.py G0` runs that gate's automated commands in order, exactly as listed in GATES.md. It prints `PASS` or `FAIL` for each, with the last 15 output lines of any failure, then `GATE G0: PASS` or `GATE G0: FAIL`.
  2. The exit code is 0 only on PASS.
  3. After the automated part it prints: `Manual checks: docs/GATES.md#<anchor>`.
  4. `--layer <id>` replaces `<id>` in commands (for G1).
  5. Commands for tools that don't exist yet will fail. That is expected until their milestone.
- **Done when:**
  - `.venv\Scripts\python -m pytest tests/py/test_gate.py` passes. It tests command-table parsing and PASS/FAIL aggregation with fake commands.
  - `.venv\Scripts\python tools/gate.py G0` runs.
- **Don't:** make gate.py read GATES.md at runtime. Keep the command table in the script, and update it whenever GATES.md changes.

#### M0-T5 · Continuous integration
- [x] Done
- **Read:** OPERATING_GUIDE.md §9
- **Write:** `.github/workflows/ci.yml`
- **Do:**
  1. Trigger on push and pull request; the job runs on `ubuntu-latest`.
  2. Set up Python 3.12 and Node 22.
  3. Install with `pip install -r requirements.txt -c constraints.txt`.
  4. Run, in order: `python -m pipeline validate`, `python -m pytest -m "not network"`, `npm test`, `python tools/lint_text.py` (added in M2; mark it `continue-on-error: true` until M2-T2).
  5. Set `permissions: contents: read`.
- **Done when:** the human has pushed the branch and the CI run is green. If there is no GitHub repository yet, record "CI written, not yet run" in PROGRESS.md; G6 requires a green run later.
- **Don't:** add deploy steps or secrets.

**Exit:** gate [G0](GATES.md#g0--workspace-ready).

---

## M1 · Boundary data

Goal: `nj_counties` and `nj_municipalities` built end to end into valid files and a catalog.

#### M1-T1 · ArcGIS client
- [x] Done
- **Read:** OPERATING_GUIDE.md §7
- **Write:** `pipeline/arcgis.py`, `tests/py/test_arcgis.py`, `tests/fixtures/arcgis/` (canned JSON)
- **Do:**
  1. `layer_info(url, get_json)`, `object_ids(url, where, get_json) -> list[int]` (sorted), and `fetch_features(url, where, out_fields, get_json, post_json) -> dict`. The last returns a GeoJSON FeatureCollection, paged exactly as in §7.
  2. Default `get_json` and `post_json` use `urllib` with the User-Agent, timeout, retry and spacing rules.
  3. Tests use fake functions returning canned pages. Cover:
     - batching by `maxRecordCount`;
     - a page missing an ID (must raise);
     - retry on a 503 then success;
     - no retry on a 400.
- **Done when:** `.venv\Scripts\python -m pytest tests/py/test_arcgis.py` passes offline.
- **Don't:** use `resultOffset` paging, run requests in parallel, or add `requests` as a dependency.

#### M1-T2 · Inspect command
- [x] Done
- **Read:** LAYER_PLAYBOOK.md step 2
- **Write:** `pipeline/inspect.py`, `pipeline/__main__.py` (the `inspect` subcommand)
- **Do:**
  1. `python -m pipeline inspect <url>` prints the layer name, geometry type, record count, `maxRecordCount`, supported formats and source CRS.
  2. It then lists each field's name and type, and 3 sample rows without geometry.
  3. For each string field (at most 15), it lists the distinct values using `returnDistinctValues=true`, printing up to 60 values or `more than 60 values`.
- **Done when:** `.venv\Scripts\python -m pipeline inspect https://maps.nj.gov/arcgis/rest/services/Framework/Government_Boundaries/MapServer/1` shows `count: 21` and the `REGION` values CENTRAL, COASTAL, NORTHEASTERN, NORTHWESTERN, SOUTHERN.
- **Don't:** write files. This command is read-only.

#### M1-T3 · Fetch command
- [x] Done
- **Read:** OPERATING_GUIDE.md §7, `pipeline/arcgis.py`
- **Write:** `pipeline/fetch.py`, `pipeline/__main__.py` (the `fetch` subcommand), `tests/py/test_fetch.py`
- **Do:**
  1. `fetch(recipe, root, refresh=False)` writes `build/raw/<id>/source.geojson` and `fetch.json`.
  2. It reuses the cache when present, unless `refresh` is set.
  3. It stops with a clear message when the count is outside `expected_count`.
  4. `outFields` is the recipe's source field names plus `id_field`.
- **Done when:**
  - Tests pass with fake network functions.
  - `.venv\Scripts\python -m pipeline fetch nj_counties` writes 21 features; running it again prints `using cached download`.
- **Don't:** write anywhere except `build/raw/<id>/`.

#### M1-T4 · Normalize
- [x] Done
- **Read:** OPERATING_GUIDE.md §6.2 and §6.3
- **Write:** `pipeline/normalize.py`, `tests/py/test_normalize.py`
- **Do:**
  1. `normalize(recipe, raw: GeoDataFrame) -> GeoDataFrame` in EPSG:4326 does the following:
     - keeps and renames the recipe fields;
     - applies `transform`, then converts types (§6.3);
     - adds `atlas_id` (unique, or it raises) and `lon`/`lat` from `representative_point()`, rounded to 6 decimals;
     - repairs invalid shapes with `shapely.make_valid` and drops empty ones, recording both counts in `gdf.attrs`.
  2. Test with small in-memory frames:
     - each transform (`"1"` with zfill3 gives `"001"`; `"34033"` with last3 gives `"033"`; `"CAPE MAY"` with titlecase gives `"Cape May"`);
     - epoch-ms to date: `1577836800000` gives `"2020-01-01"`;
     - an int column becomes float64;
     - a duplicate `atlas_id` raises;
     - an empty string becomes null.
- **Done when:** `.venv\Scripts\python -m pytest tests/py/test_normalize.py` passes.
- **Don't:** do any network access here, or keep int64 columns.

#### M1-T5 · Place tags
- [x] Done
- **Read:** OPERATING_GUIDE.md §6.2
- **Write:** `pipeline/places.py`, `tests/py/test_places.py`
- **Do:**
  1. `tag_places(gdf, mode, counties, municipalities) -> GeoDataFrame` works from the `lon`/`lat` points.
  2. Use `geopandas.sjoin(..., predicate="intersects")`, then keep the lowest code when a point touches two polygons.
  3. Points with no match get nulls.
  4. `COUNTY_LAYER = "nj_counties"` and `MUNICIPALITY_LAYER = "nj_municipalities"` are defined here and nowhere else.
  5. Tests use two touching squares: a point inside, a point on the shared edge (gets the lower code), a point outside (null).
- **Done when:** `.venv\Scripts\python -m pytest tests/py/test_places.py` passes.

#### M1-T6 · Outputs and the build command
- [x] Done
- **Read:** OPERATING_GUIDE.md §6.4 and §6.5
- **Write:** `pipeline/outputs.py`, `pipeline/build.py`, `pipeline/__main__.py` (the `build` subcommand), `tests/py/test_outputs.py`
- **Do:**
  1. `write_outputs(recipe, gdf, root)` writes the Parquet, PMTiles, CSV and GeoJSON files and `meta.json` into `site/data/<id>/`. Leave `selftest` as `[]` until M3.
  2. `build <id>` runs fetch, normalize, place tags and outputs. Place tags load the already-built boundary Parquet files; a missing prerequisite gives a clear error.
  3. `build --all` orders layers as `place_tags` none, then county, then county_municipality.
  4. Draft recipes are skipped unless `--include-drafts` is passed.
  5. Tests on a tiny frame check: the PMTiles layer name equals the ID (`pyogrio.list_layers`), CSV headers are labels, the BOM is present, the formula guard works, and the Parquet has no int64 columns.
- **Done when:**
  - `.venv\Scripts\python -m pytest tests/py/test_outputs.py` passes.
  - `.venv\Scripts\python -m pipeline build nj_counties --include-drafts` writes 4 data files and `meta.json`, with `rows: 21`.

#### M1-T7 · Municipalities recipe
- [x] Done
- **Read:** LAYER_PLAYBOOK.md, SOURCES.md (municipalities), `catalog/layers/nj_counties.json`
- **Write:** `catalog/layers/nj_municipalities.json`
- **Do:**
  1. Follow the playbook. Use `place_tags: "county"`, `id_field: "MUN_CODE"` and `expected_count` 560–570.
  2. Fields: municipality name (`MUN_LABEL`, search), `mun_code` (`MUN_CODE`, filter none), type (`MUN_TYPE`, checklist), population 2020, density 2020 and area in sq mi (range).
  3. Examples: "Towns with 50,000 people or more" (population_2020 min 50000) and "Townships" (mun_type in Township).
  4. `status: draft`.
- **Done when:** `.venv\Scripts\python -m pipeline validate` prints OK for both recipes, and `.venv\Scripts\python -m pipeline build nj_municipalities --include-drafts` gives `rows: 564`.
- **Don't:** take `county_fips` from `MUN_CODE` (see SOURCES.md).

#### M1-T8 · Catalog command
- [x] Done
- **Read:** OPERATING_GUIDE.md §6.6
- **Write:** `pipeline/catalog.py`, `pipeline/__main__.py` (the `catalog` subcommand), `tests/py/test_catalog.py`
- **Do:** Write `site/data/catalog.json` and `site/data/places.json` exactly as specified. Categories list only those used, in the order they appear in the schema enum.
- **Done when:**
  - Tests pass.
  - After building both layers, `.venv\Scripts\python -m pipeline catalog --include-drafts` produces 2 layers, 21 counties and 564 municipalities in places.json.

#### M1-T9 · Check command
- [x] Done
- **Read:** GATES.md G1 (the automated list)
- **Write:** `pipeline/check.py`, `pipeline/__main__.py` (the `check` subcommand), `tests/py/test_check.py`
- **Do:**
  1. `check [<id>]` implements every G1 automated rule, printing `PASS <rule>` or `FAIL <rule>: <detail>`.
  2. It exits 0 only if all rules pass.
  3. Tests break one rule at a time on a tiny generated layer.
- **Done when:** `.venv\Scripts\python -m pipeline check` passes for both boundary layers.

**Exit:** gate [G1](GATES.md#g1--layer-data-is-valid) for `nj_counties` and `nj_municipalities`.

---

## M2 · Viewer

Goal: open the site, choose a layer, see it on a basemap, click an item, read about the data, download the whole layer.

#### M2-T1 · Page layout
- [x] Done
- **Read:** OPERATING_GUIDE.md §8
- **Write:** `site/index.html`, `site/css/style.css`
- **Do:**
  1. A header with the site name.
  2. A left panel of 360 px with four sections: "Choose data", "Where", "Narrow it down", "Results".
  3. The map filling the rest of the screen, a results table drawer under the map, and an "About this data" `<dialog>`.
  4. Below 800 px the panel stacks under the map. Use CSS custom properties for colors.
  5. Load the MapLibre CSS from jsDelivr (pinned version). The script tag is `<script type="module" src="js/main.js">`.
- **Done when:** `tools/serve.py` serves the empty layout at `http://127.0.0.1:8080/` with no console errors, at desktop and phone widths.

#### M2-T2 · Text and plain-language lint
- [x] Done
- **Read:** GATES.md G2 (the banned-word list)
- **Write:** `site/js/text.js`, `tools/lint_text.py`, `tests/py/test_lint_text.py`
- **Do:**
  1. `text.js` exports one `TEXT` object holding every user-facing string, with functions for strings that contain numbers (e.g. `matchCount(n, total, plural)`).
  2. `lint_text.py` extracts string literals from `text.js` and fails on any banned word from G2, matched case-insensitively as a whole word.
  3. Keys under `TEXT.downloads` are exempt, because format names like GeoJSON are allowed there.
  4. The same script applies the library-host rule from G2: only `cdn.jsdelivr.net` with exact `@x.y.z` versions. The basemap style URL is allowed.
- **Done when:** `.venv\Scripts\python tools/lint_text.py` passes, and tests prove that a banned word fails and that an `@latest` import fails.

#### M2-T3 · Formatting helpers
- [x] Done
- **Write:** `site/js/format.js`, `tests/js/format.test.js`
- **Do:** Provide `formatNumber(value, decimals)` using `Intl.NumberFormat('en-US')`, `formatValue(value, field)` (units, dates as "Jan 5, 2020", null as "Not recorded") and `formatBytes(n)`.
- **Done when:** `npm test` passes, with cases for null, 0, decimals, units and dates.

#### M2-T4 · Layer picker
- [x] Done
- **Read:** OPERATING_GUIDE.md §6.6, `site/data/catalog.json` (after `catalog --include-drafts`)
- **Write:** `site/js/main.js`, `site/js/ui.js`
- **Do:**
  1. Load `data/catalog.json`.
  2. Render one card per layer, grouped under category headings. Each card shows the title, summary, "564 municipalities" and a "Draft" badge when drafted.
  3. Cards are buttons. Selecting one marks it `aria-pressed="true"` and calls `showLayer`.
- **Done when:** both boundary layers appear under "Boundaries" and are keyboard selectable.

#### M2-T5 · Map
- [x] Done
- **Read:** OPERATING_GUIDE.md §5 (stack) and §8 (styles)
- **Write:** `site/js/map.js`
- **Do:**
  1. `initMap(container)` sets the OpenFreeMap positron style, New Jersey bounds `[-75.6, 38.9, -73.9, 41.4]` and the navigation control, and registers `maplibregl.addProtocol('pmtiles', new Protocol().tile)`.
  2. `showLayer(entry)` removes the previous layer and adds a vector source `pmtiles://<absolute url>`, then layers by geometry with `"source-layer": entry.id`, and fits the layer's bounds.
  3. Show "Zoom in to see <plural>" below `tiles.min_zoom`.
  4. Add each layer's attribution to the map attribution control.
- **Done when:** selecting each boundary layer draws it within 3 seconds, and switching layers leaves no leftover shapes.
- **Don't:** use `innerHTML` with data.

#### M2-T6 · Popups and "About this data"
- [x] Done
- **Write:** `site/js/map.js` (popups), `site/js/ui.js` (dialog)
- **Do:**
  1. Clicking an item opens a popup. Its title is the `label_field` value, followed by the `popup: true` fields as label/value rows formatted with `format.js`.
  2. The "About this data" button opens the dialog with:
     - the summary and the publisher, linked to the landing page;
     - "Source service" linked to the source URL;
     - the license name and link, or "License not yet reviewed";
     - the attribution, the date fetched and the number of items;
     - download links for CSV, GeoJSON (when present) and GeoParquet, with sizes.
- **Done when:** the G2 manual steps 4–6 pass.

**Exit:** gate [G2](GATES.md#g2--the-viewer-shows-layers).

---

## M3 · Filter and slice

Goal: narrow any layer by place and by its fields with live counts, a table, share links and a self-test that proves Python and JavaScript agree.

#### M3-T1 · Shared filter cases and the Python filter
- [x] Done
- **Read:** OPERATING_GUIDE.md §6.7
- **Write:** `tests/fixtures/filter_cases.json`, `pipeline/filters.py`, `tests/py/test_filters.py`
- **Do:**
  1. The fixture holds `rows` (10–15 rows with text, category, number, date, null values and place codes) and at least 20 `cases` of the form `{name, state, expected_ids}`.
  2. The cases must cover:
     - every operator;
     - inclusive bounds and open bounds;
     - nulls, `include_blank`, and case-insensitive search including "É";
     - an empty state, a place-only state, and a place combined with conditions;
     - cleaned-away empty conditions.
  3. `matches(state, row)` and `count(state, rows)` live in `filters.py`.
- **Done when:** `.venv\Scripts\python -m pytest tests/py/test_filters.py` passes every case.

#### M3-T2 · JavaScript predicate
- [x] Done
- **Write:** `site/js/filters.js` (`cleanState`, `toPredicate`), `tests/js/filters.test.js`
- **Done when:** `npm test` passes the same `filter_cases.json`, read with `fs`, with the same expected IDs.
- **Don't:** copy the cases into the JS test. Read the shared file.

#### M3-T3 · Map filter and description
- [x] Done
- **Write:** `site/js/filters.js` (`toMapFilter`, `describe`), `tests/js/filters.test.js`
- **Do:**
  1. Add a `map_filter` expectation to at least 8 fixture cases and assert exact equality with the expressions in §6.7.
  2. `describe` returns plain phrases such as `County is Salem County · Type is Township or Borough · Population (2020) is at least 5,000`.
- **Done when:** `npm test` passes.

#### M3-T4 · Table data in the browser
- [x] Done
- **Write:** `site/js/data.js`
- **Do:**
  1. `loadRows(entry)` reads the Parquet file with `asyncBufferFromUrl({ url })` and `parquetReadObjects({ file, columns })`, excluding `geometry`.
  2. Cache the result per layer, and convert any `BigInt` to `Number` defensively.
  3. Show "Loading…" while it reads.
- **Done when:** in the browser console, `loadRows` for municipalities returns 564 rows in under 2 seconds on the local server.

#### M3-T5 · Filter controls
- [x] Done
- **Write:** `site/js/ui.js`, `site/js/main.js`
- **Do:**
  1. Generate one control per field with a filter:
     - **checklist:** checkboxes with counts from `meta.values`, "(blank)" for nulls, and a "Show all N" toggle after 8 options;
     - **search:** a text box, debounced 250 ms;
     - **range:** two number inputs (date inputs for dates) with placeholders from `meta.ranges`.
  2. On every change, recompute the state and update three things: `map.setFilter`, the count line ("37 of 564 municipalities match") and the table.
- **Done when:** G3 manual steps 2–5 give the known answers.

#### M3-T6 · Place picker
- [x] Done
- **Write:** `site/js/ui.js`, `site/js/map.js`
- **Do:**
  1. A County select (all 21 from `places.json`) and a Municipality select. The municipality list is filtered to the chosen county and disabled when no county is chosen.
  2. For the counties layer itself, the municipality select is hidden.
  3. Choosing a place zooms to its bounds, outlines it using the boundary layer's tiles filtered by code, and updates the state.
- **Done when:** choosing Salem County on the municipalities layer shows "15 of 564 municipalities match".

#### M3-T7 · Results table and active filters
- [x] Done
- **Write:** `site/js/ui.js`
- **Do:**
  1. The table shows the first 200 matches sorted by `label_field`, with columns from the `popup: true` fields.
  2. If there are more, a note reads "Showing 200 of 1,234 — download to see all".
  3. Clicking a row flies the map to its `lon`/`lat` (zoom 14 for points, else fit) and briefly highlights it.
  4. Above the table, show active filters as removable chips and a "Clear all" button.
- **Done when:** G3 manual steps 6–7 pass.

#### M3-T8 · Share links
- [x] Done
- **Write:** `site/js/state.js`, `tests/js/state.test.js`, `site/js/main.js`
- **Do:**
  1. Encode and decode the URL hash as in §6.8. Round-trip tests must cover Unicode text, dates and every operator.
  2. Update the hash on every change with `history.replaceState`.
  3. Restore state on load and on `hashchange`.
- **Done when:** `npm test` passes and G3 manual step 8 passes.

#### M3-T9 · Examples and self-test
- [x] Done
- **Write:** `pipeline/outputs.py` (`selftest` in meta.json using `pipeline/filters.py`), `site/js/ui.js` (example buttons), `site/js/selftest.js`, `site/js/main.js`
- **Do:**
  1. Recipe examples appear as "Try:" buttons that apply their state.
  2. `/?selftest` loads every layer's rows, runs each selftest case with `toPredicate`, and renders a table: Layer, Test, Expected, Got, PASS/FAIL. The last line is `SELFTEST: PASS` or `SELFTEST: FAIL`.
- **Done when:** after rebuilding both layers, `/?selftest` shows every case passing.

**Exit:** gate [G3](GATES.md#g3--filters-are-correct).

---

## M4 · More layers

Goal: the atlas becomes useful beyond boundaries. Each layer is one task, done with [LAYER_PLAYBOOK.md](LAYER_PLAYBOOK.md) and followed by G1 for that layer.

#### M4-T1 · Known contaminated sites
- [x] Done
- **Read:** LAYER_PLAYBOOK.md, SOURCES.md (contaminated sites)
- **Write:** `catalog/layers/nj_contaminated_sites.json`
- **Do:**
  1. Run the playbook. Choose at most 8 filters a resident would understand: site name (search), address (search), status, remedial level, category and lead program (checklists, or search if a field has more than 60 values).
  2. Add two examples, one using a place.
- **Done when:** G1 passes for this layer and `/?selftest` passes.

#### M4-T2 · Preserved open space
- [x] Done
- **Read:** LAYER_PLAYBOOK.md, SOURCES.md (open space), `seed/sources/pennsville-open-space.json`
- **Write:** `catalog/layers/nj_preserved_open_space.json`
- **Do:**
  1. Run the playbook.
  2. Use the NJDEP attribution sentence from the seed profile, word for word, as `license.attribution`.
  3. Set `tiles.min_zoom` to 8 or higher. Check that the PMTiles and Parquet files are each under 95 MB, and that GeoJSON is skipped if it would be larger.
- **Done when:** G1 passes for this layer and `/?selftest` passes.

#### M4-T3 · Human-selected layers
- [x] Done
- **Decided (O-2, 2026-09-25):** M4-T3a `nj_overburdened_communities` and M4-T3b `nj_trails`; see SOURCES.md.
- **Do:**
  1. Wait for the human to answer O-2 in DECISIONS.md.
  2. Split this card into one card per chosen layer (M4-T3a, M4-T3b) and do each with the playbook.
  3. Only layers up to 200,000 records belong here; anything larger goes to M7.
- **Done when:** G1 passes for each chosen layer.

#### M4-T3a · Overburdened communities
- [x] Done
- **Write:** `catalog/layers/nj_overburdened_communities.json` (facts in SOURCES.md)
- **Done when:** G1 passes for this layer and `/?selftest` passes.

#### M4-T3b · Trails
- [x] Done
- **Write:** `catalog/layers/nj_trails.json`; activity codes use `value_labels` (D-017)
- **Done when:** G1 passes for this layer and `/?selftest` passes.

#### M4-T4 · Performance pass
- [x] Done
- **Do:** With every M4 layer built, measure the §8 budgets on the local server: first-load transfer in DevTools, layer display time and filter update time. Record the numbers in PROGRESS.md. Fix any budget miss with the smallest change, such as a higher `min_zoom` or fewer tile fields.
- **Done when:** all budgets are met or a miss is reported to the human with numbers.

**Exit:** G1 for each new layer, then rerun [G3](GATES.md#g3--filters-are-correct).

---

## M5 · Downloads, sharing and plain language

#### M5-T1 · Download matches as CSV
- [x] Done
- **Write:** `site/js/csv.js`, `tests/js/csv.test.js`, `site/js/ui.js`
- **Do:**
  1. `toCsv(rows, columns)` follows §6.4: labels as headers, BOM, CRLF line endings, quoting, and the formula guard.
  2. The "Download matches (CSV)" button saves `<id>_<place or nj>_<YYYY-MM-DD>.csv` through a Blob link.
- **Done when:** `npm test` covers commas, quotes, newlines, `=SUM(1)` and "É". G4 manual step 3 passes.

#### M5-T2 · Copy link
- [x] Done
- **Do:**
  1. A "Copy link" button copies `location.href` using `navigator.clipboard.writeText`.
  2. If that fails, select the text in a read-only input instead.
  3. Confirm with "Link copied".
- **Done when:** G4 manual step 4 passes.

#### M5-T3 · Help, empty and error states
- [x] Done
- **Do:**
  1. On the first visit, show a dismissible "How it works" strip with the four steps from OPERATING_GUIDE.md §1. Remember the dismissal in `localStorage`, inside try/catch.
  2. No matches shows: "No <plural> match. Remove a filter to see more." with the active filter chips.
  3. A failed data load shows the reason and a "Try again" button.
- **Done when:** the G5 walkthrough passes.

#### M5-T4 · Phone layout
- [x] Done
- **Do:** At a width of 375 px, the panel sits under the map, the table scrolls sideways inside its own box, and the page never scrolls sideways. Buttons are at least 40 px tall.
- **Done when:** G5 step 7 passes.

#### M5-T5 · Accessibility pass
- [x] Done
- **Do:**
  1. Every control is reachable with Tab in a sensible order and has a label.
  2. The focus ring is visible.
  3. Color contrast is at least 4.5:1 for text.
  4. The count line is announced with `aria-live="polite"`.
- **Done when:** G5 step 8 passes.

**Exit:** gates [G4](GATES.md#g4--downloads-and-links-work) and [G5](GATES.md#g5--a-non-gis-person-can-use-it).

---

## M5B · Boundary and data filters

Goal: the owner's request of 2026-09-25 (D-020). The panel becomes filters: a Boundary level (State, County, Municipality, Census tract, Block group) with cascading area lists, then a Data list grouped by topic. Census tracts and block groups join as boundary layers.

#### M5B-T1 · Decisions and recipe rules
- [x] Done
- **Write:** DECISIONS.md D-020 to D-023, `catalog/layer.schema.json`, `pipeline/levels.py`, `pipeline/recipes.py`, `pipeline/normalize.py`
- **Do:**
  1. `pipeline/levels.py` lists the levels, the layer for each, its own name and code fields, and the `place_tags` steps. It is the only code that names layer IDs.
  2. Schema: `place_tags` becomes `none`, `county`, `county_overlap`, `county_overlap_tract` or `all`; the example place gains `tract_geoid` and `bg_geoid`; the `sq_m_to_sq_mi` transform is for number fields only; examples may be empty (the state has none).
  3. `validate`: data layers must use `all`; boundary layers use their level's mode and define their own name and code fields.
- **Done when:** `validate` passes for every recipe and the new recipe tests pass.

#### M5B-T2 · State, census tract and block group recipes
- [x] Done
- **Write:** `catalog/layers/nj_state.json`, `nj_census_tracts.json`, `nj_block_groups.json`; SOURCES.md; LICENSE_REVIEW.md
- **Do:** Run the playbook against NJOGIS layer 0 and TIGERweb 2020 layers 6 and 8 (`STATE='34'`). Rename overburdened communities' `block_group` field to `geoid` ("Community code"), because `block_group` is now a place column.
- **Done when:** G1 passes for each new layer.

#### M5B-T3 · Place columns for every level
- [x] Done
- **Write:** `pipeline/places.py`, `build.py`, `outputs.py`, `check.py`, `catalog.py`, `tools/release.py`, tests
- **Do:**
  1. Three match kinds (OPERATING_GUIDE.md §6.2): by point (lowest code on ties, nearest within 1,000 ft), by the item's own census code, and by shared area (at least 5%, D-021).
  2. CSV adds "Census tract", "Census tract code", "Block group" and "Block group code". Self-tests add an "Area check" using all of the first row's place codes.
  3. Check rule 8's box moves to 38.7 south. Rule 10 checks every place code's format and block group coverage. Rule 16 no longer fixes the number of automatic cases.
  4. `release.py` refuses when a published layer's place columns need an unpublished boundary layer.
- **Done when:** `pytest` passes, including the census fixture (`census_atlas`).

#### M5B-T4 · Shared filter for four place levels
- [x] Done
- **Write:** `tests/fixtures/filter_cases.json`, `pipeline/filters.py`, `site/js/filters.js`
- **Do:** Place gains `tract_geoid` and `bg_geoid`. A `mun_code` holding several space-separated codes matches any one of them, and never part of one. The map expression pads with spaces (§6.7).
- **Done when:** both suites pass the shared fixture, including its five new place cases.

#### M5B-T5 · Level list and area lists
- [x] Done
- **Write:** `pipeline/catalog.py`
- **Do:** `places.json` becomes `{"version": 2, "levels": [...]}`, and each level's areas go in `places/<level>.json`, sorted by name with numbers in number order (§6.6).
- **Done when:** the catalog tests pass, and `catalog --include-drafts` reports state (1), county (21), municipality (564), tract (2181) and block_group (6599).

#### M5B-T6 · Viewer: Boundary, area lists and Data
- [x] Done
- **Write:** `site/index.html`, `site/css/style.css`, `site/js/places.js` (new, pure), `state.js`, `ui.js`, `map.js`, `main.js`, `text.js`, JS tests
- **Do:**
  1. Boundary section: a Level list, a one-line explanation, then one list per level from county down. Each list offers only areas inside the larger choices, and waits with "Choose a county first" or "Choose a census tract first". Changing a list clears the smaller ones.
  2. Data section: "None: show the boundaries only", then datasets grouped under category headings, and a note with the summary, count and Draft badge.
  3. With no dataset, the map and table show the level's own areas and their filters. With a dataset, the level's areas are outlined in gray, and the chosen area in dark.
  4. Links: `b=<level>&layer=&county=&mun=&tract=&bg=&c=`. Old links naming a boundary layer open that level.
- **Done when:** `npm test` passes, the lint passes, and the G3 manual steps below pass in the browser.

#### M5B-T7 · Gates
- [x] Done (automated gates and agent manual steps; owner sign-off pending)
- **Do:** G1 for `nj_state`, `nj_census_tracts` and `nj_block_groups`; then G3 (with steps 12–17), G4 and G5, recorded in PROGRESS.md.
- **Done when:** every automated check passes and the manual steps are recorded; the owner signs off.

**Exit:** G1 for each new layer, then [G3](GATES.md#g3--filters-are-correct), [G4](GATES.md#g4--downloads-and-links-work) and [G5](GATES.md#g5--a-non-gis-person-can-use-it).

---

## M6 · Publish v1

#### M6-T1 · Human decisions (human)
- [ ] Done. O-1 (MIT) and O-3 (all 9 layers) answered 2026-09-26; O-4 (GitHub repository and Pages) open
- **Human does:**
  1. Answer O-1 (code license), O-3 (license review for each layer to publish; fill `reviewed_by`, `reviewed_on`, `license.name` and `license.url`, then set `status: published`) and O-4 (GitHub repo and Pages).
  2. Enable GitHub Pages with source "Deploy from a branch", branch `gh-pages`, folder `/ (root)`.

#### M6-T2 · Release build
- [x] Done
- **Write:** `tools/release.py`, `docs/RELEASE.md`
- **Do:**
  1. `release.py` clears `site/data/`, then runs `build --all` without drafts, `catalog`, `check`, `lint_text.py` and both test suites.
  2. It writes `site/data/release.json` with the date, the git commit and the layer IDs with their row counts.
  3. It then prepares `build/pages/` as a brand-new git repository holding a copy of `site/` plus an empty `.nojekyll` file, with one commit `NJ-Atlas release <date>`.
  4. It prints the push command for the human: `git -C build/pages push --force <repo-url> HEAD:gh-pages`.
- **Done when:** `.venv\Scripts\python tools/release.py` finishes and prints the command. No push has happened.
- **Don't:** push, force-push, or store credentials.

#### M6-T3 · Deploy (human)
- [ ] Done
- **Human does:** runs the printed push command, then waits for GitHub Pages to publish.

#### M6-T4 · Live check
- [ ] Done
- **Do:** Run gate G6's live checks against the Pages URL and record the results.
- **Done when:** G6 passes.

**Exit:** gate [G6](GATES.md#g6--release-is-live).

---

## M7 · Large layers (optional)

Parcels (3,481,240 records) exceed GitHub Pages limits. They are split into one set of files per municipality (D-025) and served from Cloudflare R2. Building footprints are left out (PARCELS_REVIEW.md). The owner asked to proceed with defaults and review everything at the end (2026-09-26), so O-5 uses the suggested field list until reviewed.

#### M7-T1 · Human decisions (human)
- [ ] Done. O-5 default applied pending review; O-6 open
- **Human does:**
  1. Reviews O-5: which parcel fields may be public (evidence and the applied default in PARCELS_REVIEW.md).
  2. Answers O-6: creates the R2 bucket and its public URL, sets CORS to allow `GET` and `HEAD` from the site origin with the `Range` request header, and puts the URL in `catalog/hosting.json`.

#### M7-T2 · Schema extension for split layers
- [x] Done
- **Write:** DECISIONS.md D-025 to D-028, `catalog/layer.schema.json`, `pipeline/levels.py`, `pipeline/recipes.py`, `pipeline/normalize.py`, `pipeline/partitions.py` (new)
- **Do:**
  1. Recipes gain `partition: {by: "municipality", field, host: "pages" | "r2", selftest}`.
  2. Add the `all_by_district` place mode, which reads the `district_code` field.
  3. Add the `zero_is_blank` and `yymmdd` transforms.
- **Done when:** `validate` and the recipe and partition tests pass.

#### M7-T3 · Per-municipality fetch and build
- [x] Done: 3,481,240 parcels in 564 municipalities, built 2026-09-26
- **Write:** `catalog/layers/nj_parcels.json`, `pipeline/fetch.py`, `build.py`, `outputs.py`, `check.py`, `catalog.py`, `catalog/hosting.json`, `tests/py/test_partitions.py`
- **Do:**
  1. `fetch <id>` downloads each municipality with `(<where>) AND <field> = '<code>'` into `build/raw/<id>/<code>/`, and checks the total against `expected_count`.
  2. `build <id>` (`--jobs N` builds N municipalities at once) writes `site/data/<id>/<code>/<id>_<code>.{parquet,pmtiles,csv}`. It then combines the partitions into the layer's `meta.json` and `partitions.json` (§6.9). `--partition <code>` builds one municipality; `build --all` skips split layers.
  3. `check <id>` runs rules 2–15 on every partition, 16 on the self-test municipality, and 17 on the set.
  4. `catalog` points split layers at `partitions.json`. With `--for-release` it uses `hosting.json`'s R2 URL, or leaves R2 layers out while that is empty.
- **Done when:** G1 passes for every partition, and rule 17 passes.

#### M7-T4 · Viewer for split layers
- [x] Done
- **Do:** Choosing parcels moves the Level to Municipality and asks "Choose a county and a municipality to see parcels." Choosing a municipality loads only its files, and counts read "of N parcels in <municipality> match". Examples keep the municipality. "About this data" offers that municipality's files. `/?selftest` loads the self-test municipality.
- **Done when:** G7 manual steps 4 and 5 pass on the local server.

#### M7-T5 · Upload (human)
- [ ] Done
- **Do:** The agent wrote `tools/r2_manifest.py`, which lists every file and its bucket key in `build/r2_manifest.csv` and prints an upload command. The human uploads with their own credentials; releases never copy R2 layers into GitHub Pages.

**Exit:** gate [G7](GATES.md#g7--large-layers-work).

---

## Studio · S0–S6

NJ Atlas Studio's stages, task cards and gates (GS0–GS5, G-Studio) are in [studio/IMPLEMENTATION_GUIDE.md](studio/IMPLEMENTATION_GUIDE.md) §7–§8, approved by the owner on 2026-09-27. Studio task reports go in PROGRESS.md under "Studio".

| Stage | State (2026-09-27) |
| --- | --- |
| S0 Contracts and trial | Done; GS0 passed (every trial operation within budget) |
| S1 Live layer stack and filters | Done; GS1 passed |
| S2 Copied vector tiles | Built and served locally; publishing waits on the owner's storage (O-6), and releases draw these layers live until then |
| S3 Styling and legend | Done; GS3 passed |
| S4 Buffers and site screening | Done; GS4 passed (the §1.4 known answer matches) |
| S5 Exports and sharing | Done; GS5 automated and in-browser checks passed; printing in three browsers is the owner's check |
| S6 Pilot | Counter code done (S6-T2); recruiting, timed tests and the six-week pilot are the owner's (S6-T1, T3, T4) |

---

## Not scheduled

These need a human decision before they get task cards:

- **Several datasets at once, and bivariate or multivariate maps** (for example, color block groups by population and outline overburdened communities, or cross two variables in one legend). The owner scheduled these for a later stage (D-024); v1 shows one dataset at a time.
- "What's here?": click the map to list the county, the municipality and nearby items from other layers.
- Embeddable map (iframe) and PNG export.
- Shapefile downloads.
- Scheduled data refresh.

AI features of any kind are out of scope permanently (DECISIONS.md D-001).
