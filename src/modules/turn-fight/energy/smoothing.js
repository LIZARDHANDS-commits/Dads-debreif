// The smoothing layer between the pilot and the aircraft (TF-57 PR 2): every move's G and bank go through here before
// the limits, so nothing the pilot asks for arrives in one step. G builds or eases at most `gOnsetGPerSec`; the roll
// rate builds and dies away at most `rollAccelDegPerSec2`, never past the roll rate (core's easeRoll), and slows in time
// to stop on the bank asked for. Both numbers are Patrick's "brisk" estimates (6 G/s; 90°/s reached in 0.25 s) and 0
// turns either off. The aircraft's limits (stall line, shaker, roll rate, OVER G) still act after this; a forced G
// (the what-if) is pulled as set and does not come through here.
import { wrapPi, degToRad, radToDeg } from '../../../core/angles.js';
import { easeRoll } from '../../../core/flight-math.js';

/**
 * The command a move asked for ({ g, bankRad, prefer, throttle }), as the pilot's hands deliver it this step: the G a
 * step closer to what was asked from the G flown last step, and the bank one eased roll step on. `ac.ctl.rollRateDps`
 * is the signed roll rate the aircraft flew last step (stepAircraft keeps it).
 */
export function smoothInputs(ac, cmd, d, p) {
  let { g, bankRad } = cmd;
  if (p.gOnsetGPerSec > 0) {
    const step = p.gOnsetGPerSec * d;
    g = Math.min(ac.g + step, Math.max(ac.g - step, g));
  }
  if (p.rollAccelDegPerSec2 > 0) {
    let err = wrapPi(cmd.bankRad - ac.bankRad);
    if (Math.abs(err) > Math.PI - 1e-3) err = cmd.prefer * Math.PI; // 180° off: the way round the move prefers
    const maxRateDps = ac.stall ? 0.3 * p.rollRateDegPerSec : p.rollRateDegPerSec; // the same roll authority stepAircraft gives
    const next = easeRoll(0, ac.ctl.rollRateDps ?? 0, radToDeg(err), d, { maxRateDps, maxAccelDps2: p.rollAccelDegPerSec2 });
    bankRad = wrapPi(ac.bankRad + degToRad(next.bankDeg));
  }
  return { ...cmd, g, bankRad };
}
