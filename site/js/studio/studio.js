// NJ Atlas Studio: one map document drives the panels, the map, the link, the file and the print (D-034).
// setDoc(next) is the only way the document changes. Panels are drawn by panels.js.
import { TEXT } from './text.js';
import { createRegistry, drawsFromTiles, displayFields, isSource, isTarget, outFields } from './registry.js';
import { createClient } from './live.js';
import { LiveLayer } from './tiles.js';
import { createStudioMap } from './mapview.js';
import { DrawTool } from './draw.js';
import { createDoc, layerDoc, LEVEL_KEY, MAX_LAYERS, nextBufferId, validate } from './mapdoc.js';
import { decodeHash, embedSnippet, encodeDoc, isLong, linkFor } from './share.js';
import { areaWhere, conditionsWhere, joinWhere, quote } from './sql.js';
import { layerSpecs, legendFor, presetStyle, resolve } from './style.js';
import { toRow } from './transform.js';
import { loadTurf } from './turf.js';
import { hasParcels, ringFor, resultsCsv, resultsGeojson, runBuffer, screeningFileName } from './buffer.js';
import { dataCsv, dataGeojson, fetchLayerData, pngMap, printMap } from './export.js';
import { loadHealth } from './health.js';
import { countExport, rememberPilot } from './counter.js';
import { bboxOf, roundGeometry } from './geo.js';
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
  mode: null, // null | 'select'
  results: null,
  ring: null,
  table: null,
  ui: { open: {}, addOpen: false, addQuery: '', candidates: null, candidatesFor: null, status: '' },
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

function areaForQuery() {
  const { level } = effectiveArea(app.doc.area);
  return { ...app.doc.area, level };
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

// { whereArea, where, geometry }: the area as a where clause or an outline, plus the layer's filters.
async function queryFor(rt, layer) {
  const types = await typesFor(rt);
  const area = areaForQuery();
  const county = area.county_fips ? unitName('county', area.county_fips) : null;
  const slice = areaWhere(rt.entry, area, { county });
  const geometry = slice.outline ? app.areaGeometry : null;
  const whereArea = joinWhere(rt.entry.source.where, slice.where);
  const where = joinWhere(whereArea, conditionsWhere(rt.entry, layer.filters, types));
  return { whereArea, where, geometry };
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
      const key = JSON.stringify([q.where, q.whereArea, Boolean(q.geometry), effectiveArea(app.doc.area)]);
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
  if (app.ui.open[id]?.filter && !rt.stats.loaded) loadStats(id);
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
    return;
  }
  const layer = app.doc.layers.find((l) => l.id === id);
  const q = await queryFor(rt, { ...layer, filters: [] });
  const values = {};
  const ranges = {};
  await Promise.all(entry.fields.filter((field) => field.filter !== 'none').map(async (field) => {
    try {
      if (field.filter === 'checklist') {
        const counts = await app.client.groupCounts(entry.source.url, field.source, { where: q.whereArea, geometry: q.geometry });
        const merged = new Map();
        for (const item of counts) {
          const value = toRow({ [field.source]: item.value }, { source: { id_field: '_' }, fields: [field] })[field.name];
          merged.set(value, (merged.get(value) ?? 0) + item.count);
        }
        values[field.name] = [...merged].map(([value, count]) => ({ value, count }))
          .sort((a, b) => (a.value === null) - (b.value === null) || String(a.value).localeCompare(String(b.value), 'en', { numeric: true }));
      } else if (field.filter === 'range' && field.type === 'number' && !field.transform) {
        ranges[field.name] = await app.client.minMax(entry.source.url, field.source, { where: q.whereArea, geometry: q.geometry });
      }
    } catch {
      // a field the service cannot count leaves its control without counts
    }
  }));
  rt.stats = { values, ranges, loaded: true };
  panels.renderLayer(app, id);
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

function stack() {
  const items = [];
  for (const layer of [...app.doc.layers].reverse()) {
    if (!layer.visible) continue;
    const rt = runtime(layer.id);
    const { entry } = rt;
    const { style } = presetStyle(entry, layer.style);
    const fromTiles = drawsFromTiles(entry);
    const source = fromTiles
      ? { type: 'vector', url: `pmtiles://${tileUrl(entry)}`, attribution: entry.license.attribution }
      : { type: 'geojson', data: rt.loader?.lastData ?? EMPTY, attribution: entry.license.attribution };
    items.push({
      key: layer.id, source, sourceSignature: fromTiles ? tileUrl(entry) : 'geojson',
      specs: layerSpecs(entry, style, { id: 'l', source: 'x', sourceLayer: fromTiles ? entry.id : null,
        filter: fromTiles ? tileFilter(entry, layer) : null, opacity: layer.opacity }),
    });
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
  const buffer = app.doc.buffers[0];
  if (!buffer) {
    app.ring = null;
    app.map.setOverlay('rings', EMPTY);
    app.map.setOverlay('sites', EMPTY);
    app.map.setOverlay('hits', EMPTY);
    return;
  }
  app.map.setOverlay('sites', { type: 'Feature', properties: {}, geometry: buffer.source.geometry });
  const key = JSON.stringify([buffer.source.geometry, buffer.distance_ft]);
  if (app.ringKey !== key) {
    app.ringKey = key;
    const turf = await loadTurf();
    app.ring = await ringFor(turf, buffer.source.geometry, buffer.distance_ft);
  }
  app.map.setOverlay('rings', app.ring);
  const current = app.results?.bufferId === buffer.id && app.results.key === key;
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
  if (areaChanged && fit) fitArea();
  ensureLoaders(); // layer runtimes exist before the panels draw them
  panels.renderAll(app);
  syncMapLayers();
  syncOverlays();
  for (const layer of next.layers) refreshLayer(layer.id);
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
    app.ui.addOpen = false;
    update((doc) => { doc.layers.unshift(layer); });
  },
  removeLayer(id) {
    update((doc) => {
      doc.layers = doc.layers.filter((l) => l.id !== id);
      for (const buffer of doc.buffers) buffer.targets = buffer.targets.filter((t) => t !== id);
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
  toggleSection(id, section) {
    const open = app.ui.open[id] ?? {};
    app.ui.open[id] = { ...open, [section]: !open[section] };
    if (section === 'filter' && app.ui.open[id].filter && !runtime(id).stats.loaded) loadStats(id);
    if (section === 'table') {
      if (app.ui.open[id].table) openTable(id);
      else closeTable();
    }
    panels.renderLayer(app, id);
  },
  toggleAdd() {
    app.ui.addOpen = !app.ui.addOpen;
    panels.renderLayers(app);
  },
  retry(id) {
    runtime(id).queryKey = null;
    refreshLayer(id);
  },

  // Buffers
  startSelect() {
    app.draw?.stop();
    app.mode = 'select';
    app.map.map.getCanvas().style.cursor = 'pointer';
    panels.renderBuffer(app);
  },
  startDraw(kind) {
    app.mode = null;
    app.draw.start(kind);
    panels.renderBuffer(app);
  },
  cancelMode() {
    app.mode = null;
    app.draw?.stop();
    app.map.map.getCanvas().style.cursor = '';
    panels.renderBuffer(app);
  },
  useCoordinates(text) {
    const match = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
    if (!match) return false;
    let [lat, lng] = [Number(match[1]), Number(match[2])];
    if (lat < 0 && lng > 0) [lat, lng] = [lng, lat];
    if (lat < 38.5 || lat > 41.5 || lng < -75.8 || lng > -73.7) return false;
    setSite({ kind: 'drawn', geometry: { type: 'Point', coordinates: [lng, lat] } }, TEXT.buffer.drawnSite);
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
    panels.renderAll(app);
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
    update((doc) => { if (doc.buffers[0]) doc.buffers[0].distance_ft = feet; else app.pendingDistance = feet; });
  },
  setTargets(ids) {
    update((doc) => { if (doc.buffers[0]) doc.buffers[0].targets = ids; });
  },
  clearBuffer() {
    app.results = null;
    update((doc) => { doc.buffers = []; });
  },
  runBuffer: () => runBufferNow(),
  toggleHits() {
    app.ui.showHits = app.ui.showHits === false;
    syncOverlays();
    panels.renderBuffer(app);
  },
  downloadResults(format) {
    const buffer = app.doc.buffers[0];
    if (!app.results || !buffer) return;
    const context = resultsContext(buffer);
    const name = buffer.source.label || TEXT.buffer.drawnSite;
    if (format === 'csv') download(screeningFileName(name, 'csv'), resultsCsv(app.results, buffer, context), 'text/csv');
    else download(screeningFileName(name, 'geojson'), JSON.stringify(resultsGeojson(app.results, buffer, context)), 'application/geo+json');
    countExport(app.registry.catalog.counter_url, format === 'csv' ? 'csv' : 'geojson', true, app.pilot);
  },
  async startScreening() {
    const template = app.registry.catalog.templates?.site_screening;
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
    app.pendingDistance = template.distance_ft;
    app.pendingTargets = template.targets;
    app.ui.screening = true;
    await update((doc) => {
      doc.layers = [...layers, ...others].slice(0, MAX_LAYERS);
      doc.layout = { ...doc.layout, ...template.layout };
    });
    actions.startSelect();
  },

  // Export
  setText(key, value) {
    update((doc) => { if (key === 'notes') doc.layout.notes = value; else doc[key] = value; }, { render: false });
  },
  setLayout(patch) {
    update((doc) => Object.assign(doc.layout, patch));
  },
  print: () => exportImage('pdf'),
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
  app.draw?.stop();
  app.map.map.getCanvas().style.cursor = '';
  const existing = app.doc.buffers[0];
  const targets = existing?.targets ?? app.pendingTargets
    ?? app.doc.layers.map((l) => app.registry.get(l.id)).filter((e) => isTarget(e) && !(source.kind === 'feature' && e.id === source.layer)).map((e) => e.id);
  const distance = existing?.distance_ft ?? app.pendingDistance ?? 300;
  app.pendingTargets = null;
  app.pendingDistance = null;
  app.results = null;
  const screening = app.ui.screening;
  update((doc) => {
    doc.buffers = [{ id: existing?.id ?? nextBufferId(doc), source: { ...source, ...(source.kind === 'feature' ? { label: label ?? '' } : {}),
      geometry: roundGeometry(source.geometry) }, distance_ft: distance, targets: targets.filter((t) => doc.layers.some((l) => l.id === t)),
    label: TEXT.buffer.ringLabel(distance) }];
    if (screening && !doc.title) doc.title = TEXT.buffer.templateTitle(label || TEXT.buffer.drawnSite);
    if (screening && !doc.subtitle) doc.subtitle = areaName();
  }).then(() => { if (screening) { app.ui.screening = false; runBufferNow(); } });
}

async function selectAt(point) {
  const hits = app.map.featuresAt(point);
  const hit = hits.find((h) => isSource(app.registry.get(h.key)));
  if (!hit) return;
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
  setSite({ kind: 'feature', layer: entry.id, atlas_id: row.atlas_id, geometry: feature.geometry }, String(row[entry.label_field] ?? row.atlas_id));
}

async function runBufferNow() {
  const buffer = app.doc.buffers[0];
  if (!buffer) return;
  const entries = buffer.targets.map((id) => app.registry.get(id)).filter(Boolean);
  app.ui.running = true;
  panels.renderBuffer(app);
  try {
    const turf = await loadTurf();
    const results = await runBuffer({ client: app.client, turf, buffer, entries, layerDocs: app.doc.layers });
    results.key = JSON.stringify([buffer.source.geometry, buffer.distance_ft]);
    app.results = results;
  } finally {
    app.ui.running = false;
  }
  syncOverlays();
  panels.renderBuffer(app);
}

function resultsContext(buffer) {
  return {
    label: TEXT.screeningLabel(dataDates()),
    parcelLine: TEXT.parcelLine,
    siteLine: `${TEXT.buffer.site}: ${buffer.source.label || TEXT.buffer.drawnSite}; ${buffer.distance_ft} ft; ${new Date().toISOString().slice(0, 10)}`,
    credits: app.registry.credits(buffer.targets),
    headers: { ...TEXT.buffer.columns, site: TEXT.buffer.siteMark, details: TEXT.buffer.results },
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

function legendGroups() {
  const groups = [];
  for (const layer of app.doc.layers) {
    if (!layer.visible) continue;
    const entry = app.registry.get(layer.id);
    const { style } = presetStyle(entry, layer.style);
    const values = runtime(layer.id).stats.values?.[style.field]?.map((v) => v.value) ?? null;
    groups.push({ title: entry.legend.title, rows: legendFor(entry, style, { text: { other: TEXT.style.other }, values }) });
  }
  const buffer = app.doc.buffers[0];
  if (buffer) {
    groups.push({ title: TEXT.panels.buffer, rows: [
      { swatch: { dashed: true, color: '#9A3B26' }, label: TEXT.buffer.ringLabel(buffer.distance_ft) },
      { swatch: { geometry: buffer.source.geometry.type === 'Point' ? 'point' : 'polygon', color: '#0E5A66', fill: true }, label: TEXT.buffer.siteMark }] });
  }
  return groups;
}
app.legendGroups = legendGroups;

function failedLayers() {
  return app.doc.layers.filter((l) => runtime(l.id).status === 'error').map((l) => app.registry.get(l.id).title);
}

// Everything a print or PNG needs, drawn from the current map.
function imageContext(failed = failedLayers()) {
  const buffer = app.doc.buffers[0];
  const doc = docForSave();
  return {
    doc, text: TEXT, bounds: app.map.bounds(), legend: legendGroups(), credits: doc.credits, dates: dataDates(), leftOut: failed,
    label: buffer ? TEXT.screeningLabel(dataDates()) : null,
    parcelLine: (buffer && app.results && hasParcels(app.results)) || doc.layers.some((l) => app.registry.get(l.id).export_note === 'parcels') ? TEXT.parcelLine : null,
    fill: (printMap) => {
      printMap.syncLayers(stack().filter((item) => !failed.includes(app.registry.get(item.key).title)));
      for (const layer of app.doc.layers) {
        const rt = runtime(layer.id);
        if (rt.loader) printMap.setData(layer.id, rt.loader.lastData);
      }
      printMap.setArea(app.areaGeometry, app.doc.mask);
      if (buffer) {
        printMap.setOverlay('sites', { type: 'Feature', properties: {}, geometry: buffer.source.geometry });
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
  const geometry = entry.access === 'copy' && effectiveArea(app.doc.area).level !== 'state' ? app.areaGeometry : q.geometry;
  const where = entry.access === 'copy' ? joinWhere(entry.source.where, conditionsWhere(entry, layer.filters, await typesFor(rt))) : q.where;
  const turf = entry.clip_mode === 'cut' ? await loadTurf() : null;
  const clipTo = effectiveArea(app.doc.area).level === 'state' ? null : app.areaGeometry;
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
    if (app.doc.buffers.length) preface.push(TEXT.screeningLabel(dataDates()));
    if (entry.export_note === 'parcels') preface.push(TEXT.parcelLine);
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
  for (const other of Object.keys(app.ui.open)) if (other !== id && app.ui.open[other]?.table) app.ui.open[other].table = false;
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
  const { doc, problems, notices } = validate(input, app.registry.ids());
  if (!doc) {
    panels.flash(app, problems.map((p) => TEXT.problems[p.code](p.detail)).join(' '));
    return false;
  }
  await Promise.all(pickerLevels(doc.area.level).map((level) => unitsNow(level).catch(() => [])));
  app.results = null;
  app.notices = notices.map((n) => TEXT.notices[n.code]?.(n.detail) ?? n.code);
  await setDoc(doc, { fit: fit && !doc.view });
  if (doc.view && app.map) app.map.setView(doc.view);
  if (doc.buffers.length) runBufferNow();
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
  if (new URLSearchParams(location.search).has('debug')) window.studio = { app, actions, setDoc, update, imageContext, layerData };
  app.pilot = rememberPilot();
  app.client = createClient();
  panels.renderShell(app, actions);
  const [catalog, places] = await Promise.all([getJson('studio.json'), getJson('places.json')]);
  app.registry = createRegistry(catalog);
  app.levels = places.levels;
  await Promise.all(['county', 'municipality'].map((level) => unitsNow(level).catch(() => [])));
  app.health = await loadHealth(dataUrl('health.json'));
  app.map = await createStudioMap($('map'));
  app.draw = new DrawTool(app.map, {
    onDone: (shape) => setSite({ kind: 'drawn', geometry: shape }, TEXT.buffer.drawnSite),
    onCancel: () => panels.renderBuffer(app),
  });
  app.map.map.on('click', (event) => {
    if (app.draw.active()) return;
    if (app.mode === 'select') { selectAt(event.point); return; }
    const hit = app.map.featuresAt(event.point)[0];
    if (hit) app.map.showPopup(event.lngLat, panels.popup(app, app.registry.get(hit.key), hit.properties));
    else app.map.closePopup();
  });
  app.map.map.on('mousemove', (event) => {
    if (app.draw.active()) return;
    const hit = app.map.featuresAt(event.point).length > 0;
    app.map.map.getCanvas().style.cursor = app.mode === 'select' ? 'pointer' : hit ? 'pointer' : '';
  });
  const moved = debounce(() => {
    for (const layer of app.doc.layers) runtime(layer.id).loader?.update(app.map.bounds(), app.map.zoom());
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
