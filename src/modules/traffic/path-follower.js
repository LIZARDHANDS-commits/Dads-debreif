// The path follower: the one piece of code that moves an aircraft along a
// built path (Traffic spec, "How the aircraft moves", items 1-9; refactor PR 2).
//
// Each step it flies the aircraft along the route's ground track at its ground
// speed, then works out from where it is:
//   - heading: the track there plus the crab for the wind, never stepping at a
//     corner of the drawn path (the track is read across a short window, so a
//     rounded turn drawn as short straight pieces still turns smoothly);
//   - bank: what that heading rate needs at this true airspeed, signed (right
//     positive), eased in and out at the roll-rate setting;
//   - pitch: the climb angle plus the angle of attack, less the fuselage datum (T6A_PITCH); 2.5° on the wheels.
// Speeds: the route's speeds are KIAS; true airspeed comes from KIAS and
// height (iasToTasKt) in every wind, and ground speed from the wind triangle.
import { ktToFtps, G_FTPS2 } from '../../core/units.js';
import { wrapDeg180, compassDegFromVector } from '../../core/angles.js';
import { bankDegFromTurnRate, easeRoll, easeValue, gFromBankDeg } from '../../core/flight-math.js';
import { windTriangle } from '../../core/wind.js';
import { attitudeDegFromClimb, glideDragPerWeight, glideRatio } from '../../core/t6-performance.js';
import { THRESHOLD_DATA_ELEV_FT } from './airfield.js';
import { iasToTasKt } from './weather.js';
import { posOnRoute, routePath, DEFAULT_ROUTE_OPTIONS } from './route.js';
import { ROLL } from './circuit.js';

/** The attitude on the wheels, degrees nose up (Patrick, 6 Oct 06:17Z), and how close to the runway's height counts as on them (an estimate). */
const GROUND_ATTITUDE_DEG = 2.5;
const ON_WHEELS_FT = 0.5; // under the flare's last few feet (TR-96)

/**
 * The drawn attitude (TR-97, Patrick 6 Oct): bank and climb are read off the path this many seconds either side, and
 * the nose eases toward its attitude at most this pitch rate and its change. Estimates, tuned by eye.
 */
const ATTITUDE_HALF_SEC = 1;
const PITCH_EASE = Object.freeze({ maxRateDps: 10, maxAccelDps2: 20 });

/**
 * Half the window the track is read across, in feet. Longer than the pieces a
 * drawn turn is made of (about 100 to 300 ft), short against any turn radius
 * the T-6 flies in the pattern (about 1,500 ft and up).
 */
export const TRACK_WINDOW_FT = 150;

/**
 * When an aircraft moves onto a new path a little off it (an entry joining the
 * pattern), the gap closes over at least this time, like a pilot easing onto the
 * line. An estimate.
 */
export const JOIN_SEC = 3;

/** Sideways acceleration a join is shaped to stay near, ft/s² (0.15 G, an estimate). */
const JOIN_ACCEL_FTPS2 = 0.15 * 32.174;

/** Longest a join takes, seconds (an estimate). */
const JOIN_MAX_SEC = 15;

/**
 * A bank away off the path and back (the deconfliction's last-moment move for a PFL, which keeps its
 * glide and its circle; Patrick's card Q3): out to `peakFt` over `outSec`, back over `backSec`, each a
 * smooth step (no jump in place, track or turn rate at either end). Sets `a.sideStep`; the follower adds
 * it to the place on the path. `dirDeg` is the compass direction to step toward.
 * While `a.sideStep.glideConfig` is set (a glide configuration name, set each step by the PFL), the step
 * costs height, as it would a gliding pilot (Patrick, "charge and re-plan"; TR-55): the extra drag of the
 * extra G it pulls, and the extra ground it covers at the glide ratio. The loss is `a.sideStep.lossFt`.
 */
export function startSideStep(a, dirDeg, peakFt, outSec, backSec) {
  const r = dirDeg * Math.PI / 180;
  a.sideStep = { ux: Math.sin(r), uy: Math.cos(r), peakFt, outSec, backSec, t: 0 };
}

/** Offset (ft), its rate (ft/s) and its acceleration (ft/s²) along the side step at its time t: a quintic smooth step out, then back. */
function sideStepAt(st) {
  const out = st.t < st.outSec;
  const T = out ? st.outSec : st.backSec;
  const u = Math.min(1, (out ? st.t : st.t - st.outSec) / T);
  const f = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5, df = (30 * u ** 2 - 60 * u ** 3 + 30 * u ** 4) / T;
  const ddf = (60 * u - 180 * u ** 2 + 120 * u ** 3) / (T * T);
  return out ? { d: st.peakFt * f, rate: st.peakFt * df, accel: st.peakFt * ddf }
    : { d: st.peakFt * (1 - f), rate: -st.peakFt * df, accel: -st.peakFt * ddf };
}

/**
 * Height a gliding side step costs over one step `dt` (ft): the drag of the G it pulls on top of the path's own
 * turn, less the drag the path's turn already costs, through the air flown; plus the extra ground it covers at
 * the glide ratio. Standard aerodynamics on core's glide drag (glideDragPerWeight, glideRatio).
 */
function sideStepLossFt(st, step, route, distFt, env, options, kias, altFt, dt) {
  const cfg = st.glideConfig;
  const path = pathGroundVelocity(route, distFt, env, options);
  const gs = Math.max(1, Math.hypot(path.x, path.y));
  const turn = pathTurnAccel(route, distFt, gs, options); // right positive
  // Right of the track, compass x east and y north.
  const nx = path.y / gs, ny = -path.x / gs;
  const ax = nx * turn + st.ux * step.accel, ay = ny * turn + st.uy * step.accel;
  const gPlanned = Math.hypot(1, turn / G_FTPS2);
  const gWithStep = Math.hypot(1, Math.hypot(ax, ay) / G_FTPS2);
  const airFt = ktToFtps(iasToTasKt(kias, altFt)) * dt;
  const dragFt = (glideDragPerWeight(cfg, kias, altFt, gWithStep) - glideDragPerWeight(cfg, kias, altFt, gPlanned)) * airFt;
  const extraGroundFt = (Math.hypot(path.x + st.ux * step.rate, path.y + st.uy * step.rate) - gs) * dt;
  return dragFt + extraGroundFt / glideRatio(cfg);
}

/** The path's own sideways (turning) acceleration at `distFt`, ft/s², right positive, at ground speed `gsFtps`. */
function pathTurnAccel(route, distFt, gsFtps, options) {
  const d = TRACK_WINDOW_FT;
  const turnRad = wrapDeg180(trackAt(route, distFt + d, options) - trackAt(route, distFt - d, options)) * Math.PI / 180;
  return gsFtps * gsFtps * turnRad / (2 * d);
}

/** Ground velocity along the route at `distFt`, ft/s, as { x, y } (x east, y north). */
function pathGroundVelocity(route, distFt, env, options) {
  const p = posOnRoute(route, distFt, options);
  const trackDeg = trackAt(route, distFt, options);
  const tasKt = Math.max(1, iasToTasKt(p.kt ?? 140, p.alt ?? 3500));
  const wt = windTriangle(trackDeg, tasKt, env?.windFromDeg ?? 360, env?.windKt ?? 0);
  const gsFtps = ktToFtps(wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10);
  const r = trackDeg * Math.PI / 180;
  return { x: gsFtps * Math.sin(r), y: gsFtps * Math.cos(r) };
}

/**
 * Puts `a` onto `route` at `distFt` from wherever it is and however it is moving
 * (Patrick, 4 Oct 09:21Z: at the hand-over the aircraft's vector lines up with its
 * own track, so nothing snaps). The gap and the difference in ground velocity both
 * close over the join time along a smooth curve that starts with the aircraft's own
 * velocity and ends on the path with the path's, so the place, track and speed carry
 * on without a step. Sets `a.distFt` and `a.joinOffset`.
 */
export function startJoin(a, route, distFt, env = null, options = DEFAULT_ROUTE_OPTIONS) {
  const p = posOnRoute(route, distFt, options);
  const x0 = (Number.isFinite(a.x) ? a.x : p.x) - p.x;
  const y0 = (Number.isFinite(a.y) ? a.y : p.y) - p.y;
  const path = pathGroundVelocity(route, distFt, env, options);
  let vx0 = 0, vy0 = 0;
  const trackDeg = Number.isFinite(a.trackDeg) ? a.trackDeg : a.headingDeg;
  const gsKt = a.groundSpeedKt ?? a.gsKt;
  if (Number.isFinite(trackDeg) && Number.isFinite(gsKt)) {
    const r = trackDeg * Math.PI / 180;
    vx0 = ktToFtps(gsKt) * Math.sin(r) - path.x;
    vy0 = ktToFtps(gsKt) * Math.cos(r) - path.y;
  }
  // Sideways acceleration too: the aircraft's own turn (from its bank) less the path's, so the turn
  // rate carries over without a step (Patrick, 10:05Z: smooth transitions).
  let ax0 = 0, ay0 = 0;
  if (Number.isFinite(trackDeg) && Number.isFinite(gsKt) && Number.isFinite(a.bankDeg)) {
    const r = trackDeg * Math.PI / 180;
    const aLat = G_FTPS2 * Math.tan(Math.max(-80, Math.min(80, a.bankDeg)) * Math.PI / 180);
    const pathTurn = pathTurnAccel(route, distFt, Math.hypot(path.x, path.y), options);
    const rp = Math.atan2(path.x, path.y);
    ax0 = aLat * Math.cos(r) - pathTurn * Math.cos(rp);
    ay0 = -aLat * Math.sin(r) + pathTurn * Math.sin(rp);
  }
  // Height, climb rate and speed carry over the same way, so nothing steps there either.
  const alt0 = Number.isFinite(a.alt) && Number.isFinite(p.alt) ? a.alt - p.alt : 0;
  const vz0 = Number.isFinite(a.climbFtps) ? a.climbFtps : 0;
  const kt0 = Number.isFinite(a.iasKt) && Number.isFinite(p.kt) ? a.iasKt - p.kt : 0;
  const gapFt = Math.hypot(x0, y0), relFtps = Math.hypot(vx0, vy0);
  const T = Math.min(JOIN_MAX_SEC, Math.max(JOIN_SEC, Math.sqrt(6 * gapFt / JOIN_ACCEL_FTPS2), 4 * relFtps / JOIN_ACCEL_FTPS2));
  a.distFt = distFt;
  if (gapFt < 1 && relFtps < 1 && Math.abs(alt0) < 1 && Math.abs(vz0) < 0.5 && Math.abs(kt0) < 0.5) { delete a.joinOffset; return; }
  a.joinOffset = { x: x0, y: y0, x0, y0, vx0, vy0, ax0, ay0, alt0, vz0, kt0, t: 0, T };
}

/**
 * Place along the route at a distance, carried on straight beyond the ends of an open path
 * along its first and last pieces, so the track read near either end is the way the aircraft
 * was going there (a hand-over onto a new path at its start does not turn it early).
 */
function placeAlong(route, options) {
  const { segs, lengthFt, closed } = routePath(route, options);
  return (d) => {
    if (closed || !segs.length || (d >= 0 && d <= lengthFt)) return posOnRoute(route, d, options);
    const end = d < 0 ? posOnRoute(route, 0, options) : posOnRoute(route, lengthFt, options);
    const seg = d < 0 ? segs.find((g) => g.len > 0.5) : [...segs].reverse().find((g) => g.len > 0.5);
    if (!seg) return end;
    const over = d < 0 ? d : d - lengthFt;
    const r = seg.headingDeg * Math.PI / 180;
    return { ...end, x: end.x + over * Math.sin(r), y: end.y + over * Math.cos(r) };
  };
}

/** Samples each side of the point the track is averaged over (TRACK_SAMPLES), and the averaging's half-width. */
const TRACK_SAMPLES = 12;
const TRACK_HALF_WIDTH_FT = TRACK_WINDOW_FT * Math.SQRT2; // the same spread as the old flat window of TRACK_WINDOW_FT
/**
 * At speed the averaging spans at least this long either side, seconds, so a drawn turn's rate builds up
 * over about the time the T-6 takes to roll into it (45° at 45°/s; an estimate) instead of all at once.
 */
const TRACK_HALF_WIDTH_SEC = 0.8;

/**
 * The ground track in compass degrees at `distFt` along the route: the path's direction averaged with a
 * weight that falls to nothing at the window's ends, so neither the track nor its rate of turn ever steps
 * as the aircraft passes the corners a drawn turn is made of (spec items 3 and 4; Patrick, 10:05Z).
 */
export function trackAt(route, distFt, options = DEFAULT_ROUTE_OPTIONS) {
  const at = placeAlong(route, options);
  const here = posOnRoute(route, distFt, options);
  const tasFtps = ktToFtps(iasToTasKt(here.kt ?? 140, here.alt ?? 3500));
  const halfWidthFt = Math.max(TRACK_HALF_WIDTH_FT, tasFtps * TRACK_HALF_WIDTH_SEC);
  let dx = 0, dy = 0;
  for (let k = 1; k <= TRACK_SAMPLES; k++) {
    const s = halfWidthFt * (k - 0.5) / TRACK_SAMPLES;
    const a = at(distFt - s);
    const b = at(distFt + s);
    dx += b.x - a.x;
    dy += b.y - a.y;
  }
  if (Math.hypot(dx, dy) < 1) return posOnRoute(route, distFt, options).headingDeg;
  return compassDegFromVector(dx, dy);
}

/**
 * One step along the route: moves `a` by its ground speed and sets its place,
 * height, KIAS, heading, track, crab, ground speed, bank, roll rate, G, pitch,
 * phase and tag. `env` is { windFromDeg, windKt }. Returns the route point.
 */
export function followRoute(a, route, env, dt, options = DEFAULT_ROUTE_OPTIONS) {
  const windFromDeg = env?.windFromDeg ?? 360;
  const windKt = env?.windKt ?? 0;
  const prevHeading = Number.isFinite(a.headingDeg) ? a.headingDeg : null;
  const prevAlt = Number.isFinite(a.alt) ? a.alt : null;

  // Ground speed where the aircraft is now, then move along the track by it.
  const here = posOnRoute(route, a.distFt ?? 0, options);
  const tasNowKt = Math.max(1, iasToTasKt(here.kt ?? a.iasKt ?? 140, here.alt ?? a.alt ?? 3500));
  const wtNow = windTriangle(trackAt(route, a.distFt ?? 0, options), tasNowKt, windFromDeg, windKt);
  const gsKt = wtNow.canHoldTrack ? Math.max(wtNow.groundSpeedKt, 10) : 10;
  a.distFt = (a.distFt ?? 0) + ktToFtps(gsKt) * dt;

  const p = posOnRoute(route, a.distFt, options);
  a.x = p.x;
  a.y = p.y;
  // Joining a new path from off it: the gap and the velocity difference close along a smooth
  // (cubic Hermite) curve instead of jumping (spec item 13a; startJoin).
  let joinRate = null, joinBlend = null;
  if (a.joinOffset) {
    const j = a.joinOffset;
    if (!Number.isFinite(j.T)) Object.assign(j, { x0: j.x, y0: j.y, vx0: 0, vy0: 0, t: 0, T: JOIN_SEC });
    j.t += dt;
    const u = Math.min(1, j.t / j.T);
    // Quintic Hermite: starts with the aircraft's own offset, velocity and turn, ends on the path
    // with none, so place, track and turn rate all carry on without a step.
    const h00 = 1 - 10 * u ** 3 + 15 * u ** 4 - 6 * u ** 5, h10 = u - 6 * u ** 3 + 8 * u ** 4 - 3 * u ** 5;
    const h20 = 0.5 * u ** 2 - 1.5 * u ** 3 + 1.5 * u ** 4 - 0.5 * u ** 5;
    const d00 = (-30 * u ** 2 + 60 * u ** 3 - 30 * u ** 4) / j.T, d10 = 1 - 18 * u ** 2 + 32 * u ** 3 - 15 * u ** 4;
    const d20 = (u - 4.5 * u ** 2 + 6 * u ** 3 - 2.5 * u ** 4) * j.T;
    const ax0 = j.ax0 ?? 0, ay0 = j.ay0 ?? 0;
    j.x = h00 * j.x0 + h10 * j.T * j.vx0 + h20 * j.T * j.T * ax0;
    j.y = h00 * j.y0 + h10 * j.T * j.vy0 + h20 * j.T * j.T * ay0;
    joinRate = { x: d00 * j.x0 + d10 * j.vx0 + d20 * ax0, y: d00 * j.y0 + d10 * j.vy0 + d20 * ay0 };
    joinBlend = { alt: h00 * (j.alt0 ?? 0) + h10 * j.T * (j.vz0 ?? 0), kt: h00 * (j.kt0 ?? 0) };
    a.x += j.x;
    a.y += j.y;
    if (u >= 1) delete a.joinOffset;
  }
  let sideStepLoss = 0;
  if (a.sideStep) {
    const st = a.sideStep;
    st.t += dt;
    const step = sideStepAt(st);
    a.x += st.ux * step.d;
    a.y += st.uy * step.d;
    joinRate = { x: (joinRate?.x ?? 0) + st.ux * step.rate, y: (joinRate?.y ?? 0) + st.uy * step.rate };
    if (st.glideConfig) {
      st.lossFt = (st.lossFt ?? 0) + sideStepLossFt(st, step, route, a.distFt, env, options, p.kt ?? a.iasKt ?? 125, p.alt ?? a.alt ?? 3500, dt);
    }
    sideStepLoss = st.lossFt ?? 0;
    if (st.t >= st.outSec + st.backSec) delete a.sideStep;
  }
  a.alt = (p.alt ?? a.fallbackAlt ?? a.alt ?? 3500) - sideStepLoss;
  a.iasKt = p.kt ?? a.fallbackKt ?? a.iasKt ?? 140;
  if (joinBlend) {
    a.alt += joinBlend.alt;
    a.iasKt += joinBlend.kt;
  }
  a.kt = a.iasKt;
  if (p.phase) a.phase = p.phase;
  if (p.tag) a.tag = p.tag;
  else if (route?.points?.[p.seg]?.tag) a.tag = route.points[p.seg].tag;

  const tasKt = Math.max(1, iasToTasKt(a.iasKt, a.alt));
  const tasFtps = ktToFtps(tasKt);
  let trackDeg = trackAt(route, a.distFt, options);
  let joinGsKt = null;
  if (joinRate) {
    // While joining, the aircraft's real track is the path's plus the join's own motion.
    const path = pathGroundVelocity(route, a.distFt, env, options);
    const vx = path.x + joinRate.x, vy = path.y + joinRate.y;
    trackDeg = compassDegFromVector(vx, vy);
    joinGsKt = Math.hypot(vx, vy) / ktToFtps(1);
  }
  const wt = windTriangle(trackDeg, tasKt, windFromDeg, windKt);
  a.gsKt = joinGsKt ?? (wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10);
  a.groundSpeedKt = a.gsKt;
  a.tasKt = tasKt;
  a.crabDeg = wt.crabDeg;
  a.headingDeg = wt.headingDeg;
  a.trackDeg = trackDeg;

  // Bank: what this heading rate needs (right positive), reached by a smooth roll. The rate is read off the path a
  // second either side (TR-97), not the last step, which is near nothing along each straight piece of a drawn turn and
  // spikes at its corners (the wing rock Patrick saw in the final turn). Joins and side steps aren't on the path, so
  // they keep the step's own rate.
  const aheadFt = ktToFtps(a.gsKt) * ATTITUDE_HALF_SEC;
  let rateRadPerSec;
  if (joinRate) {
    rateRadPerSec = (prevHeading === null || !(dt > 0)) ? 0 : (wrapDeg180(a.headingDeg - prevHeading) * Math.PI / 180) / dt;
  } else {
    const headingThere = (d) => windTriangle(trackAt(route, d, options), tasKt, windFromDeg, windKt).headingDeg;
    rateRadPerSec = (wrapDeg180(headingThere(a.distFt + aheadFt) - headingThere(a.distFt - aheadFt)) * Math.PI / 180) / (2 * ATTITUDE_HALF_SEC);
  }
  a.targetBankDeg = bankDegFromTurnRate(tasFtps, rateRadPerSec);
  const roll = easeRoll(a.bankDeg ?? 0, a.rollRateDps ?? 0, a.targetBankDeg, dt, ROLL);
  a.bankDeg = roll.bankDeg;
  a.rollRateDps = roll.rollRateDps;
  a.g = gFromBankDeg(a.bankDeg);

  // Pitch: the attitude the pilot sees, the climb angle plus the angle of attack at this G less the fuselage datum;
  // on the wheels, the 2.5° nose up the gear holds it at (Patrick, 6 Oct 06:17Z).
  // The climb is read off the path a second either side too, and the nose eased toward it (TR-97), so each height
  // step on the path no longer shows as a pitch step. a.climbFtps stays the step's own (the 3D aim line and the
  // deconfliction read it).
  const climbFtps = (prevAlt === null || !(dt > 0)) ? 0 : (a.alt - prevAlt) / dt;
  a.climbFtps = climbFtps;
  const pathClimbFtps = joinRate
    ? climbFtps
    : ((posOnRoute(route, a.distFt + aheadFt, options).alt ?? a.alt) - (posOnRoute(route, a.distFt - aheadFt, options).alt ?? a.alt)) / (2 * ATTITUDE_HALF_SEC);
  const onWheels = a.alt <= THRESHOLD_DATA_ELEV_FT + ON_WHEELS_FT;
  const targetPitch = onWheels ? GROUND_ATTITUDE_DEG : attitudeDegFromClimb(pathClimbFtps, tasFtps, a.iasKt, a.g);
  if (!Number.isFinite(a.pitchDeg) || !(dt > 0)) {
    a.pitchDeg = targetPitch;
    a.pitchRateDps = 0;
  } else {
    const nose = easeValue(a.pitchDeg, a.pitchRateDps ?? 0, targetPitch, dt, PITCH_EASE);
    a.pitchDeg = nose.bankDeg;
    a.pitchRateDps = nose.rollRateDps;
  }
  return p;
}
