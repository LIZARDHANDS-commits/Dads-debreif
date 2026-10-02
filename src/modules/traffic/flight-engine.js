// Unified 3D Vector Flight Engine for Traffic Sim (Milestone M1)
// Authoritative specifications: specs/SPEC-traffic.md §2, §3, §6, §8, §9
// Approved under D406, R34. Ground truth: docs/traffic-pattern-matrix.md
import { KT_TO_FTPS, FTPS_TO_KT, G_FTPS2, FT_PER_NM, ktToFtps, ftpsToKt } from '../../core/units.js';
import { degToRad, radToDeg, wrapDeg180, wrapPi } from '../../core/angles.js';
import { rollToward, turnRadiusFt } from '../../core/flight-math.js';
import { windTriangle } from '../../core/wind.js';
import {
  glideSinkFpm,
  excessThrustPerWeight,
  energyHeightFt,
  stallLimitG,
  iasToTasKt,
  tasToIasKt,
  flyZoomT6A,
  T6A_LIMITS,
} from '../../core/t6-performance.js';

// Physical & Airfield Constants (CYMJ Runway 29L)
export const CYMJ_FIELD_ELEV_FT = 1892;
export const CYMJ_THRESH_ELEV_FT = 1880;
export const CYMJ_THRESH_X = 3104;
export const CYMJ_THRESH_Y = -3194;
export const CYMJ_RWY_HDG_DEG = 298;
export const CYMJ_DOWNWIND_HDG_DEG = 118;
export const STALL_SPEED_KIAS = 86; // D158, D387
export const VFE_LIMIT_KIAS = 147;   // Gear and flap limit (SMM 4.6 para 9)
export const GLIDE_SLOPE_DEG = 3.0;
export const GLIDE_SLOPE_INTERCEPT_FT = 15417.5; // (2700 - 1892) / tan(3°)
export const SPEED_GATE_WINDOW_FT = 4558;        // 0.75 NM from threshold

/**
 * Calculates signed cross-track error in feet between a track line segment and a point.
 * Positive = aircraft is right of track; negative = left of track.
 *
 * @param {{x: number, y: number}} fromWp - Segment start waypoint
 * @param {{x: number, y: number}} toWp - Segment end waypoint
 * @param {{x: number, y: number}} point - Aircraft position
 * @returns {number} Cross-track error in feet
 */
export function calcCrossTrackError(fromWp, toWp, point) {
  if (!fromWp || !toWp || !point) return 0;
  const dx = point.x - fromWp.x;
  const dy = point.y - fromWp.y;
  const segLength = Math.hypot(toWp.x - fromWp.x, toWp.y - fromWp.y);
  if (segLength < 1e-6) return 0;
  // Track heading tau: clockwise from North (+y)
  const tau = Math.atan2(toWp.x - fromWp.x, toWp.y - fromWp.y);
  return dx * Math.cos(tau) - dy * Math.sin(tau);
}

/**
 * Calculates distance in feet along the track line segment from fromWp.
 *
 * @param {{x: number, y: number}} fromWp - Segment start waypoint
 * @param {{x: number, y: number}} toWp - Segment end waypoint
 * @param {{x: number, y: number}} point - Aircraft position
 * @returns {number} Along-track distance in feet
 */
export function calcAlongTrackDist(fromWp, toWp, point) {
  if (!fromWp || !toWp || !point) return 0;
  const dx = point.x - fromWp.x;
  const dy = point.y - fromWp.y;
  const segLength = Math.hypot(toWp.x - fromWp.x, toWp.y - fromWp.y);
  if (segLength < 1e-6) return 0;
  const tau = Math.atan2(toWp.x - fromWp.x, toWp.y - fromWp.y);
  return dx * Math.sin(tau) + dy * Math.cos(tau);
}

/**
 * Computes desired intercept heading combining track heading, cross-track intercept gain,
 * and wind crab angle.
 *
 * @param {{x: number, y: number}} fromWp
 * @param {{x: number, y: number}} toWp
 * @param {{x: number, y: number}} point
 * @param {number} tasKt
 * @param {{windFromDeg?: number, windKt?: number}} [env]
 * @param {{kGain?: number, maxInterceptDeg?: number}} [options]
 * @returns {number} Desired heading in degrees [0, 360)
 */
export function calcInterceptHeading(fromWp, toWp, point, tasKt, env, options = {}) {
  if (!fromWp || !toWp) return 0;
  const tauRad = Math.atan2(toWp.x - fromWp.x, toWp.y - fromWp.y);
  const trackDeg = ((radToDeg(tauRad) % 360) + 360) % 360;
  const xtrack = calcCrossTrackError(fromWp, toWp, point);

  // Cross-track intercept angle: theta_int = atan(K * xtrack)
  const kGain = options.kGain ?? 0.002;
  const maxInterceptDeg = options.maxInterceptDeg ?? 45;
  const thetaIntRad = Math.atan(kGain * xtrack);
  let thetaIntDeg = radToDeg(thetaIntRad);
  thetaIntDeg = Math.max(-maxInterceptDeg, Math.min(maxInterceptDeg, thetaIntDeg));

  // Wind crab to hold track
  let crabDeg = 0;
  if (env && (env.windKt !== undefined || env.windFromDeg !== undefined)) {
    const windFrom = env.windFromDeg ?? 360;
    const windSpeed = env.windKt ?? 0;
    const wt = windTriangle(trackDeg, Math.max(1, tasKt || 120), windFrom, windSpeed);
    crabDeg = wt.crabDeg;
  }

  return ((trackDeg - thetaIntDeg + crabDeg) % 360 + 360) % 360;
}

/**
 * Calculates lead-turn distance in feet along track before waypoint.
 * d_lead = R * tan(Δθ / 2)
 *
 * @param {number} vAirFtps - True airspeed in ft/s
 * @param {number} targetBankDeg - Turn bank angle in degrees
 * @param {number} turnAngleDeg - Track change angle in degrees
 * @returns {number} Lead distance in feet
 */
export function calcLeadTurnDist(vAirFtps, targetBankDeg, turnAngleDeg) {
  const bankRad = Math.abs(degToRad(targetBankDeg));
  if (bankRad < 0.01 || vAirFtps <= 0) return 0;
  const deltaThetaRad = Math.abs(degToRad(turnAngleDeg));
  if (deltaThetaRad <= 1e-4) return 0;
  const r = (vAirFtps * vAirFtps) / (G_FTPS2 * Math.tan(bankRad));
  return r * Math.tan(deltaThetaRad / 2);
}

/**
 * Accelerated stall bank limit: phi_max = arccos(1 / (V_ias / 86)^2).
 * Capped to 0° if V_ias <= 86 KIAS.
 *
 * @param {number} iasKt - Current indicated airspeed
 * @param {number} [stallKias=86] - 1 G clean stall speed
 * @returns {number} Maximum allowable bank angle in degrees
 */
export function calcStallBankLimit(iasKt, stallKias = STALL_SPEED_KIAS) {
  if (iasKt <= stallKias) return 0;
  const nStall = (iasKt / stallKias) ** 2;
  const cosBank = 1 / nStall;
  if (cosBank >= 1) return 0;
  return radToDeg(Math.acos(cosBank));
}

/**
 * Calculates target bank angle to steer toward desiredHeadingDeg, subject to accelerated
 * stall protection and roll rate limits.
 *
 * @param {Object} aircraft - Aircraft state object
 * @param {number} desiredHeadingDeg - Commanded heading in degrees
 * @param {number} [dt=0] - Timestep in seconds
 * @param {number} [maxRollRateDps=45] - Maximum roll rate in °/s
 * @returns {number} Target bank angle in degrees
 */
export function calcBankTarget(aircraft, desiredHeadingDeg, dt = 0, maxRollRateDps = 45) {
  const deltaHdg = wrapDeg180(desiredHeadingDeg - (aircraft.headingDeg ?? 0));
  const maxStallBank = calcStallBankLimit(aircraft.iasKt ?? 140, STALL_SPEED_KIAS);

  let targetBank = 0;
  if (aircraft.phase === 'closed_pattern') {
    const bankLimit = Math.abs(aircraft.targetBankDeg || 45);
    targetBank = Math.max(-bankLimit, Math.min(bankLimit, deltaHdg * 1.5));
    if (Math.abs(deltaHdg) < 0.5) targetBank = 0;
  } else if (aircraft.targetBankDeg && Math.abs(aircraft.targetBankDeg) > 0 && Math.abs(deltaHdg) > 3) {
    targetBank = Math.sign(deltaHdg) * Math.abs(aircraft.targetBankDeg);
  } else {
    // Proportional bank for fine track holding: ~1.5° bank per degree heading error
    const phase = aircraft.phase || '';
    const isDynamic =
      phase === 'break' ||
      phase === 'break_turn' ||
      phase === 'final_turn' ||
      phase === 'closed_pattern' ||
      phase === 'breakout' ||
      phase === 'go_around' ||
      phase.startsWith('pfl_');
    const maxFineBank = isDynamic ? 45 : 30;
    targetBank = Math.max(-maxFineBank, Math.min(maxFineBank, deltaHdg * 1.5));
    if (Math.abs(deltaHdg) < 0.5) targetBank = 0;
  }

  // Accelerated stall protection clamp
  const clampedTargetBank = Math.sign(targetBank) * Math.min(Math.abs(targetBank), maxStallBank);

  if (dt > 0) {
    const maxDeltaRad = degToRad(maxRollRateDps) * dt;
    const rollRes = rollToward(degToRad(aircraft.bankDeg ?? 0), degToRad(clampedTargetBank), maxDeltaRad);
    aircraft.bankDeg = radToDeg(rollRes.bank);
  }

  return clampedTargetBank;
}

/**
 * Break turn deceleration: V(u) = 220 * exp(-0.452 * u) over 180° turn (u in [0, 1]).
 *
 * @param {number} u - Normalized turn progress [0, 1]
 * @returns {number} Target airspeed in KIAS
 */
export function calcBreakDecelSpeed(u) {
  const clampedU = Math.max(0, Math.min(1, u));
  return 220 * Math.exp(-0.452 * clampedU);
}

/**
 * Final turn cubic descent: z(u) = 3500 - 800 * (3u^2 - 2u^3), with dz/du = 0 at u=0 and u=1.
 *
 * @param {number} u - Normalized turn progress [0, 1]
 * @returns {number} Target altitude in ft MSL
 */
export function calcCubicDescentAlt(u) {
  const clampedU = Math.max(0, Math.min(1, u));
  return 3500 - 800 * (3 * clampedU * clampedU - 2 * clampedU * clampedU * clampedU);
}

/**
 * 3.0° glide slope altitude target based on distance to threshold.
 * Field elevation: 1,892 ft MSL.
 *
 * @param {number} distToThresholdFt - Distance to runway threshold in feet
 * @returns {number} Target altitude in ft MSL
 */
export function calcGlideSlopeTargetAlt(distToThresholdFt) {
  const tan3 = Math.tan(degToRad(GLIDE_SLOPE_DEG));
  const alt = CYMJ_FIELD_ELEV_FT + distToThresholdFt * tan3;
  return Math.min(2700, Math.max(CYMJ_THRESH_ELEV_FT, alt));
}

/**
 * Computes speed target and advances airspeed under the KIN (Kinematic) performance model.
 * Linear acceleration (+4.0 kt/s, matching T-6 full throttle at 140 KIAS / 3,500 ft)
 * and deceleration (-2.7 kt/s, matching T-6 idle throttle drag at 220 KIAS / 3,500 ft).
 *
 * @param {Object} aircraft
 * @param {number} targetSpeedKt
 * @param {number} [dt=0]
 * @param {string} [phase=null]
 * @param {number} [progressU=0]
 * @returns {number} Updated or target airspeed in KIAS
 */
export function calcSpeedTarget(aircraft, targetSpeedKt, dt = 0, phase = null, progressU = 0) {
  const currentPhase = phase || aircraft.phase;
  let target = targetSpeedKt ?? aircraft.targetSpeedKt ?? 140;

  if (currentPhase === 'break' || currentPhase === 'break_turn') {
    target = calcBreakDecelSpeed(progressU);
  } else if (currentPhase === 'si_final') {
    const dist = aircraft.distToThreshold ?? 10000;
    if (dist > SPEED_GATE_WINDOW_FT) {
      target = 120;
    } else {
      const u = Math.max(0, Math.min(1, dist / SPEED_GATE_WINDOW_FT));
      target = 100 + 20 * u;
    }
  }

  if (dt <= 0) return target;

  const currentSpeed = aircraft.iasKt ?? target;
  let updatedSpeed = currentSpeed;
  if (currentSpeed < target) {
    updatedSpeed = Math.min(target, currentSpeed + 4.0 * dt);
  } else if (currentSpeed > target) {
    updatedSpeed = Math.max(target, currentSpeed - 2.7 * dt);
  }
  aircraft.iasKt = updatedSpeed;
  return updatedSpeed;
}

/**
 * Computes altitude target and advances altitude under the KIN (Kinematic) performance model.
 * Climb rate derived from T-6 excess thrust; descent rate up to 60 ft/s (3,600 fpm)
 * allowing tracking of dynamic cubic final turn profiles.
 *
 * @param {Object} aircraft
 * @param {number} targetAltFt
 * @param {number} [dt=0]
 * @param {string} [phase=null]
 * @param {number} [progressU=0]
 * @returns {number} Updated or target altitude in ft MSL
 */
export function calcAltitudeTarget(aircraft, targetAltFt, dt = 0, phase = null, progressU = 0) {
  const currentPhase = phase || aircraft.phase;
  let target = targetAltFt ?? aircraft.targetAltFt ?? 3500;

  if (currentPhase === 'final_turn') {
    target = calcCubicDescentAlt(progressU);
  } else if (currentPhase === 'final' || currentPhase === 'final_approach') {
    if (aircraft.distToThreshold !== undefined && aircraft.distToThreshold <= GLIDE_SLOPE_INTERCEPT_FT) {
      target = calcGlideSlopeTargetAlt(aircraft.distToThreshold);
    }
  }

  if (dt <= 0) return target;

  const currentAlt = aircraft.alt ?? target;
  let updatedAlt = currentAlt;
  if (currentAlt < target) {
    const iasKt = aircraft.iasKt ?? aircraft.targetSpeedKt ?? 140;
    const altFt = currentAlt;
    const tasKt = aircraft.tasKt || iasToTasKt(iasKt, altFt);
    const vAirFtps = ktToFtps(tasKt);
    const climbRateFtps = Math.max(0, excessThrustPerWeight(iasKt, altFt, 1.0) * vAirFtps);
    updatedAlt = Math.min(target, currentAlt + climbRateFtps * dt);
  } else if (currentAlt > target) {
    const descentNeeded = (currentAlt - target) / dt;
    const descentRateFtps = Math.min(descentNeeded, 60.0);
    updatedAlt = Math.max(target, currentAlt - descentRateFtps * dt);
  }
  aircraft.alt = updatedAlt;
  return updatedAlt;
}

/**
 * Evaluates state machine triggers and advances aircraft flight phases.
 *
 * @param {Object} aircraft
 * @param {Object} [navPlan]
 * @param {Object} [env]
 * @param {number} [dt=0.05]
 */
export function evaluatePhaseTransitions(aircraft, navPlan, env, dt = 0.05) {
  if (!aircraft || aircraft.active === false) return;

  // Handle in-flight commands
  if (aircraft.command === 'breakout' && aircraft.phase !== 'breakout') {
    aircraft.phase = 'breakout';
    aircraft.targetAltFt = 4500;
    aircraft.targetBankDeg = -35;
    return;
  }
  if (aircraft.command === 'go_around' && aircraft.phase !== 'go_around') {
    aircraft.phase = 'go_around';
    aircraft.targetAltFt = 2500;
    aircraft.targetSpeedKt = 140;
    aircraft.targetBankDeg = 0;
    return;
  }
  if ((aircraft.command === 'pfl_current' || aircraft.command === 'engine_fail') && !aircraft.engineFailed) {
    aircraft.engineFailed = true;
    aircraft.model = 'NRG';
    aircraft.phase = 'pfl_inbound';
  }

  // PFL Energy Gate assessment
  if (aircraft.phase === 'pfl_inbound') {
    const tas = aircraft.tasKt || iasToTasKt(aircraft.iasKt ?? 125, aircraft.alt ?? 3500);
    const he = energyHeightFt(aircraft.alt ?? 3500, tas);
    // If energy height exceeds 4,500 ft, aircraft has energy to complete orbit
    if (he >= 4500) {
      aircraft.phase = 'pfl_orbit';
    } else {
      aircraft.phase = 'pfl_final';
    }
    return;
  }

  // Standard circuit state machine
  switch (aircraft.phase) {
    case 'initial': {
      // Crossing break point (~2,048 ft past threshold, x <= -288)
      if (aircraft.x <= -288) {
        aircraft.phase = 'break';
        aircraft.turnAccumDeg = 0;
        aircraft.targetBankDeg = -60; // 60° left bank
        aircraft.targetAltFt = 3500;
      }
      break;
    }

    case 'break':
    case 'break_turn': {
      if ((aircraft.turnAccumDeg ?? 0) >= 180 || (aircraft.headingDeg >= 113 && aircraft.headingDeg <= 123)) {
        aircraft.phase = 'inner_downwind';
        aircraft.targetBankDeg = 0;
        aircraft.targetSpeedKt = 120;
        aircraft.targetAltFt = 3500;
      }
      break;
    }

    case 'inner_downwind':
    case 'downwind': {
      const distToPerch = aircraft.distToPerch ?? (aircraft.toWp ? Math.hypot(aircraft.x - aircraft.toWp.x, aircraft.y - aircraft.toWp.y) : Infinity);
      if (distToPerch <= 200 || aircraft.reachedPerch) {
        aircraft.phase = 'final_turn';
        aircraft.turnAccumDeg = 0;
        aircraft.targetBankDeg = -35;
        aircraft.targetSpeedKt = 120;
      }
      break;
    }

    case 'final_turn': {
      const headingDiff = Math.abs(wrapDeg180((aircraft.headingDeg ?? 0) - CYMJ_RWY_HDG_DEG));
      const onCenterline = aircraft.crossTrackFt === undefined || Math.abs(aircraft.crossTrackFt) < 50;
      if ((aircraft.turnAccumDeg ?? 0) >= 180 || (headingDiff <= 5 && onCenterline)) {
        aircraft.phase = 'final';
        aircraft.targetBankDeg = 0;
        aircraft.targetSpeedKt = 100;
      }
      break;
    }

    case 'final':
    case 'final_approach': {
      const distToThresh = aircraft.distToThreshold ?? Math.hypot(aircraft.x - CYMJ_THRESH_X, aircraft.y - CYMJ_THRESH_Y);
      if (distToThresh <= 100 || (aircraft.x <= CYMJ_THRESH_X + 50 && aircraft.x >= CYMJ_THRESH_X - 50 && aircraft.y >= CYMJ_THRESH_Y - 50)) {
        aircraft.phase = 'landing';
      }
      break;
    }

    case 'landing': {
      // Explicit landing probability roll: 20% full stop, 80% touch-and-go
      const roll = aircraft.diceRoll ?? Math.random();
      if (roll < 0.20) {
        aircraft.phase = 'full_stop';
        aircraft.landed = true;
        aircraft.active = false;
        aircraft.status = 'landed';
      } else {
        aircraft.phase = 'takeoff_climb';
        aircraft.landed = false;
        aircraft.active = true;
        aircraft.targetSpeedKt = 140;
        aircraft.targetAltFt = 2500;
        aircraft.targetBankDeg = 0;
      }
      break;
    }

    case 'takeoff_climb':
    case 'climb': {
      // Past departure end (x <= -4000)
      if (aircraft.x <= -4000) {
        aircraft.phase = 'closed_pattern';
        aircraft.turnAccumDeg = 0;
        aircraft.targetBankDeg = -50; // 50° left bank climb
        aircraft.targetAltFt = 3500;
        aircraft.targetSpeedKt = 140;
      }
      break;
    }

    case 'closed_pattern': {
      if ((aircraft.turnAccumDeg ?? 0) >= 180 || (aircraft.headingDeg >= 113 && aircraft.headingDeg <= 123)) {
        aircraft.phase = 'inner_downwind';
        aircraft.targetBankDeg = 0;
        aircraft.targetAltFt = 3500;
        aircraft.targetSpeedKt = 120;
      }
      break;
    }

    case 'si_descent': {
      if (aircraft.alt <= 2700) {
        aircraft.phase = 'si_downwind';
        aircraft.targetAltFt = 2700;
        aircraft.targetSpeedKt = 140;
      }
      break;
    }

    case 'si_downwind': {
      if (aircraft.reachedBaseTurn) {
        aircraft.phase = 'si_base';
        aircraft.targetBankDeg = -45;
        aircraft.targetSpeedKt = 120;
      }
      break;
    }

    case 'si_base': {
      if (aircraft.rolledOutFinal) {
        aircraft.phase = 'si_final';
        aircraft.targetBankDeg = 0;
        aircraft.targetSpeedKt = 120;
        aircraft.targetAltFt = 2700;
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Initializes a new Cartesian vector aircraft state.
 *
 * @param {Object} spawnSpec - Input parameters or preset
 * @param {Object} [navPlan] - Compiled navigation plan
 * @param {Object} [env] - Atmosphere and wind environment
 * @returns {Object} Fully initialized canonical aircraft state object
 */
export function initAircraftState(spawnSpec = {}, navPlan = null, env = null) {
  const wps = navPlan?.waypoints || [];
  const startIdx = spawnSpec.startPoint ? spawnSpec.startPoint - 1 : (spawnSpec.waypointIndex ?? 0);
  const startWp = wps[startIdx] || wps[0] || null;

  const alt = spawnSpec.alt ?? startWp?.alt ?? 3500;
  const iasKt = spawnSpec.iasKt ?? spawnSpec.kt ?? startWp?.kias ?? 220;
  const headingDeg = spawnSpec.headingDeg ?? startWp?.headingDeg ?? CYMJ_RWY_HDG_DEG;
  const x = spawnSpec.x ?? startWp?.x ?? 0;
  const y = spawnSpec.y ?? startWp?.y ?? 0;

  const windFrom = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const tasKt = iasToTasKt(iasKt, alt);
  const wt = windTriangle(headingDeg, Math.max(1, tasKt), windFrom, windKt);

  let waypointIndex = spawnSpec.waypointIndex;
  if (waypointIndex === undefined) {
    if (spawnSpec.startPoint !== undefined) {
      waypointIndex = wps.length > 1 ? (spawnSpec.startPoint % wps.length) : 0;
    } else {
      waypointIndex = wps.length > 1 ? 1 : 0;
    }
  }

  return {
    id: spawnSpec.id || 'A1',
    type: spawnSpec.type || 'CT-156',
    color: spawnSpec.color || '#58a6ff',
    model: spawnSpec.model || navPlan?.model || 'KIN',
    phase: spawnSpec.phase || startWp?.phase || 'initial',
    x,
    y,
    alt,
    iasKt,
    kt: iasKt, // backward-compatible alias
    tasKt,
    gsKt: wt.groundSpeedKt,
    groundSpeedKt: wt.groundSpeedKt, // backward-compatible alias
    headingDeg,
    trackDeg: wt.canHoldTrack ? headingDeg - wt.crabDeg : headingDeg,
    crabDeg: wt.crabDeg,
    bankDeg: spawnSpec.bankDeg ?? 0,
    targetBankDeg: spawnSpec.targetBankDeg ?? (spawnSpec.bankDeg ? spawnSpec.bankDeg : 0),
    targetSpeedKt: spawnSpec.targetSpeedKt ?? iasKt,
    targetAltFt: spawnSpec.targetAltFt ?? alt,
    legIndex: startIdx,
    waypointIndex,
    config: spawnSpec.config || 'clean',
    active: true,
    landed: false,
    engineFailed: spawnSpec.engineFailed || false,
    command: spawnSpec.command || null,
    distFt: spawnSpec.distFt ?? 0,
    turnAccumDeg: spawnSpec.turnAccumDeg ?? 0,
    trail: spawnSpec.trail || [],
  };
}

/**
 * Executes a single 3D Cartesian vector simulation step for an aircraft.
 * Polymorphic argument support: (aircraft, navPlan, env, dt) or (aircraft, dt, env, navPlan).
 *
 * @param {Object} aircraft - Mutable aircraft state object
 * @param {Object|number} arg2 - navPlan or dt
 * @param {Object} [arg3] - env
 * @param {Object|number} [arg4] - dt or navPlan
 * @returns {Object} Updated aircraft state
 */
export function stepAircraft(aircraft, arg2, arg3, arg4) {
  if (!aircraft || !aircraft.active || aircraft.landed) return aircraft;

  // Resolve argument order polymorphism
  let navPlan = null;
  let env = { windFromDeg: 360, windKt: 0 };
  let dt = 0.05;

  if (typeof arg2 === 'number') {
    dt = arg2;
    env = arg3 || env;
    navPlan = arg4 || navPlan;
  } else {
    navPlan = arg2 || navPlan;
    env = arg3 || env;
    dt = typeof arg4 === 'number' ? arg4 : dt;
  }

  // Guarantee finite step
  dt = Number.isFinite(dt) && dt > 0 ? dt : 0.05;
  const windFrom = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;

  // 1. True Airspeed
  aircraft.tasKt = iasToTasKt(aircraft.iasKt ?? 140, aircraft.alt ?? 3500);
  const vAirFtps = ktToFtps(aircraft.tasKt);

  // 2. Guidance & Waypoint Navigation
  let desiredHeadingDeg = aircraft.headingDeg ?? 0;
  const wps = navPlan?.waypoints || [];

  if (wps.length > 0) {
    let idx = aircraft.waypointIndex ?? 0;
    if (idx >= wps.length) {
      idx = navPlan.loop ? 0 : wps.length - 1;
      aircraft.waypointIndex = idx;
    }

    const toWp = wps[idx];
    let fromWp;
    if (idx === 0 || Math.hypot(toWp.x - wps[(idx - 1 + wps.length) % wps.length].x, toWp.y - wps[(idx - 1 + wps.length) % wps.length].y) < 100) {
      fromWp = aircraft._legStart || { x: aircraft.x, y: aircraft.y };
    } else {
      fromWp = wps[(idx - 1 + wps.length) % wps.length];
    }
    const nextWp = wps[(idx + 1) % wps.length] || toWp;
    aircraft.toWp = toWp;

    const segLength = Math.hypot(toWp.x - fromWp.x, toWp.y - fromWp.y);
    const alongTrack = calcAlongTrackDist(fromWp, toWp, aircraft);
    const crossTrack = calcCrossTrackError(fromWp, toWp, aircraft);
    const distToWp = Math.hypot(aircraft.x - toWp.x, aircraft.y - toWp.y);

    aircraft.crossTrackFt = crossTrack;
    aircraft.alongTrackFt = alongTrack;

    // Lead turn advance
    const isFlyOver = toWp.phase === 'high_key';
    const tau1 = Math.atan2(toWp.x - fromWp.x, toWp.y - fromWp.y);
    const tau2 = Math.atan2(nextWp.x - toWp.x, nextWp.y - toWp.y);
    const turnAngleDeg = Math.abs(wrapDeg180(radToDeg(tau2 - tau1)));
    const targetTurnBank = Math.abs(toWp.bankDeg || 30);
    const leadDist = isFlyOver ? 0 : Math.min(calcLeadTurnDist(vAirFtps, targetTurnBank, Math.min(turnAngleDeg, 90)), 0.65 * segLength);

    // Waypoint capture condition: along-track past lead distance with bounded cross-track, or proximity <= 150 ft
    const canCaptureAlongTrack = alongTrack >= segLength - leadDist && segLength > 100 && Math.abs(crossTrack) <= Math.max(500, leadDist);
    if (canCaptureAlongTrack || distToWp <= 150) {
      if (idx + 1 < wps.length) {
        aircraft.waypointIndex = idx + 1;
        const nextWp = wps[idx + 1];
        // Update phase and config from nav plan
        if (nextWp.phase && (!navPlan || !navPlan.loop)) aircraft.phase = nextWp.phase;
        if (nextWp.config) aircraft.config = nextWp.config;
        // Anchor new leg start
        aircraft._legStart = { x: toWp.x, y: toWp.y };
        // Cut engine at High Key for PFL profile
        if (navPlan && !navPlan.loop) {
          // PFL engine cut: when leaving High Key (wp 0), cut engine for glide
          if (idx === 0 && aircraft.command === 'climb_high_key') {
            aircraft.engineFailed = true;
          }
          if (idx === 1 && aircraft.command === 'climb_low_key') {
            aircraft.engineFailed = true;
          }
        }
      } else if (navPlan.loop) {
        aircraft.waypointIndex = 0;
      }
      if (idx + 1 >= wps.length && !navPlan.loop) {
        // Reached end of non-looping plan (PFL at threshold)
        if (aircraft.alt <= 1942) { // field elev 1892 + 50 ft buffer
          aircraft.landed = true;
          aircraft.active = false;
          aircraft.status = 'landed';
        }
      }
    }

    // Guidance mode
    if (aircraft.phase === 'final' || aircraft.phase === 'final_approach') {
      // Localizer corridor tracking on runway heading
      desiredHeadingDeg = calcInterceptHeading(
        { x: CYMJ_THRESH_X + 30000 * Math.sin(degToRad(CYMJ_RWY_HDG_DEG + 180)), y: CYMJ_THRESH_Y + 30000 * Math.cos(degToRad(CYMJ_RWY_HDG_DEG + 180)) },
        { x: CYMJ_THRESH_X, y: CYMJ_THRESH_Y },
        aircraft,
        aircraft.tasKt,
        env,
        { maxInterceptDeg: 30 }
      );
    } else {
      desiredHeadingDeg = calcInterceptHeading(fromWp, toWp, aircraft, aircraft.tasKt, env);
    }
  }

  // 3. Bank Dynamics & Roll Rate Limiting
  const maxRollRateDps = (aircraft.command === 'breakout' || aircraft.phase === 'breakout') ? 90 : 45;
  calcBankTarget(aircraft, desiredHeadingDeg, dt, maxRollRateDps);

  // 4. Coordinated Turn Heading Integration
  const bankRad = degToRad(aircraft.bankDeg ?? 0);
  const omega = (G_FTPS2 * Math.tan(bankRad)) / Math.max(50, vAirFtps); // rad/s
  const deltaHdgDeg = radToDeg(omega) * dt;
  aircraft.headingDeg = ((aircraft.headingDeg + deltaHdgDeg) % 360 + 360) % 360;
  aircraft.turnAccumDeg = (aircraft.turnAccumDeg ?? 0) + Math.abs(deltaHdgDeg);

  // 5. 3D Cartesian Position & Natural Wind Integration
  // Air velocity vector
  const headingMathRad = degToRad(90 - aircraft.headingDeg);
  const vxAir = vAirFtps * Math.cos(headingMathRad);
  const vyAir = vAirFtps * Math.sin(headingMathRad);

  // Wind vector: wind blows FROM windFromDeg towards windFromDeg + 180°
  const windBlowMathRad = degToRad(90 - (windFrom + 180));
  const windFtps = ktToFtps(windKt);
  const vxWind = windFtps * Math.cos(windBlowMathRad);
  const vyWind = windFtps * Math.sin(windBlowMathRad);

  // Total ground velocity
  const vxGround = vxAir + vxWind;
  const vyGround = vyAir + vyWind;
  const gsFtps = Math.hypot(vxGround, vyGround);
  const gsKt = ftpsToKt(gsFtps);

  aircraft.gsKt = gsKt;
  aircraft.groundSpeedKt = gsKt;

  const trackMathRad = Math.atan2(vyGround, vxGround);
  aircraft.trackDeg = ((90 - radToDeg(trackMathRad)) % 360 + 360) % 360;
  aircraft.crabDeg = wrapDeg180(aircraft.headingDeg - aircraft.trackDeg);

  // Step position
  aircraft.x += vxGround * dt;
  aircraft.y += vyGround * dt;
  aircraft.distFt = (aircraft.distFt ?? 0) + vAirFtps * dt;

  // Threshold distance update
  aircraft.distToThreshold = Math.hypot(aircraft.x - CYMJ_THRESH_X, aircraft.y - CYMJ_THRESH_Y);

  // 6. Performance Model (Speed & Altitude)
  const progressU = Math.min(1, (aircraft.turnAccumDeg ?? 0) / 180);

  if (aircraft.model === 'NRG') {
    // Vfe safety guard: lock clean if over 147 KIAS
    if (aircraft.iasKt > VFE_LIMIT_KIAS) {
      aircraft.config = 'clean';
    }

    if (aircraft.engineFailed) {
      // Gliding flight
      const config = aircraft.config || 'clean';
      let sinkFpm = glideSinkFpm(config, aircraft.iasKt ?? 125, aircraft.alt ?? 3500);
      if (aircraft.command === 'climb_high_key' && aircraft.phase !== 'high_key') {
        sinkFpm *= 1.35; // Prototype simplification: increased drag on spiral after High Key
      }
      aircraft.alt -= (sinkFpm / 60) * dt;

      // Target glide speed per config (clean: 125, gearDown: 120, landing: 100)
      let targetGlideSpeed = 125;
      if (config === 'gearDown') targetGlideSpeed = 120;
      else if (config === 'landing') targetGlideSpeed = 100;


      // Decelerate or accelerate smoothly toward best glide speed
      if (aircraft.iasKt < targetGlideSpeed) {
        aircraft.iasKt = Math.min(targetGlideSpeed, aircraft.iasKt + 2.0 * dt);
      } else if (aircraft.iasKt > targetGlideSpeed) {
        aircraft.iasKt = Math.max(targetGlideSpeed, aircraft.iasKt - 4.0 * dt);
      }
    } else {
      // Powered NRG: excess thrust acceleration
      const excess = excessThrustPerWeight(aircraft.iasKt ?? 140, aircraft.alt ?? 3500, 1.0);
      const accelKtps = ftpsToKt(G_FTPS2 * excess);
      aircraft.iasKt += accelKtps * dt;
      calcAltitudeTarget(aircraft, aircraft.targetAltFt, dt, aircraft.phase, progressU);
    }
  } else {
    // KIN performance model
    calcSpeedTarget(aircraft, aircraft.targetSpeedKt, dt, aircraft.phase, progressU);
    calcAltitudeTarget(aircraft, aircraft.targetAltFt, dt, aircraft.phase, progressU);
  }

  // Update backward-compatible fields
  aircraft.kt = aircraft.iasKt;

  // 7. Phase State Machine
  evaluatePhaseTransitions(aircraft, navPlan, env, dt);

  return aircraft;
}
