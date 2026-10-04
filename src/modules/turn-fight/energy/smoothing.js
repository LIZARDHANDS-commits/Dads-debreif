// The smoothing layer between the pilot and the aircraft (TF-57 PR 2): every move's G and bank go through here before
// the limits, so nothing the pilot asks for arrives in one step. G builds or eases at most `gOnsetGPerSec`; the roll
// rate builds and dies away at most `rollAccelDegPerSec2`, never past the roll rate (core's easeRoll), and slows in time
// to stop on the bank asked for. Both numbers are Patrick's "brisk" estimates (6 G/s; 90°/s reached in 0.25 s) and 0
// turns either off. The aircraft's limits (stall line, shaker, roll rate, OVER G) still act after this; a forced G
// (the what-if) is pulled as set and does not come through here.
import { wrapPi, degToRad, radToDeg } from '../../../core/angles.js';
import { easeRoll } from '../../../core/flight-math.js';
import { T6A_LIMITS } from '../../../core/t6-performance.js';
import { ROLLING_DEG_PER_SEC, MANEUVER_PULL_G } from './setup.js';

/**
 * The command a move asked for ({ g, bankRad, prefer, throttle }), as the pilot's hands deliver it this step: the G a
 * step closer to what was asked from the G flown last step, and the bank one eased roll step on. `ac.ctl.rollRateDps`
 * is the signed roll rate the aircraft flew last step (stepAircraft keeps it).
 */
export function smoothInputs(ac, cmd, d, p) {
  let { g, bankRad } = cmd;
  // The pilot keeps the +4.7 G rolling limit as the moves do: unless the set pull G is above the standard 5 G, which is
  // the what-if that flies past it and shows OVER G (the limit is flagged, never a wall), or a forced G is set.
  const keepsRollLimit = p.pullG <= MANEUVER_PULL_G && (ac.ctl.forceG ?? null) === null;
  if (p.gOnsetGPerSec > 0) {
    const step = p.gOnsetGPerSec * d;
    g = Math.min(ac.g + step, Math.max(ac.g - step, g));
  }
  // While the roll rate is still above the rolling line, the pilot keeps the G at or under the rolling limit (+4.7 G):
  // roll first, then pull. (With the G already over it, the bank is held instead, below.)
  if (keepsRollLimit && Math.abs(ac.ctl.rollRateDps ?? 0) > ROLLING_DEG_PER_SEC && g > T6A_LIMITS.rollingMaxG && g > ac.g - 1e-9) g = Math.max(T6A_LIMITS.rollingMaxG, Math.min(g, ac.g));
  if (p.rollAccelDegPerSec2 > 0) {
    let err = wrapPi(cmd.bankRad - ac.bankRad);
    if (Math.abs(err) > Math.PI - 1e-3) err = cmd.prefer * Math.PI; // 180° off: the way round the move prefers
    let maxRateDps = ac.stall ? 0.3 * p.rollRateDegPerSec : p.rollRateDegPerSec; // the same roll authority stepAircraft gives
    // Unload, then roll: while the G is still over the rolling limit (+4.7 G) the pilot holds the bank, barely moving it,
    // so the smooth G never meets a full-rate roll and makes OVER G.
    if (keepsRollLimit && g > T6A_LIMITS.rollingMaxG) maxRateDps = Math.min(maxRateDps, 0.9 * ROLLING_DEG_PER_SEC);
    const next = easeRoll(0, ac.ctl.rollRateDps ?? 0, radToDeg(err), d, { maxRateDps, maxAccelDps2: p.rollAccelDegPerSec2 });
    bankRad = wrapPi(ac.bankRad + degToRad(next.bankDeg));
  }
  return { ...cmd, g, bankRad };
}
