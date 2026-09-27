// Studio's panels, legend, table and popups, drawn from the map document and the layer runtimes.
// Data values only go into textContent. Every string comes from text.js.
import { el } from './dom.js';
import { isTarget, isSource } from './registry.js';
import { presetStyle } from './style.js';
import { combinedRows, resultNotes } from './buffer.js';
import { BUFFER_PRESETS_FT, MAX_LAYERS } from './mapdoc.js';
import { legendNode } from './export.js';
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
  for (const [id, key] of [['area-heading', 'area'], ['layers-heading', 'layers'], ['buffer-heading', 'buffer'], ['export-heading', 'export']]) {
    $(id).textContent = T.panels[key];
  }
  $('embed-open').textContent = T.embed.open;
  // Phones open on the map, with the panels folded below it.
  if (window.matchMedia?.('(max-width: 760px)').matches) document.querySelectorAll('.panel-block').forEach((block) => { block.open = false; });
  $('embed-open').href = location.href.replace('?embed=1', '').replace('&embed=1', '');
}

export function renderAll(app) {
  if (!app.registry) return;
  renderArea(app);
  renderLayers(app);
  renderBuffer(app);
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
  const mask = el('input', { type: 'checkbox', id: 'area-mask', checked: doc.mask });
  mask.addEventListener('change', () => app.actions.setMask(mask.checked));
  $('panel-area').replaceChildren(
    el('div', { class: 'field' }, [el('label', { for: 'area-level', text: T.area.level }), levelSelect]),
    ...pickers,
    el('label', { class: 'check', for: 'area-mask' }, [mask, el('span', { text: T.area.mask })]),
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

function filterSection(app, layer, rt) {
  const T = app.text;
  const { entry } = rt;
  const current = new Map(layer.filters.map((c) => [c.field, c]));
  const container = el('div', { class: 'filters' });
  let timer = null;
  const emit = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => app.actions.setFilters(layer.id, readFilters(container, entry)), delay);
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
      container.append(checklist(app, layer.id, field, rt.stats.values[field.name] ?? [], current.get(field.name), () => emit(0)));
    } else if (field.filter === 'search') {
      const id = `f-${layer.id}-${field.name}`;
      const input = el('input', { type: 'search', id, value: current.get(field.name)?.value ?? '', autocomplete: 'off' });
      input.addEventListener('input', () => emit(400));
      container.append(el('div', { class: 'field filter', 'data-field': field.name }, [el('label', { for: id, text: field.label }), input]));
    } else if (field.filter === 'range') {
      const type = field.type === 'date' ? 'date' : 'number';
      const range = rt.stats.ranges?.[field.name] ?? {};
      const bound = (name, label) => {
        const id = `f-${layer.id}-${field.name}-${name}`;
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
      text: example.label, onclick: () => app.actions.setFilters(layer.id, example.conditions) }))));
  }
  if (layer.filters.length) nodes.push(el('button', { type: 'button', class: 'link-button', text: T.filters.clear, onclick: () => app.actions.setFilters(layer.id, []) }));
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
  ];
  const list = el('dl', { class: 'about' }, rows.flatMap(([label, value]) => [el('dt', { text: label }), el('dd', { text: value })]));
  const nodes = [el('p', { class: 'hint', text: entry.summary }), list];
  if (entry.area_mode === 'intersects') nodes.push(el('p', { class: 'hint', text: T.area.touching }));
  if (entry.access === 'hybrid' && !entry.tiles) nodes.push(el('p', { class: 'hint', text: T.layers.drawnLive }));
  nodes.push(el('a', { href: entry.source.landing_page, target: '_blank', rel: 'noopener', text: T.about.more }));
  return el('div', { class: 'section' }, nodes);
}

export function renderLayer(app, id) {
  const T = app.text;
  const index = app.doc.layers.findIndex((l) => l.id === id);
  const layer = app.doc.layers[index];
  const rt = app.runtimes.get(id);
  const old = document.querySelector(`[data-layer="${CSS.escape(id)}"]`);
  if (!layer || !rt) { old?.remove(); return; }
  const open = app.ui.open[id] ?? {};
  const visible = el('input', { type: 'checkbox', id: `v-${id}`, checked: layer.visible, 'aria-label': `${T.layers.show}: ${rt.entry.title}` });
  visible.addEventListener('change', () => app.actions.setLayer(id, { visible: visible.checked }));
  const opacity = el('input', { type: 'range', id: `o-${id}`, min: '0.1', max: '1', step: '0.1', value: String(layer.opacity), 'aria-label': `${T.layers.opacity}: ${rt.entry.title}` });
  opacity.addEventListener('change', () => app.actions.setLayer(id, { opacity: Number(opacity.value) }));
  const toggle = (section, label) => el('button', { type: 'button', class: `tab${open[section] ? ' on' : ''}`, 'aria-expanded': open[section] ? 'true' : 'false',
    text: label, onclick: () => app.actions.toggleSection(id, section) });
  const tabs = [toggle('filter', T.layers.filter), toggle('style', T.layers.style), toggle('table', T.layers.table), toggle('about', T.layers.about)];
  if (!rt.entry.fields.some((f) => f.filter !== 'none')) tabs.shift();
  const node = el('li', { class: 'layer', 'data-layer': id }, [
    el('div', { class: 'layer-head' }, [
      visible,
      el('label', { for: visible.id, class: 'layer-title', text: rt.entry.title }),
      el('span', { class: 'badge', title: T.layers.access[rt.entry.access], text: T.layers.access[rt.entry.access] }),
      el('button', { type: 'button', class: 'icon', 'aria-label': `${T.layers.up}: ${rt.entry.title}`, text: '↑', disabled: index === 0, onclick: () => app.actions.moveLayer(id, -1) }),
      el('button', { type: 'button', class: 'icon', 'aria-label': `${T.layers.down}: ${rt.entry.title}`, text: '↓', disabled: index === app.doc.layers.length - 1, onclick: () => app.actions.moveLayer(id, 1) }),
      el('button', { type: 'button', class: 'icon', 'aria-label': `${T.remove}: ${rt.entry.title}`, text: '×', onclick: () => app.actions.removeLayer(id) }),
    ]),
    el('div', { class: 'layer-meta' }, [el('p', { class: 'status', 'data-status': id, role: 'status' }), opacity]),
    el('div', { class: 'tabs' }, tabs),
    open.filter ? filterSection(app, layer, rt) : null,
    open.style ? styleSection(app, layer, rt) : null,
    open.about ? aboutSection(app, rt) : null,
  ]);
  if (old) old.replaceWith(node);
  else $('layer-list')?.append(node);
  renderLayerStatus(app, id);
}

function catalogChooser(app) {
  const T = app.text;
  const search = el('input', { type: 'search', id: 'add-search', placeholder: T.layers.search, value: app.ui.addQuery, autocomplete: 'off' });
  const list = el('div', { class: 'catalog' });
  const full = app.doc.layers.length >= MAX_LAYERS;
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    app.ui.addQuery = search.value;
    list.replaceChildren(...app.registry.groups.map(({ category, layers }) => {
      const shown = layers.filter((entry) => !query || `${entry.title} ${entry.summary}`.toLowerCase().includes(query));
      if (!shown.length) return null;
      return el('div', { class: 'catalog-group' }, [el('h3', { text: T.categories[category] ?? category }),
        ...shown.map((entry) => {
          const added = app.doc.layers.some((l) => l.id === entry.id);
          return el('button', { type: 'button', class: 'catalog-item', disabled: added || full, onclick: () => app.actions.addLayer(entry.id) }, [
            el('span', { text: entry.title }), el('span', { class: 'badge', text: added ? T.layers.added : T.layers.access[entry.access] })]);
        })]);
    }).filter(Boolean));
  };
  search.addEventListener('input', draw);
  draw();
  return el('div', { class: 'chooser' }, [el('label', { for: 'add-search', class: 'visually-hidden', text: T.layers.search }), search,
    full ? el('p', { class: 'hint', text: T.layers.limit }) : null, list]);
}

export function renderLayers(app) {
  const T = app.text;
  const add = el('button', { type: 'button', class: 'primary', 'aria-expanded': app.ui.addOpen ? 'true' : 'false', text: T.layers.add, onclick: () => app.actions.toggleAdd() });
  $('panel-layers').replaceChildren(...[add, app.ui.addOpen ? catalogChooser(app) : null,
    app.doc.layers.length ? el('ol', { id: 'layer-list', class: 'layer-list' }) : el('p', { class: 'hint', text: T.layers.empty })].filter(Boolean));
  for (const layer of app.doc.layers) renderLayer(app, layer.id);
}

// ---- Buffer ----

export function renderBuffer(app) {
  const T = app.text;
  const buffer = app.doc.buffers[0];
  const sources = app.doc.layers.map((l) => app.registry.get(l.id)).filter(isSource);
  const targets = app.doc.layers.map((l) => app.registry.get(l.id)).filter(isTarget);
  const nodes = [];
  if (app.registry.catalog.templates?.site_screening) {
    nodes.push(el('button', { type: 'button', class: 'secondary', text: T.buffer.templateStart, onclick: () => app.actions.startScreening() }));
  }
  const siteButtons = el('div', { class: 'button-row' }, [
    el('button', { type: 'button', class: `secondary${app.mode === 'select' ? ' on' : ''}`, text: T.buffer.select, disabled: !sources.length, onclick: () => app.actions.startSelect() }),
    ...['point', 'line', 'area'].map((kind) => el('button', { type: 'button', class: 'secondary', text: T.buffer.draw[kind], onclick: () => app.actions.startDraw(kind) }))]);
  nodes.push(el('h3', { text: T.buffer.site }), siteButtons);
  if (app.mode === 'select' || app.draw?.active()) {
    nodes.push(el('p', { class: 'hint', text: app.mode === 'select' ? T.buffer.selectHint : T.buffer.drawHint }),
      el('button', { type: 'button', class: 'link-button', text: T.cancel, onclick: () => app.actions.cancelMode() }));
  }
  nodes.push(...addressForm(app, true));
  const coordinates = el('input', { id: 'site-coordinates', type: 'text', placeholder: T.buffer.coordinatesHint, autocomplete: 'off' });
  const coordinateForm = el('form', { class: 'inline-form' }, [el('label', { for: 'site-coordinates', class: 'visually-hidden', text: T.buffer.coordinates }),
    coordinates, el('button', { type: 'submit', class: 'secondary', text: T.apply })]);
  coordinateForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!app.actions.useCoordinates(coordinates.value)) flash(app, T.buffer.coordinatesBad);
  });
  nodes.push(coordinateForm);

  if (buffer) {
    nodes.push(el('p', { class: 'site-line' }, [el('strong', { text: `${T.buffer.site}: ` }), el('span', { text: buffer.source.label || T.buffer.drawnSite }),
      ' ', el('button', { type: 'button', class: 'link-button', text: T.buffer.clear, onclick: () => app.actions.clearBuffer() })]));
    const distance = el('select', { id: 'buffer-distance' }, [...BUFFER_PRESETS_FT.map((ft) => el('option', { value: String(ft), text: `${ft} ${T.buffer.feet}` })),
      el('option', { value: 'custom', text: T.buffer.custom })]);
    const custom = el('input', { type: 'number', id: 'buffer-custom', min: '1', max: '5280', step: '1', value: String(buffer.distance_ft), 'aria-label': `${T.buffer.custom} (${T.buffer.feet})` });
    const isPreset = BUFFER_PRESETS_FT.includes(buffer.distance_ft);
    distance.value = isPreset ? String(buffer.distance_ft) : 'custom';
    custom.hidden = isPreset;
    distance.addEventListener('change', () => {
      if (distance.value === 'custom') { custom.hidden = false; custom.focus(); } else app.actions.setDistance(Number(distance.value));
    });
    custom.addEventListener('change', () => app.actions.setDistance(Number(custom.value)));
    nodes.push(el('div', { class: 'field inline' }, [el('label', { for: 'buffer-distance', text: T.buffer.distance }), distance, custom]));
    if (targets.length) {
      const boxes = targets.map((entry) => {
        const box = el('input', { type: 'checkbox', id: `t-${entry.id}`, checked: buffer.targets.includes(entry.id) });
        box.addEventListener('change', () => app.actions.setTargets(targets.filter((t) => $(`t-${t.id}`).checked).map((t) => t.id)));
        return el('label', { class: 'check', for: box.id }, [box, el('span', { text: entry.title })]);
      });
      nodes.push(el('fieldset', { class: 'filter' }, [el('legend', { text: T.buffer.targets }), ...boxes]));
    } else nodes.push(el('p', { class: 'hint', text: T.buffer.noTargets }));
    nodes.push(el('button', { type: 'button', class: 'primary', text: app.ui.running ? T.loading : T.buffer.run,
      disabled: app.ui.running || !buffer.targets.length, onclick: () => app.actions.runBuffer() }));
    if (app.results && app.results.bufferId === buffer.id) nodes.push(resultsNode(app, buffer));
  }
  $('panel-buffer').replaceChildren(...nodes);
}

function resultsNode(app, buffer) {
  const T = app.text;
  const results = app.results;
  const counts = el('ul', { class: 'result-counts' }, results.targets.map((target) => el('li', {}, [
    el('span', { text: target.entry.title }),
    el('strong', { text: target.error ? T.layers.failed : target.capped ? T.buffer.capped('5,000') : formatCount(target.count) })])));
  const total = results.targets.reduce((sum, t) => sum + (t.count ?? 0), 0);
  const rows = combinedRows(results, buffer);
  const table = el('table', { class: 'results-table' }, [
    el('thead', {}, el('tr', {}, [T.buffer.columns.layer, T.buffer.columns.name, T.buffer.columns.type].map((h) => el('th', { scope: 'col', text: h })))),
    el('tbody', {}, rows.slice(0, 100).map((row) => el('tr', { class: row.site ? 'site-row' : null }, [
      el('td', { text: row.layer }), el('td', { text: `${row.name}${row.site ? ` (${T.buffer.siteMark})` : ''}` }), el('td', { text: row.type })]))),
  ]);
  return el('div', { class: 'results' }, [
    el('h3', { text: `${T.buffer.results}: ${T.buffer.total(formatCount(total))}` }),
    el('p', { class: 'label-box', text: T.screeningLabel(new Date().toISOString().slice(0, 10)) }),
    ...resultNotes(results).map((note) => el('p', { class: 'label-box', text: note })),
    counts,
    el('div', { class: 'button-row' }, [
      el('button', { type: 'button', class: 'secondary', text: T.buffer.downloadList, onclick: () => app.actions.downloadResults('csv') }),
      el('button', { type: 'button', class: 'secondary', text: `${T.buffer.downloadShapes} (${T.formats.geojson})`, onclick: () => app.actions.downloadResults('geojson') }),
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
  $('panel-export').replaceChildren(...[
    text('title', T.export.title), text('subtitle', T.export.subtitle), text('notes', T.export.notes, true),
    select('paper', T.export.paper, T.export.papers), select('orientation', T.export.orientation, T.export.orientations),
    el('div', { class: 'checks' }, [check('legend', T.export.legend), check('scale_bar', T.export.scaleBar), check('north_arrow', T.export.northArrow)]),
    el('div', { class: 'button-row' }, [
      el('button', { type: 'button', class: 'primary', text: T.export.print, onclick: () => app.actions.print() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.png, onclick: () => app.actions.png() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.link, onclick: () => app.actions.copyLink() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.mapFile, onclick: () => app.actions.saveFile() }),
      el('button', { type: 'button', class: 'secondary', text: T.export.embed, onclick: () => app.actions.copyEmbed() })]),
    data.length ? el('h3', { text: T.export.data }) : null,
    data.length ? el('ul', { class: 'data-list' }, data) : null,
  ].filter(Boolean));
}

// ---- Legend, popups, table ----

export function renderLegend(app) {
  const node = $('legend');
  if (!node || !app.registry) return;
  const groups = app.legendGroups?.() ?? [];
  node.hidden = !groups.length;
  const label = app.embed && app.doc.buffers.length ? el('p', { class: 'label-box', text: app.text.screeningLabel(new Date().toISOString().slice(0, 10)) }) : null;
  const phone = window.matchMedia?.('(max-width: 760px)').matches;
  const open = node.querySelector('details')?.open ?? !phone; // keep the reader's choice between redraws
  node.replaceChildren(el('details', { open }, [el('summary', { text: app.text.export.legend }), legendNode(groups), label].filter(Boolean)));
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
      el('button', { type: 'button', class: 'icon', 'aria-label': T.close, text: '×', onclick: () => app.actions.toggleSection(table.id, 'table') })]),
    el('div', { class: 'table-scroll' }, el('table', {}, [el('thead', {}, head), el('tbody', {}, body)])),
    table.loading ? el('p', { class: 'hint', text: T.loading }) : null,
    !table.done && !table.loading ? el('button', { type: 'button', class: 'secondary', text: '+200', onclick: () => app.actions.loadMoreRows() }) : null,
  ].filter(Boolean));
}
