# Verified source facts

These facts were checked against the live services on **2026-09-24**. They are the starting point for recipes. Run `python -m pipeline inspect <url>` before writing a recipe anyway, because services change.

The older research copied from NJ-Spatial is in `seed/`:

- `seed/datasets.json`: 20 candidate dataset families with publisher landing pages.
- `seed/sources/`: reviewed ArcGIS profiles, with exact field lists and terms evidence.
- `seed/SOURCE_NOTES.md`: notes about each family.

## County codes

Use the 3-digit FIPS code everywhere in NJ-Atlas (`county_fips`). NJ's own municipal codes (`MUN_CODE`) begin with a different, alphabetical 2-digit county number. **Never use the first two digits of `MUN_CODE` as FIPS.**

| County | FIPS (`county_fips`) | NJ number (first two digits of `MUN_CODE`) |
| --- | --- | --- |
| Atlantic | 001 | 01 |
| Bergen | 003 | 02 |
| Burlington | 005 | 03 |
| Camden | 007 | 04 |
| Cape May | 009 | 05 |
| Cumberland | 011 | 06 |
| Essex | 013 | 07 |
| Gloucester | 015 | 08 |
| Hudson | 017 | 09 |
| Hunterdon | 019 | 10 |
| Mercer | 021 | 11 |
| Middlesex | 023 | 12 |
| Monmouth | 025 | 13 |
| Morris | 027 | 14 |
| Ocean | 029 | 15 |
| Passaic | 031 | 16 |
| Salem | 033 | 17 |
| Somerset | 035 | 18 |
| Sussex | 037 | 19 |
| Union | 039 | 20 |
| Warren | 041 | 21 |

## v1 layers

### nj_counties: Counties (M1, recipe provided)

- **URL:** `https://maps.nj.gov/arcgis/rest/services/Framework/Government_Boundaries/MapServer/1`
- **Records:** 21 polygons. `maxRecordCount` 1000. Formats: JSON, geoJSON, PBF. Source CRS: EPSG:3424 (NJ State Plane, feet). Always request `outSR=4326`.
- **Fields:** `COUNTY` (upper case, "ATLANTIC"), `COUNTY_LABEL` ("Atlantic County"), `CO`, `FIPSSTCO` ("34001"), `FIPSCO`, `REGION`, `ACRES`, `SQ_MILES`, `POP1980`–`POP2020`, `POPDEN1980`–`POPDEN2020`, `GNIS`, `GNIS_NAME`.
- **`REGION` values:** CENTRAL, COASTAL, NORTHEASTERN, NORTHWESTERN, SOUTHERN.
- **Quirk:** `FIPSCO` is **not zero-padded** ("1" for Atlantic). Derive `county_fips` from `FIPSSTCO` with `transform: last3`.

### nj_municipalities: Municipalities (M1-T7)

- **URL:** `https://maps.nj.gov/arcgis/rest/services/Framework/Government_Boundaries/MapServer/2`
- **Records:** 564 polygons. `maxRecordCount` 1000. Source CRS: EPSG:3424.
- **Fields:** `MUN` (upper case, abbreviated), `COUNTY` (upper-case county name), `MUN_LABEL` ("Cape May Point Borough"), `MUN_TYPE`, `NAME`, `MUN_CODE` (4-digit string, "0503"), `SSN`, `CENSUS2020` (10-digit Census GEOID), `ACRES`, `SQ_MILES`, `POP1980`–`POP2020`, `POPDEN1980`–`POPDEN2020`.
- **`MUN_TYPE` values:** Borough, City, Town, Township, Village.
- **Use layer 2, not layer 8.** Layer 8 ("Municipalities Clipped Coast", 565 records) trims coastal water. The unclipped layer 2 gives better place-tag coverage for items along the shore.
- **`id_field`:** `MUN_CODE`, which is unique.
- **Place tags:** `county` and `county_fips` come from place tagging against counties. Don't map them from the `COUNTY` text field.

### nj_state: State outline (M5B-T2)

- **URL:** `https://maps.nj.gov/arcgis/rest/services/Framework/Government_Boundaries/MapServer/0` ("NJ State Boundary"), checked 2026-09-25.
- **Records:** 1 polygon. Formats: JSON, geoJSON, PBF. Source CRS: EPSG:3424.
- **Fields:** `NAME` ("New Jersey"), `GNIS_NAME`, `GNIS` ("1779795"), `ACRES`, `SQ_MILES` (8,671.1). No population fields.
- **`id_field`:** `GNIS`.

### nj_census_tracts: Census tracts (M5B-T2)

- **URL:** `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/6` ("Census Tracts", 2020 Census), with `where: STATE='34'`. Checked 2026-09-25.
- **Records:** 2,181 polygons in New Jersey. `maxRecordCount` 100,000. Formats: JSON, geoJSON, PBF.
- **Fields:** `GEOID` (11 digits, "34017011100"), `STATE`, `COUNTY` ("017"), `TRACT` ("011100"), `BASENAME` ("111"), `NAME` ("Census Tract 111"), `AREALAND` and `AREAWATER` (square meters, whole numbers), `POP100` and `HU100` (2020 population and housing units), `CENTLAT`, `CENTLON`, `INTPTLAT`, `INTPTLON`, `OBJECTID`.
- **`id_field`:** `GEOID`. Land area uses `transform: sq_m_to_sq_mi` (D-022).
- **Totals:** `POP100` sums to 9,288,994, New Jersey's 2020 census population.
- **Quirk:** tracts reach into the ocean and bays to the state's water line; the southernmost point is at latitude 38.79. 32 offshore water tracts lie outside the NJOGIS county outlines, so county comes from the code (D-021).

### nj_block_groups: Block groups (M5B-T2)

- **URL:** `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/8` ("Census Block Groups"), with `where: STATE='34'`. Checked 2026-09-25.
- **Records:** 6,599 polygons in New Jersey. Same fields as tracts plus `BLKGRP` ("1"); `GEOID` has 12 digits, and `NAME` reads "Block Group 1".
- **`id_field`:** `GEOID`. The tract is the first 11 digits of `GEOID`.

### nj_contaminated_sites: Known contaminated sites (M4-T1)

- **URL:** `https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer/0`
- **Records:** 12,610 points. `maxRecordCount` 2000.
- **Fields (first 18):** `OBJECTID`, `SITE_ID`, `PI_NAME`, `ADDRESS`, `PI_NUMBER`, `LEAD`, `STATUS`, `REM_LEVEL`, `REMEDIAL_L`, `CEA_STATUS`, `DN_STATUS`, `EC_STATUS`, `NPL_STATUS`, `COORDINATE`, `UNK_SOURCE`, `CATEGORY`, `COUNTY`, `MUNIC`. Run inspect for the rest.
- **Not yet verified:** supported query formats, distinct values, and whether `SITE_ID` is unique. Check `SITE_ID` before using it as `id_field`; otherwise use `OBJECTID`.
- **Publisher:** NJ Department of Environmental Protection (NJDEP). The landing page is in `seed/datasets.json` under `nj_contaminated_sites`.

### nj_preserved_open_space: Preserved open space (M4-T2)

- **URL:** `https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Open_Space/FeatureServer/66`
- **Records:** 95,032 polygons. `maxRecordCount` 2000. That means 48 pages of up to 2,000 records; M1-T1's batch size is capped at 1,000, so expect about 96 requests.
- **Fields:**
  - First 18: `OBJECTID`, `COUNTY`, `MUNICIPALITY`, `PAMS_PIN`, `PCL_MUN`, `PCLBLOCK`, `PCLLOT`, `PCLQCODE`, `GISACRES`, `PAMS_PIN_OLD`, `STATCODE`, `MANAGETYPE`, `MANAGED_BY`, `OWNERTYPE`, `OWNER`, `CO_OWNERS`, `NAME_LABEL`, `USE_LABEL`.
  - Also present, from the seed profile: `ACCESS_TYPE`, `ENCUMBRANCE_STATUS`, `GLOBALID`, `PRESERVATION_DATE`.
- **`id_field`:** `GLOBALID`.
- **Attribution:** NJDEP requires the exact attribution sentence stored in `seed/sources/pennsville-open-space.json` (`attribution`). The terms item is also recorded there (`item_url`).
- **Scope:** NJ-Spatial restricted this layer to `ENCUMBRANCE_STATUS = 'Encumbered'` for its analysis. **NJ-Atlas shows every record** and offers encumbrance status as a filter instead, unless the human decides otherwise.
- **Size:** expect PMTiles and Parquet to be the largest v1 files. Use `min_zoom` 8, and verify the 95 MB limit.

### nj_overburdened_communities: Overburdened communities (M4-T3a, chosen in O-2)

- **URL:** `https://mapsdep.nj.gov/arcgis/rest/services/Features/Government/MapServer/42` ("Overburdened Communities under the New Jersey EJ Law")
- **Records:** 3,180 polygons, checked 2026-09-25. Supports geoJSON.
- **Fields seen:** `POVUNIVERSE`, `POPUNDER2XPOV`, `LOW_INCOME_PCT`, `TOTALPOP`, `NONHISPWHITE`, `TOTALMINORITY`, `MINORITY_PCT`, `TOTHH`, `TOTLANGUAGEISO` and more. Run inspect for the full list, the ID field and whether percentages are stored as 0-1 or 0-100.
- **Publisher:** NJDEP. The records are Census block groups, so place tags come from each block group's point inside it.
- **Codes differ from the 2020 Census:** 476 of the 3,180 `GEOID` values are not 2020 block group codes, and 761 differ from the block group the atlas tags by point. The recipe keeps NJDEP's code as "Community code", and the "Block group" column comes from the 2020 Census outlines, like every other layer.

### nj_trails: Statewide trails (M4-T3b, chosen in O-2)

- **URL:** `https://mapsdep.nj.gov/arcgis/rest/services/Features/Land_lu/MapServer/121` ("New Jersey Statewide Trails")
- **Records:** 12,761 lines, checked 2026-09-25. Supports geoJSON.
- **Fields seen:** `TRAIL_NAME_SEGMENT`, `TRAIL_NAME_LONG`, `BLAZE_COLOR`, `BLAZE_DESCRIPTION`, `MULTI_USE`, `HIKING`, `BIKING`, `MOUNTAIN_BIKING`, `CROSS_COUNTRY_SKI` and more. Check whether the activity fields hold Yes/No text or codes.
- **Publisher:** NJDEP. This is the first line layer, so it exercises the viewer's line style and the line branch of geometry repair.

### nj_parcels: Property parcels (M7, split by municipality)

- **URL:** `https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0`, checked 2026-09-26. Landing page: https://www.nj.gov/njgin/edata/parcels/
- **Records:** 3,481,240 polygons. `maxRecordCount` 2000. Source CRS: EPSG:3857.
- **Splitting:** `PCL_MUN` holds the 4-digit municipal code on every record; its 564 values match the municipalities layer exactly. `COUNTY` is empty on 403,260 records, so don't split by it. The largest municipality is Jersey City (`0906`, 59,011 parcels).
- **`id_field`:** `OBJECTID`, because `PAMS_PIN` repeats (3,480,497 distinct values).
- **Personal data:** `OWNER_NAME` is blank everywhere. The owner's mailing address (`ST_ADDRESS`, `CITY_STATE`, `ZIP_CODE`) is present and left out (O-5, [PARCELS_REVIEW.md](PARCELS_REVIEW.md)).
- **Quirks:** `YR_CONSTR` and `SALE_PRICE` use 0 for unknown (`zero_is_blank`); `DEED_DATE` is `YYMMDD` with two-digit years (`yymmdd`); prices of 1 or 10 are nominal transfers. `PROP_CLASS` codes get plain labels (e.g. 15C, "Public property").
- **Speed:** a 1,000-parcel page takes about 1.2 s. The statewide download takes about 2.5 hours, and the build about an hour.

## Deferred to M7 (too large for GitHub Pages)

| Layer | URL | Records | Notes |
| --- | --- | --- | --- |
| Building footprints | `https://mapsdep.nj.gov/arcgis/rest/services/Features/Structures/MapServer/8` | 2,885,707 | Fields are mostly technical (`year`, `project`, `section`). Limited value for filtering. |
| FEMA flood hazard zones | `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` | National service | Needs a New Jersey envelope query; see `seed/sources/pennsville-flood.json`. Candidate for O-2 only if a statewide count fits M4. |

## Other candidates (unverified)

`seed/datasets.json` lists 20 families. Besides the layers above, these have ArcGIS-type sources worth inspecting when the human picks M4 layers (O-2): land use/land cover, wetlands, hydrography. Families whose sources are downloads, APIs or rasters (Census geographies, ACS demographics, transit, elevation, imagery, schools, hospitals) are outside v1, which is ArcGIS-only (DECISIONS.md D-011).
