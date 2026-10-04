// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

// The Turn Sim's training errors for #2 (docs/modules/turn-sim/decisions.md TS-52): an error is
// an offset on #2's start (ahead or behind the 3/9 line, wide or tight, high or low) or a roll-in
// that is early or late, and #2 then either turns at the normal reference (the error carries
// through and the end picture shows it) or fixes it as far as is flyable at constant speed.
// End pictures only, no time gates. Expected pictures come from the SMM figures (16.15-16.21) and
// from plain geometry (two aircraft flying the same turn keep their offset), never from the
// code's own output. Margins are the shared table's (±100 ft) unless a check says why.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { ERROR_DEFAULTS, ERROR_ALLOWED, FIX_LIMITS, resolveErrors, describeErrors, errorCardLines } from '../../../src/modules/turn-sim/live/errors.js';
import { ROLL, STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';
import { gFromBankDeg, turnRateFromBankRadPerSec } from '../../../src/core/flight-math.js';
import { iasToTasKt } from '../../../src/core/t6-performance.js';
import { KT_TO_FTPS } from '../../../src/core/units.js';

const SPACING_FT = 6000;
const MARGIN_FT = 100; // shared table
const DEG = Math.PI / 180;
/** No manoeuvre takes this long; it only stops a broken plan from running for ever. */
const SAFETY_STEPS = 40000;
/** The defaults' own amounts, written out so the test reads without the settings file. */
const AHEAD = { errFore: 'ahead', errForeFt: 1200 };
const BEHIND = { errFore: 'behind', errForeFt: 1200 };
const WIDE = { errSpacing: 'wide', errSpacingFt: 1500 };
const TIGHT = { errSpacing: 'tight', errSpacingFt: 1500 };
const LATE = { errTiming: 'late', errTimingSec: 2 };
const EARLY = { errTiming: 'early', errTimingSec: 2 };
const HIGH = { errHeight: 'high', errHeightFt: 500 };
const LOW = { errHeight: 'low', errHeightFt: 500 };
const REFERENCE = { errResponse: 'reference' };
const FIX = { errResponse: 'fix' };

/** True airspeed at the block height, from the shared helper (220 KIAS at 8,000 ft, TS-38). */
const TAS_FTPS = iasToTasKt(220, 8000) * KT_TO_FTPS;

/** How far each manoeuvre turns Lead (degrees, left positive per unit of dir): the SMM's own numbers. */
const TURN_DEG = { delayed90: 90, delayed45: 45, check: 20, inPlace90: 90, hook: 180, shackle: 0, crossTurn: 180 };
const CASES = [['delayed90', 1], ['delayed90', -1], ['delayed45', 1], ['delayed45', -1], ['check', 1], ['check', -1], ['inPlace90', 1], ['inPlace90', -1], ['hook', 1], ['hook', -1], ['shackle', 0], ['crossTurn', 0]];
/** How far Lead's heading turns in the manoeuvre (radians, left positive): the cross turn has no direction button but turns 180°. */
const turnRad = (key, dir) => (key === 'crossTurn' ? Math.PI : TURN_DEG[key] * dir * DEG);
const SIDES = ['right', 'left'];
const sideSign = (wingSide) => (wingSide === 'left' ? 1 : -1);

/** Flies every step until nothing is being flown, calling each(before, after) on every step. */
function fly(f, each = () => {}) {
  let before = f.state.aircraft.map((a) => ({ ...a }));
  for (let i = 0; i < SAFETY_STEPS && (f.state.current || f.state.queued); i++) {
    f.step();
    const after = f.state.aircraft.map((a) => ({ ...a }));
    each(before, after);
    before = after;
  }
  assert.equal(f.state.current, null, 'the manoeuvre finished');
}

/** A formation with the given options, one press flown to the end. */
function flown(options, key, dir) {
  const f = createFormation(options);
  f.press(key, dir);
  fly(f);
  return { f, rel: relativeTo(...f.state.aircraft) };
}

/**
 * Where #2 should be in Lead's frame after each manoeuvre, from the SMM figures (side +1: #2 on Lead's left).
 * Delayed turns, shackle: abeam, sides swapped (Figs 16.15, 16.16, 16.20). Hook: abeam, same ground side, which is
 * Lead's other hand after the 180 (Fig 16.19). Cross turn: abeam on the other ground side (Fig 16.21), which
 * after the 180 is the same hand of Lead. Check and in-place: the line between them turns with them (Fig 16.18).
 */
function smmPicture(key, dir, side) {
  const theta = turnRad(key, dir);
  if (key === 'delayed90' || key === 'delayed45' || key === 'shackle' || key === 'hook') return { fwd: 0, left: -side * SPACING_FT };
  if (key === 'crossTurn') return { fwd: 0, left: side * SPACING_FT };
  return { fwd: side * SPACING_FT * Math.sin(theta), left: side * SPACING_FT * Math.cos(theta) };
}

/**
 * Two aircraft flying the same turn keep their offset in space, so an offset (feet ahead, feet to Lead's left)
 * at the start is the same offset at the end, seen from Lead's new heading (turned by theta).
 */
function offsetAfterTurn(offset, theta) {
  return { fwd: offset.fwd * Math.cos(theta) + offset.left * Math.sin(theta), left: -offset.fwd * Math.sin(theta) + offset.left * Math.cos(theta) };
}

const distance = (rel, picture) => Math.hypot(rel.fwd - picture.fwd, rel.left - picture.left);

// ---- errors off: nothing changes -----------------------------------------------------------------------

test('with every error at None, nothing changes: no error, no card line, the same flight step for step', () => {
  assert.equal(resolveErrors(ERROR_DEFAULTS), null);
  assert.equal(resolveErrors({}), null);
  assert.equal(resolveErrors({ errFore: 'none', errForeFt: 5000, errSpacing: 'none', errHeight: 'none', errTiming: 'none' }), null, 'an amount alone is not an error');
  for (const [key, dir] of [['delayed90', 1], ['hook', -1], ['shackle', 0]]) {
    const plain = createFormation();
    const withDefaults = createFormation({ ...ERROR_DEFAULTS, errResponse: 'reference', errRandom: false });
    assert.equal(plain.state.errors, null);
    assert.equal(errorCardLines(plain.state), null);
    plain.press(key, dir);
    withDefaults.press(key, dir);
    for (let i = 0; i < 1500 && (plain.state.current || withDefaults.state.current); i++) {
      plain.step();
      withDefaults.step();
      assert.deepEqual(withDefaults.state.aircraft, plain.state.aircraft, `${key}: step ${i}`);
    }
    assert.equal(plain.state.current, null);
    assert.equal(errorCardLines(plain.state), null);
    assert.equal(plain.state.errorOutcome, null);
  }
});

test('the settings turn into one error: ahead and wide count plus, behind and tight minus', () => {
  const e = resolveErrors({ ...AHEAD, ...TIGHT, ...HIGH, ...EARLY, ...FIX });
  assert.deepEqual({ ...e }, { foreFt: 1200, spacingFt: -1500, heightFt: 500, timingSec: -2, response: 'fix', random: false });
  assert.deepEqual(Object.keys(ERROR_ALLOWED).sort(), ['errFore', 'errHeight', 'errResponse', 'errSpacing', 'errTiming']);
  assert.equal(ERROR_DEFAULTS.errResponse, 'fix', 'Fix it is the default response (TS-52)');
  assert.match(describeErrors(e), /ahead of the 3\/9 line 1,200 ft.*tight 1,500 ft.*500 ft high.*2 s early/);
});

// ---- where each error starts #2 -----------------------------------------------------------------------------

test('each position error starts #2 where it says, on either side of Lead (wide is away from Lead on his own side)', () => {
  for (const wingSide of SIDES) {
    const side = sideSign(wingSide);
    const start = (e) => {
      const f = createFormation({ wingSide, ...e });
      const [lead, wing] = f.state.aircraft;
      assert.deepEqual([lead.xFt, lead.yFt, lead.altAboveFt], [0, 0, 0], 'Lead is never moved');
      return { rel: relativeTo(lead, wing), alt: wing.altAboveFt };
    };
    assert.ok(Math.abs(start(AHEAD).rel.fwd - 1200) < 1, 'ahead puts #2 ahead of the 3/9 line');
    assert.ok(Math.abs(start(BEHIND).rel.fwd + 1200) < 1, 'behind puts him behind it');
    assert.ok(Math.abs(start(WIDE).rel.left - side * (SPACING_FT + 1500)) < 1, `wide, #2 on the ${wingSide}: farther from Lead on his own side`);
    assert.ok(Math.abs(start(TIGHT).rel.left - side * (SPACING_FT - 1500)) < 1, `tight, #2 on the ${wingSide}: nearer Lead on his own side`);
    assert.equal(start(HIGH).alt, 500);
    assert.equal(start(LOW).alt, -500);
    assert.ok(Math.abs(start({}).rel.fwd) < 1 && Math.abs(Math.abs(start({}).rel.left) - SPACING_FT) < 1, 'no error: abeam at the set spacing');
  }
  const f = createFormation({ spacingFt: 2000, errSpacing: 'tight', errSpacingFt: 3000 });
  assert.ok(Math.abs(relativeTo(...f.state.aircraft).left) >= 1000 - 1, 'tight never puts #2 closer than the smallest spacing the sim flies (1,000 ft)');
});

// ---- Turn at normal reference: the error carries through ----------------------------------------------------------

test('Turn at normal reference: a position error is still there at the end, turned with the formation (±100 ft)', () => {
  const offsets = [
    [AHEAD, (side) => ({ fwd: 1200, left: 0 })],
    [BEHIND, (side) => ({ fwd: -1200, left: 0 })],
    [WIDE, (side) => ({ fwd: 0, left: side * 1500 })],
    [TIGHT, (side) => ({ fwd: 0, left: -side * 1500 })],
  ];
  for (const wingSide of SIDES) {
    const side = sideSign(wingSide);
    for (const [key, dir] of CASES) {
      for (const [error, offset] of offsets) {
        const { rel } = flown({ wingSide, ...error, ...REFERENCE }, key, dir);
        const picture = smmPicture(key, dir, side);
        const carried = offsetAfterTurn(offset(side), turnRad(key, dir));
        const expected = { fwd: picture.fwd + carried.fwd, left: picture.left + carried.left };
        assert.ok(distance(rel, expected) <= MARGIN_FT, `${key} ${dir}, #2 on the ${wingSide}, ${JSON.stringify(error)}: ${distance(rel, expected).toFixed(0)} ft from the carried error`);
        assert.ok(distance(rel, picture) >= 1000, `${key} ${dir}: the error shows at the end (${distance(rel, picture).toFixed(0)} ft from the SMM picture)`);
      }
    }
  }
});

test('Turn at normal reference: a roll-in that is late or early moves #2 by speed x seconds x the chord of the turn (±100 ft)', () => {
  // Rolling in N seconds late flies the same turn N seconds later: #2 ends V x N x (u0 - u1) from where he should be
  // (u0 and u1 the old and new heading of the formation). Early is the same with N negative.
  for (const wingSide of SIDES) {
    const side = sideSign(wingSide);
    for (const [key, dir] of CASES.filter(([k]) => k !== 'shackle' && k !== 'crossTurn')) {
      for (const [error, seconds] of [[LATE, 2], [EARLY, -2]]) {
        const theta = turnRad(key, dir);
        const offset = { fwd: seconds * TAS_FTPS * (1 - Math.cos(theta)), left: -seconds * TAS_FTPS * Math.sin(theta) };
        const carried = offsetAfterTurn(offset, theta);
        const picture = smmPicture(key, dir, side);
        const { rel } = flown({ wingSide, ...error, ...REFERENCE }, key, dir);
        const expected = { fwd: picture.fwd + carried.fwd, left: picture.left + carried.left };
        assert.ok(distance(rel, expected) <= MARGIN_FT, `${key} ${dir}, #2 on the ${wingSide}, ${seconds} s: ${distance(rel, expected).toFixed(0)} ft from the geometry`);
      }
    }
  }
});

test('Turn at normal reference: a height error carries too (#2 ends as high or low as he started)', () => {
  for (const [key, dir] of [['delayed90', 1], ['hook', -1], ['shackle', 0], ['crossTurn', 0]]) {
    for (const [error, feet] of [[HIGH, 500], [LOW, -500]]) {
      const { rel, f } = flown({ ...error, ...REFERENCE }, key, dir);
      const [lead, wing] = f.state.aircraft;
      assert.ok(Math.abs(wing.altAboveFt - lead.altAboveFt - feet) <= MARGIN_FT, `${key}: ${wing.altAboveFt.toFixed(0)} ft`);
      assert.ok(distance(rel, smmPicture(key, dir, -1)) <= MARGIN_FT, `${key}: a height error doesn't move him on the ground`);
    }
  }
});

// ---- Fix it ---------------------------------------------------------------------------------------------------------

const ERRORS = [['ahead', AHEAD], ['behind', BEHIND], ['wide', WIDE], ['tight', TIGHT], ['late', LATE], ['early', EARLY]];

test('Fix it never ends further from the SMM picture than carrying the error (not by more than one 0.05 s step of flight, 21 ft)', () => {
  for (const wingSide of SIDES) {
    const side = sideSign(wingSide);
    for (const [key, dir] of CASES) {
      for (const [name, error] of ERRORS) {
        const picture = smmPicture(key, dir, side);
        const carried = distance(flown({ wingSide, ...error, ...REFERENCE }, key, dir).rel, picture);
        const fixed = distance(flown({ wingSide, ...error, ...FIX }, key, dir).rel, picture);
        assert.ok(fixed <= carried + 25, `${key} ${dir}, ${name}, #2 on the ${wingSide}: fix ${fixed.toFixed(0)} ft, carried ${carried.toFixed(0)} ft`);
      }
    }
  }
});

test('Fix it ends closer to the SMM picture than the uncorrected run, by more than the ±100 ft margin, where a fix has something to work with', () => {
  // Where there is no lever, the test doesn't ask for one: a check turn can't move #2 along the line at constant
  // speed, and a shackle's early roll-in is made up by its reversal. Those are in docs/modules/turn-sim/decisions.md TS-52.
  const withLever = [
    ['delayed90', [1, -1], ERRORS.map((e) => e[0])],
    ['inPlace90', [1, -1], ERRORS.map((e) => e[0])],
    ['hook', [1, -1], ERRORS.map((e) => e[0])],
    ['crossTurn', [0], ERRORS.map((e) => e[0])],
    ['shackle', [0], ['ahead', 'behind', 'wide', 'tight', 'late']],
    ['delayed45', [1, -1], ['behind', 'tight', 'late', 'early']],
    ['check', [1, -1], ['early']],
  ];
  const byName = Object.fromEntries(ERRORS);
  for (const wingSide of SIDES) {
    const side = sideSign(wingSide);
    for (const [key, dirs, names] of withLever) {
      for (const dir of dirs) {
        for (const name of names) {
          const picture = smmPicture(key, dir, side);
          const carried = distance(flown({ wingSide, ...byName[name], ...REFERENCE }, key, dir).rel, picture);
          const fixed = distance(flown({ wingSide, ...byName[name], ...FIX }, key, dir).rel, picture);
          assert.ok(carried - fixed > MARGIN_FT, `${key} ${dir}, ${name}, #2 on the ${wingSide}: fix ${fixed.toFixed(0)} ft, carried ${carried.toFixed(0)} ft`);
        }
      }
    }
  }
});

test('Fix it can put #2 back in the SMM picture (±100 ft) where the turn gives him the room', () => {
  const cases = [
    ['hook', [1, -1], [BEHIND]],
    ['crossTurn', [0], [AHEAD, BEHIND, WIDE, LATE]],
    ['shackle', [0], [LATE]],
  ];
  for (const wingSide of SIDES) {
    const side = sideSign(wingSide);
    for (const [key, dirs, errors] of cases) {
      for (const dir of dirs) {
        for (const error of errors) {
          const { rel, f } = flown({ wingSide, ...error, ...FIX }, key, dir);
          const d = distance(rel, smmPicture(key, dir, side));
          assert.ok(d <= MARGIN_FT, `${key} ${dir}, ${JSON.stringify(error)}, #2 on the ${wingSide}: ${d.toFixed(0)} ft out`);
          assert.equal(f.state.errorOutcome.fixed, true);
        }
      }
    }
  }
});

test('Fix it flies #2 back to Lead\'s height, and never climbs faster than the limit', () => {
  for (const [key, dir] of [['delayed90', 1], ['check', -1], ['hook', 1], ['shackle', 0], ['crossTurn', 0]]) {
    for (const error of [HIGH, LOW]) {
      let maxClimb = 0;
      const f = createFormation({ ...error, ...FIX });
      f.press(key, dir);
      fly(f, (_b, [, wing]) => {
        maxClimb = Math.max(maxClimb, Math.abs(wing.climbFtps));
      });
      const [lead, wing] = f.state.aircraft;
      assert.ok(Math.abs(wing.altAboveFt - lead.altAboveFt) <= MARGIN_FT, `${key}: ${wing.altAboveFt.toFixed(0)} ft off Lead's height`);
      assert.ok(maxClimb <= FIX_LIMITS.maxClimbFtps * 1.05, `${key}: climbed ${maxClimb.toFixed(1)} ft/s`);
      assert.equal(f.state.errorOutcome.fixed, true);
    }
  }
});

test('in a crossing turn #2 still makes the 300 ft miss with a height error; carrying a low start shows the miss is short (SMM 16.13 para 31)', () => {
  const closest = (options, key) => {
    const f = createFormation(options);
    f.press(key, 0);
    let best = { dist: Infinity, vert: 0 };
    fly(f, (_b, [lead, wing]) => {
      const dist = Math.hypot(lead.xFt - wing.xFt, lead.yFt - wing.yFt);
      if (dist < best.dist) best = { dist, vert: Math.abs(lead.altAboveFt - wing.altAboveFt) };
    });
    return best;
  };
  for (const key of ['shackle', 'crossTurn']) {
    for (const error of [HIGH, LOW]) {
      assert.ok(closest({ ...error, ...FIX }, key).vert >= 300 - 1, `${key} fix: 300 ft apart at the cross`);
    }
    assert.ok(closest({ ...HIGH, ...REFERENCE }, key).vert >= 300 - 1, `${key} high start: carrying it is still 300 ft or more apart`);
    const low = closest({ ...LOW, ...REFERENCE }, key);
    assert.ok(low.vert < 300 - 1, `${key} low start carried: only ${low.vert.toFixed(0)} ft apart, short of 300`);
  }
  const f = createFormation({ ...LOW, ...REFERENCE });
  f.press('shackle');
  assert.match(f.state.current.note, /under the 300 ft minimum/, 'the card says so');
});

// ---- flyable: limits and smooth hand-overs ---------------------------------------------------------------------------

const everyError = { ...AHEAD, ...TIGHT, ...LOW, ...LATE };
const SETS = [
  ['ahead, fix', { ...AHEAD, ...FIX }], ['behind, fix', { ...BEHIND, ...FIX }], ['wide, fix', { ...WIDE, ...FIX }], ['tight, fix', { ...TIGHT, ...FIX }],
  ['late, fix', { ...LATE, ...FIX }], ['early, fix', { ...EARLY, ...FIX }], ['low, fix', { ...LOW, ...FIX }], ['all, fix', { ...everyError, ...FIX }],
  ['all, reference', { ...everyError, ...REFERENCE }], ['early, reference', { ...EARLY, ...REFERENCE }],
];

test('a fix is flown inside what the aircraft can do: bank and G inside the fix limits, roll rate 90°/s, roll build-up 360°/s², speed constant', () => {
  const stepFt = TAS_FTPS * STEP_SEC;
  const [, bankMax] = FIX_LIMITS.bankDeg;
  for (const [name, options] of SETS) {
    for (const [key, dir] of [['delayed90', 1], ['delayed90', -1], ['delayed45', 1], ['check', 1], ['inPlace90', -1], ['hook', 1], ['hook', -1], ['shackle', 0], ['crossTurn', 0]]) {
      const f = createFormation(options);
      f.press(key, dir);
      fly(f, (before, after) => {
        after.forEach((a, i) => {
          const what = `${name}, ${key} ${dir}, ${a.name} at ${f.state.tSec.toFixed(2)} s`;
          // The roll eases onto the bank and can pass it by a fraction of a degree: 0.5° allowed (as live.test.js).
          assert.ok(Math.abs(a.bankDeg) <= bankMax + 0.5, `${what}: bank ${a.bankDeg.toFixed(1)}`);
          assert.ok(a.g <= gFromBankDeg(bankMax + 0.5) + 1e-9, `${what}: ${a.g.toFixed(2)} G`);
          assert.ok(Math.abs(a.rollRateDps) <= ROLL.maxRateDps + 1e-9, `${what}: roll rate ${a.rollRateDps.toFixed(1)}`);
          assert.ok(Math.abs(a.rollRateDps - before[i].rollRateDps) <= ROLL.maxAccelDps2 * STEP_SEC + 1e-9, `${what}: roll build-up`);
          const moved = Math.hypot(a.xFt - before[i].xFt, a.yFt - before[i].yFt);
          assert.ok(moved <= stepFt + 1e-6 && moved >= 0.95 * stepFt, `${what}: moved ${moved.toFixed(1)} ft in a step`);
        });
      });
    }
  }
});

test('every hand-over is still smooth with errors: no jump in position, track, bank or pitch, or in their rates', () => {
  const headingDiffRad = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // The fastest the track can swing: the fix's top bank plus the 0.5° the roll can pass it by.
  const maxTurnRad = turnRateFromBankRadPerSec(TAS_FTPS, FIX_LIMITS.bankDeg[1] + 0.5) * STEP_SEC;
  const sequences = [['delayed90', -1, 'shackle', 0], ['crossTurn', 0, 'hook', 1], ['delayed45', 1, 'check', -1], ['inPlace90', 1, 'delayed90', 1], ['shackle', 0, 'crossTurn', 0]];
  for (const [name, options] of SETS) {
    for (const [a, da, b, db] of sequences) {
      const f = createFormation(options);
      f.press(a, da);
      f.press(b, db); // queued, flown the moment the first ends
      let lastPitchRate = null;
      fly(f, (before, after) => {
        after.forEach((x, i) => {
          const p = before[i];
          const what = `${name}, ${a} then ${b}, ${x.name} at ${f.state.tSec.toFixed(2)} s`;
          assert.ok(headingDiffRad(x.headingRad, p.headingRad) <= maxTurnRad + 1e-9, `${what}: track jumped`);
          assert.ok(Math.abs(x.bankDeg - p.bankDeg) <= ROLL.maxRateDps * STEP_SEC + 1e-9, `${what}: bank jumped`);
          const pitchRate = (x.pitchDeg - p.pitchDeg) / STEP_SEC;
          // A step in pitch rate is a step in G: 0.5°/s in one step is about 0.1 G at 248 KTAS (as live.test.js).
          if (lastPitchRate) assert.ok(Math.abs(pitchRate - lastPitchRate[i]) <= 0.5, `${what}: pitch rate jumped`);
        });
        lastPitchRate = after.map((x, i) => (x.pitchDeg - before[i].pitchDeg) / STEP_SEC);
      });
    }
  }
});

// ---- the card, the second press, the random error ------------------------------------------------------------------------------

test('the Formation card says which error is set and, after the roll-out only, whether #2 fixed it or carried it', () => {
  for (const [options, wanted] of [
    [{ ...BEHIND, ...FIX }, /fixed it and ended in position/],
    // The hook turns the formation 180°, so an error behind the line is ahead of it at the end; a wide one stays wide.
    [{ ...BEHIND, ...REFERENCE }, /turned at the normal reference, so the error carried through: 1,[12]\d\d ft ahead/],
    [{ ...WIDE, ...REFERENCE }, /carried through: 1,[45]\d\d ft wide/],
    [{ ...HIGH, ...REFERENCE }, /carried through: 500 ft high/],
  ]) {
    const f = createFormation(options);
    const before = errorCardLines(f.state);
    assert.match(before.set, /^Error: #2 /, 'the error is on the card from the start');
    assert.equal(before.outcome, null);
    f.press('hook', 1);
    assert.equal(errorCardLines(f.state).outcome, null, 'not judged before the roll-out');
    fly(f);
    const after = errorCardLines(f.state);
    assert.match(after.outcome.text, wanted);
    assert.ok(after.outcome.text.startsWith('Hook left'), 'it names the manoeuvre');
  }
  const f = createFormation({ ...AHEAD, ...FIX });
  assert.match(errorCardLines(f.state).set, /ahead of the 3\/9 line 1,200 ft.*Fix it/);
});

test('a second press starts from where the first left #2: a fixed error stays fixed, a carried one carries on', () => {
  const fixed = createFormation({ ...BEHIND, ...FIX });
  fixed.press('hook', 1);
  fixed.press('delayed90', -1);
  fly(fixed);
  const rel = relativeTo(...fixed.state.aircraft);
  assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT) <= MARGIN_FT && Math.abs(rel.fwd) <= MARGIN_FT, `after a fixed hook and a Delayed 90: abeam at spacing, ${rel.fwd.toFixed(0)} ft fore or aft`);

  // Carried through a hook (180°, so the offset turns round) and a Delayed 90 (a quarter turn): still the same size.
  const carried = createFormation({ ...AHEAD, ...REFERENCE });
  carried.press('hook', 1);
  carried.press('delayed90', -1);
  fly(carried);
  const rel2 = relativeTo(...carried.state.aircraft);
  const picture = smmPicture('delayed90', -1, -sideSign('right')); // the hook left #2 on the other hand of Lead
  assert.ok(Math.abs(distance(rel2, picture) - 1200) <= MARGIN_FT, `still about 1,200 ft out: ${distance(rel2, picture).toFixed(0)} ft`);
});

test('Reset and a Setup change start again with the error set; Lead flies exactly as before', () => {
  const f = createFormation({ ...AHEAD, ...FIX });
  f.press('hook', 1);
  fly(f);
  f.reset();
  assert.ok(Math.abs(relativeTo(...f.state.aircraft).fwd - 1200) < 1, 'back at the error start');
  assert.equal(f.state.errorOutcome, null);
  f.reset({ errFore: 'none' });
  assert.equal(f.state.errors, null);
  assert.ok(Math.abs(relativeTo(...f.state.aircraft).fwd) < 1, 'abeam again');
  // Lead's path with an error is the same as without (he is predictable, SMM Table 16.1) unless #2 rolled in early.
  const clean = createFormation();
  const withError = createFormation({ ...AHEAD, ...TIGHT, ...HIGH, ...FIX });
  for (const x of [clean, withError]) x.press('delayed90', 1);
  const stepsClean = [];
  const stepsError = [];
  for (let i = 0; i < 1000; i++) {
    clean.step();
    withError.step();
    stepsClean.push([clean.state.aircraft[0].xFt, clean.state.aircraft[0].yFt, clean.state.aircraft[0].headingRad]);
    stepsError.push([withError.state.aircraft[0].xFt, withError.state.aircraft[0].yFt, withError.state.aircraft[0].headingRad]);
  }
  assert.deepEqual(stepsError, stepsClean, 'Lead flew the same path');
});

test('the random error is one error at each Reset, inside the ranges, the same for the same random numbers', () => {
  const sequence = (values) => {
    let i = 0;
    return () => values[i++ % values.length];
  };
  const kinds = (e) => ['foreFt', 'spacingFt', 'heightFt', 'timingSec'].filter((k) => e[k] !== 0);
  const ranges = { foreFt: [500, 2500], spacingFt: [1000, 2500], heightFt: [300, 1000], timingSec: [2, 6] };
  const seen = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const rng = sequence([(seed * 0.173) % 1, (seed * 0.411 + 0.1) % 1, (seed * 0.29 + 0.3) % 1]);
    const e = resolveErrors({ errRandom: true, errResponse: 'reference' }, rng);
    assert.equal(e.random, true);
    assert.equal(e.response, 'reference', 'random doesn\'t pick the response');
    const [kind, ...more] = kinds(e);
    assert.equal(more.length, 0, 'exactly one error');
    const [lo, hi] = ranges[kind];
    assert.ok(Math.abs(e[kind]) >= lo && Math.abs(e[kind]) <= hi, `${kind}: ${e[kind]}`);
    seen.add(kind);
    const again = resolveErrors({ errRandom: true, errResponse: 'reference' }, sequence([(seed * 0.173) % 1, (seed * 0.411 + 0.1) % 1, (seed * 0.29 + 0.3) % 1]));
    assert.deepEqual(again, e, 'same numbers, same error');
  }
  assert.equal(seen.size, 4, 'every kind of error can come up');

  // A formation draws a new one at each Reset, and flies it like any other error.
  const f = createFormation({ errRandom: true, rng: sequence([0.1, 0.9, 0.5, 0.6, 0.2, 0.3, 0.8, 0.7]) });
  const first = { ...f.state.errors };
  assert.ok(f.state.errors.random);
  f.reset();
  assert.notDeepEqual({ ...f.state.errors }, first, 'a new error after Reset');
  f.press('delayed90', 1);
  fly(f);
  assert.ok(f.state.errorOutcome.text.startsWith('Delayed 90'));
  assert.match(errorCardLines(f.state).set, /^Random error: #2 /);
});
