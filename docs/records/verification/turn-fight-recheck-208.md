# Turn Fight recheck after #208 (main 3e8d246): start geometry (R28, task 6b), 2D/3D switch

Build: npm ci, npm run build, vite preview on 4306. Scripts: scratchpad/tf208/ (ind.mjs is my independent model, sweep.mjs the 1,152-case comparison, ro.mjs the readout check, ui*.mjs the browser runs). Shots: /mnt/project-files/verification/shots/turn-fight-3/. Nothing in the repo was edited.

Reference: SMM 12.2 paras 6 and 9 (AA, HCA); SMM 16 para 40b and 40c (AA: 0 deg dead astern of the target, 180 deg on its nose, "right/left aspect" = the side of the target you are on; HCA = difference of headings). Spec: specs/SPEC-turn-fight.md, "Start geometry and altitudes (R28)". Decisions read: D227 to D233 (start geometry), D186/D188, D244/D246. None contradicts the SMM, the manuals or the spec. D230 (side read at the pass) and D231 (separation measured level) behave exactly as logged.

## Summary
Counts: High 0, Medium 3, Low 7 (plus 2 observations; TF3-3 and Observation A are marked PILOT JUDGEMENT, each with a recommendation).
The geometry and the sequencing are right: 1,152 start geometries agree with an independent model (no shared code), the default still gives V6's numbers, and every readout matches positions. What is wrong is text and one first-nose-on attribution.
Top 5 (TF3-7 is the fifth):
1. TF3-1 (Medium) Intro line and About text still describe a head-on fight; "2-circle = same turn direction" is false from a tail-chase start (Blue left, Red right in a 2-circle).
2. TF3-2 (Medium) Nothing on screen says which way each jet turns, yet 1-circle/2-circle now means "Red turns toward/away from Blue at the pass".
3. TF3-3 (Medium, PILOT JUDGEMENT) Stern chase (ATA 0, AA 0, Red slower): First nose-on reads "Red at +0.0 s" at the instant the jets coincide, though Blue has had Red on its nose for 103 s.
4. TF3-4 (Low) The side buttons do nothing at 0 or 180 deg but flipping one restarts and pauses the fight.
5. TF3-7 (Low) Main has no WebGL 1 fallback and no context-loss handling (the brief expected both); a WebGL 1 only browser is told "does not have WebGL".

## 1. Geometry and sequencing (PASS)
Method: my own model (ind.mjs) places the jets from range, ATA, AA and sides with plain bearings; finds the pass by brute-force closest approach (1 ms scan, then refined); reads each side with a cross product at the moment the turns start; flies exact constant-rate arcs; finds first nose-on at 2 ms. Constants only shared (KT and NM).
- Sweep: ATA {0,15,45,90,135,165,180} x sides x AA {0,20,60,90,120,160,180} x sides x speeds {220/220, 250/180} x 1 and 2 circle x turns at pass or at once = 1,152 cases. Compared at T+0, 8, 16, 25, 40, 70 s: positions, headings; plus pass time, HCA, first nose-on who and time. Result: 0 differences. Positions agree within 7.5 ft (the sim's turn-then-move step puts every arc a half-step ahead, V6's own scheme), headings within 0.01 deg, first nose-on within 0.02 s and the same aircraft. 272 of the cases have a tie in the turn side (dead ahead, astern, collision course); there the set-up side or V6's left applies as D230 says, and my model follows the same rule.
- Fuzz: 600 random setups (all ranges, pitch, Red height, chase): no throw, no NaN, HCA always 0 to 180, mergeSec equals the geometry pass, MERGE mark on exactly when the note says "Pass at".
- Default = V6: merge T+16.36 s; 2-circle first nose-on +18.24 s (a tie, "Both"); 1-circle +9.12 s. Same numbers with sides set to Right, and in the UI ("Both at +18.2 s", "Both at +9.1 s").
- Sign conventions: left is counter-clockwise, north-up, Blue heads east. ATA 30 R puts Red down-right of Blue on screen; AA 90 L puts Blue on Red's left (Red heading north from the east side, Blue to its west). HCA is unsigned and equals the difference of the placed headings (checked in every case). Consistent with SMM 16 para 40b.
- Sequencing table (2 NM, 220 kt, 4 G unless noted; B/R are turn directions at the pass, L left, R right; first nose-on counted from the pass):

| Start | Pass, HCA | 2-circle | 1-circle |
|---|---|---|---|
| head-on (default) | T+16.4, 180 | B L, R L; Both +18.2 | B L, R R; Both +9.1 |
| Red crosses nose, AA 90 L | T+16.4, 90 | B L, R L; Blue +2.5 | B L, R R; Blue +2.3 |
| Red crosses nose, AA 90 R | T+16.4, 90 | B R, R R; Blue +2.5 | B R, R L; Blue +2.3 |
| offset head-on ATA 20 L, AA 160 L | T+15.4, 180 | B L, R L; none | B L, R R; Blue +5.8 |
| ATA 20 L, AA 160 R (collision course) | T+17.4, 140 | B L, R R; Both +10.1 | B L, R L; Red +16.1 |
| tail chase ATA 30 L, AA 20 R, Red 150 kt | T+60.5, 10 | B L, R R; Blue +3.4 | B L, R L; Blue +3.6 |
| stern chase ATA 0, AA 0, Red 150 kt | T+102.9, 0 | B L, R L; Red +0.0 (see TF3-3) | B L, R R; Red +0.0 |
| ATA 90 L, AA 90 L (parallel, diverging) | none (at once), 180 | B L, R L; Both +5.1 | B L, R R; Blue +5.0 |
| at once, ATA 45 R, AA 135 R | (T+11.6 if straight), 180 | B R, R R; Both +2.3 | B R, R L; Blue +2.4 |

The rule "toward the other at the pass; 1-circle flips Red" is applied as specified. Independent integration gives the same first nose-on in all rows.
- Readouts during the fight: ro.mjs checks ATA (both), AA (both), HCA and Range from the sim state against my own formulas (dot and cross products from positions and pitch) every second for 30 s in 9 setups (level, climb and dive, Red +/-5,000 ft, chase): 1,674 values, 0 mismatches. In the browser I paused 18 times (beam, offset 1-circle, at once) and each screen value matched the sim at a fight time within 0.05 s of the clock: 18 of 18.
- Placement on screen (2D): arrowhead position and heading read from canvas pixels for 12 geometries against my expected pixel positions: across-track error under 1 px, along-track 4 to 5 px constant (my tip offset), headings within 3.5 deg (pixel noise). Side view (Red +3,000 ft, ATA 20, AA 160): Blue level, Red 3,000 ft up and to the east end, as the numbers say. 3D overhead with Ship colours (ATA 30 R, AA 120 R, and ATA 20 L, AA 160 L with Red +3,000 ft): same relative layout as 2D within 2 % (scale 1.09 and 1.31 from the auto-fit), nose directions match, and Blue level with Red high in the default 3D camera. Screens: 10-geom-02/04/07/08/11, 40, 41, 42, 50, 51.

## 2. Screen (PASS unless listed)
- Defaults: ATA 0 L, AA 180 L, Red above 0 ft, turns at the pass, HCA 180, "Pass at T+16.4 s"; all inside the closed Turn Fight settings menu, Start geometry first. Head-on (V6) resets all six (D228); Reset to V6 defaults resets everything else; both verified. Settings survive a reload; a storage record with ATA 999, side "up", AA -4, height 1e9, turnsAt "later" comes back as defaults with valid keys (separation) kept.
- Refusals: ATA/AA outside 0 to 180 or blank: "Enter a number from 0 to 180 °." (aria-invalid set, last good value kept, fight not restarted). Red height outside +/-5,000: "Enter a number from -5,000 to 5,000 ft.". The Red-height box is greyed until Climb and dive is on. 12.5 is accepted (the step 5 is the arrow step only).
- Changing any start value while playing resets to T+0 and pauses (as V6).
- No overlap and no sideways scroll at 1280x720, 1366x768 and 1440x900, default and geometry + Climb and dive (100 and 105 controls checked, settings menu and More detail open). axe (WCAG 2 A and AA, and all rules): 0 violations in 2D, and with 3D on plus settings menu open plus geometry set.
- Keyboard: Tab reaches the toggle, then ATA box, ATA side, AA box, AA side, turns-at, Head-on (V6), Reset; ArrowUp steps ATA by 5; ArrowRight flips a side; Enter on Head-on resets; Escape closes the menu and returns focus to its button. Display controls are skipped while disabled.
- Console: no errors in any run. WebGL fully off (getContext returns null): 3D click stays in 2D with the note "3D needs WebGL, which this browser does not have.", fight and setup untouched, one console.warn per try, no error. Switching 2D to 3D to chase view to 2D mid-fight keeps the clock running (no reset); changing AA while in 3D restarts the fight and stays in 3D.
- Module clean-up: 4 cycles of Turn Fight (3D on, playing) to Home and back: listeners 1, frames 0 or 1 (1 only when the remembered view is 3D), timers 2, no growth.
- Full unit suite (npm test): 2,394 pass, 0 fail, 8 todo.

## Findings

### TF3-1 (Medium) Intro and About text still say "head-on" and give a wrong 2-circle rule
Where: Fight setup, intro line under the title; About this model.
Steps: open Turn Fight, Turn Fight settings, set ATA 30 L, AA 20 R, Red 150 kt, 2-circle. Read the intro and About this model.
Expected: text true for any start (spec: Blue turns toward Red; in 2-circle Red does too; in 1-circle Red turns the other way).
Actual: intro "Two aircraft meet head-on, then turn" for every start (including "No pass: the turns start at once"). About: "1-circle: opposite turn directions after the merge. 2-circle: same turn direction after the merge." From that tail-chase start the 2-circle fight has Blue turning left and Red right (opposite) and the 1-circle has both left. "After the merge" is also wrong for at once / no pass. About does say AA and ATA are 3D with Climb and dive on (D231), good.
Shot: 10-geom-08.png (intro at top of column not in frame; text quoted from the DOM in ui14.mjs).
Known/planned: no.
Missing test: tests/e2e/turn-fight.spec.js, "with a non-head-on start the intro and About do not say head-on / same turn direction" (or a unit test in a layout test asserting the strings); and geometry.test.js one-line: for the tail-chase start, 2-circle turn directions differ.
Recommendation: intro "Two aircraft start apart, fly to the pass, then turn: who gets their nose on the other first?"; About: "2-circle: each jet turns toward the other. 1-circle: Red turns the other way, so both turn to the same side. Head-on this is V6's same/opposite directions."

### TF3-2 (Medium) Nothing shows which way each jet turns from a non-head-on start
Where: Start geometry section, picture and the note lines; More detail.
Steps: any beam or tail-chase start; look for the turn directions before pressing Play.
Expected: the student can see what 1-circle and 2-circle will do from this start (spec: "Show the setup, not just numbers").
Actual: the picture and the HCA/pass lines show placement only. The directions can only be learned by flying the fight. From the table above they flip with the side, the pass and the fight type (for example AA 90 R gives Blue R, Red R; tail chase gives Blue L, Red R).
Known/planned: no.
Missing test: tests/unit/turn-fight/readouts.test.js (or geometry.test.js): a "turn directions" text for head-on, beam L/R, tail chase, both fight types.
Recommendation: one more line under "Pass at ...": "Blue turns left, Red turns right", from turnDir with the 1-circle flip; optionally small turn arrows in the start picture.

### TF3-3 (Medium, PILOT JUDGEMENT) Stern chase: First nose-on names the wrong jet at +0.0 s
Where: Result, First nose-on.
Steps: Start geometry ATA 0, AA 0, Red speed 150 kt (Blue 220), 4x, Play. At T+103.9 the readout is "Red at +0.0 s" (range 0.02 NM, Blue's off-nose angle 160 deg, Red's 30 deg).
Expected: Blue has had Red on its nose since T+0 (an offensive perch: what R28's "at once" and stern starts are for). Nothing should credit Red at the instant the jets coincide.
Actual: first nose-on is only tested after the pass (spec: "after the merge"); at the pass the two positions are within 1 ft, the line of sight is noise, and Red is named. Same result with 1-circle. Red directly behind Blue (ATA 180, AA 180, at once) correctly reads Red +0.0 s. Other tail-chase starts with a small offset (ATA 10) correctly read Blue a few seconds after the pass.
Question for a pilot: when a jet already has the nose on before the turns start, does it "get the nose on first" at +0.0 s?
Recommendation (owner acts without waiting): yes. At the moment the turns start, count a jet whose off-nose angle is already 5 deg or less as first nose-on at +0.0 s (Blue here; Both if both), and use the ground-plane bearing from before the jets coincide when the range is under a few feet. Log it as a decision.
Shot: 96-stern-chase-first-nose.png.
Known/planned: no.
Missing test: tests/unit/turn-fight/sim.test.js: "stern chase ATA 0, AA 0, Red 150 kt: first nose-on is Blue (or the pre-pass nose-on jet), never decided by coincident positions".

### TF3-4 (Low) Side choices act at 0 and 180 deg where they mean nothing, and still restart the fight
Steps: ATA 0, Play for 2 s (T+2.4), press ATA side Right. Clock goes to T+0.0 and playback pauses. Nothing about the start changed (geometry is the same for 0 and 180).
Expected: no restart when the fight would be identical (or the side dimmed with a hint at 0/180).
Known: no. Missing test: tests/unit/turn-fight/state.test.js: setupKey is equal for ATA 0 left and right (same for AA 0/180).
Recommendation: normalise the side to 'left' at 0 and 180 inside setupKey, and dim the side button with the hint "no side at 0 or 180".

### TF3-5 (Low) "MERGE" is drawn for a pass 1.4 NM apart
Where: 2D and 3D, beam start (ATA 0, AA 90): the pass is the closest approach, 1.4 NM apart, and the mark and phase change say MERGE / 2-CIRCLE. Spec calls it the pass; word "MERGE" is V6's. Recommendation: label "PASS" when the range at the pass exceeds about 0.25 NM. Test: tests/e2e/turn-fight.spec.js, beam start shows the pass mark text. Known: no.

### TF3-6 (Low) ATA is cited to SMM 12.2; the SMM does not define it
Where: hints under the ATA and AA boxes ("SMM 12.2."). SMM 12.2 paras 6 and 9 define AA and HCA; the AA side rule (right/left aspect) is SMM 16 para 40b; the SMM text I searched has no off-nose or antenna train angle. Recommendation: hint "ATA: the angle off Blue's nose (this tool's term). AA and HCA: SMM 12.2 paras 6 and 9; sides: SMM 16 para 40b." Test: none needed beyond the spec-text check in the e2e Start geometry test. Known: no.

### TF3-7 (Low) No WebGL 1 fallback and no context-loss handling on main
The brief expected "webglSupported, WebGL 1 fallback"; on main webglSupported asks for WebGL2 only (three r163+), and D244's contextlost handling (commit 11549f5) is not in main (git cannot find the object). A browser with WebGL 1 only gets "3D needs WebGL, which this browser does not have." (inaccurate: it has WebGL 1). Quiet fallback to 2D works, fight untouched. Recommendation: wording "3D needs WebGL 2, which this browser does not have."; land D244. Test: tests/e2e/turn-fight.spec.js: getContext('webgl2') returns null but webgl works: note text. Known: D244 planned in another branch.

### TF3-8 (Low) Red-height box hint says "It shows with Climb and dive" but the box is always shown, greyed
Steps: leave Climb and dive off; the box is visible but disabled. If a height was saved and Climb is then switched off the greyed box still reads e.g. 3000 while the fight is level. The start picture never shows the height. Recommendation: hint "Used with Climb and dive on." and draw the height difference in the picture. Test: e2e, the hint text and the picture (unit test in view.test.js for a height label). Known: no.

### TF3-9 (Low) Refusal text has a stray space before the degree sign
"Enter a number from 0 to 180 °." (the unit is joined with a space). Same pattern for other units ("… NM.", "… ft." are right). Recommendation: no space before °. Test: tests/unit/ui-kit number rule message for a degree unit. Known: no.

### TF3-10 (Low, open from earlier) Speed (KTAS) label still wraps to two lines with Climb and dive on
39 px against 20 px for G and Pitch (95-climb-dive-labels.png). This was TF-5. TF-1 ("Sustained G") is fixed: the label is now "G".

### Observation A (PILOT JUDGEMENT) The head-on default result is a knife edge in a 2-circle fight
With equal jets a 2-circle fight has first nose-on only because both come back exactly head-on: ATA 0.01 deg (2 ft sideways) still reads Both +18.3 s, ATA 0.05 deg (11 ft) already reads "none" for the full 10 minutes (analytically, sideways offset above about 8 ft makes the best off-nose angle 5 deg or more). 1-circle changes smoothly (+9.1 s at 0 deg, +8.3 s at 1 deg, +7.2 s at 5 deg). So the moment a student moves ATA off 0 in a 2-circle fight, First nose-on goes from +18.2 s to "--". This is the model, not a bug (independent integration agrees).
Question: is a 5 deg nose-on cone meaningful for a 2-circle merge? Recommendation: keep as is; add one About line: "In a 2-circle fight between equal jets a nose-on happens only if they come back exactly head-on; any offset gives none, which is what a rate fight between equals means." Test: tests/unit/turn-fight/sim.test.js: pin ATA 0 gives +18.2 and ATA 1 / AA 179 gives none in 2-circle, +8.3 s in 1-circle.

### Observation B (not built yet, not a bug)
Per-aircraft start altitudes (both 10,000 ft) belong to Energy mode, which is not on main. In the simple fight only "Red starts above Blue" (+/-5,000 ft, with Climb and dive) exists, as the spec says. With Red 2,000 ft up: Range 2.03 NM, ATA 9 deg, AA 171 deg at T+0, Height between 3,000 ft when set to 3,000, Height change 0 ft each (D229): all as D229/D231 log.

## Also seen (not new)
- At 1280 wide the phase pill drops to a second toolbar row (same with HEAD-TO-HEAD before #208); no overlap; the drawing area shrinks by one row. Known baseline (D225 lays out for 1280).
- Page scroll of about 50 px at 1366x768 and 1440x900 is the app frame (known).
- Earlier open items unchanged by #208: TF-3 chase hint text, TF-4 R letter near MERGE just after the pass.

## Missing tests, in one list
1. tests/unit/turn-fight/geometry.test.js (or a new geometry-sweep.test.js): independent brute-force pass, exact arcs and first nose-on over a 60-case subset of ATA x AA x sides x circles x turnsAt (my ind.mjs and sweep.mjs are ready to adapt).
2. tests/unit/turn-fight/sim.test.js: stern chase first nose-on (TF3-3); 2-circle knife edge pin (Observation A).
3. tests/unit/turn-fight/state.test.js: setupKey equal for sides at 0 and 180 (TF3-4).
4. tests/unit/turn-fight/readouts.test.js: turn-direction text (TF3-2).
5. tests/e2e/turn-fight.spec.js: intro and About do not say head-on for a non-head-on start (TF3-1); PASS/MERGE mark text for a beam start (TF3-5); WebGL 1 only message (TF3-7); Speed label one line with Climb and dive on (TF3-10).

## Thread check (12:40Z)
- TF3-7 confirmed: on main 3345619 there is no WebGL 1 fallback or context-loss handling in src/modules/turn-fight or src/ui-kit, and commit 11549f5 (D244) is not in main's history.
- Geometry verified by an independent model on 1,152 cases; the Mediums are screen text and one first-nose-on attribution, so no separate audit pass was run.
