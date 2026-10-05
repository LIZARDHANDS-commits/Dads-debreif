// Times a scenario's straight-in so it meets an overhead aircraft in its final turn, in today's wind (Busy circuit,
// Patrick, 4 Oct 18:36Z). Each aircraft is flown once on its own, with no deconfliction, and their tracks are
// compared: the straight-in's start is the delay that brings it closest to the other while that one is in its
// final turn, within the caution height (500 ft, TR-Q11). Nothing here changes how anything flies.
import { createSim } from './sim.js';
import { pointDistFt, DEFAULT_ROUTE_OPTIONS } from './route.js';

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
    out.push(a?.status === 'flying' ? { x: a.x, y: a.y, alt: a.alt, phase: a.phase, leg: a.leg, routeId: a.routeId, distFt: a.distFt } : null);
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
/** The new aircraft never appears closer than this to anyone, ft (1 NM, as Random's spacing)... */
const CONFLICT_SPAWN_GAP_FT = 6076;
/**
 * ...counting only aircraft within this height of it, ft (an estimate). Without it a PFL gliding in 5,000 ft overhead
 * blocked every start on final, and Spawn a conflict found nothing (Patrick, 4 Oct).
 */
const CONFLICT_SPAWN_GAP_HEIGHT_FT = 1000;

/**
 * "Spawn a conflict" (Patrick, 4 Oct 19:24Z; any spot, soonest, 4 Oct): where on `routeId` a new aircraft should start,
 * and after what delay, so that it meets aircraft `targetId` of the running `sim` and one of them has to manage it.
 * Everyone is flown on from now on a copy of the run with no deconfliction (the run itself is not touched), and the
 * route once from its first point; a start anywhere along it is that same flight from when it was there (every
 * SAMPLE_SEC of it, finer than 0.1 NM), placed with the start partway along a route (sim.spawn backFt, TR-66). The pick
 * is the meeting that comes soonest, inside the caution distance (500 ft and 500 ft, TR-Q11) and at least
 * CONFLICT_LEAD_SEC ahead, starting now if any start now works, else after a delay of up to `mostSec`; it appears at
 * least 1 NM from everyone. Meeting someone else first is allowed (Patrick: "if that happens oh well").
 * Returns { backFt, startPoint (the spot it starts after, from 1), delaySec, inSec, closestFt } or null.
 */
export function conflictSpawnPlan(sim, setup, targetId, routeId, { type = 'CT-156', mostSec = 120 } = {}) {
  const route = (setup.routes ?? []).find((r) => r.id === routeId);
  if (!route?.points?.length) return null;
  const fork = createSim({ ...setup, deconflict: false, aircraft: [] }, { seed: 1 });
  fork.restore(structuredClone(sim.snapshot()));
  if (!fork.state().aircraft.some((a) => a.id === targetId && a.status === 'flying')) return null;
  const t0 = fork.t;
  const targetAt = [], others = [];
  for (let s = SAMPLE_SEC; s <= CONFLICT_AHEAD_SEC; s += SAMPLE_SEC) {
    fork.stepTo(t0 + s);
    const flying = fork.state().aircraft.filter((a) => a.status === 'flying');
    targetAt.push(flying.find((a) => a.id === targetId) ?? null);
    others.push(flying.map((a) => ({ x: a.x, y: a.y, alt: a.alt })));
  }
  const lap = trackOf(setup, { type, routeId, startIndex: 0 }, CONFLICT_LAP_SEC);
  const endFt = pointDistFt(route, route.points.length - 1, setup.routeOptions ?? DEFAULT_ROUTE_OPTIONS);
  const lead = Math.ceil(CONFLICT_LEAD_SEC / SAMPLE_SEC) - 1;
  const meets = (o, b) => o && b && Math.abs(o.alt - b.alt) < HEIGHT_FT && Math.hypot(o.x - b.x, o.y - b.y) < HEIGHT_FT;
  // The starts on the route's first lap: while it is still on this route, before its end.
  const starts = [];
  for (let j = 0; j < lap.length; j++) {
    const q = lap[j];
    if (!q || q.routeId !== routeId || !Number.isFinite(q.distFt) || q.distFt > endFt) continue;
    if (j > 0 && lap[j - 1] && lap[j - 1].routeId === routeId && lap[j - 1].distFt > q.distFt) break; // round again
    starts.push(j);
  }
  const stride = Math.round(2 / SAMPLE_SEC); // delays in 2 s steps, once nothing starting now works
  for (const k of [0, ...Array.from({ length: Math.floor(mostSec / 2) }, (_, n) => (n + 1) * stride)]) {
    if (k >= targetAt.length) break;
    let best = null;
    for (const j of starts) {
      const first = lap[j];
      if (others[k].some((o) => Math.abs(o.alt - first.alt) < CONFLICT_SPAWN_GAP_HEIGHT_FT && Math.hypot(o.x - first.x, o.y - first.y) < CONFLICT_SPAWN_GAP_FT)) continue;
      for (let i = Math.max(k, lead); i < targetAt.length; i++) {
        if (best && i >= best.i) break; // not sooner
        const b = lap[j + i - k];
        if (!b) break;
        if (meets(targetAt[i], b)) {
          best = { i, j, closestFt: Math.hypot(targetAt[i].x - b.x, targetAt[i].y - b.y) };
          break;
        }
      }
    }
    if (best) {
      const q = lap[best.j];
      const startPoint = Math.max(1, Math.min(route.points.length, q.leg ?? 1));
      return { backFt: Math.max(0, endFt - q.distFt), startPoint, delaySec: k * SAMPLE_SEC, inSec: (best.i + 1) * SAMPLE_SEC, closestFt: best.closestFt };
    }
  }
  return null;
}
