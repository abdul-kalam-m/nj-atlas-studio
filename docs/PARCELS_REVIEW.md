# Parcels evidence (for O-5 and O-6, M7)

The agent gathered this on 2026-09-26 with read-only queries to the statewide parcels service. It is **not** a decision. The owner answers O-5 and O-6 in [DECISIONS.md](DECISIONS.md).

**Update 2026-09-26:** the owner asked to proceed and review at the end, so M7 was built with the suggested "Publish" list below (`catalog/layers/nj_parcels.json`). The layer stays a draft until the owner reviews O-5 and its license (O-3). Splitting is by municipality, not county (D-025), which also settles the Ocean County size problem described below.

Service: `https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0` ("Cad_parcel_mod4"). 3,481,240 polygons, `maxRecordCount` 2000, geoJSON supported, source CRS EPSG:3857.

## O-5 · Which parcel fields may be public?

What the service holds today:

- **`OWNER_NAME` is blank on every record** (0 of 3,481,240 non-empty). The state already withholds owner names.
- **The owner's mailing address is present**: `ST_ADDRESS`, `CITY_STATE` and `ZIP_CODE` are filled on 3,077,973 records. They are the owner's address, not the parcel's: a Berkeley Heights lot lists a mailing address in Troy, Michigan.
- **The parcel's own street address** is `PROP_LOC` (3,077,969 filled).

The agent's suggestion, for the owner to accept or change:

| Publish | Why |
| --- | --- |
| `PAMS_PIN` (id), `PCLBLOCK`, `PCLLOT`, `PCLQCODE` | Block and lot identify the parcel, as on tax maps |
| `PROP_LOC` | Where the parcel is; searchable |
| `PROP_CLASS` | Land use class, shown with plain labels (D-017), e.g. 2 = Residential, 4A = Commercial, 15C = Public property |
| `CALC_ACRE` | Size |
| `LAND_VAL`, `IMPRVT_VAL`, `NET_VALUE` | Assessed values, from public tax lists |
| `YR_CONSTR` | Year built (0 means unknown) |
| `SALE_PRICE`, `DEED_DATE` | Last sale. Prices of 1 or 10 are nominal transfers. `DEED_DATE` is `YYMMDD` with a two-digit year ("941008" is 1994-10-08), which needs a new transform and a decision |

| Leave out | Why |
| --- | --- |
| `ST_ADDRESS`, `CITY_STATE`, `ZIP_CODE`, and `ZIP5`/`ZIP_PLUS4` until checked | The owner's mailing address is personal data, even without a name |
| `OWNER_NAME` | Always blank |
| `DEED_BOOK`, `DEED_PAGE`, `OLD_PROPID`, `PCL_GUID`, `PIN_NODUP`, `GIS_PIN`, `CD_CODE`, `ADD_LOTS1/2` | Record-keeping codes with no use for filtering |

## Size and partitions

- **Split by county using `PCL_MUN`, not `COUNTY`.** `COUNTY` is empty on 403,260 records. Every record has `PCL_MUN`, whose first two digits are the NJ county number (SOURCES.md), so `PCL_MUN LIKE '15%'` selects Ocean County.
- A 2,000-parcel sample from Pennsville with the suggested fields measured 212 bytes per parcel in Parquet and 883 in GeoJSON. The median parcel has 6 corner points.

| County | Parcels | Parquet estimate (before place columns) |
| --- | --- | --- |
| Ocean | 421,632 | ~89 MB, too close to the 95 MB limit |
| Bergen | 299,747 | ~64 MB |
| Middlesex | 275,946 | ~59 MB |
| Monmouth | 264,350 | ~56 MB |
| The other 17 | 32,624–218,436 | 7–46 MB |

- **The statewide total is about 0.74 GB of Parquet.** With map tiles and CSVs it comes to roughly 2 GB, beyond GitHub Pages' 1 GB site limit. That is why M7 plans Cloudflare R2 (O-6).
- **Ocean County needs its own plan** (M7-T3): split it by municipality, or keep fewer fields. GeoJSON would be about 370 MB for Ocean alone, so parcels ship CSV, Parquet and tiles only.

## O-6 · Cloudflare R2 (owner's account)

1. Create a Cloudflare account and an R2 bucket, for example `nj-atlas-data`. R2 charges nothing for downloads; check the current free storage allowance on Cloudflare's pricing page.
2. Give the bucket a public address: a custom domain such as `data.<your domain>` (recommended), or the `r2.dev` address, which Cloudflare rate-limits and describes as meant for development.
3. Add this CORS rule, with the Pages address from O-4:

   ```json
   [{"AllowedOrigins": ["https://<owner>.github.io"], "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["Range"], "ExposeHeaders": ["Content-Length", "Content-Range", "ETag"], "MaxAgeSeconds": 3600}]
   ```

4. Tell the agent the public base URL. The agent never holds R2 keys; the owner uploads with their own credentials (M7-T5).

## Building footprints

2,885,707 records. Their fields are technical (`year`, `project`, `section`), so filters would offer little to a non-GIS person. The agent suggests leaving them out of M7 unless the owner has a use in mind.
