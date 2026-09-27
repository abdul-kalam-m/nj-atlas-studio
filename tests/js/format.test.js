import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatCount, formatDate, formatNumber, formatValue } from '../../site/js/format.js';

test('formatNumber rounds and groups', () => {
  assert.equal(formatNumber(274534), '274,534');
  assert.equal(formatNumber(610.646, 1), '610.6');
  assert.equal(formatNumber(2.5, 2), '2.5');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(null), '');
  assert.equal(formatCount(1234567), '1,234,567');
});

test('formatDate uses the calendar day without shifting', () => {
  assert.equal(formatDate('2020-01-05'), 'Jan 5, 2020');
  assert.equal(formatDate('1999-12-31'), 'Dec 31, 1999');
  assert.equal(formatDate('not a date'), 'not a date');
});

test('formatValue handles types, units and missing values', () => {
  const area = { type: 'number', decimals: 1, unit: 'sq mi' };
  assert.equal(formatValue(610.646, area, 'Not recorded'), '610.6 sq mi');
  assert.equal(formatValue(0, { type: 'number', decimals: 0 }, 'Not recorded'), '0');
  assert.equal(formatValue(null, area, 'Not recorded'), 'Not recorded');
  assert.equal(formatValue(undefined, { type: 'text' }, 'Not recorded'), 'Not recorded');
  assert.equal(formatValue('2020-01-05', { type: 'date' }, 'Not recorded'), 'Jan 5, 2020');
  assert.equal(formatValue('Township', { type: 'category' }, 'Not recorded'), 'Township');
});

test('formatBytes', () => {
  assert.equal(formatBytes(512), '512 bytes');
  assert.equal(formatBytes(1830000), '1.8 MB');
  assert.equal(formatBytes(9370000), '9.4 MB');
});
