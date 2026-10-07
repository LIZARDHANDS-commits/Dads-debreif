// NOTAMs for home and the alternates (SPEC-sof, decisions SOF-42 and SOF-44; Dad, 7 Oct): the request to our relay's /notam, the checks on its
// reply, which NOTAMs are critical (a closed runway or aerodrome, an approach aid or the lighting out of service), the words for each airfield's
// card and its narrow row, and the loop that asks again every 5 minutes. The model is pure (the clock, `fetch` and the timers come in).
//
// The reply is untrusted, even from our own relay: it is size capped, every field is checked for type, length and pattern, and anything wrong
// drops that NOTAM or the whole reply. The NOTAM text is shown as text only, never as HTML.
//
// Safety rule (SOF-42): "No NOTAMs" is said only when a fresh good answer, which names the field among its sites, lists none for it. A failed
// fetch, an answer older than NOTAM_STALE_MS, or an answer that does not name the field says "NOTAMs unavailable (last good 0612Z)". With no
// relay address set it says where to put one. A NOTAM that is not yet in force is shown with its start; one that has ended is not shown.
import { guardedFetch, bytesToText, FETCH_LIMITS } from './map-fetch.js';
import { relayOrigin } from './traffic.js';

const MINUTE_MS = 60_000;
/** Asked this often while the SOF is open (Dad, 7 Oct: every 5 minutes). */
export const NOTAM_REFRESH_MS = 5 * MINUTE_MS;
/** An answer older than this is not shown as current: the card says "NOTAMs unavailable" with the time of the last good answer (SOF-42, "older than 30 minutes"). */
export const NOTAM_STALE_MS = 30 * MINUTE_MS;
/** A failed ask is tried again after this long (an estimate), and never faster than the normal refresh while it works. */
export const NOTAM_RETRY_MS = MINUTE_MS;
/** How often the feed looks at the clock to see whether it is due. */
const TICK_MS = 30_000;
/** The reply is read to this size (our relay's whole reply for four fields is about 6 KB). An estimate. */
export const NOTAM_FETCH_LIMITS = Object.freeze({ timeoutMs: 20_000, maxBytes: 512 * 1024 });
const MAX_NOTAMS = 400;
const MAX_RAW_CHARS = 6000;
const MAX_SITES = 12;
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;

const ICAO = /^[A-Z]{4}$/;
const NOTAM_ID = /^[A-Z]\d{1,5}\/\d{2}$/;
const TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?Z?$/;

// ---- Which NOTAMs are critical ---------------------------------------------------------------------------------
// Estimate; Patrick may refine. Each NOTAM's E) text is cut into sentences (at a full stop or a new line); a sentence is critical when one of
// these matches it. A closure on a taxiway or an apron is NOT critical: the sentence's own subject (the first of RWY, TWY, APRON, AD it names)
// must be the runway or the aerodrome. `words` is what the row's chip says.
const OUT = String.raw`(?:U\/S|UNSERVICEABLE|OUT OF SERVICE|OTS|NOT AVBL|UNAVBL)`;
// A full stop inside a number ("113.4MHZ") is not the end of a sentence.
const GAP = String.raw`(?:[^.]|\.(?=\d))*?`;
const AIDS = String.raw`(?:ILS|LOC|LLZ|GP|GS|GLIDE ?PATH|PAR|VOR|VORTAC|TACAN|NDB|DME|RNAV|RNP|GNSS|LPV|LNAV|SRA|ASR|PAPI|VASI|REIL|ALS|MALS|RCLL|HIRL|MIRL|LIRL|REDL|LGT|LGTS|LIGHTING|LIGHTS?)`;
export const CRITICAL_PATTERNS = Object.freeze([
  Object.freeze({ id: 'runway-closed', kind: 'runway', words: 'RWY CLSD', re: new RegExp(String.raw`\b(?:RWY|RUNWAY)\b${GAP}\bCLSD\b`), subject: 'RWY' }),
  Object.freeze({ id: 'aerodrome-closed', kind: 'aerodrome', words: 'AD CLSD', re: /\b(?:AD|AERODROME|AIRPORT|ARPT)\s+CLSD\b/, subject: 'AD' }),
  Object.freeze({ id: 'aid-out', kind: 'aid', words: 'NOTAM', re: new RegExp(String.raw`\b${AIDS}\b${GAP}\b${OUT}(?=\s|$|\.|\)|,)`), subject: null }),
]);
const SUBJECT = /\b(RWY|RUNWAY|TWY|TAXIWAY|APRON|APN|AD|AERODROME|AIRPORT|ARPT)\b/;
const SUBJECT_KIND = { RWY: 'RWY', RUNWAY: 'RWY', AD: 'AD', AERODROME: 'AD', AIRPORT: 'AD', ARPT: 'AD' };

/** The text after "E)" (the NOTAM's own words), or the whole thing when there is no E) line. */
export function bodyOf(raw) {
  const m = /(?:^|\n)\s*E\)\s*([\s\S]*)$/.exec(String(raw));
  return (m ? m[1] : String(raw)).replace(/\)\s*$/, '').trim();
}

/**
 * Whether a NOTAM is critical, from its raw text: { critical, kind: 'runway' | 'aerodrome' | 'aid' | null, words }. `words` is the chip's: "RWY CLSD", "AD CLSD" or "NOTAM".
 * A taxiway closure is not critical. The runway or aerodrome closure beats an aid when one NOTAM has both.
 */
export function classifyNotam(raw) {
  const body = bodyOf(raw).toUpperCase();
  let found = null;
  for (const sentence of body.split(/\.(?=\s|$)|\n/)) {
    const text = sentence.trim();
    if (!text) continue;
    const subject = SUBJECT.exec(text)?.[1];
    for (const p of CRITICAL_PATTERNS) {
      if (!p.re.test(text)) continue;
      // A closure counts only when it is the runway's or the aerodrome's own; a taxiway or apron closure reads CLSD too.
      if (p.subject && SUBJECT_KIND[subject] !== p.subject) continue;
      if (!found || (found.kind === 'aid' && p.kind !== 'aid')) found = p;
    }
  }
  return found ? { critical: true, kind: found.kind, words: found.words } : { critical: false, kind: null, words: '' };
}

// ---- Reading the reply -----------------------------------------------------------------------------------------

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, key) => (Object.hasOwn(o, key) ? o[key] : undefined);

/** A NOTAM time as milliseconds (the feed's times are UTC), or null when it is not a time. */
export function readTime(v) {
  if (typeof v !== 'string' || v.length > 32) return null;
  const m = TIME.exec(v.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
  if (year < YEAR_MIN || year > YEAR_MAX || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const t = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isFinite(t) ? t : null;
}

/** Control characters out, so the text can only be words (a tab or new line stays). */
const plain = (s) => String(s).replace(/[^\S\n\t ]/g, ' ').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');

function readOne(n) {
  if (!isObject(n)) return null;
  const id = own(n, 'id');
  const location = own(n, 'location');
  const raw = own(n, 'raw');
  if (typeof id !== 'string' || !NOTAM_ID.test(id.trim().toUpperCase())) return null;
  if (typeof location !== 'string' || !ICAO.test(location.trim().toUpperCase())) return null;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const start = readTime(own(n, 'start'));
  const endValue = own(n, 'end');
  const end = endValue === null || endValue === undefined || endValue === '' ? null : readTime(endValue);
  if (start === null) return null;
  if (endValue !== null && endValue !== undefined && endValue !== '' && end === null) return null; // a bad end is not "permanent"
  const text = plain(raw.length > MAX_RAW_CHARS ? raw.slice(0, MAX_RAW_CHARS) : raw);
  return { id: id.trim().toUpperCase(), location: location.trim().toUpperCase(), start, end, raw: text, ...classifyNotam(text) };
}

/**
 * The relay's /notam reply (parsed, or JSON text) checked and rebuilt: { fetched (ms, or null when the relay's own time is not believable),
 * sites: ['CYMJ', ...], notams: [{ id, location, start, end (ms or null), raw, critical, kind, words }] }. Duplicates (the same id at the same
 * field) are dropped. Returns null for anything that is not the expected shape. Never throws.
 */
export function readNotamReply(input, { now = Date.now() } = {}) {
  try {
    let json = input;
    if (typeof input === 'string') {
      if (input.length > NOTAM_FETCH_LIMITS.maxBytes) return null;
      json = JSON.parse(input);
    }
    if (!isObject(json)) return null;
    const list = own(json, 'notams');
    const sites = own(json, 'sites');
    if (!Array.isArray(list) || !Array.isArray(sites) || sites.length > MAX_SITES) return null;
    const names = [];
    for (const s of sites) {
      if (typeof s !== 'string' || !ICAO.test(s.trim().toUpperCase())) return null;
      names.push(s.trim().toUpperCase());
    }
    const seen = new Set();
    const notams = [];
    for (const n of list.slice(0, MAX_NOTAMS)) {
      const one = readOne(n);
      if (!one) continue;
      const key = `${one.location}|${one.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notams.push(one);
    }
    const fetched = own(json, 'fetched');
    const believable = typeof fetched === 'number' && Number.isFinite(fetched) && fetched > Date.UTC(YEAR_MIN, 0, 1) && fetched <= +now + 5 * MINUTE_MS;
    return { fetched: believable ? fetched : null, sites: names, notams };
  } catch {
    return null;
  }
}

/** `<relay>/notam?sites=CYMJ,CYQR`, or null with no good relay address or no field to ask about. Four-letter codes only. */
export function notamUrl({ baseUrl, sites }) {
  const origin = relayOrigin(baseUrl);
  const codes = [...new Set((sites ?? []).filter((s) => typeof s === 'string' && ICAO.test(s.trim().toUpperCase())).map((s) => s.trim().toUpperCase()))].slice(0, MAX_SITES);
  if (!origin || codes.length === 0) return null;
  return `${origin}/notam?sites=${codes.join(',')}`;
}

// ---- Words -----------------------------------------------------------------------------------------------------

/** Critical NOTAMs first, the closures before the aids. */
const RANK = { aerodrome: 0, runway: 1, aid: 2, none: 3 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => String(n).padStart(2, '0');
/** "18 Nov 2359Z". */
export const zuluWords = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`;
};
/** "0612Z". */
export const hhmmZ = (ms) => {
  const d = new Date(ms);
  return `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`;
};

/** "until 18 Nov 2359Z", "PERM" with no end, and "from 9 Oct 0100Z until 11 Oct 0100Z" for one not yet in force. */
export function validityWords(start, end, now) {
  const until = end === null ? 'PERM' : `until ${zuluWords(end)}`;
  return start > +now ? `from ${zuluWords(start)} ${end === null ? 'PERM' : until}` : until;
}

// ---- What an airfield shows -------------------------------------------------------------------------------------

/**
 * One airfield's NOTAMs as the card and its row draw them, from the feed's state (`createNotamFeed().state()`): `{ relay, lastGood: { fetched, receivedAt, sites, notams } | null, failed }`.
 * Returns { status: 'ok' | 'unavailable' | 'unset', words, chip: { words, level } | null, list: [{ id, critical, kind, words, validity, raw, body }] }.
 * - 'unset': no relay address; words say where it goes.
 * - 'unavailable': never fetched, the last ask failed, the answer is older than NOTAM_STALE_MS, or it does not name this field. `words` says "NOTAMs unavailable (last good 0612Z)" (or "not yet").
 * - 'ok': a fresh good answer. `list` is this field's NOTAMs in force or coming, critical ones first (then by start); empty means "No NOTAMs".
 */
export function notamsFor(state, icao, now) {
  const at = +now;
  if (!state.relay) {
    return { status: 'unset', words: 'NOTAMs need the relay address in SOF settings', chip: null, list: [] };
  }
  const good = state.lastGood;
  const dataTime = good ? (good.fetched ?? good.receivedAt) : null;
  const lastGood = good ? `last good ${hhmmZ(Math.min(dataTime, good.receivedAt))}` : 'none yet';
  const old = !good || at - Math.min(dataTime, good.receivedAt) > NOTAM_STALE_MS;
  const named = good?.sites.includes(String(icao).toUpperCase()) === true;
  if (old || state.failed || !named) {
    return { status: 'unavailable', words: `NOTAMs unavailable (${lastGood})`, chip: { words: 'NOTAMs ?', level: 'unknown' }, list: [] };
  }
  const mine = good.notams
    .filter((n) => n.location === String(icao).toUpperCase() && (n.end === null || n.end >= at))
    .sort((a, b) => RANK[a.kind ?? 'none'] - RANK[b.kind ?? 'none'] || a.start - b.start || (a.id < b.id ? -1 : 1))
    .map((n) => ({ id: n.id, critical: n.critical, kind: n.kind, words: n.words, validity: validityWords(n.start, n.end, at), raw: n.raw, body: bodyOf(n.raw) }));
  const worst = mine.find((n) => n.critical);
  const chip = worst ? { words: worst.kind === 'aid' ? 'NOTAM' : worst.words, level: 'critical' } : null;
  return { status: 'ok', words: mine.length ? '' : 'No NOTAMs', chip, list: mine };
}

// ---- The loop -------------------------------------------------------------------------------------------------------

/**
 * Asks the relay for the NOTAMs of `sites()` through `address()` (a `notamUrl`, or null when no relay is set), at once and then every
 * NOTAM_REFRESH_MS while open, with the SOF's request limits (timeout, byte cap, no cookies). Paused while `paused()` (a hidden tab); wake() asks at
 * once if one is due. A different address or field list asks again at once (`sync()`, cheap, called as the screen redraws). A failed ask keeps the last good
 * answer (it goes old by itself) and tries again after NOTAM_RETRY_MS. Everything ends with stop() or the module's scheduler scope.
 * Returns { sync(), wake(), stop(), state() } (state: { relay, lastGood, failed, busy }).
 */
export function createNotamFeed(options) {
  return createRelayFeed({ ...options, read: readNotamReply, refreshMs: NOTAM_REFRESH_MS, retryMs: NOTAM_RETRY_MS, limits: NOTAM_FETCH_LIMITS });
}

/**
 * The relay loop the NOTAMs and the SIGMETs/PIREPs (alerts.js) share: asks `address()` at once and then every `refreshMs` while open, reads each
 * reply with `read(text, { now })` (null for a bad one), keeps the last good answer as { ...read's answer, receivedAt }, and after a failure tries
 * again after `retryMs`. `limits` are the request's { timeoutMs, maxBytes }. Otherwise as createNotamFeed.
 */
export function createRelayFeed({ address, read, refreshMs, retryMs, limits, paused = () => false, fetch, timers, now = () => new Date(), onChange = () => {} }) {
  let lastGood = null; // read's answer ({ fetched, sites, notams } for the NOTAMs) and receivedAt
  let failed = false;
  let busy = false;
  let askedUrl = null;
  let askedAt = null;
  let controller = new AbortController();
  let cancelTick = null;
  let stopped = false;

  const changed = () => {
    if (!stopped) onChange();
  };
  const state = () => ({ relay: address() !== null, lastGood, failed, busy });

  async function ask(url) {
    askedUrl = url;
    askedAt = +now();
    busy = true;
    const mine = controller;
    let text = null;
    try {
      const reply = await guardedFetch(fetch, url, { timers, signal: mine.signal, accept: 'application/json', ...limits });
      text = bytesToText(reply.bytes);
    } catch {
      if (mine.signal.aborted || stopped) return; // the module closed or the address changed: nothing to say
    }
    if (mine !== controller || stopped) return;
    busy = false;
    const answer = text === null ? null : read(text, { now: +now() });
    if (answer) {
      lastGood = { ...answer, receivedAt: +now() };
      failed = false;
    } else failed = true;
    changed();
  }

  function due(url) {
    if (askedAt === null || url !== askedUrl) return true;
    return +now() - askedAt >= (failed ? retryMs : refreshMs);
  }

  function tick() {
    if (stopped || paused() || busy) return;
    const url = address();
    if (!url) return;
    if (due(url)) ask(url);
  }

  cancelTick = timers.every(TICK_MS, tick);

  return {
    /** The address or the fields changed, or the first look: asks at once when that is so. */
    sync() {
      if (stopped || paused() || busy) return;
      const url = address();
      if (!url) {
        if (askedUrl !== null) {
          controller.abort();
          controller = new AbortController();
          askedUrl = null;
          askedAt = null;
          lastGood = null; // another relay's answer is not this one's
          failed = false;
          busy = false;
          changed();
        }
        return;
      }
      if (url !== askedUrl) {
        controller.abort();
        controller = new AbortController();
        busy = false;
        ask(url);
      }
    },
    wake: tick,
    stop() {
      stopped = true;
      cancelTick?.();
      cancelTick = null;
      controller.abort();
    },
    state,
  };
}
