# Turn Sim recheck of PR #215 "controls say what is flown", commit 7d5c981 (2026-09-30)

Independent, read-only check. No repo file touched (`git status` clean in the worktree). Worktree `scratchpad/wt-turnsim` at 7d5c981, `npm ci && npm run build`, `vite preview` on port 4301, Chromium 1440x900 unless stated.
Live site: `https://lizardhands-commits.github.io/Dads-debreif/#/turn-sim` serves `app-version 2026-09-30 7d5c981`. Chromium could not trust the proxy CA, so I mirrored the live files with curl (25 of 28 files byte-identical to my build; only `index.html` build timestamp, `sw.js` and the vite manifest differ) and drove the mirror on port 4311. The live-site pass is in section 6.
Sources: the engine through `createRun` (132 default runs + the 1,728 and 1,440 run sweeps from #189), the screen through Playwright, SMM ch.16 Figs 16.15 to 16.21, 16.30 to 16.34 and paras 52 to 64, 112, 118 (cited by number only), `decisions-for-review.md` (D146, D172, D248 to D252, D169, D184), and the PR diff (`git diff 878286e 7d5c981`).
Scripts: `scratchpad/ts215/` (`fly.mjs`, `verdict.mjs`, `sweep.mjs`, `sweep4.mjs`, `extra.mjs`, `n1*.mjs`, `n4*.mjs`, `a1*.mjs`, `aria.mjs`, `n6.mjs`, `n9.mjs`, `n10.mjs`, `matrix.mjs`, `layout.mjs`, `live.mjs`). Pictures: `/mnt/project-files/verification/shots/turn-sim-215/`.
Positions are `R` ft to the right of Lead and `F` ft ahead of Lead's 3/9 line, on Lead's final heading.

## 1. Verdict on each claimed fix

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| N1 | Shackle or Cross, then a 4-ship or the box: menu switches to Delayed 90 with a note; what is shown equals what is flown | **PASS** (one latent gap, F4) | Section 2 |
| A1 | "#2's side" in the two-ship now changes the geometry | **PASS as "no dead control", but not as briefed.** The PR hides the control in the two-ship and the box (D249: "hidden, alternative: make it mirror"). It does not mirror the two-ship. See review note R1 | Section 3 |
| N2 | Shackle Direction greyed, announced as disabled, aria-disabled per the app-frame convention | **PASS** | Section 4 |
| N4 | Turn Sim-only 1 degree / 1 percent tolerance; perfect turns no longer FORE/WIDE; real errors still flagged; core classifier unchanged | **PASS**, with the tolerance's size spelled out (R2). One related gap: in-place 90 and check turns still end with red flags (F3) | Section 5 |
| N6 | Box hook: "#4 turns with #3" | **PASS** | Section 7 |
| N7 | Auto clock label follows the turn | **PASS** | Section 7 |
| N8 | Box + Clock: lines agree with the warning | **PASS** | Section 7 |
| N9 | No WebGL says so, not "connection" | **PASS** | Section 7 |
| N10 | Overlaps and truncated selects | **PARTIAL, STILL OPEN** for two selects and one picture (F1, F2) | Section 7 |
| N3 | 4-ship Delayed 45 check turn (Fig 16.34) | Not claimed. **Unchanged**: 4312 and 2134 last aircraft starts at 116 s (run 129 s); D252 (check version) is logged as a separate pending PR | Section 8 |
| D169 | Shackle/Cross in the box (para 112b) | Not claimed. **Unchanged**: greyed in 4312, 2134 and the box (D146). Not a bug | Section 8 |
| N5 / N11 | Box rear delays 10-15 s (D184); D172 says 1,366 px | Unchanged (box hook #3 18.9 s and "outside the SMM 10-15 s" line; D172 text still says 1,366 px, the layout stacks at 900 px) | Section 8 |

Counts of what I raise now: High 0, Medium 1 (F3), Low 3 (F1, F2, F5), review notes 3 (R1, R2, R3), latent 1 (F4).

## 2. N1 in detail: shown equals flown, in every order

Method: each scenario in a fresh browser; after the changes the setup column is read (Turn menu text, Turn degrees, Direction radios, notes), then the run is played at 4x to the end with More detail open, and the end numbers are compared, character for character, with a control run where Delayed 90 is chosen directly in that formation with the same Direction (`ts215/n1.mjs`, `n1-*.out`).

| Order of changes | Turn menu | Turn degrees | Direction | Note | End numbers vs control |
|---|---|---|---|---|---|
| 2-ship, Shackle, then 4312 | Delayed 90 | 90 | enabled, Right | "Shackle and Cross turn are two-ship only, so this is now a Delayed 90." (role=status) | identical (4312 Right: #2 -59, #3 +59, #4 +99 fore/aft, min sep 5,941) |
| 2-ship, Cross, then 4312 | Delayed 90 | 90 | enabled | same | identical |
| 2-ship, Shackle, then box | Delayed 90 | 90 | enabled | same | identical (box: #3 10.9 s, #4 16.1 s after #3, order Lead #3 #2 #4) |
| 2-ship, Cross, then box | Delayed 90 | 90 | enabled | same | identical |
| 2-ship, Shackle, then 4312, then 2134 | Delayed 90 | 90 | enabled | the generic "two-ship turns" hint (the switch note is dropped on the next formation change) | identical to a direct 2134 Delayed 90 |
| 2-ship, Direction Left first, then Cross, then 4312 | Delayed 90 | 90 | enabled, Left kept | switch note | flies Left (same as direct) |
| 2-ship, Left, Shackle, then box | Delayed 90 | 90 | Left kept | switch note | identical to direct box Left (#4 16.1 s before #3) |
| 4312 Delayed 45, then 2-ship Cross, then 4312 | Delayed 90 (not 45; falls to the default turn) | 90 | enabled | switch note | identical |
| 2-ship Cross, 4312, then back to 2-ship | Delayed 90 stays, no note | 90 | enabled | none | Delayed 90 |
| 2-ship Cross, Turn degrees edited to 150, then 4312 | Delayed 90 | 90 | enabled | switch note | Turn degrees reset to 90 |
| Switch while the run is playing (2x, t = 6 s) | Delayed 90 | 90 | enabled | switch note | run stops at t = 0, Play shows "Play" (`n1-switch-while-running.png`) |
| Reload | defaults (4312, Delayed 90) | 90 | Right | generic hint | the scenario is memory-only ("Saved setups ... will go here", index.js:36), so no saved state comes back |
| Keyboard type-ahead "Sh" or "Cr" on the Turn menu in 4312 | stays Delayed 90 | | | | the two options are `disabled`, so they are skipped |
| Unrelated edit (Spacing) after the switch | note stays | | | | fine |

After the switch, Direction's fieldset has `disabled=false`, no `aria-disabled` and no `aria-describedby` (`ts215/fin.mjs`). Pictures: `n1-shackle-4312.png`, `n1-shackle-box.png`, `n1-cross-4312.png`, `n1-switch-while-running.png`.
The Turn menu disables Shackle and Cross in 4312, 2134 and the box, and enables them in the two-ship (D146).
Saved state: see F4 (latent).

## 3. A1 in detail: #2's side

What shipped: `layout.js applyScenario` hides the whole "Line abreast" section (label, hint) unless the formation is 4312 or 2134; the hint now reads "Which side of Lead #2 flies on, in 4312 and 2134. The two-ship and the offset box have their own places." D249 and SPEC-turn-sim lines 56 and 89 say the same (#2's side is a 4312/2134 setting, D48). So the brief's "now changes the geometry in the two-ship" is not what the PR does: it removes the dead control. The screen: hidden in the two-ship and the box, visible in 4312 and 2134 (`a1ui.mjs`, `a1-*.png`).

Geometry, flown through the engine (`ts215/a1.mjs`):
- Two-ship: `twoSide` Left and Right give identical start and end positions for all 7 turns x 2 directions (24 runs with the box, 0 differ). #2 always starts on Lead's right (R +6,000) for every turn and direction.
- 4312 and 2134: `twoSide` Right is the exact mirror of Left with the opposite Direction, for 5 turns x 2 directions x 2 timings x 2 formations = 40 runs, 0 mismatches (all positions within 3 ft). #2 starts at R -6,000 (4312, Left) or R +6,000 (4312, Right). The #189 sweep (1,440 runs, #2 side Left and Right) still gives 0 off.
- SMM: Figs 16.15 to 16.17 draw the wingman on either side and show "away" and "towards" versions; both are reachable in the two-ship from the Direction control (Direction Right = turn toward #2, Left = away). Fig 16.34 (left turn: #4, #3, Lead, #2) matches 4312 Delayed 90 Left.

Nothing wrong; one review note R1.

## 4. N2 in detail: the Shackle's Direction

`ts215/aria.mjs`, Two-ship, Turn = Shackle:
- The fieldset is `<fieldset disabled aria-disabled="true" aria-describedby="ts-direction-note">`; the note reads "Both turn toward each other; direction doesn't apply." (visible, in the DOM next to the control).
- Accessibility tree (Playwright `ariaSnapshot`): `group "Direction" [disabled]` with `radio "Right" [checked] [disabled]` and `radio "Left" [disabled]`. Same for the Cross turn ("Lead always turns toward #2: right in this run."). With Delayed 90 the group is enabled and has no describedby.
- `aria-disabled` is applied by the ui-kit's own `controls.setDisabled` (SPEC-ui-kit line 59: the whole control is marked `aria-disabled="true"`, so the dimmed text counts as inactive for contrast), which is the convention this repo uses for form controls; the `aria-disabled` button convention (SOF's Refresh, Traffic's + Spawn) is for buttons that must keep focus, and Direction is not one. The disabled radios are not in the Tab order (`Start heading -> Turn -> Speed`), and the note is plain text, so a screen reader in browse mode reads it.
- axe (wcag2a, wcag2aa): 0 violations with Shackle selected and after the switch note appears.
Pictures: `n2-shackle-direction-greyed.png`, `n2-cross-direction-greyed.png`.
PASS. One thing I could not test here: whether a screen reader speaks the switch note (a `role="status"` paragraph whose `hidden` is removed and text set in the same step). See "Not verifiable" below.

## 5. N4 in detail: the Turn Sim-only tolerance

Perfect turns (`ts215/allon.mjs`, all 132 default runs through `formationRows`): every 2-ship Delayed 90/45, Hook, Shackle, Cross and every 4312/2134/box Delayed 90/45 and Hook end row reads ON SPACING with Time and Auto timing (no FORE/WIDE at 6,039, 6,025, +59, +99). Clock timing still shows its 15 degree sweep (FORE or AFT) as before (PJ-1 in #189). On the screen (`matrix.mjs`, 44 runs) the labels are ON SPACING everywhere except in-place and check (F3).

Core untouched: `git log 0df9581..7d5c981 -- src/core/standards.js` is empty; the core classifier still returns `FORE` for a wingman 59 ft ahead at 5,941 ft (`ts215/core.mjs`); the tolerance lives in `readouts.js withinPilotTolerance`, used only by the Turn Sim. Full `npm test`: 2,854 tests, 2,846 pass, 0 fail, 8 todo (Debrief and core golden tests included).

Real errors (`ts215/n4.mjs`, a wingman moved from a perfect end position, default standards, spacing 6,000 ft):

| Error on #2 | 2-ship Delayed 90 (perfect +59 fore) | 2-ship Hook (perfect 0) | 4312 Delayed 90 | Box Delayed 90 |
|---|---|---|---|---|
| Fore 50 ft | FORE | not flagged | not flagged | FORE |
| Fore 100 ft | FORE | not flagged | not flagged | FORE |
| Fore 200 ft | FORE | FORE | FORE | FORE |
| Wide 50 ft | not flagged | not flagged | not flagged | not flagged |
| Wide 100 ft | not flagged (6,041) | WIDE (75 ft already flags) | not flagged | not flagged |
| Wide 200 ft | WIDE | WIDE | WIDE | WIDE |
| Aft 50, 100, 200 ft; Tight 50, 100, 200 ft | not flagged | not flagged | not flagged | not flagged |

Reading: 200 ft flags in every case; 50 and 100 ft fore flag only when the turn's own +59 ft adds to them (2-ship Delayed 90, the box); wide flags from about 60 ft past the 6,000 ft edge. Aft and tight of 200 ft are inside the SMM's own band (sweep 0 to 10 degrees aft, 4,000 to 6,000 ft), so they were never flagged and are not flagged now; that is the core standard, not the tolerance.
Deliberate errors put in through Aircraft errors ("Put it out of position", 50/100/200 ft on #2, #3, #4, fore/aft/wide/tight, 6 formation+turn combinations, `n4b.mjs`) and compared with the pre-#215 `readouts.js` over 3,692 rows (`n4c.mjs`): 715 rows changed label, all from FORE, WIDE/FORE or WIDE to a lesser or no label, none the other way. All 715 changes are reductions. Each lost FORE is within 1 degree of sweep from the wingman's own reference (Lead, or #3 for #4 in 4312/2134, core's rule: 0.87 degrees for the #4 with a 50 ft wide error, where the card's Lead-frame number reads +149 ft), and each lost WIDE is at most 60 ft past the set spacing (`n4c.mjs` end: max 60 ft). Many of the injected errors were absorbed by the turn itself (the Cross turn re-solves to 6,025 ft whatever the start error) or were carried by a wingman other than the one flagged. The unit tests pin 300 ft, 130 ft (FORE), 59 ft and 6,039 ft (not flagged), an edited standard, and the V6 fixed-tolerance kind.
PASS. Review note R2 on what the tolerance hides.

## 6. Live site

`app-version 2026-09-30 7d5c981`. On the mirror of the live files: default 4312 Delayed 90 Right; Shackle in two-ship shows Direction disabled with the note; "#2's side" hidden in the two-ship, visible in 4312; Shackle then 4312 shows "now a Delayed 90" note; Cross then box shows the note and the box Delayed 90 flies (t = 75.05 s, all ON SPACING); two-ship Shackle ends ON SPACING, "Crossing: 300 ft vertical needed, #1 and #2", min sep 6,039; Cross ends ON SPACING, "Second half at 1.6 G to roll out 6,000 ft apart"; Delayed 90 ends ON SPACING; the Auto label reads "Auto (4:30 right, 7:30 left)" for Delayed 45; axe 0; console clean. Picture: `live-cross-to-box.png`.

## 7. N6 to N10 (what they were, from #189 section 5)

| ID | What | Now |
|---|---|---|
| N6 | Box hook line said "#4 turns 18.9 s after #3" | **PASS**: "#3 18.9 s, outside the SMM 10-15 s; solved so the box keeps its shape" and "#4 turns with #3". Delayed 90 keeps "#3 10.9 s, in the 10-15 s band / #4 turns 16.1 s after #3" |
| N7 | Auto clock label stale for Delayed 45 | **PASS**: Delayed 90 "Auto (7 right, 5 left)", Delayed 45 "Auto (4:30 right, 7:30 left)", back to Delayed 90 correct; the only Auto label on the screen is the one select |
| N8 | Box + Clock: lines said "watching" / "cue came from" | **PASS**: "#3 turns on the rear element timing", "#4 turns on the rear element timing" at t = 0 and at t = 35.9 s (`n8-box-clock-running.png`); #2 still "watching #1 for 7 o'clock" then "cue came from #1, turning" |
| N9 | WebGL-off note blamed the connection | **PASS**: "3D needs WebGL, which this browser does not have." with WebGL disabled; 2D stays selected; 0 three.js requests; console clean (`n9-webgl-off.png`). The e2e for the failed download still expects "3D needs a connection the first time." |
| N10 | Label overlaps, truncated selects | **PARTIAL**. Fixed: Timing and Clock position take a full row and read "Clock position cue" / "Auto (7 right, 5 left)" in full; "12,000 ft" is above #3 in 4312; the circle labels are staggered. Still open: two selects (F1) and the box's picture (F2) |

## 8. Not claimed, noted as unchanged

- N3: 4312/2134 Delayed 45 last aircraft starts at 116 s (Time), 117 s (Auto), 110 s (Clock); the screen run ends at t = 129.1 s (matrix); Fig 16.34's 10-15 degree check turn is not built at this commit. D252 logs it for a later PR.
- D169: para 112b lists the shackle for the box; the app greys it (D146). Unchanged. PILOT JUDGEMENT as in #189 (PJ-5).
- N5/D184: box hook #3 18.9 s outside the band, flagged on screen; box Delayed 45 #3 -0.5 s. Unchanged.
- N11/D172: the log line still says the layout stacks below 1,366 px; `turn-sim.css` stacks at 900 px. No fix in #215 (log-only).

## 9. Regressions

Engine (`ts215/fly.mjs`, `verdict.mjs`, `sweep*.mjs`, `extra.mjs`):
- 132 default runs (4 formations x 7 turns x 2 directions x 3 timings, minus Shackle/Cross in the three 4-ship formations): positions, first-turn times, segment G/bank and heading changes are **byte-identical to the #189 run** (0 of 132 differ). Under the #189 classification: 94 MATCHES clean, 20 MATCHES with a note, 18 PARTIAL (N3, N5), **0 WRONG**. My stricter rule script flags 4 more runs (box + Clock timing, #2 abeam R-4697 to R-5446 and #4 aft 5,704 to 8,294 ft); these are the same numbers as #189 and are the documented Clock cue rollouts (PJ-1), not new.
- Sweeps: 1,728 two-ship runs (6 turns x spacing x speed x G x start heading x direction) 0 off, 0 of 576 combinations depend on the start heading; 1,440 four-ship and box runs (also #2 side Left and Right) 0 off.
- Shackle: tracks cross 8 ft apart at 12.9 s (dt 0 s), both aircraft turn 45 toward each other and 45 back, end on the start heading, #2 at R-6,039 F0, "Crossing: 300 ft vertical" flagged. Hook: 180 degrees together, ends abreast at R-6,000 F0. Cross: 60 degrees of bank / 2.0 G to 90 degrees, then 1.57 G / 51 degrees (D214), tracks cross 9 ft at 11.9 s, ends reciprocal, #2 R+6,025. Delayed 45: no aircraft exceeds 45 degrees in any formation, direction or timing (max 45.0). Box order at the end (18 runs, Delayed 90/45/Hook, both directions, all timings): Lead, #3, #2, #4 on one side, 0 wrong. LAB turns: 3.0 G / 70.5 degrees of bank in every non-cross turn of every formation.
- Screen (`matrix.mjs`): 44 runs (Two-ship 14, 4312 10, 2134 10, box 10; each turn, both directions), played at 4x to the end: the end card equals the engine's numbers in 43; the 44th (box In-place 90 Right) is a parser limit of my script (the #3 line has a different format) and its labels match the engine. 0 wrong. Console 0 errors, 0 warnings in every run.
- Axe (wcag2a, wcag2aa): 0 violations at 1366 x 768 with all panels open, with the Layers menu open, box + Clock, Cross turn running; and with Shackle selected and after the switch note.
- Escape: the app Settings dialog closes on Escape and focus returns to the Settings button (`esc-open.png`, `esc-closed.png`); the Layers menu closes on Escape.
- Layout: 1280 x 720, 1366 x 768, 1440 x 900: three columns (setup 12-300, stage 313-983/1069/1143, formation), no column overlaps another, no sideways scroll, no control covered by another after scrolling each into view (all panels open; 4312, two-ship Cross, box Clock). 1024 x 768: no column overlap and no sideways scroll (picture labels not re-examined; outside the 1280 spec); 768 x 1024 and 390 x 844 stack in one column with no sideways scroll.
- Repo tests: `node --test tests/unit/turn-sim/*.test.js tests/golden/turn-sim-*.test.js` 200 pass, 0 fail (196 in #189). Full `npm test` 2,854 tests: 2,846 pass, 0 fail, 8 todo. `playwright test tests/e2e/turn-sim.spec.js` 41 passed (1.8 min); repeated 3x (`--repeat-each=3`) 123 passed, 0 flaky, so the old `check()` race is gone: the test now uses `click` with the comment "click, not check" at turn-sim.spec.js:469. The turn-sim visual test (`visual.spec.js:96`) passes.

## 10. Findings

Format: ID, severity, where, steps, expected (reference), actual, picture, known?, missing test.

**F1 (Low, STILL OPEN, part of N10) Two selects still cut the chosen option in half.**
Where: Setup, More setup, "Offset box" section, "#4 timing"; and Aircraft errors, each aircraft's "Watches". Steps: pick Offset box (and Timing = Clock position cue for Watches), open Turn Sim settings and Aircraft errors, 1280 or 1440 wide. Expected: the chosen option is readable (N10 "truncated selects fixed"). Actual: the 130 px selects show "Fly to the bo" (option "Fly to the box slot (solved)", 213 px in a 92 px box) and "Same as se" ("Same as setup", 118 px in 92); in 4312 the three "Watches" boxes are cut the same way. Picture: `n10-box-4timing-select.png`, `n10-watches-select.png`. Known: it is the TS-13 half of N10 that #215 did not reach (only Timing and Clock position got `ts-wide`). Missing test: `tests/e2e/turn-sim.spec.js`: at 1280 with all panels open, every visible select in the setup column shows its selected text without clipping (compare option text width with the box).

**F2 (Low, STILL OPEN, part of N10) The box's ready-to-play picture still has colliding labels.**
Where: Offset box at t = 0. Steps: pick Offset box; look at the picture at 1280 x 720 (or 1366). Expected: labels readable, as the 4312 picture now is. Actual: the pair distance labels "7,616 ft" and "11,402 ft" sit on the #1 and #2 circle labels ("#2 3.0 G, R 1,515 ft" is overprinted by "11,402 ft" at 1280; they touch at 1366). Picture: `n10-box-open-1280.png`, `n10-box-zoom-1366.png`. Known: #215 staggered the circle labels and moved "Lead 3/9", and remade only the default (4312) screenshot. Missing test: `tests/e2e/visual.spec.js`: a second reference picture, the box at 1280 x 720 (the current one covers only the default 4312).

**F3 (Medium, new; same class as N4) A perfect In-place 90 and Check turn end with amber flags.**
Where: Formation card at the end of the run, In-place 90 and Check turn in every formation. Steps: Two-ship, Turn In-place 90, Play at 4x. Expected: the SMM ends an in-place turn in trail at LAB spacing (para 59), and a check turn (para 58) leaves a small heading change the wingman corrects; a correct turn should not read as an error, as N4 argued. Actual: "#2 TIGHT / FORE interval 0 ft, fore/aft +6,000 ft" (In-place 90 Right; Left "TIGHT / AFT"); Check turn "FORE" or "AFT" 3,000 ft; 4312 In-place "#2 TIGHT / AFT, #3 TIGHT / FORE, #4 TIGHT / FORE"; box In-place also "#3 FORE / WIDE", Check "#3 FORE / WIDE" or "WIDE" (44 screen runs, all matching the engine). The line-abreast standard is applied to a trail or echelon finish. Picture: `matrix-twoShip-inplace90-right.png` (the label "TIGHT / FOR" is also clipped by the picture's right edge). Known: not in #189 or todo. Recommendation (owner acts): for In-place 90 judge and say the trail distance ("in trail 6,000 ft, ON SPACING"), and for the Check turn either the same as the Delayed turns after the check or "Not judged: check turn"; keep AFT/FORE for the line-abreast finishes. Missing test: `tests/unit/turn-sim/readouts.test.js` (or a whole-matrix test `smm-matrix.test.js`): "a default In-place 90 and Check turn end without TIGHT or FORE/AFT flags".

**F4 (Low, latent, not reproducible in the UI today) N1 is fixed only inside the change handler.**
Where: `index.js` `scenario.subscribe` (lines 305 to 313). The check `turnProblem(values.formation, values.maneuver)` runs when a setting changes, not at mount, and `createSettings` does not call `checkSettings`. Today the scenario is memory-only (`memoryStore`, "Saved setups ... will go here"), so the screen cannot open with Shackle in a 4-ship. Expected: when Profiles arrive, a saved Shackle + 4312 opens on Delayed 90 with the note (D146, D248), not with the old N1 mismatch (menu on a greyed turn, engine falling back through `maneuverFallback`). Actual: not reproduced (no way to load it); the risk is by reading the code. Missing test: `tests/e2e/turn-sim.spec.js` or a `tests/unit/turn-sim/index.test.js`: mount with a preset scenario `{formation: 'weighted', maneuver: 'shackle45'}` and expect Delayed 90 in the menu; add it with the Profiles task.

**F5 (Low, new) The greyed Direction can highlight a side that is not the one flown.**
Where: Setup, Direction with Cross turn (and Shackle). Steps: Two-ship, Direction Left, Turn Cross turn. Expected: what is shown equals what is flown (the theme of #215). Actual: Direction "Left" is highlighted (greyed) while the note reads "Lead always turns toward #2: right in this run." (#2 flies on Lead's right in the two-ship, so Lead turns right); in the Shackle Lead's first turn is right, toward #2 (turn sequence R then L), while Left is highlighted and the note says "both turn toward each other". Picture: `matrix-twoShip-cross180-left.png`. Known: D161, D250 grey it and explain it; the highlight was not addressed. Recommendation: leave neither radio highlighted while it is greyed, or highlight the flown side. Missing test: `tests/e2e/turn-sim.spec.js` (Cross/Shackle Direction tests): with Direction Left chosen first, the greyed group has no radio checked, or the checked one equals "Lead ... in this run".

### Review notes (not bugs)

- **R1 (A1 as briefed vs shipped; owner's call, D249).** The two-ship has no way to put #2 on Lead's left: #2 is always on the right and only Direction (toward or away from #2) changes. Mirror pictures are equivalent, so all SMM figures are reachable, but a crew that flies its wingman on the left sees the picture mirrored. D249's alternative ("make it mirror the two-ship too") is still open. Recommendation: keep hidden until Dad says he needs it.
- **R2 (N4 tolerance size; D251).** The tolerance means a wingman up to about 105 ft ahead at 6,000 ft (1 degree, more at wider spacing) or up to 60 ft past 6,000 ft is not flagged, so a deliberate 50 ft fore or wide error is never flagged, and a 100 ft fore error is flagged only when the turn's own +59 ft adds to it (200 ft always flags). The SMM's sweep 0 to 10 degrees aft is stricter than this by 1 degree; a pilot cannot hold or see 1 degree at 6,000 ft, so I recommend keeping it. The numbers still print on the line and in More detail. The decision log line D251 should say "about 105 ft fore at 6,000 ft, 60 ft wide".
- **R3 (D172 and D169 wording).** As in section 8; owner's log edit only.

### Not verifiable here

A screen reader announcing the switch note (`role="status"` paragraph whose `hidden` is removed and text set together): the DOM is right (role, text, visible); real speech needs NVDA/VoiceOver. PILOT-free; an assistive-tech user check is the only way. Recommendation: keep it; also `say()` the note through the app status line if it is not spoken.

## 11. Passed, briefly

N1 in 14 orders including running, reload, keyboard; A1 hidden in two-ship and box and inert; 4312/2134 #2 side mirrors exactly (40 runs); N2 disabled and described for Shackle and Cross; N4 perfect turns ON SPACING, real errors still flagged at 200 ft, core standards untouched, 2,846 tests pass; N6, N7, N8, N9 fixed; 132 engine runs identical to #189 (0 wrong); 3,168 sweep runs 0 off; shackle, hook, cross, Delayed 45 <= 45, box order, LAB 70/3 all as before; 44 screen runs equal the engine; axe 0; Escape; 1280/1366/1440 layout clean; turn-sim unit 200, e2e 41 and 123 (3x) with no flake; live site is the same build.

## 12. Logged calls checked against the SMM (Turn Sim rows, D248 to D252)

| D | Call | Against the SMM | Verdict |
|---|---|---|---|
| D248 | Four-ship formation moves Shackle/Cross to Delayed 90 with a note | D146 (Patrick): two-ship only; para 112b lists the shackle for the box | Agrees with D146; the SMM difference is the known D169 |
| D249 | #2's side hidden in the two-ship | Figs show either side | No contradiction; R1 |
| D250 | Shackle Direction greyed | Para 61 has no direction | Agrees |
| D251 | Turn Sim-only 1 degree / 1 percent | Sweep 0 to 10 degrees aft, 4,000 to 6,000 ft (16.18) | Slightly looser than the SMM by design; R2 |
| D252 | Delayed 45 check version default for 4-ship | Figs 16.17, 16.31, 16.34 | Not in this commit; N3 unchanged here |

## Audit (auditor agent, read-only). Its corrections override the text above.
| Finding | Verdict | Corrected facts |
|---|---|---|
| F3 Medium: In-place 90 / Check end flags | Corrected, still Medium | NOT new: the #189 merge (469f886) shows the same labels. The flag is amber, not red. SMM ch.16 para 59 ends in-place in trail, so the flag is wrong there. For the Check turn, para 58 gives no end position, so that half is the owner's call. No D entry covers end-of-turn judging. Cause: formationRows (readouts.js:120-134) judges against the line-abreast standard via judgedBy (:78-79), whatever the turn. Missing test: a default In-place 90 ends with no TIGHT/FORE. |
| A1 / D249 | Confirmed | D249 (log line 109) hides "#2's side" in the two-ship on purpose. The box was already hidden before #215. |
| N4 tolerance | Confirmed, made exact | FORE is hidden while the sweep is under 1° (interval × tan 1°): 104 ft at 6,000 ft passes and 106 flags. Unit tests pin only +59 and +130, so the edge isn't pinned. Missing test: 104/106 ft. |
| F1, F2, F4 | Confirmed, Low | F4 is latent (memoryStore), and the engine still flies Delayed 90. |
| F5 | Corrected, Low | New for Shackle only; the Cross was already greyed before #215. |
