// The PFL: an engine failure (or a practice from High Key) flown to the runway (Traffic spec 4.5).
//
// How it flies (spec 4.5 item 3, TR-113): the zoom or level slow-down is planned first and flown by the same code;
// the join is chosen from where it ends. The plan is a list of points (the join, the wind-shaped circle, the direct);
// the chain turns it into the turns and straights the aircraft flies, every corner a turn at its planned radius. The
// height needed is summed along that chain, and the aircraft flies the same chain: one path, one sum (Fable F9, F16).
// Re-plans come at the keys, when the margin is more than 300 ft short, and when the drag no longer fits. A pattern
// PFL still high with all the drag out squares off: a wide Low Key, then square turns to base and final, Final Key
// staying where it is. Drag goes out a step at a time, at least 5 s apart (Fable F6); the round-out and flare are
// TR-110's.
//
// References: SMM chapter 13; NFM Fig 3-4 (zoom); EFIG p.402, 406, 408; Fable's review (F1-F16, Q1-Q7); Patrick's
// rulings as cited on each number.

import { ktToFtps, KT_TO_FTPS, G_FTPS2, FT_PER_NM } from '../../core/units.js';
import { wrapDeg180, wrapDeg360, compassDegFromVector } from '../../core/angles.js';
import { turnRadiusFromBankFt, turnRateFromBankRadPerSec, dampedClimbG, easeValue } from '../../core/flight-math.js';
import { glideDragPerWeight, glideRatio, stallLimitG } from '../../core/t6-performance.js';
import { iasToTasKt, heightFactor } from './weather.js';
import { windTriangle, windVectorFtps } from '../../core/wind.js';
import { legOffsetsFt } from '../../core/geo.js';
import { makePilot, bankFor, PILOT_DT } from './circuit.js';
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
  /** Square-off when high (TR-113): the base corner is labelled 240° round, an estimate between Low Key and Final Key; looked at again at most every 10 s (an estimate). */
  squareBaseDeg: 240,
  squareEverySec: 10,
  /** On the way to the join, a square-off is looked at only within this of the threshold (an estimate: the circuit, not the area). */
  squareWithinFt: 3 * FT_PER_NM,
});

/** Configurations in order: 0=clean, 1=gearDown, 2=flapsTakeoff, 3=landing. */
export const PFL_CONFIGS = Object.freeze(['clean', 'gearDown', 'flapsTakeoff', 'landing']);
export const PFL_CONFIG_LABELS = Object.freeze(['Clean', 'Gear', 'Gear + T/O flap', 'Gear + landing flap']);
export const PFL_ROUTE_OPTIONS = Object.freeze({ flyRoundedTurns: false, radiusFromG: true, manualRadiusFt: 1800 });
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

// ── The zoom: one model for the plan and the flight ───────────────────────────

/**
 * One step of the zoom's nose (spec 4.5 item 5): a 2 G pull to 20° nose up, held there to 145 KIAS, then eased
 * over to the clean glide path as the speed falls to 125 KIAS. G builds and eases at TR-51's rates. `z` carries the
 * flight path angle and G between steps. Returns this step's climb and acceleration (true, ft/s and ft/s²) and
 * whether the zoom is over. The plan (flyZoomPlan) and the flight (flyPfl) both call it, so the planned top of the
 * zoom is where the aircraft gets to.
 */
function zoomPitchStep(z, s, tasFtps, dt) {
  const glideGamma = -Math.atan(1 / glideRatio('clean'));
  let nLoad;
  if (!z.pullDone && s.ias > PFL.pushOverKias) {
    nLoad = z.gamma < PFL.zoomMaxClimbDeg * DEG ? PFL.zoomPullG : Math.cos(z.gamma);
  } else {
    z.pullDone = true;
    const f = clamp((s.ias - PFL.glideCleanKias) / (PFL.pushOverKias - PFL.glideCleanKias), 0, 1);
    const want = glideGamma + (Math.max(z.gamma, glideGamma) - glideGamma) * f * 0.6;
    nLoad = clamp(Math.cos(z.gamma) + (want - z.gamma) * tasFtps / G_FTPS2, 0, PFL.zoomPullG);
  }
  const eased = easeValue(z.nz, z.nzRate, nLoad * Math.cos(s.bank * DEG), dt, { maxRateDps: PFL.gOnsetGps, maxAccelDps2: PFL.gOnsetGps2 });
  z.nz = eased.bankDeg;
  z.nzRate = eased.rollRateDps;
  const dw = glideDragPerWeight('clean', s.ias, s.alt, Math.max(z.nz / Math.cos(s.bank * DEG), 0.5));
  z.gamma += G_FTPS2 * (z.nz - Math.cos(z.gamma)) / tasFtps * dt;
  // Over once at 125 KIAS or on the glide path; the path is eased onto, so within a quarter of a degree counts (an estimate).
  const done = z.pullDone && (s.ias <= PFL.glideCleanKias + 1.5 || z.gamma <= glideGamma + 0.25 * DEG);
  return { climb: tasFtps * Math.sin(z.gamma), accel: -G_FTPS2 * (dw + Math.sin(z.gamma)), done };
}

/** The zoom's bank: the bank it has for the first second (no snap at the hand-over), then a turn of up to 30° onto the planned track. */
function zoomBank(pilot, n, trackDeg) {
  if (n * PILOT_DT < PFL.holdBankSec) return pilot.s.bank;
  return bankFor(pilot.headingFor(trackDeg), pilot.s, PFL.zoomMaxBankDeg);
}

/** The zoom flown ahead of time from `start`, turning onto `trackDeg`: where it ends, how high, how fast, which way. */
function flyZoomPlan(start, wind, trackDeg) {
  const pilot = makePilot({ x: start.x, y: start.y, alt: start.alt, ias: start.kias, hdg: start.headingDeg ?? RUNWAY_29L_HDG_DEG, src: 0, phase: 'pfl_zoom' }, wind);
  pilot.s.bank = Number.isFinite(start.bankDeg) ? start.bankDeg : 0;
  pilot.s.rollRate = Number.isFinite(start.rollRateDps) ? start.rollRateDps : 0;
  const z = { gamma: 0, nz: 1, nzRate: 0, pullDone: false };
  for (let n = 0; n < 2000; n++) {
    const tas = ktToFtps(iasToTasKt(pilot.s.ias, pilot.s.alt));
    const bank = zoomBank(pilot, n, trackDeg);
    const st = zoomPitchStep(z, pilot.s, tas, PILOT_DT);
    pilot.step(bank, st.climb, st.accel);
    if (st.done) break;
  }
  const s = pilot.s;
  return { x: s.x, y: s.y, alt: s.alt, kias: s.ias, headingDeg: s.hdg, bankDeg: s.bank, trackDeg: pilot.trackDeg() };
}

/** Height worth of the speed above `toKias`, in altimeter feet: what slowing to it gives back (none if already slower). */
function speedAboveFt(kias, toKias, altFt) {
  const v = ktToFtps(iasToTasKt(kias, altFt)), v0 = ktToFtps(iasToTasKt(toKias, altFt));
  return Math.max(0, (v * v - v0 * v0) / (2 * G_FTPS2)) / heightFactor(altFt);
}

// ── The chain: the planned path as the turns and straights the aircraft flies ──
//
// A plan is a list of points (joins, the circle, the direct, the square-off). The chain turns it into what is flown:
// every corner becomes a turn at its planned radius (a point's own `arc` radius, else the 45° radius at 120 KIAS),
// joined to the straights at a tangent. The height needed is summed along the chain, and the aircraft flies the
// same chain, so the plan and the flight are one path (Fable F9, F16).

const FILLET_MIN_DEG = 0.5;
const CHAIN_STEP_FT = 250;
/** How far ahead the turn's bank is taken, in seconds of flight, so the roll starts as the turn starts (an estimate: about half a 45°/s roll). */
const CHAIN_PREVIEW_SEC = 0.6;
/** Off the line: track correction per foot, and its most (estimates, as the old follower's). */
const CHAIN_TRACK_PER_FT = 0.05;
const CHAIN_TRACK_MAX_DEG = 30;
/** Bank per degree of track error (an estimate, as the old follower's). */
const CHAIN_BANK_PER_DEG = 3;

/**
 * The chain for `pts`. Pieces in order, each on the path's segment `owner` (owner → owner + 1):
 * { kind: 'line', ax, ay, trk, len, owner } or { kind: 'arc', cx, cy, r, side, b0, trk0, len, owner }
 * (side +1 right, −1 left; b0 = bearing from the centre to the piece's start; trk0 = track at its start).
 */
function buildChain(pts, defaultR = directTurnRadiusFt()) {
  const n = pts.length;
  const pieces = [];
  if (n < 2) return { pieces };
  const len = [], trk = [];
  for (let i = 0; i < n - 1; i++) {
    len.push(dist(pts[i], pts[i + 1]));
    trk.push(len[i] > 1e-6 ? bearing(pts[i], pts[i + 1]) : (trk[i - 1] ?? 0));
  }
  const T = new Array(n).fill(0), turn = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (len[i - 1] < 1 || len[i] < 1) continue;
    const d = wrapDeg180(trk[i] - trk[i - 1]);
    if (Math.abs(d) < FILLET_MIN_DEG || Math.abs(d) > 179) continue;
    // A point's arc radius holds within that arc (or is the corner radius asked for); turning onto a new arc, the 45° radius at most.
    const own = pts[i].arc, prev = pts[i - 1].arc;
    const sameArc = own && (own.cx === undefined || (prev && prev.cx === own.cx && prev.cy === own.cy));
    const r = own ? (sameArc ? own.r : Math.min(own.r, defaultR)) : defaultR;
    turn[i] = d;
    T[i] = r * Math.tan(Math.abs(d) * DEG / 2);
  }
  for (let i = 0; i < n - 1; i++) {
    const want = T[i] + T[i + 1];
    if (want > len[i]) { const k = len[i] / want; T[i] *= k; T[i + 1] *= k; }
  }
  const along = (i, ft) => ({ x: pts[i].x + Math.sin(trk[i] * DEG) * ft, y: pts[i].y + Math.cos(trk[i] * DEG) * ft });
  for (let i = 0; i < n - 1; i++) {
    const lineLen = len[i] - T[i] - T[i + 1];
    if (lineLen > 0.5) {
      const a = along(i, T[i]);
      pieces.push({ kind: 'line', ax: a.x, ay: a.y, trk: trk[i], len: lineLen, owner: i });
    }
    const j = i + 1;
    if (T[j] > 0.01 && j < n - 1) {
      const d = turn[j], side = d > 0 ? 1 : -1, sweep = Math.abs(d);
      const r = T[j] / Math.tan(sweep * DEG / 2);
      const a = along(i, len[i] - T[j]);
      const c = { x: a.x + r * Math.sin((trk[i] + side * 90) * DEG), y: a.y + r * Math.cos((trk[i] + side * 90) * DEG) };
      const b0 = wrapDeg360(trk[i] - side * 90);
      const half = sweep / 2;
      pieces.push({ kind: 'arc', cx: c.x, cy: c.y, r, side, b0, trk0: trk[i], len: r * half * DEG, sweep: half, owner: i });
      pieces.push({ kind: 'arc', cx: c.x, cy: c.y, r, side, b0: wrapDeg360(b0 + side * half), trk0: wrapDeg360(trk[i] + side * half), len: r * half * DEG, sweep: half, owner: j });
    }
  }
  return { pieces };
}

/** Where `ft` along piece `pc` is, and its track there. */
function piecePoint(pc, ft) {
  if (pc.kind === 'line') return { x: pc.ax + Math.sin(pc.trk * DEG) * ft, y: pc.ay + Math.cos(pc.trk * DEG) * ft, trk: pc.trk };
  const phi = (ft / pc.r) / DEG;
  const b = (pc.b0 + pc.side * phi) * DEG;
  return { x: pc.cx + pc.r * Math.sin(b), y: pc.cy + pc.r * Math.cos(b), trk: wrapDeg360(pc.trk0 + pc.side * phi) };
}

/** `p` against piece `pc`: feet along it (not clamped) and feet left of it. */
function pieceOffsets(pc, p) {
  if (pc.kind === 'line') {
    const t = { x: Math.sin(pc.trk * DEG), y: Math.cos(pc.trk * DEG) };
    const dx = p.x - pc.ax, dy = p.y - pc.ay;
    return { along: dx * t.x + dy * t.y, left: -dx * t.y + dy * t.x };
  }
  const phi = pc.side * wrapDeg180(bearing({ x: pc.cx, y: pc.cy }, p) - pc.b0);
  return { along: pc.r * phi * DEG, left: pc.side * (Math.hypot(p.x - pc.cx, p.y - pc.cy) - pc.r) };
}

/** Where the aircraft is on the chain, searching forward from piece `idx`: never back, never more than a few pieces on. */
function chainLocate(chain, idx, p) {
  const ps = chain.pieces;
  if (!ps.length) return { idx: 0, along: 0, left: 0, trk: 0, pt: { x: p.x, y: p.y } };
  let k = clamp(idx, 0, ps.length - 1);
  let o = pieceOffsets(ps[k], p);
  for (let step = 0; step < 6 && k < ps.length - 1 && o.along > ps[k].len; step++) {
    const next = pieceOffsets(ps[k + 1], p);
    k++;
    o = next;
  }
  const along = clamp(o.along, 0, ps[k].len);
  const at = piecePoint(ps[k], along);
  return { idx: k, along, left: o.left, trk: at.trk, pt: { x: at.x, y: at.y } };
}

/** The piece and feet along it, `ft` further on from (idx, along). */
function chainAhead(chain, idx, along, ft) {
  const ps = chain.pieces;
  let k = idx, a = along + ft;
  while (k < ps.length - 1 && a > ps[k].len) { a -= ps[k].len; k++; }
  return { pc: ps[k], along: Math.min(a, ps[k]?.len ?? 0) };
}

/** Bank that holds a turn of radius r over the ground at this ground speed, crabbed for the wind (r = Vg² / (g tan φ cos crab)). */
function heldBankDeg(gsFtps, r, crabDeg) {
  return Math.atan(gsFtps * gsFtps / (G_FTPS2 * r * Math.max(Math.cos(crabDeg * DEG), 0.5))) / DEG;
}

/** The bank that flies the chain: the turn's own bank, taken a moment ahead, plus a small correction back onto the line. */
function chainBank(chain, loc, pilot, wind, bankMax) {
  const gs = pilot.groundSpeedFtps();
  const ahead = chainAhead(chain, loc.idx, loc.along, gs * CHAIN_PREVIEW_SEC).pc;
  let ff = 0;
  if (ahead?.kind === 'arc') {
    const t = piecePoint(ahead, 0).trk;
    const crab = wrapDeg180(pilot.headingFor(t) - t);
    ff = ahead.side * heldBankDeg(gs, ahead.r, crab);
  }
  const want = loc.trk + clamp(loc.left * CHAIN_TRACK_PER_FT, -CHAIN_TRACK_MAX_DEG, CHAIN_TRACK_MAX_DEG);
  return clamp(ff + CHAIN_BANK_PER_DEG * wrapDeg180(want - pilot.trackDeg()), -bankMax, bankMax);
}

/**
 * Height needed (altimeter feet) to fly the chain from (idx, along) to the end of segment stopOwner − 1: each piece at
 * the glide speed of the drag planned for it (planOf(owner)), at that piece's bank for its radius over the ground in the
 * wind, at the glide drag for that G. Speed above the glide speed now (kiasNow) is height in hand.
 */
function chainSum(chain, planOf, idx, along, altFt, wind, { base = 0, maxPlan = 3, stopOwner = Infinity, kiasNow = null } = {}) {
  const ps = chain.pieces;
  let need = 0, alt = altFt, first = true;
  for (let k = idx; k < ps.length; k++) {
    const pc = ps[k];
    if (pc.owner >= stopOwner) break;
    const cfg = Math.max(base, Math.min(maxPlan, planOf(pc.owner) ?? 0));
    const kias = glideKias(cfg);
    if (first && Number.isFinite(kiasNow)) need -= speedAboveFt(kiasNow, kias, alt);
    first = false;
    const start = k === idx ? along : 0;
    for (let a = start; a < pc.len - 1e-6;) {
      const ds = Math.min(CHAIN_STEP_FT, pc.len - a);
      const trk = piecePoint(pc, a + ds / 2).trk;
      const tas = iasToTasKt(kias, alt);
      const wt = windTriangle(trk, tas, wind.windFromDeg ?? 360, wind.windKt ?? 0);
      const gs = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 20) : 20;
      let g = 1;
      if (pc.kind === 'arc') {
        const bank = Math.min(heldBankDeg(ktToFtps(gs), pc.r, wt.crabDeg ?? 0), PFL.maxBankDeg);
        g = Math.min(PFL.glideMaxG, 1 / Math.cos(bank * DEG));
      }
      const dh = ds * (tas / gs) * glideDragPerWeight(PFL_CONFIGS[cfg], kias, alt, g) / heightFactor(alt);
      need += dh;
      alt -= dh;
      a += ds;
    }
  }
  return need;
}

/** Feet along the chain from (idx, along) to the end of segment stopOwner − 1. */
function chainFtTo(chain, idx, along, stopOwner) {
  let ft = 0;
  for (let k = idx; k < chain.pieces.length && chain.pieces[k].owner < stopOwner; k++) ft += chain.pieces[k].len - (k === idx ? along : 0);
  return ft;
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
  // The turn onto the circle is planned too: a left turn at the 45° radius that rolls out on the circle at the point,
  // so the straight before it aims at where that turn starts (flown as planned, never a corner cut).
  const rt = directTurnRadiusFt();
  const tp = geo.trackAt(theta);
  const c2 = { x: p.x + rt * Math.sin((tp - 90) * DEG), y: p.y + rt * Math.cos((tp - 90) * DEG) };
  const entryFrom = (e) => {
    const d = dist(e, c2);
    if (d <= rt * 1.01) return null;
    const trv = bearing(e, c2) + Math.asin(rt / d) / DEG;
    const k = Math.sqrt(d * d - rt * rt);
    return { x: e.x + k * Math.sin(trv * DEG), y: e.y + k * Math.cos(trv * DEG), trv };
  };
  let entry = entryFrom(from);
  let arc = leadTurn(from, trackDeg, entry ?? p);
  if (entry && arc.length) entry = entryFrom(arc[arc.length - 1]) ?? entry;
  const exitArc = arc.length ? arc[arc.length - 1] : { x: from.x, y: from.y };
  const ontoPts = [];
  if (entry && wrapDeg180(tp - entry.trv) < -FILLET_MIN_DEG) {
    const turnC = { cx: c2.x, cy: c2.y, r: rt, side: -1 };
    const b0 = bearing(c2, entry), b1 = bearing(c2, p);
    const sweep = wrapDeg360(b0 - b1);
    ontoPts.push({ x: entry.x, y: entry.y, plan: 0, arc: turnC });
    for (let k = PFL.joinStepDeg; k < sweep - 1e-6; k += PFL.joinStepDeg) {
      const b = b0 - k;
      ontoPts.push({ x: c2.x + rt * Math.sin(b * DEG), y: c2.y + rt * Math.cos(b * DEG), plan: 0, arc: turnC });
    }
  }
  const legEnd = ontoPts[0] ?? p;
  const straightLeg = dist(exitArc, legEnd) > 10 ? [{ x: exitArc.x, y: exitArc.y, plan: 0 }] : [];
  const startPts = arc.length ? [{ x: from.x, y: from.y, plan: 0, arc: arc[0].arc }, ...arc, ...straightLeg, ...ontoPts] : [{ x: from.x, y: from.y, plan: 0 }, ...ontoPts];
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
  const spare = (c) => {
    const reach = altFt - neededFt(minDragPlan(c.path), 0, from, altFt, cfgNow, wind) - ground;
    if (reach < -trade) return -Infinity;
    const most = neededFt(c.path.map((p) => ({ ...p, plan: 3 })), 0, from, altFt, Math.max(cfgNow, 3), wind);
    const excess = altFt - most - ground;
    const floatFt = excess > 0 ? excess * flownGlideRatio(3, ground) : 0;
    if (c.aimAlongFt + floatFt > last) return -Infinity;
    return reach;
  };
  const pick = cands.find((c) => spare(c) >= 0) ?? cands.find((c) => spare(c) + trade >= 0);
  return pick ? { kind: 'direct', ...pick } : null;
}

/**
 * The square-off when high (Patrick, 10 Oct 2026; TR-113): a pattern PFL still high with all the drag out flies a wide
 * Low Key, then squares off its turns to Final Key and to the threshold: a straight downwind, about 90° onto base, a
 * straight base through Final Key, about 90° onto final. Final Key itself stays where it is (TR-48; Patrick's card
 * 19:46Z). The corners tighten first, from the circle's own radius to the 45° radius; after that the downwind moves
 * out, up to PFL.maxWidenFt. It is sized so that, with all the drag out, it arrives on profile.
 */
function squarePath(geo, path, seg, s, trackDeg, altFt, wind, tdKey, cfgNow, th0 = path[seg]?.theta) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  if (th0 === undefined || th0 >= PFL.squareBaseDeg) return null;
  const nl = { x: -geo.u.y, y: geo.u.x };
  const alongOf = (p) => (p.x - geo.th.x) * geo.u.x + (p.y - geo.th.y) * geo.u.y;
  const latOf = (p) => (p.x - geo.th.x) * nl.x + (p.y - geo.th.y) * nl.y;
  const P = (along, lat) => ({ x: geo.th.x + geo.u.x * along + nl.x * lat, y: geo.th.y + geo.u.y * along + nl.y * lat });
  const lk = geo.at(180), fk = geo.at(270);
  const fkAlong = alongOf(fk);
  const out = Math.sign(latOf(lk)) || -1; // the pattern side: wider is further this way
  const rMin = directTurnRadiusFt();
  if (alongOf(s) < fkAlong + rMin) return null;
  const tail = [{ x: geo.th.x, y: geo.th.y, theta: 360, plan: 3, key: 'threshold' }, ...finalToAim(geo, geo.aimAlongFt)];
  const build = (x) => {
    const r = geo.r - (geo.r - rMin) * Math.min(x, 1);
    // The downwind line: Low Key's, moved out as x grows past 1. Reached at about 45° from where the aircraft is (in or
    // out), so that corner is made before Final Key's along-track spot.
    const wanted = out * latOf(lk) + Math.max(0, x - 1) * 1000;
    // Still well before Low Key (room for two turns): straight to the wide Low Key. Otherwise a 45° cut, as far as there is
    // room before Final Key.
    const toLk = alongOf(s) - alongOf(lk);
    const room = Math.max(0, alongOf(s) - fkAlong - 2 * rMin);
    const viaLk = toLk >= 2 * rMin;
    const wide = viaLk ? wanted - out * latOf(s) : clamp(wanted - out * latOf(s), -room, room);
    const lat = out * (out * latOf(s) + wide);
    const corner = { r };
    const atLk = viaLk || th0 < 180;
    // The drag as planned: gear to the wide Low Key, T/O flap from it, landing flap rolling into base (Patrick, 10 Oct 20:06Z).
    const plan = Math.max(atLk ? 1 : 2, cfgNow), wPlan = Math.max(2, cfgNow);
    const pts = [{ x: s.x, y: s.y, theta: th0, plan, square: true }];
    const wAlong = viaLk ? alongOf(lk) : th0 < 180 ? Math.min(alongOf(lk), alongOf(s) - Math.abs(wide)) : alongOf(s) - Math.abs(wide);
    const w = P(wAlong, lat), bc = P(fkAlong, lat), fc = P(fkAlong, 0);
    const useW = atLk || Math.abs(wide) > 1;
    const lead = leadTurn(s, trackDeg, useW ? w : bc).map((p) => ({ ...p, theta: th0, plan, square: true }));
    pts.push(...lead);
    if (useW) pts.push({ ...w, theta: atLk ? 180 : th0, plan: wPlan, ...(atLk ? { key: 'low_key' } : {}), square: true, arc: corner });
    pts.push({ ...bc, theta: PFL.squareBaseDeg, plan: 3, square: true, arc: corner });
    pts.push({ x: fk.x, y: fk.y, theta: 270, plan: 3, key: 'final_key', square: true });
    pts.push({ ...fc, theta: 315, plan: 3, square: true, arc: corner });
    return [...pts, ...tail];
  };
  const spare = (x) => altFt - ground - neededFt(build(x), 0, s, altFt, cfgNow, wind, false, tdKey) - PFL.onProfileFt;
  const xMax = 1 + PFL.maxWidenFt / 1000;
  if (spare(0) <= 0) return null;
  if (spare(xMax) > 0) {
    // Can't burn it all: square off only if that loses more than the path it is on.
    const now = altFt - ground - neededFt(path, seg, s, altFt, cfgNow, wind, false, tdKey) - PFL.onProfileFt;
    return spare(xMax) < now - PFL.onProfileFt ? build(xMax) : null;
  }
  let lo = 0, hi = xMax;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (spare(mid) > 0) lo = mid; else hi = mid; }
  return lo > 0.02 ? build(lo) : null;
}

/**
 * Height needed (altimeter feet) from `pos` on segment `seg` of `path` to the point keyed `stopAtKey` (the aim point,
 * unless told), summed on the chain of that path from where the aircraft is, flying the planned drag from here on
 * (never less than cfgNow; one step more with takeNext; never more than maxPlan).
 */
function neededFt(path, seg, pos, altFt, cfgNow, wind, takeNext = false, stopAtKey = 'aim', maxPlan = 3) {
  const stop = path.findIndex((p) => p.key === stopAtKey);
  if (stop >= 0 && stop <= seg) return 0;
  const pts = [{ x: pos.x, y: pos.y }, ...path.slice(seg + 1)];
  const chain = buildChain(pts);
  const base = takeNext ? Math.min(3, cfgNow + 1) : cfgNow;
  return chainSum(chain, (o) => path[seg + o]?.plan ?? 0, 0, 0, altFt, wind, { base, maxPlan, stopOwner: stop >= 0 ? stop - seg : Infinity });
}

/** Height needed, clean at 125 KIAS, from `from` to point toIdx of `path` (the join). */
function neededTo(path, toIdx, from, altFt, wind) {
  const pts = [{ x: from.x, y: from.y }, ...path.slice(1)];
  return chainSum(buildChain(pts), () => 0, 0, 0, altFt, wind, { maxPlan: 0, stopOwner: toIdx });
}

function minDragPlan(path) {
  const direct = path[0]?.key === 'direct';
  if (direct) return path.map((p) => ({ ...p, plan: 0 }));
  const fk = path.findIndex((p) => p.key === 'final_key' || p.key === 'lined_up' || (p.theta ?? 0) >= 270);
  return path.map((p, i) => ({ ...p, plan: fk >= 0 && i >= fk ? Math.max(p.plan ?? 0, 1) : 0 }));
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


function joinLabel(theta) {
  if (Math.abs(theta) < 1e-6) return 'Join at High Key';
  if (Math.abs(theta - 180) < 1e-6) return 'Join at Low Key';
  if (Math.abs(theta - 270) < 1e-6) return 'Join at Final Key';
  return `Join at ${Math.round(theta)}°`;
}

// ── Choosing the join ─────────────────────────────────────────────────────────

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
  const join = one.best ?? one.high ?? run.best ?? run.high ?? chooseDirect(geo, from, availFt, PFL.glideCleanKias, wind, trackDeg);
  if (join) return join;
  return { kind: 'none', path: directPath(geo, from, geo.aimAlongFt, true, trackDeg), aimAlongFt: geo.aimAlongFt, label: 'Eject' };
}

// ── The tag ───────────────────────────────────────────────────────────────────

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

// ── The flight ────────────────────────────────────────────────────────────────

/** The point a zoom turns toward: the join on the circle, the line-up point of a direct, or the plan's next point. */
function zoomAim(plan, from) {
  const p = plan?.path ?? [];
  return p.find((q) => q.theta !== undefined || q.key === 'lined_up') ?? p[1] ?? from;
}

/**
 * Flies a PFL from `start` and records it: the zoom (or the level slow-down), then the glide along the chain of the
 * plan, re-planning at the keys and when the energy margin says so, the drag ladder, the square-off when high, the
 * round-out and the flare (spec 4.5). Returns { points, outcome, touchdown, eject, gate, plan, patternPfl, planLog, notes }.
 */
export function flyPfl(start, wind = { windFromDeg: 360, windKt: 0 }, options = {}) {
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
      phase: mid ? 'pfl' : start.kias > PFL.zoomAboveKias ? 'pfl_zoom' : 'pfl',
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
  let outcome = null;
  let touchdown = null;
  let eject = null;
  let gate = null;
  let goingShort = false;
  let pastLowKey = false;
  let ejectAtN = null;
  const notes = [];
  const planLog = [];
  const MAX_STEPS = 25000;

  // The zoom is planned first, so the join is chosen from where the zoom really ends (spec 4.5 items 5, 6).
  const zooming = !mid && start.kias > PFL.zoomAboveKias;
  const startHdg = start.headingDeg ?? RUNWAY_29L_HDG_DEG;
  let zoomTrackDeg = null;
  let plan;
  let planFrom = { x: start.x, y: start.y, alt: start.alt, trackDeg: start.headingDeg ?? RUNWAY_29L_HDG_DEG };
  if (mid?.plan) {
    plan = mid.plan;
  } else if (zooming) {
    const straight = flyZoomPlan(start, wind, startHdg);
    const first = chooseJoin(geo, straight, straight.alt, straight.trackDeg, wind, { bankDeg: straight.bankDeg });
    zoomTrackDeg = bearing(start, zoomAim(first, straight));
    if (Math.abs(wrapDeg180(zoomTrackDeg - startHdg)) < 5) zoomTrackDeg = startHdg;
    const top = zoomTrackDeg === startHdg ? straight : flyZoomPlan(start, wind, zoomTrackDeg);
    plan = chooseJoin(geo, top, top.alt, top.trackDeg, wind, { bankDeg: top.bankDeg });
    planFrom = top;
  } else {
    // Slowing level to 125 KIAS: the speed above it is height in hand (energy height, spec 4.5 item 6).
    const avail = start.alt + speedAboveFt(start.kias, PFL.glideCleanKias, start.alt);
    plan = chooseJoin(geo, s, avail, startHdg, wind, { bankDeg: s.bank });
    planFrom = { x: s.x, y: s.y, alt: avail, trackDeg: startHdg };
  }

  if (!mid?.plan && Math.hypot(s.x - geo.th.x, s.y - geo.th.y) <= PFL.atHighKeyFt && s.alt >= PFL.highKeyMinFt) {
    plan = { kind: 'highKey', path: [{ x: s.x, y: s.y, plan: 0, theta: 0, key: 'high_key', highKeyCheck: true }, ...arcToAim(geo, PFL.joinStepDeg)], theta: 0, label: 'At High Key' };
    zoomTrackDeg = startHdg;
  }

  const patternPfl = mid ? Boolean(mid.patternPfl) : !practice && plan.kind !== 'highKey' && plan.kind !== 'direct';
  // A pattern PFL that starts high near the circle is squared off from the start (TR-113), rather than flown onto a high join first.
  if (!mid?.plan && patternPfl && plan.kind === 'circle' && plan.theta < PFL.squareBaseDeg && dist(geo.th, planFrom) <= PFL.squareWithinFt) {
    const sq = squarePath(geo, plan.path, 0, planFrom, planFrom.trackDeg, planFrom.alt, wind, 'aim', cfg, plan.theta);
    if (sq) {
      plan = { ...plan, path: sq, label: 'Square off' };
      notes.push(`squared off at ${Math.round(start.alt)} ft`);
    }
  }
  let path = plan.path;
  let chain = buildChain(path);
  let loc = { idx: 0, along: 0, left: 0, trk: startHdg, pt: { x: s.x, y: s.y } };
  let seg = 0;
  let state = mid ? 'glide' : zooming ? 'zoom' : 'slow';
  let n = 0;
  let planFromN = 0;
  let lastConfigChangeN = -100;
  let lastSquareN = -1e9;
  let lastKey;
  const z = { gamma: mid ? -Math.asin(clamp(glideDragPerWeight(PFL_CONFIGS[cfg], start.kias, start.alt, 1), 0, 1)) : 0, nz: 1, nzRate: 0, pullDone: false };

  /** A new path to fly from here: its chain is built once, and the aircraft flies it from its start. */
  const usePath = (p) => {
    path = p;
    chain = buildChain(path);
    loc = chainLocate(chain, 0, s);
    seg = chain.pieces[loc.idx]?.owner ?? 0;
    planFromN = n;
  };
  const replan = (next) => {
    plan = next;
    usePath(next.path.map((p, i) => (i === 0 ? { ...p, x: s.x, y: s.y } : p)));
  };
  /** Height needed from where the aircraft is on its own chain (the planned drag of `p`, which has the same points as path). */
  const need = (p, cfgNow, takeNext = false, stopAtKey = 'aim', maxPlan = 3) => {
    const stop = p.findIndex((q) => q.key === stopAtKey);
    if (stop >= 0 && stop <= seg) return 0;
    const base = takeNext ? Math.min(3, cfgNow + 1) : cfgNow;
    return chainSum(chain, (o) => p[o]?.plan ?? 0, loc.idx, loc.along, s.alt, wind, { base, maxPlan, stopOwner: stop >= 0 ? stop : Infinity, kiasNow: s.ias });
  };
  const ftTo = (key) => {
    const stop = path.findIndex((q) => q.key === key);
    return chainFtTo(chain, loc.idx, loc.along, stop >= 0 ? stop : Infinity);
  };

  const calcMarginTag = (m) => (m > 150 ? 'high' : m < -PFL.onProfileFt ? 'low' : 'on profile');
  const getSegmentType = () => {
    if (state === 'zoom') return 'zoom';
    if (state === 'slow') return 'decel';
    if (roundOut?.flare) return 'flare';
    if (roundOut) return 'roundout';
    return chain.pieces[loc.idx]?.kind === 'arc' ? 'arc' : 'straight';
  };
  const setRec = (decision, extra = {}) => {
    s.rec = {
      decision,
      config: PFL_CONFIG_LABELS[cfg],
      cfgIndex: cfg,
      segmentType: extra.segmentType ?? getSegmentType(),
      marginFt: extra.marginFt !== undefined ? extra.marginFt : (Number.isFinite(margin) ? Math.round(margin) : null),
      marginTag: extra.marginTag !== undefined ? extra.marginTag : (Number.isFinite(margin) ? calcMarginTag(margin) : null),
      ...extra,
    };
  };
  const tdKeyOf = () => (path.some((p) => p.key === 'touchdown') ? 'touchdown' : 'aim');
  const marginNow = () => {
    const tdKey = tdKeyOf();
    return cfg >= 3 ? s.alt - ground - need(path, cfg, false, tdKey) : s.alt - ground - need(path, cfg, false, 'aim', 2);
  };

  margin = marginNow();
  setRec(mid ? (mid.decision || plan.label) : zooming ? `Zoom: ${plan.label.toLowerCase()}` : `Slow to 125: ${plan.label.toLowerCase()}`);
  s.tag = undefined;
  pilot.record();

  // No join and no runway: glide on toward the runway to Low Key or its height, then eject (spec 4.5 items 10, 15; TR-53).
  if (plan.kind === 'none' || plan.label === 'Eject') {
    goingShort = true;
    notes.push(`can't make the runway (${Math.round(s.alt)} ft MSL)`);
    setRec("Can't make it: ejecting");
  }

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
    if (state !== 'zoom') {
      loc = chainLocate(chain, loc.idx, s);
      seg = chain.pieces[loc.idx]?.owner ?? seg;
    }
    const proj = { seg, pt: loc.pt };

    const passed = path[seg];
    if (state !== 'zoom' && passed && passed !== lastKey) {
      lastKey = passed;
      if (passed.key && ['high_key', 'low_key', 'final_key'].includes(passed.key)) s.tag = passed.key;
      if (passed.key === 'low_key') pastLowKey = true;
      if (passed.highKeyCheck) {
        const rest = path.slice(seg + 1);
        let lapPath = null, lapClean = Infinity;
        if (s.alt > PFL.highKeyMaxFt) {
          const lap = orbitPath(s, geo.rwyDeg, orbitRadiusFt());
          lapPath = [...lap.map((p, i) => ({ ...p, plan: i ? 0 : cfg })), { x: geo.th.x, y: geo.th.y, theta: 0, plan: 0, key: 'high_key', highKeyCheck: true }];
          lapClean = neededFt(lapPath, 0, s, s.alt, 0, wind, false, 'high_key');
        }
        if (lapPath && s.alt - lapClean >= PFL.highKeyMinFt) {
          if (s.alt - lapClean > PFL.highKeyMaxFt && cfg < 1) {
            cfg = 1;
            lastConfigChangeN = n;
            notes.push('gear early to make the High Key window');
          }
          usePath([...lapPath.map((p) => ({ ...p, plan: Math.max(p.plan, cfg) })), ...arcToAim(geo, PFL.joinStepDeg)]);
          setRec(cfg ? 'Orbit at High Key, gear early' : 'Orbit at High Key');
        } else if (s.alt > PFL.highKeyMinFt) {
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
            semi.push({ x: p.x + off.x, y: p.y + off.y, plan: 1, falseCircle: true, arc: { r: geo.r }, ...(th > 180 - 1e-6 ? { key: 'false_low_key' } : {}) });
          }
          const lk = geo.at(180);
          usePath([{ x: s.x, y: s.y, plan: 1 }, { ...fhk, plan: 1, key: 'false_high_key', falseCircle: true }, ...semi, { x: lk.x, y: lk.y, theta: 180, plan: planAt(180), key: 'low_key' }, ...arcToAim(geo, 180 + PFL.joinStepDeg)]);
          setRec('False High Key');
        } else {
          usePath([{ x: s.x, y: s.y, plan: cfg }, ...rest]);
        }
        lastKey = path[seg];
      }
    }

    const stallBank = Math.acos(clamp(1 / Math.max(stallG(s.ias, cfg), 1.0001), 0, 1)) / DEG;
    const bankMax = state === 'zoom' ? PFL.zoomMaxBankDeg : Math.min(PFL.maxBankDeg, stallBank);
    const onFinal = ['threshold', 'touchdown', 'aim', 'rollout', 'lined_up'].includes(path[seg]?.key) || path.slice(0, seg + 1).some((p) => p.key === 'threshold');

    // Bank: the zoom turns onto its planned track; the glide flies its chain; past the threshold it holds the centreline.
    let bank;
    if (state === 'zoom') {
      bank = zoomBank(pilot, n, zoomTrackDeg ?? startHdg);
    } else if (n * PILOT_DT < PFL.holdBankSec) {
      bank = s.bank;
    } else if (roundOut || path.slice(0, seg + 1).some((p) => p.key === 'threshold') || ['threshold', 'aim', 'touchdown', 'rollout'].includes(path[seg]?.key)) {
      const offRwy = legOffsetsFt(geo.th, geo.dep, s);
      const corrDeg = clamp(-offRwy.crossFt * 0.15, -45, 45);
      const wantHdg = pilot.headingFor(wrapDeg360(geo.rwyDeg + corrDeg));
      const trkErr = Math.abs(wrapDeg180(pilot.trackDeg() - geo.rwyDeg));
      const maxB = Math.abs(offRwy.crossFt) > 50 || trkErr > 15 ? bankMax : 15;
      bank = bankFor(wantHdg, s, maxB);
    } else {
      bank = chainBank(chain, loc, pilot, wind, bankMax);
    }

    let climb, accel;
    if (state === 'zoom') {
      const st = zoomPitchStep(z, s, tas, PILOT_DT);
      climb = st.climb;
      accel = st.accel;
      if (st.done) {
        state = 'glide';
        usePath(path.map((p, i) => (i === 0 ? { ...p, x: s.x, y: s.y } : p)));
      }
    } else {
      let want = glideKias(cfg);
      if (state === 'slow' && s.ias <= PFL.glideCleanKias + 0.5) state = 'glide';

      if (plan.kind === 'direct' && margin < 0 && !goingShort && (ftTo('aim') < 6076 || s.alt <= PFL.gateAltFt)) {
        const v2 = tas * tas - 2 * G_FTPS2 * -margin * heightFactor(s.alt);
        const vKt = Math.sqrt(Math.max(v2, 0)) / KT_TO_FTPS;
        want = Math.max(tradeFloorKias(cfg), Math.min(want, vKt * PFL.glideGearKias / Math.max(iasToTasKt(PFL.glideGearKias, s.alt), 1)));
      }

      const turnG = Math.tan(s.bank * DEG) * Math.cos(z.gamma);
      const dw = glideDragPerWeight(PFL_CONFIGS[cfg], s.ias, s.alt, Math.max(Math.hypot(z.nz, turnG), 0.5));
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
        const sinkNow = -tas * Math.sin(z.gamma);
        if (!roundOut.flare && hAgl <= Math.max(PFL.flareFromFt, sinkNow * PFL.flareTauSec)) {
          roundOut.flare = true;
          s.rec.segmentType = getSegmentType();
          notes.push(`flare at ${Math.round(hAgl)} ft, ${Math.round(s.ias)} KIAS`);
        }
        if (roundOut.flare) wantGamma = -Math.asin(clamp(Math.max(PFL.flareTouchSinkFtps, hAgl / PFL.flareTauSec) / tas, 0, 1));
        else if (s.ias > PFL.thresholdKias[cfg] + 0.5) wantGamma = Math.max(wantGamma, -PFL.preFlareDeg * DEG);
      }

      const nzHigh = Math.sqrt(Math.max(0, Math.min(PFL.glideMaxG, stallG(s.ias, cfg)) ** 2 - turnG ** 2));
      const nzWant = clamp(dampedClimbG(z.gamma, wantGamma, tas), 0, Math.max(nzHigh, Math.cos(z.gamma)));
      const eased = easeValue(z.nz, z.nzRate, nzWant, PILOT_DT, { maxRateDps: PFL.gOnsetGps, maxAccelDps2: PFL.gOnsetGps2 });
      z.nz = eased.bankDeg;
      z.nzRate = eased.rollRateDps;
      z.gamma += G_FTPS2 * (z.nz - Math.cos(z.gamma)) / tas * PILOT_DT;
      climb = tas * Math.sin(z.gamma);
      accel = -G_FTPS2 * (dw + Math.sin(z.gamma));
    }

    // The margin, the drag ladder, the square-off and the tag: once a second (spec 4.5 item 7).
    if (!goingShort && state === 'glide' && n % 10 === 0) {
      const tdKey = tdKeyOf();
      margin = marginNow();
      const marginMin = s.alt - ground - need(minDragPlan(path), Math.min(cfg, 1), false, cfg >= 3 ? tdKey : 'aim');
      const settled = (n - planFromN) * PILOT_DT >= PFL.planGraceSec;
      const inOrbit = s.rec.decision?.startsWith('Orbit') || s.rec.decision?.startsWith('False High Key') || s.alt > PFL.highKeyMaxFt;
      if (!onFinal && settled && !inOrbit && marginMin < -PFL.planGraceUnlessShortFt && plan.kind !== 'direct') {
        const direct = chooseDirect(geo, s, s.alt, s.ias, wind, pilot.trackDeg(), cfg);
        if (direct) { replan(direct); notes.push(`went direct at ${Math.round(s.alt)} ft`); }
      } else if (!onFinal && plan.kind === 'direct' && marginMin + speedTradeFt(s.ias, s.alt, cfg) < 0) {
        const direct = chooseDirect(geo, s, s.alt, s.ias, wind, pilot.trackDeg(), cfg);
        if (direct && direct.aimAlongFt > (plan.aimAlongFt ?? 0) + 1) replan(direct);
      }

      const directDragOk = plan.kind === 'direct' && (path[seg]?.key === 'lined_up' || onFinal || s.alt <= ground + 200 || dist(geo.th, s) <= 4 * FT_PER_NM);
      const circleDragOk = plan.kind !== 'direct' && onCircle();
      const dragOk = directDragOk || circleDragOk;
      const notLow = marginMin >= -PFL.dragBufferFt;
      const dragSpacingOk = (n - lastConfigChangeN) * PILOT_DT >= PFL.minConfigIntervalSec;
      if (dragSpacingOk && notLow) {
        if (cfg < 1) {
          const gearFits = s.alt - ground - need(minDragPlan(path), 1) + speedTradeFt(s.ias, s.alt, 1) >= 0;
          const directOk = plan.kind === 'direct' && (
            ((path[seg]?.key === 'lined_up' || onFinal) && gearFits) ||
            s.alt <= ground + 200 ||
            (dist(geo.th, s) <= 4 * FT_PER_NM && s.alt - ground - need(path, 1, true, 'aim', 2) >= PFL.dragBufferFt)
          );
          const circleOk = plan.kind !== 'direct' && (
            ((s.tag === 'high_key' || s.tag === 'low_key' || (path[seg]?.theta ?? 0) >= 180) && margin >= -PFL.onProfileFt) ||
            (s.alt <= PFL.gateAltFt + 300) ||
            (patternPfl && dist(geo.th, s) <= PFL.earlyGearWithinFt && s.alt - ground - need(path, cfg, true, 'aim', 2) >= PFL.dragBufferFt)
          );
          if (directOk || circleOk) {
            cfg = 1;
            lastConfigChangeN = n;
          }
        } else if (dragOk && cfg === 2) {
          const offRwy = legOffsetsFt(geo.th, geo.dep, s);
          const canLandingFlap = onFinal || (path[seg]?.theta !== undefined && path[seg].theta >= 225) || (plan.kind === 'direct' && path[seg]?.key === 'lined_up') || (offRwy.alongFt <= -1000 && Math.abs(offRwy.crossFt) <= 500);
          if (canLandingFlap && s.alt - ground - need(path, 3, false, tdKey) >= 0) {
            cfg = 3;
            lastConfigChangeN = n;
          }
        } else if (dragOk && cfg === 1) {
          const due = (path[seg]?.plan ?? 0) > cfg;
          const earlyOk = (path[seg]?.theta !== undefined && path[seg].theta >= 180) || onFinal || (margin > PFL.keysCarryHighFt && dist(geo.th, s) <= 3 * FT_PER_NM) || margin > PFL.dragBufferFt;
          if (due ? margin >= -PFL.onProfileFt : earlyOk && s.alt - ground - need(path, cfg, true, 'aim', 2) >= PFL.dragBufferFt) {
            cfg = 2;
            lastConfigChangeN = n;
          }
        }
      }

      // Still high with all the drag out: a pattern PFL squares off (TR-113). Area and High Key PFLs lose height before High Key.
      // Still on the way to the join counts too: a high downwind start squares off from where it is.
      const nearCircle = dist(geo.th, s) <= PFL.squareWithinFt;
      const thNow = path[seg]?.theta ?? (plan.kind === 'circle' && nearCircle && !path.slice(0, seg + 1).some((p) => p.theta !== undefined) ? plan.theta : undefined);
      const canSquare = patternPfl && plan.kind !== 'direct' && thNow !== undefined && thNow < PFL.squareBaseDeg && Math.abs(s.bank) <= 30 && (n - lastSquareN) * PILOT_DT >= PFL.squareEverySec;
      if (canSquare && s.alt - ground - need(path, 3, false, tdKey) > PFL.widenAboveFt) {
        const sq = squarePath(geo, path, seg, s, pilot.trackDeg(), s.alt, wind, tdKey, cfg, thNow);
        if (sq) {
          usePath(sq);
          lastSquareN = n;
          notes.push(`squared off at ${Math.round(s.alt)} ft`);
          margin = marginNow();
        }
      }

      let decision;
      if (plan.kind === 'direct') decision = (s.alt <= PFL.gateAltFt && s.ias < PFL.glideGearKias - 2) ? 'Trading speed' : plan.label;
      else if (path[seg]?.falseCircle) decision = path.slice(0, seg + 1).some((p) => p.key === 'false_low_key') ? 'False Low Key' : 'False High Key';
      else if (s.rec.decision?.startsWith('Orbit') && path[seg]?.key !== 'threshold' && seg < path.findIndex((p) => p.highKeyCheck)) decision = s.rec.decision;
      else if (!onCircle()) decision = plan.label;
      else {
        const word = calcMarginTag(margin);
        const th = path[seg]?.theta;
        const sq = path[seg]?.square;
        const leg = th === undefined || th >= 360 ? 'Final'
          : sq ? (th < 180 ? 'To wide Low Key' : th < PFL.squareBaseDeg ? 'Wide downwind' : th < 315 ? 'Base' : 'To threshold')
          : th < 180 ? 'To Low Key' : th < 270 ? 'To Final Key' : 'To threshold';
        decision = `${leg}, ${word}`;
      }
      setRec(decision);
    }

    if (state === 'glide' && s.phase === 'pfl_zoom') {
      s.phase = 'pfl';
      if (!practice && ejectAtN === null && !goingShort && obviouslyShort(geo, s, cfg, wind)) {
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
    segmentType: p.segmentType ?? (p.phase === 'pfl_zoom' ? 'zoom' : 'straight'),
    marginFt: p.marginFt ?? null,
    marginTag: p.marginTag ?? null,
  }));
  return { points, outcome, touchdown, eject, gate, plan: plan.kind, patternPfl, planLog, notes };
}

// ── Into the sim ──────────────────────────────────────────────────────────────

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
