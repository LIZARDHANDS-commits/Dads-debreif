// The T-6A's airspeed and Mach limit line (reference), worked out for the tests, not from
// core's or the engine's limit function. Not a test file (the runner only picks up *.test.js).
//
// VMO 316 KIAS up to and including 18,769 ft, then the MMO 0.67 line, drawn straight, down to 244 KIAS at 31,000 ft: about
// 309 at 20,000 ft and 279 at 25,000 ft. This is a compressible KIAS. The Energy engine does not compare the model's IAS
// with it: the model's IAS has no compressibility, so it flies the model's own Mach 0.67 limit (energyTopKias, about 9 kt
// lower up high). Core's maxKiasT6A follows this line, and the tests use it to pin core and to show the gap.
export const REF_LIMIT = Object.freeze({ vmoKias: 316, kneeFt: 18769, topKias: 244, topFt: 31000, mmo: 0.67 });

/** The reference limit line at altFt: 316 to 18,769 ft, then the straight line to 244 at 31,000 ft (and 244 above). */
export function refTopKias(altFt) {
  if (altFt <= REF_LIMIT.kneeFt) return REF_LIMIT.vmoKias;
  const frac = Math.min(1, (altFt - REF_LIMIT.kneeFt) / (REF_LIMIT.topFt - REF_LIMIT.kneeFt));
  return REF_LIMIT.vmoKias + frac * (REF_LIMIT.topKias - REF_LIMIT.vmoKias);
}

/** How closely a straight line read off by eye is taken: 2 KIAS. */
export const REF_READ_KIAS = 2;
