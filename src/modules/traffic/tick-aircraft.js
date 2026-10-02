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
import { stepAircraft } from './flight-engine.js';
import { getNavPlan, makeBreakout, makeGoAround } from './nav-plans.js';
import { posOnRoute, closestDistFt, routeLengthFt, pointDistFt, DEFAULT_ROUTE_OPTIONS, computeBreakRollout } from './route.js';

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
 * Configures the navigation plan and target state when transitioning into PHYSICS mode.
 * @param {Object} a - Aircraft state
 * @param {Object} [route] - Route definition
 * @param {Object} [env] - Wind environment
 * @param {Object} [routeOptions] - Route options
 */
function setupPhysicsPlan(a, route = null, env = null, routeOptions = DEFAULT_ROUTE_OPTIONS) {
  if (a.command === 'breakout') {
    a.navPlan = makeBreakout({
      x: a.x ?? 0,
      y: a.y ?? 0,
      alt: a.alt ?? 3500,
      headingDeg: a.headingDeg ?? 118,
      iasKt: a.iasKt ?? 140,
    });
    a.waypointIndex = 0;
    a.phase = 'breakout';
    a._activeCommand = 'breakout';
    a.targetAltFt = 4500;
    return;
  }

  if (a.command === 'closed_pattern' || a.phase === 'closed_pattern' || a.closedPattern) {
    const windFrom = env?.windFromDeg ?? 360;
    const windKt = env?.windKt ?? 0;
    const patRoute = route || resolveNavPlan(a, route) || getNavPlan('PAT_INNER');
    const breakRollout = computeBreakRollout(patRoute, windFrom, windKt, routeOptions) || {
      x: -2908,
      y: -4109,
      alt: 3500,
      headingDeg: 118,
    };
    a._closedTarget = {
      x: breakRollout.x,
      y: breakRollout.y,
      alt: 3500,
      headingDeg: breakRollout.headingDeg ?? 118,
    };
    a.navPlan = {
      id: 'CLOSED_PATTERN',
      model: 'KIN',
      loop: false,
      waypoints: [
        { x: a.x ?? 0, y: a.y ?? 0, alt: a.alt ?? 2000, kias: 140, phase: 'closed_pattern', mode: 'physics' },
        { x: breakRollout.x, y: breakRollout.y, alt: 3500, kias: 140, phase: 'closed_pattern', mode: 'physics' },
      ],
    };
    a.waypointIndex = 0;
    a.phase = 'closed_pattern';
    a._activeCommand = a.command || 'closed_pattern';
    a.targetAltFt = 3500;
    a.targetSpeedKt = 140;
    a.targetBankDeg = 45;
    a._legStart = { x: a.x ?? 0, y: a.y ?? 0 };
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

  if (
    a.command === 'pfl_current' ||
    a.command === 'engine_fail' ||
    a.command === 'climb_high_key' ||
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
  if (a.phase === 'break' || a.waypointIndex === 9 || a.waypointIndex === 10) {
    a.navPlan = getNavPlan('PAT_INNER');
    a.waypointIndex = 10;
    a.phase = 'break';
    a.turnAccumDeg = 0;
    a.targetBankDeg = -60;
    return;
  }

  if (a.phase === 'final_turn' || a.waypointIndex === 11 || a.waypointIndex === 12) {
    a.navPlan = getNavPlan('PAT_INNER');
    a.waypointIndex = 12;
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

  // 1. Break turn completion:
  if (a.phase === 'inner_downwind' || a.phase === 'downwind') {
    return true;
  }

  // 2. Final turn completion:
  if (a.phase === 'final' || a.phase === 'final_approach') {
    return true;
  }

  // 3. Breakout completion:
  if (a.command === 'breakout' || navPlan?.id === 'BREAKOUT') {
    if (a.phase === 'entry' || (a.waypointIndex !== undefined && a.waypointIndex >= 2)) {
      return true;
    }
    return false;
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
    const target = a._closedTarget || (navPlan?.waypoints ? navPlan.waypoints[navPlan.waypoints.length - 1] : null);
    if (target) {
      const dist = Math.hypot((a.x ?? 0) - target.x, (a.y ?? 0) - target.y);
      const altDiff = Math.abs((a.alt ?? 0) - (target.alt ?? 3500));
      const hdgDiff = Math.abs(wrapDeg180((a.headingDeg ?? 0) - (target.headingDeg ?? 118)));
      if (dist <= 600 && altDiff <= 150 && hdgDiff <= 30) {
        return true;
      }
    }
    return false;
  }

  // 5. Waypoint mode transition in general:
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
  if (!a) return false;

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

  // Position along route (+0.5 offset resolves exact point boundary ambiguity)
  if (route && a.distFt !== undefined) {
    const p = posOnRoute(route, a.distFt + 0.5, routeOptions);
    if (wps && p?.seg !== undefined && wps[p.seg]?.mode === 'physics') {
      return true;
    }
    if (route.points?.[p?.seg]?.mode === 'physics') {
      return true;
    }
    if (p?.phase === 'break' || p?.phase === 'final_turn') {
      return true;
    }
  }

  // Aircraft phase triggers
  if (a.phase === 'break' || a.phase === 'final_turn' || a.phase === 'closed_pattern') {
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
    const perchDist = pointDistFt(route, 11, routeOptions);
    if (closestDist < perchDist) {
      // If closestDist snapped to Initial leg (seg 8, < perchDist), target Window rollout
      const rLen = routeLengthFt(route, routeOptions);
      const wDist = pointDistFt(route, 12, routeOptions);
      closestDist = Math.min(rLen, wDist + 3180);
    }
  }

  const rLen = routeLengthFt(route, routeOptions);
  const lapOffset = (rLen > 0 && (a.distFt ?? 0) > 0) ? Math.floor(a.distFt / rLen) * rLen : 0;
  let targetDistFt = lapOffset + closestDist;

  // If blend would snap distFt backward by more than half the route,
  // add a lap to maintain forward progress toward route end
  if (rLen > 0 && targetDistFt < (a.distFt ?? 0) - rLen / 2) {
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

  // ── BLENDING MODE ────────────────────────────────────────────────────────
  if (a.mode === 'BLENDING') {
    // Interruption: command issued during BLENDING cancels blend immediately
    if (a.command && PHYSICS_COMMANDS.has(a.command)) {
      delete a._blendStart;
      delete a._blendTarget;
      delete a._blendTimer;
      a.mode = 'PHYSICS';
      setupPhysicsPlan(a, route, env, routeOptions);
      stepAircraft(a, a.navPlan, env, stepDt);
      if (isManeuverComplete(a, a.navPlan)) {
        if (a.command === 'breakout' || a.command === 'go_around' || a.command === 'closed_pattern') {
          a.command = null;
          delete a._activeCommand;
        }
        delete a._closedTarget;
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
    } else if (!a.navPlan || (a.phase === 'break' && (a.waypointIndex === 9 || !a.targetBankDeg)) || (a.phase === 'final_turn' && (a.waypointIndex === 11 || !a.targetBankDeg)) || (a.phase === 'closed_pattern' && !a._closedTarget)) {
      setupPhysicsPlan(a, route, env, routeOptions);
    }

    stepAircraft(a, a.navPlan, env, stepDt);

    if (isManeuverComplete(a, a.navPlan)) {
      if (a.command === 'breakout' || a.command === 'go_around' || a.command === 'closed_pattern') {
        a.command = null;
        delete a._activeCommand;
      }
      delete a._closedTarget;
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
      stepAircraft(a, a.navPlan, env, stepDt);
      if (isManeuverComplete(a, a.navPlan)) {
        if (a.command === 'breakout' || a.command === 'go_around' || a.command === 'closed_pattern') {
          a.command = null;
          delete a._activeCommand;
        }
        delete a._closedTarget;
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

    // Calculate wind triangle for ground speed and crab angle
    const tasKt = (windKt > 0) ? iasToTasKt(a.iasKt, a.alt) : a.iasKt;
    const trackDeg = p.headingDeg;
    const wt = windTriangle(trackDeg, Math.max(1, tasKt), windFromDeg, windKt);
    a.gsKt = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10;
    a.groundSpeedKt = a.gsKt;
    a.crabDeg = wt.crabDeg;
    a.headingDeg = wt.headingDeg;
    a.trackDeg = trackDeg;

    // Bank angle in rail mode
    let targetBankDeg = 0;
    if (p.g && p.g > 1) {
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
