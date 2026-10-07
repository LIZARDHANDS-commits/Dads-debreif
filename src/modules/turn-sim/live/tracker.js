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
import { G_FTPS2 } from '../../../core/units.js';
import { STEP_SEC, copyAircraft, smoothLegSec, heightAt, SMOOTHER_PEAK } from './flight.js';
import { relativeTo, unit } from './manoeuvres.js';
import { fullPowerKtps, slowKtps } from './slow-down.js';
import { throttleAtTorque } from './power.js';
import { TRACKER, CLOSURE, HAND_OVER_FT, FW_ENERGY, FW_BUBBLE, REJOIN } from './tuning.js';
import { setKias, stepCommanded, climbCostKtps, createPilot, pilotSpeed, pilotFly, pilotPower, coneUpFtNow } from './pilot.js';
import { isLeadInCanopy, checkDoctrinalInvariants } from '../../../core/canopy.js';
import { liftTowardAim, gAndBankForLift } from '../../../core/point-mass.js';

// The one pilot model's step (pilot.js, clean-up step 5, TS-141) is used here and re-exported for the files that read it from here.
export { setKias, stepCommanded, climbCostKtps, isLeadInCanopy, checkDoctrinalInvariants };

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
 * Calculates the target aim point and its velocity in world coordinates (refPoint plus phase goal,
 * rate-limited reference slide, and separation distance).
 */
function aimOf(ph, L, Lprev, ref, W, t) {
  const T = TRACKER;
  const GAIN = T.gain;
  // The reference slot moves toward the phase's slot at the phase's rates. A phase with a `goal` (a goal-seeking phase,
  // the fighting wing turns of TS-55) works out its slot afresh every step from where Lead and #2 are.
  const slot = ph.goal ? ph.goal(L, W, t) : ph.slot;
  for (const [axis, v, target, rate] of [['f', 'vf', slot.fwd, ph.fwdRate], ['l', 'vl', slot.left, ph.latRate]]) {
    if (!Number.isFinite(rate)) {
      ref[axis] = target;
      ref[v] = 0;
    } else {
      const want = Math.max(-rate, Math.min(rate, GAIN.refRate * (target - ref[axis])));
      const step = rate * T.refAccelShare * STEP_SEC;
      ref[v] += Math.max(-step, Math.min(step, want - ref[v]));
      ref[axis] += ref[v] * STEP_SEC;
      if (Math.abs(target - ref[axis]) < T.snapFt) ref[axis] = target;
    }
  }
  const arrived = ph.goal ? Math.hypot(ref.f - slot.fwd, ref.l - slot.left) < (ph.goalTolFt ?? T.goalTolFt) : ref.f === ph.slot.fwd && ref.l === ph.slot.left;

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
function closureOf(ph, L, W, aim, blockFt, farFromFt = HAND_OVER_FT) {
  const T = TRACKER;
  const GAIN = T.gain;
  const { ex, ey, d, vpx, vpy } = aim;
  const ratio = W.tasFtps / W.kias;
  let pullX;
  let pullY;
  if (ph.closureFtps) {
    // The closure, dying away near the slot in proportion to the distance: fore and aft at the tracker's own position
    // gain (power is the slow axis), sideways at CLOSURE.nearGain (bank is quick). One gain of 1/s on both left #2
    // hunting about 20 ft fore and aft of the slot, never settling (V2.22-V2.23: the refusals Patrick saw 5 Oct 07:06Z).
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
  // A closure phase may be faster or slower than the aircraft flown off by the closure rate (it replaces the 15 KIAS
  // rejoin overtake, Patrick 05:46Z).
  const over = ph.closureFtps ? ph.closureFtps / ratio : ph.overtakeKias;
  const under = ph.closureFtps ? ph.closureFtps / ratio : ph.undertakeKias;
  // Centred on the reference point's own speed, not Lead's: in a turn a place inside it moves slower than Lead and one
  // outside faster, so holding it takes none of the closure (the review, V2.65); in straight flight the two are the same.
  const refKias = Math.hypot(vpx, vpy) / ratio;
  const kiasCmd = Math.max(refKias - under, Math.min(refKias + over, speed / ratio));
  return { pullX, pullY, vdx, vdy, speed, psiCmd, kiasCmd };
}

/**
 * Heading loop: turn rate toward the commanded heading, with its own rate fed forward; bank from the turn rate.
 */
function headingBank(ph, psiCmd, W, aligning, bankOwn, headingState) {
  const T = TRACKER;
  const GAIN = T.gain;
  if (headingState.psiCmdPrev === null) headingState.psiCmdPrev = psiCmd;
  const psiStep = wrapPi(psiCmd - headingState.psiCmdPrev);
  headingState.psiCmdPrev = psiCmd;
  headingState.omegaFf += GAIN.ffFilter * (psiStep / STEP_SEC - headingState.omegaFf);
  // A phase with `feedForward: false` (the fighting wing turn exit, formation-turns.js fwExit) steers on the heading error alone:
  // as Lead rolls out the turn of the place #2 flies to dies away, and fed forward it rolled #2 past his heading and back.
  const omegaCmd = GAIN.heading * wrapPi(psiCmd - W.headingRad) + (ph.feedForward === false ? 0 : headingState.omegaFf);
  const cap = aligning ? ph.alignBankDeg ?? T.alignBankDeg : ph.bankCapDeg;
  let bank = Math.max(-cap, Math.min(cap, bankDegFromTurnRate(W.tasFtps, omegaCmd)));
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
  const up = Math.max(0, L.altAboveFt + coneUpFtNow() - W.altAboveFt);
  return Math.min(FW_BUBBLE.diveFtps, Math.sqrt(2 * FW_BUBBLE.pullFtps2 * up));
}

/**
 * Speed loop: acceleration follows the speed error; the one pilot model (pilot.js, TS-141) holds it to what the T-6 gives
 * at the G he pulls (full power up, power back down: slow-down.js, TS-61) and builds it up at the one jerk limit.
 * Returns { kias, zoomFtps, accel }.
 */
function powerOf(ph, pilot, W, L, kiasCmd, { blockFt, aligning, stageOwn, belowOwn, cone, aCmdOwn, floorThrOwn, extraSlowKtpsOwn, energyIntent, heightState = null, t = 0 }) {
  const T = TRACKER;
  const GAIN = T.gain;
  // A phase may slow with more than power back (slowStage, slow-down.js; the turning rejoin's run-in: power back and the
  // speed brake, card 03:33Z rule 4: "torque and speed brake first").
  // A rejoin's leg slows with its torque floor and the boards as needed (Patrick 6 Oct 03:17-03:20Z, TS-108).
  const rejoinLeg = ph.rejoin || ph.slowStage === 'boards';
  const floorThr = floorThrOwn ?? (rejoinLeg ? throttleAtTorque(REJOIN.floorTorquePct, W.kias, blockFt) : 0);
  const slowStage = stageOwn ?? ph.slowStage ?? (ph.rejoin ? 'boards' : 'power');
  // The climb he is flying costs speed and a descent gives it (standard energy, dV/dt = g (T - D) / W - g sin(climb
  // angle): climbCostKtps), so the engine's range is shifted by it: climbing at MAX he slows (Patrick 6 Oct 05:00Z: "This
  // climb is unrealistic to not lose speed on"; until V2.124 the height was flown free and only the power read showed it).
  // Not on fighting wing's cone energy (TS-96, below), which picks the climb from the speed change and so already counts it.
  const energy = cone || (ph.coneAlt && (ph.closureFtps || ph.coneEnergy));
  const climbKtps = energy ? 0 : climbCostKtps(W, W.climbFtps ?? 0);
  // Fighting wing soaks up extra speed with the cone (Patrick 6 Oct 16:58Z: "Settle high at the top of the cone to soak up
  // the extra speed. we can ALWAYS use the cone to soak up speed"): while there is room above, a zoom up to FW_BUBBLE's
  // climb rate slows him beyond what power back gives (standard energy, climbCostKtps); the climb itself is flown below.
  const zoomFtps = energy && belowOwn == null ? zoomRoomFtps(L, W) : 0;
  const extraSlowKtps = extraSlowKtpsOwn ?? (zoomFtps > 0 ? climbCostKtps(W, zoomFtps) : 0);
  const aWant = aCmdOwn != null
    ? aCmdOwn
    : (energyIntent === 'gain' ? Infinity : GAIN.speedLoop * (kiasCmd - W.kias));
  // Lining up, the last few thousandths of a knot are taken out at once (snapKias), so the speed has no step.
  const accel = pilotSpeed(pilot, W, aWant, {
    blockFt, top: slowStage, floorThr, climbKtps, extraSlowKtps, snapKias: aligning ? L.kias : null, snapTol: T.kiasSnap,
  });
  return { kias: W.kias + accel * STEP_SEC, zoomFtps, accel };
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
  // 1. Fighting wing energy with the cone (TS-96): the climb that gives the slowing the speed loop flies (or the descent that
  // gives its speeding up), inside the cone's height above or below Lead, eased in and out at FW_ENERGY.pullFtps2.
  if (heightState.cone || (ph.coneAlt && (ph.closureFtps || ph.coneEnergy)) || belowOwn != null) {
    const E = FW_ENERGY;
    const v0 = W.climbFtps ?? 0;
    heightState.cone ??= { t0: t, alt: [W.altAboveFt], climb: [v0], nz: [1] };
    const perFtps = climbCostKtps(W, 1);
    const want = ph.coneAlt ? -accel / perFtps : 0;
    const coneUpFt = coneUpFtNow(); // the share of the cone's height his experience uses (rates.js EXPERIENCE, TS-141)
    const isRejoin = Boolean(ph.rejoin || ph.rejoinKind === 'into' || ph.rejoinKind === 'straight');
    const range3DFt = Math.hypot(W.xFt - L.xFt, W.yFt - L.yFt, (W.altAboveFt ?? 0) - (L.altAboveFt ?? 0));
    const topFt = isRejoin && range3DFt < 2000 ? Math.min((L.altAboveFt ?? 0) - 10, (L.altAboveFt ?? 0) + coneUpFt) : (L.altAboveFt ?? 0) + coneUpFt;
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
    const zoom = range3DFt >= 2000 && belowOwn == null && want > hi && zoomFtps > hi;
    let wantV = belowOwn != null ? toward(L.altAboveFt - belowOwn) : W.altAboveFt > topFt ? toward(topFt) : W.altAboveFt < bottomFt ? toward(bottomFt) : Math.max(lo, Math.min(zoom ? zoomFtps : hi, want));
    // Step-Down Gate (SMM 12.24 & 16.20): inside 2,000 ft, Wing must not climb above Lead during a rejoin.
    if (isRejoin && range3DFt < 2000 && W.altAboveFt >= (L.altAboveFt ?? 0)) {
      wantV = Math.min(wantV, toward((L.altAboveFt ?? 0) - 10));
    }
    const pull = quick || zoom ? D.pullFtps2 : E.pullFtps2;
    const v1 = v0 + Math.max(-pull * dt, Math.min(pull * dt, wantV - v0));
    const nz = 1 + (v1 - v0) / dt / G_FTPS2;
    const a1 = W.altAboveFt + ((v0 + v1) / 2) * dt;
    heightState.cone.alt.push(a1);
    heightState.cone.climb.push(v1);
    heightState.cone.nz.push(nz);
    heightState.hasHeightChange = true;
    return { stepProfile: [{ t0: t, t1: t + dt, table: { dt, alt: [W.altAboveFt, a1], climb: [v0, v1], nz: [nz, nz] } }] };
  }

  // 2. Caller's explicit profile takes precedence over internal height calculations.
  const hasExplicit = Boolean(profile && (!Array.isArray(profile) || profile.length > 0));
  if (hasExplicit) {
    return { stepProfile: profile };
  }

  // 3. Single-pass altitude evolution toward phase slot target (ph.slot.alt).
  if (ph.coneAlt) {
    return { stepProfile: undefined };
  }
  let target = ph.slot?.alt;
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
      const gFloor = smoothLegSec(rise, TRACKER.height.heightG);
      const vEnergy = rise > 0 ? fullPowerKtps(W.kias, blockFt, W.g ?? 1) / climbCostKtps(W, 1) : 0;
      const energyFloor = vEnergy > 0 ? (SMOOTHER_PEAK * rise) / vEnergy : 0;
      const rawSpan = ph.altSec != null
        ? Math.max(ph.altSec, ph.altRateFtps ? Math.abs(rise) / ph.altRateFtps : 0, gFloor, TRACKER.height.minSec)
        : Math.max(
            ph.altRateFtps ? Math.abs(rise) / ph.altRateFtps : 0,
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
 * Determines whether #2 is in position, settled/steady, and whether the phase has ended.
 */
function isIn(ph, L, W, aim, t, { last, gateOpen, stoppedAt, timesK, early, heightDone = true }) {
  const T = TRACKER;
  const { vpx, vpy, d, arrived } = aim;
  // Phase bookkeeping: advance when close enough, finish when settled and the reference has finished its own plan.
  const relVel = Math.hypot(W.tasFtps * Math.cos(W.headingRad) - vpx, W.tasFtps * Math.sin(W.headingRad) - vpy);
  if (arrived && timesK.arrive === null && d <= (last ? Math.max(ph.finalTol, ph.advanceTol) : ph.advanceTol) && (!last || heightDone)) timesK.arrive = t;
  // A phase with stopFtps is a real stop: #2 must have stopped on it (relative speed under stopFtps) and held there dwellSec.
  let newStoppedAt = stoppedAt;
  if (ph.stopFtps && arrived && d <= ph.advanceTol && relVel <= ph.stopFtps) newStoppedAt ??= t;
  const stopDone = !ph.stopFtps || (newStoppedAt !== null && t - newStoppedAt >= (ph.dwellSec ?? 0) - 1e-9);
  // A phase flown by its own `pursuit` with `pursuitEnds` (a tracker recipe's held part: echelon-to-fw.js, open-out.js;
  // TS-141) ends when its pursuit says `done` (the last phase then ends the run) and gives up the run on `abort`.
  const pursuitResult = early !== undefined ? early : (ph.pursuit && ph.pursuitEnds ? ph.pursuit(L, W, t) : undefined);
  if (pursuitResult?.abort) return { abort: true, early: pursuitResult, stoppedAt: newStoppedAt };
  const pursuitDone = pursuitResult?.done === true;
  if (pursuitDone) {
    if (last) return { done: true, early: pursuitResult, stoppedAt: newStoppedAt };
    return { advance: true, early: pursuitResult, stoppedAt: null };
  }
  if (!last && arrived && d <= ph.advanceTol && gateOpen && stopDone) {
    return { advance: true, early: pursuitResult, stoppedAt: null };
  }
  const settled = arrived && last && gateOpen && d <= ph.finalTol && relVel <= Math.max(T.settleMinFtps, T.settleShare * ph.finalTol) && heightDone;
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
  let blindSecOpenArena = 0;
  const ranges = [];
  let aligning = false;
  let ok = false;
  let reentered = false; // a phase change re-reads the step it happened in, with no reference turn rate for it
  let stoppedAt = null; // when #2 first came to a stop in a phase with `stopFtps` (a real stop: SMM 12.20 para 45)
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
    if (times[k].t0 === null) times[k].t0 = t;

    // 1. Aim: target aim point and its velocity in world coordinates
    const aim = aimOf(ph, L, Lprev, ref, W, t);
    const gateOpen = t >= (ph.holdUntil ?? -Infinity) - 1e-9;

    let psiCmd;
    let kiasCmd;
    let bankOwn = null; // a bank a `pursuit` phase commands outright (fw-switch.js, TS-102), else the heading loop's
    let belowOwn = null; // a height below the aircraft flown off a `pursuit` phase asks for (the fighting wing bubble's dive, TS-134)
    let stageOwn = null; // a slowing stage a `pursuit` phase asks for this step (echelon-to-fw.js's idle and the boards), else the phase's
    let aCmdOwn = null;
    let floorThrOwn = null;
    let extraSlowKtpsOwn = null;
    let stepProfileOwn = null;
    let energyIntentOwn = null;

    if (aligning) {
      psiCmd = L.headingRad;
      kiasCmd = L.kias;
    } else {
      const last = k === phases.length - 1;
      const targetAlt = !ph.coneAlt && ph.slot?.alt != null && Number.isFinite(ph.slot.alt) ? ph.slot.alt : null;
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
        k++;
        const next = phases[k];
        const R2 = recOf(next);
        if (R2 !== R || Boolean(next.world) !== Boolean(ph.world)) {
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
      const own = asked?.keepBase ? null : asked;
      stageOwn = own?.slowStage ?? null;
      aCmdOwn = own?.aCmd ?? null;
      floorThrOwn = own?.floorThr ?? null;
      extraSlowKtpsOwn = own?.extraSlowKtps ?? null;
      stepProfileOwn = own?.stepProfile ?? null;
      energyIntentOwn = own?.energyIntent ?? ph.energyIntent ?? null;

      if (own) {
        psiCmd = own.psiCmd;
        kiasCmd = own.kiasCmd;
        bankOwn = own.bankDeg ?? null;
      } else {
        // 2. Closure: commanded closing speed and slot-law steering
        const closure = closureOf(ph, L, W, aim, blockFt, farFromFt);
        psiCmd = closure.psiCmd;
        kiasCmd = closure.kiasCmd;
      }
    }

    // 3. Heading and bank: 3D lift law or 2D heading error loop with feed-forward
    let bank;
    if (ph.use3D) {
      const aim3D = aimLiftVector(W, aim, T.gain.heading);
      bank = bankOwn ?? aim3D.bankDeg;
    } else {
      bank = headingBank(ph, psiCmd, W, aligning, bankOwn, headingState);
    }

    // 4. Power: speed loop, jerk limit, energy intent
    const power = powerOf(ph, pilot, W, L, kiasCmd, {
      blockFt, aligning, stageOwn, belowOwn, cone: heightState.cone,
      aCmdOwn: aligning ? null : aCmdOwn,
      floorThrOwn,
      extraSlowKtpsOwn,
      energyIntent: energyIntentOwn,
      heightState,
      t,
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
      } else if (range3D >= 2000) {
        blindSecOpenArena += STEP_SEC;
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
  const tableLeg = !hasExplicit && heightState.hasHeightChange && heightState.table && heightState.table.alt.length > 1 && {
    t0: heightState.table.t0,
    t1: heightState.table.t0 + (heightState.table.alt.length - 1) * STEP_SEC,
    fromFt: heightState.table.alt[0],
    toFt: heightState.table.alt[heightState.table.alt.length - 1],
    table: { dt: STEP_SEC, alt: heightState.table.alt, climb: heightState.table.climb, nz: heightState.table.nz },
  };
  const heightLeg = hasExplicit ? coneLeg : (tableLeg || coneLeg || null);
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
    blindSecOpenArena,
    doctrinalOk: canopyOk && stepDownOk && laneOk,
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

/** #2's height: from where it is, smooth legs to each leg's slot height (smootherstep, no climb rate at the ends: spec F7, F12). */
export function heightProfile(alt0, phases, times, t0) {
  const legs = [];
  let alt = alt0;
  let from = t0;
  phases.forEach((ph, i) => {
    // In fighting wing his height is his own anywhere in the cone (Patrick 08:58Z); on the power profile the tracker flies
    // it with the cone's energy (TS-96).
    if (ph.coneAlt) return;
    const target = ph.slot.alt;
    const start = Math.max(times[i].t0 ?? from, from);
    const end = times[i].t1 ?? start + TRACKER.height.unknownLegSec;
    if (Math.abs(target - alt) > TRACKER.height.minChangeFt) {
      // No quicker than the leg's own rate, or else one smooth leg within TRACKER.height.heightG (TS-140) (Patrick 6 Oct 05:00Z: a 2,000 ft climb in
      // 10 s, about 12,000 ft/min, from low in line abreast; no floor until V2.124).
      const floor = ph.altRateFtps ? Math.abs(target - alt) / ph.altRateFtps : smoothLegSec(target - alt, TRACKER.height.heightG);
      const t1 = Math.max(ph.altSec ? start + ph.altSec : end, start + TRACKER.height.minSec, start + floor);
      legs.push({ t0: start, t1, fromFt: alt, toFt: target, ...(ph.dive && target < alt ? { dive: ph.dive } : {}) });
      alt = target;
      from = t1;
    }
  });
  return legs;
}
