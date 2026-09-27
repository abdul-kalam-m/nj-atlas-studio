# Fork provenance

| Item | Value |
| --- | --- |
| Forked from | NJ-Spatial (local repository), branch `codex/nj-spatial-foundation`, commit `f1d4197` |
| Date | 2026-09-24 |
| Purpose | A simple Bharatlas-style atlas: point-and-click viewing, filtering and downloading, with no AI component |

## What was copied

| NJ-Spatial path | NJ-Atlas path | Why |
| --- | --- | --- |
| `catalog/datasets.json` | `seed/datasets.json` | 20 researched dataset families with publisher landing pages |
| `catalog/schemas/datasets.schema.json` | `seed/schemas/datasets.schema.json` | Explains the fields of `seed/datasets.json` |
| `catalog/sources/pennsville.json` | `seed/sources/pennsville.json` | Verified municipality and parcel endpoints and field lists |
| `catalog/sources/pennsville-flood.json` | `seed/sources/pennsville-flood.json` | Verified FEMA flood service, fields and terms evidence |
| `catalog/sources/pennsville-open-space.json` | `seed/sources/pennsville-open-space.json` | Verified NJDEP open-space service, required attribution and terms |
| `catalog/README.md` | `seed/SOURCE_NOTES.md` | Source research notes. Two edits: dead links to NJ-Spatial docs became plain text, and the broken table was fixed |
| `.gitattributes` | `.gitattributes` | Line-ending rules; entries for web files added |
| `constraints.txt` | `constraints.txt` | Known-good Python pins; `psycopg` removed because NJ-Atlas has no database |

`seed/` is read-only reference material. The Pennsville source profiles describe one township's capture. NJ-Atlas's live facts are in `docs/SOURCES.md`.

## What was deliberately left out

- The normalization engine, release manifests and quarantine (`src/nj_spatial/pipeline.py`, `database.py`).
- PostGIS and Docker (`compose.yml`).
- Analysis plans and operators: area, flood overlap and distance (`analysis.py`, `flood.py`, `open_space.py`).
- The read-only result inspector (`web/`, `server.py`).
- NJ-Spatial's planning documents (`docs/`), tests and scripts.

NJ-Atlas replaces them with a simpler design: recipes, a Python build, and a static viewer (see `docs/OPERATING_GUIDE.md`). NJ-Spatial is unchanged and remains its own project.
