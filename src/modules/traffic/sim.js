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
import { iasToTasKt } from '../../core/t6-performance.js';
import { bankDegFromG } from '../../core/flight-math.js';
import { windTriangle } from '../../core/wind.js';
import { createDice } from './dice.js';
import { DEFAULT_ROUTE_OPTIONS, isClosedRoute, routeLengthFt, pointDistFt, posOnRoute, closestDistFt, computeWindPerch } from './route.js';

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
    delete a.customAlt;
    delete a.customKt;
    delete a.customHeading;
    delete a.customX;
    delete a.customY;
    delete a.touchAndGo;

    // Continuous 3D Cartesian vector state initialization (Slice A & B)
    const p = posOnRoute(route, a.distFt, routeOptions());
    a.x = a.customX ?? p.x;
    a.y = a.customY ?? p.y;
    a.alt = a.customAlt ?? (p.alt ?? a.fallbackAlt);
    a.iasKt = a.customKt ?? (p.kt ?? a.fallbackKt);
    a.headingDeg = a.customHeading ?? p.headingDeg;
    a.bankDeg = 0;
    const isClosedPatternStart = route.id === 'PAT1' && (a.startIndex === 1 || /closed\s*pattern/i.test(route.points?.[a.startIndex]?.label));
    if (isClosedPatternStart) {
      a.phase = 'closed_pattern';
      a.closedPatternGuidance = true;
      a.customAlt = 2400;
      a.customKt = 140;
      a.alt = 2400;
      a.iasKt = 140;
      a.customHeading = 298;
      a.headingDeg = 298;
      a.customX = route.points[a.startIndex]?.x ?? -4066.03;
      a.customY = route.points[a.startIndex]?.y ?? 680.56;
      a.x = a.customX;
      a.y = a.customY;
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

  const getWindFromDeg = () => setup.windFromDeg ?? 360;
  const getWindKt = () => setup.windKt ?? 0;

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
        delete a.customAlt;
        delete a.customHeading;
        delete a.customX;
        delete a.customY;
        delete a.customKt;
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

  /** Everything V6's `step` does for one aircraft in one step of play (line 454). */
  function fly(a) {
    const windKt = getWindKt();
    const windFromDeg = getWindFromDeg();
    const blowToRad = ((windFromDeg + 180) * Math.PI) / 180;
    const windFtps = ktToFtps(windKt);
    const Wx = windFtps * Math.sin(blowToRad);
    const Wy = windFtps * Math.cos(blowToRad);

    if (a.command === 'breakout') {
      const p = whereIs(a);
      const curX = a.customX ?? a.x ?? p.x;
      const curY = a.customY ?? a.y ?? p.y;
      let curHdg = a.customHeading ?? a.headingDeg ?? 118;
      let altFt = a.customAlt ?? a.alt ?? 2500;
      let iasKt = a.customKt ?? a.iasKt ?? 140;

      // Immediate climb to 3,500 ft MSL at standard climb rate
      if (altFt < 3500) {
        altFt = Math.min(3500, altFt + 30 * STEP_SEC);
        if (iasKt < 140) iasKt = Math.min(140, iasKt + 4 * STEP_SEC);
      } else {
        altFt = 3500;
        const targetKt = a.breakoutPhase === 'intercept_rejoin' ? 220 : 180;
        if (iasKt < targetKt) iasKt = Math.min(targetKt, iasKt + 4 * STEP_SEC);
      }

      // Multi-phase state machine matching Split 2 geometry:
      // Phase 1: vector_outbound -> fly towards Outbound waypoint (2 NM south of pattern)
      // Phase 2: fly_south -> continue south along radial towards Rejoin leg turn
      // Phase 3: intercept_rejoin -> turn onto rejoin line towards 45° entry merge
      // Rejoin: merge back into PAT1 at point 7 (45° leg entry) at 3,500 ft / 220 kt
      if (!a.breakoutPhase) a.breakoutPhase = 'vector_outbound';

      let targetX = -15652.8;
      let targetY = -38011.9;
      let targetBank = 35;

      if (a.breakoutPhase === 'vector_outbound') {
        targetX = -15652.8;
        targetY = -38011.9;
        const dist = Math.hypot(targetX - curX, targetY - curY);
        if (dist < 3500 || curY <= -37000) {
          a.breakoutPhase = 'fly_south';
        }
      }

      if (a.breakoutPhase === 'fly_south') {
        targetX = 2047.2;
        targetY = -50911.9;
        const dist = Math.hypot(targetX - curX, targetY - curY);
        if (dist < 3500 || curY <= -49000) {
          a.breakoutPhase = 'intercept_rejoin';
        }
      }

      if (a.breakoutPhase === 'intercept_rejoin') {
        targetX = 21702.2;
        targetY = -19342.8;
        const dist = Math.hypot(targetX - curX, targetY - curY);
        if (dist < 3500 || curY >= -20000) {
          // Reached 45° entry merge point! Rejoin PAT1 at point 7 (45° leg)
          const pat = setup.routes.find((r) => r.id === 'PAT1') ?? setup.routes[0];
          if (pat) {
            a.routeId = pat.id;
            a.distFt = pointDistFt(pat, 7, routeOptions());
            const pRejoin = posOnRoute(pat, a.distFt, routeOptions());
            a.customX = pRejoin.x;
            a.customY = pRejoin.y;
            a.x = pRejoin.x;
            a.y = pRejoin.y;
            a.customHeading = pRejoin.headingDeg;
            a.headingDeg = pRejoin.headingDeg;
            a.customAlt = 3500;
            a.customKt = 220;
            a.phase = 'initial';
          }
          a.command = null;
          delete a.breakoutPhase;
          delete a.breakoutTarget;
          return;
        }
      }

      // Closed-loop vector guidance toward (targetX, targetY)
      const targetBearingDeg = (Math.atan2(targetX - curX, targetY - curY) * 180 / Math.PI + 360) % 360;
      let diffDeg = ((targetBearingDeg - curHdg + 540) % 360) - 180;
      const maxTurnStep = 45 * STEP_SEC;
      if (Math.abs(diffDeg) > maxTurnStep) {
        curHdg = (curHdg + Math.sign(diffDeg) * maxTurnStep + 360) % 360;
        a.bankDeg = Math.sign(diffDeg) * targetBank;
      } else {
        curHdg = targetBearingDeg;
        a.bankDeg = 0;
      }

      a.customHeading = curHdg;
      a.customAlt = altFt;
      a.customKt = iasKt;

      const vAir = ktToFtps(iasKt);
      const headingRad = (curHdg * Math.PI) / 180;
      const dotX = vAir * Math.sin(headingRad) + Wx;
      const dotY = vAir * Math.cos(headingRad) + Wy;
      a.customX = curX + dotX * STEP_SEC;
      a.customY = curY + dotY * STEP_SEC;
      a.x = a.customX;
      a.y = a.customY;
      a.alt = altFt;
      a.headingDeg = curHdg;
      a.trackDeg = (Math.atan2(dotX, dotY) * 180 / Math.PI + 360) % 360;
      a.iasKt = iasKt;
      a.gsKt = Math.hypot(dotX, dotY) / 1.68781;
      a.phase = 'breakout';

      if (steps % TRAIL_EVERY_STEPS === 0) {
        a.trail.push({ x: a.x, y: a.y });
        if (a.trail.length > TRAIL_POINTS) a.trail.shift();
      }
      return;
    }

    if (a.command === 'climb_high_key' || a.command === 'climb_low_key') {
      const p = whereIs(a);
      const curX = a.customX ?? a.x ?? p.x;
      const curY = a.customY ?? a.y ?? p.y;
      let curHdg = a.customHeading ?? a.headingDeg ?? 118;
      let altFt = a.customAlt ?? a.alt ?? 2500;
      let iasKt = a.customKt ?? a.iasKt ?? 140;

      if (!a.pflPhase) a.pflPhase = (a.command === 'climb_low_key') ? 'climb_lk' : 'climb_hk';

      const thX = 3103.84, thY = -3193.93;
      const lkX = 251.5, lkY = -8558.8;
      const rwyHdg = 298;

      let targetX = thX, targetY = thY, targetBank = 30;
      let useDirectArc = false;

      if (a.pflPhase === 'climb_hk') {
        // Full power climb to High Key (5,000 ft MSL over threshold facing down runway 298°)
        altFt = Math.min(5000, altFt + 35 * STEP_SEC);
        if (altFt >= 4800) {
          iasKt = Math.max(120, iasKt - 4 * STEP_SEC);
        } else {
          iasKt = 140;
        }

        const rwyRad = (rwyHdg * Math.PI) / 180;
        const rwyUx = Math.sin(rwyRad);
        const rwyUy = Math.cos(rwyRad);
        const relX = curX - thX;
        const relY = curY - thY;
        const alongRwy = relX * rwyUx + relY * rwyUy;
        const crossRwy = relX * (-rwyUy) + relY * rwyUx;

        // Vector to extended final southeast of threshold before crossing inbound
        const fixDist = 6000;
        const fixX = thX - rwyUx * fixDist;
        const fixY = thY - rwyUy * fixDist;

        if (altFt < 4500 || alongRwy > -1500) {
          targetX = fixX;
          targetY = fixY;
        } else {
          targetX = thX;
          targetY = thY;
        }

        const distToTh = Math.hypot(thX - curX, thY - curY);
        if (altFt >= 4700 && (distToTh < 1500 || (alongRwy >= -300 && alongRwy <= 1200 && Math.abs(crossRwy) < 1500))) {
          curHdg = rwyHdg;
          altFt = 5000;
          iasKt = 120;
          a.pflPhase = 'hk_to_lk_arc';
          a.pflTurnAccum = 0;
        }
      } else if (a.pflPhase === 'climb_lk') {
        // Full power climb to Low Key (~3,800-3,900 ft MSL at 120 kt)
        altFt = Math.min(3900, altFt + 35 * STEP_SEC);
        iasKt = 120;
        targetX = lkX;
        targetY = lkY;
        const distToLK = Math.hypot(lkX - curX, lkY - curY);
        if (altFt >= 3800) {
          a.pflPhase = 'lk_to_final_arc';
          a.pflTurnAccum = 0;
          curHdg = 118;
        }
      }

      if (a.pflPhase === 'hk_to_lk_arc') {
        // Continuous circular arc gliding turn from High Key to Low Key:
        // 180° left turn at 120 KIAS gliding down from 5,000 ft to 3,500 ft
        useDirectArc = true;
        iasKt = 120;
        altFt = Math.max(3500, altFt - 28 * STEP_SEC);
        const gAcc = 32.174;
        const bankRad = (30 * Math.PI) / 180;
        const omega = (gAcc * Math.tan(bankRad)) / Math.max(1, ktToFtps(iasKt));
        const turnStep = (omega * STEP_SEC * 180) / Math.PI;
        a.pflTurnAccum = (a.pflTurnAccum ?? 0) + turnStep;
        curHdg = (curHdg - turnStep + 360) % 360;
        a.bankDeg = -30;
        if (a.pflTurnAccum >= 175 || Math.abs(curHdg - 118) <= 5) {
          a.pflPhase = 'lk_to_final_arc';
          a.pflTurnAccum = 0;
          curHdg = 118;
          a.bankDeg = 0;
        }
      }

      if (a.pflPhase === 'lk_to_final_arc' || a.pflPhase === 'low_key_turn') {
        // Continuous circular arc gliding turn from Low Key to Final:
        // 180° left turn at 120 KIAS descending from 3,500 ft to 2,100 ft
        useDirectArc = true;
        iasKt = 120;
        altFt = Math.max(2100, altFt - 26 * STEP_SEC);
        const gAcc = 32.174;
        const bankRad = (30 * Math.PI) / 180;
        const omega = (gAcc * Math.tan(bankRad)) / Math.max(1, ktToFtps(iasKt));
        const turnStep = (omega * STEP_SEC * 180) / Math.PI;
        a.pflTurnAccum = (a.pflTurnAccum ?? 0) + turnStep;
        curHdg = (curHdg - turnStep + 360) % 360;
        a.bankDeg = -30;
        if (a.pflTurnAccum >= 175 || Math.abs(curHdg - 298) <= 5) {
          a.pflPhase = 'final_glide';
          a.pflTurnAccum = 0;
          curHdg = rwyHdg;
          a.bankDeg = 0;
        }
      }

      if (a.pflPhase === 'final_glide' || a.pflPhase === 'base_to_final') {
        targetX = thX;
        targetY = thY;
        iasKt = Math.max(100, iasKt - 2 * STEP_SEC);
        altFt = Math.max(1892, altFt - 18 * STEP_SEC);
        const dist = Math.hypot(targetX - curX, targetY - curY);
        if (dist < 800 || altFt <= 1895) {
          altFt = 1892;
          a.customAlt = 1892;
          a.landed = true;
          a.active = false;
          a.command = null;
          delete a.pflPhase;
          delete a.pflTurnAccum;
          return;
        }
      }

      if (!useDirectArc) {
        const targetBearingDeg = (Math.atan2(targetX - curX, targetY - curY) * 180 / Math.PI + 360) % 360;
        let diffDeg = ((targetBearingDeg - curHdg + 540) % 360) - 180;
        const maxTurnStep = 45 * STEP_SEC;
        if (Math.abs(diffDeg) > maxTurnStep) {
          curHdg = (curHdg + Math.sign(diffDeg) * maxTurnStep + 360) % 360;
          a.bankDeg = Math.sign(diffDeg) * targetBank;
        } else {
          curHdg = targetBearingDeg;
          a.bankDeg = 0;
        }
      }

      a.customHeading = curHdg;
      a.customAlt = altFt;
      a.customKt = iasKt;

      const vAir = ktToFtps(iasKt);
      const headingRad = (curHdg * Math.PI) / 180;
      const dotX = vAir * Math.sin(headingRad) + Wx;
      const dotY = vAir * Math.cos(headingRad) + Wy;
      a.customX = curX + dotX * STEP_SEC;
      a.customY = curY + dotY * STEP_SEC;
      a.x = a.customX;
      a.y = a.customY;
      a.alt = altFt;
      a.headingDeg = curHdg;
      a.trackDeg = (Math.atan2(dotX, dotY) * 180 / Math.PI + 360) % 360;
      a.iasKt = iasKt;
      a.gsKt = Math.hypot(dotX, dotY) / 1.68781;
      a.phase = 'pfl';

      if (steps % TRAIL_EVERY_STEPS === 0) {
        a.trail.push({ x: a.x, y: a.y });
        if (a.trail.length > TRAIL_POINTS) a.trail.shift();
      }
      return;
    }

    if (a.command === 'pfl_current' || (a.command === 'engine_fail' && a.customX !== undefined)) {
      const p = whereIs(a);
      const curX = a.customX ?? a.x ?? p.x;
      const curY = a.customY ?? a.y ?? p.y;
      let curHdg = a.customHeading ?? a.headingDeg ?? 118;
      let altFt = a.customAlt ?? a.alt ?? 2500;
      let iasKt = a.customKt ?? a.iasKt ?? 140;

      if (!a.pflPhase) {
        a.pflPhase = iasKt > 130 ? 'zoom_climb' : 'glide_eval';
      }

      const thX = 3103.84, thY = -3193.93;
      const lkX = 251.5, lkY = -8558.8;
      const bkX = 7200, bkY = -7500;
      const rwyHdg = 298;

      let targetX = thX, targetY = thY, targetBank = 30;
      let useDirectArc = false;

      if (a.pflPhase === 'zoom_climb') {
        // Zoom climb: convert excess speed to altitude
        altFt += 35 * STEP_SEC;
        iasKt = Math.max(125, iasKt - 12 * STEP_SEC);
        if (iasKt <= 125) {
          iasKt = 125;
          a.pflPhase = 'glide_eval';
        }
      }

      if (a.pflPhase === 'glide_eval' || a.pflPhase === 'glide_intercept') {
        iasKt = 125;
        altFt = Math.max(1892, altFt - 20 * STEP_SEC);

        // Assess energy: does the aircraft have enough energy to fly the circular pattern?
        const hAGL = altFt - 1892;
        const distToLK = Math.hypot(lkX - curX, lkY - curY);
        // Circling via Low Key -> Base -> Final takes ~18,000 ft of glide
        const distCircle = distToLK + 16000;
        const maxGlideDist = hAGL * 10; // ~10:1 glide ratio in T-6
        const hasEnergyForCircle = maxGlideDist >= distCircle && altFt >= 3000;

        if (hasEnergyForCircle) {
          // Sufficient energy: vector toward Low Key to join circular arc
          targetX = lkX;
          targetY = lkY;
          if (distToLK < 2500) {
            a.pflPhase = 'lk_to_final_arc';
            a.pflTurnAccum = 0;
            curHdg = 118;
          }
        } else {
          // Insufficient energy: fly DIRECT to the keys / threshold
          if (altFt >= 2600 && Math.hypot(bkX - curX, bkY - curY) < Math.hypot(thX - curX, thY - curY)) {
            targetX = bkX;
            targetY = bkY;
            if (Math.hypot(bkX - curX, bkY - curY) < 2500) a.pflPhase = 'direct_final';
          } else {
            targetX = thX;
            targetY = thY;
            if (Math.hypot(thX - curX, thY - curY) < 1000 || altFt <= 1895) a.pflPhase = 'direct_final';
          }
        }
      }

      if (a.pflPhase === 'lk_to_final_arc' || a.pflPhase === 'low_key_turn') {
        // Continuous circular arc gliding turn from Low Key to Final
        useDirectArc = true;
        iasKt = 120;
        altFt = Math.max(2100, altFt - 26 * STEP_SEC);
        const gAcc = 32.174;
        const bankRad = (30 * Math.PI) / 180;
        const omega = (gAcc * Math.tan(bankRad)) / Math.max(1, ktToFtps(iasKt));
        const turnStep = (omega * STEP_SEC * 180) / Math.PI;
        a.pflTurnAccum = (a.pflTurnAccum ?? 0) + turnStep;
        curHdg = (curHdg - turnStep + 360) % 360;
        a.bankDeg = -30;
        if (a.pflTurnAccum >= 175 || Math.abs(curHdg - 298) <= 5) {
          a.pflPhase = 'final_glide';
          a.pflTurnAccum = 0;
          curHdg = rwyHdg;
          a.bankDeg = 0;
        }
      }

      if (a.pflPhase === 'final_glide' || a.pflPhase === 'direct_final' || a.pflPhase === 'base_to_final' || a.pflPhase === 'landing') {
        targetX = thX;
        targetY = thY;
        iasKt = Math.max(100, iasKt - 2 * STEP_SEC);
        altFt = Math.max(1892, altFt - 18 * STEP_SEC);
        const dist = Math.hypot(targetX - curX, targetY - curY);
        if (dist < 800 || altFt <= 1895) {
          altFt = 1892;
          a.customAlt = 1892;
          a.landed = true;
          a.active = false;
          a.command = null;
          delete a.pflPhase;
          delete a.pflTurnAccum;
          return;
        }
      }

      if (!useDirectArc) {
        const targetBearingDeg = (Math.atan2(targetX - curX, targetY - curY) * 180 / Math.PI + 360) % 360;
        let diffDeg = ((targetBearingDeg - curHdg + 540) % 360) - 180;
        const maxTurnStep = 45 * STEP_SEC;
        if (Math.abs(diffDeg) > maxTurnStep) {
          curHdg = (curHdg + Math.sign(diffDeg) * maxTurnStep + 360) % 360;
          a.bankDeg = Math.sign(diffDeg) * targetBank;
        } else {
          curHdg = targetBearingDeg;
          a.bankDeg = 0;
        }
      }

      a.customHeading = curHdg;
      a.customAlt = altFt;
      a.customKt = iasKt;

      const vAir = ktToFtps(iasKt);
      const headingRad = (curHdg * Math.PI) / 180;
      const dotX = vAir * Math.sin(headingRad) + Wx;
      const dotY = vAir * Math.cos(headingRad) + Wy;
      a.customX = curX + dotX * STEP_SEC;
      a.customY = curY + dotY * STEP_SEC;
      a.x = a.customX;
      a.y = a.customY;
      a.alt = altFt;
      a.headingDeg = curHdg;
      a.trackDeg = (Math.atan2(dotX, dotY) * 180 / Math.PI + 360) % 360;
      a.iasKt = iasKt;
      a.gsKt = Math.hypot(dotX, dotY) / 1.68781;
      a.phase = 'pfl';

      if (steps % TRAIL_EVERY_STEPS === 0) {
        a.trail.push({ x: a.x, y: a.y });
        if (a.trail.length > TRAIL_POINTS) a.trail.shift();
      }
      return;
    }

    if (a.command === 'go_around') {
      const p = whereIs(a);
      const curX = a.customX ?? a.x ?? p.x;
      const curY = a.customY ?? a.y ?? p.y;
      const depX = -4066.03; // Departure end of Runway 29L
      const rwyHeadingDeg = 298; // Runway axis

      if (!a.gaPhase) a.gaPhase = 'climb_2500';

      let iasKt = a.customKt ?? a.iasKt ?? 140;
      let altFt = a.customAlt ?? a.alt ?? 1892;
      let hdgDeg = a.customHeading ?? rwyHeadingDeg;
      let bankDeg = 0;

      if (a.gaPhase === 'climb_2500') {
        hdgDeg = rwyHeadingDeg;
        bankDeg = 0;
        iasKt = 140;
        altFt = Math.min(2500, altFt + 25 * STEP_SEC);
        if (altFt >= 2500) {
          altFt = 2500;
          a.gaPhase = 'accel_to_dep';
        }
      } else if (a.gaPhase === 'accel_to_dep') {
        hdgDeg = rwyHeadingDeg;
        bankDeg = 0;
        altFt = 2500;
        iasKt = Math.min(210, iasKt + 8 * STEP_SEC);
        if (curX <= depX) {
          a.gaPhase = 'zoom_climb';
        }
      } else if (a.gaPhase === 'zoom_climb') {
        hdgDeg = rwyHeadingDeg;
        bankDeg = 0;
        altFt = Math.min(3500, altFt + 45 * STEP_SEC);
        if (iasKt > 180) iasKt = Math.max(180, iasKt - 6 * STEP_SEC);
        else iasKt = Math.min(180, iasKt + 4 * STEP_SEC);

        if (altFt >= 3500) {
          altFt = 3500;
          a.gaPhase = 'level_accel';
        }
      } else if (a.gaPhase === 'level_accel') {
        hdgDeg = rwyHeadingDeg;
        bankDeg = 0;
        altFt = 3500;
        iasKt = Math.min(220, iasKt + 8 * STEP_SEC);
        if (iasKt >= 220) {
          a.gaPhase = 'crosswind_rejoin';
        }
      } else if (a.gaPhase === 'crosswind_rejoin') {
        altFt = 3500;
        iasKt = 220;
        const targetHdg = 118;
        const diff = ((targetHdg - hdgDeg + 540) % 360) - 180;
        const maxTurn = 45 * STEP_SEC;
        if (Math.abs(diff) > maxTurn) {
          hdgDeg = (hdgDeg + Math.sign(diff) * maxTurn + 360) % 360;
          bankDeg = Math.sign(diff) * 45;
        } else {
          hdgDeg = targetHdg;
          bankDeg = 0;
          a.command = null;
          delete a.gaPhase;
          a.phase = 'downwind';
        }
      }

      a.customKt = iasKt;
      a.customAlt = altFt;
      a.customHeading = hdgDeg;
      a.bankDeg = bankDeg;

      const vAir = ktToFtps(iasKt);
      const headingRad = (hdgDeg * Math.PI) / 180;
      const dotX = vAir * Math.sin(headingRad) + Wx;
      const dotY = vAir * Math.cos(headingRad) + Wy;

      a.customX = curX + dotX * STEP_SEC;
      a.customY = curY + dotY * STEP_SEC;
      a.x = a.customX;
      a.y = a.customY;
      a.alt = altFt;
      a.headingDeg = hdgDeg;
      a.trackDeg = (Math.atan2(dotX, dotY) * 180 / Math.PI + 360) % 360;
      a.iasKt = iasKt;
      a.gsKt = Math.hypot(dotX, dotY) / 1.68781;
      a.phase = 'go_around';

      if (steps % TRAIL_EVERY_STEPS === 0) {
        a.trail.push({ x: a.x, y: a.y });
        if (a.trail.length > TRAIL_POINTS) a.trail.shift();
      }
      return;
    }

    const route = routeOf(a);
    const options = routeOptions();
    const before = a.distFt;
    const p = whereIs(a, route);
    if (a.phase !== 'closed_pattern' && a.phase !== 'touch_and_go' && a.phase !== 'downwind') {
      a.phase = p.phase || (route.kind === 'pattern' ? 'initial' : 'route');
    }

    const isDownwind = route.id === 'PAT1' && a.phase === 'downwind';
    let iasKt = a.customKt ?? (isDownwind ? 140 : (p.kt ?? a.fallbackKt));

    if (a.engineFailed) {
      // Airspeed decays toward 110 KIAS best glide
      iasKt = a.customKt = Math.max(110, (a.customKt ?? (p.kt ?? a.fallbackKt)) - 15 * STEP_SEC);
      // Emergency glide descent: ~1,000 fpm = 16.7 ft/sec
      a.customAlt = Math.max(1892, (a.customAlt ?? (p.alt ?? a.fallbackAlt)) - 16.7 * STEP_SEC);
      if (a.customAlt <= 1892) {
        a.active = false;
        a.landed = true;
      }
    } else {
      // 15 Wing Moose Jaw SMM Ch 16 speed gate: Hold 120 KIAS at 2,700 ft MSL until 0.75 NM from threshold
      const isStraightIn = route.id === 'PAT_SI' || a.phase === 'straight_in';
      if (isStraightIn) {
        const thX = 3103.84, thY = -3193.93;
        const curX = a.customX ?? a.x ?? p.x;
        const curY = a.customY ?? a.y ?? p.y;
        const distToTh = Math.hypot(thX - curX, thY - curY);
        const WINDOW_FT = 4558; // 0.75 NM (Window)
        if (distToTh > WINDOW_FT) {
          iasKt = a.customKt = 120;
          a.customAlt = 2700;
        } else {
          const u = Math.max(0, Math.min(1, distToTh / WINDOW_FT));
          iasKt = a.customKt = Math.round(100 + 20 * u);
          a.customAlt = Math.round(1892 + (2700 - 1892) * u);
        }
      }
    }
    a.iasKt = iasKt;

    if (!a.engineFailed && !a.breakout && (a.phase === 'final_turn' || a.phase === 'final')) {
      delete a.customAlt;
      delete a.customHeading;
      delete a.customX;
      delete a.customY;
      delete a.customKt;
    }

    const targetAlt = a.customAlt ?? (p.alt ?? a.fallbackAlt);
    a.alt = targetAlt;

    let tasKt = iasKt;
    let vAir = ktToFtps(iasKt);

    if (windKt > 0) {
      tasKt = iasToTasKt(iasKt, a.alt);
      vAir = ktToFtps(tasKt);
    }

    let gsKt = iasKt;
    let crabDeg = 0;
    let headingDeg = p.headingDeg;

    if (windKt > 0 && iasKt > 0) {
      const wt = windTriangle(p.headingDeg, tasKt, windFromDeg, windKt);
      gsKt = wt.canHoldTrack ? Math.max(wt.groundSpeedKt, 10) : 10;
      crabDeg = wt.crabDeg;
      headingDeg = wt.headingDeg;
    }

    a.gsKt = gsKt;
    a.crabDeg = crabDeg;
    a.headingDeg = headingDeg;
    a.trackDeg = p.headingDeg;

    let targetBankDeg = 0;
    if (a.phase === 'break') {
      targetBankDeg = 60; // 60° bank (2.0 G level turn)
    } else if (a.phase === 'closed_pattern') {
      targetBankDeg = 50; // 45°–60° bank in closed pattern climbing turn
    } else if (a.phase === 'final_turn') {
      targetBankDeg = 35; // Nominal 35° bank in descending final turn
    } else if (a.phase === 'downwind' || a.phase === 'final' || a.phase === 'glide_slope') {
      targetBankDeg = 0; // Wings level on downwind and straight-in approach
    } else if (p.g && p.g > 1) {
      targetBankDeg = bankDegFromG(p.g);
    }
    const maxRollDelta = MAX_ROLL_RATE_DPS * STEP_SEC;
    const bankDelta = Math.max(-maxRollDelta, Math.min(maxRollDelta, targetBankDeg - (a.bankDeg ?? 0)));
    a.bankDeg = (a.bankDeg ?? 0) + bankDelta;

    if (route.id === 'PAT1') {
      // Closed pattern trigger past departure end on touch-and-go
      if (a.phase === 'touch_and_go' && (a.x ?? 0) <= -4000) {
        a.phase = 'closed_pattern';
        a.closedPatternGuidance = true;
      }

      if (a.phase === 'closed_pattern') {
        iasKt = a.customKt = 140;
        // 10°–15° nose-up climb (~2,100 fpm = 35 ft/s) to 3,500 ft MSL
        a.customAlt = Math.min(3500, (a.customAlt ?? a.alt) + 35 * STEP_SEC);
        const gAcc = 32.174;
        const bankRad = (50 * Math.PI) / 180;
        const omega = (gAcc * Math.tan(bankRad)) / Math.max(1, vAir);
        const turnStepDeg = (omega * STEP_SEC * 180) / Math.PI;
        a.closedTurnAccum = (a.closedTurnAccum ?? 0) + turnStepDeg;
        a.customHeading = (((a.customHeading ?? a.headingDeg) - turnStepDeg) % 360 + 360) % 360;
        headingDeg = a.customHeading;

        // Roll out wings-level on downwind heading (118° true) pointing directly toward Perch once the 180° turn is made
        if (a.closedTurnAccum >= 175 || Math.abs(headingDeg - 118) <= 5) {
          a.phase = 'downwind';
          delete a.closedTurnAccum;
          const perch = computeWindPerch(route, windFromDeg, windKt, options);
          if (perch) {
            a.customHeading = (Math.atan2(perch.x - (a.customX ?? a.x), perch.y - (a.customY ?? a.y)) * 180 / Math.PI + 360) % 360;
            headingDeg = a.customHeading;
          }
        }
      } else if (a.phase === 'downwind') {
        iasKt = a.customKt = 140;
        a.customAlt = Math.min(3500, (a.customAlt ?? a.alt) + 35 * STEP_SEC);
        const perch = computeWindPerch(route, windFromDeg, windKt, options);
        if (perch) {
          const curX = a.customX ?? a.x;
          const curY = a.customY ?? a.y;
          const toPerchX = perch.x - curX;
          const toPerchY = perch.y - curY;
          a.customHeading = (Math.atan2(toPerchX, toPerchY) * 180 / Math.PI + 360) % 360;
          headingDeg = a.customHeading;
          const hdgRad = (headingDeg * Math.PI) / 180;
          const distToPerch = Math.hypot(toPerchX, toPerchY);
          const alongTrack = toPerchX * Math.sin(hdgRad) + toPerchY * Math.cos(hdgRad);
          if (distToPerch <= 200 || (alongTrack <= 0 && distToPerch <= 500)) {
            a.phase = 'final_turn';
            a.customKt = 120;
            // Seamlessly synchronize distFt to current position on route to avoid any teleportation jump
            const rLen = routeLengthFt(route, options);
            const lapOffset = rLen > 0 ? Math.floor(a.distFt / rLen) * rLen : 0;
            a.distFt = lapOffset + closestDistFt(route, { x: curX, y: curY }, options);
            delete a.customAlt;
            delete a.customHeading;
            delete a.customX;
            delete a.customY;
            delete a.closedPatternGuidance;
          }
        }
      }
    }


    // Update visual heading immediately so flight physics and readout match
    const effectiveHdg = a.customHeading ?? headingDeg;
    a.headingDeg = effectiveHdg;

    // 3D Cartesian velocity components (ft/s)
    const headingRad = (effectiveHdg * Math.PI) / 180;
    const dotX = vAir * Math.sin(headingRad) + Wx;
    const dotY = vAir * Math.cos(headingRad) + Wy;
    a.dotX = dotX;
    a.dotY = dotY;

    if (a.customHeading !== undefined) {
      a.customX = (a.customX ?? a.x) + dotX * STEP_SEC;
      a.customY = (a.customY ?? a.y) + dotY * STEP_SEC;
    }

    a.distFt += ktToFtps(gsKt) * STEP_SEC;
    const lengthFt = routeLengthFt(route, options);
    if (route.kind === 'pattern') checkDecisions(a, before, a.distFt);
    if (a.active && lengthFt && a.distFt >= lengthFt && !isClosedRoute(route)) handleRouteEnd(a, a.distFt - lengthFt);

    // Continuous 3D Cartesian position update at current progress
    const cur = whereIs(a, routeOf(a));
    a.x = a.customX ?? cur.x;
    a.y = a.customY ?? cur.y;
    a.alt = a.customAlt ?? (cur.alt ?? a.fallbackAlt);

    if (steps % TRAIL_EVERY_STEPS === 0) {
      a.trail.push({ x: a.x, y: a.y });
      if (a.trail.length > TRAIL_POINTS) a.trail.shift();
    }
  }

  function stepOnce() {
    t += STEP_SEC; // added up one step at a time, as V6 does, so the clock is V6's to the last digit
    steps++;
    for (const a of aircraft) {
      if (!a.active || t < a.startsAt) continue;
      fly(a);
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
        const { trail, splitTaken, ...rest } = a;
        const flat = new Float64Array(trail.length * 2);
        trail.forEach((p, i) => { flat[2 * i] = p.x; flat[2 * i + 1] = p.y; });
        return { ...rest, splitTaken: { ...splitTaken }, trail: flat };
      }),
    };
  }

  function putBack(snap) {
    t = snap.t;
    steps = snap.steps;
    nextEvent = events.findIndex((ev) => ev.step >= steps);
    if (nextEvent < 0) nextEvent = events.length;
    dice.setState(snap.dice);
    aircraft = snap.aircraft.map(({ trail, splitTaken, ...rest }) => ({
      ...rest,
      splitTaken: { ...splitTaken },
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
        const curP = whereIs(a);
        a.command = 'breakout';
        a.breakoutPhase = 'vector_outbound';
        a.customAlt = a.alt ?? (curP.alt ?? 2500);
        a.customKt = Math.max(a.iasKt ?? 140, 140);
        a.customX = a.x ?? curP.x;
        a.customY = a.y ?? curP.y;
        a.customHeading = a.headingDeg ?? curP.headingDeg ?? 118;
        a.phase = 'breakout';
      } else if (action === 'climb_high_key' || action === 'climb_low_key') {
        const curP = whereIs(a);
        a.command = action;
        a.pflPhase = action === 'climb_high_key' ? 'climb_hk' : 'climb_lk';
        a.landed = false;
        a.active = true;
        a.customAlt = a.alt ?? (curP.alt ?? 2500);
        a.customKt = Math.max(a.iasKt ?? 140, 140);
        a.customX = a.x ?? curP.x;
        a.customY = a.y ?? curP.y;
        a.customHeading = a.headingDeg ?? curP.headingDeg ?? 118;
        a.phase = 'pfl';
      } else if (action === 'pfl_current' || action === 'engine_fail') {
        const curP = whereIs(a);
        a.engineFailed = true;
        a.command = 'pfl_current';
        a.landed = false;
        a.active = true;
        a.customAlt = a.alt ?? (curP.alt ?? 2500);
        a.customKt = a.iasKt ?? (curP.kt ?? 140);
        a.customX = a.x ?? curP.x;
        a.customY = a.y ?? curP.y;
        a.customHeading = a.headingDeg ?? curP.headingDeg ?? 118;
        a.pflPhase = a.customKt > 130 ? 'zoom_climb' : 'glide_intercept';
        a.phase = 'pfl';
      } else if (action === 'go_around') {
        a.command = 'go_around';
        a.gaPhase = 'climb_2500';
        a.landed = false;
        a.active = true;
        a.engineFailed = false;
        const curP = whereIs(a);
        a.customX = a.x ?? curP.x;
        a.customY = a.y ?? curP.y;
        a.customAlt = a.alt ?? 1892;
        a.customKt = Math.max(120, a.iasKt ?? 120);
        a.customHeading = 298;
        a.headingDeg = 298;
        a.bankDeg = 0;
        a.phase = 'go_around';
      } else if (action === 'touch_and_go') {
        a.touchAndGo = true;
        a.landed = false;
        a.active = true;
        a.engineFailed = false;
        delete a.customX;
        delete a.customY;
        delete a.customHeading;
        const pat = setup.routes.find((r) => r.id === 'PAT1') ?? setup.routes[0];
        if (pat) {
          a.routeId = pat.id;
          a.distFt = pointDistFt(pat, 0, routeOptions());
          a.customAlt = 1892;
          a.customKt = 100;
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
        const isDownwind = route?.id === 'PAT1' && a.phase === 'downwind';
        const iasKt = a.customKt ?? (isDownwind ? 140 : (p.kt ?? a.fallbackKt));
        const altFt = a.landed ? (p.alt ?? 1892) : (a.customAlt ?? (p.alt ?? a.fallbackAlt));
        const x = a.customX ?? a.x ?? p.x;
        const y = a.customY ?? a.y ?? p.y;
        const headingDeg = a.customHeading ?? (a.headingDeg ?? p.headingDeg);
        return {
          id: a.id, type: a.type, color: a.color, routeId: a.routeId,
          x, y, alt: altFt, kt: iasKt,
          headingDeg,
          bankDeg: a.bankDeg ?? 0,
          phase: a.phase ?? 'initial',
          trackDeg: a.trackDeg ?? a.customHeading ?? p.headingDeg,
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
