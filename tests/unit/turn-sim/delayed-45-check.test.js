// The Delayed 45 with the check turn (verification N3; SMM 16.19 Figs 16.17, 16.34 and 16.31; decision D148). Summaries in my own words:
// - Fig 16.17 (two-ship): one aircraft turns its 45 at once; the other checks 10-15 degrees toward it, then turns 45 plus the check at the
//   figure's clock cue (5 right, 7 left). Both end on the 45 heading, abreast and tighter than the plain turn's spacing, and quicker.
// - Fig 16.34 (spread 4): the outside aircraft turns plain; the rest check 10-15 degrees, then turn in order. The result is a compact wedge.
// - Fig 16.31 (box): the same rule for each pair; the rear element follows by a shift that keeps the box's shape.
// In this engine's box #2 is on Lead's right, so the pictures are the mirror of the figure's: Lead is the outside aircraft in a right turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, MANEUVER_TURN_DEG, checkSettings } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';
import { OFFSET_BOX_OUTSIDE_FT } from '../../../src/modules/turn-sim/engine/formation.js';
import { planCheckChain } from '../../../src/modules/turn-sim/engine/check-plan.js';

// The tests below fly the figure's cue as it falls (the default, about 3,900 ft apart); the solved spacing has its own tests at the end.
const BASE = { ...DEFAULTS, maneuver: 'delayed45away', turnDeg: 45, startHeadingDeg: 0, durationSec: 20, timing: 'time', formation: 'twoShip' };

function fly(settings) {
  const run = createRun(settings);
  const start = run.state.aircraft.map((a) => ({ ...a }));
  const startedAt = {};
  const swing = {}; // the most each aircraft turned toward the first turner's side, in degrees, signed by the final turn's way
  let minSepFt = Infinity;
  while (run.step()) {
    const list = run.state.aircraft;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.turning && startedAt[a.id] === undefined) startedAt[a.id] = run.state.tSec;
      const d = (a.headingRad - start[i].headingRad) * 180 / Math.PI;
      swing[a.id] = swing[a.id] || { min: 0, max: 0 };
      swing[a.id].min = Math.min(swing[a.id].min, d);
      swing[a.id].max = Math.max(swing[a.id].max, d);
      for (let j = i + 1; j < list.length; j++) minSepFt = Math.min(minSepFt, Math.hypot(a.xFt - list[j].xFt, a.yFt - list[j].yFt));
    }
  }
  return { run, start, startedAt, swing, minSepFt };
}

const fromLead = (list, id) => {
  const lead = list.find((a) => a.id === 1);
  const b = list.find((a) => a.id === id);
  const h = lead.headingRad;
  const dx = b.xFt - lead.xFt;
  const dy = b.yFt - lead.yFt;
  return { right: dx * Math.sin(h) - dy * Math.cos(h), ahead: dx * Math.cos(h) + dy * Math.sin(h) };
};

test('the setting: delayed45Check is auto by default and the check is 12.5 degrees; auto keeps the two-ship plain', () => {
  assert.equal(DEFAULTS.delayed45Check, 'auto');
  assert.equal(DEFAULTS.checkTurnDeg, 12.5);
  assert.equal(checkSettings({ delayed45Check: 'check' }).delayed45Check, 'check');
  assert.equal(checkSettings({ delayed45Check: 'sideways' }).delayed45Check, 'auto');
  const { startedAt } = fly({ ...BASE, direction: 'right' });
  const second = Math.max(startedAt[1], startedAt[2]);
  assert.ok(Math.abs(second - 38.6) < 0.2, `the plain two-ship Delayed 45 is unchanged: the second turns at ${second}`);
});

test('two-ship with the check, both directions: the first turns 45 at once, the other checks toward it as it establishes, and both roll out on the 45', () => {
  for (const direction of ['right', 'left']) {
    const { run, start, startedAt, swing } = fly({ ...BASE, direction, delayed45Check: 'check' });
    const turn = direction === 'right' ? -1 : 1;
    const [first, second] = startedAt[1] < startedAt[2] ? [1, 2] : [2, 1];
    assert.ok(startedAt[first] < 0.1, `${direction}: #${first} turns at once`);
    assert.ok(Math.abs(startedAt[second] - 3.3) < 0.2, `${direction}: #${second} checks as #${first} establishes its 45 (45 degrees takes 3.2 s at 3 G), at ${startedAt[second]}`);
    // The check is toward the first: against the 45's way, 12.5 degrees. Nobody turns more than the 45.
    const against = turn === -1 ? swing[second].max : -swing[second].min;
    assert.ok(Math.abs(against - 12.5) < 0.6, `${direction}: the check is ${against.toFixed(1)} degrees toward the first`);
    for (const id of [1, 2]) {
      const most = Math.max(swing[id].max, -swing[id].min);
      assert.ok(most < 45.1, `${direction} #${id}: no more than 45 degrees, ${most.toFixed(2)}`);
    }
    assert.ok(Math.abs(Math.max(swing[first].max, -swing[first].min) - 45) < 0.1 && (turn === -1 ? swing[first].max < 0.1 : swing[first].min > -0.1), 'the first only turns its 45');
    for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (start[0].headingRad + turn * Math.PI / 4)) < 2e-4, `${direction} #${a.id}: on the 45 heading`);
  }
});

test('two-ship with the check: rolls out abreast (within 300 ft), sides swapped, and tight of 6,000 ft (the figure\'s sweep to fix), clear of each other', () => {
  for (const direction of ['right', 'left']) {
    const { run, start, minSepFt } = fly({ ...BASE, direction, delayed45Check: 'check' });
    const end = fromLead(run.state.aircraft, 2);
    assert.ok(Math.abs(end.ahead) < 300, `${direction}: ${end.ahead.toFixed(0)} ft ahead, want abreast`);
    assert.ok(Math.sign(end.right) === -Math.sign(fromLead(start, 2).right), `${direction}: sides swapped`);
    // Measured 3,924 ft at 6,000: the check moves the wingman toward the track it then flies. The figure says to fix it on the roll-out.
    assert.ok(Math.abs(Math.abs(end.right) - 3924) < 150, `${direction}: ${Math.abs(end.right).toFixed(0)} ft apart, want 3,924`);
    assert.ok(minSepFt >= 1000, `${direction}: closest pass ${minSepFt.toFixed(0)} ft`);
    assert.deepEqual(run.state.crossings, [], 'no designed crossing');
  }
});

test('two-ship with the check is much shorter than the plain chain: about 40 s where the plain Delayed 45 takes 52', () => {
  const plain = createRun({ ...BASE, direction: 'right', delayed45Check: 'none' });
  while (plain.step());
  const check = createRun({ ...BASE, direction: 'right', delayed45Check: 'check' });
  while (check.step());
  assert.ok(check.state.durationSec < plain.state.durationSec - 8, `check ${check.state.durationSec.toFixed(1)} s, plain ${plain.state.durationSec.toFixed(1)} s`);
});

test('the check is a setting, 10 to 15 degrees: every value in the band flies the check and rolls out on the 45', () => {
  for (const checkTurnDeg of [10, 12.5, 15]) {
    const { run, start, swing } = fly({ ...BASE, direction: 'right', delayed45Check: 'check', checkTurnDeg });
    assert.ok(Math.abs(swing[2].max - checkTurnDeg) < 0.6 || Math.abs(swing[1].max - checkTurnDeg) < 0.6, `${checkTurnDeg}: swing ${JSON.stringify(swing)}`);
    for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (start[0].headingRad - Math.PI / 4)) < 2e-4);
  }
});

test('the clock cue flies the plain turn (its cue is the plan), whatever the check setting says', () => {
  const run = createRun({ ...BASE, direction: 'right', delayed45Check: 'check', timing: 'clock', clockCuePos: 'auto', durationSec: 100 });
  const swing = { min: 0, max: 0 };
  const h0 = run.state.aircraft[1].headingRad;
  while (run.step()) {
    const d = (run.state.aircraft[1].headingRad - h0) * 180 / Math.PI;
    swing.min = Math.min(swing.min, d);
    swing.max = Math.max(swing.max, d);
  }
  assert.ok(swing.max < 0.1, 'no check turn to the left');
});

const four = (formation, direction, extra = {}) => fly({ ...BASE, formation, direction, durationSec: 20, ...extra });

test('4312 and 2134, both directions (Fig 16.34): the outside aircraft turns its 45, the rest check toward it together, all end on the 45 heading', () => {
  for (const formation of ['weighted', 'weightedReverse']) {
    for (const direction of ['right', 'left']) {
      const label = `${formation} ${direction}`;
      const { run, start, startedAt, swing } = four(formation, direction);
      const turn = direction === 'right' ? -1 : 1;
      const first = Number(Object.entries(startedAt).sort((a, b) => a[1] - b[1])[0][0]);
      assert.ok(startedAt[first] < 0.1, `${label}: #${first} turns at once`);
      for (const id of [1, 2, 3, 4].filter((x) => x !== first)) {
        assert.ok(Math.abs(startedAt[id] - 3.3) < 0.2, `${label} #${id}: checks as #${first} establishes (3.2 s), at ${startedAt[id]}`);
        const against = turn === -1 ? swing[id].max : -swing[id].min;
        assert.ok(Math.abs(against - 12.5) < 0.6, `${label} #${id}: check ${against.toFixed(1)} degrees toward the first`);
      }
      for (const id of [1, 2, 3, 4]) assert.ok(Math.max(swing[id].max, -swing[id].min) < 45.1, `${label} #${id}: no more than 45 degrees (well under 60)`);
      for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (start[0].headingRad + turn * Math.PI / 4)) < 2e-4, `${label} #${a.id}: on the 45 heading`);
    }
  }
});

test('4312 and 2134 with the check: line abreast on the 45 (within 400 ft), the order reversed, about 3,700 ft between neighbours, clear of each other', () => {
  for (const formation of ['weighted', 'weightedReverse']) {
    for (const direction of ['right', 'left']) {
      const label = `${formation} ${direction}`;
      const { run, start, minSepFt } = four(formation, direction);
      const ids = [1, 2, 3, 4];
      const endRight = Object.fromEntries(ids.map((id) => [id, fromLead(run.state.aircraft, id).right]));
      const startRight = Object.fromEntries(ids.map((id) => [id, fromLead(start, id).right]));
      const order = (r) => [...ids].sort((a, b) => r[a] - r[b]).join('');
      assert.equal(order(endRight), [...order(startRight)].reverse().join(''), `${label}: the order across is reversed`);
      for (const id of ids) assert.ok(Math.abs(fromLead(run.state.aircraft, id).ahead) < 400, `${label} #${id}: ${fromLead(run.state.aircraft, id).ahead.toFixed(0)} ft ahead`);
      const across = ids.map((id) => endRight[id]).sort((a, b) => a - b);
      for (let i = 1; i < 4; i++) assert.ok(across[i] - across[i - 1] > 3300 && across[i] - across[i - 1] < 4300, `${label}: neighbours ${(across[i] - across[i - 1]).toFixed(0)} ft apart`);
      assert.ok(minSepFt >= 1000, `${label}: closest pass ${minSepFt.toFixed(0)} ft`);
      assert.deepEqual(run.state.crossings, [], `${label}: no designed crossing`);
    }
  }
});

test('4312 and 2134 with the check take about 90 s where the plain chain takes 129 s (0, 39, 77, 116): at least a quarter shorter', () => {
  for (const formation of ['weighted', 'weightedReverse']) {
    const plain = four(formation, 'right', { delayed45Check: 'none' });
    const check = four(formation, 'right');
    assert.ok(plain.run.state.durationSec > 125, `plain ${plain.run.state.durationSec.toFixed(1)}`);
    assert.ok(check.run.state.durationSec < plain.run.state.durationSec * 0.75, `${formation}: check ${check.run.state.durationSec.toFixed(1)} s, plain ${plain.run.state.durationSec.toFixed(1)} s`);
  }
});

test('the plain chain stays selectable in the four-ship formations: delayed45Check none gives the 39 s steps as before', () => {
  const { startedAt } = four('weighted', 'right', { delayed45Check: 'none' });
  Object.values(startedAt).sort((a, b) => a - b).forEach((t, i) => assert.ok(Math.abs(t - i * 38.6) < 0.4, `start ${i} at ${t}`));
});

test('offset box, both directions (Fig 16.31): the front pair flies the check flow, the rear element the same flow later, and the box ends in its slots', () => {
  for (const direction of ['right', 'left']) {
    const label = `box ${direction}`;
    const { run, start, startedAt, swing, minSepFt } = four('offsetBox', direction);
    const turn = direction === 'right' ? -1 : 1;
    for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - (start[0].headingRad + turn * Math.PI / 4)) < 2e-4, `${label} #${a.id}: on the 45 heading`);
    for (const id of [1, 2, 3, 4]) assert.ok(Math.max(swing[id].max, -swing[id].min) < 45.1, `${label} #${id}: no more than 45 degrees`);
    // The front pair: one plain, the other checks 12.5 degrees toward it; then abreast (within 300 ft), tight like the two-ship.
    const frontChecker = startedAt[1] > startedAt[2] ? 1 : 2;
    const against = turn === -1 ? swing[frontChecker].max : -swing[frontChecker].min;
    assert.ok(Math.abs(against - 12.5) < 0.6, `${label}: #${frontChecker} checks ${against.toFixed(1)} degrees toward the first`);
    const two = fromLead(run.state.aircraft, 2);
    assert.ok(Math.abs(two.ahead) < 300 && Math.abs(two.right) > 3000 && Math.abs(two.right) < 4500, `${label}: front pair ${two.ahead.toFixed(0)} ahead, ${Math.abs(two.right).toFixed(0)} apart`);
    // The rear element: slot order across Lead's final heading, Box aft behind. 500 ft: the fit is by least squares on one shift.
    const side = Math.sign(two.right);
    const three = fromLead(run.state.aircraft, 3);
    const fourth = fromLead(run.state.aircraft, 4);
    assert.ok(three.right * side > 0 && three.right * side < two.right * side, `${label}: #3 between Lead and #2 (${three.right.toFixed(0)})`);
    assert.ok(fourth.right * side > two.right * side, `${label}: #4 outside #2 (${fourth.right.toFixed(0)})`);
    assert.ok(Math.abs(-three.ahead - DEFAULTS.boxAftFt) < 500 && Math.abs(-fourth.ahead - DEFAULTS.boxAftFt) < 500, `${label}: aft ${(-three.ahead).toFixed(0)} and ${(-fourth.ahead).toFixed(0)}, want ${DEFAULTS.boxAftFt}`);
    assert.ok(minSepFt >= 1000, `${label}: closest pass ${minSepFt.toFixed(0)} ft`);
    assert.deepEqual(run.state.crossings, [], `${label}: no designed crossing`);
    assert.ok(run.state.offsetBox && run.state.offsetBox.rear.length === 2, `${label}: the rear shift is in state.offsetBox`);
  }
});

test('offset box with the check is shorter than the plain chain in a right turn (77 s against 90 s) and no longer in a left, and the plain chain stays selectable', () => {
  const plain = four('offsetBox', 'right', { delayed45Check: 'none' });
  const check = four('offsetBox', 'right');
  assert.ok(check.run.state.durationSec < plain.run.state.durationSec - 10, `check ${check.run.state.durationSec.toFixed(1)} s, plain ${plain.run.state.durationSec.toFixed(1)} s`);
  const left = { plain: four('offsetBox', 'left', { delayed45Check: 'none' }), check: four('offsetBox', 'left') };
  assert.ok(left.check.run.state.durationSec <= left.plain.run.state.durationSec + 1, 'left: not longer');
  assert.ok(Object.values(plain.startedAt).sort((a, b) => a - b).at(-1) > 70, 'the plain box chain still ends at 77 s');
});

// The roll-in solve (checkSolveSpacing, default false, an option): the check version's ends 3,900 ft apart on the figure's cue, under the SMM's 4,000 to 6,000 ft LAB.
// Each aircraft's roll-in is solved so the spacing is the Spacing setting. One parameter cannot also zero the fore and aft: with the check at 12.5 degrees
// the wingman rolls out 1,231 ft aft of abreast in the two-ship and #4 of a four-ship 2,751 ft aft (the figure draws it about 2,000 ft aft and says the
// errors are fixed on the roll-out); the aft error is proportional to the check angle (486 ft at 5 degrees, 3,081 at 30).
const SOLVED = { checkSolveSpacing: true, delayed45Check: 'check' };

test('with the solve on, a wingman rolls out at the Spacing setting: two-ship, 4312, 2134 and the box front pair, within 1%', () => {
  assert.equal(DEFAULTS.checkSolveSpacing, false, 'off by default: the figure\'s cue, abreast and quicker');
  for (const spacingFt of [4000, 6000]) {
    for (const [formation, ids] of [['twoShip', [2]], ['weighted', [2, 3, 4]], ['weightedReverse', [2, 3, 4]], ['offsetBox', [2]]]) {
      for (const direction of ['right', 'left']) {
        const { run, minSepFt } = four(formation, direction, { ...SOLVED, spacingFt });
        const label = `${formation} ${direction} ${spacingFt}`;
        const across = [1, ...ids].map((id) => fromLead(run.state.aircraft, id).right).sort((a, b) => a - b);
        const steps = ids.length === 1 || formation === 'offsetBox' ? [Math.abs(across[1] - across[0])] : across.slice(1).map((r, i) => r - across[i]);
        for (const gap of steps) assert.ok(Math.abs(gap - spacingFt) < spacingFt * 0.01, `${label}: ${gap.toFixed(0)} ft between neighbours, want ${spacingFt}`);
        assert.ok(minSepFt >= 900, `${label}: closest pass ${minSepFt.toFixed(0)} ft`);
      }
    }
  }
});

test('the aft error the solve leaves is stated: two-ship about 1,200 ft, a four-ship\'s #4 under 3,000 ft, all behind the first turner; the fixed version is abreast', () => {
  for (const direction of ['right', 'left']) {
    const two = four('twoShip', direction, SOLVED);
    const back = Math.abs(fromLead(two.run.state.aircraft, 2).ahead);
    assert.ok(back > 800 && back < 1600, `two-ship ${direction}: ${back.toFixed(0)} ft off abreast`);
    for (const formation of ['weighted', 'weightedReverse']) {
      const { run } = four(formation, direction, SOLVED);
      for (const id of [2, 3, 4]) assert.ok(Math.abs(fromLead(run.state.aircraft, id).ahead) < 3000, `${formation} ${direction} #${id}: ${fromLead(run.state.aircraft, id).ahead.toFixed(0)} ft off abreast`);
      assert.deepEqual(run.state.crossings, []);
    }
  }
  const fixed = four('twoShip', 'right', { checkSolveSpacing: false, delayed45Check: 'check' });
  assert.ok(Math.abs(fromLead(fixed.run.state.aircraft, 2).ahead) < 300 && Math.abs(fromLead(fixed.run.state.aircraft, 2).right) < 4500, 'false: the figure\'s cue as it falls');
});

test('the solved check version is still shorter than the plain chain (two-ship 46 s against 52, 4312 112 s against 129) and turns no aircraft past 45', () => {
  for (const [formation, gain] of [['twoShip', 4], ['weighted', 12]]) {
    const plain = four(formation, 'right', { delayed45Check: 'none' });
    const check = four(formation, 'right', SOLVED);
    assert.ok(check.run.state.durationSec < plain.run.state.durationSec - gain, `${formation}: check ${check.run.state.durationSec.toFixed(1)} s, plain ${plain.run.state.durationSec.toFixed(1)} s`);
    for (const id of Object.keys(check.swing)) assert.ok(Math.max(check.swing[id].max, -check.swing[id].min) < 45.1);
  }
});

test('under the clock cue the plain 45 is flown in every formation: no aircraft turns toward the others first, whatever the check setting says', () => {
  for (const formation of ['twoShip', 'weighted', 'offsetBox']) {
    const run = createRun({ ...BASE, formation, direction: 'right', delayed45Check: 'check', timing: 'clock', clockCuePos: 'auto', durationSec: 250 });
    const h0 = run.state.aircraft.map((a) => a.headingRad);
    let most = 0;
    while (run.step()) run.state.aircraft.forEach((a, i) => { most = Math.max(most, a.headingRad - h0[i]); });
    assert.ok(most < 0.001, `${formation}: no check turn to the left (most ${most})`);
  }
});

test('the check turn setting is the figure\'s 10 to 15 degrees: anything else goes back to 12.5', () => {
  for (const ok of [10, 12.5, 15]) assert.equal(checkSettings({ checkTurnDeg: ok }).checkTurnDeg, ok);
  for (const bad of [5, 9.9, 15.1, 30, 'wide']) assert.equal(checkSettings({ checkTurnDeg: bad }).checkTurnDeg, 12.5, `${bad}`);
});

test('a 15 degree check at 4,000 ft spacing: every pair is 1,000 ft apart or more, or the close pass is reported in state.closePasses', () => {
  let reported = 0;
  for (const formation of ['twoShip', 'weighted', 'weightedReverse', 'offsetBox']) {
    for (const direction of ['right', 'left']) {
      for (const checkSolveSpacing of [false, true]) {
        const { run, minSepFt } = four(formation, direction, { delayed45Check: 'check', spacingFt: 4000, checkTurnDeg: 15, checkSolveSpacing });
        const label = `${formation} ${direction} solve ${checkSolveSpacing}`;
        const close = run.state.closePasses;
        if (minSepFt >= 1000) assert.deepEqual(close, [], `${label}: nothing to report at ${minSepFt.toFixed(0)} ft`);
        else {
          assert.ok(close.length > 0 && close.every((c) => c.minFt < 1000 && c.minFt >= 300), `${label}: closest ${minSepFt.toFixed(0)} ft is reported: ${JSON.stringify(close)}`);
          assert.ok(Math.abs(Math.min(...close.map((c) => c.minFt)) - minSepFt) < 1, `${label}: the reported pass is the closest`);
          reported++;
        }
      }
    }
  }
  // Measured: the four-ship formations pass 894 ft apart (4312 and 2134); the two-ship and the box 1,058 ft.
  assert.ok(reported >= 8, `the four-ship close passes are reported (${reported} runs)`);
});

test('at the default 6,000 ft and 12.5 degrees nothing is close: closePasses is empty in every formation', () => {
  for (const formation of ['twoShip', 'weighted', 'weightedReverse', 'offsetBox']) {
    for (const direction of ['right', 'left']) assert.deepEqual(four(formation, direction, { delayed45Check: 'check' }).run.state.closePasses, [], `${formation} ${direction}`);
  }
});

test('no step turns an aircraft faster than the 3 G rate (omega x 0.05 s) plus the roll-out snap, in every check run', () => {
  const omega = 220 * 1.68781 / (220 * 1.68781 * 220 * 1.68781 / (32.174 * Math.sqrt(8))); // v / R at 3 G
  const perStep = omega * 0.05;
  for (const formation of ['twoShip', 'weighted', 'offsetBox']) {
    for (const direction of ['right', 'left']) {
      const run = createRun({ ...BASE, formation, direction, delayed45Check: 'check', durationSec: 20 });
      let last = run.state.aircraft.map((a) => a.headingRad);
      let worst = 0;
      while (run.step()) {
        run.state.aircraft.forEach((a, i) => { worst = Math.max(worst, Math.abs(a.headingRad - last[i])); });
        last = run.state.aircraft.map((a) => a.headingRad);
      }
      // The end snaps onto the exact heading, which is within 0.0001 rad of where the step left it.
      assert.ok(worst <= perStep + 2e-4, `${formation} ${direction}: the biggest step ${worst.toFixed(5)} rad against ${perStep.toFixed(5)}`);
    }
  }
});

test('the box with the check: the rear shift is in state.offsetBox (36.7 s right, 1.0 s left) for both rear aircraft', () => {
  for (const [direction, want] of [['right', 36.74], ['left', 0.96]]) {
    const run = createRun({ ...BASE, formation: 'offsetBox', direction, delayed45Check: 'check' });
    assert.deepEqual(run.state.offsetBox.rear.map((r) => r.id), [3, 4]);
    for (const r of run.state.offsetBox.rear) assert.ok(Math.abs(r.delaySec - want) < 0.1, `${direction} #${r.id}: ${r.delaySec}`);
    assert.deepEqual(run.state.offsetBox.rear.map((r) => r.outsideBand), [true, true], 'outside the 10 to 15 s band, and flagged');
  }
});

test('Auto timing flies the check too: the same check turn and the same 45 heading as the Time timing', () => {
  for (const formation of ['twoShip', 'weighted']) {
    const timed = fly({ ...BASE, formation, direction: 'right', delayed45Check: 'check', timing: 'time', durationSec: 20 });
    const auto = fly({ ...BASE, formation, direction: 'right', delayed45Check: 'check', timing: 'auto', durationSec: 20 });
    for (const id of Object.keys(timed.swing)) {
      assert.ok(Math.abs(auto.swing[id].max - timed.swing[id].max) < 0.1 && Math.abs(auto.swing[id].min - timed.swing[id].min) < 0.1, `${formation} #${id}: the same swings`);
    }
    assert.ok(Math.abs(auto.run.state.durationSec - timed.run.state.durationSec) < 0.11, `${formation}: the same run`);
    assert.ok(Math.max(...Object.values(auto.swing).map((w) => w.max)) > 12, `${formation}: the check is flown`);
  }
});

test('no cue found: a chain that starts too late for the search to see the predecessor gets no hold (the roll-in follows the check at once)', () => {
  const mk = (id, x) => ({ id, xFt: x, yFt: 0, headingRad: Math.PI / 2, turnDir: -1, delayErrSec: 0, gError: 0, active: false, done: false, legIndex: 0, legAccumRad: 0, legReadySec: 0, turnAccumRad: 0 });
  const chain = [mk(1, 0), mk(2, 6000)];
  const opts = { goalRad: Math.PI / 4, checkRad: 12.5 * Math.PI / 180, speedFtps: 220 * 1.68781, baseG: 3, cueHours: 5, direction: 'right', useErrors: false, spacingFt: 0 };
  planCheckChain(chain, { ...opts, startSec: 0 });
  assert.ok(chain[1].legs[1].holdSec > 15 && chain[1].legs[1].holdSec < 40, `a normal plan waits for the cue: ${chain[1].legs[1].holdSec}`);
  planCheckChain(chain, { ...opts, startSec: 450 });
  assert.equal(chain[1].legs[1].holdSec, 0, 'the search ends at 400 s before the check has even started: hold 0, not the placeholder');
  planCheckChain(chain, { ...opts, startSec: 0, spacingFt: 6000 });
  assert.ok(chain[1].legs[1].holdSec > 0 && chain[1].legs[1].holdSec < 100, 'the spacing solve keeps the hold in range');
});

test('state.delayed45CheckFlown says which Delayed 45 is flown: auto is the check in four-ships only, none and clock are plain, check forces it', () => {
  const flown = (over) => createRun({ ...DEFAULTS, maneuver: 'delayed45away', turnDeg: 45, ...over }).state.delayed45CheckFlown;
  assert.equal(flown({ formation: 'weighted', delayed45Check: 'auto' }), true);
  assert.equal(flown({ formation: 'offsetBox', delayed45Check: 'auto' }), true);
  assert.equal(flown({ formation: 'twoShip', delayed45Check: 'auto' }), false);
  assert.equal(flown({ formation: 'twoShip', delayed45Check: 'check' }), true);
  assert.equal(flown({ formation: 'weighted', delayed45Check: 'none' }), false);
  assert.equal(flown({ formation: 'weighted', delayed45Check: 'check', timing: 'clock' }), false);
  assert.equal(flown({ formation: 'weighted', maneuver: 'delayed90away', turnDeg: 90 }), false);
});

test('crossings and closePasses never share a pair: the box hook right has crossings 1-3 and 2-4 and no close passes', () => {
  const hook = createRun({ ...DEFAULTS, formation: 'offsetBox', maneuver: 'hook90', turnDeg: 180, direction: 'right' }).state;
  assert.deepEqual(hook.crossings.map((c) => `${c.a}-${c.b}`), ['1-3', '2-4']);
  assert.deepEqual(hook.closePasses, []);
  for (const formation of ['twoShip', 'weighted', 'weightedReverse', 'offsetBox']) {
    for (const maneuver of ['delayed90away', 'delayed45away', 'hook90']) {
      const state = createRun({ ...DEFAULTS, formation, maneuver, turnDeg: MANEUVER_TURN_DEG[maneuver], spacingFt: 4000, delayed45Check: 'check', checkTurnDeg: 15 }).state;
      const crossing = new Set(state.crossings.map((c) => `${c.a}-${c.b}`));
      for (const c of state.closePasses) assert.ok(!crossing.has(`${c.a}-${c.b}`), `${formation} ${maneuver}: ${c.a}-${c.b} is in both`);
    }
  }
});

// The check flown at 45 degrees, the figures' case, pinned bit for bit before the other angles fall back (recheck of #223, C1):
// end positions and headings [x, y, heading] per aircraft, and [tSec, history rows], from the engine as it was.
const PIN_45 = {
  twoShipRight: { ends: [[19314.136026408796,19932.435485798553,0.7853981633974487],[16476.604678335592,22644.28802513301,0.7853981633974483]], time: [75.04999999999788,1502] },
  weightedLeft: { ends: [[-5857.063162173927,29229.72293931696,2.356194490192345],[-3180.944660303087,31758.5808677902,2.356194490192345],[-8533.181664044436,26700.865010842223,2.356194490192345],[-11370.713012117532,23989.012471507747,2.3561944901923506]], time: [90.499999999997,1811] },
  boxRight: { ends: [[19747.36269478551,20365.662154175265,0.7853981633974487],[16909.831346712304,23077.514693509722,0.7853981633974483],[13098.223262759484,17362.466572149086,0.7853981633974487],[10239.527037041078,20078.876768227325,0.7853981633974483]], time: [76.69999999999779,1535] },
  boxLeft: { ends: [[-10476.604678335654,22644.288025133013,2.356194490192345],[-13314.136026408698,19932.435485798535,2.3561944901923506],[-7192.878183492142,15757.602264677615,2.356194490192345],[-10051.57440921091,13041.192068600365,2.3561944901923506]], time: [75.04999999999788,1502] },
};
const PIN_RUN = {
  twoShipRight: { formation: 'twoShip', direction: 'right', delayed45Check: 'check' },
  weightedLeft: { formation: 'weighted', direction: 'left' },
  boxRight: { formation: 'offsetBox', direction: 'right' },
  boxLeft: { formation: 'offsetBox', direction: 'left', boxAftFt: 7000 },
};

test('Turn degrees 45 flies the check exactly as before (two-ship, 4312, box)', () => {
  for (const [name, over] of Object.entries(PIN_RUN)) {
    const run = createRun({ ...DEFAULTS, maneuver: 'delayed45away', turnDeg: 45, startHeadingDeg: 0, timing: 'time', ...over });
    while (run.step());
    assert.equal(run.state.delayed45CheckFlown, true, name);
    assert.deepEqual(run.state.aircraft.map((a) => [a.xFt, a.yFt, a.headingRad]), PIN_45[name].ends, name);
    assert.deepEqual([run.state.tSec, run.history().length], PIN_45[name].time, name);
  }
});

// C1 of the recheck of #223: the check's cue is the figures' 5 or 7 o'clock, worked out for a 45. At any other Turn degrees the run ended
// far from spacing (1,804 ft apart at 30, 9,283 ft apart and 3,936 ft aft at 70), so the check is flown at 45 only. Anywhere else the plain
// chain is flown, which adapts to the angle, and state.checkFallback says why.
test('C1: the check falls back to the plain chain at any Turn degrees but 45, and says why (two-ship, 4312, both settings)', () => {
  for (const turnDeg of [30, 60, 70]) {
    for (const [formation, delayed45Check] of [['twoShip', 'check'], ['weighted', 'auto'], ['weighted', 'check'], ['weightedReverse', 'auto']]) {
      const label = `${formation} ${delayed45Check} ${turnDeg}`;
      const settings = { ...DEFAULTS, maneuver: 'delayed45away', turnDeg, formation, delayed45Check, startHeadingDeg: 0, timing: 'time', direction: 'right' };
      const run = createRun(settings);
      assert.equal(run.state.delayed45CheckFlown, false, label);
      assert.match(run.state.checkFallback, /45/, label);
      const plain = createRun({ ...settings, delayed45Check: 'none' });
      while (run.step());
      while (plain.step());
      assert.equal(plain.state.checkFallback, null, `${label}: nothing to say when the check was not asked for`);
      assert.deepEqual(run.state.aircraft.map((a) => [a.xFt, a.yFt, a.headingRad]), plain.state.aircraft.map((a) => [a.xFt, a.yFt, a.headingRad]), `${label}: the plain chain`);
      // The plain chain ends on spacing: the pair the plain turn rolls out (about 5,900 ft in the two-ship at 6,000 ft spacing).
      const a = run.state.aircraft;
      const spacing = Math.hypot(a[0].xFt - a[1].xFt, a[0].yFt - a[1].yFt);
      assert.ok(spacing > 4500 && spacing < 7500, `${label}: ends ${spacing.toFixed(0)} ft apart`);
    }
  }
});

test('C1: nothing to say when there is nothing to fall back from: 45 flies the check, the plain styles and the clock cue and the two-ship on Auto stay quiet', () => {
  const state = (over) => createRun({ ...DEFAULTS, maneuver: 'delayed45away', startHeadingDeg: 0, ...over }).state;
  assert.equal(state({ turnDeg: 45, formation: 'weighted' }).checkFallback, null);
  assert.equal(state({ turnDeg: 45, formation: 'weighted' }).delayed45CheckFlown, true);
  assert.equal(state({ turnDeg: 30, formation: 'twoShip' }).checkFallback, null, 'the two-ship is plain on Auto whatever the angle');
  assert.equal(state({ turnDeg: 30, formation: 'weighted', delayed45Check: 'none' }).checkFallback, null);
  assert.equal(state({ turnDeg: 30, formation: 'weighted', timing: 'clock' }).checkFallback, null, 'the clock cue flies the plain turn anyway');
  assert.equal(state({ turnDeg: 90, formation: 'weighted', maneuver: 'delayed90away' }).checkFallback, null);
});

// C9 of the recheck of #223: the rear shift was held at 0 s or more, so at Box aft 6,000 in a left turn #3 and #4 missed their slots by 438 and
// 978 ft. The shift may be negative now (the front element waits), and the box keeps its shape from 5,000 to 8,000 ft aft.
test('C9: the box ends in its shape at Box aft 5,000, 6,000, 7,000 and 8,000 ft, both directions, and a negative shift is flown as the front element waiting', () => {
  let sawNegative = false;
  for (const direction of ['right', 'left']) {
    for (const boxAftFt of [5000, 6000, 7000, 8000]) {
      const label = `box ${direction} aft ${boxAftFt}`;
      const { run, start, startedAt } = four('offsetBox', direction, { boxAftFt, durationSec: 100 });
      const at = (id) => run.state.aircraft.find((a) => a.id === id);
      const h = at(1).headingRad;
      const fwd = { x: Math.cos(h), y: Math.sin(h) };
      const span = Math.hypot(at(2).xFt - at(1).xFt, at(2).yFt - at(1).yFt);
      const u = { x: (at(2).xFt - at(1).xFt) / span, y: (at(2).yFt - at(1).yFt) / span };
      const target3 = { x: (at(1).xFt + at(2).xFt) / 2 - fwd.x * boxAftFt, y: (at(1).yFt + at(2).yFt) / 2 - fwd.y * boxAftFt };
      const target4 = { x: at(2).xFt + u.x * OFFSET_BOX_OUTSIDE_FT - fwd.x * boxAftFt, y: at(2).yFt + u.y * OFFSET_BOX_OUTSIDE_FT - fwd.y * boxAftFt };
      const miss3 = Math.hypot(at(3).xFt - target3.x, at(3).yFt - target3.y);
      const miss4 = Math.hypot(at(4).xFt - target4.x, at(4).yFt - target4.y);
      assert.ok(miss3 < 700 && miss4 < 550, `${label}: #3 misses by ${miss3.toFixed(0)} ft, #4 by ${miss4.toFixed(0)} ft`);
      const shift = run.state.offsetBox.rear[0].delaySec;
      assert.equal(run.state.offsetBox.rear[1].delaySec, shift, label);
      if (shift < 0) {
        sawNegative = true;
        // The rear element starts with the run and the front element waits.
        const rearStart = Math.min(startedAt[3], startedAt[4]);
        const frontStart = Math.min(startedAt[1], startedAt[2]);
        assert.ok(rearStart < 0.1 && Math.abs(frontStart + shift) < 0.2, `${label}: front waits ${frontStart.toFixed(2)} s for a shift of ${shift.toFixed(2)}`);
      }
      for (const a of run.state.aircraft) assert.ok(Math.abs(a.headingRad - start.find((s) => s.id === 1).headingRad - (direction === 'right' ? -1 : 1) * Math.PI / 4) < 2e-4, `${label} #${a.id}: on the 45 heading`);
    }
  }
  assert.ok(sawNegative, 'a left turn at Box aft 6,000 wants the rear element first');
});
