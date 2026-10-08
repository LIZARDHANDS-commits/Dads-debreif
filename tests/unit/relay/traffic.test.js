// Checks: the traffic relay: query numbers validated, only GET /traffic answered, reply trimmed and nearest first,
//   hostile text never passed on, size and redirect limits, cache, origins.
// Serves: SOF-R17 (the live-traffic relay is on the future list, SOF-Q9; this file leaves when the relay is
//   archived).
// Expected values: a real adsb.lol reply trimmed to five aircraft (captured 2026-09-30); limits (1000 aircraft, 1 MB,
//   5 s cache) are design constants from the relay.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../../../relay/traffic.js';
import {
  parseQuery, trimAircraft, createHandler, createMemoryCache,
  DEFAULT_ORIGINS, MAX_AIRCRAFT, MAX_REPLY_BYTES, CACHE_MS,
} from '../../../relay/lib.js';

// A real adsb.lol /v2/point reply, trimmed to five aircraft (captured 2026-09-30, tests/fixtures/relay).
const SAMPLE = readFileSync(new URL('../../fixtures/relay/adsblol-point-sample.json', import.meta.url), 'utf8');
const SITE = 'https://lizardhands-commits.github.io';
const NOW = Date.parse('2026-09-30T07:00:00Z');

/** A fake upstream fetch: records every call and answers with `body` (a string or a function). */
function fakeUpstream(body = SAMPLE, init = {}) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    if (body instanceof Error) throw body;
    return new Response(typeof body === 'function' ? body() : body, { status: 200, ...init });
  };
  fn.calls = calls;
  return fn;
}

function setup({ upstream = fakeUpstream(), clock = { t: NOW }, ...rest } = {}) {
  const handle = createHandler({ fetch: upstream, cache: createMemoryCache({ now: () => clock.t }), now: () => clock.t, ...rest });
  return { handle, upstream, clock };
}

const get = (query, headers = {}, path = '/traffic') =>
  new Request(`https://relay.example.workers.dev${path}${query}`, { headers });
const GOOD = '?lat=50.33&lon=-105.56&nm=100';
const json = async (res) => JSON.parse(await res.text());

// --- The three numbers ------------------------------------------------------

test('parseQuery accepts three in-range numbers and rounds them for the cache key', () => {
  const q = parseQuery(new URL('https://x/traffic?lat=50.3334&lon=-105.5566&nm=99.6'));
  assert.deepEqual(q, { ok: true, lat: 50.33, lon: -105.56, nm: 100 });
});

test('parseQuery: nm defaults to 100 when left out', () => {
  assert.equal(parseQuery(new URL('https://x/traffic?lat=1&lon=2')).nm, 100);
});

test('parseQuery accepts the edges of every range', () => {
  for (const [lat, lon, nm] of [[-90, -180, 5], [90, 180, 250], [0, 0, 5]]) { // 250 NM, the upstreams' own most: Dad's yes, 8 Oct 2026 (was 150)
    const q = parseQuery(new URL(`https://x/traffic?lat=${lat}&lon=${lon}&nm=${nm}`));
    assert.equal(q.ok, true, `${lat},${lon},${nm}`);
  }
});

test('parseQuery refuses anything that is not a plain in-range number', () => {
  const bad = [
    '?lon=1&nm=10', '?lat=1&nm=10', '?lat=&lon=1', '?lat=abc&lon=1',
    '?lat=1e1&lon=1', '?lat=%201&lon=1', '?lat=0x10&lon=1', '?lat=%2B5&lon=1', '?lat=Infinity&lon=1', '?lat=NaN&lon=1',
    '?lat=1,2&lon=1', '?lat=1.&lon=1', '?lat=--1&lon=1', '?lat=1&lon=1&nm=abc',
    '?lat=90.01&lon=0', '?lat=-90.01&lon=0', '?lat=0&lon=180.01', '?lat=0&lon=-180.01',
    '?lat=0&lon=0&nm=4.9', '?lat=0&lon=0&nm=250.1', '?lat=0&lon=0&nm=-5', '?lat=0&lon=0&nm=0', // 250.1: Dad's yes, 8 Oct 2026 (was 150.1)
    '?lat=1&lat=2&lon=0', '?lat=1&lon=0&extra=1', '?lat=1&lon=0&url=https://evil.example',
    `?lat=${'9'.repeat(400)}&lon=0`,
  ];
  for (const q of bad) assert.equal(parseQuery(new URL(`https://x/traffic${q}`)).ok, false, q);
});

test('the handler asks upstream nothing for a refused request', async () => {
  const { handle, upstream } = setup();
  for (const q of ['', '?lat=91&lon=0', '?lat=0&lon=0&nm=500', '?lat=../../etc&lon=0']) {
    const res = await handle(get(q));
    assert.equal(res.status, 400, q);
    assert.match((await json(res)).error, /lat|lon|nm/);
  }
  assert.equal(upstream.calls.length, 0);
});

test('only GET on /traffic is answered', async () => {
  const { handle, upstream } = setup();
  assert.equal((await handle(get(GOOD, {}, '/other'))).status, 404);
  assert.equal((await handle(get(GOOD, {}, '/traffic/'))).status, 404);
  const post = await handle(new Request(`https://relay.example${'/traffic'}${GOOD}`, { method: 'POST', body: 'x' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, OPTIONS');
  assert.equal(upstream.calls.length, 0);
});

// --- The upstream call and the trimmed reply --------------------------------

test('asks adsb.lol /v2/point once, with only the checked numbers in the address', async () => {
  const { handle, upstream } = setup();
  const res = await handle(get('?lat=50.3334&lon=-105.5566&nm=100'));
  assert.equal(res.status, 200);
  assert.equal(upstream.calls.length, 1);
  assert.equal(upstream.calls[0].url, 'https://api.adsb.lol/v2/point/50.33/-105.56/100');
  assert.equal(upstream.calls[0].options.redirect, 'manual');
  assert.equal(Object.keys(upstream.calls[0].options.headers ?? {}).some((h) => /auth|key|cookie/i.test(h)), false);
});

test('negative and zero coordinates go into the address as plain numbers', async () => {
  const { handle, upstream } = setup();
  await handle(get('?lat=-0.001&lon=0&nm=5'));
  assert.equal(upstream.calls[0].url, 'https://api.adsb.lol/v2/point/0/0/5');
});

test('reply is JSON with only the trimmed fields, nearest aircraft first', async () => {
  const { handle } = setup();
  const res = await handle(get(GOOD));
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const body = await json(res);
  assert.deepEqual(Object.keys(body).sort(), ['aircraft', 'count', 'now', 'source', 'truncated']);
  assert.equal(body.source, 'adsb.lol');
  assert.equal(body.now, NOW);
  assert.equal(body.truncated, false);
  assert.equal(body.count, body.aircraft.length);
  assert.equal(body.count, 5);
  const fields = ['alt', 'callsign', 'gs', 'hex', 'lat', 'lon', 'mil', 'reg', 'seen', 'squawk', 'track', 'type'];
  for (const a of body.aircraft) assert.deepEqual(Object.keys(a).sort(), fields);
});

test('a real aircraft comes through with its facts', async () => {
  const { handle } = setup();
  const acs = (await json(await handle(get(GOOD)))).aircraft;
  assert.deepEqual(acs.find((a) => a.hex === 'c05edf'), {
    hex: 'c05edf', callsign: 'ACA154', reg: 'C-GJYC', type: 'BCS3',
    lat: 50.855806, lon: -106.725464, alt: 35000, gs: 595.3, track: 91.73, squawk: '1304', seen: 0, mil: false,
  });
});

test('an aircraft on the ground reports alt "ground", and missing facts are null', async () => {
  const { handle } = setup();
  const acs = (await json(await handle(get(GOOD)))).aircraft;
  const tr = acs.find((a) => a.hex === 'c1e985');
  assert.equal(tr.alt, 'ground');
  assert.equal(tr.track, null);
  assert.equal(tr.squawk, null);
  assert.equal(tr.type, 'SERV');
});

test('aircraft come nearest to the asked point first', async () => {
  const { handle } = setup();
  const acs = (await json(await handle(get('?lat=43.68&lon=-79.6&nm=50')))).aircraft;
  assert.equal(acs[0].hex.startsWith('c1e') || acs[0].hex.startsWith('c0'), true);
  const d = (a) => Math.hypot(a.lat - 43.68, (a.lon + 79.6) * Math.cos((43.68 * Math.PI) / 180));
  for (let i = 1; i < acs.length; i++) assert.ok(d(acs[i - 1]) <= d(acs[i]) + 1e-9);
});

test('the military flag comes from dbFlags bit 0 (value 1) only', () => {
  const flags = [1, 2, 3, 0, '1', undefined];
  const ac = flags.map((dbFlags, i) => ({ hex: `aabb0${i}`, lat: 1, lon: 1 + i / 100, dbFlags }));
  const out = trimAircraft({ ac }, { lat: 1, lon: 1 });
  assert.deepEqual(out.aircraft.map((a) => a.mil), [true, false, true, false, false, false]);
});

test('position age is seen_pos, falling back to seen', () => {
  const out = trimAircraft({ ac: [
    { hex: 'aaaaaa', lat: 1, lon: 1, seen_pos: 3.26, seen: 0.5 },
    { hex: 'bbbbbb', lat: 1, lon: 1, seen: 7.44 },
    { hex: 'cccccc', lat: 1, lon: 1 },
  ] }, { lat: 1, lon: 1 });
  assert.deepEqual(out.aircraft.map((a) => a.seen), [3.3, 7.4, null]);
});

test('TIS-B ids with a leading ~ are kept, lower-cased', () => {
  const out = trimAircraft({ ac: [{ hex: '~ABC123', lat: 1, lon: 1 }] }, { lat: 1, lon: 1 });
  assert.equal(out.aircraft[0].hex, '~abc123');
});

// --- Hostile upstream -------------------------------------------------------

test('a script in a callsign, registration or type never reaches the reply', async () => {
  const evil = {
    ac: [{
      hex: 'abcdef', flight: '<script>alert(1)</script>', r: '"><img src=x onerror=1>', t: '<b>', squawk: '<i>',
      lat: 50, lon: -105, alt_baro: 1000, gs: 100, track: 10,
    }],
  };
  const { handle } = setup({ upstream: fakeUpstream(JSON.stringify(evil)) });
  const res = await handle(get(GOOD));
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.doesNotMatch(text, /[<>]/);
  assert.doesNotMatch(text, /script|onerror/i);
  const a = JSON.parse(text).aircraft[0];
  assert.equal(a.hex, 'abcdef');
  assert.deepEqual([a.callsign, a.reg, a.type, a.squawk], [null, null, null, null]);
  assert.equal(a.alt, 1000);
});

test('aircraft with a bad hex or an impossible position are dropped', () => {
  const good = { hex: 'abcdef', lat: 10, lon: 10 };
  const bad = [
    { hex: 'ABCDEFG', lat: 10, lon: 10 }, { hex: '<script>', lat: 10, lon: 10 }, { hex: 'abcdef' },
    { hex: '111111', lat: 91, lon: 10 }, { hex: '222222', lat: 10, lon: 181 }, { hex: '333333', lat: '10', lon: '10' },
    { hex: '444444', lat: null, lon: 10 }, { hex: '555555', lat: NaN, lon: 1 }, null, 7, 'x', [], {},
  ];
  const out = trimAircraft({ ac: [...bad, good] }, { lat: 10, lon: 10 });
  assert.deepEqual(out.aircraft.map((a) => a.hex), ['abcdef']);
});

test('out-of-range or wrongly typed numbers become null, never a string', () => {
  const out = trimAircraft({ ac: [{
    hex: 'abcdef', lat: 1, lon: 1, alt_baro: 1e9, gs: -5, track: 400, seen: 99999,
  }, {
    hex: 'abcde0', lat: 1, lon: 1, alt_baro: '35000', gs: '400', track: '90', seen_pos: 'now', squawk: 1200,
  }, {
    hex: 'abcde1', lat: 1, lon: 1, alt_baro: 'ground', gs: 12.34, track: 359.99, squawk: '7700',
  }] }, { lat: 1, lon: 1 });
  const [a, b, c] = out.aircraft;
  assert.deepEqual([a.alt, a.gs, a.track, a.seen], [null, null, null, null]);
  assert.deepEqual([b.alt, b.gs, b.track, b.seen, b.squawk], [null, null, null, null, null]);
  assert.deepEqual([c.alt, c.gs, c.track, c.squawk], ['ground', 12.3, 359.99, '7700']);
});

test('duplicate ids are kept once', () => {
  const out = trimAircraft({ ac: [{ hex: 'abcdef', lat: 1, lon: 1 }, { hex: 'ABCDEF', lat: 2, lon: 2 }] }, { lat: 1, lon: 1 });
  assert.equal(out.aircraft.length, 1);
});

test('unknown fields and prototype tricks are never passed on', () => {
  const raw = '{"ac":[{"hex":"abcdef","lat":1,"lon":1,"__proto__":{"admin":true},"constructor":"x","messages":5,"rssi":-3,"evil":"<script>"}]}';
  const out = trimAircraft(JSON.parse(raw), { lat: 1, lon: 1 });
  assert.equal(out.aircraft.length, 1);
  assert.equal(Object.hasOwn(out.aircraft[0], 'evil'), false);
  assert.equal(Object.hasOwn(out.aircraft[0], 'messages'), false);
  assert.equal(({}).admin, undefined);
});

test('a reply of thousands of aircraft is cut to the nearest 1000 and says so', async () => {
  const many = { ac: Array.from({ length: 4000 }, (_, i) => ({ hex: (0x100000 + i).toString(16), lat: 50 + i / 1000, lon: -105 })) };
  const { handle } = setup({ upstream: fakeUpstream(JSON.stringify(many)) });
  const res = await handle(get(GOOD));
  const text = await res.text();
  const body = JSON.parse(text);
  assert.equal(body.count, MAX_AIRCRAFT);
  assert.equal(body.aircraft.length, 1000);
  assert.equal(body.truncated, true);
  assert.ok(body.aircraft[0].lat < body.aircraft[999].lat);
  assert.ok(text.length <= MAX_REPLY_BYTES);
});

test('the reply itself never passes 1 MB, whatever the aircraft carry', () => {
  const ac = Array.from({ length: 2000 }, (_, i) => ({
    hex: (0x200000 + i).toString(16), lat: 1 + i / 1e4, lon: 1, flight: 'ABCDEFGH', r: 'C-ABCDEFGH', t: 'B738',
    alt_baro: 35000, gs: 400.123456, track: 123.456789, squawk: '1234', seen_pos: 1.23456,
  }));
  const out = trimAircraft({ ac }, { lat: 1, lon: 1 }, { maxAircraft: 2000, maxBytes: 100_000 });
  assert.ok(JSON.stringify(out).length <= 100_000);
  assert.equal(out.truncated, true);
  assert.ok(out.aircraft.length > 100);
});

test('an upstream body over the size cap is refused, not read to the end', async () => {
  const huge = '{"ac":[' + '{"hex":"abcdef","lat":1,"lon":1},'.repeat(400_000) + '{}]}'; // about 14 MB
  const { handle } = setup({ upstream: fakeUpstream(huge) });
  const res = await handle(get(GOOD));
  assert.equal(res.status, 502);
  assert.deepEqual(await json(res), { error: 'upstream reply unusable' });
});

test('an upstream that announces a huge content-length is refused', async () => {
  const { handle } = setup({ upstream: fakeUpstream(SAMPLE, { headers: { 'content-length': '99999999' } }) });
  assert.equal((await handle(get(GOOD))).status, 502);
});

test('wrong-shape or unreadable upstream replies give a generic error, with none of their text', async () => {
  const replies = [
    'not json <script>alert(1)</script>', '', '[]', 'null', '"ac"', '{"ac":"<script>"}', '{"ac":{"hex":"abcdef"}}', '{"msg":"<script>x</script>"}',
  ];
  for (const r of replies) {
    const { handle } = setup({ upstream: fakeUpstream(r) });
    const res = await handle(get(GOOD));
    const text = await res.text();
    assert.equal(res.status, 502, r);
    assert.equal(text, '{"error":"upstream reply unusable"}', r);
  }
});

test('an empty list of aircraft (ac null or []) is a valid, empty reply', async () => {
  for (const r of ['{"ac":[]}', '{"ac":null}']) {
    const { handle } = setup({ upstream: fakeUpstream(r) });
    const res = await handle(get(GOOD));
    assert.equal(res.status, 200);
    assert.deepEqual((await json(res)).aircraft, []);
  }
});

test('upstream failing (HTTP error, thrown, timeout) is a 502 with no detail and is not cached', async () => {
  for (const failure of [new Error('boom secret-host.internal'), new DOMException('timed out', 'TimeoutError')]) {
    const { handle } = setup({ upstream: fakeUpstream(failure) });
    const res = await handle(get(GOOD));
    assert.equal(res.status, 502);
    assert.equal(await res.text(), '{"error":"upstream unavailable"}');
  }
  let n = 0;
  const flaky = async () => (++n === 1 ? new Response('busy', { status: 503 }) : new Response(SAMPLE));
  const { handle } = setup({ upstream: flaky });
  assert.equal((await handle(get(GOOD))).status, 502);
  assert.equal((await handle(get(GOOD))).status, 200);
});

// --- Cache ------------------------------------------------------------------

test('one upstream request per 5 seconds, however many screens ask', async () => {
  const { handle, upstream, clock } = setup();
  assert.equal(CACHE_MS, 5000);
  for (let i = 0; i < 20; i++) assert.equal((await handle(get(GOOD))).status, 200);
  assert.equal(upstream.calls.length, 1);
  clock.t += 4999;
  await handle(get(GOOD));
  assert.equal(upstream.calls.length, 1);
  clock.t += 2;
  await handle(get(GOOD));
  assert.equal(upstream.calls.length, 2);
});

test('nearby requests share an answer; a different place or radius is its own', async () => {
  const { handle, upstream } = setup();
  await handle(get('?lat=50.331&lon=-105.561&nm=100'));
  await handle(get('?lat=50.334&lon=-105.556&nm=100'));
  assert.equal(upstream.calls.length, 1);
  await handle(get('?lat=51&lon=-105.56&nm=100'));
  await handle(get('?lat=50.33&lon=-105.56&nm=50'));
  assert.equal(upstream.calls.length, 3);
});

test('a cached answer keeps its own time, and carries the CORS header of whoever asks now', async () => {
  const { handle, clock } = setup();
  const first = await json(await handle(get(GOOD, { origin: SITE })));
  clock.t += 3000;
  const res = await handle(get(GOOD, { origin: 'http://localhost:5173' }));
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await json(res)).now, first.now);
});

test('the memory cache holds a bounded number of entries', async () => {
  const clock = { t: NOW };
  const cache = createMemoryCache({ now: () => clock.t, max: 3 });
  for (let i = 0; i < 10; i++) await cache.put(`k${i}`, new Response(String(i)));
  assert.equal(cache.size, 3);
  assert.equal(await cache.match('k0'), undefined);
  assert.equal(await (await cache.match('k9')).text(), '9');
});

test('a Cache API style cache is used when given, and updated through ctx.waitUntil', async () => {
  const store = new Map();
  const cache = {
    match: async (req) => store.get(req.url)?.clone(),
    put: async (req, res) => void store.set(req.url, res),
  };
  const waited = [];
  const upstream = fakeUpstream();
  const handle = createHandler({ fetch: upstream, cache, now: () => NOW });
  const ctx = { waitUntil: (p) => waited.push(p) };
  const res = await handle(get(GOOD), {}, ctx);
  assert.equal(res.status, 200);
  await Promise.all(waited);
  assert.equal(waited.length, 1);
  assert.equal(store.size, 1);
  assert.match([...store.keys()][0], /\/traffic\?lat=50\.33&lon=-105\.56&nm=100$/);
  await handle(get(GOOD), {}, ctx);
  assert.equal(upstream.calls.length, 1);
});

// --- CORS -------------------------------------------------------------------

test('the live site origin and local development are the default allowed origins', () => {
  assert.equal(DEFAULT_ORIGINS[0], SITE);
  assert.deepEqual([...DEFAULT_ORIGINS], [SITE, 'http://localhost:5173', 'http://127.0.0.1:5173']);
});

test('CORS: an allowed origin is echoed, never a wildcard, and Vary says so', async () => {
  const { handle } = setup();
  for (const origin of DEFAULT_ORIGINS) {
    const res = await handle(get(GOOD, { origin }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), origin);
    assert.match(res.headers.get('vary'), /origin/i);
    assert.equal(res.headers.get('access-control-allow-credentials'), null);
  }
});

test('CORS: another site is refused before anything is fetched', async () => {
  const { handle, upstream } = setup();
  for (const origin of ['https://evil.example', 'https://lizardhands-commits.github.io.evil.example', 'http://lizardhands-commits.github.io', 'null', SITE + '/', 'https://LIZARDHANDS-commits.github.io.']) {
    const res = await handle(get(GOOD, { origin }));
    assert.equal(res.status, 403, origin);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(upstream.calls.length, 0);
});

test('a request with no Origin (curl, a health check) is answered without a CORS header', async () => {
  const { handle } = setup();
  const res = await handle(get(GOOD));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('CORS preflight answers 204 for an allowed origin and 403 for others', async () => {
  const { handle, upstream } = setup();
  const pre = (origin) => new Request(`https://relay.example/traffic${GOOD}`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET' } });
  const ok = await handle(pre(SITE));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE);
  assert.equal(ok.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  assert.ok(Number(ok.headers.get('access-control-max-age')) > 0);
  assert.equal((await handle(pre('https://evil.example'))).status, 403);
  assert.equal(upstream.calls.length, 0);
});

test('env.ALLOWED_ORIGINS replaces the defaults; bad entries are ignored', async () => {
  const { handle } = setup();
  const env = { ALLOWED_ORIGINS: 'https://staging.example, not a url, https://a.example/path, javascript:alert(1)' };
  assert.equal((await handle(get(GOOD, { origin: 'https://staging.example' }), env)).status, 200);
  assert.equal((await handle(get(GOOD, { origin: SITE }), env)).status, 403);
  // An env value with nothing usable falls back to the defaults, never to "allow all".
  assert.equal((await handle(get(GOOD, { origin: SITE }), { ALLOWED_ORIGINS: '*, ,' })).status, 200);
  assert.equal((await handle(get(GOOD, { origin: 'https://evil.example' }), { ALLOWED_ORIGINS: '*' })).status, 403);
});

test('errors carry the CORS header for an allowed origin so the page can read them', async () => {
  const { handle } = setup();
  const res = await handle(get('?lat=999&lon=0', { origin: SITE }));
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('access-control-allow-origin'), SITE);
});

// --- The Worker entry point -------------------------------------------------

test('the default export is a Worker with fetch(request, env, ctx)', async () => {
  assert.equal(typeof worker.fetch, 'function');
  const res = await worker.fetch(get('?lat=999&lon=0'), {}, { waitUntil() {} });
  assert.equal(res.status, 400);
});

test('nothing is logged about who asked', async () => {
  const seen = [];
  const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of Object.keys(original)) console[k] = (...a) => seen.push(a);
  try {
    const { handle } = setup({ upstream: fakeUpstream(new Error('x')) });
    await handle(get(GOOD, { origin: 'https://evil.example', 'cf-connecting-ip': '203.0.113.9' }));
    await handle(get(GOOD, { origin: SITE, 'cf-connecting-ip': '203.0.113.9' }));
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(seen, []);
});

// --- Audit fixes ------------------------------------------------------------

test('the entry point exports only the Worker (helpers live in lib.js)', async () => {
  const mod = await import('../../../relay/traffic.js');
  assert.deepEqual(Object.keys(mod), ['default']);
});

test('the 5 s cache holds even when caches.default stores nothing (workers.dev)', async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: { match: async () => undefined, put: async () => {} } } });
  try {
    const clock = { t: NOW };
    const upstream = fakeUpstream();
    const handle = createHandler({ fetch: upstream, now: () => clock.t });
    for (let i = 0; i < 10; i++) await handle(get(GOOD));
    assert.equal(upstream.calls.length, 1);
    clock.t += CACHE_MS + 1;
    await handle(get(GOOD));
    assert.equal(upstream.calls.length, 2);
  } finally {
    if (had) Object.defineProperty(globalThis, 'caches', had);
    else delete globalThis.caches;
  }
});

test('an upstream redirect is a 502 and is not followed', async () => {
  const upstream = async (url, options) => {
    upstream.calls.push({ url, options });
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } });
  };
  upstream.calls = [];
  const { handle } = setup({ upstream });
  const res = await handle(get(GOOD));
  assert.equal(res.status, 502);
  assert.equal(await res.text(), '{"error":"upstream unavailable"}');
  assert.equal(upstream.calls.length, 1);
});

test('a list longer than the scan limit says truncated, even if few aircraft were valid', () => {
  const ac = [{ hex: 'abcdef', lat: 1, lon: 1 }, ...Array.from({ length: 5100 }, () => null)];
  const out = trimAircraft({ ac }, { lat: 1, lon: 1 });
  assert.equal(out.count, 1);
  assert.equal(out.truncated, true);
  assert.equal(trimAircraft({ ac: ac.slice(0, 50) }, { lat: 1, lon: 1 }).truncated, false);
});
