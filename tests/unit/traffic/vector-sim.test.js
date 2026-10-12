// Checks: one CT-156 round the built-in circuit from the break, in calm air and in wind (20 kt down the runway,
//   15 kt across from either side), checked by shape: the perch moves upwind by the wind's drift over the final
//   turn; the break is level at about 60 degrees of bank, speed only falls to about 140 KIAS, and it rolls out
//   wings level on the downwind line; the final turn is one descending turn under 45 degrees that rolls out on the
//   centreline; the touch-and-go comes down to the runway and climbs away on runway heading; the crab on final is
//   the one the crosswind gives; a touch-and-go asked for in flight makes no jump. No roll faster than 90 deg/s.
// Serves: TR-R5, TR-R7, TR-R8, TR-R9, TR-R10, TR-R13, TR-R30.
// Expected values: drift = wind x turn time and the crab angle asin(crosswind / true airspeed), worked out in the
//   test (TP3); 60 degrees, 220 to about 140 KIAS, level, in the break (SMM 4.17 paras 38-42; TR-R7); up to 45 and
//   about 35 degrees in the final turn, rolling out on the centreline (SMM 4.19 paras 43-48; TR-R9); 3,500 ft
//   pattern height (TR-R4); runway heading 298 and the runway at the field's 1,892 ft in the sim (TR-149); 90 deg/s roll is Patrick's
//   step limit (4 Oct 10:18Z, smooth-transitions). Margins from the shared table (docs/TESTING.md). No G number is
//   checked (Patrick, 11 Oct 19:37Z): bank and shape instead. The breakout and go-around are in breakout.test.js and
//   commands.test.js, the closed pattern in closed-pattern.test.js, the straight-in in plausibility.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeWindPerch, routePath, DEFAULT_ROUTE_OPTIONS } from '../../../src/modules/traffic/route.js';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { THRESHOLD_29L, DEPARTURE_END_29L, RUNWAY_29L_HDG_DEG, THRESHOLD_DATA_ELEV_FT } from '../../../src/modules/traffic/airfield.js';
import { ktToFtps } from '../../../src/core/units.js';
import { iasToTasKt } from '../../../src/core/t6-performance.js';
import { legOffsetsFt } from '../../../src/core/geo.js';
import { compassDegFromVector, wrapDeg180 } from '../../../src/core/angles.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const MOOSE_JAW = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const PAT1 = MOOSE_JAW.routes.find((r) => r.id === 'PAT1');
const KT = TOLERANCES.AIRSPEED_KT, FT = TOLERANCES.ALTITUDE_FT, DEG = TOLERANCES.ANGLE_DEG, DIST = TOLERANCES.DISTANCE_FT;
const PATTERN_FT = 3500, RUNWAY_FT = THRESHOLD_DATA_ELEV_FT;
const MAX_ROLL_DPS = 90; // Patrick, 4 Oct 10:18Z: no step banks faster than a 90°/s roll (TR-R30)
// Safety stop: 5 minutes, well over the one circuit (about 3 minutes) each run flies, so only a stuck aircraft reaches it.
const STOP_SEC = 300;

const WINDS = [
  { label: 'calm', windKt: 0, windFromDeg: 360 },
  { label: '20 kt down the runway', windKt: 20, windFromDeg: 298 },
  { label: '15 kt across from the right on final', windKt: 15, windFromDeg: 28 },
  { label: '15 kt across from the left on final', windKt: 15, windFromDeg: 208 },
];

/** One CT-156 starting the break (Pattern 1 point 10) in the wind given, flown a step at a time; `each(a, prev)` sees every step. */
function flyFromBreak(wind, until, each = () => {}) {
  const sim = createSim({ ...structuredClone(MOOSE_JAW), windKt: wind.windKt, windFromDeg: wind.windFromDeg, aircraft: [{ id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }] }, { seed: 1 });
  let prev = sim.state().aircraft[0];
  while (sim.t < STOP_SEC && !until(prev)) {
    sim.stepTo(sim.t + STEP_SEC);
    const a = sim.state().aircraft[0];
    each(a, prev);
    prev = a;
  }
  return { sim, end: prev };
}
const rollDps = (a, prev) => Math.abs(a.bankDeg - prev.bankDeg) / STEP_SEC;

// ── The perch moves with the wind (TR-R8, TP3) ───────────────────────────────

test('the perch moves upwind, into the wind, for a headwind on final and for a crosswind from either side', () => {
  for (const w of WINDS.filter((x) => x.windKt > 0)) {
    const calm = computeWindPerch(PAT1, 360, 0);
    const shifted = computeWindPerch(PAT1, w.windFromDeg, w.windKt);
    const bearing = compassDegFromVector(shifted.x - calm.x, shifted.y - calm.y);
    assert.ok(Math.abs(wrapDeg180(bearing - w.windFromDeg)) <= DEG, `${w.label}: moves toward ${w.windFromDeg}°, got ${bearing.toFixed(1)}°`);
  }
});

test('the perch moves by the wind\'s drift over the final turn: wind speed times the turn\'s time', () => {
  for (const w of WINDS.filter((x) => x.windKt > 0)) {
    const calm = computeWindPerch(PAT1, 360, 0);
    const shifted = computeWindPerch(PAT1, w.windFromDeg, w.windKt);
    const driftFt = ktToFtps(w.windKt) * shifted.turnSec; // worked out here: the air moves this far while the turn is flown
    const shiftFt = Math.hypot(shifted.x - calm.x, shifted.y - calm.y);
    assert.ok(Math.abs(shiftFt - driftFt) <= DIST, `${w.label}: moved ${shiftFt.toFixed(0)} ft, drift ${driftFt.toFixed(0)} ft`);
  }
});

// ── The break (TR-R7, TP1) ───────────────────────────────────────────────────

test('the break is level at about 60° of bank, speed only falls to about 140 KIAS, and it rolls out wings level on the downwind line', () => {
  for (const w of WINDS) {
    const built = routePath(PAT1, { ...DEFAULT_ROUTE_OPTIONS, ...(MOOSE_JAW.routeOptions ?? {}), windKt: w.windKt, windFromDeg: w.windFromDeg }).points;
    const rollout = built.find((p) => p.tag === 'break_rollout'), perch = built.find((p) => p.tag === 'perch');
    const lineTrack = compassDegFromVector(perch.x - rollout.x, perch.y - rollout.y);
    let steepest = 0, speedRose = 0, offHeight = 0, fastestRoll = 0, inBreak = false;
    const { end } = flyFromBreak(w, (a) => inBreak && a.phase !== 'break' && Math.abs(a.bankDeg) <= DEG, (a, prev) => {
      fastestRoll = Math.max(fastestRoll, rollDps(a, prev));
      if (a.phase !== 'break') return;
      inBreak = true;
      steepest = Math.max(steepest, Math.abs(a.bankDeg));
      offHeight = Math.max(offHeight, Math.abs(a.alt - PATTERN_FT));
      if (prev.phase === 'break') speedRose = Math.max(speedRose, a.kt - prev.kt);
    });
    assert.ok(inBreak && end.phase !== 'break', `${w.label}: flies the break and rolls out`);
    assert.ok(Math.abs(steepest - 60) <= DEG, `${w.label}: about 60° of bank, steepest ${steepest.toFixed(1)}°`);
    assert.ok(offHeight <= FT, `${w.label}: level at pattern height, off by up to ${offHeight.toFixed(0)} ft`);
    assert.ok(speedRose <= 0, `${w.label}: speed only falls in the break (rose by up to ${speedRose.toFixed(2)} kt in a step)`);
    assert.ok(Math.abs(end.kt - 140) <= KT, `${w.label}: about 140 KIAS at the rollout, got ${end.kt.toFixed(0)}`);
    const off = legOffsetsFt(rollout, perch, end);
    assert.ok(Math.abs(off.crossFt) <= DIST, `${w.label}: on the downwind line, ${off.crossFt.toFixed(0)} ft off`);
    assert.ok(Math.abs(wrapDeg180(end.trackDeg - lineTrack)) <= DEG, `${w.label}: tracking down the line (${end.trackDeg.toFixed(1)}° vs ${lineTrack.toFixed(1)}°)`);
    assert.ok(fastestRoll <= MAX_ROLL_DPS, `${w.label}: no roll faster than ${MAX_ROLL_DPS}°/s, got ${fastestRoll.toFixed(0)}°/s`);
  }
});

// ── The final turn (TR-R9, TP1) ──────────────────────────────────────────────

test('the final turn is one descending turn under 45° that rolls out wings level on the centreline', () => {
  for (const w of WINDS) {
    let steepest = 0, climbed = 0, turned = false, fastestRoll = 0;
    const { end } = flyFromBreak(w, (a) => turned && a.phase !== 'final_turn', (a, prev) => {
      fastestRoll = Math.max(fastestRoll, rollDps(a, prev));
      if (a.phase !== 'final_turn') return;
      turned = true;
      steepest = Math.max(steepest, Math.abs(a.bankDeg));
      if (prev.phase === 'final_turn') climbed = Math.max(climbed, a.alt - prev.alt);
    });
    assert.ok(turned, `${w.label}: flies the final turn`);
    assert.equal(end.phase, 'final', `${w.label}: rolls out on final`);
    // Up to 45°, and about 35° when the perch is placed for the wind (TR-R9); ±5°: the shared angle margin.
    assert.ok(steepest <= 45 && Math.abs(steepest - 35) <= DEG, `${w.label}: steepest bank ${steepest.toFixed(1)}°`);
    assert.ok(climbed <= 0, `${w.label}: height never rises in the turn (rose up to ${climbed.toFixed(2)} ft in a step)`);
    const off = legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, end);
    assert.ok(Math.abs(off.crossFt) <= DIST, `${w.label}: on the centreline, ${off.crossFt.toFixed(0)} ft off`);
    assert.ok(Math.abs(wrapDeg180(end.trackDeg - RUNWAY_29L_HDG_DEG)) <= DEG, `${w.label}: tracking down the runway (${end.trackDeg.toFixed(1)}°)`);
    assert.ok(Math.abs(end.bankDeg) <= DEG, `${w.label}: wings level, ${end.bankDeg.toFixed(1)}°`);
    assert.ok(fastestRoll <= MAX_ROLL_DPS, `${w.label}: no roll faster than ${MAX_ROLL_DPS}°/s`);
  }
});

// ── Crab on final (TR-R5, TP3) ───────────────────────────────────────────────

test('on final the crab is the one the crosswind gives, asin(crosswind / true airspeed), and mirrors with the wind', () => {
  for (const w of WINDS) {
    const { end } = flyFromBreak(w, (a) => a.phase === 'final');
    const crossKt = w.windKt * Math.sin(((w.windFromDeg - end.trackDeg) * Math.PI) / 180); // from the right is positive
    const wantDeg = (Math.asin(crossKt / iasToTasKt(end.kt, end.alt)) * 180) / Math.PI;
    assert.ok(Math.abs(end.crabDeg - wantDeg) <= DEG, `${w.label}: crab ${end.crabDeg.toFixed(1)}°, worked out ${wantDeg.toFixed(1)}°`);
    assert.ok(Math.abs(wrapDeg180(end.headingDeg - (end.trackDeg + end.crabDeg))) <= DEG, `${w.label}: heading is track plus crab`);
  }
});

// ── The touch-and-go (TR-R10, TR-R13, TP1) ───────────────────────────────────

test('the touch-and-go comes down to the runway and climbs away on runway heading, still flying', () => {
  for (const w of WINDS) {
    let lowest = Infinity, touched = null, offHeading = 0;
    const { end } = flyFromBreak(w, (a) => a.phase === 'crosswind' || a.status !== 'flying', (a) => {
      if (a.phase === 'final' || a.phase === 'touch_and_go') lowest = Math.min(lowest, a.alt);
      if (!touched && (a.phase === 'touch_and_go' || a.phase === 'climb')) touched = a;
      if (touched && a.phase === 'climb') offHeading = Math.max(offHeading, Math.abs(wrapDeg180(a.trackDeg - RUNWAY_29L_HDG_DEG)));
    });
    assert.ok(touched, `${w.label}: touches down`);
    assert.ok(lowest <= RUNWAY_FT + FT, `${w.label}: comes down to the runway (lowest ${lowest.toFixed(0)} ft)`);
    const off = legOffsetsFt(THRESHOLD_29L, DEPARTURE_END_29L, touched);
    const runwayFt = Math.hypot(DEPARTURE_END_29L.x - THRESHOLD_29L.x, DEPARTURE_END_29L.y - THRESHOLD_29L.y);
    assert.ok(off.alongFt >= 0 && off.alongFt <= runwayFt && Math.abs(off.crossFt) <= DIST, `${w.label}: touches down on the runway (${off.alongFt.toFixed(0)} ft along, ${off.crossFt.toFixed(0)} ft off)`);
    assert.ok(offHeading <= DEG, `${w.label}: climbs away on runway heading (off by up to ${offHeading.toFixed(1)}°)`);
    assert.equal(end.status, 'flying', `${w.label}: still flying`);
    assert.equal(end.phase, 'crosswind', `${w.label}: carries on round the circuit`);
    assert.ok(end.alt >= PATTERN_FT - FT, `${w.label}: back at pattern height by the crosswind turn (${end.alt.toFixed(0)} ft)`);
  }
});

test('a touch-and-go asked for in flight makes the next landing a touch-and-go, with no jump to the threshold', () => {
  const { sim } = flyFromBreak(WINDS[0], (a) => a.phase === 'break' && Math.abs(a.bankDeg) > 30);
  const before = sim.state().aircraft[0];
  assert.equal(sim.command('A1', 'touch_and_go'), true);
  const after = sim.state().aircraft[0];
  assert.equal(after.intent, 'touch_and_go');
  // Under 1 ft: the command moves nothing (Traffic spec item 21), it only sets the next landing.
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 1, 'it stays where it is, no jump to the threshold');
  assert.ok(Math.abs(after.alt - before.alt) < 1, 'and at its height');
});
