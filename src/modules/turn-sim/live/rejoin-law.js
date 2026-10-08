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
import { runTracker, phase } from './tracker.js';
import { climbCostKtps, createPilot, pilotSpeed, pilotFly, pilotPower, pilotJerkKtps2, coneUpFtNow } from './pilot.js';
import { fullPowerKtps, slowKtps, stallBankDeg, sustainedBankDeg, sustainsBank } from './slow-down.js';
export { sustainedBankDeg, sustainsBank };

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

export { fixedLine } from './slots.js';

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
/**
 * Creates the rejoin line tracker phase.
 * Encapsulates the rejoin line steering, power, speed floors, and zoom as a tracker pursuit phase.
 */
export function rejoinLinePhase(options) {
  const {
    leadTurning, line, done, wing, rec, s, aimFt, approachDeg, tauSec, captureFt, bankCapDeg, decisionFt = 0, arriveFtps, overtakeKt, floorKias,
    lineAtKias = Infinity, blockFt, profile, allowAcross = false, acrossTolFt = 0, acrossOnlyOffLine = false, maxWhenLow = false,
    lagCut = false, placeKias = null, stopAtSec = Infinity, cutAheadFromSec = Infinity,
  } = options;

  const TR = TURNING_REJOIN;
  const { u, nrm, closureShare } = line;
  const targetKias = KIAS_OUTSIDE_LAB + overtakeKt;
  const G = TRACKER.gain;
  const startW = wing ?? options.wing0;
  const startR = rec ? Math.hypot(rec.at(0).xFt - (startW?.xFt ?? 0), rec.at(0).yFt - (startW?.yFt ?? 0)) : 1000;

  const st = {
    runIn: false,
    onLine: false,
    alongPrev: null,
    placePrev: null,
    psiPrev: null,
    ff: 0,
    lineKias: null,
    lineFt: null,
    zoom: null,
    minKias: startW?.kias ?? 200,
    ahead: false,
    cut: false,
    stepCount: 0,
    done: false,
    watch: aheadWatch(startR),
  };

  const pursuit = (L, W, t) => {
    const n = st.stepCount;
    if (n * dt >= stopAtSec) return { abort: true };
    const Lnext = rec.at(n + 1);
    const dx = L.xFt - W.xFt;
    const dy = L.yFt - W.yFt;
    const r = Math.hypot(dx, dy);
    const rel = relativeTo(L, W);

    if (!(acrossOnlyOffLine && st.onLine) && rel.left * s < -acrossTolFt && !(allowAcross && r >= TRACKER.laneRangeFt)) {
      return { abort: true };
    }

    let geo = line.at(rel, st.onLine);
    if (!st.onLine && geo.along > 0 && Math.abs(geo.cross) <= captureFt) {
      st.onLine = true;
      st.lineKias = W.kias;
      st.lineFt = geo.along;
      geo = line.at(rel, true);
    }
    const { along, cross } = geo;
    const hot = leadTurning && cross > captureFt;

    const place = { fwd: u.fwd * decisionFt - rel.fwd, left: u.left * decisionFt - rel.left };
    const placeFt = Math.hypot(place.fwd, place.left);
    const lagging = lagCut && hot && along < decisionFt + TR.lagCutFt;

    const verdict = done(geo, W, L, st.onLine);
    if (verdict === 'done') {
      st.done = true;
      return { done: true };
    }
    if (verdict === 'fail') {
      return { abort: true };
    }

    const chi = approachDeg * DEG * (2 / Math.PI) * Math.atan(Math.abs(cross) / aimFt);
    const way = lagging
      ? { fwd: place.fwd / Math.max(placeFt, 1), left: place.left / Math.max(placeFt, 1) }
      : { fwd: -u.fwd * Math.cos(chi) - Math.sign(cross) * nrm.fwd * Math.sin(chi), left: -u.left * Math.cos(chi) - Math.sign(cross) * nrm.left * Math.sin(chi) };
    const f = { x: Math.cos(L.headingRad), y: Math.sin(L.headingRad) };
    const l = { x: -f.y, y: f.x };
    const d = { x: way.fwd * f.x + way.left * l.x, y: way.fwd * f.y + way.left * l.y };
    let rate;
    if (leadTurning) {
      const omegaL = wrapPi(Lnext.headingRad - L.headingRad) / dt;
      const vfx = L.tasFtps * f.x + omegaL * dy;
      const vfy = L.tasFtps * f.y - omegaL * dx;
      const ad = vfx * d.x + vfy * d.y;
      const disc = ad * ad - (vfx * vfx + vfy * vfy) + W.tasFtps * W.tasFtps;
      const lam = disc >= 0 ? Math.max(0, Math.sqrt(disc) - ad) : 0;
      const psi = disc >= 0 ? Math.atan2(vfy + lam * d.y, vfx + lam * d.x) : Math.atan2(d.y, d.x);
      if (st.psiPrev === null) st.psiPrev = psi;
      st.ff += G.ffFilter * (wrapPi(psi - st.psiPrev) / dt - st.ff);
      st.psiPrev = psi;
      rate = st.ff + wrapPi(psi - W.headingRad) / tauSec;
    } else {
      rate = wrapPi(Math.atan2(d.y, d.x) - W.headingRad) / tauSec;
    }

    const ratio = W.tasFtps / W.kias;
    if (lagging && placeKias != null && !st.zoom) st.zoom = { t0: t, alt: [W.altAboveFt], climb: [W.climbFtps ?? 0], nz: [1] };
    const perFtps = climbCostKtps(W, 1);
    const maxAllowedAlt = r < 2000 ? L.altAboveFt : L.altAboveFt + coneUpFtNow();
    const roomUpFt = Math.max(0, maxAllowedAlt - W.altAboveFt);
    const zoomFtps = st.zoom ? Math.min(FW_BUBBLE.diveFtps, Math.sqrt(2 * FW_BUBBLE.pullFtps2 * roomUpFt)) : 0;
    const zoomKtps = zoomFtps * perFtps;
    const leastKias = st.zoom && roomUpFt > 1 ? Math.min(floorKias, placeKias) : floorKias;
    const climbKtps = st.zoom ? 0 : perFtps * W.climbFtps;

    let cap = Math.min(bankCapDeg, stallBankDeg(W.kias));
    const wantBank = bankDegFromTurnRate(W.tasFtps, rate);
    if (W.kias < floorKias + TR.floorMarginKias && !sustainsBank(Math.abs(wantBank), W.kias, blockFt, climbKtps)) {
      cap = Math.min(cap, sustainedBankDeg(W.kias, blockFt, climbKtps));
    }
    const bank = Math.max(-cap, Math.min(cap, wantBank));

    const closeFtps = typeof arriveFtps === 'function' ? arriveFtps(W) : arriveFtps;
    const closure = lagging ? (st.placePrev === null ? 0 : (st.placePrev - placeFt) / dt) : st.alongPrev === null ? 0 : (st.alongPrev - along) / dt;
    st.alongPrev = along;
    st.placePrev = placeFt;
    const floorThr = throttleAtTorque(REJOIN.floorTorquePct, W.kias, blockFt);
    const aStop = slowKtps(REJOIN.stopStage, W.kias, blockFt, W.g, floorThr) + climbKtps + zoomKtps;
    const jerk = pilotJerkKtps2();
    const rampFt = (closure * CLOSURE.stopShare * aStop) / jerk / 2;
    const room = lagging ? placeFt : along - decisionFt;
    const needKtps = room - rampFt > 1 && closure > closeFtps ? (closure * closure - closeFtps * closeFtps) / (2 * (room - rampFt)) / (closureShare * ratio) : 0;
    const aMax = fullPowerKtps(W.kias, blockFt, W.g) - climbKtps;
    const aPower = slowKtps('power', W.kias, blockFt, W.g, floorThr) + climbKtps + zoomKtps;
    const aAll = slowKtps('idleBoards', W.kias, blockFt, W.g) + climbKtps + zoomKtps;
    if (!st.runIn && (st.onLine || lagging) && closure > closeFtps && needKtps >= CLOSURE.stopShare * aStop) st.runIn = true;
    else if (st.runIn && room > closeFtps * TR.runInHoldSec && needKtps < TR.runInReleaseShare * CLOSURE.stopShare * aStop) st.runIn = false;

    let aCmd;
    if (st.runIn) {
      aCmd = closure > closeFtps
        ? -Math.min(needKtps, aAll)
        : Math.max(-aAll, Math.min(aMax, G.speedLoop * Math.min(targetKias - W.kias, (closeFtps - closure) / (closureShare * ratio))));
      aCmd = Math.max(aCmd, -Math.sqrt(2 * jerk * Math.max(0, (closure - closeFtps) / (closureShare * ratio))));
    } else {
      const lineCmd = Math.min(targetKias, lineAtKias);
      const low = maxWhenLow && r > TRACKER.laneRangeFt && W.altAboveFt < L.altAboveFt - TR.lowEnergyFt;
      const kiasCmd = low ? Infinity : hot ? lineCmd - (lineCmd - leastKias) * Math.min(1, (cross - captureFt) / TR.hotFt) : st.onLine ? Math.max(targetKias, W.kias) : Infinity;
      const aMin = hot ? aAll : aPower;
      aCmd = Math.max(-aMin, Math.min(aMax, G.speedLoop * (kiasCmd - W.kias)));
    }
    aCmd = Math.min(aMax, Math.max(aCmd, -Math.sqrt(2 * jerk * Math.max(0, W.kias - leastKias))));

    const top = st.runIn || hot ? 'idleBoards' : 'power';

    let stepProfile = profile;
    if (st.zoom) {
      const v0 = W.climbFtps ?? 0;
      let wantZ = aCmd < 0 && r >= 2500 ? Math.min(zoomFtps, -aCmd / perFtps) : 0;
      const targetAlt = L.altAboveFt - 30; // lineUpFt below Lead
      if (r < 2500 || (aCmd >= 0 && W.altAboveFt > targetAlt)) {
        const diveFt = W.altAboveFt - targetAlt;
        if (diveFt > 0) {
          wantZ = -Math.min(2000 / 60, diveFt * 0.5);
        }
      }
      const pull = FW_ENERGY.pullFtps2;
      const v1 = v0 + Math.max(-pull * dt, Math.min(pull * dt, wantZ - v0));
      const nz = 1 + (v1 - v0) / dt / G_FTPS2;
      const a1 = W.altAboveFt + ((v0 + v1) / 2) * dt;
      st.zoom.alt.push(a1);
      st.zoom.climb.push(v1);
      st.zoom.nz.push(nz);
      stepProfile = [{ t0: t, t1: t + dt, table: { dt, alt: [W.altAboveFt, a1], climb: [v0, v1], nz: [nz, nz] } }];
    }

    st.minKias = Math.min(st.minKias, W.kias);
    st.ahead = st.watch.step(relativeTo(Lnext, W));
    if (st.ahead && n * dt >= cutAheadFromSec) {
      st.cut = true;
      return { abort: true };
    }
    st.stepCount++;

    return {
      psiCmd: W.headingRad + rate * dt,
      bankDeg: bank,
      aCmd,
      slowStage: top,
      floorThr,
      extraSlowKtps: zoomKtps,
      stepProfile,
    };
  };

  const ph = phase({}, {
    pursuit,
    pursuitEnds: true,
    bankCapDeg,
    rejoin: true,
  });

  return { phase: ph, st };
}

export function flyRejoinLine(options) {
  const { phase: ph, st } = rejoinLinePhase(options);
  const maxSec = Number.isFinite(options.stopAtSec) ? Math.min(CHANGE_LIMIT_SEC, options.stopAtSec) : CHANGE_LIMIT_SEC;
  const run = runTracker({
    refs: { ref: options.rec },
    wing0: options.wing,
    t0: options.t0,
    phases: [ph],
    profile: options.profile,
    blockFt: options.blockFt,
    maxSec,
  });
  if (st.cut) {
    return {
      points: run.points,
      steps: run.points.length,
      end: run.end.wing,
      accelKtps: run.accelKtps,
      maxBankDeg: run.maxBankDeg,
      ahead: true,
      cut: true,
      minKias: st.minKias,
      maxG: run.maxG ?? 1,
      minG: run.minG ?? 1,
      lineKias: st.lineKias ?? run.end.wing.kias,
      lineFt: st.lineFt,
      zoomLeg: zoomLegOf(st.zoom),
      stepDownOk: run.stepDownOk,
    };
  }
  if (!st.done || !run.ok) return null;
  return {
    points: run.points,
    steps: run.points.length,
    end: run.end.wing,
    accelKtps: run.accelKtps,
    maxBankDeg: run.maxBankDeg,
    ahead: st.ahead,
    minKias: st.minKias,
    maxG: run.maxG ?? 1,
    minG: run.minG ?? 1,
    lineKias: st.lineKias ?? run.end.wing.kias,
    lineFt: st.lineFt,
    zoomLeg: zoomLegOf(st.zoom),
    stepDownOk: run.stepDownOk,
  };
}

/** A zoom's heights as a height leg (flight.js heightAt's table), or null. */
function zoomLegOf(zoom) {
  return zoom ? { t0: zoom.t0, t1: zoom.t0 + (zoom.alt.length - 1) * dt, table: { dt, alt: zoom.alt, climb: zoom.climb, nz: zoom.nz } } : null;
}
