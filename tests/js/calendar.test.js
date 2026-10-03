import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, deadlinesFor, icsFor, nextYearly, planFor } from '../../site/js/studio/calendar.js';

const calendar = {
  obligations: [
    { id: 'ms4_annual_report', title: 'MS4 annual report and certification', program: 'Tier A permit', level: 'municipality',
      yearly: { month: 5, day: 2 }, kit: 'ms4_watershed', source: { label: 'Permit, Part IV.K.1.d', url: 'https://example.org/permit' } },
    { id: 'ms4_assessment_report', title: 'Watershed assessment report', program: 'Tier A permit', level: 'municipality',
      date: '2027-01-01', source: { label: 'Permit, Part IV.H.1.e', url: 'https://example.org/permit' } },
    { id: 'old', title: 'Inventory', program: 'Tier A permit', level: 'municipality', date: '2026-01-01', source: { label: 'P', url: 'https://example.org' } },
    { id: 'county_thing', title: 'County report', program: 'Rule', level: 'county', date: '2027-03-01', source: { label: 'R', url: 'https://example.org' } },
  ],
  hmp: {
    source: { publisher: 'FEMA', url: 'https://www.fema.gov/api/open/v1/HazardMitigationPlanStatuses', page: 'https://www.fema.gov/openfema-data-page/hazard-mitigation-plan-statuses-v1' }, kit: 'hazard_mitigation',
    counties: { '021': { plan: 'Mercer County 2021', expires: '2026-12-09', update: { plan: 'Mercer County 2026', status: 'Plan in Progress' } } },
    municipalities: { 1111: { plan: 'Mercer County 2021', expires: '2026-12-09', town_status: 'Approved' }, '0402': { update: { plan: 'Camden County 2027', status: 'Plan in Progress' } } },
  },
};

test('dates are calendar days', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-03', '2027-05-02'), 211);
  assert.equal(nextYearly({ month: 5, day: 2 }, '2026-10-03'), '2027-05-02');
  assert.equal(nextYearly({ month: 5, day: 2 }, '2027-05-02'), '2027-05-02');
  assert.equal(nextYearly({ month: 5, day: 2 }, '2027-05-03'), '2028-05-02');
});

test('a town gets its own and its plan dates, soonest first; past dates drop', () => {
  const items = deadlinesFor(calendar, { county_fips: '021', mun_code: '1111' }, { today: '2026-10-03' });
  assert.deepEqual(items.map((i) => [i.id, i.date, i.kind]), [
    ['hmp_municipality', '2026-12-09', 'expires'], ['ms4_assessment_report', '2027-01-01', 'due'],
    ['county_thing', '2027-03-01', 'due'], ['ms4_annual_report', '2027-05-02', 'due']]);
  assert.equal(items[0].days, 67);
  assert.equal(items[0].kit, 'hazard_mitigation');
  assert.equal(items[0].source.url, 'https://www.fema.gov/openfema-data-page/hazard-mitigation-plan-statuses-v1');
  assert.equal(items.at(-1).kit, 'ms4_watershed');
  assert.deepEqual(items.at(-1).yearly, { month: 5, day: 2 });
});

test('a county gets county dates and its plan; the state gets neither', () => {
  assert.deepEqual(deadlinesFor(calendar, { county_fips: '021' }, { today: '2026-10-03' }).map((i) => i.id), ['hmp_county', 'county_thing']);
  assert.deepEqual(deadlinesFor(calendar, {}, { today: '2026-10-03' }).map((i) => i.id), []);
});

test('an expired plan stays listed; the horizon limits the rest', () => {
  const items = deadlinesFor(calendar, { county_fips: '021', mun_code: '1111' }, { today: '2027-02-01', horizonDays: 60 });
  assert.deepEqual(items.map((i) => [i.id, i.days]), [['hmp_municipality', -54], ['county_thing', 28]]);
});

test("a town's own dates join the list and the plan record is found for towns outside any plan", () => {
  const local = [{ title: 'Master plan reexamination', date: '2027-06-30' }, { title: 'Past', date: '2020-01-01' }];
  const items = deadlinesFor(calendar, { county_fips: '007', mun_code: '0402' }, { today: '2026-10-03', local });
  assert.deepEqual(items.filter((i) => i.kind === 'local').map((i) => [i.title, i.index]), [['Master plan reexamination', 0]]);
  assert.deepEqual(planFor(calendar, { county_fips: '007', mun_code: '0402' }).record, calendar.hmp.municipalities['0402']);
  assert.equal(planFor(calendar, { county_fips: '007', mun_code: '9999' }).record, null);
  assert.equal(planFor({ obligations: [] }, { mun_code: '1111' }), null);
});

test('the calendar file is valid iCalendar: escaped, folded, all-day, yearly ones repeat', () => {
  const items = deadlinesFor(calendar, { county_fips: '021', mun_code: '1111' }, { today: '2026-10-03' });
  const words = { summary: (i) => i.title ?? 'Hazard mitigation plan expires', description: (i) => `${i.program ?? ''}; ${'Long note, '.repeat(12)}` };
  const ics = icsFor(items, { calendarName: 'Trenton, NJ deadlines', now: new Date('2026-10-03T12:00:00Z'), words });
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('X-WR-CALNAME:Trenton\\, NJ deadlines'));
  assert.equal(lines.filter((l) => l === 'BEGIN:VEVENT').length, 4);
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20270502') && lines.includes('DTEND;VALUE=DATE:20270503'));
  assert.equal(lines.filter((l) => l === 'RRULE:FREQ=YEARLY').length, 1);
  assert.ok(lines.includes('DTSTAMP:20261003T120000Z'));
  assert.ok(lines.every((l) => new TextEncoder().encode(l).length <= 75), 'every line folded');
  assert.ok(lines.some((l) => l.startsWith(' ')), 'long descriptions continue on folded lines');
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(lines.some((l) => l.startsWith('UID:ms4_annual_report-20270502@')));
});
