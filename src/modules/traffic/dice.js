// The seeded dice for the Traffic Pattern Sim (SPEC-traffic, Assumption 4, "Flying the
// aircraft"). V6 rolls Math.random for every choice (land or go round, take a split or
// not), so no run can be repeated. Here every choice comes from one seeded generator,
// so the same seed gives the same run, and the golden tests can hand the same dice to
// V6's own code and to sim.js and get the same choices in the same order.
//
// The generator is mulberry32: small, fast, and the same numbers on every machine.
// Nothing here reads the clock or Math.random.

/**
 * A pair of dice for a seed: call it for a number from 0 up to (not including) 1.
 * `getState()` and `setState(state)` save and restore where it is in its sequence,
 * so a run can be picked up again from a snapshot.
 */
export function createDice(seed = 1) {
  let a = Number.isFinite(+seed) ? Math.trunc(+seed) >>> 0 : 0;
  const dice = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  dice.getState = () => a;
  dice.setState = (state) => { a = state >>> 0; };
  return dice;
}
