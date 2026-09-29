// Buffer layers (D-076): a geoprocessing step, as in a desktop GIS. Take one layer's features (all of them in the
// area, a filtered subset, or those picked on the map), buffer them by one or more distances in feet or meters,
// and get a map layer per distance, each with its own style, merged (dissolved) or kept one per feature.
// The document keeps the recipe, not the shapes: a link or map file runs it again when it opens.
// Pure: no imports.

export const MAX_RINGS = 6;
export const MAX_BUFFER_FEATURES = 2000;
export const MAX_PICKED = 500;
export const UNITS = ['ft', 'm'];
export const METERS_PER_UNIT = { ft: 0.3048, m: 1 };
export const MAX_DISTANCE = { ft: 26400, m: 8000 }; // 5 miles; 8 km
export const SELECTS = ['all', 'filter', 'picked'];
export const OUTLINE_STYLES = ['solid', 'dashed', 'dotted'];
const DASHES = { dashed: [4, 2.5], dotted: [0.1, 2.2] };

// ColorBrewer sequential ramps, dark to light: one ramp per buffer, the smallest distance darkest.
export const PALETTES = [
  ['#08519C', '#3182BD', '#6BAED6', '#9ECAE1', '#C6DBEF'],
  ['#A63603', '#E6550D', '#FD8D3C', '#FDAE6B', '#FDD0A2'],
  ['#54278F', '#756BB1', '#9E9AC8', '#BCBDDC', '#DADAEB'],
  ['#006D2C', '#31A354', '#74C476', '#A1D99B', '#C7E9C0'],
];

export function toMeters(value, unit) {
  return value * (METERS_PER_UNIT[unit] ?? 1);
}

export function validDistance(value, unit) {
  return Number.isFinite(value) && value > 0 && value <= (MAX_DISTANCE[unit] ?? 0);
}

// "1,000 ft", "2.5 m"
export function formatDistance(value, unit) {
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`;
}

export function defaultStyle(bufferIndex, ringIndex) {
  const palette = PALETTES[bufferIndex % PALETTES.length];
  return { fill: palette[Math.min(ringIndex, palette.length - 1)], fill_opacity: 0.3, outline: palette[0], outline_width: 1.5, outline_style: 'solid' };
}

// A new buffer of `layer`, with one ring, not yet run.
export function newBuffer(id, layer, bufferIndex, { unit = 'ft', distance = 500 } = {}) {
  return { id, layer, name: '', select: 'all', filters: [], picked: [], unit, dissolve: false, visible: true,
    distances: [{ value: distance, style: defaultStyle(bufferIndex, 0) }] };
}

// A buffer a rule defines (D-085), from the layer's recipe: its distances in feet, dissolved, named after it.
export function presetPatch(preset, bufferIndex) {
  return { preset: preset.key, name: preset.label, unit: 'ft', dissolve: true,
    distances: preset.distances_ft.map((value, index) => ({ value, style: defaultStyle(bufferIndex, index) })) };
}

// The preset a buffer still follows, or null.
export function presetOf(buffer, entry) {
  return buffer.preset ? (entry?.buffer_presets ?? []).find((preset) => preset.key === buffer.preset) ?? null : null;
}

// Changing the distances, unit or layer leaves the rule: drop the preset, and its name if it was not changed.
export function dropPreset(buffer, entry) {
  if (!buffer.preset) return;
  if (buffer.name === presetOf(buffer, entry)?.label) buffer.name = '';
  delete buffer.preset;
}

// The next ring's distance: double the largest, within the limit.
export function nextDistance(buffer) {
  const largest = Math.max(0, ...buffer.distances.map((ring) => ring.value));
  if (!largest) return buffer.unit === 'm' ? 100 : 500;
  return Math.min(MAX_DISTANCE[buffer.unit], largest * 2);
}

// Ring indexes from the largest distance to the smallest: the drawing order, so smaller rings stay on top.
export function drawingOrder(buffer) {
  return buffer.distances.map((ring, index) => ({ index, value: ring.value })).sort((a, b) => b.value - a.value).map((ring) => ring.index);
}

// A short account of a filter: "Elementary, Middle", "3 values", "Acres 5–10".
export function filterSummary(filters, fields, text) {
  const parts = filters.map((condition) => {
    const field = fields.find((f) => f.name === condition.field);
    if (condition.op === 'in') {
      const values = [...(condition.values ?? []), ...(condition.include_blank ? [text.blank] : [])];
      return values.length <= 3 ? values.join(', ') : text.values(values.length);
    }
    if (condition.op === 'contains') return `${field?.label ?? condition.field} “${condition.value}”`;
    const min = condition.min ?? '';
    const max = condition.max ?? '';
    return `${field?.label ?? condition.field} ${min}–${max}`;
  });
  return parts.filter(Boolean).join('; ');
}

// The name on the map, in the legend and in the Layers tab.
export function bufferName(buffer, entry, text) {
  if (buffer.name) return buffer.name;
  const title = entry?.title ?? buffer.layer;
  if (buffer.select === 'picked') return text.pickedName(title, buffer.picked.length);
  if (buffer.select === 'filter' && buffer.filters.length) return text.filteredName(title, filterSummary(buffer.filters, entry?.fields ?? [], text));
  return text.name(title);
}

// What the output depends on. When it changes, the drawn output is out of date.
export function outputKey(buffer, areaKey) {
  return JSON.stringify([buffer.layer, buffer.select, buffer.select === 'filter' ? buffer.filters : [],
    buffer.select === 'picked' ? buffer.picked : [], buffer.unit, buffer.distances.map((ring) => ring.value), buffer.dissolve,
    buffer.select === 'picked' ? null : areaKey]);
}

// MapLibre layer specs for a buffer's output source: a fill and an outline per ring, largest first.
export function bufferSpecs(buffer) {
  const specs = [];
  for (const index of drawingOrder(buffer)) {
    const { style } = buffer.distances[index];
    const filter = ['==', ['get', 'ring'], index];
    specs.push({ id: `r${index}-fill`, type: 'fill', filter, paint: { 'fill-color': style.fill, 'fill-opacity': style.fill_opacity } });
    if (style.outline_width > 0) {
      const paint = { 'line-color': style.outline, 'line-width': style.outline_width };
      if (DASHES[style.outline_style]) paint['line-dasharray'] = DASHES[style.outline_style];
      specs.push({ id: `r${index}-line`, type: 'line', filter, paint,
        layout: { 'line-join': 'round', 'line-cap': style.outline_style === 'dotted' ? 'round' : 'butt' } });
    }
  }
  return specs;
}

// Legend rows, smallest distance first.
export function bufferLegend(buffer) {
  return [...buffer.distances].sort((a, b) => a.value - b.value).map((ring) => ({
    swatch: { geometry: 'polygon', fill: true, color: ring.style.fill, opacity: ring.style.fill_opacity, outline: ring.style.outline,
      outlineWidth: ring.style.outline_width, dash: ring.style.outline_style },
    label: formatDistance(ring.value, buffer.unit),
  }));
}

// The output as a download: one feature per buffer shape, with the distance and unit it was made with.
export function bufferDownload(output, { name, notes }) {
  return {
    type: 'FeatureCollection',
    properties: { name, layer: output.layer, unit: output.unit, dissolved: output.dissolve, notes },
    features: output.features.map((feature) => ({ type: 'Feature', geometry: feature.geometry,
      properties: { ...feature.properties, distance: output.distances[feature.properties.ring] ?? null, unit: output.unit } })),
  };
}
