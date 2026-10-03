import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeLines, changesCsv, compareCycles, unitFeatures } from '../../site/js/studio/compare.js';

const spec = { key: 'au_id', fields: ['use_status', 'phosphorus', 'tss'], flag: 'Not attaining', earlier: '2022', later: '2024' };
const fields = [{ name: 'use_status', label: 'Aquatic life use' }, { name: 'phosphorus', label: 'Total phosphorus' }, { name: 'tss', label: 'Total suspended solids' }];
const row = (au, name, use, p, t) => ({ au_id: au, name, use_status: use, phosphorus: p, tss: t });

const earlier = [
  row('A', 'Alpha Brook', 'Not attaining', 'Not attaining', 'Attaining'),
  row('B', 'Beta Creek', 'Attaining', 'Insufficient data', 'Attaining'),
  row('C', 'Gamma River', 'Not attaining', 'Attaining', 'Not attaining'),
  row('D', 'Delta Run', 'Attaining', 'Attaining', 'Attaining'),
];
const later = [
  row('A', 'Alpha Brook', 'Not attaining', 'Not attaining', 'Not attaining'), // phosphorus kept, tss new
  row('B', 'Beta Creek', 'Not attaining', 'Not attaining', null), // use and phosphorus new
  row('C', 'Gamma River', 'Insufficient data', 'Attaining', 'Attaining'), // both gone
  row('D', 'Delta Run', 'Attaining', 'Attaining', 'Attaining'),
  row('E', 'Epsilon Lake', 'Not attaining', null, null), // a unit the earlier cycle does not have
];

test('each finding is new, gone or in both, and a unit takes its most notable change', () => {
  const { changes, units, counts } = compareCycles(earlier, later, spec, fields);
  assert.deepEqual(counts, { units: 5, unitsChanged: 4, added: 4, removed: 2, kept: 2 });
  assert.deepEqual(changes.filter((c) => c.kind === 'added').map((c) => [c.key, c.field]),
    [['A', 'tss'], ['B', 'use_status'], ['B', 'phosphorus'], ['E', 'use_status']]);
  assert.deepEqual(changes.filter((c) => c.kind === 'removed').map((c) => [c.key, c.field, c.now]),
    [['C', 'use_status', 'Insufficient data'], ['C', 'tss', 'Attaining']]);
  assert.deepEqual(changes.filter((c) => c.kind === 'kept').map((c) => [c.key, c.field]), [['A', 'use_status'], ['A', 'phosphorus']]);
  assert.deepEqual(Object.fromEntries(units.map((u) => [u.key, u.kind])), { A: 'added', B: 'added', C: 'removed', D: 'none', E: 'added' });
  const epsilon = changes.find((c) => c.key === 'E');
  assert.equal(epsilon.inEarlier, false);
  assert.equal(epsilon.label, 'Aquatic life use');
});

test('changes sort by kind, then unit name in natural order, then the recipe order of fields', () => {
  const rows = [row('X10', 'Unit 10', 'Not attaining', 'Not attaining', null), row('X2', 'Unit 2', 'Not attaining', null, null)];
  const { changes } = compareCycles([], rows, spec, fields);
  assert.deepEqual(changes.map((c) => [c.name, c.field]), [['Unit 2', 'use_status'], ['Unit 10', 'use_status'], ['Unit 10', 'phosphorus']]);
});

test('units without a key are left out, and only the first row of a key counts', () => {
  const { units } = compareCycles([row(null, 'No key', 'Not attaining')], [row('A', 'First', 'Attaining'), row('A', 'Second', 'Not attaining')], spec, fields);
  assert.deepEqual(units.map((u) => [u.key, u.name, u.kind]), [['A', 'First', 'none']]);
});

test('the overlay gives each feature its unit kind', () => {
  const { units } = compareCycles(earlier, later, spec, fields);
  const features = [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { au_id: 'C', name: 'Gamma River' } },
    { type: 'Feature', geometry: null, properties: { au_id: 'A' } }];
  assert.deepEqual(unitFeatures(features, units, 'au_id').map((f) => f.properties), [{ kind: 'removed', name: 'Gamma River' }]);
});

const words = {
  headers: { unit: 'Unit', id: 'ID', field: 'Parameter', change: 'Change' },
  kinds: { added: 'New in 2024', removed: 'Gone in 2024', kept: 'In both' }, blank: 'Blank', notListed: 'Not in this cycle',
  summary: (title, counts) => `${title}: ${counts.added} new, ${counts.removed} gone, ${counts.kept} in both`,
  more: (n) => `${n} more in the CSV`,
};

test('the CSV leads with the screening label and names both cycles', () => {
  const result = compareCycles(earlier, later, spec, fields);
  const csv = changesCsv(result, { label: 'Screening, not a regulatory determination', lines: ['Newark City'], words, earlier: '2022', later: '2024' });
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.equal(lines[0], '"Screening, not a regulatory determination"'); // a comma, so quoted
  assert.equal(lines[2], 'Unit,ID,Parameter,2022,2024,Change');
  assert.ok(lines.includes('Epsilon Lake,E,Aquatic life use,Not in this cycle,Not attaining,New in 2024'));
  assert.ok(lines.includes('Alpha Brook,A,Total suspended solids,Attaining,Not attaining,New in 2024'));
});

test('print lines summarise, then list new and gone findings up to a limit', () => {
  const result = compareCycles(earlier, later, spec, fields);
  const lines = changeLines(result, { title: 'Aquatic life use', words, max: 3 });
  assert.deepEqual(lines, ['Aquatic life use: 4 new, 2 gone, 2 in both', 'New in 2024: Total suspended solids, Alpha Brook',
    'New in 2024: Aquatic life use, Beta Creek', 'New in 2024: Total phosphorus, Beta Creek', '3 more in the CSV']);
});
