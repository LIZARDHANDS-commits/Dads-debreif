import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, moduleIds, findModule, isBuilt } from '../../../src/shell/registry.js';

// Module ids from the approved map in SPEC.md; they never change.
const APPROVED = ['debrief', 'turn-sim', 'turn-fight', 'traffic', 'sof'];

test('the home screen lists exactly the approved modules, in build order', () => {
  assert.deepEqual(moduleIds(), APPROVED);
});

test('ids are unique kebab-case and every card has its text and media', () => {
  assert.equal(new Set(moduleIds()).size, MODULES.length);
  for (const m of MODULES) {
    assert.match(m.id, /^[a-z]+(-[a-z]+)*$/);
    for (const key of ['eyebrow', 'title', 'blurb']) assert.ok(m[key], `${m.id}.${key}`);
    assert.ok(m.media.still && m.media.webm && m.media.mp4, `${m.id} media`);
    assert.ok(m.load === null || typeof m.load === 'function', `${m.id}.load`);
  }
});

test('PT-PT Sim and the Briefing Board are not on the home screen (R19)', () => {
  const text = JSON.stringify(MODULES).toLowerCase();
  assert.doesNotMatch(text, /pt-?pt|point.to.point|briefing board|briefboard/);
});

test('findModule and isBuilt', () => {
  assert.equal(findModule('sof').title, 'SOF Dashboard');
  assert.equal(findModule('ptpt'), null);
  assert.equal(isBuilt({ load: null }), false);
  assert.equal(isBuilt({ load: () => {} }), true);
});

test('card videos follow the motion setting, or the computer when set to follow it', async () => {
  const { motionAllowed } = await import('../../../src/shell/home.js');
  assert.equal(motionAllowed('system', false), true);
  assert.equal(motionAllowed('system', true), false);
  assert.equal(motionAllowed('full', true), true);
  assert.equal(motionAllowed('reduced', false), false);
});
