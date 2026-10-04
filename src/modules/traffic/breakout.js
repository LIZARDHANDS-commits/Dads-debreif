// ╔══════════════════════════════════════════════════════════════════════╗
// ║  OPERATOR WARNING — READ BEFORE DEBUGGING TEST FAILURES            ║
// ║                                                                    ║
// ║  These tests use PILOT-DOMAIN TOLERANCES (±10 kt, ±100 ft, ±5°).  ║
// ║  If a test fails repeatedly, DO NOT tweak the physics engine to    ║
// ║  make it pass. Instead:                                            ║
// ║    1. Ask the operator what to do.                                 ║
// ║    2. The test tolerance may need widening, OR                     ║
// ║    3. There may be a genuine flight behavior bug.                  ║
// ║  Never force physics to match a test value.                        ║
// ╚══════════════════════════════════════════════════════════════════════╝

/**
 * Breakout Maneuver Controller & Rejoin Flight Engine (D369, D371, D411, D412, R22, R34)
 * Authoritative ground truth: CYMJ Moose Jaw Flying Manuals & Patrick's Lead Pilot Guidance.
 *
 * Stage 1: Climb to 4,500 ft MSL while accelerating to 220 KIAS, vectoring to Breakout Point
 *          (-10974, -24252) with Pillar 8 climb arrest pitch decay over last 300 ft (4,200 -> 4,500 ft).
 * Stage 2: Descending Rejoin Arc from 4,500 ft to 3,500 ft MSL curving toward the ENT1 track
 *          to intercept the 2 NM prior point (10256, -38141).
 * Tangent Capture: a planned turn rolls out on the ENT1 line; once on it at 3,500 ft (±100 ft) with the
 *          track along it and the wings level, the aircraft goes straight onto the ENT1 path (startJoin).
 * Rollout: Heading settles to ENT1 track (~034°), wings level (bank = 0°), airspeed 220 KIAS,
 *          altitude 3,500 ft, continuing up ENT1 into the circuit entry.
 */

import { wrapDeg180 } from '../../core/angles.js';
import { windTriangle } from '../../core/wind.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { turnRadiusFromBankFt, bankDegFromTurnRate } from '../../core/flight-math.js';
import { ktToFtps } from '../../core/units.js';
import { closestDistFt, DEFAULT_ROUTE_OPTIONS } from './route.js';
import { startJoin } from './path-follower.js';

// ── Ground Truth Geometry Constants ──────────────────────────────────────────
export const BREAKOUT_PT = Object.freeze({ x: -10974, y: -24252 });
export const ENTRY_MID_PT = Object.freeze({ x: 4806, y: -46304 });
export const ENTRY_GATE_PT = Object.freeze({ x: 17000, y: -28031 });
export const REJOIN_INTERCEPT_PT = Object.freeze({ x: 10256, y: -38141 }); // 2 NM prior to Entry Gate along ENT1

// ENT1 Path vector and track heading (~033.7° / 034°)
const DX_ENT1 = ENTRY_GATE_PT.x - ENTRY_MID_PT.x; // 12194 ft
const DY_ENT1 = ENTRY_GATE_PT.y - ENTRY_MID_PT.y; // 18273 ft
const LEN_ENT1 = Math.hypot(DX_ENT1, DY_ENT1);   // 21968.1 ft
export const ENT1_TRACK_DEG = (Math.atan2(DX_ENT1, DY_ENT1) * 180 / Math.PI + 360) % 360; // 33.716°

// Unit vectors along and perpendicular to ENT1 track
const UX_ENT1 = DX_ENT1 / LEN_ENT1;
const UY_ENT1 = DY_ENT1 / LEN_ENT1;

// Along-track distance of 2 NM point from ENTRY_MID_PT: ~9815 ft
export const REJOIN_ALONG_TRACK_FT = (REJOIN_INTERCEPT_PT.x - ENTRY_MID_PT.x) * UX_ENT1 +
  (REJOIN_INTERCEPT_PT.y - ENTRY_MID_PT.y) * UY_ENT1;

// Canonical ENT1 route definition
export const ENT1_ROUTE = Object.freeze({
  id: 'ENT1',
  name: 'Entry 1',
  kind: 'entry',
  visible: true,
  color: '#bc8cff',
  attachTo: 'PAT1',
  mergeIndex: 7,
  points: Object.freeze([
    Object.freeze({ label: 'Entry Start', x: -8694.14, y: -66643.51, alt: 3500, kt: 220, g: 2, phase: 'entry', tag: 'entry_start' }),
    Object.freeze({ label: 'Entry Mid', x: 4805.86, y: -46303.51, alt: 3500, kt: 220, g: 2, phase: 'entry', tag: 'entry_mid' }),
    Object.freeze({ label: 'Entry Gate', x: 17000.12, y: -28031.35, alt: 3500, kt: 220, g: 2, phase: 'entry', tag: 'entry_gate' }),
    Object.freeze({ label: 'Merge', x: 21689.42, y: -19427.08, alt: 3500, kt: 220, g: 2, phase: 'initial', tag: 'merge' }),
  ]),
});

/**
 * Calculates distance in feet along ENT1 track from ENTRY_MID_PT.
 * @param {{x: number, y: number}} pt
 * @returns {number} Along-track distance in feet
 */
export function calcAlongTrackENT1(pt) {
  const vx = (pt.x ?? 0) - ENTRY_MID_PT.x;
  const vy = (pt.y ?? 0) - ENTRY_MID_PT.y;
  return vx * UX_ENT1 + vy * UY_ENT1;
}

/**
 * Calculates signed cross-track distance in feet from ENT1 track.
 * Positive = right of track (East/South-East), Negative = left of track (West/North-West).
 * @param {{x: number, y: number}} pt
 * @returns {number} Signed cross-track distance in feet
 */
export function calcCrossTrackENT1(pt) {
  const vx = (pt.x ?? 0) - ENTRY_MID_PT.x;
  const vy = (pt.y ?? 0) - ENTRY_MID_PT.y;
  return vx * UY_ENT1 - vy * UX_ENT1;
}

/**
 * Resolves the ENT1 route object from context or fallback.
 * @param {Object} [route]
 * @returns {Object}
 */
export function resolveEntRoute(route) {
  if (route?.id === 'ENT1') return route;
  if (Array.isArray(route)) {
    const found = route.find((r) => r.id === 'ENT1' || (r.kind === 'entry' && r.attachTo === 'PAT1'));
    if (found) return found;
  }
  if (route?._allRoutes && Array.isArray(route._allRoutes)) {
    const found = route._allRoutes.find((r) => r.id === 'ENT1');
    if (found) return found;
  }
  return ENT1_ROUTE;
}

/**
 * Calculates desired heading and bank target for Stage 2 descending rejoin arc.
 *
 * @param {Object} a - Aircraft state
 * @param {number} tasKt - True airspeed in knots
 * @param {Object} [env] - Wind environment
 * @returns {{ targetHdg: number, deltaHdg: number, cross: number, along: number }}
 */
export function calcRejoinDesiredHeading(a, tasKt, env) {
  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;

  const along = calcAlongTrackENT1(a);
  const cross = calcCrossTrackENT1(a);
  const crossDist = Math.abs(cross);

  // Far off: a 60° intercept toward the line. Close to it (after the planned turn, see rejoinTurnBankDeg),
  // the intercept angle shrinks with the distance off, so the last few feet are closed gently.
  const thetaDeg = Math.min(REJOIN_INTERCEPT_DEG, (crossDist / REJOIN_SETTLE_FT) * 180 / Math.PI);
  const toward = cross > 0 ? -1 : 1; // positive cross is right of track: turn left toward it
  let desiredTrack = (ENT1_TRACK_DEG + toward * thetaDeg + 360) % 360;
  if (along > REJOIN_ALONG_TRACK_FT && crossDist > rejoinRadiusFt(tasKt)) {
    // Already past the 2 NM point and well off the line: head for the 2 NM point instead.
    desiredTrack = (Math.atan2(REJOIN_INTERCEPT_PT.x - (a.x ?? 0), REJOIN_INTERCEPT_PT.y - (a.y ?? 0)) * 180 / Math.PI + 360) % 360;
  }

  // Wind crab compensation to hold track
  const wt = windTriangle(desiredTrack, Math.max(1, tasKt), windFromDeg, windKt);
  const targetHdg = wt.canHoldTrack ? wt.headingDeg : desiredTrack;
  const deltaHdg = wrapDeg180(targetHdg - (a.headingDeg ?? 0));

  return { targetHdg, deltaHdg, cross, along };
}

/** Bank of the rejoin turn onto ENT1, degrees (an estimate; the old arc used 35-40°). */
export const REJOIN_BANK_DEG = 35;
/** Intercept angle onto ENT1 while still well off it, degrees (an estimate). */
export const REJOIN_INTERCEPT_DEG = 60;

/**
 * Bank the rejoin path is planned at, degrees (an estimate). Shallower than REJOIN_BANK_DEG so the
 * aircraft has bank in hand to catch up after rolling in, and rolls out on the line instead of past it.
 */
export const REJOIN_PLAN_BANK_DEG = 25;

/** Distance off the line inside which the intercept angle shrinks toward zero, ft (an estimate). */
const REJOIN_SETTLE_FT = 500;

/** Radius of the planned rejoin turn at this true airspeed: what REJOIN_PLAN_BANK_DEG gives. */
function rejoinRadiusFt(tasKt) {
  return turnRadiusFromBankFt(ktToFtps(Math.max(60, tasKt)), REJOIN_PLAN_BANK_DEG);
}

/**
 * The rejoin turn onto ENT1, planned so it ends on the line with the track along it (Patrick,
 * 4 Oct 09:21Z: the path's end conditions have the vector in line with the track).
 *
 * Heading toward the line at an angle chi with `cross` feet still to go, a steady turn of radius
 * R = |cross| / (1 - cos chi) rolls out exactly on the line, tangent. The turn starts when that
 * radius comes down to the planned one (REJOIN_PLAN_BANK_DEG), and each step the bank is re-worked
 * from where the aircraft really is, so roll-in lag and wind are taken out as it goes. Returns the
 * signed bank (right positive), or null when no turn is due yet (or it is over).
 */
export function rejoinTurnBankDeg(a, tasKt, cross) {
  const trackDeg = Number.isFinite(a.trackDeg) ? a.trackDeg : (a.headingDeg ?? 0);
  const chiDeg = wrapDeg180(trackDeg - ENT1_TRACK_DEG); // positive: pointing right of the line
  const closing = cross * chiDeg < 0;
  if (!closing || Math.abs(chiDeg) < REJOIN_TURN_END_DEG) {
    delete a._rejoinTurning;
    delete a.commandedBankDeg;
    return null;
  }
  const radiusReqFt = Math.abs(cross) / (1 - Math.cos(chiDeg * Math.PI / 180));
  if (!a._rejoinTurning && radiusReqFt > rejoinRadiusFt(tasKt) * REJOIN_TURN_LEAD) return null;
  a._rejoinTurning = true;
  // Ground-track turn rate the radius needs, then the bank that gives it at this true airspeed.
  const gsFtps = ktToFtps(Math.max(10, a.groundSpeedKt ?? a.gsKt ?? tasKt));
  const rateRadPerSec = -Math.sign(chiDeg) * gsFtps / Math.max(1, radiusReqFt);
  const bankDeg = bankDegFromTurnRate(ktToFtps(Math.max(60, tasKt)), rateRadPerSec);
  return Math.max(-REJOIN_BANK_DEG, Math.min(REJOIN_BANK_DEG, bankDeg));
}

/**
 * The turn starts a little before the planned radius is reached, for the roll-in (an estimate);
 * the bank then sits a touch under the plan and grows to it as the roll catches up.
 */
const REJOIN_TURN_LEAD = 1.15;

/** The planned turn hands back to fine steering this close to the line's track, degrees (an estimate). */
const REJOIN_TURN_END_DEG = 0.5;

/**
 * Breakout Maneuver Controller:
 * Smooth continuous pilot maneuver (Patrick's Lead Pilot Guidance & SMM Chapter 16):
 *
 * Stage 1: Climb to 4,500 ft MSL while accelerating to 220 KIAS, vectoring to Breakout Point (-10974, -24252).
 *          Over the last 300 ft of climb (4,200 to 4,500 ft MSL), pitch smoothly decays to 0° (Pillar 8 climb arrest).
 * Stage 2: Descending Rejoin Arc from 4,500 ft to 3,500 ft MSL at 220 KIAS curving toward the ENT1 track
 *          to intercept 2 NM prior to circuit entry at (10256, -38141).
 *          Pitch smoothly decays to 0° over the last 300 ft (3,800 to 3,500 ft MSL).
 * Tangent Capture: a planned turn rolls out on the ENT1 line; once on it at 3,500 ft (±100 ft) with the
 *          track along it and the wings level, the aircraft goes straight onto the ENT1 path (startJoin).
 * Rollout: Heading settles to ENT1 track (~034°), wings level (bank = 0°), airspeed 220 KIAS,
 *          altitude 3,500 ft, continuing up ENT1 into the circuit entry.
 *
 * @param {Object} a - Aircraft state object
 * @param {Object} [route] - Active route
 * @param {Object} [env] - Wind environment
 * @param {number} [stepDt=0.05] - Time step in seconds
 * @param {Object} [routeOptions=DEFAULT_ROUTE_OPTIONS] - Route calculation options
 */
export function stepBreakout(a, route = null, env = null, stepDt = 0.05, routeOptions = DEFAULT_ROUTE_OPTIONS) {
  if (!a || (a.phase !== 'breakout' && a.command !== 'breakout')) return;

  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const tasKt = iasToTasKt(a.iasKt || 220, a.alt || 4500);

  a.targetSpeedKt = 220;
  a.intent = 'overhead';

  // ── Stage Determination ───────────────────────────────────────────────────
  // Stage 1 = climb to breakout point (-10974, -24252) at 4,500 ft MSL
  // Stage 2 = descending rejoin arc to ENT1 (2 NM prior to circuit entry)
  const distToBreakoutPt = Math.hypot(BREAKOUT_PT.x - (a.x ?? 0), BREAKOUT_PT.y - (a.y ?? 0));
  const pastBreakout = (a._breakoutStage === 2) ||
    (distToBreakoutPt <= 2500 && (a.alt ?? 0) >= 4200);

  if (!pastBreakout) {
    // ── STAGE 1: Climbing Turn to 4,500 ft toward Breakout Point ──
    a._breakoutStage = 1;
    a.targetAltFt = 4500;

    // Pitch attitude: climb nominal 10°, decaying smoothly to 0° in last 300 ft (4,200 to 4,500 ft MSL)
    const alt = a.alt ?? 3500;
    if (alt >= 4200) {
      a.pitchDeg = Math.max(0, 10 * (4500 - alt) / 300);
    } else {
      a.pitchDeg = 10;
    }

    // Steering toward Breakout Point
    const dx = BREAKOUT_PT.x - (a.x ?? 0);
    const dy = BREAKOUT_PT.y - (a.y ?? 0);
    const bearingToPt = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const wt = windTriangle(bearingToPt, Math.max(1, tasKt), windFromDeg, windKt);
    const targetHdg = wt.canHoldTrack ? wt.headingDeg : bearingToPt;
    a.desiredHeadingDeg = targetHdg;

    const deltaHdg = wrapDeg180(targetHdg - (a.headingDeg ?? 0));
    if (Math.abs(deltaHdg) <= 2.5) {
      a.targetBankDeg = 0;
    } else if (Math.abs(deltaHdg) < 25) {
      a.targetBankDeg = Math.max(-45, Math.min(45, deltaHdg * 1.8));
    } else {
      a.targetBankDeg = deltaHdg < 0 ? -45 : 45;
    }
    return;
  }

  // A straight-in rejoins as a straight-in (Patrick's card, Q7): sim.js flies it back from here (evade.js).
  if (a.rejoinRouteId) { a.breakoutRejoinDue = true; return; }

  // ── STAGE 2: Descending Rejoin Arc toward ENT1 ────────────────────────────
  a._breakoutStage = 2;
  a.targetAltFt = 3500;

  // Pitch attitude: smooth descent from 4,500 ft to 3,500 ft, decaying to 0° in last 300 ft (3,800 to 3,500 ft MSL)
  const alt = a.alt ?? 4500;
  if (alt <= 3500) {
    a.pitchDeg = 0;
  } else if (alt <= 3800) {
    a.pitchDeg = Math.min(0, -3.5 * (alt - 3500) / 300);
  } else {
    a.pitchDeg = -3.5;
  }

  // Calculate rejoin heading and cross/along-track metrics
  const { targetHdg, deltaHdg, cross, along } = calcRejoinDesiredHeading(a, tasKt, env);
  a.desiredHeadingDeg = targetHdg;

  if (Math.abs(deltaHdg) <= 2.5) {
    a.targetBankDeg = 0;
  } else if (Math.abs(deltaHdg) < 25) {
    a.targetBankDeg = Math.max(-40, Math.min(40, deltaHdg * 1.8));
  } else {
    a.targetBankDeg = deltaHdg < 0 ? -35 : 35;
  }
  // The planned turn onto the line sets the bank directly; otherwise the heading steering does.
  const plannedBank = rejoinTurnBankDeg(a, tasKt, cross);
  if (plannedBank === null) delete a.commandedBankDeg;
  else a.commandedBankDeg = plannedBank;

  // ── Tangent Capture Check ─────────────────────────────────────────────────
  // Hand over only once on the line with the track along it and the wings level (Patrick, 4 Oct 09:21Z),
  // so ENT1 carries on with the same place, track and bank: no snap and no slide.
  const crossDist = Math.abs(cross);
  const altCaptured = Math.abs(alt - 3500) <= 100;
  const trackDeg = Number.isFinite(a.trackDeg) ? a.trackDeg : (a.headingDeg ?? 0);
  const trackAligned = Math.abs(wrapDeg180(trackDeg - ENT1_TRACK_DEG)) <= 1;
  const wingsLevel = Math.abs(a.bankDeg ?? 0) <= 3;
  // Anywhere up the line, past the gate too (a tailwind widens the turn); startJoin carries the aircraft
  // onto ENT1's own path from there, round the bend at the gate if need be.
  const onEntry = along >= 0;

  if (crossDist <= 100 && altCaptured && onEntry && trackAligned && wingsLevel) {
    const entRoute = resolveEntRoute(route);
    a.phase = 'entry';
    a.routeId = entRoute.id;
    a.command = null;
    a.intent = 'overhead';
    a.targetSpeedKt = 220;
    a.targetAltFt = 3500;
    a.targetBankDeg = 0;
    a.pitchDeg = 0;
    delete a._activeCommand;
    delete a._breakoutStage;
    delete a.desiredHeadingDeg;
    delete a.navPlan;
    delete a.waypointIndex;
    delete a._rejoinTurning;
    delete a.commandedBankDeg;

    // Onto the ENT1 rail where the aircraft is, closing any last few feet smoothly (spec item 13a).
    a.mode = 'RAIL';
    startJoin(a, entRoute, closestDistFt(entRoute, a, routeOptions), env, routeOptions);
  }
}
