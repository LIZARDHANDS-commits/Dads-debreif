// What "in position" and "done" mean for the Formation Sim (refactor PR 4, numbers register, TS-95): the judge's bands
// for a change of formation and the steadiness that ends it. One of three number files with rates.js and moves.js
// (tuning.js only re-exports them); the formations' own places and bands are slots.js's. Moved unchanged from tuning.js.

/**
 * When a 2-ship change of formation counts as done (formation.js inBandAndSteady; Patrick 5 Oct 20:39Z card "In band and
 * steady", 20:41Z "I want 'stabilize' to be 'within 5 knots' instead of 'exactly zero'"; TS-78): #2 IN POSITION by the
 * judge's band, moving against his slot at under closureKt, and banked within bankOffDeg of Lead (estimate). The tracker
 * keeps closing on the exact slot underneath.
 */
export const STEADY = Object.freeze({ closureKt: 5, bankOffDeg: 10 });
/**
 * What "in position" means (Patrick 5 Oct 21:26Z and 21:38Z, TS-80): a tactical formation is in position anywhere in its
 * band: fighting wing in the cone up to fwStackFt above or below Lead (Patrick: 200 ft, straight and level); line abreast
 * in the SMM's band, labBandFt lateral and labStackFt vertical (SMM 16.18 para 49: 4,000-6,000 ft, 0-10° sweep, ±2,000 ft).
 * A close formation is in position within closeFt of its place and within STEADY.closureKt (Patrick: 5 ft and 5 kt).
 */
export const IN_POSITION = Object.freeze({ closeFt: 5, fwStackFt: 200, labBandFt: Object.freeze([4000, 6000]), labStackFt: 2000 });
/** A station change's stop at a corner: "stabilize" is within this many knots against the slot, then the dwell (Patrick 20:41Z; was 1 ft/s). */
export const STOP_KT = 5;
