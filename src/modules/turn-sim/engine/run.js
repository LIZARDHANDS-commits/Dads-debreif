// A run: the aircraft at their start positions, stepped 0.05 s at a time, with
// the history of the spacing kept by time. Pure: settings in, plain state out,
// no page, no timers. The screen calls step() as often as its clock says and
// draws state; nothing here depends on the frame rate (#17).
//
// Ported from V6: the first Play or Step at t = 0 (`prepareScenarioFromCurrentPositions`,
// line 1441), Play after a finished turn (`prepareScenarioFromCurrentState`,
// line 1458), `stepSim` (line 1687), `recordHist` (line 1689) and
// `allAircraftFinishedTurn` (line 1435). Golden test:
// tests/golden/turn-sim-run.test.js runs V6's own code next to this, whole runs
// position by position.
//
// COORDINATES: V6's own, no conversion at the edge. Feet, xFt east and yFt north
// (V6's Turn Sim draws north-up), headingRad in radians with 0 pointing east and
// angles growing counter-clockwise (the code heading of src/core/angles.js). The
// screen turns that into a compass heading with headingRadToCompassDeg.
import { degToRad, radToDeg } from '../../../core/angles.js';
import { ktToFtps } from '../../../core/units.js';
import { bankDegFromG } from '../../../core/flight-math.js';
import { DEFAULTS, aircraftSettings } from '../settings.js';
import { startPositions, activeIds, inferLineAbreastForm } from './formation.js';
import { planTurn } from './plan.js';
import { moveAircraft, flownG, STEP_SEC } from './step.js';

/** The pairs of aircraft the spacing is kept for, in the order V6 lists them (line 1699). */
const PAIRS = [[1, 2], [1, 3], [1, 4], [3, 4], [2, 3], [2, 4]];

const distanceFt = (a, b) => Math.hypot(a.xFt - b.xFt, a.yFt - b.yFt);

/**
 * True when every aircraft has finished its turn (V6 `allAircraftFinishedTurn`,
 * line 1435): done, or turned some and not turning now. `aircraft` is the
 * internal list; the screen reads state.turnComplete instead.
 */
export function allAircraftFinishedTurn(aircraft) {
  return aircraft.length > 0 && aircraft.every((a) => a.done || (a.turnAccumRad > 0 && !a.active));
}

/**
 * One row of history: the distance of every pair that exists, the smallest of
 * them, and how fast Lead and #3 are closing (V6 `recordHist`, line 1689).
 * `previous` is the row before, if any. A two-ship has only the 1-2 pair, and
 * its closure is 0, as in V6 (its 1-3 distance is NaN there, and CSV and
 * readouts leave those pairs out, #17).
 */
export function historyRow(tSec, aircraft, previous, stepSec = STEP_SEC) {
  const byId = (id) => aircraft.find((a) => a.id === id);
  const pairs = {};
  for (const [i, j] of PAIRS) {
    const a = byId(i);
    const b = byId(j);
    if (a && b) pairs[`${i}-${j}`] = distanceFt(a, b);
  }
  const all = Object.values(pairs);
  const minSepFt = Math.min(...all);
  const closure13Ftps = aircraft.length > 2 && previous ? (previous.pairs['1-3'] - pairs['1-3']) / stepSec : 0;
  return { tSec, pairs, minSepFt, closure13Ftps };
}

function newAircraft(slot, settings) {
  const own = aircraftSettings(settings, slot.id);
  return {
    id: slot.id,
    xFt: slot.xFt,
    yFt: slot.yFt,
    headingRad: slot.headingRad,
    gError: own.gError,
    delayErrSec: own.delayErrSec,
    turnLogic: own.turnLogic,
    clockTarget: own.clockTarget,
    clockPos: own.clockPos,
    turnStartSec: 0,
    turnDir: undefined,
    turnGoalRad: undefined,
    turnAccumRad: 0,
    active: false,
    done: false,
    shackleReturn: false,
    turnPhase: 0,
    autoClockTargetId: null,
    cueArmed: false,
    clockCueTriggered: false,
    prevClockCueRelDeg: null,
    originalHeadingRad: undefined,
    gFlown: 0,
  };
}

/**
 * Starts a run from a settings object (settings.js; anything missing or undefined
 * takes its default). Settings from the screen or storage must come from
 * checkSettings: the engine does not check ranges itself (the golden runs pass
 * out-of-range values on purpose). A non-finite Duration falls back to the
 * default, so a run always ends. Returns:
 *
 *   state    live, updated in place after every reset, step and startLeg:
 *            { tSec, finished, turnComplete, canStartLeg,
 *              aircraft: [{ id, xFt, yFt, headingRad, turning, bankDeg, g, done }] }
 *            finished: the run has reached its Duration (V6's loop stops there).
 *            turnComplete: every aircraft has finished its turn (V6 line 1435).
 *            canStartLeg: Play now should start a new leg (V6 lines 2002 and 2011).
 *            autoStepSec: the auto timing step in seconds once the turn is planned (a delayed
 *            turn with Timing = auto), else null. It is shown, never written into Base delay.
 *            aircraft has the aircraft that exist (a two-ship has ids 1 and 2). g is the G it
 *            flies; bankDeg is its bank while turning and 0 while flying straight.
 *   step()   one 0.05 s step. The first call after reset plans the turn (V6's first
 *            Play or Step). Does nothing once finished. Returns true when it stepped.
 *   startLeg()  Play after a finished turn: a new leg from where the aircraft are, at
 *            t = 0, on Lead's heading, with the plan made again (V6 line 1458).
 *   reset(settings)  back to t = 0 at the start positions, with new settings, or the
 *            same ones when none are given. A setup change calls this (#31).
 *   history()  the rows so far, one per step from t = 0 (the row of the first plan),
 *            kept by time, never trimmed: { tSec, pairs: { '1-2': ft, ... only the
 *            pairs that exist }, minSepFt, closure13Ftps }. Read only; the array grows.
 */
export function createRun(settings) {
  let cfg;
  // What V6 changes in its boxes as it goes: a new leg fills in the Start heading, and
  // the plan re-reads the preset (V6 lines 1441 to 1476).
  let formation;
  let startHeadingDeg;
  let craft = [];
  let rows = [];
  let tSec = 0;
  let planned = false;
  let autoStepSec = null;

  const state = { tSec: 0, finished: false, turnComplete: false, canStartLeg: false, autoStepSec: null, aircraft: [] };

  const speedFtps = () => ktToFtps(cfg.speedKt);
  const finished = () => tSec >= cfg.durationSec;

  function publish() {
    state.tSec = tSec;
    state.finished = finished();
    state.turnComplete = allAircraftFinishedTurn(craft);
    state.autoStepSec = autoStepSec;
    state.canStartLeg = tSec > 0 && (state.finished || state.turnComplete);
    state.aircraft.length = 0;
    for (const a of craft) {
      const g = flownG(cfg.baseG, a.gError);
      state.aircraft.push({
        id: a.id,
        xFt: a.xFt,
        yFt: a.yFt,
        headingRad: a.headingRad,
        turning: a.active,
        bankDeg: a.active ? bankDegFromG(g) : 0,
        g,
        done: a.done,
      });
    }
  }

  function flight() {
    return {
      formation,
      startHeadingDeg,
      maneuver: cfg.maneuver,
      direction: cfg.direction,
      turnDeg: cfg.turnDeg,
      baseDelaySec: cfg.baseDelaySec,
      clockCueAircraft: cfg.clockCueAircraft,
      timing: cfg.timing,
      clockCueSequence: cfg.clockCueSequence,
      speedKt: cfg.speedKt,
      spacingFt: cfg.spacingFt,
    };
  }

  // V6 syncFormationDropdownToCurrentState (line 1399): a line abreast that has swapped sides is now the other preset.
  function syncFormation() {
    if (formation === 'weighted' || formation === 'weightedReverse') {
      const inferred = inferLineAbreastForm(craft, formation);
      if (inferred === 'weighted' || inferred === 'weightedReverse') formation = inferred;
    }
  }

  function record() {
    rows.push(historyRow(tSec, craft, rows[rows.length - 1]));
  }

  function reset(next) {
    if (next !== undefined) {
      const given = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
      cfg = { ...DEFAULTS, ...given };
      if (!Number.isFinite(cfg.durationSec)) cfg.durationSec = DEFAULTS.durationSec;
    }
    formation = cfg.formation;
    startHeadingDeg = cfg.startHeadingDeg;
    const ids = activeIds(cfg.formation);
    craft = startPositions(cfg).filter((s) => ids.includes(s.id)).map((s) => newAircraft(s, cfg));
    rows = [];
    tSec = 0;
    planned = false;
    autoStepSec = null;
    publish();
  }

  // The first Play or Step at t = 0 (V6 prepareScenarioFromCurrentPositions, line 1441).
  function planFromStart() {
    tSec = 0;
    rows = [];
    // Starting from a reset: every aircraft points at the start heading.
    for (const a of craft) {
      a.headingRad = degToRad(startHeadingDeg);
      a.turnAccumRad = 0;
      a.active = false;
      a.done = false;
    }
    syncFormation();
    autoStepSec = planTurn(craft, flight(), { useErrors: true }).autoStepSec;
    record();
    planned = true;
  }

  function startLeg() {
    if (!state.canStartLeg) return;
    tSec = 0;
    rows = [];
    // Continuing after a finished turn: the aircraft stay where they are, on the heading they have.
    syncFormation();
    const lead = craft.find((a) => a.id === 1);
    if (lead) startHeadingDeg = (radToDeg(lead.headingRad) % 360 + 360) % 360; // V6 useLeadHeadingAsStartHeading, line 1428
    for (const a of craft) {
      a.turnAccumRad = 0;
      a.active = false;
      a.done = false;
    }
    autoStepSec = planTurn(craft, flight(), { useErrors: true }).autoStepSec;
    record();
    planned = true;
    publish();
  }

  function step() {
    if (!planned) planFromStart();
    if (finished()) {
      publish();
      return false;
    }
    moveAircraft(craft, {
      tSec,
      timing: cfg.timing,
      clockCueAircraft: cfg.clockCueAircraft,
      clockCuePos: cfg.clockCuePos,
      clockCueTolDeg: cfg.clockCueTolDeg,
      speedFtps: speedFtps(),
      baseG: cfg.baseG,
      turnDegDefault: cfg.turnDeg,
      correction: cfg.correction,
      correctionStrength: cfg.correctionStrength,
    }, STEP_SEC);
    tSec += STEP_SEC;
    record();
    publish();
    return true;
  }

  reset(settings ?? {});
  return { state, step, startLeg, reset, history: () => rows };
}
