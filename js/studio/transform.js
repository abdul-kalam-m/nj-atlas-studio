// Display-time field transforms for live and hybrid layers: the same rules as pipeline/normalize.py, applied in
// the browser to the source's values. Both must pass tests/fixtures/transform_cases.json. Pure: no imports.

const SQ_M_PER_SQ_MI = 2589988.110336;
const YY_PIVOT = 30; // yymmdd: 00-29 are 2000-2029, 30-99 are 1930-1999

// Stripped string, or null for missing/empty. Whole-number numbers lose any '.0'.
export function asText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? String(value) : String(value);
  }
  const text = String(value).trim();
  return text || null;
}

export function titlecase(text) {
  return text.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
}

export function yymmdd(value) {
  const text = asText(value);
  if (!text || !/^\d{6}$/.test(text)) return null;
  const yy = Number(text.slice(0, 2));
  const year = yy < YY_PIVOT ? 2000 + yy : 1900 + yy;
  const month = Number(text.slice(2, 4));
  const day = Number(text.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${text.slice(2, 4)}-${text.slice(4, 6)}`;
}

const TEXT_TRANSFORMS = {
  last3: (s) => s.slice(-3),
  zfill3: (s) => s.padStart(3, '0'),
  zfill4: (s) => s.padStart(4, '0'),
  titlecase,
  upper: (s) => s.toUpperCase(),
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

// ArcGIS dates arrive as epoch milliseconds; some sources store text dates.
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = toNumber(value);
  const date = number !== null ? new Date(number) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// One source value -> the displayed value for a recipe field.
export function convertValue(value, field) {
  const { type, transform } = field;
  if (type === 'text' || type === 'category') {
    let text = asText(value);
    if (text !== null && transform && TEXT_TRANSFORMS[transform]) text = TEXT_TRANSFORMS[transform](text);
    if (text !== null && field.value_labels && Object.hasOwn(field.value_labels, text)) text = field.value_labels[text];
    return text;
  }
  if (type === 'number') {
    let number = transform && TEXT_TRANSFORMS[transform] ? toNumber(TEXT_TRANSFORMS[transform](asText(value) ?? '')) : toNumber(value);
    if (number === null) return null;
    if (transform === 'sq_m_to_sq_mi') number /= SQ_M_PER_SQ_MI;
    if (transform === 'zero_is_blank' && number === 0) return null;
    return number;
  }
  if (type === 'date') {
    if (transform === 'yymmdd') return yymmdd(value);
    if (transform && TEXT_TRANSFORMS[transform]) {
      const text = asText(value);
      return text === null ? null : toDate(TEXT_TRANSFORMS[transform](text));
    }
    return toDate(value);
  }
  return value ?? null;
}

// Source properties -> { atlas_id, <output fields> } for display, styling, tables and exports.
export function toRow(properties, entry) {
  const row = { atlas_id: asText(properties[entry.source.id_field]) };
  for (const field of entry.fields) row[field.name] = convertValue(properties[field.source], field);
  return row;
}
