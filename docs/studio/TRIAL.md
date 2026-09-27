# Studio live trial (S0-T4)

Run 2026-09-27 08:19 UTC by `node tools/trial.mjs`, from Node (no browser rendering): 3 runs per row, median shown.
Budgets are IMPLEMENTATION_GUIDE.md §3.5. **Every operation is within twice its budget.**

| Operation | Case | Budget | Median | Slowest | Verdict | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Count matches (code field) | Newark: parcels | 1.50 s | 0.03 s | 0.33 s | within budget | 46522 parcels |
| Count matches with a filter | Newark: residential parcels | 1.50 s | 0.04 s | 0.13 s | within budget | 28326 |
| Checkbox counts per field | Newark: parcels by class | 2.50 s | 0.03 s | 0.12 s | within budget | 14 values |
| First table page, 200 rows, unsorted | Newark: parcels | 2.00 s | 0.03 s | 0.25 s | within budget | 200 rows |
| One map tile of live features (zoom 15) | Newark: parcels | 1.00 s | 0.36 s | 0.52 s | within budget | 464 parcels, 136 KB |
| Count matches (outline test) | Newark: schools | 1.50 s | 0.18 s | 0.21 s | within budget | 121 schools |
| Count matches (code field) | Jersey City: parcels | 1.50 s | 0.11 s | 0.17 s | within budget | 59011 parcels |
| Count matches with a filter | Jersey City: residential parcels | 1.50 s | 0.02 s | 0.10 s | within budget | 41958 |
| Checkbox counts per field | Jersey City: parcels by class | 2.50 s | 0.03 s | 0.14 s | within budget | 14 values |
| First table page, 200 rows, unsorted | Jersey City: parcels | 2.00 s | 0.03 s | 0.11 s | within budget | 200 rows |
| One map tile of live features (zoom 15) | Jersey City: parcels | 1.00 s | 0.39 s | 0.43 s | within budget | 2000 parcels, 562 KB |
| Count matches (outline test) | Jersey City: schools | 1.50 s | 0.14 s | 0.15 s | within budget | 92 schools |
| Count matches (code field) | Long Beach Township: parcels | 1.50 s | 0.12 s | 0.15 s | within budget | 10573 parcels |
| Count matches with a filter | Long Beach Township: residential parcels | 1.50 s | 0.02 s | 0.12 s | within budget | 8023 |
| Checkbox counts per field | Long Beach Township: parcels by class | 2.50 s | 0.03 s | 0.11 s | within budget | 9 values |
| First table page, 200 rows, unsorted | Long Beach Township: parcels | 2.00 s | 0.03 s | 0.12 s | within budget | 200 rows |
| One map tile of live features (zoom 15) | Long Beach Township: parcels | 1.00 s | 0.13 s | 0.13 s | within budget | 5 parcels, 6 KB |
| Count matches (outline test) | Long Beach Township: schools | 1.50 s | 0.12 s | 0.15 s | within budget | 0 schools |
| Count matches (code field) | Pennsville: parcels | 1.50 s | 0.11 s | 0.13 s | within budget | 6559 parcels |
| Count matches with a filter | Pennsville: residential parcels | 1.50 s | 0.02 s | 0.11 s | within budget | 4572 |
| Checkbox counts per field | Pennsville: parcels by class | 2.50 s | 0.03 s | 0.11 s | within budget | 15 values |
| First table page, 200 rows, unsorted | Pennsville: parcels | 2.00 s | 0.03 s | 0.12 s | within budget | 200 rows |
| One map tile of live features (zoom 15) | Pennsville: parcels | 1.00 s | 0.22 s | 0.27 s | within budget | 373 parcels, 105 KB |
| Count matches (outline test) | Pennsville: schools | 1.50 s | 0.14 s | 0.14 s | within budget | 5 schools |
| Distance query per target layer (300 ft) | Pennsville 301/19: Wetlands (2012) | 2.00 s | 0.08 s | 0.15 s | within budget | 2 (expected 2) |
| Distance query per target layer (300 ft) | Pennsville 301/19: Flood hazard zones | 2.00 s | 0.14 s | 0.14 s | within budget | 3 (expected 3) |
| Distance query per target layer (300 ft) | Pennsville 301/19: Category 1 waters | 2.00 s | 0.13 s | 0.15 s | within budget | 0 (expected 0) |
| Distance query per target layer (300 ft) | Pennsville 301/19: Land use (2015) | 2.00 s | 0.21 s | 0.29 s | within budget | 14 (expected 14) |
| Screening map, site to results, 4 target layers | Pennsville 301/19, 300 ft | 4.00 s | 0.35 s | 0.42 s | within budget | 2 / 3 / 0 / 14 |
| Parcels within 200 ft (distance query) | Pennsville 301/19 | 2.00 s | 0.12 s | 0.23 s | within budget | 9 parcels (expected 9) |
| Distance query from a polygon, 1,000 ft | NJDEP server: Wetlands (2012) | 2.00 s | 0.11 s | 0.13 s | within budget | 6 found |
| Distance query from a polygon, 1,000 ft | ArcGIS Online: Schools | 2.00 s | 0.12 s | 0.12 s | within budget | 0 found |
| Distance query from a line, 1,000 ft | NJDEP server: Wetlands (2012) | 2.00 s | 0.08 s | 0.08 s | within budget | 6 found |
| Distance query from a line, 1,000 ft | ArcGIS Online: Schools | 2.00 s | 0.11 s | 0.12 s | within budget | 2 found |
| Distance query from a point, 1,000 ft | NJDEP server: Wetlands (2012) | 2.00 s | 0.10 s | 0.12 s | within budget | 6 found |
| Distance query from a point, 1,000 ft | ArcGIS Online: Schools | 2.00 s | 0.11 s | 0.12 s | within budget | 0 found |
| County-line buffer, 1,000 ft, parcels | Salem and Gloucester line at -75.4063, 39.7845 | 2.00 s | 0.13 s | 0.28 s | within budget | 33 parcels, county numbers 08, 17 |
| 8 stacked layers: count and one tile each, together | Pennsville, zoom 15 | 4.00 s | 1.17 s | 1.18 s | within budget | parcels 6559/267; schools 5/2; c1_waters 331/0; contaminated_sites 15/0; wetlands 1052/11; flood_zones 245/9; land_use 2442/57; roads 1101/50 |
| Go to an address | "45 N Broadway, Pennsville" | 1.50 s | 0.11 s | 0.15 s | within budget | 2 found; best: 45 North Broadway, Pennsville, New Jersey, 08070 (100) |

## Screening known answer (§1.4)

- Wetlands (2012): 2 (expected 2) — matches
- Flood hazard zones: 3 (expected 3) — matches
- Category 1 waters: 0 (expected 0) — matches
- Land use (2015): 14 (expected 14) — matches

## SQL syntax on both server kinds (§4.4)

| Check | Where clause | Result |
| --- | --- | --- |
| NJDEP: contains with % and a quote | `UPPER(PI_NAME) LIKE '%O''NEILL 50\%%' ESCAPE '\'` | works (0) |
| NJDEP: contains | `UPPER(PI_NAME) LIKE '%SHELL%' ESCAPE '\'` | works (134) |
| NJDEP: date range | `DATE_EFFECTIVE >= DATE '2008-01-01' AND DATE_EFFECTIVE < DATE '2021-01-01'` | works (6398) |
| ArcGIS Online: contains with % and a quote | `UPPER(SCHOOL) LIKE '%ST. MARY''S 100\%%' ESCAPE '\'` | works (0) |
| ArcGIS Online: contains | `UPPER(SCHOOL) LIKE '%ACADEMY%' ESCAPE '\'` | works (382) |
| ArcGIS Online: date range | `PCL_MUN = '1709' AND ((DEED_DATE >= '200101' AND DEED_DATE <= '291231'))` | works (1897) |
| NJDEP: category with labels | `FUEL_TYPE IN ('ELEC')` | works (1707) |
| ArcGIS Online: numeric codes with labels | `SUBTYPE IN (108, 208, 308, 408, 508, 608, 708, 200)` | works (20785) |
| ArcGIS Online: county name | `UPPER(COUNTY) IN ('ESSEX', 'ESSEX COUNTY')` | works (8) |

## Notes

- Newark: 46522 parcels, so the table loads unsorted (the table rule in §3.5).
- Jersey City: 59011 parcels, so the table loads unsorted (the table rule in §3.5).
- Long Beach Township: 10573 parcels, so the table loads unsorted (the table rule in §3.5).
- Pennsville: 6559 parcels, so the table loads unsorted (the table rule in §3.5).
- NJDEP Land_lu lists no 2020 land use layer (checked 2026-09-27); v1 keeps 2015.
- The phone row (375 px, throttled) is measured in the browser, not here; see PROGRESS.md.
