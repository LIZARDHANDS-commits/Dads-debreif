// The Energy fight's setup: the defaults (every box on the screen), the numbers the spec fixes, the
// model pilot's tuning numbers, the move names, the shaker the model keeps under, and the check that turns a
// bad setup into a plain-words refusal. Nothing here flies.
import { T6A_LIMITS, stallLimitG, maxKiasT6A, modelMaxIasT6A } from '../../../core/t6-performance.js';

/** The moves a setup can force; 'auto' lets the model choose (step 1). */
export const ENERGY_MOVES = Object.freeze(['tactical', 'auto', 'immelmann', 'pitchBack', 'slice', 'splitS', 'mpt']);
/** The pursuits a screen offers. A setup also accepts 'none' (nobody chases), for tests and what-ifs; it is not one of the choices. */
export const PURSUITS = Object.freeze(['tactical', 'pure', 'lead', 'lag']);
export const COLLISION_HITBOX_FT = 35.0; // CT-156 wingspan 33.4 ft, length 33.3 ft
export const TCPA_GATE_MIN_SEC = 0.5;
export const TCPA_GATE_MAX_SEC = 1.5;
export const TCPA_MISS_GATE_FT = 75.0;
export const DECONFLICTION_OFFSET_FT = 85.0; // 85 ft out-of-plane clearance
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
export const PURSUITS_ACCEPTED = Object.freeze([...PURSUITS, 'none']);


/**
 * The one G the model pilot asks for while he sets a move up (pullG's default): standardized at 5.0 G
 * across dynamic vertical maneuvers per D406 and SMM Ch 14, up to the stick shaker boundary (ctx.shaker).
 */
export const MANEUVER_PULL_G = 5;


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
  collisionDetection: true,
  collisionAvoidance: true,
  // Model settings for checking.
  stallKias: T6A_LIMITS.stallKias,
  shakerFrac: 0.94,
  stallSec: 1,
  midThrottle: 0.5,
  leadSec: 1,
  lagSec: 1,
  rollRateDegPerSec: 90,
  // Smooth pilot inputs (TF-57 PR 2), Patrick's "brisk" (4 Oct 10:38Z). Both are estimates until a manual or Patrick's practice
  // gives a number; 0 turns that one off (G or roll then changes in one step, as before).
  gOnsetGPerSec: 6,            // how fast the pilot's G builds or eases, G per second
  rollAccelDegPerSec2: 360,    // how fast the roll rate builds and dies away: 90°/s reached in 0.25 s
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
export const MPT_WITHIN_KT = 5;          // SMM 14.14: the MPT is 160 KIAS, held within 5 kt
// The spec says the model starts the constant-speed MPT at 72.5°, the middle of its 60 to 85° band, and trims from
// there. It does not: there is no start value. The bank is whatever the speed-hold law (speedHoldBankDeg) asks for,
// held to this band, and steady at 160 KIAS it settles at 72 to 73° (the SMM's 70 to 75°, SMM 14.14).
export const MPT_BANK_MIN_DEG = 60;      // spec: the constant-speed MPT trims its bank within 60 to 85°
export const MPT_BANK_MAX_DEG = 85;
export const SLICE_BANK_AT_MPT_DEG = 90; // SMM 14.18: the slice bank is 90° at the MPT speed ...
export const SLICE_BANK_AT_100_DEG = 135; // ... and 135° at 100 KIAS
export const IMMELMANN_BAND_KIAS = Object.freeze([200, 250]);   // SMM 14.15: the Immelmann is flown from 200 to 250 KIAS
/** The MPT speed box: 125 to 175 KIAS. Below 125 the MPT's 60 degree bank floor (2 G) meets the shaker and flies 125 anyway (verification N2 of #227). Above that, at the deck, the level MPT sinks under it (verification F8: 180 gave 5,937 ft, 200 gave 5,495 ft from 7,000 ft; 175 stays within 20 ft); the SMM's speed is 160 and the level MPT's about 150 minus thousands of feet. */
export const MPT_KIAS_RANGE = Object.freeze([125, 175]);
export const PITCH_BACK_BAND_KIAS = Object.freeze([160, 220]);   // SMM 14.15: and the pitch back from 160 to 220 KIAS
export const SLICE_ENTRY_LOW_KIAS = 100; // SMM 14.18: the slice is flown from 100 to 160 KIAS (Auto hands to a split S below the split point)
// The split S is core's (splitST6A; the technique is SMM 14.16 para 41): nose to about 20° up in the shaker, roll inverted
// at 0.5 G, pull through in the shaker up to 5 G. The 5 G is Patrick's word (2026-09-30 09:27Z); the SMM gives the technique,
// and its Table 14.1 says about 4 G. The numbers come from T6A_MANOEUVRE; this file flies the same law.
/** One definition of "rolling": a bank change faster than this (deg/s) is a roll. The roll itself is 90°/s; the MPT's trim is a few deg/s. It drives OVER G's 4.7 G limit, the MPT's 4 G while rolling, and the chaser's cap. Model setting. */
export const ROLLING_DEG_PER_SEC = 15;
/** A pursuit starts from behind (aspect <= 150°), or across a head-on re-pass with `chaseAfterHeadOn` (default true per Patrick's ratification, D403). Model setting. */
export const PURSUIT_MAX_AA_DEG = 150;
export const FORCE_G_MAX = 12;           // a what-if G of 0 to 12 (core's +7 G limit, and some way past it)

/**
 * How the model pilot flies, which no manual gives: how early a pitch back or
 * slice hands to the MPT, how fast the MPT closes on its speed, the gains that
 * level a jet off or chase, and the handover rules that end a move. They are
 * guesses tuned so every merge speed reaches 160 ± 5 KIAS and holds it. Dad sees
 * the result when he flies each move; none is a box on the screen.
 */
export const TUNING = Object.freeze({
  captureLeadSec: 3,       // model setting: a bank move hands to the MPT when its speed, this many seconds ahead, would reach the MPT speed
  captureLeadFastSec: 4.0, // model setting: the lead for a pitch back or slice entered at VMO (316 KIAS). It grows from captureLeadSec (entered at captureLeadFromKias) to this at VMO. The old flat 6 s over 220 KIAS took 303 to 391° to reach the MPT (aim: under 180°, SMM 14.17 para 42); 3 s alone loses the band above about 280 KIAS; this ramp meets both from 221 to 316 KIAS at 8,000 to 15,000 ft. Was 3.7 s; 4.0 s since roll builds smoothly (TF-57 PR 2): the slower roll-in let a 312 KIAS pitch back climb past 75° before the hand-over, and 4.0 s hands over in 190 to 279° of turn (estimate, model setting)
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
  lowYoYo: 'Low Yo-Yo', highYoYo: 'High Yo-Yo',
  mpt: 'MPT', levelMpt: 'Level MPT', pursuit: 'Pursuit',
  tumble: 'Collision Tumble',
});

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

// ── Words the readouts share ─────────────────────────────────────────────────

export const round = (x) => Math.round(x);
export const feet = (x) => Math.round(x).toLocaleString('en-US');

/** "85.6 KIAS is below the 86 KIAS stall speed": one decimal, so a speed just under the stall speed does not read as equal to it. */
export const belowStallText = (kias, p) => `${kias.toFixed(1)} KIAS is below the ${+p.stallKias.toFixed(1)} KIAS stall speed`;

// ── The setup ────────────────────────────────────────────────────────────────

export function need(ok, what, value) {
  if (!ok) throw new RangeError(`Turn Fight energy setup: ${what}, got ${value}`);
}
const finitePositive = (x) => Number.isFinite(x) && x > 0;

export function checkedSetup(setup) {
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
  for (const k of ['gOnsetGPerSec', 'rollAccelDegPerSec2']) need(Number.isFinite(s[k]) && s[k] >= 0, `${k} is 0 (off) or more`, s[k]);
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
