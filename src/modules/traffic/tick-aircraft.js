// One step for a Traffic aircraft: the path follower flies whichever path the aircraft is on.
// The old two-mode (rail and physics) machine was removed on Patrick's card "Rebuild, then delete"
// (4 Oct 17:53Z), once the closed pattern (#302) and the breakout (#305) were flown paths too.

import { routeLengthFt, DEFAULT_ROUTE_OPTIONS } from './route.js';
import { followRoute } from './path-follower.js';
import { startPflFlight, PFL_ROUTE_OPTIONS, PFL_CONFIGS, PFL_CONFIG_LABELS } from './pfl.js';

/**
 * One simulation step for an aircraft: every aircraft rides a path on the path follower (Traffic plan,
 * Step 2: one mover). A manoeuvre flown once from where the aircraft was (the go-around, closed pattern,
 * breakout and deconfliction moves in `a.goAroundFlight`, the climb to High Key, the PFL) comes first;
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

  // ── Go-around: the flown go-around, on the path follower (Traffic spec 4.10) ──
  // At its end sim.js joins the aircraft onto Pattern 1's downwind (goAroundEnded).
  if (a.goAroundFlight) {
    const ga = a.goAroundFlight;
    const p = followRoute(a, ga.route, env, stepDt, PFL_ROUTE_OPTIONS);
    a.phase = ga.route.points[Math.min(p.seg ?? 0, ga.route.points.length - 1)]?.phase ?? 'go_around';
    if (a.distFt >= routeLengthFt(ga.route, PFL_ROUTE_OPTIONS) - 0.5) a.goAroundDone = true;
    return a;
  }

  // ── High Key: the flown climb onto the run-in, on the path follower (Traffic spec 1a item 23) ──
  // At High Key the power comes off and the same glide as a PFL follows, as practice (TR-R31).
  if (a.highKeyFlight) {
    const hk = a.highKeyFlight;
    const p = followRoute(a, hk.route, env, stepDt, PFL_ROUTE_OPTIONS);
    a.phase = hk.route.points[Math.min(p.seg ?? 0, hk.route.points.length - 1)]?.phase ?? 'climb_high_key';
    if (a.distFt >= routeLengthFt(hk.route, PFL_ROUTE_OPTIONS) - 0.5) {
      delete a.highKeyFlight;
      a.tag = 'high_key';
      startPflFlight(a, env, { practice: true, settings: hk.settings });
      a.routeId = 'PFL_HIGH_KEY';
      a.command = 'climb_high_key';
    }
    return a;
  }

  // ── PFL: the flown glide, on the path follower (Traffic spec 4.5; refactor PR 3) ──
  if (a.pflFlight) {
    const fl = a.pflFlight;
    // A bank away glides in the configuration it is in, so the follower charges its height (TR-55).
    if (a.sideStep) a.sideStep.glideConfig = PFL_CONFIGS[Math.max(0, PFL_CONFIG_LABELS.indexOf(a.config))];
    const p = followRoute(a, fl.route, env, stepDt, PFL_ROUTE_OPTIONS);
    const pt = fl.route.points[Math.min(p.seg ?? 0, fl.route.points.length - 1)];
    a.phase = pt?.phase ?? 'pfl';
    a.pflDecision = pt?.decision ?? a.pflDecision;
    a.config = pt?.config ?? a.config;
    // The tag holds the last key passed (High Key until Low Key, and so on).
    if (pt?.tag) a.tag = pt.tag;
    a.engineFailed = true;
    if (a.distFt >= routeLengthFt(fl.route, PFL_ROUTE_OPTIONS) - 0.5) a.pflDone = fl.outcome;
    return a;
  }

  // ── Everything else: the route it is on, on the path follower (Traffic spec items 1-9) ──
  if (!route) return a;
  followRoute(a, route, env, stepDt, routeOptions);
  return a;
}
