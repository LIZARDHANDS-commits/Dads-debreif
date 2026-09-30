// Where the map's layers go, in map feet (x east, y north), as plain values
// tested in Node against V6's constants. Headings are radians, 0 = east,
// counter-clockwise (flight-data's headingAt, as V6's headingAtTrack); a null
// heading means the ship isn't moving, so nothing that needs a nose is drawn
// (SPEC-debrief: Unknown heading).
import { trackRuns } from '../state.js';

/** V6's "Last 60 sec" trail (line 3027). */
export const TRAIL_WINDOW_S = 60;
/** Half-length of a 3/9 line either side of the ship (V6 line 2782): off any screen. */
export const LINE_39_HALF_FT = 250_000;
/** V6's fighting-wing window behind Lead (lines 2816-2819): 500 to 1,000 ft, 30° to 60° off the tail. */
export const CONE = Object.freeze({ innerFt: 500, outerFt: 1000, fromDeg: 30, toDeg: 60 });
const CONE_STEPS = 28;
/** The bubble radius box's limits (V6 line 2995 took any number from 50 ft; its default, 500 ft, is in LAYOUT_DEFAULTS). */
export const BUBBLE_MIN_FT = 50;
export const BUBBLE_MAX_FT = 10_000;

/**
 * The parts of a track to draw for a trail mode (V6 line 3027): 'full', the
 * whole flight; 'history', up to t; 'window', the last 60 s up to t. Still
 * broken at GPS gaps. Fixes are in time order, so the ends are found by
 * binary search rather than a pass over every fix.
 */
export function trailRuns(fixes, mode, t) {
  if (mode === 'full') return trackRuns(fixes);
  const from = mode === 'window' ? t - TRAIL_WINDOW_S : -Infinity;
  return trackRuns(fixes.slice(firstAtOrAfter(fixes, from), firstAtOrAfter(fixes, t, true)));
}

// The index of the first fix at or after t (after t when `past`).
function firstAtOrAfter(fixes, t, past = false) {
  let lo = 0;
  let hi = fixes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (past ? fixes[mid].t <= t : fixes[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Every pair of ships with the horizontal distance between them (V6 line
 * 3030), lowest numbers first. A pair with a ship in a GPS gap has no number,
 * as in the readouts (D32).
 */
export function spacingPairs(ships) {
  const sorted = [...ships].sort((a, b) => a.slot - b.slot);
  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const gap = Boolean(a.inGap || b.inGap);
      pairs.push({ a, b, ft: gap ? null : Math.hypot(a.xFt - b.xFt, a.yFt - b.yFt) });
    }
  }
  return pairs;
}

/** The two ends of a ship's 3/9 line (V6 drawKml39Line), or null with no heading. */
export function line39(ship, hdg) {
  if (hdg == null || !Number.isFinite(hdg)) return null;
  const rx = Math.cos(hdg + Math.PI / 2);
  const ry = Math.sin(hdg + Math.PI / 2);
  return [
    [ship.xFt - rx * LINE_39_HALF_FT, ship.yFt - ry * LINE_39_HALF_FT],
    [ship.xFt + rx * LINE_39_HALF_FT, ship.yFt + ry * LINE_39_HALF_FT],
  ];
}

/**
 * The fighting-wing windows behind Lead (V6 drawKmlFightingWingCone), one
 * closed outline per side: the outer arc, then the inner arc back. Each comes
 * with a place for its label. Null with no heading (V6 used due east).
 */
export function coneOutlines(lead, hdg) {
  if (hdg == null || !Number.isFinite(hdg)) return null;
  const rad = Math.PI / 180;
  const tail = hdg + Math.PI;
  return [-1, 1].map((side) => {
    const start = tail + side * CONE.fromDeg * rad;
    const end = tail + side * CONE.toDeg * rad;
    const at = (a, r) => [lead.xFt + Math.cos(a) * r, lead.yFt + Math.sin(a) * r];
    const points = [];
    for (let i = 0; i <= CONE_STEPS; i++) points.push(at(start + ((end - start) * i) / CONE_STEPS, CONE.outerFt));
    for (let i = CONE_STEPS; i >= 0; i--) points.push(at(start + ((end - start) * i) / CONE_STEPS, CONE.innerFt));
    return { points, labelAt: at((start + end) / 2, (CONE.innerFt + CONE.outerFt) / 2) };
  });
}
