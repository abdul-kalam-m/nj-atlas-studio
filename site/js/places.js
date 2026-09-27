// Boundary levels and the area pickers (OPERATING_GUIDE.md §6.6, DECISIONS.md D-020). Pure: no imports.
// Level IDs and place keys match pipeline/levels.py; places.json lists which levels this build has.

export const LEVEL_ORDER = ['state', 'county', 'municipality', 'tract', 'block_group'];
export const LEVEL_KEYS = { county: 'county_fips', municipality: 'mun_code', tract: 'tract_geoid', block_group: 'bg_geoid' };
export const DEFAULT_BOUNDARY = 'county';

// What must be picked before a level's picker lists anything.
const NEEDS = { municipality: 'county_fips', tract: 'county_fips', block_group: 'tract_geoid' };

export function emptyPlace() {
  return { county_fips: null, mun_code: null, tract_geoid: null, bg_geoid: null };
}

// The pickers shown for a boundary level: every level from county down to it ("state" shows none).
export function pickerLevels(boundary) {
  const index = LEVEL_ORDER.indexOf(boundary);
  return index < 1 ? [] : LEVEL_ORDER.slice(1, index + 1);
}

export function pickerNeeds(level) {
  return NEEDS[level] ?? null;
}

// Keep only the place parts whose pickers the boundary level shows.
export function trimPlace(place, boundary) {
  const kept = emptyPlace();
  for (const level of pickerLevels(boundary)) kept[LEVEL_KEYS[level]] = place?.[LEVEL_KEYS[level]] || null;
  return kept;
}

// A picker changed: set its code and clear every smaller level, whose list depends on it.
export function choose(place, level, code) {
  const next = { ...emptyPlace(), ...place, [LEVEL_KEYS[level]]: code || null };
  for (const smaller of LEVEL_ORDER.slice(LEVEL_ORDER.indexOf(level) + 1)) next[LEVEL_KEYS[smaller]] = null;
  return next;
}

// The smallest level with a choice, or null when the whole state is shown.
export function deepestChoice(place) {
  for (const level of LEVEL_ORDER.slice(1).reverse()) if (place?.[LEVEL_KEYS[level]]) return level;
  return null;
}

// The deeper of two levels. A dataset loaded one municipality at a time (D-025) needs at least 'municipality'.
export function atLeastLevel(boundary, level) {
  return LEVEL_ORDER.indexOf(boundary) < LEVEL_ORDER.indexOf(level) ? level : boundary;
}

// A link or example picking a smaller area than the boundary level shows moves the level down to it.
export function levelFor(place, boundary) {
  const deepest = deepestChoice(place);
  return deepest && LEVEL_ORDER.indexOf(deepest) > LEVEL_ORDER.indexOf(boundary) ? deepest : boundary;
}

// The areas a level's picker lists for the current choices. Census tracts and block groups list every
// municipality they share enough area with (D-021), so a chosen municipality narrows them too.
export function unitsFor(level, units, place) {
  const needs = NEEDS[level];
  if (needs && !place[needs]) return [];
  return (units ?? []).filter((unit) => (!place.county_fips || !unit.county || unit.county === place.county_fips)
    && (level === 'municipality' || !place.mun_code || !unit.muns || unit.muns.includes(place.mun_code))
    && (level !== 'block_group' || unit.tract === place.tract_geoid));
}

// The layer on the map and in the table: the chosen data, or the boundary level's own areas.
export function shownLayerId(state, levels) {
  return state.layer ?? levels.find((level) => level.id === state.boundary)?.layer ?? null;
}
