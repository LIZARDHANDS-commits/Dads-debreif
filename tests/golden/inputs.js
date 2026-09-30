// Deterministic inputs for golden tests: fixed edge cases plus a seeded
// pseudo-random spread, so every run compares the same numbers.

/** Small seeded generator (mulberry32), returns floats in [0, 1). */
export function seeded(seed = 0x5eed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n values spread over [lo, hi), from a fixed seed. */
export function spread(n, lo, hi, seed) {
  const r = seeded(seed);
  return Array.from({ length: n }, () => lo + (hi - lo) * r());
}

/** Every heading edge case V6's wrap loops care about, in radians. */
export const EDGE_RADIANS = [
  0, -0, 1e-12, -1e-12, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI,
  Math.PI + 1e-12, -Math.PI - 1e-12, 2 * Math.PI, -2 * Math.PI, 3 * Math.PI, -3 * Math.PI, 7.5, -7.5, 100, -100,
];

/** Moose Jaw (CYMJ) area, where Dad's example flights are. */
export const CYMJ = { lat: 50.3303, lon: -105.5592 };
