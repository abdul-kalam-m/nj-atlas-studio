import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressWhere, parseAddress } from '../../site/js/studio/search.js';

const fallback = { number_field: 'ADD_NUMBER', street_field: 'ST_NAME', place_field: 'POST_COMM' };

test('a typed address becomes a house number, a street name and a place', () => {
  assert.deepEqual(parseAddress('12 Church Landing Rd, Pennsville'), { number: 12, street: 'CHURCH LANDING', place: 'Pennsville' });
  assert.deepEqual(parseAddress('45 N. Broadway'), { number: 45, street: 'BROADWAY', place: null });
  assert.deepEqual(parseAddress('301 Main Street West'), { number: 301, street: 'MAIN', place: null });
  assert.deepEqual(parseAddress('7B Route 49'), { number: 7, street: 'ROUTE 49', place: null });
});

test('text without a house number is not an address', () => {
  assert.equal(parseAddress('Broadway'), null);
  assert.equal(parseAddress(''), null);
  assert.equal(parseAddress('12'), null);
});

test('the where clause uses the indexed fields and quotes text', () => {
  assert.equal(addressWhere(parseAddress("12 O'Brien Ave, Salem"), fallback),
    "ADD_NUMBER = 12 AND ST_NAME = 'O''BRIEN' AND POST_COMM = 'Salem'");
  assert.equal(addressWhere(parseAddress('45 Broadway'), fallback), "ADD_NUMBER = 45 AND ST_NAME = 'BROADWAY'");
});
