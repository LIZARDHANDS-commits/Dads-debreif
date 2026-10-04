// Times a scenario's straight-in so it meets an overhead aircraft in its final turn, in today's wind (Busy circuit,
// Patrick, 4 Oct 18:36Z). Each aircraft is flown once on its own, with no deconfliction, and their tracks are
// compared: the straight-in's start is the delay that brings it closest to the other while that one is in its
// final turn, within the caution height (500 ft, TR-Q11). Nothing here changes how anything flies.
import { createSim } from './sim.js';

/** How often the tracks are sampled, s. */
const SAMPLE_SEC = 0.5;
/** How long each aircraft is flown alone, s: long enough for either to reach the final turn from its start. */
const FLY_SEC = 240;
/** Only closer than this in height counts as meeting, ft (the caution height and distance, TR-Q11). */
const HEIGHT_FT = 500;

function trackOf(setup, spec, flySec = FLY_SEC) {
  const sim = createSim({ ...setup, deconflict: false, aircraft: [{ ...spec, id: 'T1', startsAtSec: 0 }] }, { seed: 1 });
  const out = [];
  for (let t = SAMPLE_SEC; t <= flySec; t += SAMPLE_SEC) {
    sim.stepTo(t);
    const a = sim.state().aircraft[0];
    out.push(a?.status === 'flying' ? { x: a.x, y: a.y, alt: a.alt, phase: a.phase, leg: a.leg } : null);
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

/** "Spawn a conflict" only counts a meeting this far ahead or more, s, so it can be seen coming (an estimate). */
const CONFLICT_LEAD_SEC = 20;
/** How far ahead it looks for the meeting, s (an estimate): long enough for an aircraft on initial to reach its final turn. */
const CONFLICT_AHEAD_SEC = 180;
/** How long the new aircraft's route is flown once, s: a full Pattern 1 circuit and the look ahead (an estimate). */
const CONFLICT_LAP_SEC = 480;
/** The new aircraft never appears closer than this to anyone, ft (1 NM, as Random's spacing). */
const CONFLICT_SPAWN_GAP_FT = 6076;

/**
 * "Spawn a conflict" (Patrick, 4 Oct 19:24Z): where on `routeId` a new aircraft should start, and after what delay,
 * so that it meets aircraft `targetId` of the running `sim` and one of them has to manage it (for example a
 * straight-in that meets the aircraft on initial at the perch). Everyone is flown on from now on a copy of the run
 * with no deconfliction (the run itself is not touched), and the route once from its first point; a start at a
 * later point is that same flight from when it passed the point. The pick is the start point and delay
 * (0 to `mostSec`) that bring the two closest, at least CONFLICT_LEAD_SEC ahead and inside the caution distance
 * (500 ft and 500 ft, TR-Q11), appearing at least 1 NM from everyone and meeting no one else first.
 * Returns { startPoint (from 1), delaySec, closestFt, inSec } or null when the route can't meet it.
 */
export function conflictSpawnPlan(sim, setup, targetId, routeId, { type = 'CT-156', mostSec = 120 } = {}) {
  const route = (setup.routes ?? []).find((r) => r.id === routeId);
  if (!route?.points?.length) return null;
  const fork = createSim({ ...setup, deconflict: false, aircraft: [] }, { seed: 1 });
  fork.restore(structuredClone(sim.snapshot()));
  if (!fork.state().aircraft.some((a) => a.id === targetId && a.status === 'flying')) return null;
  const t0 = fork.t;
  const frames = [];
  for (let s = SAMPLE_SEC; s <= CONFLICT_AHEAD_SEC; s += SAMPLE_SEC) {
    fork.stepTo(t0 + s);
    frames.push(fork.state().aircraft.filter((a) => a.status === 'flying').map((a) => ({ id: a.id, x: a.x, y: a.y, alt: a.alt })));
  }
  const lap = trackOf(setup, { type, routeId, startIndex: 0 }, CONFLICT_LAP_SEC);
  const near = (a, b, lat) => Math.abs(a.alt - b.alt) < HEIGHT_FT && Math.hypot(a.x - b.x, a.y - b.y) < lat;
  let best = null;
  for (let p = 0; p < route.points.length; p++) {
    const from = p === 0 ? 0 : lap.findIndex((q) => q && q.leg === p + 1);
    if (from < 0) continue;
    for (let k = 0; k * SAMPLE_SEC <= mostSec && k < frames.length; k++) {
      const at = (i) => lap[from + i - k];
      const first = at(k);
      if (!first || frames[k].some((o) => Math.hypot(o.x - first.x, o.y - first.y) < CONFLICT_SPAWN_GAP_FT)) continue;
      for (let i = k; i < frames.length; i++) {
        const b = at(i);
        if (!b) break;
        const target = frames[i].find((o) => o.id === targetId);
        if (frames[i].some((o) => o.id !== targetId && near(o, b, HEIGHT_FT))) break; // meets someone else first
        if (!target || i + 1 < CONFLICT_LEAD_SEC / SAMPLE_SEC || Math.abs(target.alt - b.alt) >= HEIGHT_FT) continue;
        const d = Math.hypot(target.x - b.x, target.y - b.y);
        if (!best || d < best.closestFt) best = { startPoint: p + 1, delaySec: k * SAMPLE_SEC, closestFt: d, inSec: (i + 1) * SAMPLE_SEC };
      }
    }
  }
  return best && best.closestFt < HEIGHT_FT ? best : null;
}
