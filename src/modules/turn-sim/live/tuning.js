// The Formation Sim's numbers, by family (refactor PR 4, numbers register, TS-95; the tuning table of clean-up step 1,
// TS-64): rates.js (the G rule, the two rate sets, the Rates setting, roll, the wingmen's banks), bands.js (in position and
// done) and moves.js (each move's numbers); the formations' places are slots.js's. Every number has its source beside it
// there, and docs/modules/turn-sim/numbers.md lists them all (tools/turn-sim-numbers.mjs makes it). This file holds no
// numbers: it re-exports the three, so a file may import from here or from the family file.
export * from './rates.js';
export * from './bands.js';
export * from './moves.js';
