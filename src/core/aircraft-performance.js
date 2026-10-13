// One aircraft's performance set, built from its numbers (Traffic plan Step 5c Phase 1; spec 4.19; TR-162).
//
// The formulas here are the ones the T-6A has always used (they were written for it in t6-performance.js and moved
// here unchanged): the stall line, the G available, the roll and G onset limits, full-power thrust, drag, pitch
// attitude, the glide and the stick shaker. makePerformance closes them over one aircraft's numbers, so a second
// aircraft (the CT-102B Astra II, ct102b-performance.js) is a second set of numbers, never a second copy of a formula.
// t6-performance.js builds the T-6A's set with it and keeps every name it always exported.
//
// Speeds are knots: KIAS where the numbers use indicated airspeed, KTAS where the motion needs true airspeed.
// Altitudes are feet, pressure altitude on a standard day. G is the load factor.
import { FT_PER_NM, KT_TO_FTPS } from './units.js';
import { isaDensityRatio, isaPressureRatio, speedOfSoundKt } from './atmosphere.js';

// ── Airspeed: the same for every aircraft (moved here from t6-performance.js, which still exports them) ──

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

/** The glide configurations whose drag carries the gear's extra drag, unless a set names its own. */
const GEAR_DOWN_CONFIGS = Object.freeze(['gearDown', 'flapsTakeoff', 'landing']);

/**
 * Builds one aircraft's performance set from its numbers. Each group is the shape the T-6A's has always had:
 *  - name: words for messages, for example 'T-6A' or 'CT-102B Astra II'.
 *  - fit: thrust and drag, { dragA, dragB, thrustK, thrustV0Kt, thrustDensityExp, thrustFlatSigma } (T6A_FIT's shape).
 *    Thrust ÷ weight = thrustK × min(σ, thrustFlatSigma)^thrustDensityExp ÷ (KTAS + thrustV0Kt);
 *    drag ÷ weight = dragA × KIAS² + dragB × G² ÷ KIAS².
 *  - limits: { maxG, minG, rollingMaxG, rollingMinG, stallKias, voKias, vmoKias, mmo, weightLb } (T6A_LIMITS' shape);
 *    mmo may be null where no Mach limit applies, and then the top speed is vmoKias at every height.
 *  - roll: { rollPerKtasDps, maxRateDps, fullRateSec, onsetSec } (T6A_ROLL's shape).
 *  - gOnset: { maxRateDps, maxAccelDps2 } (T6A_G_ONSET's shape).
 *  - pitch: { aoa180Deg, datumDeg, takeoffFlapAoADeg, landingFlapAoADeg, onGearDeg, aoaMinKias? } (T6A_PITCH's shape);
 *    aoaMinKias is the speed below which the angle of attack stops growing (60 KIAS unless the set gives its own).
 *  - glide: { table, gearDragFactor, gearConfigs? } or null when the aircraft has no glide data: table is T6A_GLIDE's
 *    shape. With null, every glide function throws a RangeError (spec 4.19 item 8: a missing number is never invented).
 *  - manoeuvre: { shakerMarginKt, ... } (T6A_MANOEUVRE's shape) or null; with null, shakerG throws unless marginKt is passed.
 *  - sources: optional, each number's source status ({ status, note }), for the screen's estimate flags (spec 4.19
 *    item 5). Not read by any formula.
 * The groups are kept on the set as given (the same objects), so a set's numbers can be read back.
 */
export function makePerformance({ name, fit, limits, roll, gOnset, pitch, glide = null, manoeuvre = null, sources = null }) {
  const aoaMinKias = pitch.aoaMinKias ?? 60;
  const gearConfigs = glide?.gearConfigs ?? GEAR_DOWN_CONFIGS;

  /** The most G the wing gives at this speed before it stalls: (KIAS ÷ stall speed)². */
  function stallLimitG(kias, stallKias = limits.stallKias) {
    return (kias / stallKias) ** 2;
  }

  /** The G the aircraft can pull now: the stall line, capped at maxG (rollingMaxG while rolling). */
  function availableG(kias, rolling = false, stallKias = limits.stallKias) {
    return Math.min(stallLimitG(kias, stallKias), rolling ? limits.rollingMaxG : limits.maxG);
  }

  /** The roll limits at a true airspeed (knots), in easeRoll's shape { maxRateDps, maxAccelDps2 }. */
  function rollLimitsAtKtas(ktas) {
    const maxRateDps = Math.min(roll.maxRateDps, roll.rollPerKtasDps * Math.max(0, ktas));
    return { maxRateDps, maxAccelDps2: maxRateDps / roll.fullRateSec };
  }

  /** A module's roll limits held under the aircraft's at a true airspeed: the lower rate and acceleration of the two. */
  function rollWithin(pilotLimits, ktas) {
    const own = rollLimitsAtKtas(ktas);
    return { maxRateDps: Math.min(pilotLimits.maxRateDps, own.maxRateDps), maxAccelDps2: Math.min(pilotLimits.maxAccelDps2, own.maxAccelDps2) };
  }

  /** The fastest the aircraft may fly at altFt, in KIAS (the indicator's reading): vmoKias, or mmo where that is slower. */
  function maxKias(altFt) {
    if (limits.mmo == null) return limits.vmoKias;
    return Math.min(limits.vmoKias, machToKiasKt(limits.mmo, altFt));
  }

  /** The same limit on the model's own IAS (TAS × √σ, no compressibility), for holding a flown aircraft to it. */
  function modelMaxIas(altFt) {
    if (limits.mmo == null) return limits.vmoKias;
    return Math.min(limits.vmoKias, tasToIasKt(limits.mmo * speedOfSoundKt(altFt), altFt));
  }

  /** Maximum-power thrust ÷ weight: falls with true airspeed, holds up to the flat-rating height, then falls with density. */
  function thrustPerWeight(kias, altFt) {
    const f = fit;
    const sigma = Math.min(isaDensityRatio(altFt), f.thrustFlatSigma);
    return f.thrustK * sigma ** f.thrustDensityExp / (iasToTasKt(kias, altFt) + f.thrustV0Kt);
  }

  /** Drag ÷ weight, clean: a zero-lift part growing with KIAS² and a part growing with G² ÷ KIAS². altFt for a like signature. */
  function dragPerWeight(kias, altFt, g) {
    const f = fit;
    return f.dragA * kias * kias + f.dragB * g * g / (kias * kias);
  }

  /** (Thrust − drag) ÷ weight at maximum power: what is left to climb or speed up with. */
  function excessThrustPerWeight(kias, altFt, g) {
    return thrustPerWeight(kias, altFt) - dragPerWeight(kias, altFt, g);
  }

  /** excessThrustPerWeight as stepPointMass's excessFn, which passes true airspeed. */
  function excessFn(ktas, altFt, g) {
    return excessThrustPerWeight(tasToIasKt(ktas, altFt), altFt, g);
  }

  /** The excess-power callback at part throttle: thrust scales with `throttle` (0 to 1), drag does not. Full throttle is excessFn itself. */
  function excessFnFor(throttle) {
    if (throttle === 1) return excessFn;
    return (ktas, altFt, g) => {
      const kias = tasToIasKt(ktas, altFt);
      return throttle * thrustPerWeight(kias, altFt) - dragPerWeight(kias, altFt, g);
    };
  }

  /** Delta angle of attack from the flap configuration, in degrees (flap lowers the body angle a given lift needs). */
  function flapAoADeltaDeg(config) {
    if (!config || typeof config !== 'string') return 0;
    const c = config.toLowerCase();
    if (c.includes('land') || c === 'landing') return pitch.landingFlapAoADeg;
    if (c.includes('t/o') || c.includes('takeoff') || c.includes('take-off')) return pitch.takeoffFlapAoADeg;
    return 0;
  }

  /**
   * Pitch attitude in degrees, nose up positive: flight path angle (climb rate ÷ true airspeed, both ft/s) plus the
   * angle of attack, aoa180Deg × G × (180 ÷ KIAS)², adjusted for the flap configuration when given.
   */
  function pitchDegFromClimb(climbFtps, tasFtps, kias, g = 1, config = null) {
    const gamma = Math.asin(Math.max(-1, Math.min(1, climbFtps / Math.max(tasFtps, 1)))) * 180 / Math.PI;
    const flapDelta = flapAoADeltaDeg(config);
    return gamma + pitch.aoa180Deg * g * (180 / Math.max(kias, aoaMinKias)) ** 2 + flapDelta;
  }

  /** The attitude the pilot sees: pitchDegFromClimb less the fuselage datum (pitch.datumDeg). */
  function attitudeDegFromClimb(climbFtps, tasFtps, kias, g = 1, config = null) {
    return pitchDegFromClimb(climbFtps, tasFtps, kias, g, config) - pitch.datumDeg;
  }

  /** The glide table, or a RangeError naming the aircraft when it has none. */
  function glideTable() {
    if (!glide) throw new RangeError(`${name} has no glide data`);
    return glide.table;
  }

  /** The glide ratio through the air for a configuration: feet flown for each foot of height lost. */
  function glideRatio(config) {
    const table = glideTable();
    if (!Object.hasOwn(table, config)) throw new RangeError(`glide configuration ${config}: use one of ${Object.keys(table).join(', ')}`);
    return table[config].nmPer1000Ft * FT_PER_NM / 1000;
  }

  /** Sink rate in ft/min for a glide configuration at kias and altFt: true airspeed ÷ the glide ratio. */
  function glideSinkFpm(config, kias, altFt) {
    return iasToTasKt(kias, altFt) * KT_TO_FTPS * 60 / glideRatio(config);
  }

  /**
   * Drag ÷ weight, engine off, for a glide configuration: the clean drag fit with its zero-lift part raised so the
   * configuration's best glide ratio is the table's (dragA × (clean ratio ÷ its ratio)²), plus the gear's extra drag
   * (gearDragFactor) in the gear-down configurations.
   */
  function glideDragPerWeight(config, kias, altFt, g = 1) {
    glideTable();
    const ref = (c) => fit.dragA * (glideRatio('clean') / glideRatio(c)) ** 2 * kias * kias + fit.dragB * g * g / (kias * kias);
    return ref(config) + (gearConfigs.includes(config) ? (glide.gearDragFactor - 1) * ref('gearDown') : 0);
  }

  /**
   * The G a pull in the stick shaker gives at this speed: 1 G at the shaker speed (stall + margin), growing with
   * KIAS², at most maxG. With no margin it is the stall line.
   */
  function shakerG(kias, { stallKias = limits.stallKias, marginKt = manoeuvre?.shakerMarginKt, maxG = limits.maxG } = {}) {
    if (marginKt === undefined) throw new RangeError(`${name} has no stick-shaker margin: pass marginKt`);
    return Math.min((kias / (stallKias + marginKt)) ** 2, maxG);
  }

  return Object.freeze({
    name, fit, limits, roll, gOnset, pitch, glide, manoeuvre, sources,
    stallLimitG, availableG, rollLimitsAtKtas, rollWithin, maxKias, modelMaxIas,
    thrustPerWeight, dragPerWeight, excessThrustPerWeight, excessFn, excessFnFor,
    pitchDegFromClimb, attitudeDegFromClimb,
    glideRatio, glideSinkFpm, glideDragPerWeight, shakerG,
  });
}

/** The names of a set's numbers whose source status is 'estimate' (empty when the set carries no sources). */
export function estimatesIn(perf) {
  const s = perf?.sources;
  return s ? Object.keys(s).filter((k) => s[k]?.status === 'estimate') : [];
}
