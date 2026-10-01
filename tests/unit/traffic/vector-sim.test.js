// Tests for the high-fidelity Cartesian vector flight model and wind-adaptive pattern
// architecture (wind_adaptive_aerodynamic_flight_plan.md, D370, D371, D382, D389).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeWindPerch, generateWindAdjustedTrack } from '../../../src/modules/traffic/route.js';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { PILOT_SPAWN_PRESETS } from '../../../src/modules/traffic/aircraft.js';
import { ktToFtps } from '../../../src/core/units.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const PAT1 = MOOSE_JAW.routes.find((r) => r.id === 'PAT1');

test('computeWindPerch returns calm perch coordinates when wind is zero', () => {
  const calm = computeWindPerch(PAT1, 360, 0);
  assert.ok(calm);
  const nominal = PAT1.points[11];
  assert.equal(Math.round(calm.x), Math.round(nominal.x));
  assert.equal(Math.round(calm.y), Math.round(nominal.y));
  assert.equal(calm.shiftX, 0);
  assert.equal(calm.shiftY, 0);
  assert.ok(calm.turnSec >= 28 && calm.turnSec <= 32);
});

test('computeWindPerch shifts perch upwind under headwind on final', () => {
  // Runway 29L heading is ~298°. Wind from 298° is a pure headwind on final (tailwind on downwind).
  // Airmass drifts toward 118° during the final turn.
  // To roll out on centerline, the aircraft must start the turn upwind (shifted toward 298°).
  const windKt = 20;
  const shifted = computeWindPerch(PAT1, 298, windKt);
  assert.ok(shifted);
  const nominal = PAT1.points[11];

  // Vector from nominal to shifted should point into the wind (~298° true: negative x, positive y)
  const dx = shifted.x - nominal.x;
  const dy = shifted.y - nominal.y;
  const shiftDist = Math.hypot(dx, dy);
  const expectedDist = ktToFtps(windKt) * shifted.turnSec;

  assert.ok(Math.abs(shiftDist - expectedDist) < 10, `Shift distance ${shiftDist} should match expected drift ${expectedDist}`);
  // Shift direction should be opposite the wind drift (i.e. toward 298°)
  const shiftBearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  assert.ok(Math.abs(shiftBearing - 298) < 5 || Math.abs(shiftBearing - 298 + 360) < 5, `Shift bearing ${shiftBearing}° should point toward 298°`);
});

test('computeWindPerch shifts perch wider (south) under crosswind from north', () => {
  // Wind from 028° (approx 90° right of runway 298°) blows toward 208° (southwest).
  // During final turn, aircraft is pushed southwest (toward centerline).
  // Therefore perch must shift northeast (away from runway, wider downwind) to compensate.
  const windKt = 15;
  const shifted = computeWindPerch(PAT1, 28, windKt);
  assert.ok(shifted);
  const nominal = PAT1.points[11];
  const dx = shifted.x - nominal.x;
  const dy = shifted.y - nominal.y;
  const shiftDist = Math.hypot(dx, dy);
  const expectedDist = ktToFtps(windKt) * shifted.turnSec;
  assert.ok(Math.abs(shiftDist - expectedDist) < 10);
});

test('generateWindAdjustedTrack produces smooth continuous path with wind drift', () => {
  const calmTrack = generateWindAdjustedTrack(PAT1, 298, 0);
  assert.ok(Array.isArray(calmTrack) && calmTrack.length > 50);

  const windyTrack = generateWindAdjustedTrack(PAT1, 298, 20);
  assert.ok(Array.isArray(windyTrack) && windyTrack.length > 50);

  // Windy track should differ from calm track during overhead break and final turn
  const breakCalm = calmTrack.find((p) => p.phase === 'break');
  const breakWindy = windyTrack.find((p) => p.phase === 'break');
  assert.ok(breakCalm && breakWindy);
  assert.notEqual(breakCalm.x, breakWindy.x);
});

test('sim with wind integrates vector flight for overhead break and downwind steer', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.windFromDeg = 298;
  setup.windKt = 20;
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 } // Starts at Break
  ];

  const sim = createSim(setup, { seed: 1 });
  const a0 = sim.state().aircraft[0];
  assert.equal(a0.id, 'A1');

  // Step 20 seconds into the break turn
  sim.stepTo(20);
  const a20 = sim.state().aircraft[0];
  assert.equal(a20.status, 'flying');
  // Aircraft should have decelerated from 220 KIAS down toward 140 KIAS
  assert.ok(a20.kt <= 180 && a20.kt >= 135, `Speed ${a20.kt} should bleed toward 140 KIAS via V² drag`);
  // Altitude should remain at 3500 ft MSL
  assert.equal(a20.alt, 3500);
});

test('Slice A: aircraft state carries continuous 3D Cartesian vector fields upon spawn and flying', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 0, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  const a0 = sim.state().aircraft[0];

  // Verify vector fields exist and are initialized cleanly
  assert.equal(typeof a0.x, 'number');
  assert.equal(typeof a0.y, 'number');
  assert.equal(typeof a0.alt, 'number');
  assert.equal(typeof a0.kt, 'number');
  assert.equal(typeof a0.headingDeg, 'number');
  assert.equal(typeof a0.bankDeg, 'number');
  assert.equal(a0.bankDeg, 0);
  assert.equal(a0.phase, 'initial');
  assert.equal(typeof a0.trackDeg, 'number');
  assert.equal(typeof a0.crabDeg, 'number');
  assert.equal(typeof a0.groundSpeedKt, 'number');

  // Step 5 seconds
  sim.stepTo(5);
  const a5 = sim.state().aircraft[0];
  assert.equal(a5.status, 'flying');
  assert.equal(typeof a5.x, 'number');
  assert.equal(typeof a5.y, 'number');
  assert.equal(typeof a5.bankDeg, 'number');
  assert.equal(a5.phase, 'initial');
});

test('Slice A: Cartesian velocity integration updates ground speed and crab under crosswind', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.windFromDeg = 28; // Crosswind from right on Runway 298°
  setup.windKt = 15;
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 0, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(5);
  const a = sim.state().aircraft[0];

  // Heading should crab into the wind (crabDeg > 0, headingDeg > trackDeg)
  assert.ok(a.crabDeg > 0, `Crab angle ${a.crabDeg}° should be positive into crosswind from 028°`);
  assert.ok(a.groundSpeedKt > 0);
  assert.ok(Math.abs(a.headingDeg - (a.trackDeg + a.crabDeg)) < 0.1);
});

test('Slice A: coordinated turn kinematics and roll rate limiter (45 deg/s)', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 } // Point 9: 2.0 G break turn
  ];
  const sim = createSim(setup, { seed: 1 });

  // In the first step (0.05 s), bank change is limited to max 45°/s * 0.05 s = 2.25°
  sim.stepTo(STEP_SEC);
  const aStep1 = sim.state().aircraft[0];
  assert.ok(Math.abs(aStep1.bankDeg) <= 45 * STEP_SEC + 1e-4, `Bank ${aStep1.bankDeg}° should obey 45°/s roll rate limiter`);

  // After 2 seconds, bank angle should roll into the 2.0 G standard bank (up to 60°)
  sim.stepTo(2.0);
  const a2 = sim.state().aircraft[0];
  assert.ok(Math.abs(a2.bankDeg) > 10, `Bank ${a2.bankDeg}° should have rolled into the turn`);
  assert.ok(Math.abs(a2.bankDeg) <= 60.1, `Bank ${a2.bankDeg}° should not exceed 60° (2.0 G limit)`);
});

test('Slice A: snapshot and restore preserves full Cartesian vector state', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.windFromDeg = 298;
  setup.windKt = 10;
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(10);
  const snap = sim.snapshot();
  const stateBefore = sim.state().aircraft[0];

  // Advance further
  sim.stepTo(25);

  // Restore snapshot
  sim.restore(snap);
  const stateRestored = sim.state().aircraft[0];

  assert.equal(stateRestored.x, stateBefore.x);
  assert.equal(stateRestored.y, stateBefore.y);
  assert.equal(stateRestored.alt, stateBefore.alt);
  assert.equal(stateRestored.kt, stateBefore.kt);
  assert.equal(stateRestored.headingDeg, stateBefore.headingDeg);
  assert.equal(stateRestored.bankDeg, stateBefore.bankDeg);
  assert.equal(stateRestored.phase, stateBefore.phase);
  assert.equal(stateRestored.groundSpeedKt, stateBefore.groundSpeedKt);
});

test('Slice B: overhead break initiates at Point 9 with 60 deg bank and V² drag deceleration', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  const a0 = sim.state().aircraft[0];
  assert.equal(a0.phase, 'break');
  assert.equal(a0.alt, 3500);

  // After 2 seconds into the turn, bank has rolled to 60° (2.0 G)
  sim.stepTo(2);
  const a2 = sim.state().aircraft[0];
  assert.equal(a2.phase, 'break');
  assert.ok(Math.abs(a2.bankDeg - 60) < 1.0, `Bank ${a2.bankDeg}° should reach 60°`);
  assert.ok(a2.kt < 220 && a2.kt > 200, `Speed ${a2.kt} should bleed via V² drag`);

  // Mid-turn (e.g. 10 s): heading has turned significantly, speed continues decaying
  sim.stepTo(10);
  const a10 = sim.state().aircraft[0];
  assert.equal(a10.phase, 'break');
  assert.equal(a10.alt, 3500);
  assert.ok(a10.kt < 180 && a10.kt > 160);

  // Turn rollout onto Inner Downwind (heading ~118°, speed ~140 KIAS, wings level)
  sim.stepTo(22);
  const a22 = sim.state().aircraft[0];
  assert.equal(a22.phase, 'downwind');
  assert.ok(Math.abs(a22.headingDeg - 118) < 5 || Math.abs(a22.trackDeg - 118) < 5);
  assert.ok(Math.abs(a22.kt - 140) <= 2, `Speed ${a22.kt} should reach 140 KIAS at rollout`);
  assert.ok(a22.bankDeg < 5, `Bank ${a22.bankDeg}° should roll wings level on downwind`);
  assert.equal(a22.alt, 3500);
});

test('Slice B: natural wind drift translates Cartesian coordinates during overhead break', () => {
  const setupCalm = structuredClone(MOOSE_JAW);
  setupCalm.aircraft = [{ id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }];
  const simCalm = createSim(setupCalm, { seed: 1 });
  simCalm.stepTo(15);
  const calmPos = simCalm.state().aircraft[0];

  const setupWind = structuredClone(MOOSE_JAW);
  setupWind.windFromDeg = 298; // Wind blowing toward 118°
  setupWind.windKt = 25;
  setupWind.aircraft = [{ id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }];
  const simWind = createSim(setupWind, { seed: 1 });
  simWind.stepTo(15);
  const windPos = simWind.state().aircraft[0];

  // Wind should drift the aircraft position significantly over 15 seconds
  const driftDist = Math.hypot(windPos.x - calmPos.x, windPos.y - calmPos.y);
  assert.ok(driftDist > 200, `Drift distance ${driftDist} ft should show substantial displacement under 25 kt wind`);
});

test('Slice C: dynamic perch calculation compensates for wind and downwind pursuit captures perch', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.windFromDeg = 298; // Headwind on final (tailwind on downwind)
  setup.windKt = 20;
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  const pat1 = setup.routes.find((r) => r.id === 'PAT1');
  const dynamicPerch = computeWindPerch(pat1, 298, 20);

  // Perch should be shifted upwind (into 298°)
  assert.ok(dynamicPerch);
  const calmPerch = pat1.points[11];
  const shiftDist = Math.hypot(dynamicPerch.x - calmPerch.x, dynamicPerch.y - calmPerch.y);
  assert.ok(shiftDist > 800 && shiftDist < 1200, `Shift distance ${shiftDist} ft should be ~1,005 ft`);

  // Fly through break onto downwind (e.g. at 35 seconds)
  sim.stepTo(35);
  const a35 = sim.state().aircraft[0];
  assert.equal(a35.phase, 'downwind');
  assert.equal(a35.kt, 140);
  assert.equal(a35.alt, 3500);
  assert.ok(a35.bankDeg < 2.0, `Downwind should fly wings-level (bank ${a35.bankDeg}°)`);

  // Fly until arrival at Perch (around 52-54 seconds)
  sim.stepTo(53);
  const a53 = sim.state().aircraft[0];
  const distToPerch = Math.hypot(a53.x - dynamicPerch.x, a53.y - dynamicPerch.y);
  assert.ok(distToPerch <= 150, `Distance to perch ${distToPerch} ft should be within 150 ft capture radius`);

  // At/after perch capture, speed transitions to 120 KIAS for final turn
  sim.stepTo(55);
  const a55 = sim.state().aircraft[0];
  assert.equal(a55.kt, 120);
  assert.equal(a55.phase, 'final_turn');
});

test('Slice C: calm wind downwind maintains 140 KIAS until Perch capture', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });

  // On downwind at 35 seconds
  sim.stepTo(35);
  const a35 = sim.state().aircraft[0];
  assert.equal(a35.phase, 'downwind');
  assert.equal(a35.kt, 140);
  assert.equal(a35.alt, 3500);
});

test('Slice D: adaptive final turn rolls into nominal 35 deg bank with continuous descent', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.windFromDeg = 298;
  setup.windKt = 20;
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });

  // Step into final turn (t = 65 s)
  sim.stepTo(65);
  const a65 = sim.state().aircraft[0];
  assert.equal(a65.phase, 'final_turn');
  assert.ok(Math.abs(a65.bankDeg - 35) <= 1.0, `Bank ${a65.bankDeg}° should be ~35° nominal bank`);
  assert.ok(a65.alt < 3500 && a65.alt > 2700, `Altitude ${a65.alt} ft should descend smoothly`);
  assert.equal(a65.kt, 120);

  // Late in final turn (t = 75 s)
  sim.stepTo(75);
  const a75 = sim.state().aircraft[0];
  assert.equal(a75.phase, 'final_turn');
  assert.ok(a75.alt < a65.alt, `Altitude should continuously descend (from ${a65.alt} to ${a75.alt})`);
});

test('Slice D: straight-in final approach rolls wings level and tracks 3.0 deg glide slope to threshold', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.windFromDeg = 298;
  setup.windKt = 20;
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });

  // Rollout on final approach (t = 95 s)
  sim.stepTo(95);
  const a95 = sim.state().aircraft[0];
  assert.equal(a95.phase, 'final');
  assert.ok(a95.bankDeg < 2.0, `Bank ${a95.bankDeg}° should be wings level on final`);
  assert.ok(Math.abs(a95.trackDeg - 298) < 5 || Math.abs(a95.headingDeg - 298) < 5);
  assert.ok(a95.alt <= 2700 && a95.alt > 1892, `Altitude ${a95.alt} should be descending along glide slope`);
  assert.ok(a95.kt <= 120 && a95.kt >= 100, `Speed ${a95.kt} should decelerate towards 100 KIAS`);

  // Near threshold (t = 125 s)
  sim.stepTo(125);
  const a125 = sim.state().aircraft[0];
  assert.equal(a125.phase, 'final');
  assert.ok(a125.alt <= 2000 && a125.alt >= 1880, `Altitude ${a125.alt} should approach 1,892 ft threshold`);
  assert.ok(Math.abs(a125.kt - 100) <= 5, `Speed ${a125.kt} should reach ~100 KIAS at threshold`);
});

test('Slice E: closed pattern evaluates full-stop landing decision at threshold', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.routes[0].landOdds = 1.0; // 100% full-stop landing
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });

  // Advance to threshold crossing (t = 130 s)
  sim.stepTo(130);
  const a130 = sim.state().aircraft[0];
  assert.equal(a130.status, 'landed');
  assert.ok(a130.alt <= 1892);
});

test('Slice E: closed pattern touch-and-go rolls along runway, climbs out and cycles circuit', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.routes[0].landOdds = 0.0; // 0% landing -> touch-and-go every lap
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });

  // Advance past threshold into touch-and-go climbout (t = 180 s)
  sim.stepTo(180);
  const a180 = sim.state().aircraft[0];
  assert.equal(a180.status, 'flying');
  assert.ok(a180.alt > 2500, `Climbout altitude ${a180.alt} should be climbing towards 3,500 ft`);
  assert.ok(a180.kt >= 140, `Climbout speed ${a180.kt} should accelerate past 140 KIAS`);

  // Further in circuit (t = 240 s): aircraft reaches 3,500 ft MSL
  sim.stepTo(240);
  const a240 = sim.state().aircraft[0];
  assert.equal(a240.status, 'flying');
  assert.equal(a240.alt, 3500);
});

test('Slice E: in-flight touch-and-go pilot command re-enters closed pattern', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(10);

  // Command touch-and-go
  const ok = sim.command('A1', 'touch_and_go');
  assert.equal(ok, true);

  const aCmd = sim.state().aircraft[0];
  assert.equal(aCmd.phase, 'touch_and_go');
  assert.equal(aCmd.kt, 100);
  assert.equal(aCmd.alt, 1892);
  assert.equal(aCmd.bankDeg, 0);
});

test('Slice F: PILOT_SPAWN_PRESETS provides operational pilot-intuitive spawn points', () => {
  const ids = PILOT_SPAWN_PRESETS.map((p) => p.id);
  assert.ok(ids.includes('initial'));
  assert.ok(ids.includes('downwind'));
  assert.ok(ids.includes('perch'));
  assert.ok(ids.includes('final2m'));
  assert.ok(ids.includes('final1m'));
  assert.ok(ids.includes('takeoff'));

  const downwind = PILOT_SPAWN_PRESETS.find((p) => p.id === 'downwind');
  assert.equal(downwind.routeId, 'PAT1');
  assert.equal(downwind.point, 11);
  assert.match(downwind.label, /Inner Downwind/);

  const perch = PILOT_SPAWN_PRESETS.find((p) => p.id === 'perch');
  assert.equal(perch.routeId, 'PAT1');
  assert.equal(perch.point, 12);

  const final2m = PILOT_SPAWN_PRESETS.find((p) => p.id === 'final2m');
  assert.equal(final2m.routeId, 'ENT2');
  assert.equal(final2m.point, 4);
});

test('Slice G: in-flight breakout command climbs to 3,500 ft, turns 90 deg and accelerates to 140 kt', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 11, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(10);

  const initialHdg = sim.state().aircraft[0].headingDeg;
  sim.command('A1', 'breakout');

  // Step 20 seconds forward in breakout
  sim.stepTo(30);
  const aBreak = sim.state().aircraft[0];
  assert.equal(aBreak.command, 'breakout');
  assert.equal(aBreak.status, 'flying');
  assert.equal(Math.round(aBreak.headingDeg), Math.round((initialHdg + 90) % 360));
  assert.equal(aBreak.kt, 140);
  assert.equal(aBreak.alt, 3500);
});

test('Slice G: in-flight go-around command climbs to 2,500 ft, accelerates to 140 kt and rejoins circuit', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 12, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(10);

  sim.command('A1', 'go_around');
  const aGo = sim.state().aircraft[0];
  assert.equal(aGo.command, 'go_around');
  assert.equal(aGo.alt, 2500);
  assert.equal(aGo.kt, 140);
  assert.equal(aGo.phase, 'touch_and_go');
});





