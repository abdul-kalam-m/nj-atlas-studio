// Startup and wiring: load the catalog, build the panels, keep map, count, table and link in step.
import { TEXT } from './text.js';
import * as ui from './ui.js';
import { createMap } from './map.js';
import { loadRows } from './data.js';
import { cleanState, describe, toMapFilter, toPredicate } from './filters.js';
import { decodeHash, emptyState, encodeHash } from './state.js';
import { DEFAULT_BOUNDARY, atLeastLevel, choose, deepestChoice, emptyPlace, levelFor, pickerLevels, shownLayerId,
  trimPlace } from './places.js';
import { formatValue } from './format.js';
import { runSelftest } from './selftest.js';
import { csvDecimals, csvFileName, toCsv } from './csv.js';

const $ = (id) => document.getElementById(id);
const app = { catalog: null, levels: [], units: {}, map: null, mapReady: null, entry: null, partition: null,
  files: null, rows: null, matched: [], state: emptyState(), lastHash: '' };
const HELP_KEY = 'nj-atlas-help-dismissed';
const unitLoads = new Map();
const partitionIndexes = new Map();

async function getJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

// Data addresses carry the catalog's build time (D-090), so a browser never reuses a copy cached before a release.
function versioned(url) {
  const stamp = String(app.catalog?.generated_at ?? '').replace(/\D/g, '');
  return stamp ? `${url}?v=${stamp}` : url;
}

function dataUrl(path) {
  return versioned(new URL(app.catalog.data_base_url + path, document.baseURI).href); // the atlas page sets <base href="../">
}

// A layer's file: next to the site, or at the layer's own base_url (large layers on R2, D-025).
function fileUrl(entry, path) {
  return versioned(new URL((entry.base_url ?? app.catalog.data_base_url) + path, document.baseURI).href);
}

// ---- Large layers, loaded one municipality at a time (§6.9) ----

function loadPartitionIndex(entry) {
  if (!partitionIndexes.has(entry.id)) {
    const promise = getJson(fileUrl(entry, entry.partition.path));
    promise.catch(() => partitionIndexes.delete(entry.id)); // allow "Try again"
    partitionIndexes.set(entry.id, promise);
  }
  return partitionIndexes.get(entry.id);
}

// The files to show: the layer's own, one municipality's (null when none is chosen), or {} when it has none.
async function filesFor(entry, partition) {
  if (!entry.partition) return entry.files;
  if (!partition) return null;
  return (await loadPartitionIndex(entry))[partition]?.files ?? {};
}

async function rowsFor(entry, partition) {
  const files = await filesFor(entry, partition);
  return loadRows(entry, { url: fileUrl(entry, files.parquet.path), bytes: files.parquet.bytes });
}

// ---- Boundary levels and their areas (places.json, places/<level>.json) ----

function levelById(id) {
  return app.levels.find((level) => level.id === id);
}

// Each level's list of areas loads once, when a picker first needs it.
function loadUnits(levelId) {
  const level = levelById(levelId);
  if (!level?.units) return Promise.resolve([]);
  if (!unitLoads.has(levelId)) {
    const promise = getJson(dataUrl(level.units)).then((units) => { app.units[levelId] = units; return units; });
    promise.catch(() => unitLoads.delete(levelId)); // allow "Try again"
    unitLoads.set(levelId, promise);
  }
  return unitLoads.get(levelId);
}

function findUnit(levelId, code) {
  return code ? app.units[levelId]?.find((unit) => unit.code === code) : undefined;
}

function placeNames(place) {
  const names = {};
  for (const level of ['county', 'municipality', 'tract', 'block_group']) {
    names[level] = findUnit(level, place[levelById(level)?.code])?.name;
  }
  return names;
}

// The chosen area's outline, drawn from its level's tiles.
function placeOutline(place) {
  const level = levelById(deepestChoice(place));
  return level ? { url: dataUrl(level.tiles), layer: level.layer, key: level.code, code: place[level.code] } : null;
}

// With a dataset chosen, the boundary level's areas inside the larger choices are outlined around it.
function contextOutlines(clean) {
  const level = levelById(clean.boundary);
  if (!clean.layer || !level) return null;
  const place = { ...clean.place };
  if (level.code) place[level.code] = null;
  return { url: dataUrl(level.tiles), layer: level.layer, filter: toMapFilter({ place, conditions: [] }) };
}

function zoomToView() {
  if (!app.map || !app.entry) return;
  const level = deepestChoice(app.state.place);
  const bounds = level ? findUnit(level, app.state.place[levelById(level).code])?.bounds : null;
  app.map.fitBounds(bounds ?? app.entry.bounds, bounds ? 14 : 12);
}

// ---- One function changes what is shown ----

function hasFilters(entry) {
  return entry.fields.some((field) => field.filter !== 'none') || entry.examples.length > 0;
}

function renderArea() {
  ui.renderAreaPickers($('area-pickers'), app.state.boundary, app.units, app.state.place, onPick);
}

function renderControls() {
  const boundaryView = app.state.layer === null;
  $('boundary-select').value = app.state.boundary;
  ui.renderBoundaryHint($('boundary-hint'), levelById(app.state.boundary));
  renderArea();
  $('data-select').value = app.state.layer ?? '';
  ui.renderDataNote($('data-note'), app.entry, boundaryView);
  $('narrow-section').hidden = !hasFilters(app.entry);
  ui.renderFilters($('filter-controls'), app.entry, app.state, (conditions) => {
    app.state = { ...app.state, conditions };
    update();
  });
  ui.renderExamples($('examples'), app.entry, applyExample);
}

// Show the table rows and map tiles of the layer on screen: the chosen data, or the boundary level's areas.
// A large layer shows one municipality's files, and asks for a municipality until one is chosen.
function showEntry(entry, partition) {
  const current = () => app.entry === entry && app.partition === partition; // nothing else chosen meanwhile
  app.rows = null;
  app.files = null;
  app.matched = [];
  $('download-matches').disabled = true;
  $('match-count').textContent = TEXT.loading;
  for (const id of ['results-table', 'active-filters']) $(id).replaceChildren();
  $('table-note').textContent = '';
  if (entry.partition && !partition) {
    app.mapReady.then((map) => { if (map && current()) map.clearLayer(); });
    ui.setStatus($('match-count'), TEXT.partition.choose(entry.noun.plural));
    return;
  }
  filesFor(entry, partition).then((files) => {
    if (!current()) return undefined;
    if (!files.parquet) {
      app.mapReady.then((map) => { if (map && current()) map.clearLayer(); });
      ui.setStatus($('match-count'), TEXT.partition.none(entry.noun.plural));
      return undefined;
    }
    app.files = files;
    // The map and the table data load independently, so a slow basemap never holds up the count and table.
    app.mapReady.then((map) => {
      if (!map || !current()) return;
      map.showLayer(entry, fileUrl(entry, files.pmtiles.path), { fit: false });
      zoomToView();
      update();
    });
    return loadRows(entry, { url: fileUrl(entry, files.parquet.path), bytes: files.parquet.bytes }).then((rows) => {
      if (!current()) return;
      app.rows = rows;
      update();
    });
  }).catch((error) => {
    console.error(error);
    if (!current()) return;
    ui.setStatus($('match-count'), TEXT.loadFailed(TEXT.thisData), { error: true, retry: () => showEntry(entry, partition) });
  });
}

async function setState(next, { zoom = false } = {}) {
  let boundary = levelById(next.boundary) ? next.boundary : DEFAULT_BOUNDARY;
  // A large dataset loads one municipality at a time, so its level is at least Municipality (D-025).
  if (app.catalog.layers.find((layer) => layer.id === next.layer)?.partition) boundary = atLeastLevel(boundary, 'municipality');
  const state = { ...next, boundary, place: trimPlace(next.place, boundary) };
  const entry = app.catalog.layers.find((layer) => layer.id === shownLayerId(state, app.levels));
  if (!entry) return;
  const partition = entry.partition ? state.place.mun_code : null;
  const changed = entry !== app.entry || partition !== app.partition;
  app.state = state;
  app.entry = entry;
  app.partition = partition;
  $('about-button').disabled = false;
  for (const id of ['data-section', 'results-section', 'table-section']) $(id).hidden = false;
  renderControls();
  if (changed) showEntry(entry, partition);
  update();
  if (zoom && !changed) zoomToView();
  const missing = pickerLevels(boundary).filter((level) => !app.units[level]);
  if (!missing.length) return;
  ui.setStatus($('area-status'), '');
  try {
    await Promise.all(missing.map(loadUnits));
  } catch (error) {
    console.error(error);
    ui.setStatus($('area-status'), TEXT.loadFailed(TEXT.listOfAreas), { error: true, retry: () => setState(app.state, { zoom }) });
    return;
  }
  if (app.state.boundary !== boundary) return;
  renderArea();
  update();
  if (zoom) zoomToView();
}

function update() {
  if (!app.entry) return;
  const clean = cleanState(app.state, app.entry.fields);
  app.map?.setFilter(toMapFilter(clean));
  app.map?.showContext(contextOutlines(clean));
  app.map?.showPlace(placeOutline(clean.place));
  writeHash(clean);
  if (!app.rows) return;
  const matched = app.rows.filter(toPredicate(clean));
  app.matched = matched;
  $('download-matches').disabled = matched.length === 0;
  const names = placeNames(clean.place);
  ui.renderCount($('match-count'), matched.length, app.rows.length, app.entry, app.partition ? names.municipality : null);
  const phrases = describe(clean, app.entry.fields, TEXT, {
    placeNames: names,
    formatValue: (value, field) => formatValue(value, field, ''),
  });
  ui.renderChips($('active-filters'), phrases, (item) => removePhrase(item, clean), clearAll);
  ui.renderTable($('results-table'), $('table-note'), app.entry, matched, (row) => app.map?.flyToItem(row, app.entry.geometry));
}

// ---- User actions ----

function onBoundaryChange() {
  // With no dataset, the table switches to the new level's areas, so their filters no longer apply.
  const conditions = app.state.layer ? app.state.conditions : [];
  setState({ ...app.state, boundary: $('boundary-select').value, conditions }, { zoom: true });
}

function onPick(level, code) {
  setState({ ...app.state, place: choose(app.state.place, level, code) }, { zoom: true });
}

function onDataChange() {
  ui.renderNotices($('notices'), []);
  setState({ ...app.state, layer: $('data-select').value || null, conditions: [] });
}

function applyExample(example) {
  // An example without a place is statewide, except on a large layer, which keeps its municipality (D-025).
  const keep = !example.place && app.entry.partition ? app.state.place : {};
  const place = { ...emptyPlace(), ...keep, ...(example.place ?? {}) };
  // A dataset example may pick a smaller area than the level shows; the level moves down to show it.
  const boundary = app.state.layer ? levelFor(place, app.state.boundary) : app.state.boundary;
  setState({ ...app.state, boundary, place, conditions: structuredClone(example.conditions) }, { zoom: true });
}

function clearAll() {
  ui.renderNotices($('notices'), []);
  setState({ ...app.state, place: emptyPlace(), conditions: [] }, { zoom: true });
}

function removePhrase(item, clean) {
  if (item.kind === 'condition') {
    setState({ ...app.state, conditions: clean.conditions.filter((_, index) => index !== item.index) });
  } else {
    setState({ ...app.state, place: choose(app.state.place, item.kind, null) }, { zoom: true });
  }
}

// ---- Take it away: spreadsheet of matches, copy link ----

function downloadMatches() {
  if (!app.entry || !app.matched.length) return;
  const names = placeNames(app.state.place);
  const placeName = [names.tract, names.block_group].filter(Boolean).join(' ')
    || names.municipality || names.county;
  const csv = toCsv(app.matched, app.entry.csv_columns, csvDecimals(app.entry));
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = ui.el('a', { href: url, download: csvFileName(app.entry.id, placeName) });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyLink() {
  const status = $('copy-status');
  const fallback = $('copy-fallback-field');
  try {
    await navigator.clipboard.writeText(location.href);
    fallback.hidden = true;
    status.textContent = TEXT.results.linkCopied;
  } catch {
    // Clipboard blocked (for example, not a secure page): show the link selected, ready to copy by hand.
    fallback.hidden = false;
    $('copy-fallback').value = location.href;
    $('copy-fallback').select();
    status.textContent = TEXT.results.copyFallback;
  }
  setTimeout(() => { if (status.textContent === TEXT.results.linkCopied) status.textContent = ''; }, 3000);
}

// ---- First-visit help ----

function showHelp() {
  let dismissed = false;
  try { dismissed = localStorage.getItem(HELP_KEY) === 'yes'; } catch { /* storage blocked: show help */ }
  if (dismissed) return;
  $('help-steps').replaceChildren(...TEXT.help.steps.map((step) => ui.el('li', { text: step })));
  $('help').hidden = false;
  $('help-dismiss').addEventListener('click', () => {
    $('help').hidden = true;
    try { localStorage.setItem(HELP_KEY, 'yes'); } catch { /* nothing to remember */ }
  }, { once: true });
}

// ---- Share links ----

function writeHash(clean) {
  const hash = encodeHash(clean);
  if (hash === app.lastHash) return;
  app.lastHash = hash;
  history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
}

function applyHash() {
  const { state, notices } = decodeHash(location.hash, app.catalog, app.levels);
  app.lastHash = location.hash.replace(/^#/, '');
  setState(state, { zoom: true });
  ui.renderNotices($('notices'), notices);
}

function onHashChange() {
  if (location.hash.replace(/^#/, '') !== app.lastHash) applyHash();
}

// ---- About ----

function openAbout() {
  if (!app.entry) return;
  const part = app.entry.partition && app.files
    ? { files: app.files, placeName: placeNames(app.state.place).municipality } : null;
  ui.renderAbout($('about-content'), app.entry, (path) => fileUrl(app.entry, path), part);
  $('about-dialog').showModal();
}

function showZoomHint(below, entry) {
  const hint = $('zoom-hint');
  hint.hidden = !below;
  if (below) hint.textContent = TEXT.zoomIn(entry.noun.plural);
}

// ---- Start ----

async function start() {
  ui.applyStaticText();
  const selftest = new URLSearchParams(location.search).has('selftest');
  const status = $('catalog-status');
  ui.setStatus(status, TEXT.loadingList);
  if (!selftest) {
    // The map loads in the background; the lists appear as soon as the catalog arrives.
    app.mapReady = createMap($('map'), { buildPopup: (props) => ui.buildPopup(app.entry, props), onZoomHint: showZoomHint })
      .then((map) => { app.map = map; return map; })
      .catch((error) => {
        console.error(error);
        const note = $('map-status');
        note.hidden = false;
        note.textContent = TEXT.loadFailed(TEXT.theMap);
        return null;
      });
  }
  try {
    const [catalog, places] = await Promise.all([getJson('data/catalog.json'), getJson('data/places.json')]);
    app.catalog = catalog;
    app.levels = places.levels.filter((level) => catalog.layers.some((layer) => layer.id === level.layer));
    if (!selftest) await Promise.all([loadUnits('county'), loadUnits('municipality')]);
  } catch (error) {
    console.error(error);
    ui.setStatus(status, TEXT.loadFailed(TEXT.listOfData), { error: true, retry: () => location.reload() });
    return;
  }
  if (selftest) {
    $('app').hidden = true;
    $('selftest').hidden = false;
    await runSelftest($('selftest'), app.catalog, rowsFor);
    return;
  }
  ui.setStatus(status, '');
  ui.renderBoundaryOptions($('boundary-select'), app.levels);
  ui.renderDataOptions($('data-select'), app.catalog, app.levels);
  $('boundary-field').hidden = false;
  $('boundary-select').addEventListener('change', onBoundaryChange);
  $('data-select').addEventListener('change', onDataChange);
  $('about-button').addEventListener('click', openAbout);
  $('download-matches').addEventListener('click', downloadMatches);
  $('copy-link').addEventListener('click', copyLink);
  showHelp();
  window.addEventListener('hashchange', onHashChange);
  if (location.hash.length > 1) applyHash();
  else setState(emptyState());
}

// ?debug exposes the app object in the console so gate checks can count what the map draws.
if (new URLSearchParams(location.search).has('debug')) window.atlas = app;

start();
