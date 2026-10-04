// Checks: every manoeuvre flies with no jump or snap, step by step, from start to the circuit again.
// Serves: Traffic spec items 3-5 and 13a (heading, bank and hand-overs never step); Patrick, 4 Oct 10:05Z
// ("smooth transitions (boundary conditions)") and his card approving these six limits (10:18Z).
// Expected values: what the T-6 can physically do (roll rate 90°/s, Patrick 08:54Z; turn rate from bank,
// standard aerodynamics), not the code's own output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, STEP_SEC } from '../../../src/modules/traffic/sim.js';
import { iasToTasKt } from '../../../src/core/t6-performance.js';

const mooseJaw = JSON.parse(readFileSync(new URL('../../../src/modules/traffic/data/moose-jaw.json', import.meta.url), 'utf8'));

const G_FTPS2 = 32.174;
const KT_FTPS = 6076.12 / 3600;
const ROLL_DPS = 90; // the most the T-6 is rolled in the sim (Patrick, 4 Oct 08:54Z)
const wrap180 = (d) => ((d % 360) + 540) % 360 - 180;

// The six limits, per sim step (0.05 s), as approved on Patrick's card (10:18Z).
const LIMITS = {
  extraMoveFt: 1, // 1) no position jump: no further than the ground speed carries it, plus 1 ft
  headingDeg: 2, // 2) heading at most 2° a step (40°/s)
  bankDeg: 5, // 3) bank no faster than 90°/s (4.5° a step, rounded up)
  kt: 1, // 4) speed at most 1 kt a step
  altFt: 10, // 5) height at most 10 ft a step (12,000 ft/min, above the zoom's 10,000)
};
// 6) Turn rate changes no faster than a 90°/s roll allows at this speed and bank: d(rate)/dt = g sec²(bank) roll / V.
// Margin x2: heading is read every 0.05 s along a path made of points, which adds a small ripple a pilot can't see.
const TURN_RATE_MARGIN = 2;

const MANOEUVRES = [
  { name: 'closed pattern from the climb-out', command: 'closed_pattern', startPoint: 2 },
  { name: 'closed pattern asked for on final', command: 'closed_pattern', startPoint: 13 },
  { name: 'go-around from final', command: 'go_around', startPoint: 13 },
  { name: 'breakout from downwind', command: 'breakout', startPoint: 11 },
  { name: 'High Key from downwind', command: 'climb_high_key', startPoint: 11 },
  { name: 'High Key from initial', command: 'climb_high_key', startPoint: 5 },
  { name: 'PFL from downwind', command: 'engine_fail', startPoint: 11 },
  { name: 'plain circuit through the break', command: null, startPoint: 9 },
];
const WINDS = [{ windKt: 0, windFromDeg: 360, label: 'calm' }, { windKt: 20, windFromDeg: 200, label: '20 kt from 200' }];

for (const wind of WINDS) {
  for (const m of MANOEUVRES) {
    test(`Smooth: ${m.name}, ${wind.label}, has no jump or snap in place, heading, bank, speed, height or turn rate`, () => {
      const sim = createSim({ ...mooseJaw, aircraft: [], windKt: wind.windKt, windFromDeg: wind.windFromDeg }, { seed: 42 });
      const id = sim.spawn({ routeId: 'PAT1', startPoint: m.startPoint });
      sim.stepTo(1);
      if (m.command) assert.equal(sim.command(id, m.command), true);
      let prev = null, prevRate = null, steps = 0;
      while (sim.t < 240) {
        sim.stepTo(sim.t + STEP_SEC);
        const a = sim.state().aircraft.find((x) => x.id === id);
        if (!a || a.status !== 'flying') break;
        const at = `at ${sim.t.toFixed(2)} s (${a.phase})`;
        if (prev) {
          const carried = (a.groundSpeedKt ?? a.kt) * KT_FTPS * STEP_SEC;
          const moved = Math.hypot(a.x - prev.x, a.y - prev.y);
          assert.ok(moved <= carried + LIMITS.extraMoveFt, `1) moved ${moved.toFixed(1)} ft, ground speed carries ${carried.toFixed(1)} ft, ${at}`);
          const dHdg = wrap180(a.headingDeg - prev.headingDeg);
          assert.ok(Math.abs(dHdg) <= LIMITS.headingDeg, `2) heading stepped ${dHdg.toFixed(2)}°, ${at}`);
          assert.ok(Math.abs(a.bankDeg - prev.bankDeg) <= LIMITS.bankDeg, `3) bank stepped ${(a.bankDeg - prev.bankDeg).toFixed(2)}°, ${at}`);
          assert.ok(Math.abs(a.kt - prev.kt) <= LIMITS.kt, `4) speed stepped ${(a.kt - prev.kt).toFixed(2)} kt, ${at}`);
          assert.ok(Math.abs(a.alt - prev.alt) <= LIMITS.altFt, `5) height stepped ${(a.alt - prev.alt).toFixed(1)} ft, ${at}`);
          const rate = dHdg / STEP_SEC;
          if (prevRate !== null) {
            const bank = Math.min(80, Math.max(Math.abs(a.bankDeg), Math.abs(prev.bankDeg))) * Math.PI / 180;
            const tasFtps = Math.max(1, iasToTasKt(a.kt, a.alt) * KT_FTPS);
            const allowedDps2 = (G_FTPS2 / tasFtps) / Math.cos(bank) ** 2 * ROLL_DPS;
            const dRate = Math.abs(rate - prevRate) / STEP_SEC;
            assert.ok(dRate <= TURN_RATE_MARGIN * allowedDps2,
              `6) turn rate changed ${dRate.toFixed(1)}°/s² where a 90°/s roll allows ${allowedDps2.toFixed(1)}°/s², ${at}`);
          }
          prevRate = rate;
        }
        prev = a;
        steps++;
      }
      assert.ok(steps > 100, 'flew long enough to check');
    });
  }
}
