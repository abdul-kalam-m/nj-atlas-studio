// Last night's source checks (site/data/health.json, written by tools/healthcheck.mjs). Missing file: no warnings.
export async function loadHealth(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return {};
    const health = await response.json();
    return health.layers ?? {};
  } catch {
    return {};
  }
}
