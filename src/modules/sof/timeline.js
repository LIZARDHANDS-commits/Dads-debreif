// The SOF's 24-hour timeline as data: pieces, wave bands, marks and axis ticks.
// Pure and DOM-free; the canvas that draws it comes later (SPEC-sof, "24-hour
// timeline", task 5). "Now" and the zone are passed in.
//
// Replaces V6's five timelines, which each read TAFs themselves. The pieces are
// wx's `tafTimeline`, whole; the colour is wx's `natoColour`, and "below" is
// wx's own limit check (`assessAlternate`'s hits over the day), so the timeline
// can't disagree with the calls above it. Positions are fractions (0 to 1) of
// the day's real length, so a clock-change day is still drawn true.

import { utcOffsetMinutes, zoneAbbreviation, formatInZone } from '../../core/time.js';
import { tafTimeline } from '../../wx/taf.js';
import { assessAlternate } from '../../wx/alternates.js';
import { natoColour, DEFAULT_LIMITS } from '../../wx/limits.js';
import { HOUR_MS, MINUTE_MS } from '../../wx/dates.js';
import { localDate, localToUtc } from './waves.js';

const two = (n) => String(n).padStart(2, '0');
const validDate = (d) => d instanceof Date && !Number.isNaN(+d);

/** "1800Z". */
const hhmmZ = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}Z`;

/** "29/22Z", or "29/2230Z" when the minutes matter. */
const dayHourZ = (d) => `${two(d.getUTCDate())}/${two(d.getUTCHours())}${d.getUTCMinutes() ? two(d.getUTCMinutes()) : ''}Z`;

const addDays = ({ year, month, day }, days) => {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
};

const isDate = (d) => Number.isInteger(d?.year) && Number.isInteger(d?.month) && Number.isInteger(d?.day);

// ---- Axis ------------------------------------------------------------------------------------

const STEPS = [1, 2, 3, 4, 6, 12];
const SCAN_MS = 15 * MINUTE_MS; // every zone in use is a whole number of quarter hours from UTC

/** Ticks on one clock: whole hours that are a multiple of `step` on that clock, ends included. */
function ticksOn(zone, from, to, step, timeZone) {
  const ticks = [];
  const span = +to - +from;
  for (let t = Math.ceil(+from / SCAN_MS) * SCAN_MS; t <= +to; t += SCAN_MS) {
    const shifted = new Date(zone === 'utc' ? t : t + utcOffsetMinutes(new Date(t), timeZone) * MINUTE_MS);
    if (shifted.getUTCMinutes() !== 0 || shifted.getUTCHours() % step !== 0) continue;
    const hour = two(shifted.getUTCHours());
    ticks.push({
      at: new Date(t),
      x: span > 0 ? (t - +from) / span : 0,
      label: zone === 'utc' ? `${hour}Z` : `${hour}:00`,
      // The date, at the start and whenever a new day begins on this clock.
      dayLabel: !ticks.length || shifted.getUTCHours() === 0 ? two(shifted.getUTCDate()) : null,
    });
  }
  return ticks;
}

/**
 * The axis labels for a span, one row per clock, Zulu first (`first: 'local'`
 * puts the local row first; `showLocal: false` leaves it out). Ticks fall on
 * whole hours on each clock, every `stepHours` (1, 2, 3, 4, 6 or 12; else 3).
 * Returns `[{ zone: 'utc' | 'local', label, ticks: [{ at, x, label, dayLabel }] }]`,
 * or `[]` when the span can't be read.
 */
export function axisTicks({ from, to, timeZone, stepHours = 3, first = 'utc', showLocal = true } = {}) {
  if (!validDate(from) || !validDate(to) || +to < +from) return [];
  const step = STEPS.includes(stepHours) ? stepHours : 3;
  const utc = { zone: 'utc', label: 'Zulu', ticks: ticksOn('utc', from, to, step) };
  if (!showLocal || !localDate(from, timeZone)) return [utc];
  const middle = new Date((+from + +to) / 2);
  const local = { zone: 'local', label: zoneAbbreviation(middle, timeZone), ticks: ticksOn('local', from, to, step, timeZone) };
  return first === 'local' ? [local, utc] : [utc, local];
}

// ---- Rows and pieces ----------------------------------------------------------------------------

const isLimit = (m) => m != null && Number.isFinite(m.ceilingFt) && Number.isFinite(m.visSm);

/** One `{ ceilingFt, visSm }` or a list of equivalent options; the airfield's default when none is usable. */
function limitsOf(entry) {
  const list = (Array.isArray(entry?.limits) ? entry.limits : [entry?.limits]).filter(isLimit);
  return list.length ? list : [entry?.role === 'HOME' ? DEFAULT_LIMITS.home : DEFAULT_LIMITS.alternate];
}

const groupName = (piece) => {
  if (piece.kind === 'PREVAILING') return 'PREVAILING';
  return piece.kind === 'PROB' ? `PROB${piece.probability}${piece.tempo ? ' TEMPO' : ''}` : piece.kind;
};

const pieceKey = (kind, group, from, to) => `${kind}|${group}|${+from}|${+to}`;

function piecesOf(icao, parsed, axis, limits) {
  const tl = tafTimeline(parsed);
  const flat = [
    ...tl.prevailing.map((p) => ({ lane: 'prevailing', kind: 'PREVAILING', ...p })),
    ...tl.overlays.map((o) => ({ lane: 'overlay', ...o })),
  ].filter((p) => +p.to > +axis.from && +p.from < +axis.to);
  // Below is wx's: the pieces its alternate check calls hits over the day. PROB pieces
  // are checked against the same limits, so every hatched piece says so.
  const hits = new Set(assessAlternate(parsed, { from: axis.from, to: axis.to }, { minima: limits, landingMinima: limits })
    .hits.map((h) => pieceKey(h.kind, h.group, h.from, h.to)));
  const span = +axis.to - +axis.from;
  return flat
    .sort((a, b) => +a.from - +b.from || (a.lane === b.lane ? 0 : a.lane === 'prevailing' ? -1 : 1) || a.group - b.group)
    .map((p) => {
      const from = new Date(Math.max(+p.from, +axis.from));
      const to = new Date(Math.min(+p.to, +axis.to));
      const name = groupName(p);
      const nato = natoColour(p.conditions);
      const below = hits.has(pieceKey(p.kind, p.group, p.from, p.to));
      return {
        id: `${icao}:${p.lane}:${p.group}:${+p.from}`,
        lane: p.lane,
        kind: p.kind,
        name,
        group: p.group,
        fullFrom: p.from,
        fullTo: p.to,
        from,
        to,
        x0: (+from - +axis.from) / span,
        x1: (+to - +axis.from) / span,
        clippedStart: +p.from < +axis.from,
        clippedEnd: +p.to > +axis.to,
        nato,
        below,
        label: [p.lane === 'prevailing' ? null : name, nato, below ? 'below' : null].filter(Boolean).join(' '),
        text: `${name} ${dayHourZ(p.from)}–${dayHourZ(p.to)}: ${nato}${below ? ', below limits' : ''}`,
        conditions: p.conditions,
      };
    });
}

function metarMark(metar, axis) {
  const time = metar?.nil ? null : metar?.time;
  if (!validDate(time)) return null;
  const x = (+time - +axis.from) / (+axis.to - +axis.from);
  return { at: time, x, visible: x >= 0 && x <= 1, label: `METAR ${hhmmZ(time)}` };
}

function rowModel(entry, axis) {
  const icao = typeof entry?.icao === 'string' ? entry.icao : null;
  const parsed = entry?.taf;
  const base = {
    icao,
    role: entry?.role === 'HOME' ? 'HOME' : 'ALT',
    state: 'ok',
    words: null,
    validFrom: null,
    validTo: null,
    coverage: null,
    pieces: [],
    metar: metarMark(entry?.metar, axis),
  };
  const unusable = !parsed ? ['no-taf', 'No TAF']
    : parsed.cancelled ? ['cancelled', 'TAF cancelled']
      : parsed.nil ? ['nil', 'TAF NIL: none issued']
        : !validDate(parsed.validFrom) || !validDate(parsed.validTo) ? ['no-valid-period', 'TAF valid period unknown'] : null;
  if (unusable) return { ...base, state: unusable[0], words: unusable[1] };

  const span = +axis.to - +axis.from;
  const covers = +parsed.validTo > +axis.from && +parsed.validFrom < +axis.to;
  const from = new Date(Math.max(+parsed.validFrom, +axis.from));
  const to = new Date(Math.min(+parsed.validTo, +axis.to));
  return {
    ...base,
    validFrom: parsed.validFrom,
    validTo: parsed.validTo,
    coverage: covers ? { x0: (+from - +axis.from) / span, x1: (+to - +axis.from) / span, from, to } : null,
    pieces: piecesOf(icao ?? '', parsed, axis, limitsOf(entry)),
  };
}

// ---- Waves and marks ------------------------------------------------------------------------------

function waveModel(wave, index, axis, timeZone) {
  if (!validDate(wave?.takeoff) || !validDate(wave?.land) || +wave.land <= +wave.takeoff) return null;
  if (+wave.land <= +axis.from || +wave.takeoff >= +axis.to) return null;
  const span = +axis.to - +axis.from;
  const x = (t) => (+t - +axis.from) / span;
  const name = typeof wave.name === 'string' && wave.name.trim() ? wave.name.trim() : `W${index + 1}`;
  const mark = (at, words) => ({ at, x: x(at), visible: +at >= +axis.from && +at <= +axis.to, label: `${name} ${words} ${hhmmZ(at)}` });
  const landingPlus1 = new Date(+wave.land + HOUR_MS);
  const local = (d) => formatInZone(d, timeZone).slice(0, 5);
  return {
    name,
    from: wave.takeoff,
    to: wave.land,
    x0: Math.max(0, x(wave.takeoff)),
    x1: Math.min(1, x(wave.land)),
    clippedStart: +wave.takeoff < +axis.from,
    clippedEnd: +wave.land > +axis.to,
    landing: mark(wave.land, 'landing'),
    landingPlus1: mark(landingPlus1, 'landing + 1 h'),
    text: `${name} ${hhmmZ(wave.takeoff)}–${hhmmZ(wave.land)}`,
    localText: `${local(wave.takeoff)}–${local(wave.land)} ${zoneAbbreviation(wave.takeoff, timeZone)}`,
  };
}

// ---- The model ---------------------------------------------------------------------------------------------

/**
 * The timeline for one day at home.
 *
 * - `rows`: one per airfield, home first: `{ icao, role: 'HOME' | 'ALT', taf, limits?, metar? }`.
 *   `taf` is wx's parsed TAF (or null); `limits` is `{ ceilingFt, visSm }` or a
 *   list of equivalent options (home: the trigger limits; alternate: its
 *   minima), else Local (MTCA) 2000/3 for home and 600-2 for an alternate;
 *   `metar` is wx's parsed METAR, for the mark.
 * - `waves`: `planToUtc(...).waves`, as they are.
 * - `now` (a Date) and `timeZone` (the home field's IANA zone) are required:
 *   there is no hidden clock and no default zone. Without them nothing is
 *   guessed: no axis, no rows, and a `problem`.
 * - `day`: 'today' (default) or 'tomorrow' at home; `date` ({ year, month, day }) overrides it.
 * - `first`, `showLocal`, `stepHours`: the axis (see `axisTicks`).
 *
 * The day is the home zone's local day (00:00 to 24:00), so an evening wave is on it.
 * Everything positioned has `x` (or `x0`, `x1`) as a fraction of the day from 0 to 1;
 * a mark or piece off the day has `visible: false` or is cut to it (`clippedStart`,
 * `clippedEnd`) and keeps its full times. Returns
 * `{ problem, date, zone, axis: { from, to, rows }, rows, waves, now }`.
 */
export function timelineModel({ rows = [], waves = [], now, timeZone, day = 'today', date, first, showLocal, stepHours } = {}) {
  const problem = !validDate(now) ? 'The time now is not known' : !localDate(now, timeZone) ? 'The home time zone is not known' : null;
  if (problem) return { problem, date: null, zone: '', axis: null, rows: [], waves: [], now: null };

  const today = localDate(now, timeZone);
  const on = isDate(date) ? { year: date.year, month: date.month, day: date.day } : day === 'tomorrow' ? addDays(today, 1) : today;
  const from = localToUtc(on, 0, timeZone);
  const to = localToUtc(addDays(on, 1), 0, timeZone);
  const axis = { from, to, rows: axisTicks({ from, to, timeZone, stepHours, first, showLocal }) };
  const inDay = +now >= +from && +now <= +to;
  return {
    problem: null,
    date: on,
    zone: zoneAbbreviation(localToUtc(on, 12 * 60, timeZone), timeZone),
    axis,
    rows: (Array.isArray(rows) ? rows : []).map((entry) => rowModel(entry, axis)),
    waves: (Array.isArray(waves) ? waves : []).map((w, i) => waveModel(w, i, axis, timeZone)).filter(Boolean),
    now: inDay ? { at: now, x: (+now - +from) / (+to - +from), minute: Math.floor(+now / MINUTE_MS) } : null,
  };
}

// ---- Keyboard stepping ---------------------------------------------------------------------------------------

/**
 * The next or previous piece in a row's `pieces` (already in time order), for the
 * arrow keys. `from` is the piece you are on (or its id), or a time (a Date or
 * a timestamp): the next piece starting after it, or the previous one starting
 * before it. With nothing (or an id that isn't there) next is the first piece
 * and previous the last. At either end it returns null and stays put, or goes
 * round to the other end with `{ wrap: true }`.
 */
export function stepPiece(pieces, from = null, direction = 'next', { wrap = false } = {}) {
  const list = Array.isArray(pieces) ? pieces : [];
  if (!list.length || (direction !== 'next' && direction !== 'previous')) return null;
  const forward = direction === 'next';
  const ends = () => (forward ? list[0] : list.at(-1));
  const around = (found) => found ?? (wrap ? ends() : null);

  if (validDate(from) || typeof from === 'number') {
    const t = +from;
    return around(forward ? list.find((p) => +p.from > t) : list.findLast((p) => +p.from < t));
  }
  const id = typeof from === 'string' ? from : from?.id;
  const at = typeof id === 'string' ? list.findIndex((p) => p.id === id) : -1;
  if (at < 0) return ends();
  return around(list[at + (forward ? 1 : -1)]);
}

// ---- Redraw only on change ---------------------------------------------------------------------------------------

/**
 * A string that is the same for two timelines exactly when they would be drawn
 * the same, so the screen redraws only when it changes. It holds every time,
 * colour, label, hatch, wave, mark and tick; not the raw reports. The now line is
 * in it at its minute; `{ now: false }` leaves it out, for the parts that
 * don't move with the clock.
 */
export function timelineSignature(model, { now = true } = {}) {
  if (!model) return 'none';
  if (!model.axis) return `problem:${model.problem}`;
  const t = (d) => (d ? +d : null);
  return JSON.stringify([
    t(model.axis.from), t(model.axis.to), model.zone,
    model.axis.rows.map((r) => [r.zone, r.label, r.ticks.map((k) => [+k.at, k.label, k.dayLabel])]),
    model.rows.map((r) => [
      r.icao, r.role, r.state, t(r.validFrom), t(r.validTo), r.metar && [+r.metar.at, r.metar.label],
      r.pieces.map((p) => [p.id, +p.from, +p.to, +p.fullFrom, +p.fullTo, p.nato, p.below, p.label]),
    ]),
    model.waves.map((w) => [w.name, +w.from, +w.to, +w.landing.at, +w.landingPlus1.at]),
    now ? (model.now ? model.now.minute : null) : 'off',
  ]);
}

/** True when two timelines would be drawn the same. */
export function sameTimeline(a, b, options) {
  return timelineSignature(a, options) === timelineSignature(b, options);
}
