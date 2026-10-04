// Removed from tests/unit/traffic/pfl.test.js on Patrick's word (4 Oct 2026 06:54Z: "Just delete those shitty
// tests"). It failed with gear down at 3,701 ft where it wanted clean above 3,700 ft MSL. Kept for the record,
// not run; its imports were in the original file.

// ── TEST 4: INVARIANTS (ZERO TELEPORTATION, FINITE TELEMETRY, CONFIG SCHEDULE) ──
test('Test 4: Verify zero coordinate teleportation (<25 ft/frame), finite numbers, and configuration sequence', () => {
  const sim = createTestSim({ windFromDeg: 360, windKt: 5 });
  const id = sim.spawnPflFromArea({ radialDeg: 180, distNm: 3, altFt: 6000 });

  let prevState = null;
  let maxFrameStepFt = 0;
  let maxAltDeltaFt = 0;
  const configHistory = [];

  for (let s = 0; s < 6000; s++) {
    sim.stepTo(sim.t + STEP_SEC);
    const ac = sim.state().aircraft.find((a) => a.id === id);
    if (!ac) break;

    // 1. All telemetry values must be strictly finite numbers
    assert.ok(Number.isFinite(ac.x), `x must be finite, got ${ac.x}`);
    assert.ok(Number.isFinite(ac.y), `y must be finite, got ${ac.y}`);
    assert.ok(Number.isFinite(ac.alt), `alt must be finite, got ${ac.alt}`);
    assert.ok(Number.isFinite(ac.kt), `kt must be finite, got ${ac.kt}`);
    assert.ok(Number.isFinite(ac.headingDeg), `headingDeg must be finite, got ${ac.headingDeg}`);
    assert.ok(Number.isFinite(ac.bankDeg), `bankDeg must be finite, got ${ac.bankDeg}`);

    // 2. Zero teleportation invariant check (<25 ft/frame)
    if (prevState && ac.active) {
      const stepDist = Math.hypot(ac.x - prevState.x, ac.y - prevState.y);
      if (stepDist > maxFrameStepFt) maxFrameStepFt = stepDist;
      assert.ok(
        stepDist < 25,
        `Step displacement must be <25 ft/frame (Invariant Guard D411), got ${stepDist.toFixed(2)} ft at step ${s}`
      );

      const altDelta = Math.abs(ac.alt - prevState.alt);
      if (altDelta > maxAltDeltaFt) maxAltDeltaFt = altDelta;
      assert.ok(
        altDelta < 25,
        `Altitude step must be <25 ft/frame, got ${altDelta.toFixed(2)} ft at step ${s}`
      );
    }

    // 3. Track configuration by altitude
    if (ac.config) {
      const cleanCfg = ac.config.toLowerCase();
      configHistory.push({ alt: ac.alt, config: cleanCfg });

      // Enforce SMM Ch 13 configuration gates
      if (ac.alt > 3700) {
        assert.equal(cleanCfg, 'clean', `Above 3,700 ft MSL config must be clean, got ${ac.config} at ${ac.alt} ft`);
      }
    }

    prevState = { ...ac };
    if (!ac.active) break;
  }

  assert.ok(maxFrameStepFt > 0, 'Simulation must have advanced');
  assert.ok(maxFrameStepFt < 25, `Max frame step was ${maxFrameStepFt.toFixed(2)} ft (< 25 ft invariant)`);

  // Verify that configuration transitioned through gear down and flaps as altitude lowered
  const hasGearOrFlaps = configHistory.some((c) => c.config.includes('gear') || c.config.includes('flaps'));
  assert.ok(hasGearOrFlaps, 'Configuration must schedule gear and flap deployments during recovery');
});
