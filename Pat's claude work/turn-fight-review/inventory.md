# Fight Sim file inventory (main 1020583)

From a Sonnet reader's report, checked against my own reading of energy-sim.js. Paths are under `src/modules/turn-fight/`. Lines from `wc -l`. Total 7,148 lines (6,469 JavaScript, 679 CSS).

## Headline facts

- **Nothing outside `energy-sim.js` and `sim.js` writes aircraft state.** `playback.js` only calls the two step functions; views read.
- **One integrator in Energy mode:** core `stepPointMass` (RK4). Exceptions: straight flight before the pass (`flyStraight`, constant velocity) and the collision tumble (`energy-sim.js:1734-1767`, its own Euler step, its own drag constant 0.00052 and a literal 32.174, climb angle integrated separately from the velocity, impact at 0 ft MSL).
- **Fixed step 0.02 s** (`sim.js:23`). Playback speed changes the number of steps, not their size (`playback.js:22-25, 88-117`). A step over 10 ms ends the frame and drops the time (`playback.js:32, 111-115`).
- **Version labels disagree:** card `BFM · v2.2` (`src/shell/registry.js:33`), screen `TURN FIGHT v2.5` and pill `v2.5 · BFM AI` (`layout.js:97, 277`), all hard-coded.
- **No imports from other modules.** Only `src/core/`, `src/ui-kit/`, `src/storage/`. `energy-sim.js` imports `sim.js` for three constants.

## Files

| File | Lines | What it does | Notes |
|---|---|---|---|
| energy-sim.js | 2,252 | Energy engine: setup check, start placement, move picking (Auto, Tactical), 8 move controllers, pursuit and aim points, stall / over-G, one step, nose-on, chase, gun kill, collision, tumble | ~30 `TUNING` numbers labelled "model setting", no source, tuned so every merge speed reaches 160 ± 5 KIAS (`:160-186`, the archived MPT test's target). ~16 exports used only by tests. Header says the simple fight is "still pinned to V6" (stale). |
| sim.js | 412 | Simple fight: constant speed and G circles, merge, nose-on, chase, Climb and dive, 10-minute stop | Comments cite a V6 golden test that no longer exists (`:66, :117, :166`). `:35-36` says 4 G, defaults are 5. `HARVARD_DEFAULT_SETUP` unused. |
| state.js | 465 | Defaults, ranges, allowed values, setup builders, 5 presets, error text | Screen defaults override the engine's: 1.2 NM vs 2, Tactical vs Auto, ATA 5 vs 0. Presets use 250 KIAS with no source. `max: 316` literals instead of core `T6A_LIMITS.vmoKias` (`:210-226`). |
| geometry.js | 162 | Start geometry: ATA / AA / HCA, pass time, turn directions, notes, MERGE word | Its own `START_DEFAULTS` (ATA 0) differs from state.js's (ATA 5). |
| playback.js | 119 | Frame to steps, trails, run objects | See headline. |
| index.js | 343 | Mount, settings, frame loop, keys, 2D/3D, readout rate | Any fight setting change rebuilds the fight from T+0. |
| layout.js | 553 | Three columns, controls, toolbar, badges | "Climb and dive" checkbox and pitch boxes permanently hidden (`:129, :158`); comment at `:376` says greyed. Hard-coded "28 % low at 20,000 ft" (`:43`). |
| view.js | 328 | 2D top-down and start picture | Display only. |
| view3d.js | 988 | 3D view (three.js on demand), cameras, deck plane | Simple fight: works out its own bank `acos(1/G)` and its own turn direction (`:86-120, :145`). Energy: reads the engine's bank and climb. 3D pitch = flight path angle (no angle of attack). Own `wrapDeg`. |
| readouts.js | 148 | Simple result rows | Own "derived bank" `acos(1/G)` with a 1.01 cutoff where view3d uses 1 (`:113`). |
| energy-readouts.js | 178 | Energy result rows, flags, winner, why | No top-speed or deck flag yet (plan Step 2). |
| energy-graph.js | 223 | Altitude graph (uPlot) and text table | |
| profile.js | 143 | Side view for Climb and dive | Only reachable through the hidden checkbox. |
| readouts-panel.js | 54 | Readout table | |
| t6-limit.js | 27 | Warning text beside the G boxes | Uses core. |
| trails.js | 40 | Trail point every 0.1 s | |
| turn-fight.css | 679 | Styles | Not checked for dead rules. |
| README.md | 34 | Module readme | Cites a golden test that no longer exists. |

## Tests

458 unit tests in 18 files plus one helper (`tests/unit/turn-fight/`), and 64 e2e tests (`tests/e2e/turn-fight.spec.js`, 1,831 lines). Not run.

| File | Tests | Covers |
|---|---|---|
| energy-sim.test.js | 126 | Moves, flags, 5 G / 7 G, deck, top speed |
| sim.test.js | 71 | Simple fight |
| view3d.test.js | 36 | 3D pose, camera, trails |
| readouts.test.js | 27 | Result rows |
| energy-tactical.test.js | 26 | Tactical, pursuit, collision, terrain |
| geometry.test.js | 23 | Start geometry |
| state.test.js | 19 | Defaults, ranges |
| view.test.js | 18 | 2D |
| energy-state.test.js | 17 | Energy settings |
| energy-readouts.test.js | 16 | Energy rows |
| energy-below-mmo.test.js | 15 | Top speed by height |
| profile.test.js | 14 | Side view |
| energy-graph.test.js | 12 | Graph |
| energy-playback.test.js | 9 | Energy run |
| playback.test.js | 8 | Frames and steps |
| energy-layout.test.js / energy-view3d.test.js / t6-limit.test.js | 7 each | About text, Energy 3D, G warning |

Tests to look at under the rule book (lessons 1 and 3; the "references, not walls" rule):
- Exact times or recorded numbers: e2e `:126` (19.2°/s, 1,106 ft), `:170` (merge at T+16.4), `:1214-1215` (a whole recorded fight: "at T+30 each reads 162 KIAS at 10,605 ft and 3.3 G"); `playback.test.js:33` compares the run with the engine itself; `sim.test.js:62-68` pins V6's defaults.
- A published limit asserted as held: `energy-layout.test.js:82` (level MPT "held at the deck, not below it"), `energy-sim.test.js:492` (split S never over 5 G), `:828-845` (chaser never over 7 G), `:999, :1539` (never over VMO). Most say "the AI chooses", but they still assert the limit holds. `energy-below-mmo.test.js:203-211` does it right (a forced jet keeps flying past the limit).
- Tests that copy the code's own formula: `energy-sim.test.js:1284-1285` (nose-on cone).
- Literal 1.68781 and 6076.12 in about 25 test lines instead of core units.
