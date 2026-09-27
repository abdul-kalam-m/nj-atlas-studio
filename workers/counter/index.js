// Export counter (DECISIONS.md D-044, IMPLEMENTATION_GUIDE.md §4.13). One path, /v1/count; totals only.
// POST adds 1 to (ISO week, pilot code or 'public', event, outcome). GET with the read key returns every total.
// Never read, stored, logged or returned: IP address, user agent, cookies, referrer, any time finer than the week.
// Settings: DB (D1), READ_KEY (secret), ALLOWED_ORIGIN, PILOTS (comma-separated 4-digit codes).

export const EVENTS = ['pdf', 'png', 'link', 'map_file', 'embed', 'csv', 'geojson'];
export const OUTCOMES = ['ok', 'failed'];
const PATH = '/v1/count';

// ISO 8601 week of a UTC date, e.g. 2026-W41.
export function isoWeek(date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// The body must be exactly {"v": 1, "event", "outcome", "pilot"}: no other keys, and values from the lists.
export function parseBody(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body).sort();
  if (keys.join(',') !== 'event,outcome,pilot,v') return null;
  if (body.v !== 1 || !EVENTS.includes(body.event) || !OUTCOMES.includes(body.outcome)) return null;
  if (body.pilot !== null && !(typeof body.pilot === 'string' && /^\d{4}$/.test(body.pilot))) return null;
  return body;
}

function reply(status, body = null, origin = null) {
  const headers = { 'Cache-Control': 'no-store' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  if (body !== null) headers['Content-Type'] = 'application/json';
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

export async function handle(request, env, now = new Date()) {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return reply(404);
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return reply(403);
    const body = parseBody(await request.text());
    if (!body) return reply(400, null, env.ALLOWED_ORIGIN);
    const pilots = String(env.PILOTS ?? '').split(',').map((code) => code.trim()).filter(Boolean);
    const pilot = body.pilot && pilots.includes(body.pilot) ? body.pilot : 'public';
    await env.DB.prepare('INSERT INTO totals VALUES (?, ?, ?, ?, 1) ON CONFLICT (week, pilot, event, outcome) DO UPDATE SET n = n + 1')
      .bind(isoWeek(now), pilot, body.event, body.outcome).run();
    return reply(204, null, env.ALLOWED_ORIGIN);
  }
  if (request.method === 'GET') {
    if (!env.READ_KEY || request.headers.get('Authorization') !== `Bearer ${env.READ_KEY}`) return reply(401);
    const { results } = await env.DB.prepare('SELECT week, pilot, event, outcome, n FROM totals ORDER BY week, pilot, event, outcome').all();
    return reply(200, { v: 1, generated_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), totals: results });
  }
  return reply(405);
}

export default { fetch: (request, env) => handle(request, env) };
