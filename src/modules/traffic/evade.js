// The deconfliction's own short moves, flown once from where the aircraft is by the circuit's simulated pilot
// (circuit.js makePilot), so each starts with the aircraft's own place, heading, bank and speed and the path
// follower flies the result (Traffic spec 4.12; design and Patrick's answers in the project files,
// traffic-deconfliction/design.md, section 2.5).
//
//   - the flinch (Layer 2): a few seconds out of the way, up if free to climb, else a bank away, then the breakout;
//   - the climb straight ahead before a fly-through breaks out (Patrick's Q4);
//   - the rejoin of a broken-out straight-in onto its own straight-in (Patrick's Q7), and the same rejoin
//     flown by the breakout onto ENT1 (breakout.js).
//
// Positions in map feet (x east, y north), headings compass degrees true, speeds KIAS. Nothing here reads a
// setting or the page.
import { ktToFtps, KT_TO_FTPS, G_FTPS2 } from '../../core/units.js';
import { compassDegFromVector, wrapDeg180 } from '../../core/angles.js';
import { gFromBankDeg, bankDegFromG, turnRadiusFromBankFt } from '../../core/flight-math.js';
import { excessThrustPerWeight, stallLimitG, iasToTasKt } from '../../core/t6-performance.js';
import { legOffsetsFt } from '../../core/geo.js';
import { PATTERN_ALT_FT } from './airfield.js';
import { makePilot, bankFor, trackForLine, readyToTurnOnto, lineOf, CIRCUIT, ZOOM_SEC, LEVEL_OFF_SEC, HOLD_RADIUS_FT, PILOT_DT } from './circuit.js';

/** Every number the moves use, each with its source. */
export const EVADE = Object.freeze({
  /** How long the flinch lasts before the breakout takes over, s. An estimate (design section 9). */
  flinchSec: 5,
  /** The flinch moves out of the way by about one caution distance, ft (design section 2.5). An estimate. */
  flinchFt: 500,
  /** Bank of a flinch away: up to 60° (SMM 4.14 para 33), never past the stall line (core stallLimitG). */
  flinchBankDeg: 60,
  /** The move-over slides this far toward the inner runway, ft (Patrick's card, Q5: half the 29L-29R gap; an estimate, on the questions for Dad). */
  moveOverFt: 500,
  /** The move-over adds power and levels off here, ft MSL, until the upwind end, then goes around (Patrick, 4 Oct 19:01Z). */
  moveOverLevelAltFt: 2100,
  /** ...and holds this speed to the upwind end, the overshoot, KIAS (Patrick, 4 Oct 19:52Z: "move over goes to 120 knots until overshoot"). */
  moveOverKias: 120,
  /** A PFL's bank away: out to flinchFt over this, then back onto its circle over the next, s (estimates; about 30° of extra bank at most). */
  bankAwayOutSec: 12,
  bankAwayBackSec: 20,
  /** Before a fly-through breaks out it climbs straight ahead this far above pattern height, ft (Patrick's Q4; an estimate). */
  climbAboveFt: 500,
  /**
   * A broken-out straight-in rejoins its first leg this far before the leg's end, ft: 2 NM, as the overhead
   * rejoin does before the Entry Gate (breakout.js REJOIN_INTERCEPT_PT; TR-R34: at least 1 NM out).
   */
  rejoinOutFt: 2 * 6076,
  /** Bank of the rejoin turn onto the line, degrees. An estimate (the overhead rejoin uses 25-35°, breakout.js). */
  rejoinBankDeg: 45,
  /** Steepest climb or descent on the way back to the line, ft/s (1,000 ft/min). An estimate. */
  rejoinVertFtps: 1000 / 60,
  /**
   * Spacing on final: an aircraft on the inner downwind turns final at least this far behind the traffic on final,
   * ft: the Flying Orders' day minimum, Patrick's aim (TR-R18; WFO AL6.2, the final-spacing article; Patrick, 4 Oct 01:25Z).
   */
  finalSpacingFt: 2000,
  /**
   * An extended downwind starts its final turn far enough short of the overhead pattern's base and 45° leg
   * (Pattern 1 points 6 to 8) that the turn stays this far clear of them, ft; past that it breaks out instead
   * (Patrick, 4 Oct 21:52Z: "It would break out if it would hit the base leg of the OHB pattern"). An estimate.
   */
  extendClearFt: 1000,
});

const MOST_SEC = 600; // a guard: no move here lasts this long

/** The pilot's start state from an aircraft's state `from` = { x, y, alt, kias, headingDeg, bankDeg }. */
function startOf(from, phase) {
  return { x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, src: 0, phase };
}

/**
 * The flinch: `mode` 'climb' trades speed for height wings level (down toward the 180 KIAS climb speed,
 * as the go-around's zoom does) until about 500 ft up; 'bank' banks away to `side` (+1 right, -1 left) at
 * up to 60° and holds height. Lasts EVADE.flinchSec. Returns the path [{ x, y, alt, kt, g, phase, headingDeg }].
 */
export function buildFlinch(from, wind, { mode, side }) {
  const pilot = makePilot(startOf(from, 'flinch'), wind);
  const { s } = pilot;
  s.bank = from.bankDeg ?? 0;
  pilot.record();
  const startAlt = s.alt;
  const steps = Math.round(EVADE.flinchSec / PILOT_DT);
  for (let n = 0; n < steps; n++) {
    const g = gFromBankDeg(s.bank);
    const v = ktToFtps(pilot.tasKt());
    if (mode === 'climb') {
      const decel = s.ias > CIRCUIT.climbKias ? -(s.ias - CIRCUIT.climbKias) * KT_TO_FTPS / ZOOM_SEC : 0;
      const room = Math.max(0, startAlt + EVADE.flinchFt - s.alt) / LEVEL_OFF_SEC * 3;
      const climb = Math.max(0, Math.min(room, v * (excessThrustPerWeight(s.ias, s.alt, g) - decel / G_FTPS2)));
      pilot.step(0, climb, decel);
    } else {
      // Never past the stall line at this speed (a little inside it).
      const bank = Math.min(EVADE.flinchBankDeg, bankDegFromG(Math.max(1.01, 0.9 * stallLimitG(s.ias))));
      pilot.step((side < 0 ? -1 : 1) * bank, 0, 0);
    }
  }
  pilot.record();
  return pilot.points;
}

/**
 * The climb straight ahead before a fly-through breaks out (Patrick's Q4; SMM 4.28 para 67): wings level on
 * the track it has, full power, holding its speed, to `toAltFt`. Returns the path.
 */
export function buildClimbAhead(from, wind, toAltFt) {
  const pilot = makePilot(startOf(from, 'breakout'), wind);
  const { s } = pilot;
  s.bank = from.bankDeg ?? 0;
  pilot.record();
  const track = pilot.trackDeg();
  for (let n = 0; n < MOST_SEC / PILOT_DT && s.alt < toAltFt - 10; n++) {
    const g = gFromBankDeg(s.bank);
    const v = ktToFtps(pilot.tasKt());
    const full = Math.max(0, excessThrustPerWeight(s.ias, s.alt, g)) * v;
    // Too slow to climb on power alone: give up speed down to the climb speed for it.
    const decel = full < 5 && s.ias > CIRCUIT.climbKias ? -(s.ias - CIRCUIT.climbKias) * KT_TO_FTPS / ZOOM_SEC : 0;
    const climb = Math.min(Math.max(full, decel < 0 ? -decel * v / G_FTPS2 : 0), (toAltFt - s.alt) / LEVEL_OFF_SEC + 1);
    pilot.step(bankFor(pilot.headingFor(track), s, 30), Math.max(0, climb), decel);
  }
  pilot.record();
  return pilot.points;
}

/**
 * The way back onto a straight-in after a breakout (Patrick's Q7; SMM 4.5 para 8): back to a gate on the
 * straight-in's first leg 2 NM before the leg's end (from beyond it, out past the gate first), turning onto
 * the line there and settling at the line's height and 220 KIAS; the path follower then joins the
 * straight-in itself. `route` is the straight-in. Returns the path.
 */
export function buildRejoin(from, wind, route) {
  const pilot = makePilot(startOf(from, 'rejoin'), wind);
  pilot.s.bank = from.bankDeg ?? 0;
  pilot.record();
  flyRejoin(pilot, route, 0);
  pilot.record();
  return pilot.points;
}

/**
 * Flies `pilot` (circuit.js makePilot) back onto leg `leg` of `route` (from point `leg` to point `leg + 1`):
 * to a gate 2 NM before the leg's end, turning onto the line there and settling at the line's height and
 * 220 KIAS. Used by the straight-in rejoin above and by the breakout's rejoin onto ENT1 (breakout.js).
 */
export function flyRejoin(pilot, route, leg = 0) {
  const p0 = route.points[leg], p1 = route.points[leg + 1];
  const line = lineOf(p0, p1);
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  const ux = (p1.x - p0.x) / len, uy = (p1.y - p0.y) / len;
  const gateAlong = Math.max(0, len - EVADE.rejoinOutFt);
  const a0 = Number.isFinite(p0.alt) ? p0.alt : 3500, a1 = Number.isFinite(p1.alt) ? p1.alt : a0;
  const altFt = a0 + (a1 - a0) * gateAlong / len;
  const { s } = pilot;
  s.phase = 'rejoin';
  let stage = 'toGate', turning = false, held = false;
  for (let n = 0; n < MOST_SEC / PILOT_DT; n++) {
    const climb = Math.max(-EVADE.rejoinVertFtps, Math.min(EVADE.rejoinVertFtps, (altFt - s.alt) / LEVEL_OFF_SEC));
    const accel = s.ias < CIRCUIT.patternKias - 0.5 ? 2 : s.ias > CIRCUIT.patternKias + 0.5 ? -2 : 0;
    const off = legOffsetsFt(p0, p1, s);
    if (stage === 'toGate') {
      // Aim two turn radii back down the line from the gate, so the turn onto it ends by the gate.
      const R = turnRadiusFromBankFt(ktToFtps(iasToTasKt(s.ias, s.alt)), EVADE.rejoinBankDeg);
      const aim = { x: p0.x + ux * (gateAlong - 2 * R), y: p0.y + uy * (gateAlong - 2 * R) };
      if (off.alongFt <= gateAlong - R || Math.hypot(aim.x - s.x, aim.y - s.y) < R) stage = 'onto';
      pilot.step(bankFor(pilot.headingFor(compassDegFromVector(aim.x - s.x, aim.y - s.y)), s, 30), climb, accel);
      continue;
    }
    // Cut toward the line (up to 90°), then turn onto it when a steady turn at the rejoin bank rolls out on it
    // (readyToTurnOnto, as the circuit's own turns do), then hold it with small corrections.
    const trackErr = Math.abs(wrapDeg180(pilot.trackDeg() - line.trackDeg));
    if (!turning && !held) {
      const v = ktToFtps(pilot.tasKt());
      const R = turnRadiusFromBankFt(v, EVADE.rejoinBankDeg);
      const gsOnLine = Math.max(10, v + pilot.wind.x * ux + pilot.wind.y * uy); // the wind along the line, near enough
      if (readyToTurnOnto(line, s, pilot.trackDeg(), R, pilot.groundSpeedFtps(), gsOnLine)) turning = true;
      else if (Math.abs(off.crossFt) < 300 && trackErr < 15) held = true;
    }
    if (turning && trackErr < 3) { turning = false; held = true; }
    const bank = turning
      ? bankFor(pilot.headingFor(line.trackDeg), s, EVADE.rejoinBankDeg)
      : bankFor(pilot.headingFor(trackForLine(line, s, HOLD_RADIUS_FT)), s, 30);
    pilot.step(bank, climb, accel);
    const settled = Math.abs(off.crossFt) < 30 && Math.abs(wrapDeg180(pilot.trackDeg() - line.trackDeg)) < 2
      && Math.abs(s.bank) < 2 && Math.abs(s.alt - altFt) < 30;
    if (settled) break;
  }
}

/**
 * How far an aircraft on the inner downwind extends past its perch to turn final at least `EVADE.finalSpacingFt`
 * from every aircraft on final, ft: the shortest extension, in 100 ft steps up to `limitFt`, that does it; 0 when
 * none is needed, null when even `limitFt` isn't enough (it breaks out). `rolloutSec` is when it would roll out on
 * final without extending and `rolloutFt` how far from the threshold (about the window), `downwindGsFtps` its ground
 * speed on downwind and `finalGsFtps` on final. Each leader has `distAt(sec)`: how far from the threshold along
 * the centreline it will be that many seconds from now (0 or less once it is on the runway). Extending by E rolls
 * out E further out and about E / downwindGsFtps later. It is clear of a leader that stays at least the spacing
 * ahead of it all the way down final until that leader lands, or is at least the spacing behind it at the
 * rollout; one behind is left to space itself (it moves over if it must, TR-56).
 */
export function spacingExtensionFt({ rolloutSec, rolloutFt, downwindGsFtps, finalGsFtps, leaders, limitFt = Infinity }) {
  const clearAt = (e) => {
    const rollFt = rolloutFt + e, atSec = rolloutSec + e / Math.max(downwindGsFtps, 1);
    return leaders.every((l) => {
      if (l.distAt(atSec) - rollFt >= EVADE.finalSpacingFt) return true; // behind
      for (let k = 0; k * finalGsFtps <= rollFt; k++) { // each second down final, until the leader lands
        const leaderFt = l.distAt(atSec + k);
        if (leaderFt <= 0) break;
        if (rollFt - k * finalGsFtps - leaderFt < EVADE.finalSpacingFt) return false;
      }
      return true;
    });
  };
  const most = Math.min(limitFt, 20 * 6076); // a guard: never more than 20 NM
  for (let e = 0; e <= most; e += 100) if (clearAt(e)) return e;
  return null;
}

/**
 * The longest extension before the final turn would come within EVADE.extendClearFt of the overhead pattern's
 * base or 45° leg (Pattern 1 points 6-7 and 7-8), ft along the downwind from `perch`: where the extended downwind
 * first crosses either, less one final-turn radius (the turn's reach ahead, 35° at 120 KIAS, CIRCUIT) and the
 * clearance. Infinity when the extended downwind never crosses them.
 */
export function extendLimitFt(points, perch) {
  const back = (lineOf(points[0], points[1]).trackDeg + 180) * Math.PI / 180;
  const dx = Math.sin(back), dy = Math.cos(back);
  let first = Infinity;
  for (const [i, j] of [[6, 7], [7, 8]]) {
    const a = points[i], b = points[j];
    if (!a || !b) continue;
    const ex = b.x - a.x, ey = b.y - a.y;
    const det = ex * dy - ey * dx;
    if (Math.abs(det) < 1e-9) continue;
    const rx = a.x - perch.x, ry = a.y - perch.y;
    const along = (ex * ry - ey * rx) / det, u = (dx * ry - dy * rx) / det;
    if (along > 0 && u >= 0 && u <= 1) first = Math.min(first, along);
  }
  const radiusFt = turnRadiusFromBankFt(ktToFtps(iasToTasKt(CIRCUIT.finalTurnKias, PATTERN_ALT_FT)), CIRCUIT.finalTurnBankDeg);
  return first - radiusFt - EVADE.extendClearFt;
}
