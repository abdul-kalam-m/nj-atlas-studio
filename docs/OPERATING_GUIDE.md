# NJ-Atlas operating guide

This guide tells a coding agent (for example Claude Sonnet or Opus) and the human owner how to build NJ-Atlas one small task at a time. Read it fully once. After that, read the sections a task card points to.

Companion documents:

| Document | Use it for |
| --- | --- |
| [MILESTONES.md](MILESTONES.md) | The ordered task list. Work only from here. |
| [GATES.md](GATES.md) | The checks that end each milestone. |
| [LAYER_PLAYBOOK.md](LAYER_PLAYBOOK.md) | The repeatable recipe for adding a data layer. |
| [SOURCES.md](SOURCES.md) | Verified facts about the data sources (URLs, counts, field quirks). |
| [DECISIONS.md](DECISIONS.md) | Decisions already made, and open questions only the human can answer. |
| [PROGRESS.md](PROGRESS.md) | The running log: what is done, gate results, blockers. |

## 1. What NJ-Atlas is

NJ-Atlas is a point-and-click atlas of New Jersey open data, modeled on [Bharatlas](https://github.com/urbanmorph/geodata) for India. A person with no GIS training can:

1. **Pick a boundary level:** State, County, Municipality, Census tract or Block group. With no dataset chosen, the map and table show those areas themselves, with their population and size.
2. **Pick an area:** one list per level appears under it, from county down (county, municipality, census tract, block group). Each list offers only areas inside the larger choice, or "All". The map zooms there.
3. **Choose data:** pick a dataset such as "Preserved open space" from a list grouped by topic (Environment, Hazards, Community). Only items in the chosen area remain, and the level's areas are outlined around them.
4. **Narrow it down:** use checkboxes, a search box and min/max boxes generated from the layer's fields, or click a ready-made example such as "Towns with 50,000 people or more".
5. **See the answer:** "37 of 564 municipalities match", shown on the map and in a table. Clicking an item shows its details.
6. **Take it away:** download the matches as a spreadsheet (CSV), download the whole layer (CSV, GeoJSON, GeoParquet), or copy a link that reopens the same view.

### What NJ-Atlas is not

These are permanent scope limits for the atlas, not "later" items. Do not build them, and do not add hooks or placeholders for them. **NJ Atlas Studio** replaces this list with its own scope ([studio/IMPLEMENTATION_GUIDE.md](studio/IMPLEMENTATION_GUIDE.md) §1.3, DECISIONS.md D-029 to D-045): it adds buffers, drawing and the totals-only export counter. The no-AI rule stands for both.

- **No AI.** No language models, chat boxes, AI SDKs, API keys for AI services, or MCP servers.
- **No server-side code.** No backend API, database or serverless functions. The site is static files.
- **No accounts, uploads or user data.** Nobody logs in, nothing is uploaded, and no analytics or tracking scripts are added.
- **No GIS operations for users.** No buffers, overlays, drawing tools or projections. "Slicing" means filtering by county, municipality, census tract and block group. The build pre-computes those place columns so the browser only compares values.

## 2. Who does what

| Human owner | Executing agent |
| --- | --- |
| Answers open questions in DECISIONS.md | Executes one task card at a time |
| Reviews data licenses and fills `license.reviewed_by` and `reviewed_on` | Never fills in the license review fields |
| Creates accounts (GitHub repo, GitHub Pages, Cloudflare R2) | Never creates accounts or enters credentials |
| Approves and runs deploys | Prepares deploys; runs them only when told to in the chat |
| Signs off each gate in PROGRESS.md | Runs the gate checks and records the evidence |
| Decides whether the agent may commit | Commits only when the human has said commits are allowed |

## 3. How the work is organized

- **Milestones** (M0–M7) deliver something visible. Each milestone ends with a **gate**.
- **Tasks** are small numbered cards inside a milestone (for example `M2-T3`). Each card lists what to read, what to write, the steps, the "Done when" checks and what not to do.
- **Gates** (G0–G7) are pass/fail checklists: automated commands plus manual steps with expected results. A milestone is finished only when its gate passes and the human signs it off.

Work strictly in order: the first unchecked task of the earliest unfinished milestone. Do not start the next milestone before its gate is signed off.

## 4. The work loop (one task per session)

Smaller models do best with a fresh session per task and the files as memory.

1. **Orient.** Read `CLAUDE.md`, the last 30 lines of `docs/PROGRESS.md`, and the task card.
2. **Read only the inputs the card lists.** If you need another file, read it, and note it in your report.
3. **Plan in 3–7 bullet points** before editing: files to touch, functions to add, tests to write.
4. **Write the tests first when the card says "tested".** Pure functions (filters, formatting, CSV, URL state, recipe checks) are always tested.
5. **Implement** the smallest change that satisfies the card.
6. **Run every "Done when" command.** Copy the exact output tail into your report.
7. **Update the tracking files:** tick the card's checkbox in MILESTONES.md, then append a report to PROGRESS.md in this form:

   ```
   ### M1-T3 · Fetch a layer to disk · done · 2026-10-02
   - Changed: pipeline/fetch.py, pipeline/__main__.py, tests/py/test_fetch.py
   - Checks: `python -m pytest tests/py/test_fetch.py` -> 6 passed
   - Assumptions: none
   - Follow-ups: none
   ```

8. **Stop.** Say what was done and what the next task is. Do not continue into the next card unless the human asked for several tasks in one session.

### Task sizing

- A task should touch at most about 3 files and 250 changed lines. If a card turns out bigger, split it into `M3-T4a`/`M3-T4b` in MILESTONES.md, record the split in PROGRESS.md, then do only the first part.
- Do not refactor, rename or "improve" code outside the card. Record ideas as follow-ups instead.
- When a card is ambiguous, choose the simplest reading that satisfies "Done when", and write the assumption in the report.
- Do not delete or weaken a test to make it pass. A failing test means the code or the card is wrong; report it.

### Stop and ask the human

Stop, report and wait when any of these happens:

- The same check fails twice for the same reason.
- A source's record count falls outside the recipe's `expected_count`, or a field named in a recipe does not exist in the source.
- A license or attribution requirement is unclear.
- You would need a new dependency, a schema change, or a change to a rule in this guide.
- The step involves accounts, credentials, deploying, deleting data, rewriting git history or force-pushing.
- The task would add anything listed under "What NJ-Atlas is not".

### Starting a session: prompts the human can paste

- **Next task:** "Read CLAUDE.md and docs/OPERATING_GUIDE.md. Execute the next unchecked task in docs/MILESTONES.md, following the work loop exactly. Stop after that one task."
- **Run a gate:** "Read CLAUDE.md and docs/GATES.md. Run gate G2: run every automated check and walk through every manual check. Record the results in docs/PROGRESS.md. Do not fix anything; report failures."
- **Add a layer:** "Read CLAUDE.md and docs/LAYER_PLAYBOOK.md. Add the layer `<id>` using the facts in docs/SOURCES.md. Stop at the playbook's human-review step."
- **Fix a failure:** "Read CLAUDE.md. The check `<command>` fails with the output below. Find the cause, fix it with the smallest change, rerun the check, and report."

## 5. Architecture

```text
catalog/layers/<id>.json          hand-written recipe: source, fields, labels, filters, examples
        |  python -m pipeline build <id>
        v
build/raw/<id>/source.geojson     raw download + fetch.json receipt           (generated, gitignored)
        |  normalize: keep and rename fields, convert types, add atlas_id, lon/lat, place tags
        v
site/data/<id>/<id>.parquet       GeoParquet, EPSG:4326, snappy: table data + download
site/data/<id>/<id>.pmtiles       map tiles; the tile layer name equals <id>
site/data/<id>/<id>.geojson       download (skipped when larger than 95 MB)
site/data/<id>/<id>.csv           download: spreadsheet without shapes, with lon/lat columns
site/data/<id>/meta.json          counts, value lists, ranges, self-test expectations
        |  python -m pipeline catalog
        v
site/data/catalog.json            the index the viewer reads
site/data/places.json             the boundary levels; places/<level>.json lists each level's areas
        |
        v
site/index.html + site/js/*.js    static viewer: MapLibre + pmtiles + hyparquet, no build step
```

### Repository layout

| Path | Contents | Hand-written or generated |
| --- | --- | --- |
| `catalog/layer.schema.json` | Recipe contract | Hand-written; changes need a decision |
| `catalog/layers/*.json` | One recipe per layer | Hand-written |
| `pipeline/` | Python build package (`python -m pipeline ...`); `pipeline/levels.py` names the boundary layers; `pipeline/partitions.py` handles layers split by municipality | Hand-written |
| `site/index.html`, `site/css/`, `site/js/` | The viewer | Hand-written |
| `site/data/` | Build outputs served by the viewer | Generated, gitignored |
| `build/` | Raw downloads and scratch files | Generated, gitignored |
| `tests/py/`, `tests/js/`, `tests/fixtures/` | pytest tests, `node --test` tests, shared fixtures | Hand-written |
| `tools/` | `serve.py`, `lint_text.py`, `gate.py`, `release.py`, `r2_manifest.py` | Hand-written |
| `seed/` | Source research copied from NJ-Spatial | Read-only reference |
| `docs/` | This guide and its companions | Hand-written |

### Stack (the only allowed dependencies)

| Part | Choice | Version |
| --- | --- | --- |
| Python | CPython | 3.12, 3.13 or 3.14 |
| Python packages | geopandas, pyogrio (bundles GDAL 3.11 with the PMTiles writer), pyarrow, shapely, pyproj, pandas, numpy, jsonschema, pytest | Pinned in `requirements.txt` and `constraints.txt` |
| JS tests | Node's built-in test runner (`node --test`) | Node 22 or newer (needed for glob patterns); no npm packages |
| Map | MapLibre GL JS, ES module only | 6.11.2 |
| Tiles | pmtiles | 4.5.0 |
| Table data in the browser | hyparquet | 1.31.1 |
| Basemap | OpenFreeMap "positron" style (free, no key) | `https://tiles.openfreemap.org/styles/positron` |

Browser libraries load from jsDelivr with exact versions, never `@latest`:

```js
const mapModule = await import('https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.mjs');
const maplibregl = mapModule.default ?? mapModule;
import { Protocol } from 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm';
import { asyncBufferFromUrl, parquetReadObjects } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.31.1/+esm';
```

The MapLibre stylesheet is `https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.css`. Changing any version needs a DECISIONS.md entry.

## 6. Data contracts

### 6.1 Recipes

Every layer is one file, `catalog/layers/<id>.json`, validated by `catalog/layer.schema.json`. [nj_counties.json](../catalog/layers/nj_counties.json) is the reference example. The schema explains every property. Beyond the schema, `python -m pipeline validate` also enforces these rules:

- `id` equals the file name without `.json`.
- Output `name`s are unique, and source field names are unique.
- `label_field` names one of the layer's output fields.
- No output field uses a reserved name: `atlas_id`, `lon`, `lat`, `geometry`, or a place-tag column the layer receives (see 6.2).
- Every example condition names a field whose `filter` matches the condition's `op`: `in` needs checklist, `contains` needs search, `range` needs range.
- `place_tags` is `all` for every copy data layer. A boundary layer uses the mode given for it in 6.2 and defines its own name and code fields (D-023).
- Recipe v2 (Studio, D-030): the access, area, style, buffer and leave-out rules in [studio/IMPLEMENTATION_GUIDE.md](studio/IMPLEMENTATION_GUIDE.md) §4.1. Only `copy` layers are fetched and built.

### 6.2 Standard columns the build adds

| Column | Type | Rule |
| --- | --- | --- |
| `atlas_id` | string | `str(value of source.id_field)`. Must be unique and non-empty, or the build fails. |
| `lon`, `lat` | float, 6 decimals | The item's representative point: the point itself, or a point guaranteed to lie on the line or inside the shape. |
| `county`, `county_fips` | string | "Salem County"; 3 digits, e.g. "033". |
| `municipality`, `mun_code` | string | "Pennsville Township"; 4 digits, e.g. "1709". On census tract and block group rows, every municipality sharing enough area (D-021): names joined with "; ", codes with single spaces, e.g. "0901 2004". |
| `tract`, `tract_geoid` | string | "Census Tract 6001.02"; 11 digits, e.g. "34007600102". |
| `block_group`, `bg_geoid` | string | "Block Group 1"; 12 digits, e.g. "340076001021". |

The boundary levels, largest first, and how each layer gets its place columns. `pipeline/levels.py` holds this table; it is the only code that names layer IDs.

| Level | Layer | Its own fields | `place_tags` | The build adds |
| --- | --- | --- | --- | --- |
| State | `nj_state` | `state` | `none` | nothing |
| County | `nj_counties` | `county`, `county_fips` | `none` | nothing |
| Municipality | `nj_municipalities` | `municipality`, `mun_code` | `county` | the county containing its point |
| Census tract | `nj_census_tracts` | `tract`, `tract_geoid` | `county_overlap` | the county from its own code (characters 3–5), and every municipality sharing at least 5% of the tract's area or of the municipality's (D-021) |
| Block group | `nj_block_groups` | `block_group`, `bg_geoid` | `county_overlap_tract` | as for tracts, plus the tract from its own code (the first 11 characters) |
| (every data layer) | | | `all` | county and municipality from the municipality containing its point; tract and block group from the block group containing its point |

`python -m pipeline build --all` builds in that order. For point matches:

- When a point touches two areas, keep the match with the lowest code.
- A point outside every area takes the nearest one if it lies within 1,000 ft (D-019; mostly beach lots just seaward of shore-town boundaries). meta.json counts the items that needed this in any step as `tagged_by_nearest`.
- Points farther away get empty tags. The viewer calls those "Outside New Jersey municipalities".

### 6.3 Type rules (Python writes, JavaScript reads)

| Recipe type | Stored as | Build step |
| --- | --- | --- |
| text | string | Strip spaces. Empty becomes null. |
| category | string | Strip spaces and apply any `transform`. Numbers become strings, so 5 becomes "5". Empty becomes null. |
| number | float64 | Keep full precision. `decimals` (default 2) applies only to display and CSV, so filters give the same answers as the source (D-018). |
| date | string "YYYY-MM-DD" | ArcGIS returns dates as milliseconds since 1970 (UTC). Convert with `pd.to_datetime(values, unit="ms", utc=True).dt.strftime("%Y-%m-%d")`. Never convert time zones. |

- **Never write int64 columns.** hyparquet returns int64 values as JavaScript `BigInt`, which breaks comparisons and JSON. Numbers are float64, and codes are strings.
- **Never store codes as numbers.** Leading zeros matter: "0503" is not 503.
- **Keep booleans out of the data.** Use category strings such as "Yes" and "No".

### 6.4 Output files and size limits

- **Parquet:** `geopandas.GeoDataFrame.to_parquet(path, compression="snappy", index=False)`. Columns in this order: `atlas_id`, recipe fields, place tags, `lon`, `lat`, `geometry`.
- **PMTiles:** `pyogrio.write_dataframe(gdf, path, layer=<id>, driver="PMTiles", dataset_options={"MINZOOM": ..., "MAXZOOM": ..., "NAME": <title>})`.
  - The `layer=` argument sets the tile layer name. The viewer must use the same name as `source-layer`; a mismatch gives a blank map with no error.
  - Tiles carry only `atlas_id`, the place columns, and the fields with `filter` other than `none` or with `popup: true`.
- **CSV:** UTF-8 with a byte-order mark (`encoding="utf-8-sig"`) so Excel shows accents correctly.
  - Headers are the recipe labels, followed by the layer's place columns ("County", "Municipality", "Census tract", "Census tract code", "Block group", "Block group code"), then "Longitude", "Latitude", "Atlas ID".
  - A value starting with `=`, `+`, `-` or `@` gets a leading `'`, which stops spreadsheet formula injection.
- **GeoJSON:** written by pyogrio. Skip it, and record `"geojson": null` in meta.json, when the file would exceed 95 MB.
- **Limits while hosting on GitHub Pages:** no single file over 95 MB, and all of `site/` under 900 MB. Pages refuses files over 100 MB and sites over 1 GB. Layers that cannot fit wait for M7.

### 6.5 meta.json (one per layer)

```json
{
  "id": "nj_counties",
  "rows": 21,
  "source_count": 21,
  "fetched_at": "2026-10-02T14:03:11Z",
  "bounds": [-75.56, 38.93, -73.89, 41.36],
  "files": {"parquet": {"path": "nj_counties/nj_counties.parquet", "bytes": 91234}, "pmtiles": {"...": "..."}, "csv": {"...": "..."}, "geojson": {"...": "..."}},
  "repaired_shapes": 0,
  "dropped_empty_shapes": 0,
  "place_tag_coverage": null,
  "values": {"region": [{"value": "Central", "count": 5}]},
  "ranges": {"population_2020": {"min": 64837, "max": 955732}},
  "selftest": [{"label": "Coastal counties", "state": {"place": {}, "conditions": []}, "expected": 4}]
}
```

- `values` covers every checklist field, as value/count pairs sorted by value, plus a `{"value": null, "count": n}` entry when blanks exist.
- `ranges` covers every range field.
- `selftest` holds each recipe example plus automatic cases: no filters (expecting `rows`); the `county_fips` of the first row sorted by `atlas_id`; and, when that row has smaller place codes, all of them together ("Area check", using the first code when a row lists several municipalities). Expected counts come from `pipeline/filters.py`.
- `place_tag_coverage` is the share of rows with a `county_fips`, or null for the state, which has no place columns.

### 6.6 catalog.json and places.json

- **`catalog.json`** is written by `python -m pipeline catalog`.
  - Top level: `{"version": 1, "generated_at": ..., "data_base_url": "data/", "categories": [...], "layers": [...]}`.
  - Each layer entry combines its recipe (without `source.where`) and its meta.json.
  - Draft layers are included only with `--include-drafts`, and carry `"status": "draft"` so the viewer can badge them.
- **`places.json`** lists the boundary levels in this catalog, largest first. County and municipality are required.
  - Top level: `{"version": 2, "levels": [{"id": "county", "layer": "nj_counties", "tiles": "nj_counties/nj_counties.pmtiles", "code": "county_fips", "name": "county", "parent": null, "units": "places/county.json", "count": 21}, ...]}`. The state level has only `id`, `layer` and `tiles`.
  - `parent` is the level that must be picked before this level's list shows anything: county for municipalities and tracts, tract for block groups.
- **`places/<level>.json`** lists one level's areas for its picker: `{"code", "name", "bounds"}`, plus `county` (every level below county), `tract` (block groups) and `muns` (tracts and block groups: the codes in their `mun_code`).
  - Sorted by name, with numbers in number order ("Census Tract 9" before "Census Tract 10").
  - The viewer loads the county and municipality lists at start, and the tract (0.3 MB) and block group (1 MB) lists only when those levels are picked.
  - `python -m pipeline catalog` deletes `site/data/places/` first, so a level left out of the catalog leaves no file behind.

### 6.7 Filter state and exact meaning

The same state shape is used by the viewer, share links, recipe examples, self-tests and both filter implementations (`pipeline/filters.py` and `site/js/filters.js`):

```json
{
  "boundary": "municipality",
  "layer": null,
  "place": {"county_fips": "033", "mun_code": null, "tract_geoid": null, "bg_geoid": null},
  "conditions": [
    {"field": "mun_type", "op": "in", "values": ["Township", "Borough"], "include_blank": false},
    {"field": "municipality", "op": "contains", "value": "penn"},
    {"field": "population_2020", "op": "range", "min": 5000, "max": null}
  ]
}
```

`boundary` is the chosen level and `layer` the chosen dataset, or null to show the level's own areas (D-020); filters apply to the layer being shown. Recipe examples and self-tests have no `boundary`.

Rules. Both implementations must follow these exactly; the shared fixture `tests/fixtures/filter_cases.json` proves they agree.

- **Combining:** all conditions and the place combine with AND. A state with no place and no conditions matches every row.
- **Place:** each of `county_fips`, `mun_code`, `tract_geoid` and `bg_geoid` that is set must match the row's column of the same name. A row value matches when it equals the code, or when it is a list of codes separated by single spaces that includes the code; census tract and block group rows list several municipalities (D-021). Part of a code never matches. Null parts are ignored.
- **`in`:** the row value is one of `values` (exact, case-sensitive string match). If `include_blank` is true, a null value also matches.
- **`contains`:** matches when the lower-cased row value contains the lower-cased, trimmed `value`. Null never matches. A value that is empty after trimming is dropped before evaluation.
- **`range`:** `min <= value <= max`, inclusive, and either bound may be null. Null row values never match a range. Dates compare as "YYYY-MM-DD" strings. A range with both bounds null is dropped.

The map uses the same state compiled to a MapLibre expression by `toMapFilter` in `site/js/filters.js`:

| Condition | MapLibre expression |
| --- | --- |
| `in` | `["in", ["get", f], ["literal", values]]`; with `include_blank`: `["any", ["!", ["has", f]], <that>]` |
| `contains` | `["all", ["has", f], ["in", q, ["downcase", ["to-string", ["get", f]]]]]` |
| `range` | `["all", ["has", f], [">=", ["get", f], min], ["<=", ["get", f], max]]`, leaving out missing bounds |
| place | `["==", ["get", "county_fips"], c]`, and likewise for `tract_geoid` and `bg_geoid`; `mun_code` uses `["in", " m ", ["concat", " ", ["get", "mun_code"], " "]]` so a code matches whole inside a list |

The combined expression is `["all", ...]`; an empty state clears the filter with `map.setFilter(layerId, null)`. Tiles leave out null properties, which is why the expressions test `["has", f]`. Counts and tables always come from the Parquet rows, never from the map, because the map only has the tiles currently on screen.

### 6.8 Share links

`location.hash` holds `b=<level>&layer=<id>&county=<fips>&mun=<code>&tract=<code>&bg=<code>&c=<conditions>`:

- `b` is the boundary level. `layer` is the chosen dataset, left out when only boundaries are shown.
- A link naming a boundary layer in `layer` (made before D-020) opens that level with no dataset.
- A place smaller than `b` moves the level down to show it. A level this build lacks is ignored.

- `c` is the conditions array as JSON, UTF-8 encoded, then base64url without padding.
- Unknown layers or fields are ignored with a visible notice; they never cause a crash.
- Encoding and decoding live in `site/js/state.js` and are tested.

### 6.9 Large layers split by municipality (M7)

A recipe with `"partition": {"by": "municipality", "field": "PCL_MUN", "host": "r2", "selftest": "1709"}` is built, checked and served one municipality at a time (D-025).

- **Place columns:** such a layer uses `place_tags: "all_by_district"`. Its `district_code` field (from `partition.field`) gives county and municipality by code; tract and block group come from the point (D-026).
- **Fetch:** `python -m pipeline fetch <id>` downloads each of the 564 municipal codes from the municipalities layer with `(<where>) AND <field> = '<code>'` into `build/raw/<id>/<code>/`, reusing cached ones. It then checks the total against `expected_count`. `--partition <code>` fetches one.
- **Build:** `python -m pipeline build <id> --include-drafts` writes `site/data/<id>/<code>/<id>_<code>.parquet`, `.pmtiles` and `.csv` (no GeoJSON, D-027), plus a `meta.json` per partition. It then writes the layer's `meta.json` and `partitions.json`. `build --all` skips split layers, because the statewide build takes hours. `--jobs 8` builds eight municipalities at once (25 minutes for parcels on a 16-core machine) after confirming every download, one request at a time.
  - Layer `meta.json`: `"partitioned": true`, `"files": null`, `"partitions": {"count", "path", "bytes"}`. It also holds totals and bounds; `values` and `ranges` merged over all partitions; and the self-test municipality's cases, each with `"partition": "<code>"`.
  - `partitions.json`: `{"<code>": {"rows", "bounds", "files": {"parquet", "pmtiles", "csv"}}}`, with paths relative to the data folder.
- **Catalog:** the layer entry has `"partition": {"by", "host", "path", "count", "selftest"}` and `"base_url"`. `base_url` is null locally (files under `data/`); `catalog --for-release` sets it from `catalog/hosting.json`'s `r2_base_url`, or leaves R2 layers out while that is null.
- **Viewer:** choosing the dataset moves the Level to at least Municipality. The count line asks for a municipality until one is chosen; then `partitions.json` and that municipality's files load. Counts read "of N <plural> in <municipality> match".
- **Release:** `tools/release.py` keeps `site/data/<id>/` of R2 layers when it clears the data folder, never copies them into `build/pages`, and leaves them out of the size total. `tools/r2_manifest.py` lists what the owner uploads.

## 7. Fetching data from ArcGIS

`pipeline/arcgis.py` does all network access for the build. Be polite and predictable:

- Send the header `User-Agent: NJ-Atlas/0.1 (open-data atlas build)`.
- Make one request at a time, with at least 0.5 s between requests.
- Allow 60 s per request. Retry up to 3 times, waiting 2 s, 4 s and 8 s, on timeouts and HTTP 5xx only.
- Page by object ID:
  1. `GET <url>?f=json` for the layer's `maxRecordCount`, `supportedQueryFormats` and `fields`.
  2. `GET <url>/query?where=<where>&returnIdsOnly=true&f=json`, then sort the IDs.
  3. Split the IDs into batches of `min(maxRecordCount, 1000)`.
  4. For each batch: `POST <url>/query` with `objectIds=<batch>&outFields=<recipe source fields plus id_field>&outSR=4326&f=geojson`. Use POST because long ID lists overflow URLs.
  5. Check that each page returns exactly its batch's IDs. A missing or extra ID fails the fetch.
- If `supportedQueryFormats` lacks `geoJSON`, request `f=json` (Esri JSON) and read it with pyogrio's `ESRIJSON` driver.
- After fetching, the feature count must equal the ID count and lie within `expected_count`. Otherwise stop and ask.
- Cache the result in `build/raw/<id>/`. Later builds reuse it unless `--refresh` is passed, so ordinary rebuilds make no network calls.
- `fetch.json` records the URL, where clause, count, `maxRecordCount`, the UTC `fetched_at` time, and the SHA-256 of `source.geojson`.

## 8. Viewer rules

Modules in `site/js/`. The pure ones marked * use no browser APIs, import only other pure modules, and are tested with `node --test`.

| Module | Responsibility |
| --- | --- |
| `main.js` | Startup: load catalog.json, places.json and the area lists; `setState()` keeps pickers, map, count, table and link in step; restore state from the URL |
| `text.js` * | Every user-facing string, as one exported object |
| `filters.js` * | `toPredicate(state)`, `toMapFilter(state)`, `describe(state, fields, text)`, `cleanState(state, fields)` |
| `state.js` * | `emptyState(boundary, layerId)`, `encodeHash(state)`, `decodeHash(hash, catalog, levels)` |
| `places.js` * | Boundary levels and area pickers: which pickers show, what each lists (`unitsFor`), clearing smaller choices (`choose`), the layer being shown |
| `csv.js` * | `toCsv(rows, columns)` with quoting, a byte-order mark, CRLF line endings and the formula guard |
| `format.js` * | Number, unit and date formatting with `Intl` |
| `map.js` | MapLibre setup, the pmtiles protocol, show/hide layer, style by geometry, boundary outlines, place highlight, popups |
| `data.js` | Loading Parquet rows with hyparquet (without the geometry column), cached per layer |
| `ui.js` | Building the panels, filter controls, results table and dialogs from catalog entries |

- **Security:** never assign data values to `innerHTML`. Create elements and set `textContent`. Links from the catalog open with `rel="noopener"`.
- **Accessibility:** every control has a visible label. Everything works by keyboard, with a visible focus ring. The results table is a real `<table>`, so the map is never the only way to reach an item.
- **Plain language:** strings live only in `text.js`, and `tools/lint_text.py` rejects GIS jargon there (see [GATES.md](GATES.md#g2--the-viewer-shows-layers)).
- **Panel order (D-020):** Boundary (the Level list, then one area list per level from county down), Data (a list grouped by category; "None: show the boundaries only" shows the level's own areas), Narrow it down, Results. The first screen is Level County with no dataset. Changing a larger area clears the smaller ones.
- **Map styles:** polygons use fill opacity 0.35 plus a 1 px outline in the default style's `color`; points use circles of radius 4; lines use width 1.5.
  - Below a layer's `tiles.min_zoom`, show the text "Zoom in to see <plural>".
  - With a dataset chosen, the level's areas inside the larger choices get 0.8 px gray outlines.
  - The chosen area gets a 2.5 px dark outline.
  - Drawing order, bottom to top: data, gray outlines, the chosen area's outline, basemap labels. Points stay on top.
- **Performance budgets on the local server:**
  - The first screen (counties) transfers under 2 MB, not counting the basemap.
  - Choosing a layer shows it within 3 seconds.
  - Changing a filter updates the count within 300 ms for layers up to 100,000 rows.

## 9. Testing rules

- `python -m pytest -m "not network"` must pass offline. Tests that touch the internet are marked `@pytest.mark.network` and never run in CI.
- `npm test` runs `node --test tests/js/*.test.js` (Node expands the glob itself, so it works in Windows `cmd` too). `package.json` holds `{"private": true, "type": "module", "scripts": {"test": "node --test tests/js/*.test.js"}}` and no dependencies.
- `tests/fixtures/filter_cases.json` is read by both `tests/py/test_filters.py` and `tests/js/filters.test.js`, so the two filter implementations cannot drift apart.
- Network code takes an injectable `get_json` or `post_json` function so it can be tested with canned responses.

## 10. Git rules

- One branch per milestone, e.g. `m1-boundaries`. The human merges.
- Commit messages: `M1-T3: fetch a layer to disk`.
- Never commit `build/`, `site/data/`, `.venv/`, `node_modules/` or `.env`. `.gitignore` covers them; don't override it.
- Never force-push, rewrite history or delete branches.

## 11. Command cheat sheet

Windows paths are shown; on macOS or Linux use `.venv/bin/python`.

```text
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt -c constraints.txt
.venv\Scripts\python -m pipeline validate                     # recipes only, offline
.venv\Scripts\python -m pipeline inspect <arcgis layer url>   # look before writing a recipe
.venv\Scripts\python -m pipeline build nj_counties --include-drafts
.venv\Scripts\python -m pipeline build --all --include-drafts
.venv\Scripts\python -m pipeline catalog --include-drafts
.venv\Scripts\python -m pipeline check [<id>]
.venv\Scripts\python tools\serve.py                           # http://127.0.0.1:8080
.venv\Scripts\python tools\lint_text.py
.venv\Scripts\python tools\gate.py G1
.venv\Scripts\python -m pytest -m "not network"
npm test
```

Viewer modes: open `http://127.0.0.1:8080/` normally, `http://127.0.0.1:8080/?selftest` to run every self-test, or `http://127.0.0.1:8080/?debug` to expose the app object as `window.atlas` in the console. Gate checks use it to count what the map draws.

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Map is blank but has no errors | `source-layer` differs from the tile layer name | Build writes `layer=<id>`; map uses `"source-layer": id` |
| PMTiles or Parquet fail to load locally | Server ignores `Range` requests | Use `tools/serve.py`; `python -m http.server` does not support Range |
| `TypeError: Cannot mix BigInt` in the browser | An int64 column reached Parquet | Cast numbers to float64 in the build (6.3) |
| County codes like "1" or "5" | Used `FIPSCO` instead of `FIPSSTCO` | Use `FIPSSTCO` with `transform: last3` (see SOURCES.md) |
| Municipality county looks wrong | Used the first two digits of `MUN_CODE` as FIPS | They are NJ's own county numbers; use place tags |
| Items missing at low zoom | Tile size limits drop items | Raise `tiles.min_zoom` for dense layers; show the "Zoom in" hint |
| Fetch fails with missing IDs | The service changed mid-fetch, or a page was truncated | Rerun with `--refresh`; stop and ask if it repeats |
| Count in viewer differs from self-test | Python and JS filter rules drifted | Add the failing case to `filter_cases.json` and fix whichever side is wrong |
| Accents garbled in Excel | CSV written without a byte-order mark | Use `utf-8-sig` in Python; `csv.js` prepends `﻿` |
