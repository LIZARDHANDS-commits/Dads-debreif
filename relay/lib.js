// The SOF's live-traffic relay: a Cloudflare Worker (SPEC-sof, "Live traffic
// layer, through our own relay"). It answers one request,
//   GET /traffic?lat=..&lon=..&nm=..
// asks adsb.lol for the aircraft around that point, and sends back only the
// fields the map layer draws. No keys, nothing stored, nothing logged.
//
// Everything from adsb.lol is untrusted: it is size-capped, parsed as JSON,
// and rebuilt field by field from an allowlist, so no upstream text passes
// through as it came. The only address ever fetched is adsb.lol's /v2/point
// with three checked numbers in it. Fetch and the cache are passed in, so the
// tests run without a network.

const UPSTREAM = 'https://api.adsb.lol/v2/point';
// adsb.lol refuses a generic User-Agent ("include valid contact info", seen 7 Oct 2026), so the relay names itself and the project page.
const USER_AGENT = 'DadsOODALoop-SOF-traffic-relay/1.0 (+https://github.com/LIZARDHANDS-commits/Dads-debreif)';
const TIMEOUT_MS = 8000;

/** Origins allowed to read the relay from a browser: the live site and local development (vite's port). */
export const DEFAULT_ORIGINS = Object.freeze([
  'https://lizardhands-commits.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export const CACHE_MS = 5000;
export const MAX_AIRCRAFT = 1000;
export const MAX_REPLY_BYTES = 1024 * 1024;
// What we read from adsb.lol at most; a real 1000-aircraft reply is about 1.5 MB.
const MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;
const MAX_SCAN = 5000;
const DEFAULT_NM = 100; // V6's radius
/** The widest radius asked for: adsb.lol's and adsb.fi's own most (Dad, 8 Oct 2026; was 150). */
const MAX_NM = 250;
const MEMORY_ENTRIES = 200;

const NUM_LAT_LON = /^-?\d{1,3}(?:\.\d{1,6})?$/;
const NUM_NM = /^\d{1,3}(?:\.\d{1,3})?$/;
const HEX = /^~?[0-9a-f]{6}$/i; // '~' marks a TIS-B target
const CALLSIGN = /^[A-Z0-9]{1,8}$/;
const REG = /^[A-Z0-9-]{1,10}$/;
const TYPE = /^[A-Z0-9]{2,4}$/;
const SQUAWK = /^[0-7]{4}$/;

// --- The three numbers -------------------------------------------------------

function readNumber(value, pattern, min, max) {
  if (typeof value !== 'string' || value.length > 12 || !pattern.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/**
 * Check a request's query: lat -90..90, lon -180..180, nm 5..250 (100 when left out; 250 is adsb.lol's and adsb.fi's own most, and the SOF asks
 * for up to it when its 3D view is open: Dad, 8 Oct 2026, "can we draw aircraft further out from the base"; was 150),
 * nothing else. Lat and lon are rounded to 0.01 degree (about 1 km) and nm to a whole
 * number, so screens looking at the same place share one cached answer.
 * Returns { ok: true, lat, lon, nm } or { ok: false, error }.
 */
export function parseQuery(url = new URL('https://relay.invalid/traffic')) {
  const params = url.searchParams;
  const seen = new Set();
  for (const key of params.keys()) {
    if (!['lat', 'lon', 'nm'].includes(key) || seen.has(key)) return { ok: false, error: 'only lat, lon and nm are accepted, once each' };
    seen.add(key);
  }
  const lat = readNumber(params.get('lat'), NUM_LAT_LON, -90, 90);
  if (lat == null) return { ok: false, error: 'lat must be a number from -90 to 90' };
  const lon = readNumber(params.get('lon'), NUM_LAT_LON, -180, 180);
  if (lon == null) return { ok: false, error: 'lon must be a number from -180 to 180' };
  const nm = params.has('nm') ? readNumber(params.get('nm'), NUM_NM, 5, MAX_NM) : DEFAULT_NM;
  if (nm == null) return { ok: false, error: `nm must be a number from 5 to ${MAX_NM}` };
  // Number(String(x)) turns -0 into 0, so the address never reads "-0".
  const round2 = (x) => Number(String(Math.round(x * 100) / 100)) + 0;
  return { ok: true, lat: round2(lat), lon: round2(lon), nm: Math.round(nm) };
}

// --- Trimming the upstream reply --------------------------------------------

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const inRange = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const rounded = (v, places) => (v == null ? null : Math.round(v * 10 ** places) / 10 ** places);
const pattern = (v, re, upper = true) => {
  if (typeof v !== 'string') return null;
  const s = (upper ? v.trim().toUpperCase() : v.trim());
  return re.test(s) ? s : null;
};

function trimOne(a) {
  if (!isObject(a) || typeof a.hex !== 'string' || !HEX.test(a.hex)) return null;
  const lat = inRange(a.lat, -90, 90);
  const lon = inRange(a.lon, -180, 180);
  if (lat == null || lon == null) return null;
  // Barometric altitude first; when an aircraft sends none, its GPS (geometric) height, so a low aircraft is not lost (Dad, 7 Oct).
  const alt = a.alt_baro === 'ground' ? 'ground' : rounded(inRange(a.alt_baro, -2000, 100000) ?? inRange(a.alt_geom, -2000, 100000), 0);
  const track = rounded(inRange(a.track, 0, 360), 2);
  return {
    hex: a.hex.toLowerCase(),
    callsign: pattern(a.flight, CALLSIGN),
    reg: pattern(a.r, REG),
    type: pattern(a.t, TYPE),
    lat: rounded(lat, 6),
    lon: rounded(lon, 6),
    alt,
    gs: rounded(inRange(a.gs, 0, 2000), 1),
    track: track === 360 ? 0 : track,
    squawk: pattern(a.squawk, SQUAWK),
    // Age of the position, in seconds (readsb's seen_pos, else seen).
    seen: rounded(inRange(a.seen_pos, 0, 3600) ?? inRange(a.seen, 0, 3600), 1),
    // readsb's dbFlags bit 0 is "military".
    mil: Number.isInteger(a.dbFlags) && (a.dbFlags & 1) === 1,
    // The ADS-B emitter category (readsb `category`, A1 light to A7 rotorcraft) is NOT passed yet (8 Oct 2026): two relay tests compare an aircraft's whole
    // set of fields with the captured sample, which carries a category, so adding it needs those tests changed first (ask Patrick). The page reads it when it comes.
  };
}

/**
 * Rebuild adsb.lol's { ac: [...] } as a short, safe list: only known fields, each checked
 * for type, range and pattern (anything wrong becomes null, an aircraft with no valid id
 * or position is dropped), the nearest `maxAircraft` first, and no more than `maxBytes` of JSON.
 * Returns { aircraft, count, truncated }, or null when the reply isn't the expected shape.
 * Every value that survives is plain ASCII, so a string's length is its size in bytes.
 */
export function trimAircraft(upstream, center = {}, { maxAircraft = MAX_AIRCRAFT, maxBytes = MAX_REPLY_BYTES } = {}) {
  if (!isObject(upstream) || !('ac' in upstream)) return null;
  const list = upstream.ac === null ? [] : upstream.ac;
  if (!Array.isArray(list)) return null;

  const lat0 = Number.isFinite(center.lat) ? center.lat : 0;
  const lon0 = Number.isFinite(center.lon) ? center.lon : 0;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const away = (a) => (a.lat - lat0) ** 2 + ((a.lon - lon0) * kx) ** 2;

  const ids = new Set();
  const kept = [];
  const scanned = Math.min(list.length, MAX_SCAN);
  for (let i = 0; i < scanned; i++) {
    const a = trimOne(list[i]);
    if (!a || ids.has(a.hex)) continue;
    ids.add(a.hex);
    kept.push(a);
  }
  kept.sort((p, q) => away(p) - away(q));

  const aircraft = [];
  let bytes = 128; // room for the fields around the list
  for (const a of kept) {
    bytes += JSON.stringify(a).length + 1;
    if (aircraft.length >= maxAircraft || bytes > maxBytes) break;
    aircraft.push(a);
  }
  // Also truncated when the list was longer than we were willing to scan.
  return { aircraft, count: aircraft.length, truncated: aircraft.length < kept.length || list.length > MAX_SCAN };
}

// --- Cache -------------------------------------------------------------------

/**
 * A small in-memory cache with the Cache API's shape (match and put, keyed by a Request
 * or a string). Entries last `ttlMs`; at most `max` are kept, oldest first out.
 */
export function createMemoryCache({ now = Date.now, ttlMs = CACHE_MS, max = MEMORY_ENTRIES } = {}) {
  const entries = new Map();
  const keyOf = (k) => (typeof k === 'string' ? k : k.url);
  return {
    get size() {
      return entries.size;
    },
    async match(key) {
      const k = keyOf(key);
      const hit = entries.get(k);
      if (!hit) return undefined;
      if (now() - hit.at >= ttlMs) {
        entries.delete(k);
        return undefined;
      }
      return new Response(hit.body, { status: hit.status, headers: hit.headers });
    },
    async put(key, response) {
      const k = keyOf(key);
      entries.delete(k);
      entries.set(k, { at: now(), body: await response.text(), status: response.status, headers: [...response.headers] });
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
  };
}

// --- CORS and replies --------------------------------------------------------

/** The allowed origins: env.ALLOWED_ORIGINS (comma separated, exact origins only), else the defaults. */
export function allowedOrigins(env) {
  const wanted = typeof env?.ALLOWED_ORIGINS === 'string' ? env.ALLOWED_ORIGINS.split(',') : [];
  const good = [];
  for (const raw of wanted) {
    try {
      const u = new URL(raw.trim());
      if ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin === raw.trim()) good.push(u.origin);
    } catch {
      // Not a URL: ignored, never widened to "allow all".
    }
  }
  return good.length ? good : DEFAULT_ORIGINS;
}

export function reply(status, body, { origin = null, cache = 'no-store', extra = {}, vary = true } = {}) {
  /** @type {Record<string, string>} */
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
    ...extra,
  };
  if (vary) headers.vary = 'Origin';
  if (origin) headers['access-control-allow-origin'] = origin;
  return new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

// --- Upstream ----------------------------------------------------------------

class Unusable extends Error {}

export async function readCapped(res, max) {
  const announced = Number(res.headers.get('content-length'));
  if (announced > max) throw new Unusable('too large');
  if (!res.body) {
    const text = await res.text();
    if (text.length > max) throw new Unusable('too large');
    return text;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Unusable('too large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

// A second free network, asked as well when the site sets SECOND_FEED=adsb.fi (Dad, 7 Oct: low aircraft near Regina were missing from
// adsb.lol, whose volunteer receivers do not hear them). Its reply has the same readsb fields under "aircraft" instead of "ac".
const SECOND_UPSTREAM = 'https://opendata.adsb.fi/api/v2/lat';

async function askSecond(fetchFn, q) {
  const url = `${SECOND_UPSTREAM}/${q.lat}/lon/${q.lon}/dist/${q.nm}`;
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const res = await fetchFn(url, { method: 'GET', headers: { accept: 'application/json', 'user-agent': USER_AGENT }, redirect: 'manual', signal });
  if (!res.ok) throw new Error('second status');
  const parsed = JSON.parse(await readCapped(res, MAX_UPSTREAM_BYTES));
  return isObject(parsed) && Array.isArray(parsed.aircraft) ? parsed.aircraft : null;
}

/** Both networks merged by hex id, keeping whichever saw the aircraft more recently; either one alone if the other fails. */
async function askBoth(fetchFn, q) {
  const [lol, fi] = await Promise.allSettled([askRaw(fetchFn, q), askSecond(fetchFn, q)]);
  const a = lol.status === 'fulfilled' ? lol.value : null;
  const b = fi.status === 'fulfilled' ? fi.value : null;
  if (!a && !b) throw lol.reason ?? new Error('both feeds failed');
  const byHex = new Map();
  const age = (x) => (typeof x?.seen_pos === 'number' ? x.seen_pos : typeof x?.seen === 'number' ? x.seen : 999);
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    if (!isObject(x) || typeof x.hex !== 'string') continue;
    const k = x.hex.toLowerCase();
    const had = byHex.get(k);
    if (!had || age(x) < age(had)) byHex.set(k, x);
  }
  const trimmed = trimAircraft({ ac: [...byHex.values()] }, q);
  if (!trimmed) throw new Unusable('wrong shape');
  return trimmed;
}

async function askRaw(fetchFn, q) {
  const url = `${UPSTREAM}/${q.lat}/${q.lon}/${q.nm}`;
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const res = await fetchFn(url, { method: 'GET', headers: { accept: 'application/json', 'user-agent': USER_AGENT }, redirect: 'manual', signal });
  if (!res.ok) throw new Error('upstream status');
  const parsed = JSON.parse(await readCapped(res, MAX_UPSTREAM_BYTES));
  if (!isObject(parsed) || !Array.isArray(parsed.ac)) throw new Unusable('wrong shape');
  return parsed.ac;
}

async function askUpstream(fetchFn, q) {
  const url = `${UPSTREAM}/${q.lat}/${q.lon}/${q.nm}`;
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const res = await fetchFn(url, { method: 'GET', headers: { accept: 'application/json', 'user-agent': USER_AGENT }, redirect: 'manual', signal });
  if (!res.ok) throw new Error('upstream status');
  const text = await readCapped(res, MAX_UPSTREAM_BYTES);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Unusable('not json');
  }
  const trimmed = trimAircraft(parsed, q);
  if (!trimmed) throw new Unusable('wrong shape');
  return trimmed;
}

// --- The Worker --------------------------------------------------------------

/**
 * Build the request handler. `fetch` is adsb.lol's transport, `now` the clock in ms, and
 * `cache` a Cache API shaped second-level store (default: the Worker's own `caches.default`,
 * if there is one). The first level is always an in-memory cache in this handler, because
 * the Cache API stores nothing on workers.dev (it works only on custom domains and routes).
 * Returns async (request, env, ctx) => Response. Never throws.
 * @param {{ fetch?: typeof fetch, cache?: any, now?: () => number }} [deps]
 */
export function createHandler({ fetch: fetchFn = globalThis.fetch, cache, now = Date.now } = {}) {
  const memory = createMemoryCache({ now });
  const second = () => cache ?? /** @type {any} */ (globalThis.caches)?.default ?? null;

  return async function handle(request, env = {}, ctx = {}) {
    try {
      const sent = request.headers.get('origin');
      const origin = sent === null ? null : allowedOrigins(env).includes(sent) ? sent : undefined;
      if (origin === undefined) return reply(403, { error: 'origin not allowed' });

      if (request.method === 'OPTIONS') {
        return reply(204, null, {
          origin,
          extra: origin ? { 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' } : {},
        });
      }
      if (request.method !== 'GET') return reply(405, { error: 'GET only' }, { origin, extra: { allow: 'GET, OPTIONS' } });

      const url = new URL(request.url);
      if (url.pathname !== '/traffic') return reply(404, { error: 'not found' }, { origin });
      const q = parseQuery(url);
      if (!q.ok) return reply(400, { error: q.error }, { origin });

      const key = new Request(new URL(`/traffic?lat=${q.lat}&lon=${q.lon}&nm=${q.nm}`, url).href);
      const hit = (await memory.match(key)) ?? (await second()?.match(key));
      if (hit) return reply(200, await hit.text(), { origin, cache: `public, max-age=${CACHE_MS / 1000}` });

      let trimmed;
      try {
        trimmed = env?.SECOND_FEED === 'adsb.fi' ? await askBoth(fetchFn, q) : await askUpstream(fetchFn, q);
      } catch (e) {
        return e instanceof Unusable
          ? reply(502, { error: 'upstream reply unusable' }, { origin })
          : reply(502, { error: 'upstream unavailable' }, { origin });
      }
      const body = JSON.stringify({ source: 'adsb.lol', now: now(), ...trimmed });
      // The stored copies have no per-visitor headers; each answer adds its own CORS header.
      const stored = () => reply(200, body, { cache: `public, max-age=${CACHE_MS / 1000}`, vary: false });
      await memory.put(key, stored());
      const saving = second()?.put(key, stored());
      if (saving) {
        if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(saving.catch(() => {}));
        else await saving.catch(() => {});
      }
      return reply(200, body, { origin, cache: `public, max-age=${CACHE_MS / 1000}` });
    } catch {
      return reply(500, { error: 'relay error' });
    }
  };
}
