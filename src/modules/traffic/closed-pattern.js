// The closed pattern for the Traffic Sim: one continuous climbing left turn onto the inner downwind,
// flown once by the circuit's simulated pilot (circuit.js makePilot) from where the aircraft is, then
// followed by the path follower (Traffic spec 1a items 15-19, TR-R33; Patrick, 4 Oct 17:53Z "do this").
//
//   - It aims at the line it joins: the inner downwind of today's built circuit, from where the break
//     rolls out to the perch (spec item 17), not at the perch itself.
//   - Full power at 140 KIAS; the climb comes from excess thrust at the turn's real G and levels at
//     pattern height (circuit.js powerClimb, spec item 16). The path follower works the pitch out from
//     the climb and the angle of attack.
//   - The bank comes from the setting (45-60°, default 50°), rolled in and out by the one roll model.
//   - The path ends once the aircraft is on the downwind line, lined up, wings level and at pattern
//     height, past where the break rolls out; Pattern 1 carries on from there (spec item 18).
//
// Positions in map feet (x east, y north), headings compass degrees true, speeds KIAS. Nothing here
// reads a setting or the page.
import { ktToFtps } from '../../core/units.js';
import { wrapDeg180 } from '../../core/angles.js';
import { turnRadiusFromBankFt } from '../../core/flight-math.js';
import { legOffsetsFt } from '../../core/geo.js';
import { PATTERN_ALT_FT } from './airfield.js';
import { makePilot, bankFor, trackForLine, lineOf, powerClimb, HOLD_RADIUS_FT, PILOT_DT } from './circuit.js';

/** Closed pattern climb speed: full power at 140 KIAS (spec item 16 and 3.1; SMM 4.2, EFIG p.134). */
export const CLOSED_CLIMB_KIAS = 140;
/**
 * The path hands over this far past where the break rolls out onto the downwind, ft, so Pattern 1 is
 * joined on its straight downwind and not in the last of the break. An estimate.
 */
const PAST_ROLLOUT_FT = 300;
/** Close enough to the line to stop turning onto it and just hold it, ft and degrees. Estimates. */
const NEAR_LINE_FT = 300;
const NEAR_TRACK_DEG = 15;
const MOST_SEC = 600; // a guard: a closed pattern never takes this long

/**
 * Flies the closed pattern from `from` = { x, y, alt, kias, headingDeg, bankDeg } in `wind` onto the
 * inner downwind `downwind` = { rollout, perch } (the built circuit's points where the break rolls out
 * and where the final turn starts), turning at up to `bankDeg`. Returns the path
 * [{ x, y, alt, kt, g, phase, headingDeg }], every point in phase 'closed_pattern'.
 */
export function buildClosedPattern(from, wind, downwind, bankDeg = 50) {
  const env = { windFromDeg: wind?.windFromDeg ?? 360, windKt: wind?.windKt ?? 0 };
  const line = lineOf(downwind.rollout, downwind.perch);
  const lineLenFt = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
  const pilot = makePilot({ x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, src: 0, phase: 'closed_pattern' }, env);
  const { s } = pilot;
  s.bank = from.bankDeg ?? 0;
  pilot.record();
  const windFtps = ktToFtps(env.windKt);
  let near = false;
  for (let n = 0; n < MOST_SEC / PILOT_DT; n++) {
    const v = ktToFtps(pilot.tasKt());
    const { alongFt, crossFt } = legOffsetsFt(line.a, line.b, s);
    const trackErr = wrapDeg180(pilot.trackDeg() - line.trackDeg);
    // Done: on the line and settled at pattern height past the rollout, or at the perch whatever (Pattern 1 then closes the rest).
    const settled = Math.abs(crossFt) < 20 && Math.abs(trackErr) < 2 && Math.abs(s.bank) < 2 && Math.abs(s.alt - PATTERN_ALT_FT) < 30;
    if ((settled && alongFt >= PAST_ROLLOUT_FT) || (near && alongFt >= lineLenFt - PAST_ROLLOUT_FT)) break;
    const { climb, accel } = powerClimb(pilot, CLOSED_CLIMB_KIAS, PATTERN_ALT_FT);
    if (!near && Math.abs(crossFt) < NEAR_LINE_FT && Math.abs(trackErr) < NEAR_TRACK_DEG) near = true;
    let bank;
    if (!near) {
      // Turn left onto the line along a circle of the turn's radius (widest over the ground downwind), so
      // the turn is one steady bank that rolls out on it; further out, a 90° cut toward it first.
      const Rg = turnRadiusFromBankFt(v, bankDeg) * ((v + windFtps) / v) ** 2;
      bank = bankFor(pilot.headingFor(trackForLine(line, s, Rg)), s, bankDeg, 'left');
    } else {
      bank = bankFor(pilot.headingFor(trackForLine(line, s, HOLD_RADIUS_FT)), s, 30);
    }
    pilot.step(bank, climb, accel);
  }
  pilot.record();
  return pilot.points;
}
