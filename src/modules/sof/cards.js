// The airfield card model: what one card says, decided without a page (SPEC-sof,
// "Airfield cards"). Pure: reports, limits and "now" go in, plain data comes out.
// The card DOM comes later (task 2) and only draws this.
//
// Every weather answer is wx's: the category, NATO state, limit check (wx's
// `checkOptions(conditions, minima)`) and cautions, and a METAR's LAST OBS/NXT
// remark (`lastObservation`, `nextObservation`). Nothing here reads a report's text: the marked
// words (`marks`) are wx's own positions, only moved onto the text as shown.

import { flightCategory, natoColour, DEFAULT_LIMITS } from '../../wx/limits.js';
import { checkOptions, homeAlternateTrigger, assessAlternate } from '../../wx/alternates.js';
import { staleness, SOURCES } from '../../wx/sources.js';
import { ageMinutes, toDate, MINUTE_MS } from '../../wx/dates.js';
import { describeTrigger, minimaText, descentText } from './waves.js';
import { bannerWindow } from './cautions.js';
import { marksOfCheck, alignMarks } from './marks.js';
import { NOT_SET_KEY, NOT_SET_LIMITS_TEXT, notSetWords, INCOMPLETE_WORDS, incompleteWhy } from './limits-not-set.js';

const two = (n) => String(n).padStart(2, '0');

/** A time as "1800Z". */
const hhmmZ = (date) => `${two(date.getUTCHours())}${two(date.getUTCMinutes())}Z`;

/** A TAF period end as "30/06" (day and hour, Zulu). */
const dayHour = (date) => `${two(date.getUTCDate())}/${two(date.getUTCHours())}`;

/** A length of time in words: "42 min", "1 h 40 min", "1 d 1 h". */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  if (h < 24) return total % 60 ? `${h} h ${total % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** How old a report is: "42 min ago". A report a little ahead of the clock is "just now". */
export function formatAge(minutes) {
  if (!Number.isFinite(minutes)) return 'age unknown';
  return minutes < 1 ? 'just now' : `${formatDuration(minutes)} ago`;
}

const sourceName = (source) => SOURCES[source]?.name ?? null;

/** "No METAR from MET Norway or Datamask (last tried 1836Z)". */
function missingWords(kind, lastTry) {
  const tried = toDate(lastTry);
  return `No ${kind} from MET Norway or Datamask${tried ? ` (last tried ${hhmmZ(tried)})` : ''}`;
}

// ---- METAR line ---------------------------------------------------------------------------

function metarModel(entry, now, feed) {
  const report = entry?.report;
  const tried = toDate(feed.lastTry);
  const failed = Boolean(feed.failed && report);
  const refresh = {
    refreshFailed: failed,
    refreshNote: failed ? `Last refresh failed${tried ? ` (tried ${hhmmZ(tried)})` : ''}` : null,
  };
  const empty = { raw: null, time: null, ageMin: null, ageText: null, label: null, staleText: null, noObsUntil: null, source: null, sourceName: null };
  if (!report) return { ...empty, state: 'missing', words: missingWords('METAR', feed.lastTry), ...refresh };

  const common = { raw: entry.raw ?? report.raw, source: entry.source ?? null, sourceName: sourceName(entry.source), ...refresh };
  if (report.nil) return { ...empty, ...common, state: 'nil', words: 'METAR NIL: no observation' };

  const age = now ? ageMinutes(report, now) : null;
  const time = report.time;
  const label = time ? `METAR ${hhmmZ(time)} (${formatAge(age)})` : 'METAR (time not readable)';
  const stale = !now || staleness('metar', report, now) === 'stale';

  // "LAST OBS/NXT 011000Z": the field is closed until then (CYMJ, overnight). Not an error.
  const noObsUntil = report.lastObservation && now ? (report.nextObservation ?? null) : null;
  const closed = stale && noObsUntil && +noObsUntil > +now;
  const noObs = noObsUntil && +noObsUntil > +now ? `No obs until ${hhmmZ(noObsUntil)}` : null;

  return {
    ...common,
    state: closed ? 'closed' : stale ? 'stale' : 'fresh',
    words: noObs,
    time,
    ageMin: age,
    ageText: time ? formatAge(age) : null,
    label,
    staleText: stale && !closed ? `STALE: ${age == null ? 'age unknown' : `${formatDuration(age)} old`}` : null,
    noObsUntil: noObs ? noObsUntil : null,
  };
}

// ---- TAF line ------------------------------------------------------------------------------------

function tafModel(entry, now, feed) {
  const report = entry?.report;
  const empty = { raw: null, issued: null, validFrom: null, validTo: null, ageText: null, label: null, staleText: null, source: null, sourceName: null };
  if (!report) return { ...empty, state: 'missing', words: missingWords('TAF', feed.lastTry) };

  const issued = report.issued;
  const valid = report.validFrom && report.validTo ? `, valid ${dayHour(report.validFrom)}–${dayHour(report.validTo)}` : '';
  const label = issued ? `TAF ${hhmmZ(issued)}${valid}` : `TAF${valid}`;
  const model = {
    raw: entry.raw ?? report.raw,
    source: entry.source ?? null,
    sourceName: sourceName(entry.source),
    issued,
    validFrom: report.validFrom,
    validTo: report.validTo,
    label,
    ageText: issued && now ? `issued ${formatAge(ageMinutes(report, now))}` : null,
    staleText: null,
    words: null,
  };
  if (report.cancelled) return { ...model, state: 'cancelled', words: 'TAF cancelled' };
  if (report.nil) return { ...model, state: 'nil', words: 'TAF NIL: none issued' };
  if (!now || staleness('taf', report, now) === 'stale') {
    const over = report.validTo && now ? (+now - +report.validTo) / MINUTE_MS : null;
    const how = over == null ? 'valid period unknown' : `valid period ended ${formatDuration(over)} ago`;
    return { ...model, state: 'stale', staleText: `STALE: ${how}` };
  }
  return { ...model, state: 'fresh' };
}

// ---- Limit result ------------------------------------------------------------------------------------

function unknownWords(check, conditions) {
  const parts = [];
  if (check.ceilingUnknown) parts.push((conditions?.sky ?? []).length ? 'cloud base not reported' : 'no ceiling reported');
  if (check.visibilityUnknown) parts.push('no visibility reported');
  return parts.join(', ');
}

function resultModel(metar, conditions, limits, now, descent) {
  if (!conditions) return { level: 'none', words: 'No METAR', reasons: [], stale: false };
  const stale = metar.state === 'stale' || metar.state === 'closed' || !now;
  // A report that isn't current never reads as plain words about the weather now.
  const note = metar.state === 'closed' ? ' (last observation)' : stale ? ' (STALE report)' : '';
  // A visual descent (D80) is checked over the arrival window by the wave call; a
  // METAR against 600-2 would say the wrong thing here.
  if (descent) return { level: 'unknown', words: `Visual descent from MEA: see the wave call${note}`, reasons: [], stale };
  const check = checkOptions(conditions, limits);
  // Limits first, as wx orders them; cautions are listed apart and don't change this.
  const reasons = check.reasons.filter(limitReason);
  if (check.belowLimits) return { level: 'below', words: `Below limits: ${reasons.join(', ')}${note}`, reasons, stale };
  if (check.ceilingUnknown || check.visibilityUnknown) return { level: 'unknown', words: `Unknown: ${unknownWords(check, conditions)}${note}`, reasons: [], stale };
  if (check.atLimit) return { level: 'at-limit', words: `At the limit: ${reasons.join(', ')}${note}`, reasons, stale };
  if (staleIsUnknown(metar)) return { level: 'unknown', words: `Unknown: ${metar.ageMin != null ? `report is ${formatDuration(metar.ageMin)} old` : 'report age unknown'}`, reasons: [], stale };
  // A field closed for the night: what its last observation said, and until when it is closed.
  if (metar.state === 'closed') {
    const until = toDate(metar.noObsUntil);
    return { level: 'within', words: until ? `Within limits at last observation (field closed until ${hhmmZ(until)})` : `Within limits${note}`, reasons: [], stale };
  }
  return { level: 'within', words: `Within limits${note}`, reasons: [], stale };
}

/**
 * The result at a home base with no weather limits (plan Step 2c part B; SOF-32): the METAR is never checked against a limit, so home reads grey
 * "Limits not set for KDLF" and an alternate amber "Incomplete", never "Within limits" or a tick. No METAR still says so. `title` is the key line.
 */
function notSetResult(metar, conditions, now, isHome, homeIcao) {
  if (!conditions) return { level: 'none', words: 'No METAR', reasons: [], stale: false };
  const stale = metar.state === 'stale' || metar.state === 'closed' || !now;
  const note = metar.state === 'closed' ? ' (last observation)' : stale ? ' (STALE report)' : '';
  return isHome
    ? { level: 'not-set', words: `${notSetWords(homeIcao)}${note}`, title: NOT_SET_KEY, reasons: [], stale }
    : { level: 'incomplete', words: `${INCOMPLETE_WORDS}: limits not set for ${homeIcao}${note}`, title: incompleteWhy(homeIcao), reasons: [], stale };
}

/**
 * A stale METAR (SPEC-sof, "Never: show a stale one as current") cannot say the weather is within the limits
 * now, so a "within" on it is "unknown". Below or at the limit stays as it is, and a field closed for the night
 * with its last observation is not stale, just closed. To go back to the old "Within limits (STALE report)",
 * make this return false.
 */
const staleIsUnknown = (metar) => metar.state === 'stale';

// wx's reasons start with CEILING or VIS for the limit lines; the rest are cautions.
const limitReason = (r) => /^(CEILING|VIS) /.test(r);

// ---- Marked words on the TAF ------------------------------------------------------------------------

/**
 * The marks on a TAF's text: wx's own check of it over the banner's window, cut at the TAF's end, against
 * the limits in use. Below-limit and at-limit pieces and dangerous weather, each with the words behind it.
 * A TAF that is missing, cancelled, NIL or stale has none. An alternate with a visual descent (D80) is
 * checked against that; PROB pieces are left to the wave call, as wx does without landing minima.
 */
function tafMarks(line, entry, { isHome, used, descent, now, timeZone }) {
  const report = entry?.report;
  if (line.state !== 'fresh' || !report || !now) return [];
  const window = bannerWindow({ now, timeZone });
  if (!window) return [];
  const validTo = toDate(report.validTo);
  const to = validTo ? new Date(Math.min(+window.to, +validTo)) : window.to;
  if (+to <= +window.from) return [];
  const w = { from: window.from, to };
  const found = isHome ? homeAlternateTrigger(report, w, used) : assessAlternate(report, w, descent ? { visualDescent: descent } : { minima: used });
  // Each list keeps its own kind: `cautions` pieces are there for their dangerous weather only, so a PROB piece wx
  // leaves unchecked against the minima (probUnchecked) is never marked as a limit through it.
  const cautionOnly = (p) => marksOfCheck(p).filter((m) => m.level === 'caution');
  const marks = [...found.hits, ...found.atLimit].flatMap((p) => marksOfCheck(p)).concat(found.cautions.flatMap(cautionOnly));
  return alignMarks(marks, line.raw, report.raw);
}

// The METAR's marks. A visual-descent alternate's result is left to the wave call (its minima are not the 600-2 this check
// used), so only its dangerous weather is marked, never a limit.
const metarMarks = (check, descent) => (descent ? marksOfCheck(check).filter((m) => m.level === 'caution') : marksOfCheck(check));

// ---- The card ---------------------------------------------------------------------------------------------

/**
 * One airfield card.
 *
 * - `icao`, `name`, `role`: 'HOME' or 'ALT' (default 'ALT').
 * - `metar`, `taf`: report entries as wx's fetchReports gives them,
 *   `{ raw, report, source }`, or null when there is none. Staleness is decided
 *   here from `now`, never from a status stored earlier.
 * - `limits`: home limits `{ ceilingFt, visSm }` (default Local (MTCA) 2000/3).
 * - `options`: for an alternate, the whole airfields' `checkOptions(icao)` object (not wx's `checkOptions(conditions, minima)`).
 *   Its minima are used (default V6's 600-2); when it has a `visualDescent` (D80)
 *   600-2 is never used and the result is 'unknown', for the wave call to decide.
 * - `feed`: `{ lastTry, failed }` for the words about a missing or failed refresh.
 * - `now`: a Date. Without one every age is unknown and every report reads as stale.
 * - `timeZone`: home's, for the day the banner looks at (default: the hour before now to the end of the TAF).
 * - `notSetFor`: the home ICAO when the home base's site profile has no weather limits (`standards: null`), else null (the default, today's
 *   behaviour). Then nothing is checked against a limit: the result is `notSetResult`'s, only dangerous-weather words are marked, and `alert` is
 *   the cautions alone. The category, NATO state and cautions are the weather's and stay.
 * The METAR and TAF lines carry `marks`, `[{ start, end, level }]` on their `raw` text, and the card `reasonSpans`,
 * each wx reason to the `[{ start, end }]` of its words in the METAR's `raw`.
 * @param {{ icao?: any, name?: any, role?: string, metar?: any, taf?: any, limits?: any, options?: any, now?: any, feed?: any, timeZone?: any, notSetFor?: any }} [input]
 */
export function cardModel({ icao = null, name = null, role = 'ALT', metar = null, taf = null, limits, options, now, feed = {}, timeZone, notSetFor = null } = {}) {
  const at = toDate(now);
  const isHome = role === 'HOME';
  const notSet = typeof notSetFor === 'string' && notSetFor ? notSetFor : null;
  // At a base with no limits only dangerous weather is marked: a mark for "below" or "at the limit" would say a limit was checked.
  const shownMarks = (marks) => (notSet ? marks.filter((m) => m.level === 'caution') : marks);
  let used;
  let limitsText;
  const descent = !isHome && options?.visualDescent ? options.visualDescent : null;
  if (isHome) {
    const trigger = describeTrigger(limits);
    used = [{ ceilingFt: trigger.ceilingFt, visSm: trigger.visSm }];
    limitsText = trigger.label;
  } else {
    const given = options?.minima ?? limits;
    const list = (Array.isArray(given) ? given : given ? [given] : []).filter((m) => Number.isFinite(m?.ceilingFt) && Number.isFinite(m?.visSm));
    used = list.length ? list : [DEFAULT_LIMITS.alternate];
    limitsText = descent ? descentText(descent) : minimaText(used);
  }

  const metarLine = metarModel(metar, at, feed ?? {});
  const conditions = metarLine.state === 'missing' || metarLine.state === 'nil' ? null : metar.report.conditions;
  const check = conditions ? checkOptions(conditions, used) : null;
  const watch = check ? [...check.watch.vicinity, ...check.watch.snow, ...check.watch.shallowFog] : [];
  const parsedRaw = metar?.report?.raw;
  const reasonSpans = {};
  (check?.reasons ?? []).forEach((reason, i) => {
    reasonSpans[reason] = alignMarks(check.reasonSpans?.[i] ?? [], metarLine.raw, parsedRaw);
  });
  const tafLine = tafModel(taf, at, feed ?? {});

  return {
    icao,
    name,
    role: isHome ? 'HOME' : 'ALT',
    category: conditions ? flightCategory(conditions) : null,
    nato: conditions ? natoColour(conditions) : null,
    limitsText: notSet ? NOT_SET_LIMITS_TEXT : limitsText,
    metar: { ...metarLine, marks: check ? shownMarks(alignMarks(metarMarks(check, descent), metarLine.raw, parsedRaw)) : [] },
    taf: { ...tafLine, marks: shownMarks(tafMarks(tafLine, taf, { isHome, used, descent, now: at, timeZone })) },
    reasonSpans,
    result: notSet ? notSetResult(metarLine, conditions, at, isHome, notSet) : resultModel(metarLine, conditions, used, at, descent),
    cautions: check ? check.cautions : [],
    cautionReasons: check ? check.reasons.filter((r) => !limitReason(r)) : [],
    watch,
    watchText: watch.length ? `Watch: ${watch.join(' ')}` : null,
    alert: check ? (notSet ? check.cautions.length > 0 : check.alert) : false,
  };
}
