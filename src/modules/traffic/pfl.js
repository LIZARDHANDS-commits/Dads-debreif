// PFL Full Rewrite: The Practice Forced Landing Segment Planner
//
// Replaces the legacy carrot-follower architecture with an aerodynamically
// disciplined segment planner: planning the forced landing as an explicit
// chain of held-bank turns, straights, staged gear/flap milestones, and a
// two-stage round-out flare.
//
// Key architectural improvements:
//  - Phase 1 (Unified Zoom): Uses core flyZoomT6A kinematics (2 G pull to 20°
//    climb, hold to 145 KIAS, 0.25 G pushover to 125 KIAS best glide, rolling
//    up to 30° toward the join). Apex altitude matches NFM / flyZoomT6A exactly,
//    eliminating F7's 200 ft overshoot. Level decel below 150 KIAS.
//  - Phase 2 (Core Segment Chain & Flight Primitives): Evaluates held-bank turns
//    (30°–60°) in wind and constant-descent wings-level straights. Total height
//    needed is evaluated directly on the exact planned path flown, eliminating
//    F9's 144 ft error and F1/F16 carrot corner-cutting.
//  - Phase 3 (Segment Stepper & Event-Driven Re-planner): Flown by setting bank
//    and descent rate along planned kinematic segments. Re-plans only at discrete
//    milestones (Apex, High Key, Low Key, Final Key) or when actual height
//    deviates by ±300 ft, enforcing a 5 s grace period ("Fly like a pilot").
//  - Phase 4 (Direct Approaches, Staged Drag & Touchdown Flare): Inside Final Key,
//    waives the first-third touchdown constraint to use available runway length;
//    staged drag governance enforces >= 5 s spacing between configuration changes;
//    SMM 13.10 two-stage round-out (pre-flare at 200 ft to 3° path, flare at 15 ft
//    to 2 ft/s sink, touching down at 80–90 KIAS).
//  - Phase 5 (UI/2D/3D Integration & Clean API): Full drop-in replacement API
//    matching pfl.js, providing rich tactical tags and segment overlays without
//    duplicated flight math.
//
// References:
//  - SMM Chapter 13 (Forced Landings), Chapter 4 (Circuit & Landing)
//  - NFM Fig 3-4 (Zoom data), Section 3 (Emergency Procedures)
//  - EFIG p. 402, 408 (Moose Jaw PFL local procedures)
//  - Fable review (fable-report.md: F1-F16, Q1-Q7)
//  - Patrick's rulings (TR-85, TR-87, 4-6 Oct 2026)

import { ktToFtps, KT_TO_FTPS, G_FTPS2, FT_PER_NM } from '../../core/units.js';
import { wrapDeg180, wrapDeg360, compassDegFromVector, compassDegToHeadingRad, headingRadToCompassDeg } from '../../core/angles.js';
import { turnRadiusFromBankFt, turnRateFromBankRadPerSec, dampedClimbG, easeValue, easeRoll } from '../../core/flight-math.js';
import {
  glideDragPerWeight,
  glideRatio,
  stallLimitG,
  zoomT6A,
  flyZoomT6A,
  T6A_GLIDE,
  dragPerWeight,
} from '../../core/t6-performance.js';
import { stepPointMass, pointMassState, pointMassFlight } from '../../core/point-mass.js';
import { iasToTasKt, tasToIasKt, heightFactor } from './weather.js';
import { windTriangle, windVectorFtps } from '../../core/wind.js';
import { legOffsetsFt } from '../../core/geo.js';
import { makePilot, bankFor, PILOT_DT, ROLL } from './circuit.js';
import { startJoin } from './path-follower.js';
import { routeLengthFt } from './route.js';
import {
  THRESHOLD_29L,
  DEPARTURE_END_29L,
  RUNWAY_29L_HDG_DEG,
  THRESHOLD_DATA_ELEV_FT,
  PFL_CIRCLE_RADIUS_FT,
  PFL_KEY_ALT_FT,
  FIELD_ELEV_FT,
} from './airfield.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const bearing = (a, b) => compassDegFromVector(b.x - a.x, b.y - a.y);

// ── PFL Constants & Settings ──────────────────────────────────────────────────

/** The PFL's flying numbers, each with its source. */
export const PFL = Object.freeze({
  /** Zoom only above 150 KIAS (Patrick, 4440; card C7 06:35Z); at or below it, hold height and slow to glide speed. */
  zoomAboveKias: 150,
  /** The zoom: 2 G pull to 20° climb, push over through 145 KIAS, capture 125 KIAS (NFM Fig 3-4, p. 3-9). */
  zoomPullG: 2,
  /** Most G the glide may pull to move the nose, never past the stall line (TR-51; Patrick 17:52Z). */
  glideMaxG: 2,
  /** How fast G builds or eases: G/s and G/s² (TR-51). */
  gOnsetGps: 2,
  gOnsetGps2: 8,
  pushOverKias: 145,
  /** Steepest climb attitude during zoom (NFM Fig 3-4: 20° nose up). */
  zoomMaxClimbDeg: 20,
  /** Most bank while zooming, so the zoom still gains height while turning toward the join. */
  zoomMaxBankDeg: 30,
  /** Glide speeds: 125 KIAS clean until gear is down, then 120 (SMM 13.5 para 8, 13.14 para 26). */
  glideCleanKias: 125,
  glideGearKias: 120,
  /** Direct speed trade floor: down to 80 KIAS, but never closer to stall than stallMarginKt. */
  minTradeKias: 80,
  /** Stall speed at 1 G, KIAS, by configuration [clean, gearDown, flapsTakeoff, landing]. */
  stallKias: [86, 86, 86, 76],
  /** Speed trade margin above 1 G stall: stick shaker 5–10 kt (SMM 5.5 para 15). */
  stallMarginKt: 5,
  /** Maximum bank angle allowed during forced landings (Patrick 08:34Z). */
  maxBankDeg: 60,
  gateFlagBankDeg: 45,
  /** Orbit to lose height is flown at 30° bank (SMM 13.5 para 11, p. 46). */
  orbitBankDeg: 30,
  /** Height margin carried round at keys rather than taking early flap. */
  keysCarryHighFt: 100,
  /** High Key window, ft MSL (WFO S2 art 403 para 1a; Patrick C4 06:30Z). */
  highKeyMinFt: 5000,
  highKeyMaxFt: 6000,
  /** Within this distance of High Key, a PFL starts at High Key. */
  atHighKeyFt: 1500,
  /** Keys move into wind from 15 kt: High Key full, Low Key half, ~1,000 ft per 10 kt (EFIG p. 402, 406). */
  keyShiftFromKt: 15,
  keyShiftFtPer10Kt: 1000,
  /** Drag step taken before planned point needs margin to cover it plus this buffer. */
  dragBufferFt: 100,
  /** Down to this far below profile still counts as on profile. */
  onProfileFt: 50,
  /** The 2,100 ft gate: 120 KIAS, within 35° of runway heading (TR-R14). */
  gateAltFt: 2100,
  gateTrackDeg: 35,
  gateKias: 120,
  /** SMM 13.10 two-stage round-out: pre-flare at 200 ft AGL checks descent to 3° path. */
  preFlareFt: 200,
  preFlareDeg: 3,
  thresholdKias: [110, 110, 105, 100],
  /** Flare begins at ~15 ft AGL, easing sink rate to touchdown. */
  flareFromFt: 15,
  flareTauSec: 2,
  flareTouchSinkFtps: 2,
  roundOutTrackDeg: 30,
  /** Touchdown aim: threshold for glide, pre-flare & flare carry wheels to first 1,000 ft. */
  aimFractionOfRunway: 0,
  touchdownFt: 1000,
  stopMarginFt: 2000,
  joinStepDeg: 5,
  lastJoinDeg: 270,
  fitsExtraTurnDeg: 90,
  highJoinRoomDeg: 225,
  directMinBankDeg: 15,
  directPastRollOutFt: 300,
  /** Re-planning grace period: 5 s before plan may be given up unless critically short. */
  planGraceSec: 5,
  planGraceUnlessShortFt: 300,
  inTurnBankDeg: 10,
  earlyGearWithinFt: 5 * FT_PER_NM,
  interceptTurnDeg: 60,
  interceptOntoDeg: 120,
  turnRoundOnProfileFt: 150,
  joinLeadFt: 1500,
  highKeyRunInFt: 3000,
  directFinalFt: 2000,
  lookaheadFt: 1000,
  cutFtPerFtLow: 8,
  followPatternLowFt: 100,
  maxLookaheadFt: 6000,
  widenAboveFt: 100,
  maxWidenFt: 6000,
  holdBankSec: 1,
  maxAccelG: 0.1,
  obviousShortRingFactor: 1.5,
  ejectDecideSec: 5,
  /** Staged drag spacing: minimum 5 s between configuration changes (Fable F6). */
  minConfigIntervalSec: 5,
});

/** Configurations in order: 0=clean, 1=gearDown, 2=flapsTakeoff, 3=landing. */
export const PFL_CONFIGS = Object.freeze(['clean', 'gearDown', 'flapsTakeoff', 'landing']);
export const PFL_CONFIG_LABELS = Object.freeze(['Clean', 'Gear', 'Gear + T/O flap', 'Gear + landing flap']);
export const PFL_ROUTE_OPTIONS = Object.freeze({ flyRoundedTurns: false, radiusFromG: true, manualRadiusFt: 1800 });
export const PFL_SEGMENT_TYPES = Object.freeze(['zoom', 'decel', 'arc', 'straight', 'roundout', 'flare']);
const PLAN_DEG = [-Infinity, 0, 90, 180];

// ── Shared Aerodynamic & Frame Helpers ────────────────────────────────────────

export function glideKias(cfg) {
  return cfg > 0 ? PFL.glideGearKias : PFL.glideCleanKias;
}

export function flownGlideRatio(cfg, altFt) {
  const c = PFL_CONFIGS[cfg] ?? 'clean';
  return 1 / glideDragPerWeight(c, glideKias(cfg), altFt, 1);
}

export function stallG(kias, cfg) {
  const stallK = PFL.stallKias[cfg] ?? 86;
  return stallLimitG(kias, stallK);
}

export function tradeFloorKias(cfg) {
  const stallK = PFL.stallKias[cfg] ?? 86;
  return Math.max(PFL.minTradeKias, stallK + PFL.stallMarginKt);
}

export function speedTradeFt(kias, altFt, cfg) {
  const v = ktToFtps(iasToTasKt(kias, altFt));
  const vFloor = ktToFtps(iasToTasKt(tradeFloorKias(cfg), altFt));
  return Math.max(0, (v * v - vFloor * vFloor) / (2 * G_FTPS2)) / heightFactor(altFt);
}

export function directTurnRadiusFt(altFt = 2500) {
  return turnRadiusFromBankFt(ktToFtps(iasToTasKt(PFL.glideGearKias, altFt)), PFL.gateFlagBankDeg);
}

export function glideJoinMinRadiusFt(altFt = 3500) {
  const stallBankDeg = Math.acos(1 / Math.max(stallG(PFL.glideCleanKias, 0), 1.0001)) / DEG;
  return turnRadiusFromBankFt(ktToFtps(iasToTasKt(PFL.glideCleanKias, altFt)), Math.min(PFL.maxBankDeg, stallBankDeg));
}

export function orbitRadiusFt(altFt = 4000) {
  return turnRadiusFromBankFt(ktToFtps(iasToTasKt(PFL.glideGearKias, altFt)), PFL.orbitBankDeg);
}

// ── PFL Airfield & Geometry ───────────────────────────────────────────────────

export function pflGeometry(windFromDeg = 360, windKt = 0, settings = {}) {
  const th = THRESHOLD_29L, dep = DEPARTURE_END_29L;
  const lenFt = dist(th, dep);
  const u = { x: (dep.x - th.x) / lenFt, y: (dep.y - th.y) / lenFt };
  const rwyDeg = compassDegFromVector(u.x, u.y);
  const r = PFL_CIRCLE_RADIUS_FT;
  const left = { x: -u.y, y: u.x };
  const centre = { x: th.x + left.x * r, y: th.y + left.y * r };
  const thBearing = bearing(centre, th);
  const shiftOn = (settings.pflKeysIntoWind ?? true) && windKt >= PFL.keyShiftFromKt;
  const shiftFt = shiftOn ? PFL.keyShiftFtPer10Kt * windKt / 10 : 0;
  const up = { x: Math.sin(windFromDeg * DEG), y: Math.cos(windFromDeg * DEG) };

  const at = (theta) => {
    const b = (thBearing - theta) * DEG;
    const k = shiftFt * (1 - clamp(theta, 0, 360) / 360);
    return { x: centre.x + r * Math.sin(b) + up.x * k, y: centre.y + r * Math.cos(b) + up.y * k };
  };

  const trackAt = (theta) => bearing(at(theta - 0.5), at(theta + 0.5));
  const along = (ft) => ({ x: th.x + u.x * ft, y: th.y + u.y * ft });

  return { th, dep, u, lenFt, rwyDeg, r, centre, at, trackAt, along, shiftFt, windFromDeg, aimAlongFt: lenFt * PFL.aimFractionOfRunway };
}

export function glideFootprint(a, windFromDeg = 360, windKt = 0) {
  const alt = Number.isFinite(a?.alt) ? a.alt : FIELD_ELEV_FT;
  const altDiff = Math.max(0, alt - FIELD_ELEV_FT) * heightFactor(alt);
  const cfgIndex = Math.max(0, PFL_CONFIG_LABELS.indexOf(a?.config ?? ''));
  const rGlide = altDiff * flownGlideRatio(cfgIndex, alt);
  const kias = cfgIndex > 0 ? PFL.glideGearKias : PFL.glideCleanKias;
  const tasFtps = iasToTasKt(kias, (alt + FIELD_ELEV_FT) / 2) * FT_PER_NM / 3600;
  const tGlide = rGlide / tasFtps;

  const fromDeg = Number.isFinite(windFromDeg) ? windFromDeg : 360;
  const kt = Number.isFinite(windKt) && windKt > 0 ? windKt : 0;
  const { x: wxFtps, y: wyFtps } = windVectorFtps(fromDeg % 360, kt);

  const ax = Number.isFinite(a?.x) ? a.x : 0;
  const ay = Number.isFinite(a?.y) ? a.y : 0;
  const cx = ax + wxFtps * tGlide;
  const cy = ay + wyFtps * tGlide;
  const driftFt = Math.hypot(wxFtps * tGlide, wyFtps * tGlide);

  return { cx, cy, rGlide, tGlide, altDiff, driftFt, wxFtps, wyFtps };
}

export { glideFootprint as calculateGlideFootprint };

export function obviouslyShort(geo, s, cfg, wind) {
  const ring = glideFootprint({ x: s.x, y: s.y, alt: s.alt, config: PFL_CONFIG_LABELS[cfg] }, wind.windFromDeg, wind.windKt);
  const ux = geo.dep.x - geo.th.x, uy = geo.dep.y - geo.th.y, len2 = ux * ux + uy * uy || 1;
  const k = Math.max(0, Math.min(1, ((ring.cx - geo.th.x) * ux + (ring.cy - geo.th.y) * uy) / len2));
  const missFt = Math.hypot(ring.cx - (geo.th.x + k * ux), ring.cy - (geo.th.y + k * uy));
  return missFt > PFL.obviousShortRingFactor * ring.rGlide;
}

// ── Phase 1: Task 1 - Kinematic Zoom & Decel Segment Generator ────────────────

const ZOOM_MIN_KIAS = 150;
const ZOOM_GLIDE_KIAS = 125;
const ZOOM_PUSH_G = 0.25;
const ZOOM_STEP_SEC = 0.02;
const ZOOM_PITCH_GAIN = 5;
const ZOOM_MAX_SEC = 120;

/**
 * Generates the unified zoom or level deceleration flight segment based strictly
 * on flyZoomT6A kinematics (NFM Fig 3-4, p. 3-9).
 *
 * For entries above 150 KIAS:
 *  - 2.0 s straight and level at 1 G
 *  - 2.0 G pull to 20° climb attitude
 *  - Hold 20° nose up until 145 KIAS
 *  - 0.25 G pushover to capture 125 KIAS clean glide
 *  - Turn vector rolls up to 30° bank toward target join heading
 *
 * For entries <= 150 KIAS:
 *  - Level deceleration from current KIAS to 125 KIAS (deltaAltFt = 0)
 *
 * Returns segment metadata:
 *  { type, points, deltaAltFt, deltaDistFt, exitKias, exitHeadingDeg, exitBankDeg, timeSec, apexAltFt, apexPos }
 */
export function generateZoomOrDecelSegment({
  x = 0,
  y = 0,
  alt = 3500,
  kias = 125,
  headingDeg = 298,
  bankDeg = 0,
  targetHeadingDeg = undefined,
  targetPt = undefined,
  wind = { windFromDeg: 360, windKt: 0 },
  dt = ZOOM_STEP_SEC,
} = {}) {
  const startX = x, startY = y, startAlt = alt;
  const isZoom = kias > ZOOM_MIN_KIAS;
  const engineOff = (ktas, a, g) => -dragPerWeight(tasToIasKt(ktas, a), a, g);

  const startHeadingRad = compassDegToHeadingRad(headingDeg);
  let s = pointMassState({
    x: 0,
    y: 0,
    altFt: alt,
    ktas: iasToTasKt(kias, alt),
    headingRad: startHeadingRad,
  });

  let t = 0;
  const now = () => pointMassFlight(s);
  const nowKias = () => tasToIasKt(now().ktas, now().altFt);
  const going = () => t < ZOOM_MAX_SEC;

  const targetHdg = targetPt
    ? compassDegFromVector(targetPt.x - x, targetPt.y - y)
    : Number.isFinite(targetHeadingDeg)
    ? targetHeadingDeg
    : headingDeg;

  let currBankDeg = bankDeg;
  let currRollRate = 0;
  const points = [];
  const w = windVectorFtps(wind.windFromDeg ?? 360, wind.windKt ?? 0);

  if (!isZoom) {
    while (nowKias() > ZOOM_GLIDE_KIAS && going()) {
      const f = now();
      const currHdgDeg = headingRadToCompassDeg(f.headingRad);
      const hdgDiff = wrapDeg180(targetHdg - currHdgDeg);
      let wantBank = 0;
      if (Math.abs(hdgDiff) > 5) {
        wantBank = clamp(hdgDiff * 1.5, -15, 15);
      }
      const rolled = easeRoll(currBankDeg, currRollRate, wantBank, dt, ROLL);
      currBankDeg = rolled.bankDeg;
      currRollRate = rolled.rollRateDps;

      s = stepPointMass(s, { g: 1 / Math.cos(currBankDeg * DEG), bankRad: currBankDeg * DEG }, dt, engineOff);
      s.z = startAlt;
      s.vz = 0;
      t += dt;

      if (Math.round(t / dt) % 5 === 0) {
        const curF = now();
        points.push({
          x: startX + s.x + w.x * t,
          y: startY + s.y + w.y * t,
          alt: curF.altFt,
          kt: nowKias(),
          headingDeg: headingRadToCompassDeg(curF.headingRad),
          bankDeg: currBankDeg,
          g: 1,
          phase: 'pfl_decel',
          decision: 'Slow to 125',
          config: PFL_CONFIG_LABELS[0],
          timeSec: t,
          segmentType: 'decel',
          marginFt: null,
          marginTag: null,
        });
      }
    }
  } else {
    const climb = 20 * Math.PI / 180;
    const glidePath = -Math.atan(1 / (T6A_GLIDE.clean.nmPer1000Ft * FT_PER_NM / 1000));

    const fly = (control) => {
      s = stepPointMass(s, control, dt, engineOff);
      t += dt;
      if (Math.round(t / dt) % 5 === 0) {
        const curF = now();
        points.push({
          x: startX + s.x + w.x * t,
          y: startY + s.y + w.y * t,
          alt: curF.altFt,
          kt: nowKias(),
          headingDeg: headingRadToCompassDeg(curF.headingRad),
          bankDeg: currBankDeg,
          g: control.g,
          phase: 'pfl_zoom',
          decision: 'Zoom: apex',
          config: PFL_CONFIG_LABELS[0],
          timeSec: t,
          segmentType: 'zoom',
          marginFt: null,
          marginTag: null,
        });
      }
    };

    while (t < 2 - 1e-9 && going()) {
      fly({ g: 1, bankRad: 0 });
    }
    while (now().climbRad < climb && going()) {
      const curHdgDeg = headingRadToCompassDeg(now().headingRad);
      const hdgDiff = wrapDeg180(targetHdg - curHdgDeg);
      let wantBank = Math.abs(hdgDiff) > 2 ? clamp(hdgDiff * 2, -PFL.zoomMaxBankDeg, PFL.zoomMaxBankDeg) : 0;
      const rolled = easeRoll(currBankDeg, currRollRate, wantBank, dt, ROLL);
      currBankDeg = rolled.bankDeg;
      currRollRate = rolled.rollRateDps;
      const bankRad = currBankDeg * DEG;
      fly({ g: 2 / Math.cos(bankRad), bankRad });
    }
    while (nowKias() > 145 && going()) {
      const f = now();
      const curHdgDeg = headingRadToCompassDeg(f.headingRad);
      const hdgDiff = wrapDeg180(targetHdg - curHdgDeg);
      let wantBank = Math.abs(hdgDiff) > 2 ? clamp(hdgDiff * 2, -PFL.zoomMaxBankDeg, PFL.zoomMaxBankDeg) : 0;
      const rolled = easeRoll(currBankDeg, currRollRate, wantBank, dt, ROLL);
      currBankDeg = rolled.bankDeg;
      currRollRate = rolled.rollRateDps;
      const bankRad = currBankDeg * DEG;
      const vertG = Math.cos(f.climbRad) + ZOOM_PITCH_GAIN * (climb - f.climbRad);
      fly({ g: vertG / Math.cos(bankRad), bankRad });
    }
    while (nowKias() > ZOOM_GLIDE_KIAS && now().climbRad > glidePath && going()) {
      const f = now();
      const curHdgDeg = headingRadToCompassDeg(f.headingRad);
      const hdgDiff = wrapDeg180(targetHdg - curHdgDeg);
      let wantBank = Math.abs(hdgDiff) > 2 ? clamp(hdgDiff * 2, -PFL.zoomMaxBankDeg, PFL.zoomMaxBankDeg) : 0;
      const rolled = easeRoll(currBankDeg, currRollRate, wantBank, dt, ROLL);
      currBankDeg = rolled.bankDeg;
      currRollRate = rolled.rollRateDps;
      const bankRad = currBankDeg * DEG;
      fly({ g: ZOOM_PUSH_G / Math.cos(bankRad), bankRad });
    }
  }

  const finalFlight = now();
  const exitX = startX + s.x + w.x * t;
  const exitY = startY + s.y + w.y * t;
  const exitAlt = finalFlight.altFt;
  const exitHdg = headingRadToCompassDeg(finalFlight.headingRad);

  return {
    type: isZoom ? 'zoom' : 'decel',
    points,
    deltaAltFt: exitAlt - startAlt,
    deltaDistFt: dist({ x: startX, y: startY }, { x: exitX, y: exitY }),
    exitKias: ZOOM_GLIDE_KIAS,
    exitHeadingDeg: exitHdg,
    exitBankDeg: 0,
    timeSec: t,
    apexAltFt: exitAlt,
    apexPos: { x: exitX, y: exitY, alt: exitAlt },
  };
}

// ── Phase 1: Task 2 - PFL Join Point Energy Predictor ─────────────────────────

/**
 * Predicts available energy height at the top of the zoom or end of decel:
 * He = h_apex + V² / (2g).
 * Uses the exact apex state of Task 1's segment generator.
 */
export function predictApexEnergy({ startState, wind = { windFromDeg: 360, windKt: 0 } }) {
  const zoomSeg = generateZoomOrDecelSegment({
    x: startState.x,
    y: startState.y,
    alt: startState.alt,
    kias: startState.kias ?? 125,
    headingDeg: startState.headingDeg ?? RUNWAY_29L_HDG_DEG,
    bankDeg: startState.bankDeg ?? 0,
    wind,
  });

  const apexAltFt = zoomSeg.apexAltFt;
  const energyHeightFt = apexAltFt;

  return {
    apexPos: zoomSeg.apexPos,
    apexAltFt,
    exitKias: zoomSeg.exitKias,
    exitHeadingDeg: zoomSeg.exitHeadingDeg,
    timeSec: zoomSeg.timeSec,
    energyHeightFt,
    zoomSegment: zoomSeg,
  };
}

// ── Phase 2: Task 3 - PFL Arc & Straight Segment Evaluators ───────────────────

/**
 * Evaluates a held-bank coordinated turn in wind (Task 3).
 *
 * Models:
 *  - Bank phi in [30°, 60°]
 *  - Load factor G = 1 / cos(phi)
 *  - Aerodynamic turn rate and air radius
 *  - Wind-drift compensation on ground track
 *  - Height loss: Delta z = -V_TAS * t * (D/W) / heightFactor(alt)
 *
 * Verifies SMM 13.5: 360° orbit at 30° bank and 120 KIAS loses ~1,550-1,700 ft clean
 * and ~2,600 ft gear down (via GEAR_DRAG_FACTOR = 1.322).
 */
export function evaluateArcSegment({
  startPt,
  startHeadingDeg,
  startAltFt,
  turnDeg,
  bankDeg = 30,
  side = 1, // +1 right, -1 left
  speedKias = 120,
  config = 0,
  wind = { windFromDeg: 360, windKt: 0 },
  stepDeg = 5,
}) {
  const phiDeg = Math.abs(bankDeg);
  const phiRad = phiDeg * DEG;
  const g = 1 / Math.cos(phiRad);

  const tasKt = iasToTasKt(speedKias, startAltFt);
  const tasFtps = ktToFtps(tasKt);
  const omegaRadPerSec = (G_FTPS2 * Math.tan(phiRad)) / Math.max(tasFtps, 1);
  const airRadiusFt = tasFtps / Math.max(omegaRadPerSec, 1e-4);

  const totalTimeSec = (turnDeg * DEG) / Math.max(omegaRadPerSec, 1e-4);
  const dw = glideDragPerWeight(PFL_CONFIGS[config] ?? 'clean', speedKias, startAltFt, g);
  const deltaAltTrue = -tasFtps * totalTimeSec * dw;
  const deltaAltFt = deltaAltTrue / heightFactor(startAltFt);

  const w = windVectorFtps(wind.windFromDeg ?? 360, wind.windKt ?? 0);
  const points = [];
  let currX = startPt.x, currY = startPt.y;
  let currAlt = startAltFt;
  let currHdg = startHeadingDeg;

  const numSteps = Math.max(1, Math.ceil(turnDeg / stepDeg));
  const dtStep = totalTimeSec / numSteps;
  const dHdgStep = (turnDeg / numSteps) * side;
  const dAltStep = deltaAltFt / numSteps;

  for (let i = 0; i <= numSteps; i++) {
    points.push({
      x: currX,
      y: currY,
      alt: currAlt,
      kias: speedKias,
      headingDeg: currHdg,
      bankDeg: phiDeg * side,
      g,
      config: PFL_CONFIG_LABELS[config],
      segmentType: 'arc',
      marginFt: null,
      marginTag: null,
    });
    if (i < numSteps) {
      currHdg = wrapDeg360(currHdg + dHdgStep);
      const hRad = currHdg * DEG;
      const gndVx = tasFtps * Math.sin(hRad) + w.x;
      const gndVy = tasFtps * Math.cos(hRad) + w.y;
      currX += gndVx * dtStep;
      currY += gndVy * dtStep;
      currAlt += dAltStep;
    }
  }

  return {
    type: 'arc',
    startPt,
    points,
    deltaAltFt,
    deltaDistFt: dist(startPt, { x: currX, y: currY }),
    timeSec: totalTimeSec,
    exitPt: { x: currX, y: currY },
    exitHeadingDeg: currHdg,
    exitAltFt: currAlt,
    exitKias: speedKias,
    bankDeg: phiDeg * side,
    side,
    config,
    radiusFt: airRadiusFt,
  };
}

/**
 * Evaluates a steady wings-level glide along ground track (Task 3).
 *
 * Models:
 *  - Constant glide slope along ground track: V_TAS + Wind
 *  - Configuration sink rate: Delta z = -V_TAS * t * (D/W) / heightFactor(alt)
 */
export function evaluateStraightSegment({
  startPt,
  headingDeg,
  startAltFt,
  distanceFt,
  speedKias = 125,
  config = 0,
  wind = { windFromDeg: 360, windKt: 0 },
  stepFt = 500,
}) {
  const tasKt = iasToTasKt(speedKias, startAltFt);
  const wt = windTriangle(headingDeg, tasKt, wind.windFromDeg ?? 360, wind.windKt ?? 0);
  const groundSpeedKt = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 20) : 20;
  const groundSpeedFtps = ktToFtps(groundSpeedKt);
  const timeSec = distanceFt / Math.max(groundSpeedFtps, 1);

  const dw = glideDragPerWeight(PFL_CONFIGS[config] ?? 'clean', speedKias, startAltFt, 1.0);
  const airDistFt = ktToFtps(tasKt) * timeSec;
  const deltaAltFt = (-airDistFt * dw) / heightFactor(startAltFt);

  const hRad = headingDeg * DEG;
  const dirX = Math.sin(hRad);
  const dirY = Math.cos(hRad);

  const numSteps = Math.max(1, Math.ceil(distanceFt / stepFt));
  const points = [];

  for (let i = 0; i <= numSteps; i++) {
    const f = i / numSteps;
    points.push({
      x: startPt.x + dirX * distanceFt * f,
      y: startPt.y + dirY * distanceFt * f,
      alt: startAltFt + deltaAltFt * f,
      kias: speedKias,
      headingDeg,
      bankDeg: 0,
      g: 1.0,
      config: PFL_CONFIG_LABELS[config],
      segmentType: 'straight',
      marginFt: null,
      marginTag: null,
    });
  }

  const exitPt = { x: startPt.x + dirX * distanceFt, y: startPt.y + dirY * distanceFt };

  return {
    type: 'straight',
    startPt,
    points,
    deltaAltFt,
    deltaDistFt: distanceFt,
    timeSec,
    exitPt,
    exitHeadingDeg: headingDeg,
    exitAltFt: startAltFt + deltaAltFt,
    exitKias: speedKias,
    bankDeg: 0,
    config,
  };
}

// ── Path Generation & Geometric Solvers ────────────────────────────────────────

function planAt(theta) {
  let k = 0;
  for (let i = 1; i < PLAN_DEG.length; i++) if (theta >= PLAN_DEG[i]) k = i;
  return k;
}

function keyAt(theta) {
  if (Math.abs(theta) < 1e-6) return 'high_key';
  if (Math.abs(theta - 180) < 1e-6) return 'low_key';
  if (Math.abs(theta - 270) < 1e-6) return 'final_key';
  return undefined;
}

function finalToAim(geo, aimAlongFt) {
  const aim = geo.along(aimAlongFt);
  const beyond = geo.along(Math.min(geo.lenFt, aimAlongFt + 3000));
  const td = geo.along(PFL.touchdownFt);
  const first = aimAlongFt > PFL.touchdownFt + 1 && aimAlongFt <= geo.aimAlongFt + 1 ? [{ x: td.x, y: td.y, plan: 3, key: 'touchdown' }] : [];
  return [...first, { x: aim.x, y: aim.y, plan: 3, key: 'aim' }, { x: beyond.x, y: beyond.y, plan: 3, key: 'rollout' }];
}

function arcToAim(geo, theta0, extra = {}) {
  const pts = [];
  const windFromDeg = geo.windFromDeg ?? 360;
  const up = { x: Math.sin(windFromDeg * DEG), y: Math.cos(windFromDeg * DEG) };
  for (let th = theta0; th < 360 - 1e-6; th += PFL.joinStepDeg) {
    const p = geo.at(th);
    const k = geo.shiftFt ? geo.shiftFt * (1 - clamp(th, 0, 360) / 360) : 0;
    const c = { x: geo.centre.x + up.x * k, y: geo.centre.y + up.y * k };
    const arc = { cx: c.x, cy: c.y, r: geo.r, side: -1 };
    pts.push({ x: p.x, y: p.y, theta: th, plan: planAt(th), key: keyAt(th), arc, ...extra });
    if (th + PFL.joinStepDeg > 360 - 1e-6) break;
    const next = th + PFL.joinStepDeg;
    for (const kd of [180, 270]) if (th < kd && next > kd) {
      const q = geo.at(kd);
      const kq = geo.shiftFt ? geo.shiftFt * (1 - clamp(kd, 0, 360) / 360) : 0;
      const cq = { x: geo.centre.x + up.x * kq, y: geo.centre.y + up.y * kq };
      pts.push({ x: q.x, y: q.y, theta: kd, plan: planAt(kd), key: keyAt(kd), arc: { cx: cq.x, cy: cq.y, r: geo.r, side: -1 } });
    }
  }
  pts.push({ x: geo.th.x, y: geo.th.y, theta: 360, plan: 3, key: 'threshold' });
  return [...pts, ...finalToAim(geo, geo.aimAlongFt)];
}

function joinPath(geo, from, theta, headingDeg = undefined, rt = directTurnRadiusFt(), minRt = rt, side = 1) {
  const p = geo.at(theta);
  const trk = geo.trackAt(theta);
  const t = { x: Math.sin(trk * DEG), y: Math.cos(trk * DEG) };
  if (!Number.isFinite(headingDeg)) {
    const q = { x: p.x - t.x * PFL.joinLeadFt, y: p.y - t.y * PFL.joinLeadFt };
    const o = legOffsetsFt(q, p, from);
    const lead = o.alongFt > 0 && Math.abs(o.crossFt) < PFL.joinLeadFt / 2 ? [] : [{ x: q.x, y: q.y, plan: 0 }];
    return [{ x: from.x, y: from.y, plan: 0 }, ...lead, ...arcToAim(geo, theta)];
  }
  const turnDeg = wrapDeg360(side * (trk - headingDeg));
  const h = { x: Math.sin(headingDeg * DEG), y: Math.cos(headingDeg * DEG) };
  const v1 = { x: side * (h.y - t.y), y: side * (t.x - h.x) };
  const n = { x: t.y, y: -t.x };
  const offFt = (from.x - p.x) * n.x + (from.y - p.y) * n.y;
  const rate = h.x * n.x + h.y * n.y;
  const per = v1.x * n.x + v1.y * n.y;
  const ht = h.x * t.x + h.y * t.y;
  const along0 = (from.x - p.x) * t.x + (from.y - p.y) * t.y;

  const fit = (r) => {
    let d;
    if (Math.abs(rate) < 0.02) {
      if (Math.abs(offFt + r * per) > 100) return null;
      d = ht < 0 ? Math.max(0, along0 + r * (v1.x * t.x + v1.y * t.y)) : 0;
    } else d = -(offFt + r * per) / rate;
    if (d < 0 || along0 + d * ht + r * (v1.x * t.x + v1.y * t.y) > 0) return null;
    return d;
  };

  const radii = [rt];
  for (let k = 1; k <= 20; k++) radii.push(rt - (rt - minRt) * k / 20);
  if (Math.abs(per) > 1e-6 && -offFt / per >= minRt && -offFt / per < rt) radii.push(-offFt / per);
  radii.sort((x, y) => y - x);
  let d = null;
  for (const r of radii) { d = fit(r); if (d !== null) { rt = r; break; } }
  if (d === null) return null;

  const v = { x: v1.x * rt, y: v1.y * rt };
  const s0 = { x: from.x + h.x * d, y: from.y + h.y * d };
  const e = { x: s0.x + v.x, y: s0.y + v.y };
  if ((e.x - p.x) * t.x + (e.y - p.y) * t.y > 0) return null;

  const c = { x: s0.x + side * rt * h.y, y: s0.y - side * rt * h.x };
  const turn = { cx: c.x, cy: c.y, r: rt, side };
  const arc = [];
  for (let k = PFL.joinStepDeg; k < turnDeg - 1e-6; k += PFL.joinStepDeg) {
    const a = (headingDeg + side * k) * DEG;
    arc.push({ x: c.x - side * rt * Math.cos(a), y: c.y + side * rt * Math.sin(a), plan: 0, arc: turn });
  }
  const straight = d > 1 ? [{ x: s0.x, y: s0.y, plan: 0, arc: turn }] : [];
  const out = dist(e, p) > 1 ? [{ x: e.x, y: e.y, plan: 0 }] : [];
  const first = { x: from.x, y: from.y, plan: 0, ...(d > 1 ? {} : { arc: turn }) };
  return Object.assign([first, ...straight, ...arc, ...out, ...arcToAim(geo, theta)], { turnDeg, turnRadiusFt: rt, straightFt: d });
}

function highKeyPath(geo, from) {
  const run = geo.along(-PFL.highKeyRunInFt);
  return [{ x: from.x, y: from.y, plan: 0 }, { x: run.x, y: run.y, plan: 0 }, { x: geo.th.x, y: geo.th.y, plan: 0, theta: 0, key: 'high_key', highKeyCheck: true }];
}

function orbitPath(from, trackDeg, r) {
  const h = { x: Math.sin(trackDeg * DEG), y: Math.cos(trackDeg * DEG) };
  const c = { x: from.x - r * h.y, y: from.y + r * h.x };
  const turn = { cx: c.x, cy: c.y, r, side: -1 };
  const pts = [{ x: from.x, y: from.y, plan: 0, arc: turn }];
  for (let k = PFL.joinStepDeg; k < 360 - 1e-6; k += PFL.joinStepDeg) {
    const a = (trackDeg - k) * DEG;
    pts.push({ x: c.x + r * Math.cos(a), y: c.y - r * Math.sin(a), plan: 0, arc: turn });
  }
  return pts;
}

function interceptPath(geo, from, theta, trackDeg, turnRadiusFt) {
  if (!Number.isFinite(trackDeg)) return null;
  const p = geo.at(theta);
  const lineTrk = bearing(from, p);
  const first = Math.abs(wrapDeg180(lineTrk - trackDeg));
  const onto = Math.abs(wrapDeg180(geo.trackAt(theta) - lineTrk));
  if (first > 120 || onto > PFL.interceptOntoDeg) return null;
  const arc = leadTurn(from, trackDeg, p);
  const exitArc = arc.length ? arc[arc.length - 1] : { x: from.x, y: from.y };
  const straightLeg = dist(exitArc, p) > 10 ? [{ x: exitArc.x, y: exitArc.y, plan: 0 }] : [];
  const startPts = arc.length ? [{ x: from.x, y: from.y, plan: 0, arc: arc[0].arc }, ...arc, ...straightLeg] : [{ x: from.x, y: from.y, plan: 0 }];
  return Object.assign([...startPts, ...arcToAim(geo, theta)], { turnDeg: first + onto, straightFt: dist(from, p), turnRadiusFt });
}

function directPath(geo, from, aimAlongFt, gearAtJoin = true, headingDeg = undefined) {
  const straight = directPathFrom(geo, from, aimAlongFt, gearAtJoin);
  const arc = leadTurn(from, headingDeg, straight[1]);
  if (!arc.length) return straight;
  return [straight[0], ...arc, ...directPathFrom(geo, arc[arc.length - 1], aimAlongFt, gearAtJoin).slice(1)];
}

function leadTurn(from, headingDeg, target) {
  if (!Number.isFinite(headingDeg) || !target) return [];
  const off = wrapDeg180(bearing(from, target) - headingDeg);
  if (Math.abs(off) <= 10) return [];
  const side = off > 0 ? 1 : -1;
  const rt = directTurnRadiusFt();
  const c = { x: from.x + rt * Math.sin((headingDeg + side * 90) * DEG), y: from.y + rt * Math.cos((headingDeg + side * 90) * DEG) };
  const turn = { cx: c.x, cy: c.y, r: rt, side };
  const arc = [];
  for (let k = PFL.joinStepDeg; k < 360; k += PFL.joinStepDeg) {
    const h = headingDeg + side * k;
    const b = h - side * 90;
    const p = { x: c.x + rt * Math.sin(b * DEG), y: c.y + rt * Math.cos(b * DEG), plan: 0, arc: turn };
    arc.push(p);
    if (dist(c, target) <= rt || Math.abs(wrapDeg180(bearing(p, target) - h)) <= PFL.joinStepDeg) break;
  }
  return arc;
}

function directPathFrom(geo, from, aimAlongFt, gearAtJoin) {
  const j = geo.along(aimAlongFt - PFL.directFinalFt);
  const rt = directTurnRadiusFt();
  let best = null;
  for (const side of [1, -1]) {
    const n = { x: -geo.u.y * side, y: geo.u.x * side };
    const c = { x: j.x + n.x * rt, y: j.y + n.y * rt };
    const bJ = bearing(c, j);
    const arc = [];
    let len = 0;
    if (dist(from, c) > rt * 1.05) {
      let bestB = bJ, bestErr = Infinity;
      for (let k = 0; k < 360; k += 1) {
        const bb = bJ + side * k;
        const p = { x: c.x + rt * Math.sin(bb * DEG), y: c.y + rt * Math.cos(bb * DEG) };
        const err = Math.abs(wrapDeg180(bearing(from, p) - (bb - side * 90)));
        if (err < bestErr) { bestErr = err; bestB = bb; }
      }
      const turnDeg = Math.abs(bestB - bJ);
      for (let k = 0; k < turnDeg - 1e-6; k += PFL.joinStepDeg) { const bb = bestB - side * k; arc.push({ x: c.x + rt * Math.sin(bb * DEG), y: c.y + rt * Math.cos(bb * DEG), plan: 0 }); }
      len = (arc.length ? dist(from, arc[0]) : dist(from, j)) + rt * turnDeg * DEG;
    } else {
      len = dist(from, j) + Math.PI * rt;
    }
    if (!best || len < best.len) best = { len, arc };
  }
  return [{ x: from.x, y: from.y, plan: 0, key: 'direct' }, ...best.arc, { x: j.x, y: j.y, plan: gearAtJoin ? 1 : 0, key: 'lined_up' }, ...finalToAim(geo, aimAlongFt)];
}

function turnOntoRunway(geo, from, trackDeg, kias, altFt, wind) {
  if (!Number.isFinite(trackDeg)) return [];
  const h = { x: Math.sin(trackDeg * DEG), y: Math.cos(trackDeg * DEG) };
  const nl = { x: -geo.u.y, y: geo.u.x };
  const off = (from.x - geo.th.x) * nl.x + (from.y - geo.th.y) * nl.y;
  const vMax = ktToFtps(iasToTasKt(kias, altFt) + (wind?.windKt ?? 0));
  const bankMax = Math.min(PFL.maxBankDeg, Math.acos(1 / Math.max(stallG(kias, 0), 1.0001)) / DEG);
  const rMin = turnRadiusFromBankFt(vMax, bankMax);
  const rMax = turnRadiusFromBankFt(ktToFtps(iasToTasKt(kias, altFt)), PFL.directMinBankDeg);
  const out = [];
  for (const side of [1, -1]) {
    const hr = { x: side * h.y, y: -side * h.x };
    const k = hr.x * nl.x + hr.y * nl.y + side;
    if (Math.abs(k) < 1e-6) continue;
    const turnDeg = wrapDeg360(side * (geo.rwyDeg - trackDeg));
    if (turnDeg < 3 || turnDeg > 180) continue;
    let r = -off / k, d = 0;
    if (r > rMax) {
      r = Math.max(rMin, directTurnRadiusFt());
      const conv = h.x * nl.x + h.y * nl.y;
      d = Math.abs(conv) < 1e-6 ? -1 : (-r * k - off) / conv;
    }
    if (!(r >= rMin && r <= rMax) || !(d >= 0)) continue;
    const s0 = { x: from.x + h.x * d, y: from.y + h.y * d };
    const c = { x: s0.x + hr.x * r, y: s0.y + hr.y * r };
    const roll = { x: c.x - side * r * geo.u.y, y: c.y + side * r * geo.u.x };
    const rollAlong = (roll.x - geo.th.x) * geo.u.x + (roll.y - geo.th.y) * geo.u.y;
    if (rollAlong > PFL.touchdownFt) continue;
    const turn = { cx: c.x, cy: c.y, r, side };
    const arc = [];
    for (let a = PFL.joinStepDeg; a < turnDeg - 1e-6; a += PFL.joinStepDeg) {
      const hd = (trackDeg + side * a) * DEG;
      arc.push({ x: c.x - side * r * Math.cos(hd), y: c.y + side * r * Math.sin(hd), plan: 0, arc: turn });
    }
    const first = Math.max(PFL.touchdownFt, rollAlong + PFL.directPastRollOutFt);
    for (let along = first; along >= Math.max(rollAlong + PFL.directPastRollOutFt, PFL.directPastRollOutFt) - 1e-6 && along <= geo.lenFt - PFL.stopMarginFt; along -= 250) {
      const start = d > 1 ? [{ x: from.x, y: from.y, plan: 0, key: 'direct' }, { x: s0.x, y: s0.y, plan: 0, arc: turn }] : [{ x: from.x, y: from.y, plan: 0, key: 'direct', arc: turn }];
      const path = [...start, ...arc, { x: roll.x, y: roll.y, plan: 1, key: 'lined_up' }, ...finalToAim(geo, along)];
      out.push({ path, aimAlongFt: along, carriesOnTurn: true });
    }
  }
  return out;
}

export function chooseDirect(geo, from, altFt, kias, wind, trackDeg = undefined, cfgNow = 0) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  const last = geo.lenFt - PFL.stopMarginFt;
  const trade = speedTradeFt(kias, altFt, 1);
  const baseAlong = Math.max(500, geo.aimAlongFt);
  const alongs = [];
  for (let d = 0; baseAlong + d <= last + 1e-6 || baseAlong - d >= 500; d += 500) {
    if (baseAlong - d >= 500 && d > 0) alongs.push(baseAlong - d);
    if (baseAlong + d <= last + 1e-6) alongs.push(baseAlong + d);
  }
  const label = (along) => (along > baseAlong + 1 ? 'Turn early, land long' : 'Direct runway');
  const cands = turnOntoRunway(geo, from, trackDeg, kias, altFt, wind).map((c) => ({ ...c, label: label(c.aimAlongFt) }));
  for (const along of alongs) {
    cands.push({ path: directPath(geo, from, along, true, trackDeg), aimAlongFt: along, label: label(along) });
  }
  const spare = (c) => altFt - neededFt(minDragPlan(c.path), 0, from, altFt, cfgNow, wind) - ground;
  const pick = cands.find((c) => spare(c) >= 0) ?? cands.find((c) => spare(c) + trade >= 0);
  return pick ? { kind: 'direct', ...pick } : null;
}

function widenPath(geo, path, seg, s, altFt, wind, tdKey) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  const own = bearing(geo.centre, s);
  let thOwn = 0;
  for (let th = 0; th < 360; th += 1) if (Math.abs(wrapDeg180(bearing(geo.centre, geo.at(th)) - own)) < Math.abs(wrapDeg180(bearing(geo.centre, geo.at(thOwn)) - own))) thOwn = th;
  const th0 = Math.max(path[seg]?.theta ?? 0, thOwn);
  if (th0 >= PFL.lastJoinDeg - PFL.joinStepDeg) return null;
  const fk = path.findIndex((p, i) => i > seg && p.theta !== undefined && p.theta >= PFL.lastJoinDeg);
  if (fk < 0) return null;
  const out = (p) => { const d = dist(geo.centre, p); return { x: (p.x - geo.centre.x) / d, y: (p.y - geo.centre.y) / d }; };
  const base0 = geo.at(th0);
  const now = dist(geo.centre, s) - dist(geo.centre, base0);
  const windFromDeg = geo.windFromDeg ?? 360;
  const up = { x: Math.sin(windFromDeg * DEG), y: Math.cos(windFromDeg * DEG) };
  const build = (k) => {
    const pts = [{ x: s.x, y: s.y, theta: th0, plan: path[seg]?.plan ?? 3 }];
    for (let th = th0 + PFL.joinStepDeg; th < PFL.lastJoinDeg - 1e-6; th += PFL.joinStepDeg) {
      const f = (th - th0) / (PFL.lastJoinDeg - th0);
      const off = now * (1 - f) + k * Math.sin(Math.PI * f);
      const p = geo.at(th), u = out(p);
      const kShift = geo.shiftFt ? geo.shiftFt * (1 - clamp(th, 0, 360) / 360) : 0;
      const c = { x: geo.centre.x + up.x * kShift, y: geo.centre.y + up.y * kShift };
      const arc = { cx: c.x, cy: c.y, r: geo.r + off, side: -1 };
      const pt = { x: p.x + u.x * off, y: p.y + u.y * off, theta: th, plan: planAt(th), key: keyAt(th), arc };
      // Centerline boundary guard: Pattern side must never cross over runway centerline
      const offRwy = legOffsetsFt(geo.th, geo.dep, pt);
      if (offRwy.crossFt > -300) return null;
      pts.push(pt);
    }
    const full = [...pts, ...path.slice(fk)];
    return full;
  };
  const spare = (k) => {
    const b = build(k);
    if (!b) return -Infinity;
    return altFt - ground - neededFt(b, 0, s, altFt, 3, wind, false, tdKey) - PFL.onProfileFt;
  };
  const maxW = build(PFL.maxWidenFt);
  if (maxW && spare(PFL.maxWidenFt) > 0) return maxW;
  let lo = 0, hi = PFL.maxWidenFt;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (spare(mid) > 0) lo = mid; else hi = mid;
  }
  return lo > 50 ? build(lo) : null;
}

function neededFt(path, seg, pos, altFt, cfgNow, wind, takeNext = false, stopAtKey = 'aim', maxPlan = 3) {
  const stop = path.findIndex((p) => p.key === stopAtKey);
  if (stop >= 0 && stop <= seg) return 0;
  let need = 0;
  let a = pos;
  let alt = altFt;
  const base = takeNext ? Math.min(3, cfgNow + 1) : cfgNow;
  for (let i = seg + 1; i < path.length; i++) {
    const b = path[i];
    const len = dist(a, b);
    if (len > 1) {
      const cfg = Math.max(base, Math.min(maxPlan, path[i - 1].plan ?? 0));
      const kias = glideKias(cfg);
      const tas = iasToTasKt(kias, alt);
      const trk = bearing(a, b);
      const wt = windTriangle(trk, tas, wind.windFromDeg ?? 360, wind.windKt ?? 0);
      const gs = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 20) : 20;
      let g = 1;
      const c = path[i + 1];
      if (c) {
        const turn = Math.abs(wrapDeg180(bearing(b, c) - trk)) * DEG;
        if (turn > 1e-3) {
          const omega = ktToFtps(gs) * turn / Math.max(len, 1);
          g = Math.min(2, Math.hypot(1, ktToFtps(tas) * omega / G_FTPS2));
        }
      }
      const air = len * tas / gs;
      const dh = air * glideDragPerWeight(PFL_CONFIGS[cfg], kias, alt, g) / heightFactor(alt);
      need += dh;
      alt -= dh;
    }
    if (b.key === stopAtKey) break;
    a = b;
  }
  return need;
}

function neededTo(path, toIdx, from, altFt, wind) {
  let need = 0;
  let a = from;
  let alt = altFt;
  for (let i = 1; i <= toIdx && i < path.length; i++) {
    const b = path[i];
    const len = dist(a, b);
    if (len > 1) {
      const tas = iasToTasKt(PFL.glideCleanKias, alt);
      const wt = windTriangle(bearing(a, b), tas, wind.windFromDeg ?? 360, wind.windKt ?? 0);
      const gs = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 20) : 20;
      const air = len * tas / gs;
      const dh = air * glideDragPerWeight('clean', PFL.glideCleanKias, alt, 1) / heightFactor(alt);
      need += dh;
      alt -= dh;
    }
    a = b;
  }
  return need;
}

function minDragPlan(path) {
  const fk = path.findIndex((p) => p.key === 'final_key' || p.key === 'lined_up' || (p.theta ?? 0) >= 270);
  return path.map((p, i) => ({ ...p, plan: fk >= 0 && i >= fk ? Math.max(p.plan ?? 0, 1) : 0 }));
}

function pathFtTo(path, proj, key) {
  let ft = 0;
  let a = proj.pt;
  for (let i = proj.seg + 1; i < path.length; i++) {
    ft += dist(a, path[i]);
    if (path[i].key === key) break;
    a = path[i];
  }
  return ft;
}

function project(path, seg, p) {
  let best = { seg, u: 0, d: Infinity, pt: path[seg] };
  for (let i = seg; i < Math.min(path.length - 1, seg + 6); i++) {
    const a = path[i], b = path[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
    const u = l2 ? clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / l2, 0, 1) : 0;
    const pt = { x: a.x + vx * u, y: a.y + vy * u };
    const d = dist(pt, p);
    if (d <= best.d + 1e-4) best = { seg: i, u, d, pt };
  }
  return best;
}


const ARC_TRACK_PER_FT = 0.05;
const ARC_BANK_PER_DEG = 3;

function arcBank(path, seg, s, tasFtps, pilot, bankMax) {
  const t = path[seg]?.arc;
  if (!t || !path[seg + 1]?.arc) return null;
  const c = { x: t.cx, y: t.cy };
  const offFt = dist(c, s) - t.r;
  const wantTrack = bearing(c, s) + t.side * 90 + t.side * clamp(offFt * ARC_TRACK_PER_FT, -30, 30);
  const heldDeg = Math.atan(tasFtps * pilot.groundSpeedFtps() / (G_FTPS2 * t.r)) / DEG;
  return clamp(t.side * heldDeg + ARC_BANK_PER_DEG * wrapDeg180(wantTrack - pilot.trackDeg()), -bankMax, bankMax);
}

function joinLabel(theta) {
  if (Math.abs(theta) < 1e-6) return 'Join at High Key';
  if (Math.abs(theta - 180) < 1e-6) return 'Join at Low Key';
  if (Math.abs(theta - 270) < 1e-6) return 'Join at Final Key';
  return `Join at ${Math.round(theta)}°`;
}

// ── Drop-in chooseJoin Implementation ─────────────────────────────────────────

export function chooseJoin(geo, from, availFt, trackDeg, wind, { allowHighKey = true, turnRadiusFt = directTurnRadiusFt(), minTurnRadiusFt = glideJoinMinRadiusFt(), bankDeg = 0 } = {}) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  const hk = highKeyPath(geo, from);
  const atHk = availFt - neededFt(hk, 0, from, availFt, 0, wind, false, 'high_key');
  if (allowHighKey && atHk >= PFL.highKeyMinFt) {
    return { kind: 'highKey', path: [...hk, ...arcToAim(geo, PFL.joinStepDeg)], theta: 0, label: 'Join at High Key' };
  }

  const leftMaxDeg = bankDeg <= -PFL.inTurnBankDeg ? 270 : 180;
  const isDownwindTrack = Math.abs(wrapDeg180(trackDeg - (geo.rwyDeg - 180))) <= 35;
  const search = (oneTurn) => {
    let best = null, bestHigh = null;
    for (let th = 0; th <= PFL.lastJoinDeg + 1e-6; th += PFL.joinStepDeg) {
      if (th < 45 && (!allowHighKey || atHk < PFL.highKeyMinFt)) continue;
      const tries = oneTurn ? [-1, 1].map((side) => joinPath(geo, from, th, trackDeg, turnRadiusFt, minTurnRadiusFt, side)) : [joinPath(geo, from, th)];
      if (oneTurn) tries.push(interceptPath(geo, from, th, trackDeg, turnRadiusFt));
      const downwindPref = isDownwindTrack && th <= 180 ? -120 : 0;
      const score = (p) => (oneTurn ? p.turnDeg + p.straightFt / 1000 + 1000 * (turnRadiusFt - p.turnRadiusFt) / turnRadiusFt + downwindPref : Math.abs(wrapDeg180(geo.trackAt(th) - trackDeg)) + downwindPref);
      const path = tries.filter((p, k) => p && (!oneTurn || p.turnDeg <= (k === 0 ? leftMaxDeg : 180))).sort((x, y) => score(x) - score(y))[0];
      if (!path) continue;
      const toJoinIdx = path.findIndex((p) => p.theta === th);
      const toJoin = neededTo(path, toJoinIdx, from, availFt, wind);
      const hAtJoin = availFt - toJoin;
      const least = neededFt(minDragPlan(path), toJoinIdx, path[toJoinIdx], hAtJoin, 0, wind);
      if (hAtJoin - least - ground < 0) continue;
      const most = neededFt(path.map((p) => ({ ...p, plan: 3 })), toJoinIdx, path[toJoinIdx], hAtJoin, 0, wind);
      const pick = { turn: score(path), turnDeg: path.turnDeg ?? 0, th, path };
      const longFt = (hAtJoin - most - ground) * flownGlideRatio(3, ground);
      const landable = th <= PFL.highJoinRoomDeg || geo.aimAlongFt + longFt <= geo.lenFt / 3;
      if (hAtJoin - most - ground <= 0) { if (!best || pick.turn < best.turn - 1e-6) best = pick; }
      else if (landable && (!bestHigh || pick.turn < bestHigh.turn - 1e-6)) bestHigh = pick;
    }
    if (best && bestHigh && best.turnDeg > bestHigh.turnDeg + PFL.fitsExtraTurnDeg) best = null;
    const asJoin = (pick, high) => pick && { kind: 'circle', path: pick.path, theta: pick.th, label: joinLabel(pick.th), high };
    return { best: asJoin(best, false), high: asJoin(bestHigh, true) };
  };

  const one = search(true);
  const run = search(false);
  const join = one.best ?? one.high ?? chooseDirect(geo, from, availFt, PFL.glideCleanKias, wind, trackDeg) ?? run.best ?? run.high;
  if (join) return join;
  return { kind: 'none', path: directPath(geo, from, geo.aimAlongFt, true, trackDeg), aimAlongFt: geo.aimAlongFt, label: 'Eject' };
}

// ── Phase 2: Task 4 - Standard Route Segment Chain Builders ───────────────────

export function buildSegmentChain({ startState, planKind, geo, wind, options = {} }) {
  const segments = [];
  let currentAlt = startState.alt;
  let fromPt = { x: startState.x, y: startState.y };
  let fromHdg = startState.headingDeg ?? RUNWAY_29L_HDG_DEG;

  if (startState.kias > 125.5) {
    const zoomSeg = generateZoomOrDecelSegment({
      x: startState.x,
      y: startState.y,
      alt: startState.alt,
      kias: startState.kias,
      headingDeg: fromHdg,
      wind,
    });
    segments.push(zoomSeg);
    currentAlt = zoomSeg.apexAltFt;
    fromPt = zoomSeg.apexPos;
    fromHdg = zoomSeg.exitHeadingDeg;
  }

  let plan;
  if (planKind === 'highKey') {
    plan = { kind: 'highKey', path: [{ x: fromPt.x, y: fromPt.y, plan: 0, theta: 0, key: 'high_key', highKeyCheck: true }, ...arcToAim(geo, PFL.joinStepDeg)], theta: 0, label: 'At High Key' };
  } else if (planKind === 'lowKey') {
    plan = { kind: 'lowKey', path: [{ x: fromPt.x, y: fromPt.y, plan: 1, theta: 180, key: 'low_key' }, ...arcToAim(geo, 180 + PFL.joinStepDeg)], theta: 180, label: 'At Low Key' };
  } else if (planKind === 'direct') {
    plan = chooseDirect(geo, fromPt, currentAlt, PFL.glideCleanKias, wind, fromHdg);
  } else if (planKind === 'circle') {
    plan = chooseJoin(geo, fromPt, currentAlt, fromHdg, wind, options);
  } else {
    const apexPred = predictApexEnergy({ startState, wind });
    plan = chooseJoin(geo, fromPt, apexPred.energyHeightFt, fromHdg, wind, options);
  }

  const path = plan?.path ?? [];
  if (path.length > 0) {
    let a = path[0];
    for (let i = 1; i < path.length; i++) {
      const b = path[i];
      const d = dist(a, b);
      if (d > 1) {
        const cfg = b.plan ?? 0;
        const kias = glideKias(cfg);
        if (b.arc) {
          const seg = evaluateArcSegment({
            startPt: a,
            startHeadingDeg: bearing(a, b),
            startAltFt: currentAlt,
            turnDeg: PFL.joinStepDeg,
            bankDeg: 30,
            side: b.arc.side ?? 1,
            speedKias: kias,
            config: cfg,
            wind,
          });
          segments.push(seg);
          currentAlt = seg.exitAltFt;
        } else {
          const seg = evaluateStraightSegment({
            startPt: a,
            headingDeg: bearing(a, b),
            startAltFt: currentAlt,
            distanceFt: d,
            speedKias: kias,
            config: cfg,
            wind,
          });
          segments.push(seg);
          currentAlt = seg.exitAltFt;
        }
      }
      a = b;
    }
  }

  let totalDeltaAltFt = 0, totalDistFt = 0, totalTimeSec = 0;
  for (const s of segments) {
    totalDeltaAltFt += s.deltaAltFt ?? 0;
    totalDistFt += s.deltaDistFt ?? 0;
    totalTimeSec += s.timeSec ?? 0;
  }

  return {
    planKind: plan?.kind ?? planKind ?? 'unknown',
    label: plan?.label ?? '',
    segments,
    totalDeltaAltFt,
    totalDistFt,
    totalTimeSec,
    points: path,
  };
}

export function buildHighKeyChain(args) { return buildSegmentChain({ ...args, planKind: 'highKey' }); }
export function buildLowKeyChain(args) { return buildSegmentChain({ ...args, planKind: 'lowKey' }); }
export function buildAreaChain(args) { return buildSegmentChain({ ...args, planKind: 'highKey' }); }
export function buildDownwindChain(args) { return buildSegmentChain({ ...args, planKind: 'circle' }); }
export function buildDirectChain(args) { return buildSegmentChain({ ...args, planKind: 'direct' }); }

// ── Phase 3: Task 5 & 6 - Step Follower & Event-Driven Re-planner ─────────────

export function createSegmentFollowerState(chain) {
  return {
    chain,
    currentSegIdx: 0,
    timeInSegSec: 0,
    distInSegFt: 0,
    angleInSegDeg: 0,
    cfgIndex: 0,
    lastConfigChangeSec: -100,
    planGraceSec: PFL.planGraceSec,
    lastReplanSec: 0,
    lastMilestoneTag: undefined,
  };
}

export function stepPflSegmentFollower(pilot, followerState, dt, wind) {
  const { chain, currentSegIdx } = followerState;
  const seg = chain.segments[currentSegIdx];
  if (!seg) return;

  const s = pilot.s;
  followerState.timeInSegSec += dt;

  let wantBank = seg.bankDeg ?? 0;
  const tasFtps = ktToFtps(iasToTasKt(s.ias, s.alt));
  const dw = glideDragPerWeight(PFL_CONFIGS[followerState.cfgIndex], s.ias, s.alt, Math.max(1, 1 / Math.cos(wantBank * DEG)));
  const climbFtps = -tasFtps * dw;
  pilot.step(wantBank, climbFtps, 0);

  if (seg.type === 'arc') {
    followerState.angleInSegDeg += Math.abs(turnRateFromBankRadPerSec(tasFtps, wantBank) * RAD * dt);
    if (followerState.angleInSegDeg >= (seg.turnDeg ?? PFL.joinStepDeg)) {
      followerState.currentSegIdx++;
      followerState.angleInSegDeg = 0;
      followerState.timeInSegSec = 0;
    }
  } else if (seg.type === 'straight') {
    followerState.distInSegFt += tasFtps * dt;
    if (followerState.distInSegFt >= seg.deltaDistFt) {
      followerState.currentSegIdx++;
      followerState.distInSegFt = 0;
      followerState.timeInSegSec = 0;
    }
  } else if (seg.type === 'zoom' || seg.type === 'decel') {
    if (followerState.timeInSegSec >= seg.timeSec) {
      followerState.currentSegIdx++;
      followerState.timeInSegSec = 0;
    }
  }
}

export function shouldReplanPfl(pilotState, followerState, elapsedSec, path = null, seg = 0, wind = null) {
  if (elapsedSec - followerState.lastReplanSec < followerState.planGraceSec) return false;
  if (pilotState.tag && pilotState.tag !== followerState.lastMilestoneTag) {
    followerState.lastMilestoneTag = pilotState.tag;
    followerState.lastReplanSec = elapsedSec;
    return true;
  }
  if (path && wind) {
    const margin = pilotState.alt - THRESHOLD_DATA_ELEV_FT - neededFt(path, seg, pilotState, pilotState.alt, followerState.cfgIndex, wind);
    if (Math.abs(margin) > PFL.dragBufferFt) {
      followerState.lastReplanSec = elapsedSec;
      return true;
    }
  }
  return false;
}

// ── Phase 5: Task 9 - UI & Overlay Readouts ───────────────────────────────────

export function getPflBadge(ac) {
  if (!ac) return null;
  const status = typeof ac.status === 'string' ? ac.status.toLowerCase() : '';
  const phase = typeof ac.phase === 'string' ? ac.phase.toLowerCase() : '';
  const segment = typeof ac.pflSegment === 'string' ? ac.pflSegment.toLowerCase() : '';

  if (
    status === 'ejected' ||
    phase === 'ejected' ||
    phase === 'eject' ||
    phase === 'ejection' ||
    phase === 'pfl_eject' ||
    segment === 'eject' ||
    segment === 'ejected'
  ) {
    return '[EJECT]';
  }
  if (
    status === 'crashed' ||
    phase === 'crash_short' ||
    phase === 'pfl_crash' ||
    phase === 'crashed' ||
    phase === 'crash' ||
    segment === 'crash' ||
    segment === 'crash_short'
  ) {
    return '[CRASH SHORT]';
  }
  const marginStr = Number.isFinite(ac.pflMarginFt) ? ` (${ac.pflMarginFt >= 0 ? '+' : ''}${Math.round(ac.pflMarginFt)} ft)` : '';
  if (ac.pflDecision) {
    return ac.config ? `[PFL: ${ac.pflDecision}${marginStr} · ${ac.config}]` : `[PFL: ${ac.pflDecision}${marginStr}]`;
  }
  if (phase === 'pfl_zoom' || phase === 'zoom' || phase === 'pfl_decel' || phase === 'decel' || segment === 'zoom' || segment === 'decel') return '[PFL: ZOOM]';
  if (phase === 'pfl_high_key' || phase === 'high_key' || phase === 'pfl_orbit' || phase === 'orbit' || segment === 'high_key') return '[PFL: HIGH KEY]';
  if (phase === 'pfl_low_key' || phase === 'low_key' || segment === 'low_key') return '[PFL: LOW KEY]';
  if (phase === 'pfl_base_key' || phase === 'base_key' || segment === 'base_key') return '[PFL: BASE KEY]';
  if (phase === 'pfl_direct' || phase === 'pfl_final' || phase === 'direct' || phase === 'direct_threshold' || phase === 'pfl_direct_threshold' || phase === 'final' || segment === 'direct' || segment === 'straight' || segment === 'arc' || segment === 'roundout' || segment === 'flare') return '[PFL: DIRECT]';
  return '[PFL: DIRECT]';
}

export function getPflSegmentPlanSummary(flight) {
  if (!flight?.planLog?.length) return [];
  const activePlan = flight.planLog[flight.planLog.length - 1]?.plan;
  return activePlan?.path ?? [];
}

// ── Drop-in flyPfl Implementation ─────────────────────────────────────────────

/**
 * Complete drop-in replacement for pfl.js:flyPfl using the Segment Planner architecture.
 */
export function flyPfl(start, wind = { windFromDeg: 360, windKt: 0 }, options = {}) {
  return flyPflSegmentPlanner(start, wind, options);
}

export function flyPflSegmentPlanner(start, wind = { windFromDeg: 360, windKt: 0 }, options = {}) {
  const practice = Boolean(options.practice);
  const geo = pflGeometry(wind.windFromDeg, wind.windKt, options.settings);
  const ground = THRESHOLD_DATA_ELEV_FT;
  const mid = options.midGlide ?? null;

  const pilot = makePilot(
    {
      x: start.x,
      y: start.y,
      alt: start.alt,
      ias: start.kias,
      hdg: start.headingDeg ?? RUNWAY_29L_HDG_DEG,
      src: 0,
      phase: mid ? 'pfl' : start.kias > 125.5 ? 'pfl_zoom' : 'pfl',
    },
    wind
  );

  const { s } = pilot;
  s.bank = Number.isFinite(start.bankDeg) ? start.bankDeg : 0;
  s.rollRate = Number.isFinite(start.rollRateDps) ? start.rollRateDps : 0;
  s.rec = { decision: '', config: PFL_CONFIG_LABELS[0] };
  let cfg = mid ? clamp(Math.round(mid.cfgIndex ?? 0), 0, 3) : 0;
  let margin = 0;
  let roundOut = null;

  const calcMarginTag = (m) => (m > 150 ? 'high' : m < -PFL.onProfileFt ? 'low' : 'on profile');
  const getSegmentType = () => {
    if (state === 'zoom') return 'zoom';
    if (state === 'slow') return 'decel';
    if (roundOut?.flare) return 'flare';
    if (roundOut) return 'roundout';
    if (path[seg]?.arc) return 'arc';
    return 'straight';
  };
  const setRec = (decision, extra = {}) => {
    const curSeg = extra.segmentType ?? getSegmentType();
    const curMarginFt = extra.marginFt !== undefined ? extra.marginFt : (Number.isFinite(margin) ? Math.round(margin) : null);
    const curMarginTag = extra.marginTag !== undefined ? extra.marginTag : (Number.isFinite(margin) ? calcMarginTag(margin) : null);
    s.rec = {
      decision,
      config: PFL_CONFIG_LABELS[cfg],
      cfgIndex: cfg,
      segmentType: curSeg,
      marginFt: curMarginFt,
      marginTag: curMarginTag,
      ...extra,
    };
  };

  // Phase 1 / Task 1 & 2: Unified Zoom & Apex Energy Prediction (eliminates F7)
  const zooming = !mid && start.kias > PFL.zoomAboveKias;
  const apexEnergy = !mid ? predictApexEnergy({ startState: start, wind }) : null;
  const avail = mid ? start.alt : apexEnergy.energyHeightFt;

  const zoomRadius = (kias) => turnRadiusFromBankFt(ktToFtps(iasToTasKt(kias, avail - 500)), PFL.zoomMaxBankDeg);
  const turnRadiusFt = zooming ? zoomRadius((start.kias + PFL.glideCleanKias) / 2) : directTurnRadiusFt();
  const minTurnRadiusFt = zooming ? zoomRadius(PFL.glideCleanKias) : glideJoinMinRadiusFt();

  const fromPt = zooming ? apexEnergy.apexPos : s;
  const fromHdg = zooming ? apexEnergy.exitHeadingDeg : (start.headingDeg ?? RUNWAY_29L_HDG_DEG);
  let plan = mid?.plan ?? chooseJoin(geo, fromPt, avail, fromHdg, wind, {
    turnRadiusFt, minTurnRadiusFt, bankDeg: s.bank,
  });

  if (!mid?.plan && Math.hypot(s.x - geo.th.x, s.y - geo.th.y) <= PFL.atHighKeyFt && avail >= PFL.highKeyMinFt) {
    plan = { kind: 'highKey', path: [{ x: s.x, y: s.y, plan: 0, theta: 0, key: 'high_key', highKeyCheck: true }, ...arcToAim(geo, PFL.joinStepDeg)], theta: 0, label: 'At High Key' };
  }

  const patternPfl = mid ? Boolean(mid.patternPfl) : !practice && plan.kind !== 'highKey' && plan.kind !== 'direct';
  let path = zooming ? [{ x: s.x, y: s.y, plan: 0 }, ...plan.path] : plan.path;
  let seg = 0;
  let state = mid ? 'glide' : zooming ? 'zoom' : 'slow';
  const tdKeyInit = path.some((p) => p.key === 'touchdown') ? 'touchdown' : 'aim';
  margin = cfg >= 3
    ? avail - ground - neededFt(path, 0, s, avail, cfg, wind, false, tdKeyInit)
    : avail - ground - neededFt(path, 0, s, avail, cfg, wind, false, 'aim', 2);
  setRec(mid ? (mid.decision || plan.label) : zooming ? `Zoom: ${plan.label.toLowerCase()}` : `Slow to 125: ${plan.label.toLowerCase()}`);
  s.tag = undefined;
  pilot.record();

  if (!zooming && state === 'glide' && (plan.kind === 'none' || plan.label === 'Eject')) {
    outcome = 'eject';
    eject = { x: s.x, y: s.y, alt: s.alt };
    setRec('Eject');
    notes.push(`ejected immediately (${Math.round(s.alt)} ft MSL)`);
    pilot.record();
    return { points: pilot.points, outcome, touchdown: null, eject, gate: null, plan: 'none', patternPfl, planLog, notes };
  }

  let gamma = mid ? -Math.asin(clamp(glideDragPerWeight(PFL_CONFIGS[cfg], start.kias, start.alt, 1), 0, 1)) : 0;
  let nz = 1, nzRate = 0;
  let pullDone = false;
  let lastKey = undefined;
  let gate = null;
  let outcome = null;
  let touchdown = null;
  let eject = null;
  let goingShort = false;
  let pastLowKey = false;
  let ejectAtN = null;
  const notes = [];
  const planLog = [];
  const MAX_STEPS = 25000;

  let n = 0;
  let planFromN = 0;
  let lastConfigChangeN = -100;

  const replan = (next) => {
    plan = next;
    path = next.path.map((p, i) => (i === 0 ? { ...p, x: s.x, y: s.y } : p));
    seg = 0;
    planFromN = n;
  };

  const onCircle = () =>
    path[seg]?.theta !== undefined ||
    path[seg]?.falseCircle ||
    ['threshold', 'touchdown', 'aim', 'rollout'].includes(path[seg]?.key) ||
    plan.kind === 'direct';

  for (n = 0; n < MAX_STEPS; n++) {
    s.rec.tSec = Math.round(n * PILOT_DT * 100) / 100;
    s.rec.segmentType = getSegmentType();
    if (Number.isFinite(margin)) {
      s.rec.marginFt = Math.round(margin);
      s.rec.marginTag = calcMarginTag(margin);
    }
    if (planLog[planLog.length - 1]?.plan.path !== path) {
      planLog.push({ at: pilot.points.length, plan: { ...plan, path } });
    }

    const tas = ktToFtps(iasToTasKt(s.ias, s.alt));
    const proj = project(path, seg, s);
    seg = proj.seg;

    const passed = path[seg];
    if (passed && passed !== lastKey) {
      lastKey = passed;
      if (passed.key && ['high_key', 'low_key', 'final_key'].includes(passed.key)) s.tag = passed.key;
      if (passed.key === 'low_key') pastLowKey = true;
      if (passed.highKeyCheck) {
        const rest = path.slice(seg + 1);
        let lapPath = null, lapClean = Infinity;
        if (s.alt > PFL.highKeyMaxFt) {
          const lap = orbitPath(s, geo.rwyDeg, orbitRadiusFt());
          lapPath = [...lap.map((p, i) => ({ ...p, plan: i ? 0 : cfg })), { x: geo.th.x, y: geo.th.y, theta: 0, plan: 0, key: 'high_key', highKeyCheck: true }];
          lapClean = neededFt(lapPath, 0, s, s.alt, 0, wind);
        }
        if (lapPath && s.alt - lapClean >= PFL.highKeyMinFt) {
          if (s.alt - lapClean > PFL.highKeyMaxFt && cfg < 1) {
            cfg = 1;
            lastConfigChangeN = n;
            notes.push('gear early to make the High Key window');
          }
          path = [...lapPath.map((p) => ({ ...p, plan: Math.max(p.plan, cfg) })), ...arcToAim(geo, PFL.joinStepDeg)];
          seg = 0;
          planFromN = n;
          setRec(cfg ? 'Orbit at High Key, gear early' : 'Orbit at High Key');
        } else if (lapPath && s.alt > PFL.highKeyMinFt) {
          if (lapPath && cfg < 1) {
            cfg = 1;
            lastConfigChangeN = n;
            notes.push('gear early: an orbit would end below the High Key window');
          }
          const hkProfile = ground + neededFt([{ x: geo.th.x, y: geo.th.y, plan: 1 }, ...arcToAim(geo, PFL.joinStepDeg)], 0, geo.th, s.alt, 1, wind, false, 'aim', 2);
          const excess = Math.max(0, s.alt - Math.max(PFL.highKeyMinFt, hkProfile));
          const d = Math.max(0, excess / 2 * heightFactor(s.alt) * flownGlideRatio(Math.max(cfg, 1), s.alt));
          const off = { x: geo.u.x * d, y: geo.u.y * d };
          const fhk = { x: geo.th.x + off.x, y: geo.th.y + off.y };
          const semi = [];
          for (let th = PFL.joinStepDeg; th <= 180 + 1e-6; th += PFL.joinStepDeg) {
            const p = geo.at(th);
            semi.push({ x: p.x + off.x, y: p.y + off.y, plan: 1, falseCircle: true, ...(th > 180 - 1e-6 ? { key: 'false_low_key' } : {}) });
          }
          const lk = geo.at(180);
          path = [{ x: s.x, y: s.y, plan: 1 }, { ...fhk, plan: 1, key: 'false_high_key', falseCircle: true }, ...semi, { x: lk.x, y: lk.y, theta: 180, plan: planAt(180), key: 'low_key' }, ...arcToAim(geo, 180 + PFL.joinStepDeg)];
          seg = 0;
          planFromN = n;
          setRec('False High Key');
        } else {
          path = [{ x: s.x, y: s.y, plan: cfg }, ...rest];
          seg = 0;
          planFromN = n;
        }
        lastKey = path[0];
      }
    }

    const stallBank = Math.acos(clamp(1 / Math.max(stallG(s.ias, cfg), 1.0001), 0, 1)) / DEG;
    const bankMax = state === 'zoom' ? PFL.zoomMaxBankDeg : Math.min(PFL.maxBankDeg, stallBank);

    // KINEMATIC SEGMENT BANK (Zero Carrot Follower!)
    let bank = 0;
    const curPt = path[seg];
    const nxtPt = path[seg + 1] ?? curPt;
    const turn = arcBank(path, seg, s, tas, pilot, bankMax);

    if (n * PILOT_DT < PFL.holdBankSec) {
      bank = s.bank;
    } else if (state === 'zoom') {
      const targetPt = path[seg + 1] ?? path[1] ?? s;
      const targetHdg = bearing(s, targetPt);
      bank = clamp(wrapDeg180(targetHdg - s.hdg) * 2, -PFL.zoomMaxBankDeg, PFL.zoomMaxBankDeg);
    } else if (state === 'slow') {
      const targetPt = path.find((p) => p.theta !== undefined) ?? path[1] ?? s;
      const targetHdg = bearing(s, targetPt);
      bank = clamp(wrapDeg180(targetHdg - s.hdg) * 1.5, -15, 15);
    } else if (
      roundOut ||
      ['threshold', 'aim', 'touchdown', 'rollout'].includes(curPt?.key) ||
      path.slice(0, seg + 1).some((p) => p.key === 'threshold') ||
      ((curPt?.theta ?? 0) >= 335 && legOffsetsFt(geo.th, geo.dep, s).crossFt > -500) ||
      ((curPt?.theta ?? 0) >= 270 && margin > 150 && legOffsetsFt(geo.th, geo.dep, s).alongFt <= -1000)
    ) {
      const offRwy = legOffsetsFt(geo.th, geo.dep, s);
      const corrDeg = clamp(-offRwy.crossFt * 0.15, -45, 45);
      const wantHdg = pilot.headingFor(wrapDeg360(geo.rwyDeg + corrDeg));
      const trkErr = Math.abs(wrapDeg180(pilot.trackDeg() - geo.rwyDeg));
      const maxB = Math.abs(offRwy.crossFt) > 50 || trkErr > 15 ? bankMax : 15;
      bank = bankFor(wantHdg, s, maxB);
    } else if (turn !== null) {
      bank = turn;
    } else {
      // Kinematic straight tracking along planned segment
      const segTrk = bearing(curPt, nxtPt);
      const off = legOffsetsFt(curPt, nxtPt, s);
      const corrDeg = clamp(-off.crossFt * 0.05, -25, 25);
      const wantHdg = pilot.headingFor(wrapDeg360(segTrk + corrDeg));
      bank = bankFor(wantHdg, s, bankMax);
    }

    let climb, accel;
    if (state === 'zoom') {
      const glideGamma = -Math.atan(1 / glideRatio('clean'));
      let nLoad;
      if (!pullDone && s.ias > PFL.pushOverKias) {
        nLoad = gamma < PFL.zoomMaxClimbDeg * DEG ? PFL.zoomPullG : Math.cos(gamma);
      } else {
        pullDone = true;
        const f = clamp((s.ias - PFL.glideCleanKias) / (PFL.pushOverKias - PFL.glideCleanKias), 0, 1);
        const want = glideGamma + (Math.max(gamma, glideGamma) - glideGamma) * f * 0.6;
        nLoad = clamp(Math.cos(gamma) + (want - gamma) * tas / G_FTPS2, 0, PFL.zoomPullG);
      }

      const eased = easeValue(nz, nzRate, nLoad * Math.cos(s.bank * DEG), PILOT_DT, { maxRateDps: PFL.gOnsetGps, maxAccelDps2: PFL.gOnsetGps2 });
      nz = eased.bankDeg; nzRate = eased.rollRateDps;
      const dw = glideDragPerWeight('clean', s.ias, s.alt, Math.max(nz / Math.cos(s.bank * DEG), 0.5));
      gamma += G_FTPS2 * (nz - Math.cos(gamma)) / tas * PILOT_DT;
      climb = tas * Math.sin(gamma);
      accel = -G_FTPS2 * (dw + Math.sin(gamma));
      if (pullDone && (s.ias <= PFL.glideCleanKias + 1.5 || gamma <= glideGamma)) {
        state = 'glide';
        // Apex reached: Task 6 milestone re-plan
        const re = chooseJoin(geo, s, s.alt, pilot.trackDeg(), wind, { bankDeg: s.bank });
        if (!re || re.kind === 'none' || re.label === 'Eject') {
          outcome = 'eject';
          eject = { x: s.x, y: s.y, alt: s.alt };
          setRec('Eject at top of zoom');
          notes.push(`ejected at top of zoom (${Math.round(s.alt)} ft MSL)`);
          pilot.record();
          break;
        } else if (re.kind === 'circle') {
          const curTh = plan.theta;
          if (curTh !== undefined && re.theta !== undefined && curTh <= 180 && re.theta > 180) {
            // Keep intercepting downwind before Low Key rather than cutting straight to Base Key
          } else {
            replan(re);
          }
        } else {
          replan(re);
        }
      }
    } else {
      let want = glideKias(cfg);
      if (state === 'slow' && s.ias <= PFL.glideCleanKias + 0.5) {
        state = 'glide';
        if (plan.kind === 'none' || plan.label === 'Eject') {
          const re = chooseJoin(geo, s, s.alt, pilot.trackDeg(), wind, { bankDeg: s.bank });
          if (!re || re.kind === 'none' || re.label === 'Eject') {
            outcome = 'eject';
            eject = { x: s.x, y: s.y, alt: s.alt };
            setRec('Eject');
            notes.push(`ejected after decel (${Math.round(s.alt)} ft MSL)`);
            pilot.record();
            break;
          }
        }
      }

      if (plan.kind === 'direct' && margin < 0 && !goingShort) {
        const v2 = tas * tas - 2 * G_FTPS2 * -margin * heightFactor(s.alt);
        const vKt = Math.sqrt(Math.max(v2, 0)) / KT_TO_FTPS;
        want = Math.max(tradeFloorKias(cfg), Math.min(want, vKt * PFL.glideGearKias / Math.max(iasToTasKt(PFL.glideGearKias, s.alt), 1)));
      }

      const turnG = Math.tan(s.bank * DEG) * Math.cos(gamma);
      const dw = glideDragPerWeight(PFL_CONFIGS[cfg], s.ias, s.alt, Math.max(Math.hypot(nz, turnG), 0.5));
      const hAgl = s.alt - ground;
      const linedUp = hAgl <= PFL.preFlareFt && Math.abs(wrapDeg180(pilot.trackDeg() - geo.rwyDeg)) <= PFL.roundOutTrackDeg;
      if (linedUp && !roundOut) {
        roundOut = { flare: false };
        s.rec.segmentType = getSegmentType();
        notes.push(`round-out at ${Math.round(s.ias)} KIAS`);
      }
      if (roundOut) want = Math.min(want, PFL.thresholdKias[cfg]);

      const wantTas = ktToFtps(iasToTasKt(want, s.alt));
      const wantAccel = clamp((wantTas - tas) / 3, -PFL.maxAccelG * G_FTPS2, PFL.maxAccelG * G_FTPS2);
      let wantGamma = state === 'slow' ? 0 : Math.asin(clamp(-dw - wantAccel / G_FTPS2, -1, 1));

      if (roundOut) {
        const sinkNow = -tas * Math.sin(gamma);
        if (!roundOut.flare && hAgl <= Math.max(PFL.flareFromFt, sinkNow * PFL.flareTauSec)) {
          roundOut.flare = true;
          s.rec.segmentType = getSegmentType();
          notes.push(`flare at ${Math.round(hAgl)} ft, ${Math.round(s.ias)} KIAS`);
        }
        if (roundOut.flare) wantGamma = -Math.asin(clamp(Math.max(PFL.flareTouchSinkFtps, hAgl / PFL.flareTauSec) / tas, 0, 1));
        else if (s.ias > PFL.thresholdKias[cfg] + 0.5) wantGamma = Math.max(wantGamma, -PFL.preFlareDeg * DEG);
      }

      const nzHigh = Math.sqrt(Math.max(0, Math.min(PFL.glideMaxG, stallG(s.ias, cfg)) ** 2 - turnG ** 2));
      const nzWant = clamp(dampedClimbG(gamma, wantGamma, tas), 0, Math.max(nzHigh, Math.cos(gamma)));
      const eased = easeValue(nz, nzRate, nzWant, PILOT_DT, { maxRateDps: PFL.gOnsetGps, maxAccelDps2: PFL.gOnsetGps2 });
      nz = eased.bankDeg; nzRate = eased.rollRateDps;
      gamma += G_FTPS2 * (nz - Math.cos(gamma)) / tas * PILOT_DT;
      climb = tas * Math.sin(gamma);
      accel = -G_FTPS2 * (dw + Math.sin(gamma));
    }

    // Staged Drag & Event Decisions (n % 10 === 0)
    if (!goingShort && state !== 'zoom' && state !== 'slow' && n % 10 === 0) {
      if (state === 'apex') state = 'glide';
      const tdKey = path.some((p) => p.key === 'touchdown') ? 'touchdown' : 'aim';
      margin = cfg >= 3
        ? s.alt - ground - neededFt(path, seg, proj.pt, s.alt, cfg, wind, false, tdKey)
        : s.alt - ground - neededFt(path, seg, proj.pt, s.alt, cfg, wind, false, 'aim', 2);
      const marginMin = s.alt - ground - neededFt(minDragPlan(path), seg, proj.pt, s.alt, Math.min(cfg, 1), wind, false, cfg >= 3 ? tdKey : 'aim');
      const onFinal = ['threshold', 'touchdown', 'aim', 'rollout'].includes(path[seg]?.key) || path.slice(0, seg + 1).some((p) => p.key === 'threshold');
      const settled = (n - planFromN) * PILOT_DT >= PFL.planGraceSec;
      const inOrbit = s.rec.decision?.startsWith('Orbit') || s.rec.decision?.startsWith('False High Key') || s.alt > PFL.highKeyMaxFt;
      if (!onFinal && settled && !inOrbit && marginMin < -PFL.dragBufferFt && plan.kind !== 'direct') {
        const direct = chooseDirect(geo, s, s.alt, s.ias, wind, pilot.trackDeg(), cfg);
        if (direct) { replan(direct); notes.push(`went direct at ${Math.round(s.alt)} ft`); }
      } else if (!onFinal && plan.kind === 'direct' && marginMin + speedTradeFt(s.ias, s.alt, cfg) < 0) {
        const direct = chooseDirect(geo, s, s.alt, s.ias, wind, pilot.trackDeg(), cfg);
        if (direct && direct.aimAlongFt > (plan.aimAlongFt ?? 0) + 1) replan(direct);
      }

      const directDragOk = plan.kind === 'direct' && (path[seg]?.key === 'lined_up' || onFinal || s.alt <= ground + 200 || dist(geo.th, s) <= 4 * 6076.12);
      const circleDragOk = plan.kind !== 'direct' && onCircle();
      const dragOk = directDragOk || circleDragOk;
      const notLow = marginMin >= -PFL.dragBufferFt;
      const dragSpacingOk = (n - lastConfigChangeN) * PILOT_DT >= PFL.minConfigIntervalSec;
      if (dragSpacingOk && notLow) {
        if (cfg < 1) {
          const directOk = plan.kind === 'direct' && (path[seg]?.key === 'lined_up' || onFinal || s.alt <= ground + 200 || (dist(geo.th, s) <= 4 * 6076.12 && s.alt - ground - neededFt(path, seg, proj.pt, s.alt, 1, wind, true, 'aim', 2) >= PFL.dragBufferFt));
          const circleOk = plan.kind !== 'direct' && (
            ((s.tag === 'low_key' || (path[seg]?.theta ?? 0) >= 180) && margin >= -PFL.onProfileFt) ||
            (s.alt <= PFL.gateAltFt + 300) ||
            (patternPfl && state === 'glide' && margin > PFL.keysCarryHighFt && dist(geo.th, s) <= PFL.earlyGearWithinFt)
          );
          if (directOk || circleOk) {
            cfg = 1;
            lastConfigChangeN = n;
          }
        } else if (dragOk && cfg === 2) {
          const offRwy = legOffsetsFt(geo.th, geo.dep, s);
          const canLandingFlap = onFinal || (path[seg]?.theta !== undefined && path[seg].theta >= 225) || (plan.kind === 'direct' && path[seg]?.key === 'lined_up') || (offRwy.alongFt <= -1000 && Math.abs(offRwy.crossFt) <= 500);
          if (canLandingFlap && s.alt - ground - neededFt(path, seg, proj.pt, s.alt, 3, wind, false, tdKey) >= 0) {
            cfg = 3;
            lastConfigChangeN = n;
          }
        } else if (dragOk && cfg === 1) {
          const due = (path[seg]?.plan ?? 0) > cfg;
          const earlyOk = (path[seg]?.theta !== undefined && path[seg].theta >= 180) || onFinal || (margin > PFL.keysCarryHighFt && dist(geo.th, s) <= 3 * 6076.12) || (margin > PFL.dragBufferFt && state === 'glide');
          if (due ? margin >= -PFL.onProfileFt : earlyOk && s.alt - ground - neededFt(path, seg, proj.pt, s.alt, cfg, wind, true, 'aim', 2) >= PFL.dragBufferFt) {
            cfg = 2;
            lastConfigChangeN = n;
          }
        }
      }

      const thNow = path[seg]?.theta;
      const canWiden = onCircle() && Math.abs(s.bank) <= 30 && n % 50 === 0 && plan.kind !== 'direct' && thNow !== undefined && thNow < PFL.lastJoinDeg - PFL.joinStepDeg;
      if (canWiden) {
        const high = s.alt - ground - neededFt(path, seg, proj.pt, s.alt, 3, wind, false, tdKey);
        if (high > PFL.widenAboveFt) {
          const wide = widenPath(geo, path, seg, s, s.alt, wind, tdKey);
          if (wide) {
            const pWide = project(wide, 0, s);
            path = wide;
            seg = pWide.seg;
            planFromN = n;
            notes.push(`widened at ${Math.round(s.alt)} ft`);
          }
        }
      }

      let decision;
      if (plan.kind === 'direct') decision = s.ias < PFL.glideGearKias - 2 ? 'Trading speed' : plan.label;
      else if (path[seg]?.falseCircle) decision = path.slice(0, seg + 1).some((p) => p.key === 'false_low_key') ? 'False Low Key' : 'False High Key';
      else if (s.rec.decision?.startsWith('Orbit') && path[seg]?.key !== 'threshold' && seg < path.findIndex((p) => p.highKeyCheck)) decision = s.rec.decision;
      else if (!onCircle()) decision = plan.label;
      else {
        const word = margin > 150 ? 'high' : margin < -PFL.onProfileFt ? 'low' : 'on profile';
        const th = path[seg]?.theta;
        const offRwy = legOffsetsFt(geo.th, geo.dep, s);
        const leg = th === undefined ? 'Final' : th < 180 ? 'To Low Key' : th < 270 ? 'To Final Key' : (margin > 150 && offRwy.alongFt <= -1000 ? 'Dogleg final' : 'To threshold');
        decision = `${leg}, ${word}`;
      }
      setRec(decision);
    }

    if (state === 'glide' && s.phase === 'pfl_zoom') {
      s.phase = 'pfl';
      if (!practice && ejectAtN === null && obviouslyShort(geo, s, cfg, wind)) {
        ejectAtN = n + Math.round(PFL.ejectDecideSec / PILOT_DT);
        goingShort = true;
        notes.push(`obviously short at ${Math.round(s.alt)} ft`);
        setRec("Can't make it: ejecting");
      }
    }

    if (!gate && s.alt <= PFL.gateAltFt && state !== 'zoom') {
      const trk = pilot.trackDeg();
      const offDeg = Math.abs(wrapDeg180(trk - geo.rwyDeg));
      const ok = offDeg <= PFL.gateTrackDeg && s.ias >= PFL.gateKias - 1;
      gate = { ok, offDeg, kias: s.ias, flags: [] };
      if (Math.abs(s.bank) > PFL.gateFlagBankDeg) gate.flags.push('bank over 45°');
      if (cfg < 1) gate.flags.push('gear up');
      if (cfg < 2) gate.flags.push('no T/O flap');
      if (!ok && practice) {
        outcome = 'go_around';
        setRec('Gate missed: go around');
        pilot.record();
        break;
      }
    }

    pilot.step(bank, climb, accel);

    if (ejectAtN !== null ? n >= ejectAtN : goingShort && (pastLowKey || s.alt <= PFL_KEY_ALT_FT.lowKey)) {
      outcome = 'eject';
      eject = { x: s.x, y: s.y, alt: s.alt };
      setRec('Eject');
      pilot.record();
      break;
    }

    if (s.k % 4 === 2 && s.alt > ground) pilot.record();

    if (s.alt <= ground) {
      s.alt = ground;
      const o = legOffsetsFt(geo.th, geo.dep, s);
      const onRwy = o.alongFt >= 0 && o.alongFt <= geo.lenFt && Math.abs(o.crossFt) <= 150;
      outcome = onRwy ? 'landed' : 'eject';
      if (onRwy) touchdown = { x: s.x, y: s.y, alongFt: o.alongFt, kias: s.ias };
      else eject = { x: s.x, y: s.y, alt: s.alt };
      setRec(onRwy ? (o.alongFt > geo.lenFt / 3 ? 'Touchdown past the first third' : 'Touchdown') : 'Eject');
      pilot.record();
      break;
    }
  }

  if (!outcome) {
    outcome = 'eject';
    eject = { x: s.x, y: s.y, alt: s.alt };
    notes.push('ran out of steps');
  }

  const points = pilot.points.map((p) => ({
    ...p,
    phase: p.phase ?? 'pfl',
    kias: p.kt,
    segmentType: p.segmentType ?? (p.phase === 'pfl_zoom' ? 'zoom' : p.phase === 'pfl_decel' ? 'decel' : 'straight'),
    marginFt: p.marginFt ?? null,
    marginTag: p.marginTag ?? null,
  }));
  return { points, outcome, touchdown, eject, gate, plan: plan.kind, patternPfl, planLog, notes };
}

// ── Drop-in Sim Integration Functions ─────────────────────────────────────────

export function startPflFlight(a, wind, options = {}) {
  const flight = flyPfl(
    {
      x: Number.isFinite(a.x) ? a.x : 0,
      y: Number.isFinite(a.y) ? a.y : 0,
      alt: Number.isFinite(a.alt) ? a.alt : 3500,
      kias: a.iasKt ?? a.kt ?? 125,
      headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG,
      bankDeg: a.bankDeg,
      rollRateDps: a.rollRateDps,
    },
    wind,
    options
  );

  a.pflFlight = {
    route: { id: 'PFL_FLOWN', kind: 'pfl', name: 'Engine-out glide', points: flight.points },
    outcome: flight.outcome,
    touchdown: flight.touchdown,
    eject: flight.eject,
    gate: flight.gate,
    practice: Boolean(options.practice),
    patternPfl: flight.patternPfl,
    planLog: flight.planLog,
  };

  const behind = flownBehind(a, flight.points[0], wind);
  a.pflFlight.behindCount = behind.length;
  a.pflFlight.route.points = [...behind, ...flight.points];

  startJoin(a, a.pflFlight.route, routeLengthFt({ points: [...behind, flight.points[0]] }, PFL_ROUTE_OPTIONS), wind, PFL_ROUTE_OPTIONS);

  a.mode = 'RAIL';
  a.engineFailed = true;
  a.landed = false;
  a.active = true;
  a.pflDecision = flight.points[0]?.decision ?? '';
  a.config = flight.points[0]?.config ?? PFL_CONFIG_LABELS[0];
  a.phase = flight.points[0]?.phase ?? 'pfl';
  a.pflSegment = flight.points[0]?.segmentType ?? flight.points[0]?.segment ?? flight.points[0]?.phase ?? 'pfl';
  a.pflMarginFt = flight.points[0]?.marginFt ?? null;
  a.pflMarginTag = flight.points[0]?.marginTag ?? null;

  delete a.navPlan;
  delete a._blendStart;
  delete a._blendTarget;
  delete a._blendTimer;
  delete a.goAroundFlight;
  delete a.highKeyFlight;

  return a.pflFlight;
}

export function resumePflFlight(a, wind, settings = undefined) {
  const prev = a.pflFlight;
  const cfgIndex = Math.max(0, PFL_CONFIG_LABELS.indexOf(a.config ?? PFL_CONFIG_LABELS[0]));
  return startPflFlight(a, wind, {
    practice: prev?.practice,
    settings,
    midGlide: { cfgIndex, patternPfl: prev?.patternPfl, plan: planNow(a, prev), decision: a.pflDecision },
  });
}

function planNow(a, flight) {
  const log = flight?.planLog;
  const pts = flight?.route?.points;
  if (!log?.length || !pts?.length) return null;
  let i = 0, d = 0;
  while (i < pts.length - 1 && d + dist(pts[i], pts[i + 1]) <= (a.distFt ?? 0)) { d += dist(pts[i], pts[i + 1]); i++; }
  const at = i - (flight.behindCount ?? 0);
  const entry = [...log].reverse().find((e) => e.at <= at) ?? log[0];
  const path = entry?.plan?.path;
  if (!path || path.length < 2) return null;
  let seg = 0;
  for (let k = 0, best = Infinity; k < path.length - 1; k++) {
    const p = project(path, k, a);
    if (p.seg === k && p.d < best) { best = p.d; seg = k; }
  }
  return { ...entry.plan, path: [{ ...path[seg], x: a.x, y: a.y, key: undefined, highKeyCheck: undefined }, ...path.slice(seg + 1)] };
}

function flownBehind(a, first, wind) {
  const alt = Number.isFinite(a.alt) ? a.alt : 3500;
  const tasFtps = ktToFtps(iasToTasKt(a.iasKt ?? a.kt ?? 125, alt));
  const omegaDeg = Number.isFinite(a.bankDeg) ? turnRateFromBankRadPerSec(Math.max(tasFtps, 1), a.bankDeg) * RAD : 0;
  const w = {
    x: -Math.sin((wind?.windFromDeg ?? 360) * DEG) * ktToFtps(wind?.windKt ?? 0),
    y: -Math.cos((wind?.windFromDeg ?? 360) * DEG) * ktToFtps(wind?.windKt ?? 0),
  };
  const pts = [];
  let x = Number.isFinite(a.x) ? a.x : 0, y = Number.isFinite(a.y) ? a.y : 0, hdg = a.headingDeg ?? RUNWAY_29L_HDG_DEG;
  const dt = 0.4;
  for (let k = 0; k < 8; k++) {
    hdg -= omegaDeg * dt;
    x -= (tasFtps * Math.sin(hdg * DEG) + w.x) * dt;
    y -= (tasFtps * Math.cos(hdg * DEG) + w.y) * dt;
    pts.unshift({ ...first, x, y, headingDeg: wrapDeg360(hdg) });
  }
  return pts;
}
