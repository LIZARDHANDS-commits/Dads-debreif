// What the screen hands the map (specs/SPEC-traffic.md: The screen): the routes with their
// drawn path and turn data, the leg lengths with the middle of each leg, the aircraft, the
// conflicts and the trails, and the one line each route gets in the routes list.
//
// Pure: it reads the engine's setup and state and returns plain data. It changes nothing
// and works out no flight math of its own (radius, bank and the drawn path are the engine's).
import { DEFAULT_ROUTE_OPTIONS, drawPath, legDistances, pointTurn, computeWindPerch, generateWindAdjustedTrack } from './route.js';
import { buildDownwindStraightIn } from './randomize.js';
import { temperatureKey } from './weather.js';

const isShowing = (route) => route.visible !== false;

/**
 * Pattern 1's line without the runway part (Patrick, 6 Oct: "hide the traffic pattern lines from the window to the departure
 * end, we don't need those there"): from the departure end round to the window, drawn open. For drawing only; the aircraft
 * still fly the whole circuit. A track without the departure end and the window marked comes back whole.
 */
function windowToDeparture(track) {
  if (!Array.isArray(track)) return { path: track, cut: false };
  const from = track.findIndex((p) => p.src === 1);
  const to = track.findIndex((p) => p.phase === 'final');
  if (from < 0 || to <= from) return { path: track, cut: false };
  // The whole circuit's lowest height (the threshold) goes with it: the 3D view sets its ground there (view3d groundFt).
  const lowFt = Math.min(...track.map((p) => p.alt).filter(Number.isFinite));
  return { path: track.slice(from, to + 1), cut: true, lowFt };
}

/** The SI pattern's line on the map (Patrick, 4 Oct): its id, name and colour as the routes list shows them. */
export const SI_PATTERN = Object.freeze({ id: 'SI_PATTERN', name: 'SI pattern', kind: 'entry', color: '#ffa657' });
const siLines = new WeakMap(); // Pattern 1's route → { key, ent2, path }: flown once per wind, not every frame

/**
 * The line an SI-pattern aircraft flies (Traffic spec 4.15, TR-61), for drawing only: Pattern 1 from the threshold
 * round to abeam the departure end, then the straight-in the sim flies from there in this wind (randomize.js
 * buildDownwindStraightIn, the same code the aircraft use: down to 2,700 ft at 220 KIAS, onto the SI Rejoin's base),
 * then the SI Rejoin from its Entry Gate to the runway. Null without Pattern 1 and the SI Rejoin (ENT2).
 */
export function siPatternPath(routes, windFromDeg = 360, windKt = 0, options = DEFAULT_ROUTE_OPTIONS) {
  const pat = routes.find((r) => r.id === 'PAT1'), ent2 = routes.find((r) => r.id === 'ENT2');
  if (!pat || !ent2 || pat.points.length < 7 || ent2.points.length < 3) return null;
  const key = `${windFromDeg}_${windKt}_${temperatureKey()}`; // and the day's temperature (true airspeeds)
  const kept = siLines.get(pat);
  if (kept && kept.key === key && kept.ent2 === ent2) return kept.path;
  const a = pat.points[5], b = pat.points[6]; // abeam the departure end, then the outer downwind
  const headingDeg = ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
  const round = drawPath({ id: 'SI_ROUND', name: 'SI pattern', kind: 'entry', points: pat.points.slice(0, 6) }, options);
  const flown = buildDownwindStraightIn(pat.points, { x: a.x, y: a.y, alt: a.alt ?? 3500, kias: a.kt ?? 220, headingDeg, bankDeg: 0 }, { windFromDeg, windKt }, ent2);
  const home = drawPath({ id: 'SI_HOME', name: 'SI pattern', kind: 'entry', points: ent2.points.slice(2) }, options);
  const path = [...round, ...flown.map((p) => ({ x: p.x, y: p.y, alt: p.alt })), ...home];
  siLines.set(pat, { key, ent2, path });
  return path;
}

/** Where a route joins, as the routes list says it: "→ Overhead break P8" for an entry, "P6 → P1" for a split (points from 1). */
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
export const routeRows = (routes) => routes.map((r) => ({ id: r.id, name: r.name, kind: r.kind, color: r.color, link: routeLink(r, routes), visible: isShowing(r) }));

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
  const windKt = setup.windKt ?? 0;
  const windFromDeg = setup.windFromDeg ?? 360;
  const routes = setup.routes.map((route) => {
    const decisions = decisionPoints(route, setup.routes);
    const isPat1 = route.id === 'PAT1' && route.points?.length >= 4;
    const isPat1Wind = isPat1 && windKt > 0;
    const pat1 = isPat1 && route.points.length > 1 ? windowToDeparture(generateWindAdjustedTrack(route, windFromDeg, windKt, options)) : null;
    const calm = isShowing(route) && isPat1Wind ? windowToDeparture(generateWindAdjustedTrack(route, 360, 0, options)) : null;
    return {
      id: route.id, name: route.name, kind: route.kind, color: route.color, visible: isShowing(route),
      points: route.points.map((p, i) => ({ ...p, decision: decisions.has(i), ...pointTurn(route, i, options) })),
      path: isShowing(route) && route.points.length > 1
        ? (isPat1 ? pat1.path : drawPath(route, options))
        : undefined,
      calmPath: calm ? calm.path : undefined,
      open: Boolean(pat1?.cut), // drawn as an open line, not a loop
      lowFt: pat1?.lowFt, // the hidden runway part's height, so the ground stays at the threshold
      windPerch: isShowing(route) && isPat1Wind ? computeWindPerch(route, windFromDeg, windKt, options) : null,
    };
  });
  for (const a of state.aircraft ?? []) {
    if (a.pflRoute?.points?.length > 1) {
      const isSelected = selectedRouteId === `PFL_${a.id}` || selectedRouteId === a.id;
      routes.push({
        id: `PFL_${a.id}`,
        name: `PFL Glide (${a.id})`,
        kind: 'pfl',
        color: '#38bdf8',
        visible: Boolean(isSelected || options?.layerPflPath),
        points: a.pflRoute.points,
        path: a.pflRoute.points,
      });
    }
  }
  const trails = Object.create(null); // keyed by callsign: a callsign like __proto__ is an ordinary key here
  for (const a of state.aircraft ?? []) trails[a.id] = typeof trailOf === 'function' ? trailOf(a.id) : [];
  return { routes, selectedRouteId, aircraft: state.aircraft ?? [], conflicts: state.conflicts, trails, legs: legMarks(setup.routes), windFromDeg, windKt, t: state.t };
}
