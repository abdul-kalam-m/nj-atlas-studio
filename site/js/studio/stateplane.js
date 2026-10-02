// New Jersey State Plane (NAD83, EPSG:32111 in meters; EPSG:3424 is the same grid in US survey feet): the
// coordinate system NJ's own GIS data uses. Buffers are made on this grid (D-075), with each distance corrected by
// the grid's scale where it is used, so a distance in feet or meters is a distance on the ground.
// Transverse Mercator by Krüger's series (as PROJ computes it), GRS80 ellipsoid. Pure: no imports.

const A_AXIS = 6378137;
const F = 1 / 298.257222101;
const LAT0 = (38 + 50 / 60) * (Math.PI / 180);
const LON0 = -74.5 * (Math.PI / 180);
const K0 = 0.9999;
const FALSE_EASTING = 150000;
const FALSE_NORTHING = 0;
export const FEET_PER_METER = 1 / 0.3048;

const N = F / (2 - F);
const E = Math.sqrt(F * (2 - F));
const RECTIFYING = (A_AXIS / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64 + N ** 6 / 256);
const ALPHA = [
  N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16 + (41 * N ** 4) / 180 - (127 * N ** 5) / 288 + (7891 * N ** 6) / 37800,
  (13 * N ** 2) / 48 - (3 * N ** 3) / 5 + (557 * N ** 4) / 1440 + (281 * N ** 5) / 630 - (1983433 * N ** 6) / 1935360,
  (61 * N ** 3) / 240 - (103 * N ** 4) / 140 + (15061 * N ** 5) / 26880 + (167603 * N ** 6) / 181440,
  (49561 * N ** 4) / 161280 - (179 * N ** 5) / 168 + (6601661 * N ** 6) / 7257600,
  (34729 * N ** 5) / 80640 - (3418889 * N ** 6) / 1995840,
  (212378941 * N ** 6) / 319334400,
];
const BETA = [
  N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96 - N ** 4 / 360 - (81 * N ** 5) / 512 + (96199 * N ** 6) / 604800,
  N ** 2 / 48 + N ** 3 / 15 - (437 * N ** 4) / 1440 + (46 * N ** 5) / 105 - (1118711 * N ** 6) / 3870720,
  (17 * N ** 3) / 480 - (37 * N ** 4) / 840 - (209 * N ** 5) / 4480 + (5569 * N ** 6) / 90720,
  (4397 * N ** 4) / 161280 - (11 * N ** 5) / 504 - (830251 * N ** 6) / 7257600,
  (4583 * N ** 5) / 161280 - (108847 * N ** 6) / 3991680,
  (20648693 * N ** 6) / 638668800,
];
// Conformal latitude back to geodetic latitude.
const DELTA = [
  2 * N - (2 * N ** 2) / 3 - 2 * N ** 3 + (116 * N ** 4) / 45,
  (7 * N ** 2) / 3 - (8 * N ** 3) / 5 - (227 * N ** 4) / 45,
  (56 * N ** 3) / 15 - (136 * N ** 4) / 35,
  (4279 * N ** 4) / 630,
];

function conformalTan(phi) {
  const s = Math.sin(phi);
  return Math.sinh(Math.atanh(s) - E * Math.atanh(E * s));
}

function xiOf(xiPrime, etaPrime) {
  let xi = xiPrime;
  let eta = etaPrime;
  for (let j = 1; j <= 6; j += 1) {
    xi += ALPHA[j - 1] * Math.sin(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    eta += ALPHA[j - 1] * Math.cos(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
  }
  return [xi, eta];
}

const XI0 = xiOf(Math.atan(conformalTan(LAT0)), 0)[0];

// [longitude, latitude] in degrees -> [easting, northing] in meters.
export function toGrid([lon, lat]) {
  const phi = lat * (Math.PI / 180);
  const dLambda = lon * (Math.PI / 180) - LON0;
  const t = conformalTan(phi);
  const xiPrime = Math.atan2(t, Math.cos(dLambda));
  const etaPrime = Math.atanh(Math.sin(dLambda) / Math.sqrt(1 + t * t));
  const [xi, eta] = xiOf(xiPrime, etaPrime);
  return [FALSE_EASTING + K0 * RECTIFYING * eta, FALSE_NORTHING + K0 * RECTIFYING * (xi - XI0)];
}

// [easting, northing] in meters -> [longitude, latitude] in degrees.
export function fromGrid([x, y]) {
  const xi = (y - FALSE_NORTHING) / (K0 * RECTIFYING) + XI0;
  const eta = (x - FALSE_EASTING) / (K0 * RECTIFYING);
  let xiPrime = xi;
  let etaPrime = eta;
  for (let j = 1; j <= 6; j += 1) {
    xiPrime -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaPrime -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
  let phi = chi;
  for (let j = 1; j <= 4; j += 1) phi += DELTA[j - 1] * Math.sin(2 * j * chi);
  const lambda = LON0 + Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));
  return [lambda * (180 / Math.PI), phi * (180 / Math.PI)];
}

// The grid's scale at a point: grid distance / ground distance (0.9999 on the central meridian, about 1.0000 at
// New Jersey's western edge). Buffers divide by it so their distances are ground distances.
export function scaleFactor([lon, lat]) {
  const e2 = F * (2 - F);
  const s2 = Math.sin(lat * (Math.PI / 180)) ** 2;
  const rho = (A_AXIS * (1 - e2)) / (1 - e2 * s2) ** 1.5;
  const nu = A_AXIS / Math.sqrt(1 - e2 * s2);
  const u = (toGrid([lon, lat])[0] - FALSE_EASTING) / K0;
  const r2 = rho * nu;
  return K0 * (1 + (u * u) / (2 * r2) + u ** 4 / (24 * r2 * r2));
}

// Every position of a GeoJSON geometry through `fn`, keeping the structure.
export function mapCoordinates(geometry, fn) {
  const walk = (value) => (typeof value[0] === 'number' ? fn(value) : value.map(walk));
  if (geometry.type === 'GeometryCollection') return { type: 'GeometryCollection', geometries: geometry.geometries.map((g) => mapCoordinates(g, fn)) };
  return { type: geometry.type, coordinates: walk(geometry.coordinates) };
}

export const projectGeometry = (geometry) => mapCoordinates(geometry, toGrid);

// Ground area in square meters of a polygon or multipolygon (D-088): the shoelace area on the grid, divided by the
// square of the grid's scale factor at the shape's first vertex (within 0.01% across New Jersey).
export function gridAreaSqM(geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  let area = 0;
  let first = null;
  for (const polygon of polygons) {
    polygon.forEach((ring, index) => {
      const points = ring.map(toGrid);
      first ??= ring[0];
      let twice = 0;
      for (let i = 0; i < points.length - 1; i += 1) twice += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
      area += (index === 0 ? 1 : -1) * Math.abs(twice) / 2;
    });
  }
  return first ? area / scaleFactor(first) ** 2 : 0;
}
export const unprojectGeometry = (geometry, decimals = 7) => {
  const scale = 10 ** decimals;
  return mapCoordinates(geometry, (p) => fromGrid(p).map((v) => Math.round(v * scale) / scale));
};
