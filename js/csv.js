// Spreadsheet export of the matching rows. Pure: no imports. Mirrors pipeline/outputs.py (write_csv).

const FORMULA_START = ['=', '+', '-', '@'];

// Fixed decimals without trailing zeros: 610.6 -> "610.6", 274534 -> "274534".
export function plainNumber(value, decimals) {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  let text = Number(value).toFixed(decimals);
  if (decimals > 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text === '-0' ? '0' : text;
}

// Blank for missing values; a leading ' stops spreadsheets treating text as a formula.
export function safeText(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return FORMULA_START.includes(text[0]) ? `'${text}` : text;
}

function quote(cell) {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

// columns: [[key, header], ...] as in catalog csv_columns; decimals: { key: places } for number columns.
export function toCsv(rows, columns, decimals = {}) {
  const lines = [columns.map(([, header]) => quote(header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map(([key]) => quote(key in decimals ? plainNumber(row[key], decimals[key]) : safeText(row[key]))).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function slug(text) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nj';
}

// nj_municipalities_salem-county_2026-09-25.csv
export function csvFileName(layerId, placeName, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return `${layerId}_${placeName ? slug(placeName) : 'nj'}_${day}.csv`;
}

export function csvDecimals(entry) {
  const decimals = { lon: 6, lat: 6 };
  for (const field of entry.fields) if (field.type === 'number') decimals[field.name] = field.decimals ?? 2;
  return decimals;
}
