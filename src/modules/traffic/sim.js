// The flying for the Traffic Pattern Sim: the roster, the step and its order, the commands,
// rewind, conflicts, the runway, taxi and ejection. Every aircraft rides a path on the path
// follower (path-follower.js): its route's, or one flown once by the simulated pilot
// (circuit.js) for a go-around, a closed pattern, a climb to High Key, a PFL, a breakout or
// an evasion (Traffic spec, "Flying the aircraft"). V6 line numbers in the comments below are
// history: V6 is a source of ideas only.
//
// Pure: it never reads the page, a setting, the clock or Math.random. It takes a setup
// (see the README) and a seed, and every choice comes from the seeded dice, so the same
// seed gives the same run.
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
import { ktToFtps, ftpsToKt, FT_PER_NM } from '../../core/units.js';
import { createDice } from './dice.js';
import { DEFAULT_ROUTE_OPTIONS, isClosedRoute, routeLengthFt, pointDistFt, posOnRoute, closestDistFt, routePath, flownBuildOf } from './route.js';
import { tickAircraft } from './tick-aircraft.js';
import { startJoin, startSideStep, setFlown, flownOf, groupOf, clearPfl } from './path-follower.js';
import { makePflFromArea } from './nav-plans.js';
import { startPflFlight, resumePflFlight, PFL_ROUTE_OPTIONS } from './pfl.js';
import { buildGoAround, buildExtendedDownwind, CIRCUIT } from './circuit.js';
import { buildAstraGoAround, buildAstraExtendedDownwind, ASTRA_POINT } from './astra-circuit.js';
import { buildHighKeyClimb, HIGH_KEY_PT } from './high-key.js';
import { buildClosedPattern } from './closed-pattern.js';
import { DECONFLICT, freeze, decide, deconflictLabel } from './deconflict.js';
import { buildFlinch, buildClimbAhead, EVADE, spacingExtensionFt, extendLimitFt } from './evade.js';
import { buildBreakout, gateLegOf, ENT1_ROUTE, BREAKOUT_TRAFFIC_BANK_DEG } from './breakout.js';
import { RANDOM, rollFor, pick, oddsFor, buildDownwindStraightIn } from './randomize.js';
import { behaviourOf, behaviourLabel } from './behaviour.js';
import { buildTaxiIn, taxiStep, taxiPosition, TAXI } from './taxi.js';
import { PATTERN_ALT_FT, RUNWAY_29L_HDG_DEG, THRESHOLD_29L, DEPARTURE_END_29L, FIELD_ELEV_FT, THRESHOLD_DATA_ELEV_FT, NUMBER_BASE_PAST_THRESHOLD_FT, TOUCHDOWN_PAST_NUMBERS_FT, RUNWAY_WIDTH_FT, runwayFrameFt, linedUp } from './airfield.js';
import { legOffsetsFt } from '../../core/geo.js';
import { closestApproach } from '../../core/closest-approach.js';
import { iasToTasKt } from './weather.js';
import { TYPE_FALLBACK_KT, TYPE_COLORS, typeProfile, numbersAreEstimates } from './types.js'; // the speed flown where a route point gives none; each type's colour
import { setFieldTemperature, placeStraightInDescent } from './weather.js';
import { windTriangle } from '../../core/wind.js';
import { wrapDeg180, compassDegFromVector } from '../../core/angles.js';

/** The step, in seconds of sim time. */
export const STEP_SEC = 0.05;

/**
 * Per-aircraft objects a step changes in place, copied into each snapshot so a rewind never shares one with the live run:
 * the named groups of state (path-follower.js groupOf), the join's blend and the side-step (path-follower.js, `t` advances).
 */
const GROUPS = Object.freeze(['random', 'spacing', 'landing', 'pfl', 'joinOffset', 'sideStep']);

/** Each aircraft type's colour: the one table in types.js (plan Step 5c Phase 1), kept exported here under its old name. */
export { TYPE_COLORS };

/** The conflict limits when a setup gives none: red 200 ft and 200 ft, caution 500 ft and 500 ft (the built-in profile's). */
const DEFAULT_CONFLICT_LIMITS = Object.freeze({ latFt: 200, vertFt: 200, cautionLatFt: 500, cautionVertFt: 500 });

/** Trails: a point every 0.5 s of sim time for the last 2 minutes, whatever the frame rate. */
/**
 * The landing tag (T+GO, STOP, GO AROUND) shows only once lined up and no more than this above the window's height, ft
 * (an estimate: 300 ft), so the initial at pattern height over the same line keeps its own tag (TR-94).
 */
const FINAL_TAG_ABOVE_WINDOW_FT = 300;

/**
 * Two aircraft touch when they pass this close, ft, centre to centre in three dimensions: Fight Sim's mid-air hitbox
 * (CT-156 wingspan 33.4 ft, length 33.3 ft; turn-fight/energy/setup.js), used by Traffic's collision (TR-116).
 */
const COLLISION_HITBOX_FT = 35;
const TRAIL_EVERY_STEPS = 10;
const TRAIL_POINTS = 240;

/** Guard against a step count that could never finish (a caller passing a bad time). */
const MOST_STEPS_AT_ONCE = 1e7;

/** A snapshot every 10 s of sim time (200 steps). */
const SNAPSHOT_EVERY_STEPS = 200;

/** An entry hands over to its pattern where it passes closest to it, if within this, ft (an estimate). */
const JOIN_NEAR_FT = 300;

/** An Astra flying the overhead joins its lap this many pilot steps (circuit.js PILOT_DT each) after the break's roll-out. */
const ASTRA_JOIN_POINTS = 40;

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
  setFieldTemperature(setup.fieldTempC); // the day's temperature (weather.js, TR-77)
  placeStraightInDescent(setup.routes); // the straight-in starts down at today's 3° intercept (TR-80)
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

  /**
   * The pattern an aircraft flies lap after lap (plan Step 5c Phase 3; review section 1, `patternFor`): its type's
   * route (types.js patternRouteId), Pattern 1 for the CT-156 and every type without its own, PAT_ASTRA for the
   * CT-102B Astra II. Every per-aircraft lookup that was `routeById('PAT1')` reads this, so a CT-156's answer is the
   * same route as before. With `orFirst`, a type that flies Pattern 1 falls back, as those lookups did, to the first
   * pattern when the setup has no PAT1, never to a pattern tied to another type; a type with its own pattern never
   * falls back onto a CT-156's (null when its route is missing: spec 4.19 item 8).
   */
  function patternFor(a, orFirst = false) {
    const id = typeProfile(a?.type).patternRouteId;
    const own = routeById(id);
    if (own || id !== 'PAT1' || !orFirst) return own ?? null;
    return setup.routes.find((r) => r.kind === 'pattern' && !r.type) ?? null;
  }
  /** True for an aircraft whose type flies Pattern 1 (the CT-156 and every type without a pattern of its own). */
  const fliesPattern1 = (a) => typeProfile(a?.type).patternRouteId === 'PAT1';
  /** The Astra's pattern, flown by astra-circuit.js (route.js FLOWN_BUILDERS). */
  const isAstraPattern = (r) => r?.flown === 'ct102b-overhead';
  /** A pattern's window point: Pattern 1's point 12, the Astra pattern's ASTRA_POINT.window. */
  const windowOf = (pat) => pat?.points?.[isAstraPattern(pat) ? ASTRA_POINT.window : 12];
  /** The Astra pattern's perch today (the perch search's, in today's wind), or its route point when it is drawn, not flown. */
  const astraPerchOf = (pat) => flownBuildOf(pat, routeOptions())?.perch ?? pat.points[ASTRA_POINT.perch];
  /** The Astra pattern's build when it has its outer pattern and both ways to initial (astra-circuit.js `via45`), else null. */
  const astraOuterOf = (route) => {
    if (!isAstraPattern(route)) return null;
    const built = flownBuildOf(route, routeOptions());
    return built?.via45?.length ? built : null;
  };

  // ── Aircraft ───────────────────────────────────────────────────────────────

  /** The aircraft's state for a move flown from where it is. */
  const stateOf = (a) => ({ x: a.x, y: a.y, alt: a.alt, kias: a.iasKt ?? a.kt ?? 220, headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG, bankDeg: a.bankDeg ?? 0 });
  const windNow = () => ({ windFromDeg: setup.windFromDeg ?? 360, windKt: setup.windKt ?? 0 });
  /** The aircraft's closed-pattern bank: its own choice, else the setting, else 50°. */
  const closedBankOf = (a) => a.closedPatternBankDeg ?? setup.settings?.closedPatternBankDeg ?? 50;

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
    if (Number.isFinite(a.backFt)) {
      // A start partway along a leg (Patrick, 4 Oct: the OHB Rejoin in whole miles back): `backFt` back from the
      // route's last point along the line it flies; startIndex becomes the spot it starts after.
      const lastIndex = route.points.length - 1;
      a.distFt = Math.max(0, pointDistFt(route, lastIndex, routeOptions()) - a.backFt);
      if (astraOuterOf(route)) {
        // The Astra's lap passes its points out of order (astra-circuit.js ASTRA_POINT): the spot is the one it is on.
        a.startIndex = posOnRoute(route, a.distFt, routeOptions()).seg;
      } else {
        let after = 0;
        while (after < lastIndex - 1 && pointDistFt(route, after + 1, routeOptions()) <= a.distFt) after++;
        a.startIndex = after;
      }
    } else {
      a.distFt = pointDistFt(route, Math.min(+a.startIndex || 0, route.points.length - 1), routeOptions());
    }
    a.lastLap = -1;
    a.splitTaken = {};
    a.trail = [];
    a.command = null;
    a.engineFailed = false;

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
      a.x = route.points[a.startIndex]?.x ?? DEPARTURE_END_29L.x;
      a.y = route.points[a.startIndex]?.y ?? DEPARTURE_END_29L.y;
      a.closedPatternBankDeg = closedBankOf(a);
      startClosedPattern(a);
    } else {
      const isBrkPoint = route.id === 'PAT1' && (startWp?.tag === 'break' || a.startIndex === 9 || p.seg === 9 || a.startIndex === 2 || p.seg === 2 || /break/i.test(startWp?.label || ''));
      a.phase = p.phase || (isBrkPoint ? 'break' : 'initial');
      // The Astra's Initial and Break are not on its lap: it flies the overhead from there, then joins the lap's downwind.
      // Its 45 to initial is not on the lap either: it flies that way round from there and joins the lap on initial.
      const bySpot = isAstraPattern(route) && !Number.isFinite(a.backFt);
      if (bySpot && (+a.startIndex === ASTRA_POINT.initial || +a.startIndex === ASTRA_POINT.break)) startAstraOverhead(a, route);
      else if (bySpot && +a.startIndex === ASTRA_POINT.fortyFiveToInitial) startAstraVia45(a, route, null);
    }
    // Which way back to initial its first lap flies (the 90 or the 45). A start placed by distance back (Spawn a
    // conflict) flies the 90, the lap its planner flew (scenario-timing.js).
    rollWayToInitial(a, route, Number.isFinite(a.backFt));
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
  function makeAircraft({ id, type, routeId, startIndex, startsAt, intent, area = null, backFt }) {
    return toStart({ id, type, color: TYPE_COLORS[type] || '#fff', fallbackKt: TYPE_FALLBACK_KT[type] ?? 120, fallbackAlt: (routeById(routeId) || setup.routes[0])?.points[startIndex]?.alt || 2500, startRouteId: routeId, startIndex, startsAt, intent, ...(area ? { area: { ...area } } : {}), ...(Number.isFinite(backFt) ? { backFt } : {}) });
  }

  /** An aircraft from a `setup.aircraft` entry. */
  const aircraftFromSpec = (spec) => makeAircraft({ id: spec.id, type: spec.type, routeId: spec.routeId, startIndex: spec.startIndex, startsAt: spec.startsAtSec, intent: spec.intent, area: spec.area, backFt: spec.backFt });

  /** What an aircraft is before it flies: enough to make it again with `toStart`. */
  const baseOf = (a) => ({ id: a.id, type: a.type, color: a.color, fallbackKt: a.fallbackKt, fallbackAlt: a.fallbackAlt, startRouteId: a.startRouteId, startIndex: a.startIndex, startsAt: a.startsAt, intent: a.intent, ...(a.area ? { area: { ...a.area } } : {}), ...(Number.isFinite(a.backFt) ? { backFt: a.backFt } : {}) });
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
    const { alongFt: along, acrossFt: across } = runwayFrameFt(a.x ?? 0, a.y ?? 0, rwy.th, ux, uy);
    const rwyTrack = (Math.atan2(ux, uy) * 180 / Math.PI + 360) % 360;
    const off = Math.abs((((a.trackDeg ?? a.headingDeg ?? rwyTrack) - rwyTrack) % 360 + 540) % 360 - 180);
    return linedUp(across, off, { maxAcrossFt: 2000, maxOffDeg: 60 }) && along > -3 * FT_PER_NM && along < rwy.len;
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
    if (a.landing) a.landing.pendingClosed = false;
    const pat = routeById('PAT1') ?? setup.routes.find((r) => r.kind === 'pattern');
    const downwind = pat && innerDownwind(pat);
    if (!downwind) return;
    const bankDeg = closedBankOf(a);
    const points = buildClosedPattern(stateOf(a), windNow(), downwind, bankDeg);
    setFlown(a, 'move', { id: 'CLOSED_FLOWN', kind: 'flown', name: 'Closed pattern', points });
    a.distFt = 0;
    a.phase = 'closed_pattern';
    a.command = 'closed_pattern';
    a.landed = false;
    a.active = true;
    delete a.joinOffset;
  }

  /**
   * An Astra started at its Initial or its Break (spec 4.19 item 2; plan Step 5c Phase 3): it flies the overhead the
   * Astra pattern's builder flew in today's wind (astra-circuit.js buildAstraCircuit `fromInitial`: the initial at
   * 180 KIAS, the 60° break onto the downwind line), from the initial or from where the break starts, followed by the
   * path follower like a go-around. Its downwind is the lap's own line, so a little after the break's roll-out it joins
   * the lap there (goAroundEnded, 'join'); the lap's downwind, final turn and landing follow. With no overhead built
   * (the route drawn with rounded corners), it starts on the lap as any other spot.
   */
  function startAstraOverhead(a, route) {
    const all = flownBuildOf(route, routeOptions())?.fromInitial;
    if (!all?.length) return;
    const from = +a.startIndex === ASTRA_POINT.break ? Math.max(0, all.findIndex((q) => q.phase === 'break')) : 0;
    const rollout = all.findIndex((q, i) => i > from && q.tag === 'break_rollout');
    // Joined a few seconds after the roll-out, wings level on the line (ASTRA_JOIN_POINTS pilot steps, an engineering choice).
    const points = all.slice(from, rollout > from ? Math.min(all.length, rollout + ASTRA_JOIN_POINTS) : all.length);
    if (points.length < 2) return;
    setFlown(a, 'move', { id: 'ASTRA_OVERHEAD_FLOWN', kind: 'flown', name: 'Overhead', points }, { then: 'join', joinId: route.id });
    const q = points[0];
    Object.assign(a, { x: q.x, y: q.y, alt: q.alt, iasKt: q.kt, headingDeg: q.headingDeg ?? a.headingDeg, distFt: 0, phase: q.phase ?? 'initial', tag: q.tag ?? 'initial' });
    delete a.joinOffset;
  }

  /**
   * The Astra's way back to initial for its next lap (spec 4.19 item 11; TR-164, a working answer not yet confirmed with
   * Patrick): the 90 to initial (the lap itself) or the 45 to initial (flown off the lap: startAstraVia45), at even odds,
   * from the run's seed, the callsign and the roll's count (randomize.js rollFor), so a rewind replays the same and no
   * other aircraft's dice change. Rolled when an aircraft appears and at each touch-and-go; `force90` gives the 90
   * without a roll. Only for the Astra pattern with its outer pattern built; nothing for any other route.
   */
  function rollWayToInitial(a, route, force90 = false) {
    if (!astraOuterOf(route)) return;
    if (force90) { a.toInitial = '90'; return; }
    a.toInitialRolls = (a.toInitialRolls ?? 0) + 1;
    a.toInitial = rollFor(seed, `${a.id}:initial`, a.toInitialRolls) < 0.5 ? '45' : '90';
  }

  /**
   * The Astra's 45 to initial (spec 4.19 item 11): the path its builder flew in today's wind from the branch point on
   * the outside downwind (astra-circuit.js buildAstraCircuit `via45`, which starts at the lap's own place, speed and
   * heading there, `branchFt` along it), followed by the path follower; a few seconds after it settles on initial it
   * joins the lap there (goAroundEnded, 'join', nearest by height, so never the final below the same line). `overFt` is
   * how far past the branch point the aircraft already is; with null it starts at the 45's own turn (its spot,
   * ASTRA_POINT.fortyFiveToInitial). It carries the overhead's id (behaviour.js names it by the lap's word), flagged as
   * flown on its lap, so the deconfliction counts it established in its pattern, not joining (deconflict.js).
   */
  function startAstraVia45(a, route, overFt) {
    const built = astraOuterOf(route);
    if (!built) return false;
    const from = overFt === null ? Math.max(0, built.via45.findIndex((q) => q.src === ASTRA_POINT.fortyFiveToInitial)) : 0;
    const points = built.via45.slice(from, built.via45JoinIndex + 1);
    if (points.length < 2) return false;
    setFlown(a, 'move', { id: 'ASTRA_OVERHEAD_FLOWN', kind: 'flown', name: '45 to initial', points }, { then: 'join', joinId: route.id, onLap: true, joinByHeight: true });
    delete a.joinOffset;
    if (overFt !== null) { a.distFt = overFt; return true; }
    const q = points[0];
    Object.assign(a, { x: q.x, y: q.y, alt: q.alt, iasKt: q.kt, headingDeg: q.headingDeg ?? a.headingDeg, distFt: 0, phase: q.phase ?? 'initial', tag: q.tag ?? 'to_initial' });
    return true;
  }

  /** An Astra on its lap rolled the 45 to initial: past the branch point on the outside downwind, it flies that way round. */
  function wayToInitial(a, route, oldDist, newDist) {
    if (a.toInitial !== '45' || a.flown) return;
    const built = astraOuterOf(route);
    const lengthFt = built ? routeLengthFt(route, routeOptions()) : 0;
    if (!lengthFt || !crossed(oldDist, newDist, built.branchFt, lengthFt)) return;
    startAstraVia45(a, route, ((newDist - built.branchFt) % lengthFt + lengthFt) % lengthFt);
  }

  /**
   * A landing for the stop (Traffic spec 4.17, TR-115; Patrick, 10 Oct 20:38Z): on 29L it rolls out to 20 kt by the
   * runway's end and taxis in to the Bandit hangar (taxi.js), where it is removed; anywhere else (a made-up route
   * that lands off the runway) it is removed at touchdown, as before.
   */
  function landForTheStop(a) {
    const ux = DEPARTURE_END_29L.x - THRESHOLD_29L.x, uy = DEPARTURE_END_29L.y - THRESHOLD_29L.y, len = Math.hypot(ux, uy);
    const frame = runwayFrameFt(a.x ?? NaN, a.y ?? NaN, THRESHOLD_29L, ux, uy);
    const along = frame.alongFt / len, across = frame.acrossFt / len;
    a.landed = true;
    a.alt = THRESHOLD_DATA_ELEV_FT;
    a.command = null;
    if (!(along >= -50 && along < len - 1000 && across < RUNWAY_WIDTH_FT['29L'])) {
      a.active = false;
      a.status = 'landed';
      a.phase = 'full_stop';
      return;
    }
    a.taxi = buildTaxiIn({ x: a.x, y: a.y }, ktToFtps(a.gsKt ?? a.iasKt ?? CIRCUIT.thresholdKias));
    a.taxiS = 0;
    a.taxiHeldSec = 0;
    a.phase = 'rollout';
    Object.assign(a, { bankDeg: 0, pitchDeg: 0, climbFtps: 0, crabDeg: 0 });
    delete a.joinOffset;
  }

  /** One step of the rollout and taxi-in; stopped at the hangar for TAXI.holdSec, the aircraft is removed. Speeds on the ground are ground speed. */
  function taxiTick(a) {
    const r = taxiStep(a.taxi, a.taxiS, STEP_SEC);
    const p = taxiPosition(a.taxi, r.s);
    a.taxiS = r.s;
    Object.assign(a, { x: p.x, y: p.y, headingDeg: p.headingDeg, trackDeg: p.headingDeg, gsKt: ftpsToKt(r.ftps), iasKt: ftpsToKt(r.ftps) });
    a.phase = r.done ? 'parked' : r.s < a.taxi.turnS ? 'rollout' : 'taxi';
    if (!r.done) return;
    a.taxiHeldSec += STEP_SEC;
    if (a.taxiHeldSec < TAXI.holdSec) return;
    a.active = false;
    a.status = 'landed';
    a.phase = 'full_stop';
    delete a.taxi;
    delete a.taxiS;
    delete a.taxiHeldSec;
  }

  /** True while an aircraft that landed for the stop is still on 29L (rolling out, or not yet clear after turning off). */
  const runwayBusy = () => aircraft.some((b) => b.taxi && b.active && b.taxiS < b.taxi.clearS);

  /**
   * A touch-and-go behind a landing for the stop flies a low approach while that aircraft is on the runway (Traffic
   * spec 4.17, TR-115; Patrick, 10 Oct 20:38Z): it goes around where a chosen low approach does (randomize.js,
   * RANDOM.lowApproachFt before the threshold), or at once if it is already closer. A runway clear by then lands it.
   */
  function runwayBusyTick() {
    const pat = routeById('PAT1');
    const rwy = circuitRunway();
    if (!pat || !rwy || !runwayBusy()) return;
    const th = rwy.th, ux = (rwy.up.x - th.x) / rwy.len, uy = (rwy.up.y - th.y) / rwy.len;
    const rwyTrack = compassDegFromVector(ux, uy);
    const touchdownFt = NUMBER_BASE_PAST_THRESHOLD_FT + TOUCHDOWN_PAST_NUMBERS_FT;
    for (const a of aircraft) {
      if (!a.active || a.landed || t < a.startsAt || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
      if (a.intent === 'full_stop' || a.flown || a.engineFailed || a.spacing?.deconflict) continue;
      const { alongFt: along, acrossFt: across } = runwayFrameFt(a.x, a.y, th, ux, uy);
      const off = Math.abs(wrapDeg180((a.trackDeg ?? a.headingDeg ?? rwyTrack) - rwyTrack));
      const route = routeOf(a);
      const onFinal = (route && route.id === patternFor(a)?.id && a.phase === 'final') || (isStraightIn(route) && linedUp(across, off, { maxAcrossFt: 2000, maxOffDeg: 30 }));
      if (!onFinal || along <= -RANDOM.lowApproachFt || along >= touchdownFt) continue;
      if (a.random) a.random.lowApproach = false;
      startGoAround(a);
    }
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
        landForTheStop(a);
        return;
      } else {
        a.phase = 'touch_and_go';
        rollWayToInitial(a, route);
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
          if (Number.isFinite(a.x)) startJoin(a, split, 0, windNow(), routeOptions());
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
    startJoin(a, target, d, windNow(), opt);
    a.phase = p.phase || 'initial';
    return true;
  }

  /**
   * A go-around from where the aircraft is (Traffic spec 4.10; Patrick, 4 Oct 09:14Z and 09:18Z):
   * flown once from its own place, height, speed, heading and bank (circuit.js buildGoAround), so
   * it starts without a step, then followed by the path follower.
   */
  function startGoAround(a, sideFt = 0, levelAltFt = null, holdKias = null) {
    const pat = patternFor(a, true);
    if (!pat) return;
    const wind = windNow();
    const from = { x: a.x, y: a.y, alt: a.alt, kias: a.iasKt ?? a.kt ?? 110, headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG, bankDeg: a.bankDeg ?? 0 };
    // The Astra's own go-around (astra-circuit.js; spec 4.19 item 3): straight to 3,000 ft and onto its downwind. The
    // move-over's side step, level and speed are the CT-156's and are not given to it (spec 4.19 item 6).
    // With the outer pattern it holds the downwind line until just past the break's roll-out before joining the lap
    // (astra-circuit.js goAroundJoin), so it never joins the upwind.
    const points = isAstraPattern(pat)
      ? buildAstraGoAround(pat.points, from, wind.windFromDeg, wind.windKt, astraPerchOf(pat), undefined, astraOuterOf(pat)?.goAroundJoin ?? null)
      : buildGoAround(pat.points, from, wind.windFromDeg, wind.windKt, sideFt, levelAltFt, holdKias);
    setFlown(a, 'move', { id: 'GO_AROUND_FLOWN', kind: 'flown', name: 'Go-around', points });
    a.distFt = 0;
    a.phase = 'go_around';
    a.command = 'go_around';
    a.landed = false;
    a.active = true;
    a.engineFailed = false;
    delete a.joinOffset;
  }

  /** Which way is away from Pattern 1 for an aircraft: 'right' when the pattern's middle is on its left, else 'left'. */
  function awayFromPattern(a) {
    const pat = routeById('PAT1') ?? setup.routes.find((r) => r.kind === 'pattern');
    if (!pat?.points?.length || !Number.isFinite(a.x)) return null;
    const cx = pat.points.reduce((t, p) => t + p.x, 0) / pat.points.length, cy = pat.points.reduce((t, p) => t + p.y, 0) / pat.points.length;
    const h = (a.headingDeg ?? 0) * Math.PI / 180;
    // Cross product of the heading (x east, y north) with the line to the middle: positive means the middle is on the left.
    const cross = Math.sin(h) * (cy - a.y) - Math.cos(h) * (cx - a.x);
    return cross > 0 ? 'right' : 'left';
  }

  /** A straight-in: an entry or split that ends on the runway rather than merging into the pattern. */
  const isStraightIn = (r) => Boolean(r) && (r.kind === 'entry' || r.kind === 'split') && !(+r.mergeIndex > 0) && r.points?.length >= 2;

  /**
   * The breakout from where the aircraft is (TR-R34; breakout.js flies it once, then the path follower):
   * the button and the deconfliction. A straight-in rejoins as a straight-in, anyone else on the overhead
   * entry's line into the Entry Gate (Patrick's card, Q7); at the end it joins that route (goAroundEnded).
   */
  function startBreakout(a, toAvoidCollision = false) {
    // The breakout is the CT-156's (ENT1's line at 3,500 ft and 220 KIAS); a type with its own pattern (the Astra) is
    // never given it (deconflict.js MOVES_BY_TYPE, spec 4.19 item 6). Should anything still ask, it goes around in its own
    // pattern instead: a guard, kept from Phase 3.
    if (!fliesPattern1(a)) { startGoAround(a); return; }
    const from = routeOf(a);
    // With no ENT1 in the setup it flies ENT1's line all the same and then joins Pattern 1 where it is nearest.
    const joinTo = isStraightIn(from) ? from : routeById('ENT1');
    const rejoin = joinTo ?? ENT1_ROUTE;
    const leg = rejoin === from ? 0 : gateLegOf(rejoin);
    // A breakout needed so as not to collide (the deconfliction's last-moment, skill layer) may bank up to 80° (Patrick,
    // 5 Oct 00:08Z and 00:13Z); otherwise, and for the button, the closed-pattern bank.
    const bankDeg = toAvoidCollision ? BREAKOUT_TRAFFIC_BANK_DEG : closedBankOf(a);
    // Off the rejoin line (an entry that joins the pattern) it turns away from the pattern (Patrick, 5 Oct 00:08Z).
    const onRejoinLine = !flownOf(a, 'move') && from && from.kind === 'entry' && +from.mergeIndex > 0;
    const turnDir = onRejoinLine ? awayFromPattern(a) : null;
    startFlown(a, buildBreakout(stateOf(a), windNow(), rejoin, leg, bankDeg, turnDir), 'BREAKOUT_FLOWN', 'Breakout', joinTo ? 'join' : null, joinTo?.id ?? null);
    delete a.rejoinRouteId;
    a.phase = 'breakout';
    a.intent = 'overhead';
    if (toAvoidCollision) groupOf(a, 'spacing').avoidanceBreakout = true;
  }


  /**
   * A short move flown from where the aircraft is (evade.js), followed by the path follower like the go-around.
   * `then` says what follows at its end: 'breakout', or 'join' onto the route `joinId`.
   */
  function startFlown(a, points, id, name, then, joinId = null) {
    setFlown(a, 'move', { id, kind: 'flown', name, points }, { then, joinId });
    a.distFt = 0;
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
    const reachFt = windowFt + EVADE.finalSpacingFt + (Number.isFinite(limitFt) ? Math.max(0, limitFt) : 3 * FT_PER_NM);
    const wind = windNow();
    const live = aircraft.filter((a) => a.active && !a.landed && t >= a.startsAt && Number.isFinite(a.x) && Number.isFinite(a.y));
    const alongOf = (p) => -runwayFrameFt(p.x, p.y, th, ux, uy).alongFt;
    const leaders = [];
    for (const a of live) {
      const { alongFt: along, acrossFt: across } = runwayFrameFt(a.x, a.y, th, ux, uy);
      const off = Math.abs(wrapDeg180((a.trackDeg ?? a.headingDeg ?? rwyTrack) - rwyTrack));
      // Lined up and landing: within 2,000 ft of the centreline and 30° of the runway track, short of the threshold,
      // and no more than 500 ft above the glide path (estimates), so the overhead's initial above doesn't count.
      const glideFt = THRESHOLD_DATA_ELEV_FT + (pat.points[12].alt - THRESHOLD_DATA_ELEV_FT) / windowFt * -along;
      const landing = linedUp(across, off, { maxAcrossFt: 2000, maxOffDeg: 30 }) && along < 0 && -along <= reachFt && a.alt <= glideFt + 500;
      const extending = a.flown?.route.id === 'EXTEND_FLOWN';
      // Turning final in its own pattern: Pattern 1 for a CT-156, the Astra pattern for an Astra (both types lead and follow, spec 4.19 item 6).
      const turningFinal = a.routeId === patternFor(a)?.id && a.phase === 'final_turn' && !flownOf(a, 'move');
      if (!landing && !extending && !turningFinal) continue;
      leaders.push({ a, distAt: leaderTrack(a, alongOf) });
    }
    if (!leaders.length) return;
    // Each follower's own pattern: Pattern 1's perch, window, extension limit and extension for a CT-156; the Astra
    // pattern's for an Astra, flown by its own builder (astra-circuit.js buildAstraExtendedDownwind). The Astra's limit
    // keeps its final turn clear of the overhead pattern's base and 45° leg by the same rule as the CT-156's (an
    // engineering choice: evade.js extendLimitFt, with the CT-156's final-turn radius, the larger, so on the safe side).
    const ct156 = { perch, windowFt, limitFt, extend: (from, e, join) => buildExtendedDownwind(pat.points, from, wind.windFromDeg, wind.windKt, perch, e, join) };
    const followerPattern = (fp) => {
      if (fp === pat) return ct156;
      if (!isAstraPattern(fp)) return null;
      const aPerch = flownBuildOf(fp, opt)?.perch;
      const win = windowOf(fp);
      if (!aPerch || !win) return null;
      return { perch: aPerch, windowFt: Math.hypot(win.x - th.x, win.y - th.y), limitFt: extendLimitFt(pat.points, aPerch), extend: (from, e, join) => buildAstraExtendedDownwind(fp.points, from, wind.windFromDeg, wind.windKt, aPerch, e, join) };
    };
    for (const f of live) {
      if (f.phase !== 'downwind' && f.landing) delete f.landing.perchRoll; // rolled once each time round the downwind
      const fp = patternFor(f);
      if (!fp || f.routeId !== fp.id || f.phase !== 'downwind' || f.spacing?.deconflict) continue;
      if (f.flown || f.sideStep) continue;
      const ahead = leaders.filter((l) => l.a !== f);
      if (!ahead.length) continue;
      const own = followerPattern(fp);
      if (!own) continue;
      // Flown once without extending, all the way to the threshold: when and where it would roll out, and how fast
      // it then comes down final (the circuit's own final, which it joins).
      const plain = own.extend(stateOf(f), 0, own.windowFt);
      if (plain.rolloutSec == null) continue;
      const rolloutFt = alongOf(plain.rollout);
      const finalGsFtps = rolloutFt / Math.max(1, plain.endSec - plain.rolloutSec);
      const ask = { rolloutSec: plain.rolloutSec, rolloutFt, downwindGsFtps: ktToFtps(f.gsKt ?? f.iasKt ?? 120), finalGsFtps, leaders: ahead };
      let extendFt = spacingExtensionFt({ ...ask, limitFt: Math.max(0, own.limitFt) });
      if (extendFt === 0) continue;
      // The one it spaces on: the first that alone would keep it from turning in now.
      const leader = ahead.find((l) => spacingExtensionFt({ ...ask, leaders: [l], limitFt: 0 }) === null) ?? ahead[0];
      // Behind a straight-in, one in four doesn't extend: it perches anyway and the straight-in moves over (TR-74).
      if (isStraightIn(routeOf(leader.a))) {
        const lg = groupOf(f, 'landing');
        lg.perchRoll ??= rollFor(seed, `${f.id}:perch`, lg.perchRolls = (lg.perchRolls ?? 0) + 1) < EVADE.perchAnywayShare ? 'perch' : 'extend';
        if (lg.perchRoll === 'perch') continue;
      }
      let flight = extendFt === null ? null : own.extend(stateOf(f), extendFt);
      // The final turn rolls out a little short of a full extension: make up the shortfall once.
      const shortFt = flight ? rolloutFt + extendFt - alongOf(flight.rollout) : 0;
      if (shortFt > 50) {
        extendFt = Math.ceil((extendFt + shortFt) / 100) * 100;
        flight = extendFt <= own.limitFt ? own.extend(stateOf(f), extendFt) : null;
      }
      if (!flight) {
        // No room to extend: the CT-156 breaks out; an Astra goes around in its own pattern (its moves, deconflict.js
        // MOVES_BY_TYPE: the CT-156's breakout is not given to it).
        const move = fliesPattern1(f) ? 'breakout' : 'go_around';
        if (move === 'breakout') startBreakout(f);
        else startGoAround(f);
        groupOf(f, 'spacing').deconflict = { move, layer: 'rules', rule: 'spacing on final: no room to extend', with: leader.a.id, label: deconflictLabel(move, 'rules') };
        continue;
      }
      setFlown(f, 'move', { id: 'EXTEND_FLOWN', kind: 'flown', name: 'Extended downwind', points: flight.track }, { then: 'final' });
      f.distFt = 0;
      f.phase = 'downwind';
      delete f.joinOffset;
      groupOf(f, 'spacing').deconflict = { move: 'extend_downwind', layer: 'rules', rule: 'spacing on final', with: leader.a.id, extendFt, label: deconflictLabel('extend_downwind', 'rules') };
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
    const roll = (a, odds) => { const rnd = groupOf(a, 'random'); return pick(odds, rollFor(seed, a.id, rnd.count = (rnd.count ?? 0) + 1)); };
    for (const a of aircraft) {
      if (!a.active || a.landed || t < a.startsAt || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
      if (flownOf(a, 'pfl') || flownOf(a, 'high_key') || a.engineFailed || a.spacing?.deconflict) continue;
      const { alongFt: along, acrossFt: across } = runwayFrameFt(a.x, a.y, th, ux, uy);
      const off = Math.abs(wrapDeg180((a.trackDeg ?? a.headingDeg ?? rwyTrack) - rwyTrack));
      const route = routeOf(a);
      // A low approach chosen on final goes around low over the runway end.
      if (a.random?.lowApproach && !flownOf(a, 'move')) {
        if (along > -RANDOM.lowApproachFt && off < 30) { a.random.lowApproach = false; startGoAround(a); }
        continue;
      }
      if (flownOf(a, 'move')) continue;
      // On final, about a mile out: touch-and-go, full stop or low approach.
      const onFinal = (route?.id === pat.id && a.phase === 'final') || (isStraightIn(route) && linedUp(across, off, { maxAcrossFt: 2000, maxOffDeg: 30 }));
      if (onFinal && !a.random?.final && along < 0 && -along <= RANDOM.finalRollFt) {
        Object.assign(groupOf(a, 'random'), { final: true, upwind: false, downwind: false });
        const choice = roll(a, odds.final);
        if (choice === 'low_approach') { a.random.lowApproach = true; a.intent = 'touch_and_go'; }
        else a.intent = choice;
        continue;
      }
      if (route?.id !== pat.id) continue;
      // On the upwind after take-off, from the departure end to 3/4 mile past it (before the crosswind turn).
      if (!a.random?.upwind && off < 30 && across < 2000 && along >= rwy.len && along <= rwy.len + RANDOM.upwindWindowFt) {
        Object.assign(groupOf(a, 'random'), { upwind: true, final: false });
        const choice = roll(a, odds.upwind);
        if (choice === 'closed_pattern') startClosedPattern(a);
        else if (choice === 'closed_high_key') startHighKeyClimb(a);
        continue;
      }
      // Abeam the departure end on the outer downwind (an SI-pattern aircraft always flies its straight-in: siPatternTick).
      if (!a.random?.downwind && !onSiPattern(a) && a.phase === 'outer_downwind' && pat.points[5] && pat.points[6]) {
        const o = legOffsetsFt(pat.points[5], pat.points[6], a);
        if (o.alongFt < 0 || o.alongFt > RANDOM.downwindWindowFt) continue;
        Object.assign(groupOf(a, 'random'), { downwind: true, final: false });
        const choice = roll(a, odds.downwind);
        const ent2 = routeById('ENT2');
        if (choice === 'straight_in' && ent2) startStraightInFromDownwind(a, pat, ent2);
        else if (choice === 'high_key') startHighKeyClimb(a);
      }
    }
  }

  /** The straight-in from the outer downwind (randomize.js buildDownwindStraightIn), flown once and then joining ENT2. */
  function startStraightInFromDownwind(a, pat, ent2) {
    startFlown(a, buildDownwindStraightIn(pat.points, stateOf(a), windNow(), ent2), 'STRAIGHT_IN_FLOWN', 'Straight-in', 'join', ent2.id);
    a.phase = 'straight_in';
  }

  /**
   * An aircraft flies the SI pattern lap after lap when its card's Pattern menu says SI, or, until it is set, when it
   * started on a straight-in (ENT2) (Patrick, 4 Oct 23:15Z and 23:23Z; TR-61, TR-62).
   */
  const onSiPattern = (a) => (a.patternChoice ? a.patternChoice === 'si' : isStraightIn(routeById(a.startRouteId)));

  /**
   * The SI pattern (Traffic spec 4.15, TR-61): after its touch-and-go an aircraft that started on a straight-in flies
   * Pattern 1's climb-out, crosswind and outer downwind, and abeam the departure end flies the straight-in from the
   * outer downwind (down to 2,700 ft at 220 KIAS, slowing level and in the turn, onto ENT2's base), as the OHB pattern
   * flies its laps. Once a lap: the flag clears on the next upwind.
   */
  function siPatternTick() {
    const pat = routeById('PAT1'), ent2 = routeById('ENT2');
    if (!pat || !ent2 || !pat.points[5] || !pat.points[6]) return;
    for (const a of aircraft) {
      if (!onSiPattern(a)) continue;
      if (a.phase === 'climb') { if (a.landing) a.landing.siLap = false; continue; }
      if (a.landing?.siLap || !a.active || a.landed || t < a.startsAt || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
      if (a.routeId !== pat.id || a.phase !== 'outer_downwind') continue;
      if (a.flown || a.engineFailed || a.spacing?.deconflict) continue;
      const o = legOffsetsFt(pat.points[5], pat.points[6], a);
      if (o.alongFt < 0 || o.alongFt > RANDOM.downwindWindowFt) continue;
      groupOf(a, 'landing').siLap = true;
      startStraightInFromDownwind(a, pat, ent2);
    }
  }

  /** The path an aircraft is following now, for the deconfliction's prediction, or null when it has none. */
  function pathOf(a) {
    if (a.flown) return { route: a.flown.route, options: PFL_ROUTE_OPTIONS };
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
      const d = a.spacing?.deconflict;
      if (!d) continue;
      const flying = BREAKING_OUT.has(d.move) ? a.command === 'breakout' || Boolean(flownOf(a, 'move'))
        : d.move === 'bank_away' ? Boolean(a.sideStep) : Boolean(flownOf(a, 'move'));
      if (!a.active || a.landed || !flying) delete a.spacing.deconflict; // d is set, so a.spacing exists
    }
    spacingTick();
    const limits = setup.conflictLimits ?? DEFAULT_CONFLICT_LIMITS;
    const frozen = freeze(aircraft.filter((a) => t >= a.startsAt), pathOf, routeOf);
    const activeDecisions = decide(frozen, limits);
    for (const d of activeDecisions) {
      const a = aircraft.find((ac) => ac.id === d.id);
      if (!a) continue;
      // The move comes by type (deconflict.js MOVES_BY_TYPE; spec 4.19 item 6; TR-159): an Astra is only ever given its
      // own go-around (startGoAround flies the Astra pattern's) or the bank away, never the CT-156's breakout, climb
      // ahead, move-over or fly-through.
      const other = aircraft.find((ac) => ac.id === d.with) ?? a;
      if (flownOf(a, 'move') && d.move === 'breakout') { delete a.flown; delete a.joinOffset; }
      if (d.move === 'breakout') startBreakout(a, d.layer === 'skill');
      else if (d.move === 'flinch') startFlinch(a, other);
      else if (d.move === 'climb_breakout') startFlown(a, buildClimbAhead(stateOf(a), windNow(), PATTERN_ALT_FT + EVADE.climbAboveFt), 'CLIMB_FLOWN', 'Climb ahead', 'breakout');
      else if (d.move === 'move_over') startGoAround(a, EVADE.moveOverFt, EVADE.moveOverLevelAltFt, EVADE.moveOverKias);
      else if (d.move === 'bank_away') startBankAway(a, other);
      else startGoAround(a); // a go-around, or a fly-through: the same flown path from where it is at pattern height
      groupOf(a, 'spacing').deconflict = { move: d.move, layer: d.layer, rule: d.rule, with: d.with, label: deconflictLabel(d.move, d.layer) };
    }
    // If an aircraft in an avoidance breakout near the runway climbs past 2,500 ft and is past the runway:
    // "if theres no more conflicts it moves back over" (Patrick, 6 Oct).
    const rwyLen = Math.hypot(DEPARTURE_END_29L.x - THRESHOLD_29L.x, DEPARTURE_END_29L.y - THRESHOLD_29L.y);
    for (const a of aircraft) {
      if (a.spacing?.avoidanceBreakout && a.command === 'breakout') {
        const off = legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, a);
        const pastGate = (a.alt ?? 0) >= 2500 && off.alongFt >= rwyLen;
        if (pastGate) {
          const hasConflict = activeDecisions.some((d) => d.id === a.id || d.with === a.id);
          if (!hasConflict) {
            delete a.spacing.avoidanceBreakout;
            delete a.spacing.deconflict;
            startGoAround(a);
          }
        }
      }
    }
  }

  /**
   * The climb to High Key from where the aircraft is (the High Key button, and Randomize's closed pattern to High Key
   * and PFL): already at High Key, the practice PFL starts at once (TR-R31).
   */
  function startHighKeyClimb(a) {
    const env = windNow();
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
    const bankDeg = closedBankOf(a);
    const flown = buildHighKeyClimb({
      x: a.x, y: a.y, alt: alt, kias: a.iasKt ?? a.kt ?? 140, headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG, bankDeg: a.bankDeg ?? 0,
    }, env, bankDeg);
    setFlown(a, 'high_key', { id: 'HIGH_KEY_FLOWN', kind: 'flown', name: 'Climb to High Key', points: flown.points }, { settings: setup.settings });
    a.engineFailed = false;
    a.distFt = 0;
    a.routeId = 'PFL_HIGH_KEY';
    a.command = 'climb_high_key';
    a.landed = false;
    a.active = true;
    a.phase = 'climb_high_key';
    a.config = 'Clean';
    clearPfl(a);
    delete a.joinOffset;
  }

  /** The end of a flown go-around: settled on the outer downwind, it joins Pattern 1 there. */
  function goAroundEnded(a) {
    delete a.goAroundDone;
    const move = flownOf(a, 'move');
    const then = move?.then, joinId = move?.joinId, joinByHeight = Boolean(move?.joinByHeight);
    if (move) delete a.flown;
    // The deconfliction's short moves: the breakout follows, or the straight-in is joined again.
    if (then === 'breakout') { startBreakout(a, a.spacing?.deconflict?.layer === 'skill'); return; }
    if (then === 'final') {
      // An extended downwind ends on Pattern 1's own straight final, inside the window: join it there, never on
      // the initial above it (same centreline).
      const pat = patternFor(a);
      if (!pat) { a.active = false; return; }
      const opt = routeOptions();
      const winIndex = isAstraPattern(pat) ? ASTRA_POINT.window : 12;
      const th = pat.points[0], win = pat.points[winIndex];
      const toGo = Math.hypot(a.x - th.x, a.y - th.y);
      a.routeId = pat.id;
      startJoin(a, pat, pointDistFt(pat, winIndex, opt) + Math.max(0, Math.hypot(win.x - th.x, win.y - th.y) - toGo), windNow(), opt);
      a.phase = 'final';
      return;
    }
    if (then === 'join') {
      const route = routeById(joinId);
      delete a.rejoinRouteId;
      a.command = null;
      if (!route) { a.active = false; return; }
      const opt = routeOptions();
      a.routeId = route.id;
      startJoin(a, route, closestDistFt(route, a, opt, { byHeight: joinByHeight }), windNow(), opt);
      a.phase = posOnRoute(route, a.distFt, opt).phase || 'route';
      return;
    }
    const pat = patternFor(a, true);
    if (!pat) { a.active = false; return; }
    const opt = routeOptions();
    a.routeId = pat.id;
    startJoin(a, pat, closestDistFt(pat, a, opt), windNow(), opt);
    a.phase = posOnRoute(pat, a.distFt, opt).phase || 'downwind';
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
      const curPos = { x: a.x ?? whereIs(a, route).x, y: a.y ?? whereIs(a, route).y, alt: a.alt ?? whereIs(a, route).alt };
      a.routeId = target.id;
      // The pattern's path passes close to, not exactly through, the entry's end: join it smoothly (spec item 13a).
      // Nearest by height too: at the threshold the initial passes overhead within a foot of the end of final.
      startJoin(a, target, closestDistFt(target, curPos, routeOptions(), { byHeight: true }) + Math.max(0, overshootFt), windNow(), routeOptions());
      const nextP = whereIs(a, target);
      a.phase = nextP.phase || (target.kind === 'pattern' ? 'initial' : 'route');
      // TR-08: a straight-in joining at the threshold (first point) evaluates landing intent
      if (mergeIndex === 0) {
        if (a.intent === 'full_stop' || (target.landOdds === 1.0 && a.intent !== 'go_around')) {
          landForTheStop(a);
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
    // Its own pattern's climb-out: Pattern 1's for a CT-156, the Astra pattern's for an Astra (both start at the same
    // touchdown point on 29L, points 0 and 1 the threshold and the departure end).
    const pat = patternFor(a, true) ?? (fliesPattern1(a) ? setup.routes[0] : null);
    if (!pat) { a.active = false; return; }
    const opt = routeOptions();
    a.routeId = pat.id;
    // On the circuit's first leg (threshold to departure end), not the initial above the same runway.
    const p0 = pat.points[0], p1 = pat.points[1] ?? p0;
    const d0 = pointDistFt(pat, 0, opt), d1 = pointDistFt(pat, 1, opt);
    const legFt = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    // The circuit's climb-out starts at the touchdown point past the numbers, not the threshold point (TR-93, TR-96).
    const along = ((a.x - p0.x) * (p1.x - p0.x) + (a.y - p0.y) * (p1.y - p0.y)) / legFt - NUMBER_BASE_PAST_THRESHOLD_FT - TOUCHDOWN_PAST_NUMBERS_FT;
    // The circuit's climb-out passes close to, not exactly through, the touchdown point: join it smoothly.
    startJoin(a, pat, d0 + Math.max(0, Math.min(along, d1 - d0)), windNow(), opt);
    a.phase = 'touch_and_go';
    a.command = null;
    rollWayToInitial(a, pat);
  }

  /** The end of a flown path, by kind: a PFL that has flown its glide, then a move that has flown its path. */
  function flownEnded(a) {
    if (a.pfl?.done) pflEnded(a);
    if (a.goAroundDone) goAroundEnded(a);
  }

  /**
   * The end of a PFL (Traffic spec 4.5 items 10-13): on the runway it flies a
   * touch-and-go with power back on and carries on in the circuit (Patrick 08:40Z);
   * a practice that missed the gate goes around; one that can't make the runway ejects.
   */
  function pflEnded(a) {
    const done = a.pfl?.done;
    if (a.pfl) delete a.pfl.done;
    if (flownOf(a, 'pfl')) delete a.flown;
    groupOf(a, 'pfl').endedThisStep = true;
    a.engineFailed = false;
    if (done === 'landed') {
      goFromRunway(a);
      clearPfl(a);
      a.config = undefined;
      a.tag = undefined;
    } else if (done === 'go_around') {
      clearPfl(a);
      a.config = undefined;
      a.tag = undefined;
      startGoAround(a);
    } else {
      eject(a);
      groupOf(a, 'pfl').decision = 'Eject';
    }
  }

  /**
   * The pilot ejects where the aircraft is (TR-75): the seat, the parachute and the abandoned aircraft diving into the
   * ground are drawn from `a.ejectAt` (ejection.js).
   */
  function eject(a) {
    a.active = false;
    a.landed = false;
    a.status = 'ejected';
    a.command = null;
    // Where, when and how fast it was going, for the ejection and the abandoned aircraft on screen (ejection.js).
    a.ejectAt = { x: a.x, y: a.y, alt: a.alt, t, headingDeg: a.headingDeg ?? RUNWAY_29L_HDG_DEG, kias: a.iasKt ?? a.kt ?? 125 };
    clearPfl(a);
    a.config = undefined;
    delete a.flown;
    if (a.spacing) delete a.spacing.deconflict;
    delete a.sideStep;
  }

  /**
   * Mid-air collisions (Traffic spec 4.18, TR-116; Patrick, 10 Oct 21:15Z: "if the aircraft actually do collide/touch,
   * they eject and crash"): two flying aircraft that pass within COLLISION_HITBOX_FT of each other during the step both
   * eject. Each moved in a straight line over the step from where it was (`before`). Aircraft on the ground are left out,
   * and so are two that were already inside the hitbox when the step began (two started on the same spot).
   */
  function collisionTick(before) {
    const flying = aircraft.filter((a) => a.active && !a.landed && before.has(a.id) && [a.x, a.y, a.alt].every(Number.isFinite));
    const hit = new Set();
    for (let i = 0; i < flying.length; i++) {
      for (let j = i + 1; j < flying.length; j++) {
        const a = flying[i], b = flying[j];
        const a0 = before.get(a.id), b0 = before.get(b.id);
        const moving = (p0, p) => ({ x: p0.x, y: p0.y, z: p0.alt, vx: (p.x - p0.x) / STEP_SEC, vy: (p.y - p0.y) / STEP_SEC, vz: (p.alt - p0.alt) / STEP_SEC });
        const cpa = closestApproach(moving(a0, a), moving(b0, b));
        const endFt = Math.hypot(a.x - b.x, a.y - b.y, a.alt - b.alt);
        const closestFt = cpa.closing && cpa.tcpaSec <= STEP_SEC ? cpa.missFt : Math.min(cpa.rangeFt, endFt);
        // Coming together: two already overlapping when the step began (started on the same spot) pass through.
        if (closestFt < COLLISION_HITBOX_FT && cpa.rangeFt >= COLLISION_HITBOX_FT) { hit.add(a); hit.add(b); }
      }
    }
    for (const a of hit) {
      eject(a);
      a.collided = true;
    }
  }

  /**
   * One step of the sim, in this order (refactor step 4: the order is read here, in one place):
   *  1. every half second (DECONFLICT.decideEverySteps), HALF_SECOND_TICKS: the SI pattern, Randomize, the
   *     deconfliction, the runway-busy go-around;
   *  2. each aircraft in turn, aircraftTick: taxi, or follow its path, end a flown path, the route's decisions and
   *     end, a closed pattern waiting for the upwind end;
   *  3. collisions (collisionTick), from where each aircraft was before the step;
   *  4. a snapshot every so often (remember).
   */
  const HALF_SECOND_TICKS = [
    () => siPatternTick(),
    () => { if (setup.randomize) randomizeTick(); },
    () => { if (setup.deconflict) deconflictTick(); },
    () => runwayBusyTick(),
  ];

  function stepOnce() {
    setFieldTemperature(setup.fieldTempC); // set each step, so two sims in one page each fly their own day
    placeStraightInDescent(setup.routes);
    t += STEP_SEC; // added up one step at a time, as V6 does, so the clock is V6's to the last digit
    steps++;
    const opt = routeOptions();
    const wind = windNow();
    if (steps % DECONFLICT.decideEverySteps === 0) for (const tick of HALF_SECOND_TICKS) tick();
    const before = positionsNow();
    for (const a of aircraft) aircraftTick(a, wind, opt);
    collisionTick(before);
    if (steps % every === 0 && !history.has(steps)) remember();
  }

  /** Where each flying aircraft is, for the collision check after the step. */
  function positionsNow() {
    const before = new Map();
    for (const a of aircraft) {
      if (a.active && !a.landed && t >= a.startsAt && [a.x, a.y, a.alt].every(Number.isFinite)) before.set(a.id, { x: a.x, y: a.y, alt: a.alt });
    }
    return before;
  }

  /** One aircraft's step: taxi, or its path; then the end of a flown path, the route's decisions and end. */
  function aircraftTick(a, wind, opt) {
    if (!a.active || t < a.startsAt) return;
    if (a.taxi) {
      taxiTick(a);
      recordTrail(a);
      return;
    }
    const route = routeOf(a);
    const beforeDist = a.distFt;
    const onRouteBefore = !a.flown; // beforeDist is along the route, not along a flown path that ends this step
    const sideStepping = Boolean(a.sideStep);
    tickAircraft(a, STEP_SEC, wind, route, opt);
    // A PFL's bank away has ended, its height charged: re-plan the glide from where it really is (TR-55).
    if (sideStepping && !a.sideStep && flownOf(a, 'pfl') && !a.pfl?.done) resumePflFlight(a, wind, setup.settings);
    flownEnded(a);
    if (route && !a.flown && !a.pfl?.endedThisStep) {
      const len = routeLengthFt(route, opt);
      if (route.kind === 'pattern' && a.distFt >= beforeDist) {
        checkDecisions(a, beforeDist, a.distFt);
        // The Astra's way back to initial: the 45 is flown off the lap from the branch point (the 90 is the lap).
        if (onRouteBefore && a.active && isAstraPattern(route)) wayToInitial(a, route, beforeDist, a.distFt);
      }
      if (a.active && len && a.distFt >= len && !isClosedRoute(route)) {
        handleRouteEnd(a, a.distFt - len);
      } else if (a.active) {
        joinWhenAligned(a, route, opt);
      }
    }

    // A closed pattern asked for short of the upwind end pulls up once past it (TR-R33).
    if (a.active && a.landing?.pendingClosed && !beforeUpwindEnd(a)) startClosedPattern(a);

    if (a.pfl) delete a.pfl.endedThisStep;
    recordTrail(a);
  }

  /** A trail point every TRAIL_EVERY_STEPS steps, the oldest dropped past TRAIL_POINTS. */
  function recordTrail(a) {
    if (steps % TRAIL_EVERY_STEPS !== 0) return;
    a.trail.push({ x: a.x, y: a.y });
    if (a.trail.length > TRAIL_POINTS) a.trail.shift();
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

  /** Fresh copies of an aircraft's in-place objects (GROUPS), so a snapshot and the live run never share one. */
  const copyGroups = (rec) => Object.fromEntries(GROUPS.filter((g) => rec[g]).map((g) => [g, { ...rec[g] }]));

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
          ...copyGroups(rest),
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
      ...copyGroups(rest),
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
     * is from now (default 0). Returns its callsign. `id` picks the callsign. `backFt`, when given, starts it that
     * far back from the route's last point along the line instead of at a start point (the OHB Rejoin's miles back).
     * @param {{ type?: string, routeId?: string, startPoint?: number, delaySec?: number, id?: string, intent?: string, backFt?: number }} [spec]
     */
    spawn({ type: askedType, routeId, startPoint = 1, delaySec = 0, id, intent, backFt } = {}) {
      settle();
      const route = routeId === undefined ? setup.routes[0] : routeById(routeId);
      if (!route && !setup.routes.length) throw new RangeError(NO_ROUTES);
      if (!route) throw new RangeError(`unknown route ${routeId}`);
      // A route tied to a type (the Astra pattern, spec 4.19 item 6) is flown by that type only, and it is the type
      // when none is asked for; any other route, the CT-156 unless asked.
      const type = askedType ?? route.type ?? 'CT-156';
      if (!TYPE_COLORS[type]) throw new RangeError(`unknown aircraft type ${type}`);
      if (route.type && typeProfile(type).id !== route.type) throw new RangeError(`${route.name} is flown by the ${route.type} only, not a ${type}`);
      if (!Number.isInteger(startPoint) || startPoint < 1) throw new RangeError(`the start point counts from 1, not ${startPoint}`);
      if (!Number.isFinite(delaySec)) throw new RangeError(`the delay must be a number of seconds, not ${delaySec}`);
      if (backFt !== undefined && !(Number.isFinite(backFt) && backFt >= 0)) throw new RangeError(`the distance back must be a number of feet from 0, not ${backFt}`);
      if (id !== undefined && inUse(id)) throw new RangeError(`callsign ${id} is in use`);
      const rec = baseOf(makeAircraft({ id: id ?? nextCallsign(), type, routeId: route.id, startIndex: startPoint - 1, startsAt: t + delaySec, intent, backFt }));
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
      return rosterAtEnd().map((rec) => ({ id: rec.id, type: rec.type, routeId: rec.startRouteId, startIndex: rec.startIndex, startsAtSec: rec.startsAt, ...(rec.area ? { area: { ...rec.area } } : {}), ...(Number.isFinite(rec.backFt) ? { backFt: rec.backFt } : {}) }));
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
      // On the ground after a landing for the stop: only a touch-and-go, and only while still rolling on the runway.
      if (a.taxi) {
        if (action !== 'touch_and_go' || a.taxiS >= a.taxi.turnS) return false;
        delete a.taxi;
        delete a.taxiS;
        delete a.taxiHeldSec;
      }
      // A new command stops a flown go-around or closed pattern: back onto Pattern 1 where the aircraft is, then
      // the command. A breakout or a deconfliction move just stops; the command flies from where it is. A
      // touch-and-go in the air only sets the next landing, so the flown path carries on.
      if (action !== 'touch_and_go') {
        if (flownOf(a, 'move')?.then) delete a.flown;
        if (flownOf(a, 'move')) goAroundEnded(a);
        // A later command cancels a closed pattern still waiting for the upwind end: the newest order wins.
        if (a.landing) a.landing.pendingClosed = false;
      }
      // A new command stops the flown climb to High Key; the command then flies from where the aircraft is.
      if (flownOf(a, 'high_key')) delete a.flown;
      // A new command stops the flown PFL glide; the command then flies from where the aircraft is.
      if (action !== 'touch_and_go' && action !== 'pfl_current' && action !== 'engine_fail') {
        if (flownOf(a, 'pfl')) delete a.flown;
        if (a.pfl) delete a.pfl.done;
        a.engineFailed = false;
        clearPfl(a);
        a.config = undefined;
      }
      if (action === 'breakout') {
        startBreakout(a);
      } else if (action === 'closed_pattern') {
        a.closedPatternBankDeg = options?.bankDeg ?? closedBankOf(a);
        // The pull-up starts at or after the upwind end of the runway (TR-R33, WFO art 402): an aircraft
        // on final or on the runway touches and goes, and pulls up once past the upwind end.
        if (beforeUpwindEnd(a)) {
          groupOf(a, 'landing').pendingClosed = true;
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
        const env = windNow();
        // Gear and flap already down stay down (Patrick, 11 Oct 08:43Z): the glide starts in today's configuration.
        const startConfig = a.engineFailed ? a.config : sim.state().aircraft.find((b) => b.id === a.id)?.config;
        startPflFlight(a, env, { settings: setup.settings, startConfig });
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

    /** Sets the pattern an aircraft flies each lap: 'ohb' or 'si' (the card's Pattern menu; Traffic spec 4.15). */
    setPattern(aircraftId, pattern) {
      settle();
      const a = aircraft.find((ac) => ac.id === aircraftId);
      if (!a || (pattern !== 'ohb' && pattern !== 'si')) return false;
      a.patternChoice = pattern;
      return true;
    },

    nextCallsign,

    /** What is where right now. */
    state() {
      const rwy = circuitRunway();
      const pat1Window = routeById('PAT1')?.points?.[12];
      // The behaviour tag (behaviour.js, TR-60): where the aircraft stands against the runway, for a straight-in's final.
      // The window is its own pattern's: Pattern 1's for a CT-156, the Astra pattern's (0.5 NM, spec 4.19) for an Astra.
      const tagOf = (a, route, kt, alt, x, y, leg) => {
        const win = fliesPattern1(a) ? pat1Window : windowOf(patternFor(a)) ?? pat1Window;
        const windowFt = rwy && win ? Math.hypot(win.x - rwy.th.x, win.y - rwy.th.y) : NaN;
        const profile = typeProfile(a.type);
        let onFinal = false, toThresholdFt = NaN;
        if (rwy && Number.isFinite(x) && Number.isFinite(y)) {
          const ux = (rwy.up.x - rwy.th.x) / rwy.len, uy = (rwy.up.y - rwy.th.y) / rwy.len;
          const { alongFt: along, acrossFt: across } = runwayFrameFt(x, y, rwy.th, ux, uy);
          const off = Math.abs(wrapDeg180((a.trackDeg ?? a.headingDeg ?? 0) - compassDegFromVector(ux, uy)));
          // Low as well as lined up: an aircraft on initial at pattern height over the same line is not landing yet
          const low = Number.isFinite(alt) && alt <= (win?.alt ?? PATTERN_ALT_FT) + FINAL_TAG_ABOVE_WINDOW_FT;
          const overRunway = along >= 0 && along <= rwy.len && across < 500 && low;
          onFinal = (along < 0 && linedUp(across, off, { maxAcrossFt: 2000, maxOffDeg: 30 }) && low) || overRunway;
          toThresholdFt = along >= 0 ? 0 : Math.hypot(x - rwy.th.x, y - rwy.th.y);
        }
        const b = behaviourOf({ ...a, kt, alt, leg, siPattern: onSiPattern(a) }, { route, fieldElevFt: FIELD_ELEV_FT, onFinal, toThresholdFt, windowFt, tagWord: profile.tagWord });
        const estimate = numbersAreEstimates(a.type);
        return {
          label: behaviourLabel(b, a.spacing?.deconflict?.label ?? null, { estimate }) ?? a.spacing?.deconflict?.label ?? null,
          config: b?.config,
        };
      };
      const list = aircraft.map((a) => {
        const route = routeOf(a);
        const p = whereIs(a);
        const iasKt = a.iasKt ?? (p.kt ?? a.fallbackKt);
        const altFt = a.landed ? (a.alt ?? p.alt ?? FIELD_ELEV_FT) : (a.alt ?? (p.alt ?? a.fallbackAlt));
        const x = a.x ?? p.x;
        const y = a.y ?? p.y;
        const headingDeg = a.headingDeg ?? p.headingDeg;
        const tag = t < a.startsAt ? null : tagOf({ ...a, trackDeg: a.trackDeg ?? headingDeg }, route, iasKt, altFt, x, y, p.seg !== undefined ? p.seg + 1 : 1);
        return {
          id: a.id, type: a.type, color: a.color, routeId: a.routeId,
          mode: 'RAIL', // every aircraft rides a path; kept for readers of the state
          x, y, alt: altFt, kt: iasKt,
          headingDeg,
          bankDeg: a.bankDeg ?? 0,
          pitchDeg: a.pitchDeg ?? null,
          climbFtps: Number.isFinite(a.climbFtps) ? a.climbFtps : 0, // on the altimeter; the 3D aim line reads it (TR-78)
          phase: a.phase ?? 'initial',
          tag: a.tag ?? p.tag ?? route?.points?.[p.seg]?.tag,
          trackDeg: a.trackDeg ?? a.headingDeg ?? p.headingDeg,
          crabDeg: a.crabDeg ?? 0,
          // The crosswind wing-down, drawn only (path-follower.js drawHeadingOf/drawBankOf; TR-143), while it is this step's.
          ...(a.drawOf === a.headingDeg && Number.isFinite(a.drawHeadingDeg)
            ? { drawHeadingDeg: a.drawHeadingDeg, drawBankDeg: a.drawBankDeg, drawOf: headingDeg }
            : {}),
          groundSpeedKt: a.gsKt ?? iasKt,
          leg: p.seg !== undefined ? p.seg + 1 : 1, distFt: a.distFt,
          status: statusOf(a), startsAt: a.startsAt,
          active: a.active,
          landed: Boolean(a.landed),
          onGround: Boolean(a.taxi),
          collided: Boolean(a.collided),
          engineFailed: Boolean(a.engineFailed),
          command: a.command ?? null,
          intent: a.intent ?? 'touch_and_go',
          pattern: onSiPattern(a) ? 'si' : 'ohb',
          closedPatternBankDeg: a.closedPatternBankDeg,
          config: a.config ?? tag?.config,
          pflSegment: a.pfl?.segment ?? null,
          pflDecision: a.pfl?.decision ?? null,
          pflMarginFt: a.pfl?.marginFt ?? null,
          pflMarginTag: a.pfl?.marginTag ?? null,
          pflFlight: Boolean(flownOf(a, 'pfl')),
          pflRoute: flownOf(a, 'pfl')?.route ?? null,
          highKeyFlight: Boolean(flownOf(a, 'high_key')),
          ejectAt: a.ejectAt ?? null,
          deconflict: a.spacing?.deconflict?.label ?? null,
          behaviour: tag?.label ?? null,
        };
      });
      // An aircraft rolling out or taxiing is shown but is never in a conflict with one flying over it.
      return { t, aircraft: list, conflicts: findConflicts(list.filter((a) => a.status === 'flying' && !a.onGround)) };
    },
  };

  base = (setup.aircraft ?? []).map((spec) => baseOf(aircraftFromSpec(spec)));
  aircraft = base.map(freshFrom);
  remember(); // the run at 0 s: the snapshot every rewind can fall back on
  return sim;
}
