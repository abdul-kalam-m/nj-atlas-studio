// Exports (D-036, IMPLEMENTATION_GUIDE.md §4.8-§4.9): the print layout (the browser's "Save as PDF"), PNG, and
// clipped data. The map in a print or PNG is a second, non-interactive map at twice the pixel density.
import { el, svgEl } from './dom.js';
import { createStudioMap } from './mapview.js';
import { metersPerPixel, scaleBar } from './geo.js';
import { clipFeature } from './clip.js';
import { toRow } from './transform.js';
import { toCsv } from '../csv.js';
import { chartSvg, svgNode, svgString } from './charts.js';
import { composeArea, drawWidth, fitScale } from './layoutgeom.js';

const DPI = 96;
const PAPER_IN = { letter: [8.5, 11], tabloid: [11, 17] };
const MARGIN_IN = 0.4;
export const DATA_CAP = 50000;

export function pageSize(layout) {
  const [short, long] = PAPER_IN[layout.paper] ?? PAPER_IN.letter;
  const [w, h] = layout.orientation === 'portrait' ? [short, long] : [long, short];
  return { widthIn: w, heightIn: h, width: Math.round((w - 2 * MARGIN_IN) * DPI), height: Math.round((h - 2 * MARGIN_IN) * DPI) };
}

// Map frame size in CSS pixels inside the page, leaving room for the title and the side column or bottom strip.
export function frameSize(layout) {
  const page = pageSize(layout);
  const titleHeight = 64;
  if (layout.orientation === 'portrait') return { width: page.width, height: page.height - titleHeight - 230 };
  return { width: page.width - 250, height: page.height - titleHeight };
}

function northArrow() {
  return svgEl('svg', { viewBox: '0 0 24 36', width: '24', height: '36', 'aria-hidden': 'true' }, [
    svgEl('path', { d: 'M12 2 L20 26 L12 20 L4 26 Z', fill: '#17212c' }),
    svgEl('text', { x: '12', y: '35', 'text-anchor': 'middle', 'font-size': '10', 'font-family': 'system-ui, sans-serif', fill: '#17212c' }, [document.createTextNode('N')]),
  ]);
}

// '#08519C', 0.3 -> 'rgba(8,81,156,0.3)'
export function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// A buffer ring's swatch (D-076): its fill at its opacity, and its outline's color, width and style.
export function ringSwatchStyle(style) {
  const width = style.outline_width > 0 ? Math.max(1, Math.min(3, Math.round(style.outline_width))) : 0;
  return `background:${hexToRgba(style.fill, style.fill_opacity)};border:${width}px ${style.outline_style} ${style.outline}`;
}

function swatchNode(swatch) {
  if (swatch.opacity !== undefined) {
    return el('span', { class: 'swatch', style: `width:18px;height:12px;${ringSwatchStyle({ fill: swatch.color, fill_opacity: swatch.opacity,
      outline: swatch.outline, outline_width: swatch.outlineWidth, outline_style: swatch.dash })}` });
  }
  const style = swatch.geometry === 'line'
    ? `background:${swatch.color};height:${Math.max(2, swatch.width)}px;width:22px;margin:6px 0`
    : swatch.geometry === 'point'
      ? `background:${swatch.color};width:10px;height:10px;border-radius:50%;border:1px solid #fff;box-shadow:0 0 0 1px #888`
      : swatch.fill ? `background:${swatch.color};width:18px;height:12px;opacity:.85;border:1px solid ${swatch.outline ?? '#667'}`
        : `width:18px;height:12px;border:2px solid ${swatch.color}`;
  if (swatch.dashed) return el('span', { class: 'swatch', style: 'width:22px;height:0;border-top:2px dashed #9A3B26;margin:7px 0' });
  return el('span', { class: 'swatch', style });
}

// A single-color layer is one row named after the layer; other layers get a title and their classes.
export function legendNode(groups) {
  return el('div', { class: 'legend-list' }, groups.map((group) => {
    const single = group.rows.length === 1 && group.rows[0].label === group.title;
    return el('div', { class: 'legend-group' }, [
      single ? null : el('div', { class: 'legend-title', text: group.title }),
      ...group.rows.map((row) => el('div', { class: 'legend-row' }, [swatchNode(row.swatch), el('span', { text: row.label })])),
    ].filter(Boolean));
  }));
}

function scaleNode(scale) {
  return el('div', { class: 'print-scale' }, [
    el('span', { class: 'print-scale-bar', style: `width:${scale.px}px` }),
    el('span', { text: `${scale.value.toLocaleString('en-US')} ${scale.unit}` }),
  ]);
}

// Render the map for a print or PNG: { image (data URL), scale, complete }.
async function renderMap(ctx, size, pixelRatio) {
  const holder = el('div', { class: 'print-offscreen', style: `width:${size.width}px;height:${size.height}px` });
  document.body.append(holder);
  let studioMap = null;
  try {
    studioMap = await createStudioMap(holder, { interactive: false, preserveDrawingBuffer: true, pixelRatio, bounds: ctx.bounds,
      basemap: ctx.doc.basemap, basemapMode: ctx.doc.basemap_mode });
    studioMap.map.fitBounds([[ctx.bounds[0], ctx.bounds[1]], [ctx.bounds[2], ctx.bounds[3]]], { duration: 0, padding: 0 });
    ctx.fill(studioMap);
    const complete = await studioMap.idle(20000);
    const canvas = studioMap.map.getCanvas();
    const image = canvas.toDataURL('image/png');
    const center = studioMap.map.getCenter();
    const scale = scaleBar(metersPerPixel(center.lat, studioMap.map.getZoom()), 140);
    return { image, scale, complete };
  } finally {
    studioMap?.remove();
    holder.remove();
  }
}

function sideParts(ctx, scale) {
  const { doc, text } = ctx;
  const parts = [];
  if (doc.layout.legend && ctx.legend.length) parts.push(legendNode(ctx.legend));
  const marks = [];
  if (doc.layout.scale_bar) marks.push(scaleNode(scale));
  if (doc.layout.north_arrow) marks.push(el('div', { class: 'print-north' }, [northArrow()]));
  if (marks.length) parts.push(el('div', { class: 'print-marks' }, marks));
  if (doc.layout.notes) parts.push(el('p', { class: 'print-notes', text: doc.layout.notes }));
  for (const label of printLabels(ctx)) parts.push(el('p', { class: 'print-label', text: label }));
  if (ctx.notes?.length) parts.push(el('ul', { class: 'print-note-list' }, ctx.notes.map((note) => el('li', { text: note }))));
  parts.push(el('p', { class: 'print-credits', text: ctx.credits.join(' · ') }));
  parts.push(el('p', { class: 'print-credits', text: `${text.export.dataDates}: ${ctx.dates}` }));
  if (ctx.leftOut?.length) parts.push(el('p', { class: 'print-credits', text: text.export.leftOut(ctx.leftOut.join(', ')) }));
  parts.push(el('p', { class: 'print-credits', text: text.export.credit }));
  return parts;
}

// The charts a page template places (D-089): ctx.charts ([{ type, spec }], in slot order); none on 'map'.
function placedCharts(ctx) {
  return ctx.doc.layout.template && ctx.doc.layout.template !== 'map' ? ctx.charts ?? [] : [];
}

// The map area split between the map and the chart boxes (the map keeps the whole area on 'map').
function pageAreas(ctx) {
  const frame = frameSize(ctx.doc.layout);
  const charts = placedCharts(ctx);
  return { frame, charts, ...composeArea(ctx.doc.layout.template ?? 'map', ctx.doc.layout.orientation, frame, charts.length) };
}

// One chart in its box: drawn at drawWidth and shrunk, whole, to fit.
function chartBox(chart, cell) {
  const width = drawWidth(cell);
  const { tree, height } = chartSvg(chart.type, chart.spec, width);
  const scale = fitScale(width, height, cell);
  const node = svgNode(tree);
  node.setAttribute('width', String(width * scale));
  node.setAttribute('height', String(height * scale));
  return el('div', { class: 'print-chart', style: `left:${cell.x}px;top:${cell.y}px;width:${cell.w}px;height:${cell.h}px` }, [node]);
}

// The print layout, not yet on the page: { root, page, complete }. The preview shows it; printRoot prints it.
export async function renderPrintRoot(ctx) {
  const { doc, text } = ctx;
  const page = pageSize(doc.layout);
  const { frame, charts, map, cells } = pageAreas(ctx);
  const rendered = await renderMap(ctx, { width: map.w, height: map.h }, 2);
  const mapNode = el('div', { class: 'print-map', style: `width:${map.w}px;height:${map.h}px` },
    [el('img', { src: rendered.image, alt: doc.title || text.export.untitled, width: map.w, height: map.h })]);
  const main = cells.length
    ? el('div', { class: 'print-main', style: `width:${frame.width}px;height:${frame.height}px` }, [mapNode, ...cells.map((cell, i) => chartBox(charts[i], cell))])
    : mapNode;
  const root = el('div', { id: 'print-root', class: `print-root ${doc.layout.orientation}`, style: `width:${page.width}px` }, [
    el('header', { class: 'print-title' }, [el('h1', { text: doc.title || text.export.untitled }), doc.subtitle ? el('p', { text: doc.subtitle }) : null]),
    el('div', { class: 'print-body' }, [main, el('aside', { class: 'print-side' }, sideParts(ctx, rendered.scale))]),
  ]);
  return { root, page, complete: rendered.complete };
}

// A chart on the PNG's canvas, drawn from its SVG at the canvas's pixel density.
async function drawChart(context, chart, cell, top, density) {
  const width = drawWidth(cell);
  const { tree, height } = chartSvg(chart.type, chart.spec, width);
  const scale = fitScale(width, height, cell);
  const [w, h] = [width * scale, height * scale];
  const sized = { ...tree, attrs: { ...tree.attrs, width: Math.round(w * density), height: Math.round(h * density) } };
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString(sized))}`;
  await image.decode();
  context.drawImage(image, cell.x, top + cell.y, w, h);
}

// Shrink the side column (legend, notes, credits) until the layout ends on its page; the map and charts keep their
// size, so a page never grows past its paper (D-089). Call once the root is in the document.
export function fitPrintSide(root, page) {
  const side = root.querySelector('.print-side');
  if (!side) return 1;
  let zoom = 1;
  side.style.zoom = '';
  for (let i = 0; i < 8 && root.scrollHeight > page.height && zoom > MIN_SIDE_SCALE; i += 1) {
    const height = side.scrollHeight * zoom;
    const over = root.scrollHeight - page.height;
    zoom = Math.max(MIN_SIDE_SCALE, zoom * Math.min(0.95, (height - over) / height));
    side.style.zoom = String(zoom);
  }
  return zoom;
}

// Put a layout on the page for the print dialog: { cleanup }.
export async function attachForPrint(root, page) {
  const pageRule = el('style', { id: 'print-page', text: `@page { size: ${page.widthIn}in ${page.heightIn}in; margin: ${MARGIN_IN}in; }` });
  document.head.append(pageRule);
  document.body.append(root);
  document.body.classList.add('printing');
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  fitPrintSide(root, page);
  return {
    cleanup: () => {
      root.remove();
      pageRule.remove();
      document.body.classList.remove('printing');
    },
  };
}

// The print layout on the page, ready for the browser's print dialog: { root, complete, cleanup }.
export async function buildPrintLayout(ctx) {
  const { root, page, complete } = await renderPrintRoot(ctx);
  const { cleanup } = await attachForPrint(root, page);
  return { root, complete, cleanup };
}

// A layout already built (for example, previewed), then the browser's print dialog (Save as PDF).
export async function printRoot(root, page) {
  const { cleanup } = await attachForPrint(root, page);
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
  setTimeout(cleanup, 60000); // browsers that never fire afterprint
}

// Print layout, then the browser's print dialog.
export async function printMap(ctx) {
  const { root, page, complete } = await renderPrintRoot(ctx);
  await printRoot(root, page);
  return complete;
}

function wrap(context, words, width) {
  const lines = [];
  let line = '';
  for (const word of words.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const MIN_SIDE_SCALE = 0.55;

// The labels a print carries, each boxed (D-041): the screening's (ctx.label) and any others (ctx.labels).
function printLabels(ctx) {
  return [ctx.label, ...(ctx.labels ?? [])].filter(Boolean);
}

function drawSwatch(c, swatch, x, y, s) {
  c.fillStyle = swatch.color;
  if (swatch.opacity !== undefined) {
    c.fillStyle = hexToRgba(swatch.color, swatch.opacity);
    c.fillRect(x, y - 10 * s, 18 * s, 11 * s);
    if (swatch.outlineWidth > 0) {
      c.strokeStyle = swatch.outline;
      c.lineWidth = Math.min(3, swatch.outlineWidth) * s;
      c.setLineDash(swatch.dash === 'dashed' ? [4, 2] : swatch.dash === 'dotted' ? [1, 2] : []);
      c.strokeRect(x, y - 10 * s, 18 * s, 11 * s);
      c.setLineDash([]);
    }
  } else if (swatch.dashed) { c.strokeStyle = '#9A3B26'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(x, y - 4 * s); c.lineTo(x + 20 * s, y - 4 * s); c.stroke(); c.setLineDash([]); }
  else if (swatch.geometry === 'line') c.fillRect(x, y - 5 * s, 20 * s, Math.max(2, swatch.width) * s);
  else if (swatch.geometry === 'point') { c.beginPath(); c.arc(x + 6 * s, y - 4 * s, 5 * s, 0, Math.PI * 2); c.fill(); }
  else if (swatch.fill) c.fillRect(x, y - 10 * s, 18 * s, 11 * s);
  else { c.strokeStyle = swatch.color; c.lineWidth = 2 * s; c.strokeRect(x, y - 10 * s, 18 * s, 11 * s); }
}

// The PNG's side column at scale `s`: { ops, bottom }. Text wraps at the scaled size, so `bottom` is where the
// column would end; nothing is drawn until the ops run.
function sideOps(c, ctx, scaleBarInfo, x, top, width, s) {
  const { doc, text } = ctx;
  const font = (bold, size) => `${bold ? '600 ' : ''}${Math.round(size * s * 10) / 10}px system-ui, sans-serif`;
  const ops = [];
  let y = top;
  if (doc.layout.legend) {
    for (const group of ctx.legend) {
      const single = group.rows.length === 1 && group.rows[0].label === group.title;
      if (!single) {
        y += 14 * s;
        const at = y;
        ops.push(() => { c.font = font(true, 12); c.fillStyle = '#17212c'; c.fillText(group.title, x, at); });
      }
      for (const row of group.rows.slice(0, 14)) {
        y += 16 * s;
        const at = y;
        ops.push(() => { drawSwatch(c, row.swatch, x, at, s); c.font = font(false, 12); c.fillStyle = '#17212c'; c.fillText(row.label, x + 28 * s, at); });
      }
      y += 8 * s;
    }
  }
  if (doc.layout.scale_bar) {
    y += 16 * s;
    const at = y;
    ops.push(() => {
      c.font = font(false, 11);
      c.fillStyle = '#17212c';
      c.fillRect(x, at, scaleBarInfo.px, 4 * s);
      c.fillText(`${scaleBarInfo.value.toLocaleString('en-US')} ${scaleBarInfo.unit}`, x + scaleBarInfo.px + 6, at + 5 * s);
    });
    y += 10 * s;
  }
  if (doc.layout.north_arrow) {
    const at = y;
    const nx = x + 10;
    ops.push(() => {
      c.fillStyle = '#17212c';
      c.beginPath(); c.moveTo(nx, at + 6); c.lineTo(nx + 7, at + 26); c.lineTo(nx, at + 21); c.lineTo(nx - 7, at + 26); c.closePath(); c.fill();
      c.font = font(true, 11);
      c.fillText(text.export.north, nx - 4, at + 39);
    });
    y += 42;
  }
  const paragraphs = [doc.layout.notes, ...printLabels(ctx), ...(ctx.notes ?? []), ctx.credits.join(' · '), `${text.export.dataDates}: ${ctx.dates}`,
    ctx.leftOut?.length ? text.export.leftOut(ctx.leftOut.join(', ')) : null, text.export.credit].filter(Boolean);
  c.font = font(false, 11);
  for (const paragraph of paragraphs) {
    for (const line of wrap(c, paragraph, width - 4)) {
      y += 14 * s;
      const at = y;
      ops.push(() => { c.font = font(false, 11); c.fillStyle = '#17212c'; c.fillText(line, x, at); });
    }
    y += 6 * s;
  }
  return { ops, bottom: y };
}

// A PNG of the same layout, drawn on a canvas at 2x (up to 4,096 px on the long side).
export async function pngMap(ctx) {
  const { doc, text } = ctx;
  const page = pageSize(doc.layout);
  const { frame, charts, map, cells } = pageAreas(ctx);
  const scaleFactor = Math.min(2, 4096 / Math.max(page.width, page.height));
  const rendered = await renderMap(ctx, { width: map.w, height: map.h }, scaleFactor);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(page.width * scaleFactor);
  canvas.height = Math.round(page.height * scaleFactor);
  const c = canvas.getContext('2d');
  c.scale(scaleFactor, scaleFactor);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, page.width, page.height);
  c.fillStyle = '#17212c';
  c.font = '600 22px system-ui, sans-serif';
  c.fillText(doc.title || text.export.untitled, 0, 26);
  c.font = '14px system-ui, sans-serif';
  if (doc.subtitle) c.fillText(doc.subtitle, 0, 48);
  const image = new Image();
  image.src = rendered.image;
  await image.decode();
  const top = 64;
  c.drawImage(image, 0, top, map.w, map.h);
  c.strokeStyle = '#8a96a3';
  c.strokeRect(0, top, map.w, map.h);
  for (const [i, cell] of cells.entries()) await drawChart(c, charts[i], cell, top, scaleFactor);
  const x = doc.layout.orientation === 'portrait' ? 0 : frame.width + 16;
  const y = doc.layout.orientation === 'portrait' ? top + frame.height + 18 : top + 4;
  const width = doc.layout.orientation === 'portrait' ? page.width : page.width - x;
  // The side column is laid out first, then shrunk until it ends on the page, so the credits are never cut off.
  const limit = page.height - 6;
  let scale = 1;
  let side = sideOps(c, ctx, rendered.scale, x, y, width, scale);
  for (let i = 0; i < 8 && side.bottom > limit && scale > MIN_SIDE_SCALE; i += 1) {
    scale = Math.max(MIN_SIDE_SCALE, scale * Math.min(0.95, (limit - y) / (side.bottom - y)));
    side = sideOps(c, ctx, rendered.scale, x, y, width, scale);
  }
  for (const op of side.ops) op();
  try {
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('empty'))), 'image/png'));
  } catch (error) {
    error.tainted = true;
    throw error;
  }
}

// Every feature of a layer in the area, cut at the area's edge when the layer's clip_mode is 'cut'.
// Returns { features, complete }: complete is false above DATA_CAP.
export async function fetchLayerData({ client, entry, where, geometry, areaGeometry, turf, onProgress }) {
  const fields = [entry.source.id_field, ...entry.fields.map((field) => field.source)];
  const page = await client.allFeatures(entry.source.url, { where, geometry, outFields: [...new Set(fields)], precision: 6 }, DATA_CAP + 1, onProgress);
  if (page.features.length > DATA_CAP) return { features: [], complete: false };
  let features = page.features.map((feature) => ({ type: 'Feature', geometry: feature.geometry, properties: toRow(feature.properties ?? {}, entry) }));
  if (areaGeometry && entry.clip_mode === 'cut' && entry.geometry !== 'point') {
    features = features.map((feature) => clipFeature(feature, areaGeometry, turf.intersect)).filter(Boolean);
  }
  return { features, complete: true };
}

export function dataCsv(entry, features, preface) {
  const columns = entry.fields.map((field) => [field.name, field.label]);
  const decimals = Object.fromEntries(entry.fields.filter((field) => field.type === 'number').map((field) => [field.name, field.decimals ?? 2]));
  const points = entry.geometry === 'point';
  if (points) columns.push(['lon', 'Longitude'], ['lat', 'Latitude']);
  columns.push(['atlas_id', 'ID']);
  const rows = features.map((feature) => (points && feature.geometry?.type === 'Point'
    ? { ...feature.properties, lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] } : feature.properties));
  const body = toCsv(rows, columns, { ...decimals, lon: 6, lat: 6 }).replace(/^﻿/, '');
  const quoted = preface.map((line) => (/[",\r\n]/.test(line) ? `"${line.replace(/"/g, '""')}"` : line));
  return `﻿${quoted.join('\r\n')}\r\n${body}`;
}

export function dataGeojson(entry, features, preface) {
  return { type: 'FeatureCollection', properties: { layer: entry.title, notes: preface }, features };
}
