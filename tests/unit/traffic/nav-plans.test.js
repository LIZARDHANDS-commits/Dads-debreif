// Checks: where a PFL "From Area" aircraft starts: east on the 090 radial, north on 000, heading for the field,
//   and the three inputs clamped to their ranges.
// Serves: Traffic spec 4.5 (PFL from the area).
// Expected values: the radial geometry (standard trigonometry); 125 KIAS is the clean glide speed (T-6A max
//   glide chart); the clamps (3,000-15,000 ft) are the setting's own range.
// The nav-plan, factory and spawn-preset tests that were here pinned the old physics plans, removed with them on
// Patrick's card "Rebuild, then delete" (4 Oct 17:53Z).

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { makePflFromArea } from '../../../src/modules/traffic/nav-plans.js';

describe('nav-plans: makePflFromArea', () => {
  it('default (090°/10 NM/8000 ft) spawns east of field', () => {
    const { spawn } = makePflFromArea();
    assert.ok(spawn.x > 50000, `spawn x should be east (>50000 ft), got ${spawn.x}`);
    assert.ok(Math.abs(spawn.y) < 1000, `spawn y should be near 0, got ${spawn.y}`);
    assert.equal(spawn.alt, 8000);
    assert.equal(spawn.headingDeg, 270); // reciprocal of 090
    assert.equal(spawn.iasKt, 125);
  });

  it('radial 000° spawns north of field', () => {
    const { spawn } = makePflFromArea(0, 5, 6000);
    assert.ok(spawn.y > 20000, `spawn y should be north, got ${spawn.y}`);
    assert.ok(Math.abs(spawn.x) < 100, `spawn x should be near 0, got ${spawn.x}`);
    assert.equal(spawn.headingDeg, 180);
  });

  it('clamps inputs to valid ranges', () => {
    const { spawn: high } = makePflFromArea(90, 50, 20000);
    assert.equal(high.alt, 15000); // clamped
    const { spawn: low } = makePflFromArea(90, 0.5, 1000);
    assert.equal(low.alt, 3000);   // clamped
  });
});
