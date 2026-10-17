// Altitude check (DB-28; Dad, 11 Oct 2026: "For the KML viewer can we also have an altitude assessment. Each aircraft should be taxiing
// on the same plane for sure on the taxiways and same with touch down, so that should help with the altitude error"). Each receiver's GPS
// height has its own error of a few to a few tens of feet, so four ships in close formation can read stacked when they were level. On the
// ground every aircraft sits on the same surface, so the ground fixes calibrate each ship: what a ship reads on the ground against what the
// others read on the same ground is its own error, and is taken off its whole track.
//
// How (the spec's "Altitude check" section, docs/modules/debrief/spec.md):
//  - ground fixes: a step from the fix before of GROUND_STEP_MAX_S or less, slower than the gap fill's groundKt (the one test, also used by
//    the 3D view's ground, DB-26); split at take-off and landing (the first and last steady run of fast steps) into START (taxi out, the
//    start of the take-off roll) and END (the end of the landing roll, taxi in);
//  - each ground fix is compared with a reference surface: the terrain height at its place (the caller's `refAt`, the shared height tiles),
//    so a sloping taxiway or runway counts; with no terrain, the lead ship's own ground fixes within ALTITUDE_CHECK.matchFt of it in the same
//    phase ('spots'); with neither, one flat level ('level');
//  - a ship's bias in a phase is the median of (GPS height - reference) over its fixes; between take-off and landing it is blended in a
//    straight line in time, constant outside them, and constant when only one phase has enough fixes;
//  - RELATIVE: what is taken off a ship is its bias less the mean of every ship's bias at that moment. The part all ships share (the GPS's
//    datum against the terrain data's, a few metres either way) cannot be told from the receivers' own errors and is left alone, so the
//    formation's mean height is exactly as recorded at every moment and only the differences between ships change. The 3D view's ground
//    (DB-26) is read after this, from the corrected fixes, so the wheels stay on it. A constant in the reference cancels, so neither the
//    terrain's datum nor the model's wheel height enters.
// Pure: numbers in, numbers out. Every threshold is an ESTIMATE (no manual gives one), named where it is set.
import { FT_PER_M, FTPS_TO_KT } from '../core/units.js';
import { GAP_FILL } from './gap-fill.js';

/** A step between two fixes longer than this (seconds) is a gap, not slow movement: the Debrief's 5 s hole (DB-Q6). */
export const GROUND_STEP_MAX_S = 5;

export const ALTITUDE_CHECK = Object.freeze({
  /** A phase (taxi out or taxi in) with fewer ground fixes than this is not used on its own (an estimate: ten seconds of taxiing). */
  minPhaseFixes: 10,
  /** A ship whose corrected offset changes by more than this between taxi out and taxi in is low confidence (an estimate). */
  driftFt: 30,
  /** 'spots' fallback: a lead fix this close (horizontally, feet) to a ship's ground fix stands for the same spot (an estimate). */
  matchFt: 100,
  /** Take-off and landing: the first and last run of at least this many fast steps in a row (an estimate: a take-off roll stays fast). */
  airborneRun: 10,
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const median = (list) => {
  const s = [...list].sort((p, q) => p - q);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Ground speed of the step from fix i - 1 to fix i (knots), or NaN when the step is not a short real step. */
function stepKt(fixes, i) {
  const a = fixes[i - 1];
  const b = fixes[i];
  const dt = b.t - a.t;
  if (!(dt > 0 && dt <= GROUND_STEP_MAX_S) || ![a.xFt, a.yFt, b.xFt, b.yFt].every(isNum)) return NaN;
  return Math.hypot(b.xFt - a.xFt, b.yFt - a.yFt) / dt * FTPS_TO_KT;
}

/**
 * Is fix i taken on the ground: its step from the fix before is GROUND_STEP_MAX_S or shorter and slower than GAP_FILL.groundKt (40 kt)?
 * The one test for a ground fix (the 3D view's ground, DB-26, reads it too). Fixes need t, xFt, yFt and altFt (placed by buildFlight).
 */
export function isGroundFix(fixes, i) {
  return i > 0 && isNum(fixes[i]?.altFt) && stepKt(fixes, i) < GAP_FILL.groundKt;
}

/**
 * A track's ground fixes split at take-off and landing: { start, end, takeoffT, landingT }. Take-off is the first fix of the first run of
 * at least ALTITUDE_CHECK.airborneRun fast steps (40 kt or more), landing the last fix of the last such run. A track with no such run (parked
 * or taxiing only) has all its ground fixes in `start` and null times. Ground fixes between take-off and landing (a full stop elsewhere) are
 * in neither.
 */
export function groundPhases(track) {
  const f = track?.fixes ?? [];
  const runs = [];
  let from = -1;
  for (let i = 1; i <= f.length; i++) {
    const fast = i < f.length && stepKt(f, i) >= GAP_FILL.groundKt;
    if (fast && from < 0) from = i;
    if (!fast && from >= 0) {
      if (i - from >= ALTITUDE_CHECK.airborneRun) runs.push([from, i - 1]);
      from = -1;
    }
  }
  const takeoffT = runs.length ? f[runs[0][0]].t : null;
  const landingT = runs.length ? f[runs[runs.length - 1][1]].t : null;
  const start = [];
  const end = [];
  for (let i = 1; i < f.length; i++) {
    if (!isGroundFix(f, i)) continue;
    if (takeoffT === null || f[i].t < takeoffT) start.push(f[i]);
    else if (f[i].t > landingT) end.push(f[i]);
  }
  return { start, end, takeoffT, landingT };
}

/**
 * The reference each ground fix is measured against, as a function (fix, phase) -> feet or NaN, and its kind. `refAt(lat, lon)` is the
 * terrain height (feet; NaN where unknown), or null. Terrain when every ground fix has a height; else the lead ship's own same-phase fixes
 * within matchFt ('spots', when every other ship with ground fixes finds a match in some phase); else one flat level.
 */
function pickReference(phases, refAt) {
  const all = Object.values(phases).flatMap((p) => [...p.start, ...p.end]);
  if (refAt && all.every((fx) => isNum(refAt(fx.lat, fx.lon)))) return { kind: 'terrain', at: (fx) => refAt(fx.lat, fx.lon) };
  const slots = Object.keys(phases).map(Number).filter((s) => phases[s].start.length || phases[s].end.length).sort((a, b) => a - b);
  const leadSlot = slots[0];
  if (slots.length > 1) {
    const lead = phases[leadSlot];
    const r2 = ALTITUDE_CHECK.matchFt ** 2;
    const spot = (fx, phase) => {
      const near = lead[phase].filter((l) => (l.xFt - fx.xFt) ** 2 + (l.yFt - fx.yFt) ** 2 <= r2).map((l) => l.altFt);
      return near.length ? median(near) : NaN;
    };
    const matched = (s) => ['start', 'end'].some((ph) => phases[s][ph].filter((fx) => isNum(spot(fx, ph))).length >= ALTITUDE_CHECK.minPhaseFixes);
    if (slots.every((s) => s === leadSlot || matched(s))) return { kind: 'spots', leadSlot, at: (fx, phase) => spot(fx, phase) };
  }
  return { kind: 'level', at: () => 0 };
}

/**
 * The altitude check of a flight (after the timestamp snap and the GPS puck move): `refAt(lat, lon)` gives the terrain height in feet (NaN
 * where unknown), or null when there is none. Returns { source: 'terrain' | 'spots' | 'level' | 'none', leadSlot, ships: { slot: ship } },
 * each ship { startN, endN (ground fixes in each phase), startFt, endFt (its bias against the reference in each phase used, else null),
 * takeoffT, landingT, used: 'both' | 'start' | 'end' | 'all' | 'none', biasAt(t) (null when used is 'none') }. 'none': no ship has a
 * ground fix.
 */
export function altitudeCheck(flight, { refAt = null } = {}) {
  const phases = {};
  for (const [slot, tr] of Object.entries(flight?.tracks ?? {})) phases[slot] = groundPhases(tr);
  const any = Object.values(phases).some((p) => p.start.length || p.end.length);
  const ref = any ? pickReference(phases, refAt) : { kind: 'none', at: () => NaN };
  const ships = {};
  for (const [slot, p] of Object.entries(phases)) {
    const bias = (list, phase) => median(list.map((fx) => fx.altFt - ref.at(fx, phase)).filter(isNum));
    const startOk = p.start.length >= ALTITUDE_CHECK.minPhaseFixes;
    const endOk = p.end.length >= ALTITUDE_CHECK.minPhaseFixes;
    let startFt = startOk ? bias(p.start, 'start') : null;
    let endFt = endOk ? bias(p.end, 'end') : null;
    if (!isNum(startFt)) startFt = null;
    if (!isNum(endFt)) endFt = null;
    let used = startFt !== null && endFt !== null ? 'both' : startFt !== null ? 'start' : endFt !== null ? 'end' : 'none';
    let biasAt = null;
    if (used === 'both') {
      const t0 = p.takeoffT;
      const t1 = p.landingT;
      biasAt = (t) => (t <= t0 ? startFt : t >= t1 || !(t1 > t0) ? endFt : startFt + ((endFt - startFt) * (t - t0)) / (t1 - t0));
    } else if (used !== 'none') {
      const c = used === 'start' ? startFt : endFt;
      biasAt = () => c;
    } else if (p.start.length + p.end.length >= ALTITUDE_CHECK.minPhaseFixes) {
      // Too few fixes in each phase alone: all of them together, one constant (low confidence). Under minPhaseFixes in all, nothing: a
      // track whose logging started in the air can carry one or two slow steps there (a GPS hiccup at start-up) that read as ground
      // fixes thousands of feet up; taken as its ground, the whole formation was moved by it (Dad's Cobra flight, 14 Oct 2026, V2.511).
      const c = median([...p.start.map((fx) => fx.altFt - ref.at(fx, 'start')), ...p.end.map((fx) => fx.altFt - ref.at(fx, 'end'))].filter(isNum));
      if (isNum(c)) {
        used = 'all';
        biasAt = () => c;
      }
    }
    ships[slot] = { startN: p.start.length, endN: p.end.length, startFt, endFt, takeoffT: p.takeoffT, landingT: p.landingT, used, biasAt };
  }
  return { source: ref.kind, leadSlot: ref.leadSlot ?? null, ships };
}

/**
 * Each ship's correction at time t (feet to take off its GPS height): its bias less the mean of the biases of every ship that has one, at
 * that moment (RELATIVE: the formation's mean height stays as recorded). Null for a ship with no bias. `check` is altitudeCheck's.
 */
export function correctionAt(check, slot, t) {
  const own = check?.ships?.[slot]?.biasAt;
  if (!own) return null;
  const all = Object.values(check.ships).filter((s) => s.biasAt).map((s) => s.biasAt(t));
  return own(t) - all.reduce((a, b) => a + b, 0) / all.length;
}

/**
 * The flight with each ship's heights corrected (altFt and altM on every fix) unless `choices[slot].recorded`. Every track gains
 * `altitude: { source, used, startN, endN, startFt, endFt (its correction at take-off and landing, or at its one used phase), driftFt,
 * confidence: 'good' | 'low' | 'none', why, corrected }`, so the screen can say what was found and done. A ship's `startFt` and `endFt`
 * here are RELATIVE: what it read above (+) or below (-) the others on the same ground. With nothing corrected the fixes are the ones given.
 */
export function correctAltitudes(flight, check, choices = {}) {
  if (!flight) return flight;
  const tracks = {};
  const several = Object.values(check?.ships ?? {}).filter((s) => s.biasAt).length > 1;
  for (const [slot, tr] of Object.entries(flight.tracks)) {
    const s = check?.ships?.[slot];
    const info = { source: check?.source ?? 'none', used: s?.used ?? 'none', startN: s?.startN ?? 0, endN: s?.endN ?? 0, startFt: null, endFt: null, driftFt: null, confidence: 'none', why: '', corrected: false };
    if (!s || !s.biasAt) {
      info.why = s && s.startN + s.endN ? `too few fixes on the ground (${s.startN + s.endN})` : 'no fixes on the ground';
    } else if (!several) {
      info.why = 'no other ship with ground fixes to compare with';
    } else {
      // The correction at take-off and at landing (at the first and last fix for a ship that never flew), or at its one phase used.
      const tA = s.takeoffT ?? tr.fixes[0].t;
      const tB = s.landingT ?? tr.fixes[tr.fixes.length - 1].t;
      if (s.used !== 'end') info.startFt = correctionAt(check, slot, tA);
      if (s.used === 'both' || s.used === 'end') info.endFt = correctionAt(check, slot, tB);
      info.driftFt = info.startFt !== null && info.endFt !== null ? info.endFt - info.startFt : null;
      const drifts = info.driftFt !== null && Math.abs(info.driftFt) > ALTITUDE_CHECK.driftFt;
      info.confidence = s.used !== 'both' || drifts ? 'low' : 'good';
      info.why = {
        all: 'few ground fixes',
        start: s.endN ? 'few fixes at taxi in' : 'no taxi in',
        end: s.startN ? 'few fixes at taxi out' : 'no taxi out',
        both: drifts ? `taxi out and taxi in differ by more than ${ALTITUDE_CHECK.driftFt} ft` : '',
      }[s.used];
    }
    if (!s?.biasAt || !several || choices?.[slot]?.recorded) {
      tracks[slot] = { ...tr, altitude: info };
      continue;
    }
    info.corrected = true;
    const fixes = tr.fixes.map((fx) => {
      const c = correctionAt(check, slot, fx.t);
      if (!isNum(c) || !isNum(fx.altFt)) return fx;
      const altFt = fx.altFt - c;
      return { ...fx, altFt, altM: altFt / FT_PER_M };
    });
    tracks[slot] = { ...tr, fixes, altitude: info };
  }
  return { ...flight, tracks };
}
