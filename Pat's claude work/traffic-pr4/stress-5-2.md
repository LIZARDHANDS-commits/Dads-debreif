# Breakout roll rate: the one old test that expects 90°/s

Your approved spec item 5 says the breakout's 90°/s roll becomes the same roll rate as everything else: 45°/s, an estimate. One old test, "STRESS 5.2" in `tests/unit/traffic/flight-engine-stress.test.js` (lines 471-516), still requires the breakout to roll faster than 45°/s, so it fails now. Its other check, never faster than 90°/s, still holds.

## The changed lines (exact wording)

Line 471 becomes:

```js
test('STRESS 5.2: the breakout rolls no faster than every other manoeuvre, 45°/s (Traffic spec item 5)', () => {
```

The two checks at the end (lines 505-515) become:

```js
  // One roll rate for every manoeuvre, the breakout included (Traffic spec item 5: 45°/s, an estimate).
  assert.ok(
    peakTacticalRollRate <= 45.0 + 1e-4,
    `Breakout peak roll rate ${peakTacticalRollRate.toFixed(2)}°/s exceeds the 45°/s roll rate`
  );
  assert.ok(
    peakTacticalRollRate >= 44.9,
    `Breakout roll rate should reach the 45°/s roll rate during the roll-in (reached ${peakTacticalRollRate.toFixed(2)}°/s)`
  );
```

The rest of the test (the aircraft, the 50 steps, the measurement) stays as it is.
