// Wind-Shaped PFL Kinematic Rail Synthesis
// Authoritative requirements: Patrick's Lead Pilot Guidance (CYMJ Moose Jaw CT-156 Harvard II / SMM Chapter 13 Forced Landings)
// Governing skill: wind-shaped-flight-paths (Pillars 1–10)
// Flight physics core: src/core/t6-performance.js (zoomT6A, glideSinkFpm)

import { FT_PER_NM, ktToFtps } from '../../core/units.js';
import { degToRad, radToDeg, wrapDeg180 } from '../../core/angles.js';
import { iasToTasKt, T6A_GLIDE } from '../../core/t6-performance.js';
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
 * Enforces SMM Ch 13 & EFIG Ch 13 configuration schedule with multi-variable early drag:
 * - Clean: Glide to High Key / tangent capture (Alt > 3,700 ft MSL unless high energy)
 * - Gear Down: High Key (nominal Alt <= 3,700 ft MSL, or earlier if surplus energy)
 * - Flaps TO: Low Key to Base Key (nominal 2,900 ft, or earlier at Low Key/intercept if surplus energy)
 * - Flaps LDG: Final approach (nominal <= 2,400 ft, or earlier at Base Key if high surplus energy)
 *
 * @param {number} alt - Altitude MSL in feet
 * @param {string} [phase] - Flight phase
 * @param {Object} [dragSchedule] - Dynamic drag schedule { earlyGear, earlyFlapsTo, earlyFlapsLdg, delayGear, delayFlaps }
 * @returns {'Clean' | 'Gear Down' | 'Flaps TO' | 'Flaps LDG'}
 */
export function getPflConfig(alt, phase = '', dragSchedule = null) {
  if (phase === 'crash_short' || phase === 'pfl_zoom') return 'Clean';

  // Above 3,700 ft MSL, Harvard II glides clean to High Key / Low Key (SMM Ch 13)
  if (alt > 3700) return 'Clean';

  if (dragSchedule?.earlyFlapsLdg) {
    // Severe surplus energy: Flaps TO early, Flaps LDG at Base Key / 2,900 ft
    if (alt > 3300) return 'Gear Down';
    if (alt > 2700) return 'Flaps TO';
    return 'Flaps LDG';
  }

  if (dragSchedule?.earlyFlapsTo) {
    // Moderate surplus energy: Flaps TO early at Low Key (<= 3,700 ft), Flaps LDG on final (2,400 ft)
    if (alt > 2400) return 'Flaps TO';
    return 'Flaps LDG';
  }

  if (dragSchedule?.delayGear) {
    // Low energy: Delay gear and flaps to preserve glide range
    if (alt > 2900) return 'Clean';
    if (alt > 2200) return 'Gear Down';
    return 'Flaps TO';
  }

  if (dragSchedule?.delayFlaps) {
    // Mild deficit energy: Delay flaps
    if (alt > 2400) return 'Gear Down';
    return 'Flaps TO';
  }

  // Nominal SMM standard schedule
  if (alt > 2900) return 'Gear Down';
  if (alt > 2400) return 'Flaps TO';
  return 'Flaps LDG';
}

/**
 * Returns aerodynamic lift-to-drag glide ratio for the given configuration.
 * @param {'Clean' | 'Gear Down' | 'Flaps TO' | 'Flaps LDG'} config
 * @returns {number}
 */
export function getPflGlideRatio(config) {
  switch (config) {
    case 'Gear Down':
      return T6A_GLIDE.gearDown.nmPer1000Ft * FT_PER_NM / 1000;
    case 'Flaps TO':
      return T6A_GLIDE.flapsTakeoff.nmPer1000Ft * FT_PER_NM / 1000;
    case 'Flaps LDG':
      return T6A_GLIDE.landing.nmPer1000Ft * FT_PER_NM / 1000;
    case 'Clean':
    default:
      return T6A_GLIDE.clean.nmPer1000Ft * FT_PER_NM / 1000;
  }
}

/**
 * Densifies waypoints along a trajectory so that no two adjacent waypoints
 * exceed maxStepFt (<25 ft/frame invariant guard).
 *
 * @param {Array<Object>} points - Input waypoints
 * @param {number} [maxStepFt=19] - Maximum allowable distance between consecutive points
 * @returns {Array<Object>} Densified continuous waypoints
 */
export function densifyRail(points, maxStepFt = 19, dragSchedule = null) {
  if (!points || points.length <= 1) return points ? [...points] : [];
  const out = [points[0]];
  const stepLimit = Math.min(maxStepFt, 19);

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);

    if (d > stepLimit) {
      const steps = Math.ceil(d / stepLimit);
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
        const config = getPflConfig(alt, phase, dragSchedule);

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
        config: getPflConfig(b.alt ?? 3500, b.phase, dragSchedule),
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
  const maxStepFt = options.maxStepFt ?? 19;

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

      // Bank rolls in toward recovery track then rolls level at apex (No bank limitations)
      const turnSign = Math.sign(diffHdg) || 1;
      const zoomBank = Math.min(60, Math.max(20, Math.abs(diffHdg)));
      const bankDeg = zoomBank * Math.sin(u * Math.PI) * turnSign;
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
    // ── CASE C: DIRECT COORDINATED INTERCEPT TO PFL ENTRY GATE ──
    // Patrick Pilot Guidance: No 2D path stretching, no spiderwebs, no bank angle limits.
    // Flies a single coordinated turn onto direct track, straight wings-level glide to gate,
    // then latches onto the fixed standard PFL track (SMM Ch 13).
    const joinPt = solution.joinPoint;
    const apexPt = rawWaypoints[rawWaypoints.length - 1];
    const distToJoin = Math.hypot(joinPt.x - apexPt.x, joinPt.y - apexPt.y);
    const recoveryStartIndex = rawWaypoints.length - 1;

    if (distToJoin > 30) {
      const targetTrackDeg = wrapDeg360(Math.atan2(joinPt.x - apexPt.x, joinPt.y - apexPt.y) * 180 / Math.PI);
      const avgAlt = Math.max(1892, (apexPt.alt + joinPt.alt) / 2);
      const tasKt = iasToTasKt(120, avgAlt);
      const tasFtps = ktToFtps(tasKt);
      const wt = windTriangle(targetTrackDeg, tasKt, windFromDeg, windKt);
      const targetHdgDeg = wt.canHoldTrack ? wt.headingDeg : targetTrackDeg;

      const blowToRad = degToRad((windFromDeg + 180) % 360);
      const wxFtps = ktToFtps(windKt) * Math.sin(blowToRad);
      const wyFtps = ktToFtps(windKt) * Math.cos(blowToRad);

      const deltaHdg = wrapDeg180(targetHdgDeg - (apexPt.headingDeg ?? targetHdgDeg));
      const turnMag = Math.abs(deltaHdg);
      let curX = apexPt.x;
      let curY = apexPt.y;
      let curAlt = apexPt.alt;
      let curHdg = apexPt.headingDeg ?? targetHdgDeg;

      // 1. Coordinated Turn onto Direct Intercept Heading (No bank angle limitations)
      if (turnMag > 2) {
        const turnDir = Math.sign(deltaHdg) || 1;
        // Natural bank up to 60° coordinated (no artificial clamp per Patrick's instruction)
        const maxBankDeg = Math.min(60, Math.max(15, turnMag));
        const dt = 0.05; // Ensures small steps (< 15 ft)
        let turnAccum = 0;

        while (turnAccum < turnMag) {
          const u = turnAccum / turnMag;
          const bankDeg = maxBankDeg * Math.sin(u * Math.PI) * turnDir;
          const bRad = degToRad(Math.max(3, Math.abs(bankDeg)));
          const omega = (32.174 * Math.tan(bRad)) / Math.max(1, tasFtps);
          const dTurn = Math.min(radToDeg(omega) * dt, turnMag - turnAccum);
          turnAccum += dTurn;
          curHdg = wrapDeg360(curHdg + dTurn * turnDir);

          const midHdgRad = degToRad(curHdg);
          const vx = tasFtps * Math.sin(midHdgRad) + wxFtps;
          const vy = tasFtps * Math.cos(midHdgRad) + wyFtps;
          curX += vx * dt;
          curY += vy * dt;
          curAlt -= (1350 / 60) * dt;

          const g = Math.abs(bankDeg) > 3 ? (1 / Math.cos(degToRad(Math.abs(bankDeg)))) : 1.0;
          const phase = solution.classification === 'high_key' ? 'pfl_high_key' : 'pfl_tangent';
          const config = getPflConfig(curAlt, phase, solution.dragSchedule);

          rawWaypoints.push({
            x: Math.round(curX * 10) / 10,
            y: Math.round(curY * 10) / 10,
            alt: Math.round(curAlt * 10) / 10,
            kt: 120,
            kias: 120,
            headingDeg: Math.round(curHdg * 10) / 10,
            bankDeg: Math.round(bankDeg * 10) / 10,
            g: Math.round(g * 100) / 100,
            phase,
            config,
            mode: 'rails',
          });
        }
      }

      // 2. Wings-Level Straight Glide to Entry Gate
      const distRemaining = Math.hypot(joinPt.x - curX, joinPt.y - curY);
      if (distRemaining > 10) {
        const numGlideSteps = Math.max(1, Math.ceil(distRemaining / maxStepFt));
        const startGlideX = curX;
        const startGlideY = curY;
        const startGlideAlt = curAlt;

        for (let s = 1; s <= numGlideSteps; s++) {
          const u = s / numGlideSteps;
          const x = startGlideX + (joinPt.x - startGlideX) * u;
          const y = startGlideY + (joinPt.y - startGlideY) * u;
          const alt = startGlideAlt + (joinPt.alt - startGlideAlt) * u;
          const isEnd = s === numGlideSteps;
          const phase = solution.classification === 'high_key' ? 'pfl_high_key' : 'pfl_tangent';
          const config = getPflConfig(alt, phase, solution.dragSchedule);

          rawWaypoints.push({
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
            alt: Math.round(alt * 10) / 10,
            kt: 120,
            kias: 120,
            headingDeg: Math.round(targetHdgDeg * 10) / 10,
            bankDeg: 0,
            g: 1.0,
            phase,
            config,
            tag: isEnd ? joinPt.tag : undefined,
            mode: 'rails',
          });
        }
      }
    }

    // Append remaining spiral track from joinIndex + 1 to touchdown
    const spiral = solution.track;
    const startIndex = Math.min(spiral.length - 1, solution.joinIndex + 1);

    for (let i = startIndex; i < spiral.length; i++) {
      const sp = spiral[i];
      const config = getPflConfig(sp.alt, sp.phase, solution.dragSchedule);
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

    // Aerodynamic sink rate integration for energy recovery (SMM Ch 13 doctrine)
    if (solution.classification !== 'high_key') {
      const startAlt = rawWaypoints[recoveryStartIndex].alt;
      const targetDeltaAlt = Math.max(1, startAlt - PFL_AIRFIELD.thresholdAlt);

      // Pass 1: compute aerodynamic drag dissipation weight along each segment
      const dragWeights = [];
      let totalDragWeight = 0;
      let estAlt = startAlt;

      for (let k = recoveryStartIndex + 1; k < rawWaypoints.length; k++) {
        const prev = rawWaypoints[k - 1];
        const cur = rawWaypoints[k];
        const stepDist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
        const config = getPflConfig(estAlt, cur.phase, solution.dragSchedule);
        const baseLd = getPflGlideRatio(config);

        const bankDeg = Math.abs(cur.bankDeg ?? 0);
        const gLoad = bankDeg > 5 ? Math.max(1.0, 1 / Math.cos(degToRad(bankDeg))) : 1.0;
        const turnLd = baseLd / gLoad;

        const trackDeg = wrapDeg360(Math.atan2(cur.x - prev.x, cur.y - prev.y) * 180 / Math.PI);
        const tasKt = iasToTasKt(cur.kt || 120, estAlt);
        const wt = windTriangle(trackDeg, tasKt, windFromDeg, windKt);
        const gsKt = wt.canHoldTrack ? Math.max(10, wt.groundSpeedKt) : tasKt;
        const groundGlideRatio = turnLd * (gsKt / Math.max(1, tasKt));

        const segmentWeight = stepDist / Math.max(1, groundGlideRatio);
        dragWeights.push(segmentWeight);
        totalDragWeight += segmentWeight;

        // Advance estimated altitude for next config lookup
        estAlt = Math.max(PFL_AIRFIELD.thresholdAlt, estAlt - segmentWeight);
      }

      // Pass 2: distribute altitude drop according to physical aerodynamic drag
      if (totalDragWeight > 0) {
        let curAlt = startAlt;
        for (let k = recoveryStartIndex + 1; k < rawWaypoints.length; k++) {
          const w = dragWeights[k - (recoveryStartIndex + 1)];
          const altLoss = targetDeltaAlt * (w / totalDragWeight);
          curAlt = Math.max(PFL_AIRFIELD.thresholdAlt, curAlt - altLoss);

          rawWaypoints[k].alt = Math.round(curAlt * 10) / 10;
          rawWaypoints[k].config = getPflConfig(curAlt, rawWaypoints[k].phase, solution.dragSchedule);
        }
      }
    }
  }

  // ── 4. DENSIFICATION & ZERO SNAP VERIFICATION ──────────────────────────────
  const finalWaypoints = /** @type {any} */ (densifyRail(rawWaypoints, maxStepFt, solution.dragSchedule));

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
  finalWaypoints.dragSchedule = solution.dragSchedule;
  finalWaypoints.surplusOrbit = solution.surplusOrbit;
  finalWaypoints.joinPoint = solution.joinPoint;
  finalWaypoints.crashPoint = solution.crashPoint;
  finalWaypoints.apex = apex;

  return finalWaypoints;
}

export const generatePflRail = buildPflRail;

