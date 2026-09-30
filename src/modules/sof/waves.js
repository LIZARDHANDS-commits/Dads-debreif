// The SOF's waves: a day's plan in home local time to UTC, and each wave's
// alternate calls. Pure functions; "now" and the zone are passed in.
//
// Replaces V6's wave code, which added a fixed 6 h to local times (sof.html line
// 1441, and `absoluteLocal` at line 2032), kept an old date forever and
// dropped evening waves (audit #7). The weather answers all come from src/wx;
// this file only picks the window, the limits and the words (SPEC-sof,
// "Waves and the alternate call").

import { utcOffsetMinutes, zoneAbbreviation } from '../../core/time.js';
import { homeAlternateTrigger, arrivalWindow, assessAlternate } from '../../wx/alternates.js';
import { DEFAULT_LIMITS, HOME_TRIGGERS } from '../../wx/limits.js';
import { HOUR_MS } from '../../wx/dates.js';
import { CATALOG, DEFAULT_HOME } from '../../airfields/catalog.js';

/** As V6 (sof.html line 1220). */
export const MAX_WAVES = 5;

const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;
const HOME_ZONE = CATALOG[DEFAULT_HOME].timeZone; // Moose Jaw, only until the caller passes the home field's zone

// ---- Local times to UTC ---------------------------------------------------------

/** "HH:MM" as minutes after local midnight, or null if it isn't a time of day. */
export function parseClock(text) {
  const m = typeof text === 'string' ? text.match(/^(\d{2}):(\d{2})$/) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** The calendar date in a time zone at an instant: { year, month (1-12), day }. */
export function localDate(now, timeZone = HOME_ZONE) {
  const shifted = new Date(+now + utcOffsetMinutes(now, timeZone) * MINUTE_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** The date `days` after (or before) a calendar date. */
function addDays({ year, month, day }, days) {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The UTC instant of a wall-clock time (minutes after midnight) on a local date.
 * A time that happens twice when the clocks go back takes the first; one that
 * never happens when they go forward moves an hour later, as JavaScript's own
 * Date does. Moose Jaw has no daylight saving, so it is always local + 6 h.
 */
export function localToUtc({ year, month, day }, minutes, timeZone = HOME_ZONE) {
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  const first = wall - utcOffsetMinutes(new Date(wall), timeZone) * MINUTE_MS;
  const second = wall - utcOffsetMinutes(new Date(first), timeZone) * MINUTE_MS;
  const candidates = [...new Set([first, second])];
  // A candidate is real when its own offset takes it back to the wall time.
  const real = candidates.filter((t) => t + utcOffsetMinutes(new Date(t), timeZone) * MINUTE_MS === wall);
  return new Date(real.length ? Math.min(...real) : Math.max(...candidates));
}

/**
 * A day's plan `[{ name?, takeoff: 'HH:MM', land: 'HH:MM' }]` in home local time
 * as waves with UTC times, for Today or Tomorrow in the home zone (SOF-6).
 * `date` ({ year, month, day }) overrides `day`, for callers and tests that
 * have a date already. A landing not after takeoff is the next day (V6 line 1442).
 * Only the first MAX_WAVES are read; a wave without two readable times is
 * listed in `skipped` with the reason, never guessed.
 * Returns { date, zone, waves: [{ name, takeoff, land, nextDay }], skipped }.
 */
export function planToUtc(plan, { now = new Date(), timeZone = HOME_ZONE, day = 'today', date } = {}) {
  const today = localDate(now, timeZone);
  const on = date ?? (day === 'tomorrow' ? addDays(today, 1) : today);
  const waves = [];
  const skipped = [];
  (Array.isArray(plan) ? plan : []).slice(0, MAX_WAVES).forEach((entry, index) => {
    const name = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : `W${index + 1}`;
    const take = parseClock(entry?.takeoff);
    const land = parseClock(entry?.land);
    if (take == null || land == null) {
      skipped.push({ index, name, problem: take == null ? 'Takeoff time not set' : 'Landing time not set' });
      return;
    }
    const nextDay = land <= take;
    waves.push({
      name,
      takeoff: localToUtc(on, take, timeZone),
      land: localToUtc(nextDay ? addDays(on, 1) : on, land, timeZone),
      nextDay,
    });
  });
  return { date: on, zone: zoneAbbreviation(localToUtc(on, 12 * 60, timeZone), timeZone), waves, skipped };
}

/** A wave's home-weather window: takeoff to landing plus one hour (V6 lines 1441 to 1443). */
export function waveWindow(wave) {
  return { from: wave.takeoff, to: new Date(+wave.land + HOUR_MS) };
}

// ---- The alternate trigger ----------------------------------------------------------

// The numbers are wx's (HOME_TRIGGERS); the names are the words on the chips.
const PRESETS = [
  { id: 'local', name: 'Local (MTCA)', ...pick(HOME_TRIGGERS.local) },
  { id: 'crossCountry', name: 'Cross-country', ...pick(HOME_TRIGGERS.crossCountry) },
];
function pick({ ceilingFt, visSm }) {
  return { ceilingFt, visSm };
}

/** The limits a trigger choice fills in ('local' or 'crossCountry'); anything else is Local (D111). */
export function triggerLimits(id = 'local') {
  return pick(PRESETS.find((p) => p.id === id) ?? PRESETS[0]);
}

const clamp = (value, min, max, step, fallback) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
};

/**
 * Home limits from settings: ceiling 0 to 10,000 ft in 100s, visibility 0 to
 * 10 SM in quarter miles. A missing or unreadable number is Local's (2000, 3).
 */
export function cleanLimits(limits) {
  const fallback = DEFAULT_LIMITS.home;
  return {
    ceilingFt: clamp(limits?.ceilingFt, 0, 10000, 100, fallback.ceilingFt),
    visSm: clamp(limits?.visSm, 0, 10, 0.25, fallback.visSm),
  };
}

/**
 * Name the trigger the numbers make (D111): a preset when they match one, else
 * Custom. The label is built from the numbers used, so it can't disagree with
 * the check (D59): "Local (MTCA) 2000/3", "Custom 2500/3".
 */
export function describeTrigger(limits) {
  const { ceilingFt, visSm } = cleanLimits(limits);
  const preset = PRESETS.find((p) => p.ceilingFt === ceilingFt && p.visSm === visSm);
  const id = preset?.id ?? 'custom';
  const name = preset?.name ?? 'Custom';
  return { id, name, ceilingFt, visSm, label: `${name} ${ceilingFt}/${visSm}` };
}

/** Minima options as words: "600-2" or "800-2 or 900-1.5 or 1000-1". */
export function formatMinima(options) {
  return (Array.isArray(options) ? options : []).map((m) => `${m.ceilingFt}-${m.visSm}`).join(' or ');
}

// ---- Words for a call --------------------------------------------------------------------

const HOME_WORDS = {
  meets: ['No alternate needed', 'ok'],
  below: ['ALTERNATE REQUIRED', 'required'],
  'at-limit': ['At the limit', 'at-limit'],
  'not-covered': ["TAF doesn't cover the wave", 'unknown'],
  'no-taf': ['No TAF', 'unknown'],
  incomplete: ["Can't tell", 'unknown'],
  'no-time': ["Can't tell", 'unknown'],
};

const ALT_WORDS = {
  meets: ['Meets minima', 'ok'],
  below: ['Below minima', 'below'],
  'at-limit': ['At the limit', 'at-limit'],
  'not-covered': ["TAF doesn't cover the arrival", 'unknown'],
  'no-taf': ['No TAF', 'unknown'],
  incomplete: ["Can't tell", 'unknown'],
  'no-time': ["Can't tell", 'unknown'],
};

const two = (n) => String(n).padStart(2, '0');

/** A time as the SOF says it: "16Z", or "1630Z" when the minutes matter. */
function zulu(date) {
  const minutes = date.getUTCMinutes();
  return `${two(date.getUTCHours())}${minutes ? two(minutes) : ''}Z`;
}

const groupName = (p) => {
  if (p.kind === 'PREVAILING') return '';
  return p.kind === 'PROB' ? `PROB${p.probability}${p.tempo ? ' TEMPO' : ''}` : p.kind;
};

// A piece of forecast as a line: the airfield, the group, wx's reasons, and when
// the wave is first affected (never before the window starts).
function line(icao, level, piece, windowFrom, reasons) {
  const from = new Date(Math.max(+piece.from, +windowFrom));
  const group = groupName(piece);
  const say = (list) => [icao, group, list.join(', ')].filter(Boolean).join(' ') + ` from ${zulu(from)}`;
  return { level, kind: group, from, to: piece.to, reasons, text: say(reasons), first: say(reasons.slice(0, 1)) };
}

// wx's reasons for a caution are the ones that aren't the ceiling or visibility (those are the limit lines).
const cautionReasons = (piece) => piece.reasons.filter((r) => !/^(CEILING|VIS) /.test(r));

/** Every hit, at-limit piece and caution as lines, worst first, each level in time order. */
function detailLines(icao, result, windowFrom) {
  const byStart = (a, b) => +a.from - +b.from;
  const of = (level, pieces, reasonsOf) => pieces.map((p) => line(icao, level, p, windowFrom, reasonsOf(p))).sort(byStart);
  return [
    ...of('below', result.hits, (p) => p.reasons),
    ...of('at-limit', result.atLimit, (p) => p.reasons),
    ...of('caution', result.cautions, cautionReasons),
    ...of('unchecked', result.probUnchecked ?? [], (p) => p.reasons),
  ];
}

/** What the chip shows: the earliest piece behind the call and its first reason, or null when there is none. */
function firstReason(details, status) {
  const level = status === 'below' ? 'below' : status === 'at-limit' ? 'at-limit' : null;
  const lines = details.filter((d) => d.level === level);
  return lines.length ? { text: lines[0].first, from: lines[0].from, reasons: lines[0].reasons } : null;
}

// ---- Home and alternate calls -------------------------------------------------------------------

/**
 * The home call for a wave: wx's homeAlternateTrigger over takeoff to landing
 * plus one hour, against the home limits (default Local (MTCA) 2000/3).
 * `result` is wx's own answer, unchanged; the rest is words for the screen.
 */
export function homeCall(wave, homeTaf, limits, icao = homeTaf?.station ?? 'HOME') {
  const used = describeTrigger(limits);
  const window = waveWindow(wave);
  const result = homeAlternateTrigger(homeTaf, window, { ceilingFt: used.ceilingFt, visSm: used.visSm });
  const [words, tone] = HOME_WORDS[result.status] ?? HOME_WORDS['no-time'];
  const details = detailLines(icao, result, window.from);
  return {
    status: result.status,
    words,
    tone,
    label: used.label,
    limits: { ceilingFt: used.ceilingFt, visSm: used.visSm },
    firstReason: firstReason(details, result.status),
    details,
    problems: result.problems,
    result,
  };
}

/**
 * One alternate's call for a wave: wx's assessAlternate over the landing time
 * plus or minus 60 minutes (D70), with the options from
 * `airfields.checkOptions(icao)`. `note` says when the approaches aren't set
 * and 600-2 was used (D95).
 */
export function alternateCall(wave, icao, taf, options = {}) {
  const window = arrivalWindow([wave.land]);
  const result = assessAlternate(taf, window, options);
  const [words, tone] = ALT_WORDS[result.status] ?? ALT_WORDS['no-time'];
  const descent = options.visualDescent;
  const minima = options.minima ?? [DEFAULT_LIMITS.alternate];
  const minimaText = descent
    ? `Visual descent: MEA ${Number.isFinite(descent.meaFt) ? `${descent.meaFt} ft` : 'not set'} + 500 ft, ${descent.visSm} SM`
    : formatMinima(minima);
  const notSet = !descent && options.minimaChecked !== true;
  const details = detailLines(icao, result, window?.from ?? wave.land);
  return {
    icao,
    status: result.status,
    words,
    tone,
    minimaText,
    note: notSet ? `Approaches not set: checked against ${minimaText}` : null,
    firstReason: firstReason(details, result.status),
    details,
    warnings: result.warnings,
    problems: result.problems,
    result,
  };
}

/**
 * Every wave's calls: the home call and one call per alternate, and how many
 * alternates can be used (meeting or exactly at their minima).
 * `airfields` is app.airfields; `tafs` maps ICAO to a parsed TAF (or null);
 * `limits` are the home limits from Settings.
 */
export function waveCalls({ waves, airfields, tafs = {}, limits } = {}) {
  const home = airfields.home();
  const alternates = airfields.alternates();
  return (waves ?? []).map((wave) => {
    const calls = alternates.map((a) => alternateCall(wave, a.icao, tafs[a.icao] ?? null, airfields.checkOptions(a.icao)));
    return {
      wave,
      home: homeCall(wave, tafs[home.icao] ?? null, limits, home.icao),
      alternates: calls,
      meeting: calls.filter((c) => c.status === 'meets' || c.status === 'at-limit').length,
      of: calls.length,
    };
  });
}
