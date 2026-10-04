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

// The Turn Sim's live 2-ship (first version, docs/modules/turn-sim/spec.md section 7):
// each button, both ways and with #2 on either side, ends in the picture the SMM draws
// (SMM 16.19 paras 52-64, Figs 16.15-16.21), and every hand-over is smooth (Patrick,
// 4 Oct 2026: transitions match in position, track, bank and pitch and their rates).
// End pictures only; no time gates. Margins are the shared table's (±100 ft, ±5°)
// unless a check says why it uses another.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation, judgePair } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo, TURN_BANK_DEG, VERTICAL_MISS_FT, CHECK_DEG } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { ROLL, STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';
import { turnRateFromBankRadPerSec } from '../../../src/core/flight-math.js';

const SPACING_FT = 6000;
const MARGIN_FT = 100; // shared table
const MARGIN_DEG = 5; // shared table
const DEG = Math.PI / 180;
/** No manoeuvre takes this long; it only stops a broken plan from running for ever. */
const SAFETY_STEPS = 20000;

const headingDiffDeg = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) / DEG;

/** Flies a press (and anything queued) to the end, calling `each(before, after)` on every step. */
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

const SIDES = ['right', 'left'];
const DIRS = [[1, 'left'], [-1, 'right']];

for (const wingSide of SIDES) {
  for (const [dir, word] of DIRS) {
    for (const [key, turnDeg] of [['delayed90', 90], ['delayed45', 45]]) {
      test(`${key} ${word}, #2 on the ${wingSide}: line abreast on the new heading, sides swapped, same spacing`, () => {
        const f = createFormation({ wingSide });
        const [lead0] = f.state.aircraft.map((a) => ({ ...a }));
        const sideBefore = Math.sign(relativeTo(...f.state.aircraft).left);
        f.press(key, dir);
        fly(f);
        const [lead, wing] = f.state.aircraft;
        assert.ok(headingDiffDeg(lead.headingRad, lead0.headingRad + dir * turnDeg * DEG) <= MARGIN_DEG, 'Lead on the new heading');
        assert.ok(headingDiffDeg(wing.headingRad, lead.headingRad) <= MARGIN_DEG, 'both on the same heading');
        const rel = relativeTo(lead, wing);
        assert.equal(Math.sign(rel.left), -sideBefore, 'sides swapped');
        assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT) <= MARGIN_FT, `spacing ${Math.abs(rel.left).toFixed(0)} ft`);
        assert.ok(Math.abs(rel.fwd) <= MARGIN_FT, `abeam, ${rel.fwd.toFixed(0)} ft fore or aft`);
      });
    }

    test(`check ${word}, #2 on the ${wingSide}: same shape on the new heading, the line between them turned ${CHECK_DEG}°`, () => {
      const f = createFormation({ wingSide });
      const sideBefore = Math.sign(relativeTo(...f.state.aircraft).left);
      f.press('check', dir);
      fly(f);
      const [lead, wing] = f.state.aircraft;
      assert.ok(headingDiffDeg(wing.headingRad, lead.headingRad) <= MARGIN_DEG);
      const rel = relativeTo(lead, wing);
      assert.equal(Math.sign(rel.left), sideBefore, 'same side');
      // Both fly the same turn, so the line between them turns with them (SMM 16.19 para 58).
      assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT * Math.cos(CHECK_DEG * DEG)) <= MARGIN_FT);
      assert.ok(Math.abs(Math.abs(rel.fwd) - SPACING_FT * Math.sin(CHECK_DEG * DEG)) <= MARGIN_FT);
    });

    test(`in place 90 ${word}, #2 on the ${wingSide}: in trail at the old spacing`, () => {
      const f = createFormation({ wingSide });
      f.press('inPlace90', dir);
      fly(f);
      const j = f.state.judged;
      assert.equal(j.shape, 'trail');
      assert.ok(Math.abs(j.gapFt - SPACING_FT) <= MARGIN_FT, `gap ${j.gapFt.toFixed(0)} ft`);
      assert.ok(Math.abs(j.offsetFt) <= MARGIN_FT, `off line ${j.offsetFt.toFixed(0)} ft`);
    });

    test(`hook ${word}, #2 on the ${wingSide}: line abreast flying back the other way, same spacing`, () => {
      const f = createFormation({ wingSide });
      const [lead0] = f.state.aircraft.map((a) => ({ ...a }));
      const sideBefore = Math.sign(relativeTo(...f.state.aircraft).left);
      f.press('hook', dir);
      fly(f);
      const [lead, wing] = f.state.aircraft;
      assert.ok(headingDiffDeg(lead.headingRad, lead0.headingRad + Math.PI) <= MARGIN_DEG);
      const rel = relativeTo(lead, wing);
      assert.equal(Math.sign(rel.left), -sideBefore, 'heading reversed, so #2 is on Lead\'s other hand');
      assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT) <= MARGIN_FT);
      assert.ok(Math.abs(rel.fwd) <= MARGIN_FT);
    });
  }

  test(`shackle, #2 on the ${wingSide}: original heading, sides swapped, 300 ft apart at the cross`, () => {
    const f = createFormation({ wingSide });
    const [lead0] = f.state.aircraft.map((a) => ({ ...a }));
    const sideBefore = Math.sign(relativeTo(...f.state.aircraft).left);
    let closest = { dist: Infinity, vert: 0 };
    f.press('shackle');
    fly(f, (_b, [l, w]) => {
      const dist = Math.hypot(l.xFt - w.xFt, l.yFt - w.yFt);
      if (dist < closest.dist) closest = { dist, vert: Math.abs(l.altAboveFt - w.altAboveFt) };
    });
    const [lead, wing] = f.state.aircraft;
    assert.ok(headingDiffDeg(lead.headingRad, lead0.headingRad) <= MARGIN_DEG);
    const rel = relativeTo(lead, wing);
    assert.equal(Math.sign(rel.left), -sideBefore, 'sides swapped');
    assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT) <= MARGIN_FT, `spacing ${Math.abs(rel.left).toFixed(0)} ft`);
    assert.ok(Math.abs(rel.fwd) <= MARGIN_FT);
    assert.ok(closest.vert >= VERTICAL_MISS_FT - 1, `${closest.vert.toFixed(0)} ft apart at the cross`); // 1 ft for arithmetic
    assert.ok(Math.abs(wing.altAboveFt - lead.altAboveFt) < 1, 'back at Lead\'s height');
  });

  test(`cross turn, #2 on the ${wingSide}: flying back the other way, each on the other's ground side, 300 ft apart at the cross`, () => {
    const f = createFormation({ wingSide });
    const [lead0, wing0] = f.state.aircraft.map((a) => ({ ...a }));
    let closest = { dist: Infinity, vert: 0 };
    f.press('crossTurn');
    fly(f, (_b, [l, w]) => {
      const dist = Math.hypot(l.xFt - w.xFt, l.yFt - w.yFt);
      if (dist < closest.dist) closest = { dist, vert: Math.abs(l.altAboveFt - w.altAboveFt) };
    });
    const [lead, wing] = f.state.aircraft;
    assert.ok(headingDiffDeg(lead.headingRad, lead0.headingRad + Math.PI) <= MARGIN_DEG);
    // Across the original track, Lead now is where #2 started from, and #2 where Lead did.
    const across = (a) => relativeTo(lead0, a).left;
    assert.equal(Math.sign(across(lead) - across(wing)), Math.sign(across(wing0) - across(lead0)), 'ground sides swapped');
    const rel = relativeTo(lead, wing);
    assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT) <= MARGIN_FT, `spacing ${Math.abs(rel.left).toFixed(0)} ft`);
    assert.ok(Math.abs(rel.fwd) <= MARGIN_FT);
    assert.ok(closest.vert >= VERTICAL_MISS_FT - 1, `${closest.vert.toFixed(0)} ft apart at the cross`);
  });
}

test('bank never goes past the manoeuvre\'s bank, and G never past 3', () => {
  for (const [key, dir] of [['delayed90', 1], ['hook', -1], ['shackle', 0], ['crossTurn', 0], ['check', 1]]) {
    const f = createFormation();
    f.press(key, dir);
    fly(f, (_b, after) => {
      for (const a of after) {
        // The roll eases onto the bank and can pass it by a fraction of a degree: 0.5° allowed.
        assert.ok(Math.abs(a.bankDeg) <= TURN_BANK_DEG + 0.5, `${key}: bank ${a.bankDeg.toFixed(1)}`);
        assert.ok(a.g <= 3.05, `${key}: ${a.g.toFixed(2)} G`);
      }
    });
  }
});

// Patrick (4 Oct 2026, Traffic thread, carried to the Turn Sim): every manoeuvre's hand-overs
// are smooth, so where one part of a manoeuvre ends and the next begins (roll-in, roll-out, the
// cross turn's change of bank, the climb and descent of the vertical miss, one manoeuvre to the
// next) position, track, bank and pitch and their rates carry straight on.
test('every hand-over is smooth: no jump in position, track, bank or pitch, or in their rates', () => {
  const sequences = [
    ['delayed90', -1, 'shackle', 0],
    ['crossTurn', 0, 'hook', 1],
    ['delayed45', 1, 'check', -1],
    ['inPlace90', 1, 'delayed90', 1],
    ['shackle', 0, 'crossTurn', 0],
  ];
  const tas = createFormation().state.aircraft[0].tasFtps;
  const stepFt = tas * STEP_SEC;
  // The fastest the track can swing: the line abreast bank plus the 0.5° the roll can pass it by.
  const maxTurnRad = turnRateFromBankRadPerSec(tas, TURN_BANK_DEG + 0.5) * STEP_SEC;
  for (const [a, da, b, db] of sequences) {
    const f = createFormation();
    f.press(a, da);
    f.press(b, db); // queued, flown the moment the first ends
    let lastPitchRate = null;
    fly(f, (before, after) => {
      after.forEach((x, i) => {
        const p = before[i];
        const what = `${a} then ${b}, ${x.name} at ${f.state.tSec.toFixed(2)} s`;
        const moved = Math.hypot(x.xFt - p.xFt, x.yFt - p.yFt);
        // Constant speed: every step covers its true airspeed's distance (5% less allowed for the climb's share).
        assert.ok(moved <= stepFt + 1e-6 && moved >= 0.95 * stepFt, `${what}: moved ${moved.toFixed(1)} ft in a step`);
        assert.ok(headingDiffDeg(x.headingRad, p.headingRad) * DEG <= maxTurnRad + 1e-9, `${what}: track jumped`);
        assert.ok(Math.abs(x.bankDeg - p.bankDeg) <= ROLL.maxRateDps * STEP_SEC + 1e-9, `${what}: bank jumped`);
        assert.ok(Math.abs(x.rollRateDps - p.rollRateDps) <= ROLL.maxAccelDps2 * STEP_SEC + 1e-9, `${what}: roll rate jumped`);
        const pitchRate = (x.pitchDeg - p.pitchDeg) / STEP_SEC;
        // A step in pitch rate is a step in G: 0.5°/s in one step is about 0.1 G at 248 KTAS.
        if (lastPitchRate) assert.ok(Math.abs(pitchRate - lastPitchRate[i]) <= 0.5, `${what}: pitch rate jumped`);
      });
      lastPitchRate = after.map((x, i) => (x.pitchDeg - before[i].pitchDeg) / STEP_SEC);
    });
  }
});

test('a press while a manoeuvre is flying is queued and flown the moment it ends', () => {
  const f = createFormation();
  assert.equal(f.press('hook', 1), 'started');
  assert.equal(f.press('delayed90', -1), 'queued');
  assert.equal(f.state.queued.label, 'Delayed 90 right');
  let sawSecond = false;
  fly(f, () => {
    if (f.state.current?.key === 'delayed90') sawSecond = true;
  });
  assert.ok(sawSecond, 'the queued press was flown');
  assert.equal(f.state.judged.label, 'Delayed 90 right');
});

test('the roll-out judgement names what is wrong', () => {
  const lead = { xFt: 0, yFt: 0, headingRad: Math.PI / 2 };
  assert.deepEqual(judgePair(lead, { xFt: 6000, yFt: 0 }, 6000).labels, ['ON SPACING']);
  assert.deepEqual(judgePair(lead, { xFt: 5000, yFt: 0 }, 6000).labels, ['TIGHT']);
  assert.deepEqual(judgePair(lead, { xFt: 7000, yFt: 500 }, 6000).labels, ['WIDE', 'FORE']);
  assert.deepEqual(judgePair(lead, { xFt: 6000, yFt: -2000 }, 6000).labels, ['AFT']); // more than 10° of sweep (SMM 16.18 para 49)
});
