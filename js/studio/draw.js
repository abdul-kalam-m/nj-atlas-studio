// Drawing a site: a point, a line or an area. Click to add points; double-click or Enter finishes; Backspace removes
// the last point; Escape cancels. The keyboard alternative is typing coordinates (studio.js).
const EMPTY = { type: 'FeatureCollection', features: [] };

export function shapeFrom(kind, points) {
  if (kind === 'point') return points.length ? { type: 'Point', coordinates: points[0] } : null;
  if (kind === 'line') return points.length >= 2 ? { type: 'LineString', coordinates: points } : null;
  return points.length >= 3 ? { type: 'Polygon', coordinates: [[...points, points[0]]] } : null;
}

export class DrawTool {
  constructor(studioMap, { onDone, onCancel }) {
    this.studioMap = studioMap;
    this.map = studioMap.map;
    this.onDone = onDone;
    this.onCancel = onCancel;
    this.kind = null;
    this.points = [];
    this.hover = null;
    this.handlers = {
      click: (event) => this.add([event.lngLat.lng, event.lngLat.lat]),
      dblclick: (event) => { event.preventDefault(); this.finish(); },
      mousemove: (event) => { this.hover = [event.lngLat.lng, event.lngLat.lat]; this.render(); },
      keydown: (event) => this.key(event),
    };
  }

  active() {
    return this.kind !== null;
  }

  start(kind) {
    this.stop();
    this.kind = kind;
    this.points = [];
    this.map.doubleClickZoom.disable();
    this.map.getCanvas().style.cursor = 'crosshair';
    this.map.on('click', this.handlers.click);
    this.map.on('dblclick', this.handlers.dblclick);
    this.map.on('mousemove', this.handlers.mousemove);
    window.addEventListener('keydown', this.handlers.keydown);
  }

  stop() {
    if (!this.kind) return;
    this.kind = null;
    this.map.doubleClickZoom.enable();
    this.map.getCanvas().style.cursor = '';
    this.map.off('click', this.handlers.click);
    this.map.off('dblclick', this.handlers.dblclick);
    this.map.off('mousemove', this.handlers.mousemove);
    window.removeEventListener('keydown', this.handlers.keydown);
    this.studioMap.setOverlay('draft', EMPTY);
  }

  add(point) {
    // A double-click also fires two clicks; ignore a repeat of the last point.
    const last = this.points[this.points.length - 1];
    if (last && Math.abs(last[0] - point[0]) < 1e-9 && Math.abs(last[1] - point[1]) < 1e-9) return;
    this.points.push(point.map((v) => Number(v.toFixed(6))));
    if (this.kind === 'point') this.finish();
    else this.render();
  }

  key(event) {
    if (event.key === 'Escape') {
      this.stop();
      this.onCancel?.();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.finish();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      this.points.pop();
      this.render();
    }
  }

  render() {
    const points = this.hover && this.kind !== 'point' ? [...this.points, this.hover] : this.points;
    const features = points.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates } }));
    const shape = shapeFrom(this.kind, points);
    if (shape && shape.type !== 'Point') features.unshift({ type: 'Feature', properties: {}, geometry: shape });
    this.studioMap.setOverlay('draft', { type: 'FeatureCollection', features });
  }

  finish() {
    const kind = this.kind;
    const shape = shapeFrom(kind, this.points);
    if (!shape) return;
    this.stop();
    this.onDone(shape, kind);
  }
}
