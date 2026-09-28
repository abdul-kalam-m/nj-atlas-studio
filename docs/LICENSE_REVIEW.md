# License review evidence (for O-3)

The agent gathered this evidence on 2026-09-25 from the publishers' own service and item pages. It is **not** a license decision. The owner reads the terms, decides, and fills in each recipe's `license.name`, `license.url`, `reviewed_by` and `reviewed_on`, then sets `status: published`.

| Layer | Publisher | What the source says | Recipe today |
| --- | --- | --- | --- |
| `nj_state` | NJOGIS | Same service and terms as counties. | Credit set; name and URL empty |
| `nj_census_tracts` | U.S. Census Bureau | The service copyright reads "Source: U.S. Census Bureau". Works of the U.S. federal government are generally not subject to copyright (17 U.S.C. § 105). | Credit "U.S. Census Bureau, 2020 Census (TIGERweb)"; name and URL empty |
| `nj_block_groups` | U.S. Census Bureau | Same service and terms as census tracts. | Same as census tracts |
| `nj_counties` | NJ Office of GIS (NJOGIS) | The municipalities item's terms say the data is not survey data and that "acknowledgement of the provider, NJ Office of Information Technology, Office of GIS (NJOGIS), is requested". No counties item was located; the service lists NJOIT, Office of GIS, as copyright holder. | Credit set; name and URL empty |
| `nj_municipalities` | NJOGIS | Same terms. Item: https://www.arcgis.com/home/item.html?id=3d5d1db8a1b34b418c331f4ce1fd0fef | Credit set; name and URL empty |
| `nj_contaminated_sites` | NJDEP Site Remediation Program | The service copyright reads "NJDEP, Site Remediation Program (SRP) Edition 20170427". No terms on the service page. | NJDEP standard credit sentence; name and URL empty |
| `nj_preserved_open_space` | NJDEP Green Acres | The item's terms state the "NJDEP Data Distribution Agreement". The data must not be used to describe property ownership title or exact parcel extents. | Name and URL filled from the item page; review fields empty |
| `nj_overburdened_communities` | NJDEP | The service copyright reads "NJDEP, Environmental Public Health and Safety Edition 20201001". No terms on the service page. | NJDEP standard credit sentence; name and URL empty |
| `nj_trails` | NJDEP | The service gives no copyright text or terms. | NJDEP standard credit sentence; name and URL empty |

## Questions for the owner

0. **Boundary layers first.** Every data layer carries census tract and block group columns, so a release needs all five boundary layers published (state is optional): counties, municipalities, census tracts and block groups. `tools/release.py` stops and names any that are missing.

1. **NJDEP layers.** *Answered 2026-09-26: yes, by accepting the suggested entries (DECISIONS.md O-3).* Does the NJDEP Data Distribution Agreement (quoted on the open-space item) cover the other three NJDEP layers? If so, use the same name and a URL to the agreement for all four.
2. **Credit wording.** *Answered 2026-09-26 by the owner, in chat: the credits are good for now; keep them as they are.* The NJDEP standard sentence ("This map was developed using New Jersey Department of Environmental Protection Geographic Information System digital data, but this secondary product has not been verified by NJDEP and is not state-authorized or endorsed.") appears in the map credits and the About dialog. Keep it as it is?
3. **Open space limits.** Its terms say it is not for ownership or title purposes. Should the About dialog summary add a sentence saying so?

## Suggested entries (the owner accepts, changes or rejects each)

If the owner accepts a row, `license.name` and `license.url` are set as shown, `reviewed_by` and `reviewed_on` record the owner's review, and `status` becomes `published`. The NJDEP rows assume the answer to question 1 is yes.

| Layers | `license.name` | `license.url` |
| --- | --- | --- |
| `nj_state`, `nj_counties`, `nj_municipalities` | NJOGIS terms of use (credit requested) | https://www.arcgis.com/home/item.html?id=3d5d1db8a1b34b418c331f4ce1fd0fef |
| `nj_census_tracts`, `nj_block_groups` | Public domain (U.S. Government work, 17 U.S.C. § 105) | https://www.copyright.gov/title17/92chap1.html#105 |
| `nj_preserved_open_space` (already set), `nj_contaminated_sites`, `nj_overburdened_communities`, `nj_trails` | NJDEP Data Distribution Agreement | https://www.arcgis.com/home/item.html?id=d4df5d8bb5e042debd4b5194bfa408a7 |

All three links answered on 2026-09-26.

## Studio layers (2026-09-27)

At the owner's instruction on 2026-09-27 ("License proceed with the best recommendation"), the agent applied the recommended entry to every Studio recipe and recorded the owner's review (DECISIONS.md D-046). The rule is the one the owner accepted for the first nine layers:

- **NJOGIS services** (maps.nj.gov and the NJOGIS ArcGIS Online organization): "NJOGIS terms of use (credit requested)", https://www.arcgis.com/home/item.html?id=3d5d1db8a1b34b418c331f4ce1fd0fef. The credit names NJOGIS and the agency that supplies the data (for example NJDOT, NJDOE, NJDOH).
- **NJDEP services** (mapsdep.nj.gov): "NJDEP Data Distribution Agreement", https://www.arcgis.com/home/item.html?id=d4df5d8bb5e042debd4b5194bfa408a7, with the NJDEP standard credit sentence. Where NJDEP republishes another agency's data, the credit adds it: FEMA (flood zones), U.S. Department of Energy (fuel stations), NJ Department of Children and Families (child care).
- **U.S. Census Bureau** (TIGERweb): public domain (17 U.S.C. § 105).

Every service answered on 2026-09-27 (`node tools/healthcheck.mjs`), and each layer's ArcGIS item or NJDEP open-data page is its recipe's `landing_page`.

**For the owner to confirm:** that the NJOGIS terms cover the NJOGIS-hosted layers from other agencies (schools, hospitals, bridges, election districts), and that the NJDEP agreement covers the NJDEP services Studio reads live. The owner's review (2026-09-27) asks for this in writing: email NJOGIS, and file the answer here to close O-3.

**Parcels: fields out of scope (privacy, not licensing).** The parcels source carries owners' names and mailing addresses. The NJOGIS terms may allow their use, but Studio does not publish every field it is allowed to. The recipe lists `OWNER_NAME`, `ST_ADDRESS`, `CITY_STATE`, `ZIP_CODE`, `ZIP5` and `ZIP_PLUS4` in `leave_out`: they are never requested from the source, shown, listed or exported, and `validate` refuses any recipe that asks for them (and any recipe anywhere that asks for `OWNER_NAME`). Every list or export containing parcels carries: "Parcel data can lag the municipal tax list. This is not a certified list of property owners."

| Layer | Access | Publisher | License | Credit |
| --- | --- | --- | --- | --- |
| `nj_block_groups` | copy | U.S. Census Bureau | Public domain (U.S. Government work, 17 U.S.C. § 105) | U.S. Census Bureau, 2020 Census (TIGERweb) |
| `nj_bridges` | live | New Jersey Office of GIS (NJOGIS), with NJ Department of Transportation | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Department of Transportation |
| `nj_c1_waters` | live | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_census_tracts` | copy | U.S. Census Bureau | Public domain (U.S. Government work, 17 U.S.C. § 105) | U.S. Census Bureau, 2020 Census (TIGERweb) |
| `nj_child_care` | live | New Jersey Department of Environmental Protection (NJDEP), with data from the NJ Department of Children and Families | NJDEP Data Distribution Agreement | NJDEP standard sentence Center data: NJ Department of Children and Families. |
| `nj_colleges` | live | New Jersey Office of GIS (NJOGIS) | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS) |
| `nj_congressional_districts` | live | New Jersey Office of GIS (NJOGIS), with NJ Redistricting Commission | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Redistricting Commission |
| `nj_contaminated_sites` | live | New Jersey Department of Environmental Protection (NJDEP), Site Remediation Program | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_counties` | copy | New Jersey Office of GIS (NJOGIS) | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS) |
| `nj_election_districts` | live | New Jersey Office of GIS (NJOGIS), with NJ Division of Elections | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Division of Elections |
| `nj_flood_zones` | hybrid | New Jersey Department of Environmental Protection (NJDEP), with data from FEMA | NJDEP Data Distribution Agreement | NJDEP standard sentence Flood zone data: FEMA. |
| `nj_fuel_stations` | live | New Jersey Department of Environmental Protection (NJDEP), with data from the U.S. Department of Energy | NJDEP Data Distribution Agreement | NJDEP standard sentence Station data: U.S. Department of Energy. |
| `nj_hospitals` | live | New Jersey Office of GIS (NJOGIS), with NJ Department of Health | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Department of Health |
| `nj_land_use` | hybrid | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_legislative_districts` | live | New Jersey Office of GIS (NJOGIS), with NJ Office of Legislative Services | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Office of Legislative Services |
| `nj_long_term_care` | live | New Jersey Office of GIS (NJOGIS), with NJ Department of Health | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Department of Health |
| `nj_municipalities` | copy | New Jersey Office of GIS (NJOGIS) | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS) |
| `nj_overburdened_communities` | live | New Jersey Department of Environmental Protection (NJDEP), Office of Environmental Justice | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_parcels` | live | New Jersey Office of GIS (NJOGIS), with the Division of Taxation's MOD-IV tax list | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Division of Taxation (MOD-IV) |
| `nj_preserved_open_space` | copy | New Jersey Department of Environmental Protection (NJDEP), Green Acres Program | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_roads` | hybrid | New Jersey Office of GIS (NJOGIS) | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS) |
| `nj_school_districts_elementary` | live | New Jersey Office of GIS (NJOGIS), with U.S. Census Bureau and NJ Department of Education | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); U.S. Census Bureau and NJ Department of Education |
| `nj_school_districts_secondary` | live | New Jersey Office of GIS (NJOGIS), with U.S. Census Bureau and NJ Department of Education | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); U.S. Census Bureau and NJ Department of Education |
| `nj_school_districts_unified` | live | New Jersey Office of GIS (NJOGIS), with U.S. Census Bureau and NJ Department of Education | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); U.S. Census Bureau and NJ Department of Education |
| `nj_schools` | live | New Jersey Office of GIS (NJOGIS), with NJ Department of Education | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Department of Education |
| `nj_state` | copy | New Jersey Office of GIS (NJOGIS) | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS) |
| `nj_streams` | hybrid | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_subwatersheds` | live | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_tax_blocks` | live | New Jersey Office of GIS (NJOGIS) | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS) |
| `nj_tidal_flood_elevation` | live | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_trails` | copy | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_wards` | live | New Jersey Office of GIS (NJOGIS), with NJ Division of Elections | NJOGIS terms of use (credit requested) | New Jersey Office of GIS (NJOGIS); NJ Division of Elections |
| `nj_waterbodies` | live | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_wellhead_areas` | live | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |
| `nj_wetlands` | hybrid | New Jersey Department of Environmental Protection (NJDEP) | NJDEP Data Distribution Agreement | NJDEP standard sentence |

## Basemaps (2026-09-27, D-079)

For the owner's review. Basemaps are not catalog layers, but prints and PNGs now credit them (D-080).

| Basemap | Source | Terms, as found | Credit printed |
| --- | --- | --- | --- |
| Light, Streets, Dark | OpenFreeMap styles (Positron, Liberty, Dark) on OpenMapTiles vector tiles from OpenStreetMap | OpenFreeMap is free to use without a key; OpenStreetMap data is ODbL, which asks for "© OpenStreetMap contributors" on maps; OpenMapTiles asks for its own credit | Basemap: OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors |
| Satellite (New Jersey) | NJ Office of GIS, 2020 natural color orthophotography, cached tile service `maps.nj.gov/.../Orthos_Natural_2020_NJ_WM` | NJOGIS public data, as for the NJOGIS layers above; the service's credit names NJOIT OGIS and its funding partners | Imagery: NJ Office of GIS (2020 aerial photography) |
| Satellite (outside NJ) | USGS The National Map, USGSImageryOnly | USGS products are in the public domain; credit requested | USGS The National Map |

## Tier 1 layers (2026-09-28, D-083)

At the owner's instruction ("add Tier 1"), the published layers carry `reviewed_by: abdul-kalam-m`, `reviewed_on: 2026-09-28`, as D-046 did. For the owner's review.

| Publisher | Layers | Terms, as found | Applied |
| --- | --- | --- | --- |
| NJDEP | Pinelands Area, CAFRA zone, redevelopment areas, urban enterprise zones, sewer and water service areas, groundwater CEA and known extent, deed notices, historic districts and properties, archaeological grid | The NJDEP Data Distribution Agreement, already accepted (O-3) | Published, with the NJDEP credit sentence |
| NJOGIS (hosting the Highlands Council and NJSEA data) | Highlands regions, Meadowlands District | NJOGIS terms of use, credit requested (O-3; the email about hosted data is still pending) | Published |
| SADC | Preserved farmland | Maps and documents must carry SADC's credit and disclaimer, which is quoted word for word as the layer's credit. No redistribution limit. | Published; landowner names left out |
| DCA | Passenger rail stations, libraries | Acknowledgement of DCA (and NJOGIS) requested; the State's legal statement applies (nj.gov/nj/legal.html). No redistribution limit. | Published |
| Office for Planning Advocacy | State Plan planning areas and centers | End user license agreement: "will not be reproduced or redistributed for use by anyone else, without first obtaining permission from OPA" | **Draft** until OPA agrees (O-10) |
| Pinelands Commission | Pinelands municipal zoning | Data "may not be reproduced or redistributed for use by anyone without first obtaining written permission"; printed maps are not restricted; a credit sentence is required | **Draft** until the Commission agrees (O-11). The Pinelands Area boundary is taken from NJDEP instead. |

**Personal data checked.** SADC's `ORIG_OWNER` and `LATEST_LANDOWNER` are in `NEVER_REQUEST`. `PI_NAME` (the responsible party) is left out of the CEA and deed notice layers. Staff usernames (`USER_ID`, `USER_LAST_UPDATE`, `DIGISTAFF`) are left out. The wetland mitigation site parcels layer (with owner names) is not used.

