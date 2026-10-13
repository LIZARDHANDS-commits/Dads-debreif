// The one T-6A performance model every module reads (SPEC-core, "API, fifth
// PR"; Patrick, 2026-09-30 06:58Z). V6 has none of this: it is new, checked
// against the T-6A's reference data (tests/unit/core/t6-performance.test.js). Each
// module keeps its own flying; this only holds the aircraft's numbers.
//
// Speeds are knots: KIAS where the reference data use indicated airspeed, KTAS where
// the motion needs true airspeed. Altitudes are feet, pressure altitude on a
// standard day. G is the load factor.
import { FT_PER_NM, G_FTPS2, KT_TO_FTPS } from './units.js';
import { isaDensityRatio, isaPressureRatio, speedOfSoundKt } from './atmosphere.js';
import { T6A_FIT } from './t6a-turn-data.js';
import { stepPointMass, pointMassState, pointMassFlight } from './point-mass.js';

/**
 * The T-6A flight envelope and airspeed limits (clean, at 5,168 lb; reference data).
 * stallKias is the 1 G stall speed: 86 kt, which Patrick kept (2026-09-30
 * 09:29Z). The envelope itself reads about 89 kt (7 G near 236 KIAS), and the
 * sustained-turn data imply about 83 kt at maximum power (likely because power on
 * lowers the stall speed). 7 G at 227.5 KIAS matching VO (227) is a coincidence.
 * mmo is the Mach limit, 0.67 (reference): slower than VMO from
 * about 18,900 ft (the reference data say 18,769). maxKiasT6A gives the top speed at a height.
 */
export const T6A_LIMITS = Object.freeze({
  maxG: 7, minG: -3.5, rollingMaxG: 4.7, rollingMinG: -1,
  stallKias: 86, voKias: 227, vmoKias: 316, mmo: 0.67, weightLb: 5168,
});

/** The most G the wing gives at this speed before it stalls: (KIAS ÷ stall speed)². */
export function stallLimitG(kias, stallKias = T6A_LIMITS.stallKias) {
  return (kias / stallKias) ** 2;
}

/** The G the aircraft can pull now: the stall line, capped at +7 G (+4.7 G while rolling). */
export function availableG(kias, rolling = false, stallKias = T6A_LIMITS.stallKias) {
  return Math.min(stallLimitG(kias, stallKias), rolling ? T6A_LIMITS.rollingMaxG : T6A_LIMITS.maxG);
}

/**
 * The T-6A's roll and G onset: the one aircraft limit every module stays under (Patrick 5 Oct 2026 22:01Z, "okay, let's do
 * that"; whole-tool decision with the Docs keeper; Formation's part TS-85). ESTIMATES from standard aerodynamics (Fable's
 * performance audit, 5 Oct 21:59Z-22:01Z): no manual in the project files gives them, so they stay estimates until Patrick
 * corrects them.
 *  - full-stick roll rate: rollPerKtasDps per knot of TRUE airspeed (a roll rate at a fixed helix angle grows with true
 *    airspeed), capped at maxRateDps: about 131°/s at 200 KIAS and 8,000 ft, the cap from about 345 KTAS (only near VMO at
 *    height). ALL-39 (Patrick 12 Oct 2026, "agreed"): 0.58 and 200°/s, worked out from the airframe with standard
 *    aerodynamics (aileron travel 20° up and 11° down, NFM p.1-41 to 1-43; helix angle pb/2V about 0.10, range 0.07-0.14),
 *    still an estimate until Patrick's measured full-stick 360° roll at about 200 KIAS (about 3.0 s expected). It was 0.45
 *    and 120°/s (ALL-28, Fable's audit of 5 Oct). Patrick's phase 2 rolls (GoPro telemetry, 2022) reached 83-100°/s at about
 *    110-140 KTAS, above even this at low speed, so a measured roll may raise it again;
 *  - roll acceleration: full rate in fullRateSec, the acceleration itself built over onsetSec (Patrick's ruling 12 Oct 2026
 *    03:37Z, "let's do .2", from Fable's estimate of a brisk full stick throw; his 02:08Z ask, "the roll rate itself just
 *    needs to be realistic and smoothed (not instant acceleration)"). Only a roll that carries its acceleration uses it
 *    (core easeRoll's onsetSec: the Formation's #2, TS-196); the limits below leave it out;
 *  - G onset (T6A_G_ONSET): 4 G per second, building at 16 G/s² (the Formation fluid Lead's number, design 5.3).
 * A module's own gentler rate (a pilot's) is its choice; it never goes past these (rollWithinT6A).
 */
export const T6A_ROLL = Object.freeze({ rollPerKtasDps: 0.58, maxRateDps: 200, fullRateSec: 0.3, onsetSec: 0.2 });
/** The T-6A's G onset in easeValue's shape (flight-math.js): G per second, and per second². An estimate (T6A_ROLL). */
export const T6A_G_ONSET = Object.freeze({ maxRateDps: 4, maxAccelDps2: 16 });
/**
 * The fastest G ever builds, G per second: the ceiling the envelope gates hold every roll-in under (Formation handling.js,
 * Traffic envelope.js). 6 G/s (ALL-40, Patrick 12 Oct 2026: "make it 6 g/s ceiling"; it was 8, twice T6A_G_ONSET): no
 * pilot source supports more (centrifuge training tops out about 6 G/s; Patrick's recorded pulls peak under 3 G/s). An estimate.
 */
export const T6A_G_ONSET_CEILING_GPS = 6;

/** The T-6A's roll limits at a true airspeed (knots), in easeRoll's shape { maxRateDps, maxAccelDps2 }. Estimates (T6A_ROLL). */
export function rollLimitsAtKtasT6A(ktas) {
  const maxRateDps = Math.min(T6A_ROLL.maxRateDps, T6A_ROLL.rollPerKtasDps * Math.max(0, ktas));
  return { maxRateDps, maxAccelDps2: maxRateDps / T6A_ROLL.fullRateSec };
}

/**
 * A module's roll limits held under the aircraft's at a true airspeed: the lower rate and the lower acceleration of the
 * two. limits: { maxRateDps, maxAccelDps2 } (a pilot's, a formation's); ktas: knots.
 */
export function rollWithinT6A(limits, ktas) {
  const t6 = rollLimitsAtKtasT6A(ktas);
  return { maxRateDps: Math.min(limits.maxRateDps, t6.maxRateDps), maxAccelDps2: Math.min(limits.maxAccelDps2, t6.maxAccelDps2) };
}

/**
 * True airspeed from indicated: IAS ÷ √σ (no compressibility). σ is the standard atmosphere's at altFt unless the
 * caller passes the day's own (Traffic's weather.js passes atmosphere.js densityRatio with the day's temperature).
 */
export function iasToTasKt(kias, altFt, sigma = isaDensityRatio(altFt)) {
  return kias / Math.sqrt(sigma);
}

/** Indicated airspeed from true: TAS × √σ, σ as for iasToTasKt. */
export function tasToIasKt(ktas, altFt, sigma = isaDensityRatio(altFt)) {
  return ktas * Math.sqrt(sigma);
}

// The speed of sound and the pressure ratio live in atmosphere.js; speedOfSoundKt
// is exported here too, under the same name, for the modules that read it from this file.
export { speedOfSoundKt };

/**
 * The KIAS an airspeed indicator reads at this Mach number and altFt: the
 * standard calibrated airspeed, with compressibility, on a standard day.
 * mach from 0 to under 1 (the subsonic formula) and a finite altFt, or it
 * throws a RangeError.
 */
export function machToKiasKt(mach, altFt) {
  if (!(mach >= 0 && mach < 1 && Number.isFinite(altFt))) {
    throw new RangeError(`KIAS at Mach ${mach} and ${altFt} ft: needs Mach 0 to under 1 and a finite height`);
  }
  const a0 = speedOfSoundKt(0);
  const impactOverP0 = isaPressureRatio(altFt) * ((1 + 0.2 * mach * mach) ** 3.5 - 1);
  return a0 * Math.sqrt(5 * ((impactOverP0 + 1) ** (2 / 7) - 1));
}

/**
 * The fastest the T-6A may fly at altFt, in KIAS, following the reference
 * data's line: VMO 316, or Mmo 0.67 where that is slower (above about
 * 18,900 ft; 279 KIAS at 25,000 ft). This is the airspeed indicator's reading,
 * for showing a pilot. Do not hold a model's IAS (TAS × √σ, iasToTasKt) to it:
 * that flies about Mach 0.69 at 25,000 ft. Use modelMaxIasT6A for that.
 * altFt must be finite, or it throws a RangeError.
 */
export function maxKiasT6A(altFt) {
  return Math.min(T6A_LIMITS.vmoKias, machToKiasKt(T6A_LIMITS.mmo, altFt));
}

/**
 * The same limit on the model's own IAS (TAS × √σ, no compressibility), for
 * holding a flown aircraft to it: VMO 316, or the IAS at a true Mach 0.67
 * where that is slower (from about 17,600 ft; 270 at 25,000 ft). Flown at this
 * speed the model is never over Mach 0.67. altFt must be finite, or it throws
 * a RangeError.
 */
export function modelMaxIasT6A(altFt) {
  return Math.min(T6A_LIMITS.vmoKias, tasToIasKt(T6A_LIMITS.mmo * speedOfSoundKt(altFt), altFt));
}

/** Energy height in feet: altitude + V²/2g, V true airspeed. */
export function energyHeightFt(altFt, ktas) {
  const v = ktas * KT_TO_FTPS;
  return altFt + v * v / (2 * G_FTPS2);
}

/**
 * Maximum-power propeller thrust ÷ weight (fitted to the sustained turn data,
 * T6A_FIT): falls with true airspeed, holds its sea-level value up to about
 * 14,000 ft, then falls with density.
 */
export function thrustPerWeight(kias, altFt) {
  const f = T6A_FIT;
  const sigma = Math.min(isaDensityRatio(altFt), f.thrustFlatSigma);
  return f.thrustK * sigma ** f.thrustDensityExp / (iasToTasKt(kias, altFt) + f.thrustV0Kt);
}

/**
 * Drag ÷ weight, clean: a zero-lift part growing with KIAS² and a part growing
 * with G² ÷ KIAS² (set by the max glide data, T6A_FIT). At a given IAS it is
 * the same at any height; altFt is there so every function reads alike.
 */
export function dragPerWeight(kias, altFt, g) {
  const f = T6A_FIT;
  return f.dragA * kias * kias + f.dragB * g * g / (kias * kias);
}

/** (Thrust − drag) ÷ weight at maximum power: what is left to climb or speed up with. */
export function excessThrustPerWeight(kias, altFt, g) {
  return thrustPerWeight(kias, altFt) - dragPerWeight(kias, altFt, g);
}

/**
 * Pitch attitude: the angle of attack the wing needs on top of the flight path
 * angle. AoA = aoa180Deg × G × (180 ÷ KIAS)², set so the normal 180 KIAS climb
 * shows about 10-12° nose up and the 140 KIAS best-rate climb about 15°, with
 * this model's full-power climb angles (SMM 3.14 para 35; EFIG p.126). With datumDeg it gives Patrick's attitudes
 * within a fraction of a degree (Patrick, 11 Oct 2026 01:26Z: 2.5° nose up on the gear on level ground, 0° level at
 * 180 KIAS, -0.5° at 220 KIAS; the sim 2.6°, 0.2°, -0.7°).
 */
export const T6A_PITCH = Object.freeze({
  aoa180Deg: 2.8,
  datumDeg: 2.6,
  takeoffFlapAoADeg: -1.7,
  landingFlapAoADeg: -3.3,
  /** On the wheels, level ground: the gear holds the nose 2.5° up (Patrick, 6 Oct 06:17Z and 11 Oct 2026 01:26Z). Traffic's
   * path-follower.js GROUND_ATTITUDE_DEG is the same number, kept there until Patrick points it here. */
  onGearDeg: 2.5,
});

/**
 * Delta angle-of-attack from flap deflection, in degrees.
 * Extending flaps increases wing camber, shifting zero-lift angle negative and requiring less body AoA
 * for a given lift coefficient (AETCMAN 11-248, RCAF SMM).
 */
function flapAoADeltaDeg(config) {
  if (!config || typeof config !== 'string') return 0;
  const c = config.toLowerCase();
  if (c.includes('land') || c === 'landing') return T6A_PITCH.landingFlapAoADeg;
  if (c.includes('t/o') || c.includes('takeoff') || c.includes('take-off')) return T6A_PITCH.takeoffFlapAoADeg;
  return 0;
}

/**
 * Pitch attitude in degrees, nose up positive: flight path angle (climb rate ÷
 * true airspeed, both ft/s) plus angle of attack at this KIAS and G (T6A_PITCH),
 * adjusted for flap configuration when provided.
 */
export function pitchDegFromClimb(climbFtps, tasFtps, kias, g = 1, config = null) {
  const gamma = Math.asin(Math.max(-1, Math.min(1, climbFtps / Math.max(tasFtps, 1)))) * 180 / Math.PI;
  const flapDelta = flapAoADeltaDeg(config);
  return gamma + T6A_PITCH.aoa180Deg * g * (180 / Math.max(kias, 60)) ** 2 + flapDelta;
}

/**
 * The pitch attitude the pilot sees, in degrees nose up: pitchDegFromClimb less T6A_PITCH.datumDeg, the angle the
 * fuselage sits nose-down from the wing's zero-lift line. 2.6° is fitted to Patrick's 220 KIAS level attitude of
 * -0.5 to -1° (6 Oct 2026 06:17Z; card "Both modules" 06:20Z) and matches his 2.5° nose up on the gear on level ground
 * (Patrick, 11 Oct 2026 01:26Z, with 0° level at 180 KIAS and -0.5° at 220); it gives about 8.5° in the model's
 * 180 KIAS full-power climb (Patrick: about 10°). For display and attitude targets; pitchDegFromClimb itself is
 * unchanged for the code that already uses it.
 */
export function attitudeDegFromClimb(climbFtps, tasFtps, kias, g = 1, config = null) {
  return pitchDegFromClimb(climbFtps, tasFtps, kias, g, config) - T6A_PITCH.datumDeg;
}

/** excessThrustPerWeight as stepPointMass's excessFn, which passes true airspeed. */
export function t6aExcessFn(ktas, altFt, g) {
  return excessThrustPerWeight(tasToIasKt(ktas, altFt), altFt, g);
}

/** The excess-power callback for the point-mass step at part throttle: thrust scales with `throttle` (0 to 1), drag does not. Full throttle is t6aExcessFn itself. */
export function excessFnFor(throttle) {
  if (throttle === 1) return t6aExcessFn;
  return (ktas, altFt, g) => {
    const kias = tasToIasKt(ktas, altFt);
    return throttle * thrustPerWeight(kias, altFt) - dragPerWeight(kias, altFt, g);
  };
}

/**
 * The T-6A max glide data (engine inoperative, IAS; PT6A-68; reference data;
 * Patrick's upload 06:33Z; SMM 13.5 para 7 agrees on 2 NM at 125).
 * chartSinkFpm is the reference sink rate, which works out as the glide
 * ratio at about 16,000 ft; glideSinkFpm gives it at any height.
 * The flapsTakeoff row is an estimate, interpolated between gear down and
 * landing flap; no source gives it (Patrick, 4 Oct 2026 04:18Z).
 */
export const T6A_GLIDE = Object.freeze({
  clean: Object.freeze({ kias: 125, nmPer1000Ft: 2.0, chartSinkFpm: 1350, prop: 'feathered', dragIndex: 0 }),
  gearDown: Object.freeze({ kias: 105, nmPer1000Ft: 1.5, chartSinkFpm: 1500, prop: 'feathered', dragIndex: 20 }),
  flapsTakeoff: Object.freeze({ kias: 110, nmPer1000Ft: 1.3, chartSinkFpm: 1816, prop: 'feathered', dragIndex: 50 }),
  landing: Object.freeze({ kias: 95, nmPer1000Ft: 1.1, chartSinkFpm: 1850, prop: 'feathered', dragIndex: 80 }),
  windmilling: Object.freeze({ kias: 110, nmPer1000Ft: 1.0, chartSinkFpm: 2350, prop: 'windmilling', dragIndex: 0 }),
});

/**
 * Sink rate in ft/min for a T6A_GLIDE configuration ('clean', 'gearDown',
 * 'flapsTakeoff', 'landing', 'windmilling') at kias: true airspeed ÷ the glide ratio. The
 * ratio is fixed through the air, so the sink rate grows with height.
 */
export function glideSinkFpm(config, kias, altFt) {
  return iasToTasKt(kias, altFt) * KT_TO_FTPS * 60 / glideRatio(config);
}

/**
 * The glide ratio through the air for a T6A_GLIDE configuration: feet flown
 * for each foot of height lost (clean 2 NM per 1,000 ft is about 12.2). The
 * flapsTakeoff row is an estimate (see T6A_GLIDE).
 */
export function glideRatio(config) {
  if (!Object.hasOwn(T6A_GLIDE, config)) throw new RangeError(`glide configuration ${config}: use one of ${Object.keys(T6A_GLIDE).join(', ')}`);
  return T6A_GLIDE[config].nmPer1000Ft * FT_PER_NM / 1000;
}

/**
 * Drag ÷ weight, engine off and prop feathered, for a T6A_GLIDE configuration
 * ('clean', 'gearDown', 'flapsTakeoff', 'landing') at kias, altFt and g. Gear
 * and flap raise the zero-lift part of the clean drag (dragPerWeight) so the
 * configuration's best glide ratio is the max glide data's: dragA ×
 * (clean ratio ÷ its ratio)². Its best glide speed then comes out near the
 * data's: gear down about 108 KIAS (data 105), landing flap about 93
 * (data 95). The flapsTakeoff row is an estimate, as its ratio is. Standard
 * aerodynamics on those numbers; checked against SMM 13.5 para 11's
 * orbit losses: clean about 1,630 ft per 360° at 30° (SMM about 1,700), gear
 * down about 2,000 ft (SMM about 2,600, a difference not yet settled).
 */
export function glideDragPerWeight(config, kias, altFt, g = 1) {
  const ref = (c) => T6A_FIT.dragA * (glideRatio('clean') / glideRatio(c)) ** 2 * kias * kias + T6A_FIT.dragB * g * g / (kias * kias);
  // With the gear down, the gear's drag is raised to the SMM's orbit; the flaps' steps from the glide data go on top of it.
  return ref(config) + (['gearDown', 'flapsTakeoff', 'landing'].includes(config) ? (GEAR_DRAG_FACTOR - 1) * ref('gearDown') : 0);
}

/**
 * Gear-down drag ÷ the max glide data's: a 30° orbit at 120 KIAS, gear down, then loses about 2,600 ft (SMM 13.5
 * para 11) instead of the data's about 1,980 (Patrick, 6 Oct 08:24Z: "base it on the drag that's required to lose
 * 2600 in a 30 deg orbit with gear no flaps"). Fitted, an estimate; best glide stays near 105 KIAS.
 */
const GEAR_DRAG_FACTOR = 1.322;

/**
 * The zoom reference data: height gained after an
 * engine failure, engine secured and prop feathered, gear and flaps up; 2 s
 * delay, 2 G pull to 20° nose up held to 145 KIAS, then a 0 to +0.5 G push to
 * capture 125 KIAS (reference). Its lightest and heaviest rows, [speed][altitude];
 * the rows between are straight lines from these to within 1 ft.
 */
export const ZOOM_GAIN_TABLE = Object.freeze({
  kias: Object.freeze([200, 250]),
  altFt: Object.freeze([500, 1500, 3000, 6000]),
  lightLb: 5400,
  heavyLb: 6500,
  light: Object.freeze([Object.freeze([595, 621, 649, 794]), Object.freeze([1172, 1232, 1297, 1487])]),
  heavy: Object.freeze([Object.freeze([738, 757, 768, 883]), Object.freeze([1299, 1347, 1410, 1552])]),
});

const ZOOM_DEFAULT_LB = 5800;   // reference example 1: a two-seat jet part way through a sortie; for Dad
const ZOOM_MIN_KIAS = 150;      // below it the reference procedure slows down level instead
const ZOOM_GLIDE_KIAS = 125;
const ZOOM_PUSH_G = 0.25;       // the middle of the reference 0 to +0.5 G push
const ZOOM_STEP_SEC = 0.02;
const ZOOM_PITCH_GAIN = 5;      // extra G per radian off the 20° climb, to hold it
const ZOOM_MAX_SEC = 120;       // no zoom or slow-down takes this long; a guard, never reached

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Straight-line interpolation of ys over xs, held at the ends. */
function lerpHeld(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
}

/** Energy height from kias down to the glide speed, at one altitude. */
function idealZoomFt(kias, altFt) {
  return energyHeightFt(altFt, iasToTasKt(kias, altFt)) - energyHeightFt(altFt, iasToTasKt(ZOOM_GLIDE_KIAS, altFt));
}

/**
 * The reference zoom procedure flown by the model with the engine off (drag only):
 * 2 s straight and level, a 2 G pull to 20° nose up held to 145 KIAS, then a
 * 0.25 G push until 125 KIAS or the clean glide path. At or below 150 KIAS, a
 * level slow-down to 125 KIAS instead. kias from 0 to VMO (316) and a finite
 * altFt, or it throws a RangeError. Returns the height gained, the time and
 * the distance over the ground in still air. About 1,000 steps: fine once per
 * engine failure, not once per frame.
 */
export function flyZoomT6A(kias, altFt) {
  if (!(kias >= 0 && kias <= T6A_LIMITS.vmoKias && Number.isFinite(altFt))) {
    throw new RangeError(`zoom from ${kias} KIAS at ${altFt} ft: needs 0 to ${T6A_LIMITS.vmoKias} KIAS and a finite height`);
  }
  const engineOff = (ktas, alt, g) => -dragPerWeight(tasToIasKt(ktas, alt), alt, g);
  let s = pointMassState({ altFt, ktas: iasToTasKt(kias, altFt), headingRad: 0 });
  let t = 0;
  const now = () => pointMassFlight(s);
  const nowKias = () => { const f = now(); return tasToIasKt(f.ktas, f.altFt); };
  const fly = (control) => { s = stepPointMass(s, control, ZOOM_STEP_SEC, engineOff); t += ZOOM_STEP_SEC; };
  const going = () => t < ZOOM_MAX_SEC;
  if (kias <= ZOOM_MIN_KIAS) {
    while (nowKias() > ZOOM_GLIDE_KIAS && going()) fly({ g: 1, bankRad: 0 });
  } else {
    const climb = 20 * Math.PI / 180;
    const glidePath = -Math.atan(1 / (T6A_GLIDE.clean.nmPer1000Ft * FT_PER_NM / 1000));
    while (t < 2 - 1e-9) fly({ g: 1, bankRad: 0 });
    while (now().climbRad < climb && going()) fly({ g: 2, bankRad: 0 });
    while (nowKias() > 145 && going()) {
      const f = now();
      fly({ g: Math.cos(f.climbRad) + ZOOM_PITCH_GAIN * (climb - f.climbRad), bankRad: 0 });
    }
    while (nowKias() > ZOOM_GLIDE_KIAS && now().climbRad > glidePath && going()) fly({ g: ZOOM_PUSH_G, bankRad: 0 });
  }
  return { gainFt: s.z - altFt, timeSec: t, distanceFt: Math.hypot(s.x, s.y) };
}

/**
 * Height gained by the reference zoom after an engine failure at kias
 * and altFt (reference), for a jet of weightLb (5,800 lb unless told; the
 * table's 5,400 to 6,500 lb, held at its ends). At 200 and 250 KIAS between
 * 500 and 6,000 ft it is the table; elsewhere, the same share of the energy
 * height from kias down to 125 KIAS as the table's nearest speed and altitude.
 * At or below 150 KIAS there is no zoom (the reference procedure slows down level), so the
 * gain steps from 0 to about 200 ft there, as the reference rule does. The time
 * and distance are the model's (flyZoomT6A), which the reference data do not give.
 * kias from 0 to VMO (316) and a finite altFt, or it throws a RangeError.
 * Returns { gainFt, timeSec, distanceFt }.
 */
export function zoomT6A(kias, altFt, weightLb = ZOOM_DEFAULT_LB) {
  const { timeSec, distanceFt } = flyZoomT6A(kias, altFt);
  if (kias <= ZOOM_MIN_KIAS) return { gainFt: 0, timeSec, distanceFt };
  const z = ZOOM_GAIN_TABLE;
  const w = (clamp(weightLb, z.lightLb, z.heavyLb) - z.lightLb) / (z.heavyLb - z.lightLb);
  const alt = clamp(altFt, z.altFt[0], z.altFt[z.altFt.length - 1]);
  // The table's share of the ideal at each of its speeds, at this altitude and weight.
  const shares = z.kias.map((k, i) => {
    const gains = z.altFt.map((_, j) => z.light[i][j] + (z.heavy[i][j] - z.light[i][j]) * w);
    return lerpHeld(z.altFt, gains, alt) / idealZoomFt(k, alt);
  });
  const share = lerpHeld(z.kias, shares, kias);
  const gainFt = share * idealZoomFt(kias, altFt);
  // Rounded to 1e-9 ft so the table's own points come back exact, not a float step off.
  return { gainFt: Math.round(gainFt * 1e9) / 1e9, timeSec, distanceFt };
}

/**
 * How the model flies a manoeuvre (Patrick, 2026-09-30 09:27Z; SMM 14.16).
 * - shakerMarginKt: pulls fly in the stick shaker, not on the stall line. The
 *   shaker comes on about 5 to 10 kt above the stall (reference); 7 kt here.
 * - splitSMaxG: the most G the split S pulls; Patrick: "Split S goes up to 5 G"
 *   (AIF 2410's maximum; SMM Table 14.1 gives about 4 G).
 * - rollRateDegPerSec: the roll inverted, at SPEC-turn-fight's 90°/s default
 *   (no manual gives one).
 * - splitSNoseUpDeg, splitSRollG: the split S raises the nose to about 20° up,
 *   then rolls inverted at about 0.5 G (SMM 14.16 para 41).
 */
export const T6A_MANOEUVRE = Object.freeze({
  shakerMarginKt: 7, splitSMaxG: 5, rollRateDegPerSec: 90, splitSNoseUpDeg: 20, splitSRollG: 0.5,
});

const SPLIT_S_MIN_KIAS = 1;     // the point-mass step needs a speed; slower than this is a tail slide
const SPLIT_S_STEP_SEC = 0.02;
const SPLIT_S_MAX_SEC = 120;    // a guard: the slowest entry takes about 30 s (at 30,000 ft)

/**
 * The G a pull in the stick shaker gives at this speed: 1 G at the shaker
 * speed (stall + margin, 93 KIAS), growing with KIAS², at most maxG (the
 * envelope's 7 G unless told). With no margin it is the stall line.
 */
export function shakerG(kias, { stallKias = T6A_LIMITS.stallKias, marginKt = T6A_MANOEUVRE.shakerMarginKt, maxG = T6A_LIMITS.maxG } = {}) {
  return Math.min((kias / (stallKias + marginKt)) ** 2, maxG);
}

/**
 * The split S as the SMM flies it (14.16 para 41), at full power: raise the
 * nose to 20° up in the shaker, roll inverted at 0.5 G at the roll rate, then
 * pull through in the shaker until level, up to 5 G (Patrick's cap, not the
 * SMM's: its Table 14.1 gives about 4 G). Below the shaker speed
 * (93 KIAS) the nose can't come up without stalling, so the split S starts
 * with the roll: it gains no height first and loses about 300 ft more from
 * the entry, while the loss from the top hardly changes.
 *
 * options (each defaults to T6A_LIMITS or T6A_MANOEUVRE): stallKias,
 * marginKt, maxG (the pull's cap, default splitSMaxG), rollRateDegPerSec,
 * noseUpDeg, rollG, and rollLeft (default false: rolls right).
 * kias from 1 to VMO (316) and a finite altFt, or it throws a RangeError.
 *
 * Returns lossFt (the height lost from the entry altitude, Patrick's measure),
 * fromTopFt (from the top of the nose-up), exitKias, peakG, timeSec, turnDeg
 * (the heading change, −180 to 180°, + counter-clockwise: near ±180°, since
 * the split S reverses the heading), exitClimbDeg, exitUpright, and completed
 * (false when it could not pull through to level, for example with maxG at
 * 1 G, and stopped after 120 s). About 800 steps: fine for a readout or a
 * deck check, not once per frame.
 */
export function splitST6A(kias, altFt, options = {}) {
  if (!(kias >= SPLIT_S_MIN_KIAS && kias <= T6A_LIMITS.vmoKias && Number.isFinite(altFt))) {
    throw new RangeError(`split S from ${kias} KIAS at ${altFt} ft: needs ${SPLIT_S_MIN_KIAS} to ${T6A_LIMITS.vmoKias} KIAS and a finite height`);
  }
  const m = T6A_MANOEUVRE;
  const {
    stallKias = T6A_LIMITS.stallKias, marginKt = m.shakerMarginKt, maxG = m.splitSMaxG,
    rollRateDegPerSec = m.rollRateDegPerSec, noseUpDeg = m.splitSNoseUpDeg, rollG = m.splitSRollG, rollLeft = false,
  } = options;
  const shaker = { stallKias, marginKt, maxG };
  let s = pointMassState({ altFt, ktas: iasToTasKt(kias, altFt), headingRad: 0 });
  let t = 0, peakG = 0, topFt = altFt, bank = 0;
  const now = () => pointMassFlight(s);
  const pull = () => { const f = now(); return shakerG(tasToIasKt(f.ktas, f.altFt), shaker); };
  const fly = (g, bankRad) => {
    s = stepPointMass(s, { g, bankRad }, SPLIT_S_STEP_SEC, t6aExcessFn);
    t += SPLIT_S_STEP_SEC;
    peakG = Math.max(peakG, g);
    topFt = Math.max(topFt, s.z);
  };
  const going = () => t < SPLIT_S_MAX_SEC;
  const noseUp = noseUpDeg * Math.PI / 180;
  while (now().climbRad < noseUp && pull() > 1 && going()) fly(pull(), 0);
  const side = rollLeft ? -1 : 1;
  while (bank < Math.PI && going()) {
    bank = Math.min(Math.PI, bank + rollRateDegPerSec * Math.PI / 180 * SPLIT_S_STEP_SEC);
    fly(rollG, side * bank);
  }
  let down = false, completed = false;
  while (going()) {
    const climb = now().climbRad;
    if (climb < 0) down = true;
    if (down && climb >= 0) { completed = true; break; }
    fly(pull(), side * Math.PI);
  }
  const f = now();
  return {
    lossFt: altFt - s.z,
    fromTopFt: topFt - s.z,
    exitKias: tasToIasKt(f.ktas, f.altFt),
    peakG,
    timeSec: t,
    turnDeg: f.headingRad * 180 / Math.PI,
    exitClimbDeg: f.climbRad * 180 / Math.PI,
    // With the bank at 180°, the lift points up (upright) when the carried up points down.
    exitUpright: Math.cos(bank) * s.up.z > 0,
    completed,
  };
}
