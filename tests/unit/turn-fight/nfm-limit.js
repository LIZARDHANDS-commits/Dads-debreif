// The T-6A's airspeed and Mach limit as the NFM's own figure gives it (not as core's maxKiasT6A computes it).
// NFM Figure 4-1-2, "Airspeed and Mach Limitations" (Figure 5-3, p. 5-9, in manuals/text/t6a-nfm-100-scribd.txt; page image
// manuals/images/t6a-airspeed-mach-limits.png; numbers in manuals/formation-and-turn-numbers.md, "T-6A performance charts"):
// VMO 316 KIAS up to and including 18,769 ft, then the MMO 0.67 line, drawn straight, down to 244 KIAS at 31,000 ft.
// Not a test file (the runner only picks up *.test.js).
export const NFM_LIMIT = Object.freeze({ vmoKias: 316, kneeFt: 18769, topKias: 244, topFt: 31000 });

/** The NFM limit, in KIAS, at altFt: 316 to 18,769 ft, then the straight line to 244 at 31,000 ft (and 244 above). */
export function nfmTopKias(altFt) {
  if (altFt <= NFM_LIMIT.kneeFt) return NFM_LIMIT.vmoKias;
  const frac = Math.min(1, (altFt - NFM_LIMIT.kneeFt) / (NFM_LIMIT.topFt - NFM_LIMIT.kneeFt));
  return NFM_LIMIT.vmoKias + frac * (NFM_LIMIT.topKias - NFM_LIMIT.vmoKias);
}
