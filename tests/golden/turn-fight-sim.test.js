// Golden test (R9, D10): the Turn Fight against V6's own `bfmFight` script,
// run unchanged in Node by turn-fight-v6.js with a stand-in page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createV6Fight } from './turn-fight-v6.js';

const STEP = 0.02;

/** Runs V6 at 0.02 s steps until `stop(v6)` and returns it. */
function runV6(setup, stop, maxSteps = 40000) {
  const v6 = createV6Fight(setup);
  for (let i = 0; i < maxSteps && !stop(v6); i++) v6.step(STEP);
  return v6;
}

test('V6 itself gives the answers the spec pins (merge, first nose-on)', () => {
  const nose = (setup) => {
    const v6 = runV6(setup, (f) => f.S.firstNose);
    return { by: v6.S.firstNose.id, sinceMerge: v6.S.firstNose.t - v6.S.merge, merge: v6.S.merge };
  };
  const round1 = (x) => Math.round(x * 10) / 10;
  const two = nose({ circles: 2 });
  assert.equal(round1(two.merge), 16.4);
  assert.equal(round1(two.sinceMerge), 18.2);
  assert.equal(round1(nose({ circles: 1 }).sinceMerge), 9.1);
  const uneven = nose({ circles: 2, blueKt: 250, redKt: 200 });
  assert.equal(round1(uneven.merge), 16);
  assert.deepEqual([uneven.by, round1(uneven.sinceMerge)], ['b', 14.4]);
  const fiveG = nose({ circles: 2, blueG: 5 });
  assert.deepEqual([fiveG.by, round1(fiveG.sinceMerge)], ['a', 12.6]);
});
