// Chart data (D-088): what a chart shows, computed from rows Studio already reads for a layer (the copy layer's
// table, the live source's grouped counts or values, or a site screening's results). Pure: no imports.

export const CHART_TYPES = ['bar', 'donut', 'histogram'];
export const SCOPES = ['area', 'ring'];
export const MEASURES = ['count', 'sum', 'ring_area'];
export const MAX_CHARTS = 6;
export const BARS = { min: 3, max: 12, default: 8 };
export const DONUT_SLICES = 6;
export const VALUE_CAP = 20000; // live layers: values read in the browser, as the filter counts do (D-054)
export const SQ_M_PER_ACRE = 4046.8564224;

// [{ value, total, n }] per category of `field`, largest first (ties by label). `valueOf(row)` is what a row adds:
// 1 for a count, a number field for a sum. Rows whose value is not a finite number are skipped and counted.
export function categoryTotals(rows, field, valueOf = () => 1) {
  const totals = new Map();
  let skipped = 0;
  for (const row of rows) {
    const amount = valueOf(row);
    if (!Number.isFinite(amount)) { skipped += 1; continue; }
    const key = row[field] ?? null;
    const entry = totals.get(key) ?? { value: key, total: 0, n: 0 };
    entry.total += amount;
    entry.n += 1;
    totals.set(key, entry);
  }
  const list = [...totals.values()].sort(byTotal);
  return Object.assign(list, { skipped });
}

function byTotal(a, b) {
  return b.total - a.total || (a.value === null) - (b.value === null) || String(a.value).localeCompare(String(b.value), 'en', { numeric: true });
}

// Grouped counts from a source ([{ value, count }], already in displayed values) as category totals.
export function fromCounts(counts) {
  const merged = new Map();
  for (const { value, count } of counts) {
    const entry = merged.get(value ?? null) ?? { value: value ?? null, total: 0, n: 0 };
    entry.total += count;
    entry.n += count;
    merged.set(value ?? null, entry);
  }
  return [...merged.values()].sort(byTotal);
}

// At most `max` categories: the largest max - 1 and one "Other" holding the rest, so nothing is dropped.
export function topCategories(totals, max, otherLabel = 'Other') {
  if (totals.length <= max) return totals.map((t) => ({ ...t }));
  const kept = totals.slice(0, max - 1).map((t) => ({ ...t }));
  const rest = totals.slice(max - 1);
  kept.push({ value: otherLabel, total: rest.reduce((sum, t) => sum + t.total, 0), n: rest.reduce((sum, t) => sum + t.n, 0),
    other: rest.length });
  return kept;
}

// A round step near span / target: 1, 2, 2.5 or 5 times a power of ten.
export function niceStep(span, target) {
  if (!(span > 0) || !(target > 0)) return 1;
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
}

// Interior class breaks at round values between min and max (about `target` classes); none when min = max.
export function niceBreaks(min, max, target = 8) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const step = niceStep(max - min, target);
  const breaks = [];
  for (let value = Math.floor(min / step) * step + step; value < max - step * 1e-9; value += step) {
    breaks.push(Number(value.toPrecision(12)));
  }
  return breaks.filter((value) => value > min);
}

// Bins as the map's graduated style draws them (D-035): below the first break, then each break up to the next,
// then the last break and above. [{ low, high, count }], where the outer bins are open (low or high null), as in
// the legend; the list carries the data's own min and max.
export function histogram(values, breaks) {
  const numbers = values.filter(Number.isFinite);
  const counts = new Array(breaks.length + 1).fill(0);
  let min = null;
  let max = null;
  for (const value of numbers) {
    let index = 0;
    while (index < breaks.length && value >= breaks[index]) index += 1;
    counts[index] += 1;
    min = min === null || value < min ? value : min;
    max = max === null || value > max ? value : max;
  }
  const bins = counts.map((count, i) => ({ low: i === 0 ? null : breaks[i - 1], high: i === breaks.length ? null : breaks[i], count }));
  return Object.assign(bins, { min, max });
}

// The breaks a histogram uses: the layer's own when its style classes this field (so chart and map agree),
// otherwise round ones.
export function binsFor(values, styleBreaks = null, target = 8) {
  if (styleBreaks?.length) return styleBreaks;
  const numbers = values.filter(Number.isFinite);
  if (!numbers.length) return [];
  return niceBreaks(Math.min(...numbers), Math.max(...numbers), target);
}

// Whether what was read covers what the layer holds: { read, expected, partial }.
export function completeness(read, expected) {
  return { read, expected, partial: Number.isFinite(expected) && read < expected };
}
