// The simulated drop in the Debrief (DB-36, DB-R29; Dad, 15 Oct 2026: "so we can see the inertia and whether or not it'd land
// on target"; Patrick approved the plan, relayed by Dad; spec section "Simulated drop"; docs/modules/debrief/drop-plan.md).
// Plain values, no page access: the Drop box's settings and their ranges, the ship's place and velocity at the release
// moment, the wind and ground the fall uses, the fall itself (core drop.js flyDrop, carp and missClock: never a second copy
// of the falling math), the drop zone's shape, the words, and what goes into the debrief file and back out (untrusted).
//
// Speeds always name their kind: ground speed (from the track), true airspeed (ground velocity less the wind) and est. IAS
// (true airspeed × √σ, the readouts' estimate). Published release figures are flags, never walls (rule book).
import { flyDrop, carp, missClock, DROP_LOADS, DROP_MAX_SEC } from '../../core/drop.js';
import { windVectorFtps } from '../../core/wind.js';
import { densityRatio } from '../../core/atmosphere.js';
import { FTPS_TO_KT } from '../../core/units.js';
import { compassDegFromVector, unitVectorFromCompassDeg } from '../../core/angles.js';
import { formatZuluSeconds } from '../../core/time.js';
import { sampleAt } from '../../flight-data/flight.js';
import { GAP_HOLE_S, TURN_WINDOW_S } from './readouts.js';
import { MAX_SHIPS } from '../../flight-data/load.js';

/** The two loads (core DROP_LOADS), in the order the box lists them. */
export const LOAD_OPTIONS = Object.freeze([
  Object.freeze({ value: 'bdu33', label: DROP_LOADS.bdu33.name }),
  Object.freeze({ value: 'a22g12', label: DROP_LOADS.a22g12.name }),
]);

/**
 * The box's ranges: what a number box takes and what a debrief file may hold. Room for any sensible drop, not limits on
 * the flying (estimates for the boxes; nothing here is a manual's number).
 */
export const DROP_LIMITS = Object.freeze({
  radiusFt: Object.freeze({ min: 10, max: 10000, step: 10 }),
  lengthFt: Object.freeze({ min: 10, max: 20000, step: 50 }),
  widthFt: Object.freeze({ min: 10, max: 20000, step: 50 }),
  headingDeg: Object.freeze({ min: 0, max: 360, step: 1 }),
  windDeg: Object.freeze({ min: 0, max: 360, step: 5 }),
  windKt: Object.freeze({ min: 0, max: 150, step: 1 }),
  weightLb: Object.freeze({ min: 1, max: 20000, step: 1 }),
  cdaFt2: Object.freeze({ min: 0.001, max: 1000, step: 0.001 }),
  delaySec: Object.freeze({ min: 0, max: 30, step: 0.1 }),
  fillSec: Object.freeze({ min: 0, max: 30, step: 0.1 }),
  canopyCdaFt2: Object.freeze({ min: 1, max: 20000, step: 1 }),
});

/**
 * The Drop box's remembered settings (state.js LAYOUT_DEFAULTS takes these). The drop zone's size defaults are ESTIMATES
 * (DB-36): a 300 ft circle, or a 1,000 × 300 ft box along the ship's track at release. The load numbers are the BDU-33's
 * preset (core DROP_LOADS, estimates), the parachute's the G-12's.
 */
export const DROP_DEFAULTS = Object.freeze({
  dropOpen: false,
  dropLoad: 'bdu33',
  dropShip: 1,
  dropShape: 'circle',
  dropRadiusFt: 300,
  dropLengthFt: 1000,
  dropWidthFt: 300,
  dropRunIn: 'track', // 'track': the ship's track at release; 'set': dropRunInDeg
  dropRunInDeg: 360,
  dropWind: 'model', // 'model': the Debrief's winds aloft; 'typed': the four boxes below
  dropWindTopDeg: 270,
  dropWindTopKt: 0,
  dropWindGroundDeg: 270,
  dropWindGroundKt: 0,
  dropWeightLb: DROP_LOADS.bdu33.weightLb,
  dropCdaFt2: DROP_LOADS.bdu33.cdaFt2,
  dropOpenDelaySec: DROP_LOADS.a22g12.chute.openDelaySec,
  dropFillSec: DROP_LOADS.a22g12.chute.fillSec,
  dropCanopyCdaFt2: DROP_LOADS.a22g12.chute.canopyCdaFt2,
});

/** The settings' allowed values, for createSettings (the rest are type-checked numbers). */
export const DROP_ALLOWED = Object.freeze({
  dropLoad: LOAD_OPTIONS.map((o) => o.value),
  dropShip: Array.from({ length: MAX_SHIPS }, (_, i) => i + 1), // #1 to #4, or any ship of an exercise (DB-37)
  dropShape: ['circle', 'box'],
  dropRunIn: ['track', 'set'],
  dropWind: ['model', 'typed'],
});

/** Each number setting's range. */
const NUMBER_RANGE = Object.freeze({
  dropRadiusFt: DROP_LIMITS.radiusFt,
  dropLengthFt: DROP_LIMITS.lengthFt,
  dropWidthFt: DROP_LIMITS.widthFt,
  dropRunInDeg: DROP_LIMITS.headingDeg,
  dropWindTopDeg: DROP_LIMITS.windDeg,
  dropWindTopKt: DROP_LIMITS.windKt,
  dropWindGroundDeg: DROP_LIMITS.windDeg,
  dropWindGroundKt: DROP_LIMITS.windKt,
  dropWeightLb: DROP_LIMITS.weightLb,
  dropCdaFt2: DROP_LIMITS.cdaFt2,
  dropOpenDelaySec: DROP_LIMITS.delaySec,
  dropFillSec: DROP_LIMITS.fillSec,
  dropCanopyCdaFt2: DROP_LIMITS.canopyCdaFt2,
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clampTo = (v, { min, max }, fallback) => (isNum(v) ? Math.min(max, Math.max(min, v)) : fallback);
/** A setting's value inside its range (a stored layout is only type-checked). */
const num = (on, key) => clampTo(on[key], NUMBER_RANGE[key], DROP_DEFAULTS[key]);

/** The settings a load's preset sets: its weight and Cd·A, and for cargo its parachute's (core DROP_LOADS, estimates). */
export function presetPatch(loadId) {
  const load = DROP_LOADS[loadId] ?? DROP_LOADS.bdu33;
  const patch = { dropWeightLb: load.weightLb, dropCdaFt2: load.cdaFt2 };
  if (load.chute) {
    patch.dropOpenDelaySec = load.chute.openDelaySec;
    patch.dropFillSec = load.chute.fillSec;
    patch.dropCanopyCdaFt2 = load.chute.canopyCdaFt2;
  }
  return patch;
}

/** The load as core drop.js takes it, from the box's settings: the preset's kind with the numbers under "More". */
export function dropLoadFrom(on) {
  const preset = DROP_LOADS[on.dropLoad] ?? DROP_LOADS.bdu33;
  return {
    id: preset.id,
    name: preset.name,
    weightLb: num(on, 'dropWeightLb'),
    cdaFt2: num(on, 'dropCdaFt2'),
    chute: preset.chute
      ? { openDelaySec: num(on, 'dropOpenDelaySec'), fillSec: num(on, 'dropFillSec'), canopyCdaFt2: num(on, 'dropCanopyCdaFt2') }
      : null,
  };
}

/** The typed wind from the box's settings, each inside its range: { topDeg, topKt, groundDeg, groundKt } (true "from", knots). */
export function typedWindFrom(on) {
  return { topDeg: num(on, 'dropWindTopDeg'), topKt: num(on, 'dropWindTopKt'), groundDeg: num(on, 'dropWindGroundDeg'), groundKt: num(on, 'dropWindGroundKt') };
}

// ---- The release ----------------------------------------------------------------------------------------------------------

/** The ship's velocity is taken over this many seconds either side of the release: est. G's window (readouts TURN_WINDOW_S). */
export const RELEASE_WINDOW_S = TURN_WINDOW_S;
/** At least this many fixes inside that window (with half a second's room each end) to know the velocity (an estimate: real tracks have one a second). */
export const RELEASE_MIN_FIXES = 3;

/**
 * Where the ship was and how it was moving at the release moment t: { x, y, z (MSL, the corrected height, DB-28), vx, vy,
 * vz (ft/s over the ground), gsKt, trackDeg, slot } from the chord over ±RELEASE_WINDOW_S (the smoothed velocity est. G
 * uses), or { reason } when the track can't tell: no track, outside it, in or next to a GPS gap, or too few fixes round the moment.
 * `name`: the ship's name in the words ("#2"; an exercise's "Viper 2", DB-37), kept on the result.
 */
export function releaseAt(track, t, slot, name = `#${slot}`) {
  const f = track?.fixes;
  if (!f || f.length < 2) return { reason: `${name} isn't loaded` };
  if (!isNum(t) || t < f[0].t || t > f[f.length - 1].t) return { reason: `${name}'s track doesn't cover that moment` };
  const t0 = Math.max(f[0].t, t - RELEASE_WINDOW_S);
  const t1 = Math.min(f[f.length - 1].t, t + RELEASE_WINDOW_S);
  const why = `too few good fixes round the release to know ${name}'s velocity`;
  if (t1 - t0 < RELEASE_WINDOW_S) return { reason: why };
  let count = 0;
  for (let i = 0; i < f.length; i++) {
    if (f[i].t >= t0 - 0.5 && f[i].t <= t1 + 0.5) count++;
    // A hole (a pair GAP_HOLE_S apart or more, the readouts' rule) touching the window: the positions there are guesses.
    if (i > 0 && f[i].t >= t0 && f[i - 1].t <= t1 && f[i].t - f[i - 1].t >= GAP_HOLE_S) return { reason: `${why} (a GPS gap)` };
  }
  if (count < RELEASE_MIN_FIXES) return { reason: why };
  const a = sampleAt(track, t0);
  const b = sampleAt(track, t1);
  const p = sampleAt(track, t);
  const dt = t1 - t0;
  const vx = (b.xFt - a.xFt) / dt;
  const vy = (b.yFt - a.yFt) / dt;
  const vz = (b.altFt - a.altFt) / dt;
  if (![p.xFt, p.yFt, p.altFt, vx, vy, vz].every(isNum)) return { reason: why };
  return { slot, name, t, x: p.xFt, y: p.yFt, z: p.altFt, vx, vy, vz, gsKt: Math.hypot(vx, vy) * FTPS_TO_KT, trackDeg: compassDegFromVector(vx, vy) };
}

/**
 * A typed release time ("14:02:33", "14:02:33Z" or "140233") as seconds since 1970 inside [startT, endT], or null.
 * The flight may cross midnight, so the day before, of and after the start are tried.
 */
export function parseReleaseTime(text, startT, endT) {
  const m = /^\s*(\d{1,2}):?(\d{2}):?(\d{2}(?:\.\d+)?)\s*z?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (h > 23 || mi > 59 || s >= 60) return null;
  const of = h * 3600 + mi * 60 + s;
  const day = Math.floor(startT / 86400) * 86400;
  for (const d of [day, day + 86400, day - 86400]) {
    const t = d + of;
    if (t >= startT && t <= endT) return t;
  }
  return null;
}

// ---- Wind and ground ------------------------------------------------------------------------------------------------------

const windWordsT = (dirDeg, kt) => (Math.round(kt) === 0 ? 'calm' : `${String(Math.round(dirDeg / 5) * 5 % 360 || 360).padStart(3, '0')}°T/${Math.round(kt)} kt`);

/**
 * The wind the fall uses, as at(z) → { x, y } ft/s (core windVectorFtps, the way the air moves), and how it was found.
 * mode: 'model' or 'typed'. model(z): the Debrief's winds aloft at z (MSL) as { dirDeg, kt } (true "from") or null where it has
 * none; modelWhy: why there is none at all ('' when it is ready), modelLabel: "HRDPS" or "HRRR".
 * typed: { topDeg, topKt, groundDeg, groundKt } at the release height and the ground, blended in a straight line with height
 * (as vectors). In 'model' mode a height with no model wind takes the typed wind if one was typed (either box above 0 kt),
 * else still air (the spec: never a silent zero; the words say so). `used` records what the fall met, for the words.
 */
export function dropWind({ mode, model = null, modelWhy = '', modelLabel = 'model', typed, releaseFt, groundFt }) {
  const top = windVectorFtps(typed.topDeg, typed.topKt);
  const bottom = windVectorFtps(typed.groundDeg, typed.groundKt);
  const given = typed.topKt > 0 || typed.groundKt > 0;
  const span = releaseFt - groundFt;
  const typedAt = (z) => {
    const k = span > 0 ? Math.min(1, Math.max(0, (z - groundFt) / span)) : 1;
    return { x: bottom.x + (top.x - bottom.x) * k, y: bottom.y + (top.y - bottom.y) * k };
  };
  const used = { model: false, typed: false, still: false, lowestModelFt: Infinity };
  const at = (z) => {
    if (mode === 'typed') {
      used.typed = true;
      return typedAt(z);
    }
    const w = model ? model(z) : null;
    if (w && isNum(w.dirDeg) && isNum(w.kt)) {
      used.model = true;
      used.lowestModelFt = Math.min(used.lowestModelFt, z);
      return windVectorFtps(w.dirDeg, w.kt);
    }
    if (given) {
      used.typed = true;
      return typedAt(z);
    }
    used.still = true;
    return { x: 0, y: 0 };
  };
  const reset = () => Object.assign(used, { model: false, typed: false, still: false, lowestModelFt: Infinity });
  const typedWords = `typed ${windWordsT(typed.topDeg, typed.topKt)} at release, ${windWordsT(typed.groundDeg, typed.groundKt)} at the ground`;
  /** The wind line, after a fall has been run through at(). */
  const words = () => {
    if (mode === 'typed') return `Wind: ${typedWords}.`;
    const why = modelWhy ? ` ${/[.!?]$/.test(modelWhy) ? modelWhy : `${modelWhy}.`}` : '';
    if (used.model && !used.typed && !used.still) return `Wind: model winds aloft (${modelLabel}, Open-Meteo).`;
    const low = `${Math.round(used.lowestModelFt / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (used.model && used.typed) return `Wind: model winds aloft (${modelLabel}) down to ${low} ft; below, no model wind: ${typedWords}.`;
    if (used.model) return `Wind: model winds aloft (${modelLabel}) down to ${low} ft; below, no wind data: still air.`;
    if (used.typed) return `No model wind: ${typedWords}.${why}`;
    return `No wind data: still air.${why}`;
  };
  /** The words drawn beside the impact when some of the fall had no wind at all (the spec: never a silent zero), or ''. */
  const note = () => {
    if (mode === 'typed' || !used.still) return '';
    if (!used.model) return 'No wind data: still air';
    return `No wind data below ${Math.round(used.lowestModelFt / 100) * 100} ft: still air`.replace(/(\d)(?=(\d{3})+ ft)/g, '$1,');
  };
  return { at, used, reset, words, note, stillAir: () => !used.model && !used.typed };
}

/**
 * The ground the load stops on: the terrain under it when the 3D Ground is "Terrain and satellite" and its tiles came
 * (terrainAt(x, y) → feet, NaN where no tile), else the tracks' ground (trackFt, DB-26; trackWords names it). `terrain`: the
 * tiles' state ('none' when not asked for, 'loading', 'ready', 'failed'). The words say which was met.
 */
export function dropGround({ trackFt, trackWords, terrainAt = null, terrain = 'none' }) {
  const used = { terrain: false, missing: false };
  const at = (x, y) => {
    const h = terrainAt ? terrainAt(x, y) : NaN;
    if (isNum(h)) {
      used.terrain = true;
      return h;
    }
    if (terrain !== 'none') used.missing = true;
    return trackFt;
  };
  const ft = (v) => `${Math.round(v).toLocaleString('en-US')} ft`;
  const words = (impactFt) => {
    if (used.missing && terrain === 'loading') return `Terrain still loading: for now it lands on ${trackWords}, ${ft(trackFt)}.`;
    if (used.missing) return `Terrain tiles missing: it lands on ${trackWords}, ${ft(trackFt)}.`;
    if (used.terrain) return `Ground: the terrain, ${ft(impactFt)} at the impact (moved to match the tracks' ground).`;
    return `Ground: ${trackWords}, ${ft(trackFt)}.`;
  };
  return { at, used, words };
}

// ---- The drop zone ----------------------------------------------------------------------------------------------------------

/**
 * The drop zone in map feet: { shape: 'circle', x, y, radiusFt } or { shape: 'box', x, y, lengthFt, widthFt, runInDeg,
 * corners: [[x, y] x 4] } with the length along the run-in. `point`: the point of impact { x, y } in map feet.
 */
export function zoneShape(point, on, runInDeg) {
  if (!point) return null;
  if (on.dropShape !== 'box') return { shape: 'circle', x: point.x, y: point.y, radiusFt: num(on, 'dropRadiusFt') };
  const lengthFt = num(on, 'dropLengthFt');
  const widthFt = num(on, 'dropWidthFt');
  const u = unitVectorFromCompassDeg(runInDeg);
  const n = { x: u.y, y: -u.x }; // to the right of the run-in
  const [l, w] = [lengthFt / 2, widthFt / 2];
  const corners = [[-l, -w], [l, -w], [l, w], [-l, w]].map(([a, b]) => [point.x + u.x * a + n.x * b, point.y + u.y * a + n.y * b]);
  return { shape: 'box', x: point.x, y: point.y, lengthFt, widthFt, runInDeg, corners };
}

/** Is a point { x, y } inside the drop zone (zoneShape's)? */
export function insideZone(zone, p) {
  if (!zone || !p) return false;
  const dx = p.x - zone.x;
  const dy = p.y - zone.y;
  if (zone.shape === 'circle') return Math.hypot(dx, dy) <= zone.radiusFt;
  const u = unitVectorFromCompassDeg(zone.runInDeg);
  const along = dx * u.x + dy * u.y;
  const cross = dx * u.y - dy * u.x;
  return Math.abs(along) <= zone.lengthFt / 2 && Math.abs(cross) <= zone.widthFt / 2;
}

/**
 * The run-in heading (compass degrees, true): the box's set heading, else the chosen ship's track when the drop zone was
 * placed, held fixed from then on (Dad, 16 Oct 2026: "it spins it should remain fixed when you built it"); fallbackDeg only
 * for a drop zone saved before the heading was kept (the release's track, or the ship's track now before a drop).
 */
export function runInFor(on, placedDeg, fallbackDeg = 360) {
  if (on.dropShape === 'box' && on.dropRunIn === 'set') return num(on, 'dropRunInDeg') % 360;
  return isNum(placedDeg) ? placedDeg % 360 : fallbackDeg;
}

// ---- Published release figures: flags only, never walls ------------------------------------------------------------------

/**
 * The G-12's published release figures (drop-plan.md's table, "Typical release" row; unchecked): a typical release at
 * 140 KIAS (Safran/Airlift data sheet) and a lowest drop height of 475 to 550 ft AGL (CKSA product page). Flags on screen,
 * never limits (rule book: references, not walls).
 */
export const G12_FLAGS = Object.freeze({ typicalKias: 140, lowestAglFt: Object.freeze([475, 550]) });

/** The flags for a release: words for anything past a published figure (cargo only; the BDU-33 has none in drop-plan.md). */
export function releaseFlags(load, release) {
  if (!load.chute) return [];
  const out = [];
  if (isNum(release.iasKt) && release.iasKt > G12_FLAGS.typicalKias) {
    out.push(`est. IAS ${Math.round(release.iasKt)} kt is over the G-12's typical ${G12_FLAGS.typicalKias} KIAS release (a flag, not a limit).`);
  }
  const [lo, hi] = G12_FLAGS.lowestAglFt;
  if (isNum(release.aglFt) && release.aglFt < lo) {
    out.push(`${Math.round(release.aglFt).toLocaleString('en-US')} ft above the ground is under the G-12's lowest drop height, ${lo} to ${hi} ft AGL (a flag, not a limit).`);
  } else if (isNum(release.aglFt) && release.aglFt < hi) {
    out.push(`${Math.round(release.aglFt).toLocaleString('en-US')} ft above the ground is inside the G-12's lowest drop height band, ${lo} to ${hi} ft AGL (a flag, not a limit).`);
  }
  return out;
}

// ---- The drop ---------------------------------------------------------------------------------------------------------------

/**
 * The whole drop: release, fall, impact, miss, the drop zone, the CARP and the drift.
 * release: releaseAt's (or { reason }); point: the point of impact { x, y } in map feet, or null when not placed; on: the
 * box's settings; wind: dropWind's; ground: dropGround's; placedRunInDeg: the run-in kept when the drop zone was placed.
 * Returns { ok: false, reason } or { ok: true, load, release, fall, landed, impact, zone, runInDeg, miss, inside, carp,
 * driftFt, driftToDeg, flags, windWords, windNote, groundWords, stillAir }.
 */
export function runDrop({ release, point, on, wind, ground, placedRunInDeg = null }) {
  if (!release || release.reason) return { ok: false, reason: release?.reason ?? 'no release yet' };
  const load = dropLoadFrom(on);
  // The release's speeds by kind: true airspeed from the ground velocity less the wind there, est. IAS = TAS × √σ.
  wind.reset();
  const w0 = wind.at(release.z);
  const tasFtps = Math.hypot(release.vx - w0.x, release.vy - w0.y, release.vz);
  const groundBelowFt = ground.at(release.x, release.y);
  const rel = {
    ...release,
    tasKt: tasFtps * FTPS_TO_KT,
    iasKt: tasFtps * FTPS_TO_KT * Math.sqrt(densityRatio(release.z)),
    aglFt: release.z - groundBelowFt,
  };
  const fall = flyDrop({
    release: { x: release.x, y: release.y, z: release.z, vx: release.vx, vy: release.vy, vz: release.vz },
    load, windAt: wind.at, groundAt: ground.at,
  });
  const windWords = wind.words();
  const windNote = wind.note();
  const stillAir = wind.stillAir();
  const groundWords = ground.words(fall.impact?.z ?? groundBelowFt);
  const runInDeg = runInFor(on, placedRunInDeg, isNum(release.trackDeg) ? release.trackDeg : 360);
  const zone = zoneShape(point, on, runInDeg);
  const out = {
    ok: true, load, release: rel, fall, landed: fall.landed, impact: fall.impact, zone, runInDeg,
    miss: null, inside: null, carp: null, driftFt: null, driftToDeg: null, flags: releaseFlags(load, rel), windWords, windNote, groundWords, stillAir,
  };
  if (!fall.landed) return out;
  // Drift: where the wind moved it, against the same fall in still air.
  const calm = flyDrop({ release: { x: release.x, y: release.y, z: release.z, vx: release.vx, vy: release.vy, vz: release.vz }, load, groundAt: ground.at, every: 50 });
  if (calm.landed) {
    const dx = fall.impact.x - calm.impact.x;
    const dy = fall.impact.y - calm.impact.y;
    out.driftFt = Math.hypot(dx, dy);
    out.driftToDeg = compassDegFromVector(dx, dy);
  }
  if (!point) return out;
  out.miss = missClock(fall.impact, point, runInDeg);
  out.inside = insideZone(zone, fall.impact);
  // The ideal release for this pass (core carp: the same fall from a trial release, moved by the miss), level at the release height.
  const ideal = carp({ target: point, heightFt: release.z, ground: { vx: release.vx, vy: release.vy }, load, windAt: wind.at, groundAt: ground.at });
  if (ideal) {
    const gs = Math.hypot(release.vx, release.vy);
    const u = gs > 1 ? { x: release.vx / gs, y: release.vy / gs } : null;
    const dx = ideal.x - release.x;
    const dy = ideal.y - release.y;
    out.carp = {
      x: ideal.x, y: ideal.y, z: release.z, offFt: Math.hypot(dx, dy), missFt: ideal.missFt,
      alongFt: u ? dx * u.x + dy * u.y : null, crossFt: u ? dx * u.y - dy * u.x : null, u,
    };
  }
  return out;
}

/** Where the load is at playback time t: { x, y, altFt, chute (0 shut to 1 open), landed } or null before the release. */
export function loadAt(result, t) {
  if (!result?.ok) return null;
  const tau = t - result.release.t;
  if (!(tau >= 0)) return null;
  const path = result.fall.path;
  const end = path[path.length - 1];
  const c = result.load.chute;
  const chute = !c ? 0 : tau <= c.openDelaySec ? 0 : c.fillSec > 0 ? Math.min(1, (tau - c.openDelaySec) / c.fillSec) : 1;
  if (tau >= end.t) return { x: end.x, y: end.y, altFt: end.z, chute, landed: result.landed };
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].t <= tau) lo = mid;
    else hi = mid;
  }
  const a = path[lo];
  const b = path[hi];
  const k = b.t > a.t ? (tau - a.t) / (b.t - a.t) : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, altFt: a.z + (b.z - a.z) * k, chute, landed: false };
}

// ---- Words --------------------------------------------------------------------------------------------------------------

const ft = (v) => `${Math.round(v).toLocaleString('en-US')} ft`;
const fallWords = (s) => (s < 90 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

/**
 * The box's answer: { status, tone ('good' | 'caution' | 'bad' | 'none'), lines, note } where note is the line drawn beside
 * the impact ("No wind data: still air"), or ''. `placed`: whether a point of impact is placed.
 */
export function dropWords(result, { placed = false } = {}) {
  if (!result) return { status: '', tone: 'none', lines: ['Load a flight to drop a load.'], note: '' };
  if (!result.ok) {
    const none = result.reason === 'no release yet';
    return {
      status: none ? '' : 'NO DROP',
      tone: none ? 'none' : 'caution',
      lines: [none ? `Press Drop now at the moment of release, or At time…${placed ? '' : ' Place on map sets the point of impact.'}` : `No drop: ${result.reason}.`],
      note: '',
    };
  }
  const r = result.release;
  const lines = [];
  let status;
  let tone;
  if (!result.landed) {
    status = 'NOT LANDED';
    tone = 'caution';
    lines.push(`Still falling after ${DROP_MAX_SEC / 60} minutes: reported as not landed.`);
  } else if (result.miss) {
    status = result.inside ? 'IN THE DROP ZONE' : 'OUTSIDE THE DROP ZONE';
    tone = result.inside ? 'good' : 'bad';
    lines.push(`Impact ${ft(result.miss.missFt)} at ${result.miss.clock} o'clock from the point of impact (12 o'clock along the run-in, ${Math.round(result.runInDeg) % 360 || 360}°T).`);
  } else {
    status = 'LANDED';
    tone = 'none';
    lines.push('Place on map sets the point of impact, to see the miss.');
  }
  lines.push(`Released by ${r.name ?? `#${r.slot ?? '?'}`} at ${formatZuluSeconds(r.t)}: ${ft(r.aglFt)} above the ground (${ft(r.z)} MSL), ground speed ${Math.round(r.gsKt)} kt, true airspeed ${Math.round(r.tasKt)} kt (est. IAS ${Math.round(r.iasKt)} kt).`);
  if (result.landed) {
    let drift = '';
    if (Number.isFinite(result.driftFt) && result.driftFt < 5) drift = ', no wind drift';
    else if (Number.isFinite(result.driftFt)) {
      drift = `, drift ${ft(result.driftFt)} toward ${String(Math.round(result.driftToDeg / 5) * 5 % 360 || 360).padStart(3, '0')}°T (the wind's push, against still air)`;
    }
    lines.push(`Time of fall ${fallWords(result.fall.impact.t)}${drift}.`);
  }
  if (result.carp) {
    const c = result.carp;
    if (c.alongFt === null) lines.push(`Ideal release (CARP): ${ft(c.offFt)} from where it was released.`);
    else {
      const along = Math.abs(c.alongFt) < 10 ? 'on the release point' : `${ft(Math.abs(c.alongFt))} ${c.alongFt > 0 ? 'later' : 'earlier'} along the track`;
      const side = Math.abs(c.crossFt) < 10 ? '' : `, ${ft(Math.abs(c.crossFt))} ${c.crossFt > 0 ? 'right' : 'left'} of it`;
      lines.push(`Ideal release (CARP) for this pass: ${along}${side}, at the same height and ground speed.`);
    }
  }
  lines.push(result.windWords, result.groundWords, ...result.flags);
  if (result.flags.length && tone === 'good') tone = 'caution';
  return { status, tone, lines, note: result.windNote };
}

// ---- Kept in the browser and in the debrief file ----------------------------------------------------------------------

/** Where a flight's drop (its release time and point of impact) is kept in this browser, beside its DFPs. */
export function dropStorageKey(fingerprint) {
  return `debrief:drop:${fingerprint}`;
}

/**
 * A flight's drop from anything stored or opened (untrusted, so every number is range-checked): { releaseT, point }, the
 * release time inside the flight's window [startT, endT] or null, and the point of impact { lat, lon } or null.
 */
export function readDropPlace(value, startT = -Infinity, endT = Infinity) {
  const out = { releaseT: null, point: null };
  if (!value || typeof value !== 'object') return out;
  if (isNum(value.releaseT) && value.releaseT >= startT && value.releaseT <= endT) out.releaseT = value.releaseT;
  const p = value.point;
  if (p && isNum(p.lat) && isNum(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180) {
    out.point = { lat: p.lat, lon: p.lon };
    if (isNum(p.runInDeg) && p.runInDeg >= 0 && p.runInDeg <= 360) out.point.runInDeg = p.runInDeg;
  }
  return out;
}

const FILE_PREFIX = 'drop.';
const STRING_KEYS = Object.keys(DROP_ALLOWED).filter((k) => typeof DROP_DEFAULTS[k] === 'string');
const FILE_LAYOUT_KEYS = Object.keys(DROP_DEFAULTS).filter((k) => k !== 'dropOpen');

/** The rules the debrief file's drop settings are checked against (readDebriefFile drops anything else, or out of range). */
export const DROP_FILE_RULES = Object.freeze({
  [`${FILE_PREFIX}releaseT`]: { type: 'number', min: 0, max: 1e11 },
  [`${FILE_PREFIX}lat`]: { type: 'number', min: -90, max: 90 },
  [`${FILE_PREFIX}lon`]: { type: 'number', min: -180, max: 180 },
  [`${FILE_PREFIX}runInDeg`]: { type: 'number', min: 0, max: 360 },
  ...Object.fromEntries(FILE_LAYOUT_KEYS.map((k) => [
    `${FILE_PREFIX}${k}`,
    STRING_KEYS.includes(k) ? { type: 'string', oneOf: [...DROP_ALLOWED[k]] }
      : k === 'dropShip' ? { type: 'number', min: 1, max: MAX_SHIPS }
        : { type: 'number', min: NUMBER_RANGE[k].min, max: NUMBER_RANGE[k].max },
  ])),
});

/** The drop's settings for the debrief file: the box's settings, and the release and point of impact when set. */
export function dropForFile(place, on) {
  const out = {};
  for (const k of FILE_LAYOUT_KEYS) out[`${FILE_PREFIX}${k}`] = k === 'dropShip' ? on[k] : (STRING_KEYS.includes(k) ? on[k] : num(on, k));
  if (isNum(place?.releaseT)) out[`${FILE_PREFIX}releaseT`] = place.releaseT;
  if (place?.point) {
    out[`${FILE_PREFIX}lat`] = place.point.lat;
    out[`${FILE_PREFIX}lon`] = place.point.lon;
    if (isNum(place.point.runInDeg)) out[`${FILE_PREFIX}runInDeg`] = place.point.runInDeg;
  }
  return out;
}

/**
 * The file's drop back out: { place, patch } (the release and point of impact for readDropPlace, and the box's settings as
 * a layout patch), or null when the file has none. The file reader has range-checked each value already; this checks again.
 */
export function dropFromFile(settings, startT, endT) {
  const has = Object.keys(settings ?? {}).some((k) => k.startsWith(FILE_PREFIX));
  if (!has) return null;
  const patch = {};
  for (const k of FILE_LAYOUT_KEYS) {
    const v = settings[`${FILE_PREFIX}${k}`];
    if (v === undefined) continue;
    if (DROP_ALLOWED[k] ? DROP_ALLOWED[k].includes(v) : (isNum(v) && v >= NUMBER_RANGE[k].min && v <= NUMBER_RANGE[k].max)) patch[k] = v;
  }
  const lat = settings[`${FILE_PREFIX}lat`];
  const lon = settings[`${FILE_PREFIX}lon`];
  const runInDeg = settings[`${FILE_PREFIX}runInDeg`];
  const place = readDropPlace({ releaseT: settings[`${FILE_PREFIX}releaseT`], point: isNum(lat) && isNum(lon) ? { lat, lon, runInDeg } : null }, startT, endT);
  return { place, patch };
}
