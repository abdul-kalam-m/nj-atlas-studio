> **Copied from NJ-Spatial `catalog/README.md` at commit f1d4197 (2026-09-24).** Historical source research. References to `scripts/validate.ps1` and NJ-Spatial workflow docs describe the old project and do not apply here. Verified facts for NJ-Atlas live in `docs/SOURCES.md`.

# NJ Spatial planning catalog

`datasets.json` is the seed registry for the 20 MVP dataset families in the project brief. It is a **discovery and local-research registry**. Four entries are admitted only for the bounded Pennsville workflow; sixteen remain identified candidates. Every family remains unavailable for production statewide analysis. Some entries are bundles that will resolve to multiple release-specific datasets. The registry gates the [Pennsville source profile](sources/pennsville.json) and the flood/open-space profiles by ID, endpoint, field types and lifecycle stage; that implementation does not admit the statewide families.

`source.landing_page` is publisher evidence or a discovery page, not an ingestion endpoint. `source.access_url` remains null until an adapter and source release are reviewed. A non-null `source.verified_on` records successful opening and inspection of the linked page during source research; it does not certify the data, availability, license or freshness. Null means the source page still needs direct verification.

Publisher candidates were researched on **2026-09-19**. The Pennsville sources were captured that day, with retrieval time, source metadata, reviewed terms, and release checksums recorded in the local manifests. The discovery entries retain unknown quality scores, source dates, versions, refresh schedules and admission permissions. Their storage values are proposed statewide destinations after promotion. See the implemented workflow (NJ-Spatial doc, not copied) for local assets and limitations.

## Source evidence

The [Pennsville FEMA profile](sources/pennsville-flood.json), reviewed September 24, 2026, supports a second local research release. It uses the federal effective NFHL service, preserves the publisher's SFHA flag and source citation, and records public-access/license evidence from the federal catalog. It does not promote the statewide flood family or treat a capture timestamp as a panel effective date. See the flood workflow (NJ-Spatial doc, not copied).

| Dataset | Publisher evidence | Inspected |
| --- | --- | --- |
| `nj_municipalities` | [New Jersey Office of GIS (NJOGIS)](https://nj.gov/njgin/edata/boundaries/) | 2026-09-19 |
| `nj_counties` | [New Jersey Office of GIS (NJOGIS)](https://nj.gov/njgin/edata/boundaries/) | 2026-09-19 |
| `nj_parcels_modiv` | [New Jersey Office of GIS (NJOGIS)](https://www.nj.gov/njgin/edata/parcels/) | 2026-09-19 |
| `nj_addresses` | [New Jersey Office of GIS (NJOGIS)](https://www.nj.gov/njgin/edata/addresses/) | 2026-09-19 |
| `nj_buildings` | [New Jersey Department of Environmental Protection (NJDEP)](https://mapsdep.nj.gov/arcgis/rest/services/Features/Structures/MapServer/8) | 2026-09-19 |
| `nj_land_use_land_cover` | [New Jersey Department of Environmental Protection (NJDEP)](https://www.arcgis.com/sharing/rest/content/items/2deaaa3cadd94166bdbff92a44ade284/info/metadata/metadata.xml?format=default&output=html) | 2026-09-19 |
| `nj_preserved_open_space` | [NJDEP current State, Local and Nonprofit Open Space](https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/Open_Space/FeatureServer/66) | 2026-09-24 |
| `nj_wetlands` | [New Jersey Department of Environmental Protection (NJDEP)](https://www.arcgis.com/sharing/rest/content/items/2deaaa3cadd94166bdbff92a44ade284/info/metadata/metadata.xml?format=default&output=html) | 2026-09-19 |
| `nj_fema_flood_zones` | [Federal Emergency Management Agency (FEMA)](https://msc.fema.gov/portal/advanceSearch) | 2026-09-19 |
| `nj_hydrography` | [New Jersey Department of Environmental Protection (NJDEP)](https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer) | 2026-09-19 |
| `nj_roads` | [New Jersey Office of GIS (NJOGIS)](https://nj.gov/njgin/edata/roads/) | 2026-09-19 |
| `nj_transit` | [NJ TRANSIT](https://developer.njtransit.com/) | Needs page verification |
| `nj_census_geographies` | [U.S. Census Bureau](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | 2026-09-19 |
| `nj_acs_demographics` | [U.S. Census Bureau](https://www.census.gov/programs-surveys/acs/data/data-via-api.html) | 2026-09-19 |
| `nj_environmental_justice` | [New Jersey Department of Environmental Protection (NJDEP)](https://dep.nj.gov/ej/ejmap-data-documentation/) | Needs page verification |
| `nj_contaminated_sites` | [New Jersey Department of Environmental Protection (NJDEP)](https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer/0) | 2026-09-19 |
| `nj_schools` | [New Jersey Department of Education (NJDOE)](https://www.nj.gov/nj/education/) | 2026-09-19 |
| `nj_hospitals` | [New Jersey Department of Health (NJDOH)](https://www.nj.gov/health/healthfacilities/) | 2026-09-19 |
| `nj_elevation` | [New Jersey Office of GIS (NJOGIS)](https://nj.gov/njgin/edata/elevation/) | 2026-09-19 |
| `nj_imagery` | [New Jersey Office of GIS (NJOGIS)](https://nj.gov/njgin/edata/imagery/) | 2026-09-19 |

## Scope and promotion requirements

- **Boundaries and parcels:** preserve source identifiers as strings, including leading zeros. Record parcel geometry and assessment vintages separately. Retain publisher redactions. NJGIN map boundaries are not a substitute for legal or survey boundaries.
- **Buildings:** NJDEP exposes a footprint layer, but its service page lacks descriptive lineage. Confirm collection dates, provider, coverage and completeness before calling the result statewide.
- **Land cover and wetlands:** the same LULC metadata is evidence for both candidates. The wetlands entry is a proposed, explicitly classified subset or a future dedicated inventory. It is not yet a derived dataset or regulatory delineation.
- **Preserved open space:** the current NJDEP item replaces the deprecated discovery endpoint. Its local [source profile](sources/pennsville-open-space.json) explicitly selects Green Acres encumbered records; unencumbered and unknown records do not qualify. The distance workflow (NJ-Spatial doc, not copied) retains complete metadata and source attribution. Completeness, other preservation programs, and production redistribution admission remain unresolved for the statewide family.
- **Transit:** the developer portal opened without readable page content, so its verification date remains null. [NJ TRANSIT's terms](https://developer.njtransit.com/terms/) were inspected; account access, applicable terms, agency/mode coverage and feed selection require resolution. No account was registered.
- **Census and ACS:** these are separate bundles. Each needs a release manifest and geography manifest. ACS also needs variable, universe, estimate, margin-of-error and annotation definitions. Pin compatible geography vintages before joins; do not present a bundle as a homogeneous analytical table.
- **Hydrography:** split streams, waterbodies and selected watershed levels into documented component releases and geometry-specific schemas.
- **Environmental justice:** the official release-documentation page appeared in search results but direct retrieval failed. Verify the current effective release and its methodology; an older metadata page is not evidence that the older edition is current.
- **Schools and hospitals:** the official agency directories are inventory candidates. School/facility type, active status, campus scope, bulk export, coordinate provider and geocoding quality remain unresolved. The planned point geometry is not a claim that these pages already distribute a spatial dataset.
- **Elevation and imagery:** retain external references with product/collection manifests. Select acquisition dates, resolutions, datums and services deliberately; do not bulk-copy statewide rasters.

Promotion requires a pinned access endpoint and release, reviewed terms, canonical field mappings and IDs, reproducible acquisition, provenance manifests and quality checks. A known publisher alone does not establish authoritative fitness for an analysis. The entry-specific `lifecycle.blockers` supplement these shared requirements.

Run `pwsh -NoProfile -File scripts/validate.ps1` from the repository root to validate `datasets.json` against [schemas/datasets.schema.json](schemas/datasets.schema.json), check unique IDs, and verify local documentation links. Structural validity never substitutes for source or data verification.

New normalized releases retain a checksummed `registry.json` and its identity hash. Local admission is distinct from production rights. See the foundation milestone (NJ-Spatial doc, not copied).
