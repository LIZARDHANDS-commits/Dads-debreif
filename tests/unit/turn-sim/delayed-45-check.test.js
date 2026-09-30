// The Delayed 45 with the check turn (verification N3; SMM 16.19 Figures 16.17, 16.34 and 16.31; decision D148). The figures are described
// here in my own words, with no text copied from the manual.
//
// Reading of Figure 16.17 (two aircraft), both panels: the aircraft that turns first flies its standard 45 (70/3) toward the other.
// The other flies a check turn of 10 to 15 degrees toward the first once the first has established its 45, then turns the rest of its 45
// (45 plus the check) when the first has gone through its tail and reaches about 7 or 5 o'clock (5 in a right turn, 7 in a left). Both roll
// out on the 45 heading. The figure marks two positions for the wingman at the end and notes that the geometry needs extra speed to hold the
// sweep, and that spacing and sweep errors are fixed on the roll-out. So the end state is abreast but tight, not the plain turn's 6,000 ft,
// and the turn takes less time.
// Figure 16.34 (spread 4, right panel): the outside aircraft, #2, completes a standard 45 to the right; every other member then flies a check
// of 10 to 15 degrees toward it, and Lead, #3 and #4 complete their standard 45 in turn as the aircraft before them passes the tail. The result
// is a compact wedge, not the plain chain's string. The figure notes that #2, #3 and #4 fix spacing and sweep errors on the roll-out, and that
// the aircraft need altitude separation to stay clear.
// Figure 16.31 (offset box, right): #2 completes a standard 45 to the right, then Lead flies a 10 to 15 degree check into #2 and turns its 45.
// The second element flies the same flow a little later and rolls out with the offset; the figure gives that delay as 10 to 15 s.
// MIRRORED: in this engine's box #2 is on Lead's RIGHT, while the figure draws it on Lead's LEFT, so the picture is the mirror. The rule used
// is the same: the outside aircraft of each pair turns its plain 45 and the other checks (Lead is the outside aircraft in a right turn here).
// The rear element flies the same flow later by the shift that puts it in the box slots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, checkSettings } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

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
    assert.ok(startedAt[second] > 2.5 && startedAt[second] < 4, `${direction}: #${second} checks as #${first} establishes its 45, at ${startedAt[second]}`);
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
    assert.ok(Math.abs(end.right) > 3000 && Math.abs(end.right) < 4500, `${direction}: ${Math.abs(end.right).toFixed(0)} ft apart`);
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
        assert.ok(startedAt[id] > 2.5 && startedAt[id] < 4, `${label} #${id}: checks as #${first} establishes, at ${startedAt[id]}`);
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
