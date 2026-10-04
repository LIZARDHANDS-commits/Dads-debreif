// One Energy-fight aircraft: making it, its readouts, and one step of it through the limits and core's
// point-mass step. The aircraft maths is core's (t6-performance.js, point-mass.js); this file applies the
// limits and keeps the readouts. Nothing here works out drag, thrust or the stall line itself.
import { KT_TO_FTPS, G_FTPS2 } from '../../../core/units.js';
import { wrapPi, degToRad, radToDeg } from '../../../core/angles.js';
import { T6A_LIMITS, stallLimitG, tasToIasKt, t6aExcessFn, thrustPerWeight, dragPerWeight, energyHeightFt } from '../../../core/t6-performance.js';
import { stepPointMass, pointMassState, pointMassFlight } from '../../../core/point-mass.js';
import { rollToward } from '../../../core/flight-math.js';
import { MPT_WITHIN_KT, TUNING, shakerG, round, belowStallText } from './setup.js';
import { scale, unit, clamp, velOf, physicalBankDeg } from './frame.js';
import { controlFor, isRolling } from './moves/index.js';
import { handOver, reconsiderInMpt } from './pilot.js';
import { smoothInputs } from './smoothing.js';

/** (thrust − drag) ÷ weight at a throttle: 1 is maximum power, through core's function; less scales the thrust only. */
export function excessFnFor(throttle) {
  if (throttle === 1) return t6aExcessFn;
  return (ktas, altFt, g) => {
    const kias = tasToIasKt(ktas, altFt);
    return throttle * thrustPerWeight(kias, altFt) - dragPerWeight(kias, altFt, g);
  };
}

export function newAircraft(who, pose, p, kias, forceG) {
  const pm = pointMassState({ x: pose.x, y: pose.y, altFt: pose.z, ktas: pose.ktas, headingRad: pose.headingRad });
  const ac = {
    who, pm, mergeKias: kias,
    xFt: pose.x, yFt: pose.y, zFt: pose.z, altFt: pose.z, headingRad: pose.headingRad,
    bankRad: 0,
    turnDir: 0, towardDir: 0,
    move: 'pending', moveLabel: '', why: '',
    throttle: 1,
    mptReached: false, toMptSec: 0, toMptDeg: 0,
    overG: false, overGReason: '', overGEver: false,
    stall: false, stallReason: '', stallEver: false,
    collided: false,
    deconflicting: false,
    onShaker: false, chaseLimited: false, aim: null,
    rolling: false, rollDegPerSec: 0,
    ctl: { mode: 'pending', forceG: forceG ?? null, stallTimer: 0, stallCond: false, prevKias: kias, kiasRateEff: 0, mptEvalTimer: 0, lockoutTimer: 0, mptTurnDeg: 0, wezTrackSec: 0 },
  };
  readOut(ac, 1, 1, p);
  readSlow(ac, p);
  return ac;
}

/** Copies the point-mass state and the performance numbers a screen reads into the aircraft. A dry run (`display` false) skips the two that only a screen reads, specific power and energy height. */
export function readOut(ac, g, throttle, p, shaker = null, display = true) {
  const f = pointMassFlight(ac.pm);
  const kias = tasToIasKt(f.ktas, f.altFt);
  ac.xFt = ac.pm.x; ac.yFt = ac.pm.y; ac.zFt = ac.pm.z; ac.altFt = ac.pm.z;
  ac.headingRad = f.headingRad;
  ac.kias = kias;
  ac.ktas = f.ktas;
  ac.climbDeg = radToDeg(f.climbRad);
  ac.g = g;
  ac.throttle = throttle;
  ac.bankDeg = physicalBankDeg(ac.pm, ac.bankRad, ac.turnDir || 1);
  ac.inverted = Math.abs(ac.bankDeg) > 90;
  ac.shakerG = shaker ?? shakerG(kias, p);
  if (!display) return;
  const excess = excessFnFor(throttle)(f.ktas, f.altFt, Math.max(g, 0));
  ac.psFtps = f.ktas * KT_TO_FTPS * excess;
  ac.energyHeightFt = energyHeightFt(f.altFt, f.ktas);
}


/** A G to one decimal, or as many as it takes to tell it from `other` ("5.50 G against 5.49 G", never "5.5 G against 5.5 G"). */
function gText(g, other) {
  return g.toFixed(g.toFixed(1) === other.toFixed(1) ? 2 : 1);
}

/**
 * (thrust − drag) ÷ weight for a tumbling wreck: no thrust, and a bluff-body drag of 0.00052 × density ratio × V² ft/s²
 * (V in ft/s). The 0.00052 is an estimate with no source, kept from the first tumble (TF-Q10, for Dad to check).
 */
function tumbleExcess(ktas, altFt) {
  const v = ktas * KT_TO_FTPS;
  const sqrtSigma = tasToIasKt(1, altFt); // core's IAS from TAS gives the square root of the density ratio
  return -(0.00052 * sqrtSigma * sqrtSigma * v * v) / G_FTPS2;
}

/** The point-mass state's speed, heading and climb, in pointMassState's terms. */
function flightOf(pm) {
  const f = pointMassFlight(pm);
  return { ktas: f.ktas, headingRad: f.headingRad, climbRad: f.climbRad };
}

/**
 * One aircraft, one step: the pilot's hand-over, the move's controller, the smoothing layer, then the limits (forced G,
 * shaker, STALL, roll rate, OVER G), the point-mass step and the readouts. After a collision the aircraft tumbles instead.
 */
export function stepAircraft(state, ac, other, d) {
  if (ac.tumble) {
    // After a mid-air collision: no lift, no thrust, a tumbling wreck's drag, through the same point-mass step as every
    // other flight (TF-57 PR 2). The roll spins at the tumble rate for the views; heading and climb are the path's.
    if (!ac.pm.up) ac.pm = { ...ac.pm, up: pointMassState({ x: 0, y: 0, altFt: 0, ...flightOf(ac.pm) }).up };
    ac.bankRad = wrapPi(ac.bankRad + degToRad(ac.tumble.pDegPerSec) * d);
    ac.pm = stepPointMass(ac.pm, { g: 0, bankRad: ac.bankRad }, d, tumbleExcess);
    readOut(ac, 0, 0, state.setup, null, !state.dry);
    if (ac.altFt <= 0) {
      ac.altFt = 0;
      ac.pm.z = 0;
      ac.zFt = 0;
      state.stopped = true;
      ac.why = 'Impact: Hull loss at terrain (0 ft MSL)';
    }
    return;
  }

  const p = state.setup;
  const c = ac.ctl;
  const f = pointMassFlight(ac.pm);
  const kias = tasToIasKt(f.ktas, f.altFt);

  // The speed's rate, smoothed a little so a single step does not drive the trim.
  const rate = (kias - c.prevKias) / d;
  c.kiasRateEff = 0.8 * c.kiasRateEff + 0.2 * rate;
  c.prevKias = kias;
  c.t += d;
  if (c.lockoutTimer > 0 && c.mode !== 'mpt' && c.mode !== 'levelMpt') {
    c.lockoutTimer = Math.max(0, c.lockoutTimer - d);
  }

  // A move that has ended hands to the next one (the pilot decides).
  handOver(state, ac, other, kias);

  const ctx = { state, ac, other, p, f, kias, d, shaker: shakerG(kias, p) };
  // In the MPT the Tactical pilot may pick a new move first; then the move flies, and its inputs go through the smoothing layer.
  reconsiderInMpt(ctx);
  const cmd = smoothInputs(ac, controlFor(ctx), d, p);

  // A forced G is pulled as it is, past the stall line if need be.
  // In normal flight, the model pilot rides the stick shaker to stay out of high-speed / accelerated stall.
  let gWanted = cmd.g;
  if (c.forceG !== null && c.mode !== 'pursuit') {
    gWanted = c.forceG;
  } else {
    gWanted = Math.min(gWanted, ctx.shaker);
  }

  // Stall: the pull needs more than the stall line, or the speed is under the stall speed.
  // STALL starts when that becomes true and lasts stallSec, and for as long as the speed is under the
  // stall speed. The jet flies no more than 1 G, or the stall line if that is lower, while it is on,
  // and afterwards goes back to the shaker.
  const stallLine = stallLimitG(kias, p.stallKias);
  const slow = kias < p.stallKias;
  let stallReason = '';
  if (gWanted > stallLine + 1e-9) {
    // Two decimals at most (verification N5: "5.5000 G; 5.4995 G" is too heavy for a screen line); closer than that reads "just over".
    stallReason = gWanted.toFixed(2) === stallLine.toFixed(2)
      ? `The pull needs just over the ${stallLine.toFixed(2)} G the stall line gives at ${round(kias)} KIAS`
      : `The pull needs ${gText(gWanted, stallLine)} G; the stall line at ${round(kias)} KIAS gives ${gText(stallLine, gWanted)} G`;
  }
  else if (slow) stallReason = belowStallText(kias, p);
  let stallStarts = false;
  if (stallReason && !c.stallCond && c.stallTimer <= 1e-9) {
    stallStarts = true;
    c.stallTimer = p.stallSec;
    c.forceG = null; // the pilot eases back to the shaker afterwards
    ac.stallEver = true; ac.stallReason = stallReason;
  }
  c.stallCond = !!stallReason;
  const timed = c.stallTimer > 1e-9;
  ac.stall = timed || slow;
  let g;
  if (ac.stall) {
    if (timed) c.stallTimer -= d;
    else ac.stallReason = stallReason;
    g = Math.min(1, stallLine);
  } else {
    ac.stallReason = '';
    g = c.forceG === null ? Math.min(gWanted, ctx.shaker) : gWanted;
  }

  // Bank changes at the roll rate, never instantly. When stalled, aerodynamic roll authority is reduced (~30%), allowing wings-level recovery.
  const rollRate = ac.stall ? 0.3 * p.rollRateDegPerSec : p.rollRateDegPerSec;
  const maxRollDelta = degToRad(rollRate) * d;
  const roll = rollToward(ac.bankRad, cmd.bankRad, maxRollDelta, cmd.prefer);
  c.rollRateDps = radToDeg(wrapPi(roll.bank - ac.bankRad)) / d; // signed, for the smoothing layer next step
  ac.bankRad = roll.bank;
  ac.rollDegPerSec = radToDeg(roll.movedRad) / d;
  ac.rolling = isRolling(roll.movedRad, d);

  // OVER G: above +7 G, or above +4.7 G while rolling. The jet still flies the G it pulled. On the step a pull stalls the jet the
  // G it pulled is judged, not the 1 G STALL then gives, so a pull past both lines shows both flags (verification F6).
  const gPulled = stallStarts ? Math.max(g, gWanted) : g;
  ac.overG = false; ac.overGReason = '';
  if (gPulled > T6A_LIMITS.maxG + 1e-9) {
    ac.overG = true; ac.overGReason = `${gPulled.toFixed(1)} G is above +${T6A_LIMITS.maxG} G`;
  } else if (ac.rolling && gPulled > T6A_LIMITS.rollingMaxG + 1e-9) {
    ac.overG = true; ac.overGReason = `${gPulled.toFixed(1)} G while rolling is above +${T6A_LIMITS.rollingMaxG} G`;
  }
  if (ac.overG) ac.overGEver = true;

  ac.onShaker = g >= ctx.shaker - 1e-6 && !ac.stall;
  ac.chaseLimited = c.mode === 'pursuit' && !!c.chaseLimited;
  flyStep(ac, g, cmd.throttle, d);
  const before = f.headingRad;
  const after = pointMassFlight(ac.pm).headingRad;
  const turnDelta = Math.abs(radToDeg(wrapPi(after - before)));
  ac.ctl.turnDeg += turnDelta;
  if (c.mode === 'mpt' || c.mode === 'levelMpt') {
    c.mptTurnDeg = (c.mptTurnDeg || 0) + turnDelta;
  }
  readOut(ac, g, cmd.throttle, p, ctx.shaker, !state.dry);
  // The readout shows STALL for the speed it shows: still on under the stall speed, on as it falls through it.
  ac.stall = timed || ac.kias < p.stallKias;
  if (!ac.stall) ac.stallReason = '';
  else if (!ac.stallReason) ac.stallReason = belowStallText(ac.kias, p);
  if (!ac.mptReached) {
    ac.toMptSec += d; ac.toMptDeg += Math.abs(radToDeg(wrapPi(after - before)));
    const atMpt = ac.move === 'levelMpt' || (ac.move === 'mpt' && Math.abs(ac.kias - p.mptKias) <= MPT_WITHIN_KT);
    if (atMpt) {
      ac.mptReached = true;
      if (ac.move === 'mpt') ac.why = `MPT ${round(p.mptKias)} KIAS`;
    }
  }
}

/** One point-mass step, with the speed kept above zero so the flight path always has a direction (point-mass.js needs it). */
function flyStep(ac, g, throttle, d) {
  const bankRad = ac.bankRad;
  let next = stepPointMass(ac.pm, { g, bankRad }, d, excessFnFor(throttle));
  const speed = Math.hypot(next.vx, next.vy, next.vz);
  const floor = TUNING.minKtas * KT_TO_FTPS;
  if (!(speed >= floor)) {
    const old = unit(velOf(ac.pm));
    const dir = speed > 1e-9 ? scale({ x: next.vx, y: next.vy, z: next.vz }, 1 / speed) : old;
    next = { ...next, vx: dir.x * floor, vy: dir.y * floor, vz: dir.z * floor };
  }
  ac.pm = next;
}

/** Before the turns nothing is pulled, but a jet under the stall speed is stalled: STALL reads from T+0 (verification F3). Read once when the aircraft is made; the straight flight keeps the speed, so it keeps the flag. */
export function readSlow(ac, p) {
  ac.stall = ac.kias < p.stallKias;
  if (ac.stall) { ac.stallEver = true; ac.stallReason = belowStallText(ac.kias, p); } else ac.stallReason = '';
}
