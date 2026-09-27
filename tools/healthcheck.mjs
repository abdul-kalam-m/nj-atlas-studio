// Nightly source check (IMPLEMENTATION_GUIDE.md §4.11). Node 22+, no dependencies.
//   node tools/healthcheck.mjs            every published live and hybrid layer; writes site/data/health.json
//   node tools/healthcheck.mjs --all      drafts too
//   node tools/healthcheck.mjs nj_parcels one layer
// For each layer: the fields the recipe uses exist; the count is inside source.expected_count; every known answer
// holds; the service answers a browser (CORS); a layer sliced by a code field counts about the same by code as by
// the area's outline (D-050, for Pennsville and Salem County); response times and rate limits are recorded.
// Exit code 1 if any fail.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient, fieldTypesOf } from '../site/js/studio/live.js';
import { areaWhere, joinWhere } from '../site/js/studio/sql.js';

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

// Test areas for the code-versus-outline comparison, with outlines read from NJOGIS itself, so the check needs
// no built data (the nightly job has none).
const BOUNDARIES = 'https://maps.nj.gov/arcgis/rest/services/Framework/Government_Boundaries/MapServer';
const TEST_AREAS = [
  { label: 'Pennsville', layer: 2, where: "MUN_CODE = '1709'", area: { level: 'municipality', county_fips: '033', mun_code: '1709' } },
  { label: 'Salem County', layer: 1, where: "FIPSSTCO = '34033'", area: { level: 'county', county_fips: '033' } },
];
const outlines = new Map();
const MAX_OUTLINE_TEST = 20000;
async function outlineOf(test) {
  if (!outlines.has(test.label)) {
    outlines.set(test.label, client.features(`${BOUNDARIES}/${test.layer}`, { where: test.where, outFields: ['OBJECTID'], maxAllowableOffset: 0.0001, precision: 6 })
      .then((page) => page.features[0]?.geometry ?? null));
  }
  return outlines.get(test.label);
}

// A code field that changed shows up two ways (D-050): the features it selects stop lying in the area (fewer than
// 95% of them touch its outline), or it selects none where the outline finds some. For points, the counts by code
// and by outline must also agree within 5% (or 2); areas and lines touching the edge from outside are expected.
function codeCountProblem(recipe, label, { byCode, byOutline, codeInOutline }) {
  if (byOutline > 0 && byCode === 0) return `${label}: 0 by code but ${byOutline} by outline`;
  if (codeInOutline < 0.95 * byCode - 1) return `${label}: only ${codeInOutline} of the ${byCode} selected by code touch the area`;
  if (recipe.geometry === 'point' && Math.abs(byCode - byOutline) > Math.max(2, 0.05 * byOutline)) {
    return `${label}: ${byCode} by code against ${byOutline} by outline`;
  }
  return null;
}

async function codeProblems(recipe) {
  if (recipe.area_mode !== 'code') return [];
  const problems = [];
  for (const test of TEST_AREAS) {
    const slice = areaWhere(recipe, { tract_geoid: null, bg_geoid: null, mun_code: null, ...test.area }, { county: 'Salem County' });
    if (!slice.where) continue;
    const geometry = await outlineOf(test);
    if (!geometry) { problems.push(`${test.label}: its outline could not be read from NJOGIS`); continue; }
    const code = joinWhere(recipe.source.where, slice.where);
    const byCode = await client.count(recipe.source.url, { where: code });
    // Outline counts of very large selections are slow for the publisher's server; the town test covers them.
    if (byCode > MAX_OUTLINE_TEST) { codeCounts[`${recipe.id}/${test.label}`] = { by_code: byCode, skipped: 'too large' }; continue; }
    const [byOutline, codeInOutline] = await Promise.all([
      client.count(recipe.source.url, { where: recipe.source.where, geometry }),
      client.count(recipe.source.url, { where: code, geometry })]);
    const problem = codeCountProblem(recipe, test.label, { byCode, byOutline, codeInOutline });
    if (problem) problems.push(problem);
    codeCounts[`${recipe.id}/${test.label}`] = { by_code: byCode, by_outline: byOutline, code_in_outline: codeInOutline };
  }
  return problems;
}
const codeCounts = {};

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
  problems.push(...await codeProblems(recipe));
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
const health = { checked_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), rate_limited: rateLimited, layers, code_counts: codeCounts };
if (!only.length) {
  mkdirSync(new URL('site/data/', ROOT), { recursive: true });
  writeFileSync(new URL('site/data/health.json', ROOT), `${JSON.stringify(health, null, 2)}\n`);
}
const failed = Object.values(layers).filter((layer) => !layer.ok).length;
console.log(failed ? `HEALTH: ${failed} layer(s) failed` : `HEALTH: PASS (${Object.keys(layers).length} layers)`);
process.exit(failed ? 1 : 0);
