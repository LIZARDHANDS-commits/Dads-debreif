// The Energy engine and the T-6A's Mach limit (core #211; SPEC-turn-fight, "Limits").
// Part 1 pins the engine at 17,000 ft and below, where the speed limit is still VMO and nothing may change.
// Part 2 is the new behaviour above about 17,600 ft, where the limit is Mach 0.67 (maxKiasT6A).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T6A_LIMITS, maxKiasT6A } from '../../../src/core/t6-performance.js';
import { createEnergyFight, stepEnergyFight } from '../../../src/modules/turn-fight/energy-sim.js';
import { FIGHT_STEP_SEC } from '../../../src/modules/turn-fight/sim.js';
import { trajectoryDigest, pinCases, PIN_STEPS } from './energy-pin.js';

// ── Part 1: nothing moves at 17,000 ft and below ─────────────────────────────

const pinned = JSON.parse(readFileSync(new URL('../../fixtures/turn-fight/energy-below-mmo.json', import.meta.url), 'utf8'));

test('the pin fixture is the fights the helper lists, all starting at 17,000 ft or lower', () => {
  const cases = pinCases();
  assert.equal(pinned.steps, PIN_STEPS);
  assert.deepEqual(pinned.cases.map((c) => c.name), cases.map((c) => c.name));
  assert.ok(cases.length >= 40);
  for (const c of cases) {
    const s = { blueAltFt: 10000, redAltFt: 10000, ...c.setup };
    assert.ok(s.blueAltFt <= 17000 && s.redAltFt <= 17000, `${c.name} starts at or under 17,000 ft`);
  }
  for (const name of ['the default fight', 'a 316 KIAS merge at 10,000 ft']) assert.ok(cases.some((c) => c.name === name), name);
  assert.ok(maxKiasT6A(17000) === T6A_LIMITS.vmoKias, 'the limit at 17,000 ft is still VMO');
});

// Every step of a ten-minute fight, every number, must be what the engine gave before the Mach limit.
for (const c of pinned.cases) {
  test(`${c.name}: the whole ten-minute trajectory is bit-for-bit what it was before the Mach limit`, () => {
    const now = trajectoryDigest(c.setup);
    // The readable numbers first, so a failure says what moved; then the fingerprint of every step.
    const { name, setup, digest, ...readable } = c;
    const { digest: nowDigest, ...nowReadable } = now;
    assert.deepEqual(nowReadable, readable);
    assert.equal(nowDigest, digest);
  });
}
