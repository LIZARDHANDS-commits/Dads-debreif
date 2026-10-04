// Randomize behaviour (Patrick, 4 Oct 21:52Z to 21:55Z; Traffic spec 4.13): an aircraft rolls the dice at three
// points each lap and may fly something other than the normal circuit.
//
//   - on the upwind after take-off, from the departure end of the runway to 3/4 mile past it: a closed pattern, a
//     closed pattern to High Key (the climb to High Key and the PFL), or carry on (Patrick: closed patterns only
//     start on the upwind, before the crosswind turn; the button works from anywhere, the dice only here);
//   - abeam the departure end on the outer downwind: descend for a straight-in, climb to High Key for a PFL, or
//     carry on round the overhead;
//   - on final, about a mile out: touch-and-go, full stop or low approach.
//
// The rolls are seeded: each one is a hash of the run's seed, the callsign and how many rolls that aircraft has
// made, so a rewind replays the same choices and the order aircraft are listed in changes nothing.
//
// The straight-in from the outer downwind is flown once by the circuit's simulated pilot (circuit.js makePilot),
// as Patrick gave it (4 Oct 22:44Z; TR-3): down from 3,500 to 2,700 ft from abeam the departure end, then onto the
// straight-in route's base leg (ENT2, the straight-in rejoin), rolling out on base at 140 KIAS; ENT2 then flies the
// final turn at 120 KIAS and the glide path to the runway (SMM 4.5 para 8, 4.7 para 12).
//
// Positions in map feet (x east, y north), headings compass degrees true, speeds KIAS. Nothing here reads a
// setting or the page.
import { ktToFtps } from '../../core/units.js';
import { gFromBankDeg, turnRadiusFromBankFt } from '../../core/flight-math.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { legOffsetsFt } from '../../core/geo.js';
import { wrapDeg180 } from '../../core/angles.js';
import { makePilot, bankFor, trackForLine, readyToTurnOnto, lineOf, accelFor, idleDecel, LEVEL_OFF_SEC, HOLD_RADIUS_FT, PILOT_DT } from './circuit.js';

/** Every number Randomize uses, each with its source. */
export const RANDOM = Object.freeze({
  /** The upwind roll is made up to this far past the departure end, ft: 3/4 mile (Patrick, 4 Oct 21:54Z; 1 NM = 6,076 ft). */
  upwindWindowFt: 0.75 * 6076,
  /** The outer-downwind roll, and the SI pattern's straight-in, start within this far past abeam the departure end, ft
   *  (Pattern 1 point 5; an engineering window: the 0.5 s decision step at 220 KIAS covers about 190 ft). */
  downwindWindowFt: 3000,
  /** The final roll is made this far from the threshold, ft: about a mile (an estimate). */
  finalRollFt: 6076,
  /** A low approach goes around this far from the threshold, ft (an estimate: about a quarter mile, low over the runway end). */
  lowApproachFt: 1500,
  /** The straight-in from the outer downwind (TR-3; SMM 4.5 para 8, 4.7 para 12). */
  straightInAltFt: 2700,
  /** The descent to it is flown at 220 KIAS (SMM 4.16 para 36; Patrick, 4 Oct 23:15Z "keep 220 until at 2700"). */
  descentKias: 220,
  straightInKias: 140,
  /** Bank in the base turn: 45° (an estimate inside the SMM's 45-60° pattern turns, SMM 4.14 para 33). */
  turnBankDeg: 45,
  /** Steepest descent from pattern height to the straight-in height, ft/s (1,000 ft/min, an estimate). */
  descentFtps: 1000 / 60,
});

/**
 * The odds at each point for `sharePct`, how often an aircraft does something other than the normal circuit
 * (the Randomize setting, 40 percent by default; Patrick's card "Odds as a setting", 4 Oct 22:29Z): the normal
 * choice (carry on, or a touch-and-go on final) takes the rest, and the others split the share evenly.
 */
export function oddsFor(sharePct = 40) {
  const p = Math.max(0, Math.min(100, Number.isFinite(+sharePct) ? +sharePct : 40)) / 100;
  return {
    upwind: { carry_on: 1 - p, closed_pattern: p / 2, closed_high_key: p / 2 },
    downwind: { carry_on: 1 - p, straight_in: p / 2, high_key: p / 2 },
    final: { touch_and_go: 1 - p, full_stop: p / 2, low_approach: p / 2 },
  };
}

/**
 * One roll, 0 up to (not including) 1, from the run's seed, the callsign and the roll's count: a hash, so the same
 * three always give the same number (mulberry32's mixing, as dice.js).
 */
export function rollFor(seed, id, count) {
  let h = (Math.trunc(+seed) || 0) >>> 0;
  for (const ch of `${id}#${count}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x9e3779b1) >>> 0;
  let t = (h + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The choice a roll `u` (0 to 1) picks from `odds` ({ choice: share }), in the order they are listed. */
export function pick(odds, u) {
  const entries = Object.entries(odds);
  const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
  let run = 0;
  for (const [choice, w] of entries) {
    run += w / total;
    if (u < run) return choice;
  }
  return entries[entries.length - 1][0];
}

const MOST_STEPS = 6000; // a guard: 10 minutes of flying

/**
 * The straight-in from the outer downwind (Patrick, 4 Oct 22:44Z), flown from the aircraft's state `from` = { x, y,
 * alt, kias, headingDeg, bankDeg } in a wind: from abeam the departure end along Pattern 1's outer downwind (points 5-6,
 * carried on) down to 2,700 ft at 220 KIAS, then level and slowing at idle toward 140 KIAS (SMM 4.16 para 36);
 * the left turn onto the straight-in route's base leg (`ent2` points 1-2, Entry Mid to Entry Gate, the straight-in
 * rejoin, about a mile past the overhead's base turn as SMM 4.16 para 36 has it), rolling out on base at 140 KIAS. It ends once
 * settled on the base leg, where the straight-in route takes over (its final turn at 120 KIAS and the glide path).
 * Returns the path [{ x, y, alt, kt, g, phase, headingDeg }].
 */
export function buildDownwindStraightIn(points, from, wind, ent2) {
  const pilot = makePilot({ x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, src: 0, phase: 'straight_in' }, wind);
  const { s } = pilot;
  s.bank = from.bankDeg ?? 0;
  pilot.record();
  const downwind = lineOf(points[5], points[6]);
  const base = lineOf(ent2.points[1], ent2.points[2]);
  let stage = 'downwind', capturing = false, slowing = false;
  for (let n = 0; n < MOST_STEPS; n++) {
    const g = gFromBankDeg(s.bank);
    const tas = ktToFtps(pilot.tasKt());
    const R = turnRadiusFromBankFt(tas, RANDOM.turnBankDeg);
    const gs = pilot.groundSpeedFtps();
    // Level at 2,700 ft, then let it slow at idle toward 140 KIAS, holding 140 once there (SMM 4.16 para 36: descend at
    // 220 KIAS to 300 ft below pattern height, then level and decelerate; roll out on base below 147).
    if (!slowing && Math.abs(s.alt - RANDOM.straightInAltFt) < 30) slowing = true;
    const climb = Math.max(-RANDOM.descentFtps, Math.min(RANDOM.descentFtps, (RANDOM.straightInAltFt - s.alt) / LEVEL_OFF_SEC));
    // Until then it holds 220 KIAS (power as needed); then the reduced power lets it slow toward 140, in the turn too.
    const wantKias = slowing ? RANDOM.straightInKias : RANDOM.descentKias;
    const toTarget = (ktToFtps(iasToTasKt(wantKias, s.alt)) - tas) / PILOT_DT;
    const accel = Math.max(idleDecel(s.ias, s.alt, g), Math.min(Math.max(0, accelFor(s.ias, s.alt, g, climb)), toTarget));
    const line = stage === 'downwind' ? downwind : base;
    if (capturing && Math.abs(wrapDeg180(line.trackDeg - pilot.trackDeg())) < 15) capturing = false;
    const bank = capturing
      ? bankFor(pilot.headingFor(line.trackDeg), s, RANDOM.turnBankDeg, 'left')
      : bankFor(pilot.headingFor(trackForLine(line, s, HOLD_RADIUS_FT)), s, 30);
    if (stage === 'downwind' && readyToTurnOnto(base, s, pilot.trackDeg(), R, gs)) { stage = 'base'; capturing = true; pilot.mark({ phase: 'straight_in' }); }
    else if (stage === 'base' && !capturing && Math.abs(legOffsetsFt(base.a, base.b, s).crossFt) < 30 && Math.abs(s.bank) < 2) break;
    pilot.step(bank, climb, accel);
  }
  pilot.record();
  return pilot.points;
}
