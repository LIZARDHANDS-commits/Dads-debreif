// The one T-6A performance model every module reads (SPEC-core, "API, fifth
// PR"; Patrick, 2026-09-30 06:58Z). V6 has none of this: it is new. Since
// 12 Oct 2026 it is built from formulas with named inputs, each with its
// source: a public type certificate or manufacturer sheet, an SMM, EFIG or
// Gen Book page, one of Patrick's rulings, or the word ESTIMATE (spec section
// "API, fifth PR: T-6A performance"). Each module keeps its own flying; this
// only holds the aircraft's numbers.
//
// Speeds are knots: KIAS where a source gives indicated airspeed, KTAS where
// the motion needs true airspeed. Altitudes are feet, pressure altitude on a
// standard day. G is the load factor. Weights are pounds.
import { FT_PER_NM, G_FTPS2, KT_TO_FTPS } from './units.js';
import { isaDensityRatio, isaPressureRatio, speedOfSoundKt } from './atmosphere.js';
import { stepPointMass, pointMassState, pointMassFlight } from './point-mass.js';

/**
 * The T-6A's G, speed and weight limits.
 * - maxG, minG +7 and -3.5; rollingMaxG, rollingMinG +4.7 and -1: the type
 *   certificates (EASA.IM.A.636, UK.TC.A.00092); the rolling limits from
 *   Germann 2006, p.17.
 * - stallKias: the 1 G clean stall, 86 KIAS (Patrick's ruling, 30 Sep 2026
 *   09:29Z). It stays 86 at every weight until Patrick says otherwise (spec
 *   question 2). 7 G at 227.5 KIAS matching VO (227) is a coincidence.
 * - voKias 227 (manoeuvring), vmoKias 316, mmo 0.67, gearFlapKias 150: the
 *   type certificates. Mach 0.67 is slower than 316 KIAS from about 18,900 ft;
 *   maxKiasT6A gives the top speed at a height.
 * - weightLb: the sortie weight every function uses unless told, 6,400 lb (two
 *   pilots and 1,200 lb of fuel on a 4,824 lb empty aircraft: Germann 2006,
 *   Table 9, a published example). Patrick's typical weights replace it.
 * - basicWeightLb 5,170 (Textron T-6C brochure); maxWeightLb 6,900 (certified,
 *   EASA.IM.A.636); operatedMaxWeightLb 6,500 (as the trainer is operated,
 *   Germann 2006, p.17). A weight outside basic to maximum throws.
 */
export const T6A_LIMITS = Object.freeze({
  maxG: 7, minG: -3.5, rollingMaxG: 4.7, rollingMinG: -1,
  stallKias: 86, voKias: 227, vmoKias: 316, mmo: 0.67, gearFlapKias: 150,
  weightLb: 6400, basicWeightLb: 5170, maxWeightLb: 6900, operatedMaxWeightLb: 6500,
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
 *    airspeed), capped at maxRateDps: about 100°/s at 200 KIAS and 8,000 ft, the cap from about 265 KTAS. The audit's examples
 *    (65°/s at 140 KIAS, 90 at 200, 115 at 250) are the same rule read with KIAS, about 13% lower at 8,000 ft;
 *  - roll acceleration: full rate in fullRateSec;
 *  - G onset (T6A_G_ONSET): 4 G per second, building at 16 G/s² (the Formation fluid Lead's number, design 5.3).
 * A module's own gentler rate (a pilot's) is its choice; it never goes past these (rollWithinT6A).
 */
export const T6A_ROLL = Object.freeze({ rollPerKtasDps: 0.45, maxRateDps: 120, fullRateSec: 0.3 });
/** The T-6A's G onset in easeValue's shape (flight-math.js): G per second, and per second². An estimate (T6A_ROLL). */
export const T6A_G_ONSET = Object.freeze({ maxRateDps: 4, maxAccelDps2: 16 });

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
 * The fastest the T-6A may fly at altFt, in KIAS, from the type certificates'
 * limits: VMO 316, or Mmo 0.67 where that is slower (above about
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

// ── Thrust and drag: formulas with named inputs (spec, "API, fifth PR: T-6A performance") ──

/** Standard-day sea-level density, slug per cubic foot: dynamic pressure from indicated airspeed, q = ½ ρ₀ V². */
const RHO0_SLUG_FT3 = 0.0023769;
const FT_LBF_PER_S_PER_HP = 550;

/**
 * The airframe: wing area 175.3 sq ft and span 33 ft 5 in (Textron T-6C brochure; published); aspect ratio 6.29 (a
 * public PC-9 listing; published).
 */
export const T6A_AIRFRAME = Object.freeze({ wingAreaSqFt: 175.3, spanFt: 33 + 5 / 12, aspectRatio: 6.29 });

/**
 * The engine.
 * - shaftHp 1,100: flat-rated, 100% torque at 2,000 rpm (EASA.IM.A.636; certified).
 * - propRpm 2,000 (100% is 1,995) and propDiameterIn 97, four blades (EASA.IM.A.636, UK.TC.A.00092, EASA.IM.E.038;
 *   certified).
 * - flatRatedToSigma 0.64 and lapseExp 0.85: full power is held to a density ratio of 0.64 (about 14,500 ft on a
 *   standard day), then falls as (σ ÷ 0.64)^0.85. ESTIMATE: the certificate gives only the sea-level corner.
 * - exhaustThrustLb 160: the exhaust's own thrust at full power (EASA.IM.E.038 gives 185 lbf static at 1,250 shp,
 *   scaled to 1,100), falling with speed to nothing at exhaustZeroKtas 400 KTAS. ESTIMATES.
 */
export const T6A_ENGINE = Object.freeze({
  shaftHp: 1100, propRpm: 2000, propDiameterIn: 97,
  flatRatedToSigma: 0.64, lapseExp: 0.85, exhaustThrustLb: 160, exhaustZeroKtas: 400,
});

/**
 * The propeller's efficiency against its advance ratio J, true airspeed ÷ (revolutions per second × diameter): J 1 is
 * about 160 KTAS at 2,000 rpm. ESTIMATES, all of it: a generic constant-speed curve (the shape of the NACA propeller
 * maps), fitted to the EFIG's level torque table (EFIG p.222) and Patrick's level torque points (12 Oct 2026 00:13Z).
 * - peakEfficiency 0.80 at peakAdvanceRatio 1.8 (about 290 KTAS); at pattern height it is 0.73 at 140 KIAS, 0.78 at
 *   180 and about 0.80 from 220 to 300.
 * - staticThrustLb 3,500: the thrust standing still, which sets how the curve rises from J 0 (momentum theory on the
 *   97 in disc at 1,100 shp, with a figure of merit about 0.7).
 * - fallWidth 1.1: how fast the efficiency falls past the peak, as the blade tips near the speed of sound.
 * The low-speed end is the least sure: one more torque point there (Patrick) or a measured climb would pin it.
 */
export const T6A_PROP = Object.freeze({ peakEfficiency: 0.8, peakAdvanceRatio: 1.8, staticThrustLb: 3500, fallWidth: 1.1 });

/** Revolutions per second × diameter, ft/s: true airspeed ÷ this is the advance ratio. */
const PROP_ND_FTPS = T6A_ENGINE.propRpm / 60 * (T6A_ENGINE.propDiameterIn / 12);
const FULL_POWER_FT_LBF_S = T6A_ENGINE.shaftHp * FT_LBF_PER_S_PER_HP;
// How steeply the curve rises from J 0, set by the static thrust: at J 0, efficiency ÷ J = static thrust × nD ÷ power.
const PROP_RISE_EXP = T6A_PROP.staticThrustLb * PROP_ND_FTPS * T6A_PROP.peakAdvanceRatio / (FULL_POWER_FT_LBF_S * T6A_PROP.peakEfficiency);

/** The propeller's efficiency at advance ratio j (T6A_PROP): rising from 0 to the peak, then falling. Estimates. */
function propEfficiency(j) {
  const p = T6A_PROP;
  if (j <= p.peakAdvanceRatio) return p.peakEfficiency * (1 - (1 - Math.max(0, j) / p.peakAdvanceRatio) ** PROP_RISE_EXP);
  return p.peakEfficiency * Math.exp(-(((j - p.peakAdvanceRatio) / p.fallWidth) ** 2));
}

/** Full-throttle shaft power as a share of 1,100 shp at altFt (T6A_ENGINE): flat-rated, then falling with density. */
function powerLapse(altFt) {
  return Math.min(1, (isaDensityRatio(altFt) / T6A_ENGINE.flatRatedToSigma) ** T6A_ENGINE.lapseExp);
}

/** Full-throttle thrust in lbf: propeller (efficiency × power ÷ true airspeed) plus the exhaust. */
function fullThrustLb(kias, altFt) {
  const ktas = iasToTasKt(kias, altFt);
  const v = ktas * KT_TO_FTPS;
  const lapse = powerLapse(altFt);
  const prop = propEfficiency(v / PROP_ND_FTPS) * FULL_POWER_FT_LBF_S * lapse / v;
  const exhaust = T6A_ENGINE.exhaustThrustLb * lapse * Math.max(0, 1 - ktas / T6A_ENGINE.exhaustZeroKtas);
  return prop + exhaust;
}

/**
 * The inputs every thrust and drag function checks: a speed of at least 1 KIAS (the formulas divide by it), a finite
 * height and G, and a weight from basic to maximum (T6A_LIMITS). Speeds over VMO are flown, not refused: VMO is a
 * published limit, flagged on screen, never a wall (AGENTS.md). Anything else throws a RangeError.
 */
function checkInputs(what, kias, altFt, g, weightLb) {
  if (!(kias >= 1 && kias < Infinity && Number.isFinite(altFt) && Number.isFinite(g)
    && weightLb >= T6A_LIMITS.basicWeightLb && weightLb <= T6A_LIMITS.maxWeightLb)) {
    throw new RangeError(`${what} at ${kias} KIAS, ${altFt} ft, ${g} G and ${weightLb} lb: needs at least 1 KIAS, a finite height and G, and ${T6A_LIMITS.basicWeightLb} to ${T6A_LIMITS.maxWeightLb} lb`);
  }
}

/** Dynamic pressure in lb per sq ft at an indicated airspeed. */
function qPsf(kias) {
  const v = kias * KT_TO_FTPS;
  return 0.5 * RHO0_SLUG_FT3 * v * v;
}

/**
 * Maximum-power thrust ÷ weight at kias, altFt and weightLb (6,400 lb unless told): the propeller's efficiency
 * (T6A_PROP) × the shaft power (T6A_ENGINE, flat-rated to about 14,500 ft) ÷ true airspeed, plus the exhaust. Part
 * throttle scales all of it (excessFnFor).
 */
export function thrustPerWeight(kias, altFt, weightLb = T6A_LIMITS.weightLb) {
  checkInputs('thrust', kias, altFt, 1, weightLb);
  return fullThrustLb(kias, altFt) / weightLb;
}

/**
 * The drag polar, clean: CD = zeroLiftCd + CL² ÷ (π × aspect ratio × spanEfficiency) + the rise near the stall.
 * - zeroLiftCd 0.028: derived from Patrick's level torque points (180 KIAS at 45%, 220 KIAS at 65%; 12 Oct 2026
 *   00:13Z; SMM 4.14 para 32) with the propeller curve (T6A_PROP). Draggier than a textbook 0.020 to 0.024.
 * - spanEfficiency 0.8: ESTIMATE (0.75 to 0.85 for a straight tapered wing).
 * - stallRiseCd 0.04 over the last stallRiseKt 10 kt: the polar steepens as the wing nears the stall line, from nothing
 *   10 kt above it (at 1 G, 96 KIAS) to 0.04 on it, growing with the square of how far in, and held there past it.
 *   ESTIMATE, standard aerodynamics.
 */
export const T6A_DRAG = Object.freeze({ zeroLiftCd: 0.028, spanEfficiency: 0.8, stallRiseCd: 0.04, stallRiseKt: 10 });

/** The induced drag factor, 1 ÷ (π × aspect ratio × span efficiency): the induced part of CD is this × CL². */
const INDUCED_K = 1 / (Math.PI * T6A_AIRFRAME.aspectRatio * T6A_DRAG.spanEfficiency);
// The rise starts where the load is this share of the stall line's: (86 ÷ 96)² at 1 G.
const STALL_RISE_FROM = (T6A_LIMITS.stallKias / (T6A_LIMITS.stallKias + T6A_DRAG.stallRiseKt)) ** 2;

/**
 * The extra drag coefficient near the stall line at kias and g (T6A_DRAG): nothing until 10 kt above it, the whole
 * 0.04 on it, and no more past it (beyond the stall line the wing is stalled and the polar does not apply).
 */
function stallRiseCd(kias, g) {
  const share = Math.min(1, Math.abs(g) / stallLimitG(kias));
  if (share <= STALL_RISE_FROM) return 0;
  return T6A_DRAG.stallRiseCd * ((share - STALL_RISE_FROM) / (1 - STALL_RISE_FROM)) ** 2;
}

/** Lift coefficient at kias, g and weightLb: CL = n W ÷ (q S). */
function liftCoefficient(kias, g, weightLb) {
  return g * weightLb / (qPsf(kias) * T6A_AIRFRAME.wingAreaSqFt);
}

/**
 * The T-6A's best glide, engine off and propeller feathered, by configuration: glide speed (KIAS) and distance flown
 * (NM per 1,000 ft of height).
 * - clean 125 KIAS, 2.0 NM per 1,000 ft: SMM 13.5 paras 6 and 7.
 * - gearDown 105 KIAS, 1.5; landing (gear and landing flap) 95 KIAS, 1.1; windmilling (propeller not feathered,
 *   clean) 110 KIAS, 1.0: Patrick's ruling, to confirm (spec question 3).
 * - flapsTakeoff (gear and takeoff flap) 110 KIAS, 1.3: an ESTIMATE between gear down and landing flap; no source
 *   gives it (Patrick, 4 Oct 2026 04:18Z).
 * The ratio is fixed through the air, so the sink rate grows with height (glideSinkFpm).
 */
export const T6A_GLIDE = Object.freeze({
  clean: Object.freeze({ kias: 125, nmPer1000Ft: 2.0, prop: 'feathered' }),
  gearDown: Object.freeze({ kias: 105, nmPer1000Ft: 1.5, prop: 'feathered' }),
  flapsTakeoff: Object.freeze({ kias: 110, nmPer1000Ft: 1.3, prop: 'feathered' }),
  landing: Object.freeze({ kias: 95, nmPer1000Ft: 1.1, prop: 'feathered' }),
  windmilling: Object.freeze({ kias: 110, nmPer1000Ft: 1.0, prop: 'windmilling' }),
});

/**
 * The glide ratio through the air for a T6A_GLIDE configuration: feet flown for each foot of height lost (clean 2 NM
 * per 1,000 ft is about 12.2). A configuration not in T6A_GLIDE throws a RangeError.
 */
export function glideRatio(config) {
  if (!Object.hasOwn(T6A_GLIDE, config)) throw new RangeError(`glide configuration ${config}: use one of ${Object.keys(T6A_GLIDE).join(', ')}`);
  return T6A_GLIDE[config].nmPer1000Ft * FT_PER_NM / 1000;
}

/**
 * Sink rate in ft/min for a T6A_GLIDE configuration at kias and altFt: true airspeed ÷ the glide ratio, so it grows
 * with height.
 */
export function glideSinkFpm(config, kias, altFt) {
  return iasToTasKt(kias, altFt) * KT_TO_FTPS * 60 / glideRatio(config);
}

/**
 * The engine-off zero-lift drag coefficient for a T6A_GLIDE configuration: the one that makes the polar's best
 * lift-to-drag ratio the table's glide ratio, 1 ÷ (4 × induced factor × ratio²). Standard aerodynamics.
 */
function glideZeroLiftCd(config) {
  return 1 / (4 * INDUCED_K * glideRatio(config) ** 2);
}

/** Engine-off drag ÷ weight from the glide table alone, for a configuration. */
function glideTableDragPerWeight(config, kias, g, weightLb) {
  const cl = liftCoefficient(kias, g, weightLb);
  return qPsf(kias) * T6A_AIRFRAME.wingAreaSqFt * (glideZeroLiftCd(config) + INDUCED_K * cl * cl) / weightLb;
}

/**
 * The gear-down orbit: a 30° bank orbit at 120 KIAS, gear down, flaps up, engine off, loses about 2,600 ft per turn
 * (SMM 13.5 para 11). Patrick (6 Oct 2026 08:24Z): "base it on the drag that's required to lose 2600 in a 30 deg orbit
 * with gear no flaps". Flown at 3,500 ft and the default weight.
 */
const GEAR_ORBIT = Object.freeze({ kias: 120, altFt: 3500, bankDeg: 30, lossFt: 2600 });

/**
 * Engine-off gear-down drag ÷ the glide table's, so the orbit above loses its 2,600 ft (Patrick, 6 Oct 2026). Derived
 * from the orbit: the loss per turn is drag ÷ weight × 2π V² ÷ (g tan bank).
 */
const GEAR_DRAG_FACTOR = (() => {
  const o = GEAR_ORBIT, bank = o.bankDeg * Math.PI / 180;
  const v = iasToTasKt(o.kias, o.altFt) * KT_TO_FTPS;
  const needed = o.lossFt * G_FTPS2 * Math.tan(bank) / (2 * Math.PI * v * v);
  return needed / glideTableDragPerWeight('gearDown', o.kias, 1 / Math.cos(bank), T6A_LIMITS.weightLb);
})();

/**
 * Drag ÷ weight, engine off and propeller feathered (windmilling for 'windmilling'), for a T6A_GLIDE configuration at
 * kias, altFt, g and weightLb (6,400 lb unless told). Each configuration's zero-lift drag is set so its best glide
 * ratio is the table's (glideZeroLiftCd); with the gear down the gear's drag is raised to the 2,600 ft orbit
 * (GEAR_DRAG_FACTOR), and the flaps' steps from the table go on top of it. At a given IAS it is the same at any height.
 */
export function glideDragPerWeight(config, kias, altFt, g = 1, weightLb = T6A_LIMITS.weightLb) {
  glideRatio(config);
  checkInputs('glide drag', kias, altFt, g, weightLb);
  const table = glideTableDragPerWeight(config, kias, g, weightLb);
  const gear = ['gearDown', 'flapsTakeoff', 'landing'].includes(config);
  return table + (gear ? (GEAR_DRAG_FACTOR - 1) * glideTableDragPerWeight('gearDown', kias, g, weightLb) : 0);
}

/**
 * Level flight at 120 KIAS with the gear down and takeoff flap takes about 35% torque at pattern height on a standard
 * day (Patrick, 12 Oct 2026 00:13Z; EFIG p.222). Taken at 2,000 ft and the default weight.
 */
const TAKEOFF_FLAP_LEVEL = Object.freeze({ kias: 120, altFt: 2000, torque: 0.35 });

/**
 * The step each configuration adds to the clean zero-lift drag with the engine running (dragPerWeight's config).
 * - gearDown: the glide table's gear-down step over clean (Patrick's ruling, to confirm). The 2,600 ft orbit's extra
 *   drag is the engine-off glide's only (GEAR_DRAG_FACTOR).
 * - flapsTakeoff (gear and takeoff flap): set so level flight at 120 KIAS takes 35% torque (TAKEOFF_FLAP_LEVEL;
 *   Patrick, 12 Oct 2026).
 * - landing (gear and landing flap): the glide table's landing-flap step over clean, so the glide table comes out.
 * Derived at load from those sources; no other number is set here.
 */
export const T6A_CONFIG_DRAG = (() => {
  const step = (config) => glideZeroLiftCd(config) - glideZeroLiftCd('clean');
  const p = TAKEOFF_FLAP_LEVEL;
  const cl = liftCoefficient(p.kias, 1, T6A_LIMITS.weightLb);
  const neededCd = p.torque * fullThrustLb(p.kias, p.altFt) / (qPsf(p.kias) * T6A_AIRFRAME.wingAreaSqFt);
  const flapsTakeoff = neededCd - T6A_DRAG.zeroLiftCd - INDUCED_K * cl * cl - stallRiseCd(p.kias, 1);
  return Object.freeze({ clean: 0, gearDown: step('gearDown'), flapsTakeoff, landing: step('landing') });
})();

/**
 * Drag ÷ weight with the engine running, at kias, altFt, g, a configuration ('clean' unless told; 'gearDown',
 * 'flapsTakeoff' or 'landing', T6A_CONFIG_DRAG) and weightLb (6,400 lb unless told): q S CD ÷ W, the polar in
 * T6A_DRAG. At a given IAS it is the same at any height; altFt is there so every function reads alike.
 */
export function dragPerWeight(kias, altFt, g, config = 'clean', weightLb = T6A_LIMITS.weightLb) {
  if (!Object.hasOwn(T6A_CONFIG_DRAG, config)) throw new RangeError(`drag configuration ${config}: use one of ${Object.keys(T6A_CONFIG_DRAG).join(', ')}`);
  checkInputs('drag', kias, altFt, g, weightLb);
  const cl = liftCoefficient(kias, g, weightLb);
  const cd = T6A_DRAG.zeroLiftCd + T6A_CONFIG_DRAG[config] + INDUCED_K * cl * cl + stallRiseCd(kias, g);
  return qPsf(kias) * T6A_AIRFRAME.wingAreaSqFt * cd / weightLb;
}

/** (Thrust − drag) ÷ weight at maximum power: what is left to climb or speed up with. config and weightLb as dragPerWeight. */
export function excessThrustPerWeight(kias, altFt, g, config = 'clean', weightLb = T6A_LIMITS.weightLb) {
  return thrustPerWeight(kias, altFt, weightLb) - dragPerWeight(kias, altFt, g, config, weightLb);
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
 * for a given lift coefficient. ESTIMATES.
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

// The zoom after an engine failure (Patrick's practice; SMM 13.5 para 6 for the 125 KIAS glide after it): 2 s, a 2 G
// pull to 20° nose up, held to 145 KIAS, then a gentle push to 125 KIAS. None at or below 150 KIAS.
const ZOOM_MIN_KIAS = 150;      // at or below it, a level slow-down to the glide speed instead (Patrick's practice)
const ZOOM_GLIDE_KIAS = 125;    // SMM 13.5 para 6
const ZOOM_PUSH_G = 0.25;       // the gentle push; ESTIMATE
const ZOOM_STEP_SEC = 0.02;
const ZOOM_PITCH_GAIN = 5;      // extra G per radian off the 20° climb, to hold it
const ZOOM_MAX_SEC = 120;       // no zoom or slow-down takes this long; a guard, never reached

/**
 * The zoom after an engine failure, flown by the point-mass step with the engine off (drag only, clean): 2 s straight
 * and level, a 2 G pull to 20° nose up held to 145 KIAS, then a 0.25 G push until 125 KIAS or the clean glide path. At
 * or below 150 KIAS, a level slow-down to 125 KIAS instead. kias from 0 to VMO (316), a finite altFt and a weightLb
 * from basic to maximum (6,400 lb unless told), or it throws a RangeError. Returns the height gained, the time and the
 * distance over the ground in still air. About 1,000 steps: fine once per engine failure, not once per frame.
 */
export function flyZoomT6A(kias, altFt, weightLb = T6A_LIMITS.weightLb) {
  if (!(kias >= 0 && kias <= T6A_LIMITS.vmoKias && Number.isFinite(altFt)
    && weightLb >= T6A_LIMITS.basicWeightLb && weightLb <= T6A_LIMITS.maxWeightLb)) {
    throw new RangeError(`zoom from ${kias} KIAS at ${altFt} ft and ${weightLb} lb: needs 0 to ${T6A_LIMITS.vmoKias} KIAS, a finite height and ${T6A_LIMITS.basicWeightLb} to ${T6A_LIMITS.maxWeightLb} lb`);
  }
  const engineOff = (ktas, alt, g) => -dragPerWeight(tasToIasKt(ktas, alt), alt, g, 'clean', weightLb);
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
    const glidePath = -Math.atan(1 / glideRatio('clean'));
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
 * How the model flies a manoeuvre (Patrick, 2026-09-30 09:27Z; SMM 14.16).
 * - shakerMarginKt: pulls fly in the stick shaker, not on the stall line. The
 *   shaker comes on 7 kt above the stall (Patrick's ruling, 30 Sep 2026).
 * - splitSMaxG: the most G the split S pulls; Patrick: "Split S goes up to 5 G"
 *   (SMM Table 14.1 gives about 4 G).
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
 * certificates' +7 G unless told). With no margin it is the stall line.
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
