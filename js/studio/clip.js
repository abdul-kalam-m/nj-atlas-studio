// Cut exported features at the area's edge (clip_mode 'cut', IMPLEMENTATION_GUIDE.md §4.8). Lines are cut here;
// polygons use @turf/intersect, passed in so this module stays pure and testable. Points are kept or dropped.
import { pointInPolygon } from './geo.js';

function polygonRings(area) {
  if (area.type === 'Polygon') return area.coordinates;
  if (area.type === 'MultiPolygon') return area.coordinates.flat();
  return [];
}

// Parameter t (0..1) where segment a->b crosses segment c->d, or null.
function crossing(a, b, c, d) {
  const rx = b[0] - a[0]; const ry = b[1] - a[1];
  const sx = d[0] - c[0]; const sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;
  if (denominator === 0) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominator;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominator;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
const round = (p) => p.map((v) => Math.round(v * 1e9) / 1e9);

// A line's coordinates -> the pieces inside the area (holes excluded), each a list of coordinates.
export function clipLine(coords, area) {
  const rings = polygonRings(area);
  const pieces = [];
  let current = null;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const a = coords[i]; const b = coords[i + 1];
    const cuts = [0, 1];
    for (const ring of rings) {
      for (let j = 0; j < ring.length - 1; j += 1) {
        const t = crossing(a, b, ring[j], ring[j + 1]);
        if (t !== null) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    for (let k = 0; k < cuts.length - 1; k += 1) {
      if (cuts[k + 1] - cuts[k] < 1e-12) continue;
      const start = round(lerp(a, b, cuts[k]));
      const end = round(lerp(a, b, cuts[k + 1]));
      const inside = pointInPolygon(lerp(a, b, (cuts[k] + cuts[k + 1]) / 2), area);
      if (!inside) {
        current = null;
        continue;
      }
      if (current && same(current[current.length - 1], start)) current.push(end);
      else {
        current = [start, end];
        pieces.push(current);
      }
    }
  }
  return pieces;
}

// One GeoJSON feature cut to the area; null when nothing of it is inside. `intersect(polygonA, polygonB)` is
// @turf/intersect's function (features in, feature or null out).
export function clipFeature(feature, area, intersect) {
  const geometry = feature.geometry;
  if (!geometry) return null;
  if (geometry.type === 'Point') return pointInPolygon(geometry.coordinates, area) ? feature : null;
  if (geometry.type === 'MultiPoint') {
    const kept = geometry.coordinates.filter((point) => pointInPolygon(point, area));
    return kept.length ? { ...feature, geometry: { type: 'MultiPoint', coordinates: kept } } : null;
  }
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    const pieces = lines.flatMap((line) => clipLine(line, area));
    if (!pieces.length) return null;
    return { ...feature, geometry: pieces.length === 1 ? { type: 'LineString', coordinates: pieces[0] } : { type: 'MultiLineString', coordinates: pieces } };
  }
  const cut = intersect({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: {}, geometry }, { type: 'Feature', properties: {}, geometry: area }] });
  return cut ? { ...feature, geometry: cut.geometry } : null;
}

// ---- Live requests cut to the area (D-082) ----

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum / 2);
}

// A ring cut to an axis-aligned box [west, south, east, north] (Sutherland-Hodgman). Where the ring leaves the
// box and comes back, the result runs along the box's edge; that adds no area, only the edge itself.
export function clipRingToBox(ring, [west, south, east, north]) {
  const sides = [
    [(p) => p[0] >= west, (a, b) => [west, a[1] + ((west - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]],
    [(p) => p[0] <= east, (a, b) => [east, a[1] + ((east - a[0]) / (b[0] - a[0])) * (b[1] - a[1])]],
    [(p) => p[1] >= south, (a, b) => [a[0] + ((south - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), south]],
    [(p) => p[1] <= north, (a, b) => [a[0] + ((north - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), north]],
  ];
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  let points = closed ? ring.slice(0, -1) : ring;
  for (const [inside, cut] of sides) {
    const input = points;
    points = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      if (inside(current)) {
        if (!inside(previous)) points.push(cut(previous, current));
        points.push(current);
      } else if (inside(previous)) points.push(cut(previous, current));
    }
    if (!points.length) return [];
  }
  return [...points, points[0]];
}

// How a map tile's box meets the area: { relation: 'outside' } (no request needed), { relation: 'inside' } (ask
// for the box), or { relation: 'partial', geometry } (ask for the part of the area inside the box).
export function clipAreaToBox(area, box) {
  const polygons = [];
  let covered = 0;
  const shapes = area.type === 'Polygon' ? [area.coordinates] : area.type === 'MultiPolygon' ? area.coordinates : [];
  for (const [outer, ...holes] of shapes) {
    const cut = clipRingToBox(outer, box);
    const cutArea = cut.length >= 4 ? ringArea(cut) : 0;
    if (!cutArea) continue;
    const cutHoles = holes.map((hole) => clipRingToBox(hole, box)).filter((hole) => hole.length >= 4 && ringArea(hole) > 0);
    polygons.push([cut, ...cutHoles]);
    covered += cutArea - cutHoles.reduce((sum, hole) => sum + ringArea(hole), 0);
  }
  if (!polygons.length || covered <= 0) return { relation: 'outside' };
  const boxArea = (box[2] - box[0]) * (box[3] - box[1]);
  if (covered >= boxArea * (1 - 1e-9)) return { relation: 'inside' };
  return { relation: 'partial',
    geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons } };
}
