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
- [ ] **5. The left side: define routes.** Routes list; + Pattern, + Entry, + Split as new routes linked to the selected pattern; selected route setup per kind; the labelled point table (keeps focus); + Point and Delete point; drag points on the map; links by point, not number, with linked ends moving together; Duplicate, Delete with its warning; Route options; Leg distances; turn-data flags for turns that don't fit.
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

- [ ] **7. Profiles and notes.** Save, Load, Delete with confirms; the built-in setup listed read-only; the last profile opens next time; each profile remembers its airfield; home field not CYMJ opens V6's generic pattern there (T2 default); profiles checked on read-back.
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

- [ ] **10. The decided changes.** One commit each, each starting from a failing test that states exactly what differs from V6: D46 true arcs between V6's turn points; the dice per aircraft, with Reset keeping the seed and New traffic picking a new one; one roll per split point (T1); the joined path at splits and joins; then any answers to T2 to T6.
  - Acceptance: the golden tests change only where the commit says; odds tests over 20,000 crossings; no aircraft moves more than one step's distance at a split or join.
  - Verify: `npm test`.
  - Dependencies: 2 (and 9 for the dice). Size S each.
  - Files: src/modules/traffic/{route,sim,dice}.js, the golden tests, data/moose-jaw.json (T1's odds)
- [ ] **11. Polish and sign-off checklist.** code-simplification and `/simplify` with the golden tests still green; README (R8); `docs/checklists/traffic.md` for Patrick or Dad to run against V6 (R21).
  - Acceptance: definition of done; the checklist covers every row of the spec's screen table and every fix.
  - Verify: `npm test`, `npm run test:e2e`, `npm run build`.
  - Dependencies: 10. Size S.
  - Files: src/modules/traffic/README.md, docs/checklists/traffic.md

**Checkpoint D:** tests pass; code-review-and-quality; open PR D; Patrick or Dad runs the checklist.
