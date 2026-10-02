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

## Tier 2

### In Studio (2026-09-28, D-084)

All are live. Twenty are NJDEP layers under the agreement already accepted; the others are from DCA, NJ TRANSIT and NJDOT.

| Layer | Source | Records | Notes |
| --- | --- | --- | --- |
| Vacant land for affordable housing (fourth round) | DCA | 26,707 | P.L. 2024, c.2; covers only the municipalities the analysis includes (none in Jersey City, 291 areas in Pennsville) |
| Tidelands claims | NJDEP | 28,697 | Drawn from zoom 12 |
| Natural Heritage Priority Sites | NJDEP | 343 | Biodiversity rank B1 to B5 |
| Wetland mitigation banks; mitigation bank service areas | NJDEP | 23; 22 | The site parcels layer (owner names) is not used |
| Soils (SSURGO) | NJDEP, joined to USDA NRCS ratings | 116,800 | Septic suitability and its limits, drainage, depth to water table, flooding, hydric soils and hydrologic group, joined by map unit (D-085); drawn from zoom 13 |
| Groundwater recharge | NJDEP, NJ Geological and Water Survey | 191,436 | Drawn from zoom 13 |
| Surface water quality classifications | NJDEP | 284,763 lines | Drawn from zoom 12 |
| Electric and gas utility territories | NJDEP, from BPU | 51; 33 | Listed in screenings, not buffered |
| Stormwater inlets and outfalls (MS4) | NJDEP, MS4 permittees | 77,613; 73,793 | Drawn from zoom 15 and 14; marked partial coverage (D-085) |
| Combined sewer overflows | NJDEP | 211 | |
| Air permitted facilities; NJPDES facilities; landfills; power plants | NJDEP | 17,010; 3,574; 412; 77 | Cumulative-impact screening |
| Brownfield development areas; brownfield inventory | NJDEP | 39; 803 | Owners' names, phones and emails in the inventory are never requested |
| Bus stops; bus routes; rail lines | NJ TRANSIT | 19,739; 264; 13 | |
| High Injury Network | NJDOT, for the Target Zero Commission | 145 | All road owners, from NJDOT's combined layer (D-087) |

### Still waiting

| Layer | Why |
| --- | --- |
| Landscape Project habitat, plus vernal pools | Six regional services to merge into one map copy |
| State Plan critical environmental and historic sites; transit villages | OPA's permission (O-10) |
| Urban land with future flooding | The source has only a census ID and acres |
| Underground storage tank facilities (45,955) | Mostly residential heating-oil tanks, with the responsible party's name |

## Added after the second review (2026-09-29, D-085)

| Change | Detail |
| --- | --- |
| Partial coverage marked | MS4 inlets and outfalls, fourth-round vacant land, the state-road High Injury Network and the LOI layers carry a "Partial coverage" badge and a note in every list, download and print, even when a screening finds nothing |
| Soil ratings joined | USDA NRCS ratings by map unit (see Tier 2) |
| Riparian and transition presets | One-click buffers: Category 1 waters 300 ft; streams 50 and 150 ft; wetlands 50 ft, 150 ft or both. Each states the rule and what a ring around a mapped line misses |
| Wetland lines (LOI); Transition areas (LOI) | NJDEP, 3,657 and 2,044 polygons: the lines NJDEP approved in Letters of Interpretation, from surveyed plans. The only published transition areas; no statewide layer exists, because NJDEP sets each width in an LOI |

Not done from that review, and why: the High Injury Network merge, the Landscape Project merge, the shorter catalog with topic templates, and the other candidates it named, all waiting for the owner's direction.

## ACS Demographics (2026-09-29, D-086)

| Layer | Source | Records | Notes |
| --- | --- | --- | --- |
| Demographics (tracts) | U.S. Census Bureau, 2020–2024 ACS 5-year summary file | 2,181 | 22 variables, with margins and reliability for income, poverty and rent burden |
| Demographics (block groups) | the same | 6,599 | 21 variables (no disability); most block group estimates rate low reliability |

Next (v1.1): ring demographics as a list of the block groups a ring touches, with their published values.

## Remaining candidates (2026-10-02, D-087)

| Layer | Source | Records | Status |
| --- | --- | --- | --- |
| Areas in need of rehabilitation | DCA, Local Planning Services | 225 | In Studio |
| Wild and Scenic Rivers | National Park Service | 5 in NJ | In Studio |
| Highlands Land Use Capability Zones | Highlands Council | 23,251 | Draft: no redistribution without written permission (O-13) |
| Agricultural Development Areas | SADC | 28 | Draft: no redistribution without written permission (O-12) |
| Water supply critical areas; groundwater quality classifications | NJDEP | | No published service found |
| Fourth-round fair-share obligations | DCA | | Not added: a report, not data, and since superseded by municipal numbers |

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
