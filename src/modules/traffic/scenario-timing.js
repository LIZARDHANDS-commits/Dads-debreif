// Times a scenario's straight-in so it meets an overhead aircraft in its final turn, in today's wind (Busy circuit,
// Patrick, 4 Oct 18:36Z). Each aircraft is flown once on its own, with no deconfliction, and their tracks are
// compared: the straight-in's start is the delay that brings it closest to the other while that one is in its
// final turn, within the caution height (500 ft, TR-Q11). Nothing here changes how anything flies.
import { createSim } from './sim.js';

/** How often the tracks are sampled, s. */
const SAMPLE_SEC = 0.5;
/** How long each aircraft is flown alone, s: long enough for either to reach the final turn from its start. */
const FLY_SEC = 240;
/** Only closer than this in height counts as meeting, ft (the caution height, TR-Q11). */
const HEIGHT_FT = 500;

function trackOf(setup, spec) {
  const sim = createSim({ ...setup, deconflict: false, aircraft: [{ ...spec, id: 'T1', startsAtSec: 0 }] }, { seed: 1 });
  const out = [];
  for (let t = SAMPLE_SEC; t <= FLY_SEC; t += SAMPLE_SEC) {
    sim.stepTo(t);
    const a = sim.state().aircraft[0];
    out.push(a?.status === 'flying' ? { x: a.x, y: a.y, alt: a.alt, phase: a.phase } : null);
  }
  return out;
}

/**
 * The start delay, s (0 to `mostSec`, in SAMPLE_SEC steps), that brings `straightIn` closest to `overhead` in its
 * final turn. `setup` is the sim's setup (routes, wind); the two specs are setup.aircraft entries.
 * Returns { delaySec, closestFt } (closestFt is Infinity when they never come within HEIGHT_FT of each other's height).
 */
export function straightInDelaySec(setup, overhead, straightIn, mostSec = 120) {
  const over = trackOf(setup, overhead);
  const inbound = trackOf(setup, straightIn);
  let best = { delaySec: straightIn.startsAtSec ?? 0, closestFt: Infinity };
  for (let k = 0; k * SAMPLE_SEC <= mostSec; k++) {
    for (let i = k; i < over.length; i++) {
      const a = over[i], b = inbound[i - k];
      if (!a || !b || a.phase !== 'final_turn' || Math.abs(a.alt - b.alt) >= HEIGHT_FT) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < best.closestFt) best = { delaySec: k * SAMPLE_SEC, closestFt: d };
    }
  }
  return best;
}
