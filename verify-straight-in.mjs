import assert from 'node:assert/strict';
import MOOSE_JAW from './src/modules/traffic/data/moose-jaw.json' with { type: 'json' };
import { placeStraightInDescent, approachLine } from './src/modules/traffic/weather.js';
import { routePath, positionAt } from './src/modules/traffic/route.js';
import { createSim } from './src/modules/traffic/sim.js';
import { CONFIG, behaviourOf } from './src/modules/traffic/behaviour.js';

console.log('--- Verifying Straight-In Speed Profile & Window Alignment ---');

// Clone routes
const routes = structuredClone(MOOSE_JAW.routes);
const pat1 = routes.find((r) => r.id === 'PAT1');
const ent2 = routes.find((r) => r.id === 'ENT2');

console.log('1. Testing raw route definition:');
const rawFinal = ent2.points.find((p) => p.label === 'Final');
const rawGlide = ent2.points.find((p) => p.label === 'Glide path');
const rawWindow = ent2.points.find((p) => p.label === 'Window');
assert.equal(rawFinal.kt, 120, 'Final in data/moose-jaw.json must be 120 kt');
assert.equal(rawGlide.kt, 120, 'Glide path in data/moose-jaw.json must be 120 kt');
assert.ok(rawWindow, 'Window point must exist in data/moose-jaw.json');
assert.equal(rawWindow.kt, 120, 'Window in data/moose-jaw.json must be 120 kt');
assert.equal(rawWindow.alt, 2119, 'Window altitude must match final turn rollout window (2,119 ft MSL)');
console.log('   ✓ Raw data points verified at 120 kt');

console.log('2. Testing placeStraightInDescent:');
placeStraightInDescent(routes);

const glidePt = ent2.points.find((p) => p.label === 'Glide path');
const winPt = ent2.points.find((p) => p.label === 'Window');
const roundoutPt = ent2.points.find((p) => p.label === 'Round-out');

assert.equal(glidePt.kt, 120, 'Glide path at 3° intercept must be 120 kt');
assert.equal(winPt.kt, 120, 'Window waypoint must be 120 kt');
assert.equal(winPt.alt, pat1.points[12].alt, 'Window waypoint alt must match PAT1 point 12 alt');
assert.equal(roundoutPt.kt, 100, 'Round-out flare start must be 100 kt');
console.log(`   ✓ Glide path placed at intercept: alt=${glidePt.alt} ft, kt=${glidePt.kt} kt`);
console.log(`   ✓ Window placed: x=${winPt.x}, y=${winPt.y}, alt=${winPt.alt} ft, kt=${winPt.kt} kt`);
console.log(`   ✓ Round-out placed: alt=${roundoutPt.alt.toFixed(1)} ft, kt=${roundoutPt.kt} kt`);

console.log('3. Testing path interpolation along ENT2 descent:');
const path = routePath(ent2);
const windowDistFt = path.points.find((p) => p.tag === 'Window' || (Math.hypot(p.x - winPt.x, p.y - winPt.y) < 20));

// Check speed at points between intercept and window
let checkedCount = 0;
for (const p of path.points) {
  // If on final between glide path and window (y between -11000 and -4800, x between winPt.x and glidePt.x)
  if (p.y >= -11000 && p.x >= winPt.x && p.x <= glidePt.x) {
    assert.equal(Math.round(p.kt), 120, `Speed along 3° descent to window must be 120 kt, got ${p.kt} at x=${p.x}, y=${p.y}`);
    checkedCount++;
  }
}
assert.ok(checkedCount > 0, 'Must have verified points between intercept and window');
console.log(`   ✓ Verified ${checkedCount} interpolated path points along 3° descent all hold 120 kt`);

console.log('4. Testing simulation flight of ENT2 aircraft:');
const sim = createSim({
  ...MOOSE_JAW,
  routes,
  windKt: 0,
  windFromDeg: 360,
  aircraft: [{ id: 'A1', type: 'CT-156', routeId: 'ENT2', startIndex: 3, startsAtSec: 0 }],
}, { seed: 1 });

let speedAtIntercept = null;
let speedAtWindow = null;
let speedAtTouchdown = null;
let configOnFinalBeforeWindow = null;
let configInsideWindow = null;

const th = { x: 2796, y: -2776 };
for (let t = 0.1; t <= 180; t += 0.1) {
  sim.stepTo(t);
  const a = sim.state().aircraft[0];
  if (!a || !a.active || a.phase === 'climb' || a.phase === 'climb_out') break;

  const distToTh = Math.hypot(a.x - th.x, a.y - th.y);
  const { windowOutFt } = approachLine(routes.find((r) => r.id === 'PAT1'));
  const b = behaviourOf({ ...a, siPattern: true }, {
    route: ent2,
    fieldElevFt: 1880,
    onFinal: distToTh < 15000,
    toThresholdFt: distToTh,
    windowFt: windowOutFt,
  });

  // At 3° intercept (~14,000 - 16,000 ft out)
  if (distToTh > 10000 && distToTh < 15000 && speedAtIntercept === null) {
    speedAtIntercept = a.kt;
  }
  // On final before window (e.g. 6,000 - 8,000 ft out)
  if (distToTh > 5000 && distToTh < 8000) {
    configOnFinalBeforeWindow = b?.config;
    assert.ok(Math.abs(a.kt - 120) <= 2, `Aircraft on final before window must fly 120 kt, got ${a.kt} at dist=${distToTh}`);
  }
  // Passing the Window (~4,000 - 4,500 ft out)
  if (distToTh >= 4200 && distToTh <= 4500 && speedAtWindow === null) {
    speedAtWindow = a.kt;
  }
  // Inside window (< 3,000 ft out)
  if (distToTh < 3000 && distToTh > 500) {
    configInsideWindow = b?.config;
  }
  // Short final / touchdown (< 500 ft out)
  if (distToTh < 500 && speedAtTouchdown === null) {
    speedAtTouchdown = a.kt;
  }
}

console.log(`   Speed at 3° intercept: ${speedAtIntercept?.toFixed(1)} kt`);
console.log(`   Speed at Window: ${speedAtWindow?.toFixed(1)} kt`);
console.log(`   Speed near threshold/touchdown: ${speedAtTouchdown?.toFixed(1)} kt`);
console.log(`   Configuration on final before Window: ${configOnFinalBeforeWindow}`);
console.log(`   Configuration inside Window: ${configInsideWindow}`);

assert.ok(Math.abs(speedAtIntercept - 120) <= 2, `Speed at 3° intercept must be ~120 kt, got ${speedAtIntercept}`);
assert.ok(Math.abs(speedAtWindow - 120) <= 2, `Speed at Window must be ~120 kt, got ${speedAtWindow}`);
assert.ok(speedAtTouchdown <= 105 && speedAtTouchdown >= 95, `Speed near touchdown must be ~100 kt, got ${speedAtTouchdown}`);
assert.equal(configOnFinalBeforeWindow, CONFIG.gearTakeOffFlap, 'Must have gear and takeoff flaps on final before window');
assert.equal(configInsideWindow, CONFIG.gearLandingFlap, 'Must have gear and landing flaps inside window');

console.log('--- ALL STRAIGHT-IN SPEED & WINDOW VERIFICATIONS PASSED ---');
