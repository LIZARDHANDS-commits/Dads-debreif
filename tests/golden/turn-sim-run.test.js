// Golden test (R9): whole Turn Sim runs. V6's own code (setupTurnStartsFor,
// moveAircraftList, stepSim, recordHist, the first Play and the next leg, all
// cut out of original/shell.html) is stepped at 0.05 s next to the port in
// src/modules/turn-sim/engine/, and every step's positions, headings and
// history row are compared, exact, no tolerance. Timing is the time delay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, aircraftKey } from '../../src/modules/turn-sim/settings.js';
import { createRun } from '../../src/modules/turn-sim/engine/run.js';
import { createV6Page } from './turn-sim-fake-page.js';
import { seeded } from './inputs.js';

const TURN_DEG = { delayed90away: 90, delayed45away: 45, hook90: 90, shackle45: 45, cross180: 180, inplace90: 90 };
const DIRECTIONS = ['right', 'left'];

/** V6's Turn menu also sets Turn degrees (updateManeuverDefaults, line 2037), so a scenario does too. */
const scenario = (over) => ({ ...V6_DEFAULTS, ...over, turnDeg: over.turnDeg ?? TURN_DEG[over.maneuver ?? V6_DEFAULTS.maneuver] });

/**
 * The auto step in seconds, D44: spacing / speed x cot(half the turn angle), written out here from the spec
 * rather than taken from the port. V6's own step (spacing x angle / speed) was 25.4 s at the defaults.
 */
const autoStepFor = (settings, probe) => {
  const v = Math.max(1, probe.v6.speedfps());
  return (Math.abs(+settings.spacingFt || 6000) / v) / Math.tan(Math.abs((+settings.turnDeg || 90) * Math.PI / 180) / 2);
};

/** Steps V6 and the port together for one leg, comparing every step. Returns the number of steps. */
function compareLeg(page, run, label, autoStep) {
  const duration = +page.$('duration').value;
  let steps = 0;
  while (page.time() < duration) {
    page.step();
    assert.equal(run.step(), true, `${label}: the port stopped early at step ${steps}`);
    steps++;
    if (steps === 1) assert.equal(run.state.autoStepSec, autoStep, `${label}: the auto step is in state and not in Base delay`);
    const where = `${label}: step ${steps} t=${page.time()}`;
    assert.equal(run.state.tSec, page.time(), where);
    const v6 = page.aircraft();
    for (const a of run.state.aircraft) {
      const b = v6.find((x) => x.id === a.id);
      assert.deepEqual([a.xFt, a.yFt, a.headingRad, a.turning, a.done], [b.x, b.y, b.hdg, b.active, b.done], `${where} #${a.id}`);
    }
    const row = run.history()[run.history().length - 1];
    const h = page.history()[page.history().length - 1];
    assert.equal(row.tSec, h.t, where);
    assert.equal(row.pairs['1-2'], h.d12, where);
    assert.equal(row.minSepFt, h.min, where);
    assert.equal(row.closure13Ftps, h.closure, where);
    if (run.state.aircraft.length === 4) {
      assert.deepEqual([row.pairs['1-3'], row.pairs['1-4'], row.pairs['3-4']], [h.d13, h.d14, h.d34], where);
      const v = (i, j) => Math.hypot(v6[i].x - v6[j].x, v6[i].y - v6[j].y);
      assert.deepEqual([row.pairs['2-3'], row.pairs['2-4']], [v(1, 2), v(1, 3)], where);
    } else {
      // A two-ship has no 1-3, 1-4 or 3-4 (V6 says NaN); the port leaves them out, and closure is 0 as in V6.
      assert.deepEqual(Object.keys(row.pairs), ['1-2'], where);
      assert.ok(Number.isNaN(h.d13) && h.closure === 0, where);
    }
  }
  assert.equal(page.history().length, run.history().length, `${label}: history rows`);
  assert.equal(run.state.finished, true, label);
  assert.equal(run.step(), false, `${label}: a finished run does not step`);
  return steps;
}

/** V6 next to the port through a first leg and, when asked, a second one that continues from where the aircraft are. */
function compareRun(settings, label, { legs = 1 } = {}) {
  // D41 swapped "toward" and "away" back to what they say, so V6 is given the swapped names to fly the same turn.
  const v6Settings = { ...settings };
  for (const id of [1, 2, 3, 4]) {
    const key = aircraftKey(id, 'turnLogic');
    v6Settings[key] = { toward: 'away', away: 'toward' }[settings[key]] ?? settings[key];
  }
  // D43 and D44: with auto timing every aircraft starts at its own time, index x step, without waiting for Lead
  // (V6 waited), and the step is spacing / speed x cot(half the turn). That is exactly V6's TIME-delay flight
  // with that step as the Base delay, so V6 flies it that way here.
  let autoStep = null;
  if (settings.timing === 'auto' && /^delayed/.test(settings.maneuver)) {
    const probe = createV6Page(settings);
    probe.reset();
    autoStep = autoStepFor(settings, probe);
    Object.assign(v6Settings, { timing: 'time', baseDelaySec: autoStep });
  }
  const page = createV6Page(v6Settings);
  page.reset();
  page.play();
  const run = createRun(settings);
  let steps = compareLeg(page, run, `${label} leg 1`, autoStep);
  for (let leg = 2; leg <= legs; leg++) {
    page.continueLeg();
    assert.equal(run.state.canStartLeg, true, `${label}: the leg can be continued`);
    run.startLeg();
    assert.equal(run.state.tSec, 0, label);
    steps += compareLeg(page, run, `${label} leg ${leg}`, autoStep);
  }
  return steps;
}

test('4312, 2134 and two-ship × delayed 90 and 45 × right and left, at V6\'s defaults, two legs each', () => {
  let n = 0;
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
    for (const maneuver of ['delayed90away', 'delayed45away']) {
      for (const direction of DIRECTIONS) {
        const steps = compareRun(scenario({ formation, maneuver, direction }), `${formation} ${maneuver} ${direction}`, { legs: 2 });
        assert.ok(steps > 3000);
        n++;
      }
    }
  }
  assert.equal(n, 12);
});

test('hook, in-place 90, shackle and cross turn × every preset × right and left, at V6\'s defaults', () => {
  let n = 0;
  for (const formation of ['weighted', 'weightedReverse', 'offsetBox', 'twoShip']) {
    for (const maneuver of ['hook90', 'inplace90', 'shackle45', 'cross180']) {
      for (const direction of DIRECTIONS) {
        compareRun(scenario({ formation, maneuver, direction }), `${formation} ${maneuver} ${direction}`, { legs: 2 });
        n++;
      }
    }
  }
  assert.equal(n, 32);
});

test('time delay: a different base delay moves each start, and V6 and the port agree on the rollout', () => {
  for (const baseDelaySec of [0, 5, 8.5, 16, 25.4, 40]) {
    for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
      compareRun(scenario({ formation, baseDelaySec, direction: baseDelaySec > 20 ? 'left' : 'right' }), `${formation} delay ${baseDelaySec}`);
    }
  }
});

test('seeded settings: speed, G, spacing, heading, turn degrees, errors, turn logic and the lag and lead models', () => {
  const r = seeded(0x5ee1);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const round = (x, places) => Math.round(x * 10 ** places) / 10 ** places;
  for (let i = 0; i < 90; i++) {
    const maneuver = pick(Object.keys(TURN_DEG));
    // The offset box's delayed turns use V6's solved plan (task 11), which the port doesn't have yet.
    const formation = pick(/^delayed/.test(maneuver) ? ['weighted', 'weightedReverse', 'twoShip'] : ['weighted', 'weightedReverse', 'twoShip', 'offsetBox']);
    const s = scenario({
      formation,
      maneuver,
      direction: pick(DIRECTIONS),
      spacingFt: Math.round(2000 + 8000 * r()),
      boxAftFt: Math.round(3000 + 9000 * r()),
      boxStaggerFt: Math.round(2000 * r()),
      startHeadingDeg: pick([0, 90, 180, 270, round(360 * r(), 1), round(720 * r() - 360, 1)]),
      speedKt: Math.round(120 + 200 * r()),
      baseG: round(1.05 + 5 * r(), 2),
      baseDelaySec: round(30 * r(), 1),
      durationSec: pick([60, 75, 90]),
      turnDeg: pick([undefined, undefined, Math.round(20 + 160 * r())]),
      correction: pick(['none', 'none', 'lag', 'lead']),
      correctionStrength: round(2 * r(), 2),
    });
    for (const id of [1, 2, 3, 4]) {
      if (r() < 0.6) s[aircraftKey(id, 'delayErrSec')] = round(10 * r() - 5, 1);
      if (r() < 0.6) s[aircraftKey(id, 'gError')] = round(2 * r() - 1, 2);
      if (r() < 0.5) {
        s[aircraftKey(id, 'positionErrorOn')] = true;
        s[aircraftKey(id, 'lateralDir')] = pick(['none', 'tight', 'wide']);
        s[aircraftKey(id, 'lateralFt')] = Math.round(1500 * r());
        s[aircraftKey(id, 'foreAftDir')] = pick(['none', 'fore', 'aft']);
        s[aircraftKey(id, 'foreAftFt')] = Math.round(1500 * r());
      }
      if (r() < 0.5) s[aircraftKey(id, 'turnLogic')] = pick(['auto', 'selected', 'right', 'left', 'toward', 'away']);
      if (r() < 0.4) s[aircraftKey(id, 'clockTarget')] = pick(['1', '2', '3', '4']);
    }
    compareRun(s, `seeded ${i} ${formation} ${maneuver}`, { legs: i % 3 === 0 ? 2 : 1 });
  }
});

test('the two-ship run has no NaN anywhere: every pair, the minimum and the closure are numbers', () => {
  const run = createRun({ ...V6_DEFAULTS, formation: 'twoShip' });
  while (run.step());
  assert.equal(run.state.aircraft.length, 2);
  for (const row of run.history()) {
    assert.deepEqual(Object.keys(row.pairs), ['1-2']);
    for (const v of [...Object.values(row.pairs), row.minSepFt, row.closure13Ftps, row.tSec]) assert.ok(Number.isFinite(v));
  }
});

test('the closure over the real step is V6\'s: the change in the 1-3 distance over 0.05 s', () => {
  const run = createRun({ ...V6_DEFAULTS, formation: 'weighted' });
  while (run.step());
  const rows = run.history();
  assert.equal(rows[0].closure13Ftps, 0);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].closure13Ftps, (rows[i - 1].pairs['1-3'] - rows[i].pairs['1-3']) / 0.05);
  assert.ok(rows.some((row) => Math.abs(row.closure13Ftps) > 1), 'the aircraft do close on each other in a delayed turn');
});

test('auto timing after D43 and D44 (step = spacing / speed x cot(half the turn), no wait for Lead): 4312, 2134, two-ship × delayed 90 and 45 × right and left, two legs', () => {
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
    for (const maneuver of ['delayed90away', 'delayed45away']) {
      for (const direction of DIRECTIONS) {
        compareRun(scenario({ formation, maneuver, direction, timing: 'auto' }), `auto ${formation} ${maneuver} ${direction}`, { legs: 2 });
      }
    }
  }
});

test('auto timing with other turns (no effect) and seeded speed, spacing, G, turn degrees and errors', () => {
  const r = seeded(0xa070);
  const pick = (list) => list[Math.floor(r() * list.length)];
  for (const maneuver of ['hook90', 'inplace90', 'shackle45', 'cross180']) {
    compareRun(scenario({ maneuver, timing: 'auto' }), `auto ${maneuver}`);
  }
  for (let i = 0; i < 40; i++) {
    const s = scenario({
      formation: pick(['weighted', 'weightedReverse', 'twoShip']),
      maneuver: pick(['delayed90away', 'delayed45away']),
      direction: pick(DIRECTIONS),
      timing: 'auto',
      spacingFt: Math.round(2000 + 8000 * r()),
      speedKt: Math.round(120 + 200 * r()),
      baseG: Math.round((1.5 + 4 * r()) * 100) / 100,
      turnDeg: Math.round(20 + 160 * r()),
      durationSec: 90,
      startHeadingDeg: Math.round(360 * r()),
    });
    for (const id of [1, 2, 3, 4]) {
      if (r() < 0.5) s[aircraftKey(id, 'delayErrSec')] = Math.round((10 * r() - 5) * 10) / 10;
      if (r() < 0.3) s[aircraftKey(id, 'gError')] = Math.round((2 * r() - 1) * 100) / 100;
    }
    compareRun(s, `auto seeded ${i}`, { legs: i % 4 === 0 ? 2 : 1 });
  }
});

test('clock cue at V6\'s defaults (5:30, tolerance 4°, Outside-in): 4312, 2134, two-ship × delayed 90 and 45 × right and left, two legs', () => {
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
    for (const maneuver of ['delayed90away', 'delayed45away']) {
      for (const direction of DIRECTIONS) {
        compareRun(scenario({ formation, maneuver, direction, timing: 'clock' }), `clock ${formation} ${maneuver} ${direction}`, { legs: 2 });
      }
    }
  }
});

test('clock cue: every clock position, the offset box, and the other turns (which start at once, as V6 does)', () => {
  const positions = Array.from({ length: 24 }, (_, i) => (i === 0 ? 12 : i / 2));
  for (const clockCuePos of positions) {
    compareRun(scenario({ timing: 'clock', clockCuePos, direction: clockCuePos > 6 ? 'left' : 'right' }), `clock pos ${clockCuePos}`);
  }
  for (const direction of DIRECTIONS) compareRun(scenario({ timing: 'clock', formation: 'offsetBox', maneuver: 'inplace90', direction }), `clock offset box ${direction}`);
  for (const maneuver of ['hook90', 'inplace90', 'shackle45', 'cross180']) compareRun(scenario({ timing: 'clock', maneuver }), `clock ${maneuver}`);
});

test('clock cue with seeded numbers, per-aircraft clock positions and targets, delay errors, and a tolerance setting V6 ignores', () => {
  const r = seeded(0xc10c);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const positions = ['global', ...Array.from({ length: 24 }, (_, i) => String(i === 0 ? 12 : i / 2))];
  let triggered = 0;
  for (let i = 0; i < 60; i++) {
    const s = scenario({
      formation: pick(['weighted', 'weightedReverse', 'twoShip']),
      maneuver: pick(['delayed90away', 'delayed45away']),
      direction: pick(DIRECTIONS),
      timing: 'clock',
      clockCuePos: pick([3, 4.5, 5, 5.5, 6.5, 7, 8, 9, 10.5]),
      clockCueAircraft: pick([1, 2, 3, 4]),
      // V6 reads the box itself, not its value, so it always uses 4°: the port pins that until the tolerance commit.
      clockCueTolDeg: pick([4, 4, 1, 10, 25]),
      spacingFt: Math.round(3000 + 6000 * r()),
      speedKt: Math.round(150 + 150 * r()),
      baseG: Math.round((1.5 + 3 * r()) * 100) / 100,
      durationSec: 90,
      startHeadingDeg: Math.round(360 * r()),
    });
    for (const id of [1, 2, 3, 4]) {
      if (r() < 0.5) s[aircraftKey(id, 'clockPos')] = pick(positions);
      if (r() < 0.5) s[aircraftKey(id, 'clockTarget')] = pick(['global', '1', '2', '3', '4']);
      if (r() < 0.4) s[aircraftKey(id, 'delayErrSec')] = Math.round((10 * r() - 5) * 10) / 10;
      if (r() < 0.3) s[aircraftKey(id, 'turnLogic')] = pick(['selected', 'right', 'left', 'toward', 'away']);
      if (r() < 0.3) s[aircraftKey(id, 'gError')] = Math.round((2 * r() - 1) * 100) / 100;
    }
    const steps = compareRun(s, `clock seeded ${i}`, { legs: i % 4 === 0 ? 2 : 1 });
    if (steps > 0) triggered++;
  }
  assert.equal(triggered, 60);
});

test('the clock cue really is flown: in a left turn at 5:30 the outside aircraft starts at once and the rest follow in order', () => {
  const run = createRun(scenario({ timing: 'clock', direction: 'left', durationSec: 90 }));
  const first = {};
  while (run.step()) for (const a of run.state.aircraft) if (a.turning && first[a.id] === undefined) first[a.id] = run.state.tSec;
  // 4312 turning left: #4 is the outside aircraft, then #3, Lead and #2, each watching the one before it.
  assert.deepEqual(Object.entries(first).sort((x, y) => x[1] - y[1]).map(([id]) => +id), [4, 3, 1, 2], JSON.stringify(first));
  assert.ok(first[4] < 0.1, 'the first aircraft starts at once');
  assert.ok(first[3] > 1 && first[1] > first[3] && first[2] > first[1], JSON.stringify(first));
});
