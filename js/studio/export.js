// Exports (D-036, IMPLEMENTATION_GUIDE.md §4.8-§4.9): the print layout (the browser's "Save as PDF"), PNG, and
// clipped data. The map in a print or PNG is a second, non-interactive map at twice the pixel density.
import { el, svgEl } from './dom.js';
import { createStudioMap } from './mapview.js';
import { metersPerPixel, scaleBar } from './geo.js';
import { clipFeature } from './clip.js';
import { toRow } from './transform.js';
import { toCsv } from '../csv.js';

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

function swatchNode(swatch) {
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
    studioMap = await createStudioMap(holder, { interactive: false, preserveDrawingBuffer: true, pixelRatio, bounds: ctx.bounds, basemap: ctx.doc.basemap });
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
  if (ctx.label) parts.push(el('p', { class: 'print-label', text: ctx.label }));
  for (const note of ctx.notes ?? []) parts.push(el('p', { class: 'print-label', text: note }));
  parts.push(el('p', { class: 'print-credits', text: ctx.credits.join(' · ') }));
  parts.push(el('p', { class: 'print-credits', text: `${text.export.dataDates}: ${ctx.dates}` }));
  if (ctx.leftOut?.length) parts.push(el('p', { class: 'print-credits', text: text.export.leftOut(ctx.leftOut.join(', ')) }));
  parts.push(el('p', { class: 'print-credits', text: text.export.credit }));
  return parts;
}

// The print layout, not yet on the page: { root, page, complete }. The preview shows it; printRoot prints it.
export async function renderPrintRoot(ctx) {
  const { doc, text } = ctx;
  const page = pageSize(doc.layout);
  const frame = frameSize(doc.layout);
  const rendered = await renderMap(ctx, frame, 2);
  const root = el('div', { id: 'print-root', class: `print-root ${doc.layout.orientation}`, style: `width:${page.width}px` }, [
    el('header', { class: 'print-title' }, [el('h1', { text: doc.title || text.export.untitled }), doc.subtitle ? el('p', { text: doc.subtitle }) : null]),
    el('div', { class: 'print-body' }, [
      el('div', { class: 'print-map', style: `width:${frame.width}px;height:${frame.height}px` },
        [el('img', { src: rendered.image, alt: doc.title || text.export.untitled, width: frame.width, height: frame.height })]),
      el('aside', { class: 'print-side' }, sideParts(ctx, rendered.scale)),
    ]),
  ]);
  return { root, page, complete: rendered.complete };
}

// Put a layout on the page for the print dialog: { cleanup }.
export async function attachForPrint(root, page) {
  const pageRule = el('style', { id: 'print-page', text: `@page { size: ${page.widthIn}in ${page.heightIn}in; margin: ${MARGIN_IN}in; }` });
  document.head.append(pageRule);
  document.body.append(root);
  document.body.classList.add('printing');
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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

// A PNG of the same layout, drawn on a canvas at 2x (up to 4,096 px on the long side).
export async function pngMap(ctx) {
  const { doc, text } = ctx;
  const page = pageSize(doc.layout);
  const frame = frameSize(doc.layout);
  const scaleFactor = Math.min(2, 4096 / Math.max(page.width, page.height));
  const rendered = await renderMap(ctx, frame, scaleFactor);
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
  c.drawImage(image, 0, top, frame.width, frame.height);
  c.strokeStyle = '#8a96a3';
  c.strokeRect(0, top, frame.width, frame.height);
  let x = doc.layout.orientation === 'portrait' ? 0 : frame.width + 16;
  let y = doc.layout.orientation === 'portrait' ? top + frame.height + 18 : top + 4;
  const width = doc.layout.orientation === 'portrait' ? page.width : page.width - x;
  if (doc.layout.legend) {
    for (const group of ctx.legend) {
      c.font = '600 12px system-ui, sans-serif';
      c.fillStyle = '#17212c';
      const single = group.rows.length === 1 && group.rows[0].label === group.title;
      if (!single) c.fillText(group.title, x, y += 14);
      c.font = '12px system-ui, sans-serif';
      for (const row of group.rows.slice(0, 14)) {
        y += 16;
        const s = row.swatch;
        c.fillStyle = s.color;
        if (s.dashed) { c.strokeStyle = '#9A3B26'; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 20, y - 4); c.stroke(); c.setLineDash([]); }
        else if (s.geometry === 'line') c.fillRect(x, y - 5, 20, Math.max(2, s.width));
        else if (s.geometry === 'point') { c.beginPath(); c.arc(x + 6, y - 4, 5, 0, Math.PI * 2); c.fill(); }
        else if (s.fill) c.fillRect(x, y - 10, 18, 11);
        else { c.strokeStyle = s.color; c.lineWidth = 2; c.strokeRect(x, y - 10, 18, 11); }
        c.fillStyle = '#17212c';
        c.fillText(row.label, x + 28, y);
      }
      y += 8;
    }
  }
  c.font = '11px system-ui, sans-serif';
  if (doc.layout.scale_bar) {
    y += 16;
    c.fillStyle = '#17212c';
    c.fillRect(x, y, rendered.scale.px, 4);
    c.fillText(`${rendered.scale.value.toLocaleString('en-US')} ${rendered.scale.unit}`, x + rendered.scale.px + 6, y + 5);
    y += 10;
  }
  if (doc.layout.north_arrow) {
    const nx = x + 10;
    c.fillStyle = '#17212c';
    c.beginPath(); c.moveTo(nx, y + 6); c.lineTo(nx + 7, y + 26); c.lineTo(nx, y + 21); c.lineTo(nx - 7, y + 26); c.closePath(); c.fill();
    c.font = '600 11px system-ui, sans-serif';
    c.fillText(text.export.north, nx - 4, y + 39);
    c.font = '11px system-ui, sans-serif';
    y += 42;
  }
  const paragraphs = [doc.layout.notes, ctx.label, ...(ctx.notes ?? []), ctx.credits.join(' · '), `${text.export.dataDates}: ${ctx.dates}`, text.export.credit].filter(Boolean);
  for (const paragraph of paragraphs) {
    for (const line of wrap(c, paragraph, width - 4)) {
      y += 14;
      c.fillText(line, x, y);
    }
    y += 6;
  }
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
