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
 * Tangent Capture: When within lateral tolerance (<= 250 ft of ENT1 line near or prior to the 2 NM point)
 *          at 3,500 ft (±100 ft) and heading aligned within 45° of ENT1 track (~034°), smoothly capture
 *          ENT1 with zero coordinate teleportation (< 25 ft frame jump).
 * Rollout: Heading settles to ENT1 track (~034°), wings level (bank = 0°), airspeed 220 KIAS,
 *          altitude 3,500 ft, continuing up ENT1 into the circuit entry.
 */

import { wrapDeg180 } from '../../core/angles.js';
import { windTriangle } from '../../core/wind.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { posOnRoute, closestDistFt, routeLengthFt, DEFAULT_ROUTE_OPTIONS } from './route.js';

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

  let desiredTrack;
  if (crossDist > 6500) {
    // Beyond rollout circle: steer towards a lead aim point along ENT1 prior to or at 2 NM point
    const sAim = Math.min(REJOIN_ALONG_TRACK_FT, Math.max(3000, along));
    const aimX = ENTRY_MID_PT.x + sAim * UX_ENT1;
    const aimY = ENTRY_MID_PT.y + sAim * UY_ENT1;
    desiredTrack = (Math.atan2(aimX - (a.x ?? 0), aimY - (a.y ?? 0)) * 180 / Math.PI + 360) % 360;
  } else {
    // Within 6,500 ft: smoothly curve onto ENT1 track (33.7°) in a continuous left arc
    const uCurve = Math.max(0, Math.min(1, crossDist / 6500));
    const approachBrg = 125;
    const diff = wrapDeg180(approachBrg - ENT1_TRACK_DEG);
    desiredTrack = (ENT1_TRACK_DEG + diff * (uCurve ** 1.4) + 360) % 360;
  }

  // Wind crab compensation to hold track
  const wt = windTriangle(desiredTrack, Math.max(1, tasKt), windFromDeg, windKt);
  const targetHdg = wt.canHoldTrack ? wt.headingDeg : desiredTrack;
  const deltaHdg = wrapDeg180(targetHdg - (a.headingDeg ?? 0));

  return { targetHdg, deltaHdg, cross, along };
}

/**
 * Initiates 1.0s cubic smoothstep transition from physics mode onto route rail.
 *
 * @param {Object} a - Aircraft state
 * @param {Object} [route] - Target route
 * @param {Object} [routeOptions=DEFAULT_ROUTE_OPTIONS]
 */
export function enterBlending(a, route, routeOptions = DEFAULT_ROUTE_OPTIONS) {
  a.mode = 'BLENDING';
  a._blendTimer = 0;
  a._blendStart = {
    x: a.x ?? 0,
    y: a.y ?? 0,
    alt: a.alt ?? 3500,
    headingDeg: a.headingDeg ?? 0,
    iasKt: a.iasKt ?? a.kt ?? 140,
    bankDeg: a.bankDeg ?? 0,
  };

  if (!route) {
    a._blendTarget = { ...a._blendStart, distFt: a.distFt ?? 0 };
    return;
  }

  const closestDist = closestDistFt(route, a, routeOptions);
  const rLen = routeLengthFt(route, routeOptions);
  const lapOffset = (rLen > 0 && (a.distFt ?? 0) > 0) ? Math.floor(a.distFt / rLen) * rLen : 0;
  let targetDistFt = lapOffset + closestDist;

  if (rLen > 0 && targetDistFt < (a.distFt ?? 0) - rLen / 2) {
    targetDistFt += rLen;
  }
  const p = posOnRoute(route, targetDistFt, routeOptions);

  a._blendTarget = {
    x: p.x,
    y: p.y,
    alt: p.alt ?? a.alt ?? 3500,
    headingDeg: p.headingDeg ?? a.headingDeg ?? 0,
    iasKt: p.kt ?? a.iasKt ?? 220,
    distFt: targetDistFt,
    phase: p.phase ?? 'entry',
    tag: p.tag ?? route?.points?.[p.seg]?.tag,
  };
}

/**
 * Breakout Maneuver Controller:
 * Smooth continuous pilot maneuver (Patrick's Lead Pilot Guidance & SMM Chapter 16):
 *
 * Stage 1: Climb to 4,500 ft MSL while accelerating to 220 KIAS, vectoring to Breakout Point (-10974, -24252).
 *          Over the last 300 ft of climb (4,200 to 4,500 ft MSL), pitch smoothly decays to 0° (Pillar 8 climb arrest).
 * Stage 2: Descending Rejoin Arc from 4,500 ft to 3,500 ft MSL at 220 KIAS curving toward the ENT1 track
 *          to intercept 2 NM prior to circuit entry at (10256, -38141).
 *          Pitch smoothly decays to 0° over the last 300 ft (3,800 to 3,500 ft MSL).
 * Tangent Capture: When within lateral tolerance (<= 250 ft of ENT1 line near or prior to the 2 NM point)
 *          at 3,500 ft (±100 ft) and heading aligned within 45° of ENT1 track (~034°), smoothly capture
 *          ENT1 with zero coordinate teleportation (< 25 ft frame jump).
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

  // ── Tangent Capture Check ─────────────────────────────────────────────────
  // When within lateral tolerance (<= 250 ft of ENT1 line near or prior to 2 NM point)
  // at 3,500 ft MSL (±100 ft) and heading aligned within 45° of ENT1 track (~034°),
  // capture ENT1 and roll wings level with zero coordinate teleportation.
  const crossDist = Math.abs(cross);
  const altCaptured = Math.abs(alt - 3500) <= 100;
  const hdgAligned = Math.abs(wrapDeg180((a.headingDeg ?? 0) - ENT1_TRACK_DEG)) <= 45;
  const isNearOrPrior2NM = along <= REJOIN_ALONG_TRACK_FT + 500 && along >= 0;

  if (crossDist <= 250 && altCaptured && isNearOrPrior2NM && hdgAligned) {
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

    enterBlending(a, entRoute, routeOptions);
  }
}
