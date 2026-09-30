// The T-6A's airspeed and Mach limit as the NFM's own figure gives it, worked out for the tests from the figure, not from
// core's or the engine's limit function. Not a test file (the runner only picks up *.test.js).
//
// NFM Figure 4-1-2, "Airspeed and Mach Limitations" (Figure 5-3, p. 5-9, in manuals/text/t6a-nfm-100-scribd.txt; page image
// manuals/images/t6a-airspeed-mach-limits.png; numbers in manuals/formation-and-turn-numbers.md, "T-6A performance charts"):
// VMO 316 KIAS up to and including 18,769 ft, then the MMO 0.67 line, drawn straight, down to 244 KIAS at 31,000 ft: about
// 309 at 20,000 ft and 279 at 25,000 ft. This is a compressible KIAS. The Energy engine does not compare the model's IAS
// with it: the model's IAS has no compressibility, so it flies the model's own Mach 0.67 limit (energyTopKias, about 9 kt
// lower up high). Core's maxKiasT6A follows this line, and the tests use it to pin core and to show the gap.
export const NFM_LIMIT = Object.freeze({ vmoKias: 316, kneeFt: 18769, topKias: 244, topFt: 31000, mmo: 0.67 });

/** The NFM limit line at altFt: 316 to 18,769 ft, then the straight line to 244 at 31,000 ft (and 244 above). */
export function nfmTopKias(altFt) {
  if (altFt <= NFM_LIMIT.kneeFt) return NFM_LIMIT.vmoKias;
  const frac = Math.min(1, (altFt - NFM_LIMIT.kneeFt) / (NFM_LIMIT.topFt - NFM_LIMIT.kneeFt));
  return NFM_LIMIT.vmoKias + frac * (NFM_LIMIT.topKias - NFM_LIMIT.vmoKias);
}

/** How closely a straight line read off a printed figure is taken: 2 KIAS. */
export const CHART_READ_KIAS = 2;
