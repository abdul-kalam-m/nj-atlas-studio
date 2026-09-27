// Drawing a live layer (IMPLEMENTATION_GUIDE.md §4.6). Two modes:
// - whole: 2,000 or fewer matches in the area are fetched at once, generalized to about a pixel, and fetched again
//   with more detail after zooming in 3 levels;
// - tiled: above that, features load per web-mercator tile from the layer's min_zoom (zoom 14 for points, 15 for
//   lines and areas at most), a tile that hits the service's page limit splits into four, and at most 50,000
//   features stay cached.
// Rows are converted to output names (transform.js) before they reach the map, so styles and popups match copies.
import { bboxOf, pixelDegrees, tileBounds, tilesInBounds } from './geo.js';
import { toRow } from './transform.js';

export const WHOLE_LIMIT = 2000;
const CACHE_LIMIT = 50000;
const MAX_SPLIT_ZOOM = 17;
const EMPTY = { type: 'FeatureCollection', features: [] };

export class LiveLayer {
  // outFields: source field names; onData(featureCollection); onStatus({ state: 'loading'|'ready'|'zoom'|'error', error })
  constructor({ client, entry, outFields, onData, onStatus }) {
    Object.assign(this, { client, entry, outFields, onData, onStatus });
    this.query = null; // { where, geometry, total }
    this.cache = new Map(); // tile key -> features
    this.wholeZoom = null;
    this.generation = 0;
    this.lastData = EMPTY;
  }

  // The area and filters changed: { where, geometry (area outline or null), total (matches in the area) }.
  setQuery(query) {
    const changed = !this.query || this.query.where !== query.where || this.query.geometry !== query.geometry;
    this.query = query;
    if (changed) {
      this.cache.clear();
      this.wholeZoom = null;
    }
  }

  gridZoom(zoom) {
    const cap = this.entry.geometry === 'point' ? 14 : 15;
    return Math.max(Math.min(Math.floor(zoom), cap), Math.min(this.entry.min_zoom ?? 0, cap));
  }

  convert(features) {
    return features.map((feature) => ({ type: 'Feature', geometry: feature.geometry, id: undefined,
      properties: toRow(feature.properties ?? {}, this.entry) }));
  }

  publish(features) {
    const seen = new Set();
    const unique = [];
    for (const feature of features) {
      const id = feature.properties.atlas_id;
      if (id !== null && seen.has(id)) continue;
      seen.add(id);
      unique.push(feature);
    }
    this.lastData = { type: 'FeatureCollection', features: unique };
    this.onData(this.lastData);
  }

  // Called after every map move and every query change.
  async update(bounds, zoom) {
    if (!this.query) return;
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const whole = this.query.total !== null && this.query.total <= WHOLE_LIMIT;
    try {
      if (whole) {
        const detail = Math.max(Math.floor(zoom), this.entry.min_zoom ?? 0, 8);
        if (this.wholeZoom !== null && detail <= this.wholeZoom + 2 && this.cache.has('whole')) {
          this.onStatus({ state: 'ready' });
          return;
        }
        this.onStatus({ state: 'loading' });
        const page = await this.client.allFeatures(this.entry.source.url, {
          where: this.query.where, geometry: this.query.geometry, outFields: this.outFields,
          maxAllowableOffset: this.entry.geometry === 'point' ? undefined : pixelDegrees(Math.min(detail + 1, 18)), precision: 6,
        }, WHOLE_LIMIT + 1);
        if (!current()) return;
        this.cache.set('whole', this.convert(page.features));
        this.wholeZoom = detail;
        this.publish(this.cache.get('whole'));
        this.onStatus({ state: 'ready' });
        return;
      }
      if (zoom < (this.entry.min_zoom ?? 0)) {
        this.publish([]);
        this.onStatus({ state: 'zoom' });
        return;
      }
      const z = this.gridZoom(zoom);
      const view = this.query.geometry ? intersectBounds(bounds, bboxOf(this.query.geometry)) : bounds;
      if (!view) {
        this.publish([]);
        this.onStatus({ state: 'ready' });
        return;
      }
      const tiles = tilesInBounds(view, z, 96) ?? [];
      const missing = tiles.filter(([x, y]) => !this.cache.has(`${z}/${x}/${y}`));
      if (missing.length) this.onStatus({ state: 'loading' });
      const collected = tiles.filter(([x, y]) => this.cache.has(`${z}/${x}/${y}`)).flatMap(([x, y]) => this.cache.get(`${z}/${x}/${y}`));
      if (collected.length) this.publish(collected);
      await Promise.all(missing.map(async ([x, y]) => {
        const features = await this.loadTile(x, y, z);
        this.cache.set(`${z}/${x}/${y}`, features);
      }));
      if (!current()) return;
      this.trim();
      this.publish(tiles.flatMap(([x, y]) => this.cache.get(`${z}/${x}/${y}`) ?? []));
      this.onStatus({ state: 'ready' });
    } catch (error) {
      if (current()) this.onStatus({ state: 'error', error });
    }
  }

  async loadTile(x, y, z) {
    const page = await this.client.features(this.entry.source.url, {
      where: this.query.where, geometry: tileBounds(x, y, z), outFields: this.outFields,
      maxAllowableOffset: this.entry.geometry === 'point' ? undefined : pixelDegrees(z + 1), precision: 6,
    });
    if (!page.exceeded || z >= MAX_SPLIT_ZOOM) return this.convert(page.features);
    const children = await Promise.all([[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => this.loadTile(x * 2 + dx, y * 2 + dy, z + 1)));
    return children.flat();
  }

  trim() {
    let total = 0;
    const keys = [...this.cache.keys()].reverse(); // newest last in insertion order
    for (const key of keys) {
      total += this.cache.get(key).length;
      if (total > CACHE_LIMIT) this.cache.delete(key);
    }
  }
}

function intersectBounds(a, b) {
  const out = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return out[0] < out[2] && out[1] < out[3] ? out : null;
}
