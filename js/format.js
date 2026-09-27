// Number, date, unit and size formatting. Pure: no imports, tested with node --test.

export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
}

export function formatCount(value) {
  return formatNumber(value, 0);
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// "2020-01-05" -> "Jan 5, 2020". Dates are calendar days, so format in UTC to avoid shifting a day.
export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!match) return String(iso ?? '');
  return DATE_FORMAT.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

// Format one value for display using its field definition from the catalog.
export function formatValue(value, field, notRecorded) {
  if (value === null || value === undefined || value === '' || Number.isNaN(value)) return notRecorded;
  if (field?.type === 'number') {
    const text = formatNumber(Number(value), field.decimals ?? 2);
    return field.unit ? `${text} ${field.unit}` : text;
  }
  if (field?.type === 'date') return formatDate(value);
  return String(value);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['bytes', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${formatNumber(value, unit === 0 ? 0 : 1)} ${units[unit]}`;
}
