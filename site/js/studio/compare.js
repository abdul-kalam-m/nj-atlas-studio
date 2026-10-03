// Changes between two cycles of a series (D-091): the units of a later layer joined to the earlier cycle's on the
// recipe's `compare.key`, and, for each compared field, whether the finding (`compare.flag`, e.g. 'Not attaining')
// is new in the later cycle, gone from it, or in both. Rows are in output names and displayed values (toRow).
// Pure: imports only the pure csv.js.
import { toCsv } from '../csv.js';

export const KINDS = ['added', 'removed', 'kept'];
const RANK = { none: 0, kept: 1, removed: 2, added: 3 };

function keyed(rows, key) {
  const out = new Map();
  for (const row of rows) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '' && !out.has(String(value))) out.set(String(value), row);
  }
  return out;
}

// { changes: [{ key, name, field, label, was, now, kind, inEarlier, inLater }], units: [{ key, name, kind, inEarlier,
// inLater }], counts: { added, removed, kept, units, unitsChanged } }. A unit's kind is its most notable change: a new
// finding, then one gone, then one in both; 'none' when it has no finding in either cycle.
export function compareCycles(earlierRows, laterRows, spec, fields, labelField = 'name') {
  const before = keyed(earlierRows, spec.key);
  const after = keyed(laterRows, spec.key);
  const labels = new Map(fields.map((field) => [field.name, field.label]));
  const order = new Map(spec.fields.map((name, i) => [name, i]));
  const changes = [];
  const units = [];
  for (const key of new Set([...after.keys(), ...before.keys()])) {
    const was = before.get(key) ?? null;
    const now = after.get(key) ?? null;
    const name = (now ?? was)?.[labelField] ?? key;
    let kind = 'none';
    for (const field of spec.fields) {
      const a = was ? was[field] ?? null : null;
      const b = now ? now[field] ?? null : null;
      const flagged = [a === spec.flag, b === spec.flag];
      if (!flagged[0] && !flagged[1]) continue;
      const change = flagged[0] && flagged[1] ? 'kept' : flagged[1] ? 'added' : 'removed';
      changes.push({ key, name, field, label: labels.get(field) ?? field, was: a, now: b, kind: change,
        inEarlier: Boolean(was), inLater: Boolean(now) });
      if (RANK[change] > RANK[kind]) kind = change;
    }
    units.push({ key, name, kind, inEarlier: Boolean(was), inLater: Boolean(now) });
  }
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'en', { numeric: true });
  changes.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || byName(a, b) || order.get(a.field) - order.get(b.field));
  units.sort(byName);
  const counts = { units: units.length, unitsChanged: units.filter((unit) => unit.kind === 'added' || unit.kind === 'removed').length };
  for (const kind of KINDS) counts[kind] = changes.filter((change) => change.kind === kind).length;
  return { changes, units, counts };
}

// The later cycle's features, each with its unit's kind, for the map overlay.
export function unitFeatures(features, units, key) {
  const kinds = new Map(units.map((unit) => [unit.key, unit.kind]));
  return features.filter((feature) => feature.geometry).map((feature) => ({
    type: 'Feature', geometry: feature.geometry,
    properties: { kind: kinds.get(String(feature.properties?.[key])) ?? 'none', name: feature.properties?.name ?? null },
  }));
}

function csvLine(cells) {
  return cells.map((cell) => (/[",\r\n]/.test(cell) ? `"${String(cell).replace(/"/g, '""')}"` : String(cell))).join(',');
}

// The changes as CSV: the screening label first (D-041), then the context lines, then one row per finding.
// `words`: { headers: { unit, id, field, earlier, later, change }, kinds: { added, removed, kept }, blank }.
export function changesCsv(result, { label, lines, words, earlier, later }) {
  const preface = [label, ...lines].filter(Boolean).map((line) => csvLine([line]));
  const rows = result.changes.map((change) => ({
    unit: change.name, id: change.key, field: change.label,
    was: change.inEarlier ? change.was ?? words.blank : words.notListed,
    now: change.inLater ? change.now ?? words.blank : words.notListed,
    change: words.kinds[change.kind],
  }));
  const body = toCsv(rows, [['unit', words.headers.unit], ['id', words.headers.id], ['field', words.headers.field],
    ['was', earlier], ['now', later], ['change', words.headers.change]]).replace(/^﻿/, '');
  return `﻿${preface.join('\r\n')}\r\n${body}`;
}

// Lines for a print or PNG: the counts, then each new finding and each one gone, up to `max` (D-041 label apart).
export function changeLines(result, { title, words, max = 8 }) {
  const { counts } = result;
  const lines = [words.summary(title, counts)];
  const notable = result.changes.filter((change) => change.kind !== 'kept');
  for (const change of notable.slice(0, max)) lines.push(`${words.kinds[change.kind]}: ${change.label}, ${change.name}`);
  if (notable.length > max) lines.push(words.more(notable.length - max));
  return lines;
}
