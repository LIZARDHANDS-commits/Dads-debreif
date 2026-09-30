// A sequence of turns (task 17, item 7): turns flown one after another, each starting where the last ended, with wings-level legs between
// them, and the G-warm built from it (SMM 16.22 paras 70 and 71, Figure 16.26; refs only, the manual's text stays out of the repo).
//
// PURE and deterministic: settings and legs in, plain state out, no page, no timers, no randomness. Every leg is a createRun (run.js) of its
// own, so the flying is the run's, pinned to V6 by the run golden test; the sequence adds only the joins. A leg's run is started on the
// exact position and heading the last leg's run ended on (createRun's continueFrom: nothing is converted or rounded). A turn leg ends on
// the step that finishes its turn (state.turnComplete); a wings-level leg (createRun's level) ends after its seconds, counted in whole 0.05 s
// steps. V6 has no sequence, so there is no golden test; tests/unit/turn-sim/sequence.test.js states timing and continuity.
//
// Two-ship only for now. The spread-4 G-warm (16.44, Figure 16.35) is a four-aircraft picture that is checked with Patrick before it is built,
// so a four-ship or the box is refused here with the reason (a test.todo waits for it).
//
// Per-aircraft settings (G error, delay error, turn logic) apply in every leg, as they do in a run: a delay error delays that aircraft's start
// of each turn by the same amount. Position errors only set the start of the first leg.
import { compassDegToHeadingRad } from '../../../core/angles.js';
import { DEFAULTS } from '../settings.js';
import { createRun } from './run.js';
import { startPositions } from './formation.js';
import { STEP_SEC } from './step.js';

/** The names turn legs get in the labels when the leg gives none. */
const TURN_LABELS = { inplace90: 'In place 90', hook90: 'Hook', delayed90away: 'Delayed 90', delayed45away: 'Delayed 45', shackle45: 'Shackle', cross180: 'Cross turn', check30: 'Check turn' };

/** A sequence has no reason to run for ever: a run this long is stopped by the leg's own end, not by the Duration. */
const LEG_DURATION_SEC = 1e9;

/**
 * @typedef {{ kind: 'turn', maneuver: string, turnDeg: number, direction: 'left' | 'right', baseG: number, label?: string, note?: string }} TurnLeg
 * @typedef {{ kind: 'level', holdSec: number, label?: string, note?: string }} LevelLeg
 */

/** A leg's list entry checked and named, or a RangeError saying what is wrong with it. */
function checkedLeg(leg, i) {
  if (leg && leg.kind === 'level') {
    if (!(leg.holdSec > 0) || !Number.isFinite(leg.holdSec)) throw new RangeError(`leg ${i}: holdSec must be a number of seconds above 0`);
    return { ...leg, label: leg.label ?? 'Wings level' };
  }
  if (leg && leg.kind === 'turn') {
    if (!(leg.turnDeg > 0) || !Number.isFinite(leg.turnDeg)) throw new RangeError(`leg ${i}: turnDeg must be a number of degrees above 0`);
    if (leg.direction !== 'left' && leg.direction !== 'right') throw new RangeError(`leg ${i}: direction must be 'left' or 'right'`);
    return { ...leg, label: leg.label ?? TURN_LABELS[leg.maneuver] ?? leg.maneuver };
  }
  throw new RangeError(`leg ${i}: kind must be 'turn' or 'level'`);
}

/** The aircraft as [id, xFt, yFt, headingRad] rows: what a leg started from and ended on. */
const snapshot = (aircraft) => aircraft.map((a) => [a.id, a.xFt, a.yFt, a.headingRad]);

/**
 * Starts a sequence.
 *
 * `settings`: a Turn Sim settings object for the two-ship (settings.js); each turn leg replaces its maneuver, Turn degrees, direction and
 * G. `legs`: a list of { kind: 'turn', maneuver, turnDeg, direction, baseG, label? } (one createRun turn: 'inplace90', 'hook90' and the
 * rest) and { kind: 'level', holdSec, label?, note? } (wings level for holdSec seconds, in whole 0.05 s steps). `options.gapSec`: seconds
 * of wings level put between every two turn legs that follow each other (none by default); a level leg already in the list is a gap.
 *
 * Returns { state, step, history }:
 *   state    live, updated in place: { tSec, finished, legIndex, aircraft, legs }. legIndex is the leg the next step flies (legs.length when
 *            finished). aircraft is a copy of the current leg's aircraft (createRun's state.aircraft). legs has every leg, the gaps
 *            included: { index, kind, label, note, startSec, endSec, steps, start, end } where start and end are [id, xFt, yFt, headingRad]
 *            rows (null until the leg has started or ended), and each leg's start equals the last leg's end exactly.
 *   step()   one 0.05 s step of the current leg; true when it stepped, false once the sequence has finished. The leg's last step also opens
 *            the next leg, so the step after it flies from exactly where this one ended.
 *   history() one row per step from t = 0, across all legs (no repeated row at a join), in createRun's row shape with the sequence's time.
 *
 * @param {Record<string, any>} settings
 * @param {readonly (TurnLeg | LevelLeg)[]} legs
 * @param {{ gapSec?: number }} [options]
 */
export function createSequence(settings, legs, options = {}) {
  if (settings.formation !== 'twoShip') throw new RangeError('A sequence is two-ship only for now: the four-ship and box pictures are checked with Patrick first.');
  if (!Array.isArray(legs) || legs.length === 0) throw new RangeError('A sequence needs at least one leg.');
  const gapSec = options.gapSec ?? 0;
  if (!(gapSec >= 0) || !Number.isFinite(gapSec)) throw new RangeError('gapSec must be a number of seconds, 0 or more');

  const list = [];
  for (const [i, leg] of legs.entries()) {
    const checked = checkedLeg(leg, i);
    if (gapSec > 0 && checked.kind === 'turn' && list.length > 0 && list[list.length - 1].kind === 'turn') list.push(checkedLeg({ kind: 'level', holdSec: gapSec }, i));
    list.push(checked);
  }

  const state = {
    tSec: 0,
    finished: false,
    legIndex: 0,
    aircraft: [],
    legs: list.map((leg, index) => ({ index, kind: leg.kind, label: leg.label, note: leg.note ?? null, startSec: null, endSec: null, steps: 0, start: null, end: null })),
  };
  const rows = [];

  let run = null;
  let seen = 0; // how many of this leg's history rows are in `rows` or skipped
  let holdSteps = 0;

  const publish = () => {
    state.aircraft.length = 0;
    for (const a of run.state.aircraft) state.aircraft.push({ ...a });
  };

  function openLeg(index, from) {
    const leg = list[index];
    const flight = { ...settings, durationSec: LEG_DURATION_SEC, durationCoversTurn: false };
    if (leg.kind === 'turn') Object.assign(flight, { maneuver: leg.maneuver, turnDeg: leg.turnDeg, direction: leg.direction, baseG: leg.baseG });
    const carry = from ?? snapshotToRun(createRun(flight, { noPreview: true }).state.aircraft);
    run = createRun(flight, { noPreview: true, continueFrom: carry, level: leg.kind === 'level' });
    seen = 0;
    holdSteps = leg.kind === 'level' ? Math.round(leg.holdSec / STEP_SEC) : 0;
    state.legs[index].startSec = state.tSec;
    state.legs[index].start = snapshot(run.state.aircraft);
    publish();
  }

  const snapshotToRun = (aircraft) => aircraft.map((a) => ({ id: a.id, xFt: a.xFt, yFt: a.yFt, headingRad: a.headingRad }));

  function step() {
    if (state.finished) return false;
    const index = state.legIndex;
    const info = state.legs[index];
    run.step();
    state.tSec += STEP_SEC;
    info.steps++;
    const legRows = run.history();
    for (; seen < legRows.length; seen++) {
      // A leg's first row is the plan row at its start, the same aircraft as the last row of the leg before: kept for the first leg only.
      if (seen === 0) {
        if (index === 0) rows.push({ ...legRows[0], tSec: 0 });
      } else rows.push({ ...legRows[seen], tSec: state.tSec });
    }
    publish();
    const done = list[index].kind === 'level' ? info.steps >= holdSteps : run.state.turnComplete;
    if (done) {
      info.endSec = state.tSec;
      info.end = snapshot(run.state.aircraft);
      state.legIndex = index + 1;
      if (state.legIndex >= list.length) state.finished = true;
      else openLeg(state.legIndex, snapshotToRun(run.state.aircraft));
    }
    return true;
  }

  openLeg(0, null);
  return { state, step, history: () => rows };
}

// ---- The G-warm ----

/** The airspeed the G-warm is flown from, in knots (SMM 16.22 para 70: a minimum of 220 KIAS). */
export const G_WARM_MIN_KT = 220;

/** The G of the two in-place 90s and of the hook (16.22 para 71: 3 G, 4 G). */
const G_WARM_TURN_G = 3;
const G_WARM_HOOK_G = 4;

/** The length of the push over, in seconds (16.22 para 71). */
const G_WARM_PUSH_SEC = 5;

/**
 * Which side of Lead the two-ship's wingman is on at the start, 'left' or 'right' as the pilot sees it (D48: the two-ship's #2 flies on
 * Lead's right). Worked out from the start positions, so it follows the formation code.
 * @param {Record<string, any>} settings
 * @returns {'left' | 'right'}
 */
export function wingmanSide(settings) {
  /** @type {any} */
  const s = { ...DEFAULTS, ...settings, formation: 'twoShip' };
  const h = compassDegToHeadingRad(s.startHeadingDeg);
  const [lead, two] = startPositions(s).filter((a) => a.id === 1 || a.id === 2).sort((a, b) => a.id - b.id);
  const right = (two.xFt - lead.xFt) * Math.sin(h) - (two.yFt - lead.yFt) * Math.cos(h);
  return right >= 0 ? 'right' : 'left';
}

/**
 * The legs of the G-warm (16.22 paras 70 and 71): an in-place 90 at 3 G, normally toward the wingman; the push over, 5 s; a hook at 4 G; an in-place 90 at 3 G
 * to the original heading. `options.direction`: 'toward' (the default: toward the wingman), 'left' or 'right' (Lead's call for the first 90). The hook and
 * the last 90 turn the same way, so the three turns make one full circle and both aircraft end on their original heading. The SMM leaves the direction of
 * the hook and of the last 90 to Lead's call; this is the way that ends on the heading, and the legs are plain data if a screen wants another.
 *
 * The push over is vertical in the SMM, and the flat sim has no vertical, so it is flown wings level for its 5 s and labelled, with a note saying so.
 * @param {Record<string, any>} settings
 * @param {{ direction?: 'toward' | 'left' | 'right', pushSec?: number }} [options]
 * @returns {(TurnLeg | LevelLeg)[]}
 */
export function gWarmLegs(settings, options = {}) {
  const chosen = options.direction ?? 'toward';
  if (chosen !== 'toward' && chosen !== 'left' && chosen !== 'right') throw new RangeError("direction must be 'toward', 'left' or 'right'");
  const direction = chosen === 'toward' ? wingmanSide(settings) : chosen;
  return [
    { kind: 'turn', maneuver: 'inplace90', turnDeg: 90, direction, baseG: G_WARM_TURN_G, label: `In place 90, ${G_WARM_TURN_G} G` },
    {
      kind: 'level',
      holdSec: options.pushSec ?? G_WARM_PUSH_SEC,
      label: '½ G push (wings level)',
      note: 'The push over is vertical, and this sim is flat, so it is flown wings level for the same time.',
    },
    { kind: 'turn', maneuver: 'hook90', turnDeg: 180, direction, baseG: G_WARM_HOOK_G, label: `Hook, ${G_WARM_HOOK_G} G` },
    { kind: 'turn', maneuver: 'inplace90', turnDeg: 90, direction, baseG: G_WARM_TURN_G, label: `In place 90 to the original heading, ${G_WARM_TURN_G} G` },
  ];
}

/**
 * Why the settings do not meet the G-warm's start (16.22 para 70: from LAB, 220 KIAS or more), or null. The Turn Sim's Speed box is treated as
 * indicated airspeed here, as the stall-limit warning does. It is a warning: the flight is not changed.
 * @param {Record<string, any>} settings
 * @returns {string | null}
 */
export function gWarmProblem(settings) {
  return settings.speedKt < G_WARM_MIN_KT ? `The G-warm is flown at ${G_WARM_MIN_KT} KIAS or more (SMM 16.22 para 70); the Speed is ${settings.speedKt}.` : null;
}

/**
 * The G-warm as a sequence: the button's set-up. The formation is the two-ship (the four-ship's spread-4 G-warm waits for its picture to be
 * checked); every other setting is used as given, the speed included (see gWarmProblem).
 * @param {Record<string, any>} settings
 * @param {{ direction?: 'toward' | 'left' | 'right', pushSec?: number, gapSec?: number }} [options]
 */
export function gWarmSequence(settings, options = {}) {
  const twoShip = { ...settings, formation: 'twoShip' };
  return createSequence(twoShip, gWarmLegs(twoShip, options), { gapSec: options.gapSec });
}
