// Checks: a scenario's development changes the panel only when its time or step comes or the instructor applies it, and a pause stops the clock.
// Serves: EP-R4, EP-R5, EP-R6 (docs/modules/ep-tabletop/requirements.md).
// Expected values: from the example scenario itself (its start values and its developments), as docs/modules/ep-tabletop/testing.md says; no flying number is checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession, act, advance, panelOf, settingOf } from '../../../src/modules/ep-tabletop/scenario.js';
import { ENGINE_ROUGHNESS } from '../../../src/modules/ep-tabletop/scenarios.js';

test('a development reaches the panel only at its time, its step or the instructor\'s Apply, and a pause stops the clock', () => {
  const sc = ENGINE_ROUGHNESS;
  const byTime = sc.developments.find((d) => d.at.timeS !== undefined);
  const byStep = sc.developments.find((d) => d.at.step !== undefined);
  const [timeKey, timeValue] = Object.entries(byTime.set)[0];
  const [stepKey, stepValue] = Object.entries(byStep.set).find(([k]) => !(k in byTime.set));

  let s = startSession(sc);
  s = act(s, { type: 'reveal', key: timeKey });
  s = act(s, { type: 'reveal', key: stepKey });
  assert.deepEqual(settingOf(s, timeKey), sc.start.shown[timeKey], 'the panel starts at the scenario\'s start');

  // Not started: the clock waits for the instructor.
  s = advance(s, 600);
  assert.equal(s.clockS, 0);

  // Running: nothing changes until the development's time comes, then it does.
  s = act(s, { type: 'resume' });
  s = advance(s, byTime.at.timeS - 1);
  assert.deepEqual(settingOf(s, timeKey), sc.start.shown[timeKey], 'one second early, still the start value');
  s = advance(s, 2);
  assert.deepEqual(settingOf(s, timeKey), timeValue, 'its time has come');
  assert.deepEqual(panelOf(s).set[timeKey], timeValue, 'and the panel shows it, as it was revealed');

  // A pause stops the clock: ten minutes later nothing has moved.
  s = act(s, { type: 'pause' });
  const frozenAt = s.clockS;
  s = advance(s, 600);
  assert.equal(s.clockS, frozenAt, 'time stands still');
  assert.notDeepEqual(settingOf(s, stepKey), stepValue, 'the step development waits for its step');

  // An instructor's edit stays off the panel until Apply.
  const editKey = 'engine.torquePct';
  s = act(s, { type: 'reveal', key: editKey });
  const before = settingOf(s, editKey);
  s = act(s, { type: 'stage', key: editKey, value: before + 7 });
  assert.equal(panelOf(s).set[editKey], before, 'a pending edit is not shown');
  s = act(s, { type: 'apply' });
  assert.equal(panelOf(s).set[editKey], before + 7, 'Apply shows it');

  // The step development comes at its step, and not before.
  s = act(s, { type: 'step', to: 'AN' });
  assert.notDeepEqual(settingOf(s, stepKey), stepValue);
  s = act(s, { type: 'step', to: byStep.at.step });
  assert.deepEqual(panelOf(s).set[stepKey], stepValue, 'its step has come');

  // An indication nobody asked about stays off the panel.
  assert.equal('engine.ittC' in panelOf(s).set, false);
});
