# Turn Fight recheck of PR #219 (main 38342ee)

Checked read-only. Local build of 38342ee (vite preview 4306, worktree wt-tf), and the live site https://lizardhands-commits.github.io/Dads-debreif/#/turn-fight. The live site read 064458e at 13:30Z (cached), then 38342ee, then 7d5c981 (main now; nothing under src/modules/turn-fight or docs/checklists changed between 38342ee and 7d5c981). Live results below are from the 38342ee/7d5c981 pages and match the local build in every run.
Scripts: scratchpad/tf219/ (t1 to t9, c1 to c11 browser runs; eng*.mjs engine checks; tf208/sweep.mjs re-run against the new code). Shots: /mnt/project-files/verification/shots/turn-fight-219/ (suffix -local or -live).
Live runs went through a Playwright route that fetches the live URLs (Chromium here does not trust the proxy CA); the only console errors seen there ("fetching the script", service worker registration) are from that route, not the site.

## Summary
Counts: High 0, Medium 0, Low 11 (F1 to F11). Every claimed item is PASS (TF3-8 is a partial pass, see F9). Task 7 works: no console errors, no scheduler leak, fight keeps playing, 3D can be switched back on. The findings are focus, a restored orphan context, a wording gap in the note, and small checklist, log and label mismatches.
Top 5:
1. F1 (Low) After a graphics reset with focus in the 3D picture or on a camera button, focus drops to the page body (a keyboard user loses their place).
2. F2 (Low) If the browser restores the lost context, the abandoned canvas comes back to life and holds a live WebGL context; after about 16 such cycles Chrome warns "Too many active WebGL contexts".
3. F5 (Low) Checklist says "the yellow trails follow them"; the trails are blue and red (yellow is only the MERGE/PASS mark and the first nose-on line).
4. F7 (Low) More detail "Time since the pass" counts from T+0 when the turns start at once (20.0 s at T+20 head-on, although the jets pass at T+16.4).
5. F9 (Low) TF3-8: hint fixed, but the greyed Red-height box still shows a stale value with Climb and dive off, and the start picture shows no height.

## 1. The items from recheck-208 (reproduced on local and live)

| Item | Result | Evidence |
|---|---|---|
| TF3-1 intro and About | PASS | Tail chase ATA 30 L, AA 20 R, Red 150 kt, 2-circle: intro "Two aircraft start apart and turn, at the pass or at once: who gets their nose on the other first?" (no "head-on"). About: "2-circle: each jet turns toward the other ... 1-circle: Red turns away from Blue, so the two share one circle ... Head-on this is V6's same and opposite directions." Also same text at default. Shot tf3-1-2-tail-2circ-local.png |
| TF3-2 which way each jet turns | PASS | Line under "Pass at" (Start geometry): tail chase 2-circle "Blue turns left, Red turns right", 1-circle "Blue turns left, Red turns left"; AA 90 R "Blue turns right, Red turns right"; 1-circle AA 90 L "Blue turns left, Red turns right"; chase on adds "(until first nose-on; then each chases the other)". All 17 start/fight-type combinations from my #208 sequencing table match turnNote (eng3.mjs). Beam "No pass" line still gives directions |
| TF3-3 stern chase first nose-on (PILOT JUDGEMENT, D258) | PASS | ATA 0, AA 0, Red 150 kt: "Pass at T+102.9 s"; at T+106 First nose-on "Blue at +0.0 s" (2-circle and 1-circle), was "Red at +0.0 s". Blue 260 vs Red 220 (the checklist's case): "Blue at +0.0 s" at the T+180.0 pass. Equal speeds tail chase: "Blue at +0.0 s". Sweep of 1,152 starts against my independent model (tf208/sweep.mjs, run on 38342ee): 1,150 agree, the 2 differences are exactly this change (0L/0L, Blue 250 and Red 180, both circles: sim Blue, model Red). Head-on default unchanged. Shot tf3-3-stern-chase-local.png. Recommendation stands: keep, and Patrick confirms D258 |
| TF3-4 sides at 0 and 180 | PASS | ATA 0, playing at T+6.0: ATA side Right leaves the clock running (T+6.4, still "Pause"); AA side Right at AA 180 same. At ATA 30, flipping the side goes to T+0.0 and pauses. Hints say "No side at 0° or 180°." |
| TF3-5 PASS or MERGE | PASS | Crossing start (AA 90): mark reads PASS in 2D (canvas) and in 3D (label text "PASS"), pass 1.41 NM apart; default reads MERGE (2D, 3D); ATA 7 AA 173 (0.24 NM) MERGE, ATA 10 AA 170 (0.35 NM) PASS, ATA 20 AA 160 (0.68 NM) PASS, stern chase MERGE (eng4.mjs). Beam draws no mark. Shots tf3-5-cross-pass-2d-local.png, tf3-5-cross-pass-3d-local.png, c-beam-local.png |
| TF3-6 hints | PASS | ATA hint "the angle off Blue's nose (this tool's term)"; AA hint "AA and HCA: SMM 12.2 paras 6 and 9; sides: SMM 16 para 40b". Page refs only, no manual text |
| TF3-7 WebGL 1 and D244 | PASS | getContext('webgl2') null but webgl available: note "3D needs WebGL 2, which this browser does not have.", stays 2D, fight untouched, one console.warn, no error. No WebGL at all: "3D needs WebGL, which this browser does not have." D244 (context loss) is on main: the SHA 11549f5 is not in the history (the PR was squashed into 38342ee) but the contextlost handling is in view3d.js and index.js and works (section 2). Note: there is still no WebGL 1 rendering fallback (three.js needs WebGL 2); the fix is wording only, as the PR says. Shots tf3-7-webgl1only-local.png, tf3-7-nowebgl-local.png |
| TF3-8 Red-height hint | PASS for the hint (partial, see F9) | Hint now "-5,000 to +5,000 ft, default 0. Used with Climb and dive on. ..."; box greyed with Climb and dive off (enabled with it on) |
| TF3-9 space before degree sign | PASS (landed in #212) | Message reads "Enter a number from 0 to 180°." (no space) |
| TF3-10 Speed label wraps | PASS | With Climb and dive on, Speed (KTAS), G and Pitch labels are all 20 px tall (was 39 px vs 20 px). Shot tf3-10-8-climbdive-local.png |
| Observation A | PASS | About has the line "In a 2-circle fight between equal jets, from a head-on start a nose-on happens only if they come back exactly head-on; a sideways offset (ATA 1°, AA 179°) gives none ...". ATA 1 AA 179: 2-circle "--" at T+60, 1-circle "Blue at +8.3 s"; default 2-circle "Both at +18.2 s" (checked in the engine and the browser) |

Unchanged/not claimed: nothing else from recheck-208 reproduced as a new problem; the 1280 pill wrapping to a second toolbar row and the 50 px page scroll at 1366/1440 are the known baseline.

## 2. Task 7: 3D falls back to 2D on a context loss

Method: WEBGL_lose_context on the 3D canvas, five cases (flying with focus on the 3D picture, paused with focus on the picture, flying with focus on the View radio, paused with focus on a camera button, flying with focus elsewhere), each then restoreContext() on the lost canvas and 3D chosen again. Local and live agree.
- PASS falls back: the note "3D stopped (the graphics card was reset); showing 2D." appears, View shows 2D, top-down picture visible, camera bar and 3D box hidden, live WebGL contexts 1 to 0.
- PASS flying: the clock kept running (T+1.4, 5.2, 8.2, then 11.2 after restore) and the button stayed "Pause". Paused: T+3.0 unchanged, "Play".
- PASS no leaks: __ooda.stats listeners 1, subscriptions 0; frames 0 paused and 1 to 3 flying (same as a 2D fight, sampled 12 times: baseline 1 to 3, after 15 losses 1 to 3); timers 2 to 3 both. Leaving the page after a loss: listeners 0, frames 0. No console errors or warnings from the app, and no three.js "WEBGL_lose_context" warning (only the environment's own SwiftShader messages). axe after a loss: 0 violations.
- On restore (the lost canvas gets its context back): the screen stays in 2D, note unchanged, View stays 2D (D244 says no restore). Choosing 3D again works: new canvas, draws increase, note cleared, clock continues (flying T+13.4), live contexts 1 (2 counting the orphan, F2).
- Screen reader: the note is `role="status"` on an element that is always in the page (visually hidden when empty), so the text is announced when it is set (mutation log: "Loading 3D..." then empty, then the note). The accessibility tree shows `status: 3D stopped (the graphics card was reset); showing 2D.` and the View radio group with 2D checked. Nothing else is announced (the radio change is silent).
- Focus (F1): focus on the 3D picture (tabindex 0) or on a camera button goes to BODY; focus on a View radio or on Play stays put.
- View preference: the loss sets the saved View to 2D (as D244 logs), so after a reload it opens in 2D (viewAfterReload "2D"). See F11.
- Shots: t7-flying-host-before/after/back3d-local.png (and -live), t7-paused-camera-*, t7-flying-radio-*, t7-paused-host-*, t7-flying-nofocus-*.

## 3. The sign-off checklist docs/checklists/turn-fight.md

Walked every section on the local build (and the keyboard, reload, 3D and geometry parts on live). Numbers checked against the engine (eng.mjs, sim.js and readouts.js) and against decisions D244 to D246, D258 to D262, D274. No manual text is quoted (the file has no manual references at all); PASS on the MANUALS rule.
Confirmed as written: home card text, three columns and toolbar, opening settings, closed settings menu and "Pass at T+16.4 s" plus "Blue turns left, Red turns left"; Play/Pause/Reset (Reset while playing stops playing) and the four speeds (measured 0.47, 0.97, 1.96, 3.90 times); the 10-minute stop message with Play disabled; 1-circle line "Blue turns left, Red turns right"; First nose-on "Both at +18.2 s" (2-circle) and "Both at +9.1 s" (1-circle); Blue G 5 gives "Blue at +12.6 s"; chase on Range 0.36 NM at T+40 against 0.53 NM off; ATA 1 AA 179 result; pitch boxes and side view appear and go with Climb and dive; height scale does not restart; menu sections in order with Reset to V6 defaults; bad number message "Enter a number from 0.5 to 10 NM."; separation 4 gives "Pass at T+32.7 s"; crossing AA 90: HCA 90, "Pass at T+16.4 s", "Blue turns right, Red turns right" with AA side Right, PASS mark 1.4 NM apart; beam "No pass: the turns start at once", no mark; tail chase HCA 0, equal speeds "No pass", Blue 260 gives "Pass at T+180.0 s" and "Blue at +0.0 s"; sides at 0/180; At once and back; Red height 2,000 gives Height between 2,000 ft at T+0; Head-on (V6) keeps speeds, G, type; 3D switch keeps the clock, camera buttons Overhead, Chase Blue, Chase Red all look different, drag, wheel, arrow keys, plus and minus all change the picture, Ship colours; pause holds; reload keeps View, fight type, Blue speed and G, chase, 2x speed, ATA; columns stay folded after reload; Reset to V6 defaults keeps View (3D) and resets the rest; readouts: HCA 40 and 16 at T+20/T+30 (1-circle), AA 180/0/35/131 and ATA 0/180/145/49 (2-circle) match the engine (rounded engine values at exactly T+20 and T+30; a pause a few tenths later reads a few degrees off, still "about"); warnings "7.0 G is above the T-6's stall limit at 220 kt (6.5 G)" and "Above the T-6's 7 G limit" then gone; Space, Home, arrow steps (5 kt, 0.1 G, 0.5 NM; 0.5 is the separation step, ArrowUp from 2 gives 2.5) and View arrows.
Wrong or unclear steps: F5, F6, F10 below. Also note the stall figure: the screen shows 6.5 G at 220 kt (the stall line G = (KIAS/86)^2 is 6.54, shown floored); the manuals index note rounds the same value to 6.6. Not a contradiction, only two roundings; the checklist matches the screen.

## 4. No regressions
- Start geometry: 1,152-case sweep against the independent model (tf208/sweep.mjs, run on the new sim): 1,150 identical, 2 differences that are the intended TF3-3 change (above). Default still V6: merge 16.36 s, first nose-on "Both at +18.2 s" (2-circle) and "Both at +9.1 s" (1-circle). All 17 turn lines match my table.
- axe (all rules) at 1280x720 and 1440x900: 0 violations with 2D, 2D plus settings open plus geometry set, 3D plus settings open, 3D playing, back to 2D, and after a context loss.
- Settings menu with Escape: closes and returns focus to the "Turn Fight settings" button (both sizes).
- Layout at 1280: no horizontal scroll (scrollWidth 1280); columns 12 to 332, 344 to 968, 980 to 1268, no overlap; the phase pill drops to a second toolbar row (known baseline). Shots c-1280-2d-local.png, c-1280-3d-local.png.
- Suites on 38342ee: npm test 2,842 pass, 0 fail, 8 todo (2,850 tests; the PR text says 2,699 because main grew after the PR's own run). Playwright Chromium turn-fight.spec.js (50) plus a11y.spec.js (9): 59 passed.

## Findings

### F1 (Low) Focus drops to the page body when the 3D picture or a camera button had it at a graphics reset
Where: Turn Fight, 3D on, keyboard user.
Steps: choose 3D, Tab (or click) to the 3D picture, or to the "Chase Blue" button; force a loss with the WEBGL_lose_context extension on the 3D canvas (t5.mjs).
Expected: after the 3D box is hidden, focus lands on a live control near it (for example the checked "2D" in View), so a keyboard or screen-reader user keeps their place (WCAG 2.4.3 focus order; frontend-ui-engineering skill). No spec line says so; the spec only asks for the note and 2D.
Actual: document.activeElement is BODY (paused-host, flying-host, paused-camera). With focus on the View radio or Play it does not move.
Shot: t7-flying-host-after-local.png, t7-paused-camera-after-local.png.
Known/planned: no.
Missing test: tests/e2e/turn-fight.spec.js, "after a context loss with the focus on the 3D picture or a camera button, focus is inside the module (the View choice), not the body".
Recommendation: in stayIn2d, if focus was inside ui.canvas3d or the camera bar, focus the checked View radio.

### F2 (Low) A restored context comes back as an orphan live context
Steps: 3D, lose the context, then restoreContext() on the old canvas (the browser does this by itself after a real reset, because the code calls preventDefault). Repeat 20 times without switching back (t6.mjs, t7.mjs).
Expected: nothing holds a WebGL context when 2D shows (R4; the 3D view "holds no GPU resources" when 2D shows, view3d.js header).
Actual: after the restore the old (detached) canvas has isContextLost() false again, so "live contexts" is 1 with 2D showing (2 after choosing 3D again). Over 20 loss-and-restore cycles Chrome logs "WARNING: Too many active WebGL contexts. Oldest context will be lost." 4 times (none without restore). Chrome itself then drops the oldest, so nothing breaks; 16 real GPU resets in one session is unlikely.
Shot: none (console and counts; t5.out.json afterRestore.live 1).
Known/planned: partly (D244 accepts no restore; the view comment says the restored canvas is collected).
Missing test: tests/unit/turn-fight/view3d.test.js, "after a loss, a webglcontextrestored on the old canvas releases that context again (forceContextLoss) and the view holds no reference to it"; e2e: restoreContext() then liveContexts is 0.
Recommendation: leave a one-shot 'webglcontextrestored' listener on the lost canvas that calls the extension's loseContext() again, or do not call preventDefault so it is never restored (three.js calls it anyway, so the first is the simple one).

### F3 (Low, observation, mostly before this PR) Retired 3D canvases are not garbage collected
Steps: Chromium with --expose-gc; 10 times switch 3D on then 2D (no loss), then gc(); count canvases still reachable through a WeakRef (t7.mjs). Then 10 more with loss.
Expected: retired canvases are collected (a plain page-made canvas with a WebGL2 context, lost or not, is collected: 9 of 10 or 10 of 10, control in t7/t8).
Actual: 10 of 10 retained after the normal stop path, 20 of 20 after 10 more with loss. GPU state is released (live contexts 0) so this is the canvas element plus three.js JS objects only; I did not find what holds them and could not say if it is the app or three.js. The normal stop path is unchanged by this PR, so this is not caused by task 7.
Known/planned: no.
Missing test: tests/e2e/turn-fight.spec.js (or view3d unit with the fake page): "after 3D on and off 10 times and a forced GC, at most 1 canvas is still reachable".

### F4 (Low) The note says what happened but not how to get 3D back, and stays after a restore
Steps: any loss, wait; the note stays, also after the restore event.
Expected: the student can tell that 3D can be tried again (D244: "choosing 3D again makes a new context").
Actual: "3D stopped (the graphics card was reset); showing 2D." with no next step; it stays until the View is changed. Screenshot shows it above the picture, moving the picture down about 44 px.
Shot: t7-flying-host-after-local.png.
Known/planned: no.
Missing test: tests/e2e/turn-fight.spec.js: the note (or the checklist) tells the student to choose 3D to try again.
Recommendation: "3D stopped (the graphics card was reset); showing 2D. Choose 3D to try again." (checklist line updated the same way).

### F5 (Low) Checklist: "the yellow trails follow them" is wrong
Where: docs/checklists/turn-fight.md, Play, Pause and Reset, second bullet.
Steps: play the default fight past T+16.4, look at the trails.
Expected (checklist): yellow trails. Expected per app: trails in each jet's colour (Blue trail blue, Red trail red); yellow is the MERGE/PASS cross and the first nose-on dashed line.
Actual: blue and red trails (2D and 3D).
Shot: c-merge-local.png, c-t30-local.png, c-3d-play-local.png.
Missing test: none in code (docs). If wanted, a docs check that quoted colours in the checklist exist in the CSS is overkill; fix the sentence: "and the blue and red trails follow them".

### F6 (Low) Checklist: "The side view shows Blue rising and Red falling" is only true after the pass
Where: Climb and dive section, second bullet (pitch 10 and -10).
Steps: Climb and dive, Blue pitch 10, Red pitch -10, read the side view at once and at T+10.
Expected: as written, right after the fight restarts.
Actual: both jets fly level until the turns start: side view flat at T+0 and T+10 (Height change 0 ft), Blue +891 ft and Red -891 ft at T+30 (More detail). A tester who looks at T+0 will think it failed.
Shot: c-pitch-t0-local.png, c-pitch-t10-local.png, c-pitch-t30-local.png.
Missing test: none (docs). Fix: "after the pass the side view shows ...".

### F7 (Low) "Time since the pass" counts from T+0 when the turns start at once
Where: More detail, with "When the turns start" = At once.
Steps: Head-on, At once, play to T+20, open More detail.
Expected: label "Time since the pass" (D274: it counts from the pass): the note says "Turns start at once (the jets pass at T+16.4 s)", so 3.6 s.
Actual: 20.0 s (and 10.3 s at T+10.3 for the beam start "No pass"). It counts from T+0 (the turn start, mergeSec 0), and First nose-on is counted from the same point (spec line 382 agrees for first nose-on). The label then names the wrong instant.
Known/planned: no (D274 chose the label for the pass case only).
Missing test: tests/unit/turn-fight/readouts.test.js: the More detail time row for turnsAt "once" (and the label, or a different label when there is no pass).
Recommendation: label the row "Time since the turns started" whenever the turns start at once or there is no pass, "Time since the pass" otherwise.

### F8 (Low, decision log) D262 contradicts what shipped
D262 (12:36) says the turn line "does not change with First nose chases". D274 (13:01), the spec (line 363) and the screen add "(until first nose-on; then each chases the other)" when chase is on (verified: chase on adds it). The checklist and the code follow D274. Not a wrong flight answer; the log should say D262 is superseded. Also D244 says the fallback sets View to 2D; see F11. No logged call for this module contradicts the SMM, manuals or spec otherwise (D258, D259, D260, D261, D245, D246 read and matched).
Missing test: n/a (log). The behaviour is pinned by the e2e in turn-fight.spec.js for the chase note.

### F9 (Low) TF3-8 only half fixed
Steps: Climb and dive on, Red height 3000, Climb and dive off (t4.mjs, shot tf3-10-8-climbdive-local.png).
Expected (recheck-208 TF3-8): the hint no longer says "shows with"; a greyed value should not mislead; the start picture shows the height difference.
Actual: hint fixed ("Used with Climb and dive on."). With Climb and dive off the box is greyed but still reads 3000 while the fight is level; the start picture never shows the height. The PR claims only the hint, so this is not a regression.
Missing test: tests/unit/turn-fight/view.test.js: the start picture draws a height label when Red starts above or below (with Climb and dive on); e2e: greyed box value.

### F10 (Low, checklist) Two "When 3D can't run" steps cannot be done by most testers as written
The graphics-reset step ("you can't easily make it happen") and the no-WebGL step ("for example WebGL turned off in the browser's settings") are both skippable as written, so nothing fails, but the sign-off never runs the new task 7 behaviour. Steps that work on the live site: DevTools console on the Turn Fight page with 3D showing, run `document.querySelector('.tf-3d canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()` (I ran exactly this on the live page; it gives the note and 2D). A Chrome-only alternative (chrome://gpucrash) I did not try. In current Chrome, switching hardware acceleration off may leave WebGL running through software; I did not check that, so the no-WebGL line may also never be reproducible in Chrome (untested).
Missing test: none (docs). Recommendation: add the console line as the way to do the reset step and say the note should also tell how to switch back (F4).

### F11 (Low, logged call worth a second look) A one-off graphics reset overwrites the saved View
D244 chooses that the fallback sets View to 2D "as the other 3D failures do". For a missing WebGL that is right; for a transient reset the student's saved choice is lost: after 15 test resets and a reload the module opens in 2D (viewAfterReload "2D"). Recommendation: keep it (simple, logged), but say so in the checklist ("after a reset, View stays 2D, also after a reload, until you choose 3D again").
Missing test: tests/e2e/turn-fight.spec.js: after the loss, a reload opens in 2D (pins D244 either way).

## PILOT JUDGEMENT items (recommendations)
- TF3-3 (D258): the PR does what I recommended (a jet already within 5 degrees at the moment the turns start counts +0.0 s; Both if both). Recommendation: keep, Patrick confirms; the 10 ft rule for coincident jets is fine.
- Observation A: the About line is in. Recommendation: keep the 5 degree cone as is.
- D259 (PASS above 0.25 NM): keep; it changes a word, not a number.

## Missing tests in one list
1. tests/e2e/turn-fight.spec.js: focus after a context loss (F1); restoreContext leaves 0 live contexts (F2); note offers the way back (F4); reload after a loss opens in 2D (F11); retired-canvas GC check (F3).
2. tests/unit/turn-fight/view3d.test.js: webglcontextrestored on the lost canvas releases the context (F2).
3. tests/unit/turn-fight/readouts.test.js: the More detail time row and label for at-once and no-pass starts (F7).
4. tests/unit/turn-fight/view.test.js: start picture height label (F9).
