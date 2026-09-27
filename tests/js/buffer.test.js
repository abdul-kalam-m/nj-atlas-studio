import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import jsts from '@turf/jsts';
import { bufferDownload, bufferLegend, bufferName, bufferSpecs, drawingOrder, formatDistance, newBuffer, nextDistance, outputKey,
  toMeters, validDistance } from '../../site/js/studio/buffer.js';
import { bufferFeatures, quadrantSegments } from '../../site/js/studio/geoprocess.js';
import { projectGeometry } from '../../site/js/studio/stateplane.js';
import { TEXT } from '../../site/js/studio/text.js';
import { geodesic } from './geodesic.mjs';

const recipe = (id) => JSON.parse(readFileSync(new URL(`../../catalog/layers/${id}.json`, import.meta.url), 'utf8'));
const schools = recipe('nj_schools');
const PENNSVILLE = [-75.51, 39.648];
const point = (coordinates, properties = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties });
const outer = (geometry) => (geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0]);

function gridArea(geometry) {
  const grid = projectGeometry(geometry);
  const polygons = grid.type === 'Polygon' ? [grid.coordinates] : grid.coordinates;
  let total = 0;
  for (const rings of polygons) {
    rings.forEach((ring, index) => {
      let sum = 0;
      for (let i = 0; i < ring.length - 1; i += 1) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      total += (index === 0 ? 1 : -1) * Math.abs(sum / 2);
    });
  }
  return total;
}

// ---- The recipe (buffer.js) ----

test('distances: feet and meters, the limits, the next distance', () => {
  assert.equal(toMeters(1000, 'ft'), 304.8);
  assert.equal(toMeters(250, 'm'), 250);
  assert.equal(formatDistance(1000, 'ft'), '1,000 ft');
  assert.equal(formatDistance(2.5, 'm'), '2.5 m');
  assert.ok(validDistance(26400, 'ft') && !validDistance(26401, 'ft') && !validDistance(0, 'm') && !validDistance(8001, 'm'));
  const buffer = newBuffer('b1', 'nj_schools', 0);
  assert.equal(nextDistance(buffer), 1000);
  assert.equal(nextDistance({ ...buffer, distances: [{ value: 20000 }] }), 26400);
  assert.equal(nextDistance({ ...buffer, unit: 'm', distances: [] }), 100);
});

test('names say what was buffered: all, a filter, or a selection; a custom name wins', () => {
  const buffer = newBuffer('b1', 'nj_schools', 0);
  assert.equal(bufferName(buffer, schools, TEXT.buffer), 'Schools buffer');
  const filtered = { ...buffer, select: 'filter', filters: [{ field: 'school_type', op: 'in', values: ['Elementary School'] }] };
  assert.equal(bufferName(filtered, schools, TEXT.buffer), 'Schools buffer (Elementary School)');
  const many = { ...filtered, filters: [{ field: 'school_type', op: 'in', values: ['A', 'B', 'C', 'D'] }] };
  assert.equal(bufferName(many, schools, TEXT.buffer), 'Schools buffer (4 values)');
  assert.equal(bufferName({ ...buffer, select: 'picked', picked: ['1', '2'] }, schools, TEXT.buffer), 'Schools buffer (2 selected)');
  assert.equal(bufferName({ ...buffer, name: 'Drug-free school zones' }, schools, TEXT.buffer), 'Drug-free school zones');
});

test('the output depends on the inputs, distances and dissolve, not on the style', () => {
  const buffer = newBuffer('b1', 'nj_schools', 0);
  const key = outputKey(buffer, 'municipality/1709');
  const restyled = structuredClone(buffer);
  restyled.distances[0].style.fill = '#000000';
  restyled.name = 'Other';
  assert.equal(outputKey(restyled, 'municipality/1709'), key);
  assert.notEqual(outputKey({ ...buffer, dissolve: true }, 'municipality/1709'), key);
  assert.notEqual(outputKey({ ...buffer, unit: 'm' }, 'municipality/1709'), key);
  assert.notEqual(outputKey(buffer, 'county/033'), key);
  const picked = { ...buffer, select: 'picked', picked: ['7'] };
  assert.equal(outputKey(picked, 'county/033'), outputKey(picked, 'municipality/1709')); // picked features ignore the area
});

test('each distance is its own map layer, largest drawn first; the legend lists them smallest first', () => {
  const buffer = newBuffer('b1', 'nj_schools', 0);
  buffer.distances.push({ value: 1000, style: { fill: '#3182BD', fill_opacity: 0.2, outline: '#08519C', outline_width: 2, outline_style: 'dashed' } });
  buffer.distances.push({ value: 250, style: { fill: '#6BAED6', fill_opacity: 0.4, outline: '#08519C', outline_width: 0, outline_style: 'dotted' } });
  assert.deepEqual(drawingOrder(buffer), [1, 0, 2]);
  const specs = bufferSpecs(buffer);
  assert.deepEqual(specs.map((spec) => spec.id), ['r1-fill', 'r1-line', 'r0-fill', 'r0-line', 'r2-fill']); // no outline at width 0
  assert.deepEqual(specs[1].paint['line-dasharray'], [4, 2.5]);
  assert.equal(specs[3].paint['line-dasharray'], undefined);
  assert.deepEqual(specs[0].filter, ['==', ['get', 'ring'], 1]);
  assert.deepEqual(specs[0].paint, { 'fill-color': '#3182BD', 'fill-opacity': 0.2 });
  const legend = bufferLegend(buffer);
  assert.deepEqual(legend.map((row) => row.label), ['250 ft', '500 ft', '1,000 ft']);
  assert.equal(legend[2].swatch.dash, 'dashed');
});

test('the download carries each shape’s distance and unit as made', () => {
  const output = { layer: 'nj_schools', unit: 'ft', dissolve: false, distances: [500, 1000],
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { ring: 1, name: 'A' } }] };
  const file = bufferDownload(output, { name: 'Schools buffer', notes: ['Measured on New Jersey State Plane (NAD83).'] });
  assert.deepEqual(file.features[0].properties, { ring: 1, name: 'A', distance: 1000, unit: 'ft' });
  assert.equal(file.properties.name, 'Schools buffer');
});

// ---- The buffer step (geoprocess.js with JSTS) ----

test('curves are drawn with enough points for their distance', () => {
  assert.equal(quadrantSegments(30.48), 8);
  assert.ok(quadrantSegments(304.8) > 8 && quadrantSegments(304.8) < 32);
  assert.equal(quadrantSegments(5000), 32);
});

test('a 1,000 ft buffer is 1,000 ft on the ground: every vertex, within 0.03 ft', () => {
  const { features } = bufferFeatures(jsts, [point(PENNSVILLE, { name: 'X' })], { distances: [toMeters(1000, 'ft')] });
  assert.equal(features.length, 1);
  const ring = outer(features[0].geometry);
  assert.ok(ring.length > 32);
  for (const vertex of ring) {
    const feet = geodesic(PENNSVILLE, vertex) / 0.3048;
    assert.ok(Math.abs(feet - 1000) < 0.03, `vertex at ${feet} ft`); // coordinates are kept to 7 decimals (about 1 cm)
  }
  const meters = bufferFeatures(jsts, [point([-74.5, 38.95])], { distances: [250] }).features[0];
  for (const vertex of outer(meters.geometry)) assert.ok(Math.abs(geodesic([-74.5, 38.95], vertex) - 250) < 0.1);
});

test('kept apart: one shape per feature and distance, carrying the feature’s name', () => {
  const inputs = [point([-75.51, 39.648], { name: 'A', atlas_id: '1' }), point([-75.505, 39.648], { name: 'B', atlas_id: '2' }), point([-75.4, 39.7], { name: 'C', atlas_id: '3' })];
  let last = null;
  const { features, skipped } = bufferFeatures(jsts, inputs, { distances: [152.4, 304.8], onProgress: (done, total) => { last = [done, total]; } });
  assert.equal(skipped, 0);
  assert.equal(features.length, 6);
  assert.deepEqual(features.filter((f) => f.properties.ring === 1).map((f) => f.properties.name).sort(), ['A', 'B', 'C']);
  assert.deepEqual(last, [6, 6]);
});

test('dissolved: overlapping buffers merge; one shape per distance, with the count', () => {
  const near = [point([-75.51, 39.648]), point([-75.5095, 39.648])]; // about 140 ft apart
  const merged = bufferFeatures(jsts, near, { distances: [152.4], dissolve: true }).features;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].geometry.type, 'Polygon');
  assert.equal(merged[0].properties.count, 2);
  const apart = bufferFeatures(jsts, [...near, point([-75.4, 39.7])], { distances: [152.4, 15.24], dissolve: true }).features;
  assert.equal(apart.length, 2);
  assert.equal(apart[0].geometry.type, 'MultiPolygon');
  assert.equal(apart[0].geometry.coordinates.length, 2);
  assert.equal(apart[1].geometry.coordinates.length, 3); // at 50 ft the two near points no longer touch
});

test('dissolving in chunks gives the same area as dissolving all at once', () => {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const inputs = Array.from({ length: 300 }, () => point([-75.55 + random() * 0.1, 39.6 + random() * 0.08]));
  const chunked = bufferFeatures(jsts, inputs, { distances: [200], dissolve: true, chunk: 16 }).features[0];
  const whole = bufferFeatures(jsts, inputs, { distances: [200], dissolve: true, chunk: 1000 }).features[0];
  const [a, b] = [gridArea(chunked.geometry), gridArea(whole.geometry)];
  assert.ok(Math.abs(a - b) / b < 1e-6, `${a} vs ${b}`);
});

test('lines and areas buffer too; a damaged shape is skipped and counted', () => {
  const line = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-75.52, 39.64], [-75.50, 39.64]] }, properties: {} };
  const area = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-75.51, 39.65], [-75.505, 39.65], [-75.505, 39.653], [-75.51, 39.65]]] }, properties: {} };
  const broken = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-75.5, 39.6], [-75.49, 39.6], [-75.5, 39.6]]] }, properties: {} };
  const { features, skipped } = bufferFeatures(jsts, [line, area, broken], { distances: [100] });
  assert.equal(features.length, 2);
  assert.equal(skipped, 1);
  const length = geodesic([-75.52, 39.64], [-75.50, 39.64]);
  const expected = 2 * 100 * length + Math.PI * 100 * 100; // a round-capped line: a band plus two half circles
  const lineArea = gridArea(features.find((f) => f.geometry.coordinates[0].length > 20 && gridArea(f.geometry) > 300000).geometry);
  assert.ok(Math.abs(lineArea - expected) / expected < 0.002, `${lineArea} vs ${expected}`);
});
