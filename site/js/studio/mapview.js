// The Studio map: MapLibre, PMTiles, data layers in document order, the area mask, and the overlays for buffers,
// selection and drawing. Drawing order, bottom to top: basemap shapes, data layers, the mask and the area's
// outline, basemap labels, rings, results, the selection, the site, the drawing in progress (D-042).
import { Protocol } from 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm';
import { worldMinus } from './geo.js';

const MAPLIBRE_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
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

export async function createStudioMap(container, { interactive = true, preserveDrawingBuffer = false, pixelRatio, bounds } = {}) {
  const maplibregl = await loadLibrary();
  const map = new maplibregl.Map({
    container, style: BASEMAP_STYLE, bounds: bounds ?? NJ_BOUNDS, fitBoundsOptions: { padding: 20 },
    attributionControl: false, interactive, preserveDrawingBuffer, ...(pixelRatio ? { pixelRatio } : {}),
    canvasContextAttributes: preserveDrawingBuffer ? { preserveDrawingBuffer: true } : undefined,
  });
  if (interactive) {
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right');
  }
  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  await new Promise((resolve, reject) => {
    map.once('load', resolve);
    map.once('error', (event) => { if (!map.loaded()) reject(event.error ?? new Error('map failed to load')); });
  });
  return new StudioMap(maplibregl, map);
}

export class StudioMap {
  constructor(maplibregl, map) {
    this.maplibregl = maplibregl;
    this.map = map;
    this.dataLayers = []; // [{ key, sourceId, layerIds }]
    this.sources = new Map(); // sourceId -> signature
    const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
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
