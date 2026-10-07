// Verification script for Track B PFL Segment Planner
// NOTE: Standalone script, NOT run via node --test or npm test.
import assert from 'node:assert/strict';
import {
  generateZoomOrDecelSegment,
  predictApexEnergy,
  evaluateArcSegment,
  evaluateStraightSegment,
  buildSegmentChain,
  flyPflSegmentPlanner,
  obviouslyShort,
  pflGeometry,
  PFL,
} from './src/modules/traffic/pfl-segment-planner.js';
import { flyZoomT6A } from './src/core/t6-performance.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_29L_HDG_DEG, FIELD_ELEV_FT } from './src/modules/traffic/airfield.js';

console.log('--- CHECKPOINT 1: Foundation & Unified Zoom ---');
// Test 1: 220 KIAS zoom at 3,500 ft
const zoom1 = generateZoomOrDecelSegment({
  x: 0, y: 0, alt: 3500, kias: 220, headingDeg: 298,
});
const coreZoom = flyZoomT6A(220, 3500);
console.log(`Zoom from 220 KIAS at 3500 ft: gain = ${zoom1.deltaAltFt.toFixed(1)} ft (core flyZoomT6A = ${coreZoom.gainFt.toFixed(1)} ft)`);
// Verify within 2% of NFM / flyZoomT6A (~959 ft)
assert.ok(Math.abs(zoom1.deltaAltFt - coreZoom.gainFt) / coreZoom.gainFt < 0.02, `Zoom gain ${zoom1.deltaAltFt} deviates from core ${coreZoom.gainFt}`);
assert.equal(zoom1.exitKias, 125, 'Exit speed is 125 KIAS clean glide');
assert.equal(zoom1.type, 'zoom');

// Test 2: Level decel from 140 KIAS at 3,500 ft
const decel1 = generateZoomOrDecelSegment({
  x: 0, y: 0, alt: 3500, kias: 140, headingDeg: 298,
});
console.log(`Decel from 140 KIAS: deltaAlt = ${decel1.deltaAltFt.toFixed(1)} ft, exitKias = ${decel1.exitKias}`);
assert.equal(decel1.type, 'decel');
assert.equal(decel1.deltaAltFt, 0, 'Level decel holds altitude');
assert.equal(decel1.exitKias, 125, 'Decelerated to 125 KIAS');

// Test 3: Apex energy predictor
const apexPred = predictApexEnergy({
  startState: { x: 0, y: 0, alt: 3500, kias: 220, headingDeg: 298 },
});
console.log(`Apex Energy: apexAlt = ${apexPred.apexAltFt.toFixed(1)} ft, He = ${apexPred.energyHeightFt.toFixed(1)} ft`);
assert.ok(apexPred.energyHeightFt >= 3500 + 900);

console.log('\n--- CHECKPOINT 2: Arc & Straight Segment Evaluators ---');
// Test 4: 360° orbit at 30° bank and 120 KIAS clean vs gear down (SMM 13.5 para 11)
const cleanOrbit = evaluateArcSegment({
  startPt: { x: 0, y: 0 },
  startHeadingDeg: 0,
  startAltFt: 4500,
  turnDeg: 360,
  bankDeg: 30, // SMM 13.5 para 11 orbit bank
  side: 1,
  speedKias: 120,
  config: 0, // clean
});
const gearOrbit = evaluateArcSegment({
  startPt: { x: 0, y: 0 },
  startHeadingDeg: 0,
  startAltFt: 4500,
  turnDeg: 360,
  bankDeg: 30,
  side: 1,
  speedKias: 120,
  config: 1, // gearDown
});
console.log(`360° orbit at 30° bank, 120 KIAS: Clean loss = ${(-cleanOrbit.deltaAltFt).toFixed(0)} ft, Gear loss = ${(-gearOrbit.deltaAltFt).toFixed(0)} ft`);
assert.ok(-cleanOrbit.deltaAltFt >= 1400 && -cleanOrbit.deltaAltFt <= 1800, `Clean orbit loss ${-cleanOrbit.deltaAltFt} expected ~1500-1700 ft`);
assert.ok(-gearOrbit.deltaAltFt >= 2400 && -gearOrbit.deltaAltFt <= 2800, `Gear orbit loss ${-gearOrbit.deltaAltFt} expected ~2600 ft`);

// Test 5: Segment Chain Continuity
const geo = pflGeometry();
const chain = buildSegmentChain({
  startState: { ...THRESHOLD_29L, alt: 5000, kias: 125, headingDeg: 298 },
  planKind: 'highKey',
  geo,
  wind: { windFromDeg: 360, windKt: 0 },
});
console.log(`High Key Segment Chain: ${chain.segments.length} segments, totalDeltaAlt = ${chain.totalDeltaAltFt.toFixed(0)} ft`);
let segSum = 0;
for (let i = 0; i < chain.segments.length; i++) {
  const s = chain.segments[i];
  segSum += s.deltaAltFt ?? 0;
  if (i > 0) {
    const prev = chain.segments[i - 1];
    const prevExit = prev.exitPt ?? prev.apexPos;
    const currStart = s.startPt ?? s.points?.[0];
    if (prevExit && currStart) {
      const gap = Math.hypot(prevExit.x - currStart.x, prevExit.y - currStart.y);
      assert.ok(gap < 200, `Segment gap between ${i - 1} and ${i} is ${gap.toFixed(1)} ft`);
    }
  }
}
assert.ok(Math.abs(segSum - chain.totalDeltaAltFt) < 1e-4, 'Total deltaAlt matches sum of segments');

console.log('\n--- CHECKPOINT 3 & 4: Full Failure Matrix & Flying Runs ---');
const NM = 6076.12;
const STARTS = {
  'High Key, 5,000 ft': { ...THRESHOLD_29L, alt: 5000, kias: 125, headingDeg: 298 },
  'Low Key, 3,700 ft': { ...geo.at(180), alt: 3700, kias: 120, headingDeg: 118 },
  'Break, 220 kt': { x: -288, y: -1441, alt: 3500, kias: 220, headingDeg: 298 },
  'Break exit, 140 kt': { x: -3385, y: -4323, alt: 3500, kias: 140, headingDeg: 118 },
  'Area, 5 NM south, 7,500 ft': { x: THRESHOLD_29L.x, y: THRESHOLD_29L.y - 5 * NM, alt: 7500, kias: 125, headingDeg: 0 },
};

function onRunway(p) {
  const ux = DEPARTURE_END_29L.x - THRESHOLD_29L.x, uy = DEPARTURE_END_29L.y - THRESHOLD_29L.y;
  const len = Math.hypot(ux, uy);
  const along = ((p.x - THRESHOLD_29L.x) * ux + (p.y - THRESHOLD_29L.y) * uy) / len;
  const across = Math.abs((p.x - THRESHOLD_29L.x) * uy - (p.y - THRESHOLD_29L.y) * ux) / len;
  return along >= 0 && along <= len && across <= 150;
}

const WINDS = [
  { windFromDeg: 360, windKt: 0 },
  { windFromDeg: 298, windKt: 20 },
  { windFromDeg: 208, windKt: 20 },
];

const ALL_STARTS = {
  ...STARTS,
  'High Key, 6,500 ft (above window)': { ...THRESHOLD_29L, alt: 6500, kias: 125, headingDeg: 298 },
  'High Key, 5,600 ft (high in window)': { ...THRESHOLD_29L, alt: 5600, kias: 125, headingDeg: 298 },
  'Abeam departure end, 220 kt': { x: -10974, y: -12100, alt: 3500, kias: 220, headingDeg: 118 },
  'Area, 10 NM east, 8,000 ft': { x: THRESHOLD_29L.x + 10 * NM, y: THRESHOLD_29L.y, alt: 8000, kias: 125, headingDeg: 270 },
};

for (const wind of WINDS) {
  for (const [name, start] of Object.entries(ALL_STARTS)) {
    const flight = flyPflSegmentPlanner(start, wind);
    const last = flight.points.at(-1);
    const rwyOk = onRunway(last);
    console.log(`[${flight.outcome}] ${name} (${wind.windKt} kt from ${wind.windFromDeg}): TD along = ${flight.touchdown?.alongFt?.toFixed(0) ?? 'N/A'} ft, kias = ${flight.touchdown?.kias?.toFixed(0) ?? 'N/A'}, On Runway = ${rwyOk}`);
    assert.equal(flight.outcome, 'landed', `${name} did not land: ${flight.outcome}`);
    assert.ok(rwyOk, `${name} touched down off runway`);
    
    // Check staged drag spacing (Task 8: minimum 5 s between configuration changes)
    let lastCfg = flight.points[0]?.config;
    let lastTime = flight.points[0]?.tSec ?? 0;
    for (let i = 1; i < flight.points.length; i++) {
      const p = flight.points[i];
      if (p.config !== lastCfg) {
        const pTime = p.tSec ?? (i * 0.2);
        const timeDiff = pTime - lastTime;
        // Allow initial config setup, but verify in-flight transitions
        if (lastTime > 0 && p.phase !== 'pfl_zoom') {
          assert.ok(timeDiff >= 4.9, `Drag change too rapid: ${timeDiff.toFixed(1)}s between ${lastCfg} and ${p.config}`);
        }
        lastCfg = p.config;
        lastTime = pTime;
      }
    }
  }
}

// Final turn start (Task 7 Direct Approach & waiving 1st third)
console.log('\n--- FINAL TURN START (Task 7 Direct Recovery) ---');
const ftStart = { x: THRESHOLD_29L.x + 2500, y: THRESHOLD_29L.y - 1200, alt: FIELD_ELEV_FT + 420, kias: 120, headingDeg: 230 };
const ftFlight = flyPflSegmentPlanner(ftStart, WINDS[0]);
console.log(`Final turn start: outcome = ${ftFlight.outcome}, TD along = ${ftFlight.touchdown?.alongFt?.toFixed(0)} ft, decision = ${ftFlight.points.at(-1)?.decision}`);
assert.equal(ftFlight.outcome, 'landed', 'Final turn start should land on available runway');

// Test far-out start ejects
const farOut = flyPflSegmentPlanner({ x: THRESHOLD_29L.x + 30 * NM, y: THRESHOLD_29L.y, alt: 3000, kias: 125, headingDeg: 270 }, WINDS[0]);
console.log(`Far out (30 NM, 3000 ft): outcome = ${farOut.outcome}`);
assert.equal(farOut.outcome, 'eject', 'Far out must eject');

console.log('\nALL VERIFICATIONS PASSED SUCCESSFULLY!');
