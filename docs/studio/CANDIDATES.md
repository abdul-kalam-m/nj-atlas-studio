# Layer candidates

**2026-09-28.** This list merges two sources:
- the agent's survey: 616 layers across the NJDEP, NJOGIS and NJOGIS ArcGIS Online servers, plus ArcGIS Online searches for the agencies those servers do not cover;
- the owner's pasted review ("Tier 1: Deepen the Core Screening Workflow", and the rest).

Every source below was checked against its live service on 2026-09-28. Record counts are statewide. Tier 1 is in Studio (D-083).

## How layers are tiered

1. **Site test.** Does it help a planner answer a question about a specific site (the pasted review's test)? Or does it tell them which rules apply there?
2. **Source.** Statewide, from the agency that maintains it, and queryable live.
3. **Terms.** They allow a public map and data downloads. Personal data (owner names, staff usernames) stays out, as for parcels (D-046, O-5).
4. **Size.** Live-queryable now, or waiting for a map copy (O-6).
5. **Open core (D-040).** Public layers are free. A product the project builds, such as a standardized statewide zoning layer, is a paid-tier candidate. That is noted, not decided.

## Tier 1: in Studio (2026-09-28, D-083)

All are live layers, published under the terms noted, which are for the owner's review.

| Layer | Source | Records | Notes |
| --- | --- | --- | --- |
| Highlands regions | NJOGIS, Highlands Council | 7 | Preservation Area and Planning Area |
| Pinelands Area | NJDEP (boundary from the Pinelands Commission) | 1 | The NJDEP copy is used because the Commission's terms forbid redistribution |
| CAFRA zone | NJDEP | 158 | |
| Meadowlands District | NJOGIS, NJSEA | 1 | The source has no name field; the recipe names it |
| Areas in need of redevelopment | NJDEP | 757 | Mapped by NJDEP from municipal resolutions; staff usernames left out |
| Urban enterprise zones | NJDEP (from DCA) | 37 | Sliced by municipal code |
| Sewer service areas | NJDEP | 1,285 | Treatment facility, planning agency, permit, adoption date, population served |
| Public water service areas | NJDEP | 566 | 2017 purveyor service areas |
| Groundwater contamination (CEA) | NJDEP Site Remediation Program | 6,939 | Includes the Well Restriction Area flag the pasted review asked for |
| Groundwater contamination (known extent) | NJDEP Site Remediation Program | 240 | The pasted review's "CKE" |
| Deed notice areas | NJDEP Site Remediation Program | 4,322 | |
| Historic districts | NJDEP Historic Preservation Office | 2,070 | 2 location-restricted records excluded at the source |
| Historic properties | NJDEP Historic Preservation Office | 148,056 | Drawn from zoom 13; 2 location-restricted records excluded |
| Archaeological site grid | NJDEP Historic Preservation Office | 5,793 | The public screening grid; exact site locations are not published |
| Preserved farmland | SADC | 8,983 | SADC's required credit is printed; original and current landowner names are never requested |
| Passenger rail stations | DCA (from NJ Transit and DVRPC) | 234 | NJ Transit rail and light rail, PATH, PATCO; updated December 2021 |
| Public libraries | DCA, NJ State Library | 447 | |

### Tier 1, drafts waiting for permission

Their terms forbid redistribution without the publisher's permission, and Studio's data downloads would redistribute. The recipes are written and pass the health check, but a release leaves drafts out.

| Layer | Publisher | Records | Needed |
| --- | --- | --- | --- |
| State Plan planning areas (PA1 to PA5 and others) | Office for Planning Advocacy | 3,114 | OPA's permission (O-10) |
| State Plan designated centers | Office for Planning Advocacy | 50 | OPA's permission (O-10) |
| Pinelands municipal zoning | Pinelands Commission | 1,465 zones in 53 towns | The Commission's written permission (O-11). This is also the first piece of the zoning program below. |

## The zoning program (the pasted review's first priority)

New Jersey has no statewide zoning layer: zoning is municipal. Found so far on ArcGIS Online:
- Pinelands municipal zoning (the Pinelands Commission, above);
- Middlesex County base and overlay zoning (Middlesex County GIS);
- Somerset County zoning (Somerset County);
- Monmouth and Sussex zoning, published by individual accounts, whose authority must be confirmed.

The proposed approach:
1. Pilot with the Pinelands, Middlesex and Somerset.
2. Define one common schema: source zone code and name, a general class (residential, commercial, industrial, mixed use, open space, other), the municipality, the ordinance link and the adoption date.
3. Keep the source codes, and crosswalk each municipality's codes to the classes.
4. Never present the result as the legal zoning map.
5. Clear the license county by county.

The standardized layer is a paid-tier candidate. Each county's own layer stays free.

## Tier 2: next

| Layer | Source and URL | Records | Why it waits |
| --- | --- | --- | --- |
| ACS demographics on tracts and block groups (income, age, tenure, vehicles) | Census API | — | Not ArcGIS: needs a join step in the pipeline. Probably the most valuable next addition. |
| Land capacity for affordable housing (fourth round) | DCA, `services.arcgis.com/Aur8tCo478N3VovT/.../Vacant_Land_Output/FeatureServer/0` | 26,707 | Tied to P.L. 2024, c.2; DCA's terms to check |
| Wetland mitigation banks, service areas and sites | NJDEP `Features/Land/MapServer/70–75` | 23 / 22 / 546 | Small and specialized; the site parcels layer (76) carries owner names and stays out |
| Landscape Project habitat, plus vernal pools | NJDEP ArcGIS Online (6 regional services, for example Piedmont 229,154; pools 13,595) | large | Needs a map copy that merges the regions |
| Natural Heritage Priority Sites | NJDEP `Features/Environmental_habitat/MapServer/93` | 343 | Environmental screening |
| State Plan critical environmental and historic sites | OPA | 981 | OPA's permission (O-10) |
| CAFRA coastal planning areas; tidelands claims | NJDEP `Land_CAFRA_coast/2`, `Hydrography/30` | 1,073; 28,697 | Coastal permitting detail |
| Groundwater recharge; soils (SSURGO); surface water quality classifications | NJDEP `Geology/18`, `Geology/11`, `Hydrography/7` | 191,436; 116,800; 284,763 | Need map copies; useful soil properties need a table join |
| Bus stops, bus lines, rail lines | NJ Transit ArcGIS Online | 19,739; 264; 13 | Terms say only "not survey grade"; NJ Transit to confirm |
| Transit villages | OPA points, or NJ Transit's municipality list | 35 | OPA's terms, or a thin layer |
| High Injury Network 2025 | NJDOT, 4 layers by road owner | 243 | Merge into one layer |
| MS4 stormwater inlets and outfalls | NJDEP `Applications/MS4_Map` | 77,613; 73,793 | Coverage varies by municipality; for municipal engineers |
| Permitted facilities (air, storage tanks, NJPDES), landfills, combined sewer overflows, power plants | NJDEP | 17,010; 45,955; 3,574; 412; 211; 77 | Cumulative-impact and environmental justice screening |
| Electric and gas utility territories | NJDEP `Utilities/10`, `Utilities/11` | 51; 33 | |
| Urban land with future flooding | NJDEP `Government/43` | 4,344 | Sea-level rise planning |
| Brownfield development areas; brownfield inventory | NJDEP | 39; 803 | The inventory is drawn from contaminated sites |

## Tier 3: needs new work or a source decision

- **Standardized statewide zoning:** the program above.
- **Crash records and traffic volumes:** NJDOT publishes no open statewide layers; only the High Injury Network above.
- **Fire, police and EMS stations:** no state-maintained layer; federal (HIFLD) and Rutgers copies have unclear currency and terms.
- **Conservation Blueprint priority agricultural lands:** named in the pasted review; no public feature service found.
- **Federal overlays:** HUD qualified census tracts, Opportunity Zones, and FEMA's own flood layer. Not checked yet.
- **Rasters:** elevation, LiDAR and impervious surface. Studio's layers are shapes.
- **Building footprints (2.9 million):** need the owner's storage (O-6).

## Where this differs from the pasted review

- **Zoning** is the biggest gap, as the review says. With no statewide source, it is a program rather than a Tier 1 layer.
- **Highlands, Pinelands, CAFRA and Meadowlands** move from the review's Tier 3 to Tier 1. Their boundaries answer "which rules apply here", and they are one to 158 records each. The detailed zones inside them stay in Tier 2 or wait for permission.
- **"CEA / Well Restriction Areas"** are groundwater contamination, not wellhead protection. The CEA layer carries the Well Restriction Area flag.
- **Wetland mitigation** and **MS4 stormwater** move to Tier 2. The first is small and specialized. The second has uneven coverage and 150,000 records.
- **The archaeological site grid** is added. The review's "archaeological site" data is not public beyond this grid, by the Historic Preservation Office's design.
- **Transit:** stations are Tier 1; bus and rail lines Tier 2; crash data Tier 3 (no open source).
