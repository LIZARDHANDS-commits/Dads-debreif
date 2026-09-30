// What the 24-hour timeline draws, without a page (SPEC-sof, "24-hour timeline", task 5).
// timeline.js makes the model from wx's tafTimeline (pieces, wave bands, marks, axis);
// this feeds it the screen's reports, lays it out as rows of lines with percentages of
// the day, puts every piece in words for the hover and focus card, and works out where
// the arrow keys go. Nothing here reads a report or judges the weather.
import { formatInZone } from '../../core/time.js';
import { timelineModel, timelineSignature, stepPiece } from './timeline.js';
import { snapLimits } from './settings-model.js';
import { dayLabel } from './waves-view-model.js';

const two = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
const pct = (x) => Math.round(x * 100 * 1e6) / 1e6; // a fraction of the day as a percentage, without float noise
const localClock = (d, timeZone) => formatInZone(d, timeZone).slice(0, 5);

/**
 * The rows timeline.js takes: home first, then each alternate. Home gets the home limits (as the
 * cards and wave calls read them); an alternate gets airfields' whole `checkOptions(icao)` as
 * `options`, so its minima, landing minima and visual descent are the ones the calls use.
 * `snapshot` is the weather's (`taf` and `metar` map ICAO to `{ report }`).
 */
export function timelineRows({ airfields, snapshot, limits }) {
  const home = airfields.home();
  const rows = [];
  const seen = new Set();
  for (const field of [home, ...airfields.alternates()]) {
    if (seen.has(field.icao)) continue;
    seen.add(field.icao);
    const isHome = field.icao === home.icao;
    rows.push({
      icao: field.icao,
      role: isHome ? 'HOME' : 'ALT',
      taf: snapshot.taf?.[field.icao]?.report ?? null,
      metar: snapshot.metar?.[field.icao]?.report ?? null,
      ...(isHome ? { limits: snapLimits(limits) } : { options: airfields.checkOptions(field.icao) }),
    });
  }
  return rows;
}

// Overlays go on lines under the prevailing one, each on the first line where it doesn't touch another.
function packLanes(pieces) {
  const ends = []; // the end of the last piece on each overlay line
  return pieces.map((p) => {
    if (p.lane === 'prevailing') return 0;
    let at = ends.findIndex((end) => end <= p.x0 + 1e-9);
    if (at < 0) at = ends.length;
    ends[at] = p.x1;
    return at + 1;
  });
}

function pieceView(icao, p, lane, timeZone, zone) {
  const card = `${icao} ${p.text}. Zulu ${hhmm(p.fullFrom)}–${hhmm(p.fullTo)}, local ${localClock(p.fullFrom, timeZone)}–${localClock(p.fullTo, timeZone)} ${zone}.${p.summary ? ` Conditions: ${p.summary}.` : ''}`;
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    lane,
    left: pct(p.x0),
    width: pct(p.x1 - p.x0),
    nato: p.nato,
    below: p.below,
    unchecked: p.unchecked,
    hatch: p.below, // a hatch as well as the word "below", so colour is never the only sign
    label: p.label,
    clippedStart: p.clippedStart,
    clippedEnd: p.clippedEnd,
    card,
    ariaLabel: card,
  };
}

function rowView(r, timeZone, zone) {
  const pieces = packLanes(r.pieces).map((lane, i) => pieceView(r.icao, r.pieces[i], lane, timeZone, zone));
  const lanes = 1 + Math.max(0, ...pieces.map((p) => p.lane));
  return {
    icao: r.icao,
    role: r.role,
    state: r.state,
    words: r.words,
    pieces,
    lanes,
    metar: r.metar?.visible ? { left: pct(r.metar.x), label: r.metar.label } : null,
    coverage: r.coverage ? { left: pct(r.coverage.x0), width: pct(r.coverage.x1 - r.coverage.x0) } : null,
    ariaLabel: `${r.icao} ${r.role === 'HOME' ? 'home' : 'alternate'}${r.metar?.visible ? `, latest ${r.metar.label}` : ''}${r.words ? `: ${r.words}` : ''}`,
  };
}

function waveView(w) {
  const mark = (m) => ({ left: pct(m.x), visible: m.visible, label: m.label });
  return {
    name: w.name,
    left: pct(w.x0),
    width: pct(w.x1 - w.x0),
    clippedStart: w.clippedStart,
    clippedEnd: w.clippedEnd,
    landing: mark(w.landing),
    landingPlus1: mark(w.landingPlus1),
    text: `${w.text}, local ${w.localText}. Landing ${hhmm(w.landing.at)}Z, landing + 1 h ${hhmm(w.landingPlus1.at)}Z.`,
  };
}

/**
 * The timeline for one moment, ready to draw. `waves` are waves.js's UTC waves (the Waves
 * part's `waves`); `day` is 'today' or 'tomorrow'; `timePrimary` is Settings' 'zulu' or
 * 'local' (Zulu first by default). Returns `{ problem, title, signature, axis, rows, waves, now }`:
 * every position is a percentage of the day, `signature` changes only when what is drawn
 * changes (not when the now line moves), and `now` is `{ left, minute, label }` or null.
 * @param {any} [args]
 */
export function buildTimelineView({ airfields, snapshot, limits, waves = [], day = 'today', now, timeZone, timePrimary = 'zulu' } = {}) {
  const model = /** @type {any} */ (timelineModel)({
    rows: timelineRows({ airfields, snapshot, limits }),
    waves,
    now,
    timeZone,
    day,
    first: timePrimary === 'local' ? 'local' : 'utc',
  });
  const signature = timelineSignature(model, { now: false });
  if (model.problem) return { problem: model.problem, title: '24-hour timeline', signature, axis: [], rows: [], waves: [], now: null };
  return {
    problem: null,
    title: `24-hour timeline, ${dayLabel(model.date)} (${model.zone})`,
    signature,
    axis: model.axis.rows.map((a) => ({
      zone: a.zone,
      label: a.label,
      ticks: a.ticks.map((t) => ({ left: pct(t.x), label: t.label, dayLabel: t.dayLabel })),
    })),
    rows: model.rows.map((r) => rowView(r, timeZone, model.zone)),
    waves: model.waves.map(waveView),
    now: model.now ? { left: pct(model.now.x), minute: model.now.minute, label: `Now ${hhmm(model.now.at)}Z` } : null,
  };
}

/**
 * Where an arrow key goes from a piece: the id of the piece to focus, or null to stay put.
 * Left and Right step along the row in time order, Home and End go to its ends, and Up and
 * Down go to the nearest row above or below that has a piece, to the one under the same time.
 */
export function moveFocus(view, id, key) {
  const at = view.rows.findIndex((r) => r.pieces.some((p) => p.id === id));
  if (at < 0) return null;
  const { pieces } = view.rows[at];
  const here = pieces.find((p) => p.id === id);
  if (key === 'ArrowRight' || key === 'ArrowLeft') {
    const order = [...pieces].sort((a, b) => a.left - b.left || a.lane - b.lane);
    // stepPiece takes pieces with a start time; the left edge orders them the same way.
    const next = stepPiece(order.map((p) => ({ id: p.id, from: p.left })), id, key === 'ArrowRight' ? 'next' : 'previous');
    return next?.id ?? null;
  }
  if (key === 'Home') return pieces[0]?.id === id ? null : pieces[0].id;
  if (key === 'End') return pieces.at(-1)?.id === id ? null : pieces.at(-1).id;
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;
  const step = key === 'ArrowDown' ? 1 : -1;
  for (let i = at + step; i >= 0 && i < view.rows.length; i += step) {
    const there = view.rows[i].pieces;
    if (!there.length) continue;
    const under = there.find((p) => p.left <= here.left + 1e-9 && here.left <= p.left + p.width + 1e-9);
    const nearest = [...there].sort((a, b) => Math.abs(a.left - here.left) - Math.abs(b.left - here.left))[0];
    return (under ?? nearest).id;
  }
  return null;
}
