// Deterministic inputs for golden tests: fixed edge cases plus a seeded
// pseudo-random spread, so every run compares the same numbers.
import { KT_TO_FTPS } from '../../src/core/units.js';

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

/**
 * A recorded track like a KML debrief track: about one point a second (some
 * gaps and bunches), on a turn whose rate, speed and altitude wander. `r` is a
 * seeded() generator.
 */
export function recordedTrack(id, r, n = 40) {
  const pts = [];
  let x = 4000 * r(), y = 4000 * r(), h = 2 * Math.PI * r(), t = 1000 * r(), kt = 120 + 200 * r();
  for (let i = 0; i < n; i++) {
    pts.push({ t, x, y, altFt: 5000 + 3000 * r() });
    const dt = r() < 0.1 ? 0.2 : r() < 0.1 ? 3 : 1;
    const v = kt * KT_TO_FTPS * (r() < 0.05 ? 0 : 1);
    h += (-0.4 + 0.8 * r()) * dt;
    x += v * Math.cos(h) * dt;
    y += v * Math.sin(h) * dt;
    t += dt;
    kt += -10 + 20 * r();
  }
  return { id, pts };
}
