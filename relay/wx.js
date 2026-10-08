// Two more relay answers for the SOF (Dad, 7 Oct 2026), beside the traffic one in lib.js:
//   GET /notam?sites=CYMJ,CYQR   NOTAMs from NAV CANADA's flight weather site (plan.navcanada.ca), which a page cannot read
//                                directly (no CORS header, seen 7 Oct 2026).
//   GET /alerts?sites=CYMJ,...   SIGMETs, AIRMETs and PIREPs near those sites from the same NAV CANADA source.
//   GET /fronts                  The US Weather Prediction Center's coded surface fronts bulletin (CODSUS), public domain,
//                                from tgftp.nws.noaa.gov; also unreadable by a page directly.
// Same rules as the traffic relay: only fixed upstream addresses, checked query values, size caps, every upstream field
// rebuilt from an allowlist, only the allowed origins may read it, nothing stored or logged. Upstream text is passed on as
// text only (never markup); the page treats it as untrusted.
//
// US sites (plan Step 2c part E, 8 Oct 2026): /notam and /alerts route each asked site by its first letter. K sites go to the
// US sources in us-wx.js (the FAA NOTAM API, which needs FAA_CLIENT_ID and FAA_CLIENT_SECRET in the relay's environment, and
// aviationweather.gov's SIGMETs, G-AIRMETs and PIREPs); every other site goes to NAV CANADA exactly as before. An answer names in
// `sites` only the fields it has answered for; a field it could not answer is left out (the page then says "unavailable", never
// "none") and, for a missing FAA key, listed in `unavailable` with the reason. A request with only K sites and no FAA key gets
// 503 { error: 'FAA NOTAM key not set' }.

import { allowedOrigins, reply, readCapped } from './lib.js';
import { askAwc, askFaa, faaKey, FAA_KEY_NOT_SET } from './us-wx.js';

const USER_AGENT = 'DadsOODALoop-SOF-relay/1.0 (+https://github.com/LIZARDHANDS-commits/Dads-debreif)';
const TIMEOUT_MS = 10_000;
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;

const NOTAM_UPSTREAM = 'https://plan.navcanada.ca/weather/api/alpha/';
const FRONTS_UPSTREAM = 'https://tgftp.nws.noaa.gov/data/raw/as/asus01.kwbc.cod.sus.txt';
/** How long one answer is kept (estimates): NOTAMs change rarely, the fronts bulletin every 3 hours. */
export const NOTAM_CACHE_MS = 5 * 60 * 1000;
export const FRONTS_CACHE_MS = 15 * 60 * 1000;
export const MAX_SITES = 8;
export const MAX_NOTAMS = 300;
const MAX_TEXT = 4000;

const ICAO = /^[A-Z]{4}$/;
const NOTAM_ID = /^[A-Z]\d{4}\/\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** Checks ?sites=: 1 to MAX_SITES four-letter ICAO ids, nothing else. Returns { ok, sites } or { ok: false, error }. */
export function parseSites(url) {
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== 'sites') return { ok: false, error: 'only sites is accepted' };
  const sites = (url.searchParams.get('sites') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (!sites.length || sites.length > MAX_SITES || !sites.every((s) => ICAO.test(s))) return { ok: false, error: `sites must be 1 to ${MAX_SITES} ICAO ids` };
  return { ok: true, sites: [...new Set(sites)].sort() };
}

/** Plain printable text, capped; anything else becomes null. */
const cleanText = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.replace(/[^\x20-\x7E\n]/g, '').slice(0, max) : null);

/** NAV CANADA's reply rebuilt: [{ id, location, start, end, raw }] for the asked sites only; anything malformed is dropped. */
export function trimNotams(upstream, sites) {
  if (!upstream || typeof upstream !== 'object' || !Array.isArray(upstream.data)) return null;
  const want = new Set(sites);
  const out = [];
  for (const n of upstream.data.slice(0, 2000)) {
    if (!n || n.type !== 'notam' || typeof n.location !== 'string' || !want.has(n.location)) continue;
    let raw = null;
    try {
      raw = cleanText(JSON.parse(typeof n.text === 'string' ? n.text : 'null')?.raw);
    } catch {
      raw = null;
    }
    if (!raw) continue;
    const id = raw.match(/\(([A-Z]\d{4}\/\d{2})/)?.[1] ?? null;
    out.push({
      id: id && NOTAM_ID.test(id) ? id : null,
      location: n.location,
      start: typeof n.startValidity === 'string' && ISO.test(n.startValidity) ? n.startValidity : null,
      end: typeof n.endValidity === 'string' && ISO.test(n.endValidity) ? n.endValidity : null,
      raw,
    });
    if (out.length >= MAX_NOTAMS) break;
  }
  return out;
}

/**
 * The CODSUS bulletin parsed: { valid, highs: [{ hPa, lat, lon }], lows: [...], fronts: [{ type, points: [[lat, lon], ...] }] }.
 * Positions are whole degrees as the bulletin codes them ("3880" = 38N 80W, "45104" = 45N 104W; all west longitudes, north
 * latitudes). Types: COLD, WARM, STNRY, OCFNT, TROF. Lines it does not know are ignored.
 */
export function parseCodsus(text) {
  if (typeof text !== 'string' || !text.includes('CODSUS')) return null;
  const flat = text.replace(/\r/g, '').replace(/\n(?=\s*\d)/g, ' '); // continuation lines start with a number
  const pos = (code) => {
    if (!/^\d{4,5}$/.test(code)) return null;
    const lat = Number(code.slice(0, 2));
    const lon = -Number(code.slice(2));
    return lat <= 90 && lon >= -180 ? [lat, lon] : null;
  };
  const out = { valid: null, highs: [], lows: [], fronts: [] };
  for (const line of flat.split('\n')) {
    const words = line.trim().split(/\s+/);
    const kind = words[0];
    if (kind === 'VALID' && /^\d{6}Z$/.test(words[1] ?? '')) out.valid = words[1];
    else if (kind === 'HIGHS' || kind === 'LOWS') {
      for (let i = 1; i + 1 < words.length; i += 2) {
        const hPa = Number(words[i]);
        const p = pos(words[i + 1]);
        if (p && hPa > 850 && hPa < 1100) (kind === 'HIGHS' ? out.highs : out.lows).push({ hPa, lat: p[0], lon: p[1] });
      }
    } else if (['COLD', 'WARM', 'STNRY', 'OCFNT', 'TROF'].includes(kind)) {
      const points = words.slice(1).map(pos).filter(Boolean);
      if (points.length >= 2) out.fronts.push({ type: kind, points });
    }
    if (out.fronts.length > 500) break;
  }
  return out;
}

const ALERT_KINDS = Object.freeze(['sigmet', 'airmet', 'pirep']);
const LOCATION = /^[A-Z0-9]{4,12}$/;

/**
 * SIGMETs, AIRMETs and PIREPs rebuilt: [{ kind, location, start, end, text }]. The text is kept as plain text for the page to read
 * (a PIREP's position and level are in it); NAV CANADA gives SIGMET and AIRMET text the same way (not seen live on 7 Oct, when
 * none were in force, so a JSON-wrapped text is also accepted).
 */
export function trimAlerts(upstream) {
  if (!upstream || typeof upstream !== 'object' || !Array.isArray(upstream.data)) return null;
  const out = [];
  for (const n of upstream.data.slice(0, 2000)) {
    if (!n || !ALERT_KINDS.includes(n.type)) continue;
    let text = typeof n.text === 'string' ? n.text : null;
    if (text && text.trim().startsWith('{')) {
      try {
        const inner = JSON.parse(text);
        text = typeof inner?.raw === 'string' ? inner.raw : typeof inner?.text === 'string' ? inner.text : null;
      } catch {
        text = null;
      }
    }
    text = cleanText(text);
    if (!text) continue;
    out.push({
      kind: n.type,
      location: typeof n.location === 'string' && LOCATION.test(n.location) ? n.location : null,
      start: typeof n.startValidity === 'string' && ISO.test(n.startValidity) ? n.startValidity : null,
      end: typeof n.endValidity === 'string' && ISO.test(n.endValidity) ? n.endValidity : null,
      text,
    });
    if (out.length >= MAX_NOTAMS) break;
  }
  return out;
}

/** A reply that is not the expected shape (502 "upstream reply unusable"). */
class Unusable extends Error {}

/** One upstream ask: the reply's text, size-capped; throws on a failure. `headers` adds to the User-Agent (the FAA key's two headers, which go nowhere else). */
async function ask(fetchFn, url, headers = {}) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const res = await fetchFn(url, { method: 'GET', headers: { 'user-agent': USER_AGENT, ...headers }, redirect: 'manual', signal });
  if (!res.ok) throw new Error('upstream status');
  return readCapped(res, MAX_UPSTREAM_BYTES);
}

/** The asked sites split by country: K sites to the US sources, every other one to NAV CANADA as before. */
export const splitSites = (sites) => ({ us: sites.filter((s) => s.startsWith('K')), ca: sites.filter((s) => !s.startsWith('K')) });

/** NAV CANADA's NOTAMs for the non-K sites, as before: the list, or throws 'unusable' / a fetch error. */
async function askNavCanadaNotams(fetchFn, sites) {
  const list = trimNotams(JSON.parse(await ask(fetchFn, `${NOTAM_UPSTREAM}?${sites.map((s) => `site=${s}`).join('&')}&alpha=notam`)), sites);
  if (!list) throw new Unusable();
  return list;
}

/** NAV CANADA's SIGMETs, AIRMETs and PIREPs for the non-K sites, as before. */
async function askNavCanadaAlerts(fetchFn, sites) {
  const list = [];
  for (const kind of ALERT_KINDS) {
    const part = trimAlerts(JSON.parse(await ask(fetchFn, `${NOTAM_UPSTREAM}?${sites.map((s) => `site=${s}`).join('&')}&alpha=${kind}`)));
    if (!part) throw new Unusable();
    list.push(...part);
  }
  return list;
}

/** The error reply for a failed part: "upstream reply unusable" for a wrong shape, "upstream unavailable" otherwise (as before). */
const failure = (e, origin) => (e instanceof Unusable ? reply(502, { error: 'upstream reply unusable' }, { origin }) : reply(502, { error: 'upstream unavailable' }, { origin }));

/** One small in-memory cache per answer kind: key → { at, body }. */
function memo(ttlMs, now) {
  const store = new Map();
  return {
    get: (k) => {
      const hit = store.get(k);
      return hit && now() - hit.at < ttlMs ? hit.body : null;
    },
    put: (k, body) => {
      if (store.size > 50) store.clear();
      store.set(k, { at: now(), body });
    },
  };
}

/**
 * Handles /notam, /alerts and /fronts. Returns async (request, env) => Response. Never throws. `env` may carry ALLOWED_ORIGINS and the FAA key
 * (FAA_CLIENT_ID, FAA_CLIENT_SECRET), which are only ever sent to the FAA's own address.
 */
export function createWxHandler({ fetch: fetchFn = globalThis.fetch, now = Date.now } = {}) {
  const notams = memo(NOTAM_CACHE_MS, now);
  const fronts = memo(FRONTS_CACHE_MS, now);
  const alerts = memo(NOTAM_CACHE_MS, now);
  return async function handle(request, env = {}) {
    try {
      const sent = request.headers.get('origin');
      const origin = sent === null ? null : allowedOrigins(env).includes(sent) ? sent : undefined;
      if (origin === undefined) return reply(403, { error: 'origin not allowed' });
      if (request.method === 'OPTIONS') {
        return reply(204, null, { origin, extra: origin ? { 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' } : {} });
      }
      if (request.method !== 'GET') return reply(405, { error: 'GET only' }, { origin, extra: { allow: 'GET, OPTIONS' } });
      const url = new URL(request.url);

      if (url.pathname === '/notam') {
        const q = parseSites(url);
        if (!q.ok) return reply(400, { error: q.error }, { origin });
        const { us, ca } = splitSites(q.sites);
        const key = faaKey(env);
        // Only K sites and no FAA key: a plain 503, never an empty list (the page says "NOTAMs unavailable (FAA key not set)").
        if (us.length && !key && !ca.length) return reply(503, { error: FAA_KEY_NOT_SET }, { origin });
        const cacheKey = q.sites.join(',');
        let body = notams.get(cacheKey);
        if (!body) {
          const list = [];
          const answered = [];
          const unavailable = [];
          let lastError = null;
          if (ca.length) {
            try {
              list.push(...(await askNavCanadaNotams(fetchFn, ca)));
              answered.push(...ca);
            } catch (e) {
              if (!us.length) return failure(e, origin); // Canadian sites only: exactly as before
              lastError = e;
            }
          }
          if (us.length && !key) unavailable.push(...us.map((site) => ({ site, reason: FAA_KEY_NOT_SET })));
          else if (us.length) {
            try {
              const part = await askFaa((u, headers) => ask(fetchFn, u, headers), us, key);
              if (!part) throw new Unusable();
              list.push(...part);
              answered.push(...us);
            } catch (e) {
              lastError = e;
            }
          }
          if (!answered.length) return lastError ? failure(lastError, origin) : reply(503, { error: FAA_KEY_NOT_SET }, { origin });
          const sources = [ca.some((s) => answered.includes(s)) && 'NAV CANADA', us.some((s) => answered.includes(s)) && 'FAA NOTAM API'].filter(Boolean).join(', ');
          body = JSON.stringify({ source: sources, fetched: now(), sites: answered.sort(), notams: list, ...(unavailable.length ? { unavailable } : {}) });
          notams.put(cacheKey, body);
        }
        return reply(200, body, { origin, cache: 'public, max-age=60' });
      }

      if (url.pathname === '/alerts') {
        const q = parseSites(url);
        if (!q.ok) return reply(400, { error: q.error }, { origin });
        const { us, ca } = splitSites(q.sites);
        const cacheKey = q.sites.join(',');
        let body = alerts.get(cacheKey);
        if (!body) {
          const list = [];
          const answered = [];
          let lastError = null;
          if (ca.length) {
            try {
              list.push(...(await askNavCanadaAlerts(fetchFn, ca)));
              answered.push(...ca);
            } catch (e) {
              if (!us.length) return failure(e, origin); // Canadian sites only: exactly as before
              lastError = e;
            }
          }
          if (us.length) {
            try {
              const part = await askAwc((u) => ask(fetchFn, u), us, now());
              if (!part) throw new Unusable();
              list.push(...part);
              answered.push(...us);
            } catch (e) {
              lastError = e;
            }
          }
          if (!answered.length) return failure(lastError, origin);
          const sources = [ca.some((s) => answered.includes(s)) && 'NAV CANADA', us.some((s) => answered.includes(s)) && 'NOAA/NWS Aviation Weather Center'].filter(Boolean).join(', ');
          body = JSON.stringify({ source: sources, fetched: now(), sites: answered.sort(), alerts: list });
          alerts.put(cacheKey, body);
        }
        return reply(200, body, { origin, cache: 'public, max-age=60' });
      }

      if (url.pathname === '/fronts') {
        if ([...url.searchParams.keys()].length) return reply(400, { error: 'no query accepted' }, { origin });
        let body = fronts.get('all');
        if (!body) {
          let parsed;
          try {
            parsed = parseCodsus(await ask(fetchFn, FRONTS_UPSTREAM));
          } catch {
            return reply(502, { error: 'upstream unavailable' }, { origin });
          }
          if (!parsed) return reply(502, { error: 'upstream reply unusable' }, { origin });
          body = JSON.stringify({ source: 'NWS Weather Prediction Center (CODSUS)', fetched: now(), ...parsed });
          fronts.put('all', body);
        }
        return reply(200, body, { origin, cache: 'public, max-age=300' });
      }

      return reply(404, { error: 'not found' }, { origin });
    } catch {
      return reply(500, { error: 'relay error' });
    }
  };
}
