// The PFL's numbers, its geometry and the chain it flies (Traffic spec 4.5): the PFL table, the circle and its keys,
// the zoom (one model for the plan and the flight), the chain of turns and straights, and the height sums along it.
// The joins (pfl-joins.js) and the flight (pfl-flight.js) build on these; pfl.js puts the flight into the sim.
//
// References: SMM chapter 13; reference data (zoom); EFIG p.402, 406, 408; Fable's review (F1-F16, Q1-Q7); Patrick's
// rulings as cited on each number.

import { ktToFtps, G_FTPS2, FT_PER_NM } from '../../core/units.js';
import { DEG, wrapDeg180, wrapDeg360, compassDegFromVector } from '../../core/angles.js';
import { bankDegFromG, turnRadiusFromBankFt, easeValue } from '../../core/flight-math.js';
import { glideDragPerWeight, glideRatio, stallLimitG } from '../../core/t6-performance.js';
import { iasToTasKt, heightFactor } from './weather.js';
import { windTriangle, windVectorFtps } from '../../core/wind.js';
import { makePilot, bankFor, PILOT_DT } from './circuit.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_29L_HDG_DEG, PFL_CIRCLE_RADIUS_FT, FIELD_ELEV_FT } from './airfield.js';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const bearing = (a, b) => compassDegFromVector(b.x - a.x, b.y - a.y);

// ── PFL Constants & Settings ──────────────────────────────────────────────────

/** The PFL's flying numbers, each with its source. */
export const PFL = Object.freeze({
  /** Zoom only above 150 KIAS (Patrick, 4440; card C7 06:35Z); at or below it, hold height and slow to glide speed. */
  zoomAboveKias: 150,
  /** The zoom: 2 G pull to 20° climb, push over through 145 KIAS, capture 125 KIAS (reference). */
  zoomPullG: 2,
  /** Most G the glide may pull to move the nose, never past the stall line (TR-51; Patrick 17:52Z). */
  glideMaxG: 2,
  /** How fast G builds or eases: G/s and G/s² (TR-51). */
  gOnsetGps: 2,
  gOnsetGps2: 8,
  pushOverKias: 145,
  /** Steepest climb attitude during zoom (reference data: 20° nose up). */
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
  /** Bank past this near the ground is flagged (SMM 13.14 warning). */
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
  /** Touch down within the first 1,000 ft (SMM 13.9 para 18, 13.10 para 19; TR-47, TR-106, TR-110). */
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
  interceptOntoDeg: 120,
  joinLeadFt: 1500,
  highKeyRunInFt: 3000,
  directFinalFt: 2000,
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
  const stallBankDeg = bankDegFromG(Math.max(stallG(PFL.glideCleanKias, 0), 1.0001));
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

function glideFootprint(a, windFromDeg = 360, windKt = 0) {
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
export function zoomPitchStep(z, s, tasFtps, dt) {
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
export function zoomBank(pilot, n, trackDeg) {
  if (n * PILOT_DT < PFL.holdBankSec) return pilot.s.bank;
  return bankFor(pilot.headingFor(trackDeg), pilot.s, PFL.zoomMaxBankDeg);
}

/** The zoom flown ahead of time from `start`, turning onto `trackDeg`: where it ends, how high, how fast, which way. */
export function flyZoomPlan(start, wind, trackDeg) {
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
export function speedAboveFt(kias, toKias, altFt) {
  const v = ktToFtps(iasToTasKt(kias, altFt)), v0 = ktToFtps(iasToTasKt(toKias, altFt));
  return Math.max(0, (v * v - v0 * v0) / (2 * G_FTPS2)) / heightFactor(altFt);
}

// ── The chain: the planned path as the turns and straights the aircraft flies ──
//
// A plan is a list of points (joins, the circle, the direct, the square-off). The chain turns it into what is flown:
// every corner becomes a turn at its planned radius (a point's own `arc` radius, else the 45° radius at 120 KIAS),
// joined to the straights at a tangent. The height needed is summed along the chain, and the aircraft flies the
// same chain, so the plan and the flight are one path (Fable F9, F16).

export const FILLET_MIN_DEG = 0.5;
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
export function buildChain(pts, defaultR = directTurnRadiusFt()) {
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
export function chainLocate(chain, idx, p) {
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
export function chainBank(chain, loc, pilot, wind, bankMax) {
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
export function chainSum(chain, planOf, idx, along, altFt, wind, { base = 0, maxPlan = 3, stopOwner = Infinity, kiasNow = null } = {}) {
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
export function chainFtTo(chain, idx, along, stopOwner) {
  let ft = 0;
  for (let k = idx; k < chain.pieces.length && chain.pieces[k].owner < stopOwner; k++) ft += chain.pieces[k].len - (k === idx ? along : 0);
  return ft;
}

// ── Path Generation & Geometric Solvers ────────────────────────────────────────

export function planAt(theta) {
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

export function finalToAim(geo, aimAlongFt) {
  const aim = geo.along(aimAlongFt);
  const beyond = geo.along(Math.min(geo.lenFt, aimAlongFt + 3000));
  const td = geo.along(PFL.touchdownFt);
  const first = aimAlongFt > PFL.touchdownFt + 1 && aimAlongFt <= geo.aimAlongFt + 1 ? [{ x: td.x, y: td.y, plan: 3, key: 'touchdown' }] : [];
  return [...first, { x: aim.x, y: aim.y, plan: 3, key: 'aim' }, { x: beyond.x, y: beyond.y, plan: 3, key: 'rollout' }];
}

export function arcToAim(geo, theta0, extra = {}) {
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

// ── Height sums on a path ─────────────────────────────────────────────────────

/**
 * Height needed (altimeter feet) from `pos` on segment `seg` of `path` to the point keyed `stopAtKey` (the aim point,
 * unless told), summed on the chain of that path from where the aircraft is, flying the planned drag from here on
 * (never less than cfgNow; one step more with takeNext; never more than maxPlan).
 */
export function neededFt(path, seg, pos, altFt, cfgNow, wind, takeNext = false, stopAtKey = 'aim', maxPlan = 3) {
  const stop = path.findIndex((p) => p.key === stopAtKey);
  if (stop >= 0 && stop <= seg) return 0;
  const pts = [{ x: pos.x, y: pos.y }, ...path.slice(seg + 1)];
  const chain = buildChain(pts);
  const base = takeNext ? Math.min(3, cfgNow + 1) : cfgNow;
  return chainSum(chain, (o) => path[seg + o]?.plan ?? 0, 0, 0, altFt, wind, { base, maxPlan, stopOwner: stop >= 0 ? stop - seg : Infinity });
}

/** Height needed, clean at 125 KIAS, from `from` to point toIdx of `path` (the join). */
export function neededTo(path, toIdx, from, altFt, wind) {
  const pts = [{ x: from.x, y: from.y }, ...path.slice(1)];
  return chainSum(buildChain(pts), () => 0, 0, 0, altFt, wind, { maxPlan: 0, stopOwner: toIdx });
}

export function minDragPlan(path) {
  const direct = path[0]?.key === 'direct';
  if (direct) return path.map((p) => ({ ...p, plan: 0 }));
  const fk = path.findIndex((p) => p.key === 'final_key' || p.key === 'lined_up' || (p.theta ?? 0) >= 270);
  return path.map((p, i) => ({ ...p, plan: fk >= 0 && i >= fk ? Math.max(p.plan ?? 0, 1) : 0 }));
}

export function project(path, seg, p) {
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
