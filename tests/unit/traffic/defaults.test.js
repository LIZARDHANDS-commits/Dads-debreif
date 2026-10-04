// Checks: every Traffic setting opens filled in with a plain value the settings store accepts, each default sits
//   inside its number box's limits, the 2D | 3D and paint menus hold only their offered values, and the runway
//   opens on 29L with 11R not offered.
// Serves: TR-R27, TR-R28 (no dead ends).
// Expected values: none pinned. The start values themselves (wind, limits, layers) are design choices with their
//   sources beside them in defaults.js; pinning each one here only copied the code (NO DUMB TESTS, Patrick
//   4 Oct 11:50Z; the row-by-row pins were retired in the Traffic clean-up).

import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../../src/ui-kit/controls.js';
import { ALLOWED, DEFAULTS, LIMITS, SPEEDS, RUNWAYS, DEFAULT_RUNWAY } from '../../../src/modules/traffic/defaults.js';
import { createSettings } from '../../../src/storage/settings.js';

test('the defaults are one frozen object of plain values, and the playback speed is one on offer', () => {
  assert.ok(SPEEDS.includes(DEFAULTS.speed));
  assert.ok(Object.isFrozen(DEFAULTS));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value), `${key} is a plain value`);
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} is finite`);
  }
});

test('the shared settings store accepts the defaults and every key can be changed to a value of its own type', () => {
  const kept = new Map();
  const store = { get: (k, fallback) => (kept.has(k) ? kept.get(k) : fallback), set: (k, v) => kept.set(k, v) };
  const settings = createSettings(store, DEFAULTS);
  assert.deepEqual({ ...settings.get() }, { ...DEFAULTS });
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const other = typeof value === 'number' ? value + 1 : typeof value === 'boolean' ? !value : `${value}x`;
    settings.update({ [key]: other });
    assert.equal(settings.get()[key], other, key);
  }
});

test('the 3D aircraft\'s paint starts as the ui-kit\'s Harvard scheme and may hold only the paints it offers', () => {
  assert.equal(DEFAULTS.paint, 'harvard');
  assert.deepEqual([...ALLOWED.paint], ['harvard', 'ship']);
  const kept = new Map();
  const settings = createSettings({ get: (k, f) => (kept.has(k) ? kept.get(k) : f), set: (k, v) => kept.set(k, v) }, DEFAULTS, { allowed: ALLOWED });
  settings.update({ paint: 'ship' });
  assert.equal(settings.get().paint, 'ship');
  settings.update({ paint: 'gold' });
  assert.equal(settings.get().paint, 'ship', 'anything else is refused');
});

test('every default that has a limit sits inside it, so a fresh box is never refused', () => {
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (!Object.hasOwn(DEFAULTS, key)) continue;
    assert.ok(DEFAULTS[key] >= min && DEFAULTS[key] <= max, `${key} = ${DEFAULTS[key]} is outside ${min} to ${max}`);
  }
});

test('the 2D | 3D setting is the ui-kit\'s shared one: it starts at VIEW_DEFAULT and may hold only VIEW_ALLOWED', () => {
  assert.equal(DEFAULTS.view, VIEW_DEFAULT);
  assert.deepEqual([...ALLOWED.view], [...VIEW_ALLOWED]);
  const kept = new Map();
  const settings = createSettings({ get: (k, f) => (kept.has(k) ? kept.get(k) : f), set: (k, v) => kept.set(k, v) }, DEFAULTS, { allowed: ALLOWED });
  settings.update({ view: '3d' });
  assert.equal(settings.get().view, '3d');
  settings.update({ view: 'sideways' });
  assert.equal(settings.get().view, '3d', 'anything else is refused');
});

test('RUNWAYS defines 29L as active and 11R as coming soon/disabled', () => {
  assert.ok(Object.isFrozen(RUNWAYS));
  assert.equal(DEFAULT_RUNWAY, '29L');
  assert.equal(DEFAULTS.runway, '29L');
  assert.equal(RUNWAYS.length, 2);
  assert.equal(RUNWAYS[0].id, '29L');
  assert.equal(RUNWAYS[0].active, true);
  assert.equal(RUNWAYS[1].id, '11R');
  assert.equal(RUNWAYS[1].disabled, true);
});
