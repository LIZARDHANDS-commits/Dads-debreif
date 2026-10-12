// Unit constants and conversions, written once for every module.

/** Feet per nautical mile. */
export const FT_PER_NM = 6076.12;

/** Feet per second per knot. */
export const KT_TO_FTPS = 1.68781;

/**
 * Knots per foot per second. Rounded on its own, so it is not exactly
 * 1 / KT_TO_FTPS (0.592484 vs 0.5924838); whether to keep the rounding is
 * on the list for Patrick (core refactor handover, step 5).
 */
export const FTPS_TO_KT = 0.592484;

/** Feet per metre. */
export const FT_PER_M = 3.28084;

/** Metres per foot (exact). */
export const M_PER_FT = 0.3048;

/** Standard gravity in ft/s². */
export const G_FTPS2 = 32.174;

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
