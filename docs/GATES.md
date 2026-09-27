# NJ-Atlas gates

A gate is the pass/fail check that ends a milestone.

- **Automated checks** are commands. Each must exit 0. `python tools/gate.py <gate>` runs them in the order listed.
- **Manual checks** are numbered steps with an expected result. Do each one; don't infer the result from code.
- **Evidence:** record every gate run in [PROGRESS.md](PROGRESS.md#gate-log) with the date, commit, the automated output tail, manual step results and any failures.
- **Sign-off:** a gate passes only when every check passes and the human writes "Signed off" on the entry. An agent never signs off.

If a check fails: record it, stop, and report. Don't fix code during a gate run unless the human asks. Fixes happen in a follow-up task, and then the whole gate reruns.

### Known answers

These counts came from the live NJOGIS service on 2026-09-24. If a count differs, first confirm what the source says now: use `python -m pipeline inspect`, or a `returnCountOnly` query with the same where clause. Only then treat the difference as a bug. Record any legitimate source change in PROGRESS.md and update this table.

| Question | Answer |
| --- | --- |
| Counties | 21 |
| Counties with 500,000 people or more (2020) | 10 |
| Coastal counties (`REGION` = COASTAL) | 4 |
| Municipalities | 564 |
| Municipalities with 50,000 people or more (2020) | 37 |
| Municipalities in Salem County | 15 |
| Townships | 239 |
| Townships in Salem County | 11 |
| Townships with 50,000 people or more | 20 |
| Municipality names containing "penn" | 4 |
| Atlantic County population 2020, area | 274,534 people, 610.6 sq mi |

Census levels, checked on 2026-09-25 against TIGERweb 2020 (`STATE='34'`) and, for the last two rows, against NJDEP's contaminated-sites service queried with the same tract and block group shapes:

| Question | Answer |
| --- | --- |
| Census tracts; their total population | 2,181; 9,288,994 |
| Tracts with 8,000 people or more; tracts where nobody lives | 19; 6 |
| Tracts in Essex County (`COUNTY='013'`) | 211 |
| Tracts listed under Newark (D-021, sharing at least 5% of area) | 88 |
| Block groups; block groups with 3,000 people or more | 6,599; 94 |
| Block groups listed under Camden City | 60 |
| Known contaminated sites in Census Tract 6103, Camden City (`34007610300`) | 44 |
| Known contaminated sites in block group `340076103001` | 26 |

---

## G0 · Workspace ready

Ends M0.

**Automated**

```text
.venv\Scripts\python -c "import pyogrio; assert pyogrio.list_drivers()['PMTiles'] == 'rw'"
.venv\Scripts\python -m pipeline validate
.venv\Scripts\python -m pytest -m "not network"
npm test
```

**Manual**

1. `.venv\Scripts\python tools/serve.py` starts and prints its address. `http://127.0.0.1:8080/` answers, with a 404 or an empty page being fine at this stage. Stop the server afterwards.
2. `.github/workflows/ci.yml` exists and has no deploy steps or secrets. Either CI has run green, or PROGRESS.md says "CI written, not yet run".

---

## G1 · Layer data is valid

Ends M1 for each boundary layer. Runs again for every layer added in M4 and M7. Run it per layer with `python tools/gate.py G1 --layer <id>`.

**Automated**

```text
.venv\Scripts\python -m pipeline validate
.venv\Scripts\python -m pipeline build <id> --include-drafts
.venv\Scripts\python -m pipeline catalog --include-drafts
.venv\Scripts\python -m pipeline check <id>
.venv\Scripts\python -m pytest -m "not network"
```

`pipeline check <id>` must test every rule below and print `PASS` or `FAIL` for each.

| # | Rule |
| --- | --- |
| 1 | The recipe is valid: schema plus the extra rules in OPERATING_GUIDE.md §6.1. |
| 2 | `<id>.parquet`, `<id>.pmtiles`, `<id>.csv` and `meta.json` exist. `<id>.geojson` exists unless `meta.files.geojson` is null because it would exceed 95 MB. |
| 3 | The row counts agree: `meta.rows`, the Parquet rows and the CSV data rows are equal, and lie within `expected_count`. `meta.rows` equals `source_count` minus `dropped_empty_shapes`. |
| 4 | `atlas_id` has no nulls and no duplicates. |
| 5 | Parquet columns are exactly, in order: `atlas_id`, the recipe field names, the place-tag columns for this layer's `place_tags`, `lon`, `lat`, `geometry`. |
| 6 | Column types are string, float64 or geometry only. No int64, bool or datetime. |
| 7 | The GeoParquet CRS is EPSG:4326. |
| 8 | The layer bounds lie inside `[-75.8, 38.7, -73.7, 41.5]` (census tracts reach 38.79 in the ocean, D-023). |
| 9 | `lon` and `lat` have no nulls, and every point lies inside the same box. |
| 10 | Place codes are null or well-formed: `county_fips` `^[0-9]{3}$`, `mun_code` `^[0-9]{4}( [0-9]{4})*$`, `tract_geoid` `^34[0-9]{9}$`, `bg_geoid` `^34[0-9]{10}$`. Data layers have at least 99% non-null `county_fips` and `bg_geoid`; boundary layers have 100% `county_fips`. Skipped for the state, which has no place columns. |
| 11 | The PMTiles file has exactly one tile layer, named `<id>`, and its fields include `atlas_id` and every filtered field. |
| 12 | Every checklist field has at most 60 distinct values. Otherwise the recipe must use `search`. |
| 13 | `meta.values` covers every checklist field, and `meta.ranges` covers every range field. |
| 14 | No file in `site/data/<id>/` exceeds 95 MB, unless the layer is hosted on R2 (M7). |
| 15 | The CSV starts with a byte-order mark, and its header row equals the recipe labels followed by the standard headers. |
| 16 | From M3 on, `meta.selftest` holds one case per recipe example plus the automatic cases (§6.5), labels are unique, and the no-filter case expects `rows`. |
| 17 | Layers split by municipality only (§6.9): every municipality has a partition, and the partitions' rows add up to `meta.rows`, within `expected_count`. Rules 2–15 run on each partition, and rule 16 uses the self-test municipality's row count. |

**Manual**

1. Spot-check 3 random rows. Pick them with `.venv\Scripts\python -c "import geopandas as g; print(g.read_parquet('site/data/<id>/<id>.parquet').sample(3, random_state=1).drop(columns='geometry').to_string())"`, then compare each against the source with an ArcGIS query on `id_field`. All kept values must match after the documented transforms.
2. For `nj_municipalities`, run `.venv\Scripts\python -c "import geopandas as g; m=g.read_parquet('site/data/nj_municipalities/nj_municipalities.parquet'); print(len(m), int((m.population_2020>=50000).sum()), int((m.county_fips=='033').sum()), int((m.mun_type=='Township').sum()))"`. It must print `564 37 15 239`.
3. For `nj_counties`, the same style of check must give 21 rows, 10 with population at least 500,000, and 4 in the Coastal region.
4. Open the CSV in a spreadsheet program. The columns have plain labels, accented characters (if any) show correctly, and there are no `nan` or `None` strings.

---

## G2 · The viewer shows layers

Ends M2.

**Automated**

```text
.venv\Scripts\python -m pipeline check
.venv\Scripts\python tools/lint_text.py
.venv\Scripts\python -m pytest -m "not network"
npm test
```

`tools/lint_text.py` fails if a string in `site/js/text.js`, outside `TEXT.downloads`, contains any of these words. It matches whole words, case-insensitively:

`feature, features, attribute, attributes, geometry, geometries, polygon, polygons, vector, raster, tile, tiles, EPSG, CRS, projection, WKB, WKT, shapefile, PMTiles, parquet, GeoParquet, GeoJSON, schema, query, SQL, FIPS, null, NaN, undefined, OBJECTID`

It also scans `site/index.html` and `site/js/*.js` for script imports and `<script>` or `<link rel="stylesheet">` URLs. It fails if one comes from a host other than `cdn.jsdelivr.net`, or lacks an exact `@x.y.z` version. The basemap style URL (`tiles.openfreemap.org`) is data, not a library, and is allowed.

**Manual.** Run `tools/serve.py` and open `http://127.0.0.1:8080/` in a desktop browser with DevTools open.

1. The page loads with no console errors, and the first screen transfers under 2 MB, not counting basemap requests.
2. The Level list offers State, County, Municipality, Census tract and Block group. The Dataset list starts with "None: show the boundaries only", then groups datasets under Environment, Hazards and Community. Draft layers show a "Draft" badge in the note under the list.
3. The first screen (Level County, no dataset) draws 21 shapes within 3 seconds. The map attribution shows the NJOGIS credit.
4. Clicking Atlantic County opens a popup: "Atlantic County", Population (2020) 274,534, Area 610.6 sq mi. The county code does not appear.
5. "About this data" shows the summary, the publisher link, the source service link, "License not yet reviewed" (while in draft), the attribution, the fetched date and "21 counties".
6. Each download link in the dialog returns a file of the stated size.
7. Switching Level to Municipality leaves no county shapes behind and draws 564 shapes.
8. Zoomed out below the layer's `min_zoom`, the map shows "Zoom in to see counties".
9. The Level, area and Dataset lists work with Tab and the arrow keys only.
10. At 375 px wide, the page does not scroll sideways.

---

## G3 · Filters are correct

Ends M3. Runs again after M4.

**Automated**

```text
.venv\Scripts\python -m pipeline build --all --include-drafts
.venv\Scripts\python -m pipeline catalog --include-drafts
.venv\Scripts\python -m pipeline check
.venv\Scripts\python -m pytest -m "not network"
npm test
.venv\Scripts\python tools/lint_text.py
```

The Python and JavaScript filter tests read the same `tests/fixtures/filter_cases.json`. If either suite is missing a case the other has, that counts as a failure.

**Manual.** Use the local server.

1. `/?selftest` ends with `SELFTEST: PASS`, and every row passes.
2. Level Municipality with Dataset "None" and no filters shows "564 of 564 municipalities match".
3. County "Salem County" shows 15. The map zooms to Salem County and outlines it.
4. Adding Type "Township" shows 11. The table lists 11 rows sorted by name.
5. After "Clear all", Population (2020) minimum 50000 shows 37. Adding Type "Township" shows 20.
6. After "Clear all", searching the name for "penn" shows 4. The same search in upper case gives the same count.
7. Clicking a table row flies the map to that municipality.
8. Set up step 5 (37 then 20), copy the address bar, and open it in a new tab. It shows the same filters and "20 of 564".
9. On Level County, Region "Coastal" shows 4. After clearing, a population minimum of 500000 shows 10.
10. Each "Try:" example button gives the same count as its self-test row.
11. After M4, each new layer's examples pass `/?selftest`. Its checklist options show counts that add up to the layer total, including "(blank)".
12. (M5B) Level Census tract, Dataset "None": "2,181 of 2,181 census tracts match". The Census tract list says "Choose a county first".
13. Choosing County Essex and Municipality Newark City: the Census tract list and the table both hold the known number of Newark tracts, and the map outlines Newark.
14. Level Block group: the Block group list says "Choose a census tract first" until a tract is chosen, then lists only that tract's block groups. Choosing another county clears the municipality, tract and block group.
15. Dataset "Known contaminated sites" with Level Census tract, County Camden, Municipality Camden City and the known tract: the count equals the known answer, and the map shows gray outlines of Camden City's tracts with the chosen tract in dark.
16. Changing the Dataset keeps the chosen area; changing the Level up (for example to County) drops the smaller choices.
17. The old link `/#layer=nj_municipalities&county=033` opens Level Municipality with Salem County chosen and "15 of 564 municipalities match".

---

## G4 · Downloads and links work

Ends M5, together with G5.

**Automated**

```text
.venv\Scripts\python -m pipeline check
npm test
```

**Manual**

1. The whole-layer CSV for Municipalities opens in a spreadsheet with 564 data rows and plain column labels.
2. The whole-layer GeoParquet reads back with `geopandas.read_parquet` and has 564 rows. The GeoJSON, when present, has 564 items.
3. On Level Municipality, filtering Salem County plus Township and choosing "Download matches (CSV)" saves `nj_municipalities_salem-county_<date>.csv` with 11 data rows. Its columns match the table plus County, Longitude, Latitude and Atlas ID. A dataset's download also has Municipality, Census tract, Census tract code, Block group and Block group code.
4. "Copy link" shows "Link copied". Pasting the link into a new window restores the level, area, dataset, filters and count.
5. A share link naming a missing field or layer shows a notice and still loads the rest.

---

## G5 · A non-GIS person can use it

Ends M5. At least once before M6, a person with no GIS background does steps 1–6 while the agent or owner watches without helping. Record the time taken and any hesitation.

**Automated**

```text
.venv\Scripts\python tools/lint_text.py
```

**Manual.** Each task must be completable using only what is on screen, with no typed codes and no help from the observer.

1. "How many townships are in Salem County?" The person reads 11 within 6 clicks or entries.
2. "Get a spreadsheet of the towns with 50,000 people or more." The saved CSV has 37 rows.
3. "Which known contaminated sites are in Pennsville Township?" The person finds them using the Boundary and Dataset lists only (after M4).
4. "Send this view to a colleague." The copied link reproduces the view.
5. "Which preserved open space areas in Cape May County are larger than 100 acres? Show one on the map." (after M4)
6. "How many census tracts in Camden City had 4,000 people or more in 2020?" The person uses Level Census tract, the area lists and the population box (after M5B).
7. At 375 px width, tasks 1 and 4 still work and nothing requires sideways page scrolling.
8. Keyboard only: task 1 can be completed without a mouse, and focus is always visible.
9. Every "no matches" and "failed to load" state tells the person what to do next.

---

## G6 · Release is live

Ends M6.

**Automated**

```text
.venv\Scripts\python tools/release.py
```

CI must also be green on the commit being released.

**Human**

1. Every layer with `status: published` has `license.name`, `license.url`, `reviewed_by` and `reviewed_on` filled in by the human.
2. The code license (O-1) is chosen, and a `LICENSE` file exists.
3. The human ran the push command printed by `release.py`.

**Manual (on the live URL)**

1. The site loads with no console errors, and each published layer draws.
2. `<live url>/?selftest` ends with `SELFTEST: PASS`.
3. `curl -s -o NUL -w "%{http_code}" -H "Range: bytes=0-9" <live url>/data/nj_counties/nj_counties.pmtiles` prints `206`.
4. Each "About this data" dialog shows a reviewed license and the attribution.
5. G3 manual steps 2–5 give the same counts live.
6. The §8 performance budgets hold on a normal broadband connection.

---

## G7 · Large layers work

Ends M7.

**Automated**

```text
.venv\Scripts\python -m pipeline check <id>
.venv\Scripts\python -m pytest -m "not network"
npm test
.venv\Scripts\python tools/r2_manifest.py
```

`check` runs rules 2–15 for each partition, rule 16 on the self-test municipality, and rule 17: every municipality has a partition, and the rows add up to the layer total within `expected_count`.

**Manual**

1. (After O-6) `curl -s -D - -o NUL -H "Origin: <site origin>" -H "Range: bytes=0-9" <R2 url of one partition's pmtiles>` shows HTTP 206 and `Access-Control-Allow-Origin`.
2. For three municipalities, the partition row count equals the source's server-side count for `PCL_MUN = '<code>'`.
3. No field that O-5 excluded appears in any partition's Parquet, CSV or tiles.
4. Choosing parcels at Level County moves the Level to Municipality and asks for a municipality. Choosing Pennsville Township loads only `partitions.json` and Pennsville's files (check the network requests), and counts read "of 6,559 parcels in Pennsville Township match".
5. `/?selftest` passes, including the parcels cases for Pennsville.
6. `tools/release.py --rehearsal` leaves R2 layers out of `build/pages` and out of its size total.
