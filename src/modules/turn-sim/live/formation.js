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
import { flyStep, dryRunT } from './transitions.js';
import { resolveErrors, resolveFixTools, applyStartErrors, planWithErrors, outcomeOf } from './errors.js';
import { FOUR_SHIP_KEYS, fourShipStart, planFour } from './four-ship.js';
import { G_WARM, planGWarm } from './g-warm.js';
import { classify, judge } from './judge.js';
import { FORMATIONS, FOUR_FORMATIONS, setFwShape, setFw4Shape } from './slots.js';
import { planChangeFour } from './four-ship-moves.js';
import { offStandardOutcome } from './hot-rejoin.js';
import { chooseChange } from './chooser.js';
import { FW_TURN_KEYS, TURN_FORMATIONS, FW_MOVES, planFormationTurn, planFwMove } from './formation-turns.js';
import { createFluidSession, fluidReadouts, bankDegFor } from './fluid.js';
import { FLUID_MOVES } from './fluid-lead.js';
import { LAG_ROLL_KEY, planLagRoll } from './lag-roll.js';
import { REJOIN } from './tuning.js';

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
  fluidRangeFt: 600, // fluid manoeuvring distance, 500-1,000 ft (SMM 16.17 para 42); 600 is Patrick's pick (19:20Z row 3), an estimate
  fluidBank: /** @type {'gentle' | 'medium' | 'steep'} */ ('medium'), // Lead's level turn bank in fluid manoeuvring: 60/2 (AFM7 brief p.17)
});

/** Spacing the sim will fly at all; outside it a typed value is refused (spec section 5). */
export const SPACING_LIMITS_FT = Object.freeze([1000, 20000]);
/** The SMM's line abreast band (SMM 16.18 para 49); outside it the spacing is flown and flagged. */
export const SPACING_BAND_FT = Object.freeze([4000, 6000]);
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
 * A new formation. options: spacingFt, wingSide ('right' | 'left'), kias, blockFt, headingDeg, ships (2 or 4), the fighting
 * wing desired places (fwRangeFt, fwSweepDeg for the 2-ship; fw4RangeFt, fw4SweepDeg for the 4-ship's #2; fw4OtherRangeFt,
 * fw4OtherDeg for #3 and #4; TS-58, each defaulting to slots.js FW2 or FW4),
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
    fluid: null, // fluid manoeuvring while it runs: { session, readouts, prev } (fluid.js, TS-57), else null
  };
  let record = [];

  function build() {
    // The fighting wing desired places (TS-58): a missing value takes the default (slots.js FW2, FW4).
    setFwShape({ rangeFt: opts.fwRangeFt, sweepDeg: opts.fwSweepDeg });
    setFw4Shape({ twoRangeFt: opts.fw4RangeFt, twoDeg: opts.fw4SweepDeg, otherRangeFt: opts.fw4OtherRangeFt, otherDeg: opts.fw4OtherDeg });
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
    state.fluid = null;
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
    const m = MANOEUVRES[key] ?? G_WARM;
    const four = state.aircraft.length > 2;
    // In fighting wing and the close formations the turn buttons turn the formation (TS-55, spec section 10.2): Lead turns,
    // the wingmen keep their places (the fighting wing band, or their place in Lead's wing plane).
    const where = whereNow();
    const turnIn = FW_TURN_KEYS.includes(key) && TURN_FORMATIONS[four ? 4 : 2].includes(where.key) ? { key: where.key, side: where.side } : null;
    const plan = turnIn
      ? planFormationTurn(state.aircraft, turnIn, key, dir, state.tSec, { blockFt: opts.blockFt })
      : key === G_WARM.key
      ? planGWarm(state.aircraft, state.tSec)
      : four
      ? planFour(state.aircraft, key, dir, state.tSec, { check45: opts.check45 !== false })
      : state.errors
        ? planWithErrors(state.aircraft, key, dir, state.tSec, state.errors, state.slot, { tools: resolveFixTools(opts), blockFt: opts.blockFt })
        : planManoeuvre(state.aircraft, key, dir, state.tSec);
    if (plan.ok === false) {
      state.refusal = plan.reason;
      return false;
    }
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
      shape: turnIn ? 'formation' : m.kind === 'together' && m.turnDeg > 30 && m.turnDeg < 180 ? 'trail' : 'abreast',
      formationTurn: turnIn,
      flag: plan.flag ?? null,
      startSec: state.tSec,
      endSec,
      errorRun: plan.errorRun ?? null,
      // G-warm: its steps, and the least and most G any of the four pulled in each (design section 7: G flown against the call).
      gWarm: plan.steps ? { steps: plan.steps, flown: plan.steps.map(() => ({ min: Infinity, max: -Infinity })), spacingAfter: plan.spacingAfter } : null,
    };
    state.judged = null;
    state.refusal = null;
    state.errorOutcome = null;
    return true;
  }

  /** Where the formation is now (judge.js classify, 2- or 4-ship), remembering which side #2 is on. */
  function whereNow() {
    const c = classify(state.aircraft);
    if (c.side) state.lastSide = c.side;
    return c;
  }

  /**
   * Plans and starts a change of formation from the formation as it is now: transitions.js for the pair,
   * four-ship-moves.js for the four. Returns false, with state.refusal saying why in one line, when there is no safe
   * plan; nothing then changes.
   */
  function startChange(to, changeOptions) {
    if (to === 'fluid') return startFluid();
    whereNow();
    const four = state.aircraft.length > 2;
    // A training error set (TS-62) makes the hot turning rejoin start from wherever #2 is, flown as its response says.
    const planOpts = { ...changeOptions, spacingFt: state.spacingFt, blockFt: opts.blockFt, lastSide: state.lastSide, errors: four ? null : state.errors, mid: state.current ? midPress(state.current) : null };
    // The 2-ship: the chooser (chooser.js, TS-76) runs every planner that applies (a training error's rejoin first, TS-62;
    // the turning rejoin, TS-68; the straight-ahead rejoin, TS-72; echelon or route out to fighting wing, TS-73; a line then
    // the tracker, TS-65; the tracker alone) and flies the one that passes the pilot's checks quickest. Until V2.75 they were
    // tried in that fixed order and the first that accepted the case flew it.
    const plan = to === LAG_ROLL_KEY ? planLagRoll(state.aircraft, planOpts, state.tSec) // #2's lag roll (lag-roll.js, TS-71)
      : four
      ? planChangeFour(state.aircraft, to, planOpts, state.tSec)
      : chooseChange(state.aircraft, to, planOpts, state.tSec);
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
    // The four fly off new references in the new formation (#3 off #2 in fighting wing, #4 off #3): the card reads them.
    if (four) for (const a of state.aircraft) if (a.ref != null) a.ref = plan.refs[a.id];
    state.current = {
      key: `change:${to}`,
      change: { to: plan.to ?? to, side: plan.side, from: plan.from, rejoining: plan.rejoining, rejoinKind: plan.rejoinKind, flying: plan.flying, maxBankDeg: plan.maxBankDeg, four, offStandard: plan.offStandard ?? null, chooser: plan.chooser ?? null },
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

  /**
   * How Lead flies on when a change is pressed mid-move (spec F11, replan.js): the rest of his own move (a turn, a fighting
   * wing move, a line abreast manoeuvre); in a turning rejoin, his turn into #2 held until #2 is in; otherwise straight.
   */
  function midPress(c) {
    const lead = state.aircraft[0];
    const plan = state.plans[lead.id] ?? { segments: [] };
    if (!c.change) return { lead: { kind: 'carry', plan: { segments: plan.segments.map((x) => ({ ...x })), profile: plan.profile } } };
    if (c.change.rejoining && c.change.rejoinKind === 'into' && Math.abs(lead.bankDeg) > 1) return { lead: { kind: 'hold', s: Math.sign(lead.bankDeg), bankDeg: REJOIN.leadBankDeg } };
    return { lead: { kind: 'straight' } };
  }

  /**
   * Fluid manoeuvring (spec section 10.3, TS-57): from fighting wing only, 2-ship only for now. The session flies both
   * aircraft until Terminate brings #2 back to his fighting wing slot. Returns false with state.refusal when it can't start.
   */
  function startFluid() {
    if (state.aircraft.length > 2) {
      state.refusal = 'Fluid manoeuvring for the 4-ship comes later.';
      return false;
    }
    if (whereNow().key !== 'fw') {
      state.refusal = 'Fluid manoeuvring starts from fighting wing; change to fighting wing first.';
      return false;
    }
    const [lead, wing] = state.aircraft;
    const session = createFluidSession(lead, wing, state.tSec, { blockFt: opts.blockFt, rangeFt: opts.fluidRangeFt, bank: opts.fluidBank });
    state.fluid = { session, readouts: null, prev: null };
    state.plans = Object.fromEntries(state.aircraft.map((a) => [a.id, { segments: [] }]));
    state.planned = session.planned();
    state.current = {
      key: 'fluid',
      fluid: true,
      dir: 0,
      label: 'Fluid manoeuvring',
      note: 'Lead turns away from #2 at 30°, then at MAX; #2 collapses into the cone.',
      firstId: null,
      shape: 'formation',
      startSec: state.tSec,
      endSec: Infinity,
      errorRun: null,
    };
    state.judged = null;
    state.refusal = null;
    state.errorOutcome = null;
    return true;
  }

  /** The end of fluid manoeuvring: back in fighting wing, judged against its band (spec section 10 table). */
  function finishFluid() {
    state.fluid = null;
    state.plans = Object.fromEntries(state.aircraft.map((a) => [a.id, { segments: [] }]));
    const j = judge(state.aircraft, { key: 'fw' }, { spacingFt: state.spacingFt });
    state.judged = { label: 'Fluid manoeuvring, terminated', shape: 'formation', labels: j.inBand ? ['IN POSITION'] : j.labels, text: j.text, tone: j.tone };
    state.current = null;
    state.planned = {};
    state.flown++;
    whereNow();
  }

  function finish() {
    const [lead, wing] = state.aircraft;
    if (state.current.change) {
      // A change of formation is judged against the target formation's band in the spec table (section 10; the four:
      // design section 7, each link against the aircraft it flies off).
      const c = state.current.change;
      const j = judge(state.aircraft, { key: c.to, side: c.side }, { spacingFt: state.spacingFt });
      state.judged = { label: state.current.label, shape: 'formation', labels: j.inBand ? ['IN POSITION'] : j.labels, text: j.text, tone: j.tone, ...(c.four ? { ships: j.ships } : {}) };
      // An off-standard hot turning rejoin (TS-62) says on the card how #2 dealt with the start.
      if (c.offStandard) state.errorOutcome = offStandardOutcome(c.offStandard, j.inBand, state.current.label);
    } else if (state.current.gWarm) {
      // G-warm ends in line abreast at the tightened gap (AFM8 brief p.16 item 5); that gap is the four's from now on.
      const g = state.current.gWarm;
      state.spacingFt = g.spacingAfter;
      state.judged = { label: state.current.label, ...judge(state.aircraft, { shape: 'abreast' }, { spacingFt: state.spacingFt }), gFlown: gFlownWords(g) };
    } else if (state.current.formationTurn) {
      // A turn in fighting wing or a close formation ends judged against that formation (spec section 10 table; the four, link by link).
      const ft = state.current.formationTurn;
      const four = state.aircraft.length > 2;
      const j = judge(state.aircraft, { key: ft.key, side: ft.side }, { spacingFt: state.spacingFt });
      state.judged = { label: state.current.label, shape: 'formation', labels: j.inBand ? ['IN POSITION'] : j.labels, text: j.text, tone: j.tone, ...(four ? { ships: j.ships } : {}) };
    } else {
      state.judged = { label: state.current.label, ...judge(state.aircraft, { shape: state.current.shape }, { spacingFt: state.spacingFt }) };
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
      else {
        const why = refuseMove(next.key, next.dir);
        if (why) state.refusal = why;
        else start(next.key, next.dir);
      }
    }
  }

  /** Why a manoeuvre can't be flown from where the formation is now, or null (spec sections 8 and 10: line abreast only). */
  function refuseMove(key, dir) {
    const where = whereNow().key;
    const four = state.aircraft.length > 2;
    if (four && key === G_WARM.key) return where === 'spread4' ? null : 'G-warm starts from Spread 4; change to Spread 4 first.';
    // The turns fly in fighting wing (TS-55) and the close formations too (spec section 10.2).
    if (FW_TURN_KEYS.includes(key) && TURN_FORMATIONS[four ? 4 : 2].includes(where)) return null;
    if (four) return MOVES_FROM_FOUR.includes(where) ? null : `${labelFor(key, dir)} flies in Spread 4 only; change to Spread 4 first.`;
    return MOVES_FROM.includes(where) ? null : `${labelFor(key, dir)} flies in line abreast only; change formation first.`;
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
      if (state.fluid) {
        state.refusal = 'In fluid manoeuvring Lead flies the fluid buttons; Terminate first.';
        return 'refused';
      }
      const four = state.aircraft.length > 2;
      if (key === G_WARM.key && !four) throw new Error('G-warm is a four-ship manoeuvre for now (it starts from Spread 4)');
      if (!MANOEUVRES[key] && key !== G_WARM.key) throw new Error(`No manoeuvre called ${key}`);
      if (four && !FOUR_SHIP_KEYS.includes(key) && key !== G_WARM.key) throw new Error(`${key} is not a four-ship manoeuvre`);
      // The manoeuvres are line abreast manoeuvres (spec sections 8 and 10); the turn buttons also fly in fighting wing and the close formations (10.2).
      if (!state.current) {
        const why = refuseMove(key, dir);
        if (why) {
          state.refusal = why;
          return 'refused';
        }
      }
      if (!state.current) return start(key, dir) ? 'started' : 'refused';
      state.queued = { key, dir, label: labelFor(key, dir) };
      return 'queued';
    },
    /**
     * A "Change formation" press (spec section 10, transitions.js): to is 'lab', 'fw', 'echelon', 'route' or 'astern';
     * for the four (spec section 8, four-ship-moves.js) one of slots.js FOUR_FORMATIONS' keys;
     * options: { side: 'keep' | 'left' | 'right', rejoin: 'into' | 'straight' }. Flown at once when nothing is being
     * flown, otherwise queued like a manoeuvre. Returns 'started', 'queued' or 'refused' (state.refusal says why).
     */
    change(to, options = {}) {
      if (state.fluid) {
        state.refusal = 'Terminate fluid manoeuvring first; it ends in fighting wing.';
        return 'refused';
      }
      if (state.current && state.aircraft.length > 2) {
        const label = FOUR_FORMATIONS[to]?.label ?? to;
        state.queued = { key: `change:${to}`, dir: 0, label, change: { to, options } };
        return 'queued';
      }
      return startChange(to, options) ? 'started' : 'refused';
    },
    /**
     * #2's lag roll to fighting wing on Lead's other side (spec section 10.8, lag-roll.js, TS-71): 2-ship, from fighting wing,
     * Lead straight and level. Flown at once when nothing is being flown, otherwise queued like a change. Returns 'started',
     * 'queued' or 'refused' (state.refusal says why).
     */
    lagRoll() {
      if (state.fluid) {
        state.refusal = 'Terminate fluid manoeuvring first; the lag roll starts from fighting wing.';
        return 'refused';
      }
      if (state.current) {
        state.queued = { key: `change:${LAG_ROLL_KEY}`, dir: 0, label: 'Lag roll', change: { to: LAG_ROLL_KEY, options: {} } };
        return 'queued';
      }
      return startChange(LAG_ROLL_KEY, {}) ? 'started' : 'refused';
    },
    /**
     * Which formation the aircraft are in now: for the pair { key: 'lab' | 'fw' | 'echelon' | 'route' | 'astern' | 'other', side },
     * for the four one of slots.js FOUR_FORMATIONS or 'other', with #2's side.
     */
    // While Lead flies a fighting wing move it is fighting wing, even with #2 collapsed toward Lead's six (TS-70).
    where: () => (state.fluid ? { key: 'fluid', side: state.lastSide } : state.current?.fwMove ? { key: 'fw', side: state.lastSide, manoeuvring: true } : classify(state.aircraft)),
    /**
     * One of Lead's buttons in fighting wing (formation-turns.js FW_MOVES: levelTurn, wingsLevel, reversal, climb, descend;
     * spec section 10.7, TS-70), 2-ship: flown at once, planned again from where the pair is. Also while a change to
     * fighting wing is still flown, once #2 is in the cone: that change ends there (Patrick 09:03Z). dir +1 left, -1 right.
     * Returns 'started' or 'refused' (state.refusal says why).
     */
    pressFw(key, dir = 1) {
      const refuse = (why) => {
        state.refusal = why;
        return 'refused';
      };
      if (!FW_MOVES[key]) throw new Error(`No fighting wing move called ${key}`);
      if (state.fluid) return refuse('In fluid manoeuvring Lead flies the fluid buttons; Terminate first.');
      if (state.aircraft.length > 2) return refuse('Fighting wing moves for the 4-ship come later.');
      const c = state.current;
      if (c && !c.fwMove && c.change?.to !== 'fw') return refuse(`Wait for ${c.label} to finish.`);
      if (!c?.fwMove && whereNow().key !== 'fw') return refuse('These are fighting wing moves; change to fighting wing first.');
      const plan = planFwMove(state.aircraft, key, dir, state.tSec, { blockFt: opts.blockFt, bankDeg: bankDegFor(opts.fluidBank) });
      if (!plan.ok) return refuse(plan.reason);
      state.plans = plan.plans;
      state.planned = {};
      let endSec = state.tSec;
      for (const a of state.aircraft) {
        const run = dryRunT(a, state.plans[a.id], state.tSec);
        state.planned[a.id] = run.points;
        endSec = Math.max(endSec, state.tSec + run.durationSec);
      }
      const label = `${FW_MOVES[key].label}${FW_MOVES[key].sided ? (dir > 0 ? ' left' : ' right') : ''}`;
      state.current = {
        key: `fw:${key}`, dir: FW_MOVES[key].sided ? dir : 0, label, note: plan.note, firstId: null, shape: 'formation',
        formationTurn: { key: 'fw', side: state.lastSide }, fwMove: true, flag: null, startSec: state.tSec, endSec, errorRun: null, gWarm: null,
      };
      state.queued = null;
      state.judged = null;
      state.refusal = null;
      state.errorOutcome = null;
      return 'started';
    },
    /**
     * A Lead button in fluid manoeuvring (fluid-lead.js FLUID_MOVES: levelTurn, wingsLevel, reversal, climb, descend, loop, terminate); dir +1
     * left, -1 right. Returns 'started', 'queued' (the entry is still flown) or 'refused' (state.refusal says why).
     */
    pressFluid(key, dir = 1) {
      if (!state.fluid) {
        state.refusal = 'Fluid manoeuvring is not running; start it from fighting wing.';
        return 'refused';
      }
      if (!FLUID_MOVES[key]) throw new Error(`No fluid manoeuvre called ${key}`);
      const r = state.fluid.session.press(key, dir);
      if (typeof r === 'object') {
        state.refusal = r.refused;
        return 'refused';
      }
      state.refusal = null;
      state.planned = state.fluid.session.planned();
      return r;
    },
    /** Fluid manoeuvring settings, taken at once while it runs: { rangeFt (500-1,000), bank ('gentle' | 'medium' | 'steep') }. */
    setFluid(next = {}) {
      if (next.rangeFt !== undefined) opts.fluidRangeFt = next.rangeFt;
      if (next.bank !== undefined) opts.fluidBank = next.bank;
      if (state.fluid) {
        if (next.rangeFt !== undefined) state.fluid.session.setRange(next.rangeFt);
        if (next.bank !== undefined) state.fluid.session.setBank(next.bank);
      }
    },
    /** Drops the queued press, if any. */
    clearQueue() {
      state.queued = null;
    },
    /** Flies one fixed step. */
    step() {
      if (state.fluid) {
        const f = state.fluid;
        const [lead, wing] = state.aircraft;
        f.prev = { lead: { ...lead }, wing: { ...wing } };
        f.session.step(lead, wing);
        state.tSec = Math.round((state.tSec + STEP_SEC) / STEP_SEC) * STEP_SEC;
        f.readouts = fluidReadouts(lead, wing, f.prev, opts.blockFt, f.session.now().key);
        state.planned = f.session.planned();
        keepTrack();
        keepRecord();
        if (f.session.done) finishFluid();
        return true;
      }
      // ctx: the live formation, so a line's tracker run-in is planned again at the hand-over (transitions.js flyStep, step 2)
      const ctx = { live: true, aircraft: state.aircraft, plans: state.plans };
      for (const a of state.aircraft) flyStep(a, state.plans[a.id] ?? (state.plans[a.id] = { segments: [] }), state.tSec, ctx);
      state.tSec = Math.round((state.tSec + STEP_SEC) / STEP_SEC) * STEP_SEC;
      keepTrack();
      keepRecord();
      const g = state.current?.gWarm;
      if (g) {
        const i = g.steps.findIndex((st) => state.tSec > st.t0 && state.tSec <= st.t1);
        if (i >= 0) for (const a of state.aircraft) {
          g.flown[i].min = Math.min(g.flown[i].min, a.g);
          g.flown[i].max = Math.max(g.flown[i].max, a.g);
        }
      }
      if (state.current && state.aircraft.every((a) => planDone(a, state.plans[a.id]) && (state.tSec >= state.current.endSec - STEP_SEC / 2))) finish();
      return true;
    },
  };
}

/** The formations the manoeuvre buttons fly from: line abreast, or a picture that is none of the close ones (after an in-place turn). */
const MOVES_FROM = ['lab', 'other'];
/** The same for the four: Spread 4, or a wide picture that is none of the formations (a column after an in-place turn). */
const MOVES_FROM_FOUR = ['spread4', 'other'];

/** G-warm's G flown against each call (design section 7): "in place 90 3.0 G (3 called), push over 0.5 G (0.5), …". */
function gFlownWords(g) {
  const parts = g.steps.map((st, i) => {
    const f = g.flown[i];
    if (st.g === 1 || !Number.isFinite(f.max)) return null;
    const flown = st.g < 1 ? f.min : f.max;
    return `${st.name} ${flown.toFixed(1)} G (${st.g} called)`;
  }).filter(Boolean);
  return `G flown: ${parts.join(', ')}.`;
}

/** The words for a press: "Hook right", "Shackle". */
export function labelFor(key, dir) {
  const m = MANOEUVRES[key] ?? (key === G_WARM.key ? G_WARM : null);
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
