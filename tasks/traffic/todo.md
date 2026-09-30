# Traffic Pattern Sim: tasks

Spec approved by Patrick on 2026-09-30 (06:43Z). Build starts when the coordinator says it's the Traffic Sim's turn. See [`plan.md`](plan.md). Every task also meets `.claude/references/definition-of-done.md`, and the skill for each step is in the spec's Skills used.

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
- [ ] **5. The left side: define routes.** Routes list; + New route (Pattern, Entry, Split) making new routes linked to the selected pattern, no route selected on open; selected route setup per kind; the labelled point table (keeps focus); + Point and Delete point; drag points on the map; links by point, not number, with linked ends moving together; an entry or split may join a point on any route (a type's own pattern joining shared straight-in legs); Duplicate, Delete with its warning; Route options; Leg distances; turn-data flags for turns that don't fit.
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
- [ ] **8. Satellite photo and 3D view.** The photo from ui-kit's tile loader with the Esri credit, the profile's alignment and Reset photo alignment; the 3D view on ui-kit's shared `three-aircraft.js` (Patrick 07:51Z), loaded only when 3D is switched on: routes at their heights, the shared T-6 for the CT-156 and CT-157 and a simple shape for the other types, banking with their turns, framed on the routes, drag, wheel and three buttons, caution rings in 3D; 2D stays the default.
  - Acceptance: fixes the photo and 3D parts of #49; with the network off the map says the photo needs a connection; smooth at 8× on 1920 × 1080 (performance log in the PR).
  - Verify: e2e offline; look at both against V6.
  - Dependencies: 4; the tile loader is in ui-kit (`map-tiles.js`, #133); the 3D view uses the shared three.js piece once the app frame lands it. Size M.
  - Files: src/modules/traffic/{map2d,view3d}.js, tests/unit/traffic/view3d.test.js
- [ ] **9. Rewind and ±10 s.** Snapshots every 10 s of sim time; Rewind plays backward; −10 s and +10 s; `[` and `]`.
  - Acceptance: fixes #46: any rewind or step lands exactly on the state the run had at that time, at 0.25× and 8×; rewind at 1 hour of sim time under 50 ms.
  - Verify: unit tests (forward run vs rewind at many times and speeds); performance log.
  - Rewind fixes after the #216 re-check (traffic-recheck-216.md): a spawn, an aircraft's ✕ and Clear finished are timed events, so snapshots up to that step stay and the replay applies them at that step (RW-01, RW-02; the dice stay shared until task 12); the replay from 0 after a route, point or option edit is flown in frame-sized slices with "Replaying…" (RW-03, about 5 s at 30 aircraft and 1 hour, 36 s at 200).
  - Dependencies: 2, 4. Size S.
  - Files: src/modules/traffic/sim.js, src/modules/traffic/layout.js, tests/unit/traffic/rewind.test.js

**Checkpoint C:** tests pass; code-review-and-quality; open PR C.

- [ ] **10. Wind in the sim.** Indicated airspeed to true with `core`'s `iasToTasKt`; `core`'s `windTriangle` (from the Flight math core thread); aircraft crab on the legs and move at ground speed; steady-bank turns with the roll-in moved for the wind, worked out in closed form, one path per route, type and wind; heading and crab on each aircraft state; turns that don't fit flagged with the bank and G they need; "can't hold this track" legs. Starts from failing tests (test-driven-development).
  - Acceptance: with the wind at 0 kt and fixed speeds the golden tests still pass unchanged; known answers (100 KIAS landing at 1,900 ft, 250°/20 kt, track 290°: crab 7.2° left, GS 87 kt; 220 KIAS at 3,500 ft, 60°, downwind to base with a 20 kt tailwind: roll-in 3,127 ft before the corner, 2,744 ft calm); every turn rolls out on its next leg in every wind direction; rewind still exact with a wind.
  - Verify: `npm test`; unit tests of a square pattern in each wind direction.
  - Dependencies: 2, 9, `core/wind.js` and `core`'s `iasToTasKt`. Size L (split into IAS, legs and turns if it grows past 5 files).
  - Files: src/modules/traffic/sim.js, src/modules/traffic/route.js, tests/unit/traffic/wind.test.js
- [ ] **11. Aircraft types and wind on screen.** `types.js` with the spec's type table and sources; the spawner's type sets the aircraft's speeds; the point table's speed as a phase (Entry, Pattern, Closed, Inner downwind, Straight-in base, Approach, Landing), Blend or a number, with + Pattern, + Entry and + Split setting phases from V6's labels; the wind boxes, wind arrow and corner label; GS and crab in the aircraft rows; crabbed aircraft symbols; the More detail wind readouts and rate of climb or descent (ft/min); wind per leg in Leg distances; the most-G flags in the turn data.
  - Acceptance: the built-in setup opens exactly as V6 until task 12 switches it to phases; a point set to Landing flies each type's Landing speed at its true airspeed; R22 (wind readouts only when a wind is set; the rest under More); colour never the only signal.
  - Verify: e2e: set a wind, spawn a CT-156 and a CT-114 on a new pattern, see different ground speeds and crab angles; accessibility checklist.
  - Dependencies: 6, 10. Size M.
  - Files: src/modules/traffic/{types,editor,aircraft,map2d,readouts}.js

**Checkpoint D:** tests pass; code-review-and-quality; open PR D.

- [ ] **12. The decided changes.** One commit each, each starting from a failing test that states exactly what differs from V6: D46 true arcs between V6's turn points; the dice per aircraft, with Reset keeping the seed and New traffic picking a new one; decision points with shares, and plans per aircraft in the spawner and Edit (T1); the joined path at splits and joins; indicated airspeed (T5); the built-in setup's points switched to phases (T5); the home-field starter pattern with its runway-number box and draggable runway ends (T2); the built-in "new pattern" flies left-hand (D156), with the hand stored per runway (CYMJ 29L left, 11R right; EFIG p.151, 152, 211) and the runway number read as magnetic and turned to true (29 at CYMJ is 298° true; verification TR-11); the clock shows the true second (D157); a straight-in that joins at the pattern's first point rolls the landing decision once at the join (TR-08).
  - Acceptance: the golden tests change only where the commit says; odds tests over 20,000 crossings; no aircraft moves more than one step's distance at a split or join (TR-05: over 20 seeds on the built-in setup, no step moves an aircraft more than 2 × speed × 0.05 s + 5 ft); for every point, the bank the path flies is within 5° of the bank the turn data reports, or the point is flagged (TR-07); after stepTo(n) for n = 1 to 3,600 the clock reads n (TR-12); newPattern for runway 29 at CYMJ points along 298° true (TR-11).
  - Verify: `npm test`.
  - Dependencies: 2 (and 9 for the dice). Size S each.
  - Files: src/modules/traffic/{route,sim,dice,aircraft,profile}.js, the golden tests, data/moose-jaw.json (T1's shares, T5's phases)
- [ ] **13. Polish and sign-off checklist.** code-simplification and `/simplify` with the golden tests still green; README (R8); `docs/checklists/traffic.md` for Patrick or Dad to run against V6 (R21); a test that a fresh open has every value in the spec's Defaults table (Patrick, 07:13Z).
  - Acceptance: definition of done; the checklist covers every row of the spec's screen table, every fix, and the wind, and starts with a first open: press Play and traffic flies, with nothing typed and only the default controls showing.
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

- [ ] **15. The break and the final turn.** Break points (level 60°, 2 G, 180° at idle, speed bleeding to Inner downwind, stepped at 0.05 s); the wind rule for the break point; the perch abeam the Window; the descending 180° final turn with its bank from the downwind spacing and the wind worked in (perch moved, bank changed), flagged past 45°; the 3° glide path from the Window. Starts from failing tests. The built-in Moose Jaw Pattern 1 switches to the continuous descending final turn (verification TR-02: V6 holds 3,500 ft through the first 90° then drops 1,400 ft in about 430 ft of path, 72.9°), and so do Entry 4 (PFL, 33.5°) and Split 4 (30°); task 12's 45° corners alone still leave a 36° drop. The break rolls in about 2,000 ft past the threshold in calm air (TR-06, V6 3,065 ft). Straight-ins (Entry 2, Split 1) hold 2,700 ft to the 3° path and follow it down (TR-03, SMM 4.7 para 10, EFIG p.131).
  - Acceptance: known answers: 45° for a 2,800 ft spacing, 35° for 4,000 ft at 120 KIAS; roll-out on the centreline at the Window in any wind the bank limit allows; height on the glide path within 1 ft; in the final turn, height falls linearly with the angle turned (±20 ft); on each straight-in, height above the field at 0.75 NM is 240 ± 40 ft; the built-in break starts 2,000 ± 500 ft past the threshold; V6's golden tests untouched (they run on data/moose-jaw-v6.json).
  - Guard (added now as a `test.todo`, made a real test by this task): no flown slope steeper than 15° on any built-in route.
  - Verify: `npm test`; unit tests in each wind direction.
  - Dependencies: 10, 11. Size M.
  - Files: src/modules/traffic/{route,sim,readouts}.js, tests/unit/traffic/break-final.test.js
- [ ] **16. PFLs.** The PFL route kind from a runway end (left or right), High, Low and Final Key, 120 KIAS gear down at 30°, 2,600 ft per circle, a high High Key handled by SMM 13.7, the circle held over the ground in wind with the bank flagged past 45°, key heights on the map and in the row; glide data in `types.js` (CT-156, CT-157 copying it).
  - Acceptance: calm air from 5,000 ft MSL: Low Key about 3,700 ft, Final Key about 3,050 ft; with a headwind the into-wind half loses more height; types without glide data can't fly a PFL and the screen says why.
  - Verify: `npm test`; e2e: build a PFL, spawn a CT-156 on it.
  - Dependencies: 15. Size M.
  - Files: src/modules/traffic/{route,sim,types,editor,map2d}.js, tests/unit/traffic/pfl.test.js
- [ ] **17. Simulated engine-outs.** Engine out on an aircraft row and as a plan step; the zoom (`core`'s `zoomT6A`) easing into the 125 KIAS glide; the glide by configuration and prop (`core`'s `T6A_GLIDE` and `glideSinkFpm`: feathered 2 NM per 1,000 ft, windmilling 1 NM) with wind; picking the reachable key and joining at a tangent; no zoom in the final turn or on a straight-in final; "can't make the runway: eject".
  - Acceptance: from 220 KIAS at 3,500 ft the aircraft climbs by what `zoomT6A` gives (about 960 ft at 5,800 lb, NFM Fig 3-4); an aircraft out of reach of every key is flagged and removed; one in reach lands; rewind still exact.
  - Verify: `npm test`; e2e: engine out on downwind, watch it land.
  - Dependencies: 16, and `core`'s T-6A performance model (core tasks 14 to 17). Size M.
  - Files: src/modules/traffic/{sim,aircraft,readouts}.js, tests/unit/traffic/engine-out.test.js

- [ ] **18. Traffic on final.** Extending downwind while the roll-out would be inside the final spacing of the aircraft ahead, rolling out on the 3° glide path wherever it meets it; the chance of missing the traffic (and a plan step for it); the aircraft on final moving over between the runways, flying a low approach at 200 ft and 120 KIAS and rejoining at the departure end.
  - Acceptance: with final busy, the aircraft extends and rolls out behind by at least the final spacing; two Pattern 1 aircraft set to meet: the second rolls out at least 3,000 ft behind (verification TR-04); with a forced miss, the one on final moves over and the conflict shows; rewind still exact.
  - Verify: `npm test`; unit tests with two aircraft set up to meet.
  - Dependencies: 15. Size M.
  - Files: src/modules/traffic/{sim,readouts}.js, tests/unit/traffic/final-traffic.test.js

**Checkpoint G:** tests pass; code-review-and-quality; open PR G.

- [ ] **19. The prediction, the rules list and commands.** One function that predicts each aircraft's position a few seconds ahead on its current path, with the wind, and checks it against the conflict limits; task 18's extension switched onto it; the Rules list with a checkbox each; the Command menu on each row (Engine out now, Extend downwind, Miss the traffic, plus each rule's own command as it lands), with commands recorded by time so Rewind replays them, and "Clear commands after here"; plan steps for the same events.
  - Acceptance: the prediction matches the sim's own run to within one step; a command given at 3:10 replays at 3:10 after a rewind; switching a rule off stops it firing.
  - Verify: `npm test`; e2e: give an Engine out command, rewind, play, see it again.
  - Dependencies: 18. Size M.
  - Files: src/modules/traffic/{predict,sim,aircraft,readouts}.js, tests/unit/traffic/predict.test.js, tests/unit/traffic/commands.test.js
- [ ] **20. Fly-through and break at the departure end.** Both rules on their triggers, each with its row message, command and plan step.
  - Acceptance: with a PFL crossing initial the aircraft flies through and rejoins crosswind, giving way to downwind traffic; with traffic in the way of a normal break but not a late one, it breaks at the departure end; rewind still exact.
  - Verify: `npm test`; unit tests with set-up pairs.
  - Dependencies: 16, 19. Size M.
  - Files: src/modules/traffic/sim.js, tests/unit/traffic/fly-through.test.js
- [ ] **21. Closed pattern: extend, or unable.** The closed pattern waits along the departure leg while downwind is busy, and joins the normal pattern if there's still no room at the end of the departure leg.
  - Acceptance: set-up cases for both outcomes; the roll-out never lands inside the conflict limits of downwind traffic when the rule is on.
  - Verify: `npm test`.
  - Dependencies: 19. Size S.
  - Files: src/modules/traffic/sim.js, tests/unit/traffic/closed.test.js

**Checkpoint H:** tests pass; code-review-and-quality; open PR H.

- [ ] **22. Set up a conflict.** The tool: two aircraft (existing or new) with type, route and plan; the list of places their paths cross or come inside the limits, or a clicked point; the time and the gap; start points and delays found by flying each aircraft ahead on its own; "can't meet then" with the nearest time that works; the rules that could fire, with the offer to switch them off.
  - Acceptance: set-up conflicts happen at the chosen place within one step of the chosen time, calm and in wind, with an engine-out plan included; saved in the setup and replayed the same.
  - Verify: `npm test`; e2e: set up a conflict on final, play, see ⚠ CONFLICT at the time.
  - Dependencies: 19. Size M.
  - Files: src/modules/traffic/{conflict-setup,aircraft}.js, tests/unit/traffic/conflict-setup.test.js
- [ ] **23. Engine-out check and reach.** The what-if from a row or a typed energy state (zoom, optional airstart attempt costing about 1,200 ft, 30° turn, glide by configuration and prop in wind, tangent join), the per-key heights and margins and the verdict, drawn on the map; the Engine-out reach layer (green, yellow, red dashed with text) every 500 ft along each route.
  - Acceptance: the check agrees with flying the Engine out command from the same state to within 20 ft at each key; the downwind example gives about 4,460 ft after the zoom (`zoomT6A`, 5,800 lb); the layer redraws when the wind or type changes.
  - Verify: `npm test`; accessibility checklist for the layer.
  - Dependencies: 17. Size M.
  - Files: src/modules/traffic/{glide,map2d,aircraft,readouts}.js, tests/unit/traffic/glide.test.js

**Checkpoint I:** tests pass; code-review-and-quality; open PR I.

- [ ] **24. Cross-check against the manuals (Patrick, 2026-09-30 07:35Z).** After the Traffic engine and core's T-6A model are both merged: fly the sim through set scenarios and compare the results with the manuals' numbers. The scenarios are the spacing on final (the 3,000 ft gap and the extensions it causes, T11), the break timing (220 to 120 KIAS, the time and distance from the break to the perch, the downwind spacing), and the PFL key heights (High, Low and Final Key; 2,600 ft per circle). Core's thread does the glide and zoom scenarios. The output is a report table (scenario, sim, manual with page reference, difference) and it only reports: differences go to Patrick and Dad through the coordinator, and no number in the math changes without their sign-off.
  - Acceptance: every scenario runs from a fresh setup with fixed dice and gives the same report each time; each manual number carries its page reference (numbers only, no manual text, since the manuals are private).
  - Verify: `npm test` runs the scenarios; the report is attached to the PR.
  - Dependencies: 16, 18, and core's T-6A model. Size S.
  - Files: tests/crosscheck/traffic-scenarios.test.js, src/modules/traffic/data/crosscheck-scenarios.json
