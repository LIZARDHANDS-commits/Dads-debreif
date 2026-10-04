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
import { DEFAULT_ROUTE_OPTIONS, isClosedRoute, routeLengthFt, pointDistFt, posOnRoute, closestDistFt, routePath } from './route.js';
import { tickAircraft } from './tick-aircraft.js';
import { startJoin, startSideStep } from './path-follower.js';
import { makePflFromArea } from './nav-plans.js';
import { startPflFlight, resumePflFlight, PFL_ROUTE_OPTIONS } from './pfl.js';
import { buildGoAround, buildExtendedDownwind, CIRCUIT } from './circuit.js';
import { buildHighKeyClimb, HIGH_KEY_PT } from './high-key.js';
import { buildClosedPattern } from './closed-pattern.js';
import { DECONFLICT, freeze, decide, deconflictLabel } from './deconflict.js';
import { buildFlinch, buildClimbAhead, EVADE, spacingExtensionFt, extendLimitFt } from './evade.js';
import { buildBreakout, gateLegOf, ENT1_ROUTE } from './breakout.js';
import { RANDOM, rollFor, pick, oddsFor, buildDownwindStraightIn } from './randomize.js';
import { behaviourOf, behaviourLabel } from './behaviour.js';
import { PATTERN_ALT_FT, RUNWAY_29L_HDG_DEG, FIELD_ELEV_FT, THRESHOLD_DATA_ELEV_FT } from './airfield.js';
import { iasToTasKt } from '../../core/t6-performance.js';
import { windTriangle } from '../../core/wind.js';
import { wrapDeg180, compassDegFromVector } from '../../core/angles.js';
import { legOffsetsFt } from '../../core/geo.js';

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

/** An entry hands over to its pattern where it passes closest to it, if within this, ft (an estimate). */
const JOIN_NEAR_FT = 300;

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

  /** The aircraft's state for a move flown from where it is. */
  const stateOf = (a) => ({ x: a.x, y: a.y, alt: a.alt, kias: a.iasKt ?? a.kt ?? 220, headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG, bankDeg: a.bankDeg ?? 0 });
  const windNow = () => ({ windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 });

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
    a.intent = a.intent ?? (route?.landOdds === 1 ? 'full_stop' : 'touch_and_go');
    a.distFt = pointDistFt(route, Math.min(+a.startIndex || 0, route.points.length - 1), routeOptions());
    a.lastLap = -1;
    a.splitTaken = {};
    a.trail = [];
    a.command = null;
    a.engineFailed = false;
    a.mode = 'RAIL';
    delete a.touchAndGo;

    // Continuous 3D Cartesian vector state initialization (Slice A & B)
    const p = posOnRoute(route, a.distFt, routeOptions());
    a.x = p.x;
    a.y = p.y;
    a.alt = p.alt ?? a.fallbackAlt;
    a.iasKt = p.kt ?? a.fallbackKt;
    a.headingDeg = p.headingDeg;
    a.bankDeg = 0;
    const startWp = route.points?.[a.startIndex];
    const isClosedPatternStart = route.id === 'PAT1' && (startWp?.tag === 'departure_end' || a.startIndex === 1 || /closed\s*pattern/i.test(startWp?.label || ''));
    if (isClosedPatternStart) {
      a.alt = 2400;
      a.iasKt = 140;
      a.headingDeg = RUNWAY_29L_HDG_DEG;
      a.x = route.points[a.startIndex]?.x ?? -4066.03;
      a.y = route.points[a.startIndex]?.y ?? 680.56;
      a.closedPatternBankDeg = a.closedPatternBankDeg ?? setup.settings?.closedPatternBankDeg ?? 50;
      startClosedPattern(a);
    } else {
      const isBrkPoint = route.id === 'PAT1' && (startWp?.tag === 'break' || a.startIndex === 9 || p.seg === 9 || a.startIndex === 2 || p.seg === 2 || /break/i.test(startWp?.label || ''));
      a.phase = p.phase || (isBrkPoint ? 'break' : 'initial');
    }
    a.trackDeg = a.headingDeg;
    a.crabDeg = 0;
    a.gsKt = a.iasKt;
    a.tag = startWp?.tag ?? p.tag ?? route.points?.[p.seg]?.tag;
    // An aircraft that starts in the training area with its engine failed: at its radial, distance and height,
    // 125 KIAS heading for the field, then the PFL (Traffic spec 4.5 and 5.2).
    if (a.area) {
      const { spawn: from } = makePflFromArea(a.area.radialDeg, a.area.distNm, a.area.altFt);
      Object.assign(a, { x: from.x, y: from.y, alt: from.alt, iasKt: from.iasKt, headingDeg: from.headingDeg, trackDeg: from.headingDeg, gsKt: from.iasKt, bankDeg: 0 });
      startPflFlight(a, windNow(), { settings: setup.settings });
      a.command = 'pfl_current';
    }
    return a;
  }

  /**
   * A new aircraft (V6 `makeAircraft`, line 234), started but not yet flown. Like V6's it notes,
   * once, the height of its start point (2,500 ft if that has none), for a route with no legs.
   */
  function makeAircraft({ id, type, routeId, startIndex, startsAt, intent, area = null }) {
    return toStart({ id, type, color: TYPE_COLORS[type] || '#fff', fallbackKt: TYPE_FALLBACK_KT[type] ?? 120, fallbackAlt: (routeById(routeId) || setup.routes[0])?.points[startIndex]?.alt || 2500, startRouteId: routeId, startIndex, startsAt, intent, ...(area ? { area: { ...area } } : {}) });
  }

  /** An aircraft from a `setup.aircraft` entry. */
  const aircraftFromSpec = (spec) => makeAircraft({ id: spec.id, type: spec.type, routeId: spec.routeId, startIndex: spec.startIndex, startsAt: spec.startsAtSec, intent: spec.intent, area: spec.area });

  /** What an aircraft is before it flies: enough to make it again with `toStart`. */
  const baseOf = (a) => ({ id: a.id, type: a.type, color: a.color, fallbackKt: a.fallbackKt, fallbackAlt: a.fallbackAlt, startRouteId: a.startRouteId, startIndex: a.startIndex, startsAt: a.startsAt, intent: a.intent, ...(a.area ? { area: { ...a.area } } : {}) });
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

  /** The circuit's runway as the pattern draws it: threshold, upwind end and length. */
  function circuitRunway() {
    const pat = setup.routes.find((r) => r.id === 'PAT1');
    const th = pat?.points?.[0], up = pat?.points?.[1];
    if (!th || !up) return null;
    return { th, up, len: Math.hypot(up.x - th.x, up.y - th.y) };
  }

  /**
   * True while an aircraft is lined up with the runway (on final or over it, heading along it, within
   * 2,000 ft of the centreline and 3 NM of the threshold) and short of the upwind end.
   */
  function beforeUpwindEnd(a) {
    const rwy = circuitRunway();
    if (!rwy) return false;
    const ux = (rwy.up.x - rwy.th.x) / rwy.len, uy = (rwy.up.y - rwy.th.y) / rwy.len;
    const dx = (a.x ?? 0) - rwy.th.x, dy = (a.y ?? 0) - rwy.th.y;
    const along = dx * ux + dy * uy, across = Math.abs(dx * uy - dy * ux);
    const rwyTrack = (Math.atan2(ux, uy) * 180 / Math.PI + 360) % 360;
    const off = Math.abs((((a.trackDeg ?? a.headingDeg ?? rwyTrack) - rwyTrack) % 360 + 540) % 360 - 180);
    return across < 2000 && off < 60 && along > -3 * 6076 && along < rwy.len;
  }

  /**
   * The inner downwind of Pattern 1 as built today: where the break rolls out and the perch, from the
   * built circuit (they move with the wind), or the route's own Break exit and Perch points.
   */
  function innerDownwind(pat) {
    const built = routePath(pat, routeOptions()).points;
    const rollout = built.find((p) => p.tag === 'break_rollout') ?? pat.points[10];
    const perch = built.find((p) => p.tag === 'perch') ?? pat.points[11];
    return rollout && perch ? { rollout, perch } : null;
  }

  /**
   * The closed pattern from where the aircraft is (Traffic spec 1a item 19, TR-R33; closed-pattern.js flies
   * it): one climbing left turn onto the inner downwind, followed by the path follower like the go-around;
   * at its end Pattern 1 carries on from the downwind (goAroundEnded).
   */
  function startClosedPattern(a) {
    a.pendingClosed = false;
    const pat = routeById('PAT1') ?? setup.routes.find((r) => r.kind === 'pattern');
    const downwind = pat && innerDownwind(pat);
    if (!downwind) return;
    const bankDeg = a.closedPatternBankDeg ?? setup.settings?.closedPatternBankDeg ?? 50;
    const points = buildClosedPattern(stateOf(a), windNow(), downwind, bankDeg);
    a.goAroundFlight = { route: { id: 'CLOSED_FLOWN', kind: 'flown', name: 'Closed pattern', points } };
    a.distFt = 0;
    a.mode = 'RAIL';
    a.phase = 'closed_pattern';
    a.command = 'closed_pattern';
    a.landed = false;
    a.active = true;
    delete a.joinOffset;
  }

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
      if (a.intent === 'full_stop' || (route.landOdds === 1.0 && a.intent !== 'go_around')) {
        a.active = false;
        a.landed = true;
        a.status = 'landed';
        a.phase = 'full_stop';
        a.alt = 1880;
        a.mode = 'RAIL';
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
          if (Number.isFinite(a.x)) startJoin(a, split, 0, { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 }, routeOptions());
        }
      }
    }
  }

  /**
   * An entry that merges part-way round its pattern hands over on its last leg where it passes closest
   * to the pattern's path, before the pattern rounds the corner at the merge point. Waiting for the
   * entry's last point would put the aircraft into the pattern mid-turn, well off its track (Patrick,
   * 4 Oct 09:21Z: the vector lines up with the track at the hand-over); startJoin then carries the
   * aircraft's own track and speed smoothly onto the pattern's. Returns true when it handed over.
   */
  function joinWhenAligned(a, route, opt) {
    if (route.kind !== 'entry' || !(+route.mergeIndex > 0) || route.points.length < 2) return false;
    const target = routeById(route.attachTo);
    if (!target || target.kind !== 'pattern') return false;
    if (a.distFt < pointDistFt(route, route.points.length - 2, opt)) { delete a._mergeGapFt; return false; }
    const here = { x: a.x ?? whereIs(a, route).x, y: a.y ?? whereIs(a, route).y };
    const d = closestDistFt(target, here, opt);
    const p = posOnRoute(target, d, opt);
    const gapFt = Math.hypot(here.x - p.x, here.y - p.y);
    const lastGapFt = a._mergeGapFt;
    a._mergeGapFt = gapFt;
    if (gapFt > JOIN_NEAR_FT || !(gapFt > lastGapFt)) return false; // still closing, or not near yet
    delete a._mergeGapFt;
    a.routeId = target.id;
    startJoin(a, target, d, { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 }, opt);
    a.phase = p.phase || 'initial';
    return true;
  }

  /**
   * A go-around from where the aircraft is (Traffic spec 4.10; Patrick, 4 Oct 09:14Z and 09:18Z):
   * flown once from its own place, height, speed, heading and bank (circuit.js buildGoAround), so
   * it starts without a step, then followed by the path follower.
   */
  function startGoAround(a, sideFt = 0, levelAltFt = null, holdKias = null) {
    const pat = routeById('PAT1') ?? setup.routes.find((r) => r.kind === 'pattern');
    if (!pat) return;
    const points = buildGoAround(pat.points, {
      x: a.x, y: a.y, alt: a.alt, kias: a.iasKt ?? a.kt ?? 110, headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG, bankDeg: a.bankDeg ?? 0,
    }, setup.windFromDeg ?? 360, setup.windKt ?? 0, sideFt, levelAltFt, holdKias);
    a.goAroundFlight = { route: { id: 'GO_AROUND_FLOWN', kind: 'flown', name: 'Go-around', points } };
    a.distFt = 0;
    a.mode = 'RAIL';
    a.phase = 'go_around';
    a.command = 'go_around';
    a.landed = false;
    a.active = true;
    a.engineFailed = false;
    delete a.joinOffset;
  }

  /** A straight-in: an entry or split that ends on the runway rather than merging into the pattern. */
  const isStraightIn = (r) => Boolean(r) && (r.kind === 'entry' || r.kind === 'split') && !(+r.mergeIndex > 0) && r.points?.length >= 2;

  /**
   * The breakout from where the aircraft is (TR-R34; breakout.js flies it once, then the path follower):
   * the button and the deconfliction. A straight-in rejoins as a straight-in, anyone else on the overhead
   * entry's line into the Entry Gate (Patrick's card, Q7); at the end it joins that route (goAroundEnded).
   */
  function startBreakout(a) {
    const from = routeOf(a);
    // With no ENT1 in the setup it flies ENT1's line all the same and then joins Pattern 1 where it is nearest.
    const joinTo = isStraightIn(from) ? from : routeById('ENT1');
    const rejoin = joinTo ?? ENT1_ROUTE;
    const leg = rejoin === from ? 0 : gateLegOf(rejoin);
    const bankDeg = a.closedPatternBankDeg ?? setup.settings?.closedPatternBankDeg ?? 50;
    startFlown(a, buildBreakout(stateOf(a), windNow(), rejoin, leg, bankDeg), 'BREAKOUT_FLOWN', 'Breakout', joinTo ? 'join' : null, joinTo?.id ?? null);
    delete a.rejoinRouteId;
    a.phase = 'breakout';
    a.intent = 'overhead';
  }


  /**
   * A short move flown from where the aircraft is (evade.js), followed by the path follower like the go-around.
   * `then` says what follows at its end: 'breakout', or 'join' onto the route `joinId`.
   */
  function startFlown(a, points, id, name, then, joinId = null) {
    a.goAroundFlight = { route: { id, kind: 'flown', name, points }, then, joinId };
    a.distFt = 0;
    a.mode = 'RAIL';
    a.phase = points[0]?.phase ?? 'breakout';
    a.command = 'breakout';
    a.landed = false;
    a.active = true;
    delete a.joinOffset;
  }

  /**
   * The deconfliction's last-moment moves, worked out from where the other aircraft is now: the flinch (up
   * if this one is above, or level with it and first by callsign; else a bank away from it) and a PFL's bank
   * away (Patrick's card, Q3; design section 2.5). Head-on, both go right.
   */
  function awayFrom(a, other) {
    const rel = wrapDeg180(compassDegFromVector(other.x - a.x, other.y - a.y) - (a.trackDeg ?? a.headingDeg ?? 0));
    return Math.abs(rel) < 3 || Math.abs(rel) > 177 ? 1 : rel > 0 ? -1 : 1;
  }
  function startFlinch(a, other) {
    const dz = a.alt - other.alt;
    const mode = dz > 0 || (dz === 0 && a.id < other.id) ? 'climb' : 'bank';
    startFlown(a, buildFlinch(stateOf(a), windNow(), { mode, side: awayFrom(a, other) }), 'FLINCH_FLOWN', 'Flinch', 'breakout');
  }
  function startBankAway(a, other) {
    const dirDeg = (a.trackDeg ?? a.headingDeg ?? 0) + 90 * awayFrom(a, other);
    startSideStep(a, dirDeg, EVADE.flinchFt, EVADE.bankAwayOutSec, EVADE.bankAwayBackSec);
  }

  /**
   * Where an aircraft will be along the centreline, ft from the threshold, `sec` from now: walked along the path
   * it is following at its route's speeds in today's wind (the wind triangle's ground speed on each leg), then
   * straight on toward the threshold at its last speed once the path ends; straight on at its ground speed with no
   * path. Sampled each second over the next five minutes. For spacing on final.
   */
  function leaderTrack(a, alongOf) {
    const path = pathOf(a);
    const wind = windNow();
    const samples = [alongOf(a)];
    let d = a.distFt ?? 0, gs = ktToFtps(a.gsKt ?? a.iasKt ?? 120), here = alongOf(a);
    const endFt = path ? routeLengthFt(path.route, path.options) : 0;
    for (let i = 1; i <= 300; i++) {
      if (path && d < endFt) {
        const p = posOnRoute(path.route, d, path.options);
        const wt = windTriangle(p.headingDeg ?? 0, iasToTasKt(p.kt ?? a.iasKt ?? 120, p.alt ?? a.alt), wind.windFromDeg, wind.windKt);
        gs = ktToFtps(Math.max(40, wt.groundSpeedKt));
        d += gs;
        here = alongOf(posOnRoute(path.route, Math.min(d, endFt), path.options));
      } else here -= gs;
      samples.push(here);
    }
    return (sec) => {
      const k = Math.max(0, Math.min(299, Math.floor(sec)));
      return samples[k] + (samples[k + 1] - samples[k]) * Math.max(0, Math.min(1, sec - k));
    };
  }

  /**
   * Spacing on final (TR-R18, TR-58; Patrick, 4 Oct 21:50Z and 21:52Z): an aircraft on Pattern 1's inner downwind
   * that would roll out on final less than EVADE.finalSpacingFt from traffic on final extends its downwind to turn
   * in behind it, and breaks out only if the extension would reach the overhead pattern's base and 45° leg.
   * Traffic on final is anyone lined up with the runway and heading for it, within reach of the longest extension.
   */
  function spacingTick() {
    const pat = routeById('PAT1');
    const rwy = circuitRunway();
    if (!pat || !rwy || !pat.points[12]) return;
    const opt = routeOptions();
    const perch = routePath(pat, opt).points.find((p) => p.tag === 'perch');
    if (!perch) return;
    const th = rwy.th, ux = (rwy.up.x - th.x) / rwy.len, uy = (rwy.up.y - th.y) / rwy.len;
    const rwyTrack = compassDegFromVector(ux, uy);
    const windowFt = Math.hypot(pat.points[12].x - th.x, pat.points[12].y - th.y);
    const limitFt = extendLimitFt(pat.points, perch);
    const reachFt = windowFt + EVADE.finalSpacingFt + (Number.isFinite(limitFt) ? Math.max(0, limitFt) : 3 * 6076);
    const wind = windNow();
    const live = aircraft.filter((a) => a.active && !a.landed && t >= a.startsAt && Number.isFinite(a.x) && Number.isFinite(a.y));
    const alongOf = (p) => -((p.x - th.x) * ux + (p.y - th.y) * uy);
    const leaders = [];
    for (const a of live) {
      const across = Math.abs((a.x - th.x) * uy - (a.y - th.y) * ux), along = -alongOf(a);
      const off = Math.abs(wrapDeg180((a.trackDeg ?? a.headingDeg ?? rwyTrack) - rwyTrack));
      // Lined up and landing: within 2,000 ft of the centreline and 30° of the runway track, short of the threshold,
      // and no more than 500 ft above the glide path (estimates), so the overhead's initial above doesn't count.
      const glideFt = THRESHOLD_DATA_ELEV_FT + (pat.points[12].alt - THRESHOLD_DATA_ELEV_FT) / windowFt * -along;
      const linedUp = across < 2000 && off < 30 && along < 0 && -along <= reachFt && a.alt <= glideFt + 500;
      const extending = a.goAroundFlight?.route.id === 'EXTEND_FLOWN';
      const turningFinal = a.routeId === pat.id && a.mode === 'RAIL' && a.phase === 'final_turn' && !a.goAroundFlight;
      if (!linedUp && !extending && !turningFinal) continue;
      leaders.push({ a, distAt: leaderTrack(a, alongOf) });
    }
    if (!leaders.length) return;
    for (const f of live) {
      if (f.routeId !== pat.id || f.phase !== 'downwind' || f.mode !== 'RAIL' || f.deconflict) continue;
      if (f.goAroundFlight || f.pflFlight || f.pflRail || f.highKeyFlight || f.sideStep) continue;
      const ahead = leaders.filter((l) => l.a !== f);
      if (!ahead.length) continue;
      // Flown once without extending, all the way to the threshold: when and where it would roll out, and how fast
      // it then comes down final (the circuit's own final, which it joins).
      const plain = buildExtendedDownwind(pat.points, stateOf(f), wind.windFromDeg, wind.windKt, perch, 0, windowFt);
      if (plain.rolloutSec == null) continue;
      const rolloutFt = alongOf(plain.rollout);
      const finalGsFtps = rolloutFt / Math.max(1, plain.endSec - plain.rolloutSec);
      const ask = { rolloutSec: plain.rolloutSec, rolloutFt, downwindGsFtps: ktToFtps(f.gsKt ?? f.iasKt ?? 120), finalGsFtps, leaders: ahead };
      let extendFt = spacingExtensionFt({ ...ask, limitFt: Math.max(0, limitFt) });
      if (extendFt === 0) continue;
      // The one it spaces on: the first that alone would keep it from turning in now.
      const leader = ahead.find((l) => spacingExtensionFt({ ...ask, leaders: [l], limitFt: 0 }) === null) ?? ahead[0];
      let flight = extendFt === null ? null : buildExtendedDownwind(pat.points, stateOf(f), wind.windFromDeg, wind.windKt, perch, extendFt);
      // The final turn rolls out a little short of a full extension: make up the shortfall once.
      const shortFt = flight ? rolloutFt + extendFt - alongOf(flight.rollout) : 0;
      if (shortFt > 50) {
        extendFt = Math.ceil((extendFt + shortFt) / 100) * 100;
        flight = extendFt <= limitFt ? buildExtendedDownwind(pat.points, stateOf(f), wind.windFromDeg, wind.windKt, perch, extendFt) : null;
      }
      if (!flight) {
        startBreakout(f);
        f.deconflict = { move: 'breakout', layer: 'rules', rule: 'spacing on final: no room to extend', with: leader.a.id, label: deconflictLabel('breakout', 'rules') };
        continue;
      }
      f.goAroundFlight = { route: { id: 'EXTEND_FLOWN', kind: 'flown', name: 'Extended downwind', points: flight.track }, then: 'final' };
      f.distFt = 0;
      f.mode = 'RAIL';
      f.phase = 'downwind';
      delete f.joinOffset;
      f.deconflict = { move: 'extend_downwind', layer: 'rules', rule: 'spacing on final', with: leader.a.id, extendFt, label: deconflictLabel('extend_downwind', 'rules') };
    }
  }

  /**
   * Randomize behaviour (Traffic spec 4.13; Patrick, 4 Oct 21:52Z to 21:55Z): every 0.5 s, an aircraft at one of the
   * three points rolls once (randomize.js): on the upwind from the departure end to 3/4 mile past it, abeam the
   * departure end on the outer downwind, and about a mile out on final. Each roll is seeded by the run's seed, the
   * callsign and its count, and the flags are plain fields on the aircraft, so a rewind replays the same choices.
   */
  function randomizeTick() {
    const pat = routeById('PAT1');
    const rwy = circuitRunway();
    if (!pat || !rwy) return;
    const th = rwy.th, ux = (rwy.up.x - th.x) / rwy.len, uy = (rwy.up.y - th.y) / rwy.len;
    const rwyTrack = compassDegFromVector(ux, uy);
    const odds = oddsFor(setup.randomizeSharePct);
    const roll = (a, odds) => pick(odds, rollFor(seed, a.id, a.rndCount = (a.rndCount ?? 0) + 1));
    for (const a of aircraft) {
      if (!a.active || a.landed || t < a.startsAt || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
      if (a.pflFlight || a.pflRail || a.highKeyFlight || a.engineFailed || a.deconflict) continue;
      const along = (a.x - th.x) * ux + (a.y - th.y) * uy, across = Math.abs((a.x - th.x) * uy - (a.y - th.y) * ux);
      const off = Math.abs(wrapDeg180((a.trackDeg ?? a.headingDeg ?? rwyTrack) - rwyTrack));
      const route = routeOf(a);
      // A low approach chosen on final goes around low over the runway end.
      if (a.rndLowApproach && !a.goAroundFlight) {
        if (along > -RANDOM.lowApproachFt && off < 30) { a.rndLowApproach = false; startGoAround(a); }
        continue;
      }
      if (a.goAroundFlight) continue;
      // On final, about a mile out: touch-and-go, full stop or low approach.
      const onFinal = (route?.id === pat.id && a.phase === 'final') || (isStraightIn(route) && off < 30 && across < 2000);
      if (onFinal && !a.rndFinal && along < 0 && -along <= RANDOM.finalRollFt) {
        Object.assign(a, { rndFinal: true, rndUpwind: false, rndDownwind: false });
        const choice = roll(a, odds.final);
        if (choice === 'low_approach') { a.rndLowApproach = true; a.intent = 'touch_and_go'; }
        else a.intent = choice;
        continue;
      }
      if (route?.id !== pat.id || a.mode !== 'RAIL') continue;
      // On the upwind after take-off, from the departure end to 3/4 mile past it (before the crosswind turn).
      if (!a.rndUpwind && off < 30 && across < 2000 && along >= rwy.len && along <= rwy.len + RANDOM.upwindWindowFt) {
        Object.assign(a, { rndUpwind: true, rndFinal: false });
        const choice = roll(a, odds.upwind);
        if (choice === 'closed_pattern') startClosedPattern(a);
        else if (choice === 'closed_high_key') startHighKeyClimb(a);
        continue;
      }
      // Abeam the departure end on the outer downwind.
      if (!a.rndDownwind && a.phase === 'outer_downwind' && pat.points[5] && pat.points[6]) {
        const o = legOffsetsFt(pat.points[5], pat.points[6], a);
        if (o.alongFt < 0 || o.alongFt > 3000) continue;
        Object.assign(a, { rndDownwind: true, rndFinal: false });
        const choice = roll(a, odds.downwind);
        const ent2 = routeById('ENT2');
        if (choice === 'straight_in' && ent2) {
          startFlown(a, buildDownwindStraightIn(pat.points, stateOf(a), windNow(), ent2), 'STRAIGHT_IN_FLOWN', 'Straight-in', 'join', ent2.id);
          a.phase = 'straight_in';
        } else if (choice === 'high_key') startHighKeyClimb(a);
      }
    }
  }

  /** The path an aircraft is following now, for the deconfliction's prediction, or null when it flies free. */
  function pathOf(a) {
    const flown = a.goAroundFlight ?? a.highKeyFlight ?? a.pflFlight;
    if (flown) return { route: flown.route, options: PFL_ROUTE_OPTIONS };
    if (a.mode !== 'RAIL') return null;
    const route = routeOf(a);
    return route ? { route, options: routeOptions() } : null;
  }

  /**
   * Automatic deconfliction (deconflict.js; Patrick, 4 Oct 09:40Z to 11:26Z): every 0.5 s, decided from all the
   * aircraft as they were before anyone moves this step, then each move started the way its button starts it.
   * A finished move clears its tag. Off unless the setup turns it on (setup.deconflict).
   */
  function deconflictTick() {
    const BREAKING_OUT = new Set(['breakout', 'flinch', 'climb_breakout']);
    for (const a of aircraft) {
      const d = a.deconflict;
      if (!d) continue;
      const flying = BREAKING_OUT.has(d.move) ? a.command === 'breakout' || Boolean(a.goAroundFlight)
        : d.move === 'bank_away' ? Boolean(a.sideStep) : Boolean(a.goAroundFlight);
      if (!a.active || a.landed || !flying) delete a.deconflict;
    }
    spacingTick();
    const limits = setup.conflictLimits ?? DEFAULT_CONFLICT_LIMITS;
    const frozen = freeze(aircraft.filter((a) => t >= a.startsAt), pathOf, routeOf);
    for (const d of decide(frozen, limits)) {
      const a = aircraft.find((ac) => ac.id === d.id);
      if (!a) continue;
      const other = aircraft.find((ac) => ac.id === d.with) ?? a;
      if (a.goAroundFlight && d.move === 'breakout') { delete a.goAroundFlight; delete a.joinOffset; }
      if (d.move === 'breakout') startBreakout(a);
      else if (d.move === 'flinch') startFlinch(a, other);
      else if (d.move === 'climb_breakout') startFlown(a, buildClimbAhead(stateOf(a), windNow(), PATTERN_ALT_FT + EVADE.climbAboveFt), 'CLIMB_FLOWN', 'Climb ahead', 'breakout');
      else if (d.move === 'move_over') startGoAround(a, EVADE.moveOverFt, EVADE.moveOverLevelAltFt, EVADE.moveOverKias);
      else if (d.move === 'bank_away') startBankAway(a, other);
      else startGoAround(a); // a go-around, or a fly-through: the same flown path from where it is at pattern height
      a.deconflict = { move: d.move, layer: d.layer, rule: d.rule, with: d.with, label: deconflictLabel(d.move, d.layer) };
    }
  }

  /**
   * The climb to High Key from where the aircraft is (the High Key button, and Randomize's closed pattern to High Key
   * and PFL): already at High Key, the practice PFL starts at once (TR-R31).
   */
  function startHighKeyClimb(a) {
    const env = { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 };
    const distToHk = Math.hypot(HIGH_KEY_PT.x - (a.x ?? 0), HIGH_KEY_PT.y - (a.y ?? 0));
    const alt = a.alt ?? 3500;
    if (distToHk <= 1500 && alt >= 4750) {
      // Already at High Key: power off now and glide the PFL, as practice (TR-R31).
      startPflFlight(a, env, { practice: true, settings: setup.settings });
      a.command = 'climb_high_key';
      a.routeId = 'PFL_HIGH_KEY';
      return;
    }
    // The climb to High Key, flown once from where the aircraft is (Traffic spec 1a item 23): a full-power
    // climbing turn onto the 760 ft run-in, followed by the path follower; at High Key the PFL takes over (tick-aircraft.js).
    const bankDeg = a.closedPatternBankDeg ?? setup.settings?.closedPatternBankDeg ?? 50;
    const flown = buildHighKeyClimb({
      x: a.x, y: a.y, alt: alt, kias: a.iasKt ?? a.kt ?? 140, headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG, bankDeg: a.bankDeg ?? 0,
    }, env, bankDeg);
    a.highKeyFlight = { route: { id: 'HIGH_KEY_FLOWN', kind: 'flown', name: 'Climb to High Key', points: flown.points }, settings: setup.settings };
    a.engineFailed = false;
    a.distFt = 0;
    a.mode = 'RAIL';
    a.routeId = 'PFL_HIGH_KEY';
    a.command = 'climb_high_key';
    a.landed = false;
    a.active = true;
    a.phase = 'climb_high_key';
    a.config = 'Clean';
    delete a.pflRail;
    delete a.pflRailIndex;
    delete a.pflFlight;
    delete a.goAroundFlight;
    delete a.joinOffset;
  }

  /** The end of a flown go-around: settled on the outer downwind, it joins Pattern 1 there. */
  function goAroundEnded(a) {
    delete a.goAroundDone;
    const then = a.goAroundFlight?.then, joinId = a.goAroundFlight?.joinId;
    delete a.goAroundFlight;
    // The deconfliction's short moves: the breakout follows, or the straight-in is joined again.
    if (then === 'breakout') { startBreakout(a); return; }
    if (then === 'final') {
      // An extended downwind ends on Pattern 1's own straight final, inside the window: join it there, never on
      // the initial above it (same centreline).
      const pat = routeById('PAT1');
      if (!pat) { a.active = false; return; }
      const opt = routeOptions();
      const th = pat.points[0], win = pat.points[12];
      const toGo = Math.hypot(a.x - th.x, a.y - th.y);
      a.routeId = pat.id;
      startJoin(a, pat, pointDistFt(pat, 12, opt) + Math.max(0, Math.hypot(win.x - th.x, win.y - th.y) - toGo), windNow(), opt);
      a.phase = 'final';
      a.mode = 'RAIL';
      return;
    }
    if (then === 'join') {
      const route = routeById(joinId);
      delete a.rejoinRouteId;
      a.command = null;
      a.mode = 'RAIL';
      if (!route) { a.active = false; return; }
      const opt = routeOptions();
      a.routeId = route.id;
      startJoin(a, route, closestDistFt(route, a, opt), windNow(), opt);
      a.phase = posOnRoute(route, a.distFt, opt).phase || 'route';
      return;
    }
    const pat = routeById('PAT1') ?? setup.routes.find((r) => r.kind === 'pattern');
    if (!pat) { a.active = false; return; }
    const opt = routeOptions();
    a.routeId = pat.id;
    startJoin(a, pat, closestDistFt(pat, a, opt), { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 }, opt);
    a.phase = posOnRoute(pat, a.distFt, opt).phase || 'downwind';
    a.mode = 'RAIL';
    if (a.command === 'go_around' || a.command === 'closed_pattern' || a.command === 'breakout') a.command = null;
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
      const curPos = { x: a.x ?? whereIs(a, route).x, y: a.y ?? whereIs(a, route).y };
      a.routeId = target.id;
      // The pattern's path passes close to, not exactly through, the entry's end: join it smoothly (spec item 13a).
      startJoin(a, target, closestDistFt(target, curPos, routeOptions()) + Math.max(0, overshootFt), { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 }, routeOptions());
      const nextP = whereIs(a, target);
      a.phase = nextP.phase || (target.kind === 'pattern' ? 'initial' : 'route');
      // TR-08: a straight-in joining at the threshold (first point) evaluates landing intent
      if (mergeIndex === 0) {
        if (a.intent === 'full_stop' || (target.landOdds === 1.0 && a.intent !== 'go_around')) {
          a.active = false;
          a.landed = true;
          a.status = 'landed';
          a.phase = 'full_stop';
        } else {
          a.phase = 'touch_and_go';
        }
      }
      return;
    }
    a.active = false;
  }


  /**
   * A touch-and-go from where the aircraft is on the runway (Traffic spec 1a item 21): it rolls on and flies
   * the circuit's climb-out, joined smoothly, with no jump back to the threshold.
   */
  function goFromRunway(a) {
    const pat = routeById('PAT1') ?? setup.routes.find((r) => r.kind === 'pattern') ?? setup.routes[0];
    const opt = routeOptions();
    a.routeId = pat.id;
    // On the circuit's first leg (threshold to departure end), not the initial above the same runway.
    const p0 = pat.points[0], p1 = pat.points[1] ?? p0;
    const d0 = pointDistFt(pat, 0, opt), d1 = pointDistFt(pat, 1, opt);
    const legFt = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    const along = ((a.x - p0.x) * (p1.x - p0.x) + (a.y - p0.y) * (p1.y - p0.y)) / legFt;
    // The circuit's climb-out passes close to, not exactly through, the touchdown point: join it smoothly.
    startJoin(a, pat, d0 + Math.max(0, Math.min(along, d1 - d0)), { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 }, opt);
    a.mode = 'RAIL';
    a.phase = 'touch_and_go';
    a.command = null;
    a.touchAndGo = true;
  }

  /**
   * The end of a PFL (Traffic spec 4.5 items 10-13): on the runway it flies a
   * touch-and-go with power back on and carries on in the circuit (Patrick 08:40Z);
   * a practice that missed the gate goes around; one that can't make the runway ejects.
   */
  function pflEnded(a) {
    const done = a.pflDone;
    delete a.pflDone;
    delete a.pflFlight;
    a.pflEndedThisStep = true;
    a.engineFailed = false;
    if (done === 'landed') {
      goFromRunway(a);
      a.pflDecision = null;
      a.config = undefined;
      a.tag = undefined;
    } else if (done === 'go_around') {
      a.pflDecision = null;
      startGoAround(a);
    } else {
      a.active = false;
      a.landed = false;
      a.status = 'ejected';
      a.command = null;
      a.ejectAt = { x: a.x, y: a.y, alt: a.alt };
      a.pflDecision = 'Eject';
    }
  }

  function stepOnce() {
    t += STEP_SEC; // added up one step at a time, as V6 does, so the clock is V6's to the last digit
    steps++;
    const opt = routeOptions();
    const wind = { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 };
    if (setup.randomize && steps % DECONFLICT.decideEverySteps === 0) randomizeTick();
    if (setup.deconflict && steps % DECONFLICT.decideEverySteps === 0) deconflictTick();
    for (const a of aircraft) {
      if (!a.active || t < a.startsAt) continue;
      const route = routeOf(a);
      const beforeDist = a.distFt;
      const sideStepping = Boolean(a.sideStep);
      tickAircraft(a, STEP_SEC, wind, route, opt);
      // A PFL's bank away has ended, its height charged: re-plan the glide from where it really is (TR-55).
      if (sideStepping && !a.sideStep && a.pflFlight && !a.pflDone) resumePflFlight(a, wind, setup.settings);
      if (a.pflDone) pflEnded(a);
      if (a.goAroundDone) goAroundEnded(a);
      if (a.mode === 'RAIL' && route && !a.pflRail && !a.pflFlight && !a.goAroundFlight && !a.highKeyFlight && !a.pflEndedThisStep) {
        const len = routeLengthFt(route, opt);
        if (route.kind === 'pattern' && a.distFt >= beforeDist) {
          checkDecisions(a, beforeDist, a.distFt);
        }
        if (a.active && len && a.distFt >= len && !isClosedRoute(route)) {
          handleRouteEnd(a, a.distFt - len);
        } else if (a.active) {
          joinWhenAligned(a, route, opt);
        }
      }

      // A closed pattern asked for short of the upwind end pulls up once past it (TR-R33).
      if (a.active && a.pendingClosed && a.mode === 'RAIL' && !beforeUpwindEnd(a)) startClosedPattern(a);

      delete a.pflEndedThisStep;

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
        const { trail, splitTaken, ...rest } = a;
        const flat = new Float64Array(trail.length * 2);
        trail.forEach((p, i) => { flat[2 * i] = p.x; flat[2 * i + 1] = p.y; });
        return {
          ...rest,
          splitTaken: { ...splitTaken },
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
    if (!a.active) {
      if (a.status === 'crashed') return 'crashed';
      if (a.status === 'ejected') return 'ejected';
      return a.landed ? 'landed' : 'done';
    }
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
     * @param {{ type?: string, routeId?: string, startPoint?: number, delaySec?: number, id?: string, intent?: string }} [spec]
     */
    spawn({ type = 'CT-156', routeId, startPoint = 1, delaySec = 0, id, intent } = {}) {
      settle();
      if (!TYPE_COLORS[type]) throw new RangeError(`unknown aircraft type ${type}`);
      const route = routeId === undefined ? setup.routes[0] : routeById(routeId);
      if (!route && !setup.routes.length) throw new RangeError(NO_ROUTES);
      if (!route) throw new RangeError(`unknown route ${routeId}`);
      if (!Number.isInteger(startPoint) || startPoint < 1) throw new RangeError(`the start point counts from 1, not ${startPoint}`);
      if (!Number.isFinite(delaySec)) throw new RangeError(`the delay must be a number of seconds, not ${delaySec}`);
      if (id !== undefined && inUse(id)) throw new RangeError(`callsign ${id} is in use`);
      const rec = baseOf(makeAircraft({ id: id ?? nextCallsign(), type, routeId: route.id, startIndex: startPoint - 1, startsAt: t + delaySec, intent }));
      happen({ kind: 'spawn', rec });
      return rec.id;
    },

    /**
     * A new aircraft already in an engine-out glide at a point in the training area (Phase 2.5):
     * `radialDeg` °T and `distNm` NM from the field, `altFt` MSL, at 125 KIAS heading back toward the field,
     * then the PFL command flies its glide (Traffic spec 4.5). Returns its callsign.
     * @param {{ type?: string, radialDeg?: number, distNm?: number, altFt?: number, id?: string }} [spec]
     */
    spawnPflFromArea({ type = 'CT-156', radialDeg = 180, distNm = 5, altFt = 7500, id } = {}) {
      const { spawn: from } = makePflFromArea(radialDeg, distNm, altFt); // clamps the three inputs to their ranges
      const route = setup.routes.find((r) => r.kind === 'pattern') ?? setup.routes[0];
      const callsign = this.spawn({ type, routeId: route?.id, startPoint: 1, delaySec: 0, id });
      const a = aircraft.find((ac) => ac.id === callsign);
      Object.assign(a, { x: from.x, y: from.y, alt: from.alt, iasKt: from.iasKt, headingDeg: from.headingDeg, bankDeg: 0 });
      this.command(callsign, 'pfl_current');
      return callsign;
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
      return rosterAtEnd().map((rec) => ({ id: rec.id, type: rec.type, routeId: rec.startRouteId, startIndex: rec.startIndex, startsAtSec: rec.startsAt, ...(rec.area ? { area: { ...rec.area } } : {}) }));
    },

    /** Where the dice are in their sequence (a number that changes with every roll). */
    diceState() { return dice.getState(); },

    /** An aircraft's trail: `[{ x, y }]`, a point every 0.5 s for the last 2 minutes, oldest first. */
    trailOf(id) {
      return aircraft.find((a) => a.id === id)?.trail.slice() ?? [];
    },

    /**
     * Issues an in-flight command to an aircraft: 'breakout', 'engine_fail', 'go_around', 'touch_and_go', 'closed_pattern'.
     */
    command(aircraftId, action, options = {}) {
      settle();
      const a = aircraft.find((ac) => ac.id === aircraftId);
      if (!a) return false;
      // A new command stops a flown go-around or closed pattern: back onto Pattern 1 where the aircraft is, then
      // the command. A breakout or a deconfliction move just stops; the command flies from where it is. A
      // touch-and-go in the air only sets the next landing, so the flown path carries on.
      if (action !== 'touch_and_go') {
        if (a.goAroundFlight?.then) delete a.goAroundFlight;
        if (a.goAroundFlight) goAroundEnded(a);
      }
      // A new command stops the flown climb to High Key; the command then flies from where the aircraft is.
      delete a.highKeyFlight;
      if (action === 'breakout') {
        startBreakout(a);
      } else if (action === 'closed_pattern') {
        a.closedPatternBankDeg = options?.bankDeg ?? a.closedPatternBankDeg ?? setup.settings?.closedPatternBankDeg ?? 50;
        // The pull-up starts at or after the upwind end of the runway (TR-R33, WFO art 402): an aircraft
        // on final or on the runway touches and goes, and pulls up once past the upwind end.
        if (a.mode === 'RAIL' && beforeUpwindEnd(a)) {
          a.pendingClosed = true;
          a.intent = 'touch_and_go';
          a.landed = false;
          a.active = true;
        } else {
          startClosedPattern(a);
        }
      } else if (action === 'climb_high_key') {
        startHighKeyClimb(a);
      } else if (action === 'engine_fail' || action === 'pfl_current') {
        // The PFL button: an engine failure where the aircraft is, flown as Traffic spec 4.5 says (pfl.js).
        const env = { windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 };
        startPflFlight(a, env, { settings: setup.settings });
        a.command = action;
      } else if (action === 'go_around') {
        startGoAround(a);
      } else if (action === 'touch_and_go') {
        // Touch-and-go (Traffic spec 1a item 21), with no jump to the threshold: in the air it makes the next
        // landing a touch-and-go; on the runway it rolls on and takes off from where it is.
        a.intent = 'touch_and_go';
        if (a.landed) {
          a.landed = false;
          a.active = true;
          delete a.status;
          a.engineFailed = false;
          goFromRunway(a);
        }
      }
      return true;
    },

    /** Sets the landing intent for an active aircraft: 'touch_and_go', 'full_stop', 'go_around'. */
    setIntent(aircraftId, intent) {
      settle();
      const a = aircraft.find((ac) => ac.id === aircraftId);
      if (!a) return false;
      a.intent = intent;
      return true;
    },

    nextCallsign,

    /** What is where right now. */
    state() {
      const rwy = circuitRunway();
      const win = routeById('PAT1')?.points?.[12];
      const windowFt = rwy && win ? Math.hypot(win.x - rwy.th.x, win.y - rwy.th.y) : NaN;
      // The behaviour tag (behaviour.js, TR-60): where the aircraft stands against the runway, for a straight-in's final.
      const tagOf = (a, route, kt, alt, x, y, leg) => {
        let onFinal = false, toThresholdFt = NaN;
        if (rwy && Number.isFinite(x) && Number.isFinite(y)) {
          const ux = (rwy.up.x - rwy.th.x) / rwy.len, uy = (rwy.up.y - rwy.th.y) / rwy.len;
          const along = (x - rwy.th.x) * ux + (y - rwy.th.y) * uy, across = Math.abs((x - rwy.th.x) * uy - (y - rwy.th.y) * ux);
          const off = Math.abs(wrapDeg180((a.trackDeg ?? a.headingDeg ?? 0) - compassDegFromVector(ux, uy)));
          onFinal = along < 0 && across < 2000 && off < 30;
          toThresholdFt = Math.hypot(x - rwy.th.x, y - rwy.th.y);
        }
        const b = behaviourOf({ ...a, kt, alt, leg }, { route, fieldElevFt: FIELD_ELEV_FT, onFinal, toThresholdFt, windowFt });
        return behaviourLabel(b, a.deconflict?.label ?? null) ?? a.deconflict?.label ?? null;
      };
      const list = aircraft.map((a) => {
        const route = routeOf(a);
        const p = a.pflRail ? a : whereIs(a);
        const iasKt = a.iasKt ?? (p.kt ?? a.fallbackKt);
        const altFt = a.landed ? (a.alt ?? p.alt ?? FIELD_ELEV_FT) : (a.alt ?? (p.alt ?? a.fallbackAlt));
        const x = a.x ?? p.x;
        const y = a.y ?? p.y;
        const headingDeg = a.headingDeg ?? p.headingDeg;
        return {
          id: a.id, type: a.type, color: a.color, routeId: a.routeId,
          mode: a.mode ?? 'RAIL',
          x, y, alt: altFt, kt: iasKt,
          headingDeg,
          bankDeg: a.bankDeg ?? 0,
          pitchDeg: a.pitchDeg ?? null,
          phase: a.phase ?? 'initial',
          tag: a.tag ?? p.tag ?? route?.points?.[p.seg]?.tag,
          trackDeg: a.trackDeg ?? a.headingDeg ?? p.headingDeg,
          crabDeg: a.crabDeg ?? 0,
          groundSpeedKt: a.gsKt ?? iasKt,
          leg: p.seg !== undefined ? p.seg + 1 : 1, distFt: a.distFt,
          status: statusOf(a), startsAt: a.startsAt,
          active: a.active,
          landed: Boolean(a.landed),
          engineFailed: Boolean(a.engineFailed),
          command: a.command ?? null,
          intent: a.intent ?? 'touch_and_go',
          closedPatternBankDeg: a.closedPatternBankDeg,
          config: a.config,
          pflRail: a.pflRail ?? null,
          pflDecision: a.pflDecision ?? null,
          pflFlight: Boolean(a.pflFlight),
          highKeyFlight: Boolean(a.highKeyFlight),
          ejectAt: a.ejectAt ?? null,
          deconflict: a.deconflict?.label ?? null,
          behaviour: t < a.startsAt ? null : tagOf({ ...a, trackDeg: a.trackDeg ?? headingDeg }, route, iasKt, altFt, x, y, p.seg !== undefined ? p.seg + 1 : 1),
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
