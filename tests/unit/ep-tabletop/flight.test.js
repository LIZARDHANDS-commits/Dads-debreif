// Checks: with the engine failed, high and close enough that the glide ring holds Moose Jaw, the student who turns toward Moose Jaw and
//   glides at best glide reaches the field (over it at or above the field's elevation, or down on a runway), and the student who turns away
//   and flies straight touches down short, off the runway. Always true on the way: the speed never falls below the clean stall and the G
//   never passes what the wing gives at that speed (physical limits, docs/TESTING.md T10). Both cases run the same code (a comparison, T1).
// Serves: EP-13 (docs/modules/ep-tabletop/decisions.md), built on EP-Q5's working answer (a); ALL-R20.
// Expected values (docs/TESTING.md T3), never from this code's output:
//   - the start: 8,000 ft is 6,108 ft above Moose Jaw (field elevation 1,892 ft, OurAirports in src/airfields/airports-data.js); the clean
//     glide is 2 NM per 1,000 ft (core T6A_GLIDE, reference data and SMM 13.5 para 7), so about 12.2 NM of glide in still air. The start is
//     6 NM from the field: half the reach, so the glide toward it has about 6 NM to spare and the glide away has nothing in reach ahead (the
//     next field, Regina, is about 35 NM the other way). Clear margin either way, not a knife edge. Traffic's glide ring (the wind-shifted
//     formula, imported as the module does) is checked to hold Moose Jaw at the start.
//   - "over the field": within 1 NM of Moose Jaw's reference point (src/airfields/cymj-runways.js CYMJ_ORIGIN); its runways lie within
//     about 0.75 NM of it (Patrick's measured ends), so 1 NM is over the aerodrome.
//   - the clean stall, 86 KIAS (core T6A_LIMITS.stallKias, Patrick 30 Sep), and the wing's G at a speed, (KIAS ÷ stall)² (core
//     stallLimitG, standard aerodynamics).
// No time gate beyond a generous cap: a glide from 6,108 ft at the clean sink of about 1,350 ft/min (core T6A_GLIDE) is over in under
// 5 minutes; held level first, or flown slower than best glide (less sink), it takes a few minutes more. 10 minutes only catches an
// aircraft that is stuck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession, act, advance } from '../../../src/modules/ep-tabletop/scenario.js';
import { studentView } from '../../../src/modules/ep-tabletop/student-view.js';
import { ENGINE_ROUGHNESS } from '../../../src/modules/ep-tabletop/scenarios.js';
import { calculateGlideFootprint } from '../../../src/modules/traffic/pfl-geometry.js';
import { glideRatio, stallLimitG, T6A_LIMITS } from '../../../src/core/t6-performance.js';
import { AIRPORTS } from '../../../src/airfields/airports-data.js';
import { FT_PER_NM } from '../../../src/core/units.js';

const FIELD_FT = AIRPORTS.find((a) => a.icao === 'CYMJ').elevationFt; // 1,892 ft (OurAirports)
const START = { altFt: 8000, kias: 200, headingDegM: 270, distNm: 6, bearingDegT: 225 };
const OVER_FIELD_FT = 1 * FT_PER_NM;
const CAP_S = 600; // 10 minutes: see the header
/** The cap is applied at the start of each 0.05 s step and the speed moves a fraction of a knot within it, so 0.02 G covers the sample. */
const G_SAMPLE_MARGIN = 0.02;

/** The example scenario from the start above (its wind, 290° at 10 kt, kept), with the engine failed from the first moment. */
function failedEngineSession() {
  const sc = {
    ...ENGINE_ROUGHNESS,
    developments: [],
    start: { ...ENGINE_ROUGHNESS.start, altFt: START.altFt, kias: START.kias, headingDegM: START.headingDegM, position: { fromIcao: 'CYMJ', bearingDegT: START.bearingDegT, distNm: START.distNm } },
  };
  let s = startSession(sc);
  s = act(s, { type: 'addFault', kind: 'engineFail' });
  s = act(s, { type: 'apply' });
  return act(s, { type: 'resume' });
}

/** Flies `s` a second at a time to the cap or the outcome, checking the always-true limits; `onSecond(s, view)` may pick. */
function fly(s, onSecond = (x) => x) {
  let arrived = false;
  let out = s;
  for (let t = 0; t < CAP_S; t++) {
    const next = advance(out, 1);
    out = onSecond(next, studentView(next).flight);
    const f = studentView(out).flight;
    assert.ok(f.kias >= T6A_LIMITS.stallKias, `at ${t + 1} s the speed ${f.kias.toFixed(1)} KIAS is below the clean stall`);
    assert.ok(f.g <= stallLimitG(f.kias) + G_SAMPLE_MARGIN, `at ${t + 1} s the G ${f.g.toFixed(2)} is more than the wing gives at ${f.kias.toFixed(1)} KIAS`);
    if (Math.hypot(f.x, f.y) <= OVER_FIELD_FT && f.altFt >= FIELD_FT) arrived = true;
    if (f.outcome) break;
  }
  return { s: out, flight: studentView(out).flight, arrived };
}

test('engine failed: gliding toward Moose Jaw reaches it, turning away touches down short, inside the physical limits', () => {
  // The start, from the glide data and Traffic's ring, before anything flies.
  const heightFt = START.altFt - FIELD_FT;
  const reachNm = (heightFt * glideRatio('clean')) / FT_PER_NM;
  assert.ok(reachNm >= 1.8 * START.distNm, `still-air reach ${reachNm.toFixed(1)} NM is not well beyond the ${START.distNm} NM start`);
  const s0 = failedEngineSession();
  const at = studentView(s0).flight;
  const ring = calculateGlideFootprint({ x: at.x, y: at.y, alt: at.altFt, config: 'Clean' }, s0.scenario.start.wind.fromDegT, s0.scenario.start.wind.kt);
  assert.ok(Math.hypot(ring.cx, ring.cy) < ring.rGlide, 'the glide ring holds Moose Jaw at the start');
  const startDistFt = Math.hypot(at.x, at.y);

  // Toward Moose Jaw at best glide: it gets there, over the field with height in hand (or down on a runway).
  let toward = act(s0, { type: 'pick', manoeuvre: 'turnField', fieldIcao: 'CYMJ' });
  toward = act(toward, { type: 'pick', manoeuvre: 'glide' });
  const t = fly(toward);
  assert.ok(t.arrived || t.flight.outcome?.kind === 'landed', `the glide toward Moose Jaw did not reach it: ${t.flight.outcome?.words ?? 'still flying at the cap'}`);

  // Away from Moose Jaw (it bears about 036°M from the start), then straight: it comes down short, off the runway, further away.
  const away = act(s0, { type: 'pick', manoeuvre: 'turnLeft', headingDegM: 216 });
  let rolledOut = false;
  const a = fly(away, (s, f) => {
    // On the heading within the shared ±5°, the student picks straight and level.
    if (!rolledOut && Math.abs((((f.headingDegM - 216) % 360) + 540) % 360 - 180) <= 5) {
      rolledOut = true;
      return act(s, { type: 'pick', manoeuvre: 'straightLevel' });
    }
    return s;
  });
  assert.equal(rolledOut, true, 'the turn away came onto its heading');
  assert.equal(a.arrived, false, 'turning away never reached the field');
  assert.equal(a.flight.outcome?.kind, 'offRunway', `turning away: ${a.flight.outcome?.words ?? 'still flying at the cap'}`);
  assert.ok(Math.hypot(a.flight.x, a.flight.y) > startDistFt, 'it touched down further from Moose Jaw than it started');
  assert.ok(a.flight.altFt <= FIELD_FT + 1, 'it is on the ground');
});
