// The CT-102B Astra II's performance set (Grob G 120TP), for Traffic's second pattern (spec 4.19; plan Step 5c
// Phase 1; TR-161). The same formulas as the T-6A (aircraft-performance.js makePerformance) with the Astra's numbers.
//
// There is no Astra manual in the project files, so no number here is a manual number. Each number says where it
// stands:
//  - "type certificate": the EASA type certificate data sheet EASA.A.565, G 120TP, issue 04 (the Astra sources
//    table, tools/blender/ct102b/sources.md row P2), read through a web-search summary only, unchecked;
//  - "public": a public fact sheet (the RCAF page, sources.md P1a) or a manufacturer's figure quoted in spec 4.19's
//    numbers table, read through search summaries only, unchecked;
//  - "estimate": no source yet. A number worked out from others by standard aerodynamics is an estimate too, with
//    the working beside it.
// The estimates are listed in CT102B_SOURCES so the screen can flag them (spec 4.19 item 5), and come off one by one
// as a manual page or Patrick's ruling backs them. Dad's pattern numbers (3,000 ft, 180 and 90 KIAS, TR-156) are
// how the Astra is flown, not what it can do, so they are not here: they belong to its pattern (plan Step 5c Phase 2b).
// Nothing here flies yet: Phase 1 only builds the set.
import { KT_TO_FTPS, SEA_LEVEL_DENSITY_SLUG_FT3 } from './units.js';
import { isaDensityRatio } from './atmosphere.js';
import { makePerformance } from './aircraft-performance.js';
import { T6A_LIMITS, T6A_ROLL, T6A_G_ONSET, T6A_PITCH } from './t6-performance.js';
import { T6A_FIT } from './t6a-turn-data.js';

/**
 * The airframe and engine, the numbers the fit below is worked from.
 *  - wingAreaSqFt 145.53 (13.52 m²), spanFt 33.83 (10.31 m), lengthFt 27.62 (8.42 m): type certificate (sources.md P2).
 *  - emptyWeightLb 2,414 (1,095 kg): public (RCAF page, sources.md P1a).
 *  - weightLb 3,200 (about 1,450 kg), the weight in the pattern: estimate (spec 4.19's table).
 *  - shaftHp 456, the Rolls-Royce M250-B17F: public, unchecked (spec 4.19's table).
 *  - climbFpm 2,100 at sea level, full power: public, unchecked (manufacturer's figure, spec 4.19's table). It drives
 *    the thrust fit (below), as the spec's table says. climbKias 100: estimate (spec 4.19's climb speed, TR-158).
 *  - cd0 0.025, oswaldE 0.8: estimates (standard values for a clean light turboprop trainer, spec 4.19's table).
 *  - propEfficiency 0.8 at cruiseKtas 180: estimate (spec 4.19's table; a fixed-pitch figure would be lower, a
 *    constant-speed propeller at cruise is about this).
 *  - flatRatedFt 10,000: estimate (spec 4.19's table): the turboprop holds its power to about there.
 */
export const CT102B_AIRFRAME = Object.freeze({
  wingAreaSqFt: 145.53,
  spanFt: 33.83,
  lengthFt: 27.62,
  emptyWeightLb: 2414,
  weightLb: 3200,
  shaftHp: 456,
  climbFpm: 2100,
  climbKias: 100,
  cd0: 0.025,
  oswaldE: 0.8,
  propEfficiency: 0.8,
  cruiseKtas: 180,
  flatRatedFt: 10000,
});

/**
 * The thrust and drag fit, in the T-6A fit's own form (T6A_FIT; aircraft-performance.js thrustPerWeight and
 * dragPerWeight), worked from CT102B_AIRFRAME by standard aerodynamics. Every constant is an estimate, because the
 * numbers it is worked from are public figures (unchecked) and estimates. Its working, with q = ½ρ₀V² and V in ft/s
 * from KIAS (indicated airspeed is equivalent airspeed here, no compressibility):
 *  - drag ÷ weight = q S CD0 ÷ W + G² W ÷ (q S π e AR), aspect ratio AR = span² ÷ S (7.86). So
 *    dragA = ½ρ₀(1.688)² S CD0 ÷ W (about 3.85e-6) and dragB = W ÷ (½ρ₀(1.688)² S π e AR) (about 329);
 *  - thrust ÷ weight = K ÷ (KTAS + V0) below the flat-rating height. A propeller's thrust is η × 550 × shp ÷ V, with
 *    η falling at low speed, which the V0 term gives. K and V0 are set by two points: at cruiseKtas η is
 *    propEfficiency (T ÷ W = η 550 shp ÷ (W × 1.688 × 180), about 0.206), and at climbKias at sea level the full-power
 *    climb is climbFpm (T ÷ W = D ÷ W at G = cos γ, plus sin γ = climb rate ÷ true airspeed, about 0.277). That gives
 *    V0 about 133 kt and K about 64.6, so η is about 0.56 at 90 KIAS, 0.60 at 100 and 0.85 at 200, and the static
 *    thrust about 1,560 lb (3.4 lb per shaft horsepower);
 *  - above the flat-rating height thrust falls with density to the T-6A fit's exponent (T6A_FIT, the PT6A-68's,
 *    about 0.88: another turboprop's, an estimate for the M250), so thrustK = K ÷ σ(10,000 ft)^0.88 and
 *    thrustFlatSigma = σ(10,000 ft), about 0.738.
 * The checks that it is sane (worked again in scratch, not pinned by a test): the full-power climb at 100 KIAS at sea
 * level comes out at the public 2,100 ft/min (it is fitted there), best rate about 2,150 ft/min near 120 KIAS;
 * 180 KIAS level at 3,000 ft needs about two thirds of full power (less than full power, as spec 4.19 asks); the top
 * level speed is about 213 KIAS at 3,000 ft; the best lift-to-drag ratio about 14 near 96 KIAS; the 68 KIAS stall
 * at 3,200 lb is a clean maximum lift coefficient of about 1.40, and 59 KIAS with landing flap about 1.87.
 */
function astraFit(a) {
  const qPerKt2 = 0.5 * SEA_LEVEL_DENSITY_SLUG_FT3 * KT_TO_FTPS * KT_TO_FTPS; // dynamic pressure per knot², lb/ft²
  const aspectRatio = a.spanFt * a.spanFt / a.wingAreaSqFt;
  const dragA = qPerKt2 * a.wingAreaSqFt * a.cd0 / a.weightLb;
  const dragB = a.weightLb / (qPerKt2 * a.wingAreaSqFt * Math.PI * a.oswaldE * aspectRatio);
  // The climb point: sea level, so KTAS = KIAS.
  const sinGamma = (a.climbFpm / 60) / (a.climbKias * KT_TO_FTPS);
  const cosGamma = Math.sqrt(1 - sinGamma * sinGamma);
  const twClimb = dragA * a.climbKias ** 2 + dragB * cosGamma ** 2 / a.climbKias ** 2 + sinGamma;
  // The cruise point: η × shaft power ÷ (weight × speed).
  const twCruise = a.propEfficiency * 550 * a.shaftHp / (a.weightLb * KT_TO_FTPS * a.cruiseKtas);
  const thrustV0Kt = (a.cruiseKtas * twCruise - a.climbKias * twClimb) / (twClimb - twCruise);
  const thrustFlatSigma = isaDensityRatio(a.flatRatedFt);
  const thrustK = twClimb * (a.climbKias + thrustV0Kt) / thrustFlatSigma ** T6A_FIT.thrustDensityExp;
  return Object.freeze({ dragA, dragB, thrustK, thrustV0Kt, thrustDensityExp: T6A_FIT.thrustDensityExp, thrustFlatSigma });
}

/** The Astra's thrust and drag constants, T6A_FIT's shape. Estimates (astraFit). */
export const CT102B_FIT = astraFit(CT102B_AIRFRAME);

/**
 * The Astra's limits, T6A_LIMITS' shape.
 *  - stallKias 68, the clean 1 G stall: estimate, the working value (public figures quoted for the G 120TP,
 *    unchecked; spec 4.19's table, the review's section 3.1). stallLandingKias 59, with landing flap: estimate, same.
 *  - maxG +6, minG −4: public (aerobatic category on the type certificate, as quoted), unchecked.
 *  - rollingMaxG 4.0, rollingMinG −1: estimates, the T-6A's rolling limits in proportion (4.7 of 7 G; −1).
 *  - voKias 167, the manoeuvring speed: estimate, worked from the two above (stall × √maxG = 68 × √6).
 *  - vmoKias 240, the never-exceed speed: estimate, unchecked (spec 4.19's table). mmo null: no Mach limit applies
 *    to a 240 KIAS aircraft, so the top speed is 240 KIAS at every height.
 *  - weightLb 3,200: estimate (CT102B_AIRFRAME).
 * A published limit (G, speed) is flagged on screen and never a wall (AGENTS.md); only the stall line is physical.
 */
const STALL_KIAS = 68;
const MAX_G = 6;
export const CT102B_LIMITS = Object.freeze({
  maxG: MAX_G, minG: -4, rollingMaxG: 4, rollingMinG: -1,
  stallKias: STALL_KIAS, stallLandingKias: 59, voKias: Math.round(STALL_KIAS * Math.sqrt(MAX_G)), vmoKias: 240, mmo: null,
  weightLb: CT102B_AIRFRAME.weightLb,
});

/** The Astra's stall speed over the T-6A's (68 ÷ 86): how the drawn-pitch numbers below are scaled. */
const STALL_RATIO = STALL_KIAS / T6A_LIMITS.stallKias;

/**
 * The Astra's pitch attitude numbers, T6A_PITCH's shape. Drawing only (the path follower's drawn pitch, a later phase).
 *  - aoa180Deg 1.75: estimate, the T-6A's 2.8° scaled by the stall speeds squared ((68 ÷ 86)²), so the angle of
 *    attack at the stall is the T-6A's (spec 4.19's table: "the T-6's shape scaled by the Astra stall speed").
 *  - aoaMinKias 47: estimate, the T-6A's 60 KIAS floor scaled the same way (60 × 68 ÷ 86).
 *  - datumDeg, takeoffFlapAoADeg, landingFlapAoADeg: estimates, the T-6A's.
 *  - onGearDeg 0: public (the production G 120TP sits level on its gear; flight tests, sources.md P6).
 */
export const CT102B_PITCH = Object.freeze({
  aoa180Deg: T6A_PITCH.aoa180Deg * STALL_RATIO ** 2,
  datumDeg: T6A_PITCH.datumDeg,
  takeoffFlapAoADeg: T6A_PITCH.takeoffFlapAoADeg,
  landingFlapAoADeg: T6A_PITCH.landingFlapAoADeg,
  onGearDeg: 0,
  aoaMinKias: 60 * STALL_RATIO, // the T-6A's floor is aircraft-performance.js's default, 60 KIAS
});

/** Where each number in the Astra's set stands, for the screen's estimate flags (spec 4.19 item 5). */
export const CT102B_SOURCES = Object.freeze({
  wingAreaSqFt: Object.freeze({ status: 'type certificate', note: 'EASA.A.565 issue 04, sources.md P2; unchecked' }),
  spanFt: Object.freeze({ status: 'type certificate', note: 'EASA.A.565 issue 04, sources.md P2; unchecked' }),
  lengthFt: Object.freeze({ status: 'type certificate', note: 'EASA.A.565 issue 04, sources.md P2; unchecked' }),
  emptyWeightLb: Object.freeze({ status: 'public', note: 'RCAF CT-102B page, sources.md P1a; unchecked' }),
  shaftHp: Object.freeze({ status: 'public', note: 'Rolls-Royce M250-B17F, spec 4.19; unchecked' }),
  climbFpm: Object.freeze({ status: 'public', note: 'manufacturer figure, spec 4.19; unchecked; drives the thrust fit' }),
  maxG: Object.freeze({ status: 'public', note: 'aerobatic category, spec 4.19; unchecked' }),
  minG: Object.freeze({ status: 'public', note: 'aerobatic category, spec 4.19; unchecked' }),
  onGearDeg: Object.freeze({ status: 'public', note: 'sits level on its gear, flight tests, sources.md P6' }),
  weightLb: Object.freeze({ status: 'estimate', note: 'pattern weight, spec 4.19' }),
  climbKias: Object.freeze({ status: 'estimate', note: 'climb speed, spec 4.19, TR-158' }),
  cd0: Object.freeze({ status: 'estimate', note: 'standard value, spec 4.19' }),
  oswaldE: Object.freeze({ status: 'estimate', note: 'standard value, spec 4.19' }),
  propEfficiency: Object.freeze({ status: 'estimate', note: 'spec 4.19' }),
  flatRatedFt: Object.freeze({ status: 'estimate', note: 'spec 4.19' }),
  fit: Object.freeze({ status: 'estimate', note: 'worked from the numbers above by standard aerodynamics' }),
  stallKias: Object.freeze({ status: 'estimate', note: 'working value 68 KIAS, spec 4.19' }),
  stallLandingKias: Object.freeze({ status: 'estimate', note: '59 KIAS, spec 4.19' }),
  rollingMaxG: Object.freeze({ status: 'estimate', note: "the T-6A's in proportion" }),
  rollingMinG: Object.freeze({ status: 'estimate', note: "the T-6A's" }),
  voKias: Object.freeze({ status: 'estimate', note: 'stall × √maxG' }),
  vmoKias: Object.freeze({ status: 'estimate', note: 'never-exceed speed, spec 4.19' }),
  roll: Object.freeze({ status: 'estimate', note: "the T-6A's roll limits (themselves estimates), spec 4.19" }),
  gOnset: Object.freeze({ status: 'estimate', note: "the T-6A's G onset (itself an estimate), spec 4.19" }),
  pitch: Object.freeze({ status: 'estimate', note: "the T-6A's shape scaled by the stall speed; drawing only" }),
});

/**
 * The CT-102B Astra II's performance set. Roll rate and G onset are the T-6A's (T6A_ROLL, T6A_G_ONSET; estimates,
 * spec 4.19's table). No glide data (no Astra PFL in this plan; spec 4.19 item 8: never filled from the T-6A's), so
 * its glide functions throw. No stick-shaker margin (no source), so shakerG needs one passed.
 */
export const CT102B_PERFORMANCE = makePerformance({
  name: 'CT-102B Astra II',
  fit: CT102B_FIT,
  limits: CT102B_LIMITS,
  roll: T6A_ROLL,
  gOnset: T6A_G_ONSET,
  pitch: CT102B_PITCH,
  glide: null,
  manoeuvre: null,
  sources: CT102B_SOURCES,
});
