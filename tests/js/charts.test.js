import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binsFor, categoryTotals, completeness, fromCounts, histogram, niceBreaks, niceStep, topCategories } from '../../site/js/studio/chartdata.js';
import { barChart, chartSvg, donutChart, fit, histogramChart, svgString } from '../../site/js/studio/charts.js';
import { chartDefaults, chartFields, chartMeasures, chartSpec, fitChart, histogramClasses } from '../../site/js/studio/chartspec.js';
import { TEXT as STUDIO_TEXT } from '../../site/js/studio/text.js';


const rows = [
  { zone: 'AE', acres: 2 }, { zone: 'X', acres: 5 }, { zone: 'AE', acres: 1.5 }, { zone: null, acres: 1 }, { zone: 'VE', acres: null },
];

test('category totals count rows or sum a field, largest first, with blanks kept and bad numbers skipped', () => {
  assert.deepEqual(categoryTotals(rows, 'zone').map((t) => [t.value, t.total]), [['AE', 2], [null, 1], ['VE', 1], ['X', 1]].sort((a, b) => b[1] - a[1] || (a[0] === null) - (b[0] === null) || String(a[0]).localeCompare(String(b[0]))));
  const sums = categoryTotals(rows, 'zone', (row) => (row.acres === null ? NaN : row.acres));
  assert.deepEqual(sums.map((t) => [t.value, t.total]), [['X', 5], ['AE', 3.5], [null, 1]]);
  assert.equal(sums.skipped, 1);
});

test('grouped counts from a source merge values that display the same', () => {
  assert.deepEqual(fromCounts([{ value: 'County', count: 3 }, { value: 'State', count: 5 }, { value: 'County', count: 2 }]).map((t) => [t.value, t.total]),
    [['County', 5], ['State', 5]]);
});

test('top categories keep the largest and put the rest in Other, so totals are unchanged', () => {
  const totals = categoryTotals(Array.from({ length: 30 }, (_, i) => ({ k: `c${i % 10}` })), 'k');
  const top = topCategories(totals, 4);
  assert.equal(top.length, 4);
  assert.equal(top.at(-1).value, 'Other');
  assert.equal(top.at(-1).other, 7);
  assert.equal(top.reduce((s, x) => s + x.total, 0), 30);
  assert.equal(topCategories(totals, 12).length, 10);
});

test('round steps and breaks', () => {
  assert.equal(niceStep(100, 8), 20);
  assert.equal(niceStep(7, 8), 1);
  assert.deepEqual(niceBreaks(0, 100, 5), [20, 40, 60, 80]);
  assert.deepEqual(niceBreaks(3, 3), []);
  assert.deepEqual(niceBreaks(0.13, 0.91, 4), [0.2, 0.4, 0.6, 0.8]);
});

test('histogram bins follow the map: below the first break, each break up to the next, the last and above', () => {
  const bins = histogram([1, 5, 5, 10, 25, 31, NaN], [5, 10, 20, 30]);
  assert.deepEqual(bins.map((b) => b.count), [1, 2, 1, 1, 1]);
  assert.deepEqual([bins[0].low, bins[0].high, bins.at(-1).low, bins.at(-1).high], [null, 5, 30, null]);
  assert.deepEqual([bins.min, bins.max], [1, 31]);
  assert.equal(bins.reduce((s, b) => s + b.count, 0), 6);
  assert.deepEqual(binsFor([1, 2], [5, 10]), [5, 10]);
  assert.deepEqual(binsFor([]), []);
});

test('completeness flags a partial read', () => {
  assert.deepEqual(completeness(20000, 25000), { read: 20000, expected: 25000, partial: true });
  assert.equal(completeness(10, 10).partial, false);
  assert.equal(completeness(10, null).partial, false);
});

const spec = (labels) => ({ title: 'Flood <zones> & "risk"', subtitle: 'Count, in the area',
  rows: labels.map((label, i) => ({ label, value: (i + 1) * 3, display: String((i + 1) * 3) })) });

test('every chart escapes text, has an accessible title and finite geometry', () => {
  for (const type of ['bar', 'donut', 'histogram']) {
    const { tree, height } = chartSvg(type, { ...spec(['A <b>', 'B & C', 'D']), edges: ['0', '1', '2', '3'] }, 280);
    const svg = svgString(tree);
    assert.ok(Number.isFinite(height) && height > 40, type);
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title>Flood &lt;zones&gt; &amp; &quot;risk&quot;<\/title>/);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/, type);
    assert.doesNotMatch(svg, /<b>/, type);
  }
});

test('bars scale to the largest value and empty charts say so', () => {
  const { tree } = barChart(spec(['A', 'B']), 300);
  const widths = svgString(tree).match(/<rect [^>]*width="([\d.]+)"/g).map((r) => Number(r.match(/width="([\d.]+)"/)[1]));
  assert.equal(Math.max(...widths), 300 - 120 - 56 - 8);
  assert.match(svgString(barChart({ title: 'x', rows: [], emptyText: 'Nothing here' }, 300).tree), /Nothing here/);
  assert.match(svgString(histogramChart({ title: 'x', rows: [{ label: 'a', value: 0, display: '0' }] }, 300).tree), /No data/);
});

test('a single-slice donut is a whole ring', () => {
  const svg = svgString(donutChart({ title: 'x', rows: [{ label: 'All', value: 5, display: '5' }] }, 300).tree);
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  assert.match(svg, /100%/);
});

test('long labels are shortened to fit', () => {
  assert.equal(fit('short', 100), 'short');
  assert.ok(fit('A very long land use category name indeed', 60).endsWith('…'));
});


const ROOT = new URL('file:///C:/Users/abdul/Desktop/Temporary%20Files/RUTGERS/Portfolio%20Projects/NJ-Atlas/');
const recipe = (id) => JSON.parse(readFileSync(new URL(`../../catalog/layers/${id}.json`, import.meta.url), 'utf8'));
const TEXT = {
  acres: 'acres', blank: 'Blank', other: 'Other', otherCount: (n) => `Other (${n})`, empty: 'Nothing to chart.',
  measures: { count: 'Count', sum: (label) => `Total ${label}`, ring_area: 'Acres inside the ring' },
  scopeArea: (name) => `in ${name}`, scopeRing: (ft) => `within ${ft} ft of the site`,
  defaultTitle: (layer, field) => `${layer} by ${field}`,
  partial: (read, expected) => `Read ${read} of ${expected}`, capped: 'Capped', skipped: (n) => `${n} without a value`,
  under: (v) => `Under ${v}`, orMore: (v) => `${v} or more`,
};
const landUse = recipe('nj_land_use');
const tracts = recipe('nj_acs_tracts');

test('fields and measures a chart can use', () => {
  assert.deepEqual(chartFields(landUse, { type: 'bar', scope: 'ring' }).category.map((f) => f.name), ['land_use_type', 'land_use']);
  assert.deepEqual(chartMeasures(landUse, { type: 'bar', scope: 'ring' }), ['count', 'sum', 'ring_area']);
  assert.deepEqual(chartMeasures(landUse, { type: 'bar', scope: 'area' }), ['count', 'sum']);
  assert.deepEqual(chartMeasures(landUse, { type: 'histogram', scope: 'area' }), ['count']);
  assert.equal(chartDefaults(tracts).type, 'bar');
  assert.equal(chartDefaults(tracts, 'histogram').field, 'population');
  assert.deepEqual(chartDefaults(tracts, 'bar', tracts.styles.poverty), { type: 'histogram', field: 'poverty_pct' });
  assert.deepEqual(chartDefaults(landUse, 'bar', landUse.styles.by_type), { type: 'bar', field: 'land_use_type' });
  assert.deepEqual(chartDefaults(landUse, 'bar', { kind: 'single' }), chartDefaults(landUse));
});

test('a land use bar uses the map colors, its own labels, and keeps every acre', () => {
  const rows = [{ land_use_type: 'Urban', acres: 10 }, { land_use_type: 'Forest', acres: 4.5 }, { land_use_type: 'Urban', acres: 1 }];
  const chart = { type: 'bar', layer: 'nj_land_use', scope: 'ring', field: 'land_use_type', measure: 'ring_area', title: '', max_bars: 8 };
  const style = { kind: 'categories', field: 'land_use_type', colors: { Urban: '#E8483F', Forest: '#3E8A4F' } };
  const spec = chartSpec(chart, landUse, { totals: categoryTotals(rows, 'land_use_type', (r) => r.acres) }, { style, text: TEXT, ringDistance: 300 });
  assert.equal(spec.title, 'Land use (2015) by Type');
  assert.equal(spec.subtitle, 'Acres inside the ring, within 300 ft of the site');
  assert.deepEqual(spec.rows.map((r) => [r.label, r.display, r.color]), [['Urban', '11 acres', '#E8483F'], ['Forest', '4.5 acres', '#3E8A4F']]);
  assert.equal(spec.total, 15.5);
});

test('a donut folds the rest into Other and shows the total', () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ k: `c${i}` }));
  const entry = { title: 'X', fields: [{ name: 'k', label: 'K', type: 'category' }] };
  const spec = chartSpec({ type: 'donut', field: 'k', measure: 'count', scope: 'area', title: 'Mine', max_bars: 8 }, entry,
    { totals: categoryTotals(rows, 'k') }, { text: TEXT, areaName: 'Pennsville' });
  assert.equal(spec.rows.length, 6);
  assert.equal(spec.rows.at(-1).label, 'Other (4)');
  assert.equal(spec.totalDisplay, '9');
  assert.equal(spec.title, 'Mine');
  assert.equal(spec.subtitle, 'Count, in Pennsville');
});

test('a histogram of a choropleth field uses the map classes and colors; blanks and partial reads are noted', () => {
  const style = { kind: 'graduated', field: 'poverty_pct', breaks: [5, 10, 20, 30], palette: 'reds' };
  const classes = histogramClasses(style, { field: 'poverty_pct' });
  assert.equal(classes.colors.length, 5);
  const spec = chartSpec({ type: 'histogram', field: 'poverty_pct', measure: 'count', scope: 'area', title: '' }, tracts,
    { values: [1, 6, 12, 12, 35], ...classes, partial: true, read: 5, expected: 9 }, { text: TEXT, areaName: 'Newark City' });
  assert.deepEqual(spec.rows.map((r) => r.value), [1, 1, 2, 0, 1]);
  assert.deepEqual(spec.edges, ['1', '5', '10', '20', '30', '35']);
  assert.equal(spec.axisLabel, 'Below the poverty level (%)');
  assert.deepEqual(spec.notes, ['Read 5 of 9']);
  assert.equal(histogramClasses({ kind: 'graduated', field: 'density', breaks: [1] }, { field: 'poverty_pct' }), null);
  assert.doesNotMatch(svgString(chartSvg('histogram', spec, 300).tree), /NaN|undefined/);
});

test('an empty result draws an empty chart, not an error', () => {
  const spec = chartSpec({ type: 'bar', field: 'land_use_type', measure: 'count', scope: 'area', title: '', max_bars: 8 }, landUse, { totals: [] }, { text: TEXT });
  assert.match(svgString(chartSvg('bar', spec, 300).tree), /Nothing to chart/);
});

test('a chart stays valid when its layer, type or scope changes', () => {
  const chart = { type: 'bar', layer: 'nj_land_use', scope: 'area', field: 'land_use_type', measure: 'ring_area', sum_field: 'x', title: '', max_bars: 8 };
  assert.deepEqual(fitChart(chart, landUse), { ...chart, measure: 'count', sum_field: null });
  assert.equal(fitChart({ ...chart, type: 'histogram' }, landUse).field, 'impervious_pct');
  assert.equal(fitChart({ ...chart, measure: 'sum' }, landUse).sum_field, 'acres');
  const moved = fitChart({ ...chart, measure: 'count' }, tracts);
  assert.equal(moved.field, 'median_hh_income_reliability');
  const noNumbers = { title: 'x', geometry: 'point', fields: [{ name: 'k', label: 'K', type: 'category' }] };
  assert.equal(fitChart({ ...chart, type: 'histogram' }, noNumbers).type, 'bar');
});

test('only quantities that add up can be totalled', () => {
  const names = (entry) => chartFields(entry, { type: 'bar', scope: 'area' }).summable.map((f) => f.name);
  assert.deepEqual(names(landUse), ['acres']);
  assert.deepEqual(names(tracts), ['population']);
  const hin = recipe('nj_high_injury_network');
  assert.deepEqual(names(hin), ['fatal_crashes', 'serious_injury_crashes', 'total_crashes']);
  assert.ok(chartFields(tracts, { type: 'histogram', scope: 'area' }).number.length > 20);
});

test("Studio's own chart words fill every slot the chart spec uses", () => {
  const C = STUDIO_TEXT.charts;
  for (const key of ['acres', 'blank', 'other', 'empty', 'capped', 'wholeShapes']) assert.equal(typeof C[key], 'string', key);
  const total = chartSpec({ type: 'bar', field: 'land_use_type', measure: 'sum', sum_field: 'acres', scope: 'area', title: '', max_bars: 8 }, landUse,
    { totals: [{ value: 'Water', total: 10, n: 1 }] }, { text: C });
  assert.deepEqual(total.notes, [C.wholeShapes]);
  for (const key of ['otherCount', 'scopeArea', 'scopeRing', 'defaultTitle', 'partial', 'skipped', 'source']) assert.equal(typeof C[key], 'function', key);
  assert.equal(C.defaultTitle('Flood hazard zones', 'Flood zone', 'bar'), 'Flood hazard zones by flood zone');
  assert.equal(C.defaultTitle('Demographics (tracts)', 'Below the poverty level', 'histogram'), 'Demographics (tracts): Below the poverty level');
  assert.equal(C.defaultTitle('Soils', 'NRCS rating', 'bar'), 'Soils by NRCS rating');
  const spec = chartSpec({ type: 'bar', field: 'land_use_type', measure: 'count', scope: 'area', title: '', max_bars: 8 }, landUse,
    { totals: [{ value: 'Urban', total: 3, n: 3 }] }, { text: C, areaName: 'Pennsville Township' });
  assert.equal(spec.subtitle, 'Count, in Pennsville Township');
});

test('a histogram on fixed breaks wider than the data labels its open ends like the legend (D-090)', () => {
  const spec = chartSpec({ type: 'histogram', field: 'poverty_pct', measure: 'count', scope: 'area', title: '' }, tracts,
    { values: [6, 7.3, 10.9, 17.6], breaks: [5, 10, 20, 30] }, { text: TEXT });
  assert.deepEqual(spec.rows.map((r) => [r.label, r.value]), [['Under 5', 0], ['5 – 10', 2], ['10 – 20', 2], ['20 – 30', 0], ['30 or more', 0]]);
  assert.deepEqual(spec.edges, ['', '5', '10', '20', '30', '']);
  const svg = svgString(chartSvg('histogram', spec, 300).tree);
  assert.doesNotMatch(svg, /NaN|undefined|>17.6</);
  const single = chartSpec({ type: 'histogram', field: 'poverty_pct', measure: 'count', scope: 'area', title: '' }, tracts, { values: [4, 4], breaks: [] }, { text: TEXT });
  assert.deepEqual(single.rows.map((r) => r.label), ['4 – 4']);
});
