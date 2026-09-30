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
import { degToRad, radToDeg, compassDegToHeadingRad, headingRadToCompassDeg } from '../../../core/angles.js';
import { ktToFtps } from '../../../core/units.js';
import { bankDegFromG } from '../../../core/flight-math.js';
import { DEFAULTS, MANEUVER_TURN_DEG, aircraftSettings, turnProblem } from '../settings.js';
import { startPositions, activeIds, inferLineAbreastForm } from './formation.js';
import { planTurn } from './plan.js';
import { cueStatus } from './cues.js';
import { moveAircraft, flownG, STEP_SEC } from './step.js';
import { turnRateRadPerSec } from '../../../core/flight-math.js';
import { rearCheckConfig, resetRearCheckState, rearCheckStatus } from './rear-check.js';

/** The pairs of aircraft the spacing is kept for, in the order V6 lists them (line 1699). */
const PAIRS = [[1, 2], [1, 3], [1, 4], [3, 4], [2, 3], [2, 4]];

const distanceFt = (a, b) => Math.hypot(a.xFt - b.xFt, a.yFt - b.yFt);

/**
 * True when every aircraft has finished its turn (V6 `allAircraftFinishedTurn`,
 * line 1435): done, or turned some and not turning now. `aircraft` is the
 * internal list; the screen reads state.turnComplete instead.
 */
export function allAircraftFinishedTurn(aircraft) {
  return aircraft.length > 0 && aircraft.every((a) => a.done || (!a.legs && a.turnAccumRad > 0 && !a.active));
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
  const a = {
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
    legs: undefined,
    legIndex: 0,
    legAccumRad: 0,
    legReadySec: 0,
    finalHeadingRad: undefined,
    autoClockTargetId: null,
    cueArmed: false,
    clockCueTriggered: false,
    prevClockCueRelDeg: null,
    originalHeadingRad: undefined,
    gFlown: flownG(settings.baseG, own.gError),
  };
  resetRearCheckState(a);
  return a;
}

/** The solved delays of #3 and #4 against the SMM's band, or null when the turn has none (SMM item 5). */
export function offsetBoxStatus(rearDelaysSec, minSec, maxSec) {
  if (!rearDelaysSec) return null;
  return { minSec, maxSec, rear: [3, 4].map((id) => ({ id, delaySec: rearDelaysSec[id], outsideBand: rearDelaysSec[id] < minSec || rearDelaysSec[id] > maxSec })) };
}

/**
 * Starts a run from a settings object (settings.js; anything missing or undefined
 * takes its default). Settings from the screen or storage must come from
 * checkSettings: the engine does not check ranges itself (the golden runs pass
 * out-of-range values on purpose). A non-finite Duration falls back to the
 * default, so a run always ends. Returns:
 *
 *   state    live, updated in place after every reset, step and startLeg (durationSec is how long the run lasts: the
 *            Duration, or longer when durationCoversTurn and the plan needs it; a finished run is at durationSec):
 *            { tSec, finished, turnComplete, canStartLeg,
 *              aircraft: [{ id, xFt, yFt, headingRad, turning, bankDeg, g, done, cue }] }
 *            finished: the run has reached its Duration (V6's loop stops there).
 *            turnComplete: every aircraft has finished its turn (V6 line 1435).
 *            canStartLeg: Play now should start a new leg (V6 lines 2002 and 2011).
 *            autoStepSec: the auto timing step in seconds (a delayed turn with Timing = auto, known
 *            before the first step too), else null. It is shown, never written into Base delay.
 *            startHeadingDeg: the compass heading the run started on (000 north, 090 east); after startLeg
 *            it is Lead's compass heading, which V6 wrote into its Start heading box. The screen shows it,
 *            and must not write it back into the settings (that would reset the run).
 *            offsetBox: in the offset box's delayed turns, the solved delays of #3 and #4 against the SMM's band
 *            (16.41 para 112): { minSec, maxSec, rear: [{ id: 3, delaySec, outsideBand }, { id: 4, ... }] }, else null.
 *            outsideBand is true when the delay is under minSec or over maxSec (rearDelayMinSec, rearDelayMaxSec).
 *            maneuverFallback: null, or the reason the turn asked for could not be flown (the shackle and the cross turn are
 *            two-ship turns, settings.js turnProblem) and the default turn was flown instead.
 *            leadTurnDirection: 'left' or 'right', the way Lead turns: the Direction box, except in the cross turn, where
 *            Lead turns toward #2 whatever the box says (the screen can show it).
 *            rearCheck: the offset box's rear element check, { enabled, phase ('off', 'waiting', 'turningOut',
 *            'holding', 'turningBack', 'complete'), startSec, dir, angleDeg, holdSec } (rear-check.js).
 *            cue: { mode: 'off' | 'start' | 'waiting' | 'triggered', targetId, clockPos (hours, 5.5 is
 *            5:30), cantSee }: who this aircraft waits on and for which clock position (cues.js cueStatus).
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
  let startHeadingRad;
  let craft = [];
  let rows = [];
  let tSec = 0;
  let planned = false;
  let planInfo = { autoStepSec: null, rearDelaysSec: null };

  const state = { tSec: 0, durationSec: 0, finished: false, turnComplete: false, canStartLeg: false, autoStepSec: null, startHeadingDeg: 0, rearCheck: null, offsetBox: null, leadTurnDirection: 'right', maneuverFallback: null, aircraft: [] };

  const speedFtps = () => ktToFtps(cfg.speedKt);
  // How long the run lasts: the Duration, or longer when durationCoversTurn and the plan needs it (see settings.js).
  let coverSec = 0;
  const durationSec = () => Math.max(cfg.durationSec, cfg.durationCoversTurn ? coverSec : 0);
  const finished = () => tSec >= durationSec();

  // The time the plan needs: each aircraft's start, its legs, holds, and the turn's own time, and 10 s more to see it end.
  function timeNeededSec() {
    const v = speedFtps();
    let latest = 0;
    for (const a of craft) {
      const legs = a.legs || [{ goalRad: a.turnGoalRad || degToRad(cfg.turnDeg) }];
      let end = a.turnStartSec;
      for (const leg of legs) {
        const omega = turnRateRadPerSec(v, flownG(leg.gSetting !== undefined ? leg.gSetting : cfg.baseG, a.gError));
        end += (leg.holdSec || 0) + leg.goalRad / omega;
      }
      latest = Math.max(latest, end);
    }
    return latest + 10;
  }

  function publish() {
    state.tSec = tSec;
    state.durationSec = durationSec();
    state.finished = finished();
    state.turnComplete = allAircraftFinishedTurn(craft);
    state.startHeadingDeg = headingRadToCompassDeg(startHeadingRad);
    state.canStartLeg = tSec > 0 && (state.finished || state.turnComplete);
    // Before the first step nothing is planned yet, so the cue lines come from a plan made on copies.
    const preview = planned ? craft : craft.map((a) => ({ ...a }));
    const info = planned ? planInfo : planTurn(preview, flight(), { useErrors: true });
    state.autoStepSec = info.autoStepSec;
    state.offsetBox = offsetBoxStatus(info.rearDelaysSec, cfg.rearDelayMinSec, cfg.rearDelayMaxSec);
    state.rearCheck = rearCheckStatus(craft, rearCheck());
    // In the shackle and the cross turn the two-ship elements of a four-ship each fly the turn about themselves.
    const leadPlan = preview.find((x) => x.id === 1);
    state.leadTurnDirection = leadPlan && leadPlan.turnDir === -1 ? 'right' : leadPlan && leadPlan.turnDir === 1 ? 'left' : cfg.direction;
    state.maneuverFallback = cfg.maneuverFallback;
    state.aircraft.length = 0;
    for (const [i, a] of craft.entries()) {
      const g = a.gFlown;
      state.aircraft.push({
        id: a.id,
        xFt: a.xFt,
        yFt: a.yFt,
        headingRad: a.headingRad,
        turning: a.active,
        bankDeg: a.active ? bankDegFromG(g) : 0,
        g,
        done: a.done,
        cue: cueStatus(preview[i], { timing: cfg.timing, clockCuePos: cfg.clockCuePos, direction: cfg.direction, formation }),
      });
    }
  }

  function flight() {
    return {
      formation,
      startHeadingRad,
      maneuver: cfg.maneuver,
      direction: cfg.direction,
      turnDeg: cfg.turnDeg,
      baseDelaySec: cfg.baseDelaySec,
      clockCueAircraft: cfg.clockCueAircraft,
      timing: cfg.timing,
      clockCueSequence: cfg.clockCueSequence,
      speedKt: cfg.speedKt,
      spacingFt: cfg.spacingFt,
      baseG: cfg.baseG,
      boxAftFt: cfg.boxAftFt,
      offsetBox4Timing: cfg.offsetBox4Timing,
      rearDelaySec: cfg.rearDelaySec,
      crossTurnFirstG: cfg.crossTurnFirstG,
      crossTurnSwitchDeg: cfg.crossTurnSwitchDeg,
    };
  }

  // The rear element check's settings; it reads the preset now in force, as V6 does (line 1534).
  const rearCheck = () => rearCheckConfig({ ...cfg, formation });

  // V6 syncFormationDropdownToCurrentState (line 1399): a line abreast that has swapped sides is now the other preset.
  function syncFormation() {
    if (formation === 'weighted' || formation === 'weightedReverse') {
      const inferred = inferLineAbreastForm(craft, formation, cfg.twoSide);
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
      cfg.maneuverFallback = turnProblem(cfg.formation, cfg.maneuver);
      if (cfg.maneuverFallback) {
        cfg.maneuver = DEFAULTS.maneuver;
        cfg.turnDeg = MANEUVER_TURN_DEG[DEFAULTS.maneuver];
      }
    }
    formation = cfg.formation;
    startHeadingRad = compassDegToHeadingRad(cfg.startHeadingDeg);
    const ids = activeIds(cfg.formation);
    craft = startPositions(cfg).filter((s) => ids.includes(s.id)).map((s) => newAircraft(s, cfg));
    rows = [];
    tSec = 0;
    planned = false;
    coverSec = 0;
    planInfo = { autoStepSec: null, rearDelaysSec: null };
    publish();
  }

  // The first Play or Step at t = 0 (V6 prepareScenarioFromCurrentPositions, line 1441).
  function planFromStart() {
    tSec = 0;
    rows = [];
    // Starting from a reset: every aircraft points at the start heading.
    for (const a of craft) {
      a.headingRad = startHeadingRad;
      a.turnAccumRad = 0;
      a.active = false;
      a.done = false;
    }
    syncFormation();
    planInfo = planTurn(craft, flight(), { useErrors: true });
    coverSec = timeNeededSec();
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
    // V6 useLeadHeadingAsStartHeading (line 1428) fills its box with Lead's heading in degrees, 0 to 360.
    if (lead) startHeadingRad = degToRad((radToDeg(lead.headingRad) % 360 + 360) % 360);
    for (const a of craft) {
      a.turnAccumRad = 0;
      a.active = false;
      a.done = false;
      // V6 cleared the rear element check only on Reset (line 1540), so a second leg never had one. Each leg does.
      resetRearCheckState(a);
    }
    planInfo = planTurn(craft, flight(), { useErrors: true });
    coverSec = timeNeededSec();
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
      rearCheck: rearCheck(),
      tSec,
      spacingFt: cfg.spacingFt,
      timing: cfg.timing,
      direction: cfg.direction,
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
