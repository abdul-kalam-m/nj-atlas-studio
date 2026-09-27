// Table rows in the browser: read the layer's Parquet file with hyparquet, without the geometry column.
import { asyncBufferFromUrl, parquetReadObjects } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.31.1/+esm';

const cache = new Map();
const collator = new Intl.Collator('en-US', { numeric: true, sensitivity: 'base' });

function normalizeRow(row) {
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) row[key] = null;
    else if (typeof value === 'bigint') row[key] = Number(value); // defensive: the build never writes int64
  }
  return row;
}

// Rows sorted once by the layer's label field, so filtered results keep that order without re-sorting.
// `file` is { url, bytes }: the layer's Parquet file, or one municipality's file for a large layer.
export function loadRows(entry, { url, bytes }) {
  if (!cache.has(url)) {
    const promise = (async () => {
      const file = await asyncBufferFromUrl({ url, byteLength: bytes });
      const rows = (await parquetReadObjects({ file, columns: entry.table_columns })).map(normalizeRow);
      const key = entry.label_field;
      return rows.sort((a, b) => collator.compare(String(a[key] ?? '￿'), String(b[key] ?? '￿')));
    })();
    cache.set(url, promise);
    promise.catch(() => cache.delete(url)); // allow "Try again" after a failure
  }
  return cache.get(url);
}
