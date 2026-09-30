// The offset box's rear element check: #3 and #4 turn a few degrees away from
// the box, hold, and turn back, to look behind. Ported from V6 `rearCheckConfig`
// (line 1533), `resetRearCheckState` (line 1540), `stepRearCheckTurn` (line
// 1545) and `updateRearCheckStatus` (line 1573). Pure: numbers in, the aircraft
// changed in place.
//
// Headings are V6's radians (0 = east, counter-clockwise, see formation.js), so
// the check direction is +1 for a left turn and -1 for a right turn, as V6 has it.
import { degToRad } from '../../../core/angles.js';

/** The phases of the check, as V6 numbers them (`rearCheckPhase`). */
export const REAR_CHECK_PHASE = { waiting: 0, turningOut: 1, holding: 2, turningBack: 3, complete: 4 };

/**
 * The check's settings as V6 reads them (`rearCheckConfig`, line 1533). It is on
 * only in the offset box. Start and hold are limited to 0 or more seconds, the
 * angle to 1° to 90°; a missing or non-numeric value takes V6's 40 s, 20° and 5 s.
 * Q47: with `rearCheckAfterTurns` the check also waits until #3 and #4 have finished their turns (V6 started it at its
 * set time whatever they were doing).
 * settings: { formation, rearCheckOn, rearCheckStartSec, rearCheckDir, rearCheckAngleDeg, rearCheckHoldSec, rearCheckAfterTurns }
 * Returns { enabled, startSec, dir, angleRad, holdSec, afterTurns }.
 */
export function rearCheckConfig(settings) {
  const num = (v, fallback) => (Number.isFinite(+v) ? +v : fallback);
  return {
    enabled: settings.formation === 'offsetBox' && !!settings.rearCheckOn,
    startSec: Math.max(0, num(settings.rearCheckStartSec, 40)),
    dir: settings.rearCheckDir === 'right' ? -1 : 1,
    angleRad: degToRad(Math.max(1, Math.min(90, num(settings.rearCheckAngleDeg, 20)))),
    holdSec: Math.max(0, num(settings.rearCheckHoldSec, 5)),
    afterTurns: !!settings.rearCheckAfterTurns,
  };
}

/** Clears an aircraft's check (V6 `resetRearCheckState`, line 1540). */
export function resetRearCheckState(a) {
  a.rearCheckPhase = 0;
  a.rearCheckStarted = false;
  a.rearCheckComplete = false;
  a.rearCheckAccumRad = 0;
  a.rearCheckBaseHeadingRad = null;
  a.rearCheckHoldUntilSec = null;
}

/**
 * One step of the check for #3 or #4 (V6 `stepRearCheckTurn`, line 1545). While it
 * returns true the aircraft's planned turn is skipped this step: the check turns
 * `angleRad` out at the rate `omegaRadPerSec` gives, holds `holdSec`, and turns back.
 * `tSec` is the time at the start of the step. Once complete it is done for good.
 * `turnsDone`: #3 and #4 have both finished their turns; with cfg.afterTurns the check does not start before that (Q47).
 */
export function stepRearCheckTurn(a, omegaRadPerSec, stepSec, tSec, cfg, turnsDone = true) {
  if (!cfg.enabled || (a.id !== 3 && a.id !== 4) || a.rearCheckComplete || tSec < cfg.startSec) return false;
  if (cfg.afterTurns && !a.rearCheckStarted && !turnsDone) return false;
  if (!a.rearCheckStarted) {
    a.rearCheckStarted = true;
    a.rearCheckPhase = 1;
    a.rearCheckAccumRad = 0;
    a.rearCheckBaseHeadingRad = a.headingRad;
  }
  if (a.rearCheckPhase === 1) {
    const dth = Math.min(omegaRadPerSec * stepSec, cfg.angleRad - a.rearCheckAccumRad);
    a.headingRad += cfg.dir * dth;
    a.rearCheckAccumRad += dth;
    if (a.rearCheckAccumRad >= cfg.angleRad - 0.0001) {
      a.headingRad = a.rearCheckBaseHeadingRad + cfg.dir * cfg.angleRad;
      a.rearCheckPhase = 2;
      a.rearCheckHoldUntilSec = tSec + cfg.holdSec;
    }
  } else if (a.rearCheckPhase === 2) {
    a.headingRad = a.rearCheckBaseHeadingRad + cfg.dir * cfg.angleRad;
    if (tSec >= (a.rearCheckHoldUntilSec || tSec)) {
      a.rearCheckPhase = 3;
      a.rearCheckAccumRad = 0;
    }
  } else if (a.rearCheckPhase === 3) {
    const dth = Math.min(omegaRadPerSec * stepSec, cfg.angleRad - a.rearCheckAccumRad);
    a.headingRad -= cfg.dir * dth;
    a.rearCheckAccumRad += dth;
    if (a.rearCheckAccumRad >= cfg.angleRad - 0.0001) {
      a.headingRad = a.rearCheckBaseHeadingRad;
      a.rearCheckPhase = 4;
      a.rearCheckComplete = true;
    }
  }
  return true;
}

/**
 * Where the check is, for the screen (V6 `updateRearCheckStatus`, line 1573): the
 * furthest phase of #3 and #4. Returns { enabled, phase: 'off' | 'waiting' | 'turningOut' | 'holding' |
 * 'turningBack' | 'complete', startSec, dir ('left' | 'right'), angleDeg, holdSec }.
 */
export function rearCheckStatus(aircraft, cfg) {
  const base = { enabled: cfg.enabled, startSec: cfg.startSec, dir: cfg.dir === -1 ? 'right' : 'left', angleDeg: (cfg.angleRad * 180) / Math.PI, holdSec: cfg.holdSec };
  if (!cfg.enabled) return { ...base, phase: 'off' };
  const rear = aircraft.filter((a) => a.id === 3 || a.id === 4);
  const p = rear.length ? Math.max(...rear.map((a) => a.rearCheckPhase || 0)) : 0;
  return { ...base, phase: ['waiting', 'turningOut', 'holding', 'turningBack', 'complete'][p] };
}
