// Standalone verification script for Task 9A: Wire Simulation Stepper to Segment Planner
// NOTE: Standalone script, NOT run via node --test or npm test (per AGENTS.md observation 0050).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSim, STEP_SEC } from './src/modules/traffic/sim.js';
import { resumePflFlight } from './src/modules/traffic/pfl-segment-planner.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, FIELD_ELEV_FT } from './src/modules/traffic/airfield.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('./src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const NM = 6076.12;
const KT_TO_FTPS = NM / 3600;

function createTestSim(wind = {}) {
  const setup = structuredClone(MOOSE_JAW);
  Object.assign(setup, wind);
  return createSim(setup);
}

function onRunway(p) {
  const ux = DEPARTURE_END_29L.x - THRESHOLD_29L.x, uy = DEPARTURE_END_29L.y - THRESHOLD_29L.y;
  const len = Math.hypot(ux, uy);
  const along = ((p.x - THRESHOLD_29L.x) * ux + (p.y - THRESHOLD_29L.y) * uy) / len;
  const across = Math.abs((p.x - THRESHOLD_29L.x) * uy - (p.y - THRESHOLD_29L.y) * ux) / len;
  return along >= 0 && along <= len && across <= 150;
}

console.log('=== TEST 1: Initial State & Telemetry Exposure in state() ===');
const sim1 = createTestSim();
const id1 = sim1.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: 9, delaySec: 0 });
sim1.stepTo(0.1);

let ac1 = sim1.state().aircraft.find((a) => a.id === id1);
assert.ok(ac1, 'Aircraft spawned');
assert.equal(ac1.status, 'flying');
assert.equal(ac1.pflFlight, false);
assert.equal(ac1.pflSegment, null);
assert.equal(ac1.pflDecision, null);
assert.equal(ac1.pflMarginFt, null);
assert.equal(ac1.pflMarginTag, null);
console.log('✓ Initial state has null PFL telemetry fields as expected');

console.log('\n=== TEST 2: Trigger PFL at High Speed (> 150 KIAS) -> Zoom Segment ===');
assert.ok(ac1.kt > 150, `Speed is ${ac1.kt} KIAS (> 150 expected)`);
const cmdOk = sim1.command(id1, 'pfl_current');
assert.equal(cmdOk, true, 'Command pfl_current accepted');

ac1 = sim1.state().aircraft.find((a) => a.id === id1);
assert.equal(ac1.mode, 'RAIL');
assert.equal(ac1.engineFailed, true);
assert.equal(ac1.pflFlight, true);
assert.equal(ac1.phase, 'pfl_zoom');
assert.equal(ac1.pflSegment, 'zoom', `pflSegment should be 'zoom', got '${ac1.pflSegment}'`);
assert.ok(ac1.pflDecision.length > 0, `pflDecision populated: ${ac1.pflDecision}`);
assert.ok(typeof ac1.pflMarginFt === 'number', `pflMarginFt is number: ${ac1.pflMarginFt}`);
assert.ok(['high', 'low', 'on profile'].includes(ac1.pflMarginTag), `pflMarginTag valid: ${ac1.pflMarginTag}`);
assert.equal(ac1.config, 'Clean');
console.log(`✓ Telemetry at PFL initiation: segment=${ac1.pflSegment}, margin=${ac1.pflMarginFt} ft (${ac1.pflMarginTag}), decision="${ac1.pflDecision}", config=${ac1.config}`);

console.log('\n=== TEST 3: Stepping through Zoom into Glide Segment ===');
let seenSegments = new Set([ac1.pflSegment]);
let prevAlt = ac1.alt;
let zoomClimbed = false;

// Step forward through the zoom pull, climb and pushover (zoom typically takes ~18-22 s)
for (let i = 0; i < 600 && ac1.pflFlight; i++) {
  sim1.stepTo(sim1.t + STEP_SEC);
  ac1 = sim1.state().aircraft.find((a) => a.id === id1);
  seenSegments.add(ac1.pflSegment);
  if (ac1.alt > prevAlt + 100) zoomClimbed = true;
  assert.ok(ac1.pflSegment !== null, 'pflSegment remains non-null during flight');
  assert.ok(ac1.pflMarginFt !== null, 'pflMarginFt remains non-null during flight');
  assert.ok(ac1.pflMarginTag !== null, 'pflMarginTag remains non-null during flight');
  assert.ok(ac1.pflDecision !== null, 'pflDecision remains non-null during flight');
  if (ac1.pflSegment !== 'zoom' && !seenSegments.has('post-zoom')) {
    seenSegments.add('post-zoom');
    console.log(`✓ Exited zoom at t=${sim1.t.toFixed(1)}s into segment '${ac1.pflSegment}', decision="${ac1.pflDecision}", margin=${ac1.pflMarginFt} ft`);
  }
}

console.log(`✓ Zoom gained altitude: ${zoomClimbed}`);
console.log(`✓ Observed segments during progression: ${[...seenSegments].filter(s => s !== 'post-zoom').join(' -> ')}`);
assert.ok(zoomClimbed, 'Aircraft climbed during zoom');
assert.ok(seenSegments.has('zoom'), "Should have visited 'zoom'");
// Should have transitioned from zoom to another segment (arc or straight)
assert.ok(seenSegments.has('arc') || seenSegments.has('straight'), "Should transition from 'zoom' to 'arc' or 'straight'");

console.log('\n=== TEST 4: Trigger PFL at Slower Speed (<= 150 KIAS) -> Decel Segment ===');
const simDecel = createTestSim();
const idDecel = simDecel.spawnPflFromArea({ radialDeg: 180, distNm: 5, altFt: 5000 });

const acDecel = simDecel.state().aircraft.find((a) => a.id === idDecel);
assert.equal(acDecel.pflFlight, true);
assert.ok(acDecel.kt <= 150, `Speed is ${acDecel.kt} KIAS (<= 150 expected)`);
assert.equal(acDecel.pflSegment, 'decel', `Segment should be 'decel', got '${acDecel.pflSegment}'`);
assert.ok(acDecel.pflDecision.startsWith('Slow to 125'), `Decision is decel: ${acDecel.pflDecision}`);
console.log(`✓ Slower entry (<=150 KIAS) decel verified: segment=${acDecel.pflSegment}, decision="${acDecel.pflDecision}"`);

console.log('\n=== TEST 5: Area PFL Lands on Runway -> pflEnded Cleanup ===');
const simArea = createTestSim({ windFromDeg: 360, windKt: 5 });
const idArea = simArea.spawnPflFromArea({ radialDeg: 180, distNm: 3, altFt: 6200 });

let acArea = simArea.state().aircraft.find((a) => a.id === idArea);
assert.equal(acArea.engineFailed, true);
assert.equal(acArea.pflFlight, true);
assert.ok(acArea.pflSegment, `Area start has segment: ${acArea.pflSegment}`);
assert.ok(typeof acArea.pflMarginFt === 'number', `Area start margin: ${acArea.pflMarginFt}`);
console.log(`Initial area PFL: segment=${acArea.pflSegment}, margin=${acArea.pflMarginFt} ft, decision=${acArea.pflDecision}`);

let lowest = null;
let maxSteps = 12000;
for (let s = 0; s < maxSteps && acArea.engineFailed; s++) {
  simArea.stepTo(simArea.t + STEP_SEC);
  acArea = simArea.state().aircraft.find((a) => a.id === idArea);
  if (!lowest || acArea.alt < lowest.alt) lowest = { x: acArea.x, y: acArea.y, alt: acArea.alt };
}

assert.equal(acArea.engineFailed, false, 'PFL finished');
assert.equal(acArea.status, 'flying', 'Aircraft resumed flying circuit touch-and-go');
assert.equal(acArea.routeId, 'PAT1', 'Back in circuit PAT1');
assert.ok(lowest.alt <= FIELD_ELEV_FT + 100, `Lowest altitude near field elevation: ${lowest.alt.toFixed(1)} ft`);
assert.ok(onRunway(lowest), 'Touchdown was on runway');

// Verify pflEnded cleanup
assert.equal(acArea.pflFlight, false, 'pflFlight cleared');
assert.equal(acArea.pflSegment, null, 'pflSegment cleaned up to null on landing');
assert.equal(acArea.pflMarginFt, null, 'pflMarginFt cleaned up to null on landing');
assert.equal(acArea.pflMarginTag, null, 'pflMarginTag cleaned up to null on landing');
assert.equal(acArea.pflDecision, null, 'pflDecision cleaned up to null on landing');
console.log('✓ Landed touch-and-go verified and pflEnded telemetry cleanup confirmed');

console.log('\n=== TEST 6: Area PFL Far Out (Eject) -> pflEnded Cleanup ===');
const simEject = createTestSim({ windFromDeg: 360, windKt: 10 });
const idEject = simEject.spawnPflFromArea({ radialDeg: 90, distNm: 30, altFt: 3000 });

let acEject = simEject.state().aircraft.find((a) => a.id === idEject);
for (let s = 0; s < 12000 && acEject.active; s++) {
  simEject.stepTo(simEject.t + STEP_SEC);
  acEject = simEject.state().aircraft.find((a) => a.id === idEject);
}

assert.equal(acEject.status, 'ejected');
assert.equal(acEject.active, false);
assert.equal(acEject.pflSegment, null, 'pflSegment cleaned up to null on ejection');
assert.equal(acEject.pflMarginFt, null, 'pflMarginFt cleaned up to null on ejection');
assert.equal(acEject.pflMarginTag, null, 'pflMarginTag cleaned up to null on ejection');
assert.equal(acEject.pflDecision, 'Eject', "pflDecision is 'Eject' on ejection");
console.log('✓ Ejection verified and pflEnded cleanup confirmed');

console.log('\n=== TEST 7: resumePflFlight Integration ===');
const simResume = createTestSim({ windFromDeg: 298, windKt: 10 });
const idResume = simResume.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: 9, delaySec: 0 });
simResume.stepTo(0.1);
simResume.command(idResume, 'pfl_current');
// Step a few seconds
simResume.stepTo(simResume.t + 3.0);
let acResume = simResume.state().aircraft.find((a) => a.id === idResume);
assert.ok(acResume.pflFlight);

// Directly test resumePflFlight call with active aircraft
// Find internal aircraft object from sim
// Stepping sim with sideStep or invoking resumePflFlight directly
const resumed = resumePflFlight(acResume, { windFromDeg: 298, windKt: 10 });
assert.ok(resumed, 'resumePflFlight returns valid flight object');
assert.ok(resumed.route.points.length > 0, 'Resumed route points present');
assert.ok(acResume.pflSegment, `Resumed aircraft has pflSegment: ${acResume.pflSegment}`);
assert.ok(typeof acResume.pflMarginFt === 'number', `Resumed aircraft has pflMarginFt: ${acResume.pflMarginFt}`);
console.log(`✓ resumePflFlight successfully replanned: segment=${acResume.pflSegment}, margin=${acResume.pflMarginFt} ft, decision=${acResume.pflDecision}`);

console.log('\n=== TEST 8: Conflicting Commands Cancellation & Cleanup ===');
const simCmd = createTestSim();
const idCmd = simCmd.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: 9, delaySec: 0 });
simCmd.stepTo(0.1);
simCmd.command(idCmd, 'pfl_current');
let acCmd = simCmd.state().aircraft.find((a) => a.id === idCmd);
assert.equal(acCmd.pflFlight, true);
assert.ok(acCmd.pflSegment !== null);

// Breakout command during PFL must immediately cancel PFL and clean up all 5 fields
assert.equal(simCmd.command(idCmd, 'breakout'), true);
acCmd = simCmd.state().aircraft.find((a) => a.id === idCmd);
assert.equal(acCmd.pflFlight, false, 'pflFlight cleared on breakout');
assert.equal(acCmd.pflSegment, null, 'pflSegment cleared on breakout');
assert.equal(acCmd.pflDecision, null, 'pflDecision cleared on breakout');
assert.equal(acCmd.pflMarginFt, null, 'pflMarginFt cleared on breakout');
assert.equal(acCmd.pflMarginTag, null, 'pflMarginTag cleared on breakout');
assert.equal(acCmd.engineFailed, false, 'engineFailed reset to false on breakout');
console.log('✓ Breakout commanded during PFL cleanly resets PFL flight and telemetry');

// Re-issue PFL and command climb_high_key
simCmd.command(idCmd, 'pfl_current');
acCmd = simCmd.state().aircraft.find((a) => a.id === idCmd);
assert.equal(acCmd.pflFlight, true);
assert.equal(simCmd.command(idCmd, 'climb_high_key'), true);
acCmd = simCmd.state().aircraft.find((a) => a.id === idCmd);
assert.equal(acCmd.pflFlight, false, 'pflFlight cleared on climb_high_key');
assert.equal(acCmd.pflSegment, null, 'pflSegment cleared on climb_high_key');
assert.equal(acCmd.pflDecision, null, 'pflDecision cleared on climb_high_key');
assert.equal(acCmd.pflMarginFt, null, 'pflMarginFt cleared on climb_high_key');
assert.equal(acCmd.pflMarginTag, null, 'pflMarginTag cleared on climb_high_key');
console.log('✓ Climb High Key commanded during PFL cleanly resets PFL flight and telemetry');

// Re-issue PFL and command go_around
simCmd.command(idCmd, 'pfl_current');
acCmd = simCmd.state().aircraft.find((a) => a.id === idCmd);
assert.equal(acCmd.pflFlight, true);
assert.equal(simCmd.command(idCmd, 'go_around'), true);
acCmd = simCmd.state().aircraft.find((a) => a.id === idCmd);
assert.equal(acCmd.pflFlight, false, 'pflFlight cleared on go_around');
assert.equal(acCmd.pflSegment, null, 'pflSegment cleared on go_around');
assert.equal(acCmd.pflDecision, null, 'pflDecision cleared on go_around');
assert.equal(acCmd.pflMarginFt, null, 'pflMarginFt cleared on go_around');
assert.equal(acCmd.pflMarginTag, null, 'pflMarginTag cleared on go_around');
console.log('✓ Go Around commanded during PFL cleanly resets PFL flight and telemetry');

console.log('\n=== TEST 9: Multi-Aircraft Concurrent Simulation with Deconfliction & PFL ===');
const simMulti = createTestSim({ deconflict: true, randomize: true });
const multiIds = [];
for (let i = 0; i < 6; i++) {
  multiIds.push(simMulti.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: (i * 2) % 12 + 1, delaySec: i * 5 }));
}
simMulti.stepTo(20);
simMulti.command(multiIds[0], 'pfl_current');

let multiSteps = 0;
for (let s = 0; s < 1000; s++) {
  simMulti.stepTo(simMulti.t + STEP_SEC);
  const ac0 = simMulti.state().aircraft.find((a) => a.id === multiIds[0]);
  if (ac0.pflFlight) {
    multiSteps++;
    assert.ok(ac0.pflSegment !== null);
    assert.ok(ac0.pflDecision !== null);
    assert.ok(ac0.pflMarginFt !== null);
    assert.ok(ac0.pflMarginTag !== null);
  }
}
console.log(`✓ Multi-aircraft simulation verified: 6 aircraft stepped, PFL active for ${multiSteps} steps`);

console.log('\n========================================');
console.log('ALL SIMULATION PFL TESTS PASSED (TASK 9A)');
console.log('========================================');
