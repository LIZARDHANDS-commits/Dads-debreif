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

// Standalone Three-Mode State Machine (RAIL / PHYSICS / BLENDING)
// Specifications: specs/SPEC-traffic.md §1.5, §2, Hard Invariants (D406, D412, R34)
// Authoritative ground truth: docs/traffic-pattern-matrix.md

import { ktToFtps } from '../../core/units.js';
import { wrapDeg180 } from '../../core/angles.js';
import { bankDegFromG } from '../../core/flight-math.js';
import { windTriangle } from '../../core/wind.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { stepAircraft, calcInterceptHeading, calcCrossTrackError, CYMJ_DOWNWIND_HDG_DEG } from './flight-engine.js';
import { getNavPlan, makeBreakout, makeGoAround } from './nav-plans.js';
import { posOnRoute, closestDistFt, routeLengthFt, pointDistFt, isClosedRoute, DEFAULT_ROUTE_OPTIONS, computeBreakRollout, computeWindPerch, navSegs } from './route.js';
import { stepBreakout } from './breakout.js';
import { stepHighKey } from './high-key.js';
import { PFL_AIRFIELD } from './pfl-solver.js';
export { stepBreakout } from './breakout.js';
export { stepHighKey } from './high-key.js';

/** Duration of the smooth transition from physics back to rail (seconds). */
export const BLEND_DURATION_SEC = 1.0;

/** Set of pilot commands that require physics guidance mode. */
export const PHYSICS_COMMANDS = Object.freeze(new Set([
  'breakout',
  'go_around',
  'pfl_current',
  'engine_fail',
  'climb_high_key',
  'climb_low_key',
  'closed_pattern',
]));

/**
 * Normalizes an angle into [0, 360) degrees.
 * @param {number} deg
 * @returns {number}
 */
function wrapDeg360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Resolves or looks up the navigation plan corresponding to an aircraft and route.
 * @param {Object} a
 * @param {Object} [route]
 * @returns {Object|null} NavPlan
 */
export function resolveNavPlan(a, route) {
  if (a?.navPlan) return a.navPlan;
  if (a?.navPlanId) {
    const plan = getNavPlan(a.navPlanId);
    if (plan) return plan;
  }
  const routeId = route?.id || a?.routeId;
  if (routeId) {
    if (routeId === 'PAT1' || routeId === 'PAT_INNER') return getNavPlan('PAT_INNER');
    if (routeId === 'PAT_SI') return getNavPlan('PAT_SI');
    if (routeId === 'ENT1' || routeId === 'ENT_OHB') return getNavPlan('ENT_OHB');
    if (routeId === 'ENT2' || routeId === 'ENT_SI') return getNavPlan('ENT_SI');
    if (routeId === 'PFL' || routeId === 'PFL_HIGH_KEY') return getNavPlan('PFL_HIGH_KEY');
    if (routeId === 'TAKEOFF') return getNavPlan('TAKEOFF');
    const plan = getNavPlan(routeId);
    if (plan) return plan;
  }
  return getNavPlan('PAT_INNER');
}

/**
 * Evaluates whether a waypoint triggers a specific maneuver or physics phase based on its tag, label, or mode.
 * @param {Object} [wp] - Waypoint or route point
 * @returns {{ trigger: string | null, phase?: string, targetBankDeg?: number }}
 */
export function evaluateWaypointTrigger(wp) {
  if (!wp) return { trigger: null };
  if (wp.tag === 'break' || (/break/i.test(wp.label || '') && !/rollout|exit/i.test(wp.label || ''))) {
    return { trigger: 'break', phase: 'break', targetBankDeg: -60 };
  }
  if (wp.tag === 'perch' || /perch/i.test(wp.label || '')) {
    return { trigger: 'final_turn', phase: 'final_turn', targetBankDeg: -35 };
  }
  if (wp.mode === 'physics') {
    return { trigger: 'physics', phase: wp.phase };
  }
  return { trigger: null };
}

/**
 * Configures the navigation plan and target state when transitioning into PHYSICS mode.
 * @param {Object} a - Aircraft state
 * @param {Object} [route] - Route definition
 * @param {Object} [env] - Wind environment
 * @param {Object} [routeOptions] - Route options
 */
function setupPhysicsPlan(a, route = null, env = null, routeOptions = DEFAULT_ROUTE_OPTIONS) {
  if (a.command === 'breakout' || a.phase === 'breakout') {
    a.phase = 'breakout';
    a._activeCommand = 'breakout';
    a.targetAltFt = 4500;
    a.targetSpeedKt = 220;
    a.navPlan = {
      id: 'BREAKOUT',
      model: 'KIN',
      loop: false,
      waypoints: [],
    };
    a.waypointIndex = 0;
    return;
  }

  if (a.command === 'closed_pattern' || a.phase === 'closed_pattern' || a.closedPattern) {
    const bank = a.closedPatternBankDeg || 50;
    a._closedPhase = a._closedPhase || 1;
    a.phase = 'closed_pattern';
    a._activeCommand = a.command || 'closed_pattern';
    a.targetAltFt = 3500;
    a.targetSpeedKt = 140;
    a.targetBankDeg = -bank;
    a.pitchDeg = a.closedPatternPitchDeg || 10;
    a.navPlan = {
      id: 'CLOSED_PATTERN',
      model: 'KIN',
      loop: false,
      waypoints: [],
    };
    a.waypointIndex = 0;
    return;
  }

  if (a.command === 'go_around') {
    a.navPlan = makeGoAround({
      x: a.x ?? 0,
      y: a.y ?? 0,
      alt: a.alt ?? 1892,
      iasKt: a.iasKt ?? 100,
    });
    a.waypointIndex = 0;
    a.phase = 'go_around';
    a._activeCommand = 'go_around';
    return;
  }

  if (a.command === 'climb_high_key') {
    a.phase = 'climb_high_key';
    a._activeCommand = 'climb_high_key';
    a.model = 'KIN';
    a.targetAltFt = 5000;
    a.targetSpeedKt = 140;
    a.engineFailed = false;
    a.navPlan = {
      id: 'HIGH_KEY',
      pattern: 'PFL',
      model: 'KIN',
      waypoints: [],
    };
    a.waypointIndex = 0;
    return;
  }

  if (
    a.command === 'pfl_current' ||
    a.command === 'engine_fail' ||
    a.command === 'climb_low_key'
  ) {
    a.navPlan = getNavPlan('PFL_HIGH_KEY');
    a.waypointIndex = (a.command === 'climb_low_key') ? 1 : 0;
    a.engineFailed = (a.command === 'pfl_current' || a.command === 'engine_fail');
    a.model = 'NRG';
    a.phase = (a.command === 'climb_low_key') ? 'low_key' : 'high_key';
    const targetWp = a.navPlan.waypoints[a.waypointIndex];
    a.targetAltFt = targetWp.alt;
    a.targetSpeedKt = targetWp.kias;
    a._legStart = { x: a.x ?? 0, y: a.y ?? 0 };
    a._activeCommand = a.command;
    return;
  }
  // Waypoint-based triggers (Break at Point 9, Perch at Point 11)
  const curWp = a.navPlan?.waypoints?.[a.waypointIndex] ?? route?.points?.[a.waypointIndex];
  const wpTrigger = evaluateWaypointTrigger(curWp);
  const isBreak = a.phase === 'break' || wpTrigger.trigger === 'break' || curWp?.tag === 'break' || /break/i.test(curWp?.label || '') || a.waypointIndex === 9 || a.waypointIndex === 10;
  const isFinalTurn = a.phase === 'final_turn' || wpTrigger.trigger === 'final_turn' || curWp?.tag === 'perch' || /perch/i.test(curWp?.label || '') || a.waypointIndex === 11 || a.waypointIndex === 12;

  if (isBreak) {
    a.navPlan = getNavPlan('PAT_INNER');
    const exitIdx = a.navPlan?.waypoints?.findIndex((w) => w.tag === 'break_rollout' || /break\s*(rollout|exit)/i.test(w.label));
    a.waypointIndex = exitIdx >= 0 ? exitIdx : 10;
    a.phase = 'break';
    a.turnAccumDeg = 0;
    a.targetBankDeg = -60;
    return;
  }

  if (isFinalTurn) {
    a.navPlan = getNavPlan('PAT_INNER');
    const winIdx = a.navPlan?.waypoints?.findIndex((w) => w.tag === 'window' || /window/i.test(w.label));
    a.waypointIndex = winIdx >= 0 ? winIdx : 12;
    a.phase = 'final_turn';
    a.turnAccumDeg = 0;
    a.targetBankDeg = -35;
    return;
  }

  if (!a.navPlan) {
    a.navPlan = getNavPlan('PAT_INNER');
  }
}

/**
 * Closed Pattern Maneuver Controller:
 * Smooth continuous pilot maneuver (Patrick's Lead Pilot Guidance):
 * 1. Climbing turn at 140 KIAS at commanded bank angle (default 50° left).
 * 2. Over 3,200 to 3,500 ft MSL (last 300 ft of climb), pitch smoothly decays towards 0° (arresting climb).
 * 3. Bank modulates smoothly (up to 90° if needed in upper 300 ft) to dump vertical lift
 *    and draw the velocity vector smoothly towards the wind-adjusted perch point on the wind-killed heading.
 * 4. As track aligns with that wind-killed perch bearing at 3,500 ft MSL, bank smoothly rolls wings level (0°).
 * 5. Straight downwind tracking at 140 kt towards perch seamlessly captures the downwind rail (zero teleportation).
 *
 * @param {Object} a - Aircraft state object
 * @param {Object} [route] - Active route
 * @param {Object} [env] - Wind environment
 * @param {number} [stepDt=0.05] - Time step in seconds
 * @param {Object} [routeOptions=DEFAULT_ROUTE_OPTIONS] - Route options
 */
export function stepClosedPattern(a, route = null, env = null, stepDt = 0.05, routeOptions = DEFAULT_ROUTE_OPTIONS) {
  if (!a || (a.phase !== 'closed_pattern' && a.command !== 'closed_pattern')) return;

  const patRoute = route || resolveNavPlan(a, route) || getNavPlan('PAT_INNER');
  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const tasKt = iasToTasKt(a.iasKt || 140, a.alt || 3500);

  a.targetAltFt = 3500;
  a.targetSpeedKt = 140;

  // Compute wind-adjusted perch point
  const perch = computeWindPerch(patRoute, windFromDeg, windKt, routeOptions) || { x: 7146, y: -10275 };
  const dx = perch.x - (a.x ?? 0);
  const dy = perch.y - (a.y ?? 0);
  const bearingToPerch = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;

  // Wind-killed heading to track directly to perch
  const wt = windTriangle(bearingToPerch, Math.max(1, tasKt), windFromDeg, windKt);
  const targetHdg = wt.canHoldTrack ? wt.headingDeg : bearingToPerch;
  a.desiredHeadingDeg = targetHdg;

  const deltaHdg = wrapDeg180(targetHdg - (a.headingDeg ?? 0));
  const alt = a.alt ?? 2400;
  const climbPitch = a.closedPatternPitchDeg || 10;
  const nominalBank = a.closedPatternBankDeg || 50;

  // Continuous pitch decay in last 300 ft (3,200 to 3,500 ft MSL)
  if (alt >= 3200) {
    a.pitchDeg = Math.max(0, climbPitch * (3500 - alt) / 300);
  } else {
    a.pitchDeg = climbPitch;
  }

  // Continuous bank modulation:
  // Closed pattern at CYMJ is a left turn (decreasing heading).
  // Approaching target heading (deltaHdg within 25°), roll wings level smoothly.
  if (Math.abs(deltaHdg) <= 2.5) {
    a.targetBankDeg = 0;
  } else if (Math.abs(deltaHdg) < 25) {
    a.targetBankDeg = Math.max(-nominalBank, Math.min(nominalBank, deltaHdg * 1.8));
  } else {
    const isSlice = alt >= 3200 && deltaHdg < -10;
    const activeBank = isSlice ? Math.min(90, nominalBank + 20) : nominalBank;
    a.targetBankDeg = -activeBank;
  }

  // Downwind Rail Intercept & Seamless Capture
  const wingsLevel = Math.abs(a.bankDeg ?? 0) <= 5.0;
  const altCaptured = Math.abs(alt - 3500) <= 100;
  const hdgAligned = Math.abs(deltaHdg) <= 20.0;

  if (wingsLevel && altCaptured && hdgAligned) {
    const segs = navSegs(patRoute, routeOptions);
    const dwSegs = segs.filter((s) => s.a.phase === 'downwind' || s.a.src === 10);
    const dwSeg = dwSegs.length > 0
      ? {
          a: dwSegs[0].a,
          b: dwSegs[dwSegs.length - 1].b,
          len: Math.hypot(dwSegs[dwSegs.length - 1].b.x - dwSegs[0].a.x, dwSegs[dwSegs.length - 1].b.y - dwSegs[0].a.y),
        }
      : (segs.find((s) => s.a.src === 10) || segs.find((s) => s.a.phase === 'downwind') || segs[0]);
    const p10Dist = pointDistFt(patRoute, 10, routeOptions);
    const p11Dist = pointDistFt(patRoute, 11, routeOptions);

    if (dwSeg) {
      const distToPerchStart = Math.hypot(dwSeg.b.x - (a.x ?? 0), dwSeg.b.y - (a.y ?? 0));
      const railDist = p11Dist - distToPerchStart;
      const railPos = posOnRoute(patRoute, railDist, routeOptions);
      const distToRail = Math.hypot(railPos.x - (a.x ?? 0), railPos.y - (a.y ?? 0));

      const isDownwindLeg = railDist >= p10Dist + 50 && railDist <= p11Dist + 100;
      if ((distToRail <= 40 && isDownwindLeg) || distToPerchStart < 600) {
        a.mode = 'RAIL';
        a.distFt = Math.max(p10Dist + 100, Math.min(p11Dist, railDist));
        a.phase = 'downwind';
        a.command = null;
        a.targetBankDeg = 0;
        a.pitchDeg = 0;
        delete a._activeCommand;
        delete a._closedPhase;
        delete a._closedTarget;
        delete a._phase2Timer;
        delete a.desiredHeadingDeg;
      }
    }
  }
}

/**
 * Breakout Maneuver Controller:
 * Smooth continuous pilot maneuver (Patrick's Lead Pilot Guidance & SMM Chapter 16):
 * 1. Accelerates and climbs to 220 KIAS and 4,500 ft MSL while vectoring toward Breakout Point (-10974, -24252).
 *    In the last 300 ft of climb (4,200 to 4,500 ft MSL), pitch smoothly decays to 0° (Pillar 8 climb arrest).
 * 2. Continuous Descending Rejoin Arc: From Breakout Point, enters a smooth descending left arc (4,500 ft -> 3,500 ft at 220 KIAS)
 *    curving toward the active entry line (Entry 1 / ENT1, 2 NM prior to downwind).


/**
 * Evaluates whether an in-flight physics maneuver is complete and ready to blend back to rail.
 * @param {Object} a - Aircraft state
 * @param {Object} [navPlan] - Navigation plan
 * @returns {boolean}
 */
function isManeuverComplete(a, navPlan) {
  if (!a) return false;
  if (a.landed || a.active === false) return false;

  // Active physics phases mean the maneuver is still in progress
  if (a.phase === 'break' || a.phase === 'break_turn' || a.phase === 'final_turn') {
    return false;
  }

  // Active special maneuvers must NEVER be hijacked by generic circuit phase names:
  // 1. High Key completion: continuous controller stepHighKey handles transition to PFL
  if (a.command === 'climb_high_key' || a.phase === 'climb_high_key' || a._highKeyPhase !== undefined || navPlan?.id === 'HIGH_KEY') {
    return false;
  }

  // 2. Breakout completion: continuous controller stepBreakout handles rail capture directly
  if (a.command === 'breakout' || a.phase === 'breakout' || navPlan?.id === 'BREAKOUT') {
    return false;
  }

  // 3. Closed Pattern completion: continuous controller stepClosedPattern handles rail capture directly
  if (a.command === 'closed_pattern' || a.phase === 'closed_pattern' || navPlan?.id === 'CLOSED_PATTERN') {
    return false;
  }

  // 4. Break turn completion:
  if (a.phase === 'inner_downwind' || a.phase === 'downwind') {
    return true;
  }

  // 5. Final turn completion:
  if (a.phase === 'final' || a.phase === 'final_approach') {
    return true;
  }

  // 4. Go-around completion:
  if (a.command === 'go_around' || navPlan?.id === 'GO_AROUND') {
    if (a.phase === 'crosswind' || (a.waypointIndex !== undefined && a.waypointIndex >= 3)) {
      return true;
    }
    return false;
  }

  // 5. Closed pattern completion:
  if (a.command === 'closed_pattern' || a.phase === 'closed_pattern' || navPlan?.id === 'CLOSED_PATTERN') {
    const wingsLevel = Math.abs(a.bankDeg ?? 0) <= 5.0;
    const altCaptured = Math.abs((a.alt ?? 0) - 3500) <= 100;
    const hdgAligned = Math.abs(wrapDeg180((a.headingDeg ?? 0) - CYMJ_DOWNWIND_HDG_DEG)) <= 25;
    const perch = computeWindPerch(null, 360, 0) || { x: 7146, y: -10275 };
    const distToPerch = Math.hypot(perch.x - (a.x ?? 0), perch.y - (a.y ?? 0));
    if (wingsLevel && altCaptured && hdgAligned && distToPerch <= 1500) {
      a.phase = 'downwind';
      return true;
    }
    return false;
  }

  // 5. Active emergency glide commands continue in physics:
  if (a.command === 'pfl_current' || a.command === 'engine_fail') {
    return false;
  }

  // Guard climb_high_key and climb_low_key until target waypoint is reached:
  if (a.command === 'climb_high_key' && !a.engineFailed && (a.waypointIndex ?? 0) === 0) {
    return false;
  }
  if (a.command === 'climb_low_key' && !a.engineFailed && (a.waypointIndex ?? 0) <= 1) {
    return false;
  }

  // 6. Waypoint mode transition in general:
  const wps = navPlan?.waypoints;
  if (wps && a.waypointIndex !== undefined && a.waypointIndex < wps.length) {
    const currentWp = wps[a.waypointIndex];
    if (currentWp && currentWp.mode === 'rails') {
      return true;
    }
  }

  // 6. Non-looping plan reached end
  if (navPlan && !navPlan.loop && wps && a.waypointIndex !== undefined && a.waypointIndex >= wps.length - 1) {
    if (a.phase !== 'pfl_final' && a.phase !== 'landing') {
      return true;
    }
  }

  return false;
}

/**
 * Initializes the aircraft's mode property to 'RAIL' if not set.
 * @param {Object} a - Aircraft state
 */
export function initMode(a) {
  if (!a) return;
  if (!a.mode) {
    a.mode = 'RAIL';
  }
}

/**
 * Determines whether the aircraft should transition from RAIL mode to PHYSICS mode.
 * Triggers:
 * 1. Active pilot command ('breakout', 'go_around', 'pfl_current', 'engine_fail', etc.)
 * 2. Waypoint reached with mode === 'physics' in the nav plan (Break at Point 9, Perch at Point 11)
 *
 * @param {Object} a - Aircraft state
 * @param {Object} [route] - Route definition
 * @param {Object} [routeOptions] - Route calculation options
 * @returns {boolean}
 */
export function shouldEnterPhysics(a, route, routeOptions = DEFAULT_ROUTE_OPTIONS) {
  if (!a || a.pflRail) return false;

  // Active pilot command always triggers physics
  if (a.command && PHYSICS_COMMANDS.has(a.command)) {
    return true;
  }

  // Already in physics mode
  if (a.mode === 'PHYSICS') {
    return true;
  }

  // In blending mode without command, keep blending
  if (a.mode === 'BLENDING') {
    return false;
  }

  // Waypoint mode check in nav plan
  const navPlan = resolveNavPlan(a, route);
  const wps = navPlan?.waypoints;
  if (wps && a.waypointIndex !== undefined && wps[a.waypointIndex]?.mode === 'physics') {
    return true;
  }

  // Position along route (+0.5 offset resolves exact point boundary ambiguity)
  if (route && a.distFt !== undefined) {
    const p = posOnRoute(route, a.distFt + 0.5, routeOptions);
    if (wps && p?.seg !== undefined && wps[p.seg]?.mode === 'physics') {
      return true;
    }
    if (route.points?.[p?.seg]?.mode === 'physics') {
      return true;
    }
  }

  // Active contingency maneuvers trigger physics
  if (a.phase === 'closed_pattern' || a.command === 'closed_pattern') {
    return true;
  }

  return false;
}

/**
 * Sets up BLENDING mode for a 1.0s transition from physics back to the nearest rail point.
 * @param {Object} a - Aircraft state
 * @param {Object} [route] - Route definition
 * @param {Object} [routeOptions] - Route calculation options
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

  let closestDist = closestDistFt(route, a, routeOptions);

  // Phase-aware guard against Initial leg ambiguity after final turn (both share heading 298°)
  if (a.phase === 'final' || a.phase === 'final_turn' || a.phase === 'short_final') {
    const pts = route?.points || route?.waypoints || [];
    let perchIdx = pts.findIndex((p) => p.tag === 'perch' || /perch/i.test(p.label || ''));
    if (perchIdx < 0 && pts.length > 11) perchIdx = 11;

    let windowIdx = pts.findIndex((p) => p.tag === 'window' || p.tag === 'final_turn_rollout' || /window/i.test(p.label || ''));
    if (windowIdx < 0 && pts.length > 12) windowIdx = 12;

    const minFinalDist = perchIdx >= 0 ? pointDistFt(route, perchIdx, routeOptions) : pointDistFt(route, 11, routeOptions);
    if (closestDist < minFinalDist) {
      // If closestDist snapped to Initial leg (seg 8, < minFinalDist), target Window rollout
      const rLen = routeLengthFt(route, routeOptions);
      const wDist = windowIdx >= 0 ? pointDistFt(route, windowIdx, routeOptions) : pointDistFt(route, 12, routeOptions);
      closestDist = Math.min(rLen, wDist + 3180);
    }
  }

  // Phase-aware guard for downwind / closed pattern: ensure target distance is on downwind leg
  if (a.phase === 'downwind' || a.phase === 'inner_downwind' || a.phase === 'closed_pattern') {
    const pts = route?.points || route?.waypoints || [];
    let p10Idx = pts.findIndex((p) => p.tag === 'break_exit' || /break\s*exit/i.test(p.label || ''));
    if (p10Idx < 0 && pts.length > 10) p10Idx = 10;
    const minDwDist = p10Idx >= 0 ? pointDistFt(route, p10Idx, routeOptions) : 0;
    if (closestDist < minDwDist) {
      closestDist = minDwDist;
    }
  }

  const rLen = routeLengthFt(route, routeOptions);
  const isClosed = route ? isClosedRoute(route) : false;
  const lapOffset = (isClosed && rLen > 0 && (a.distFt ?? 0) > 0) ? Math.floor(a.distFt / rLen) * rLen : 0;
  let targetDistFt = isClosed ? (lapOffset + closestDist) : closestDist;

  // If blend would snap distFt backward by more than half the route,
  // add a lap to maintain forward progress toward route end
  if (isClosed && rLen > 0 && targetDistFt < (a.distFt ?? 0) - rLen / 2) {
    targetDistFt += rLen;
  }
  const p = posOnRoute(route, targetDistFt, routeOptions);

  a._blendTarget = {
    x: p.x,
    y: p.y,
    alt: p.alt ?? a.alt ?? 3500,
    headingDeg: p.headingDeg ?? a.headingDeg ?? 0,
    iasKt: p.kt ?? a.iasKt ?? 140,
    distFt: targetDistFt,
    phase: p.phase ?? a.phase,
    tag: p.tag ?? route?.points?.[p.seg]?.tag,
  };
}

/**
 * Executes a single simulation step for an aircraft according to the Three-Mode State Machine:
 * - RAIL: Advances distance, derives coordinates from route, computes wind triangle.
 * - PHYSICS: Vector guidance and performance model via stepAircraft().
 * - BLENDING: 1.0s cubic smoothstep interpolation from physics exit back to nearest rail.
 *
 * @param {Object} a - Mutable aircraft state
 * @param {number} [dt=0.05] - Time step in seconds
 * @param {{ windFromDeg?: number, windKt?: number }} [wind] - Wind environment
 * @param {Object} [route] - Route definition
 * @param {Object} [routeOptions] - Route calculation options
 * @returns {Object} Updated aircraft state
 */
export function tickAircraft(a, dt = 0.05, wind = null, route = null, routeOptions = DEFAULT_ROUTE_OPTIONS) {
  if (!a || a.active === false || a.landed === true) return a;

  initMode(a);

  const stepDt = (Number.isFinite(dt) && dt > 0) ? dt : 0.05;
  const windFromDeg = wind?.windFromDeg ?? 360;
  const windKt = wind?.windKt ?? 0;
  const env = { windFromDeg, windKt };

  // ── PFL KINEMATIC RAIL MODE ──────────────────────────────────────────────
  if (a.mode === 'RAIL' && a.pflRail && a.pflRail.length > 0) {
    if (a.pflRail[0].cumDistFt === undefined) {
      let cumDist = 0;
      a.pflRail[0].cumDistFt = 0;
      for (let i = 1; i < a.pflRail.length; i++) {
        cumDist += Math.hypot(a.pflRail[i].x - a.pflRail[i - 1].x, a.pflRail[i].y - a.pflRail[i - 1].y);
        a.pflRail[i].cumDistFt = cumDist;
      }
    }

    const gsKt = a.gsKt ?? a.iasKt ?? 120;
    const gsFtps = ktToFtps(gsKt);
    a.distFt = (a.distFt ?? 0) + gsFtps * stepDt;

    let idx = a.pflRailIndex ?? 0;
    while (idx < a.pflRail.length - 1 && (a.pflRail[idx + 1].cumDistFt ?? 0) <= a.distFt) {
      idx++;
    }
    a.pflRailIndex = idx;
    const wp = a.pflRail[idx];

    a.x = wp.x;
    a.y = wp.y;
    a.alt = wp.alt;
    a.iasKt = wp.kias ?? wp.kt ?? 120;
    a.kt = a.iasKt;
    a.headingDeg = wp.headingDeg;
    a.bankDeg = wp.bankDeg ?? 0;
    a.g = wp.g ?? 1.0;
    a.phase = wp.phase;
    a.config = wp.config;
    if (wp.tag) {
      a.tag = wp.tag;
    }

    const tasKt = (windKt > 0) ? iasToTasKt(a.iasKt, a.alt) : a.iasKt;
    const wt = windTriangle(a.headingDeg, Math.max(1, tasKt), windFromDeg, windKt);
    a.gsKt = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10;
    a.groundSpeedKt = a.gsKt;
    a.crabDeg = wt.crabDeg;
    a.trackDeg = wt.canHoldTrack ? wrapDeg360(a.headingDeg - wt.crabDeg) : a.headingDeg;

    // Terrain contact and landing check
    const CYMJ_THRESH_X = PFL_AIRFIELD.thresholdX;
    const CYMJ_THRESH_Y = PFL_AIRFIELD.thresholdY;

    if (a.alt <= 1892 || a.pflRailIndex >= a.pflRail.length - 1) {
      const distToThresh = Math.hypot(a.x - CYMJ_THRESH_X, a.y - CYMJ_THRESH_Y);
      if (a.pflRail.classification === 'crash_short' || distToThresh > 3000) {
        a.alt = 1892;
        a.status = 'crashed';
        a.landed = true;
        a.active = false;
      } else {
        a.alt = 1892;
        a.status = 'landed';
        a.landed = true;
        a.active = false;
      }
    }

    return a;
  }

  // ── BLENDING MODE ────────────────────────────────────────────────────────
  if (a.mode === 'BLENDING') {
    // Interruption: command issued during BLENDING cancels blend immediately
    if (a.command && PHYSICS_COMMANDS.has(a.command)) {
      delete a._blendStart;
      delete a._blendTarget;
      delete a._blendTimer;
      a.mode = 'PHYSICS';
      setupPhysicsPlan(a, route, env, routeOptions);
      if (a.phase === 'closed_pattern' || a.command === 'closed_pattern') {
        stepClosedPattern(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL') return a;
      }
      if (a.phase === 'climb_high_key' || a.command === 'climb_high_key') {
        stepHighKey(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL' || a.mode === 'BLENDING') return a;
      }
      if (a.phase === 'breakout' || a.command === 'breakout') {
        stepBreakout(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL' || a.mode === 'BLENDING') return a;
      }
      stepAircraft(a, a.navPlan, env, stepDt);
      if (a.phase === 'closed_pattern' || a.command === 'closed_pattern') {
        stepClosedPattern(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL') return a;
      }
      if (a.phase === 'climb_high_key' || a.command === 'climb_high_key') {
        stepHighKey(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL' || a.mode === 'BLENDING') return a;
      }
      if (a.phase === 'breakout' || a.command === 'breakout') {
        stepBreakout(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL' || a.mode === 'BLENDING') return a;
      }
      if (isManeuverComplete(a, a.navPlan)) {
        if (a.command === 'breakout' || a.command === 'go_around' || a.command === 'closed_pattern' || a.command === 'climb_high_key') {
          a.command = null;
          delete a._activeCommand;
        }
        if (!a.landed && a.active !== false) {
          enterBlending(a, route, routeOptions);
        }
      }
      return a;
    }

    a._blendTimer = (a._blendTimer ?? 0) + stepDt;
    const u = Math.min(1.0, a._blendTimer / BLEND_DURATION_SEC);
    const s = 3 * u * u - 2 * u * u * u; // cubic smoothstep

    const start = a._blendStart;
    const target = a._blendTarget;

    if (start && target) {
      a.x = start.x + (target.x - start.x) * s;
      a.y = start.y + (target.y - start.y) * s;
      a.alt = start.alt + (target.alt - start.alt) * s;

      // Shortest angular turn interpolation across 0°/360°
      const diffHdg = wrapDeg180(target.headingDeg - start.headingDeg);
      a.headingDeg = wrapDeg360(start.headingDeg + diffHdg * s);

      a.iasKt = start.iasKt + (target.iasKt - start.iasKt) * s;
      a.kt = a.iasKt;

      const startBank = start.bankDeg ?? 0;
      a.bankDeg = startBank * (1 - s);

      const tasKt = (windKt > 0) ? iasToTasKt(a.iasKt, a.alt) : a.iasKt;
      const wt = windTriangle(a.headingDeg, Math.max(1, tasKt), windFromDeg, windKt);
      a.gsKt = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10;
      a.groundSpeedKt = a.gsKt;
      a.crabDeg = wt.crabDeg;
      a.trackDeg = wt.canHoldTrack ? wrapDeg360(a.headingDeg - wt.crabDeg) : a.headingDeg;
    }

    if (u >= 1.0) {
      if (target) {
        a.distFt = target.distFt;
        if (target.phase) a.phase = target.phase;
        if (target.tag) a.tag = target.tag;
      }
      delete a._blendStart;
      delete a._blendTarget;
      delete a._blendTimer;
      delete a.waypointIndex;
      a.mode = 'RAIL';
    }

    return a;
  }

  // ── PHYSICS MODE ─────────────────────────────────────────────────────────
  if (a.mode === 'PHYSICS') {
    if (a.command && PHYSICS_COMMANDS.has(a.command)) {
      if (a._activeCommand !== a.command) {
        setupPhysicsPlan(a, route, env, routeOptions);
        a._activeCommand = a.command;
      }
    } else {
      const curWp = a.navPlan?.waypoints?.[a.waypointIndex] ?? route?.points?.[a.waypointIndex];
      const isBreakWp = a.tag === 'break' || curWp?.tag === 'break' || /break/i.test(curWp?.label || '') || a.waypointIndex === 9;
      const isPerchWp = a.tag === 'perch' || curWp?.tag === 'perch' || /perch/i.test(curWp?.label || '') || a.waypointIndex === 11;
      if (!a.navPlan || (a.phase === 'break' && (isBreakWp || !a.targetBankDeg)) || (a.phase === 'final_turn' && (isPerchWp || !a.targetBankDeg)) || (a.phase === 'closed_pattern' && !a._closedPhase)) {
        setupPhysicsPlan(a, route, env, routeOptions);
      }
    }

    if (a.phase === 'closed_pattern' || a.command === 'closed_pattern') {
      stepClosedPattern(a, route, env, stepDt, routeOptions);
      if (a.mode === 'RAIL') {
        return a;
      }
    }
    if (a.phase === 'climb_high_key' || a.command === 'climb_high_key') {
      stepHighKey(a, route, env, stepDt, routeOptions);
      if (a.mode === 'RAIL' || a.mode === 'BLENDING') {
        return a;
      }
    }
    if (a.phase === 'breakout' || a.command === 'breakout') {
      stepBreakout(a, route, env, stepDt, routeOptions);
      if (a.mode === 'RAIL' || a.mode === 'BLENDING') {
        return a;
      }
    }

    stepAircraft(a, a.navPlan, env, stepDt);

    if (isManeuverComplete(a, a.navPlan)) {
      if (a.command === 'breakout' || a.command === 'go_around' || a.command === 'closed_pattern' || a.command === 'climb_high_key') {
        a.command = null;
        delete a._activeCommand;
      }
      if (!a.landed && a.active !== false) {
        enterBlending(a, route, routeOptions);
      }
    }

    return a;
  }

  // ── RAIL MODE ────────────────────────────────────────────────────────────
  if (a.mode === 'RAIL') {
    // Check if aircraft should enter physics before stepping rail
    if (shouldEnterPhysics(a, route, routeOptions)) {
      a.mode = 'PHYSICS';
      setupPhysicsPlan(a, route, env, routeOptions);
      if (a.phase === 'closed_pattern' || a.command === 'closed_pattern') {
        stepClosedPattern(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL') return a;
      }
      if (a.phase === 'climb_high_key' || a.command === 'climb_high_key') {
        stepHighKey(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL' || a.mode === 'BLENDING') return a;
      }
      if (a.phase === 'breakout' || a.command === 'breakout') {
        stepBreakout(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL' || a.mode === 'BLENDING') return a;
      }
      stepAircraft(a, a.navPlan, env, stepDt);
      if (a.phase === 'closed_pattern' || a.command === 'closed_pattern') {
        stepClosedPattern(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL') return a;
      }
      if (a.phase === 'climb_high_key' || a.command === 'climb_high_key') {
        stepHighKey(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL' || a.mode === 'BLENDING') return a;
      }
      if (a.phase === 'breakout' || a.command === 'breakout') {
        stepBreakout(a, route, env, stepDt, routeOptions);
        if (a.mode === 'RAIL' || a.mode === 'BLENDING') return a;
      }
      if (isManeuverComplete(a, a.navPlan)) {
        if (a.command === 'breakout' || a.command === 'go_around' || a.command === 'closed_pattern' || a.command === 'climb_high_key') {
          a.command = null;
          delete a._activeCommand;
        }
        if (!a.landed && a.active !== false) {
          enterBlending(a, route, routeOptions);
        }
      }
      return a;
    }

    if (!route) return a;

    // Advance ground distance along route
    const currentGsKt = a.gsKt ?? a.iasKt ?? a.kt ?? 140;
    const gsFtps = ktToFtps(currentGsKt);
    a.distFt = (a.distFt ?? 0) + gsFtps * stepDt;

    // Derive position and parameters from route
    const p = posOnRoute(route, a.distFt, routeOptions);
    a.x = p.x;
    a.y = p.y;
    a.alt = p.alt ?? a.fallbackAlt ?? a.alt ?? 3500;
    a.iasKt = p.kt ?? a.fallbackKt ?? a.iasKt ?? 140;
    a.kt = a.iasKt;
    if (p.phase) {
      a.phase = p.phase;
    }
    if (p.tag) {
      a.tag = p.tag;
    } else if (route?.points?.[p.seg]?.tag) {
      a.tag = route.points[p.seg].tag;
    }

    // Calculate wind triangle for ground speed and crab angle
    const tasKt = (windKt > 0) ? iasToTasKt(a.iasKt, a.alt) : a.iasKt;
    const trackDeg = p.headingDeg;
    const wt = windTriangle(trackDeg, Math.max(1, tasKt), windFromDeg, windKt);
    a.gsKt = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10;
    a.groundSpeedKt = a.gsKt;
    a.crabDeg = wt.crabDeg;
    a.headingDeg = wt.headingDeg;
    a.trackDeg = trackDeg;

    // Bank angle in rail mode: turns bank according to G, straight legs stay wings level
    let targetBankDeg = 0;
    const isStraightLeg = p.phase === 'initial' || p.phase === 'downwind' || p.phase === 'final' || p.phase === 'landing';
    if (!isStraightLeg && p.g && p.g > 1) {
      targetBankDeg = bankDegFromG(p.g);
    }
    const maxRollDelta = 45 * stepDt;
    const bankDelta = Math.max(-maxRollDelta, Math.min(maxRollDelta, targetBankDeg - (a.bankDeg ?? 0)));
    a.bankDeg = (a.bankDeg ?? 0) + bankDelta;

    // Check if waypoint reached at new position triggers transition to PHYSICS
    if (shouldEnterPhysics(a, route, routeOptions)) {
      a.mode = 'PHYSICS';
      setupPhysicsPlan(a, route, env, routeOptions);
    }

    return a;
  }

  return a;
}
