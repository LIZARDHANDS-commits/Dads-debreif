// B5's one test (plan T31, spec 7e): from in position, with the live fighting wing, Lead's 30 s level turn into #2 and then
// wings level. What a pilot would recognise, numbers from their sources (SMM 12.29 para 69, Fig 12.19; TS-233):
//  - #2 never comes inside 500 ft slant of Lead, bar a brief kiss while he corrects firmly (here: under 450 ft never, and
//    under 500 ft for at most 3 s; both estimates for "brief");
//  - 30 s after wings level he is in the cone's range: 500 to 1,000 ft slant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormation } from '../../../src/modules/turn-sim/live/formation.js';

const STEP_SEC = 0.05;
const KISS_SEC = 3;
const slantOf = (lead, two) => Math.hypot(two.xFt - lead.xFt, two.yFt - lead.yFt, (two.altAboveFt ?? 0) - (lead.altAboveFt ?? 0));

function fly(f, sec, onStep = () => {}) {
  for (let i = 0; i < Math.round(sec / STEP_SEC); i++) {
    f.step();
    onStep(f.state.aircraft);
  }
}

test('B5: a level turn into #2 from in position never goes inside 500 ft for long and ends in the cone', () => {
  const f = createFormation({ ships: 2, closeWing: 'held', fwWing: 'live' });
  assert.equal(f.change('fw'), 'started');
  for (let i = 0; i < Math.round(300 / STEP_SEC) && f.state.current; i++) f.step();
  fly(f, 5);
  assert.equal(f.pressFw('levelTurn', -1), 'started');
  let min = Infinity;
  let inside500 = 0;
  const watch = ([lead, two]) => {
    const s = slantOf(lead, two);
    min = Math.min(min, s);
    if (s < 500) inside500 += STEP_SEC;
  };
  fly(f, 30, watch);
  assert.equal(f.pressFw('wingsLevel'), 'started');
  fly(f, 30, watch);
  assert.ok(min >= 450, `least slant ${Math.round(min)} ft`);
  assert.ok(inside500 <= KISS_SEC, `${inside500.toFixed(1)} s inside 500 ft`);
  const [lead, two] = f.state.aircraft;
  const end = slantOf(lead, two);
  assert.ok(end >= 500 && end <= 1000, `ends ${Math.round(end)} ft away`);
});
