// The closed pattern for the Traffic Sim: one continuous climbing left turn, flown once by the circuit's
// simulated pilot (circuit.js makePilot) from where the aircraft is, then followed by the path follower
// (Traffic spec 1a items 15-19, TR-R33; Patrick, 4 Oct 17:53Z "do this").
//
//   - It flies straight to today's wind-corrected perch, the built circuit's own (Patrick, 5 Oct 19:55Z: in a
//     high wind it used to intercept the downwind line first). The turn goes on until the track points at the
//     perch, then it holds that track.
//   - Full power at 140 KIAS; the climb comes from excess thrust at the turn's real G and levels at
//     pattern height (circuit.js powerClimb, spec item 16). The path follower works the pitch out from
//     the climb and the angle of attack.
//   - The bank comes from the setting (45-60°, default 50°), rolled in and out by the one roll model.
//   - The path ends a little short of the perch, rolled out and heading for it; Pattern 1 carries on from
//     there with its own final turn (spec item 18).
//
// Positions in map feet (x east, y north), headings compass degrees true, speeds KIAS. Nothing here
// reads a setting or the page.
import { wrapDeg180, compassDegFromVector } from '../../core/angles.js';
import { PATTERN_ALT_FT } from './airfield.js';
import { makePilot, bankFor, powerClimb, PILOT_DT } from './circuit.js';

/** Closed pattern climb speed: full power at 140 KIAS (spec item 16 and 3.1; SMM 4.2, EFIG p.134). */
export const CLOSED_CLIMB_KIAS = 140;
/**
 * The path hands over to Pattern 1 this far short of the perch, ft, so the path follower has joined the
 * circuit's downwind before its final turn starts there. An estimate.
 */
const HANDOVER_BEFORE_PERCH_FT = 1000;
/** Pointing at the perch, degrees: the turn is over and the track is held from here. An estimate. */
const ON_TRACK_DEG = 5;
const MOST_SEC = 600; // a guard: a closed pattern never takes this long
/**
 * The path starts with the aircraft carrying on as it was (its own bank and climb) for this long, s, before the
 * pilot starts the turn: the path follower smooths the track over about this much either side of where the
 * aircraft is (path-follower.js TRACK_HALF_WIDTH_SEC), so it sees the same flight on both sides of the hand-over
 * and the heading does not step there. The displayed roll still starts at the hand-over. An estimate.
 */
const CARRY_ON_SEC = 0.8;

/**
 * Flies the closed pattern from `from` = { x, y, alt, kias, headingDeg, bankDeg } in `wind` straight to
 * `downwind.perch`, the built circuit's wind-corrected point where the final turn starts, turning left at up
 * to `bankDeg`. Returns the path [{ x, y, alt, kt, g, phase, headingDeg }], every point in phase
 * 'closed_pattern'.
 */
export function buildClosedPattern(from, wind, downwind, bankDeg = 50) {
  const env = { windFromDeg: wind?.windFromDeg ?? 360, windKt: wind?.windKt ?? 0 };
  const { perch } = downwind;
  const pilot = makePilot({ x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, src: 0, phase: 'closed_pattern' }, env);
  const { s } = pilot;
  s.bank = from.bankDeg ?? 0;
  pilot.record();
  for (let n = 0; n < CARRY_ON_SEC / PILOT_DT; n++) {
    const { climb, accel } = powerClimb(pilot, CLOSED_CLIMB_KIAS, PATTERN_ALT_FT);
    pilot.step(s.bank, climb, accel);
  }
  let onTrack = false;
  for (let n = 0; n < MOST_SEC / PILOT_DT; n++) {
    const toPerch = compassDegFromVector(perch.x - s.x, perch.y - s.y);
    const toGoFt = Math.hypot(perch.x - s.x, perch.y - s.y);
    if (!onTrack && Math.abs(wrapDeg180(pilot.trackDeg() - toPerch)) < ON_TRACK_DEG && Math.abs(s.bank) < 5) onTrack = true;
    // Done: heading for the perch and close to it, or past it whatever (Pattern 1 then closes the rest).
    const ahead = (perch.x - s.x) * Math.sin(pilot.trackDeg() * Math.PI / 180) + (perch.y - s.y) * Math.cos(pilot.trackDeg() * Math.PI / 180);
    if (onTrack && (toGoFt <= HANDOVER_BEFORE_PERCH_FT || ahead <= 0)) break;
    const { climb, accel } = powerClimb(pilot, CLOSED_CLIMB_KIAS, PATTERN_ALT_FT);
    // The turn: left at the set bank until the track points at the perch; then hold that track.
    const bank = onTrack
      ? bankFor(pilot.headingFor(toPerch), s, 30)
      : bankFor(pilot.headingFor(toPerch), s, bankDeg, 'left');
    pilot.step(bank, climb, accel);
  }
  pilot.record();
  return pilot.points;
}
