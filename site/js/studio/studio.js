// NJ Atlas Studio: one map document drives the panels, the map, the link, the file and the print (D-034).
// setDoc(next) is the only way the document changes. Panels are drawn by panels.js.
import { TEXT } from './text.js';
import { createRegistry, drawsFromTiles, displayFields, isSource, isTarget, outFields } from './registry.js';
import { createClient } from './live.js';
import { LiveLayer } from './tiles.js';
import { createStudioMap } from './mapview.js';
import { basemapCredit } from './basemaps.js';
import { DrawTool } from './draw.js';
import { createDoc, layerDoc, LEVEL_KEY, MAX_BUFFERS, MAX_LAYERS, nextBufferId, nextScreeningId, validate } from './mapdoc.js';
import { decodeHash, embedSnippet, encodeDoc, isLong, linkFor } from './share.js';
import { areaWhere, conditionsWhere, joinWhere, quote } from './sql.js';
import { layerSpecs, legendFor, presetStyle, resolve } from './style.js';
import { toRow } from './transform.js';
import { loadJsts, loadTurf } from './turf.js';
import { bufferFeatures } from './geoprocess.js';
import { MAX_BUFFER_FEATURES, MAX_DISTANCE, MAX_PICKED, MAX_RINGS, bufferDownload, bufferLegend, bufferName, bufferSpecs,
  dropPreset, presetOf, presetPatch,
  defaultStyle, newBuffer, nextDistance, outputKey, toMeters, validDistance } from './buffer.js';
import { notesOf, resultNotes, ringFor, resultsCsv, resultsGeojson, runScreening, screeningFileName } from './screening.js';
import { dataCsv, dataGeojson, fetchLayerData, pngMap, printMap, printRoot, renderPrintRoot } from './export.js';
import { loadHealth } from './health.js';
import { countExport, rememberPilot } from './counter.js';
import { bboxOf, roundGeometry } from './geo.js';
import { addressWhere, parseAddress } from './search.js';
import { copyText, debounce, download } from './dom.js';
import * as panels from './panels.js';
import { cleanState, toMapFilter, toPredicate } from '../filters.js';
import { loadRows } from '../data.js';
import { pickerLevels, trimPlace, choose, emptyPlace } from '../places.js';
import { formatDate } from '../format.js';
import { slug } from '../csv.js';

const $ = (id) => document.getElementById(id);
const EMPTY = { type: 'FeatureCollection', features: [] };
const LEVEL_ORDER = ['county', 'municipality', 'tract', 'block_group'];

const app = {
  text: TEXT,
  registry: null,
  levels: [],
  units: {},
  doc: createDoc(),
  map: null,
  runtimes: new Map(),
  outlines: new Map(),
  areaGeometry: null,
  health: {},
  client: null,
  draw: null,
  mode: null, // null | 'select' (a screening's site) | 'pick' (a buffer's features)
  results: null,
  ring: null,
  table: null,
  // Buffer layers (D-076): outputs, running jobs, input counts and failures, by buffer ID.
  outputs: new Map(),
  bufferJobs: new Map(),
  bufferErrors: new Map(),
  inputCounts: new Map(),
  bufferRequested: new Set(),
  pickShapes: new Map(),
  ui: { tab: 'area', tool: 'buffer', editing: null, pickFor: null, ringStyle: null, selected: null,
    sections: { style: true, filter: false, about: false }, addQuery: '', candidates: null, candidatesFor: null, status: '' },
  embed: new URLSearchParams(location.search).get('embed') === '1',
  pilot: null,
};

// ---- Data files ----

function dataUrl(path) {
  return new URL(`data/${path}`, document.baseURI).href;
}

async function getJson(path) {
  const response = await fetch(dataUrl(path), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function loadUnits(level) {
  if (!app.units[level]) {
    const entry = app.levels.find((l) => l.id === level);
    app.units[level] = entry?.units ? getJson(entry.units) : Promise.resolve([]);
    app.units[level].catch(() => { delete app.units[level]; });
  }
  return app.units[level];
}

async function unitsNow(level) {
  const list = await loadUnits(level);
  app.unitsReady = { ...(app.unitsReady ?? {}), [level]: list };
  return list;
}

// ---- The area ----

// The deepest chosen area: { level, code } or the whole state.
export function effectiveArea(area) {
  for (const level of [...LEVEL_ORDER].reverse()) if (area[LEVEL_KEY[level]]) return { level, code: area[LEVEL_KEY[level]] };
  return { level: 'state', code: '34' };
}

function unitName(level, code) {
  return app.unitsReady?.[level]?.find((unit) => unit.code === code)?.name ?? null;
}

function areaName() {
  const { level, code } = effectiveArea(app.doc.area);
  return level === 'state' ? 'New Jersey' : unitName(level, code) ?? code;
}

function outlineFor(level, code) {
  const key = `${level}/${code}`;
  if (!app.outlines.has(key)) {
    const promise = getJson(`outlines/${key}.json`);
    promise.catch(() => app.outlines.delete(key));
    app.outlines.set(key, promise);
  }
  return app.outlines.get(key);
}

function copyPlace() {
  return trimPlace(app.doc.area, app.doc.area.level);
}

// ---- Layer runtime: counts, stats, live drawing ----

function runtime(id) {
  if (!app.runtimes.has(id)) {
    const entry = app.registry.get(id);
    app.runtimes.set(id, { entry, types: null, total: null, matched: null, status: 'idle', error: null, queryKey: null,
      stats: { values: {}, ranges: {}, loaded: false }, loader: null, approx: false });
  }
  return app.runtimes.get(id);
}

async function typesFor(rt) {
  if (!rt.types) rt.types = await app.client.fieldTypes(rt.entry.source.url);
  return rt.types;
}

// The outline of an area ({ level, code }), from the cached request for that very area. app.areaGeometry is what the
// map shows, and can still be the previous area's while a new one loads; queries must not use it.
async function outlineOf(area) {
  try {
    return await outlineFor(area.level, area.code);
  } catch {
    return null;
  }
}

// { whereArea, where, geometry, area }: the area as a where clause or an outline, plus the layer's filters. `area`
// is the area both were made for, read once at the start.
async function queryFor(rt, layer) {
  const docArea = app.doc.area;
  const area = effectiveArea(docArea);
  const types = await typesFor(rt);
  const query = { ...docArea, level: area.level };
  const county = query.county_fips ? unitName('county', query.county_fips) : null;
  const slice = areaWhere(rt.entry, query, { county });
  const geometry = slice.outline ? await outlineOf(area) : null;
  const whereArea = joinWhere(rt.entry.source.where, slice.where);
  const where = joinWhere(whereArea, conditionsWhere(rt.entry, layer.filters, types));
  return { whereArea, where, geometry, area };
}

function copyFile(entry) {
  return { url: dataUrl(entry.files.parquet.path), bytes: entry.files.parquet.bytes };
}

async function refreshLayer(id) {
  const layer = app.doc.layers.find((l) => l.id === id);
  if (!layer) return;
  const rt = runtime(id);
  const { entry } = rt;
  try {
    if (entry.access === 'copy') {
      rt.status = 'loading';
      const rows = await loadRows(entry, copyFile(entry));
      const place = copyPlace();
      rt.total = rows.filter(toPredicate(cleanState({ place, conditions: [] }, entry.fields))).length;
      rt.matched = rows.filter(toPredicate(cleanState({ place, conditions: layer.filters }, entry.fields))).length;
      rt.status = 'ready';
    } else {
      const q = await queryFor(rt, layer);
      const key = JSON.stringify([q.where, q.whereArea, Boolean(q.geometry), q.area]);
      if (key !== rt.queryKey) {
        rt.queryKey = key;
        rt.status = 'loading';
        panels.renderLayerStatus(app, id);
        const [total, matched] = await Promise.all([
          app.client.count(entry.source.url, { where: q.whereArea, geometry: q.geometry }),
          q.where === q.whereArea ? null : app.client.count(entry.source.url, { where: q.where, geometry: q.geometry })]);
        if (rt.queryKey !== key) return; // a newer change won
        rt.total = total;
        rt.matched = matched ?? total;
        rt.status = 'ready';
        rt.error = null;
        rt.stats.loaded = false;
        if (rt.loader) rt.loader.setQuery({ where: q.where, geometry: q.geometry, total: rt.matched });
      }
      if (rt.loader) rt.loader.update(app.map.bounds(), app.map.zoom());
    }
  } catch (error) {
    rt.status = 'error';
    rt.error = error;
    rt.queryKey = null;
  }
  panels.renderLayerStatus(app, id);
  if (app.ui.selected === id && app.ui.sections.filter && !rt.stats.loaded) loadStats(id);
  // A style still missing its colors or breaks (for example, a source that did not answer when the layer was
  // added) is resolved once and stored, so the map and legend show them.
  const { style } = presetStyle(entry, layer.style);
  const unresolved = (style.kind === 'categories' && !style.colors) || (style.kind === 'graduated' && !style.breaks);
  if (unresolved && !rt.resolving && rt.status === 'ready') {
    rt.resolving = true;
    resolveStyle(id, layer.style).then((overrides) => {
      const resolved = (overrides.colors && Object.keys(overrides.colors).length) || overrides.breaks;
      if (resolved) update((doc) => { const target = doc.layers.find((l) => l.id === id); if (target) target.style.overrides = overrides; });
    }).catch(() => {});
  }
}

// Checklist values and ranges for a layer's filters, within the area (live) or from the build (copy).
export async function loadStats(id) {
  const rt = runtime(id);
  const { entry } = rt;
  if (entry.access === 'copy') {
    rt.stats = { values: entry.values ?? {}, ranges: entry.ranges ?? {}, loaded: true };
    panels.renderLayer(app, id);
    if (app.ui.tab === 'analysis') panels.renderAnalysis(app);
    return;
  }
  const layer = app.doc.layers.find((l) => l.id === id);
  const q = await queryFor(rt, { ...layer, filters: [] });
  const values = {};
  const ranges = {};
  // Where the server cannot count by value inside an outline, the browser reads the values: show how far it
  // has got, and let the person stop it (D-054).
  rt.statsAbort?.abort();
  const controller = new AbortController();
  rt.statsAbort = controller;
  rt.statsProgress = null;
  const onProgress = (read) => { rt.statsProgress = read; panels.renderStatsProgress(app, id); };
  const scope = { where: q.whereArea, geometry: q.geometry, signal: controller.signal, onProgress };
  // Joined fields (D-085) share one key field: count its values once.
  const grouped = new Map();
  const groupCounts = (source) => {
    if (!grouped.has(source)) grouped.set(source, app.client.groupCounts(entry.source.url, source, scope));
    return grouped.get(source);
  };
  await Promise.all(entry.fields.filter((field) => field.filter !== 'none').map(async (field) => {
    try {
      if (field.filter === 'checklist') {
        const counts = await groupCounts(field.source);
        const merged = new Map();
        for (const item of counts) {
          const value = toRow({ [field.source]: item.value }, { source: { id_field: '_' }, fields: [field] })[field.name];
          merged.set(value, (merged.get(value) ?? 0) + item.count);
        }
        values[field.name] = [...merged].map(([value, count]) => ({ value, count }))
          .sort((a, b) => (a.value === null) - (b.value === null) || String(a.value).localeCompare(String(b.value), 'en', { numeric: true }));
      } else if (field.filter === 'range' && field.type === 'number' && !field.transform) {
        ranges[field.name] = await app.client.minMax(entry.source.url, field.source, scope);
      }
    } catch {
      // a field the service cannot count leaves its control without counts
    }
  }));
  if (rt.statsAbort !== controller) return; // a newer count started
  rt.stats = { values, ranges, loaded: true, cancelled: controller.signal.aborted };
  rt.statsAbort = null;
  panels.renderLayer(app, id);
  if (app.ui.tab === 'analysis' && app.doc.buffers.some((buffer) => buffer.layer === id && buffer.select === 'filter')) panels.renderAnalysis(app);
}

// Category colors and class breaks for a style, stored in the document so a shared map looks the same.
async function resolveStyle(id, choice) {
  const rt = runtime(id);
  const { entry } = rt;
  const { style } = presetStyle(entry, choice);
  const stats = {};
  if (style.kind === 'categories' && !style.colors) {
    if (entry.values?.[style.field]) stats.values = entry.values[style.field];
    else {
      const field = entry.fields.find((f) => f.name === style.field);
      const layer = app.doc.layers.find((l) => l.id === id) ?? { filters: [] };
      const q = await queryFor(rt, { ...layer, filters: [] });
      const counts = await app.client.groupCounts(entry.source.url, field.source, { where: q.whereArea, geometry: q.geometry });
      stats.values = counts.map((item) => ({ value: toRow({ [field.source]: item.value }, { source: { id_field: '_' }, fields: [field] })[field.name], count: item.count }));
    }
  }
  if (style.kind === 'graduated' && !style.breaks) {
    const field = entry.fields.find((f) => f.name === style.field);
    const layer = app.doc.layers.find((l) => l.id === id) ?? { filters: [] };
    const q = await queryFor(rt, layer);
    if (style.method === 'equal') Object.assign(stats, await app.client.minMax(entry.source.url, field.source, { where: q.where, geometry: q.geometry }));
    else {
      const page = await app.client.features(entry.source.url, { where: q.where, geometry: q.geometry, outFields: [field.source], returnGeometry: false, num: 2000 });
      stats.numbers = page.features.map((f) => Number(f.properties[field.source])).filter(Number.isFinite);
    }
  }
  return { ...choice.overrides, ...resolve(style, stats) };
}

// ---- The map ----

function tileUrl(entry) {
  return entry.tiles.url ? `${entry.tiles.url}${entry.tiles.path}` : dataUrl(entry.tiles.path);
}

function tileFilter(entry, layer) {
  const place = entry.access === 'copy' ? copyPlace() : emptyPlace();
  return toMapFilter(cleanState({ place, conditions: layer.filters }, entry.fields));
}

function bufferItems(layerId) {
  return app.doc.buffers.filter((buffer) => buffer.layer === layerId && buffer.visible && app.outputs.has(buffer.id)).reverse().map((buffer) => {
    const output = app.outputs.get(buffer.id);
    return { key: `buffer:${buffer.id}`, source: { type: 'geojson', data: { type: 'FeatureCollection', features: output.features } },
      sourceSignature: `buffer:${output.version}`, specs: bufferSpecs(buffer) };
  });
}

function stack() {
  const items = [];
  for (const layer of [...app.doc.layers].reverse()) {
    items.push(...bufferItems(layer.id)); // a layer's buffers sit just beneath it (D-077)
    if (!layer.visible) continue;
    const rt = runtime(layer.id);
    const { entry } = rt;
    const { style } = presetStyle(entry, layer.style);
    const fromTiles = drawsFromTiles(entry);
    const source = fromTiles
      ? { type: 'vector', url: `pmtiles://${tileUrl(entry)}`, attribution: entry.license.attribution }
      : { type: 'geojson', data: rt.loader?.lastData ?? EMPTY, attribution: entry.license.attribution };
    const specs = layerSpecs(entry, style, { id: 'l', source: 'x', sourceLayer: fromTiles ? entry.id : null,
      filter: fromTiles ? tileFilter(entry, layer) : null, opacity: layer.opacity });
    // A map copy draws from its own minimum zoom only (D-066); live layers handle zoom in tiles.js.
    if (fromTiles) for (const spec of specs) spec.minzoom = entry.tiles.min_zoom;
    items.push({ key: layer.id, source, sourceSignature: fromTiles ? tileUrl(entry) : 'geojson', specs });
  }
  return items;
}

function ensureLoaders() {
  for (const layer of app.doc.layers) {
    const rt = runtime(layer.id);
    if (!drawsFromTiles(rt.entry) && !rt.loader) {
      rt.loader = new LiveLayer({
        client: app.client, entry: rt.entry, outFields: outFields(rt.entry, displayFields(rt.entry)),
        onData: (data) => app.map?.setData(layer.id, data),
        onStatus: (status) => { rt.drawStatus = status.state; if (status.error) rt.drawError = status.error; panels.renderLayerStatus(app, layer.id); },
      });
    }
  }
  for (const id of [...app.runtimes.keys()]) {
    if (!app.doc.layers.some((layer) => layer.id === id)) app.runtimes.delete(id);
  }
}

function syncMapLayers() {
  if (!app.map) return;
  ensureLoaders();
  app.map.syncLayers(stack());
  panels.renderLegend(app);
}

async function syncArea() {
  const { level, code } = effectiveArea(app.doc.area);
  const key = `${level}/${code}`;
  if (app.areaKey !== key) {
    app.areaKey = key;
    try {
      app.areaGeometry = await outlineFor(level, code);
    } catch {
      app.areaGeometry = null;
    }
    if (app.areaKey !== key) return false;
  }
  app.map?.setArea(app.areaGeometry, app.doc.mask);
  return true;
}

async function syncOverlays() {
  if (!app.map) return;
  const screening = app.doc.screenings[0];
  if (!screening) {
    app.ring = null;
    app.map.setOverlay('rings', EMPTY);
    app.map.setOverlay('sites', EMPTY);
    app.map.setOverlay('hits', EMPTY);
    return;
  }
  app.map.setOverlay('sites', { type: 'Feature', properties: {}, geometry: screening.source.geometry });
  const key = JSON.stringify([screening.source.geometry, screening.distance_ft]);
  if (app.ringKey !== key) {
    app.ringKey = key;
    const turf = await loadTurf();
    app.ring = await ringFor(turf, screening.source.geometry, screening.distance_ft);
  }
  app.map.setOverlay('rings', app.ring);
  const current = app.results?.bufferId === screening.id && app.results.key === key;
  app.map.setOverlay('hits', current && app.ui.showHits !== false
    ? { type: 'FeatureCollection', features: app.results.targets.flatMap((t) => t.features).filter((f) => f.geometry) } : EMPTY);
}

// ---- The one way the document changes ----

let previous = null;
export async function setDoc(next, { render = true, fit = false } = {}) {
  const before = previous;
  app.doc = next;
  previous = next;
  scheduleHash();
  if (!render) return;
  const areaChanged = !before || JSON.stringify(before.area) !== JSON.stringify(next.area);
  const maskChanged = !before || before.mask !== next.mask;
  if (areaChanged || maskChanged) await syncArea();
  if (app.map && (app.map.basemap !== next.basemap || app.map.basemapMode !== next.basemap_mode)) {
    app.map.basemapMode = next.basemap_mode; // setBasemap applies it to the new style
    if (app.map.basemap !== next.basemap) await app.map.setBasemap(next.basemap); // Studio's layers come along (D-071)
    else app.map.setBasemapMode(next.basemap_mode);
    app.map.basemapControl?.set(next.basemap, next.basemap_mode);
  }
  if (areaChanged && fit) fitArea();
  ensureLoaders(); // layer runtimes exist before the panels draw them
  panels.renderAll(app);
  syncMapLayers();
  syncOverlays();
  for (const layer of next.layers) refreshLayer(layer.id);
  forgetRemovedBuffers();
  countInputs();
  autoRunBuffers();
}

export function update(change, options) {
  const next = structuredClone(app.doc);
  change(next);
  return setDoc(next, options);
}

function fitArea() {
  const { level, code } = effectiveArea(app.doc.area);
  const bounds = level === 'state' ? [-75.6, 38.9, -73.9, 41.4] : app.unitsReady?.[level]?.find((u) => u.code === code)?.bounds
    ?? (app.areaGeometry ? bboxOf(app.areaGeometry) : null);
  if (bounds && app.map) app.map.fitBounds(bounds, 15);
}

const scheduleHash = debounce(async () => {
  try {
    const hash = await encodeDoc(app.doc);
    history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
  } catch {
    // the link is only a convenience; the map file always works
  }
}, 500);

// ---- Actions (called by panels.js) ----

export const actions = {
  setTab(tab) {
    app.ui.tab = tab;
    panels.renderTabs(app);
  },
  setBasemap(name) {
    update((doc) => { doc.basemap = name; });
  },
  setBasemapMode(mode) {
    update((doc) => { doc.basemap_mode = mode; });
  },
  async setLevel(level) {
    const area = { ...app.doc.area, level };
    Object.assign(area, trimPlace(area, level));
    await Promise.all(pickerLevels(level).map((l) => unitsNow(l)));
    update((doc) => { doc.area = area; });
  },
  async pick(level, code) {
    const place = choose(app.doc.area, level, code);
    await Promise.all(pickerLevels(app.doc.area.level).map((l) => unitsNow(l)));
    update((doc) => { doc.area = { ...doc.area, ...place }; }, { fit: true });
  },
  setMask(mask) {
    update((doc) => { doc.mask = mask; });
  },
  async addLayer(id) {
    if (app.doc.layers.length >= MAX_LAYERS || app.doc.layers.some((l) => l.id === id)) return;
    const entry = app.registry.get(id);
    const layer = layerDoc(id, entry);
    try {
      layer.style.overrides = await resolveStyle(id, layer.style);
    } catch {
      // colors fall back to the preset's
    }
    app.ui.selected = id; // a new layer opens its properties (D-070)
    app.ui.tab = 'layers';
    update((doc) => { doc.layers.unshift(layer); });
  },
  removeLayer(id) {
    if (app.ui.selected === id) app.ui.selected = null;
    if (app.table?.id === id) app.table = null;
    update((doc) => {
      doc.layers = doc.layers.filter((l) => l.id !== id);
      doc.buffers = doc.buffers.filter((buffer) => buffer.layer !== id); // a buffer goes with its layer
      for (const screening of doc.screenings) screening.targets = screening.targets.filter((t) => t !== id);
    });
  },
  moveLayer(id, step) {
    update((doc) => {
      const i = doc.layers.findIndex((l) => l.id === id);
      const j = i + step;
      if (i < 0 || j < 0 || j >= doc.layers.length) return;
      [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]];
    });
  },
  setLayer(id, patch) {
    update((doc) => Object.assign(doc.layers.find((l) => l.id === id), patch));
  },
  setFilters(id, filters) {
    update((doc) => { doc.layers.find((l) => l.id === id).filters = filters; });
  },
  async setStyle(id, choice) {
    let overrides = choice.overrides ?? {};
    try {
      overrides = await resolveStyle(id, choice);
    } catch {
      // keep the preset's own colors
    }
    update((doc) => { doc.layers.find((l) => l.id === id).style = { preset: choice.preset, overrides }; });
  },
  // The layer whose properties are open (D-070). An open table follows the chosen layer.
  selectLayer(id) {
    app.ui.selected = id;
    if (id && app.table && app.table.id !== id) openTable(id);
    if (id && app.ui.sections.filter && !runtime(id).stats.loaded) loadStats(id);
    panels.renderLayers(app);
  },
  openTemplates() {
    panels.openTemplates(app);
  },
  sectionToggled(section, open) {
    app.ui.sections[section] = open;
    const id = app.ui.selected;
    if (section === 'filter' && open && id && !runtime(id).stats.loaded) loadStats(id);
  },
  toggleTable(id) {
    if (app.table?.id === id) closeTable();
    else openTable(id);
    panels.renderProperties(app);
  },
  cancelStats(id) {
    runtime(id).statsAbort?.abort();
  },
  recount(id) {
    runtime(id).stats.loaded = false;
    loadStats(id);
    panels.renderLayer(app, id);
  },

  retry(id) {
    runtime(id).queryKey = null;
    refreshLayer(id);
  },

  // Analysis: the tool on show (D-076)
  setTool(tool) {
    app.ui.tool = tool;
    actions.cancelMode();
  },

  // Buffer layers (D-076)
  newBuffer() {
    const layers = bufferableLayers();
    if (!layers.length || app.doc.buffers.length >= MAX_BUFFERS) return;
    const layer = layers.find((entry) => entry.id === app.ui.selected) ?? layers[0];
    const id = nextBufferId(app.doc);
    app.ui.editing = id;
    app.ui.tool = 'buffer';
    update((doc) => { doc.buffers.push(newBuffer(id, layer.id, doc.buffers.length)); });
  },
  openBuffer(id) {
    app.ui.editing = id;
    app.ui.tool = 'buffer';
    actions.setTab('analysis');
    panels.renderAnalysis(app);
  },
  editBuffer(id) {
    app.ui.editing = app.ui.editing === id ? null : id;
    app.ui.tool = 'buffer';
    if (app.ui.pickFor && app.ui.pickFor !== id) actions.cancelMode();
    actions.setTab('analysis');
    panels.renderAnalysis(app);
  },
  setBuffer(id, patch) {
    update((doc) => Object.assign(doc.buffers.find((buffer) => buffer.id === id), patch));
  },
  setBufferLayer(id, layer) {
    if (app.ui.pickFor === id) actions.cancelMode();
    app.pickShapes.clear();
    update((doc) => {
      const buffer = doc.buffers.find((b) => b.id === id);
      dropPreset(buffer, app.registry.get(buffer.layer));
      Object.assign(buffer, { layer, select: 'all', filters: [], picked: [] });
    });
  },
  // A rule's buffer from the layer's recipe (D-085), such as a riparian zone.
  applyPreset(id, key) {
    const index = app.doc.buffers.findIndex((b) => b.id === id);
    const preset = app.registry.get(app.doc.buffers[index]?.layer)?.buffer_presets?.find((p) => p.key === key);
    if (!preset) return;
    update((doc) => Object.assign(doc.buffers[index], presetPatch(preset, index)));
  },
  // All in the area, a filter (starting from the layer's own), or features picked on the map.
  setBufferSelect(id, select) {
    const buffer = bufferById(id);
    const layerFilters = app.doc.layers.find((l) => l.id === buffer.layer)?.filters ?? [];
    update((doc) => {
      const target = doc.buffers.find((b) => b.id === id);
      target.select = select;
      if (select === 'filter' && !target.filters.length) target.filters = structuredClone(layerFilters);
    });
    if (select === 'filter' && !runtime(buffer.layer).stats.loaded) loadStats(buffer.layer);
    if (select === 'picked') actions.startPick(id);
    else if (app.ui.pickFor === id) actions.cancelMode();
  },
  setBufferFilters(id, filters) {
    actions.setBuffer(id, { filters });
  },
  startPick(id) {
    app.draw?.stop();
    app.mode = 'pick';
    app.ui.pickFor = id;
    app.map.map.getCanvas().style.cursor = 'pointer';
    showPicks();
    panels.renderAnalysis(app);
  },
  clearPicked(id) {
    app.pickShapes.clear();
    showPicks();
    actions.setBuffer(id, { picked: [] });
  },
  // Changing the unit keeps the numbers (500 ft becomes 500 m), within the unit's limit.
  setBufferUnit(id, unit) {
    update((doc) => {
      const buffer = doc.buffers.find((b) => b.id === id);
      if (buffer.unit !== unit) dropPreset(buffer, app.registry.get(buffer.layer));
      buffer.unit = unit;
      for (const ring of buffer.distances) ring.value = Math.min(ring.value, MAX_DISTANCE[unit]);
    });
  },
  addRing(id) {
    update((doc) => {
      const index = doc.buffers.findIndex((b) => b.id === id);
      const buffer = doc.buffers[index];
      if (buffer.distances.length >= MAX_RINGS) return;
      dropPreset(buffer, app.registry.get(buffer.layer));
      buffer.distances.push({ value: nextDistance(buffer), style: defaultStyle(index, buffer.distances.length) });
    });
  },
  // Returns false for a distance outside the limit; the panel says so.
  setRing(id, index, value) {
    const buffer = bufferById(id);
    if (!validDistance(value, buffer.unit)) return false;
    update((doc) => {
      const target = doc.buffers.find((b) => b.id === id);
      if (target.distances[index].value !== value) dropPreset(target, app.registry.get(target.layer));
      target.distances[index].value = value;
    });
    return true;
  },
  setRingStyle(id, index, patch) {
    update((doc) => Object.assign(doc.buffers.find((b) => b.id === id).distances[index].style, patch));
  },
  removeRing(id, index) {
    if (app.ui.ringStyle === `${id}:${index}`) app.ui.ringStyle = null;
    update((doc) => {
      const buffer = doc.buffers.find((b) => b.id === id);
      if (buffer.distances.length > 1) {
        dropPreset(buffer, app.registry.get(buffer.layer));
        buffer.distances.splice(index, 1);
      }
    });
  },
  toggleRingStyle(id, index) {
    const key = `${id}:${index}`;
    app.ui.ringStyle = app.ui.ringStyle === key ? null : key;
    panels.renderAnalysis(app);
  },
  runBuffer(id) {
    app.bufferRequested.add(id); // from now on, changes run it again (D-076)
    runBufferLayer(id);
  },
  cancelBuffer(id) {
    app.bufferJobs.get(id)?.abort.abort();
    app.bufferJobs.delete(id);
    app.bufferRequested.delete(id);
    panels.renderAnalysis(app);
    panels.renderLayers(app);
  },
  removeBuffer(id) {
    app.bufferJobs.get(id)?.abort.abort();
    if (app.ui.pickFor === id) actions.cancelMode();
    if (app.ui.editing === id) app.ui.editing = null;
    update((doc) => { doc.buffers = doc.buffers.filter((b) => b.id !== id); });
  },
  zoomToBuffer(id) {
    const output = app.outputs.get(id);
    if (output?.features.length) app.map.fitBounds(bboxOf({ type: 'GeometryCollection', geometries: output.features.map((f) => f.geometry) }), 17);
  },
  downloadBuffer(id) {
    const buffer = bufferById(id);
    const output = app.outputs.get(id);
    if (!buffer || !output) return;
    const entry = app.registry.get(buffer.layer);
    const name = bufferName(buffer, entry, TEXT.buffer);
    const notes = [presetOf(buffer, entry)?.note, ...notesOf(entry, 'export'), TEXT.buffer.measured, entry.license.attribution,
      `${TEXT.export.dataDates}: ${dataDates()}`].filter(Boolean);
    download(`${slug(name)}_${new Date().toISOString().slice(0, 10)}.geojson`, JSON.stringify(bufferDownload(output, { name, notes })), 'application/geo+json');
    countExport(app.registry.catalog.counter_url, 'geojson', true, app.pilot);
  },

  // Site screening
  startSelect() {
    app.draw?.stop();
    app.mode = 'select';
    app.ui.tool = 'screening';
    actions.setTab('analysis');
    app.map.map.getCanvas().style.cursor = 'pointer';
    panels.renderAnalysis(app);
  },
  startDraw(kind) {
    app.mode = null;
    app.ui.pickFor = null;
    app.draw.start(kind);
    actions.setTab('analysis');
    panels.renderAnalysis(app);
  },
  cancelMode() {
    const picking = app.mode === 'pick';
    app.mode = null;
    app.ui.pickFor = null;
    app.draw?.stop();
    app.map.map.getCanvas().style.cursor = '';
    if (picking) app.map.setOverlay('selected', null);
    panels.renderAnalysis(app);
  },
  useCoordinates(text) {
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
    if (!match) return false;
    let [lat, lng] = [Number(match[1]), Number(match[2])];
    if (lat < 0 && lng > 0) [lat, lng] = [lng, lat];
    if (lat < 38.5 || lat > 41.5 || lng < -75.8 || lng > -73.7) return false;
    setSite({ kind: 'drawn', geometry: { type: 'Point', coordinates: [lng, lat] } }, TEXT.screening.drawnSite);
    return true;
  },
  async searchAddress(query, forSite) {
    const search = app.registry.catalog.search;
    if (query.trim().length < search.min_characters) {
      app.ui.candidates = [];
      app.ui.candidatesFor = forSite ? 'site' : 'area';
      app.ui.candidateMessage = TEXT.area.addressTooShort;
      panels.renderAll(app);
      return;
    }
    const json = await app.client.request(`${search.url}/findAddressCandidates`, {
      SingleLine: query, outSR: '4326', maxLocations: String(search.max_results), outFields: 'Addr_type' });
    app.ui.candidates = (json.candidates ?? []).filter((c) => c.score >= search.min_score);
    app.ui.candidatesFor = forSite ? 'site' : 'area';
    app.ui.candidateMessage = app.ui.candidates.length ? '' : TEXT.area.addressNone;
    app.ui.fallbackQuery = app.ui.candidates.length || !search.fallback || !parseAddress(query) ? null : query;
    panels.renderAll(app);
  },
  // The slower search of address points, offered when the geocoder finds nothing (D-048).
  async searchAddressPoints() {
    const { fallback } = app.registry.catalog.search;
    const parsed = parseAddress(app.ui.fallbackQuery);
    if (!parsed) return;
    app.ui.fallbackAbort?.abort();
    const controller = new AbortController();
    app.ui.fallbackAbort = controller;
    app.ui.candidateMessage = TEXT.area.addressSearching;
    panels.renderAll(app);
    try {
      const slow = app.slowClient ?? (app.slowClient = createClient({ timeoutMs: (fallback.timeout_s ?? 60) * 1000 }));
      const page = await slow.features(fallback.url, { where: addressWhere(parsed, fallback), outFields: [fallback.address_field, fallback.place_field],
        num: fallback.max_results, precision: 6, signal: controller.signal });
      app.ui.candidates = page.features.filter((f) => f.geometry).map((f) => ({ score: 100,
        address: [f.properties[fallback.address_field], f.properties[fallback.place_field]].filter(Boolean).join(', '),
        location: { x: f.geometry.coordinates[0], y: f.geometry.coordinates[1] } }));
      app.ui.candidateMessage = app.ui.candidates.length ? '' : TEXT.area.addressNone;
    } catch (error) {
      app.ui.candidateMessage = error.kind === 'cancelled' ? '' : TEXT.layers.failed;
    }
    app.ui.fallbackQuery = null;
    app.ui.fallbackAbort = null;
    panels.renderAll(app);
  },
  cancelAddressPoints() {
    app.ui.fallbackAbort?.abort();
  },
  async useCandidate(candidate) {
    const point = { type: 'Point', coordinates: [candidate.location.x, candidate.location.y] };
    const forSite = app.ui.candidatesFor === 'site';
    app.ui.candidates = null;
    app.map.map.flyTo({ center: point.coordinates, zoom: 17, duration: 600 });
    app.map.setOverlay('selected', { type: 'Feature', properties: {}, geometry: point });
    if (forSite) {
      const siteLayer = app.registry.catalog.templates?.site_screening?.site_layer;
      const entry = app.doc.layers.map((l) => app.registry.get(l.id)).find((e) => e.id === siteLayer && isSource(e));
      if (entry) {
        const page = await app.client.features(entry.source.url, { where: entry.source.where, geometry: point,
          outFields: outFields(entry, displayFields(entry)), precision: 6 });
        const feature = page.features[0];
        if (feature) {
          const row = toRow(feature.properties, entry);
          setSite({ kind: 'feature', layer: entry.id, atlas_id: row.atlas_id, geometry: roundGeometry(feature.geometry) },
            candidate.address.split(',')[0]);
          return;
        }
      }
      setSite({ kind: 'drawn', geometry: point }, candidate.address.split(',')[0]);
    } else panels.renderAll(app);
  },
  setDistance(feet) {
    if (!Number.isFinite(feet) || feet < 1 || feet > 5280) return;
    update((doc) => { if (doc.screenings[0]) doc.screenings[0].distance_ft = feet; else app.pendingDistance = feet; });
  },
  setTargets(ids) {
    update((doc) => { if (doc.screenings[0]) doc.screenings[0].targets = ids; });
  },
  clearScreening() {
    app.results = null;
    update((doc) => { doc.screenings = []; });
  },
  runScreening: () => runScreeningNow(),
  toggleHits() {
    app.ui.showHits = app.ui.showHits === false;
    syncOverlays();
    panels.renderAnalysis(app);
  },
  downloadResults(format) {
    const screening = app.doc.screenings[0];
    if (!app.results || !screening) return;
    const context = resultsContext(screening);
    const name = screening.source.label || TEXT.screening.drawnSite;
    if (format === 'csv') download(screeningFileName(name, 'csv'), resultsCsv(app.results, screening, context), 'text/csv');
    else download(screeningFileName(name, 'geojson'), JSON.stringify(resultsGeojson(app.results, screening, context)), 'application/geo+json');
    countExport(app.registry.catalog.counter_url, format === 'csv' ? 'csv' : 'geojson', true, app.pilot);
  },
  // A template (D-069): its layers and presets, then, when it names targets, a screening whose site comes next.
  async applyTemplate(key) {
    const template = app.registry.catalog.templates?.[key];
    if (!template) return;
    const layers = [];
    for (const item of template.layers) {
      const existing = app.doc.layers.find((l) => l.id === item.id);
      if (existing) { layers.push(existing); continue; }
      const entry = app.registry.get(item.id);
      const layer = layerDoc(item.id, entry);
      layer.style.preset = item.preset;
      try { layer.style.overrides = await resolveStyle(item.id, layer.style); } catch { /* preset colors */ }
      layers.push(layer);
    }
    const others = app.doc.layers.filter((l) => !layers.some((t) => t.id === l.id));
    const buffered = Boolean(template.targets?.length);
    app.pendingDistance = buffered ? template.distance_ft : null;
    app.pendingTargets = buffered ? template.targets : null;
    app.ui.screening = buffered;
    app.ui.templateTitle = template.title;
    if (buffered) app.ui.tool = 'screening';
    await update((doc) => {
      doc.layers = [...layers, ...others].slice(0, MAX_LAYERS);
      doc.layout = { ...doc.layout, ...(template.layout ?? {}) };
    });
    if (buffered) actions.startSelect();
  },

  // Export
  setText(key, value) {
    update((doc) => { if (key === 'notes') doc.layout.notes = value; else doc[key] = value; }, { render: false });
  },
  setLayout(patch) {
    update((doc) => Object.assign(doc.layout, patch));
  },
  print: () => exportImage('pdf'),
  // Preview the print layout, then print it without drawing the map again.
  async previewPrint() {
    panels.flash(app, TEXT.export.preparing);
    try {
      const { root, page, complete } = await renderPrintRoot(imageContext());
      panels.flash(app, complete ? '' : TEXT.export.printTimeout);
      panels.showPrintPreview(app, root, page, async () => {
        await printRoot(root, page);
        countExport(app.registry.catalog.counter_url, 'pdf', true, app.pilot);
      });
    } catch (error) {
      panels.flash(app, String(error.message ?? error));
    }
  },
  png: () => exportImage('png'),
  async copyLink() {
    const hash = await encodeDoc(docForSave());
    const link = linkFor(location.href.split('?')[0], hash);
    const ok = await copyText(link);
    panels.flash(app, ok ? (isLong(link) ? `${TEXT.export.linkCopied}. ${TEXT.export.longLink}` : TEXT.export.linkCopied) : link);
    countExport(app.registry.catalog.counter_url, 'link', ok, app.pilot);
  },
  saveFile() {
    const doc = docForSave();
    download(`${slug(doc.title || TEXT.export.untitled)}.map.json`, `${JSON.stringify(doc, null, 2)}\n`, 'application/json');
    countExport(app.registry.catalog.counter_url, 'map_file', true, app.pilot);
  },
  async openFile(file) {
    try {
      await openDoc(JSON.parse(await file.text()), { fit: !true });
    } catch {
      panels.flash(app, TEXT.problems.notDocument());
    }
  },
  async copyEmbed() {
    const doc = docForSave();
    const ok = await copyText(embedSnippet(location.href, await encodeDoc(doc), doc.title));
    panels.flash(app, ok ? TEXT.export.embedCopied : embedSnippet(location.href, await encodeDoc(doc), doc.title));
    countExport(app.registry.catalog.counter_url, 'embed', ok, app.pilot);
  },
  exportData: (id, format) => exportData(id, format),
  zoomTo: (id, row) => zoomToRow(id, row),
  loadMoreRows: () => loadTablePage(),
  sortTable: (field) => sortTable(field),
};

function setSite(source, label) {
  app.mode = null;
  app.ui.changeSite = false;
  app.draw?.stop();
  app.map.map.getCanvas().style.cursor = '';
  const existing = app.doc.screenings[0];
  const targets = existing?.targets ?? app.pendingTargets
    ?? app.doc.layers.map((l) => app.registry.get(l.id)).filter((e) => isTarget(e) && !(source.kind === 'feature' && e.id === source.layer)).map((e) => e.id);
  const distance = existing?.distance_ft ?? app.pendingDistance ?? 300;
  app.pendingTargets = null;
  app.pendingDistance = null;
  app.results = null;
  const screening = app.ui.screening;
  update((doc) => {
    doc.screenings = [{ id: existing?.id ?? nextScreeningId(doc), source: { ...source, ...(source.kind === 'feature' ? { label: label ?? '' } : {}),
      geometry: roundGeometry(source.geometry) }, distance_ft: distance, targets: targets.filter((t) => doc.layers.some((l) => l.id === t)),
    label: TEXT.screening.ringLabel(distance) }];
    if (screening && !doc.title) doc.title = TEXT.screening.templateTitle(app.ui.templateTitle ?? '', label || TEXT.screening.drawnSite);
    if (screening && !doc.subtitle) doc.subtitle = areaName();
  }).then(() => { if (screening) { app.ui.screening = false; runScreeningNow(); } });
}

// Select mode (D-067): any feature of a bufferable layer can be a screening's site (not boundaries, D-074).
// When a click finds several, ask which.
async function selectAt(point, lngLat) {
  const seen = new Set();
  const hits = app.map.featuresAt(point, 5).filter((hit) => {
    const key = `${hit.key}|${hit.properties.atlas_id}`;
    const entry = app.registry.get(hit.key);
    if (!entry || !isSource(entry) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!hits.length) return;
  if (hits.length === 1) { chooseSite(hits[0]); return; }
  app.map.showPopup(lngLat, panels.siteChooser(app, hits.slice(0, 8), (hit) => { app.map.closePopup(); chooseSite(hit); }));
}

async function chooseSite(hit) {
  const entry = app.registry.get(hit.key);
  const rt = runtime(entry.id);
  const types = await typesFor(rt);
  const id = hit.properties.atlas_id;
  const value = types[entry.source.id_field] === 'number' ? Number(id) : quote(id);
  const page = await app.client.features(entry.source.url, { where: `${entry.source.id_field} = ${value}`,
    outFields: outFields(entry, displayFields(entry)), precision: 6 });
  const feature = page.features[0];
  if (!feature) return;
  const row = toRow(feature.properties, entry);
  // An unnamed site is called by its kind ("Open space area"), not by its ID, which may be a long code.
  const name = row[entry.label_field] || `${entry.noun.singular[0].toUpperCase()}${entry.noun.singular.slice(1)}`;
  setSite({ kind: 'feature', layer: entry.id, atlas_id: row.atlas_id, geometry: feature.geometry }, String(name));
}

// ---- Buffer layers (D-076) ----

// Layers on the map that can be buffered: not boundaries (D-074).
function bufferableLayers() {
  return app.doc.layers.map((l) => app.registry.get(l.id)).filter((entry) => entry && isSource(entry));
}
app.bufferableLayers = bufferableLayers;
app.bufferKey = (buffer) => outputKey(buffer, areaKey());

function bufferById(id) {
  return app.doc.buffers.find((buffer) => buffer.id === id) ?? null;
}

function areaKey() {
  const { level, code } = effectiveArea(app.doc.area);
  return `${level}/${code}`;
}

// The where clause and area outline that select a buffer's input features.
async function bufferQuery(buffer) {
  const rt = runtime(buffer.layer);
  const { entry } = rt;
  const types = await typesFor(rt);
  if (buffer.select === 'picked') {
    const ids = buffer.picked.map((id) => (types[entry.source.id_field] === 'number' ? Number(id) : quote(id)));
    return { where: joinWhere(entry.source.where, `${entry.source.id_field} IN (${ids.join(', ')})`), geometry: null };
  }
  const filters = buffer.select === 'filter' ? buffer.filters : [];
  // Copy layers are sliced by place tags on screen; their sources are asked for the same area by its outline.
  if (entry.access === 'copy') {
    const area = effectiveArea(app.doc.area);
    return { where: joinWhere(entry.source.where, conditionsWhere(entry, filters, types)),
      geometry: area.level === 'state' ? null : await outlineOf(area) };
  }
  const q = await queryFor(rt, { filters });
  return { where: q.where, geometry: q.geometry };
}

const countKey = (buffer) => JSON.stringify([buffer.layer, buffer.select, buffer.select === 'filter' ? buffer.filters : [],
  buffer.select === 'picked' ? buffer.picked : [], areaKey()]);

// How many features each buffer would take, shown beside its choices.
const countInputs = debounce(async () => {
  for (const buffer of app.doc.buffers) {
    const key = countKey(buffer);
    if (app.inputCounts.get(buffer.id)?.key === key) continue;
    app.inputCounts.set(buffer.id, { key, count: null });
    let count = null;
    try {
      if (buffer.select === 'picked') count = buffer.picked.length;
      else count = await app.client.count(runtime(buffer.layer).entry.source.url, await bufferQuery(buffer));
    } catch {
      count = null;
    }
    if (app.inputCounts.get(buffer.id)?.key === key) app.inputCounts.set(buffer.id, { key, count });
    panels.renderBufferCount(app, buffer.id);
  }
}, 300);

// Run the buffer step off the page (buffer-worker.js), or on the page where module workers are not available.
function geoprocess(job, { signal, onProgress }) {
  const onPage = () => loadJsts().then((jsts) => bufferFeatures(jsts, job.features, { ...job, onProgress }));
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./buffer-worker.js', import.meta.url), { type: 'module' });
    } catch {
      onPage().then(resolve, reject);
      return;
    }
    signal.addEventListener('abort', () => { worker.terminate(); reject(Object.assign(new Error('cancelled'), { kind: 'cancelled' })); }, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { onProgress(data.done, data.total); return; }
      worker.terminate();
      if (data.type === 'done') resolve(data.result);
      else reject(new Error(data.message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      if (!signal.aborted) onPage().then(resolve, reject);
    };
    worker.postMessage(job);
  });
}

// Read the input features, buffer them, and draw the result as map layers.
async function runBufferLayer(id) {
  const buffer = bufferById(id);
  if (!buffer) return;
  app.bufferJobs.get(id)?.abort.abort();
  const key = outputKey(buffer, areaKey());
  const job = { key, abort: new AbortController(), phase: 'reading', read: 0, done: 0, total: 0 };
  app.bufferJobs.set(id, job);
  app.bufferErrors.delete(id);
  panels.renderAnalysis(app);
  panels.renderLayers(app);
  const { entry } = runtime(buffer.layer);
  const fail = (kind) => Object.assign(new Error(kind), { kind });
  try {
    if (buffer.select === 'picked' && !buffer.picked.length) throw fail('nothing');
    const q = await bufferQuery(buffer);
    // Too many to buffer: say so before reading them.
    if (buffer.select !== 'picked' && await app.client.count(entry.source.url, q) > MAX_BUFFER_FEATURES) throw fail('tooMany');
    const label = entry.fields.find((field) => field.name === entry.label_field);
    const page = await app.client.allFeatures(entry.source.url, { where: q.where, geometry: q.geometry, precision: 6, signal: job.abort.signal,
      outFields: [...new Set([entry.source.id_field, label?.source].filter(Boolean))] },
    MAX_BUFFER_FEATURES + 1, (read) => { job.read = read; panels.renderBufferProgress(app, id); });
    if (page.features.length > MAX_BUFFER_FEATURES) throw fail('tooMany');
    const inputs = page.features.filter((feature) => feature.geometry).map((feature) => {
      const row = toRow(feature.properties ?? {}, entry);
      return { type: 'Feature', geometry: feature.geometry, properties: { atlas_id: row.atlas_id, name: row[entry.label_field] ?? '' } };
    });
    if (!inputs.length) throw fail('nothing');
    job.phase = 'running';
    const distances = buffer.distances.map((ring) => toMeters(ring.value, buffer.unit));
    const result = await geoprocess({ features: inputs, distances, dissolve: buffer.dissolve }, { signal: job.abort.signal,
      onProgress: (done, total) => { job.done = done; job.total = total; panels.renderBufferProgress(app, id); } });
    if (app.bufferJobs.get(id) !== job) return;
    app.outputs.set(id, { key, features: result.features, skipped: result.skipped, inputs: inputs.length, layer: buffer.layer,
      unit: buffer.unit, distances: buffer.distances.map((ring) => ring.value), dissolve: buffer.dissolve,
      version: (app.outputs.get(id)?.version ?? 0) + 1 });
  } catch (error) {
    if (app.bufferJobs.get(id) !== job) return;
    if (error.kind !== 'cancelled') app.bufferErrors.set(id, { key, kind: ['tooMany', 'nothing'].includes(error.kind) ? error.kind : 'failed' });
  }
  if (app.bufferJobs.get(id) === job) app.bufferJobs.delete(id);
  syncMapLayers();
  panels.renderAnalysis(app);
  panels.renderLayers(app);
}

// Once a buffer has run, a change to it (or to the area) runs it again (D-076).
const autoRunBuffers = debounce(() => {
  const area = areaKey();
  for (const buffer of app.doc.buffers) {
    if (!app.bufferRequested.has(buffer.id)) continue;
    const key = outputKey(buffer, area);
    if (app.outputs.get(buffer.id)?.key === key || app.bufferJobs.get(buffer.id)?.key === key || app.bufferErrors.get(buffer.id)?.key === key) continue;
    runBufferLayer(buffer.id);
  }
}, 700);

function forgetRemovedBuffers() {
  for (const map of [app.outputs, app.bufferErrors, app.inputCounts]) {
    for (const id of [...map.keys()]) if (!bufferById(id)) map.delete(id);
  }
  for (const [id, job] of [...app.bufferJobs]) if (!bufferById(id)) { job.abort.abort(); app.bufferJobs.delete(id); }
  for (const id of [...app.bufferRequested]) if (!bufferById(id)) app.bufferRequested.delete(id);
}

function showPicks() {
  app.map?.setOverlay('selected', { type: 'FeatureCollection',
    features: [...app.pickShapes.values()].map((geometry) => ({ type: 'Feature', properties: {}, geometry })) });
}

// Pick mode: a click adds or removes a feature of the buffer's layer.
function pickAt(point) {
  const buffer = bufferById(app.ui.pickFor);
  if (!buffer) return;
  const hit = app.map.featuresAt(point, 5).find((h) => h.key === buffer.layer && h.properties.atlas_id !== undefined);
  if (!hit) return;
  const id = String(hit.properties.atlas_id);
  const removing = buffer.picked.includes(id);
  if (!removing && buffer.picked.length >= MAX_PICKED) return;
  if (removing) app.pickShapes.delete(id);
  else app.pickShapes.set(id, hit.geometry);
  showPicks();
  update((doc) => {
    const target = doc.buffers.find((b) => b.id === buffer.id);
    target.select = 'picked';
    target.picked = removing ? target.picked.filter((p) => p !== id) : [...target.picked, id];
  });
}

async function runScreeningNow() {
  const screening = app.doc.screenings[0];
  if (!screening) return;
  const entries = screening.targets.map((id) => app.registry.get(id)).filter(Boolean);
  app.ui.running = true;
  panels.renderAnalysis(app);
  try {
    const turf = await loadTurf();
    const results = await runScreening({ client: app.client, turf, buffer: screening, entries, layerDocs: app.doc.layers });
    results.key = JSON.stringify([screening.source.geometry, screening.distance_ft]);
    app.results = results;
  } finally {
    app.ui.running = false;
  }
  syncOverlays();
  panels.renderAnalysis(app);
}

function resultsContext(screening) {
  return {
    label: TEXT.screeningLabel(dataDates()),
    siteLine: `${TEXT.screening.site}: ${screening.source.label || TEXT.screening.drawnSite}; ${screening.distance_ft} ft; ${new Date().toISOString().slice(0, 10)}`,
    credits: app.registry.credits(screening.targets),
    headers: { ...TEXT.screening.columns, site: TEXT.screening.siteMark, details: TEXT.screening.results },
  };
}

// "Sep 27, 2026 (live sources); Wetlands tiles Sep 27, 2026"
function dataDates() {
  const parts = [`${formatDate(new Date().toISOString().slice(0, 10))} (live)`];
  for (const layer of app.doc.layers) {
    const entry = app.registry.get(layer.id);
    if (entry?.access === 'hybrid' && entry.tiles?.built_at) parts.push(`${entry.title} ${TEXT.export.built(formatDate(entry.tiles.built_at.slice(0, 10)))}`);
    if (entry?.access === 'copy' && entry.fetched_at) parts.push(`${entry.title} ${formatDate(entry.fetched_at.slice(0, 10))}`);
  }
  return parts.join('; ');
}

// The document as saved and shared: credits recomputed, data versions recorded, the current view.
function docForSave() {
  const doc = structuredClone(app.doc);
  if (app.map) doc.view = app.map.view();
  doc.credits = app.registry.credits(doc.layers.map((l) => l.id));
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  doc.source_versions = Object.fromEntries(doc.layers.map((layer) => {
    const entry = app.registry.get(layer.id);
    const version = { mode: entry.access };
    if (entry.access !== 'copy') version.queried_at = now;
    if (entry.tiles?.built_at) version.tiles_built = entry.tiles.built_at.slice(0, 10);
    if (entry.fetched_at) version.fetched_at = entry.fetched_at.slice(0, 10);
    return [layer.id, version];
  }));
  return doc;
}

// ---- Exports ----

// "NJDEP" from "New Jersey Department of Environmental Protection (NJDEP), ..."; other publishers as they are.
function shortPublisher(publisher) {
  return /\(([A-Z][A-Za-z.]+)\)/.exec(publisher)?.[1] ?? publisher.split(',')[0];
}

// What an export will carry, in one line (the owner's review, 2026-09-27).
function exportSummary() {
  const { doc } = app;
  const screening = doc.screenings[0];
  return TEXT.export.summary({
    layers: doc.layers.length,
    buffers: doc.buffers.filter((buffer) => app.outputs.has(buffer.id)).length,
    filters: doc.layers.reduce((n, layer) => n + layer.filters.length, 0),
    screening: screening ? `${screening.distance_ft} ft, ${screening.source.label || TEXT.screening.drawnSite}` : null,
    sources: [...new Set(doc.layers.map((layer) => shortPublisher(app.registry.get(layer.id).source.publisher)))],
    when: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  });
}
app.exportSummary = exportSummary;

function legendGroups() {
  const groups = [];
  for (const layer of app.doc.layers) {
    const entry = app.registry.get(layer.id);
    if (layer.visible) {
      const { style } = presetStyle(entry, layer.style);
      const values = runtime(layer.id).stats.values?.[style.field]?.map((v) => v.value) ?? null;
      const title = entry.coverage ? TEXT.layers.partialTitle(entry.legend.title) : entry.legend.title;
      groups.push({ title, rows: legendFor(entry, style, { text: { other: TEXT.style.other }, values }) });
    }
    // Buffer layers follow the layer they were made from, as on the map (D-077).
    for (const buffer of app.doc.buffers) {
      if (buffer.layer !== layer.id || !buffer.visible || !app.outputs.has(buffer.id)) continue;
      groups.push({ title: bufferName(buffer, entry, TEXT.buffer), rows: bufferLegend(buffer) });
    }
  }
  const screening = app.doc.screenings[0];
  if (screening) {
    groups.push({ title: TEXT.panels.screening, rows: [
      { swatch: { dashed: true, color: '#9A3B26' }, label: TEXT.screening.ringLabel(screening.distance_ft) },
      { swatch: { geometry: screening.source.geometry.type === 'Point' ? 'point' : 'polygon', color: '#0E5A66', fill: true }, label: TEXT.screening.siteMark }] });
  }
  return groups;
}
app.legendGroups = legendGroups;

function failedLayers() {
  return app.doc.layers.filter((l) => runtime(l.id).status === 'error').map((l) => app.registry.get(l.id).title);
}

// Everything a print or PNG needs, drawn from the current map.
function imageContext(failed = failedLayers()) {
  const screening = app.doc.screenings[0];
  const doc = docForSave();
  const basemap = basemapCredit(doc.basemap, doc.basemap_mode);
  return {
    doc, text: TEXT, bounds: app.map.bounds(), legend: legendGroups(), dates: dataDates(), leftOut: failed,
    credits: [...doc.credits, ...(basemap ? [TEXT.basemaps.credits[basemap]] : [])],
    label: screening ? TEXT.screeningLabel(dataDates()) : null,
    notes: [...new Set([...(screening && app.results ? resultNotes(app.results) : []),
      ...doc.layers.filter((l) => l.visible).flatMap((l) => notesOf(app.registry.get(l.id), 'print')),
      ...app.doc.buffers.filter((b) => b.visible && app.outputs.has(b.id)).map((b) => presetOf(b, app.registry.get(b.layer))?.note)
        .filter(Boolean)])],
    fill: (printMap) => {
      printMap.syncLayers(stack().filter((item) => !failed.includes(app.registry.get(item.key)?.title)));
      for (const layer of app.doc.layers) {
        const rt = runtime(layer.id);
        if (rt.loader) printMap.setData(layer.id, rt.loader.lastData);
      }
      printMap.setArea(app.areaGeometry, app.doc.mask);
      if (screening) {
        printMap.setOverlay('sites', { type: 'Feature', properties: {}, geometry: screening.source.geometry });
        if (app.ring) printMap.setOverlay('rings', app.ring);
      }
    },
  };
}

async function exportImage(kind) {
  const failed = failedLayers();
  if (failed.length && !window.confirm(TEXT.export.leaveOut(failed.join(', ')))) return;
  panels.flash(app, TEXT.export.preparing);
  const ctx = imageContext(failed);
  const { doc } = ctx;
  try {
    if (kind === 'pdf') {
      const complete = await printMap(ctx);
      if (!complete) panels.flash(app, TEXT.export.printTimeout);
      countExport(app.registry.catalog.counter_url, 'pdf', true, app.pilot);
    } else {
      const blob = await pngMap(ctx);
      download(`${slug(doc.title || TEXT.export.untitled)}.png`, blob);
      countExport(app.registry.catalog.counter_url, 'png', true, app.pilot);
    }
    panels.flash(app, '');
  } catch (error) {
    panels.flash(app, error.tainted ? TEXT.export.tainted('A layer') : String(error.message ?? error));
    countExport(app.registry.catalog.counter_url, kind, false, app.pilot);
  }
}

// A layer's features in the area, cut at the area's edge when its clip_mode is 'cut' (§4.8).
async function layerData(id) {
  const layer = app.doc.layers.find((l) => l.id === id);
  const rt = runtime(id);
  const { entry } = rt;
  const q = await queryFor(rt, layer);
  // Copy layers are sliced by their place tags on screen; their exports ask the source for the same area.
  const area = q.area;
  const geometry = entry.access === 'copy' && area.level !== 'state' ? await outlineOf(area) : q.geometry;
  const where = entry.access === 'copy' ? joinWhere(entry.source.where, conditionsWhere(entry, layer.filters, await typesFor(rt))) : q.where;
  const turf = entry.clip_mode === 'cut' ? await loadTurf() : null;
  const clipTo = area.level === 'state' ? null : await outlineOf(area);
  return fetchLayerData({ client: app.client, entry, where, geometry, areaGeometry: clipTo, turf });
}

async function exportData(id, format) {
  const rt = runtime(id);
  const { entry } = rt;
  panels.flash(app, TEXT.export.preparing);
  try {
    const { features, complete } = await layerData(id);
    if (!complete) {
      panels.flash(app, TEXT.export.tooMany('50,000', entry.noun.plural, entry.source.publisher));
      return;
    }
    const preface = [`${entry.title}: ${areaName()}`, entry.license.attribution, `${TEXT.export.dataDates}: ${dataDates()}`];
    // Copy and hybrid layers are drawn from our copies but exported from the source (D-055, D-072).
    if (entry.access !== 'live') preface.push(TEXT.export.liveNote(entry.source.publisher, new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')));
    if (app.doc.screenings.length) preface.push(TEXT.screeningLabel(dataDates()));
    preface.push(...notesOf(entry, 'export'));
    const base = `${entry.id}_${slug(areaName())}_${new Date().toISOString().slice(0, 10)}`;
    if (format === 'csv') download(`${base}.csv`, dataCsv(entry, features, preface), 'text/csv');
    else download(`${base}.geojson`, JSON.stringify(dataGeojson(entry, features, preface)), 'application/geo+json');
    countExport(app.registry.catalog.counter_url, format, true, app.pilot);
    panels.flash(app, '');
  } catch (error) {
    panels.flash(app, `${entry.title}: ${TEXT.layers.failed}`);
    countExport(app.registry.catalog.counter_url, format, false, app.pilot);
  }
}

// ---- Table ----

async function openTable(id) {
  app.table = { id, rows: [], offset: 0, sort: null, done: false };
  await loadTablePage();
}

function closeTable() {
  app.table = null;
  panels.renderTable(app);
}

async function loadTablePage() {
  const table = app.table;
  if (!table) return;
  const layer = app.doc.layers.find((l) => l.id === table.id);
  const rt = runtime(table.id);
  const { entry } = rt;
  const size = 200;
  table.loading = true;
  panels.renderTable(app);
  try {
    if (entry.access === 'copy') {
      const rows = await loadRows(entry, copyFile(entry));
      let matched = rows.filter(toPredicate(cleanState({ place: copyPlace(), conditions: layer.filters }, entry.fields)));
      if (table.sort) matched = [...matched].sort((a, b) => String(a[table.sort] ?? '').localeCompare(String(b[table.sort] ?? ''), 'en', { numeric: true }));
      table.rows = matched.slice(0, table.offset + size);
      table.done = table.rows.length >= matched.length;
    } else {
      const q = await queryFor(rt, layer);
      const field = table.sort ? entry.fields.find((f) => f.name === table.sort) : null;
      const page = await app.client.features(entry.source.url, { where: q.where, geometry: q.geometry, returnGeometry: false,
        outFields: outFields(entry, displayFields(entry)), num: size, offset: table.offset, orderBy: field ? field.source : undefined });
      table.rows = [...table.rows, ...page.features.map((f) => toRow(f.properties ?? {}, entry))];
      table.done = page.features.length < size && !page.exceeded;
    }
    table.offset += size;
  } catch (error) {
    table.error = error;
  }
  table.loading = false;
  panels.renderTable(app);
}

function sortTable(field) {
  if (!app.table) return;
  app.table = { ...app.table, rows: [], offset: 0, sort: field, done: false };
  loadTablePage();
}

async function zoomToRow(id, row) {
  const entry = app.registry.get(id);
  const rt = runtime(id);
  const types = await typesFor(rt);
  const value = types[entry.source.id_field] === 'number' ? Number(row.atlas_id) : quote(row.atlas_id);
  const page = await app.client.features(entry.source.url, { where: `${entry.source.id_field} = ${value}`, outFields: [entry.source.id_field], precision: 6 });
  const geometry = page.features[0]?.geometry;
  if (!geometry) return;
  app.map.setOverlay('selected', { type: 'Feature', properties: {}, geometry });
  app.map.fitBounds(bboxOf(geometry), entry.geometry === 'point' ? 17 : 18);
}

// ---- Opening documents and links ----

async function openDoc(input, { fit = false } = {}) {
  const bufferable = new Set(app.registry.layers.filter(isSource).map((entry) => entry.id));
  const { doc, problems, notices } = validate(input, app.registry.ids(), bufferable);
  if (!doc) {
    panels.flash(app, problems.map((p) => TEXT.problems[p.code](p.detail)).join(' '));
    return false;
  }
  await Promise.all(pickerLevels(doc.area.level).map((level) => unitsNow(level).catch(() => [])));
  app.results = null;
  app.notices = notices.map((n) => TEXT.notices[n.code]?.(n.detail) ?? n.code);
  await setDoc(doc, { fit: fit && !doc.view });
  if (doc.view && app.map) app.map.setView(doc.view);
  if (doc.screenings.length) runScreeningNow();
  for (const buffer of doc.buffers) actions.runBuffer(buffer.id); // a document keeps the recipe, not the shapes
  return true;
}

// ---- Startup ----

async function boot() {
  document.title = TEXT.appTitle;
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!params.has('m') && !params.has('m0') && (params.has('b') || params.has('layer'))) {
    location.replace(`atlas/${location.hash}`); // links made by the atlas open the atlas
    return;
  }
  if (app.embed) document.body.classList.add('embed');
  if (new URLSearchParams(location.search).has('debug')) window.studio = { app, actions, setDoc, update, imageContext, layerData, selectAt, chooseSite };
  app.pilot = rememberPilot();
  app.client = createClient();
  panels.renderShell(app, actions);
  const [catalog, places] = await Promise.all([getJson('studio.json'), getJson('places.json')]);
  app.registry = createRegistry(catalog);
  app.levels = places.levels;
  await Promise.all(['county', 'municipality'].map((level) => unitsNow(level).catch(() => [])));
  app.health = await loadHealth(dataUrl('health.json'));
  app.areaName = areaName;
  app.map = await createStudioMap($('map'), { basemap: app.doc.basemap, basemapMode: app.doc.basemap_mode, text: TEXT.basemaps,
    onBasemap: (name) => actions.setBasemap(name), onBasemapMode: (mode) => actions.setBasemapMode(mode) });
  app.draw = new DrawTool(app.map, {
    onDone: (shape) => setSite({ kind: 'drawn', geometry: shape }, TEXT.screening.drawnSite),
    onCancel: () => panels.renderAnalysis(app),
  });
  app.map.map.on('click', (event) => {
    if (app.draw.active()) return;
    if (app.mode === 'select') { selectAt(event.point, event.lngLat); return; }
    if (app.mode === 'pick') { pickAt(event.point); return; }
    const hit = app.map.featuresAt(event.point)[0];
    if (!hit) { app.map.closePopup(); return; }
    const buffer = String(hit.key).startsWith('buffer:') ? bufferById(hit.key.slice(7)) : null;
    const content = buffer ? panels.bufferPopup(app, buffer, hit.properties) : panels.popup(app, app.registry.get(hit.key), hit.properties);
    app.map.showPopup(event.lngLat, content);
  });
  app.map.map.on('mousemove', (event) => {
    if (app.draw.active()) return;
    const hit = app.map.featuresAt(event.point).length > 0;
    app.map.map.getCanvas().style.cursor = app.mode === 'select' || app.mode === 'pick' || hit ? 'pointer' : '';
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (app.mode === 'pick' || app.mode === 'select')) actions.cancelMode();
  });
  const moved = debounce(() => {
    for (const layer of app.doc.layers) {
      runtime(layer.id).loader?.update(app.map.bounds(), app.map.zoom());
      panels.renderLayerStatus(app, layer.id);
    }
    panels.renderLegend(app);
    scheduleHash();
  }, 150);
  app.map.map.on('moveend', moved);
  window.addEventListener('online', () => panels.renderOffline(app));
  window.addEventListener('offline', () => panels.renderOffline(app));
  let opened = false;
  try {
    const input = await decodeHash(location.hash);
    if (input) opened = await openDoc(input, { fit: true });
  } catch {
    panels.flash(app, TEXT.notices.badLink);
  }
  if (!opened) await setDoc(app.doc);
  panels.renderOffline(app);
}

boot().catch((error) => panels.fatal(app, error));
export { app };
