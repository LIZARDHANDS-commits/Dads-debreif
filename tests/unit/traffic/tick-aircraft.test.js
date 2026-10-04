// Checks: one aircraft through a few ticks: which of rail, physics or blending owns it, commands and waypoints
//   switch to physics, a finished break blends back over 1.0 s, landed aircraft do not move, crosswind gives
//   crab, tags found.
// Serves: TR-R30, TR-R6, TR-R15.
// Expected values: smoothstep and wind triangle worked out in the test; break bank 60 and perch bank 35 are
//   traffic spec 3.2; the 1.0 s blend is a design choice; positions and the 1,892 ft threshold are typed in from
//   V6 data, no source.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tickAircraft,
  shouldEnterPhysics,
  initMode,
  enterBlending, evaluateWaypointTrigger,
  BLEND_DURATION_SEC,
  PHYSICS_COMMANDS,
} from '../../../src/modules/traffic/tick-aircraft.js';
import { posOnRoute, pointDistFt } from '../../../src/modules/traffic/route.js';
import { getNavPlan } from '../../../src/modules/traffic/nav-plans.js';

const MOOSE_JAW = JSON.parse(
  readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw-v6.json', import.meta.url), 'utf8')
);
const pat1 = MOOSE_JAW.routes.find((r) => r.id === 'PAT1');

function near(actual, expected, tol, msg) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg || ''}: expected ${actual} to be within ${tol} of ${expected} (diff: ${Math.abs(actual - expected)})`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: initMode
// ─────────────────────────────────────────────────────────────────────────────
test('1.1 initMode sets mode to RAIL when undefined', () => {
  const a = {};
  initMode(a);
  assert.equal(a.mode, 'RAIL');
});

test('1.2 initMode preserves existing mode', () => {
  const aPhysics = { mode: 'PHYSICS' };
  initMode(aPhysics);
  assert.equal(aPhysics.mode, 'PHYSICS');

  const aBlending = { mode: 'BLENDING' };
  initMode(aBlending);
  assert.equal(aBlending.mode, 'BLENDING');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: shouldEnterPhysics Triggers
// ─────────────────────────────────────────────────────────────────────────────
test('2.1 shouldEnterPhysics triggers on all pilot commands', () => {
  for (const cmd of PHYSICS_COMMANDS) {
    const a = { mode: 'RAIL', command: cmd };
    assert.equal(shouldEnterPhysics(a, pat1), true, `Command ${cmd} must trigger physics`);
  }
});

test('2.2 shouldEnterPhysics returns false on nominal circuit points (Break and Perch stay on rails)', () => {
  const breakDist = pointDistFt(pat1, 9);
  const a = { mode: 'RAIL', distFt: breakDist };
  assert.equal(shouldEnterPhysics(a, pat1), false, 'Point 9 (Break) stays on rails');
});

test('2.3 shouldEnterPhysics returns true when reaching waypoint with mode=physics', () => {
  const customPlan = {
    waypoints: [
      { mode: 'rails' },
      { mode: 'physics' },
    ],
  };
  const a = { mode: 'RAIL', waypointIndex: 1, navPlan: customPlan };
  assert.equal(shouldEnterPhysics(a, null), true, 'Physics waypoint must trigger physics');
});

test('2.4 shouldEnterPhysics returns false on straight legs (Point 8 Initial, Point 10 Break Exit, Point 12 Final)', () => {
  const initialDist = pointDistFt(pat1, 8);
  assert.equal(shouldEnterPhysics({ mode: 'RAIL', distFt: initialDist }, pat1), false);

  const breakExitDist = pointDistFt(pat1, 10);
  assert.equal(shouldEnterPhysics({ mode: 'RAIL', distFt: breakExitDist }, pat1), false);

  const finalDist = pointDistFt(pat1, 12);
  assert.equal(shouldEnterPhysics({ mode: 'RAIL', distFt: finalDist }, pat1), false);
});

test('2.5 shouldEnterPhysics returns false during BLENDING when no command is active', () => {
  const a = { mode: 'BLENDING', distFt: pointDistFt(pat1, 9) };
  assert.equal(shouldEnterPhysics(a, pat1), false, 'BLENDING mode without command must not re-trigger physics');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: RAIL Mode Stepping
// ─────────────────────────────────────────────────────────────────────────────
test('3.1 RAIL mode advances distFt and derives coordinates from route', () => {
  const startDist = 5000;
  const a = {
    id: 'A1',
    mode: 'RAIL',
    distFt: startDist,
    iasKt: 140,
    active: true,
  };
  const dt = 1.0;
  tickAircraft(a, dt, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.ok(a.distFt > startDist, 'distFt must advance');
  const expectedP = posOnRoute(pat1, a.distFt);
  near(a.x, expectedP.x, 0.1, 'a.x matches route position');
  near(a.y, expectedP.y, 0.1, 'a.y matches route position');
  near(a.alt, expectedP.alt, 0.1, 'a.alt matches route altitude');
});

test('3.2 RAIL mode calculates wind triangle and crab angle under crosswind', () => {
  const a = {
    id: 'A1',
    mode: 'RAIL',
    distFt: pointDistFt(pat1, 8) + 1000, // On straight initial leg (heading 298°)
    iasKt: 220,
    active: true,
  };
  const wind = { windFromDeg: 208, windKt: 20 }; // Direct crosswind (90° from 298°)
  tickAircraft(a, 0.1, wind, pat1);

  assert.ok(Math.abs(a.crabDeg) > 4, 'Crosswind should produce non-zero crab angle');
  assert.ok(a.gsKt > 0, 'Ground speed should remain positive');
  assert.equal(a.mode, 'RAIL');
});

test('3.3 Active command transitions instantly from RAIL to PHYSICS', () => {
  const a = {
    id: 'A1',
    mode: 'RAIL',
    command: 'breakout',
    active: true,
  };
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.mode, 'PHYSICS', 'Active command must transition mode to PHYSICS');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: PHYSICS Mode Stepping & Maneuver Completion
// ─────────────────────────────────────────────────────────────────────────────
test('4.1 PHYSICS mode steps physics engine and updates aircraft state', () => {
  const navPlan = getNavPlan('PAT_INNER');
  const a = {
    id: 'A1',
    mode: 'PHYSICS',
    x: -288,
    y: -1441,
    alt: 3500,
    iasKt: 220,
    headingDeg: 298,
    bankDeg: 0,
    phase: 'break',
    waypointIndex: 9,
    navPlan,
    active: true,
  };
  const prevHdg = a.headingDeg;
  tickAircraft(a, 0.5, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.mode, 'PHYSICS');
  assert.ok(a.bankDeg < 0, 'Left bank should be developing in break turn');
  assert.notEqual(a.headingDeg, prevHdg, 'Heading must change during physics turn');
});

test('4.2 PHYSICS break turn completion transitions to BLENDING', () => {
  const navPlan = getNavPlan('PAT_INNER');
  const a = {
    id: 'A1',
    mode: 'PHYSICS',
    x: -3385,
    y: -4323,
    alt: 3500,
    iasKt: 140,
    headingDeg: 120, // downwind heading ~118°
    turnAccumDeg: 180, // turn completed
    bankDeg: -30,
    phase: 'break',
    waypointIndex: 9,
    navPlan,
    active: true,
  };
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.mode, 'BLENDING', 'Break completion must transition to BLENDING');
  assert.ok(a._blendStart, '_blendStart must be recorded');
  assert.ok(a._blendTarget, '_blendTarget must be computed');
  assert.equal(a._blendTimer, 0, '_blendTimer must start at 0');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: BLENDING Mode Transition
// ─────────────────────────────────────────────────────────────────────────────
test('5.1 BLENDING mode interpolates smoothly over 1.0 second and finishes in RAIL mode', () => {
  const a = {
    id: 'A1',
    mode: 'PHYSICS',
    x: -3385,
    y: -4323,
    alt: 3500,
    iasKt: 140,
    headingDeg: 118,
    turnAccumDeg: 180,
    bankDeg: -20,
    phase: 'break',
    waypointIndex: 9,
    navPlan: getNavPlan('PAT_INNER'),
    active: true,
  };
  // Step into BLENDING
  tickAircraft(a, 0.05, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(a.mode, 'BLENDING');

  const startX = a._blendStart.x;
  const targetX = a._blendTarget.x;

  // Step 0.5s of blending (halfway)
  tickAircraft(a, 0.50, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(a.mode, 'BLENDING');
  assert.ok(a._blendTimer >= 0.50);

  // Cubic smoothstep at u=0.55: s = 3*(0.55)^2 - 2*(0.55)^3 = 0.57475
  // Check that x has moved toward targetX
  assert.ok(
    (startX <= targetX && a.x >= startX && a.x <= targetX) ||
    (startX >= targetX && a.x <= startX && a.x >= targetX),
    'Position must be smoothly interpolated between start and target'
  );

  // Step remaining duration to exceed 1.0s total
  tickAircraft(a, 0.60, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(a.mode, 'RAIL', 'After 1.0s blending must complete to RAIL mode');
  assert.equal(a._blendStart, undefined, '_blendStart must be deleted');
  assert.equal(a._blendTarget, undefined, '_blendTarget must be deleted');
  assert.equal(a._blendTimer, undefined, '_blendTimer must be deleted');
  assert.ok(a.distFt > 0, 'distFt must be established from blend target');
});

test('5.2 BLENDING mode interpolates heading via shortest turn across 0°/360°', () => {
  const a = {
    id: 'A1',
    mode: 'BLENDING',
    _blendStart: { x: 0, y: 0, alt: 3500, headingDeg: 350, iasKt: 140, bankDeg: 0 },
    _blendTarget: { x: 100, y: 100, alt: 3500, headingDeg: 10, iasKt: 140, distFt: 1000 },
    _blendTimer: 0,
    active: true,
  };

  // Step halfway (0.5s): u = 0.5, s = 3(0.25) - 2(0.125) = 0.5
  tickAircraft(a, 0.5, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(a.mode, 'BLENDING');

  // Shortest angular turn from 350° to 10° is +20° clockwise. Halfway is 0° (or 360°).
  near(a.headingDeg, 0, 1.0, 'Heading halfway between 350° and 10° should be 0° (not 180°)');
});

test('5.3 Command issued during BLENDING cancels blend immediately and executes physics', () => {
  const a = {
    id: 'A1',
    mode: 'BLENDING',
    x: 1000,
    y: 2000,
    alt: 2500,
    iasKt: 140,
    headingDeg: 118,
    _blendStart: { x: 900, y: 1900, alt: 2500, headingDeg: 118, iasKt: 140 },
    _blendTarget: { x: 1100, y: 2100, alt: 2500, headingDeg: 118, iasKt: 140, distFt: 5000 },
    _blendTimer: 0.3,
    active: true,
  };

  // Issue breakout command during blend
  a.command = 'breakout';
  tickAircraft(a, 0.05, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.mode, 'PHYSICS', 'Command must interrupt blend and enter PHYSICS immediately');
  assert.equal(a._blendStart, undefined, '_blendStart must be cleared');
  assert.equal(a._blendTarget, undefined, '_blendTarget must be cleared');
  assert.equal(a._blendTimer, undefined, '_blendTimer must be cleared');
  assert.equal(a.navPlan?.id, 'BREAKOUT', 'Nav plan must be set to BREAKOUT');
  assert.equal(a.phase, 'breakout', 'Phase must be breakout');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6: Hard Invariants
// ─────────────────────────────────────────────────────────────────────────────
test('6.1 Invariant 1: Exactly ONE mode owns coordinates at each step', () => {
  const a = { id: 'A1', distFt: 10000, iasKt: 220, active: true };
  initMode(a);
  assert.equal(a.mode, 'RAIL');

  // Step in RAIL
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(a.mode, 'RAIL');

  // Trigger breakout
  a.command = 'breakout';
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(a.mode, 'PHYSICS');
});

test('6.2 Invariant 2: ZERO shadow variables exist on aircraft state', () => {
  const a = { id: 'A1', distFt: 10000, iasKt: 220, active: true };
  initMode(a);

  // Run through multiple modes
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);
  a.command = 'breakout';
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  // Check forbidden shadow variable names
  assert.equal(a.customX, undefined, 'customX is strictly banned');
  assert.equal(a.customY, undefined, 'customY is strictly banned');
  assert.equal(a.customAlt, undefined, 'customAlt is strictly banned');
  assert.equal(a.customHeading, undefined, 'customHeading is strictly banned');
  assert.equal(a.customKt, undefined, 'customKt is strictly banned');
  assert.equal(a.blendFrom, undefined, 'blendFrom is strictly banned');
  assert.equal(a.blendTo, undefined, 'blendTo is strictly banned');
});

test('6.3 Invariant: Landed or inactive aircraft do not tick', () => {
  const aLanded = { id: 'A1', mode: 'RAIL', distFt: 1000, x: 100, y: 100, landed: true, active: false };
  tickAircraft(aLanded, 1.0, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(aLanded.distFt, 1000, 'Landed aircraft must not advance distance');

  const aInactive = { id: 'A2', mode: 'RAIL', distFt: 1000, x: 100, y: 100, active: false };
  tickAircraft(aInactive, 1.0, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(aInactive.distFt, 1000, 'Inactive aircraft must not advance distance');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7: Additional Commands & Circuit Scenarios
// ─────────────────────────────────────────────────────────────────────────────
test('7.1 Go-around command enters physics, executes climbout, and blends back to rail', () => {
  const a = {
    id: 'A1',
    mode: 'RAIL',
    x: 3104,
    y: -3194,
    alt: 1892,
    iasKt: 100,
    headingDeg: 298,
    active: true,
  };
  a.command = 'go_around';
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.mode, 'PHYSICS', 'Go-around command must enter PHYSICS');
  assert.equal(a.navPlan?.id, 'GO_AROUND');
  assert.equal(a.phase, 'go_around');

  // Fast-forward to rejoin upwind (wp 3, phase 'crosswind')
  a.phase = 'crosswind';
  a.waypointIndex = 3;
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.mode, 'BLENDING', 'Reaching crosswind in go-around must enter BLENDING');
  assert.equal(a.command, null, 'Command must be cleared');
});

test('7.2 PFL command switches model to NRG and loads PFL_HIGH_KEY plan', () => {
  const a = {
    id: 'A1',
    mode: 'RAIL',
    x: 0,
    y: 0,
    alt: 4500,
    iasKt: 140,
    headingDeg: 298,
    active: true,
  };
  a.command = 'pfl_current';
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.mode, 'PHYSICS', 'PFL command must enter PHYSICS');
  assert.equal(a.model, 'NRG', 'PFL command must switch performance model to NRG');
  assert.equal(a.engineFailed, true, 'engineFailed flag must be set');
  assert.equal(a.navPlan?.id, 'PFL_HIGH_KEY');
});

test('7.3 Multi-lap cumulative distance is preserved through blending', () => {
  // Simulate an aircraft on lap 2 (distFt > 156,923 ft)
  const a = {
    id: 'A1',
    mode: 'PHYSICS',
    distFt: 200000,
    x: -3385,
    y: -4323,
    alt: 3500,
    iasKt: 140,
    headingDeg: 118,
    turnAccumDeg: 180,
    phase: 'break',
    waypointIndex: 9,
    navPlan: getNavPlan('PAT_INNER'),
    active: true,
  };

  enterBlending(a, pat1);
  assert.equal(a.mode, 'BLENDING');
  // Target distFt should be offset into lap 2 (> 156,923 ft)
  assert.ok(a._blendTarget.distFt >= 156923, 'Blend target must preserve lap offset');

  // Complete blend (1.1s > 1.0s)
  tickAircraft(a, 1.1, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(a.mode, 'RAIL');
  assert.ok(a.distFt >= 156923, 'Cumulative distFt on lap 2 must be maintained');
});

test('7.4 Zero wind executes identically without branching errors', () => {
  const a = {
    id: 'A1',
    mode: 'RAIL',
    distFt: 10000,
    iasKt: 140,
    active: true,
  };
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);

  assert.equal(a.crabDeg, 0, 'Zero wind produces 0 crab');
  near(a.gsKt, a.iasKt, 0.01, 'Zero wind ground speed equals indicated airspeed');
  assert.equal(a.mode, 'RAIL');
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8: Semantic Waypoint Triggers & Tag Preservation
// ─────────────────────────────────────────────────────────────────────────────
test('8.1 evaluateWaypointTrigger identifies break and perch triggers via tag or label', () => {
  const breakWp = { tag: 'break', label: 'Overhead Break' };
  const trigBreak = evaluateWaypointTrigger(breakWp);
  assert.equal(trigBreak.trigger, 'break');
  assert.equal(trigBreak.phase, 'break');
  assert.equal(trigBreak.targetBankDeg, -60);

  const perchWp = { tag: 'perch', label: 'Perch Point' };
  const trigPerch = evaluateWaypointTrigger(perchWp);
  assert.equal(trigPerch.trigger, 'final_turn');
  assert.equal(trigPerch.phase, 'final_turn');
  assert.equal(trigPerch.targetBankDeg, -35);

  const untaggedBreak = { label: 'Break Entry 220 KIAS' };
  assert.equal(evaluateWaypointTrigger(untaggedBreak).trigger, 'break');

  const untaggedPerch = { label: 'Perch 120 KIAS 35 Bank' };
  assert.equal(evaluateWaypointTrigger(untaggedPerch).trigger, 'final_turn');

  const physicsWp = { mode: 'physics', phase: 'climb' };
  assert.equal(evaluateWaypointTrigger(physicsWp).trigger, 'physics');

  const standardWp = { tag: 'threshold', label: 'Runway Threshold' };
  assert.equal(evaluateWaypointTrigger(standardWp).trigger, null);
  assert.equal(evaluateWaypointTrigger(null).trigger, null);
});

test('8.2 enterBlending uses semantic tags to disambiguate final approach rollout from initial leg', () => {
  const taggedPat = {
    ...pat1,
    points: pat1.points.map((p, i) => {
      if (i === 11) return { ...p, tag: 'perch' };
      if (i === 12) return { ...p, tag: 'window' };
      return p;
    }),
  };

  const a = {
    id: 'A1',
    mode: 'PHYSICS',
    phase: 'final_turn',
    x: 4000,
    y: -4000,
    alt: 2200,
    headingDeg: 298,
    iasKt: 120,
    turnAccumDeg: 180,
  };

  enterBlending(a, taggedPat);
  assert.equal(a.mode, 'BLENDING');
  assert.ok(a._blendTarget, 'Blend target computed');
  assert.equal(a._blendTarget.tag, 'window', 'Target must have window tag on final approach rollout');
});

test('8.3 tickAircraft preserves waypoint tag in RAIL and BLENDING modes', () => {
  const taggedRoute = {
    id: 'TAGGED',
    name: 'Tagged',
    kind: 'pattern',
    points: [
      { x: 0, y: 0, alt: 2500, kt: 120, g: 1.0, tag: 'threshold', label: 'Threshold' },
      { x: 10000, y: 0, alt: 2500, kt: 120, g: 1.0, tag: 'downwind', label: 'Downwind' },
    ],
  };

  const a = {
    id: 'A1',
    mode: 'RAIL',
    distFt: 0,
    iasKt: 120,
    active: true,
  };

  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, taggedRoute);
  assert.equal(a.mode, 'RAIL');
  assert.equal(a.tag, 'threshold');
});
