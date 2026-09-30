// Golden test (R9): whole Turn Sim runs. V6's own code (setupTurnStartsFor,
// moveAircraftList, stepSim, recordHist, the first Play and the next leg, all
// cut out of original/shell.html) is stepped at 0.05 s next to the port in
// src/modules/turn-sim/engine/, and every step's positions, headings and
// history row are compared, exact, no tolerance. Timing is the time delay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { V6_DEFAULTS, aircraftKey } from '../../src/modules/turn-sim/settings.js';
import { createRun } from '../../src/modules/turn-sim/engine/run.js';
import { createV6Page, v6SettingsForD42, v6SettingsForD48 } from './turn-sim-fake-page.js';
import { seeded } from './inputs.js';

const TURN_DEG = { delayed90away: 90, delayed45away: 45, hook90: 90, cross180: 180, inplace90: 90 }; // the shackle is no longer V6's: SMM 16.19 paras 61-62
const DIRECTIONS = ['right', 'left'];

/** V6's Turn menu also sets Turn degrees (updateManeuverDefaults, line 2037), so a scenario does too. */
// Q47 has the check wait for #3 and #4's turns; V6 did not, so V6's runs are flown with it off.
const scenario = (over) => ({ ...V6_DEFAULTS, rearCheckAfterTurns: false, ...over, turnDeg: over.turnDeg ?? TURN_DEG[over.maneuver ?? V6_DEFAULTS.maneuver] });

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
function compareRun(settings, label, { legs = 1, v6From = settings } = {}) {
  // D41 swapped "toward" and "away" back to what they say, so V6 is given the swapped names to fly the same turn.
  // D42 measures Wide and Tight from Lead on either side; V6 gets them swapped where its fixed direction differs.
  const v6Settings = v6SettingsForD42(v6SettingsForD48(v6From));
  for (const id of [1, 2, 3, 4]) {
    const key = aircraftKey(id, 'turnLogic');
    v6Settings[key] = { toward: 'away', away: 'toward' }[v6From[key]] ?? v6From[key];
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
  // The Clock tolerance box is read as V6 meant to (it read the box itself and got 4 whatever it said, issue #32).
  const page = createV6Page(v6Settings, { readsClockTolerance: true });
  page.reset();
  page.play();
  const run = createRun(settings);
  let steps = compareLeg(page, run, `${label} leg 1`, autoStep);
  for (let leg = 2; leg <= legs; leg++) {
    page.continueLeg();
    // The port clears the rear element check on every new leg; V6 did it only on Reset, so V6 is cleared here too.
    page.aircraft().forEach((a) => page.v6.resetRearCheckState(a));
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

test('hook, in-place 90 and cross turn × every preset × right and left, at V6\'s defaults', () => {
  let n = 0;
  for (const formation of ['weighted', 'weightedReverse', 'offsetBox', 'twoShip']) {
    for (const maneuver of ['hook90', 'inplace90', 'cross180']) {
      for (const direction of DIRECTIONS) {
        compareRun(scenario({ formation, maneuver, direction }), `${formation} ${maneuver} ${direction}`, { legs: 2 });
        n++;
      }
    }
  }
  assert.equal(n, 24);
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
    const formation = pick(['weighted', 'weightedReverse', 'twoShip', 'offsetBox']);
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
      correction: pick(['none', 'none', 'lag', 'lead', 'gfix']),
      correctionStrength: round(2 * r(), 2),
      offsetBox4Timing: pick(['late', 'early']),
      rearCheckOn: pick([false, true]),
      rearCheckStartSec: pick([0, 10, 40, round(60 * r(), 1)]),
      rearCheckDir: pick(DIRECTIONS),
      rearCheckAngleDeg: pick([20, Math.round(1 + 89 * r())]),
      rearCheckHoldSec: pick([0, 5, round(15 * r(), 1)]),
    });
    // V6 gives NaN below 1 G after the correction (D74 changes that later); keep the seeds above it.
    if (s.correction === 'gfix') s.baseG = Math.max(s.baseG, 3);
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
  for (const maneuver of ['hook90', 'inplace90', 'cross180']) {
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
  for (const maneuver of ['hook90', 'inplace90', 'cross180']) compareRun(scenario({ timing: 'clock', maneuver }), `clock ${maneuver}`);
});

test('clock cue with seeded numbers, per-aircraft clock positions and targets, delay errors, and the Clock tolerance setting', () => {
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

test('V6 as shipped ignores the Clock tolerance box (issue #32); read as V6 meant, a wider tolerance starts the turn earlier', () => {
  const start = (clockCueTolDeg, options) => {
    const page = createV6Page(scenario({ timing: 'clock', direction: 'left', clockCueTolDeg }), options);
    page.reset();
    page.play();
    while (page.time() < 90) {
      page.step();
      if (page.aircraft().find((a) => a.id === 3).active) return page.time();
    }
    return null;
  };
  assert.equal(start(30), start(4), 'V6 as shipped: the box does nothing');
  assert.ok(start(30, { readsClockTolerance: true }) < start(4, { readsClockTolerance: true }));
});

test('Q45, Manual targets: when each aircraft is told to watch the aircraft just outside it, the flight is V6\'s Outside-in flight', () => {
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
    for (const maneuver of ['delayed90away', 'delayed45away']) {
      for (const direction of DIRECTIONS) {
        const v6Settings = scenario({ formation, maneuver, direction, timing: 'clock', clockCuePos: 6.5 });
        const probe = createV6Page(v6Settings);
        probe.reset();
        const order = probe.v6.clockCascadeOrder(probe.aircraft()).map((a) => a.id); // V6's own cascade, outside first
        const manual = { ...v6Settings, clockCueSequence: 'manual' };
        order.forEach((id, i) => { manual[aircraftKey(id, 'clockTarget')] = String(i === 0 ? id : order[i - 1]); });
        compareRun(manual, `manual ${formation} ${maneuver} ${direction}`, { v6From: v6Settings });
      }
    }
  }
});

test('SMM item 2, Auto: the flight is V6\'s clock cue flown at 7 o\'clock in a right turn and 5 o\'clock in a left turn', () => {
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
    for (const maneuver of ['delayed90away', 'delayed45away']) {
      for (const direction of DIRECTIONS) {
        const auto = scenario({ formation, maneuver, direction, timing: 'clock', clockCuePos: 'auto' });
        const v6 = { ...auto, clockCuePos: direction === 'right' ? '7' : '5' };
        compareRun(auto, `clock auto ${formation} ${maneuver} ${direction}`, { v6From: v6, legs: 2 });
      }
    }
  }
});

test('Correction model "G fix": the wingman\'s G is nudged toward its slot, up to 0.8 G either way, exactly as V6 does', () => {
  // Big position errors, so the distance to Lead is well off its slot and the 0.8 G limit is reached.
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) {
    for (const [lateralDir, foreAftDir] of [['wide', 'aft'], ['tight', 'fore'], ['wide', 'fore']]) {
      for (const correctionStrength of [0.5, 2]) {
        const s = scenario({ formation, correction: 'gfix', correctionStrength, baseG: 3.5, direction: correctionStrength > 1 ? 'left' : 'right' });
        for (const id of [2, 3, 4]) Object.assign(s, {
          [aircraftKey(id, 'positionErrorOn')]: true,
          [aircraftKey(id, 'lateralDir')]: lateralDir, [aircraftKey(id, 'lateralFt')]: 3000,
          [aircraftKey(id, 'foreAftDir')]: foreAftDir, [aircraftKey(id, 'foreAftFt')]: 2500,
        });
        compareRun(s, `gfix ${formation} ${lateralDir} ${foreAftDir} ${correctionStrength}`, { legs: 2 });
      }
    }
  }
});

test('offset box × delayed 90 and 45 × right and left × #4 LATE and EARLY × rear check off and on, two legs (V6\'s solved delays and its check)', () => {
  let n = 0;
  for (const maneuver of ['delayed90away', 'delayed45away']) {
    for (const direction of DIRECTIONS) {
      for (const offsetBox4Timing of ['late', 'early']) {
        for (const rearCheckOn of [false, true]) {
          const steps = compareRun(scenario({ formation: 'offsetBox', maneuver, direction, offsetBox4Timing, rearCheckOn }), `box ${maneuver} ${direction} ${offsetBox4Timing} check ${rearCheckOn}`, { legs: 2 });
          assert.ok(steps > 3000);
          n++;
        }
      }
    }
  }
  assert.equal(n, 16);
});

test('the rear check: every direction, angle, start and hold, in the offset box only, with the turns that start at once', () => {
  for (const rearCheckDir of DIRECTIONS) {
    for (const [rearCheckAngleDeg, rearCheckStartSec, rearCheckHoldSec] of [[20, 40, 5], [1, 0, 0], [90, 5, 12.5], [45, 25, 3]]) {
      compareRun(scenario({ formation: 'offsetBox', maneuver: 'delayed90away', rearCheckOn: true, rearCheckDir, rearCheckAngleDeg, rearCheckStartSec, rearCheckHoldSec }), `check ${rearCheckDir} ${rearCheckAngleDeg}`);
    }
  }
  // In-place, hook, shackle and cross turns: #3 and #4 are taken over by the check too.
  for (const maneuver of ['hook90', 'inplace90', 'cross180']) {
    for (const rearCheckStartSec of [0, 40]) compareRun(scenario({ formation: 'offsetBox', maneuver, rearCheckOn: true, rearCheckStartSec }), `check ${maneuver} ${rearCheckStartSec}`, { legs: 2 });
  }
  // Only the offset box has the check.
  for (const formation of ['weighted', 'weightedReverse', 'twoShip']) compareRun(scenario({ formation, rearCheckOn: true, rearCheckStartSec: 5 }), `no check in ${formation}`);
});

test('D48: #2 on Lead\'s right flies as V6 flies the mirror layout, 4312 and 2134 × every turn × right and left, two legs, with position errors', () => {
  const r = seeded(0xd48);
  let n = 0;
  for (const formation of ['weighted', 'weightedReverse']) {
    for (const maneuver of Object.keys(TURN_DEG)) {
      for (const direction of DIRECTIONS) {
        const s = scenario({ formation, maneuver, direction, twoSide: 'right', durationSec: 75 });
        if (n % 2) {
          for (const id of [2, 3, 4]) {
            s[aircraftKey(id, 'positionErrorOn')] = true;
            s[aircraftKey(id, 'lateralDir')] = ['tight', 'wide'][Math.floor(2 * r())];
            s[aircraftKey(id, 'lateralFt')] = Math.round(1500 * r());
          }
        }
        compareRun(s, `right side ${formation} ${maneuver} ${direction}`, { legs: 2 });
        n++;
      }
    }
  }
  assert.equal(n, 20);
});

test('V6 itself: the rear check runs in leg 1 and never again in leg 2 (it clears the check only on Reset)', () => {
  const settings = scenario({ formation: 'offsetBox', maneuver: 'inplace90', rearCheckOn: true, rearCheckStartSec: 10, rearCheckHoldSec: 2, durationSec: 60 });
  const page = createV6Page(settings);
  page.reset();
  page.play();
  const legHeadings = () => {
    const out = [];
    while (page.time() < 60) { page.step(); out.push(page.aircraft().map((a) => a.hdg)); }
    return out;
  };
  const first = legHeadings();
  assert.ok(page.aircraft().every((a) => a.rearCheckComplete === (a.id === 3 || a.id === 4)), 'the check completed in leg 1');
  page.continueLeg();
  const second = legHeadings();
  // Leg 2 is an in-place turn from the leg 1 heading: #3 turns 90 degrees at once and only that, no 20 degree swing first.
  const start = first[first.length - 1][2];
  assert.ok(second.every((h) => Math.abs(h[2] - start) <= Math.PI / 2 + 1e-3), 'no swing beyond the planned turn');
  assert.ok(second[0][2] !== start && Math.abs(second[0][2] - start) < 0.1, 'the planned turn starts on the first step');
});
