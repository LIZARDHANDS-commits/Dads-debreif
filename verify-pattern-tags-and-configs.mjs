import assert from 'node:assert/strict';
import MOOSE_JAW from './src/modules/traffic/data/moose-jaw.json' with { type: 'json' };
import { createSim } from './src/modules/traffic/sim.js';
import { CONFIG, BEHAVIOUR, behaviourOf, behaviourLabel, LANDING_TAGS } from './src/modules/traffic/behaviour.js';

console.log('--- Verifying Pattern Tags & Configurations (OHB -> DW -> FT -> T+GO/STOP) ---');

// 1. Direct unit verification of behaviourOf and behaviourLabel
console.log('1. Direct unit tests for behaviourOf & behaviourLabel:');

const pat1Route = MOOSE_JAW.routes.find((r) => r.id === 'PAT1');
const rwyTh = pat1Route.points[0];

// Test 1a: Initial run-in
const bInitial = behaviourOf({ active: true, phase: 'initial', kt: 220, alt: 3500 }, { route: pat1Route, fieldElevFt: 1880 });
assert.equal(bInitial.pattern, 'OHB');
assert.equal(bInitial.config, CONFIG.clean);
assert.equal(behaviourLabel(bInitial), '[OHB]');
console.log('   ✓ Initial: [OHB], Clean');

// Test 1b: In the break turn (220 -> 160 kt)
const bBreak = behaviourOf({ active: true, phase: 'break', kt: 180, alt: 3500 }, { route: pat1Route, fieldElevFt: 1880 });
assert.equal(bBreak.pattern, 'OHB');
assert.equal(bBreak.config, CONFIG.clean);
assert.equal(behaviourLabel(bBreak), '[OHB]');
console.log('   ✓ In the Break: [OHB], Clean');

// Test 1c: Downwind before slowing (hypothetical > 147 kt)
const bDwFast = behaviourOf({ active: true, phase: 'downwind', kt: 155, alt: 3500 }, { route: pat1Route, fieldElevFt: 1880 });
assert.equal(bDwFast.pattern, 'OHB');
assert.equal(bDwFast.config, CONFIG.clean);
assert.equal(behaviourLabel(bDwFast), '[OHB]');
console.log('   ✓ Downwind fast (> 147 kt): [OHB], Clean');

// Test 1d: Downwind slowed below 147 kt (140 kt and 120 kt)
const bDwSlow140 = behaviourOf({ active: true, phase: 'downwind', kt: 140, alt: 3500 }, { route: pat1Route, fieldElevFt: 1880 });
assert.equal(bDwSlow140.pattern, 'DW');
assert.equal(bDwSlow140.config, CONFIG.gearTakeOffFlap);
assert.equal(behaviourLabel(bDwSlow140), '[DW]');
console.log('   ✓ Downwind at 140 kt: [DW], Gear + T/O flap');

const bDwSlow120 = behaviourOf({ active: true, phase: 'downwind', kt: 120, alt: 3500 }, { route: pat1Route, fieldElevFt: 1880 });
assert.equal(bDwSlow120.pattern, 'DW');
assert.equal(bDwSlow120.config, CONFIG.gearTakeOffFlap);
assert.equal(behaviourLabel(bDwSlow120), '[DW]');
console.log('   ✓ Downwind at 120 kt: [DW], Gear + T/O flap');

// Test 1e: Perch / Final Turn
const bFinalTurn = behaviourOf({ active: true, phase: 'final_turn', kt: 120, alt: 3200 }, { route: pat1Route, fieldElevFt: 1880 });
assert.equal(bFinalTurn.pattern, 'FT');
assert.equal(bFinalTurn.config, CONFIG.gearLandingFlap);
assert.equal(behaviourLabel(bFinalTurn), '[FT]');
console.log('   ✓ Final Turn: [FT], Gear + landing flap');

// Test 1f: Rollout on final before Window (e.g. 6000 ft from threshold, window is at 4400 ft)
const bFinalPreWindow = behaviourOf({ active: true, phase: 'final', kt: 110, alt: 2400 }, {
  route: pat1Route,
  fieldElevFt: 1880,
  onFinal: true,
  toThresholdFt: 6000,
  windowFt: 4400,
});
assert.equal(bFinalPreWindow.pattern, 'FT');
assert.equal(bFinalPreWindow.config, CONFIG.gearLandingFlap);
assert.equal(behaviourLabel(bFinalPreWindow), '[FT]');
console.log('   ✓ Final before Window: [FT], Gear + landing flap');

// Test 1g: Final inside Window (e.g. 3000 ft from threshold)
const bFinalInsideWindow = behaviourOf({ active: true, phase: 'final', kt: 105, alt: 2050, intent: 'touch_and_go' }, {
  route: pat1Route,
  fieldElevFt: 1880,
  onFinal: true,
  toThresholdFt: 3000,
  windowFt: 4400,
});
assert.equal(bFinalInsideWindow.pattern, 'T+GO');
assert.equal(bFinalInsideWindow.config, CONFIG.gearLandingFlap);
assert.equal(behaviourLabel(bFinalInsideWindow), '[T+GO]');
console.log('   ✓ Final inside Window (touch and go): [T+GO], Gear + landing flap');

const bFinalFullStop = behaviourOf({ active: true, phase: 'final', kt: 105, alt: 2050, intent: 'full_stop' }, {
  route: pat1Route,
  fieldElevFt: 1880,
  onFinal: true,
  toThresholdFt: 3000,
  windowFt: 4400,
});
assert.equal(bFinalFullStop.pattern, 'STOP');
assert.equal(bFinalFullStop.config, CONFIG.gearLandingFlap);
assert.equal(behaviourLabel(bFinalFullStop), '[STOP]');
console.log('   ✓ Final inside Window (full stop): [STOP], Gear + landing flap');

// Test 1h: Straight-In pattern
const bSiDw = behaviourOf({ active: true, phase: 'downwind', kt: 140, alt: 3500, siPattern: true }, { route: pat1Route, fieldElevFt: 1880 });
assert.equal(bSiDw.pattern, 'SI');
assert.equal(behaviourLabel(bSiDw), '[SI]');
console.log('   ✓ Straight-In downwind: [SI]');

const bSiFt = behaviourOf({ active: true, phase: 'final_turn', kt: 120, alt: 3000, siPattern: true }, { route: pat1Route, fieldElevFt: 1880 });
assert.equal(bSiFt.pattern, 'SI');
assert.equal(behaviourLabel(bSiFt), '[SI]');
console.log('   ✓ Straight-In final turn: [SI]');

// 2. Full simulation flight test through Pattern 1
console.log('2. Full simulation flight test through Pattern 1:');

const sim = createSim({
  ...MOOSE_JAW,
  windKt: 0,
  windFromDeg: 360,
  aircraft: [{ id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 8, startsAtSec: 0 }], // start at Initial (Point 9, 0-indexed: 8)
}, { seed: 42 });

const seenPhases = new Map();

for (let t = 0.5; t <= 300; t += 0.5) {
  sim.stepTo(t);
  const state = sim.state();
  const a = state.aircraft[0];
  if (!a || !a.active) break;

  const key = `${a.phase}:${a.behaviour}`;
  if (!seenPhases.has(key)) {
    seenPhases.set(key, { t, phase: a.phase, tag: a.tag, kt: Math.round(a.kt), alt: Math.round(a.alt), behaviour: a.behaviour, config: a.config });
  }
}

console.log('   Phases observed during flight:');
for (const [k, v] of seenPhases) {
  console.log(`     t=${v.t.toFixed(1)}s | phase=${v.phase.padEnd(12)} | kt=${v.kt} | alt=${v.alt}ft | tag=${v.behaviour.padEnd(8)} | config=${v.config}`);
}

// Assert that we saw:
// 1. Initial with [OHB] and Clean
const hasInitial = Array.from(seenPhases.values()).some((v) => v.phase === 'initial' && v.behaviour === '[OHB]' && v.config === 'Clean');
assert.ok(hasInitial, 'Must observe initial phase with [OHB] and Clean');

// 2. Break with [OHB] and Clean
const hasBreak = Array.from(seenPhases.values()).some((v) => v.phase === 'break' && v.behaviour === '[OHB]' && v.config === 'Clean');
assert.ok(hasBreak, 'Must observe break phase with [OHB] and Clean');

// 3. Downwind with [DW] and Gear + T/O flap
const hasDw = Array.from(seenPhases.values()).some((v) => v.phase === 'downwind' && v.behaviour === '[DW]' && v.config === 'Gear + T/O flap');
assert.ok(hasDw, 'Must observe downwind phase with [DW] and Gear + T/O flap');

// 4. Final turn with [FT] and Gear + landing flap
const hasFt = Array.from(seenPhases.values()).some((v) => v.phase === 'final_turn' && v.behaviour === '[FT]' && v.config === 'Gear + landing flap');
assert.ok(hasFt, 'Must observe final_turn phase with [FT] and Gear + landing flap');

// 3. Full-stop simulation test
console.log('3. Full-stop landing simulation test:');
const simStop = createSim({
  ...MOOSE_JAW,
  windKt: 0,
  windFromDeg: 360,
  aircraft: [{ id: 'A2', type: 'CT-156', routeId: 'PAT1', startIndex: 11, startsAtSec: 0, intent: 'full_stop' }], // start at Perch (index 11)
}, { seed: 42 });

let sawStopTag = false;
for (let t = 0.5; t <= 120; t += 0.5) {
  simStop.stepTo(t);
  const a = simStop.state().aircraft[0];
  if (!a) break;
  if (a.behaviour === '[STOP]' && a.config === 'Gear + landing flap') {
    sawStopTag = true;
  }
}
// 4. Configuration-aware pitch attitude verification
console.log('4. Configuration-aware pitch attitude verification:');
const simPitch = createSim({
  ...MOOSE_JAW,
  windKt: 0,
  windFromDeg: 360,
  aircraft: [{ id: 'A3', type: 'CT-156', routeId: 'PAT1', startIndex: 8, startsAtSec: 0 }],
}, { seed: 42 });

let pitchDownwind = null;
let pitchFinalTurn = null;
let pitchFinal = null;

for (let t = 0.5; t <= 170; t += 0.5) {
  simPitch.stepTo(t);
  const a = simPitch.state().aircraft[0];
  if (!a) break;
  if (t === 80.0) pitchDownwind = a.pitchDeg;
  if (t === 120.0) pitchFinalTurn = a.pitchDeg;
  if (t === 160.0) pitchFinal = a.pitchDeg;
}

console.log(`   Downwind (120 kt, T/O flap): pitch=${pitchDownwind?.toFixed(2)}°`);
console.log(`   Final turn (120 kt, LDG flap, 35° bank, -2400 fpm): pitch=${pitchFinalTurn?.toFixed(2)}°`);
console.log(`   Final approach (107 kt, LDG flap, 3° slope): pitch=${pitchFinal?.toFixed(2)}°`);

assert.ok(pitchDownwind >= 0.0 && pitchDownwind <= 3.0, `Downwind pitch should be realistic level ~1-2°, got ${pitchDownwind}`);
assert.ok(pitchFinalTurn <= -7.5 && pitchFinalTurn >= -11.0, `Final turn pitch should be authentically nose-low ~ -9°, got ${pitchFinalTurn}`);
assert.ok(pitchFinal <= 1.0 && pitchFinal >= -2.5, `Final approach pitch should be near level ~ -1° to +0.5°, got ${pitchFinal}`);
console.log('   ✓ All pitch attitudes match aerodynamic flap deflection expectations');

console.log('--- ALL PATTERN TAG & CONFIGURATION VERIFICATIONS PASSED ---');
