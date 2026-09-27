# NJ-Atlas: instructions for coding agents

NJ-Atlas is a point-and-click atlas of New Jersey open data, and **NJ Atlas Studio** (the home page) is the map studio built on it: layers, styles, buffers, print and share. It is a static website plus a Python build that prepares the data. **There is no AI, no database and no user accounts**; the only server code is the optional totals-only export counter (D-044). Studio's contract is [docs/studio/IMPLEMENTATION_GUIDE.md](docs/studio/IMPLEMENTATION_GUIDE.md); its code is `site/js/studio/`, and its words live in `site/js/studio/text.js` (short labels, D-045).

## Start of every session

1. Read [docs/OPERATING_GUIDE.md](docs/OPERATING_GUIDE.md) if you haven't this session. Then read the last 30 lines of [docs/PROGRESS.md](docs/PROGRESS.md).
2. Find the first unchecked task in the earliest unfinished milestone in [docs/MILESTONES.md](docs/MILESTONES.md). Do that task only.
3. Follow the work loop in OPERATING_GUIDE.md §4, and finish with a report in PROGRESS.md.

## Hard rules

- **No AI features:** no language models, chat, AI SDKs, API keys or MCP servers (DECISIONS.md D-001).
- **Only the dependencies in OPERATING_GUIDE.md §5.** Never add a Python package, an npm package, or a script from another CDN. If you need one, stop and ask.
- **Site code:** vanilla JavaScript ES modules, no framework or build step. Pin CDN versions exactly; never use `@latest`.
- **Never put data values into `innerHTML`.** Create elements and set `textContent`.
- **Layer details live only in `catalog/layers/*.json`.** Don't hard-code layer IDs, field names or URLs in `pipeline/` or `site/`. The one exception is the boundary layer IDs, defined only in `pipeline/levels.py`.
- **User-facing text lives only in `site/js/text.js` (atlas) and `site/js/studio/text.js` (Studio)**, and must pass `tools/lint_text.py`.
- **Filters:** Python and JavaScript must follow OPERATING_GUIDE.md §6.7 exactly. When they disagree, add the case to `tests/fixtures/filter_cases.json`.
- **Generated files are never edited or committed:** `build/`, `site/data/`.
- **Numbers are float64 and codes are strings.** Never write int64 columns, because hyparquet turns them into BigInt.
- **Never fill in `license.reviewed_by` or `reviewed_on`**, and never set `status: published`, unless the human instructs it in chat (they did on 2026-09-26 and 2026-09-27; DECISIONS.md O-3, D-046).
- **Never request or show a `leave_out` field or any owner name** (`validate` refuses them).
- **Don't weaken or delete a test to make it pass.**
- **Git:** commit only if the human has allowed it. Never force-push, rewrite history or delete branches.

## Stop and ask the human when

- the same check fails twice for the same reason;
- a source count is outside the recipe's `expected_count`, or a field is missing from the source;
- a license is unclear, or you'd need a new dependency or a schema change;
- the step involves accounts, credentials, deploys or deleting data;
- the task would add anything listed in OPERATING_GUIDE.md §1 "What NJ-Atlas is not".

## Commands (Windows; use .venv/bin/python on macOS or Linux)

```text
.venv\Scripts\python -m pipeline validate | inspect <url> | build <id> --include-drafts | catalog --include-drafts | check [<id>]
.venv\Scripts\python tools\serve.py          # http://127.0.0.1:8080  (add ?selftest)
.venv\Scripts\python tools\gate.py G<n> [--layer <id>]
.venv\Scripts\python -m pytest -m "not network"
npm test
node tools\healthcheck.mjs        # every live and hybrid source (network)
node tools\trial.mjs              # live performance against IMPLEMENTATION_GUIDE.md §3.5 (network)
```
