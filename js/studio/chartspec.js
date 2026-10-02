// What a chart draws (D-088): its title, subtitle, rows (label, value, display, color) and notes, from the chart's
// recipe in the map document, the layer's catalog entry, its style on the map, and the computed data. Pure.
import { DONUT_SLICES, histogram, topCategories } from './chartdata.js';
import { ACCENT, OTHER_COLOR, PALETTE } from './charts.js';
import { formatNumber } from '../format.js';
import { sequential } from './style.js';

// Rates, averages, medians and positions do not add up: a total of percentages or of median incomes means nothing.
const NOT_ADDITIVE_UNITS = new Set(['%', 'per sq mi', 'years', 'in/yr', 'mph', 'ft']);
const NOT_ADDITIVE_LABEL = /^(median|per capita|average|mean|rank|year|from |to |people per|weight|number)\b/i;

export function additive(field) {
  return field.type === 'number' && !NOT_ADDITIVE_UNITS.has(field.unit ?? '') && !NOT_ADDITIVE_LABEL.test(field.label) && !field.name.endsWith('_moe');
}

// Fields a chart can use, by chart type and measure: categories for bars and donuts, numbers for histograms, and
// quantities that add up for totals. A ring chart reads a screening's results, which carry only the layer's list
// columns (screening.js).
export function chartFields(entry, { type, scope }) {
  const listed = new Set([entry.label_field, ...(entry.list_fields ?? [])]);
  const usable = entry.fields.filter((field) => scope !== 'ring' || listed.has(field.name));
  return {
    category: usable.filter((field) => field.type === 'category'),
    number: usable.filter((field) => field.type === 'number'),
    summable: usable.filter(additive),
  };
}

// The measures a chart can offer: count always; sum when there is a number field; area inside the ring for ring
// charts of polygon layers.
export function chartMeasures(entry, chart) {
  if (chart.type === 'histogram') return ['count'];
  const measures = ['count'];
  if (chartFields(entry, chart).summable.length) measures.push('sum');
  if (chart.scope === 'ring' && entry.geometry === 'polygon') measures.push('ring_area');
  return measures;
}

// A chart's defaults for a layer: what the map shows (a bar by its category field, a histogram of the field it
// shades), otherwise the first category field (or number field for a histogram).
export function chartDefaults(entry, type = 'bar', style = null) {
  const fields = chartFields(entry, { type, scope: 'area' });
  if (style?.kind === 'categories' && fields.category.some((f) => f.name === style.field)) return { type: 'bar', field: style.field };
  if (style?.kind === 'graduated' && fields.number.some((f) => f.name === style.field)) return { type: 'histogram', field: style.field };
  const histogramType = type === 'histogram' || !fields.category.length;
  return {
    type: histogramType && fields.number.length ? 'histogram' : 'bar',
    field: (histogramType && fields.number.length ? fields.number[0] : fields.category[0])?.name ?? null,
  };
}

// A chart kept valid for its layer after any change: a field the chart type can use, a measure the layer offers,
// and a field to total only when the measure is a sum.
export function fitChart(chart, entry) {
  const next = { ...chart };
  if (!entry) return next;
  if (next.type === 'histogram' && !chartFields(entry, next).number.length && chartFields(entry, next).category.length) next.type = 'bar';
  const fields = chartFields(entry, next);
  const pool = next.type === 'histogram' ? fields.number : fields.category;
  if (!pool.some((field) => field.name === next.field)) next.field = pool[0]?.name ?? null;
  if (!chartMeasures(entry, next).includes(next.measure)) next.measure = 'count';
  if (next.measure === 'sum') {
    if (!fields.summable.some((field) => field.name === next.sum_field)) next.sum_field = fields.summable[0]?.name ?? null;
  } else next.sum_field = null;
  return next;
}

function valueText(total, chart, entry, text) {
  if (chart.measure === 'ring_area') return `${formatNumber(total, total < 10 ? 2 : 1)} ${text.acres}`;
  if (chart.measure === 'sum') {
    const field = entry.fields.find((f) => f.name === chart.sum_field);
    const amount = formatNumber(total, Math.min(field?.decimals ?? 2, 2));
    return field?.unit ? `${amount} ${field.unit}` : amount;
  }
  return formatNumber(total, 0);
}

// The layer's own colors for this field, when the map shows the field by category (so chart and map agree).
function mapColors(style, chart) {
  return style?.kind === 'categories' && style.field === chart.field && style.colors ? style.colors : null;
}

function label(value, text) {
  return value === null || value === '' ? text.blank : String(value);
}

// data: { totals } for bars and donuts, { values } for histograms, plus { read, expected, capped } when known.
export function chartSpec(chart, entry, data, { style = null, text, areaName = '', ringDistance = null } = {}) {
  const field = entry.fields.find((f) => f.name === chart.field);
  const fieldLabel = field?.label ?? chart.field;
  const sumField = entry.fields.find((f) => f.name === chart.sum_field);
  const measureLabel = chart.type === 'histogram' ? text.measures.count
    : chart.measure === 'sum' ? text.measures.sum(sumField?.label ?? chart.sum_field)
      : chart.measure === 'ring_area' ? text.measures.ring_area : text.measures.count;
  const where = chart.scope === 'ring' ? text.scopeRing(ringDistance) : areaName ? text.scopeArea(areaName) : '';
  const title = chart.title || text.defaultTitle(entry.title, fieldLabel, chart.type);
  const notes = [];
  if (data.partial) notes.push(text.partial(formatNumber(data.read, 0), formatNumber(data.expected, 0)));
  if (data.capped) notes.push(text.capped);
  if (data.skipped) notes.push(text.skipped(data.skipped));
  // A total over shapes that touch the area counts each shape whole, beyond the area's edge (D-088).
  if (chart.measure === 'sum' && chart.scope === 'area' && entry.geometry !== 'point') notes.push(text.wholeShapes);
  const subtitle = [measureLabel, where].filter(Boolean).join(', ');
  const base = { title, subtitle, notes, emptyText: text.empty, layerTitle: entry.title };
  if (chart.type === 'histogram') {
    const breaks = data.breaks ?? [];
    const bins = histogram(data.values ?? [], breaks);
    const decimals = Math.min(field?.decimals ?? 2, 2);
    const fmt = (value) => (value === null ? '' : formatNumber(value, Math.abs(value) >= 100 ? 0 : decimals));
    const colors = data.colors?.length === bins.length ? data.colors : null;
    const rows = bins.map((bin, i) => ({ label: `${fmt(bin.low)} – ${fmt(bin.high)}`, value: bin.count, display: formatNumber(bin.count, 0),
      color: colors?.[i] ?? ACCENT }));
    const edges = bins.length ? [fmt(bins[0].low), ...breaks.map(fmt), fmt(bins.at(-1).high)] : [];
    return { ...base, rows, edges, axisLabel: field?.unit ? `${fieldLabel} (${field.unit})` : fieldLabel,
      total: bins.reduce((sum, bin) => sum + bin.count, 0), formatCount: (v) => formatNumber(v, 0) };
  }
  const max = chart.type === 'donut' ? Math.min(DONUT_SLICES, chart.max_bars ?? DONUT_SLICES) : chart.max_bars ?? 8;
  const top = topCategories(data.totals ?? [], max, text.other);
  const colors = mapColors(style, chart);
  const rows = top.map((item, i) => ({
    label: item.other ? text.otherCount(item.other) : label(item.value, text),
    value: item.total,
    display: valueText(item.total, chart, entry, text),
    color: item.other ? OTHER_COLOR : colors ? colors[item.value] ?? OTHER_COLOR : chart.type === 'donut' ? PALETTE[i % PALETTE.length] : ACCENT,
  }));
  const total = (data.totals ?? []).reduce((sum, item) => sum + item.total, 0);
  return { ...base, rows, total, totalDisplay: chart.type === 'donut' ? valueText(total, chart, entry, text) : null };
}

// The histogram's class breaks and colors: the map's own when its style classes this field.
export function histogramClasses(style, chart) {
  if (style?.kind === 'graduated' && style.field === chart.field && style.breaks?.length) {
    return { breaks: style.breaks, colors: style.colors ?? sequential(style.palette, style.breaks.length + 1) };
  }
  return null;
}
