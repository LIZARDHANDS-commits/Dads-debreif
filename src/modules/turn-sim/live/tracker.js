// The tracker (clean-up step 1, TS-64; Patrick 5 Oct 05:27Z: "Tracker for fallback, and refractor the tracker"): a small
// closed-loop "pilot" that flies a wingman toward a slot in the frame of the aircraft he flies off, commanding bank and
// speed the way a pilot would, through the very same flight.js step the real aircraft use. It is flown once as a dry run
// at the press; the bank and speed it commanded are recorded and replayed by the real aircraft (replay.js flyStep's
// 'bankTrack' segment), so the path drawn ahead is the path flown (spec F1). It stays as the fallback for starts that no
// kinematic-line rule covers; until step 1 it lived in transitions.js. Its numbers are tuning.js TRACKER (all estimates:
// they shape how smoothly the wingman flies, not where the formations are). Its phase defaults are here; the leg recipes that call it
// (slide, stopAt, dropBack, sweepOut, closeThrough, rejoinTo, openOut, straightAhead) live in recipes.js.
import { bankDegFromTurnRate } from '../../../core/flight-math.js';
import { wrapPi } from '../../../core/angles.js';
import { G_FTPS2, KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC, copyAircraft, smoothLegSec, heightAt, SMOOTHER_PEAK } from './flight.js';
import { relativeTo, unit, DEG } from './manoeuvres.js';
import { fullPowerKtps, slowKtps, stallBankDeg } from './slow-down.js';
import { throttleAtTorque, throttleFor } from './power.js';
import { TRACKER, CLOSURE, HAND_OVER_FT, FW_ENERGY, FW_BUBBLE, REJOIN, TURNING_REJOIN, KIAS_OUTSIDE_LAB, lineKiasNow } from './tuning.js';
import { fixedLine, FW_LIMITS } from './slots.js';
import { setKias, stepCommanded, climbCostKtps, createPilot, pilotSpeed, pilotFly, pilotPower, coneUpFtNow } from './pilot.js';
import { G_RULE } from './rates.js';
import { isLeadInCanopy } from '../../../core/canopy.js';
import { liftTowardAim, gAndBankForLift } from '../../../core/point-mass.js';

// The one pilot model's step (pilot.js, clean-up step 5, TS-141) is used here and re-exported for the files that read it from here.
export { setKias, stepCommanded, climbCostKtps, isLeadInCanopy };

/** The longest the tracker flies one plan before giving up (a guard only; the spec's limits are tighter). */
export const PLAN_MAX_SEC = 300;

/**
 * Resolves the active phase configuration at time `t`, applying `exit` overrides once `exitAt` is reached.
 * Centralizes phase mode resolution for the tracker.
 */
function modeOf(phase, t) {
  return phase.exitAt != null && t >= phase.exitAt - 1e-9 ? { ...phase, ...phase.exit } : phase;
}

/** The point a phase's reference sits at, and its velocity, in the world: { px, py, vpx, vpy }. */
function refPoint(R, Rprev, ref, world, refTurn = true) {
  if (world) return { px: R.xFt + ref.f, py: R.yFt + ref.l, vpx: R.tasFtps * Math.cos(R.headingRad) + ref.vf, vpy: R.tasFtps * Math.sin(R.headingRad) + ref.vl };
  const omega = Rprev && refTurn ? wrapPi(R.headingRad - Rprev.headingRad) / STEP_SEC : 0;
  const lf = unit(R.headingRad);
  const lleft = { x: -lf.y, y: lf.x };
  const px = R.xFt + lf.x * ref.f + lleft.x * ref.l;
  const py = R.yFt + lf.y * ref.f + lleft.y * ref.l;
  const rx = px - R.xFt;
  const ry = py - R.yFt;
  return {
    px,
    py,
    vpx: R.tasFtps * lf.x - omega * ry + lf.x * ref.vf + lleft.x * ref.vl,
    vpy: R.tasFtps * lf.y + omega * rx + lf.y * ref.vf + lleft.y * ref.vl,
  };
}

/**
 * The ride (Step 7): the turning rejoin's line flown in Lead's frame, where it stands still (Patrick 8 Oct 20:49).
 * Off the line by `cross`, #2 asks to close on it at cross / rideCrossTauSec (no more than rideCrossMaxFtps), across it in
 * Lead's frame; the rest of his own speed goes up the line toward Lead. Only at the end is that turned into a world velocity
 * (the frame's own velocity at #2's place, Lead's speed plus ω × r, plus the relative one) and so a heading. Closure is
 * measured at #2 in Lead's frame, never as Lead's speed plus something. State (established, latched) lives in `ref`, which
 * is the run's own.
 */
function rideAim(ph, L, Lprev, ref, W) {
  const TR = TURNING_REJOIN;
  const line = ph.line ?? fixedLine(ph.lineDeg ?? TR.lineDeg, ph.side ?? -1);
  const rel = relativeTo(L, W);
  const { along, cross } = line.at(rel);
  const f = unit(L.headingRad);
  const l = { x: -f.y, y: f.x };
  const toW = (v) => ({ x: v.fwd * f.x + v.left * l.x, y: v.fwd * f.y + v.left * l.y });
  const omegaL = Lprev ? wrapPi(L.headingRad - Lprev.headingRad) / STEP_SEC : 0;
  const rx = W.xFt - L.xFt;
  const ry = W.yFt - L.yFt;
  // The frame's velocity at #2's place: what he would fly to sit still on Lead's canopy.
  const vfx = L.tasFtps * f.x - omegaL * ry;
  const vfy = L.tasFtps * f.y + omegaL * rx;
  const wx = W.tasFtps * Math.cos(W.headingRad);
  const wy = W.tasFtps * Math.sin(W.headingRad);
  const nW = toW(line.nrm); // across the line, positive ahead of it (hot)
  const mW = toW({ fwd: -line.u.fwd, left: -line.u.left }); // up the line, toward Lead
  const drift = (wx - vfx) * nW.x + (wy - vfy) * nW.y; // d(cross)/dt in Lead's frame
  const closing = (wx - vfx) * mW.x + (wy - vfy) * mW.y; // up the line, ft/s
  const st = (ref.ride ??= { established: false });
  const maxDrift = ph.driftFtps ?? TR.rideDriftFtps; // Patrick G2, 10 ft/s, ruled again 10 Oct 20:00Z (it was 40 on every rejoin ride)
  if (!st.established && Math.abs(cross) <= (ph.captureFt ?? TR.captureFt) && Math.abs(drift) <= maxDrift) {
    st.established = true;
    st.establishedRange = Math.hypot(rx, ry);
  }

  // Where he aims, in Lead's frame (it stands still there): a point on the line rideLeadFt further up it than his own place,
  // but not closer to Lead than the capture point until he is established, so he joins the line well back (Patrick G1:
  // established by 1,500 ft). Far off the line that points him mostly across it; as he nears it, along it, so he comes onto it
  // along it. His own speed sets how fast he moves that way: |vf + λ·d| = V, solved for λ.
  st.captureAlong ??= Math.min(ph.captureAlongFt ?? TR.rideCaptureAlongFt, along < 0 ? (ph.captureAlongFt ?? TR.rideCaptureAlongFt) : Math.max(along, 0));
  const leadFt = ph.leadFt ?? TR.rideLeadFt;
  const windowFt = ph.windowFt ?? TR.windowFarFt;
  const carrotWindowFt = ph.carrotWindowFt ?? windowFt;
  const carrotAlong = Math.min(along - (ph.minLeadFt ?? TR.rideMinLeadFt), Math.max(st.established ? carrotWindowFt : st.captureAlong, along - leadFt));
  const dAlong = carrotAlong - along; // < 0: up the line
  const dLen = Math.hypot(dAlong, cross) || 1;
  // direction in world axes: dAlong along u (outward), -cross along nrm
  const uW = { x: -mW.x, y: -mW.y };
  const d = { x: (dAlong * uW.x - cross * nW.x) / dLen, y: (dAlong * uW.y - cross * nW.y) / dLen };
  const V = W.tasFtps;
  const bd = vfx * d.x + vfy * d.y;
  const disc = bd * bd - (vfx * vfx + vfy * vfy) + V * V;
  let lam = disc >= 0 ? Math.max(0, -bd + Math.sqrt(disc)) : 0;
  let dvx = disc >= 0 ? vfx + lam * d.x : V * d.x;
  let dvy = disc >= 0 ? vfy + lam * d.y : V * d.y;
  // He closes on the line no faster than he can stop on it: across it at most √(2·a·|cross|) (a = rideStopFtps2). Until he
  // is established, the rest of his speed goes up or down the line, whichever brings him to the capture point (a hot start
  // falls back down it, as an HTRJ gets colder); once established, up it (|vf + c·n + a·m| = V, solved for a).
  const cMax = Math.sqrt(2 * (ph.stopFtps2 ?? TR.rideStopFtps2) * Math.abs(cross));
  const cNow = (dvx - vfx) * nW.x + (dvy - vfy) * nW.y;
  if (Math.abs(cNow) > cMax || !st.established) {
    let c = st.established ? Math.sign(cNow) * Math.min(Math.abs(cNow), cMax) : -Math.sign(cross) * Math.min(cMax, Math.abs(cross) / (ph.settleSec ?? TR.rideSettleSec));
    const aWant = st.established ? Infinity : (along - st.captureAlong) / (ph.alongTauSec ?? TR.rideAlongTauSec);
    // Across the line he can close no faster than his own speed allows (|vf + c·n + a·m| = V has a root only while
    // |vf·n + c| <= V, n and m being square to each other): c is held inside that, smoothly. Until 10 Oct a loop shrank it by
    // 0.7 up to six times, and each step it changed count jumped c by 30%, which rolled #2 left and right while he closed on
    // the line from far off.
    const vfn = vfx * nW.x + vfy * nW.y;
    const cRoom = TR.rideCrossShare * V; // short of all of it, so some speed is left along the line
    c = Math.max(-cRoom - vfn, Math.min(cRoom - vfn, c));
    const base = { x: vfx + c * nW.x, y: vfy + c * nW.y };
    const bm = base.x * mW.x + base.y * mW.y;
    const disc2 = bm * bm - (base.x * base.x + base.y * base.y) + V * V;
    if (disc2 >= 0) {
      const a1 = -bm + Math.sqrt(disc2);
      const a2 = -bm - Math.sqrt(disc2);
      const a = Math.abs(a1 - aWant) <= Math.abs(a2 - aWant) ? a1 : a2;
      dvx = base.x + a * mW.x;
      dvy = base.y + a * mW.y;
      lam = -1; // flagged in the trace: the (c, a) form is flying
    }
  }
  const r = Math.hypot(rx, ry);
  const across = Math.abs(rel.left);
  const back = -rel.fwd;
  const sweep = Math.atan2(back, Math.max(across, 1e-6)) * (180 / Math.PI);
  const correctSide = ph.side == null || (ph.side > 0 ? rel.left > 50 : rel.left < -50);
  // In the cone the sim flies (slots.js FW_LIMITS, 450-1,250 ft, 25-65°; until 10 Oct its own 450-1,500 ft copy).
  const inFwCone = Boolean(ph.isFw || ph.toFw) && correctSide && back > 0 && r >= FW_LIMITS.rangeFt[0] && r <= FW_LIMITS.rangeFt[1] && sweep >= FW_LIMITS.sweepDeg[0] && sweep <= FW_LIMITS.sweepDeg[1];
  if (inFwCone && !st.established) {
    st.established = true;
    st.establishedRange = r;
  }
  const arrived = (st.established && along <= windowFt) || inFwCone;
  const px = W.xFt + dvx;
  const py = W.yFt + dvy;
  return {
    px, py, vpx: vfx, vpy: vfy, ex: dvx, ey: dvy, d: Math.hypot(dvx, dvy), arrived,
    along, cross, drift, closing, established: st.established, psiWant: Math.atan2(dvy, dvx), rangeFt: r,
    slot: ph.slot ?? { fwd: rel.fwd, left: rel.left, alt: ph.slot?.alt ?? 0 },
  };
}

/**
 * Calculates the target aim point and its velocity in world coordinates (refPoint plus phase goal,
 * rate-limited reference slide, and separation distance).
 */
function aimOf(ph, L, Lprev, ref, W, t) {
  const T = TRACKER;
  const GAIN = T.gain;

  if (ph.kind === 'ride') return rideAim(ph, L, Lprev, ref, W);

  if (ph.kind === 'line') {
    const rel = relativeTo(L, W);
    const line = ph.line ?? fixedLine(ph.lineDeg ?? 45, ph.side ?? -1);
    const geo = line.at(rel);
    const along = geo.along;
    const cross = geo.cross;
    const approachDeg = ph.approachDeg ?? 45;
    const aimFt = ph.aimFt ?? 500;
    const chi = approachDeg * DEG * (2 / Math.PI) * Math.atan(Math.abs(cross) / aimFt);
    const wayFwd = -line.u.fwd * Math.cos(chi) - Math.sign(cross) * line.nrm.fwd * Math.sin(chi);
    const wayLeft = -line.u.left * Math.cos(chi) - Math.sign(cross) * line.nrm.left * Math.sin(chi);

    const f = { x: Math.cos(L.headingRad), y: Math.sin(L.headingRad) };
    const l = { x: -f.y, y: f.x };
    const dWorld = { x: wayFwd * f.x + wayLeft * l.x, y: wayFwd * f.y + wayLeft * l.y };
    const dAim = Math.max(150, Math.min(800, along));
    const px = W.xFt + dWorld.x * dAim;
    const py = W.yFt + dWorld.y * dAim;
    const omegaL = Lprev ? wrapPi(L.headingRad - Lprev.headingRad) / STEP_SEC : 0;
    const dx = L.xFt - W.xFt;
    const dy = L.yFt - W.yFt;
    const r = Math.hypot(dx, dy);
    const vfx = L.tasFtps * f.x + omegaL * dy;
    const vfy = L.tasFtps * f.y - omegaL * dx;
    const ex = px - W.xFt;
    const ey = py - W.yFt;
    const d = Math.hypot(ex, ey);
    const onLine = Math.abs(cross) <= (ph.captureFt ?? 150);
    const inCone = (ph.coneEase || ph.isFw)
      ? (r <= 1200 && onLine && along <= 1200)
      : false;
    const reachedDecision = onLine && along <= (ph.decisionFt ?? 750);
    const arrived = inCone || reachedDecision;
    return { px, py, vpx: vfx, vpy: vfy, vfx, vfy, ex, ey, d, arrived, along, cross, dWorld, omegaL, slot: ph.slot ?? { fwd: rel.fwd, left: rel.left, alt: ph.slot?.alt ?? 0 } };
  }


  // The reference slot moves toward the phase's slot at the phase's rates. A phase with a `goal` (a goal-seeking phase,
  // the fighting wing turns of TS-55) works out its slot afresh every step from where Lead and #2 are.
  // On Lead's wing plane (TS-181) the slot is in it, as holdInPlane holds it: its step down tilts with Lead's bank, so in
  // his turn the place sits a little further in, horizontally, as well as stepped down (slotAltOf).
  const slot = planeSlot(ph, L, ph.goal ? ph.goal(L, W, t) : ph.slot);
  for (const [axis, v, target, rate] of [['f', 'vf', slot.fwd, ph.fwdRate], ['l', 'vl', slot.left, ph.latRate]]) {
    if (!Number.isFinite(rate)) {
      ref[axis] = target;
      ref[v] = 0;
    } else {
      const dist = target - ref[axis];
      const accelShare = ph.refAccelShare ?? (ph.targetBankDeg != null ? 0.6 : T.refAccelShare);
      const accel = rate * accelShare;
      const maxV = Math.sqrt(Math.max(0, 2 * accel * Math.abs(dist)));
      const wantRaw = Math.sign(dist) * Math.min(rate, Math.abs(dist) * (ph.targetBankDeg != null ? 1.5 : GAIN.refRate));
      const want = Math.sign(dist) * Math.min(Math.abs(wantRaw), maxV);
      const step = accel * STEP_SEC;
      ref[v] += Math.max(-step, Math.min(step, want - ref[v]));
      ref[axis] += ref[v] * STEP_SEC;
      const snapDist = Math.max(T.snapFt, Math.min(1.0, (ph.advanceTol ?? 6) * 0.25));
      if (Math.abs(target - ref[axis]) < snapDist) {
        ref[axis] = target;
        ref[v] = 0;
      }
    }
  }
  const arrived = ph.goal
    ? Math.hypot(ref.f - slot.fwd, ref.l - slot.left) < (ph.goalTolFt ?? T.goalTolFt)
    : Math.hypot(ref.f - slot.fwd, ref.l - slot.left) < Math.max(T.snapFt, (ph.advanceTol ?? 6) * 0.25);

  // The reference point and its velocity: attached to the aircraft it flies off, so it turns with it (v = vRef + ω × r + the reference's own motion).
  // A phase with `refTurn: false` (the fighting wing turn exit) leaves out the ω × r: the place goes with the aircraft flown
  // off but not round with its heading's wiggles, so a wingman in the cone holds parallel instead of swinging with them.
  const { px, py, vpx, vpy } = refPoint(L, Lprev, ref, ph.world, ph.refTurn !== false);
  const ex = px - W.xFt;
  const ey = py - W.yFt;
  const d = Math.hypot(ex, ey);
  return { px, py, vpx, vpy, ex, ey, d, arrived, slot };
}

/**
 * A closure phase's closing speed on its slot at distance d (ft/s, tuning.js CLOSURE): the closure rate, stopped from the
 * stopping distance. Fore and aft the stop is the power-back slowing the tracker's speed loop uses (closing from behind)
 * or full power's speeding up (closing from ahead), at the speed and height flown (slow-down.js); sideways it is the slide's bank (CLOSURE.slideBankDeg, the same for every
 * Rates choice), never more than the phase's bank cap gives; both at CLOSURE.stopShare. Beyond the hand-over range (an odd start, the
 * tracker's fallback) it may grow with range (CLOSURE.farGain), as the old rejoin's did.
 */
function closureCap(ph, L, W, ex, ey, d, blockFt, farFromFt) {
  if (d < 1e-6) return 0;
  const c = Math.cos(L.headingRad);
  const s = Math.sin(L.headingRad);
  const uf = (ex * c + ey * s) / d;
  const ul = (-ex * s + ey * c) / d;
  const ft2 = W.tasFtps / W.kias; // KIAS per second to true ft/s² (TAS in ft/s per KIAS; it counted KT_TO_FTPS twice before V2.64)
  const aFore = (uf >= 0 ? slowKtps('power', W.kias, blockFt) : fullPowerKtps(W.kias, blockFt)) * ft2; // what the tracker's own speed loop can do
  const aLat = G_FTPS2 * Math.tan((Math.min(CLOSURE.slideBankDeg, ph.bankCapDeg) * Math.PI) / 180);
  const aStop = CLOSURE.stopShare * Math.min(aFore / Math.max(Math.abs(uf), 1e-6), aLat / Math.max(Math.abs(ul), 1e-6));
  const rate = ph.closureFtps + CLOSURE.farGain * Math.max(0, d - farFromFt);
  return Math.min(ph.vrelMax, rate, Math.sqrt(2 * aStop * d));
}

/**
 * Commanded closing speed and slot-law steering velocities (closureCap and far gain, or distance-capped pull).
 */
function closureOf(ph, L, W, aim, blockFt, farFromFt = HAND_OVER_FT, pclMaxActive = false) {
  const T = TRACKER;
  const GAIN = T.gain;
  const ratio = W.tasFtps / W.kias;

  if (ph.kind === 'ride') {
    // The speed is held (Patrick 8 Oct 20:16); the geometry takes the closure out. The steering is rideAim's.
    const floor = ph.floorKias ?? KIAS_OUTSIDE_LAB;
    const rNow = aim.rangeFt ?? Math.hypot(L.xFt - W.xFt, L.yFt - W.yFt);
    const inAnticipation = Boolean(ph.isFw || ph.toFw) && rNow <= 1000;
    const lineTargetKias = inAnticipation
      ? Math.max(L.kias, L.kias + (rNow - 500) * (20 / 500))
      : (aim.along <= (ph.easeFromFt ?? TURNING_REJOIN.rideEaseFromFt)
          ? (ph.easeKias ?? TURNING_REJOIN.rideEaseKias)
          : (ph.rideKias ?? TURNING_REJOIN.rideKias));
    const kiasCmd = (pclMaxActive || ph.rejoin || aim.established || Math.abs(aim.cross) <= (ph.speedUpFt ?? TURNING_REJOIN.rideSpeedUpFt))
      ? Math.max(floor, lineTargetKias)
      : floor;
    return { pullX: 0, pullY: 0, vdx: aim.ex, vdy: aim.ey, speed: W.tasFtps, psiCmd: aim.psiWant, kiasCmd };
  }

  if (ph.kind === 'line') {
    const room = Math.max(0, (aim.along ?? 0) - (ph.decisionFt ?? 750));
    const closeFtps = typeof ph.arriveFtps === 'function' ? ph.arriveFtps(W) : (ph.arriveFtps ?? 20 * KT_TO_FTPS);
    const slowFtps2 = ph.slowFtps2 ?? TURNING_REJOIN.slowFtps2;
    let wantClosure = Math.sqrt(closeFtps * closeFtps + 2 * slowFtps2 * room);
    
    // De-rate along-track closure when off the line to prevent cutting the corner (intercept geometry first)
    const captureFt = ph.captureFt ?? 150;
    if (Math.abs(aim.cross) > captureFt) {
      const excess = Math.abs(aim.cross) - captureFt;
      const derate = Math.max(0, 1 - excess / (ph.aimFt ?? 500));
      wantClosure *= derate;
    }

    const omegaL = aim.omegaL ?? 0;
    let psiCmd;
    if (Math.abs(omegaL) < 1e-4) {
      psiCmd = Math.atan2(aim.dWorld.y, aim.dWorld.x);
    } else {
      const ad = aim.vfx * aim.dWorld.x + aim.vfy * aim.dWorld.y;
      const disc = ad * ad - (aim.vfx * aim.vfx + aim.vfy * aim.vfy) + W.tasFtps * W.tasFtps;
      const lam = disc >= 0 ? Math.max(0, Math.sqrt(disc) - ad) : 0;
      psiCmd = disc >= 0 ? Math.atan2(aim.vfy + lam * aim.dWorld.y, aim.vfx + lam * aim.dWorld.x) : Math.atan2(aim.dWorld.y, aim.dWorld.x);
    }
    const over = ph.overtakeKt != null ? ph.overtakeKt : 20;
    const floorKias = ph.floorKias ?? KIAS_OUTSIDE_LAB;
    const kiasCmd = Math.max(floorKias, Math.min(L.kias + over, (L.tasFtps + wantClosure) / ratio));
    return { pullX: 0, pullY: 0, vdx: W.tasFtps * Math.cos(psiCmd), vdy: W.tasFtps * Math.sin(psiCmd), speed: W.tasFtps, psiCmd, kiasCmd };
  }



  const { ex, ey, d, vpx, vpy } = aim;
  let pullX;
  let pullY;
  if (ph.closureFtps) {
    const pull = closureCap(ph, L, W, ex, ey, d, blockFt, farFromFt);
    const c = Math.cos(L.headingRad);
    const s = Math.sin(L.headingRad);
    const ef = ex * c + ey * s;
    const el = -ex * s + ey * c;
    const share = d > 1e-6 ? pull / d : 0;
    const vf = Math.sign(ef) * Math.min(share * Math.abs(ef), GAIN.position * Math.abs(ef));
    const vl = Math.sign(el) * Math.min(share * Math.abs(el), CLOSURE.nearGain * Math.abs(el));
    pullX = vf * c - vl * s;
    pullY = vf * s + vl * c;
  } else {
    const cap = Math.min(ph.vrelMax, ph.vrel0 + ph.kcap * Math.max(0, d - ph.d0), Math.sqrt(2 * ph.decel * d)); // never closing faster than it can stop (decel in ft/s²)
    const pull = Math.min(cap, GAIN.position * d);
    pullX = d > 1e-6 ? (ex / d) * pull : 0;
    pullY = d > 1e-6 ? (ey / d) * pull : 0;
  }
  const vdx = vpx + (pullX ?? 0);
  const vdy = vpy + (pullY ?? 0);
  const speed = Math.hypot(vdx, vdy);
  const psiCmd = speed > T.minSpeedFtps ? Math.atan2(vdy, vdx) : L.headingRad;
  let over = ph.closureFtps ? ph.closureFtps / ratio : ph.overtakeKias;
  let under = ph.closureFtps ? ph.closureFtps / ratio : ph.undertakeKias;
  const refKias = Math.hypot(vpx, vpy) / ratio;
  if (ph.targetOvertakeKt != null) {
    const rawDev = speed / ratio - refKias;
    if (rawDev > 0) {
      const t = ph.targetOvertakeKt;
      const c = ph.overtakeKias ?? (t + 2);
      over = rawDev <= t ? rawDev : t + (c - t) * Math.tanh((rawDev - t) / Math.max(1, c - t));
    } else {
      const t = ph.targetUndertakeKt ?? ph.targetOvertakeKt;
      const c = ph.undertakeKias ?? (t + 2);
      const mag = -rawDev;
      under = mag <= t ? mag : t + (c - t) * Math.tanh((mag - t) / Math.max(1, c - t));
    }
  }
  const floorKias = ph.floorKias ?? Math.max(140, refKias - under);
  const kiasCmd = Math.max(floorKias, Math.max(refKias - under, Math.min(refKias + over, speed / ratio)));
  return { pullX, pullY, vdx, vdy, speed, psiCmd, kiasCmd };
}

/**
 * Heading loop: turn rate toward the commanded heading, with its own rate fed forward; bank from the turn rate.
 */
function headingBank(ph, psiCmd, W, aligning, bankOwn, headingState, L = null, aim = null, blockFt = 8000) {
  const T = TRACKER;
  const GAIN = T.gain;
  const cmd = psiCmd ?? W.headingRad;
  if (headingState.psiCmdPrev === null) headingState.psiCmdPrev = cmd;
  const psiStep = wrapPi(cmd - headingState.psiCmdPrev);
  headingState.psiCmdPrev = cmd;
  headingState.omegaFf += GAIN.ffFilter * (psiStep / STEP_SEC - headingState.omegaFf);

  const isRejoinKind = ph.kind === 'line' || ph.kind === 'ride';
  const tauSec = isRejoinKind ? (ph.tauSec ?? (ph.kind === 'ride' ? TURNING_REJOIN.rideHeadingTauSec : 4)) : null;
  const gainHdg = tauSec != null ? (1 / tauSec) : GAIN.heading;
  const omegaCmd = gainHdg * wrapPi(cmd - W.headingRad) + (ph.feedForward === false ? 0 : headingState.omegaFf);

  let cap = aligning ? ph.alignBankDeg ?? T.alignBankDeg : ph.bankCapDeg;
  // On a rejoin, near his least speed too, he banks what the line needs: MAX is set and any speed bleed accepted; only stall
  // and G limit the bank (Patrick 10 Oct 20:01Z; TS-139's sustained-bank cut retired).
  if (isRejoinKind) cap = Math.min(cap, stallBankDeg(W.kias));
  // The cone ease is for arriving along the line, once on it: in the capture before that (the ride not yet established) he
  // banks what the capture needs. Until V2.232 it eased him from 1,500 ft down the line on, on it or not; at the 35° line
  // (TS-181) the capture from line abreast crosses that range and he flew through the line and across Lead's six.
  const easing = ph.coneEase && L && aim?.along != null && aim.established !== false;
  if (easing) {
    const leadBank = L.bankDeg ?? 0;
    const targetCap = Math.max(Math.abs(leadBank) + 5, 25);
    const dFar = ph.coneEaseFarFt ?? 1200;
    const dNear = ph.decisionFt ?? 750;
    const frac = Math.max(0, Math.min(1, (aim.along - dNear) / Math.max(1, dFar - dNear)));
    cap = targetCap + frac * (cap - targetCap);
  }
  const leadBank = L?.bankDeg ?? 0;
  const rawBank = bankDegFromTurnRate(W.tasFtps, omegaCmd);
  let bank;
  if (ph.targetBankDeg != null) {
    const baseBank = L && Math.abs(leadBank) > 5 ? leadBank : 0;
    const relBank = rawBank - baseBank;
    const tBank = ph.targetBankDeg;
    const eCap = Math.max(tBank, cap);
    const sign = Math.sign(relBank) || 1;
    const mag = Math.abs(relBank);
    let shapedRel;
    if (mag <= tBank) {
      shapedRel = relBank;
    } else {
      const excess = mag - tBank;
      const margin = eCap - tBank;
      shapedRel = sign * (tBank + margin * Math.tanh(excess / Math.max(1, margin)));
    }
    // The cap is on the bank he adds to Lead's: in Lead's 30-60° turn a slide still banks with him. Until V2.219 it was
    // on his whole bank, so in a 4-ship turning rejoin #3 could not hold 30° to slide into finger and fell away.
    bank = baseBank + Math.max(-cap, Math.min(cap, shapedRel));
  } else {
    bank = Math.max(-cap, Math.min(cap, rawBank));
  }
  if (easing) {
    const leadBank = L.bankDeg ?? 0;
    const dFar = ph.coneEaseFarFt ?? 1200;
    const dNear = ph.decisionFt ?? 750;
    const frac = Math.max(0, Math.min(1, (aim.along - dNear) / Math.max(1, dFar - dNear)));
    bank = leadBank + frac * (bank - leadBank);
  }
  if (bankOwn != null) bank = Math.max(-cap, Math.min(cap, bankOwn)); // the switch's own bank, inside the phase's cap (the G rule)
  // Lining up on a closure phase, the last few hundredths of a degree of bank are taken out at once, so the wings come
  // level in a step or two instead of creeping for ten seconds (the heading left is inside alignHeadingRad).
  if (aligning && ph.closureFtps && Math.abs(bank) < T.alignDeadbandDeg) bank = 0;
  return bank;
}

/**
 * 3D lift guidance toward an aim point: computes the 3D lift vector in G that carries the
 * aircraft's weight and points its lift directly toward the aim point in 3D space,
 * resolving it into commanded G and bank angle.
 * Because lift points out the canopy glass, aiming the lift vector inherently points the
 * canopy at the target, guaranteeing positive G and preventing belly-masking dives.
 * Not used by any phase now (review 2.3); kept because tests/unit/core/canopy.test.js covers it (retiring it needs Patrick's yes).
 */
export function aimLiftVector(W, aimPoint, gainPerSec = 0.5) {
  const vFtps = Math.max(1, W.tasFtps || 1);
  const ch = Math.cos(W.headingRad), sh = Math.sin(W.headingRad);
  const climbRad = Math.asin(Math.max(-1, Math.min(1, (W.climbFtps || 0) / vFtps)));
  const cg = Math.cos(climbRad), sg = Math.sin(climbRad);

  const vHat = { x: cg * ch, y: cg * sh, z: sg };
  const up = { x: -sg * ch, y: -sg * sh, z: cg };

  const targetZ = aimPoint.pz ?? ((aimPoint.altAboveFt ?? 0) + (aimPoint.slot?.alt ?? 0));
  const toAim = {
    x: (aimPoint.px ?? aimPoint.xFt ?? 0) - W.xFt,
    y: (aimPoint.py ?? aimPoint.yFt ?? 0) - W.yFt,
    z: targetZ - (W.altAboveFt ?? 0),
  };

  const { wanted } = liftTowardAim(vHat, toAim, vFtps, gainPerSec);
  const fallbackBankRad = -(W.bankDeg * Math.PI) / 180;
  const { g, bankRad } = gAndBankForLift(wanted, vHat, up, fallbackBankRad);
  return { g, bankDeg: -(bankRad * 180) / Math.PI, lift: wanted };
}

/** The climb rate the room left above him in the cone allows, at FW_BUBBLE's climb rate and pull (the cone energy's zoom). */
function zoomRoomFtps(L, W) {
  const up = Math.max(0, (L.altAboveFt ?? 0) - 10 - (W.altAboveFt ?? 0));
  return Math.min(FW_BUBBLE.diveFtps, Math.sqrt(2 * FW_BUBBLE.pullFtps2 * up));
}

/**
 * Speed loop: acceleration follows the speed error; the one pilot model (pilot.js, TS-141) holds it to what the T-6 gives
 * at the G he pulls (full power up, power back down: slow-down.js, TS-61) and builds it up at the one jerk limit.
 * Returns { kias, zoomFtps, accel }.
 */
function powerOf(ph, pilot, W, L, kiasCmd, { blockFt, aligning, stageOwn, belowOwn, cone, energyIntent, heightState = null, t = 0, aCmdOwn = null }) {
  const T = TRACKER;
  const GAIN = T.gain;
  // A phase may slow with more than power back (slowStage, slow-down.js; the turning rejoin's run-in: power back and the
  // speed brake, card 03:33Z rule 4: "torque and speed brake first").
  // A rejoin's leg slows with its torque floor and the boards as needed (Patrick 6 Oct 03:17-03:20Z, TS-108).
  const isTurn = Math.abs(W.bankDeg ?? 0) > 15;
  const holdThr = isTurn ? throttleFor(0, W.kias, blockFt, Math.abs(W.g ?? 1), W.climbFtps ?? 0) : 0;
  const relW = (L && W) ? relativeTo(L, W) : null;
  const isTrailing = relW ? (relW.fwd < -200) : false;
  // Universal turn power floor: any trailing aircraft in a turn maintains at least 70% hold power
  const minTurnThr = isTurn && isTrailing ? holdThr * 0.70 : 0;
  // Emergency overshoot check: dangerous closure inside 500 ft
  const isEmergencyOvershoot = relW && relW.fwd > -500 && (ph.closureFtps ?? 0) > 25 * KT_TO_FTPS;
  const isExplicitEmergency = stageOwn != null || ph.slowStage === 'idleBoards';
  const slowStage = isExplicitEmergency
    ? (stageOwn ?? ph.slowStage)
    : (isEmergencyOvershoot ? (ph.slowStage ?? 'boards') : 'power');
  const floorThr = Math.max(slowStage === 'boards' ? throttleAtTorque(REJOIN.floorTorquePct, W.kias, blockFt) : 0, minTurnThr);
  // The climb he is flying costs speed and a descent gives it (standard energy, dV/dt = g (T - D) / W - g sin(climb
  // angle): climbCostKtps), so the engine's range is shifted by it: climbing at MAX he slows (Patrick 6 Oct 05:00Z: "This
  // climb is unrealistic to not lose speed on"; until V2.124 the height was flown free and only the power read showed it).
  // Not on fighting wing's cone energy (TS-96, below), which picks the climb from the speed change and so already counts it.
  const energy = cone || ph.isFw || (ph.coneAlt && (ph.closureFtps || ph.coneEnergy));
  const climbKtps = energy ? 0 : climbCostKtps(W, W.climbFtps ?? 0);
  // Fighting wing soaks up extra speed with the cone (Patrick 6 Oct 16:58Z: "Settle high at the top of the cone to soak up
  // the extra speed. we can ALWAYS use the cone to soak up speed"): while there is room above, a zoom up to FW_BUBBLE's
  // climb rate slows him beyond what power back gives (standard energy, climbCostKtps); the climb itself is flown below.
  const zoomFtps = energy && belowOwn == null ? zoomRoomFtps(L, W) : 0;
  const extraSlowKtps = zoomFtps > 0 ? climbCostKtps(W, zoomFtps) : 0;
  const aWant = aCmdOwn != null
    ? aCmdOwn
    : (energyIntent === 'gain' ? Infinity : GAIN.speedLoop * ((kiasCmd ?? W.kias) - W.kias));
  // Lining up, the last few thousandths of a knot are taken out at once (snapKias), so the speed has no step.
  const accel = pilotSpeed(pilot, W, aWant, {
    blockFt, top: slowStage, floorThr, climbKtps, extraSlowKtps, snapKias: aligning ? L.kias : null, snapTol: T.kiasSnap,
  });
  return { kias: W.kias + accel * STEP_SEC, zoomFtps, accel };
}

/**
 * planeSlot: a phase's slot ({ fwd, left, alt }, alt with Lead's height) in Lead's frame now. slotAltOf: the height it asks of
 * #2 now (ph.slot.alt). On Lead's wing plane (ph.wingPlane: the turning rejoin from its
 * decision point, TS-181) it is the slot's step down from the plane Lead's bank tilts under #2, so in Lead's turn he sits
 * stepped down as he will hold it (formation-turns.js holdInPlane).
 */
function planeSlot(ph, L, slot) {
  if (!ph.wingPlane || !slot || slot.alt == null || !L) return slot;
  const phi = (L.bankDeg ?? 0) * DEG;
  return { ...slot, left: slot.left * Math.cos(phi) + (slot.alt - (L.altAboveFt ?? 0)) * Math.sin(phi) };
}

function slotAltOf(ph, L, W) {
  const alt = ph.slot?.alt;
  if (!ph.wingPlane || alt == null || !L || !W) return alt;
  const phi = (L.bankDeg ?? 0) * DEG;
  const leadAlt = L.altAboveFt ?? 0;
  return leadAlt - relativeTo(L, W).left * Math.tan(phi) + (alt - leadAlt) / Math.cos(phi);
}

/**
 * Vertical evolution: flies aircraft #2's height in the same pass as bank and speed.
 * Precedence:
 * 1. Cone energy in fighting wing (or bubble dive toward belowOwn)
 * 2. Caller's explicit profile (e.g. wing-plane ease, dive profile)
 * 3. Internal smooth leg toward phase slot altitude (limited by ~1 G push/pull and climb energy)
 * Returns { stepProfile }.
 */
export function heightOf(ph, L, W, dt, profile, { blockFt, belowOwn, t, accel, zoomFtps, heightState }) {
  const explicitNow = Boolean(profile && (!Array.isArray(profile) || profile.some((leg) => t >= (leg.t0 ?? -Infinity) && t < (leg.t1 ?? Infinity) + 1e-9)));
  // In the capture, before he is on the line, the caller's own smooth leg to the line's height (or the vertical's) flies.
  const capturing = ph.slopedAlt && !heightState.onLine && explicitNow;
  if (!capturing && (ph.slopedAlt || (ph.wingPlane && ph.slot?.alt != null)) && L && W) {
    // The rejoin line's depth (SMM 12.24 para 58: "maintain the horizontal plane just slightly below lead"; EFIG p.374):
    // Lead held lineElevDeg above #2's horizon, never shallower than lineUpFt's 50 ft below him (Patrick 10 Oct 19:57Z,
    // 23:58Z; TS-181), level, not a slope with Lead's bank (TS-159 retired). From the decision point the tail legs
    // (wingPlane) take him onto Lead's wing plane stepped down, by the same law: a target that moves as he does.
    const TR = TURNING_REJOIN;
    const rangeFt = Math.hypot(W.xFt - L.xFt, W.yFt - L.yFt);
    // The angle is held from the end of the capture's own height leg, not only once the ride is established: until V2.234
    // the floor ruled in between, so far out he sat 50 ft low, not the 70-140 ft the 4° gives (Fable's V2.232 audit).
    const depthFt = Math.max(-TR.lineUpFt, rangeFt * Math.tan(TR.lineElevDeg * DEG));
    const targetAlt = ph.slopedAlt ? (L.altAboveFt ?? 0) - depthFt : slotAltOf(ph, L, W);
    const D = FW_BUBBLE;
    // One smooth change, stopping on the target as he gets there: on the line within heightG of level flight (TS-140), onto
    // the wing plane within planeEaseG (TS-126). Until V2.232 the line's was FW_BUBBLE's 1.9 g pull to a fixed 50 ft.
    const pull = (ph.slopedAlt ? TR.heightG : TR.planeEaseG) * G_FTPS2;
    // Any pull up (a climb, or stopping a descent) stays inside the G rule's 5 G with the bank he has (TS-181): in the
    // capture's steep bank he holds his height, and comes up the 4° as he rolls out.
    const tanB = Math.tan(Math.min(89, Math.abs(W.bankDeg ?? 0)) * DEG);
    const pullUp = Math.min(pull, Math.max(0, Math.sqrt(Math.max(0, G_RULE.normalG ** 2 - tanB * tanB)) - 1) * G_FTPS2);
    const toward = (ft) => {
      const err = ft - W.altAboveFt;
      const v = Math.sign(err) * Math.min(Math.abs(err) * D.altGain, Math.sqrt(2 * (err < 0 ? pullUp : pull) * Math.abs(err)));
      return Math.max(-D.diveFtps, Math.min(D.diveFtps, v));
    };
    let wantV = toward(targetAlt);
    const isRejoin = Boolean(ph.rejoin || ph.rejoinKind === 'into' || ph.rejoinKind === 'straight');
    // A guard only: with the line at Lead less 50 ft (TS-166) this never binds (Fable's V2.216 audit 2.4); refactor step 3 may drop it.
    if (ph.slopedAlt && isRejoin && W.altAboveFt >= (L.altAboveFt ?? 0) - 10) wantV = Math.min(wantV, toward((L.altAboveFt ?? 0) - 10));
    const v0 = W.climbFtps ?? 0;
    const v1 = v0 + Math.max(-pull * dt, Math.min(pullUp * dt, wantV - v0));
    const nz = 1 + (v1 - v0) / dt / G_FTPS2;
    const a1 = W.altAboveFt + ((v0 + v1) / 2) * dt;
    heightState.hasHeightChange = true;
    heightState.sloped = true;
    return { stepProfile: [{ t0: t, t1: t + dt, table: { dt, alt: [W.altAboveFt, a1], climb: [v0, v1], nz: [nz, nz] } }] };
  }
  // 1. Fighting wing energy with the cone (TS-96): the climb that gives the slowing the speed loop flies (or the descent that
  // gives its speeding up), inside the cone's height above or below Lead, eased in and out at FW_ENERGY.pullFtps2.
  if (heightState.cone || (ph.coneAlt && (ph.closureFtps || ph.coneEnergy)) || belowOwn != null) {
    const E = FW_ENERGY;
    const v0 = W.climbFtps ?? 0;
    heightState.cone ??= { t0: t, alt: [W.altAboveFt], climb: [v0], nz: [1] };
    const perFtps = climbCostKtps(W, 1);
    const want = ph.coneAlt ? -accel / perFtps : 0;
    const coneUpFt = coneUpFtNow();
    const isRejoin = Boolean(ph.rejoin || ph.rejoinKind === 'into' || ph.rejoinKind === 'straight');
    const range3DFt = Math.hypot(W.xFt - L.xFt, W.yFt - L.yFt, (W.altAboveFt ?? 0) - (L.altAboveFt ?? 0));
    const stayBelow = Boolean((isRejoin && range3DFt < 2000) || ph.coneEnergy || ph.stepDown);
    const topFt = stayBelow ? Math.min((L.altAboveFt ?? 0) - 10, (L.altAboveFt ?? 0) + coneUpFt) : (L.altAboveFt ?? 0) + coneUpFt;
    const bottomFt = (L.altAboveFt ?? 0) - coneUpFt;
    const up = Math.max(0, topFt - W.altAboveFt);
    const down = Math.max(0, W.altAboveFt - bottomFt);
    const lo = -Math.sqrt(2 * E.pullFtps2 * down); // no rate cap, only the pull (TS-140)
    const hi = Math.sqrt(2 * E.pullFtps2 * up);
    // Outside the cone's height (a vertical rejoin's top, the bubble's dive) he comes back into it first, and the fighting
    // wing bubble's dive (TS-134) takes him to belowOwn under the aircraft flown off: both at FW_BUBBLE's rate and pull,
    // assertively (Patrick 6 Oct 15:59Z: "When the fighting wing turn ends 2 needs to assertively move back into the cone").
    // Inside the cone, the energy's climb or descent at FW_ENERGY's gentler pull (a quick dive still coming out at the bubble's pull).
    const D = FW_BUBBLE;
    const toward = (ft) => Math.max(-D.diveFtps, Math.min(D.diveFtps, (ft - W.altAboveFt) * D.altGain));
    const quick = belowOwn != null;
    // Slowing faster than the gentle climb gives, he zooms (up to zoomFtps, at the bubble's pull) toward the cone's top.
    const zoom = belowOwn == null && want > hi && zoomFtps > hi;
    let wantV = belowOwn != null ? toward(L.altAboveFt - belowOwn) : W.altAboveFt > topFt ? toward(topFt) : W.altAboveFt < bottomFt ? toward(bottomFt) : Math.max(lo, Math.min(zoom ? Math.min(zoomFtps, Math.sqrt(2 * D.pullFtps2 * up)) : hi, want));
    // Step-Down Gate (SMM 12.24 & 16.20): inside 2,000 ft or in FW turns, Wing must not climb above Lead.
    if (stayBelow && W.altAboveFt >= (L.altAboveFt ?? 0) - 10) {
      wantV = Math.min(wantV, toward((L.altAboveFt ?? 0) - 10));
    }
    // A zoom stops at the cone's top (or the step-down gate) at the bubble's pull: climbing faster than the gentle pull can
    // stop in the room left, he keeps the bubble's pull until he can (a zoom from 50 ft low went 7 ft above Lead, 10 Oct).
    const overRun = v0 > Math.sqrt(2 * E.pullFtps2 * up) || -v0 > Math.sqrt(2 * E.pullFtps2 * down);
    const pull = quick || zoom || overRun ? D.pullFtps2 : E.pullFtps2;
    // On a rejoin the pull up stays inside the G rule's 5 G with the bank he has (Patrick 10 Oct 2026 23:59Z, "Inside 5 G";
    // TS-181): from the 35° line's capture he zoomed into the cone at 78° of bank and 5.7 G.
    const tanB = Math.tan(Math.min(89, Math.abs(W.bankDeg ?? 0)) * DEG);
    const pullUp = ph.rejoin ? Math.min(pull, Math.max(0, Math.sqrt(Math.max(0, G_RULE.normalG ** 2 - tanB * tanB)) - 1) * G_FTPS2) : pull;
    const v1 = v0 + Math.max(-pull * dt, Math.min(pullUp * dt, wantV - v0));
    const nz = 1 + (v1 - v0) / dt / G_FTPS2;
    const a1 = W.altAboveFt + ((v0 + v1) / 2) * dt;
    heightState.cone.alt.push(a1);
    heightState.cone.climb.push(v1);
    heightState.cone.nz.push(nz);
    heightState.hasHeightChange = true;
    return { stepProfile: [{ t0: t, t1: t + dt, table: { dt, alt: [W.altAboveFt, a1], climb: [v0, v1], nz: [nz, nz] } }] };
  }

  // 2. Caller's explicit profile takes precedence over internal height calculations when active at time t.
  const hasExplicit = Boolean(
    profile &&
    (!Array.isArray(profile) || profile.some((leg) => t >= (leg.t0 ?? -Infinity) && t < (leg.t1 ?? Infinity) + 1e-9))
  );
  if (hasExplicit) {
    return { stepProfile: profile };
  }

  // 3. Single-pass altitude evolution toward phase slot target (ph.slot.alt).
  if (ph.coneAlt) {
    return { stepProfile: undefined };
  }
  let target = slotAltOf(ph, L, W);
  if (target != null && Number.isFinite(target)) {
    const isRejoin = Boolean(ph.rejoin || ph.rejoinKind === 'into' || ph.rejoinKind === 'straight');
    const range3DFt = Math.hypot(W.xFt - L.xFt, W.yFt - L.yFt, (W.altAboveFt ?? 0) - (L.altAboveFt ?? 0));
    if (isRejoin && range3DFt < 2000 && target > (L.altAboveFt ?? 0)) {
      target = Math.min(target, (L.altAboveFt ?? 0) - 10);
    }
    if (heightState.activeLeg && t >= heightState.activeLeg.t1 - 1e-9) {
      heightState.activeLeg = null;
      heightState.targetAlt = target;
    }
    const needNewLeg = !heightState.activeLeg
      ? Math.abs(target - W.altAboveFt) > TRACKER.height.minChangeFt
      : Math.abs(target - heightState.targetAlt) > TRACKER.height.minChangeFt;
    if (needNewLeg) {
      const rise = target - W.altAboveFt;
      const defaultRateFtps = isRejoin ? 120 : (ph.tactical ? 45 : 15);
      const rateFloor = (SMOOTHER_PEAK * Math.abs(rise)) / (ph.altRateFtps ?? defaultRateFtps);
      const gFloor = smoothLegSec(rise, TRACKER.height.heightG);
      const vEnergy = rise > 0 ? fullPowerKtps(W.kias, blockFt, W.g ?? 1) / climbCostKtps(W, 1) : 0;
      const energyFloor = vEnergy > 0 ? (SMOOTHER_PEAK * rise) / vEnergy : 0;
      const rawSpan = ph.altSec != null
        ? Math.max(ph.altSec, rateFloor, gFloor, TRACKER.height.minSec)
        : Math.max(
            rateFloor,
            gFloor,
            TRACKER.height.minSec,
            energyFloor
          );
      const span = Math.ceil(rawSpan / STEP_SEC) * STEP_SEC;
      heightState.activeLeg = {
        t0: t,
        t1: t + span,
        fromFt: W.altAboveFt,
        toFt: target,
        ...(ph.dive && target < W.altAboveFt ? { dive: ph.dive } : {}),
        ...(ph.climb && target > W.altAboveFt ? { climb: ph.climb } : {}),
      };
      heightState.targetAlt = target;
      heightState.hasHeightChange = true;
    }
  }

  return { stepProfile: heightState.activeLeg ? [heightState.activeLeg] : undefined };
}

/**
 * Checks whether aircraft #2 is settled within the SMM fighting wing cone volume
 * (500-1,000 ft range, 30-60° sweep, stepped down 0 to 200 ft below Lead, matched speed/rate).
 */
function isFwConeSettled(L, W, relVel, side = null) {
  const rel = relativeTo(L, W);
  const r = Math.hypot(rel.fwd, rel.left);
  const across = Math.abs(rel.left);
  const sweepDeg = (Math.atan2(-rel.fwd, Math.max(across, 1e-6)) * 180) / Math.PI;
  const down = (L.altAboveFt ?? 0) - (W.altAboveFt ?? 0);

  // SMM 12.29 para 69: 500-1,000 ft, 30-60° sweep, stepped down (0 to 200 ft below Lead)
  const inRange = r >= 480 && r <= 1020;
  const inSweep = sweepDeg >= 28 && sweepDeg <= 62;
  const inAlt = down >= -5 && down <= 200;
  const sideOk = side == null || side === 0 || Math.sign(rel.left) === Math.sign(side);

  // Speed, turn rate and relative motion matched in formation frame
  // (In a 30° turn at 200 KIAS, the rigid rotation omega x r is ~41 ft/s, so world relVel is not zero).
  const speedMatched = Math.abs(W.kias - L.kias) <= 12;
  const bankMatched = Math.abs((W.bankDeg ?? 0) - (L.bankDeg ?? 0)) <= 15;

  return inRange && inSweep && inAlt && sideOk && speedMatched && bankMatched;
}

/**
 * Determines whether #2 is in position, settled/steady, and whether the phase has ended.
 */
function isIn(ph, L, W, aim, t, { last, gateOpen, stoppedAt, timesK, early, heightDone = true }) {
  const T = TRACKER;
  const { vpx, vpy, d, arrived } = aim;
  const relVel = Math.hypot(W.tasFtps * Math.cos(W.headingRad) - vpx, W.tasFtps * Math.sin(W.headingRad) - vpy);
  const pursuitResult = early !== undefined ? early : (ph.pursuit && ph.pursuitEnds ? ph.pursuit(L, W, t) : undefined);
  let newStoppedAt = stoppedAt;

  // Native handling for line and canopy-X phases
  if (ph.kind === 'line' || ph.kind === 'ride') {
    if (L && ph.side != null && !ph.allowAcross) {
      const rel = relativeTo(L, W);
      const r = Math.hypot(rel.fwd, rel.left, (W.altAboveFt ?? 0) - (L.altAboveFt ?? 0));
      // Away (TS-174): crossing in behind Lead from the outside of his turn is the rejoin; the check starts on side.
      if (ph.crossIn && !timesK.onSide && rel.left * ph.side >= 0) timesK.onSide = true;
      if ((!ph.crossIn || timesK.onSide) && rel.left * ph.side < -50 && r < 2000) {
        return { abort: true, early: pursuitResult, stoppedAt: newStoppedAt };
      }
    }
    if (arrived && timesK.arrive === null) timesK.arrive = t;
    if (arrived && gateOpen) {
      if (last) return { done: true, early: pursuitResult, stoppedAt: newStoppedAt };
      return { advance: true, early: pursuitResult, stoppedAt: null };
    }
    return {
      abort: false,
      done: false,
      advance: false,
      settled: false,
      startAligning: false,
      early: pursuitResult,
      stoppedAt: newStoppedAt,
      relVel,
    };
  }

  if (ph.isSwitching && ph.isSwitching()) {
    return {
      abort: false,
      done: false,
      advance: false,
      settled: false,
      startAligning: false,
      early: pursuitResult,
      stoppedAt: newStoppedAt,
      relVel,
    };
  }

  const isFwPhase = Boolean(ph.isFw || ph.coneAlt || (ph.goal && !ph.kind));
  const fwSettled = isFwPhase && last && gateOpen && isFwConeSettled(L, W, relVel, ph.side);

  if ((arrived || fwSettled) && timesK.arrive === null && (fwSettled || (d <= (last ? Math.max(ph.finalTol, ph.advanceTol) : ph.advanceTol) && (!last || heightDone)))) timesK.arrive = t;
  // A phase with stopFtps is a real stop: #2 must have stopped on it (relative speed under stopFtps) and held there dwellSec.
  if (ph.stopFtps && arrived && d <= ph.advanceTol && relVel <= ph.stopFtps) newStoppedAt ??= t;
  const stopDone = !ph.stopFtps || (newStoppedAt !== null && t - newStoppedAt >= (ph.dwellSec ?? 0) - 1e-9);
  // A phase flown by its own `pursuit` with `pursuitEnds` (a tracker recipe's held part: echelon-to-fw.js, open-out.js;
  // TS-141) ends when its pursuit says `done` (the last phase then ends the run) and gives up the run on `abort`.
  if (pursuitResult?.abort) return { abort: true, early: pursuitResult, stoppedAt: newStoppedAt };
  const pursuitDone = pursuitResult?.done === true;
  if (pursuitDone) {
    if (last) return { done: true, early: pursuitResult, stoppedAt: newStoppedAt };
    return { advance: true, early: pursuitResult, stoppedAt: null };
  }
  if (!last && arrived && d <= ph.advanceTol && gateOpen && stopDone) {
    return { advance: true, early: pursuitResult, stoppedAt: null };
  }
  const settleVel = ph.settleFtps ?? Math.max(T.settleMinFtps, T.settleShare * ph.finalTol);
  const settled = ((arrived && d <= ph.finalTol && relVel <= settleVel && heightDone) || fwSettled) && last && gateOpen;
  const startAligning = settled && L.free && L.bankDeg === 0;
  return {
    abort: false,
    done: false,
    advance: false,
    settled,
    startAligning,
    early: pursuitResult,
    stoppedAt: newStoppedAt,
    relVel,
  };
}

/** Check if wing aircraft #2 has rolled wings-level and aligned heading/speed with Lead. */
function isAligned(Lafter, W) {
  return Lafter.free && W.bankDeg === 0 && W.rollRateDps === 0 && Math.abs(wrapPi(W.headingRad - Lafter.headingRad)) < TRACKER.alignHeadingRad && W.kias === Lafter.kias;
}

/**
 * Runs the dry run: #2 (wing0) flies the phases in turn, each a slot in the frame of the aircraft it names (`track`, a
 * key of `refs`, recorded flights). For the 2-ship: refs = { [Lead's id]: Lead's recorded flight }. profile: the
 * wingman's height profile (or undefined). A phase with `holdUntil` is not left (nor, the last one, finished) before
 * that formation time: a gate (design section 4: "wait for the one ahead" as a start time). A phase with `world: true`
 * holds its offset in world axes instead of the reference's frame, so the wingman turns with its reference as in an
 * in-place turn. Returns { points: [[bank, kias]…], end: { lead, wing }, times: [{ t0, arrive, t1 }…], maxBankDeg, ok,
 * durationSec, ranges, laneFwdFt, minBelowFt } (ranges and the lane are measured from the aircraft each phase flies off).
 * A phase with `closureFtps` flies the power profile (tuning.js CLOSURE, Patrick 04:58Z, 05:47Z, 05:54Z; clean-up step 2):
 * the closing speed is set and held at the closure rate and stopped from the stopping distance idle (or the slide's bank)
 * gives; the speed loop is the tracker's own (Patrick 06:24Z: test it as is first; the power technique of 06:13Z is the
 * line's, hand-over.js). Each point carries the power it was flown with ([bank, kias, power]) for the tags. Phases without
 * it fly as before (the 4-ship's, until step 3).
 * Since step 2 also: `init` ({ accelKtps }) starts the speed loop at the acceleration the aircraft already has (since
 * step 5 every run starts its heading loop on his present turn and its roll from his bank), so a hand-over from a kinematic
 * line (hand-over.js) has no step in bank or speed; and
 * `stopWhenSettled` ends the run once #2 has settled on the last slot, without waiting for Lead to finish his plan (the
 * first pass of a run whose Lead rolls out once #2 is in).
 * Fighting wing energy with the cone (TS-96): on a phase with `coneAlt` and `closureFtps`, #2's height is flown here, not
 * from `profile`: the speed loop's slowing is taken first as a climb and its speeding up as a descent, inside the cone's
 * height (tuning.js FW_ENERGY), so the power moves only for what the height can't give. The heights flown come back as
 * `heightLeg` (a table leg, flight.js heightAt), for trackTwice to put in the profile.
 * Since step 5 (TS-141) every step goes through the one pilot model (pilot.js: speed from the power at the G flown, one jerk
 * limit, power hysteresis, shaped roll), every point carries its power, and a `pursuit` may also ask for a slowing stage
 * (`slowStage`) and, on a phase with `pursuitEnds`, end the phase (`done`) or give up the run (`abort`). The result also
 * carries the acceleration he ends with (`accelKtps`).
 */
export function runTracker({ refs, wing0, t0, phases, profile, blockFt, maxSec = PLAN_MAX_SEC, init = null, stopWhenSettled = false }) {
  const T = TRACKER;
  const W = copyAircraft(wing0);
  W.climbFtps ??= 0;
  W.altAboveFt ??= 0;
  const points = [];
  const times = phases.map(() => ({ t0: null, arrive: null, t1: null }));
  let k = 0;
  let m = 0; // steps flown
  let t = t0;
  const recOf = (ph) => refs[ph.track ?? Object.keys(refs)[0]];
  let R = recOf(phases[0]);
  const rel0 = relativeTo(R.at(0), W);
  const ref = phases[0].world
    ? { f: W.xFt - R.at(0).xFt, l: W.yFt - R.at(0).yFt, vf: 0, vl: 0 }
    : { f: rel0.fwd, l: rel0.left, vf: 0, vl: 0 };
  // The one pilot model (pilot.js, TS-141): it starts from the aircraft as it is, its bank, roll and (init) acceleration.
  const pilot = createPilot(W, { accelKtps: init?.accelKtps ?? 0 });
  // Every leg starts in motion (the review's report 6.4 C, legs joined on a step; Patrick 05:29Z "stable means controlled,
  // not stopped"): the first commanded heading is its own previous one (no feed-forward kick) and the heading loop starts
  // on the turn he already has; until step 5 only a hand-over (init) started this way.
  const headingState = {
    psiCmdPrev: null,
    omegaFf: (G_FTPS2 * Math.tan((W.bankDeg * Math.PI) / 180)) / Math.max(W.tasFtps, 1),
  };
  const farFromFt = HAND_OVER_FT; // beyond the hand-over range a closure phase may close faster (odd starts only)
  let maxBank = 0;
  let maxG = wing0.g ?? 1;
  let minG = wing0.g ?? 1;
  let minKias = wing0.kias ?? 200;
  let laneFwdFt = -Infinity; // furthest ahead of Lead's 3/9 line inside 1,000 ft (the overshoot lane)
  let minBelowFt = Infinity; // least height under Lead inside 2,000 ft
  let canopyOk = true;
  let stepDownOk = true;
  let laneOk = true;
  let blindSecInside1200 = 0;
  const ranges = [];
  let aligning = false;
  let ok = false;
  let reentered = false; // a phase change re-reads the step it happened in, with no reference turn rate for it
  let stoppedAt = null; // when #2 first came to a stop in a phase with `stopFtps` (a real stop: SMM 12.20 para 45)
  let pclMaxActive = false;
  const heightState = {
    activeLeg: null,
    targetAlt: null,
    cone: null,
    table: { t0, alt: [W.altAboveFt], climb: [W.climbFtps ?? 0], nz: [W.nz ?? 1] },
    hasHeightChange: false,
  };

  const maxSteps = Math.round((Number.isFinite(maxSec) ? maxSec : PLAN_MAX_SEC) / STEP_SEC);
  for (let n = 0; n < maxSteps; n++) {
    // Both aircraft are read at the same instant (the start of the step).
    // A phase with `exitAt` (a time) and `exit` (overrides) flies those overrides from that time on: the fighting wing turn
    // exit once the aircraft flown off rolls out (formation-turns.js fwExit, Fig 12.23).
    const ph = modeOf(phases[k], t);
    const L = R.at(m);
    const Lprev = m > 0 && !reentered ? R.at(m - 1) : null;
    reentered = false;
    if (times[k].t0 === null) {
      times[k].t0 = t;
      pclMaxActive = Boolean(ph.initialPclMax);
    }

    // 1. Aim: target aim point and its velocity in world coordinates
    const aim = aimOf(ph, L, Lprev, ref, W, t);
    const gateOpen = t >= (ph.holdUntil ?? -Infinity) - 1e-9;

    if (pclMaxActive) {
      const onLine = (aim.cross != null && Math.abs(aim.cross) <= (ph.captureFt ?? 150)) ||
                     (aim.bXDeg != null && Math.abs(aim.bearingDeg - aim.bXDeg) <= 5.0);
      const speedCeil = Math.max(235, (ph.lineKias ?? lineKiasNow()) + 15);
      const atSpeed = W.kias >= speedCeil;
      const rNow = Math.hypot(L.xFt - W.xFt, L.yFt - W.yFt);
      const nearLimitFt = (ph.isFw || ph.toFw) ? 1000 : 1500;
      const nearLead = (aim.along != null && aim.along >= 0 && aim.along <= nearLimitFt) || rNow <= nearLimitFt;
      if (onLine || atSpeed || nearLead) {
        pclMaxActive = false;
      }
    }

    let psiCmd;
    let kiasCmd;
    let own = null;
    let bankOwn = null; // a bank a `pursuit` phase commands outright (fw-switch.js, TS-102), else the heading loop's
    let belowOwn = null; // a height below the aircraft flown off a `pursuit` phase asks for (the fighting wing bubble's dive, TS-134)
    let stageOwn = null; // a slowing stage a `pursuit` phase asks for this step (echelon-to-fw.js's idle and the boards), else the phase's
    let stepProfileOwn = null;
    let energyIntentOwn = null;

    if (aligning) {
      psiCmd = L.headingRad;
      kiasCmd = L.kias;
    } else {
      const last = k === phases.length - 1;
      const targetAlt = !ph.coneAlt && ph.slot?.alt != null && Number.isFinite(ph.slot.alt) ? slotAltOf(ph, L, W) : null;
      const heightDone = !heightState.activeLeg && (targetAlt == null || Math.abs(targetAlt - W.altAboveFt) <= TRACKER.height.minChangeFt);

      // 5. In position, settled/steady, and phase completion
      const inPos = isIn(ph, L, W, aim, t, { last, gateOpen, stoppedAt, timesK: times[k], heightDone });
      stoppedAt = inPos.stoppedAt;
      if (inPos.abort) break;
      if (inPos.done) {
        times[k].t1 = t;
        ok = true;
        break;
      }
      if (inPos.advance) {
        stoppedAt = null;
        times[k].t1 = t;
        headingState.psiCmdPrev = null;
        k++;
        const next = phases[k];
        const R2 = recOf(next);
        if (ph.kind === 'line' || ph.kind === 'ride') {
          const L2 = R2.at(m);
          const relNow = relativeTo(L2, W);
          Object.assign(ref, { f: relNow.fwd, l: relNow.left, vf: 0, vl: 0 });
        } else if (R2 !== R || Boolean(next.world) !== Boolean(ph.world)) {
          // A new reference: the same point in the world, now carried by the other aircraft (or in world axes).
          const L2 = R2.at(m);
          const L2prev = m > 0 ? R2.at(m - 1) : null;
          const rx = aim.px - L2.xFt;
          const ry = aim.py - L2.yFt;
          if (next.world) {
            Object.assign(ref, { f: rx, l: ry, vf: aim.vpx - L2.tasFtps * Math.cos(L2.headingRad), vl: aim.vpy - L2.tasFtps * Math.sin(L2.headingRad) });
          } else {
            const f2 = unit(L2.headingRad);
            const omega2 = L2prev ? wrapPi(L2.headingRad - L2prev.headingRad) / STEP_SEC : 0;
            const ownX = aim.vpx - (L2.tasFtps * f2.x - omega2 * ry);
            const ownY = aim.vpy - (L2.tasFtps * f2.y + omega2 * rx);
            Object.assign(ref, { f: rx * f2.x + ry * f2.y, l: -rx * f2.y + ry * f2.x, vf: ownX * f2.x + ownY * f2.y, vl: -ownX * f2.y + ownY * f2.x });
          }
          R = R2;
        }
        reentered = true;
        continue; // re-enter this step with the next phase (nothing has moved for #2 yet)
      }
      if (inPos.settled && stopWhenSettled) {
        times[k].t1 = t;
        ok = true;
        break;
      }
      if (inPos.startAligning) {
        times[k].t1 = t;
        aligning = true;
      }

      // A phase with `pursuit` (fw-pursuit.js, TS-100) commands its own heading and speed each step; the bank and speed loops
      // below fly it. Null hands the step back to the slot law.
      // One with keepBase asks only for a height (belowFt) and leaves the steering to the slot law.
      const asked = inPos.early !== undefined ? inPos.early : ph.pursuit ? ph.pursuit(L, W, t) : null;
      belowOwn = asked?.belowFt ?? null;
      own = asked?.keepBase ? null : asked;
      stageOwn = own?.slowStage ?? null;
      stepProfileOwn = own?.stepProfile ?? null;
      energyIntentOwn = pclMaxActive ? 'gain' : (own?.energyIntent ?? ph.energyIntent ?? null);

      if (own) {
        psiCmd = own.psiCmd;
        kiasCmd = own.kiasCmd ?? (own.aCmd != null ? W.kias + own.aCmd * STEP_SEC : W.kias);
        bankOwn = own.bankDeg ?? null;
      } else {
        // 2. Closure: commanded closing speed and slot-law steering
        const closure = closureOf(ph, L, W, aim, blockFt, farFromFt, pclMaxActive);
        psiCmd = closure.psiCmd;
        kiasCmd = closure.kiasCmd;
      }
    }

    // 3. Heading and bank: the heading error loop with feed-forward
    const bank = headingBank(ph, psiCmd, W, aligning, bankOwn, headingState, L, aim, blockFt);
    heightState.onLine = Boolean(aim?.established);

    // 4. Power: speed loop, jerk limit, energy intent
    const power = powerOf(ph, pilot, W, L, kiasCmd, {
      blockFt, aligning, stageOwn, belowOwn, cone: heightState.cone,
      energyIntent: energyIntentOwn,
      heightState,
      t,
      aCmdOwn: own?.aCmd ?? null,
    });
    const kias = power.kias;

    // 5. Height: explicit profile, cone energy, or slot altitude evolution
    const height = heightOf(ph, L, W, STEP_SEC, profile, {
      blockFt, belowOwn, t, accel: power.accel, zoomFtps: power.zoomFtps, heightState,
    });

    const stepProfile = stepProfileOwn ?? height.stepProfile ?? (heightState.activeLeg ? [heightState.activeLeg] : profile);
    const flown = pilotFly(pilot, W, bank, t, stepProfile, power.accel);
    heightState.table.alt.push(W.altAboveFt);
    heightState.table.climb.push(W.climbFtps);
    heightState.table.nz.push(W.nz);

    points.push([flown, W.kias, pilotPower(pilot, W, blockFt, t), power.accel]);
    m++;
    const Lafter = R.at(m);
    maxBank = Math.max(maxBank, Math.abs(W.bankDeg));
    maxG = Math.max(maxG, W.g ?? 1);
    minG = Math.min(minG, W.g ?? 1);
    minKias = Math.min(minKias, W.kias);
    const after = relativeTo(Lafter, W);
    const range = Math.hypot(after.fwd, after.left);
    ranges.push(range);
    if (range < T.laneRangeFt) {
      laneFwdFt = Math.max(laneFwdFt, after.fwd);
      if (after.fwd > 0) laneOk = false;
    }
    const dz = (W.altAboveFt ?? 0) - (Lafter.altAboveFt ?? 0);
    const range3D = Math.hypot(Lafter.xFt - W.xFt, Lafter.yFt - W.yFt, dz);
    const isRejoin = Boolean(ph.rejoin || ph.rejoinKind === 'into' || ph.rejoinKind === 'straight');
    if (isRejoin && range3D < T.belowRangeFt) {
      minBelowFt = Math.min(minBelowFt, -dz);
      if (dz > 5.0) stepDownOk = false; // inside 2,000 ft step-down gate
    }

    // Doctrinal canopy line-of-sight check (SMM 12.24 & 16.20)
    const inCanopy = isLeadInCanopy(Lafter, W);
    if (!inCanopy) {
      if (range3D < 1200) {
        blindSecInside1200 += STEP_SEC;
        if (isRejoin) canopyOk = false; // inside 1,200 ft canopy "X" lock violated
      }
    }
    t += STEP_SEC;

    const heightDoneNow = !heightState.activeLeg || t >= heightState.activeLeg.t1 - 1e-9;
    if (aligning && isAligned(Lafter, W) && heightDoneNow) {
      ok = true;
      break;
    }
  }
  const hasExplicit = Boolean(profile && (!Array.isArray(profile) || profile.length > 0));
  const coneLeg = heightState.cone && {
    t0: heightState.cone.t0,
    t1: heightState.cone.t0 + (heightState.cone.alt.length - 1) * STEP_SEC,
    fromFt: heightState.cone.alt[0],
    toFt: heightState.cone.alt[heightState.cone.alt.length - 1],
    table: { dt: STEP_SEC, alt: heightState.cone.alt, climb: heightState.cone.climb, nz: heightState.cone.nz },
  };
  // The rejoin line's depth law (slopedAlt) is flown ahead of any explicit profile, so the run's own heights are what the
  // plan records then; until V2.232 the explicit profile was recorded and the flight held 50 ft below Lead to the hold.
  const tableLeg = (!hasExplicit || heightState.sloped) && heightState.hasHeightChange && heightState.table && heightState.table.alt.length > 1 && {
    t0: heightState.table.t0,
    t1: heightState.table.t0 + (heightState.table.alt.length - 1) * STEP_SEC,
    fromFt: heightState.table.alt[0],
    toFt: heightState.table.alt[heightState.table.alt.length - 1],
    table: { dt: STEP_SEC, alt: heightState.table.alt, climb: heightState.table.climb, nz: heightState.table.nz },
  };
  const heightLeg = hasExplicit && !heightState.sloped ? coneLeg : (tableLeg || coneLeg || null);
  return {
    points,
    end: { lead: { ...R.at(m) }, wing: W },
    times,
    maxBankDeg: maxBank,
    maxG,
    minG,
    minKias,
    ok,
    durationSec: t - t0,
    ranges,
    laneFwdFt,
    minBelowFt,
    heightLeg,
    profile: profile ?? null,
    accelKtps: pilot.accel,
    canopyOk,
    stepDownOk,
    laneOk,
    blindSecInside1200,
    doctrinalOk: canopyOk && stepDownOk && laneOk,
    rideEstablished: ref.ride?.established || false, establishedRange: ref.ride?.establishedRange,
  };
}

/**
 * One leg for the tracker: chase `slot` (in the frame of the aircraft the leg names in `track`, or Lead) with
 * tuning.js TRACKER.phase's settings, changed by `over` (the leg recipes in recipes.js, four-close.js and
 * formation-turns.js). Fields beyond those: altSec, altRateFtps, stopFtps, dwellSec (below), goal, goalTolFt, holdUntil,
 * world, track (runTracker).
 */
export function phase(slot, over = {}) {
  return {
    slot,
    ...TRACKER.phase,
    altSec: null, // seconds over which the height changes (null: the whole leg)
    altRateFtps: null, // when set, the height change takes at least |change| / this many seconds (the 4-ship's stack; null: no floor)
    stopFtps: null, // when set, a real stop: the next phase starts only once #2's speed against the slot is under this...
    dwellSec: 0, // ...and has been for this long (the station change's "stabilize", SMM 12.20 para 45)
    dive: null, // { inG, outG }: a descent flown as a big dive, rolled inverted to pull down (flight.js diveShape; TS-129)
    closureFtps: null, // when set, the power profile at this closure rate (runTracker; the 2-ship since step 2)
    ...over,
  };
}

/**
 * The tracker run (previously two passes, now a single pass where #2's height is flown in the same pass
 * as bank and speed). Returns { run, profile }.
 */
export function trackTwice({ refs, wing0, t0, phases, profile, blockFt, maxSec = PLAN_MAX_SEC, init = null, stopWhenSettled = false }) {
  const run = runTracker({ refs, wing0, t0, phases, profile, blockFt, maxSec, init, stopWhenSettled });
  return { run, profile: run.heightLeg ? [run.heightLeg, ...(run.profile ?? [])] : (run.profile ?? []) };
}
