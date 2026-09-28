import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bboxOf, lngLatToTile, pointInPolygon, roundGeometry, scaleBar, tileBounds, tilesInBounds, toEsri, worldMinus }
  from '../../site/js/studio/geo.js';
import { clipAreaToBox, clipLine } from '../../site/js/studio/clip.js';

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

test('the mask is the world with the area as a hole, and the area\'s own holes masked too (D-082)', () => {
  const mask = worldMinus(square); // the square has a hole: a town inside the township
  assert.equal(mask.geometry.type, 'MultiPolygon');
  assert.deepEqual(mask.geometry.coordinates[0][1], square.coordinates[0]);
  assert.deepEqual(mask.geometry.coordinates[1], [square.coordinates[1]]);
  const plain = worldMinus({ type: 'Polygon', coordinates: [square.coordinates[0]] });
  assert.equal(plain.geometry.type, 'Polygon');
  assert.equal(plain.geometry.coordinates.length, 2);
  assert.deepEqual(bboxOf(square), [0, 0, 1, 1]);
});

// A U-shaped area: the notch (0.3-0.7 wide, from 0.3 up) is outside it.
const u = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0.7, 1], [0.7, 0.3], [0.3, 0.3], [0.3, 1], [0, 1], [0, 0]]] };
const areaOf = (geometry) => {
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return rings.reduce((total, [outer, ...holes]) => {
    const ring = (r) => Math.abs(r.slice(0, -1).reduce((s, p, i) => s + p[0] * r[i + 1][1] - r[i + 1][0] * p[1], 0) / 2);
    return total + ring(outer) - holes.reduce((s, h) => s + ring(h), 0);
  }, 0);
};

test('a tile outside the area is never asked for; one inside asks for its box; one on the edge for the part inside', () => {
  assert.deepEqual(clipAreaToBox(u, [2, 2, 3, 3]), { relation: 'outside' });
  assert.deepEqual(clipAreaToBox(u, [0.4, 0.5, 0.6, 0.9]), { relation: 'outside' }); // inside the notch
  assert.deepEqual(clipAreaToBox(u, [0.05, 0.05, 0.25, 0.25]), { relation: 'inside' });
  const edge = clipAreaToBox(u, [0.2, 0.2, 0.8, 0.8]);
  assert.equal(edge.relation, 'partial');
  // 0.6 x 0.6 box less the notch's 0.4 x 0.5 part: 0.36 - 0.2
  assert.ok(Math.abs(areaOf(edge.geometry) - 0.16) < 1e-12, String(areaOf(edge.geometry)));
  // The square's hole: a box inside it is outside the area; a box across its edge is partial.
  assert.deepEqual(clipAreaToBox(square, [0.45, 0.45, 0.55, 0.55]), { relation: 'outside' });
  const across = clipAreaToBox(square, [0.3, 0.3, 0.5, 0.5]);
  assert.ok(Math.abs(areaOf(across.geometry) - (0.04 - 0.01)) < 1e-12);
  const islands = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]]] };
  assert.equal(clipAreaToBox(islands, [0.5, 0.2, 2.5, 0.8]).geometry.type, 'MultiPolygon');
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
