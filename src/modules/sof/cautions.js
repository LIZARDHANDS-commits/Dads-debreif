// The SOF's cautions: what the banner lists, which of them are new, and how
// acknowledging works (SPEC-sof, "Caution banner"; SOF-4). Pure: cards, wx's
// TAF results and "now" go in, plain data comes out. The banner's DOM and the
// storing of acknowledgements are the caller's (task 3, layout.js and storage).
//
// A caution is a report below its limits, or dangerous weather (wx's D58 list).
// Every reason is wx's own words; nothing here reads a report's text. "At the
// limit" and information-only weather raise nothing.
//
// Acknowledgements are one plain object, `{ version, day, keys }`, that the
// caller keeps and passes back: `day` is the home zone's calendar day, so they
// last for that day and no longer, and `keys` are the acknowledged cautions.
// A key is the airfield, METAR or TAF, for a TAF the group and its times, and
// wx's reason. It holds no report time, so the same weather in the next report
// is the same caution. When a caution is no longer reported its key goes, so if
// it returns it is new (SOF-4). A source that can't be read at all (no METAR,
// no TAF) is not a caution that cleared, so its keys stay.

import { assessAlternate } from '../../wx/alternates.js';
import { localDate, localToUtc } from './waves.js';

const VERSION = 1;
// Storage is checked on the way back in: a day of cautions is never near these.
const MAX_KEYS = 500;
const MAX_KEY_CHARS = 300;

const two = (n) => String(n).padStart(2, '0');

// wx's reasons start with CEILING or VIS for the limit lines; the rest are cautions.
const isLimitReason = (r) => /^(CEILING|VIS) /.test(r);
const isAtLimit = (r) => / AT LIMIT /.test(r);
// "Below" reasons: the limit lines that are not the at-limit ones (a piece can be
// below on one thing and exactly on the limit on another). Below is always at
// least one caution: with no such line it is wx's first reason, else "Below limits".
const belowReasons = (reasons) => {
  const all = (Array.isArray(reasons) ? reasons : []).filter((r) => typeof r === 'string' && r);
  const named = all.filter((r) => isLimitReason(r) && !isAtLimit(r));
  return named.length ? named : [all[0] ?? 'Below limits'];
};
const cautionReasons = (reasons) => (Array.isArray(reasons) ? reasons : []).filter((r) => typeof r === 'string' && !isLimitReason(r));

// Where in a report's text the words behind a caution are: wx's `{ start, end }` positions, checked, few and once each.
const MAX_SPANS = 20;
function cleanSpans(list) {
  const out = [];
  for (const span of Array.isArray(list) ? list : []) {
    let start;
    let end;
    try { ({ start, end } = span ?? {}); } catch { continue; }
    if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && !out.some((s) => s.start === start && s.end === end)) out.push({ start, end });
    if (out.length >= MAX_SPANS) break;
  }
  return out;
}

const LEVELS = {
  below: { rank: 0, words: 'Below limits' },
  caution: { rank: 1, words: 'Caution' },
};

const validDate = (d) => d instanceof Date && !Number.isNaN(+d);

/** "1800Z". */
const hhmmZ = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`;

/** "29/22Z", or "29/2230Z" when the minutes matter. */
const dayHourZ = (d) => `${two(d.getUTCDate())}/${two(d.getUTCHours())}${d.getUTCMinutes() ? two(d.getUTCMinutes()) : ''}Z`;

/** "2026-09-29T22:00Z": unambiguous across days and months, for keys. */
const isoMinute = (d) => `${d.toISOString().slice(0, 16)}Z`;

/** The TAF group as the SOF says it: PREVAILING, TEMPO, BECMG, FM, "PROB30", "PROB30 TEMPO". */
function groupName(piece) {
  const kind = typeof piece.kind === 'string' && piece.kind ? piece.kind : 'PREVAILING';
  if (kind === 'PROB') return `PROB${piece.probability}${piece.tempo ? ' TEMPO' : ''}`;
  return kind === 'BASE' ? 'PREVAILING' : kind;
}

function make({ icao, source, level, reason, group = null, from = null, to = null, time = null, stale = false, spans = [], raw = null }) {
  const where = source === 'METAR'
    ? `${icao} METAR${time ? ` ${hhmmZ(time)}` : ''}`
    : `${icao} TAF ${group} ${dayHourZ(from)}–${dayHourZ(to)}`;
  const key = source === 'METAR'
    ? [icao, 'METAR', reason]
    : [icao, 'TAF', group, isoMinute(from), isoMinute(to), reason];
  return {
    key: key.join('|'),
    icao,
    source,
    level,
    levelWords: LEVELS[level].words,
    group,
    from,
    to,
    reason,
    stale,
    raw: typeof raw === 'string' ? raw : null, // the report the words are in, and where they are in it
    spans: typeof raw === 'string' ? cleanSpans(spans) : [],
    text: `${LEVELS[level].words}: ${where}: ${reason}${stale ? ' (STALE report)' : ''}`,
    acknowledged: false,
  };
}

// METAR first, then TAF, then anything else (lightning), so the order is the same whichever pair is compared.
const sourceRank = (source) => (source === 'METAR' ? 0 : source === 'TAF' ? 1 : 2);

/** A caution handed in from outside, checked for shape and copied; null if it isn't one. */
function extraCaution(c) {
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return null;
  const { key, icao, source, level, text } = c;
  if (typeof key !== 'string' || !key || key.length > MAX_KEY_CHARS || typeof icao !== 'string' || !icao) return null;
  if (typeof source !== 'string' || !source || typeof text !== 'string' || !text || !Object.hasOwn(LEVELS, level)) return null;
  return {
    key, icao, source, level, levelWords: LEVELS[level].words, group: typeof c.group === 'string' ? c.group : null,
    from: validDate(c.from) ? c.from : null, to: validDate(c.to) ? c.to : null,
    reason: typeof c.reason === 'string' ? c.reason : text, stale: c.stale === true, raw: null, spans: [], text, acknowledged: false,
  };
}

// ---- Cautions from cards and TAF results --------------------------------------------------

/** METAR cautions from one airfield card (cards.js's `cardModel`). */
function metarCautions(card) {
  const icao = card?.icao;
  if (typeof icao !== 'string' || !icao) return [];
  const time = validDate(card.metar?.time) ? card.metar.time : null;
  const stale = card.result?.stale === true;
  const raw = card.metar?.raw;
  const one = (level, reason) => make({ icao, source: 'METAR', level, reason, time, stale, raw, spans: card.reasonSpans?.[reason] });
  return [
    ...(card.result?.level === 'below' ? belowReasons(card.result.reasons).map((r) => one('below', r)) : []),
    ...cautionReasons(card.cautionReasons).map((r) => one('caution', r)),
  ];
}

/**
 * TAF cautions from one of wx's results (`homeAlternateTrigger`,
 * `assessAlternate`, or the `result` inside a wave call): the pieces below the
 * limits (`hits`) and the pieces with dangerous weather (`cautions`). wx splits
 * a group wherever the forecast under it changes, so one group can arrive as
 * several pieces; they are joined back into one caution over the group's span.
 * Prevailing pieces are joined when they touch, whichever group they came from.
 */
function tafCautions(icao, result, raw = null) {
  const found = [];
  const add = (level, pieces, reasonsOf) => {
    for (const piece of Array.isArray(pieces) ? pieces : []) {
      if (!validDate(piece?.from) || !validDate(piece?.to)) continue;
      const group = groupName(piece);
      for (const reason of reasonsOf(piece.reasons)) {
        const at = Array.isArray(piece.reasons) ? piece.reasons.indexOf(reason) : -1;
        found.push({ level, group, reason, from: piece.from, to: piece.to, index: piece.group, spans: at >= 0 ? cleanSpans(piece.reasonSpans?.[at]) : [] });
      }
    }
  };
  add('below', result?.hits, belowReasons);
  add('caution', result?.cautions, cautionReasons);
  found.sort((a, b) => +a.from - +b.from);

  const joined = [];
  for (const piece of found) {
    const same = joined.find((j) => j.level === piece.level && j.group === piece.group && j.reason === piece.reason
      && (j.index === piece.index || (piece.group === 'PREVAILING' && +piece.from <= +j.to && +piece.to >= +j.from)));
    if (same) {
      same.from = new Date(Math.min(+same.from, +piece.from));
      same.to = new Date(Math.max(+same.to, +piece.to));
      same.spans = cleanSpans([...same.spans, ...piece.spans]);
    } else {
      joined.push({ ...piece });
    }
  }
  return joined.map((j) => make({ icao, source: 'TAF', level: j.level, reason: j.reason, group: j.group, from: j.from, to: j.to, raw, spans: j.spans }));
}

/**
 * Every current caution, worst first (below the limits, then dangerous weather),
 * then in the order the airfields were given, METAR before TAF, then by time.
 *
 * - `cards`: `cardModel` results, one per airfield.
 * - `tafs`: `[{ icao, result, raw }]`, `raw` being the TAF's trimmed text (what wx's positions are in, for the marked words), `result` being wx's `homeAlternateTrigger` or
 *   `assessAlternate` answer (see `tafResultsOfWaves`). What the TAF is checked
 *   over is the caller's choice; this lists what those results found.
 *
 * Each caution is `{ key, icao, source: 'METAR' | 'TAF', level: 'below' | 'caution',
 * levelWords, group, from, to, reason, stale, raw, spans, text, acknowledged: false }`. `spans` is
 * `[{ start, end }]`: where in `raw` (the report, or null) the words behind the reason are.
 * `text` is the line the banner shows, in words. The same key is listed once.
 *
 * - `notEndedBefore`: a Date; TAF cautions (dangerous weather, not limits) whose joined span ended before it are left out.
 * - `extra`: cautions from other sources in the same shape, such as lightning.js's; they are
 *   checked, sorted and de-duplicated with the rest. Entries that aren't cautions are ignored.
 */
export function cautionList({ cards = [], tafs = [], extra = [], notEndedBefore = null } = {}) {
  const order = new Map();
  const seen = (icao) => order.has(icao) || order.set(icao, order.size);
  const all = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    for (const c of metarCautions(card)) { seen(c.icao); all.push(c); }
  }
  for (const entry of Array.isArray(tafs) ? tafs : []) {
    if (typeof entry?.icao !== 'string' || !entry.icao || !entry.result) continue;
    for (const c of tafCautions(entry.icao, entry.result, entry.raw)) {
      // The cut is after the join, so a spell keeps one span (and one key) while any of it is still to come.
      if (validDate(notEndedBefore) && c.level === 'caution' && c.to && +c.to < +notEndedBefore) continue;
      seen(c.icao);
      all.push(c);
    }
  }
  for (const c of Array.isArray(extra) ? extra : []) {
    const one = extraCaution(c);
    if (one) { seen(one.icao); all.push(one); }
  }
  const unique = [...new Map(all.map((c) => [c.key, c])).values()];
  const time = (c) => (c.from ? +c.from : 0);
  return unique
    .map((c, index) => ({ c, index }))
    .sort((a, b) => LEVELS[a.c.level].rank - LEVELS[b.c.level].rank
      || order.get(a.c.icao) - order.get(b.c.icao)
      || sourceRank(a.c.source) - sourceRank(b.c.source)
      || time(a.c) - time(b.c)
      || a.index - b.index)
    .map(({ c }) => c);
}

/**
 * wx's TAF results from a list of `waveCalls`, in the form `cautionList` takes:
 * each wave's home result (under `homeIcao`) and each alternate's.
 */
export function tafResultsOfWaves(calls, homeIcao) {
  return (Array.isArray(calls) ? calls : []).flatMap((call) => [
    ...(typeof homeIcao === 'string' && homeIcao && call?.home?.result ? [{ icao: homeIcao, result: call.home.result }] : []),
    ...(Array.isArray(call?.alternates) ? call.alternates : [])
      .filter((a) => typeof a?.icao === 'string' && a.result)
      .map((a) => ({ icao: a.icao, result: a.result })),
  ]);
}

const BANNER_AHEAD_MS = 12 * 3_600_000;
// How far back the banner looks: a forecast caution that ended longer ago than this is over and is not raised
// (it stays on the timeline). One hour keeps a period that has only just ended. Set to null for no cut, the old
// behaviour. The cut is made after the pieces of a spell are joined (cautionList's `notEndedBefore`), so the
// forecast window itself still starts at midnight at home and a spell keeps one key all day.
const BANNER_BACK_MS = 3_600_000;

/** The `notEndedBefore` the banner uses: a TAF caution that ended before this is over. Null when there is no cut. */
export function bannerNotEndedBefore(now) {
  return BANNER_BACK_MS == null || !validDate(now) ? null : new Date(+now - BANNER_BACK_MS);
}

/**
 * The window the banner watches TAFs over, whatever day the timeline is showing:
 * from local midnight at home (or an hour before now, if that is earlier, so the
 * cut reaches back across midnight) to the later of the end of today and now + 12 h,
 * so an evening never shows an empty look-ahead. With no readable zone it is an hour
 * before now to now + 12 h. Null when the time now can't be read.
 * Returns `{ from, to }`.
 * @param {{ now?: any, timeZone?: any }} [input]
 */
export function bannerWindow({ now, timeZone } = {}) {
  if (!validDate(now)) return null;
  const ahead = new Date(+now + BANNER_AHEAD_MS);
  const today = localDate(now, timeZone);
  const back = BANNER_BACK_MS == null ? null : new Date(+now - BANNER_BACK_MS);
  if (!today) return { from: back ?? now, to: ahead };
  const midnight = localToUtc(today, 0, timeZone);
  const start = back && +back < +midnight ? back : midnight;
  const end = localToUtc({ ...today, day: today.day + 1 }, 0, timeZone);
  return { from: start, to: new Date(Math.max(+end, +ahead)) };
}

/**
 * The banner's TAF cautions, whatever the waves and whatever day is on the
 * timeline: each airfield's TAF is checked by wx over `bannerWindow`, cut at the
 * TAF's own end, and only wx's `cautions` are kept, in the form `cautionList`
 * takes. Pieces below the limits are not taken here; they stay tied to the wave
 * windows. A TAF missing, or ended before the window starts, gives wx's status
 * ('no-taf', 'no-time') and no cautions, so its acknowledgements stay.
 * `tafs` maps ICAO to wx's parsed TAF (or null), as `waveCalls` takes it.
 * @param {{ tafs?: any, now?: any, timeZone?: any }} [input]
 */
export function tafCautionsForBanner({ tafs, now, timeZone } = {}) {
  const window = bannerWindow({ now, timeZone });
  if (tafs == null || typeof tafs !== 'object' || !window) return [];
  return Object.entries(tafs).map(([icao, taf]) => {
    const to = validDate(taf?.validTo) ? new Date(Math.min(+window.to, +taf.validTo)) : window.to;
    // Nothing of the TAF is in the window: no answer, not a clear sky.
    if (validDate(taf?.validTo) && +to <= +window.from) return { icao, result: { status: 'no-time', hits: [], cautions: [] } };
    // Cautions don't depend on the minima, so wx's defaults are enough.
    const { status, cautions } = assessAlternate(taf, { from: window.from, to }, {});
    return { icao, result: { status, hits: [], cautions } };
  });
}

// ---- Acknowledgements ---------------------------------------------------------------------

/**
 * The calendar day in the home zone, "2026-09-29", or null when the time or the
 * zone can't be read: it never uses this machine's clock or zone.
 */
export function ackDay(now, timeZone) {
  if (!validDate(now)) return null;
  const date = localDate(now, timeZone);
  return date ? `${date.year}-${two(date.month)}-${two(date.day)}` : null;
}

/**
 * An empty store for today at home.
 * @param {{ now?: any, timeZone?: any }} [input]
 */
export function emptyAcks({ now, timeZone } = {}) {
  return { version: VERSION, day: ackDay(now, timeZone), keys: [] };
}

const validKeys = (keys) => Array.isArray(keys) && keys.length <= MAX_KEYS
  && keys.every((k) => typeof k === 'string' && k.length > 0 && k.length <= MAX_KEY_CHARS);

/**
 * A stored acknowledgement object checked for shape and day. Anything wrong,
 * or from another day, reads as nothing acknowledged. Returns a copy.
 * @param {any} stored
 * @param {{ now?: any, timeZone?: any }} [input]
 */
export function readAcks(stored, { now, timeZone } = {}) {
  const today = ackDay(now, timeZone);
  const good = stored != null && typeof stored === 'object' && !Array.isArray(stored)
    && stored.version === VERSION && (stored.day === null || typeof stored.day === 'string')
    && validKeys(stored.keys) && today !== null && stored.day === today;
  return good ? { version: VERSION, day: stored.day, keys: [...stored.keys] } : { version: VERSION, day: today, keys: [] };
}

/** A store with `key` acknowledged. A copy; a key that isn't text, or is too long, is ignored. */
export function acknowledge(acks, key) {
  const keys = Array.isArray(acks?.keys) ? acks.keys.filter((k) => typeof k === 'string') : [];
  const day = typeof acks?.day === 'string' ? acks.day : null;
  const add = typeof key === 'string' && key && key.length <= MAX_KEY_CHARS && !keys.includes(key) ? [key] : [];
  return { version: VERSION, day, keys: [...keys, ...add].slice(-MAX_KEYS) };
}

/** A store with every caution in `cautions` acknowledged (the banner's Acknowledge). */
export function acknowledgeAll(acks, cautions) {
  return (Array.isArray(cautions) ? cautions : []).reduce((next, c) => acknowledge(next, c?.key), acknowledge(acks));
}

// A key's source: "CYMJ|METAR" or "CYMJ|TAF".
const sourceOf = (key) => key.split('|', 2).join('|');

/** The sources that gave an answer this time: a missing or NIL METAR, or no TAF, gave none. */
function readableSources(cards, tafs) {
  const out = new Set();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (typeof card?.icao === 'string' && card.result?.level && card.result.level !== 'none') out.add(`${card.icao}|METAR`);
  }
  for (const entry of Array.isArray(tafs) ? tafs : []) {
    const status = entry?.result?.status;
    if (typeof entry?.icao === 'string' && status && status !== 'no-taf' && status !== 'no-time') out.add(`${entry.icao}|TAF`);
  }
  return out;
}

/**
 * The whole answer for one refresh: the current cautions, which are new and
 * which are acknowledged, and the acknowledgement object to keep.
 *
 * `extra` is `cautionList`'s: cautions from other sources, such as lightning. Their keys are never
 * pruned here (their source is not one of the readable ones), so an acknowledgement stays for the day.
 *
 * `acks` is what the caller stored (or nothing). It is checked, moved to
 * today, and cleared of cautions that are no longer reported (so one that comes
 * back is new). `changed` says whether the result differs from what was stored,
 * so the caller writes only when it must (nothing stored counts as empty).
 * With no readable day (no zone or clock) nothing is kept and `storable` is
 * false: an acknowledgement with no day could never expire, so it isn't stored.
 *
 * Returns `{ cautions, fresh, acknowledged, acks, changed, storable }`; every caution
 * has `acknowledged` true or false. Nothing passed in is changed.
 * @param {{ cards?: any, tafs?: any, extra?: any, acks?: any, now?: any, timeZone?: any, notEndedBefore?: any }} [input]
 */
export function evaluate({ cards, tafs, extra, acks, now, timeZone, notEndedBefore = null } = {}) {
  const current = readAcks(acks, { now, timeZone });
  const found = cautionList({ cards, tafs, extra, notEndedBefore });
  const active = new Set(found.map((c) => c.key));
  const readable = readableSources(cards, tafs);
  const kept = current.keys.filter((k) => active.has(k) || !readable.has(sourceOf(k)));
  const next = { version: VERSION, day: current.day, keys: kept };
  const acknowledged = new Set(kept);
  const cautions = found.map((c) => ({ ...c, acknowledged: acknowledged.has(c.key) }));
  const stored = acks == null ? emptyAcks({ now, timeZone }) : acks;
  return {
    cautions,
    fresh: cautions.filter((c) => !c.acknowledged),
    acknowledged: cautions.filter((c) => c.acknowledged),
    acks: next,
    storable: current.day !== null,
    changed: current.day !== null && JSON.stringify(stored) !== JSON.stringify(next),
  };
}
