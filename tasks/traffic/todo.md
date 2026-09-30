# Traffic Pattern Sim: tasks

Spec waiting for Patrick's approval. Build starts once he approves it and the coordinator says it's the Traffic Sim's turn. See [`plan.md`](plan.md). Every task also meets `.claude/references/definition-of-done.md`, and the skill for each step is in the spec's Skills used.

- [ ] **1. Routes (`route.js`), pinned to V6.** Route shape (patterns, entries, splits, points with label, position, altitude, KT, G), V6's builders for a new pattern, entry and split, rounded paths, lengths, position at a distance, point distance and closest point, cached per route. Turn math only from `core`. V6's data read in with y flipped to north. The golden test is written first and fails until `route.js` exists (test-driven-development).
  - Acceptance: matches V6's `roundedPoints`, `navSegs`, `routeLen`, `pointProg`, `posOnRoute`, `closestProg` and the three builders within 1e-9 ft on every built-in route and the generated grid (R9).
  - Verify: `npm test`; `node --test tests/golden/traffic-route.test.js`.
  - Dependencies: none. Size M.
  - Files: src/modules/traffic/route.js, src/modules/traffic/data/moose-jaw.json, tests/golden/traffic-v6.js, tests/golden/traffic-route.test.js, tests/unit/traffic/route.test.js
- [ ] **2. The flying (`sim.js`), pinned to V6.** Spawning with delay and start point, moving at the route's speed and altitude, pattern loops and landing, splits, joining at the end of an entry or split, Done, conflicts and cautions, in fixed 0.05 s steps; the dice as a passed-in generator.
  - Acceptance: matches V6's `step`, `checkDecisions`, `handleRouteEnd` and `conflicts` step by step for an hour of sim time on the built-in setup and a spawned-traffic grid, with the same seeded dice, within 1e-9 ft; the same run at any frame rate.
  - Verify: `node --test tests/golden/traffic-sim.test.js`.
  - Dependencies: 1. Size M.
  - Files: src/modules/traffic/sim.js, src/modules/traffic/dice.js, tests/golden/traffic-sim.test.js, tests/unit/traffic/sim.test.js
- [ ] **3. Readouts.** Aircraft rows (Flying, Waiting with its start time, Landed, Done), conflict and caution lines, leg distances in ft and NM, the H:MM:SS clock, turn data, all as text with V6's rounding.
  - Acceptance: every number V6 writes to its readout, conflicts and distances tables matches on the golden runs.
  - Verify: golden comparison of V6's `updatePanels` text; unit tests of rounding and the clock past an hour.
  - Dependencies: 2. Size S.
  - Files: src/modules/traffic/readouts.js, tests/unit/traffic/readouts.test.js

**Checkpoint A:** tests pass; code-review-and-quality; open PR A.

- [ ] **4. On screen: playback and the map.** Module registered; three collapsible columns; the playback bar (Play, Pause, Reset, speed, clock, status); the 2D map with grid, routes, aircraft, labels, trails and bubbles from the built-in setup; Layers menu; Fit; Space and Home; the sim clock stops when the module closes.
  - Acceptance: the built-in setup opens and flies as V6 does side by side; R22 defaults; nothing overlaps at 1366 × 768 (R2); no frames or timers after closing (R4).
  - Verify: `npm test`; `npm run dev`; e2e smoke and switching.
  - Dependencies: 3. Size M.
  - Files: src/modules/traffic/{index,layout,map2d}.js, traffic.css, src/shell/registry.js (via the app frame thread)
- [ ] **5. The left side: define routes.** Routes list; + Pattern, + Entry, + Split as new routes linked to the selected pattern; selected route setup per kind; the labelled point table (keeps focus); + Point and Delete point; drag points on the map; links by point, not number, with linked ends moving together; an entry or split may join a point on any route (a type's own pattern joining shared straight-in legs); Duplicate, Delete with its warning; Route options; Leg distances; turn-data flags for turns that don't fit.
  - Acceptance: fixes #44 and the editor parts of #45 and #49 as the spec lists; the map redraws on each edit; keyboard-only editing works.
  - Verify: unit tests of links through insert, delete and drag; e2e: define a pattern and an entry.
  - Dependencies: 4. Size M.
  - Files: src/modules/traffic/editor.js, src/modules/traffic/route.js, tests/unit/traffic/editor-links.test.js, tests/e2e/traffic.spec.js (via the app frame thread)
- [ ] **6. The right side: spawn aircraft.** Spawner (type, route, start point from 1, delay), + Spawn, + Pair on the same route, Clear finished; the aircraft list with Edit; Conflicts with the Conflict limits panel.
  - Acceptance: fixes #45's spawner bugs; spawning while playing works; conflicts show text and colour.
  - Verify: e2e: spawn on an entry, watch it join the pattern (Patrick's left-define, right-spawn test); every control does something (R3).
  - Dependencies: 5. Size M.
  - Files: src/modules/traffic/aircraft.js, src/modules/traffic/readouts.js, tests/e2e/traffic.spec.js

**Checkpoint B:** tests pass, build under budget; code-review-and-quality; open PR B.

- [ ] **7. Profiles and notes.** Save, Load, Delete with confirms; the built-in setup listed read-only; the last profile opens next time; each profile remembers its airfield; home field not CYMJ opens V6's generic pattern there (its runway-number box and runway handles come in task 12, T2); profiles checked on read-back.
  - Acceptance: fixes #48; a blocked or full storage says so and nothing breaks; a hostile or oversized profile is refused with a message (security-and-hardening, `/security-review`).
  - Verify: unit tests of the profile checks; e2e save, reload, load.
  - Dependencies: 6. Size M.
  - Files: src/modules/traffic/profile.js, src/modules/traffic/index.js, tests/unit/traffic/profile.test.js
- [ ] **8. Satellite photo and 3D view.** The photo from ui-kit's tile loader with the Esri credit, the profile's alignment and Reset photo alignment; the 3D view with a true perspective camera, framed on the routes, drag, wheel and three buttons, caution rings in 3D.
  - Acceptance: fixes the photo and 3D parts of #49; with the network off the map says the photo needs a connection; smooth at 8× on 1920 × 1080 (performance log in the PR).
  - Verify: e2e offline; look at both against V6.
  - Dependencies: 4, and the tile loader in ui-kit. Size M.
  - Files: src/modules/traffic/{map2d,view3d}.js, tests/unit/traffic/view3d.test.js
- [ ] **9. Rewind and ±10 s.** Snapshots every 10 s of sim time; Rewind plays backward; −10 s and +10 s; `[` and `]`.
  - Acceptance: fixes #46: any rewind or step lands exactly on the state the run had at that time, at 0.25× and 8×; rewind at 1 hour of sim time under 50 ms.
  - Verify: unit tests (forward run vs rewind at many times and speeds); performance log.
  - Dependencies: 2, 4. Size S.
  - Files: src/modules/traffic/sim.js, src/modules/traffic/layout.js, tests/unit/traffic/rewind.test.js

**Checkpoint C:** tests pass; code-review-and-quality; open PR C.

- [ ] **10. Wind in the sim.** Indicated airspeed to true with `core`'s `isaDensityRatio`; `core`'s `windTriangle` (from the Flight math core thread); aircraft crab on the legs and move at ground speed; steady-bank turns with the roll-in moved for the wind, worked out in closed form, one path per route, type and wind; heading and crab on each aircraft state; turns that don't fit flagged with the bank and G they need; "can't hold this track" legs. Starts from failing tests (test-driven-development).
  - Acceptance: with the wind at 0 kt and fixed speeds the golden tests still pass unchanged; known answers (100 KIAS landing at 1,900 ft, 250°/20 kt, track 290°: crab 7.2° left, GS 87 kt; 220 KIAS at 3,500 ft, 60°, downwind to base with a 20 kt tailwind: roll-in 3,127 ft before the corner, 2,744 ft calm); every turn rolls out on its next leg in every wind direction; rewind still exact with a wind.
  - Verify: `npm test`; unit tests of a square pattern in each wind direction.
  - Dependencies: 2, 9, and `core/wind.js`. Size L (split into IAS, legs and turns if it grows past 5 files).
  - Files: src/modules/traffic/sim.js, src/modules/traffic/route.js, tests/unit/traffic/wind.test.js
- [ ] **11. Aircraft types and wind on screen.** `types.js` with the spec's type table and sources; the spawner's type sets the aircraft's speeds; the point table's speed as a phase (Entry, Pattern, Closed, Inner downwind, Straight-in base, Approach, Landing), Blend or a number, with + Pattern, + Entry and + Split setting phases from V6's labels; the wind boxes, wind arrow and corner label; GS and crab in the aircraft rows; crabbed aircraft symbols; the More detail wind readouts and rate of climb or descent (ft/min); wind per leg in Leg distances; the most-G flags in the turn data.
  - Acceptance: the built-in setup opens exactly as V6 until task 12 switches it to phases; a point set to Landing flies each type's Landing speed at its true airspeed; R22 (wind readouts only when a wind is set; the rest under More); colour never the only signal.
  - Verify: e2e: set a wind, spawn a CT-156 and a CT-114 on a new pattern, see different ground speeds and crab angles; accessibility checklist.
  - Dependencies: 6, 10. Size M.
  - Files: src/modules/traffic/{types,editor,aircraft,map2d,readouts}.js

**Checkpoint D:** tests pass; code-review-and-quality; open PR D.

- [ ] **12. The decided changes.** One commit each, each starting from a failing test that states exactly what differs from V6: D46 true arcs between V6's turn points; the dice per aircraft, with Reset keeping the seed and New traffic picking a new one; decision points with shares, and plans per aircraft in the spawner and Edit (T1); the joined path at splits and joins; indicated airspeed (T5); the built-in setup's points switched to phases (T5); the home-field starter pattern with its runway-number box and draggable runway ends (T2).
  - Acceptance: the golden tests change only where the commit says; odds tests over 20,000 crossings; no aircraft moves more than one step's distance at a split or join.
  - Verify: `npm test`.
  - Dependencies: 2 (and 9 for the dice). Size S each.
  - Files: src/modules/traffic/{route,sim,dice,aircraft,profile}.js, the golden tests, data/moose-jaw.json (T1's shares, T5's phases)
- [ ] **13. Polish and sign-off checklist.** code-simplification and `/simplify` with the golden tests still green; README (R8); `docs/checklists/traffic.md` for Patrick or Dad to run against V6 (R21).
  - Acceptance: definition of done; the checklist covers every row of the spec's screen table, every fix, and the wind.
  - Verify: `npm test`, `npm run test:e2e`, `npm run build`.
  - Dependencies: 12. Size S.
  - Files: src/modules/traffic/README.md, docs/checklists/traffic.md

**Checkpoint E:** tests pass; code-review-and-quality; open PR E; Patrick or Dad runs the checklist.

- [ ] **14. Redraw the Moose Jaw routes (T8).** Photo alignment at true scale (trim 1.0, checked against the runway length in the CFS); **Copy setup as text** under Profiles and notes; Patrick and Dad drag each point onto its ground reference and name it, set every pattern turn to 60°, 2 G (T6b), add the Grob's closer pattern at 3,000 ft joining the shared straight-in base legs, place the straight-in's level-off point, and paste the text in the Traffic thread; it becomes `data/moose-jaw.json`.
  - Acceptance: the redrawn setup lines up with the photo at trim 1.0; the change lists every route's lap time and length before and after; golden tests still pin V6's own setup from V6's data.
  - Verify: `npm test`; Patrick and Dad look at it on the live site.
  - Dependencies: 8, 12, and Patrick and Dad's time. Size S.
  - Files: src/modules/traffic/data/moose-jaw.json, src/modules/traffic/{profile,editor}.js, tests/unit/traffic/profile.test.js

**Checkpoint F:** redrawn setup merged.

- [ ] **15. The break and the final turn.** Break points (level 60°, 2 G, 180° at idle, speed bleeding to Inner downwind, stepped at 0.05 s); the wind rule for the break point; the perch abeam the Window; the descending 180° final turn with its bank from the downwind spacing and the wind worked in (perch moved, bank changed), flagged past 45°; the 3° glide path from the Window. Starts from failing tests.
  - Acceptance: known answers: 45° for a 2,800 ft spacing, 35° for 4,000 ft at 120 KIAS; roll-out on the centreline at the Window in any wind the bank limit allows; height on the glide path within 1 ft; V6's golden tests untouched.
  - Verify: `npm test`; unit tests in each wind direction.
  - Dependencies: 10, 11. Size M.
  - Files: src/modules/traffic/{route,sim,readouts}.js, tests/unit/traffic/break-final.test.js
- [ ] **16. PFLs.** The PFL route kind from a runway end (left or right), High, Low and Final Key, 120 KIAS gear down at 30°, 2,600 ft per circle, a high High Key handled by SMM 13.7, the circle held over the ground in wind with the bank flagged past 45°, key heights on the map and in the row; glide data in `types.js` (CT-156, CT-157 copying it).
  - Acceptance: calm air from 5,000 ft MSL: Low Key about 3,700 ft, Final Key about 3,050 ft; with a headwind the into-wind half loses more height; types without glide data can't fly a PFL and the screen says why.
  - Verify: `npm test`; e2e: build a PFL, spawn a CT-156 on it.
  - Dependencies: 15. Size M.
  - Files: src/modules/traffic/{route,sim,types,editor,map2d}.js, tests/unit/traffic/pfl.test.js
- [ ] **17. Simulated engine-outs.** Engine out on an aircraft row and as a plan step; the zoom to 125 KIAS (share of the speed-for-height trade, T10); the glide at 2 NM per 1,000 ft with wind; picking the reachable key and joining at a tangent; no zoom in the final turn or on a straight-in final; "can't make the runway: eject".
  - Acceptance: from 220 KIAS at 3,500 ft the zoom gains 70 % of about 1,600 ft; an aircraft out of reach of every key is flagged and removed; one in reach lands; rewind still exact.
  - Verify: `npm test`; e2e: engine out on downwind, watch it land.
  - Dependencies: 16. Size M.
  - Files: src/modules/traffic/{sim,aircraft,readouts}.js, tests/unit/traffic/engine-out.test.js

- [ ] **18. Traffic on final.** Extending downwind while the roll-out would be inside the final spacing of the aircraft ahead, rolling out on the 3° glide path wherever it meets it; the chance of missing the traffic (and a plan step for it); the aircraft on final moving over between the runways, flying a low approach at 200 ft and 120 KIAS and rejoining at the departure end.
  - Acceptance: with final busy, the aircraft extends and rolls out behind by at least the final spacing; with a forced miss, the one on final moves over and the conflict shows; rewind still exact.
  - Verify: `npm test`; unit tests with two aircraft set up to meet.
  - Dependencies: 15. Size M.
  - Files: src/modules/traffic/{sim,readouts}.js, tests/unit/traffic/final-traffic.test.js

**Checkpoint G:** tests pass; code-review-and-quality; open PR G.

- [ ] **19. The prediction and the threshold.** One function that predicts each aircraft's position a few seconds ahead on its current path, with the wind, and checks it against the conflict limits; the option at the threshold (full stop, touch-and-go, low approach, go-around) as a decision point; runway occupied (clearing time default 45 s) giving a low approach and go-around; the rules list with a checkbox each.
  - Acceptance: the prediction matches the sim's own run to within one step; shares at the threshold hold over 20,000 landings; an aircraft landing behind a full stop within 45 s goes around.
  - Verify: `npm test`.
  - Dependencies: 18. Size M.
  - Files: src/modules/traffic/{predict,sim,readouts}.js, tests/unit/traffic/predict.test.js, tests/unit/traffic/threshold.test.js
- [ ] **20. Break-out, fly-through, break at the departure end.** The three rules on their triggers, each with its row message.
  - Acceptance: a joining aircraft that would conflict breaks out 45° away, climbs above pattern height and rejoins; with a PFL crossing initial, the aircraft flies through and rejoins crosswind; rewind still exact.
  - Verify: `npm test`; unit tests with set-up pairs.
  - Dependencies: 19. Size M.
  - Files: src/modules/traffic/sim.js, tests/unit/traffic/rules.test.js
- [ ] **21. Closed pattern rules and flapless.** Closed pattern extend and unable-rejoin; the flapless aircraft option and plan step.
  - Acceptance: a closed pattern with downwind busy waits along the departure leg, and joins the normal pattern if there's still no room; a flapless CT-156 crosses the threshold at 110 KIAS.
  - Verify: `npm test`.
  - Dependencies: 19. Size S.
  - Files: src/modules/traffic/{sim,types,aircraft}.js, tests/unit/traffic/closed-flapless.test.js

**Checkpoint H:** tests pass; code-review-and-quality; open PR H.
