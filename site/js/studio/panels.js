// Studio's panels, legend, table and popups, drawn from the map document and the layer runtimes.
// Data values only go into textContent. Every string comes from text.js.
import { el } from './dom.js';
import { isTarget, isSource } from './registry.js';
import { presetStyle } from './style.js';
import { combinedRows, resultNotes } from './screening.js';
import { BUFFER_PRESETS_FT, MAX_BUFFERS, MAX_LAYERS } from './mapdoc.js';
import { MAX_BUFFER_FEATURES, MAX_DISTANCE, MAX_RINGS, OUTLINE_STYLES, SELECTS, UNITS, bufferName, formatDistance, presetOf } from './buffer.js';
import { legendNode, ringSwatchStyle } from './export.js';
import { formatCount, formatValue } from '../format.js';
import { pickerLevels, unitsFor, LEVEL_KEYS, pickerNeeds } from '../places.js';

const $ = (id) => document.getElementById(id);
const VISIBLE_OPTIONS = 8;
const SORT_LIMIT = 5000;

export function renderShell(app, actions) {
  app.actions = actions;
  const T = app.text;
  $('app-title').textContent = T.appTitle;
  $('open-file-label').textContent = T.openFile;
  $('open-file').addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (file) actions.openFile(file);
    event.target.value = '';
  });
  $('about-button').textContent = T.aboutButton;
  $('about-button').addEventListener('click', () => $('about-dialog').showModal());
  $('about-close').textContent = T.close;
  $('about-content').replaceChildren(el('h2', { id: 'about-dialog-title', text: T.appTitle }), ...T.aboutApp.map((line) => el('p', { text: line })),
    el('p', {}, [el('a', { href: 'atlas/', text: T.atlasLink }), ` · ${T.codeLicense}`]));
  // Tabs (D-068), following the WAI-ARIA tab pattern: one tab in the Tab order, arrows move between them.
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  for (const tab of tabs) {
    tab.textContent = T.tabs[tab.dataset.tab];
    tab.addEventListener('click', () => actions.setTab(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      actions.setTab(target.dataset.tab);
      target.focus();
    });
  }
  $('tabs').setAttribute('aria-label', T.appTitle);
  $('embed-open').textContent = T.embed.open;
  $('embed-open').href = location.href.replace('?embed=1', '').replace('&embed=1', '');
}

export function renderTabs(app) {
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const selected = tab.dataset.tab === app.ui.tab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
  }
  renderProperties(app);
}

// The map document at a glance (D-068): its title, its area and how many layers it has.
export function renderDocBar(app) {
  const T = app.text;
  const bar = $('doc-bar');
  let input = bar.querySelector('input');
  if (!input) {
    input = el('input', { id: 'doc-title', type: 'text', placeholder: T.export.untitled, 'aria-label': T.export.title, autocomplete: 'off' });
    input.addEventListener('input', () => app.actions.setText('title', input.value));
    bar.replaceChildren(input, el('p', { class: 'doc-meta' }));
  }
  if (document.activeElement !== input) input.value = app.doc.title;
  bar.querySelector('.doc-meta').textContent = [app.areaName?.() ?? '', T.docBar.layers(app.doc.layers.length),
    app.doc.buffers.length ? T.docBar.buffers(app.doc.buffers.length) : null,
    app.doc.screenings.length ? T.docBar.screening(app.doc.screenings[0].distance_ft) : null].filter(Boolean).join(' · ');
}

export function renderAll(app) {
  if (!app.registry) return;
  renderTabs(app);
  renderDocBar(app);
  renderArea(app);
  renderLayers(app);
  renderAnalysis(app);
  renderExport(app);
  renderLegend(app);
  renderTable(app);
  renderNotices(app);
}

export function flash(app, message) {
  const node = $('flash');
  node.textContent = message ?? '';
  node.hidden = !message;
  clearTimeout(app.flashTimer);
  if (message) app.flashTimer = setTimeout(() => { node.hidden = true; }, 8000);
}

export function fatal(app, error) {
  const node = $('flash');
  node.textContent = `${app.text.retry}: ${error?.message ?? error}`;
  node.hidden = false;
  node.classList.add('error');
}

export function renderOffline(app) {
  const node = $('offline');
  node.textContent = app.text.offline;
  node.hidden = navigator.onLine !== false;
}

function renderNotices(app) {
  const node = $('notices');
  node.replaceChildren(...(app.notices ?? []).map((line) => el('p', { text: line })));
  node.hidden = !(app.notices ?? []).length;
}

// ---- Area ----

function addressForm(app, forSite) {
  const T = app.text;
  const id = forSite ? 'site-address' : 'area-address';
  const input = el('input', { id, type: 'search', autocomplete: 'off', placeholder: T.area.address });
  const form = el('form', { class: 'inline-form' }, [
    el('label', { for: id, class: 'visually-hidden', text: T.area.address }), input,
    el('button', { type: 'submit', class: 'secondary', text: T.area.addressGo })]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    app.actions.searchAddress(input.value, forSite).catch(() => flash(app, T.layers.failed));
  });
  const nodes = [form];
  if (app.ui.candidates && app.ui.candidatesFor === (forSite ? 'site' : 'area')) {
    if (app.ui.candidateMessage) {
      const searching = Boolean(app.ui.fallbackAbort);
      nodes.push(el('p', { class: 'hint' }, [el('span', { text: app.ui.candidateMessage }),
        app.ui.fallbackQuery && !searching ? el('button', { type: 'button', class: 'link-button', text: T.area.addressSlower, onclick: () => app.actions.searchAddressPoints() }) : null,
        searching ? el('button', { type: 'button', class: 'link-button', text: T.cancel, onclick: () => app.actions.cancelAddressPoints() }) : null]
        .filter(Boolean).flatMap((node, i) => (i ? [' ', node] : [node]))));
    }
    nodes.push(el('ul', { class: 'candidates' }, app.ui.candidates.map((candidate) => el('li', {}, [
      el('button', { type: 'button', class: 'link-button', text: candidate.address, onclick: () => app.actions.useCandidate(candidate) })]))));
  }
  return nodes;
}

export function renderArea(app) {
  const T = app.text;
  const { doc } = app;
  const levelSelect = el('select', { id: 'area-level' }, app.levels.map((level) => el('option', { value: level.id, text: T.levels[level.id] })));
  levelSelect.value = doc.area.level;
  levelSelect.addEventListener('change', () => app.actions.setLevel(levelSelect.value));
  const pickers = pickerLevels(doc.area.level).map((level) => {
    const id = `area-${level}`;
    const units = app.unitsReady?.[level];
    const code = doc.area[LEVEL_KEYS[level]];
    const select = el('select', { id });
    const needs = pickerNeeds(level);
    if (!units) {
      select.append(el('option', { value: '', text: T.loading }));
      select.disabled = true;
    } else if (needs && !doc.area[needs]) {
      select.append(el('option', { value: '', text: T.area.chooseFirst }));
      select.disabled = true;
    } else {
      const listed = unitsFor(level, units, doc.area);
      select.append(el('option', { value: '', text: T.area.all[level] }), ...listed.map((unit) => el('option', { value: unit.code, text: unit.name })));
      select.value = code ?? '';
    }
    select.addEventListener('change', () => app.actions.pick(level, select.value || null));
    return el('div', { class: 'field' }, [el('label', { for: id, text: T.levels[level] }), select]);
  });
  const outside = el('div', { class: 'field inline' }, [el('span', { class: 'label', id: 'area-outside', text: T.area.outside }),
    el('div', { class: 'segmented small', role: 'group', 'aria-labelledby': 'area-outside' }, ['show', 'dim', 'hide'].map((mode) =>
      el('button', { type: 'button', 'aria-pressed': String(doc.mask === mode), text: T.area.outsideModes[mode],
        title: mode === 'dim' && doc.basemap_mode === 'off' ? T.area.dimOff : null, onclick: () => app.actions.setMask(mode) })))]);
  $('panel-area').replaceChildren(
    el('div', { class: 'field' }, [el('label', { for: 'area-level', text: T.area.level }), levelSelect]),
    ...pickers,
    outside,
    ...addressForm(app, false),
  );
}

// ---- Layers ----

function statusText(app, rt, layer) {
  const T = app.text;
  if (app.health?.[layer.id] && app.health[layer.id].ok === false && rt.status !== 'ready') return T.layers.healthWarning;
  if (rt.status === 'error') return T.layers.failed;
  if (rt.status === 'loading' || rt.total === null) return T.loading;
  const belowTiles = rt.entry.tiles && !rt.loader && app.map && app.map.zoom() < rt.entry.tiles.min_zoom;
  if (rt.drawStatus === 'zoom' || belowTiles) return T.layers.zoomIn(rt.entry.noun.plural);
  if (rt.drawStatus === 'dense') return T.layers.dense(rt.entry.noun.plural);
  const total = formatCount(rt.total);
  return layer.filters.length ? T.layers.matching(formatCount(rt.matched), total) : T.layers.inArea(total);
}

// The browser is reading a field's values to count them (D-054): how far it has got.
export function renderStatsProgress(app, id) {
  const node = document.querySelector(`[data-progress="${CSS.escape(id)}"] span`);
  const rt = app.runtimes.get(id);
  if (!node || !rt || rt.statsProgress === null) return;
  node.textContent = app.text.filters.counting(formatCount(rt.statsProgress), formatCount(rt.total ?? 0));
}

export function renderLayerStatus(app, id) {
  const node = document.querySelector(`[data-status="${CSS.escape(id)}"]`);
  const layer = app.doc.layers.find((l) => l.id === id);
  const rt = app.runtimes.get(id);
  if (!node || !layer || !rt) return;
  node.replaceChildren(el('span', { text: statusText(app, rt, layer) }));
  node.classList.toggle('error', rt.status === 'error');
  if (rt.status === 'error') node.append(' ', el('button', { type: 'button', class: 'link-button', text: app.text.retry, onclick: () => app.actions.retry(id) }));
  if (rt.drawStatus === 'loading' && rt.status === 'ready') node.append(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
}

function checklist(app, id, field, values, condition, onChange) {
  const chosen = new Set(condition?.values ?? []);
  const boxes = values.map((item, index) => {
    const blank = item.value === null;
    const box = el('input', { type: 'checkbox', id: `f-${id}-${field.name}-${index}`, checked: blank ? Boolean(condition?.include_blank) : chosen.has(item.value) });
    box.dataset.value = blank ? '' : item.value;
    if (blank) box.dataset.blank = 'true';
    box.addEventListener('change', onChange);
    return el('label', { class: 'check', for: box.id, hidden: index >= VISIBLE_OPTIONS && !box.checked }, [
      box, el('span', { text: blank ? app.text.filters.blank : String(item.value) }), el('span', { class: 'n', text: formatCount(item.count) })]);
  });
  const set = el('fieldset', { class: 'filter', 'data-field': field.name }, [el('legend', { text: field.label }), ...boxes]);
  if (values.length > VISIBLE_OPTIONS) {
    set.append(el('button', { type: 'button', class: 'link-button', text: app.text.filters.more(values.length - VISIBLE_OPTIONS),
      onclick: (event) => { boxes.forEach((label) => { label.hidden = false; }); event.target.remove(); } }));
  }
  return set;
}

function readFilters(container, entry) {
  const conditions = [];
  for (const node of container.querySelectorAll('[data-field]')) {
    const field = entry.fields.find((f) => f.name === node.dataset.field);
    if (field.filter === 'checklist') {
      const checked = [...node.querySelectorAll('input:checked')];
      const values = checked.filter((box) => !box.dataset.blank).map((box) => box.dataset.value);
      const include = checked.some((box) => box.dataset.blank);
      if (values.length || include) conditions.push({ field: field.name, op: 'in', values, include_blank: include });
    } else if (field.filter === 'search') {
      const value = node.querySelector('input').value.trim();
      if (value) conditions.push({ field: field.name, op: 'contains', value });
    } else if (field.filter === 'range') {
      const read = (bound) => {
        const text = node.querySelector(`[data-bound="${bound}"]`).value;
        if (!text) return null;
        return field.type === 'number' ? Number(text) : text;
      };
      const min = read('min');
      const max = read('max');
      if (min !== null || max !== null) conditions.push({ field: field.name, op: 'range', min, max });
    }
  }
  return conditions;
}

// A layer's filter controls. A buffer reuses them for its own filter (D-076): `prefix` keeps element IDs apart
// and `onChange` receives the new conditions.
function filterSection(app, layer, rt, { prefix = layer.id, onChange = (filters) => app.actions.setFilters(layer.id, filters) } = {}) {
  const T = app.text;
  const { entry } = rt;
  const current = new Map(layer.filters.map((c) => [c.field, c]));
  const container = el('div', { class: 'filters' });
  let timer = null;
  const emit = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(readFilters(container, entry)), delay);
  };
  if (!rt.stats.loaded) {
    container.append(el('p', { class: 'hint progress-line', 'data-progress': layer.id }, [el('span', { text: T.loading }),
      ' ', el('button', { type: 'button', class: 'link-button', text: T.cancel, onclick: () => app.actions.cancelStats(layer.id) })]));
  } else if (rt.stats.cancelled) {
    container.append(el('p', { class: 'hint' }, [el('span', { text: T.filters.cancelled }), ' ',
      el('button', { type: 'button', class: 'link-button', text: T.filters.recount, onclick: () => app.actions.recount(layer.id) })]));
  }
  for (const field of entry.fields) {
    if (field.filter === 'checklist') {
      if (!rt.stats.loaded || rt.stats.cancelled) continue;
      container.append(checklist(app, prefix, field, rt.stats.values[field.name] ?? [], current.get(field.name), () => emit(0)));
    } else if (field.filter === 'search') {
      const id = `f-${prefix}-${field.name}`;
      const input = el('input', { type: 'search', id, value: current.get(field.name)?.value ?? '', autocomplete: 'off' });
      input.addEventListener('input', () => emit(400));
      container.append(el('div', { class: 'field filter', 'data-field': field.name }, [el('label', { for: id, text: field.label }), input]));
    } else if (field.filter === 'range') {
      const type = field.type === 'date' ? 'date' : 'number';
      const range = rt.stats.ranges?.[field.name] ?? {};
      const bound = (name, label) => {
        const id = `f-${prefix}-${field.name}-${name}`;
        const value = current.get(field.name)?.[name];
        const input = el('input', { type, id, step: type === 'number' ? 'any' : null, value: value ?? '',
          placeholder: range[name] !== undefined && range[name] !== null ? String(range[name]) : '' });
        input.dataset.bound = name;
        input.addEventListener('change', () => emit(0));
        return el('label', { for: id }, [label, input]);
      };
      container.append(el('fieldset', { class: 'filter', 'data-field': field.name }, [
        el('legend', { text: field.unit ? `${field.label} (${field.unit})` : field.label }),
        el('div', { class: 'range' }, [bound('min', T.filters.min), bound('max', T.filters.max)])]));
    }
  }
  const nodes = [];
  if (entry.examples?.length) {
    nodes.push(el('div', { class: 'examples' }, entry.examples.map((example) => el('button', { type: 'button', class: 'chip-button',
      text: example.label, onclick: () => onChange(example.conditions) }))));
  }
  if (layer.filters.length) nodes.push(el('button', { type: 'button', class: 'link-button', text: T.filters.clear, onclick: () => onChange([]) }));
  return el('div', { class: 'section' }, [...nodes, container]);
}

function styleSection(app, layer, rt) {
  const T = app.text;
  const { entry } = rt;
  const { key, style } = presetStyle(entry, layer.style);
  const presets = el('select', { id: `s-${layer.id}-preset` }, Object.entries(entry.styles).map(([id, preset]) => el('option', { value: id, text: preset.label })));
  presets.value = key;
  presets.addEventListener('change', () => app.actions.setStyle(layer.id, { preset: presets.value, overrides: {} }));
  const controls = [el('div', { class: 'field' }, [el('label', { for: presets.id, text: T.style.preset }), presets])];
  const setOverride = (patch) => app.actions.setStyle(layer.id, { preset: key, overrides: { ...layer.style.overrides, ...patch } });
  if (style.kind === 'single') {
    const color = el('input', { type: 'color', id: `s-${layer.id}-color`, value: style.color });
    color.addEventListener('change', () => setOverride({ color: color.value.toUpperCase() }));
    controls.push(el('div', { class: 'field inline' }, [el('label', { for: color.id, text: T.style.color }), color]));
  }
  if (style.kind === 'graduated') {
    const classes = el('select', { id: `s-${layer.id}-classes` }, [3, 4, 5, 6, 7].map((n) => el('option', { value: String(n), text: String(n) })));
    classes.value = String(style.classes);
    classes.addEventListener('change', () => setOverride({ classes: Number(classes.value), breaks: undefined, colors: undefined }));
    const method = el('select', { id: `s-${layer.id}-method` }, Object.entries(T.style.methods).map(([id, label]) => el('option', { value: id, text: label })));
    method.value = style.method;
    method.addEventListener('change', () => setOverride({ method: method.value, breaks: undefined, colors: undefined }));
    controls.push(el('div', { class: 'field inline' }, [el('label', { for: classes.id, text: T.style.classes }), classes]),
      el('div', { class: 'field inline' }, [el('label', { for: method.id, text: T.style.method }), method]));
  }
  if (entry.geometry !== 'point') {
    const width = el('input', { type: 'range', id: `s-${layer.id}-width`, min: '0.5', max: '6', step: '0.5', value: String(style.width ?? (entry.geometry === 'line' ? 1.5 : 1)) });
    width.addEventListener('change', () => setOverride({ width: Number(width.value) }));
    controls.push(el('div', { class: 'field inline' }, [el('label', { for: width.id, text: T.style.width }), width]));
  }
  const textFields = entry.fields.filter((f) => f.type === 'text' || f.type === 'category');
  if (textFields.length) {
    const labels = el('select', { id: `s-${layer.id}-labels` }, [el('option', { value: '', text: '—' }), ...textFields.map((f) => el('option', { value: f.name, text: f.label }))]);
    labels.value = style.labels?.field ?? '';
    labels.addEventListener('change', () => setOverride({ labels: labels.value ? { field: labels.value, size: 12, halo: true } : undefined }));
    controls.push(el('div', { class: 'field inline' }, [el('label', { for: labels.id, text: T.style.labels }), labels]));
  }
  return el('div', { class: 'section' }, controls);
}

function aboutSection(app, rt) {
  const T = app.text;
  const { entry } = rt;
  const rows = [
    [T.about.source, entry.source.publisher],
    [T.about.license, entry.license.name ?? '—'],
    [T.about.credit, entry.license.attribution],
    [T.about.refresh, T.about.cadence[entry.refresh_cadence]],
    ...(entry.coverage ? [[T.about.coverage, entry.coverage.note]] : []),
  ];
  const list = el('dl', { class: 'about' }, rows.flatMap(([label, value]) => [el('dt', { text: label }), el('dd', { text: value })]));
  const nodes = [el('p', { class: 'hint', text: entry.summary }), list];
  if (entry.area_mode === 'intersects') nodes.push(el('p', { class: 'hint', text: T.area.touching }));
  if (entry.access === 'hybrid' && !entry.tiles) nodes.push(el('p', { class: 'hint', text: T.layers.drawnLive }));
  nodes.push(el('a', { href: entry.source.landing_page, target: '_blank', rel: 'noopener', text: T.about.more }));
  return el('div', { class: 'section' }, nodes);
}

// One row of the layer list: show, name, count, order and remove. Choosing the row opens its properties.
export function renderLayer(app, id) {
  const T = app.text;
  const index = app.doc.layers.findIndex((l) => l.id === id);
  const layer = app.doc.layers[index];
  const rt = app.runtimes.get(id);
  const old = document.querySelector(`[data-layer="${CSS.escape(id)}"]`);
  if (!layer || !rt) { old?.remove(); return; }
  const selected = app.ui.selected === id;
  const visible = el('input', { type: 'checkbox', id: `v-${id}`, checked: layer.visible, 'aria-label': `${T.layers.show}: ${rt.entry.title}` });
  visible.addEventListener('change', () => app.actions.setLayer(id, { visible: visible.checked }));
  const node = el('li', { class: `layer${selected ? ' selected' : ''}`, 'data-layer': id }, [
    el('div', { class: 'layer-head' }, [
      visible,
      el('button', { type: 'button', class: 'layer-title', 'aria-pressed': selected ? 'true' : 'false', 'aria-controls': 'layer-props',
        text: rt.entry.title, onclick: () => app.actions.selectLayer(selected ? null : id) }),
      el('span', { class: 'badge', text: T.layers.access[rt.entry.access] }),
      el('button', { type: 'button', class: 'icon', 'aria-label': `${T.layers.up}: ${rt.entry.title}`, text: '↑', disabled: index === 0, onclick: () => app.actions.moveLayer(id, -1) }),
      el('button', { type: 'button', class: 'icon', 'aria-label': `${T.layers.down}: ${rt.entry.title}`, text: '↓', disabled: index === app.doc.layers.length - 1, onclick: () => app.actions.moveLayer(id, 1) }),
      el('button', { type: 'button', class: 'icon', 'aria-label': `${T.remove}: ${rt.entry.title}`, text: '×', onclick: () => app.actions.removeLayer(id) }),
    ]),
    el('p', { class: 'status', 'data-status': id, role: 'status' }),
  ]);
  if (old) old.replaceWith(node);
  else $('layer-list')?.append(node);
  renderLayerStatus(app, id);
  if (selected) renderProperties(app);
}

// The chosen layer's properties (D-070): Style, Filter and About as sections that can be open together.
export function renderProperties(app) {
  const T = app.text;
  const panel = $('layer-props');
  const id = app.ui.selected;
  const layer = app.doc.layers.find((l) => l.id === id);
  const rt = id ? app.runtimes.get(id) : null;
  if (!layer || !rt || app.ui.tab !== 'layers') {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  const section = (key, label, body) => {
    const details = el('details', { class: 'prop-section', 'data-section': key }, [el('summary', { text: label }), body]);
    details.open = Boolean(app.ui.sections[key]);
    details.addEventListener('toggle', () => app.actions.sectionToggled(key, details.open));
    return details;
  };
  const opacity = el('input', { type: 'range', id: `o-${id}`, min: '0.1', max: '1', step: '0.1', value: String(layer.opacity) });
  opacity.addEventListener('change', () => app.actions.setLayer(id, { opacity: Number(opacity.value) }));
  const style = styleSection(app, layer, rt);
  style.prepend(el('div', { class: 'field inline' }, [el('label', { for: opacity.id, text: T.layers.opacity }), opacity]));
  const tableOpen = app.table?.id === id;
  const sections = [section('style', T.layers.style, style)];
  if (rt.entry.fields.some((f) => f.filter !== 'none')) sections.push(section('filter', T.layers.filter, filterSection(app, layer, rt)));
  sections.push(section('about', T.layers.about, aboutSection(app, rt)));
  panel.hidden = false;
  panel.replaceChildren(
    el('div', { class: 'props-head' }, [
      el('h2', { text: rt.entry.title }),
      el('button', { type: 'button', class: `secondary${tableOpen ? ' on' : ''}`, 'aria-pressed': tableOpen ? 'true' : 'false', text: T.layers.table,
        onclick: () => app.actions.toggleTable(id) }),
      el('button', { type: 'button', class: 'icon', 'aria-label': T.close, text: '×', onclick: () => app.actions.selectLayer(null) }),
    ]),
    el('p', { class: 'hint', text: rt.entry.summary }),
    ...(rt.entry.coverage ? [el('p', { class: 'coverage-note' }, [el('strong', { text: `${T.layers.partial}. ` }), rt.entry.coverage.note])] : []),
    ...sections,
  );
}

// "Add layer": the catalog in a dialog, grouped by category, with a search box (D-070).
export function openCatalog(app) {
  const T = app.text;
  let dialog = $('catalog-dialog');
  if (!dialog) {
    dialog = el('dialog', { id: 'catalog-dialog', class: 'catalog-dialog', 'aria-labelledby': 'catalog-title' });
    document.body.append(dialog);
  }
  const search = el('input', { type: 'search', id: 'add-search', placeholder: T.layers.search, value: app.ui.addQuery, autocomplete: 'off',
    'aria-label': T.layers.search });
  const list = el('div', { class: 'catalog' });
  const full = app.doc.layers.length >= MAX_LAYERS;
  const item = (entry) => {
    const added = app.doc.layers.some((l) => l.id === entry.id);
    return el('button', { type: 'button', class: 'catalog-item', disabled: added || full, title: entry.summary,
      onclick: () => { dialog.close(); app.actions.addLayer(entry.id); } }, [
      el('span', { text: entry.title }),
      entry.coverage ? el('span', { class: 'badge partial', title: entry.coverage.note, text: T.layers.partial }) : null,
      el('span', { class: 'badge', text: added ? T.layers.added : T.layers.access[entry.access] })].filter(Boolean));
  };
  const groupsOf = (keep) => app.registry.groups.map(({ category, layers }) => {
    const shown = layers.filter(keep);
    return shown.length ? el('div', { class: 'catalog-group' }, [el('h3', { text: T.categories[category] ?? category }), ...shown.map(item)]) : null;
  }).filter(Boolean);
  // Without a search: the core layers first, the rest by topic under More layers (D-087). A search covers all.
  const core = app.registry.catalog.core ?? [];
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    app.ui.addQuery = search.value;
    if (query || !core.length) {
      list.replaceChildren(...groupsOf((entry) => !query || `${entry.title} ${entry.summary}`.toLowerCase().includes(query)));
      return;
    }
    const more = el('details', { class: 'more-layers', open: app.ui.moreLayers === true },
      [el('summary', { text: T.layers.more(app.registry.catalog.layers.length - core.length) }), ...groupsOf((entry) => !core.includes(entry.id))]);
    more.addEventListener('toggle', () => { app.ui.moreLayers = more.open; });
    list.replaceChildren(el('div', { class: 'catalog-group' }, [el('h3', { text: T.layers.core }),
      ...core.map((id) => app.registry.get(id)).filter(Boolean).map(item)]), more);
  };
  search.addEventListener('input', draw);
  draw();
  dialog.replaceChildren(
    el('div', { class: 'dialog-head' }, [el('h2', { id: 'catalog-title', text: T.layers.add }),
      el('button', { type: 'button', class: 'icon', 'aria-label': T.close, text: '×', onclick: () => dialog.close() })]),
    ...[search, full ? el('p', { class: 'hint', text: T.layers.limit }) : null, list].filter(Boolean),
  );
  if (!dialog.open) dialog.showModal();
  search.focus();
}

// "Start from template" (D-069): each template's name and what it sets up.
export function openTemplates(app) {
  const T = app.text;
  let dialog = $('template-dialog');
  if (!dialog) {
    dialog = el('dialog', { id: 'template-dialog', class: 'catalog-dialog', 'aria-labelledby': 'template-title' });
    document.body.append(dialog);
  }
  const templates = Object.entries(app.registry.catalog.templates ?? {});
  dialog.replaceChildren(
    el('div', { class: 'dialog-head' }, [el('h2', { id: 'template-title', text: T.templates.heading }),
      el('button', { type: 'button', class: 'icon', 'aria-label': T.close, text: '×', onclick: () => dialog.close() })]),
    el('div', { class: 'catalog' }, templates.map(([key, template]) => el('button', { type: 'button', class: 'template-item',
      onclick: () => { dialog.close(); app.actions.applyTemplate(key); } }, [
      el('strong', { text: template.title }), el('span', { class: 'hint', text: template.summary })]))),
  );
  if (!dialog.open) dialog.showModal();
}

export function renderLayers(app) {
  const T = app.text;
  const buttons = el('div', { class: 'button-row' }, [
    el('button', { type: 'button', class: 'primary', text: T.layers.add, disabled: app.doc.layers.length >= MAX_LAYERS, onclick: () => openCatalog(app) }),
    app.registry.catalog.templates && Object.keys(app.registry.catalog.templates).length
      ? el('button', { type: 'button', class: 'secondary', text: T.templates.start, onclick: () => app.actions.openTemplates() }) : null,
  ].filter(Boolean));
  $('panel-layers').replaceChildren(...[buttons,
    app.doc.layers.length ? el('ol', { id: 'layer-list', class: 'layer-list' }) : el('p', { class: 'hint', text: T.layers.empty })].filter(Boolean));
  for (const layer of app.doc.layers) {
    renderLayer(app, layer.id);
    for (const buffer of app.doc.buffers) if (buffer.layer === layer.id) $('layer-list').append(bufferRow(app, buffer));
  }
  renderProperties(app);
}

// A buffer layer in the layer list (D-077): show, name (opens it in Analysis), remove, and its status.
function bufferRow(app, buffer) {
  const T = app.text;
  const name = bufferName(buffer, app.registry.get(buffer.layer), T.buffer);
  const visible = el('input', { type: 'checkbox', id: `bv-${buffer.id}`, checked: buffer.visible, 'aria-label': `${T.layers.show}: ${name}` });
  visible.addEventListener('change', () => app.actions.setBuffer(buffer.id, { visible: visible.checked }));
  return el('li', { class: 'layer buffer-row', 'data-buffer-row': buffer.id }, [
    el('div', { class: 'layer-head' }, [visible,
      el('button', { type: 'button', class: 'layer-title', text: name, onclick: () => app.actions.openBuffer(buffer.id) }),
      el('span', { class: 'badge', text: T.buffer.badge }),
      el('button', { type: 'button', class: 'icon', 'aria-label': `${T.buffer.remove}: ${name}`, text: '×', onclick: () => app.actions.removeBuffer(buffer.id) })]),
    bufferStatusNode(app, buffer)]);
}

// ---- Analysis (D-068, D-076): the Buffer tool and Site screening ----

export function renderAnalysis(app) {
  const T = app.text;
  const tool = app.ui.tool;
  const switcher = el('div', { class: 'segmented', role: 'group', 'aria-label': T.analysis.tools }, ['buffer', 'screening'].map((key) =>
    el('button', { type: 'button', 'aria-pressed': String(tool === key), text: T.analysis[key], onclick: () => app.actions.setTool(key) })));
  $('panel-analysis').replaceChildren(switcher, ...(tool === 'screening' ? screeningNodes(app) : bufferToolNodes(app)));
}

function bufferToolNodes(app) {
  const T = app.text;
  const sources = app.bufferableLayers?.() ?? [];
  const nodes = app.doc.buffers.map((buffer) => (app.ui.editing === buffer.id ? bufferEditor(app, buffer, sources) : bufferCard(app, buffer)));
  if (!sources.length) nodes.push(el('p', { class: 'hint', text: T.buffer.noInput }));
  else if (app.doc.buffers.length >= MAX_BUFFERS) nodes.push(el('p', { class: 'hint', text: T.buffer.limit }));
  else {
    nodes.push(el('div', { class: 'button-row' }, el('button', { type: 'button', class: app.doc.buffers.length ? 'secondary' : 'primary',
      text: T.buffer.new, onclick: () => app.actions.newBuffer() })));
  }
  return nodes;
}

function nounFor(entry, n) {
  return n === 1 ? entry.noun.singular : entry.noun.plural;
}

function countText(app, buffer) {
  const count = app.inputCounts.get(buffer.id)?.count;
  if (count === null || count === undefined) return '';
  return app.text.buffer.count(formatCount(count), nounFor(app.registry.get(buffer.layer), count));
}

export function renderBufferCount(app, id) {
  const node = document.querySelector(`[data-buffer-count="${CSS.escape(id)}"]`);
  const buffer = app.doc.buffers.find((b) => b.id === id);
  if (node && buffer) node.textContent = countText(app, buffer);
}

// Running (with Cancel), failed, made, or out of date.
function bufferStatusNode(app, buffer) {
  const B = app.text.buffer;
  const entry = app.registry.get(buffer.layer);
  const job = app.bufferJobs.get(buffer.id);
  const output = app.outputs.get(buffer.id);
  const error = app.bufferErrors.get(buffer.id);
  const node = el('p', { class: 'status', 'data-buffer-status': buffer.id, role: 'status' });
  if (job) {
    node.append(el('span', { text: job.phase === 'reading' ? B.reading(formatCount(job.read)) : B.running(formatCount(job.done), formatCount(job.total)) }),
      el('span', { class: 'spinner', 'aria-hidden': 'true' }), ' ',
      el('button', { type: 'button', class: 'link-button', text: app.text.cancel, onclick: () => app.actions.cancelBuffer(buffer.id) }));
    return node;
  }
  if (error) {
    node.classList.add('error');
    node.textContent = error.kind === 'tooMany' ? B.tooMany(formatCount(MAX_BUFFER_FEATURES), entry.noun.plural)
      : error.kind === 'nothing' ? B.nothing(entry.noun.plural) : B.failed;
    return node;
  }
  if (!output) {
    node.textContent = B.notRun;
    return node;
  }
  const parts = [B.made(formatCount(output.inputs), nounFor(entry, output.inputs), output.distances.length)];
  if (output.skipped) parts.push(B.skipped(output.skipped));
  if (output.key !== app.bufferKey(buffer)) parts.push(B.stale);
  node.textContent = parts.join(' ');
  return node;
}

export function renderBufferProgress(app, id) {
  const buffer = app.doc.buffers.find((b) => b.id === id);
  if (!buffer) return;
  for (const node of document.querySelectorAll(`[data-buffer-status="${CSS.escape(id)}"]`)) node.replaceWith(bufferStatusNode(app, buffer));
}

function outputButtons(app, buffer) {
  const T = app.text;
  if (!app.outputs.has(buffer.id)) return [];
  return [
    el('button', { type: 'button', class: 'secondary', text: T.buffer.zoom, onclick: () => app.actions.zoomToBuffer(buffer.id) }),
    el('button', { type: 'button', class: 'secondary', text: `${T.buffer.download} (${T.formats.geojson})`, onclick: () => app.actions.downloadBuffer(buffer.id) }),
  ];
}

// A buffer not being edited: its name, distances with their swatches, and status.
function bufferCard(app, buffer) {
  const T = app.text;
  const name = bufferName(buffer, app.registry.get(buffer.layer), T.buffer);
  const visible = el('input', { type: 'checkbox', id: `bc-${buffer.id}`, checked: buffer.visible, 'aria-label': `${T.layers.show}: ${name}` });
  visible.addEventListener('change', () => app.actions.setBuffer(buffer.id, { visible: visible.checked }));
  const chips = [...buffer.distances].sort((a, b) => a.value - b.value).map((ring) => el('span', { class: 'ring-chip' }, [
    el('span', { class: 'ring-swatch small', style: ringSwatchStyle(ring.style), 'aria-hidden': 'true' }), formatDistance(ring.value, buffer.unit)]));
  return el('div', { class: 'buffer-card', 'data-buffer': buffer.id }, [
    el('div', { class: 'buffer-head' }, [visible, el('strong', { text: name }),
      el('button', { type: 'button', class: 'link-button', text: T.buffer.edit, onclick: () => app.actions.editBuffer(buffer.id) }),
      el('button', { type: 'button', class: 'icon', 'aria-label': `${T.buffer.remove}: ${name}`, text: '×', onclick: () => app.actions.removeBuffer(buffer.id) })]),
    el('div', { class: 'ring-chips' }, chips),
    bufferStatusNode(app, buffer),
    ...(app.outputs.has(buffer.id) ? [el('div', { class: 'button-row' }, outputButtons(app, buffer))] : []),
  ]);
}

// One distance: its value, a swatch that opens its style, and remove.
function ringRow(app, buffer, ring, index) {
  const B = app.text.buffer;
  const { id } = buffer;
  const label = formatDistance(ring.value, buffer.unit);
  const input = el('input', { type: 'number', id: `bd-${id}-${index}`, min: '0', max: String(MAX_DISTANCE[buffer.unit]), step: 'any',
    value: String(ring.value), 'aria-label': B.distance(index + 1) });
  input.addEventListener('change', () => {
    if (!app.actions.setRing(id, index, Number(input.value))) {
      flash(app, app.text.problems.badBufferDistance(`${input.value} ${buffer.unit}`));
      input.value = String(ring.value);
    }
  });
  const open = app.ui.ringStyle === `${id}:${index}`;
  const row = el('div', { class: 'ring-row' }, [input, el('span', { class: 'unit', text: buffer.unit }),
    el('button', { type: 'button', class: 'ring-swatch', style: ringSwatchStyle(ring.style), 'aria-expanded': String(open), 'aria-label': B.styleOf(label),
      title: B.styleOf(label), onclick: () => app.actions.toggleRingStyle(id, index) }),
    buffer.distances.length > 1 ? el('button', { type: 'button', class: 'icon', 'aria-label': B.removeDistance(label), text: '×', onclick: () => app.actions.removeRing(id, index) }) : null,
  ].filter(Boolean));
  return open ? el('div', { class: 'ring' }, [row, ringStyleForm(app, buffer, ring, index)]) : row;
}

// Fill color and opacity, outline color, width and style: each distance on its own (D-076).
function ringStyleForm(app, buffer, ring, index) {
  const B = app.text.buffer;
  const { style } = ring;
  const prefix = `rs-${buffer.id}-${index}`;
  const set = (patch) => app.actions.setRingStyle(buffer.id, index, patch);
  const field = (input, label) => el('div', { class: 'field inline' }, [el('label', { for: input.id, text: label }), input]);
  const color = (key) => {
    const input = el('input', { type: 'color', id: `${prefix}-${key}`, value: style[key] });
    input.addEventListener('change', () => set({ [key]: input.value }));
    return input;
  };
  const opacity = el('input', { type: 'range', id: `${prefix}-opacity`, min: '0', max: '1', step: '0.05', value: String(style.fill_opacity) });
  opacity.addEventListener('change', () => set({ fill_opacity: Number(opacity.value) }));
  const width = el('input', { type: 'number', id: `${prefix}-width`, min: '0', max: '8', step: '0.5', value: String(style.outline_width) });
  width.addEventListener('change', () => {
    const value = Number(width.value);
    if (Number.isFinite(value) && value >= 0 && value <= 8) set({ outline_width: value });
    else width.value = String(style.outline_width);
  });
  const dash = el('select', { id: `${prefix}-dash` }, OUTLINE_STYLES.map((key) => el('option', { value: key, text: B.outlineStyles[key] })));
  dash.value = style.outline_style;
  dash.addEventListener('change', () => set({ outline_style: dash.value }));
  return el('div', { class: 'ring-style' }, [field(color('fill'), B.fill), field(opacity, B.fillOpacity), field(color('outline'), B.outline),
    field(width, B.outlineWidth), field(dash, B.outlineStyle)]);
}

// The buffer being edited, top to bottom: name, input layer, which features, distances, dissolve, Create.
function bufferEditor(app, buffer, sources) {
  const T = app.text;
  const B = T.buffer;
  const { id } = buffer;
  const entry = app.registry.get(buffer.layer);
  const name = bufferName(buffer, entry, B);
  const nodes = [];

  const nameInput = el('input', { type: 'text', id: `bn-${id}`, value: buffer.name, placeholder: bufferName({ ...buffer, name: '' }, entry, B),
    autocomplete: 'off', 'aria-label': B.name });
  nameInput.addEventListener('change', () => app.actions.setBuffer(id, { name: nameInput.value.trim().slice(0, 80) }));
  nodes.push(el('div', { class: 'buffer-head' }, [nameInput,
    el('button', { type: 'button', class: 'secondary', text: B.close, onclick: () => app.actions.editBuffer(id) }),
    el('button', { type: 'button', class: 'icon', 'aria-label': `${B.remove}: ${name}`, text: '×', onclick: () => app.actions.removeBuffer(id) })]));

  const layerSelect = el('select', { id: `bl-${id}` }, sources.map((source) => el('option', { value: source.id, text: source.title })));
  layerSelect.value = buffer.layer;
  layerSelect.addEventListener('change', () => app.actions.setBufferLayer(id, layerSelect.value));
  nodes.push(el('div', { class: 'field' }, [el('label', { for: layerSelect.id, text: B.input }), layerSelect]));
  if (entry.buffer_presets?.length) {
    const active = presetOf(buffer, entry);
    nodes.push(el('fieldset', { class: 'filter' }, [el('legend', { text: B.presets }),
      el('div', { class: 'preset-row' }, entry.buffer_presets.map((preset) => el('button', { type: 'button',
        class: `secondary${active?.key === preset.key ? ' on' : ''}`, 'aria-pressed': String(active?.key === preset.key), text: preset.label,
        onclick: () => app.actions.applyPreset(id, preset.key) }))),
      active ? el('p', { class: 'hint', text: active.note }) : null].filter(Boolean)));
  }

  const radios = SELECTS.map((key) => {
    const radio = el('input', { type: 'radio', name: `bs-${id}`, id: `bs-${id}-${key}`, value: key, checked: buffer.select === key });
    radio.addEventListener('change', () => { if (radio.checked) app.actions.setBufferSelect(id, key); });
    return el('label', { class: 'check', for: radio.id }, [radio, el('span', { text: key === 'all' ? B.select.all(entry.noun.plural) : B.select[key] })]);
  });
  nodes.push(el('fieldset', { class: 'filter' }, [el('legend', { text: B.selectLabel }), ...radios]));
  if (buffer.select === 'filter') {
    const rt = app.runtimes.get(buffer.layer);
    if (rt) nodes.push(filterSection(app, { id: buffer.layer, filters: buffer.filters }, rt, { prefix: `b-${id}`, onChange: (filters) => app.actions.setBufferFilters(id, filters) }));
  }
  if (buffer.select === 'picked') {
    const picking = app.mode === 'pick' && app.ui.pickFor === id;
    nodes.push(el('div', { class: 'button-row' }, [
      el('button', { type: 'button', class: `secondary${picking ? ' on' : ''}`, 'aria-pressed': String(picking), text: picking ? B.done : B.pick,
        onclick: () => (picking ? app.actions.cancelMode() : app.actions.startPick(id)) }),
      buffer.picked.length ? el('button', { type: 'button', class: 'link-button', text: B.clearPicked, onclick: () => app.actions.clearPicked(id) }) : null,
    ].filter(Boolean)));
    if (picking) nodes.push(el('p', { class: 'hint', text: B.pickHint(entry.noun.plural) }));
  }
  nodes.push(el('p', { class: 'hint', 'data-buffer-count': id, text: countText(app, buffer) }));

  const units = el('div', { class: 'segmented small', role: 'group', 'aria-label': B.unit }, UNITS.map((unit) =>
    el('button', { type: 'button', 'aria-pressed': String(buffer.unit === unit), text: B.units[unit], onclick: () => app.actions.setBufferUnit(id, unit) })));
  nodes.push(el('fieldset', { class: 'filter distances' }, [el('legend', { text: B.distances }), units,
    ...buffer.distances.map((ring, index) => ringRow(app, buffer, ring, index)),
    buffer.distances.length < MAX_RINGS ? el('button', { type: 'button', class: 'link-button', text: B.addDistance, onclick: () => app.actions.addRing(id) }) : null,
    el('p', { class: 'hint', text: B.measured })].filter(Boolean)));

  const dissolve = el('input', { type: 'checkbox', id: `bz-${id}`, checked: buffer.dissolve });
  dissolve.addEventListener('change', () => app.actions.setBuffer(id, { dissolve: dissolve.checked }));
  nodes.push(el('label', { class: 'check', for: dissolve.id }, [dissolve, el('span', { text: B.dissolve })]));

  nodes.push(el('div', { class: 'button-row' }, [
    el('button', { type: 'button', class: 'primary', text: app.outputs.has(id) ? B.rerun : B.run, disabled: app.bufferJobs.has(id),
      onclick: () => app.actions.runBuffer(id) }),
    ...outputButtons(app, buffer)]));
  nodes.push(bufferStatusNode(app, buffer));
  return el('div', { class: 'buffer-card editing', 'data-buffer': id }, nodes);
}

export function bufferPopup(app, buffer, props) {
  const B = app.text.buffer;
  const entry = app.registry.get(buffer.layer);
  const output = app.outputs.get(buffer.id);
  const distance = output?.distances[props.ring];
  const detail = props.name ? String(props.name) : props.count ? B.dissolved(formatCount(props.count), nounFor(entry, props.count)) : '';
  return el('div', { class: 'popup' }, [el('p', { class: 'popup-layer', text: bufferName(buffer, entry, B) }),
    el('h3', { text: distance !== undefined ? formatDistance(distance, output.unit) : '' }), detail ? el('p', { text: detail }) : null].filter(Boolean));
}

// ---- Analysis: site screening ----

function sitePicker(app, sources) {
  const T = app.text;
  const nodes = [el('div', { class: 'button-row' }, [
    el('button', { type: 'button', class: `secondary${app.mode === 'select' ? ' on' : ''}`, text: T.screening.select, disabled: !sources.length, onclick: () => app.actions.startSelect() }),
    ...['point', 'line', 'area'].map((kind) => el('button', { type: 'button', class: 'secondary', text: T.screening.draw[kind], onclick: () => app.actions.startDraw(kind) }))])];
  if (app.mode === 'select' || app.draw?.active()) {
    nodes.push(el('p', { class: 'hint' }, [el('span', { text: app.mode === 'select' ? T.screening.selectHint : T.screening.drawHint }), ' ',
      el('button', { type: 'button', class: 'link-button', text: T.cancel, onclick: () => app.actions.cancelMode() })]));
  }
  nodes.push(...addressForm(app, true));
  const coordinates = el('input', { id: 'site-coordinates', type: 'text', placeholder: T.screening.coordinatesHint, autocomplete: 'off' });
  const coordinateForm = el('form', { class: 'inline-form' }, [el('label', { for: 'site-coordinates', class: 'visually-hidden', text: T.screening.coordinates }),
    coordinates, el('button', { type: 'submit', class: 'secondary', text: T.apply })]);
  coordinateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!app.actions.useCoordinates(coordinates.value)) flash(app, T.screening.coordinatesBad);
  });
  nodes.push(coordinateForm);
  return nodes;
}

// Site screening, top to bottom: the site, the distance, what to list, Run, and the results.
function screeningNodes(app) {
  const T = app.text;
  const screening = app.doc.screenings[0];
  const layers = app.doc.layers.map((l) => app.registry.get(l.id));
  const sources = layers.filter(isSource);
  const targets = layers.filter(isTarget);
  const nodes = [el('h3', { text: T.screening.site })];
  if (!screening) {
    nodes.push(...sitePicker(app, sources));
    return nodes;
  }
  const siteLayer = screening.source.kind === 'feature' ? app.registry.get(screening.source.layer)?.title : null;
  nodes.push(el('p', { class: 'site-line' }, [
    siteLayer ? el('span', { class: 'badge', text: siteLayer }) : null, ' ', el('strong', { text: screening.source.label || T.screening.drawnSite }), ' ',
    el('button', { type: 'button', class: 'link-button', 'aria-expanded': app.ui.changeSite ? 'true' : 'false', text: T.screening.changeSite,
      onclick: () => { app.ui.changeSite = !app.ui.changeSite; renderAnalysis(app); } }), ' ',
    el('button', { type: 'button', class: 'link-button', text: T.screening.clear, onclick: () => app.actions.clearScreening() })].filter(Boolean)));
  if (app.ui.changeSite || app.mode === 'select' || app.draw?.active()) nodes.push(el('div', { class: 'site-picker' }, sitePicker(app, sources)));

  const distance = el('select', { id: 'screening-distance' }, [...BUFFER_PRESETS_FT.map((ft) => el('option', { value: String(ft), text: `${ft} ${T.screening.feet}` })),
    el('option', { value: 'custom', text: T.screening.custom })]);
  const custom = el('input', { type: 'number', id: 'screening-custom', min: '1', max: '5280', step: '1', value: String(screening.distance_ft), 'aria-label': `${T.screening.custom} (${T.screening.feet})` });
  const isPreset = BUFFER_PRESETS_FT.includes(screening.distance_ft);
  distance.value = isPreset ? String(screening.distance_ft) : 'custom';
  custom.hidden = isPreset;
  distance.addEventListener('change', () => {
    if (distance.value === 'custom') { custom.hidden = false; custom.focus(); } else app.actions.setDistance(Number(distance.value));
  });
  custom.addEventListener('change', () => app.actions.setDistance(Number(custom.value)));
  nodes.push(el('div', { class: 'field inline' }, [el('label', { for: 'screening-distance', text: T.screening.distance }), distance, custom]));

  if (targets.length) {
    const boxes = targets.map((entry) => {
      const box = el('input', { type: 'checkbox', id: `t-${entry.id}`, checked: screening.targets.includes(entry.id) });
      box.addEventListener('change', () => app.actions.setTargets(targets.filter((t) => $(`t-${t.id}`).checked).map((t) => t.id)));
      return el('label', { class: 'check', for: box.id }, [box, el('span', { text: entry.title })]);
    });
    nodes.push(el('fieldset', { class: 'filter' }, [el('legend', { text: T.screening.targets }),
      el('div', { class: 'button-row small' }, [
        el('button', { type: 'button', class: 'link-button', text: T.screening.all, onclick: () => app.actions.setTargets(targets.map((t) => t.id)) }),
        el('button', { type: 'button', class: 'link-button', text: T.screening.none, onclick: () => app.actions.setTargets([]) })]),
      ...boxes]));
  } else nodes.push(el('p', { class: 'hint', text: T.screening.noTargets }));

  const results = app.results && app.results.bufferId === screening.id ? app.results : null;
  const stale = results && (results.key !== JSON.stringify([screening.source.geometry, screening.distance_ft])
    || results.targets.map((t) => t.id).join() !== screening.targets.join());
  nodes.push(el('div', { class: 'button-row' }, [
    el('button', { type: 'button', class: 'primary', text: app.ui.running ? T.loading : T.screening.run,
      disabled: app.ui.running || !screening.targets.length, onclick: () => app.actions.runScreening() }),
    stale ? el('span', { class: 'hint', text: T.screening.stale }) : null].filter(Boolean)));
  if (results) nodes.push(resultsNode(app, screening));
  return nodes;
}

function resultsNode(app, screening) {
  const T = app.text;
  const results = app.results;
  const counts = el('ul', { class: 'result-counts' }, results.targets.map((target) => el('li', {}, [
    el('span', { text: target.entry.title }),
    el('strong', { text: target.error ? T.layers.failed : target.capped ? T.screening.capped('5,000') : formatCount(target.count) })])));
  const total = results.targets.reduce((sum, t) => sum + (t.count ?? 0), 0);
  const rows = combinedRows(results, screening);
  const table = el('table', { class: 'results-table' }, [
    el('thead', {}, el('tr', {}, [T.screening.columns.layer, T.screening.columns.name, T.screening.columns.type].map((h) => el('th', { scope: 'col', text: h })))),
    el('tbody', {}, rows.slice(0, 100).map((row) => el('tr', { class: row.site ? 'site-row' : null }, [
      el('td', { text: row.layer }), el('td', { text: `${row.name}${row.site ? ` (${T.screening.siteMark})` : ''}` }), el('td', { text: row.type })]))),
  ]);
  return el('div', { class: 'results' }, [
    el('h3', { text: `${T.screening.results}: ${T.screening.total(formatCount(total))}` }),
    el('p', { class: 'label-box', text: T.screeningLabel(new Date().toISOString().slice(0, 10)) }),
    ...resultNotes(results).map((note) => el('p', { class: 'label-box', text: note })),
    counts,
    el('div', { class: 'button-row' }, [
      el('button', { type: 'button', class: 'secondary', text: T.screening.downloadList, onclick: () => app.actions.downloadResults('csv') }),
      el('button', { type: 'button', class: 'secondary', text: `${T.screening.downloadShapes} (${T.formats.geojson})`, onclick: () => app.actions.downloadResults('geojson') }),
      el('button', { type: 'button', class: 'secondary', 'aria-pressed': app.ui.showHits === false ? 'false' : 'true', text: T.layers.show, onclick: () => app.actions.toggleHits() })]),
    el('div', { class: 'table-scroll small' }, table),
  ]);
}

// ---- Export ----

export function renderExport(app) {
  const T = app.text;
  const { doc } = app;
  const text = (key, label, multiline = false) => {
    const id = `x-${key}`;
    const value = key === 'notes' ? doc.layout.notes : doc[key];
    const input = multiline ? el('textarea', { id, rows: '2' }) : el('input', { id, type: 'text' });
    input.value = value ?? '';
    input.addEventListener('input', () => app.actions.setText(key, input.value));
    return el('div', { class: 'field' }, [el('label', { for: id, text: label }), input]);
  };
  const select = (key, label, options) => {
    const id = `x-${key}`;
    const node = el('select', { id }, Object.entries(options).map(([value, name]) => el('option', { value, text: name })));
    node.value = doc.layout[key];
    node.addEventListener('change', () => app.actions.setLayout({ [key]: node.value }));
    return el('div', { class: 'field inline' }, [el('label', { for: id, text: label }), node]);
  };
  const check = (key, label) => {
    const box = el('input', { type: 'checkbox', id: `x-${key}`, checked: doc.layout[key] });
    box.addEventListener('change', () => app.actions.setLayout({ [key]: box.checked }));
    return el('label', { class: 'check', for: box.id }, [box, el('span', { text: label })]);
  };
  const data = doc.layers.map((layer) => {
    const entry = app.registry.get(layer.id);
    return el('li', {}, [el('span', { text: entry.title }),
      el('button', { type: 'button', class: 'link-button', text: T.formats.csv, onclick: () => app.actions.exportData(layer.id, 'csv') }),
      el('button', { type: 'button', class: 'link-button', text: T.formats.geojson, onclick: () => app.actions.exportData(layer.id, 'geojson') })]);
  });
  for (const buffer of doc.buffers) {
    if (!app.outputs.has(buffer.id)) continue;
    data.push(el('li', {}, [el('span', { text: bufferName(buffer, app.registry.get(buffer.layer), T.buffer) }),
      el('button', { type: 'button', class: 'link-button', text: T.formats.geojson, onclick: () => app.actions.downloadBuffer(buffer.id) })]));
  }
  $('panel-export').replaceChildren(...[
    el('p', { class: 'export-summary', text: app.exportSummary?.() ?? '' }),
    text('subtitle', T.export.subtitle), text('notes', T.export.notes, true),
    select('paper', T.export.paper, T.export.papers), select('orientation', T.export.orientation, T.export.orientations),
    el('div', { class: 'checks' }, [check('legend', T.export.legend), check('scale_bar', T.export.scaleBar), check('north_arrow', T.export.northArrow)]),
    el('div', { class: 'button-row' }, [
      el('button', { type: 'button', class: 'primary', text: T.export.preview, onclick: () => app.actions.previewPrint() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.print, onclick: () => app.actions.print() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.png, onclick: () => app.actions.png() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.link, onclick: () => app.actions.copyLink() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.mapFile, onclick: () => app.actions.saveFile() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.embed, onclick: () => app.actions.copyEmbed() })]),
    data.length ? el('h3', { text: T.export.data }) : null,
    data.length ? el('ul', { class: 'data-list' }, data) : null,
  ].filter(Boolean));
}

// The print layout at a readable size before printing (the owner's review, 2026-09-27).
export function showPrintPreview(app, root, page, onPrint) {
  const T = app.text;
  let dialog = $('print-preview');
  if (!dialog) {
    dialog = el('dialog', { id: 'print-preview', class: 'print-preview', 'aria-labelledby': 'print-preview-title' });
    document.body.append(dialog);
  }
  const available = Math.min(window.innerWidth - 80, 1100);
  const scale = Math.min(1, available / page.width);
  const sheet = el('div', { class: 'preview-sheet', style: `width:${Math.round(page.width * scale)}px;height:${Math.round(page.height * scale)}px` },
    el('div', { class: 'preview-scale', style: `transform:scale(${scale})` }, root));
  dialog.replaceChildren(
    el('div', { class: 'dialog-head' }, [el('h2', { id: 'print-preview-title', text: T.export.previewHeading }),
      el('div', { class: 'button-row' }, [
        el('button', { type: 'button', class: 'primary', text: T.export.print, onclick: () => { dialog.close(); onPrint(); } }),
        el('button', { type: 'button', class: 'icon', 'aria-label': T.close, text: '×', onclick: () => dialog.close() })])]),
    sheet,
  );
  if (!dialog.open) dialog.showModal();
}

// ---- Legend, popups, table ----

export function renderLegend(app) {
  const node = $('legend');
  if (!node || !app.registry) return;
  const groups = app.legendGroups?.() ?? [];
  node.hidden = !groups.length;
  const label = app.embed && app.doc.screenings.length ? el('p', { class: 'label-box', text: app.text.screeningLabel(new Date().toISOString().slice(0, 10)) }) : null;
  const phone = window.matchMedia?.('(max-width: 760px)').matches;
  const open = node.querySelector('details')?.open ?? !phone; // keep the reader's choice between redraws
  node.replaceChildren(el('details', { open }, [el('summary', { text: app.text.export.legend }), legendNode(groups), label].filter(Boolean)));
}

// Several features under one click in select mode: one button each (D-067).
export function siteChooser(app, hits, onChoose) {
  return el('div', { class: 'popup' }, [el('p', { class: 'popup-layer', text: app.text.screening.chooseSite }),
    el('ul', { class: 'site-choices' }, hits.map((hit) => {
      const entry = app.registry.get(hit.key);
      const name = hit.properties[entry.label_field] ?? hit.properties.atlas_id ?? app.text.notRecorded;
      return el('li', {}, el('button', { type: 'button', class: 'link-button', text: `${entry.title}: ${name}`, onclick: () => onChoose(hit) }));
    }))]);
}

export function popup(app, entry, props) {
  const rows = [];
  for (const field of entry.fields) {
    if (!field.popup || field.name === entry.label_field) continue;
    rows.push(el('dt', { text: field.label }), el('dd', { text: formatValue(props[field.name], field, app.text.notRecorded) }));
  }
  return el('div', { class: 'popup' }, [el('p', { class: 'popup-layer', text: entry.title }),
    el('h3', { text: String(props[entry.label_field] ?? app.text.notRecorded) }), el('dl', {}, rows)]);
}

export function renderTable(app) {
  const drawer = $('table-drawer');
  const table = app.table;
  if (!table) { drawer.hidden = true; drawer.replaceChildren(); return; }
  const T = app.text;
  const entry = app.registry.get(table.id);
  const rt = app.runtimes.get(table.id);
  const columns = [entry.fields.find((f) => f.name === entry.label_field), ...entry.fields.filter((f) => f.popup && f.name !== entry.label_field)].filter(Boolean);
  const sortable = (rt?.matched ?? Infinity) <= SORT_LIMIT;
  const head = el('tr', {}, columns.map((field) => el('th', { scope: 'col' }, sortable
    ? el('button', { type: 'button', class: 'link-button', text: `${field.label}${table.sort === field.name ? ' ↓' : ''}`, onclick: () => app.actions.sortTable(field.name) })
    : field.label)));
  const body = table.rows.map((row) => el('tr', { tabindex: '0', onclick: () => app.actions.zoomTo(table.id, row),
    onkeydown: (event) => { if (event.key === 'Enter') app.actions.zoomTo(table.id, row); } },
  columns.map((field) => el('td', { text: formatValue(row[field.name], field, T.notRecorded) }))));
  drawer.hidden = false;
  drawer.replaceChildren(...[
    el('div', { class: 'drawer-head' }, [el('strong', { text: entry.title }),
      el('span', { class: 'hint', text: rt?.matched !== null && rt?.matched !== undefined ? T.count(formatCount(rt.matched), entry.noun.plural) : '' }),
      el('button', { type: 'button', class: 'icon', 'aria-label': T.close, text: '×', onclick: () => app.actions.toggleTable(table.id) })]),
    el('div', { class: 'table-scroll' }, el('table', {}, [el('thead', {}, head), el('tbody', {}, body)])),
    table.loading ? el('p', { class: 'hint', text: T.loading }) : null,
    !table.done && !table.loading ? el('button', { type: 'button', class: 'secondary', text: '+200', onclick: () => app.actions.loadMoreRows() }) : null,
  ].filter(Boolean));
}
