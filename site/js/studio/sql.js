// Filters and area codes -> an ArcGIS `where` clause in the source's own field names (IMPLEMENTATION_GUIDE.md §4.4).
// Pure: no imports. Cases live in tests/fixtures/sql_cases.json.
//
// `types` maps source field names to 'string' | 'number' | 'date' (from the service's layer info), so numbers are
// never quoted. Conditions use output names and displayed values, exactly as the atlas filters do (§6.7).

const SQ_M_PER_SQ_MI = 2589988.110336;
const CASE_INSENSITIVE = new Set(['titlecase', 'upper']);

export function quote(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

function literal(value, type) {
  if (type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Not a number: ${value}`);
    return String(number);
  }
  return quote(value);
}

// %, _ and the escape character itself are matched literally.
function likePattern(text) {
  return String(text).toUpperCase().replace(/'/g, "''").replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Source codes whose displayed value is one of `values` (value_labels in reverse). A value that no code maps to
// is itself a source value.
function sourceValues(field, values) {
  const labels = field.value_labels ?? {};
  const out = new Set();
  for (const value of values) {
    const codes = Object.keys(labels).filter((code) => labels[code] === value);
    if (codes.length) codes.forEach((code) => out.add(code));
    else if (!Object.values(labels).includes(value)) out.add(value);
  }
  return [...out];
}

function blankCodes(field) {
  return Object.keys(field.value_labels ?? {}).filter((code) => field.value_labels[code] === null);
}

function nextDay(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// A yymmdd text field in a date range: within each century window, text order is date order (D-028).
function yymmddRange(column, min, max) {
  const windows = [['1930-01-01', '1999-12-31'], ['2000-01-01', '2029-12-31']];
  const parts = [];
  for (const [start, end] of windows) {
    const lo = min && min > start ? min : start;
    const hi = max && max < end ? max : end;
    if (lo > hi) continue;
    const code = (iso) => iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
    parts.push(`(${column} >= ${quote(code(lo))} AND ${column} <= ${quote(code(hi))})`);
  }
  return parts.length ? `(${parts.join(' OR ')})` : '1=0';
}

function inClause(column, field, condition, type) {
  const values = sourceValues(field, condition.values);
  const insensitive = CASE_INSENSITIVE.has(field.transform) && type !== 'number';
  const target = insensitive ? `UPPER(${column})` : column;
  const listed = values.map((v) => literal(insensitive ? String(v).toUpperCase() : v, type));
  const parts = listed.length ? [`${target} IN (${listed.join(', ')})`] : [];
  if (condition.include_blank) {
    parts.push(`${column} IS NULL`);
    if (type !== 'number') parts.push(`${column} = ''`);
    const blanks = blankCodes(field);
    if (blanks.length) parts.push(`${column} IN (${blanks.map((v) => literal(v, type)).join(', ')})`);
  }
  if (!parts.length) return '1=0';
  return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
}

function rangeClause(column, field, condition, type) {
  const { min, max } = condition;
  if (field.transform === 'yymmdd') return yymmddRange(column, min, max);
  const parts = [];
  if (type === 'date') {
    if (min !== null && min !== undefined) parts.push(`${column} >= DATE ${quote(min)}`);
    if (max !== null && max !== undefined) parts.push(`${column} < DATE ${quote(nextDay(max))}`);
  } else {
    const scale = field.transform === 'sq_m_to_sq_mi' ? SQ_M_PER_SQ_MI : 1;
    if (min !== null && min !== undefined) parts.push(`${column} >= ${literal(min * scale, 'number')}`);
    if (max !== null && max !== undefined) parts.push(`${column} <= ${literal(max * scale, 'number')}`);
    if (field.transform === 'zero_is_blank') parts.push(`${column} <> 0`);
  }
  return parts.length ? parts.join(' AND ') : '1=1';
}

// Conditions (output names) -> where clause (source names); null when there are none.
export function conditionsWhere(entry, conditions, types = {}) {
  const byName = new Map(entry.fields.map((field) => [field.name, field]));
  const clauses = [];
  for (const condition of conditions ?? []) {
    const field = byName.get(condition.field);
    if (!field) continue;
    const column = field.source;
    const type = types[column] ?? (field.type === 'number' ? 'number' : 'string');
    if (condition.op === 'in') clauses.push(inClause(column, field, condition, type));
    else if (condition.op === 'contains') clauses.push(`UPPER(${column}) LIKE '%${likePattern(condition.value)}%' ESCAPE '\\'`);
    else if (condition.op === 'range') clauses.push(rangeClause(column, field, condition, type));
  }
  return clauses.length ? clauses.join(' AND ') : null; // every OR clause above is already in parentheses
}

// NJ county number (01 Atlantic ... 21 Warren) from the 3-digit county FIPS code (001 ... 041).
export function countyNumber(fips) {
  return String((Number(fips) + 1) / 2).padStart(2, '0');
}

// The area as a where clause when the layer has a code for its level: { where } or { outline: level } when the
// server must test the area's outline instead, or {} for the whole state. `area` is the map document's area;
// `names.county` is the chosen county's name (for county_name codes).
export function areaWhere(entry, area, names = {}) {
  const level = area?.level;
  if (!level || level === 'state') return {};
  const codes = entry.area_mode === 'code' ? (entry.area_codes ?? {}) : {};
  if (level === 'municipality' && area.mun_code && codes.municipality) {
    return { where: `${codes.municipality.field} = ${quote(area.mun_code)}` };
  }
  if (level === 'county' && area.county_fips && codes.county) {
    const { field, match } = codes.county;
    if (match === 'mun_prefix') return { where: `${field} LIKE ${quote(`${countyNumber(area.county_fips)}%`)}` };
    if (match === 'county_number') return { where: `${field} = ${quote(countyNumber(area.county_fips))}` };
    if (match === 'county_fips') return { where: `${field} = ${quote(area.county_fips)}` };
    if (match === 'county_name' && names.county) {
      const bare = names.county.toUpperCase().replace(/ COUNTY$/, '');
      return { where: `UPPER(${field}) IN (${quote(bare)}, ${quote(`${bare} COUNTY`)})` };
    }
  }
  return { outline: level };
}

export function joinWhere(...clauses) {
  const present = clauses.filter((c) => c && c !== '1=1');
  if (!present.length) return '1=1';
  return present.length === 1 ? present[0] : present.map((c) => `(${c})`).join(' AND ');
}
