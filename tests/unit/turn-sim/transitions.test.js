// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// Changing formation, 2-ship (docs/modules/turn-sim/spec.md section 10, TS-53). A handful of checks that the
// pair flies right, not that numbers match: every change ends inside the target formation's band in the
// spec table, the hand-overs are smooth (including through speed changes), #2 stays below Lead in a
// rejoin, bank stays inside the caps, the speeds end at 200 KIAS (220 in line abreast), and a press during a
// change is queued. The bands below are written out from the spec table (section 10) and the SMM pages it
// cites; they are not read back from the code. No time gates: 3 minutes is only a "the planner finished" catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { ROLL, STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';
import { turnRateFromBankRadPerSec } from '../../../src/core/flight-math.js';

const DEG = Math.PI / 180;
const WINGSPAN_FT = 33.4; // T-6A wingspan (SMM 12.6 para 15 counts in wingspans)
const CATCH_SEC = 180; // "the planner finished" catch, not a timing check
const KEYS = ['lab', 'fw', 'echelon', 'route', 'astern'];

/** The spec table's bands (section 10), written out independently of the code under test. Margins: the shared table's ±100 ft where it applies; the close positions use the table's own. */
function inBand(key, lead, wing) {
  const rel = relativeTo(lead, wing);
  const across = Math.abs(rel.left);
  const back = -rel.fwd;
  const down = lead.altAboveFt - wing.altAboveFt; // positive: #2 below Lead
  const sweep = Math.atan2(back, across) / DEG;
  switch (key) {
    case 'lab': // 4,000-6,000 ft abeam, 0-10° sweep (SMM 16.18 para 49), ±100 ft and ±5°
      return across >= 3900 && across <= 6100 && sweep >= -5 && sweep <= 15;
    case 'fw': { // 500-1,000 ft, 30-60° sweep, below Lead (SMM 12.29 para 69), ±100 ft and ±5°
      const range = Math.hypot(rel.fwd, rel.left);
      return range >= 400 && range <= 1100 && sweep >= 25 && sweep <= 65 && down > 0;
    }
    case 'route': // 1 to 3 wingspans out (SMM 12.6 para 15), level or slightly low
      return across >= WINGSPAN_FT - 10 && across <= 3 * WINGSPAN_FT + 10 && Math.abs(rel.fwd) <= 75 && down > -10;
    case 'echelon': // about 45 ft out, 25 ft back, 5 ft down, ±15, ±15, ±10 ft (the table's own: estimates)
      return Math.abs(across - 45) <= 15 && Math.abs(back - 25) <= 15 && Math.abs(down - 5) <= 10;
    default: // line astern: nose to tail about 10 ft (SMM 12.5 para 13), ±10 ft, directly behind and below
      return Math.abs(back - WINGSPAN_FT - 10) <= 10 + 5 && across <= 10 && down >= 0;
  }
}

/** Flies until nothing is being flown or queued; calls each(before, after) on every step. Fails if it runs past the catch. */
function fly(f, each = () => {}) {
  const startSec = f.state.tSec;
  let before = f.state.aircraft.map((a) => ({ ...a }));
  while (f.state.current || f.state.queued) {
    f.step();
    const after = f.state.aircraft.map((a) => ({ ...a }));
    each(before, after);
    before = after;
    assert.ok(f.state.tSec - startSec <= 2 * CATCH_SEC, 'the change finished'); // a queued second change gets its own 3 minutes
  }
}

/** A formation flown into `key` from the default line abreast start (right side). */
function formationIn(key) {
  const f = createFormation();
  if (key !== 'lab') {
    assert.equal(f.change(key), 'started');
    fly(f);
  }
  return f;
}

test('every change ends in the target formation, at 200 KIAS (220 in line abreast), inside the catch', () => {
  for (const from of KEYS) {
    for (const to of KEYS) {
      if (from === to) continue;
      const f = formationIn(from);
      const t0 = f.state.tSec;
      assert.equal(f.change(to), 'started', `${from} to ${to}`);
      fly(f);
      const [lead, wing] = f.state.aircraft;
      const what = `${from} to ${to}`;
      assert.ok(f.state.tSec - t0 <= CATCH_SEC, `${what} finished`);
      assert.ok(inBand(to, lead, wing), `${what} ends in the ${to} band`);
      const kias = to === 'lab' ? 220 : 200;
      assert.ok(Math.abs(lead.kias - kias) <= 0.5 && Math.abs(wing.kias - kias) <= 0.5, `${what}: ${lead.kias.toFixed(1)} / ${wing.kias.toFixed(1)} KIAS`);
      const apart = Math.abs(Math.atan2(Math.sin(wing.headingRad - lead.headingRad), Math.cos(wing.headingRad - lead.headingRad))) / DEG;
      assert.ok(apart <= 1, `${what}: headings ${apart.toFixed(2)}° apart`); // the shared ±5° margin is generous; a formation flies parallel
      assert.equal(f.where().key, to, `${what}: the pair reads as ${to}`);
    }
  }
});

test('every hand-over is smooth through speed changes and turning rejoins: position, track, bank, roll rate, pitch rate, speed', () => {
  // The hot turning rejoin (Lead slows and turns, #2 closes), the entry to line abreast (Lead speeds up),
  // and a station change (slow, wings level).
  for (const [from, to] of [['lab', 'echelon'], ['echelon', 'lab'], ['fw', 'route']]) {
    const f = formationIn(from);
    f.change(to);
    const lastPitchRate = [null, null];
    const lastKtps = [null, null];
    fly(f, (before, after) => {
      after.forEach((x, i) => {
        const p = before[i];
        const what = `${from} to ${to}, ${x.name} at ${f.state.tSec.toFixed(2)} s`;
        const stepFt = x.tasFtps * STEP_SEC;
        const moved = Math.hypot(x.xFt - p.xFt, x.yFt - p.yFt);
        assert.ok(moved <= stepFt * 1.001 && moved >= 0.95 * stepFt, `${what}: moved ${moved.toFixed(1)} ft in a step`);
        // The fastest the track can swing: the larger bank of the step (plus the 0.5° the roll can pass its target by).
        const maxTurn = turnRateFromBankRadPerSec(x.tasFtps, Math.max(Math.abs(x.bankDeg), Math.abs(p.bankDeg)) + 0.5) * STEP_SEC;
        const dHeading = Math.abs(Math.atan2(Math.sin(x.headingRad - p.headingRad), Math.cos(x.headingRad - p.headingRad)));
        assert.ok(dHeading <= maxTurn + 1e-9, `${what}: track jumped`);
        assert.ok(Math.abs(x.bankDeg - p.bankDeg) <= ROLL.maxRateDps * STEP_SEC + 1e-9, `${what}: bank jumped`);
        assert.ok(Math.abs(x.rollRateDps - p.rollRateDps) <= ROLL.maxAccelDps2 * STEP_SEC + 1e-9, `${what}: roll rate jumped`);
        const pitchRate = (x.pitchDeg - p.pitchDeg) / STEP_SEC;
        if (lastPitchRate[i] !== null) assert.ok(Math.abs(pitchRate - lastPitchRate[i]) <= 0.5, `${what}: pitch rate jumped`); // 0.5°/s in a step is about 0.1 G, as in live.test.js
        lastPitchRate[i] = pitchRate;
        // Speed: the smootherstep ramp peaks at 1.875 times its average rate, so 3 kt/s covers the 1.5 kt/s slow-down and the
        // full-power speed-up (estimates); and the rate itself never steps (an acceleration step of 3 kt/s² is a jump).
        const ktps = (x.kias - p.kias) / STEP_SEC;
        assert.ok(Math.abs(ktps) <= 3, `${what}: speed changing at ${ktps.toFixed(2)} kt/s`);
        if (lastKtps[i] !== null) assert.ok(Math.abs(ktps - lastKtps[i]) / STEP_SEC <= 3, `${what}: speed rate stepped`);
        lastKtps[i] = ktps;
      });
    });
  }
});

test('in a rejoin #2 stays below Lead once inside 2,000 ft, and never goes ahead of Lead\'s 3/9 line inside 1,000 ft (the overshoot lane); bank stays inside the caps', () => {
  for (const [to, rejoin] of [['fw', 'into'], ['echelon', 'into'], ['fw', 'straight']]) {
    const f = createFormation();
    f.change(to, { rejoin });
    fly(f, (_b, [lead, wing]) => {
      const rel = relativeTo(lead, wing);
      const range = Math.hypot(rel.fwd, rel.left);
      const what = `${to} (${rejoin}) at ${f.state.tSec.toFixed(1)} s`;
      if (range < 2000) assert.ok(lead.altAboveFt - wing.altAboveFt > 0, `${what}: #2 at or above Lead's height at ${range.toFixed(0)} ft`);
      if (range < 1000) assert.ok(rel.fwd <= 100, `${what}: #2 ${rel.fwd.toFixed(0)} ft ahead of Lead's 3/9 line at ${range.toFixed(0)} ft`); // ±100 ft shared margin
      assert.ok(Math.abs(wing.bankDeg) <= 60 + 0.5, `${what}: #2 bank ${wing.bankDeg.toFixed(1)}`); // the 60° cap (an estimate) plus the half degree the roll can pass it by
      assert.ok(Math.abs(lead.bankDeg) <= 30 + 0.5, `${what}: Lead bank ${lead.bankDeg.toFixed(1)}`); // Lead's turn is 30° (SMM 12.24 para 54)
    });
  }
});

test('a press while a change is flying is queued and flown the moment it ends; the line abreast manoeuvres fly in line abreast only', () => {
  const f = createFormation();
  assert.equal(f.change('fw'), 'started');
  assert.equal(f.change('route'), 'queued');
  let sawSecond = false;
  fly(f, () => {
    if (f.state.current?.key === 'change:route') sawSecond = true;
  });
  assert.ok(sawSecond, 'the queued change was flown');
  assert.ok(inBand('route', ...f.state.aircraft), 'and ended in route');
  // In route a line abreast manoeuvre (the shackle) is refused, and nothing changes; change back to line abreast and it
  // is flown again. The turn buttons do fly in route now (Patrick 18:11Z, spec section 10.2), tested in formation-moves.
  assert.equal(f.press('shackle', 1), 'refused');
  f.change('lab');
  fly(f);
  assert.equal(f.press('check', 1), 'started');
});
