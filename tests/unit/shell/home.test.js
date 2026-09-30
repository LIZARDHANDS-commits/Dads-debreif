import test from 'node:test';
import assert from 'node:assert/strict';
import { cardBadge } from '../../../src/shell/home.js';

const built = () => {};

test('a module that is not built yet is marked Coming soon, prototype or not', () => {
  assert.equal(cardBadge({ load: null }), 'Coming soon');
  assert.equal(cardBadge({ load: null, prototype: true }), 'Coming soon');
});

test('a built module carries PROTOTYPE until the combined sign-off (D135)', () => {
  assert.equal(cardBadge({ load: built, prototype: true }), 'PROTOTYPE');
});

test('a built module without the prototype flag has no badge', () => {
  assert.equal(cardBadge({ load: built }), null);
  assert.equal(cardBadge({ load: built, prototype: false }), null);
});
