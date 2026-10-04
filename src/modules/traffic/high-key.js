// High Key from anywhere for the Traffic Sim: the climb onto the run-in, flown once by the simulated pilot.
// Ground truth: 15 Wing Moose Jaw CT-156 Harvard II / CYMJ Runway 29L
import { degToRad, wrapDeg180 } from '../../core/angles.js';
import { ktToFtps } from '../../core/units.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { THRESHOLD_29L, PFL_KEY_ALT_FT, RUNWAY_29L_HDG_DEG } from './airfield.js';
import { makePilot, bankFor, trackForLine, readyToTurnOnto, lineOf, powerClimb, HOLD_RADIUS_FT } from './circuit.js';
import { turnRadiusFromBankFt } from '../../core/flight-math.js';
import { legOffsetsFt } from '../../core/geo.js';

// ── HIGH KEY GROUND TRUTH CONSTANTS ──────────────────────────────────────────
export const HIGH_KEY_PT = Object.freeze({ x: THRESHOLD_29L.x, y: THRESHOLD_29L.y, alt: PFL_KEY_ALT_FT.highKey });
export const RWY_HDG_DEG = RUNWAY_29L_HDG_DEG;
const RAD_RWY = degToRad(RWY_HDG_DEG);
const UX_RWY = Math.sin(RAD_RWY); // -0.88294759...
const UY_RWY = Math.cos(RAD_RWY); // +0.46947156...

// ── High Key from anywhere: a flown climbing turn onto the run-in ─────────────
// Traffic spec PR 4 item 23 and the ratified PFL answers (pfl-prep, 4 Oct): the
// High Key button works from anywhere; the aircraft climbs at full power and
// 140 KIAS (spec item 16) in a climbing turn that rolls out on the run-in, 1/8 NM
// (about 760 ft) before High Key on the runway track, and arrives at High Key at
// its height (Patrick, 4 Oct 09:14Z: the button snapped and slewed). Flown once
// by the simulated pilot (circuit.js makePilot), so it starts from the aircraft's
// own place, height, speed, heading and bank with no step.

/** The run-in: 1/8 NM (6,076 / 8, about 760 ft) on the runway track before High Key (ratified, pfl-prep). */
export const HIGH_KEY_RUN_IN_FT = 760;
/** Climb speed to High Key: full power at 140 KIAS (PR 4 spec item 16). */
export const HIGH_KEY_CLIMB_KIAS = 140;
/** Seconds wings level on the runway track before the run-in starts (an estimate, so the roll-out is finished in time). */
const HIGH_KEY_SETTLE_SEC = 5;

/**
 * Flies the climb to High Key from `from` = { x, y, alt, kias, headingDeg, bankDeg }
 * in a wind, with turns at `bankDeg` (the closed-pattern bank setting, default 50°).
 * Returns { points, arriveAltFt }: the path ends at High Key on the runway track.
 * If the climb would arrive low, the join on the extended centreline moves
 * further out and it flies again (up to 8 tries), so it arrives at height when it can.
 */
export function buildHighKeyClimb(from, wind = {}, bankDeg = 50) {
  const env = { windFromDeg: wind.windFromDeg ?? 360, windKt: wind.windKt ?? 0 };
  const hk = HIGH_KEY_PT;
  const outFt = 60000;
  const line = lineOf({ x: hk.x - outFt * UX_RWY, y: hk.y - outFt * UY_RWY }, { x: hk.x, y: hk.y });
  let joinFt = HIGH_KEY_RUN_IN_FT;
  let best = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const flown = flyHighKeyClimb(from, env, bankDeg, line, joinFt);
    best = flown;
    if (flown.missed) { joinFt += 3000; continue; } // reached High Key off the line: join further out
    const shortFt = hk.alt - 50 - flown.arriveAltFt;
    if (shortFt <= 0 || flown.pastJoin) break;
    // Not high enough: join further out by the distance the missing height takes to climb.
    joinFt += shortFt / Math.max(5, flown.climbFtps) * ktToFtps(HIGH_KEY_CLIMB_KIAS);
  }
  return best;
}

function flyHighKeyClimb(from, env, bankMax, line, joinFt) {
  const hk = HIGH_KEY_PT;
  const pilot = makePilot({ x: from.x, y: from.y, alt: from.alt, ias: from.kias, hdg: from.headingDeg, src: 0, phase: 'climb_high_key' }, env);
  const { s } = pilot;
  s.bank = from.bankDeg ?? 0;
  pilot.record();
  // Where it should be on the line by: joinFt before High Key (and so at least the run-in).
  const lineLenFt = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
  const joinAlongFt = lineLenFt - joinFt;
  let stage = 'toLine', capturing = false, pastJoin = false, climbSum = 0, climbN = 0;
  for (let n = 0; n < 20000; n++) {
    const v = ktToFtps(pilot.tasKt());
    const { alongFt, crossFt } = legOffsetsFt(line.a, line.b, s);
    if (stage === 'onLine' && alongFt >= lineLenFt) break; // at High Key
    // Height and speed: full power, 140 KIAS, a smooth level-off at High Key height; extra speed buys height.
    const { climb, accel, climbMax } = powerClimb(pilot, HIGH_KEY_CLIMB_KIAS, hk.alt);
    if (climb > 1) { climbSum += climb; climbN++; }
    // Where to point: toward the join on the extended centreline, then turn onto it and hold it to High Key.
    const R = turnRadiusFromBankFt(v, bankMax);
    let bank;
    if (stage === 'toLine') {
      // Shortest turn-straight-turn path (Dubins) to the join on the runway track, worked out
      // again every step so the wind and the roll are taken care of; fly its first turn, then its straight.
      const gs = pilot.groundSpeedFtps();
      const windFtps = ktToFtps(env.windKt ?? 0);
      const Rg = R * ((v + windFtps) / v) ** 2; // the widest the turn gets over the ground, downwind
      // Aim to roll out a few seconds before the join so the run-in is flown wings level.
      const settleFt = HIGH_KEY_SETTLE_SEC * ktToFtps(iasToTasKt(HIGH_KEY_CLIMB_KIAS, hk.alt));
      const join = { x: line.a.x + UX_RWY * (joinAlongFt - settleFt), y: line.a.y + UY_RWY * (joinAlongFt - settleFt) };
      const plan = shortestTurnStraightTurn(s, pilot.trackDeg(), join, line.trackDeg, Rg);
      if (plan.firstTurnDeg > 3) {
        bank = bankFor(pilot.headingFor(pilot.trackDeg() + (plan.first === 'L' ? -1 : 1) * Math.min(plan.firstTurnDeg, 90)), s, bankMax, plan.first === 'L' ? 'left' : 'right');
      } else {
        bank = bankFor(pilot.headingFor(plan.straightTrackDeg), s, bankMax);
      }
      const toGoSec = (lineLenFt - alongFt) / Math.max(1, gs);
      const canMakeHeight = hk.alt - 50 - s.alt <= Math.max(climbMax, 20) * toGoSec;
      const nearlyOn = Math.abs(crossFt) < 300 && Math.abs(wrapDeg180(pilot.trackDeg() - line.trackDeg)) < 30;
      if (alongFt <= joinAlongFt && plan.firstTurnDeg <= 3 && readyToTurnOnto(line, s, pilot.trackDeg(), R, gs)) {
        stage = 'onLine'; capturing = true;
      } else if (nearlyOn && alongFt < lineLenFt && (alongFt <= joinAlongFt || canMakeHeight)) {
        stage = 'onLine'; capturing = true; pastJoin = alongFt > joinAlongFt;
      }
    } else {
      if (capturing && Math.abs(wrapDeg180(line.trackDeg - pilot.trackDeg())) < 3) capturing = false;
      bank = capturing
        ? bankFor(pilot.headingFor(line.trackDeg), s, bankMax)
        : bankFor(pilot.headingFor(trackForLine(line, s, HOLD_RADIUS_FT)), s, 30);
      if (alongFt >= lineLenFt - HIGH_KEY_RUN_IN_FT) s.phase = 'high_key_run_in';
    }
    pilot.step(bank, climb, accel);
  }
  const missed = Math.abs(legOffsetsFt(line.a, line.b, s).crossFt) > 150;
  pilot.mark({ phase: 'high_key', tag: 'high_key' });
  return { points: pilot.points, arriveAltFt: s.alt, climbFtps: climbN ? climbSum / climbN : 0, pastJoin, missed };
}

/**
 * The shortest path from p on `trackDeg` to q on `qTrackDeg` made of a turn, a
 * straight and a turn, all turns of radius R (a Dubins path; standard geometry).
 * Returns { first: 'L' | 'R', firstTurnDeg, straightTrackDeg, straightFt, lengthFt }.
 */
function shortestTurnStraightTurn(p, trackDeg, q, qTrackDeg, R) {
  const rad = Math.PI / 180, TAU = 2 * Math.PI;
  const mod = (a) => ((a % TAU) + TAU) % TAU;
  // Math angles (anticlockwise from east): a left turn is anticlockwise.
  const a0 = (90 - trackDeg) * rad, a1 = (90 - qTrackDeg) * rad;
  const centre = (pt, a, side) => ({ x: pt.x + side * R * Math.cos(a + Math.PI / 2), y: pt.y + side * R * Math.sin(a + Math.PI / 2) });
  let best = null;
  for (const [t1, t2] of [['L', 'L'], ['R', 'R'], ['L', 'R'], ['R', 'L']]) {
    const s1 = t1 === 'L' ? 1 : -1, s2 = t2 === 'L' ? 1 : -1;
    const c1 = centre(p, a0, s1), c2 = centre(q, a1, s2);
    const dx = c2.x - c1.x, dy = c2.y - c1.y, D = Math.hypot(dx, dy), thetaC = Math.atan2(dy, dx);
    let psi, L;
    if (t1 === t2) { psi = thetaC; L = D; }
    else {
      if (D < 2 * R) continue;
      L = Math.sqrt(D * D - 4 * R * R);
      psi = t1 === 'L' ? thetaC + Math.atan2(2 * R, L) : thetaC - Math.atan2(2 * R, L);
    }
    const turn = (from, to, side) => side > 0 ? mod(to - from) : mod(from - to);
    const arc1 = turn(a0, psi, s1), arc2 = turn(psi, a1, s2);
    const len = R * (arc1 + arc2) + L;
    if (!best || len < best.lengthFt) {
      best = { first: t1, firstTurnDeg: arc1 / rad, straightTrackDeg: ((90 - psi / rad) % 360 + 360) % 360, straightFt: L, lengthFt: len };
    }
  }
  return best;
}
