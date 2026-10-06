# Refactor PR 4, last part: unused code out, and the tests that go with it

The plan's PR 4 line ends: "The 1 s slide, the pre-drawn High Key rail and the extra phase machines go." The first two are now unused, so this removes them. The tests listed below change only with your yes.

## What the code did, and why it is unused now

1. **The 1 s slide** (`enterBlending` and the BLENDING mode in `tick-aircraft.js`, a second copy of `enterBlending` in `breakout.js`, and `BLEND_DURATION_SEC = 1.0`). When a physics manoeuvre finished, it slid the aircraft in a straight line onto the nearest route point over exactly 1 s. Every button now hands over with the smooth join instead (`startJoin`, spec item 13a and Patrick 09:21Z). The only way left to reach the slide is a "climb to Low Key" command that has no button. That leftover hand-over switches to the smooth join too, so nothing slides anywhere.
2. **The pre-drawn High Key rail** (`stepHighKey` and its helpers in `high-key.js`: the 660 ft run-in point, the corridor, the pitch and speed schedules, the approach-rail and full-rail builders). It drew a path to High Key in advance and dragged the aircraft along it. The High Key button now flies the live climbing turn onto the 760 ft run-in (`buildHighKeyClimb`, merged in #259), which stays.
3. **The old PFL files** `pfl-rail.js` and `pfl-solver.js` (the scripted-height PFL circle and its solver). PR 3 replaced the PFL with `pfl.js`. The old High Key rail was their last user. The "PFL rail" branch in `tick-aircraft.js` also goes, since only the old High Key rail started it.

Checked: a scratch run of the Moose Jaw setup in four winds, pressing every button for every aircraft 90 s in and flying on for 5 minutes, saw only the RAIL and PHYSICS modes and never the old PFL rail. The plan (PR 3 line) and the flight-math list (`docs/modules/shared/flight-math.md`, rows 79, 80 and 84) already say these files go in PR 4.

Not in this change: the "extra phase machines" (the leftover physics phase logic in `tick-aircraft.js`, `flight-engine.js` and `nav-plans.js`). They still run for the breakout and the closed pattern, so they need their own look.

## Tests to retire (whole files or single tests)

They check code that is being deleted. What they were meant to protect is checked elsewhere, as listed.

- `tests/unit/traffic/high-key.test.js`, all 14 tests (old rail, the 660 ft run-in and its timing). The register says "Rewrite". That rewrite already exists: `high-key-climb.test.js` (arrives at High Key at its height, on the run-in, from every start) and `commands.test.js` ("climb_high_key … cuts engine at High Key, lands and flies a touch-and-go").
- `tests/unit/traffic/pfl-rail.test.js`, all 8 tests (old scripted PFL circle). The register says "Keep, with changes … The PFL gets its own review later". That review was PR 3: `pfl.test.js` now checks the PFL lands from each failure point, configuration timing per SMM 13.6 para 15 and 13.17 para 39, and the eject case.
- `tests/unit/traffic/pfl-solver.test.js`, all 15 tests (old PFL solver). Same as above. Its one manual citation (NFM p.3-9, glide) is for the old solver's own numbers; the live glide uses the shared glide ratio in `src/core`.
- `tests/unit/traffic/tick-aircraft.test.js`, four tests about the slide itself:
  - 2.5 "shouldEnterPhysics returns false during BLENDING when no command is active"
  - 5.1 "BLENDING mode interpolates smoothly over 1.0 second and finishes in RAIL mode"
  - 5.2 "BLENDING mode interpolates heading via shortest turn across 0°/360°"
  - 5.3 "Command issued during BLENDING cancels blend immediately and executes physics"

## Tests to rewrite (exact new wording)

`tests/unit/traffic/tick-aircraft.test.js` (register: "Keep, with changes"; the blend checks "become 'no jump'").

- 1.2 keeps its title and loses its BLENDING half. It becomes:
  ```js
  test('1.2 initMode preserves existing mode', () => {
    const aPhysics = { mode: 'PHYSICS' };
    initMode(aPhysics);
    assert.equal(aPhysics.mode, 'PHYSICS');
  });
  ```
- 4.2, title becomes `'4.2 PHYSICS break turn completion hands back to the rail with no jump'`. The same aircraft as today. The end becomes:
  ```js
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.equal(a.mode, 'RAIL', 'Break completion hands back to the rail');
  const before = { x: a.x, y: a.y };
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);
  // No jump: 140 KIAS is about 24 ft in 0.1 s; 50 ft leaves room for the join curve.
  assert.ok(Math.hypot(a.x - before.x, a.y - before.y) <= 50, 'no jump at the hand-back');
  ```
- 7.1, title becomes `'7.1 Go-around command enters physics, executes climbout, and hands back to the rail'`. The last check becomes:
  ```js
  assert.equal(a.mode, 'RAIL', 'Reaching crosswind in go-around hands back to the rail');
  assert.equal(a.command, null, 'Command must be cleared');
  ```
- 7.3, title becomes `'7.3 Multi-lap cumulative distance is preserved through the hand-back'`. The same aircraft as today. The end becomes:
  ```js
  handBackToRail(a, pat1);
  assert.equal(a.mode, 'RAIL');
  assert.ok(a.distFt >= 156923, 'Hand-back keeps the lap: cumulative distance on lap 2');
  tickAircraft(a, 0.1, { windFromDeg: 360, windKt: 0 }, pat1);
  assert.ok(a.distFt >= 156923, 'Cumulative distFt on lap 2 must be maintained');
  ```
- 8.2, title becomes `'8.2 handBackToRail uses semantic tags to pick the final approach rollout, not the initial leg'`. The same aircraft as today. The end becomes:
  ```js
  handBackToRail(a, taggedPat);
  assert.equal(a.mode, 'RAIL');
  assert.equal(a.tag, 'window', 'Hands back onto the final approach rollout (window tag)');
  ```
- 8.3, title only: `'8.3 tickAircraft preserves waypoint tag in RAIL mode'`.
- The file's header line "a finished break blends back over 1.0 s" becomes "a finished break hands back to the rail with no jump", and "the 1.0 s blend is a design choice;" is dropped.

`tests/unit/traffic/flight-invariants.test.js`

- Line 203 becomes `const VALID_MODES = [undefined, 'RAIL', 'PHYSICS'];` and the comment on line 213 drops `, 'BLENDING'`. This is stricter: a mode that no longer exists now fails the check.

## Docs changed in the same piece of work

The Traffic testing register (these rows marked "Retired, PR 4" with the reason), plan PR 4 ticked, flight-math rows 79, 80 and 84, and the Traffic spec, decisions and wind-shaped-flight-paths skill lines that still mention the slide or the old rail. Version label DADS v2.10.3.
