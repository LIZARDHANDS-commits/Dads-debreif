// High Key Continuous Kinematic Controller for Traffic Sim
// Authoritative requirements: Patrick's Lead Pilot Guidance (Milestone M1 / PFL)
// Ground truth: 15 Wing Moose Jaw CT-156 Harvard II / CYMJ Runway 29L
import { degToRad, radToDeg, wrapDeg180 } from '../../core/angles.js';
import { ktToFtps, ftpsToKt } from '../../core/units.js';
import { windTriangle } from '../../core/wind.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import {
  CYMJ_RWY_HDG_DEG,
  calcAlongTrackDist,
  calcCrossTrackError,
} from './flight-engine.js';
import { getNavPlan } from './nav-plans.js';

// ── HIGH KEY GROUND TRUTH CONSTANTS ──────────────────────────────────────────
export const HIGH_KEY_PT = Object.freeze({ x: 3104, y: -3194, alt: 5000 });
export const RWY_HDG_DEG = CYMJ_RWY_HDG_DEG ?? 298;
export const RUN_IN_LEN_FT = 660; // 1/8 NM = 5,280 / 8 = 660 ft

const RAD_RWY = degToRad(RWY_HDG_DEG);
const UX_RWY = Math.sin(RAD_RWY); // -0.88294759...
const UY_RWY = Math.cos(RAD_RWY); // +0.46947156...
const NX_RWY = Math.cos(RAD_RWY); // +0.46947156... (right normal)
const NY_RWY = -Math.sin(RAD_RWY); // +0.88294759...

// Run-in corridor entry point (1/8 NM prior to High Key aligned on runway heading 298°)
// Position 660 ft prior:
// x = 3104 - 660 * (-0.88294759) ≈ 3686.75
// y = -3194 - 660 * (0.46947156) ≈ -3503.85
export const RUN_IN_PT = Object.freeze({
  x: HIGH_KEY_PT.x - RUN_IN_LEN_FT * UX_RWY,
  y: HIGH_KEY_PT.y - RUN_IN_LEN_FT * UY_RWY,
  alt: 5000,
  headingDeg: RWY_HDG_DEG,
});

/**
 * Computes the 1/8 NM run-in entry point before High Key aligned on runway heading.
 *
 * @param {{x: number, y: number, alt?: number}} [highKeyPt=HIGH_KEY_PT]
 * @param {number} [rwyHdgDeg=RWY_HDG_DEG]
 * @param {number} [distFt=RUN_IN_LEN_FT]
 * @returns {{x: number, y: number, alt: number, headingDeg: number}}
 */
export function computeRunInPoint(highKeyPt = HIGH_KEY_PT, rwyHdgDeg = RWY_HDG_DEG, distFt = RUN_IN_LEN_FT) {
  const rad = degToRad(rwyHdgDeg);
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  return {
    x: highKeyPt.x - distFt * ux,
    y: highKeyPt.y - distFt * uy,
    alt: highKeyPt.alt ?? 5000,
    headingDeg: rwyHdgDeg,
  };
}

/**
 * Computes corridor parameters for the High Key run-in.
 *
 * @param {{x: number, y: number, alt?: number}} [highKeyPt=HIGH_KEY_PT]
 * @param {number} [rwyHdgDeg=RWY_HDG_DEG]
 * @param {number} [distFt=RUN_IN_LEN_FT]
 * @returns {{start: Object, end: Object, headingDeg: number, lengthFt: number}}
 */
export function computeHighKeyCorridor(highKeyPt = HIGH_KEY_PT, rwyHdgDeg = RWY_HDG_DEG, distFt = RUN_IN_LEN_FT) {
  const start = computeRunInPoint(highKeyPt, rwyHdgDeg, distFt);
  return {
    start,
    end: { ...highKeyPt },
    headingDeg: rwyHdgDeg,
    lengthFt: distFt,
  };
}

/**
 * Pillar 8 Climb Arrest: Over the last 300 ft (4,700 to 5,000 ft MSL),
 * pitch smoothly decays from climb pitch (~10°-12°) to 0°, leveling off smoothly at 5,000 ft MSL.
 *
 * @param {number} alt - Current altitude MSL in feet
 * @param {number} [climbPitch=10] - Commanded climb pitch attitude in degrees
 * @returns {number} Decayed pitch angle in degrees [0, climbPitch]
 */
export function calcHighKeyPitch(alt, climbPitch = 10) {
  if (alt >= 5000) return 0;
  if (alt >= 4700) {
    return Math.max(0, climbPitch * (5000 - alt) / 300);
  }
  return climbPitch;
}

/**
 * Calculates target airspeed for High Key procedure:
 * 140 KIAS during Phase 1 & 2, decelerating from 140 KIAS to 120 KIAS over the 1/8 NM run-in (Phase 3).
 *
 * @param {number|string} phase - Current High Key phase (1, 2, or 3)
 * @param {number} [alongTrackFt=0] - Distance along the run-in corridor from RUN_IN_PT to HIGH_KEY_PT
 * @returns {number} Target airspeed in KIAS
 */
export function calcHighKeyTargetSpeed(phase, alongTrackFt = 0) {
  if (phase === 3 || phase === 'run_in') {
    const progress = Math.max(0, Math.min(1, Math.max(0, alongTrackFt) / RUN_IN_LEN_FT));
    return 140 - 20 * progress;
  }
  return 140;
}

/**
 * Calculates intercept guidance from current aircraft state to the High Key run-in corridor.
 * Ensures an authentic, wind-compensated kinematic arc regardless of approach origin.
 *
 * @param {Object} aircraft - Aircraft state
 * @param {Object} [env] - Wind environment
 * @param {Object} [options] - Tuning options
 * @returns {{desiredHeadingDeg: number, alongTrack: number, crossTrack: number, targetTrack: number}}
 */
export function calcHighKeyIntercept(aircraft, env = null, options = {}) {
  const x = aircraft.x ?? 0;
  const y = aircraft.y ?? 0;
  const alt = aircraft.alt ?? 3500;
  const iasKt = aircraft.iasKt ?? 140;
  const tasKt = iasToTasKt(iasKt, alt);
  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;

  // Relative vector from RUN_IN_PT
  const dx = x - RUN_IN_PT.x;
  const dy = y - RUN_IN_PT.y;

  // Along-track: positive = toward/past High Key along heading 298°; negative = upstream (southeast)
  const alongTrack = dx * UX_RWY + dy * UY_RWY;
  // Cross-track: positive = right of runway heading; negative = left
  const crossTrack = dx * NX_RWY + dy * NY_RWY;

  let targetTrack = RWY_HDG_DEG;

  // Case A: Aircraft is downstream of RUN_IN_PT (alongTrack > 200, e.g. departure end past runway).
  // Must turn downwind (heading ~118°) toward an upstream approach gate to set up the intercept turn.
  if (alongTrack > 200) {
    const gateLeadFt = options.gateLeadFt ?? 5500;
    const gateX = RUN_IN_PT.x - gateLeadFt * UX_RWY;
    const gateY = RUN_IN_PT.y - gateLeadFt * UY_RWY;
    const dxGate = gateX - x;
    const dyGate = gateY - y;
    targetTrack = (Math.atan2(dxGate, dyGate) * 180 / Math.PI + 360) % 360;
  } else {
    // Case B: Aircraft is upstream (alongTrack <= 200) or laterally offset.
    // Intercept the extended runway centerline (heading 298°) using cross-track feedback.
    const kGain = options.kGain ?? 0.002;
    const maxInterceptDeg = options.maxInterceptDeg ?? 45;
    const thetaIntRad = Math.atan(kGain * crossTrack);
    const thetaIntDeg = Math.max(-maxInterceptDeg, Math.min(maxInterceptDeg, radToDeg(thetaIntRad)));

    targetTrack = ((RWY_HDG_DEG - thetaIntDeg) % 360 + 360) % 360;

    // As alongTrack nears RUN_IN_PT from upstream (within 800 ft), blend smoothly toward RUN_IN_PT
    if (alongTrack > -800 && Math.abs(crossTrack) > 50) {
      const dxRunIn = RUN_IN_PT.x - x;
      const dyRunIn = RUN_IN_PT.y - y;
      const bearingToRunIn = (Math.atan2(dxRunIn, dyRunIn) * 180 / Math.PI + 360) % 360;
      const u = Math.max(0, Math.min(1, (alongTrack + 800) / 800));
      const diff = wrapDeg180(bearingToRunIn - targetTrack);
      targetTrack = ((targetTrack + diff * u * 0.5) % 360 + 360) % 360;
    }
  }

  // Wind crab calculation
  const wt = windTriangle(targetTrack, Math.max(1, tasKt), windFromDeg, windKt);
  const desiredHeadingDeg = wt.canHoldTrack ? wt.headingDeg : targetTrack;

  return {
    desiredHeadingDeg,
    targetTrack,
    alongTrack,
    crossTrack,
  };
}

/**
 * Continuous High Key Controller (Patrick's Lead Pilot Guidance):
 *
 * Phase 1 (Climbing Kinematic Turn at 140 KIAS):
 *   - Maintains 140 KIAS with full excess power climb until 5,000 ft MSL.
 *   - Bank is coordinated turn toward the run-in line.
 *   - Pillar 8 Climb Arrest: Over the last 300 ft (4,700 to 5,000 ft MSL),
 *     pitch smoothly decays from climb pitch (~10°-12°) to 0°, leveling off smoothly at 5,000 ft MSL.
 *
 * Phase 2 (Level Kinematic Turn at 5,000 ft & 140 KIAS):
 *   - Once at 5,000 ft, aircraft flies level at 140 KIAS, continuing the wind-shaped kinematic
 *     arc to intercept the 1/8 NM run-in corridor.
 *
 * Phase 3 (1/8 NM Run-in Deceleration):
 *   - Aircraft rolls wings level on runway heading 298° at (3687, -3504).
 *   - Flies straight on runway heading for 1/8 NM while decelerating from 140 KIAS to 120 KIAS at High Key.
 *
 * Transition:
 *   - At High Key (within 150 ft of 3104, -3194), transitions to PFL descent phase (`pfl_high_key` / Low Key spiral).
 *
 * @param {Object} a - Aircraft state object
 * @param {Object} [route=null] - Active route
 * @param {Object} [env=null] - Wind environment
 * @param {number} [stepDt=0.05] - Timestep in seconds
 * @param {Object} [routeOptions={}] - Route calculation options
 */
export function stepHighKey(a, route = null, env = null, stepDt = 0.05, routeOptions = {}) {
  if (!a) return;

  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const alt = a.alt ?? 3500;
  const iasKt = a.iasKt ?? 140;
  const tasKt = iasToTasKt(iasKt, alt);

  // High Key procedures maintain engine power until High Key is reached
  a.engineFailed = false;

  const dx = (a.x ?? 0) - RUN_IN_PT.x;
  const dy = (a.y ?? 0) - RUN_IN_PT.y;
  const alongTrack = dx * UX_RWY + dy * UY_RWY;
  const crossTrack = dx * NX_RWY + dy * NY_RWY;
  const distToHighKey = Math.hypot(HIGH_KEY_PT.x - (a.x ?? 0), HIGH_KEY_PT.y - (a.y ?? 0));
  const distToRunIn = Math.hypot(RUN_IN_PT.x - (a.x ?? 0), RUN_IN_PT.y - (a.y ?? 0));

  const climbPitch = a.highKeyClimbPitchDeg ?? a.closedPatternPitchDeg ?? 10;
  const nominalBank = a.highKeyBankDeg ?? a.closedPatternBankDeg ?? 45;

  // Determine or advance internal High Key phase
  if (a._highKeyPhase === undefined) {
    if (alt < 4950) {
      a._highKeyPhase = 1;
    } else {
      const deltaHdgRwy = Math.abs(wrapDeg180((a.headingDeg ?? 0) - RWY_HDG_DEG));
      const inCorridor = alongTrack >= -50 && alongTrack <= RUN_IN_LEN_FT + 100 && Math.abs(crossTrack) <= 200 && deltaHdgRwy <= 30;
      a._highKeyPhase = inCorridor ? 3 : 2;
    }
  }

  // Phase 1 -> Phase 2 transition when capturing 5,000 ft MSL
  if (a._highKeyPhase === 1 && alt >= 4950) {
    a._highKeyPhase = 2;
  }

  // Phase 2 -> Phase 3 transition when reaching the 1/8 NM run-in corridor
  if (a._highKeyPhase === 2 || a._highKeyPhase === 1) {
    const deltaHdgRwy = Math.abs(wrapDeg180((a.headingDeg ?? 0) - RWY_HDG_DEG));
    const capturedRunIn = (alongTrack >= -60 && alongTrack <= RUN_IN_LEN_FT + 100 && Math.abs(crossTrack) <= 200 && deltaHdgRwy <= 30 && alt >= 4850) ||
                          (distToRunIn <= 200 && deltaHdgRwy <= 30 && alt >= 4850);
    if (capturedRunIn) {
      a._highKeyPhase = 3;
      a.phase = 'high_key_run_in';
    }
  }

  // ── PHASE 1 & 2: KINEMATIC CLIMB & ARC INTERCEPT ─────────────────────────────
  if (a._highKeyPhase === 1 || a._highKeyPhase === 2) {
    a.targetAltFt = 5000;
    a.targetSpeedKt = 140;

    // Pillar 8 Climb Arrest: pitch decay over 4,700 - 5,000 ft MSL
    a.pitchDeg = calcHighKeyPitch(alt, climbPitch);

    // Kinematic steering towards run-in corridor
    const intercept = calcHighKeyIntercept(a, env);
    a.desiredHeadingDeg = intercept.desiredHeadingDeg;

    const deltaHdg = wrapDeg180(intercept.desiredHeadingDeg - (a.headingDeg ?? 0));

    // Coordinated bank modulation with roll-in/roll-out blending
    if (Math.abs(deltaHdg) <= 2.5) {
      a.targetBankDeg = 0;
    } else if (Math.abs(deltaHdg) < 25) {
      a.targetBankDeg = Math.max(-nominalBank, Math.min(nominalBank, deltaHdg * 1.8));
    } else {
      // Unloaded slice turn in upper 300 ft if large turn is required
      const isSlice = (alt >= 4700 && alt < 5000 && Math.abs(deltaHdg) > 15);
      const activeBank = isSlice ? Math.min(90, nominalBank + 20) : nominalBank;
      a.targetBankDeg = deltaHdg < 0 ? -activeBank : activeBank;
    }
  }

  // ── PHASE 3: 1/8 NM RUN-IN DECELERATION ──────────────────────────────────────
  if (a._highKeyPhase === 3) {
    a.phase = 'high_key_run_in';
    a.targetAltFt = 5000;
    a.pitchDeg = 0;

    // Wings level along runway heading 298°
    a.targetBankDeg = 0;

    // Runway heading wind crab to hold exact centerline
    const wtRwy = windTriangle(RWY_HDG_DEG, Math.max(1, tasKt), windFromDeg, windKt);
    a.desiredHeadingDeg = wtRwy.canHoldTrack ? wtRwy.headingDeg : RWY_HDG_DEG;

    // Deceleration from 140 KIAS to 120 KIAS over the 660 ft run-in
    const targetSpeed = calcHighKeyTargetSpeed(3, alongTrack);
    a.targetSpeedKt = targetSpeed;

    // Smooth speed bleed down to 120 KIAS at High Key
    if (a.iasKt !== undefined && a.iasKt > targetSpeed) {
      a.iasKt = Math.max(targetSpeed, a.iasKt - 6.7 * stepDt);
      a.kt = a.iasKt;
    }
  }

  // ── TRANSITION: ARRIVAL AT HIGH KEY ──────────────────────────────────────────
  const reachedHighKey = distToHighKey <= 150;
  if (reachedHighKey) {
    a.phase = 'pfl_high_key';
    a.tag = 'high_key';
    a.targetSpeedKt = 120;
    if (a.iasKt !== undefined) a.iasKt = 120;
    a.kt = 120;
    a.targetBankDeg = 0;
    a.pitchDeg = 0;
    a.targetAltFt = 5000;
    a._highKeyPhase = 'complete';

    // Transition to PFL navigation plan / rails if available
    const pflPlan = getNavPlan('PFL_HIGH_KEY');
    if (pflPlan) {
      a.navPlan = pflPlan;
      a.waypointIndex = 0;
      a.mode = 'RAIL';
    }
    delete a._activeCommand;
  }
}
