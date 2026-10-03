// The flying for the Traffic Pattern Sim: aircraft spawn, move along their routes at
// the speed set at the route points, loop the pattern, land, take splits, join a pattern
// at the end of an entry or split, and are checked for conflicts (SPEC-traffic, "Flying
// the aircraft"). It is V6's own model, ported unchanged and pinned to it by
// tests/golden/traffic-sim.test.js (R9). Line numbers refer to V6's decoded Traffic page.
//
// Pure: it never reads the page, a setting, the clock or Math.random. It takes a setup
// (see the README) and a seed, and every choice comes from the seeded dice, in V6's
// order, so the same seed gives the same run.
//
// One fixed step: time moves in whole 0.05 s steps of sim time. V6 moved aircraft by
// the frame time (at most 0.05 s) times the speed, so a run came out differently at
// different frame rates and speeds. `stepTo` takes as many whole steps as fit in the
// time it is asked for and stops there, so the caller keeps the remainder; at 1x and
// 20 frames a second it is V6's own run, and it is the same on every screen.
//
// Going back (Rewind, -10 s, task 9, bug #46): every 10 s of sim time the run keeps a snapshot
// of everything a later step depends on (the aircraft, the clock and the dice). `seek` goes to
// any moment by restoring the nearest snapshot before it and flying on from there, so any
// rewind costs at most 10 s of stepping and lands exactly where the forward run was: same
// numbers, same dice, same trails. V6 rebuilt the whole run from 0 at every rewind frame, at
// speed times the real distance, and re-rolled every choice.
//
// Spawning and removing aircraft (Clear finished too) are timed events (RW-01, RW-02): each is recorded at the step
// it happened in, the snapshots up to that step stay valid, and a replay applies it at that step exactly as the live
// run did. So going back to before a spawn or a removal shows the run as it was, and going forward again flies it
// in the same steps. Only an edit of the routes themselves (`forgetHistory`) makes the past be flown again from 0,
// and the events stay in that replay. The dice are still shared (per-aircraft dice are task 12).
import { ktToFtps } from '../../core/units.js';
import { createDice } from './dice.js';
import { DEFAULT_ROUTE_OPTIONS, isClosedRoute, routeLengthFt, pointDistFt, posOnRoute, closestDistFt } from './route.js';
import { tickAircraft, initMode } from './tick-aircraft.js';

/** The step, in seconds of sim time. */
export const STEP_SEC = 0.05;

/** Standard gravity in ft/s² for coordinated turn kinematics. */
export const G_FTPS2 = 32.174;

/** Maximum roll rate authority in deg/s (SPEC-traffic-vector). */
export const MAX_ROLL_RATE_DPS = 45;

/** Standard aircraft types and their colors. Supports legacy V6 names plus Hawk and Hornet. */
export const TYPE_COLORS = Object.freeze({
  'CT-157': '#a5d6ff',
  'CT-156': '#7ee787',
  'CT-102': '#ffcc66',
  'CT-114': '#ff6b6b',
  'CT-155': '#d29922',
  'CF-188': '#56d4dd',
});

/** Fallback knot speeds when route points have no speed specified. */
export const TYPE_FALLBACK_KT = Object.freeze({
  'CT-157': 125,
  'CT-156': 180,
  'CT-102': 150,
  'CT-114': 230,
  'CT-155': 250,
  'CF-188': 300,
});

/** V6's conflict limits (built-in profile, line 613): red 200 ft and 200 ft, caution 500 ft and 500 ft. */
export const DEFAULT_CONFLICT_LIMITS = Object.freeze({ latFt: 200, vertFt: 200, cautionLatFt: 500, cautionVertFt: 500 });

/** Trails: a point every 0.5 s of sim time for the last 2 minutes, whatever the frame rate. */
const TRAIL_EVERY_STEPS = 10;
const TRAIL_POINTS = 240;

/** Guard against a step count that could never finish (a caller passing a bad time). */
const MOST_STEPS_AT_ONCE = 1e7;

/** A snapshot every 10 s of sim time (200 steps). */
const SNAPSHOT_EVERY_STEPS = 200;

/**
 * The most snapshots kept. An hour is 361; past this many the run keeps every other one
 * (every 20 s, then 40 s, ...), so a very long run's memory stays bounded and a rewind is still quick.
 */
const MOST_SNAPSHOTS = 720;

/**
 * Has the aircraft's distance along a pattern gone past `target` between two steps
 * (V6 `crossedProg`, line 380)? A step longer than a whole lap counts as crossing.
 */
function crossed(oldDist, newDist, target, total) {
  const oldMod = ((oldDist % total) + total) % total, newMod = ((newDist % total) + total) % total;
  if (newDist - oldDist >= total) return true;
  return oldMod <= newMod ? (target > oldMod && target <= newMod) : (target > oldMod || target <= newMod);
}

const NO_ROUTES = 'the setup needs at least one route';

/**
 * A sim of the setup's routes and aircraft. It needs at least one route while there are aircraft
 * (a `RangeError` otherwise; V6's Delete route refuses the last one). `setup.routes`, `setup.routeOptions` and
 * `setup.conflictLimits` are read each step, so a route edited while it runs is flown
 * as edited (as in V6). The seed makes the run repeatable.
 */
export function createSim(setup, { seed: firstSeed = 1, maxSnapshots = MOST_SNAPSHOTS } = {}) {
  let seed = firstSeed;
  let dice = createDice(seed);
  let t = 0, steps = 0;
  let aircraft = [];
  // What a replay from 0 starts from: the aircraft the run began with, unflown, and the timed events after that.
  let base = [];
  let events = []; // { step, kind: 'spawn', rec } | { step, kind: 'remove', ids }, in step order
  let job = null; // a replay being done in slices (`seekStepsSlice`): { target, stale }
  let nextEvent = 0; // how many events have been applied: those at or before `steps`
  const history = new Map(); // step -> snapshot (taken before the events at that step)
  let every = SNAPSHOT_EVERY_STEPS;

  const routeOptions = () => ({
    ...DEFAULT_ROUTE_OPTIONS,
    ...(setup.routeOptions ?? {}),
    windKt: setup.windKt ?? setup.routeOptions?.windKt ?? 0,
    windFromDeg: setup.windFromDeg ?? setup.routeOptions?.windFromDeg ?? 360,
  });
  const routeById = (id) => setup.routes.find((r) => r.id === id);
  /** The route an aircraft is on now; V6 falls back to the first route if it has gone. */
  const routeOf = (a) => routeById(a.routeId) || setup.routes[0];

  // ── Aircraft ───────────────────────────────────────────────────────────────

  /**
   * Puts an aircraft at the start of its route, as V6's `resetAircraftToStarts` does (line 411), and
   * clears `landed` as that does. (V6's Reset button, `reset`, line 239, left `landed` set.)
   */
  function toStart(a) {
    const route = routeById(a.startRouteId) || setup.routes[0];
    if (!route) throw new RangeError(NO_ROUTES);
    a.routeId = route.id;
    a.active = true;
    a.landed = false;
    a.distFt = pointDistFt(route, Math.min(+a.startIndex || 0, route.points.length - 1), routeOptions());
    a.lastLap = -1;
    a.splitTaken = {};
    a.trail = [];
    a.command = null;
    a.engineFailed = false;
    a.mode = 'RAIL';
    delete a._blendStart;
    delete a._blendTarget;
    delete a._blendTimer;
    delete a.touchAndGo;

    // Continuous 3D Cartesian vector state initialization (Slice A & B)
    const p = posOnRoute(route, a.distFt, routeOptions());
    a.x = p.x;
    a.y = p.y;
    a.alt = p.alt ?? a.fallbackAlt;
    a.iasKt = p.kt ?? a.fallbackKt;
    a.headingDeg = p.headingDeg;
    a.bankDeg = 0;
    const isClosedPatternStart = route.id === 'PAT1' && (a.startIndex === 1 || /closed\s*pattern/i.test(route.points?.[a.startIndex]?.label));
    if (isClosedPatternStart) {
      a.mode = 'PHYSICS';
      a.phase = 'closed_pattern';
      a.alt = 2400;
      a.iasKt = 140;
      a.headingDeg = 298;
      a.x = route.points[a.startIndex]?.x ?? -4066.03;
      a.y = route.points[a.startIndex]?.y ?? 680.56;
    } else {
      const isBrkPoint = route.id === 'PAT1' && (a.startIndex === 9 || p.seg === 9 || a.startIndex === 2 || p.seg === 2 || /break/i.test(route.points?.[a.startIndex]?.label));
      a.phase = p.phase || (isBrkPoint ? 'break' : 'initial');
    }
    a.trackDeg = a.headingDeg;
    a.crabDeg = 0;
    a.gsKt = a.iasKt;
    return a;
  }

  /**
   * A new aircraft (V6 `makeAircraft`, line 234), started but not yet flown. Like V6's it notes,
   * once, the height of its start point (2,500 ft if that has none), for a route with no legs.
   */
  function makeAircraft({ id, type, routeId, startIndex, startsAt }) {
    return toStart({ id, type, color: TYPE_COLORS[type] || '#fff', fallbackKt: TYPE_FALLBACK_KT[type] ?? 120, fallbackAlt: (routeById(routeId) || setup.routes[0])?.points[startIndex]?.alt || 2500, startRouteId: routeId, startIndex, startsAt });
  }

  /** An aircraft from a `setup.aircraft` entry. */
  const aircraftFromSpec = (spec) => makeAircraft({ id: spec.id, type: spec.type, routeId: spec.routeId, startIndex: spec.startIndex, startsAt: spec.startsAtSec });

  /** What an aircraft is before it flies: enough to make it again with `toStart`. */
  const baseOf = (a) => ({ id: a.id, type: a.type, color: a.color, fallbackKt: a.fallbackKt, fallbackAlt: a.fallbackAlt, startRouteId: a.startRouteId, startIndex: a.startIndex, startsAt: a.startsAt });
  const freshFrom = (rec) => toStart({ ...rec });

  /** A callsign is in use if an aircraft has it now or a spawn still to come (the run was rewound past it) will give it. */
  function inUse(id) {
    if (aircraft.some((a) => a.id === id)) return true;
    for (let i = nextEvent; i < events.length; i++) if (events[i].kind === 'spawn' && events[i].rec.id === id) return true;
    return false;
  }

  /** V6's `nextCallsign` (line 233): the first A1, A2, … not in use. */
  function nextCallsign() {
    let n = 1;
    while (inUse('A' + n)) n++;
    return 'A' + n;
  }

  /** Where an aircraft is, and the height and speed set there (V6 `acPos` and `acProfile`, lines 243 and 244). */
  const whereIs = (a, route = routeOf(a)) => posOnRoute(route, a.distFt, routeOptions());

  // ── One step ───────────────────────────────────────────────────────────────

  /** Land or stay, and take a split or not, as an aircraft flies along a pattern (V6 `checkDecisions`, line 385). */
  function checkDecisions(a, oldDist, newDist) {
    const route = routeOf(a);
    if (!route || route.kind !== 'pattern') return;
    const lengthFt = routeLengthFt(route, routeOptions());
    if (!lengthFt) return;
    const oldLap = Math.floor(oldDist / lengthFt), newLap = Math.floor(newDist / lengthFt);
    const wrapped = newLap > oldLap || (newDist % lengthFt) < (oldDist % lengthFt);
    if (wrapped && a.lastLap !== newLap) {
      a.lastLap = newLap;
      if (dice() < (route.landOdds ?? 0.2)) {
        a.active = false;
        a.landed = true;
        a.alt = 1880;
        a.mode = 'RAIL';
        delete a._blendStart;
        delete a._blendTarget;
        delete a._blendTimer;
        return;
      } else {
        a.phase = 'touch_and_go';
      }
    }
    // Each split from this pattern rolls in turn, and a later one can override an earlier one (V6 bug #47, kept for now).
    for (const split of setup.routes) {
      if (split.kind !== 'split' || split.sourceRoute !== route.id) continue;
      const triggerIndex = Math.max(0, Math.min(+split.sourceIndex || 0, route.points.length - 1));
      const triggerDist = pointDistFt(route, triggerIndex, routeOptions());
      const key = split.id + '_' + newLap + '_' + triggerIndex;
      if (a.splitTaken[key]) continue;
      if (crossed(oldDist, newDist, triggerDist, lengthFt)) {
        a.splitTaken[key] = true;
        if (dice() < (split.splitOdds ?? 0.5)) {
          a.routeId = split.id;
          a.distFt = 0;
          a.phase = 'route';
        }
      }
    }
  }

  /** The end of an entry or split: join the pattern it is linked to, or finish (V6 `handleRouteEnd`, line 365). */
  function handleRouteEnd(a, overshootFt) {
    const route = routeOf(a);
    if (route.kind === 'pattern') { a.distFt = overshootFt; return; }
    const isPfl = route.id === 'ENT4' || route.id === 'PFL' || route.id === 'PFL_HIGH_KEY' || route.kind === 'pfl' || /pfl/i.test(route.name);
    if (isPfl) {
      a.active = false;
      a.landed = true;
      a.phase = 'landing';
      return;
    }
    const target = routeById(route.attachTo);
    if (target && target.kind === 'pattern') {
      const mergeIndex = Math.max(0, Math.min(+route.mergeIndex || 0, target.points.length - 1));
      const curPos = whereIs(a, route);
      a.routeId = target.id;
      a.distFt = closestDistFt(target, curPos, routeOptions()) + Math.max(0, overshootFt);
      const nextP = whereIs(a, target);
      a.phase = nextP.phase || (target.kind === 'pattern' ? 'initial' : 'route');
      // TR-08: a straight-in joining at the threshold (first point) rolls landing decision once
      if (mergeIndex === 0) {
        if (dice() < (target.landOdds ?? 0.2)) {
          a.active = false;
          a.landed = true;
        }
      }
      return;
    }
    a.active = false;
  }


  function stepOnce() {
    t += STEP_SEC; // added up one step at a time, as V6 does, so the clock is V6's to the last digit
    steps++;
    const opt = routeOptions();
    const wind = { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 };
    for (const a of aircraft) {
      if (!a.active || t < a.startsAt) continue;
      const route = routeOf(a);
      const beforeDist = a.distFt;
      tickAircraft(a, STEP_SEC, wind, route, opt);
      if (a.mode === 'RAIL' && route) {
        const len = routeLengthFt(route, opt);
        if (route.kind === 'pattern' && a.distFt >= beforeDist) {
          checkDecisions(a, beforeDist, a.distFt);
        }
        if (a.active && len && a.distFt >= len && !isClosedRoute(route)) {
          handleRouteEnd(a, a.distFt - len);
        }
      }
      if (steps % TRAIL_EVERY_STEPS === 0) {
        a.trail.push({ x: a.x, y: a.y });
        if (a.trail.length > TRAIL_POINTS) a.trail.shift();
      }
    }
    if (steps % every === 0 && !history.has(steps)) remember();
  }

  // ── Timed events ───────────────────────────────────────────────────────────

  function applyEvent(ev) {
    if (ev.kind === 'spawn') aircraft.push(freshFrom(ev.rec));
    else aircraft = aircraft.filter((a) => !ev.ids.includes(a.id));
  }

  /** Applies the events that belong at this step (after the step's own snapshot, which is taken before them). */
  function applyDue() {
    while (nextEvent < events.length && events[nextEvent].step <= steps) applyEvent(events[nextEvent++]);
  }

  /** One step, then whatever was done at the end of it. */
  function advance() {
    stepOnce();
    applyDue();
  }

  /** An edit made now, at this step: the snapshots up to here stay, the later ones no longer say what the run was. */
  function happen(ev) {
    events.splice(nextEvent, 0, { step: steps, ...ev });
    for (const step of history.keys()) if (step > steps) history.delete(step);
    applyDue();
  }

  /** The aircraft the run has once every event has happened, unflown (what Reset and a saved profile keep). */
  function rosterAtEnd() {
    let list = base.map((rec) => ({ ...rec }));
    for (const ev of events) {
      if (ev.kind === 'spawn') list.push({ ...ev.rec });
      else list = list.filter((rec) => !ev.ids.includes(rec.id));
    }
    return list;
  }

  // ── Snapshots ──────────────────────────────────────────────────────────────

  /** Everything a later step depends on. The trail is kept flat (x, y, x, y, ...): it is up to 240 points an aircraft. */
  function takeSnapshot() {
    return {
      t, steps, dice: dice.getState(),
      aircraft: aircraft.map((a) => {
        const { trail, splitTaken, _blendStart, _blendTarget, ...rest } = a;
        const flat = new Float64Array(trail.length * 2);
        trail.forEach((p, i) => { flat[2 * i] = p.x; flat[2 * i + 1] = p.y; });
        return {
          ...rest,
          splitTaken: { ...splitTaken },
          _blendStart: _blendStart ? { ..._blendStart } : undefined,
          _blendTarget: _blendTarget ? { ..._blendTarget } : undefined,
          trail: flat,
        };
      }),
    };
  }

  function putBack(snap) {
    t = snap.t;
    steps = snap.steps;
    nextEvent = events.findIndex((ev) => ev.step >= steps);
    if (nextEvent < 0) nextEvent = events.length;
    dice.setState(snap.dice);
    aircraft = snap.aircraft.map(({ trail, splitTaken, _blendStart, _blendTarget, ...rest }) => ({
      ...rest,
      splitTaken: { ...splitTaken },
      _blendStart: _blendStart ? { ..._blendStart } : undefined,
      _blendTarget: _blendTarget ? { ..._blendTarget } : undefined,
      trail: Array.from({ length: trail.length / 2 }, (_, i) => ({ x: trail[2 * i], y: trail[2 * i + 1] })),
    }));
  }

  /** Keeps a snapshot of this moment, and thins the history out if it has grown past its limit. */
  function remember() {
    history.set(steps, takeSnapshot());
    if (history.size <= maxSnapshots) return;
    every *= 2;
    for (const step of history.keys()) if (step % every !== 0) history.delete(step);
  }

  /** The run's beginning again from `base`: every aircraft at its start, the dice from the seed. */
  function fromBase() {
    t = 0;
    steps = 0;
    dice = createDice(seed);
    aircraft = base.map(freshFrom);
    nextEvent = 0;
    // A replay from 0 is the run as the setup is now: any snapshot kept from before (or from flying on live after the edit) says something else.
    history.clear();
    every = SNAPSHOT_EVERY_STEPS;
    remember();
    applyDue();
  }

  /** Reset and rebuild: a new run from 0 with `list` as its aircraft, no events and a fresh history. */
  function startOver(list) {
    job = null;
    base = list.map((rec) => ({ ...rec }));
    events = [];
    history.clear();
    every = SNAPSHOT_EVERY_STEPS;
    fromBase();
  }

  /** A route, point or option was edited: the snapshots no longer say what the run was. (Spawns and removals don't come here: they are timed events.) */
  function forgetHistory() {
    history.clear();
    every = SNAPSHOT_EVERY_STEPS;
    if (job) job.stale = true; // a replay half done was flown on the old setup
  }

  /** Goes back to the nearest snapshot at or before `wanted`, or to the run's beginning when there is none. */
  function restoreNearest(wanted) {
    let best = -1;
    for (const step of history.keys()) if (step <= wanted && step > best) best = step;
    if (best >= 0) {
      putBack(history.get(best));
      applyDue();
    } else fromBase();
  }

  /** Flies on, or goes back, to a step (a whole number of steps from 0). */
  function goToStep(wanted) {
    if (!Number.isInteger(wanted)) throw new RangeError(`seekSteps needs a whole number of steps, not ${wanted}`);
    wanted = Math.max(0, wanted);
    if (Math.abs(wanted - steps) > MOST_STEPS_AT_ONCE) throw new RangeError(`going to step ${wanted} is too far`);
    const stale = job?.stale;
    job = null;
    if (stale) fromBase();
    else if (wanted < steps) restoreNearest(wanted);
    while (steps < wanted) advance();
    return t;
  }

  /** Like `goToStep`, but takes at most `most` steps and says whether it has arrived; asked again for the same step, it carries on. */
  function goToStepSlice(wanted, most) {
    if (!Number.isInteger(wanted)) throw new RangeError(`seekStepsSlice needs a whole number of steps, not ${wanted}`);
    if (!Number.isInteger(most) || most < 1) throw new RangeError(`seekStepsSlice needs a whole number of steps to take, not ${most}`);
    wanted = Math.max(0, wanted);
    if (!job || job.target !== wanted) {
      if (Math.abs(wanted - steps) > MOST_STEPS_AT_ONCE) throw new RangeError(`going to step ${wanted} is too far`);
      job = { target: wanted, stale: job?.stale ?? false };
    }
    if (job.stale) {
      job.stale = false;
      fromBase();
    } else if (wanted < steps) restoreNearest(wanted);
    for (let n = 0; n < most && steps < wanted; n++) advance();
    if (steps === wanted) job = null;
    return steps === wanted;
  }

  /** Finishes a replay that was left between slices, so an edit is made at the moment it was going to. */
  function settle() {
    if (job) goToStep(job.target);
  }

  // ── What the screen asks ───────────────────────────────────────────────────

  function statusOf(a) {
    if (!a.active) return a.landed ? 'landed' : 'done';
    return t < a.startsAt ? 'waiting' : 'flying';
  }

  /** Any two aircraft that are flying and inside the red or caution limits (V6 `conflicts`, line 459). */
  function findConflicts(flying) {
    const limits = setup.conflictLimits ?? DEFAULT_CONFLICT_LIMITS;
    const out = [];
    for (let i = 0; i < flying.length; i++) {
      for (let j = i + 1; j < flying.length; j++) {
        const vertFt = Math.abs(flying[i].alt - flying[j].alt);
        // Too far apart in height for either limit: no need to work out the distance (same answer as V6's).
        if (vertFt >= limits.vertFt && vertFt >= limits.cautionVertFt) continue;
        const latFt = Math.hypot(flying[i].x - flying[j].x, flying[i].y - flying[j].y);
        const conflict = latFt < limits.latFt && vertFt < limits.vertFt;
        const caution = latFt < limits.cautionLatFt && vertFt < limits.cautionVertFt;
        if (conflict || caution) out.push({ a: flying[i].id, b: flying[j].id, latFt, vertFt, level: conflict ? 'conflict' : 'caution' });
      }
    }
    return out;
  }

  const sim = {
    /** Sim time in seconds; always a whole number of steps. */
    get t() { return t; },
    get seed() { return seed; },
    /** How many whole steps the run has taken (t is these added up). */
    get steps() { return steps; },
    setup,

    /** Flies on in whole steps of 0.05 s up to `tSec` (not past it) and returns how many it took. To go back, use `seek`. */
    stepTo(tSec) {
      settle();
      if (!Number.isFinite(tSec)) throw new RangeError(`stepTo needs a time in seconds, not ${tSec}`);
      const wanted = Math.floor(tSec / STEP_SEC + 1e-9);
      if (wanted - steps > MOST_STEPS_AT_ONCE) throw new RangeError(`stepTo ${tSec} s is too far ahead`);
      let taken = 0;
      while (steps < wanted) { advance(); taken++; }
      return taken;
    },

    /**
     * Goes to the moment `tSec`, forward or back (not before 0): the nearest snapshot before it, then whole steps on.
     * The run there is exactly the one the forward run had, dice and trails included. Returns the sim time.
     */
    seek(tSec) {
      if (!Number.isFinite(tSec)) throw new RangeError(`seek needs a time in seconds, not ${tSec}`);
      return goToStep(Math.floor(tSec / STEP_SEC + 1e-9));
    },

    /** Like `seek`, but by a whole number of steps from 0, which is exact at any length of run (a time in seconds is added up from steps, so it can be a hair under). */
    seekSteps: goToStep,

    /**
     * `seekSteps(n)` in slices: flies at most `most` steps toward step `n` (from the nearest snapshot before it, when
     * going back) and returns true once it is there. The screen calls it once a frame while it says "Replaying…", so
     * the first step back after an edit (a replay from 0, seconds at 30 aircraft and an hour) doesn't freeze the page.
     * Until it returns true the run is part way (`t`, `state()` say where); an edit made then (a spawn, a removal) first
     * finishes the replay, and a route edit starts it again from 0.
     */
    seekStepsSlice: goToStepSlice,

    /** Where the run is, to keep and `restore` later: the aircraft, the time and the dice. Read only. */
    snapshot: takeSnapshot,

    /** Puts the run back to a `snapshot` of a sim made from this setup and seed. The history starts again from there. */
    restore(snap) {
      if (!snap || !Array.isArray(snap.aircraft) || !Number.isInteger(snap.steps) || !Number.isFinite(snap.t)) throw new TypeError('restore needs a snapshot from sim.snapshot()');
      job = null;
      events = [];
      putBack(snap);
      base = aircraft.map(baseOf);
      forgetHistory();
      remember();
    },

    /**
     * How many steps `seekSteps(n)` would fly: the steps ahead, or from the nearest snapshot before `n` (all of
     * them from 0 once an edit has made the snapshots stale). The screen says "Replaying…" before a long one.
     */
    replayCost(n) {
      const wanted = Math.max(0, n);
      if (wanted >= steps) return wanted - steps;
      let best = 0;
      for (const step of history.keys()) if (step <= wanted && step > best) best = step;
      return wanted - best;
    },

    /** How many snapshots the run holds now (about one every 10 s of sim time). */
    historySize: () => history.size,

    /** Tells the run that the setup was edited (a point, a link, an option): going back then flies the edited setup from 0. */
    forgetHistory,

    /** Back to 0 s, every aircraft (spawned ones too) at its start, the dice from the seed again. */
    reset() {
      startOver(rosterAtEnd());
    },

    /**
     * Starts again from `setup.aircraft` (a profile was loaded, or its aircraft changed), at 0 s, with
     * the dice from `seed` (default: the one it has).
     */
    rebuild({ seed: next = seed } = {}) {
      if (!Number.isFinite(next)) throw new RangeError(`the seed must be a number, not ${next}`);
      seed = next;
      startOver((setup.aircraft ?? []).map((spec) => baseOf(aircraftFromSpec(spec))));
    },

    /**
     * Adds an aircraft. `type` is a V6 type name (default CT-156), `routeId` a route (default the first),
     * `startPoint` counts from 1 as on screen (default 1; past the last point it is the last), `delaySec`
     * is from now (default 0). Returns its callsign. `id` picks the callsign.
     * @param {{ type?: string, routeId?: string, startPoint?: number, delaySec?: number, id?: string }} [spec]
     */
    spawn({ type = 'CT-156', routeId, startPoint = 1, delaySec = 0, id } = {}) {
      settle();
      if (!TYPE_COLORS[type]) throw new RangeError(`unknown aircraft type ${type}`);
      const route = routeId === undefined ? setup.routes[0] : routeById(routeId);
      if (!route && !setup.routes.length) throw new RangeError(NO_ROUTES);
      if (!route) throw new RangeError(`unknown route ${routeId}`);
      if (!Number.isInteger(startPoint) || startPoint < 1) throw new RangeError(`the start point counts from 1, not ${startPoint}`);
      if (!Number.isFinite(delaySec)) throw new RangeError(`the delay must be a number of seconds, not ${delaySec}`);
      if (id !== undefined && inUse(id)) throw new RangeError(`callsign ${id} is in use`);
      const rec = baseOf(makeAircraft({ id: id ?? nextCallsign(), type, routeId: route.id, startIndex: startPoint - 1, startsAt: t + delaySec }));
      happen({ kind: 'spawn', rec });
      return rec.id;
    },

    /**
     * A point was added to or deleted from route `routeId`: every aircraft that starts on it starts at
     * the same place as before. `mapIndex(oldIndex) → newIndex` (0-based) says where each point number
     * went; it moves the start point of each aircraft on that route (spawned ones and the setup's own).
     * An aircraft that has not left yet is put at its moved start; one that is flying keeps its distance
     * along the route, as V6's does, and takes the new start when it is next reset.
     */
    remapStarts(routeId, mapIndex) {
      settle();
      const moved = (i) => {
        const to = mapIndex(+i || 0);
        if (!Number.isInteger(to) || to < 0) throw new RangeError(`a start point cannot move to ${to}`);
        return to;
      };
      const wanted = aircraft.filter((a) => a.startRouteId === routeId).map((a) => [a, moved(a.startIndex)]);
      const specs = (setup.aircraft ?? []).filter((spec) => spec.routeId === routeId).map((spec) => [spec, moved(spec.startIndex)]);
      // The starts a replay from 0 uses (the run's own and the spawns still to come) move the same way.
      const records = [...base, ...events.filter((ev) => ev.kind === 'spawn').map((ev) => ev.rec)].filter((rec) => rec.startRouteId === routeId).map((rec) => [rec, moved(rec.startIndex)]);
      for (const [rec, to] of records) rec.startIndex = to;
      for (const [a, to] of wanted) {
        a.startIndex = to;
        if (t < a.startsAt) toStart(a);
      }
      for (const [spec, to] of specs) spec.startIndex = to;
      forgetHistory();
    },

    /** Removes an aircraft from the run, from this step on (true if it was there): going back to before it shows the aircraft. */
    remove(id) {
      settle();
      if (!aircraft.some((a) => a.id === id)) return false;
      happen({ kind: 'remove', ids: [id] });
      return true;
    },

    /** Removes every aircraft that has landed or is done (V6 "Clear inactive"), from this step on. A replay removes those same aircraft at the same step. Returns how many it removed. */
    clearFinished() {
      settle();
      const ids = aircraft.filter((a) => !a.active).map((a) => a.id);
      if (ids.length) happen({ kind: 'remove', ids });
      return ids.length;
    },

    /** The aircraft as `setup.aircraft` has them, so a profile can be saved with what was spawned. */
    aircraftSpecs() {
      return rosterAtEnd().map((rec) => ({ id: rec.id, type: rec.type, routeId: rec.startRouteId, startIndex: rec.startIndex, startsAtSec: rec.startsAt }));
    },

    /** Where the dice are in their sequence (a number that changes with every roll). */
    diceState() { return dice.getState(); },

    /** An aircraft's trail: `[{ x, y }]`, a point every 0.5 s for the last 2 minutes, oldest first. */
    trailOf(id) {
      return aircraft.find((a) => a.id === id)?.trail.slice() ?? [];
    },

    /**
     * Issues an in-flight command to an aircraft: 'breakout', 'engine_fail', 'go_around', 'touch_and_go'.
     */
    command(aircraftId, action) {
      settle();
      const a = aircraft.find((ac) => ac.id === aircraftId);
      if (!a) return false;
      if (action === 'breakout') {
        a.command = action;
        a.landed = false;
        a.active = true;
        a.mode = 'PHYSICS';
        delete a._blendStart;
        delete a._blendTarget;
        delete a._blendTimer;
        a.phase = 'breakout';
      } else if (action === 'climb_high_key' || action === 'climb_low_key') {
        a.command = action;
        a.landed = false;
        a.active = true;
        a.mode = 'PHYSICS';
        delete a._blendStart;
        delete a._blendTarget;
        delete a._blendTimer;
        a.phase = 'pfl';
      } else if (action === 'pfl_current' || action === 'engine_fail') {
        a.command = action;
        a.landed = false;
        a.active = true;
        a.engineFailed = true;
        a.mode = 'PHYSICS';
        delete a._blendStart;
        delete a._blendTarget;
        delete a._blendTimer;
        a.phase = 'pfl';
      } else if (action === 'go_around') {
        a.command = action;
        a.landed = false;
        a.active = true;
        a.engineFailed = false;
        a.mode = 'PHYSICS';
        delete a._blendStart;
        delete a._blendTarget;
        delete a._blendTimer;
        a.phase = 'go_around';
      } else if (action === 'touch_and_go') {
        a.touchAndGo = true;
        a.landed = false;
        a.active = true;
        a.engineFailed = false;
        a.mode = 'RAIL';
        delete a._blendStart;
        delete a._blendTarget;
        delete a._blendTimer;
        const pat = setup.routes.find((r) => r.id === 'PAT1') ?? setup.routes[0];
        if (pat) {
          a.routeId = pat.id;
          a.distFt = pointDistFt(pat, 0, routeOptions());
          const p = posOnRoute(pat, a.distFt, routeOptions());
          a.x = p.x;
          a.y = p.y;
          a.alt = 1892;
          a.iasKt = 100;
          a.headingDeg = p.headingDeg;
          a.bankDeg = 0;
          a.phase = 'touch_and_go';
        }
      }
      return true;
    },

    nextCallsign,

    /** What is where right now. */
    state() {
      const list = aircraft.map((a) => {
        const route = routeOf(a);
        const p = whereIs(a);
        const iasKt = a.iasKt ?? (p.kt ?? a.fallbackKt);
        const altFt = a.landed ? (p.alt ?? 1892) : (a.alt ?? (p.alt ?? a.fallbackAlt));
        const x = a.x ?? p.x;
        const y = a.y ?? p.y;
        const headingDeg = a.headingDeg ?? p.headingDeg;
        return {
          id: a.id, type: a.type, color: a.color, routeId: a.routeId,
          mode: a.mode ?? 'RAIL',
          x, y, alt: altFt, kt: iasKt,
          headingDeg,
          bankDeg: a.bankDeg ?? 0,
          phase: a.phase ?? 'initial',
          trackDeg: a.trackDeg ?? a.headingDeg ?? p.headingDeg,
          crabDeg: a.crabDeg ?? 0,
          groundSpeedKt: a.gsKt ?? iasKt,
          leg: p.seg + 1, distFt: a.distFt,
          status: statusOf(a), startsAt: a.startsAt,
          engineFailed: Boolean(a.engineFailed),
          command: a.command ?? null,
        };
      });
      return { t, aircraft: list, conflicts: findConflicts(list.filter((a) => a.status === 'flying')) };
    },
  };

  base = (setup.aircraft ?? []).map((spec) => baseOf(aircraftFromSpec(spec)));
  aircraft = base.map(freshFrom);
  remember(); // the run at 0 s: the snapshot every rewind can fall back on
  return sim;
}
