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
 * The T-6A V-n diagram and airspeed limits (clean, 5,168 lb, maximum take-off weight).
 * stallKias is the V-n stall line's 1 G stall speed; the turn charts' lighter jet
 * stalls near 83 kt instead, which Dad is to pick between (SPEC-turn-fight).
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
 * pushG push until 125 KIAS or the clean glide path. At or below 150 KIAS, a
 * level slow-down to 125 KIAS instead. Returns the height gained, the time and
 * the distance over the ground in still air.
 */
export function flyZoomT6A(kias, altFt, pushG = 0.25, dtSec = 0.02) {
  const engineOff = (ktas, alt, g) => -dragPerWeight(tasToIasKt(ktas, alt), alt, g);
  let s = pointMassState({ altFt, ktas: iasToTasKt(kias, altFt), headingRad: 0 });
  let t = 0;
  const now = () => pointMassFlight(s);
  const nowKias = () => { const f = now(); return tasToIasKt(f.ktas, f.altFt); };
  const fly = (control) => { s = stepPointMass(s, control, dtSec, engineOff); t += dtSec; };
  if (kias <= ZOOM_MIN_KIAS) {
    while (nowKias() > ZOOM_GLIDE_KIAS) fly({ g: 1, bankRad: 0 });
  } else {
    const climb = 20 * Math.PI / 180;
    const glidePath = -Math.atan(1 / (T6A_GLIDE.clean.nmPer1000Ft * FT_PER_NM / 1000));
    while (t < 2 - 1e-9) fly({ g: 1, bankRad: 0 });
    while (now().climbRad < climb) fly({ g: 2, bankRad: 0 });
    while (nowKias() > 145) {
      const f = now();
      fly({ g: Math.cos(f.climbRad) + 5 * (climb - f.climbRad), bankRad: 0 });
    }
    while (nowKias() > ZOOM_GLIDE_KIAS && now().climbRad > glidePath) fly({ g: pushG, bankRad: 0 });
  }
  return { gainFt: s.z - altFt, timeSec: t, distanceFt: Math.hypot(s.x, s.y) };
}

/**
 * Height gained by the flight manual's zoom after an engine failure at kias
 * and altFt (NFM Fig 3-4), for a jet of weightLb (5,800 lb unless told; the
 * table's 5,400 to 6,500 lb, held at its ends). At 200 and 250 KIAS between
 * 500 and 6,000 ft it is the table; elsewhere, the same share of the energy
 * height from kias down to 125 KIAS as the table's nearest speed and altitude.
 * At or below 150 KIAS there is no zoom (the NFM slows down level). The time
 * and distance are the model's (flyZoomT6A), which the NFM does not give.
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
