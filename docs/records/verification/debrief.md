# Debrief module verification (main at 94b00a1)

Checker: independent verification thread. Built with `npm ci`, `npm run build`, served with `vite preview` on port 4302, driven with Playwright Chromium at 1440x900 (also 1366x768 and 1100x700). Example flight loaded with the "Example flight" button. Scratch scripts are in the worktree's `s/` folder (not committed). Screenshots are in `shots/` next to this file. Raw number comparison output: `numbers-raw.txt`.

Nothing was pushed, committed or edited in the repo.

## Summary

| Severity | Count |
|---|---|
| High (wrong flight answer, or a control that does nothing or misleads) | 0 |
| Medium | 5 (M1 to M5) |
| Low | 13 (L1 to L13) |
| PILOT JUDGEMENT items | 4 (each has a recommendation) |

No dead buttons found. No overlapping panels or side tabs covering controls at 1366x768 or 1440x900. No console errors from the app in normal use (the only console errors came from Chromium reporting failed map-tile or METAR fetches caused by this container's network, or from three.js when WebGL was turned off on purpose). Axe (WCAG 2 A and AA) found nothing on the loaded 2D screen, with every panel open, or in 3D with settings open. All numbers I spot-checked match V6's own functions (section 2).

Top 5 issues:
1. M1 The standards judge things they were not written for: on the example flight 1,043 of 1,219 airborne wingman readings (86%) say TIGHT by about 3,900 ft, because the crew is flying close formation against the line-abreast spread. Lead is judged FAST or SLOW on the ramp and below the Low block floor (PILOT JUDGEMENT).
2. M2 Estimated bank often disagrees with the estimated G printed next to it (7 of 30 level samples off by more than 20 degrees), and flickers second to second for #2.
3. M3 In 3D a ship in a GPS gap is drawn with numbers ("bank 0, pitch 0", an altitude) where 2D and the readouts say "GPS gap" (D32).
4. M4 The readouts can show a GPS-spike G such as 8.29 G for a T-6 at level.
5. M5 Recorded bank has the wrong sign against the track's turn in 3 of 22 samples (PILOT JUDGEMENT).

## Findings

Known or planned column: I checked `tasks/debrief/todo.md`, `plan.md` and the spec. "No" means I found nothing that lists it.

### Medium

**M1. Standards labels judge close formation, taxi and Lead below the block floor** (PILOT JUDGEMENT, see PJ1)
- Where: Formation card (right column) and the on-map labels, 2D and 3D.
- Steps: Example flight. Look at the card at the start, and at 30, 41, 60 minutes in.
- Expected: Spec "Readouts and standards": default preset is the SMM's line-abreast spread 4,000 to 6,000 ft, 0 to 10 degrees of sweep, #3 7,000 +/- 1,000 ft aft, Lead 220 kt in the low block and 200 kt in the mid block (Gen Book p.12: low 6,000 to 10,000 ft, mid 10,500 to 15,500 ft; SMM 16.18 para 49, SMM 16.41 para 109). Spec says only "no label where no standard applies" (#21) and "a still Lead shows no label" (D52).
- Actual (numbers from the example flight, sampled every 10 s while Lead was above 100 kt ground speed, with the default standards): 1,219 wingman readings, 1,043 TIGHT (86%), 34 on parameters (3%), 50 WIDE, 92 other. Example: at 19:19:25Z ranges from Lead are 51, 175 and 271 ft and the card says "#2 TIGHT by 3,955 ft, AFT by 19 degrees". On the ramp (18:31:11Z, all four taxiing at about 10 kt) it says "#2 TIGHT by 3,991 ft, AFT by 76 degrees" and "Lead 10 kt est. IAS, SLOW (target 220 kt, low block)". At 19:44:06Z Lead is at 2,790 ft and is called FAST against "220 kt, low block", though the low block starts at 6,000 ft; 127 of 443 airborne samples (29%) are below 6,000 ft.
- Each individual number is right (interval 362.8 ft gives TIGHT by 3,637; checked against V6's classifier, see section 2). The problem is the standard being applied where it does not fit.
- Screenshots: `/mnt/project-files/verification/shots/debrief/03-airborne-2d.png`, `/mnt/project-files/verification/shots/debrief/07-zoomed-formation.png`, `/mnt/project-files/verification/shots/debrief/02-loaded.png` (ramp), `/mnt/project-files/verification/shots/debrief/95-1366-default.png`.
- Known or planned: No. V6 also judged everything against its one spread, so the behaviour is inherited, but the new SMM preset makes it louder.
- **Missing test:** `tests/unit/debrief/readouts.test.js`: run `readoutsAt` with the default standards over the example flight and assert that while Lead is under 50 kt (taxi) no wingman label and no Lead speed verdict is produced, and that a wingman under 1,000 ft from Lead in a tested close-formation setting is not labelled TIGHT by more than the band (fails today: 86% TIGHT). Also `tests/unit/core/standards.test.js`: `classifyLeadParameters` returns no verdict below the Low block floor (6,000 ft) if PJ1 is accepted.

**M2. Estimated bank disagrees with the estimated G beside it, and flickers**
- Where: More detail, "Live data" bank and G lines; 3D bank label; the 3D aircraft's roll.
- Steps: Example flight, open More detail, step the scrubber one second at a time around 27:56 to 28:08 after the start (scrubber value start+1676 to +1688), watch #2.
- Expected: D40 says bank comes from the real turn rate. G and bank on one line should agree in a level turn (bank = acos(1/G)).
- Actual: 1-second steps for #2: bank 5 left, 35 right, 0, 23 left, 4 right, 2 left, 3 left, 80 right, 0, 64 left, 0, 0, 14 left, while G reads 1.00 to 1.85 and pitch 0. At start+1682: "G 1.67 est., bank 3 left est." (a level 1.67 G turn is 53 degrees). Across 30 level samples (pitch within 10 degrees, G 1.15 or more) 17 were within 10 degrees of acos(1/G) and 7 were off by more than 20. Cause I can see in code: `bankFromTrack` (view3d/scene.js) takes the turn rate from headings between fixes about 1 s apart, while the G in the readouts is worked out over a 3 s window.
- The same estimated bank rolls the 3D aircraft, so #2 rocks left and right while flying straight.
- Not a V6 number (V6 has no 2D bank), so per the spec's "Ask first" any change needs Patrick.
- Recommendation: work the estimated bank over the same 3 s window as the estimated G (or from that G in a level turn), and show "-" for bank when the turn is under about 1 degree a second. Ask Patrick first.
- Screenshot: none needed; sample lines are in this file. Data: `numbers-raw.txt` shows the same fields at four times.
- Known or planned: No.
- **Missing test:** `tests/unit/debrief/scene.test.js` (or `readouts.test.js`): for every whole second of the example flight where pitch is within 10 degrees and est. G is 1.15 or more, assert `bankFromTrack` is within 15 degrees of acos(1/estG), and that consecutive seconds never flip side while the heading is constant (fails today for #2 near scrubber start+1676).

**M3. 3D draws numbers for a ship in a GPS gap**
- Where: 3D view, aircraft labels and stick labels.
- Steps: Example flight, scrub to 41:00 (19:00:04Z), switch to 3D. The card and More detail say "#2 GPS gap".
- Expected: D32 and the spec's Gaps line: while a ship is in a gap its readouts show "GPS gap" instead of numbers; the 2D map draws it hollow.
- Actual: 3D draws #2 as a normal aircraft with "bank 0, pitch 0" and "1,374 ft above datum". With the Flat marker model it is hollow, but the default Harvard model shows no sign of the gap.
- Screenshots: `/mnt/project-files/verification/shots/debrief/120-3d-labels-t41.png`, `/mnt/project-files/verification/shots/debrief/15-3d-flat.png`.
- Known or planned: No.
- **Missing test:** `tests/e2e/debrief.spec.js`: load the example, go to start+41:00 (a #2 GPS gap), switch to 3D and assert the 3D label text for #2 has no "bank" or "above datum" figures (read from `view3d/overlay.js` label list through a unit test in `tests/unit/debrief/scene.test.js` that feeds a gap ship and expects no attitude label).

**M4. GPS-spike G is shown as a real G**
- Where: More detail, Live data G line.
- Steps: Example flight, scrubber value start+2089 (about 34:45 in), read #2.
- Expected: A T-6 tops out at +7 G (V-n in the manuals index, energy notes). V6's own function returns nothing above 9 G.
- Actual: "G 8.29 est., bank 10 left est." at level (pitch -1). The ship's ground speed had just jumped between fixes (GS 231 to 243 kt, seconds after a bank flip), so this is jitter, not a manoeuvre.
- Recommendation: treat an estimate above the airframe limit (7 G) as unknown, or show it flagged as a likely GPS glitch.
- Known or planned: No. (V6 clamps at 9, so 8.29 is "correct" to V6.)
- **Missing test:** `tests/unit/debrief/readouts.test.js`: assert no ship row in the example flight shows an estimated G above 7 (the T-6 limit) at any whole second, or that such a value is flagged as a glitch (fails today at start+2089, 8.29 G).

**M5. Recorded bank on the wrong side of the turn** (PILOT JUDGEMENT, see PJ2)
- Where: More detail bank line ("recorded"), 3D roll.
- Steps: Example flight, scrubber start+28:13 (#3), start+31:13 (#4), start+40:13 (#4).
- Actual: 22 samples where the track was turning faster than 1 degree a second and bank was above 8 degrees: 19 agreed on the side; 3 did not. #3 "bank 33 right recorded" while the track turns left at 2.2 deg/s; #4 "12 right recorded" at 1.8 deg/s left; #4 "18 right recorded" at 1.7 deg/s left.
- Expected per D47: recorded bank is used when present. It is used here, so this is working as approved; the question is whether it should be trusted when it disagrees.
- Known or planned: No.
- **Missing test:** `tests/golden/debrief-3d.test.js` or `tests/unit/debrief/scene.test.js`: over the example flight, count seconds where recorded bank has the opposite sign to a turn faster than 1 degree a second and pin the count (3 of 22 sampled today) so a change to how recorded bank is trusted (PJ2) is a deliberate, tested change.

### Low

- **L1 Route names.** Routes and charts, Route list reads "TAC NAV 2, TAC NAV 3, TAC test North, TAC test South, TACNAV 1, TACNAV 4" (mixed spelling, so TACNAV 1 sorts after TAC test). Spec says "TACNAV 1 to 4". Names come from V6's files. `/mnt/project-files/verification/shots/debrief/menu-Routes-and-charts.png`. Known: No.
- **L2 Labels overlap at fit zoom and in 3D.** At Fit the four ship labels and standards labels print on top of each other ("#4 TIGHT / AFT" over "#3 TIGHT / FORE", `/mnt/project-files/verification/shots/debrief/06-label-overlap-crop.png`); with the fighting-wing cone on, the two "FW tail 500-1000 ft / 30-60" captions print over each other (`/mnt/project-files/verification/shots/debrief/50-layer-Follow_Lead.png`); in 3D the altitude and bank labels collide (`/mnt/project-files/verification/shots/debrief/120-3d-labels-t41.png`). Zooming in clears the map ones. Known: No.
- **L3 Menu and panel alignment.** Weather menu: the Satellite checkbox sits above its label instead of beside it (`/mnt/project-files/verification/shots/debrief/menu-Weather.png`). Tennis panel: units (kt, degrees, s, ft) drop onto their own line under each box, and the Gravity drop checkbox is not level with its label (`/mnt/project-files/verification/shots/debrief/21-tennis-2d.png`). Known: No.
- **L4 The Weather menu drops over the Formation card** (about 425 px wide), hiding the first lines of the card while open (`/mnt/project-files/verification/shots/debrief/menu-Weather.png`). It is a transient menu and closes with Escape. Known: No.
- **L5 DFP name and note boxes are unstyled.** Name and Note in an opened DFP render as flat grey boxes, unlike the dark inputs elsewhere (`/mnt/project-files/verification/shots/debrief/31-dfp-edit.png`). Known: No.
- **L6 A refused number keeps showing.** Standards and tennis panel: type -5 in Spread minimum; the box keeps "-5" while the message says "Kept 0 ft" (`Spread minimum must be between 0 and 20,000 ft. Kept 0 ft.`). The value used is right; the box disagrees with it until you leave it. Known: No.
- **L7 "Need a connection" when the server answers 503.** METAR fetch answered with 503 (stubbed): "CYQR METARs couldn't load. They need a connection." Slightly wrong wording for a busy server. Known: No.
- **L8 Satellite (Esri) failure is slow and partial failure is silent.** With no network the map keeps showing the Esri credit for about 8 to 10 seconds (three retries) before it says "Satellite imagery needs a connection. The grid still shows where things are." If only some tiles load, blank squares stay with no message (`/mnt/project-files/verification/shots/debrief/61-satellite-offline.png`). Known: No.
- **L9 EM chart is small.** At 1366x768 with the EM chart open the map is about 317 px tall and the chart image is 504 x 252 px with unreadable printed text (`/mnt/project-files/verification/shots/debrief/96-1366-everything-open.png`). Nothing overlaps, as the spec requires (#37). Known: No.
- **L10 3D aircraft are tiny and dark.** At defaults (size 260 ft, zoom 70) each Harvard is about 15 px wide and the altitude sticks dominate; the dark paint on the dark green ground has little contrast (`/mnt/project-files/verification/shots/debrief/10-3d-playing.png`, `/mnt/project-files/verification/shots/debrief/18-3d-zoomed-harvard.png`). Ship colours paint is easier to see (`/mnt/project-files/verification/shots/debrief/19-3d-zoomed-shipcolours.png`). Known: No. See PJ3.
- **L11 Map cannot be panned from the keyboard.** + and - zoom the 2D map, Space/arrows/Home drive playback (by design, `arrowKeys: false`), but there is no key to pan. Follow Lead helps. Known: by design in the plan, but no keyboard alternative is listed.
- **L12 Grid vanishes at maximum zoom.** Zoomed in to the limit the map shows nothing (grid cell is larger than the view) (`/mnt/project-files/verification/shots/debrief/101-zoom-in-max.png`). Known: No.
- **L13 three.js logs console errors when WebGL is off.** The fallback message is right ("3D needs WebGL, which is turned off in this browser." and the view stays 2D), but three.js also logs 3 console errors; a browser test that fails on console errors would trip. `/mnt/project-files/verification/shots/debrief/102-no-webgl.png`. Known: No.

### Missing tests for the Low findings

| ID | Test that should have caught it |
|---|---|
| L1 | `tests/unit/debrief/routes.test.js` (new, or `tests/golden/debrief-routes.test.js`): route names all follow one spelling ("TACNAV n") and sort in numeric order. |
| L2 | `tests/e2e/debrief.spec.js`: at Fit zoom with the example loaded, no two map labels' boxes overlap (label placement returns boxes; unit-test the placement in `tests/unit/debrief/geometry.test.js`). |
| L3 | `tests/e2e/debrief.spec.js` overlap scan: add a check that a checkbox and its label share a row (same vertical centre within 4 px) and that a unit suffix sits on its input's row. |
| L4 | `tests/e2e/debrief.spec.js`: with the Weather menu open, its box does not intersect the Formation card (menus stay inside the stage or flip left). |
| L5 | `tests/e2e/a11y.spec.js` or `visual.spec.js`: an opened DFP's Name and Note use the same input style as the other panels (computed background colour equals the ui-kit input token). |
| L6 | `tests/e2e/debrief.spec.js` standards test: after a refused value the box shows the kept value (or is marked invalid) rather than the refused text. |
| L7 | `tests/unit/debrief/weather-metar-feed.test.js`: an HTTP 503 answer gives a "busy, try again" line, distinct from the offline line. |
| L8 | `tests/e2e/debrief.spec.js` with tiles routed to fail: the "needs a connection" line appears within 3 s; with half the tiles failing a partial-failure line appears. |
| L9 | `tests/e2e/debrief.spec.js` at 1366x768 with the EM chart open: the map keeps at least 400 px of height (or the chart image is at least 700 px wide). |
| L10 | `tests/unit/debrief/scene.test.js`: at default size and zoom a Harvard projects to at least 30 px wide on the 846 px view (pins the default size). |
| L11 | `tests/e2e/debrief.spec.js`: a keyboard-only route to pan the 2D map (for example Shift+arrows) moves the view. |
| L12 | `tests/unit/debrief/geometry.test.js`: the grid step is chosen so at least two lines show at every allowed zoom (pin `gridStepFt(zoom)`). |
| L13 | `tests/e2e/debrief.spec.js`: with WebGL disabled (`--disable-3d-apis`), switching to 3D shows the message and logs no console error (catch three.js and log once quietly). |
| Doc drift | `tests/unit/source-rules.test.js`-style check is overkill; simply update `specs/SPEC-debrief.md` line 52. |

### Documentation drift (Low)
- Spec "The screen" table says Reset and the second time zone sit in a "more" menu at 1366 px; `tasks/debrief/todo.md` task 2 and the screen show them in the bar at every size. Spec text is out of date.
- `docs/checklists/debrief.md` matches the screen labels I clicked (Weather, METAR, Report as sent, Satellite picture, Paint, Ship colours, Close EM chart, Reset alignment, Save debrief, Close flight, Open debrief, Export CSV).

## Pilot judgement items (each with a recommendation)

**PJ1. Should the spread, sweep and lead-speed standards apply everywhere?** (from M1)
- Question: The default preset is the line-abreast spread. The example sortie is mostly close formation (wingmen 50 to 300 ft from Lead), and 29% of airborne time is below the Low block floor. Should the Formation card say TIGHT/AFT for close formation, and FAST/SLOW for Lead outside 6,000 to 10,000 ft and 10,500 to 15,500 ft?
- Recommendation: (a) show no wingman standards label, and no Lead speed judgement, while Lead is below about 50 kt ground speed (taxi); (b) judge Lead's speed only inside the Low block (6,000 to 10,000 ft) and Mid block (10,500 to 15,500 ft), with "below block" or "-" outside them; (c) add a "Formation" choice to the Standards panel with "Line abreast" (the current default, keeps every number) and "Close (fingertip or echelon)" or "None", so a close-formation sortie is not flagged for 86% of the time. Ask Patrick and Dad first, because it changes what Dad sees (the spec's "Ask first" covers changing default standards).

**PJ2. Trust recorded bank when it disagrees with the turn?** (from M5)
- Question: The iPad's recorded bank had the wrong side against the track in 3 of 22 turning samples, and sometimes reads bank 115 degrees left at 1.07 G (start+30:00, #3). Is the recorded value the aircraft's roll, or the tablet's tilt?
- Recommendation: keep D47 (recorded bank first) but, when the recorded bank has the opposite sign to the track's turn (over 1 degree a second) and differs from the estimate by more than 15 degrees, draw the estimate and label it "est. (recorded disagrees)". This needs Patrick's yes because it changes a number D47 fixed.

**PJ3. Default 3D aircraft size and paint.** Dad's call: at a 260 ft size and zoom 70, can you see and recognise each aircraft, and which paint do you want by default, Harvard or Ship colours? Recommendation: default the size to about 500 ft and the paint to Ship colours (lighter, easy to tell #1 to #4 apart), keep Harvard one click away. Both are one-line defaults.

**PJ4. VNC chart alignment.** Question: with Routes and charts, VNC South on, zoomed to CYMJ, does the chart's airport symbol sit under the track's runway? The alignment is V6's hand fit and the warp is pinned by the golden test, so I could not judge it from the screenshots (`/mnt/project-files/verification/shots/debrief/82-chart-alignment.png`, `/mnt/project-files/verification/shots/debrief/84-vnc-at-ramp.png`; at ramp zoom the chart is a blur). Recommendation: leave as is (it says "not for navigation"), and tick the check with Dad on the live link against V6.

## Decision log check
`/mnt/project-files/logs/decisions-for-review.md` (read 09:4xZ) has five rows, all from Turn Sim (offset box delay, check turn, cross turn, delayed 45). None is for the Debrief module and none contradicts the SMM or the debrief spec. The debrief's own defaults agree with the manuals index: spread 4,000 to 6,000 ft and 0 to 10 degree sweep (SMM 16.18 para 49), #3 7,000 +/- 1,000 ft aft (SMM 16.41 para 109), Lead 220 kt low and 200 kt mid (Patrick 05:37Z, blocks Gen Book p.12), fighting wing 30 to 60 degrees and 500 to 1,000 ft (SMM 12.29, EFIG p.391). The low-block top default is 10,250 ft, the middle of the 10,000 to 10,500 ft gap between the blocks (a reasonable choice; not in the manuals).

## 1. Screen walkthrough: what I did and what passed

- Load example flight: 4 tracks, fitted to the map, status "4 tracks loaded, 52 gaps, 4 tracks trimmed to the shared time" (12+25+9+6 gaps = 52). Status opens a per-track list (fixes, span, left out and why, gaps, time outside the shared window).
- Playback: Play, Pause, Back and Ahead 1 s, scrubber (1 s steps, 1780424344 to 1780430632), speeds 0.25x to 16x. Measured at 1x, 4x, 16x: 0.95, 4.12, 15.33 (2D) and 0.89, 3.83, 15.70 (3D) times real time. Paused means the scrubber stops. Space, arrows, Home, Reset work.
- 2D to 3D and back while playing at 4x: time and playing state kept, no blank frame. 3D needs WebGL: with it off the view stays 2D with a clear message.
- 3D settings (all 15 controls changed the picture, including Camera, Aircraft, Paint, Turn, Look down, Zoom, Altitude x, Aircraft size, Trail length, Ground datum, Bank and pitch, Altitude sticks, Altitude scale, Compass, Ground grid, Landscape, Reset view, Reset layout). Paint "Ship colours" works (`/mnt/project-files/verification/shots/debrief/19-3d-zoomed-shipcolours.png`). Datum shows "above datum" unless the field is chosen, then "AGL" (#27). "Altitude x2" is on the view (#26). Sticks work with both models.
- Layers (2D): Satellite imagery, Trail (Full tracks, History only, Last 60 s, checked visually), Spacing lines, Grid, Lead 3/9, #3 3/9, Fighting-wing cone, Clock marks, Safety bubble and radius, Follow Lead all redraw while paused.
- Routes and charts: 19 routes, route opacity, VNC South/North/Both, chart opacity, Chart alignment (East/West, North/South, scale, Reset alignment). Charts were fetched only when turned on (network log: nothing before, `vnc-south.webp` and `vnc-north.webp` after). "VNC chart: not for navigation" credit shows.
- Weather: METAR (real IEM data), decoded line matches the raw report (`CYMJ 021900Z 18014KT 15SM OVC030 16/08 A3004` shows as "wind 180/14 kt, vis 15 SM, OVC030, 16/08, A3004", MVFR is right for a 3,000 ft ceiling), "Report as sent", airfield picker, off hides the line. Error states: no report in 2 h ("CYMJ: no report in the two hours before this moment."), 503 ("couldn't load"), hostile text shown as plain text. Satellite: the example flight (2 June) is beyond GIBS's 90 days, so the map says "Satellite not kept: NASA keeps about 90 days of pictures." (correct). For a working satellite picture I made a copy of the example tracks shifted to two hours ago (scratch files, not in the repo): GeoColor loaded and the line said "Satellite 08:00Z, 1 min before" then "6 min before" after moving 5 minutes; Infrared showed "loading". Esri satellite under the tracks shows tiles and credit; failure states in L8. Radar, lightning and winds aloft are not built (todo 12e, 12f, 12h, 12g) so are not counted as bugs. The network to weather hosts worked through the proxy once the browser was told to accept the proxy's certificate; before that Chromium logged ERR_CERT_AUTHORITY_INVALID for map tiles (environment, not the app).
- Tools: EM chart opens below the map, the map shrinks, nothing covers it (`/mnt/project-files/verification/shots/debrief/20-em-open.png`); chart choice, trail, Close EM chart. Tennis ball: shooter, target, ball speed, pitch bias, cone width, time of flight, hit radius, gravity; the words (OUT OF CONE, range, line of sight 49.0 off the nose, cone +/-3, closest pass 166 ft after 0.30 s, pitch 5.1 estimated) follow the settings; the same ship twice says PICK TWO; a ship in a gap says GPS GAP; drawn in 2D and 3D (`shots/22`, `shots/24`).
- Standards panel: edit spread, refuse a bad value, judge switches, "All standards are off: no labels are shown", Reset to the default standards. DFPs: add, rename, note, delete, previous and next in time order, flags on the map, per flight (a different flight shows none, #25). Save debrief, Close flight (asks first when DFPs are unsaved), Open debrief: same tracks, DFP, note as text, time. Export CSV downloaded (2.4 MB, one row a second). Example track file links show `.kml` names (#28).
- Settings: Local first / Zulu first swaps the playback time and the header clock, both labelled (Z and CST).
- Keyboard: Tab reaches every control in a sensible order with a visible focus ring; menus open with Enter, Tab moves through items, Escape closes and returns focus to the button; 2D/3D switch works with arrow keys; the map canvas is focusable.
- Layout: no overlap at 1366x768 with everything open (my own measurement plus the repo's e2e test); collapsing the Flight and Formation columns gives the map the whole width and the canvas resizes (#36); resize to 1100x700 resizes the canvas; HiDPI canvas at device scale 2 is crisp (pixel size is 2x). The shell footer sits 88 px below the fold at 900 px high, so the page scrolls slightly; that is the shell's layout, not the debrief.
- Rendering performance: 60 fps idle; 3D under software WebGL in headless Chromium runs at about 10 fps (environment, not measured as a defect).

## 2. Numbers against V6

Method: for four playback times, I read the More detail and Formation text from the screen, then ran V6's own functions (`tests/golden/v6-source.js` loader) on the same cleaned fixes: `interpTrack`, `estimatedGAtTrack`, `aircraftPitchAtTrack`, `aspectAngleDeg`, `headingCrossAngleDeg`, `closureRateKt`, `classifyKmlError`, and the EM script's `metrics` and `isaRhoRatio`. The golden tests already pin range, aspect, HCA, closure and labels on the example flight (`tests/golden/debrief-readouts.test.js`); this is an end-to-end read of the screen. Raw output: `numbers-raw.txt`.

Times (playback time shown Z; scrubber value): 18:31:11Z (1780425071, ramp), 18:44:17Z (1780425857), 19:19:25Z (1780427965), 19:44:06Z (1780429446).

| Value | Screen vs V6 result |
|---|---|
| Altitude, all 4 ships x 4 times | Same to the foot |
| Ground speed | Same to the knot |
| Latitude and longitude | Screen interpolates between fixes (D51); V6 shows the earlier fix. #1 (at a fix) identical; others differ by up to about 0.0007 degrees (260 ft), consistent with 1 s fixes at 250 kt |
| Est. G | Same: 1.31, 1.24, 1.58, 1.31 at 18:44:17Z; 1.00 at 19:19:25Z; "--" where V6 gives none (ramp) |
| Pitch | Screen uses the track's motion (Q32). At 18:44:17Z: #1 1 vs V6 estimated path 1.3, #2 -1 vs -1.4; at 19:44:06Z -3 vs -2.8 and -3 vs -3.1. #3 and #4 differ from V6's native pitch on purpose (V6 shows the recorded tilt) |
| Est. IAS (D31) | 217 vs V6 EM 217.1; 227 vs 226.9; 217 vs 216.9; 241 vs 240.7; 237 vs 236.8; 235 vs 234.7; 229 vs 229.4; 201 vs 200.5 (rounded) |
| Turn rate on EM chart (D39) | Dots plotted at the V6 value x2 (no divide by 2): #1 about 1.08 (V6 0.50, x2 = 1.00), #2 4.48 (4.51), #3 5.14 (5.05) at 18:44:17Z; IAS positions within 2 kt |
| Range from Lead | 125, 291, 331 ft; 857, 1,395, 1,962; 51, 175, 271; 56, 230, 389: identical |
| Aspect / HCA | 4/6, 6/70, 31/88; 16/4, 10/13, 13/34; 61/0, 29/0, 33/0; 52/1, 23/3, 31/2: identical |
| Closure | Identical to the rounded knot at every pair I read (e.g. #1 to #4 +18.5 vs +18, #3 to #4 +31.1 vs +31) |
| Spacing (horizontal) | All pairs match V6 (571 ft, 733 ft, 857 ft, 163 ft, 222 ft, 97 ft …) |
| Interval and fore/aft behind the labels | TIGHT by 3,991 = 4,000 - V6 interval 9; #3 FORE by 5,711 = 6,000 - V6 fore/aft 289 (D78: offset alone judges #3's fore/aft, spread its interval); same for all 12 wingman readings. AFT by 76/64/67 degrees = sweep (90 - aspect) minus 10 |
| Bank direction on estimated bank (D40) | 19 of 19 estimated-bank samples had the correct wing down against the track's turn direction; the 3 wrong-side samples were all "recorded" (M5) |
| 3D labels vs 2D readouts at 41:00 | #1 "1,005 ft above datum" = 12,005 - 11,000 datum; bank 10 R, pitch +1 same as More detail; #3 3 L / +8; #4 26 R / +11; all match |
| Units and time | ft, kt, degrees, G labelled; range says "horizontal" or "3D"; closure says positive means shrinking; times show Z and local (CST, UTC-6) with the order set in Settings |

Found in this pass: M2 (est. bank versus est. G), M4 (8.29 G), M5.

## 3. Approved V6 fixes marked done: do they show?

| Fix | Shows on screen? |
|---|---|
| D31 est. IAS instead of ground speed for Lead | Yes: "Lead 217 kt est. IAS", judged against 200 kt mid |
| D32 GPS gap shows "GPS gap", track broken, hollow ship | Yes in card, More detail, spacing lines, 2D; 3D partial (M3) |
| D39 EM turn rate without /2 | Yes: verified on the EM canvas against V6 x2 |
| D40 bank from real turn rate, correct wing down | Yes for estimated bank direction (19 of 19); magnitude noisy (M2). "G only in level turns" is not on screen because the default shows estimated G (D61); no recorded-G setting exists yet |
| D47 recorded bank first; blank pitch estimated | Yes: "recorded" vs "est." tags; pitch shows estimated (Q32) |
| D49 to D53 status from what loaded | Yes: per-track list with fixes, left out and why, gaps, time outside the shared window |
| D52 not moving = no heading | Yes: "(Lead not moving)", no aspect/HCA/label; no 3/9 line for a still ship |
| D54 all or nothing load | Yes (bad file: alert names the file, "Nothing was changed."; e2e also checks). I did not re-run with a broken file |
| D61 pitch and G from the track | Yes |
| D78 #3 fore/aft judged by the offset alone | Yes (see section 2) |
| D114 to D116 SMM preset and Reset to default standards | Yes: "Spread 4000-6000 ft, sweep 0 to 10", "Offset #3 aft 7000 +/- 1000", "Lead 220 low, 200 mid" |
| D62/D63 (Q33 to Q37) one tennis solver, cone +/-3, INTERCEPT needs the cone | Yes: the panel reads cone +/-3.0, "OUT OF CONE" even with a 166 ft closest pass; 2D and 3D agree |
| #21 no label where no standard applies; green when on parameters | Yes: switching all standards off gives "no standard on"; on-parameters lines are green (Lead line green at "on parameters") |
| #23 fit to view, real status, zoom range | Yes |
| #25 DFPs belong to the flight | Yes |
| #26 clock marks and cone redraw paused; 3D playback bar; "Altitude x2"; sticks; Free orbit removed | Yes |
| #27 one fixed ground, near over far, pitch as nose angle, AGL wording | Yes (labels overlap: L2) |
| #28 CSV, tile retry, .kml example names | Yes |
| #29 #4 white with dark outline | Yes: card dot, map, 3D label, EM dot |
| #34/#35 no side rails or Tab tricks | Yes |
| #36 resize the canvas | Yes |
| #37 EM never covers the map | Yes |
| #38 no auto-hide on Play | Yes: nothing hides on Play |
| #39 no drawing when closed | Yes (repo test; frames were 0 when paused) |
| #43 redraw on change, VNC cache, "Not for navigation" | Yes |
| #18 horizontal versus 3D range wording | Yes |

Not built yet per the plan (not bugs): Winds aloft (12e), METAR vs SPECI ticks (12h), saved radar and lightning (12f), weather e2e lines (12g), checklist sign-off (11, waits for Patrick or anyone, D28). Field elevation stays 1,892 ft until `app.airfields` supplies it (todo task 8): with Home field set to CYQR the 3D ground still read "1,892 ft (field elevation)" (`/mnt/project-files/verification/shots/debrief/42-home-cyqr-3d.png`); planned.

## Audit (second checker, Opus, ~10:05Z)

All five Mediums hold; numbers re-derived in Node from the repo's functions on the example flight. Corrections:

| ID | Verdict | Severity | V6 behaviour? | Missing test |
|---|---|---|---|---|
| M1 standards judged out of place | CONFIRMED (85.5% TIGHT above 100 kt GS; load card shows "Lead 0 kt, SLOW" next to "Lead not moving") | Medium | Yes, V6 issue for a logged fix | Taxi gate + lead-outside-block tests; NOT "under 1,000 ft is not TIGHT" (only 48% are within 1,000 ft, so "mostly close formation" overstates it) |
| M2 est. bank vs est. G flicker | CONFIRMED exact (20% of level samples off >20°) | Medium | Mostly V6 (same ±1 s chords; D40 doubled it) | Synthetic noisy-turn unit test. Changing it changes a V6-pinned number (tests/golden/debrief-3d.test.js): logged decision needed |
| M3 3D numbers in a GPS gap | CONFIRMED (view3d/view.js lines 111, 114; overlay.js labelShip; 992 of 1,041 gap-seconds labelled) | Medium | No: D32 only partly done | Unit test with fake canvas recording fillText |
| M4 8.29 G spike | CONFIRMED, cause corrected: every >7 G second on the flight has a GPS gap inside its ±1.5 s window | Medium | V6 caps at 9 G | flight-data unit test: estimatedGAt returns null when its window touches a gap (per D32); keep a no-G-above-7 backstop |
| M5 recorded bank wrong side | CONFIRMED (11% of #3/#4 turning samples) | Low / pilot judgement | No: D47/C2 are Patrick's re-affirmed decision (spec line 131) | Test the rule PJ2 settles, not a count of bad data |
| L2, L3/L4, L12 | CONFIRMED | Low | | |
| L6 refused number stays | PARTLY REJECTED: box already aria-invalid and styled | Note | | |
| L13 three.js errors with WebGL off | PLAUSIBLE | Note | | WebGL probe before new WebGLRenderer |

## Recommendations for the owner (go ahead per Patrick 09:31Z; log judgement calls)
1. M3 and M4 (D32 completion): no attitude/height labels and no estimated G when the window touches a GPS gap. Straight fixes under an existing decision.
2. PJ1 (M1): (a) don't judge Lead's speed until airborne (tie it to est. IAS ~80 kt, log it); (b) don't judge Lead's block outside 6,000-10,000 ft MSL for Low (Gen Book p.12) or above 15,500 ft; (c) no made-up close-formation numbers: default "None", optional "Fighting wing" preset from EFIG p.391. (c) changes a default standard: log for Patrick's review.
3. M2: log a decision to smooth bank over the same window as G; update the golden pin in the same change.
4. PJ2 (M5): estimate bank by default like pitch and G (C10), keep recorded bank behind the setting; overturns Q32, so log it for Patrick and don't build until he agrees (his own decision).
5. PJ3 (label height), PJ4 (time warp): leave as is; Dad's call.
6. Re-check due: #182 (standards moved into the Debrief settings menu) and #186 (model wind) landed after this check; I'll verify them next.
