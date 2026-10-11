// The ground the 3D view draws, from the loaded tracks themselves (DB-26; Dad, 10 Oct 2026: "the ground line seems off in 3D, the aircraft
// almost sit below the green 3D terrain"). Plain values, tested in Node; view.js draws them.
//
// Why: the tracks' heights are the GPS's (MSL) and a field's published elevation is its highest point, surveyed; on the example flight the
// four ships parked and taxiing read about 1,874 ft at Moose Jaw against its published 1,892 ft, so with the ground at 1,892 ft every
// aircraft sat 20 ft or so under it. The ground is put where the tracks say it is instead: the median height of every fix taken on the
// ground (moving slower than the gap fill's groundKt, 40 kt, over a step of at most GROUND_STEP_MAX_S), less the height of the model's
// wheels under its origin, so a parked aircraft's wheels sit on it. With too few ground fixes (a track that starts and ends in the air)
// the home field's elevation is used, as before.
//
// The runways are moved by the same amount: the field the ground fixes sit at (the nearest in the runway list, within FIELD_MATCH_NM) is
// drawn at the tracks' ground, and every other field at its own elevation shifted by the same difference. The difference is the receivers'
// height against the surveyed elevation, common to the whole flight, so this keeps every runway where the aircraft's own heights put it,
// and keeps the fields' heights against each other (flattening them all to one level would be wrong for a field hundreds of feet higher).
// For a picture only: no number, verdict or readout uses this ground.
import { CT156_REFERENCE_POINTS, CT156_LENGTH_FT, CT156_UNIT_LENGTH } from '../../../ui-kit/ct156-model.js';
import { GAP_FILL } from '../../../flight-data/gap-fill.js';
import { FTPS_TO_KT, FT_PER_NM } from '../../../core/units.js';

/**
 * The model's fin top above its wheels, feet: the CT-156 model is scaled off Patrick's side-on photo of 156101, on which the fin top sits
 * 10.6 ft above the wheels (ct156-model.js; the published T-6A height is 10.7 ft).
 */
export const FIN_TOP_ABOVE_WHEELS_FT = 10.6;
/**
 * How far the wheels sit under the model's origin (the reference point a track's position stands for), feet: the fin top's height above
 * the origin on the model, taken from the fin top's height above the wheels. About 6.2 ft. An estimate (the model has no landing gear).
 */
export const WHEELS_BELOW_ORIGIN_FT = FIN_TOP_ABOVE_WHEELS_FT - CT156_REFERENCE_POINTS.finTop[2] * (CT156_LENGTH_FT / CT156_UNIT_LENGTH);
/** A step between two fixes longer than this (seconds) is a gap, not slow movement: the Debrief's 5 s hole (DB-Q6). */
export const GROUND_STEP_MAX_S = 5;
/** At least this many ground fixes before the tracks' ground is trusted (an estimate: half a minute of taxiing for one ship). */
export const GROUND_MIN_FIXES = 30;
/** The field the ground fixes sit at is the nearest in the runway list within this distance of their middle, NM (an estimate). */
export const FIELD_MATCH_NM = 3;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const median = (list) => {
  const s = [...list].sort((p, q) => p - q);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ftWords = (v) => `${Math.round(v).toLocaleString('en-US')} ft`;

/**
 * Every fix of the flight taken on the ground: { altFt (median height), x, y (the fixes' median place, map feet), fixes (how many) }, or
 * null with fewer than GROUND_MIN_FIXES. A fix is on the ground when its ground speed from the fix before is under GAP_FILL.groundKt and
 * that step is GROUND_STEP_MAX_S or shorter. Reads the flight as the views get it (timestamps snapped, GPS puck moved).
 */
export function trackGround(flight) {
  const alts = [];
  const xs = [];
  const ys = [];
  for (const tr of Object.values(flight?.tracks ?? {})) {
    const f = tr.fixes ?? [];
    for (let i = 1; i < f.length; i++) {
      const a = f[i - 1];
      const b = f[i];
      const dt = b.t - a.t;
      if (!(dt > 0 && dt <= GROUND_STEP_MAX_S) || ![a.xFt, a.yFt, b.xFt, b.yFt, b.altFt].every(isNum)) continue;
      if (Math.hypot(b.xFt - a.xFt, b.yFt - a.yFt) / dt * FTPS_TO_KT >= GAP_FILL.groundKt) continue;
      alts.push(b.altFt);
      xs.push(b.xFt);
      ys.push(b.yFt);
    }
  }
  if (alts.length < GROUND_MIN_FIXES) return null;
  return { altFt: median(alts), x: median(xs), y: median(ys), fixes: alts.length };
}

/**
 * The ground the 3D view draws and how the runways move to match. `fieldFt` is the home field's elevation (the fallback); `airports` the
 * runway list (airports-data.js entries) and `toXY(lat, lon)` gives [x, y] in the flight's map feet.
 * Returns { groundFt, source: 'tracks' | 'field', trackFt, fixes, x, y, wheelsFt, field: { icao, elevationFt } | null, shiftFt, words }:
 * `shiftFt` is added to every field's elevation when the runways are drawn (0 when no field matches, or on the fallback); `x`, `y` are the ground fixes'
 * middle in map feet (null on the fallback), where the terrain is matched to the tracks (terrain.js, DB-27).
 * @param {any} flight
 * @param {{ fieldFt: number, airports?: readonly any[], toXY?: ((lat: number, lon: number) => number[]) | null }} options
 */
export function groundLevel(flight, { fieldFt, airports = [], toXY = null }) {
  const found = flight ? trackGround(flight) : null;
  if (!found) {
    return {
      groundFt: fieldFt, source: 'field', trackFt: null, fixes: 0, x: null, y: null, wheelsFt: 0, field: null, shiftFt: 0,
      words: `Ground ${ftWords(fieldFt)}, the home field's elevation (too few fixes on the ground in the tracks to read it from them).`,
    };
  }
  const groundFt = found.altFt - WHEELS_BELOW_ORIGIN_FT;
  let field = null;
  if (toXY) {
    let best = FIELD_MATCH_NM * FT_PER_NM;
    for (const a of airports) {
      if (!isNum(a?.elevationFt)) continue;
      for (const r of a.runways ?? []) {
        for (const end of [r.a, r.b]) {
          if (!isNum(end?.lat) || !isNum(end?.lon)) continue;
          const [x, y] = toXY(end.lat, end.lon);
          const d = Math.hypot(x - found.x, y - found.y);
          if (d < best) {
            best = d;
            field = { icao: a.icao, elevationFt: a.elevationFt };
          }
        }
      }
    }
  }
  const shiftFt = field ? groundFt - field.elevationFt : 0;
  const fieldWords = field
    ? ` ${field.icao} is ${ftWords(field.elevationFt)} in the runway data: every runway is drawn ${ftWords(Math.abs(shiftFt))} ${shiftFt < 0 ? 'lower' : 'higher'} than its field's elevation to match, so ${field.icao}'s lie on this ground.`
    : '';
  return {
    groundFt, source: 'tracks', trackFt: found.altFt, fixes: found.fixes, x: found.x, y: found.y, wheelsFt: WHEELS_BELOW_ORIGIN_FT, field, shiftFt,
    words: `Ground ${ftWords(groundFt)}, from the tracks: ${found.fixes.toLocaleString('en-US')} fixes on the ground read ${ftWords(found.altFt)}, less ${Math.round(WHEELS_BELOW_ORIGIN_FT)} ft to the wheels (estimate).${fieldWords}`,
  };
}
