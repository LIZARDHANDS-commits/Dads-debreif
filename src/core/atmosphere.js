// The standard atmosphere, once: temperature, pressure, density and the speed
// of sound at a height (standard aerodynamics: the ICAO standard day, 15 °C and
// 1013.25 hPa at sea level, the temperature falling 6.5 °C per km to 11 km and
// steady at −56.5 °C above). Heights are in feet; a temperature deviation is
// today's temperature minus the standard day's, in °C, the same at every height.
import { M_PER_FT } from './units.js';

/** Metres per second per knot. */
const MPS_PER_KT = 1852 / 3600;

/** The temperature at altFt in kelvin, plus deviationC (0 by default: the standard day). */
export function isaTempK(altFt, deviationC = 0) {
  return 288.15 - 0.0065 * Math.min(altFt * M_PER_FT, 11000) + deviationC;
}

/**
 * Air density at altFt as a fraction of sea level, on the standard day.
 * Above 11 km it is held at 0.297, about the ratio at 11 km.
 */
export function isaDensityRatio(altFt) {
  const h = altFt * M_PER_FT, T0 = 288.15, L = .0065, g = 9.80665, R = 287.05287;
  if (h < 11000) {
    const T = T0 - L * h;
    return Math.pow(T / T0, g / (R * L) - 1);
  }
  return .297;
}

/**
 * Air density over sea-level standard at a pressure height altFt, on a day
 * deviationC warmer than standard: the standard pressure there at that
 * temperature, so the standard ratio times T ÷ (T + deviation). Always worked
 * this way, so 0 gives the standard ratio to within its last digit, not exactly.
 */
export function densityRatio(altFt, deviationC = 0) {
  const t = isaTempK(altFt);
  return isaDensityRatio(altFt) * t / (t + deviationC);
}

/**
 * Standard-day static pressure as a fraction of sea level: θ^5.25588 to
 * 11 km, then falling exponentially at −56.5 °C. The pressure at a pressure
 * height does not change with the temperature, so it takes no deviation.
 */
export function isaPressureRatio(altFt) {
  const h = altFt * M_PER_FT;
  if (h <= 11000) return (isaTempK(altFt) / 288.15) ** 5.25588;
  return (216.65 / 288.15) ** 5.25588 * Math.exp(-9.80665 * (h - 11000) / (287.05287 * 216.65));
}

/**
 * The speed of sound in knots at altFt: √(γRT), at the standard day's
 * temperature plus deviationC (0 by default). altFt must be finite, or it
 * throws a RangeError.
 */
export function speedOfSoundKt(altFt, deviationC = 0) {
  if (!Number.isFinite(altFt)) throw new RangeError(`speed of sound at ${altFt} ft: needs a finite height`);
  return Math.sqrt(1.4 * 287.05287 * isaTempK(altFt, deviationC)) / MPS_PER_KT;
}
