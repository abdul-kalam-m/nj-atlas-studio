# NJ Atlas Studio: curated layer catalog (v1)

This is the appendix to [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §6. It lists the 32 curated layers: the 5 boundary levels plus 27 list entries. School districts are one entry backed by three recipes, so there are 34 recipes in all.

Every layer was probed on 2026-09-26 or 2026-09-27. Every non-boundary service supports paging and distance queries, with a record limit of 1,000–2,000 per request. Recipes written from this table must still run `python -m pipeline inspect <url>` first, because services change.

## Columns

- **Access:** `live` is queried at view time and never stored. `hybrid` draws from our vector tiles but lists and exports live. `copy` is fully ours (the backbone and the two built layers).
- **Area:** the source field used to slice by municipality or county when one exists (exact). Otherwise `intersects`, where the server tests the area's outline.
- **Style / filter fields:** the source fields the default style and the filters use. S1-T6 and S2-T4 confirm them.
- **Leave out:** fields that must never be requested or shown.
- **License:** proposed; the owner confirms each one (O-3) before a layer is published.
  - NJOGIS: "NJOGIS terms of use (credit requested)".
  - NJDEP: "NJDEP Data Distribution Agreement", with the NJDEP standard credit sentence.
  - Census and other federal data: public domain.
- **Buffer:** S means it can be a buffer source (click to select); T means it can be a buffer target (listed inside rings). Since D-067 (2026-09-27) every layer except the state outline is both; the column keeps the original v1 plan.
- **Min zoom:** for live layers, the zoom at which features start loading. *As built (D-081): point layers load whole at any zoom up to 15,000 in the area; several minimum zooms moved further out. The recipes in `catalog/layers/` are the record; the table below is the Rev C plan.*
- **Buffer (as built, D-074):** boundary layers are `target` (listed in a screening, never buffered).
- **Added after Rev C (D-083):** 17 layers from Tier 1 of [CANDIDATES.md](CANDIDATES.md), with 3 more as drafts; the recipes are the record.

## Boundaries (copy, built)

| Layer | Source | Records | Area | Refresh | Default style | Buffer |
| --- | --- | --- | --- | --- | --- | --- |
| State | NJOGIS `Government_Boundaries/MapServer/0` | 1 | — | static | Outline | — |
| Counties | NJOGIS `Government_Boundaries/MapServer/1` | 21 | own code | static | Outline | S |
| Municipalities | NJOGIS `Government_Boundaries/MapServer/2` | 564 | own code | yearly check | Outline | S |
| Census tracts | TIGERweb 2020 `tigerWMS_Census2020/MapServer/6` | 2,181 | own code | static (2020) | Outline | S |
| Block groups | TIGERweb 2020 `tigerWMS_Census2020/MapServer/8` | 6,599 | own code | static (2020) | Outline | S |

## Property and land

| Layer | Access | Source | Records | Area | Style / filter fields | Leave out | License | Refresh | Default style | Buffer | Min zoom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Parcels | live | NJOGIS `Parcels_Composite_NJ_WM/FeatureServer/0` | 3,481,240 | `PCL_MUN` | `PROP_CLASS`, `CALC_ACRE`, `NET_VALUE`, `PROP_LOC`, `PCLBLOCK`, `PCLLOT`, `YR_CONSTR`, `SALE_PRICE`, `DEED_DATE` | `OWNER_NAME`, `ST_ADDRESS`, `CITY_STATE`, `ZIP_CODE`, `ZIP5`, `ZIP_PLUS4` | NJOGIS | live | Outline; preset "by property class" | S, T | 15 |
| Tax blocks | live | NJOGIS `Framework/Cadastral/MapServer/2` | 165,961 | `MUN` | `BLOCK` | — | NJOGIS | live | Outline, block labels | T | 14 |
| Land use 2015 | hybrid | NJDEP `Land_lu/MapServer/13` | 590,537 | intersects | `TYPE15`, `LABEL15`, `LU15`, `ACRES` | — | NJDEP | yearly check (check for a 2020 edition in S0-T4) | Categories by `TYPE15` (Anderson Level I) | T | tiles from 8 |
| Preserved open space | copy (built) | NJDEP `Open_Space/FeatureServer/66` | 95,031 | `PCL_MUN` (and tags) | `USE_LABEL`, `ACCESS_TYPE`, `OWNERTYPE`, `GISACRES` | — | NJDEP | quarterly | Green fill; preset by kind | S, T | tiles from 8 |

## Water

| Layer | Access | Source | Records | Area | Style / filter fields | Leave out | License | Refresh | Default style | Buffer | Min zoom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Streams 2015 | hybrid | NJDEP `Hydrography/MapServer/49` | 269,525 | intersects | `FTYPE_DESCRIPTION`, `STREAMORDER`, `GNIS_NAME` | — | NJDEP | yearly check | Blue lines, width by `STREAMORDER` | S, T | tiles from 9 |
| Waterbodies 2015 | live | NJDEP `Hydrography/MapServer/33` | 39,774 | intersects | `FTYPE_DISPLAY`, `WATERBODY_NAME`, `AREASQKM` | — | NJDEP | live | Water fill | S, T | 12 |
| Wetlands 2012 | hybrid | NJDEP `Land_lu/MapServer/2` | 143,206 | intersects | `LABEL12`, `LU12`, `ACRES` | — | NJDEP | yearly check | Wetland fill; preset by `LABEL12` | T | tiles from 9 |
| Subwatersheds (HUC14) | live | NJDEP `Hydrography/MapServer/22` | 970 | intersects | `HUC14`, `SW_NAME`, `WMA_NAME` | — | NJDEP | live | Outline, `SW_NAME` labels | S, T | 8 |
| Category 1 waters | live | NJDEP `Hydrography/MapServer/6` | 100,059 | intersects | `CATEGORY`, `NAMECK`, `DATE_EFFECTIVE` | — | NJDEP | live | Dark blue line | S, T | 12 |
| Wellhead protection (community) | live | NJDEP `Hydrography/MapServer/25` | 6,288 | intersects | `TIER`, `TRAVELTIME` | — | NJDEP | live | Fill by `TIER` | T | 11 |

## Hazards

| Layer | Access | Source | Records | Area | Style / filter fields | Leave out | License | Refresh | Default style | Buffer | Min zoom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Flood hazard zones | hybrid | NJDEP `Hydrography/MapServer/43` | 109,075 | intersects | `FLD_ZONE`, `ZONE_SUBTY` | — | NJDEP (data from FEMA) | quarterly | Categories by `FLD_ZONE` | T | tiles from 9 |
| Tidal climate-adjusted flood elevation | live | NJDEP `Hydrography/MapServer/48` | 54,571 | `COUNTY` (name) | `FLD_ZONE` | — | NJDEP | live | Fill | T | 12 |
| Known contaminated sites | live | NJDEP `Environmental_NJEMS/MapServer/0` | 12,610 | `COMU_CODE` (4-digit municipal code, verified 2026-09-27) | `STATUS`, `REMEDIAL_L`, `CATEGORY`, `LEAD`, `PI_NAME`, `ADDRESS` | — | NJDEP | live | Points by `STATUS` | S, T | 9 |

## Transportation

| Layer | Access | Source | Records | Area | Style / filter fields | Leave out | License | Refresh | Default style | Buffer | Min zoom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Roads | hybrid | NJOGIS `Tran_road/FeatureServer/0` | 489,277 | intersects (`INCMUNI_L`/`_R` are names) | `SUBTYPE` (road class), `ST_NAME`, `SPEEDLIMIT`, `JURISDICTN` | — | NJOGIS | quarterly | By `SUBTYPE`: Interstate > US > State > County 500 > other county > local; ramps thin gray | S, T | tiles from 8 |
| Bridges | live | NJOGIS `Bridges/FeatureServer/0` | 7,878 | intersects (`COUNTY` is a numeric code, D-050) | `STRUCNAME`, `FEATINT`, `FACILITY`, `OWNER` | — | NJOGIS (data from NJDOT) | live | Points | T | 11 |
| Alternative fuel stations | live | NJDEP `Structures/MapServer/1` | 1,773 | intersects | `FUEL_TYPE`, `STATION_NAME`, `EV_DC_FAST`, `EV_LEVEL_2` | — | NJDEP (data from U.S. DOE) | live | Points by `FUEL_TYPE` | T | 9 |

## Community

| Layer | Access | Source | Records | Area | Style / filter fields | Leave out | License | Refresh | Default style | Buffer | Min zoom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Schools (public, private, charter) | live | NJOGIS `School_Point_Locations_of_NJ/FeatureServer/0` | 3,736 | intersects (`COUNTYCODE` is not the NJ county number: values reach 80, D-050) | `SCHOOLTYPE`, `SCHOOL`, `DIST_NAME` | `PHONE` | NJOGIS (data from NJDOE) | live | Points by `SCHOOLTYPE` | S, T | 9 |
| Acute care hospitals | live | NJOGIS `Acute_Care_Hospitals_in_New_Jersey/FeatureServer/0` | 71 | `COUNTY` (name) | `LICENSED_NAME`, `FACILITY_TYPE` | `FACEMAIL`, `FAXPHONE` | NJOGIS (data from NJDOH) | live | Points | S, T | 7 |
| Long-term care facilities | live | NJOGIS `NJ_Long_Term_Care_Facilities/FeatureServer/0` | 730 | intersects | `FacilityName`, `FacilityType` | — | NJOGIS (data from NJDOH) | live | Points by type | S, T | 9 |
| Child care centers | live | NJDEP `Structures/MapServer/4` | 4,083 | `county` (name) | `center_name`, `licensed_capacity`, `age_range` | `owner`, `director`, `center_phone`, `pref_id_num` (personal names and contact details) | NJDEP (data from NJ DCF) | live | Points | S, T | 11 |
| Colleges and universities | live | NJOGIS `Colleges_and_Universities_in_NJ_3424/FeatureServer/1` | 78 | `MUN_CODE` | `NAME`, `NAICSDESCR` | `PHONE` | NJOGIS | live | Fill | S, T | 7 |
| Overburdened communities | live | NJDEP `Government/MapServer/42` | 3,180 | `MUN_CODE` | `OVERBURDENED_COMMUNITY_CRITERI`, `LOW_INCOME_PCT`, `MINORITY_PCT`, `TOTALPOP` | — | NJDEP | live | Fill by criteria | S, T | 8 |

## Government

| Layer | Access | Source | Records | Area | Style / filter fields | Leave out | License | Refresh | Default style | Buffer | Min zoom |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Congressional districts | live | NJOGIS `Congressional_Districts_of_NJ_Hosted_3857/FeatureServer/0` | 12 | intersects | `DIST_LABEL`, `US_REP`, `PARTY` | `CONTACT` fields (link out instead) | NJOGIS | live | Outline, labels | S | 5 |
| Legislative districts | live | NJOGIS `Legislative_Districts_of_NJ_Hosted_3857/FeatureServer/0` | 40 | intersects | `DIST_LABEL`, `SENATOR`, `A1_REP`, `A2_REP` | `*_CONTACT` | NJOGIS | live | Outline, labels | S | 6 |
| Election districts | live | NJOGIS `Election_Districts_for_New_Jersey/FeatureServer/0` | 6,348 | `MCODE_1040` (4-digit municipal code, verified 2026-09-27) | `ELECD_KEY`, `WARD_CODE`, `LEGIS_DIST`, `CONGR_DIST` | — | NJOGIS | live | Outline | S, T | 10 |
| Wards | live | NJOGIS `Ward_Boundaries_for_New_Jersey/FeatureServer/0` | 829 | `MCODE_1040` | `WARD_CODE`, `MUN_NAME` | — | NJOGIS | live | Outline, labels | S, T | 9 |
| School districts (elementary, secondary, unified: 3 layers, D-057) | live | NJOGIS `School_Districts___Elementary`, `___Secondary`, `___Unified` `/FeatureServer/0` | 171 / 46 / 339 | intersects | `DIST_NAME`, `SD_TYPE`, `NJDOE_ID_*` | — | NJOGIS (data from Census and NJDOE) | live | Outline, labels | S, T | 8 |

## Not in v1, kept for later

These were checked but left out of v1, for size or because they duplicate a curated layer:
- Address points (3,758,585): used only for "go to address", through a `FULLADDR` search, never shown as a layer.
- Building footprints (2,885,707).
- Streams at 2002 vintage.
- FEMA's national flood service (57,488 NJ records; NJDEP's copy is used instead).
- Major roads (6,471; roads cover them).
- Trails (12,761): kept as a published copy layer and listed in Studio (D-061), for the owner to confirm.
- Census blocks (137,972).
- Lighthouses and county seats.
