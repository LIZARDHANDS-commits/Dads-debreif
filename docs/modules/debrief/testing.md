# Debrief: testing and sign-off

The whole-tool testing policy in `../../TESTING.md` applies. This file adds the module's own rules, how each of its requirements is checked, its sign-off checklist, and what happens to each of its test files.

Sources in this file point to where things were on 4 Oct 2026: `pf/` means the project files (`pf/`, private), and repo paths such as `docs/records/` or `specs/` are now under `archive/` (see `archive/README.md`).


Built on DB-R1 to DB-R26, ratified by Patrick on 4 Oct (`pf/reset/1-requirements/requirements.md:69-110`). The per-test keep, rewrite or retire marks are in the test register's Debrief section.

**Today:** 24 unit files (291 tests, all pass) and one browser file (63 tests, all pass at `6283f38`). The Debrief is in the best shape of the five modules: most tests already check behaviour, the weather tests use real recorded replies as input, and nothing reads `tests/helpers/tolerances.js`. What needs work is about 15 checks pinned to V6's numbers, one pin of the code's own output at fixed seconds of the example flight, the EM chart tests (the chart was dropped, DB-R20), and the wind tests, which cover Lead only (DB-R8 now says every ship).

## Debrief rules on top of the whole-tool rules

- **D1. The example flight is real data, used as input.** Dad's four recorded tracks may be replayed in tests. Checks over it are whole-flight invariants ("at every second, no ship shows a G above what its speed allows"; "in a steady level turn, bank and G agree"), never a value at a chosen second (T2, T3).
- **D2. Hand-made flights for exact answers.** Where a test needs an exact answer, it builds a simple flight whose answer is known from the geometry (a steady 3°/s circle, two ships flying east 4,000 ft apart) and works the answer out in the test.
- **D3. Wind is checked the same way for every ship (DB-R8).** Two ships on the same path at the same time show the same est. IAS. A steady turn flown in a steady wind reads the same G and bank all the way round. With Winds aloft off, every ship says "(no wind)".
- **D4. Labels are part of the answer (DB-R6, DB-R23).** A test that checks a number also checks its label: "recorded" or "est.", "(no wind)" or "(wind-corrected)", "GPS gap", or the reason it is blank.
- **D5. The Debrief's own cut-offs are labelled as judgement calls.** The 80 kt airborne gate, the 350 kt ground-speed cap and the 5 s gap rule are the Debrief's choices, not manual numbers, and stay open in DB-Q6. Tests name them as such, so a change to one changes one test.
- **D6. Shown as "--" is how the Debrief flags an impossible G.** DB-R7 says a G above what the speed allows, or above +7 G, reads "--" because in recorded data it means a GPS glitch. That is the Debrief's form of T10's "the screen says so".
- **D7. Weather is display only.** Weather tests check the right report or picture is chosen for the moment (never a later one), its age is shown, and a failing source says so while the replay keeps playing (DB-R18). Real recorded replies are used as input; forecast values are never pinned.

## How each Debrief requirement is checked

"Each change" means a unit test or one of the per-change browser checks in section 2 (smoke, layout, accessibility, buttons, leaving, offline). Checks that need the whole Debrief browser file run at sign-off.

| Requirement | Automatic check | When | Hands-on checklist |
|---|---|---|---|
| DB-R1 Load up to four tracks, fitted | Load the example flight: all four tracks inside the view; the status count matches the tracks drawn; three files say three | Each change | Load your own ForeFlight files |
| DB-R2 A bad file never destroys what's loaded | Load a good flight, then a broken file: the first flight is still there and the message names the file | Each change | |
| DB-R3 2D and 3D show the same moment | Play, switch to 3D and back: same clock, still playing; empty 3D shows the "load a flight" message | Sign-off (browser) | |
| DB-R4 Bad GPS never shown as flying | No altitude below the ground anywhere in the example flight; no line drawn across a long gap; a gap reads "GPS gap"; a parked ship has no 3/9 line | Each change | |
| DB-R5 Smooth movement, real speed at the ends | First and last moments show a real speed; a hidden tab doesn't jump the clock ahead | Each change | |
| DB-R6 Pitch, G and bank say where they came from | A track with a bank column shows bank "recorded", G and pitch "est."; blank pitch is never "0° recorded" | Each change | |
| DB-R7 Only possible numbers shown | Whole example flight: no G above its speed's limit or +7 G is shown as a number; bank and G agree in level turns (D1, D6) | Each change | |
| DB-R8 Wind the same for every ship | D3's checks | Each change | |
| DB-R9 Geometry measured the same for every pair | Hand-made pairs: each range labelled horizontal or 3D; closing is positive, opening negative | Each change | |
| DB-R10 Standards from the 15 Wing numbers | Defaults match the manual page references in the spec; change one, reload, kept; reset restores; no verdict on the ground; no "ON PARAMETERS" without a standard | Each change | The verdicts look right to a formation pilot |
| DB-R11 Real interval and sweep shown | With More detail open, each wingman shows interval and sweep | Each change | |
| DB-R12 Playback controls | Step, speeds, whole-second scrubber, Play at the end restarts, keys don't fire while typing. "Play 3 s, the clock moved about 3 s" stays a checklist look, not a test (T2) | Each change | Play, scrub and step through a flight |
| DB-R13 Map pan, zoom, Fit, Follow Lead | Fit brings the whole sortie back; Follow Lead keeps Lead centred | Sign-off (browser) | |
| DB-R14 Layers show or hide at once | Paused, tick each layer: the picture changes; paused does no drawing work | Each change | |
| DB-R15 3D attitude right | Left turn: left wing low; climb: nose up; the ground stays still; "Altitude ×2" shown (independent geometry, not V6's camera numbers) | Each change | Default 3D view: ships can be told apart |
| DB-R16 DFPs belong to their flight | Added out of order: listed in time order; another flight: empty list; names show as text | Each change | |
| DB-R17 Save and CSV | Save, close, reopen: same tracks, DFPs, standards and time; CSV has one row per second, gaps flagged, unknowns blank, and matches the screen | Each change | Open the CSV in a spreadsheet |
| DB-R18 Weather toggles | D7's checks for METAR, satellite, winds aloft and wind arrows; all off at first | Each change | Weather looks right for a flight you remember |
| DB-R19 Tennis ball gives one answer | A known setup (target 984 ft ahead on the nose) gives INTERCEPT; the panel's words agree with the 2D and 3D arc | Each change | |
| DB-R20 EM chart (dropped) | none; its tests retire | | |
| DB-R21 First visit shows only the essentials | Fresh open with a flight: no menu open, only the default layers on; Reset layout restores the start | Each change | Nothing on screen you don't need first |
| DB-R22 Nothing overlaps at 1280 | Layout check with each menu open in 2D and 3D (section 2); no-WebGL shows a message in the toolbar | Each change | |
| DB-R23 Every blank has a reason | D4 | Each change | |
| DB-R24 Ships told apart by colour and number | The four colours and numbers; labels readable at 4,000 ft spacing zoomed out is a checklist look | Each change | Labels readable when the formation is close |
| DB-R25 Files are untrusted | A script-tag name shows as text; an oversize file is refused with a message | Each change | |
| DB-R26 Offline after one visit | Network off: the example flight plays; Satellite says it needs a connection | Each change | |
| DB-R27 Gaps drawn as a flyable guess, never judged | `tests/unit/flight-data/gap-fill.test.js` (the PR's one test, DB-Q24): Lead's real, recorded level 88° turn in the example flight (fixes strictly between 18:55:12Z and 18:55:46Z deleted, 34 s, track 119° to 031°, 259 to 267 kt ground speed, about 12,250 ft) is filled and compared with the deleted fixes. Expected from standard aerodynamics on that data: turn rate 88° ÷ 34 s = 2.6°/s, V = 444 ft/s, tan(bank) = V × rate ÷ g gives about 32° and 1.18 G, radius about 9,800 ft, and the chord misses the arc's middle by R(1 − cos 44°) ≈ 2,760 ft. Checks: every second within 500 ft of the deleted real fix (about 1.1 s of flight, under a fifth of the chord's miss: a looser margin than the shared table because the fill is a guess and 500 ft still tells an arc from the chord); the middle of the fill on the arc's side of the chord, at least 1,380 ft from it (half the chord's miss); bank 32° ± 5° and G 1.18 ± 0.5 (shared table); roll rate never over 0.45°/s per KTAS (the T-6 limit, a physical limit); height within ± 100 ft of the recorded (shared table); every filled moment marked estimated, and the flight model still says "in a gap" there | Each change | Load the example flight: at 18:47:46Z #1's 87° turn is a dotted curve in a shaded zone, not a straight line; turn the fill off: the broken line is back |
| DB-R28 Ride any seat in 3D | none (DB-Q24 picked the gap test as the one test; the view is checked by eye) | | Cockpit, #1 front seat: a left turn tilts the horizon with the left wing low, a climb puts the nose above it, the panel says "attitude estimated from the GPS track"; in a filled gap the caption says "GPS gap: estimated path"; the rear seat looks over the front seat |

**At Debrief sign-off:** the full Debrief browser file, the hands-on checklist above, and one look in real Safari at the 3D view.

**Saved radar and lightning** went to the future list (DB-Q19), but Patrick chose to leave the built feature in as it is (card, 4 Oct 2026 05:03Z). Its three test files stay and keep running; they leave only if the feature is ever removed.


## Sign-off checklist

Anyone can run it, in the real app, from the module's default start, on a laptop at 1280 wide, and send Patrick the result with the date, their name and the version shown on screen (`../../TESTING.md`, section 4). Anything not seen working is listed as unseen.

### From the ratified requirements (the hands-on column above)

- [ ] Load your own ForeFlight files (DB-R1)
- [ ] The verdicts look right to a formation pilot (DB-R10)
- [ ] Play, scrub and step through a flight (DB-R12)
- [ ] Default 3D view: ships can be told apart (DB-R15)
- [ ] Open the CSV in a spreadsheet (DB-R17)
- [ ] Weather looks right for a flight you remember (DB-R18)
- [ ] Nothing on screen you don't need first (DB-R21)
- [ ] Labels readable when the formation is close (DB-R24)
- [ ] A gap is drawn as a dotted best guess in a shaded zone, the ship marked "est.", and the readouts still say "GPS gap"; Layers → Fill GPS gaps off brings back the broken line (DB-R27)
- [ ] Ride #1's front seat, then #2's rear seat, through a turn and through a filled gap (DB-R28)

> The old checklist below was written before the reset. It is refreshed against the requirements above when the module's work resumes: lines that test V6 numbers or exact times are rewritten or dropped.

### Carried over from `archive/docs/checklists/debrief.md`

#### Sign-off checklist: the Debrief Viewer

Anyone can run this in about half an hour, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/debrief

You'll want two or more of your own ForeFlight track files (.kml) from one formation sortie. For the side-by-side lines, keep V6 (the old single-file tool) open in another tab.

### First look

- [ ] The Debrief Viewer card on the home screen opens the debrief. It shows **Load tracks**, **Example flight**, a status line reading "No flight loaded", the map, the playback bar, the Formation card and DFPs. Nothing else is open, and nothing covers anything else.
- [ ] **Example flight** loads four tracks, fitted to the map, and the status line says "4 tracks loaded" with the gaps it found.
- [ ] Press the status line. It opens a list of each track: positions kept, time span, anything left out and why, GPS gaps, and time trimmed to the shared window.

### Your own tracks

- [ ] **Load tracks**, pick your files. A small table gives each file a ship number (#1 to #4) in the order picked. Change one ship number: the file that had it swaps. Press **Load**.
- [ ] The tracks show, fitted to the map. #1 is blue, #2 green, #3 red and #4 white with a dark outline. Every ship carries its number, and #4 is easy to see.
- [ ] Pick a file that isn't a track (any .txt renamed .kml). The debrief says which file and why, and what was loaded before stays loaded.

### Playback

- [ ] **Play** runs the flight. The time in the bar shows Zulu first and Moose Jaw local beside it (or the other way round if you chose that in Settings).
- [ ] **Pause**, the step buttons, the speed menu and the scrubber all move the same clock. Space plays or pauses, and ← and → step one second (not while typing in a box).
- [ ] Drag the scrubber to a busy moment. The numbers on the Formation card change with it.

### Readouts and standards

- [ ] The Formation card has one line per wingman, with its label (for example On parameters, WIDE or AFT) and the one number that's off: feet for interval and #3's offset, degrees for sweep (0 to 10° behind the 3/9 line passes, per the SMM). Lead's line shows est. IAS and G, and the target it's judged against: 220 kt in the low block, 200 kt in the mid block.
- [ ] **More detail** opens altitude, speed, G, pitch and bank with where each came from, plus aspect, HCA, closure and spacing for every pair. It stays open after a reload.
- [ ] **Debrief settings** (under the Formation card, closed at first) opens the standards editor. Change "Spread maximum", then reload: the change is kept. A silly value (a letter, or a negative number) is refused with a message. **Reset to the default standards** puts the SMM's numbers back: spread 4,000 to 6,000 ft with 0 to 10° of sweep, #3 7,000 ± 1,000 ft back, and Lead 220 kt low / 200 kt mid, ±10 kt, 1.0 ± 0.2 G.
- [ ] Compare three moments with V6 side by side (same file, same time): spacing between #1 and #2, #2's aspect and HCA, and Lead's speed. They match, except where a decision changed a number on purpose (est. IAS instead of ground speed, D31; turn rate without V6's divide by 2, D39; the SMM's sweep, offset box and lead speeds instead of V6's, D114 to D116). Note any difference and the time.

### The map

- [ ] Drag pans, the wheel zooms, and **Fit** brings the whole flight back.
- [ ] **Layers**: turn each one on and off (grid, spacing lines, trail, 3/9 lines, fighting-wing cone, clock marks, safety bubble, Follow Lead). Each shows or hides at once, even while paused. Reload: they're as you left them. **Reset layout** puts the defaults back.
- [ ] **Satellite imagery** shows imagery under the tracks with Esri's credit in the corner.
- [ ] **Routes and charts**: pick a route, then a VNC chart (South, North or Both). The chart shows under the tracks with "not for navigation" in the credit line. **Chart alignment** nudges it and **Reset alignment** puts it back.

### Weather at the time of the flight

- [ ] **Weather** → **METAR**. A line under the playback bar gives the report in force from the airfield nearest Lead, with its time and age (for example "CYMJ 1400Z (12 min before) · VFR · wind 270/12 kt …"). Small ticks on the scrubber mark each report; hover or focus one to read "METAR 14:00Z" or "SPECI 14:32Z", and a special's line starts with "SPECI" (a second or two after the reports first show). Drag past a tick: the line changes to that report, never to a later one.
- [ ] **Report as sent** shows the METAR exactly as issued. **METAR from** picks another airfield. Turn **METAR** off: the line and the ticks go.
- [ ] With a flight from the last 90 days, **Weather** → **Satellite (GOES-West)** lays the satellite picture under the tracks, and the line under the map says its time and age ("Satellite 14:30Z, 2 min before"). Play: the picture changes every 10 minutes of flight time. **Satellite picture** → **Infrared** swaps it. With an older flight it says "Satellite not kept".
- [ ] **Weather** → **Winds aloft (model)**. A line under Lead's line on the Formation card gives the model wind at Lead's altitude, in a neutral colour, for example "model wind 270°T/25 kt at 8,500 ft (HRDPS 14Z, Open-Meteo)" (true direction, knots, marked as a model value). Climb or descend: the wind changes with height. Drag across an hour (for example 18:59 to 19:01Z): the wind changes smoothly, with no jump, and the label names both model hours ("HRDPS 18–19Z"). **Wind model** → **HRRR** gives the US model's wind. Near the ground, below the lowest model level that is above the field (about 2,100 ft at Moose Jaw: on the ramp, the roll, landing), the line says "below the model's lowest level: see the METAR" and shows no wind.
- [ ] **Weather** → **Wind arrows (model)** (it needs nothing from Winds aloft). Nine small grey arrows appear on the 2D map, three across and three down over the flight, each with a label such as "280°T/38 kt" (true direction the wind blows from, knots) and pointing the way the air moves (a west wind points east). Under the map: "Model wind at 8,000 ft (HRDPS 18–19Z, Open-Meteo)", and under the height box "9 of 9 points have model wind". Drag and zoom the map: the arrows stay on their places. Change **Wind arrow height** (2,000 to 30,000 ft, steps of 500): the arrows and the caption change and, with the flight's clock, the wind blends smoothly across the hour. At 2,000 ft near Moose Jaw there is no model level above the ground: no arrows, and the status says "no model wind at 2,000 ft here (below the model's lowest level)". **Wind model** → **HRRR** gives the US model's winds. Switch to 3D: no arrows and the status says they show in the 2D map only. Turn the item off: the arrows and the caption go. In your browser's network tool, turning the item on makes one request to Open-Meteo, for nine points.

### 3D

- [ ] The **3D** switch shows the same moment in 3D, and playback carries on without a jump. Each ship is a CT-156 Harvard in the Moose Jaw paint, with its number on the tail and nose; **3D settings** → **Paint** → **Ship colours** paints them plainly. Switching back to 2D keeps the time.
- [ ] Drag turns the view and the wheel zooms. **3D settings** changes the camera, altitude scale, model, trail and ground options. **Reset view** goes back to V6's view.

### DFPs, save and open

- [ ] **+ Add** marks this moment as a DFP. Rename it and write a note. Add another earlier one: the list stays in time order. **Next DFP** and **Previous DFP** jump between them.
- [ ] **Save, open, CSV** → **Save debrief** downloads a `.dadsdebrief.json` file.
- [ ] **Saved radar and lightning**, on the real ECCC (only possible within 3 hours of a real flight, so do it with a flight you have just flown, or with any track log from the last 3 hours). **Weather** shows **Save radar and lightning with this debrief** and, under it, "ECCC keeps radar for 3 hours…". Nothing is fetched by ticking **Radar** or **Lightning** (they say "not saved yet" under the map). Press the button: a line counts "Saving radar and lightning: 12 of 39" and the button reads **Cancel** (press it once to see nothing is kept, then start again). When it finishes it says "Kept with this debrief: N radar and lightning pictures, 14:06Z to 15:12Z. Save the debrief to put them in the file." Tick **Radar** and **Lightning**: coloured radar (and any lightning) is laid under the tracks, lines up with the coast, lakes and towns of **Satellite imagery**, and the line under the map says "Radar 14:30Z, 2 min before · Lightning 14:30Z, 0 min before · Data Source: Environment and Climate Change Canada". Play: the pictures change every 6 minutes (radar) and 10 minutes (lightning) of flight time, never ahead of the moment. Turn the network off, **Save debrief**, **Close flight**, then **Open debrief** with that file: the same pictures play back, and the network tool shows no request to `geo.weather.gc.ca`. Closing a flight whose pictures aren't in a saved file yet asks first, and so do switching to another tool from the home page links, Back, and reloading the page. A flight that ended more than 3 hours ago (the example flight) says "Not kept: radar is only available for 3 hours after the flight." under the Weather items and offers no button.
- [ ] **Close flight**, then **Open debrief** with that file. The same tracks, DFPs (with notes), standards and time come back.
- [ ] **Export CSV** downloads a `.csv` file. It opens in a spreadsheet with one row a second and each aircraft's columns side by side, including a GPS gap column.

### Tools

- [ ] **Tools** → **EM chart** opens the T-6 EM chart below the map, with each ship's dot and a fading trail. The map gets shorter, and nothing covers it. The chart follows the formation's altitude, or pick 6,500, 8,000 or 13,000 by hand. **Close EM chart** closes it.
- [ ] **Tools** → **Tennis ball** opens its panel. Pick the shooter and target. The answer (INTERCEPT, IN CONE or OUT OF CONE) matches the arc and cone drawn on the map and in 3D. Change the ball speed or cone width and the answer and drawing change together.

### Leaving and coming back

- [ ] Go **Home** while the flight is playing, then open the debrief again. Nothing is left running (the page stays quick), and your layout is as you left it.
- [ ] Load the example flight once, then turn the network off and reload. The debrief still opens and the example flight loads and plays. Turn the network back on.

### Sign-off

Browser and version: ________  Date: ________  Name: ________

Differences from V6 noted (time, number, V6 value, new value): ________

All lines ticked means the Debrief Viewer is done (R21).


## Test files and what happens to each

From the ratified test register (`pf/reset/5-testing/test-register.md`, Part B). The clean-up pull requests carry these out.

| File | Keep, rewrite or retire | Why (policy line or requirement) | What the rewrite checks instead | Runs |
|---|---|---|---|---|
| `tests/unit/debrief/attitude.test.js` | Keep | DB-R15; independent geometry, an invariant over 240 attitudes (T1) | | Each change |
| `tests/unit/debrief/debrief-session.test.js` | Keep | DB-R17, DB-R25; round trips and hostile-file checks (T1). The saved-radar block in the file goes when that feature is archived (DB-Q19) | | Each change |
| `tests/unit/debrief/dfp.test.js` | Keep | DB-R16, DB-R25 | | Each change |
| `archive/tests/unit/debrief/em.test.js` | Retire | DB-R20: the EM chart was dropped by Patrick on 4 Oct; nothing else uses `em.js` | | |
| `tests/unit/debrief/export-csv.test.js` | Rewrite (one test) | DB-R17 is kept. The wind test checks Lead only, and DB-R8 now says every ship (D3) | Every ship's IAS in the CSV uses the same wind when Winds aloft is on, and reads "(no wind)" when off | Each change |
| `tests/unit/debrief/frame.test.js` | Rewrite (three tests) | T3: the camera drag and zoom steps are V6's numbers (yaw −31, pitch 51, zoom 78.4 and 62.3). The grid and ship-placement tests are kept | Dragging turns the view the way the mouse moves; zoom reaches the whole sortie and a close view and stops at its limits; the datum line sits at the ground | Each change |
| `tests/unit/debrief/geometry.test.js` | Rewrite (three tests) | T3: expected positions are labelled "V6 line 3027" and similar. DB-R14 keeps the layers | The same layers checked against their definitions, worked out in the test: the 3/9 line is square to the ship's heading through the ship; the cone opens by the setting's angle; trails break at GPS gaps | Each change |
| `tests/unit/debrief/map-wind-arrows.test.js` | Rewrite (one check) | T8: the arrow end point is worked out with the code's own `arrowVector`, so it can't catch a wrong direction | The end point for a hand-picked wind (from 270° at 20 kt) is typed in from the geometry | Each change |
| `tests/unit/debrief/overlay.test.js` | Keep | DB-R4, DB-R23 | | Each change |
| `tests/unit/debrief/readouts.test.js` | Rewrite (about 4 of 39 tests) | Most tests are independent and kept (acos(1/G), stall line, sweep angle, SMM and Gen Book standards). Three things change: the `EXAMPLE_BANK_PIN` test pins the code's own output at seconds 1676 to 1688 (T2, T3); the wind tests cover Lead only (DB-R8); the IAS test compares with `emPoint` from the dropped EM chart (DB-R20, T8). The 80 kt and 350 kt cut-offs stay, labelled as judgement calls (D5, DB-Q6) | Over the whole example flight, bank and G agree in level turns (already there at `tests/unit/debrief/readouts.test.js:668-679`, which makes the pin unnecessary); every ship's est. IAS uses the same wind (D3); est. IAS checked against a hand-worked value for a known track | Each change |
| `tests/unit/debrief/scene.test.js` | Keep | DB-R6, DB-R15; acos(1/G) worked out in the test; the 10° and 1°/s thresholds are Patrick's rule | | Each change |
| `tests/unit/debrief/state.test.js` | Rewrite (one test) | T8: the test at `:45` retypes the whole `LAYOUT_DEFAULTS` object (about 80 keys, EM chart keys included), so it only checks the code against itself and breaks on any change. The colour test stays, now sourced from DB-R24 rather than V6 | First visit: every menu and panel closed and only the default layers on (DB-R21); the EM chart keys are gone | Each change |
| `tests/unit/debrief/tennis.test.js` | Keep | DB-R19; 300 m = 984 ft worked out independently | | Each change |
| `tests/unit/debrief/view3d-view.test.js` | Keep | ALL-R12 (freed on close), DB-R22 (no-WebGL message), DB-R4 | | Each change |
| `tests/unit/debrief/vnc.test.js` | Rewrite (two tests) | T3: "V6's mesh, every triangle" (18 × 18 × 2 draw calls) pins how V6 drew, not what the user sees. The fetch, failure and corner tests are kept (DB-R14) | The chart covers its four corners on the map and is redrawn once per frame; the mesh size isn't checked | Each change |
| `tests/unit/debrief/weather-metar-feed.test.js` | Keep | DB-R18. The one-second wait between calls is a rule about request spacing, checked with a fake timer, not a flight time (T2, Q-T9, decided) | | Each change |
| `tests/unit/debrief/weather-metar.test.js` | Keep | DB-R18 ("never a later one") | | Each change |
| `tests/unit/debrief/weather-satellite.test.js` | Keep | DB-R18; fixed dates, never the computer's clock | | Each change |
| `tests/unit/debrief/weather-saved-layer.test.js` | Keep while the feature stays | DB-Q19 put saved radar and lightning on the future list; Patrick left the built feature in (card, 4 Oct 2026 05:03Z) | | Each change |
| `tests/unit/debrief/weather-saved-radar-feed.test.js` | Keep while the feature stays | As above | | Each change |
| `tests/unit/debrief/weather-saved-radar.test.js` | Keep while the feature stays | As above | | Each change |
| `tests/unit/debrief/weather-slices.test.js` | Keep | DB-R18 | | Each change |
| `tests/unit/debrief/weather-wind-arrows.test.js` | Keep | DB-R18; one value worked out by hand from the fixture (`:327-342`), the model T3 asks for | | Each change |
| `tests/unit/debrief/weather-winds.test.js` | Keep | DB-R8, DB-R18; real recorded replies used as input, forecast values not pinned (D7) | | Each change |
| `tests/unit/flight-data/gap-fill.test.js` | New (10 Oct 2026) | DB-R27; Lead's real 88° turn with its middle cut out, expected values from standard aerodynamics on the recorded data (T3) | | Each change |
| `tests/e2e/debrief.spec.js` | Keep, with changes | All 63 pass at `6283f38`. Changes: about 5 checks labelled as V6's values (route count "V6's 19", V6's amber, the default camera −35/52/70, the tennis settings 350, 6, 3, 250) are re-sourced to the spec's defaults or changed to check behaviour (T3); the saved-radar tests leave with that feature (DB-Q19); the METAR "specials a second later" check stays as a request-spacing rule (Q-T9, decided) | Defaults are checked against the spec's stated defaults with their sources, not against V6 | Smoke, layout, buttons and offline parts each change; the whole file at sign-off |
