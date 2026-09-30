# Traffic Pattern Sim: end-to-end check on main 07c73e4

Checker: independent sub-agent. Nothing pushed, committed or edited in the repo. Build of 07c73e4 served with `vite preview` on port 4303, driven with Playwright Chromium at 1280x800 and 1366x768. Manual pictures read with the image viewer (EFIG p.131, 132, 135, 151, 152, 185, 186, 202, 211, 409); SMM ch. 4 paras 32 to 48, 4.28 para 71, 13.8 paras 17 and 18. Manual text is referenced, not quoted. Scripts are in `scratchpad/e2e-traffic/` (s1 to s22 browser, seq1 to seq5 sequencing, geo1 to geo4 geometry, figs1 to figs4 pictures); earlier scripts in `scratchpad/findings/scripts/` and `scratchpad/audit-traffic/a2.mjs` were re-run. Screenshots and pictures: `scratchpad//mnt/project-files/verification/shots/traffic-2/`.

## Summary

| Severity | New (this run) | Older items still open |
|---|---|---|
| High | 0 | 1: TR-02 (planned, task 15) |
| Medium | 3: TR-14, TR-17, TR-20 | 5: TR-04, TR-05, TR-06, TR-07, TR-08 (all planned) |
| Low | 4: TR-15, TR-16, TR-18, TR-19 | TR-09, TR-10, TR-11, TR-12 (planned) |
| Fixed since the last report | | TR-01, TR-03 (straight-ins), TR-13, and the "+ Pair" gap of TR-04 |
| PILOT JUDGEMENT | 4: PJ-6 to PJ-9, each with a recommendation | |

Screen: works end to end. The browser aircraft rows equal the engine's numbers (18 rows, three times, 0 mismatches), every control does something, no overlap at 1280x800 or 1366x768, axe clean in six states, no console errors, no leak over 15 module switches, the repo's 18 Traffic browser tests and 416 Node tests pass (8 todo). TR-01 (Reset swallowing the first click) and TR-13 (bubbles invisible) are fixed. The straight-ins are now on a 3 degree glide.

Geometry and sequencing: the pattern is the right shape, hand, order and speeds for 29L. What still differs is what the earlier report and the plan already name: the final turn plunge (72.5 degrees), the late break (about 2,700 to 3,100 ft, not 2,000), flown banks above the asked ones, nothing sequencing the traffic, and a straight-in or PFL that never ends in a landing.

Top 5:
1. TR-02 The final turn still holds 3,500 ft for the first 90 degrees and then drops 1,300 ft in about 500 ft of path (72.5 degrees, 35,400 ft/min). Unchanged, planned (task 15). Entry 4 33.5, Split 4 30.0 degrees also unchanged.
2. TR-04 No sequencing: 20 seeds x 60 min of the shipped 7 aircraft give 6 red and 23 caution episodes; 10 aircraft on Pattern 1, 20 s apart, give 16 red and 78 caution; two aircraft came within 51 ft at the same height. The shipped demo itself shows a caution at 14:41 (Split 4 rejoin onto the threshold 406 ft from the aircraft on final). "+ Pair 20 s" now keeps 3,416 ft on the straight-in (fixed).
3. TR-14 (new) "+ Spawn" and "+ Pair" add an aircraft while a box shows its error, using the last good value, and say "Added A8".
4. TR-20 (new to the report, known to the cross-check) Closed pattern (Split 3) is flown at 76 degrees of bank, 4.2 G at 150 kt; the wing gives about 3 G at 150 kt (stall 86 KIAS), so the turn cannot be flown as drawn.
5. TR-17 (new) The first view frames the 15 NM entry legs, so the pattern being watched fills a quarter of the map and its labels pile up; the PFL loop is 12 px wide.

## Status of the earlier findings (verification/traffic.md)

| ID | Now | Evidence |
|---|---|---|
| TR-01 Reset swallows first click | **Fixed.** One real mouse down/up on Reset after typing 350 gives 200 at 1280x800 and 1366x768; the button did not move (`s9.mjs`). e2e test exists (traffic.spec.js:274) | 09-reset-1280.png |
| TR-02 final-turn plunge | **Open, planned (task 15).** a2.mjs: PAT1 72.5 degrees at 2,226 ft, 111 kt (35,446 ft/min), ENT4 33.5, SPL4 30.0. New numbers: SPL1 5.1 (the 800 ft descent at 220 kt, fine), SPL2 3.5, ENT2 3.0 | fig3b-final-profiles.png |
| TR-03 straight-in slopes | **Fixed for the straight-ins.** Entry 2 holds 2,700 ft to 2.57 NM then 3.0 degrees; Split 1 2.06 NM then 3.0; height at the window 2,119 ft on all three ways in (manual 2,100 to 2,200) | fig3b |
| TR-04 sequencing | **Open, planned (task 18).** "+ Pair" gap is now 20 s: on Entry 2 and Split 1 the pair keeps 3,416 and 3,428 ft on final (default 3,000): fixed. Everything else below | seq3.mjs |
| TR-05 jumps at splits and joins | **Open, planned (task 12).** Unchanged: Pattern 1 to Split 2 1,949 ft in one step (19 times), Split 3 to Pattern 1 679 ft (39), Split 2 to Pattern 1 190 ft (12); heading steps up to 48 degrees | tr10.mjs |
| TR-06 break late | **Open, planned (tasks 14, 15).** Curvature begins at about 2,700 ft past the threshold, 3 degrees off heading at 3,090 ft (SMM 4.17 para 39: about 2,000 ft with a 10 kt headwind, earlier in lighter wind) | fig2 |
| TR-07 turn data vs flown bank | **Open, planned (task 12).** Same numbers: break 72 degrees first half, 59 second (asked 60); final turn 45 then 38 (asked 8 in the table); straight-in corners flown 50 to 55 (asked 45); corners 4, 5, 7 at 67 to 68. Now also visible in the Point table that shows when any route is selected: "R 12241 ft / bank 8" on points 11 to 13 | 07-pat1-selected.png |
| TR-08 straight-ins do not land | **Open, planned (task 12).** 40 seeds: 1 landed on arrival, 27 flew on into upwind (tr17). One aircraft per route, seed 3, 30 min: Entry 2, Split 1, Entry 4, Split 4 all carry on into the pattern; only Entry 1, Split 2, Split 3 land | seq1.mjs |
| TR-09 no runway on the map | **Open (task 8).** No runway, no window mark, in any screenshot. New: no 2D/3D switch, no photo, no wind boxes (not built) | 01-open-1280.png |
| TR-10 label overlap | **Open**, worse when a route is selected (see TR-17) | 07-pat1-selected.png |
| TR-11 new pattern | **Open, planned (task 12).** + New route > Pattern still draws a clockwise (right-hand) circuit on 290 degrees true, tiny, on top of the Moose Jaw pattern | 15-new-pattern-flown.png |
| TR-12 clock | Not re-tested (D157, task 12) | |
| TR-13 bubbles/rings invisible | **Fixed (D196).** Rings are visible at the default zoom, 8 px and 12 px minimum | 10-flight-120s.png, 17-caution-881.png |

## New findings

### TR-14 (Medium) + Spawn adds an aircraft while a box is showing an error
- Where: right column, Spawner.
- Steps: type 0, -1 or 1e99 in "Start at point", or -5, blank or 99999 in "Delay", press Tab, press "+ Spawn" (`s18.mjs`).
- Expected: the spawn refuses and says which box to fix (SPEC-traffic "Spawner", R3: a message that agrees with the screen).
- Actual: the box shows "Enter a number from 1 to 999." (or "0 to 86,400 s."), and the panel still says "Added A8." An aircraft is created using the last good value (start 1, the old delay). 6 of 6 bad entries did this. A start point above the route's length is refused correctly ("Entry 1 has 4 points").
- Screenshot: 18-spawn-invalid.png.
- Known or planned: no.
- Missing test: `tests/e2e/traffic.spec.js`: "with an invalid Start at point or Delay, + Spawn and + Pair add nothing and the message names the box"; unit twin in `tests/unit/traffic/aircraft.test.js` (spawnSpec is given the last good value, so the check has to look at the box, not the setting).

### TR-15 (Low) The Traffic settings menu is under the aircraft list
- Where: bottom of the right column. At 1280x800 the button is at y = 957 with 7 aircraft (page height 852) and moves down as aircraft are added; opening it adds Conflict limits, Route options and Reset to defaults below that. The column scrolls; nothing says so.
- Expected: R22 hides extras behind a switch, but the switch should be findable; the Settings button in the SPEC "Settings menu" sits with the other controls.
- Screenshot: 03-settings-open-1280.png.
- Missing test: `tests/e2e/traffic.spec.js`: "the Traffic settings button is inside the first screen at 1280x800 with the 7 built-in aircraft" (fails now), or put the button in the playback bar.

### TR-16 (Low) Spawner Route menu clips names
- "Pattern 2" shows as "Pattern :" in the 103 px box at 1280 width (15-new-pattern-flown.png).
- Missing test: `tests/e2e/traffic.spec.js` or `layout.test.js`: "no select in the spawner has text wider than its box" (scrollWidth <= clientWidth on the selected option).

### TR-17 (Medium) First view is not on the pattern
- Where: the map after load, and Fit.
- Steps: open; press Fit.
- Actual: the view frames every route including three 7 to 15 NM entry legs, so the pattern (8.6 x 2.5 NM) fills about a quarter of the map. Labels of Split, Entry 4, Split 4 and aircraft tags (altitude and speed) overlap around the inner pattern and the break (film strips 11-film-*.png; 07-pat1-selected.png). The PFL loop (1.3 NM) is about 12 px wide, so a viewer cannot see the PFL or the break geometry without zooming. Zooming works (wheel, drag, + and -; canvas has a text label and takes the keyboard).
- Expected: the thing being watched is readable at the first look (R2; the pilot asked for particular attention to geometry). Recommendation: Fit to the selected route or to the pattern and the aircraft (entries clipped), and hide labels that are within about 40 px of another.
- Known or planned: partly (TR-10).
- Missing test: `tests/unit/traffic/map2d.test.js`: "on the built-in setup the first fit puts Pattern 1 across at least 60 percent of the map's shorter side"; and the declutter test from TR-10.

### TR-18 (Low) Seven of Pattern 1's thirteen points are called "New Point"
- Points 3, 6, 8, 10, 11, 12, 13 (Pattern 1) and most of the entries and splits: the break point, the break exit, the perch, the window are all "New Point" in the table, on the map ("11 New Point") and in Leg distances. A pilot cannot tell which point is the break or the perch.
- Expected: names a pilot uses (SMM/EFIG: initial, break, downwind, perch, window). V6 data; the redraw (task 14) names them, but the labels could be corrected now without moving anything.
- Missing test: `tests/unit/traffic/setup-diff.test.js`: "no built-in point in moose-jaw.json is labelled New Point".

### TR-19 (Low) Two aircraft can be put on one spot
- Two spawns with the same route, start and delay give two aircraft on top of each other, flagged CONFLICT at once (A10 and A17 in 10-flight-120s.png). Harmless and expected from the box values; noting that the message could say "same place as A10". No missing test needed.

### TR-20 (Medium) The closed pattern cannot be flown as drawn
- Where: Split 3 (closed pattern), engine and screen.
- Numbers: 124 degree left turn at 150 kt, flown 76 degrees of bank, about 4.2 G (asked 2 G). The cross-check row `t-corner-g-margin-flown` says the same ("SPL3 point 2: 4.19 G flown at 150 kt"). The T-6A gives about 3 G at 150 kt (stall 86 KIAS); at 4.2 G the aircraft is past its stall line.
- Expected: SMM 4.24 para 57 and EFIG p.135: 45 to 60 degrees of bank, up to 90 only if needed to control a high rate of climb, at most 20 degrees of pitch, 140 KIAS minimum. Split 3 climbs 12.8 degrees, inside the 20.
- Known or planned: not named in a task (D46's arcs, task 12, would change the shape but nothing sets the bank).
- Missing test: `tests/unit/traffic/plausibility.test.js`: add "no built-in corner is flown above the T-6A stall-line G at its speed" (the cross-check computes it; nothing asserts it).

## Pattern geometry against the manuals (29L, calm air, main 07c73e4)

Measured on the path the engine flies (`geo1.mjs`, `geo4.mjs`; distances along the runway from the threshold toward the departure end, left = south side). Pictures: fig1 to fig5 in shots-2, each next to the manual page.

| Item | Manual | Engine now | Result |
|---|---|---|---|
| Hand for 29L | Left: EFIG p.151, p.185, p.211 | All turns left; downwind 15,200 ft (2.5 NM) to the left | Pass |
| Hand for 11R | Right: EFIG p.132, p.152, p.186, SMM Fig 4.11, 4.13 | Not built. There is no runway number or hand setting; "+ New route > Pattern" gives a right-hand circuit, tiny, on top of Pattern 1 (TR-11, D156, D197, task 12) | Not built |
| Order of legs | upwind, crosswind, downwind, base, 45 degree leg, initial, break, downwind, perch, final (SMM 4.14 para 33; EFIG p.185) | Same order, 13 points | Pass |
| Pattern height, speed | 3,000 ft MSL, 220 KIAS (SMM 4.14 para 32); Patrick D109: 3,500 | 3,500 ft, 220 kt | Pass by decision |
| Bank in the pattern | 60 degrees, 45 to 60 on the last turn to initial (SMM 4.14 para 33) | asked 60 (2 G); flown 67 to 68 at the corners, 62 at the base corner | TR-07 |
| Base leg to initial | 45 degree heading change on the entry leg | 28 to 343 to 298 degrees: 45 each | Pass |
| Rejoins | on an extended leg, pattern height and speed, at least 1 NM out (SMM 4.15 para 35) | Entry 3 joins the downwind extended from the NW (2.85 and 2.6 NM legs), Entry 1 the base extended from the south (3.6 NM last leg), 220 kt, 3,500 ft | Pass |
| Break point | about 2,000 ft past the threshold with a 10 kt headwind (SMM 4.17 para 39; EFIG p.151, 183) | curvature from 2,700, 3 degrees off heading at 3,090 ft | TR-06, planned |
| Break turn | 180 degrees level, 60/2, PCL idle | 83 + 96 degrees; first half flown 72 degrees, second 59; speed 220 to 140 kt; height 3,500 ft held | TR-07 |
| Roll-out | parallel before abeam the threshold | at 3,350 ft past the threshold (about mid-runway), 4,110 ft off the runway | Pass |
| Downwind | 140 to 120 KIAS (SMM 4.17 paras 40, 41), circuit check abeam mid-runway | 140 kt at roll-out, 132 kt abeam the threshold, 120 kt at the perch; offset 4,110 to 4,270 ft | Pass |
| Perch | abeam the window, 120 KIAS, up to 45 degrees (SMM 4.19 para 43) | turn starts 5,200 ft before the threshold (window 4,557), 120 kt, peak 45 degrees | Pass within 0.1 NM |
| Final turn height | continuous descending 180 degrees (SMM 4.19 para 43) | 3,500 ft for the first 90 degrees, then 2,134 ft in about 500 ft of path | TR-02, planned |
| Centreline, window | window 3/4 NM, 3 degrees, about 2,100 to 2,200 ft (SMM 4.7 para 12, 4.19 para 45) | on the centreline 0.81 NM out, 2,119 ft and 109 kt at the window, 2.97 degrees to the threshold, 100 kt at the threshold | Pass |
| Straight-in from the pattern | descend at 220 to 300 ft below pattern height, 1 NM past the base leg of the break pattern, 45 degree turn (SMM 4.16 para 36; EFIG p.131) | Split 1 leaves the outer downwind abeam the departure end (SMM says abeam the approach end, EFIG p.131 shows it earlier still), 800 ft descent at 220 kt (5 degrees), base 0.87 NM beyond the break pattern base | Pass, see PJ-6 |
| Straight-in base and final | level 2,700 ft, 45 degree AOB turn to base, 30 to 45 for the 45 degree leg, intercept the 3 degree path (SMM 4.5 para 8, 4.6 para 9; EFIG p.131) | 2,700 ft, 140 then 120 then 110 kt; turns 41 and 49 degrees (ENT2), 90 degrees at 140 kt (SPL1); flown bank 50 to 55; 3.0 degrees from 2.57 / 2.06 NM | Pass; bank TR-07 |
| Closed pattern | at least 140 KIAS past the departure end, 45 to 60 degree bank, 20 degrees pitch, level at 140 KIAS (SMM 4.24 paras 56, 57; EFIG p.135) | leaves the departure end at 140 kt, climbs 12.8 degrees, 150 then 140 kt, downwind 4,100 ft off | Pass; bank TR-20 |
| PFL | High Key over the threshold 5,000 to 6,000 ft, Low Key 1 NM abeam at about 3,700 ft (SMM 4.28 para 71), Final Key about 3,000 ft MSL (13.8 para 18), 120 KIAS gear down, 2,600 ft per circle | 5,000 ft over the threshold, Low Key 3,700 ft at 1.34 NM abeam, Final Key 2,500 ft, then threshold; legs of 8, 5, 10 and 8 degrees, 33.5 flown | Low Key 0.34 NM wide, Final Key 500 ft low, dive too steep (planned, task 16) |
| Landing | round-out and touch down 300 to 400 ft down the runway (SMM 4.9) | the aircraft lands at the pattern start point (threshold, 1,880 ft, 100 kt) | Simplified by design |

Sequencing (all numbers from the engine, same code as the screen):

| Case | Result |
|---|---|
| One aircraft on each of 9 routes, 30 min (seed 3) | Pattern 1 flies laps with splits; Entry 1, Split 2 and Split 3 end in a landing; Entry 2, Split 1, Entry 4, Split 4 all carry on into the pattern (TR-08) |
| Pair 20 s apart on the straight-in (Entry 2, Split 1), 4 seeds | 3,416 and 3,428 ft on final (default final spacing 3,000): pass |
| Pair 20 s apart on Pattern 1, Entry 3, Split 4, 4 seeds | when one takes a split and the other does not they end up stacked or crossing (30 to 62 ft lateral at 1,345 to 1,533 ft vertical: no flag) or, on Entry 3 seed 1, 1,062 ft apart on final at 56 ft height difference, unflagged (caution ring is 500 ft) |
| Shipped 7 aircraft, seed 1, 60 min | one caution at 14:41 (A2 Split 4 rejoin, A3 on final: 406 ft, 15 ft); landings at 8:39, 14:44, 21:54, 47:20, 54:37 (`seq5.mjs`) |
| Shipped 7 aircraft, 20 seeds x 60 min | 6 red and 23 caution episodes; closest 69 ft at 4 ft height difference (two on final at the same moment); 77 episodes of two aircraft on final under 3,000 ft |
| 10 on Pattern 1, 20 s apart, 20 seeds x 60 min | 16 red, 78 caution; closest 51 ft, 0 ft height difference; 175 episodes of two on final under 3,000 ft |
| 8 on Entry 2, 20 s apart | 7 red, 32 caution; most are Pattern 1 traffic against Split 1 and Split 4 rejoining at the threshold |
| Order | Aircraft on one route stay in order until a split or dice roll separates them. Nothing extends, slows, waits or gives way: sequencing is timing only, as V6 |

Where the conflicts occur (episodes by pair): Split 4 or Split 1 or Split 2 rejoining onto Pattern 1 at the threshold or on final (most), and Pattern 1 against Pattern 1 on final and climb-out. This is TR-04 (task 18 and the rules tasks); the flags, the panel text and the map tag all work.

## Screen walkthrough

Passed:
- Home card "Traffic Pattern Sim" (PROTOTYPE) opens `#/traffic`; direct link opens; opens paused at 0:00:00 with the line "Press Play to watch the Moose Jaw traffic."
- Play, Pause, Reset (also while running), Space, Home, speeds 0.25x to 8x (0.25x: 0:00 after 3 s; 1x: 0:02; 8x: 0:24), changing speed while running, Fit, wheel zoom, drag, + and -.
- Layers menu, all seven switches change the map and switch back (Trails, Height and speed labels, Route points, Leg distances, Turn data, Conflict bubbles, Caution rings); Escape closes the menu; Turn data shows R and bank per point.
- Routes: all 9 rows select, highlight and open the point table (label, height, speed, G, and radius and bank text); editing a height redraws the map; a height of 99999 is refused with "Enter a number from -1,000 to 20,000 ft."; + Point and Delete point change the count; Leg distances shows ft and NM (Entry 2 total 14.5 NM); the close button hides the table; + New route offers Pattern, Entry, Split and each adds and selects a route (route rows go 9 to 11).
- Spawner: type, route, start point, delay, + Spawn, + Pair (label "+ Pair, 20 s apart", second aircraft +20 s), Clear finished ("Cleared 1 finished aircraft."); rows update, landed aircraft say Landed and leave the map when cleared.
- Conflicts list: "No conflicts." and "CAUTION A2/A3: 406 ft lat, 15 ft vert" with a map tag and a word, not colour alone.
- Traffic settings: opens, Conflict limits boxes refuse -5 and blank with a message, Manual turn radius greys out while "from speed and G" is on, Reset to defaults works on the first click (TR-01 fixed).
- Column collapse buttons widen the map (718 to 861 to 999 px).
- Overlap: no overlapping controls at 1280x800 or 1366x768, no sideways scroll, page height 852 / 820.
- Keyboard: Tab order is logical from the spawner through settings, skip link, header, routes, then the point table; Space and Home work off the map and are ignored while typing.
- axe (WCAG 2 A and AA): clean when opened, Layers open, a route selected, settings open, playing, after a spawn message.
- Console: no errors or warnings in any Traffic session. (When switching through the other modules, two ERR_CERT_AUTHORITY_INVALID resource errors appear; they come from the sandbox proxy on another module's request, not from Traffic.)
- Leak check with `__ooda.stats()`: idle {listeners 3, subscriptions 0, frames 0, timers 2}; playing frames 1; after Traffic to home, turn-sim, sof, debrief, turn-fight and back (9 switches, then 15 more play-and-leave cycles) it returns to {frames 0, timers 2, listeners 3 on Traffic and 3 on home}; heap 10.0 MB before and after.
- Repo tests: `node --test tests/golden/traffic-*.test.js tests/unit/traffic/*.test.js` 416 tests, 408 pass, 0 fail, 8 todo (plausibility.test.js); Traffic e2e 18 of 18 pass.

Not present (not built per the plan, not bugs): 2D/3D switch, satellite photo, runway drawing, Rewind and plus/minus 10 s, wind boxes, aircraft types other than a colour, editing an aircraft, delete route, profiles, PFL/engine-out/rules. The dead-button check found no button that does nothing; the Rewind, 10 s, 2D/3D, wind and photo controls are honestly absent.

## PILOT JUDGEMENT (each with a recommendation; the owner acts on it)

- PJ-6 Where a straight-in from the pattern starts. SMM 4.16 para 36 says abeam the approach end (threshold); EFIG p.131 shows the descent well before the departure end; Split 1 starts abeam the departure end. Question: is the start point right for Moose Jaw? Recommendation: keep; it sits between the two manuals and reaches 2,700 ft abeam the threshold, so it does not disturb the break traffic at 3,500. Look at it in the photo redraw (task 14).
- PJ-7 The pattern's width: downwind 2.5 NM from the runway and 8.6 NM long. The p.211 photo, read by eye against the runway box, suggests about 1.9 NM out and a longer racetrack, plus or minus 20 percent. Recommendation: keep V6's size until Dad drags the points onto the ground references in task 14; do not change by eye.
- PJ-8 Low Key 1.34 NM abeam and Final Key 2,500 ft on Entry 4 (SMM 4.28 para 71: 1 NM abeam; 13.8 para 18: about 3,000 ft MSL, 90 degrees of turn to go). Recommendation: move Low Key to 1 NM and Final Key to 3,000 ft with the true circle in task 16; nothing to change before.
- PJ-9 The closed pattern (TR-20). Recommendation: ask 60 degrees of bank, at most 20 degrees pitch, stay above 140 kt, and let the turn take the room it needs (a wider start, not a tighter turn); accept up to 90 only when the climb needs it, as SMM 4.24 para 57 allows, but then also show the G.

## Logged decisions checked against the manuals (decisions-for-review.md, Traffic rows)

- D156 (built-in new pattern left-hand): consistent with SMM Fig 4.10 and EFIG p.151 (29L). Not built yet; the screen still makes a right-hand circuit (TR-11). No contradiction.
- D157 (true-second clock): no manual involved. Not built.
- D195 (+ Pair 20 s): checked, 3,416 ft on the straight-in at 100 kt. Agrees.
- D196 (min bubble and ring size): checked, visible. Agrees.
- D197 (hand stored per runway, 29L left, 11R right; magnetic to true): agrees with EFIG p.151, 152, 211. Not built. Note the 11R pattern also lies on the south side of the pair (EFIG p.211): keep both circuits on the same side.
- D198 to D204 and D209 to D211 (cross-check corrections and withdrawals): the current data equals the withdrawn state for the break and final turn (1 G) and the corrected state for the straight-ins (45 degrees, 3 degree heights), as D209 to D211 say. Checked: Pattern 1 last corner 2,134 ft, window 2,119, flown glide 2.97; Entry 2 Glide path point 15,647 ft out at 2,700. Agrees with SMM 4.7 paras 10 and 12. Two remarks, not contradictions: (1) D201 asks the straight-in corners at 45 degrees but they are flown at 50 to 55, above "30 to 45" (EFIG p.131) and above the cross-check's own 45 (the fix is the true arcs, task 12); (2) D203 leaves the window speed at 110 kt against the 100 kt of Q2/D110: SMM 4.19 para 48 and 4.19 para 43 give 110 (threshold speed + 10) as the floor in the final turn, so 110 at the window is inside the manual; the 100 kt applies at the threshold, where the data has 100.
- No logged Traffic call contradicts the SMM, the manuals or the spec.

## Missing tests (summary, for the owner)

| Finding | Test to add |
|---|---|
| TR-02 | `tests/unit/traffic/plausibility.test.js`: the two todos already there (no flown slope over 15 degrees; height linear in the angle turned) |
| TR-03 | same file: window height 240 +/- 40 ft on each straight-in (todo exists; would pass now) |
| TR-04, TR-05, TR-06, TR-07, TR-08 | the todos already listed in plausibility.test.js |
| TR-14 | `tests/e2e/traffic.spec.js`: a box in error blocks + Spawn and + Pair and the message names the box |
| TR-15 | `tests/e2e/traffic.spec.js`: the settings button is within the first screen at 1280x800 |
| TR-16 | `tests/e2e/traffic.spec.js`: spawner selects show their full text |
| TR-17 | `tests/unit/traffic/map2d.test.js`: first fit puts Pattern 1 across 60 percent of the map; labels within 40 px are not all drawn |
| TR-18 | `tests/unit/traffic/setup-diff.test.js`: no built-in point is labelled "New Point" |
| TR-20 | `tests/unit/traffic/plausibility.test.js`: no built-in corner above the stall-line G at its speed |
| Geometry against the manual | `tests/crosscheck` already measures most rows; add "the flown path of Pattern 1 stays inside the SMM/EFIG box" as a picture test only if Patrick wants one |

## Audit (second checker, Opus, ~12:30Z; 416 traffic tests pass, 8 todo) — corrections win over the text above

| Item | Verdict | Severity | Planned? |
|---|---|---|---|
| TR-20 closed pattern Split 3 | CONFIRMED with corrections: 124° left turn at 150 kt, tightest radius 487 ft = 76.3° bank / 4.22 G vs wing limit (150/86)² = 3.04 G. The climb is a 22.5° straight climb (2,500→3,500 ft over 2,412 ft), not 12.8°, then a level turn — over SMM 4.24 para 57 / EFIG p.135's 20°. ALSO Split 2 point 2: 113° at 150 kt flown 72.3° / 3.30 G, over the wing limit (missed by the crosscheck, which reports only the worst corner). | Medium | Yes: task 12 true arcs (~62°, 2.16 G) and task 15's "no flown slope >15°". Add a todo test on FLOWN bank vs stallLimitG for every corner. |
| TR-14 +Spawn/+Pair with a box in error | CONFIRMED (ui-kit controls.js 81-87 writes only valid values; aircraft.js spawn() uses last good) | Low-Medium | Not planned; fix at ui-kit level (helper reports validity) |
| TR-17 first view/Fit frames all routes | CONFIRMED (map2d.js sceneBounds); PFL loop is ~37 px, not 12 | Medium | Partly (TR-10); fit the pattern first, keep "show all routes" |
| PFL Low Key 1.34 NM abeam vs 1 NM; Final Key 2,500 vs ~3,000 ft | CONFIRMED (SMM 4.28 para 71, 13.6; Final Key is SMM 13.9 para 18) | Low | Task 16 |
| Break roll-in 2,851 ft past threshold vs ~2,000 ft (SMM 4.17 para 39, 4.18 para 42) | CONFIRMED | Medium | Task 15 (2,000 ± 500) |
| Break flown 69.9°/57.5° vs 60° asked | CONFIRMED | Medium | Task 12 |
| Straight-in corners | Only Split 1's base turn is 54.8°; others 46.9-47.9° (within 5°) | Low | Task 12 |
| TR-04 conflicts | CONFIRMED in kind; counts are totals over 20 one-hour runs, not per hour: shipped defaults 4 red / 16 caution in 20 h (closest 66 ft); ten on Pattern 1 at 20 s: 10 red / 55 caution, 50.6 ft closest | Medium | Task 18 |
| TR-01, TR-03, TR-13 | FIXED | - | TR-03's todo at plausibility.test.js:8 would pass now: make it real |
