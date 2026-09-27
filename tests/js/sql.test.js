import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { areaWhere, conditionsWhere, countyNumber, joinWhere, quote } from '../../site/js/studio/sql.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/sql_cases.json', import.meta.url), 'utf8'));

for (const testCase of fixture.conditions) {
  test(`where: ${testCase.label}`, () => {
    assert.equal(conditionsWhere(fixture.entry, testCase.conditions, fixture.types), testCase.where);
  });
}

for (const testCase of fixture.areas) {
  test(`area: ${testCase.label}`, () => {
    const area = { county_fips: null, mun_code: null, tract_geoid: null, bg_geoid: null, ...testCase.area };
    assert.deepEqual(areaWhere(testCase.entry, area, testCase.names ?? {}), testCase.expected);
  });
}

test('the fixture has at least 25 condition cases', () => {
  assert.ok(fixture.conditions.length >= 25);
});

test('every NJ county number follows from its FIPS code', () => {
  assert.equal(countyNumber('001'), '01');
  assert.equal(countyNumber('033'), '17');
  assert.equal(countyNumber('041'), '21');
});

test('quote doubles single quotes', () => {
  assert.equal(quote("O'Brien's"), "'O''Brien''s'");
});

test('joinWhere drops empty parts and brackets the rest', () => {
  assert.equal(joinWhere('1=1', null), '1=1');
  assert.equal(joinWhere('1=1', "A = 'x'"), "A = 'x'");
  assert.equal(joinWhere("A = 'x'", 'B > 2 OR C < 1'), "(A = 'x') AND (B > 2 OR C < 1)");
});

test('a number condition never quotes a non-number', () => {
  assert.throws(() => conditionsWhere(fixture.entry, [{ field: 'acres', op: 'range', min: 'x; DROP', max: null }], fixture.types));
});
