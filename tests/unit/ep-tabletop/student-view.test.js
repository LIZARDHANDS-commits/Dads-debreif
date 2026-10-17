// Checks: the student view, the only thing the phone sends and the only thing the student's screen draws from, never carries the setup:
//   no development still to come, no edit not yet applied, no marks, notes or Declare answers, nothing about the scenario's name or end,
//   and no cause (fault), severity or trend, set or waiting (EP-11; plan Step 3 extended this check, still the file's one test).
//   Step 4 (EP-12) extended it again: a fire cause lights FIRE and MASTER WARN together; its glow and haze, and any cue the instructor sets,
//   reach the student view only once applied; and a cue still waiting is not in it.
// Serves: EP-R3, EP-R4 (docs/modules/ep-tabletop/requirements.md), EP-2, EP-9, EP-11.
// Expected values: from the example scenario itself (its developments' words and values), the fire cause as an event (it lights FIRE, and
//   FIRE lights MASTER WARN) and sentinel words typed in this test; no flying number is checked (docs/modules/ep-tabletop/testing.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession, act, advance } from '../../../src/modules/ep-tabletop/scenario.js';
import { studentView, cleanStudentView } from '../../../src/modules/ep-tabletop/student-view.js';
import { ENGINE_ROUGHNESS } from '../../../src/modules/ep-tabletop/scenarios.js';

test('the student view never carries the setup: developments to come, unapplied edits, marks, notes or the end (EP-2)', () => {
  const sc = ENGINE_ROUGHNESS;
  const PENDING = 'PENDING-SMOKE-NOT-APPLIED';
  const NOTE = 'INSTRUCTOR-NOTE-SENTINEL';
  const DECLARE = 'DECLARE-ANSWER-SENTINEL';
  const ADDED = 'ADDED-DEVELOPMENT-SENTINEL';

  /** Every word of the setup that must never reach the student, for developments not yet happened at `s`. */
  function forbidden(s) {
    const words = [sc.title, sc.id, NOTE, DECLARE, PENDING, ADDED, 'Needs work'];
    for (const d of s.developments) {
      words.push(d.id, d.label);
      if (!d.done) for (const v of Object.values(d.set)) if (typeof v === 'string') words.push(v);
    }
    return words;
  }
  function check(s, moment) {
    const json = JSON.stringify(studentView(s));
    for (const word of forbidden(s)) assert.equal(json.includes(word), false, `${moment}: the student view carries "${word}"`);
    for (const key of ['"developments"', '"pending"', '"marks"', '"declare"', '"log"', '"scenario"', '"title"', '"shown"', '"overrides"', '"pendingFaults"']) {
      assert.equal(json.includes(key), false, `${moment}: the student view carries ${key}`);
    }
    // Nothing about the causes behind the gauges (EP-11): not the word, nor a cause's severity, trend or kind.
    for (const word of ['fault', 'severity', 'trend', 'worsening', 'improving', 'oilLeak', 'fuelLeak']) {
      assert.equal(json.toLowerCase().includes(word.toLowerCase()), false, `${moment}: the student view carries "${word}"`);
    }
    // Not empty either: the student's screen takes it in as a student view.
    assert.notEqual(cleanStudentView(JSON.parse(json)), null, `${moment}: the screen accepts it`);
    return json;
  }

  // Before start.
  let s = startSession(sc);
  check(s, 'before start');

  // Every outside cue asked about, so a planned change to one would show if it leaked.
  for (const key of Object.keys(sc.start.shown)) if (key.startsWith('cue.') || key.startsWith('light.')) s = act(s, { type: 'reveal', key });
  s = act(s, { type: 'declare', field: 'plan', value: DECLARE });
  s = act(s, { type: 'note', step: 'A', text: NOTE });
  s = act(s, { type: 'mark', step: 'A', mark: 'Needs work' });

  // A cause set and running (its gauge revealed, so the panel moves with it), and another waiting to be applied.
  s = act(s, { type: 'reveal', key: 'engine.oilPsi' });
  s = act(s, { type: 'addFault', kind: 'oilLeak' });
  s = act(s, { type: 'apply' });
  s = act(s, { type: 'addFault', kind: 'fuelLeak', params: { side: 'R' } });
  check(s, 'a cause set and another waiting');

  // Running, a timed development still to come.
  s = act(s, { type: 'resume' });
  s = advance(s, 5);
  check(s, 'a development pending');

  // Paused with edits not yet applied, and one made into a new development.
  s = act(s, { type: 'pause' });
  s = act(s, { type: 'stage', key: 'cue.smoke', value: PENDING });
  check(s, 'paused, an edit not yet applied');
  s = act(s, { type: 'addDevelopment', when: 'tap', label: ADDED });
  s = act(s, { type: 'stage', key: 'cue.smoke', value: PENDING });
  check(s, 'paused, an added development and an edit not yet applied');

  // After Boldface: the step development has happened; the student sees its result, never its name.
  s = act(s, { type: 'step', to: 'AN' });
  s = act(s, { type: 'step', to: 'B' });
  const json = check(s, 'after Boldface');
  const chip = sc.developments.find((d) => d.at.step === 'B');
  assert.equal(json.includes(chip.set['cue.roughness']), true, 'the result the student asked about does show');

  // Picture cues (EP-12): a fire cause waiting to be applied, then applied, on a fresh session.
  let f = startSession(sc);
  f = act(f, { type: 'reveal', key: 'light.FIRE' });
  f = act(f, { type: 'reveal', key: 'light.MASTER WARN' });
  f = act(f, { type: 'addFault', kind: 'fire' });
  let v = studentView(f);
  assert.equal(v.panel['light.FIRE'], false, 'a fire cause not applied is not on the panel');
  assert.deepEqual([v.cues.haze, v.cues.glow], [0, 0], 'no glow or haze before Apply');
  f = act(f, { type: 'apply' });
  v = studentView(f);
  assert.equal(v.panel['light.FIRE'], true, 'a fire cause lights FIRE');
  assert.equal(v.panel['light.MASTER WARN'], true, 'and MASTER WARN with it');
  assert.equal(v.cues.glow > 0 && v.cues.haze > 0, true, 'the glow and a little haze reach the student once applied');
  // A cue the instructor has staged but not applied is not in the view; a flickering light is named only once revealed.
  f = act(f, { type: 'stage', key: 'fx.shakeDeg', value: 0.7 });
  f = act(f, { type: 'stage', key: 'fx.haze', value: 0.9 });
  f = act(f, { type: 'stage', key: 'fx.flicker.GEN', value: true });
  assert.equal(studentView(f).cues.shakeDeg, 0, 'a shake waiting for Apply is not in the view');
  assert.equal(studentView(f).cues.haze, v.cues.haze, 'a haze change waiting for Apply is not in the view');
  f = act(f, { type: 'apply' });
  assert.equal(studentView(f).cues.haze, 0.9, 'and shows once applied');
  assert.equal(studentView(f).cues.flicker.includes('GEN'), false, 'a light nobody has revealed is not named, even flickering');
  // Arriving cues are untrusted: clamped, unknown light names dropped.
  const clean = cleanStudentView({ ...JSON.parse(JSON.stringify(studentView(f))), cues: { haze: 7, glow: -2, shakeDeg: 99, flicker: ['FIRE', 'NOT-A-LIGHT'] } });
  assert.deepEqual([clean.cues.haze, clean.cues.glow, clean.cues.flicker], [1, 0, ['FIRE']]);
  assert.equal(clean.cues.shakeDeg < 99, true, 'the shake is kept to a few degrees at most');
});
