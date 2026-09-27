// Nightly source check (IMPLEMENTATION_GUIDE.md §4.11). Node 22+, no dependencies.
//   node tools/healthcheck.mjs            every published live and hybrid layer; writes site/data/health.json
//   node tools/healthcheck.mjs --all      drafts too
//   node tools/healthcheck.mjs nj_parcels one layer
// For each layer: the fields the recipe uses exist; the count is inside source.expected_count; every known answer
// holds; the service answers a browser (CORS); response times and rate limits are recorded. Exit code 1 if any fail.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient, fieldTypesOf } from '../site/js/studio/live.js';

const ROOT = new URL('..', import.meta.url);
const ORIGIN = 'https://abdul-kalam-m.github.io'; // the Studio site (D-047)
const args = process.argv.slice(2);
const includeDrafts = args.includes('--all');
const only = args.filter((arg) => !arg.startsWith('--'));
const hosting = JSON.parse(readFileSync(new URL('catalog/hosting.json', ROOT), 'utf8'));

const recipes = readdirSync(new URL('catalog/layers/', ROOT)).filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(new URL(`catalog/layers/${name}`, ROOT), 'utf8')))
  .filter((recipe) => recipe.access !== 'copy')
  .filter((recipe) => (only.length ? only.includes(recipe.id) : includeDrafts || recipe.status === 'published'));

let rateLimited = 0;
const client = createClient({ maxConcurrent: 4, timeoutMs: 45000, onEvent: (event) => { if (event.kind === 'rate_limited') rateLimited += 1; } });

async function corsProblem(url) {
  const response = await fetch(`${url}/query?where=1%3D0&returnCountOnly=true&f=json`, { headers: { Origin: ORIGIN } });
  const allowed = response.headers.get('access-control-allow-origin');
  return allowed === '*' || allowed === ORIGIN ? null : `no browser access (Access-Control-Allow-Origin: ${allowed ?? 'missing'})`;
}

async function tilesProblem(recipe) {
  if (recipe.access !== 'hybrid' || !hosting.tiles_base_url) return null;
  const url = `${hosting.tiles_base_url}${recipe.id}/${recipe.id}.pmtiles`;
  const response = await fetch(url, { headers: { Origin: ORIGIN, Range: 'bytes=0-9' } });
  if (response.status !== 206) return `map tiles answered HTTP ${response.status}, not 206`;
  return response.headers.get('access-control-allow-origin') ? null : 'map tiles lack Access-Control-Allow-Origin';
}

async function check(recipe) {
  const started = Date.now();
  const problems = [];
  const url = recipe.source.url;
  const info = await client.info(url);
  const types = fieldTypesOf(info);
  const used = [recipe.source.id_field, ...recipe.fields.map((field) => field.source),
    ...Object.values(recipe.area_codes ?? {}).map((code) => code.field)];
  const missing = [...new Set(used)].filter((name) => !(name in types));
  if (missing.length) problems.push(`field(s) missing at the source: ${missing.join(', ')}`);
  const count = await client.count(url, { where: recipe.source.where });
  const { min, max } = recipe.source.expected_count;
  if (count < min || count > max) problems.push(`count ${count} is outside ${min}-${max}`);
  for (const answer of recipe.known_answers ?? []) {
    const n = await client.count(url, { where: answer.where });
    if (n < answer.expected.min || n > answer.expected.max) problems.push(`${answer.label}: ${n}, expected ${answer.expected.min}-${answer.expected.max}`);
  }
  const cors = await corsProblem(url);
  if (cors) problems.push(cors);
  const tiles = await tilesProblem(recipe);
  if (tiles) problems.push(tiles);
  return { ok: problems.length === 0, problem: problems.join('; ') || null, count, ms: Date.now() - started };
}

const layers = {};
for (const recipe of recipes) {
  try {
    layers[recipe.id] = await check(recipe);
  } catch (error) {
    layers[recipe.id] = { ok: false, problem: error.message, count: null, ms: null };
  }
  const result = layers[recipe.id];
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${recipe.id}${result.problem ? `: ${result.problem}` : ''} (${result.ms ?? '?'} ms)`);
}
const health = { checked_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), rate_limited: rateLimited, layers };
if (!only.length) {
  mkdirSync(new URL('site/data/', ROOT), { recursive: true });
  writeFileSync(new URL('site/data/health.json', ROOT), `${JSON.stringify(health, null, 2)}\n`);
}
const failed = Object.values(layers).filter((layer) => !layer.ok).length;
console.log(failed ? `HEALTH: ${failed} layer(s) failed` : `HEALTH: PASS (${Object.keys(layers).length} layers)`);
process.exit(failed ? 1 : 0);
