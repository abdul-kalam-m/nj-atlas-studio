// Style presets -> MapLibre layers, and the legend from the same object (D-035, IMPLEMENTATION_GUIDE.md §4.3).
// Pure: imports only the pure format.js.
import { formatNumber } from '../format.js';

export const PALETTES = {
  // Okabe and Ito's color-blind-safe set; black is replaced by gray so it reads as a fill.
  okabe_ito: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'],
  blues: ['#EFF3FF', '#C6DBEF', '#9ECAE1', '#6BAED6', '#4292C6', '#2171B5', '#084594'],
  greens: ['#EDF8E9', '#C7E9C0', '#A1D99B', '#74C476', '#41AB5D', '#238B45', '#005A32'],
  oranges: ['#FEEDDE', '#FDD0A2', '#FDAE6B', '#FD8D3C', '#F16913', '#D94801', '#8C2D04'],
  purples: ['#F2F0F7', '#DADAEB', '#BCBDDC', '#9E9AC8', '#807DBA', '#6A51A3', '#4A1486'],
  reds: ['#FEE5D9', '#FCBBA1', '#FC9272', '#FB6A4A', '#EF3B2C', '#CB181D', '#99000D'],
};
// Fixed palettes name their values: Anderson Level I land use classes and FEMA flood zones.
const NAMED = {
  anderson_level1: [['urban', '#E8483F'], ['agriculture', '#F2D65C'], ['forest', '#3E8A4F'], ['water', '#4A8FD1'],
    ['wetlands', '#7CC4B2'], ['barren', '#B7A99A']],
  flood: [['a', '#6FA8DC'], ['ae', '#6FA8DC'], ['ah', '#6FA8DC'], ['ao', '#6FA8DC'], ['a99', '#6FA8DC'], ['ar', '#6FA8DC'],
    ['v', '#3D6FB6'], ['ve', '#3D6FB6'], ['x', '#CFE2F3'], ['d', '#BDBDBD']],
};
export const OTHER_COLOR = '#BDBDBD';
export const MAX_CATEGORIES = 12;
const FONT = ['Noto Sans Regular'];
const OVERRIDE_KEYS = {
  single: ['color', 'fill', 'outline', 'opacity', 'width', 'radius', 'labels'],
  categories: ['colors', 'widths', 'other', 'outline', 'opacity', 'width', 'radius', 'labels'],
  graduated: ['classes', 'method', 'palette', 'breaks', 'colors', 'outline', 'opacity', 'width', 'radius', 'labels'],
};

function namedColor(palette, value) {
  const key = String(value).toLowerCase();
  const hit = NAMED[palette].find(([name]) => (palette === 'flood' ? key === name : key.startsWith(name)));
  return hit ? hit[1] : null;
}

// `count` colors spread across a 7-step sequential palette.
export function sequential(palette, count) {
  const steps = PALETTES[palette] ?? PALETTES.blues;
  if (count >= steps.length) return steps.slice(0, count);
  return Array.from({ length: count }, (_, i) => steps[Math.round((i * (steps.length - 1)) / Math.max(1, count - 1))]);
}

// Category colors for the values present, most common first: [{ value, count }] -> { value: color }.
export function categoryColors(palette, values) {
  const colors = {};
  const ordered = [...values].filter((item) => item.value !== null && item.value !== undefined)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  let next = 0;
  for (const { value } of ordered) {
    if (Object.keys(colors).length >= MAX_CATEGORIES) break;
    if (NAMED[palette]) {
      const color = namedColor(palette, value);
      if (color) colors[value] = color;
    } else if (next < PALETTES[palette].length) {
      colors[value] = PALETTES[palette][next];
      next += 1;
    }
  }
  return colors;
}

export function quantileBreaks(numbers, classes) {
  const sorted = numbers.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return [];
  const breaks = [];
  for (let i = 1; i < classes; i += 1) {
    const value = sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / classes))];
    if (!breaks.length || value > breaks[breaks.length - 1]) breaks.push(value);
  }
  return breaks;
}

export function equalBreaks(min, max, classes) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  return Array.from({ length: classes - 1 }, (_, i) => Number((min + ((i + 1) * (max - min)) / classes).toPrecision(6)));
}

// The preset with the document's overrides applied. Keys a preset's kind does not allow are ignored.
export function presetStyle(entry, choice = {}) {
  const key = entry.styles[choice.preset] ? choice.preset : entry.default_style;
  const preset = entry.styles[key];
  const allowed = OVERRIDE_KEYS[preset.kind];
  const overrides = Object.fromEntries(Object.entries(choice.overrides ?? {}).filter(([name]) => allowed.includes(name)));
  return { key, style: { ...preset, ...overrides } };
}

// Fill in what the map needs and a shared map must keep: category colors and class breaks, from `stats`
// ({ values: [{value, count}] } or { numbers: [...] } or { min, max }). Returns the overrides to store.
export function resolve(style, stats = {}) {
  const resolved = {};
  if (style.kind === 'categories' && !style.colors) resolved.colors = categoryColors(style.palette, stats.values ?? []);
  if (style.kind === 'graduated') {
    if (!style.breaks) {
      resolved.breaks = style.method === 'equal' ? equalBreaks(stats.min, stats.max, style.classes)
        : quantileBreaks(stats.numbers ?? [], style.classes);
    }
    const count = (style.breaks ?? resolved.breaks).length + 1;
    if (!style.colors) resolved.colors = sequential(style.palette, count);
  }
  return resolved;
}

function colorExpression(style) {
  if (style.kind === 'single') return style.color;
  if (style.kind === 'categories') {
    const pairs = Object.entries(style.colors ?? {}).flatMap(([value, color]) => [value, color]);
    return pairs.length ? ['match', ['to-string', ['get', style.field]], ...pairs, style.other ?? OTHER_COLOR] : (style.other ?? OTHER_COLOR);
  }
  const colors = style.colors ?? sequential(style.palette, (style.breaks?.length ?? 0) + 1);
  const steps = (style.breaks ?? []).flatMap((value, i) => [value, colors[i + 1]]);
  const step = steps.length ? ['step', ['get', style.field], colors[0], ...steps] : colors[0];
  return ['case', ['==', ['typeof', ['get', style.field]], 'number'], step, OTHER_COLOR];
}

function widthExpression(style, fallback) {
  const base = style.width ?? fallback;
  if (style.kind !== 'categories' || !style.widths) return base;
  const pairs = Object.entries(style.widths).flatMap(([value, width]) => [value, width]);
  return ['match', ['to-string', ['get', style.field]], ...pairs, base];
}

// MapLibre layer specs for one map layer, bottom to top. `base` carries id prefix, source, source-layer, filter.
export function layerSpecs(entry, style, { id, source, sourceLayer, filter, opacity = 1 }) {
  const common = { source, ...(sourceLayer ? { 'source-layer': sourceLayer } : {}), ...(filter ? { filter } : {}) };
  const color = colorExpression(style);
  const alpha = (style.opacity ?? 1) * opacity;
  const specs = [];
  if (entry.geometry === 'polygon') {
    const fill = style.kind !== 'single' || style.fill !== false;
    // Outline-only areas keep an invisible fill, so a click inside one still selects it.
    specs.push({ ...common, id: `${id}-fill`, type: 'fill', paint: { 'fill-color': fill ? color : '#000000', 'fill-opacity': fill ? alpha : 0 } });
    specs.push({ ...common, id: `${id}-line`, type: 'line',
      paint: { 'line-color': style.outline ?? (fill ? '#5b6770' : color), 'line-width': widthExpression(style, fill ? 0.6 : 1.5),
        'line-opacity': fill ? Math.min(1, opacity) : opacity } });
  } else if (entry.geometry === 'line') {
    specs.push({ ...common, id: `${id}-line`, type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': widthExpression(style, 1.5), 'line-opacity': alpha } });
  } else {
    specs.push({ ...common, id: `${id}-circle`, type: 'circle',
      paint: { 'circle-color': color, 'circle-radius': style.radius ?? 4, 'circle-opacity': alpha,
        'circle-stroke-color': style.outline ?? '#ffffff', 'circle-stroke-width': 1, 'circle-stroke-opacity': opacity } });
  }
  if (style.labels) {
    specs.push({ ...common, id: `${id}-labels`, type: 'symbol',
      layout: { 'text-field': ['to-string', ['get', style.labels.field]], 'text-font': FONT, 'text-size': style.labels.size ?? 12,
        'text-max-width': 8, ...(entry.geometry === 'line' ? { 'symbol-placement': 'line' } : {}) },
      paint: { 'text-color': '#1f2a36', 'text-halo-color': '#ffffff', 'text-halo-width': style.labels.halo === false ? 0 : 1.5,
        'text-opacity': opacity } });
  }
  return specs;
}

function formatBreak(value) {
  const abs = Math.abs(value);
  return formatNumber(value, abs >= 100 ? 0 : abs >= 1 ? 1 : 3);
}

// [{ swatch: { color, fill, width, geometry }, label }] for the map legend and the print legend. `values` lists
// the values present, when known: an "Other" row appears only if some value has no color of its own.
export function legendFor(entry, style, { text = { other: 'Other' }, values = null } = {}) {
  const geometry = entry.geometry;
  const swatch = (color, width) => ({ color, geometry, fill: !(style.kind === 'single' && style.fill === false),
    width: width ?? style.width ?? (geometry === 'line' ? 2 : 1), outline: style.outline ?? null });
  if (style.kind === 'single') return [{ swatch: swatch(style.color), label: entry.legend.title }];
  if (style.kind === 'categories') {
    const colors = style.colors ?? {};
    const rows = Object.entries(colors).map(([value, color]) => ({ swatch: swatch(color, style.widths?.[value]), label: value }));
    const uncovered = values === null || values.some((value) => value !== null && !(value in colors));
    return uncovered ? [...rows, { swatch: swatch(style.other ?? OTHER_COLOR), label: text.other }] : rows;
  }
  const breaks = style.breaks ?? [];
  const colors = style.colors ?? sequential(style.palette, breaks.length + 1);
  const unit = entry.fields.find((field) => field.name === style.field)?.unit;
  const suffix = unit ? ` ${unit}` : '';
  return colors.map((color, i) => {
    const low = i === 0 ? null : breaks[i - 1];
    const high = i === breaks.length ? null : breaks[i];
    let label;
    if (low === null && high === null) label = entry.legend.title;
    else if (low === null) label = `Under ${formatBreak(high)}${suffix}`;
    else if (high === null) label = `${formatBreak(low)}${suffix} or more`;
    else label = `${formatBreak(low)} – ${formatBreak(high)}${suffix}`;
    return { swatch: swatch(color), label };
  }).concat(text.blank ? [{ swatch: swatch(OTHER_COLOR), label: text.blank }] : []); // blanks draw gray (D-086)
}
