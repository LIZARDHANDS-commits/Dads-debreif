// The one T-6A performance model every module reads (SPEC-core, "API, fifth
// PR"; Patrick, 2026-09-30 06:58Z). V6 has none of this: it is new, checked
// against the T-6A's own charts (tests/unit/core/t6-performance.test.js). Each
// module keeps its own flying; this only holds the aircraft's numbers.
//
// Speeds are knots: KIAS where the charts use indicated airspeed, KTAS where
// the motion needs true airspeed. Altitudes are feet, pressure altitude on a
// standard day. G is the load factor.
import { FT_PER_NM, G_FTPS2, KT_TO_FTPS } from './units.js';
import { isaDensityRatio } from './flight-math.js';
import { T6A_FIT } from './t6a-turn-charts.js';
import { stepPointMass, pointMassState, pointMassFlight } from './point-mass.js';

/**
 * The T-6A V-n diagram and airspeed limits (clean, at the V-n diagram's 5,168 lb).
 * stallKias is the 1 G stall speed: 86 kt, which Patrick kept (2026-09-30
 * 09:29Z). The V-n curve itself reads about 89 kt (7 G near 236 KIAS), and the
 * turn charts imply about 83 kt at maximum power (likely because power on
 * lowers the stall speed, NFM p.6-6). 7 G at 227.5 KIAS matching VO (227) is a coincidence.
 */
export const T6A_LIMITS = Object.freeze({
  maxG: 7, minG: -3.5, rollingMaxG: 4.7, rollingMinG: -1,
  stallKias: 86, voKias: 227, vmoKias: 316, weightLb: 5168,
});

/** The most G the wing gives at this speed before it stalls: (KIAS ÷ stall speed)². */
export function stallLimitG(kias, stallKias = T6A_LIMITS.stallKias) {
  return (kias / stallKias) ** 2;
}

/** The G the aircraft can pull now: the stall line, capped at +7 G (+4.7 G while rolling). */
export function availableG(kias, rolling = false, stallKias = T6A_LIMITS.stallKias) {
  return Math.min(stallLimitG(kias, stallKias), rolling ? T6A_LIMITS.rollingMaxG : T6A_LIMITS.maxG);
}

/** True airspeed from indicated: IAS ÷ √σ (standard atmosphere, no compressibility). */
export function iasToTasKt(kias, altFt) {
  return kias / Math.sqrt(isaDensityRatio(altFt));
}

/** Indicated airspeed from true: TAS × √σ. */
export function tasToIasKt(ktas, altFt) {
  return ktas * Math.sqrt(isaDensityRatio(altFt));
}

/** Energy height in feet: altitude + V²/2g, V true airspeed. */
export function energyHeightFt(altFt, ktas) {
  const v = ktas * KT_TO_FTPS;
  return altFt + v * v / (2 * G_FTPS2);
}

/**
 * Maximum-power propeller thrust ÷ weight (fitted to the sustained turn chart,
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
 * with G² ÷ KIAS² (set by the max glide chart, T6A_FIT). At a given IAS it is
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

/** excessThrustPerWeight as stepPointMass's excessFn, which passes true airspeed. */
export function t6aExcessFn(ktas, altFt, g) {
  return excessThrustPerWeight(tasToIasKt(ktas, altFt), altFt, g);
}

/**
 * The T-6A max glide chart (engine inoperative, IAS; PT6A-68, flight test,
 * June 1998; Patrick's upload 06:33Z; SMM 13.5 para 7 agrees on 2 NM at 125).
 * chartSinkFpm is the chart's own sink rate, which works out as the glide
 * ratio at about 16,000 ft; glideSinkFpm gives it at any height.
 */
export const T6A_GLIDE = Object.freeze({
  clean: Object.freeze({ kias: 125, nmPer1000Ft: 2.0, chartSinkFpm: 1350, prop: 'feathered', dragIndex: 0 }),
  gearDown: Object.freeze({ kias: 105, nmPer1000Ft: 1.5, chartSinkFpm: 1500, prop: 'feathered', dragIndex: 20 }),
  landing: Object.freeze({ kias: 95, nmPer1000Ft: 1.1, chartSinkFpm: 1850, prop: 'feathered', dragIndex: 80 }),
  windmilling: Object.freeze({ kias: 110, nmPer1000Ft: 1.0, chartSinkFpm: 2350, prop: 'windmilling', dragIndex: 0 }),
});

/**
 * Sink rate in ft/min for a T6A_GLIDE configuration ('clean', 'gearDown',
 * 'landing', 'windmilling') at kias: true airspeed ÷ the glide ratio. The
 * ratio is fixed through the air, so the sink rate grows with height.
 */
export function glideSinkFpm(config, kias, altFt) {
  if (!Object.hasOwn(T6A_GLIDE, config)) throw new RangeError(`glide configuration ${config}: use one of ${Object.keys(T6A_GLIDE).join(', ')}`);
  const ratio = T6A_GLIDE[config].nmPer1000Ft * FT_PER_NM / 1000;
  return iasToTasKt(kias, altFt) * KT_TO_FTPS * 60 / ratio;
}

/**
 * The flight manual's zoom data (NFM Fig 3-4, p.3-12): height gained after an
 * engine failure, engine secured and prop feathered, gear and flaps up; 2 s
 * delay, 2 G pull to 20° nose up held to 145 KIAS, then a 0 to +0.5 G push to
 * capture 125 KIAS (NFM p.3-9). Its lightest and heaviest rows, [speed][altitude];
 * the rows between are straight lines from these to within 1 ft.
 */
export const NFM_ZOOM = Object.freeze({
  kias: Object.freeze([200, 250]),
  altFt: Object.freeze([500, 1500, 3000, 6000]),
  lightLb: 5400,
  heavyLb: 6500,
  light: Object.freeze([Object.freeze([595, 621, 649, 794]), Object.freeze([1172, 1232, 1297, 1487])]),
  heavy: Object.freeze([Object.freeze([738, 757, 768, 883]), Object.freeze([1299, 1347, 1410, 1552])]),
});

const ZOOM_DEFAULT_LB = 5800;   // NFM example 1: a two-seat jet part way through a sortie; for Dad
const ZOOM_MIN_KIAS = 150;      // below it the NFM slows down level instead (p.3-9)
const ZOOM_GLIDE_KIAS = 125;
const ZOOM_PUSH_G = 0.25;       // the middle of the NFM's 0 to +0.5 G push
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
 * The NFM zoom procedure flown by the model with the engine off (drag only):
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
 * Height gained by the flight manual's zoom after an engine failure at kias
 * and altFt (NFM Fig 3-4), for a jet of weightLb (5,800 lb unless told; the
 * table's 5,400 to 6,500 lb, held at its ends). At 200 and 250 KIAS between
 * 500 and 6,000 ft it is the table; elsewhere, the same share of the energy
 * height from kias down to 125 KIAS as the table's nearest speed and altitude.
 * At or below 150 KIAS there is no zoom (the NFM slows down level), so the
 * gain steps from 0 to about 200 ft there, as the NFM's rule does. The time
 * and distance are the model's (flyZoomT6A), which the NFM does not give.
 * kias from 0 to VMO (316) and a finite altFt, or it throws a RangeError.
 * Returns { gainFt, timeSec, distanceFt }.
 */
export function zoomT6A(kias, altFt, weightLb = ZOOM_DEFAULT_LB) {
  const { timeSec, distanceFt } = flyZoomT6A(kias, altFt);
  if (kias <= ZOOM_MIN_KIAS) return { gainFt: 0, timeSec, distanceFt };
  const z = NFM_ZOOM;
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
 *   shaker comes on about 5 to 10 kt above the stall (NFM p.1-52); 7 kt here.
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
 * speed (stall + margin, 93 KIAS), growing with KIAS², at most maxG (the V-n
 * diagram's 7 G unless told). With no margin it is the stall line.
 */
export function shakerG(kias, { stallKias = T6A_LIMITS.stallKias, marginKt = T6A_MANOEUVRE.shakerMarginKt, maxG = T6A_LIMITS.maxG } = {}) {
  return Math.min((kias / (stallKias + marginKt)) ** 2, maxG);
}

/**
 * The split S as the SMM flies it (14.16 para 41), at full power: raise the
 * nose to 20° up in the shaker, roll inverted at 0.5 G at the roll rate, then
 * pull through in the shaker, up to 5 G, until level. Below the shaker speed
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
