import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDoc, layerDoc, nextBufferId, SCHEMA_VERSION, validate } from '../../site/js/studio/mapdoc.js';
import { decodeHash, embedSnippet, encodeDoc, isLong, linkFor } from '../../site/js/studio/share.js';
import { TEXT } from '../../site/js/studio/text.js';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/mapdocs/v1-screening.json', import.meta.url), 'utf8'));
const known = new Set(['nj_parcels', 'nj_wetlands', 'nj_flood_zones', 'nj_c1_waters']);

test('the v1 fixture is valid and unchanged by validation', () => {
  const { doc, problems, notices } = validate(fixture(), known);
  assert.deepEqual(problems, []);
  assert.deepEqual(notices, []);
  assert.deepEqual(doc, fixture());
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

const invalid = [
  ['a newer version', { ...fixture(), schema_version: SCHEMA_VERSION + 1 }, 'newerVersion'],
  ['nine layers', { ...fixture(), layers: Array.from({ length: 9 }, (_, i) => ({ id: `nj_x${i}` })) }, 'tooManyLayers'],
  ['a distance above one mile', { ...fixture(), buffers: [{ ...fixture().buffers[0], distance_ft: 6000 }] }, 'badDistance'],
  ['a bad municipal code', { ...fixture(), area: { level: 'municipality', mun_code: '17' } }, 'badArea'],
  ['not a document', ['x'], 'notDocument'],
  ['a buffer without a shape', { ...fixture(), buffers: [{ id: 'b1', distance_ft: 300, source: { kind: 'drawn' } }] }, 'badBufferSource'],
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

test('unknown layers are dropped with a notice, and buffers stop targeting them', () => {
  const input = fixture();
  const { doc, notices } = validate(input, new Set(['nj_parcels', 'nj_flood_zones']));
  assert.deepEqual(doc.layers.map((layer) => layer.id), ['nj_parcels', 'nj_flood_zones']);
  assert.deepEqual(notices.map((n) => n.code), ['unknownLayer', 'unknownLayer', 'targetNotOnMap']);
  assert.deepEqual(doc.buffers[0].targets, ['nj_flood_zones']);
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
});
