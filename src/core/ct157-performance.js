// The CT-157 Siskin II's performance set (Pilatus PC-21), for Traffic's Pattern 1 (spec 4.20; plan Step 5d; TR-167;
// proposed, built ahead of Patrick's yes, Dad 17 to 18 Oct 2026). The same formulas as the T-6A and the CT-102B
// (aircraft-performance.js makePerformance) with the PC-21's numbers: a third set of numbers, never a second formula.
//
// There is no PC-21 manual in the project files, so no number here is a manual number. Each number says where it
// stands:
//  - "three-view": printed on the Pilatus three-view Dad sent (18 Oct 2026; tools/blender/pc21/sources.md rows S1);
//  - "public": the FOCA (Swiss) type certificate data sheet F56-35 issue 9 (2 Feb 2026) or the Pilatus PC-21
//    factsheet, read through web-search summaries only (the pages could not be opened from the session), unchecked;
//  - "estimate": no source yet. A number worked out from others by standard aerodynamics is an estimate too, with
//    the working beside it.
// The estimates are listed in CT157_SOURCES so the screen flags them (spec 4.20 item 4), and come off one by one as a
// manual page or Patrick's ruling backs them. The pattern speeds (220, 140, 120, 100 KIAS) are how 15 Wing flies
// Pattern 1, not what the aircraft can do, so they are not here: they are the CT-157's profile in Traffic's types.js.
import { KT_TO_FTPS, SEA_LEVEL_DENSITY_SLUG_FT3 } from './units.js';
import { makePerformance } from './aircraft-performance.js';
import { T6A_LIMITS, T6A_ROLL, T6A_G_ONSET, T6A_PITCH } from './t6-performance.js';
import { T6A_FIT } from './t6a-turn-data.js';

const IN_TO_FT = 1 / 12;
const KG_TO_LB = 1 / 0.45359237;

/**
 * The airframe and engine, the numbers the fit below is worked from.
 *  - wingAreaSqFt 163.85 (15.22 m²), spanFt 29 ft 11 in (9.11 m), lengthFt 36 ft 10 in (11.22 m): three-view.
 *  - emptyWeightLb 5,027 (2,280 kg basic empty, "depending on configuration"): public (Pilatus factsheet).
 *  - weightLb 6,400 (about 2,900 kg), the weight in the pattern: estimate. The empty 2,280 kg, two crew with their
 *    kit about 200 kg and about 420 kg of fuel; under the public 3,100 kg aerobatic take-off weight.
 *  - shaftHp 1,600, take-off and maximum continuous at high airspeed; lowSpeedShaftHp 1,080, the same rating at low
 *    airspeed (the engine's power is limited automatically with airspeed); cruiseShaftHp 1,425, maximum cruise at high
 *    airspeed: public (FOCA sheet). The airspeed where the power changes is not given. lowSpeedShaftHp is not used by
 *    the fit: it is the check that the fit's power at low speed is sane (CT157_FIT, below).
 *  - climbFpm 4,091 at sea level, full power: public (Pilatus factsheet). It drives the thrust fit, as the Astra's
 *    climb figure does. climbKias 160: estimate (no source gives the speed of that figure).
 *  - cruiseKtas 323 at sea level: public (Pilatus factsheet), taken to be at cruiseShaftHp (an estimate). It sets the
 *    zero-lift drag (CT157_FIT).
 *  - oswaldE 0.8, propEfficiency 0.8 at cruise speed: estimates (standard values, the Astra's).
 *  - The engine's flat rating with height: the T-6A fit's (its PT6A-68's, the PT6A-68B's sibling), an estimate.
 */
export const CT157_AIRFRAME = Object.freeze({
  wingAreaSqFt: 163.85,
  spanFt: 29 + 11 * IN_TO_FT,
  lengthFt: 36 + 10 * IN_TO_FT,
  emptyWeightLb: Math.round(2280 * KG_TO_LB),
  weightLb: 6400,
  shaftHp: 1600,
  lowSpeedShaftHp: 1080,
  cruiseShaftHp: 1425,
  climbFpm: 4091,
  climbKias: 160,
  cruiseKtas: 323,
  oswaldE: 0.8,
  propEfficiency: 0.8,
});

/**
 * The thrust and drag fit, in the T-6A fit's own form (T6A_FIT; aircraft-performance.js thrustPerWeight and
 * dragPerWeight), worked from CT157_AIRFRAME by standard aerodynamics, as the Astra's is (ct102b-performance.js).
 * Every constant is an estimate. Its working, with q = ½ρ₀V² and V in ft/s from KIAS (sea level, so KTAS = KIAS):
 *  - full-power thrust ÷ weight at cruiseKtas is η × 550 × shaftHp ÷ (W × V): about 0.202;
 *  - drag ÷ weight = q S CD0 ÷ W + G² W ÷ (q S π e AR), aspect ratio AR = span² ÷ S (5.46). So
 *    dragB = W ÷ (½ρ₀(1.688)² S π e AR) (about 840) and, level at cruiseKtas on cruiseShaftHp ÷ shaftHp of that
 *    thrust, dragA = (0.89 × 0.202 − dragB ÷ 323²) ÷ 323² (about 1.65e-6, a CD0 of about 0.019);
 *  - thrust ÷ weight = K ÷ (KTAS + V0): K and V0 are set by the cruise point above and by the climb point (at
 *    climbKias at sea level the full-power climb is climbFpm: thrust ÷ weight = drag ÷ weight at G = cos γ, plus
 *    sin γ = climb rate ÷ true airspeed, about 0.36). That gives V0 about 106 kt and K about 86.6 at sea level
 *    (thrustK is K ÷ thrustFlatSigma^thrustDensityExp, the form's flat rating carried, below).
 *  - How that models the power management (an estimate): one curve through a low-speed point and a high-speed one.
 *    Worked back at η 0.8, its power is about 1,030 shp at 100 KIAS, 1,280 at 160 and 1,430 at 220, and the full
 *    1,600 at 323 KTAS: the FOCA sheet's 1,080 shp at low airspeed rising to 1,600 at high airspeed, with no second
 *    formula. Its static thrust is about 5,200 lb (thrust ÷ weight 0.82), more than 1,080 shp could give standing
 *    still: a take-off roll on it would be short.
 *  - above the flat-rating height thrust falls with density as the T-6A fit's does (thrustDensityExp and
 *    thrustFlatSigma, about 14,000 ft; estimates for the PT6A-68B).
 * The checks that it is sane (worked again in scratch, not pinned by a test): the top level speed at sea level is
 * about 337 KTAS (the factsheet's 323 KTAS cruise is at 1,425 shp, so a little above it); the best rate of climb is
 * about 4,080 ft/min near 172 KIAS (fitted near the public 4,091); the best lift-to-drag ratio about 13.4; 220 KIAS
 * level at sea level needs about 0.37 of full thrust; the 92 KIAS stall at 6,400 lb is a clean maximum lift
 * coefficient of about 1.36.
 */
function pc21Fit(a) {
  const qPerKt2 = 0.5 * SEA_LEVEL_DENSITY_SLUG_FT3 * KT_TO_FTPS * KT_TO_FTPS; // dynamic pressure per knot², lb/ft²
  const aspectRatio = a.spanFt * a.spanFt / a.wingAreaSqFt;
  const dragB = a.weightLb / (qPerKt2 * a.wingAreaSqFt * Math.PI * a.oswaldE * aspectRatio);
  // The cruise point: full-power thrust there, η × shaft power ÷ (weight × speed); level on the cruise share of it.
  const twCruise = a.propEfficiency * 550 * a.shaftHp / (a.weightLb * KT_TO_FTPS * a.cruiseKtas);
  const dragA = (twCruise * a.cruiseShaftHp / a.shaftHp - dragB / a.cruiseKtas ** 2) / a.cruiseKtas ** 2;
  // The climb point: sea level, so KTAS = KIAS.
  const sinGamma = (a.climbFpm / 60) / (a.climbKias * KT_TO_FTPS);
  const cosGamma = Math.sqrt(1 - sinGamma * sinGamma);
  const twClimb = dragA * a.climbKias ** 2 + dragB * cosGamma ** 2 / a.climbKias ** 2 + sinGamma;
  const thrustV0Kt = (a.cruiseKtas * twCruise - a.climbKias * twClimb) / (twClimb - twCruise);
  // The shared form holds thrust at the flat-rating height's density up to it (min(σ, thrustFlatSigma)^exp), so the
  // sea-level fit is carried up by that factor, as the Astra's is.
  const { thrustDensityExp, thrustFlatSigma } = T6A_FIT;
  const thrustK = twClimb * (a.climbKias + thrustV0Kt) / thrustFlatSigma ** thrustDensityExp;
  return Object.freeze({ dragA, dragB, thrustK, thrustV0Kt, thrustDensityExp, thrustFlatSigma });
}

/** The CT-157's thrust and drag constants, T6A_FIT's shape. Estimates (pc21Fit). */
export const CT157_FIT = pc21Fit(CT157_AIRFRAME);

/**
 * The CT-157's limits, T6A_LIMITS' shape.
 *  - stallKias 92, the 1 G stall flaps and gear up; stallLandingKias 81, flaps and gear down: public (Pilatus
 *    factsheet, 92 and 81 KCAS, the weight not given), unchecked; KCAS taken as KIAS, an estimate.
 *  - maxG +8, minG −4: public (aerobatic category, the factsheet and the FOCA sheet), unchecked.
 *  - rollingMaxG 5.4, rollingMinG −1: estimates, the T-6A's rolling limits in proportion (4.7 of 7 G, × 8; −1).
 *  - voKias 260, the manoeuvring speed: estimate, worked from the two above (stall × √maxG = 92 × √8).
 *  - vmoKias 370: public (370 KEAS, the factsheet and the FOCA sheet), unchecked; KEAS taken as KIAS, an estimate.
 *    mmo null: no Mach operating limit was found (the sheet's Mach 0.77 is the design dive Mach, not a limit to fly
 *    to), so the top speed is 370 KIAS at every height. Not reached in the pattern.
 *  - weightLb 6,400: estimate (CT157_AIRFRAME).
 * A published limit (G, speed) is flagged on screen and never a wall (AGENTS.md); only the stall line is physical.
 */
const STALL_KIAS = 92;
const MAX_G = 8;
export const CT157_LIMITS = Object.freeze({
  maxG: MAX_G, minG: -4,
  rollingMaxG: Math.round(T6A_LIMITS.rollingMaxG / T6A_LIMITS.maxG * MAX_G * 10) / 10, rollingMinG: -1,
  stallKias: STALL_KIAS, stallLandingKias: 81, voKias: Math.round(STALL_KIAS * Math.sqrt(MAX_G)), vmoKias: 370, mmo: null,
  weightLb: CT157_AIRFRAME.weightLb,
});

/** The CT-157's stall speed over the T-6A's (92 ÷ 86): how the drawn-pitch numbers below are scaled. */
const STALL_RATIO = STALL_KIAS / T6A_LIMITS.stallKias;

/**
 * The CT-157's pitch attitude numbers, T6A_PITCH's shape. Drawing only (the path follower's drawn pitch).
 *  - aoa180Deg 3.2: estimate, the T-6A's 2.8° scaled by the stall speeds squared ((92 ÷ 86)²), so the angle of attack
 *    at the stall is the T-6A's (as the Astra's is scaled).
 *  - aoaMinKias 64: estimate, the T-6A's 60 KIAS floor scaled the same way (60 × 92 ÷ 86).
 *  - datumDeg, takeoffFlapAoADeg, landingFlapAoADeg, onGearDeg: estimates, the T-6A's (the three-view's side view
 *    sits about level on its wheels; not measured to a degree).
 */
export const CT157_PITCH = Object.freeze({
  aoa180Deg: T6A_PITCH.aoa180Deg * STALL_RATIO ** 2,
  datumDeg: T6A_PITCH.datumDeg,
  takeoffFlapAoADeg: T6A_PITCH.takeoffFlapAoADeg,
  landingFlapAoADeg: T6A_PITCH.landingFlapAoADeg,
  onGearDeg: T6A_PITCH.onGearDeg,
  aoaMinKias: 60 * STALL_RATIO, // the T-6A's floor is aircraft-performance.js's default, 60 KIAS
});

const FOCA = 'FOCA type certificate sheet F56-35 issue 9, read through a search summary; unchecked';
const PILATUS = 'Pilatus PC-21 factsheet, read through a search summary; unchecked';
const THREE_VIEW = "Pilatus three-view Dad sent, 18 Oct 2026 (tools/blender/pc21/sources.md S1)";

/** Where each number in the CT-157's set stands, for the screen's estimate flags (spec 4.20 item 4). */
export const CT157_SOURCES = Object.freeze({
  wingAreaSqFt: Object.freeze({ status: 'three-view', note: THREE_VIEW }),
  spanFt: Object.freeze({ status: 'three-view', note: THREE_VIEW }),
  lengthFt: Object.freeze({ status: 'three-view', note: THREE_VIEW }),
  emptyWeightLb: Object.freeze({ status: 'public', note: PILATUS }),
  shaftHp: Object.freeze({ status: 'public', note: `${FOCA}; 1,600 shp at high airspeed` }),
  lowSpeedShaftHp: Object.freeze({ status: 'public', note: `${FOCA}; 1,080 shp at low airspeed; a check, not used by the fit` }),
  cruiseShaftHp: Object.freeze({ status: 'public', note: `${FOCA}; 1,425 shp maximum cruise at high airspeed` }),
  climbFpm: Object.freeze({ status: 'public', note: `${PILATUS}; drives the thrust fit` }),
  cruiseKtas: Object.freeze({ status: 'public', note: `${PILATUS}; that it is at 1,425 shp is an estimate` }),
  maxG: Object.freeze({ status: 'public', note: `aerobatic category; ${PILATUS}; FOCA sheet` }),
  minG: Object.freeze({ status: 'public', note: `aerobatic category; ${PILATUS}; FOCA sheet` }),
  stallKias: Object.freeze({ status: 'public', note: `92 KCAS flaps and gear up, weight not given; ${PILATUS}` }),
  stallLandingKias: Object.freeze({ status: 'public', note: `81 KCAS flaps and gear down; ${PILATUS}` }),
  vmoKias: Object.freeze({ status: 'public', note: `370 KEAS; ${PILATUS}; FOCA sheet; KEAS taken as KIAS` }),
  weightLb: Object.freeze({ status: 'estimate', note: 'pattern weight: empty 2,280 kg, crew about 200 kg, fuel about 420 kg' }),
  climbKias: Object.freeze({ status: 'estimate', note: 'the speed of the public climb figure; no source' }),
  oswaldE: Object.freeze({ status: 'estimate', note: 'standard value' }),
  propEfficiency: Object.freeze({ status: 'estimate', note: 'standard value at cruise' }),
  fit: Object.freeze({ status: 'estimate', note: 'worked from the numbers above by standard aerodynamics; the power management is the fit (spec 4.20 item 2)' }),
  flatRating: Object.freeze({ status: 'estimate', note: "the T-6A fit's (its PT6A-68)" }),
  rollingMaxG: Object.freeze({ status: 'estimate', note: "the T-6A's in proportion" }),
  rollingMinG: Object.freeze({ status: 'estimate', note: "the T-6A's" }),
  voKias: Object.freeze({ status: 'estimate', note: 'stall × √maxG' }),
  mmo: Object.freeze({ status: 'estimate', note: 'none found; none applied' }),
  roll: Object.freeze({ status: 'estimate', note: "the T-6A's (ALL-39); its 200°/s cap matches the PC-21's public 200°/s at 10,000 ft" }),
  gOnset: Object.freeze({ status: 'estimate', note: "the T-6A's (itself an estimate)" }),
  pitch: Object.freeze({ status: 'estimate', note: "the T-6A's shape scaled by the stall speed; drawing only" }),
});

/**
 * The CT-157 Siskin II's performance set. Roll rate and G onset are the T-6A's (T6A_ROLL, T6A_G_ONSET; estimates).
 * No glide data (no PC-21 source), so its glide functions refuse; no stick-shaker margin, so shakerG needs one passed.
 */
export const CT157_PERFORMANCE = makePerformance({
  name: 'CT-157 Siskin II',
  fit: CT157_FIT,
  limits: CT157_LIMITS,
  roll: T6A_ROLL,
  gOnset: T6A_G_ONSET,
  pitch: CT157_PITCH,
  glide: null,
  manoeuvre: null,
  sources: CT157_SOURCES,
});
