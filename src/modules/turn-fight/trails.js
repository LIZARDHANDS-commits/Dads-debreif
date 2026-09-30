// The trails both views draw: a point for each aircraft every 0.1 s of fight
// time, kept apart from the fight itself so sim.js stays exactly V6's and a
// later 3D view or graph can read the same points (SPEC-turn-fight, "The
// drawing"). V6 kept one point per screen frame, so its trails grew without
// limit and depended on the frame rate.
//
// A point is { timeSec, xFt, yFt, zFt }: feet, the fight's own axes (sim.js).

/** Seconds of fight time between trail points. */
export const TRAIL_INTERVAL_SEC = 0.1;

/** Whole fight steps between trail points (0.1 s is five steps of 0.02 s). */
export const TRAIL_EVERY_STEPS = 5;

const point = (timeSec, p) => ({ timeSec, xFt: p.xFt, yFt: p.yFt, zFt: p.zFt });

/** Trails that start with both aircraft's places at the fight's current time (T+0 for a new fight). */
export function createTrails(fight) {
  const trails = {
    blue: [],
    red: [],
    // The reach of every point so far, kept as they are added so drawing never scans the trail.
    extent: { minXFt: Infinity, maxXFt: -Infinity, maxAbsFt: 0, maxAbsZFt: 0 },
  };
  addTrailPoints(trails, fight);
  return trails;
}

/** Adds one point for each aircraft, where they are now. */
export function addTrailPoints(trails, fight) {
  const { extent } = trails;
  for (const who of ['blue', 'red']) {
    const p = point(fight.timeSec, fight[who]);
    trails[who].push(p);
    extent.minXFt = Math.min(extent.minXFt, p.xFt);
    extent.maxXFt = Math.max(extent.maxXFt, p.xFt);
    extent.maxAbsFt = Math.max(extent.maxAbsFt, Math.abs(p.xFt), Math.abs(p.yFt));
    extent.maxAbsZFt = Math.max(extent.maxAbsZFt, Math.abs(p.zFt));
  }
}
