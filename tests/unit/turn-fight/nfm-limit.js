// The T-6A's airspeed and Mach limit, worked out for the tests from the NFM's own figure and from Mach itself, not from the
// engine's or core's limit function. Not a test file (the runner only picks up *.test.js).
//
// NFM Figure 4-1-2, "Airspeed and Mach Limitations" (Figure 5-3, p. 5-9, in manuals/text/t6a-nfm-100-scribd.txt; page image
// manuals/images/t6a-airspeed-mach-limits.png; numbers in manuals/formation-and-turn-numbers.md, "T-6A performance charts"):
// VMO 316 KIAS up to and including 18,769 ft, then the MMO 0.67 line, drawn straight, down to 244 KIAS at 31,000 ft.
// That line is in calibrated airspeed (CAS, with compressibility): about 309 at 20,000 ft and 279 at 25,000 ft.
//
// The Turn Fight's own speed is the model's IAS, TAS x sqrt(sigma), which has no compressibility. Mach 0.67 is the same
// flight condition in both, but reads lower in the model's IAS (about 300 at 20,000 ft, 270 at 25,000 ft). The engine
// compares the model's IAS with the limit in the model's IAS, so the tests below take the limit from Mach 0.67 through
// core's atmosphere (speedOfSoundKt, iasToTasKt), which is the NFM's own number.
import { iasToTasKt, tasToIasKt, speedOfSoundKt } from '../../../src/core/t6-performance.js';

export const NFM_LIMIT = Object.freeze({ vmoKias: 316, kneeFt: 18769, topKias: 244, topFt: 31000, mmo: 0.67 });

/** The NFM limit line in calibrated airspeed at altFt: 316 to 18,769 ft, then the straight line to 244 at 31,000 ft (and 244 above). */
export function nfmTopKias(altFt) {
  if (altFt <= NFM_LIMIT.kneeFt) return NFM_LIMIT.vmoKias;
  const frac = Math.min(1, (altFt - NFM_LIMIT.kneeFt) / (NFM_LIMIT.topFt - NFM_LIMIT.kneeFt));
  return NFM_LIMIT.vmoKias + frac * (NFM_LIMIT.topKias - NFM_LIMIT.vmoKias);
}

/** The Mach number the model is flying at a model IAS: TAS over the speed of sound. */
export const machAt = (kias, altFt) => iasToTasKt(kias, altFt) / speedOfSoundKt(altFt);

/** The model's IAS at which the true airspeed is Mach 0.67 (or VMO where that is lower): the top speed on the model's own basis. */
export const modelTopKias = (altFt) => Math.min(NFM_LIMIT.vmoKias, tasToIasKt(NFM_LIMIT.mmo * speedOfSoundKt(altFt), altFt));
