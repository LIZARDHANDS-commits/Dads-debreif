// The cross turn as the SMM flies it (16.19 para 64, Figure 16.21): Lead and the wingman turn toward each other at once, 2 G
// for the first 90 degrees, then 3 G, cross, and roll out after 180 degrees on the reciprocal heading. V6 flew all of it at
// one G, and with the Direction box pointing away from #2 both turned the same way and never crossed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, checkSettings, turnProblem } from '../../../src/modules/turn-sim/settings.js';
import { createRun } from '../../../src/modules/turn-sim/engine/run.js';

const BASE = { ...DEFAULTS, crossTurnSolveSpacing: false, maneuver: 'cross180', turnDeg: 180, startHeadingDeg: 0, formation: 'twoShip', durationSec: 60 };
const TOLERANCE_FT = 120; // Euler steps of 0.05 s: about 19 ft of flying each, and the turn uses the step's end heading

const fromLead = (list, id) => {
  const lead = list.find((a) => a.id === 1);
  const b = list.find((a) => a.id === id);
  const h = lead.headingRad;
  const dx = b.xFt - lead.xFt;
  const dy = b.yFt - lead.yFt;
  return { right: dx * Math.sin(h) - dy * Math.cos(h), ahead: dx * Math.cos(h) + dy * Math.sin(h) };
};

test('two-ship, Direction right and left: they turn toward each other, cross, and end reversed 180 degrees with #2 still on Lead\'s right about 2,000 ft away', () => {
  for (const direction of ['right', 'left']) {
    const run = createRun({ ...BASE, direction });
    const start = run.state.aircraft.map((a) => ({ ...a }));
    const startSide = Math.sign(fromLead(start, 2).right);
    let crossedAt = null;
    let closest = Infinity;
    while (run.step()) {
      const across = fromLead(start.map((s, i) => ({ ...s, xFt: run.state.aircraft[i].xFt, yFt: run.state.aircraft[i].yFt })), 2).right; // in Lead's start frame
      if (crossedAt === null && Math.sign(across) === -startSide) crossedAt = run.state.tSec;
      closest = Math.min(closest, Math.hypot(run.state.aircraft[0].xFt - run.state.aircraft[1].xFt, run.state.aircraft[0].yFt - run.state.aircraft[1].yFt));
    }
    assert.ok(crossedAt !== null && crossedAt > 5 && crossedAt < 15, `${direction}: the tracks cross at about the 90 degree point, ${crossedAt} s`);
    assert.ok(closest < 100, `${direction}: they pass close (${closest.toFixed(0)} ft in the flat sim; the SMM stacks them 300 ft apart)`);
    for (const a of run.state.aircraft) {
      const turned = Math.abs(a.headingRad - start.find((s) => s.id === a.id).headingRad);
      assert.ok(Math.abs(turned - Math.PI) < 2e-4, `${direction} #${a.id} turned ${turned}`);
    }
    const end = fromLead(run.state.aircraft, 2);
    assert.ok(end.right > 0 && Math.abs(end.right - 2000) < TOLERANCE_FT, `${direction}: #2 on Lead's right at ${end.right.toFixed(0)} ft (SMM reference about 2,000)`);
    assert.ok(Math.abs(end.ahead) < TOLERANCE_FT, `${direction}: abeam, ${end.ahead.toFixed(0)} ft ahead`);
  }
});

test('Lead turns toward #2 whichever way the Direction box points, and #2 toward Lead', () => {
  for (const direction of ['right', 'left']) {
    const run = createRun({ ...BASE, direction });
    assert.equal(run.state.leadTurnDirection, 'right', `${direction}: #2 is on Lead's right, so Lead turns right`);
    run.step();
    const [one, two] = run.state.aircraft.map((a) => a.headingRad - Math.PI / 2);
    assert.ok(one < 0 && two > 0, `${direction}: Lead right, #2 left`);
  }
  // With #2 on the other side (D48's setting does not reach the two-ship, so mirror the start heading's side by the heading): Lead follows #2.
  const otherWay = createRun({ ...BASE, direction: 'left', startHeadingDeg: 180 });
  assert.equal(otherWay.state.leadTurnDirection, 'right', 'the side is #2\'s side of Lead\'s nose, so it does not depend on the compass heading');
});

test('two stages: 2 G for the first 90 degrees, then the G setting; the settings say so', () => {
  assert.equal(DEFAULTS.crossTurnFirstG, 2);
  assert.equal(DEFAULTS.crossTurnSwitchDeg, 90);
  const run = createRun({ ...BASE, baseG: 3 });
  const gAt = [];
  let turned = 0;
  let last = run.state.aircraft[0].headingRad;
  while (run.step()) {
    turned += Math.abs(run.state.aircraft[0].headingRad - last);
    last = run.state.aircraft[0].headingRad;
    if (run.state.aircraft[0].turning) gAt.push([turned, run.state.aircraft[0].g]);
  }
  assert.ok(gAt.slice(0, 20).every(([, g]) => g === 2), 'starts at 2 G');
  assert.ok(gAt.filter(([deg]) => deg < Math.PI / 2 - 0.05).every(([, g]) => g === 2), '2 G until 90 degrees');
  assert.ok(gAt.filter(([deg]) => deg > Math.PI / 2 + 0.05).every(([, g]) => g === 3), 'then 3 G');
  // A different first G or switch point moves the ending: more G first means a tighter first half.
  const wide = createRun({ ...BASE, crossTurnFirstG: 2 });
  const tight = createRun({ ...BASE, crossTurnFirstG: 4 });
  while (wide.step()); while (tight.step());
  assert.ok(fromLead(wide.state.aircraft, 2).right > fromLead(tight.state.aircraft, 2).right + 500, 'the first G changes where they end');
});

test('Patrick 09:28Z: the cross turn is a two-ship turn too', () => {
  for (const formation of ['weighted', 'weightedReverse', 'offsetBox']) {
    assert.match(turnProblem(formation, 'cross180'), /two-ship/);
    assert.equal(checkSettings({ ...BASE, formation }).maneuver, DEFAULTS.maneuver);
    assert.match(createRun({ ...BASE, formation }).state.maneuverFallback, /two-ship/);
  }
});

test('the roll-out spacing: both fly 2 G then the same solved G, and end spacingFt apart, abreast, sides swapped, both directions', () => {
  for (const direction of ['right', 'left']) {
    const run = createRun({ ...BASE, direction, crossTurnSolveSpacing: true });
    const start = run.state.aircraft.map((a) => ({ ...a }));
    const gs = { 1: new Set(), 2: new Set() };
    while (run.step()) for (const a of run.state.aircraft) if (a.turning) gs[a.id].add(a.g);
    const end = fromLead(run.state.aircraft, 2);
    assert.ok(Math.abs(end.right - 6000) < 200, `${direction}: #2 ends ${end.right.toFixed(0)} ft to Lead's right, want 6,000`);
    assert.ok(Math.abs(end.ahead) < 200, `${direction}: abreast, #2 ${end.ahead.toFixed(0)} ft ahead`);
    for (const a of run.state.aircraft) assert.ok(Math.abs(Math.abs(a.headingRad - start.find((s) => s.id === a.id).headingRad) - Math.PI) < 2e-4, `${direction} #${a.id} reversed`);
    assert.equal(gs[1].size, 2, 'Lead: 2 G, then the solved G');
    assert.deepEqual([...gs[1]].sort(), [...gs[2]].sort(), 'both aircraft fly the same G set');
    const solved = [...gs[1]].find((g) => g !== 2);
    assert.ok(Math.abs(solved - 1.57) < 0.05, `solved G ${solved} at 6,000 ft (about 1.6)`);
    assert.equal(run.state.crossTurnSpacingNote.clamped, false);
    assert.ok(Math.abs(run.state.crossTurnSpacingNote.solvedG - solved) < 1e-9);
    assert.ok(Math.abs(run.state.crossTurnSpacingNote.spacingFt - 6000) < 1, 'the note gives the spacing it reached');
  }
});

test('the SMM check: at 220 kt and 4,000 ft (the LAB minimum) the solved G is 3.0, the SMM\'s 60/2 then 70/3, within 0.05 G', () => {
  const run = createRun({ ...BASE, spacingFt: 4000, speedKt: 220, crossTurnSolveSpacing: true });
  const g = run.state.crossTurnSpacingNote.solvedG;
  assert.ok(Math.abs(g - 3) < 0.05, `solved G ${g}`);
  while (run.step());
  const end = fromLead(run.state.aircraft, 2);
  assert.ok(Math.abs(end.right - 4000) < 200 && Math.abs(end.ahead) < 200, `ends ${end.right.toFixed(0)} right, ${end.ahead.toFixed(0)} ahead`);
});

test('the solve can be turned off (about 2,000 ft as before), and the G is clamped with a note when the spacing cannot be reached', () => {
  const fixed = createRun({ ...BASE, crossTurnSolveSpacing: false });
  while (fixed.step());
  assert.ok(Math.abs(fromLead(fixed.state.aircraft, 2).right - 2000) < 150);
  assert.equal(fixed.state.crossTurnSpacingNote, null);
  // 12,000 ft would need a radius no G above 1.1 makes: clamped at 1.1 G, and the note says what it reached.
  const far = createRun({ ...BASE, spacingFt: 20000, crossTurnSolveSpacing: true });
  while (far.step());
  assert.equal(far.state.crossTurnSpacingNote.clamped, true);
  assert.equal(far.state.crossTurnSpacingNote.solvedG, 1.1);
  assert.ok(far.state.crossTurnSpacingNote.spacingFt < 20000);
  // 200 ft: the first 90 degrees at 2 G alone already carry each aircraft past that, so no G is tight enough: clamped at the top G.
  const tight = createRun({ ...BASE, spacingFt: 200, crossTurnSolveSpacing: true });
  assert.equal(tight.state.crossTurnSpacingNote.clamped, true, 'a small spacing needs more G than is available');
  assert.ok(tight.state.crossTurnSpacingNote.solvedG > 3);
});
