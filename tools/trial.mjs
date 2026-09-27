// Studio live trial (IMPLEMENTATION_GUIDE.md S0-T4): time every §3.5 operation against the live services and
// write docs/studio/TRIAL.md. Node 22+, no dependencies. Usage: node tools/trial.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient, fieldTypesOf } from '../site/js/studio/live.js';
import { areaWhere, conditionsWhere, joinWhere } from '../site/js/studio/sql.js';
import { bboxOf, lngLatToTile, tileBounds, pixelDegrees } from '../site/js/studio/geo.js';

const ROOT = new URL('..', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('site/data/studio.json', ROOT), 'utf8'));
const layer = (id) => catalog.layers.find((entry) => entry.id === id);
const outline = (level, code) => JSON.parse(readFileSync(new URL(`site/data/outlines/${level}/${code}.json`, ROOT), 'utf8'));
const counties = JSON.parse(readFileSync(new URL('site/data/places/county.json', ROOT), 'utf8'));
const client = createClient({ maxConcurrent: 6 });
const RUNS = 3;
const rows = [];
const notes = [];

async function timed(fn) {
  const started = performance.now();
  const value = await fn();
  return { ms: performance.now() - started, value };
}

async function measure(operation, where, budgetMs, fn, detail = (v) => '') {
  const times = [];
  let value;
  let error = null;
  for (let run = 0; run < RUNS; run += 1) {
    try {
      const result = await timed(fn);
      times.push(result.ms);
      value = result.value;
    } catch (caught) {
      error = caught.message;
      break;
    }
  }
  times.sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;
  const verdict = error ? 'ERROR' : median <= budgetMs ? 'within budget' : median <= 2 * budgetMs ? 'within 2x' : 'OVER 2x';
  rows.push({ operation, where, budgetMs, median, max: times.at(-1) ?? null, verdict, detail: error ?? detail(value) });
  console.log(`${verdict.padEnd(13)} ${operation} | ${where} | ${median?.toFixed(0)} ms | ${error ?? detail(value)}`);
  return value;
}

function area(level, code) {
  const key = { county: 'county_fips', municipality: 'mun_code' }[level];
  return { level, county_fips: null, mun_code: null, tract_geoid: null, bg_geoid: null, [key]: code };
}

// The area part of a query: the layer's code field, or the area's outline for the server to test.
function areaQuery(entry, place, names = {}) {
  const slice = areaWhere(entry, place, names);
  if (slice.outline) return { where: entry.source.where, geometry: outline(place.level, place[slice.outline === 'county' ? 'county_fips' : 'mun_code']) };
  return { where: joinWhere(entry.source.where, slice.where) };
}

const TOWNS = [['Newark', '0714'], ['Jersey City', '0906'], ['Long Beach Township', '1518'], ['Pennsville', '1709']];
const parcels = layer('nj_parcels');
const schools = layer('nj_schools');

for (const [name, code] of TOWNS) {
  const place = area('municipality', code);
  const q = areaQuery(parcels, place);
  const total = await measure('Count matches (code field)', `${name}: parcels`, 1500, () => client.count(parcels.source.url, q), (n) => `${n} parcels`);
  const types = fieldTypesOf(await client.info(parcels.source.url));
  const filtered = joinWhere(q.where, conditionsWhere(parcels, [{ field: 'property_class', op: 'in', values: ['Residential (up to 4 families)'] }], types));
  await measure('Count matches with a filter', `${name}: residential parcels`, 1500, () => client.count(parcels.source.url, { where: filtered }), (n) => `${n}`);
  await measure('Checkbox counts per field', `${name}: parcels by class`, 2500, () => client.groupCounts(parcels.source.url, 'PROP_CLASS', q), (v) => `${v.length} values`);
  const fields = parcels.fields.map((f) => f.source);
  await measure('First table page, 200 rows, unsorted', `${name}: parcels`, 2000,
    () => client.features(parcels.source.url, { ...q, outFields: fields, returnGeometry: false, num: 200, offset: 0 }), (v) => `${v.features.length} rows`);
  if (total <= 5000) {
    await measure('First table page, sorted (≤ 5,000 matches)', `${name}: parcels by address`, 2000,
      () => client.features(parcels.source.url, { ...q, outFields: fields, returnGeometry: false, num: 200, offset: 0, orderBy: 'PROP_LOC' }), (v) => `${v.features.length} rows`);
  } else {
    notes.push(`${name}: ${total} parcels, so the table loads unsorted (the table rule in §3.5).`);
  }
  const outlineGeometry = outline('municipality', code);
  const [west, south, east, north] = bboxOf(outlineGeometry);
  const [tx, ty] = lngLatToTile((west + east) / 2, (south + north) / 2, 15);
  const envelope = tileBounds(tx, ty, 15);
  await measure('One map tile of live features (zoom 15)', `${name}: parcels`, 1000,
    () => client.features(parcels.source.url, { where: q.where, geometry: envelope, outFields: ['OBJECTID', 'PROP_CLASS', 'PROP_LOC'], maxAllowableOffset: pixelDegrees(15), precision: 6 }),
    (v) => `${v.features.length} parcels, ${JSON.stringify(v.features).length / 1000 | 0} KB`);
  const schoolQ = areaQuery(schools, place);
  await measure('Count matches (outline test)', `${name}: schools`, 1500, () => client.count(schools.source.url, schoolQ), (n) => `${n} schools`);
}

// Site screening known answer (§1.4): Pennsville block 301, lot 19, 300 ft.
const site = await client.features(parcels.source.url, { where: "PCL_MUN = '1709' AND PCLBLOCK = '301' AND PCLLOT = '19'", outFields: ['OBJECTID', 'PROP_LOC'], precision: 6 });
const siteGeometry = site.features[0]?.geometry;
const expected = { nj_wetlands: 2, nj_flood_zones: 3, nj_c1_waters: 0, nj_land_use: 14 };
const screeningCounts = {};
for (const id of Object.keys(expected)) {
  const entry = layer(id);
  await measure('Distance query per target layer (300 ft)', `Pennsville 301/19: ${entry.title}`, 2000,
    () => client.features(entry.source.url, { geometry: siteGeometry, distanceFt: 300, outFields: [entry.fields[0].source], returnGeometry: false }),
    (v) => { screeningCounts[id] = v.features.length; return `${v.features.length} (expected ${expected[id]})`; });
}
await measure('Screening map, site to results, 4 target layers', 'Pennsville 301/19, 300 ft', 4000,
  () => Promise.all(Object.keys(expected).map((id) => client.features(layer(id).source.url, { geometry: siteGeometry, distanceFt: 300, outFields: ['OBJECTID'], returnGeometry: true, precision: 6 }))),
  (v) => v.map((r) => r.features.length).join(' / '));
await measure('Parcels within 200 ft (distance query)', 'Pennsville 301/19', 2000,
  () => client.features(parcels.source.url, { geometry: siteGeometry, distanceFt: 200, outFields: ['OBJECTID'], returnGeometry: false }), (v) => `${v.features.length} parcels (expected 9)`);

// Distance queries from each source shape, against an NJDEP server layer and an ArcGIS Online layer.
const shapes = {
  polygon: siteGeometry,
  line: (await client.features(layer('nj_roads').source.url, { where: 'SUBTYPE = 700', geometry: [-75.515, 39.645, -75.505, 39.652], outFields: ['OBJECTID'], num: 1, precision: 6 })).features[0]?.geometry,
  point: { type: 'Point', coordinates: [-75.5097, 39.6481] },
};
for (const [shape, geometry] of Object.entries(shapes)) {
  for (const [id, host] of [['nj_wetlands', 'NJDEP server'], ['nj_schools', 'ArcGIS Online']]) {
    await measure(`Distance query from a ${shape}, 1,000 ft`, `${host}: ${layer(id).title}`, 2000,
      () => client.features(layer(id).source.url, { geometry, distanceFt: 1000, outFields: ['OBJECTID'], returnGeometry: false }),
      (v) => `${v.features.length} found${geometry ? '' : ' (no source shape)'}`);
  }
}

// A site on a county line (Salem and Gloucester) with a 1,000 ft buffer: parcels from both counties.
const salem = outline('county', '033');
const gloucester = outline('county', '015');
const pointsOf = (g) => (g.type === 'Polygon' ? g.coordinates.flat(1) : g.coordinates.flat(2));
const gloucesterPoints = pointsOf(gloucester);
const near = pointsOf(salem).find(([x, y]) => gloucesterPoints.some(([gx, gy]) => Math.abs(gx - x) < 0.0002 && Math.abs(gy - y) < 0.0002));
const countyLine = { type: 'Point', coordinates: near };
await measure('County-line buffer, 1,000 ft, parcels', `Salem and Gloucester line at ${near.map((v) => v.toFixed(4)).join(', ')}`, 2000,
  () => client.features(parcels.source.url, { geometry: countyLine, distanceFt: 1000, outFields: ['PCL_MUN'], returnGeometry: false }),
  (v) => { const prefixes = [...new Set(v.features.map((f) => String(f.properties.PCL_MUN).slice(0, 2)))].sort(); return `${v.features.length} parcels, county numbers ${prefixes.join(', ')}`; });

// Worst-case map load: 8 layers (4 live, 4 hybrid drawn live) counted and tiled at once, for Pennsville.
const eight = ['nj_parcels', 'nj_schools', 'nj_c1_waters', 'nj_contaminated_sites', 'nj_wetlands', 'nj_flood_zones', 'nj_land_use', 'nj_roads'];
const pennsville = area('municipality', '1709');
const [cx, cy] = lngLatToTile(-75.51, 39.65, 15);
await measure('8 stacked layers: count and one tile each, together', 'Pennsville, zoom 15', 4000,
  () => Promise.all(eight.map(async (id) => {
    const entry = layer(id);
    const q = areaQuery(entry, pennsville);
    const [n, tile] = await Promise.all([client.count(entry.source.url, q),
      client.features(entry.source.url, { where: q.where, geometry: tileBounds(cx, cy, 15), outFields: ['OBJECTID'], maxAllowableOffset: pixelDegrees(15), precision: 6 })]);
    return [id, n, tile.features.length];
  })), (v) => v.map(([id, n, t]) => `${id.replace('nj_', '')} ${n}/${t}`).join('; '));

// SQL syntax: contains with % and a quote, and a date range, on an NJDEP server layer and an ArcGIS Online layer.
const syntax = [];
async function trySql(label, url, where) {
  try {
    const n = await client.count(url, { where });
    syntax.push(`| ${label} | \`${where}\` | works (${n}) |`);
  } catch (error) {
    syntax.push(`| ${label} | \`${where}\` | **fails**: ${error.message.replace(/\|/g, '/')} |`);
  }
}
const sites = layer('nj_contaminated_sites');
const siteTypes = fieldTypesOf(await client.info(sites.source.url));
await trySql('NJDEP: contains with % and a quote', sites.source.url, conditionsWhere(sites, [{ field: 'site_name', op: 'contains', value: "O'NEILL 50%" }], siteTypes));
await trySql('NJDEP: contains', sites.source.url, conditionsWhere(sites, [{ field: 'site_name', op: 'contains', value: 'shell' }], siteTypes));
const c1 = layer('nj_c1_waters');
await trySql('NJDEP: date range', c1.source.url, conditionsWhere(c1, [{ field: 'effective', op: 'range', min: '2008-01-01', max: '2020-12-31' }], fieldTypesOf(await client.info(c1.source.url))));
const schoolTypes = fieldTypesOf(await client.info(schools.source.url));
await trySql('ArcGIS Online: contains with % and a quote', schools.source.url, conditionsWhere(schools, [{ field: 'school', op: 'contains', value: "St. Mary's 100%" }], schoolTypes));
await trySql('ArcGIS Online: contains', schools.source.url, conditionsWhere(schools, [{ field: 'school', op: 'contains', value: 'academy' }], schoolTypes));
await trySql('ArcGIS Online: date range', parcels.source.url, "PCL_MUN = '1709' AND " + conditionsWhere(parcels, [{ field: 'sale_date', op: 'range', min: '2020-01-01', max: null }], fieldTypesOf(await client.info(parcels.source.url))));
const fuel = layer('nj_fuel_stations');
await trySql('NJDEP: category with labels', fuel.source.url, conditionsWhere(fuel, [{ field: 'fuel', op: 'in', values: ['Electric'] }], fieldTypesOf(await client.info(fuel.source.url))));
const roads = layer('nj_roads');
await trySql('ArcGIS Online: numeric codes with labels', roads.source.url, conditionsWhere(roads, [{ field: 'road_class', op: 'in', values: ['Ramp', 'Interstate'] }], fieldTypesOf(await client.info(roads.source.url))));
await trySql('ArcGIS Online: county name', layer('nj_hospitals').source.url, areaWhere(layer('nj_hospitals'), area('county', '013'), { county: 'Essex County' }).where);

// Address search: the NJOGIS geocoder.
const search = JSON.parse(readFileSync(new URL('catalog/search.json', ROOT), 'utf8'));
await measure('Go to an address', '"45 N Broadway, Pennsville"', 1500,
  () => client.request(`${search.url}/findAddressCandidates`, { SingleLine: '45 N Broadway, Pennsville', outSR: '4326', maxLocations: String(search.max_results), outFields: 'Addr_type' }),
  (v) => `${v.candidates.length} found; best: ${v.candidates[0]?.address} (${v.candidates[0]?.score})`);

// Does NJDEP publish 2020 land use?
const landServices = await client.request('https://mapsdep.nj.gov/arcgis/rest/services/Features/Land_lu/MapServer', {});
const lu2020 = (landServices.layers ?? []).filter((l) => /2020/.test(l.name)).map((l) => `${l.id} ${l.name}`);
notes.push(lu2020.length ? `NJDEP Land_lu lists 2020 layers: ${lu2020.join('; ')}.` : 'NJDEP Land_lu lists no 2020 land use layer (checked 2026-09-27); v1 keeps 2015.');

const over = rows.filter((row) => row.verdict === 'OVER 2x' || row.verdict === 'ERROR');
const fmt = (ms) => (ms === null ? '—' : `${(ms / 1000).toFixed(2)} s`);
const md = `# Studio live trial (S0-T4)

Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`node tools/trial.mjs\`, from Node (no browser rendering): ${RUNS} runs per row, median shown.
Budgets are IMPLEMENTATION_GUIDE.md §3.5. **${over.length ? `${over.length} row(s) over twice the budget or failed.` : 'Every operation is within twice its budget.'}**

| Operation | Case | Budget | Median | Slowest | Verdict | Result |
| --- | --- | --- | --- | --- | --- | --- |
${rows.map((r) => `| ${r.operation} | ${r.where} | ${fmt(r.budgetMs)} | ${fmt(r.median)} | ${fmt(r.max)} | ${r.verdict} | ${String(r.detail).replace(/\|/g, '/')} |`).join('\n')}

## Screening known answer (§1.4)

${Object.entries(expected).map(([id, n]) => `- ${layer(id).title}: ${screeningCounts[id]} (expected ${n}) ${screeningCounts[id] === n ? '— matches' : '— **differs**'}`).join('\n')}

## SQL syntax on both server kinds (§4.4)

| Check | Where clause | Result |
| --- | --- | --- |
${syntax.join('\n')}

## Notes

${notes.map((n) => `- ${n}`).join('\n')}
- The phone row (375 px, throttled) is measured in the browser, not here; see PROGRESS.md.
`;
writeFileSync(new URL('docs/studio/TRIAL.md', ROOT), md);
console.log(over.length ? `TRIAL: ${over.length} over 2x or failed` : 'TRIAL: PASS (all within 2x)');
