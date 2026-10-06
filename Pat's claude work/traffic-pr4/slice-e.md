# Touch-and-go: the one old test that expects the jump

Your approved spec item 21 says a touch-and-go no longer jumps back to the threshold. One old test, "Slice E" in `tests/unit/traffic/vector-sim.test.js` (lines 393-411), still expects the jump. It presses Touch-and-go on an aircraft at 3,500 ft on initial, then checks that the aircraft is instantly at 1,892 ft and 100 kt on the threshold.

With the fix, Touch-and-go pressed in the air makes the next landing a touch-and-go, and the aircraft stays where it is. Pressed on an aircraft that has landed, it rolls on and takes off from where it is.

## The test as it would read (exact wording)

```js
test('Slice E: a touch-and-go asked for in flight makes the next landing a touch-and-go, with no jump to the threshold', () => {
  const setup = structuredClone(MOOSE_JAW);
  setup.aircraft = [
    { id: 'A1', type: 'CT-156', routeId: 'PAT1', startIndex: 9, startsAtSec: 0 }
  ];
  const sim = createSim(setup, { seed: 1 });
  sim.stepTo(10);
  const before = sim.state().aircraft[0];

  // Command touch-and-go
  const ok = sim.command('A1', 'touch_and_go');
  assert.equal(ok, true);

  const aCmd = sim.state().aircraft[0];
  assert.equal(aCmd.intent, 'touch_and_go');
  assert.ok(Math.hypot(aCmd.x - before.x, aCmd.y - before.y) < 1, 'it stays where it is, no jump to the threshold (Traffic spec item 21)');
  assert.ok(Math.abs(aCmd.alt - before.alt) < 1, 'and at its height');
});
```
