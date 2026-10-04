// Wind-Shaped PFL Kinematic Rail Synthesis
// Authoritative requirements: Patrick's Lead Pilot Guidance (CYMJ Moose Jaw CT-156 Harvard II / SMM Chapter 13 Forced Landings)
// Governing skill: wind-shaped-flight-paths (Pillars 1–10)
// Flight physics core: src/core/t6-performance.js (zoomT6A, glideSinkFpm)

import { FT_PER_NM, ktToFtps } from '../../core/units.js';
import { degToRad, radToDeg, wrapDeg180 } from '../../core/angles.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { windTriangle } from '../../core/wind.js';
import { calcZoomApex, solvePflTangent, PFL_AIRFIELD } from './pfl-solver.js';

/**
 * Normalizes degrees into [0, 360).
 * @param {number} deg
 * @returns {number}
 */
function wrapDeg360(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Enforces the strict SMM Ch 13 configuration schedule by altitude:
 * - Alt > 3,700 ft MSL: Clean
 * - 2,900 ft < Alt <= 3,700 ft MSL: Gear Down
 * - 2,120 ft < Alt <= 2,900 ft MSL: Flaps TO
 * - Alt <= 2,120 ft MSL (or final approach): Flaps LDG
 *
 * @param {number} alt - Altitude MSL in feet
 * @param {string} [phase] - Flight phase
 * @returns {'Clean' | 'Gear Down' | 'Flaps TO' | 'Flaps LDG'}
 */
export function getPflConfig(alt, phase = '') {
  if (phase === 'crash_short' || phase === 'pfl_zoom') return 'Clean';
  if (alt > 3700) return 'Clean';
  if (alt > 2900) return 'Gear Down';
  if (alt > 2120) return 'Flaps TO';
  return 'Flaps LDG';
}

/**
 * Densifies waypoints along a trajectory so that no two adjacent waypoints
 * exceed maxStepFt (<25 ft/frame invariant guard).
 *
 * @param {Array<Object>} points - Input waypoints
 * @param {number} [maxStepFt=20] - Maximum allowable distance between consecutive points
 * @returns {Array<Object>} Densified continuous waypoints
 */
export function densifyRail(points, maxStepFt = 20) {
  if (!points || points.length <= 1) return points ? [...points] : [];
  const out = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);

    if (d > maxStepFt) {
      const steps = Math.ceil(d / maxStepFt);
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const diffHdg = wrapDeg180((b.headingDeg ?? 0) - (a.headingDeg ?? 0));
        const headingDeg = wrapDeg360((a.headingDeg ?? 0) + diffHdg * u);
        const alt = (a.alt ?? 3500) + ((b.alt ?? 3500) - (a.alt ?? 3500)) * u;
        const kt = (a.kt ?? 120) + ((b.kt ?? 120) - (a.kt ?? 120)) * u;
        const bankDeg = (a.bankDeg ?? 0) + ((b.bankDeg ?? 0) - (a.bankDeg ?? 0)) * u;
        const g = (a.g ?? 1) + ((b.g ?? 1) - (a.g ?? 1)) * u;
        const phase = u < 0.5 ? a.phase : b.phase;
        const tag = s === steps ? b.tag : undefined;
        const config = getPflConfig(alt, phase);

        out.push({
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
          alt: Math.round(alt * 10) / 10,
          kt: Math.round(kt * 10) / 10,
          kias: Math.round(kt * 10) / 10,
          headingDeg: Math.round(headingDeg * 10) / 10,
          bankDeg: Math.round(bankDeg * 10) / 10,
          g: Math.round(g * 100) / 100,
          phase,
          config,
          tag,
          mode: 'rails',
        });
      }
    } else {
      out.push({
        ...b,
        kias: b.kt ?? b.kias ?? 120,
        config: getPflConfig(b.alt ?? 3500, b.phase),
        mode: 'rails',
      });
    }
  }

  return out;
}

/**
 * Pre-synthesizes the complete 3D wind-shaped flight trajectory (mode = 'RAIL')
 * for an aircraft executing a Precautionary Forced Landing (PFL).
 *
 * Trajectory components:
 * 1. Segment 1: Zoom / Decel arc (simultaneous pitch pull and bank toward recovery track).
 * 2. Segment 2: Wind-compensated glide tangent connecting zoom apex to PFL spiral.
 * 3. Segment 3: PFL spiral continuation (High Key -> Low Key -> Base Key -> Final -> Touchdown).
 * 4. Segment 4 (If unrecoverable): Straight clean glide terminating at terrain contact (1,892 ft MSL).
 *
 * Every waypoint embeds:
 * `{ x, y, alt, kt, headingDeg, bankDeg, g, phase, config }`.
 *
 * Invariant guards:
 * - Zero coordinate snapping (<25 ft/frame).
 * - Finite numbers on all coordinates and telemetry.
 * - Configuration schedule: Clean -> Gear Down -> Flaps TO -> Flaps LDG.
 *
 * @param {Object} aircraft - Aircraft state
 * @param {Object} [env] - Wind environment
 * @param {Object} [options] - Tuning options
 * @returns {any}
 */
export function buildPflRail(aircraft, env = null, options = {}) {
  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const maxStepFt = options.maxStepFt ?? 20;

  // 1. Solve zoom apex and recovery tangent intercept
  const apex = calcZoomApex(aircraft, env, options);
  const solution = solvePflTangent(apex, env, options);

  const rawWaypoints = [];

  // Initial aircraft state
  const x0 = aircraft.x ?? 0;
  const y0 = aircraft.y ?? 0;
  const alt0 = aircraft.alt ?? 3500;
  const kias0 = aircraft.kias ?? aircraft.iasKt ?? aircraft.kt ?? 140;
  const hdg0 = aircraft.headingDeg ?? 0;
  const bank0 = aircraft.bankDeg ?? 0;

  // ── SEGMENT 1: ZOOM / DECELERATION ARC ─────────────────────────────────────
  if (apex.zoomed) {
    // Airspeed > 150 KIAS: Simultaneous zoom climb and turn to 120 KIAS
    const numZoomSteps = Math.max(10, Math.ceil(apex.distanceFt / maxStepFt));
    for (let s = 0; s <= numZoomSteps; s++) {
      const u = s / numZoomSteps;
      const alt = alt0 + apex.gainFt * Math.sin(u * (Math.PI / 2));
      const kt = kias0 + (120 - kias0) * u;
      const diffHdg = wrapDeg180(apex.headingDeg - hdg0);
      const headingDeg = wrapDeg360(hdg0 + diffHdg * u);

      // Bank rolls in to bank toward recovery track then rolls level at apex
      const turnSign = Math.sign(diffHdg) || 1;
      const bankDeg = 25 * Math.sin(u * Math.PI) * turnSign;
      // Load factor: pulls 2.0 G then pushes over to 0.5 G near apex
      const g = 1.0 + 1.0 * Math.sin(u * Math.PI);

      rawWaypoints.push({
        x: x0 + (apex.x - x0) * u,
        y: y0 + (apex.y - y0) * u,
        alt: Math.round(alt * 10) / 10,
        kt: Math.round(kt * 10) / 10,
        kias: Math.round(kt * 10) / 10,
        headingDeg: Math.round(headingDeg * 10) / 10,
        bankDeg: Math.round(bankDeg * 10) / 10,
        g: Math.round(g * 100) / 100,
        phase: 'pfl_zoom',
        config: 'Clean',
        tag: s === 0 ? 'failure_point' : (s === numZoomSteps ? 'zoom_apex' : undefined),
        mode: 'rails',
      });
    }
  } else if (apex.timeSec > 0 && apex.distanceFt > 0) {
    // Airspeed <= 150 KIAS: Level deceleration to 120 KIAS
    const numDecelSteps = Math.max(5, Math.ceil(apex.distanceFt / maxStepFt));
    for (let s = 0; s <= numDecelSteps; s++) {
      const u = s / numDecelSteps;
      const kt = kias0 + (120 - kias0) * u;
      rawWaypoints.push({
        x: x0 + (apex.x - x0) * u,
        y: y0 + (apex.y - y0) * u,
        alt: alt0,
        kt: Math.round(kt * 10) / 10,
        kias: Math.round(kt * 10) / 10,
        headingDeg: hdg0,
        bankDeg: 0,
        g: 1.0,
        phase: 'pfl_zoom',
        config: 'Clean',
        tag: s === 0 ? 'failure_point' : (s === numDecelSteps ? 'zoom_apex' : undefined),
        mode: 'rails',
      });
    }
  } else {
    // Airspeed already <= 120 KIAS: Immediate start at aircraft state
    const isHk = solution.classification === 'high_key';
    rawWaypoints.push({
      x: x0,
      y: y0,
      alt: alt0,
      kt: Math.min(120, kias0),
      kias: Math.min(120, kias0),
      headingDeg: hdg0,
      bankDeg: bank0,
      g: 1.0,
      phase: isHk ? 'pfl_high_key' : 'pfl_zoom',
      config: 'Clean',
      tag: isHk ? 'high_key' : 'failure_point',
      mode: 'rails',
    });
  }

  // ── SEGMENT 2 & 3: RECOVERY TRACK OR TERRAIN CONTACT ────────────────────────
  if (solution.classification === 'crash_short') {
    // ── CASE A: UNRECOVERABLE / CRASH SHORT ──
    const crashPt = solution.crashPoint;
    const apexPt = rawWaypoints[rawWaypoints.length - 1];
    const distToCrash = Math.hypot(crashPt.x - apexPt.x, crashPt.y - apexPt.y);
    const numSteps = Math.max(10, Math.ceil(distToCrash / maxStepFt));

    for (let s = 1; s <= numSteps; s++) {
      const u = s / numSteps;
      const x = apexPt.x + (crashPt.x - apexPt.x) * u;
      const y = apexPt.y + (crashPt.y - apexPt.y) * u;
      const alt = apexPt.alt + (1892 - apexPt.alt) * u;
      const isEnd = s === numSteps;

      rawWaypoints.push({
        x,
        y,
        alt: Math.round(alt * 10) / 10,
        kt: 120,
        kias: 120,
        headingDeg: crashPt.headingDeg,
        bankDeg: 0,
        g: 1.0,
        phase: isEnd ? 'crash_short' : 'pfl_glide',
        config: 'Clean',
        tag: isEnd ? 'crash_short' : undefined,
        mode: 'rails',
      });
    }
  } else if (solution.classification === 'direct_threshold') {
    // ── CASE B: DIRECT GLIDE TO THRESHOLD ──
    const thPt = solution.joinPoint;
    const apexPt = rawWaypoints[rawWaypoints.length - 1];
    const distToTh = Math.hypot(thPt.x - apexPt.x, thPt.y - apexPt.y);
    const numSteps = Math.max(10, Math.ceil(distToTh / maxStepFt));

    for (let s = 1; s <= numSteps; s++) {
      const u = s / numSteps;
      const x = apexPt.x + (thPt.x - apexPt.x) * u;
      const y = apexPt.y + (thPt.y - apexPt.y) * u;
      const alt = apexPt.alt + (1892 - apexPt.alt) * u;
      const isEnd = s === numSteps;

      // 200 ft AGL flare deceleration and landing configuration
      const isFlare = alt <= 2092;
      const flareProgress = isFlare ? Math.max(0, Math.min(1, (2092 - alt) / 200)) : 0;
      const kt = Math.round(120 - 20 * flareProgress);
      let config = 'Clean';
      if (alt <= 2092 && alt > 1950) config = 'Gear Down';
      else if (alt <= 1950) config = 'Flaps LDG';

      // Heading aligns with runway heading 298° near touchdown
      const trackDeg = wrapDeg360(Math.atan2(thPt.x - apexPt.x, thPt.y - apexPt.y) * 180 / Math.PI);
      const diffHdg = wrapDeg180(PFL_AIRFIELD.rwyHdgDeg - trackDeg);
      const headingDeg = wrapDeg360(trackDeg + diffHdg * flareProgress);

      rawWaypoints.push({
        x,
        y,
        alt: Math.round(alt * 10) / 10,
        kt,
        kias: kt,
        headingDeg: Math.round(headingDeg * 10) / 10,
        bankDeg: 0,
        g: 1.0,
        phase: isFlare ? 'pfl_final' : 'pfl_glide',
        config,
        tag: isEnd ? 'threshold' : undefined,
        mode: 'rails',
      });
    }
  } else {
    // ── CASE C: TANGENT JOIN INTO PFL SPIRAL (HIGH KEY / LOW KEY / BASE KEY) ──
    const joinPt = solution.joinPoint;
    const apexPt = rawWaypoints[rawWaypoints.length - 1];
    const distToJoin = Math.hypot(joinPt.x - apexPt.x, joinPt.y - apexPt.y);

    if (distToJoin > 50) {
      const trackDeg = wrapDeg360(Math.atan2(joinPt.x - apexPt.x, joinPt.y - apexPt.y) * 180 / Math.PI);
      const avgAlt = Math.max(1892, (apexPt.alt + joinPt.alt) / 2);
      const tasKt = iasToTasKt(120, avgAlt);
      const wt = windTriangle(trackDeg, tasKt, windFromDeg, windKt);
      const tangentHdg = wt.canHoldTrack ? wt.headingDeg : trackDeg;

      const numTangentSteps = Math.max(2, Math.ceil(distToJoin / maxStepFt));
      for (let s = 1; s <= numTangentSteps; s++) {
        const u = s / numTangentSteps;
        const x = apexPt.x + (joinPt.x - apexPt.x) * u;
        const y = apexPt.y + (joinPt.y - apexPt.y) * u;
        const alt = apexPt.alt + (joinPt.alt - apexPt.alt) * u;

        // Smooth heading alignment transition onto spiral heading
        let headingDeg;
        if (distToJoin <= 500) {
          // Direct arrival / proximity: smoothly interpolate from apexPt.headingDeg to joinPt.headingDeg
          const startHdg = apexPt.headingDeg ?? tangentHdg;
          const diffHdg = wrapDeg180(joinPt.headingDeg - startHdg);
          headingDeg = wrapDeg360(startHdg + diffHdg * u);
        } else {
          // Long glide: hold tangent heading, align onto spiral heading over the last 20%
          headingDeg = tangentHdg;
          if (u > 0.8) {
            const blendU = (u - 0.8) / 0.2;
            const diffHdg = wrapDeg180(joinPt.headingDeg - tangentHdg);
            headingDeg = wrapDeg360(tangentHdg + diffHdg * blendU);
          }
        }

        const isHkTangent = solution.classification === 'high_key';
        const phase = isHkTangent ? 'pfl_high_key' : 'pfl_tangent';
        const config = getPflConfig(alt, phase);

        rawWaypoints.push({
          x,
          y,
          alt: Math.round(alt * 10) / 10,
          kt: 120,
          kias: 120,
          headingDeg: Math.round(headingDeg * 10) / 10,
          bankDeg: 0,
          g: 1.0,
          phase,
          config,
          tag: s === numTangentSteps ? joinPt.tag : undefined,
          mode: 'rails',
        });
      }
    }

    // Append remaining spiral track from joinIndex + 1 to touchdown
    const spiral = solution.track;
    const startIndex = Math.min(spiral.length - 1, solution.joinIndex + 1);

    for (let i = startIndex; i < spiral.length; i++) {
      const sp = spiral[i];
      const config = getPflConfig(sp.alt, sp.phase);
      rawWaypoints.push({
        x: sp.x,
        y: sp.y,
        alt: sp.alt,
        kt: sp.kt,
        kias: sp.kt,
        headingDeg: sp.headingDeg,
        bankDeg: sp.bankDeg ?? (sp.phase === 'pfl_base_key' ? -solution.bankDeg : 0),
        g: sp.g ?? 1.0,
        phase: sp.phase,
        config,
        tag: sp.tag,
        mode: 'rails',
      });
    }
  }

  // ── 4. DENSIFICATION & ZERO SNAP VERIFICATION ──────────────────────────────
  const finalWaypoints = /** @type {any} */ (densifyRail(rawWaypoints, maxStepFt));

  let cumDist = 0;
  if (finalWaypoints.length > 0) {
    finalWaypoints[0].cumDistFt = 0;
    for (let i = 1; i < finalWaypoints.length; i++) {
      const prev = finalWaypoints[i - 1];
      const cur = finalWaypoints[i];
      cumDist += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      cur.cumDistFt = Math.round(cumDist * 10) / 10;
    }
  }
  finalWaypoints.totalLengthFt = Math.round(cumDist * 10) / 10;

  // Attach metadata
  finalWaypoints.id = 'PFL_RAIL';
  finalWaypoints.model = 'KIN';
  finalWaypoints.loop = false;
  finalWaypoints.kind = 'pfl';
  finalWaypoints.waypoints = finalWaypoints;
  finalWaypoints.points = finalWaypoints;

  finalWaypoints.classification = solution.classification;
  finalWaypoints.bankDeg = solution.bankDeg;
  finalWaypoints.energyMargin = solution.energyMargin;
  finalWaypoints.surplusOrbit = solution.surplusOrbit;
  finalWaypoints.joinPoint = solution.joinPoint;
  finalWaypoints.crashPoint = solution.crashPoint;
  finalWaypoints.apex = apex;

  return finalWaypoints;
}

export const generatePflRail = buildPflRail;

