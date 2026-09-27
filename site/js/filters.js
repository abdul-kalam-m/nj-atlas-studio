// Filter meaning shared with pipeline/filters.py (OPERATING_GUIDE.md §6.7).
// Pure: no imports. Both implementations must pass tests/fixtures/filter_cases.json.

const FILTER_FOR_OP = { in: 'checklist', contains: 'search', range: 'range' };
const PLACE_KEYS = ['county_fips', 'mun_code', 'tract_geoid', 'bg_geoid'];
const PLACE_KINDS = { county_fips: 'county', mun_code: 'municipality', tract_geoid: 'tract', bg_geoid: 'block_group' };

function toNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

const isBlank = (value) => value === null || value === undefined;

// Drop conditions that cannot apply; trim search text; convert number bounds.
export function cleanState(state, fields = null) {
  const place = state?.place ?? {};
  const byName = fields ? new Map(fields.map((field) => [field.name, field])) : null;
  const conditions = [];
  for (const condition of state?.conditions ?? []) {
    if (!condition || typeof condition !== 'object') continue;
    const { field: name, op } = condition;
    const field = byName ? byName.get(name) : null;
    if (byName && (!field || FILTER_FOR_OP[op] !== field.filter)) continue;
    if (op === 'in') {
      const values = (condition.values ?? []).map(String);
      const includeBlank = Boolean(condition.include_blank);
      if (values.length || includeBlank) conditions.push({ field: name, op: 'in', values, include_blank: includeBlank });
    } else if (op === 'contains') {
      const value = toText(condition.value);
      if (value) conditions.push({ field: name, op: 'contains', value });
    } else if (op === 'range') {
      const convert = !field || field.type === 'number' ? toNumber : toText;
      const min = convert(condition.min);
      const max = convert(condition.max);
      if (min !== null || max !== null) conditions.push({ field: name, op: 'range', min, max });
    }
  }
  return {
    boundary: state?.boundary ?? null,
    layer: state?.layer ?? null,
    place: Object.fromEntries(PLACE_KEYS.map((key) => [key, toText(place[key])])),
    conditions,
  };
}

// A place tag holds one code, or several separated by single spaces (mun_code of census tracts, D-021).
function placeMatches(value, code) {
  return value !== null && value !== undefined && (value === code || String(value).split(' ').includes(code));
}

// Row predicate for a cleaned state.
export function toPredicate(clean) {
  const place = PLACE_KEYS.filter((key) => clean.place[key]).map((key) => [key, clean.place[key]]);
  const conditions = clean.conditions.map((condition) => (
    condition.op === 'contains' ? { ...condition, needle: condition.value.toLowerCase() } : condition));
  return (row) => {
    for (const [key, code] of place) if (!placeMatches(row[key], code)) return false;
    for (const condition of conditions) {
      const value = row[condition.field];
      let ok;
      if (condition.op === 'in') {
        ok = isBlank(value) ? condition.include_blank : condition.values.includes(String(value));
      } else if (condition.op === 'contains') {
        ok = !isBlank(value) && String(value).toLowerCase().includes(condition.needle);
      } else {
        ok = !isBlank(value)
          && (condition.min === null || value >= condition.min)
          && (condition.max === null || value <= condition.max);
      }
      if (!ok) return false;
    }
    return true;
  };
}

// MapLibre filter expression for a cleaned state; null clears the filter.
export function toMapFilter(clean) {
  const parts = [];
  for (const key of PLACE_KEYS) {
    const code = clean.place[key];
    if (!code) continue;
    // mun_code may list several codes; padding with spaces matches whole codes only.
    parts.push(key === 'mun_code' ? ['in', ` ${code} `, ['concat', ' ', ['get', key], ' ']] : ['==', ['get', key], code]);
  }
  for (const condition of clean.conditions) {
    const field = condition.field;
    if (condition.op === 'in') {
      const match = ['in', ['get', field], ['literal', condition.values]];
      parts.push(condition.include_blank ? ['any', ['!', ['has', field]], match] : match);
    } else if (condition.op === 'contains') {
      parts.push(['all', ['has', field], ['in', condition.value.toLowerCase(), ['downcase', ['to-string', ['get', field]]]]]);
    } else {
      const range = ['all', ['has', field]];
      if (condition.min !== null) range.push(['>=', ['get', field], condition.min]);
      if (condition.max !== null) range.push(['<=', ['get', field], condition.max]);
      parts.push(range);
    }
  }
  return parts.length ? ['all', ...parts] : null;
}

// Plain-language phrases for a cleaned state, used for the removable chips.
// options.placeNames = { county, municipality, tract, block_group }; options.formatValue formats range bounds.
export function describe(clean, fields, text, options = {}) {
  const { placeNames = {}, formatValue = (value) => String(value) } = options;
  const byName = new Map(fields.map((field) => [field.name, field]));
  const phrases = [];
  for (const key of PLACE_KEYS) {
    const code = clean.place[key];
    if (code) phrases.push({ kind: PLACE_KINDS[key], phrase: text.describe.place(placeNames[PLACE_KINDS[key]] ?? code) });
  }
  clean.conditions.forEach((condition, index) => {
    const field = byName.get(condition.field);
    const label = field?.label ?? condition.field;
    let phrase;
    if (condition.op === 'in') {
      const values = [...condition.values, ...(condition.include_blank ? [text.describe.blank] : [])];
      phrase = text.describe.isOneOf(label, values.join(text.describe.or));
    } else if (condition.op === 'contains') {
      phrase = text.describe.contains(label, condition.value);
    } else if (condition.min !== null && condition.max !== null) {
      phrase = text.describe.between(label, formatValue(condition.min, field), formatValue(condition.max, field));
    } else if (condition.min !== null) {
      phrase = text.describe.atLeast(label, formatValue(condition.min, field));
    } else {
      phrase = text.describe.atMost(label, formatValue(condition.max, field));
    }
    phrases.push({ kind: 'condition', index, phrase });
  });
  return phrases;
}
