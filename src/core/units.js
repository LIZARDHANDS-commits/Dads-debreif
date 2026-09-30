// Unit constants and conversions, exactly as V6 uses them (R9).
// Line numbers refer to original/shell.html unless a sub-page is named.

/** Feet per nautical mile (Turn Sim line 780, Turn Fight line 4234). */
export const FT_PER_NM = 6076.12;

/** Feet per second per knot (Turn Sim, Turn Fight, EM chart, Traffic page). */
export const KT_TO_FTPS = 1.68781;

/**
 * Knots per foot per second, as the debrief viewer uses it (line 2105).
 * V6 rounds this separately, so it is not exactly 1 / KT_TO_FTPS
 * (0.592484 vs 0.5924838). Keep both until a logged decision says otherwise.
 */
export const FTPS_TO_KT = 0.592484;

/** Feet per metre (debrief viewer line 2105). */
export const FT_PER_M = 3.28084;

/** Metres per foot (ISA density in the EM chart, line 4154). */
export const M_PER_FT = 0.3048;

/** Standard gravity in ft/s² (Turn Sim, Turn Fight, Traffic page). */
export const G_FTPS2 = 32.174;

/** Earth radius in metres used by the debrief map projection (line 2378). */
export const EARTH_RADIUS_M = 6371000;

/** Knots to feet per second. */
export function ktToFtps(kt) {
  return kt * KT_TO_FTPS;
}

/** Feet per second to knots, with the debrief viewer's factor. */
export function ftpsToKt(ftps) {
  return ftps * FTPS_TO_KT;
}

/** Feet to a "1.23 NM" label (Turn Sim `nm`, line 786). */
export function formatNm(ft) {
  return (ft / FT_PER_NM).toFixed(2) + ' NM';
}
