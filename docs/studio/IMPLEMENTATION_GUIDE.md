# NJ Atlas Studio: implementation guide

**Revision C, 2026-09-27. Status: approved by the owner in chat, 2026-09-27. Built 2026-09-27 (S0 to S5, and the S6 counter); see PROGRESS.md "Studio". Decisions taken while building are D-046 to D-066, approved by the owner the same day with conditions; the interface then became four tabs with a layer properties panel and buffers from any layer (D-067 to D-073). The Analysis tab then gained the Buffer tool, a geoprocessing step that makes map layers, and the earlier ring-and-list tool became Site screening (D-074 to D-078; see "Buffer layers (as built)" under §4.7).**

- **Project sheet (Rev C):** https://claude.ai/artifact/VmS2iJpL5vBgmNn5HgJVL4
- **Layer catalog:** [CATALOG.md](CATALOG.md)

This guide turns NJ-Atlas (the engine: boundary levels, area pickers, filters, the build pipeline) into NJ Atlas Studio, a map studio for New Jersey local government.

Read it together with [../OPERATING_GUIDE.md](../OPERATING_GUIDE.md). Its work loop (§4), testing rules (§9) and git rules (§10) still apply. Where the two disagree, this guide wins, and §2 lists every decision it changes.

"Verified" marks facts checked against the live services on 2026-09-26 or 2026-09-27.

**Changes since Rev B (the owner's approval notes):**
- D-033: rings are measured from the selected feature's edge.
- D-037: if a source drops area queries, the fallback is a GeoParquet file.
- D-041 and GS4: the notice-wording check covers more terms.
- New D-044 (export counter, totals only) and D-045 (interface text, §1.6).
- The parcel line goes on every export that contains parcels.
- The tagline is paired with the screening label in images.
- `expected_count` is a range.
- S0-T4 checks distance queries for each shape type.
- §4.1 now matches the implemented recipe schema (S0-T2).

---

## 0. How to use this guide

- **Sessions:** do one task card per session (OPERATING_GUIDE.md §4). The cards are in §7 and the gates in §8.
- **Records:** write every task report and gate run in [../PROGRESS.md](../PROGRESS.md), under the heading "Studio".
- **Task card fields:** **Read**, **Write**, **Do**, **Done when**, **Don't**.
- **Stop and ask the owner** when:
  - a live source refuses browser access (CORS), rate-limits, or a field a recipe names is missing;
  - a live operation takes more than twice its budget (§3.5);
  - you would need a library that §3.4 doesn't list;
  - a request touches anything in the OUT list (§1.3), including anything designed or named for official notices;
  - a task would request or show a field in a layer's "Leave out" column (CATALOG.md), or any other personal data;
  - a task would record anything about a user beyond the D-044 totals.

---

## 1. Product contract

### 1.1 The promise

A non-GIS planner makes a council-ready map of their area in **under five minutes**:

1. pick the area;
2. stack the layers;
3. style them;
4. draw a buffer;
5. export a PDF, an image, a link or the data.

Studio complements Esri. It covers the 10–20% of ArcGIS that local staff use for day-to-day decisions.

### 1.2 Users

Municipal planners, grant writers, zoning officers, county planning staff, environmental commissions, watershed and civic nonprofits, and engineering consultants.

### 1.3 v1 scope

| IN | OUT |
| --- | --- |
| Area: state, county, municipality, census tract, block group (built). A mask outside the area has an on/off switch. | Network distance (drive time, walk time, service areas). Straight-line buffers only in v1; network distance is a later module. |
| Layer stack: up to 8 layers, each with its own filters, from the 32 curated layers (CATALOG.md) | Notice mailing lists or any template, button or name built for official notices |
| Styling presets: single color, categories, graduated classes, labels, opacity, line width; legend generated from the style | Regulatory determinations of any kind |
| Buffers: 50, 100, 200, 300, 500 or 1,000 ft, or custom (1–5,280 ft), around a selected feature or a drawn point, line or area. Count, list and export what is inside, from any target layer (parcels included). | Editing shapes; uploading your own data |
| Exports: PNG, print-ready PDF, share link, `.map.json` file, embed code, clipped CSV and GeoJSON | Accounts and sign-in; saved short links (paid tier) |
| Go to an address (the NJOGIS geocoding service, D-048) | AI features (D-001) |
| | Bivariate and multivariate maps, time series, 3D |
| | Listing every NJ service automatically (v1.1, behind "More layers — unreviewed") |

### 1.4 Launch workflow: site screening map

This is the first workflow built end to end (stage S4). Its users are planners and grant writers checking a proposed site before they apply for funding or permits.

1. Pick the area, then click a parcel, search an address, or draw the proposed site's footprint.
2. Choose a distance: 300 ft is the default in this workflow, and any menu value works. Studio draws the ring in the browser, then asks each constraint layer's service for every feature within that distance of the site's **edge** (a distance query).
3. Wetlands, flood zones and Category 1 waters are added with their presets and legend. The user may add land use, roads or any other layer.
4. Export a letter or tabloid PDF, plus a CSV listing each constraint the ring touches: layer, type, name and ID.

**Known answer (verified 2026-09-26).** Within 300 ft of Pennsville block 301, lot 19:
- 2 wetland areas ("Deciduous wooded wetlands");
- 3 flood hazard areas (zones AE and X);
- 0 Category 1 waters;
- 14 land use areas.

Each layer answered in 0.15–0.29 s.

**Label (mandatory on screen, in the PDF and in the first line of every CSV):**

> Screening, not a regulatory determination. NJDEP confirms wetland boundaries with a Letter of Interpretation and flood hazard areas with a verification. Riparian zones under N.J.A.C. 7:13 are measured from the top of bank and vary by water type (300, 150 or 50 ft), so a ring around a stream line only approximates them. Data as of <dates>.

**Parcel line.** Every list or export that contains parcels (a buffer list, a clipped export, a table download) carries one more line: "Parcel data can lag the municipal tax list. This is not a certified list of property owners." Nothing in Studio is designed, named or templated for official notices.

**Images.** Wherever the tagline "council-ready map" appears next to a screening map (example screenshots, README images, the project sheet), the screening label is visible in the image.

### 1.5 Words used in this guide

| Word | Meaning |
| --- | --- |
| **Live** | Queried from the publisher's ArcGIS service by the browser at view time; never stored by us |
| **Hybrid** | Drawn from our vector tiles (PMTiles); counts, lists and downloads queried live from the source |
| **Copy** | Fully ours: the backbone (built) and the two built layers (open space, trails) |
| **Backbone** | The five boundary levels and their area lists; always a copy |
| **Area** | The chosen state, county, municipality, tract or block group |
| **Clip** | For display, a mask outside the area. For data export, geometry cut at the area's edge (points: inside only) |
| **Screening** | A map or list that informs a decision and is labeled as not being a determination |
| **Map document** | The single JSON object describing a map (§4.2); saved as `.map.json` |

### 1.6 Interface text (D-045)

The users are planners, engineers and other professionals.
- **Labels, not explanations.** Controls get short labels ("Buffer", "300 ft", "Export PDF"). No tours, no help text for self-evident controls, no sentences describing what a button does.
- **Words go where a reader could be misled:**
  - the screening label and the parcel line;
  - data dates and "About this data";
  - partial results ("at least N");
  - errors, which say what failed and the one next step.
- **Documents follow the same rule.** README, the project sheet and task reports describe what is new or not obvious, not every feature.

---

## 2. Decisions (recorded by task S0-T1)

Approved by the owner in chat on 2026-09-27, with the clarifications folded in. [../DECISIONS.md](../DECISIONS.md) holds the same entries.

| ID | Decision | Changes |
| --- | --- | --- |
| D-029 | The product is NJ Atlas Studio, a map studio. The layer stack holds up to 8 layers. | Replaces D-005 and D-024 for Studio |
| D-030 | Access modes are `live` (the default), `hybrid` (vector tiles to draw, live queries for counts, lists and exports) and `copy`, set per layer in the recipe. The backbone is always `copy`. | Extends D-008 |
| D-031 | Parcels are live in v1 and never copied. The M7 parcel split (D-025 to D-028) is parked; its code stays but is not published. | Replaces the M7 hosting plan for parcels |
| D-032 | Live and hybrid layers are sliced to the area by the source's own code field when one exists (CATALOG.md "Area"); otherwise the server tests "intersects the area". Copies keep D-006. | Changes D-006 for live layers |
| D-033 | Buffers are straight-line only. The ring is measured from the edge of the selected feature, not its centroid. Studio draws the ring in the browser. Targets are found by the service's distance query (`distance`, `units=esriSRUnit_Foot`), verified for all 32 curated layers, or else by sending the ring as an "intersects" shape. Buffers and their results are never clipped to the area. | Changes OPERATING_GUIDE §1 ("no GIS operations") for Studio |
| D-034 | The map document (§4.2) is the contract. Sharing in v1 means a compressed link plus the `.map.json` file; there is no backend. | New |
| D-035 | Styling uses MapLibre expressions with presets only; the legend comes from the same style object. | New |
| D-036 | PDF export uses an HTML print layout and the browser's own "Save as PDF". PNG export draws from the map canvas. | New |
| D-037 | Hybrid layers ship vector tiles (PMTiles, MVT) carrying the fields their styles, labels and popups need. They ship no separate download files. If a source drops area queries, the fallback is a per-layer GeoParquet file, not a rewrite. | Extends D-012 |
| D-038 | New pinned libraries, loaded only when needed: `@turf/buffer`, `@turf/intersect`, `@turf/bbox-clip` and `@turf/helpers` 7.4.0 (MIT). Compression uses the browser's built-in `CompressionStream`. Drawing is our own small tool. | Changes D-003 and D-015 |
| D-039 | The v1 catalog is CATALOG.md. Unreviewed layers come in v1.1, behind "More layers — unreviewed". | New |
| D-040 | Open core: the public repository is MIT. Paid features (saved short links, branding, private layers, teams) live in a separate private codebase. The Studio credit line appears on exports by default, but data attribution always comes from each layer's own credits. | New |
| D-041 | The flagship is the site screening map. Screening outputs carry the §1.4 label. Nothing is designed or named for official notices; gate GS4 checks the wording (§8). Every list or export containing parcels carries the "not a certified list" line. | New |
| D-042 | The area mask has an on/off switch. Buffer rings and their results always draw above the mask. | New |
| D-043 | If a source drops CORS, rate-limits or caps queries, a Cloudflare Worker proxy is the fallback. It is designed in §4.12 but built only when the nightly check fails for a source. | Changes D-002 when built |
| D-044 | **Export counter, totals only.** One Cloudflare Worker endpoint, `/v1/count`, with the fixed schema in §4.13. A POST adds 1 to one total, keyed by week, pilot code (or `public`), export type and outcome. A GET with the read key returns every total. Pilot contacts and the owner see the totals. Nothing per-user is stored, so nothing per-user can be queried. The counter is off unless `catalog/hosting.json` names its URL, and the Worker counts only requests from the Studio site. Answers O-9. | Changes D-002 and OPERATING_GUIDE §1 ("no analytics") |
| D-045 | **Interface text is written for professionals** (§1.6): short labels, and no explanation of obvious controls or operations. Words go only where a reader could be misled. | New |

---

## 3. Architecture

### 3.1 Picture

```text
                 ┌────────────────────────── browser (GitHub Pages) ──────────────────────────┐
                 │ Studio UI:  Area │ Layers │ Style │ Buffer │ Export                          │
                 │   map document (.map.json) = single source of truth for screen, link, file, print
                 │   registry (catalog.json) → per layer: live client │ tile reader │ backbone reader
                 └─────────┼─────────────────────────────┼──────────────────┼────────────────┘
                           │ ArcGIS REST (CORS ok)        │ HTTP ranges      │ HTTP ranges
        ┌──────────────────┴──────────────┐   ┌──────────┴──────────┐  ┌─────┴─────────────────┐
        │ Publishers' services            │   │ Object storage       │  │ GitHub Pages          │
        │ NJOGIS, NJDEP, ArcGIS Online,   │   │ (Source Cooperative  │  │ site/data: backbone   │
        │ TIGERweb                        │   │  or R2)              │  │ PMTiles + Parquet,    │
        │ LIVE and HYBRID queries: count, │   │ hybrid vector tiles  │  │ area lists and        │
        │ stats, pages, tiles, distance   │   │ (~2 GB)              │  │ outlines (~140 MB)    │
        └─────────────────────────────────┘   └──────────▲──────────┘  └─────▲─────────────────┘
                                                         │ CI build (scheduled)│ release
                                    pipeline/ (Python): fetch → normalize → tag → outputs
        (Fallback, only if needed: a Cloudflare Worker proxy in front of a failing source, §4.12)
```

### 3.2 Data tiers

| Tier | Layers | Built by | Stored in | Refresh |
| --- | --- | --- | --- | --- |
| Backbone (copy) | State, counties, municipalities, tracts, block groups | `pipeline build` (exists) | GitHub Pages `site/data/` | When boundaries change |
| Copy (built) | Preserved open space, trails | `pipeline build` (exists) | Pages, or storage if too large | Quarterly |
| Hybrid | Land use, roads, streams, wetlands, flood zones | `pipeline build` (tiles only) | Source Cooperative or R2 | Per CATALOG.md |
| Live | Everything else in CATALOG.md, including parcels | Nothing: a recipe only | No server-side storage; the browser caches query results for the session | Always current |

**Estimated hybrid tile sizes.** These come from 1,000-record samples at full detail; tiles simplify at low zooms, so real sizes should be smaller. S2 measures them before anything is published.

| Layer | Estimate |
| --- | --- |
| Flood zones | ≤ 1,000 MB |
| Land use | ≤ 640 MB |
| Wetlands | ≤ 225 MB |
| Streams | ≤ 110 MB |
| Roads | ≤ 75 MB |

If flood zone tiles exceed 500 MB, raise its minimum tile zoom or simplify before publishing, and record the choice.

### 3.3 Browser modules

Keep today's modules: `places.js`, `filters.js`, `format.js`, `csv.js`, `data.js`, `state.js` and `text.js`; `map.js` is extended. The new modules live in `site/js/studio/`. Pure modules (marked *) use no browser APIs and are tested with `node --test`.

| Module | Job |
| --- | --- |
| `mapdoc.js`* | Map document: create, validate against `catalog/mapdoc.schema.json`, migrate between versions, list problems in plain words |
| `share.js`* | Map document ↔ `#m=` link (deflate plus base64url, or a plain fallback), size checks, embed snippet text |
| `registry.js`* | Read catalog v2 and answer questions like "can this layer be a buffer target?" and "what is its area mode?" |
| `sql.js`* | Filters → ArcGIS `where` clause (§4.4) |
| `style.js`* | Style object → MapLibre layers and paint properties, plus the legend model (§4.3) |
| `live.js` | ArcGIS client: layer info, count, grouped counts, pages, tile features, distance query. Retries, at most 6 concurrent requests, and the proxy switch (§4.12) |
| `tiles.js` | Live feature tile cache: which tiles are visible, fetch the missing ones, merge them into a GeoJSON source |
| `draw.js` | Minimal drawing: click points, double-click to finish; Escape cancels, Backspace removes the last point |
| `search.js`* | The slower address search: typed address to house number, street and place (D-048) |
| `panels.js` | The four tabs (D-068), the layer list and properties panel (D-070), dialogs, legend, table |
| `screening.js` | Site screening: draw the ring (turf), run distance queries per target, build the results list (called `buffer.js` before D-076) |
| `buffer.js`* | Buffer layers (D-076): the recipe's defaults, names, limits, map layer specs, legend rows and download |
| `geoprocess.js`* | The buffer step: shapes onto State Plane, JSTS buffers, dissolve in chunks, back to longitude and latitude (D-075) |
| `stateplane.js`* | New Jersey State Plane (Transverse Mercator, Krüger's series) and the grid's scale (D-075) |
| `basemaps.js`* | The four basemaps, their colors for Studio's mask and outline, and what On, Dim and Off change (D-079, D-080) |
| `buffer-worker.js` | Runs `geoprocess.js` in a module worker; Cancel ends the worker |
| `clip.js` | Cut live-queried line and polygon features at the area's edge (turf) for exports |
| `export.js` | PNG, the print layout, and CSV and GeoJSON downloads |
| `health.js` | Read `site/data/health.json` and mark failing layers |
| `studio.js` | App state (one map document), panels, and wiring; replaces `main.js` as the entry point |
| `css/print.css` | `@page` sizes and print layout |

### 3.4 Libraries (the only ones allowed)

| Library | Version | Use | Loaded |
| --- | --- | --- | --- |
| maplibre-gl | 6.11.2 | Map and styling engine | Always |
| pmtiles | 4.5.0 | Backbone, copy and hybrid tiles | Always |
| hyparquet | 1.31.1 | Backbone rows | Always |
| @turf/buffer, @turf/intersect, @turf/bbox-clip, @turf/helpers | 7.4.0 | Rings and clipping | When the Buffer or Export panel opens |
| @turf/jsts | 2.7.2 | Buffer layers (D-075): the JSTS build inside @turf/buffer | In the buffer worker, when a buffer runs |

All load from jsDelivr with exact versions (OPERATING_GUIDE.md §5). Add the turf packages to the allowed list in `tools/lint_text.py`.

### 3.5 Performance budgets

| Operation | Budget | Measured on 2026-09-26 or 27 |
| --- | --- | --- |
| Count matches (live) | ≤ 1.5 s | 0.2–0.7 s |
| Checkbox counts per field (live) | ≤ 2.5 s | 0.3–2.0 s |
| First table page, 200 rows (live) | ≤ 2 s | 0.8 s unsorted |
| | | 2.3 s sorted after a filter |
| | | 4.8 s sorted across 59,011 rows |
| One map tile of live features (zoom 15) | ≤ 1 s | 0.55 s, 32 KB |
| Distance query per target layer | **≤ 2 s ceiling** | 0.15–0.46 s |
| Filter change on backbone or copy rows | ≤ 300 ms | 45–133 ms (M4) |
| Screening map from site to results, 4 target layers | ≤ 4 s | not yet measured |
| Print layout ready | ≤ 5 s after "Print" | not yet measured |

**Table rule:** live tables load in the source's order. Sorting is offered only when the filtered count is 5,000 or fewer.

**Trial matrix (S0-T4).** Measure each operation above for:

| Area or case | Why |
| --- | --- |
| Newark (0714) | Dense city |
| Jersey City (0906, 59,011 parcels) | Largest parcel count |
| Long Beach Township (1518) or Ocean City (0508) | Shore town, coastal flood layers |
| Pennsville (1709) | Small rural town, known answers |
| A site on a county line, 1,000 ft buffer | Buffers crossing county borders |
| 8 stacked layers (4 live, 4 hybrid) | Worst-case map load |
| Phone (375 px, throttled "Fast 4G") | Mobile |

### 3.6 Hosting and cost

- **App and backbone:** GitHub Pages, free.
- **Hybrid tiles:** about 2 GB on Source Cooperative (free for open data) or Cloudflare R2 (a few dollars a month). Downloads cost nothing on either.
- **Live queries:** load falls on the publishers' services.
- **Backend:** none for maps. The D-044 counter (§4.13) and, only if ever needed, the §4.12 proxy are Cloudflare Workers within the free tier.

### 3.7 Supported browsers and accessibility

**Browsers:**
- **Full support:** the latest two versions of Chrome, Edge, Firefox and Safari on desktop.
- **Phones (Safari on iOS 16.4+, Chrome on Android):** view, open shared maps and map files, and export PNG. Building maps on a phone is best-effort.
- **Link compression:** `CompressionStream('deflate-raw')` needs Chrome 103+, Firefox 113+ or Safari 16.4+. Without it, the link is written uncompressed and the Export panel recommends the map file.

**Accessibility (WCAG 2.1 AA):**
- Every control has a visible label and works by keyboard.
- The focus ring is visible, and text contrast is at least 4.5:1.
- Palettes are color-blind safe and every legend has text labels.
- Drawing has keyboard alternatives: select a parcel through address search, or type coordinates for a point.
- The results table is a real `<table>`, so the map is never the only way to reach a result.

### 3.8 Errors and offline behavior

- **Failures stay local.** One failing layer never blanks the map. The layer row shows "Source not responding" with a Retry button, and the other layers keep working.
- **Retries:** once after 2 s for timeouts and 5xx responses. For 429 (rate limit), wait for `Retry-After`, or 10 s, and record it for the health check.
- **Exports with a failed layer:** the export asks whether to leave that layer out, and a map is never exported with silent gaps. The PDF lists any layer left out.
- **Unknown fields:** if a recipe's field is missing from the source, the layer row shows "Paused: the source changed." Never guess at the replacement field.
- **Offline:** Studio is online-only; there is no service worker. Offline, a banner says "Offline". A map file can still be downloaded (it is JSON), but it can't be rendered until the connection is back.
- **Health:** the app reads `site/data/health.json` (written nightly, §4.11) and pre-marks layers whose sources failed last night.

---

## 4. Contracts

### 4.1 Layer recipe v2

`catalog/layer.schema.json` (S0-T2, done) plus the extra rules in `pipeline/recipes.py`. The v1 fields keep their meaning, except `style`, which is replaced by `styles`. The table is the complete list of v2 fields; `python -m pipeline validate` enforces every rule in it.

| Field | Values | Required | Rule |
| --- | --- | --- | --- |
| `access` | `live` \| `hybrid` \| `copy` | all | The five boundary layers must be `copy` |
| `area_mode` | `tags` \| `code` \| `intersects` | all | `copy` → `tags`; `live` and `hybrid` → `code` or `intersects` |
| `area_codes` | `{"municipality": {"field", "match": "mun_code"}, "county": {"field", "match"}}` | `code` only | County `match`: `mun_prefix` (first 2 digits of a 4-digit municipal code), `county_number`, `county_fips` or `county_name`. Levels it doesn't name use `intersects` |
| `place_tags`, `tiles` | as in v1 | `copy` | `hybrid` needs `tiles` and has no `place_tags`; `live` has neither |
| `partition` | as in v1 | never (parked, D-031) | `copy` only |
| `min_zoom` | 0–16 | `live` | Features load from this zoom (CATALOG.md "Min zoom") |
| `styles` | 1–5 presets keyed by a short ID (§4.3) | all | Style fields are output field names |
| `default_style` | a key of `styles` | all | A `copy` layer's default is `single` (the atlas draws one color) |
| `legend` | `{"title", "unit"?}` | all | |
| `buffer_role` | `none` \| `source` \| `target` \| `both` | all | CATALOG.md "Buffer" |
| `distance_query` | boolean | `live`, `hybrid` | Absent on `copy` |
| `list_fields` | 1–4 output field names | targets only | Not the label field. The first is the combined list's Type column |
| `clip_mode` | `mask` \| `cut` | all | Points are `mask` |
| `refresh_cadence` | `live` \| `quarterly` \| `yearly_check` \| `static` | all | `live` if and only if `access` is `live` |
| `leave_out` | source field names | all (may be `[]`) | No field, area code or known answer may use one. `OWNER_NAME` is refused in every recipe |
| `known_answers` | `[{"label", "where", "expected": {"min", "max"}}]` | optional; `live` and `hybrid` only | `where` uses source field names; checked nightly (§4.11) |

- **Derived, not stored:** a layer's query source (the publisher for `live` and `hybrid`, our files for `copy`) and its tile file (`<id>/<id>.pmtiles`, under `site/data/` for copies and under the tile host for hybrid layers).
- **Requests:** `outFields` is always the recipe's field list. Studio never requests `*`.
- **Display-time transforms:** field transforms and `value_labels` keep working. For live and hybrid layers they apply **in the browser at display time**, using the same rules as `pipeline/normalize.py`. Features are renamed to output names before styling.
- **Tile fields:** a hybrid layer's tile build writes only the fields its styles, labels, filters and popups use (the existing `tile_columns` rule).
- **Build:** `fetch`, `build`, `check`, `catalog` and `release` act on `copy` layers only; `build` refuses a live layer by name (D-030).

### 4.2 Map document v1 (`catalog/mapdoc.schema.json`)

```json
{
  "schema_version": 1,
  "title": "Site screening: proposed community center",
  "subtitle": "Pennsville Township, Salem County",
  "created_at": "2026-10-05T14:02:00Z",
  "area": {"level": "municipality", "county_fips": "033", "mun_code": "1709", "tract_geoid": null, "bg_geoid": null},
  "mask": true,
  "basemap": "positron",
  "view": {"center": [-75.51, 39.65], "zoom": 15.2, "bearing": 0},
  "layers": [
    {"id": "nj_wetlands", "visible": true, "opacity": 0.8, "filters": [], "style": {"preset": "fill", "overrides": {}}},
    {"id": "nj_flood_zones", "visible": true, "opacity": 0.6, "filters": [], "style": {"preset": "by_zone", "overrides": {}}},
    {"id": "nj_c1_waters", "visible": true, "opacity": 1, "filters": [], "style": {"preset": "line", "overrides": {}}}
  ],
  "buffers": [
    {"id": "b1", "source": {"kind": "feature", "layer": "nj_parcels", "atlas_id": "1709_301_19"},
     "distance_ft": 300, "targets": ["nj_wetlands", "nj_flood_zones", "nj_c1_waters"], "label": "300 ft screening ring"}
  ],
  "layout": {"paper": "letter", "orientation": "landscape", "legend": true, "scale_bar": true,
             "north_arrow": true, "notes": ""},
  "credits": ["New Jersey Office of GIS (NJOGIS)", "This map was developed using NJDEP …"],
  "source_versions": {"nj_wetlands": {"mode": "hybrid", "tiles_built": "2026-10-01", "queried_at": "2026-10-05T14:01:40Z"}},
  "extensions": {}
}
```

**Rules:**

- **Filters** use today's condition shape (OPERATING_GUIDE.md §6.7), and `area` uses today's place codes.
- **`buffers[].source`** is either `{"kind": "feature", "layer", "atlas_id", "label", "geometry"}` or `{"kind": "drawn", "geometry"}`; shapes are GeoJSON rounded to 6 decimals. A feature source keeps its shape so the ring redraws without a lookup (D-056).
- **`targets`** lists layer IDs whose `buffer_role` includes `target`.
- **`style.preset`** is a key of the layer's `styles`; `overrides` holds only keys that preset's kind allows. A preset that no longer exists falls back to `default_style`, with a notice.
- **`source_versions`** is filled at export time. Live and hybrid layers record the query time and the service's `editingInfo.lastEditDate` when it exists; hybrid and copy layers also record the tile build date.
- **Versioning and migration:**
  - any change bumps `schema_version`;
  - `mapdoc.js` has one `migrate_vN_to_vN+1` function per step, and a fixture per version in `tests/fixtures/mapdocs/`;
  - a file from a newer version than the app is not opened; the message is "Made with a newer version of Studio. Reload to open."
- **Opening a file:** unknown layer IDs are dropped, with a notice naming them. Unknown keys go under `extensions` and are never deleted; this is where paid features plug in (D-040).
- **Credits and labels:** always recomputed from the layers and buffers when saving, never typed by the user.

### 4.3 Style presets and legend

Each preset has a `label` (its name in the Style panel) and a `kind`. The schema refuses keys that don't belong to the kind.

| `kind` | Keys | MapLibre result |
| --- | --- | --- |
| `single` | `color` (required), `fill` (polygons; `false` = outline only), `outline`, `opacity`, `width`, `radius` (points) | Constant paint |
| `categories` | `field` (category or text), `colors: {value: color}` or `palette`, `other`, `widths: {value: px}` (lines), `outline`, `opacity`, `width`, `radius` | `["match", ["get", field], v1, c1, …, other]` |
| `graduated` | `field` (number), `classes` (3–7), `method` (`quantile` \| `equal`), `palette`, `breaks`?, `outline`, `opacity`, `width`, `radius` | `["step", ["get", field], c0, b1, c1, …]` |
| `labels` (add-on, any kind) | `field`, `size` (11–16), `halo` | Symbol layer; not for more than 5,000 features in view |

- **Values** in `colors` and `widths` are displayed values, after transforms and `value_labels`.
- **Breaks:** if the preset gives them, they are fixed (ascending, one fewer than `classes`). Otherwise they are computed from live grouped statistics or tile rows, then **stored in the map document**, so a shared map looks identical later.
- **Palettes:** fixed, color-blind-safe lists in `style.js`:
  - for categories: `okabe_ito` (8 colors); `anderson_level1` (urban #E8483F, agriculture #F2D65C, forest #3E8A4F, water #4A8FD1, wetlands #7CC4B2, barren #B7A99A); `flood` (A and AE #6FA8DC, VE #3D6FB6, X (0.2%) #CFE2F3, other X hatched gray);
  - for graduated: `blues`, `greens`, `oranges`, `purples`, 3–7 steps.
- **Roads preset:** categories by `SUBTYPE`, with `colors` and `widths`, widest to thinnest: Interstate, US highway, state highway, county 500 route, other county route, local road. All ramps map to one thin gray value and one legend entry.
- **Streams preset:** categories by stream order, one blue, with `widths`.
- **Legend:** `legendFor(layerEntry, style) → [{swatch, label}]`, rendered by both the map legend and the print legend. It uses `value_labels` and `legend.title`, and shows buffer rings as a dashed swatch labeled with the distance.

### 4.4 Filters → ArcGIS SQL (live and hybrid)

| Condition | `where` |
| --- | --- |
| `in` | `FIELD IN ('a','b')`; with `include_blank`: `(FIELD IN (…) OR FIELD IS NULL)` |
| `contains` | `UPPER(FIELD) LIKE '%TEXT%'`, where TEXT is upper-cased with `'` doubled and `%`/`_` escaped (syntax verified in S1-T2) |
| `range`, number | `FIELD >= min AND FIELD <= max` (either side optional) |
| `range`, date | `FIELD >= DATE 'YYYY-MM-DD' AND FIELD <= DATE 'YYYY-MM-DD'`, or a text comparison where the source stores text dates |
| area, `code` | `PCL_MUN = '1709'`; for a county, `PCL_MUN LIKE '17%'` (the NJ county number, not the FIPS code); name fields compare upper-cased names |

- **Field names:** the translator uses **source** field names. Value labels are translated back to every source code with that label.
- **Shared cases:** `tests/fixtures/sql_cases.json` (at least 25 cases), read by `tests/js/sql.test.js`.
- **Verify the syntax live:** in S1-T2, run one `contains` query with `%` and a quote, and one date range, against a NJDEP server layer and an ArcGIS Online layer. Record what works in `docs/studio/TRIAL.md`.
- **Transforms SQL can't express** (`yymmdd`, `titlecase`) are applied in the browser after the query, and the count reads "at least N" until paging completes. Avoid these in recipes where possible.

### 4.5 Area slicing for live and hybrid layers

- **`code`:** exact and fast; use it wherever CATALOG.md names a code field.
- **`intersects`:** POST the area's simplified outline (about 10 m tolerance, D-049; written by `pipeline catalog` for every level) as `geometry` with `spatialRel=esriSpatialRelIntersects`. "About this data" says "Includes features touching the area."
- **Tracts and block groups** always use `intersects`.
- **Buffers ignore the area** (D-033): their queries have no area filter, so results can lie outside the town or county.

### 4.6 Drawing live layers

- **When:** fetch only at or above `min_zoom`. Below it, the map says "Zoom in to see <plural>" (exists).
- **Tile grid:** zoom 14 for points, 15 for lines and polygons. For each visible tile, send `query?geometry=<tile envelope>&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects&outFields=<style, label and popup fields>&f=geojson&geometryPrecision=6&maxAllowableOffset=<≈1 px>`, plus the filters' `where`.
- **Cache:** keep tiles in a least-recently-used cache (at most 50,000 features per layer), merge them into one GeoJSON source, and remove duplicates by object ID.
- **Format:** v1 uses `f=geojson`, so no decoder is needed. Esri's compact binary format (`f=pbf`) is a later optimization.
- **Server-drawn images** are not used for styled layers.

### 4.7 Site screening (called Buffers before D-076)

- **Sources (D-067, D-074):** a clicked feature of any layer (its full shape is fetched from the source by its ID; when a click finds several features, Studio asks which), or a drawn point, line or area.
- **Ring:** Studio draws it in the browser with `@turf/buffer` (units: feet), styled as a dashed outline **above the mask**.
- **Finding targets:** for each target layer, run one query:
  - with `distance_query: true`, POST `query` with `geometry=<source>`, `distance=<ft>`, `units=esriSRUnit_Foot`, `spatialRel=esriSpatialRelIntersects`, `outFields=<list_fields sources>`;
  - otherwise, POST the ring as an intersects shape.

  Neither carries an area filter.
- **Results panel:**
  - a count per target layer, and a combined list (layer, type, name, ID) that marks the source feature "Site" if it appears;
  - "Download list (CSV)", "Download shapes (GeoJSON)" and "Show on map".
  - Caps: up to 5,000 results per layer. Above that, say so and offer the export only.
- **Labels:** the §1.4 screening label appears on the panel, in file names (`screening_<site>_<date>.csv`) and in the first CSV line. Results that include parcels add the parcel line.
- **Known answer:** §1.4. The distance-query results must equal the counts in §1.4 exactly.

### Basemaps (as built, D-079, D-080)

- Light, Streets, Dark (OpenFreeMap) and Satellite (NJOGIS 2020 photography over USGS imagery), chosen in the map's corner, with a three-way On / Dim / Off slider beneath. Both are saved in the map document (`basemap`, `basemap_mode`).
- Dim: a veil in the basemap's background color at 60%, just beneath Studio's layers, and basemap labels at 45%. Off: every basemap layer hidden and the veil opaque. Each layer's own visibility and label opacity are kept, so On restores them. The mode carries over when the basemap changes.
- The mask and area outline take the basemap's colors (`THEMES`). Prints and PNGs use the same basemap and mode, and add its credit.

### Buffer layers (as built, D-074 to D-078)

- **Input:** a layer on the map that is not a boundary layer (D-074). Choose all its features in the area, a filter (the layer's own filter to start with, then its own), or features selected on the map (click to add or remove; Escape or Done ends). The count shows before running.
- **Distances:** 1 to 6, in feet or meters (one unit per buffer), up to 5 miles or 8,000 m. Each has its own style: fill color and opacity, outline color, width (0 hides it) and solid, dashed or dotted.
- **Dissolve:** off gives one shape per feature and distance, with the feature's name; on gives one shape per distance, with the number of features.
- **Measurement (D-075):** on New Jersey State Plane, corrected by the grid's scale; 7 decimals out. The work runs in `buffer-worker.js`.
- **Output:** one GeoJSON source per buffer; a fill and an outline per distance, largest first, so smaller rings stay on top, drawn just beneath the input layer (D-077). Legend and print rows follow the input layer. A click inside a buffer shows its name, distance, and the feature's name or the number merged.
- **Document (v2):** `buffers: [{id, layer, name, select: all|filter|picked, filters, picked, unit: ft|m, dissolve, visible, distances: [{value, style: {fill, fill_opacity, outline, outline_width, outline_style}}]}]`. Site screenings are under `screenings` (v1 `buffers`). The recipe runs when a document opens. After a buffer has run, a change to its inputs, distances, dissolve or the area runs it again; Cancel stops that until the next run.
- **Limits (D-078):** 4 buffers, 6 distances, 2,000 input features, 500 selected. "Over 2,000 <plural>. Filter them or choose a smaller area."
- **Known answers (tests):** a 1,000 ft buffer's vertices lie 1,000 ft (±0.03 ft) from the point by Vincenty's geodesic; a 250 m buffer's within 0.1 m; the grid matches PROJ to 0.1 mm at six NJ points; a dissolve in chunks has the same area as one done all at once.

### 4.8 Clipped data export

- **Live and hybrid layers:** query with the area filter and all filters, paging through `resultOffset` in steps of 2,000, up to 50,000 features.
  - Build CSV (the existing `csv.js`) or GeoJSON.
  - `clip_mode: cut` intersects each line or polygon with the area outline (turf); `mask` keeps whole features.
- **Backbone and copy layers:** filter their rows as today, and cut geometry the same way.
- **Every file** starts with the credits, the data dates and any screening label: as the first lines of a CSV, or as properties of the GeoJSON collection.
- **Parcels:** whenever parcels are in the export, as a clipped layer or as buffer results, the file also carries the §1.4 parcel line.
- **Above the cap:** "Over 50,000 <plural>. Narrow the filters, or download the full layer from <publisher link>."

### 4.9 Print and PNG

- **Paper:** letter (8.5 × 11 in) and tabloid (11 × 17 in), portrait and landscape, with 0.4 in margins.
- **Layout:** title and subtitle; the map frame; then, in a side column (landscape) or bottom strip (portrait):
  - the legend;
  - a scale bar in feet or miles;
  - a north arrow (SVG; the map stays north-up in v1);
  - credits;
  - data dates;
  - notes;
  - the screening label when buffers exist;
  - the Studio credit line (free tier).
- **Mechanics:** a hidden print container with a second MapLibre map (`preserveDrawingBuffer: true`, `pixelRatio: 2`).
  - Wait for `idle`, with a 20 s timeout and a visible message; never wait forever.
  - Then call `window.print()` with `css/print.css`.
- **PNG:** the same container, `canvas.toBlob()` at 2× (up to 4,096 px on the long side), with the legend and title composed on a second canvas.
- **Tainted canvas check:** call `toBlob` inside `try`. If it throws a security error, name the layer whose source lacks CORS, suggest printing to PDF instead (which still works), and record it for the health check.
- **CORS test (S5-T2):** export a PNG with all 8 layer slots filled (4 live, 4 hybrid) plus the basemap's fonts and icons.

### 4.10 Share link, map file, embed

- **Link:** `#m=<base64url(deflate-raw(JSON))>`, or `#m0=<base64url(JSON)>` without compression.
  - Above 2,000 characters, Copy link warns: "Long link: the map file is more reliable."
  - Old `b=…&layer=…` links still open (state.js).
- **Map file:** "Download map file" and "Open map file" are always visible in the Export panel. The file is `<title-slug>.map.json`, and it is the durable way to share.
- **Embed:** `<iframe src="<site>/?embed=1#m=…" width="800" height="600" title="…"></iframe>`. It hides the panels and keeps the legend, credits, the screening label when present, and "Open in NJ Atlas Studio".

### 4.11 Health check

- **Script:** `tools/healthcheck.mjs` (Node 22, built-in `fetch`, no dependencies). For every live and hybrid recipe it:
  - reads the layer info and fails if a field it uses is missing;
  - runs a `returnCountOnly` count and fails only if it falls outside the recipe's `source.expected_count` range (`min` to `max`);
  - checks every `known_answers` entry;
  - checks CORS on one query and one image or tile;
  - records response times and any 429 responses.
- **Output:** `site/data/health.json`, `{"checked_at", "layers": {"<id>": {"ok", "problem", "ms"}}}`.
- **Schedule:** `.github/workflows/healthcheck.yml`, nightly and on demand. A failed job emails the repository owner (GitHub's default).

### 4.12 Proxy fallback (designed, built only when needed)

- **Trigger:** the health check fails a source for CORS or repeated 429s on two nights in a row. The agent then stops and asks the owner.
- **Design:** a Cloudflare Worker at `proxy.<domain>/<source-key>/<path>`.
  - It forwards only GETs and POSTs to an allowlist of ArcGIS paths, and only the `query` and layer-info endpoints.
  - It adds CORS headers and caches layer info for 1 hour.
  - It stores nothing else.
- **Switch:** `live.js` routes a source through the proxy when the recipe's `source.proxy` is true.
- **Cost:** within the free tier at pilot scale.

### 4.13 Export counter (D-044)

One Worker, one path, a fixed schema. Build it exactly as written; any extra field, header or table needs a new decision.

- **Code:** `workers/counter/index.js` exports `handle(request, env)`, and `workers/counter/schema.sql` creates the table. Tests in `tests/js/counter.test.js` use a fake `env.DB`.
- **Settings (the owner sets them):**
  - `DB`, a Cloudflare D1 database;
  - `READ_KEY`, a secret;
  - `ALLOWED_ORIGIN`, the Studio site's origin;
  - `PILOTS`, the pilots' codes, comma-separated (for example `0714,1709`).

**Table:**

```sql
CREATE TABLE IF NOT EXISTS totals (
  week TEXT NOT NULL,     -- ISO week of the Worker's UTC clock, e.g. 2026-W41
  pilot TEXT NOT NULL,    -- a code from PILOTS, or 'public'
  event TEXT NOT NULL,    -- pdf | png | link | map_file | embed | csv | geojson
  outcome TEXT NOT NULL,  -- ok | failed
  n INTEGER NOT NULL,
  PRIMARY KEY (week, pilot, event, outcome)
);
```

**`POST /v1/count`** (sent by `navigator.sendBeacon`, so the body arrives as `text/plain`):

| Case | Response | Stored |
| --- | --- | --- |
| `Origin` is not `ALLOWED_ORIGIN` | 403 | nothing |
| Body is not exactly `{"v": 1, "event": <event>, "outcome": <outcome>, "pilot": <4 digits or null>}`: no other keys, and values from the lists above | 400 | nothing |
| Valid | 204 | `INSERT INTO totals VALUES (?, ?, ?, ?, 1) ON CONFLICT (week, pilot, event, outcome) DO UPDATE SET n = n + 1` |

- **Pilot field:** a `pilot` value not listed in `PILOTS`, or null, is stored as `public`.

**`GET /v1/count`:**
- With `Authorization: Bearer <READ_KEY>`: 200 and `{"v": 1, "generated_at": "<UTC time>", "totals": [{"week", "pilot", "event", "outcome", "n"}, …]}`, sorted by week, then pilot, event and outcome.
- Otherwise: 401.

**Never stored, logged or returned:** IP address, user agent, cookies, referrer, any time finer than the week, map contents, the area, layer IDs.

**Browser side (`export.js`):**
- After each export attempt, send one beacon if `catalog/hosting.json` has a `counter_url`.
- The pilot code comes from the site address (`?pilot=1709`) and is kept in `localStorage` (D-044: an organization's code, never a person's).
- A failed beacon is ignored and never retried.

**Who reads it:** the owner, and pilot contacts, who get the read key from the owner.

---

## 5. Repository changes

```text
catalog/layer.schema.json           v2 fields (§4.1)
catalog/mapdoc.schema.json          new (§4.2)
catalog/layers/*.json               access and style fields on every recipe; new curated recipes (CATALOG.md)
pipeline/outputs.py                 tile-only builds for hybrid layers (S2-T1)
pipeline/levels.py, catalog.py      simplified area outlines per level (S1-T5)
site/js/studio/*.js                 new modules (§3.3)
site/css/print.css                  print layout
tools/healthcheck.mjs               nightly live checks
tools/publish_tiles.py              upload hybrid tiles with the owner's credentials (S2-T2)
.github/workflows/healthcheck.yml   nightly
.github/workflows/tiles.yml         scheduled rebuild and upload (needs owner secrets)
workers/counter/index.js, schema.sql  export counter (§4.13), deployed by the owner
tests/fixtures/sql_cases.json       shared SQL translation cases
tests/fixtures/mapdocs/*.json       one example map document per schema version
tests/js/{mapdoc,share,sql,style,registry,counter}.test.js
docs/studio/TRIAL.md                trial measurements (S0-T4)
```

`site/js/main.js` keeps serving the atlas at `/atlas/`, and Studio becomes `index.html`. Remove the atlas view only when the owner says so.

---

## 6. Catalog

The full list is in [CATALOG.md](CATALOG.md): 32 curated layers with source, records, area mode, style and filter fields, fields to leave out, license, refresh, default style, buffer role and minimum zoom.

| Group | Layers |
| --- | --- |
| Boundaries | 5 (copy, built) |
| Property and land | 4: parcels live, tax blocks live, land use hybrid, open space copy |
| Water | 6: streams and wetlands hybrid; waterbodies, subwatersheds, Category 1 waters and wellhead areas live |
| Hazards | 3: flood zones hybrid; tidal flood elevation and contaminated sites live |
| Transportation | 3: roads hybrid; bridges and fuel stations live |
| Community | 6, all live |
| Government | 5, all live; school districts is one entry backed by three recipes |

Before any layer is published, the owner reviews its license (O-3).

---

## 7. Milestones and task cards

Each milestone ends in its gate (§8), then the owner signs off in PROGRESS.md.

### S0 · Contracts and trial

#### S0-T1 · Record the decisions
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** DECISIONS.md (D-029 to D-045; O-9 answered by D-044), MILESTONES.md (add "Studio S0–S6: see docs/studio/IMPLEMENTATION_GUIDE.md"), README.md (one line), OPERATING_GUIDE.md §1 (point to this guide for Studio's scope)
- **Done when:** the files are updated, and `tools/lint_text.py` passes.

#### S0-T2 · Recipe v2 schema
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Read:** §4.1, CATALOG.md
- **Write:** `catalog/layer.schema.json`, `pipeline/recipes.py`, `tests/py/test_recipes.py`, every `catalog/layers/*.json`
- **Do:**
  1. Add the §4.1 fields.
  2. Extra rules:
     - `area_mode: code` needs `area_codes`;
     - `hybrid` and `copy` need `tiles`;
     - the backbone must be `copy`;
     - no field entry may use a `leave_out` field.
  3. Update the 10 existing recipes:
     - the backbone, open space and trails are `copy`;
     - contaminated sites and overburdened communities are `live`;
     - parcels is `live`, with `partition` removed (D-031) and `leave_out` listing the mailing fields.
- **Done when:** `validate` and the recipe tests pass, including a test that rejects a recipe asking for `OWNER_NAME`.
- **Don't:** delete the partition code; it is parked.

#### S0-T3 · Map document schema and module
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Read:** §4.2, §4.10
- **Write:** `catalog/mapdoc.schema.json`, `site/js/studio/mapdoc.js`, `site/js/studio/share.js`, tests, `tests/fixtures/mapdocs/v1-screening.json`
- **Do:**
  1. Validate with a small hand-written checker (no library): required keys, types, level codes, distances 1–5,280, at most 8 layers, and targets that exist in `layers`.
  2. Round-trip through both link encodings.
  3. Warn above 2,000 characters.
  4. Refuse documents from a newer version.
- **Done when:** `npm test` passes: a round trip of the fixture, plus four invalid documents with their plain-language messages.

#### S0-T4 · Live trial
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `site/js/studio/live.js` (first version), `docs/studio/TRIAL.md`
- **Do:**
  1. Run every operation in §3.5 for every row of the trial matrix.
  2. Run the §1.4 screening queries.
  3. Try the address search `FULLADDR LIKE 'TEXT%'`, adding `INC_MUNI` when the area is a municipality.
  4. Run one distance query from each source shape (a polygon, a line and a point) against a NJDEP server layer and against an ArcGIS Online layer: 6 queries. Record the counts and times.
  5. Confirm the code fields flagged "to confirm" in CATALOG.md: `COUNTYCODE`, `MCODE_1040`.
  6. Check whether NJDEP publishes a 2020 land use service.
- **Done when:** TRIAL.md holds the measurements against §3.5 and the six distance queries.
- **Don't:** start S1 until every operation is within twice its budget, or the owner has accepted the exception.

### S1 · Live layer stack and filters

#### S1-T1 · Studio shell
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `site/index.html` (Studio), `site/atlas/index.html` (today's page, moved), `site/js/studio/studio.js`, `site/css/style.css`
- **Do:** Five panels in this order:
  1. **Area** (reuse the Boundary section and pickers), with the mask switch;
  2. **Layers**;
  3. **Style**;
  4. **Buffer**;
  5. **Export**.

  Every control changes the one map document through `setDoc(next)`.
- **Also:** `pipeline catalog` writes a Studio entry for every published recipe, live and hybrid included, carrying the §4.1 fields that the browser needs (never `leave_out`, which stays in the recipe).
- **Done when:** changing the area updates the document and the link, and reloading the link restores it.

#### S1-T2 · SQL translation
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `site/js/studio/sql.js`, `tests/fixtures/sql_cases.json`, `tests/js/sql.test.js`, TRIAL.md (syntax results)
- **Done when:** every case passes, and the live syntax checks in §4.4 are recorded.

#### S1-T3 · Live drawing and popups
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `site/js/studio/tiles.js`, `live.js` (complete), `map.js` (a GeoJSON source per live layer)
- **Do:** Follow §4.6. Popups use recipe labels and display-time transforms. Failures follow §3.8.
- **Done when:** Pennsville parcels draw at zoom 15, and each new tile takes under 1 s.

#### S1-T4 · Layer stack
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Do:**
  1. "Add layer" opens the catalog grouped by category, with a search box.
  2. Each row has visibility, opacity, move up and down, remove, and "Filter".
  3. The filters reuse today's controls; live checkbox counts come from grouped statistics.
  4. At most 8 layers.
  5. A drawer under the map holds the count and table.
- **Done when:** three live layers and one copy layer can be stacked, filtered and reordered, and the link restores them.

#### S1-T5 · Area slicing and mask
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `pipeline/levels.py`, `catalog.py` (simplified outlines), `live.js`
- **Do:** Implement §4.5. The mask is a darkened "world minus area" polygon with an on/off switch.
- **Done when:** Pennsville parcels = 6,559, and schools in Essex County equal the source's own count for its code field.

#### S1-T6a/b · Live recipes
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Do:** Write every live recipe in CATALOG.md, following the playbook, `inspect` and the catalog row. Session a covers Property, Community and Government; session b covers Water, Hazards and Transportation.
- **Done when:** `validate` and `node tools/healthcheck.mjs --all` pass for every recipe.

### S2 · Copied vector tiles

#### S2-T1 · Tile builds for the hybrid layers
- **Status:** done 2026-09-27; sizes in PROGRESS.md.
- **Write:** recipes for land use, roads, streams, wetlands and flood zones (`access: hybrid`); `pipeline/outputs.py` (tile-only output: PMTiles and meta, no CSV, GeoJSON or Parquet)
- **Do:**
  1. Fetch and build each layer.
  2. Keep only the fields the styles, labels, filters and popups use.
  3. Record the real size per layer in PROGRESS.md against §3.2.
  4. Apply the flood zone rule if its tiles are over 500 MB.
- **Done when:** all five build and pass `pipeline check` (rules adapted for tile-only output), and the sizes are recorded.

#### S2-T2 · Serve the tiles
- **Status:** local serving and `tools/publish_tiles.py` and `tiles.yml` done 2026-09-27. Waiting on the owner's bucket (O-6); until then releases draw hybrid layers live (D-052).
- **Development:** serve the tiles from `site/data/` through `tools/serve.py`. This doesn't wait for the owner.
- **Owner, before publishing:**
  - create the bucket (Source Cooperative or R2);
  - set CORS to allow `GET` and `HEAD` with `Range` from the site's address;
  - add the upload credentials as GitHub repository secrets.
- **Write:** `tools/publish_tiles.py`, `.github/workflows/tiles.yml`
- **Done when:**
  - hybrid layers draw locally from their tiles, and their lists and counts come from live queries;
  - after the owner's setup, one workflow run uploads the tiles;
  - `curl -H "Origin: <site>" -H "Range: bytes=0-9"` on one tile file returns 206 with `Access-Control-Allow-Origin`.

### S3 · Styling and legend

#### S3-T1 · Style engine
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `site/js/studio/style.js`, `tests/js/style.test.js`
- **Done when:** tests cover the three kinds plus labels, stored breaks, and `legendFor` for a categories style and a graduated style.

#### S3-T2 · Style panel
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Do:** A preset list first, then only the controls the preset needs:
  - a color picker, with palette swatches first;
  - the field;
  - classes (3–7) and method;
  - labels on or off, with a field;
  - opacity;
  - line width.
- **Done when:** a non-GIS tester changes land use to "by type" and roads to "by class" without help.

#### S3-T3 · Legend
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Do:** Render `legendFor` on the map (collapsible) and in print. Hidden layers drop out, buffer rings appear as dashed swatches, and titles come from `legend.title`.
- **Done when:** a script walks every preset of every curated layer and confirms the legend matches the map.

#### S3-T4 · Presets
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Do:** Build the §4.3 palettes and presets into the recipes.
- **Done when:** each hybrid layer has at least 2 presets. The land use legend shows the six Level I classes, and the roads legend shows one entry per road class plus "Ramps".

### S4 · Buffers and the site screening workflow

#### S4-T1 · Select and draw
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `site/js/studio/draw.js`
- **Do:** Click a feature to select it (with its full geometry). Draw a point, line or area, with the keyboard alternatives from §3.7.
- **Done when:** all three shapes can be drawn, and they are saved to the map document.

#### S4-T2 · Buffer and results
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `site/js/studio/buffer.js`
- **Do:** Follow §4.7 exactly: ring above the mask, a distance query per target, no area filter, caps and labels.
- **Done when:**
  - the §1.4 known answer matches exactly;
  - a 1,000 ft buffer on a site at a county line lists results from both counties;
  - with parcels as a target, the list carries the "not a certified list" line.

#### S4-T3 · Site screening template
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Do:** "Start from template → Site screening". It asks for a parcel, address or drawn footprint. It then adds wetlands, flood zones and Category 1 waters with presets, a 300 ft ring targeting all three, the letter-landscape layout and the screening label, and fills in the title.
- **Don't:** add any template, button or wording for official notices.
- **Done when:** a tester reaches a printed screening map in under 5 minutes (G-Studio step 1).

### S5 · Exports and sharing

#### S5-T1 · Print layout
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Write:** `site/js/studio/export.js`, `site/css/print.css`
- **Done when:** letter and tabloid in both orientations print every §4.9 element in Chrome, Edge and Firefox via "Save as PDF".

#### S5-T2 · PNG and the CORS test
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Done when:**
  - the PNG is at 2× with a legend and title, and no blank tiles;
  - the §4.9 CORS test passes with all 8 layer slots and the basemap;
  - the tainted-canvas message has been tested by pointing one layer at a source without CORS.

#### S5-T3 · Link, map file, embed
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Done when:**
  - a map document round-trips through the link, the file and the embed;
  - the long-link warning appears above 2,000 characters;
  - a map file from another computer opens identically.

#### S5-T4 · Clipped data export
- **Status:** done 2026-09-27 (PROGRESS.md).
- **Done when:**
  - CSV and GeoJSON of schools in Newark, parcels in Pennsville (6,559 rows, paged) and land use cut to Pennsville all match the counts on screen;
  - the Pennsville land use acres are within 1% of the town's area;
  - credits, dates and labels are in every file.

### S6 · Pilot

#### S6-T1 · Recruit (owner)
- **Do:** Five pilot municipalities:
  - one city (Newark, Jersey City or Camden);
  - one suburb;
  - one shore town;
  - one rural town;
  - one county planning office.

  Each names one non-GIS staff member and one weekly use (for example grant applications or planning board packets).
- **Also:** three non-GIS testers for the timed tests. Recruit through NJ planning associations, county planning offices and Rutgers contacts.

#### S6-T2 · Export counter (D-044)
- **Status:** code and tests done 2026-09-27; the owner deploys it (workers/counter/README.md).
- **Write:** `workers/counter/index.js`, `workers/counter/schema.sql`, `workers/counter/README.md` (the owner's deploy steps), `tests/js/counter.test.js`, `export.js` (the beacon)
- **Do:** Build §4.13 exactly.
- **Done when:** tests cover a counted POST, the 400 and 403 cases, an unlisted pilot stored as `public`, the GET with and without the key, and a check that the handler never reads `CF-Connecting-IP`, `User-Agent` or `Cookie`.
- **Owner:** creates the D1 database, sets the settings, deploys, and puts the URL in `catalog/hosting.json` as `counter_url`.

#### S6-T3 · Timed tests
- **Do:** Each tester does the G-Studio tasks while someone watches without helping. Record times and every hesitation.
- **Done when:** at least 80% of attempts finish the screening map unassisted in under 5 minutes, or the problems are fixed and the test is repeated.

#### S6-T4 · Six-week pilot
- **Measure:**
  - pilots that export at least one map each week, from the counter's per-pilot totals (target: at least 4 of 5 pilots, every week);
  - export failures, `failed` over all attempts (target: under 2%);
  - top three requests.

  Report weekly in PROGRESS.md.
- **Done when:** six weeks are recorded. The owner decides on paid features from these numbers, not before.

---

## 8. Gates

Record each gate in PROGRESS.md in the existing format.

| Gate | Automated | Manual (with known answers) |
| --- | --- | --- |
| **GS0** | `validate`; `pytest -m "not network"`; `npm test` | TRIAL.md complete for the whole trial matrix; every operation within twice its budget, or accepted by the owner |
| **GS1** | as GS0, plus `node tools/healthcheck.mjs --all` | Pennsville parcels = 6,559; Jersey City parcels = 59,011; schools = 3,736 statewide; congressional districts = 12; legislative districts = 40; a link with 4 layers reopens identically; turning the mask off shows the whole state |
| **GS2** | as GS1, plus `pipeline check` on the 5 hybrid layers | Tile sizes recorded; hybrid layers draw locally from tiles; their counts match a live `returnCountOnly` for Pennsville |
| **GS3** | as GS2, plus the legend-walk script | Land use by Level I shows 6 classes; roads show one entry per class plus "Ramps"; the legend matches the map in both themes |
| **GS4** | as GS3 | The §1.4 screening answer matches (2 wetland areas, 3 flood areas, 0 Category 1 waters, 14 land use areas within 300 ft of Pennsville 301/19); the ring shows through the mask; a county-line buffer lists both counties; labels are present; no notice-workflow wording anywhere (`grep -riE "notice (list|map|mailing|template)|200 ?ft notice|abutter|notification radius|mailing list|notice radius" site/` finds nothing; "200 ft" alone is fine) |
| **GS5** | as GS3 | Letter and tabloid print in 3 browsers; PNG at 2× with 8 layers and no taint; the map file opens identically on another computer; embed keeps the label; the Pennsville land use export is within 1% of the town's area |
| **G-Studio** (S6) | none | 1. Screening map in under 5 minutes, unassisted. 2. "Color land use by type and roads by class, export a tabloid PDF" in under 5 minutes. 3. "Send this map to a colleague" (map file or link). 4. Phone: open a shared map and export a PNG. 5. Keyboard only: tasks 1 and 3. |

---

## 9. Operations

- **Refresh:** hybrid tiles are rebuilt by `tiles.yml` on each layer's cadence. Live layers need nothing. Backbone rebuilds happen by hand.
- **Health:** a nightly check (§4.11). A failing layer shows a warning in the app, never a blank map with no explanation.
- **Versions:** the map document's `schema_version` and the catalog `version` both bump on breaking changes, and old map files must still open (§4.2).
- **Releases:** `tools/release.py` publishes the app and the backbone to GitHub Pages. Tiles publish through `tiles.yml`. Live layers need no release.

## 10. Open core

- **Public (MIT):** everything in this guide.
- **Private (later, separate repository, paid tier):** saved short links, branded templates, private layers (an org's zoning or sewer service areas), team sharing, embeds without the credit line.
- Paid features plug in only through `extensions` and a Worker API. Build nothing for them now beyond `extensions`.

## 11. Risks

| Risk | Answer |
| --- | --- |
| A source drops CORS, rate-limits or caps queries | Nightly check; the proxy fallback (§4.12); paging within 1,000–2,000 records |
| A screening map is read as a determination | Label on screen, in the PDF and in every CSV; names NJDEP as the authority (D-041) |
| Studio is used for official notices | No notice templates or wording; parcel lists carry the "not a certified list" line (D-041) |
| Live performance in large towns | `min_zoom`, tile cache, unsorted pages, caps; the trial (S0-T4) measures before building |
| Hybrid display and live lists differ (tiles are older than the source) | Tile build date and query time both appear on exports; rebuild on each layer's cadence |
| NJDEP's free NJ-GeoWeb | Win on simplicity, several agencies' data, boundary-first slicing and print quality |
| Scope creep toward a full GIS | The OUT list (§1.3), enforced by the stop-and-ask rules (§0) |

## 12. Owner actions, in order

1. ~~Approve the guide and answer O-9~~: done 2026-09-27 (Rev C, D-029 to D-045).
2. License review (O-3) for each curated layer before it is published (CATALOG.md "License").
3. O-4 and the first commit and push (the atlas release is already prepared).
4. For S2 publishing: create the storage bucket and add the upload credentials as GitHub secrets.
5. For S6: create the counter's D1 database and settings (§4.13), and recruit five pilot municipalities and three non-GIS testers.
