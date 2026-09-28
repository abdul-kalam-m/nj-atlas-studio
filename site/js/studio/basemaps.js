// Basemaps (D-071, D-079) and how strongly they show (D-080). Pure: no imports.
// Light, Streets and Dark are OpenFreeMap styles; Satellite is New Jersey's 2020 aerial photography (NJOGIS)
// over USGS imagery outside the state. On, Dim or Off: Dim puts a veil in the basemap's own background color
// between the basemap and Studio's layers, and fades the basemap's labels; Off hides the basemap entirely.

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const NJ_BOUNDS = [-75.6, 38.9, -73.9, 41.4];

export const BASEMAP_STYLES = {
  positron: 'https://tiles.openfreemap.org/styles/positron',
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  satellite: {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      usgs_imagery: {
        type: 'raster', tileSize: 256, maxzoom: 16,
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'USGS The National Map: Orthoimagery',
      },
      nj_orthos: {
        type: 'raster', tileSize: 256, minzoom: 7, maxzoom: 20, bounds: NJ_BOUNDS,
        tiles: ['https://maps.nj.gov/arcgis/rest/services/Basemap/Orthos_Natural_2020_NJ_WM/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'NJ Office of GIS: 2020 aerial photography',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1d2520' } },
      { id: 'usgs-imagery', type: 'raster', source: 'usgs_imagery' },
      { id: 'nj-orthos', type: 'raster', source: 'nj_orthos', minzoom: 7 },
    ],
  },
};
export const BASEMAP_NAMES = Object.keys(BASEMAP_STYLES);
export const BASEMAP_MODES = ['on', 'dim', 'off'];
// Outside the area (D-082): shown, dimmed, or hidden (the map cut at the area's edge).
export const OUTSIDE_MODES = ['show', 'dim', 'hide'];

// What Studio draws around the basemap: the veil (Dim, and the plain page when Off), the dimmed world outside
// the area, and the area's outline, each readable on that basemap.
export const THEMES = {
  positron: { veil: '#ffffff', mask: '#ffffff', maskOpacity: 0.6, outline: '#17212c' },
  liberty: { veil: '#ffffff', mask: '#ffffff', maskOpacity: 0.6, outline: '#17212c' },
  dark: { veil: '#0c0c0c', mask: '#000000', maskOpacity: 0.55, outline: '#e8edf2' },
  satellite: { veil: '#ffffff', mask: '#000000', maskOpacity: 0.45, outline: '#ffffff' },
};
export const DIM_OPACITY = 0.6;
export const DIM_LABEL_OPACITY = 0.45;

// The credit a print or PNG carries for the basemap on show (none when it is off). Keys into TEXT.basemaps.credits.
export function basemapCredit(name, mode) {
  if (mode === 'off') return null;
  return name === 'satellite' ? 'satellite' : 'openfreemap';
}

// The changes that put a style's own layers in a mode: [{ id, visibility, paint? }]. `layers` are the basemap's
// layers (Studio's are left out by the caller). `saved` keeps each layer's own visibility and label opacity from
// the first time it is seen, so On restores them; start a new one for each new style.
export function modeOperations(layers, mode, saved) {
  return layers.map((layer) => {
    if (!saved.has(layer.id)) {
      saved.set(layer.id, { visibility: layer.layout?.visibility ?? 'visible',
        text: layer.paint?.['text-opacity'], icon: layer.paint?.['icon-opacity'] });
    }
    const own = saved.get(layer.id);
    const operation = { id: layer.id, visibility: mode === 'off' ? 'none' : own.visibility };
    if (layer.type === 'symbol') {
      operation.paint = mode === 'dim'
        ? { 'text-opacity': DIM_LABEL_OPACITY, 'icon-opacity': DIM_LABEL_OPACITY }
        : { 'text-opacity': own.text ?? 1, 'icon-opacity': own.icon ?? 1 };
    }
    return operation;
  });
}

// The mask over everything outside the area: { visible, color, opacity }. Hide covers it in the page's color, so
// the map ends at the area's edge. With the basemap off, Dim hides too: there is no basemap left to dim, and faded
// pieces of shapes that cross the edge would read as mistakes.
export function maskPaint(name, basemapMode, outside) {
  const theme = THEMES[name] ?? THEMES.positron;
  if (outside === 'show') return { visible: false, color: theme.mask, opacity: 0 };
  if (outside === 'hide' || basemapMode === 'off') return { visible: true, color: theme.veil, opacity: 1 };
  return { visible: true, color: theme.mask, opacity: theme.maskOpacity };
}

// The veil's paint in a mode: hidden when On, a see-through veil when Dim, the plain page when Off.
export function veilPaint(name, mode) {
  const theme = THEMES[name] ?? THEMES.positron;
  return { visibility: mode === 'on' ? 'none' : 'visible', color: theme.veil, opacity: mode === 'off' ? 1 : DIM_OPACITY };
}
