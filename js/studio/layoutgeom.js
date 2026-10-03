// Page templates (D-089): where the map and the charts sit inside the map area of the print and PNG. Pure.
// The map area is the frame the map has always had (frameSize); 'map' keeps it whole, the others share it with
// fixed chart boxes, so a page never grows past its paper. A chart scales down to fit its box.

export const TEMPLATES = { map: 0, side: 3, bottom: 3, grid: 4 };
const GAP = 10;

// { map: { w, h }, cells: [{ x, y, w, h }] } inside an area of `frame` ({ width, height }), for `count` charts.
export function composeArea(template, orientation, frame, count) {
  const n = Math.min(count, TEMPLATES[template] ?? 0);
  const whole = { map: { w: frame.width, h: frame.height }, cells: [] };
  if (!n) return whole;
  if (template === 'side') {
    const cw = Math.min(260, Math.round(frame.width * 0.38));
    const ch = Math.floor((frame.height - GAP * (n - 1)) / n);
    const x = frame.width - cw;
    return { map: { w: x - GAP, h: frame.height }, cells: Array.from({ length: n }, (_, i) => ({ x, y: i * (ch + GAP), w: cw, h: ch })) };
  }
  if (template === 'bottom') {
    const rh = Math.min(230, Math.round(frame.height * 0.4));
    const cw = Math.floor((frame.width - GAP * (n - 1)) / n);
    const y = frame.height - rh;
    return { map: { w: frame.width, h: y - GAP }, cells: Array.from({ length: n }, (_, i) => ({ x: i * (cw + GAP), y, w: cw, h: rh })) };
  }
  // grid: two columns, one or two rows, beside the map (landscape) or below it (portrait)
  const rows = n > 2 ? 2 : 1;
  const cols = n > 1 ? 2 : 1;
  const beside = orientation !== 'portrait';
  const map = beside ? { w: Math.floor(frame.width * 0.5), h: frame.height } : { w: frame.width, h: Math.floor(frame.height * 0.5) };
  const ox = beside ? map.w + GAP : 0;
  const oy = beside ? 0 : map.h + GAP;
  const aw = frame.width - ox;
  const ah = frame.height - oy;
  const cw = Math.floor((aw - GAP * (cols - 1)) / cols);
  const ch = Math.floor((ah - GAP * (rows - 1)) / rows);
  const cells = Array.from({ length: n }, (_, i) => ({ x: ox + (i % cols) * (cw + GAP), y: oy + Math.floor(i / cols) * (ch + GAP), w: cw, h: ch }));
  return { map, cells };
}

// How much a chart drawn at `width` x `height` shrinks to fit its box (never grows).
export function fitScale(width, height, box) {
  return Math.min(1, box.w / width, box.h / height);
}

// The width a chart is drawn at before it is fitted: its box's, but never narrower than the Charts tool draws, so a
// narrow box shrinks the whole chart instead of crowding its labels.
export const MIN_CHART_WIDTH = 240;
export function drawWidth(box) {
  return Math.max(box.w, MIN_CHART_WIDTH);
}
