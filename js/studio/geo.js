// Small geometry helpers: web-mercator tiles, Esri JSON, point-in-polygon, the area mask, the scale bar.
// Pure: no imports, no browser APIs. Coordinates are [longitude, latitude] (EPSG:4326).

export const FEET_PER_METER = 3.280839895;
export const FEET_PER_MILE = 5280;
const EARTH_CIRCUMFERENCE_M = 40075016.686;

export function feetToMeters(feet) {
  return feet / FEET_PER_METER;
}

export function lngLatToTile(lng, lat, z) {
  const n = 2 ** z;
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

// [west, south, east, north] of tile z/x/y.
export function tileBounds(x, y, z) {
  const n = 2 ** z;
  const lng = (tx) => (tx / n) * 360 - 180;
  const lat = (ty) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return [lng(x), lat(y + 1), lng(x + 1), lat(y)];
}

// Tiles covering [west, south, east, north] at zoom z, as [x, y] pairs; null when there would be more than `limit`.
export function tilesInBounds(bounds, z, limit = 256) {
  const [x0, y0] = lngLatToTile(bounds[0], bounds[3], z);
  const [x1, y1] = lngLatToTile(bounds[2], bounds[1], z);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > limit) return null;
  const tiles = [];
  for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) tiles.push([x, y]);
  return tiles;
}

export function metersPerPixel(lat, zoom) {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

// About one screen pixel in degrees at this zoom: the generalization a live request may use.
export function pixelDegrees(zoom) {
  return 360 / (512 * 2 ** zoom);
}

function signedArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]); // edge j -> i
  }
  return sum / 2; // positive: clockwise (in x-right, y-up coordinates)
}

function oriented(ring, clockwise) {
  return (signedArea(ring) > 0) === clockwise ? ring : [...ring].reverse();
}

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

// GeoJSON geometry -> Esri JSON geometry and its geometryType. Esri outer rings run clockwise, holes counter-clockwise.
export function toEsri(geometry) {
  const spatialReference = { wkid: 4326 };
  switch (geometry.type) {
    case 'Point':
      return { geometryType: 'esriGeometryPoint', geometry: { x: geometry.coordinates[0], y: geometry.coordinates[1], spatialReference } };
    case 'MultiPoint':
      return { geometryType: 'esriGeometryMultipoint', geometry: { points: geometry.coordinates, spatialReference } };
    case 'LineString':
      return { geometryType: 'esriGeometryPolyline', geometry: { paths: [geometry.coordinates], spatialReference } };
    case 'MultiLineString':
      return { geometryType: 'esriGeometryPolyline', geometry: { paths: geometry.coordinates, spatialReference } };
    case 'Polygon':
    case 'MultiPolygon': {
      const rings = [];
      for (const polygon of polygonsOf(geometry)) {
        polygon.forEach((ring, index) => rings.push(oriented(ring, index === 0)));
      }
      return { geometryType: 'esriGeometryPolygon', geometry: { rings, spatialReference } };
    }
    default:
      throw new Error(`Unsupported geometry ${geometry.type}`);
  }
}

export function bboxOf(geometry) {
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      west = Math.min(west, coords[0]); east = Math.max(east, coords[0]);
      south = Math.min(south, coords[1]); north = Math.max(north, coords[1]);
    } else coords.forEach(visit);
  };
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach((g) => visit(g.coordinates));
  else visit(geometry.coordinates);
  return [west, south, east, north];
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Inside a Polygon or MultiPolygon geometry (holes excluded).
export function pointInPolygon(point, geometry) {
  return polygonsOf(geometry).some(([outer, ...holes]) => pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)));
}

// The world with the area cut out, so everything outside the area can be dimmed.
export function worldMinus(geometry) {
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const holes = polygonsOf(geometry).map((polygon) => polygon[0]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...holes] } };
}

const NICE = [1, 2, 5];

// The longest round distance that fits in maxPx: { label, px }. Feet below half a mile, then miles.
export function scaleBar(metersPerPx, maxPx = 120) {
  const maxFeet = maxPx * metersPerPx * FEET_PER_METER;
  const useMiles = maxFeet >= FEET_PER_MILE / 2;
  const unit = useMiles ? FEET_PER_MILE : 1;
  const max = maxFeet / unit;
  let best = null;
  for (let power = -2; power <= 5; power += 1) {
    for (const step of NICE) {
      const value = step * 10 ** power;
      if (value <= max) best = value;
    }
  }
  best = best ?? max;
  const px = (best * unit) / FEET_PER_METER / metersPerPx;
  const rounded = Number(best.toPrecision(3));
  return { value: rounded, unit: useMiles ? 'mi' : 'ft', px };
}

// Round coordinates to 6 decimals (about 10 cm) for map documents and links.
export function roundGeometry(geometry, digits = 6) {
  const factor = 10 ** digits;
  const round = (coords) => (typeof coords[0] === 'number'
    ? coords.map((v) => Math.round(v * factor) / factor) : coords.map(round));
  return { type: geometry.type, coordinates: round(geometry.coordinates) };
}
