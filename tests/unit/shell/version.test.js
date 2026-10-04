// Checks: the footer says "Updated 30 Sep 2026, 02:01Z" in Zulu, and a missing or bad build time says "Development copy".
// Serves: ALL-R27.
// Expected values: design choice: the wording is typed in the test.

import test from 'node:test';
import assert from 'node:assert/strict';
import { updatedLabel } from '../../../src/shell/version.js';

test('the footer says when this copy was published, in Zulu', () => {
  assert.equal(updatedLabel('2026-09-30T02:01:13Z'), 'Updated 30 Sep 2026, 02:01Z');
  assert.equal(updatedLabel('2026-01-05T23:59:59.999Z'), 'Updated 5 Jan 2026, 23:59Z');
});

test('a copy without a build time says it is a development copy', () => {
  assert.equal(updatedLabel(undefined), 'Development copy');
  assert.equal(updatedLabel('not a time'), 'Development copy');
});
