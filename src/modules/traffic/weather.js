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
import { FIELD_ELEV_FT } from './airfield.js';

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
