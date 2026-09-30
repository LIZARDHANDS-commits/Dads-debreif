// The Turn Fight's Energy mode engine (SPEC-turn-fight, "Energy mode (FF23, D112)").
// Every test here is one of the spec's checks. There is nothing in V6 to pin: the
// flying is checked against the SMM's words and the T-6A charts, through core's model.
// energy-sim.js draws nothing, so these read the plain state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FT_PER_NM } from '../../../src/core/units.js';
import { wrapPi, radToDeg, degToRad } from '../../../src/core/angles.js';
import { T6A_LIMITS, stallLimitG, availableG, splitST6A } from '../../../src/core/t6-performance.js';
import { FIGHT_STEP_SEC, FIGHT_MAX_SEC } from '../../../src/modules/turn-fight/sim.js';
import { nfmTopKias, CHART_READ_KIAS } from './nfm-limit.js';
import {
  ENERGY_DEFAULT_SETUP, ENERGY_ACCURATE_MAX_FT, ENERGY_MAX_START_FT, PURSUITS, createEnergyFight, stepEnergyFight, pickMove, lookAheadPick,
} from '../../../src/modules/turn-fight/energy-sim.js';

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} ${actual} vs ${expected} (±${tol})`);
const degDiff = (aRad, bRad) => Math.abs(radToDeg(wrapPi(aRad - bRad)));

/** Nobody chases, so one aircraft's move is seen on its own. */
const SOLO = { pursuit: 'none' };

/** Steps the fight until done(state) or limitSec, one whole step at a time. */
function runUntil(setup, done, limitSec = 120) {
  const s = createEnergyFight(setup);
  for (let i = 0; i < limitSec / FIGHT_STEP_SEC && !done(s); i++) stepEnergyFight(s, FIGHT_STEP_SEC);
  return s;
}
/** Calls watch(state) after every step, up to limitSec. */
function watch(setup, watcher, limitSec = 120) {
  const s = createEnergyFight(setup);
  for (let i = 0; i < limitSec / FIGHT_STEP_SEC; i++) { stepEnergyFight(s, FIGHT_STEP_SEC); if (watcher(s) === false) break; }
  return s;
}
const numbersOf = (o, path = '') => Object.entries(o).flatMap(([k, v]) => (
  typeof v === 'number' ? [[path + k, v]] : v && typeof v === 'object' && !Array.isArray(v) ? numbersOf(v, `${path}${k}.`) : []));
const shaker = (kias) => Math.min(T6A_LIMITS.maxG, 0.94 * stallLimitG(kias));

// ── The setup and its defaults ───────────────────────────────────────────────

test('the defaults are the spec\'s: 10,000 ft and 220 KIAS each, Auto, MPT 160, deck 6,000, Pure, stall 86, shaker 94 %', () => {
  const d = ENERGY_DEFAULT_SETUP;
  assert.deepEqual([d.blueAltFt, d.redAltFt, d.blueKias, d.redKias], [10000, 10000, 220, 220]);
  assert.deepEqual([d.blueMove, d.redMove, d.mptKias, d.hardDeckFt, d.pursuit], ['auto', 'auto', 160, 6000, 'pure']);
  assert.deepEqual([d.stallKias, d.shakerFrac, d.stallSec, d.midThrottle, d.leadSec, d.lagSec, d.rollRateDegPerSec], [86, 0.94, 1, 0.5, 1, 1, 90]);
  assert.deepEqual([d.pitchBackBank160Deg, d.pitchBackBank220Deg, d.pullG], [60, 30, 4]);
  assert.deepEqual([d.circles, d.separationNm, d.ataDeg, d.aaDeg, d.turnsStart], [2, 2, 0, 180, 'pass']);
  assert.ok(Object.isFrozen(d));
  assert.deepEqual(createEnergyFight().setup, { ...d });
});

test('each aircraft starts between the hard deck and 25,000 ft, and the screen is told where the model is accurate (15,000 ft)', () => {
  assert.equal(ENERGY_MAX_START_FT, 25000);
  assert.equal(ENERGY_ACCURATE_MAX_FT, 15000);
  assert.throws(() => createEnergyFight({ blueAltFt: 5999 }), /blueAltFt is from the hard deck \(6,000 ft\) to 25,000 ft, got 5999/);
  assert.throws(() => createEnergyFight({ redAltFt: 25001 }), /redAltFt is from the hard deck \(6,000 ft\) to 25,000 ft/);
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 6000, redAltFt: 25000, separationNm: 4 }));
  // The deck is the floor, so a lower deck allows a lower start, and a higher one forbids the default 10,000 ft.
  assert.doesNotThrow(() => createEnergyFight({ blueAltFt: 3000, redAltFt: 3000, hardDeckFt: 2500 }));
  assert.throws(() => createEnergyFight({ hardDeckFt: 10001 }), /blueAltFt is from the hard deck \(10,001 ft\)/);
  assert.throws(() => createEnergyFight({ hardDeckFt: NaN }), /hardDeckFt/);
});

test('a setup that could never merge or fly is refused, and says which number', () => {
  assert.throws(() => createEnergyFight({ separationNm: 0 }), /separationNm/);
  assert.throws(() => createEnergyFight({ blueKias: NaN }), /blueKias/);
  assert.throws(() => createEnergyFight({ redAltFt: Infinity }), /redAltFt/);
  assert.throws(() => createEnergyFight({ circles: 3 }), /circles/);
  assert.throws(() => createEnergyFight({ blueMove: 'barrel roll' }), /blueMove/);
  assert.throws(() => createEnergyFight({ pursuit: 'sideways' }), /pursuit/);
  assert.throws(() => createEnergyFight({ separationNm: 1, redAltFt: 10000 + 2 * FT_PER_NM }), /range|separation/);
});

// ── The start and the pass ───────────────────────────────────────────────────

test('ATA 0 and AA 180 is the head-on start: Blue heading east, Red heading west, the range apart, each at its own altitude', () => {
  const s = createEnergyFight({ separationNm: 3, blueAltFt: 9000, redAltFt: 11000 });
  assert.equal(s.blue.altFt, 9000);
  assert.equal(s.red.altFt, 11000);
  near(s.blue.headingRad, 0, 1e-12);
  near(Math.abs(s.red.headingRad), Math.PI, 1e-12);
  near(s.blue.yFt, s.red.yFt, 1e-6);
  near(s.rangeFt, 3 * FT_PER_NM, 1e-6, 'slant range');
  assert.ok(s.blue.xFt < s.red.xFt);
});

test('the merge speed is the speed at the pass: 220 KIAS flown level, unchanged, until the turns start', () => {
  const s = createEnergyFight({ blueKias: 200, redKias: 250 });
  near(s.blue.kias, 200, 1e-6);
  near(s.red.kias, 250, 1e-6);
  for (let i = 0; i < 100; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
  assert.equal(s.merged, false);
  near(s.blue.kias, 200, 1e-6);
  near(s.red.kias, 250, 1e-6);
  near(s.blue.altFt, 10000, 1e-6);
  near(s.blue.g, 1, 1e-6);
  assert.ok(s.blue.ktas > 200 && s.blue.ktas < 260, 'TAS above IAS at 10,000 ft');
});

test('the aircraft meet in the centre, and the pass is the closest approach to within one step (head-on)', () => {
  const s = runUntil({ ...SOLO }, (st) => st.merged);
  assert.equal(s.merged, true);
  // The range is at its least when the turns start: check a second either side.
  const at = s.rangeFt;
  const before = createEnergyFight({ ...SOLO });
  while (before.timeSec < s.mergeSec - 1) stepEnergyFight(before, FIGHT_STEP_SEC);
  assert.ok(before.rangeFt > at + 100, 'still closing a second before');
  near(s.blue.xFt, 0, 40);
  near(s.red.xFt, 0, 40);
  // Closing at both TAS, from 2 NM: about 14 s at 220 KIAS at 10,000 ft.
  near(s.mergeSec, 2 * FT_PER_NM / ((s.blue.ktas + s.red.ktas) * 1.68781), 0.03);
});

test('ATA 0 and AA 90 puts Red crossing Blue\'s nose, heading crossing angle 90, and they pass at the closest point', () => {
  const s = createEnergyFight({ ataDeg: 0, aaDeg: 90, aaSide: 'left', ...SOLO });
  near(s.headingCrossDeg, 90, 1e-6);
  near(degDiff(s.red.headingRad, s.blue.headingRad), 90, 1e-6);
  near(s.aaDeg, 90, 1e-6);
  near(s.ataBlueDeg, 0, 1e-6);
  // Sample the range each step; the turns must start at its minimum, within one step.
  let minRange = Infinity, minAt = 0;
  const f = createEnergyFight({ ataDeg: 0, aaDeg: 90, aaSide: 'left', ...SOLO });
  while (!f.merged) {
    if (f.rangeFt < minRange) { minRange = f.rangeFt; minAt = f.timeSec; }
    stepEnergyFight(f, FIGHT_STEP_SEC);
  }
  near(f.mergeSec, minAt, 2 * FIGHT_STEP_SEC);
});

test('Red 90° off Blue\'s nose to the right, and Blue 180° off Red\'s tail: sides are placed as the SMM says', () => {
  const s = createEnergyFight({ ataDeg: 90, ataSide: 'right', aaDeg: 180, separationNm: 2 });
  // Red is on Blue's right (south, since Blue heads east and north is left), and heads at Blue.
  assert.ok(s.red.yFt < s.blue.yFt);
  near(s.ataBlueDeg, 90, 1e-6);
  near(s.aaDeg, 180, 1e-6);
  const left = createEnergyFight({ ataDeg: 90, ataSide: 'left', aaDeg: 180 });
  assert.ok(left.red.yFt > left.blue.yFt);
});

test('turns start at once when asked, and at once when the range is opening from the start', () => {
  const at = createEnergyFight({ turnsStart: 'now' });
  stepEnergyFight(at, FIGHT_STEP_SEC);
  assert.equal(at.merged, true);
  assert.equal(at.mergeSec, 0);
  // Red dead astern of Blue (ATA 180, AA 0 means Blue astern of Red: both heading east, Red ahead) and slower: opening.
  const opening = createEnergyFight({ ataDeg: 0, aaDeg: 0, blueKias: 200, redKias: 300 });
  stepEnergyFight(opening, FIGHT_STEP_SEC);
  assert.equal(opening.merged, true);
  near(opening.mergeSec, 0, 1e-9);
});

test('head-on, Blue turns left (counter-clockwise); Red also left in a 2-circle fight and right in a 1-circle fight (V6)', () => {
  const two = runUntil({ circles: 2, ...SOLO }, (s) => s.merged);
  assert.equal(two.blue.turnDir, 1);
  assert.equal(two.red.turnDir, 1);
  const one = runUntil({ circles: 1, ...SOLO }, (s) => s.merged);
  assert.equal(one.blue.turnDir, 1);
  assert.equal(one.red.turnDir, -1);
});

test('off the nose, each aircraft turns toward the other (2-circle) and Red away (1-circle)', () => {
  // Red 90° off Blue's nose, to the right; Red heads across Blue's nose, Blue on its right-hand side (aaSide right) -> both turn right.
  const two = createEnergyFight({ circles: 2, ataDeg: 45, ataSide: 'right', aaDeg: 135, aaSide: 'left', turnsStart: 'now' });
  stepEnergyFight(two, FIGHT_STEP_SEC);
  assert.equal(two.blue.turnDir, -1, 'Red is on Blue\'s right, so Blue turns right (clockwise)');
  const one = createEnergyFight({ circles: 1, ataDeg: 45, ataSide: 'right', aaDeg: 135, aaSide: 'left', turnsStart: 'now' });
  stepEnergyFight(one, FIGHT_STEP_SEC);
  assert.equal(one.blue.turnDir, -1);
  assert.equal(one.red.turnDir, -one.red.towardDir, 'Red turns the other way in a 1-circle fight');
  assert.equal(two.red.turnDir, two.red.towardDir, 'and toward Blue in a 2-circle fight');
});

test('whole 0.02 s steps, the remainder carried; it stops at 10 minutes; bad time moves nothing', () => {
  const a = createEnergyFight(SOLO), b = createEnergyFight(SOLO);
  for (let i = 0; i < 50; i++) stepEnergyFight(a, 0.02);
  for (let i = 0; i < 10; i++) stepEnergyFight(b, 0.1);
  near(a.timeSec, 1, 1e-9);
  near(b.timeSec, 1, 1e-9);
  near(a.blue.xFt, b.blue.xFt, 1e-6);
  const c = createEnergyFight(SOLO);
  for (const bad of [0, -1, NaN, Infinity]) stepEnergyFight(c, bad);
  assert.equal(c.timeSec, 0);
  stepEnergyFight(c, 0.01); assert.equal(c.timeSec, 0);
  stepEnergyFight(c, 0.01); near(c.timeSec, 0.02, 1e-12);
  const far = createEnergyFight({ ...SOLO, blueKias: 160, redKias: 160, blueAltFt: 20000, redAltFt: 20000 });
  for (let i = 0; i < 40; i++) stepEnergyFight(far, 20);
  assert.equal(far.stopped, true);
  near(far.timeSec, FIGHT_MAX_SEC, 1e-6);
});

// ── Step 1: Auto picks the move from the KIAS at the merge ───────────────────

test('Auto picks by KIAS at the merge: above 220 Immelmann; 160-220 pitch back; 120-160 slice; below 120 split S; within 5 of 160 MPT', () => {
  const pick = (kias, altFt = 10000) => pickMove(kias, altFt, ENERGY_DEFAULT_SETUP).move;
  assert.equal(pick(250), 'immelmann');
  assert.equal(pick(220.5), 'immelmann');
  assert.equal(pick(220), 'pitchBack');
  assert.equal(pick(180), 'pitchBack');
  assert.equal(pick(166), 'pitchBack');
  assert.equal(pick(165), 'mpt');
  assert.equal(pick(160), 'mpt');
  assert.equal(pick(155), 'mpt');
  assert.equal(pick(154), 'slice');
  assert.equal(pick(140), 'slice');
  assert.equal(pick(120), 'slice');
  assert.equal(pick(119), 'splitS');
  assert.equal(pick(100), 'splitS');
});

test('below 120 KIAS Auto flies a slice when a split S would go below the hard deck, by the height core\'s split S loses from its top', () => {
  const p = ENERGY_DEFAULT_SETUP;
  assert.equal(pickMove(100, 8500, p).move, 'splitS');
  assert.equal(pickMove(100, 7900, p).move, 'splitS');
  assert.equal(pickMove(100, 7800, p).move, 'slice');
  // The check is the entry height less the loss from the top (about 1,800 ft at 7,000 ft), and the reason gives both.
  assert.match(pickMove(100, 7000, p).why, /^Slice instead of a split S: 100 KIAS, a split S from 7,000 ft loses about 1,8\d\d ft from its top and would go below the 6,000 ft deck$/);
  assert.equal(pickMove(100, 7000, { ...p, hardDeckFt: 4000 }).move, 'splitS');
  assert.equal(pickMove(119, 7800, p).move, 'slice');
});

test('the reason reads like the spec\'s example: "Pitch back: 220 KIAS, SMM entry 160 to 220"', () => {
  assert.equal(pickMove(220, 10000, ENERGY_DEFAULT_SETUP).why, 'Pitch back: 220 KIAS, SMM entry 160 to 220');
  const s = createEnergyFight({ blueKias: 220 });
  assert.equal(s.blue.why, 'Pitch back: 220 KIAS, SMM entry 160 to 220');
  assert.equal(s.blue.move, 'pitchBack');
  assert.equal(s.blue.moveLabel, 'Pitch back');
  const f = createEnergyFight({ blueMove: 'splitS', blueKias: 220 });
  assert.equal(f.blue.move, 'splitS');
  assert.match(f.blue.why, /Split S.*you|Split S.*set|forced/i);
});

test('the move Auto flies from the merge is the one for the merge speed in the setup, edges included (100, 120, 140, 160, 180, 220, 250)', () => {
  const expected = { 100: 'splitS', 120: 'slice', 140: 'slice', 160: 'mpt', 180: 'pitchBack', 220: 'pitchBack', 250: 'immelmann' };
  for (const [kias, move] of Object.entries(expected)) {
    const s = runUntil({ ...SOLO, blueKias: Number(kias), redKias: Number(kias) }, (st) => st.merged);
    assert.equal(s.blue.move, move, `${kias} KIAS at the merge`);
    assert.equal(s.red.move, move, `${kias} KIAS at the merge`);
  }
});

test('each aircraft picks for itself from its own merge speed', () => {
  const s = createEnergyFight({ blueKias: 250, redKias: 100 });
  assert.equal(s.blue.move, 'immelmann');
  assert.equal(s.red.move, 'splitS');
});

// ── Above 220: the Immelmann or the pitch back, whichever gets the nose on sooner ──

const P = ENERGY_DEFAULT_SETUP;
const LOOK = { offNoseDeg: 170, topKias: 140, noseOnSec: { immelmann: 24, pitchBack: 31 } };

test('above 220 the quicker nose-on wins: an Immelmann 24 s against a pitch back 31 s, and the reason says so', () => {
  const r = pickMove(245, 10000, P, LOOK);
  assert.equal(r.move, 'immelmann');
  assert.equal(r.why, 'Immelmann: nose on in about 24 s vs 31 s for a pitch back');
  const b = pickMove(245, 10000, P, { ...LOOK, noseOnSec: { immelmann: 40, pitchBack: 31 } });
  assert.equal(b.move, 'pitchBack');
  assert.equal(b.why, 'Pitch back: nose on in about 31 s vs 40 s for an Immelmann, outside the SMM band (160 to 220 KIAS)');
  // The look-ahead is what decides, not the geometry: the other dead ahead, and the Immelmann still wins if it is quicker.
  assert.equal(pickMove(245, 10000, P, { ...LOOK, offNoseDeg: 10 }).move, 'immelmann');
  // A tie goes to the simpler move when both or neither SMM band holds the speed (the band rule has its own test below).
  assert.equal(pickMove(210, 10000, P, { ...LOOK, noseOnSec: { immelmann: 30, pitchBack: 30 } }).move, 'pitchBack');
});

test('when only one of them gets the nose on in the look-ahead, that one wins, and the reason says the other did not', () => {
  const imm = pickMove(245, 10000, P, { ...LOOK, offNoseDeg: 20, noseOnSec: { immelmann: 34, pitchBack: null } });
  assert.equal(imm.move, 'immelmann');
  assert.equal(imm.why, 'Immelmann: nose on in about 34 s vs no nose-on in 60 s for a pitch back');
  const pb = pickMove(245, 10000, P, { ...LOOK, noseOnSec: { immelmann: null, pitchBack: 14 } });
  assert.equal(pb.move, 'pitchBack');
  assert.equal(pb.why, 'Pitch back: nose on in about 14 s vs no nose-on in 60 s for an Immelmann, outside the SMM band (160 to 220 KIAS)');
});

test('an Immelmann that would be over the top under immelmannMinTopKias is never picked, however quick', () => {
  const r = pickMove(245, 10000, P, { ...LOOK, topKias: 119.6 });
  assert.equal(r.move, 'pitchBack');
  assert.match(r.why, /over the top at only 119 KIAS/);
  assert.equal(pickMove(245, 10000, P, { ...LOOK, topKias: 120 }).move, 'immelmann');
  assert.equal(pickMove(245, 10000, { ...P, immelmannMinTopKias: 90 }, { ...LOOK, topKias: 100 }).move, 'immelmann');
});

test('with no nose-on in the look-ahead for either, the geometry decides: more than 120° off the nose is an Immelmann, else a pitch back', () => {
  const none = { immelmann: null, pitchBack: null };
  const behind = pickMove(245, 10000, P, { ...LOOK, offNoseDeg: 170, noseOnSec: none });
  assert.equal(behind.move, 'immelmann');
  assert.equal(behind.why, 'Immelmann: 245 KIAS, other aircraft 170° off the nose, over the top at 140 KIAS');
  const side = pickMove(245, 10000, P, { ...LOOK, offNoseDeg: 80, noseOnSec: none });
  assert.equal(side.move, 'pitchBack');
  assert.equal(side.why, 'Pitch back: 245 KIAS, other aircraft 80° off the nose, outside the SMM band (160 to 220 KIAS)');
  assert.equal(pickMove(245, 10000, P, { ...LOOK, offNoseDeg: 120, noseOnSec: none }).move, 'pitchBack', 'exactly 120° is not more than 120°');
  assert.equal(pickMove(245, 10000, { ...P, immelmannOffNoseDeg: 60 }, { ...LOOK, offNoseDeg: 80, noseOnSec: none }).move, 'immelmann', 'the angle is a setting');
  // Left out, the look-ahead is skipped and the geometry stands alone (also what a dry run does).
  assert.equal(pickMove(245, 10000, P, { offNoseDeg: 170 }).move, 'immelmann');
  assert.equal(pickMove(245, 10000, P, { offNoseDeg: 80 }).move, 'pitchBack');
});

test('the look-ahead is only worked out above 220, and only as far as it is needed', () => {
  const boom = () => { throw new Error('worked out when not needed'); };
  assert.equal(pickMove(200, 10000, P, { offNoseDeg: 170, topKias: boom, noseOnSec: boom }).move, 'pitchBack');
  assert.equal(pickMove(100, 10000, P, { offNoseDeg: 170, topKias: boom, noseOnSec: boom }).move, 'splitS');
  assert.equal(pickMove(160, 10000, P, { offNoseDeg: 170, topKias: boom, noseOnSec: boom }).move, 'mpt');
  // A gated Immelmann never starts the dry run of the fight.
  assert.equal(pickMove(245, 10000, P, { offNoseDeg: 170, topKias: () => 100, noseOnSec: boom }).move, 'pitchBack');
});

test('at a 250 KIAS merge head-on neither move scores (the noses meet head-on, which is no chase), so the geometry picks the Immelmann, and says so', () => {
  // This pinned "34 s against none" before: a head-on pass counted as a win. It is not one, so the look-ahead finds nothing.
  const s = createEnergyFight({ blueKias: 250, redKias: 250, pursuit: 'none' });
  for (const ac of [s.blue, s.red]) {
    assert.equal(ac.move, 'immelmann');
    assert.match(ac.why, /^Immelmann: 250 KIAS, other aircraft 180° off the nose, over the top at 1\d\d KIAS$/);
  }
  assert.deepEqual(s.plan.blue.race, { immelmann: null, pitchBack: null });
  const m = runUntil({ blueKias: 250, redKias: 250, pursuit: 'none' }, (st) => st.merged);
  assert.equal(m.blue.why, s.blue.why, 'the moves shown before the turns are the moves flown');
});

test('at a 316 KIAS merge head-on the geometry picks the Immelmann too, and says it is outside the SMM band', () => {
  // This pinned "pitch back, 14 s against 56 s" before: again a head-on pass scored as a win.
  const s = createEnergyFight({ blueKias: 316, redKias: 316, pursuit: 'none' });
  assert.equal(s.blue.move, 'immelmann');
  assert.match(s.blue.why, /^Immelmann: 316 KIAS, other aircraft 180° off the nose, over the top at 161 KIAS, outside the SMM band \(200 to 250 KIAS\)$/);
  assert.deepEqual(s.plan.blue.race, { immelmann: null, pitchBack: null });
});

test('where a chase from behind is on offer the race decides, by the real fight\'s own numbers', () => {
  // Blue 250 against a pitching-back Red 160, from 150° off and 150° aspect: the pitch back gets a chase started (11 s after the merge),
  // the Immelmann never does in 60 s.
  const a = createEnergyFight({ blueKias: 250, redKias: 160, redMove: 'pitchBack', turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 });
  assert.equal(a.blue.move, 'pitchBack');
  assert.equal(a.plan.blue.race.immelmann, null);
  near(a.plan.blue.race.pitchBack, 10.84, 0.05, 'pitch back'); // 10.58 s before the graded handover lead (F2): a pitch back from 250 KIAS now hands to the MPT a little later
  assert.equal(a.blue.why, 'Pitch back: nose on in about 11 s vs no nose-on in 60 s for an Immelmann, outside the SMM band (160 to 220 KIAS)');
  // Blue 316 against a pitching-back Red, from close: the Immelmann gets there (31 s), the pitch back never does.
  const b = createEnergyFight({ blueKias: 316, redKias: 316, redMove: 'pitchBack', turnsStart: 'now', separationNm: 0.7, ataDeg: 45, aaDeg: 30 });
  assert.equal(b.blue.move, 'immelmann');
  near(b.plan.blue.race.immelmann, 31.0, 0.05, 'Immelmann'); // 31.64 s before the graded handover lead (F2): Red's pitch back from 316 KIAS now turns in earlier
  assert.equal(b.plan.blue.race.pitchBack, null);
  assert.equal(b.blue.why, 'Immelmann: nose on in about 31 s vs no nose-on in 60 s for a pitch back, outside the SMM band (200 to 250 KIAS)');
});

test('a fast merge with an Immelmann that would be too slow over the top flies the pitch back (gate), and says so', () => {
  for (const kias of [221, 230]) {
    const s = createEnergyFight({ blueKias: kias, redKias: kias, pursuit: 'none' });
    assert.equal(s.blue.move, 'pitchBack', `${kias}`);
    assert.match(s.blue.why, /^Pitch back: \d+ KIAS, an Immelmann would be over the top at only 1\d\d KIAS, outside the SMM band \(160 to 220 KIAS\)$/);
  }
  const low = createEnergyFight({ blueKias: 230, redKias: 230, pursuit: 'none', immelmannMinTopKias: 100 });
  assert.notEqual(low.blue.move, 'pitchBack', 'with the gate set lower the dry run decides');
});

test('the dry run leaves the fight untouched: the state is deep-equal before and after, at the pass and mid-fight', () => {
  for (const setup of [{ blueKias: 250, redKias: 250 }, { blueKias: 316, redKias: 300, circles: 1 }]) {
    const before = createEnergyFight(setup);
    const copy = structuredClone(before);
    const a = lookAheadPick(before, 'blue');
    const b = lookAheadPick(before, 'red');
    assert.deepEqual(before, copy, 'at the start');
    const merged = runUntil(setup, (st) => st.merged);
    const mcopy = structuredClone(merged);
    lookAheadPick(merged, 'blue');
    lookAheadPick(merged, 'red');
    assert.deepEqual(merged, mcopy, 'at the merge');
    assert.ok(a.move && b.move);
  }
});

test('the pick is deterministic: the same setup gives the same pick and the same reason, every time', () => {
  const pick = () => { const s = createEnergyFight({ blueKias: 250, redKias: 280, ataDeg: 30, aaDeg: 150 }); return [s.blue.move, s.blue.why, s.red.move, s.red.why]; };
  assert.deepEqual(pick(), pick());
  const s = createEnergyFight({ blueKias: 250, redKias: 250 });
  assert.deepEqual(lookAheadPick(s, 'blue'), lookAheadPick(s, 'blue'));
});

/**
 * The fastest of `batches` timed batches of `runs` calls, in ms of this process's CPU time per call. CPU time, not the clock on the wall: the
 * suite runs many test files at once, and a busy machine stretches the wall clock but not the CPU a pick really takes.
 */
function bestMsPerCall(fn, runs, batches) {
  fn(); // warm the code up
  let best = Infinity;
  for (let b = 0; b < batches; b++) {
    const c0 = process.cpuUsage();
    for (let i = 0; i < runs; i++) fn();
    const c = process.cpuUsage(c0);
    best = Math.min(best, (c.user + c.system) / 1000 / runs);
  }
  return best;
}

test('the look-ahead is quick: a pick costs no more than five 60 s fights flown step by step, at the start, with a second round and in mid-fight', (t) => {
  // Measured against this machine's own speed, not a fixed number of ms: a slower computer (or a CI runner) makes both
  // sides slower alike. A pick races two moves for up to 60 s each, so about two fights' worth; five leaves room for the
  // copying and the reason text, and still catches a pick that starts running extra races. Here, about 15 ms a fight and
  // 30 to 40 ms a pick.
  const fight60 = () => {
    const s = createEnergyFight({ ...SOLO, blueKias: 250, redKias: 250, blueMove: 'pitchBack', redMove: 'pitchBack' });
    for (let i = 0; i < 60 / FIGHT_STEP_SEC; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
  };
  const fightMs = bestMsPerCall(fight60, 3, 5);
  const limit = 5 * fightMs;
  t.diagnostic(`a 60 s fight: ${fightMs.toFixed(1)} ms, so the limit is ${limit.toFixed(1)} ms per pick`);
  const setup = { blueKias: 250, redKias: 250 };
  // Two aircraft pick in each new fight, each racing the Immelmann against the pitch back; nothing scores here, so every run goes the whole 60 s.
  const perPick = bestMsPerCall(() => createEnergyFight(setup), 3, 5) / 2;
  t.diagnostic(`look-ahead at the start: ${perPick.toFixed(1)} ms per pick`);
  assert.ok(perPick < limit, `${perPick.toFixed(1)} ms per pick at the start, limit ${limit.toFixed(1)}`);
  // A fight where Blue's pick is raced again against Red's plan (and Red's race is run again): four picks, each the same cost.
  const again = { blueKias: 250, redKias: 250, turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 };
  const perRacedPick = bestMsPerCall(() => createEnergyFight(again), 3, 5) / 4;
  t.diagnostic(`look-ahead in a fight with a second round: ${perRacedPick.toFixed(1)} ms per pick`);
  assert.ok(perRacedPick < limit, `${perRacedPick.toFixed(1)} ms per pick with a second round, limit ${limit.toFixed(1)}`);
  // Mid-fight: the pick after a move ends, here a second after the merge of the default 250 KIAS head-on, where nothing scores, so both runs go the whole 60 s.
  const mid = runUntil(setup, (st) => st.merged && st.timeSec > st.mergeSec + 1, 60);
  const midMs = bestMsPerCall(() => lookAheadPick(mid, 'blue'), 3, 5);
  t.diagnostic(`look-ahead mid-fight: ${midMs.toFixed(1)} ms per pick`);
  assert.ok(midMs < limit, `${midMs.toFixed(1)} ms per pick mid-fight, limit ${limit.toFixed(1)}`);
});

// ── Steps 2 and 3: from every merge speed to 160 ± 5 KIAS, then hold it ────

// The spec names 100, 140, 180, 220 and 250; the todo says every speed from 100 to 250, so every 10 KIAS.
const MERGE_SPEEDS = Array.from({ length: 16 }, (_, i) => 100 + 10 * i);

/** Flies one Auto aircraft from the merge and returns when it reaches 160 ± 5 and what it cost. */
function toMpt(mergeKias, extra = {}) {
  const setup = { ...SOLO, blueKias: mergeKias, redKias: mergeKias, ...extra };
  const mptKias = setup.mptKias ?? 160;
  const s = createEnergyFight(setup);
  let reached = null;
  const moves = [s.blue.move];
  const minMax = { min: Infinity, max: -Infinity };
  for (let i = 0; i < 300 / FIGHT_STEP_SEC; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (s.blue.move !== moves[moves.length - 1]) moves.push(s.blue.move);
    if (!reached && s.merged && Math.abs(s.blue.kias - mptKias) <= 5 && s.blue.move === 'mpt') {
      reached = { timeSec: s.timeSec - s.mergeSec, turnDeg: s.blue.toMptDeg, dAltFt: s.blue.altFt - (setup.blueAltFt ?? 10000), state: s };
    }
    if (reached) {
      minMax.min = Math.min(minMax.min, s.blue.kias);
      minMax.max = Math.max(minMax.max, s.blue.kias);
      if (s.blue.move === 'levelMpt') break;
    }
  }
  return { s, reached, moves, ...minMax };
}

for (const kias of MERGE_SPEEDS) {
  test(`from ${kias} KIAS at the merge, Auto reaches 160 ± 5 KIAS and then holds it down to the deck`, () => {
    const r = toMpt(kias);
    assert.ok(r.reached, `${kias} KIAS never reached the MPT; moves ${r.moves.join(' > ')}; kias ${r.s.blue.kias}`);
    assert.ok(r.min >= 155 && r.max <= 165, `${kias} KIAS: held ${r.min.toFixed(1)} to ${r.max.toFixed(1)} after reaching it (${r.moves.join(' > ')})`);
    assert.equal(r.s.blue.mptReached, true);
    assert.ok(r.reached.timeSec < 120, `${r.reached.timeSec}`);
    assert.ok(Number.isFinite(r.reached.turnDeg));
  });
}

test('the result card\'s numbers: the time and degrees of turn to reach the MPT are counted from the start of the turn', () => {
  const r = toMpt(180);
  assert.ok(r.reached.timeSec > 0 && r.reached.timeSec < 60);
  near(r.s.blue.toMptSec, r.reached.timeSec, 0.05);
  assert.ok(r.s.blue.toMptDeg > 0 && r.s.blue.toMptDeg < 360, `${r.s.blue.toMptDeg}`);
  // Already at 160: no time, no turn.
  const now = toMpt(160);
  assert.ok(now.s.blue.toMptSec < 2, `${now.s.blue.toMptSec}`);
});

test('the constant-speed MPT holds 160 by bank, inside 60 to 85°, and gives up height to do it', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 160, redKias: 160 });
  let bankMin = Infinity, bankMax = -Infinity, kiasMin = Infinity, kiasMax = -Infinity;
  for (let i = 0; i < 40 / FIGHT_STEP_SEC; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (s.merged && s.timeSec > s.mergeSec + 10) {
      bankMin = Math.min(bankMin, s.blue.bankDeg); bankMax = Math.max(bankMax, s.blue.bankDeg);
      kiasMin = Math.min(kiasMin, s.blue.kias); kiasMax = Math.max(kiasMax, s.blue.kias);
    }
  }
  assert.equal(s.blue.move, 'mpt');
  assert.ok(bankMin >= 60 - 0.5 && bankMax <= 85 + 0.5, `${bankMin} ${bankMax}`);
  assert.ok(kiasMin >= 155 && kiasMax <= 165, `${kiasMin} ${kiasMax}`);
  assert.ok(s.blue.altFt < 10000 - 100, `descending: ${s.blue.altFt}`);
  assert.ok(s.blue.climbDeg < 0);
  assert.match(s.blue.why, /MPT 160 KIAS/);
});

test('the MPT speed is a setting: at 150 KIAS it captures and holds 150', () => {
  const r = toMpt(150, { mptKias: 150 });
  assert.ok(r.reached);
  assert.ok(r.min >= 145 && r.max <= 155, `${r.min} ${r.max}`);
});

// ── The moves ────────────────────────────────────────────────────────────────

test('a split S ends level, heading reversed, and lower (about 2,000 ft)', () => {
  const start = createEnergyFight({ ...SOLO, blueKias: 100, redKias: 100 });
  assert.equal(start.blue.move, 'splitS');
  let endedAt = null;
  watch({ ...SOLO, blueKias: 100, redKias: 100 }, (st) => {
    if (st.blue.move !== 'splitS') { endedAt = { alt: st.blue.altFt, climb: st.blue.climbDeg, hdg: st.blue.headingRad, inv: st.blue.inverted }; return false; }
    return true;
  }, 90);
  assert.ok(endedAt, 'the split S finished');
  near(endedAt.climb, 0, 5, 'level');
  near(degDiff(endedAt.hdg, 0), 180, 15, 'heading reversed');
  assert.ok(endedAt.alt < 10000 - 1200 && endedAt.alt > 10000 - 3500, `lower by ${10000 - endedAt.alt}`);
  assert.equal(endedAt.inv, false, 'upright at the end');
});

test('the split S is core\'s: the same height loss, peak G, exit speed and turn as splitST6A from the same entry, rolling toward the other aircraft', () => {
  for (const [kias, altFt, ataSide] of [[90, 10000, 'left'], [100, 10000, 'right'], [110, 10000, 'left'], [110, 8000, 'right'], [119, 10000, 'left']]) {
    const s = createEnergyFight({ ...SOLO, turnsStart: 'now', ataDeg: 30, ataSide, aaDeg: 150, blueKias: kias, redKias: kias, blueAltFt: altFt, redAltFt: altFt, blueMove: 'splitS', redMove: 'splitS' });
    let peakG = 0, at = null;
    for (let i = 0; i < 60 / FIGHT_STEP_SEC && !at; i++) {
      stepEnergyFight(s, FIGHT_STEP_SEC);
      peakG = Math.max(peakG, s.blue.g);
      if (s.blue.ctl.phase === 'level') at = { altFt: s.blue.altFt, kias: s.blue.kias, turnDeg: radToDeg(wrapPi(s.blue.headingRad)), t: s.timeSec };
    }
    assert.ok(at, `${kias} KIAS: the split S pulled through`);
    const core = splitST6A(kias, altFt, { rollLeft: s.blue.turnDir === 1 });
    const name = `${kias} KIAS at ${altFt} ft, rolling ${s.blue.turnDir === 1 ? 'left' : 'right'}`;
    near(altFt - at.altFt, core.lossFt, 5, `${name}: height lost`);
    near(peakG, core.peakG, 0.05, `${name}: peak G`);
    near(at.kias, core.exitKias, 3, `${name}: exit KIAS`);
    near(Math.abs(at.turnDeg), Math.abs(core.turnDeg), 8, `${name}: turn`);
    assert.ok(peakG <= 5 + 1e-9, `the split S pull is capped at 5 G: ${peakG}`);
    assert.equal(s.blue.inverted, false, 'upright at the end');
  }
  // From 110 KIAS at 10,000 ft core gives about 1,690 ft lost from the entry.
  near(splitST6A(110, 10000).lossFt, 1690, 15);
});

test('a split S flies as the SMM says: 20° nose up, rolls inverted at 0.5 G, then pulls through', () => {
  let maxClimb = -90, invertedG = null, nose = false;
  watch({ ...SOLO, blueKias: 100, redKias: 100 }, (st) => {
    const b = st.blue;
    if (b.move !== 'splitS') return false;
    maxClimb = Math.max(maxClimb, b.climbDeg);
    if (b.bankDeg > 100 && b.bankDeg < 170 && invertedG === null) invertedG = b.g;
    if (b.climbDeg < -60) nose = true;
    return true;
  }, 60);
  near(maxClimb, 20, 3);
  assert.ok(invertedG !== null && invertedG <= 0.6, `${invertedG}`);
  assert.ok(nose, 'passed the vertical dive');
});

test('an Immelmann ends heading reversed and higher, upright and level', () => {
  let endedAt = null;
  watch({ ...SOLO, blueKias: 250, redKias: 250, blueMove: 'immelmann', redMove: 'immelmann' }, (st) => {
    if (st.merged && st.blue.move !== 'immelmann') { endedAt = { alt: st.blue.altFt, climb: st.blue.climbDeg, hdg: st.blue.headingRad, inv: st.blue.inverted, kias: st.blue.kias }; return false; }
    return true;
  }, 90);
  assert.ok(endedAt, 'the Immelmann finished');
  near(endedAt.climb, 0, 6, 'level');
  near(degDiff(endedAt.hdg, 0), 180, 20, 'heading reversed');
  assert.ok(endedAt.alt > 10000 + 1500, `higher by ${endedAt.alt - 10000}`);
  assert.equal(endedAt.inv, false);
});

test('a pitch back rolls to the bank the SMM gives for the entry speed: 60° at 160 KIAS, 30° at 220, between in a line', () => {
  for (const [kias, bank] of [[160, 60], [190, 45], [220, 30]]) {
    let held = null;
    watch({ ...SOLO, blueKias: kias, redKias: kias, blueMove: 'pitchBack', redMove: 'pitchBack' }, (st) => {
      if (st.merged && st.timeSec > st.mergeSec + 0.75) { held = st.blue.bankDeg; return false; }
      return true;
    }, 30);
    near(held, bank, 1, `${kias} KIAS`);
  }
});

test('a slice rolls to 90° at 160 KIAS and 135° at 100, in a line', () => {
  for (const [kias, bank] of [[160, 90], [130, 112.5], [100, 135]]) {
    let held = null;
    watch({ ...SOLO, blueKias: kias, redKias: kias, blueMove: 'slice', redMove: 'slice' }, (st) => {
      if (st.merged && st.timeSec > st.mergeSec + 2) { held = st.blue.bankDeg; return false; }
      return true;
    }, 90);
    near(held, bank, 1.5, `${kias} KIAS`);
  }
});

test('the roll is at 90°/s, never instant', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 190, blueMove: 'pitchBack', redKias: 190, redMove: 'pitchBack', turnsStart: 'now' });
  let last = 0, worst = 0;
  for (let i = 0; i < 100; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    worst = Math.max(worst, Math.abs(s.blue.bankDeg - last) / FIGHT_STEP_SEC);
    last = s.blue.bankDeg;
  }
  assert.ok(worst <= 90 + 1e-6, `${worst}`);
  assert.ok(worst > 80, `${worst}`);
});

test('a pitch back holds about 4 G until the speed has bled to where the shaker is lower, and never jumps straight to the shaker', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 220, redKias: 220, blueMove: 'pitchBack', redMove: 'pitchBack' });
  const seen = [];
  for (let i = 0; i < 20 / FIGHT_STEP_SEC; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (s.merged && s.blue.move === 'pitchBack') seen.push({ g: s.blue.g, shaker: s.blue.shakerG, t: s.timeSec - s.mergeSec });
  }
  assert.ok(seen.length > 20, `the pitch back lasts a moment: ${seen.length}`);
  for (const r of seen) near(r.g, Math.min(4, r.shaker), 0.02, `t+${r.t.toFixed(2)}`);
  assert.ok(seen[0].shaker > 5.5, 'the shaker at 220 KIAS would be 6 G, which it does not pull');
});

test('an Immelmann holds about 4 G while the shaker is higher, then the shaker once it is lower', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 250, redKias: 250, blueMove: 'immelmann', redMove: 'immelmann' });
  let sawShakerBelow4 = false, steps = 0;
  for (let i = 0; i < 25 / FIGHT_STEP_SEC && !(s.merged && s.blue.ctl.phase !== 'main' && s.blue.move === 'immelmann'); i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (!s.merged || s.blue.move !== 'immelmann' || s.blue.ctl.phase !== 'main') continue;
    steps++;
    near(s.blue.g, Math.min(4, s.blue.shakerG), 0.02, `t+${(s.timeSec - s.mergeSec).toFixed(2)} at ${s.blue.kias.toFixed(0)} KIAS`);
    if (s.blue.shakerG < 4) sawShakerBelow4 = true;
  }
  assert.ok(steps > 100, `${steps}`);
  assert.ok(sawShakerBelow4, 'the speed bled until the shaker was the lower');
});

// ── Step 3: the level MPT at the hard deck ──────────────────────────────────

test('at a 6,000 ft deck the level MPT settles at 144 ± 5 KIAS (150 minus altitude in thousands), level, in the shaker', () => {
  const s = runUntil({ ...SOLO, blueAltFt: 6000, redAltFt: 6000, blueKias: 160, redKias: 160, hardDeckFt: 6000 }, (st) => st.timeSec > 150, 150);
  assert.equal(s.blue.move, 'levelMpt');
  near(s.blue.kias, 144, 5, `settled at ${s.blue.kias}`);
  near(s.blue.altFt, 6000, 60, 'level');
  near(s.blue.climbDeg, 0, 1);
  near(s.blue.g, 0.94 * stallLimitG(s.blue.kias), 0.05);
  near(s.blue.bankDeg, 68.5, 2, 'the bank that holds level at 2.7 G (the spec says about 75°, which needs 3.9 G)');
  near(s.blue.psFtps, 0, 3, 'thrust equals drag');
  assert.equal(s.blue.throttle, 1);
  assert.match(s.blue.why, /[Ll]evel MPT/);
});

test('the level MPT is reached from the CSMPT when the descent gets to the deck, and then holds that height', () => {
  const s = createEnergyFight({ ...SOLO, blueAltFt: 7000, redAltFt: 7000, blueKias: 160, redKias: 160, hardDeckFt: 6000 });
  let levelAt = null, minAlt = Infinity;
  for (let i = 0; i < 240 / FIGHT_STEP_SEC; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (s.blue.move === 'levelMpt') { levelAt ??= s.timeSec; minAlt = Math.min(minAlt, s.blue.altFt); }
  }
  assert.ok(levelAt !== null, 'reached the deck');
  assert.ok(minAlt > 5940, `held the deck, lowest ${minAlt}`);
  near(s.blue.altFt, 6000, 60);
  near(s.blue.kias, 146, 5);
});

test('the level MPT aims at the deck itself: dragged under it, it climbs back to it, and from above it settles on it', () => {
  // A slice from 120 KIAS at the deck sinks under it (to about 5,600 ft); the level MPT then brings it back up.
  let lowest = Infinity;
  const s = runUntil({ ...SOLO, blueAltFt: 6000, redAltFt: 6000, blueKias: 120, redKias: 120, blueMove: 'slice', redMove: 'slice', hardDeckFt: 6000 }, (st) => {
    lowest = Math.min(lowest, st.blue.altFt);
    return st.timeSec > 120;
  }, 120);
  assert.ok(lowest < 5900, `the slice took it under the deck: ${lowest}`);
  assert.equal(s.blue.move, 'levelMpt');
  near(s.blue.altFt, 6000, 15, 'back on the deck');
  const above = runUntil({ ...SOLO, blueAltFt: 6600, redAltFt: 6600, blueKias: 160, redKias: 160, hardDeckFt: 6000 }, (st) => st.timeSec > 200, 200);
  near(above.blue.altFt, 6000, 15, 'and settles on it from above');
});

test('the level MPT follows the altitude: the lower the deck, the faster it settles (150 minus thousands of feet)', () => {
  const at = (deck) => runUntil({ ...SOLO, blueAltFt: deck, redAltFt: deck, blueKias: 160, redKias: 160, hardDeckFt: deck }, (st) => st.timeSec > 150, 150).blue.kias;
  assert.ok(at(4000) > at(10000) + 1, `${at(4000)} vs ${at(10000)}`);
  near(at(10000), 140, 5);
});

test('a forced MPT from above its speed rolls in at mid-range power and about 4 G, then full power at the shaker', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 220, redKias: 220, blueMove: 'mpt', redMove: 'mpt' });
  assert.equal(s.blue.move, 'mpt');
  let half = 0, full = 0, changedAtG = null, prevThrottle = null;
  for (let i = 0; i < 60 / FIGHT_STEP_SEC; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (!s.merged) continue;
    if (s.blue.throttle === 0.5) half++;
    if (s.blue.throttle === 1) full++;
    if (prevThrottle === 0.5 && s.blue.throttle === 1) changedAtG ??= { g: s.blue.g, shaker: s.blue.shakerG };
    prevThrottle = s.blue.throttle;
  }
  assert.ok(half > 50, `${half}`);
  assert.ok(full > 50, `${full}`);
  assert.ok(changedAtG, 'went to MAX');
  near(changedAtG.g, changedAtG.shaker, 0.1, 'PCL goes to MAX when the shaker comes on');
});

test('every other move, and an MPT from at or under its speed, is at full power', () => {
  for (const [move, kias] of [['pitchBack', 190], ['slice', 140], ['immelmann', 250], ['splitS', 100], ['mpt', 160], ['mpt', 140]]) {
    const s = createEnergyFight({ ...SOLO, blueKias: kias, redKias: kias, blueMove: move, redMove: move });
    for (let i = 0; i < 40 / FIGHT_STEP_SEC; i++) {
      stepEnergyFight(s, FIGHT_STEP_SEC);
      assert.equal(s.blue.throttle, 1, `${move} at ${kias} at ${s.timeSec}`);
    }
  }
});

test('the mid-range throttle is a setting: half of maximum thrust by default, and 0.3 changes the climb', () => {
  const run = (midThrottle) => runUntil({ ...SOLO, blueKias: 220, redKias: 220, blueMove: 'mpt', redMove: 'mpt', midThrottle }, (st) => st.merged && st.timeSec > st.mergeSec + 6, 60).blue.kias;
  assert.ok(run(0.3) < run(0.5), `${run(0.3)} ${run(0.5)}`);
});


test('after a split S or an Immelmann rolls out, Auto looks at the speed again and picks from step 1 (a follow-on)', () => {
  for (const kias of [100, 250]) {
    const s = createEnergyFight({ ...SOLO, blueKias: kias, redKias: kias });
    const first = s.blue.move;
    assert.ok(first === 'splitS' || first === 'immelmann');
    let next = null;
    for (let i = 0; i < 90 / FIGHT_STEP_SEC && !next; i++) {
      stepEnergyFight(s, FIGHT_STEP_SEC);
      if (s.blue.move !== first) next = { move: s.blue.move, kias: s.blue.kias, alt: s.blue.altFt };
    }
    assert.ok(next, `${kias} KIAS ${first} ended`);
    // The move that follows is the one step 1 gives for the speed and height it ended at (a hair of rounding aside).
    const again = pickMove(next.kias, next.alt, ENERGY_DEFAULT_SETUP).move;
    assert.equal(next.move, again, `${kias} KIAS: ${first} then ${next.move} at ${next.kias.toFixed(0)} KIAS`);
  }
});

test('each aircraft really turns toward the other: the heading changes the way turnDir says, in a 1-circle and a 2-circle fight, off the nose', () => {
  for (const circles of [1, 2]) {
    for (const ataSide of ['left', 'right']) {
      const s = createEnergyFight({ circles, ataDeg: 60, ataSide, aaDeg: 120, aaSide: ataSide === 'left' ? 'right' : 'left', turnsStart: 'now', blueKias: 160, redKias: 160, blueMove: 'mpt', redMove: 'mpt', ...SOLO });
      const h0 = { blue: s.blue.headingRad, red: s.red.headingRad };
      for (let i = 0; i < 4 / FIGHT_STEP_SEC; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
      for (const who of ['blue', 'red']) {
        const change = wrapPi(s[who].headingRad - h0[who]);
        assert.ok(change * s[who].turnDir > degToRad(20), `${who} ${circles}-circle, Red ${ataSide}: heading changed ${radToDeg(change)}° with turnDir ${s[who].turnDir}`);
      }
      assert.equal(s.blue.turnDir, ataSide === 'left' ? 1 : -1, 'Blue turns toward Red');
    }
  }
});

test('a crossing start (beam, both sides, range opening or closing) flies finite for a full fight', () => {
  for (const [ataDeg, aaDeg, turnsStart] of [[90, 90, 'pass'], [90, 0, 'pass'], [180, 180, 'pass'], [30, 150, 'now'], [0, 0, 'pass']]) {
    const s = createEnergyFight({ ataDeg, aaDeg, turnsStart, blueKias: 180, redKias: 140 });
    for (let i = 0; i < 40; i++) stepEnergyFight(s, 5);
    for (const [k, v] of [...numbersOf(s.blue, 'blue.'), ...numbersOf(s.red, 'red.')]) assert.ok(Number.isFinite(v), `${ataDeg}/${aaDeg}: ${k} ${v}`);
  }
});

// ── Energy readouts ──────────────────────────────────────────────────────────

test('the readouts are in the state: KIAS, KTAS, altitude, G, bank, climb, move, why, Ps, energy height, time and turn to the MPT, range', () => {
  const s = runUntil({ ...SOLO, blueKias: 180, redKias: 180 }, (st) => st.timeSec > 20, 30);
  for (const k of ['kias', 'ktas', 'altFt', 'g', 'bankDeg', 'climbDeg', 'psFtps', 'energyHeightFt', 'toMptSec', 'toMptDeg', 'throttle', 'shakerG']) {
    assert.ok(Number.isFinite(s.blue[k]), `${k}: ${s.blue[k]}`);
  }
  for (const k of ['move', 'moveLabel', 'why']) assert.equal(typeof s.blue[k], 'string', k);
  assert.equal(typeof s.blue.overG, 'boolean');
  assert.equal(typeof s.blue.stall, 'boolean');
  assert.ok(Number.isFinite(s.rangeFt));
  assert.ok(s.blue.ktas > s.blue.kias, 'TAS above IAS at altitude');
  assert.ok(s.blue.energyHeightFt > s.blue.altFt);
});

// ── The two flags ────────────────────────────────────────────────────────────

test('a G above the stall line gives STALL, then 1 G for 1 s, then back to the shaker', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 150, redKias: 150, blueMove: 'pitchBack', redMove: 'pitchBack', blueForceG: 6, turnsStart: 'now' });
  const log = [];
  for (let i = 0; i < 4 / FIGHT_STEP_SEC; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    log.push({ t: s.timeSec, stall: s.blue.stall, g: s.blue.g, kias: s.blue.kias, shaker: s.blue.shakerG, reason: s.blue.stallReason });
  }
  const first = log.findIndex((r) => r.stall);
  assert.ok(first >= 0, 'stalled');
  assert.match(log[first].reason, /stall line|more lift|G/i);
  const stalled = log.filter((r) => r.stall);
  near(stalled.length * FIGHT_STEP_SEC, 1, 0.06, 'for 1 s');
  for (const r of stalled) near(r.g, 1, 1e-9, 'at 1 G');
  const after = log[first + stalled.length + 2];
  assert.equal(after.stall, false);
  assert.ok(after.g <= after.shaker + 1e-9 && after.g > 1.2, `back on the shaker: ${after.g} of ${after.shaker}`);
  assert.equal(s.blue.stallEver, true);
});

test('the stall time is a setting', () => {
  const s = createEnergyFight({ ...SOLO, stallSec: 2, blueKias: 150, redKias: 150, blueMove: 'pitchBack', redMove: 'pitchBack', blueForceG: 6, turnsStart: 'now' });
  let n = 0;
  for (let i = 0; i < 5 / FIGHT_STEP_SEC; i++) { stepEnergyFight(s, FIGHT_STEP_SEC); if (s.blue.stall) n++; }
  near(n * FIGHT_STEP_SEC, 2, 0.06);
});

test('speed below the 1 G stall gives STALL: an Immelmann entered too slow stalls at the top', () => {
  let stalledAt = null, reason = '';
  watch({ ...SOLO, blueKias: 130, redKias: 130, blueMove: 'immelmann', redMove: 'immelmann' }, (st) => {
    if (st.blue.stall && stalledAt === null) { stalledAt = st.blue.kias; reason = st.blue.stallReason; }
    return stalledAt === null;
  }, 60);
  assert.ok(stalledAt !== null);
  assert.ok(stalledAt < 90, `${stalledAt}`);
  assert.match(reason, /stall speed|below/i);
});

test('the stall speed is a setting: stall limit G follows it', () => {
  const s = createEnergyFight({ ...SOLO, stallKias: 83, blueKias: 160, redKias: 160 });
  near(s.blue.shakerG, 0.94 * (160 / 83) ** 2, 1e-9);
});

test('pitch back entered fast with a set G above 4.7 while rolling gives OVER G; at the default 4 G it does not', () => {
  const fast = { ...SOLO, blueKias: 220, redKias: 220, blueMove: 'pitchBack', redMove: 'pitchBack' };
  let flagged = null;
  watch({ ...fast, pullG: 6 }, (st) => {
    if (st.merged && st.blue.overG && flagged === null) flagged = { g: st.blue.g, bank: st.blue.bankDeg, reason: st.blue.overGReason };
    return st.timeSec < 25;
  }, 25);
  assert.ok(flagged, 'OVER G');
  near(flagged.g, 6, 0.05);
  assert.match(flagged.reason, /4\.7/);
  let ever = false;
  watch(fast, (st) => { if (st.blue.overG) ever = true; return st.timeSec < 25; }, 25);
  assert.equal(ever, false);
});

test('OVER G also flags more than +7 G, whatever the roll', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 250, redKias: 250, blueMove: 'pitchBack', redMove: 'pitchBack', blueForceG: 8, turnsStart: 'now' });
  for (let i = 0; i < 5; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
  assert.equal(s.blue.overG, true);
  assert.match(s.blue.overGReason, /7/);
  assert.equal(s.blue.overGEver, true);
  near(s.blue.g, 8, 1e-9, 'the aircraft still flies the G it pulled');
});

// ── Step 4: pursuit after first nose-on ──────────────────────────────────────

/**
 * An offensive perch: Blue 0.5 NM dead astern of Red, both already turning (turns at once), so Blue's
 * nose is on at the start and Red flies its MPT. (Two equal MPTs from a head-on merge never get the 3D
 * nose within 5° of each other, which is the spec's rate-fight stalemate.)
 */
const PERCH = { ataDeg: 0, aaDeg: 0, turnsStart: 'now', separationNm: 0.5, blueKias: 200, redKias: 160 };

for (const pursuit of ['pure', 'lead', 'lag']) {
  test(`${pursuit} pursuit: the chaser never pulls past the shaker or 7 G, nor past core's availableG (4.7 G) while it rolls`, () => {
    let chasing = 0, worstExcess = -Infinity, worstG = 0, limited = 0, rollingOver = 0;
    const s = watch({ ...PERCH, pursuit }, (st) => {
      const a = st.blue;
      if (a.move === 'pursuit') {
        chasing++;
        worstExcess = Math.max(worstExcess, a.g - a.shakerG);
        worstG = Math.max(worstG, a.g);
        if (a.chaseLimited) limited++;
        if (a.rolling && a.g > availableG(a.kias, true, st.setup.stallKias) + 0.02) rollingOver++;
        assert.equal(a.overG, false, 'a chaser never pulls OVER G');
      }
      return st.timeSec < 60;
    }, 60);
    assert.equal(s.chase.by, 'blue');
    assert.ok(chasing > 500, `chased for ${chasing} steps`);
    assert.ok(worstExcess <= 1e-9, `G over the shaker by ${worstExcess}`);
    assert.ok(worstG <= T6A_LIMITS.maxG + 1e-9, `${worstG}`);
    assert.equal(rollingOver, 0, 'no more than availableG while rolling');
    assert.ok(limited > 0, 'the result card can say it fell behind the curve');
  });
}

test('after first nose-on the winner chases and the other keeps its MPT', () => {
  const s = runUntil({ ...PERCH, pursuit: 'pure' }, (st) => st.timeSec > 3, 10);
  assert.equal(s.firstNose.by, 'blue');
  assert.equal(s.chase.by, 'blue');
  assert.equal(s.blue.move, 'pursuit');
  assert.match(s.blue.why, /Pure pursuit/);
  assert.equal(s.red.move, 'mpt');
  assert.equal(s.red.why, 'MPT 160 KIAS');
});

test('a head-on re-pass is first nose-on but not a pursuit: both keep turning in the MPT (default, pending Patrick\'s word)', () => {
  const s = runUntil({}, (st) => st.timeSec > st.mergeSec + 40, 80);
  assert.equal(s.firstNose.by, 'both');
  near(s.firstNose.timeSec - s.mergeSec, 17.1, 1, 'with the 4 G holds it is +17.1 s (+18.5 s before them; V6 gives +18.2 s)');
  for (const who of ['blue', 'red']) assert.notEqual(s[who].move, 'pursuit', who);
  assert.equal(s.chase, null);
});

test('a pursuit starts only from behind: the other\'s aspect angle is 150° or less', () => {
  const behind = runUntil({ ...PERCH, pursuit: 'pure' }, (st) => st.chase, 10);
  assert.equal(behind.chase.by, 'blue');
  assert.ok(behind.aaDeg <= 150, `${behind.aaDeg}`);
  const headOn = runUntil({ turnsStart: 'now', separationNm: 1, ataDeg: 0, aaDeg: 180 }, (st) => st.timeSec > 5, 6);
  assert.equal(headOn.firstNose.by, 'both');
  assert.equal(headOn.chase, null);
});

test('chaseAfterHeadOn is off by default: a head-on pass keeps both in the MPT', () => {
  assert.equal(ENERGY_DEFAULT_SETUP.chaseAfterHeadOn, false);
  const s = runUntil({}, (st) => st.timeSec > st.mergeSec + 60, 90);
  assert.equal(s.firstNose.by, 'both');
  assert.equal(s.chase, null);
  for (const who of ['blue', 'red']) assert.notEqual(s[who].move, 'pursuit');
});

test('with chaseAfterHeadOn the pursuit starts straight away at the head-on first nose-on, for both aircraft', () => {
  const s = runUntil({ chaseAfterHeadOn: true }, (st) => st.chase, 80);
  assert.equal(s.firstNose.by, 'both');
  assert.equal(s.chase.by, 'both');
  assert.equal(s.chase.timeSec, s.firstNose.timeSec, 'the same step');
  assert.ok(s.chase.aaDeg > 170, `${s.chase.aaDeg}`);
  for (const who of ['blue', 'red']) { assert.equal(s[who].move, 'pursuit', who); assert.match(s[who].why, /Pure pursuit/); }
  // And a chase from behind is the same either way.
  const behind = runUntil({ ...PERCH, chaseAfterHeadOn: true }, (st) => st.chase, 10);
  assert.equal(behind.chase.by, 'blue');
  assert.equal(behind.red.move, 'mpt');
  assert.throws(() => createEnergyFight({ chaseAfterHeadOn: 'yes' }), /chaseAfterHeadOn/);
});

test('pursuit points the nose at the other: the chaser\'s off-nose angle stays small while the G allows', () => {
  let maxOff = 0;
  watch({ ...PERCH, pursuit: 'pure' }, (st) => { if (st.timeSec < 8) maxOff = Math.max(maxOff, st.ataBlueDeg); return st.timeSec < 8; }, 8);
  assert.ok(maxOff < 10, `${maxOff}`);
});

test('pure, lead and lag aim differently: the same chase ends on three different headings', () => {
  const heading = (pursuit) => runUntil({ ...PERCH, pursuit }, (st) => st.timeSec > 6, 10).blue.headingRad;
  const pure = heading('pure'), lead = heading('lead'), lag = heading('lag');
  assert.ok(Number.isFinite(pure) && Number.isFinite(lead) && Number.isFinite(lag));
  assert.ok(degDiff(pure, lead) > 0.05 && degDiff(pure, lag) > 0.05 && degDiff(lead, lag) > 0.1, `${radToDeg(pure)} ${radToDeg(lead)} ${radToDeg(lag)}`);
});

test('lead and lag points are settings: 0 s ahead or behind is pure', () => {
  const heading = (setup) => runUntil({ ...PERCH, ...setup }, (st) => st.timeSec > 6, 10).blue.headingRad;
  near(heading({ pursuit: 'lead', leadSec: 0 }), heading({ pursuit: 'pure' }), 1e-9);
  near(heading({ pursuit: 'lag', lagSec: 0 }), heading({ pursuit: 'pure' }), 1e-9);
});

test('with pursuit off nobody chases, though first nose-on is still marked', () => {
  const s = runUntil({ ...PERCH, pursuit: 'none' }, (st) => st.timeSec > 3, 5);
  assert.equal(s.firstNose.by, 'blue');
  assert.equal(s.chase, null);
  assert.notEqual(s.blue.move, 'pursuit');
});

test('lead aims ahead of the other along its path and lag behind it', () => {
  for (const [pursuit, sign] of [['lead', 1], ['lag', -1]]) {
    const s = runUntil({ ...PERCH, pursuit }, (st) => st.timeSec > 4, 10);
    const a = s.blue, t = s.red;
    assert.ok(a.aim, `${pursuit} has an aim point`);
    const vx = Math.cos(t.headingRad) * Math.cos(t.climbDeg * Math.PI / 180), vy = Math.sin(t.headingRad) * Math.cos(t.climbDeg * Math.PI / 180);
    const along = (a.aim.xFt - t.xFt) * vx + (a.aim.yFt - t.yFt) * vy;
    assert.ok(along * sign > 0, `${pursuit}: the aim point is ${along.toFixed(0)} ft along the other's path`);
    near(Math.abs(along), (pursuit === 'lead' ? 1 : 1) * t.ktas * 1.68781 * Math.cos(t.climbDeg * Math.PI / 180), 5, `${pursuit} is one second`);
  }
  const pure = runUntil({ ...PERCH, pursuit: 'pure' }, (st) => st.timeSec > 4, 10);
  near(pure.blue.aim.xFt, pure.red.xFt, 1e-6);
});

// ── The deck and VMO hold for every pursuit ─────────────────────────────────

/** Each fight: its setup, and whether a chase should begin in it (asserted, so the deck and VMO checks cannot pass by nobody chasing). */
const DECK_AND_OVERSHOOT = { blueAltFt: 6000, redAltFt: 6000, blueKias: 316, redKias: 160, turnsStart: 'now', ataDeg: 0, aaDeg: 0, separationNm: 2 };
const TEN_MINUTES_FIGHTS = {
  'the default head-on fight': { setup: {}, chases: false },
  'a 1-circle head-on fight': { setup: { circles: 1 }, chases: false },
  'Blue 220 against Red 180': { setup: { redKias: 180 }, chases: true },
  'Blue 100 against Red 220': { setup: { blueKias: 100 }, chases: true },
  'an offensive perch': { setup: PERCH, chases: true },
  'a 1-circle fight, Blue 250 against Red 160': { setup: { circles: 1, blueKias: 250, redKias: 160 }, chases: true },
  'a 250 KIAS merge (the Immelmann)': { setup: { blueKias: 250, redKias: 250 }, chases: null },
  'Blue 300 against Red 280 (a later chase after a head-on first nose-on)': { setup: { blueKias: 300, redKias: 280 }, chases: true },
  'the default head-on fight, chasing after the head-on pass': { setup: { chaseAfterHeadOn: true }, chases: true },
  'a 1-circle head-on fight, chasing after the head-on pass': { setup: { circles: 1, chaseAfterHeadOn: true }, chases: true },
  'a 250 KIAS merge, chasing after the head-on pass': { setup: { blueKias: 250, redKias: 250, chaseAfterHeadOn: true }, chases: true },
  'both starting at the deck, 220 against 180': { setup: { blueAltFt: 6000, redAltFt: 6000, redKias: 180 }, chases: null },
  'both at the deck, Blue 316 overshooting Red 160': { setup: DECK_AND_OVERSHOOT, chases: true },
  'the perch at the deck': { setup: { ...PERCH, blueAltFt: 6000, redAltFt: 6000 }, chases: true },
};
for (const pursuit of [...PURSUITS]) {
  for (const [name, { setup, chases }] of Object.entries(TEN_MINUTES_FIGHTS)) {
    test(`${name}, ${pursuit} pursuit, ten minutes: never more than 20 ft below the deck, never past VMO`, () => {
      const s = createEnergyFight({ ...setup, pursuit });
      let minAlt = Infinity, maxKias = 0, chasing = 0;
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 750; j++) {
          stepEnergyFight(s, FIGHT_STEP_SEC);
          for (const a of [s.blue, s.red]) {
            minAlt = Math.min(minAlt, a.altFt); maxKias = Math.max(maxKias, a.kias);
            if (a.move === 'pursuit') chasing++;
          }
        }
      }
      assert.equal(s.stopped, true);
      if (chases === true) assert.ok(chasing > 0, 'a chase began');
      assert.ok(minAlt >= s.setup.hardDeckFt - 20, `lowest ${minAlt.toFixed(0)} ft against a ${s.setup.hardDeckFt} ft deck`);
      assert.ok(maxKias <= T6A_LIMITS.vmoKias, `fastest ${maxKias.toFixed(0)} KIAS against VMO ${T6A_LIMITS.vmoKias}`);
    });
  }
}

test('the pursuit does run when it should: an unequal fight ends with a chaser, and it held the deck while chasing', () => {
  const s = runUntil({ redKias: 180, pursuit: 'pure' }, (st) => st.chase && st.timeSec > st.chase.timeSec + 30, 400);
  assert.ok(s.chase, 'a pursuit began');
  assert.ok(s.blue.altFt >= 5960 && s.red.altFt >= 5960);
});

// ── Stall, forced G and setup bounds ─────────────────────────────────────────

test('STALL stays on while the speed is below the stall speed, and the jet flies no more than min(1 G, the stall line)', () => {
  let below = 0, offWhileBelow = 0, overStallLine = 0, recovered = false;
  watch({ ...SOLO, blueKias: 130, redKias: 130, blueMove: 'immelmann', redMove: 'immelmann' }, (st) => {
    const a = st.blue;
    if (a.kias < st.setup.stallKias) {
      below++;
      if (!a.stall) offWhileBelow++;
      if (a.g > Math.min(1, stallLimitG(a.kias)) + 0.02 && a.ctl.stallTimer > 0) overStallLine++; // the G is for the speed at the start of the step
    }
    if (below > 0 && a.kias > st.setup.stallKias + 10) recovered = true;
    return st.timeSec < 60;
  }, 60);
  assert.ok(below > 10, `it did fall below the stall speed: ${below}`);
  assert.equal(offWhileBelow, 0);
  assert.equal(overStallLine, 0);
  assert.ok(recovered, 'and it flew out of it');
});

test('a failed Immelmann ends cleanly: it rolls upright and hands over instead of hanging at the top', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 130, redKias: 130, blueMove: 'immelmann', redMove: 'immelmann' });
  let endedAt = null;
  for (let i = 0; i < 60 / FIGHT_STEP_SEC && !endedAt; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (s.merged && s.blue.move !== 'immelmann') endedAt = { t: s.timeSec - s.mergeSec, inverted: s.blue.inverted, kias: s.blue.kias };
  }
  assert.ok(endedAt, 'the Immelmann ended');
  assert.ok(endedAt.t < 40, `${endedAt.t}`);
  assert.equal(endedAt.inverted, false, 'upright when it hands over');
  for (let i = 0; i < 60 / FIGHT_STEP_SEC; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
  assert.ok(s.blue.kias > s.setup.stallKias, `flying again: ${s.blue.kias}`);
});

test('OVER G at the 7 G boundary: just under it is no flag, just over is', () => {
  const at = (g) => {
    const s = createEnergyFight({ ...SOLO, blueKias: 250, redKias: 250, blueMove: 'pitchBack', redMove: 'pitchBack', blueForceG: g, turnsStart: 'now' });
    // The roll to 30° is done in 0.35 s; look just after it, before the MPT hand-over rolls again.
    for (let i = 0; i < 20; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
    assert.equal(s.blue.rolling, false);
    assert.equal(s.blue.stall, false);
    return s.blue;
  };
  assert.equal(at(6.99).overG, false);
  assert.equal(at(7).overG, false);
  assert.equal(at(7.01).overG, true);
});

test('OVER G while rolling is at 4.7 G: just under is no flag, just over is, and a trim is not a roll', () => {
  const rollingAt = (g) => {
    const s = createEnergyFight({ ...SOLO, blueKias: 250, redKias: 250, blueMove: 'pitchBack', redMove: 'pitchBack', blueForceG: g, turnsStart: 'now' });
    for (let i = 0; i < 5; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
    assert.equal(s.blue.rolling, true, 'the roll into the pitch back');
    return s.blue.overG;
  };
  assert.equal(rollingAt(4.69), false);
  assert.equal(rollingAt(4.71), true);
  // The constant-speed MPT trims bank by fractions of a degree; that is not rolling, so no flag at any G it pulls.
  const s = createEnergyFight({ ...SOLO, blueKias: 200, redKias: 200, blueMove: 'mpt', redMove: 'mpt', pullG: 5 });
  let rollingSteps = 0;
  for (let i = 0; i < 60 / FIGHT_STEP_SEC; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (s.merged && s.timeSec > s.mergeSec + 12 && s.blue.move === 'mpt' && s.blue.rolling) rollingSteps++;
  }
  assert.equal(rollingSteps, 0);
});

test('Auto at any merge speed from 90 to 316 KIAS never flags OVER G', () => {
  for (const kias of [90, 100, 120, 140, 160, 180, 200, 220, 230, 250, 280, 316]) {
    const s = createEnergyFight({ ...SOLO, blueKias: kias, redKias: kias });
    for (let i = 0; i < 120 / FIGHT_STEP_SEC; i++) {
      stepEnergyFight(s, FIGHT_STEP_SEC);
      assert.equal(s.blue.overG, false, `${kias} KIAS at t=${s.timeSec.toFixed(1)}: ${s.blue.overGReason}`);
    }
  }
});

test('a pitch back from over the SMM band (260 to 316 KIAS) reaches the MPT band and holds it: never under 155 KIAS once there, 1 or 2 circles', () => {
  for (const circles of [1, 2]) {
    for (const kias of [260, 280, 300, 308, 312, 316]) {
      let reached = false, low = Infinity, high = 0;
      watch({ ...SOLO, circles, blueKias: kias, redKias: kias, blueMove: 'pitchBack', redMove: 'pitchBack' }, (st) => {
        const a = st.blue;
        if (!reached && a.move === 'mpt' && Math.abs(a.kias - 160) <= 5) reached = true;
        if (reached && a.move !== 'levelMpt') { low = Math.min(low, a.kias); high = Math.max(high, a.kias); }
        return a.move !== 'levelMpt';
      }, 200);
      assert.ok(reached, `${kias} KIAS, ${circles} circle(s): reached the band`);
      assert.ok(low >= 155 && high <= 165, `${kias} KIAS, ${circles} circle(s): held ${low.toFixed(1)} to ${high.toFixed(1)} KIAS`);
    }
  }
});

test('the earlier handover follows the SMM pitch back band, not the Immelmann split: a 304 KIAS pitch back with the split moved to 316 still holds the band', () => {
  let reached = false, low = Infinity;
  watch({ ...SOLO, immelmannAboveKias: 316, blueKias: 304, redKias: 304, blueMove: 'pitchBack', redMove: 'pitchBack' }, (st) => {
    const a = st.blue;
    if (!reached && a.move === 'mpt' && Math.abs(a.kias - 160) <= 5) reached = true;
    if (reached && a.move !== 'levelMpt') low = Math.min(low, a.kias);
    return a.move !== 'levelMpt';
  }, 200);
  assert.ok(reached, 'reached the band');
  assert.ok(low >= 155, `held, lowest ${low.toFixed(1)} KIAS`);
});

test('a pitch back or slice reaches the MPT before 180° of turn, at every Auto merge speed it is picked for', () => {
  for (const kias of [130, 140, 150, 170, 180, 190, 200, 210, 220]) {
    const s = runUntil({ ...SOLO, blueKias: kias, redKias: kias }, (st) => st.blue.mptReached, 60);
    assert.ok(s.blue.mptReached, `${kias}`);
    assert.ok(s.blue.toMptDeg < 180, `${kias} KIAS took ${s.blue.toMptDeg.toFixed(0)}° of turn`);
  }
});

// Verification of #209, F2: over 220 KIAS the pitch back (Auto picks it when the Immelmann would be over the top under 120 KIAS,
// or loses the race; here it is forced) took 303 to 391° to reach the MPT against the spec's aim of under 180° (SMM 14.17 para 42),
// because the handover lead was a flat 6 s. The lead now grows with the entry speed, and both aims hold together: under 180° to
// reach the MPT, and 155 to 165 KIAS once there. Checked at 8,000 to 15,000 ft (the accurate range is up to 15,000 ft), 1 and 2 circles.
const OVER_220_ENTRIES = [221, 224, 228, 232, 236, 240, 245, 250, 256, 262, 268, 274, 280, 286, 292, 298, 304, 308, 312, 316];
for (const altFt of [10000, 8000, 12000, 15000]) {
  test(`a pitch back entered from 221 to 316 KIAS at ${altFt.toLocaleString('en-US')} ft reaches the MPT before 180° of turn and holds 155 to 165 KIAS once there, 1 or 2 circles`, () => {
    for (const circles of [1, 2]) {
      for (const kias of OVER_220_ENTRIES) {
        let reached = false, low = Infinity, high = 0, deg = null;
        watch({ ...SOLO, circles, blueAltFt: altFt, redAltFt: altFt, blueKias: kias, redKias: kias, blueMove: 'pitchBack', redMove: 'pitchBack' }, (st) => {
          const a = st.blue;
          if (!reached && a.move === 'mpt' && Math.abs(a.kias - 160) <= 5) reached = true;
          if (deg === null && a.mptReached) deg = a.toMptDeg;
          if (reached && a.move !== 'levelMpt') { low = Math.min(low, a.kias); high = Math.max(high, a.kias); }
          return a.move !== 'levelMpt';
        }, 200);
        const what = `${kias} KIAS, ${circles} circle(s)`;
        assert.ok(reached && deg !== null, `${what}: reached the MPT`);
        assert.ok(deg < 180, `${what}: took ${deg.toFixed(0)}° of turn to reach the MPT`);
        assert.ok(low >= 155 && high <= 165, `${what}: held ${low.toFixed(1)} to ${high.toFixed(1)} KIAS`);
      }
    }
  });
}

test('the move keeps its name until the speed is within 5 kt of the MPT speed, then reads MPT', () => {
  for (const kias of [140, 220]) {
    const s = createEnergyFight({ ...SOLO, blueKias: kias, redKias: kias });
    const first = s.blue.move;
    let flipped = null;
    for (let i = 0; i < 60 / FIGHT_STEP_SEC && !flipped; i++) {
      stepEnergyFight(s, FIGHT_STEP_SEC);
      if (s.blue.move !== first) flipped = { move: s.blue.move, kias: s.blue.kias, why: s.blue.why };
    }
    assert.equal(flipped.move, 'mpt');
    near(flipped.kias, 160, 5.01, `${kias} KIAS entry`);
    assert.equal(flipped.why, 'MPT 160 KIAS');
  }
});

test('a forced G is bounded: 0 to 12 G', () => {
  assert.throws(() => createEnergyFight({ blueForceG: 50 }), /blueForceG/);
  assert.throws(() => createEnergyFight({ redForceG: -1 }), /redForceG/);
  assert.doesNotThrow(() => createEnergyFight({ blueForceG: 12 }));
});

test('the Auto settings have bounds: the off-nose angle 0 to 180, the top speed 0 to VMO, the look-ahead 0 to 120 s', () => {
  assert.deepEqual([P.immelmannOffNoseDeg, P.immelmannMinTopKias, P.pickLookaheadSec, P.chaseAfterHeadOn], [120, 120, 60, false]);
  assert.throws(() => createEnergyFight({ immelmannOffNoseDeg: 181 }), /immelmannOffNoseDeg/);
  assert.throws(() => createEnergyFight({ immelmannOffNoseDeg: -1 }), /immelmannOffNoseDeg/);
  assert.throws(() => createEnergyFight({ immelmannMinTopKias: 400 }), /immelmannMinTopKias/);
  assert.throws(() => createEnergyFight({ immelmannMinTopKias: NaN }), /immelmannMinTopKias/);
  assert.throws(() => createEnergyFight({ pickLookaheadSec: 121 }), /pickLookaheadSec/);
  assert.throws(() => createEnergyFight({ pickLookaheadSec: -1 }), /pickLookaheadSec/);
  assert.doesNotThrow(() => createEnergyFight({ pickLookaheadSec: 0, immelmannMinTopKias: 0, immelmannOffNoseDeg: 180 }));
  // No look-ahead at all: the geometry alone, and the top speed gate still stands.
  const geometry = createEnergyFight({ blueKias: 250, redKias: 250, pickLookaheadSec: 0 });
  assert.match(geometry.blue.why, /^Immelmann: 250 KIAS, other aircraft \d+° off the nose, over the top at \d+ KIAS$/);
});

test('the pursuits a screen offers are Pure, Lead and Lag; "none" is for tests and is still accepted', () => {
  assert.deepEqual([...PURSUITS], ['pure', 'lead', 'lag']);
  assert.doesNotThrow(() => createEnergyFight({ pursuit: 'none' }));
  assert.throws(() => createEnergyFight({ pursuit: 'sideways' }), /pursuit/);
});

test('the slice reason says the SMM entry range, 100 to 160', () => {
  assert.equal(pickMove(140, 10000, ENERGY_DEFAULT_SETUP).why, 'Slice: 140 KIAS, SMM entry 100 to 160');
});

// ── Robustness ───────────────────────────────────────────────────────────────

test('no NaN or infinity straight up or down: pitch back, Immelmann and split S through the vertical', () => {
  for (const [move, kias] of [['pitchBack', 300], ['pitchBack', 250], ['immelmann', 300], ['immelmann', 310], ['splitS', 100], ['splitS', 200], ['slice', 100], ['mpt', 300], ['immelmann', 120]]) {
    const s = createEnergyFight({ blueKias: kias, redKias: kias, blueMove: move, redMove: move });
    let vertical = false;
    for (let i = 0; i < 90 / FIGHT_STEP_SEC; i++) {
      stepEnergyFight(s, FIGHT_STEP_SEC);
      if (Math.abs(s.blue.climbDeg) > 85) vertical = true;
      for (const [k, v] of [...numbersOf(s.blue, 'blue.'), ...numbersOf(s.red, 'red.'), ['range', s.rangeFt]]) {
        assert.ok(Number.isFinite(v), `${move} at ${kias}, t=${s.timeSec.toFixed(2)}: ${k} is ${v}`);
      }
    }
    if (move === 'immelmann' && kias >= 250) assert.ok(vertical, `${move} at ${kias} went through the vertical`);
    if (move === 'splitS' && kias === 200) assert.ok(vertical, 'split S went down through the vertical');
  }
});

test('a fight of all moves against all moves stays finite for the full ten minutes', () => {
  const s = createEnergyFight({ blueKias: 100, redKias: 250 });
  for (let i = 0; i < 40; i++) stepEnergyFight(s, 15);
  assert.equal(s.stopped, true);
  for (const [k, v] of [...numbersOf(s.blue, 'blue.'), ...numbersOf(s.red, 'red.')]) assert.ok(Number.isFinite(v), `${k}: ${v}`);
});

test('the state is plain data: it survives a JSON round trip and stepping the copy gives the same fight', () => {
  const a = runUntil({ blueKias: 200, redKias: 140 }, (st) => st.timeSec > 25, 30);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 200; i++) { stepEnergyFight(a, FIGHT_STEP_SEC); stepEnergyFight(b, FIGHT_STEP_SEC); }
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('the model is core\'s: nothing in the module works out its own drag, thrust or stall line', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../../../src/modules/turn-fight/energy-sim.js', import.meta.url), 'utf8');
  assert.match(src, /core\/t6-performance\.js/);
  assert.match(src, /core\/point-mass\.js/);
  assert.doesNotMatch(src, /isaDensityRatio|T6A_FIT|dragA|thrustK/);
});

// ── Second audit ─────────────────────────────────────────────────────────────

test('a head-on first nose-on is marked once but does not block a later pursuit from behind', () => {
  for (const setup of [{ blueKias: 300, redKias: 280 }, { circles: 1, redKias: 200 }]) {
    let first = null;
    const s = runUntil(setup, (st) => { if (st.firstNose && !first) first = { ...st.firstNose }; return st.chase; }, 400);
    assert.ok(first, `${JSON.stringify(setup)}: a first nose-on`);
    assert.ok(s.chase, `${JSON.stringify(setup)}: a chase began later`);
    assert.deepEqual(s.firstNose, first, 'first nose-on is recorded once and not rewritten');
    assert.ok(s.chase.timeSec > first.timeSec + 1, `the chase (+${(s.chase.timeSec - s.mergeSec).toFixed(1)} s) is after the first nose-on (+${(first.timeSec - s.mergeSec).toFixed(1)} s)`);
    assert.ok(s.chase.aaDeg <= 150, `${s.chase.aaDeg}`);
    assert.equal(s[s.chase.by].move, 'pursuit');
  }
  // The default head-on fight still never chases, for the whole ten minutes.
  const d = runUntil({}, () => false, 600);
  assert.equal(d.firstNose.by, 'both');
  assert.equal(d.chase, null);
});

test('with pursuit off a later nose-on changes nothing, and a chase never starts twice', () => {
  const off = runUntil({ blueKias: 300, redKias: 280, pursuit: 'none' }, () => false, 400);
  assert.equal(off.chase, null);
  const on = runUntil({ blueKias: 300, redKias: 280 }, (st) => st.chase, 400);
  const chase = { ...on.chase };
  for (let i = 0; i < 2000; i++) stepEnergyFight(on, FIGHT_STEP_SEC);
  assert.deepEqual(on.chase, chase);
});

/** The one nose-on rule: this aircraft's nose within 5° of the other, and the other seen from 150° or less (or chaseAfterHeadOn). From the public readouts. */
const noseOnRule = (st, who) => {
  const off = who === 'blue' ? st.ataBlueDeg : st.ataRedDeg;
  const otherOff = who === 'blue' ? st.ataRedDeg : st.ataBlueDeg;
  return off <= 5 && (st.setup.chaseAfterHeadOn || 180 - otherOff <= 150);
};

/** What the dry run should have predicted for `who` flying `move`: seconds from the merge to its chase opening, or null when the other gets there first, it goes OVER G or STALLs, or the look-ahead runs out. */
function realScore(setup, who, move) {
  const s = createEnergyFight({ ...setup, [`${who}Move`]: move });
  const other = who === 'blue' ? 'red' : 'blue';
  while (!s.merged) stepEnergyFight(s, FIGHT_STEP_SEC);
  const t0 = s.mergeSec;
  while (s.timeSec < t0 + s.setup.pickLookaheadSec - 1e-9) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (s[who].overG || s[who].stall) return null;
    const me = noseOnRule(s, who), you = noseOnRule(s, other);
    if (you && !me) return null;
    if (me) return s.timeSec - t0;
  }
  return null;
}

test('the dry run matches the real fight: with the other aircraft\'s move forced, each move\'s predicted time is the time the real fight gets there', () => {
  // Cases where at least one move scores; the pass comes before the turns in the first (the pass falls mid-step), at once in the others.
  const cases = [
    { blueKias: 300, redKias: 300, redMove: 'mpt', circles: 1 }, // 316 before the graded handover lead (F2): neither move scores from 316 any more
    { blueKias: 316, redKias: 316, redMove: 'pitchBack', turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 },
    { blueKias: 280, redKias: 250, redMove: 'immelmann', turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 },
    { blueKias: 250, redKias: 160, redMove: 'immelmann', turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 },
    { blueKias: 316, redKias: 316, redMove: 'pitchBack', turnsStart: 'now', separationNm: 0.7, ataDeg: 45, aaDeg: 30 },
    { blueKias: 250, redKias: 160, redMove: 'pitchBack', turnsStart: 'now', separationNm: 1.5, ataDeg: 120, aaDeg: 100, aaSide: 'right' },
    { blueKias: 280, redKias: 250, redMove: 'immelmann', turnsStart: 'now', separationNm: 1, ataDeg: 135, aaDeg: 20 },
    { blueKias: 316, redKias: 316, redMove: 'mpt', turnsStart: 'now', separationNm: 1, ataDeg: 135, aaDeg: 20 },
  ];
  let scored = 0, cut = 0;
  for (const setup of cases) {
    const predicted = createEnergyFight(setup).plan.blue.race;
    assert.ok(predicted, `${JSON.stringify(setup)}: a race was run`);
    assert.ok(predicted.immelmann !== null || predicted.pitchBack !== null, `${JSON.stringify(setup)}: at least one move scores`);
    for (const [move, other] of [['immelmann', 'pitchBack'], ['pitchBack', 'immelmann']]) {
      const real = realScore(setup, 'blue', move);
      const p = predicted[move];
      const what = `${JSON.stringify(setup)} ${move}`;
      if (p !== null) { near(p, real ?? Infinity, 0.005, what); scored++; }
      else if (predicted.later === move) {
        // Stopped at the other's time: the real run is later than it (or never), so it could not have won.
        cut++;
        assert.ok(real === null || real >= predicted[other] - 0.005, `${what}: stopped, real ${real}, the other ${predicted[other]}`);
      } else assert.equal(real, null, `${what}: predicted none`);
    }
  }
  assert.ok(scored >= 8 && cut >= 2, `the cases exercise scores (${scored}) and stops (${cut})`);
});

/**
 * Both aircraft Auto: flies the real fight to its first chase and returns, for each aircraft whose plan carries a race, what the plan
 * predicted for the move it picked and what the real fight did (seconds from the merge, null for no chase of its own).
 */
function autoVsAuto(setup) {
  const s = createEnergyFight(setup);
  const predicted = {};
  for (const who of ['blue', 'red']) if (s.plan[who].race) predicted[who] = s.plan[who].race[s.plan[who].move];
  while (!s.merged) stepEnergyFight(s, FIGHT_STEP_SEC);
  const t0 = s.mergeSec, real = { blue: null, red: null };
  while (s.timeSec < t0 + s.setup.pickLookaheadSec - 1e-9) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    const b = noseOnRule(s, 'blue'), r = noseOnRule(s, 'red');
    if (b || r) { if (b) real.blue = s.timeSec - t0; if (r) real.red = s.timeSec - t0; break; }
  }
  return { s, predicted, real };
}

test('both aircraft Auto: each aircraft\'s predicted time for the move it picked is what the real fight does, against the other\'s real plan', () => {
  const cases = [
    { blueKias: 260, redKias: 230 }, // Red's Immelmann is gated out (it would top at 112 KIAS), so Red flies a pitch back
    { blueKias: 316, redKias: 316 },
    { blueKias: 316, redKias: 250 },
    { blueKias: 316, redKias: 250, circles: 1 },
    { blueKias: 280, redKias: 250, turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 },
    { blueKias: 316, redKias: 316, turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 },
    { blueKias: 260, redKias: 230, turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 },
    { blueKias: 250, redKias: 250, turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 }, // Blue's pick was made against Red's first choice, and Red's own pick against Blue's last
    { blueKias: 250, redKias: 250, turnsStart: 'now', separationNm: 0.7, ataDeg: 45, aaDeg: 30 },
    { blueKias: 316, redKias: 316, turnsStart: 'now', separationNm: 1.5, ataDeg: 120, aaDeg: 100, aaSide: 'right' },
    { blueKias: 316, redKias: 250, turnsStart: 'now', separationNm: 1, ataDeg: 120, aaDeg: 60 },
    { blueKias: 250, redKias: 250, turnsStart: 'now', separationNm: 1, ataDeg: 120, aaDeg: 60 },
    { blueKias: 316, redKias: 316, turnsStart: 'now', separationNm: 1, ataDeg: 30, aaDeg: 120 },
    { blueKias: 316, redKias: 250, separationNm: 3, ataDeg: 20, aaDeg: 40 },
    { blueKias: 250, redKias: 250, separationNm: 3, ataDeg: 20, aaDeg: 40 },
  ];
  let scored = 0;
  for (const setup of cases) {
    const { predicted, real } = autoVsAuto(setup);
    for (const who of Object.keys(predicted)) {
      const p = predicted[who], r = real[who];
      const what = `${JSON.stringify(setup)} ${who}: predicted ${p}, real ${r}`;
      if (p === null) assert.equal(r, null, what); else { assert.notEqual(r, null, what); near(p, r, 0.05, what); scored++; }
    }
  }
  assert.ok(scored >= 10, `the cases include predictions that score (${scored})`);
});

test('both Auto: Red\'s gated Immelmann is not assumed in Blue\'s race, and a Red pick made before Blue\'s was final says so', () => {
  // Red at 230 KIAS flies a pitch back for real (its Immelmann tops at 112 KIAS, under the 120 gate), so Blue races against that.
  const a = createEnergyFight({ blueKias: 260, redKias: 230 });
  assert.equal(a.plan.red.move, 'pitchBack');
  assert.match(a.plan.red.why, /over the top at only 11\d KIAS/);
  // Both at 250 KIAS from 150° off and 150° aspect: Blue's Immelmann (35 s) is raced against Red's real plan. Red's own pick was made
  // against Blue's first choice; against Blue's last neither of its moves gets a nose-on, so it keeps its move and says that.
  const b = createEnergyFight({ blueKias: 250, redKias: 250, turnsStart: 'now', separationNm: 1, ataDeg: 150, aaDeg: 150 });
  assert.equal(b.plan.blue.move, 'immelmann');
  near(b.plan.blue.race.immelmann, 34.70, 0.05, 'Immelmann');
  assert.equal(b.plan.red.move, 'immelmann');
  assert.equal(b.plan.red.why, "Immelmann: 250 KIAS, picked before the other's move was final; against it now neither move gets a nose-on in 60 s");
  assert.deepEqual(b.plan.red.race, { immelmann: null, pitchBack: null });
});

test('a head-on pass is not a win in the race, and with chaseAfterHeadOn it is', () => {
  // The default head-on at 250 KIAS: both noses come on together at 175° aspect, which scores for nobody.
  const setup = { blueKias: 250, redKias: 250 };
  const r = createEnergyFight(setup).plan.blue.race;
  assert.deepEqual(r, { immelmann: null, pitchBack: null });
  for (const move of ['immelmann', 'pitchBack']) assert.equal(realScore(setup, 'blue', move), null, `${move}: the real fight scores none either`);
  // With chaseAfterHeadOn the head-on pass starts a chase, so it scores, as the real fight says.
  const on = { ...setup, chaseAfterHeadOn: true };
  const c = createEnergyFight(on).plan.blue.race;
  assert.ok(c.immelmann !== null || c.pitchBack !== null, 'scored with chaseAfterHeadOn');
  for (const move of ['immelmann', 'pitchBack']) {
    const real = realScore(on, 'blue', move);
    if (c[move] !== null) near(c[move], real, 0.005, move);
  }
});

test('the other aircraft getting its chase started first is a loss, not a win', () => {
  // Blue 316 against a pitching-back Red 316, from 1.5 NM. In a pitch back Blue's nose does come on, at 29.4 s, but Red's came on at 27.0 s
  // with Blue in front of it: Red chases first, so the pitch back scores nothing. The Immelmann gets there (32.5 s) with Red never on.
  // (30.2 and 26.8 s before the handover lead grew with the entry speed, verification F2.)
  const setup = { blueKias: 316, redKias: 316, redMove: 'pitchBack', turnsStart: 'now', separationNm: 1.5, ataDeg: 120, aaDeg: 100, aaSide: 'right' };
  const nose = (move) => {
    const f = createEnergyFight({ ...setup, blueMove: move, pursuit: 'none' });
    let blue = null, red = null;
    while (f.timeSec < 60) {
      stepEnergyFight(f, FIGHT_STEP_SEC);
      if (blue === null && f.ataBlueDeg <= 5) blue = f.timeSec;
      if (red === null && f.ataRedDeg <= 5) red = f.timeSec;
    }
    return { blue, red };
  };
  const pb = nose('pitchBack');
  assert.ok(pb.red < 28 && pb.blue > pb.red + 2, `Blue's nose-on ${pb.blue}, Red's ${pb.red}`);
  const r = createEnergyFight(setup).plan.blue.race;
  assert.equal(r.pitchBack, null, 'the pitch back lost the race to Red\'s chase');
  near(r.immelmann, 32.52, 0.05, 'Immelmann');
  assert.equal(realScore(setup, 'blue', 'pitchBack'), null);
  assert.equal(createEnergyFight(setup).blue.move, 'immelmann');
});

test('a run where this aircraft goes OVER G or STALLs loses, however soon its nose comes on', () => {
  const base = { blueKias: 316, redKias: 316, redMove: 'pitchBack', turnsStart: 'now', separationNm: 0.7, ataDeg: 45, aaDeg: 30 };
  const free = createEnergyFight(base).plan.blue.race;
  assert.ok(free.immelmann !== null, 'the Immelmann scores when flown as normal');
  // A forced 9 G is over +7 G or past the stall line from the first step, in every run: no move wins.
  const forced = createEnergyFight({ ...base, blueForceG: 9 }).plan.blue.race;
  assert.deepEqual(forced, { immelmann: null, pitchBack: null });
});

test('the pre-merge look-ahead leaves the state as a plain fight: no copies, no dry-run markers, before or after the merge', () => {
  const keys = ['aaDeg', 'ataBlueDeg', 'ataRedDeg', 'blue', 'carrySec', 'chase', 'evenFight', 'firstNose', 'headingCrossDeg', 'mergeSec', 'merged', 'plan', 'rangeFt', 'red', 'setup', 'stopped', 'timeSec'];
  const s = createEnergyFight({ blueKias: 316, redKias: 316 });
  assert.deepEqual(Object.keys(s).sort(), keys);
  assert.ok(s.plan.blue.race && s.plan.red.race, 'the races ran from T+0');
  const m = runUntil({ blueKias: 316, redKias: 316 }, (st) => st.merged);
  assert.deepEqual(Object.keys(m).sort(), keys);
  assert.deepEqual(m.plan, s.plan, 'the plan made at T+0 is the plan the turns start from');
  assert.equal(m.blue.why, s.blue.why);
  assert.equal(m.red.why, s.red.why);
});

test('lookAheadPick before the pass is the plan the turns will start from', () => {
  const s = createEnergyFight({ blueKias: 250, redKias: 250 });
  assert.deepEqual(lookAheadPick(s, 'blue'), s.plan.blue);
  assert.deepEqual(lookAheadPick(s, 'red'), s.plan.red);
});

// ── Auto near the deck ──

test('below the MPT band and within 1,000 ft of the deck Auto picks the MPT, which becomes the level MPT at the deck', () => {
  const p = ENERGY_DEFAULT_SETUP;
  assert.equal(p.deckMarginFt, 1000);
  for (const [kias, altFt] of [[60, 6100], [100, 6500], [119, 6999], [120, 6000], [140, 6999], [154, 6500]]) {
    const r = pickMove(kias, altFt, p);
    assert.equal(r.move, 'mpt', `${kias} KIAS at ${altFt} ft`);
    assert.match(r.why, /level MPT at the 6,000 ft deck/i);
    assert.match(r.why, /under 1,000 ft above/i);
  }
  // At 1,000 ft above the deck, or in the MPT band, or above it, the table stands.
  assert.equal(pickMove(140, 7000, p).move, 'slice');
  assert.equal(pickMove(100, 9000, p).move, 'splitS');
  assert.equal(pickMove(200, 6100, p).move, 'pitchBack');
  assert.match(pickMove(160, 6100, p).why, /^MPT straight away/);
  assert.equal(pickMove(140, 6500, { ...p, deckMarginFt: 400 }).move, 'slice', 'the margin is a setting');
  assert.throws(() => createEnergyFight({ deckMarginFt: -1 }), /deckMarginFt/);
  assert.throws(() => createEnergyFight({ deckMarginFt: 20000 }), /deckMarginFt/);
});

test('Auto from at or near the deck never goes more than 20 ft under it: starts at 6,000, 6,500 and 7,000 ft, 80 to 140 KIAS', () => {
  // Starts well under the stall speed (86 KIAS) are left out, on purpose: the jet cannot hold a level turn there, STALL is on, and it
  // sinks (from 6,000 ft, about 160 ft at 60 KIAS and 400 ft at 40). 80 KIAS, just under it, still holds the deck within 20 ft.
  for (const altFt of [6000, 6500, 7000]) {
    for (const kias of [80, 90, 100, 110, 120, 130, 140]) {
      let minAlt = Infinity;
      watch({ ...SOLO, turnsStart: 'now', blueKias: kias, redKias: 160, blueAltFt: altFt, redAltFt: 10000, ataDeg: 90, aaDeg: 90, separationNm: 3 }, (st) => { minAlt = Math.min(minAlt, st.blue.altFt); return st.timeSec < 60; }, 60);
      assert.ok(minAlt >= 6000 - 20, `${kias} KIAS from ${altFt} ft: lowest ${minAlt.toFixed(0)} ft`);
    }
  }
});

test('the deckMarginFt default and bound', () => {
  assert.equal(ENERGY_DEFAULT_SETUP.deckMarginFt, 1000);
  assert.doesNotThrow(() => createEnergyFight({ deckMarginFt: 0 }));
});

// ── The level MPT and the one rolling rule ──

test('the level MPT follows the one rolling rule: a slice from 300 KIAS at 7,000 ft gives no OVER G', () => {
  let over = 0, level = 0;
  watch({ ...SOLO, blueKias: 300, redKias: 300, blueAltFt: 7000, redAltFt: 7000, blueMove: 'slice', redMove: 'slice' }, (st) => {
    if (st.blue.overG) over++;
    if (st.blue.move === 'levelMpt') level++;
    return st.timeSec < 120;
  }, 120);
  assert.ok(level > 100, `it reached the level MPT: ${level}`);
  assert.equal(over, 0, `OVER G for ${over} steps`);
});

// ── Pursuit and the deck after a close overshoot ──

test('a chaser that overshoots at the deck at 316 KIAS does not dip under it', () => {
  let minAlt = Infinity, chasing = 0;
  watch({ blueAltFt: 6000, redAltFt: 6000, blueKias: 316, redKias: 160, turnsStart: 'now', ataDeg: 0, aaDeg: 0, separationNm: 2 }, (st) => {
    minAlt = Math.min(minAlt, st.blue.altFt, st.red.altFt);
    if (st.blue.move === 'pursuit') chasing++;
    return st.timeSec < 180;
  }, 180);
  assert.ok(chasing > 0, 'a chase');
  assert.ok(minAlt >= 6000 - 20, `lowest ${minAlt.toFixed(0)} ft`);
});

test('the VMO guard works: a chaser dived at a low, slow target from 25,000 ft stays under VMO, having used the guard', () => {
  // Without the guard (vmoMarginKias at -1000) this same dive peaks at 321 KIAS, past VMO (316); with it, 283.
  let maxKias = 0, chasing = 0;
  watch({ pursuit: 'pure', blueAltFt: 25000, redAltFt: 6000, blueKias: 250, redKias: 140, blueMove: 'mpt', redMove: 'mpt', turnsStart: 'now', ataDeg: 0, aaDeg: 0, separationNm: 30 }, (st) => {
    if (st.blue.move === 'pursuit') { chasing++; maxKias = Math.max(maxKias, st.blue.kias); }
    return st.timeSec < 400;
  }, 400);
  assert.ok(chasing > 1000, `a long chase: ${chasing} steps`);
  assert.ok(maxKias > T6A_LIMITS.vmoKias - 40, `the dive reached the guard speed (${maxKias.toFixed(0)} KIAS)`);
  assert.ok(maxKias <= T6A_LIMITS.vmoKias, `${maxKias.toFixed(0)} KIAS against VMO ${T6A_LIMITS.vmoKias}`);
});

// ── The SMM bands in the reason ──

test('an Immelmann outside the SMM band (200 to 250 KIAS) or a pitch back outside 160 to 220 says so', () => {
  const look = (imm, pb, off = 170) => ({ offNoseDeg: off, topKias: 140, noseOnSec: { immelmann: imm, pitchBack: pb } });
  assert.doesNotMatch(pickMove(245, 10000, P, look(24, 31)).why, /SMM band/, 'an Immelmann at 245 is in its band');
  assert.match(pickMove(245, 10000, P, look(40, 31)).why, /^Pitch back: nose on in about 31 s vs 40 s for an Immelmann, outside the SMM band \(160 to 220 KIAS\)$/);
  assert.match(pickMove(260, 10000, P, look(24, 31)).why, /^Immelmann: nose on in about 24 s vs 31 s for a pitch back, outside the SMM band \(200 to 250 KIAS\)$/);
  // The geometry fallback and the gate say it too.
  assert.match(pickMove(300, 10000, P, look(null, null)).why, /outside the SMM band \(200 to 250 KIAS\)$/);
  assert.match(pickMove(300, 10000, { ...P, immelmannMinTopKias: 200 }, look(10, 50)).why, /outside the SMM band \(160 to 220 KIAS\)$/);
});

test('on a tie the move whose SMM band holds the entry speed wins; the pitch back only if both or neither do', () => {
  const tie = { offNoseDeg: 170, topKias: 140, noseOnSec: { immelmann: 30, pitchBack: 30 } };
  assert.equal(pickMove(240, 10000, P, tie).move, 'immelmann', '240 is in the Immelmann band only');
  assert.equal(pickMove(210, 10000, P, tie).move, 'pitchBack', '210 is in both');
  assert.equal(pickMove(300, 10000, P, tie).move, 'pitchBack', '300 is in neither');
  assert.equal(pickMove(240, 10000, P, { ...tie, noseOnSec: { immelmann: 31, pitchBack: 30 } }).move, 'pitchBack', 'only a tie goes by the band');
});

test('when the nose is already on at the pick the reason says so, not "about 0 s vs 0 s"', () => {
  const r = pickMove(245, 10000, P, { offNoseDeg: 3, topKias: 140, noseOnSec: { immelmann: 0, pitchBack: 0 } });
  assert.doesNotMatch(r.why, /about 0 s|0 s vs 0 s/);
  assert.match(r.why, /nose already on/i);
});

// ── Verification of #209, F1: a slow forced slice from high up (verification/turn-fight-energy-209.md) ──

test('a slow forced slice (40 to 90 KIAS) from 15,000 to 25,000 ft does not dive for good: above the deck, under the speed limit and never NaN for 200 s, and once the MPT has the nose low near the vertical the bank comes to 90° or less', () => {
  const fights = [];
  for (const altFt of [15000, 20000, 25000]) for (const kias of [40, 60, 86, 90]) fights.push({ blueAltFt: altFt, redAltFt: altFt, blueKias: kias, redKias: kias });
  // Two from the verification's own sweep: the MPT speed and the deck set higher.
  fights.push({ blueKias: 92, redKias: 92, blueAltFt: 22300, redAltFt: 22300, mptKias: 175, hardDeckFt: 7500 });
  fights.push({ blueKias: 70, redKias: 70, blueAltFt: 14000, redAltFt: 14000, mptKias: 175 });
  // The audit's two: the nose passes exactly through the vertical (the gate once stopped at 0.9995 of it, and the dive held).
  fights.push({ blueKias: 46, redKias: 46, blueAltFt: 17000, redAltFt: 17000, mptKias: 175 });
  fights.push({ blueKias: 80, redKias: 80, blueAltFt: 15000, redAltFt: 15000, mptKias: 175 });
  for (const setup of fights) {
    const s = createEnergyFight({ ...SOLO, blueMove: 'slice', redMove: 'slice', ...setup });
    let minAlt = Infinity, maxOver = -Infinity, maxKias = 0, lowSec = 0, worstBank = 0;
    for (let i = 0; i < 200 / FIGHT_STEP_SEC; i++) {
      stepEnergyFight(s, FIGHT_STEP_SEC);
      for (const a of [s.blue, s.red]) {
        assert.ok(Number.isFinite(a.kias) && Number.isFinite(a.altFt) && Number.isFinite(a.bankDeg) && Number.isFinite(a.g), `finite at ${s.timeSec.toFixed(2)} s`);
        minAlt = Math.min(minAlt, a.altFt); maxKias = Math.max(maxKias, a.kias);
        maxOver = Math.max(maxOver, a.kias - nfmTopKias(a.altFt)); // over the NFM line at its height
      }
      // Handed to the MPT with the nose within 15° of straight down: the bank rolls to 90° or less within 2 s (at 90°/s from 135°) and stays.
      if (s.blue.ctl.mode === 'mpt' && s.blue.climbDeg < -75) { lowSec += FIGHT_STEP_SEC; if (lowSec > 2) worstBank = Math.max(worstBank, Math.abs(s.blue.bankDeg)); } else lowSec = 0;
    }
    const what = `${JSON.stringify(setup)}: lowest ${minAlt.toFixed(0)} ft, fastest ${maxKias.toFixed(0)} KIAS`;
    assert.ok(minAlt >= s.setup.hardDeckFt - 500, what);
    assert.ok(maxOver <= CHART_READ_KIAS, `${what}, ${maxOver.toFixed(0)} over the NFM limit`);
    assert.ok(worstBank <= 91, `${what}: bank ${worstBank.toFixed(0)}° with the nose low near the vertical`);
  }
});

// ── Verification of #209, F3 to F8 (verification/turn-fight-energy-209.md) ──

test('F3: below the stall speed STALL reads from T+0, before the pass, and not at or over it', () => {
  const s = createEnergyFight({ blueKias: 70, redKias: 100 });
  assert.equal(s.blue.stall, true, 'at T+0');
  assert.equal(s.blue.stallReason, '70.0 KIAS is below the 86 KIAS stall speed');
  assert.equal(s.blue.stallEver, true);
  assert.equal(s.red.stall, false);
  assert.equal(s.red.stallReason, '');
  for (let i = 0; i < 5; i++) stepEnergyFight(s, FIGHT_STEP_SEC);
  assert.equal(s.merged, false, 'still before the pass');
  assert.equal(s.blue.stall, true);
  assert.equal(s.blue.stallReason, '70.0 KIAS is below the 86 KIAS stall speed');
  assert.equal(s.red.stall, false);
  // The stall speed is a setting: at 60 the 70 KIAS jet is fine.
  assert.equal(createEnergyFight({ blueKias: 70, redKias: 100, stallKias: 60 }).blue.stall, false);
});

test('F4: the result can say "even fight": evenFight is set once both noses came on together and nobody has got behind the other', () => {
  const s = createEnergyFight();
  assert.equal(s.evenFight, false, 'not before a nose-on');
  const done = runUntil({}, (st) => st.stopped, FIGHT_MAX_SEC + 5);
  assert.equal(done.firstNose.by, 'both');
  assert.equal(done.chase, null);
  assert.equal(done.evenFight, true, 'the default mirror fight ends even');
  // Not even when one gets behind the other, or when a chase starts.
  const unequal = runUntil({ redKias: 180 }, (st) => st.chase && st.timeSec > st.chase.timeSec + 5, 400);
  assert.ok(unequal.chase);
  assert.equal(unequal.evenFight, false);
  // Not even with pursuit off before either is on? A first nose-on by both with no pursuit is still an even fight.
  const noChase = runUntil({ pursuit: 'none' }, (st) => st.firstNose, 200);
  assert.equal(noChase.evenFight, true);
});

test('F5: the stall reason never reads the same number twice ("needs 5.5 G; gives 5.5 G")', () => {
  let seen = 0;
  for (const kias of [190, 202, 210, 220]) {
    for (const forceG of [4.9, 5.0, 5.4, 5.5, 5.6, 6.0, 6.5, 7.0, 7.4]) {
      const s = createEnergyFight({ ...SOLO, blueKias: kias, redKias: kias, blueMove: 'pitchBack', redMove: 'pitchBack', blueForceG: forceG, turnsStart: 'now' });
      for (let i = 0; i < 40; i++) {
        stepEnergyFight(s, FIGHT_STEP_SEC);
        const m = /needs ([\d.]+) G; the stall line at \d+ KIAS gives ([\d.]+) G/.exec(s.blue.stallReason);
        if (m) { seen++; assert.notEqual(m[1], m[2], `${kias} KIAS, ${forceG} G: "${s.blue.stallReason}"`); }
      }
    }
  }
  assert.ok(seen > 20, `${seen} stall reasons read`);
  // Where the two round the same at one decimal (4.9 G against a stall line of 4.88 G at 190 KIAS), a second decimal tells them apart.
  const s2 = createEnergyFight({ ...SOLO, blueKias: 190, redKias: 190, blueMove: 'pitchBack', redMove: 'pitchBack', blueForceG: 4.9, turnsStart: 'now' });
  for (let i = 0; i < 5; i++) stepEnergyFight(s2, FIGHT_STEP_SEC);
  assert.match(s2.blue.stallReason, /^The pull needs 4\.90 G; the stall line at 190 KIAS gives 4\.88 G$/);
});

test('F7: the pick reason never rounds a speed onto the boundary it is compared with ("120 KIAS, below 120")', () => {
  assert.match(pickMove(119.9, 10000).why, /^Split S: 119\.9 KIAS, below 120$/);
  assert.match(pickMove(220.1, 10000).why, /^Immelmann: 220\.1 KIAS, above 220$/);
  assert.match(pickMove(219.9, 10000).why, /^Pitch back: 219\.9 KIAS, SMM entry 160 to 220$/);
  assert.match(pickMove(154.9, 10000).why, /^Slice: 154\.9 KIAS/);
  assert.match(pickMove(119.96, 10000).why, /^Split S: 119\.96 KIAS, below 120$/);
  // Whole speeds, and speeds that do not round onto a boundary, read as before.
  assert.match(pickMove(120, 10000).why, /^Slice: 120 KIAS/);
  assert.match(pickMove(119, 10000).why, /^Split S: 119 KIAS, below 120$/);
  assert.match(pickMove(140.4, 10000).why, /^Slice: 140 KIAS/);
  assert.match(pickMove(221, 10000).why, /^Immelmann: 221 KIAS, above 220$/);
});

test('F6: 8 G forced at 240 KIAS flags OVER G as well as STALL (the instant the pull is made)', () => {
  const s = createEnergyFight({ ...SOLO, blueKias: 240, redKias: 240, blueMove: 'mpt', redMove: 'mpt', blueForceG: 8, turnsStart: 'now' });
  let stallStep = null, overGAtStall = null;
  for (let i = 0; i < 100 && stallStep === null; i++) {
    stepEnergyFight(s, FIGHT_STEP_SEC);
    if (s.blue.stall) { stallStep = i; overGAtStall = s.blue.overG; }
  }
  assert.ok(stallStep !== null, 'STALL came on');
  assert.equal(overGAtStall, true, 'OVER G on the step the 8 G pull stalled it');
  assert.equal(s.blue.overGEver, true);
  assert.match(s.blue.overGReason, /8\.0 G is above \+7 G/);
  // The turn is still lost: the G drops to 1 G while STALL is on.
  near(s.blue.g, 1, 1e-9, 'STALL still takes the turn');
});

test('F8: the MPT speed has a range, 120 to 175 KIAS', () => {
  assert.throws(() => createEnergyFight({ mptKias: 119 }), /mptKias is from 120 to 175 KIAS, got 119/);
  assert.throws(() => createEnergyFight({ mptKias: 176 }), /mptKias is from 120 to 175 KIAS, got 176/);
  assert.throws(() => createEnergyFight({ mptKias: 200 }), /mptKias/);
  assert.throws(() => createEnergyFight({ mptKias: NaN }), /mptKias/);
  assert.doesNotThrow(() => createEnergyFight({ mptKias: 120 }));
  assert.doesNotThrow(() => createEnergyFight({ mptKias: 175 }));
});

test('F8: at the top of the range (175 KIAS) flown from 7,000 ft, the level MPT stays within 20 ft of the 6,000 ft deck, from every merge speed', () => {
  for (const kias of [100, 120, 140, 160, 175, 200, 220]) {
    const s = createEnergyFight({ ...SOLO, mptKias: 175, blueAltFt: 7000, redAltFt: 7000, blueKias: kias, redKias: kias });
    let minAlt = Infinity;
    for (let i = 0; i < FIGHT_MAX_SEC / FIGHT_STEP_SEC; i++) { stepEnergyFight(s, FIGHT_STEP_SEC); minAlt = Math.min(minAlt, s.blue.altFt, s.red.altFt); }
    assert.ok(minAlt >= 6000 - 20, `${kias} KIAS: lowest ${minAlt.toFixed(0)} ft against the 6,000 ft deck`);
  }
});
