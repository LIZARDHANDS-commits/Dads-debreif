// What the screen hands the map (specs/SPEC-traffic.md: The screen): the routes with their
// drawn path and turn data, the leg lengths with the middle of each leg, the aircraft, the
// conflicts and the trails, and the one line each route gets in the routes list.
//
// Pure: it reads the engine's setup and state and returns plain data. It changes nothing
// and works out no flight math of its own (radius, bank and the drawn path are the engine's).
import { DEFAULT_ROUTE_OPTIONS, drawPath, legDistances, pointTurn } from './route.js';

const isShowing = (route) => route.visible !== false;

/** Where a route joins, as the routes list says it: "→ Pattern 1 P8" for an entry, "P6 → P1" for a split (points from 1). */
export function routeLink(route, routes) {
  if (route.kind === 'entry') {
    const pattern = routes.find((r) => r.id === route.attachTo);
    return pattern ? `→ ${pattern.name} P${route.mergeIndex + 1}` : 'Not linked';
  }
  if (route.kind === 'split') {
    const joined = routes.some((r) => r.id === route.attachTo) && routes.some((r) => r.id === route.sourceRoute);
    return joined ? `P${route.sourceIndex + 1} → P${route.mergeIndex + 1}` : 'Not linked';
  }
  return '';
}

/** One row per route for the routes list (layout.js setRoutes). */
export const routeRows = (routes) => routes.map((r) => ({ id: r.id, name: r.name, kind: r.kind, color: r.color, link: routeLink(r, routes) }));

/** The points of a route where a choice is made: a pattern's first point, and every point a split leaves from (0-based). */
export function decisionPoints(route, routes) {
  const points = new Set();
  if (route.kind !== 'pattern') return points;
  points.add(0);
  for (const other of routes) if (other.kind === 'split' && other.sourceRoute === route.id) points.add(other.sourceIndex);
  return points;
}

/** Each leg's length with the middle of the leg, for the map to write it at: [{ routeId, x, y, ft }]. Routes that are hidden have none. */
export const legMarks = (routes) =>
  routes.filter(isShowing).flatMap((route) => legDistances(route).map(({ routeId, x, y, ft }) => ({ routeId, x, y, ft })));

/**
 * The scene map2d draws (see the top of map2d.js). `state` is `sim.state()`, `trailOf` is
 * `sim.trailOf`, and the setup gives the routes and their options.
 */
export function buildScene({ setup, state, selectedRouteId, trailOf }) {
  const options = setup.routeOptions ?? DEFAULT_ROUTE_OPTIONS;
  const routes = setup.routes.map((route) => {
    const decisions = decisionPoints(route, setup.routes);
    return {
      id: route.id, name: route.name, kind: route.kind, color: route.color, visible: isShowing(route),
      points: route.points.map((p, i) => ({ ...p, decision: decisions.has(i), ...pointTurn(route, i, options) })),
      path: isShowing(route) && route.points.length > 1 ? drawPath(route, options) : undefined,
    };
  });
  const trails = Object.create(null); // keyed by callsign: a callsign like __proto__ is an ordinary key here
  for (const a of state.aircraft) trails[a.id] = trailOf(a.id);
  return { routes, selectedRouteId, aircraft: state.aircraft, conflicts: state.conflicts, trails, legs: legMarks(setup.routes) };
}
