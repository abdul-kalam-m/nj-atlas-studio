// Charts as SVG (D-088): bar, donut and histogram, drawn the same in the panel, the print and the PNG. Pure: a chart
// is a small tree ({ tag, attrs, children } or { text }); svgString turns it into markup (PNG, tests) and svgNode
// into DOM nodes (the page), so data values only ever become text nodes or escaped attribute values.

const NS = 'http://www.w3.org/2000/svg';
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';
const INK = '#17212c';
const MUTED = '#4f5d6e';
const GRID = '#d6dde6';
export const ACCENT = '#1d4e89';
export const PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#0072B2', '#D55E00', '#CC79A7', '#F0E442', '#999999'];
export const OTHER_COLOR = '#BDBDBD';
const HEADER = 38;
const ROW = 22;

const h = (tag, attrs = {}, children = []) => ({ tag, attrs, children: [].concat(children).filter(Boolean) });
const t = (value) => ({ text: String(value) });

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function svgString(node) {
  if ('text' in node) return escape(node.text);
  const attrs = Object.entries(node.attrs).filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ` ${k}="${escape(v)}"`).join('');
  const xmlns = node.tag === 'svg' ? ` xmlns="${NS}"` : '';
  return `<${node.tag}${xmlns}${attrs}>${node.children.map(svgString).join('')}</${node.tag}>`;
}

export function svgNode(node, doc = globalThis.document) {
  if ('text' in node) return doc.createTextNode(node.text);
  const element = doc.createElementNS(NS, node.tag);
  for (const [k, v] of Object.entries(node.attrs)) if (v !== null && v !== undefined) element.setAttribute(k, String(v));
  for (const child of node.children) element.append(svgNode(child, doc));
  return element;
}

// Text that fits about `width` pixels at `size` (an estimate; the full text stays in the element's title).
export function fit(text, width, size = 11) {
  const label = String(text);
  const chars = Math.max(3, Math.floor(width / (size * 0.56)));
  return label.length <= chars ? label : `${label.slice(0, chars - 1)}…`;
}

const n = (value) => Math.round(value * 100) / 100;

function header(spec, width) {
  return [
    h('text', { x: 0, y: 14, 'font-size': 12.5, 'font-weight': 600, fill: INK }, t(fit(spec.title, width, 12.5))),
    spec.subtitle ? h('text', { x: 0, y: 30, 'font-size': 10, fill: MUTED }, t(fit(spec.subtitle, width, 10))) : null,
  ];
}

function frame(spec, width, height, body) {
  const summary = spec.rows.slice(0, 12).map((row) => `${row.label}: ${row.display}`).join('; ');
  return h('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'font-family': FONT },
    [h('title', {}, t(spec.title)), h('desc', {}, t(summary)), ...header(spec, width), ...body]);
}

function empty(spec, width) {
  const height = HEADER + 30;
  return { tree: frame({ ...spec, rows: [] }, width, height, [h('text', { x: 0, y: HEADER + 16, 'font-size': 11, fill: MUTED }, t(spec.emptyText ?? 'No data'))]), height };
}

// Horizontal bars, largest first: label, bar, value. rows: [{ label, value, display, color }].
export function barChart(spec, width = 300) {
  if (!spec.rows.length) return empty(spec, width);
  const labelWidth = Math.min(Math.round(width * 0.4), 140);
  const valueWidth = 56;
  const barArea = Math.max(20, width - labelWidth - valueWidth - 8);
  const max = Math.max(...spec.rows.map((row) => row.value), 0) || 1;
  const height = HEADER + spec.rows.length * ROW + 4;
  const body = spec.rows.map((row, i) => {
    const y = HEADER + i * ROW;
    const w = Math.max(row.value > 0 ? 1 : 0, (row.value / max) * barArea);
    return h('g', {}, [
      h('title', {}, t(`${row.label}: ${row.display}`)),
      h('text', { x: labelWidth - 6, y: y + 14, 'font-size': 11, fill: INK, 'text-anchor': 'end' }, t(fit(row.label, labelWidth - 8))),
      h('rect', { x: labelWidth, y: y + 4, width: n(w), height: ROW - 8, fill: row.color ?? ACCENT, rx: 2 }),
      h('text', { x: n(labelWidth + w + 4), y: y + 14, 'font-size': 10.5, fill: MUTED }, t(row.display)),
    ]);
  });
  return { tree: frame(spec, width, height, body), height };
}

function arc(cx, cy, r0, r1, start, end) {
  const point = (r, angle) => [n(cx + r * Math.sin(angle)), n(cy - r * Math.cos(angle))];
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = point(r1, start);
  const [x2, y2] = point(r1, end);
  const [x3, y3] = point(r0, end);
  const [x4, y4] = point(r0, start);
  return `M${x1} ${y1}A${r1} ${r1} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r0} ${r0} 0 ${large} 0 ${x4} ${y4}Z`;
}

// A donut with a legend of labels and shares. rows as for bars; spec.total is shown in the middle.
export function donutChart(spec, width = 300) {
  const rows = spec.rows.filter((row) => row.value > 0);
  if (!rows.length) return empty(spec, width);
  const legendHeight = rows.length * 18;
  const r = Math.max(36, Math.min(70, (width * 0.42) / 2));
  const height = HEADER + Math.max(r * 2 + 8, legendHeight + 4);
  const cx = r + 2;
  const cy = HEADER + r + 2;
  const sum = rows.reduce((total, row) => total + row.value, 0);
  let angle = 0;
  const slices = rows.map((row) => {
    const share = row.value / sum;
    const end = angle + share * Math.PI * 2;
    // A whole ring cannot be one arc: draw it as two halves.
    const d = share >= 0.9999 ? `${arc(cx, cy, r * 0.58, r, 0, Math.PI)}${arc(cx, cy, r * 0.58, r, Math.PI, Math.PI * 2)}` : arc(cx, cy, r * 0.58, r, angle, end);
    angle = end;
    return h('path', { d, fill: row.color ?? ACCENT, stroke: '#ffffff', 'stroke-width': 1 }, h('title', {}, t(`${row.label}: ${row.display} (${Math.round(share * 1000) / 10}%)`)));
  });
  const lx = cx + r + 14;
  const legend = rows.map((row, i) => {
    const y = HEADER + 4 + i * 18;
    const share = `${Math.round((row.value / sum) * 1000) / 10}%`;
    return h('g', {}, [
      h('rect', { x: lx, y, width: 10, height: 10, fill: row.color ?? ACCENT }),
      h('text', { x: lx + 15, y: y + 9, 'font-size': 10.5, fill: INK }, t(`${fit(row.label, width - lx - 60, 10.5)} ${share}`)),
    ]);
  });
  const center = spec.totalDisplay ? h('text', { x: cx, y: cy + 4, 'font-size': 11, 'font-weight': 600, fill: INK, 'text-anchor': 'middle' }, t(spec.totalDisplay)) : null;
  return { tree: frame(spec, width, height, [...slices, center, ...legend]), height };
}

// Vertical bars over class ranges. rows: [{ label, value (count), display, color, low, high }]; edges labels the
// class boundaries (n + 1 strings).
export function histogramChart(spec, width = 300, plotHeight = 120) {
  if (!spec.rows.length || spec.rows.every((row) => !row.value)) return empty(spec, width);
  const left = 34;
  const bottom = 30;
  const plotWidth = width - left - 6;
  const height = HEADER + plotHeight + bottom;
  const max = Math.max(...spec.rows.map((row) => row.value));
  const barWidth = plotWidth / spec.rows.length;
  const y0 = HEADER + plotHeight;
  const ticks = [0, max / 2, max].map((value) => {
    const y = n(y0 - (value / max) * plotHeight);
    return h('g', {}, [h('line', { x1: left, x2: width - 6, y1: y, y2: y, stroke: GRID, 'stroke-width': 1 }),
      h('text', { x: left - 4, y: y + 3, 'font-size': 9.5, fill: MUTED, 'text-anchor': 'end' }, t(spec.formatCount ? spec.formatCount(value) : Math.round(value)))]);
  });
  const bars = spec.rows.map((row, i) => {
    const barHeight = (row.value / max) * plotHeight;
    return h('rect', { x: n(left + i * barWidth + 1), y: n(y0 - barHeight), width: n(Math.max(1, barWidth - 2)), height: n(barHeight), fill: row.color ?? ACCENT },
      h('title', {}, t(`${row.label}: ${row.display}`)));
  });
  const edges = spec.edges ?? [];
  const every = Math.max(1, Math.ceil(edges.length / Math.max(2, Math.floor(plotWidth / 46))));
  const labels = edges.map((label, i) => (i % every && i !== edges.length - 1 ? null
    : h('text', { x: n(left + i * barWidth), y: y0 + 13, 'font-size': 9.5, fill: MUTED, 'text-anchor': i === 0 ? 'start' : i === edges.length - 1 ? 'end' : 'middle' }, t(label))));
  const axis = spec.axisLabel ? h('text', { x: left + plotWidth / 2, y: y0 + 26, 'font-size': 9.5, fill: MUTED, 'text-anchor': 'middle' }, t(spec.axisLabel)) : null;
  return { tree: frame(spec, width, height, [...ticks, ...bars, ...labels, axis]), height };
}

export function chartSvg(type, spec, width) {
  if (type === 'donut') return donutChart(spec, width);
  if (type === 'histogram') return histogramChart(spec, width);
  return barChart(spec, width);
}
