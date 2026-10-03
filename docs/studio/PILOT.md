# The Studio pilot (S6)

Five organizations use NJ Atlas Studio for six weeks: a city, a suburb, a shore town, a rural town and a county planning office (IMPLEMENTATION_GUIDE.md S6). The pilot measures use, not willingness to pay; the owner decides on paid features from its numbers, not before (S6-T4).

## 1. The invitation (to send)

> **NJ Atlas Studio pilot: six weeks, no cost**
>
> NJ Atlas Studio makes print-ready maps of New Jersey's public data for an area you choose: wetlands, flood zones, parcels, schools, Census figures, NJDEP's water quality assessments and FEMA's hazard plan status, among 98 layers. It also lists the deadlines that apply to your town (the MS4 permit, your county's hazard mitigation plan) and sets up the maps each one needs.
>
> We are asking five organizations to use it for six weeks for one recurring task, such as planning board packets, grant applications or the MS4 annual report, and to tell us what slows them down.
>
> What it takes: one staff member who does not use GIS daily, about an hour in the first week, and a short call at weeks 3 and 6. What we count: the number of maps and files exported each week, under your organization's code; no names, addresses, areas or map contents are stored (DECISIONS.md D-044).
>
> Your link: `https://abdul-kalam-m.github.io/nj-atlas-studio/?pilot=<your code>`

## 2. Quick start (one page, for the staff member)

1. **Open your link once.** It remembers your organization's code in this browser. Bookmark it.
2. **Area tab:** pick your county, then your town. The **Deadlines** list shows what is due, with the source of each date. *Add to calendar* saves them as a calendar file for Outlook or Google Calendar; *Add a date* adds your own (a master plan reexamination, a grant deadline) to this map.
3. **Layers tab:** *Templates and kits* sets up a map for a task. A **kit** adds the layers, charts and page for a deliverable; *Open kit* next to a deadline does the same.
4. **Analysis tab:** *Changes* lists what changed between NJDEP's 2022 and 2024 water quality assessments for your area; *Charts* counts what is on the map.
5. **Layout tab:** choose the page (map only, or with charts), then *Preview*, *Print / PDF* or *PNG*.
6. **Export tab:** *Map file* saves your work; *Copy link* shares it.

Everything Studio shows is screening data from its publishers, credited on every page; it is not a regulatory determination.

## 3. The owner's runbook

**Before week 1**

1. Deploy the export counter (`workers/counter/README.md`); put its address in `catalog/hosting.json` as `counter_url` and release.
2. Give each organization a 4-digit code: a town's NJ municipal code (Newark is `0714`); a county office, its 2-digit NJ county number then `00`, which no town uses (Cumberland is `0600`). List the codes in the Worker's `PILOTS` setting.
3. Send the invitation and the quick start. Recruit three non-GIS testers for the timed tests (S6-T3).

**Every week**

```text
set NJ_ATLAS_READ_KEY=<the read key>
.venv\Scripts\python tools\pilot_report.py --pilots <code>,<code>,<code>,<code>,<code>
```

Paste the output into PROGRESS.md with the week's top three requests. The targets (S6-T4): a map from at least 4 of 5 pilots every week, and export failures under 2%.

**Weeks 3 and 6:** a 20-minute call with each organization: what they exported, what slowed them down, which deadline mattered most, and what they pay for this work today.

**After week 6:** the owner decides on paid features from these numbers and the calls. The positioning brief's decision rule chooses the first kit to sell.
