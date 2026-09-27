import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanState, describe, toMapFilter, toPredicate } from '../../site/js/filters.js';
import { TEXT } from '../../site/js/text.js';

// The same file pipeline/filters.py is tested against. Never copy cases into this test.
const fixture = JSON.parse(readFileSync(new URL('../fixtures/filter_cases.json', import.meta.url), 'utf8'));

for (const testCase of fixture.cases) {
  test(`shared case: ${testCase.name}`, () => {
    const clean = cleanState(testCase.state, fixture.fields);
    const ids = fixture.rows.filter(toPredicate(clean)).map((row) => row.atlas_id);
    assert.deepEqual(ids, testCase.expected_ids);
    if ('map_filter' in testCase) assert.deepEqual(toMapFilter(clean), testCase.map_filter);
  });
}

test('the fixture has enough map filter expectations', () => {
  assert.ok(fixture.cases.filter((c) => 'map_filter' in c).length >= 8);
});

test('describe gives plain phrases in order', () => {
  const clean = cleanState({
    boundary: 'block_group',
    layer: 'nj_test',
    place: { county_fips: '033', mun_code: '1709', tract_geoid: '34033020100', bg_geoid: '340330201001' },
    conditions: [
      { field: 'kind', op: 'in', values: ['Township', 'Borough'], include_blank: true },
      { field: 'name', op: 'contains', value: ' penn ' },
      { field: 'size', op: 'range', min: 5000, max: null },
      { field: 'size', op: 'range', min: null, max: 10 },
      { field: 'opened', op: 'range', min: '2001-01-01', max: '2002-01-01' },
    ],
  }, fixture.fields);
  const phrases = describe(clean, fixture.fields, TEXT, {
    placeNames: { county: 'Salem County', municipality: 'Pennsville Township', tract: 'Census Tract 201' },
    formatValue: (value) => String(value),
  });
  assert.deepEqual(phrases.map((p) => p.phrase), [
    'In Salem County',
    'In Pennsville Township',
    'In Census Tract 201',
    'In 340330201001',
    'Kind is Township or Borough or blank',
    'Name contains “penn”',
    'Size is at least 5000',
    'Size is at most 10',
    'Opened is between 2001-01-01 and 2002-01-01',
  ]);
  assert.deepEqual(phrases.map((p) => p.kind), ['county', 'municipality', 'tract', 'block_group', 'condition',
    'condition', 'condition', 'condition', 'condition']);
  assert.equal(phrases[4].index, 0);
  assert.equal(clean.boundary, 'block_group');
});

test('an empty state has no phrases and no map filter', () => {
  const clean = cleanState({ layer: 'x', place: {}, conditions: [] }, fixture.fields);
  assert.deepEqual(describe(clean, fixture.fields, TEXT), []);
  assert.equal(toMapFilter(clean), null);
});
