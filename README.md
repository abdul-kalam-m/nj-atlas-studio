# NJ Atlas Studio

Maps of New Jersey open data for planners, built on the NJ-Atlas engine. Four tabs: **Area** (state to block group), **Layers** (up to 8 of 77 curated layers, styled and filtered, over a Light, Streets, Dark or Satellite basemap that can be on, dimmed or off), **Analysis** (buffer layers: features of a layer, all, filtered or selected, buffered by up to 6 distances in feet or meters, each styled, dissolved or not, measured on NJ State Plane; and site screening, which lists what lies near a site) and **Export** (a print-ready PDF, a PNG, a link, a map file, an embed or the data cut to the area).

- **Layers:** boundaries (state to block group), parcels, land use, wetlands, flood zones, streams, Category 1 waters, roads, schools, hospitals, districts and more ([docs/studio/CATALOG.md](docs/studio/CATALOG.md)). Most are read live from the NJOGIS, NJDEP and Census services; the boundaries are our copies, and five large layers draw from our map copies.
- **Site screening:** select a parcel, an address or a drawn footprint; the ring is measured from its edge; wetlands, flood zones and Category 1 waters inside it are listed and exported. Every output says *screening, not a regulatory determination*; parcel lists say they are *not a certified list of property owners*.
- **No AI, no accounts.** A static site; the only server code is an optional totals-only export counter (D-044).

The one-dataset atlas it grew from is at `/atlas/`: a point-and-click viewer in the spirit of [Bharatlas](https://github.com/urbanmorph/geodata), for readers with no GIS training.

## Status

Studio is built (stages S0 to S5, and the S6 export counter), with every automated gate passing; see [docs/PROGRESS.md](docs/PROGRESS.md). Waiting on the owner:
- storage for the five map copies (O-6); until then those layers are drawn live;
- deploying the export counter ([workers/counter/README.md](workers/counter/README.md));
- the pilot (S6): five municipalities and three non-GIS testers;
- written confirmation from NJOGIS that its terms cover the layers it hosts for other agencies (O-3, [docs/LICENSE_REVIEW.md](docs/LICENSE_REVIEW.md)).

Checks: 202 Python tests, 217 JavaScript tests (run `npm ci` once first), the data checks, the plain-language lint, `node tools/healthcheck.mjs` (every live source, nightly in CI) and `node tools/trial.mjs` (live performance, [docs/studio/TRIAL.md](docs/studio/TRIAL.md)).

Run it locally:

```text
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt -c constraints.txt
.venv\Scripts\python -m pipeline build --all --include-drafts
.venv\Scripts\python -m pipeline catalog --include-drafts
.venv\Scripts\python tools\serve.py
```

Then open http://127.0.0.1:8080/ (Studio) or http://127.0.0.1:8080/atlas/ (the atlas). Hybrid layers draw from `site/data` once built (`python -m pipeline build nj_roads`), and live otherwise.

## How the work is run

The project is built task by task by a coding agent (Claude Sonnet or Opus), with the human owner deciding and signing off.

| Document | Purpose |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Rules every agent session loads automatically |
| [docs/OPERATING_GUIDE.md](docs/OPERATING_GUIDE.md) | Roles, work loop, architecture, data contracts, commands, troubleshooting |
| [docs/MILESTONES.md](docs/MILESTONES.md) | M0–M7 (plus M5B) and their task cards |
| [docs/GATES.md](docs/GATES.md) | Pass/fail checks for each milestone, with known answers |
| [docs/LAYER_PLAYBOOK.md](docs/LAYER_PLAYBOOK.md) | Step-by-step recipe for adding a data layer |
| [docs/SOURCES.md](docs/SOURCES.md) | Verified endpoints, counts and field quirks |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions made and questions for the owner |
| [docs/studio/IMPLEMENTATION_GUIDE.md](docs/studio/IMPLEMENTATION_GUIDE.md), [docs/studio/CATALOG.md](docs/studio/CATALOG.md) | NJ Atlas Studio: the map studio built on this atlas (stages S0–S6) and its 32 curated layers |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Task reports and the gate log |
| [docs/RELEASE.md](docs/RELEASE.md), [docs/LICENSE_REVIEW.md](docs/LICENSE_REVIEW.md), [docs/PARCELS_REVIEW.md](docs/PARCELS_REVIEW.md) | How to publish, and the evidence for the owner's license (O-3) and parcel (O-5, O-6) decisions |

To start a work session, paste into Claude Code: "Read CLAUDE.md and docs/OPERATING_GUIDE.md. Execute the next unchecked task in docs/MILESTONES.md, following the work loop exactly. Stop after that one task."

## Origin

Forked from NJ-Spatial on 2026-09-24, keeping only its source research. NJ-Spatial's normalization engine, PostGIS database and analysis plans are deliberately left out. See [FORK.md](FORK.md).

## License

The code is under the [MIT License](LICENSE). Each data layer carries its publisher's terms and attribution in its recipe, shown in the viewer's "About this data" dialog.
