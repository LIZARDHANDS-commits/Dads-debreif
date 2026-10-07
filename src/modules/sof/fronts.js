// Surface fronts and pressure centres for the SOF's 3D view (SPEC-sof, "3D view", decision SOF-42; Dad, 7 Oct): our relay's /fronts (the US Weather Prediction Center's
// coded surface analysis, CODSUS, through relay/wx.js), the checks on its reply, and the loop that asks again every 30 minutes while the 3D view is open. The model is
// pure (the clock, `fetch` and the timers come in); fronts3d.js draws what comes out of here.
//
// The reply is untrusted, even from our own relay: it is size capped, every field is checked for type, range and pattern, a front or a centre that fails is dropped, and a
// reply with the wrong shape is a failure. Positions in the bulletin are whole degrees, so a front is drawn only about a degree (60 NM) true, and the view says so.
//
// Failure and stale behaviour: a failed fetch keeps the last good answer, which is drawn while it is under FRONTS_STALE_MS old by its own valid time; older than that, or with
// no good answer, no fronts are drawn (never old ones frozen) and the view says "Fronts unavailable" with the last good valid time. Fronts raise no caution and check no limit.
import { guardedFetch, bytesToText, FETCH_LIMITS } from './map-fetch.js';
import { relayOrigin } from './traffic.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** Asked this often while the 3D view is open (Dad, 7 Oct: every 30 minutes), or this soon after a failure (an estimate). */
export const FRONTS_REFRESH_MS = 30 * MINUTE_MS;
export const FRONTS_RETRY_MS = 2 * MINUTE_MS;
/** The analysis comes every 3 hours; one whose valid time is older than this is not drawn. An estimate (three analyses missed), not from a source. */
export const FRONTS_STALE_MS = 9 * HOUR_MS;
const TICK_MS = 30_000;

/** The kinds the coded bulletin has, with the words the key uses. */
export const FRONT_KINDS = Object.freeze({
  COLD: 'Cold front',
  WARM: 'Warm front',
  STNRY: 'Stationary front',
  OCFNT: 'Occluded front',
  TROF: 'Trough',
});
const MAX_FRONTS = 300;
const MAX_POINTS = 200;
const MAX_CENTRES = 100;
const MAX_REPLY_CHARS = 256 * 1024;
const VALID = /^(\d{2})(\d{2})(\d{2})Z$/; // the bulletin's own valid time: month, day and hour, "100703Z" is 7 Oct 03Z

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, key) => (Object.hasOwn(o, key) ? o[key] : undefined);
const two = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The bulletin's valid time ("100703Z", month day hour) as milliseconds: the year is `now`'s, or last year's when that would be in the future; null when it is not a time. */
export function readValid(text, now) {
  const m = typeof text === 'string' ? VALID.exec(text.trim()) : null;
  if (!m) return null;
  const [month, day, hour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null;
  const year = new Date(+now).getUTCFullYear();
  let t = Date.UTC(year, month - 1, day, hour);
  if (new Date(t).getUTCMonth() !== month - 1) return null; // 31 Nov and the like
  if (t > +now + 12 * HOUR_MS) t = Date.UTC(year - 1, month - 1, day, hour);
  return t;
}

/** "0300Z 7 Oct". */
export const validWords = (ms) => {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

const readPoint = (p) => {
  if (!Array.isArray(p) || p.length !== 2 || !isNumber(p[0]) || !isNumber(p[1])) return null;
  const [lat, lon] = p;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? [lat, lon] : null;
};

/**
 * The relay's /fronts reply (parsed, or JSON text) checked and rebuilt: { valid (ms, or null when the bulletin's time is not readable), highs: [{ hPa, lat, lon }], lows,
 * fronts: [{ type, points: [[lat, lon], ...] }] }. A front needs a known type and at least two good points (a bad point drops the front); a centre needs a pressure from 850
 * to 1100 hPa and a place. Anything else is dropped; a reply of the wrong shape is null. Never throws.
 */
export function readFronts(input, { now = Date.now() } = {}) {
  try {
    let json = input;
    if (typeof input === 'string') {
      if (input.length > MAX_REPLY_CHARS) return null;
      json = JSON.parse(input);
    }
    if (!isObject(json)) return null;
    const fronts = own(json, 'fronts');
    const highs = own(json, 'highs');
    const lows = own(json, 'lows');
    if (!Array.isArray(fronts) || !Array.isArray(highs) || !Array.isArray(lows)) return null;
    const outFronts = [];
    for (const f of fronts.slice(0, MAX_FRONTS)) {
      if (!isObject(f)) continue;
      const type = own(f, 'type');
      const points = own(f, 'points');
      if (typeof type !== 'string' || !Object.hasOwn(FRONT_KINDS, type) || !Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS) continue;
      const good = points.map(readPoint);
      if (good.some((p) => p === null)) continue;
      outFronts.push({ type, points: good });
    }
    const centres = (list) => list.slice(0, MAX_CENTRES).flatMap((c) => {
      if (!isObject(c)) return [];
      const hPa = own(c, 'hPa');
      const lat = own(c, 'lat');
      const lon = own(c, 'lon');
      return isNumber(hPa) && hPa >= 850 && hPa <= 1100 && isNumber(lat) && isNumber(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? [{ hPa: Math.round(hPa), lat, lon }] : [];
    });
    return { valid: readValid(own(json, 'valid'), now), highs: centres(highs), lows: centres(lows), fronts: outFronts };
  } catch {
    return null;
  }
}

/** `<relay>/fronts`, or null with no good relay address. */
export function frontsUrl(baseUrl) {
  const origin = relayOrigin(baseUrl);
  return origin ? `${origin}/fronts` : null;
}

export const FRONTS_CREDIT = 'Fronts (WPC, whole-degree positions)';

/**
 * What the view shows at `at`, from the feed's state ({ relay, lastGood: { data, receivedAt } | null, failed, busy }): { status: 'ok' | 'unavailable' | 'loading' | 'unset', data, words }.
 * 'ok': a good answer whose valid time is under FRONTS_STALE_MS old (a bulletin with no readable time counts from when it arrived); `words` is "Fronts valid 0300Z 7 Oct".
 * 'unavailable': the failed or old case, `words` "Fronts unavailable (last good valid 0300Z 7 Oct)", and nothing drawn. 'unset': no relay address.
 */
export function frontsView(state, at) {
  if (!state.relay) return { status: 'unset', data: null, words: 'Fronts need the relay address in SOF settings' };
  const good = state.lastGood;
  const since = good ? (good.data.valid ?? good.receivedAt) : null;
  const last = good ? validWords(since) : 'none yet';
  const old = !good || +at - since > FRONTS_STALE_MS;
  if (!good && !state.failed) return { status: 'loading', data: null, words: 'Loading fronts…' };
  if (old || state.failed) {
    // A refresh that failed while the answer held is still young enough is drawn, and says so.
    if (!old) return { status: 'ok', data: good.data, words: `Fronts valid ${last}, refresh failed` };
    return { status: 'unavailable', data: null, words: `Fronts unavailable (last good valid ${last})` };
  }
  return { status: 'ok', data: good.data, words: `Fronts valid ${last}` };
}

/**
 * The loop: asks the relay's /fronts through `address()` (frontsUrl, or null when no relay is set) once `start()` is called, and every FRONTS_REFRESH_MS after,
 * with the SOF's request limits (timeout, byte cap, no cookies). A failed ask keeps the last good answer and tries again after FRONTS_RETRY_MS. It is started only while
 * the 3D view is shown; stop() ends the request and the timer, and the answer held stays for when the view is opened again.
 * Returns { start(), stop(), wake(), state() } (state: { relay, lastGood, failed, busy }).
 */
export function createFrontsFeed({ address, paused = () => false, fetch, timers, now = () => new Date(), onChange = () => {} }) {
  let lastGood = null;
  let failed = false;
  let busy = false;
  let askedAt = null;
  let askedUrl = null;
  let running = false;
  let cancelTick = null;
  let controller = new AbortController();

  const changed = () => {
    if (running) onChange();
  };

  async function ask(url) {
    askedUrl = url;
    askedAt = +now();
    busy = true;
    const mine = controller;
    changed();
    let text = null;
    try {
      const reply = await guardedFetch(fetch, url, { timers, signal: mine.signal, accept: 'application/json', ...FETCH_LIMITS.fronts });
      text = bytesToText(reply.bytes);
    } catch {
      if (mine.signal.aborted || !running) return;
    }
    if (mine !== controller || !running) return;
    busy = false;
    const data = text === null ? null : readFronts(text, { now: +now() });
    if (data) {
      lastGood = { data, receivedAt: +now() };
      failed = false;
    } else failed = true;
    changed();
  }

  function tick() {
    if (!running || busy || paused()) return;
    const url = address();
    if (!url) return;
    if (askedAt === null || url !== askedUrl || +now() - askedAt >= (failed ? FRONTS_RETRY_MS : FRONTS_REFRESH_MS)) ask(url);
  }

  return {
    start() {
      if (running) return;
      running = true;
      cancelTick = timers.every(TICK_MS, tick);
      tick();
      changed();
    },
    stop() {
      if (!running) return;
      running = false;
      cancelTick?.();
      cancelTick = null;
      controller.abort();
      controller = new AbortController();
      if (busy) askedAt = null;
      busy = false;
    },
    wake: tick,
    state: () => ({ relay: address() !== null, lastGood, failed, busy }),
  };
}
