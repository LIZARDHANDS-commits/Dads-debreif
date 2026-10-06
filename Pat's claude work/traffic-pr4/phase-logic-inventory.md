# Traffic PR 4: the leftover phase logic, inventory (4 Oct 2026)

Read-only inventory on main 1060c27, made by a Sonnet agent at Patrick's choice ("Opus here, Sonnet reads", 17:38Z). Nothing here is changed yet. The file:line references are as of that commit.

## Headline

- **Already on the one controller** (the circuit.js pilot plus the path follower): the go-around, High Key from anywhere, the PFL and the touch-and-go.
- **Still on the old machinery, and live:**
  - the closed pattern (`stepClosedPattern`, `tick-aircraft.js:220`);
  - the breakout (`stepBreakout`, `breakout.js:224`);
  - the generic integrator both of them use (`stepAircraft` and `calcBankTarget` in `flight-engine.js`), reached through `mode === 'PHYSICS'`.
- **The closed pattern is not what the spec says yet.** It aims at the perch rather than the downwind line (spec item 17). It climbs at 1 G, not the turn's real G. Its pitch is a fixed 10°, not worked out from the climb.
- **Dead from the app, reachable only from tests:**
  - most of `flight-engine.js` (the old circuit state machine `evaluatePhaseTransitions`, the intercept law, the break-deceleration copy, the cubic descent, the glide slope, the NRG glide);
  - most of `nav-plans.js`;
  - in `tick-aircraft.js`: `isManeuverComplete`, `handBackToRail`, the RAIL-to-PHYSICS switch, and most of the `setupPhysicsPlan` branches;
  - the `climb_low_key` command.

## Overlaps

- **The bank law is written five times.** In the closed pattern, `flight-engine.js` silently overrides the bank `tick-aircraft.js` asked for.
- **The intercept law is written four ways.**
- **There are two roll models:** `easeRoll` and the flat `rollToward`. `sim.js:47` holds a third, unused copy.
- **Other duplicates:** the breakout point and ENT1 are each written twice, and the break-deceleration curve and the climb rate also appear twice (the second copy of the climb rate assumes 1 G).

## Inline flight math that duplicates core

| Where | What | Core helper to use instead |
|---|---|---|
| `flight-engine.js` | Turn radius and turn rate from bank | `turnRadiusFromBankFt`, `turnRateFromBankRadPerSec` |
| `flight-engine.js` | Stall bank | `stallLimitG` (imported but never used) |
| `breakout.js` | Along and cross track | `legOffsetsFt` |
| `breakout.js`, `tick-aircraft.js` | Fixed pitch numbers | `pitchDegFromClimb` |
| `sim.js:44` | Its own `G_FTPS2` | `G_FTPS2` in units.js |

`flight-engine.js` also imports nine names it never uses.

## Tests that pin it

- **Pin the dead code (about 40 tests):** `flight-engine.test.js` (about 60), `flight-engine-challenge.test.js`, `flight-engine-stress.test.js`, `nav-plans.test.js`, and tick-aircraft 2.x, 7.1, 7.2 and 8.x. Retiring them needs Patrick's yes. The independent formula checks (for example turn rate = g·tan φ / v) should be kept as core tests.
- **Pin live code that a rewrite would change:** `breakout.test.js` (5) and `closed-pattern.test.js` (7).
- **Behaviour guards that survive a rewrite:** `smooth-transitions.test.js`, `flight-invariants.test.js`, `commands.test.js` (except `climb_low_key`), `vector-sim.test.js`, `high-key-climb.test.js`, `pfl.test.js` and `deconflict.test.js`.

## Suggested order

1. **Remove the dead code.** This changes no behaviour and carries low risk. The tests that pin the dead code need Patrick's yes to retire.
2. **Put the closed pattern on the controller** (`buildClosedPattern`, beside `buildHighKeyClimb`). This is the highest risk, because it changes the turn's shape on purpose.
3. **Put the breakout on the controller.** Fly it once as a path: the climbing turn to the breakout point, then a tangent rejoin onto the entry line. This also gives the deconfliction a predicted path for an aircraft that is breaking out. Medium risk.
4. **Remove PHYSICS mode, `stepAircraft`, `calcBankTarget` and the rest.** First fix `high-key.js:6` and `deconflict.js` `standingOf` (it reads `mode === 'PHYSICS'`), and decide whether `mode` stays.
5. **Tidy the leftovers:**
   - remove the "Fallback Doctrine" block (`sim.js:535-548`), the duplicate constants and the `climb_low_key` names;
   - update the flight-math list (lines 85-92) and the wind-shaped-flight-paths skill.

## Unsure

- Whether a user-made or imported route can carry `mode: 'physics'`.
- `g: 1.4` at 35° in nav-plans.js (nothing reads it).
- Whether the Fallback Doctrine block still changes anything visible.
- The exact test counts in the flight-engine files (counted from test headers).
