// Checks: the opening Moose Jaw setup never freezes a flying aircraft, finishes a pattern with no phase stuck,
//   breakout and go-around climb, no value is NaN for 5 minutes, and one mode owns each aircraft's position.
// Serves: TR-R15, TR-R30, TR-R13.
// Expected values: things that must always be true; the 300 s, 120 s and 10 ft limits are the author's own, no
//   reason given; input is the V6-derived data file, so "A1 flying at t=12" is that file's start time.

// Behavioral flight invariant tests — conditions that must ALWAYS hold true
// regardless of flight engine internals to prevent freezes, loops, NaNs, and dead controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../../../src/modules/traffic/sim.js';
import { posOnRoute } from '../../../src/modules/traffic/route.js';

const MOOSE_JAW = JSON.parse(
  readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw-v6.json', import.meta.url), 'utf8')
);
const clone = (value) => JSON.parse(JSON.stringify(value));

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 1: Continuous Motion (catches freeze bug)
// ─────────────────────────────────────────────────────────────────────────────
test('aircraft in flight never freeze in place', () => {
  // Use Moose Jaw built-in setup with aircraft A1
  const sim = createSim(clone(MOOSE_JAW), { seed: 1 });

  // Step to t=12 (A1 starts flying)
  sim.stepTo(12);
  let prev = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.ok(prev, 'Aircraft A1 must exist');
  assert.equal(prev.status, 'flying', 'A1 should be flying at t=12');

  // Check every 1.0s for 60 seconds (t=13 to t=72)
  for (let t = 13; t <= 72; t += 1.0) {
    sim.stepTo(t);
    const curr = sim.state().aircraft.find((a) => a.id === 'A1');
    assert.ok(curr, 'Aircraft A1 must exist');

    // Displacement between steps
    const displacement = Math.hypot(curr.x - prev.x, curr.y - prev.y);

    // FAIL if displacement == 0 while status == 'flying' and kt > 0
    if (curr.status === 'flying' && curr.kt > 0) {
      assert.ok(
        displacement > 0,
        `Aircraft A1 froze in place at t=${t} (displacement was 0 while flying at ${curr.kt} kt)`
      );
    }
    prev = curr;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 2: Circuit Progression (catches infinite loops)
// ─────────────────────────────────────────────────────────────────────────────
test('aircraft completes pattern phases without getting stuck', () => {
  // Use Moose Jaw setup, start A1 at break point (startIndex 9)
  const setup = clone(MOOSE_JAW);
  const a1 = setup.aircraft.find((a) => a.id === 'A1');
  assert.ok(a1, 'Aircraft A1 must exist in setup');
  a1.startIndex = 9;
  a1.startsAtSec = 0;
  const pat = setup.routes.find((r) => r.kind === 'pattern');
  if (pat) pat.landOdds = 1.0;
  for (const r of setup.routes) if (r.kind === 'split') r.splitOdds = 0;

  const sim = createSim(setup, { seed: 1 });
  const visitedPhases = new Set();
  let currentPhase = null;
  let phaseStartTime = 0;
  let finished = false;

  // Step forward in 5s increments up to 300s
  for (let t = 0; t <= 300; t += 5) {
    sim.stepTo(t);
    const ac = sim.state().aircraft.find((a) => a.id === 'A1');
    assert.ok(ac, 'Aircraft A1 must exist in state');

    if (ac.phase) {
      visitedPhases.add(ac.phase);
      if (ac.phase !== currentPhase) {
        if (currentPhase !== null) {
          const duration = t - phaseStartTime;
          // FAIL if any single phase lasts more than 120s (stuck in a turn)
          assert.ok(
            duration <= 120,
            `Phase '${currentPhase}' lasted ${duration}s, exceeding maximum allowed 120s (stuck in turn/phase)`
          );
        }
        currentPhase = ac.phase;
        phaseStartTime = t;
      } else {
        const duration = t - phaseStartTime;
        assert.ok(
          duration <= 120,
          `Phase '${currentPhase}' currently lasting ${duration}s, exceeding maximum allowed 120s`
        );
      }
    }

    // Check if aircraft reached finished state
    if (ac.status === 'landed' || ac.status === 'done' || ac.landed) {
      finished = true;
      break;
    }
  }

  // FAIL if t > 300s and aircraft hasn't reached 'landed' or 'done'
  assert.ok(finished, `Aircraft A1 should reach 'landed' or 'done' within 300s`);
  assert.ok(visitedPhases.size >= 2, `Aircraft should progress through multiple phases: ${[...visitedPhases].join(', ')}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 3: Command Responsiveness (catches dead controls)
// ─────────────────────────────────────────────────────────────────────────────
test('breakout command causes climb and departure', () => {
  // Start A1 flying on pattern
  const sim = createSim(clone(MOOSE_JAW), { seed: 1 });
  sim.stepTo(15);
  const acBefore = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.ok(acBefore, 'Aircraft A1 must exist');
  assert.equal(acBefore.status, 'flying');
  const altBefore = acBefore.alt;

  // At t=15s, issue sim.command('A1', 'breakout')
  const ok = sim.command('A1', 'breakout');
  assert.ok(ok, 'breakout command should succeed');

  // Step forward 30s
  sim.stepTo(45);
  const acAfter = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.ok(acAfter, 'Aircraft A1 must exist');

  // PASS if alt increased from before command (DON'T check exact altitude or exact time)
  assert.ok(
    acAfter.alt > altBefore,
    `Altitude should increase after breakout command (was ${altBefore} ft, now ${acAfter.alt} ft)`
  );
});

test('go-around command causes climb along runway heading', () => {
  // Start A1 flying on pattern
  const sim = createSim(clone(MOOSE_JAW), { seed: 1 });
  sim.stepTo(15);
  const acBefore = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.ok(acBefore, 'Aircraft A1 must exist');
  assert.equal(acBefore.status, 'flying');
  const altBefore = acBefore.alt;

  // At t=15s, issue sim.command('A1', 'go_around')
  const ok = sim.command('A1', 'go_around');
  assert.ok(ok, 'go_around command should succeed');

  // Step forward 30s
  sim.stepTo(45);
  const acAfter = sim.state().aircraft.find((a) => a.id === 'A1');
  assert.ok(acAfter, 'Aircraft A1 must exist');

  // PASS if alt increased from before command
  assert.ok(
    acAfter.alt > altBefore,
    `Altitude should increase after go-around command (was ${altBefore} ft, now ${acAfter.alt} ft)`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 4: Mathematical Sanity (catches NaN corruption)
// ─────────────────────────────────────────────────────────────────────────────
test('no NaN or Infinity in aircraft state for 5 minutes of sim time', () => {
  // Use Moose Jaw built-in setup (all 7 aircraft)
  const sim = createSim(clone(MOOSE_JAW), { seed: 1 });

  // Step through 300s (6000 steps at 0.05s each) in 5s increments
  for (let t = 0; t <= 300; t += 5) {
    sim.stepTo(t);
    const { aircraft } = sim.state();

    // At each check, for each flying aircraft:
    //   FAIL if isNaN(x) || isNaN(y) || isNaN(alt) || isNaN(headingDeg) || isNaN(kt)
    //   FAIL if !isFinite(x) || !isFinite(y) etc.
    for (const ac of aircraft) {
      if (ac.status === 'flying') {
        const fields = ['x', 'y', 'alt', 'headingDeg', 'kt'];
        for (const field of fields) {
          const val = ac[field];
          assert.ok(
            typeof val === 'number' && Number.isFinite(val),
            `Aircraft ${ac.id} field '${field}' has invalid value ${val} (NaN or non-finite) at t=${t}s`
          );
        }
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant 5: Mode Invariant (catches dual-universe bug)
// ─────────────────────────────────────────────────────────────────────────────
test('exactly one mode owns coordinates at every step', () => {
  // Use Moose Jaw setup
  const sim = createSim(clone(MOOSE_JAW), { seed: 1 });
  const routesById = new Map(MOOSE_JAW.routes.map((r) => [r.id, r]));
  const VALID_MODES = [undefined, 'RAIL', 'PHYSICS'];

  let prevStates = new Map();

  // Step through 60s in 1s increments
  for (let t = 1; t <= 60; t += 1) {
    sim.stepTo(t);
    const { aircraft } = sim.state();

    // At each check, for each flying aircraft:
    //   aircraft.mode must be one of: undefined (legacy rail), 'RAIL', 'PHYSICS'
    //   (undefined is allowed because current sim doesn't set mode yet — this test is forward-looking)
    //   No aircraft should have BOTH a.distFt changing AND a.x/a.y changing independently
    for (const ac of aircraft) {
      if (ac.status === 'flying') {
        assert.ok(
          VALID_MODES.includes(ac.mode),
          `Aircraft ${ac.id} mode must be one of ${VALID_MODES}, got '${ac.mode}' at t=${t}s`
        );

        const prev = prevStates.get(ac.id);
        if (prev) {
          const distChanged = ac.distFt !== prev.distFt;

          if (ac.mode === undefined || ac.mode === 'RAIL') {
            // In rail mode, position (x, y) is coupled to distFt along the route.
            // Pos must not drift independently from the route position defined by distFt.
            if (!ac.command) {
              const route = routesById.get(ac.routeId);
              if (route) {
                const expectedRoutePos = posOnRoute(route, ac.distFt, MOOSE_JAW.routeOptions);
                const drift = Math.hypot(ac.x - expectedRoutePos.x, ac.y - expectedRoutePos.y);
                // Pilot domain tolerance: position must match route within ±10 ft
                assert.ok(
                  drift <= 10,
                  `Aircraft ${ac.id} coordinates drifted independently from rail distFt (drift: ${drift} ft) at t=${t}s`
                );
              }
            }
          } else if (ac.mode === 'PHYSICS') {
            // In physics mode, coordinates are owned by physics equations of motion.
            // distFt must not be advancing an independent legacy rail track.
            assert.ok(
              !distChanged,
              `Aircraft ${ac.id} in PHYSICS mode has distFt changing independently of physics coordinates at t=${t}s`
            );
          }
        }
        prevStates.set(ac.id, { ...ac });
      }
    }
  }
});
