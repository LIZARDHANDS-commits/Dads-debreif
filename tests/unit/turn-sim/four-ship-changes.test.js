// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// ============================================================================

// Changing formation, 4-ship (docs/modules/turn-sim/spec.md section 8, decision TS-54). Checks that the four fly
// right (Patrick, 4 Oct 11:50Z: "no dumb tests"): each press ends in the formation pressed, link by link, on the side
// asked; nothing snaps; nobody runs into anybody; the speeds end where Patrick put them; in a turning rejoin to finger
// each waits for the one ahead; and a press that can't be flown is refused with nothing moved.
//
// The bands are written out here from the manuals and rulings (page references only), not read back from the code:
//  - Spread 4: each link abeam at the spacing, sweep 0-10° (SMM 16.18 para 49), the stack #2 +300, #3 -300, #4 -600
//    (AFM8 brief p.14).
//  - Fighting wing: each link 500-1,000 ft and 30-60° off the preceding aircraft, #3 and #4 on the side opposite #2
//    (SMM 12.29 para 69, 16.38 paras 104-107; Patrick 11:44Z).
//  - Fluid 4: #3 abeam Lead at 6,000 ft (AFM8 brief p.20); #2 and #4 in fighting wing off Lead and #3.
//  - Offset box: the second element 6,000-8,000 ft behind (SMM 16.41 para 109); #2 abeam Lead at the spacing.
//  - Finger: #2 in echelon on its side, #3 in echelon on the other side, #4 in echelon outside #3 (SMM 16.32; AFM7 p.19).
//  - Echelon: all three on one side, #3 outside #2 and #4 outside #3. Box: #4 in line astern on Lead (SMM 16.32
//    para 91). Line astern: each behind the one ahead (SMM 16.32 paras 89-90). Route: 1 to 3 wingspans out (SMM 12.6
//    para 15).
//  - The close positions use the 2-ship spec table's own margins (section 10: echelon 45 ft out, 25 back, 5 down,
//    ±15/±15/±10 ft, estimates); the wide ones the shared table (±100 ft, ±5°, ±10 kt).
//  - Speeds: 200 KIAS outside line abreast, 220 in it (Patrick, 4 Oct 11:08Z).
//  - A turning rejoin to finger: #3 joins only once #2 is in place, #4 only once #3 is (SMM 16.34 para 96).
// No time gates: 10 minutes per press only catches a plan that never ends (design section 9 estimates Spread 4 to finger
// at 4 to 6 minutes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';
import { relativeTo } from '../../../src/modules/turn-sim/live/manoeuvres.js';
import { ROLL, STEP_SEC } from '../../../src/modules/turn-sim/live/flight.js';

const DEG = Math.PI / 180;
const WINGSPAN_FT = 33.4; // T-6A wingspan (SMM 12.6 para 15 counts in wingspans)
const SPACING_FT = 6000; // the Setup default
const STACK = { 2: 300, 3: -300, 4: -600 }; // AFM8 brief p.14
const CATCH_SEC = 600;
const KIAS = { spread4: 220, offsetBox: 220 }; // Patrick 11:08Z; everything else 200

const byId = (aircraft) => new Map(aircraft.map((a) => [a.id, a]));
const link = (ref, wing) => {
  const rel = relativeTo(ref, wing);
  return { rel, across: Math.abs(rel.left), back: -rel.fwd, down: ref.altAboveFt - wing.altAboveFt, range: Math.hypot(rel.fwd, rel.left), side: Math.sign(rel.left) };
};
const abeam = (l, gap) => Math.abs(l.across - gap) <= 100 && Math.atan2(l.back, l.across) / DEG <= 15 && Math.atan2(l.back, l.across) / DEG >= -5;
const fwLink = (l) => l.range >= 400 && l.range <= 1100 && Math.atan2(l.back, l.across) / DEG >= 25 && Math.atan2(l.back, l.across) / DEG <= 65;
const echelonLink = (l) => Math.abs(l.across - 45) <= 15 && Math.abs(l.back - 25) <= 15 && Math.abs(l.down - 5) <= 10;
const asternLink = (l) => l.across <= 10 && l.back > 0 && l.back - 33.5 <= 30 && l.down >= 0;
const routeLink = (l) => l.across >= WINGSPAN_FT - 10 && l.across <= 3 * WINGSPAN_FT + 10 && Math.abs(l.rel.fwd) <= 75 && l.down > -10;

/**
 * Where the four are, against formation `key` with #2 on side s (+1 left, -1 right). Returns a list of what is wrong
 * (empty when it is right), in words a pilot would use.
 */
function wrongs(key, aircraft, s, spacingFt = SPACING_FT) {
  const a = byId(aircraft);
  const L = a.get(1);
  const out = [];
  const want = (ok, words) => { if (!ok) out.push(words); };
  switch (key) {
    case 'spread4': {
      const l2 = link(L, a.get(2));
      const l3 = link(L, a.get(3));
      const l4 = link(a.get(3), a.get(4));
      want(abeam(l2, spacingFt) && l2.side === s, '#2 abeam Lead on its side');
      want(abeam(l3, spacingFt) && l3.side === -s, '#3 abeam Lead on the other side');
      want(abeam(l4, spacingFt) && l4.side === -s, '#4 abeam #3, outside');
      for (const id of [2, 3, 4]) want(Math.abs(a.get(id).altAboveFt - L.altAboveFt - STACK[id]) <= 100, `#${id} on the stack`);
      break;
    }
    case 'fw': {
      const l2 = link(L, a.get(2));
      const l3 = link(a.get(2), a.get(3));
      const l4 = link(a.get(3), a.get(4));
      want(fwLink(l2) && l2.side === s, '#2 in fighting wing on Lead, on its side');
      want(fwLink(l3) && l3.side === -s, '#3 in fighting wing on #2, opposite side');
      want(fwLink(l4) && l4.side === -s, '#4 in fighting wing on #3, opposite side');
      break;
    }
    case 'fluid4': {
      const l2 = link(L, a.get(2));
      const l3 = link(L, a.get(3));
      const l4 = link(a.get(3), a.get(4));
      want(fwLink(l2) && l2.side === s, '#2 in fighting wing on Lead');
      want(abeam(l3, 6000) && l3.side === -s, '#3 abeam Lead at 6,000 ft');
      want(fwLink(l4), '#4 in fighting wing on #3');
      break;
    }
    case 'offsetBox': {
      const l2 = link(L, a.get(2));
      const l3 = link(L, a.get(3));
      const l4 = link(a.get(3), a.get(4));
      want(abeam(l2, spacingFt) && l2.side === s, '#2 abeam Lead');
      want(l3.back >= 6000 - 100 && l3.back <= 8000 + 100, 'the second element 6,000-8,000 ft behind');
      want(abeam(l4, spacingFt), '#4 abeam #3');
      break;
    }
    case 'finger': {
      const l2 = link(L, a.get(2));
      const l3 = link(L, a.get(3));
      const l4 = link(a.get(3), a.get(4));
      want(echelonLink(l2) && l2.side === s, '#2 in echelon on Lead, its side');
      want(echelonLink(l3) && l3.side === -s, '#3 in echelon on Lead, the other side');
      want(echelonLink(l4) && l4.side === -s, '#4 in echelon on #3, outside');
      break;
    }
    case 'echelon': {
      const l2 = link(L, a.get(2));
      const out3 = link(L, a.get(3));
      const out4 = link(L, a.get(4));
      want(echelonLink(l2) && l2.side === s, '#2 in echelon on Lead');
      want(out3.side === s && out3.across > l2.across + 15, '#3 outside #2');
      want(out4.side === s && out4.across > out3.across + 15, '#4 outside #3');
      break;
    }
    case 'box': {
      const l2 = link(L, a.get(2));
      const l3 = link(L, a.get(3));
      want(echelonLink(l2) && l2.side === s, '#2 in echelon on its side');
      want(echelonLink(l3) && l3.side === -s, '#3 in echelon on the other side');
      want(asternLink(link(L, a.get(4))), '#4 in line astern on Lead');
      break;
    }
    case 'trail':
      want(asternLink(link(L, a.get(2))), '#2 behind Lead');
      want(asternLink(link(a.get(2), a.get(3))), '#3 behind #2');
      want(asternLink(link(a.get(3), a.get(4))), '#4 behind #3');
      break;
    case 'route': {
      const l2 = link(L, a.get(2));
      const l3 = link(L, a.get(3));
      const l4 = link(a.get(3), a.get(4));
      want(routeLink(l2) && l2.side === s, '#2 in route on its side');
      want(routeLink(l3) && l3.side === -s, '#3 in route on the other side');
      want(routeLink(l4) && l4.side === -s, '#4 in route outside #3');
      break;
    }
    default:
      out.push(`no check for ${key}`);
  }
  return out;
}

/** Flies until nothing is flown or queued, checking what is always true on every step; each(before, after) adds a press's own checks. */
function fly(f, label, each = () => {}) {
  const t0 = f.state.tSec;
  let before = f.state.aircraft.map((a) => ({ ...a }));
  let minApartFt = Infinity;
  while (f.state.current || f.state.queued) {
    f.step();
    const after = f.state.aircraft.map((a) => ({ ...a }));
    for (let k = 0; k < after.length; k++) {
      const [b, n] = [before[k], after[k]];
      // No snaps: the roll rate and position move as an aircraft can (ROLL is the T-6's 90°/s, TS-36).
      assert.ok(Math.abs(n.bankDeg - b.bankDeg) <= ROLL.maxRateDps * STEP_SEC + 1e-6, `${label}: ${n.name ?? n.id} rolled faster than it can`);
      const moved = Math.hypot(n.xFt - b.xFt, n.yFt - b.yFt);
      assert.ok(Math.abs(moved - b.tasFtps * STEP_SEC) <= 0.1 * b.tasFtps * STEP_SEC, `${label}: ${n.id} jumped`);
      assert.ok(Math.abs(n.altAboveFt - b.altAboveFt) <= 40 * STEP_SEC, `${label}: ${n.id} jumped in height`); // 40 ft/s is a gentle climb or descent, an estimate
      // Physical limits always hold: a T-6 can't bank past the vertical in level flight.
      assert.ok(Math.abs(n.bankDeg) < 90, `${label}: ${n.id} bank`);
    }
    for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) {
      minApartFt = Math.min(minApartFt, Math.hypot(after[i].xFt - after[j].xFt, after[i].yFt - after[j].yFt, after[i].altAboveFt - after[j].altAboveFt));
    }
    each(before, after);
    before = after;
    assert.ok(f.state.tSec - t0 <= CATCH_SEC, `${label}: the change finished`);
  }
  // Nobody hits anybody: never closer than a wingspan, centre to centre.
  assert.ok(minApartFt > WINGSPAN_FT, `${label}: two aircraft came within a wingspan (${minApartFt.toFixed(0)} ft)`);
}

/** Presses `to` (with options) and flies it; checks it ends in that formation at its speed. */
function changeTo(f, to, options = {}, s) {
  const label = `${to}${options.side ? ` ${options.side}` : ''}${options.rejoin ? ` (${options.rejoin})` : ''}`;
  assert.equal(f.change(to, options), 'started', `${label}: ${f.state.refusal ?? ''}`);
  fly(f, label);
  const side = s ?? f.where().side;
  assert.deepEqual(wrongs(to, f.state.aircraft, side, f.state.spacingFt), [], label);
  for (const a of f.state.aircraft) assert.ok(Math.abs(a.kias - (KIAS[to] ?? 200)) <= 10, `${label}: ${a.id} at ${KIAS[to] ?? 200} KIAS`);
}

for (const wingSide of ['right', 'left']) {
  const s = wingSide === 'left' ? 1 : -1;
  test(`4-ship, #2 on the ${wingSide}: a tour of the formations, each ending in the formation pressed`, () => {
    const f = createFormation({ ships: 4, wingSide });
    changeTo(f, 'fw', {}, s);
    changeTo(f, 'fluid4', {}, s);
    changeTo(f, 'offsetBox', {}, s);
    changeTo(f, 'fw', {}, s);
    changeTo(f, 'finger', {}, s);
    changeTo(f, 'echelon', {}, s);
    changeTo(f, 'finger', {}, s);
    changeTo(f, 'box', {}, s);
    changeTo(f, 'finger', {}, s);
    changeTo(f, 'route', {}, s);
    changeTo(f, 'finger', {}, s);
    changeTo(f, 'trail', {}, 0);
    changeTo(f, 'finger', { side: wingSide }, s);
    changeTo(f, 'fw', {}, s);
    changeTo(f, 'spread4', {}, s);
  });
}

test('4-ship: the Side switch moves #2 across (finger and echelon both ways), and the straight-ahead rejoins end in place', () => {
  const f = createFormation({ ships: 4, wingSide: 'right' });
  changeTo(f, 'fw', { rejoin: 'straight' }, -1);
  changeTo(f, 'finger', { rejoin: 'straight' }, -1);
  changeTo(f, 'echelon', { side: 'left' }, 1);
  changeTo(f, 'finger', { side: 'right' }, -1);
  changeTo(f, 'echelon', { side: 'right' }, -1);
  changeTo(f, 'finger', { side: 'left' }, 1);
  changeTo(f, 'spread4', {}, 1);
});

test('4-ship: in the turning rejoin to finger, #3 joins only once #2 is in, and #4 only once #3 is', () => {
  const f = createFormation({ ships: 4, wingSide: 'right' });
  changeTo(f, 'fw', {}, -1);
  assert.equal(f.change('finger'), 'started');
  const joined = {}; // the first time each is within 100 ft of the aircraft it joins (Lead for #2 and #3, #3 for #4)
  while (f.state.current) {
    f.step();
    const a = byId(f.state.aircraft);
    for (const [id, ref] of [[2, 1], [3, 1], [4, 3]]) {
      if (joined[id] === undefined && link(a.get(ref), a.get(id)).range <= 100) joined[id] = f.state.tSec;
    }
  }
  assert.ok(joined[2] <= joined[3] && joined[3] <= joined[4], `joined in order #2, #3, #4 (${joined[2]}, ${joined[3]}, ${joined[4]})`);
  assert.deepEqual(wrongs('finger', f.state.aircraft, -1), []);
});

test('4-ship: a press that cannot be flown is refused with nothing moved, and a press during a change waits its turn', () => {
  const f = createFormation({ ships: 4, wingSide: 'right' });
  const before = f.state.aircraft.map((a) => ({ ...a }));
  assert.equal(f.change('fluidMan'), 'refused'); // the live build, later
  assert.ok(f.state.refusal);
  assert.equal(f.change('spread4'), 'refused'); // already there
  assert.deepEqual(f.state.aircraft.map((a) => [a.xFt, a.yFt, a.altAboveFt]), before.map((a) => [a.xFt, a.yFt, a.altAboveFt]));
  assert.equal(f.change('fw'), 'started');
  assert.equal(f.change('finger'), 'queued');
  fly(f, 'fighting wing then finger');
  assert.deepEqual(wrongs('finger', f.state.aircraft, -1), []);
  // G-warm flies from Spread 4 only: in finger it is refused, and the four stay put. (The turn buttons fly in finger
  // now, Patrick 18:11Z: tested below.)
  assert.equal(f.press('gWarm'), 'refused');
  assert.equal(f.state.current, null);
});

test('4-ship: the turn buttons turn every formation, each wingman rolling with Lead in his wing plane, and the four end in the formation they started in', () => {
  // Patrick 18:11Z: "do turns in any of these formations"; spec section 10.2. In the close formations each wingman rolls
  // with Lead (bank within the shared ±5°) and, once Lead has held his bank 5 s (the 3 s plane lag of TS-55, an estimate,
  // plus 2 s), a wingman more than a wingspan out to the side is stepped up on the outside and down on the inside (SMM 12.19
  // paras 41-43, Fig 12.11; 16.36 paras 99-102). In fighting wing each stays in his band and ends there (AFM7 brief p.14).
  for (const form of ['finger', 'echelon', 'box', 'trail', 'route', 'fw']) {
    for (const [key, dir] of [['delayed90', 1], ['hook', -1]]) {
      const f = createFormation({ ships: 4, wingSide: 'right' });
      changeTo(f, 'fw', {}, -1);
      if (form !== 'fw') changeTo(f, form, {}, form === 'trail' ? 0 : -1);
      const what = `${form}, ${key} ${dir > 0 ? 'left' : 'right'}`;
      assert.equal(f.press(key, dir), 'started', `${what}: ${f.state.refusal ?? ''}`);
      let heldSec = 0;
      fly(f, what, (_b, after) => {
        if (form === 'fw') return;
        const L = after[0];
        heldSec = Math.abs(L.bankDeg) >= 25 && Math.abs(L.rollRateDps) < 0.5 ? heldSec + STEP_SEC : 0;
        for (const w of after.slice(1)) {
          assert.ok(Math.abs(w.bankDeg - L.bankDeg) <= 5, `${what}: #${w.id} not rolling with Lead`);
          const l = link(L, w);
          if (heldSec >= 5 && l.across > WINGSPAN_FT) {
            const inside = l.side === Math.sign(L.bankDeg);
            const up = w.altAboveFt - L.altAboveFt;
            assert.ok(inside ? up < 0 : up > 0, `${what}: #${w.id} should be stepped ${inside ? 'down (inside)' : 'up (outside)'}, is ${up.toFixed(0)} ft`);
          }
        }
      });
      assert.deepEqual(wrongs(form, f.state.aircraft, form === 'trail' ? 0 : -1), [], `${what} ends in ${form}`);
    }
  }
});
