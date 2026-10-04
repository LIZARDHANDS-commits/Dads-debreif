// Checks: the Closed Pattern command from the departure end at 140 kt: a banked climbing turn (50, 45 and 60
//   degrees) to 3,500 ft, roll-out on downwind, no position jump joining the downwind rail.
// Serves: TR-R33, TR-R8, TR-R13, TR-R15.
//   Also: every closed pattern lands within 3 minutes of the pull-up (Patrick, 4 Oct 09:14Z and 09:26Z; 3 minutes
//   on his card of 4 Oct 18:00Z, since the closed pattern now flies the whole downwind).
//   Also: the flown closed pattern (spec 1a items 16-19) rolls out on the built circuit's inner downwind, climbing
//   in the turn, and hands over level at pattern height (Patrick, 4 Oct 17:53Z).
// Expected values: perch bearing worked out in the test (atan2); 3,500 ft is Patrick's pattern height (TR-R4);
//   50 degrees is traffic spec 3.2 (decision D400); start point and 140 kt are typed in, no source yet.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createSim } from '../../../src/modules/traffic/sim.js';
import { routePath, DEFAULT_ROUTE_OPTIONS } from '../../../src/modules/traffic/route.js';
import { legOffsetsFt } from '../../../src/core/geo.js';
import { compassDegFromVector } from '../../../src/core/angles.js';
import { wrapDeg180 } from '../../../src/core/angles.js';

const mooseJaw = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/modules/traffic/data/moose-jaw.json'), 'utf8')
);

function makeSim(options = {}) {
  return createSim(mooseJaw, {
    seed: 42,
    windFromDeg: 360,
    windKt: 0,
    ...options,
  });
}

test('Closed Pattern: custom bank angles (45° and 60°) via sim.command', () => {
  const sim = makeSim();
  const pat = mooseJaw.routes[0];

  // Spawn aircraft at Departure End
  const id1 = sim.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 2,
    iasKt: 140,
    alt: 2400,
  });

  // Command 45° bank
  sim.command(id1, 'closed_pattern', { bankDeg: 45 });
  const a1 = sim.state().aircraft.find((a) => a.id === id1);
  assert.equal(a1.closedPatternBankDeg, 45);

  for (let t = 0.05; t <= 2.0; t += 0.05) {
    sim.stepTo(t);
  }
  const a1After = sim.state().aircraft.find((a) => a.id === id1);
  assert.ok(a1After.bankDeg <= -40 && a1After.bankDeg >= -45.1, `45° bank should be held, got ${a1After.bankDeg}`);

  // Reset and test 60° bank
  const sim2 = makeSim();
  const id2 = sim2.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 2,
    iasKt: 140,
    alt: 2400,
  });
  sim2.command(id2, 'closed_pattern', { bankDeg: 60 });
  const a2 = sim2.state().aircraft.find((a) => a.id === id2);
  assert.equal(a2.closedPatternBankDeg, 60);

  for (let t = 0.05; t <= 2.0; t += 0.05) {
    sim2.stepTo(t);
  }
  const a2After = sim2.state().aircraft.find((a) => a.id === id2);
  assert.ok(a2After.bankDeg <= -50 && a2After.bankDeg >= -60.1, `60° bank should be rolled toward, got ${a2After.bankDeg}`);
});

test('Closed Pattern: tangent downwind rail capture with zero coordinate jump', () => {
  const sim = makeSim();
  const id = sim.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 2,
    iasKt: 140,
    alt: 2400,
  });

  let captured = false;
  let maxFrameJump = 0;
  let prevPos = null;

  for (let sec = 0.05; sec <= 90.0; sec += 0.05) {
    const sBefore = sim.state().aircraft.find((a) => a.id === id);
    if (!sBefore) break;
    const px = sBefore.x;
    const py = sBefore.y;

    sim.stepTo(sec);

    const sAfter = sim.state().aircraft.find((a) => a.id === id);
    if (!sAfter) break;
    const jump = Math.hypot(sAfter.x - px, sAfter.y - py);
    if (jump > maxFrameJump) maxFrameJump = jump;

    if (sAfter.mode === 'RAIL' && sAfter.phase === 'downwind') {
      captured = true;
      break;
    }
  }

  assert.ok(captured, 'Closed pattern should capture onto downwind rail');
  // At 140 KIAS (148 TAS = ~250 ft/s), 0.05s normal kinematic translation is 12.5 ft.
  // D411 strict guard: maximum frame step movement must never jump > 25 ft.
  assert.ok(
    maxFrameJump <= 25.0,
    `Frame-to-frame movement must not exceed kinematic translation (zero teleportation), max was ${maxFrameJump.toFixed(2)} ft`
  );
});

test('Closed Pattern Preset Point 2 on PAT1 initializes and executes full 4-phase sequence into downwind', () => {
  const sim = makeSim();
  const id = sim.spawn({
    type: 'CT-156',
    routeId: 'PAT1',
    startPoint: 2,
    iasKt: 140,
    alt: 2400,
  });

  const a = sim.state().aircraft.find((ac) => ac.id === id);
  assert.ok(a, 'Aircraft should spawn');
  assert.equal(a.command, 'closed_pattern', 'Should initialize with closed_pattern command');
  assert.equal(a.closedPatternBankDeg, 50, 'Default closed pattern bank should be 50°');

  let enteredDownwind = false;
  for (let sec = 1; sec <= 90; sec++) {
    sim.stepTo(sec);
    const curr = sim.state().aircraft.find((ac) => ac.id === id);
    if (curr.mode === 'RAIL' && (curr.phase === 'downwind' || curr.phase === 'final_turn')) {
      enteredDownwind = true;
      assert.ok(Math.abs(curr.alt - 3500) <= 100, `Downwind altitude should be 3,500 ft MSL (±100 ft), got ${curr.alt}`);
      assert.equal(curr.command, null, 'Command should be cleared');
      break;
    }
  }

  assert.ok(enteredDownwind, 'Preset closed pattern should complete and capture downwind rail');
});

// Patrick, 4 Oct 09:14Z: "an aircraft that begins a closed pattern must land within 2 minutes"; limit set to
// 2.5 minutes with the window moved to 3/4 NM (Patrick's card, 09:26Z), and 3 minutes once the closed pattern
// flies the whole downwind (Patrick's card, 4 Oct 18:00Z). Timed from the pull-up to touchdown; the time
// is mostly the downwind, which runs the length of the runway plus final, so the wind moves it.
test('Closed Pattern: every closed pattern lands within 3 minutes of the pull-up', () => {
  const LIMIT_SEC = 180;
  const RUNWAY_FT = 1880; // the runway's height in the sim, as the touch-and-go check in commands.test.js uses
  const cases = [
    { label: 'from the climb-out, calm', startPoint: 2, windKt: 0, windFromDeg: 360 },
    { label: 'from the climb-out, 20 kt from 200', startPoint: 2, windKt: 20, windFromDeg: 200 },
    { label: 'asked for on final, pulls up past the upwind end, calm', startPoint: 13, windKt: 0, windFromDeg: 360 },
  ];
  for (const c of cases) {
    const sim = createSim({ ...mooseJaw, aircraft: [], windKt: c.windKt, windFromDeg: c.windFromDeg }, { seed: 42 });
    const id = sim.spawn({ routeId: 'PAT1', startPoint: c.startPoint });
    sim.stepTo(1);
    sim.command(id, 'closed_pattern');
    let pullUpAt = null, touchdownAt = null;
    while (sim.t < 400 && touchdownAt === null) {
      sim.stepTo(sim.t + 0.5);
      const a = sim.state().aircraft.find((x) => x.id === id);
      if (pullUpAt === null && a.phase === 'closed_pattern') pullUpAt = sim.t;
      // Touchdown: down to the runway (within 10 ft of its 1,880 ft), or named as a touch-and-go or landing;
      // the circuit loops straight back round without either name (Patrick's card, 10:15Z).
      if (pullUpAt !== null && (a.alt <= RUNWAY_FT + 10 || a.phase === 'touch_and_go' || a.status === 'landed')) touchdownAt = sim.t;
    }
    assert.ok(pullUpAt !== null, `${c.label}: the aircraft should pull up into the closed pattern`);
    assert.ok(touchdownAt !== null, `${c.label}: the aircraft should land again`);
    assert.ok(touchdownAt - pullUpAt <= LIMIT_SEC,
      `${c.label}: landed ${(touchdownAt - pullUpAt).toFixed(0)} s after the pull-up, limit ${LIMIT_SEC} s`);
  }
});

// The flown closed pattern (spec 1a items 16-19; Patrick, 4 Oct 17:53Z): it aims at the inner downwind line of the
// built circuit (from where the break rolls out to the perch), climbs while it turns, and hands over to Pattern 1
// on that line, lined up and level at pattern height (3,500 ft, TR-R4). Margins from the shared table (±100 ft,
// ±5°); the bank setting is a maximum, so the bank stays within it plus the 5° margin.
test('Closed Pattern: rolls out on the inner downwind line, climbing in the turn, and hands over level', () => {
  for (const wind of [{ windKt: 0, windFromDeg: 360 }, { windKt: 20, windFromDeg: 200 }]) {
    const label = `${wind.windKt} kt from ${wind.windFromDeg}`;
    const sim = createSim({ ...mooseJaw, aircraft: [], ...wind }, { seed: 42 });
    const id = sim.spawn({ routeId: 'PAT1', startPoint: 2 });
    const pat = mooseJaw.routes.find((r) => r.id === 'PAT1');
    const built = routePath(pat, { ...DEFAULT_ROUTE_OPTIONS, ...(mooseJaw.routeOptions ?? {}), ...wind }).points;
    const rollout = built.find((p) => p.tag === 'break_rollout') ?? pat.points[10];
    const perch = built.find((p) => p.tag === 'perch') ?? pat.points[11];
    const lineTrack = compassDegFromVector(perch.x - rollout.x, perch.y - rollout.y);
    let climbedTurning = false, maxBank = 0, handOver = null, prevAlt = null;
    while (sim.t < 200 && !handOver) {
      sim.stepTo(sim.t + 0.5);
      const a = sim.state().aircraft.find((x) => x.id === id);
      if (a.phase === 'closed_pattern') {
        maxBank = Math.max(maxBank, Math.abs(a.bankDeg));
        if (Math.abs(a.bankDeg) > 30 && prevAlt !== null && a.alt > prevAlt) climbedTurning = true;
        prevAlt = a.alt;
      } else handOver = a;
    }
    assert.ok(handOver, `${label}: the closed pattern hands over to Pattern 1`);
    assert.ok(climbedTurning, `${label}: it climbs while it turns`);
    assert.ok(maxBank <= 50 + 5, `${label}: bank stays within the 50° setting, got ${maxBank.toFixed(1)}°`);
    const off = legOffsetsFt(rollout, perch, handOver);
    assert.ok(Math.abs(off.crossFt) <= 100, `${label}: on the downwind line at the hand-over, ${off.crossFt.toFixed(0)} ft off`);
    assert.ok(Math.abs(wrapDeg180(handOver.trackDeg - lineTrack)) <= 5, `${label}: lined up with the downwind at the hand-over`);
    assert.ok(Math.abs(handOver.alt - 3500) <= 100, `${label}: level at pattern height at the hand-over, got ${handOver.alt.toFixed(0)} ft`);
    assert.equal(handOver.command, null, `${label}: the closed pattern is over`);
  }
});
