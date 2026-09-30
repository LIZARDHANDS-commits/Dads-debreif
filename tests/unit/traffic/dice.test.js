// The seeded dice: the same numbers for the same seed, in [0, 1), evenly spread,
// and a state that can be saved and put back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDice } from '../../../src/modules/traffic/dice.js';

const roll = (dice, n) => Array.from({ length: n }, () => dice());

test('the same seed gives the same numbers, and another seed gives others', () => {
  assert.deepEqual(roll(createDice(7), 50), roll(createDice(7), 50));
  assert.notDeepEqual(roll(createDice(7), 50), roll(createDice(8), 50));
});

test('every number is from 0 up to, but not including, 1', () => {
  for (const seed of [0, 1, 7, 2 ** 31, 2 ** 32 - 1, -5, 1.9]) {
    for (const x of roll(createDice(seed), 5000)) assert.ok(x >= 0 && x < 1, `seed ${seed}: ${x}`);
  }
});

test('the numbers are spread evenly: tenths of 100,000 rolls are each about 10,000', () => {
  const counts = new Array(10).fill(0);
  for (const x of roll(createDice(2024), 100000)) counts[Math.floor(x * 10)]++;
  for (const c of counts) assert.ok(c > 9700 && c < 10300, counts.join());
});

test('a roll under 0.2 comes up a fifth of the time, as a land chance of 20 % should', () => {
  const dice = createDice(99);
  let lands = 0;
  for (let i = 0; i < 100000; i++) if (dice() < 0.2) lands++;
  assert.ok(lands > 19500 && lands < 20500, lands);
});

test('the state can be saved and put back, and the numbers carry on from there', () => {
  const dice = createDice(5);
  roll(dice, 10);
  const saved = dice.getState();
  const next = roll(dice, 20);
  dice.setState(saved);
  assert.deepEqual(roll(dice, 20), next);
  const other = createDice(123);
  other.setState(saved);
  assert.deepEqual(roll(other, 20), next, 'the state is all there is to a dice');
});

test('a new dice starts where its seed says, and a seed that is not a number is read as 0', () => {
  assert.equal(createDice(41).getState(), 41);
  assert.deepEqual(roll(createDice(NaN), 5), roll(createDice(0), 5));
  assert.deepEqual(roll(createDice(undefined), 5), roll(createDice(1), 5));
});
