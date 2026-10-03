// The deadline calendar (D-093): what is due for an area, from site/data/calendar.json (obligations a permit or rule
// dates, and FEMA's hazard mitigation plan statuses) and the dates a town adds to its own map document.
// Pure: no imports. Dates are calendar days ('YYYY-MM-DD'), compared as text.

const DAY_MS = 86400000;

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// The next yearly date on or after `today`: May 2 -> this year's, or next year's once it has passed.
export function nextYearly({ month, day }, today) {
  const year = Number(today.slice(0, 4));
  const pad = (n) => String(n).padStart(2, '0');
  const thisYear = `${year}-${pad(month)}-${pad(day)}`;
  return thisYear >= today ? thisYear : `${year + 1}-${pad(month)}-${pad(day)}`;
}

// Which obligations an area gets: state ones everywhere, county ones with a county, town ones with a town.
function applies(obligation, area) {
  if (obligation.level === 'municipality') return Boolean(area.mun_code);
  if (obligation.level === 'county') return Boolean(area.county_fips);
  return true;
}

// The hazard mitigation plan record for the area: the town's, else the county's. { scope, record } or null.
export function planFor(calendar, area) {
  const hmp = calendar?.hmp;
  if (!hmp) return null;
  if (area.mun_code) return { scope: 'municipality', record: hmp.municipalities?.[area.mun_code] ?? null };
  if (area.county_fips) return { scope: 'county', record: hmp.counties?.[area.county_fips] ?? null };
  return null;
}

// Dated items for an area, soonest first, from `today` to `today + horizonDays`; an expired plan stays listed.
// [{ id, date, days, title, program, note, source, kit, kind: 'due' | 'expires' | 'local', yearly, plan }]
export function deadlinesFor(calendar, area, { today, horizonDays = 730, local = [] } = {}) {
  const end = addDays(today, horizonDays);
  const items = [];
  for (const obligation of calendar?.obligations ?? []) {
    if (!applies(obligation, area)) continue;
    const date = obligation.yearly ? nextYearly(obligation.yearly, today) : obligation.date;
    if (!date || date < today || date > end) continue;
    items.push({ id: obligation.id, date, days: daysBetween(today, date), title: obligation.title, program: obligation.program,
      note: obligation.note ?? null, source: obligation.source, kit: obligation.kit ?? null, kind: 'due',
      yearly: obligation.yearly ?? null });
  }
  const plan = planFor(calendar, area);
  if (plan?.record?.expires && (plan.record.expires <= end)) {
    items.push({ id: `hmp_${plan.scope}`, date: plan.record.expires, days: daysBetween(today, plan.record.expires),
      title: null, program: null, note: null, kit: calendar.hmp.kit ?? null, kind: 'expires', yearly: null,
      source: { label: calendar.hmp.source.publisher, url: calendar.hmp.source.page ?? calendar.hmp.source.url },
      plan: plan.record });
  }
  for (const [index, entry] of local.entries()) {
    if (!entry?.date || entry.date < today || entry.date > end) continue;
    items.push({ id: `local_${index}`, index, date: entry.date, days: daysBetween(today, entry.date), title: entry.title,
      program: null, note: null, source: null, kit: null, kind: 'local', yearly: null });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title)));
}

// RFC 5545 text: backslash, semicolon and comma escaped, line breaks as \n.
function icsText(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1).
function fold(line) {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  for (const char of line) {
    if (bytes.encode(current + char).length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = char;
    } else current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function stamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// A calendar file a planner adds to Outlook or Google Calendar: one all-day event per item, yearly ones repeating.
// `words.summary(item)` and `words.description(item)` give each event's text.
export function icsFor(items, { calendarName, now = new Date(), words }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NJ Atlas Studio//Deadlines//EN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(calendarName)}`];
  for (const item of items) {
    const day = item.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${item.id.replace(/[^A-Za-z0-9_-]/g, '-')}-${day}@nj-atlas-studio`, `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${addDays(item.date, 1).replace(/-/g, '')}`,
      `SUMMARY:${icsText(words.summary(item))}`, `DESCRIPTION:${icsText(words.description(item))}`);
    if (item.yearly) lines.push('RRULE:FREQ=YEARLY');
    if (item.source?.url) lines.push(`URL:${item.source.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
