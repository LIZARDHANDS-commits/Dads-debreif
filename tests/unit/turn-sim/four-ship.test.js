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

// The Turn Sim's live 4-ship (Spread 4, docs/modules/turn-sim/spec.md Part 1, decision TS-50):
// the start picture, each button both ways and with #2 on either side ends in the picture the
// briefs and the SMM draw, the aircraft stay apart, and every hand-over is smooth.
//
// Sources for the expected values (page references only):
//  - Spread 4 is a line of four with one LAB gap between neighbours, wide side 6,000 ft at the
//    start (SMM 16.42 paras 113, 116, Fig 16.33; AFM7 and AFM8 briefs p.15).
//  - Altitude stack, low to high 4, 3, 1, 2, 300 ft apart, kept through the turns (AFM8 brief p.14-15).
//  - Delayed 90 and 45 turn outside aircraft first, each next aircraft in turn: order #2, Lead, #3, #4
//    for a right turn and #4, #3, Lead, #2 for a left turn with #2 on Lead's left (AFM8 brief p.17-18,
//    SMM Fig 16.34); the wait is spacing / speed x cot(half the turn) (SMM 16.19 paras 52-57).
//  - Delayed 45: the aircraft after the first check 10 to 15 degrees toward the aircraft ahead of them
//    (AFM8 brief p.18, SMM Fig 16.34).
//  - Hook: all roll out 180 degrees round in line abreast (AFM8 brief p.18, SMM 16.45 para 121).
//  - Check and in-place turns: SMM 16.43 para 118, 16.19 paras 58-59.
//  - Crossing separation 300 ft vertical and/or horizontal (SMM 16.13 para 31; Gen Book p.11).
//  - 70 degrees of bank and 3 G in every turn (SMM 16.18 para 50).
// End pictures only; no time gates. Margins are the shared table's (±100 ft, ±5°) unless a check says why.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation, judgePair, LIVE_DEFAULTS } from '../../../src/modules/turn-sim/live/formation.js';
import { judgeFour, FOUR_SHIP_KEYS } from '../../../src/modules/turn-sim/live/four-ship.js';
import { STACK_FT } from '../../../src/modules/turn-sim/live/slots.js';
import { relativeTo, TURN_BANK_DEG, CHECK_DEG } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { ROLL, STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';
import { turnRateFromBankRadPerSec } from '../../../src/core/flight-math.js';

const SPACING_FT = 6000; // AFM7 and AFM8 briefs p.15: initial spacing on the wide side
const MARGIN_FT = 100; // shared table
const MARGIN_DEG = 5; // shared table
const SMM_BAND_FT = [4000, 6000]; // SMM 16.18 para 49
const DEG = Math.PI / 180;
const SAFETY_STEPS = 20000; // no manoeuvre takes this long (1,000 s); it only stops a broken plan running for ever

const SIDES = ['right', 'left'];
const DIRS = [[1, 'left'], [-1, 'right']];
const KEYS = FOUR_SHIP_KEYS;

const headingDiffDeg = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) / DEG;
const four = (wingSide = 'right') => createFormation({ ships: 4, wingSide });
const copy = (aircraft) => aircraft.map((a) => ({ ...a }));
/** Ids from the leftmost to the rightmost, as seen from Lead's heading. */
const lateralOrder = (aircraft) => {
  const lead = aircraft[0];
  return [...aircraft].sort((a, b) => relativeTo(lead, b).left - relativeTo(lead, a).left).map((a) => a.id);
};

/** Flies a press (and anything queued) to the end, calling `each(before, after)` on every step. */
function fly(f, each = () => {}) {
  let before = copy(f.state.aircraft);
  for (let i = 0; i < SAFETY_STEPS && (f.state.current || f.state.queued); i++) {
    f.step();
    const after = copy(f.state.aircraft);
    each(before, after);
    before = after;
  }
  assert.equal(f.state.current, null, 'the manoeuvre finished');
}

/** The formation time each aircraft first rolls past 5 degrees of bank, by id (null for one that never does). */
function rollInTimes(f) {
  const times = {};
  for (const a of f.state.aircraft) times[a.id] = null;
  fly(f, (_b, after) => {
    for (const a of after) if (times[a.id] === null && Math.abs(a.bankDeg) > 5) times[a.id] = f.state.tSec;
  });
  return times;
}

// ---- the start picture ----------------------------------------------------------------------

test('the Turn Sim stays a 2-ship by default; the 4-ship is an option', () => {
  assert.equal(LIVE_DEFAULTS.ships, 2);
  assert.equal(createFormation().state.aircraft.length, 2);
  assert.equal(four().state.aircraft.length, 4);
});

for (const wingSide of SIDES) {
  test(`4-ship start, #2 on Lead's ${wingSide}: Spread 4 line abreast at 6,000 ft, on the altitude stack`, () => {
    const f = four(wingSide);
    const { aircraft } = f.state;
    // Left to right seen from behind: #4 #3 Lead #2 with #2 on the right (SMM Fig 16.33 "West"; Patrick's TS-44),
    // #2 Lead #3 #4 with #2 on the left (Fig 16.33 "East"; AFM8 brief p.14).
    assert.deepEqual(lateralOrder(aircraft), wingSide === 'right' ? [4, 3, 1, 2] : [2, 1, 3, 4]);
    const byLeft = [...aircraft].sort((a, b) => relativeTo(aircraft[0], b).left - relativeTo(aircraft[0], a).left);
    for (let i = 1; i < 4; i++) {
      const rel = relativeTo(byLeft[i - 1], byLeft[i]);
      assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT) <= MARGIN_FT, `gap ${Math.abs(rel.left).toFixed(0)} ft`);
      assert.ok(Math.abs(rel.fwd) <= MARGIN_FT, 'abeam');
    }
    for (const a of aircraft) assert.ok(headingDiffDeg(a.headingRad, aircraft[0].headingRad) <= MARGIN_DEG, 'all on Lead\'s heading');
    // #2 sets the stack: low to high 4, 3, 1, 2 in 300 ft steps (AFM8 brief p.15), +300, 0, -300, -600 against Lead.
    assert.deepEqual(aircraft.map((a) => a.altAboveFt), [0, 300, -300, -600]);
    const high = [...aircraft].sort((a, b) => a.altAboveFt - b.altAboveFt).map((a) => a.id);
    assert.deepEqual(high, [4, 3, 1, 2]);
    // #2 and #3 fly off Lead, #4 off #3 (SMM 16.42 para 116).
    assert.deepEqual(aircraft.map((a) => a.ref), [null, 1, 1, 3]);
  });
}

test('switching 2-ship and 4-ship resets to that mode\'s default start (the mid-flight transition comes later)', () => {
  const f = createFormation();
  f.press('hook', 1);
  for (let i = 0; i < 100; i++) f.step();
  f.reset({ ships: 4 });
  assert.equal(f.state.aircraft.length, 4);
  assert.equal(f.state.tSec, 0);
  assert.equal(f.state.current, null);
  assert.deepEqual(lateralOrder(f.state.aircraft), [4, 3, 1, 2]);
  f.reset({ ships: 2 });
  assert.equal(f.state.aircraft.length, 2);
  assert.equal(f.state.tSec, 0);
  assert.equal(Math.round(relativeTo(...f.state.aircraft).left), -SPACING_FT, '#2 on the right at 6,000 ft');
});

test('the shackle and the cross turn are not 4-ship buttons (not approved in Spread 4, SMM 16.43 para 118)', () => {
  const f = four();
  assert.throws(() => f.press('shackle'), /not a four-ship manoeuvre/);
  assert.throws(() => f.press('crossTurn'), /not a four-ship manoeuvre/);
  assert.deepEqual([...KEYS].sort(), ['check', 'delayed45', 'delayed90', 'hook', 'inPlace90']);
});

// ---- end pictures ---------------------------------------------------------------------------

for (const wingSide of SIDES) {
  for (const [dir, word] of DIRS) {
    for (const [key, turnDeg] of [['delayed90', 90], ['delayed45', 45]]) {
      test(`${key} ${word}, #2 on the ${wingSide}: line abreast on the new heading, sides swapped, one gap between neighbours`, () => {
        const f = four(wingSide);
        const start = copy(f.state.aircraft);
        const orderBefore = lateralOrder(start);
        f.press(key, dir);
        fly(f);
        const { aircraft } = f.state;
        assert.ok(headingDiffDeg(aircraft[0].headingRad, start[0].headingRad + dir * turnDeg * DEG) <= MARGIN_DEG, 'Lead on the new heading');
        for (const a of aircraft) assert.ok(headingDiffDeg(a.headingRad, aircraft[0].headingRad) <= MARGIN_DEG, `${a.name} on the same heading`);
        const orderAfter = lateralOrder(aircraft);
        assert.deepEqual(orderAfter, [...orderBefore].reverse(), 'sides swapped, so the line reads the other way round');
        const byLeft = orderAfter.map((id) => aircraft.find((a) => a.id === id));
        for (let i = 1; i < 4; i++) {
          const rel = relativeTo(byLeft[i - 1], byLeft[i]);
          const gap = Math.abs(rel.left);
          assert.ok(Math.abs(rel.fwd) <= MARGIN_FT, `${byLeft[i].name} abeam, ${rel.fwd.toFixed(0)} ft fore or aft`);
          if (turnDeg === 90) assert.ok(Math.abs(gap - SPACING_FT) <= MARGIN_FT, `gap ${gap.toFixed(0)} ft`);
          // The delayed 45's check turn costs a little room (the brief says to fix spacing on roll-out, AFM8 brief p.18),
          // so its gaps only have to stay in the SMM's 4,000 to 6,000 ft band, plus the shared 100 ft.
          else assert.ok(gap >= SMM_BAND_FT[0] && gap <= SMM_BAND_FT[1] + MARGIN_FT, `gap ${gap.toFixed(0)} ft`);
        }
      });
    }

    test(`check ${word}, #2 on the ${wingSide}: same line on the new heading, turned ${CHECK_DEG}° (SMM 16.19 para 58)`, () => {
      const f = four(wingSide);
      const orderBefore = lateralOrder(f.state.aircraft);
      f.press('check', dir);
      fly(f);
      const { aircraft } = f.state;
      assert.deepEqual(lateralOrder(aircraft), orderBefore, 'same sides');
      const byLeft = lateralOrder(aircraft).map((id) => aircraft.find((a) => a.id === id));
      for (let i = 1; i < 4; i++) {
        assert.ok(headingDiffDeg(byLeft[i].headingRad, aircraft[0].headingRad) <= MARGIN_DEG);
        const rel = relativeTo(byLeft[i - 1], byLeft[i]);
        // They all fly the same turn, so the line between neighbours turns with them.
        assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT * Math.cos(CHECK_DEG * DEG)) <= MARGIN_FT);
        assert.ok(Math.abs(Math.abs(rel.fwd) - SPACING_FT * Math.sin(CHECK_DEG * DEG)) <= MARGIN_FT);
      }
    });

    test(`in place 90 ${word}, #2 on the ${wingSide}: all four in trail at the old gap (SMM 16.19 para 59)`, () => {
      const f = four(wingSide);
      f.press('inPlace90', dir);
      fly(f);
      const j = f.state.judged;
      assert.equal(j.shape, 'trail');
      assert.equal(j.ships.length, 3, '#2, #3 and #4 each judged off the aircraft they fly off');
      for (const s of j.ships) {
        assert.ok(Math.abs(s.gapFt - SPACING_FT) <= MARGIN_FT, `${s.name} ${s.gapFt.toFixed(0)} ft behind ${s.refName}`);
        assert.ok(Math.abs(s.offsetFt) <= MARGIN_FT, `${s.name} ${s.offsetFt.toFixed(0)} ft off line`);
      }
    });

    test(`hook ${word}, #2 on the ${wingSide}: line abreast flying back the other way, same gaps`, () => {
      const f = four(wingSide);
      const start = copy(f.state.aircraft);
      f.press('hook', dir);
      fly(f);
      const { aircraft } = f.state;
      assert.ok(headingDiffDeg(aircraft[0].headingRad, start[0].headingRad + Math.PI) <= MARGIN_DEG, 'Lead 180 round');
      assert.deepEqual(lateralOrder(aircraft), [...lateralOrder(start)].reverse(), 'heading reversed, so the line reads the other way round');
      const byLeft = lateralOrder(aircraft).map((id) => aircraft.find((a) => a.id === id));
      for (let i = 1; i < 4; i++) {
        const rel = relativeTo(byLeft[i - 1], byLeft[i]);
        assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT) <= MARGIN_FT);
        assert.ok(Math.abs(rel.fwd) <= MARGIN_FT);
      }
      assert.equal(f.state.judged.labels[0], 'ON SPACING');
    });
  }
}

// ---- who turns when -------------------------------------------------------------------------

test('delayed 90: outside aircraft first, each next one in turn (AFM8 brief p.17, SMM Fig 16.34 captions)', () => {
  // With #2 on Lead's left (Fig 16.33 "East"): a right turn goes #2, Lead, #3, #4 and a left turn #4, #3, Lead, #2.
  for (const [dir, expected] of [[-1, [2, 1, 3, 4]], [1, [4, 3, 1, 2]]]) {
    const f = four('left');
    f.press('delayed90', dir);
    const times = rollInTimes(f);
    const order = Object.keys(times).map(Number).sort((a, b) => times[a] - times[b]);
    assert.deepEqual(order, expected);
  }
  // With #2 on the right the same rule (outside first) gives the mirror order.
  const f = four('right');
  f.press('delayed90', -1);
  const times = rollInTimes(f);
  assert.deepEqual(Object.keys(times).map(Number).sort((a, b) => times[a] - times[b]), [4, 3, 1, 2]);
});

test('delayed 90: each aircraft waits spacing / speed x cot(45°) after the one before it (SMM 16.19 paras 52-57)', () => {
  const f = four('left');
  const v = f.state.aircraft[0].tasFtps;
  f.press('delayed90', -1);
  const times = rollInTimes(f);
  const wait = (SPACING_FT / v) / Math.tan(45 * DEG);
  // The roll-in is read at 5° of bank, the same moment of the roll for every aircraft, so the gaps between
  // them are the waits; half a second allows the 0.05 s step and the whole-step rounding of each wait.
  for (const [a, b] of [[2, 1], [1, 3], [3, 4]]) assert.ok(Math.abs(times[b] - times[a] - wait) <= 0.5, `${a} to ${b}: ${(times[b] - times[a]).toFixed(2)} s, expected ${wait.toFixed(2)} s`);
});

test('delayed 45: #2 turns first and never the wrong way; each other aircraft checks 10 to 15° toward the aircraft ahead, then turns (AFM8 brief p.18)', () => {
  for (const wingSide of SIDES) {
    for (const [dir] of DIRS) {
      const f = four(wingSide);
      const h0 = f.state.aircraft[0].headingRad;
      const orderBefore = lateralOrder(f.state.aircraft);
      const turnOrder = dir > 0 ? [...orderBefore].reverse() : orderBefore; // outside of the turn first
      const wrongWay = {}; // the furthest each aircraft heads away from the turn, in degrees
      f.press('delayed45', dir);
      fly(f, (_b, after) => {
        for (const a of after) {
          const off = -dir * Math.atan2(Math.sin(a.headingRad - h0), Math.cos(a.headingRad - h0)) / DEG;
          wrongWay[a.id] = Math.max(wrongWay[a.id] ?? 0, off);
        }
      });
      assert.ok(wrongWay[turnOrder[0]] <= 0.5, `the first aircraft (${turnOrder[0]}) turns straight onto its heading, ${wrongWay[turnOrder[0]].toFixed(1)}° the wrong way`);
      for (const id of turnOrder.slice(1)) {
        // 10 to 15° is the brief's range; one degree either side allows for the roll-out running on after the check.
        assert.ok(wrongWay[id] >= 9 && wrongWay[id] <= 16, `aircraft ${id} checked ${wrongWay[id].toFixed(1)}°`);
      }
    }
  }
});

test('delayed 45 with the check turn switched off: a plain chain, nobody heads away from the turn, line abreast at one spacing (Patrick 4 Oct 11:28Z; SMM 16.43 para 118 standard timing)', () => {
  for (const wingSide of SIDES) {
    for (const [dir] of DIRS) {
      const f = createFormation({ ships: 4, wingSide, check45: false });
      const h0 = f.state.aircraft[0].headingRad;
      f.press('delayed45', dir);
      fly(f, (_b, after) => {
        for (const a of after) {
          const off = -dir * Math.atan2(Math.sin(a.headingRad - h0), Math.cos(a.headingRad - h0)) / DEG;
          // Half a degree allows for the roll easing in (as the first aircraft's check above).
          assert.ok(off <= 0.5, `${a.name} headed ${off.toFixed(1)}° away from the turn`);
        }
      });
      const byLeft = lateralOrder(f.state.aircraft).map((id) => f.state.aircraft.find((a) => a.id === id));
      for (let i = 1; i < 4; i++) {
        const rel = relativeTo(byLeft[i - 1], byLeft[i]);
        assert.ok(Math.abs(rel.fwd) <= MARGIN_FT, `${byLeft[i].name} abeam, ${rel.fwd.toFixed(0)} ft fore or aft`);
        assert.ok(Math.abs(Math.abs(rel.left) - SPACING_FT) <= MARGIN_FT, `gap ${Math.abs(rel.left).toFixed(0)} ft`);
      }
    }
  }
});

// ---- physical limits, separation, smoothness ---------------------------------------------------

test('bank never goes past the manoeuvre\'s bank, and G never past 3, for all four in every button', () => {
  for (const key of KEYS) {
    for (const [dir] of DIRS) {
      const f = four();
      f.press(key, dir);
      fly(f, (_b, after) => {
        for (const a of after) {
          // The roll eases onto the bank and can pass it by a fraction of a degree: 0.5° allowed (as live.test.js).
          assert.ok(Math.abs(a.bankDeg) <= TURN_BANK_DEG + 0.5, `${key} ${a.name}: bank ${a.bankDeg.toFixed(1)}`);
          assert.ok(a.g <= 3.05, `${key} ${a.name}: ${a.g.toFixed(2)} G`);
        }
      });
    }
  }
});

test('no two aircraft come within 300 ft vertically and horizontally of each other, and the altitude stack holds through every turn', () => {
  // SMM 16.13 para 31 / Gen Book p.11: a minimum 300 ft crossing separation, vertical and/or horizontal, so a pair is
  // safe when either is at least 300 ft. 1 ft is allowed for arithmetic.
  // The stack is kept while the formation turns (AFM8 brief p.14 item 3).
  // Also, an ESTIMATE (no sourced horizontal-only figure): horizontally never under 1,000 ft, so the picture
  // does not lean on the stack alone to keep the four apart.
  const HORIZONTAL_ESTIMATE_FT = 1000;
  for (const wingSide of SIDES) {
    for (const key of KEYS) {
      for (const [dir] of DIRS) {
        const f = four(wingSide);
        f.press(key, dir);
        let closest = Infinity;
        fly(f, (_b, after) => {
          for (let i = 0; i < 4; i++) {
            assert.ok(Math.abs(after[i].altAboveFt - STACK_FT[after[i].id]) < 1, `${key} ${after[i].name} left the stack`);
            for (let j = i + 1; j < 4; j++) {
              const horiz = Math.hypot(after[i].xFt - after[j].xFt, after[i].yFt - after[j].yFt);
              const vert = Math.abs(after[i].altAboveFt - after[j].altAboveFt);
              closest = Math.min(closest, horiz);
              assert.ok(Math.max(horiz, vert) >= 300 - 1, `${key}: ${after[i].name} and ${after[j].name} ${horiz.toFixed(0)} ft apart, ${vert.toFixed(0)} ft vertically`);
            }
          }
        });
        assert.ok(closest >= HORIZONTAL_ESTIMATE_FT, `${key} ${wingSide} ${dir}: closest horizontally ${closest.toFixed(0)} ft`);
      }
    }
  }
});

// Patrick (4 Oct 2026): every hand-over is smooth, for all four aircraft: position, track, bank and pitch and their rates
// carry straight on where one part of a manoeuvre meets the next, and from one manoeuvre to the next (TS-47).
test('every hand-over is smooth for all four: no jump in position, track, bank or pitch, or in their rates', () => {
  const sequences = [
    ['delayed90', -1, 'hook', 1],
    ['hook', 1, 'delayed45', 1],
    ['delayed45', -1, 'check', 1],
    ['check', -1, 'delayed90', 1],
    ['delayed45', 1, 'inPlace90', -1],
    ['inPlace90', 1, 'delayed90', 1], // delayed turn from a column: not abreast
  ];
  const tas = four().state.aircraft[0].tasFtps;
  const stepFt = tas * STEP_SEC;
  // The fastest the track can swing: the bank plus the 0.5° the roll can pass it by.
  const maxTurnRad = turnRateFromBankRadPerSec(tas, TURN_BANK_DEG + 0.5) * STEP_SEC;
  for (const [a, da, b, db] of sequences) {
    const f = four();
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
        // A step in pitch rate is a step in G: 0.5°/s in one step is about 0.1 G at 248 KTAS (as live.test.js).
        if (lastPitchRate) assert.ok(Math.abs(pitchRate - lastPitchRate[i]) <= 0.5, `${what}: pitch rate jumped`);
      });
      lastPitchRate = after.map((x, i) => (x.pitchDeg - before[i].pitchDeg) / STEP_SEC);
    });
    // They all carry on to the end of the second one: the queue worked and the formation is level.
    assert.ok(f.state.aircraft.every((x) => x.bankDeg === 0), `${a} then ${b}: wings level at the end`);
  }
});

test('a press while a 4-ship manoeuvre is flying is queued and flown the moment it ends', () => {
  const f = four();
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

// ---- judging --------------------------------------------------------------------------------

test('the 4-ship roll-out judgement names which wingman is off, against the aircraft it flies off (SMM 16.42 para 116)', () => {
  const lead = { id: 1, name: 'Lead', ref: null, xFt: 0, yFt: 0, headingRad: Math.PI / 2 };
  const line = (x2, x3, x4, y4 = 0) => [
    lead,
    { id: 2, name: '#2', ref: 1, xFt: x2, yFt: 0, headingRad: Math.PI / 2 },
    { id: 3, name: '#3', ref: 1, xFt: x3, yFt: 0, headingRad: Math.PI / 2 },
    { id: 4, name: '#4', ref: 3, xFt: x4, yFt: y4, headingRad: Math.PI / 2 },
  ];
  // Lead heads north, so +x is on Lead's right: #2 is on the right, #3 and then #4 on the left, six thousand feet apart.
  const good = judgeFour(line(6000, -6000, -12000), 6000, 'abreast', judgePair);
  assert.deepEqual(good.labels, ['ON SPACING']);
  assert.equal(good.ships.length, 3);
  assert.deepEqual(good.ships.map((s) => s.refName), ['Lead', 'Lead', '#3'], '#4 is judged off #3, not off Lead');
  // #4 closes up on #3: only #4 is named, and it is judged from #3 (5,000 ft from #3, though 11,000 from Lead).
  const tight = judgeFour(line(6000, -6000, -11000), 6000, 'abreast', judgePair);
  assert.deepEqual(tight.labels, ['#4 TIGHT']);
  const aft = judgeFour(line(6000, -6000, -12000, -2000), 6000, 'abreast', judgePair);
  assert.deepEqual(aft.labels, ['#4 AFT']); // more than 10° of sweep (SMM 16.18 para 49)
});
