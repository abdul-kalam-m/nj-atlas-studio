import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromGrid, gridAreaSqM, scaleFactor, toGrid } from '../../site/js/studio/stateplane.js';
import { geodesic } from './geodesic.mjs';

// EPSG:4326 -> EPSG:32111 by PROJ 9.5.1 (pyproj 3.7.2), always_xy.
const PROJ = {
  pennsville: [-75.51, 39.648, 63318.8056, 90922.8284],
  high_point: [-74.6618, 41.3209, 136454.5177, 276194.8239],
  cape_may: [-74.906, 38.9351, 114801.0308, 11374.6948],
  trenton: [-74.7597, 40.2206, 127896.9423, 154039.0128],
  sandy_hook: [-74.002, 40.46, 192235.2701, 180706.3761],
  origin: [-74.5, 38.8333333333333, 150000, 0],
};

test('the grid matches PROJ for NJ State Plane (EPSG:32111) to within a millimeter', () => {
  for (const [name, [lon, lat, x, y]] of Object.entries(PROJ)) {
    const [gx, gy] = toGrid([lon, lat]);
    assert.ok(Math.abs(gx - x) < 0.001 && Math.abs(gy - y) < 0.001, `${name}: ${gx}, ${gy}`);
    const [blon, blat] = fromGrid([x, y]);
    assert.ok(Math.abs(blon - lon) < 1e-8 && Math.abs(blat - lat) < 1e-8, `${name} back: ${blon}, ${blat}`);
  }
});

test('corrected by the grid scale, 1,000 ft on the grid is 1,000 ft on the ground to 1 part in a million', () => {
  for (const [name, [lon, lat]] of Object.entries(PROJ)) {
    const [x, y] = toGrid([lon, lat]);
    const k = scaleFactor([lon, lat]);
    assert.ok(k >= 0.9999 - 1e-9 && k < 1.0001, `${name}: scale ${k}`);
    for (let step = 0; step < 8; step += 1) {
      const angle = (step * Math.PI) / 4;
      const raw = geodesic([lon, lat], fromGrid([x + 304.8 * Math.cos(angle), y + 304.8 * Math.sin(angle)]));
      assert.ok(Math.abs(raw - 304.8) / 304.8 < 1.01e-4, `${name} ${step}: uncorrected ${raw}`); // the grid alone: 1 in 10,000
      const ground = geodesic([lon, lat], fromGrid([x + 304.8 * k * Math.cos(angle), y + 304.8 * k * Math.sin(angle)]));
      assert.ok(Math.abs(ground - 304.8) / 304.8 < 1e-6, `${name} ${step}: ${ground}`);
    }
  }
});

test('ground area of a small square matches its geodesic sides, and holes are subtracted (D-088)', () => {
  const [w, s, e, n] = [-75.512, 39.647, -75.51, 39.649];
  const square = { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
  const mid = (s + n) / 2;
  const expected = geodesic([w, mid], [e, mid]) * geodesic([w, s], [w, n]);
  assert.ok(Math.abs(gridAreaSqM(square) / expected - 1) < 0.0005, `${gridAreaSqM(square)} vs ${expected}`);
  const [cw, cs, ce, cn] = [-75.5115, 39.6475, -75.5105, 39.6485];
  const holed = { type: 'Polygon', coordinates: [...square.coordinates, [[cw, cs], [cw, cn], [ce, cn], [ce, cs], [cw, cs]]] };
  assert.ok(Math.abs(gridAreaSqM(holed) / (expected * 0.75) - 1) < 0.001);
  assert.equal(gridAreaSqM({ type: 'MultiPolygon', coordinates: [square.coordinates, square.coordinates] }), 2 * gridAreaSqM(square));
  assert.equal(gridAreaSqM({ type: 'Point', coordinates: [w, s] }), 0);
  assert.equal(gridAreaSqM(null), 0);
});
