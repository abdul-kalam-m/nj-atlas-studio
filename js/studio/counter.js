// The export counter's browser side (D-044, IMPLEMENTATION_GUIDE.md §4.13): one beacon per export attempt, with
// the export type, the outcome and the pilot town's code. Nothing else is sent; a failed beacon is ignored.
export const EVENTS = ['pdf', 'png', 'link', 'map_file', 'embed', 'csv', 'geojson'];
const PILOT_KEY = 'nj-atlas-studio-pilot';

// ?pilot=1709 in the site address marks a pilot town's browser; it is an organization's code, never a person's.
export function rememberPilot(search = location.search) {
  try {
    const code = new URLSearchParams(search).get('pilot');
    if (code && /^\d{4}$/.test(code)) localStorage.setItem(PILOT_KEY, code);
    return localStorage.getItem(PILOT_KEY);
  } catch {
    return null;
  }
}

export function countExport(counterUrl, event, ok, pilot) {
  if (!counterUrl || !EVENTS.includes(event)) return;
  try {
    navigator.sendBeacon?.(counterUrl, JSON.stringify({ v: 1, event, outcome: ok ? 'ok' : 'failed', pilot: pilot ?? null }));
  } catch {
    // never retried (§4.13)
  }
}
