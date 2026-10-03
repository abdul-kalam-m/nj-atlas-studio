import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_CHART_WIDTH, TEMPLATES, composeArea, drawWidth, fitScale } from '../../site/js/studio/layoutgeom.js';

const frames = { 'letter landscape': { width: 729, height: 675 }, 'letter portrait': { width: 739, height: 685 },
  'tabloid landscape': { width: 1306, height: 979 }, 'tabloid portrait': { width: 979, height: 1306 } };

test('map only keeps the whole map area', () => {
  for (const frame of Object.values(frames)) {
    for (const count of [0, 3]) assert.deepEqual(composeArea('map', 'landscape', frame, count), { map: { w: frame.width, h: frame.height }, cells: [] });
  }
  assert.deepEqual(composeArea('side', 'landscape', frames['letter landscape'], 0).cells, []);
});

test('every template keeps the map and every chart box inside the map area, without overlaps', () => {
  for (const [name, frame] of Object.entries(frames)) {
    const orientation = name.split(' ')[1];
    for (const template of ['side', 'bottom', 'grid']) {
      for (let count = 1; count <= 5; count += 1) {
        const { map, cells } = composeArea(template, orientation, frame, count);
        assert.equal(cells.length, Math.min(count, TEMPLATES[template]), `${name} ${template} ${count}`);
        const boxes = [{ x: 0, y: 0, w: map.w, h: map.h }, ...cells];
        for (const box of boxes) {
          assert.ok(box.w > 100 && box.h > 100, `${name} ${template} ${count}: ${JSON.stringify(box)}`);
          assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= frame.width && box.y + box.h <= frame.height, `${name} ${template} ${count}: ${JSON.stringify(box)}`);
        }
        for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
          const [a, b] = [boxes[i], boxes[j]];
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          assert.ok(!overlap, `${name} ${template} ${count}: ${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`);
        }
      }
    }
  }
});

test('charts shrink to fit their box and never grow', () => {
  assert.equal(fitScale(300, 200, { w: 300, h: 400 }), 1);
  assert.equal(fitScale(300, 400, { w: 300, h: 200 }), 0.5);
  assert.equal(fitScale(600, 100, { w: 300, h: 200 }), 0.5);
});

test('a chart in a narrow box is drawn at the minimum width and shrunk whole', () => {
  assert.equal(drawWidth({ w: 260, h: 200 }), 260);
  assert.equal(drawWidth({ w: 172, h: 332 }), MIN_CHART_WIDTH);
  const box = { w: 172, h: 332 };
  const scale = fitScale(drawWidth(box), 218, box);
  assert.ok(drawWidth(box) * scale <= box.w && 218 * scale <= box.h);
});
