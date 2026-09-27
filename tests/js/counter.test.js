import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle, isoWeek, parseBody } from '../../workers/counter/index.js';

// A fake D1 database that keeps the totals table in memory.
function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        bind: (...values) => ({
          run: async () => {
            assert.match(sql, /^INSERT INTO totals VALUES \(\?, \?, \?, \?, 1\) ON CONFLICT/);
            const key = values.join('|');
            rows.set(key, (rows.get(key) ?? 0) + 1);
          },
        }),
        all: async () => ({ results: [...rows].sort().map(([key, n]) => {
          const [week, pilot, event, outcome] = key.split('|');
          return { week, pilot, event, outcome, n };
        }) }),
      };
    },
  };
}

const env = () => ({ DB: fakeDb(), READ_KEY: 'k3y', ALLOWED_ORIGIN: 'https://studio.test', PILOTS: '1709, 0714' });
const post = (body, origin = 'https://studio.test', headers = {}) => new Request('https://c.test/v1/count', {
  method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { Origin: origin, 'Content-Type': 'text/plain', ...headers } });
const NOW = new Date('2026-10-07T15:00:00Z');

test('a valid export is counted for its week, pilot, event and outcome', async () => {
  const e = env();
  const response = await handle(post({ v: 1, event: 'pdf', outcome: 'ok', pilot: '1709' }), e, NOW);
  assert.equal(response.status, 204);
  assert.deepEqual([...e.DB.rows], [['2026-W41|1709|pdf|ok', 1]]);
  await handle(post({ v: 1, event: 'pdf', outcome: 'ok', pilot: '1709' }), e, NOW);
  assert.equal(e.DB.rows.get('2026-W41|1709|pdf|ok'), 2);
});

test('an unlisted or missing pilot code is stored as public', async () => {
  const e = env();
  await handle(post({ v: 1, event: 'png', outcome: 'failed', pilot: '9999' }), e, NOW);
  await handle(post({ v: 1, event: 'png', outcome: 'failed', pilot: null }), e, NOW);
  assert.deepEqual([...e.DB.rows], [['2026-W41|public|png|failed', 2]]);
});

test('a bad body is refused and stores nothing', async () => {
  const e = env();
  for (const body of ['not json', { v: 1, event: 'pdf', outcome: 'ok' }, { v: 1, event: 'pdf', outcome: 'ok', pilot: null, user: 'x' },
    { v: 2, event: 'pdf', outcome: 'ok', pilot: null }, { v: 1, event: 'print', outcome: 'ok', pilot: null }, { v: 1, event: 'pdf', outcome: 'ok', pilot: '17' }]) {
    assert.equal((await handle(post(body), e, NOW)).status, 400);
  }
  assert.equal(e.DB.rows.size, 0);
});

test('another site is refused', async () => {
  const e = env();
  assert.equal((await handle(post({ v: 1, event: 'pdf', outcome: 'ok', pilot: null }, 'https://fork.test'), e, NOW)).status, 403);
  assert.equal(e.DB.rows.size, 0);
});

test('totals are read only with the key', async () => {
  const e = env();
  await handle(post({ v: 1, event: 'csv', outcome: 'ok', pilot: '0714' }), e, NOW);
  assert.equal((await handle(new Request('https://c.test/v1/count'), e, NOW)).status, 401);
  assert.equal((await handle(new Request('https://c.test/v1/count', { headers: { Authorization: 'Bearer wrong' } }), e, NOW)).status, 401);
  const response = await handle(new Request('https://c.test/v1/count', { headers: { Authorization: 'Bearer k3y' } }), e, NOW);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { v: 1, generated_at: '2026-10-07T15:00:00Z',
    totals: [{ week: '2026-W41', pilot: '0714', event: 'csv', outcome: 'ok', n: 1 }] });
});

test('the handler never reads the address, browser or cookies', () => {
  const source = readFileSync(new URL('../../workers/counter/index.js', import.meta.url), 'utf8');
  const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  for (const header of ['CF-Connecting-IP', 'User-Agent', 'Cookie', 'X-Forwarded-For', 'Referer']) {
    assert.ok(!code.toLowerCase().includes(header.toLowerCase()), header);
  }
});

test('ISO weeks and the body parser', () => {
  assert.equal(isoWeek(new Date('2026-01-01T00:00:00Z')), '2026-W01');
  assert.equal(isoWeek(new Date('2027-01-01T12:00:00Z')), '2026-W53');
  assert.equal(parseBody('{"v":1,"event":"embed","outcome":"ok","pilot":null}').event, 'embed');
});

test('other paths and methods', async () => {
  assert.equal((await handle(new Request('https://c.test/other'), env(), NOW)).status, 404);
  assert.equal((await handle(new Request('https://c.test/v1/count', { method: 'DELETE' }), env(), NOW)).status, 405);
});
