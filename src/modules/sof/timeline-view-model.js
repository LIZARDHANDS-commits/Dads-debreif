// What the 24-hour timeline draws, without a page (SPEC-sof, "24-hour timeline", task 5).
// timeline.js makes the model from wx's tafTimeline (pieces, wave bands, marks, axis);
// this feeds it the screen's reports, lays it out as rows of lines with percentages of
// the day, puts every piece in words for the hover and focus card, and works out where
// the arrow keys go. Nothing here reads a report or judges the weather.
import { timelineModel, timelineSignature, stepPiece } from './timeline.js';
import { snapLimits } from './settings-model.js';
import { dayLabel } from './waves-view-model.js';
import { withTafNote } from './taf-state.js';
import { zoneSpan, dayZones } from './zone-words.js';
import { siteFor } from './sites/index.js';
import { limitsSet, notSetWords, NOT_SET_KEY } from './limits-not-set.js';
import { usafStandards, usafAlternateMinima, assessUsafAlternate, usafHomeAssess, noReportStations, noReportsState, SOURCE_LINE, homeLabel } from './usaf-limits.js';

const two = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
const pct = (x) => Math.round(x * 100 * 1e6) / 1e6; // a fraction of the day as a percentage, without float noise

/**
 * The rows timeline.js takes: home first, then each alternate. Home gets the home limits (as the
 * cards and wave calls read them); an alternate gets airfields' whole `checkOptions(icao)` as
 * `options`, so its minima, landing minima and visual descent are the ones the calls use.
 * `snapshot` is the weather's (`taf` and `metar` map ICAO to `{ report }`).
 * At a home base with no weather limits (its site profile's `standards` is null) every row is `noLimits`: no piece is hatched or says "below".
 * At a USAF base (plan Step 2c part F) each row has its own check (`assess`, usaf-limits.js): home the 4.16.2.1 trigger and the forecast crosswind
 * (4.16.2.3), an alternate its 4.16.4.1 minima; an alternate whose minima can't be used is `noLimits` with a `note` saying why in words.
 */
export function timelineRows({ airfields, snapshot, limits }) {
  const home = airfields.home();
  const site = siteFor(home.icao);
  const noLimits = !limitsSet(site);
  const usaf = usafStandards(site);
  const noReports = usaf ? noReportStations(snapshot, airfields.alternates().map((f) => f.icao)) : new Set();
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
      ...(noLimits ? { noLimits: true } : {}),
      ...(usaf ? usafRow(field, isHome, usaf, noReports) : {}),
    });
  }
  return rows;
}

/** A row's own check at a USAF base: home's trigger and crosswind, an alternate's minima, or no check and a note in words. */
function usafRow(field, isHome, std, noReports) {
  if (isHome) return { limits: { ceilingFt: std.homeTrigger.ceilingFt, visSm: std.homeTrigger.visSm }, assess: usafHomeAssess(field.icao, std) };
  const state = noReports.has(field.icao) ? noReportsState(field.icao, std) : usafAlternateMinima(field, std);
  if (state.state !== 'ok') return { noLimits: true, note: state.state === 'incomplete' && state.short ? `${state.words}: ${state.short}` : state.words };
  return { assess: (taf, window) => assessUsafAlternate(taf, window, state.minima) };
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

function pieceView(icao, p, lane, timeZone, state) {
  const said = `${icao} ${p.text}. Zulu ${hhmm(p.fullFrom)}–${hhmm(p.fullTo)}, local ${zoneSpan(p.fullFrom, p.fullTo, timeZone)}.${p.summary ? ` Conditions: ${p.summary}.` : ''}`;
  const card = state?.note ? `${said} (${state.note})` : said;
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
    // "below" comes first, with a symbol: a narrow piece cuts the end of its label, never the non-colour signal.
    label: p.below ? `▼ below ${p.label.replace(/\s*\bbelow\b/, '')}`.trim() : p.label,
    clippedStart: p.clippedStart,
    clippedEnd: p.clippedEnd,
    card,
    ariaLabel: card,
  };
}

function rowView(r, timeZone, state, notSet) {
  const pieces = packLanes(r.pieces).map((lane, i) => pieceView(r.icao, r.pieces[i], lane, timeZone, state));
  // A row drawn from a stale TAF, or one that failed to refresh, says so beside whatever else it says.
  const words = state?.note ? withTafNote(r.words, state) : r.words;
  const lanes = 1 + Math.max(0, ...pieces.map((p) => p.lane));
  return {
    icao: r.icao,
    role: r.role,
    state: r.state,
    words,
    pieces,
    lanes,
    metar: r.metar?.visible ? { left: pct(r.metar.x), label: r.metar.label } : null,
    coverage: r.coverage ? { left: pct(r.coverage.x0), width: pct(r.coverage.x1 - r.coverage.x0) } : null,
    ariaLabel: `${r.icao} ${r.role === 'HOME' ? 'home' : 'alternate'}${notSet ? ', limits not set' : ''}${r.metar?.visible ? `, latest ${r.metar.label}` : ''}${words ? `: ${words}` : ''}`,
  };
}

function waveView(w, timeZone) {
  const mark = (m) => ({ left: pct(m.x), visible: m.visible, label: m.label });
  return {
    name: w.name,
    left: pct(w.x0),
    width: pct(w.x1 - w.x0),
    clippedStart: w.clippedStart,
    clippedEnd: w.clippedEnd,
    landing: mark(w.landing),
    landingPlus1: mark(w.landingPlus1),
    text: `${w.text}, local ${zoneSpan(w.from, w.to, timeZone)}. Landing ${hhmm(w.landing.at)}Z, landing + 1 h ${hhmm(w.landingPlus1.at)}Z.`,
  };
}

/**
 * The timeline for one moment, ready to draw. `waves` are waves.js's UTC waves (the Waves
 * part's `waves`); `day` is 'today' or 'tomorrow'; `timePrimary` is Settings' 'zulu' or
 * 'local' (Zulu first by default). Returns `{ problem, title, signature, axis, rows, waves, now }`:
 * every position is a percentage of the day, `signature` changes only when what is drawn
 * changes (not when the now line moves), and `now` is `{ left, minute, label }` or null.
 * `tafNotes` is taf-state.js's answer: a row on a stale or failed TAF says so.
 * `limitsNote` is `{ words: 'Limits not set for KDLF', title }` (the key line) at a home base with no weather limits, else null: the timeline and
 * the strip show it, and no piece is hatched.
 * @param {any} [args]
 */
export function buildTimelineView({ airfields, snapshot, limits, waves = [], day = 'today', now, timeZone, timePrimary = 'zulu', tafNotes = {} } = {}) {
  const homeIcao = airfields.home().icao;
  const site = siteFor(homeIcao);
  const limitsNote = limitsSet(site) ? null : { words: notSetWords(homeIcao), title: NOT_SET_KEY };
  // At a USAF base the timeline names its rule's source (plan Step 2c part F), where Moose Jaw's names none.
  const usaf = usafStandards(site);
  const sourceNote = usaf ? { words: SOURCE_LINE, title: `Home: ${homeLabel(usaf)} at any time of the day shown (the wave calls use ETA ± 1 h); alternates: their AFMAN 4.16.4.1 minima.` } : null;
  const model = timelineModel({
    rows: timelineRows({ airfields, snapshot, limits }),
    waves,
    now,
    timeZone,
    day,
    first: timePrimary === 'local' ? 'local' : 'utc',
  });
  // What the notes say is part of the picture, so it is redrawn when one appears or goes.
  const said = Object.entries(tafNotes).filter(([, n]) => n?.note).map(([icao, n]) => [icao, n.note]);
  const drawn = timelineSignature(model, { now: false });
  const signature = [said.length ? JSON.stringify([drawn, said]) : drawn, limitsNote?.words, sourceNote?.words].filter(Boolean).join('|');
  if (model.problem) return { problem: model.problem, title: '24-hour timeline', signature, axis: [], rows: [], waves: [], now: null, limitsNote, sourceNote };
  // The day's zone name, or both names on the day the clocks change.
  const zone = dayZones(model.axis.from, model.axis.to, timeZone);
  return {
    problem: null,
    title: `24-hour timeline, ${dayLabel(model.date)} (${zone})`,
    signature,
    axis: model.axis.rows.map((a) => ({
      zone: a.zone,
      label: a.zone === 'local' ? zone : a.label,
      ticks: a.ticks.map((t) => ({ left: pct(t.x), label: t.label, dayLabel: t.dayLabel })),
    })),
    rows: model.rows.map((r) => rowView(r, timeZone, tafNotes[r.icao], limitsNote)),
    waves: model.waves.map((w) => waveView(w, timeZone)),
    now: model.now ? { left: pct(model.now.x), minute: model.now.minute, label: `Now ${hhmm(model.now.at)}Z` } : null,
    limitsNote,
    sourceNote,
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
