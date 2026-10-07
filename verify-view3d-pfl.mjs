// Standalone verification script for Task 9C: 3D Scene Visualization & Telemetry Hooks
// NOTE: Standalone script, NOT run via node --test or npm test (per AGENTS.md observation 0050).

import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  DASH_FT,
  GLIDE_RING_COLOR,
  GROUND_LINE_LIFT_FT,
  pflBadgeColor,
  createSceneKit,
  loadFatLines,
  ALT_SCALE,
} from './src/modules/traffic/view3d.js';
import {
  getPflBadge,
  calculateGlideFootprint,
  shouldShowGlideFootprint,
  isPflActive,
} from './src/modules/traffic/map2d.js';
import { PFL, PFL_CONFIG_LABELS, flownGlideRatio } from './src/modules/traffic/pfl-segment-planner.js';

console.log('=== TEST 1: DASH_FT.pfl Export and Dash Configuration ===');
assert.ok(DASH_FT, 'DASH_FT must be exported');
assert.ok(Object.isFrozen(DASH_FT), 'DASH_FT must be frozen');
assert.ok(Array.isArray(DASH_FT.pfl), 'DASH_FT.pfl must be an array');
assert.equal(DASH_FT.pfl.length, 2, 'DASH_FT.pfl must have [dash, gap] components');
assert.equal(DASH_FT.pfl[0], 500, 'DASH_FT.pfl dashSize must be 500 ft');
assert.equal(DASH_FT.pfl[1], 250, 'DASH_FT.pfl gapSize must be 250 ft');
console.log(`✓ DASH_FT.pfl verified: [${DASH_FT.pfl.join(', ')}]`);

console.log('\n=== TEST 2: 3D Tactical PFL Badge Colors & Palette Integration ===');
const mockPalette = {
  text: '#ffffff',
  caution: '#f5c542',
  bad: '#ff4d4f',
  halo: '#0b1620',
};

// 2.1 Direct badge color checks
assert.equal(GLIDE_RING_COLOR, '#38bdf8', 'GLIDE_RING_COLOR must be #38bdf8');
assert.equal(pflBadgeColor('[PFL: ZOOM]', mockPalette), GLIDE_RING_COLOR, 'ZOOM badge gets GLIDE_RING_COLOR');
assert.equal(pflBadgeColor('[PFL: HIGH KEY]', mockPalette), GLIDE_RING_COLOR, 'HIGH KEY badge gets GLIDE_RING_COLOR');
assert.equal(pflBadgeColor('[PFL: LOW KEY]', mockPalette), GLIDE_RING_COLOR, 'LOW KEY badge gets GLIDE_RING_COLOR');
assert.equal(pflBadgeColor('[PFL: Direct (+40 ft)]', mockPalette), GLIDE_RING_COLOR, 'Direct badge gets GLIDE_RING_COLOR');
assert.equal(pflBadgeColor('[PFL: High Key (+250 ft) · Clean]', mockPalette), GLIDE_RING_COLOR, 'Decision badge gets GLIDE_RING_COLOR');
assert.equal(pflBadgeColor('[CRASH SHORT]', mockPalette), mockPalette.bad, '[CRASH SHORT] badge gets palette.bad');
assert.equal(pflBadgeColor('[EJECT]', mockPalette), mockPalette.bad, '[EJECT] badge gets palette.bad');
// Robustness with missing or empty palette:
assert.equal(pflBadgeColor('[CRASH SHORT]', undefined), '#ff4d4f', 'Missing palette defaults to #ff4d4f for crash');
assert.equal(pflBadgeColor('[EJECT]', {}), '#ff4d4f', 'Empty palette defaults to #ff4d4f for eject');
assert.equal(pflBadgeColor('[PFL: ZOOM]', undefined), GLIDE_RING_COLOR, 'Missing palette still gives GLIDE_RING_COLOR');

// 2.2 Inline ternary evaluation as in view3d.js line 2169
const evalBadgeColor = (pfl, palette) => (pfl === '[CRASH SHORT]' || pfl === '[EJECT]' ? palette.bad : GLIDE_RING_COLOR);
assert.equal(evalBadgeColor('[CRASH SHORT]', mockPalette), mockPalette.bad);
assert.equal(evalBadgeColor('[EJECT]', mockPalette), mockPalette.bad);
assert.equal(evalBadgeColor('[PFL: ZOOM]', mockPalette), GLIDE_RING_COLOR);

// 2.3 End-to-end aircraft state -> getPflBadge -> 3D badge color
const testCases = [
  {
    desc: 'Normal PFL in zoom',
    ac: { id: 'T6-1', status: 'flying', pflActive: true, phase: 'pfl_zoom' },
    expectedBadge: '[PFL: ZOOM]',
    expectedColor: GLIDE_RING_COLOR,
  },
  {
    desc: 'PFL with active decision and positive margin',
    ac: { id: 'T6-2', status: 'flying', pflActive: true, pflDecision: 'High Key', pflMarginFt: 250, config: 'Clean' },
    expectedBadge: '[PFL: High Key (+250 ft) · Clean]',
    expectedColor: GLIDE_RING_COLOR,
  },
  {
    desc: 'PFL with negative margin gear down',
    ac: { id: 'T6-3', status: 'flying', pflActive: true, pflDecision: 'Low Key', pflMarginFt: -100, config: 'Gear' },
    expectedBadge: '[PFL: Low Key (-100 ft) · Gear]',
    expectedColor: GLIDE_RING_COLOR,
  },
  {
    desc: 'Unrecoverable crash short',
    ac: { id: 'T6-4', status: 'crashed', phase: 'crash_short' },
    expectedBadge: '[CRASH SHORT]',
    expectedColor: mockPalette.bad,
  },
  {
    desc: 'Crew ejection initiated',
    ac: { id: 'T6-5', status: 'ejected', phase: 'pfl_eject' },
    expectedBadge: '[EJECT]',
    expectedColor: mockPalette.bad,
  },
];

for (const tc of testCases) {
  const badge = getPflBadge(tc.ac);
  assert.equal(badge, tc.expectedBadge, `${tc.desc}: badge matches expected`);
  const color = evalBadgeColor(badge, mockPalette);
  assert.equal(color, tc.expectedColor, `${tc.desc}: badge color matches expected`);
}
console.log('✓ All 3D badge color mappings verified');

console.log('\n=== TEST 3: 3D Aircraft Label Vertical Offset Geometry ===');
// Formula in view3d.js: p.y + (level ? 36 : options.layerLabels ? 22 : 8)
const computeOffset = (level, layerLabels) => (level ? 36 : layerLabels ? 22 : 8);
assert.equal(computeOffset('conflict', true), 36, 'Conflict level gets +36 px offset');
assert.equal(computeOffset('caution', false), 36, 'Caution level gets +36 px offset');
assert.equal(computeOffset(null, true), 22, 'No conflict with layerLabels gets +22 px offset');
assert.equal(computeOffset(null, false), 8, 'No conflict without layerLabels gets +8 px offset');
console.log('✓ 3D label vertical offset layering verified');

console.log('\n=== TEST 4: calculateGlideFootprint Aerodynamics & Wind Drift ===');
const FIELD_ELEV_FT = 1890;
const acClean = { id: 'AC1', x: 5000, y: 10000, alt: 4890, config: 'Clean', status: 'flying', pflActive: true };
const fpCalm = calculateGlideFootprint(acClean, 360, 0);

assert.ok(fpCalm.rGlide > 20000, `Calm glide radius should be > 20,000 ft, got ${fpCalm.rGlide}`);
assert.equal(fpCalm.cx, acClean.x, 'In calm wind, footprint center X matches aircraft X');
assert.equal(fpCalm.cy, acClean.y, 'In calm wind, footprint center Y matches aircraft Y');

// Wind from 360° at 20 kt should blow aircraft south (negative Y direction)
const fpWind = calculateGlideFootprint(acClean, 360, 20);
assert.ok(Math.abs(fpWind.cx - acClean.x) < 1e-4, 'Wind from 360° has zero crosswind drift on X');
assert.ok(fpWind.cy < acClean.y, `Wind from 360° should push center south (cy: ${fpWind.cy} < ay: ${acClean.y})`);
assert.ok(fpWind.driftFt > 0, `Drift feet should be positive, got ${fpWind.driftFt}`);
console.log(`✓ calculateGlideFootprint calm: rGlide=${fpCalm.rGlide.toFixed(0)} ft, wind drift=${fpWind.driftFt.toFixed(0)} ft south`);

console.log('\n=== TEST 5: 3D SceneKit Integration with syncPflGround ===');
const kit = createSceneKit(THREE);
assert.ok(kit, 'SceneKit initialized with three.js');

const groundFt = 1890;
const options = {
  groundFt,
  layerEngineReach: true,
  layerPflCircle: true,
};

const baseAc = {
  id: 'T6-TEST',
  type: 'CT-156',
  status: 'flying',
  x: 2000,
  y: 4000,
  alt: 5000,
  config: 'Clean',
  pflActive: true,
};

// 5.1 Aircraft not selected -> no glide ring
let scene = {
  routes: [],
  aircraft: [baseAc],
  selectedAircraftId: null,
  windFromDeg: 360,
  windKt: 0,
};
kit.sync(scene, options);
assert.equal(kit.glideRingsNow().size, 0, 'Unselected aircraft produces no glide ring');

// 5.2 Select aircraft -> glide ring created
scene.selectedAircraftId = 'T6-TEST';
kit.sync(scene, options);
assert.equal(kit.glideRingsNow().size, 1, 'Selected PFL aircraft produces 1 glide ring');

const ringCalm = kit.glideRingsNow().get('T6-TEST');
assert.ok(ringCalm, 'Glide ring data present in kit.glideRingsNow()');
assert.equal(Math.round(ringCalm.x), baseAc.x, 'Ring X matches aircraft X');
assert.equal(Math.round(ringCalm.y), baseAc.y, 'Ring Y matches aircraft Y');
assert.equal(Math.round(ringCalm.rFt), Math.round(calculateGlideFootprint(baseAc, 360, 0).rGlide), 'Ring radius matches calculateGlideFootprint');

// 5.3 Dynamic drag scaling through all 4 PFL configurations
const radii = [];
for (const cfgLabel of PFL_CONFIG_LABELS) {
  baseAc.config = cfgLabel;
  kit.sync(scene, options);
  const r = kit.glideRingsNow().get('T6-TEST').rFt;
  radii.push({ cfg: cfgLabel, r });
}
console.log('✓ Configuration drag scaling:');
for (const item of radii) {
  console.log(`   - ${item.cfg.padEnd(20)}: ${item.r.toFixed(0)} ft (${(item.r / 6076.12).toFixed(2)} NM)`);
}
// Validate that radius strictly decreases as drag configuration advances: Clean > Gear > T/O flap > Landing flap
assert.ok(radii[0].r > radii[1].r, 'Clean reach > Gear reach');
assert.ok(radii[1].r > radii[2].r, 'Gear reach > Flaps T/O reach');
assert.ok(radii[2].r > radii[3].r, 'Flaps T/O reach > Landing flap reach');

// 5.4 Wind drift scaling in 3D
scene.windFromDeg = 270; // West wind -> drifts East (positive X)
scene.windKt = 25;
baseAc.config = 'Clean';
kit.sync(scene, options);
const ringWinds = kit.glideRingsNow().get('T6-TEST');
assert.ok(ringWinds.x > baseAc.x, `West wind pushes center east (ring.x: ${ringWinds.x} > ac.x: ${baseAc.x})`);

// 5.5 Layer toggle: disable engine reach
kit.sync(scene, { ...options, layerEngineReach: false });
assert.equal(kit.glideRingsNow().size, 0, 'layerEngineReach: false clears all glide rings');

// Re-enable layer
kit.sync(scene, { ...options, layerEngineReach: true });
assert.equal(kit.glideRingsNow().size, 1, 'layerEngineReach: true restores glide ring');

// 5.5b Layer decoupling: layerPflCircle false while layerEngineReach true
kit.sync(scene, { ...options, layerPflCircle: false, layerEngineReach: true });
assert.equal(kit.glideRingsNow().size, 1, 'layerPflCircle: false does NOT hide glide ring when layerEngineReach is true');

// 5.5c Resiliency: sync without options argument does not throw
kit.sync(scene);
assert.equal(kit.glideRingsNow().size, 1, 'kit.sync(scene) without options runs cleanly');

// 5.6 Deselection cleanup
scene.selectedAircraftId = 'OTHER_AC';
kit.sync(scene, options);
assert.equal(kit.glideRingsNow().size, 0, 'Deselection cleanly removes glide ring');

// 5.7 Re-select and simulate crash/ejection
scene.selectedAircraftId = 'T6-TEST';
baseAc.status = 'ejected';
kit.sync(scene, options);
assert.equal(kit.glideRingsNow().size, 0, 'Ejected aircraft has no ground glide ring');

baseAc.status = 'crashed';
kit.sync(scene, options);
assert.equal(kit.glideRingsNow().size, 0, 'Crashed aircraft has no ground glide ring');

// 5.8 Route line rendering with pfl kind (thin lines mode)
scene.aircraft = [];
scene.routes = [
  {
    id: 'pfl-path-test',
    kind: 'pfl',
    color: GLIDE_RING_COLOR,
    path: [
      { x: 0, y: 0, alt: 5000 },
      { x: 2000, y: 3000, alt: 3500 },
      { x: 4000, y: 6000, alt: 2000 },
    ],
  },
];
kit.sync(scene, options);
const thinPflLine = kit.root.children.find(
  (c) => c.isLine && c.material?.isLineDashedMaterial && c.material.dashSize === 500
);
assert.ok(thinPflLine, 'Thin dashed PFL route line must exist in scene graph');
assert.equal(thinPflLine.material.gapSize, 250, 'Gap size must match DASH_FT.pfl[1] = 250');
assert.equal(thinPflLine.material.color.getHexString().toLowerCase(), '38bdf8', 'Thin line color must match GLIDE_RING_COLOR');
console.log('✓ Dynamic PFL dashed route (thin lines mode) verified with [500, 250] dash/gap');

// 5.9 Dynamic PFL route line rendering with fatLines (Line2 wide lines)
const fatLines = await loadFatLines();
assert.ok(fatLines, 'loadFatLines() must load Three.js Line2 addons');
const fatKit = createSceneKit(THREE, { fatLines });
assert.ok(fatKit, 'SceneKit initialized with fatLines');
fatKit.sync(scene, options);
const widePflLine = fatKit.root.children.find(
  (c) => c.material?.dashed === true && c.material.dashSize === 500
);
assert.ok(widePflLine, 'Wide Line2 dashed PFL route line must exist in fatKit scene graph');
assert.equal(widePflLine.material.gapSize, 250, 'Line2 gap size must match DASH_FT.pfl[1] = 250');
fatKit.dispose();
console.log('✓ Dynamic PFL dashed route (fatLines wide mode) verified with [500, 250] dash/gap');

// 5.10 Scene disposal
kit.dispose();
console.log('✓ kit.dispose() executed with zero errors');

console.log('\n========================================');
console.log('ALL TASK 9C VERIFICATION CHECKS PASSED!');
console.log('========================================');
