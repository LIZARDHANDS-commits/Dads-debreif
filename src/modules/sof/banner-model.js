// What the caution banner says and does, decided without a page (SPEC-sof,
// "Caution banner", task 3). cautions.js decides which cautions exist and which
// are new; this turns its answer into one line of words per caution, says which
// lines to announce, and gives back the acknowledgements to keep. The banner's
// DOM is banner-view.js.
import {
  evaluate, tafCautionsForBanner, tafResultsOfWaves, acknowledge, acknowledgeAll,
} from './cautions.js';

/** Where the acknowledgements are kept, in the module's storage scope. */
export const ACKS_KEY = 'cautionAcks';

// Beside the words of the level, never instead of them.
const SYMBOL = { below: '▼', caution: '⚠' };

/**
 * The TAF results the banner checks: every airfield's TAF over the banner window
 * (whatever day the timeline shows), plus each wave's own results. `tafs` maps ICAO to
 * wx's parsed TAF (or null); `calls` is `waveCalls`' answer; `homeIcao` names home.
 */
export function tafInputs({ tafs, calls = [], homeIcao, now, timeZone }) {
  // One result per airfield, its pieces from every look at its TAF. cautions.js joins the pieces of a group into one
  // caution over their whole span; looked at one result at a time, the same fog would be a line for each look.
  const byIcao = new Map();
  for (const { icao, result } of [...tafCautionsForBanner({ tafs, now, timeZone }), ...tafResultsOfWaves(calls, homeIcao)]) {
    const one = byIcao.get(icao) ?? { icao, result: { status: result?.status, hits: [], cautions: [] } };
    one.result.hits.push(...(Array.isArray(result?.hits) ? result.hits : []));
    one.result.cautions.push(...(Array.isArray(result?.cautions) ? result.cautions : []));
    byIcao.set(icao, one);
  }
  return [...byIcao.values()];
}

/** The keys in `lines` that are not in `before`: what has newly appeared. */
export function newKeys(before, lines) {
  const known = new Set(before ?? []);
  return lines.filter((l) => !known.has(l.key)).map((l) => l.key);
}

/**
 * The banner for one refresh.
 *
 * - `cards`: the screen's airfield cards. `tafs`: `tafInputs`' answer.
 * - `extra`: cautions from other sources in cautions.js's shape (lightning, from another writer).
 * - `acks`: what was stored under ACKS_KEY (or nothing); `now` and `timeZone` are home's.
 * - `enabled`: the "Show the new-caution banner" setting. Off, nothing shows, but the
 *   cautions are still worked out, so acknowledgements are kept right and the cards
 *   still list every caution.
 * - `shown`: the keys that were on the banner the last time, to tell which are new.
 *
 * Returns `{ enabled, show, count, heading, lines, ackAllLabel, announce, acknowledgedCount,
 * acks, memory, storable, write, fresh, signature }`. A line is `{ key, icao, level, symbol, levelWords,
 * text, stale }`. `announce` is the keys to announce to a screen reader: lines new since `shown`.
 * `memory` (keys acknowledged this visit) is used only when nothing can be stored; `banner.memory` is what to keep. `acks` is the object to keep and `write` says it differs from what was stored (and can be stored).
 * @param {any} [args]
 */
export function buildBanner({ cards, tafs, extra, acks, now, timeZone, enabled = true, shown = [], memory = [] } = {}) {
  const result = evaluate({ cards, tafs, extra, acks, now, timeZone });
  // With no readable day nothing can be stored (an acknowledgement with no day never expires), but Acknowledge
  // must still work: the keys acknowledged this visit are kept in memory by the caller and hide those lines.
  const remembered = new Set(result.storable ? [] : Array.isArray(memory) ? memory : []);
  const fresh = result.fresh.filter((c) => !remembered.has(c.key));
  const active = new Set(result.cautions.map((c) => c.key));
  const lines = fresh.map((c) => ({
    key: c.key,
    icao: c.icao,
    level: c.level,
    symbol: SYMBOL[c.level] ?? '⚠',
    levelWords: c.levelWords,
    text: c.text,
    stale: c.stale,
  }));
  const on = enabled !== false;
  const show = on && lines.length > 0;
  return {
    enabled: on,
    show,
    count: lines.length,
    heading: `${lines.length} new caution${lines.length === 1 ? '' : 's'}`,
    lines,
    ackAllLabel: lines.length > 1 ? 'Acknowledge all' : null,
    announce: show ? newKeys(shown, lines) : [],
    acknowledgedCount: result.acknowledged.length + (result.fresh.length - fresh.length),
    acks: result.acks,
    storable: result.storable,
    write: result.storable && result.changed,
    fresh,
    memory: result.storable ? [] : [...remembered].filter((k) => active.has(k)), // still reported, so still acknowledged
    signature: JSON.stringify([show, lines.map((l) => [l.key, l.text])]),
  };
}

/** The acknowledgements to keep after acknowledging one line; null when they can't be kept. */
export function acksAfterOne(banner, key) {
  return banner?.storable ? acknowledge(banner.acks, key) : null;
}

/** The acknowledgements to keep after Acknowledge all; null when they can't be kept. */
export function acksAfterAll(banner) {
  return banner?.storable ? acknowledgeAll(banner.acks, banner.fresh) : null;
}

/** The keys to keep in memory after acknowledging one line when nothing can be stored; null when it can be stored. */
export function memoryAfterOne(banner, key) {
  if (!banner || banner.storable) return null;
  return banner.memory.includes(key) ? [...banner.memory] : [...banner.memory, key];
}

/** The keys to keep in memory after Acknowledge all when nothing can be stored; null when it can be stored. */
export function memoryAfterAll(banner) {
  if (!banner || banner.storable) return null;
  return [...new Set([...banner.memory, ...banner.lines.map((l) => l.key)])];
}
