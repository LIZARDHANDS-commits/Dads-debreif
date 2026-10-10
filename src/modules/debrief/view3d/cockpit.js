// The Cockpit camera's ridden ship (DB-21; Dad's ask, 10 Oct 2026): where it is and how it sits at any moment, smooth
// enough to ride, and the numbers its instrument panel shows. Plain values, no page access.
//
// The attitude is worked out once per ship (when first ridden) at each fix's time, then joined smoothly between the
// seconds (a cubic Hermite through the table, gap-fill.js hermite), so the horizon doesn't twitch at each fix as a
// heading read off one pair of fixes would. Nothing else is smoothed (aligned with DB-Q4). Position is the smooth curve
// through the fixes (gap-fill.js smoothAt).
//   heading: the ground track; with a model wind, the nose along the air velocity (ground velocity less the wind), so
//            the crab shows;
//   bank:    the readouts' (shipBank: recorded first, else the turn over ±1.5 s, DB-8), left wing down positive;
//   pitch:   core attitudeDegFromClimb with the climb over ±1.5 s, true airspeed from the air velocity and est. IAS from
//            it (the readouts' estIasWithWindKt), turn G = 1 / cos(bank) (DB-Q17);
//   panel:   those numbers, GPS altitude (not pressure altitude), and the readouts' believed est. G or dashes.
// In a GPS gap: with the fill on, the fill's own estimates; with it off, the straight line between the fixes, wings
// level, and a panel of dashes (DB-9).
import { sampleAt, headingAt, pitchAt, STILL_KT } from '../../../flight-data/flight.js';
import { GAP_S } from '../../../flight-data/clean.js';
import { hermite, smoothAt, fillAt, fillSampleAt } from '../../../flight-data/gap-fill.js';
import { attitudeDegFromClimb } from '../../../core/t6-performance.js';
import { gFromBankDeg } from '../../../core/flight-math.js';
import { windVectorFtps } from '../../../core/wind.js';
import { wrapPi, headingRadToCompassDeg } from '../../../core/angles.js';
import { KT_TO_FTPS, FTPS_TO_KT } from '../../../core/units.js';
import { shipBank, believedEstimatedG, estIasWithWindKt, TURN_WINDOW_S } from '../readouts.js';

/** What the cockpit's caption always says, and what it adds in a gap (DB-21, DB-9). */
export const COCKPIT_CAPTION = Object.freeze({
  always: 'attitude estimated from the GPS track',
  gap: 'GPS gap',
  filled: 'GPS gap: estimated path',
  altitude: 'altimeter shows GPS altitude',
});

/**
 * The attitude table of one track at its fix times: [{ t, nose (radians, unwrapped along the table), bankDeg,
 * pitchDeg, kias, g }]. wind(t, altFt): the model wind as { dirDeg, kt } (true "from", knots) or null.
 */
export function attitudeTable(track, wind = null) {
  const f = track.fixes;
  const rows = [];
  let lastNose = null;
  for (let i = 0; i < f.length; i++) {
    const t = f[i].t;
    const s = sampleAt(track, t);
    const v = smoothAt(track, t);
    const gsFtps = Math.hypot(v.vx, v.vy);
    const w = wind ? wind(t, s.altFt) : null;
    const W = w ? windVectorFtps(w.dirDeg, w.kt) : { x: 0, y: 0 };
    const moving = gsFtps * FTPS_TO_KT >= STILL_KT;
    const track0 = moving ? Math.atan2(v.vy, v.vx) : headingAt(track, t);
    let nose = moving ? Math.atan2(v.vy - W.y, v.vx - W.x) : track0 ?? lastNose ?? 0;
    if (lastNose !== null) nose = lastNose + wrapPi(nose - lastNose); // unwrapped, so the table joins the short way
    lastNose = nose;
    const gsKt = gsFtps * FTPS_TO_KT;
    const kias = moving ? estIasWithWindKt(gsKt, track0, s.altFt, w) : 0;
    const tasFtps = Math.hypot(v.vx - W.x, v.vy - W.y);
    const before = sampleAt(track, Math.max(f[0].t, t - TURN_WINDOW_S));
    const after = sampleAt(track, Math.min(f[f.length - 1].t, t + TURN_WINDOW_S));
    const climbFtps = after.t > before.t ? (after.altFt - before.altFt) / (after.t - before.t) : 0;
    const bank = shipBank(track, t, { sample: s, pitchDeg: pitchAt(track, t).deg, iasKt: kias });
    const g = gFromBankDeg(bank.bankDeg);
    rows.push({
      t,
      nose,
      bankDeg: bank.bankDeg,
      pitchDeg: moving ? attitudeDegFromClimb(climbFtps, Math.max(tasFtps, 1), kias, g) : 0,
      kias,
      g: believedEstimatedG(track, t, { gsKt: s.speedKt, iasKt: kias }),
    });
  }
  return rows;
}

/** A table row's value of `key` between rows i and i + 1 at time t, on a Hermite curve with each row's slope from its neighbours. */
function smoothRow(rows, i, key, t) {
  const slope = (j) => {
    const a = rows[Math.max(0, j - 1)], b = rows[Math.min(rows.length - 1, j + 1)];
    const ok = (r) => Math.abs(r.t - rows[j].t) <= GAP_S;
    const lo = ok(a) ? a : rows[j], hi = ok(b) ? b : rows[j];
    const v = (r) => r[key] ?? rows[j][key];
    return hi.t > lo.t ? (v(hi) - v(lo)) / (hi.t - lo.t) : 0;
  };
  const a = rows[i], b = rows[i + 1];
  if (!Number.isFinite(a[key]) || !Number.isFinite(b[key])) return Number.isFinite(a[key]) ? a[key] : b[key];
  return hermite(a[key], slope(i), b[key], slope(i + 1), b.t - a.t, t - a.t).value;
}

/** Index of the row at or before t. */
function rowAt(rows, t) {
  let lo = 0, hi = rows.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The ridden ship at time t: { x, y, altFt, hdg (the nose, radians), bankDeg (left wing down positive), pitchDeg,
 * panel (createCt156Cockpit update's hud, or null for dashes), gap (null, 'gap' or 'filled') }.
 * rows: attitudeTable(track, wind). fill: the gap fill covering t (gap-fill.js fillAt), or null.
 */
export function rideAt(track, rows, t, fill = null) {
  const s = sampleAt(track, t);
  if (s.inGap) {
    if (fill) {
      const e = fillSampleAt(fill, t);
      const pitchDeg = fill.method === 'ground' ? 0 : attitudeDegFromClimb(e.climbFtps, Math.max(e.tasKt * KT_TO_FTPS, 1), e.kias, e.g);
      return {
        x: e.xFt, y: e.yFt, altFt: e.altFt, hdg: e.noseHdg, bankDeg: e.bankDeg, pitchDeg, gap: 'filled',
        panel: { pitchDeg, bankDeg: -e.bankDeg, altFt: e.altFt, g: e.g, kias: e.kias, headingDeg: headingRadToCompassDeg(e.noseHdg) },
      };
    }
    // The straight line between the fixes, wings level: the position is a guess (DB-9).
    const hdg = headingAt(track, t) ?? 0;
    return { x: s.xFt, y: s.yFt, altFt: s.altFt, hdg, bankDeg: 0, pitchDeg: 0, gap: 'gap', panel: null };
  }
  const p = smoothAt(track, t);
  const n = rows.length;
  const row = (key) => {
    if (n < 2 || t <= rows[0].t) return rows[0]?.[key] ?? 0;
    if (t >= rows[n - 1].t) return rows[n - 1][key];
    return smoothRow(rows, rowAt(rows, t), key, t);
  };
  const nose = row('nose');
  const bankDeg = row('bankDeg');
  const pitchDeg = row('pitchDeg');
  const kias = row('kias');
  const g = row('g');
  return {
    x: p.xFt, y: p.yFt, altFt: p.altFt, hdg: wrapPi(nose), bankDeg, pitchDeg, gap: null,
    panel: { pitchDeg, bankDeg: -bankDeg, altFt: p.altFt, g: Number.isFinite(g) ? g : NaN, kias, headingDeg: headingRadToCompassDeg(wrapPi(nose)) },
  };
}

/**
 * Keeps one attitude table per ship for a flight and wind, made when the ship is first ridden. at(slot, t, fills)
 * gives rideAt's answer; fills is gap-fill.js fillGaps's `fills` while the fill is on, else null.
 */
export function createRide() {
  let key = null;
  const tables = new Map();
  return {
    at(flight, slot, t, { wind = null, windKey = '', fills = null } = {}) {
      const track = flight?.tracks[slot];
      if (!track) return null;
      if (key?.flight !== flight || key.windKey !== windKey) {
        tables.clear();
        key = { flight, windKey };
      }
      if (!tables.has(slot)) tables.set(slot, attitudeTable(track, windKey ? wind : null));
      return rideAt(track, tables.get(slot), t, fillAt(fills?.[slot], t));
    },
  };
}
