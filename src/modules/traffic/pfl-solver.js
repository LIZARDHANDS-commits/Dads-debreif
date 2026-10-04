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
    const avgHdgRad = degToRad(wrapDeg360((headingDeg + exitHeadingDeg) / 2));
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
 * Solves the optimal tangent intercept point and recovery classification along the wind-shifted PFL spiral.
 * Supports adaptive bank angle:
 * - 35° nominal profile
 * - 40°–45° tight corner cut when low on energy to shorten track by ~1,500 ft (SMM Ch 13 doctrine).
 *
 * @param {{ x: number, y: number, alt: number, headingDeg: number, kias?: number }} apex - Aircraft state at zoom apex
 * @param {{ windFromDeg?: number, windKt?: number }} [env] - Wind environment
 * @param {Object} [options] - Tuning options { route, bankDeg }
 * @returns {{
 *   classification: 'high_key' | 'low_key' | 'base_key' | 'direct_threshold' | 'crash_short',
 *   bankDeg: number,
 *   joinPoint: Object | null,
 *   joinIndex: number,
 *   track: Array<Object>,
 *   energyMargin: number,
 *   surplusOrbit: boolean,
 *   crashPoint: Object | null
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

  const track35 = generatePflTrack(route, windFromDeg, windKt, /** @type {any} */ ({ bankDeg: 35 }));

  // ── 0. FINAL APPROACH ALIGNMENT CHECK ──────────────────────────────────────
  // If aircraft is already aligned on final approach (heading ~298°) and positioned
  // southeast of the threshold, it is past the pattern and should glide direct.
  const trackToTh = wrapDeg360(Math.atan2(TH.x - apex.x, TH.y - apex.y) * 180 / Math.PI);
  const diffHdgToRwy = Math.abs(wrapDeg180(apex.headingDeg - PFL_AIRFIELD.rwyHdgDeg));
  const diffTrackToRwy = Math.abs(wrapDeg180(trackToTh - PFL_AIRFIELD.rwyHdgDeg));
  const isAlignedFinal = diffHdgToRwy <= 30 && diffTrackToRwy <= 30 && apex.alt < 3500;
  if (isAlignedFinal) {
    const arrAltTh = calcCleanGlideArrival(apex, TH, env);
    if (arrAltTh >= PFL_AIRFIELD.thresholdAlt) {
      const thIdx = track35.length - 1;
      return {
        classification: 'direct_threshold',
        bankDeg: 35,
        joinPoint: track35[thIdx],
        joinIndex: thIdx,
        track: track35,
        energyMargin: arrAltTh - PFL_AIRFIELD.thresholdAlt,
        surplusOrbit: false,
        crashPoint: null,
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
  // Pilot Domain Tolerance (D371): ±100 ft standard, ±200 ft loose. 4,850 ft MSL qualifies for High Key.
  const canMakeHk = arrAltHk >= (PFL_AIRFIELD.highKeyAlt - 150);

  if (isAtHk || isExplicitHk || canMakeHk) {
    return {
      classification: 'high_key',
      bankDeg: 35,
      joinPoint: track35[0],
      joinIndex: 0,
      track: track35,
      energyMargin: arrAltHk - PFL_AIRFIELD.highKeyAlt,
      surplusOrbit: arrAltHk > 5300,
      crashPoint: null,
    };
  }

  // ── 2. DOWNWIND / LOW KEY EVALUATION (NOMINAL 35° BANK) ─────────────────────
  // Low Key requires arrival altitude >= 3,650 ft MSL
  const lowKeyPt = track35.find((p) => p.tag === 'low_key') || track35.find((p) => p.phase === 'pfl_low_key') || track35[198];
  const arrAltLk = calcCleanGlideArrival(apex, lowKeyPt, env);

  if (arrAltLk >= 3650) {
    const lowKeyCandidates = [];
    for (let i = 0; i < track35.length; i++) {
      const p = track35[i];
      if (p.phase === 'pfl_low_key' || p.tag === 'low_key') {
        const arrAlt = calcCleanGlideArrival(apex, p, env);
        const margin = arrAlt - p.alt;
        if (margin >= -50) { // within pilot tolerance
          const trackToPt = wrapDeg360(Math.atan2(p.x - apex.x, p.y - apex.y) * 180 / Math.PI);
          const hdgDiff = Math.abs(wrapDeg180(trackToPt - p.headingDeg));
          lowKeyCandidates.push({ index: i, point: p, margin, hdgDiff, arrAlt });
        }
      }
    }

    if (lowKeyCandidates.length > 0) {
      // Sort by best tangent alignment (minimal heading delta)
      lowKeyCandidates.sort((a, b) => a.hdgDiff - b.hdgDiff);
      const best = lowKeyCandidates[0];
      return {
        classification: 'low_key',
        bankDeg: 35,
        joinPoint: best.point,
        joinIndex: best.index,
        track: track35,
        energyMargin: best.margin,
        surplusOrbit: false,
        crashPoint: null,
      };
    }
  }

  // ── 3. BASE KEY / CORNER CUTTING CHECK (SMM Ch 13 Doctrine) ────────────────
  // If approaching downwind low (2,800 to 3,650 ft MSL), pilot tightens the final
  // turn arc to 40°–45° bank, cutting the corner and shortening track by ~1,500–1,870 ft.
  const track45 = generatePflTrack(route, windFromDeg, windKt, /** @type {any} */ ({ bankDeg: 45 }));
  const isLowEnergyCornerCut = arrAltLk < 3650 && apex.alt >= 2800;

  const chosenTrack = isLowEnergyCornerCut ? track45 : track35;
  const chosenBank = isLowEnergyCornerCut ? 45 : 35;

  const baseKeyCandidates = [];
  for (let i = 0; i < chosenTrack.length; i++) {
    const p = chosenTrack[i];
    // Base Key turn is centered around ~2,900 ft MSL (turn entry to mid-turn, before final rollout)
    if (p.phase === 'pfl_base_key' && p.alt >= 2700 && p.alt <= 3600) {
      const arrAlt = calcCleanGlideArrival(apex, p, env);
      const margin = arrAlt - p.alt;
      if (margin >= -50) {
        const trackToPt = wrapDeg360(Math.atan2(p.x - apex.x, p.y - apex.y) * 180 / Math.PI);
        const hdgDiff = Math.abs(wrapDeg180(trackToPt - p.headingDeg));
        baseKeyCandidates.push({ index: i, point: p, margin, hdgDiff, arrAlt });
      }
    }
  }

  if (baseKeyCandidates.length > 0) {
    baseKeyCandidates.sort((a, b) => a.hdgDiff - b.hdgDiff);
    const best = baseKeyCandidates[0];
    return {
      classification: 'base_key',
      bankDeg: chosenBank,
      joinPoint: best.point,
      joinIndex: best.index,
      track: chosenTrack,
      energyMargin: best.margin,
      surplusOrbit: false,
      crashPoint: null,
    };
  }

  // ── 4. DIRECT THRESHOLD EVALUATION ──────────────────────────────────────────
  // Cannot make any key point on the spiral. Glides clean directly to the threshold.
  const arrAltTh = calcCleanGlideArrival(apex, TH, env);
  if (arrAltTh >= PFL_AIRFIELD.thresholdAlt) {
    const thIdx = track35.length - 1;
    return {
      classification: 'direct_threshold',
      bankDeg: 35,
      joinPoint: track35[thIdx],
      joinIndex: thIdx,
      track: track35,
      energyMargin: arrAltTh - PFL_AIRFIELD.thresholdAlt,
      surplusOrbit: false,
      crashPoint: null,
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
  };
}
