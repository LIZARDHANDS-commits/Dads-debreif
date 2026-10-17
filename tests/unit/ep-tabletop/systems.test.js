// Checks: with an oil leak set at the start, the oil pressure starts at its healthy value and falls as the clock runs; the OIL PX light is
//   dark while the pressure is above its threshold, comes on once the pressure has fallen through it and stays on; MASTER CAUTION comes on
//   with it; the instructor typing a pressure over it wins, and the lights go out.
// Serves: EP-11 (docs/modules/ep-tabletop/decisions.md), systems-plan.md Phase 1.
// Expected values: the healthy oil pressure range, 90 to 120 psi (docs/references/open-source-performance-baseline.md, ALL-30, "Lubrication
//   System Pressure Limits"); the OIL PX threshold is the named constant LIGHT_THRESHOLDS['OIL PX'] with its source status (an estimate until
//   Patrick gives a page, EP-Q10), never a number read back from the model. No time gate: the clock moves in generous 10 s steps and only the
//   order of events is checked; the 30-minute stop only catches a leak that never moves (a slow leak still lights well inside it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession, act, advance, settingOf } from '../../../src/modules/ep-tabletop/scenario.js';
import { ENGINE_ROUGHNESS } from '../../../src/modules/ep-tabletop/scenarios.js';
import { LIGHT_THRESHOLDS } from '../../../src/modules/ep-tabletop/systems.js';

const OIL_NORMAL_PSI = [90, 120]; // ALL-30, the PT6A-68's normal operating oil pressure
const TYPED_PSI = 100; // inside the normal range (ALL-30): what an instructor would type to show a healthy gauge

test('an oil leak takes the pressure down through the OIL PX threshold: the light comes on and stays on, with MASTER CAUTION; a typed pressure wins', () => {
  const oilPx = LIGHT_THRESHOLDS['OIL PX'];
  assert.equal(oilPx.gauge, 'engine.oilPsi', 'OIL PX follows the oil pressure');
  assert.ok(['estimate', 'baseline'].includes(oilPx.source) || /p\.\s*\d|Patrick/.test(oilPx.source), 'the threshold names its source status');

  let s = startSession(ENGINE_ROUGHNESS);
  s = act(s, { type: 'addFault', kind: 'oilLeak' });
  s = act(s, { type: 'apply' });

  const before = settingOf(s, 'engine.oilPsi');
  assert.ok(before >= OIL_NORMAL_PSI[0] && before <= OIL_NORMAL_PSI[1], `healthy before the leak runs: ${before} psi`);
  assert.equal(settingOf(s, 'light.OIL PX'), false, 'OIL PX dark at the start');
  assert.equal(settingOf(s, 'light.MASTER CAUTION'), false, 'MASTER CAUTION dark at the start');

  s = act(s, { type: 'resume' });
  let last = before;
  let litAt = null;
  for (let t = 10; t <= 30 * 60; t += 10) {
    s = advance(s, 10);
    const psi = settingOf(s, 'engine.oilPsi');
    const lit = settingOf(s, 'light.OIL PX');
    assert.ok(psi <= last, `the pressure never rises while the leak runs (${last} then ${psi} psi at ${t} s)`);
    last = psi;
    if (litAt === null) {
      assert.equal(lit, psi < oilPx.below, `OIL PX ${lit ? 'on' : 'dark'} at ${psi.toFixed(1)} psi against its ${oilPx.below} psi threshold`);
      if (lit) litAt = t;
    } else {
      assert.equal(lit, true, `OIL PX stays on (${t} s)`);
    }
    if (lit) assert.equal(settingOf(s, 'light.MASTER CAUTION'), true, `MASTER CAUTION on with OIL PX (${t} s)`);
    if (litAt !== null && t >= litAt + 60) break; // a minute after it came on is enough to see it stay on
  }
  assert.ok(last < before, 'the pressure fell as the clock ran');
  assert.notEqual(litAt, null, 'OIL PX came on once the pressure fell through its threshold');

  // The instructor types a healthy pressure over it: the typed value wins and the lights go out.
  s = act(s, { type: 'stage', key: 'engine.oilPsi', value: TYPED_PSI });
  s = act(s, { type: 'apply' });
  s = advance(s, 60);
  assert.equal(settingOf(s, 'engine.oilPsi'), TYPED_PSI, 'the typed pressure wins over the leak');
  assert.equal(settingOf(s, 'light.OIL PX'), false, 'OIL PX out with the typed pressure');
  assert.equal(settingOf(s, 'light.MASTER CAUTION'), false, 'MASTER CAUTION out with it');
});
