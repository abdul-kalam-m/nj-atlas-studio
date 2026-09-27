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

**For the owner to confirm:** that the NJOGIS terms cover the NJOGIS-hosted layers from other agencies (schools, hospitals, bridges, election districts), and that the NJDEP agreement covers the NJDEP services Studio reads live.

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
