import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bboxOf, lngLatToTile, pointInPolygon, roundGeometry, scaleBar, tileBounds, tilesInBounds, toEsri, worldMinus }
  from '../../site/js/studio/geo.js';
import { clipLine } from '../../site/js/studio/clip.js';

const square = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]] };

test('tiles: a point falls in the tile whose bounds contain it', () => {
  const [x, y] = lngLatToTile(-75.51, 39.65, 15);
  const [w, s, e, n] = tileBounds(x, y, 15);
  assert.ok(w <= -75.51 && -75.51 <= e && s <= 39.65 && 39.65 <= n);
  assert.equal(tilesInBounds([w, s, e, n], 15).length >= 1, true);
  assert.equal(tilesInBounds([-76, 38, -73, 42], 15, 256), null);
});

test('Esri polygons: outer rings clockwise, holes counter-clockwise', () => {
  const { geometryType, geometry } = toEsri(square);
  assert.equal(geometryType, 'esriGeometryPolygon');
  const [outer, hole] = geometry.rings;
  assert.deepEqual(outer[1], [0, 1]); // (0,0) -> (0,1): clockwise
  assert.deepEqual(hole[1], [0.6, 0.4]); // hole kept counter-clockwise
  assert.deepEqual(toEsri({ type: 'Point', coordinates: [1, 2] }).geometry, { x: 1, y: 2, spatialReference: { wkid: 4326 } });
  assert.equal(toEsri({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }).geometryType, 'esriGeometryPolyline');
});

test('point in polygon respects holes', () => {
  assert.equal(pointInPolygon([0.2, 0.2], square), true);
  assert.equal(pointInPolygon([0.5, 0.5], square), false);
  assert.equal(pointInPolygon([2, 2], square), false);
});

test('the mask is the world with the area as a hole', () => {
  const mask = worldMinus(square);
  assert.equal(mask.geometry.coordinates.length, 2);
  assert.deepEqual(bboxOf(square), [0, 0, 1, 1]);
});

test('scale bar: round feet near a town, miles farther out', () => {
  const near = scaleBar(0.5, 120); // 0.5 m per pixel: 196 ft fits
  assert.equal(near.unit, 'ft');
  assert.equal(near.value, 100);
  const far = scaleBar(50, 120); // 6,000 m: 3.7 miles fit
  assert.equal(far.unit, 'mi');
  assert.equal(far.value, 2);
  assert.ok(far.px <= 120);
});

test('coordinates round to 6 decimals', () => {
  assert.deepEqual(roundGeometry({ type: 'Point', coordinates: [-75.123456789, 39.987654321] }).coordinates, [-75.123457, 39.987654]);
});

test('lines are cut at the area edge, and holes cut them too', () => {
  const pieces = clipLine([[-1, 0.5], [2, 0.5]], square);
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces[0][0], [0, 0.5]);
  assert.deepEqual(pieces[0].at(-1), [0.4, 0.5]);
  assert.deepEqual(pieces[1][0], [0.6, 0.5]);
  assert.deepEqual(pieces[1].at(-1), [1, 0.5]);
  assert.deepEqual(clipLine([[5, 5], [6, 6]], square), []);
  assert.deepEqual(clipLine([[0.1, 0.1], [0.2, 0.1], [0.3, 0.2]], square), [[[0.1, 0.1], [0.2, 0.1], [0.3, 0.2]]]);
});
