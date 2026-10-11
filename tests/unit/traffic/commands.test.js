// Checks: each in-flight command from a stated start on Pattern 1, alone in the circuit, followed to its end result:
//   an engine failure fast zooms then glides, one slow holds height while it slows then glides, and both end on the
//   runway (a touch-and-go) or in an ejection; a breakout climbs at the 140 KIAS climb to 4,500 ft, speeds up and
//   rejoins without coming down into the circuit; a go-around climbs away on runway heading and turns crosswind;
//   the PFL button glides at 125 KIAS clean after the zoom; High Key climbs under power to about 5,000 ft over the
//   threshold, cuts the engine there and flies a touch-and-go; a closed pattern from the departure end goes on to
//   the final turn. Each moment is found by what the aircraft is doing, never at a chosen second.
// Serves: TR-R13, TR-R14, TR-R31, TR-R33, TR-R34, Traffic spec 4.5.
// Expected values: 150 KIAS zoom split, 125 KIAS clean glide and High Key 5,000 ft are TR-R14 and spec 4.5 (SMM 13.17
//   para 34; NFM Fig 3-4 p.3-12; T-6A Max Glide chart; SMM 13.5 paras 7-8); 4,500 ft breakout and the 140 KIAS climb
//   are TR-R34 and Patrick (6 Oct); 3,500 ft and 220 KIAS pattern height and speed, 2,500 ft go-around level and
//   runway heading 298 are TR-R4; the runway is 1,880 ft in the sim. Margins from the shared table (docs/TESTING.md)
//   unless the line says why; each run has a safety stop with its reason beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { THRESHOLD_29L, RUNWAY_29L_HDG_DEG } from '../../../src/modules/traffic/airfield.js';
import { wrapDeg180 } from '../../../src/core/angles.js';
import { TOLERANCES } from '../../helpers/tolerances.js';

const SETUP = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));
const KT = TOLERANCES.AIRSPEED_KT, FT = TOLERANCES.ALTITUDE_FT, DEG = TOLERANCES.ANGLE_DEG;
const RUNWAY_FT = 1880; // the runway's height in the sim (moose-jaw.json PAT1 point 1)
const PATTERN_FT = 3500, PATTERN_KT = 220, HIGH_KEY_FT = 5000, BREAKOUT_FT = 4500, BREAKOUT_CLIMB_KT = 140, GLIDE_CLEAN_KT = 125;
// A PFL lands within 5 minutes (docs/TESTING.md T2's own example); the circuit commands get 10 minutes, far above
// the 2 to 4 minutes any of them takes, so only an aircraft that is stuck or lost reaches it.
const PFL_STOP_SEC = 300, CIRCUIT_STOP_SEC = 600;

/** One CT-156 alone on Pattern 1 at `startPoint` (counted from 1, as on screen), calm air. */
function aloneAt(startPoint) {
  const sim = createSim({ ...SETUP, aircraft: [] }, { seed: 1 });
  const id = sim.spawn({ id: 'A1', routeId: 'PAT1', startPoint });
  return { sim, id, now: () => sim.state().aircraft.find((a) => a.id === id) };
}

/** Flies on in 0.5 s steps, calling `each(a)` every step, until `done(a)` is true or `stopSec` is reached. */
function flyUntil({ sim, now }, done, stopSec, each = () => {}) {
  let a = now();
  while (sim.t < stopSec && !done(a)) {
    sim.stepTo(sim.t + 0.5);
    a = now();
    each(a);
  }
  return a;
}

/** Follows a PFL until it ends: power back on after the touch-and-go, an ejection or a landing. */
function flyPfl(run) {
  let top = run.now(), lowest = Infinity;
  const end = flyUntil(run, (a) => !a.engineFailed || a.status !== 'flying', PFL_STOP_SEC, (a) => {
    if (a.engineFailed && a.alt > top.alt) top = a;
    lowest = Math.min(lowest, a.alt);
  });
  return { top, lowest, end };
}

/** On the runway, or ejected because it couldn't make it (TR-R14: a PFL that makes the runway flies a touch-and-go). */
function assertPflEnded({ end, lowest }, label) {
  assert.ok(!end.engineFailed || end.status !== 'flying', `${label}: the PFL ends within 5 minutes`);
  if (end.status === 'ejected') return;
  assert.equal(end.status, 'flying', `${label}: still flying after the touch-and-go`);
  assert.ok(lowest <= RUNWAY_FT + FT, `${label}: came down to the runway (lowest ${lowest.toFixed(0)} ft)`);
  assert.equal(end.routeId, 'PAT1', `${label}: back in the circuit`);
}

// Engine failure (spec 4.5 item 5): above 150 KIAS the aircraft zooms first, then glides. Start: on the initial at
// 3,500 ft and 220 KIAS (Pattern 1 point 9), so it has the height to zoom before the glide (TR-53 ejects at once
// below Low Key height, so a start on the climb-out would not show the zoom).
test('engine failure on the initial at 220 KIAS zooms first, then glides to the runway or ejects', () => {
  const run = aloneAt(9);
  const start = run.now();
  assert.ok(Math.abs(start.alt - PATTERN_FT) <= FT && Math.abs(start.kt - PATTERN_KT) <= KT, `starts on the initial at 3,500 ft and 220 KIAS (${start.alt.toFixed(0)} ft, ${start.kt.toFixed(0)} kt)`);
  assert.equal(run.sim.command(run.id, 'engine_fail'), true);
  const pfl = flyPfl(run);
  assert.ok(pfl.top.alt > start.alt + FT, `the zoom climbs: top ${pfl.top.alt.toFixed(0)} ft from ${start.alt.toFixed(0)} ft`);
  assert.ok(pfl.top.kt < start.kt - KT, `the zoom trades speed for the height: ${pfl.top.kt.toFixed(0)} kt at the top`);
  assert.ok(pfl.lowest < pfl.top.alt - FT, 'then it glides down');
  assertPflEnded(pfl, 'engine failure at 220 KIAS');
});

// At or below 150 KIAS it holds height while it slows to the 125 KIAS glide, then glides (spec 4.5 item 5).
// Start: the break exit on the inner downwind, 3,500 ft and 140 KIAS (Pattern 1 point 11).
test('engine failure at 140 KIAS holds height while it slows to glide speed, then glides to the runway or ejects', () => {
  const run = aloneAt(11);
  const start = run.now();
  assert.ok(start.kt <= 150, `starts at or below 150 KIAS (${start.kt.toFixed(0)} kt)`);
  assert.equal(run.sim.command(run.id, 'engine_fail'), true);
  let widest = 0;
  const slowed = flyUntil(run, (a) => a.kt <= GLIDE_CLEAN_KT || !a.engineFailed, PFL_STOP_SEC, (a) => {
    widest = Math.max(widest, Math.abs(a.alt - start.alt));
  });
  assert.ok(slowed.engineFailed && slowed.kt <= GLIDE_CLEAN_KT, 'slows to the glide speed');
  assert.ok(widest <= FT, `holds height while it slows (off by up to ${widest.toFixed(0)} ft)`);
  const pfl = flyPfl(run);
  assert.ok(pfl.lowest < start.alt - FT, `then glides down (lowest ${pfl.lowest.toFixed(0)} ft)`);
  assertPflEnded(pfl, 'engine failure at 140 KIAS');
});

// Start: on the climb-out after take-off, once 200 ft up (Pattern 1 point 1, the threshold). The breakout climbs at
// the 140 KIAS climb (Patrick, 6 Oct) to 4,500 ft (TR-R34), and is at the 220 KIAS pattern speed when it turns back.
test('a breakout on the climb-out climbs at about 140 KIAS to 4,500 ft and is back at 220 KIAS when it turns back', () => {
  const run = aloneAt(1);
  flyUntil(run, (a) => a.alt >= RUNWAY_FT + 200, CIRCUIT_STOP_SEC);
  const start = run.now();
  assert.equal(run.sim.command(run.id, 'breakout'), true);
  let slowest = Infinity, lowest = Infinity;
  const turnBack = flyUntil(run, (a) => a.phase !== 'breakout', CIRCUIT_STOP_SEC, (a) => {
    if (a.phase !== 'breakout') return;
    slowest = Math.min(slowest, a.kt);
    lowest = Math.min(lowest, a.alt);
  });
  assert.equal(turnBack.phase, 'rejoin', 'it turns back to rejoin');
  assert.ok(Math.abs(turnBack.alt - BREAKOUT_FT) <= FT, `about 4,500 ft when it turns back (${turnBack.alt.toFixed(0)} ft)`);
  assert.ok(Math.abs(turnBack.kt - PATTERN_KT) <= KT, `back at 220 KIAS when it turns back (${turnBack.kt.toFixed(0)} kt)`);
  assert.ok(slowest >= BREAKOUT_CLIMB_KT - KT, `never slower than the 140 KIAS climb (${slowest.toFixed(0)} kt)`);
  assert.ok(lowest >= start.alt - FT, `never comes down during the breakout (lowest ${lowest.toFixed(0)} ft)`);
});

// Start: on final at the window (Pattern 1 point 13). A go-around climbs away on runway heading, levels at 2,500 ft
// until past the upwind end, then climbs on under full power and turns crosswind (Patrick, 09:14Z; his card 10:15Z).
test('a go-around from the window climbs away on runway heading, speeds up under full power and turns crosswind', () => {
  const run = aloneAt(13);
  const start = run.now();
  assert.equal(run.sim.command(run.id, 'go_around'), true);
  assert.equal(run.now().phase, 'go_around');
  let highest = 0, fastest = 0, lowest = Infinity, offHeading = 0;
  const end = flyUntil(run, (a) => a.phase === 'crosswind', CIRCUIT_STOP_SEC, (a) => {
    highest = Math.max(highest, a.alt);
    fastest = Math.max(fastest, a.kt);
    lowest = Math.min(lowest, a.alt);
    if (a.phase !== 'crosswind') offHeading = Math.max(offHeading, Math.abs(wrapDeg180(a.headingDeg - RUNWAY_29L_HDG_DEG)));
  });
  assert.equal(end.phase, 'crosswind', 'turns crosswind');
  assert.ok(lowest >= start.alt - FT, `never comes down towards the runway (lowest ${lowest.toFixed(0)} ft)`);
  assert.ok(offHeading <= DEG, `holds runway heading until the crosswind turn (off by up to ${offHeading.toFixed(1)}°)`);
  assert.ok(highest > 2500, `climbs past 2,500 ft (${highest.toFixed(0)} ft)`);
  assert.ok(fastest > start.kt + KT, `speeds up under full power (${fastest.toFixed(0)} kt from ${start.kt.toFixed(0)} kt)`);
});

// Start: the break exit on the inner downwind (Pattern 1 point 11). After 4,500 ft and the turn back the breakout
// rejoins at pattern height (TR-R34), so on the way back it never comes down below pattern height into the circuit.
test('a breakout from the downwind turns back at 4,500 ft and rejoins without coming down below pattern height', () => {
  const run = aloneAt(11);
  assert.equal(run.sim.command(run.id, 'breakout'), true);
  const turnBack = flyUntil(run, (a) => a.phase !== 'breakout', CIRCUIT_STOP_SEC);
  assert.equal(turnBack.phase, 'rejoin', 'turns back to rejoin');
  assert.ok(Math.abs(turnBack.alt - BREAKOUT_FT) <= FT, `about 4,500 ft when it turns back (${turnBack.alt.toFixed(0)} ft)`);
  let lowest = Infinity;
  const handOver = flyUntil(run, (a) => a.command !== 'breakout', CIRCUIT_STOP_SEC, (a) => { lowest = Math.min(lowest, a.alt); });
  assert.equal(handOver.command, null, 'the breakout ends: it hands over to the entry, not round and round');
  assert.ok(lowest >= PATTERN_FT - FT, `never below pattern height on the way back (lowest ${lowest.toFixed(0)} ft)`);
});

// The PFL button (spec 4.5). Start: on the initial at 220 KIAS (Pattern 1 point 9). After the zoom it glides clean at
// 125 KIAS (TR-R14; T-6A Max Glide chart).
test('the PFL button on the initial zooms, then glides clean at about 125 KIAS', () => {
  const run = aloneAt(9);
  assert.equal(run.sim.command(run.id, 'pfl_current'), true);
  assert.equal(run.now().engineFailed, true, 'the engine is out');
  let zoomed = false, slowest = Infinity, fastest = 0;
  flyUntil(run, (a) => !a.engineFailed || a.config !== 'Clean', PFL_STOP_SEC, (a) => {
    if (a.phase === 'pfl_zoom') { zoomed = true; return; }
    if (!zoomed || a.config !== 'Clean') return;
    slowest = Math.min(slowest, a.kt);
    fastest = Math.max(fastest, a.kt);
  });
  assert.ok(zoomed, 'it zooms first');
  assert.ok(fastest > 0, 'it glides clean after the zoom');
  assert.ok(slowest >= GLIDE_CLEAN_KT - KT && fastest <= GLIDE_CLEAN_KT + KT, `clean glide ${slowest.toFixed(0)} to ${fastest.toFixed(0)} KIAS`);
});

// High Key (TR-R31): from the circuit it climbs under power to High Key, 5,000 ft over the threshold (TR-R14), and
// the engine is cut there. Start: the break exit on the inner downwind (Pattern 1 point 11). "Over the threshold":
// within 500 ft of it, an estimate of how close a pilot judges "over the numbers" from 3,000 ft above.
test('High Key climbs under power to about 5,000 ft and cuts the engine over the threshold on runway heading', () => {
  const run = aloneAt(11);
  assert.equal(run.sim.command(run.id, 'climb_high_key'), true);
  let highest = 0;
  const cut = flyUntil(run, (a) => a.engineFailed, CIRCUIT_STOP_SEC, (a) => { if (!a.engineFailed) highest = Math.max(highest, a.alt); });
  assert.ok(cut.engineFailed, 'the engine is cut at High Key');
  assert.ok(Math.abs(cut.alt - HIGH_KEY_FT) <= FT, `about 5,000 ft at High Key (${cut.alt.toFixed(0)} ft)`);
  assert.ok(highest <= HIGH_KEY_FT + FT, `never climbs past High Key (${highest.toFixed(0)} ft)`);
  const fromThreshold = Math.hypot(cut.x - THRESHOLD_29L.x, cut.y - THRESHOLD_29L.y);
  assert.ok(fromThreshold <= 500, `over the threshold (${fromThreshold.toFixed(0)} ft from it)`);
  assert.ok(Math.abs(wrapDeg180(cut.headingDeg - RUNWAY_29L_HDG_DEG)) <= DEG, `on runway heading (${cut.headingDeg.toFixed(0)}°)`);
});

// Start: the departure end (Pattern 1 point 2), which starts a closed pattern (TR-R33). It climbs, rolls out on the
// downwind and goes on to the final turn: it does not circle in the closed pattern.
test('a closed pattern from the departure end climbs, rolls out on the downwind and goes on to the final turn', () => {
  const run = aloneAt(2);
  const start = run.now();
  assert.equal(start.phase, 'closed_pattern', 'starts in the closed pattern');
  assert.ok(Math.abs(wrapDeg180(start.headingDeg - RUNWAY_29L_HDG_DEG)) <= DEG, `on runway heading (${start.headingDeg.toFixed(0)}°)`);
  let lowest = Infinity, leftClosed = false;
  const end = flyUntil(run, (a) => a.phase === 'final_turn', CIRCUIT_STOP_SEC, (a) => {
    lowest = Math.min(lowest, a.alt);
    if (a.phase !== 'closed_pattern') leftClosed = true;
  });
  assert.ok(leftClosed, 'leaves the closed pattern');
  assert.equal(end.phase, 'final_turn', 'goes on to the final turn');
  assert.ok(lowest >= start.alt - FT, `climbs, never comes down (lowest ${lowest.toFixed(0)} ft)`);
});

// High Key (TR-R31) is flown on the planned path under power; after the cut the PFL makes the runway and flies a
// touch-and-go back into the circuit (spec 4.5 item 13; Patrick, 4 Oct 08:40Z). Start: as above.
test('High Key keeps the engine on along the planned climb, then the PFL flies a touch-and-go back into the circuit', () => {
  const run = aloneAt(11);
  assert.equal(run.sim.command(run.id, 'climb_high_key'), true);
  const a0 = run.now();
  assert.equal(a0.mode, 'RAIL', 'flies the planned path');
  assert.ok(a0.highKeyFlight, 'flies the planned climb to High Key');
  let poweredOffPath = false;
  const cut = flyUntil(run, (a) => a.engineFailed, CIRCUIT_STOP_SEC, (a) => { if (!a.engineFailed && a.mode !== 'RAIL') poweredOffPath = true; });
  assert.ok(cut.engineFailed, 'the engine is cut at High Key');
  assert.equal(poweredOffPath, false, 'the engine stays on along the planned climb');
  assert.equal(cut.tag, 'high_key', 'the cut is at High Key');
  assertPflEnded(flyPfl(run), 'High Key');
});
