// The judge: the one nose-on rule (the fight's chase and the look-ahead's score both use it, so they cannot
// disagree), the tactical advantage score, the first nose-on and the chase, the gun kill and the mid-air
// collision. It reads the fight and records results; it flies nothing. (A collision does put both jets into
// the tumble, which aircraft.js then flies.)
import { KT_TO_FTPS } from '../../../core/units.js';
import { wrapPi } from '../../../core/angles.js';
import { energyHeightFt } from '../../../core/t6-performance.js';
import { pointMassFlight } from '../../../core/point-mass.js';
import { FIGHT_STEP_SEC, FIRST_NOSE_DEG } from '../sim.js';
import { COLLISION_HITBOX_FT, PURSUIT_MAX_AA_DEG } from './setup.js';
import { len, sub, clamp, velOf, posOf, noseAngleDeg, readPair } from './frame.js';

/**
 * Whether this aircraft's nose tracks the other (D386):
 * 1. 3D off-nose vector angle <= FIRST_NOSE_DEG (5.0°), OR
 * 2. Across altitude differences, azimuth <= 5.0° AND elevation <= 10.0°.
 */
export function isAcNoseOn(state, ac, target) {
  if (ac.stall || ac.tumble) return false;
  if (noseOffDeg(state, ac) <= FIRST_NOSE_DEG) return true;
  const dx = target.xFt - ac.xFt, dy = target.yFt - ac.yFt, dz = target.zFt - ac.zFt;
  const dH = Math.hypot(dx, dy);
  if (dH === 0) return false;
  const deltaAz = Math.abs(wrapPi(Math.atan2(dy, dx) - ac.headingRad)) * 180 / Math.PI;
  const thetaLos = Math.atan2(dz, dH) * 180 / Math.PI;
  const deltaEl = Math.abs(ac.climbDeg - thetaLos);
  return deltaAz <= FIRST_NOSE_DEG && deltaEl <= 10.0;
}

/**
 * The one nose-on rule: `ac`'s nose tracks `target` (3D or azimuth across altitude difference, D386)
 * and the target's aspect angle is PURSUIT_MAX_AA_DEG or less, so the chase starts from
 * behind; or `chaseAfterHeadOn` is set, and any nose-on counts. The fight's chase
 * and the look-ahead's score both use it, so they cannot disagree.
 */
export function onTheOther(state, ac, target) {
  if (ac.stall || ac.tumble || !isAcNoseOn(state, ac, target)) return false;
  return state.setup.chaseAfterHeadOn || 180 - noseOffDeg(state, target) <= PURSUIT_MAX_AA_DEG;
}

/** How far this aircraft's nose is off the other, from the pair's readout (readPair, worked out every step). */
export const noseOffDeg = (state, ac) => (ac.who === 'blue' ? state.ataBlueDeg : state.ataRedDeg);

/**
 * 3D Austin/Carbone tactical advantage score (0.0 to 1.0) using ATA, AA, range, and specific energy height.
 * (Phase 2A)
 * - ATA: 0° = nose-on (1.0)
 * - AA: 0° = on bandit's six (1.0)
 * - Range: gun engagement envelope up to 9,000 ft
 * - Energy: specific energy height differential
 */
export function tacticalAdvantage(ac, target) {
  const ata = noseAngleDeg(ac, target);
  const aa = 180 - noseAngleDeg(target, ac);
  const rangeFt = len(sub(posOf(target.pm), posOf(ac.pm)));
  const GUN_RANGE = 3000;

  const ataScore = clamp(1 - ata / 180, 0, 1);
  const aaScore = clamp(1 - aa / 180, 0, 1);
  const rangeScore = clamp(1 - rangeFt / (GUN_RANGE * 3), 0, 1);

  const altAc = ac.altFt ?? ac.pm.z;
  const ktasAc = ac.ktas ?? (len(velOf(ac.pm)) / KT_TO_FTPS);
  const eAc = ac.energyHeightFt ?? energyHeightFt(altAc, ktasAc);

  const altTarget = target.altFt ?? target.pm.z;
  const ktasTarget = target.ktas ?? (len(velOf(target.pm)) / KT_TO_FTPS);
  const eTarget = target.energyHeightFt ?? energyHeightFt(altTarget, ktasTarget);

  const energyScore = clamp(0.5 + (eAc - eTarget) / 6000, 0, 1);

  return 0.35 * ataScore + 0.35 * aaScore + 0.20 * rangeScore + 0.10 * energyScore;
}

/**
 * Post-merge tactical pursuit breakout gate (Phase 2C):
 * Decisive tactical advantage triggers pursuit entry even without 5° boresight lock.
 */
export function shouldPursueTactical(state, ac, target) {
  if (state.setup.pursuit === 'none') return false;
  if (ac.ctl.mode === 'pursuit' || ac.stall || ac.tumble) return false;
  if (!state.merged || state.timeSec <= (state.mergeSec ?? 0) + 1.0) return false;
  if (!state.setup.chaseAfterHeadOn && 180 - noseOffDeg(state, target) > PURSUIT_MAX_AA_DEG) return false;
  const f = pointMassFlight(ac.pm);
  if (ac.kias < 140 && f.climbRad > 0) return false;
  const ata = noseAngleDeg(ac, target);
  const adv = tacticalAdvantage(ac, target);
  const advTarget = tacticalAdvantage(target, ac);
  const ataThreshold = (adv - advTarget) > 0.15 ? 65 : 45;
  return adv > 0.52 && (adv - advTarget) >= 0.05 && ata < ataThreshold;
}

/**
 * The first nose-on is marked once (the first aircraft whose nose is within 5° of
 * the other; both in one step reads "both", Q48), head-on or not. The chase is
 * separate (markChase): a head-on first nose-on, which starts no pursuit, does not
 * block a pursuit from behind later. Called only after the pass.
 */
export function markFirstNose(state) {
  const blueOn = isAcNoseOn(state, state.blue, state.red);
  const redOn = isAcNoseOn(state, state.red, state.blue);
  if (!state.firstNose && (blueOn || redOn)) {
    const by = blueOn && redOn ? 'both' : blueOn ? 'blue' : 'red';
    const from = by === 'red' ? state.red : state.blue;
    const to = by === 'red' ? state.blue : state.red;
    state.firstNose = { by, timeSec: state.timeSec, from: { xFt: from.xFt, yFt: from.yFt }, to: { xFt: to.xFt, yFt: to.yFt } };
  }
}

/**
 * Records the chase once: by the aircraft that started a pursuit this step (startChases, the pilot's), or else by any
 * aircraft whose nose is on the other (onTheOther) or that has a decisive tactical advantage, pursuing or not.
 */
export function markChase(state, chasers) {
  if (chasers.length && !state.chase) {
    state.chase = { by: chasers.length === 2 ? 'both' : chasers[0].ac.who, timeSec: state.timeSec, aaDeg: chasers[0].aspectDeg };
  }
  if (!state.chase) {
    for (const [ac, target] of [[state.blue, state.red], [state.red, state.blue]]) {
      if (!ac.stall && (onTheOther(state, ac, target) || shouldPursueTactical(state, ac, target))) {
        state.chase = { by: ac.who, timeSec: state.timeSec, aaDeg: 180 - noseOffDeg(state, target) };
        break;
      }
    }
  }
}

/**
 * Weapon employment zone (WEZ) gun solution detector (Task 22):
 * Tracks continuous time in firing envelope and awards gun kill at 2.0 s.
 */
export function checkWezGun(state, d = FIGHT_STEP_SEC) {
  readPair(state);
  for (const [ac, target] of [[state.blue, state.red], [state.red, state.blue]]) {
    const postMerge = state.merged === true && state.timeSec > (state.mergeSec ?? 0) + 1.0;
    const ata = noseOffDeg(state, ac);
    const aa = 180 - noseOffDeg(state, target);
    const inEnvelope = postMerge && !ac.stall && !ac.tumble && state.rangeFt < 2500 && ata <= 15.0 && aa <= 60.0;
    if (inEnvelope) {
      ac.ctl.wezTrackSec = (ac.ctl.wezTrackSec || 0) + d;
      if (ac.ctl.wezTrackSec >= 2.0 - 1e-6) {
        if (!state.kill) {
          state.kill = {
            victor: ac.who,
            timeSec: state.timeSec,
            rangeFt: Math.round(state.rangeFt),
            ataDeg: Math.round(ata),
          };
        }
      }
    } else {
      ac.ctl.wezTrackSec = 0;
    }
  }
}

/**
 * Physical Hitbox & Mid-Air Collision Detector (Task 27):
 * Triggers collision state when 3D separation drops below 35 ft (CT-156 wingspan/length).
 */
export function checkMidAirCollision(state, d = FIGHT_STEP_SEC) {
  if (state.setup?.collisionDetection === false) return;
  if (state.collision) return;
  if (state.setup?.pursuit === 'none') return;
  const postMerge = state.merged === undefined || (state.merged === true && state.timeSec > (state.mergeSec ?? 0) + 1.0) || state.setup?.turnsStart === 'now';
  if (!postMerge) return;
  if (state.rangeFt < COLLISION_HITBOX_FT) {
    const dvx = state.blue.pm.vx - state.red.pm.vx;
    const dvy = state.blue.pm.vy - state.red.pm.vy;
    const dvz = state.blue.pm.vz - state.red.pm.vz;
    const relativeSpeedKt = Math.hypot(dvx, dvy, dvz) / KT_TO_FTPS;
    const r = state.rangeFt;
    const rx = (state.blue.xFt ?? state.blue.pm.x) - (state.red.xFt ?? state.red.pm.x);
    const ry = (state.blue.yFt ?? state.blue.pm.y) - (state.red.yFt ?? state.red.pm.y);
    const rz = (state.blue.zFt ?? state.blue.pm.z) - (state.red.zFt ?? state.red.pm.z);
    const closingRateKt = r > 0 ? -((rx * dvx + ry * dvy + rz * dvz) / r) / KT_TO_FTPS : 0;
    const altBlue = state.blue.altFt ?? state.blue.pm.z;
    const altRed = state.red.altFt ?? state.red.pm.z;
    state.collision = {
      timeSec: state.timeSec,
      impactKias: (state.blue.kias + state.red.kias) / 2,
      relativeSpeedKt: Math.round(relativeSpeedKt),
      closingRateKt: Math.round(closingRateKt),
      altitudeFt: Math.round((altBlue + altRed) / 2),
    };
    state.blue.collided = true;
    state.red.collided = true;

    let p, q, rRate;
    if (relativeSpeedKt < 35) {
      p = 150; q = 60; rRate = 50;
    } else if (relativeSpeedKt <= 90) {
      p = 450; q = 200; rRate = 160;
    } else {
      p = 900; q = 400; rRate = 300;
    }

    state.blue.tumble = {
      pDegPerSec: p,
      qDegPerSec: -q,
      rDegPerSec: rRate,
    };
    state.blue.why = 'Departure: Ballistic tumble after mid-air collision';
    state.blue.move = 'tumble';
    state.blue.moveLabel = 'Collision Tumble';
    if (state.blue.ctl) state.blue.ctl.mode = 'tumble';

    state.red.tumble = {
      pDegPerSec: -p,
      qDegPerSec: q,
      rDegPerSec: -rRate,
    };
    state.red.why = 'Departure: Ballistic tumble after mid-air collision';
    state.red.move = 'tumble';
    state.red.moveLabel = 'Collision Tumble';
    if (state.red.ctl) state.red.ctl.mode = 'tumble';
  }
}
