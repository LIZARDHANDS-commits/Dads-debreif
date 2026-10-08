// Standalone verification script for Task 9B: 2D Map Overlays, Tactical Badges & Planned Track
// NOTE: Standalone script, NOT run via node --test or npm test (per AGENTS.md observation 0050).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getPflBadge,
  routeStyle,
  calculateGlideFootprint,
  shouldShowGlideFootprint,
  isPflActive,
} from './src/modules/traffic/map2d.js';
import { createSim } from './src/modules/traffic/sim.js';
import { buildScene } from './src/modules/traffic/scene.js';
import { PFL, PFL_CONFIGS, PFL_CONFIG_LABELS } from './src/modules/traffic/pfl-segment-planner.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('./src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));

console.log('=== TEST 1: Tactical Badges (getPflBadge) ===');

// 1.1 Null / invalid input
assert.equal(getPflBadge(null), null, 'null aircraft returns null');
assert.equal(getPflBadge(undefined), null, 'undefined aircraft returns null');

// 1.2 Ejection handling (case-insensitive and all ejection phase variants)
assert.equal(getPflBadge({ status: 'ejected' }), '[EJECT]', 'status ejected returns [EJECT]');
assert.equal(getPflBadge({ status: 'Ejected' }), '[EJECT]', 'status Ejected (capitalized) returns [EJECT]');
assert.equal(getPflBadge({ status: 'EJECTED' }), '[EJECT]', 'status EJECTED returns [EJECT]');
assert.equal(getPflBadge({ phase: 'ejected' }), '[EJECT]', 'phase ejected returns [EJECT]');
assert.equal(getPflBadge({ phase: 'eject' }), '[EJECT]', 'phase eject returns [EJECT]');
assert.equal(getPflBadge({ phase: 'EJECT' }), '[EJECT]', 'phase EJECT returns [EJECT]');
assert.equal(getPflBadge({ phase: 'pfl_eject' }), '[EJECT]', 'phase pfl_eject returns [EJECT]');
assert.equal(getPflBadge({ phase: 'ejection' }), '[EJECT]', 'phase ejection returns [EJECT]');
assert.equal(getPflBadge({ pflSegment: 'eject' }), '[EJECT]', 'pflSegment eject returns [EJECT]');

// 1.3 Crash short handling (case-insensitive and all crash variants without requiring extraneous flags)
assert.equal(getPflBadge({ status: 'crashed' }), '[CRASH SHORT]', 'status crashed returns [CRASH SHORT]');
assert.equal(getPflBadge({ status: 'Crashed' }), '[CRASH SHORT]', 'status Crashed returns [CRASH SHORT]');
assert.equal(getPflBadge({ phase: 'crash_short' }), '[CRASH SHORT]', 'phase crash_short returns [CRASH SHORT]');
assert.equal(getPflBadge({ phase: 'CRASH_SHORT' }), '[CRASH SHORT]', 'phase CRASH_SHORT returns [CRASH SHORT]');
assert.equal(getPflBadge({ phase: 'pfl_crash' }), '[CRASH SHORT]', 'phase pfl_crash returns [CRASH SHORT]');
assert.equal(getPflBadge({ phase: 'crash' }), '[CRASH SHORT]', 'phase crash returns [CRASH SHORT]');
assert.equal(getPflBadge({ pflSegment: 'crash' }), '[CRASH SHORT]', 'pflSegment crash returns [CRASH SHORT]');

// 1.4 Decision with margin and config
assert.equal(
  getPflBadge({ pflDecision: 'High Key', pflMarginFt: 250, config: 'Clean' }),
  '[PFL: High Key (+250 ft) · Clean]',
  'positive margin formatting'
);
assert.equal(
  getPflBadge({ pflDecision: 'Low Key', pflMarginFt: -120.4, config: 'Gear' }),
  '[PFL: Low Key (-120 ft) · Gear]',
  'negative margin formatting rounded'
);
assert.equal(
  getPflBadge({ pflDecision: 'High Key', pflMarginFt: 0, config: 'Clean' }),
  '[PFL: High Key (+0 ft) · Clean]',
  'zero margin has + prefix'
);
assert.equal(
  getPflBadge({ pflDecision: 'Direct', pflMarginFt: 45.8 }),
  '[PFL: Direct (+46 ft)]',
  'decision without config'
);
assert.equal(
  getPflBadge({ pflDecision: 'High Key', pflMarginFt: null, config: 'Clean' }),
  '[PFL: High Key · Clean]',
  'decision with null margin omits marginStr'
);
assert.equal(
  getPflBadge({ pflDecision: 'High Key', pflMarginFt: NaN, config: 'Clean' }),
  '[PFL: High Key · Clean]',
  'decision with NaN margin omits marginStr'
);

// 1.5 Fallback phases (including uppercase and segment types)
assert.equal(getPflBadge({ pflActive: true, phase: 'pfl_zoom' }), '[PFL: ZOOM]', 'pfl_zoom phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'PFL_ZOOM' }), '[PFL: ZOOM]', 'PFL_ZOOM uppercase phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'zoom' }), '[PFL: ZOOM]', 'zoom phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'pfl_decel' }), '[PFL: ZOOM]', 'pfl_decel phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'decel' }), '[PFL: ZOOM]', 'decel phase');
assert.equal(getPflBadge({ pflActive: true, pflSegment: 'zoom' }), '[PFL: ZOOM]', 'pflSegment zoom');

assert.equal(getPflBadge({ pflActive: true, phase: 'pfl_high_key' }), '[PFL: HIGH KEY]', 'pfl_high_key phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'high_key' }), '[PFL: HIGH KEY]', 'high_key phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'HIGH_KEY' }), '[PFL: HIGH KEY]', 'HIGH_KEY uppercase phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'pfl_orbit' }), '[PFL: HIGH KEY]', 'pfl_orbit phase');
assert.equal(getPflBadge({ pflActive: true, pflSegment: 'high_key' }), '[PFL: HIGH KEY]', 'pflSegment high_key');

assert.equal(getPflBadge({ pflActive: true, phase: 'pfl_low_key' }), '[PFL: LOW KEY]', 'pfl_low_key phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'low_key' }), '[PFL: LOW KEY]', 'low_key phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'LOW_KEY' }), '[PFL: LOW KEY]', 'LOW_KEY uppercase phase');
assert.equal(getPflBadge({ pflActive: true, pflSegment: 'low_key' }), '[PFL: LOW KEY]', 'pflSegment low_key');

assert.equal(getPflBadge({ pflActive: true, phase: 'pfl_base_key' }), '[PFL: BASE KEY]', 'pfl_base_key phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'base_key' }), '[PFL: BASE KEY]', 'base_key phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'BASE_KEY' }), '[PFL: BASE KEY]', 'BASE_KEY uppercase phase');
assert.equal(getPflBadge({ pflActive: true, pflSegment: 'base_key' }), '[PFL: BASE KEY]', 'pflSegment base_key');

assert.equal(getPflBadge({ pflActive: true, phase: 'pfl_direct' }), '[PFL: DIRECT]', 'pfl_direct phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'direct_threshold' }), '[PFL: DIRECT]', 'direct_threshold phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'DIRECT' }), '[PFL: DIRECT]', 'DIRECT uppercase phase');
assert.equal(getPflBadge({ pflActive: true, phase: 'final' }), '[PFL: DIRECT]', 'final phase in PFL');
assert.equal(getPflBadge({ pflActive: true, pflSegment: 'straight' }), '[PFL: DIRECT]', 'pflSegment straight');

// 1.6 Altitude / speed heuristics when phase is generic 'pfl'
assert.equal(getPflBadge({ pflActive: true, phase: 'pfl', alt: 5000 }), '[PFL: HIGH KEY]', 'alt >= 4500 fallback');
assert.equal(getPflBadge({ pflActive: true, phase: 'pfl', alt: 3500 }), '[PFL: LOW KEY]', 'alt >= 3400 fallback');
assert.equal(getPflBadge({ pflActive: true, phase: 'pfl', alt: 2800 }), '[PFL: BASE KEY]', 'alt >= 2700 fallback');
assert.equal(getPflBadge({ pflActive: true, phase: 'pfl', alt: 2000 }), '[PFL: DIRECT]', 'alt < 2700 fallback');
assert.equal(getPflBadge({ pflActive: true, phase: 'pfl', kt: 160 }), '[PFL: ZOOM]', 'speed > 150 fallback');

// 1.7 Non-PFL normal aircraft
assert.equal(getPflBadge({ status: 'flying', phase: 'downwind' }), null, 'normal downwind returns null');
assert.equal(getPflBadge({ status: 'flying', phase: 'final' }), null, 'normal final returns null');
assert.equal(getPflBadge({ status: 'flying', phase: 'initial' }), null, 'normal initial returns null');

console.log('✓ All getPflBadge cases passed');

console.log('\n=== TEST 2: isPflActive helper ===');
assert.equal(isPflActive({ engineFailed: true }), true, 'engineFailed returns true');
assert.equal(isPflActive({ command: 'pfl_current' }), true, 'pfl_current returns true');
assert.equal(isPflActive({ command: 'PFL_CURRENT' }), true, 'uppercase command returns true');
assert.equal(isPflActive({ phase: 'PFL_ZOOM' }), true, 'uppercase phase returns true');
assert.equal(isPflActive({ phase: 'pfl_eject' }), true, 'pfl_eject returns true');
assert.equal(isPflActive({ status: 'crashed' }), true, 'crashed returns true');
assert.equal(isPflActive({ status: 'ejected' }), true, 'ejected returns true');
assert.equal(isPflActive({ pflRoute: { points: [] } }), true, 'pflRoute presence returns true');
assert.equal(isPflActive({ pflFlight: true }), true, 'pflFlight presence returns true');
assert.equal(isPflActive({ status: 'flying', phase: 'downwind' }), false, 'normal aircraft returns false');
console.log('✓ isPflActive verified');

console.log('\n=== TEST 3: Route Styling & Dash-Dot Specification ===');
const stylePfl = routeStyle('pfl');
assert.deepEqual(stylePfl.dash, [10, 4, 2, 4], 'pfl route dash-dot pattern [10, 4, 2, 4]');
assert.equal(stylePfl.width, 2.5, 'pfl route width is 2.5');
console.log('✓ routeStyle("pfl") verified');

console.log('\n=== TEST 4: Glide Footprint calculation ===');
const cleanAc = { alt: 5000, config: 'Clean', x: 0, y: 0 };
const gearAc = { alt: 5000, config: 'Gear', x: 0, y: 0 };
const fpClean = calculateGlideFootprint(cleanAc, 360, 0);
const fpGear = calculateGlideFootprint(gearAc, 360, 0);

assert.ok(fpClean.rGlide > 0, 'Clean footprint radius > 0');
assert.ok(fpGear.rGlide > 0, 'Gear footprint radius > 0');
assert.ok(fpClean.rGlide > fpGear.rGlide, `Clean glide (${fpClean.rGlide} ft) exceeds Gear glide (${fpGear.rGlide} ft) due to drag`);
console.log(`✓ Glide footprint verified: Clean = ${Math.round(fpClean.rGlide)} ft, Gear = ${Math.round(fpGear.rGlide)} ft`);

console.log('\n=== TEST 5: Sim State Exposure (pflRoute) ===');
const sim = createSim(structuredClone(MOOSE_JAW));
const id = sim.spawn({ type: 'CT-156', routeId: 'PAT1', startPoint: 9, delaySec: 0 });
sim.stepTo(0.1);

let acState = sim.state().aircraft.find((a) => a.id === id);
assert.ok(acState, 'Aircraft exists');
assert.equal(acState.pflRoute, null, 'pflRoute is initially null');

const ok = sim.command(id, 'pfl_current');
assert.equal(ok, true, 'Command pfl_current accepted');

acState = sim.state().aircraft.find((a) => a.id === id);
assert.ok(acState.pflRoute, 'pflRoute is exposed in state()');
assert.equal(acState.pflRoute.kind, 'pfl', 'pflRoute.kind is "pfl"');
assert.ok(Array.isArray(acState.pflRoute.points), 'pflRoute.points is array');
assert.ok(acState.pflRoute.points.length > 1, `pflRoute has points (${acState.pflRoute.points.length})`);
console.log(`✓ Sim state exposed pflRoute with kind="${acState.pflRoute.kind}" and ${acState.pflRoute.points.length} points`);

console.log('\n=== TEST 6: Scene Builder (buildScene with Dynamic PFL Route) ===');
const stateBeforePfl = {
  t: 0,
  aircraft: [{ id: 'TEST1', pflRoute: null, status: 'flying' }],
  conflicts: [],
};
const sceneBefore = buildScene({
  setup: MOOSE_JAW,
  state: stateBeforePfl,
  selectedRouteId: null,
  trailOf: () => [],
});
const pflRoutesBefore = sceneBefore.routes.filter((r) => r.id.startsWith('PFL_'));
assert.equal(pflRoutesBefore.length, 0, 'No dynamic PFL route when pflRoute is null');

const stateWithPfl = {
  t: 10,
  aircraft: [
    {
      id: 'PFL_AC1',
      status: 'flying',
      pflRoute: {
        id: 'PFL_FLOWN',
        kind: 'pfl',
        points: [
          { x: 0, y: 0, alt: 4000 },
          { x: 1000, y: 2000, alt: 3500 },
          { x: 2000, y: 3000, alt: 2500 },
        ],
      },
    },
  ],
  conflicts: [],
};
const sceneWithPfl = buildScene({
  setup: MOOSE_JAW,
  state: stateWithPfl,
  selectedRouteId: null,
  trailOf: () => [],
});

const pflRouteEntry = sceneWithPfl.routes.find((r) => r.id === 'PFL_PFL_AC1');
assert.ok(pflRouteEntry, 'Dynamic PFL route appended to scene.routes');
assert.equal(pflRouteEntry.name, 'PFL Glide (PFL_AC1)', 'Route name matches specification');
assert.equal(pflRouteEntry.kind, 'pfl', 'Route kind is pfl');
assert.equal(pflRouteEntry.color, '#38bdf8', 'Route color is #38bdf8');
assert.equal(pflRouteEntry.visible, false, 'Route is not visible by default when unselected');

const sceneWithPflSelected = buildScene({
  setup: MOOSE_JAW,
  state: stateWithPfl,
  selectedRouteId: 'PFL_PFL_AC1',
  trailOf: () => [],
});
const pflRouteSelected = sceneWithPflSelected.routes.find((r) => r.id === 'PFL_PFL_AC1');
assert.equal(pflRouteSelected.visible, true, 'Route is visible when selected');

assert.equal(pflRouteEntry.points.length, 3, 'Route points length is 3');
assert.equal(pflRouteEntry.path.length, 3, 'Route path length is 3');
console.log('✓ Dynamic PFL route correctly appended to scene.routes (hidden by default, shown when selected)');

// Test resilient buildScene call with empty aircraft and missing trailOf
const emptyScene = buildScene({
  setup: MOOSE_JAW,
  state: { t: 0 },
});
assert.ok(Array.isArray(emptyScene.routes), 'emptyScene routes is array');
assert.deepEqual(emptyScene.aircraft, [], 'emptyScene aircraft defaults to empty array');
console.log('✓ buildScene empty state resiliency verified');

console.log('\n=== ALL TASK 9B VERIFICATION CHECKS PASSED ===');
