// The day's weather for the Traffic Sim (Patrick, 5 Oct 06:47Z; card "Temperature, full" 06:48Z; TR-77): the
// temperature at the field. The circuit is flown on the altimeter with the local setting, so the sim's heights stay
// indicated (3,500 ft is 3,500 ft on the altimeter), while the air's temperature changes:
//  - true airspeed for an indicated airspeed (density), so turns, climbs, zooms and glides change with it;
//  - true height above the field, which is the indicated height above the field times the mean temperature of the
//    air below over the standard one (both in kelvin): hot days fly higher, cold days lower.
// Pressure is taken as standard (a correct altimeter setting cancels it); humidity is left out (a few feet).
// The temperature is one value for the whole run, set by the sim from its setup before each step.

import { isaDensityRatio } from '../../core/flight-math.js';
import { M_PER_FT } from '../../core/units.js';
import { FIELD_ELEV_FT, THRESHOLD_29L, DEPARTURE_END_29L, THRESHOLD_DATA_ELEV_FT, NUMBER_BASE_PAST_THRESHOLD_FT, FLARE_FROM_FT, TOUCHDOWN_PAST_NUMBERS_FT } from './airfield.js';

const T0_K = 288.15;
const LAPSE_K_PER_M = 0.0065;
/** Standard-day temperature at altFt, kelvin (the same atmosphere as core's isaDensityRatio). */
const isaTempK = (altFt) => T0_K - LAPSE_K_PER_M * Math.min(altFt * M_PER_FT, 11000);

/** The standard day's temperature at Moose Jaw's field elevation, °C: about 11°C. */
export const STANDARD_FIELD_TEMP_C = Math.round((isaTempK(FIELD_ELEV_FT) - 273.15) * 10) / 10;

/** The Weather drop-down's choices: the field temperature each sets, or null for "set your own". */
export const WEATHER_PRESETS = Object.freeze([
  Object.freeze({ value: 'standard', label: `Standard day (${Math.round(STANDARD_FIELD_TEMP_C)}°C)`, tempC: STANDARD_FIELD_TEMP_C }),
  Object.freeze({ value: 'hot', label: 'Hot day (30°C)', tempC: 30 }),
  Object.freeze({ value: 'cold', label: 'Cold day (−30°C)', tempC: -30 }),
  Object.freeze({ value: 'custom', label: 'Set the temperature', tempC: null }),
]);

/** The field temperature for a Weather choice and the custom temperature box, °C. */
export function fieldTempFor(weather, customTempC) {
  const preset = WEATHER_PRESETS.find((p) => p.value === weather) ?? WEATHER_PRESETS[0];
  return preset.tempC ?? (Number.isFinite(customTempC) ? customTempC : STANDARD_FIELD_TEMP_C);
}

let deviationC = 0; // today's temperature minus the standard day's, the same at every height

/** Sets the day from the field temperature, °C (anything not a number: the standard day). */
export function setFieldTemperature(tempC) {
  deviationC = Number.isFinite(tempC) ? tempC - STANDARD_FIELD_TEMP_C : 0;
}

/** Today's temperature as a key for anything worked out once and kept (paths, turn times): changes when the day does. */
export function temperatureKey() {
  return deviationC;
}

/** Air density over sea-level standard at an altimeter height: the standard pressure there, at today's temperature. */
export function densityRatio(altFt) {
  const t = isaTempK(altFt);
  return isaDensityRatio(altFt) * t / (t + deviationC);
}

/** True airspeed from indicated: IAS ÷ √σ, with today's temperature (no compressibility). */
export function iasToTasKt(kias, altFt) {
  return kias / Math.sqrt(densityRatio(altFt));
}

/** Indicated airspeed from true: TAS × √σ. */
export function tasToIasKt(ktas, altFt) {
  return ktas * Math.sqrt(densityRatio(altFt));
}

/** True height ÷ indicated height above the field, for the air between the field and altFt. 1 on a standard day. */
export function heightFactor(altFt) {
  const t = isaTempK((FIELD_ELEV_FT + altFt) / 2);
  return (t + deviationC) / t;
}

/** The true height above sea level of an aircraft whose altimeter (on the local setting) reads altFt. */
export function trueAltFt(altFt) {
  return FIELD_ELEV_FT + (altFt - FIELD_ELEV_FT) * heightFactor(altFt);
}

/** Without Pattern 1's route, the window is ¾ NM out from the 29L threshold (SMM 4.7 para 12). */
const WINDOW_FALLBACK_OUT_FT = 0.75 * 6076;

/**
 * The 29L approach: { ux, uy } the unit vector out from the threshold (away from the departure end), windowOutFt how far
 * out the window is (Pattern 1's point 12), and slope the sim's own glide path through the window to the base of the
 * numbers, rise per foot (about 3°, SMM 4.7 para 12; 3° without a pattern; aim point TR-93). `pattern` is Pattern 1's route or null.
 */
export function approachLine(pattern) {
  const th = THRESHOLD_29L;
  const len = Math.hypot(DEPARTURE_END_29L.x - th.x, DEPARTURE_END_29L.y - th.y);
  const ux = (th.x - DEPARTURE_END_29L.x) / len, uy = (th.y - DEPARTURE_END_29L.y) / len;
  const w = pattern?.points?.[12];
  const windowOutFt = w ? (w.x - th.x) * ux + (w.y - th.y) * uy : WINDOW_FALLBACK_OUT_FT;
  const slope = w && windowOutFt > 0 && w.alt > THRESHOLD_DATA_ELEV_FT ? (w.alt - THRESHOLD_DATA_ELEV_FT) / (windowOutFt + NUMBER_BASE_PAST_THRESHOLD_FT) : Math.tan(3 * Math.PI / 180);
  return { ux, uy, windowOutFt, slope };
}

/**
 * How far out from the 29L threshold, ft, a straight-in level at levelAltFt on the altimeter meets the 3° line to the
 * base of the numbers: where the line reaches its true height today, so further out on a hot day and closer in on a cold one.
 */
export function interceptOutFt(slope, levelAltFt) {
  return (trueAltFt(levelAltFt) - THRESHOLD_DATA_ELEV_FT) / slope - NUMBER_BASE_PAST_THRESHOLD_FT;
}

/**
 * The straight-in starts down at the 3° intercept (Patrick's card "Follow the mark", 5 Oct 07:29Z; TR-80): moves the
 * SI Rejoin's (ENT2) "Glide path" point along the centreline to today's intercept, so it flies a true 3° to the runway.
 * It stays at least 1,000 ft outside the window and 500 ft inside the point before it (estimates, to keep the route's
 * order on an extreme day). Its last point moves from the threshold to the touchdown point past the numbers, after a flare. `routes` is the
 * setup's routes, changed in place.
 */
export function placeStraightInDescent(routes) {
  const ent2 = routes?.find((r) => r?.id === 'ENT2');
  const i = ent2?.points?.findIndex((p) => p?.label === 'Glide path') ?? -1;
  if (i < 1) return;
  const pat1 = routes.find((r) => r?.id === 'PAT1');
  const { ux, uy, windowOutFt, slope } = approachLine(pat1);
  const th = THRESHOLD_29L, p = ent2.points[i], before = ent2.points[i - 1];
  const beforeOutFt = (before.x - th.x) * ux + (before.y - th.y) * uy;
  const outFt = Math.max(windowOutFt + 1000, Math.min(beforeOutFt - 500, interceptOutFt(slope, p.alt)));
  if (!Number.isFinite(outFt)) return;
  const x = Math.round((th.x + ux * outFt) * 10) / 10, y = Math.round((th.y + uy * outFt) * 10) / 10;
  if (p.x !== x) p.x = x;
  if (p.y !== y) p.y = y;
  p.kt = 120;

  // Final waypoint maintains 120 kt
  const finalPt = ent2.points.find((pt) => pt?.label === 'Final');
  if (finalPt) finalPt.kt = 120;

  // Window waypoint: matches the final turn rollout window (PAT1 point 12)
  const patWin = pat1?.points?.[12];
  const winAlt = patWin?.alt ?? 2119;
  const winX = patWin?.x ?? Math.round((th.x + ux * windowOutFt) * 10) / 10;
  const winY = patWin?.y ?? Math.round((th.y + uy * windowOutFt) * 10) / 10;
  let winIdx = ent2.points.findIndex((pt) => pt?.label === 'Window');
  if (winIdx < 0) {
    const winPt = { label: 'Window', x: winX, y: winY, alt: winAlt, kt: 120, g: 1.4142 };
    ent2.points.splice(i + 1, 0, winPt);
  } else {
    const winPt = ent2.points[winIdx];
    winPt.x = winX;
    winPt.y = winY;
    winPt.alt = winAlt;
    winPt.kt = 120;
  }

  // Its last point, at the threshold, moves to the touchdown point past the numbers, with the flare before it: from
  // FLARE_FROM_FT on the 3° line to the numbers, through the flare's middle, onto the runway (TR-93, TR-96). Once only.
  const end = ent2.points[ent2.points.length - 1];
  if (end && Math.hypot(end.x - th.x, end.y - th.y) < 1) {
    const at = (pastFt, alt, label) => ({ ...end, label, alt, kt: 100,
      x: Math.round((th.x - ux * pastFt) * 10) / 10, y: Math.round((th.y - uy * pastFt) * 10) / 10 });
    const flareFromFt = NUMBER_BASE_PAST_THRESHOLD_FT - FLARE_FROM_FT / slope; // before the numbers on the 3° line
    const touchFt = NUMBER_BASE_PAST_THRESHOLD_FT + TOUCHDOWN_PAST_NUMBERS_FT;
    // Halfway through the flare it is about a quarter of the way down (the circuit's flare curve, circuit.js).
    const mid = at((flareFromFt + touchFt) / 2, THRESHOLD_DATA_ELEV_FT + FLARE_FROM_FT * 0.27, 'Flare');
    ent2.points.splice(ent2.points.length - 1, 1,
      at(flareFromFt, THRESHOLD_DATA_ELEV_FT + FLARE_FROM_FT, 'Round-out'), mid, at(touchFt, THRESHOLD_DATA_ELEV_FT, end.label ?? 'Merge'));
  }
}
