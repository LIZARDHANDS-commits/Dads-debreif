// The one rejoin law (clean-up step 4, TS-139): how #2 flies down a rejoin line to the decision point, for both the turning
// rejoin (turning-rejoin.js, Lead turning into him; TS-69, TS-75, TS-133) and the straight-ahead rejoin (straight-rejoin.js,
// Lead flying straight on; TS-72, TS-110). Until clean-up step 4 each rejoin had its own copy (flyToDecision twice); this is
// the turning one, with the straight one's differences as arguments:
//  - leadTurning: true, #2 steers his motion in Lead's turning frame (the frame's motion where he is, Lead's velocity plus
//    his turn, solved for the heading that moves him the way he wants), and he may start hot (ahead of the line), getting
//    colder with geometry, not speed (TS-75). false, Lead flies straight: he heads across Lead's track at the approach angle
//    (Patrick 5 Oct 08:40Z: "full power until it gets back on leads six"), and there is no hot side.
//  - line: where the line is, in Lead's frame: { u (down the line, outward from Lead), nrm (across it), closureShare (how
//    much of a speed change shows in the closure down it), at(rel, onLine) -> { along, cross } }. The turning rejoin's is a
//    fixed line off Lead's tail (fixedLine); the straight rejoin's is Lead's six, then the small vector toward route.
//  - done(geo, W, L, onLine): 'done' where the part ends, 'fail' where it can't, else null. The straight rejoin's checks
//    the window's overtake and near edge (TS-110) inside it; the turning rejoin leaves that to the X law (flyOnTheX).
//  - approachDeg, aimFt, tauSec, captureFt, floors and capture widths: each rejoin's own numbers (tuning.js).
// Both rejoins keep the sustained-bank cut near the floor: within floorMarginKias of his least speed, no more bank than MAX
// holds the speed at (TS-75; for the straight rejoin from TS-139, Patrick 6 Oct 21:27Z card "Same as TRJ").
import { relativeTo, DEG } from './manoeuvres.js';
import { CHANGE_LIMIT_SEC } from './transitions.js';
import { KIAS_OUTSIDE_LAB, REJOIN, TURNING_REJOIN, TRACKER, CLOSURE, FW_BUBBLE, FW_ENERGY } from './tuning.js';
import { STEP_SEC, copyAircraft } from './flight.js';
import { stepCommanded, setKias, climbCostKtps } from './tracker.js';
import { fullPowerKtps, slowKtps, stallBankDeg } from './slow-down.js';
import { powerFor, powerFrom, throttleAtTorque } from './power.js';
import { bankDegFromTurnRate } from '../../../core/flight-math.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2 } from '../../../core/units.js';
import { availableG } from '../../../core/t6-performance.js';

const dt = STEP_SEC;

/** The most bank at which MAX still holds the speed (KIAS, block height, a climb's cost in KIAS per second): standard aerodynamics, slow-down.js's full-power rate at that G. */
export function sustainedBankDeg(kias, blockFt, climbKtps) {
  const gain = (g) => fullPowerKtps(kias, blockFt, g) - climbKtps;
  let lo = 1;
  let hi = Math.max(1, availableG(kias));
  if (gain(hi) >= 0) return Math.acos(1 / hi) / DEG;
  if (gain(lo) <= 0) return 0;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (gain(m) >= 0) lo = m;
    else hi = m;
  }
  return Math.acos(1 / lo) / DEG;
}

/**
 * True when MAX surely holds the speed at bankDeg, so sustainedBankDeg would not cut it (search speed only, the same
 * answer): the full-power rate falls as the G grows, so if it still holds a little above this bank's G (1e-5 of it, more
 * than the bisection's 20 halvings leave), the bisection's answer is above this bank.
 */
export function sustainsBank(bankDeg, kias, blockFt, climbKtps) {
  if (!(bankDeg < 89)) return false;
  const g = (1 / Math.cos(bankDeg * DEG)) * (1 + 1e-5);
  return g <= Math.max(1, availableG(kias)) && fullPowerKtps(kias, blockFt, g) - climbKtps >= 0;
}

/**
 * Lead's 3/9 line (Patrick 5 Oct 08:04Z: #2 must not pass ahead of it inside 1,000 ft): one watch for every rejoin part.
 * startFt: #2's range at the start. A start that begins inside laneRangeFt ahead of the line (Lead turning in) is let off
 * until he has been behind it once. step(after) takes #2 against Lead after a step; returns true once he has been ahead.
 */
export function aheadWatch(startFt) {
  let wasBehind = false;
  let ahead = false;
  return {
    step(after) {
      if (after.fwd <= 0) wasBehind = true;
      else if ((wasBehind || startFt >= TRACKER.laneRangeFt) && Math.hypot(after.fwd, after.left) < TRACKER.laneRangeFt) ahead = true;
      return ahead;
    },
  };
}

/** The turning rejoin's line: lineDeg off Lead's tail on side s, fixed in his turning frame (SMM 12.24 paras 56-57). Positive cross: ahead of the line, hot. */
export function fixedLine(lineDeg, s) {
  const sinL = Math.sin(lineDeg * DEG);
  const cosL = Math.cos(lineDeg * DEG);
  const u = { fwd: -sinL, left: s * cosL }; // down the line outward from Lead, in his frame
  const nrm = { fwd: cosL, left: s * sinL }; // across it, toward Lead's nose (positive: ahead of the line, hot)
  return { u, nrm, closureShare: cosL, at: (rel) => ({ along: rel.fwd * u.fwd + rel.left * u.left, cross: rel.fwd * nrm.fwd + rel.left * nrm.left }) };
}

/**
 * #2's part of a rejoin, from the press to the decision point, flown against Lead's recorded flight `rec`. See the file's
 * header for leadTurning, line and done. s: #2's side (+1 left, -1 right); aimFt: how sharply he captures the line;
 * approachDeg: the most he heads across toward it; tauSec: how quickly his heading comes onto the one asked; captureFt: on
 * the line within this; bankCapDeg: his most bank; decisionFt: how far down the line the decision point is (the lagged
 * cut's place); arriveFtps: his closure there (ft/s, or a function of #2); overtakeKt: KIAS over Lead's 200; floorKias: the
 * least KIAS he flies; lineAtKias: hot, his speed as he reaches the line (TS-75); profile: #2's height. allowAcross,
 * acrossTolFt, acrossOnlyOffLine: whether and how far he may cross to Lead's other side; maxWhenLow: MAX while below Lead
 * far out; lagCut, placeKias: to fighting wing, the lagged cut and its zoom (TS-138).
 * Search speed only (the verdict is the same): stopAtSec, a part that is still flying then is dropped (it can't beat the
 * best plan so far); cutAheadFromSec, a part that has gone ahead of Lead's 3/9 line from then on is ended at once with
 * { ahead: true, cut: true } and its steps so far (a lower bound).
 * Returns { points, steps, end, accelKtps, maxBankDeg, ahead, minKias, maxG, minG, lineKias, lineFt, zoomLeg } or null when
 * he does not reach it in time or done() says 'fail': points are [bank, kias, power] a step (replay.js flyStep's
 * bankTrack); lineKias and lineFt are his speed and his distance down the line when he got onto it.
 * @param {Record<string, any>} options
 * @returns {Record<string, any> | null}
 */
export function flyRejoinLine({
  leadTurning, line, done, wing, rec, s, aimFt, approachDeg, tauSec, captureFt, bankCapDeg, decisionFt = 0, arriveFtps, overtakeKt, floorKias,
  lineAtKias = Infinity, blockFt, t0, profile, allowAcross = false, acrossTolFt = 0, acrossOnlyOffLine = false, maxWhenLow = false,
  lagCut = false, placeKias = null, stopAtSec = Infinity, cutAheadFromSec = Infinity,
}) {
  const TR = TURNING_REJOIN;
  const W = copyAircraft(wing);
  const { u, nrm, closureShare } = line;
  const targetKias = KIAS_OUTSIDE_LAB + overtakeKt; // Lead's planned speed plus the overtake: KIAS against KIAS
  const G = TRACKER.gain;
  const points = [];
  let runIn = false;
  let onLine = false;
  let alongPrev = null;
  let accel = 0;
  let maxBank = 0;
  let ahead = false;
  const watch = aheadWatch(Math.hypot(rec.at(0).xFt - W.xFt, rec.at(0).yFt - W.yFt));
  let psiPrev = null;
  let ff = 0;
  let lineKias = null;
  let lineFt = null;
  let placePrev = null;
  let zoom = null; // lagging the cut, the heights of his zoom toward the cone's top: { t0, alt: [], climb: [], nz: [] }
  let minKias = W.kias;
  let maxG = W.g ?? 1;
  let minG = W.g ?? 1;
  const result = (n) => ({ points, steps: n, end: W, accelKtps: accel, maxBankDeg: maxBank, ahead, minKias, maxG, minG, lineKias: lineKias ?? W.kias, lineFt, zoomLeg: zoomLegOf(zoom) });
  for (let n = 0; n < Math.round(CHANGE_LIMIT_SEC / dt); n++) {
    if (n * dt >= stopAtSec) return null;
    const L = rec.at(n);
    const Lnext = rec.at(n + 1);
    const t = t0 + n * dt;
    const dx = L.xFt - W.xFt;
    const dy = L.yFt - W.yFt;
    const r = Math.hypot(dx, dy);
    const rel = relativeTo(L, W);
    // Across to Lead's other side is not a rejoin on this side, except well behind him (allowAcross: a later pass of the
    // turning rejoin's search, only when nothing else plans, where Lead's turn can carry #2 across his six; Patrick 6 Oct
    // 05:16Z), or once on the line when the line itself goes there (the straight rejoin's vector to route on the other side).
    if (!(acrossOnlyOffLine && onLine) && rel.left * s < -acrossTolFt && !(allowAcross && r >= TRACKER.laneRangeFt)) return null;
    let geo = line.at(rel, onLine);
    if (!onLine && geo.along > 0 && Math.abs(geo.cross) <= captureFt) {
      onLine = true;
      lineKias = W.kias;
      lineFt = geo.along;
      geo = line.at(rel, true);
    }
    const { along, cross } = geo;
    const hot = leadTurning && cross > captureFt;
    // Lagging the cut (to fighting wing, lagCut; Patrick 6 Oct 17:11Z card "Lag the cut"): hot and within lagCutFt of the
    // place down the line, he flies at the place itself (on the line at decisionFt), so the cut ends there, not inside it.
    const place = { fwd: u.fwd * decisionFt - rel.fwd, left: u.left * decisionFt - rel.left };
    const placeFt = Math.hypot(place.fwd, place.left);
    const lagging = lagCut && hot && along < decisionFt + TR.lagCutFt;
    const verdict = done(geo, W, L, onLine);
    if (verdict === 'done') return result(n);
    if (verdict === 'fail') return null;

    // Where he steers: down the line toward Lead once on it; off it, across toward it at up to approachDeg, the angle growing
    // with the distance off (aimFt sets how quickly: a smaller one is a sharper capture, a larger one a gentler, longer one).
    const chi = approachDeg * DEG * (2 / Math.PI) * Math.atan(Math.abs(cross) / aimFt);
    const way = lagging
      ? { fwd: place.fwd / Math.max(placeFt, 1), left: place.left / Math.max(placeFt, 1) }
      : { fwd: -u.fwd * Math.cos(chi) - Math.sign(cross) * nrm.fwd * Math.sin(chi), left: -u.left * Math.cos(chi) - Math.sign(cross) * nrm.left * Math.sin(chi) };
    const f = { x: Math.cos(L.headingRad), y: Math.sin(L.headingRad) };
    const l = { x: -f.y, y: f.x };
    const d = { x: way.fwd * f.x + way.left * l.x, y: way.fwd * f.y + way.left * l.y };
    let rate;
    if (leadTurning) {
      // In Lead's turning frame: the frame's motion where #2 is (Lead's velocity plus his turn, ω × r, r from Lead to #2),
      // and the heading at his own speed that moves him along `way` in it.
      const omegaL = wrapPi(Lnext.headingRad - L.headingRad) / dt;
      const vfx = L.tasFtps * f.x + omegaL * dy;
      const vfy = L.tasFtps * f.y - omegaL * dx;
      const ad = vfx * d.x + vfy * d.y;
      const disc = ad * ad - (vfx * vfx + vfy * vfy) + W.tasFtps * W.tasFtps;
      const lam = disc >= 0 ? Math.max(0, Math.sqrt(disc) - ad) : 0;
      const psi = disc >= 0 ? Math.atan2(vfy + lam * d.y, vfx + lam * d.x) : Math.atan2(d.y, d.x);
      if (psiPrev === null) psiPrev = psi;
      ff += G.ffFilter * (wrapPi(psi - psiPrev) / dt - ff);
      psiPrev = psi;
      rate = ff + wrapPi(psi - W.headingRad) / tauSec;
    } else {
      // Lead straight: his own heading across Lead's track along `way` (turning in costs ground, so he falls back as he cuts).
      rate = wrapPi(Math.atan2(d.y, d.x) - W.headingRad) / tauSec;
    }
    const ratio = W.tasFtps / W.kias;
    // Speed changes at the G he is pulling, less what a climb costs or plus what a descent gives (standard aerodynamics,
    // dV/dt = g (T - D) / W - g sin(climb angle)); KIAS per second times ratio is true ft/s².
    // Lagging the cut, he soaks up the speed the place doesn't need with a zoom toward the cone's top (Patrick 6 Oct 16:58Z;
    // card "Zoom in the cut"; the tracker's cone energy, TS-136).
    if (lagging && placeKias != null && !zoom) zoom = { t0: t, alt: [W.altAboveFt], climb: [W.climbFtps ?? 0], nz: [1] };
    const perFtps = climbCostKtps(W, 1); // KIAS per second per ft/s of climb (standard energy, tracker.js)
    const roomUpFt = Math.max(0, L.altAboveFt + FW_ENERGY.coneUpFt - W.altAboveFt);
    const zoomFtps = zoom ? Math.min(FW_BUBBLE.diveFtps, Math.sqrt(2 * FW_BUBBLE.pullFtps2 * roomUpFt)) : 0;
    const zoomKtps = zoomFtps * perFtps;
    const leastKias = zoom && roomUpFt > 1 ? Math.min(floorKias, placeKias) : floorKias;
    const climbKtps = zoom ? 0 : perFtps * W.climbFtps;
    // Never past the stall line at the speed he has; near his least speed, no more bank than MAX holds the speed at (TS-75, TS-139).
    let cap = Math.min(bankCapDeg, stallBankDeg(W.kias));
    const wantBank = bankDegFromTurnRate(W.tasFtps, rate);
    if (W.kias < floorKias + TR.floorMarginKias && !sustainsBank(Math.abs(wantBank), W.kias, blockFt, climbKtps)) cap = Math.min(cap, sustainedBankDeg(W.kias, blockFt, climbKtps));
    const bank = Math.max(-cap, Math.min(cap, wantBank));

    // The power, as a pilot sets it (Patrick 5 Oct 08:48Z): MAX to set the overtake, then held; on the line, the slowing
    // starts where the stop with the torque floor and the boards just fits the room left (TS-108; Patrick 17:55Z: "then slow
    // down at the decision point for eithe SARJ or TRJ"), and the close-in rate is held, idle and the boards only when the room
    // left needs more (SMM 12.24 para 58; TS-61's order). The closure is the one down the line (not the range rate: hot, the
    // range comes down fast across it while he is still getting on); lagging the cut, toward the place.
    const closeFtps = typeof arriveFtps === 'function' ? arriveFtps(W) : arriveFtps;
    const closure = lagging ? (placePrev === null ? 0 : (placePrev - placeFt) / dt) : alongPrev === null ? 0 : (alongPrev - along) / dt;
    alongPrev = along;
    placePrev = placeFt;
    const floorThr = throttleAtTorque(REJOIN.floorTorquePct, W.kias, blockFt); // the rejoin's torque floor (TS-108)
    const aStop = slowKtps(REJOIN.stopStage, W.kias, blockFt, W.g, floorThr) + climbKtps + zoomKtps;
    // The room left, less what he covers while the slowing builds up at the rate the acceleration can change (TS-75).
    const rampFt = (closure * CLOSURE.stopShare * aStop) / G.jerkKtps2 / 2;
    const room = lagging ? placeFt : along - decisionFt;
    const needKtps = room - rampFt > 1 && closure > closeFtps ? (closure * closure - closeFtps * closeFtps) / (2 * (room - rampFt)) / (closureShare * ratio) : 0;
    const aMax = fullPowerKtps(W.kias, blockFt, W.g) - climbKtps;
    const aPower = slowKtps('power', W.kias, blockFt, W.g, floorThr) + climbKtps + zoomKtps;
    const aAll = slowKtps('idleBoards', W.kias, blockFt, W.g) + climbKtps + zoomKtps;
    if (!runIn && (onLine || lagging) && closure > closeFtps && needKtps >= CLOSURE.stopShare * aStop) runIn = true;
    // Lead's turn's closure dies away as the range comes down, so the slowing may leave him short of the stopping curve: then
    // the line's speed again until it needs taking out, rather than crawling the rest of the line at the close-in rate.
    else if (runIn && room > closeFtps * TR.runInHoldSec && needKtps < TR.runInReleaseShare * CLOSURE.stopShare * aStop) runIn = false;
    let aCmd;
    if (runIn) {
      // Hold the slowing the room needs; once the closure is down to the close-in rate, the speed that keeps it there.
      aCmd = closure > closeFtps
        ? -Math.min(needKtps, aAll)
        : Math.max(-aAll, Math.min(aMax, G.speedLoop * Math.min(targetKias - W.kias, (closeFtps - closure) / (closureShare * ratio))));
      // ... easing off in time to stop the slowing at the close-in rate, not below it (TS-75).
      aCmd = Math.max(aCmd, -Math.sqrt(2 * G.jerkKtps2 * Math.max(0, (closure - closeFtps) / (closureShare * ratio))));
    } else {
      // Hot (ahead of the line), he gets colder with geometry, not with speed: he slows no further than his least speed, and
      // comes up to lineAtKias as he reaches the line (Patrick 17:29Z; TS-75). Off the line and cold he is at MAX with no top
      // speed (Patrick 6 Oct 05:29Z; the straight rejoin: "full power until it gets back on leads six", 5 Oct 08:40Z); on the
      // line he keeps what he has, at least the line's speed, until the run-in takes it out (TS-133). Below Lead and far out
      // he is at MAX too (maxWhenLow; Patrick 6 Oct 05:00Z, 05:29Z).
      const lineCmd = Math.min(targetKias, lineAtKias);
      const low = maxWhenLow && r > TRACKER.laneRangeFt && W.altAboveFt < L.altAboveFt - TR.lowEnergyFt;
      const kiasCmd = low ? Infinity : hot ? lineCmd - (lineCmd - leastKias) * Math.min(1, (cross - captureFt) / TR.hotFt) : onLine ? Math.max(targetKias, W.kias) : Infinity;
      const aMin = hot ? aAll : aPower;
      aCmd = Math.max(-aMin, Math.min(aMax, G.speedLoop * (kiasCmd - W.kias)));
    }
    // The slowing eases off in time to stop at his least speed, at the rate the acceleration can change (TS-75).
    aCmd = Math.min(aMax, Math.max(aCmd, -Math.sqrt(2 * G.jerkKtps2 * Math.max(0, W.kias - leastKias))));
    accel += Math.max(-G.jerkKtps2 * dt, Math.min(G.jerkKtps2 * dt, aCmd - accel));
    const kias = W.kias + accel * dt;
    setKias(W, kias);
    let stepProfile = profile;
    if (zoom) {
      // The zoom's climb: the slowing he flies, as height, up to zoomFtps, eased in and out at the bubble's pull.
      const v0 = W.climbFtps ?? 0;
      const want = accel < 0 ? Math.min(zoomFtps, -accel / perFtps) : 0;
      const v1 = v0 + Math.max(-FW_BUBBLE.pullFtps2 * dt, Math.min(FW_BUBBLE.pullFtps2 * dt, want - v0));
      const nz = 1 + (v1 - v0) / dt / G_FTPS2;
      const a1 = W.altAboveFt + ((v0 + v1) / 2) * dt;
      zoom.alt.push(a1);
      zoom.climb.push(v1);
      zoom.nz.push(nz);
      stepProfile = [{ t0: t, t1: t + dt, table: { dt, alt: [W.altAboveFt, a1], climb: [v0, v1], nz: [nz, nz] } }];
    }
    stepCommanded(W, bank, t, stepProfile);
    const power = accel >= aMax * 0.985 ? powerFrom(null, 1, W.kias, blockFt) : powerFor(accel, W.kias, blockFt, W.g, W.climbFtps, runIn || hot ? 'idleBoards' : null, floorThr);
    points.push([bank, kias, power]);
    minKias = Math.min(minKias, W.kias);
    maxG = Math.max(maxG, W.g);
    minG = Math.min(minG, W.g);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    ahead = watch.step(relativeTo(Lnext, W));
    if (ahead && n * dt >= cutAheadFromSec) return { ...result(n + 1), cut: true };
  }
  return null;
}

/** A zoom's heights as a height leg (flight.js heightAt's table), or null. */
function zoomLegOf(zoom) {
  return zoom ? { t0: zoom.t0, t1: zoom.t0 + (zoom.alt.length - 1) * dt, table: { dt, alt: zoom.alt, climb: zoom.climb, nz: zoom.nz } } : null;
}
