// The words and numbers the Traffic screen shows (SPEC-traffic, "Readouts"): the sim
// clock, the aircraft rows, the conflict and caution lines, leg distances, point data
// and turn data. Every number is rounded the way V6 rounds it (Math.round, and toFixed
// for NM and G), so the screen reads the same as V6's tables and map labels; the golden
// test tests/golden/traffic-readouts.test.js compares them with V6's own text. Line
// numbers below refer to V6's decoded Traffic page.
//
// These are the words for the tables and lists, pinned to V6's own text. The map keeps
// the spec's own style ("1,880 ft 100 kt", map2d.js) and takes its numbers from the
// route functions (`legDistances`, `pointTurn`), not from these strings.
//
// Pure: it takes what `sim.state()` and a route give it and returns plain text and
// numbers. It touches no page, so it is tested in Node, and the screen puts the text
// on the page with textContent.
import { DEFAULT_ROUTE_OPTIONS, legDistances, pointTurn, turnAtPoint } from './route.js';

/** What the Conflicts list says when it has no lines (V6 `updatePanels`, line 463). */
export const noConflictsText = 'No conflicts.';

// ── Times ────────────────────────────────────────────────────────────────────

/**
 * Hours, minutes and seconds of a time in seconds, the way V6's clock takes them
 * (line 461): the fraction is dropped, so 59.999 s is still 59 s. A time that is not
 * a time counts as 0.
 */
function clockParts(tSec) {
  const ms = Number.isFinite(tSec) && tSec > 0 ? Math.trunc(tSec * 1000) : 0;
  const whole = Math.floor(ms / 1000);
  return { hours: Math.floor(whole / 3600), minutes: Math.floor(whole / 60) % 60, seconds: whole % 60 };
}

const two = (n) => String(n).padStart(2, '0');

/**
 * The sim clock, H:MM:SS ("0:12:40"). V6 shows MM:SS and wraps to 00:00 after an hour
 * (bug #46); this goes on counting. The minutes and seconds are V6's.
 */
export function clockText(tSec) {
  const { hours, minutes, seconds } = clockParts(tSec);
  return `${hours}:${two(minutes)}:${two(seconds)}`;
}

/** A start time as the aircraft list shows it: M:SS ("2:17"), and H:MM:SS from an hour on. */
export function startTimeText(tSec) {
  const { hours, minutes, seconds } = clockParts(tSec);
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

// ── Aircraft and conflicts ───────────────────────────────────────────────────

const STATUS_TEXT = { flying: 'Flying', waiting: 'Waiting', landed: 'Landed', done: 'Done' };

/**
 * One row per aircraft in `state` (from `sim.state()`), in the same order. V6's table
 * has the columns AC, Type, Route, Leg, Alt, KT and Status (`updatePanels`, line 462);
 * `cells` is those seven as text. `startsText` says "starts at 2:17" while an aircraft
 * is waiting and is empty otherwise. `labelText` is the map label of the aircraft
 * (line 296). An aircraft on a route that is no longer in `setup.routes` is shown on
 * the first route, as V6 does.
 */
export function aircraftRows(state, setup) {
  const routes = setup?.routes ?? [];
  return state.aircraft.map((a) => {
    const routeName = (routes.find((r) => r.id === a.routeId) ?? routes[0])?.name ?? '';
    const altFt = Math.round(a.alt), kt = Math.round(a.kt);
    const statusText = a.engineFailed
      ? 'ENG FAIL'
      : a.command === 'breakout'
        ? 'Breakout'
        : a.command === 'go_around'
          ? 'Go-around'
          : STATUS_TEXT[a.status] || a.status;
    return {
      id: a.id, type: a.type, color: a.color, routeName, routeId: a.routeId, leg: a.leg, altFt, kt, status: a.status, statusText,
      engineFailed: Boolean(a.engineFailed), command: a.command ?? null,
      startsText: a.status === 'waiting' ? `starts at ${startTimeText(a.startsAt)}` : '',
      labelText: `${altFt}ft ${kt}kt ${routeName}`,
      cells: [a.id, a.type, routeName, String(a.leg), String(altFt), String(kt), statusText],
    };
  });
}

/**
 * The lines of the Conflicts list, one for each pair in `state.conflicts` (V6 line 463):
 * "⚠ CONFLICT A2/A5: 180 ft lat, 120 ft vert" or "△ CAUTION …". The symbol and the word
 * tell them apart, so colour is never the only signal. No lines means show `noConflictsText`.
 */
export function conflictLines(state) {
  return state.conflicts.map((c) => ({
    level: c.level, a: c.a, b: c.b,
    text: `${c.level === 'conflict' ? '⚠ CONFLICT' : '△ CAUTION'} ${c.a}/${c.b}: ${Math.round(c.latFt)} ft lat, ${Math.round(c.vertFt)} ft vert`,
  }));
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * The legs of a route for the Leg distances table (V6 line 464) and the leg labels on the
 * map (line 282): `leg` is "1→2" (a pattern's last is "4→1"), `ftText` whole feet, `nmText`
 * NM to two places, `labelText` "6076 ft". `ft` and `nm` are the exact numbers, and
 * `routeId`, `x` and `y` (the middle of the leg, feet) come from `legDistances`.
 */
export function legDistanceRows(route) {
  return legDistances(route).map((leg) => ({
    leg: `${leg.from}→${leg.to}`, routeId: leg.routeId, from: leg.from, to: leg.to, ft: leg.ft, nm: leg.nm, x: leg.x, y: leg.y,
    ftText: String(Math.round(leg.ft)), nmText: leg.nm.toFixed(2), labelText: `${Math.round(leg.ft)} ft`,
  }));
}

/** A route point's height, speed and G as the map labels it: "2500ft/120kt/2.0G" (V6 line 283). */
export function pointDataText(point) {
  return `${Math.round(point.alt)}ft/${Math.round(point.kt)}kt/${(+point.g).toFixed(1)}G`;
}

/**
 * The turn a route point makes: "R 736ft / bank 60°" (V6 line 283). The radius is the one
 * the route options give (from the point's speed and G, or the manual radius) and the bank
 * is what the point's G gives. V6 reads a blank speed as 120 kt and a blank G as 2 G, and
 * limits G to 1.01 to 9.
 */
export function turnDataText(point, options = DEFAULT_ROUTE_OPTIONS) {
  return turnText(turnAtPoint(point, options));
}

const turnText = ({ radiusFt, bankDeg }) => `R ${Math.round(radiusFt)}ft / bank ${Math.round(bankDeg)}°`;

/**
 * The text for each point of a route, in order: `titleText` ("Pattern 1 6 Downwind"),
 * `dataText` and `turnText`. V6 shows turn data at every point but the first of a pattern,
 * and at every point but the first and last of an entry or split (bug #49, kept for now);
 * `turnText` is empty where it shows none.
 */
export function pointRows(route, options = DEFAULT_ROUTE_OPTIONS) {
  return route.points.map((point, i) => {
    const turn = pointTurn(route, i, options);
    return {
      number: i + 1,
      titleText: `${route.name} ${i + 1} ${point.label || ''}`,
      dataText: pointDataText(point),
      turnText: turn ? turnText(turn) : '',
    };
  });
}
