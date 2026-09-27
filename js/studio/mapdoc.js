// The map document: one JSON object for the screen, the link, the .map.json file and the print (D-034,
// IMPLEMENTATION_GUIDE.md §4.2; the schema is documented in catalog/mapdoc.schema.json).
// Pure: no imports. Problems are codes with details; site/js/studio/text.js turns them into words.

export const SCHEMA_VERSION = 1;
export const MAX_LAYERS = 8;
export const MAX_BUFFERS = 4;
export const MIN_DISTANCE_FT = 1;
export const MAX_DISTANCE_FT = 5280;
export const BUFFER_PRESETS_FT = [50, 100, 200, 300, 500, 1000];
export const LEVELS = ['state', 'county', 'municipality', 'tract', 'block_group'];
const PLACE_PATTERNS = { county_fips: /^\d{3}$/, mun_code: /^\d{4}$/, tract_geoid: /^34\d{9}$/, bg_geoid: /^34\d{10}$/ };
export const LEVEL_KEY = { county: 'county_fips', municipality: 'mun_code', tract: 'tract_geoid', block_group: 'bg_geoid' };
const PAPERS = ['letter', 'tabloid'];
const ORIENTATIONS = ['landscape', 'portrait'];
const KNOWN_KEYS = ['schema_version', 'title', 'subtitle', 'created_at', 'area', 'mask', 'basemap', 'view', 'layers', 'buffers',
  'layout', 'credits', 'source_versions', 'extensions'];
const OPS = ['in', 'contains', 'range'];

export function emptyArea() {
  return { level: 'county', county_fips: null, mun_code: null, tract_geoid: null, bg_geoid: null };
}

export function createDoc(now = new Date()) {
  return {
    schema_version: SCHEMA_VERSION,
    title: '',
    subtitle: '',
    created_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    area: emptyArea(),
    mask: true,
    basemap: 'positron',
    view: null,
    layers: [],
    buffers: [],
    layout: { paper: 'letter', orientation: 'landscape', legend: true, scale_bar: true, north_arrow: true, notes: '' },
    credits: [],
    source_versions: {},
    extensions: {},
  };
}

export function layerDoc(id, entry) {
  return { id, visible: true, opacity: 1, filters: [], style: { preset: entry?.default_style ?? null, overrides: {} } };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string';

function checkGeometry(geometry) {
  const types = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'];
  return isObject(geometry) && types.includes(geometry.type) && Array.isArray(geometry.coordinates);
}

// Upgrade older documents one version at a time. v1 is the first version, so there is nothing to do yet;
// a v2 adds `migrate_v1_to_v2` here and a fixture in tests/fixtures/mapdocs/.
const MIGRATIONS = {};

export function migrate(doc) {
  let current = doc;
  while (current.schema_version < SCHEMA_VERSION) {
    const step = MIGRATIONS[current.schema_version];
    if (!step) break;
    current = step(current);
  }
  return current;
}

// Check and clean a document. `known` lists the layer IDs this Studio has (null: skip that check).
// Returns { doc, problems, notices }: problems stop the document from opening; notices are things dropped.
export function validate(input, known = null) {
  const problems = [];
  const notices = [];
  if (!isObject(input)) return { doc: null, problems: [{ code: 'notDocument' }], notices };
  const version = input.schema_version;
  if (!Number.isInteger(version) || version < 1) return { doc: null, problems: [{ code: 'notDocument' }], notices };
  if (version > SCHEMA_VERSION) return { doc: null, problems: [{ code: 'newerVersion', detail: version }], notices };
  const raw = migrate(input);
  const doc = createDoc();
  doc.created_at = isText(raw.created_at) ? raw.created_at : doc.created_at;
  doc.title = isText(raw.title) ? raw.title.slice(0, 120) : '';
  doc.subtitle = isText(raw.subtitle) ? raw.subtitle.slice(0, 160) : '';

  const area = isObject(raw.area) ? raw.area : {};
  if (area.level !== undefined && !LEVELS.includes(area.level)) problems.push({ code: 'badArea', detail: String(area.level) });
  doc.area.level = LEVELS.includes(area.level) ? area.level : 'county';
  for (const [key, pattern] of Object.entries(PLACE_PATTERNS)) {
    const value = area[key];
    if (value === null || value === undefined || value === '') continue;
    if (!pattern.test(String(value))) problems.push({ code: 'badArea', detail: `${key}=${value}` });
    else doc.area[key] = String(value);
  }
  doc.mask = raw.mask !== false;
  doc.basemap = raw.basemap === 'none' ? 'none' : 'positron';
  if (isObject(raw.view) && Array.isArray(raw.view.center) && raw.view.center.length === 2
    && raw.view.center.every(Number.isFinite) && Number.isFinite(raw.view.zoom)) {
    doc.view = { center: raw.view.center, zoom: raw.view.zoom, bearing: Number.isFinite(raw.view.bearing) ? raw.view.bearing : 0 };
  }

  const layers = Array.isArray(raw.layers) ? raw.layers : [];
  if (layers.length > MAX_LAYERS) problems.push({ code: 'tooManyLayers', detail: layers.length });
  const seen = new Set();
  for (const layer of layers.slice(0, MAX_LAYERS)) {
    if (!isObject(layer) || !isText(layer.id)) { problems.push({ code: 'badLayer' }); continue; }
    if (known && !known.has(layer.id)) { notices.push({ code: 'unknownLayer', detail: layer.id }); continue; }
    if (seen.has(layer.id)) continue;
    seen.add(layer.id);
    const filters = (Array.isArray(layer.filters) ? layer.filters : [])
      .filter((condition) => isObject(condition) && isText(condition.field) && OPS.includes(condition.op));
    const style = isObject(layer.style) ? layer.style : {};
    doc.layers.push({
      id: layer.id,
      visible: layer.visible !== false,
      opacity: Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1,
      filters,
      style: { preset: isText(style.preset) ? style.preset : null, overrides: isObject(style.overrides) ? style.overrides : {} },
    });
  }

  const buffers = Array.isArray(raw.buffers) ? raw.buffers : [];
  if (buffers.length > MAX_BUFFERS) problems.push({ code: 'tooManyBuffers', detail: buffers.length });
  for (const buffer of buffers.slice(0, MAX_BUFFERS)) {
    if (!isObject(buffer)) { problems.push({ code: 'badBuffer' }); continue; }
    const distance = buffer.distance_ft;
    if (!Number.isFinite(distance) || distance < MIN_DISTANCE_FT || distance > MAX_DISTANCE_FT) {
      problems.push({ code: 'badDistance', detail: distance });
      continue;
    }
    const source = isObject(buffer.source) ? buffer.source : {};
    if (!['feature', 'drawn'].includes(source.kind) || !checkGeometry(source.geometry)) {
      problems.push({ code: 'badBufferSource' });
      continue;
    }
    if (source.kind === 'feature' && (!isText(source.layer) || !isText(source.atlas_id))) {
      problems.push({ code: 'badBufferSource' });
      continue;
    }
    const targets = (Array.isArray(buffer.targets) ? buffer.targets : []).filter(isText);
    const missing = targets.filter((id) => !doc.layers.some((layer) => layer.id === id));
    if (missing.length) notices.push({ code: 'targetNotOnMap', detail: missing.join(', ') });
    doc.buffers.push({
      id: isText(buffer.id) ? buffer.id : `b${doc.buffers.length + 1}`,
      source: source.kind === 'feature'
        ? { kind: 'feature', layer: source.layer, atlas_id: source.atlas_id, label: isText(source.label) ? source.label : '', geometry: source.geometry }
        : { kind: 'drawn', geometry: source.geometry },
      distance_ft: distance,
      targets: targets.filter((id) => !missing.includes(id)),
      label: isText(buffer.label) ? buffer.label.slice(0, 80) : '',
    });
  }

  const layout = isObject(raw.layout) ? raw.layout : {};
  doc.layout = {
    paper: PAPERS.includes(layout.paper) ? layout.paper : 'letter',
    orientation: ORIENTATIONS.includes(layout.orientation) ? layout.orientation : 'landscape',
    legend: layout.legend !== false,
    scale_bar: layout.scale_bar !== false,
    north_arrow: layout.north_arrow !== false,
    notes: isText(layout.notes) ? layout.notes.slice(0, 600) : '',
  };
  doc.credits = Array.isArray(raw.credits) ? raw.credits.filter(isText) : [];
  doc.source_versions = isObject(raw.source_versions) ? raw.source_versions : {};
  // Unknown keys are kept under extensions and never deleted (paid features plug in here, D-040).
  doc.extensions = isObject(raw.extensions) ? { ...raw.extensions } : {};
  for (const key of Object.keys(raw)) if (!KNOWN_KEYS.includes(key)) doc.extensions[key] = raw[key];
  return { doc: problems.length ? null : doc, problems, notices };
}

// The ID a new buffer gets: b1, b2, ... not already used.
export function nextBufferId(doc) {
  let n = 1;
  while (doc.buffers.some((buffer) => buffer.id === `b${n}`)) n += 1;
  return `b${n}`;
}
