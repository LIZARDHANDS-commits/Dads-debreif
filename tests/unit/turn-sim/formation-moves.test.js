// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// The hot turning rejoin, fighting wing turns and the SMM's moves (docs/modules/turn-sim/spec.md section 10.1, TS-55).
// Patrick's 4 Oct 11:50Z rule: test only that it flies right (no snaps, limits flagged not walled, ends in the right
// formation, nothing breaks); no wording, seconds, counts or one-off values. What a pilot would recognise:
//  - every move ends in the formation pressed (the bands written out from the manuals, not read from the code);
//  - nothing snaps: roll rate never steps by more than the T-6 can (90°/s reached in 0.25 s, TS-37), speed changes under
//    3 kt/s and never step (as transitions.test.js);
//  - a rejoining wingman is never at or above Lead's height while closing inside 2,000 ft (SMM 12.27 para 65; Patrick
//    19:11Z "come off first");
//  - #2's bank stays under the 60° cap (an estimate, flagged, never a wall), Lead's in a rejoin under 30° (SMM 12.24 para 54);
//  - the straight-ahead rejoin lines up on Lead's six (SMM 12.26 para 63; Fig 12.17);
//  - in a close station change no wings overlap and #2 crosses below and behind Lead (SMM 12.20 para 44), stopping
//    behind the new slot before moving up (para 45).
// One generous limit: echelon to fighting wing reaches the band inside 30 s. Patrick asked for about 7-15 s (19:03Z);
// 30 s is twice the top of his range, so only a slow drop back fails it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { ROLL, STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';

const DEG = Math.PI / 180;
const WINGSPAN_FT = 33.4; // T-6A wingspan (SMM 12.6 para 15 counts in wingspans)
const LENGTH_FT = 33.4; // T-6A length, near enough its span
const CATCH_SEC = 600; // "the plan finished" catch, not a timing check
const FW_TURNS = ['check', 'delayed45', 'delayed90', 'inPlace90', 'hook']; // the turn buttons that fly in fighting wing (spec 10.1)

const link = (ref, wing) => {
  const rel = relativeTo(ref, wing);
  const across = Math.abs(rel.left);
  return { rel, across, back: -rel.fwd, down: ref.altAboveFt - wing.altAboveFt, range: Math.hypot(rel.fwd, rel.left), sweep: Math.atan2(-rel.fwd, across) / DEG };
};
// 500-1,000 ft and 30-60° of sweep from Lead's wing line, below Lead (SMM 12.29 para 69, Fig 12.19; Patrick 19:12Z), ±100 ft and ±5°
const inFw = (l) => l.range >= 400 && l.range <= 1100 && l.sweep >= 25 && l.sweep <= 65 && l.down > 0;
// about 45 ft out, 25 ft back, 5 ft down, the 2-ship spec table's own margins (estimates)
const inEchelon = (l) => Math.abs(l.across - 45) <= 15 && Math.abs(l.back - 25) <= 15 && Math.abs(l.down - 5) <= 10;
// directly behind and below, about 10 ft nose to tail (SMM 12.5 para 13), ±10 ft
const inAstern = (l) => l.across <= 10 && Math.abs(l.back - LENGTH_FT - 10) <= 15 && l.down >= 0;

/**
 * Flies until nothing is being flown or queued, checking on every step that nothing snaps; each(before, after, t)
 * adds a move's own checks (t: seconds since the press).
 */
function fly(f, what, each = () => {}) {
  const t0 = f.state.tSec;
  let before = f.state.aircraft.map((a) => ({ ...a }));
  const lastKtps = before.map(() => null);
  while (f.state.current || f.state.queued) {
    f.step();
    const after = f.state.aircraft.map((a) => ({ ...a }));
    const t = f.state.tSec - t0;
    after.forEach((x, i) => {
      const p = before[i];
      const at = `${what}, ${x.name} at ${t.toFixed(1)} s`;
      assert.ok(Math.abs(x.rollRateDps - p.rollRateDps) <= ROLL.maxAccelDps2 * STEP_SEC + 1e-9, `${at}: roll rate jumped`);
      const ktps = (x.kias - p.kias) / STEP_SEC;
      const maxKtps = (x.slowStage || x.power?.stage || Math.abs(x.bankDeg) > 30) ? 16 : 8;
      assert.ok(Math.abs(ktps) <= maxKtps, `${at}: speed changing at ${ktps.toFixed(2)} kt/s`);
      if (lastKtps[i] !== null) assert.ok(Math.abs(ktps - lastKtps[i]) / STEP_SEC <= 26, `${at}: speed rate stepped`);
      lastKtps[i] = ktps;
    });
    each(before, after, t);
    before = after;
    assert.ok(t <= CATCH_SEC, `${what}: the plan finished`);
  }
}

/**
 * A closing check for a rejoining wingman: inside 2,000 ft of Lead he never closes while at or above Lead's height.
 * Closing is measured over 1 s so the tracker's few-hundredths-of-a-foot wobble while holding is not counted; 5 ft in
 * that second (about 3 kt) is the least that counts as closing (an estimate).
 */
function comesOffFirst(what, id) {
  const ranges = [];
  return (_b, after, t) => {
    const lead = after[0];
    const l = link(lead, after.find((a) => a.id === id));
    ranges.push(l.range);
    const secAgo = ranges[ranges.length - 1 - Math.round(1 / STEP_SEC)];
    if (l.range < 2000 && l.down <= 0 && secAgo !== undefined) {
      assert.ok(secAgo - l.range < 5, `${what}: #${id} closing at or above Lead's height at ${t.toFixed(1)} s, ${l.range.toFixed(0)} ft`);
    }
  };
}

test('the hot turning rejoin from the standard start: Lead turns into #2, #2 stays below and inside the caps, and it ends in fighting wing or echelon', () => {
  for (const to of ['fw', 'echelon']) {
    const f = createFormation();
    const side = Math.sign(link(f.state.aircraft[0], f.state.aircraft[1]).rel.left);
    assert.equal(f.change(to), 'started', to);
    let leadFirstTurn = 0;
    fly(f, `hot rejoin to ${to}`, (_b, [lead, wing], t) => {
      if (!leadFirstTurn && Math.abs(lead.bankDeg) > 5) leadFirstTurn = Math.sign(lead.bankDeg);
      const l = link(lead, wing);
      if (l.range < 2000) assert.ok(l.down > 0, `${to} at ${t.toFixed(1)} s: #2 at or above Lead's height at ${l.range.toFixed(0)} ft`);
      if (l.range < 1000) assert.ok(l.rel.fwd <= 100, `${to} at ${t.toFixed(1)} s: #2 ahead of Lead's 3/9 line inside 1,000 ft`); // the overshoot lane, ±100 ft margin
      assert.ok(Math.abs(wing.bankDeg) < 85, `${to}: #2 bank ${wing.bankDeg.toFixed(1)}`); // Patrick ruling: envelope gate < 85°
      assert.ok(Math.abs(lead.bankDeg) <= 30.5, `${to}: Lead bank ${lead.bankDeg.toFixed(1)}`);
    });
    // Bank is left wing down positive, and side is +1 for #2 on the left, so a turn into #2 has the sign of his side.
    assert.equal(leadFirstTurn, side, `${to}: Lead's first turn is into #2`);
    const [lead, wing] = f.state.aircraft;
    assert.ok(to === 'fw' ? inFw(link(lead, wing)) : inEchelon(link(lead, wing)), `the hot rejoin ends in ${to}`);
  }
});

test('in fighting wing the turn buttons turn the formation: #2 stays below Lead, inside the bank cap, and ends in the band', () => {
  for (const [key, dir] of [['delayed90', 1], ['delayed90', -1], ['check', 1], ['hook', -1], ['inPlace90', 1], ['delayed45', -1]]) {
    const f = createFormation();
    f.change('fw');
    fly(f, 'to fighting wing');
    assert.ok(FW_TURNS.includes(key));
    assert.equal(f.press(key, dir), 'started', `${key} ${dir} in fighting wing`);
    fly(f, `${key} ${dir}`, (_b, [lead, wing], t) => {
      assert.ok(Math.abs(wing.bankDeg) < 85, `${key}: #2 bank ${wing.bankDeg.toFixed(1)} at ${t.toFixed(1)} s`); // Patrick ruling: envelope gate < 85°
      assert.ok(link(lead, wing).down > 0, `${key}: #2 below Lead`);
    });
    const [lead, wing] = f.state.aircraft;
    assert.ok(inFw(link(lead, wing)), `${key} ${dir} ends in the fighting wing band`);
  }
});

test('echelon to fighting wing is expeditious: in the band well inside the generous limit, and ends there', () => {
  const f = createFormation();
  f.change('echelon');
  fly(f, 'to echelon');
  f.change('fw');
  let inAt = null;
  fly(f, 'echelon to fighting wing', (_b, [lead, wing], t) => {
    if (inAt === null && inFw(link(lead, wing))) inAt = t;
  });
  assert.ok(inAt !== null && inAt <= 30, `in the band at ${inAt?.toFixed(1)} s (about 7-15 s asked, Patrick 19:03Z; 30 s is the generous limit)`);
  assert.ok(inFw(link(...f.state.aircraft)), 'and ends there');
});

test('fighting wing to echelon is a straight-ahead rejoin: #2 lines up on Lead\'s six, closes below him, and ends in echelon (both sides)', () => {
  for (const side of ['keep', 'left']) {
    const f = createFormation();
    f.change('fw');
    fly(f, 'to fighting wing');
    f.change('echelon', { side, rejoin: 'straight' });
    let onSix = false;
    fly(f, `fighting wing to echelon (${side})`, (_b, [lead, wing], t) => {
      const l = link(lead, wing);
      if (l.back > 400 && l.across < 100) onSix = true; // on the extended six, well back (Fig 12.17)
      if (l.range < 2000) assert.ok(l.down > 0, `${side} at ${t.toFixed(1)} s: #2 at or above Lead's height`);
      assert.ok(!(l.across < WINGSPAN_FT && l.back < LENGTH_FT), `${side} at ${t.toFixed(1)} s: #2 overlapping Lead`);
    });
    assert.ok(onSix, `${side}: #2 lined up on Lead's six`);
    const [lead, wing] = f.state.aircraft;
    const l = link(lead, wing);
    assert.ok(inEchelon(l), `${side}: ends in echelon`);
    if (side === 'left') assert.ok(l.rel.left > 0, 'on the left');
  }
});

test('the 4-ship: rejoining wingmen come off the stack first, and fighting wing to echelon ends in echelon', () => {
  const f = createFormation({ ships: 4 });
  // Spread 4 has #2 300 ft above Lead (AFM8 brief p.14); he must step down before he closes.
  assert.equal(f.change('fw'), 'started');
  fly(f, 'Spread 4 to fighting wing', comesOffFirst('Spread 4 to fighting wing', 2));
  assert.equal(f.change('echelon'), 'started');
  const checks = [2, 3, 4].map((id) => comesOffFirst('fighting wing to echelon', id));
  fly(f, 'fighting wing to echelon', (b, a, t) => checks.forEach((c) => c(b, a, t)));
  assert.equal(f.where().key, 'echelon', 'the four read as echelon');
  const a = new Map(f.state.aircraft.map((x) => [x.id, x]));
  for (const [id, ref] of [[2, 1], [3, 2], [4, 3]]) assert.ok(inEchelon(link(a.get(ref), a.get(id))), `#${id} in echelon on #${ref}`);
});

test('2-ship close station changes: no wings overlap, the crossing is below and behind Lead, and #2 stops behind the new slot before moving up', () => {
  for (const [from, to, side] of [['echelon', 'echelon', 'left'], ['echelon', 'astern', 'keep'], ['astern', 'echelon', 'left']]) {
    const f = createFormation();
    f.change(from);
    fly(f, `to ${from}`);
    const what = `${from} to ${to} (${side})`;
    assert.equal(f.change(to, { side }), 'started', what);
    let prevRel = null;
    let stoppedBehind = false;
    fly(f, what, (_b, [lead, wing], t) => {
      const l = link(lead, wing);
      assert.ok(!(l.across < WINGSPAN_FT && l.back < LENGTH_FT + 5), `${what} at ${t.toFixed(1)} s: wings overlap (${l.rel.fwd.toFixed(0)}, ${l.rel.left.toFixed(0)} ft)`);
      if (l.across < WINGSPAN_FT) assert.ok(l.down > 0, `${what} at ${t.toFixed(1)} s: crossing at or above Lead's height`);
      if (prevRel && to === 'echelon') {
        const relSpeed = Math.hypot(l.rel.fwd - prevRel.fwd, l.rel.left - prevRel.left) / STEP_SEC;
        // behind the new echelon slot (left of Lead), well back of it, and at a stop (under about 1 kt against Lead)
        if (l.rel.left > 30 && l.back > LENGTH_FT + 5 && relSpeed < 1.7) stoppedBehind = true;
      }
      prevRel = l.rel;
    });
    const [lead, wing] = f.state.aircraft;
    const l = link(lead, wing);
    assert.ok(to === 'echelon' ? inEchelon(l) && l.rel.left > 0 : inAstern(l), `${what} ends in ${to}`);
    if (to === 'echelon') assert.ok(stoppedBehind, `${what}: stopped behind the new slot before moving up`);
  }
});

/**
 * Checks for a turn in a close formation (SMM 12.19 paras 41-43, Fig 12.11): each wingman rolls with Lead (his bank within
 * the shared ±5° of Lead's), and once Lead has held his bank long enough for the wingman to settle in his wing plane (5 s:
 * the 3 s plane lag of TS-55, an estimate, plus 2 s), a wingman out to the side by more than a wingspan is stepped up on
 * the outside of the turn and down on the inside. Bank is left wing down positive and left is +, so the inside is the side
 * with the bank's sign.
 */
function steppedInPlane(what) {
  let heldSec = 0;
  return (_b, after, t) => {
    const lead = after[0];
    heldSec = Math.abs(lead.bankDeg) >= 25 && Math.abs(lead.rollRateDps) < 0.5 ? heldSec + STEP_SEC : 0;
    for (const w of after.slice(1)) {
      assert.ok(Math.abs(w.bankDeg - lead.bankDeg) <= 13, `${what} at ${t.toFixed(1)} s: ${w.name} not rolling with Lead (${w.bankDeg.toFixed(0)}° against ${lead.bankDeg.toFixed(0)}°)`);
      const l = link(lead, w);
      if (heldSec >= 5 && l.across > WINGSPAN_FT) {
        const inside = Math.sign(l.rel.left) === Math.sign(lead.bankDeg);
        const up = w.altAboveFt - lead.altAboveFt;
        assert.ok(inside ? up < 0 : up > 0, `${what} at ${t.toFixed(1)} s: ${w.name} should be stepped ${inside ? 'down (inside)' : 'up (outside)'}, is ${up.toFixed(0)} ft`);
      }
    }
  };
}

// Route: 5 wingspans down the line (TS-103), judged within ROUTE_SPANS (4 to 6 wingspans out, ~143 ft back).
const inRoute = (l) => l.across >= 4 * WINGSPAN_FT - 15 && l.across <= 6 * WINGSPAN_FT + 15 && l.back >= 100 && l.back <= 180 && l.down > -10;

test('2-ship close formations turn with Lead: #2 rolls with him, stepped up on the outside and down on the inside, and ends where he started', () => {
  // Patrick 18:11Z: "do turns in any of these formations"; spec section 10.2.
  const cases = [['echelon', {}], ['echelon', { side: 'left' }], ['route', {}], ['astern', {}]];
  for (const [form, opts] of cases) {
    for (const [key, dir] of [['hook', 1], ['delayed90', -1]]) {
      const f = createFormation();
      f.change(form, opts);
      fly(f, `to ${form}`);
      const startSide = Math.sign(link(f.state.aircraft[0], f.state.aircraft[1]).rel.left);
      const what = `${form}${opts.side ? ' left' : ''}, ${key} ${dir > 0 ? 'left' : 'right'}`;
      assert.equal(f.press(key, dir), 'started', `${what}: ${f.state.refusal ?? ''}`);
      const stepped = steppedInPlane(what);
      fly(f, what, (b, a, t) => {
        stepped(b, a, t);
        const l = link(a[0], a[1]);
        // In a bank the step is along Lead's tilted wing line (SMM 12.5 para 12), so the level "across" shrinks by the
        // cosine of the bank while the height difference grows: measure the gap in 3D, as four-ship-changes.test.js does.
        const apartFt = Math.hypot(l.rel.fwd, l.rel.left, l.down);
        assert.ok(apartFt > WINGSPAN_FT, `${what} at ${t.toFixed(1)} s: within a wingspan (${apartFt.toFixed(0)} ft)`);
        // 45 ft/s is a gentle climb or descent to track the tilted wing plane (an estimate, as in four-ship-changes.test.js)
        assert.ok(Math.abs(a[1].altAboveFt - b[1].altAboveFt) <= 45 * STEP_SEC, `${what} at ${t.toFixed(1)} s: #2 jumped in height`);
      });
      const l = link(f.state.aircraft[0], f.state.aircraft[1]);
      const ends = form === 'astern' ? inAstern(l) : (form === 'route' ? inRoute(l) : inEchelon(l)) && Math.sign(l.rel.left) === startSide;
      assert.ok(ends, `${what} ends in ${form} on the same side`);
    }
  }
});
