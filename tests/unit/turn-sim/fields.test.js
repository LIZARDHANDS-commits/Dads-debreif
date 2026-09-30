// The Turn Sim's words (fields.js) and the clock-cue status lines (readouts.js), for the clock and auto timing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { optionsOf, clockLabel, errorFields } from '../../../src/modules/turn-sim/fields.js';
import { cueStatus } from '../../../src/modules/turn-sim/readouts.js';
import { SETTINGS_RULES } from '../../../src/modules/turn-sim/settings.js';

test('the clock position menu reads Auto first and never NaN', () => {
  const options = optionsOf('clockCuePos', SETTINGS_RULES.clockCuePos);
  assert.equal(options[0].label, 'Auto (7 right, 5 left)');
  assert.deepEqual(options.find((o) => o.value === '5.5'), { value: '5.5', label: '5:30' });
  assert.equal(options.find((o) => o.value === '12').label, "12 o'clock");
  assert.ok(options.every((o) => !/NaN/.test(o.label)));
  assert.equal(clockLabel(7), "7 o'clock");
  const own = optionsOf('aircraft3.clockPos', SETTINGS_RULES['aircraft3.clockPos']);
  assert.deepEqual(own.slice(0, 2).map((o) => o.label), ['Same as setup', 'Auto (7 right, 5 left)']);
  assert.ok(own.every((o) => !/NaN/.test(o.label)));
});

test('the timing choices are all on offer: nothing is greyed out as coming later', () => {
  for (const o of optionsOf('timing', SETTINGS_RULES.timing)) assert.equal(o.disabled, undefined);
  assert.deepEqual(optionsOf('timing', SETTINGS_RULES.timing).map((o) => o.value), ['time', 'clock', 'auto']);
  assert.deepEqual(Object.keys(errorFields(2)).filter((k) => k.startsWith('clock')), ['clockTarget', 'clockPos']);
});

const state = (cues) => ({ aircraft: cues.map((cue, i) => ({ id: i + 1, cue })) });
const off = { mode: 'off', targetId: null, clockPos: 7, cantSee: false };

test('cue status lines follow the engine, and are empty unless Timing is the clock cue', () => {
  assert.deepEqual(cueStatus(state([off, off])), { lines: [], warning: null });
  const s = state([
    { mode: 'start', targetId: null, clockPos: 7, cantSee: false },
    { mode: 'waiting', targetId: 1, clockPos: 7, cantSee: false },
    { mode: 'triggered', targetId: 2, clockPos: 5.5, cantSee: false },
  ]);
  assert.deepEqual(cueStatus(s).lines.map((l) => l.text), [
    'starts the turn, nothing to wait for', "watching #1 for 7 o'clock", 'cue came from #2, turning',
  ]);
  assert.equal(cueStatus(s).warning, null);
});

test('#3 and #4 that cannot see a 5:30 cue in the offset box get the Q44c message', () => {
  const s = state([
    { mode: 'start', targetId: null, clockPos: 5.5, cantSee: false },
    { mode: 'waiting', targetId: 1, clockPos: 5.5, cantSee: false },
    { mode: 'waiting', targetId: 1, clockPos: 5.5, cantSee: true },
    { mode: 'waiting', targetId: 2, clockPos: 5.5, cantSee: true },
  ]);
  assert.equal(cueStatus(s).warning, "#3 and #4 can't see their clock cue in the box, so they turn on the rear element timing instead.");
  // N8: their lines agree with the warning, before and after the turn starts.
  assert.deepEqual(cueStatus(s).lines.map((l) => l.text), ['starts the turn, nothing to wait for', "watching #1 for 5:30", 'turns on the rear element timing', 'turns on the rear element timing']);
  s.aircraft[2].cue.mode = 'triggered';
  assert.equal(cueStatus(s).lines[2].text, 'turns on the rear element timing');
  s.aircraft.pop();
  assert.equal(cueStatus(s).warning, "#3 can't see its clock cue in the box, so it turns on the rear element timing instead.");
});

test('the offset box band lines say in the band or outside it, and are null without an offset box turn', async () => {
  const { offsetBandLines } = await import('../../../src/modules/turn-sim/readouts.js');
  assert.equal(offsetBandLines({ offsetBox: null }), null);
  const lines = offsetBandLines({ offsetBox: { minSec: 10, maxSec: 15, rear: [{ id: 3, delaySec: 12.5, outsideBand: false }, { id: 4, delaySec: 18, outsideBand: true }] } });
  assert.deepEqual(lines.map((l) => [l.id, l.outside, l.text]), [[3, false, '12.5 s, in the 10-15 s band'], [4, true, '18.0 s, outside 10-15 s']]);
  const solved = offsetBandLines({ offsetBox: { minSec: 10, maxSec: 15, rear: [{ id: 3, delaySec: 26.9, outsideBand: true }] } }, 'boxSlot');
  assert.equal(solved[0].text, '26.9 s, outside the SMM 10-15 s; solved so the box keeps its shape');
  // Box slot: #4 is information only (Fig 16.30), with no minus sign and no flag, even when it is far outside the band.
  const box = (four) => offsetBandLines({ offsetBox: { minSec: 10, maxSec: 15, rear: [{ id: 3, delaySec: 26.9, outsideBand: true }, { id: 4, delaySec: four, outsideBand: true }] } }, 'boxSlot');
  assert.deepEqual([box(16.1)[1].text, box(16.1)[1].outside, box(16.1)[1].info], ['turns 16.1 s after #3', false, true]);
  assert.deepEqual([box(-4.2)[1].text, box(-4.2)[1].outside], ['turns 4.2 s before #3', false]);
  assert.equal(box(-4.2)[0].outside, true); // #3 is still judged against the band
  // N6: in the hook #3 and #4 start together, so #4 says so instead of a time after #3.
  const hook = offsetBandLines({ offsetBox: { minSec: 10, maxSec: 15, rear: [{ id: 3, delaySec: 18.9, outsideBand: true }, { id: 4, delaySec: 18.9, outsideBand: true }] } }, 'boxSlot', 'hook90');
  assert.deepEqual([hook[1].text, hook[1].outside, hook[1].info], ['turns with #3', false, true]);
  assert.equal(hook[0].text, '18.9 s, outside the SMM 10-15 s; solved so the box keeps its shape');
  // The check plan's rear shift (36.7 s right, 1.0 s left) reads with the solved wording for both aircraft, whatever the #4 timing.
  const checkBox = (sec) => ({ offsetBox: { minSec: 10, maxSec: 15, rear: [{ id: 3, delaySec: sec, outsideBand: true }, { id: 4, delaySec: sec, outsideBand: true }] } });
  for (const timing of ['boxSlot', 'rearDelay']) {
    assert.deepEqual(offsetBandLines(checkBox(36.7), timing, 'delayed45away', true).map((l) => [l.id, l.outside, l.text]), [
      [3, true, '36.7 s, outside the SMM 10-15 s; solved so the box keeps its shape'],
      [4, true, '36.7 s, outside the SMM 10-15 s; solved so the box keeps its shape'],
    ]);
  }
  assert.equal(offsetBandLines(checkBox(1), 'boxSlot', 'delayed45away', true)[1].text, '1.0 s, outside the SMM 10-15 s; solved so the box keeps its shape');
  // Any other timing keeps both rows judged.
  const other = offsetBandLines({ offsetBox: { minSec: 10, maxSec: 15, rear: [{ id: 3, delaySec: 12, outsideBand: false }, { id: 4, delaySec: 18, outsideBand: true }] } }, 'rearDelay');
  assert.deepEqual(other.map((l) => l.text), ['12.0 s, in the 10-15 s band', '18.0 s, outside 10-15 s']);
});

test('the cross turn note says the second-half G and the roll-out spacing, and flags a clamp', async () => {
  const { crossTurnNote } = await import('../../../src/modules/turn-sim/readouts.js');
  assert.equal(crossTurnNote({ crossTurnSpacingNote: null }), null);
  assert.deepEqual(crossTurnNote({ crossTurnSpacingNote: { solvedG: 1.6, clamped: false, spacingFt: 6000 } }), { clamped: false, text: 'Second half at 1.6 G to roll out 6,000 ft apart' });
  const held = crossTurnNote({ crossTurnSpacingNote: { solvedG: 1.1, clamped: true, spacingFt: 18500 } });
  assert.equal(held.clamped, true);
  assert.match(held.text, /^Second half held at 1\.1 G, the most it can use: rolls out 18,500 ft apart$/);
});

test('planned crossings (state.crossings) read "Crossing: 300 ft vertical needed" for each pair, before anything is closer than 300 ft', async () => {
  const { separationFlags } = await import('../../../src/modules/turn-sim/readouts.js');
  const state = { aircraft: [], crossings: [{ a: 1, b: 3, minFt: 31 }, { a: 2, b: 4, minFt: 31 }] };
  assert.deepEqual(separationFlags(state, { formation: 'offsetBox', maneuver: 'hook90' }, []), [
    'Crossing: 300 ft vertical needed, #1 and #3', 'Crossing: 300 ft vertical needed, #2 and #4',
  ]);
  assert.deepEqual(separationFlags({ aircraft: [], crossings: [] }, { formation: 'offsetBox', maneuver: 'hook90' }, []), []);
});

test('N7: the Auto clock position reads 4:30 right and 7:30 left for the Delayed 45, and 7 right and 5 left otherwise', async () => {
  const { clockAutoLabel } = await import('../../../src/modules/turn-sim/fields.js');
  assert.equal(clockAutoLabel('delayed45away'), 'Auto (4:30 right, 7:30 left)');
  for (const maneuver of ['delayed90away', 'hook90', 'inplace90', 'check30']) assert.equal(clockAutoLabel(maneuver), 'Auto (7 right, 5 left)');
});
