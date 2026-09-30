// The SOF's live-traffic layer, decided in Node (SPEC-sof, "Live traffic layer,
// through our own relay" and "Security"): the relay's reply read defensively,
// the request address, the layer's model (symbols, labels, stale fade, hover
// facts), the on/off and refresh state, and a signature for drawing only on
// change. Pure: no network, no timers, no DOM; the clock comes in as `now`
// (a Date or milliseconds). Drawing and the fetch loop are the map's (task 7b,
// map.js and index.js).
//
// The reply is untrusted even though it comes from our own relay: it is size
// capped, every field is checked again for type, range and pattern (the same
// patterns the relay uses, relay/lib.js), anything wrong becomes null or drops
// the aircraft, and no other field is carried. Text that survives is plain
// ASCII made of letters, digits and "-", and goes on the page as text only.

import { CATALOG, DEFAULT_HOME } from '../../airfields/catalog.js';

const SECOND_MS = 1000;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** The relay never sends more than this many aircraft (SPEC-sof), so neither do we draw more. */
export const MAX_AIRCRAFT = 1000;
const MAX_SCAN = 2 * MAX_AIRCRAFT; // entries looked at; the relay has already dropped what it could not read
const MAX_REPLY_CHARS = 1.25 * 1024 * 1024; // the relay's own cap is 1 MB

/**
 * The layer's fixed numbers and starting options.
 * - nm: search radius, V6's 100 NM (the relay takes 5 to 150).
 * - refreshMs: V6's 10 s.
 * - fadeStartS: positions older than this are stale (V6, 20 s); they fade over the next
 *   (fadeEndS - fadeStartS) seconds down to minOpacity, and are gone after goneAfterS
 *   (not in the spec, chosen so a failed relay never leaves frozen aircraft for long).

 * - unknownSeenOpacity: the most an aircraft is drawn at when the relay gave no age for its
 *   position, so an unknown age is never shown as fresh.
 * - label: labels off by default (SPEC-sof); militaryOnly: V6's "military only" choice, off.
 * - pendingLimitMs: a request out longer than this is given up on and asked again.
 */
export const TRAFFIC_DEFAULTS = Object.freeze({
  nm: 100,
  refreshMs: 10 * SECOND_MS,
  fadeStartS: 20,
  fadeEndS: 40,
  goneAfterS: 60,
  minOpacity: 0.25,
  unknownSeenOpacity: 0.5,
  label: 'off',
  militaryOnly: false,
  pendingLimitMs: 30 * SECOND_MS,
});

const NM_RANGE = Object.freeze({ min: 5, max: 150 }); // the relay's own range
const HEX = /^~?[0-9a-f]{6}$/i; // '~' marks a TIS-B target
const CALLSIGN = /^[A-Z0-9]{1,8}$/;
const REG = /^[A-Z0-9-]{1,10}$/;
const TYPE = /^[A-Z0-9]{2,4}$/;
const SQUAWK = /^[0-7]{4}$/;
const SOURCE = /^[a-z0-9][a-z0-9.-]{0,31}$/;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Own properties only, so nothing comes in through a prototype. */
const own = (o, key) => (Object.hasOwn(o, key) ? o[key] : undefined);
const ranged = (v, min, max) => (isNumber(v) && v >= min && v <= max ? v : null);
const rounded = (v, places) => (v == null ? null : Math.round(v * 10 ** places) / 10 ** places);
const text = (v, re) => {
  if (typeof v !== 'string' || v.length > 32) return null;
  const s = v.trim().toUpperCase();
  return re.test(s) ? s : null;
};
const ms = (t) => (t instanceof Date ? +t : t);
const inYears = (n) => isNumber(n) && n >= Date.UTC(MIN_YEAR, 0, 1) && n < Date.UTC(MAX_YEAR + 1, 0, 1);

// ---- Reading the reply ---------------------------------------------------------------------

function readOne(a) {
  if (!isObject(a)) return null;
  const hex = own(a, 'hex');
  if (typeof hex !== 'string' || !HEX.test(hex)) return null;
  const lat = ranged(own(a, 'lat'), -90, 90);
  const lon = ranged(own(a, 'lon'), -180, 180);
  if (lat === null || lon === null) return null;
  const alt = own(a, 'alt');
  const track = rounded(ranged(own(a, 'track'), 0, 360), 2);
  return {
    hex: hex.toLowerCase(),
    callsign: text(own(a, 'callsign'), CALLSIGN),
    reg: text(own(a, 'reg'), REG),
    type: text(own(a, 'type'), TYPE),
    lat: rounded(lat, 6),
    lon: rounded(lon, 6),
    alt: alt === 'ground' ? 'ground' : rounded(ranged(alt, -2000, 100000), 0),
    gs: rounded(ranged(own(a, 'gs'), 0, 2000), 1),
    track: track === 360 ? 0 : track,
    squawk: text(own(a, 'squawk'), SQUAWK),
    seen: rounded(ranged(own(a, 'seen'), 0, 3600), 1),
    mil: own(a, 'mil') === true,
  };
}

/**
 * The relay's reply (parsed, or JSON text) checked and rebuilt: `{ source, now, count,
 * truncated, aircraft }` with `aircraft` in the relay's order (nearest first), each
 * `{ hex, callsign, reg, type, lat, lon, alt, gs, track, squawk, seen, mil }` (alt is feet,
 * "ground" or null; anything else unreadable is null). Aircraft with a bad id or position,
 * or an id seen already, are dropped; at most MAX_AIRCRAFT are kept. `now` is the relay's
 * clock in ms. Returns null for anything that isn't the expected shape. Never throws.
 */
export function readReply(raw) {
  try {
    let json = raw;
    if (typeof raw === 'string') {
      if (raw.length > MAX_REPLY_CHARS) return null;
      json = JSON.parse(raw);
    }
    if (!isObject(json)) return null;
    const list = own(json, 'aircraft');
    const now = own(json, 'now');
    if (!Array.isArray(list) || !inYears(now)) return null;

    const seen = new Set();
    const kept = [];
    const scanned = Math.min(list.length, MAX_SCAN);
    for (let i = 0; i < scanned; i++) {
      const a = readOne(list[i]);
      if (!a || seen.has(a.hex)) continue;
      seen.add(a.hex);
      kept.push(a);
    }
    const aircraft = kept.slice(0, MAX_AIRCRAFT);
    const source = own(json, 'source');
    return {
      source: typeof source === 'string' && SOURCE.test(source) ? source : 'relay',
      now,
      count: aircraft.length,
      truncated: own(json, 'truncated') === true || kept.length > MAX_AIRCRAFT || list.length > MAX_SCAN,
      aircraft,
    };
  } catch {
    return null;
  }
}

// ---- The request address -------------------------------------------------------------------

/** https only, or http for local development; an origin with nothing after it. Returns the origin or null. */
function relayOrigin(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) return null;
  let url;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return null;
  }
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !local) return null;
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  return url.origin;
}

// Two places, and never "-0", as the relay rounds them so screens share one cached answer.
const place = (n) => Number(String(Math.round(n * 100) / 100)) + 0;

/**
 * The relay's request address, built from numbers only: `<relay>/traffic?lat=..&lon=..&nm=..`.
 * `baseUrl` is the build setting; without a good one (https, or http on localhost, and
 * nothing after the host) this returns null and the layer stays hidden. `lat` and `lon`
 * default to the default home field and are rounded to 0.01 degree; out of range gives
 * null. `nm` is rounded and kept within the relay's 5 to 150 (100 when it isn't a number).
 * @param {{ baseUrl?: any, lat?: any, lon?: any, nm?: any }} [input]
 */
export function trafficUrl({ baseUrl, lat = CATALOG[DEFAULT_HOME].lat, lon = CATALOG[DEFAULT_HOME].lon, nm = TRAFFIC_DEFAULTS.nm } = {}) {
  const origin = relayOrigin(baseUrl);
  if (!origin || ranged(lat, -90, 90) === null || ranged(lon, -180, 180) === null) return null;
  const radius = isNumber(nm) ? Math.min(NM_RANGE.max, Math.max(NM_RANGE.min, Math.round(nm))) : TRAFFIC_DEFAULTS.nm;
  return `${origin}/traffic?lat=${place(lat)}&lon=${place(lon)}&nm=${radius}`;
}

// ---- Words ---------------------------------------------------------------------------------

const thousands = (n) => String(Math.abs(n)).replace(/\B(?=(\d{3})+$)/g, ',');

/**
 * An altitude in words: "GND", "4,500 ft" (to the nearest 100) or "FL350" from 18,000 ft,
 * where Canada changes to the standard setting. Anything not a number is "altitude unknown".
 */
export function altitudeWords(alt) {
  if (alt === 'ground') return 'GND';
  if (!isNumber(alt)) return 'altitude unknown';
  const hundreds = Math.round(alt / 100);
  if (hundreds >= 180) return `FL${String(hundreds).padStart(3, '0')}`;
  return `${hundreds < 0 ? '-' : ''}${thousands(hundreds * 100)} ft`;
}

const trackWords = (t) => String(((Math.round(t) % 360) + 360) % 360).padStart(3, '0');

// ---- The stale fade ------------------------------------------------------------------------

/**
 * Opacity for a position `ageS` seconds old: fully drawn up to `fadeStartS`, then falling
 * in a straight line to `minOpacity` at `fadeEndS`, held there, and 0 (gone) after
 * `goneAfterS`. Steps of 0.05, so the picture only changes when it visibly does.
 * An age that isn't a number is gone.
 */
export function opacityForAge(ageS, { fadeStartS, fadeEndS, goneAfterS, minOpacity } = TRAFFIC_DEFAULTS) {
  if (!isNumber(ageS)) return 0;
  if (ageS > goneAfterS) return 0;
  if (ageS <= fadeStartS) return 1;
  if (ageS >= fadeEndS) return minOpacity;
  const t = (ageS - fadeStartS) / (fadeEndS - fadeStartS);
  return Math.round((1 - t * (1 - minOpacity)) * 20) / 20;
}

// ---- The layer model -----------------------------------------------------------------------

const LABELS = Object.freeze({
  off: () => [],
  callsign: (a) => [a.name],
  'callsign-altitude': (a) => [a.name, a.alt],
  full: (a) => [a.name, a.alt, a.gs, a.type],
});

function describe(a, facts) {
  const names = [a.callsign, a.reg, a.type].filter(Boolean).join(', ');
  const sentences = [
    names && `${names}.`,
    a.mil && 'Military aircraft.',
    ...facts.filter((f) => !['Callsign', 'Registration', 'Type'].includes(f.label)).map((f) => {
      if (f.label === 'Position age') return f.value === 'unknown' ? 'Position age unknown.' : `Position ${f.value} old.`;
      if (f.label === 'Altitude' && f.value === 'altitude unknown') return 'Altitude unknown.';
      return `${f.label} ${f.value}.`;
    }),
  ].filter(Boolean);
  return sentences.join(' ');
}

function present(a, { ageS, opacity, label }) {
  const altitudeText = altitudeWords(a.alt);
  const gsText = a.gs === null ? null : `${Math.round(a.gs)} kt`;
  const name = a.callsign ?? a.reg ?? a.hex.toUpperCase();
  const parts = LABELS[label]({ name, alt: a.alt === null ? null : altitudeText, gs: gsText, type: a.type });
  const facts = [
    a.callsign && { label: 'Callsign', value: a.callsign },
    a.reg && { label: 'Registration', value: a.reg },
    a.type && { label: 'Type', value: a.type },
    { label: 'Altitude', value: isNumber(a.alt) && altitudeText.endsWith(' ft') ? `${altitudeText} pressure altitude` : altitudeText },
    gsText && { label: 'Ground speed', value: gsText },
    a.track !== null && { label: 'Track', value: `${trackWords(a.track)}°` },
    a.squawk && { label: 'Squawk', value: a.squawk },
    { label: 'Position age', value: a.seen === null ? 'unknown' : `${Math.round(ageS)} s` },
  ].filter(Boolean);
  return {
    hex: a.hex,
    lat: a.lat,
    lon: a.lon,
    rotationDeg: a.track ?? 0,
    hasTrack: a.track !== null,
    onGround: a.alt === 'ground',
    altitudeFt: a.alt,
    altitudeWords: altitudeText,
    gs: a.gs,
    gsWords: gsText,
    callsign: a.callsign,
    reg: a.reg,
    type: a.type,
    squawk: a.squawk,
    mil: a.mil,
    label: parts.filter(Boolean).join(' '),
    opacity,
    ageS,
    facts,
    description: describe(a, facts),
  };
}

const EMPTY = Object.freeze({ ok: false, source: null, count: 0, truncated: false, replyAgeS: null, aircraft: Object.freeze([]) });

/**
 * What the map draws for one reply. `reply` is the relay's reply as received (checked
 * here, so pass it raw); `receivedAt` is when we got it (default: the reply's own time,
 * which trusts the relay's clock); `now` is the clock. Each aircraft is aged by its own
 * `seen` plus the reply's age, faded by `opacityForAge`, and left out once gone.
 * `label` is 'off' (default), 'callsign', 'callsign-altitude' or 'full'; anything else
 * is 'off'. `militaryOnly` (default false) keeps only marked aircraft.
 * Returns `{ ok, source, count, truncated, replyAgeS, aircraft }` where each aircraft is
 * `{ hex, lat, lon, rotationDeg, hasTrack, onGround, altitudeFt, altitudeWords, gs, gsWords,
 * callsign, reg, type, squawk, mil, label, opacity, ageS, facts: [{label, value}], description }`.
 * `ok` is false (and the list empty) when the reply or the clock can't be read.
 * @param {{ reply?: any, receivedAt?: any, now?: any, label?: string, militaryOnly?: boolean }} [input]
 */
export function layerModel({ reply, receivedAt, now, label = TRAFFIC_DEFAULTS.label, militaryOnly = TRAFFIC_DEFAULTS.militaryOnly } = {}) {
  const read = readReply(reply);
  const clock = ms(now);
  if (!read || !isNumber(clock)) return EMPTY;
  const at = isNumber(ms(receivedAt)) ? ms(receivedAt) : read.now;
  const replyAgeS = Math.max(0, (clock - at) / SECOND_MS);
  const chosen = Object.hasOwn(LABELS, label) ? label : TRAFFIC_DEFAULTS.label;
  const aircraft = [];
  for (const a of read.aircraft) {
    if (militaryOnly === true && !a.mil) continue;
    const ageS = Math.round(((a.seen ?? 0) + replyAgeS) * 10) / 10;
    // No age for the position: only the reply's is known, so it is never drawn solid.
    const opacity = a.seen === null ? Math.min(opacityForAge(ageS), TRAFFIC_DEFAULTS.unknownSeenOpacity) : opacityForAge(ageS);
    if (opacity === 0) continue;
    aircraft.push(present(a, { ageS, opacity, label: chosen }));
  }
  return { ok: true, source: read.source, count: aircraft.length, truncated: read.truncated, replyAgeS, aircraft };
}

// ---- Redraw signature ----------------------------------------------------------------------

/**
 * A short text that is the same for two views that would be drawn the same and differs
 * when they wouldn't: each aircraft's id, position (to about 10 m), rotation (whole
 * degrees), opacity, label, and its military and ground marks, plus the view's status if
 * it has one. Compare with the last drawn one; draw only when it changed.
 */
export function layerSignature(view) {
  const list = Array.isArray(view?.aircraft) ? view.aircraft : [];
  const rows = list.map((a) => [a.hex, a.lat.toFixed(4), a.lon.toFixed(4), Math.round(a.rotationDeg), a.opacity, a.label, a.mil ? 1 : 0, a.onGround ? 1 : 0].join(','));
  return `${view?.status ?? ''}|${rows.join(';')}`;
}

// ---- On, off and refreshing ----------------------------------------------------------------
// One plain object the caller keeps: { on, seq, pendingId, pendingSince, nextAt, lastGood, receivedAt, failed }.
// Each request gets a number (`pendingId`, from `seq`, which off and on again never resets), and an
// answer is taken only if it carries the number of the request that is out.
// Every function returns a new object and leaves the old one alone. Off keeps nothing, so
// there are no requests, no aircraft and no memory while the layer is off (R4).

/** The layer before it has been switched on. */
export const initialTraffic = () => ({ on: false, seq: 0, pendingId: null, pendingSince: null, nextAt: null, lastGood: null, receivedAt: null, failed: false });

/**
 * The layer switched on (asks at once) or off (forgets everything). The same object back if nothing changes.
 * @param {any} state
 * @param {any} on
 * @param {{ now?: any }} [input]
 */
export function setTrafficOn(state, on, { now } = {}) {
  const want = on === true;
  if (state?.on === want) return state;
  const seq = Number.isInteger(state?.seq) ? state.seq : 0; // kept, so an old answer can never match a new request
  return want ? { ...initialTraffic(), seq, on: true, nextAt: ms(now) } : { ...initialTraffic(), seq };
}

/** Whether to ask the relay now: on, nothing already out (or one out far too long), and the next time reached. */
export function trafficDue(state, now) {
  const t = ms(now);
  if (state?.on !== true || !isNumber(t)) return false;
  if (state.pendingId !== null) return t - state.pendingSince > TRAFFIC_DEFAULTS.pendingLimitMs;
  return isNumber(state.nextAt) && t >= state.nextAt;
}

/**
 * A request has gone out.
 * @param {any} state
 * @param {{ now?: any }} [input]
 */
export function trafficRequested(state, { now } = {}) {
  if (state?.on !== true) return state;
  const seq = state.seq + 1;
  return { ...state, seq, pendingId: seq, pendingSince: ms(now) };
}

/** Whether an answer with this `id` is for the request that is out (and the layer is still on). */
const answers = (state, id) => state?.on === true && state.pendingId !== null && id === state.pendingId;

/**
 * A failed request: keep the last good aircraft (they fade and go), try again in 10 s. `id` is the
 * `pendingId` of the request; an answer to any other request, or while off, is ignored.
 * @param {any} state
 * @param {{ now?: any, id?: any }} [input]
 */
export function trafficFailed(state, { now, id } = {}) {
  return answers(state, id) ? { ...state, failed: true, pendingId: null, pendingSince: null, nextAt: ms(now) + TRAFFIC_DEFAULTS.refreshMs } : state;
}

/**
 * The relay answered with `reply` (raw). A reply that can't be read counts as a failure.
 * A reply with no aircraft is a good answer. `id` is the `pendingId` of the request; it is ignored
 * while off or for any other request, so a late answer never brings the layer back.
 * @param {any} state
 * @param {{ reply?: any, now?: any, id?: any }} [input]
 */
export function trafficSucceeded(state, { reply, now, id } = {}) {
  if (!answers(state, id)) return state;
  const read = readReply(reply);
  if (!read) return trafficFailed(state, { now, id });
  const t = ms(now);
  return { ...state, lastGood: read, receivedAt: t, failed: false, pendingId: null, pendingSince: null, nextAt: t + TRAFFIC_DEFAULTS.refreshMs };
}

const two = (n) => String(n).padStart(2, '0');
const hhmmZ = (t) => { const d = new Date(t); return `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`; };
const agoWords = (secs) => (secs < 90 ? `${secs} s ago` : `${Math.round(secs / 60)} min ago`);

/**
 * What to draw and say now: `{ status, show, statusText, count, truncated, aircraft, signature, ... }`.
 * status is 'off', 'loading', 'ok' or 'unavailable'. After a failure the last good aircraft
 * are still listed while they fade, and go when too old, never frozen; `statusText` says
 * "Traffic unavailable, last good 1842Z". `label` and `militaryOnly` are `layerModel`'s.
 * `signature` is `layerSignature` of the result.
 * @param {any} state
 * @param {{ now?: any, label?: string, militaryOnly?: boolean }} [input]
 */
export function trafficView(state, { now, label, militaryOnly } = {}) {
  const t = ms(now);
  if (state?.on !== true) {
    const off = { status: 'off', show: false, statusText: '', ...EMPTY };
    return { ...off, signature: layerSignature(off) };
  }
  const model = state.lastGood
    ? layerModel({ reply: state.lastGood, receivedAt: state.receivedAt, now: t, label, militaryOnly })
    : EMPTY;
  const status = state.failed ? 'unavailable' : state.lastGood ? 'ok' : 'loading';
  let statusText;
  if (status === 'unavailable') statusText = `Traffic unavailable${state.lastGood ? `, last good ${hhmmZ(state.receivedAt)}` : ''}`;
  else if (status === 'loading') statusText = 'Traffic: loading…';
  else {
    const secs = Math.max(0, Math.floor((t - state.receivedAt) / SECOND_MS));
    const how = model.truncated ? `first ${MAX_AIRCRAFT}` : String(model.count);
    statusText = `Traffic: ${how} aircraft, ${agoWords(secs)}`;
  }
  const view = { ...model, status, show: true, statusText };
  return { ...view, signature: layerSignature(view) };
}
