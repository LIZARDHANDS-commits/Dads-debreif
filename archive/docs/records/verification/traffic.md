# Traffic Pattern Sim: verification findings

Checker: independent sub-agent. Checked on `origin/main` f35aaad (Traffic engine #183 merged; the screen pieces from earlier PRs are unchanged since 94b00a1). Nothing pushed, committed or edited in the repo. Scripts and outputs are in `scratchpad/findings/scripts/` (tr1 to tr17, tp1, tp2, v6run); screenshots in `/mnt/project-files/verification/shots/traffic/`.

Authorities used, in order: Patrick's logged decisions and SPEC-traffic, then the manuals (SMM ch. 4 paras 32 to 44 and para 71; EFIG p.131, 132, 135, 151, 152, 185, 186, 201, 202, 211, images read with the image viewer; `traffic-pattern-numbers.md`), then V6. Manual text is not quoted, only referenced.

## What exists, and what does not (read this first)

| Piece | State on main |
|---|---|
| Engine: `route.js`, `sim.js`, `dice.js`, `readouts.js`, `data/moose-jaw.json` (#183, f35aaad) | **Merged.** A faithful port of V6's simple model (a point flies its route at the speeds set on the points; no wind, no types, no avoiding action). Data equals V6's line-613 profile point for point (y flipped): 0 differences over 9 routes. 303 of 303 traffic tests pass (`node --test tests/golden/traffic-*.test.js tests/unit/traffic/*.test.js`). |
| Screen pieces: settings menu, playback bar, layout, 2D map | Merged earlier, **not registered as a module and not wired to the engine** (PR B is not on origin; `git ls-remote` shows only `claude/traffic-spec-j17uqw` = main). I drove them through my own harness page (`wt-others/harness/traffic.html`, untracked) with made-up aircraft positions, so map screenshots show harness aircraft, not engine state. |
| Not built yet (per `tasks/traffic/todo.md`) | Editor (5), spawner and aircraft list (6), profiles (7), photo and 3D (8), rewind (9), wind (10), types and phases (11), the decided changes (12): break/perch/final-turn rules, decision points, arcs, IAS, dice per aircraft, D156, D157; rules (extend downwind, move over, fly through), PFL, engine-out, real runway data (FF20). |

"Planned" below means the task list or spec already names the fix. Everything in the engine section is V6 behaviour pinned by a golden test on purpose.

## Summary

| Severity | Count | IDs |
|---|---|---|
| High | 2 | TR-01 (screen), TR-02 (engine, planned) |
| Medium | 8 | TR-03 to TR-09, TR-13 |
| Low | 3 | TR-10 to TR-12 |
| PILOT JUDGEMENT (with recommendation) | 5 | PJ-1 to PJ-5 |

Top items:
1. TR-01 Reset to defaults does nothing on the first click after typing in a settings box (the button moves 39 px between mouse down and mouse up).
2. TR-02 The final turn drops from 3,500 to 2,100 ft inside about 430 ft of path (73 degree dive, about 39,500 ft/min) instead of a continuous descending 180 degree turn.
3. TR-05 Aircraft jump up to 1,949 ft in one 0.05 s step when they take Split 2, and 679 ft when Split 3 rejoins.
4. TR-04 Nothing spaces or sequences traffic: a "+ Pair" 15 s apart on the straight-in ends up 2,536 ft apart on final (default final spacing is 3,000 ft), and joins drop aircraft onto traffic already on final (12 cautions in 20 seeds).
5. TR-07 The turn-data readout says the final turn is flown at 8 degrees of bank; the path actually flies it at 37 to 45 degrees (and the break at about 70 degrees, not 60).

## Findings

Every finding names the test that should have caught it.

### TR-01 (High) Reset to defaults swallows the first click
- Where: Traffic settings menu (right column), Reset to defaults button.
- Steps: open "Traffic settings"; click the Conflict: lateral box and type 350 (setting becomes 350); click "Reset to defaults" once with a real mouse.
- Expected: settings return to 200 ft (SPEC-ui-kit "Settings menu": Reset restores every default; SPEC-traffic Defaults table).
- Actual: still 350 after the click. The second click works. Event log (tr4.mjs): `pointerdown` and `mousedown` on the button, then `focusout` of the box, `focusin` on the button, then `click` lands on `panel-body`, not the button. Cause (tr5.mjs): the one-line hint under a focused box is only shown while focused (traffic.css lines 367 to 381, hover or focus-within), so the button sits at y 647 with a box focused and y 608 with none; pressing it blurs the box, the hint collapses, and the button moves 39 px up from under the pointer before mouse up. Every control below a focused box shifts the same way.
- Screenshots: `/mnt/project-files/verification/shots/traffic/05-settings-reset.png`, `/mnt/project-files/verification/shots/traffic/07-settings-focus-shift.png`, `/mnt/project-files/verification/shots/traffic/04-settings-open-1366.png`.
- Known or planned: no.
- Missing test: `tests/unit/traffic/settings-panel.test.js` has no layout test, and no e2e exists (`tests/e2e/` has no traffic spec). Add: "type in a box, then a real mouse down/up on Reset resets it" (e2e), and "the Reset button's top edge is the same with and without a box focused" (bounding-rect check). Both would fail today.

### TR-02 (High, planned) The final turn descends 1,400 ft in about 430 ft of path
- Where: engine, built-in Pattern 1, points 12 to 13 (`route.js` rounding keeps each corner's height for the whole curve, so the drop falls on the short straight between two curves).
- Steps: `createSim` on `moose-jaw.json`, read `posOnRoute(PAT1, d)` along the last 4 NM (`tr8.mjs`).
- Expected: SMM 4.19 para 43 (a continuous descending 180 degree turn from the perch to the window, about 20 % torque); spec "Height" line (falls evenly around the turn); window 3/4 NM out at about 2,100 to 2,200 ft, 3 degree glide (SMM 4.7 para 10, EFIG p.151, 152).
- Actual: altitude holds 3,500 ft through the first 90 degrees of the turn, then falls to 2,100 ft over 430 ft of path at 120 kt: steepest slope 72.9 degrees, about 39,500 ft/min. The Alt column, and later the 3D view, show a 1,400 ft plunge in about 2 s.
- Screenshot: none (2D map has no vertical view and the screen is not wired); numbers from `scripts/tr8.mjs`.
- Known or planned: yes. Spec "The break, the perch and the final turn" and tasks 11 to 12 (phases, "Final-turn points get 45 degrees") replace it; V6 behaviour is pinned by `traffic-route.test.js`.
- Missing test: `tests/unit/traffic/route.test.js`: "no leg of the built-in setup descends steeper than 8 degrees (or 1,500 ft/min at its speed)". A plausibility guard next to the golden pin would have named this.

### TR-03 (Medium, planned) Straight-in finals are not on a 3 degree path, and the two straight-ins differ
- Where: engine, Entry 2 and Split 1 (routes to the threshold).
- Expected: level at 2,700 ft on base, intercept the 3 degree glide path (SMM 4.5 para 8, 4.7 para 10; EFIG p.131: intercept the 3 degree glide path at about 25% torque; EFIG p.130 intercept about 3.4 DME on 29).
- Actual (`tr7.mjs`, `tp2.mjs`): Entry 2 holds 2,700 ft to 4.1 NM out then descends 820 ft in a straight 1.9 degree line to the threshold, so at 2.6 NM (where 3 degrees meets 2,700 ft) it is at about 2,395 ft, roughly 300 ft below the 3 degree path. Split 1 holds 2,700 ft to 2.06 NM, then descends at 3.7 degrees, above the 3 degree path until the threshold (60 ft high at the window).
- Known or planned: yes (spec "3 degree final", tasks 11 and 12). V6 data.
- Missing test: `tests/unit/traffic/route.test.js`: "on each straight-in route, height above the field at 0.75 NM is 240 ft plus or minus 40" (spec window) would fail for both.

### TR-04 (Medium, planned) No spacing or sequencing anywhere
- Where: engine, `sim.js` (aircraft never slow, extend or wait; joins and splits ignore traffic).
- Steps and numbers (`tr14.mjs`): (A) two CT-156 on Entry 2, 15 s apart (the "+ Pair" default): closest approach on final 2,536 ft, below the 3,000 ft Final spacing default in the Defaults table (T11) and below the 3,000 ft the spec wants; above the 2,000 ft stream-landing minimum in EFIG p.393. (B) two aircraft 15 s apart on initial at 220 kt end up 1,870 ft apart after the break slow-down (5,570 ft apart on initial). (C) ten aircraft on Pattern 1, 20 s apart, 30 min, 20 seeds: 0 red conflicts, 12 cautions, closest 236 ft; 11 of the 12 are Split 4 rejoining at the threshold while a Pattern 1 aircraft is on final (Split 4 has a 2,620 ft, 17.6 degree drop onto the threshold).
- Expected: SMM 4.15 para 35 (aircraft in the pattern have right of way; rejoin with 1 NM), 4.19 para 43 (lookout for traffic on final); spec R25 (extend downwind when final is busy) and T11.
- Known or planned: yes (rules are tasks after 12; "Automatic sequencing" is listed as a later idea). The current screen has no rules controls on by default, so nothing misleads; the Final spacing and Rules boxes exist in `defaults.js` and are hidden unless `available.rules` is passed.
- Missing test: `tests/unit/traffic/sim.test.js`: "a Pair 15 s apart on the straight-in keeps at least `finalSpacingFt` on final" (fails now; becomes the acceptance test for the rule).

### TR-05 (Medium, planned) Aircraft jump at splits and joins
- Where: engine, `sim.js` `checkDecisions` (split) and `handleRouteEnd` (join).
- Steps (`tr10.mjs`, 20 seeds, 90 min, nobody landing): compare the position before and after each route change. A step is about 10 to 18 ft.
- Actual: Pattern 1 to Split 2: 1,949 to 1,952 ft in one step (19 times). Split 3 to Pattern 1: 679 ft (39 times). Split 2 to Pattern 1: 190 ft (12 times). All others 5 to 10 ft. Heading changes of 35 to 48 degrees in the same step at Split 3 and Split 4 starts. Cause: the split trigger uses `pointDistFt` (where the turn at the point starts) but the split's first point is the corner itself, and a join uses `closestDistFt` to the corner while the rounded path cuts it; the jump is the corner-cutting distance (45 % of the leg).
- Expected: `tasks/traffic/todo.md` task 12 acceptance: "no aircraft moves more than one step's distance at a split or join".
- Known or planned: yes (task 12, "the joined path at splits and joins").
- Missing test: `tests/golden/traffic-sim-rules.test.js` pins V6's jump ("every split always taken: joins at V6's closest point") but nothing states the continuity requirement. Add `tests/unit/traffic/sim.test.js`: "on the built-in setup over 20 seeds, no step moves an aircraft more than 2 x speed x 0.05 s plus 5 ft" (skipped until task 12, listed as a todo).

### TR-06 (Medium, planned) The break rolls in about 1,000 ft late
- Where: engine, Pattern 1 points 10 to 11.
- Expected: roll into 60 degrees of bank about 2,000 ft past the threshold with a 10 kt headwind (SMM 4.17 para 39; EFIG p.151, 152, 185: break about 2,000 ft down the runway at 3,000 ft MSL, 60 degrees and 2 G, PCL to idle).
- Actual (`tr7.mjs`): the first heading change after the threshold is at 3,065 ft past it (the corner point is at 4,669 ft). No wind in the engine, so this is the calm-air default.
- Passes in the same turn: rolls out on downwind 3,556 ft before abeam the threshold (SMM 4.17 para 39: parallel before abeam the threshold), 140 kt at the start of downwind then 120 kt (SMM 4.17 paras 40, 41: configure below 147, ideal 120), inner downwind 4,100 to 4,268 ft from the runway.
- Known or planned: yes (break rule, spec "The overhead break", T8 redraw, T10).
- Missing test: `tests/unit/traffic/route.test.js`: "the built-in break starts 2,000 ft plus or minus 500 past the threshold" (fails now).

### TR-07 (Medium, planned) Turn data says one thing, the path flies another
- Where: engine `pointTurn` / `turnAtPoint` (the "Turn data (radius and bank)" layer and the Points table) against the rounded path (`tr16.mjs`: tightest flown radius between path vertices, bank from v squared over g R).
- Actual: point 12 (final turn start, 120 kt, 1 G): readout R 8,993 ft, bank 8 degrees; flown radius 1,284 ft, bank 45 degrees. Point 13: readout 7,557 ft / 8 degrees, flown 1,443 ft / 37 degrees. Point 11: readout 12,241 ft / 8 degrees, flown 1,104 ft / 58 degrees. Break at point 10 (220 kt, 2 G): readout 2,474 ft / 60 degrees, flown 1,565 ft / 70 degrees (2.9 G) because the leg is too short for the radius and the 45 % cap cuts it. Corners 4, 5, 7 (readout 60 degrees) are flown at 67 to 68 degrees because V6's quadratic curve is tighter than the nominal radius at its middle.
- Expected: SMM 4.14 para 33 and 4.17 para 39 (60 degrees, do not vary bank in the break, 4.18 para 42); 4.19 para 43 (final turn up to 45 degrees). The layer is off by default, so it misleads only when switched on.
- Known or planned: yes (D46 true arcs, Q3 and T6b flags, task 5 "turn-data flags for turns that don't fit").
- Missing test: `tests/unit/traffic/route.test.js`: "for every point, the bank the path actually flies is within 5 degrees of the bank `pointTurn` reports, or the point is flagged".

### TR-08 (Medium, planned) Straight-in traffic never gets a landing decision on arrival
- Where: engine `checkDecisions` (only rolls the dice when a pattern lap wraps) and `handleRouteEnd` (a join puts the aircraft at the pattern's start).
- Steps (`tr17.mjs`, 40 seeds): spawn one aircraft on Entry 2, fly 25 min.
- Actual: 1 of 40 landed on arrival; 39 flew on through the threshold at 100 kt to 140 kt and became pattern traffic (27 into upwind, the rest onto Split 3). So a straight-in is a touch-and-go 97 % of the time and the status never reads Landed until a later lap.
- Expected: a straight-in ends in a landing or a go-around (SMM 4.16 para 36 then 4.8 to 4.9; spec: decision points with shares, T1).
- Known or planned: yes (T1 decision points, task 12).
- Missing test: `tests/unit/traffic/sim.test.js`: "an aircraft that joins the pattern at its first point rolls the landing dice once at the join".

### TR-09 (Medium, not built) The map draws no runway, and there is no runway data
- Where: 2D map (`map2d.js`) draws routes, points, aircraft, bubbles, wind arrow and grid only; `src/airfields/catalog.js` has no runway data (CYMJ elevation 1,892 ft there against V6's 1,880 ft threshold point).
- Expected: the brief asked for the Moose Jaw runways drawn where they are. SPEC-traffic keeps real runway data as future features FF20 and FF21, and the satellite photo (task 8) is what shows the runways today.
- Actual: the only hint of the runway is the Threshold/Final to Departure End segment of Pattern 1 (8,150 ft on 298.4 degrees true; 29 is 290 degrees magnetic, consistent with about 8 degrees east variation).
- Screenshot: `/mnt/project-files/verification/shots/traffic/01-default-1440.png`.
- Known or planned: yes (tasks 8, FF20). Not a bug, but until the photo lands a first-time viewer sees a pattern with no runway on it.
- Missing test: none for a feature not built; add to the sign-off checklist (task 13) "the runway is visible under the pattern".

### TR-13 (Medium) "Conflict bubbles" and "Caution rings" are on by default but cannot be seen at the default zoom
- Where: 2D map, Layers menu. The circles are drawn at true size (200 ft and 500 ft radius, V6 does the same). At the default framing (0.0043 px/ft at 1366 wide) that is 0.85 px and 2.1 px, hidden under the 14 px aircraft symbol (`tr19.mjs`).
- Steps: `harness/traffic.html?conf=1`, toggle each layer at the default zoom: the canvas does not change. Zoom in with the keyboard (+) until the grid reads 100 ft and the toggle changes the canvas; the red bubble then shows (`/mnt/project-files/verification/shots/traffic/13-zoomed-conflict.png`).
- Expected: a switch that is on and does nothing you can see looks broken (R3). The CONFLICT and CAUTION words beside the aircraft are the only signal at the default zoom.
- Known or planned: not mentioned in the spec or the todo list. V6 draws the same real-size circles.
- Missing test: `tests/unit/traffic/map2d.test.js`: "at the fitted zoom a conflict bubble is drawn with a radius of at least 6 px (a minimum size), or the layer's hint says to zoom in".

### TR-10 (Low) Labels overlap around the runway at the default zoom
- Where: 2D map with Pattern 1 selected. Point labels ("4 Upwind", "New Point"), height/speed labels and the CONFLICT/CAUTION tags stack on top of each other near the runway (`/mnt/project-files/verification/shots/traffic/02-pattern1-selected-1366.png`, `/mnt/project-files/verification/shots/traffic/03-layers-menu-1366.png`). Aircraft here are harness placeholders, so read this as label layout only.
- Expected: readable labels (R2, nothing covered). Known: no.
- Missing test: `tests/unit/traffic/map2d.test.js`: "labels for points within 40 px of each other are not all drawn" (declutter rule), or a visual test.

### TR-11 (Low) The generic new pattern is a true 290 degrees, right-hand
- Where: `route.js` `newPattern`: heading 290 treated as a true compass heading; circuit clockwise (`tr13.mjs`: signed area clockwise). Moose Jaw runway 29 is 298.4 degrees true. Only matters when the runway-number box (T2) starts driving it: the runway number must be converted from magnetic to true.
- Known: D156 (left-hand flip, later commit); the true-versus-magnetic point is not mentioned.
- Missing test: `tests/unit/traffic/route.test.js`: "newPattern for runway 29 at CYMJ points along 298 degrees true".

### TR-12 (Low) Clock reads a second early on 54 % of seconds
- Where: `readouts.js` `clockText`. Over the first hour 1,927 of 3,600 whole seconds read one second early (3 s reads 0:00:02) (`tr15.mjs`). Known and logged as D157 (later commit); the premise is true. Missing test: `tests/unit/traffic/readouts.test.js`: "after stepTo(n) for n = 1 to 3,600 the clock reads n" (should be added with D157).

## Pattern geometry and sequencing against the SMM and EFIG (engine data, built-in Pattern 1)

Measured on the rounded path the engine flies (`tr7.mjs`). Distances along and left of the runway centreline; "along" positive toward the departure end.

| Item | Manual | Engine | Result |
|---|---|---|---|
| Circuit side for 29L | Left: EFIG p.151, p.185 ("initial left", "go left"); p.211 racetrack on the outer side | All turns are left turns; downwind is 14,500 ft to the left | Pass |
| Circuit side for 11R | Right: EFIG p.152 ("initial right", "go right"), SMM Fig 4.11, 4.13 | Not present (only runway 29 built) | Not built (see PJ-4) |
| Order of legs | Upwind, crosswind, downwind, base, 45 degree leg, initial, break, downwind, perch, final (SMM 4.14 para 33, 4.17 to 4.19; EFIG p.185) | Points 1 to 13 in exactly that order | Pass |
| 45 degree heading change on the entry leg | SMM 4.14 para 33 | base 028, 45 degree leg 343 to initial 298: 45 degrees each | Pass |
| Pattern speed and height | 220 KIAS, 3,000 ft MSL (SMM 4.14 para 32; EFIG p.212) | 220 kt, 3,500 ft | Differs by Patrick's decision (D109, Q1). Pass |
| Climb-out speeds | 140 best rate, 180 normal (SMM 3.14 para 35; EFIG p.126) | 140 kt at the departure end, 180, then 220 | Pass |
| Rejoin | On the extended leg, pattern height and speed, at least 1 NM out (SMM 4.15 para 35) | Entry 1 last leg 1.61 NM, Entry 3 2.61 NM, all at 220 kt / 3,500 ft, on extended legs | Pass |
| Break point | About 2,000 ft past the threshold, 60/2 (SMM 4.17 para 39) | 3,065 ft, bank 70 flown | TR-06, TR-07 |
| Break roll-out | Parallel before abeam the threshold | 3,556 ft before abeam | Pass |
| Downwind speed after the break | Below 147, ideal 120 (SMM 4.17 paras 40, 41) | 140 then 120 | Pass |
| Perch | Abeam the window, 120 KIAS, up to 45 degrees (SMM 4.19 para 43; EFIG p.151) | Turn starts 5,192 ft from the threshold (window is 4,557 ft), 120 kt, 45 degrees flown | Pass within 0.1 NM |
| Roll-out on the centreline | Window at 3/4 NM, 3 degrees, about 2,100 to 2,200 ft at Moose Jaw (SMM 4.7 para 12) | Centreline reached 0.83 NM out; 2,087 ft at 0.75 NM (207 ft AGL against 239) | Pass (13 ft under the lower bound) |
| Final approach speed | 100 to 110 (SMM Table 4.1) | 110 to 100 kt | Pass |
| Descent | Continuous, from the perch | 1,400 ft in 430 ft | TR-02 |
| Straight-in | Descend to 300 ft below pattern height at 220 KIAS, 1 NM past the base leg of the break pattern, 45 degree turn, base below 147 (SMM 4.16 para 36; EFIG p.131) | Split 1 leaves abeam the departure end, descends 800 ft at 220 kt (pattern is 3,500 ft, not 3,000, so 800 not 300), turns to base 0.83 NM beyond the break pattern's base leg, base at 140 then 120 kt, then 45 degree leg, then final | Pass; slope TR-03 |
| Base height | 2,700 ft (SMM 4.5 para 8; EFIG p.131) | 2,700 ft | Pass |
| Closed pattern | Min 140 KIAS past the departure end, climbing turn 20 degrees pitch at most, level 140 KIAS downwind (EFIG p.135) | Split 3: 140 kt at the departure end, 12.8 degree climb, 150 then 140 kt; joins downwind at 3,500 ft | Pass (height follows D109) |
| PFL keys | High Key 5,000 to 6,000 ft over the threshold; Low Key about 3,700 ft, 1 NM abeam (SMM 4.28 para 71; 13.5, 13.8) | Entry 4: 5,000 ft over the threshold, 3,700 ft at 1.34 NM abeam, 120 kt | Pass; Low Key 0.34 NM wide |
| Conflict limits | Rejoining traffic can be 300 ft above (SMM 4.16 para 37) | Red 200 / 200 ft, caution 500 / 500 ft | Pass; at 300 ft separation the caution ring will show (by design) |
| Turn radius at 220 KIAS, 2 G | 2,744 ft at 3,500 ft (spec, SMM 4.17) | 2,474 ft (KIAS used as TAS) | Planned (T5) |

Sequencing summary: routes are followed in the right order and at the right speeds, but the sim has no notion of "who follows whom". Aircraft start at fixed times, decide land or go on with a 20 % roll at the pattern start, take splits at 50 %, and rejoin at fixed points; separation is whatever falls out (TR-04, TR-05, TR-08).

## PILOT JUDGEMENT (recommendation given for each)

- PJ-1 Inner downwind 4,268 ft (0.70 NM) from the runway: the SMM gives no figure (EFIG says fuel cap over the runway). Question: is that the right spacing for a 45 degree final turn at 120 KIAS? Flown radius 1,284 ft is 45 degrees of bank, at the limit. Recommendation: keep V6's figure until the T8 redraw with the photo overlay, then tighten to about 4,000 ft if Dad prefers less than 45 degrees.
- PJ-2 Outer pattern size (2.4 NM out, 8.6 NM long): about 20 % wider and 12 % shorter than the racetrack proportions in EFIG p.211 if the runway box is 8,150 ft (picture read by eye; cannot be better than plus or minus 20 %). Recommendation: keep; ask Dad to lay the photo under it (task 8) and correct at T8.
- PJ-3 Default break point: 2,000 ft (SMM) or V6's 3,065 ft. Recommendation: 2,000 ft with the wind rule already in the spec.
- PJ-4 D156 (built-in "new pattern" flies left-hand): consistent with SMM Fig 4.18, which shows the standard circuit as left-hand and EFIG p.151 (29L left). It does not hold for Moose Jaw's 11R, which is right-hand (EFIG p.152, SMM Fig 4.11 and 4.13), and the outer-runway pattern always lies on the same (south-west) side of the pair. Recommendation: keep D156 as the default hand, but let the runway-number box set it at CYMJ (29 left, 11 right) rather than a single global "left".
- PJ-5 Straight-in slope (TR-03): 3 degrees from where it meets 2,700 ft (about 2.6 NM), or V6's straight line from 4.1 NM. Recommendation: 3 degrees from the intercept, as the spec says.

## Logged decisions checked (decisions-for-review.md)

- D156 (left-hand flip, later commit): premise verified (`tr13.mjs`, V6 builder draws clockwise). No contradiction with SMM; see PJ-4 for the 11R case.
- D157 (true-second clock, later commit): premise verified, 1,927 of 3,600 seconds read early. No contradiction.
- No logged call for Traffic contradicts the SMM, the manuals or the spec.

## What passed

- Defaults: every value in `defaults.js` equals the SPEC-traffic Defaults table (speed 8x, calm wind 360/0, layers, photo 100 %, route options, conflict 200/200/500/500, final spacing 3,000 ft, miss chance 10 %, break none, rules all on, engine-out reach off).
- Engine data equals V6's built-in profile (0 differences). The engine is deterministic for a seed (the golden tests compare it step by step with V6 for an hour).
- All 303 traffic tests pass.
- Screen pieces at 1366x768, 1920x1080, 1100x700: no overlaps, no horizontal scroll, no console errors. In the Layers menu, Height and speed labels, Route points and Leg distances each change the drawing when toggled (Trails cannot be seen in the harness, which has no trails; Turn data needs the glue in PR B to pass each point's radius and bank, `map2d.js` `turnDataText`; the bubble and ring toggles: see TR-13). Speed options 0.25x to 8x work. Wind boxes reject 0 and 361 for direction and 61 and -3 for speed with a message; a good value goes through. Play, Pause, Reset change the status word and the hint. Invalid conflict values (-5, blank) show "Enter a number from 0 to 20,000 ft." and keep the last good setting. Manual turn radius greys out while "from speed and G" is on.
- Every control on the harness with `all=1` does something or is honestly absent (Rewind, plus and minus 10 s, 2D/3D, wind, photo and rules only appear when their feature is available).

## Not verified

3D view, photo, spawner, editor, profiles: not built. Wind, types and phases: not built. Interaction between the map and real engine state: the screen is not wired yet.

## Audit (second checker, Opus, ~10:30Z; engine at f35aaad, 303/303 tests pass)

Every engine item is V6 behaviour pinned on purpose (golden tests); V6 fixes land in later tasks. The one real code bug is TR-01 (screen piece, not registered yet).

| ID | Verdict | Severity | Task that covers it | Test |
|---|---|---|---|---|
| TR-01 Reset swallows first click (hint collapses under the mouse; also after typing + Enter) | CONFIRMED | High, fix before the screen is registered (task 4/PR B) | none | Right; fix = reserve/overlay the hint space (spec line 123 wants the hint), traffic.css 376-381 |
| TR-02 final-turn plunge (3,500 to 2,100 ft over 430 ft, 72.9°; second 90° flown at 2,100 ft from ~1.1 NM, ~135 ft below 3°). Same class on Entry 4 (PFL, 33.5°) and Split 4 (30°) | CONFIRMED | High for realism, Medium as defect today | Task 15 perch rule only; PLAN GAP: task 12's 45° corners still leave a 36° plunge, task 15 keeps V6 golden tests, task 14 redraw can't place a perch, so nothing switches built-in Moose Jaw Pattern 1 to the continuous descending turn | Proposed "8° / 1,500 fpm" guard is wrong (spec's own final turn is ~13°). Use: height falls linearly with angle turned (±20 ft) in task 15, plus todo guard "no flown slope >15° on any built-in route" |
| TR-03 straight-in slopes 1.9°/3.7° vs 3° (SMM 4.7 para 10, EFIG p.131) | CONFIRMED | Medium | Task 15 (+ task 12 Split 1) | Right, as todo test |
| TR-04 no spacing/sequencing | CONFIRMED | Medium; straight-in part is pilot judgement | Task 18 (extend at perch), 19-21 rules, 24; whole-pattern sequencing is a later idea in the spec | Better: two Pattern 1 aircraft set to meet; second rolls out ≥3,000 ft behind. "+ Pair" 15 s gap < 3,000 ft at 100 kt (needs ~18 s): raise to 20 s |
| TR-05 jumps at splits/joins (1,949 / 679 / 190 ft) | CONFIRMED | Medium | Task 12 | Right, todo |
| TR-06 break ~1,000 ft late | CONFIRMED (3,065 ft) | Medium | Tasks 14-15 | Right |
| TR-07 turn readout vs flown bank | CONFIRMED | Medium | Task 12 (D46 arcs), flags tasks 5/10 | Right, todo |
| TR-08 straight-ins almost never land (1 of 40) | CONFIRMED | Medium | Task 12 (T1) | Right |
| TR-09 no runway drawn | CONFIRMED | Low (task 8) | Task 8 | ok |
| TR-13 bubbles/rings invisible at default zoom | CONFIRMED in code | Medium-Low | Not planned | Right |
| TR-11 pattern heading true vs magnetic | PLAUSIBLE | Note | Spec T2 | optional |
| TR-12 clock | CONFIRMED; wording backwards (clock is a second LATE) | Low | D157, task 12 | Right |

Pilot judgement (checked against EFIG p.131, 151, 152, 211):
- PJ-1 keep V6's final-turn bank until the redraw; the 45° comes from two-corner rounding, not spacing (a true 180° from 4,268 ft at 120 KIAS is ~31°). Don't tighten to 4,000 ft.
- PJ-2, PJ-3, PJ-5 agree (PJ-3: 2,000 ft down runway, 60°/2 G, PCL idle per EFIG p.151/152; PJ-5: level 2,700 ft, intercept final then 3° per EFIG p.131).
- PJ-4 / D156: left-hand default fine. Store the hand per runway in built-in data (CYMJ 29L left, 11R right, both circuits south per EFIG p.211); don't infer it from the runway letter.

## Recommendations for the Traffic thread (go ahead per Patrick 09:31Z; log)
1. Fix TR-01 before PR B registers the screen.
2. Add to task 15 (and log): built-in Moose Jaw Pattern 1 flies the continuous descending final turn; add the linear-height test and the 15° todo guard covering Entry 4 and Split 4.
3. Correct plan attribution: TR-02/03/06 task 15 (+14); TR-04 task 18. Raise "+ Pair" gap to 20 s.
4. Store pattern hand per runway (29L left, 11R right).

## Re-check after #192 (a01b721), 10:45Z
- #192 on main changes only tasks/traffic/todo.md and tests/unit/traffic/plausibility.test.js (8 test.todo guards). Traffic tests: 303 pass, 0 fail, 8 todo.
- The plan now places TR-02/03/06 in task 15, TR-05/07/08/11/12 and hand per runway in task 12, TR-04 in task 18. Matches the audit's attribution.
- Not on main yet: the moose-jaw-v6.json setup split and the straight-ins at 45° with 3° glide heights. Flown route data unchanged: PAT1 72.9°, ENT2 1.9°, SPL1 3.7°, ENT4 33.5°, SPL4 30.0°. Re-check when that PR merges.
