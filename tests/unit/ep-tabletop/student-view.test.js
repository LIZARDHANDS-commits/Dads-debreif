// Checks: the student view, the only thing the phone sends and the only thing the student's screen draws from, never carries the setup:
//   no development still to come, no edit not yet applied, no marks, notes or Declare answers, nothing about the scenario's name or end.
// Serves: EP-R3, EP-R4 (docs/modules/ep-tabletop/requirements.md), EP-2, EP-9.
// Expected values: from the example scenario itself (its developments' words and values) and sentinel words typed in this test; no flying
//   number is checked (docs/modules/ep-tabletop/testing.md).
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
    for (const key of ['"developments"', '"pending"', '"marks"', '"declare"', '"log"', '"scenario"', '"title"', '"shown"']) {
      assert.equal(json.includes(key), false, `${moment}: the student view carries ${key}`);
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
});
