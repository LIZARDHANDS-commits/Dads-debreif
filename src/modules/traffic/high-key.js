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
import { THRESHOLD_29L, PFL_KEY_ALT_FT } from './airfield.js';
import { generatePflRail, buildPflRail, densifyRail } from './pfl-rail.js';

// ── HIGH KEY GROUND TRUTH CONSTANTS ──────────────────────────────────────────
export const HIGH_KEY_PT = Object.freeze({ x: THRESHOLD_29L.x, y: THRESHOLD_29L.y, alt: PFL_KEY_ALT_FT.highKey });
export const RWY_HDG_DEG = CYMJ_RWY_HDG_DEG ?? 298;
export const RUN_IN_LEN_FT = 660; // 1/8 statute mile (5,280 / 8). The ratified run-in is 1/8 NM, about 760 ft; it changes in refactor PR 4 (Traffic plan, Step 2)

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

  if (alongTrack > 200) {
    const gateLeadFt = options.gateLeadFt ?? 5500;
    const gateX = RUN_IN_PT.x - gateLeadFt * UX_RWY;
    const gateY = RUN_IN_PT.y - gateLeadFt * UY_RWY;
    const dxGate = gateX - x;
    const dyGate = gateY - y;
    targetTrack = (Math.atan2(dxGate, dyGate) * 180 / Math.PI + 360) % 360;
  } else {
    const kGain = options.kGain ?? 0.002;
    const maxInterceptDeg = options.maxInterceptDeg ?? 45;
    const thetaIntRad = Math.atan(kGain * crossTrack);
    const thetaIntDeg = Math.max(-maxInterceptDeg, Math.min(maxInterceptDeg, radToDeg(thetaIntRad)));

    targetTrack = ((RWY_HDG_DEG - thetaIntDeg) % 360 + 360) % 360;

    if (alongTrack > -800 && Math.abs(crossTrack) > 50) {
      const dxRunIn = RUN_IN_PT.x - x;
      const dyRunIn = RUN_IN_PT.y - y;
      const bearingToRunIn = (Math.atan2(dxRunIn, dyRunIn) * 180 / Math.PI + 360) % 360;
      const u = Math.max(0, Math.min(1, (alongTrack + 800) / 800));
      const diff = wrapDeg180(bearingToRunIn - targetTrack);
      targetTrack = ((targetTrack + diff * u * 0.5) % 360 + 360) % 360;
    }
  }

  const wt = windTriangle(targetTrack, Math.max(1, tasKt), windFromDeg, windKt);
  const desiredHeadingDeg = wt.canHoldTrack ? wt.headingDeg : targetTrack;

  return {
    desiredHeadingDeg,
    targetTrack,
    alongTrack,
    crossTrack,
  };
}

const G_ACCEL = 32.174;

/**
 * Synthesizes a smooth, wind-compensated kinematic approach rail to High Key (Pillars 1-10).
 *
 * Target State:
 *   - High Key Point: (3104, -3194), alt: 5000 ft MSL, speed: 120 KIAS, heading: 298° true.
 *   - Run-in Point: (3687, -3504) (660 ft / 1/8 NM prior along heading 298°).
 *
 * Approach Rail Generation:
 *   - Northwest / Upwind Departure: Wide left-hand circuit rail:
 *       a) Climbing turn arc: left turn at 35°–45° bank climbing at 140 KIAS with full excess power to 5,000 ft MSL,
 *          pitch smoothly decays from 10° to 0° over the last 300 ft (4,700 to 5,000 ft) per Pillar 8.
 *       b) Downwind leg: flies south of runway along heading ~118° at 5,000 ft MSL and 140 KIAS, carrying wind crab.
 *       c) Base-to-final turn arc: coordinated left turn curving onto extended runway heading 298°,
 *          rolling out wings-level upstream of (3687, -3504) at 5,000 ft MSL.
 *       d) 1/8 NM straight run-in: from (3687, -3504) to (3104, -3194) along runway heading 298° at 5,000 ft MSL,
 *          decelerating from 140 KIAS to 120 KIAS.
 *       e) Transition at High Key (3104, -3194): seamlessly hands off to `pfl_high_key` descent spiral rail.
 *   - South / Southeast Approach: Smooth tangential curve directly onto the extended 298° line upstream of (3687, -3504),
 *     then the 1/8 NM straight run-in to High Key.
 *
 * Every waypoint includes: { x, y, alt, kt, headingDeg, bankDeg, g, phase }
 *
 * @param {Object} aircraft - Aircraft state
 * @param {Object} [env=null] - Wind environment
 * @param {Object} [options={}] - Tuning options
 * @returns {Array<Object> & { id: string, model: string, loop: boolean, waypoints: Array<Object>, points: Array<Object> }}
 */
export function buildHighKeyApproachRail(aircraft, env = null, options = {}) {
  const x0 = aircraft?.x ?? -4066;
  const y0 = aircraft?.y ?? 681;
  const alt0 = aircraft?.alt ?? 2400;
  const ias0 = aircraft?.iasKt ?? 140;
  const hdg0 = aircraft?.headingDeg ?? RWY_HDG_DEG;
  const bank0 = aircraft?.bankDeg ?? 0;

  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;

  const blowToRad = degToRad((windFromDeg + 180) % 360);
  const wxFtps = ktToFtps(windKt) * Math.sin(blowToRad);
  const wyFtps = ktToFtps(windKt) * Math.cos(blowToRad);

  const dxThresh = x0 - HIGH_KEY_PT.x;
  const dyThresh = y0 - HIGH_KEY_PT.y;
  const distAlongRwy = dxThresh * UX_RWY + dyThresh * UY_RWY;
  const distCrossRwy = dxThresh * NX_RWY + dyThresh * NY_RWY;
  const dHdgRwy = Math.abs(wrapDeg180(hdg0 - RWY_HDG_DEG));
  const dwTrackDeg = (RWY_HDG_DEG + 180) % 360; // 118°
  const dHdgDw = Math.abs(wrapDeg180(hdg0 - dwTrackDeg));

  // Closed Pattern classification:
  // - On runway/upwind before departure end: distAlongRwy between -200 and 8,050 ft and within runway corridor
  const isUpwindBeforeDep = distAlongRwy >= -200 && distAlongRwy < 8050 && Math.abs(distCrossRwy) < 1500 && dHdgRwy < 60;
  // - At or past departure end: distAlongRwy >= 8,000 ft and aligned with runway
  const isUpwindPastDep = dHdgRwy < 60 && distCrossRwy > -3000 && distCrossRwy < 2500 && distAlongRwy >= 8000;
  // - On downwind leg: south of runway and aligned with downwind track
  const isOnDownwind = distCrossRwy < -1500 && dHdgDw < 60;

  const tasClimbKt = iasToTasKt(140, Math.max(alt0, 3500));
  const vClimbFtps = ktToFtps(tasClimbKt);
  const climbBankDeg = options.climbBankDeg ?? 40;
  const baseBankDeg = options.baseBankDeg ?? 38;

  // 1. Target Rollout Point on extended runway centerline upstream of RUN_IN_PT
  const leadRolloutFt = options.leadRolloutFt ?? 1000;
  const rolloutPt = {
    x: RUN_IN_PT.x - leadRolloutFt * UX_RWY,
    y: RUN_IN_PT.y - leadRolloutFt * UY_RWY,
    alt: 5000,
    kt: 140,
  };

  // 2. Base-to-Final Turn Arc (Backward target inversion per Pillar 3)
  const wtRwy = windTriangle(RWY_HDG_DEG, Math.max(1, iasToTasKt(140, 5000)), windFromDeg, windKt);
  const rwyHdgWithCrab = wtRwy.canHoldTrack ? wtRwy.headingDeg : RWY_HDG_DEG;

  const wtDw = windTriangle(dwTrackDeg, Math.max(1, iasToTasKt(140, 5000)), windFromDeg, windKt);
  const dwHdgWithCrab = wtDw.canHoldTrack ? wtDw.headingDeg : dwTrackDeg;

  const tasBaseKt = iasToTasKt(140, 5000);
  const vBaseFtps = ktToFtps(tasBaseKt);
  const omegaBase = (G_ACCEL * Math.tan(degToRad(baseBankDeg))) / vBaseFtps;
  const omegaBaseDps = radToDeg(omegaBase);

  const baseTurnPts = [];
  const dtTurn = 0.5;
  let turnAccum = 0;
  const totalBaseTurnDeg = 180;
  let curX = rolloutPt.x;
  let curY = rolloutPt.y;
  let curHdg = rwyHdgWithCrab;

  baseTurnPts.push({
    x: curX,
    y: curY,
    alt: 5000,
    kt: 140,
    headingDeg: curHdg,
    bankDeg: 0,
    g: 1.0,
    phase: 'climb_high_key',
    label: 'Base Rollout',
    pitchDeg: 0,
  });

  while (turnAccum < totalBaseTurnDeg) {
    const dDeg = Math.min(omegaBaseDps * dtTurn, totalBaseTurnDeg - turnAccum);
    turnAccum += dDeg;
    const prevHdg = (curHdg + dDeg) % 360;
    const midHdgRad = degToRad((curHdg + dDeg * 0.5) % 360);
    const vgx = vBaseFtps * Math.sin(midHdgRad) + wxFtps;
    const vgy = vBaseFtps * Math.cos(midHdgRad) + wyFtps;
    curX -= vgx * dtTurn;
    curY -= vgy * dtTurn;
    curHdg = prevHdg;

    const uFwd = Math.max(0, Math.min(1, 1 - turnAccum / totalBaseTurnDeg));
    let bank = -baseBankDeg;
    if (uFwd < 0.15) {
      bank = -baseBankDeg * Math.sin((uFwd / 0.15) * (Math.PI / 2));
    } else if (uFwd > 0.85) {
      bank = -baseBankDeg * Math.sin(((1 - uFwd) / 0.15) * (Math.PI / 2));
    }
    const g = 1 / Math.cos(degToRad(Math.abs(bank)));

    baseTurnPts.push({
      x: curX,
      y: curY,
      alt: 5000,
      kt: 140,
      headingDeg: curHdg,
      bankDeg: bank,
      g,
      phase: 'climb_high_key',
      label: 'Base Turn',
      pitchDeg: 0,
    });
  }

  baseTurnPts.reverse();
  const baseEntryPt = baseTurnPts[0];

  /** @type {any} */
  const waypoints = [];

  const DEP_END_X = -4066;
  const DEP_END_Y = 681;

  let turnStartX = x0;
  let turnStartY = y0;
  let turnStartAlt = alt0;
  let turnStartHdg = hdg0;

  if (isUpwindBeforeDep) {
    // 3. Upwind Straight Departure: fly to departure end like a closed pattern
    const distToDep = Math.hypot(DEP_END_X - x0, DEP_END_Y - y0);
    const numUpwindSteps = Math.max(1, Math.ceil(distToDep / 500));
    let curAlt = alt0;
    for (let i = 0; i < numUpwindSteps; i++) {
      const u = i / numUpwindSteps;
      const x = x0 + (DEP_END_X - x0) * u;
      const y = y0 + (DEP_END_Y - y0) * u;
      const dtStep = (distToDep / numUpwindSteps) / Math.max(50, vClimbFtps);
      curAlt = Math.min(2500, curAlt + 28.0 * dtStep);
      waypoints.push({
        x,
        y,
        alt: curAlt,
        kt: 140,
        headingDeg: rwyHdgWithCrab,
        bankDeg: 0,
        g: 1.0,
        phase: 'climb_high_key',
        label: 'Upwind Departure',
        pitchDeg: 10,
      });
    }
    turnStartX = DEP_END_X;
    turnStartY = DEP_END_Y;
    turnStartAlt = Math.max(2400, curAlt);
    turnStartHdg = rwyHdgWithCrab;
  }

  let dwStartX = turnStartX;
  let dwStartY = turnStartY;
  let dwStartAlt = turnStartAlt;

  if (isUpwindBeforeDep || isUpwindPastDep) {
    // 4. Climbing Turn into Downwind starting at departure end (or current past-departure position)
    const climbPts = [];
    let curClimbX = turnStartX;
    let curClimbY = turnStartY;
    let curClimbAlt = turnStartAlt;
    let curClimbHdg = turnStartHdg;
    let climbTurnAccum = 0;
    const targetClimbTurnDeg = Math.abs(wrapDeg180(dwHdgWithCrab - turnStartHdg)) || 180;
    const omegaClimb = (G_ACCEL * Math.tan(degToRad(climbBankDeg))) / vClimbFtps;
    const omegaClimbDps = radToDeg(omegaClimb);

    climbPts.push({
      x: curClimbX,
      y: curClimbY,
      alt: curClimbAlt,
      kt: 140,
      headingDeg: curClimbHdg,
      bankDeg: 0,
      g: 1.0,
      phase: 'climb_high_key',
      label: 'Climb Turn Entry',
      pitchDeg: calcHighKeyPitch(curClimbAlt, 10),
    });

    while (climbTurnAccum < targetClimbTurnDeg) {
      const dDeg = Math.min(omegaClimbDps * dtTurn, targetClimbTurnDeg - climbTurnAccum);
      climbTurnAccum += dDeg;
      const nextHdg = (curClimbHdg - dDeg + 360) % 360;
      const midHdgRad = degToRad((curClimbHdg - dDeg * 0.5 + 360) % 360);
      const vgx = vClimbFtps * Math.sin(midHdgRad) + wxFtps;
      const vgy = vClimbFtps * Math.cos(midHdgRad) + wyFtps;

      curClimbX += vgx * dtTurn;
      curClimbY += vgy * dtTurn;
      curClimbHdg = nextHdg;

      const pitch = calcHighKeyPitch(curClimbAlt, 10);
      curClimbAlt = Math.min(5000, curClimbAlt + 28.0 * (pitch / 10.0) * dtTurn);

      const uTurn = climbTurnAccum / targetClimbTurnDeg;
      let bank = -climbBankDeg;
      if (uTurn < 0.15) {
        bank = -climbBankDeg * Math.sin((uTurn / 0.15) * (Math.PI / 2));
      } else if (uTurn > 0.85) {
        bank = -climbBankDeg * Math.sin(((1 - uTurn) / 0.15) * (Math.PI / 2));
      }
      const g = 1 / Math.cos(degToRad(Math.abs(bank)));

      climbPts.push({
        x: curClimbX,
        y: curClimbY,
        alt: curClimbAlt,
        kt: 140,
        headingDeg: curClimbHdg,
        bankDeg: bank,
        g,
        phase: 'climb_high_key',
        label: 'Climbing Turn',
        pitchDeg: pitch,
      });
    }

    waypoints.push(...climbPts);
    dwStartX = curClimbX;
    dwStartY = curClimbY;
    dwStartAlt = curClimbAlt;
  } else if (!isOnDownwind) {
    // 5. South/Southeast Approach: curve directly onto extended runway centerline
    const leadFt = 2500;
    const interceptPt = {
      x: RUN_IN_PT.x - leadFt * UX_RWY,
      y: RUN_IN_PT.y - leadFt * UY_RWY,
      alt: 5000,
      kt: 140,
    };
    const numCurveSteps = 10;
    let curAlt = alt0;
    for (let i = 0; i <= numCurveSteps; i++) {
      const u = i / numCurveSteps;
      const x = x0 + (interceptPt.x - x0) * u;
      const y = y0 + (interceptPt.y - y0) * u;
      const pitch = calcHighKeyPitch(curAlt, 10);
      curAlt = Math.min(5000, curAlt + (5000 - alt0) * (1 / numCurveSteps));

      const hdg = (hdg0 + wrapDeg180(rwyHdgWithCrab - hdg0) * u + 360) % 360;
      const bank = (i > 0 && i < numCurveSteps) ? wrapDeg180(rwyHdgWithCrab - hdg0) * 0.5 : 0;

      waypoints.push({
        x,
        y,
        alt: curAlt,
        kt: 140,
        headingDeg: hdg,
        bankDeg: bank,
        g: 1.0,
        phase: curAlt >= 4950 ? 'downwind' : 'climb_high_key',
        label: 'Intercept Curve',
        pitchDeg: pitch,
      });
    }

    const distToRunIn = Math.hypot(RUN_IN_PT.x - interceptPt.x, RUN_IN_PT.y - interceptPt.y);
    const numSteps = Math.max(2, Math.ceil(distToRunIn / 500));
    for (let i = 1; i <= numSteps; i++) {
      const u = i / numSteps;
      waypoints.push({
        x: interceptPt.x + (RUN_IN_PT.x - interceptPt.x) * u,
        y: interceptPt.y + (RUN_IN_PT.y - interceptPt.y) * u,
        alt: 5000,
        kt: 140,
        headingDeg: rwyHdgWithCrab,
        bankDeg: 0,
        g: 1.0,
        phase: 'high_key_run_in',
        label: 'Run-in Approach',
        pitchDeg: 0,
      });
    }

    // 1/8 NM straight run-in to HIGH_KEY_PT
    const numRunInSteps = 6;
    for (let i = 1; i <= numRunInSteps; i++) {
      const u = i / numRunInSteps;
      const kt = 140 - 20 * u;
      const wtStep = windTriangle(RWY_HDG_DEG, Math.max(1, iasToTasKt(kt, 5000)), windFromDeg, windKt);
      const stepHdg = wtStep.canHoldTrack ? wtStep.headingDeg : RWY_HDG_DEG;
      const isEnd = i === numRunInSteps;

      waypoints.push({
        x: RUN_IN_PT.x + (HIGH_KEY_PT.x - RUN_IN_PT.x) * u,
        y: RUN_IN_PT.y + (HIGH_KEY_PT.y - RUN_IN_PT.y) * u,
        alt: 5000,
        kt,
        headingDeg: stepHdg,
        bankDeg: 0,
        g: 1.0,
        phase: isEnd ? 'pfl_high_key' : 'high_key_run_in',
        label: isEnd ? 'High Key' : '1/8 NM Run-in',
        tag: isEnd ? 'high_key' : undefined,
        pitchDeg: 0,
      });
    }

    for (const wp of waypoints) {
      wp.kias = wp.kt;
      wp.mode = 'rails';
      wp.engineFailed = false;
    }

    waypoints.id = 'HIGH_KEY_APPROACH';
    waypoints.model = 'KIN';
    waypoints.loop = false;
    waypoints.waypoints = waypoints;
    waypoints.points = waypoints;

    return waypoints;
  }

  // 6. Downwind Leg connecting to baseEntryPt
  const distDw = Math.hypot(baseEntryPt.x - dwStartX, baseEntryPt.y - dwStartY);
  let curDwAlt = dwStartAlt;
  if (distDw > 100) {
    const numDwSteps = Math.max(2, Math.ceil(distDw / 800));
    for (let i = (waypoints.length > 0 ? 1 : 0); i < numDwSteps; i++) {
      const u = i / numDwSteps;
      const x = dwStartX + (baseEntryPt.x - dwStartX) * u;
      const y = dwStartY + (baseEntryPt.y - dwStartY) * u;
      const pitch = calcHighKeyPitch(curDwAlt, 10);
      const dtStep = (distDw / numDwSteps) / Math.max(50, vClimbFtps);
      curDwAlt = Math.min(5000, curDwAlt + 28.0 * (pitch / 10.0) * dtStep);

      waypoints.push({
        x,
        y,
        alt: curDwAlt,
        kt: 140,
        headingDeg: dwHdgWithCrab,
        bankDeg: 0,
        g: 1.0,
        phase: 'climb_high_key',
        label: 'High Key Downwind',
        pitchDeg: pitch,
      });
    }
  }

  // 7. Base Turn Arc
  if (baseTurnPts.length > 0) {
    const startBaseAlt = curDwAlt;
    for (let k = 0; k < baseTurnPts.length; k++) {
      const u = k / Math.max(1, baseTurnPts.length - 1);
      const alt = Math.min(5000, Math.round(startBaseAlt + (5000 - startBaseAlt) * u));
      baseTurnPts[k].alt = alt;
      baseTurnPts[k].pitchDeg = calcHighKeyPitch(alt, 10);
    }
    waypoints.push(...baseTurnPts);
  }

  // 8. Straight Run-in Approach Leg: rolloutPt to RUN_IN_PT
  const distToRunIn = Math.hypot(RUN_IN_PT.x - rolloutPt.x, RUN_IN_PT.y - rolloutPt.y);
  const numApproachSteps = Math.max(1, Math.ceil(distToRunIn / 500));
  for (let i = 1; i <= numApproachSteps; i++) {
    const u = i / numApproachSteps;
    waypoints.push({
      x: rolloutPt.x + (RUN_IN_PT.x - rolloutPt.x) * u,
      y: rolloutPt.y + (RUN_IN_PT.y - rolloutPt.y) * u,
      alt: 5000,
      kt: 140,
      headingDeg: rwyHdgWithCrab,
      bankDeg: 0,
      g: 1.0,
      phase: 'high_key_run_in',
      label: 'Run-in Approach',
      pitchDeg: 0,
    });
  }

  // 9. 1/8 NM straight run-in: RUN_IN_PT to HIGH_KEY_PT decelerating 140 -> 120 KIAS
  const numRunInSteps = 6;
  for (let i = 1; i <= numRunInSteps; i++) {
    const u = i / numRunInSteps;
    const kt = 140 - 20 * u;
    const wtStep = windTriangle(RWY_HDG_DEG, Math.max(1, iasToTasKt(kt, 5000)), windFromDeg, windKt);
    const stepHdg = wtStep.canHoldTrack ? wtStep.headingDeg : RWY_HDG_DEG;
    const isEnd = i === numRunInSteps;

    waypoints.push({
      x: RUN_IN_PT.x + (HIGH_KEY_PT.x - RUN_IN_PT.x) * u,
      y: RUN_IN_PT.y + (HIGH_KEY_PT.y - RUN_IN_PT.y) * u,
      alt: 5000,
      kt,
      headingDeg: stepHdg,
      bankDeg: 0,
      g: 1.0,
      phase: isEnd ? 'pfl_high_key' : 'high_key_run_in',
      label: isEnd ? 'High Key' : '1/8 NM Run-in',
      tag: isEnd ? 'high_key' : undefined,
      pitchDeg: 0,
    });
  }

  // Universal Forward Tangent Guard (Pillar 1):
  // Ensure every waypoint's nose strictly points along the forward velocity vector (with wind crab)
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p0 = waypoints[i];
    const p1 = waypoints[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    if (Math.hypot(dx, dy) > 0.5) {
      const segTrack = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      const tas = iasToTasKt(p0.kt ?? p0.kias ?? 140, p0.alt ?? 5000);
      const wt = windTriangle(segTrack, Math.max(1, tas), windFromDeg, windKt);
      p0.headingDeg = wt.canHoldTrack ? wt.headingDeg : segTrack;
    }
  }
  if (waypoints.length > 1) {
    waypoints[waypoints.length - 1].headingDeg = waypoints[waypoints.length - 2].headingDeg;
  }

  for (const wp of waypoints) {
    wp.kias = wp.kt;
    wp.mode = 'rails';
    wp.engineFailed = false;
  }

  waypoints.id = 'HIGH_KEY_APPROACH';
  waypoints.model = 'KIN';
  waypoints.loop = false;
  waypoints.waypoints = waypoints;
  waypoints.points = waypoints;

  return waypoints;
}

/**
 * Synthesizes a unified, end-to-end kinematic rail for High Key:
 * Approach (climb, downwind, base turn, run-in on 298°) + 360° PFL spiral to touchdown.
 *
 * @param {Object} aircraft - Aircraft state
 * @param {Object} [env=null] - Wind environment
 * @param {Object} [options={}] - Options
 * @returns {Array<Object>} Unified kinematic rail
 */
export function buildFullHighKeyRail(aircraft, env = null, options = {}) {
  const distToHk = Math.hypot(HIGH_KEY_PT.x - (aircraft.x ?? 0), HIGH_KEY_PT.y - (aircraft.y ?? 0));
  const alt = aircraft.alt ?? 0;
  if (distToHk <= 1500 && alt >= 4750) {
    const directRail = buildPflRail(aircraft, env, { targetKey: 'high_key', forceHighKey: true, ...options });
    directRail.routeId = 'PFL_HIGH_KEY';
    return directRail;
  }

  const approachRaw = buildHighKeyApproachRail(aircraft, env, options);
  const approach = densifyRail(approachRaw, 19);
  for (const wp of approach) {
    wp.engineFailed = false;
  }
  if (approach.length > 0) {
    approach[approach.length - 1].tag = 'high_key';
    approach[approach.length - 1].phase = 'pfl_high_key';
  }

  const hkAircraft = {
    x: HIGH_KEY_PT.x,
    y: HIGH_KEY_PT.y,
    alt: 5000,
    kias: 120,
    headingDeg: RWY_HDG_DEG,
  };
  const pfl = buildPflRail(hkAircraft, env, { targetKey: 'high_key', forceHighKey: true, ...options });

  // Stitch approach (omitting duplicate last point) + pfl (starts at High Key with tag: 'high_key')
  const fullRail = /** @type {any} */ (approach.length > 1 ? [...approach.slice(0, -1), ...pfl] : [...pfl]);

  let cumDist = 0;
  if (fullRail.length > 0) {
    fullRail[0].cumDistFt = 0;
    for (let i = 1; i < fullRail.length; i++) {
      const prev = fullRail[i - 1];
      const cur = fullRail[i];
      cumDist += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      cur.cumDistFt = Math.round(cumDist * 10) / 10;
    }
  }
  fullRail.totalLengthFt = Math.round(cumDist * 10) / 10;

  fullRail.id = 'PFL_RAIL';
  fullRail.routeId = 'PFL_HIGH_KEY';
  fullRail.model = 'KIN';
  fullRail.loop = false;
  fullRail.kind = 'pfl';
  fullRail.waypoints = fullRail;
  fullRail.points = fullRail;
  fullRail.classification = 'high_key';
  fullRail.bankDeg = pfl.bankDeg ?? 30;
  fullRail.energyMargin = pfl.energyMargin;

  return fullRail;
}

/**
 * Finds the closest waypoint index and lookahead guidance waypoint along a rail.
 *
 * @param {Array<Object>} rail - Array of waypoints
 * @param {number} currentX - Current X position in feet
 * @param {number} currentY - Current Y position in feet
 * @param {number} [lookaheadFt=800] - Lookahead distance in feet
 * @returns {{closestIdx: number, lookaheadIdx: number, targetWp: Object, closestWp: Object}}
 */
export function getRailGuidancePoint(rail, currentX, currentY, lookaheadFt = 800) {
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < rail.length; i++) {
    const dx = rail[i].x - currentX;
    const dy = rail[i].y - currentY;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }

  let accumDist = 0;
  let lookIdx = bestIdx;
  while (lookIdx < rail.length - 1 && accumDist < lookaheadFt) {
    const p1 = rail[lookIdx];
    const p2 = rail[lookIdx + 1];
    accumDist += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    lookIdx++;
  }

  return { closestIdx: bestIdx, lookaheadIdx: lookIdx, targetWp: rail[lookIdx], closestWp: rail[bestIdx] };
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
 *   - At High Key (within 150 ft of 3104, -3194), transitions to PFL descent phase (`pfl_high_key` / Low Key spiral)
 *     and enters RAIL mode.
 *
 * @param {Object} a - Aircraft state object
 * @param {Object} [route=null] - Active route
 * @param {Object} [env=null] - Wind environment
 * @param {number} [stepDt=0.05] - Timestep in seconds
 * @param {Object} [routeOptions={}] - Route calculation options
 */
export function stepHighKey(a, route = null, env = null, stepDt = 0.05, routeOptions = {}) {
  if (!a) return;
  if (a._highKeyPhase === 'complete' || a.phase === 'pfl_high_key') return;

  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const alt = a.alt ?? 3500;
  const iasKt = a.iasKt ?? 140;
  const tasKt = iasToTasKt(iasKt, alt);

  // High Key procedures maintain engine power until High Key is reached
  a.engineFailed = false;

  // Build or retrieve approach rail
  if (!a._highKeyRail) {
    a._highKeyRail = buildHighKeyApproachRail(a, env, routeOptions);
    a._highKeyRailIdx = 0;
    a.navPlan = {
      id: 'HIGH_KEY_APPROACH',
      model: 'KIN',
      loop: false,
      waypoints: [],
    };
  }

  const rail = a._highKeyRail;
  const { targetWp, closestWp, closestIdx } = getRailGuidancePoint(rail, a.x ?? 0, a.y ?? 0, 800);
  a._highKeyRailIdx = closestIdx;
  a.waypointIndex = closestIdx;

  const dx = (a.x ?? 0) - RUN_IN_PT.x;
  const dy = (a.y ?? 0) - RUN_IN_PT.y;
  const alongTrack = dx * UX_RWY + dy * UY_RWY;
  const crossTrack = dx * NX_RWY + dy * NY_RWY;
  const deltaHdgRwy = Math.abs(wrapDeg180((a.headingDeg ?? 0) - RWY_HDG_DEG));
  const distToRunIn = Math.hypot(dx, dy);
  const distToHighKey = Math.hypot(HIGH_KEY_PT.x - (a.x ?? 0), HIGH_KEY_PT.y - (a.y ?? 0));

  const climbPitch = a.highKeyClimbPitchDeg ?? a.closedPatternPitchDeg ?? 10;
  const nominalBank = a.highKeyBankDeg ?? a.closedPatternBankDeg ?? 40;

  // Determine or advance internal High Key phase
  if (alt >= 4950 && a._highKeyPhase === 1) {
    a._highKeyPhase = 2;
  }

  const inCorridor = (alongTrack >= -50 && alongTrack <= RUN_IN_LEN_FT + 100 && Math.abs(crossTrack) <= 200 && deltaHdgRwy <= 30 && alt >= 4850) ||
                     (distToRunIn <= 200 && deltaHdgRwy <= 30 && alt >= 4850);

  if (inCorridor) {
    a._highKeyPhase = 3;
    a.phase = 'high_key_run_in';
  } else if (a._highKeyPhase === undefined) {
    a._highKeyPhase = alt < 4950 ? 1 : 2;
    a.phase = closestWp.phase ?? 'climb_high_key';
  }

  a.targetAltFt = 5000;
  a.pitchDeg = a._highKeyPhase === 3 ? 0 : calcHighKeyPitch(alt, climbPitch);

  // ── PHASE 3: 1/8 NM RUN-IN DECELERATION ──────────────────────────────────────
  if (a._highKeyPhase === 3) {
    a.phase = 'high_key_run_in';
    a.targetSpeedKt = calcHighKeyTargetSpeed(3, alongTrack);
    a.desiredHeadingDeg = RWY_HDG_DEG;
    a.targetBankDeg = 0;
    a.pitchDeg = 0;

    const wtRwy = windTriangle(RWY_HDG_DEG, Math.max(1, tasKt), windFromDeg, windKt);
    a.desiredHeadingDeg = wtRwy.canHoldTrack ? wtRwy.headingDeg : RWY_HDG_DEG;

    if (a.iasKt !== undefined && a.iasKt > a.targetSpeedKt) {
      a.iasKt = Math.max(a.targetSpeedKt, a.iasKt - 6.7 * stepDt);
      a.kt = a.iasKt;
    }
  } else {
    // ── PHASE 1 & 2: KINEMATIC CLIMB & ARC INTERCEPT ─────────────────────────────
    a.targetSpeedKt = 140;

    const dxT = targetWp.x - (a.x ?? 0);
    const dyT = targetWp.y - (a.y ?? 0);
    const trk = (Math.atan2(dxT, dyT) * 180 / Math.PI + 360) % 360;
    const wt = windTriangle(trk, Math.max(1, tasKt), windFromDeg, windKt);
    a.desiredHeadingDeg = wt.canHoldTrack ? wt.headingDeg : trk;

    const deltaHdg = wrapDeg180(a.desiredHeadingDeg - (a.headingDeg ?? 0));
    if (Math.abs(deltaHdg) <= 2.5) {
      a.targetBankDeg = 0;
    } else if (Math.abs(deltaHdg) < 25) {
      const maxB = Math.abs(targetWp.bankDeg) || nominalBank;
      a.targetBankDeg = Math.max(-maxB, Math.min(maxB, deltaHdg * 1.8));
    } else {
      const isSlice = alt >= 4700 && alt < 5000 && Math.abs(deltaHdg) > 15;
      const maxB = isSlice ? Math.min(90, Math.abs(targetWp.bankDeg || nominalBank) + 20) : (Math.abs(targetWp.bankDeg) || nominalBank);
      a.targetBankDeg = deltaHdg < 0 ? -maxB : maxB;
    }
  }

  // ── TRANSITION: ARRIVAL AT HIGH KEY ──────────────────────────────────────────
  const reachedHighKey = distToHighKey <= 150 || (alongTrack >= RUN_IN_LEN_FT - 50 && distToHighKey <= 250);
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
    a.engineFailed = true;
    a.command = null;
    delete a._activeCommand;

    // Transition to continuous PFL kinematic rail
    const pflRail = generatePflRail(a, env, { targetKey: 'high_key' });
    if (pflRail && pflRail.length > 0) {
      a.pflRail = pflRail;
      a.pflRailIndex = 0;
      a.distFt = 0;
      a.mode = 'RAIL';
      a.routeId = 'PFL_HIGH_KEY';
      a.navPlan = null;
      a.phase = pflRail[0]?.phase || 'pfl_high_key';
      a.config = pflRail[0]?.config || 'clean';
    } else {
      const pflPlan = getNavPlan('PFL_HIGH_KEY');
      if (pflPlan) {
        a.navPlan = pflPlan;
        a.routeId = 'PFL_HIGH_KEY';
        a.waypointIndex = 0;
        a.mode = 'RAIL';
      }
    }
    return;
  }

  // If already in RAIL mode, advance position along rail directly
  if (a.mode === 'RAIL') {
    const gsFtps = ktToFtps(a.gsKt || tasKt);
    const moveDist = gsFtps * stepDt;
    const dxT = targetWp.x - (a.x ?? 0);
    const dyT = targetWp.y - (a.y ?? 0);
    const dist = Math.hypot(dxT, dyT);
    if (dist > 0.01) {
      const stepFrac = Math.min(1.0, moveDist / dist);
      a.x += dxT * stepFrac;
      a.y += dyT * stepFrac;
    }
    a.alt = closestWp.alt;
    a.iasKt = targetWp.kt;
    a.kt = targetWp.kt;
    a.headingDeg = targetWp.headingDeg;
    a.bankDeg = a.targetBankDeg;
  }
}

