// Buffers (D-033, IMPLEMENTATION_GUIDE.md §4.7). Studio draws the ring; each target layer's service finds what lies
// within the distance of the site's edge (a distance query), or, for layers without one, inside the ring. Buffers
// never carry the area filter: results may lie outside the town or county.
import { conditionsWhere, joinWhere } from './sql.js';
import { toRow } from './transform.js';
import { outFields } from './registry.js';
import { toCsv, slug } from '../csv.js';

export const RESULT_CAP = 5000;

export async function ringFor(turf, geometry, distanceFt) {
  const ring = turf.buffer({ type: 'Feature', properties: {}, geometry }, distanceFt, { units: 'feet', steps: 16 });
  return { type: 'Feature', properties: { distance_ft: distanceFt }, geometry: ring.geometry };
}

function listColumns(entry) {
  const names = [entry.label_field, ...(entry.list_fields ?? [])];
  return entry.fields.filter((field) => names.includes(field.name));
}

// One target layer: its matches as rows and GeoJSON features (output names).
async function runTarget(client, entry, layerDoc, site, ring, distanceFt) {
  const types = await client.fieldTypes(entry.source.url);
  const where = joinWhere(entry.source.where, conditionsWhere(entry, layerDoc?.filters ?? [], types));
  const options = entry.distance_query
    ? { where, geometry: site, distanceFt, outFields: outFields(entry, listColumns(entry)), precision: 6 }
    : { where, geometry: ring.geometry, outFields: outFields(entry, listColumns(entry)), precision: 6 };
  const page = await client.allFeatures(entry.source.url, options, RESULT_CAP + 1);
  const capped = page.features.length > RESULT_CAP;
  const features = page.features.slice(0, RESULT_CAP).map((feature) => ({
    type: 'Feature', geometry: feature.geometry, properties: { layer: entry.id, ...toRow(feature.properties ?? {}, entry) } }));
  return { id: entry.id, entry, features, count: capped ? null : features.length, capped };
}

// { site, ring, targets: [{ id, entry, features, count, capped, error }], ranAt }
export async function runBuffer({ client, turf, buffer, entries, layerDocs }) {
  const site = buffer.source.geometry;
  const ring = await ringFor(turf, site, buffer.distance_ft);
  const targets = await Promise.all(entries.map(async (entry) => {
    try {
      return await runTarget(client, entry, layerDocs.find((layer) => layer.id === entry.id), site, ring, buffer.distance_ft);
    } catch (error) {
      return { id: entry.id, entry, features: [], count: null, capped: false, error };
    }
  }));
  return { bufferId: buffer.id, site, ring, targets, ranAt: new Date() };
}

export function hasParcels(results) {
  return results.targets.some((target) => target.entry.export_note === 'parcels' && target.features.length);
}

// Rows for the combined list: Layer, Name, Type, ID, Site, Details.
export function combinedRows(results, buffer) {
  const rows = [];
  for (const target of results.targets) {
    const { entry } = target;
    const [typeField, ...rest] = (entry.list_fields ?? []).map((name) => entry.fields.find((field) => field.name === name));
    for (const feature of target.features) {
      const p = feature.properties;
      const isSite = buffer.source.kind === 'feature' && buffer.source.layer === entry.id && buffer.source.atlas_id === p.atlas_id;
      rows.push({
        layer: entry.title,
        name: p[entry.label_field] ?? '',
        type: typeField ? (p[typeField.name] ?? '') : '',
        id: p.atlas_id ?? '',
        site: isSite ? 'Site' : '',
        details: rest.filter(Boolean).map((field) => `${field.label}: ${p[field.name] ?? ''}`).join('; '),
      });
    }
  }
  return rows;
}

function csvLine(cells) {
  return cells.map((cell) => (/[",\r\n]/.test(cell) ? `"${String(cell).replace(/"/g, '""')}"` : String(cell))).join(',');
}

// The list as CSV. The first line is always the screening label (D-041); lists with parcels add the parcel line.
export function resultsCsv(results, buffer, { label, parcelLine, siteLine, credits, headers }) {
  const preface = [label, ...(hasParcels(results) ? [parcelLine] : []), siteLine, ...credits].map((line) => csvLine([line]));
  const body = toCsv(combinedRows(results, buffer), [['layer', headers.layer], ['name', headers.name], ['type', headers.type],
    ['id', headers.id], ['site', headers.site], ['details', headers.details]]).replace(/^﻿/, '');
  return `﻿${preface.join('\r\n')}\r\n${body}`;
}

export function resultsGeojson(results, buffer, { label, parcelLine, siteLine, credits }) {
  return {
    type: 'FeatureCollection',
    properties: { screening_label: label, ...(hasParcels(results) ? { parcel_note: parcelLine } : {}), site: siteLine, credits },
    features: [
      { type: 'Feature', properties: { layer: 'site', distance_ft: buffer.distance_ft }, geometry: results.site },
      { type: 'Feature', properties: { layer: 'ring', distance_ft: buffer.distance_ft }, geometry: results.ring.geometry },
      ...results.targets.flatMap((target) => target.features),
    ],
  };
}

export function screeningFileName(siteName, extension, date = new Date()) {
  return `screening_${slug(siteName || 'site')}_${date.toISOString().slice(0, 10)}.${extension}`;
}
