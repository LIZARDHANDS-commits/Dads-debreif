// The optimiser's modes (optimiser plan route 1, section 3; Patrick 6 Oct 2026 22:33Z "keep both, route 1 first"; Phase A,
// Patrick 10 Oct 2026 20:20Z): a mode is a set of switches on the score terms (score.js), never a separate planner. The
// hard limits (7 G, the bubble, the lane) are not switches: score.js always applies them.

/** Which score terms each mode counts. By the book is the default (a trainer). */
export const MODES = Object.freeze({
  BY_THE_BOOK: Object.freeze({ label: 'By the book', terms: null }), // null: every term
  UNRESTRICTED: Object.freeze({
    label: 'Unrestricted',
    terms: Object.freeze(['time', 'energy', 'control', 'gRule']), // physics and efficiency only
  }),
});

/** True when `mode` counts term `key`. */
export function termOn(mode, key) {
  return !mode?.terms || mode.terms.includes(key);
}
