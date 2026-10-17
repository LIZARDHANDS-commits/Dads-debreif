// Unit constants and conversions, written once for every module.

/** Feet per nautical mile. */
export const FT_PER_NM = 1852 / 0.3048; // exact: 1,852 m, 0.3048 m per ft (6,076.1155 ft)

/** Feet per second per knot. */
export const KT_TO_FTPS = 1.68781;

/** Knots per foot per second: exactly 1 / KT_TO_FTPS (Patrick, 12 Oct 2026, "make it exact"; 0.592484 until then). */
export const FTPS_TO_KT = 1 / KT_TO_FTPS;

/** Feet per metre. */
export const FT_PER_M = 3.28084;

/** Metres per foot (exact). */
export const M_PER_FT = 0.3048;

/** Standard gravity in ft/s². */
export const G_FTPS2 = 32.174;

/** Air density at sea level on the standard day, slug/ft³ (1.225 kg/m³, the ICAO standard atmosphere). */
export const SEA_LEVEL_DENSITY_SLUG_FT3 = 0.0023769;

/** Earth's mean radius in metres, for the flat map projection (geo.js). */
export const EARTH_RADIUS_M = 6371000;

/** Knots to feet per second. */
export function ktToFtps(kt) {
  return kt * KT_TO_FTPS;
}

/** Feet per second to knots (FTPS_TO_KT). */
export function ftpsToKt(ftps) {
  return ftps * FTPS_TO_KT;
}

/** Feet to a "1.23 NM" label. */
export function formatNm(ft) {
  return (ft / FT_PER_NM).toFixed(2) + ' NM';
}
