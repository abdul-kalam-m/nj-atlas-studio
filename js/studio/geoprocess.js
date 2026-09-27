// The buffer step itself (D-075): shapes go onto New Jersey State Plane, JSTS buffers them there by the ground
// distance times the grid's scale at the shape, and the result comes back to longitude and latitude. Pure: the
// JSTS build is passed in (the page loads it from jsDelivr, the tests from node_modules), so this runs in the
// buffer worker, on the page, and in Node.
import { projectGeometry, scaleFactor, unprojectGeometry } from './stateplane.js';

// Points per quarter circle: enough that a curve's edge stays within 0.3 m (1 ft) of the true distance, from
// 8 (short distances) to 32 (about 1 km and more, where the gap is under 0.03% of the distance).
export function quadrantSegments(meters) {
  const needed = Math.ceil(Math.PI / (4 * Math.acos(Math.max(-1, 1 - 0.3 / meters))));
  return Math.min(32, Math.max(8, needed));
}

// Z-order of a grid position, so nearby shapes land in the same chunk.
function zOrder(x, y) {
  let key = 0;
  for (let bit = 0; bit < 16; bit += 1) key += (((x >> bit) & 1) * 2 ** (2 * bit)) + (((y >> bit) & 1) * 2 ** (2 * bit + 1));
  return key;
}

function anchor(geometry) {
  let position = geometry.coordinates;
  while (Array.isArray(position[0])) [position] = position;
  return position;
}

// Shapes in z-order of their first position on a 100 m grid.
function spatialOrder(items) {
  const keyed = items.map((item) => {
    const [x, y] = anchor(item.grid);
    return { item, key: zOrder(Math.max(0, Math.floor(x / 100)), Math.max(0, Math.floor(y / 100))) };
  });
  return keyed.sort((a, b) => a.key - b.key).map((entry) => entry.item);
}

// One buffer per input, each on its own. Inputs JSTS cannot buffer (a broken shape) are counted, not fatal.
function separate(jsts, reader, writer, items, meters, ring, onStep) {
  const q = quadrantSegments(meters);
  const out = [];
  let skipped = 0;
  for (const item of items) {
    try {
      const result = writer.write(jsts.BufferOp.bufferOp(reader.read(item.grid), meters * item.scale, q));
      if (result.coordinates?.length) out.push({ type: 'Feature', properties: { ...item.properties, ring }, geometry: unprojectGeometry(result, 7) });
    } catch {
      skipped += 1;
    }
    onStep();
  }
  return { features: out, skipped };
}

// All buffers merged into one shape (dissolve). Buffering a whole collection at once merges its parts, but many
// overlapping parts make that slow and memory-hungry, so nearby inputs are buffered in chunks and the chunks
// merged four at a time (a buffer of 0 around a collection merges it).
function dissolved(jsts, reader, writer, items, meters, ring, onStep, chunk) {
  const q = quadrantSegments(meters);
  let skipped = 0;
  let parts = [];
  for (let i = 0; i < items.length; i += chunk) {
    const group = items.slice(i, i + chunk);
    // Neighbors in a chunk share the grid's scale to within a few parts in ten million.
    const scale = group.reduce((sum, item) => sum + item.scale, 0) / group.length;
    try {
      parts.push(jsts.BufferOp.bufferOp(reader.read({ type: 'GeometryCollection', geometries: group.map((item) => item.grid) }), meters * scale, q));
    } catch {
      for (const item of group) {
        try { parts.push(jsts.BufferOp.bufferOp(reader.read(item.grid), meters * item.scale, q)); } catch { skipped += 1; }
      }
    }
    onStep(group.length);
  }
  while (parts.length > 1) {
    const next = [];
    for (let i = 0; i < parts.length; i += 4) {
      const group = parts.slice(i, i + 4);
      next.push(group.length === 1 ? group[0] : jsts.BufferOp.bufferOp(group[0].getFactory().createGeometryCollection(group), 0, q));
    }
    parts = next;
  }
  if (!parts.length) return { features: [], skipped };
  const result = writer.write(parts[0]);
  if (!result.coordinates?.length) return { features: [], skipped };
  return { features: [{ type: 'Feature', properties: { ring, count: items.length - skipped }, geometry: unprojectGeometry(result, 7) }], skipped };
}

// features: [{ geometry (longitude/latitude), properties }]; distances: meters, one per ring.
// Returns { features (every ring's, each with properties.ring), skipped }.
export function bufferFeatures(jsts, features, { distances, dissolve = false, onProgress = () => {}, chunk = 64 }) {
  const reader = new jsts.GeoJSONReader();
  const writer = new jsts.GeoJSONWriter();
  const items = spatialOrder(features.filter((feature) => feature.geometry?.coordinates?.length)
    .map((feature) => ({ grid: projectGeometry(feature.geometry), scale: scaleFactor(anchor(feature.geometry)), properties: feature.properties ?? {} })));
  const total = items.length * distances.length;
  let done = 0;
  let last = 0;
  const onStep = (n = 1) => {
    done += n;
    const now = Date.now();
    if (now - last > 100 || done === total) { last = now; onProgress(done, total); }
  };
  const out = [];
  let skipped = 0;
  distances.forEach((meters, ring) => {
    // Heavily overlapping buffers merge faster in smaller chunks.
    const size = meters > 1000 ? Math.min(chunk, 16) : chunk;
    const result = dissolve ? dissolved(jsts, reader, writer, items, meters, ring, onStep, size) : separate(jsts, reader, writer, items, meters, ring, onStep);
    out.push(...result.features);
    skipped = Math.max(skipped, result.skipped);
  });
  return { features: out, skipped };
}
