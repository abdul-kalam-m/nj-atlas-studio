// ArcGIS REST client for live and hybrid layers (IMPLEMENTATION_GUIDE.md §3.3, §3.8, §4.5-§4.7).
// No DOM: it runs in the browser and in Node (tools/trial.mjs, tools/healthcheck.mjs).
// At most 6 requests at once; timeouts and 5xx are retried once after 2 s; 429 waits for Retry-After (or 10 s).
import { toEsri } from './geo.js';

export const MAX_PAGE = 2000;
const GET_LIMIT = 1500; // longer requests are POSTed (a form POST needs no CORS preflight)

export class LiveError extends Error {
  constructor(kind, message, status = null) {
    super(message);
    this.kind = kind; // 'timeout' | 'network' | 'http' | 'arcgis' | 'rate_limited' | 'cancelled'
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Query parameters for an area or shape: GeoJSON geometry, or an envelope [west, south, east, north].
export function geometryParams(geometry) {
  if (!geometry) return {};
  if (Array.isArray(geometry)) {
    const [xmin, ymin, xmax, ymax] = geometry;
    return { geometry: JSON.stringify({ xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };
  }
  const esri = toEsri(geometry);
  return { geometry: JSON.stringify(esri.geometry), geometryType: esri.geometryType, inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects' };
}

export function fieldTypesOf(info) {
  const types = {};
  for (const field of info.fields ?? []) {
    const type = field.type.replace('esriFieldType', '');
    types[field.name] = ['SmallInteger', 'Integer', 'BigInteger', 'Double', 'Single', 'OID'].includes(type) ? 'number'
      : type === 'Date' ? 'date' : 'string';
  }
  return types;
}

export function createClient({ fetchFn = globalThis.fetch.bind(globalThis), maxConcurrent = 6, timeoutMs = 25000,
  onEvent = () => {}, proxyFor = () => null } = {}) {
  let active = 0;
  const waiting = [];
  const infos = new Map();

  async function slot(task) {
    if (active >= maxConcurrent) await new Promise((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  }

  // `signal` cancels the request (the person pressed Cancel); the timeout aborts it separately.
  async function once(url, params, signal = null) {
    if (signal?.aborted) throw new LiveError('cancelled', `${url}: cancelled`);
    const target = proxyFor(url) ?? url;
    const body = new URLSearchParams({ ...params, f: params.f ?? 'json' });
    const query = body.toString();
    const post = query.length > GET_LIMIT;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const started = Date.now();
    let response;
    try {
      response = await fetchFn(post ? target : `${target}?${query}`, post
        ? { method: 'POST', body: query, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: controller.signal }
        : { signal: controller.signal });
    } catch (error) {
      if (signal?.aborted) throw new LiveError('cancelled', `${url}: cancelled`);
      throw new LiveError(error.name === 'AbortError' ? 'timeout' : 'network', `${url}: ${error.message}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
    if (response.status === 429) {
      const wait = Number(response.headers.get('Retry-After'));
      throw Object.assign(new LiveError('rate_limited', `${url}: HTTP 429`, 429), { waitMs: Number.isFinite(wait) && wait > 0 ? wait * 1000 : 10000 });
    }
    if (!response.ok) throw new LiveError('http', `${url}: HTTP ${response.status}`, response.status);
    const text = await response.text();
    onEvent({ type: 'request', url, ms: Date.now() - started, bytes: text.length, post });
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LiveError('http', `${url}: the answer is not JSON`);
    }
    if (json && json.error) {
      const code = Number(json.error.code) || 0;
      throw new LiveError('arcgis', `${url}: ArcGIS error ${code}: ${json.error.message}`, code);
    }
    return json;
  }

  async function request(url, params, signal = null) {
    return slot(async () => {
      try {
        return await once(url, params, signal);
      } catch (error) {
        const retryable = error.kind === 'timeout' || error.kind === 'network' || error.kind === 'rate_limited'
          || (error.status && error.status >= 500);
        if (!retryable) throw error;
        onEvent({ type: 'retry', url, kind: error.kind });
        await sleep(error.kind === 'rate_limited' ? error.waitMs : 2000);
        return once(url, params, signal);
      }
    });
  }

  function info(url) {
    if (!infos.has(url)) {
      const promise = request(url, {});
      promise.catch(() => infos.delete(url));
      infos.set(url, promise);
    }
    return infos.get(url);
  }

  async function fieldTypes(url) {
    return fieldTypesOf(await info(url));
  }

  function base({ where = '1=1', geometry = null } = {}) {
    return { where, ...geometryParams(geometry) };
  }

  async function count(url, options = {}) {
    const json = await request(`${url}/query`, { ...base(options), returnCountOnly: 'true' });
    return Number(json.count);
  }

  async function objectIdField(url) {
    const layer = await info(url);
    return layer.objectIdField ?? layer.fields?.find((field) => field.type === 'esriFieldTypeOID')?.name ?? 'OBJECTID';
  }

  // One field's values within an area, read page by page, when the server cannot group by it there.
  // NJDEP's MapServer refuses statistics combined with an area outline (found in testing, 2026-09-27).
  // options.onProgress(read) reports progress and options.signal cancels (D-054).
  async function fieldValues(url, field, options, cap = 20000) {
    const page = await allFeatures(url, { ...options, outFields: [field], returnGeometry: false }, cap, options.onProgress);
    return page.features.map((feature) => feature.properties?.[field] ?? null);
  }

  // [{ value, count }] for one source field, most common first.
  async function groupCounts(url, field, options = {}) {
    const oid = await objectIdField(url);
    try {
      const json = await request(`${url}/query`, {
        ...base(options), groupByFieldsForStatistics: field, orderByFields: 'n DESC',
        outStatistics: JSON.stringify([{ statisticType: 'count', onStatisticField: oid, outStatisticFieldName: 'n' }]),
      }, options.signal);
      return (json.features ?? []).map((feature) => {
        const attributes = feature.attributes ?? {};
        const key = Object.keys(attributes).find((name) => name.toLowerCase() === field.toLowerCase());
        const countKey = Object.keys(attributes).find((name) => name.toLowerCase() === 'n');
        return { value: attributes[key] ?? null, count: Number(attributes[countKey]) };
      });
    } catch (error) {
      if (!(error.kind === 'arcgis' && options.geometry)) throw error;
      const counts = new Map();
      for (const value of await fieldValues(url, field, options)) counts.set(value, (counts.get(value) ?? 0) + 1);
      return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
    }
  }

  async function minMax(url, field, options = {}) {
    try {
      const json = await request(`${url}/query`, {
        ...base(options),
        outStatistics: JSON.stringify([
          { statisticType: 'min', onStatisticField: field, outStatisticFieldName: 'lo' },
          { statisticType: 'max', onStatisticField: field, outStatisticFieldName: 'hi' }]),
      }, options.signal);
      const attributes = json.features?.[0]?.attributes ?? {};
      const pick = (name) => attributes[Object.keys(attributes).find((key) => key.toLowerCase() === name)];
      return { min: pick('lo') ?? null, max: pick('hi') ?? null };
    } catch (error) {
      if (!(error.kind === 'arcgis' && options.geometry)) throw error;
      const numbers = (await fieldValues(url, field, options)).map(Number).filter(Number.isFinite);
      return numbers.length ? { min: Math.min(...numbers), max: Math.max(...numbers) } : { min: null, max: null };
    }
  }

  // One page of features as GeoJSON. `options.distanceFt` turns the geometry into a distance query (D-033).
  async function features(url, options = {}) {
    const params = { ...base(options), outFields: (options.outFields ?? ['*']).join(','), returnGeometry: String(options.returnGeometry !== false),
      outSR: '4326', f: 'geojson' };
    if (options.distanceFt) Object.assign(params, { distance: String(options.distanceFt), units: 'esriSRUnit_Foot' });
    if (options.maxAllowableOffset) params.maxAllowableOffset = String(options.maxAllowableOffset);
    if (options.precision) params.geometryPrecision = String(options.precision);
    if (options.orderBy) params.orderByFields = options.orderBy;
    if (options.offset !== undefined) params.resultOffset = String(options.offset);
    if (options.num !== undefined) params.resultRecordCount = String(options.num);
    const json = await request(`${url}/query`, params, options.signal);
    return { features: json.features ?? [], exceeded: Boolean(json.exceededTransferLimit || json.properties?.exceededTransferLimit) };
  }

  // Every matching feature, page by page, up to `cap`. Returns { features, complete }.
  async function allFeatures(url, options = {}, cap = 50000, onPage = () => {}) {
    const layer = await info(url);
    const size = Math.min(MAX_PAGE, Number(layer.maxRecordCount) || 1000);
    const oid = await objectIdField(url);
    const out = [];
    for (let offset = 0; offset < cap; offset += size) {
      const page = await features(url, { ...options, offset, num: Math.min(size, cap - offset), orderBy: options.orderBy ?? oid });
      out.push(...page.features);
      onPage(out.length);
      if (page.features.length < Math.min(size, cap - offset) && !page.exceeded) return { features: out, complete: true };
    }
    return { features: out, complete: false };
  }

  return { request, info, fieldTypes, objectIdField, count, groupCounts, minMax, features, allFeatures };
}
