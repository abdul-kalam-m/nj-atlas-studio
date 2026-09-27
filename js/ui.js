// Builds the panels, popups, dialogs and table from catalog entries. Data values only ever go into textContent.
import { TEXT } from './text.js';
import { formatBytes, formatCount, formatDate, formatNumber, formatValue } from './format.js';
import { LEVEL_KEYS, pickerLevels, pickerNeeds, unitsFor } from './places.js';

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

export function textFor(path) {
  return path.split('.').reduce((value, key) => value?.[key], TEXT) ?? path;
}

export function applyStaticText(root = document) {
  document.title = TEXT.siteTitle;
  for (const node of root.querySelectorAll('[data-text]')) node.textContent = textFor(node.dataset.text);
}

export function setStatus(node, message, { error = false, retry = null } = {}) {
  node.replaceChildren(message ? el('span', { text: message }) : '');
  node.classList.toggle('error', error);
  if (retry) node.append(' ', el('button', { class: 'link-button', type: 'button', text: TEXT.tryAgain, onclick: retry }));
}

export function fieldByName(entry, name) {
  return entry.fields.find((field) => field.name === name);
}

// Place columns the build added to a layer (not its own fields), e.g. municipality and county.
function tagColumns(entry) {
  const own = new Set(['atlas_id', 'lon', 'lat', ...entry.fields.map((field) => field.name)]);
  return new Set(entry.table_columns.filter((column) => !own.has(column)));
}

function placeRows(entry, props) {
  const tags = tagColumns(entry);
  const rows = [];
  if (tags.has('municipality')) {
    const where = props.county_fips ? [props.municipality, props.county].filter(Boolean).join(', ') : TEXT.place.outside;
    rows.push([TEXT.place.where, where]);
  } else if (tags.has('county') && props.county) {
    rows.push([TEXT.levels.county, props.county]);
  }
  for (const level of ['tract', 'block_group']) if (tags.has(level) && props[level]) rows.push([TEXT.levels[level], props[level]]);
  return rows;
}

// Popup for one clicked item: title, then the popup fields and where it is, as label/value rows.
export function buildPopup(entry, props) {
  const rows = [];
  for (const field of entry.fields) {
    if (!field.popup || field.name === entry.label_field) continue;
    rows.push(el('dt', { text: field.label }), el('dd', { text: formatValue(props[field.name], field, TEXT.notRecorded) }));
  }
  for (const [label, value] of placeRows(entry, props)) rows.push(el('dt', { text: label }), el('dd', { text: value }));
  const title = props[entry.label_field] ?? TEXT.notRecorded;
  return el('div', { class: 'popup' }, [el('h3', { text: String(title) }), el('dl', {}, rows)]);
}

// ---- Boundary: level list, area pickers, and the Data list ----

export function renderBoundaryOptions(select, levels) {
  select.replaceChildren(...levels.map((level) => el('option', { value: level.id, text: TEXT.levels[level.id] })));
}

export function renderBoundaryHint(node, level) {
  node.textContent = TEXT.boundary.hints[level.id](formatCount(level.count ?? 1));
}

// One list per level from county down to the chosen boundary level. Smaller lists wait for the larger choice.
export function renderAreaPickers(container, boundary, units, place, onPick) {
  container.replaceChildren();
  for (const level of pickerLevels(boundary)) {
    const id = `area-${level}`;
    const code = place[LEVEL_KEYS[level]];
    const needs = pickerNeeds(level);
    const select = el('select', { id });
    if (!units[level]) {
      select.append(el('option', { value: '', text: TEXT.loading }));
      select.disabled = true;
    } else if (needs && !place[needs]) {
      select.append(el('option', { value: '', text: TEXT.area.chooseFirst[needs] }));
      select.disabled = true;
    } else {
      const listed = unitsFor(level, units[level], place);
      if (code && !listed.some((unit) => unit.code === code)) { // e.g. from a link: still show what is chosen
        listed.unshift(units[level].find((unit) => unit.code === code) ?? { code, name: code });
      }
      select.append(el('option', { value: '', text: TEXT.area.all[level] }),
        ...listed.map((unit) => el('option', { value: unit.code, text: unit.name })));
      select.value = code ?? '';
    }
    select.addEventListener('change', () => onPick(level, select.value || null));
    container.append(el('div', { class: 'field' }, [el('label', { for: id, text: TEXT.levels[level] }), select]));
  }
}

// Data list: every layer that is not a boundary level, grouped by category (Environment, Hazards, ...).
export function renderDataOptions(select, catalog, levels) {
  const boundaryLayers = new Set(levels.map((level) => level.layer));
  const groups = [];
  for (const category of catalog.categories) {
    const layers = catalog.layers.filter((layer) => layer.category === category && !boundaryLayers.has(layer.id));
    if (!layers.length) continue;
    groups.push(el('optgroup', { label: TEXT.categories[category] ?? category },
      layers.map((layer) => el('option', { value: layer.id, text: layer.title }))));
  }
  select.replaceChildren(el('option', { value: '', text: TEXT.data.none }), ...groups);
}

function nounFor(entry, count) {
  return count === 1 ? entry.noun.singular : entry.noun.plural;
}

export function renderDataNote(node, entry, boundaryView) {
  const count = formatCount(entry.rows);
  let text = `${entry.summary} ${TEXT.itemCount(count, nounFor(entry, entry.rows))}.`;
  if (boundaryView) text = TEXT.data.boundariesOnly(count, nounFor(entry, entry.rows));
  else if (entry.partition) {
    text = `${entry.summary} ${TEXT.data.partitioned(count, entry.noun.plural, formatCount(entry.partition.count))}`;
  }
  node.replaceChildren(...[entry.status === 'draft' ? el('span', { class: 'badge', text: TEXT.draft }) : null,
    el('span', { text })].filter(Boolean));
}

// ---- Narrow it down: controls generated from the layer's fields ----

const VISIBLE_OPTIONS = 8;

function checklistControl(field, values, condition) {
  const chosen = new Set(condition?.values ?? []);
  const list = el('div', { class: 'checklist' });
  values.forEach((item, index) => {
    const blank = item.value === null;
    const name = blank ? TEXT.filters.blank : item.value;
    const box = el('input', { type: 'checkbox', id: `filter-${field.name}-${index}`, 'data-value': blank ? null : item.value,
      'data-blank': blank ? 'true' : null, 'aria-label': `${name} (${formatCount(item.count)})` });
    box.checked = blank ? Boolean(condition?.include_blank) : chosen.has(item.value);
    list.append(el('label', { class: 'check', for: box.id, hidden: index >= VISIBLE_OPTIONS && !box.checked },
      [box, el('span', { text: blank ? TEXT.filters.blank : item.value }), el('span', { class: 'n', text: formatCount(item.count) })]));
  });
  const fieldset = el('fieldset', { class: 'filter', 'data-field': field.name }, [el('legend', { text: field.label }), list]);
  if (values.length > VISIBLE_OPTIONS) {
    const toggle = el('button', { type: 'button', class: 'link-button', 'aria-expanded': 'false',
      text: TEXT.filters.showAll(formatCount(values.length)) });
    toggle.addEventListener('click', () => {
      const expand = toggle.getAttribute('aria-expanded') === 'false';
      [...list.children].forEach((label, index) => {
        if (index >= VISIBLE_OPTIONS) label.hidden = !expand && !label.querySelector('input').checked;
      });
      toggle.setAttribute('aria-expanded', String(expand));
      toggle.textContent = expand ? TEXT.filters.showFewer : TEXT.filters.showAll(formatCount(values.length));
    });
    fieldset.append(toggle);
  }
  return fieldset;
}

function searchControl(field, condition) {
  const id = `filter-${field.name}`;
  return el('div', { class: 'field filter', 'data-field': field.name }, [
    el('label', { for: id, text: field.label }),
    el('input', { type: 'search', id, placeholder: TEXT.filters.searchPlaceholder, value: condition?.value ?? '',
      autocomplete: 'off' }),
  ]);
}

function boundText(value, field) {
  if (value === null || value === undefined) return '';
  return field.type === 'number' ? formatNumber(value, field.decimals ?? 2) : String(value);
}

function rangeControl(field, range, condition) {
  const type = field.type === 'date' ? 'date' : 'number';
  const input = (bound, label, hint) => {
    const id = `filter-${field.name}-${bound}`;
    const value = condition?.[bound];
    return el('label', { for: id }, [label, el('input', { type, id, 'data-bound': bound, step: type === 'number' ? 'any' : null,
      inputmode: type === 'number' ? 'decimal' : null, placeholder: boundText(hint, field),
      value: value === null || value === undefined ? '' : String(value) })]);
  };
  const legend = field.unit ? `${field.label} (${field.unit})` : field.label;
  return el('fieldset', { class: 'filter', 'data-field': field.name }, [el('legend', { text: legend }),
    el('div', { class: 'range' }, [input('min', TEXT.filters.atLeast, range?.min), input('max', TEXT.filters.atMost, range?.max)])]);
}

export function renderFilters(container, entry, state, onChange) {
  const current = new Map(state.conditions.map((condition) => [condition.field, condition]));
  container.replaceChildren();
  for (const field of entry.fields) {
    if (field.filter === 'checklist') container.append(checklistControl(field, entry.values[field.name] ?? [], current.get(field.name)));
    else if (field.filter === 'search') container.append(searchControl(field, current.get(field.name)));
    else if (field.filter === 'range') container.append(rangeControl(field, entry.ranges[field.name], current.get(field.name)));
  }
  let timer = null;
  const emit = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(readFilters(container, entry)), delay);
  };
  container.oninput = (event) => {
    if (event.target.type === 'search') emit(250);
    else if (event.target.type === 'number' || event.target.type === 'date') emit(400);
  };
  container.onchange = (event) => {
    if (event.target.type === 'checkbox') emit(0);
  };
}

export function readFilters(container, entry) {
  const conditions = [];
  for (const node of container.querySelectorAll('[data-field]')) {
    const field = entry.fields.find((f) => f.name === node.dataset.field);
    if (field.filter === 'checklist') {
      const checked = [...node.querySelectorAll('input[type="checkbox"]:checked')];
      const values = checked.filter((box) => !box.dataset.blank).map((box) => box.dataset.value);
      const includeBlank = checked.some((box) => box.dataset.blank);
      if (values.length || includeBlank) conditions.push({ field: field.name, op: 'in', values, include_blank: includeBlank });
    } else if (field.filter === 'search') {
      const value = node.querySelector('input').value;
      if (value.trim()) conditions.push({ field: field.name, op: 'contains', value });
    } else if (field.filter === 'range') {
      const min = node.querySelector('[data-bound="min"]').value;
      const max = node.querySelector('[data-bound="max"]').value;
      if (min || max) conditions.push({ field: field.name, op: 'range', min: min || null, max: max || null });
    }
  }
  return conditions;
}

export function renderExamples(container, entry, onApply) {
  container.replaceChildren();
  if (!entry.examples?.length) return;
  container.append(el('span', { class: 'label', text: TEXT.filters.tryLabel }),
    ...entry.examples.map((example) => el('button', { type: 'button', class: 'example', text: example.label,
      onclick: () => onApply(example) })));
}

// ---- Results: count, active filter chips, notices, table ----

// placeName is given for a large layer, whose total is one municipality's (D-025).
export function renderCount(node, matched, total, entry, placeName = null) {
  node.classList.remove('error');
  const noun = nounFor(entry, total);
  if (matched === 0) node.textContent = TEXT.results.noMatches(entry.noun.plural);
  else if (placeName) node.textContent = TEXT.results.matchCountIn(formatCount(matched), formatCount(total), noun, placeName);
  else node.textContent = TEXT.results.matchCount(formatCount(matched), formatCount(total), noun);
}

export function renderChips(container, phrases, onRemove, onClearAll) {
  container.replaceChildren(...phrases.map((item) => el('span', { class: 'chip' }, [
    el('span', { text: item.phrase }),
    el('button', { type: 'button', 'aria-label': TEXT.results.remove(item.phrase), text: '×', onclick: () => onRemove(item) }),
  ])));
  if (phrases.length) {
    container.append(el('button', { type: 'button', class: 'link-button', text: TEXT.results.clearAll, onclick: onClearAll }));
  }
}

export function renderNotices(container, notices) {
  container.replaceChildren(...notices.map((notice) => {
    const message = notice.code === 'unknownField' ? TEXT.notices.unknownField(notice.detail) : TEXT.notices[notice.code];
    return el('p', { class: 'notice', text: message });
  }));
}

const TABLE_LIMIT = 200;

function tableColumns(entry) {
  const label = entry.fields.find((field) => field.name === entry.label_field);
  const columns = [label, ...entry.fields.filter((field) => field.popup && field.name !== entry.label_field)]
    .map((field) => ({ key: field.name, label: field.label, field }));
  const tags = tagColumns(entry);
  for (const key of ['municipality', 'county', 'tract', 'block_group']) {
    if (tags.has(key)) columns.push({ key, label: TEXT.results.columns[key] });
  }
  return columns;
}

export function renderTable(table, note, entry, rows, onRowClick) {
  const columns = tableColumns(entry);
  const shown = rows.slice(0, TABLE_LIMIT);
  const head = el('tr', {}, columns.map((c) => el('th', { scope: 'col', class: c.field?.type === 'number' ? 'num' : null, text: c.label })));
  const body = el('tbody', {}, shown.map((row) => {
    const tr = el('tr', { tabindex: '0' }, columns.map((c) => el('td', { class: c.field?.type === 'number' ? 'num' : null,
      text: c.field ? formatValue(row[c.key], c.field, TEXT.notRecorded) : (row[c.key] ?? TEXT.notRecorded) })));
    tr.addEventListener('click', () => onRowClick(row));
    tr.addEventListener('keydown', (event) => { if (event.key === 'Enter') onRowClick(row); });
    return tr;
  }));
  table.replaceChildren(el('caption', { text: TEXT.results.tableCaption(entry.noun.plural) }), el('thead', {}, head), body);
  note.textContent = rows.length > TABLE_LIMIT ? TEXT.results.tableNote(formatCount(TABLE_LIMIT), formatCount(rows.length)) : '';
}

function link(url, label) {
  return el('a', { href: url, target: '_blank', rel: 'noopener', text: label });
}

// "About this data": what it is, who publishes it, terms, credit, freshness and whole-layer downloads.
// For a large layer, `part` gives the chosen municipality's { files, placeName }, or is null before one is chosen.
export function renderAbout(container, entry, urlFor, part = null) {
  const license = entry.license.name
    ? (entry.license.url ? link(entry.license.url, entry.license.name) : el('span', { text: entry.license.name }))
    : el('span', { text: TEXT.about.licensePending });
  const details = el('dl', {}, [
    el('dt', { text: TEXT.about.publisher }), el('dd', {}, link(entry.source.landing_page, entry.source.publisher)),
    el('dt', { text: TEXT.about.sourceService }), el('dd', {}, link(entry.source.url, TEXT.about.openService)),
    el('dt', { text: TEXT.about.license }), el('dd', {}, license),
    el('dt', { text: TEXT.about.credit }), el('dd', { text: entry.license.attribution }),
    el('dt', { text: TEXT.about.fetched }), el('dd', { text: formatDate(entry.fetched_at.slice(0, 10)) }),
    el('dt', { text: TEXT.about.count }), el('dd', { text: TEXT.itemCount(formatCount(entry.rows), entry.noun.plural) }),
  ]);
  const downloads = el('ul');
  const files = entry.partition ? (part?.files ?? {}) : entry.files;
  if (entry.partition && !part) downloads.append(el('li', { text: TEXT.about.choosePartition }));
  for (const kind of ['csv', 'geojson', 'parquet']) {
    const file = files[kind];
    if (!file) continue;
    const name = file.path.split('/').pop();
    downloads.append(el('li', {}, [el('a', { href: urlFor(file.path), download: name, text: TEXT.downloads[kind] }),
      ` (${formatBytes(file.bytes)})`]));
  }
  container.replaceChildren(
    el('h2', { id: 'about-title', text: entry.title }),
    entry.status === 'draft' ? el('p', { class: 'draft-note', text: TEXT.about.draftNote }) : null,
    el('p', { text: entry.summary }),
    details,
    el('h3', { text: part ? TEXT.downloads.partitionHeading(part.placeName) : TEXT.downloads.heading }),
    downloads,
  );
}
