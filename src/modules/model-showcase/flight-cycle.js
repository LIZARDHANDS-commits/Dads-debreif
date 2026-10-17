// The Model Showcase's gentle flight (W25, Patrick 17 Oct 2026: "in Model Showcase when flying, automatic gentle flight
// cycle (turns, climbs, descents with matching TQ, stick, PCL, control surfaces, and instruments)"; MS-7). A picture only,
// not a flight model (Patrick: "we're just using graphics"): it eases from leg to leg through gentle turns, a climb, level
// cruise and a descent, and keeps the panel's numbers (attitude, speed, height, heading, G, vertical speed, torque) and the
// stick in step with what the aircraft is doing. The legs' numbers are the brief's picture estimates, no manual page behind
// them. The turn rate, the G of a turn, true airspeed and the roll's easing are the shared flight maths (src/core).
import { gFromBankDeg, turnRateFromBankRadPerSec, easeValue } from '../../core/flight-math.js';
import { iasToTasKt } from '../../core/aircraft-performance.js';
import { G_FTPS2, KT_TO_FTPS } from '../../core/units.js';

const DEG = 180 / Math.PI;

/** Level cruise: +2° nose up, 55 % torque, 180 KIAS (estimates). */
const CRUISE = Object.freeze({ bankDeg: 0, pitchDeg: 2, vsFpm: 0, torquePct: 55, kias: 180 });
/**
 * The legs, flown in turn and round again, each held `s` seconds at its numbers: bank right wing down positive, up to
 * 25° each way; the climb +8°, +1,200 fpm, 85 % torque, 160 KIAS; the descent -4°, -1,000 fpm, 22 %, 195 KIAS (the brief's
 * numbers, estimates). The times are tool choices: long enough to see each settle.
 */
export const SHOWCASE_LEGS = Object.freeze([
  Object.freeze({ name: 'cruise', s: 8, ...CRUISE }),
  Object.freeze({ name: 'right turn', s: 18, ...CRUISE, bankDeg: 25 }),
  Object.freeze({ name: 'cruise', s: 6, ...CRUISE }),
  Object.freeze({ name: 'climb', s: 16, bankDeg: 0, pitchDeg: 8, vsFpm: 1200, torquePct: 85, kias: 160 }),
  Object.freeze({ name: 'cruise', s: 8, ...CRUISE }),
  Object.freeze({ name: 'left turn', s: 18, ...CRUISE, bankDeg: -25 }),
  Object.freeze({ name: 'cruise', s: 6, ...CRUISE }),
  Object.freeze({ name: 'descent', s: 19, bankDeg: 0, pitchDeg: -4, vsFpm: -1000, torquePct: 22, kias: 195 }), // a little longer than the climb, so the height comes back round
]);
/** One time round the legs, seconds. */
export const SHOWCASE_CYCLE_S = SHOWCASE_LEGS.reduce((t, leg) => t + leg.s, 0);
/** How the aircraft eases toward each leg: a gentle roll (degrees a second, and per second²), and how long the rest take to settle (seconds to about 63 %). */
const EASE = Object.freeze({ rollDps: 8, rollAccelDps2: 8, pitchS: 4, vsS: 4, torqueS: 2, speedS: 6 });
/** The stick's share of full throw for the roll rate and the pitch (tool choices for the picture): roll at rollDps is about a third right. */
const STICK = Object.freeze({ rollPerDps: 0.04, pitchPerDps: 0.12, pitchPerG: 0.4, yawPerRoll: 0.2 });

/** Where the cycle starts: level cruise at 5,000 ft heading east (the old flying pose's height and heading). */
export function createShowcaseFlight({ altFt = 5000, headingDeg = 90 } = {}) {
  return { t: 0, ...CRUISE, rollRateDps: 0, pitchRateDps: 0, g: 1, altFt, headingDeg, controls: { roll: 0, pitch: 0, yaw: 0 } };
}

/** The leg flown at time t into the cycle. */
export function showcaseLegAt(t) {
  let at = ((t % SHOWCASE_CYCLE_S) + SHOWCASE_CYCLE_S) % SHOWCASE_CYCLE_S;
  for (const leg of SHOWCASE_LEGS) {
    if (at < leg.s) return leg;
    at -= leg.s;
  }
  return SHOWCASE_LEGS[0];
}

const ease = (x, target, dt, tauS) => x + (target - x) * (1 - Math.exp(-dt / tauS));
const unit = (v) => Math.max(-1, Math.min(1, v));

/**
 * The flight `dtS` seconds on: toward the leg's numbers when `manoeuvre` is on, else toward level cruise (the checkbox
 * off: "unchecking holds steady wings-level flight"). Returns a new state; the old one is left as it was.
 */
export function stepShowcaseFlight(s, dtS, { manoeuvre = true } = {}) {
  const dt = Math.max(0, Math.min(0.25, Number(dtS) || 0));
  if (!dt) return s;
  const t = manoeuvre ? s.t + dt : s.t;
  const leg = manoeuvre ? showcaseLegAt(t) : CRUISE;
  const roll = easeValue(s.bankDeg, s.rollRateDps, leg.bankDeg, dt, { maxRateDps: EASE.rollDps, maxAccelDps2: EASE.rollAccelDps2 });
  const pitchDeg = ease(s.pitchDeg, leg.pitchDeg, dt, EASE.pitchS);
  const pitchRateDps = (pitchDeg - s.pitchDeg) / dt;
  const vsFpm = ease(s.vsFpm, leg.vsFpm, dt, EASE.vsS);
  const torquePct = ease(s.torquePct, leg.torquePct, dt, EASE.torqueS);
  const kias = ease(s.kias, leg.kias, dt, EASE.speedS);
  const altFt = s.altFt + (vsFpm / 60) * dt;
  const tasFtps = iasToTasKt(kias, altFt) * KT_TO_FTPS;
  const headingDeg = (((s.headingDeg + turnRateFromBankRadPerSec(tasFtps, roll.bankDeg) * DEG * dt) % 360) + 360) % 360;
  // The turn's G and the pull of a pitch change (speed times pitch rate over gravity).
  const g = gFromBankDeg(roll.bankDeg) + (tasFtps * (pitchRateDps / DEG)) / G_FTPS2;
  const controls = {
    roll: unit(roll.rollRateDps * STICK.rollPerDps),
    pitch: unit(pitchRateDps * STICK.pitchPerDps + (g - 1) * STICK.pitchPerG),
    yaw: unit(roll.rollRateDps * STICK.rollPerDps * STICK.yawPerRoll),
  };
  return { t, bankDeg: roll.bankDeg, rollRateDps: roll.rollRateDps, pitchDeg, pitchRateDps, vsFpm, torquePct, kias, altFt, headingDeg, g, controls };
}

/** The panel's numbers for the cockpit (ct156-cockpit.js update) from the flight. */
export function showcaseHud(s) {
  return { pitchDeg: s.pitchDeg, bankDeg: s.bankDeg, kias: s.kias, altFt: s.altFt, headingDeg: s.headingDeg, g: s.g, vsFpm: s.vsFpm, speedBrake: false, torquePct: s.torquePct, engineRunning: true, controls: s.controls };
}
