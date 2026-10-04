// PFL Energy & Tangent Intercept Solver
// Authoritative requirements: Patrick's Lead Pilot Guidance (CYMJ Moose Jaw CT-156 Harvard II / SMM Chapter 13 Forced Landings)
// Governing skill: wind-shaped-flight-paths (Pillars 1–10)
// Flight physics core: src/core/t6-performance.js (zoomT6A, glideSinkFpm)

import { FT_PER_NM, ktToFtps } from '../../core/units.js';
import { degToRad, radToDeg, wrapDeg180 } from '../../core/angles.js';
import { iasToTasKt, zoomT6A } from '../../core/t6-performance.js';
import { windTriangle } from '../../core/wind.js';
import { generatePflTrack } from './route.js';

/** CYMJ Airfield ground truth constants for PFL recovery. */
export const PFL_AIRFIELD = Object.freeze({
  thresholdX: 3104,
  thresholdY: -3194,
  thresholdAlt: 1892,
  highKeyAlt: 5000,
  lowKeyAlt: 3700,
  baseKeyAlt: 2900,
  rwyHdgDeg: 298,
});

/**
 * Normalizes degrees into [0, 360).
 * @param {number} deg
 * @returns {number}
 */
function wrapDeg360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Computes arrival altitude after gliding clean (120 KIAS, feathered prop, L/D = 12.15)
 * from fromPt to toPt through the prevailing wind field.
 *
 * @param {{ x: number, y: number, alt: number }} fromPt
 * @param {{ x: number, y: number, alt?: number }} toPt
 * @param {{ windFromDeg?: number, windKt?: number }} [env]
 * @returns {number} Arrival altitude in feet MSL
 */
export function calcCleanGlideArrival(fromPt, toPt, env = null) {
  const distFt = Math.hypot(toPt.x - fromPt.x, toPt.y - fromPt.y);
  if (distFt < 1) return fromPt.alt;

  const trackDeg = wrapDeg360(Math.atan2(toPt.x - fromPt.x, toPt.y - fromPt.y) * 180 / Math.PI);
  const avgAlt = Math.max(1892, (fromPt.alt + (toPt.alt ?? 1892)) / 2);
  const tasKt = iasToTasKt(120, avgAlt);
  const wt = windTriangle(trackDeg, tasKt, env?.windFromDeg ?? 360, env?.windKt ?? 0);
  const gsKt = wt.canHoldTrack ? Math.max(10, wt.groundSpeedKt) : 10;

  // Clean glide ratio: 2.0 NM per 1,000 ft => 12.15224 ft ground per ft altitude in still air.
  // Over ground with wind: scales with ground speed / true airspeed.
  const groundGlideRatio = (2.0 * FT_PER_NM / 1000) * (gsKt / Math.max(1, tasKt));
  const altLoss = distFt / groundGlideRatio;

  return fromPt.alt - altLoss;
}

/**
 * Calculates the zoom apex or deceleration state after engine failure.
 * - Airspeed > 150 KIAS: Simultaneous zoom & turn converting kinetic energy to altitude (+700 to +1,000 ft gain),
 *   pushing over to capture best glide at 120 KIAS clean.
 * - Airspeed <= 150 KIAS: Level deceleration to 120 KIAS.
 *
 * @param {Object} aircraft - Aircraft state { x, y, alt, kias/iasKt/kt, headingDeg }
 * @param {Object} [env] - Wind environment { windFromDeg, windKt }
 * @param {Object} [options] - Tuning options { weightLb, zoomTurnRateDps }
 * @returns {{ x: number, y: number, alt: number, kias: number, headingDeg: number, gainFt: number, timeSec: number, distanceFt: number, zoomed: boolean }}
 */
export function calcZoomApex(aircraft, env = null, options = {}) {
  const x = aircraft.x ?? 0;
  const y = aircraft.y ?? 0;
  const alt = aircraft.alt ?? 3500;
  const kias = aircraft.kias ?? aircraft.iasKt ?? aircraft.kt ?? 140;
  const headingDeg = aircraft.headingDeg ?? 0;

  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const weightLb = options.weightLb ?? 5800;

  const zoomData = zoomT6A(kias, alt, weightLb);
  const timeSec = zoomData.timeSec ?? 0;
  const distanceFt = zoomData.distanceFt ?? 0;
  const gainFt = zoomData.gainFt ?? 0;

  const blowToRad = degToRad((windFromDeg + 180) % 360);
  const wxFtps = ktToFtps(windKt) * Math.sin(blowToRad);
  const wyFtps = ktToFtps(windKt) * Math.cos(blowToRad);

  if (kias > 150) {
    // Airspeed > 150 KIAS: Simultaneous zoom & turn
    // Turn toward High Key / recovery track
    const targetBearingDeg = wrapDeg360(Math.atan2(PFL_AIRFIELD.thresholdX - x, PFL_AIRFIELD.thresholdY - y) * 180 / Math.PI);
    const deltaHdg = wrapDeg180(targetBearingDeg - headingDeg);

    // Pull 2.0 G into 20° climb while banking toward recovery track (SMM Ch 13)
    const maxTurnRateDps = options.zoomTurnRateDps ?? 4.5;
    const maxTurnDeg = maxTurnRateDps * timeSec;
    const turnAmtDeg = Math.max(-maxTurnDeg, Math.min(maxTurnDeg, deltaHdg));
    const exitHeadingDeg = wrapDeg360(headingDeg + turnAmtDeg);

    // Vector advance along turn arc + wind drift
    const avgHdgRad = degToRad(wrapDeg360(headingDeg + turnAmtDeg / 2));
    const dxAir = distanceFt * Math.sin(avgHdgRad);
    const dyAir = distanceFt * Math.cos(avgHdgRad);
    const dxWind = wxFtps * timeSec;
    const dyWind = wyFtps * timeSec;

    return {
      x: x + dxAir + dxWind,
      y: y + dyAir + dyWind,
      alt: alt + gainFt,
      kias: 120,
      headingDeg: exitHeadingDeg,
      gainFt,
      timeSec,
      distanceFt,
      zoomed: true,
    };
  } else {
    // Airspeed <= 150 KIAS: Level decel to 120 KIAS (zero zoom gain)
    const hdgRad = degToRad(headingDeg);
    const dxAir = distanceFt * Math.sin(hdgRad);
    const dyAir = distanceFt * Math.cos(hdgRad);
    const dxWind = wxFtps * timeSec;
    const dyWind = wyFtps * timeSec;

    return {
      x: x + dxAir + dxWind,
      y: y + dyAir + dyWind,
      alt, // Level decel: altitude unchanged
      kias: 120,
      headingDeg,
      gainFt: 0,
      timeSec,
      distanceFt,
      zoomed: false,
    };
  }
}

/**
 * Simulates a coordinated turn from an initial state toward a target bearing,
 * returning the physical rollout position, altitude, and heading.
 *
 * @param {number} x0
 * @param {number} y0
 * @param {number} alt0
 * @param {number} hdg0
 * @param {number} targetBearingDeg
 * @param {Object} [env]
 * @param {number} [tasKt=120]
 * @param {number} [bankDeg=35]
 * @returns {{ xRoll: number, yRoll: number, zRoll: number, hdgRoll: number, turnMag: number, tTurn: number }}
 */
export function simulateTurnRollout(x0, y0, alt0, hdg0, targetBearingDeg, env = null, tasKt = 120, bankDeg = 35) {
  const deltaHdg = wrapDeg180(targetBearingDeg - hdg0);
  const turnMag = Math.abs(deltaHdg);
  if (turnMag <= 2) {
    return { xRoll: x0, yRoll: y0, zRoll: alt0, hdgRoll: hdg0, turnMag: 0, tTurn: 0 };
  }

  const turnDir = Math.sign(deltaHdg) || 1;
  const tasFtps = ktToFtps(tasKt);
  const maxBank = Math.min(60, Math.max(15, bankDeg));
  const bRad = degToRad(maxBank);
  const omega = (32.174 * Math.tan(bRad)) / Math.max(1, tasFtps);
  const tTurn = degToRad(turnMag) / omega;

  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const blowToRad = degToRad((windFromDeg + 180) % 360);
  const wxFtps = ktToFtps(windKt) * Math.sin(blowToRad);
  const wyFtps = ktToFtps(windKt) * Math.cos(blowToRad);

  const R = tasFtps / omega;
  const psi0Rad = degToRad(hdg0);
  const psiRollRad = degToRad(wrapDeg360(hdg0 + deltaHdg));

  const dxAir = R * (Math.cos(psi0Rad) - Math.cos(psiRollRad)) * turnDir;
  const dyAir = R * (Math.sin(psiRollRad) - Math.sin(psi0Rad)) * turnDir;
  const dxWind = wxFtps * tTurn;
  const dyWind = wyFtps * tTurn;

  const xRoll = x0 + dxAir + dxWind;
  const yRoll = y0 + dyAir + dyWind;
  const zRoll = alt0 - (1350 / 60) * tTurn; // 1350 fpm descent during turn
  const hdgRoll = wrapDeg360(hdg0 + deltaHdg);

  return { xRoll, yRoll, zRoll, hdgRoll, turnMag, tTurn };
}

/**
 * Evaluates the multi-variable drag & flap schedule based on arrival altitude margin Δz:
 * - Δz > +400 ft: Early Gear + Flaps TO at intercept; Flaps LDG at Base (1,850+ fpm).
 * - +150 to +400 ft: Flaps TO early at Low Key / tangent; Flaps LDG at Base (1,816 fpm).
 * - -100 to +150 ft: Standard SMM schedule (1,350 fpm).
 * - < -100 ft: Delay Gear & Flaps to glide clean (1,100 fpm Colonial/clean).
 *
 * @param {number} deltaZ - Altitude margin (arrival alt - target alt) in feet
 * @returns {{ margin: number, earlyGear: boolean, earlyFlapsTo: boolean, earlyFlapsLdg: boolean, delayFlaps: boolean, delayGear: boolean, profile: string }}
 */
export function computeDragSchedule(deltaZ) {
  return {
    margin: Math.round(deltaZ * 10) / 10,
    earlyGear: deltaZ > 400,
    earlyFlapsTo: deltaZ > 150,
    earlyFlapsLdg: deltaZ > 400,
    delayFlaps: deltaZ < -100,
    delayGear: deltaZ < -100,
    profile: deltaZ > 400 ? 'high_energy' : (deltaZ > 150 ? 'moderate_energy' : (deltaZ < -100 ? 'low_energy' : 'nominal')),
  };
}

/**
 * Scans a continuous 3D PFL track for candidate touchpoints where glide bearing matches arc heading.
 *
 * @param {Object} apex - Aircraft state
 * @param {Array<Object>} track - Discrete track waypoints along spiral curve
 * @param {Object} [env] - Wind environment
 * @param {number} [bankDeg=35] - Spiral bank angle
 * @returns {Object|null}
 */
export function findContinuousArcTangent(apex, track, env = null, bankDeg = 35) {
  const x0 = apex.x ?? 0;
  const y0 = apex.y ?? 0;
  const alt0 = apex.alt ?? 3500;
  const hdg0 = apex.headingDeg ?? 0;
  const tasKt = iasToTasKt(120, Math.max(1892, alt0));

  // 1. Proximity guard check across all track waypoints:
  // If aircraft is already within 500 ft of the arc/gate, return directLatch: true
  let closestProx = null;
  let minProxDist = Infinity;
  for (let i = 0; i < track.length; i++) {
    const p = track[i];
    const d = Math.hypot(p.x - x0, p.y - y0);
    if (d <= 500 && d < minProxDist) {
      const deltaZ = alt0 - p.alt;
      if (deltaZ >= -100) {
        minProxDist = d;
        closestProx = { point: p, index: i, deltaZ, dist: d };
      }
    }
  }

  if (closestProx) {
    const p = closestProx.point;
    return {
      directLatch: true,
      interceptDistanceFt: 0,
      joinPoint: p,
      joinIndex: closestProx.index,
      energyMargin: closestProx.deltaZ,
      tangentErrorDeg: 0,
      interceptBearingDeg: p.headingDeg,
      rolloutPt: { x: x0, y: y0, alt: alt0, headingDeg: hdg0 },
      dragSchedule: computeDragSchedule(closestProx.deltaZ),
    };
  }

  // 2. Continuous arc tangent scan along track:
  const candidates = [];
  for (let i = 0; i < track.length; i++) {
    const p = track[i];
    // Collinear tangent: turn towards the arc's heading at candidate p
    const { xRoll, yRoll, zRoll, hdgRoll, turnMag } = simulateTurnRollout(x0, y0, alt0, hdg0, p.headingDeg, env, tasKt, bankDeg);

    // Collinear intercept bearing from rollout point to candidate point
    const beta = wrapDeg360(Math.atan2(p.x - xRoll, p.y - yRoll) * 180 / Math.PI);
    const epsTangent = Math.abs(wrapDeg180(p.headingDeg - beta));
    const distIntercept = Math.hypot(p.x - xRoll, p.y - yRoll);

    // Clean glide arrival altitude
    const arrAlt = calcCleanGlideArrival({ x: xRoll, y: yRoll, alt: zRoll }, p, env);
    const deltaZ = arrAlt - p.alt;

    // Filter: tangent error <= 5° and arrival altitude margin >= -100 ft
    if (epsTangent <= 5 && deltaZ >= -100) {
      const behindPenalty = turnMag > 100 ? (turnMag - 100) * 10 : 0;
      const cost = 15 * epsTangent + 0.05 * distIntercept + 2 * turnMag + behindPenalty;
      candidates.push({
        point: p,
        index: i,
        deltaZ,
        distIntercept,
        epsTangent,
        beta,
        turnMag,
        cost,
        rolloutPt: { x: xRoll, y: yRoll, alt: zRoll, headingDeg: hdgRoll },
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.cost - b.cost);
  const best = candidates[0];

  return {
    directLatch: false,
    interceptDistanceFt: best.distIntercept,
    joinPoint: best.point,
    joinIndex: best.index,
    energyMargin: best.deltaZ,
    tangentErrorDeg: best.epsTangent,
    interceptBearingDeg: best.beta,
    rolloutPt: best.rolloutPt,
    dragSchedule: computeDragSchedule(best.deltaZ),
  };
}

/**
 * Solves the optimal tangent intercept point and recovery classification along the wind-shifted PFL spiral.
 * Supports adaptive bank angle:
 * - 35° nominal profile
 * - 40°–45° tight corner cut when low on energy to shorten track by ~1,500 ft (SMM Ch 13 doctrine).
 *
 * @param {{ x: number, y: number, alt: number, headingDeg: number, kias?: number, tag?: string, phase?: string, command?: string }} apex - Aircraft state at zoom apex
 * @param {{ windFromDeg?: number, windKt?: number }} [env] - Wind environment
 * @param {Object} [options] - Tuning options { route, bankDeg }
 * @returns {{
 *   classification: 'high_key' | 'low_key' | 'base_key' | 'direct_threshold' | 'crash_short',
 *   bankDeg: number,
 *   joinPoint: Object | null,
 *   joinIndex: number,
 *   track: Array<Object>,
 *   energyMargin: number,
 *   dragSchedule?: { margin: number, earlyGear: boolean, earlyFlapsTo: boolean, earlyFlapsLdg: boolean, delayFlaps: boolean, delayGear: boolean, profile: string },
 *   surplusOrbit: boolean,
 *   crashPoint: Object | null,
 *   directLatch?: boolean,
 *   interceptDistanceFt?: number,
 *   tangentErrorDeg?: number,
 *   interceptBearingDeg?: number,
 *   rolloutPt?: { x: number, y: number, alt: number, headingDeg: number }
 * }}
 */
export function solvePflTangent(apex, env = null, options = {}) {
  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const route = options.route ?? null;

  const TH = {
    x: PFL_AIRFIELD.thresholdX,
    y: PFL_AIRFIELD.thresholdY,
    alt: PFL_AIRFIELD.thresholdAlt,
    headingDeg: PFL_AIRFIELD.rwyHdgDeg,
  };

  const HK = {
    x: PFL_AIRFIELD.thresholdX,
    y: PFL_AIRFIELD.thresholdY,
    alt: PFL_AIRFIELD.highKeyAlt,
    headingDeg: PFL_AIRFIELD.rwyHdgDeg,
  };

  const chosenBank = options.bankDeg ?? 35;
  const track35 = generatePflTrack(route, windFromDeg, windKt, /** @type {any} */ ({ bankDeg: chosenBank }));

  // ── 0. FINAL APPROACH ALIGNMENT CHECK ──────────────────────────────────────
  // If aircraft is already aligned on final approach (heading ~298°) and positioned
  // southeast of the threshold, it is past the pattern and should glide direct.
  const trackToTh = wrapDeg360(Math.atan2(TH.x - apex.x, TH.y - apex.y) * 180 / Math.PI);
  const diffHdgToRwy = Math.abs(wrapDeg180(apex.headingDeg - PFL_AIRFIELD.rwyHdgDeg));
  const diffTrackToRwy = Math.abs(wrapDeg180(trackToTh - PFL_AIRFIELD.rwyHdgDeg));
  const diffHdgToTrack = Math.abs(wrapDeg180(apex.headingDeg - trackToTh));
  const isAlignedFinal = (diffHdgToRwy <= 45 || diffHdgToTrack <= 45) && diffTrackToRwy <= 50 && apex.alt < 3500;
  if (isAlignedFinal) {
    const arrAltTh = calcCleanGlideArrival(apex, TH, env);
    if (arrAltTh >= PFL_AIRFIELD.thresholdAlt) {
      const thIdx = track35.length - 1;
      const margin = arrAltTh - PFL_AIRFIELD.thresholdAlt;
      const directLatch = Math.hypot(TH.x - apex.x, TH.y - apex.y) <= 500;
      return {
        classification: 'direct_threshold',
        bankDeg: chosenBank,
        joinPoint: track35[thIdx],
        joinIndex: thIdx,
        track: track35,
        energyMargin: margin,
        dragSchedule: computeDragSchedule(margin),
        surplusOrbit: false,
        crashPoint: null,
        directLatch,
        interceptDistanceFt: directLatch ? 0 : Math.hypot(TH.x - apex.x, TH.y - apex.y),
        tangentErrorDeg: diffHdgToRwy,
        interceptBearingDeg: trackToTh,
        rolloutPt: { x: apex.x, y: apex.y, alt: apex.alt, headingDeg: apex.headingDeg },
      };
    }
  }

  // ── 1. HIGH KEY EVALUATION ──────────────────────────────────────────────────
  const distToHk = Math.hypot(HK.x - apex.x, HK.y - apex.y);
  const isAtHk = distToHk <= 800 && apex.alt >= 4750;
  const isExplicitHk = options.targetKey === 'high_key' ||
                       Boolean(options.forceHighKey) ||
                       apex.tag === 'high_key' ||
                       apex.phase === 'pfl_high_key' ||
                       apex.command === 'climb_high_key';
  const arrAltHk = calcCleanGlideArrival(apex, HK, env);
  const isHkCorridor = diffHdgToRwy <= 20 && distToHk <= 3000 && arrAltHk >= (PFL_AIRFIELD.highKeyAlt - 150);

  if (isAtHk || isExplicitHk || isHkCorridor) {
    const margin = arrAltHk - PFL_AIRFIELD.highKeyAlt;
    const directLatch = distToHk <= 500;
    return {
      classification: 'high_key',
      bankDeg: chosenBank,
      joinPoint: track35[0],
      joinIndex: 0,
      track: track35,
      energyMargin: margin,
      dragSchedule: computeDragSchedule(margin),
      surplusOrbit: arrAltHk > 5300,
      crashPoint: null,
      directLatch,
      interceptDistanceFt: directLatch ? 0 : distToHk,
      tangentErrorDeg: Math.abs(wrapDeg180(PFL_AIRFIELD.rwyHdgDeg - apex.headingDeg)),
      interceptBearingDeg: wrapDeg360(Math.atan2(HK.x - apex.x, HK.y - apex.y) * 180 / Math.PI),
      rolloutPt: { x: apex.x, y: apex.y, alt: apex.alt, headingDeg: apex.headingDeg },
    };
  }

  // ── 2. DOWNWIND / LOW KEY EVALUATION (NOMINAL 35° BANK) ─────────────────────
  // Low Key nominal is 3,700 ft MSL. Safe arrival gate is >= 3,300 ft MSL (SMM Ch 13: 1,400 ft AGL).
  const lowKeyPt = track35.find((p) => p.tag === 'low_key') || track35.find((p) => p.phase === 'pfl_low_key') || track35[198];
  const lowKeyIdx = track35.indexOf(lowKeyPt);
  const arrAltLk = calcCleanGlideArrival(apex, lowKeyPt, env);
  const isPastLowKey = apex.y < (lowKeyPt.y - 300);
  const diffHdgToDownwind = Math.abs(wrapDeg180(apex.headingDeg - 118));
  const isDownwindTrack = diffHdgToDownwind <= 30;

  if (isDownwindTrack && arrAltLk >= 3300 && !isPastLowKey) {
    const margin = arrAltLk - lowKeyPt.alt;
    const distToLk = Math.hypot(lowKeyPt.x - apex.x, lowKeyPt.y - apex.y);
    const directLatch = distToLk <= 500;
    return {
      classification: 'low_key',
      bankDeg: 35,
      joinPoint: lowKeyPt,
      joinIndex: lowKeyIdx >= 0 ? lowKeyIdx : 198,
      track: track35,
      energyMargin: margin,
      dragSchedule: computeDragSchedule(margin),
      surplusOrbit: false,
      crashPoint: null,
      directLatch,
      interceptDistanceFt: directLatch ? 0 : distToLk,
      tangentErrorDeg: Math.abs(wrapDeg180(lowKeyPt.headingDeg - apex.headingDeg)),
      interceptBearingDeg: wrapDeg360(Math.atan2(lowKeyPt.x - apex.x, lowKeyPt.y - apex.y) * 180 / Math.PI),
      rolloutPt: { x: apex.x, y: apex.y, alt: apex.alt, headingDeg: apex.headingDeg },
    };
  }

  // ── 3. CONTINUOUS ARC TANGENT SEARCH (ANYWHERE ALONG THE SPIRAL) ───────────
  const track45 = generatePflTrack(route, windFromDeg, windKt, /** @type {any} */ ({ bankDeg: 45 }));
  const isLowEnergy = (arrAltLk < 3500 && apex.alt >= 2600) || isPastLowKey;
  const initialBank = isLowEnergy ? 45 : chosenBank;
  const initialTrack = isLowEnergy ? track45 : track35;
  const secondaryBank = isLowEnergy ? chosenBank : 45;
  const secondaryTrack = isLowEnergy ? track35 : track45;

  let arcSolution = findContinuousArcTangent(apex, initialTrack, env, initialBank);
  let finalTrack = initialTrack;
  let finalBank = initialBank;

  if (!arcSolution || arcSolution.energyMargin < -50) {
    const altSolution = findContinuousArcTangent(apex, secondaryTrack, env, secondaryBank);
    if (altSolution && (altSolution.energyMargin >= -50 || !arcSolution || altSolution.energyMargin > arcSolution.energyMargin)) {
      arcSolution = altSolution;
      finalTrack = secondaryTrack;
      finalBank = secondaryBank;
    }
  }

  if (arcSolution) {
    const joinPt = { ...arcSolution.joinPoint };
    /** @type {'high_key' | 'low_key' | 'base_key' | 'direct_threshold' | 'crash_short'} */
    let classification = 'low_key';

    if (arcSolution.joinIndex === 0 || joinPt.tag === 'high_key' || joinPt.phase === 'pfl_high_key') {
      classification = 'high_key';
      joinPt.tag = 'high_key';
    } else if (finalBank === 45 || joinPt.tag === 'base_key' || joinPt.phase === 'pfl_base_key') {
      classification = 'base_key';
      joinPt.tag = 'base_key';
    } else if (joinPt.phase === 'pfl_low_key' || joinPt.tag === 'low_key' || joinPt.tag === 'downwind') {
      classification = 'low_key';
      joinPt.tag = 'low_key';
    } else if (joinPt.phase === 'pfl_final' || joinPt.tag === 'final' || joinPt.tag === 'threshold') {
      classification = 'direct_threshold';
      joinPt.tag = 'threshold';
    }

    return {
      classification,
      bankDeg: finalBank,
      joinPoint: joinPt,
      joinIndex: arcSolution.joinIndex,
      track: finalTrack,
      energyMargin: arcSolution.energyMargin,
      dragSchedule: arcSolution.dragSchedule,
      surplusOrbit: false,
      crashPoint: null,
      directLatch: arcSolution.directLatch,
      interceptDistanceFt: arcSolution.interceptDistanceFt,
      tangentErrorDeg: arcSolution.tangentErrorDeg,
      interceptBearingDeg: arcSolution.interceptBearingDeg,
      rolloutPt: arcSolution.rolloutPt,
    };
  }

  // ── 4. BASE KEY / CORNER CUTTING (45° BANK SMM CH 13 DOCTRINE) ──────────────
  // If approaching low on energy (arrAltLk < 3500) or already past Low Key,
  // pilot tightens final turn arc to 40°–45° bank, cutting the corner to shorten track.
  const isLowEnergyCornerCut = (arrAltLk < 3500 && apex.alt >= 2600) || isPastLowKey;
  const chosenTrack = isLowEnergyCornerCut ? track45 : track35;
  const cornerBank = isLowEnergyCornerCut ? 45 : chosenBank;

  const baseCandidates = [];
  for (let i = 0; i < chosenTrack.length; i++) {
    const p = chosenTrack[i];
    if (p.phase === 'pfl_base_key' || p.tag === 'base_key') {
      const arrAlt = calcCleanGlideArrival(apex, p, env);
      const margin = arrAlt - p.alt;
      if (margin >= -50) {
        const remainingDistFt = Math.hypot(TH.x - p.x, TH.y - p.y);
        const reqAlt = PFL_AIRFIELD.thresholdAlt + (remainingDistFt / (1.5 * FT_PER_NM / 1000));
        if (arrAlt >= (reqAlt - 150)) {
          const d = Math.hypot(p.x - apex.x, p.y - apex.y);
          const brg = wrapDeg360(Math.atan2(p.x - apex.x, p.y - apex.y) * 180 / Math.PI);
          const dHdgBrg = Math.abs(wrapDeg180(brg - apex.headingDeg));
          const dHdgTrk = Math.abs(wrapDeg180(p.headingDeg - brg));

          // Disqualify rearward key candidates (dHdgBrg > 90°) if aircraft can make the threshold or is close to the field
          const arrAltTh = calcCleanGlideArrival(apex, TH, env);
          const canReachTh = arrAltTh >= PFL_AIRFIELD.thresholdAlt;
          if (dHdgBrg > 90 && (canReachTh || d <= 3 * FT_PER_NM)) {
            continue;
          }

          const behindPenalty = dHdgBrg > 90 ? 10000 : 0;
          const cost = d + 800 * (dHdgBrg / 90) + 800 * (dHdgTrk / 90) + behindPenalty;
          baseCandidates.push({ index: i, point: p, margin, d, cost, arrAlt, brg, dHdgTrk });
        }
      }
    }
  }

  if (baseCandidates.length > 0) {
    baseCandidates.sort((a, b) => a.cost - b.cost);
    const best = baseCandidates[0];
    const margin = best.margin;
    const directLatch = best.d <= 500;

    return {
      classification: 'base_key',
      bankDeg: cornerBank,
      joinPoint: best.point,
      joinIndex: best.index,
      track: chosenTrack,
      energyMargin: margin,
      dragSchedule: computeDragSchedule(margin),
      surplusOrbit: false,
      crashPoint: null,
      directLatch,
      interceptDistanceFt: directLatch ? 0 : best.d,
      tangentErrorDeg: best.dHdgTrk,
      interceptBearingDeg: best.brg,
      rolloutPt: { x: apex.x, y: apex.y, alt: apex.alt, headingDeg: apex.headingDeg },
    };
  }

  // ── 4. DIRECT THRESHOLD EVALUATION ──────────────────────────────────────────
  // Cannot make any key point on the spiral. Glides clean directly to the threshold.
  const arrAltTh = calcCleanGlideArrival(apex, TH, env);
  if (arrAltTh >= PFL_AIRFIELD.thresholdAlt) {
    const thIdx = track35.length - 1;
    const margin = arrAltTh - PFL_AIRFIELD.thresholdAlt;
    const directLatch = Math.hypot(TH.x - apex.x, TH.y - apex.y) <= 500;
    return {
      classification: 'direct_threshold',
      bankDeg: chosenBank,
      joinPoint: track35[thIdx],
      joinIndex: thIdx,
      track: track35,
      energyMargin: margin,
      dragSchedule: computeDragSchedule(margin),
      surplusOrbit: false,
      crashPoint: null,
      directLatch,
      interceptDistanceFt: directLatch ? 0 : Math.hypot(TH.x - apex.x, TH.y - apex.y),
      tangentErrorDeg: diffHdgToRwy,
      interceptBearingDeg: trackToTh,
      rolloutPt: { x: apex.x, y: apex.y, alt: apex.alt, headingDeg: apex.headingDeg },
    };
  }

  // ── 5. UNRECOVERABLE / CRASH SHORT ──────────────────────────────────────────
  // Direct glide cannot reach the threshold before contacting terrain at 1,892 ft MSL.
  const avgAlt = Math.max(1892, (apex.alt + 1892) / 2);
  const tasKt = iasToTasKt(120, avgAlt);
  const wt = windTriangle(trackToTh, tasKt, windFromDeg, windKt);
  const gsKt = wt.canHoldTrack ? Math.max(10, wt.groundSpeedKt) : 10;
  const groundGlideRatio = (2.0 * FT_PER_NM / 1000) * (gsKt / Math.max(1, tasKt));
  const maxGlideDist = Math.max(0, (apex.alt - 1892) * groundGlideRatio);

  const thRad = degToRad(trackToTh);
  const crashX = apex.x + maxGlideDist * Math.sin(thRad);
  const crashY = apex.y + maxGlideDist * Math.cos(thRad);

  return {
    classification: 'crash_short',
    bankDeg: 0,
    joinPoint: null,
    joinIndex: -1,
    track: track35,
    energyMargin: arrAltTh - PFL_AIRFIELD.thresholdAlt, // Negative margin
    dragSchedule: computeDragSchedule(arrAltTh - PFL_AIRFIELD.thresholdAlt),
    surplusOrbit: false,
    crashPoint: {
      x: crashX,
      y: crashY,
      alt: 1892,
      headingDeg: wt.canHoldTrack ? wt.headingDeg : trackToTh,
      phase: 'crash_short',
      tag: 'crash_short',
      config: 'Clean',
    },
    directLatch: false,
    interceptDistanceFt: maxGlideDist,
    tangentErrorDeg: 0,
    interceptBearingDeg: trackToTh,
    rolloutPt: { x: apex.x, y: apex.y, alt: apex.alt, headingDeg: apex.headingDeg },
  };
}
