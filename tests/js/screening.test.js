import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { combinedRows, notesOf, resultNotes, resultsCsv, resultsGeojson } from '../../site/js/studio/screening.js';
import { LiveLayer } from '../../site/js/studio/tiles.js';

const recipe = (id) => JSON.parse(readFileSync(new URL(`../../catalog/layers/${id}.json`, import.meta.url), 'utf8'));
const parcels = recipe('nj_parcels');
const wetlands = recipe('nj_wetlands');
const PARCEL_LINE = 'Parcel data can lag the municipal tax list. This is not a certified list of property owners.';

const feature = (props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-75.5, 39.6] }, properties: props });
const results = {
  site: { type: 'Point', coordinates: [-75.5, 39.6] },
  ring: { geometry: { type: 'Polygon', coordinates: [[[-75.6, 39.5], [-75.4, 39.5], [-75.4, 39.7], [-75.6, 39.5]]] } },
  targets: [
    { id: 'nj_parcels', entry: parcels, count: 2, features: [
      feature({ layer: 'nj_parcels', atlas_id: '7', address: '12 CHURCHLANDING RD', property_class: 'Residential (up to 4 families)', block: '301', lot: '19', qualifier: null }),
      feature({ layer: 'nj_parcels', atlas_id: '8', address: '14 CHURCHLANDING RD', property_class: 'Vacant land', block: '301', lot: '20', qualifier: null })] },
    { id: 'nj_wetlands', entry: wetlands, count: 1, features: [feature({ layer: 'nj_wetlands', atlas_id: '99', wetland_type: 'Deciduous Wooded Wetlands', acres: 2.5 })] },
  ],
};
const buffer = { id: 'b1', distance_ft: 300, source: { kind: 'feature', layer: 'nj_parcels', atlas_id: '7', geometry: results.site } };
const context = { label: 'Screening, not a regulatory determination.', siteLine: 'Site: 12 CHURCHLANDING RD; 300 ft', credits: ['NJOGIS'],
  headers: { layer: 'Layer', name: 'Name', type: 'Type', id: 'ID', site: 'Site', details: 'Details' } };

test('the parcel line travels with parcels, in lists, exports and prints (D-041, D-073)', () => {
  assert.deepEqual(notesOf(parcels, 'list'), [PARCEL_LINE]);
  assert.deepEqual(notesOf(parcels, 'export'), [PARCEL_LINE]);
  assert.deepEqual(notesOf(wetlands, 'list'), []);
  assert.deepEqual(resultNotes(results), [PARCEL_LINE]);
  assert.deepEqual(resultNotes({ targets: [{ ...results.targets[0], features: [] }] }), []); // no parcels, no line
});

test('the combined list marks the site and fills Type from the first list field', () => {
  const rows = combinedRows(results, buffer);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { layer: 'Property parcels', name: '12 CHURCHLANDING RD', type: 'Residential (up to 4 families)', id: '7', site: 'Site',
    details: 'Block: 301; Lot: 19' }); // empty fields are left out
  assert.equal(rows[1].site, '');
  assert.equal(rows[2].type, 2.5);
});

test('the CSV starts with the screening label, then the parcel line', () => {
  const lines = resultsCsv(results, buffer, context).replace(/^﻿/, '').split('\r\n');
  assert.equal(lines[0], '"Screening, not a regulatory determination."'); // quoted: it holds a comma
  assert.equal(lines[1], PARCEL_LINE);
  assert.equal(lines[4], 'Layer,Name,Type,ID,Site,Details');
  const geojson = resultsGeojson(results, buffer, context);
  assert.deepEqual(geojson.properties.notes, [PARCEL_LINE]);
  assert.equal(geojson.features.length, 2 + 3);
});

test('points load whole up to 15,000 in the area, at any zoom; areas still load by tile above 2,000 (D-081)', async () => {
  const calls = { all: 0, tile: 0 };
  const point = (i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-74.5, 40] }, properties: { OBJECTID: i } });
  const client = {
    allFeatures: async (url, options, cap) => { calls.all += 1; return { features: Array.from({ length: Math.min(12000, cap) }, (_, i) => point(i)) }; },
    features: async () => { calls.tile += 1; return { features: [], exceeded: false }; },
  };
  const schools = recipe('nj_schools');
  let drawn = 0;
  const layer = new LiveLayer({ client, entry: schools, outFields: ['OBJECTID'], onData: (data) => { drawn = data.features.length; }, onStatus: () => {} });
  layer.setQuery({ where: '1=1', geometry: null, total: 12000 });
  await layer.update([-75.6, 38.9, -73.9, 41.4], 5);
  await layer.update([-74.1, 40.6, -74.0, 40.7], 16); // zooming in reuses the points
  assert.deepEqual([drawn, calls.all, calls.tile], [12000, 1, 0]);
  const areas = new LiveLayer({ client, entry: { ...parcels, min_zoom: 15 }, outFields: ['OBJECTID'], onData: () => {}, onStatus: () => {} });
  areas.setQuery({ where: '1=1', geometry: null, total: 12000 });
  await areas.update([-74.01, 40.70, -74.00, 40.71], 16);
  assert.equal(calls.all, 1); // not whole
  assert.ok(calls.tile > 0);
});

test('with an outline area, tiles outside it make no request and tiles on its edge ask for the part inside (D-082)', async () => {
  const asked = [];
  const client = { features: async (url, options) => { asked.push(options.geometry); return { features: [], exceeded: false }; } };
  const layer = new LiveLayer({ client, entry: { ...parcels, min_zoom: 12 }, outFields: ['OBJECTID'], onData: () => {}, onStatus: () => {} });
  // An area covering the western part of a zoom-12 view (tiles there are about 0.09 degrees wide)
  const area = { type: 'Polygon', coordinates: [[[-74.3, 40.5], [-74.02, 40.5], [-74.02, 40.9], [-74.3, 40.9], [-74.3, 40.5]]] };
  layer.setQuery({ where: '1=1', geometry: area, total: 99999 });
  await layer.update([-74.25, 40.55, -73.9, 40.85], 12);
  const [boxes, cut] = [asked.filter(Array.isArray), asked.filter((g) => !Array.isArray(g))];
  assert.ok(boxes.length > 0 && cut.length > 0, `${boxes.length} boxes, ${cut.length} cut`);
  assert.ok(cut.every((g) => g.type === 'Polygon'));
  // every tile asked for touches the area; none lies wholly east of it
  assert.ok(boxes.every((b) => b[0] < -74.02));
  const before = asked.length;
  layer.setQuery({ where: '1=1', geometry: null, total: 99999 }); // no outline (the whole state): boxes only, and more of them
  await layer.update([-74.25, 40.55, -73.9, 40.85], 12);
  assert.ok(asked.length - before > before, `${asked.length - before} vs ${before}`);
});

test('a tile that stays full after three splits is drawn as it came and marked dense (D-053)', async () => {
  let requests = 0;
  const client = { features: async () => { requests += 1; return { features: [], exceeded: true }; } };
  const layer = new LiveLayer({ client, entry: { ...parcels, min_zoom: 15 }, outFields: ['OBJECTID'], onData: () => {}, onStatus: () => {} });
  layer.query = { where: '1=1', geometry: null, total: 99999 };
  const tile = await layer.loadTile(9000, 12000, 15);
  assert.equal(tile.dense, true);
  assert.equal(requests, 1 + 4 + 16 + 64);
});

test('a partial-coverage layer says so everywhere, and in a list even when it finds nothing (D-085)', () => {
  const ms4 = recipe('nj_ms4_inlets');
  const line = `Stormwater inlets (MS4), partial coverage: ${ms4.coverage.note}`;
  assert.deepEqual(notesOf(ms4, 'list'), [line]);
  assert.deepEqual(notesOf(ms4, 'print'), [line]);
  const empty = { ...results, targets: [...results.targets, { id: ms4.id, entry: ms4, count: 0, features: [] }] };
  assert.deepEqual(resultNotes(empty), [line, PARCEL_LINE]);
  assert.deepEqual(resultNotes(results), [PARCEL_LINE]);
});
