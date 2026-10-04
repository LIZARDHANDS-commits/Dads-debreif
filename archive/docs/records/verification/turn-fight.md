# Turn Fight (BFM 1v1) verification

Checked build: main f35aaad (includes #176). Served with `vite preview` on port 4306 from a built copy. The home card is not hooked in (`registry.js` has `load: null` for `turn-fight`), so for the browser checks I temporarily set the `load` line locally to open `#/turn-fight`, then reverted it (`git status` clean). Nothing was committed or pushed. Playwright 1440x900 unless stated; scripts and raw output are in `scratchpad/tf/`. Shots are in `shots/`.

Unit and golden tests for the module: `tests/golden/turn-fight-sim.test.js` plus `tests/unit/turn-fight/*.test.js`, 157 tests, 157 pass.

## What is built, and what is not (so "missing" is not reported as "wrong")

Built (tasks 1 to 5 in `tasks/turn-fight/todo.md`, simple fight only): 1-circle and 2-circle, start separation, speed and G per aircraft, First nose chases, Climb and dive with pitch boxes and side view, height scale, Turn Fight settings menu (Display only), About panel, More detail, T-6 limit warning, Space and Home, saved settings, Reset to V6 defaults.

Not built yet, per `todo.md` (all found absent in the running screen; not counted as bugs): the home card (`load: null`), 2D/3D switch and 3D view (task 5b), Q48 "Both" tie, Q49 centred start, Q50 side view label, Q51 "Off-nose angle (ATA)" and true angle-off (task 6), Start geometry, aspect, height offset and "turns start at once" (task 6b), Energy mode, OVER G and STALL flags, Paint choice (task 10), `tests/e2e/turn-fight.spec.js` (no file exists), sign-off checklist (task 7). Because Start geometry and Energy do not exist, "different start geometries or aspect" and "OVER G / STALL" and the head-on re-pass and above-220 pick could only be checked against the decision log text, not flown.

## Counts

High 0, Medium 2, Low 5. Plus 7 items that are known and planned (listed at the end, not counted).

Top 5:
1. TF-1 (Medium) G boxes are labelled "Sustained G", but the default (220 kt, 4 G) is above what a T-6 can sustain per the turn charts; the warning only covers the stall line and 7 G.
2. TF-2 (Medium) "First nose-on: Red at +18.2 s" is measured from the merge while the clock beside it reads T+34.6; the row never says "after the merge".
3. TF-3 (Low) "First nose chases" makes both aircraft turn toward each other (V6's "defender turns inside"); the label and About text say nothing about the second aircraft.
4. TF-4 (Low) The B and R letters and MERGE text overlap each other and the aircraft near the merge point.
5. TF-5 (Low) "Speed (KTAS)" wraps onto two lines once Climb and dive shows the third box, and the stopped-at-10-minutes banner pushes the picture down.

## Part 1. Geometry and sequencing

### Method
Flew every scenario two ways: the module's own `sim.js` (Node, 0.02 s steps) and, for the same setups, the screen (Playwright, real Play button at 4x). Compared both with an independent closed-form model I wrote that shares no code with the module (constant-rate circle arcs from the merge point, first time either nose is within 5 degrees of the other, 1 ms search). Numbers use g = 32.174 ft/s2, 1 kt = 1.6878 ft/s.

### Results (all 2 NM start, 4 G unless stated). "sim" and "screen" agreed everywhere; "closed form" agrees to within one 0.02 s step

| Setup | Merge | Turn rate B / R (deg/s) | Radius B / R (ft) | First nose-on (after merge) | Who / picture |
|---|---|---|---|---|---|
| 2-circle 220/220 | T+16.4 | 19.2 / 19.2 | 1,106 / 1,106 | +18.2 s (T+34.6) | tie, screen names Red. Two tangent circles on opposite sides of the line. |
| 1-circle 220/220 | T+16.4 | 19.2 / 19.2 | 1,106 / 1,106 | +9.1 s | tie, screen names Red. One shared circle (Blue's and Red's trails lie on top of each other). |
| 2-circle B250 / R200 | T+16.0 | 16.9 / 21.2 | 1,429 / 914 | Red +14.4 s | higher rate wins, as SMM 14 teaches (rate fight) |
| 1-circle B250 / R200 | T+16.0 | 16.9 / 21.2 | 1,429 / 914 | Red +7.4 s | smaller radius wins |
| 2-circle Blue 5 G | T+16.4 | 24.3 / 19.2 | 875 / 1,106 | Blue +12.6 s | matches spec table |
| 1-circle Blue 5 G | T+16.4 | 24.3 / 19.2 | 875 / 1,106 | Blue +6.9 s | |
| 2-circle B5G / R3G | T+16.4 | 24.3 / 14.0 | 875 / 1,515 | Blue +11.1 s | |
| 2-circle B160 / R220 | T+19.0 | 26.4 / 19.2 | 585 / 1,106 | Blue +11.0 s | Blue's G shows the stall warning (3.4 G at 160 kt) |
| 1-circle B160@2.6 G / R220@6 G | T+19.0 | 16.4 / 29.4 | 944 / 724 | Red +6.5 s | |
| 2-circle B400 / R60 | T+15.7 | 10.6 / 70.5 | 3,658 / 82 | Red +2.8 s | extreme ends of the ranges work, no error |
| 2-circle 0.5 NM and 10 NM | T+4.1 and T+81.8 | as default | | +18.2 s both | view rescales, merge mark right |
| 9 G both / 1.1 G both | | 44.4 and 2.3 | 479 and 9,351 | 7.9 s and 153.9 s | |

Checks that passed:
- Merge and first nose-on at the V6 defaults match the memory notes and the spec table (T+16.4, +18.2 s, +9.1 s).
- Direction rules: Blue turns left; in the 2-circle Red also turns left (circles on opposite sides of the merge line, tangent at the merge); in the 1-circle Red turns right (one shared circle). Drawn track pictures (`/mnt/project-files/verification/shots/turn-fight/02-2c-play-5.png`, `/mnt/project-files/verification/shots/turn-fight/03-1c-default.png`) show exactly this.
- The faster turn rate wins the 2-circle; the smaller radius wins the 1-circle. Both held on every unequal setup above.
- Turn rate and radius at the set speed and G: 220 kt / 4 G gives 19.2 deg/s and 1,106 ft, 360 degree time 18.7 s; every table row agrees with the closed form.
- Each aircraft's turn is a true circle of the stated radius (a full 10-minute fight retraces the same circles, `/mnt/project-files/verification/shots/turn-fight/09-stopped-10min.png`).
- Playback speed 0.5x, 1x, 2x, 4x measured 0.50, 1.00, 1.97, 3.92 of wall time.
- The fight stops at exactly T+600.0 with the banner "Fight stopped at 10 minutes. Reset to fly it again."; Play is disabled and focus moves to Reset; Reset and Home clear it.
- T-6 limit warning: 220 kt at 6.5 G no warning, 6.6 G warns (limit 6.5); 120 kt at 1.9 G no warning, 2.0 warns; 230 kt at 7.1 G "Above the T-6's 7 G limit"; none at V6's default. Wording matches the spec.
- Climb and dive: 30 degrees for 7.7 s after the merge gives +1,429 ft (220 kt x sin 30), -20 degrees gives -977 ft, "Height between" 2,406 ft; all agree with hand arithmetic. Turn rate stays the level rate (spec Q50, kept).

### Comparison with the SMM and the manuals index
- 1-circle versus 2-circle definitions in the About text and on screen agree with SMM 14.14 para 37 (the two-circle is the rate fight, height traded to hold turn rate) and the spec.
- The spec's own note that first nose-on in an even 2-circle fight is at +18.2 s (349 degrees of turn) was reproduced: that moment is a second head-on pass about 400 ft apart, not a positional advantage.
- The default 220 kt / 4 G is inside the T-6A stall line (6.5 G) but above sustained thrust (sustained G tops out near 3 G at sea level, `formation-and-turn-numbers.md`, "T-6A performance charts"). See TF-1.

### PILOT JUDGEMENT items, with my recommendation
- PJ-1. In an even 2-circle fight the "first nose-on" lands as a re-pass at about 400 ft range with both noses just inside 5 degrees. Does Dad count that as "got their nose on first"? Recommendation: keep V6's 5 degree test (Q48 will name it "Both"), and add "range at first nose-on" to More detail so the student sees it was a high-aspect head-on pass, not a shot.
- PJ-2. Q51 asks Dad to confirm the ATA / angle-off wording. Recommendation: keep "Off-nose angle (ATA)" as the spec says, because SMM 12.2 defines aspect angle and HCA but the V6 number is ATA in BFM usage; renaming back is one label.
- PJ-3. Does the "defender turns inside" behaviour (both aircraft steer at each other after first nose-on) in First nose chases match how his school teaches the defender's break? Recommendation: leave as V6 and describe it in one line (TF-3).

### Logged decisions for Turn Fight in `/mnt/project-files/logs/decisions-for-review.md` checked against the SMM
Energy mode is not in this build (PR D not open), so these were read, not flown.
- D152 (after a head-on re-pass both keep turning in the max-performance turn): consistent with the SMM (nothing to pursue at high aspect). It does differ from the approved spec, step 4, which says the first nose-on aircraft stops its MPT and chases; the spec text needs a line for the head-on case. No SMM contradiction.
- D153 (above 220 KIAS, dry-run Immelmann and pitch back and fly the faster): partly conflicts with SMM Table 14.1. The pitch back band there is 160 to 220 KIAS and the Immelmann 200 to 250; SMM 14.17 cautions that above 190 KIAS it is easy to exceed the 4.7 G rolling limit. So the dry run may fly a pitch back at, for example, 240 KIAS, which the SMM does not sanction, and above 250 neither move is in Table 14.1. Patrick's own words (09:27Z, 09:32Z) rank above the spec, so it stands. Recommendation: keep D153 but make the "why" text beside the aircraft say when the chosen move is outside the SMM entry band (for example "Pitch back at 240 KIAS: above SMM entry 160 to 220"), so the choice is visible to Dad.
- D165 (split S up to 5 G "SMM 14.16 para 41"): the citation does not support the number. Table 14.1 says about 4 G and para 41 says roll at about 0.5 G then hold the shaker; 5 G is Patrick's 09:27Z figure. Recommendation: cite "Patrick 09:27Z" not para 41 in the log and help text; the cap stays 5 G.
- D166 / D168 (stall 86 kt versus the charts): already flagged in the log. The warning in this build uses the 86 kt line, so at 160 kt it says 3.4 G where a stall speed of 89 kt would give 3.2 G, i.e. it can understate by about 0.2 G. Recommendation: accept until Patrick answers D166, since the warning text says "stall limit" and the model is his pick.
- D175 and the 10:00Z rows (capture lead 3 s, planned first move, tie goes to pitch back): no SMM number involved. The 3 s capture lead contradicts nothing (SMM 14.17 para 42 only asks for the MPT before 180 degrees of turn).

## Part 2. Screen walkthrough

### Findings

**TF-1 (Medium) "Sustained G" label overstates the model.**
- Where: Fight setup, both aircraft, G box (`layout.js` line 37; the spec and the fight's own text call it "G").
- Steps: open the module; read the G label.
- Expected: a label that does not promise sustainability; spec table says "G"; manuals note (`formation-and-turn-numbers.md`, "What it means for the Turn Fight") says 4 G at 220 KIAS is not sustainable and the tool holds speed constant.
- Actual: label "Sustained G" beside the default 4 G at 220 kt. The warning only tests the stall line and 7 G, so a student is told the T-6 can "sustain" 4 G at 220 kt when the charts show about 3 G at sea level.
- Shot: `/mnt/project-files/verification/shots/turn-fight/01-default.png`. Known or planned: no (label chosen in #176, not in the spec).
- Recommendation: rename to "G pulled" or "G (held)", with a hint "held constant; the T-6 cannot sustain this much at every speed".
- Missing test: `tests/e2e/turn-fight.spec.js` (does not exist) should assert the control labels equal the spec's list; or a unit test on `layout.js` labels.

**TF-2 (Medium) First nose-on time is from the merge, the clock is from the start, and the row does not say so.**
- Where: Result, "First nose-on".
- Steps: play the default 2-circle to the end; clock reads T+34.6 at that moment while the row says "Red at +18.2 s".
- Expected: the spec's mock shows the same text, but a reader sees T+ and +18.2 side by side with no bridge (the spec says "the time since the merge").
- Actual: `Red at +18.2 s`; nothing says "after the merge".
- Shot: `/mnt/project-files/verification/shots/turn-fight/02-2c-play-5.png`. Known or planned: not listed.
- Recommendation: "Red, 18.2 s after the merge" (or add the T+ time in More detail).
- Missing test: `tests/unit/turn-fight/readouts.test.js` should pin the wording that names the merge.

**TF-3 (Low) "First nose chases" does not say both aircraft turn toward each other.**
- Where: Fight setup checkbox and About this model.
- Steps: 2-circle B250 / R200 with the box on: after first nose-on both headings switch to steering at the other aircraft (verified in `sim.js` and by running it: Blue's heading rate changes at that moment as well as Red's, min range 148 ft versus 547 ft with the box off).
- Expected: label or hint matches behaviour (V6's own text was "First nose follows, defender turns inside").
- Actual: label suggests only the first aircraft chases; About says nothing on chase or Climb and dive.
- Known or planned: not listed. Recommendation: add a one-line hint under the checkbox.
- Missing test: `tests/unit/turn-fight/readouts.test.js` or an e2e that the hint text exists (nothing pins the About text).

**TF-4 (Low) Label collisions at the merge.**
- Where: top-down view.
- Steps: play any fight past the merge; the "R" letter sits over "MERGE" and the B letter runs into the aircraft arrow when they re-pass.
- Shots: `/mnt/project-files/verification/shots/turn-fight/05-chase-vertical.png`, `/mnt/project-files/verification/shots/turn-fight/09-stopped-10min.png`. Known or planned: no.
- Recommendation: offset the MERGE label below and to the right of the mark, and keep the letters clear of it.
- Missing test: `tests/unit/turn-fight/view.test.js` could pin a minimum label spacing from the merge mark.

**TF-5 (Low) Small layout issues.**
- "Speed (KTAS)" wraps to two lines once Climb and dive adds the pitch box (`/mnt/project-files/verification/shots/turn-fight/05-chase-vertical.png`, `/mnt/project-files/verification/shots/turn-fight/11-vp-1366x768.png`), so the three rows of boxes stop lining up with the two-box layout.
- The stopped banner appears above the picture and moves the view down by about 44 px (`/mnt/project-files/verification/shots/turn-fight/09-stopped-10min.png`).
- At 1366x768, with Climb and dive, More detail and the settings menu open, the setup column scrolls inside itself and its header and "About this model" scroll out of sight. Nothing overlaps or is covered (checked with elementFromPoint at 1366x768, 1920x1080, 1024x768). The page itself scrolls 52 px at 1366x768 from the app frame, not the module.
- Missing test: `tests/e2e/turn-fight.spec.js` should check at 1366x768 that no control overlaps and the three columns have no horizontal scroll (spec Testing strategy 4, R2).

**TF-6 (Low) A refused entry stays in the box.**
- Steps: type 500 in Blue's speed: the box keeps "500" with the message "Enter a number from 60 to 400 KTAS." and aria-invalid, while the Result still shows the last good value (19.2 deg/s). Same for blank, 0, 0.2, 11 NM, 1 G, 400.5 kt.
- This is the ui-kit number rule and the spec wording ("the last good value stays"); listed only because the number on screen and the number in the box differ until the box is fixed. Passed as designed.

**TF-7 (Low) Not usable at phone width (390x844).**
- Play overlaps the Result toggle and the page scrolls sideways (scrollWidth 644). Desktop and laptop only per D6, so noted, not a defect.

### What I clicked and it worked (no dead controls found)
- Fight type 1-circle and 2-circle, start separation (0.5 to 10, arrows step by 0.5), speed and G (both aircraft), pitch boxes (appear only with Climb and dive), First nose chases, Climb and dive (shows pitch boxes, side view, Height change, Height between), Turn Fight settings menu (opens in the page flow, contains Side view height scale and Reset to V6 defaults; nothing else yet), About this model, More detail, both column collapse buttons (canvas grows to fill; settings for collapsed state remembered after reload), Play, Pause, Reset, playback speed, Space, Home.
- Side view height scale: disabled without Climb and dive; changing it mid-fight does not reset the fight (clock kept running T+24.1 to T+26.5), and the picture changes (`/mnt/project-files/verification/shots/turn-fight/05-vertical-2x.png`, `/mnt/project-files/verification/shots/turn-fight/05-vertical-scale-changed.png`), so the V6 bug #20 is fixed.
- Changing any setup value while playing resets the fight to T+0.0 and paused, as V6 and the spec say. Reset while playing pauses at T+0.0.
- Reset to V6 defaults puts back 2-circle, 2 NM, 220 kt, 4 G, both extras off, pitch 0, playback 1x. It leaves the columns open or closed as they were (as the code comment says).
- Settings are remembered across a reload (fight type, separation, speed, G, Climb and dive, pitch, playback speed, collapsed column).
- Keyboard: Space plays and pauses from anywhere on the page; Space or Enter on the focused Play button toggles once (no double toggle); Space typed in a number box does nothing; Space on the speed select does nothing; Home resets. Tab order follows the visual order (fight type, separation, Blue, Red, extras, settings, About, Play, Reset, speed, result toggles); the closed settings menu's Reset button is not in the Tab order.
- axe (default rules, the repo's @axe-core/playwright) reports 0 violations on the module, both with defaults and with Climb and dive, More detail and the settings menu open.
- Leaving the module (Home link) while playing: 0 animation frames in the next 1.5 s, the module's stylesheet is removed, and coming back shows T+0.0 paused. No console errors or warnings in any run (about 15 runs).
- Colours: Blue and Red are V6's; each aircraft has its B or R letter and badge, in the picture and in every table.

### Defaults present
Every box opens filled with V6's value (2-circle, 2 NM, 220 kt, 4 G, 0 pitch, height scale 2x, playback 1x, extras off) and the fight plays with nothing typed.

## Known or planned, seen on screen (not counted above)
- Q48 tie: even fights name Red ("Red at +18.2 s", "Red at +9.1 s"), pinned as a tie in the unit test; planned in task 6. The screen has no "Both".
- Q49: with unequal speeds the trails run past the merge mark and jump back. 250/200 kt jumps 675 ft; 300/150 kt 2,025 ft; 400/60 kt 4,483 ft (`/mnt/project-files/verification/shots/turn-fight/13-400v60.png`). Planned in task 6.
- Q50: the side view title is still V6's "VERTICAL PROFILE • 2x"; the footer line "Simplified: constant speed and turn rate" is present. Planned in task 6.
- Q51: the readout is still "Angle-off" (shows 0 degrees head-on) and there is no true angle-off in More detail. With Climb and dive first nose-on is still called with 792 ft height difference (chase run, `/mnt/project-files/verification/shots/turn-fight/05-chase-vertical.png`). Planned in task 6.
- Start geometry, aspect, height offset, 2D/3D, Energy mode, OVER G and STALL: not built (tasks 6b, 5b, 10).
- The home card still says planned (`load: null`); the module only opens after that line changes.
- No `tests/e2e/turn-fight.spec.js` and no `docs/checklists/turn-fight.md` yet; every "missing test" above that names the e2e spec depends on it being created.

## Missing tests summary (for the owner)
- `tests/e2e/turn-fight.spec.js` (create): control labels, Space and Home, Play and Reset, 1366x768 and 1920x1080 no-overlap, module close leaves no frames, no console errors.
- `tests/unit/turn-fight/readouts.test.js`: first nose-on row wording names the merge (TF-2).
- `tests/unit/turn-fight/view.test.js`: label spacing near the merge mark (TF-4).
- `tests/golden/turn-fight-sim.test.js`: add a closed-form circle check (my independent model in `scratchpad/tf/geo.mjs` matched the sim within 0.02 s on 19 setups) so the geometry is pinned by more than V6's own code.

## Audit (second checker, Opus, ~10:15Z)

| Item | Verdict | Severity | Note |
|---|---|---|---|
| TF-1 "Sustained G" label; 4 G at 220 kt not sustainable | CONFIRMED | Medium | Core's model: max sustained at 220 KIAS is 2.67 G (SL), 2.50 (5,000), 2.31 (10,000); chart gives ~2.72 G at SL. At 4 G excess is −0.118 (≈2.2 kt/s bleed). layout.js:37 says 'Sustained G' but the spec says "G": rename to "G" / "G pulled". Test: unit test on layout.js labels (e2e spec doesn't exist yet). |
| TF-2 first nose-on counted from merge | Facts CONFIRMED; not a build defect | Low / spec change | The wording is the approved spec (mock ~lines 65-73, line 140) and V6's. "Time since merge" is already in More detail. Log recommended wording ("+18.2 s after the merge") as a decision. |
| Geometry | CONFIRMED on 6 closed-form setups | none | Largest difference 0.037 s (even 2-circle; heading-then-straight step). PJ-1 applies to the 1-circle too (even 1-circle nose-on is a head-on re-pass at ~170-190 ft). |
| D153 above-220 pick vs SMM Table 14.1 | CONFIRMED | Low | Immelmann 200-250, pitch back 160-220 KIAS; entry speeds assume ~10,000 ft (para 10). The 4.7 G rolling limit is core's T6A_LIMITS.rollingMaxG, not the SMM. Explain out-of-band picks in the "why" text. |
| D165 split S 5 G citation | CONFIRMED | Low | Table 14.1: 100-120 KIAS entry at ~4 G; para 41 gives no 5 G. Cite Patrick's 09:27Z figure (core's comment already does); fix the D165 row and the #181 merge-log row. From a 100-120 KIAS entry the stall line allows only ~1.4-1.9 G, so the 5 G cap matters only above ~192 kt. |

## Recommendations (go ahead per Patrick 09:31Z)
1. TF-1: relabel the box "G" per the spec; unit test on the label.
2. TF-2, PJ-1: log wording "+18.2 s after the merge" and "range at first nose-on" in More detail as decisions for Patrick's review.
3. D153/D165: fix the log wording and citations; add the out-of-band note to the move's "why" text.
4. Create tests/e2e/turn-fight.spec.js with the home-card hookup; add a closed-form circle golden check.

## Addendum from the Traffic/SOF checker (engine and core numbers)
## Addendum from the Traffic/SOF checker (engine and core numbers, checked before the hand-over)

I was first assigned Turn Fight, then told another checker had it. This section holds only what I had already reproduced (Node scripts `scratchpad/findings/scripts/tf1.mjs` to `tf5.mjs`, no screen work; I did not check the #176 screen). It does not repeat the section above. Nothing here changes the counts above except where marked.

### Engine and core: PASSED
- Level turn at 220 KIAS / 4 G: 19.228 deg/s and 1,106.5 ft, equal to the closed form. Default 2-circle fight: merge 16.36 s, first nose-on "Red +18.24 s".
- Identical results at 30, 50, 60 and 144 fps (fixed-step, deterministic).
- Fight stops at 600 s. G clamp at 1.01 holds at very low speed.
- V6 golden pins (`tests/golden/turn-fight-sim.test.js`) pass; core model (`src/core/t6-performance.js`) is inside the spec tolerances except the LMPT item below.

### Additional findings

**TF-A (Medium, PILOT JUDGEMENT) D175 allows a start altitude up to 25,000 ft; SMM 14.5 para 10 limits aerobatics to below 16,000 ft MSL.**
- Where: Energy mode start altitude (not built on screen; the range is in the spec/log and `src/core/`).
- Expected: warning at 16,000 ft citing the SMM, not only the model note (the model is only fitted to about 10,000 ft; SMM 14.15 to 14.17 entry speeds also assume about 10,000 ft MSL).
- Actual: the 25,000 ft range is accepted with no SMM-based warning.
- Recommendation: keep the range (Patrick's call) but warn from 16,000 ft with the SMM reference; state that above about 10,000 ft the times are approximate.
- Status: not built yet (Energy mode is task 10). Missing test: `tests/unit/turn-fight/energy-inputs.test.js` (create with task 10): an altitude above 16,000 ft returns the SMM-referenced warning.

**TF-B (Medium, PILOT JUDGEMENT) D153 and the "tie goes to the pitch back" row: the pick can be outside the SMM entry bands.**
- SMM Table 14.1 / 14.15 para 39 / 14.17 para 43: Immelmann 200 to 250 KIAS; pitch back 160 to 220, with a caution above 190 KIAS (overstress on the roll). The 120 KIAS top-of-loop speed used in the dry-run is a model figure, not an SMM number.
- Consequence: above 220 KIAS a "pitch back" can win, and above 250 neither move is in the table. (The section above has the same D153 point; I add the tie and the losses.)
- Recommendation: (1) in the dry-run count OVER G and STALL as a loss for that move; (2) label the result "outside SMM band" when the entry speed is outside the band; (3) on a tie, pick the move whose band contains the entry speed, and use the pitch back only if both do.
- Missing test: `tests/unit/turn-fight/energy-move-pick.test.js` (create with task 10): entry 240 KIAS does not return "pitch back" without the outside-band flag; a tie prefers the in-band move.

**TF-C (Low) D152 (head-on re-pass, both keep turning): SMM is silent, keep.** The spec's Auto table still carries the D112 text (above 220 = Immelmann) and step 4 of the spec; both need a line for D152 and D153. Missing test: none for the wording; add a spec-conformance line to the `docs/checklists/turn-fight.md` sign-off (task 7).

**TF-D (Low) Level MPT vs the SMM rule "150 minus altitude in thousands".** With the D165 shaker margin (7 kt over 86 kt = 93 KIAS) the level-MPT speed is 158.3 / 154.7 / 152.3 / 148.1 kt at 0 / 6,000 / 10,000 / 15,000 ft, against the SMM rule 150 / 144 / 140 / 135. The difference is +2.4, +4.1 and +5.2 kt at 6,000, 10,000 and 15,000 ft (using the rule's own altitude steps), which just exceeds the spec's stated plus or minus 5 kt at 15,000 ft. D168 already documents +2.5 to +5.0. Recommendation: accept; show the SMM number beside the model number in More detail. Missing test: `tests/unit/core/t6-performance.test.js`: assert model level MPT is within 6 kt of the SMM rule from 0 to 15,000 ft (documents the true margin) rather than the spec's 5.

**TF-E (Low) Split S loses less height than the SMM figure.** At 5 G from 110 KIAS at 10,000 ft the model loses about 1,690 ft from entry (1,976 ft measured from the top of the half roll); SMM 14.16 says about 2,000 ft. This is the 5 G choice (Patrick, 09:27Z) against the SMM's 4 G, so the gap is expected. Recommendation: keep; add "SMM about 2,000 ft" beside it. Missing test: `tests/unit/core/t6-performance.test.js`: pin the 1,690 ft value and the note that it differs from the SMM's 2,000 ft on purpose.

**TF-F (Low) Exact tie names Red first (+18.24 s).** This is V6 behaviour, pinned by the unit test and planned to become "Both" (Q48, task 6). Listed for completeness, not counted.

**TF-G (Low, by design) Two stall definitions coexist.** The shaker margin of 7 kt (93 KIAS) is used for the G limit and the 94 % pull point for Energy mode (D165 / D166). Consistent with the log; the second-checker note about the 0.2 G understatement above is the same issue. Not counted.

Addendum totals: Medium 2 (TF-A, TF-B; TF-B overlaps the D153 item above), Low 5 (TF-C to TF-G, of which two are not counted). Turn Fight screen: not checked by me.

Audit note on the addendum: D175 is PLAUSIBLE/Low. SMM 14.5 para 10 recommends aerobatics below 16,000 ft MSL (a recommendation, not a limit). #185 already shows a note above 15,000 ft; add the SMM line to that one note rather than a second warning (R22).
