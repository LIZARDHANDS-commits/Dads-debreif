// The airfield card model: what one card says, decided without a page (SPEC-sof,
// "Airfield cards"). Pure: reports, limits and "now" go in, plain data comes out.
// The card DOM comes later (task 2) and only draws this.
//
// Every weather answer is wx's: the category, NATO state, limit check and
// cautions. Nothing here reads a report's text, except that a METAR's remarks
// (wx's own `remarks` field) are searched for LAST OBS/NXT, which wx has no
// field for.

import { checkConditions, flightCategory, natoColour, DEFAULT_LIMITS } from '../../wx/limits.js';
import { staleness, SOURCES } from '../../wx/sources.js';
import { ageMinutes, resolveDay, toDate, MINUTE_MS } from '../../wx/dates.js';
import { describeTrigger, minimaText, descentText } from './waves.js';

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

const LAST_OBS = /LAST OBS\/NXT (\d{2})(\d{2})(\d{2})Z/;

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
  const next = report.remarks?.match(LAST_OBS);
  const noObsUntil = next && now ? resolveDay(Number(next[1]), Number(next[2]), Number(next[3]), now, time) : null;
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

/**
 * wx's check against one limit or a list of equivalent options: below only when
 * below every option, at the limit when the best option is exactly met. This is
 * the choice alternates.js makes for its own pieces (its `checkOptions` isn't
 * exported), so an alternate's card and its wave call read a report the same way.
 */
function checkAgainst(conditions, limits) {
  const checks = limits.map((l) => checkConditions(conditions, l));
  return checks.find((c) => !c.belowLimits && !c.atLimit) ?? checks.find((c) => !c.belowLimits) ?? checks[0];
}

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
  const check = checkAgainst(conditions, limits);
  // Limits first, as wx orders them; cautions are listed apart and don't change this.
  const reasons = check.reasons.filter(limitReason);
  if (check.belowLimits) return { level: 'below', words: `Below limits: ${reasons.join(', ')}${note}`, reasons, stale };
  if (check.ceilingUnknown || check.visibilityUnknown) return { level: 'unknown', words: `Unknown: ${unknownWords(check, conditions)}${note}`, reasons: [], stale };
  if (check.atLimit) return { level: 'at-limit', words: `At the limit: ${reasons.join(', ')}${note}`, reasons, stale };
  return { level: 'within', words: `Within limits${note}`, reasons: [], stale };
}

// wx's reasons start with CEILING or VIS for the limit lines; the rest are cautions.
const limitReason = (r) => /^(CEILING|VIS) /.test(r);

// ---- The card ---------------------------------------------------------------------------------------------

/**
 * One airfield card.
 *
 * - `icao`, `name`, `role`: 'HOME' or 'ALT' (default 'ALT').
 * - `metar`, `taf`: report entries as wx's fetchReports gives them,
 *   `{ raw, report, source }`, or null when there is none. Staleness is decided
 *   here from `now`, never from a status stored earlier.
 * - `limits`: home limits `{ ceilingFt, visSm }` (default Local (MTCA) 2000/3).
 * - `options`: for an alternate, the whole `airfields.checkOptions(icao)` object.
 *   Its minima are used (default V6's 600-2); when it has a `visualDescent` (D80)
 *   600-2 is never used and the result is 'unknown', for the wave call to decide.
 * - `feed`: `{ lastTry, failed }` for the words about a missing or failed refresh.
 * - `now`: a Date. Without one every age is unknown and every report reads as stale.
 */
export function cardModel({ icao = null, name = null, role = 'ALT', metar = null, taf = null, limits, options, now, feed = {} } = {}) {
  const at = toDate(now);
  const isHome = role === 'HOME';
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
  const check = conditions ? checkAgainst(conditions, used) : null;
  const watch = check ? [...check.watch.vicinity, ...check.watch.snow, ...check.watch.shallowFog] : [];

  return {
    icao,
    name,
    role: isHome ? 'HOME' : 'ALT',
    category: conditions ? flightCategory(conditions) : null,
    nato: conditions ? natoColour(conditions) : null,
    limitsText,
    metar: metarLine,
    taf: tafModel(taf, at, feed ?? {}),
    result: resultModel(metarLine, conditions, used, at, descent),
    cautions: check ? check.cautions : [],
    cautionReasons: check ? check.reasons.filter((r) => !limitReason(r)) : [],
    watch,
    watchText: watch.length ? `Watch: ${watch.join(' ')}` : null,
    alert: check ? check.alert : false,
  };
}
