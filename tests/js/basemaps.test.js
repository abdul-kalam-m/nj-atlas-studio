import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASEMAP_MODES, BASEMAP_NAMES, BASEMAP_STYLES, THEMES, basemapCredit, modeOperations, veilPaint } from '../../site/js/studio/basemaps.js';
import { validate } from '../../site/js/studio/mapdoc.js';
import { TEXT } from '../../site/js/studio/text.js';

const layers = [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill' },
  { id: 'hidden-by-style', type: 'line', layout: { visibility: 'none' } },
  { id: 'place-labels', type: 'symbol', paint: { 'text-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 1] } },
];

test('four basemaps, each with a name, colors for Studio’s mask and outline, and a credit', () => {
  assert.deepEqual(BASEMAP_NAMES, ['positron', 'liberty', 'dark', 'satellite']);
  for (const name of BASEMAP_NAMES) {
    assert.ok(THEMES[name], name);
    assert.equal(typeof TEXT.basemaps[name], 'string');
    assert.equal(typeof TEXT.basemaps.credits[basemapCredit(name, 'on')], 'string');
  }
  assert.equal(basemapCredit('satellite', 'off'), null); // nothing to credit when the basemap is off
  const satellite = BASEMAP_STYLES.satellite;
  for (const layer of satellite.layers.filter((l) => l.source)) assert.ok(satellite.sources[layer.source], layer.id);
  assert.match(satellite.sources.nj_orthos.tiles[0], /^https:\/\/maps\.nj\.gov\//);
  assert.deepEqual(BASEMAP_MODES, ['on', 'dim', 'off']);
});

test('Off hides every basemap layer; On brings back each one’s own visibility and label fading', () => {
  const saved = new Map();
  const off = modeOperations(layers, 'off', saved);
  assert.ok(off.every((op) => op.visibility === 'none'));
  // The map now reports the layers hidden; On still restores what the style had.
  const hidden = layers.map((layer) => ({ ...layer, layout: { visibility: 'none' } }));
  const on = modeOperations(hidden, 'on', saved);
  assert.deepEqual(on.map((op) => op.visibility), ['visible', 'visible', 'none', 'visible']);
  assert.deepEqual(on[3].paint['text-opacity'], layers[3].paint['text-opacity']);
  assert.equal(on[3].paint['icon-opacity'], 1);
});

test('Dim fades the labels and lays a veil in the basemap’s own background color', () => {
  const dim = modeOperations(layers, 'dim', new Map());
  assert.deepEqual(dim[3].paint, { 'text-opacity': 0.45, 'icon-opacity': 0.45 });
  assert.equal(dim[1].paint, undefined); // shapes are dimmed by the veil, not repainted
  assert.deepEqual(veilPaint('positron', 'on'), { visibility: 'none', color: '#ffffff', opacity: 0.6 });
  assert.deepEqual(veilPaint('dark', 'dim'), { visibility: 'visible', color: '#0c0c0c', opacity: 0.6 });
  assert.equal(veilPaint('satellite', 'off').opacity, 1); // Off: the plain page
});

test('map files keep the basemap and its mode; the old basemap "none" opens as Light, off', () => {
  const base = { schema_version: 2, layers: [], buffers: [], screenings: [] };
  assert.equal(validate({ ...base, basemap: 'dark', basemap_mode: 'dim' }).doc.basemap_mode, 'dim');
  const legacy = validate({ ...base, basemap: 'none' }).doc;
  assert.deepEqual([legacy.basemap, legacy.basemap_mode], ['positron', 'off']);
  const unknown = validate({ ...base, basemap: 'terrain', basemap_mode: 'half' }).doc;
  assert.deepEqual([unknown.basemap, unknown.basemap_mode], ['positron', 'on']);
});
