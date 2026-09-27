import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeHash, emptyState, encodeHash } from '../../site/js/state.js';

const catalog = {
  layers: [
    {
      id: 'nj_test',
      fields: [
        { name: 'name', filter: 'search' }, { name: 'kind', filter: 'checklist' },
        { name: 'size', filter: 'range' }, { name: 'opened', filter: 'range' }, { name: 'code', filter: 'none' },
      ],
    },
    { id: 'nj_counties', fields: [{ name: 'population_2020', filter: 'range' }] },
    { id: 'nj_municipalities', fields: [{ name: 'mun_type', filter: 'checklist' }] },
    { id: 'nj_census_tracts', fields: [{ name: 'population_2020', filter: 'range' }] },
  ],
};
const levels = [
  { id: 'county', layer: 'nj_counties' },
  { id: 'municipality', layer: 'nj_municipalities' },
  { id: 'tract', layer: 'nj_census_tracts' },
];
const place = (parts = {}) => ({ county_fips: null, mun_code: null, tract_geoid: null, bg_geoid: null, ...parts });

test('round trip keeps the level, the area, every operator, Unicode text and dates', () => {
  const state = {
    boundary: 'tract',
    layer: 'nj_test',
    place: place({ county_fips: '033', mun_code: '1709', tract_geoid: '34033020100' }),
    conditions: [
      { field: 'kind', op: 'in', values: ['Township', 'Borough'], include_blank: true },
      { field: 'name', op: 'contains', value: 'Élan “Park” & Co' },
      { field: 'size', op: 'range', min: 5000, max: null },
      { field: 'opened', op: 'range', min: '2001-05-01', max: '2012-11-11' },
    ],
  };
  const hash = encodeHash(state);
  assert.match(hash, /^b=tract&layer=nj_test&county=033&mun=1709&tract=34033020100&c=[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeHash(`#${hash}`, catalog, levels), { state, notices: [] });
});

test('the first screen is counties with no dataset', () => {
  assert.deepEqual(emptyState(), { boundary: 'county', layer: null, place: place(), conditions: [] });
  assert.equal(encodeHash(emptyState()), 'b=county');
  assert.deepEqual(decodeHash('', catalog, levels), { state: emptyState(), notices: [] });
});

test('boundary-only views keep filters on the level\'s own fields', () => {
  const hash = encodeHash({ boundary: 'tract', layer: null, place: place({ county_fips: '013' }),
    conditions: [{ field: 'population_2020', op: 'range', min: 8000, max: null }] });
  const { state, notices } = decodeHash(hash, catalog, levels);
  assert.equal(state.layer, null);
  assert.equal(state.conditions.length, 1);
  assert.deepEqual(notices, []);
});

test('links made before boundary levels still open', () => {
  const { state } = decodeHash('#layer=nj_municipalities&county=033', catalog, levels);
  assert.deepEqual(state, { boundary: 'municipality', layer: null, place: place({ county_fips: '033' }), conditions: [] });
  const old = decodeHash('#layer=nj_test&county=033&mun=1709', catalog, levels).state;
  assert.equal(old.boundary, 'municipality');
  assert.equal(old.layer, 'nj_test');
});

test('a smaller area than the level moves the level down, unless this build lacks it', () => {
  assert.equal(decodeHash('#b=county&layer=nj_test&county=033&mun=1709', catalog, levels).state.boundary, 'municipality');
  const noBlockGroups = decodeHash('#b=tract&county=033&tract=34033020100&bg=340330201001', catalog, levels).state;
  assert.equal(noBlockGroups.boundary, 'tract');
  assert.equal(noBlockGroups.place.bg_geoid, null);
  assert.equal(decodeHash('#b=block_group', catalog, levels).state.boundary, 'county');
});

test('unknown layers, fields and broken links give notices instead of errors', () => {
  const gone = decodeHash('#layer=nj_gone&county=033', catalog, levels);
  assert.deepEqual(gone.notices, [{ code: 'unknownLayer' }]);
  assert.equal(gone.state.layer, null);
  assert.equal(gone.state.place.county_fips, '033');
  const withUnknown = encodeHash({ layer: 'nj_test', place: {}, conditions: [
    { field: 'gone', op: 'contains', value: 'x' }, { field: 'code', op: 'contains', value: 'y' },
    { field: 'name', op: 'contains', value: 'z' }] });
  const decoded = decodeHash(withUnknown, catalog, levels);
  assert.deepEqual(decoded.notices, [{ code: 'unknownField', detail: 'gone' }, { code: 'unknownField', detail: 'code' }]);
  assert.deepEqual(decoded.state.conditions, [{ field: 'name', op: 'contains', value: 'z' }]);
  assert.deepEqual(decodeHash('#layer=nj_test&c=%%%not-base64', catalog, levels).notices, [{ code: 'badLink' }]);
});

test('malformed place codes are ignored', () => {
  const { state } = decodeHash('#layer=nj_test&county=33&mun=abc&tract=123', catalog, levels);
  assert.deepEqual(state.place, place());
});
