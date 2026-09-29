import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { categoryColors, equalBreaks, layerSpecs, legendFor, presetStyle, quantileBreaks, resolve, sequential }
  from '../../site/js/studio/style.js';
import { createRegistry, displayFields, isSource, isTarget, outFields } from '../../site/js/studio/registry.js';

const recipe = (id) => JSON.parse(readFileSync(new URL(`../../catalog/layers/${id}.json`, import.meta.url), 'utf8'));
const allRecipes = readdirSync(new URL('../../catalog/layers/', import.meta.url)).map((name) => recipe(name.replace('.json', '')));

test('single style: constant paint and one legend row', () => {
  const entry = recipe('nj_wetlands');
  const { style } = presetStyle(entry, { preset: 'fill' });
  const specs = layerSpecs(entry, style, { id: 'w', source: 's' });
  assert.deepEqual(specs.map((s) => s.type), ['fill', 'line']);
  assert.equal(specs[0].paint['fill-color'], '#5FAE9C');
  assert.deepEqual(legendFor(entry, style).map((row) => row.label), ['Wetlands, 2012']);
});

test('outline-only polygons draw a line in the style color', () => {
  const entry = recipe('nj_parcels');
  const { style } = presetStyle(entry, {});
  const specs = layerSpecs(entry, style, { id: 'p', source: 's' });
  assert.deepEqual(specs.map((s) => s.type), ['fill', 'line']);
  assert.equal(specs[0].paint['fill-opacity'], 0); // invisible, but clickable
  assert.equal(specs[1].paint['line-color'], '#8A5A44');
});

test('categories from a named palette: land use by Anderson Level I, with 6 classes', () => {
  const entry = recipe('nj_land_use');
  const { style } = presetStyle(entry, { preset: 'by_type' });
  const values = ['Urban', 'Forest', 'Wetlands', 'Water', 'Agriculture', 'Barren land'].map((value, i) => ({ value, count: 100 - i }));
  const resolved = { ...style, ...resolve(style, { values }) };
  assert.deepEqual(resolved.colors, { Urban: '#E8483F', Forest: '#3E8A4F', Wetlands: '#7CC4B2', Water: '#4A8FD1',
    Agriculture: '#F2D65C', 'Barren land': '#B7A99A' });
  const legend = legendFor(entry, resolved, { text: { other: 'Other' }, values: values.map((v) => v.value) });
  assert.equal(legend.length, 6); // every value has a color, so no "Other" row
  const fill = layerSpecs(entry, resolved, { id: 'lu', source: 's' })[0];
  assert.equal(fill.paint['fill-color'][0], 'match');
});

test('roads: one legend entry per class plus Ramps, widths by class', () => {
  const entry = recipe('nj_roads');
  const { style } = presetStyle(entry, { preset: 'by_class' });
  const legend = legendFor(entry, style, { values: Object.keys(style.colors) });
  assert.deepEqual(legend.map((row) => row.label), ['Interstate', 'Toll highway', 'US highway', 'State highway', 'County 500 route',
    'Other county route', 'Local road', 'Other road', 'Alley', 'Ramp']);
  const line = layerSpecs(entry, style, { id: 'r', source: 's' })[0];
  assert.equal(line.paint['line-width'][0], 'match');
});

test('flood palette maps zone codes', () => {
  assert.deepEqual(categoryColors('flood', [{ value: 'AE', count: 5 }, { value: 'X', count: 9 }, { value: 'VE', count: 1 }, { value: 'OPEN WATER', count: 2 }]),
    { X: '#CFE2F3', AE: '#6FA8DC', VE: '#3D6FB6' });
});

test('okabe_ito colors the most common values first, up to its 8 colors', () => {
  const values = Array.from({ length: 10 }, (_, i) => ({ value: `v${i}`, count: i }));
  const colors = categoryColors('okabe_ito', values);
  assert.equal(Object.keys(colors).length, 8);
  assert.equal(colors.v9, '#E69F00');
});

test('graduated: quantile and equal breaks, stored so a shared map is identical', () => {
  assert.deepEqual(quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5), [3, 5, 7, 9]);
  assert.deepEqual(equalBreaks(0, 100, 4), [25, 50, 75]);
  const entry = recipe('nj_parcels');
  const style = { label: 'By value', kind: 'graduated', field: 'assessed_value', classes: 4, method: 'equal', palette: 'blues' };
  const stored = resolve(style, { min: 0, max: 400000 });
  assert.deepEqual(stored.breaks, [100000, 200000, 300000]);
  assert.equal(stored.colors.length, 4);
  const legend = legendFor(entry, { ...style, ...stored });
  assert.deepEqual(legend.map((row) => row.label), ['Under 100,000', '100,000 – 200,000', '200,000 – 300,000', '300,000 or more']);
  assert.deepEqual(sequential('blues', 3), ['#EFF3FF', '#6BAED6', '#084594']);
});

test('overrides keep only the keys the preset kind allows', () => {
  const entry = recipe('nj_wetlands');
  const { style } = presetStyle(entry, { preset: 'fill', overrides: { color: '#000000', breaks: [1] } });
  assert.equal(style.color, '#000000');
  assert.equal(style.breaks, undefined);
  assert.equal(presetStyle(entry, { preset: 'gone' }).key, 'fill'); // falls back to the default
});

test('labels add a symbol layer', () => {
  const entry = recipe('nj_tax_blocks');
  const { style } = presetStyle(entry, {});
  assert.equal(layerSpecs(entry, style, { id: 't', source: 's' }).at(-1).type, 'symbol');
});

test('every preset of every recipe produces map layers and a legend', () => {
  for (const entry of allRecipes) {
    for (const key of Object.keys(entry.styles)) {
      const { style } = presetStyle(entry, { preset: key });
      const values = [{ value: 'A', count: 2 }, { value: 'AE', count: 1 }];
      const resolved = { ...style, ...resolve(style, { values, numbers: [1, 2, 3, 4], min: 1, max: 4 }) };
      assert.ok(layerSpecs(entry, resolved, { id: 'x', source: 's' }).length >= 1, `${entry.id}/${key}`);
      assert.ok(legendFor(entry, resolved).length >= 1, `${entry.id}/${key}`);
    }
  }
});

test('registry: roles, display fields and requested fields never include leave-out fields', () => {
  const parcels = recipe('nj_parcels');
  assert.equal(isTarget(parcels) && isSource(parcels), true);
  const fields = outFields(parcels, displayFields(parcels));
  assert.ok(fields.includes('OBJECTID') && fields.includes('PROP_CLASS'));
  for (const personal of parcels.leave_out) assert.ok(!fields.includes(personal));
  const registry = createRegistry({ categories: ['property'], layers: [parcels] });
  assert.deepEqual(registry.credits(['nj_parcels', 'nj_parcels']), [parcels.license.attribution]);
});

test('a choropleth legend ends with the blank row, labelled in the recipe unit (D-086)', () => {
  const tracts = JSON.parse(readFileSync(new URL('../../catalog/layers/nj_acs_tracts.json', import.meta.url), 'utf8'));
  const rows = legendFor(tracts, tracts.styles.poverty, { text: { other: 'Other', blank: 'No data' } });
  assert.deepEqual(rows.map((row) => row.label), ['Under 5 %', '5 – 10 %', '10 – 20 %', '20 – 30 %', '30 % or more', 'No data']);
  assert.equal(rows.at(-1).swatch.color, '#BDBDBD');
  assert.equal(legendFor(tracts, tracts.styles.poverty).length, 5);
});
