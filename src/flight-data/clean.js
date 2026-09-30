// Cleans a track read by kml.js before it is shown: drops fixes no aircraft
// could have flown (C3, D32). V6 drew every fix it read, so ForeFlight's
// −100,000 m "no altitude" value put #2 at −328,084 ft and GPS glitches showed
// speeds over 1,000 kt.
//
// The rule and what it does to the real tracks are in specs/SPEC-flight-data.md
// (Data quality). The numbers are here, in one place.
import { KmlError } from './kml.js';
import { makeLocalRef, latLonToLocalFt } from '../core/geo.js';
import { FTPS_TO_KT } from '../core/units.js';

/** Lowest and highest believable altitude, in metres. */
export const MIN_ALT_M = -500;
export const MAX_ALT_M = 20_000;
/** Faster than this over the ground (knots) is a GPS jump, not flight. */
export const MAX_GROUND_SPEED_KT = 450;
/** The longest run of bad fixes dropped as one jump. */
export const MAX_JUMP_FIXES = 5;
/** Speeds are measured over at least this long, so fixes logged 0.5 s apart don't look fast. */
export const MIN_SPEED_TIME_S = 1;

/**
 * Returns { name, fixes, dropped: { altitude, position, jump } }: the track
 * without impossible fixes, and how many were dropped for each reason. The
 * fixes kept are the same objects, in the same order. Throws a KmlError if
 * fewer than 2 fixes are left.
 */
export function cleanTrack(raw) {
  const dropped = { altitude: 0, position: 0, jump: 0 };
  const possible = [];
  for (const f of raw.fixes) {
    if (!(Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180)) dropped.position++;
    else if (!(f.altM >= MIN_ALT_M && f.altM <= MAX_ALT_M)) dropped.altitude++;
    else possible.push(f);
  }

  const fixes = [];
  if (possible.length) {
    const ref = makeLocalRef(possible[0].lat, possible[0].lon);
    const at = possible.map(f => latLonToLocalFt(ref, f.lat, f.lon));
    const reachable = (a, b) => {
      const ft = Math.hypot(at[b].x - at[a].x, at[b].y - at[a].y);
      const s = Math.max(possible[b].t - possible[a].t, MIN_SPEED_TIME_S);
      return ft / s * FTPS_TO_KT <= MAX_GROUND_SPEED_KT;
    };
    let last = 0;
    fixes.push(possible[0]);
    for (let i = 1; i < possible.length; i++) {
      if (!reachable(last, i)) {
        // A jump if the aircraft is back where it could be within the next few fixes.
        const end = Math.min(i + MAX_JUMP_FIXES, possible.length - 1);
        let back = i + 1;
        while (back <= end && !reachable(last, back)) back++;
        if (back <= end) {
          dropped.jump += back - i;
          i = back;
        }
      }
      fixes.push(possible[i]);
      last = i;
    }
  }
  if (fixes.length < 2) {
    const name = raw.name ? `"${String(raw.name).slice(0, 80)}"` : 'This file';
    throw new KmlError('no-fixes', `${name} has fewer than 2 believable positions (the rest are off the map, underground or impossibly fast).`);
  }
  return { name: raw.name, fixes, dropped };
}
