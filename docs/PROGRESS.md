# Progress

Agents append to the end of each section; they never rewrite earlier entries. The human signs off gates here.

## Status

| Milestone | State | Gate | Signed off |
| --- | --- | --- | --- |
| M0 Workspace | Done; G0 passed 2026-09-25 | G0 | Signed off 2026-09-25 (owner, in chat) |
| M1 Boundary data | Done; G1 passed for both layers 2026-09-25 | G1 | Signed off 2026-09-25 (owner, in chat) |
| M2 Viewer | Done; G2 passed 2026-09-25 | G2 | Signed off 2026-09-25 (owner, in chat) |
| M3 Filter and slice | Done; G3 passed 2026-09-25 (step 11 applies after M4) | G3 | Signed off 2026-09-25 (owner, in chat) |
| M4 More layers | Done; G1 passed for 4 layers, G3 re-run passed 2026-09-25 | G1 per layer, G3 | Signed off 2026-09-26 (owner, in chat) |
| M5 Downloads and plain language | Done; G4 passed; G5 passed except the trial with a real non-GIS person | G4, G5 | Signed off 2026-09-26 (owner, in chat) |
| M5B Boundary and data filters | Done; G1 passed for 3 new layers, G3/G4/G5 re-run passed 2026-09-25 (G5 trial with a real person still open); D-021 to D-023 approved | G1, G3, G4, G5 | Signed off 2026-09-26 (owner, in chat) |
| M6 Publish v1 | Published 2026-09-27 at the owner's instruction (D-047): https://abdul-kalam-m.github.io/nj-atlas-studio/ (Studio) and /atlas/ (the atlas), from https://github.com/abdul-kalam-m/nj-atlas-studio. Live checks passed | G6 | |
| M7 Large layers (optional) | Built locally: 3,481,240 parcels in 564 municipalities; G7 automated and manual steps 2-6 passed 2026-09-26. **Parked by D-031 (2026-09-27):** parcels are live in Studio v1; the code, tests and local build are kept, nothing is published | G7 | |
| Studio S0-S5 (NJ Atlas Studio) | Built 2026-09-27: 35 layers (7 copy, 5 hybrid, 23 live), styles, buffers and site screening, print, PNG, link, map file, embed, clipped data. GS0-GS4 passed; GS5 passed except printing in Edge and Firefox (the owner's check). Map copies wait on the owner's storage (O-6) | GS0-GS5 | |
| Studio S6 Pilot | Export counter code done (S6-T2), not deployed; recruiting, timed tests and the pilot are the owner's | G-Studio | |

## Blockers

Open questions waiting on the human. Remove an entry only when the human answers it.

The owner asked on 2026-09-26 for all reviews at the end. Everything below waits for them:

1. ~~**M6 publish**~~: done 2026-09-27 (D-047).
2. **M7 reviews** (parked by D-031, approved 2026-09-27; needed only if parcels are ever copied): D-025 (split by municipality), D-026 (parcels tagged by tax district), D-027 (no GeoJSON for split layers), D-028 (`zero_is_blank`, `yymmdd`); O-5 (the parcel fields applied by default, PARCELS_REVIEW.md); the parcels license (O-3); sign-off of the G7 entry.
3. **M7 hosting** (parked by D-031): O-6 (Cloudflare R2 bucket, public URL, CORS), then the upload printed by `tools/r2_manifest.py` (1,693 files, 3.18 GB), then `r2_base_url` in `catalog/hosting.json`. G7 step 1 runs after that.
4. **Studio licenses (O-3):** the owner reviews each curated layer's license (CATALOG.md "License") before it is published. The three live recipes keep their reviewed licenses; nj_parcels stays a draft.
5. **Atlas release contents:** `build/pages` (prepared 2026-09-26) still carries contaminated sites and overburdened communities as copies. Under D-030 they are live, so the next `tools/release.py` run would leave them out of the atlas until Studio's live client exists (S1). Pushing the prepared release as it is remains possible.
6. **Studio review (all at the end, as the owner asked):** decisions D-046 to D-066, taken while building; the licenses applied at the owner's instruction (LICENSE_REVIEW.md "Studio layers"); the public repository and Pages site (D-047).
7. **Studio hosting (owner's account):** a bucket for the five map copies (O-6; `tools/publish_tiles.py` lists the files) and the export counter (workers/counter/README.md).

## Gate log

Template:

```
### G1 · nj_counties · 2026-10-03 · commit abc1234
- Automated: `python tools/gate.py G1 --layer nj_counties` -> GATE G1: PASS
  (paste the last 15 lines)
- Manual: 1 PASS, 2 PASS, 3 PASS (21 / 10 / 4), 4 PASS
- Failures: none
- Signed off: (human writes "Signed off <name> <date>")
```

### G0 · 2026-09-25 · commit: none (working tree not yet committed)
- Automated: `python tools/gate.py G0` -> PASS (PMTiles driver rw; validate OK nj_counties; pytest 23 passed; npm test 1 passed) -> GATE G0: PASS
- Manual: 1 PASS (serve.py printed its address and answered 404 before site/ existed); 2 PASS (ci.yml has no deploy steps or secrets; CI written, not yet run, because there is no GitHub repository)
- Failures: none
- Signed off: owner, in chat, 2026-09-25

### G1 · nj_counties · 2026-09-25 · commit: none
- Automated: `python tools/gate.py G1 --layer nj_counties` -> GATE G1: PASS. `pipeline check`: rules 1-15 PASS, rule 16 SKIP (self-tests arrive in M3)
- Manual: 1 PASS (FIPSSTCO 34031, 34021, 34007 match the live source); 3 PASS (21 rows, 10 with 500,000+ people, 4 Coastal); 4 PASS (21 CSV rows, no nan/None cells). Atlantic County: 274,534 people, 610.6 sq mi, county_fips 001
- Failures: none
- Signed off: owner, in chat, 2026-09-25

### G1 · nj_municipalities · 2026-09-25 · commit: none
- Automated: `python tools/gate.py G1 --layer nj_municipalities` -> GATE G1: PASS (rules 1-15 PASS, rule 16 SKIP until M3)
- Manual: 1 PASS (MUN_CODE 1533, 1201, 0811 match the live source); 2 PASS: printed `564 37 15 239`. Salem County's 15 comes from spatial place tags and agrees with the source's own COUNTY field; 4 PASS (564 CSV rows, no nan/None cells)
- Failures: none
- Signed off: owner, in chat, 2026-09-25

### G2 · 2026-09-25 · commit: none
- Automated: `python tools/gate.py G2` -> check PASS, lint PASS, pytest 66 passed, npm test PASS -> GATE G2: PASS
- Manual (built-in browser, local server):
  1 PASS: no console errors; first screen 0.52 MB excluding the basemap.
  2 PASS: Boundaries lists Counties (21) and Municipalities (564) with Draft badges.
  3 PASS: 21 shapes drawn; attribution shows NJOGIS.
  4 PASS: Atlantic County popup shows 274,534 and 610.6 sq mi; the county code is hidden.
  5 PASS: the About dialog shows everything listed.
  6 PASS: all 3 download links return HTTP 200 at their stated sizes.
  7 PASS: switching layers leaves only the municipalities source; 564 drawn.
  8 PASS: "Zoom in to see municipalities" appears below min zoom.
  9 PASS: Tab and Enter select cards.
  10 PASS: 375 px wide, no sideways scroll, map above panel.
- Failures: none
- Signed off: owner, in chat, 2026-09-25

### G3 · 2026-09-25 · commit: none
- Automated: `python tools/gate.py G3` -> build --all, catalog, check (rules 1-16 PASS on both layers, including self-tests), pytest 106 passed, npm test 42 passed, lint PASS -> GATE G3: PASS
- Manual (built-in browser, local server, real clicks and typing):
  1 PASS: `/?selftest` shows 9/9 PASS and SELFTEST: PASS; hyparquet + JS counts equal the Python counts.
  2 PASS: "564 of 564 municipalities match", table loads 113 ms after the click.
  3 PASS: Salem County gives 15; the map zooms to Salem and outlines it from the county tiles filtered to 033.
  4 PASS: plus Township gives 11; the table lists the 11 townships alphabetically.
  5 PASS: population minimum 50000 gives 37; plus Township gives 20.
  6 PASS: "penn" and "PENN" both give 4 (Pennington, Penns Grove, Pennsauken, Pennsville).
  7 PASS: clicking the Pennsville Township row flies to it at zoom 12 and outlines it.
  8 PASS: the copied link, opened in a new tab, restores the layer, checkbox, minimum and "20 of 564".
  9 PASS: Counties: Coastal gives 4; after clearing, 500,000 people or more gives 10; the municipality picker is hidden.
  10 PASS: all 5 "Try:" buttons equal their self-test counts.
  11 N/A until M4 layers exist. The map draws exactly the 11 matching Salem townships (drawn IDs equal table IDs).
- Failures: none
- Signed off: owner, in chat, 2026-09-25

### G1 · nj_contaminated_sites, nj_overburdened_communities, nj_trails, nj_preserved_open_space · 2026-09-25 · commit: none
- Automated: `python tools/gate.py G1 --layer <id>` gave GATE G1: PASS for the three smaller layers. Open space's 16 rules pass inside `pipeline check` during the G3 run (its build takes about 8 minutes, so it wasn't run a second time).
- Manual: spot checks against server-side counts (see the M4 task reports): Superfund 115=115, active in Camden 440=440, Pennsville 15=15, three EJ criteria 122=122, Camden EJ 180=180, low-income at least 50% 731=731 after D-018, easy trails 300=300, accessible trails 1,712=1,712. CSVs open with labelled headers.
- Failures: open space was first at 98.93% place coverage, fixed by D-019 (owner-approved); low-income was 732 against 731, fixed by D-018
- Signed off: owner, in chat, 2026-09-26

### G3 (re-run after M4) · 2026-09-25 · commit: none
- Automated: `python tools/gate.py G3` -> build --all, catalog, check (6 layers x 16 rules), pytest 113 passed, npm test 47 passed, lint -> GATE G3: PASS
- Manual: step 1 PASS, with `/?selftest` giving 29/29 PASS across 6 layers. Step 11 PASS: the new layers' examples pass the self-test and the checklist counts add up to each layer's total (blank included). The map draws only matches for trails (lines, Morris County) and sites (points, Camden active); a row click flies and outlines.
- Failures: none
- Signed off: owner, in chat, 2026-09-26

### G4 · 2026-09-25 · commit: none
- Automated: GATE G4: PASS
- Manual: 1 PASS (municipalities CSV has 564 rows with labelled headers); 2 PASS (GeoParquet 564, GeoJSON 564; open space correctly offers no GeoJSON); 3 PASS (Salem plus Township CSV named `nj_municipalities_salem-county_2026-09-25.csv`, 11 rows, BOM, CRLF); 4 PASS through the fallback (the clipboard is blocked in the tool, and the link was shown selected); 5 PASS (a missing field gives a notice and the valid filter still applies; an unknown layer gives a notice)
- Failures: none
- Signed off: owner, in chat, 2026-09-26

### G5 · 2026-09-25 · commit: none
- Automated: GATE G5: PASS (lint)
- Manual, walked by the agent using only on-screen controls:
  1 PASS: Salem County townships = 11 in 3 choices.
  2 PASS: the example button then download gives a 37-row CSV.
  3 PASS: Pennsville's contaminated sites = 15 through the Where panel only.
  4 PASS: the share link reproduces the view, including at 375 px.
  5 PASS: Cape May open space over 100 acres = 163; clicking Beaver Swamp (311 acres) shows it.
  6 PASS: 375 px, no sideways scroll, all controls at least 40 px after the fix.
  7 PASS: keyboard only (Enter, letter and arrow keys, Space).
  8 PASS: "No … match. Remove a filter to see more." and "Try again" states.
- **Not done:** the gate asks for a person with no GIS background to try steps 1-5 before M6. Only the owner can arrange that.
- Signed off: owner, in chat, 2026-09-26

### G1 · nj_state, nj_census_tracts, nj_block_groups · 2026-09-25 · commit: none (M5B)
- Automated: `python tools/gate.py G1 --layer <id>` for each -> GATE G1: PASS three times. `pipeline check` passes every rule for all 9 layers (rule 10 SKIP for the state, which has no place columns).
- Manual: 1 PASS. Three random tracts (34021004502, 34017006102, 34035052604) and three block groups (340155011011, 340390388003, 340297113003) match TIGERweb on name, population, housing units and land area. The state matches NJOGIS (8,671.09 sq mi). 4 PASS: CSVs have 1, 2,181 and 6,599 rows with no nan/None cells.
- Known answers (all equal to the live sources): tracts 2,181 with population 9,288,994; 19 tracts with 8,000+ people; 6 with nobody; 211 in Essex (TIGER `COUNTY='013'` also 211); 94 block groups with 3,000+ people. Contaminated sites in tract 34007610300 = 44, and in block group 340076103001 = 26; NJDEP's service gives the same counts for the same shapes.
- Failures: none
- Signed off: owner, in chat, 2026-09-26

### G3 re-run, G4, G5 · 2026-09-25 · commit: none (after M5B)
- Automated: `python tools/gate.py G3` -> build --all, catalog, check, pytest (128 passed), npm test (60 passed), lint -> GATE G3: PASS; G4 -> PASS; G5 (lint) -> PASS
- G3 manual (built-in browser): 1 PASS (`/?selftest` 46/46). Steps 2-9 PASS under the new panel: 564; Salem 15; Township 11; 37, then 20; "penn" 4; Coastal 4. 10 PASS (examples: Newark tracts 88, Cape May open space over 100 acres 163). 12 PASS (2,181; "Choose a county first"). 13 PASS (88 Newark tracts in the list, table and map). 14 PASS (block group list waits for a tract, then lists 4). 15 PASS (44 sites; gray tract outlines plus the dark chosen tract). 16 PASS (dataset keeps the area; Level up to County drops municipality and tract). 17 PASS (old link opens 15 municipalities, no notice).
- G4 manual: 3 PASS (built in the page: a dataset's matches file has 44 rows with County, Municipality, Census tract, Census tract code, Block group and Block group code; name `nj_contaminated_sites_census-tract-6103_<date>.csv`). Steps 1, 2, 4 and 5 are unchanged from the earlier run.
- G5 manual: 7 PASS (375 px, no sideways scroll). Steps 1-6 still need the trial with a real non-GIS person (owner).
- Failures: none
- Signed off: owner, in chat, 2026-09-26

### G7 · nj_parcels · 2026-09-26 · commit: none (M7)
- Automated: `pipeline check nj_parcels` -> rules 1-17 PASS on all 564 partitions (CHECK: PASS, 1 min 44 s). pytest 140 passed, npm test 61 passed, `tools/r2_manifest.py` lists 1,693 files, 3.18 GB.
- Manual: 1 waits for O-6 (no R2 bucket yet). 2 PASS: Jersey City (0906) 59,011, Toms River (1508) 53,490 and Pennsville (1709) 6,559 rows, each equal to the source's `returnCountOnly` for `PCL_MUN = '<code>'`. 3 PASS: no excluded field (owner name, mailing address, ZIP) in any partition's Parquet, CSV header or tiles. 4 PASS: parcels at Level County move to Municipality and ask for one; Pennsville loads only `partitions.json` and its own file; Jersey City loads 59,011 parcels in 2.6 s and a filter updates in 133 ms. 5 PASS: `/?selftest` 52/52. 6 PASS: the rehearsal keeps parcels in site/data but leaves them out of `build/pages`, the catalog and the 363 MB size total.
- Failures: none
- Signed off:

## Task reports

Template (from OPERATING_GUIDE.md §4):

```
### M1-T3 · Fetch a layer to disk · done · 2026-10-02
- Changed: pipeline/fetch.py, pipeline/__main__.py, tests/py/test_fetch.py
- Checks: `python -m pytest tests/py/test_fetch.py` -> 6 passed
- Assumptions: none
- Follow-ups: none
```

### Setup · fork created · 2026-09-24
- Created the NJ-Atlas folder from NJ-Spatial commit f1d4197 with seed data, the recipe schema, the reference `nj_counties` recipe and these docs. See FORK.md.
- Checks: the reference recipe validates against `catalog/layer.schema.json`; the schema rejects publishing without review, mismatched filter types, unknown operators, bad county codes and bad IDs.
- Next: M0-T1.

### M0-T1 · Skeleton and environment · done · 2026-09-25
- Changed: package.json, pytest.ini, pipeline/__init__.py, pipeline/__main__.py, tests/py/test_cli.py, tests/js/smoke.test.js
- Checks: PMTiles driver `rw` (GDAL 3.11.4, Python 3.12.10 venv); pytest passed; `npm test` 1 passed
- Assumptions: **Guide correction.** `node --test tests/js/` fails on Node 22+, which treats the folder as a single file. package.json now runs `node --test tests/js/*.test.js`. OPERATING_GUIDE §5 and §9 were updated, and the minimum is now Node 22.
- Follow-ups: none

### M0-T2 · Dev server with Range support · done · 2026-09-25
- Changed: tools/serve.py, tools/__init__.py, tests/py/test_serve.py
- Checks: `pytest tests/py/test_serve.py` -> 8 passed (206 start-end, open end, suffix, 416, HEAD, CORS/no-store, index with query string, path escapes -> 404)
- Assumptions: also supports suffix ranges (`bytes=-N`) and exposes Content-Range to scripts
- Follow-ups: none

### M0-T3 · Recipe validation · done · 2026-09-25
- Changed: pipeline/recipes.py, pipeline/__main__.py (validate), tests/py/test_recipes.py, tests/fixtures/recipes/ (6 bad fixtures generated from nj_counties)
- Checks: `python -m pipeline validate` -> OK nj_counties; recipe tests pass; each bad fixture is rejected for its own reason
- Assumptions: two extra rules. A `place_tags: none` layer must define county_fips, and range bounds must match the field type.
- Follow-ups: none

### M0-T4 · Gate runner · done · 2026-09-25
- Changed: tools/gate.py, tests/py/test_gate.py
- Checks: tests pass; `python tools/gate.py G0` -> GATE G0: PASS
- Assumptions: commands run as argument lists (no shell), so paths with spaces work on Windows
- Follow-ups: none

### M0-T5 · Continuous integration · done · 2026-09-25
- Changed: .github/workflows/ci.yml
- Checks: CI written, not yet run (no GitHub repository yet; G6 needs a green run)
- Assumptions: the lint step runs normally rather than with continue-on-error, because M2 created the lint in the same session
- Follow-ups: none

### M1-T1 · ArcGIS client · done · 2026-09-25
- Changed: pipeline/arcgis.py, tests/py/test_arcgis.py, tests/fixtures/arcgis/
- Checks: 9 passed offline (batching, incomplete page, 503 retry, 400 no retry, give-up after 3 retries, ArcGIS error bodies, Esri JSON fallback through GDAL)
- Assumptions: ArcGIS "HTTP 200 with an error body" is treated like the matching HTTP status
- Follow-ups: none

### M1-T2 · Inspect command · done · 2026-09-25
- Changed: pipeline/inspect.py, pipeline/__main__.py
- Checks: live inspect of Counties shows count 21, maxRecordCount 1000, formats with geoJSON, EPSG:3424, and REGION = CENTRAL, COASTAL, NORTHEASTERN, NORTHWESTERN, SOUTHERN
- Assumptions: flags coded-value domains with "stop and ask", as the playbook requires
- Follow-ups: none

### M1-T3 · Fetch command · done · 2026-09-25
- Changed: pipeline/fetch.py, pipeline/__main__.py, tests/py/test_fetch.py
- Checks: 4 tests pass; live fetch of nj_counties wrote 21 records, and a second run printed "using cached download"
- Assumptions: the count and field checks run before downloading, so nothing is written when they fail
- Follow-ups: none

### M1-T4 · Normalize · done · 2026-09-25
- Changed: pipeline/normalize.py, tests/py/test_normalize.py
- Checks: 9 tests pass (all transforms, UTC dates, float64, empty to null, duplicate IDs, repair plus empty drop, column order)
- Assumptions: text and category columns use pandas' nullable "string" dtype, so all-empty columns still write as Parquet strings
- Follow-ups: none

### M1-T5 · Place tags · done · 2026-09-25
- Changed: pipeline/places.py, tests/py/test_places.py
- Checks: 3 tests pass (inside, shared edge gets the lower code, outside is null; county mode; none mode)
- Assumptions: the signature is `tag_places(frame, mode, boundary)`, with `load_boundary(root, mode)` picking the right boundary layer, instead of the card's two boundary arguments
- Follow-ups: none

### M1-T6 · Outputs and the build command · done · 2026-09-25
- Changed: pipeline/outputs.py, pipeline/build.py, pipeline/__main__.py, tests/py/test_outputs.py
- Checks: 5 tests pass (files, meta, PMTiles layer name and fields, no int64, CSV BOM, header and formula guard); live build of nj_counties gave 21 rows and 4 files
- Assumptions: GeoJSON is written with RFC 7946 and 6-decimal coordinates; tiles also carry county and municipality names for popups
- Follow-ups: none

### M1-T7 · Municipalities recipe · done · 2026-09-25
- Changed: catalog/layers/nj_municipalities.json
- Checks: validate OK; build gave 564 rows
- Assumptions: added a third example, "Townships in Salem County" (expected 11), which also exercises the place picker
- Follow-ups: none

### M1-T8 · Catalog command · done · 2026-09-25
- Changed: pipeline/catalog.py, pipeline/__main__.py, tests/py/test_catalog.py, tests/py/conftest.py
- Checks: 5 tests pass; live run gave 2 layers, 21 counties and 564 municipalities
- Assumptions: catalog entries also carry `table_columns` and `csv_columns`, so the viewer never re-derives column rules; places.json carries the boundary tile paths
- Follow-ups: none

### M1-T9 · Check command · done · 2026-09-25
- Changed: pipeline/check.py, pipeline/__main__.py, tests/py/test_check.py
- Checks: 8 tests pass, breaking rules 2, 3, 5, 6, 8, 11 and 15 one at a time; live check passes both layers
- Assumptions: **Bug found and fixed.** Rule results were numpy booleans, so the `is not False` test would have counted failures as passes. Results are now coerced to bool, and a test covers it (rule 8 plus the overall result).
- Follow-ups: none

### M2-T1 · Page layout · done · 2026-09-25
- Changed: site/index.html, site/css/style.css
- Checks: layout serves with no console errors; checked at desktop and 375 px widths
- Assumptions: the page has no visible text of its own; `data-text` attributes pull every string from text.js
- Follow-ups: none

### M2-T2 · Text and plain-language lint · done · 2026-09-25
- Changed: site/js/text.js, tools/lint_text.py, tests/py/test_lint_text.py
- Checks: LINT: PASS; tests prove a banned word, a banned word in a template string, `@latest`, unpinned and non-jsDelivr imports all fail, while whole-word matching and the basemap URL pass
- Assumptions: none
- Follow-ups: none

### M2-T3 · Formatting helpers · done · 2026-09-25
- Changed: site/js/format.js, tests/js/format.test.js
- Checks: `npm test` passes (numbers, dates without day shift, units, missing values, sizes)
- Assumptions: none
- Follow-ups: none

### M2-T4 · Layer picker · done · 2026-09-25
- Changed: site/js/main.js, site/js/ui.js
- Checks: both layers under "Boundaries"; keyboard selectable
- Assumptions: cards render as soon as catalog.json arrives, and a selection waits for the map, because waiting for the basemap first delayed the list by several seconds
- Follow-ups: none

### M2-T5 · Map · done · 2026-09-25
- Changed: site/js/map.js
- Checks: counties (21) and municipalities (564) draw; switching leaves no leftovers; zoom hint works; MapLibre 6.11.2 ES-module build and its worker load from jsDelivr
- Assumptions: data layers are inserted under the basemap's labels so place names stay readable; a `?debug` switch exposes the app object in the console for gate checks
- Follow-ups: none

### M2-T6 · Popups and "About this data" · done · 2026-09-25
- Changed: site/js/map.js, site/js/ui.js, site/js/text.js
- Checks: G2 steps 4-6 pass
- Assumptions: the "Source service" link text was changed to "Open the original data service", because "More about this data" described a different link
- Follow-ups: none

### M3-T1 · Shared filter cases and the Python filter · done · 2026-09-25
- Changed: tests/fixtures/filter_cases.json (12 rows, 29 cases, 12 with map expressions), pipeline/filters.py, tests/py/test_filters.py
- Checks: 31 passed; the hand-computed expected IDs matched on the first run
- Assumptions: the fixture carries its own field definitions, so both sides clean conditions the same way (unknown fields, a wrong operator for a field's filter, and fields without filters are dropped; number text becomes numbers)
- Follow-ups: none

### M3-T2 · JavaScript predicate · done · 2026-09-25
- Changed: site/js/filters.js (cleanState, toPredicate), tests/js/filters.test.js
- Checks: all 29 shared cases pass, reading the same fixture file
- Assumptions: none
- Follow-ups: none

### M3-T3 · Map filter and description · done · 2026-09-25
- Changed: site/js/filters.js (toMapFilter, describe), tests/js/filters.test.js
- Checks: all 12 map-filter expectations equal the §6.7 expressions exactly; describe phrases tested
- Assumptions: describe returns {kind, index, phrase} items so each chip knows what to remove; number formatting is passed in, which keeps filters.js import-free
- Follow-ups: none

### M3-T4 · Table data in the browser · done · 2026-09-25
- Changed: site/js/data.js
- Checks: municipalities' 564 rows load in about 110 ms locally
- Assumptions: the byte length comes from the catalog (skipping a HEAD request); rows are sorted by the label field once at load, so filtered results never re-sort; a failed load is removed from the cache so "Try again" works
- Follow-ups: none

### M3-T5 · Filter controls · done · 2026-09-25
- Changed: site/js/ui.js, site/js/main.js
- Checks: G3 steps 2-6 give the known answers
- Assumptions: controls are read back from the page on each change (search waits 250 ms, number boxes 400 ms, checkboxes update immediately); range placeholders show each field's real minimum and maximum
- Follow-ups: the accessibility pass (M5-T5) should confirm screen readers announce checkbox labels. The browser tool's tree showed their values, although each checkbox has a proper `<label for>`.

### M3-T6 · Place picker · done · 2026-09-25
- Changed: site/js/ui.js, site/js/map.js, site/js/main.js
- Checks: Salem County gives "15 of 564"; zoom and outline verified
- Assumptions: the chosen place carries over when switching layers (except the municipality on the counties layer). A link with only a municipality fills in its county.
- Follow-ups: none

### M3-T7 · Results table and active filters · done · 2026-09-25
- Changed: site/js/ui.js
- Checks: G3 steps 4 and 7 pass
- Assumptions: rows have no per-item bounds, so a row click on a shape flies to its representative point at zoom 12 (points use 14) instead of fitting its outline. The clicked item is outlined through a selection layer.
- Follow-ups: none

### M3-T8 · Share links · done · 2026-09-25
- Changed: site/js/state.js, tests/js/state.test.js, site/js/main.js
- Checks: round-trip, empty, unknown layer, unknown field, broken link and malformed code tests pass; G3 step 8 passes
- Assumptions: the hash is written with replaceState only when it changes; hashchange applies links pasted into an open tab
- Follow-ups: none

### M3-T9 · Examples and self-test · done · 2026-09-25
- Changed: pipeline/outputs.py (selftest_cases), pipeline/check.py (rule 16 now required), site/js/ui.js (Try: buttons), site/js/selftest.js, site/js/main.js, tests
- Checks: meta.json self-tests are 10, 4, 21, 1 (counties) and 37, 239, 11, 564, 23 (municipalities); `/?selftest` gives SELFTEST: PASS; a test proves an empty self-test list fails rule 16
- Assumptions: **Design fix found in testing.** Table data loaded only after the map finished, so a slow basemap left "Loading…" on screen. The map and the table now load independently.
- Follow-ups: none

### Owner decisions · 2026-09-25
- O-2 answered: overburdened communities and trails. O-8 answered: show all open space, with Green Acres status as a filter.
- D-017 approved in chat: `value_labels` turn coded values into words (trails store Y/N/U).
- D-018 (agent correctness fix, recorded for the owner): numbers keep full precision and `decimals` applies only to display and CSV. Rounding at build time put 49.95% into "at least 50" (732 against the source's 731).

### M4-T1 · Known contaminated sites · done · 2026-09-25
- Changed: catalog/layers/nj_contaminated_sites.json
- Checks: build gave 12,610 rows; check PASS (place coverage 99.98%). Server-side comparison: Superfund Final 115=115, active in Camden 440=440, Pennsville 15=15 (the atlas's spatial tags agree with the source's COMU_CODE and COUNTY fields)
- Assumptions: **SITE_ID is not unique** (44 IDs cover 90 records with different case names), so `id_field` is OBJECTID and SITE_ID is shown as "NJDEP site ID". CATEGORY (codes 0-3 with no meanings given) was left out. Names stay in the source's capitals, because titlecase would mangle acronyms.
- Follow-ups: none

### M4-T2 · Preserved open space · done · 2026-09-25
- Changed: catalog/layers/nj_preserved_open_space.json
- Checks: build gave 95,031 of 95,032 rows (1 empty shape dropped); Parquet 52 MB, tiles 42 MB, GeoJSON skipped (>95 MB) automatically; min_zoom 8
- Assumptions: every record is shown (O-8), with Green Acres status as a filter. PRIMARY_USE is a coded field, so the readable USE_LABEL is used, with its literal "<Null>" mapped to blank. OWNER is left out because some owners are private; "Owned by" uses the owner type instead. The NJDEP credit sentence comes from the seed profile, and license name and URL come from the item's terms.
- Follow-ups: owner license review (O-3; see LICENSE_REVIEW.md)

### M4-T3a · Overburdened communities · done · 2026-09-25
- Changed: catalog/layers/nj_overburdened_communities.json
- Checks: build gave 3,180 rows; check PASS (coverage 99.53%). Server-side comparison: all three criteria 122=122, Camden 180=180, low-income at least 50% 731 against 732, which led to the D-018 fix
- Assumptions: `id_field` is OBJECTID, because split block groups repeat their GEOID; the block group code is the item title
- Follow-ups: none

### M4-T3b · Trails · done · 2026-09-25
- Changed: catalog/layers/nj_trails.json (first line layer; uses value_labels)
- Checks: build gave 12,761 rows; check PASS (coverage 99.95%). Server-side comparison: easy 300=300, wheelchair accessible 1,712=1,712
- Assumptions: 8 filters (trail, park, difficulty, surface, hiking, biking, wheelchair accessible, length); mountain biking, horses, blaze and agency are popup-only
- Follow-ups: none

### M6-T2 · Release build · done · 2026-09-25
- Changed: tools/release.py, docs/RELEASE.md, docs/LICENSE_REVIEW.md, tests/py/test_release.py
- Checks: 4 tests pass; `python tools/release.py` correctly refuses ("No layer has status 'published' … O-3") before touching site/data
- Assumptions: `--rehearsal` includes drafts to test the whole process and never prints a push command; the release branch is `gh-pages`, with `.nojekyll` added
- Follow-ups: the owner's steps M6-T1 and M6-T3

### Owner decision · 2026-09-25
- D-019 approved in chat: a point in no boundary takes the nearest county or municipality within 1,000 ft. Open-space coverage was 98.93%, below the 99% rule, because 1,018 beach lots sat a median of 132 ft outside shore-town lines. It is now 99.99%, with 1,009 tagged by nearest (meta.json `tagged_by_nearest`). The rule applies to every layer: sites 2, communities 12, trails 5.

### Data clean-up found in browser review · 2026-09-25
- Stand-in values used as names ("Unknown", "(none)", "<Null>", "Unnamed", "N/A") sorted to the top of tables. They are now blank through `value_labels` (trail, park, blaze, agency; open-space name; site address). "Unknown" stays as a checklist option (difficulty, surface, activities, access), where it means the publisher doesn't know. The playbook's step 8 now includes this check.
- Publisher credits: the NJDEP sentence covered the map, so the compact credit control starts closed ("i" opens it; the About dialog always shows it).

### M4-T4 · Performance pass · done · 2026-09-25
- Checks (local server, largest layer, 95,031 open-space rows): first screen 0.52 MB (budget 2 MB); table data 1.4 s after the click (budget 3 s); filter updates 45-122 ms (budget 300 ms); search 292 ms including the 250 ms wait; `/?selftest` loads all six layers and runs 29 cases in 3.4 s
- Assumptions: map drawing time can't be measured reliably in the hidden browser pane; the table and count never wait for the map (M3-T9 fix)
- Follow-ups: repeat on the live site in G6 step 6

### M5-T1 · Download matches as CSV · done · 2026-09-25
- Changed: site/js/csv.js, tests/js/csv.test.js, site/js/main.js, site/index.html, site/js/text.js
- Checks: 5 tests (header, BOM, CRLF, quoting, formula guard, É, number formatting, file names). In the browser, Salem plus Township gave `nj_municipalities_salem-county_2026-09-25.csv` with 11 rows, starting EF BB BF, with the same header as the build's CSV.
- Assumptions: columns come from the catalog's `csv_columns`, so the build and the browser CSVs can't drift apart; the button is disabled when nothing matches
- Follow-ups: none

### M5-T2 · Copy link · done · 2026-09-25
- Checks: the browser pane blocks the clipboard, so the fallback ran: "Copy this link:" with the link selected in a read-only box. The clipboard path needs a real browser; G6 re-checks it live.
- Follow-ups: none

### M5-T3 · Help, empty and error states · done · 2026-09-25
- Checks: the "How it works" strip shows 4 steps on the first visit; "Got it" hides it and remembers that, with storage wrapped in try/catch. No matches shows "No … match. Remove a filter to see more." with removable chips. A failed data load shows the reason and "Try again". A map that fails to load shows a notice while filters and the table keep working.
- Follow-ups: none

### M5-T4 · Phone layout · done · 2026-09-25
- Checks: at 375 px there is no sideways scroll, the table scrolls inside its own box, and every control is at least 40 px
- Assumptions: **found in testing.** Example buttons (32 px), chip × buttons (24 px), text-link buttons and checkbox rows were too small; phone-width rules now enforce 40 px
- Follow-ups: none

### M5-T5 · Accessibility pass · done · 2026-09-25
- Checks (audit script): every input and select has a label; every button has a name; no visible text below 4.5:1 contrast; the count is `aria-live="polite"`; the focus ring rule is present. Keyboard only: Enter picks a data card, letter keys and arrow keys choose a county (15 in Salem), Space ticks a checkbox (239 townships).
- Assumptions: **found in testing.** Checkbox names were read as "Borough253"; each now has an aria-label such as "Borough (253)". The earlier "typing does nothing in the county list" result was the tool inserting text rather than pressing keys; real key presses work.
- Follow-ups: G5 asks for a trial by a real non-GIS person before M6, which only the owner can arrange

### Owner request · 2026-09-25
- In chat: "The buttons should actually be filters. For example the first filter should be Boundary > State, County, Municipality, Census Tracts, Block Groups, etc. Then there should be cascading filters like select Municipality, Census Tract, etc. The datasets should be another filter, and there can be Environment and Hazard grouping within the filter." Recorded as D-020 and planned as M5B.

### M5B-T1 · Decisions and recipe rules · done · 2026-09-25
- Changed: docs/DECISIONS.md (D-020 to D-023), catalog/layer.schema.json, pipeline/levels.py (new), pipeline/recipes.py, pipeline/normalize.py
- Checks: `validate` OK for all 9 recipes; new tests reject a data layer without `all`, a boundary layer with the wrong mode or missing its own code field, and `sq_m_to_sq_mi` on a text field
- Assumptions: D-021 (the 5% shared-area rule), D-022 and D-023 are the agent's choices and are marked "awaiting owner sign-off"
- Follow-ups: none

### M5B-T2 · State, census tract and block group recipes · done · 2026-09-25
- Changed: catalog/layers/nj_state.json, nj_census_tracts.json, nj_block_groups.json (new); nj_overburdened_communities.json (`block_group` field renamed `geoid`, "Community code"); docs/SOURCES.md, docs/LICENSE_REVIEW.md
- Checks: the sources report 1, 2,181 and 6,599 records; tract population sums to 9,288,994
- Assumptions: 476 of NJDEP's 3,180 community codes are not 2020 block group codes (SOURCES.md), so the Community code and the Block group column can differ
- Follow-ups: owner license review of the three new layers (O-3)

### M5B-T3 · Place columns for every level · done · 2026-09-25
- Changed: pipeline/places.py, build.py, outputs.py, check.py, catalog.py, tools/release.py; tests/py/conftest.py (`census_atlas`), test_places.py, test_catalog.py, test_outputs.py, test_release.py, test_recipes.py
- Checks: pytest passes. Data layers reach 99.99-100% block group coverage. Measured before choosing 5%: 44 municipalities would have had no tract by center point; at 5% every municipality lists at least one tract, and 65 tracts list two or more municipalities.
- Assumptions: check rule 8's box moves to 38.7 south, because census tracts reach 38.79 in the ocean. Rule 16 now requires unique labels instead of a fixed number of automatic cases.
- Follow-ups: none

### M5B-T4 · Shared filter for four place levels · done · 2026-09-25
- Changed: tests/fixtures/filter_cases.json (row 2 lists two municipalities; 5 new cases), pipeline/filters.py, site/js/filters.js
- Checks: both suites pass the shared fixture. In the browser, the padded `["in", " 0714 ", ["concat", ...]]` expression draws exactly the 88 Newark tracts the table lists.
- Follow-ups: none

### M5B-T5 · Level list and area lists · done · 2026-09-25
- Changed: pipeline/catalog.py
- Checks: `catalog --include-drafts` reports state (1), county (21), municipality (564), tract (2181), block_group (6599). The tract list is 0.3 MB and the block group list 1 MB; both load only when their level is picked.
- Follow-ups: none

### M5B-T6 · Viewer: Boundary, area lists and Data · done · 2026-09-25
- Changed: site/index.html, site/css/style.css, site/js/places.js (new), state.js, ui.js, map.js, main.js, text.js; tests/js/places.test.js (new), state.test.js, filters.test.js
- Checks: npm test 60 passed; lint PASS. Browser: the first screen is Level County with 21 counties and no console errors; first-screen transfer 0.69 MB before map tiles (budget 2 MB). Level Census tract gives 2,181, and its list says "Choose a county first". Essex then Newark gives 88 in the list, the table and the map. Contaminated sites in Camden City's tract 6103 gives 44, which NJDEP's own service also returns for that tract shape. Block group 340076103001 gives 26, which the service also returns. Changing the county clears the smaller choices. The old link `#layer=nj_municipalities&county=033` opens 15 municipalities. `/?selftest` passes 46 of 46. At 375 px there is no sideways scroll.
- Assumptions: one dataset at a time (D-005 stands); the Dataset list is a native select with category groups, so it works by keyboard for free; choosing a dataset keeps the chosen area
- Follow-ups: none

### Owner decisions · 2026-09-26
- In chat: "All signed off. For now lets have one dataset at a time. Multiple datasets, bivariate and multi-variate maps for later stages. Credits are good for now. Proceed with further phases"
- Recorded: M4, M5 and M5B signed off, with their gate entries; D-021, D-022 and D-023 approved; D-024 (one dataset at a time for now; several datasets and bivariate or multivariate maps come later); LICENSE_REVIEW.md question 2 answered (keep the credits as they are).
- Still open before M6: the G5 trial with a real non-GIS person (unless the owner waives it), O-1, O-3 and O-4.

### Owner answers · 2026-09-26 (form in chat)
- O-1: MIT. O-3: accept the suggested entries for all 9 layers; the agent records the review at the owner's instruction. Commit: not yet. G5 trial with a real non-GIS person: waived for v1, to run after launch.

### M6 · release rehearsal re-run after M5B · 2026-09-26
- Checks: `tools/release.py --rehearsal` builds all 9 layers, passes every check, lint and test (129 Python, 60 JavaScript), and prepares 363 MB of data (limit 900 MB).
- Assumptions: **found in testing.** The second run failed on Windows because git leaves its object files read-only, so deleting the old `build/pages` was refused; the first rehearsal never hit this because the folder didn't exist yet. `remove_tree` now clears the read-only flag and retries, with a test. The earlier run's output filter also hid the failure behind exit code 0, so release runs are now checked by their own exit code.
- Follow-ups: none

### M6 · release prepared · 2026-09-26
- Checks: `tools/release.py` (published layers only) built all 9 layers, passed every check, lint and test (129 Python, 60 JavaScript), and prepared `build/pages` as a new repository on branch `gh-pages` with one commit: 363 MB of data, plus `.nojekyll`. Served from `build/pages` on port 8081: `/?selftest` passes 46/46, there are no Draft badges, and "About this data" shows each reviewed license. `release.json` records the date, the 9 layers with their row counts and `"commit": "uncommitted"`.
- Assumptions: the data is the cached download of 2026-09-25; `python tools/release.py --refresh` downloads everything again first
- Follow-ups (owner): O-4 (create the GitHub repository and enable Pages from `gh-pages`), commit when ready, then run `git -C build/pages push --force <repository URL> gh-pages` (M6-T3). After that the agent runs G6 live (M6-T4). M7 waits on O-5 and O-6 (evidence in PARCELS_REVIEW.md).

### Owner instruction · 2026-09-26
- In chat: "Proceed with the remaining phases. All reviews towards the end. Only wait for critical checks." M6-T3 (push) and M6-T4 (live check) need the owner's GitHub repository, so they wait. M7 proceeds with the suggested defaults: O-5 uses the "Publish" list in PARCELS_REVIEW.md, and building footprints are left out. D-025 to D-028 are marked for owner review.

### M7-T2 · Schema extension for split layers · done · 2026-09-26
- Changed: catalog/layer.schema.json (`partition`, `all_by_district`, `zero_is_blank`, `yymmdd`), pipeline/levels.py, recipes.py, normalize.py, pipeline/partitions.py (new); DECISIONS.md D-025 to D-028
- Checks: `validate` OK for 10 recipes; recipe tests reject a partition whose field isn't the district code's source, a partitioned layer without `all_by_district`, and `all_by_district` without `district_code`
- Assumptions: split by municipality, not county (D-025). Measured: Ocean County ~89 MB of Parquet before place columns, against a 95 MB limit; the largest municipality (Jersey City, 59,011 parcels) ~13 MB.
- Follow-ups: owner review of D-025 to D-028

### M7-T3 · Per-municipality fetch and build · code done · 2026-09-26
- Changed: catalog/layers/nj_parcels.json (new, draft), catalog/hosting.json (new), pipeline/fetch.py, build.py, outputs.py, check.py (rules run per partition, new rule 17), catalog.py (`--for-release`), __main__.py (`--partition`, `check --catalog`), tools/release.py (keeps and excludes R2 layers), tools/r2_manifest.py (new), tests/py/test_partitions.py (10 tests)
- Checks: Pennsville (1709) builds in 12 s: 6,559 parcels, 100% place columns, sale dates 1957-2024, 6 MB of files. The parcel ID `PAMS_PIN` repeats, so `id_field` is `OBJECTID`. The rehearsal keeps parcels in site/data but leaves them out of `build/pages`, the catalog and the size total (363 MB), because hosting.json has no R2 URL.
- Assumptions: map tiles for parcels start at zoom 9 (not 11), so a whole municipality shows parcels at once; Pennsville's tiles grew from 2.5 to 3.3 MB
- Follow-ups: the statewide build (below)

### M7-T4 · Viewer for split layers · done · 2026-09-26
- Changed: site/js/main.js, data.js (cached per file), selftest.js, ui.js, places.js (`atLeastLevel`), text.js; tests/js/places.test.js
- Checks (built-in browser): parcels at Level County move the Level to Municipality and show "Choose a county and a municipality to see parcels." Choosing Pennsville requests only `partitions.json` and Pennsville's files, and shows "6,559 of 6,559 parcels in Pennsville Township match". The examples give 655 and 16, equal to the self-test. About offers "Download Pennsville Township's files". `/?selftest` passes 52 of 52.
- Assumptions: **found in testing.** An example without a place used to clear the municipality, which unloaded the parcels; on split layers, examples now keep the chosen municipality
- Follow-ups: none

### M7-T3 · statewide parcel build · done · 2026-09-26
- Checks: `fetch nj_parcels` downloaded 3,481,240 parcels in 564 municipalities (about 90 minutes, one request at a time), equal to the source's total. `build nj_parcels --include-drafts --jobs 8` built them in 25 minutes. Files: Parquet 0.85 GB, tiles 1.54 GB, CSV 0.80 GB; the largest file is 31 MB (Brick, 1506).
- Assumptions: **added in testing.** The one-worker build ran at about 23,000 parcels a minute (about 2.5 hours), so `build --jobs N` builds several municipalities at once after confirming every download one request at a time, with a test that it matches the one-worker build
- Follow-ups (owner): review O-5 and D-025 to D-028, answer O-6, upload with the printed command, review the parcels license (O-3)

## Studio

### Owner instruction · 2026-09-27
- In chat: Rev B approved, with D-029 to D-043 as written plus three clarifications (D-033 edge, not centroid; D-037 GeoParquet fallback; D-041 more GS4 terms). O-9 answered: "Pilot contacts see the totals; the owner sees the totals. Nothing per-user is ever queryable", recorded as D-044. Six small flags folded into Rev C. The owner's writing rule ("do not state the most obvious thing") recorded as D-045. "Start S0-T1 and S0-T2. Do not start S1 until S0-T4 is complete and every operation is within twice its budget."

### S0-T1 · Record the decisions · done · 2026-09-27
- Changed: DECISIONS.md (D-029 to D-045; O-9 answered), OPERATING_GUIDE.md §1 (Studio's scope points to the guide) and §6.1, MILESTONES.md (Studio pointer), README.md (one line), LAYER_PLAYBOOK.md (v2 fields); docs/studio/IMPLEMENTATION_GUIDE.md to Rev C (approved), CATALOG.md (`COMU_CODE` confirmed)
- Checks: `tools/lint_text.py` PASS. Live check: contaminated sites `COMU_CODE LIKE '17%'` = 115, equal to `UPPER(COUNTY) IN ('SALEM','SALEM COUNTY')` = 115, so `COMU_CODE` is the 4-digit municipal code; overburdened communities `MUN_CODE LIKE '17%'` = 13
- Assumptions: D-044 keys totals by pilot town (an organization's code, never a person's), because the pilot measure counts pilots exporting each week; the Worker stores no IP address, user agent, cookie or time finer than the week
- Follow-ups: none

### S0-T2 · Recipe v2 schema · done · 2026-09-27
- Changed: catalog/layer.schema.json (v2: `access`, `area_mode`, `area_codes`, `min_zoom`, `styles`, `default_style`, `legend`, `buffer_role`, `distance_query`, `clip_mode`, `list_fields`, `refresh_cadence`, `leave_out`, `known_answers`; `style` replaced by `styles`; category `government`); pipeline/recipes.py (extra rules), build.py, __main__.py (fetch), check.py, catalog.py, tools/release.py (copy layers only); all 10 recipes; tests: test_recipes.py (+13), conftest.py, test_partitions.py, test_release.py, the six bad-recipe fixtures, tests/fixtures/parked/nj_parcels.json (new)
- Checks: `validate` OK for 10 recipes; pytest 153 passed (`-m "not network"`); npm test 61 passed; lint PASS; `catalog --include-drafts` then `check --catalog` PASS (7 copy layers); `build nj_parcels` refuses: "nj_parcels is a live layer (D-030)". All files LF.
- Assumptions:
  - `display_tiles` and `query_source` (Rev B §4.1) are derived from `access` rather than stored, so a recipe can't contradict itself; §4.1 now lists the implemented fields.
  - `area_codes` reads codes one of five ways (`mun_code`, `mun_prefix`, `county_number`, `county_fips`, `county_name`); municipality names are never matched.
  - `OWNER_NAME` is refused in every recipe, whatever its `leave_out`.
  - A copy layer's default style is `single`, because the atlas draws one color per layer.
  - Parcels, contaminated sites and overburdened communities are live; their built files stay in site/data but leave the atlas catalog. The partition code is tested through the parked fixture.
  - Trails is still a published copy layer, so Studio would list it, although CATALOG.md puts it under "Not in v1" (owner to decide).
- Follow-ups: S0-T3 (map document schema), then S0-T4 (live trial)

### Owner instruction · 2026-09-27
- In chat: "Build the full tool. Connect with Github and commit if required. License proceed with the best recommendation. Log all the decisions taken for review and validation." The agent built S0-T3 to S5 and S6-T2, applied the recommended licenses (D-046), created the public repository (D-047), and logged every decision taken while building as D-046 to D-066, each marked for owner review.

### S0-T3 · Map document schema and module · done · 2026-09-27
- Changed: catalog/mapdoc.schema.json (new), site/js/studio/mapdoc.js, share.js, text.js; tests/js/mapdoc.test.js; tests/fixtures/mapdocs/v1-screening.json
- Checks: the fixture round-trips unchanged through the compressed link (`#m=`), the plain link (`#m0=`) and validation; six invalid documents give plain-language messages; unknown layers are dropped with a notice; unknown keys go under `extensions`.
- Assumptions: a feature buffer site keeps its shape in the document (D-056).
- Follow-ups: none

### S0-T4 · Live trial · done · 2026-09-27
- Changed: site/js/studio/live.js, tools/trial.mjs (new), docs/studio/TRIAL.md, catalog/search.json
- Checks: `node tools/trial.mjs`: every operation within budget across Newark, Jersey City, Long Beach Township and Pennsville. The §1.4 known answer matches (2 wetland areas, 3 flood areas, 0 Category 1 waters, 14 land use areas; 9 parcels within 200 ft). Distance queries from a polygon, a line and a point answer on an NJDEP server and on ArcGIS Online; a 1,000 ft county-line buffer lists parcels from Salem and Gloucester. All SQL forms work on both kinds of server. NJDEP publishes no 2020 land use.
- Assumptions: found in the trial and fixed before S1. Outlines are simplified to about 10 m (D-049), because a 961-point outline took 3.8 s against flood zones. Address search uses the NJOGIS geocoder (D-048), because address-point text searches took over 40 s. Phone timing was done in the browser, not by the script.
- Follow-ups: none

### S1 · Live layer stack and filters · done · 2026-09-27
- Changed: site/index.html (Studio), site/atlas/index.html (the atlas, moved, D-058), site/js/studio/{studio,panels,mapview,tiles,registry,sql,transform,dom}.js, site/css/studio.css, pipeline/studio.py (Studio catalog and outlines), 25 new recipes (S1-T6), tests/js/{sql,transform,geo}.test.js, tests/py/test_{studio,transforms}.py, tests/fixtures/{sql_cases,transform_cases}.json
- Checks: the Python normalizer and the browser agree on 27 shared transform cases; 27 SQL cases; `node tools/healthcheck.mjs` passes for all 28 live and hybrid layers (fields, counts, known answers, browser access). In the browser: Pennsville counts are 6,559 parcels, 331 Category 1 waters and 1,052 wetland areas; road checkbox counts are live; the "State and US highways" example gives 91 of 1,101 and filters the map; the table sorts under 5,000 matches; links reopen the same map.
- Assumptions: D-050 (area codes confirmed or refused), D-053 (whole or tiled live drawing), D-054 (checkbox counts where NJDEP refuses statistics with an outline), D-057 (three school district layers).
- Follow-ups: none

### S2-T1 · Map copies for the hybrid layers · built · 2026-09-27
- Changed: pipeline/hybrid.py (streamed download, map copy only), build.py, check.py (rules H1 to H4), normalize.py (repairs, D-063)
- Checks: sizes against the §3.2 estimates: roads 65.7 MB (estimate 75 or less), wetlands 87.8 MB (225), streams 44.8 MB (110), flood zones 67.0 MB (1,000), land use 282.4 MB (640). All pass `pipeline check`; about 548 MB in all, against the 2 GB estimate.
- Assumptions: flood zones lost 8,610 zero-area slivers to the 1 m generalization, from the map copy only (D-065).
- Follow-ups (owner): storage and upload (O-6, S2-T2); releases draw these layers live until then (D-052)

### S3 · Styling and legend · done · 2026-09-27
- Changed: site/js/studio/style.js, panels.js (Style tab), export.js (legend), recipes (presets)
- Checks: tests/js/style.test.js walks every preset of every recipe (map layers and legend). Land use by type shows the six Anderson Level I classes; roads show one entry per class plus Ramp; flood zones color A/AE, VE and X. Colors and class breaks are stored in the map document.
- Assumptions: D-059 (invisible fill under outline-only areas), D-060 (one NJDEP credit)
- Follow-ups: none

### S4 · Buffers and site screening · done · 2026-09-27
- Changed: site/js/studio/buffer.js, draw.js, turf.js, catalog/templates.json
- Checks (browser): "Start a site screening map" adds parcels, Category 1 waters, wetlands and flood zones. A click on Pennsville block 301, lot 19 selects it, draws the 300 ft ring from its edge above the mask, and lists 2 wetland areas (Deciduous wooded wetlands), 3 flood areas (X, AE, X) and 0 Category 1 waters, which is the §1.4 known answer. The screening label and the parcel line show on the panel. The GS4 wording check finds nothing.
- Assumptions: none beyond D-056
- Follow-ups: none

### S5 · Exports and sharing · done · 2026-09-27
- Changed: site/js/studio/export.js, clip.js, site/css/print.css
- Checks (browser, Chromium): the letter landscape layout fits the page and carries the title, map, legend, 200 ft scale bar, north arrow, screening label, parcel line, credits and dates. PNG is 1958 × 1478 (2×) with no taint. Parcels in Pennsville export 6,559 rows (paged, 5 s). Land use cut to Pennsville sums to the town's area (ratio 1.0000). Embed hides the panels and keeps the legend and "Open in NJ Atlas Studio". Phones open on the map (D-062).
- Assumptions: exports read the source for every layer (D-055)
- Follow-ups (owner): print once in Edge and Firefox (GS5)

### S6-T2 · Export counter · code done · 2026-09-27
- Changed: workers/counter/{index.js,schema.sql,README.md,wrangler.example.toml}, site/js/studio/counter.js, tests/js/counter.test.js, .github/workflows/{healthcheck,tiles}.yml, tools/{healthcheck.mjs,publish_tiles.py}, tools/release.py (D-064), tools/lint_text.py (Studio files)
- Checks: 8 counter tests (a counted POST, 400 and 403, an unlisted pilot stored as `public`, reads with and without the key, and no IP, user agent or cookie in the code).
- Follow-ups (owner): deploy the counter and set `counter_url`

### Gate GS0 to GS5 (Studio) · 2026-09-27 · automated PASS
- Automated: `pipeline validate` (35 recipes), `pytest -m "not network"` (188), `npm test` (174), `tools/lint_text.py`, `pipeline check` on the map copies, `node tools/healthcheck.mjs` (28 layers) and `node tools/trial.mjs` (all within budget).
- Manual (browser, 2026-09-27): GS1: Pennsville parcels 6,559 and Jersey City 59,011; schools 3,736, 12 congressional and 40 legislative districts (health check known answers); links reopen identically; mask off shows the whole state. GS2: map copies draw locally and their counts are live. GS3: land use six classes; roads one entry per class plus Ramp. GS4: the §1.4 answer, the ring above the mask, both counties at the county line, labels, no notice wording. GS5: letter layout, PNG at 2×, map file round trip (tests), embed, land use within 1%. Not yet done: printing in Edge and Firefox, tabloid and portrait in a real print dialog, the PNG with all 8 slots (tested with 6).
- Signed off: (owner)

### Release and live check · 2026-09-27
- Checks: `python tools/release.py` built the seven copy layers, wrote both catalogs, and passed the data checks, lint, 188 Python and 174 JavaScript tests; `build/pages` held 331 MB of data (largest file 53 MB) from commit 2135cfb. Pushed to the new `gh-pages` branch (no force needed), and Pages built in 42 s.
- Live (2026-09-27, https://abdul-kalam-m.github.io/nj-atlas-studio/): Studio, the atlas at `/atlas/`, the catalogs, the area lists and outlines, and health.json answer 200; a map copy answers a range request with 206. In the browser, Pennsville counts are 6,559 parcels, 331 Category 1 waters, 1,052 wetland areas and 245 flood areas. The site screening buffer around block 301, lot 19 gives 2 wetland areas, 3 flood areas and 0 Category 1 waters (the §1.4 answer). No console errors.
- Assumptions: the release draws the five hybrid layers live until the map copies are hosted (D-052); the export counter is off (`counter_url` is null).
- Follow-ups (owner): review D-046 to D-066 and the Studio licenses; O-6 storage for the map copies; deploy the counter; S6 pilot.

### Owner's review of D-046 to D-066 · 2026-09-27
- In chat: the owner approved D-046 to D-066, some with conditions, and approved D-067 to D-072 (buffers from any layer, four tabs, templates in the Layers tab, layer list plus properties panel, basemap control, a header line on downloads). The order asked for: buffers first, then the tab shell, the Layers tab, templates, and polish. D-068 said "five tabs" but named four; four were built.

### Review conditions · done · 2026-09-27
- Changed: DECISIONS.md (outcomes on D-046 to D-066; D-067 to D-073), recipe schema (`export_notes`, `tiles.max_dropped_share`), nj_parcels and nj_flood_zones recipes, pipeline/check.py, tools/healthcheck.mjs, site/js/studio/{live,tiles,buffer,search,studio,panels,text}.js, catalog/search.json, LICENSE_REVIEW.md, LAYER_PLAYBOOK.md; tests: buffer.test.js, search.test.js, test_recipes.py
- Checks:
  - the parcel line comes from the recipe into lists, exports and prints (D-073);
  - a tile still full after three splits is marked dense (1 + 4 + 16 + 64 requests, then stop);
  - in the browser, flood zone counting in Pennsville shows "Counting values: 245 of 245" and adds up to 245 (AE 102, VE 29, X 114), and Cancel shows "Counts stopped. Count again";
  - the nightly check now compares code and outline counts for Pennsville and Salem County, and every code-sliced layer passes (for example, parcels: 6,558 of 6,559 selected by code touch Pennsville);
  - flood zones pass at the reviewed 8% sliver share, roads at the default 5%.
- Assumptions: the code comparison tests that features selected by code lie in the area, since areas and lines touching the edge from outside make raw counts differ (wards: 1 by code, 5 touching Pennsville). Very large selections (over 20,000) skip it.
- Follow-ups (owner): the NJOGIS email (O-3)

### Buffers from any layer (D-067) · done · 2026-09-27
- Checks (browser, Pennsville): a school, a contaminated site and a park each became the site and were buffered against every other layer on the map (for example, the school: 1 flood area within 300 ft; the contaminated site: 3). Nameless sites are called by their kind.

### Tabs, header and basemaps (D-068, D-071) · done · 2026-09-27
- Checks (browser): Right arrow twice moves from Area to Analysis and shows its panel; End and Home reach Export and Area. Light, Streets and None keep all 12 Studio layers in order, with the buffer ring's data. The header reads "Pennsville Township · 5 layers · 300 ft buffer".

### Layers tab (D-070) and templates (D-069) · done · 2026-09-27
- Checks (browser): choosing flood zones opens its properties beside the panel with Style, Filter and About open together; "Add layer" searches the catalog and a new layer opens its properties; the table follows the chosen layer (roads, then schools). "Start from template" lists Site screening; applying it sets four layers and opens Analysis in select mode.

### Analysis and Export polish · done · 2026-09-27
- Checks (browser): the site line reads "Property parcels · 12 CHURCHLANDING RD" with the picker folded; the §1.4 answer holds (0, 2, 3); changing the distance marks the results "Changed since the last run." Export opens with "4 layers, a buffer (500 ft, 12 CHURCHLANDING RD). Data from NJOGIS, NJDEP, live as of 4:13 PM." The print preview shows the letter layout at a readable size, with the screening label and parcel line.

