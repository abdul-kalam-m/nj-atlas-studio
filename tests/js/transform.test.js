import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertValue, toRow } from '../../site/js/studio/transform.js';

// The same file tests/py/test_transforms.py checks pipeline/normalize.py against.
const fixture = JSON.parse(readFileSync(new URL('../fixtures/transform_cases.json', import.meta.url), 'utf8'));

for (const testCase of fixture.cases) {
  test(`transform: ${testCase.label}`, () => {
    const actual = convertValue(testCase.value, testCase.field);
    if (typeof testCase.expected === 'number') assert.ok(Math.abs(actual - testCase.expected) < 1e-9, `${actual}`);
    else assert.equal(actual, testCase.expected);
  });
}

test('a row takes the atlas ID from the source ID field and renames fields', () => {
  const entry = { source: { id_field: 'OBJECTID' }, fields: [
    { source: 'PCL_MUN', name: 'district_code', type: 'text' },
    { source: 'PROP_CLASS', name: 'property_class', type: 'category', value_labels: { 2: 'Residential' } }] };
  assert.deepEqual(toRow({ OBJECTID: 7, PCL_MUN: '1709', PROP_CLASS: '2', OWNER_NAME: 'x' }, entry),
    { atlas_id: '7', district_code: '1709', property_class: 'Residential' });
});
