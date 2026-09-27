import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDoc, layerDoc, nextBufferId, nextScreeningId, SCHEMA_VERSION, validate } from '../../site/js/studio/mapdoc.js';
import { decodeHash, embedSnippet, encodeDoc, isLong, linkFor } from '../../site/js/studio/share.js';
import { TEXT } from '../../site/js/studio/text.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../fixtures/mapdocs/${name}.json`, import.meta.url), 'utf8'));
const v1 = () => read('v1-screening');
const fixture = () => read('v2-buffers');
const known = new Set(['nj_schools', 'nj_parcels', 'nj_wetlands', 'nj_flood_zones', 'nj_c1_waters']);

test('the v2 fixture is valid and unchanged by validation', () => {
  const { doc, problems, notices } = validate(fixture(), known);
  assert.deepEqual(problems, []);
  assert.deepEqual(notices, []);
  assert.deepEqual(doc, fixture());
});

test('a v1 document opens as v2: its buffers were site screenings (D-076)', () => {
  const { doc, problems } = validate(v1(), new Set(['nj_parcels', 'nj_wetlands', 'nj_flood_zones', 'nj_c1_waters']));
  assert.deepEqual(problems, []);
  assert.equal(doc.schema_version, SCHEMA_VERSION);
  assert.deepEqual(doc.screenings, v1().buffers);
  assert.deepEqual(doc.buffers, []);
});

test('round trip through the compressed link', async () => {
  const hash = await encodeDoc(fixture(), { compress: true });
  assert.match(hash, /^m=/);
  assert.deepEqual(await decodeHash(`#${hash}`), fixture());
});

test('round trip through the plain link', async () => {
  const hash = await encodeDoc(fixture(), { compress: false });
  assert.match(hash, /^m0=/);
  assert.deepEqual(await decodeHash(hash), fixture());
});

test('the compressed link is shorter', async () => {
  const [small, plain] = await Promise.all([encodeDoc(fixture(), { compress: true }), encodeDoc(fixture(), { compress: false })]);
  assert.ok(small.length < plain.length);
});

test('long links are flagged above 2,000 characters', () => {
  assert.equal(isLong('x'.repeat(2000)), false);
  assert.equal(isLong('x'.repeat(2001)), true);
  assert.equal(linkFor('https://a.test/?q=1#old', 'm=abc'), 'https://a.test/?q=1#m=abc');
});

test('a hash without a map document decodes to null', async () => {
  assert.equal(await decodeHash('#b=county&layer=nj_trails'), null);
});

test('the embed snippet opens the embed view and escapes the title', () => {
  const snippet = embedSnippet('https://a.test/studio/#m=old', 'm=abc', 'Flood "risk" <map>');
  assert.match(snippet, /src="https:\/\/a\.test\/studio\/\?embed=1#m=abc"/);
  assert.match(snippet, /title="Flood &quot;risk&quot; &lt;map>"/);
});

const ring = (value) => ({ value, style: fixture().buffers[0].distances[0].style });
const withBuffer = (patch) => ({ ...fixture(), buffers: [{ ...fixture().buffers[0], ...patch }] });
const invalid = [
  ['a newer version', { ...fixture(), schema_version: SCHEMA_VERSION + 1 }, 'newerVersion'],
  ['nine layers', { ...fixture(), layers: Array.from({ length: 9 }, (_, i) => ({ id: `nj_x${i}` })) }, 'tooManyLayers'],
  ['a screening distance above one mile', { ...fixture(), screenings: [{ ...fixture().screenings[0], distance_ft: 6000 }] }, 'badDistance'],
  ['a bad municipal code', { ...fixture(), area: { level: 'municipality', mun_code: '17' } }, 'badArea'],
  ['not a document', ['x'], 'notDocument'],
  ['a screening without a shape', { ...fixture(), screenings: [{ id: 's1', distance_ft: 300, source: { kind: 'drawn' } }] }, 'badScreeningSource'],
  ['a buffer over 5 miles', withBuffer({ distances: [ring(500), ring(26401)] }), 'badBufferDistance'],
  ['a buffer over 8,000 m', withBuffer({ unit: 'm', distances: [ring(8001)] }), 'badBufferDistance'],
  ['a buffer of zero', withBuffer({ distances: [ring(0)] }), 'badBufferDistance'],
  ['a buffer in yards', withBuffer({ unit: 'yd' }), 'badBuffer'],
  ['a buffer with seven distances', withBuffer({ distances: [1, 2, 3, 4, 5, 6, 7].map((n) => ring(n * 100)) }), 'badBuffer'],
  ['a buffer without distances', withBuffer({ distances: [] }), 'badBuffer'],
  ['five buffers', { ...fixture(), buffers: Array.from({ length: 5 }, (_, i) => ({ ...fixture().buffers[0], id: `b${i + 1}` })) }, 'tooManyBuffers'],
];

for (const [label, input, code] of invalid) {
  test(`invalid: ${label} (plain-language message)`, () => {
    const { doc, problems } = validate(input, null);
    assert.equal(doc, null);
    assert.equal(problems[0].code, code);
    const message = TEXT.problems[code](problems[0].detail);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 10);
  });
}

test('unknown layers are dropped with a notice; screenings stop listing them and their buffers go', () => {
  const { doc, notices } = validate(fixture(), new Set(['nj_parcels', 'nj_flood_zones', 'nj_c1_waters']));
  assert.deepEqual(doc.layers.map((layer) => layer.id), ['nj_parcels', 'nj_flood_zones', 'nj_c1_waters']);
  assert.deepEqual(notices.map((n) => n.code), ['unknownLayer', 'unknownLayer', 'targetNotOnMap', 'bufferLayerMissing']);
  assert.deepEqual(doc.screenings[0].targets, ['nj_flood_zones', 'nj_c1_waters']);
  assert.deepEqual(doc.buffers.map((buffer) => buffer.id), ['b2']);
  for (const notice of notices) assert.equal(typeof TEXT.notices[notice.code](notice.detail), 'string');
});

test('a boundary layer is not buffered, even from a file (D-074)', () => {
  const input = fixture();
  input.layers.push({ id: 'nj_municipalities', visible: true, opacity: 1, filters: [], style: { preset: 'outline', overrides: {} } });
  input.buffers = [{ ...input.buffers[0], layer: 'nj_municipalities' }];
  const bufferable = new Set(['nj_schools', 'nj_c1_waters']);
  const { doc, notices } = validate(input, new Set([...known, 'nj_municipalities']), bufferable);
  assert.deepEqual(doc.buffers, []);
  assert.deepEqual(notices.map((n) => n.code), ['notBufferable']);
});

test('buffer styles are cleaned: bad colors and styles fall back, numbers are kept in range', () => {
  const input = withBuffer({ distances: [{ value: 250, style: { fill: 'red', fill_opacity: 3, outline: '#112233', outline_width: -2, outline_style: 'wavy' } }] });
  const { doc } = validate(input, known);
  assert.deepEqual(doc.buffers[0].distances[0].style, { fill: '#08519C', fill_opacity: 1, outline: '#112233', outline_width: 0, outline_style: 'solid' });
  const picked = validate(withBuffer({ select: 'nearest', picked: ['1', 2, '3'] }), known).doc.buffers[0];
  assert.equal(picked.select, 'all');
  assert.deepEqual(picked.picked, ['1', '3']);
});

test('unknown keys are kept under extensions', () => {
  const { doc } = validate({ ...fixture(), branding: { logo: 'x' } }, known);
  assert.deepEqual(doc.extensions, { branding: { logo: 'x' } });
});

test('a new document and layer start from the defaults', () => {
  const doc = createDoc(new Date('2026-10-01T12:00:00.123Z'));
  assert.equal(doc.created_at, '2026-10-01T12:00:00Z');
  assert.equal(validate(doc).problems.length, 0);
  assert.deepEqual(layerDoc('nj_x', { default_style: 'fill' }).style, { preset: 'fill', overrides: {} });
  assert.equal(nextBufferId({ buffers: [{ id: 'b1' }, { id: 'b3' }] }), 'b2');
  assert.equal(nextScreeningId({ screenings: [{ id: 's1' }] }), 's2');
  assert.deepEqual([doc.screenings, doc.buffers], [[], []]);
});
