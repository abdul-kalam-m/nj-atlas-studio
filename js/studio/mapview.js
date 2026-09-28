// The Studio map: MapLibre, PMTiles, data layers in document order, the area mask, and the overlays for buffers,
// selection and drawing. Drawing order, bottom to top: basemap shapes, data layers, the mask and the area's
// outline, basemap labels, rings, results, the selection, the site, the drawing in progress (D-042).
import { Protocol } from 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm';
import { worldMinus } from './geo.js';
import { BASEMAP_MODES, BASEMAP_NAMES, BASEMAP_STYLES, THEMES, modeOperations, veilPaint } from './basemaps.js';

const MAPLIBRE_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';
const STUDIO_SOURCES = ['mask', 'area', 'rings', 'hits', 'selected', 'sites', 'draft'];
const VEIL = 'basemap-veil'; // D-080: between the basemap and Studio's layers
const isStudioSource = (id) => STUDIO_SOURCES.includes(id) || String(id).startsWith('L:');
const isStudioLayer = (layer) => layer.id === VEIL || isStudioSource(layer.source);
const NJ_BOUNDS = [[-75.6, 38.9], [-73.9, 41.4]];
const EMPTY = { type: 'FeatureCollection', features: [] };
const PREFIX = 'L:';
let libraryPromise = null;

function loadLibrary() {
  if (!libraryPromise) {
    libraryPromise = import(MAPLIBRE_URL).then((module) => {
      const maplibregl = module.default ?? module;
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      return maplibregl;
    });
    libraryPromise.catch(() => { libraryPromise = null; });
  }
  return libraryPromise;
}

const OVERLAYS = [
  { id: 'rings', layers: [
    { id: 'ring-fill', type: 'fill', paint: { 'fill-color': '#9A3B26', 'fill-opacity': 0.06 } },
    { id: 'ring-line', type: 'line', paint: { 'line-color': '#9A3B26', 'line-width': 2, 'line-dasharray': [3, 2] } }] },
  { id: 'hits', layers: [
    { id: 'hits-fill', type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#F2C14E', 'fill-opacity': 0.25 } },
    { id: 'hits-line', type: 'line', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#B8860B', 'line-width': 2 } },
    { id: 'hits-point', type: 'circle', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#B8860B', 'circle-stroke-width': 2.5 } }] },
  { id: 'selected', layers: [
    { id: 'selected-line', type: 'line', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#111111', 'line-width': 3 } },
    { id: 'selected-point', type: 'circle', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 8, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#111111', 'circle-stroke-width': 3 } }] },
  { id: 'sites', layers: [
    { id: 'site-fill', type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#0E5A66', 'fill-opacity': 0.35 } },
    { id: 'site-line', type: 'line', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#0E5A66', 'line-width': 2.5 } },
    { id: 'site-point', type: 'circle', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#0E5A66', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } }] },
  { id: 'draft', layers: [
    { id: 'draft-fill', type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#0E5A66', 'fill-opacity': 0.15 } },
    { id: 'draft-line', type: 'line', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#0E5A66', 'line-width': 2, 'line-dasharray': [1, 1] } },
    { id: 'draft-point', type: 'circle', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#0E5A66', 'circle-stroke-width': 2 } }] },
];

export async function createStudioMap(container, { interactive = true, preserveDrawingBuffer = false, pixelRatio, bounds, basemap = 'positron',
  basemapMode = 'on', onBasemap = null, onBasemapMode = null, text = null } = {}) {
  const maplibregl = await loadLibrary();
  let basemapControl = null;
  const map = new maplibregl.Map({
    container, style: BASEMAP_STYLES[basemap] ?? BASEMAP_STYLES.positron, bounds: bounds ?? NJ_BOUNDS, fitBoundsOptions: { padding: 20 },
    attributionControl: false, interactive, preserveDrawingBuffer, ...(pixelRatio ? { pixelRatio } : {}),
    canvasContextAttributes: preserveDrawingBuffer ? { preserveDrawingBuffer: true } : undefined,
  });
  if (interactive) {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    if (onBasemap) {
      basemapControl = new BasemapControl({ basemap, mode: basemapMode, onBasemap, onMode: onBasemapMode, text });
      map.addControl(basemapControl, 'top-right');
    }
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right');
  }
  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  await new Promise((resolve, reject) => {
    map.once('load', resolve);
    map.once('error', (event) => { if (!map.loaded()) reject(event.error ?? new Error('map failed to load')); });
  });
  const studioMap = new StudioMap(maplibregl, map);
  studioMap.basemap = BASEMAP_STYLES[basemap] ? basemap : 'positron';
  studioMap.basemapControl = basemapControl;
  studioMap.setBasemapMode(basemapMode);
  return studioMap;
}

// The basemap control in the map's corner (D-071, D-080): which basemap, and a three-way slider for On, Dim and
// Off. Both are view settings saved in the map document.
class BasemapControl {
  constructor({ basemap, mode, onBasemap, onMode, text }) {
    Object.assign(this, { basemap, mode, onBasemap, onMode, text: text ?? {} });
  }

  onAdd() {
    const T = this.text;
    const select = document.createElement('select');
    select.className = 'basemap-select';
    select.setAttribute('aria-label', T.label ?? 'Basemap');
    for (const key of BASEMAP_NAMES) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = T[key] ?? key;
      select.append(option);
    }
    select.addEventListener('change', () => this.onBasemap(select.value));
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(BASEMAP_MODES.length - 1);
    slider.step = '1';
    slider.className = 'basemap-slider';
    slider.setAttribute('aria-label', T.mode ?? 'Basemap display');
    slider.addEventListener('input', () => this.onMode?.(BASEMAP_MODES[Number(slider.value)]));
    const stops = document.createElement('div');
    stops.className = 'basemap-stops';
    stops.setAttribute('aria-hidden', 'true');
    for (const [index, mode] of BASEMAP_MODES.entries()) {
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.tabIndex = -1; // the slider is the keyboard control
      stop.textContent = T.modes?.[mode] ?? mode;
      stop.addEventListener('click', () => { slider.value = String(index); this.onMode?.(mode); });
      stops.append(stop);
    }
    const strength = document.createElement('div');
    strength.className = 'basemap-strength';
    strength.append(stops, slider);
    this.select = select;
    this.slider = slider;
    this.stops = stops;
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group basemap-control';
    this.container.append(select, strength);
    this.set(this.basemap, this.mode);
    return this.container;
  }

  set(basemap, mode) {
    this.basemap = basemap;
    this.mode = mode;
    if (!this.select) return;
    this.select.value = basemap;
    const index = Math.max(0, BASEMAP_MODES.indexOf(mode));
    this.slider.value = String(index);
    this.slider.setAttribute('aria-valuetext', this.text.modes?.[mode] ?? mode);
    [...this.stops.children].forEach((stop, i) => stop.classList.toggle('on', i === index));
  }

  onRemove() {
    this.container.remove();
  }
}

export class StudioMap {
  constructor(maplibregl, map) {
    this.maplibregl = maplibregl;
    this.map = map;
    this.dataLayers = []; // [{ key, sourceId, layerIds }]
    this.sources = new Map(); // sourceId -> signature
    const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
    this.basemapMode = 'on';
    this.saved = new Map(); // the basemap layers' own visibility and label opacity (D-080)
    map.addLayer({ id: VEIL, type: 'background', layout: { visibility: 'none' }, paint: { 'background-color': '#ffffff', 'background-opacity': 0 } }, firstLabel);
    map.addSource('mask', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'mask-fill', type: 'fill', source: 'mask', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.6 } }, firstLabel);
    map.addSource('area', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#17212c', 'line-width': 2.2 } }, firstLabel);
    for (const overlay of OVERLAYS) {
      map.addSource(overlay.id, { type: 'geojson', data: EMPTY });
      for (const layer of overlay.layers) map.addLayer({ ...layer, source: overlay.id });
    }
    this.popup = null;
  }

  // Data layers bottom to top: [{ key, source: {type, url|data, attribution}, sourceSignature, specs: [layer specs] }].
  // Sources are kept when their signature is unchanged, so live data and tile caches survive restyling.
  syncLayers(stack) {
    for (const layer of this.dataLayers) for (const id of layer.layerIds) if (this.map.getLayer(id)) this.map.removeLayer(id);
    const wanted = new Map(stack.map((item) => [`${PREFIX}${item.key}`, item]));
    for (const [sourceId, signature] of [...this.sources]) {
      const item = wanted.get(sourceId);
      if (!item || item.sourceSignature !== signature) {
        if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
        this.sources.delete(sourceId);
      }
    }
    this.dataLayers = [];
    for (const item of stack) {
      const sourceId = `${PREFIX}${item.key}`;
      if (!this.sources.has(sourceId)) {
        this.map.addSource(sourceId, item.source);
        this.sources.set(sourceId, item.sourceSignature);
      }
      const layerIds = [];
      for (const spec of item.specs) {
        const id = `${sourceId}:${spec.id}`;
        this.map.addLayer({ ...spec, id, source: sourceId, metadata: { key: item.key } }, 'mask-fill');
        layerIds.push(id);
      }
      this.dataLayers.push({ key: item.key, sourceId, layerIds });
    }
    // Long publisher credits would cover the map: the compact credits start closed (the "i" button opens them).
    this.map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  }

  // Change the basemap, carrying Studio's sources and layers (with their data) into the new style: the veil, data,
  // mask and outline go below the new basemap's labels, the overlays above everything. The current mode carries
  // over (D-080).
  setBasemap(name) {
    if (!BASEMAP_STYLES[name] || name === this.basemap) return Promise.resolve();
    this.basemap = name;
    return new Promise((resolve) => {
      this.map.once('style.load', () => {
        this.map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
        this.saved = new Map();
        this.setBasemapMode(this.basemapMode);
        resolve();
      });
      this.map.setStyle(BASEMAP_STYLES[name], {
        transformStyle: (previous, next) => {
          const sources = Object.fromEntries(Object.entries(previous.sources).filter(([id]) => isStudioSource(id)));
          const ours = previous.layers.filter(isStudioLayer);
          const below = ours.filter((layer) => layer.id === VEIL || layer.source.startsWith('L:') || layer.source === 'mask' || layer.source === 'area');
          const above = ours.filter((layer) => !below.includes(layer));
          const firstLabel = next.layers.findIndex((layer) => layer.type === 'symbol');
          const layers = firstLabel < 0 ? [...next.layers, ...below, ...above]
            : [...next.layers.slice(0, firstLabel), ...below, ...next.layers.slice(firstLabel), ...above];
          return { ...next, sources: { ...next.sources, ...sources }, layers };
        },
      });
    });
  }

  // On, Dim or Off (D-080), and Studio's mask and outline colors for this basemap.
  setBasemapMode(mode) {
    this.basemapMode = BASEMAP_MODES.includes(mode) ? mode : 'on';
    const map = this.map;
    const base = map.getStyle().layers.filter((layer) => !isStudioLayer(layer));
    for (const operation of modeOperations(base, this.basemapMode, this.saved)) {
      map.setLayoutProperty(operation.id, 'visibility', operation.visibility);
      for (const [property, value] of Object.entries(operation.paint ?? {})) map.setPaintProperty(operation.id, property, value);
    }
    const veil = veilPaint(this.basemap, this.basemapMode);
    map.setLayoutProperty(VEIL, 'visibility', veil.visibility);
    map.setPaintProperty(VEIL, 'background-color', veil.color);
    map.setPaintProperty(VEIL, 'background-opacity', veil.opacity);
    const theme = THEMES[this.basemap] ?? THEMES.positron;
    map.setPaintProperty('mask-fill', 'fill-color', theme.mask);
    map.setPaintProperty('mask-fill', 'fill-opacity', theme.maskOpacity);
    map.setPaintProperty('area-line', 'line-color', theme.outline);
  }

  setData(key, featureCollection) {
    this.map.getSource(`${PREFIX}${key}`)?.setData(featureCollection);
  }

  setOverlay(id, featureCollection) {
    this.map.getSource(id)?.setData(featureCollection ?? EMPTY);
  }

  // The area: its outline, and the world outside it dimmed when `mask` is on.
  setArea(geometry, mask) {
    this.setOverlay('area', geometry ? { type: 'Feature', properties: {}, geometry } : EMPTY);
    this.setOverlay('mask', geometry && mask ? worldMinus(geometry) : EMPTY);
  }

  dataLayerIds() {
    return this.dataLayers.flatMap((layer) => layer.layerIds).filter((id) => !id.endsWith(':labels') && this.map.getLayer(id));
  }

  // Features under a point, within `pad` pixels (points are small targets): [{ key, properties, geometry }],
  // top layer first.
  featuresAt(point, pad = 0) {
    const ids = this.dataLayerIds();
    if (!ids.length) return [];
    const where = pad ? [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]] : point;
    return this.map.queryRenderedFeatures(where, { layers: ids })
      .map((feature) => ({ key: feature.layer.metadata?.key, properties: feature.properties, geometry: feature.geometry }));
  }

  showPopup(lngLat, content) {
    this.popup?.remove();
    this.popup = new this.maplibregl.Popup({ maxWidth: '320px' }).setLngLat(lngLat).setDOMContent(content).addTo(this.map);
  }

  closePopup() {
    this.popup?.remove();
  }

  bounds() {
    const b = this.map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  zoom() {
    return this.map.getZoom();
  }

  view() {
    const center = this.map.getCenter();
    return { center: [Number(center.lng.toFixed(6)), Number(center.lat.toFixed(6))], zoom: Number(this.map.getZoom().toFixed(2)), bearing: 0 };
  }

  setView(view) {
    this.map.jumpTo({ center: view.center, zoom: view.zoom, bearing: view.bearing ?? 0 });
  }

  fitBounds(bounds, maxZoom = 16) {
    this.map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, maxZoom, duration: 500 });
  }

  idle(timeoutMs = 20000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => { if (!done) { done = true; resolve(value); } };
      if (this.map.loaded() && this.map.areTilesLoaded()) setTimeout(() => finish(true), 50);
      this.map.once('idle', () => finish(true));
      setTimeout(() => finish(false), timeoutMs);
    });
  }

  remove() {
    this.map.remove();
  }
}
