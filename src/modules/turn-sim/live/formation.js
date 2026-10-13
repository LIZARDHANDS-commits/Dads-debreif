// The 2-ship in line abreast, flying on its own (Turn Sim first version, spec
// docs/modules/turn-sim/spec.md). It holds the two aircraft, takes button presses
// (one flown now, one queued), flies them in fixed steps, keeps the ground tracks
// and a rolling record, and judges the picture once both have rolled out.
//
// Aircraft are a list, each with the aircraft it flies off (`ref`), so more
// aircraft can join later without rewriting the logic (spec section 6). Lead is
// the first aircraft and the one the others are judged from.
import { DEG } from '../../../core/angles.js';
import { iasToTasKt } from '../../../core/t6-performance.js';
import { KT_TO_FTPS } from '../../../core/units.js';
import { createEvents } from './events.js';
import { STEP_SEC, makeAircraft, planDone, planDoneBut, copyAircraft } from './flight.js';
import { MANOEUVRES, planManoeuvre, relativeTo, TURN_BANK_DEG, TURN_G } from './manoeuvres.js';
import { flyStep, dryRunT, speedSeg } from './replay.js';
import { setKias } from './pilot.js';
import { resolveErrors, resolveFixTools, applyStartErrors, planWithErrors, outcomeOf, offStandardOutcome, responseOf } from './errors.js';
import { FOUR_SHIP_KEYS, fourShipStart, planFour } from './four-ship.js';
import { OFFSET_BOX_KEYS, planOffsetBoxTurn } from './offset-box-turns.js';
import { G_WARM, planGWarm } from './g-warm.js';
import { classify, judge, judgeFluid4 } from './judge.js';
import { FORMATIONS, FOUR_FORMATIONS, pairSlot, setEchelonShift, sideFor } from './slots.js';
import { LEAD_ROLL, LEAD_ROLL_STATE } from './lead-moves.js';
import { leadPointMassOf } from './lead-pilot.js'; // also registers Lead's point-mass pilot step with flight.js (TS-225) for the pointMassLead below
import { startFrom, stepWingman, applyTo, settledOn, withPlace, withChange } from './wingman/wingman.js';
import { stationChange } from './wingman/supervisor.js';
import { CHANGE_LIMIT_SEC } from './transitions.js';
import { KIAS_OUTSIDE_LAB } from './moves.js';
import { planChangeFour } from './four-plan.js';
import { chooseChange } from './chooser.js';
import { FW_TURN_KEYS, TURN_FORMATIONS, FW_MOVES, CLOSE_MOVES, planFormationTurn, planCloseMove, planFluid4Turn } from './formation-turns.js';
import { planFwMoveLive } from './fw-live.js';
import { createFluidSession, fluidReadouts, bankDegFor } from './fluid.js';
import { FLUID_MOVES } from './fluid-lead.js';
import { LAG_ROLL_KEY } from './lag-roll.js';
import { MOVE_IN_BAND_KEY, placeNow } from './move-in-band.js';
import { labelFor, gFlownWords } from './formation-words.js';

/**
 * The first version's fixed numbers. Speeds name their kind (rule book): kias is
 * indicated, and the aircraft fly it as true airspeed at the block height.
 */
export const LIVE_DEFAULTS = Object.freeze({
  spacingFt: 5000, // the middle of the 4,000 to 6,000 ft band (SMM 16.18 para 49; Patrick 5 Oct 22:46Z: "5000")
  wingSide: /** @type {'right' | 'left'} */ ('right'), // #2 on Lead's right
  kias: 220, // SMM 16.18 para 50
  blockFt: 8000, // estimate until Patrick gives the low block height
  headingDeg: 0, // Lead flies 000 at the start
  ships: /** @type {2 | 4} */ (2), // 2-ship (the default) or 4-ship (Spread 4, live/four-ship.js)
  check45: true, // the 4-ship delayed 45 flies its check turn (AFM8 brief p.18, SMM Fig 16.34); off: a plain chain (Patrick, 4 Oct 11:28Z)
  fluidRangeFt: 600, // fluid manoeuvring distance, 500-1,000 ft (SMM 16.17 para 42); 600 is Patrick's pick (19:20Z row 3), an estimate
  fluidBank: /** @type {'gentle' | 'medium' | 'steep'} */ ('medium'), // Lead's level turn bank in fluid manoeuvring: 60/2 (AFM7 brief p.17)
  closeWing: /** @type {'held' | 'live'} */ ('held'), // #2 in close formation: held (today's planned poses) or live (the close-in wingman, TS-226, B1: the idle echelon hold); read at each press
});

/** Spacing the sim will fly at all; outside it a typed value is refused (spec section 5). */
export const SPACING_LIMITS_FT = Object.freeze([1000, 20000]);
/** The SMM's line abreast band (SMM 16.18 para 49); outside it the spacing is flown and flagged. */
const SPACING_BAND_FT = Object.freeze([4000, 6000]);
/** Ground tracks are kept at this interval, for the whole flight (up to the cap). */
const TRACK_EVERY_SEC = 0.25;
const TRACK_MAX_POINTS = 20000; // over 80 minutes at 0.25 s
/** The rolling record holds every step of the last this-many seconds (spec section 6). */
const RECORD_SEC = 600;
const RECORD_MAX = Math.round(RECORD_SEC / STEP_SEC);

/** A change pressed in fluid manoeuvring is planned only with Lead within this of level (TS-86; estimates). */
const FLUID_CHANGE_MAX_BANK_DEG = 90;
const FLUID_CHANGE_MAX_CLIMB_DEG = 30;

/** Math radians from a compass heading in degrees (formation-words.js compassDeg is the other way). */
function headingRadFromCompass(deg) {
  return (90 - deg) * DEG;
}

/** True airspeed (ft/s) for an indicated airspeed at the block height. */
function tasFtpsFor(kias, blockFt) {
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
    fluid: null, // fluid manoeuvring while it runs: { session, readouts, prev } (fluid.js, TS-57), else null
    closeWing: opts.closeWing, // the close-formation wingman setting as read at the last press (Held or Live)
    liveWing: null, // the live close-in wingman flying #2 while nothing is being flown (wingman.js state, B1), else null
    liveTrace: null, // what he saw and did on the last step (wingman.js trace), for the gauge and the plot page
  };
  let record = [];
  // The events of a change in flight: the decision point, the picture breaking, a turn pressed mid-change, done (events.js).
  const events = createEvents({ state, startChange: (to, o, midLead) => startChange(to, o, midLead), labelFor });
  const { midPress, turnMidChange, replanAtEvents, inBandAndSteady } = events;

  function build() {
    const tas = tasFtpsFor(opts.kias, opts.blockFt);
    const h = headingRadFromCompass(opts.headingDeg);
    const side = opts.wingSide === 'left' ? 1 : -1; // +1 left of Lead
    const left = { x: Math.cos(h + Math.PI / 2), y: Math.sin(h + Math.PI / 2) };
    // Lead rolls at his 90°/s in every programme move that names no roll (TS-222); pointMassLead: the 2-ship's Lead flies his
    // programme on the point mass (TS-225, lead-pilot.js; the switch is lead-moves.js LEAD_PILOT.onePointMass).
    const lead = { ...makeAircraft({ id: 1, xFt: 0, yFt: 0, headingRad: h, kias: opts.kias, tasFtps: tas }), ref: null, name: 'Lead', techRoll: LEAD_ROLL, ...LEAD_ROLL_STATE, pointMassLead: true };
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
    state.closeWing = opts.closeWing;
    state.liveWing = null;
    state.liveTrace = null;
    record = [];
    keepTrack(true);
    // Smart wingman, fix now (TS-96; Patrick 5 Oct 23:33Z): #2 flies back into line abreast from where the error put him at
    // once, by the chooser's race ("from here" among them); the timing error, a roll-in's, still waits for the next turn.
    if (state.errors?.fixNow) startChange('lab', {});
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
    // In Fluid 4 the two elements turn: Lead and #3 in line abreast, #2 and #4 in fighting wing on them (planFluid4Turn).
    const fluid4 = four && where.key === 'fluid4' && FOUR_SHIP_KEYS.includes(key);
    // In the offset box each element flies the line abreast manoeuvre, the rear one after its delay (offset-box-turns.js, TS-135).
    const box = four && where.key === 'offsetBox' && OFFSET_BOX_KEYS.includes(key);
    const turnIn = fluid4 || box || (FW_TURN_KEYS.includes(key) && TURN_FORMATIONS[four ? 4 : 2].includes(where.key)) ? { key: where.key, side: where.side } : null;
    // A turn called while the last tactical turn's reset to speed is still running takes them back to that same speed
    // after it (TS-204; manoeuvres.js backToSpeed reads homeKias).
    for (const a of state.aircraft) {
      const reset = state.plans[a.id]?.segments.find((seg) => seg.background && seg.kind === 'speed');
      if (reset) a.homeKias = reset.toKias;
      else delete a.homeKias;
    }
    const plan = box
      ? planOffsetBoxTurn(state.aircraft, key, dir, state.tSec, { spacingFt: state.spacingFt ?? opts.spacingFt })
      : fluid4
      ? planFluid4Turn(state.aircraft, key, dir, state.tSec, { blockFt: opts.blockFt })
      : turnIn
      ? planFormationTurn(state.aircraft, turnIn, key, dir, state.tSec, { blockFt: opts.blockFt })
      : key === G_WARM.key
      ? planGWarm(state.aircraft, state.tSec)
      : four
      ? planFour(state.aircraft, key, dir, state.tSec, { check45: opts.check45 !== false })
      : state.errors && key !== 'breakRejoin'
        ? planWithErrors(state.aircraft, key, dir, state.tSec, state.errors, state.slot, { tools: resolveFixTools(opts), blockFt: opts.blockFt })
        : planManoeuvre(state.aircraft, key, dir, state.tSec);
    if (plan.ok === false) {
      state.refusal = plan.reason;
      return false;
    }
    if (plan.slotAfter) state.slot = plan.slotAfter; // the next press starts after this one ends
    // After a break and rejoin the pair waits in trail; the TRJ from there takes the echelon side #2 broke from (TS-174/175).
    state.trailSide = key === 'breakRejoin' ? plan.side : null;
    state.plans = plan.plans;
    state.planned = {};
    let endSec = state.tSec;
    for (const a of state.aircraft) {
      const p = state.plans[a.id] ?? { segments: [] };
      state.plans[a.id] = p;
      const run = dryRunT(a, p, state.tSec);
      state.planned[a.id] = run.points;
      // The reset to speed after a tactical turn runs in the background (TS-204): the manoeuvre ends at the roll-out.
      const fg = p.segments.some((seg) => seg.background) ? dryRunT(a, { ...p, segments: p.segments.filter((seg) => !seg.background) }, state.tSec) : run;
      // ... but not before a height leg still being flown (the crossing turns' miss) is done.
      const profileEnd = p.profile?.length ? p.profile[p.profile.length - 1].t1 : 0;
      endSec = Math.max(endSec, state.tSec + fg.durationSec, profileEnd);
    }
    state.current = {
      key,
      dir: m.sided ? dir : 0,
      label: labelFor(key, dir),
      note: plan.note,
      firstId: plan.firstId ?? null,
      shape: turnIn ? 'formation' : m.kind === 'break' || (m.kind === 'together' && m.turnDeg > 30 && m.turnDeg < 180) ? 'trail' : 'abreast',
      formationTurn: turnIn,
      flag: plan.flag ?? null,
      startSec: state.tSec,
      endSec,
      errorRun: plan.errorRun ?? null,
      // G-warm: its steps, and the least and most G any of the four pulled in each (design section 7: G flown against the call).
      gWarm: plan.steps ? { steps: plan.steps, flown: plan.steps.map(() => ({ min: Infinity, max: -Infinity })), spacingAfter: plan.spacingAfter } : null,
    };
    liveTurn(turnIn);
    state.judged = null;
    state.refusal = null;
    state.errorOutcome = null;
    return true;
  }

  /**
   * With Live chosen at the press (B2, TS-226), a 2-ship close turn in echelon (and Wings level, Reversal) flies Lead's
   * plan only: #2 stays on the live close-in wingman through it, started now from the motion he has if he was not on it.
   * The path drawn ahead is flown ahead at the press, Lead's plan and the wingman's law together on copies, so the drawn
   * path is the flown one (spec 7b.6d item 9, fw-live.js planFwMoveLive's pattern); the turn is done when Lead's plan is
   * done and #2 is settled on his place (or LIVE_TURN_SETTLE_CAP_SEC after Lead's, an estimate). where: { key, side }.
   * B3 (TS-231, spec 7c.2): in every close formation, echelon, route, line astern and the corner.
   */
  function liveTurn(where) {
    const c = state.current;
    if (!c || state.closeWing !== 'live' || state.aircraft.length !== 2 || !LIVE_CLOSE.includes(where?.key)) return;
    const [lead, wing] = state.aircraft;
    if (!state.liveWing) state.liveWing = startFrom(wing, leadPointMassOf(lead, opts.blockFt), { blockFt: opts.blockFt, key: where.key, side: where.side || sideOfTwo() });
    state.plans[wing.id] = { segments: [] };
    const a = copyAircraft(lead);
    const lp = state.plans[lead.id] ?? { segments: [] };
    const p = { segments: lp.segments.map((seg) => ({ ...seg })), profile: lp.profile };
    let w = state.liveWing;
    let t = state.tSec;
    let leadDoneAt = null;
    const every = Math.round(0.25 / STEP_SEC);
    const pts = [[t, wing.xFt, wing.yFt, wing.altAboveFt]];
    for (let i = 1; t - state.tSec < 600; i++) {
      const refSt = leadPointMassOf(a, opts.blockFt);
      flyStep(a, p, t);
      w = stepWingman(w, refSt).w;
      t += STEP_SEC;
      if (i % every === 0) pts.push([t, w.st.pm.x, w.st.pm.y, w.st.pm.z - opts.blockFt]);
      if (leadDoneAt === null && planDone(a, p)) leadDoneAt = t;
      if (leadDoneAt !== null && (settledOn(w, leadPointMassOf(a, opts.blockFt)) || t - leadDoneAt >= LIVE_TURN_SETTLE_CAP_SEC)) break;
    }
    pts.push([t, w.st.pm.x, w.st.pm.y, w.st.pm.z - opts.blockFt]);
    state.planned[wing.id] = pts;
    c.endSec = Math.max(c.endSec, t);
    c.liveTurn = true;
  }

  /** The side #2 is on now, +1 left of Lead, -1 right. */
  function sideOfTwo() {
    const [lead, two] = state.aircraft;
    return Math.sign(relativeTo(lead, two).left) || state.lastSide || -1;
  }

  /** Where the formation is now (judge.js classify, 2- or 4-ship), remembering which side #2 is on. */
  function whereNow() {
    const c = classify(state.aircraft);
    if (c.side) state.lastSide = c.side;
    return c;
  }

  /**
   * Plans and starts a change of formation from the formation as it is now: transitions.js for the pair,
   * four-plan.js for the four. Returns false, with state.refusal saying why in one line, when there is no safe
   * plan; nothing then changes.
   */
  function startChange(to, changeOptions, midLead = null) {
    if (to === 'fluid') return startFluid();
    const from = whereNow();
    const four = state.aircraft.length > 2;
    // B3 (spec 7c.3, TS-231): with Live, a change between the close formations is flown by the live wingman himself.
    if (!four && !midLead && !state.errors && state.closeWing === 'live' && LIVE_CLOSE.includes(from.key) && LIVE_CLOSE.includes(to)) return startLiveChange(from, to, changeOptions);
    // A training error set (TS-62): the chooser races "from here" too, from wherever the error put #2.
    // midLead: Lead's own flying when a turn button is pressed mid-change (turnMidChange); otherwise how the press leaves him.
    const mid = midLead ? { lead: { kind: 'carry', plan: midLead } } : state.current ? midPress(state.current) : null;
    const planOpts = { ...changeOptions, spacingFt: state.spacingFt, blockFt: opts.blockFt, lastSide: state.lastSide, trailSide: four ? null : state.trailSide ?? null, errors: four ? null : state.errors, mid };
    // The 2-ship: the chooser (chooser.js, TS-76) runs every planner that applies (the turning rejoin, TS-68; the
    // straight-ahead rejoin, TS-72; echelon or route out to fighting wing, TS-73; opening out at full power, TS-88; a line
    // then the tracker, TS-65; "from here" after a training error's start or a press mid-move; the tracker alone) and flies
    // the one that passes the pilot's checks quickest; #2's lag roll (TS-71) is its own button and only candidate (TS-94).
    const plan = four
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
    state.trailSide = null; // the wait in trail after a break ends with the rejoin (TS-175)
    state.current = {
      key: `change:${to}`,
      // liveHand: a 2-ship change into echelon with Live chosen ends on the live wingman's hand-over test (events.js inBandAndSteady).
      change: { to: plan.to ?? to, side: plan.side, from: plan.from, liveHand: !four && LIVE_CLOSE.includes(plan.to ?? to) && state.closeWing === 'live', holdsPlan: four || Boolean(plan.holdsPlan), rejoining: plan.rejoining, rejoinKind: plan.rejoinKind, flying: plan.flying, maxBankDeg: plan.maxBankDeg, four, offStandard: plan.offStandard ?? null, chooser: plan.chooser ?? null, options: changeOptions },
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
   * A change between the close formations flown by the live close-in wingman (B3; spec 7c.3-7c.5, TS-231): echelon, route,
   * line astern and the corner, either side. He flies a short list of places in Lead's frame (supervisor.js stationChange)
   * at no more than the jogging pace, flowing through each place on the way and stopping on the last, with the deconfliction
   * guards; Lead flies straight on (at the close formations' speed if he is not at it). The path drawn ahead is flown ahead
   * at the press with the same law (as liveTurn). Done when he is on the last place, in band, closing under 5 kt, his bank
   * within 10° of Lead's and on the new side (events.js). from: { key, side }, the formation he is in.
   */
  function startLiveChange(from, to, changeOptions) {
    const [lead, wing] = state.aircraft;
    const sCur = from.side || state.lastSide || -1;
    const sTo = sideFor(to, changeOptions.side ?? 'keep', sCur);
    if (from.key === to && (to === 'astern' || sTo === sCur)) {
      state.refusal = `Already in ${FORMATIONS[to].label.toLowerCase()}.`;
      return false;
    }
    const places = stationChange(from.key, sCur, to, sTo);
    if (!places.length) {
      state.refusal = 'Nothing to change.';
      return false;
    }
    const w0 = state.liveWing ?? startFrom(wing, leadPointMassOf(lead, opts.blockFt), { blockFt: opts.blockFt, key: from.key, side: sCur });
    const w1 = withChange(w0, places, to);
    const leadSegs = Math.abs(lead.kias - KIAS_OUTSIDE_LAB) > 0.5 ? [speedSeg(lead.kias, KIAS_OUTSIDE_LAB, opts.blockFt)] : [];
    // The path ahead, flown ahead: Lead's plan and the wingman's law together on copies, until he has settled on his new
    // place (or the change limit, a catch: then nothing is flown).
    const a = copyAircraft(lead);
    const p = { segments: leadSegs.map((seg) => ({ ...seg })) };
    let w = w1;
    let t = state.tSec;
    const every = Math.round(0.25 / STEP_SEC);
    const pts = [[t, wing.xFt, wing.yFt, wing.altAboveFt]];
    let done = false;
    for (let i = 1; t - state.tSec < CHANGE_LIMIT_SEC; i++) {
      const refSt = leadPointMassOf(a, opts.blockFt);
      flyStep(a, p, t);
      w = stepWingman(w, refSt).w;
      t += STEP_SEC;
      if (i % every === 0) pts.push([t, w.st.pm.x, w.st.pm.y, w.st.pm.z - opts.blockFt]);
      if (!w.route && planDone(a, p) && settledOn(w, leadPointMassOf(a, opts.blockFt))) {
        done = true;
        break;
      }
    }
    if (!done) {
      state.refusal = `No safe change from here: #2 does not settle in ${FORMATIONS[to].label.toLowerCase()} inside ${Math.round(CHANGE_LIMIT_SEC / 60)} minutes.`;
      return false;
    }
    pts.push([t, w.st.pm.x, w.st.pm.y, w.st.pm.z - opts.blockFt]);
    state.liveWing = w1;
    state.liveTrace = null;
    state.refusal = null;
    state.plans = { [lead.id]: { segments: leadSegs }, [wing.id]: { segments: [] } };
    state.planned = { [lead.id]: dryRunT(lead, state.plans[lead.id], state.tSec).points, [wing.id]: pts };
    state.trailSide = null;
    const side = (s) => (s > 0 ? ' left' : ' right');
    const label = `${FORMATIONS[to].label}${to === 'astern' ? '' : side(sTo)}`;
    const fromWord = `${FORMATIONS[from.key].label}${from.key === 'astern' ? '' : side(sCur)}`;
    const via = places.slice(0, -1).map((pl) => `${FORMATIONS[pl.key].label.toLowerCase()}${pl.key === 'astern' ? '' : side(pl.side)}`);
    state.current = {
      key: `change:${to}`,
      change: { to, side: sTo, from: from.key, live: true, liveHand: false, holdsPlan: false, rejoining: false, rejoinKind: 'none', flying: `${fromWord} to ${label} (station change, live)`, maxBankDeg: null, four: false, offStandard: null, chooser: null, options: changeOptions },
      dir: 0,
      label,
      note: `${fromWord} to ${label}: #2 flies it himself${via.length ? ` through ${via.join(', then ')}` : ''}, at no more than a jog (8 ft/s), passing below and behind Lead (SMM 12.20 paras 44-47).`,
      firstId: null,
      shape: 'abreast',
      startSec: state.tSec,
      endSec: t,
      errorRun: null,
      liveChange: true,
    };
    state.judged = null;
    state.errorOutcome = null;
    return true;
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

  /**
   * A Change formation press in fluid manoeuvring or its Terminate (Patrick 5 Oct 22:32Z: "after fluid manoeuvring the
   * planes seem to get stuck in that I can't rejoin"; TS-86): the session ends and the change is planned from where the
   * pair is, like any press mid-move (TS-78). Refused, with fluid going on, only while Lead is far from level (a loop's
   * top, a wingover): planned from there the change would start from an attitude the planners don't fly.
   */
  function changeFromFluid(to, options) {
    const lead = state.aircraft[0];
    const climbDeg = Math.atan2(lead.climbFtps ?? 0, Math.max(lead.tasFtps, 1)) / DEG;
    if (Math.abs(lead.bankDeg) > FLUID_CHANGE_MAX_BANK_DEG || Math.abs(climbDeg) > FLUID_CHANGE_MAX_CLIMB_DEG) {
      state.refusal = 'Lead is in the vertical; press again once he is back near level.';
      return 'refused';
    }
    const f = state.fluid;
    const cur = state.current;
    state.fluid = null;
    state.current = null;
    if (startChange(to, options)) return 'started';
    state.fluid = f;
    state.current = cur;
    return 'refused';
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
    // A change into a close formation hands #2 to the live wingman there (B3), whatever the classifier reads at the line.
    const into = state.current.change && LIVE_CLOSE.includes(state.current.change.to) ? { key: state.current.change.to, side: state.current.change.side } : null;
    if (state.current.change) {
      // A change of formation is judged against the target formation's band in the spec table (section 10; the four:
      // design section 7, each link against the aircraft it flies off).
      const c = state.current.change;
      const j = judge(state.aircraft, { key: c.to, side: c.side }, { spacingFt: state.spacingFt });
      state.judged = { label: state.current.label, shape: 'formation', labels: j.inBand ? ['IN POSITION'] : j.labels, text: j.text, tone: j.tone, ...(c.four ? { ships: j.ships } : {}) };
      // A change flown from a training error's start (TS-62) says on the card how #2 dealt with it.
      if (c.offStandard) state.errorOutcome = offStandardOutcome(c.offStandard, j.inBand, state.current.label);
      // A line abreast move in the band (TS-98) leaves #2 off the 5,000 ft picture; the next turn treats that as where he
      // starts from, and Smart wingman fixes it there or carries it, as for a set error (Patrick 23:54Z: the next move ends in position).
      if (state.current.key === `change:${MOVE_IN_BAND_KEY}` && c.to === 'lab') {
        const at = placeNow(lead, wing);
        const side = Math.sign(state.slot.left) || 1;
        state.errors = { ...(state.errors ?? { timingSec: 0, speedKias: 0, random: false }), foreFt: at.fwd - state.slot.fwd, spacingFt: side * at.left - Math.abs(state.slot.left), heightFt: at.alt, response: responseOf(opts), fixNow: false };
      }
    } else if (state.current.gWarm) {
      // G-warm ends in line abreast at the tightened gap (AFM8 brief p.16 item 5); that gap is the four's from now on.
      const g = state.current.gWarm;
      state.spacingFt = g.spacingAfter;
      state.judged = { label: state.current.label, ...judge(state.aircraft, { shape: 'abreast' }, { spacingFt: state.spacingFt }), gFlown: gFlownWords(g) };
    } else if (state.current.formationTurn) {
      // A turn in fighting wing or a close formation ends judged against that formation (spec section 10 table; the four, link by link).
      const ft = state.current.formationTurn;
      const four = state.aircraft.length > 2;
      // Fluid 4: the elements against the line abreast roll-out, the wingmen in the cone on their leaders (judgeFluid4).
      const f4 = ft.key === 'fluid4' ? judgeFluid4(state.aircraft, MANOEUVRES[state.current.key]?.kind === 'together' && MANOEUVRES[state.current.key].turnDeg > 30 && MANOEUVRES[state.current.key].turnDeg < 180 ? 'trail' : 'abreast', state.spacingFt) : null;
      const j = f4 ? { inBand: f4.labels[0] === 'IN POSITION', labels: f4.labels, text: `Fluid 4: ${f4.labels.join(', ')}.`, tone: f4.labels[0] === 'IN POSITION' ? 'good' : 'caution', ships: f4.ships } : judge(state.aircraft, { key: ft.key, side: ft.key === 'offsetBox' ? sideOfTwo() : ft.side }, { spacingFt: state.spacingFt }); // the box's turns swap #2's side (TS-135)
      state.judged = { label: state.current.label, shape: 'formation', labels: j.inBand ? ['IN POSITION'] : j.labels, text: j.text, tone: j.tone, ...(four ? { ships: j.ships } : {}) };
      if (four && ft.key === 'offsetBox') {
        const [L, , three, fourShip] = state.aircraft;
        const s = sideOfTwo();
        const r3 = relativeTo(L, three);
        const r4 = relativeTo(L, fourShip);
        const slotAcross = s * state.spacingFt / 2;
        const fourInSlot = Math.abs(r4.left - slotAcross) < Math.abs(r3.left - slotAcross);
        if (fourInSlot) {
          fourShip.ref = 1;
          three.ref = 4;
        } else {
          three.ref = 1;
          fourShip.ref = 3;
        }
      }
    } else {
      state.judged = { label: state.current.label, ...judge(state.aircraft, { shape: state.current.shape }, { spacingFt: state.spacingFt }) };
      if (state.current.errorRun) {
        state.errorOutcome = outcomeOf(state.current.errorRun, lead, wing, state.current.label);
        // After a full-power turn the speed is still coming back (TS-204) and #2's fix is planned to that end: judged again then.
        const resetting = state.aircraft.some((a) => state.plans[a.id]?.segments.some((seg) => seg.background));
        if (resetting) state.errorOutcome.rejudge = { run: state.current.errorRun, label: state.current.label };
      }
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
    startLiveWing(into);
  }

  /**
   * With Live chosen at the last press (B1, TS-226), the pair idle in a close formation (echelon in B1 and B2; route, line
   * astern and the corner since B3, TS-231): the close-in wingman flies #2 from here, from the motion the manoeuvre left him
   * (wingman.js startFrom, bumpless: spec 7b.6d item 2). What is left of #2's plan (the held poses' tail) is dropped, so the
   * next press plans him from where he is. The next press hands him back (step()). into: { key, side }, the close formation
   * a change has just ended in (else where the classifier says the pair is).
   */
  function startLiveWing(into = null) {
    if (state.closeWing !== 'live' || state.aircraft.length !== 2 || state.current || state.fluid || state.liveWing) return;
    const where = into ?? whereNow();
    if (!LIVE_CLOSE.includes(where.key)) return;
    const [lead, wing] = state.aircraft;
    state.plans[wing.id] = { segments: [] };
    state.liveWing = startFrom(wing, leadPointMassOf(lead, opts.blockFt), { blockFt: opts.blockFt, key: where.key, side: where.side || sideOfTwo() });
  }

  /**
   * With nothing being flown, every aircraft straight and level and its plan done, a wingman holds Lead's heading as a
   * pilot holds his place: a change counts as done once he is in his band and steady (under 5 kt against his place), so he
   * can finish a fraction of a degree off Lead's heading, and flown on straight that took him across the formation (Patrick
   * 11 Oct 2026 08:30Z: after route to echelon "drift all the way into the lead aircraft"). Within IDLE_TRIM.offRad of
   * Lead's heading he eases onto it at IDLE_TRIM.rateRad a second, too slow to see, and onto his speed the same way.
   */
  function holdStationIdle() {
    if (state.current || state.fluid) return;
    const lead = state.aircraft[0];
    // The heading trim runs through a reset to speed after a tactical turn too (TS-204); the speed trim waits for its end.
    if (lead.bankDeg !== 0 || !planDoneBut(lead, state.plans[lead.id])) return;
    for (const a of state.aircraft.slice(1)) {
      if (state.liveWing && a.id === 2) continue; // the live close-in wingman holds his own place (B1)
      if (a.bankDeg !== 0 || !planDoneBut(a, state.plans[a.id])) continue;
      const off = Math.atan2(Math.sin(a.headingRad - lead.headingRad), Math.cos(a.headingRad - lead.headingRad));
      if (Math.abs(off) > IDLE_TRIM.offRad) continue;
      const trim = IDLE_TRIM.rateRad * STEP_SEC;
      a.headingRad = Math.abs(off) <= trim ? lead.headingRad : a.headingRad - Math.sign(off) * trim;
      // and his speed the same way, so he doesn't creep fore or aft
      const dk = a.kias - lead.kias;
      const kTrim = IDLE_TRIM.ktps * STEP_SEC;
      if (!planDone(lead, state.plans[lead.id]) || !planDone(a, state.plans[a.id])) continue;
      if (dk !== 0 && Math.abs(dk) <= IDLE_TRIM.offKt) setKias(a, Math.abs(dk) <= kTrim ? lead.kias : a.kias - Math.sign(dk) * kTrim);
    }
  }

  /** Why a manoeuvre can't be flown from where the formation is now, or null (spec sections 8 and 10: line abreast only). */
  function refuseMove(key, dir) {
    const where = whereNow().key;
    const four = state.aircraft.length > 2;
    // Break and rejoin: the 2-ship, from echelon only (TS-175).
    if (key === 'breakRejoin') return four ? 'Break and rejoin is a 2-ship start for now.' : where === 'echelon' ? null : 'Break and rejoin starts from echelon; change to echelon first.';
    if (four && key === G_WARM.key) return where === 'spread4' ? null : 'G-warm starts from Spread 4; change to Spread 4 first.';
    // The turns fly in fighting wing (TS-55) and the close formations too (spec section 10.2).
    if (FW_TURN_KEYS.includes(key) && TURN_FORMATIONS[four ? 4 : 2].includes(where)) return null;
    // Fluid 4: Spread 4's five turns, flown by the two elements (Patrick 6 Oct 04:56Z; card 04:59Z "Spread 4's five").
    if (four && where === 'fluid4') return FOUR_SHIP_KEYS.includes(key) ? null : `${labelFor(key, dir)} is not flown in Fluid 4.`;
    // The offset box: Spread 4's five and the shackle (SMM 16.41 para 112; TS-135).
    if (four && where === 'offsetBox') return OFFSET_BOX_KEYS.includes(key) ? null : `${labelFor(key, dir)} is not flown in the offset box.`;
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
     * The echelon setting (TS-230; slots.js): feet along the spinner-to-wingtip line from echelon's place, + down it. A live
     * close-in wingman flies to the new place at once; planned flying takes it at the next press. Returns the setting.
     */
    setEchelonShift(ft) {
      const v = setEchelonShift(ft);
      const w = state.liveWing;
      if (w) state.liveWing = withPlace(w, pairSlot(w.key, w.side)); // route and the corner move with echelon (TS-230, TS-231)
      return v;
    },
    /** Changes options read only when a manoeuvre is planned (the 4-ship check turn), without starting again. */
    setOptions(next = {}) {
      opts = { ...opts, ...next };
      // "#2 in close formation" switched while nothing is being flown takes effect at once (Patrick 14 Oct 2026: the echelon
      // line control did nothing until the next press): Live starts the live wingman in echelon from where #2 is; Held hands
      // him back (he flies straight on, the idle trim holding Lead's heading). During a press it waits for the next one.
      if ('closeWing' in next && !state.current && !state.fluid) {
        state.closeWing = opts.closeWing;
        if (opts.closeWing === 'live') startLiveWing();
        else if (state.liveWing) {
          state.liveWing = null;
          state.liveTrace = null;
        }
      }
    },
    /**
     * A button press. Flown at once when nothing is being flown; a turn button while #2 is changing formation (2-ship) is
     * flown at once too, the change planned again around it (turnMidChange); otherwise queued and flown the moment the
     * current manoeuvre ends (a later press replaces the queued one). Returns 'started' or 'queued'.
     */
    press(key, dir = 1) {
      state.closeWing = opts.closeWing;
      if (state.fluid) {
        state.refusal = 'In fluid manoeuvring Lead flies the fluid buttons; Terminate first.';
        return 'refused';
      }
      const four = state.aircraft.length > 2;
      if (key === G_WARM.key && !four) throw new Error('G-warm is a four-ship manoeuvre for now (it starts from Spread 4)');
      if (!MANOEUVRES[key] && key !== G_WARM.key) throw new Error(`No manoeuvre called ${key}`);
      if (four && !OFFSET_BOX_KEYS.includes(key) && key !== G_WARM.key) throw new Error(`${key} is not a four-ship manoeuvre`); // the shackle only in the offset box (refuseMove)
      // The manoeuvres are line abreast manoeuvres (spec sections 8 and 10); the turn buttons also fly in fighting wing and the close formations (10.2).
      if (!state.current) {
        const why = refuseMove(key, dir);
        if (why) {
          state.refusal = why;
          return 'refused';
        }
      }
      if (!state.current) return start(key, dir) ? 'started' : 'refused';
      if (!four && turnMidChange(key, dir)) return 'started';
      state.queued = { key, dir, label: labelFor(key, dir) };
      return 'queued';
    },
    /**
     * A "Change formation" press (spec section 10, transitions.js): to is 'lab', 'fw', 'echelon', 'route' or 'astern';
     * for the four (spec section 8, four-plan.js) one of slots.js FOUR_FORMATIONS' keys;
     * options: { side: 'keep' | 'left' | 'right', rejoin: 'into' | 'straight' }. Flown at once when nothing is being
     * flown, otherwise queued like a manoeuvre. Returns 'started', 'queued' or 'refused' (state.refusal says why).
     */
    change(to, options = {}) {
      state.closeWing = opts.closeWing;
      if (state.fluid) return changeFromFluid(to, options);
      if (state.current) {
        const four = state.aircraft.length > 2;
        const label = (four ? FOUR_FORMATIONS[to]?.label : FORMATIONS[to]?.label) ?? to;
        state.queued = { key: `change:${to}`, dir: 0, label, change: { to, options } };
        return 'queued';
      }
      return startChange(to, options) ? 'started' : 'refused';
    },
    /**
     * #2's lag roll to fighting wing on Lead's other side (spec section 10.8, lag-roll.js, TS-71): 2-ship, from fighting wing
     * or echelon (TS-78), Lead straight and level. Flown at once when nothing is being flown, otherwise queued like a change. Returns 'started',
     * 'queued' or 'refused' (state.refusal says why).
     */
    lagRoll() {
      if (state.fluid) {
        state.refusal = 'Terminate fluid manoeuvring first; the lag roll starts from fighting wing or echelon.';
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
      const c = state.current;
      if (c && !c.fwMove && c.change?.to !== 'fw') return refuse(`Wait for ${c.label} to finish.`);
      if (!c?.fwMove && whereNow().key !== 'fw') return refuse('These are fighting wing moves; change to fighting wing first.');
      // The wingmen on the live law (fw-live.js, TS-202, TS-206, TS-208), carrying on their live states from the move being
      // flown when there is one. The only law for these moves since Patrick flew it (12 Oct 2026: "Live fighting wing is
      // fine. make it the default and get rid of it"); the tracker's (formation-turns.js planFwMove) is no longer called.
      const ws0 = c?.fwLive ? c.fwLive[Math.round((state.tSec - c.startSec) / STEP_SEC) - 1] ?? null : null;
      const plan = planFwMoveLive(state.aircraft, key, dir, state.tSec, { blockFt: opts.blockFt, bankDeg: bankDegFor(opts.fluidBank), ws0 });
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
        formationTurn: { key: 'fw', side: state.lastSide }, fwMove: true, fwLive: plan.wsTrack ?? null, flag: null, startSec: state.tSec, endSec, errorRun: null, gWarm: null,
      };
      state.queued = null;
      state.judged = null;
      state.refusal = null;
      state.errorOutcome = null;
      return 'started';
    },
    /**
     * Lead's Wings level or Reversal in a 2-ship close formation (formation-turns.js CLOSE_MOVES, planCloseMove): flown at
     * once, also part way through a close turn, which it replaces. Returns 'started' or 'refused' (state.refusal says why).
     */
    pressClose(key) {
      const refuse = (why) => {
        state.refusal = why;
        return 'refused';
      };
      if (!CLOSE_MOVES[key]) throw new Error(`No close formation move called ${key}`);
      if (state.fluid) return refuse('In fluid manoeuvring Lead flies the fluid buttons; Terminate first.');
      const c = state.current;
      if (c && !(c.formationTurn && c.formationTurn.key !== 'fw')) return refuse(`Wait for ${c.label} to finish.`);
      const where = c ? c.formationTurn : whereNow();
      const plan = planCloseMove(state.aircraft, where, key, state.tSec);
      if (!plan.ok) return refuse(plan.reason);
      state.plans = plan.plans;
      state.planned = {};
      let endSec = state.tSec;
      for (const a of state.aircraft) {
        const run = dryRunT(a, state.plans[a.id], state.tSec);
        state.planned[a.id] = run.points;
        endSec = Math.max(endSec, state.tSec + run.durationSec);
      }
      state.current = {
        key, dir: 0, label: CLOSE_MOVES[key].label, note: plan.note, firstId: null, shape: 'formation',
        formationTurn: where, closeMove: true, flag: null, startSec: state.tSec, endSec, errorRun: null, gWarm: null,
      };
      liveTurn(where);
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
    /**
     * Fluid manoeuvring settings, taken at once while it runs: { rangeFt (500-1,000), bank ('gentle' | 'medium' | 'steep') }.
     * (`wing`, the Planned or Live choice, went with the planned wingman, TS-199: #2 is the live wingman, TS-194.)
     */
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
      // ctx: the live formation, so a line's tracker run-in is planned again at the hand-over (replay.js flyStep, step 2)
      const ctx = { live: true, aircraft: state.aircraft, plans: state.plans };
      // A press hands #2 back from the live close-in wingman: the planners start from where he is (B1).
      if (state.liveWing && state.current && !state.current.liveTurn && !state.current.liveChange) {
        state.liveWing = null;
        state.liveTrace = null;
      }
      if (state.liveWing) {
        // The live close-in wingman (B1): Lead flies his step; #2 flies off what he saw of Lead before it (wingman.js).
        const [lead, wing] = state.aircraft;
        const refSt = leadPointMassOf(lead, opts.blockFt);
        flyStep(lead, state.plans[lead.id] ?? (state.plans[lead.id] = { segments: [] }), state.tSec, ctx);
        const r = stepWingman(state.liveWing, refSt);
        state.liveWing = r.w;
        state.liveTrace = r.trace;
        applyTo(wing, r.w);
      } else for (const a of state.aircraft) flyStep(a, state.plans[a.id] ?? (state.plans[a.id] = { segments: [] }), state.tSec, ctx);
      holdStationIdle();
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
      const rejudge = state.errorOutcome?.rejudge;
      if (rejudge && state.aircraft.every((a) => planDone(a, state.plans[a.id]))) state.errorOutcome = outcomeOf(rejudge.run, state.aircraft[0], state.aircraft[1], rejudge.label);
      // In a live close turn #2 has no plan: his end is the fly-ahead's, settled on his place (liveTurn, B2).
      const flownOut = (a) => ((state.current.liveTurn || state.current.liveChange) && a.id === 2) || planDoneBut(a, state.plans[a.id]);
      if (state.current && state.aircraft.every((a) => flownOut(a) && (state.tSec >= state.current.endSec - STEP_SEC / 2))) finish();
      else if (state.current && inBandAndSteady()) finish();
      else if (state.current) replanAtEvents();
      return true;
    },
  };
}

/** The close formations the live close-in wingman flies (B1-B2 echelon; B3 route, line astern and the corner, TS-231). */
const LIVE_CLOSE = Object.freeze(['echelon', 'route', 'astern', 'corner']);

/** A live close turn ends once #2 is settled on his place, or this long after Lead's plan is done (B2; estimate). */
const LIVE_TURN_SETTLE_CAP_SEC = 15;

/** An idle wingman within offRad of Lead's heading and offKt of his speed eases onto them at rateRad and ktps a second (holdStationIdle; estimates). */
const IDLE_TRIM = Object.freeze({ offRad: 1 * DEG, rateRad: 0.1 * DEG, offKt: 2, ktps: 0.2 });

/** The formations the manoeuvre buttons fly from: line abreast, or a picture that is none of the close ones (after an in-place turn). */
const MOVES_FROM = ['lab', 'other'];
/** The same for the four: Spread 4, or a wide picture that is none of the formations (a column after an in-place turn). */
const MOVES_FROM_FOUR = ['spread4', 'other'];

/**
 * The fixed line under Setup: line abreast's speed and turns, the close formations' speed (as set at load; Lead behaviours
 * moves it), and Lead's roll limit (90°/s, TS-222; it read "roll up to 180°/s" until V2.428, from before TS-222).
 */
export function fixedLine(opts = LIVE_DEFAULTS) {
  return `${opts.kias} KIAS and ${TURN_G} G turns (${Math.round(TURN_BANK_DEG)}° bank) in line abreast, ${KIAS_OUTSIDE_LAB} KIAS outside it · ${opts.blockFt.toLocaleString('en-CA')} ft · still air · Lead rolls up to ${LEAD_ROLL.maxRateDps}°/s`;
}
