// Cleans a track read by kml.js before it is shown: drops fixes no aircraft
// could have flown (C3) and finds the gaps in what is left (C4), both D32. V6 drew every fix it read, so ForeFlight's
// −100,000 m "no altitude" value put #2 at −328,084 ft and GPS glitches showed
// speeds over 1,000 kt.
//
// The rule and what it does to the real tracks are in specs/SPEC-flight-data.md
// (Data quality). The numbers are here, in one place.
import { KmlError } from './kml.js';
import { FTPS_TO_KT, FT_PER_M, EARTH_RADIUS_M } from '../core/units.js';

/** Feet per degree of latitude (core's flat-map scale, geo.js). */
const FT_PER_DEG = Math.PI / 180 * EARTH_RADIUS_M * FT_PER_M;

/** Lowest and highest believable altitude, in metres. */
export const MIN_ALT_M = -500;
export const MAX_ALT_M = 20_000;
/** Faster than this over the ground (knots) is a GPS jump, not flight. */
export const MAX_GROUND_SPEED_KT = 450;
/** The longest run of bad fixes dropped as one jump. */
export const MAX_JUMP_FIXES = 5;
/** More than this many seconds between good fixes is a gap in the GPS track. */
export const GAP_S = 5;
/** Speeds are measured over at least this long, so fixes logged 0.5 s apart don't look fast. */
export const MIN_SPEED_TIME_S = 1;

/**
 * Returns { name, fixes, dropped: { altitude, position, jump }, gaps }: the
 * track without impossible fixes, how many were dropped for each reason, and
 * each stretch of more than GAP_S seconds without a fix as { fromT, toT }. The
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
    // Each pair's distance is measured on a flat map centred between them, so
    // a wild first fix can't distort every other distance.
    const reachable = (a, b) => {
      const p = possible[a];
      const q = possible[b];
      const xFt = (q.lon - p.lon) * Math.cos((p.lat + q.lat) / 2 * Math.PI / 180) * FT_PER_DEG;
      const yFt = (q.lat - p.lat) * FT_PER_DEG;
      const s = Math.max(q.t - p.t, MIN_SPEED_TIME_S);
      return Math.hypot(xFt, yFt) / s * FTPS_TO_KT <= MAX_GROUND_SPEED_KT;
    };
    // A glitch on the first fixes: a run of up to MAX_JUMP_FIXES that the
    // next fix can't be reached from, followed by more fixes that agree with
    // each other than the run is allowed to be long.
    const agree = s => {
      for (let j = s; j <= s + MAX_JUMP_FIXES; j++) if (!reachable(j, j + 1)) return false;
      return true;
    };
    let first = 0;
    for (let s = 1; s <= MAX_JUMP_FIXES && s + MAX_JUMP_FIXES + 1 < possible.length; s++) {
      if (!reachable(s - 1, s) && !reachable(0, s) && agree(s)) {
        first = s;
        break;
      }
    }
    dropped.jump += first;
    let last = first;
    fixes.push(possible[first]);
    for (let i = first + 1; i < possible.length; i++) {
      if (!reachable(last, i)) {
        // A jump if the aircraft is back where it could be within the next few
        // fixes, or if the track ends within them (a glitch on the last fixes).
        const end = Math.min(i + MAX_JUMP_FIXES, possible.length - 1);
        let back = i + 1;
        while (back <= end && !reachable(last, back)) back++;
        if (back <= end) {
          dropped.jump += back - i;
          i = back;
        } else if (i + MAX_JUMP_FIXES > possible.length - 1) {
          dropped.jump += possible.length - i;
          break;
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
  return { name: raw.name, fixes, dropped, gaps: findGaps(fixes) };
}

/**
 * Each stretch of more than GAP_S seconds between two fixes, as { fromT, toT }. Fixes in time order. Used by cleanTrack
 * and again whenever a track's times change (timing.js retimeFlight).
 */
export function findGaps(fixes) {
  const gaps = [];
  for (let i = 1; i < fixes.length; i++) {
    if (fixes[i].t - fixes[i - 1].t > GAP_S) gaps.push({ fromT: fixes[i - 1].t, toT: fixes[i].t });
  }
  return gaps;
}
