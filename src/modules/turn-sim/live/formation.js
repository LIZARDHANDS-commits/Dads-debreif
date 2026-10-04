// The 2-ship in line abreast, flying on its own (Turn Sim first version, spec
// docs/modules/turn-sim/spec.md). It holds the two aircraft, takes button presses
// (one flown now, one queued), flies them in fixed steps, keeps the ground tracks
// and a rolling record, and judges the picture once both have rolled out.
//
// Aircraft are a list, each with the aircraft it flies off (`ref`), so more
// aircraft can join later without rewriting the logic (spec section 6). Lead is
// the first aircraft and the one the others are judged from.
import { iasToTasKt } from '../../../core/t6-performance.js';
import { KT_TO_FTPS } from '../../../core/units.js';
import { STEP_SEC, makeAircraft, stepAircraft, planDone } from './flight.js';
import { MANOEUVRES, planManoeuvre, relativeTo, dryRun, TURN_BANK_DEG, TURN_G } from './manoeuvres.js';
import { flyStep, dryRunT, planGoTo, classifyPair, judgeFormation } from './transitions.js';
import { resolveErrors, resolveFixTools, applyStartErrors, planWithErrors, outcomeOf } from './errors.js';
import { FOUR_SHIP_KEYS, fourShipStart, planFour, judgeFour } from './four-ship.js';

/**
 * The first version's fixed numbers. Speeds name their kind (rule book): kias is
 * indicated, and the aircraft fly it as true airspeed at the block height.
 */
export const LIVE_DEFAULTS = Object.freeze({
  spacingFt: 6000, // the briefs' wide side of the 4,000 to 6,000 ft band (SMM 16.18 para 49)
  wingSide: /** @type {'right' | 'left'} */ ('right'), // #2 on Lead's right
  kias: 220, // SMM 16.18 para 50
  blockFt: 8000, // estimate until Patrick gives the low block height
  headingDeg: 0, // Lead flies 000 at the start
  ships: /** @type {2 | 4} */ (2), // 2-ship (the default) or 4-ship (Spread 4, live/four-ship.js)
  check45: true, // the 4-ship delayed 45 flies its check turn (AFM8 brief p.18, SMM Fig 16.34); off: a plain chain (Patrick, 4 Oct 11:28Z)
});

/** Spacing the sim will fly at all; outside it a typed value is refused (spec section 5). */
export const SPACING_LIMITS_FT = Object.freeze([1000, 20000]);
/** The SMM's line abreast band (SMM 16.18 para 49); outside it the spacing is flown and flagged. */
export const SPACING_BAND_FT = Object.freeze([4000, 6000]);
/** Margins for the roll-out judgement: the shared table's ±100 ft (docs/TESTING.md). */
export const JUDGE_MARGIN_FT = 100;
/** The SMM's line abreast sweep: 0 to 10 degrees behind the 3/9 line (SMM 16.18 para 49). */
export const SWEEP_MAX_DEG = 10;

/** Ground tracks are kept at this interval, for the whole flight (up to the cap). */
const TRACK_EVERY_SEC = 0.25;
const TRACK_MAX_POINTS = 20000; // over 80 minutes at 0.25 s
/** The rolling record holds every step of the last this-many seconds (spec section 6). */
const RECORD_SEC = 600;
const RECORD_MAX = Math.round(RECORD_SEC / STEP_SEC);

const DEG = Math.PI / 180;

/** Compass heading (degrees, 000 to 359) from math radians. */
export function compassDeg(headingRad) {
  const d = Math.round(90 - headingRad / DEG);
  return ((d % 360) + 360) % 360;
}

/** Math radians from a compass heading in degrees. */
export function headingRadFromCompass(deg) {
  return (90 - deg) * DEG;
}

/** True airspeed (ft/s) for an indicated airspeed at the block height. */
export function tasFtpsFor(kias, blockFt) {
  return iasToTasKt(kias, blockFt) * KT_TO_FTPS;
}

/** A typed spacing: { ok, value, flag, reason }. Refused outside SPACING_LIMITS_FT, flagged outside the SMM band. */
export function checkSpacing(ft) {
  const n = Number(ft);
  if (!Number.isFinite(n) || n < SPACING_LIMITS_FT[0] || n > SPACING_LIMITS_FT[1]) {
    return { ok: false, reason: `Spacing must be between ${SPACING_LIMITS_FT[0].toLocaleString('en-CA')} and ${SPACING_LIMITS_FT[1].toLocaleString('en-CA')} ft.` };
  }
  const flag = n < SPACING_BAND_FT[0] || n > SPACING_BAND_FT[1]
    ? `Outside the SMM's ${SPACING_BAND_FT[0].toLocaleString('en-CA')} to ${SPACING_BAND_FT[1].toLocaleString('en-CA')} ft line abreast band (SMM 16.18 para 49); flown anyway.`
    : null;
  return { ok: true, value: n, flag };
}

/**
 * Judges #2 against Lead once both have rolled out. Line abreast: the spacing
 * across Lead's heading against the spacing set (±100 ft), and #2's place along it
 * (FORE if ahead of Lead's 3/9 line by more than 100 ft, AFT if more than 10° of
 * sweep behind it, SMM 16.18 para 49). After an in-place turn the pair is in trail
 * (SMM 16.19 para 59), so the distance is judged along Lead's heading instead.
 */
export function judgePair(lead, wing, spacingFt, shape = 'abreast') {
  const rel = relativeTo(lead, wing);
  if (shape === 'trail') {
    const gap = Math.abs(rel.fwd);
    const labels = [];
    if (gap < spacingFt - JUDGE_MARGIN_FT) labels.push('CLOSE');
    else if (gap > spacingFt + JUDGE_MARGIN_FT) labels.push('LONG');
    if (Math.abs(rel.left) > JUDGE_MARGIN_FT) labels.push('OFFSET');
    return { shape, labels: labels.length ? labels : ['IN TRAIL'], gapFt: gap, offsetFt: rel.left, ahead: rel.fwd > 0 ? 'wing' : 'lead' };
  }
  const across = Math.abs(rel.left);
  const labels = [];
  if (across < spacingFt - JUDGE_MARGIN_FT) labels.push('TIGHT');
  else if (across > spacingFt + JUDGE_MARGIN_FT) labels.push('WIDE');
  const sweepDeg = Math.atan2(-rel.fwd, Math.max(across, 1)) / DEG;
  if (rel.fwd > JUDGE_MARGIN_FT) labels.push('FORE');
  else if (sweepDeg > SWEEP_MAX_DEG) labels.push('AFT');
  return { shape, labels: labels.length ? labels : ['ON SPACING'], acrossFt: across, foreAftFt: rel.fwd, sweepDeg, side: rel.left > 0 ? 'left' : 'right' };
}

/**
 * A new formation. options: spacingFt, wingSide ('right' | 'left'), kias, blockFt, headingDeg, ships (2 or 4),
 * and the err* training-error settings and fix* Fix tools (errors.js, 2-ship only for now; rng replaces Math.random for the random error).
 * Returns an object whose `state` is updated in place by step(), press() and reset().
 * @param {Record<string, any>} [options]
 */
export function createFormation(options = {}) {
  /** @type {Record<string, any>} */
  let opts = { ...LIVE_DEFAULTS, ...options };
  const state = {
    tSec: 0,
    aircraft: [],
    current: null, // { key, dir, label, note, firstId, shape, startSec, endSec }
    queued: null, // { key, dir, label }
    plans: {}, // id -> { segments, profile }
    planned: {}, // id -> [[t, x, y, alt], …], each aircraft's path for the manoeuvre being flown
    tracks: {}, // id -> [[t, x, y, alt], …], the whole flight
    judged: null, // the last roll-out's judgement, with the manoeuvre it followed
    refusal: null, // why the last change press was refused (transitions.js), or null
    lastSide: opts.wingSide === 'left' ? 1 : -1, // #2's side as last seen (+1 left, -1 right), for a pair in line astern
    errors: null, // the training error set for #2, or null (errors.js)
    errorOutcome: null, // how the last manoeuvre went with it: carried or fixed
    slot: { fwd: 0, left: 0 }, // where #2 should be in Lead's frame (the SMM picture); the errors' reference
    spacingFt: opts.spacingFt,
    flown: 0, // manoeuvres finished since the start
  };
  let record = [];

  function build() {
    const tas = tasFtpsFor(opts.kias, opts.blockFt);
    const h = headingRadFromCompass(opts.headingDeg);
    const side = opts.wingSide === 'left' ? 1 : -1; // +1 left of Lead
    const left = { x: Math.cos(h + Math.PI / 2), y: Math.sin(h + Math.PI / 2) };
    const lead = { ...makeAircraft({ id: 1, xFt: 0, yFt: 0, headingRad: h, kias: opts.kias, tasFtps: tas }), ref: null, name: 'Lead' };
    const wing = {
      ...makeAircraft({ id: 2, xFt: side * left.x * opts.spacingFt, yFt: side * left.y * opts.spacingFt, headingRad: h, kias: opts.kias, tasFtps: tas }),
      ref: 1,
      name: '#2',
    };
    state.slot = { fwd: 0, left: side * opts.spacingFt };
    state.errors = opts.ships === 4 ? null : resolveErrors(opts, opts.rng); // training errors are 2-ship only for now
    state.errorOutcome = null;
    if (state.errors) applyStartErrors(lead, wing, state.errors, opts.spacingFt);
    state.tSec = 0;
    state.aircraft = opts.ships === 4
      ? fourShipStart({ spacingFt: opts.spacingFt, wingSide: opts.wingSide, headingRad: h, kias: opts.kias, tasFtps: tas })
      : [lead, wing];
    state.current = null;
    state.queued = null;
    state.plans = Object.fromEntries(state.aircraft.map((a) => [a.id, { segments: [] }]));
    state.planned = {};
    state.tracks = {};
    state.judged = null;
    state.refusal = null;
    state.lastSide = side === 1 ? 1 : -1;
    state.spacingFt = opts.spacingFt;
    state.flown = 0;
    record = [];
    keepTrack(true);
  }

  function keepTrack(force = false) {
    const t = state.tSec;
    const due = force || Math.abs(t / TRACK_EVERY_SEC - Math.round(t / TRACK_EVERY_SEC)) < 1e-6;
    for (const a of state.aircraft) {
      const points = (state.tracks[a.id] ??= []);
      if (!due && points.length) continue;
      points.push([t, a.xFt, a.yFt, a.altAboveFt]);
      if (points.length > TRACK_MAX_POINTS) points.splice(0, points.length - TRACK_MAX_POINTS);
    }
  }

  function keepRecord() {
    record.push({
      t: state.tSec,
      aircraft: state.aircraft.map((a) => ({
        id: a.id, x: a.xFt, y: a.yFt, alt: a.altAboveFt, heading: a.headingRad, bank: a.bankDeg, rollRate: a.rollRateDps, pitch: a.pitchDeg, g: a.g,
      })),
    });
    if (record.length > RECORD_MAX) record.splice(0, record.length - RECORD_MAX);
  }

  function start(key, dir) {
    const m = MANOEUVRES[key];
    const four = state.aircraft.length > 2;
    const plan = four
      ? planFour(state.aircraft, key, dir, state.tSec, { check45: opts.check45 !== false })
      : state.errors
        ? planWithErrors(state.aircraft, key, dir, state.tSec, state.errors, state.slot, { tools: resolveFixTools(opts), blockFt: opts.blockFt })
        : planManoeuvre(state.aircraft, key, dir, state.tSec);
    if (plan.slotAfter) state.slot = plan.slotAfter; // the next press starts after this one ends
    state.plans = plan.plans;
    state.planned = {};
    let endSec = state.tSec;
    for (const a of state.aircraft) {
      const p = state.plans[a.id] ?? { segments: [] };
      state.plans[a.id] = p;
      const run = dryRunT(a, p, state.tSec);
      state.planned[a.id] = run.points;
      endSec = Math.max(endSec, state.tSec + run.durationSec);
    }
    state.current = {
      key,
      dir: m.sided ? dir : 0,
      label: labelFor(key, dir),
      note: plan.note,
      firstId: plan.firstId ?? null,
      shape: m.kind === 'together' && m.turnDeg > 30 && m.turnDeg < 180 ? 'trail' : 'abreast',
      startSec: state.tSec,
      endSec,
      errorRun: plan.errorRun ?? null,
    };
    state.judged = null;
    state.refusal = null;
    state.errorOutcome = null;
  }

  /** Where #2 is now: the formation it is in (transitions.js classifyPair), remembering which side it is on. */
  function whereNow() {
    const c = classifyPair(state.aircraft[0], state.aircraft[1]);
    if (c.side) state.lastSide = c.side;
    return c;
  }

  /**
   * Plans and starts a change of formation (transitions.js) from the pair as it is now.
   * Returns false, with state.refusal saying why in one line, when there is no safe plan; nothing then changes.
   */
  function startChange(to, changeOptions) {
    whereNow();
    const plan = planGoTo(state.aircraft, to, { ...changeOptions, spacingFt: state.spacingFt, blockFt: opts.blockFt, lastSide: state.lastSide }, state.tSec);
    if (!plan.ok) {
      state.refusal = plan.reason;
      return false;
    }
    state.refusal = null;
    state.plans = plan.plans;
    state.planned = {};
    let endSec = state.tSec;
    for (const a of state.aircraft) {
      const p = state.plans[a.id] ?? { segments: [] };
      state.plans[a.id] = p;
      const run = dryRunT(a, p, state.tSec);
      state.planned[a.id] = run.points;
      endSec = Math.max(endSec, state.tSec + run.durationSec);
    }
    state.current = {
      key: `change:${to}`,
      change: { to, side: plan.side, from: plan.from, rejoining: plan.rejoining, rejoinKind: plan.rejoinKind, flying: plan.flying, maxBankDeg: plan.maxBankDeg },
      dir: 0,
      label: plan.label,
      note: plan.note,
      firstId: null,
      shape: 'abreast',
      startSec: state.tSec,
      endSec,
      errorRun: null,
    };
    state.judged = null;
    state.errorOutcome = null;
    return true;
  }

  function finish() {
    const [lead, wing] = state.aircraft;
    if (state.current.change) {
      // A change of formation is judged against the target formation's band in the spec table (section 10).
      const j = judgeFormation(state.current.change.to, lead, wing, state.spacingFt);
      state.judged = { label: state.current.label, shape: 'formation', labels: j.inBand ? ['IN POSITION'] : j.labels, text: j.text, tone: j.tone };
    } else {
      state.judged = { label: state.current.label, ...(state.aircraft.length > 2 ? judgeFour(state.aircraft, state.spacingFt, state.current.shape, judgePair) : judgePair(lead, wing, state.spacingFt, state.current.shape)) };
      if (state.current.errorRun) state.errorOutcome = outcomeOf(state.current.errorRun, lead, wing, state.current.label);
    }
    state.current = null;
    state.planned = {};
    state.flown++;
    whereNow();
    if (state.queued) {
      const next = state.queued;
      state.queued = null;
      if (next.change) startChange(next.change.to, next.change.options);
      else if (MOVES_FROM.includes(whereNow().key)) start(next.key, next.dir);
      else state.refusal = `${next.label} flies in line abreast only.`;
    }
  }

  build();

  return {
    state,
    /** The rolling record of every step (newest last), for the spacing graph and the export later. */
    record: () => record,
    /** The options the formation was built with. */
    options: () => ({ ...opts }),
    /** Back to the start; any options given replace the current ones. */
    reset(next = {}) {
      opts = { ...opts, ...next };
      build();
    },
    /**
     * A button press. Flown at once when nothing is being flown, otherwise queued
     * and flown the moment the current manoeuvre ends (a later press replaces the
     * queued one). Returns 'started' or 'queued'.
     */
    press(key, dir = 1) {
      if (!MANOEUVRES[key]) throw new Error(`No manoeuvre called ${key}`);
      if (state.aircraft.length > 2 && !FOUR_SHIP_KEYS.includes(key)) throw new Error(`${key} is not a four-ship manoeuvre`);
      // The manoeuvres are line abreast manoeuvres (spec section 10): in a close formation or fighting wing they are not flown.
      if (state.aircraft.length === 2 && !state.current && !MOVES_FROM.includes(whereNow().key)) {
        state.refusal = `${labelFor(key, dir)} flies in line abreast only; change to line abreast first.`;
        return 'refused';
      }
      if (!state.current) {
        start(key, dir);
        return 'started';
      }
      state.queued = { key, dir, label: labelFor(key, dir) };
      return 'queued';
    },
    /**
     * A "Change formation" press (spec section 10, transitions.js): to is 'lab', 'fw', 'echelon', 'route' or 'astern';
     * options: { side: 'keep' | 'left' | 'right', rejoin: 'into' | 'straight' }. Flown at once when nothing is being
     * flown, otherwise queued like a manoeuvre. Returns 'started', 'queued' or 'refused' (state.refusal says why).
     */
    change(to, options = {}) {
      if (state.aircraft.length > 2) {
        state.refusal = 'Formation changes are for the 2-ship.';
        return 'refused';
      }
      if (state.current) {
        const label = FORMATIONS_LABEL(to);
        state.queued = { key: `change:${to}`, dir: 0, label, change: { to, options } };
        return 'queued';
      }
      return startChange(to, options) ? 'started' : 'refused';
    },
    /** Which formation the pair is in now: { key: 'lab' | 'fw' | 'echelon' | 'route' | 'astern' | 'other', side }. */
    where: () => classifyPair(state.aircraft[0], state.aircraft[1]),
    /** Drops the queued press, if any. */
    clearQueue() {
      state.queued = null;
    },
    /** Flies one fixed step. */
    step() {
      for (const a of state.aircraft) flyStep(a, state.plans[a.id] ?? (state.plans[a.id] = { segments: [] }), state.tSec);
      state.tSec = Math.round((state.tSec + STEP_SEC) / STEP_SEC) * STEP_SEC;
      keepTrack();
      keepRecord();
      if (state.current && state.aircraft.every((a) => planDone(a, state.plans[a.id]) && (state.tSec >= state.current.endSec - STEP_SEC / 2))) finish();
      return true;
    },
  };
}

/** The formations the manoeuvre buttons fly from: line abreast, or a picture that is none of the close ones (after an in-place turn). */
const MOVES_FROM = ['lab', 'other'];
const FORMATIONS_LABEL = (to) => ({ lab: 'Line abreast', fw: 'Fighting wing', echelon: 'Echelon', route: 'Route', astern: 'Line astern' })[to] ?? to;

/** The words for a press: "Hook right", "Shackle". */
export function labelFor(key, dir) {
  const m = MANOEUVRES[key];
  return m.sided ? `${m.label} ${dir > 0 ? 'left' : 'right'}` : m.label;
}

/** Into or away from the wingman, for a sided button, with #2 on `wingSide` of Lead (SMM 16.19 paras 53-57 name them from Lead's side). */
export function intoOrAway(dir, wingSide) {
  const wingDir = wingSide === 'left' ? 1 : -1;
  return dir === wingDir ? 'into #2' : 'away from #2';
}

/** The fixed line under Setup. */
export function fixedLine(opts = LIVE_DEFAULTS) {
  return `${opts.kias} KIAS · ${opts.blockFt.toLocaleString('en-CA')} ft · ${TURN_G} G turns (${Math.round(TURN_BANK_DEG)}° bank) · still air · roll 90°/s`;
}
