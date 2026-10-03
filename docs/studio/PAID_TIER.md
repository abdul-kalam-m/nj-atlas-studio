# The paid tier: sign-in and storage (proposal for O-6)

**Status: a proposal for the owner's decision. Nothing here is built.** CLAUDE.md's rule (no database, no user accounts) stands until the owner approves a change in DECISIONS.md. Paid features live in a separate private codebase and plug into the public Studio through the map document's `extensions` (D-040).

## 1. What is sold: only what a server does

The public Studio is complete for its users: every layer, kit, chart, page, comparison and deadline is free. A hidden button or a watermark is not a lock in code anyone can read, so the paid tier sells what needs a server:

| Feature | What the server keeps | Built on (public code) |
| --- | --- | --- |
| **Saved runs** | A kit's map document and the values it showed (chart totals, the Changes rows), with data dates | `mapdoc.js`, `chartdata.js`, `compare.js` |
| **The renewal report** | Last year's run, re-run on this year's data and compared with the stored values: what changed since the last run | `compare.js` joins any two snapshots on a key |
| **The record** | The organization's runs, each with its sources, data dates and methods note; exportable at any time as files | the print, PNG, CSV and map file exports |
| **Reminders** | An email before each deadline on the organization's calendar | `calendar.json`, the town's own dates |
| **Team sharing** | The organization's members see its runs | |

The town's exported copy is its official record: retention schedules bind the town (DARM M100000-006 keeps an agency's own annual reports permanently), so Studio's copy is a convenience, kept while the subscription runs and for a stated period after (placeholder: 3 years, a business decision).

## 2. Architecture (recommended)

- **Cloudflare Workers, D1 and R2**, the platform the export counter already uses (D-044): one Worker for the account API, D1 (SQLite) for organizations, members and run metadata, R2 for run files (a map document and its snapshot, typically under 1 MB).
- **Sign-in by emailed link**: no passwords are stored. A session is an HttpOnly cookie on the API's own origin.
- **Organizations** are created by the owner on a signed order; an organization's admin invites members by email address.
- **The public Studio calls the account API only when `catalog/hosting.json` names `account_url`**, as the counter works with `counter_url`. Without it, Studio is unchanged.
- **Stored:** members' email addresses and names as given, organization names, runs (map documents and snapshots of public data, plus the organization's own notes and dates), sign-in times. **Never stored:** analytics, IP addresses beyond the Worker's own abuse limits, parcel owner names (Studio never requests them).

Alternatives considered: Supabase (auth and Postgres; quicker to start, a second processor of members' data, a monthly fee from the start); a town's own Microsoft or Google sign-in (later, for organizations that require it).

## 3. Security and privacy

- Rate limits on sign-in links; links expire in 15 minutes and work once.
- Every write checks the member's organization; tests cover cross-organization access.
- An audit log of sign-ins and deletions, kept 1 year.
- A privacy notice and terms of service, reviewed by counsel before the first paid organization.
- Deleting an organization deletes its runs from D1 and R2 within 30 days, after offering an export.

## 4. Phases

1. **Accounts and saved runs**: organizations, members, save and reopen a run. Renewal by hand (open last year's run, run it again).
2. **The renewal report and the record**: the stored-snapshot comparison, the run list, export all.
3. **Reminders**: deadline emails from the organization's calendar.

Each phase gets a decision record, tests like the public code's, and a pilot organization before release.

## 5. What the owner decides

1. Approve accounts and a database for the paid tier (a change to CLAUDE.md and OPERATING_GUIDE.md §1, for Studio only).
2. Choose the stack (recommended: Cloudflare, as above).
3. Create the private repository and the Cloudflare resources with the owner's accounts; the agent never holds credentials.
4. Approve the privacy notice, the terms, and the retention period.
5. Set the price test: $2,500, $5,000 or $7,500 a year per town, and the consultant bundle (positioning brief).
