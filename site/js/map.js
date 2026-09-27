// MapLibre setup, the PMTiles protocol, one data layer at a time, popups, boundary and place outlines.
// Drawing order, bottom to top: data, the boundary level's outlines, the chosen area's outline, basemap labels.
import { Protocol } from 'https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/+esm';

const MAPLIBRE_URL = 'https://cdn.jsdelivr.net/npm/maplibre-gl@6.11.2/dist/maplibre-gl.mjs';
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const NJ_BOUNDS = [[-75.6, 38.9], [-73.9, 41.4]];
const DATA_SOURCE = 'atlas-data';
const DATA_LAYERS = ['atlas-fill', 'atlas-outline', 'atlas-line', 'atlas-circle'];
const SELECTED_LAYER = 'atlas-selected';
const CONTEXT_SOURCE = 'atlas-context';
const CONTEXT_LAYER = 'atlas-context-outline';
const PLACE_SOURCE = 'atlas-place';
const PLACE_LAYER = 'atlas-place-outline';

export async function createMap(container, options) {
  const module = await import(MAPLIBRE_URL);
  const maplibregl = module.default ?? module;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE,
    bounds: NJ_BOUNDS,
    fitBoundsOptions: { padding: 20 },
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  await new Promise((resolve) => map.once('load', resolve));
  return new AtlasMap(maplibregl, map, options);
}

class AtlasMap {
  constructor(maplibregl, map, { buildPopup, onZoomHint }) {
    this.maplibregl = maplibregl;
    this.map = map;
    this.buildPopup = buildPopup;
    this.onZoomHint = onZoomHint;
    this.entry = null;
    this.popup = null;
    this.contextKey = null;
    this.placeKey = null;
    map.on('zoom', () => this.updateZoomHint());
    map.on('click', (event) => this.handleClick(event));
    map.on('mousemove', (event) => {
      const hit = this.presentLayers().length && this.map.queryRenderedFeatures(event.point, { layers: this.presentLayers() }).length;
      this.map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
  }

  presentLayers() {
    return DATA_LAYERS.filter((id) => this.map.getLayer(id));
  }

  firstLabelLayer() {
    return this.map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
  }

  // The first of these that exists, so new layers slot in below it and the drawing order holds.
  below(...ids) {
    return ids.find((id) => this.map.getLayer(id)) ?? this.firstLabelLayer();
  }

  clearLayer() {
    this.popup?.remove();
    for (const id of [...DATA_LAYERS, SELECTED_LAYER]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource(DATA_SOURCE)) this.map.removeSource(DATA_SOURCE);
    this.entry = null;
  }

  showLayer(entry, tilesUrl, { fit = true } = {}) {
    this.clearLayer();
    this.entry = entry;
    this.map.addSource(DATA_SOURCE, { type: 'vector', url: `pmtiles://${tilesUrl}`, attribution: entry.license.attribution });
    const before = this.below(CONTEXT_LAYER, PLACE_LAYER);
    const base = { source: DATA_SOURCE, 'source-layer': entry.id };
    const color = entry.style.color;
    if (entry.geometry === 'polygon') {
      this.map.addLayer({ ...base, id: 'atlas-fill', type: 'fill', paint: { 'fill-color': color, 'fill-opacity': 0.35 } }, before);
      this.map.addLayer({ ...base, id: 'atlas-outline', type: 'line', paint: { 'line-color': color, 'line-width': 1 } }, before);
      this.map.addLayer({ ...base, id: SELECTED_LAYER, type: 'line', filter: ['==', ['get', 'atlas_id'], ''],
        paint: { 'line-color': '#111111', 'line-width': 3 } }, before);
    } else if (entry.geometry === 'line') {
      this.map.addLayer({ ...base, id: 'atlas-line', type: 'line', paint: { 'line-color': color, 'line-width': 1.5 } }, before);
      this.map.addLayer({ ...base, id: SELECTED_LAYER, type: 'line', filter: ['==', ['get', 'atlas_id'], ''],
        paint: { 'line-color': '#111111', 'line-width': 4 } }, before);
    } else {
      this.map.addLayer({ ...base, id: 'atlas-circle', type: 'circle',
        paint: { 'circle-radius': 4, 'circle-color': color, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } });
      this.map.addLayer({ ...base, id: SELECTED_LAYER, type: 'circle', filter: ['==', ['get', 'atlas_id'], ''],
        paint: { 'circle-radius': 8, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#111111', 'circle-stroke-width': 3 } });
    }
    // Long publisher credits would cover the map; start the compact credits closed (the "i" button opens them,
    // and the About dialog always shows the full credit).
    this.map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    if (fit) this.fitBounds(entry.bounds);
    this.updateZoomHint();
  }

  fitBounds(bounds, maxZoom = 12) {
    this.map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, maxZoom, duration: 600 });
  }

  setFilter(expression) {
    for (const id of this.presentLayers()) this.map.setFilter(id, expression ?? null);
  }

  // Thin outlines of the boundary level's areas around the chosen data: { url, layer, filter } or null.
  showContext(context) {
    const key = context ? JSON.stringify(context) : null;
    if (key === this.contextKey) return;
    this.contextKey = key;
    if (this.map.getLayer(CONTEXT_LAYER)) this.map.removeLayer(CONTEXT_LAYER);
    if (this.map.getSource(CONTEXT_SOURCE)) this.map.removeSource(CONTEXT_SOURCE);
    if (!context) return;
    this.map.addSource(CONTEXT_SOURCE, { type: 'vector', url: `pmtiles://${context.url}` });
    this.map.addLayer({ id: CONTEXT_LAYER, type: 'line', source: CONTEXT_SOURCE, 'source-layer': context.layer,
      ...(context.filter ? { filter: context.filter } : {}),
      paint: { 'line-color': '#4f5d6e', 'line-width': 0.8, 'line-opacity': 0.8 } }, this.below(PLACE_LAYER));
  }

  // Outline the chosen area using its boundary level's tiles: { url, layer, key, code } or null.
  showPlace(placeTiles) {
    const key = placeTiles ? JSON.stringify(placeTiles) : null;
    if (key === this.placeKey) return;
    this.placeKey = key;
    if (this.map.getLayer(PLACE_LAYER)) this.map.removeLayer(PLACE_LAYER);
    if (this.map.getSource(PLACE_SOURCE)) this.map.removeSource(PLACE_SOURCE);
    if (!placeTiles) return;
    this.map.addSource(PLACE_SOURCE, { type: 'vector', url: `pmtiles://${placeTiles.url}` });
    this.map.addLayer({ id: PLACE_LAYER, type: 'line', source: PLACE_SOURCE, 'source-layer': placeTiles.layer,
      filter: ['==', ['get', placeTiles.key], placeTiles.code],
      paint: { 'line-color': '#17212c', 'line-width': 2.5 } }, this.firstLabelLayer());
  }

  selectItem(atlasId) {
    if (this.map.getLayer(SELECTED_LAYER)) this.map.setFilter(SELECTED_LAYER, ['==', ['get', 'atlas_id'], atlasId ?? '']);
  }

  flyToItem(row, geometry) {
    const zoom = geometry === 'point' ? 14 : Math.max(this.map.getZoom(), 12);
    this.map.flyTo({ center: [row.lon, row.lat], zoom, duration: 800 });
    this.selectItem(row.atlas_id);
  }

  updateZoomHint() {
    const below = Boolean(this.entry) && this.map.getZoom() < this.entry.tiles.min_zoom;
    this.onZoomHint?.(below, this.entry);
  }

  handleClick(event) {
    const layers = this.presentLayers();
    if (!layers.length) return;
    const [hit] = this.map.queryRenderedFeatures(event.point, { layers });
    this.popup?.remove();
    if (!hit) return;
    this.selectItem(hit.properties.atlas_id);
    this.popup = new this.maplibregl.Popup({ maxWidth: '320px' })
      .setLngLat(event.lngLat)
      .setDOMContent(this.buildPopup(hit.properties))
      .addTo(this.map);
  }
}
