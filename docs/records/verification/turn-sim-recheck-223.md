# Turn Sim recheck of #223 (Delayed 45 with a check turn), commit adf165c (2026-09-30)

Independent check, no repo file touched. Worktree `scratchpad/wt-turnsim2` at adf165c, `npm ci`, `npm run build`, `vite preview` on port 4309, Chromium 1440x900 (1280x720 and 1366x768 for layout). Live site https://lizardhands-commits.github.io/Dads-debreif/#/turn-sim also driven.
Authorities: SMM ch.16 paras 55-58, 111-112, 118 and part 8 paras 16-20 (LAB turns), Figs 16.16, 16.17, 16.31, 16.33, 16.34 (images in `manuals/images/`), `decisions-for-review.md` (D146, D248-D257, D281, D282). Cited by number only.
Pictures: `/mnt/project-files/verification/shots/turn-sim-223/` (copy in `scratchpad/findings/turn-sim/shots-223/`).
Scripts (reusable): `scratchpad/ts223/` (`an.mjs` leg-by-leg analysis, `sweep45.mjs`, `sweepbox.mjs`, `indep.mjs` my own two-body model, `side45.mjs`, `frames.mjs`, `u5.mjs`, `u6.mjs`, `layout45.mjs`, `live.mjs`). Positions are R feet to the right of Lead and F feet ahead, on Lead's final heading.

## 1. Verdict

N3 from the #189 recheck is **closed for the geometry and the sequence**. The 4312, 2134 and the box now fly the SMM's check-turn Delayed 45 (Figs 16.34 and 16.31) by default, both directions, both #2 sides, and it matches the figures in who checks, which way, by how much, in what order and where the aircraft end. Two-ship Delayed 45 is unchanged. D146 holds. 0 wrong runs in 2,430 sweep runs and in the turn matrix. What is left is one setting that breaks the check version (Turn degrees other than 45), one control that silently does nothing (With check turn plus Clock), and review notes on the default ending TIGHT and on D281.

Counts: High 0, Medium 3 (C1, C2, C3), Low 6 (C4 to C9). PILOT JUDGEMENT: 2 (PJ-1, PJ-2), with recommendations. Logged calls flagged: D257 and D281 (partial contradictions, section 5).

Top five:
1. C1 (Medium) Delayed 45 with any Turn degrees other than 45 in a 4-ship or the box still flies the fixed 5/7 o'clock cue and says "Delayed 45 with a 12.5° check": 30 degrees ends 1,804 ft apart, 70 degrees ends 9,283 ft apart and 3,936 ft aft, 90 degrees 18,479 ft apart. The plain 45 adapts to the angle (ends about 5,900 ft at every angle).
2. C2 (Medium) Delayed 45 style "With check turn" plus Timing "Clock position cue" silently flies the plain 45 (123.7 s in 4312); the setting and its two boxes do nothing and no line says so.
3. C3 (Medium, PJ-1) The default 4312, 2134 and box Delayed 45 ends with red TIGHT flags on every wingman (3,680 to 3,942 ft against 4,000 to 6,000) and FORE flags of 89 to 193 ft. Correct for the SMM's 5 o'clock cue, but nothing on the screen says it is the figure's "fix it on roll-out".
4. C4 (Low) The "about 3,900 ft" in the Roll-in hint is only true at 6,000 ft spacing (2,860 ft at 4,000).
5. D281 review note: the box rear delay is 36.7 s (right) and 1.0 s (left), against the SMM's 10-15 s (para 112a, Fig 16.31). Flagged on screen; I recommend keeping it and letting the SMM delay be flown as an option.

## 2. Geometry and sequence against the figures

Method: the engine flown through `createRun` with a leg-by-leg reader (`an.mjs`), checked against my own independent kinematics (`indep.mjs`, no repo code: 220 KTAS, 70.5 degrees / 3 G, 14.03 deg/s), the screen driven with Playwright, and the plan views set beside Figs 16.17, 16.31 and 16.34.

| Question | Result | Evidence |
|---|---|---|
| Which elements check-turn | Only the aircraft that is not first in its element. The outside aircraft (the one on the side opposite the turn) flies one plain 45. 4312 right: #2 plain, #1, #3, #4 check. 4312 left: #4 plain, #3, #1, #2 check. 2134 mirrors it. Two-ship with check: Lead plain and #2 checks (turn right, Fig 16.17 left panel); #2 plain and Lead checks (turn left, right panel). Box: front pair as above, rear pair the same again (outside aircraft of the pair plain, the other checks), which is Fig 16.31 | `an.mjs` legs; `side-4312-d45-vs-fig16-34.png`, `side-2ship-check-vs-fig16-17.png`, `side-box-d45-vs-fig16-31.png` |
| Which way, how much | Every checker turns 12.5 degrees toward the first turner (left in a right turn, right in a left turn), setting 10-15 (the box refuses 5 and 20, message "Enter a number from 10 to 15°"), then turns the other way 45 plus the check (57.5 degrees), net 45. The first turner turns 45 once | 1,458 line-abreast runs, 0 wrong |
| Order and timing | All checkers start their check together when the first turner has established its 45 (3.3 s). Second legs go inside-out: 4312 right #2 at 0.1 s, #1 at 25.9, #3 at 51.2, #4 at 76.5; each turns when the aircraft before it is at 5 o'clock (right) or 7 o'clock (left): measured 4.98 / 4.97 / 4.97 and 7.02 / 7.03 / 7.03. Fig 16.17 says 7 or 5 o'clock; Fig 16.34 draws check legs that grow with each aircraft (my scale from the figure, 22 s, 46 s, 61 s; sim 22.6, 47.9, 73.2) | `an.mjs`; `a1.mjs` |
| No aircraft completes 90 | Largest single leg 57.5 degrees; nobody ever turns more than 45 net | all runs |
| Independent check of the geometry | My own two-body model agrees with the engine to 28 ft (R) and 15 ft (F) over spacing 4,000/5,000/6,000, speed 180/220/250, G 2.5/3/4, check 10/12.5/15, both directions, three start headings. At 6,000 ft: mine R3,941 F+100, engine R3,924 F+89 | `sweep45.mjs`, `indep.mjs` |
| Final positions, 4312 (defaults) | Line abreast, sides swapped, order reversed. Right turn: #2 R+3,924 F-89, #3 R-3,680 F-104, #4 R-7,361 F-208. Left turn: #2 R+3,680 F-104, #3 R-3,680 F+104, #4 R-7,604 F+193. Sweep under 2 degrees for every pair; run 90.5 s against 129 s for the plain chain (0, 39, 77, 116 s) | `ui-4312-R-end.png`, `ui-4312-L-end.png` |
| Final positions, box | Front pair 3,924 ft apart, rear pair 3,942 ft apart aft of it (#3 R-2,578 F-6,825, #4 R-6,520 F-6,926 in a right turn; #3 R-2,548 F-7,192, #4 R-6,490 F-7,091 in a left turn). #3 stays between Lead and #2, #4 stays outside #2. Compare Fig 16.31 as drawn, 70 percent front spacing, #3 about a quarter across, #4 about 1,200 ft outside #2 | `side-box-d45-vs-fig16-31.png`; 972 box runs (spacing 4,000/5,000/6,000, box aft 6,000/7,000/8,000, speed, G, check, heading, both directions), 0 wrong |
| Box orientation | The box has #2 on Lead's right, so the box LEFT turn is Fig 16.31 mirrored (#2 plain first, Lead checks); the box RIGHT turn is the same figure turning toward #2 (Lead plain first, #2 checks). Both follow "the outside aircraft turns first" | pictures above |
| Separations | Nearest pair 1,555 ft (4312), 1,047 ft over the whole box sweep, so no "Close pass" (D282) fires at the defaults, and none is under 300 ft | sweeps |
| Tracks cross | Yes, as the figures (Fig 16.34 notes that an altitude stack is needed); see C7 | pictures |
| Frame by frame | Start, first turner turning, checks, each 45 in turn, roll-out: 4312 at t = 2, 8, 28, 52, 78, 89 s; box left at 2, 8, 28, 45, 72; two-ship with check at 2, 8, 28, 45, 70 | `frames-4312-R.png`, `frames-box-L.png`, `frames-2ship-check-R.png` (the app camera follows Lead, so the frames are rotated against the figures) |

Plain style unchanged: with "Delayed 45 style" = Plain, 24 runs (4 formations, both directions, three timings) are identical to the #189 numbers (0 differ). Clock timing still flies the plain 45 in every formation (by design). Two-ship Delayed 45 at the defaults is identical to before in all three timings (5,905 ft apart, F+39 with Time delay).

## 3. Other checks

| Check | Result |
|---|---|
| Control wording says what is flown | Formation card reads "Delayed 45 with a 12.5° check (SMM Fig 16.34)" (16.31 in the box, 16.17 in the two-ship with the check); it disappears for Plain, Clock and the default two-ship. Base delay is greyed with "Base delay and Auto step do not apply: the check turn times itself off the aircraft before it." and the Auto line says the same; in the box #4 timing and Rear element delay are greyed with the reason. Exceptions C1, C2, C6 |
| D146 | Shackle and Cross turn enabled only in the two-ship, disabled in 4312, 2134 and the box. Two-ship Shackle then 4312 switches the Turn menu to Delayed 90 with "Shackle and Cross turn are two-ship only, so this is now a Delayed 90." (D248). Not a bug |
| Full turn matrix | 132 runs (4 formations, 7 turns, both directions, three timings). 120 are unchanged from #189 and score 0 wrong on the same rules (94 clean, 22 with the known notes). The 12 that changed (4312, 2134, box Delayed 45 with Time delay or Auto timing) are covered by the sweeps above: 0 wrong. Four box + Clock runs exceed my box-slot tolerance by the same amounts as at #189 (clock cue PJ-1 in the old report), unchanged |
| Solve option | "Roll in to hold the set spacing" on: every wingman ends at 6,000 ft (6,007 / 5,998 / 5,996), aft of the first turner (two-ship 1,231, #3 1,376, #4 2,751 in 4312), run 112 s in 4312. Matches D257 |
| Unit and golden | `node --test "tests/unit/turn-sim/*.test.js" "tests/golden/turn-sim-*.test.js"`: 227 pass, 0 fail. Whole `npm test`: 2,892 tests, 2,884 pass, 0 fail, 8 todo |
| e2e | `PW_PORT=4309 npx playwright test tests/e2e/turn-sim.spec.js --project=chromium`: 46 passed |
| axe (WCAG 2.0 A and AA, plus best-practice) | 0 violations with all panels open at 1366, box with the greyed rear fields, 4312 Delayed 45 running |
| Layout at 1280x720, 1366x768 | Three columns (setup 288, stage 670 or 756, formation 272), no column overlaps, no control covered, no sideways scroll. At 1280 the Layers button drops to a second toolbar row (as before). Picture labels at the start of a 4-ship run overlap at 1280 (known TS-12, not changed by this PR) |
| Validation | Check turn refuses 5 and 20 (aria-invalid, message) and accepts 12 |
| Console | 0 errors, 0 warnings in every flow |
| Live site | Same build behaviour as the branch: 4312 Delayed 45 shows the check note, ends 90.5 s with the same three TIGHT lines and +89 ft FORE (`live-4312-d45-end.png`) |

## 4. Findings

Format: ID, severity, where, steps, expected, actual, picture, known?, missing test.

**C1 (Medium, new) The check version only works near 45 degrees, but any Turn degrees uses it.**
Where: Turn Sim settings, Turn degrees, with Turn = Delayed 45 in the two-ship (style With check), 4312, 2134 or the box (Auto).
Steps: Two-ship, Turn Delayed 45, settings, Delayed 45 style With check turn, Turn degrees 70, Play. Or 4312 with Turn degrees 30 (no style change needed).
Expected: SMM part 8 para 16 (turns of 30 to 70 degrees use a modified delayed 45) and para 17 (less than 45: the second aircraft turns later; more than 45: earlier) say the geometry moves with the angle. The plain Delayed 45 already does this and rolls out about 5,900 ft apart at every angle.
Actual (engine and screen agree): the check plan uses the fixed 5 (right) or 7 (left) o'clock cue at every angle, so two-ship #2 ends 765 ft apart at 20 degrees, 1,804 ft at 30, 3,924 at 45, 6,799 ft apart and 1,726 ft aft at 60, 9,283 ft apart and 3,936 ft aft at 70, 18,479 ft apart and 16,352 ft aft at 90. 4312 at 30 degrees ends #2 1,804, #3 1,702, #4 3,405 ft from Lead. The screen still says "Delayed 45 with a 12.5° check (SMM Fig 16.17)" and at 70 degrees flags "WIDE / AFT ... 9,283 ft" and "Mutual support lost". Because Auto now makes the check the 4-ship default, this is a regression for 4312, 2134 and the box at 30 to 70 degrees, which the plain chain handled.
Picture: `f-check-turndeg70-end.png`. Known: no. The spec does not say the check is limited to 45.
Recommendation: fly the plain 45 (which adapts) when Turn degrees is outside about 40 to 50, and say so in the note, or solve the roll-in cue from the angle. Either way the note must not say "Delayed 45 with a check" for a run that is not one.
Missing test: `tests/unit/turn-sim/delayed-45-check.test.js`: "with the check, turnDeg 30, 60 and 70 in 4312 and the two-ship end within 6,000 ft plus or minus 25 percent line abreast, or fall back to the plain turn and say so (state.delayed45CheckFlown false)". No test in that file sets a turnDeg other than 45 or 90 (lines 352, 361).

**C2 (Medium, new) Delayed 45 style "With check turn" does nothing under the Clock cue, and no line says so.**
Where: Setup, Timing = Clock position cue; Turn Sim settings, Delayed 45.
Steps: 4312, Turn Delayed 45, settings, Delayed 45 style With check turn, Timing Clock position cue, Play.
Expected: a control set to With check turn either flies it or says why not (R22, the wording rule "the control says what is flown"). Spec item 6 says "The clock cue always flies the plain 45" but that sentence is not on the screen.
Actual: the plain chain is flown (123.7 s, "#1 watching #2 for 4:30"), the Formation card has no check line, the Delayed 45 group still shows Check turn and Roll in boxes at their values, and nothing tells the pilot they are ignored. Same for the box under Clock.
Picture: `f-with-check-plus-clock.png`. Known: the engine test at `delayed-45-check.test.js:104` pins the fallback; nothing pins a message.
Recommendation: one hint line under Delayed 45 style while Timing is Clock: "The clock cue flies the plain 45; the check turn is not used." and grey the two boxes.
Missing test: `tests/e2e/turn-sim.spec.js` (next to the check-note test at line 676): "with Timing Clock and style With check turn the settings say the plain 45 is flown and the Check turn box is disabled".

**C3 (Medium, PILOT JUDGEMENT PJ-1) The default 4-ship and box Delayed 45 ends flagged red.**
Where: Formation card at the end of the default run (Auto style).
Steps: 4312 (or 2134, or the box), Delayed 45, Play to the end.
Expected: SMM Fig 16.17 and Fig 16.34 (and 16.31) carry the note that the wingmen must quickly fix any spacing or sweep errors on roll-out, so an unfixed roll-out is expected to be off; the SMM band is 4,000 to 6,000 ft, sweep 0 to 10 degrees (para 49, 16.18).
Actual: 4312 right "#2 TIGHT / FORE interval 3,924 ft, fore/aft +89 ft; #3 TIGHT interval 3,680 ft; #4 TIGHT interval 3,680 ft"; 4312 left "#3 TIGHT / FORE ... +104; #4 TIGHT / FORE 3,924 ft, +193"; box "#2 TIGHT 3,924, #4 TIGHT 3,942" (+89 and +101 FORE in a left turn). Two-ship with the check "#2 TIGHT interval 3,924 ft". Every wingman of the default check run is flagged, where the plain runs end ON SPACING.
Why: the cue is very sensitive. My model: cue 4:30 gives 6,570 ft apart and 1,542 ft fore; 4:45 gives 4,861 and +605 (7 degrees fore); 5:00 gives 3,941 and +100; 5:06 gives 3,676 and -45. No cue lands inside both 4,000 ft and 0-10 degrees aft, so the figure's own note is right: some error is left to fix. End spacing is about 0.54 of the set spacing plus 700 ft (2,860 ft at 4,000, 5,020 at 8,000).
Picture: `d45-4312-right-end.png`, `ui-4312-L-end.png`, `ui-box-L-end.png`.
Known: partly. D257 logs the 3,900 ft roll-out and the option; the red flags are not mentioned.
PILOT JUDGEMENT: is a roll-out 2,000 ft tighter than the set spacing what Dad sees when he flies the 5 o'clock cue, or does he cue later (nearer 4:45)? My recommendation: keep the exact SMM cue (5 and 7), and add to the check note "Wingmen fix spacing and sweep on the roll-out (SMM Fig 16.34 note)", so the amber TIGHT reads as the figure's point and not a fault of the sim. Do not move the cue without Dad.
Missing test: `tests/e2e/turn-sim.spec.js`: "the check note says the roll-out is to be fixed" (once added); no test pins that the default run ends flagged, so a later change to the cue would pass silently: `tests/unit/turn-sim/delayed-45-check.test.js` line 137 pins "about 3,700 ft", which does cover the number.

**C4 (Low, new) The Roll-in hint quotes a number that only holds at the defaults.**
Where: Turn Sim settings, Delayed 45, "Roll in to hold the set spacing": "Off flies the figure's cue: abreast, about 3,900 ft apart."
Actual: 3,924 ft at 6,000 spacing, 220 KTAS, 3 G; 2,849 ft at 4,000, 3,394 at 5,000, 4,999 at 8,000, 3,684 at 180 kt, 4,364 at 2 G (engine and my model agree).
Expected: the hint should not print a number that changes with the settings ("about two thirds of the set spacing" is true).
Picture: `u1-4312-d45-settings.png`. Known: no.
Missing test: `tests/unit/turn-sim/fields.test.js`: "CHECK_SOLVE hint holds at Spacing 4,000" or make the hint number-free.

**C5 (Low, new) The Delayed 45 settings group shows boxes that do nothing.**
Where: Turn Sim settings, Delayed 45, when style is Plain, or Auto in the two-ship.
Actual: Check turn and Roll in to hold the set spacing stay enabled with no effect (R22 says no dead box). The hint under the style says the two-ship is plain but the boxes are still live.
Recommendation: grey them with the reason when the check is not flown (`checkFlown` is already known to the layout).
Missing test: `tests/e2e/turn-sim.spec.js` line 746 test (the settings sit closed and show only when they apply): add "Check turn is disabled while the check is not flown".

**C6 (Low, wording) Two things called "Check turn".**
The Turn menu's "Check turn" is the 30 degree in-place check (SMM para 58, Turn degrees 5 to 30); the new setting "Check turn" is the 10-15 degree check inside the Delayed 45. Both appear on one screen. Recommendation: rename the setting "Check before the 45". Missing test: none practical.

**C7 (Low, new) SMM's altitude-stack note is not shown.**
Fig 16.34 (right) says an altitude stack is required to de-conflict; the check tracks cross (every pair in 4312). The sim is flat and its nearest pair is 1,555 ft, so D282's "Close pass" never fires. Expected: the SMM note in the 4-ship check note, or a "tracks cross" line (the shackle and box hook already say "Crossing: 300 ft vertical needed"). Picture: `ui-4312-R-end.png`. Missing test: `tests/unit/turn-sim/readouts.test.js`: "checkTurnNote for a four-ship mentions the altitude stack".

**C8 (Low, new, D282) The default box Delayed 90 right now ends with "Close pass: 954 ft, #1 and #4: altitude separation needed" next to "Min sep 5,941 ft".**
The two numbers read as a contradiction (Min sep is the end state, the pass is mid-run). The 1,000 ft threshold is ours, logged. No SMM conflict (para 111 makes the trailing element responsible). Recommendation: label the end line "Min sep at the end". Picture: `d90-box-right-end.png`. Missing test: `tests/e2e/turn-sim.spec.js` line 838 area: "the Close pass line and Min sep say which moment they are".

**C9 (Low, unchanged) Box at Box aft 6,000 ft: the solver clamps the rear shift at 0 s and misses the slots by up to 966 ft.** Left turn, aft 6,000: shift 0.0 s, #3 and #4 miss their targets by 370 to 966 ft; at 7,000 the shift is 0.5 to 1.7 s (misses 340 to 720). 6,000 is the SMM's own lower bound (para 109 range, as in the readout "7000 ±1000"). Missing test: `tests/unit/turn-sim/delayed-45-check.test.js` line 170: "box slots within 500 ft at aft 6,000, 7,000, 8,000".

Not findings (checked, fine): the note and figure numbers in the readout (16.17, 16.31, 16.34) match the formation; Base delay greyed while Timing is Time delay or Auto; Auto timing flies the same check; 2134 and the #2's side mirror produce the mirror numbers.

## 5. Logged calls checked against the SMM

| D | Call | Against the SMM | Verdict |
|---|---|---|---|
| D146 | Shackle and Cross two-ship only | Para 112b lists the shackle for the box (already PJ-5 in the #189 report) | Holds and is not a bug; unchanged |
| D248 | Formation change falls back to Delayed 90 with a note | none | Works (checked) |
| D252 | 4-ship and box Delayed 45 default to the check; two-ship stays plain | Paras 55-56 make the check optional for two aircraft (Fig 16.17), and Fig 16.34 / 16.31 draw it for four | Agrees |
| D257 | Check rolls in on the figure's 5 or 7 o'clock cue and ends abreast about 3,900 ft apart; solving spacing is an option | The cue agrees with Fig 16.17 (measured 4.98 and 7.02). The end spacing is a consequence of that cue; the figures are drawn schematically (my measure: box about 70 percent of the start spacing, spread 4 about 90, sim 62 to 65 percent). The figure's 4.4 marker on Fig 16.17 shows the wingman aft of abreast, which is nearer the solve-on option | No contradiction of the SMM; the figures do not fix the spacing. See C3 and PJ-1. **Review note:** the default is defensible, the flags need the "fix on roll-out" line |
| D281 | Box check: rear delay solved, 36.7 s right, 1.0 s left, not the SMM's 10-15 s | Para 112a and Fig 16.31: #3 and #4 delay their turn by 10-15 s. Numbers contradict; the shape does not. Measured: a fixed 12.5 s in the left turn (the figure's orientation) puts #3 behind Lead (R+454) and #4 behind #2 (R-3,470), which is close to the figure; the solved 1.0 s puts #3 at R-2,548 and #4 at R-6,490, also about 1,400 ft off the drawn spots. In the right turn (toward #2) a fixed 12.5 s puts #3 3,789 ft on the far side of Lead, so the box does collapse | **Review note, partial contradiction of the number.** It is flagged on screen ("outside the SMM 10-15 s; solved so the box keeps its shape"). Recommendation: keep D281 as the default (it is right for the turn the SMM does not draw) but let "Rear element delay (SMM)" apply to the check version so a pilot can fly the SMM's 10-15 s; the field is now greyed. Ask Dad which he flies (PJ-2) |
| D282 | "Close pass" caution at 300-1,000 ft | Para 111 (trailing element responsible) | No conflict; threshold is ours |

## 6. Pilot judgement, with recommendations

- **PJ-1 Roll-out spacing at the 5 and 7 o'clock cue (C3).** Question: does Dad cue the second aircraft later than 5 o'clock so the roll-out is inside 4,000 to 6,000 ft? Recommendation: keep the SMM cue, add the "fix on roll-out" line, leave the cue for Dad.
- **PJ-2 Box rear delay in the check version (D281).** Question: in the box Delayed 45 does Dad fly 10-15 s after the front element turns, or hold the box shape? Recommendation: keep the solved shift by default, offer the SMM 10-15 s as the "Rear element delay (SMM)" choice.
- **PJ-3 Turn degrees other than 45 (C1).** Question: does Dad use a modified Delayed 45 with the check at 30 or 60 degrees? Recommendation: plain 45 for those angles until he says.

## 7. What passed (short)

Both directions and both #2 sides, both formations (4312, 2134, box, two-ship with the check), 1,458 plus 972 sweep runs at 0 wrong; independent model to 28 ft; second legs at the SMM clock cue; nobody turns 90; plain style and two-ship unchanged; D146 and D248; Shackle and Cross turn unchanged; unit 227/227, whole suite 2,884 pass, e2e 46 pass; axe 0; 1280 and 1366 layout clean; console clean; live site matches.

## Audit (auditor agent, read-only). Its corrections override the text above.
| Finding | Verdict | Corrected facts |
|---|---|---|
| Geometry and sequence vs Figs 16.17/16.31/16.34 | Confirmed | Numbers reproduced exactly. Order is inside-out, the 5/7 o'clock cue is on the right side, and all end on the 45. N3 is closed. |
| C1 check flown at any Turn degrees | Confirmed Medium | Two-ship: 765 ft at 20°, 1,804 at 30, 9,283/-3,936 aft at 70, 18,479/-16,352 at 90. plan.js fixes cueHours at 5/7 whatever goalRad is (SMM part 8 paras 16-17 move the cue with the angle). Auto is the 4-ship default, so this is a regression. Missing test: check turn at 30/60/70°. |
| C2 check + Clock silently flies the plain version | Lowered to Low | This is spec item 6 and is pinned by tests. Only the on-screen signal is missing, so group it with C5. |
| C3 default 4-ship/box end flagged | Corrected: amber, Low + pilot judgement | Not the #215 F3 class: the finish IS line abreast, so the flags are true readings (76-320 ft under 4,000; FORE 1.3-1.6°). A 4:51 cue ends ON SPACING for the two-ship and for #3/#4 of 4312. Only FORE on whoever turned before Lead is unavoidable (para 116). Roll-in also ends flagged; Spacing 8,000 ends clean. The cue (D257) is for Dad. |
| D281 box rear delay | Numbers confirmed; reasoning corrected | 36.7 s right / 1.0 s left at Box aft 7,000. A fixed 12.5 s collapses the right turn AND loses the offset in the left turn (#3 outside Lead, 8,431 ft aft). The solved shift is closer to the figure. Even in the drawn direction the solver wants 1.0 s, because of the sim's box target (OFFSET_BOX_OUTSIDE_FT 3,000, aft 7,000). Offer 10-15 s as a choice for Dad. |
| C4-C8 | Confirmed Low | C5: checkTurnDeg and checkSolveSpacing are never disabled (R22). |
| C9 box aft 6,000 clamp | Confirmed Low, NEW in #223 | Math.max(0,…) in boxCheckShiftSec is new; #3/#4 miss by about 440 ft and 950 ft. |
