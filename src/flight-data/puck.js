// GPS puck (DB-23; Dad's ask, 10 Oct 2026): a track's positions are where the portable GPS (a ForeFlight Sentry or
// similar "puck") sat, not the aircraft's reference point. movePuck moves every fix from the puck to the reference
// point, given where the puck sits in the aircraft. Pure: the caller says where the puck is (the Debrief takes it off
// the CT-156 cockpit model) and applies it once, on the cleaned fixes, before the gap fill.
//
// Heading only, not bank and pitch (the spec's "GPS puck" section has the numbers): turning a puck offset of a few feet
// by bank or pitch changes it by under 2 ft, below the GPS's own scatter, and would feed the track-estimated bank into
// positions.
import { localFtToLatLon } from '../core/geo.js';
import { FT_PER_M, FTPS_TO_KT } from '../core/units.js';
import { smoothAt } from './gap-fill.js';
import { STILL_KT } from './flight.js';

/**
 * Each fix's heading in radians (0 = east, counter-clockwise) from the smooth curve through the fixes (the cockpit
 * view's), or null when no fix moves. While the aircraft is still (under STILL_KT) the last moving heading is kept;
 * before it first moves, the first moving heading is used.
 */
function fixHeadings(track) {
  const f = track.fixes;
  const out = f.map((fx) => {
    const v = smoothAt(track, fx.t);
    return v && Math.hypot(v.vx, v.vy) * FTPS_TO_KT >= STILL_KT ? Math.atan2(v.vy, v.vx) : null;
  });
  const first = out.find((h) => h !== null) ?? null;
  let last = first;
  return out.map((h) => (h === null ? last : (last = h)));
}

/**
 * The track with every fix moved from the puck to the aircraft's reference point: reference = puck − offset turned to
 * the fix's heading, and the offset's height taken off. `ref` is the flight's map origin (buildFlight's), so latitude
 * and longitude follow the moved map feet. `offsetFt` is { x (forward), y (left), z (up) } feet of the puck from the
 * reference point, in the aircraft's axes. Times, gaps and everything else on a fix stay as they were; the track gains
 * `puck: { offsetFt }`.
 */
export function movePuck(track, ref, offsetFt) {
  const { x: ox = 0, y: oy = 0, z: oz = 0 } = offsetFt ?? {};
  const hdgs = fixHeadings(track);
  const fixes = track.fixes.map((fx, i) => {
    const h = hdgs[i];
    const dx = h === null ? 0 : ox * Math.cos(h) - oy * Math.sin(h);
    const dy = h === null ? 0 : ox * Math.sin(h) + oy * Math.cos(h);
    const xFt = fx.xFt - dx;
    const yFt = fx.yFt - dy;
    const altFt = fx.altFt - oz;
    const { lat, lon } = localFtToLatLon(ref, xFt, yFt);
    return { ...fx, xFt, yFt, altFt, altM: altFt / FT_PER_M, lat, lon };
  });
  return { ...track, fixes, puck: { offsetFt: { x: ox, y: oy, z: oz } } };
}
