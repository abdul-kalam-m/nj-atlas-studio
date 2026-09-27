// View state and share links (OPERATING_GUIDE.md §6.8). Pure: imports only the pure places.js.
// Hash format: b=<level>&layer=<id>&county=<fips>&mun=<code>&tract=<code>&bg=<code>&c=<base64url(JSON conditions)>
import { DEFAULT_BOUNDARY, emptyPlace, levelFor, shownLayerId, trimPlace } from './places.js';

const PLACE_PARAMS = [
  ['county', 'county_fips', /^\d{3}$/],
  ['mun', 'mun_code', /^\d{4}$/],
  ['tract', 'tract_geoid', /^34\d{9}$/],
  ['bg', 'bg_geoid', /^34\d{10}$/],
];

export function emptyState(boundary = DEFAULT_BOUNDARY, layer = null) {
  return { boundary, layer, place: emptyPlace(), conditions: [] };
}

function toBase64Url(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const base = code.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeHash(state) {
  const params = new URLSearchParams();
  if (state.boundary) params.set('b', state.boundary);
  if (state.layer) params.set('layer', state.layer);
  for (const [param, key] of PLACE_PARAMS) if (state.place?.[key]) params.set(param, state.place[key]);
  if (state.conditions?.length) params.set('c', toBase64Url(JSON.stringify(state.conditions)));
  return params.toString();
}

// Returns { state, notices }. Notices are codes the page turns into text: unknownLayer, unknownField, badLink.
// `levels` comes from places.json, so a link never picks a level this build does not have.
export function decodeHash(hash, catalog, levels) {
  const params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const notices = [];
  const state = emptyState();
  const levelIds = levels.map((level) => level.id);
  if (levelIds.includes(params.get('b'))) state.boundary = params.get('b');
  let layerId = params.get('layer');
  const boundaryLevel = levels.find((level) => level.layer === layerId);
  if (boundaryLevel) { // links made before D-020 named a boundary layer as the data
    state.boundary = boundaryLevel.id;
    layerId = null;
  }
  let known = true;
  if (layerId) {
    known = catalog.layers.some((layer) => layer.id === layerId);
    if (known) state.layer = layerId;
    else notices.push({ code: 'unknownLayer' });
  }
  for (const [param, key, pattern] of PLACE_PARAMS) {
    const value = params.get(param);
    if (value && pattern.test(value)) state.place[key] = value;
  }
  const wanted = levelFor(state.place, state.boundary);
  if (levelIds.includes(wanted)) state.boundary = wanted;
  state.place = trimPlace(state.place, state.boundary);
  if (params.has('c') && known) {
    let conditions = [];
    try {
      conditions = JSON.parse(fromBase64Url(params.get('c')));
      if (!Array.isArray(conditions)) throw new Error('not a list');
    } catch {
      notices.push({ code: 'badLink' });
      conditions = [];
    }
    const entry = catalog.layers.find((layer) => layer.id === shownLayerId(state, levels));
    const filterable = new Set((entry?.fields ?? []).filter((field) => field.filter !== 'none').map((field) => field.name));
    for (const condition of conditions) {
      if (condition && filterable.has(condition.field)) state.conditions.push(condition);
      else notices.push({ code: 'unknownField', detail: String(condition?.field ?? '?') });
    }
  }
  return { state, notices };
}
