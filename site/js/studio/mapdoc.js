// The map document: one JSON object for the screen, the link, the .map.json file and the print (D-034,
// IMPLEMENTATION_GUIDE.md §4.2). Version 2 (D-076) keeps site screenings under `screenings` (version 1 called them
// `buffers`) and buffer layers under `buffers`. Charts (D-088) are an optional `charts` list: an addition, not a new
// version, so documents made before charts open unchanged and older copies of Studio keep charts as an extension.
// So are `comparisons` (the Changes tool's series, D-091) and `deadlines` (a town's own dates, D-093).
// Imports pure modules only. Problems are codes with details; site/js/studio/text.js turns them into words.
import { MAX_PICKED, MAX_RINGS, OUTLINE_STYLES, SELECTS, UNITS, defaultStyle, validDistance } from './buffer.js';
import { BASEMAP_MODES, BASEMAP_NAMES, OUTSIDE_MODES } from './basemaps.js';
import { BARS, CHART_TYPES, MAX_CHARTS, MEASURES, SCOPES } from './chartdata.js';
import { TEMPLATES } from './layoutgeom.js';

export const SCHEMA_VERSION = 2;
export const MAX_LAYERS = 8;
export const MAX_BUFFERS = 4;
export const MAX_SCREENINGS = 4;
export const MAX_DEADLINES = 12;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_DISTANCE_FT = 1;
export const MAX_DISTANCE_FT = 5280;
export const BUFFER_PRESETS_FT = [50, 100, 200, 300, 500, 1000];
export const LEVELS = ['state', 'county', 'municipality', 'tract', 'block_group'];
export const BASEMAPS = BASEMAP_NAMES; // D-071, D-079: positron (Light), liberty (Streets), dark, satellite
const PLACE_PATTERNS = { county_fips: /^\d{3}$/, mun_code: /^\d{4}$/, tract_geoid: /^34\d{9}$/, bg_geoid: /^34\d{10}$/ };
export const LEVEL_KEY = { county: 'county_fips', municipality: 'mun_code', tract: 'tract_geoid', block_group: 'bg_geoid' };
const PAPERS = ['letter', 'tabloid'];
const ORIENTATIONS = ['landscape', 'portrait'];
const KNOWN_KEYS = ['schema_version', 'title', 'subtitle', 'created_at', 'area', 'mask', 'basemap', 'basemap_mode', 'view', 'layers', 'screenings',
  'buffers', 'charts', 'comparisons', 'deadlines', 'layout', 'credits', 'source_versions', 'extensions'];
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
    mask: 'dim',
    basemap: 'positron',
    basemap_mode: 'on',
    view: null,
    layers: [],
    screenings: [],
    buffers: [],
    charts: [],
    comparisons: [],
    deadlines: [],
    layout: { paper: 'letter', orientation: 'landscape', legend: true, scale_bar: true, north_arrow: true, notes: '', template: 'map', slots: [] },
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

// Upgrade older documents one version at a time, each with a fixture in tests/fixtures/mapdocs/.
const MIGRATIONS = {
  // v1 -> v2 (D-076): v1's buffers were site screenings.
  1: (doc) => ({ ...doc, schema_version: 2, screenings: Array.isArray(doc.buffers) ? doc.buffers : [], buffers: [] }),
};

export function migrate(doc) {
  let current = doc;
  while (current.schema_version < SCHEMA_VERSION) {
    const step = MIGRATIONS[current.schema_version];
    if (!step) break;
    current = step(current);
  }
  return current;
}

const isColor = (value) => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
const clamp = (value, min, max, fallback) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

function cleanFilters(filters) {
  return (Array.isArray(filters) ? filters : []).filter((condition) => isObject(condition) && isText(condition.field) && OPS.includes(condition.op));
}

function cleanRingStyle(style, fallback) {
  const s = isObject(style) ? style : {};
  return {
    fill: isColor(s.fill) ? s.fill : fallback.fill,
    fill_opacity: clamp(s.fill_opacity, 0, 1, fallback.fill_opacity),
    outline: isColor(s.outline) ? s.outline : fallback.outline,
    outline_width: clamp(s.outline_width, 0, 8, fallback.outline_width),
    outline_style: OUTLINE_STYLES.includes(s.outline_style) ? s.outline_style : 'solid',
  };
}

// Check and clean a document. `known` lists the layer IDs this Studio has, and `bufferable` those that can be
// buffered (boundary layers cannot, D-074); null skips that check.
// Returns { doc, problems, notices }: problems stop the document from opening; notices are things dropped.
export function validate(input, known = null, bufferable = null) {
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
  // D-082: what lies outside the area, 'show', 'dim' or 'hide'. Older files said true (dim) or false (show).
  doc.mask = OUTSIDE_MODES.includes(raw.mask) ? raw.mask : raw.mask === false ? 'show' : 'dim';
  doc.basemap = BASEMAPS.includes(raw.basemap) ? raw.basemap : 'positron';
  // D-080: on, dim or off. The old basemap 'none' is Light, off.
  doc.basemap_mode = raw.basemap === 'none' ? 'off' : BASEMAP_MODES.includes(raw.basemap_mode) ? raw.basemap_mode : 'on';
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
    const filters = cleanFilters(layer.filters);
    const style = isObject(layer.style) ? layer.style : {};
    doc.layers.push({
      id: layer.id,
      visible: layer.visible !== false,
      opacity: Number.isFinite(layer.opacity) ? Math.min(1, Math.max(0, layer.opacity)) : 1,
      filters,
      style: { preset: isText(style.preset) ? style.preset : null, overrides: isObject(style.overrides) ? style.overrides : {} },
    });
  }

  const screenings = Array.isArray(raw.screenings) ? raw.screenings : [];
  if (screenings.length > MAX_SCREENINGS) problems.push({ code: 'tooManyScreenings', detail: screenings.length });
  for (const screening of screenings.slice(0, MAX_SCREENINGS)) {
    if (!isObject(screening)) { problems.push({ code: 'badScreening' }); continue; }
    const distance = screening.distance_ft;
    if (!Number.isFinite(distance) || distance < MIN_DISTANCE_FT || distance > MAX_DISTANCE_FT) {
      problems.push({ code: 'badDistance', detail: distance });
      continue;
    }
    const source = isObject(screening.source) ? screening.source : {};
    if (!['feature', 'drawn'].includes(source.kind) || !checkGeometry(source.geometry)) {
      problems.push({ code: 'badScreeningSource' });
      continue;
    }
    if (source.kind === 'feature' && (!isText(source.layer) || !isText(source.atlas_id))) {
      problems.push({ code: 'badScreeningSource' });
      continue;
    }
    const targets = (Array.isArray(screening.targets) ? screening.targets : []).filter(isText);
    const missing = targets.filter((id) => !doc.layers.some((layer) => layer.id === id));
    if (missing.length) notices.push({ code: 'targetNotOnMap', detail: missing.join(', ') });
    doc.screenings.push({
      id: isText(screening.id) ? screening.id : `s${doc.screenings.length + 1}`,
      source: source.kind === 'feature'
        ? { kind: 'feature', layer: source.layer, atlas_id: source.atlas_id, label: isText(source.label) ? source.label : '', geometry: source.geometry }
        : { kind: 'drawn', geometry: source.geometry },
      distance_ft: distance,
      targets: targets.filter((id) => !missing.includes(id)),
      label: isText(screening.label) ? screening.label.slice(0, 80) : '',
    });
  }

  // Buffer layers (D-076): the recipe only; Studio runs it again when the document opens.
  const buffers = Array.isArray(raw.buffers) ? raw.buffers : [];
  if (buffers.length > MAX_BUFFERS) problems.push({ code: 'tooManyBuffers', detail: buffers.length });
  for (const buffer of buffers.slice(0, MAX_BUFFERS)) {
    if (!isObject(buffer) || !isText(buffer.layer)) { problems.push({ code: 'badBuffer' }); continue; }
    if (!doc.layers.some((layer) => layer.id === buffer.layer)) { notices.push({ code: 'bufferLayerMissing', detail: buffer.layer }); continue; }
    if (bufferable && !bufferable.has(buffer.layer)) { notices.push({ code: 'notBufferable', detail: buffer.layer }); continue; }
    const unit = buffer.unit ?? 'ft';
    const rings = Array.isArray(buffer.distances) ? buffer.distances : [];
    if (!UNITS.includes(unit) || !rings.length || rings.length > MAX_RINGS) { problems.push({ code: 'badBuffer' }); continue; }
    const bad = rings.find((ring) => !isObject(ring) || !validDistance(ring.value, unit));
    if (bad) { problems.push({ code: 'badBufferDistance', detail: `${isObject(bad) ? bad.value : bad} ${unit}` }); continue; }
    const index = doc.buffers.length;
    doc.buffers.push({
      id: isText(buffer.id) ? buffer.id : `b${index + 1}`,
      layer: buffer.layer,
      name: isText(buffer.name) ? buffer.name.slice(0, 80) : '',
      select: SELECTS.includes(buffer.select) ? buffer.select : 'all',
      filters: cleanFilters(buffer.filters),
      picked: (Array.isArray(buffer.picked) ? buffer.picked : []).filter(isText).slice(0, MAX_PICKED),
      unit,
      dissolve: buffer.dissolve === true,
      visible: buffer.visible !== false,
      distances: rings.map((ring, i) => ({ value: ring.value, style: cleanRingStyle(ring.style, defaultStyle(index, i)) })),
      ...(isText(buffer.preset) ? { preset: buffer.preset.slice(0, 40) } : {}),
    });
  }

  // Charts (D-088): the recipe only; Studio counts again when the document opens. A chart whose layer is not on the
  // map is dropped with a notice, like a buffer's. An older Studio kept charts under extensions.
  const charts = Array.isArray(raw.charts) ? raw.charts : Array.isArray(raw.extensions?.charts) ? raw.extensions.charts : [];
  for (const chart of charts.slice(0, MAX_CHARTS)) {
    if (!isObject(chart) || !isText(chart.layer) || !CHART_TYPES.includes(chart.type)) { notices.push({ code: 'badChart' }); continue; }
    if (!doc.layers.some((layer) => layer.id === chart.layer)) { notices.push({ code: 'chartLayerMissing', detail: chart.layer }); continue; }
    const scope = SCOPES.includes(chart.scope) ? chart.scope : 'area';
    let measure = MEASURES.includes(chart.measure) && chart.type !== 'histogram' ? chart.measure : 'count';
    if (measure === 'ring_area' && scope !== 'ring') measure = 'count';
    if (measure === 'sum' && !isText(chart.sum_field)) measure = 'count';
    const id = isText(chart.id) && !doc.charts.some((c) => c.id === chart.id) ? chart.id.slice(0, 12) : nextId(doc.charts, 'c');
    doc.charts.push({
      id, type: chart.type, layer: chart.layer, scope,
      field: isText(chart.field) ? chart.field : null,
      measure,
      sum_field: measure === 'sum' ? chart.sum_field : null,
      title: isText(chart.title) ? chart.title.slice(0, 100) : '',
      max_bars: Number.isInteger(chart.max_bars) ? Math.min(BARS.max, Math.max(BARS.min, chart.max_bars)) : BARS.default,
    });
  }

  // The Changes tool's series (D-091): one at a time, by the later cycle's layer; the layer need not be on the map.
  const comparisons = Array.isArray(raw.comparisons) ? raw.comparisons : [];
  for (const comparison of comparisons.slice(0, 1)) {
    if (!isObject(comparison) || !isText(comparison.layer)) { notices.push({ code: 'badComparison' }); continue; }
    if (known && !known.has(comparison.layer)) { notices.push({ code: 'unknownLayer', detail: comparison.layer }); continue; }
    doc.comparisons.push({ id: isText(comparison.id) ? comparison.id.slice(0, 12) : 'k1', layer: comparison.layer });
  }
  // A town's own dates for the calendar (D-093): a short title and a day.
  for (const entry of (Array.isArray(raw.deadlines) ? raw.deadlines : []).slice(0, MAX_DEADLINES)) {
    if (!isObject(entry) || !isText(entry.title) || !entry.title.trim() || !isText(entry.date) || !DATE.test(entry.date)) continue;
    doc.deadlines.push({ title: entry.title.trim().slice(0, 80), date: entry.date });
  }

  const layout = isObject(raw.layout) ? raw.layout : {};
  doc.layout = {
    paper: PAPERS.includes(layout.paper) ? layout.paper : 'letter',
    orientation: ORIENTATIONS.includes(layout.orientation) ? layout.orientation : 'landscape',
    legend: layout.legend !== false,
    scale_bar: layout.scale_bar !== false,
    north_arrow: layout.north_arrow !== false,
    notes: isText(layout.notes) ? layout.notes.slice(0, 600) : '',
    // D-089: the page template and the charts in its slots, in order (charts this document has, each once).
    template: Object.hasOwn(TEMPLATES, layout.template) ? layout.template : 'map',
    slots: [],
  };
  for (const id of Array.isArray(layout.slots) ? layout.slots : []) {
    if (isText(id) && doc.charts.some((chart) => chart.id === id) && !doc.layout.slots.includes(id)) doc.layout.slots.push(id);
  }
  doc.layout.slots = doc.layout.slots.slice(0, TEMPLATES[doc.layout.template]);
  doc.credits = Array.isArray(raw.credits) ? raw.credits.filter(isText) : [];
  doc.source_versions = isObject(raw.source_versions) ? raw.source_versions : {};
  // Unknown keys are kept under extensions and never deleted (paid features plug in here, D-040).
  doc.extensions = isObject(raw.extensions) ? { ...raw.extensions } : {};
  for (const key of Object.keys(raw)) if (!KNOWN_KEYS.includes(key)) doc.extensions[key] = raw[key];
  if (doc.charts.length) delete doc.extensions.charts;
  return { doc: problems.length ? null : doc, problems, notices };
}

function nextId(items, prefix) {
  let n = 1;
  while (items.some((item) => item.id === `${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

// The ID a new buffer gets: b1, b2, ... not already used; screenings get s1, s2, ...
export const nextBufferId = (doc) => nextId(doc.buffers, 'b');
export const nextScreeningId = (doc) => nextId(doc.screenings, 's');
export const nextChartId = (doc) => nextId(doc.charts, 'c');
