# Layer playbook

Follow these steps, in order, every time you add a layer. [nj_counties.json](../catalog/layers/nj_counties.json) is a complete worked example of a copy layer, and [nj_parcels.json](../catalog/layers/nj_parcels.json) of a live one. The recipe contract is [layer.schema.json](../catalog/layer.schema.json), v2 since 2026-09-27: the Studio fields are listed in [studio/IMPLEMENTATION_GUIDE.md](studio/IMPLEMENTATION_GUIDE.md) §4.1, and each layer's values are in its [studio/CATALOG.md](studio/CATALOG.md) row.

## 1. Confirm the layer belongs in this milestone

- The layer is listed in [SOURCES.md](SOURCES.md), or the human named it in DECISIONS.md (O-2).
- Its record count is 200,000 or fewer. Larger layers wait for M7.
- It is statewide data from a public ArcGIS REST layer (`.../MapServer/<n>` or `.../FeatureServer/<n>`).

If any of these fails, stop and ask.

## 2. Inspect the source

```text
.venv\Scripts\python -m pipeline inspect <layer url>  >  build\inspect\<id>.txt
```

Read the whole output and note these things:

- **Count and `maxRecordCount`:** the count sets `expected_count`. Use about ±2% of the count for changing data, or the exact number for fixed sets like counties.
- **Supported formats:** if `geoJSON` is missing, the fetcher uses Esri JSON automatically. Mention it in your report.
- **Field names:** copy them exactly, since they are case-sensitive (`objectid` and `OBJECTID` differ).
- **Distinct values of each text field:** these decide checklist or search, and give real values for examples.
- **Coded-value domains:** inspect prints the code meanings (e.g. `Y=Yes, N=No, U=Unknown`). Copy them into the field's `value_labels` (DECISIONS.md D-017), so users see words instead of codes. Also map stray spellings, such as a literal `<Null>`, to null. If inspect shows no meanings for codes like `1`, `2`, `3`, stop and ask.

## 3. Choose fields a resident would understand

Keep 12 fields or fewer, with at most 8 filters. Ask: "Would a resident, reporter or student filter on this?"

| Field kind | Recipe type and filter | Example |
| --- | --- | --- |
| The item's name | `text`, `search`; use it as `label_field` | Site name, park name |
| Address or free text people search | `text`, `search` | Street address |
| Status or kind with 60 or fewer values | `category`, `checklist` | Status, municipality type |
| Status or kind with more than 60 values | `text`, `search` | Program names |
| Measured amount | `number`, `range`, with `unit` and `decimals` | Acres, population |
| Date | `date`, `range` | Preservation date |
| Internal code needed for joins | `text`, `filter: none`, `popup: false` | County code |

Drop these kinds of fields:

- `Shape_Length`, `Shape_Area` and `SHAPE`: their units are unclear.
- `GlobalID`, unless it is the `id_field`.
- Edit tracking fields.
- Duplicate fields that say the same thing.
- Personal data (owner names, phone numbers, personal addresses) unless DECISIONS.md explicitly allows it.

Also leave out the source's own county, municipality, census tract and block group fields. The build adds consistent place columns instead (`place_tags: all`), and a field named like one of them is rejected.

## 4. Write plain labels

- Labels are short and plain: "Population (2020)", not "POP2020"; "Area", with `unit: "sq mi"`, not "SQ_MILES".
- Use `transform: "titlecase"` for ALL-CAPS categories such as `CAPE MAY`. Don't use it on acronyms (`NJDEP`, `LSRP`), because titlecase would mangle them.
- After a transform, examples must use the transformed values: "Coastal", not "COASTAL".

## 5. Fill in the descriptive parts

- **`summary`:** one or two sentences saying what the items are and why someone would look at them. Avoid jargon.
- **`noun`:** lower-case singular and plural, e.g. `site` and `sites`, or `open space area` and `open space areas`.
- **`category`** and the default style's **`color`:** use this palette so topics look consistent.

  | Category | Color |
  | --- | --- |
  | boundaries | `#1D4E89` |
  | property | `#8A5A44` |
  | environment | `#2E7D4F` |
  | hazards | `#C0392B` |
  | water | `#1F78B4` |
  | transportation | `#6B4C9A` |
  | community | `#B7791F` |
  | government | `#34495E` |
  | planning | `#5D6D7E` |
  | history | `#8E6C3A` |

- **`tiles`** (copy and hybrid layers; live layers use `min_zoom` from CATALOG.md): choose the zoom range by layer size.

  | Layer | min_zoom | max_zoom |
  | --- | --- | --- |
  | Up to 1,000 polygons | 5 | 11 |
  | 1,000–50,000 polygons | 7 | 13 |
  | More than 50,000 polygons | 8 | 14 |
  | Points | 7 | 14 |
  | Lines | 7 | 14 |

- **`place_tags`** (copy layers only): `all` for every data layer. Only the five boundary layers in `pipeline/levels.py` use other modes, and `validate` enforces both. Splitting a large layer by municipality (OPERATING_GUIDE.md §6.9) is parked (D-031); large layers are live.

## 6. Fill in the license block, and never the review fields

- **`license.name`** and **`license.url`:** the terms as the publisher states them. Look on the landing page, and in the ArcGIS item's "licenseInfo" if the layer has an item page. If you can't find them, leave both `null` and say so in the report.
- **`license.attribution`:** the credit line the publisher asks for, word for word if they give one. Otherwise use the publisher's name.
- **`reviewed_by`** and **`reviewed_on`** stay `null`, and `status` stays `draft`. Only the human changes them.

## 7. Write 2–3 examples

- Base every example on values you saw in the inspect output.
- At least one example uses a place, e.g. `{"county_fips": "011"}` for Cumberland County. [SOURCES.md](SOURCES.md) lists how to find county codes. A place may also name `mun_code`, `tract_geoid` or `bg_geoid`; the viewer moves the Level down to show it.
- Labels read like questions a person would ask: "Active sites in Camden County", "Open space over 100 acres".
- Range bounds are inclusive, so say "or more" and "or less", not "more than".

## 8. Build, check and look

```text
.venv\Scripts\python -m pipeline validate
.venv\Scripts\python -m pipeline build <id> --include-drafts
.venv\Scripts\python -m pipeline check <id>
.venv\Scripts\python -m pipeline catalog --include-drafts
.venv\Scripts\python tools/serve.py
```

In the browser, do all of the following:

- Select the layer and click three items. The popups read well.
- Try each filter once.
- Open `/?selftest` and confirm it shows PASS.
- Look at the first rows of the results table. If a stand-in value like "Unknown", "(none)", "<Null>" or "N/A" appears as a *name*, map it to null with `value_labels`, because it would otherwise sort to the top. Keep "Unknown" as a checklist option, where it tells users the publisher doesn't know.

Then run `python tools/gate.py G1 --layer <id>` and the G1 manual checks.

## 9. Hand over for human review

Append a report to PROGRESS.md with:

- the fields kept and dropped, with one line of reasoning each;
- the license text found, with its URL, or "not found";
- the row count, file sizes and any repaired or dropped shapes;
- open questions, for example a field whose meaning is unclear.

Then stop. The human reviews the license and decides when to set `status: published`.

## Common problems

| Problem | Fix |
| --- | --- |
| `check` rule 12 fails: too many values | Change that field to `text` with `search` |
| PMTiles or Parquet over 95 MB | Drop wide text fields from the tiles (`popup: false`, `filter: none`), raise `min_zoom`, or move the layer to M7 |
| Place tag coverage under 99% | Items offshore or outside NJ. Report the count; the human decides whether to accept or filter with `where` |
| Dates show as 1970-01-01 | The source stores 0 for "no date". Treat 0 as null in normalize and add a test |
| Items vanish at statewide zoom | Expected for dense layers. Raise `min_zoom` so the "Zoom in" hint appears instead of a half-drawn layer |

## Map copies of large layers (hybrid, Studio)

A hybrid layer (`access: hybrid`) ships a map copy only: `python -m pipeline build <id>` streams the download to `build/raw/<id>/source.geojsonl`, then writes `site/data/<id>/<id>.pmtiles` and `meta.json`.

- **Generalization.** The download is simplified to about 1 m by the server. Shapes narrower than that can collapse to nothing; they are dropped from the map copy only, because counts, lists and exports read the source (D-065). `pipeline check <id>` requires rows plus dropped shapes to be inside `expected_count`, and at most 5% dropped unless the recipe records a reviewed `tiles.max_dropped_share` (flood zones: 0.08).
- **Shape repairs (D-063).** Invalid shapes go through `make_valid`. When GEOS refuses a shape that mixes dimensions ("Overlay input is mixed-dimension"), the build tries the structure repair without collapsed parts, then `buffer(0)`, whole and then part by part. Shapes nothing can repair are dropped and counted in `dropped_empty_shapes`. NJDEP flood zones needed all of this; other layers may too.
- **Tile limits.** The tile writer truncates a tile above 200,000 shapes. If the build warns about it, raise `tiles.min_zoom` until it stops (land use starts at 9, D-066); Studio draws a map copy only from its minimum zoom.

## Buffer role (D-074)

- `buffer_role: both` for a layer people buffer or screen from (schools, parcels, streams, flood zones…).
- `buffer_role: target` for a **boundary layer**: administrative, political, statistical or hydrologic units and designations drawn on them (categories `boundaries` and `government`, subwatersheds, overburdened communities, tax blocks). It can be listed inside a screening but never buffered. `pipeline validate` enforces this; a new boundary-like layer outside those categories goes into `BOUNDARY_LAYERS` in `pipeline/recipes.py`.
- Either way, `list_fields` is required (the screening list).

