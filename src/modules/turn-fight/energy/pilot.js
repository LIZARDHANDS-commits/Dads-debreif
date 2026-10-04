// The model pilot: who decides what each jet does next. Auto's SMM table and its Immelmann / pitch back race,
// the first moves planned at T+0, the Tactical pick (through the look-ahead), the hand-over when a move ends,
// the Tactical re-pick in the MPT, and starting a chase. The moves themselves are in moves/; how a choice is
// scored is the judge's (judge.js) and the look-ahead's (lookahead.js).
//
// TF-57 PR 1 moved these here from energy-sim.js unchanged; PR 3 makes this the one place that picks moves.
import { splitST6A } from '../../../core/t6-performance.js';
import { FIGHT_STEP_SEC } from '../sim.js';
import { MPT_WITHIN_KT, IMMELMANN_BAND_KIAS, PITCH_BACK_BAND_KIAS, SLICE_ENTRY_LOW_KIAS, TUNING, MOVE_LABELS, ENERGY_DEFAULT_SETUP, round, feet } from './setup.js';
import { noseAngleDeg, noseOffAzDeg } from './frame.js';
import { startMove, handToMpt, startPursuit } from './moves/index.js';
import { noseOnRace, immelmannTopKias, pickTacticalMove, tacticalPickSteps } from './lookahead.js';
import { onTheOther, noseOffDeg, shouldPursueTactical } from './judge.js';

// ── Auto's table ─────────────────────────────────────────────────────────────

/**
 * Auto's pick (SMM Table 14.1 at about 10,000 ft; the split points are the
 * spec's, and the first three are settings): within 5 kt of the MPT speed, the
 * MPT straight away; up to the MPT speed plus 5, pitch back; down to 120 slice;
 * below 120 split S, or a slice when the split S (core's height loss, about 2,000 ft
 * from its top) would go below the hard deck. Returns { move, why } with the reason in the spec's words.
 *
 * Below the MPT band and within `deckMarginFt` (1,000 ft, a model setting) of the
 * deck there is no room for a slice or a split S: the pick is the MPT, which
 * becomes the level MPT at the deck.
 *
 * Above 220 (SMM 14.15) it is an Immelmann or a pitch back, and whichever gets
 * this aircraft's chase started sooner wins (Patrick: whichever gets them into
 * position and wins faster). On a tie the move whose SMM band holds the entry speed
 * wins (Immelmann 200 to 250 KIAS, pitch back 160 to 220); the pitch back if both
 * or neither do. An Immelmann that would be over the top under
 * `immelmannMinTopKias` is never picked. With no chase in the look-ahead for
 * either, the geometry decides: the Immelmann when the other is more than
 * `immelmannOffNoseDeg` off the nose (a reversal is needed), else the pitch back.
 * The reason says so when the entry speed is outside the chosen move's SMM band.
 *
 * `look` is what a caller who knows the fight passes: { offNoseDeg, topKias,
 * noseOnSec }: the other's 3D off-nose angle; the speed an Immelmann would reach
 * over the top; and { immelmann, pitchBack, later? }, the seconds each takes to
 * start a chase (null for none in the look-ahead; `later` names a move whose run
 * was stopped because it had passed the other's time). topKias and noseOnSec may be
 * numbers or functions that work them out only when needed, and may be left
 * out (then that test is skipped). With no look at all the geometry is not
 * known and the speed alone decides: Immelmann.
 */
export function pickMove(kias, altFt, p = ENERGY_DEFAULT_SETUP, look = null) {
  // The speed as the reason shows it: whole knots, unless that would round onto a speed the rule compares with ("120 KIAS, below 120").
  const boundaries = [p.mptKias - MPT_WITHIN_KT, p.mptKias, p.mptKias + MPT_WITHIN_KT, p.immelmannAboveKias, p.splitSBelowKias];
  let k = round(kias);
  if (!Number.isInteger(kias) && boundaries.includes(k)) {
    let digits = 1;
    while (digits < 4 && +kias.toFixed(digits) === k) digits++;
    k = kias.toFixed(digits);
  }
  if (Math.abs(kias - p.mptKias) <= MPT_WITHIN_KT) return { move: 'mpt', why: `MPT straight away: ${k} KIAS, within ${MPT_WITHIN_KT} of ${p.mptKias}` };
  if (kias > p.immelmannAboveKias) {
    const band = (move) => (move === 'immelmann' ? IMMELMANN_BAND_KIAS : PITCH_BACK_BAND_KIAS);
    const inBand = (move) => kias >= band(move)[0] && kias <= band(move)[1];
    const outside = (move) => (inBand(move) ? '' : `, outside the SMM band (${band(move)[0]} to ${band(move)[1]} KIAS)`);
    const pick = (move, why) => ({ move, why: why + outside(move) });
    if (!look) return pick('immelmann', `Immelmann: ${k} KIAS, above ${p.immelmannAboveKias}`);
    const value = (x) => (typeof x === 'function' ? x() : x);
    const off = round(look.offNoseDeg);
    const top = look.topKias === undefined ? Infinity : value(look.topKias);
    if (!(top >= p.immelmannMinTopKias)) return pick('pitchBack', `Pitch back: ${k} KIAS, an Immelmann would be over the top at only ${Math.floor(top)} KIAS`);
    const race = look.noseOnSec === undefined ? null : value(look.noseOnSec);
    if (race && (race.immelmann !== null || race.pitchBack !== null)) {
      const imm = race.immelmann ?? Infinity, pb = race.pitchBack ?? Infinity;
      // A tie goes to the move whose SMM band holds the entry speed; the pitch back unless only the Immelmann's does.
      const move = imm < pb || (imm === pb && inBand('immelmann') && !inBand('pitchBack')) ? 'immelmann' : 'pitchBack';
      const other = move === 'immelmann' ? 'pitchBack' : 'immelmann';
      const mine = race[move], theirs = race[other];
      const label = move === 'immelmann' ? 'Immelmann' : 'Pitch back';
      const otherLabel = other === 'immelmann' ? 'an Immelmann' : 'a pitch back';
      if (mine === 0 && theirs === 0) return pick(move, `${label}: ${k} KIAS, nose already on, so both moves tie`);
      const against = race.later === other ? 'later' : theirs === null ? `no nose-on in ${p.pickLookaheadSec} s` : `${round(theirs)} s`;
      const tie = imm === pb ? ` (a tie, decided by the SMM bands)` : '';
      return pick(move, `${label}: nose on in about ${round(mine)} s vs ${against} for ${otherLabel}${tie}`);
    }
    if (look.offNoseDeg > p.immelmannOffNoseDeg) return pick('immelmann', `Immelmann: ${k} KIAS, other aircraft ${off}° off the nose, over the top at ${round(top)} KIAS`);
    return pick('pitchBack', `Pitch back: ${k} KIAS, other aircraft ${off}° off the nose`);
  }
  if (kias > p.mptKias) return { move: 'pitchBack', why: `Pitch back: ${k} KIAS, SMM entry ${p.mptKias} to ${p.immelmannAboveKias}` };
  // Below the MPT band, close to the deck: no room to slice or split S, so the MPT, level at the deck.
  if (altFt - p.hardDeckFt < p.deckMarginFt) return { move: 'mpt', why: `MPT: ${k} KIAS, under ${feet(p.deckMarginFt)} ft above the ${feet(p.hardDeckFt)} ft deck, no room to slice, so the level MPT at the ${feet(p.hardDeckFt)} ft deck` };
  if (kias >= p.splitSBelowKias) return { move: 'slice', why: `Slice: ${k} KIAS, SMM entry ${SLICE_ENTRY_LOW_KIAS} to ${p.mptKias}` };
  // The deck check uses the height a split S loses from its top, taken from the entry height: the safe side, since the nose-up gains a little first.
  const lossFt = splitST6A(Math.max(kias, 1), altFt, { stallKias: p.stallKias, rollRateDegPerSec: p.rollRateDegPerSec }).fromTopFt;
  if (altFt - lossFt >= p.hardDeckFt) return { move: 'splitS', why: `Split S: ${k} KIAS, below ${p.splitSBelowKias}` };
  return { move: 'slice', why: `Slice instead of a split S: ${k} KIAS, a split S from ${feet(altFt)} ft loses about ${feet(lossFt)} ft from its top and would go below the ${feet(p.hardDeckFt)} ft deck` };
}

/** What the readout says for a move the setup forced from the merge. */
function forcedWhy(move, kias) {
  return `${MOVE_LABELS[move]}: set by you at ${round(kias)} KIAS (forced move)`;
}

// ── The first move and Auto's pick in the fight ──────────────────────────────

/** The Smart pilot: 'auto', or 'tactical', its older name. */
export const isSmart = (move) => move === 'auto' || move === 'tactical';

/**
 * The first move, from the speed the setup gave for the merge (not the KTAS round trip, which can land a hair under a
 * split point). `start` is the fight at T+0 that the look-ahead's races fly from (see noseOnSec); a pick made at the
 * merge itself, in a dry run, has none.
 */
export function chooseFirstMove(state, ac, other, start = null) {
  const p = state.setup;
  const forced = ac.who === 'blue' ? p.blueMove : p.redMove;
  // The Smart pilot (TF-59; 'tactical' is its older name) takes its first move from the SMM table, as Auto did.
  return isSmart(forced) ? autoPick(state, ac, other, ac.mergeKias, start) : { move: forced, why: forcedWhy(forced, ac.mergeKias) };
}

/**
 * Auto's pick for an aircraft now. Above 220 it looks ahead (only when it has
 * to): the Immelmann's lowest speed, and which of the Immelmann and the pitch
 * back gets its chase started sooner. A dry run (`state.dry`) keeps the Immelmann's
 * top-speed gate but skips the race (it falls to the geometry rule), so the look-ahead
 * never looks ahead inside itself and its other aircraft is picked as the real one is.
 * `other` is the other aircraft (only its `pm` is read). The race the look-ahead
 * ran, if it ran one, is kept on the pick as `race`: seconds for each move, and
 * `later` names a move whose run was stopped because it had passed the other's time.
 * `from` is the fight to fly the races from, when that is not `state` itself
 * (before the pass it is the fight at T+0).
 */
export function autoPick(state, ac, other, kias, from = null) {
  const p = state.setup;
  const look = { offNoseDeg: noseAngleDeg(ac, other) };
  let race = null;
  if (kias > p.immelmannAboveKias) {
    // The Immelmann's top speed gates it in a dry run too, so the dry run's other aircraft is picked as the real one is; only the race is skipped there.
    look.topKias = () => immelmannTopKias(p, ac, other, kias);
    if (!state.dry && p.pickLookaheadSec > 0) {
      const likely = look.offNoseDeg > p.immelmannOffNoseDeg ? 'immelmann' : 'pitchBack';
      look.noseOnSec = () => { race = noseOnRace(from ?? state, ac.who, kias, likely); return race; };
    }
  }
  const pick = pickMove(kias, ac.altFt, p, look);
  if (race) pick.race = race;
  return pick;
}

/** A pick that stands although the race, run again, prefers the other move (see createEnergyFight): the move, the race as it now runs, and a reason that says so. */
export function heldPick(move, race, kias, p) {
  const other = move === 'immelmann' ? 'pitchBack' : 'immelmann';
  const secs = (m) => (race.later === m ? 'later' : race[m] === null ? `no nose-on in ${p.pickLookaheadSec} s` : `nose on in about ${round(race[m])} s`);
  const otherLabel = other === 'immelmann' ? 'an Immelmann' : 'a pitch back';
  const now = race[move] === null && race[other] === null ? `neither move gets a nose-on in ${p.pickLookaheadSec} s` : `${secs(move)}, and for ${otherLabel} ${secs(other)}`;
  return { move, why: `${MOVE_LABELS[move]}: ${round(kias)} KIAS, picked before the other's move was final; against it now ${now}`, race };
}

/**
 * The Auto pick for one aircraft in a fight as it stands, with its look-ahead.
 * Reads the state and changes nothing. Before the pass the pick is the plan the
 * turns will start from (made at T+0), not a new one.
 */
export function lookAheadPick(state, who) {
  if (!state.merged && state.plan[who]) return state.plan[who];
  const ac = state[who];
  const other = who === 'blue' ? state.red : state.blue;
  return autoPick(state, ac, other, ac.kias);
}

// ── Hand-overs and the MPT re-pick ───────────────────────────────────────────

const BANK_MOVE_MODES = Object.freeze(['pitchBack', 'slice', 'immelmann', 'splitS', 'lowYoYo', 'highYoYo']);

/** A move that has ended (ctl.next) hands to the next one: to the MPT, or a new Auto pick; a bank move flown past moveMaxSec is picked again next step. */
export function handOver(state, ac, other, kias, d = 0) {
  const c = ac.ctl;
  if (c.mode === 'pursuit' && endLostChase(state, ac, other, kias, d)) return;
  if (c.next) {
    const next = c.next; c.next = null;
    if (next === 'mpt') {
      if (ac.move === 'immelmann' || ac.move === 'splitS') {
        ac.move = 'mpt';
        ac.moveLabel = MOVE_LABELS.mpt;
      }
      handToMpt(ac);
      smartPickNow(state, ac, kias); // the Smart pilot picks its next move as the last one ends, the MPT being one option (Patrick, 4 Oct 18:09Z)
    } else {
      const pick = autoPick(state, ac, other, kias);
      startMove(state, ac, pick.move, pick.why, kias);
    }
  } else if (c.t > TUNING.moveMaxSec && BANK_MOVE_MODES.includes(c.mode)) {
    c.next = 'pick';
  }
}

/**
 * A chase ends when the shot is gone (TF-57 PR 3, "pursuit can end"): the chaser's nose has stayed more than
 * chaseLostAtaDeg off the other for chaseLostSec. It flies the MPT and the pilot picks again from there; a new
 * nose-on starts a new chase. Returns true when it ended this step.
 */
function endLostChase(state, ac, other, kias, d) {
  const c = ac.ctl;
  c.lostSec = noseAngleDeg(ac, other) > TUNING.chaseLostAtaDeg ? (c.lostSec ?? 0) + d : 0;
  if (c.lostSec < TUNING.chaseLostSec) return false;
  c.lostSec = 0;
  handToMpt(ac);
  ac.move = 'mpt'; ac.moveLabel = MOVE_LABELS.mpt;
  ac.why = `Chase lost: nose more than ${TUNING.chaseLostAtaDeg}° off the other for ${TUNING.chaseLostSec} s, picking again`;
  smartPickNow(state, ac, kias); // and the Smart pilot picks its next move at once (Patrick, 4 Oct 18:09Z)
  return true;
}

/**
 * The Smart pilot's look-ahead pick (TF-59): flies each move it could change to ahead in a copy of the fight and
 * starts the best, unless that is the MPT (which the jet is already in). Only after the pass, not in a dry run,
 * when a chase is possible (pursuit not none), the fight is not lost below the deck, the jet is more than the deck
 * margin above the deck and not stalled or OVER G, and the best run is one a pilot would fly.
 *
 * The pilot takes smartDecisionSec to decide (TF-62, Patrick 4 Oct 19:38Z: spread it out): the look-ahead starts from
 * where the jet will be then, flying on as it is, and its work is shared evenly over the steps until then, so the
 * screen never freezes; the move starts at that moment. 0 decides in this step, all at once, as before.
 * Returns true when it started a move in this step.
 */
function smartPickNow(state, ac, kias) {
  if (!canPick(state, ac)) return false;
  const p = state.setup;
  ac.ctl.mptEvalTimer = 0;
  const sec = p.tacticalLookaheadSec ?? 20;
  const steps = Math.round((p.smartDecisionSec ?? 0) / FIGHT_STEP_SEC);
  if (steps < 1) return startPick(state, ac, pickTacticalMove(state, ac.who, sec), kias);
  const gen = tacticalPickSteps(state, ac.who, sec, steps * FIGHT_STEP_SEC);
  const first = gen.next(); // the copy flies on to the moment of the pick, then says how much work is left
  PENDING.set(ac, { gen, stepsLeft: steps, perStep: Math.ceil((first.value?.work ?? 0) / steps) + 1, result: first.done ? first.value : null });
  return false;
}

/** A look-ahead being worked through, per aircraft. Kept off the fight state, so copies of the fight (dry runs) never carry one. */
const PENDING = new WeakMap();

function canPick(state, ac) {
  const p = state.setup;
  const forced = ac.who === 'blue' ? p.blueMove : p.redMove;
  if (state.dry || !state.merged || !isSmart(forced) || p.pursuit === 'none' || state.deckLoss) return false;
  return !(ac.altFt - p.hardDeckFt <= (p.deckMarginFt ?? 1000) || ac.stall || ac.overG);
}

function startPick(state, ac, best, kias) {
  if (!best || !best.valid || best.move === 'mpt' || best.move === 'levelMpt') return false;
  startMove(state, ac, best.move, best.why, kias);
  ac.ctl.lockoutTimer = 4.0;
  return true;
}

/**
 * One step's share of a pending look-ahead; at the moment of the pick it starts the move. Dropped if the jet can no
 * longer use it: a chase began, a stall, or it came within the deck margin.
 */
function workOnPick(state, ac, kias) {
  const job = PENDING.get(ac);
  if (!job) return false;
  if (!canPick(state, ac) || (ac.ctl.mode !== 'mpt' && ac.ctl.mode !== 'levelMpt')) { PENDING.delete(ac); return false; }
  job.stepsLeft -= 1;
  const share = job.stepsLeft <= 0 ? Infinity : job.perStep;
  for (let i = 0; i < share && !job.result; i++) {
    const next = job.gen.next();
    if (next.done) job.result = next.value;
  }
  if (job.stepsLeft > 0) return false;
  PENDING.delete(ac);
  return startPick(state, ac, job.result, kias);
}

/**
 * The pilot's look at a new move while it flies the MPT: works on a pending look-ahead, and every 3.5 s, after a 4 s
 * lock-out, once the MPT has found its speed, starts a new one (smartPickNow). Runs before the MPT's controller, so a
 * new move flies from this same step.
 */
export function reconsiderInMpt(ctx) {
  const { state, ac, kias, d } = ctx;
  const c = ac.ctl;
  if (!state.dry && state.merged && (c.mode === 'mpt' || c.mode === 'levelMpt')) {
    if (c.lockoutTimer > 0) c.lockoutTimer = Math.max(0, c.lockoutTimer - d);
    if (PENDING.has(ac)) { workOnPick(state, ac, kias); return; }
    c.mptEvalTimer = (c.mptEvalTimer || 0) + d;
    if (c.mptEvalTimer >= 3.5 && (c.lockoutTimer || 0) <= 0) {
      c.mptEvalTimer = 0;
      if (!c.capture) smartPickNow(state, ac, kias);
    }
  } else if (PENDING.has(ac)) PENDING.delete(ac);
}

// ── Starting a chase ─────────────────────────────────────────────────────────

/**
 * Every step after the pass, until both are pursuing, each aircraft whose nose is on the other (onTheOther), or that has
 * a decisive tactical advantage (shouldPursueTactical), starts a pursuit for the rest of the fight. Across a height
 * difference, two jets both in the MPT with the other within 60° of the nose in azimuth both start one (D404/D429).
 * Returns the aircraft that started on the nose-on or advantage rule, for the judge to record the chase.
 */
export function startChases(state) {
  const chasers = [];
  for (const [ac, target] of [[state.blue, state.red], [state.red, state.blue]]) {
    if (ac.ctl.mode !== 'pursuit' && ac.ctl.mode !== 'climbOut' && !state.deckLoss && !ac.stall && (onTheOther(state, ac, target) || shouldPursueTactical(state, ac, target))) {
      chasers.push({ ac, aspectDeg: 180 - noseOffDeg(state, target) });
    }
  }
  // Across altitude separation (D404/D429): visual canopy acquisition engages fighters from level MPT into 3D combat pursuit
  if (!chasers.length && !state.deckLoss && state.setup.blueAltFt !== state.setup.redAltFt && state.timeSec > (state.mergeSec ?? 0) + 1.0) {
    const blueMpt = state.blue.ctl.mode === 'mpt' || state.blue.ctl.mode === 'levelMpt';
    const redMpt = state.red.ctl.mode === 'mpt' || state.red.ctl.mode === 'levelMpt';
    if (blueMpt && redMpt) {
      const azBlue = noseOffAzDeg(state.blue, state.red), azRed = noseOffAzDeg(state.red, state.blue);
      const CANOPY_VISUAL_DEG = 60.0;
      if (azBlue <= CANOPY_VISUAL_DEG || azRed <= CANOPY_VISUAL_DEG) {
        startPursuit(state, state.blue);
        startPursuit(state, state.red);
      }
    }
  }

  for (const { ac } of chasers) startPursuit(state, ac);
  return chasers;
}
