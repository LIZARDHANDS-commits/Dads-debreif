// The Turn Fight's Energy mode engine (SPEC-turn-fight, "Energy mode (FF23, D112)"):
// two T-6As, each flown by a model pilot through the SMM's energy moves to the
// 160 KIAS max-performance turn (MPT), then held there or chased from.
//
// Like sim.js it is a pure calculation with no page access: a plain setup goes in,
// a plain state comes out, and `stepEnergyFight` moves it in whole 0.02 s steps.
// It draws nothing. The simple fight (sim.js) is untouched and still pinned to V6.
//
// All the aircraft maths is core's: the T-6A limits, stall line, thrust and drag
// and energy height (t6-performance.js), and the point-mass step (point-mass.js).
// This file only flies it: it decides G, bank and throttle, and keeps the
// readouts. Nothing here works out drag, thrust or the stall line itself.
//
// Two pieces look ahead by flying copies of the fight, never the fight itself:
// above 220 KIAS Auto dry-runs an Immelmann and a pitch back and takes the one
// that starts its chase sooner (pickMove, noseOnSec: the same nose-on rule as the
// fight's own chase, onTheOther); and the plan for the first moves is made once,
// at the start, from copies of the fight at T+0, and the turns begin from it.
//
// Units: feet, seconds, radians inside, degrees and knots in the readouts.
// x is east, y north, z (altFt) up; heading 0 is east and grows counter-clockwise
// (core's rule). "Left" means counter-clockwise from above; turnDir +1 is left.
//
// Bank. The point-mass step measures bank from its own `up`, carried through a
// loop so it never divides by cos 90°. `ac.bankRad` is that carried bank (right
// wing down positive), which is continuous through the vertical. The readout
// `bankDeg` is the bank from the real horizon, toward the turn, worked out in
// `physicalBankDeg`. Moves that go over the top (pitch back, Immelmann, split S)
// hold a carried bank; the MPT holds a real-horizon bank.
import { FT_PER_NM, G_FTPS2, KT_TO_FTPS } from '../../core/units.js';
import { wrapPi, degToRad, radToDeg } from '../../core/angles.js';
import {
  T6A_LIMITS, T6A_MANOEUVRE, stallLimitG, availableG, shakerG as coreShakerG, splitST6A, iasToTasKt, tasToIasKt, t6aExcessFn,
  maxKiasT6A, modelMaxIasT6A, thrustPerWeight, dragPerWeight, energyHeightFt,
} from '../../core/t6-performance.js';
import { stepPointMass, pointMassState, pointMassFlight } from '../../core/point-mass.js';
import { FIGHT_STEP_SEC, FIGHT_MAX_SEC, FIRST_NOSE_DEG } from './sim.js';
import { turnRadiusFt } from '../../core/flight-math.js';

/** The moves a setup can force; 'auto' lets the model choose (step 1). */
export const ENERGY_MOVES = Object.freeze(['tactical', 'auto', 'immelmann', 'pitchBack', 'slice', 'splitS', 'mpt']);
/** The pursuits a screen offers. A setup also accepts 'none' (nobody chases), for tests and what-ifs; it is not one of the choices. */
export const PURSUITS = Object.freeze(['pure', 'lead', 'lag']);
/**
 * Energy mode starts each aircraft between the hard deck and this height.
 * Above ENERGY_ACCURATE_MAX_FT the model's turn rate reads low (core is fixing
 * the sustained turn rate at 20,000 ft and above), so a screen shows a note there.
 */
export const ENERGY_MAX_START_FT = 25000;
export const ENERGY_ACCURATE_MAX_FT = 15000;
/**
 * The top speed the Energy engine allows at altFt, in the model's own IAS: VMO (316), or true Mach 0.67, whichever is slower.
 * The model's IAS has no compressibility (IAS = TAS x sqrt(density ratio)), so this sits about 9 kt under the NFM's KIAS line
 * up high (25,000 ft: about 270, where the NFM reads 279); it is core's modelMaxIasT6A. Auto keeps the model under VMO and Mmo (a forced move may go over). It is here for the screen to use.
 */
export function energyTopKias(altFt) {
  return modelMaxIasT6A(altFt); // core's own model-basis limit (#232)
}
const PURSUITS_ACCEPTED = Object.freeze([...PURSUITS, 'none']);

/**
 * The one G the model pilot asks for while he sets a move up (pullG's default): standardized at 5.0 G
 * across dynamic vertical maneuvers per D406 and SMM Ch 14, up to the stick shaker boundary (ctx.shaker).
 */
const MANEUVER_PULL_G = 5;

/**
 * The setup when nothing is changed: the spec's defaults. Every key is a box on
 * the screen, in three blocks: the first view (circles to turnsStart), "More
 * energy settings" (blueMove to chaseAfterHeadOn) and "Model settings for checking"
 * (stallKias to pullG, numbers no manual gives, for Dad to check).
 * `pullG` is the G the model pilot asks for while a move is being set up; the
 * shaker is the most it asks for. The last two, `blueForceG` and `redForceG`,
 * are not on the screen: a what-if that pulls exactly that G (0 to 12), even
 * past the stall line, for testing the two flags.
 */
export const ENERGY_DEFAULT_SETUP = Object.freeze({
  circles: 2,
  separationNm: 2,
  blueAltFt: 10000,
  redAltFt: 10000,
  blueKias: 220,
  redKias: 220,
  // Start geometry (SPEC-turn-fight, R28): head-on, turns at the pass.
  ataDeg: 0,
  ataSide: 'left',
  aaDeg: 180,
  aaSide: 'left',
  turnsStart: 'pass',
  // More energy settings.
  blueMove: 'auto',
  redMove: 'auto',
  mptKias: 160,
  hardDeckFt: 6000,
  pursuit: 'pure',
  chaseAfterHeadOn: true,
  // Model settings for checking.
  stallKias: T6A_LIMITS.stallKias,
  shakerFrac: 0.94,
  stallSec: 1,
  midThrottle: 0.5,
  leadSec: 1,
  lagSec: 1,
  rollRateDegPerSec: 90,
  pitchBackBank160Deg: 60,
  pitchBackBank220Deg: 30,
  immelmannAboveKias: 220,
  immelmannOffNoseDeg: 120,
  immelmannMinTopKias: 120,
  pickLookaheadSec: 60,
  tacticalLookaheadSec: 20,
  deckMarginFt: 1000,
  splitSBelowKias: 120,
  pullG: MANEUVER_PULL_G,
  blueForceG: null,
  redForceG: null,
});

/**
 * Numbers the spec fixes that are not boxes, each with where it comes from.
 * SMM = the Strike/T-6 maneuvering manual (page refs only); "model setting"
 * means no manual gives it and Dad may change it.
 */
const MPT_WITHIN_KT = 5;          // SMM 14.14: the MPT is 160 KIAS, held within 5 kt
// The spec says the model starts the constant-speed MPT at 72.5°, the middle of its 60 to 85° band, and trims from
// there. It does not: there is no start value. The bank is whatever the speed-hold law (speedHoldBankDeg) asks for,
// held to this band, and steady at 160 KIAS it settles at 72 to 73° (the SMM's 70 to 75°, SMM 14.14).
const MPT_BANK_MIN_DEG = 60;      // spec: the constant-speed MPT trims its bank within 60 to 85°
const MPT_BANK_MAX_DEG = 85;
const SLICE_BANK_AT_MPT_DEG = 90; // SMM 14.18: the slice bank is 90° at the MPT speed ...
const SLICE_BANK_AT_100_DEG = 135; // ... and 135° at 100 KIAS
const IMMELMANN_BAND_KIAS = Object.freeze([200, 250]);   // SMM 14.15: the Immelmann is flown from 200 to 250 KIAS
/** The MPT speed box: 125 to 175 KIAS. Below 125 the MPT's 60 degree bank floor (2 G) meets the shaker and flies 125 anyway (verification N2 of #227). Above that, at the deck, the level MPT sinks under it (verification F8: 180 gave 5,937 ft, 200 gave 5,495 ft from 7,000 ft; 175 stays within 20 ft); the SMM's speed is 160 and the level MPT's about 150 minus thousands of feet. */
export const MPT_KIAS_RANGE = Object.freeze([125, 175]);
const PITCH_BACK_BAND_KIAS = Object.freeze([160, 220]);   // SMM 14.15: and the pitch back from 160 to 220 KIAS
const SLICE_ENTRY_LOW_KIAS = 100; // SMM 14.18: the slice is flown from 100 to 160 KIAS (Auto hands to a split S below the split point)
// The split S is core's (splitST6A; the technique is SMM 14.16 para 41): nose to about 20° up in the shaker, roll inverted
// at 0.5 G, pull through in the shaker up to 5 G. The 5 G is Patrick's word (2026-09-30 09:27Z); the SMM gives the technique,
// and its Table 14.1 says about 4 G. The numbers come from T6A_MANOEUVRE; this file flies the same law.
/** One definition of "rolling": a bank change faster than this (deg/s) is a roll. The roll itself is 90°/s; the MPT's trim is a few deg/s. It drives OVER G's 4.7 G limit, the MPT's 4 G while rolling, and the chaser's cap. Model setting. */
const ROLLING_DEG_PER_SEC = 15;
/** A pursuit starts from behind (aspect <= 150°), or across a head-on re-pass with `chaseAfterHeadOn` (default true per Patrick's ratification, D403). Model setting. */
const PURSUIT_MAX_AA_DEG = 150;
const FORCE_G_MAX = 12;           // a what-if G of 0 to 12 (core's +7 G limit, and some way past it)

/**
 * How the model pilot flies, which no manual gives: how early a pitch back or
 * slice hands to the MPT, how fast the MPT closes on its speed, the gains that
 * level a jet off or chase, and the handover rules that end a move. They are
 * guesses tuned so every merge speed reaches 160 ± 5 KIAS and holds it. Dad sees
 * the result when he flies each move; none is a box on the screen.
 */
const TUNING = Object.freeze({
  captureLeadSec: 3,       // model setting: a bank move hands to the MPT when its speed, this many seconds ahead, would reach the MPT speed
  captureLeadFastSec: 3.7, // model setting: the lead for a pitch back or slice entered at VMO (316 KIAS). It grows from captureLeadSec (entered at captureLeadFromKias) to this at VMO. The old flat 6 s over 220 KIAS took 303 to 391° to reach the MPT (aim: under 180°, SMM 14.17 para 42); 3 s alone loses the band above about 280 KIAS; this ramp meets both from 221 to 316 KIAS at 8,000 to 15,000 ft
  captureLeadFromKias: 235, // model setting: entered at or under this speed the lead is captureLeadSec
  minBankMoveTurnDeg: 90,     // model setting: minimum turn before speed-based handover to MPT (Phase 1A)
  maxBankMoveTurnDeg: 170,    // model setting: a pitch back or slice that has not found the MPT speed by here hands to the MPT anyway
  speedTauSec: 4,             // model setting: the MPT closes on its speed with this time constant
  speedLeadSec: 3,            // model setting: and judges its speed this many seconds ahead, so it does not overshoot
  settledKtPerSec: 1,         // model setting: a handed-over MPT is settled only when its speed is also changing no faster than this
  settledKt: 4,               // model setting: a handed-over MPT is settled, and keeps to 60 to 85°, within this of its speed
  captureBankMaxDeg: 135,     // model setting: until then it may roll the lift below the horizon to bring the nose down
  levelOmegaPerSec: 1,        // model setting: how fast a level-off, the level MPT and the deck guard close on their flight path
  levelAltGainPerSec: 0.2,    // model setting: climb rate wanted per foot of height error (level MPT, deck guard)
  levelLeadSec: 2,            // model setting: the CSMPT starts the level-off this many seconds before it would reach the deck
  levelBankMaxDeg: 88,        // model setting: the most bank the level MPT uses to hold its height
  chaseGainPerSec: 2,         // model setting: pursuit asks for this much turn rate per radian of pointing error
  immelmannRollStartDeg: 25,  // model setting: the roll upright starts this far above level on the way down the back (SMM 14.15)
  moveMaxSec: 60,             // model setting: a move that has not ended by now hands over
  minKtas: 15,                // model setting: the point-mass step needs speed above zero; a stalled jet is kept at least this fast
  levelDoneDeg: 2,            // model setting: a level-off is done within this of level
  rollInSec: 3,               // model setting: an MPT entered straight (not handed over) rolls in for this long, pulling only as the bank builds
  vmoMarginKias: 40,          // model setting: a chaser starts keeping its nose up this far under the top speed at its height (VMO, or true Mach 0.67 in the model's IAS above about 17,570 ft; energyTopKias)
  vmoLeadSec: 3,              // model setting: and looks this many seconds ahead at its speed
  vmoClimbPerKt: 0.02,        // model setting: nose-up path (sine) asked for per knot over that speed
  deckPullOutFactor: 1.3,     // model setting: a chaser's pull-out from a dive is worked out at this times the plain circle, for the speed it gains
  dryRunMaxSec: 40,           // model setting: the Immelmann dry run gives up after this long
});

export const MOVE_LABELS = Object.freeze({
  tactical: 'Tactical AI',
  immelmann: 'Immelmann', pitchBack: 'Pitch back', slice: 'Slice', splitS: 'Split S',
  mpt: 'MPT', levelMpt: 'Level MPT', pursuit: 'Pursuit',
});

// ── Small vector helpers (the point-mass step's own are private) ─────────────

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.sqrt(dot(a, a));
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a) => scale(a, 1 / len(a));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const velOf = (pm) => ({ x: pm.vx, y: pm.vy, z: pm.vz });
const posOf = (pm) => ({ x: pm.x, y: pm.y, z: pm.z });

/** Straight-line interpolation through (x0, y0) and (x1, y1), held at both ends. */
function lerpHeld(x, x0, y0, x1, y1) {
  const t = clamp((x - x0) / (x1 - x0), 0, 1);
  return y0 + (y1 - y0) * t;
}

// ── The model's numbers, through core ────────────────────────────────────────

/**
 * The shaker the model pilot keeps every pull but the split S under: a share of the stall-line G at this speed (17 ÷ 18
 * units of AOA = 94 %, the `shakerFrac` setting), at most +7 G. Core's own shakerG (the split S's) is a different
 * rule on purpose: the shaker 7 kt over the stall speed (NFM p.1-52 gives 5 to 10 kt), so 1 G at 93 KIAS. They differ
 * by a few tenths of a G: 3.25 G here against 2.96 G there at 160 KIAS, 5.08 against 4.62 at 200, and both 7 G from
 * 250. This one is the spec's 94 % and a box on the screen for Dad to check; core's is the split S's law, which the
 * pin test holds this module to. Neither replaces the other.
 */
export function shakerG(kias, p = ENERGY_DEFAULT_SETUP) {
  return Math.min(T6A_LIMITS.maxG, p.shakerFrac * stallLimitG(kias, p.stallKias));
}

/** (thrust − drag) ÷ weight at a throttle: 1 is maximum power, through core's function; less scales the thrust only. */
function excessFnFor(throttle) {
  if (throttle === 1) return t6aExcessFn;
  return (ktas, altFt, g) => {
    const kias = tasToIasKt(ktas, altFt);
    return throttle * thrustPerWeight(kias, altFt) - dragPerWeight(kias, altFt, g);
  };
}

// ── Step 1: pick the move ────────────────────────────────────────────────────

const round = (x) => Math.round(x);
const feet = (x) => Math.round(x).toLocaleString('en-US');

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

// ── The setup ────────────────────────────────────────────────────────────────

function need(ok, what, value) {
  if (!ok) throw new RangeError(`Turn Fight energy setup: ${what}, got ${value}`);
}
const finitePositive = (x) => Number.isFinite(x) && x > 0;

function checkedSetup(setup) {
  const s = { ...ENERGY_DEFAULT_SETUP, ...setup };
  need(s.circles === 1 || s.circles === 2, 'circles is 1 or 2', s.circles);
  need(finitePositive(s.separationNm), 'separationNm is above 0', s.separationNm);
  need(Number.isFinite(s.hardDeckFt), 'hardDeckFt is a number', s.hardDeckFt);
  for (const k of ['blueAltFt', 'redAltFt']) need(Number.isFinite(s[k]) && s[k] >= s.hardDeckFt && s[k] <= ENERGY_MAX_START_FT, `${k} is from the hard deck (${feet(s.hardDeckFt)} ft) to ${feet(ENERGY_MAX_START_FT)} ft`, s[k]);
  // The top speed depends on the start height: VMO up to about 17,570 ft, then true Mach 0.67 in the model's own IAS (energyTopKias), so
  // the height comes first and the message names the limit at that height. Where Mach governs the limit is rounded down to the whole knot,
  // so a merge at the limit as shown never flies over Mach 0.67 (25,000 ft: 269.98, shown as 269).
  for (const [who, kiasKey, altKey] of [['Blue', 'blueKias', 'blueAltFt'], ['Red', 'redKias', 'redAltFt']]) {
    const exactLimit = energyTopKias(s[altKey]);
    const vmoGoverns = exactLimit >= T6A_LIMITS.vmoKias;
    const limitKias = vmoGoverns ? T6A_LIMITS.vmoKias : Math.floor(exactLimit);
    need(Number.isFinite(s[kiasKey]) && s[kiasKey] >= 40, `${kiasKey} is from 40 to ${limitKias} KIAS`, s[kiasKey]);
    // Where Mach governs, say it is the model's figure: a pilot knows the NFM's number, which is the same Mach on the gauge. Above the
    // crossover but under 18,879 ft the NFM line is still VMO (316), so there is no NFM Mach number to quote.
    const nfmKias = Math.round(maxKiasT6A(s[altKey]));
    const limitText = vmoGoverns ? `${limitKias} KIAS, VMO`
      : `${limitKias} KIAS in the model, Mach ${T6A_LIMITS.mmo}${nfmKias < T6A_LIMITS.vmoKias ? `; the NFM's ${nfmKias} is the same Mach on the gauge` : ''}`;
    need(s[kiasKey] <= limitKias, `${who}'s merge speed is above the T-6A's limit at ${feet(s[altKey])} ft (${limitText})`, s[kiasKey]);
  }
  need(Number.isFinite(s.ataDeg) && s.ataDeg >= 0 && s.ataDeg <= 180, 'ataDeg is 0 to 180', s.ataDeg);
  need(Number.isFinite(s.aaDeg) && s.aaDeg >= 0 && s.aaDeg <= 180, 'aaDeg is 0 to 180', s.aaDeg);
  need(s.ataSide === 'left' || s.ataSide === 'right', "ataSide is 'left' or 'right'", s.ataSide);
  need(s.aaSide === 'left' || s.aaSide === 'right', "aaSide is 'left' or 'right'", s.aaSide);
  need(s.turnsStart === 'pass' || s.turnsStart === 'now', "turnsStart is 'pass' or 'now'", s.turnsStart);
  need(ENERGY_MOVES.includes(s.blueMove), `blueMove is one of ${ENERGY_MOVES.join(', ')}`, s.blueMove);
  need(ENERGY_MOVES.includes(s.redMove), `redMove is one of ${ENERGY_MOVES.join(', ')}`, s.redMove);
  need(typeof s.chaseAfterHeadOn === 'boolean', 'chaseAfterHeadOn is true or false', s.chaseAfterHeadOn);
  need(PURSUITS_ACCEPTED.includes(s.pursuit), `pursuit is one of ${PURSUITS.join(', ')} (or none)`, s.pursuit);
  need(Number.isFinite(s.mptKias) && s.mptKias >= MPT_KIAS_RANGE[0] && s.mptKias <= MPT_KIAS_RANGE[1], `mptKias is from ${MPT_KIAS_RANGE[0]} to ${MPT_KIAS_RANGE[1]} KIAS`, s.mptKias);
  for (const k of ['stallKias', 'rollRateDegPerSec', 'pullG', 'immelmannAboveKias', 'splitSBelowKias']) need(finitePositive(s[k]), `${k} is above 0`, s[k]);
  need(Number.isFinite(s.shakerFrac) && s.shakerFrac > 0 && s.shakerFrac <= 1, 'shakerFrac is above 0 and up to 1', s.shakerFrac);
  need(Number.isFinite(s.immelmannOffNoseDeg) && s.immelmannOffNoseDeg >= 0 && s.immelmannOffNoseDeg <= 180, 'immelmannOffNoseDeg is 0 to 180', s.immelmannOffNoseDeg);
  need(Number.isFinite(s.immelmannMinTopKias) && s.immelmannMinTopKias >= 0 && s.immelmannMinTopKias <= T6A_LIMITS.vmoKias, `immelmannMinTopKias is 0 to ${T6A_LIMITS.vmoKias}`, s.immelmannMinTopKias);
  need(Number.isFinite(s.pickLookaheadSec) && s.pickLookaheadSec >= 0 && s.pickLookaheadSec <= 120, 'pickLookaheadSec is 0 to 120', s.pickLookaheadSec);
  need(Number.isFinite(s.tacticalLookaheadSec) && s.tacticalLookaheadSec >= 0, 'tacticalLookaheadSec is 0 or more', s.tacticalLookaheadSec);
  need(Number.isFinite(s.deckMarginFt) && s.deckMarginFt >= 0 && s.deckMarginFt <= 10000, 'deckMarginFt is 0 to 10000', s.deckMarginFt);
  need(Number.isFinite(s.stallSec) && s.stallSec >= 0, 'stallSec is 0 or more', s.stallSec);
  need(Number.isFinite(s.midThrottle) && s.midThrottle > 0 && s.midThrottle <= 1, 'midThrottle is above 0 and up to 1', s.midThrottle);
  need(Number.isFinite(s.leadSec) && s.leadSec >= 0, 'leadSec is 0 or more', s.leadSec);
  need(Number.isFinite(s.lagSec) && s.lagSec >= 0, 'lagSec is 0 or more', s.lagSec);
  need(Number.isFinite(s.pitchBackBank160Deg) && Number.isFinite(s.pitchBackBank220Deg), 'the pitch back banks are numbers', s.pitchBackBank160Deg);
  for (const k of ['blueForceG', 'redForceG']) need(s[k] === null || (Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= FORCE_G_MAX), `${k} is null or from 0 to ${FORCE_G_MAX} G`, s[k]);
  return s;
}

/**
 * Where the start puts both aircraft (SPEC-turn-fight, "Start geometry"):
 * Blue heads east; Red is `range` away (slant range, including the height
 * between them) at the off-nose angle (ATA) from Blue's nose, and Blue sits at
 * the aspect angle (AA) off Red's tail, on the side given. Both fly level at
 * their own height. The picture is then slid so the two are level with each
 * other at the pass, the closest point of approach, on the origin (at the
 * defaults that is the centre start, Q49).
 */
function placeStart(s, blueTas, redTas) {
  const rangeFt = s.separationNm * FT_PER_NM;
  const dz = s.redAltFt - s.blueAltFt;
  need(rangeFt > Math.abs(dz), `the range (${s.separationNm} NM, the separation) is more than the height between them`, dz);
  const horizontal = Math.sqrt(rangeFt * rangeFt - dz * dz);
  const sideOf = (side) => (side === 'left' ? 1 : -1);
  const bearingToRed = sideOf(s.ataSide) * degToRad(s.ataDeg);
  const bearingToBlue = bearingToRed + Math.PI;
  const redHeading = wrapPi(bearingToBlue - sideOf(s.aaSide) * (Math.PI - degToRad(s.aaDeg)));
  const blue = { x: 0, y: 0, z: s.blueAltFt, headingRad: 0, ktas: blueTas };
  const red = { x: horizontal * Math.cos(bearingToRed), y: horizontal * Math.sin(bearingToRed), z: s.redAltFt, headingRad: redHeading, ktas: redTas };
  // The pass point: where the two are closest, from their straight courses.
  const vb = { x: Math.cos(blue.headingRad) * blueTas, y: Math.sin(blue.headingRad) * blueTas, z: 0 };
  const vr = { x: Math.cos(red.headingRad) * redTas, y: Math.sin(red.headingRad) * redTas, z: 0 };
  const r = sub(posOf(red), posOf(blue)), v = sub(vr, vb);
  const vv = dot(v, v), rv = dot(r, v);
  const tca = vv > 0 && rv < 0 ? -rv / (vv * KT_TO_FTPS) : 0; // seconds
  const at = (a, vel) => ({ x: a.x + vel.x * KT_TO_FTPS * tca, y: a.y + vel.y * KT_TO_FTPS * tca });
  const b2 = at(blue, vb), r2 = at(red, vr);
  const cx = (b2.x + r2.x) / 2, cy = (b2.y + r2.y) / 2;
  blue.x -= cx; blue.y -= cy; red.x -= cx; red.y -= cy;
  return { blue, red };
}

function newAircraft(who, pose, p, kias, forceG) {
  const pm = pointMassState({ x: pose.x, y: pose.y, altFt: pose.z, ktas: pose.ktas, headingRad: pose.headingRad });
  const ac = {
    who, pm, mergeKias: kias,
    xFt: pose.x, yFt: pose.y, zFt: pose.z, altFt: pose.z, headingRad: pose.headingRad,
    bankRad: 0,
    turnDir: 0, towardDir: 0,
    move: 'pending', moveLabel: '', why: '',
    throttle: 1,
    mptReached: false, toMptSec: 0, toMptDeg: 0,
    overG: false, overGReason: '', overGEver: false,
    stall: false, stallReason: '', stallEver: false,
    onShaker: false, chaseLimited: false, aim: null,
    rolling: false, rollDegPerSec: 0,
    ctl: { mode: 'pending', forceG: forceG ?? null, stallTimer: 0, stallCond: false, prevKias: kias, kiasRateEff: 0, mptEvalTimer: 0, lockoutTimer: 0 },
  };
  readOut(ac, 1, 1, p);
  readSlow(ac, p);
  return ac;
}

/**
 * A new fight at T+0. `setup` is ENERGY_DEFAULT_SETUP with anything changed;
 * a bad number throws a RangeError naming it. Returns the state that
 * stepEnergyFight moves.
 */
export function createEnergyFight(setup = {}) {
  const s = checkedSetup(setup);
  const blueTas = iasToTasKt(s.blueKias, s.blueAltFt), redTas = iasToTasKt(s.redKias, s.redAltFt);
  const pose = placeStart(s, blueTas, redTas);
  const blue = newAircraft('blue', pose.blue, s, s.blueKias, s.blueForceG);
  const red = newAircraft('red', pose.red, s, s.redKias, s.redForceG);
  const state = {
    setup: s,
    timeSec: 0, carrySec: 0, merged: false, mergeSec: null, stopped: false,
    firstNose: null, chase: null, evenFight: false, plan: {},
    blue, red,
    rangeFt: 0, ataBlueDeg: 0, ataRedDeg: 0, aaDeg: 0, headingCrossDeg: 0,
  };
  readPair(state);
  // The moves Auto would pick show from the start, so the screen can say them before the turns begin.
  // The pass geometry (off-nose angle, turn directions) is read from a copy flown to the pass; the look-ahead's
  // races fly from a copy of T+0 itself, through the same steps the real fight takes (see noseOnSec).
  const start = structuredClone(state);
  const preview = structuredClone(state);
  atThePass(preview);
  const plan = {};
  start.plan = plan; // a race flies the other aircraft as it will really fly: its plan, once it has one
  const choose = (who) => chooseFirstMove(preview, preview[who], who === 'blue' ? preview.red : preview.blue, start);
  plan.blue = choose('blue');
  plan.red = choose('red');
  // Blue raced against the move a dry run would pick for Red. If Red's own pick, with its race, is another, Blue races
  // again against Red's plan, and Red's race (run against Blue's first pick) is run again against Blue's last, so the numbers in
  // Red's reason are the ones the fight flies. If Red's best move against Blue's last has changed, Red keeps the move it
  // picked (the two picks answer each other, and this ends it) and its reason says so.
  const redInBlueRace = chooseFirstMove({ ...preview, dry: true }, preview.red, preview.blue);
  if (plan.blue.race && plan.red.move !== redInBlueRace.move) {
    plan.blue = choose('blue');
    if (plan.red.race) {
      const again = choose('red');
      plan.red = again.move === plan.red.move ? again : heldPick(plan.red.move, again.race, preview.red.mergeKias, start.setup);
    }
  }
  for (const ac of [blue, red]) {
    const pick = plan[ac.who];
    ac.move = pick.move; ac.moveLabel = MOVE_LABELS[pick.move]; ac.why = pick.why;
  }
  state.plan = plan; // the turns start from exactly these picks; they are not worked out twice
  return state;
}

/** Flies the fight, as it stands, straight to the pass and works out the turn directions there: what the turns will start from. Used on a copy to show the first moves before the turns begin. */
function atThePass(state) {
  const tca = state.setup.turnsStart === 'now' ? 0 : secondsToPass(state);
  if (tca > 0) flyStraight(state, tca);
  chooseTurnDirections(state);
}

/**
 * The first move, from the speed the setup gave for the merge (not the KTAS round trip, which can land a hair under a
 * split point). `start` is the fight at T+0 that the look-ahead's races fly from (see noseOnSec); a pick made at the
 * merge itself, in a dry run, has none.
 */
function chooseFirstMove(state, ac, other, start = null) {
  const p = state.setup;
  const forced = ac.who === 'blue' ? p.blueMove : p.redMove;
  if (forced === 'tactical') return pickTacticalMove(state, ac.who);
  return forced === 'auto' ? autoPick(state, ac, other, ac.mergeKias, start) : { move: forced, why: forcedWhy(forced, ac.mergeKias) };
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
function autoPick(state, ac, other, kias, from = null) {
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
function heldPick(move, race, kias, p) {
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
  const forced = ac.who === 'blue' ? state.setup?.blueMove : state.setup?.redMove;
  if (forced === 'tactical') return pickTacticalMove(state, ac.who);
  return autoPick(state, ac, other, ac.kias);
}

/**
 * Seconds each of the two moves takes to start `who`'s chase, from the fight as it
 * stands; null for none in the look-ahead. The move `likely` to win runs first and
 * the other is stopped at its time: it cannot win by running longer. `later` names
 * that move when it was stopped.
 */
function noseOnRace(from, who, kias, likely) {
  const unlikely = likely === 'immelmann' ? 'pitchBack' : 'immelmann';
  const first = noseOnSec(from, who, likely, kias, Infinity);
  const second = noseOnSec(from, who, unlikely, kias, first.sec ?? Infinity);
  const race = { immelmann: null, pitchBack: null };
  race[likely] = first.sec;
  race[unlikely] = second.sec;
  if (second.cut) race.later = unlikely;
  return race;
}

/**
 * One dry run of the whole fight, scored the way the real fight scores a chase. A
 * deep copy of `from` (the fight as it is, or at T+0 before the pass), `who` put in
 * `move`, the other flying as it would anyway, stepped with the fight's own step
 * until `who`'s chase would be named: its nose within 5° of the other with the
 * other's aspect 150° or less, or any nose-on with `chaseAfterHeadOn` (onTheOther,
 * the same rule checkFirstNose uses). Returns { sec } from the pick (from the merge
 * before the pass) or null for no win, and { cut: true } when the run was stopped
 * for passing `cutSec`. No win means: the other's chase comes first, `who` goes
 * OVER G or STALLs, or pickLookaheadSec has gone. The real state is not touched.
 */
function noseOnSec(from, who, move, kias, cutSec) {
  const sim = structuredClone(from);
  sim.dry = true;
  const me = sim[who], you = who === 'blue' ? sim.red : sim.blue;
  let t0;
  if (!sim.merged) {
    // Before the pass: the real steps to the merge, with `who` planned to take `move` there.
    sim.plan = { ...from.plan, [who]: { move, why: '' } };
    // The straight run to the pass is the same in every step (the courses do not change), so all but its last
    // steps are flown in one go; the steps that reach the pass, and the turns, are the real ones.
    const wholeSteps = Math.floor((sim.setup.turnsStart === 'now' ? 0 : secondsToPass(sim)) / FIGHT_STEP_SEC) - 2;
    if (wholeSteps > 0 && wholeSteps * FIGHT_STEP_SEC < FIGHT_MAX_SEC) {
      flyStraight(sim, wholeSteps * FIGHT_STEP_SEC);
      sim.timeSec += wholeSteps * FIGHT_STEP_SEC;
      readPair(sim);
    }
    while (!sim.merged && !sim.stopped) {
      stepOnce(sim);
      if (sim.timeSec >= FIGHT_MAX_SEC - 1e-6) sim.stopped = true;
    }
    t0 = sim.mergeSec;
  } else {
    startMove(sim, me, move, '', kias);
    t0 = sim.timeSec;
  }
  const until = t0 + sim.setup.pickLookaheadSec;
  // `flags`: OVER G and STALL belong to a step the move has flown. At the pick itself they are the last move's.
  const judge = (flags) => {
    if (flags && (me.overG || me.stall)) return { sec: null };
    const mine = onTheOther(sim, me, you) || shouldPursueTactical(sim, me, you);
    const theirs = onTheOther(sim, you, me) || shouldPursueTactical(sim, you, me);
    if (theirs && !mine) return { sec: null };
    return mine ? { sec: sim.timeSec - t0 } : null;
  };
  let verdict = sim.merged ? judge(from.merged === false) : null;
  while (!verdict) {
    if (sim.timeSec >= until - 1e-9 || sim.stopped) return { sec: null };
    stepOnce(sim);
    if (sim.timeSec >= FIGHT_MAX_SEC - 1e-6) sim.stopped = true;
    if (sim.timeSec - t0 > cutSec + 1e-9) return { sec: null, cut: true };
    verdict = judge(true);
  }
  return verdict;
}

/**
 * The dry run: the lowest speed an Immelmann would reach on the way up and over
 * the top, found by flying a copy of the aircraft through it alone, with the
 * same control code and step, until it is over the top and starts to roll
 * upright (or has failed). The real aircraft and the real fight are not touched.
 */
function immelmannTopKias(p, ac, other, kias) {
  const sim = structuredClone(ac);
  const alone = { setup: p };
  startMove(alone, sim, 'immelmann', '', kias);
  sim.ctl.prevKias = sim.kias; sim.ctl.kiasRateEff = 0;
  let low = sim.kias;
  for (let t = 0; t < TUNING.dryRunMaxSec; t += FIGHT_STEP_SEC) {
    stepAircraft(alone, sim, { pm: other?.pm ?? other }, FIGHT_STEP_SEC);
    low = Math.min(low, sim.kias);
    if (sim.ctl.phase !== 'main' || sim.move !== 'immelmann') break;
  }
  return low;
}

/**
 * Determine candidate maneuvers from authentic Harvard II envelopes and safety limits.
 * - immelmann: 180 <= KIAS <= 316 (T6A_LIMITS.vmoKias), apex speed >= (setup.immelmannMinTopKias ?? 120)
 * - pitchBack: 150 <= KIAS <= 260
 * - slice: 90 <= KIAS <= 175 and (ac.altFt - setup.hardDeckFt) > (setup.deckMarginFt ?? 1000)
 * - splitS: (setup.stallKias ?? 86) <= ac.kias <= 140 (D381), ac.altFt - lossFt > setup.hardDeckFt
 * - mpt: Always feasible
 *
 * @param {any} ac - Aircraft state or partial state
 * @param {any} [other] - Opponent aircraft state
 * @param {any} [setup] - Fight setup options
 * @returns {string[]} Array of candidate move names
 */
export function getFeasibleMoves(ac, other = null, setup = ENERGY_DEFAULT_SETUP) {
  const s = { ...ENERGY_DEFAULT_SETUP, ...(setup || {}) };
  const hardDeckFt = s.hardDeckFt ?? ENERGY_DEFAULT_SETUP.hardDeckFt;
  const deckMarginFt = s.deckMarginFt ?? 1000;
  const stallKias = s.stallKias ?? T6A_LIMITS.stallKias;
  const rollRateDegPerSec = s.rollRateDegPerSec ?? ENERGY_DEFAULT_SETUP.rollRateDegPerSec;
  const immelmannMinTopKias = s.immelmannMinTopKias ?? 120;

  const kias = ac?.kias ?? (ac?.pm ? tasToIasKt(len(velOf(ac.pm)) / KT_TO_FTPS, ac.pm.z) : 200);
  const altFt = ac?.altFt ?? ac?.pm?.z ?? 10000;

  const moves = [];

  // 1. Immelmann: 180 <= KIAS <= 316, apex speed >= immelmannMinTopKias
  if (kias >= 180 && kias <= T6A_LIMITS.vmoKias) {
    let fullAc = ac;
    if (!ac?.pm || !ac?.ctl) {
      const ktas = iasToTasKt(kias, altFt);
      fullAc = newAircraft(ac?.who ?? 'blue', { x: 0, y: 0, z: altFt, ktas, headingRad: 0 }, s, kias, null);
    }
    let fullOther = other;
    if (!fullOther || !fullOther.pm) {
      const ktas = iasToTasKt(fullAc.kias ?? kias, altFt);
      fullOther = newAircraft('red', { x: 10000, y: 0, z: altFt, ktas, headingRad: Math.PI }, s, fullAc.kias ?? kias, null);
    }
    let apex = 0;
    try {
      apex = immelmannTopKias(s, fullAc, fullOther, kias);
    } catch {
      apex = 0;
    }
    if (apex >= immelmannMinTopKias) {
      moves.push('immelmann');
    }
  }

  // 2. Pitch Back: 150 <= KIAS <= 260
  if (kias >= 150 && kias <= 260) {
    moves.push('pitchBack');
  }

  // 3. Slice: 90 <= KIAS <= 175 and altitude margin > deckMarginFt
  if (kias >= 90 && kias <= 175 && (altFt - hardDeckFt) > deckMarginFt) {
    moves.push('slice');
  }

  // 4. Split S: stallKias <= KIAS <= 140 (D381), altFt - lossFt > hardDeckFt
  if (kias >= stallKias && kias <= 140) {
    const lossFt = splitST6A(kias, altFt, { stallKias, rollRateDegPerSec }).fromTopFt;
    if (altFt - lossFt > hardDeckFt) {
      moves.push('splitS');
    }
  }

  // 5. MPT: Always feasible (baseline sustained rate turn)
  moves.push('mpt');

  return moves;
}

/**
 * Dynamic tactical maneuver selector using forward simulation dry-runs and utility scoring.
 * Evaluates all feasible candidate moves for `who` against `other` over lookahead horizon.
 *
 * Ranking criteria:
 * 1. Primary: Earliest victory timestamp (winSec).
 * 2. Secondary: Highest tactical advantage differential (ΔAdv).
 * 3. Tertiary: Specific energy height (He) tie-breaker.
 *
 * @param {any} state - Fight state
 * @param {any} who - 'blue', 'red', or aircraft object
 * @param {number} [lookaheadSec] - Lookahead horizon in seconds (default 20 s)
 * @returns {{ move: string, why: string, winSec: number|null, deltaAdv: number }}
 */
export function pickTacticalMove(state, who, lookaheadSec = (state.setup?.tacticalLookaheadSec ?? 20)) {
  const whoName = typeof who === 'string' ? who : (who?.who ?? 'blue');
  const otherName = whoName === 'blue' ? 'red' : 'blue';
  const meAc = state[whoName];
  const otherAc = state[otherName];
  const setup = state.setup ?? ENERGY_DEFAULT_SETUP;

  const candidates = getFeasibleMoves(meAc, otherAc, setup);
  if (!candidates.length) {
    return {
      move: 'mpt',
      why: 'Tactical AI: MPT baseline',
      winSec: null,
      deltaAdv: 0,
    };
  }

  const evaluated = [];

  for (const move of candidates) {
    const sim = structuredClone(state);
    sim.dry = true;
    const me = sim[whoName], you = sim[otherName];
    let t0;

    if (!sim.merged) {
      sim.plan = { ...(state.plan || {}), [whoName]: { move, why: '' } };
      const wholeSteps = Math.floor((sim.setup.turnsStart === 'now' ? 0 : secondsToPass(sim)) / FIGHT_STEP_SEC) - 2;
      if (wholeSteps > 0 && wholeSteps * FIGHT_STEP_SEC < FIGHT_MAX_SEC) {
        flyStraight(sim, wholeSteps * FIGHT_STEP_SEC);
        sim.timeSec += wholeSteps * FIGHT_STEP_SEC;
        readPair(sim);
      }
      while (!sim.merged && !sim.stopped) {
        stepOnce(sim);
        if (sim.timeSec >= FIGHT_MAX_SEC - 1e-6) sim.stopped = true;
      }
      t0 = sim.mergeSec ?? sim.timeSec;
      startMove(sim, me, move, '', me.kias);
    } else {
      startMove(sim, me, move, '', me.kias);
      t0 = sim.timeSec;
    }

    const until = t0 + lookaheadSec;
    let winSec = null;
    let lost = false;
    let valid = true;

    // Check initial condition at t0
    const win0 = onTheOther(sim, me, you) || shouldPursueTactical(sim, me, you);
    const loss0 = onTheOther(sim, you, me) || shouldPursueTactical(sim, you, me);
    if (win0 && !loss0) {
      winSec = 0;
    } else if (loss0 && !win0) {
      lost = true;
    }

    if (winSec === null && !lost) {
      while (sim.timeSec < until - 1e-9 && !sim.stopped) {
        stepOnce(sim);
        if (sim.timeSec >= FIGHT_MAX_SEC - 1e-6) sim.stopped = true;

        if (me.stall || me.overG) {
          valid = false;
          break;
        }

        const win = onTheOther(sim, me, you) || shouldPursueTactical(sim, me, you);
        const loss = onTheOther(sim, you, me) || shouldPursueTactical(sim, you, me);

        if (win && !loss) {
          winSec = sim.timeSec - t0;
          break;
        }
        if (loss && !win) {
          lost = true;
          break;
        }
      }
    }

    const advMe = tacticalAdvantage(me, you);
    const advYou = tacticalAdvantage(you, me);
    const deltaAdv = advMe - advYou;
    const alt = me.altFt ?? me.pm.z;
    const ktas = me.ktas ?? (len(velOf(me.pm)) / KT_TO_FTPS);
    const he = energyHeightFt(alt, ktas);

    evaluated.push({
      move,
      valid,
      winSec,
      lost,
      deltaAdv,
      he,
    });
  }

  // Rank candidates
  evaluated.sort((a, b) => {
    // 0. Valid beats invalid
    if (a.valid !== b.valid) return a.valid ? -1 : 1;

    // 1. Victory: earliest winSec wins
    const aWins = a.winSec !== null && a.winSec !== undefined;
    const bWins = b.winSec !== null && b.winSec !== undefined;
    if (aWins && bWins) {
      if (Math.abs(a.winSec - b.winSec) > 1e-4) return a.winSec - b.winSec;
      if (Math.abs(a.deltaAdv - b.deltaAdv) > 1e-4) return b.deltaAdv - a.deltaAdv;
      if (Math.abs(a.he - b.he) > 1.0) return b.he - a.he;
      return 0;
    }
    if (aWins !== bWins) return aWins ? -1 : 1;

    // 2. Penalty: non-loss beats loss
    if (a.lost !== b.lost) return a.lost ? 1 : -1;

    // 3. Highest deltaAdv
    if (Math.abs(a.deltaAdv - b.deltaAdv) > 1e-4) return b.deltaAdv - a.deltaAdv;

    // 4. Highest He
    if (Math.abs(a.he - b.he) > 1.0) return b.he - a.he;

    return 0;
  });

  const best = evaluated[0];
  let why;
  const label = MOVE_LABELS[best.move] ?? best.move;
  if (best.winSec !== null && best.winSec !== undefined) {
    why = `Tactical AI: ${label} predicted victory in ${best.winSec.toFixed(1)} s (earliest intercept)`;
  } else {
    const sign = best.deltaAdv >= 0 ? '+' : '';
    why = `Tactical AI: ${label} chosen for positional advantage (ΔAdv ${sign}${best.deltaAdv.toFixed(2)})`;
  }

  return {
    move: best.move,
    why,
    winSec: best.winSec,
    deltaAdv: best.deltaAdv,
  };
}

// ── Readouts ────────────────────────────────────────────────────────────────

/**
 * The real horizon's frame for an aircraft: up square to the path, left square
 * to both, and the carried right. Within 15° of straight up or down the horizon
 * gives no reference, so the carried up stands in and `nearVertical` is set.
 */
function horizonFrame(pm) {
  const vHat = unit(velOf(pm));
  const c = vHat.z;
  const cosGamma = Math.sqrt(Math.max(0, 1 - c * c));
  let upH = pm.up;
  if (cosGamma > 0.26) {
    // The real horizon's up, square to the path. It flips sign over the top, which the carried one does not.
    upH = unit({ x: -c * vHat.x, y: -c * vHat.y, z: 1 - c * vHat.z });
  }
  const leftH = cross(upH, vHat);
  return { vHat, upH, leftH, rightC: cross(vHat, pm.up), nearVertical: cosGamma <= 0.26 };
}

/** The carried bank as a bank from the real horizon, toward the turn direction, in degrees (-180 to 180). */
function physicalBankDeg(pm, bankRad, dir) {
  const fr = horizonFrame(pm);
  const lift = add(scale(pm.up, Math.cos(bankRad)), scale(fr.rightC, Math.sin(bankRad)));
  return radToDeg(Math.atan2(dot(lift, scale(fr.leftH, dir || 1)), dot(lift, fr.upH)));
}

/** The carried bank that puts the lift `betaRad` from the real horizon toward the turn direction. */
function carriedBankFor(pm, betaRad, dir) {
  const fr = horizonFrame(pm);
  const lift = add(scale(fr.upH, Math.cos(betaRad)), scale(fr.leftH, Math.sin(betaRad) * dir));
  return Math.atan2(dot(lift, fr.rightC), dot(lift, pm.up));
}

/** Copies the point-mass state and the performance numbers a screen reads into the aircraft. A dry run (`display` false) skips the two that only a screen reads, specific power and energy height. */
function readOut(ac, g, throttle, p, shaker = null, display = true) {
  const f = pointMassFlight(ac.pm);
  const kias = tasToIasKt(f.ktas, f.altFt);
  ac.xFt = ac.pm.x; ac.yFt = ac.pm.y; ac.zFt = ac.pm.z; ac.altFt = ac.pm.z;
  ac.headingRad = f.headingRad;
  ac.kias = kias;
  ac.ktas = f.ktas;
  ac.climbDeg = radToDeg(f.climbRad);
  ac.g = g;
  ac.throttle = throttle;
  ac.bankDeg = physicalBankDeg(ac.pm, ac.bankRad, ac.turnDir || 1);
  ac.inverted = Math.abs(ac.bankDeg) > 90;
  ac.shakerG = shaker ?? shakerG(kias, p);
  if (!display) return;
  const excess = excessFnFor(throttle)(f.ktas, f.altFt, Math.max(g, 0));
  ac.psFtps = f.ktas * KT_TO_FTPS * excess;
  ac.energyHeightFt = energyHeightFt(f.altFt, f.ktas);
}

/** Angle in degrees between an aircraft's nose (its velocity) and the line to another, in 3D; 180 when they are on top of each other. */
function noseAngleDeg(from, to) {
  const los = sub(posOf(to.pm), posOf(from.pm));
  const d = len(los);
  if (d < 1) return 180;
  return radToDeg(Math.acos(clamp(dot(unit(velOf(from.pm)), scale(los, 1 / d)), -1, 1)));
}

function readPair(state) {
  const { blue, red } = state;
  state.rangeFt = len(sub(posOf(red.pm), posOf(blue.pm)));
  state.ataBlueDeg = noseAngleDeg(blue, red);
  state.ataRedDeg = noseAngleDeg(red, blue);
  state.aaDeg = 180 - state.ataRedDeg;
  state.headingCrossDeg = Math.abs(radToDeg(wrapPi(red.headingRad - blue.headingRad)));
}

// ── Which way each aircraft turns ────────────────────────────────────────────

/** +1 when the other is on this aircraft's left in the ground plane, -1 on its right, 0 when dead ahead or astern (a tie). */
function sideOfOther(from, other) {
  const a = Math.atan2(other.pm.y - from.pm.y, other.pm.x - from.pm.x);
  const s = Math.sin(a - from.headingRad);
  return Math.abs(s) < 1e-6 ? 0 : Math.sign(s);
}

/**
 * Blue turns toward Red; in a 2-circle fight Red turns toward Blue, in a
 * 1-circle fight the other way. At a tie (head-on) V6's directions stand: Blue
 * counter-clockwise, Red counter-clockwise (2-circle) or clockwise (1-circle).
 */
function chooseTurnDirections(state) {
  const { blue, red, setup } = state;
  const blueToward = sideOfOther(blue, red) || 1;
  const redToward = sideOfOther(red, blue) || 1;
  blue.towardDir = blueToward; red.towardDir = redToward;
  blue.turnDir = blueToward;
  red.turnDir = setup.circles === 2 ? redToward : -redToward;
}

// ── Moves: start and controllers ────────────────────────────────────────────

/**
 * Puts an aircraft into a move: resets the move's own memory and gives the
 * reason the screen shows. `ac.move` is the name the screen shows; `ctl.mode` is
 * what the controller flies. They differ after a pitch back or slice hands to
 * the MPT: it flies the MPT at once but keeps its name until the speed is
 * within 5 kt of the MPT speed.
 */
function startMove(state, ac, move, why, kias) {
  const p = state.setup;
  const c = ac.ctl;
  c.t = 0; c.turnDeg = 0; c.phase = 'main'; c.mode = move;
  c.entryKias = kias;
  c.halfUntilShaker = false; c.capture = false; c.level = false; c.levelAltFt = null; c.down = false;
  c.upZ0 = Math.sign(ac.pm.up.z) || 1;
  c.prefer = rollSideSign(ac);
  ac.move = move; ac.moveLabel = MOVE_LABELS[move]; ac.why = why;
  const dir = ac.turnDir;
  switch (move) {
    case 'pitchBack': {
      const bank = lerpHeld(kias, 160, p.pitchBackBank160Deg, 220, p.pitchBackBank220Deg);
      c.holdBankRad = carriedBankFor(ac.pm, degToRad(bank), dir);
      break;
    }
    case 'slice': {
      const bank = lerpHeld(kias, p.mptKias, SLICE_BANK_AT_MPT_DEG, SLICE_ENTRY_LOW_KIAS, SLICE_BANK_AT_100_DEG);
      c.holdBankRad = carriedBankFor(ac.pm, degToRad(bank), dir);
      break;
    }
    case 'immelmann': case 'splitS':
      c.holdBankRad = carriedBankFor(ac.pm, 0, dir); // wings level, whichever way up the carried frame is
      if (move === 'splitS') c.phase = 'pitchUp';
      break;
    case 'mpt':
      c.halfUntilShaker = kias > p.mptKias; // rolling straight in from above its speed: PCL to mid-range until the shaker
      break;
    default: break;
  }
}

/** A pitch back or slice has found the MPT speed: fly the MPT's capture law from here, under the move's own name. */
function handToMpt(ac) {
  const c = ac.ctl;
  c.mode = 'mpt'; c.capture = true; c.t = 0;
  c.halfUntilShaker = false; c.level = false; c.levelAltFt = null;
  c.mptEvalTimer = 0;
}

/** From the first nose-on the chaser flies pursuit, for the rest of the fight. */
function startPursuit(state, ac) {
  const c = ac.ctl;
  c.mode = 'pursuit'; c.next = null;
  c.halfUntilShaker = false; c.capture = false; c.level = false; c.levelAltFt = null;
  c.forceG = null; c.chaseLimited = false;
  ac.move = 'pursuit'; ac.moveLabel = MOVE_LABELS.pursuit;
  ac.why = `${{ pure: 'Pure', lead: 'Lead', lag: 'Lag' }[state.setup.pursuit]} pursuit after first nose-on`;
}

/** The sign of the carried bank that rolls the lift toward the turn side, now (it flips with the carried frame over the top). */
function rollSideSign(ac) {
  const fr = horizonFrame(ac.pm);
  if (fr.nearVertical) return -(ac.turnDir || 1);
  return Math.sign(dot(scale(fr.leftH, ac.turnDir || 1), fr.rightC)) || 1;
}

/** True once the path has gone through the vertical since the move began: the carried frame has turned over. */
function passedVertical(ac) {
  return (Math.sign(ac.pm.up.z) || 1) !== ac.ctl.upZ0;
}

/** The pull G the model asks for while it sets a move up: the set G (4 by default), never past the shaker. The one place every 4 G hold goes through. */
function pullCmdG(ctx) {
  return Math.min(ctx.p.pullG, ctx.shaker);
}

/** A level-off's G: the vertical-plane pull that closes on a flight path angle with a first-order lag. */
function levelOffG(ctx, climbTargetRad) {
  const vFtps = ctx.f.ktas * KT_TO_FTPS;
  const n = Math.cos(ctx.f.climbRad) + (vFtps / G_FTPS2) * TUNING.levelOmegaPerSec * (climbTargetRad - ctx.f.climbRad);
  return clamp(n, 0, ctx.shaker);
}

/** Bank move controller shared by the pitch back and the slice: hold the entry bank at the set G (the shaker once it is the lower), and hand to the MPT as the speed nears it. */
function controlBankMove(ctx) {
  const { ac, p, kias, f } = ctx;
  const c = ac.ctl;
  // The MPT is near when the speed, a little ahead, reaches it from the side the move started on.
  const ramp = clamp((c.entryKias - TUNING.captureLeadFromKias) / (T6A_LIMITS.vmoKias - TUNING.captureLeadFromKias), 0, 1);
  const leadSec = TUNING.captureLeadSec + (TUNING.captureLeadFastSec - TUNING.captureLeadSec) * ramp;
  const ahead = kias + c.kiasRateEff * leadSec;
  const fromAbove = c.entryKias > p.mptKias;
  const there = fromAbove ? ahead <= p.mptKias : ahead >= p.mptKias;
  const turned = c.turnDeg >= TUNING.maxBankMoveTurnDeg;
  if ((there && !ac.rolling && c.t > 0.5) || turned) c.next = 'mpt';
  const rolling = ac.rolling || willRoll(ctx, c.holdBankRad, c.prefer);
  const g = rolling ? (pullCmdG(ctx) > MANEUVER_PULL_G ? pullCmdG(ctx) : Math.min(pullCmdG(ctx), T6A_LIMITS.rollingMaxG)) : pullCmdG(ctx);
  return { g, bankRad: c.holdBankRad, prefer: c.prefer, throttle: 1 };
}

function controlImmelmann(ctx) {
  const { ac, f } = ctx;
  const c = ac.ctl;
  const climb = radToDeg(f.climbRad);
  if (c.phase === 'main') {
    // A stall on the way up ends it: unload and fly out (below).
    if (ac.stall) { c.phase = 'recover'; return controlImmelmannRecover(ctx, climb); }
    // Over the top and coming down the back toward level, inverted: roll upright.
    if (passedVertical(ac) && climb <= TUNING.immelmannRollStartDeg) { c.phase = 'roll'; c.prefer = rollSideSign(ac); }
    // Wings level, up and over at the set G (the shaker once it is the lower).
    return { g: pullCmdG(ctx), bankRad: c.holdBankRad, prefer: c.prefer, throttle: 1 };
  }
  if (c.phase === 'recover') return controlImmelmannRecover(ctx, climb);
  const upright = wrapPi(c.holdBankRad + Math.PI);
  if (c.phase === 'roll') {
    if (Math.abs(wrapPi(upright - ac.bankRad)) < degToRad(3)) c.phase = 'level';
    return { g: Math.min(1, ctx.shaker), bankRad: upright, prefer: c.prefer, throttle: 1 };
  }
  // Level: pull or ease to level flight, upright.
  if (Math.abs(climb) < TUNING.levelDoneDeg) c.next = 'mpt';
  return { g: levelOffG(ctx, 0), bankRad: upright, prefer: c.prefer, throttle: 1 };
}


/**
 * A failed Immelmann (it stalled before the top): wings level by the real
 * horizon, nose to the horizon once the wing is flying again, and it ends
 * upright and level, to be picked from again.
 */
function controlImmelmannRecover(ctx, climbDeg) {
  const { ac } = ctx;
  const c = ac.ctl;
  const cmd = physicalBankCommand(ctx, 0, levelOffG(ctx, 0), 1);
  if (!ac.stall && Math.abs(climbDeg) < TUNING.levelDoneDeg && Math.abs(ac.bankDeg) < 30) c.next = 'mpt';
  return cmd;
}

/**
 * The split S, flown as core's splitST6A flies it (the pin test holds them to
 * the same height loss): nose up to about 20° in the shaker (skipped below the
 * shaker speed, where the nose cannot come up without stalling), roll inverted
 * at about 0.5 G (SMM 14.16 para 41), then pull through in the shaker until
 * level, up to 5 G (Patrick's word; the SMM's Table 14.1 says about 4 G). The
 * shaker here is core's (7 kt over the stall, at most 5 G), for the split S only.
 */
function controlSplitS(ctx) {
  const { ac, f, p } = ctx;
  const c = ac.ctl;
  const climb = f.climbRad;
  const invertedBank = wrapPi(c.holdBankRad + Math.PI);
  // (core's shakerG reads its maxG default as the literal type 7, so the 5 G cap needs the cast for the type check.)
  const pull = coreShakerG(ctx.kias, { stallKias: p.stallKias, maxG: /** @type {any} */ (T6A_MANOEUVRE.splitSMaxG) });
  if (c.phase === 'pitchUp') {
    if (climb < degToRad(T6A_MANOEUVRE.splitSNoseUpDeg) && pull > 1) return { g: pull, bankRad: c.holdBankRad, prefer: c.prefer, throttle: 1 };
    c.phase = 'roll'; c.prefer = rollSideSign(ac);
  }
  if (c.phase === 'roll') {
    if (Math.abs(wrapPi(invertedBank - ac.bankRad)) > 1e-6) return { g: T6A_MANOEUVRE.splitSRollG, bankRad: invertedBank, prefer: c.prefer, throttle: 1 };
    c.phase = 'pull';
  }
  if (c.phase === 'pull') {
    if (climb < 0) c.down = true;
    if (!(c.down && climb >= 0)) return { g: pull, bankRad: invertedBank, prefer: c.prefer, throttle: 1 };
    c.phase = 'level';
  }
  if (Math.abs(radToDeg(climb)) < TUNING.levelDoneDeg) c.next = 'mpt';
  return { g: levelOffG(ctx, 0), bankRad: invertedBank, prefer: c.prefer, throttle: 1 };
}

/**
 * The bank that steers the speed to the MPT speed: how fast the speed should
 * close on it sets the flight path angle that thrust minus drag allows, and the
 * bank is what gives the lift to fly that path at the G being pulled. Speed
 * high: nose higher and less bank. Speed low: nose lower and more bank
 * (EFIG p.430, SMM 14.4 para 8). Steady at 160 it is the 70 to 75° of the SMM.
 */
function speedHoldBankDeg(ctx, g, minDeg, maxDeg) {
  const { f, p } = ctx;
  const vFtps = f.ktas * KT_TO_FTPS;
  const mptFtps = iasToTasKt(p.mptKias, f.altFt) * KT_TO_FTPS;
  // A little ahead of the speed: the error plus where the present rate of change takes it (TAS rate from the KIAS rate).
  const rateFtps2 = ctx.ac.ctl.kiasRateEff * (f.ktas / Math.max(ctx.kias, 1)) * KT_TO_FTPS;
  const accelWanted = -((vFtps - mptFtps) + TUNING.speedLeadSec * rateFtps2) / TUNING.speedTauSec;
  const sinClimb = clamp(t6aExcessFn(f.ktas, f.altFt, g) - accelWanted / G_FTPS2, -0.95, 0.95);
  const liftNeeded = Math.cos(f.climbRad) + (vFtps / G_FTPS2) * TUNING.levelOmegaPerSec * (Math.asin(sinClimb) - f.climbRad);
  const cosBank = clamp(liftNeeded / Math.max(g, 1e-6), Math.cos(degToRad(maxDeg)), Math.cos(degToRad(minDeg)));
  return radToDeg(Math.acos(cosBank));
}

/** The MPT: constant-speed above the hard deck, level at it. */
function controlMpt(ctx) {
  const { state, ac, p, f, kias, d } = ctx;
  const c = ac.ctl;
  const vFtps = f.ktas * KT_TO_FTPS;
  const climb = f.climbRad;

  // Mid-fight tactical opportunity re-evaluation in MPT
  if (!state.dry && state.merged && (c.mode === 'mpt' || c.mode === 'levelMpt')) {
    if (c.lockoutTimer > 0) c.lockoutTimer = Math.max(0, c.lockoutTimer - d);
    c.mptEvalTimer = (c.mptEvalTimer || 0) + d;
    if (c.mptEvalTimer >= 3.5 && (c.lockoutTimer || 0) <= 0) {
      c.mptEvalTimer = 0;
      const forced = ac.who === 'blue' ? p.blueMove : p.redMove;
      if (forced === 'tactical') {
        const altMargin = ((ac.altFt ?? f.altFt) - p.hardDeckFt) > (p.deckMarginFt ?? 1000);
        if (altMargin && !ac.stall && !ac.overG) {
          const best = pickTacticalMove(state, ac.who, p.tacticalLookaheadSec ?? 20);
          if (best && best.move !== 'mpt' && best.move !== 'levelMpt') {
            if ((best.winSec !== null && best.winSec !== undefined) || best.deltaAdv > 0.25) {
              startMove(state, ac, best.move, best.why, kias);
              c.lockoutTimer = 4.0;
              return controlFor(ctx);
            }
          }
        }
      }
    }
  }

  // A move handed to the MPT keeps its name until the speed is within 5 kt of the MPT speed, then reads MPT.
  if (ac.move !== 'mpt' && ac.move !== 'levelMpt' && Math.abs(kias - p.mptKias) <= MPT_WITHIN_KT) {
    ac.move = 'mpt'; ac.moveLabel = MOVE_LABELS.mpt; ac.why = `MPT ${round(p.mptKias)} KIAS`;
  }
  if (!c.level) {
    const verticalSpeed = vFtps * Math.sin(climb);
    if (f.altFt + verticalSpeed * TUNING.levelLeadSec <= p.hardDeckFt) {
      c.level = true;
      c.levelAltFt = p.hardDeckFt; // it aims at the deck itself, from above or a little below
      ac.move = 'levelMpt'; ac.moveLabel = MOVE_LABELS.levelMpt;
      ac.why = `Level MPT at the ${feet(p.hardDeckFt)} ft deck`;
    }
  }
  // The pull: the set G (4) while above the shaker speed (the PCL at mid-range), then the shaker.
  const onShaker = p.pullG >= ctx.shaker;
  if (c.halfUntilShaker && onShaker) c.halfUntilShaker = false;
  const named = ac.move === 'mpt' || ac.move === 'levelMpt';
  let g = c.halfUntilShaker || !named ? pullCmdG(ctx) : ctx.shaker; // until the MPT is named (within 5 kt) a handed-over pitch back still holds its 4 G
  const throttle = c.halfUntilShaker ? p.midThrottle : 1;
  if (!c.level) {
    // Handed over from a pitch back or slice: free to use any bank until the speed is found, then 60 to 85°.
    if (c.capture && Math.abs(kias - p.mptKias) <= TUNING.settledKt && Math.abs(c.kiasRateEff) <= TUNING.settledKtPerSec) c.capture = false;
    const [minDeg, maxDeg] = c.capture ? [0, TUNING.captureBankMaxDeg] : [MPT_BANK_MIN_DEG, MPT_BANK_MAX_DEG];
    const cmd = physicalBankCommand(ctx, speedHoldBankDeg(ctx, g, minDeg, maxDeg), g, throttle);
    // Rolling to a new bank (the one definition) the pilot holds about the set G, not the shaker, capped by rolling limit.
    const rolling = willRoll(ctx, cmd.bankRad, cmd.prefer);
    if (rolling) cmd.g = Math.min(cmd.g, pullCmdG(ctx), T6A_LIMITS.rollingMaxG);
    if (rolling && !c.capture && c.t < TUNING.rollInSec) {
      // Rolling in from wings level: pull only as the bank builds, so the nose does not climb away.
      cmd.g = Math.min(cmd.g, Math.cos(climb) / Math.max(Math.cos(degToRad(Math.abs(ac.bankDeg))), 0.3));
    }
    return cmd;
  }
  // Level: bank holds the height, the nose stays on the horizon.
  const levelErr = c.levelAltFt - f.altFt;
  const climbTarget = Math.asin(clamp(levelErr * TUNING.levelAltGainPerSec / vFtps, -0.5, 0.5));
  const needN = Math.cos(climb) + (vFtps / G_FTPS2) * TUNING.levelOmegaPerSec * (climbTarget - climb);
  const levelCmd = (pull) => physicalBankCommand(ctx, radToDeg(Math.acos(clamp(needN / Math.max(pull, 1e-6), Math.cos(degToRad(TUNING.levelBankMaxDeg)), 1))), pull, throttle);
  // Rolling to a new bank (the one definition) the pilot holds about the set G, not the shaker: the bank is worked out again for it.
  const cmd = levelCmd(g);
  const rollG = Math.min(pullCmdG(ctx), T6A_LIMITS.rollingMaxG);
  if (g > rollG && willRoll(ctx, cmd.bankRad, cmd.prefer)) return levelCmd(rollG);
  return cmd;
}

/**
 * A bank from the real horizon. Near the vertical the horizon gives no reference
 * (a pilot over the top of a pitch back holds the bank he has), so the command
 * holds the current bank until the nose is 15° off the vertical.
 * One exception, the nose low: a held bank past 90° there (the lift pointing below the true horizon) pulls the nose
 * further down, and holding it is a stable dive that never pulls out (a forced slice from a very low speed, high up,
 * verification F1). So with the nose low (and not exactly vertical) the bank is taken from the true horizon, as the
 * move asks for it but at most 90°, and the pull brings the nose up.
 */
function physicalBankCommand(ctx, bankDeg, g, throttle) {
  const { ac } = ctx;
  const fr = horizonFrame(ac.pm);
  if (fr.nearVertical) {
    if (fr.vHat.z < 0 && Math.abs(fr.vHat.z) < 1 - 1e-12) {
      // The true horizon's up and left, square to the path (the frame gives the carried up here, which turns with the roll).
      const upTrue = unit({ x: -fr.vHat.z * fr.vHat.x, y: -fr.vHat.z * fr.vHat.y, z: 1 - fr.vHat.z * fr.vHat.z });
      const leftTrue = cross(upTrue, fr.vHat);
      const beta = degToRad(Math.min(Math.max(bankDeg, 0), 90));
      const lift = add(scale(upTrue, Math.cos(beta)), scale(leftTrue, Math.sin(beta) * ac.turnDir));
      return { g, bankRad: Math.atan2(dot(lift, fr.rightC), dot(lift, ac.pm.up)), prefer: ac.ctl.prefer, throttle };
    }
    return { g, bankRad: ac.bankRad, prefer: ac.ctl.prefer, throttle };
  }
  const target = carriedBankFor(ac.pm, degToRad(bankDeg), ac.turnDir);
  const inv = ac.pm.up.z < 0;
  return { g, bankRad: target, prefer: inv ? ac.turnDir : -ac.turnDir, throttle };
}

/**
 * Curved Control Zone aim point 1,500 ft along the turn circle circumference behind the target.
 * (Falcon BMS / CNATRA P-825 doctrine; BFM Phase 2B)
 */
export function curvedControlZonePoint(target, arcLenFt = 1500) {
  if (!target || !target.pm) return { x: 0, y: 0, z: 0 };
  const pm = target.pm;
  const vFtps = Math.hypot(pm.vx, pm.vy);
  if (vFtps < 1) return posOf(pm);

  const dir = target.turnDir || 0;
  const g = target.g ?? 1.0;
  const isTurning = Math.abs(dir) > 0.1 && g >= 1.15;
  const r = isTurning ? turnRadiusFt(vFtps, g) : Infinity;

  if (!isTurning || !Number.isFinite(r) || r > 20000) {
    const u = { x: pm.vx / vFtps, y: pm.vy / vFtps };
    return { x: pm.x - u.x * arcLenFt, y: pm.y - u.y * arcLenFt, z: pm.z };
  }

  const psi = Math.atan2(pm.vy, pm.vx);
  // Turn center in horizontal plane: normal rotated 90° toward turnDir
  const cx = pm.x - dir * r * Math.sin(psi);
  const cy = pm.y + dir * r * Math.cos(psi);

  // Angular position of target from turn center
  const theta0 = Math.atan2(pm.y - cy, pm.x - cx);

  // 1,500 ft behind along the curved circumference
  const dTheta = (arcLenFt / r) * dir;
  const thetaCZ = theta0 - dTheta;

  return {
    x: cx + r * Math.cos(thetaCZ),
    y: cy + r * Math.sin(thetaCZ),
    z: pm.z,
  };
}

/** Where a chaser aims: the other (pure), a point `leadSec` ahead of it along its path (lead), or the curved Control Zone 1,500 ft behind along the turn circle (lag). */
export function aimPoint(p, target) {
  if (!target || !target.pm) return { x: 0, y: 0, z: 0 };
  if (p.pursuit === 'lead') {
    return add(posOf(target.pm), scale(velOf(target.pm), p.leadSec));
  }
  if (p.pursuit === 'lag') {
    if (p.lagSec === 0) return posOf(target.pm);
    return curvedControlZonePoint(target, 1500 * (p.lagSec ?? 1));
  }
  return posOf(target.pm);
}


/**
 * Pursuit: point the nose at the aim point with a lift vector that also carries
 * the weight. Three limits, in this order of importance: the hard deck and the top speed (VMO, or true Mach 0.67 above about 17,570 ft, energyTopKias)
 * (the lift a level-off needs comes first, and the chase gets what is left);
 * core's availableG (the stall line, +7 G, and +4.7 G while rolling); and the
 * shaker. A chaser does not sink through the deck or fly past the top speed to catch
 * the other. The deck guard looks ahead: the height the path would bottom out at
 * is the pull-out circle plus the height lost rolling the lift up to the horizon
 * first (a chaser in a steep or inverted bank, after a close overshoot, loses
 * most of its drop there), and when that is under the deck the lift goes to the
 * vertical until it is not. At the deck the chase is a level turn, which is what
 * the level MPT flies. The tests hold it within 20 ft of the deck, not exactly on it.
 */
function controlPursuit(ctx) {
  const { ac, other, p, f, kias } = ctx;
  const c = ac.ctl;
  const vHat = unit(velOf(ac.pm));
  const vFtps = f.ktas * KT_TO_FTPS;
  const toAim = sub(aimPoint(p, other), posOf(ac.pm));
  const distance = len(toAim);
  const weightPerp = sub({ x: 0, y: 0, z: 1 }, scale(vHat, vHat.z)); // the weight's part square to the path
  // The lift (in G) that carries the weight and turns at the rate the pointing error asks for.
  let wanted = weightPerp;
  if (distance > 1e-6) {
    const u = scale(toAim, 1 / distance);
    const error = Math.acos(clamp(dot(u, vHat), -1, 1));
    const toward = sub(u, scale(vHat, dot(u, vHat)));
    const m = len(toward);
    if (m > 1e-9) wanted = add(weightPerp, scale(toward, (vFtps * TUNING.chaseGainPerSec * error / G_FTPS2) / m));
  }
  // Axes for the limits: e is up in the vertical plane of the path, s is sideways, both square to the path.
  const cosGamma = Math.sqrt(Math.max(0, 1 - vHat.z * vHat.z));
  const e = cosGamma > 0.02 ? unit(weightPerp) : ac.pm.up;
  const s = cross(vHat, e);
  let alphaWanted = dot(wanted, e), betaWanted = dot(wanted, s);

  // Energy retention governor (Phase 1C): prevent zoom-climb stalls down to 68 KIAS while permitting D405 zoom climbs
  if (kias < 140 && f.climbRad > 0) {
    const bleedRatio = clamp((kias - p.stallKias) / (140 - p.stallKias), 0, 1);
    alphaWanted = Math.min(alphaWanted, Math.cos(f.climbRad) * bleedRatio - Math.sin(f.climbRad) * (1 - bleedRatio));
  }

  const capFor = (rolling) => {
    let cap = Math.min(ctx.shaker, availableG(kias, rolling, p.stallKias));
    if (kias < 140 && f.climbRad > 0) {
      const bleedRatio = clamp((kias - p.stallKias) / (140 - p.stallKias), 0, 1);
      cap = Math.min(cap, 1.0 + 1.0 * bleedRatio);
    }
    return cap;
  };

  // The flight path angle the deck and the speed limit ask for: the deck from the height the pull-out would bottom at, the limit (VMO, or true Mach 0.67 above about 17,570 ft, energyTopKias) from the speed a few seconds on.
  const gamma = f.climbRad;
  const pullOutG = Math.max(capFor(true) - 1, 0.5);
  // The drop is the height lost while rolling the lift up to the horizon first (a chaser in a steep or inverted bank
  // must roll before it can pull out, and its nose keeps falling at the rate its lift gives now), then the pull-out circle.
  const rollOutSec = Math.abs(ac.bankDeg) / p.rollRateDegPerSec;
  const gammaRate = (ac.g * Math.cos(degToRad(ac.bankDeg)) - Math.cos(gamma)) * G_FTPS2 / vFtps; // the path's rate in the vertical plane now (rad/s)
  const gammaAfterRoll = gamma + Math.min(gammaRate, 0) * rollOutSec;
  const rollLossFt = vFtps * rollOutSec * Math.max(0, -Math.sin((gamma + gammaAfterRoll) / 2));
  const circleFt = gammaAfterRoll < 0 ? TUNING.deckPullOutFactor * (vFtps * vFtps / (G_FTPS2 * pullOutG)) * (1 - Math.cos(gammaAfterRoll)) : 0;
  const dropFt = rollLossFt + circleFt;
  const deckSin = clamp((p.hardDeckFt - (f.altFt - dropFt)) * TUNING.levelAltGainPerSec / vFtps, -0.95, 0.5);
  const guardKias = energyTopKias(f.altFt) - TUNING.vmoMarginKias; // the limit at this height, so it tightens as the chase climbs into the Mach limit and eases as it dives out of it
  const overKt = kias + c.kiasRateEff * TUNING.vmoLeadSec - guardKias;
  const vmoSin = overKt > 0 ? Math.min(overKt * TUNING.vmoClimbPerKt, 0.6) : -1; // -1: no demand while the speed is well under the limit
  const gammaFloor = Math.asin(Math.max(deckSin, vmoSin));
  const alphaFloor = Math.cos(gamma) + (vFtps / G_FTPS2) * TUNING.levelOmegaPerSec * (gammaFloor - gamma);

  const build = (cap) => {
    let alpha = alphaWanted, beta = betaWanted;
    const mag = Math.hypot(alpha, beta);
    if (mag > cap) { alpha *= cap / mag; beta *= cap / mag; }
    const guarded = alphaFloor > alpha;
    if (guarded) {
      alpha = Math.min(alphaFloor, cap);
      beta = Math.sign(betaWanted) * Math.min(Math.abs(betaWanted), Math.sqrt(Math.max(0, cap * cap - alpha * alpha)));
    }
    const lift = add(scale(e, alpha), scale(s, beta));
    const g = len(lift);
    const rightC = cross(vHat, ac.pm.up);
    const bankRad = g > 1e-9 ? Math.atan2(dot(lift, rightC) / g, dot(lift, ac.pm.up) / g) : ac.bankRad;
    return { g, bankRad, prefer: bankRad >= 0 ? 1 : -1, throttle: 1, cap, guarded };
  };
  let cmd = build(capFor(false));
  if (willRoll(ctx, cmd.bankRad, cmd.prefer)) cmd = build(capFor(true));
  c.chaseLimited = cmd.guarded || len(wanted) > cmd.cap + 1e-9;
  return cmd;
}

// ── One aircraft, one step ───────────────────────────────────────────────────

/** Moves a bank toward a target at most `maxDelta` (rad) this step; `prefer` picks the way round when it is 180° off. */
function rollToward(bank, target, maxDelta, prefer) {
  let delta = wrapPi(target - bank);
  if (Math.abs(delta) > Math.PI - 1e-3) delta = prefer * Math.PI;
  const moved = Math.abs(delta) <= maxDelta ? delta : Math.sign(delta) * maxDelta;
  return { bank: wrapPi(bank + moved), movedRad: Math.abs(moved) };
}

/** The one definition of rolling: the bank changed this step faster than ROLLING_DEG_PER_SEC. */
const isRolling = (movedRad, d) => radToDeg(movedRad) / d > ROLLING_DEG_PER_SEC;

/** Whether the aircraft will be rolling this step if it is commanded to this bank (the same roll step the aircraft then flies). */
function willRoll(ctx, bankRad, prefer) {
  const { ac, p, d } = ctx;
  return isRolling(rollToward(ac.bankRad, bankRad, degToRad(p.rollRateDegPerSec) * d, prefer).movedRad, d);
}

/** The controller for the aircraft's current mode, returning { g, bankRad, prefer, throttle }. */
function controlFor(ctx) {
  switch (ctx.ac.ctl.mode) {
    case 'pitchBack': case 'slice': return controlBankMove(ctx);
    case 'immelmann': return controlImmelmann(ctx);
    case 'splitS': return controlSplitS(ctx);
    case 'mpt': case 'levelMpt': return controlMpt(ctx);
    case 'pursuit': return controlPursuit(ctx);
    default: return { g: 1, bankRad: 0, prefer: 1, throttle: 1 };
  }
}

/** A G to one decimal, or as many as it takes to tell it from `other` ("5.50 G against 5.49 G", never "5.5 G against 5.5 G"). */
function gText(g, other) {
  return g.toFixed(g.toFixed(1) === other.toFixed(1) ? 2 : 1);
}

/** "85.6 KIAS is below the 86 KIAS stall speed": one decimal, so a speed just under the stall speed does not read as equal to it. */
const belowStallText = (kias, p) => `${kias.toFixed(1)} KIAS is below the ${+p.stallKias.toFixed(1)} KIAS stall speed`;

const BANK_MOVE_MODES = Object.freeze(['pitchBack', 'slice', 'immelmann', 'splitS']);

function stepAircraft(state, ac, other, d) {
  const p = state.setup;
  const c = ac.ctl;
  const f = pointMassFlight(ac.pm);
  const kias = tasToIasKt(f.ktas, f.altFt);

  // The speed's rate, smoothed a little so a single step does not drive the trim.
  const rate = (kias - c.prevKias) / d;
  c.kiasRateEff = 0.8 * c.kiasRateEff + 0.2 * rate;
  c.prevKias = kias;
  c.t += d;
  if (c.lockoutTimer > 0 && c.mode !== 'mpt' && c.mode !== 'levelMpt') {
    c.lockoutTimer = Math.max(0, c.lockoutTimer - d);
  }

  // A move that has ended hands to the next one.
  if (c.next) {
    const next = c.next; c.next = null;
    if (next === 'mpt') {
      if (ac.move === 'immelmann' || ac.move === 'splitS') {
        ac.move = 'mpt';
        ac.moveLabel = MOVE_LABELS.mpt;
      }
      handToMpt(ac);
    } else {
      const pick = autoPick(state, ac, other, kias);
      startMove(state, ac, pick.move, pick.why, kias);
    }
  } else if (c.t > TUNING.moveMaxSec && BANK_MOVE_MODES.includes(c.mode)) {
    c.next = 'pick';
  }

  const ctx = { state, ac, other, p, f, kias, d, shaker: shakerG(kias, p) };
  const cmd = controlFor(ctx);

  // A forced G is pulled as it is, past the stall line if need be.
  // In normal flight, the model pilot rides the stick shaker to stay out of high-speed / accelerated stall.
  let gWanted = cmd.g;
  if (c.forceG !== null && c.mode !== 'pursuit') {
    gWanted = c.forceG;
  } else {
    gWanted = Math.min(gWanted, ctx.shaker);
  }

  // Stall: the pull needs more than the stall line, or the speed is under the stall speed.
  // STALL starts when that becomes true and lasts stallSec, and for as long as the speed is under the
  // stall speed. The jet flies no more than 1 G, or the stall line if that is lower, while it is on,
  // and afterwards goes back to the shaker.
  const stallLine = stallLimitG(kias, p.stallKias);
  const slow = kias < p.stallKias;
  let stallReason = '';
  if (gWanted > stallLine + 1e-9) {
    // Two decimals at most (verification N5: "5.5000 G; 5.4995 G" is too heavy for a screen line); closer than that reads "just over".
    stallReason = gWanted.toFixed(2) === stallLine.toFixed(2)
      ? `The pull needs just over the ${stallLine.toFixed(2)} G the stall line gives at ${round(kias)} KIAS`
      : `The pull needs ${gText(gWanted, stallLine)} G; the stall line at ${round(kias)} KIAS gives ${gText(stallLine, gWanted)} G`;
  }
  else if (slow) stallReason = belowStallText(kias, p);
  let stallStarts = false;
  if (stallReason && !c.stallCond && c.stallTimer <= 1e-9) {
    stallStarts = true;
    c.stallTimer = p.stallSec;
    c.forceG = null; // the pilot eases back to the shaker afterwards
    ac.stallEver = true; ac.stallReason = stallReason;
  }
  c.stallCond = !!stallReason;
  const timed = c.stallTimer > 1e-9;
  ac.stall = timed || slow;
  let g;
  if (ac.stall) {
    if (timed) c.stallTimer -= d;
    else ac.stallReason = stallReason;
    g = Math.min(1, stallLine);
  } else {
    ac.stallReason = '';
    g = c.forceG === null ? Math.min(gWanted, ctx.shaker) : gWanted;
  }

  // Bank changes at the roll rate, never instantly. When stalled, aerodynamic roll authority is reduced (~30%), allowing wings-level recovery.
  const rollRate = ac.stall ? 0.3 * p.rollRateDegPerSec : p.rollRateDegPerSec;
  const maxRollDelta = degToRad(rollRate) * d;
  const roll = rollToward(ac.bankRad, cmd.bankRad, maxRollDelta, cmd.prefer);
  ac.bankRad = roll.bank;
  ac.rollDegPerSec = radToDeg(roll.movedRad) / d;
  ac.rolling = isRolling(roll.movedRad, d);

  // OVER G: above +7 G, or above +4.7 G while rolling. The jet still flies the G it pulled. On the step a pull stalls the jet the
  // G it pulled is judged, not the 1 G STALL then gives, so a pull past both lines shows both flags (verification F6).
  const gPulled = stallStarts ? Math.max(g, gWanted) : g;
  ac.overG = false; ac.overGReason = '';
  if (gPulled > T6A_LIMITS.maxG + 1e-9) {
    ac.overG = true; ac.overGReason = `${gPulled.toFixed(1)} G is above +${T6A_LIMITS.maxG} G`;
  } else if (ac.rolling && gPulled > T6A_LIMITS.rollingMaxG + 1e-9) {
    ac.overG = true; ac.overGReason = `${gPulled.toFixed(1)} G while rolling is above +${T6A_LIMITS.rollingMaxG} G`;
  }
  if (ac.overG) ac.overGEver = true;

  ac.onShaker = g >= ctx.shaker - 1e-6 && !ac.stall;
  ac.chaseLimited = c.mode === 'pursuit' && !!c.chaseLimited;
  flyStep(ac, g, cmd.throttle, d);
  const before = f.headingRad;
  const after = pointMassFlight(ac.pm).headingRad;
  ac.ctl.turnDeg += Math.abs(radToDeg(wrapPi(after - before)));
  readOut(ac, g, cmd.throttle, p, ctx.shaker, !state.dry);
  // The readout shows STALL for the speed it shows: still on under the stall speed, on as it falls through it.
  ac.stall = timed || ac.kias < p.stallKias;
  if (!ac.stall) ac.stallReason = '';
  else if (!ac.stallReason) ac.stallReason = belowStallText(ac.kias, p);
  if (!ac.mptReached) {
    ac.toMptSec += d; ac.toMptDeg += Math.abs(radToDeg(wrapPi(after - before)));
    const atMpt = ac.move === 'levelMpt' || (ac.move === 'mpt' && Math.abs(ac.kias - p.mptKias) <= MPT_WITHIN_KT);
    if (atMpt) {
      ac.mptReached = true;
      if (ac.move === 'mpt') ac.why = `MPT ${round(p.mptKias)} KIAS`;
    }
  }
}

/** One point-mass step, with the speed kept above zero so the flight path always has a direction (point-mass.js needs it). */
function flyStep(ac, g, throttle, d) {
  const bankRad = ac.bankRad;
  let next = stepPointMass(ac.pm, { g, bankRad }, d, excessFnFor(throttle));
  const speed = Math.hypot(next.vx, next.vy, next.vz);
  const floor = TUNING.minKtas * KT_TO_FTPS;
  if (!(speed >= floor)) {
    const old = unit(velOf(ac.pm));
    const dir = speed > 1e-9 ? scale({ x: next.vx, y: next.vy, z: next.vz }, 1 / speed) : old;
    next = { ...next, vx: dir.x * floor, vy: dir.y * floor, vz: dir.z * floor };
  }
  ac.pm = next;
}

// ── The fight ───────────────────────────────────────────────────────────────

/**
 * Starts the turns: directions are set and each aircraft takes its first move
 * from the merge speed. `override` ({ who, move }) puts one aircraft in a given
 * move instead, for the look-ahead's dry runs.
 */
function startTurns(state, override = null) {
  chooseTurnDirections(state);
  for (const ac of [state.blue, state.red]) {
    const pick = override && override.who === ac.who
      ? { move: override.move, why: '' }
      : state.plan[ac.who] ?? chooseFirstMove(state, ac, ac === state.blue ? state.red : state.blue);
    startMove(state, ac, pick.move, pick.why, ac.mergeKias);
    ac.ctl.prevKias = ac.kias;
    ac.ctl.kiasRateEff = 0;
  }
  state.merged = true;
  state.mergeSec = state.timeSec;
}

/** Horizontal azimuth off-nose angle (degrees, 0-180). */
function noseOffAzDeg(from, to) {
  const dx = to.xFt - from.xFt, dy = to.yFt - from.yFt;
  return radToDeg(Math.abs(wrapPi(Math.atan2(dy, dx) - from.headingRad)));
}

/**
 * Whether this aircraft's nose tracks the other (D386):
 * 1. 3D off-nose vector angle <= FIRST_NOSE_DEG (5.0°), OR
 * 2. Across altitude differences, azimuth <= 5.0° AND elevation <= 10.0°.
 */
function isAcNoseOn(state, ac, target) {
  if (ac.stall) return false;
  if (noseOffDeg(state, ac) <= FIRST_NOSE_DEG) return true;
  const dx = target.xFt - ac.xFt, dy = target.yFt - ac.yFt, dz = target.zFt - ac.zFt;
  const dH = Math.hypot(dx, dy);
  if (dH === 0) return false;
  const deltaAz = Math.abs(wrapPi(Math.atan2(dy, dx) - ac.headingRad)) * 180 / Math.PI;
  const thetaLos = Math.atan2(dz, dH) * 180 / Math.PI;
  const deltaEl = Math.abs(ac.climbDeg - thetaLos);
  return deltaAz <= FIRST_NOSE_DEG && deltaEl <= 10.0;
}

/**
 * The one nose-on rule: `ac`'s nose tracks `target` (3D or azimuth across altitude difference, D386)
 * and the target's aspect angle is PURSUIT_MAX_AA_DEG or less, so the chase starts from
 * behind; or `chaseAfterHeadOn` is set, and any nose-on counts. The fight's chase
 * and the look-ahead's score both use it, so they cannot disagree.
 */
function onTheOther(state, ac, target) {
  if (ac.stall || !isAcNoseOn(state, ac, target)) return false;
  return state.setup.chaseAfterHeadOn || 180 - noseOffDeg(state, target) <= PURSUIT_MAX_AA_DEG;
}

/** How far this aircraft's nose is off the other, from the pair's readout (readPair, worked out every step). */
const noseOffDeg = (state, ac) => (ac.who === 'blue' ? state.ataBlueDeg : state.ataRedDeg);

/**
 * The first nose-on is marked once (the first aircraft whose nose is within 5° of
 * the other; both in one step reads "both", Q48), head-on or not. The chase is
 * separate: every step until both are pursuing, each aircraft whose nose is on the
 * other (onTheOther) starts a pursuit for the rest of the fight. So a head-on
 * first nose-on, which starts no pursuit, does not block a pursuit from behind
 * later. With `chaseAfterHeadOn` the head-on nose-on starts it too.
 */
/**
 * 3D Austin/Carbone tactical advantage score (0.0 to 1.0) using ATA, AA, range, and specific energy height.
 * (Phase 2A)
 * - ATA: 0° = nose-on (1.0)
 * - AA: 0° = on bandit's six (1.0)
 * - Range: gun engagement envelope up to 9,000 ft
 * - Energy: specific energy height differential
 */
export function tacticalAdvantage(ac, target) {
  const ata = noseAngleDeg(ac, target);
  const aa = 180 - noseAngleDeg(target, ac);
  const rangeFt = len(sub(posOf(target.pm), posOf(ac.pm)));
  const GUN_RANGE = 3000;

  const ataScore = clamp(1 - ata / 180, 0, 1);
  const aaScore = clamp(1 - aa / 180, 0, 1);
  const rangeScore = clamp(1 - rangeFt / (GUN_RANGE * 3), 0, 1);

  const altAc = ac.altFt ?? ac.pm.z;
  const ktasAc = ac.ktas ?? (len(velOf(ac.pm)) / KT_TO_FTPS);
  const eAc = ac.energyHeightFt ?? energyHeightFt(altAc, ktasAc);

  const altTarget = target.altFt ?? target.pm.z;
  const ktasTarget = target.ktas ?? (len(velOf(target.pm)) / KT_TO_FTPS);
  const eTarget = target.energyHeightFt ?? energyHeightFt(altTarget, ktasTarget);

  const energyScore = clamp(0.5 + (eAc - eTarget) / 6000, 0, 1);

  return 0.35 * ataScore + 0.35 * aaScore + 0.20 * rangeScore + 0.10 * energyScore;
}

/**
 * Post-merge tactical pursuit breakout gate (Phase 2C):
 * Decisive tactical advantage triggers pursuit entry even without 5° boresight lock.
 */
function shouldPursueTactical(state, ac, target) {
  if (state.setup.pursuit === 'none') return false;
  if (ac.ctl.mode === 'pursuit' || ac.stall) return false;
  if (!state.merged || state.timeSec <= (state.mergeSec ?? 0) + 1.0) return false;
  if (!state.setup.chaseAfterHeadOn && 180 - noseOffDeg(state, target) > PURSUIT_MAX_AA_DEG) return false;
  const f = pointMassFlight(ac.pm);
  if (ac.kias < 140 && f.climbRad > 0) return false;
  const ata = noseAngleDeg(ac, target);
  const adv = tacticalAdvantage(ac, target);
  const advTarget = tacticalAdvantage(target, ac);
  return adv > 0.52 && (adv - advTarget) >= 0.05 && ata < 45;
}

function checkFirstNose(state) {
  if (!state.merged) return;
  const blueOn = isAcNoseOn(state, state.blue, state.red);
  const redOn = isAcNoseOn(state, state.red, state.blue);
  if (!state.firstNose && (blueOn || redOn)) {
    const by = blueOn && redOn ? 'both' : blueOn ? 'blue' : 'red';
    const from = by === 'red' ? state.red : state.blue;
    const to = by === 'red' ? state.blue : state.red;
    state.firstNose = { by, timeSec: state.timeSec, from: { xFt: from.xFt, yFt: from.yFt }, to: { xFt: to.xFt, yFt: to.yFt } };
  }
  if (state.setup.pursuit === 'none') return;
  const chasers = [];
  for (const [ac, target] of [[state.blue, state.red], [state.red, state.blue]]) {
    if (ac.ctl.mode !== 'pursuit' && !ac.stall && (onTheOther(state, ac, target) || shouldPursueTactical(state, ac, target))) {
      chasers.push({ ac, aspectDeg: 180 - noseOffDeg(state, target) });
    }
  }
  // Across altitude separation (D404): visual azimuth acquisition engages both fighters from level MPT into 3D combat pursuit
  if (!chasers.length && Math.abs(state.blue.altFt - state.red.altFt) >= 100 && state.timeSec > (state.mergeSec ?? 0) + 1.0) {
    if (state.blue.ctl.mode === 'mpt' && state.red.ctl.mode === 'mpt') {
      const azBlue = noseOffAzDeg(state.blue, state.red), azRed = noseOffAzDeg(state.red, state.blue);
      if (azBlue <= FIRST_NOSE_DEG || azRed <= FIRST_NOSE_DEG) {
        startPursuit(state, state.blue);
        startPursuit(state, state.red);
      }
    }
  }

  if (chasers.length) {
    for (const { ac } of chasers) startPursuit(state, ac);
    if (!state.chase) {
      state.chase = { by: chasers.length === 2 ? 'both' : chasers[0].ac.who, timeSec: state.timeSec, aaDeg: chasers[0].aspectDeg };
    }
  }
  if (!state.chase) {
    for (const [ac, target] of [[state.blue, state.red], [state.red, state.blue]]) {
      if (!ac.stall && (onTheOther(state, ac, target) || shouldPursueTactical(state, ac, target))) {
        state.chase = { by: ac.who, timeSec: state.timeSec, aaDeg: 180 - noseOffDeg(state, target) };
        break;
      }
    }
  }
}

/** The aim points the screen can draw: where each chaser is pointing the nose for the next step. */
function readAims(state) {
  for (const [ac, target] of [[state.blue, state.red], [state.red, state.blue]]) {
    if (ac.ctl.mode !== 'pursuit') { ac.aim = null; continue; }
    const aim = aimPoint(state.setup, target);
    ac.aim = { xFt: aim.x, yFt: aim.y, zFt: aim.z };
  }
}

/** Before the turns nothing is pulled, but a jet under the stall speed is stalled: STALL reads from T+0 (verification F3). Read once when the aircraft is made; the straight flight keeps the speed, so it keeps the flag. */
function readSlow(ac, p) {
  ac.stall = ac.kias < p.stallKias;
  if (ac.stall) { ac.stallEver = true; ac.stallReason = belowStallText(ac.kias, p); } else ac.stallReason = '';
}

/** Before the turns: both fly straight and level at constant speed. */
function flyStraight(state, d) {
  for (const ac of [state.blue, state.red]) {
    const pm = ac.pm;
    ac.pm = { ...pm, x: pm.x + pm.vx * d, y: pm.y + pm.vy * d, z: pm.z + pm.vz * d };
    readOut(ac, 1, 1, state.setup, null, !state.dry);
  }
}

/** Seconds from now to the closest approach on the present courses; 0 or less when the range is not closing. */
function secondsToPass(state) {
  const r = sub(posOf(state.red.pm), posOf(state.blue.pm));
  const v = sub(velOf(state.red.pm), velOf(state.blue.pm));
  const vv = dot(v, v);
  if (vv < 1e-12) return 0;
  return -dot(r, v) / vv;
}

function stepOnce(state) {
  let remaining = FIGHT_STEP_SEC;
  if (!state.merged) {
    const tca = state.setup.turnsStart === 'now' ? 0 : secondsToPass(state);
    if (tca > remaining) {
      flyStraight(state, remaining);
      state.timeSec += remaining;
      readPair(state);
      return;
    }
    // The pass falls in this step: fly to it, then the rest of the step is the first step of the turns.
    const toPass = Math.max(0, tca);
    if (toPass > 0) flyStraight(state, toPass);
    state.timeSec += toPass;
    remaining -= toPass;
    startTurns(state);
  }
  if (remaining > 1e-9) {
    const blue = state.blue, red = state.red;
    // Both read each other's state from before the step.
    const blueOther = { pm: red.pm }, redOther = { pm: blue.pm };
    stepAircraft(state, blue, blueOther, remaining);
    stepAircraft(state, red, redOther, remaining);
    state.timeSec += remaining;
  }
  readPair(state);
  checkFirstNose(state);
  // An even fight: both noses came on together and nobody has got behind the other (the result card says so, verification F4).
  state.evenFight = state.firstNose?.by === 'both' && !state.chase;
  readAims(state);
}

/**
 * Moves the fight forward by `dtSec` seconds of fight time, in whole steps of
 * FIGHT_STEP_SEC (the remainder is kept in `state.carrySec`, as sim.js does). At
 * FIGHT_MAX_SEC the fight stops. Changes `state` in place and returns it. A
 * zero, negative or non-finite `dtSec` moves nothing.
 */
export function stepEnergyFight(state, dtSec) {
  if (state.stopped || !(dtSec > 0) || !Number.isFinite(dtSec)) return state;
  state.carrySec += dtSec;
  const steps = Math.floor(state.carrySec / FIGHT_STEP_SEC + 1e-9);
  state.carrySec = Math.max(0, state.carrySec - steps * FIGHT_STEP_SEC);
  for (let i = 0; i < steps; i++) {
    stepOnce(state);
    if (state.timeSec >= FIGHT_MAX_SEC - 1e-6) {
      state.stopped = true;
      state.carrySec = 0;
      break;
    }
  }
  return state;
}
