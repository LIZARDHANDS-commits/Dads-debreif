# Traffic Pattern Sim: testing and sign-off

The whole-tool testing policy in `../../TESTING.md` applies. This file adds the module's own rules, how each of its requirements is checked, its sign-off checklist, and what happens to each of its test files.

Sources in this file point to where things were on 4 Oct 2026: `pf/` means the project files (`pf/`, private), and repo paths such as `docs/records/` or `specs/` are now under `archive/` (see `archive/README.md`).


Built on TR-R1 to TR-R34, ratified by Patrick on 4 Oct 01:46Z (`pf/reset/1-requirements/requirements.md`, "## Traffic Pattern Sim"), and the "Realistic kinematics means (Traffic)" paragraph under them. The per-test keep, rewrite or retire marks, and what each of the 37 failing browser tests shows, are in the test register's Traffic section.

**Today:** 40 unit files (about 817 tests). 37 files pass. `tests/unit/traffic/commands.test.js` fails 2 of 9 and `tests/unit/traffic/playback-bar.test.js` fails 1 of 28. `tests/unit/traffic/rewind.test.js` never finished: it hit the 300 s limit, and a run on its own was still unfinished at 1,200 s (it passed in CI at `adf1e1b`). The browser file passes 13, fails 37 and skips 5 at `6283f38` (`pf/reset/5-testing/browser-results-6283f38.md`). The cross-check table (`archive/tests/crosscheck/traffic-expected.json`) is run by nothing, and a re-measure differs from it in 57 of its 91 rows. Across the module about 94 tests gate on a time, about 38 pin a V6 number, and about 180 tolerance bands are typed in, mostly without a reason (`pf/reset/5-testing/agents/traffic.md`, module summary). This is the module where the old tests did the most harm (lesson F1), so most flight tests are rewritten around shape and invariants.

## Traffic rules on top of the whole-tool rules

- **TP1. Shape, not seconds.** Flight checks look at the shape of a whole manoeuvre, found by what the aircraft is doing (its phase or where it is), never at a chosen second: in the break speed only falls, height stays flat and bank stays near 60°; on final height against distance is a straight line near 3°; the final turn rolls out on the centreline; the closed pattern pulls up only past the upwind end. These are the requirement's own "how we'd know" lines (TR-R7 to TR-R14, TR-R31, TR-R33, TR-R34).
- **TP2. Generous limits, never tight ones (T2; Q-T13, decided).** A test that flies until something happens ("until it lands") needs an end so it can't run forever. It gets a generous stop, far above anything realistic (for example ten times the manoeuvre's usual length), with the reason in a comment. Reaching the stop fails with what never happened ("A3 never landed"), which is TR-R15's "aircraft keep flying and only leave by landing". A realistic outer limit is also fine where it means something to a pilot, such as a PFL landing within 5 minutes (T2). A manoeuvre's time is never checked to the second.
- **TP3. Wind is checked by comparing runs (T1).** Calm air is not a special case: the same circuit flown in calm and in wind gives the same shape over the ground; the crab angle equals the one worked out in the test from wind and true airspeed; a stronger headwind moves the break point further down the runway; mirroring the crosswind mirrors the crab; a wind change mid-flight is followed by aircraft already flying (TR-R5, TR-R6, TR-R8, TR-R30).
- **TP4. Smooth and never lost (TR-R15, TR-R30).** Over long seeded runs with random commands: no frame-to-frame jump in position, height, heading, bank or speed bigger than the aircraft could fly in one step (worked out from its speed and roll rate, not a fixed 25 ft); every aircraft is still flying, landed or removed; nothing is NaN.
- **TP5. Numbers come from the manual pages or Patrick.** Pattern 3,500 ft at 220 KIAS, straight-in base 2,700 ft, window 3/4 NM on a 3° path, 100 KIAS from the window to the threshold, final turn up to 45°, breakout 4,500 ft, Initial where the Flying Orders put it: each check names its page reference or Patrick's ruling (`pf/manuals/traffic-pattern-numbers.md`; TR-R4). Point coordinates, waypoint counts and the engine's own tuning constants are not expected values (T3); they change when the routes are redrawn (TR-Q28).
- **TP6. Limits are references (T10).** Physical limits are invariants: no bank beyond what the wing can give at that speed (the accelerated stall line, worked out in the test), no flight through the ground. The flying profile's numbers (60° in the break, 45° maximum in the final turn, 90° to arrest the closed-pattern climb) are how the simulated pilot flies and are checked as shape. No test expects an aircraft to be held at a published limit.
- **TP7. Same setup, same history (T6).** Rewind, −10 s and +10 s land on the same state as the forward run, at every speed (TR-R21). Each aircraft draws its random choices from its own stream, seeded from its callsign **(Q-T5, decided)**, so adding or removing one aircraft doesn't change what the others do. How fast a rewind feels is a sign-off look, not a timed test (T2).
- **TP8. Browser tests set what they need.** A browser test sets the playback speed and the aircraft it needs rather than relying on the opening setup (TR-Q10 is open and TR-R2 changes the opening setup), and waits for an event ("A1 is flying") rather than for real seconds to pass.

## How each Traffic requirement is checked

"Each change" means a unit test or one of the per-change browser checks in section 2 (smoke, layout, accessibility, buttons, leaving, offline). Checks that need the whole Traffic browser file run at sign-off. "New" means no test checks it today; the test is written with the change that builds it and fails until then.

| Requirement | Automatic check | When | Hands-on checklist |
|---|---|---|---|
| TR-R1 The Moose Jaw circuit, several aircraft at once | Seeded run of the opening setup: aircraft fly Initial, break, downwind, final turn and land or go round, in that order | Each change | Watch a full circuit; it looks like the Moose Jaw diagrams |
| TR-R2 Something to watch at once | New: the opening setup has three or four Harvards already in the circuit, none at the threshold at landing speed, none waiting more than a few seconds | Each change | |
| TR-R3 Patterns on the left, spawning on the right; patterns locked | Picking a pattern highlights it on the map; no editing controls are shown | Each change | |
| TR-R4 Heights, names and Initial where the orders put it | Named points carry pilot names and the heights in TR-R4, each with its page reference (TP5); straight-in traffic steps down to 2,700 ft before base | Each change | Dad checks the point list against the Moose Jaw diagrams |
| TR-R5 Wind works one way everywhere | TP3: calm and windy runs, crab worked out in the test, wind changed mid-flight | Each change | |
| TR-R30 Planned legs, live manoeuvres, no jump between them | TP4 over a crosswind circuit with every manoeuvre. `smooth-transitions.test.js` (Patrick, 4 Oct 10:05Z; six limits approved 10:18Z): each manoeuvre, calm and in 20 kt, flown to 4 minutes; every 0.05 s step moves no further than the ground speed carries it plus 1 ft, heading at most 2°, bank at most 5° (90°/s roll), speed at most 1 kt, height at most 10 ft, and turn rate changes no faster than a 90°/s roll allows at that speed and bank (margin ×2 for the path's point-to-point ripple) | Each change | |
| Setup column (Patrick, 4 Oct 11:05Z) | `setup-panel.test.js`: five scenario buttons, Random among them; Random puts five aircraft on route points at least 1 NM apart (estimate), and the same dice give the same picture; every scenario has aircraft up after two minutes; the wind dial reads compass bearings; the 29L head and cross wind line matches the wind triangle | Each change | |
| Automatic deconfliction (spec 4.12, TR-49) | `deconflict.test.js`: two aircraft on a collision course never get inside 200/200 ft with it on, and do with it off; at the same height the one with the other on its right gives way and the other keeps its height (±100 ft); the higher one moves; a minute apart nobody moves; the right-of-way answer is the same whichever aircraft is asked; a broken aircraft is left out; closest approach and cylinder entry against hand-worked geometry | Each change | Turn it on in Traffic settings. Spawn two on a collision course: does one give way and the other carry on? Does either go red? |
| TR-R6 Crab and ground speed shown | New: with wind on, each aircraft shows ground speed and crab, left or right | Each change | |
| TR-R7 The break | TP1: level, about 60°, speed only falls from 220 to about 140, rolls out on downwind; a stronger headwind moves the break point down the runway | Each change | |
| TR-R8 Downwind and a wind-shifted perch | Perch moves with the crosswind and the final turn still rolls out on the centreline; about 120 KIAS by the perch | Each change | |
| TR-R9 Final turn | TP1: one continuous descending turn, bank under 45° and about 35° when the perch is placed for the wind, rolls out on the centreline with crab | Each change | |
| TR-R33 Closed pattern | Pulls up only past the upwind end, one continuous climbing turn entered at 45° to 60°, levels at pattern height and reaches the perch with no step; lands within 2.5 minutes of the pull-up (Patrick, 4 Oct 09:14Z and 09:26Z) | Each change | |
| TR-R10 Final | Height against distance is a straight line near 3°; speed falls only after the window; never speeds up | Each change | |
| TR-R11 Straight-in | Level at base height, one turn of no more than 45°, then the same final as overhead traffic | Each change | |
| TR-R12 Landing as chosen | Each of touch-and-go, full stop and go-around ends as chosen; no dice; no aircraft vanishes | Each change | |
| TR-R13 Climb-outs and rejoins | After each, the aircraft climbs, turns, levels at pattern height and rejoins with no jump (TP4); the button text says what happens | Each change | |
| TR-R34 Breakout | Climbs to about 4,500 ft, stays 2 NM south of the pattern, rejoins on the ENT1 line at pattern height at least 1 NM out | Each change | |
| TR-R14 PFL | `tests/unit/traffic/pfl.test.js` (spec 4.5, approved 4 Oct 08:54Z): from a spread of failure points (High Key, the break, downwind, abeam, the area at a few heights) in calm air and 20 kt, the aircraft glides to the runway when it has the height; far too low and far out it ejects; no gear or flap before it is on the circle or committed direct to the threshold; more height at the start never gives a worse result; on profile at High Key or Low Key it touches down in the first third of the runway (Patrick 09:49Z); no position step bigger than the aircraft's own movement, all numbers finite; an area PFL that lands flies a touch-and-go back into the circuit. `commands.test.js`: above 150 KIAS the aircraft climbs first (zoom; SMM 13.17 para 34, NFM Fig 3-4), at or below 150 it holds height then glides; both then descend | Each change | Dad flies a PFL from High Key and from an area |
| TR-R35 PFL tag | `map2d.test.js`: the tag shows the decision and configuration | Each change | Start a PFL on downwind; the tag changes as it zooms, joins and takes drag, the same in 2D and 3D |
| TR-R31 High Key | Climbs under power to High Key, glides at about 120 KIAS round the PFL pattern; high or off heading at 2,100 ft goes around. `high-key-climb.test.js` (spec 1a item 23, approved 4 Oct 09:56Z): from start points all round the field, calm and in wind, the climb arrives at High Key within 100 ft of its height and place, flying the last 760 ft within 100 ft of the centreline and 10° of the runway track | Each change | |
| TR-R32 Every manoeuvre works | Each manoeuvre button from the opening setup ends in a rejoin or a landing | Each change | Press each button once |
| TR-R15 Smooth, and aircraft keep flying | TP4 over a long seeded run with random commands | Each change (a few seeds); sign-off (many seeds) | |
| TR-R16 Harvard only; the type system stays | The type list offers the CT-156 only; a made-up slower type crabs more in the same wind (the type system still works) | Each change | |
| TR-R17 Conflicts shown | Two aircraft flown to cross: red inside the conflict distances with feet apart, yellow inside caution, nothing outside; the distances are settings (TR-Q11 answered (Patrick, 4 Oct 09:09Z: keep 200 / 200 ft conflict and 500 / 500 ft caution)) | Each change | |
| TR-R18 Spacing on final | New: aircraft aim for 2,000 ft on final (a setting with its page reference), extend downwind or move over to keep it; a pair spawned together keeps the spacing | Each change | |
| TR-R19 Spawn by pilot words; remove one | Every start point is a named place with its height and speed; spawning at Perch puts the aircraft there heading the right way; Pair is 20 s apart; past 200 the refusal says what to do. New: Remove takes one aircraft out and Rewind brings it back | Each change | |
| TR-R20 Commands only when they make sense | Commands that can't apply are absent or off; each does what its label says; the card fits at 1280 wide | Each change | The card isn't a wall of buttons |
| TR-R21 Time controls | TP7: −10 s and +10 s land on the forward run's picture at 1× and 8×; Reset, Play, Pause and Rewind each work after the others; the clock reads past 1:00:00 | Each change | Rewind with 30 aircraft feels instant |
| TR-R22 The 2D map, offline | Routes, aircraft with heading, height and speed, trails, rings, wind arrow, grid and photo credit; offline, the grid and routes still draw and the note shows | Each change | |
| TR-R23 3D as built | 3D opens only when switched on, at the lighter graphics, with no missing files; the camera bar doesn't cover the map controls; switching back frees it | Each change (unit); sign-off (browser) | Look at each camera once |
| TR-R24 Layer presets | Each preset: nothing overlaps at 1280 wide and the menu closes | Each change (layout) | |
| TR-R25 Saved setups | Save, reload, load: same setup including wind; save over a name asks first; a damaged or hostile file is refused in words; the built-in setup is always there | Each change | |
| TR-R26 Another home field | Another home field opens something sensible or says only Moose Jaw is supported (TR-Q16 open); no Moose Jaw routes over the wrong place | Each change | |
| TR-R27 One closed settings menu | Starts closed; shows only settings that change something; Reset to Standard Defaults restores every value | Each change | |
| TR-R28 No dead ends | The every-button check; no "Coming soon" items (Runway 11R hidden) | Each change | Click every control once |
| TR-R29 Fits at 1280, stacks below 900 | Layout check in 2D and 3D at 1280 × 800 and 1920 × 1080, and at 390 px wide | Each change (layout) | |

**At Traffic sign-off:** the whole Traffic browser file, TP4 over many seeds, the cross-check report read by Patrick and Dad (below), the hands-on checklist above and `archive/docs/checklists/traffic.md` updated for the requirements, and one look in real Safari.

**The cross-check becomes a sign-off report.** `tests/crosscheck/traffic-measure.js` measures the built-in setup (heights, speeds, bank, G at each corner, spacing) next to each number's page reference from `src/modules/traffic/data/crosscheck-scenarios.json`. It is kept as a report printed at sign-off for Patrick and Dad to read, not a test: per T10 a difference from a manual number is shown, not failed, and Patrick's overrides are marked as his. The recorded table `archive/tests/crosscheck/traffic-expected.json` is retired, because it is the code's own output from an older version and nothing compares against it.

**The rewind hang.** `tests/unit/traffic/rewind.test.js` holds the most important Traffic invariant (TP7) and also five tests that time the computer (T2). It never finished at `6283f38`. Under the flaky-test rule **(Q-T4, decided)** it moves to the sign-off run until it finishes reliably; the timed tests come out, the heavy runs are cut down (T9), and the replay checks go back to every change once the file finishes in seconds.


## Sign-off checklist

Anyone can run it, in the real app, from the module's default start, on a laptop at 1280 wide, and send Patrick the result with the date, their name and the version shown on screen (`../../TESTING.md`, section 4). Anything not seen working is listed as unseen.

### From the ratified requirements (the hands-on column above)

- [ ] Watch a full circuit; it looks like the Moose Jaw diagrams (TR-R1)
- [ ] Dad checks the point list against the Moose Jaw diagrams (TR-R4)
- [ ] Dad flies a PFL from High Key and from an area (TR-R14)
- [ ] Press each button once (TR-R32)
- [ ] The card isn't a wall of buttons (TR-R20)
- [ ] Rewind with 30 aircraft feels instant (TR-R21)
- [ ] Look at each camera once (TR-R23)
- [ ] Click every control once (TR-R28)

> The old checklist below was written before the reset. It is refreshed against the requirements above when the module's work resumes: lines that test V6 numbers or exact times are rewritten or dropped.

### Carried over from `archive/docs/checklists/traffic.md`

#### Sign-off checklist: Traffic Pattern Sim (Gate 1)

Anyone can run this in about twenty minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/traffic (or `http://localhost:5173/#/traffic` locally)

The simulator models the 15 Wing Moose Jaw circuit (Runway 29L left-hand circuits) baselined on standard aerodynamics and the 15 Wing SMM / EFIG manuals.

---

### 1. First look & UI Layout

- [ ] On the home screen, the **Traffic Pattern Sim** card has the short description and opens cleanly. **Home** in the header brings you back.
- [ ] Three main areas appear without overlap:
  - **Setup** panel on the left (scenario buttons and the wind dial on top, then the routes: Pattern 1, Entry routes ENT1–ENT4; legacy polyline splits SPL1–SPL4 are deactivated per D399).
  - **2D Airfield Map** in the center (centered on CYMJ Moose Jaw Runway 29L, 1,892 ft MSL field elevation).
  - **Aircraft List & Spawner** on the right (with callsign, type, route, altitude, airspeed readouts, and tactical maneuver buttons).
  - **Playback Bar** along the bottom with Play/Pause, Timeline slider, Time display, Speed multiplier, Photo toggle, 3D toggle. The wind is set in the Setup panel.
- [ ] Press each **Scenarios** button: the aircraft change to that scenario, paused at 0:00. **Random** gives five aircraft spread round the routes, and pressing it again gives a new picture.

---

### 2. Standard Circuit Geometry & Flight Physics (15 Wing SMM)

- [ ] With default settings, press **Play**. Built-in aircraft spawn and fly their designated routes.
- [ ] **CT-156 Harvard II (Default Type):**
  - Flies initial overhead pattern at **3,500 ft MSL** (1,600 ft AGL) and **220 KIAS**.
  - The overhead break initiates past the threshold and rolls into a crisp **60° bank / 2.0 G level turn** (D382, D389), bleeding airspeed cleanly downwind.
  - At the wind-adjusted perch point, the aircraft enters a continuous descending final turn at **nominal 35° bank** (30°–45° bounds, D391), slowing to **120 KIAS** in the turn and rolling out onto straight-in final descending to **2,700 ft MSL** before slowing to **100 KIAS** over the threshold.
  - Vertical descent profile is smooth and continuous ($\le 15^\circ$ descent slope), with no sudden vertical plunges.
- [ ] **Calm-Wind Rounded Arcs (D400):** With wind at `0 kt`, verify that the overhead break and final turn generate smooth, rounded 180° circular arcs with zero polygonal corners or outer box artifacts.
- [ ] **Turn Arcs:** Turns follow true circular arcs (`trueArcs: true`, D46) without quadratic Bézier G spikes.

---

### 3. Wind Triangle & Interactive Wind Controls

- [ ] In the **Setup** panel on the left, find the **Wind** dial and the **Wind strength** bar.
- [ ] Drag the dial round to `210` and slide **Wind strength** to `25 kt` (crosswind from the left on RWY 29L). The line under the bar reads "29L: 1 kt head, 25 kt cross from the left".
- [ ] Aircraft in flight dynamically crab into the wind:
  - Aircraft headings visually orient into the wind to maintain ground track along the circuit legs.
  - Readouts show differing **IAS** vs. **Ground Speed (GS)** and active **Crab Angle**.
  - Headwind increases time/reduces ground speed along straight legs; tailwind increases ground speed.
- [ ] Return wind to `0 kt`: aircraft tracks and headings re-align with ground path, and ground speed equals airspeed.

---

### 4. Playback, Scrubbing & Timeline Rewind

- [ ] **Play / Pause:** Pressing Play starts simulation clock; Pause halts aircraft instantaneously.
- [ ] **Speed Multipliers:** Toggle 0.5×, 1×, 2×, 4×, 8×. Simulation advances smoothly at each rate.
- [ ] **Timeline Scrubbing & Rewind:** Drag the timeline scrubber backwards and forwards rapidly while aircraft are flying:
  - Aircraft smoothly update positions along their routes.
  - Callsign assignments remain consistent and distinct without index corruption or crashes (+422 lines of rewind guards).
- [ ] **Reset:** Clicking Reset restores simulation time to T+0.0 s with opening aircraft queue.

---

### 5. Aircraft Spawner & Closed Pattern Preset

- [ ] In the right-hand panel, select aircraft type from the dropdown (**CT-156 Harvard II**, **CT-155 Hawk**, **CT-114 Tutor**, **CF-188 Hornet**):
  - Each aircraft type flies its authentic SMM pattern speeds (e.g. Hawk/Hornet at higher pattern speeds, Tutor at SMM circuit speeds).
- [ ] **Spawner Clean-Up (D400):** Verify single working **Start at point** control (redundant preset dropdown removed). Select **Point 2**:
  - Live caption displays: `↳ Departure End (Closed Pattern): 2,400 ft, 140 kt`.
- [ ] Click **+ Spawn**: Aircraft spawns past departure end in `closed_pattern` phase.
- [ ] Press **Play**:
  - Aircraft executes authentic 180° climbing turn (50° bank / 2,100 fpm climb) to 3,500 ft MSL at 140 KIAS.
  - Rolls out wings-level on downwind heading (**118° true**) pointing directly towards the Perch.
  - Smoothly captures the Perch without looping or circling, transitioning into the descending final turn.
- [ ] **Conflict Detection:** When two aircraft fly within conflict boundaries (default 200 ft lateral / 200 ft vertical), amber caution or red conflict indications display accurately on the aircraft badges and map.

---

### 6. Tactical In-Flight Pilot Maneuvers

- [ ] **Breakout Command (D395):**
  - Click **Breakout** on an aircraft card in the circuit.
  - Aircraft immediately climbs to 3,500 ft MSL, accelerates to 180 kt, vectors towards the breakout point 2 NM south of pattern center, continues south, and turns to intercept the rejoin line.
- [ ] **High Key / PFL Command (D400):**
  - Click **High Key** on an aircraft card.
  - Aircraft vectors to overfly Runway 29L threshold at **5,000 ft MSL** heading along the runway axis (**298° true**).
  - From High Key, aircraft enters a continuous 360° circular gliding arc at 120 KIAS / 30° bank passing Low Key (3,900 ft MSL) down to threshold.
- [ ] **Go-Around Command (D394):**
  - Click **Go-around** after an aircraft passes the Window and slows to 100 KIAS on final approach.
  - Aircraft initiates immediate runway-axis climb-out to 3,500 ft MSL / 220 KIAS and rejoins the downwind pattern cleanly.

---

### 7. Satellite Photo & 3D Aerial View

- [ ] Click the **Satellite Photo** toggle button in the playback bar:
  - High-resolution Esri satellite imagery tiles load behind CYMJ airfield and runway vectors.
- [ ] Click the **3D View** toggle button:
  - Three.js WebGL 3D camera view initializes, showing circuit trajectories and altitude separation in full 3D space.
  - Orbit, pan, and zoom controls operate smoothly.
  - Switching back to **2D** returns to the crisp schematic vector map.

---

### 8. Settings Menu & Standards

- [ ] Open **Traffic settings** (gear icon / panel):
  - Lateral and vertical conflict limits (default 200 ft lateral, 200 ft vertical, 500 ft caution) are editable.
  - Type a new value into a box (e.g. 350 ft). Click **Reset to Standard Defaults**: the values reset to 200 ft without button focus-shift swallowing the click (TR-01 resolved).

---

### 9. Sign-Off

**Browser and version:** _______________________  
**Date:** _______________________  
**Name:** Patrick  

**Notes / Observations:** __________________________________________________________________  

All lines ticked means Milestone 1 (Traffic Pattern Sim) is complete and signed off for Gate 1.


## Test files and what happens to each

From the ratified test register (`pf/reset/5-testing/test-register.md`, Part B). The clean-up pull requests carry these out.

| File | Keep, rewrite or retire | Why (policy line or requirement) | What the rewrite checks instead | Runs |
|---|---|---|---|---|
| `tests/unit/traffic/aircraft.test.js` | Keep, with changes | TR-R19, TR-R20, TR-R25 (injection checks). The row text pinned to the old setup ("A1 ... starts at 0:12", `:225`) follows TR-R2's new opening setup; "Start at point" becomes the named list (TR-R19); "twenty minutes in, some have landed" (`:213-215`) becomes "fly until one lands" with a safety stop (TP2) | New beside it: Remove takes one aircraft out (TR-R19) | Each change |
| `tests/unit/traffic/airfield-core-ground.test.js` | Keep | TR-R23 (3D as built); freeing memory once (ALL-R12) | | Each change |
| `tests/unit/traffic/breakout.test.js` | Rewrite | TR-R34. "4,500 ft after 45 s" and "capture within 150 s" are time gates (T2); the points are the code's own constants (T3) | Climbs to about 4,500 ft, stays 2 NM south of the pattern, rejoins on the ENT1 line at pattern height at least 1 NM out, with no jump (TP4); found by phase, with a safety stop (TP2) | Each change |
| `tests/unit/traffic/camera-views.test.js` | Keep | TR-R23; bearings worked out in the test | | Each change |
| `tests/unit/traffic/clock.test.js` | Keep | TR-R21; playback arithmetic and "same run at any frame rate" are invariants, not flight times | | Each change |
| `tests/unit/traffic/closed-pattern.test.js` | Rewrite | TR-R33. Four "within N s" gates (T2); default bank 50 and the start point are the code's own (T3). The wind-shifted perch check (independent bearing) is kept | Pulls up only past the upwind end; one continuous climbing turn entered at 45° to 60°; levels at pattern height; reaches the perch with no step (TP1, TP4) | Each change |
| `tests/unit/traffic/commands.test.js` | Rewrite | Fails 2 of 9 at `6283f38`. Every case reads the state at a fixed second after the command (T2). `engine_fail`: height had not dropped 10 s after the command (`:52`); a pilot at 140 kt trades speed for height before gliding, so the expectation itself may be the wrong one (inferred; to check against the manuals at the PFL review, T7). `pfl_current`: the phase name was not one of the listed PFL names (`:150`). TR-R14 and TR-R31 redefine PFL and High Key | Each command changes what the aircraft does in the way TR-R13, TR-R14, TR-R31 and TR-R34 describe, checked by shape (TP1); PFL cases wait for the PFL review | Each change |
| `tests/unit/traffic/defaults.test.js` | Rewrite | TR-R27: settings for features that don't exist are not carried; TR-R28: Runway 11R is hidden, not "coming soon" (`:235`). The rows pin the spec table, so they move with every default change (T8) | Every setting the menu shows has a default inside its range; no setting exists for an unbuilt feature; the defaults with a page reference (pattern height, final spacing) name it (TP5) | Each change |
| `tests/unit/traffic/dice.test.js` | Keep | T6, TP7: the seeded random generator, same seed same numbers | | Each change |
| `tests/unit/traffic/fake-dom-extras.test.js` | Keep | Checks a test helper | | Each change |
| `tests/unit/traffic/flight-engine-challenge.test.js` | Rewrite | Mostly restates the engine's own formulas (T3): the break curve's 0.452 exponent is checked to 0.01 kt (`:60`); stale comments about a removed clamp (`:200`, `:231`). The stability property with fast-check (`:400-441`) is kept (T9) | Break: speed only falls from 220 to about 140; final turn: height falls steadily from 3,500 to 2,700; final: 3° path to the threshold (TP1, page references); no value blows up at any step size | Each change |
| `tests/unit/traffic/flight-engine-stress.test.js` | Keep, with changes | TR-R5, TR-R15, TP6: crosswind tracking, the accelerated-stall bank limit worked out in the test (`:327-328`). Three changes: test 4.3 can't fail (`:413-418`, T8); the roll-rate test also requires the peak to reach 44.9°/s (`:468-471`), which pins the engine's own number from below; the intercept values written as "Empirical observation" (`:198`, `:221`) are the code's own output (T3) | Roll rate stays inside a realistic range (spec 30 to 50°/s) without pinning the engine's number; intercepts converge without overshooting past the next leg | Each change |
| `tests/unit/traffic/flight-engine.test.js` | Keep, with changes | The independent formulas stay (lead turn `R tan(Δθ/2)`, turn rate `g tan φ / v`, crab `asin(W/V)`, stall load factor). The engine's own tuning numbers pinned to 0.01 (4 kt/s, 52.37 ft/s at `:474`, "chart ~1350 fpm" at `:535`) are not expected values (T3); the 60 s "converge within" check at `:149` gets a safety stop (TP2) | The glide sink rate checked against the glide chart's page reference (TP5); climb and acceleration only checked for sign and realistic range | Each change |
| `tests/unit/traffic/flight-invariants.test.js` | Keep, with changes | TR-R15 at its core: never frozen, finite numbers, on the route while on the rail. "Finish within 300 s" and "no phase over 120 s" (`:101-126`) become safety stops with a reason (TP2), and "A1 flying at t=12" (`:44-48`) goes (T2) | | Each change |
| `tests/unit/traffic/glue.test.js` | Keep | TR-R27, TR-R5 (a wind change reaches a running sim) | | Each change |
| `tests/unit/traffic/high-key.test.js` | Rewrite | TR-R31 redefines High Key. The 85 to 125 s window (`:391`) is a time gate (T2); the "ground truth" geometry is the code's own constants (`:37-50`, T3) | Climbs under power to High Key, then glides at about 120 KIAS round the PFL pattern; high or off heading at 2,100 ft goes around (TP1) | Each change |
| `tests/unit/traffic/landmarks3d.test.js` | Keep | TR-R23; windsock direction worked out in the test; wide bands, so positions aren't pinned | | Each change |
| `tests/unit/traffic/layout.test.js` | Keep | TR-R3, TR-R29 (structure), names as text (ALL-R14). The "no avoiding action" note (`:77`) changes when TR-R18 is built | | Each change |
| `tests/unit/traffic/lights3d.test.js` | Keep | TR-R23 (scenery as built) | | Each change |
| `tests/unit/traffic/map2d.test.js` | Keep, with changes | TR-R22, TR-R17 (marks in words as well as colour). Changes: route styles and type colours labelled "V6" (`:145`, `:207-212`) are re-sourced to the spec (T3); the glide footprint's 2.0 NM per 1,000 ft and 1,350 ft/min (`:887-894`) name the glide chart page (TP5) | | Each change |
| `tests/unit/traffic/nav-plans.test.js` | Keep, with changes | TR-R4, TR-R9. Waypoint counts (`:58-60`, `:103-105`, `:173`) and coordinates are the plan's own (T3, T8) and change at the route redraw (TR-Q28) | Named points carry the heights, speeds and bank in TR-R4 and TR-R9 with their page references; the final turn's bank stays under 45° | Each change |
| `tests/unit/traffic/pfl-rail.test.js` | Keep, with changes | TR-R14 (no snap, aligned touchdown). The PFL gets its own review later; the altitude-to-configuration schedule (`:25-32`) is the code's own and is re-checked then | | Each change |
| `tests/unit/traffic/pfl-solver.test.js` | Keep, with changes | TR-R14; one of the few files citing a manual page (NFM p.3-9 at `:67`). The zoom "takes 5 to 25 s" check (`:48`) checks height gained instead (T2). Reviewed again at the PFL review | | Each change |
| `tests/unit/traffic/pfl.test.js` | Rewritten at the PFL review (refactor PR 3) | TR-R14, TR-R35: the light PFL checks above. Old tests 2 and 3 expected the aircraft to stop on the runway and to crash short; spec 4.5 now has a touch-and-go and an ejection (Patrick, 08:33Z and 08:40Z). The 10-minute limits are safety stops (TP2) | | Each change |
| `tests/unit/traffic/plausibility.test.js` | Keep, with changes | The right kind of test (shape checks with page references, TP1, TP5). Changes: names and checks disagree ("±20 ft" asserts 100 at `:50`, `:61`; "240 ± 40 ft" asserts 100 at `:67-70`), so each band gets its own reason (T4, T8); final spacing follows TR-R18's 2,000 ft setting instead of 3,000; the 600 s and 1,000 s run limits are safety stops (TP2) | | Each change |
| `tests/unit/traffic/playback-bar.test.js` | Keep, with changes | TR-R21. Fails 1 of 28 at `6283f38`: after Pause, pressing Play again does not call play (`:118`). The expectation is right, so this looks like a real fault in the bar, not a stale test (inferred); browser failures at `tests/e2e/traffic.spec.js:110` and `tests/e2e/traffic.spec.js:314` look like the same fault. Changes: the first test's name says "8×" while it checks the 1× default (`:71`); Runway 11R is hidden, not a disabled choice (TR-R28) | | Each change |
| `tests/unit/traffic/profile-store.test.js` | Keep | TR-R25 (save, replace, refuse, blocked storage) | | Each change |
| `tests/unit/traffic/profile.test.js` | Keep, with changes | TR-R25 and hostile-file checks kept. The V6 built-in profile pin (speed 8, `:56-73`) and "V6's generic pattern" for a new setup (`:380-387`) follow TR-R2 and TR-Q16 instead of V6 (T3) | | Each change |
| `tests/unit/traffic/profiles-panel.test.js` | Keep | TR-R25 (asks before overwrite and delete, focus, names as text) | | Each change |
| `tests/unit/traffic/readouts.test.js` | Rewrite (about 14 tests) | About 14 checks are "as V6 does" (rounding, wording, a floating-point quirk pinned on purpose at `:66-72`) (T3); the golden file its header names doesn't exist (Q-T8, decided). The hand-worked strings and the clock past one hour (TR-R21) stay | Rounding and wording follow the spec; turn radius 736 ft at 120 kt and 2 G is worked out in the test from r = v²/(g·tan φ) | Each change |
| `tests/unit/traffic/rewind.test.js` | Keep and park | TP7, TR-R21: replay equals the forward run is the key Traffic invariant. Never finished at `6283f38` (300 s limit; still running at 1,200 s; passed in CI at `adf1e1b`). Under Q-T4 (decided) it runs at sign-off until it finishes reliably. Changes: the five computer-time tests (`:176`, `:616-623`, `:642`, `:664`, `:781`) come out (T2) and rewind speed becomes a checklist look; the long runs (700 s × many, 30 aircraft × 20 min) are cut down (T9); edit-mid-run cases use spawn and Remove instead of route edits (TR-R3) | | Sign-off until it finishes in seconds; then each change |
| `tests/unit/traffic/route.test.js` | Keep, with changes | Turn geometry and path checks kept (radius 736 ft, R·tan(Δθ/2)). Changes: "as V6 does" labels and V6's palette (`:63`, `:272`, `:297`, `:303`) are re-sourced (T3); the V6 lap length 156,924 ft ±500 (`:119`) goes; the builders for new patterns, entries and splits (`:216-272`) leave with the route editor (TR-R3) unless TR-Q16 keeps a generic pattern | | Each change |
| `tests/unit/traffic/scene.test.js` | Keep | TR-R3, TR-R22 (routes list, leg marks); the aircraft count follows TR-R2's opening setup | | Each change |
| `tests/unit/traffic/scenery3d.test.js` | Keep | TR-R23. One fix: two tests give different apron boxes (`:46` and `:123-127`) and both pass (T8) | | Each change |
| `tests/unit/traffic/settings-panel.test.js` | Keep | TR-R27. One fix: `assert.ok(legends(panel).length >= 0)` can't fail (`:259`, T8) | | Each change |
| `tests/unit/traffic/sim.test.js` | Rewrite (about 41 tests) | 41 of 47 cases read the state at a hard-coded second ("first lap ends at 118 s", V6 start times `[12, 137, ...]` at `:104-107`) (T2, T3). Same seed same run, frame-rate independence and conflict flags are kept | Each case found by event (phase, landing, join) with a safety stop (TP2); conflict flags checked with two aircraft flown to cross (TR-R17) | Each change |
| `tests/unit/traffic/tick-aircraft.test.js` | Keep, with changes | TR-R30: one mode owns the aircraft; landed aircraft don't move; crosswind gives crab. The two checks that the blend lasts exactly 1.0 s (`:217-260`, `:404-431`) become "no jump during the blend" (TP4); the blend length is a design choice, not a requirement | | Each change |
| `tests/unit/traffic/types.test.js` | Rewrite | TR-R16: the CT-156 only for now; the six other types go to the future list. The circuit speeds are the code's own constants with "standard SMM circuit speeds" in the name and no page (T3) | The CT-156's circuit speeds checked against their page references (TP5); unknown types fall back to the CT-156; the type system accepts a new type | Each change |
| `tests/unit/traffic/vector-sim.test.js` | Rewrite (about 14 tests) | About 14 checks read the state at fixed seconds (T2), several can pass for almost any outcome (`:244`, `:334`, `:378`), and comments say times were widened to pass (`:293`, `:360`). Kept: the perch moves upwind with the wind and the drift equals wind × time, both worked out in the test (TR-R8, TP3) | TP1 and TP3: the break, final turn and touch-and-go checked by shape in calm and in wind | Each change |
| `tests/unit/traffic/view3d.test.js` | Keep | TR-R23; bank and pitch from turn rate and climb worked out in the test; everything built is freed | | Each change |
| `archive/tests/crosscheck/traffic-expected.json` | Retire | The recorded output of an older version of the code (T3); nothing compares against it, and a re-measure differs in 57 of 91 rows | | |
| `tests/crosscheck/traffic-measure.js` | Rewrite as a sign-off report | TP5, T10: each measured number shown next to its page reference, Patrick's overrides marked, nothing failed. `tests/unit/traffic/plausibility.test.js:33` keeps using `flownCorners` from it | A table printed at sign-off from the current built-in setup for Patrick and Dad to read | Sign-off |
| `tests/e2e/traffic.spec.js` | Keep, with changes | 13 pass, 37 fail, 5 skipped at `6283f38` (what each failure shows is below). Changes: tests set the speed they need and wait for events, not real seconds (TP8, T2); the route-editor tests and the two skipped editor tests (`:292`, `:362`) retire (TR-R3); the panel's name is "Scenarios and notes"; the three skipped replay-after-edit tests (`:1190`, `:1210`, `:1233`) come back using spawn and Remove (TR-R19, TR-R21) | New beside it: crab and ground speed shown (TR-R6), Remove (TR-R19), the opening setup (TR-R2) | Smoke, layout, buttons, leaving and offline parts each change; the whole file at sign-off |
