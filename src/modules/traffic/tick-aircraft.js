// One step for a Traffic aircraft: the path follower flies whichever path the aircraft is on.
// The old two-mode (rail and physics) machine was removed on Patrick's card "Rebuild, then delete"
// (4 Oct 17:53Z), once the closed pattern (#302) and the breakout (#305) were flown paths too.

import { routeLengthFt, DEFAULT_ROUTE_OPTIONS } from './route.js';
import { followRoute, groupOf } from './path-follower.js';
import { startPflFlight, PFL_ROUTE_OPTIONS, PFL_CONFIGS, PFL_CONFIG_LABELS } from './pfl.js';

/**
 * What each kind of flown path does after the follower's step: `pt` is the point it is on, `atEnd` true once it has
 * flown the whole path (sim.js then ends it: goAroundEnded, pflEnded).
 */
const FLOWN_STEP = {
  // The go-around, closed pattern, breakout and the deconfliction's moves (Traffic spec 4.10); at the end sim.js
  // joins the aircraft onto Pattern 1's downwind or what `then` says (goAroundEnded).
  move(a, fl, pt, atEnd) {
    a.phase = pt?.phase ?? 'go_around';
    if (atEnd) a.goAroundDone = true;
  },
  // The climb onto the run-in (Traffic spec 1a item 23): at High Key the power comes off and the same glide as a
  // PFL follows, as practice (TR-R31).
  high_key(a, fl, pt, atEnd, env) {
    a.phase = pt?.phase ?? 'climb_high_key';
    if (atEnd) {
      delete a.flown;
      a.tag = 'high_key';
      startPflFlight(a, env, { practice: true, settings: fl.settings });
      a.routeId = 'PFL_HIGH_KEY';
      a.command = 'climb_high_key';
    }
  },
  // The engine-out glide (Traffic spec 4.5): the point's segment, decision, configuration and margin; the tag holds
  // the last key passed (High Key until Low Key, and so on).
  pfl(a, fl, pt, atEnd) {
    a.phase = pt?.phase ?? 'pfl';
    const pf = groupOf(a, 'pfl');
    pf.segment = pt?.segmentType ?? pt?.segment ?? pt?.phase ?? 'pfl';
    pf.decision = pt?.decision ?? pf.decision;
    a.config = pt?.config ?? a.config;
    pf.marginFt = pt?.marginFt ?? pf.marginFt ?? null;
    pf.marginTag = pt?.marginTag ?? pf.marginTag ?? null;
    if (pt?.tag) a.tag = pt.tag;
    a.engineFailed = true;
    if (atEnd) pf.done = fl.outcome;
  },
};

/**
 * One simulation step for an aircraft: every aircraft rides a path on the path follower (Traffic plan,
 * Step 2: one mover). A manoeuvre flown once from where the aircraft was (the go-around, closed pattern,
 * breakout and deconfliction moves, the climb to High Key, the PFL: `a.flown`) comes first;
 * otherwise the route it is on.
 *
 * @param {Object} a - Mutable aircraft state
 * @param {number} [dt=0.05] - Time step in seconds
 * @param {{ windFromDeg?: number, windKt?: number }} [wind] - Wind environment
 * @param {Object} [route] - Route definition
 * @param {Object} [routeOptions] - Route calculation options
 * @returns {Object} Updated aircraft state
 */
export function tickAircraft(a, dt = 0.05, wind = null, route = null, routeOptions = DEFAULT_ROUTE_OPTIONS) {
  if (!a || a.active === false || a.landed === true) return a;

  const stepDt = (Number.isFinite(dt) && dt > 0) ? dt : 0.05;
  const windFromDeg = wind?.windFromDeg ?? 360;
  const windKt = wind?.windKt ?? 0;
  const env = { windFromDeg, windKt };

  // ── A flown path (a.flown, path-follower.js setFlown) comes first: the kind's own lines are in FLOWN_STEP ──
  if (a.flown) {
    const fl = a.flown;
    if (fl.kind === 'pfl' && a.sideStep) {
      // A bank away glides in the configuration it is in, so the follower charges its height (TR-55).
      a.sideStep.glideConfig = PFL_CONFIGS[Math.max(0, PFL_CONFIG_LABELS.indexOf(a.config))];
    }
    const p = followRoute(a, fl.route, env, stepDt, PFL_ROUTE_OPTIONS);
    const pt = fl.route.points[Math.min(p.seg ?? 0, fl.route.points.length - 1)];
    const atEnd = a.distFt >= routeLengthFt(fl.route, PFL_ROUTE_OPTIONS) - 0.5;
    FLOWN_STEP[fl.kind](a, fl, pt, atEnd, env);
    return a;
  }

  // ── Everything else: the route it is on, on the path follower (Traffic spec items 1-9) ──
  if (!route) return a;
  followRoute(a, route, env, stepDt, routeOptions);
  return a;
}
