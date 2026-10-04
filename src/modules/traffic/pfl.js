// The PFL: an engine failure from anywhere, or the glide from High Key, flown
// to the runway (Traffic spec 4.5; refactor PR 3; Patrick's PFL definition and
// energy logic, ratified 4 Oct 07:03Z and 06:47Z, spec wording approved 08:54Z).
//
// How it works, in two layers (spec 4.5 items 3 and 6-7):
//   - the decision layer picks goals from the energy: where to join the PFL
//     circle, when to take each drag step, when to cut in, go direct to the
//     runway, or eject. It works from one number, the energy margin;
//   - the flight layer flies those goals with the T-6's own physics: a
//     simulated pilot (circuit.js makePilot) rolls at the roll rate, pulls or
//     pushes in the zoom, and glides with the drag of the configuration down
//     (glideDragPerWeight), so height and speed come out of the flying, never
//     from a schedule.
// The pilot flies the whole PFL once, at the button press, in today's wind,
// and the path it leaves is what the path follower flies (as the circuit is
// built, circuit.js). Every decision is taken inside that flight with the
// height and speed the aircraft has at that moment, so it is the same as
// deciding live in a steady wind.
//
// Positions are map feet, x east and y north; headings and tracks compass
// degrees true; speeds KIAS unless named KTAS. Nothing here reads the page.
import { ktToFtps, KT_TO_FTPS, G_FTPS2 } from '../../core/units.js';
import { wrapDeg180, wrapDeg360, compassDegFromVector } from '../../core/angles.js';
import { turnRadiusFromBankFt, turnRateFromBankRadPerSec, dampedClimbG, easeValue } from '../../core/flight-math.js';
import { iasToTasKt, glideDragPerWeight, glideRatio, stallLimitG, zoomT6A } from '../../core/t6-performance.js';
import { windTriangle } from '../../core/wind.js';
import { legOffsetsFt } from '../../core/geo.js';
import { makePilot, bankFor, PILOT_DT } from './circuit.js';
import { startJoin } from './path-follower.js';
import { routeLengthFt } from './route.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, THRESHOLD_DATA_ELEV_FT, PFL_CIRCLE_RADIUS_FT, PFL_KEY_ALT_FT } from './airfield.js';

/** The PFL's flying numbers, each with its source. Orders and SMM numbers are defaults, not walls. */
export const PFL = Object.freeze({
  /** Zoom only above 150 KIAS (Patrick, 4440; card C7 06:35Z); at or below it, hold height and slow to glide speed. */
  zoomAboveKias: 150,
  /** The zoom: a 2 G pull, push over through 140, capture 125 (EFIG p.408; Patrick C7 06:35Z). */
  zoomPullG: 2,
  /** Most G the glide may pull to move the nose, never past the stall line (TR-51; Patrick 17:52Z). */
  glideMaxG: 2,
  /** How fast the G builds or eases, in G per second, and how fast that rate itself changes, in G per second² (TR-51). Estimates. */
  gOnsetGps: 2,
  gOnsetGps2: 8,
  pushOverKias: 140,
  /** Steepest climb angle in the pull, so the push-over can capture 125 KIAS. An estimate. */
  zoomMaxClimbDeg: 30,
  /** Most bank while zooming, so the zoom still gains height while it turns toward the join. An estimate. */
  zoomMaxBankDeg: 30,
  /** Glide speeds: 125 KIAS clean until the gear goes down, then 120 (SMM 13.5 para 8, 13.14 para 26; Patrick 06:26Z). */
  glideCleanKias: 125,
  glideGearKias: 120,
  /** Going direct, it may trade speed late, down to 80 KIAS (Patrick 06:35Z; TR-R14), but never closer to the stall than the margin below. */
  minTradeKias: 80,
  /**
   * Stall speed at 1 G, KIAS, by configuration (index as PFL_CONFIGS). Clean: core's 86 (SMM 5.5 para 15 gives about 80-85);
   * the gear doesn't change it; T/O flap lowers it only slightly (SMM 4.8 para 14), so it keeps the clean number (an estimate);
   * landing flap: 76, the top of SMM 5.8 para 29's 68-76.
   */
  stallKias: [86, 86, 86, 76],
  /** The speed trade stays this far above the stall: the stick shaker's 5-10 kt (SMM 5.5 para 15), at its low end. An estimate. */
  stallMarginKt: 5,
  /** Up to 60° of bank until the 2,100 ft gate (Patrick 08:34Z); the stall line still holds. Bank over 45° below the gate is flagged (SMM 13.14). */
  maxBankDeg: 60,
  gateFlagBankDeg: 45,
  /** The High Key window, ft MSL (WFO S2 art 403 para 1a; Patrick C4 06:30Z). */
  highKeyMinFt: 5000,
  highKeyMaxFt: 6000,
  /** Within this of High Key, a PFL starts at High Key and gets its window check (the sim's High Key button uses the same 1,500 ft). An estimate. */
  atHighKeyFt: 1500,
  /** Keys move into wind from 15 kt (estimate, Patrick 06:56Z): High Key the full amount, Low Key half, about 1,000 ft per 10 kt (EFIG p.402, p.406). */
  keyShiftFromKt: 15,
  keyShiftFtPer10Kt: 1000,
  /** A drag step taken before its planned point needs the margin to cover it plus this much (estimate, pfl-energy-logic.md). */
  dragBufferFt: 100,
  /** Down to this far below the profile still counts as on it: a step due by the plan is taken (estimate). */
  onProfileFt: 50,
  /** The 2,100 ft gate: 120 KIAS, within 35° of runway heading (TR-R14). */
  gateAltFt: 2100,
  gateTrackDeg: 35,
  gateKias: 120,
  /** Aim a third down the runway until the landing flap goes down (SMM 13.9 para 18; Patrick 06:35Z, 09:49Z). */
  aimFractionOfRunway: 1 / 3,
  /** With landing flap, touch down in the first 1,000 ft: closer is better (Patrick 09:49Z, 09:56Z). */
  touchdownFt: 1000,
  /** The latest touchdown point, short of the far end. An estimate. */
  stopMarginFt: 2000,
  /** Join points are tried every 5° round the circle, up to Final Key (pfl-energy-logic.md). */
  joinStepDeg: 5,
  lastJoinDeg: 270,
  /** Straight run onto a join point along its tangent, so the aircraft arrives on the circle's line. An estimate. */
  joinLeadFt: 1500,
  /** Run-in to High Key along the extended centreline from the area. An estimate. */
  highKeyRunInFt: 3000,
  /** Straight final before the touchdown point when going direct, so the flight path is lined up by 2,100 ft. An estimate. */
  directFinalFt: 2000,
  /** How far ahead the pilot looks along the path (pure pursuit). An estimate. */
  lookaheadFt: 1000,
  /** When low, the look-ahead grows by this many feet per foot of deficit, so the path cuts inside the circle. An estimate. */
  cutFtPerFtLow: 8,
  maxLookaheadFt: 6000,
  /** A pattern PFL high by more than this even with all the drag out widens the circle before Final Key (Patrick 10:10Z, 17:10Z). An estimate. */
  widenAboveFt: 100,
  /** Widest it goes outside the circle when widening. An estimate. */
  maxWidenFt: 6000,
  /** For its first second it holds the bank it has before turning for the join: reaction time, and no step at the hand-over. An estimate. */
  holdBankSec: 1,
  /** Speed changes in the glide: at most 0.1 G along the path. An estimate. */
  maxAccelG: 0.1,
});

/** The configurations in the order they are taken (spec 4.5 item 7). */
export const PFL_CONFIGS = Object.freeze(['clean', 'gearDown', 'flapsTakeoff', 'landing']);
/** What the tag shows for each configuration. */
export const PFL_CONFIG_LABELS = Object.freeze(['Clean', 'Gear', 'Gear + T/O flap', 'Gear + landing flap']);
/** The planned drag (Patrick 08:32Z): gear near High Key, T/O flap near Low Key, landing flap near Final Key; degrees round the circle. */
const PLAN_DEG = [-Infinity, 0, 180, 270];

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const bearing = (a, b) => compassDegFromVector(b.x - a.x, b.y - a.y);

/**
 * The PFL circle for today's wind, and the runway. θ is degrees turned from
 * High Key, left (counter-clockwise): 0 High Key over the threshold, 180 Low
 * Key, 270 Final Key, 360 back at the threshold on the centreline.
 * `settings.pflKeysIntoWind` (default on) moves the keys into wind from 15 kt.
 */
export function pflGeometry(windFromDeg = 360, windKt = 0, settings = {}) {
  const th = THRESHOLD_29L, dep = DEPARTURE_END_29L;
  const lenFt = dist(th, dep);
  const u = { x: (dep.x - th.x) / lenFt, y: (dep.y - th.y) / lenFt };
  const rwyDeg = compassDegFromVector(u.x, u.y);
  const r = PFL_CIRCLE_RADIUS_FT;
  // Centre: 0.5 NM to the left of the runway heading from the threshold.
  const left = { x: -u.y, y: u.x };
  const centre = { x: th.x + left.x * r, y: th.y + left.y * r };
  const thBearing = bearing(centre, th);
  const shiftOn = (settings.pflKeysIntoWind ?? true) && windKt >= PFL.keyShiftFromKt;
  const shiftFt = shiftOn ? PFL.keyShiftFtPer10Kt * windKt / 10 : 0;
  const up = { x: Math.sin(windFromDeg * DEG), y: Math.cos(windFromDeg * DEG) };
  /** The point θ round the circle, with the keys moved into wind (High Key full, Low Key half, the threshold not at all). */
  const at = (theta) => {
    const b = (thBearing - theta) * DEG;
    const k = shiftFt * (1 - clamp(theta, 0, 360) / 360);
    return { x: centre.x + r * Math.sin(b) + up.x * k, y: centre.y + r * Math.cos(b) + up.y * k };
  };
  /** The ground track along the circle at θ. */
  const trackAt = (theta) => bearing(at(theta - 0.5), at(theta + 0.5));
  const along = (ft) => ({ x: th.x + u.x * ft, y: th.y + u.y * ft });
  return { th, dep, u, lenFt, rwyDeg, r, centre, at, trackAt, along, shiftFt, aimAlongFt: lenFt * PFL.aimFractionOfRunway };
}

// ── Paths ────────────────────────────────────────────────────────────────────
// A path is a list of ground points { x, y, plan, key?, theta? }: `plan` is the
// configuration planned from that point on (an index into PFL_CONFIGS).

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

/** The circle from θ0 to the threshold, then the straight to the touchdown point and a little beyond. */
function arcToAim(geo, theta0, extra = {}) {
  const pts = [];
  for (let th = theta0; th < 360 - 1e-6; th += PFL.joinStepDeg) {
    const p = geo.at(th);
    pts.push({ x: p.x, y: p.y, theta: th, plan: planAt(th), key: keyAt(th), ...extra });
    if (th + PFL.joinStepDeg > 360 - 1e-6) break;
    // Snap to the keys so they are path points.
    const next = th + PFL.joinStepDeg;
    for (const kd of [180, 270]) if (th < kd && next > kd) { const q = geo.at(kd); pts.push({ x: q.x, y: q.y, theta: kd, plan: planAt(kd), key: keyAt(kd) }); }
  }
  pts.push({ x: geo.th.x, y: geo.th.y, theta: 360, plan: 3, key: 'threshold' });
  return [...pts, ...finalToAim(geo, geo.aimAlongFt)];
}

function finalToAim(geo, aimAlongFt) {
  const aim = geo.along(aimAlongFt);
  const beyond = geo.along(Math.min(geo.lenFt, aimAlongFt + 3000));
  const td = geo.along(PFL.touchdownFt);
  // The first 1,000 ft point only when aiming a third down or shorter; a direct glide landing long lines up beyond it.
  const first = aimAlongFt > PFL.touchdownFt + 1 && aimAlongFt <= geo.aimAlongFt + 1 ? [{ x: td.x, y: td.y, plan: 3, key: 'touchdown' }] : [];
  return [...first, { x: aim.x, y: aim.y, plan: 3, key: 'aim' }, { x: beyond.x, y: beyond.y, plan: 3, key: 'rollout' }];
}

/**
 * A tangent join at θ (spec 4.5 item 6): straight on, then one turn (`side` 1
 * right, −1 left) at radius `rt`, rolling out on the circle's line short of θ,
 * then along it onto the circle and round, as a pilot flies it. Too close to
 * start that turn at that radius, it turns tighter, but no tighter than `minRt`.
 * Null if that can't be done in one turn (it would need an
 * S). Without a heading, a straight run onto the line. The path carries the
 * turn's degrees, its radius and the straight before it.
 * @returns {(any[] & { turnDeg?: number, turnRadiusFt?: number, straightFt?: number }) | null}
 */
function joinPath(geo, from, theta, headingDeg = undefined, rt = DIRECT_TURN_RADIUS_FT, minRt = rt, side = 1) {
  const p = geo.at(theta);
  const trk = geo.trackAt(theta);
  const t = { x: Math.sin(trk * DEG), y: Math.cos(trk * DEG) };
  if (!Number.isFinite(headingDeg)) {
    const q = { x: p.x - t.x * PFL.joinLeadFt, y: p.y - t.y * PFL.joinLeadFt };
    // Already on the line short of the point (or past the lead-in): straight on.
    const o = legOffsetsFt(q, p, from);
    const lead = o.alongFt > 0 && Math.abs(o.crossFt) < PFL.joinLeadFt / 2 ? [] : [{ x: q.x, y: q.y, plan: 0 }];
    return [{ x: from.x, y: from.y, plan: 0 }, ...lead, ...arcToAim(geo, theta)];
  }
  const turnDeg = wrapDeg360(side * (trk - headingDeg));
  const h = { x: Math.sin(headingDeg * DEG), y: Math.cos(headingDeg * DEG) };
  // The roll-out point less the turn's start, per foot of radius: the turn's centre is to the turning side.
  const v1 = { x: side * (h.y - t.y), y: side * (t.x - h.x) };
  // How far to fly straight first so the roll-out is on the line: its offset across the line must be nil.
  const n = { x: t.y, y: -t.x };
  const offFt = (from.x - p.x) * n.x + (from.y - p.y) * n.y;
  const rate = h.x * n.x + h.y * n.y;
  const per = v1.x * n.x + v1.y * n.y;
  const ht = h.x * t.x + h.y * t.y;
  const along0 = (from.x - p.x) * t.x + (from.y - p.y) * t.y;
  // For a radius, the straight first that puts the roll-out on the line short of the point, or null.
  const fit = (r) => {
    let d;
    if (Math.abs(rate) < 0.02) {
      // Rolling out parallel to its heading: the radius alone puts it on the line; fly straight until it is short of the point.
      if (Math.abs(offFt + r * per) > 100) return null;
      d = ht < 0 ? Math.max(0, along0 + r * (v1.x * t.x + v1.y * t.y)) : 0;
    } else d = -(offFt + r * per) / rate;
    if (d < 0 || along0 + d * ht + r * (v1.x * t.x + v1.y * t.y) > 0) return null;
    return d;
  };
  // Its usual radius if that fits, otherwise the gentlest tighter one that does (too close to start the turn later).
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
  // Rolls out on the line short of the join point, not past it.
  if ((e.x - p.x) * t.x + (e.y - p.y) * t.y > 0) return null;
  const c = { x: s0.x + side * rt * h.y, y: s0.y - side * rt * h.x };
  const arc = [];
  for (let k = PFL.joinStepDeg; k < turnDeg - 1e-6; k += PFL.joinStepDeg) {
    const a = (headingDeg + side * k) * DEG;
    arc.push({ x: c.x - side * rt * Math.cos(a), y: c.y + side * rt * Math.sin(a), plan: 0 });
  }
  const straight = d > 1 ? [{ x: s0.x, y: s0.y, plan: 0 }] : [];
  const out = dist(e, p) > 1 ? [{ x: e.x, y: e.y, plan: 0 }] : [];
  return Object.assign([{ x: from.x, y: from.y, plan: 0 }, ...straight, ...arc, ...out, ...arcToAim(geo, theta)], { turnDeg, turnRadiusFt: rt, straightFt: d });
}

/** To High Key from the area: onto the extended centreline, over the threshold on runway heading. */
function highKeyPath(geo, from) {
  const run = geo.along(-PFL.highKeyRunInFt);
  return [{ x: from.x, y: from.y, plan: 0 }, { x: run.x, y: run.y, plan: 0 }, { x: geo.th.x, y: geo.th.y, plan: 0, theta: 0, key: 'high_key', highKeyCheck: true }];
}

/** Radius of the turn onto final when going direct: 45° of bank at 120 KIAS at about 2,500 ft (SMM 13.14 flags more than 45°). */
const DIRECT_TURN_RADIUS_FT = turnRadiusFromBankFt(ktToFtps(iasToTasKt(PFL.glideGearKias, 2500)), PFL.gateFlagBankDeg);

/**
 * The turn from the present heading until the nose points at `target`, at the
 * direct turn radius (estimate: 45° bank at 120 KIAS), as path points. Empty if
 * it already points within 10°. Without it a path back behind the aircraft
 * would cost no turn at all.
 */
function leadTurn(from, headingDeg, target) {
  if (!Number.isFinite(headingDeg)) return [];
  const off = wrapDeg180(bearing(from, target) - headingDeg);
  if (Math.abs(off) <= 10) return [];
  const side = off > 0 ? 1 : -1; // 1: turning right
  const rt = DIRECT_TURN_RADIUS_FT;
  const c = { x: from.x + rt * Math.sin((headingDeg + side * 90) * DEG), y: from.y + rt * Math.cos((headingDeg + side * 90) * DEG) };
  const arc = [];
  for (let k = PFL.joinStepDeg; k < 360; k += PFL.joinStepDeg) {
    const h = headingDeg + side * k;
    const b = h - side * 90; // from the centre to the aircraft
    const p = { x: c.x + rt * Math.sin(b * DEG), y: c.y + rt * Math.cos(b * DEG), plan: 0 };
    arc.push(p);
    if (dist(c, target) <= rt || Math.abs(wrapDeg180(bearing(p, target) - h)) <= PFL.joinStepDeg) break;
  }
  return arc;
}

/**
 * Direct to the runway: a straight glide to a turn that rolls out on the
 * centreline `PFL.directFinalFt` before the touchdown point, then down it. The
 * turn is a circle tangent to the centreline there, joined at its tangent from
 * where the aircraft is (from downwind it is a base turn), left or right,
 * whichever is shorter.
 * Given the heading, it first turns from it towards the glide.
 */
function directPath(geo, from, aimAlongFt, gearAtJoin = true, headingDeg = undefined) {
  const straight = directPathFrom(geo, from, aimAlongFt, gearAtJoin);
  const arc = leadTurn(from, headingDeg, straight[1]);
  if (!arc.length) return straight;
  return [straight[0], ...arc, ...directPathFrom(geo, arc[arc.length - 1], aimAlongFt, gearAtJoin).slice(1)];
}

function directPathFrom(geo, from, aimAlongFt, gearAtJoin) {
  const j = geo.along(aimAlongFt - PFL.directFinalFt);
  const rt = DIRECT_TURN_RADIUS_FT;
  // A left or a right turn onto final, whichever is shorter.
  let best = null;
  for (const side of [1, -1]) {
    const n = { x: -geo.u.y * side, y: geo.u.x * side }; // side 1: the centre to the left of the runway heading
    const c = { x: j.x + n.x * rt, y: j.y + n.y * rt };
    const bJ = bearing(c, j);
    const arc = [];
    let len = 0;
    if (dist(from, c) > rt * 1.05) {
      // The tangent point: where the line from the aircraft runs along the circle's track (bearing − 90° turning left, + 90° turning right).
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

// ── Energy ───────────────────────────────────────────────────────────────────

function glideKias(cfg) { return cfg > 0 ? PFL.glideGearKias : PFL.glideCleanKias; }

/**
 * Height needed, ft, to fly the path from `pos` (on segment `seg`) to the
 * touchdown point: each piece's air distance (ground distance × TAS ÷ ground
 * speed) times drag ÷ weight at its configuration, speed and the G its curve
 * needs. `cfgNow` is the configuration down; `takeNext` takes the next step
 * from now on. The configuration is never less than the plan says, up to `maxPlan`.
 */
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
      const wt = windTriangle(trk, tas, wind.windFromDeg, wind.windKt);
      const gs = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 20) : 20;
      // The turn this piece flies: heading change to the next piece over its length.
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
      const dh = air * glideDragPerWeight(PFL_CONFIGS[cfg], kias, alt, g);
      need += dh;
      alt -= dh;
    }
    if (b.key === stopAtKey) break;
    a = b;
  }
  return need;
}

/** Feet still to fly along the path from a projection to the first point with `key` (all of it if there is none). */
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

/** Core's stall line, (KIAS ÷ stall speed)², at this configuration's stall speed. */
function stallG(kias, cfg) {
  return stallLimitG(kias, /** @type {any} */ (PFL.stallKias[cfg]));
}

/** The slowest the speed trade goes in a configuration: 80 KIAS, or the stall plus its margin if that is higher. */
function tradeFloorKias(cfg) {
  return Math.max(PFL.minTradeKias, PFL.stallKias[cfg] + PFL.stallMarginKt);
}

/** Height worth trading from speed, ft: (V² − V_floor²) ÷ 2g in true airspeed. */
function speedTradeFt(kias, altFt, cfg) {
  const v = ktToFtps(iasToTasKt(kias, altFt));
  const vFloor = ktToFtps(iasToTasKt(tradeFloorKias(cfg), altFt));
  return Math.max(0, (v * v - vFloor * vFloor) / (2 * G_FTPS2));
}

/**
 * Where to join, from a position, height and track (spec 4.5 item 6). Returns
 * { kind: 'highKey' | 'circle' | 'direct' | 'none', path, theta?, aimAlongFt?, label }.
 * `availFt` is the height it will have at glide speed (zoom included).
 */
export function chooseJoin(geo, from, availFt, trackDeg, wind, { allowHighKey = true, turnRadiusFt = DIRECT_TURN_RADIUS_FT, minTurnRadiusFt = turnRadiusFt } = {}) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  // High Key first, if it can be made inside the window's bottom or above (area PFL).
  if (allowHighKey) {
    const hk = highKeyPath(geo, from);
    const atHk = availFt - neededFt(hk, 0, from, availFt, 0, wind, false, 'high_key');
    if (atHk >= PFL.highKeyMinFt) return { kind: 'highKey', path: [...hk, ...arcToAim(geo, PFL.joinStepDeg)], theta: 0, label: 'Join at High Key' };
  }
  // A tangent join anywhere up to Final Key, in one turn: of those it can make, the one with the least turn
  // and the shortest straight before it, at its usual turn radius if it can, otherwise the gentlest tighter one.
  // A turn the way the circle goes (left) may run to 270°, as from a break; a right turn, against it, to 180°.
  // Each join must be makeable (clean, gear only at Final Key) and not so high
  // that all the drag can't take the height off; if every makeable one is too
  // high, the one most in line still goes, and the drag and the runway take the rest.
  // If no join can be made in one turn, a straight run onto the line (turning onto it as it can); failing those, direct.
  const search = (oneTurn) => {
    let best = null, bestHigh = null;
    for (let th = 0; th <= PFL.lastJoinDeg + 1e-6; th += PFL.joinStepDeg) {
      const tries = oneTurn ? [-1, 1].map((side) => joinPath(geo, from, th, trackDeg, turnRadiusFt, minTurnRadiusFt, side)) : [joinPath(geo, from, th)];
      const score = (p) => (oneTurn ? p.turnDeg + p.straightFt / 1000 + 1000 * (turnRadiusFt - p.turnRadiusFt) / turnRadiusFt : Math.abs(wrapDeg180(geo.trackAt(th) - trackDeg)));
      const path = tries.filter((p, k) => p && (!oneTurn || p.turnDeg <= (k === 0 ? 270 : 180))).sort((x, y) => score(x) - score(y))[0];
      if (!path) continue;
      const toJoinIdx = path.findIndex((p) => p.theta === th);
      const toJoin = neededTo(path, toJoinIdx, from, availFt, wind);
      const hAtJoin = availFt - toJoin;
      const least = neededFt(minDragPlan(path), toJoinIdx, path[toJoinIdx], hAtJoin, 0, wind);
      if (hAtJoin - least - ground < 0) continue;
      const most = neededFt(path.map((p) => ({ ...p, plan: 3 })), toJoinIdx, path[toJoinIdx], hAtJoin, 0, wind);
      const pick = { turn: score(path), th, path };
      if (hAtJoin - most - ground <= 0) { if (!best || pick.turn < best.turn - 1e-6) best = pick; }
      else if (!bestHigh || pick.turn < bestHigh.turn - 1e-6) bestHigh = pick;
    }
    const asJoin = (pick) => pick && { kind: 'circle', path: pick.path, theta: pick.th, label: joinLabel(pick.th) };
    return { best: asJoin(best), high: asJoin(bestHigh) };
  };
  // One turn and in range first; then a straight run in range; then one too high, which the drag and runway must take.
  const one = search(true), run = search(false);
  const join = one.best ?? run.best ?? one.high ?? run.high ?? chooseDirect(geo, from, availFt, PFL.glideCleanKias, wind, trackDeg);
  if (join) return join;
  return { kind: 'none', path: directPath(geo, from, geo.aimAlongFt, true, trackDeg), aimAlongFt: geo.aimAlongFt, label: 'Eject' };
}

/** Height to fly from `from` along the path to point `idx`, clean. */
function neededTo(path, idx, from, altFt, wind) {
  const part = path.slice(0, idx + 1).map((p, i) => (i === idx ? { ...p, key: '__end' } : p));
  return neededFt(part, 0, from, altFt, 0, wind, false, '__end');
}

/**
 * The same path with only the drag it must have: on the circle, gear from Final
 * Key and no flap; going direct, nothing (it may land gear up, spec 4.5 item 10).
 */
function minDragPlan(path) {
  const direct = path[0]?.key === 'direct';
  return path.map((p) => ({ ...p, plan: direct ? 0 : (p.theta !== undefined ? (p.theta >= 270 ? 1 : 0) : (p.key === 'threshold' || p.key === 'touchdown' || p.key === 'aim' || p.key === 'rollout' ? 1 : 0)) }));
}

function joinLabel(theta) {
  if (theta <= 10) return 'Join at High Key';
  if (Math.abs(theta - 180) <= 10) return 'Join at Low Key';
  if (Math.abs(theta - 270) <= 10) return 'Join at Final Key';
  return 'Join circle';
}

/**
 * Direct to the runway (spec 4.5 item 10): the nearest touchdown point, from a
 * third down the runway onward, it can make; turning early and landing further
 * down if it must (Patrick 08:33Z). Counts the late speed trade to 80 KIAS, or the stall plus margin in its configuration.
 * Returns null if it can make no point on the runway.
 */
function chooseDirect(geo, from, altFt, kias, wind, headingDeg = undefined, cfg = 0) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  const last = geo.lenFt - PFL.stopMarginFt;
  const trade = speedTradeFt(kias, altFt, cfg);
  // Touchdown points from the aim point outward, nearest first: shorter (down to just past the threshold) or longer (turning early).
  const alongs = [];
  for (let d = 0; geo.aimAlongFt + d <= last + 1e-6 || geo.aimAlongFt - d >= 500; d += 500) {
    if (geo.aimAlongFt - d >= 500 && d > 0) alongs.push(geo.aimAlongFt - d);
    if (geo.aimAlongFt + d <= last + 1e-6) alongs.push(geo.aimAlongFt + d);
  }
  for (const along of alongs) {
    const path = minDragPlan(directPath(geo, from, along, true, headingDeg));
    const need = neededFt(path, 0, from, altFt, 0, wind);
    if (altFt - need - ground + trade >= 0) {
      return { kind: 'direct', path: directPath(geo, from, along, true, headingDeg), aimAlongFt: along, label: along > geo.aimAlongFt + 1 ? 'Turn early, land long' : 'Direct threshold' };
    }
  }
  return null;
}

/**
 * The circle widened from where the aircraft is to Final Key, so that with all
 * the drag out it still touches down where it aims (Patrick 10:10Z: widen the
 * circle, but don't extend Final Key). The widening swells out and comes back
 * in to the circle at Final Key; the rest of the path is unchanged. Null if
 * none is needed or none of the widths tried uses the height up.
 */
function widenPath(geo, path, seg, s, altFt, wind, tdKey) {
  const ground = THRESHOLD_DATA_ELEV_FT;
  const th0 = path[seg].theta;
  const fk = path.findIndex((p, i) => i > seg && p.theta !== undefined && p.theta >= PFL.lastJoinDeg);
  if (fk < 0) return null;
  const out = (p) => { const d = dist(geo.centre, p); return { x: (p.x - geo.centre.x) / d, y: (p.y - geo.centre.y) / d }; };
  const base0 = geo.at(th0);
  const now = dist(geo.centre, s) - dist(geo.centre, base0);
  const build = (k) => {
    const pts = [{ x: s.x, y: s.y, theta: th0, plan: path[seg].plan }];
    for (let th = th0 + PFL.joinStepDeg; th < PFL.lastJoinDeg - 1e-6; th += PFL.joinStepDeg) {
      const f = (th - th0) / (PFL.lastJoinDeg - th0);
      const off = now * (1 - f) + k * Math.sin(Math.PI * f);
      const p = geo.at(th), u = out(p);
      pts.push({ x: p.x + u.x * off, y: p.y + u.y * off, theta: th, plan: planAt(th), key: keyAt(th) });
    }
    return [...pts, ...path.slice(fk)];
  };
  const spare = (k) => altFt - ground - neededFt(build(k), 0, s, altFt, 3, wind, false, tdKey);
  if (spare(PFL.maxWidenFt) > 0) return build(PFL.maxWidenFt);
  let lo = 0, hi = /** @type {number} */ (PFL.maxWidenFt);
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (spare(mid) > 0) lo = mid; else hi = mid; }
  return lo > 50 ? build(lo) : null;
}

// ── Flying it ────────────────────────────────────────────────────────────────

/** Nearest point on the path at or after segment `seg` (searching a few ahead, so it never runs backwards round an orbit). */
function project(path, seg, p) {
  let best = { seg, u: 0, d: Infinity, pt: path[seg] };
  for (let i = seg; i < Math.min(path.length - 1, seg + 6); i++) {
    const a = path[i], b = path[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
    const u = l2 ? clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / l2, 0, 1) : 0;
    const pt = { x: a.x + vx * u, y: a.y + vy * u };
    const d = dist(pt, p);
    if (d < best.d - 1e-6) best = { seg: i, u, d, pt };
  }
  return best;
}

/** The point `ahead` feet further along the path from a projection. */
function carrot(path, proj, ahead) {
  let left = ahead;
  let a = proj.pt;
  for (let i = proj.seg + 1; i < path.length; i++) {
    const b = path[i];
    const l = dist(a, b);
    if (l >= left) return { x: a.x + (b.x - a.x) * left / l, y: a.y + (b.y - a.y) * left / l };
    left -= l;
    a = b;
  }
  return path[path.length - 1];
}

/**
 * Flies a PFL from `start` = { x, y, alt, kias, headingDeg, bankDeg?, rollRateDps? } in `wind` =
 * { windFromDeg, windKt }. `options`: practice (the High Key button: a missed
 * gate goes around), settings (pflKeysIntoWind). Returns { points, outcome,
 * touchdown?, eject?, notes } where points are path points with x, y, alt,
 * kt (KIAS), headingDeg, phase, tag, decision and config, and outcome is
 * 'landed', 'eject' or 'go_around'.
 */
export function flyPfl(start, wind = { windFromDeg: 360, windKt: 0 }, options = {}) {
  const practice = Boolean(options.practice);
  const geo = pflGeometry(wind.windFromDeg, wind.windKt, options.settings);
  const ground = THRESHOLD_DATA_ELEV_FT;
  const pilot = makePilot({ x: start.x, y: start.y, alt: start.alt, ias: start.kias, hdg: start.headingDeg, src: 0, phase: 'pfl_zoom' }, wind);
  const { s } = pilot;
  // It starts in the bank and roll it already has, so the turn carries on without a step at the hand-over.
  s.bank = Number.isFinite(start.bankDeg) ? start.bankDeg : 0;
  s.rollRate = Number.isFinite(start.rollRateDps) ? start.rollRateDps : 0;
  s.rec = { decision: '', config: PFL_CONFIG_LABELS[0] };
  let cfg = 0;
  const setRec = (decision) => { s.rec = { decision, config: PFL_CONFIG_LABELS[cfg], cfgIndex: cfg }; };

  // The join, chosen at the press from the energy (zoom included) (spec 4.5 item 6).
  const zooming = start.kias > PFL.zoomAboveKias;
  const zoomGain = zooming ? zoomT6A(start.kias, start.alt).gainFt : 0;
  // Slowing level from below 150 KIAS to 125 gives its energy too, once.
  const avail = start.alt + zoomGain;
  // Turning while it zooms, the radius is about that of the zoom's mean speed at its bank limit.
  // It may turn tighter, down to the radius at glide speed at the top.
  const zoomRadius = (kias) => turnRadiusFromBankFt(ktToFtps(iasToTasKt(kias, start.alt + zoomGain / 2)), PFL.zoomMaxBankDeg);
  const turnRadiusFt = zooming ? zoomRadius((start.kias + PFL.glideCleanKias) / 2) : DIRECT_TURN_RADIUS_FT;
  const minTurnRadiusFt = zooming ? zoomRadius(PFL.glideCleanKias) : DIRECT_TURN_RADIUS_FT;
  let plan = chooseJoin(geo, s, avail, start.headingDeg, wind, { turnRadiusFt, minTurnRadiusFt });
  // Already at High Key (the High Key button, or the PFL pressed there) inside the window or above: High Key's window
  // check runs at once, so a high one orbits or extends to a false High Key and false Low Key (TR-43; Patrick 17:36Z).
  if (Math.hypot(s.x - geo.th.x, s.y - geo.th.y) <= PFL.atHighKeyFt && avail >= PFL.highKeyMinFt) {
    plan = { kind: 'highKey', path: [{ x: s.x, y: s.y, plan: 0, theta: 0, key: 'high_key', highKeyCheck: true }, ...arcToAim(geo, PFL.joinStepDeg)], theta: 0, label: 'At High Key' };
  }
  // A pattern PFL: the PFL button pressed in the circuit, not one gliding from High Key. Only it may widen (TR-48).
  const patternPfl = !practice && plan.kind !== 'highKey';
  let path = plan.path;
  let seg = 0;
  let state = zooming ? 'zoom' : 'slow';
  setRec(zooming ? `Zoom: ${plan.label.toLowerCase()}` : `Slow to 125: ${plan.label.toLowerCase()}`);
  s.tag = undefined;
  pilot.record();

  let gamma = 0;          // flight path angle, radians
  let nz = 1, nzRate = 0; // G in the vertical plane (lift × cos bank) and how fast it is changing, per second
  let pullDone = false;
  let margin = 0;
  let lastKey = undefined;
  let gate = null;
  let outcome = null;
  let touchdown = null;
  let eject = null;
  let goingShort = false; // can't make the runway: glide on toward it until Low Key, then eject
  let pastLowKey = false;
  const notes = [];
  const MAX_STEPS = 30000;

  const replan = (next) => { plan = next; path = next.path.map((p, i) => (i === 0 ? { ...p, x: s.x, y: s.y } : p)); seg = 0; };
  // The false circle (false High Key to false Low Key) flies like the circle: drag goes on as it is due there.
  const onCircle = () => path[seg]?.theta !== undefined || path[seg]?.falseCircle || ['threshold', 'touchdown', 'aim', 'rollout'].includes(path[seg]?.key) || plan.kind === 'direct';

  for (let n = 0; n < MAX_STEPS; n++) {
    const tas = ktToFtps(iasToTasKt(s.ias, s.alt));
    const proj = project(path, seg, s);
    seg = proj.seg;

    // Passing a point: the keys, High Key's window check, and the threshold.
    const passed = path[seg];
    if (passed && passed !== lastKey) {
      lastKey = passed;
      if (passed.key && ['high_key', 'low_key', 'final_key'].includes(passed.key)) s.tag = passed.key;
      if (passed.key === 'low_key') pastLowKey = true;
      if (passed.highKeyCheck) {
        // At High Key from the area (spec 4.5 item 9): orbit or take the gear early above the window, false High Key inside it.
        const rest = path.slice(seg + 1);
        // Above the window it orbits, unless one clean lap would take it below the window's bottom:
        // then the gear goes early and it extends to a false High Key instead.
        let lapPath = null, lapClean = Infinity;
        if (s.alt > PFL.highKeyMaxFt) {
          const lap = arcToAim(geo, PFL.joinStepDeg).filter((p) => p.theta !== undefined);
          lapPath = [{ x: s.x, y: s.y, plan: cfg }, ...lap.map((p) => ({ ...p, plan: 0 })), { x: geo.th.x, y: geo.th.y, theta: 0, plan: 0, key: 'high_key', highKeyCheck: true }];
          lapClean = neededFt(lapPath, 0, s, s.alt, 0, wind);
        }
        if (lapPath && s.alt - lapClean >= PFL.highKeyMinFt) {
          if (s.alt - lapClean > PFL.highKeyMaxFt && cfg < 1) { cfg = 1; notes.push('gear early to make the High Key window'); }
          path = [...lapPath.map((p) => ({ ...p, plan: Math.max(p.plan, cfg) })), ...arcToAim(geo, PFL.joinStepDeg)];
          seg = 0;
          setRec(cfg ? 'Orbit at High Key, gear early' : 'Orbit at High Key');
        } else if (s.alt > PFL.highKeyMinFt) {
          if (lapPath && cfg < 1) { cfg = 1; notes.push('gear early: an orbit would end below the High Key window'); }
          // Carry on down the runway until half the excess is gone, turn, and lose the other half coming back (SMM 13.7 para 16, Fig 13.4).
          const excess = s.alt - PFL.highKeyMinFt;
          const d = Math.max(0, excess / 2 * glideRatio(PFL_CONFIGS[Math.max(cfg, 1)]));
          const off = { x: geo.u.x * d, y: geo.u.y * d };
          const fhk = { x: geo.th.x + off.x, y: geo.th.y + off.y };
          const semi = [];
          for (let th = PFL.joinStepDeg; th <= 180 + 1e-6; th += PFL.joinStepDeg) { const p = geo.at(th); semi.push({ x: p.x + off.x, y: p.y + off.y, plan: 1, falseCircle: true, ...(th > 180 - 1e-6 ? { key: 'false_low_key' } : {}) }); }
          const lk = geo.at(180);
          path = [{ x: s.x, y: s.y, plan: 1 }, { ...fhk, plan: 1, key: 'false_high_key', falseCircle: true }, ...semi, { x: lk.x, y: lk.y, theta: 180, plan: planAt(180), key: 'low_key' }, ...arcToAim(geo, 180 + PFL.joinStepDeg)];
          seg = 0;
          setRec('False High Key');
        } else {
          path = [{ x: s.x, y: s.y, plan: cfg }, ...rest];
          seg = 0;
        }
        lastKey = path[0];
      }
    }

    // Guidance: fly at a point ahead on the path; look further ahead when low, so it cuts inside the circle (spec 4.5 item 7).
    let ahead = /** @type {number} */ (PFL.lookaheadFt);
    if (state === 'glide' && margin < 0) ahead = Math.min(PFL.maxLookaheadFt, ahead + PFL.cutFtPerFtLow * -margin);
    const c = carrot(path, project(path, seg, s), ahead);
    const wantTrack = bearing(s, c);
    const stallBank = Math.acos(clamp(1 / Math.max(stallG(s.ias, cfg), 1.0001), 0, 1)) / DEG;
    const bankMax = state === 'zoom' ? PFL.zoomMaxBankDeg : Math.min(PFL.maxBankDeg, stallBank);
    const bank = n * PILOT_DT < PFL.holdBankSec ? s.bank : bankFor(pilot.headingFor(wantTrack), s, bankMax);

    // Height and speed from the physics (spec 4.5 items 3-5).
    let climb, accel;
    if (state === 'zoom') {
      // 2 G pull until 140 KIAS (the climb held at most PFL.zoomMaxClimbDeg), then push over to capture the glide at 125 (EFIG p.408).
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
      // The G builds and eases at the onset rate, so the pull and the push-over never step (Patrick 17:49Z).
      const eased = easeValue(nz, nzRate, nLoad * Math.cos(s.bank * DEG), PILOT_DT, { maxRateDps: PFL.gOnsetGps, maxAccelDps2: PFL.gOnsetGps2 });
      nz = eased.bankDeg; nzRate = eased.rollRateDps;
      const dw = glideDragPerWeight('clean', s.ias, s.alt, Math.max(nz / Math.cos(s.bank * DEG), 0.5));
      gamma += G_FTPS2 * (nz - Math.cos(gamma)) / tas * PILOT_DT;
      climb = tas * Math.sin(gamma);
      accel = -G_FTPS2 * (dw + Math.sin(gamma));
      if (pullDone && s.ias <= PFL.glideCleanKias + 0.5) state = 'glide';
    } else {
      let want = /** @type {number} */ (glideKias(cfg));
      if (state === 'slow' && s.ias <= PFL.glideCleanKias + 0.5) state = 'glide';
      // Going direct and short: trade speed late, down to 80 KIAS or the stall plus margin (spec 4.5 item 10).
      if (plan.kind === 'direct' && margin < 0 && !goingShort) {
        // Distance still to fly along the path, not straight-line: going direct it may first fly past the runway and turn back.
        if (pathFtTo(path, proj, 'aim') < 6076) {
          // The speed whose kinetic energy covers the deficit: V² − 2g × deficit (true airspeed), no slower than the trade floor.
          const v2 = tas * tas - 2 * G_FTPS2 * -margin;
          const vKt = Math.sqrt(Math.max(v2, 0)) / KT_TO_FTPS;
          want = Math.max(tradeFloorKias(cfg), Math.min(want, vKt * PFL.glideGearKias / Math.max(iasToTasKt(PFL.glideGearKias, s.alt), 1)));
        }
      }
      // Drag from the whole G: the turn's (bank) and the pitch's together.
      const turnG = Math.tan(s.bank * DEG) * Math.cos(gamma);
      const dw = glideDragPerWeight(PFL_CONFIGS[cfg], s.ias, s.alt, Math.max(Math.hypot(nz, turnG), 0.5));
      const wantTas = ktToFtps(iasToTasKt(want, s.alt));
      const wantAccel = clamp((wantTas - tas) / 3, -PFL.maxAccelG * G_FTPS2, PFL.maxAccelG * G_FTPS2);
      // The flight path it wants: level while slowing at or below 150 KIAS, otherwise the glide that gives the wanted speed change.
      const wantGamma = state === 'slow' ? 0 : Math.asin(clamp(-dw - wantAccel / G_FTPS2, -1, 1));
      // The nose goes there with the G easing in and out (Patrick 17:49Z), up to 2 G in all (Patrick 17:52Z),
      // never past the stall line and never below 0 G; what the path doesn't take, the speed does, so the energy still adds up.
      const nzHigh = Math.sqrt(Math.max(0, Math.min(PFL.glideMaxG, stallG(s.ias, cfg)) ** 2 - turnG ** 2));
      const nzWant = clamp(dampedClimbG(gamma, wantGamma, tas), 0, Math.max(nzHigh, Math.cos(gamma)));
      const eased = easeValue(nz, nzRate, nzWant, PILOT_DT, { maxRateDps: PFL.gOnsetGps, maxAccelDps2: PFL.gOnsetGps2 });
      nz = eased.bankDeg; nzRate = eased.rollRateDps;
      gamma += G_FTPS2 * (nz - Math.cos(gamma)) / tas * PILOT_DT;
      climb = tas * Math.sin(gamma);
      accel = -G_FTPS2 * (dw + Math.sin(gamma));
    }

    // The decision layer, once a second (spec 4.5 items 6-7, 9-10).
    if (!goingShort && state !== 'zoom' && state !== 'slow' && n % 10 === 0) {
      if (state === 'apex') state = 'glide';
      // Before the landing flap it aims a third down with gear and T/O flap; with it, at the first 1,000 ft (Patrick 09:49Z).
      const tdKey = path.some((p) => p.key === 'touchdown') ? 'touchdown' : 'aim';
      margin = cfg >= 3
        ? s.alt - ground - neededFt(path, seg, proj.pt, s.alt, cfg, wind, false, tdKey)
        : s.alt - ground - neededFt(path, seg, proj.pt, s.alt, cfg, wind, false, 'aim', 2);
      // The least it needs on this path: no more drag than it must have (gear by Final Key).
      const marginMin = s.alt - ground - neededFt(minDragPlan(path), seg, proj.pt, s.alt, cfg, wind, false, cfg >= 3 ? tdKey : 'aim');
      const onFinal = ['threshold', 'touchdown', 'aim', 'rollout'].includes(path[seg]?.key) || path.slice(0, seg + 1).some((p) => p.key === 'threshold');
      const dragOk = onCircle() && (plan.kind !== 'direct' || margin >= 0);
      // Forced: gear down by Final Key, the line-up or the gate (SMM 13.17 para 39; Patrick 06:26Z).
      const mustGear = cfg < 1 && plan.kind !== 'direct' && (['final_key', 'threshold', 'aim', 'lined_up'].includes(s.tag) || (path[seg]?.theta ?? 0) >= 270 || path[seg]?.key === 'lined_up' || s.alt <= PFL.gateAltFt + 300);
      if (mustGear) cfg = 1;
      else if (dragOk && cfg < 2) {
        // Gear and T/O flap: at their planned point unless low; before it only with height to spare.
        const due = (path[seg]?.plan ?? 0) > cfg;
        if (due ? margin >= -PFL.onProfileFt : s.alt - ground - neededFt(path, seg, proj.pt, s.alt, cfg, wind, true, 'aim', 2) >= PFL.dragBufferFt) cfg += 1;
      } else if (dragOk && cfg === 2) {
        // Landing flap as soon as it still touches down in the first 1,000 ft: closer is better (Patrick 09:56Z).
        if (s.alt - ground - neededFt(path, seg, proj.pt, s.alt, 3, wind, false, tdKey) >= 0) cfg = 3;
      }
      // A pattern PFL high with all the drag out, with no other way to lose it: widen the circle from here to Final Key,
      // which stays where it is (Patrick 10:10Z, 17:10Z). From High Key the height comes off before High Key instead (TR-43).
      const thNow = path[seg]?.theta;
      if (patternPfl && n % 50 === 0 && plan.kind !== 'direct' && thNow !== undefined && thNow < PFL.lastJoinDeg - PFL.joinStepDeg) {
        const high = s.alt - ground - neededFt(path, seg, proj.pt, s.alt, 3, wind, false, tdKey);
        if (high > PFL.widenAboveFt) {
          const wide = widenPath(geo, path, seg, s, s.alt, wind, tdKey);
          if (wide) { path = wide; seg = 0; notes.push(`widened at ${Math.round(s.alt)} ft`); }
        }
      }
      // Low on the circle and cutting in won't do it: go direct, turning early to land further down if needed; or eject.
      if (!onFinal && marginMin < -PFL.dragBufferFt && plan.kind !== 'direct') {
        const direct = chooseDirect(geo, s, s.alt, s.ias, wind, pilot.trackDeg(), cfg);
        const trade = speedTradeFt(s.ias, s.alt, cfg);
        if (direct) { replan(direct); notes.push(`went direct at ${Math.round(s.alt)} ft`); }
        else if (marginMin + trade < 0) { outcome = 'eject'; }
      } else if (!onFinal && plan.kind === 'direct' && marginMin + speedTradeFt(s.ias, s.alt, cfg) < 0) {
        const direct = chooseDirect(geo, s, s.alt, s.ias, wind, pilot.trackDeg(), cfg);
        if (direct && direct.aimAlongFt > (plan.aimAlongFt ?? 0) + 1) replan(direct);
        else if (!direct) outcome = 'eject';
      }
      // It can't make the runway: it glides on toward it as it is until Low Key or Low Key height, then ejects (Patrick 18:05Z).
      if (outcome === 'eject') {
        outcome = null;
        goingShort = true;
        notes.push(`short of the runway at ${Math.round(s.alt)} ft`);
        setRec('Eject');
      }
      // The words on the tag (spec 4.5 item 14).
      let decision;
      if (plan.kind === 'direct') decision = s.ias < PFL.glideGearKias - 2 ? 'Trading speed' : plan.label;
      else if (path[seg]?.falseCircle) decision = path.slice(0, seg + 1).some((p) => p.key === 'false_low_key') ? 'False Low Key' : 'False High Key';
      else if (s.rec.decision?.startsWith('Orbit') && path[seg]?.key !== 'threshold' && seg < path.findIndex((p) => p.highKeyCheck)) decision = s.rec.decision;
      else if (!onCircle()) decision = plan.label;
      else {
        const word = margin > 150 ? 'high' : margin < -PFL.onProfileFt ? 'low' : 'on profile';
        const th = path[seg]?.theta;
        const leg = th === undefined ? 'Final' : th < 180 ? 'To Low Key' : th < 270 ? 'To Final Key' : 'To threshold';
        decision = `${leg}, ${word}`;
      }
      setRec(decision);
    }

    // The zoom's top: check the join again with the real numbers, and change it only if it can no longer be made (spec 4.5 item 6).
    if ((state === 'glide') && (s.phase === 'pfl_zoom')) {
      s.phase = 'pfl';
      const least = s.alt - ground - neededFt(minDragPlan(path), seg, proj.pt, s.alt, 0, wind);
      const trade = plan.kind === 'direct' ? speedTradeFt(s.ias, s.alt, cfg) : 0;
      if (least + trade < 0) {
        const re = chooseJoin(geo, s, s.alt, pilot.trackDeg(), wind);
        replan(re);
        notes.push(`apex: changed to ${re.label}`);
      }
      setRec(plan.label);
    }

    // The 2,100 ft gate (TR-R14).
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
    if (goingShort && (pastLowKey || s.alt <= PFL_KEY_ALT_FT.lowKey)) {
      outcome = 'eject';
      eject = { x: s.x, y: s.y, alt: s.alt };
      setRec('Eject');
      pilot.record();
      break;
    }
    // A path point every 0.2 s, between the pilot's own every 0.4 s, so the follower's turn rate changes in small steps.
    if (s.k % 4 === 2 && s.alt > ground) pilot.record();

    // On the ground: on the runway is a landing (spec 4.5 item 13).
    if (s.alt <= ground) {
      s.alt = ground;
      const o = legOffsetsFt(geo.th, geo.dep, s);
      const onRunway = o.alongFt >= 0 && o.alongFt <= geo.lenFt && Math.abs(o.crossFt) <= 150;
      outcome = onRunway ? 'landed' : 'eject';
      if (onRunway) touchdown = { x: s.x, y: s.y, alongFt: o.alongFt, kias: s.ias };
      else eject = { x: s.x, y: s.y, alt: s.alt };
      setRec(onRunway ? 'Touchdown' : 'Eject');
      pilot.record();
      break;
    }
  }
  if (!outcome) { outcome = 'eject'; eject = { x: s.x, y: s.y, alt: s.alt }; notes.push('ran out of steps'); }
  const points = pilot.points.map((p) => ({ ...p, phase: p.phase ?? 'pfl', kias: p.kt }));
  return { points, outcome, touchdown, eject, gate, plan: plan.kind, notes };
}

// ── In the sim ───────────────────────────────────────────────────────────────

/**
 * Starts a PFL for aircraft `a` where it is now: flies it (flyPfl) and hands
 * the path to the path follower. `options.practice` is the High Key button
 * (a missed gate goes around). Sets a.pflFlight, a.pflDecision and a.config.
 */
export function startPflFlight(a, wind, options = {}) {
  const flight = flyPfl({ x: a.x, y: a.y, alt: a.alt, kias: a.iasKt ?? a.kt ?? 125, headingDeg: a.headingDeg ?? 298, bankDeg: a.bankDeg, rollRateDps: a.rollRateDps }, wind, options);
  a.pflFlight = {
    route: { id: 'PFL_FLOWN', kind: 'flown', name: 'Engine-out glide', points: flight.points },
    outcome: flight.outcome, touchdown: flight.touchdown, eject: flight.eject, gate: flight.gate, practice: Boolean(options.practice),
  };
  // The few seconds it has just flown, in the turn it is in, go in front of the glide, so the follower
  // reads its track and turn rate across the hand-over without a step; then onto the path from its own
  // track and speed (startJoin).
  const behind = flownBehind(a, flight.points[0], wind);
  a.pflFlight.route.points = [...behind, ...flight.points];
  startJoin(a, a.pflFlight.route, routeLengthFt({ points: [...behind, flight.points[0]] }, PFL_ROUTE_OPTIONS), wind, PFL_ROUTE_OPTIONS);
  a.mode = 'RAIL';
  a.engineFailed = true;
  a.landed = false;
  a.active = true;
  a.pflDecision = flight.points[0]?.decision ?? '';
  a.config = flight.points[0]?.config ?? PFL_CONFIG_LABELS[0];
  a.phase = flight.points[0]?.phase ?? 'pfl';
  delete a.pflRail;
  delete a.pflRailIndex;
  delete a.navPlan;
  delete a._blendStart;
  delete a._blendTarget;
  delete a._blendTimer;
  return a.pflFlight;
}

/**
 * Where aircraft `a` has just been, worked back from its heading, bank and
 * speed in `wind`: path points for the last few seconds, oldest first, ending
 * just short of where it is (which is the glide's first point).
 */
function flownBehind(a, first, wind) {
  const tasFtps = ktToFtps(iasToTasKt(a.iasKt ?? a.kt ?? 125, a.alt));
  const omegaDeg = Number.isFinite(a.bankDeg) ? turnRateFromBankRadPerSec(Math.max(tasFtps, 1), a.bankDeg) * 180 / Math.PI : 0;
  const w = { x: -Math.sin((wind?.windFromDeg ?? 360) * DEG) * ktToFtps(wind?.windKt ?? 0), y: -Math.cos((wind?.windFromDeg ?? 360) * DEG) * ktToFtps(wind?.windKt ?? 0) };
  const pts = [];
  let x = a.x, y = a.y, hdg = a.headingDeg ?? 298;
  const dt = 0.4;
  for (let k = 0; k < 8; k++) {
    // Back one step: undo the turn, then the move.
    hdg -= omegaDeg * dt;
    x -= (tasFtps * Math.sin(hdg * DEG) + w.x) * dt;
    y -= (tasFtps * Math.cos(hdg * DEG) + w.y) * dt;
    pts.unshift({ ...first, x, y, headingDeg: wrapDeg360(hdg) });
  }
  return pts;
}

/** The path follower's options for a flown PFL path: its points as they are, no rounding. */
export const PFL_ROUTE_OPTIONS = Object.freeze({ flyRoundedTurns: false, radiusFromG: true, manualRadiusFt: 1800 });
