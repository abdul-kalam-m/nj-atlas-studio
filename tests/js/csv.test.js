import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvDecimals, csvFileName, plainNumber, safeText, slug, toCsv } from '../../site/js/csv.js';

const columns = [['name', 'Name'], ['acres', 'Area'], ['county', 'County'], ['lon', 'Longitude'], ['atlas_id', 'Atlas ID']];

test('header, byte-order mark and CRLF line endings', () => {
  const csv = toCsv([{ name: 'Park', acres: 12.5, county: 'Salem County', lon: -75.5, atlas_id: '1' }], columns, { acres: 1, lon: 6 });
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv, '﻿Name,Area,County,Longitude,Atlas ID\r\nPark,12.5,Salem County,-75.5,1\r\n');
});

test('quoting of commas, quotes and newlines', () => {
  const csv = toCsv([{ name: 'Smith, "Big" Park\nNorth', acres: null, county: null, lon: null, atlas_id: '2' }], columns, { acres: 1 });
  assert.equal(csv.split('\r\n')[1], '"Smith, ""Big"" Park\nNorth",,,,2');
});

test('formula guard and accented text', () => {
  assert.equal(safeText('=SUM(1)'), "'=SUM(1)");
  assert.equal(safeText('+1'), "'+1");
  assert.equal(safeText('-5 dollars'), "'-5 dollars");
  assert.equal(safeText('@home'), "'@home");
  assert.equal(safeText('Élan Meadow'), 'Élan Meadow');
  assert.equal(safeText(null), '');
});

test('numbers match the Python build formatting', () => {
  assert.equal(plainNumber(610.646, 1), '610.6');
  assert.equal(plainNumber(274534, 0), '274534');
  assert.equal(plainNumber(2.5, 2), '2.5');
  assert.equal(plainNumber(-0.0001, 2), '0');
  assert.equal(plainNumber(null, 2), '');
});

test('file names and decimals', () => {
  const day = new Date('2026-09-25T12:00:00Z');
  assert.equal(csvFileName('nj_municipalities', 'Salem County', day), 'nj_municipalities_salem-county_2026-09-25.csv');
  assert.equal(csvFileName('nj_trails', null, day), 'nj_trails_nj_2026-09-25.csv');
  assert.equal(slug('Élan Township'), 'elan-township');
  assert.deepEqual(csvDecimals({ fields: [{ name: 'acres', type: 'number', decimals: 1 }, { name: 'n', type: 'text' }] }),
    { lon: 6, lat: 6, acres: 1 });
});
