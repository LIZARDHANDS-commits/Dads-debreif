// The SOF's waves: a day's plan in home local time to UTC, and each wave's
// alternate calls. Pure functions; "now" and the zone are passed in.
//
// Replaces V6's wave code, which added a fixed 6 h to local times (sof.html line
// 1441, and `absoluteLocal` at line 2032), kept an old date forever and
// dropped evening waves (audit #7). The weather answers all come from src/wx;
// this file only picks the window, the limits and the words (SPEC-sof,
// "Waves and the alternate call").

import { utcOffsetMinutes, zoneAbbreviation } from '../../core/time.js';
import { homeAlternateTrigger, arrivalWindow, assessAlternate, visualDescentMinima, VISUAL_DESCENT_MARGIN_FT } from '../../wx/alternates.js';
import { DEFAULT_LIMITS, HOME_TRIGGERS } from '../../wx/limits.js';
import { HOUR_MS } from '../../wx/dates.js';
import { formatPair, formatSm } from '../../airfields/format.js';

/** As V6 (sof.html line 1220). */
export const MAX_WAVES = 5;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;

// ---- Local times to UTC ---------------------------------------------------------

/** "HH:MM" as minutes after local midnight, or null if it isn't a time of day. */
export function parseClock(text) {
  const m = typeof text === 'string' ? text.match(/^(\d{2}):(\d{2})$/) : null;
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * The calendar date in a time zone at an instant: { year, month (1-12), day }.
 * Null when the zone is missing or unknown: it never falls back to this machine's zone.
 */
export function localDate(now, timeZone) {
  if (!knownZone(timeZone)) return null;
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
 * A time that happens twice when the clocks go back takes the first occurrence,
 * east or west of UTC; one that never happens when they go forward moves to the
 * later instant, as JavaScript's own Date does. The two possible offsets are
 * read a day either side, so it doesn't depend on which way the zone lies.
 * Moose Jaw has no daylight saving, so it is always local + 6 h.
 * Null when the zone is missing or unknown: it never falls back to this machine's zone.
 */
export function localToUtc({ year, month, day }, minutes, timeZone) {
  if (!knownZone(timeZone)) return null;
  const wall = Date.UTC(year, month - 1, day, 0, minutes);
  const offsetAt = (t) => utcOffsetMinutes(new Date(t), timeZone) * MINUTE_MS;
  const candidates = [...new Set([wall - offsetAt(wall - DAY_MS), wall - offsetAt(wall + DAY_MS)])];
  // A candidate is real when its own offset takes it back to the wall time.
  const real = candidates.filter((t) => t + offsetAt(t) === wall);
  return new Date(real.length ? Math.min(...real) : Math.max(...candidates));
}

const knownZone = (zone) => {
  if (typeof zone !== 'string' || !zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/**
 * A day's plan `[{ name?, takeoff: 'HH:MM', land: 'HH:MM' }]` in home local time
 * as waves with UTC times, for Today or Tomorrow in the home zone (SOF-6).
 * `now` (a Date) and `timeZone` (the home field's IANA zone) are required: there
 * is no hidden clock and no default zone. If either is missing or unreadable,
 * nothing is guessed: no waves, every entry in `skipped`, and a `problem`.
 * `date` ({ year, month, day }) overrides `day`, for callers and tests that
 * have a date already. A landing not after takeoff is the next day (V6 line 1442).
 * Only the first MAX_WAVES are read; a wave without two readable times is
 * listed in `skipped` with the reason.
 * Returns { date, zone, waves: [{ name, takeoff, land, nextDay }], skipped, problem }.
 * @param {any} plan
 * @param {{ now?: any, timeZone?: any, day?: string, date?: any }} [input]
 */
export function planToUtc(plan, { now, timeZone, day = 'today', date } = {}) {
  const entries = (Array.isArray(plan) ? plan : []).slice(0, MAX_WAVES);
  const nameOf = (entry, index) => (typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : `W${index + 1}`);
  const problem = !(now instanceof Date) || Number.isNaN(+now) ? 'The time now is not known'
    : !knownZone(timeZone) ? 'The home time zone is not known' : null;
  if (problem) {
    return { date: null, zone: '', waves: [], skipped: entries.map((entry, index) => ({ index, name: nameOf(entry, index), problem })), problem };
  }
  const today = localDate(now, timeZone);
  const on = date ?? (day === 'tomorrow' ? addDays(today, 1) : today);
  const waves = [];
  const skipped = [];
  entries.forEach((entry, index) => {
    const name = nameOf(entry, index);
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
  return { date: on, zone: zoneAbbreviation(localToUtc(on, 12 * 60, timeZone), timeZone), waves, skipped, problem: null };
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
  return { id, name, ceilingFt, visSm, label: `${name} ${ceilingFt}/${formatSm(visSm)}` };
}

/**
 * Minima options as the Airfields panel writes them: "600-2", or
 * "800-2 (or 900-1½, 1000-1)".
 */
export function minimaText(options) {
  const [first, ...rest] = (Array.isArray(options) ? options : []).map(formatPair);
  if (!first) return '';
  return rest.length ? `${first} (or ${rest.join(', ')})` : first;
}

/**
 * A visual descent (D80) in words, as the Airfields panel writes it, with the
 * +500 ft shown: "Visual descent from MEA 4,500 ft + 500 ft, 3 SM", and with the
 * ceiling above the field when its elevation is known: "... + 500 ft (ceiling 3,108 ft, 3 SM)".
 */
export function descentText({ meaFt, elevationFt, visSm }) {
  if (!Number.isFinite(meaFt)) return 'Visual descent, needs MEA';
  const ft = (n) => n.toLocaleString('en-CA');
  const start = `Visual descent from MEA ${ft(meaFt)} ft + ${VISUAL_DESCENT_MARGIN_FT} ft`;
  // wx works out the ceiling (MEA + 500 ft above the field) and the visibility it will check.
  const [minima] = visualDescentMinima({ meaFt, elevationFt, visSm }) ?? [];
  if (minima) return `${start} (ceiling ${ft(minima.ceilingFt)} ft, ${formatSm(minima.visSm)} SM)`;
  return `${start}, ${formatSm(visSm)} SM`;
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

/**
 * What the chip shows: the earliest piece below the limits, else the earliest
 * exactly at them, whatever the status. A TAF that covers only part of a wave
 * can still show a hit it does know about. Null when there is none.
 */
function firstReason(details) {
  const lines = ['below', 'at-limit'].map((level) => details.find((d) => d.level === level)).find(Boolean);
  return lines ? { text: lines.first, from: lines.from, reasons: lines.reasons } : null;
}

/** Why a call can't be made: what the TAF covers against what the wave needs, or what couldn't be read. */
function whyUnknown(result, window, endWord) {
  if (result.status === 'not-covered' || (result.status === 'below' && result.covered === false)) {
    if (!result.validFrom || !result.validTo) return 'TAF valid period unknown';
    if (+result.validFrom > +window.from) return `TAF valid from ${zulu(result.validFrom)}; ${endWord.start} ${zulu(window.from)}`;
    return `TAF valid to ${zulu(result.validTo)}; ${endWord.end} ${zulu(endWord.at)}${endWord.suffix ?? ''}`;
  }
  if (result.status === 'incomplete') {
    const first = result.problems?.[0];
    return `A ceiling or visibility in the TAF can't be read${first ? `: ${first}` : ''}`;
  }
  return null;
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
  let [words, tone] = HOME_WORDS[result.status] ?? HOME_WORDS['no-time'];
  // A hit in the part the TAF covers can only get worse with more TAF, so it is
  // never reported as unknown. At-limit pieces alone stay unknown.
  if (result.covered === false && result.hits.length) [words, tone] = ["ALTERNATE REQUIRED (TAF doesn't cover the whole wave)", 'required'];
  const details = detailLines(icao, result, window.from);
  return {
    status: result.status,
    words,
    tone,
    label: used.label,
    limits: { ceilingFt: used.ceilingFt, visSm: used.visSm },
    firstReason: firstReason(details),
    hasHit: result.hits.length > 0,
    why: whyUnknown(result, window, { start: 'wave starts', end: 'window ends', at: window.to, suffix: ' (landing + 1 h)' }),
    details,
    problems: result.problems,
    result,
  };
}

/**
 * One alternate's call for a wave: wx's assessAlternate over the landing time
 * plus or minus 60 minutes (D70), with the options from
 * the airfields' `checkOptions(icao)`. `note` says when the approaches aren't set
 * and 600-2 was used (D95).
 */
export function alternateCall(wave, icao, taf, options = {}) {
  const window = arrivalWindow([wave.land]);
  const result = assessAlternate(taf, window, options);
  let [words, tone] = ALT_WORDS[result.status] ?? ALT_WORDS['no-time'];
  if (result.covered === false && result.hits.length) [words, tone] = ["Below minima (TAF doesn't cover the whole arrival)", 'below'];
  const descent = options.visualDescent;
  const minima = options.minima ?? [DEFAULT_LIMITS.alternate];
  const usedText = descent ? descentText(descent) : minimaText(minima);
  const notSet = !descent && options.minimaChecked !== true;
  const details = detailLines(icao, result, window?.from ?? wave.land);
  return {
    icao,
    status: result.status,
    words,
    tone,
    minimaText: usedText,
    note: notSet ? `Approaches not set: checked against ${usedText}` : null,
    firstReason: firstReason(details),
    hasHit: result.hits.length > 0,
    why: whyUnknown(result, window ?? { from: wave.land, to: wave.land }, { start: 'arrival window starts', end: 'arrival window ends', at: window?.to ?? wave.land }),
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
 * @param {{ waves?: any, airfields?: any, tafs?: any, limits?: any }} [input]
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
