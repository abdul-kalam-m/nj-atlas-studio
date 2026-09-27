import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atLeastLevel, choose, deepestChoice, emptyPlace, levelFor, pickerLevels, shownLayerId, trimPlace, unitsFor }
  from '../../site/js/places.js';

const units = {
  municipality: [
    { code: '1709', name: 'Pennsville Township', county: '033' },
    { code: '1713', name: 'Salem City', county: '033' },
    { code: '0502', name: 'Cape May City', county: '009' },
  ],
  tract: [
    { code: '34033001000', name: 'Census Tract 10', county: '033', muns: ['1709', '1713'] },
    { code: '34033000900', name: 'Census Tract 9', county: '033', muns: ['1709'] },
    { code: '34009000201', name: 'Census Tract 2.01', county: '009', muns: ['0502'] },
  ],
  block_group: [
    { code: '340330010001', name: 'Block Group 1', county: '033', tract: '34033001000', muns: ['1709'] },
    { code: '340330010002', name: 'Block Group 2', county: '033', tract: '34033001000', muns: ['1713'] },
    { code: '340330009001', name: 'Block Group 1', county: '033', tract: '34033000900', muns: ['1709'] },
  ],
};
const codes = (list) => list.map((unit) => unit.code);

test('each boundary level shows the pickers from county down to it', () => {
  assert.deepEqual(pickerLevels('state'), []);
  assert.deepEqual(pickerLevels('county'), ['county']);
  assert.deepEqual(pickerLevels('tract'), ['county', 'municipality', 'tract']);
  assert.deepEqual(pickerLevels('block_group'), ['county', 'municipality', 'tract', 'block_group']);
});

test('pickers list only areas inside the larger choices', () => {
  const salem = { ...emptyPlace(), county_fips: '033' };
  assert.deepEqual(codes(unitsFor('municipality', units.municipality, salem)), ['1709', '1713']);
  assert.deepEqual(codes(unitsFor('tract', units.tract, salem)), ['34033001000', '34033000900']);
  // A tract sharing area with two towns is listed under both (D-021).
  assert.deepEqual(codes(unitsFor('tract', units.tract, { ...salem, mun_code: '1713' })), ['34033001000']);
  const tract10 = { ...salem, tract_geoid: '34033001000' };
  assert.deepEqual(codes(unitsFor('block_group', units.block_group, tract10)), ['340330010001', '340330010002']);
  assert.deepEqual(codes(unitsFor('block_group', units.block_group, { ...tract10, mun_code: '1709' })), ['340330010001']);
});

test('smaller pickers wait for the larger choice', () => {
  assert.deepEqual(unitsFor('municipality', units.municipality, emptyPlace()), []);
  assert.deepEqual(unitsFor('tract', units.tract, emptyPlace()), []);
  assert.deepEqual(unitsFor('block_group', units.block_group, { ...emptyPlace(), county_fips: '033' }), []);
});

test('choosing an area clears the smaller choices, and trimming follows the level', () => {
  const full = { county_fips: '033', mun_code: '1709', tract_geoid: '34033001000', bg_geoid: '340330010001' };
  assert.deepEqual(choose(full, 'municipality', '1713'),
    { county_fips: '033', mun_code: '1713', tract_geoid: null, bg_geoid: null });
  assert.deepEqual(choose(full, 'county', null), emptyPlace());
  assert.deepEqual(trimPlace(full, 'municipality'), { ...emptyPlace(), county_fips: '033', mun_code: '1709' });
  assert.deepEqual(trimPlace(full, 'state'), emptyPlace());
  assert.equal(deepestChoice(full), 'block_group');
  assert.equal(deepestChoice(emptyPlace()), null);
});

test('a smaller chosen area moves the level down, never up', () => {
  assert.equal(levelFor({ ...emptyPlace(), mun_code: '1709' }, 'county'), 'municipality');
  assert.equal(levelFor({ ...emptyPlace(), county_fips: '033' }, 'tract'), 'tract');
});

test('the shown layer is the dataset, or the boundary level itself', () => {
  const levels = [{ id: 'county', layer: 'nj_counties' }, { id: 'tract', layer: 'nj_census_tracts' }];
  assert.equal(shownLayerId({ boundary: 'tract', layer: null }, levels), 'nj_census_tracts');
  assert.equal(shownLayerId({ boundary: 'tract', layer: 'nj_trails' }, levels), 'nj_trails');
  assert.equal(shownLayerId({ boundary: 'state', layer: null }, levels), null);
});

test('a dataset loaded one municipality at a time needs at least the municipality level', () => {
  assert.equal(atLeastLevel('county', 'municipality'), 'municipality');
  assert.equal(atLeastLevel('state', 'municipality'), 'municipality');
  assert.equal(atLeastLevel('tract', 'municipality'), 'tract');
});

