# Turn Sim recheck of #189, main 0df9581 (2026-09-30)

Independent check. No repo file touched. Worktree `scratchpad/wt-turnsim`, built with `npm ci && npm run build`, served on port 4301, Chromium 1440x900 unless stated.
Sources: the engine flown through `createRun` (132 default runs plus two sweeps of 1,728 and 1,440 runs), the screen driven with Playwright, SMM ch.16 figures 16.15 to 16.21 and 16.30 to 16.34 (images in `/mnt/project-files/manuals/images/`, cited by number only), SMM ch.16 paras 52 to 64, 112 and 118, `decisions-for-review.md` (D146 to D214).
Positions are `R` feet to the right of Lead and `F` feet ahead of Lead's 3/9 line, measured on Lead's final heading. "Bank/G" is what the engine reports while an aircraft turns.
Scripts (reusable): `scratchpad/ts2/fly.mjs` (one run, full metrics), `verdict.mjs` (rules and counts), `sweep.mjs`, `sweep4.mjs`, `noise.mjs`, `plot.mjs`, `side.mjs`, `matrix.mjs` (browser). Pictures: `scratchpad//mnt/project-files/verification/shots/turn-sim-2/`.
Repo tests at this commit: `node --test tests/unit/turn-sim tests/golden/turn-sim-*` gives 196 pass, 0 fail.

## 1. Verdict on the pilot's complaint

| Part of the complaint | Now | Evidence |
|---|---|---|
| "The formation doesn't behave as per the SMM depending on what setting it's on" | **Fixed for every turn, formation and timing except three things that are not built or that are a documented choice** (listed below) | 132 engine runs, 0 WRONG; 3,168 more runs over spacing, speed, G, start heading, #2 side: every 2-ship and 4-ship delayed turn (Auto timing), hook, shackle, cross and in-place ends where the SMM puts it, and nothing changes with the start heading |
| "The shackle doesn't cross" | **Fixed (two-ship).** Both turn 45 toward each other, cross at the mid-point (8 ft apart in plan view, so the sim asks for 300 ft vertical), turn back, end on the start heading with the sides swapped and 6,039 ft apart | `/mnt/project-files/verification/shots/turn-sim-2/side-shackle.png`, `tracks-2ship-others.png`. Direction Left and Right fly the identical shackle (N2) |
| "The manoeuvres don't do what the button says" | **Fixed on every button when the button is used in its own formation.** One way is left to get a manoeuvre that is not what the menu says (N1, High): pick Shackle or Cross in the two-ship, then switch to 4312, 2134 or the box. Two smaller ones: the 4-ship Delayed 45 (N3) is the slow figure, and the Shackle's Direction box does nothing (N2) | Section 4 |

Counts (new findings this pass): High 1 (N1), Medium 4 (N2, N3, N4, N5), Low 6 (N6 to N11). Previously reported TS-01 to TS-11: TS-01, 02, 03, 04, 05 (rear delay, clock/auto stall, warning), 06, 07, 08, 09, 10, 11 are fixed; TS-12 and TS-13 (label overlap, truncated select text) are not.

Top five:
1. N1 (High) Switching formation with Shackle or Cross selected leaves the menu on the disabled turn and flies Delayed 90 while the screen still says Cross turn, 180 degrees and "Lead always turns toward #2".
2. N4 (Medium) The default run of a perfect turn ends with red FORE or WIDE flags for 25 to 99 ft (Delayed 90 FORE +59, Shackle WIDE 6,039, Cross WIDE 6,025).
3. N3 (Medium) 4312 and 2134 Delayed 45 start #4 at 116 s (run 129 s); the SMM draws the 10-15 degree check-turn version (Fig 16.34), which is not built (D148 is the box only).
4. N2 (Medium) Shackle Direction Left and Right fly identical shackles but the box is not greyed (the cross turn's is).
5. N5 (Medium) Box Delayed 45 rear element (#3) starts 0.5 s before #2; the hook rear delay is 18.9 s; both outside the SMM 10-15 s and flagged on screen (D184).

## 2. Every button, formation and direction, flown through the engine

132 runs = 4 formations x 7 turns x 2 directions x 3 timings, minus the Shackle and Cross in the three 4-ship formations (greyed, D146). Screen defaults: 220 KTAS, 3 G, 6,000 ft, start heading 000, Base delay 16 s, box aft 7,000 ft, box stagger 0.

Rules for MATCHES: turn angle per aircraft equals the button's; 70 degrees / 3 G in every LAB turn (60/2 for the first 90 of the cross turn, Fig 16.21); outside aircraft turns first in the delayed turns and each next one starts at about the SMM clock position; ends where the SMM figure ends (sides swapped, abreast within the 0-10 degree sweep, spacing kept); no aircraft completes 90 degrees in a Delayed 45.

**Totals: 94 MATCHES clean, 20 MATCHES with a note (below), 18 PARTIAL (not built / slow, N3 and N5), 0 WRONG.**

Notes on the 20: Delayed 90 with the Clock cue (8 runs: 2-ship, 4312, 2134, box, both directions): the cue is the SMM's 7 (right) or 5 (left) o'clock, and at 6,000 ft it rolls out 15 degrees of sweep (2-ship R-4697 F+1303; #4 of a 4312 F+2606) against the SMM's 0-10 degrees (PJ-1). The cross turn (6 runs): second half flown at 1.57 G / 51 degrees of bank to roll out 6,000 ft apart (D214), not the SMM's 3 G / 70 (which needs 4,000 ft spacing). Box hook (6 runs): rear delay 18.9 s, outside the SMM 10-15 s (D184, N5). The box Delayed 45 runs (all three timings) are in the PARTIAL group.

Table: Time-delay timing, Right and Left. Start = the second per aircraft, with its first turn direction; Bank/G in the turn; X = tracks cross (dt = seconds between the two aircraft at the crossing point); Closest = smallest pair distance in the run.

| Formation | Turn | Dir | Who turns, when (s) | Max heading change | Bank/G | Tracks cross | Closest (ft) | Rollout vs Lead | SMM | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 2-ship | Delayed 90 | R | #1 0 (R), #2 16 (R); #2 sees #1 at 6.36 o'clock | 90 | 71/3 | 1-2 (14.4 s) | 3,783 | #2 R-5941 F+59 | Fig 16.15, paras 52-54 | MATCHES |
| 2-ship | Delayed 90 | L | #2 0, #1 16 (L); #1 sees #2 at 5.64 | 90 | 71/3 | 1-2 | 3,783 | #2 R-5941 F-59 | Fig 16.15 | MATCHES |
| 2-ship | Delayed 45 | R | #1 0, #2 39; #2 sees #1 at 4.53 (after the tail) | 45 | 71/3 | 1-2 (6.5 s) | 2,236 | #2 R-5905 F+39 | Fig 16.16, paras 56-57 | MATCHES |
| 2-ship | Delayed 45 | L | #2 0, #1 39; 7.47 | 45 | 71/3 | 1-2 | 2,236 | #2 R-5905 F-39 | Fig 16.16 | MATCHES |
| 2-ship | Hook | R / L | both at 0.1 | 180 | 71/3 | no | 6,000 | #2 R-6000 F0 | Fig 16.19, para 60 | MATCHES |
| 2-ship | Shackle | R = L | both at 0.1, #1 right and #2 left toward each other, reverse turn from about 23 s | 45 out, 45 back, net 0 | 71/3 | yes, 1-2 at 12.9 s, dt 0 s | 8 | #2 R-6039 F0, on the start heading | Fig 16.20, paras 61-62 | MATCHES |
| 2-ship | Cross | R = L | both at 0.1, toward each other (Lead right, #2 left) | 180 | 60/2 to 90, then 51/1.57 | yes, 1-2 at 11.9 s, dt 0 s | 9 | #2 R+6025 F0 (heading reciprocal) | Fig 16.21, para 64 | MATCHES (note 2nd half G) |
| 2-ship | In-place 90 | R / L | both at 0.1 | 90 | 71/3 | no (R), passes behind (L) | 6,000 | #2 R0 F+6000 / -6000 | Fig 16.18, para 59 | MATCHES |
| 2-ship | Check 30 | R / L | both at 0.1 | 30 | 71/3 | no | 6,000 | #2 R5196 F+3000 / -3000 | Fig 16.18, para 58 | MATCHES |
| 4312 | Delayed 90 | R | #2 0, #1 16, #3 32, #4 48 (staircase, each at 6.36 o'clock) | 90 | 71/3 | all pairs | 3,783 | #2 R+5941 F-59, #3 R-5941 F+59, #4 R-11901 F+99 | Fig 16.34 (left), Fig 16.33 (right) | MATCHES |
| 4312 | Delayed 90 | L | #4 0, #3 16, #1 32, #2 48 | 90 | 71/3 | all | 3,783 | #2 R+5960 F+40, #3 R-5941 F-59, #4 R-11882 F-118 | Fig 16.34 (left) | MATCHES |
| 4312 | Delayed 45 | R | #2 0, #1 39, #3 77, #4 116 | 45 | 71/3 | all | 2,236 | #2 R+5905 F-39, #3 R-5905 F+39, #4 R-11798 F+84 | Fig 16.34 (right) draws it with 10-15 degree checks | PARTIAL (N3) |
| 4312 | Delayed 45 | L | #4 0, #3 39, #1 77, #2 116 | 45 | 71/3 | all | 2,236 | mirror | same | PARTIAL (N3) |
| 4312 | Hook | R / L | all four at 0.1 | 180 | 71/3 | no | 6,000 | #2 R+6000, #3 R-6000, #4 R-12000, F0 | Fig 16.36, para 118 | MATCHES |
| 4312 | In-place 90 | R / L | all at 0.1 | 90 | 71/3 | L only | 6,000 | trail 6,000 / 6,000 / 12,000 | para 118 | MATCHES |
| 4312 | Check 30 | R / L | all at 0.1 | 30 | 71/3 | no | 6,000 | rotated 30 degrees, R-5196 F-3000 ... | para 118 | MATCHES |
| 2134 | all six above | R / L | mirror of 4312 in every number (R signs flip, order flips) | as 4312 | 71/3 | | | e.g. Delayed 90 R: #4 first, #3 16, #1 32, #2 48; #2 R-5960 F+40, #3 R+5941 F-59, #4 R+11882 F-118 | same | MATCHES (Delayed 45: PARTIAL, N3) |
| Box | Delayed 90 | R | #1 0, #2 16, #3 27, #4 43 (#3 10.9 s after #2, #4 16.1 s after #3) | 90 | 71/3 | yes | 954 (1-4) | #2 R-5941 F+59, #3 R-2988 F-6988, #4 R-8948 F-6948 (box keeps its shape, order Lead #3 #2 #4) | Figs 16.30, para 112a | MATCHES |
| Box | Delayed 90 | L | #2 0, #4 11, #1 16, #3 27 | 90 | 71/3 | yes | 3,288 | #2 R-5941 F-59, #3 R-2953 F-7047, #4 R-8931 F-7069 | Fig 16.30 mirrored | MATCHES |
| Box | Delayed 45 | R | #1 0, #2 39, #3 38, #4 77 | 45 | 71/3 | yes | 2,236 | #2 R-5905 F+39, #3 R-2959 F-6983, #4 R-8904 F-6960 (box kept) | Fig 16.31: rear element 10-15 s after the front, lead checks 10-15 degrees | PARTIAL: geometry right, timing outside the band (#3 -0.5 s), no lead check |
| Box | Delayed 45 | L | #2 0, #4 0.1, #1 39, #3 38 | 45 | 71/3 | yes | 2,236 | #2 R-5905 F-39, #3 R-2947 F-7022, #4 R-8734 F-7110 | same | PARTIAL |
| Box | Hook | R / L | #1, #2 at 0.1; #3, #4 at 19 (together) | 180 | 71/3 | #1/#3 and #2/#4 (R), #2/#3 (L) | 31 | #2 R-6000 F0, #3 R-3000 F-7036, #4 R-9000 F-7036 | Fig 16.32, para 112a: rear delay 10-15 s | MATCHES the picture; delay 18.9 s outside the band (N5) |
| Box | In-place 90 | R / L | all at 0.1, no delay | 90 | 71/3 | no | 6,000 | trail | para 112b | MATCHES |
| Box | Check 30 | R / L | all at 0.1 | 30 | 71/3 | no | 6,000 | rotated | para 112b | MATCHES |

Timing variants (Clock at the Auto position, Auto timing), same turns: Auto timing ends within 15 ft of LAB for every line-abreast Delayed 90 and Delayed 45 (2-ship R-6015 F-15; Delayed 45 R-6010 F-4; 4312 #4 R-11994 F+6). Clock: Delayed 90 turns the second aircraft at 7.10 (right) or 4.91 (left) o'clock and ends 15.5 degrees of sweep; Delayed 45 turns at 4.61 (right) or 7.39 (left) and ends 2.6 degrees (R-5406 F+246); box with Clock now turns all four (#3/#4 on the rear timing) and ends #2 abreast R-4697 to R-5406, #4 5,704 to 8,294 ft aft. Hook, shackle, cross, in-place and check ignore the timing box, as they should.

Sweeps (Auto timing for delayed turns, Time for the rest): 2-ship, 6 turns x spacing 4,000/5,000/6,000 x speed 180/200/220/250 x G 2/2.5/3/4 x start heading 000/090/225 x both directions = 1,728 runs; 4312, 2134, box, 5 turns x 3 spacings x 2 speeds x 2 G x 2 headings x both directions x #2 side left/right = 1,440 runs. Every end position within 3% of the spacing (or 120 ft) and 350 ft (400 in 4-ship, 600 in the box) of where the SMM puts it; 0 outside; the result does not depend on the start heading at all (0 of 576 combinations differ by more than 2 ft).

## 3. Track pictures next to the SMM figures

All in `scratchpad//mnt/project-files/verification/shots/turn-sim-2/`. North up, dots every 5 s, square = end.
- `tracks-2ship-delayed.png` (Delayed 90/45, Right/Left, Clock), `tracks-2ship-others.png` (Hook R/L, Shackle, Cross, In-place, Check), `tracks-4312.png` (4312 Delayed 90 R/L, Delayed 45, Hook, In-place, 2134), `tracks-box.png` (box Delayed 90 R/L/Clock, Delayed 45, Hook, In-place).
- Side by side with the figure: `side-delayed90.png` (16.15), `side-delayed45.png` (16.16), `side-hook.png` (16.19), `side-shackle.png` (16.20), `side-cross.png` (16.21), `side-inplace-check.png` (16.18), `side-spread4-d90.png` (16.34, plus the sim's Delayed 45 for contrast), `side-box-d90.png` (16.30), `side-box-hook.png` (16.32), `side-box-d45.png` (16.31).
What I see: Delayed 90 (2-ship and staircase of four), Delayed 45 2-ship, Hook, Shackle (the X), Cross turn (two arches meeting at the top), In-place, Check, and the box Delayed 90 (order Lead, #3, #2, #4 on the far side) are the same pictures as the figures. The 4-ship Delayed 45 is not: the figure is a compact wedge (checks), the sim a string 46,000 ft long. The box Delayed 45 lacks the Lead check turn.

## 4. In the browser

| Check | Result |
|---|---|
| Turn menu labels | Delayed 90, Delayed 45, Hook turn, Shackle, Cross turn, In-place 90, Check turn. Turn degrees they set: 90, 45, 180, 45, 180, 90, 30 (all seven read from the Turn degrees box) |
| Greyed out (D146) | Shackle and Cross turn disabled in 4312, 2134 and Offset box, enabled in Two-ship; hint under the menu gives the reason |
| Direction | Right/Left mirror the picture and the cards for every turn that uses it (4312 Delayed 90 R: #3 FORE +59, #4 FORE +99; L: #2 FORE +40; 2134 is the mirror). Cross turn: Direction greyed with "Lead always turns toward #2: right in this run". Shackle: box stays enabled and does nothing (N2) |
| Play to the end at 4x, every formation x every turn x both directions | 44 runs on the screen (the 8 greyed-out Shackle/Cross entries in the four-ship formations are checked as disabled); console clean (no errors or warnings) in all; end cards agree with the engine (e.g. 2-ship Delayed 90 R "#2 FORE fore/aft +59 ft, Min sep 5,941"; cross "#2 WIDE interval 6,025", "Second half at 1.6 G to roll out 6,000 ft apart", "Crossing: 300 ft vertical needed, #1 and #2") |
| Labels at start (TS-06) | 4312, 2134, box, two-ship x headings 000, 045, 090, 135, 180, 225, 270, 300, 359: all ON SPACING (36/36). Engine: 5,184 combinations (4 formations, #2 side L/R, 9 spacings, headings every 5 degrees): rows outside the 4,000-6,000 ft band are TIGHT or WIDE, as they should be; no FORE/AFT noise anywhere |
| Offset box opens ON SPACING (TS-07) | Yes at every heading; #3 in the slot |
| Clock or Auto in the box | Clock: yellow line "#3 and #4 can't see their clock cue in the box, so they turn on the rear element timing instead"; all four turn. Auto timing: no warning needed, all four turn |
| WebGL off | 3D pick stays on 2D, note shown, three.js never requested, console clean; the note blames the connection (N9) |
| Overlap 1280x720, 1366x768, 1440x900 | Three columns (setup 288, stage 670/756/830, formation 272), no column overlaps another, no control under another (all panels open, checked with elementFromPoint), no sideways scroll; 1024x768 same, picture labels crowd; 768 and 390 stack in one column |
| axe (WCAG 2.0 A and AA) | 0 violations at 1366 with all panels open, with the Layers menu open, box + Clock, two-ship cross turn running |
| Console | 0 errors, 0 warnings in every flow |

## 5. Findings

Format: ID, severity, where, steps, expected, actual, picture, known?, missing test.

**N1 (High, new) A turn the formation cannot fly stays selected and something else is flown.**
Where: Setup, Turn and Formation. Steps: Formation Two-ship, Turn Cross turn (or Shackle), then Formation 4312 (or 2134, box). Expected: D146 "the run falls back to the default turn with the reason shown"; the menu and the notes must say what is flown. Actual: the Turn menu still reads Cross turn (a greyed option), Turn degrees 180 (45 for the shackle), Direction greyed with "Lead always turns toward #2: right in this run", while the engine flies Delayed 90 (aircraft #2 leaves at 0 s, then #1 at 16 s, #3 at 32 s). The only text is the generic hint "The shackle and the cross turn are two-ship turns: pick the two-ship formation to fly them", which does not say Delayed 90 is being flown. Picture: `/mnt/project-files/verification/shots/turn-sim-2/07-shackle-then-4312.png`, `08-cross-then-4312-running.png`. Known: the e2e test at `turn-sim.spec.js:564` intends "the note says the default turn is what flies" but only checks the note is visible. Recommendation: when the formation changes to one that cannot fly the selected turn, set Turn to Delayed 90 and Turn degrees to 90 (one line beside the menu: "Switched to Delayed 90: the shackle is a two-ship turn"), and take the cross-turn Direction note from the turn that is flown (`layout.js applyDirection` reads `values.maneuver`, not the flown turn). Missing test: `tests/e2e/turn-sim.spec.js` (next to line 564): after Two-ship + Cross turn then 4312, the Turn menu shows Delayed 90, Turn degrees 90, Direction enabled, no "Lead always turns" note.

**N2 (Medium, new) The Shackle's Direction box does nothing.**
Where: Setup, Direction with Turn = Shackle (two-ship). Steps: pick Shackle, run with Right, then Left. Expected: either a meaningful choice or greyed with a reason, as for the cross turn (D161, e2e line 586). Actual: Right and Left fly the identical shackle (same starts, same end R-6039 F0, `ts2/out.json` rows shackle45 right/left), the box stays enabled. Picture: `/mnt/project-files/verification/shots/turn-sim-2/06-shackle-2ship-t0.png`. Missing test: `tests/e2e/turn-sim.spec.js` line 586 test covers Cross only; add Shackle (Direction greyed and the note "Both turn toward each other"), and `tests/unit/turn-sim/shackle.test.js` "Direction does not change the flight" to make the pick deliberate.

**N3 (Medium, partly planned) 4312 and 2134 Delayed 45 (and the box) are the slow figure.**
Where: Formation 4312/2134, Turn Delayed 45. Actual: the four start at 0, 39, 77 and 116 s (run 129 s); with Clock 0/37/74/110; the picture is a string 46,000 ft long (`/mnt/project-files/verification/shots/turn-sim-2/tracks-4312.png`, `side-spread4-d90.png`). Expected: Fig 16.34 (right) draws the 4-ship Delayed 45 with a 10-15 degree check turn by the other three, which is the quicker version (Fig 16.16's note says the plain 45 is more time consuming; Fig 16.17 is the 2-ship version with the check); para 118 lists delayed 45 for spread-4. The plain chain is the Fig 16.16 flavour and is a legitimate turn, so this is PARTIAL, not WRONG. Known: D148 (box lead check 12.5 degrees) "not built yet"; the spread-4 and 2-ship checks are not in any plan. Recommendation: build the check-turn version as the default for 4312, 2134 and the box (what the figures draw) and keep the plain chain as an option, so Delayed 45 in a 4-ship finishes in about 50 s. Missing test: `tests/unit/turn-sim/delayed-45.test.js` (line "4312: the four go one after another, 38.6 s apart" pins the chain) needs a companion once built: "with the check turn the last aircraft starts within 60 s and all four end LAB".

**N4 (Medium, new) A perfect turn ends with red FORE or WIDE flags.**
Where: Formation card at the end of the default run. Actual (screen and engine agree): 2-ship Delayed 90 R "#2 FORE fore/aft +59 ft"; Delayed 45 R "+39 ft"; 4312 Delayed 90 R "#3 FORE +59, #4 FORE +99"; Shackle "#2 WIDE interval 6,039 ft"; Cross "#2 WIDE interval 6,025 ft"; box "#2 FORE +59, #4 FORE +40". The fore/aft numbers are 0.6 degrees of sweep and the widths 0.4 to 0.65 percent of spacing, well inside what any pilot can hold (SMM 16.18: spread 4,000-6,000, sweep 0-10 degrees aft), but they read as errors in the sim's own default flights. Picture: `/mnt/project-files/verification/shots/turn-sim-2/m-twoShip-Shackle-Right.png`. Known: the previous audit says the +59 is a real 0.56 degrees, not noise; not planned. Recommendation: a small tolerance in the label rule in `readouts.js` (say 1 degree of FORE and 1 percent of width; the AFT side already has 10 degrees), and the pilot's own measure stays in the number. Missing test: `tests/unit/turn-sim/readouts.test.js`: "the default 2-ship Delayed 90, Delayed 45, Shackle and Cross end ON SPACING; a wingman 300 ft fore or 7,000 ft out is still flagged".

**N5 (Medium, logged) Box rear delays outside the SMM 10-15 s.**
Where: Offset box, More detail, "Offset box delay". Actual: Delayed 90 #3 10.9 s (in the band); #4 16.1 s after #3 (an information line, Fig 16.30's note that #4 turns at the standard LAB cue); Delayed 45 #3 -0.5 s ("outside the SMM 10-15 s; solved so the box keeps its shape"); hook 18.9 s (same wording). Expected: para 112a, Fig 16.31, 16.32 say 10-15 s. The SMM's own numbers do not fit each other at 220 KTAS: 10-15 s is 3,700 to 5,600 ft of trail, and para 109 and Fig 16.30 want 6,000 to 8,000 ft (7,000 ft is 18.9 s). Known and flagged on screen: D184. PILOT JUDGEMENT, question: is the box kept at 7,000 ft aft (delay 18.9 s in the hook) or the 10-15 s delay flown (box then 3,700 to 5,600 ft aft)? Recommendation: keep D184 (box shape), the amber line already tells the pilot; ask Dad which he flies. Missing test: none for the behaviour (box-slot tests exist); add the wording test in N6.

**N6 (Low, new) Box hook line says "#4 turns 18.9 s after #3".**
Actual: in the hook #3 and #4 start together (both at 19.0 s, 18.9 s after the front element). `readouts.js offsetBandLines` prints the box-slot #4 line for every turn. Missing test: `tests/unit/turn-sim/readouts.test.js` "offsetBandLines for the hook says #4 turns with #3".

**N7 (Low, new) Clock position label is stale for Delayed 45.**
The select reads "Auto (7 right, 5 left)" for Delayed 45 too, where Auto is 4:30 right and 7:30 left (D206); the status lines say 4:30 and 7:30 correctly (`ts2/clock45.mjs`). Missing test: e2e or readouts test that the Auto label follows the turn.

**N8 (Low, new) Box with Clock: the status lines contradict the warning.**
Above the lines the warning says #3 and #4 turn on the rear element timing; the lines say "#3 watching #2 for 7 o'clock" and, when it turns, "#3 cue came from #2, turning" (`/mnt/project-files/verification/shots/turn-sim-2/03-box-Clock-t0.png`, `03-box-clock-running.png`). Missing test: `tests/e2e/turn-sim.spec.js` line 489 test: in the box #3 and #4 lines must not say "watching" or "cue came from".

**N9 (Low, new) WebGL-off note blames the connection.**
"3D needs a connection the first time." is shown when the browser has no WebGL2 (one message for both, index.js line 164; the e2e at line 700 pins it). Recommendation: `view3d.js` already returns reason 'gl' or 'load'; use "3D needs WebGL, which this browser does not have" for 'gl'. Missing test: the test at line 700 should expect the WebGL wording.

**N10 (Low, unchanged) Label overlaps and truncated selects remain (TS-12, TS-13).** "12,000 ft" over "#3" at the start (`/mnt/project-files/verification/shots/turn-sim-2/01-open.png`); Timing shows "Clock position c" and Clock position "Auto (7 right, 5" (`03-box-Clock-t0.png`). At 1024 wide the picture labels overlap each other heavily (outside the 1366 spec). Missing test: none practical; a screenshot compare at 1366.

**N11 (Low, wording) D172 says the layout stacks below 1,366 px.** It stacks at 900 px (`turn-sim.css:401`); between 900 and 1,365 the three columns are kept and nothing overlaps (checked at 1024). No fix needed, correct the log line.

What I checked that passed: all 132 flights; all four hooks, in-place and check turns in every formation; the mirror of every turn; the SMM clock positions (Delayed 90 turns before the first passes the tail, at about 6.4 o'clock on Time, 7.1 on Clock; Delayed 45 turns after it at 4.5/7.5); heading change never more than 45 in a Delayed 45; spread-4 spacing (Fig 16.33: #2-#3 12,000, #2-#4 18,000, inside 8,000-12,000 and 12,000-18,000 at the top of the band); bank and G (70/3 everywhere, 60/2 for the first 90 of the cross); crossings flagged for the shackle, cross and box hook; Reset, Step and Play at 4x; axe; console; WebGL off.

## 6. Pilot judgement, with recommendations

- **PJ-1 Clock cue at 7/5 o'clock rolls out 15 degrees of sweep at 6,000 ft.** Same as the earlier report. The SMM says approximately 7/5 and "closer turn early, wider delay". Recommendation: keep the SMM cue, show the sweep at rollout (the card already shows fore/aft), Auto timing is the clean choice.
- **PJ-2 Cross second half at 1.6 G at 6,000 ft (D214).** The picture and the note ("Second half at 1.6 G to roll out 6,000 ft apart") are honest; 3 G would end 2,000 ft apart. Recommendation: keep D214; add "3.0 G at 4,000 ft spacing, the SMM's 70/3" to the cross note so a pilot who flies 70/3 sees why the sim differs.
- **PJ-3 4-ship Delayed 45 with or without checks (N3).** Recommendation: build the checks as the default in 4312, 2134 and the box (the figures draw them), keep the plain version as an option.
- **PJ-4 Box rear delay (N5).** Recommendation: keep D184.
- **PJ-5 Shackle in the box (D169).** SMM 112b allows it (no delay); Patrick chose two-ship only (D146). Recommendation: leave greyed until Dad says he flies it in the box.

## 7. Logged calls checked against the SMM (decisions-for-review.md, Turn Sim rows)

| D | Call | Against the SMM | Verdict |
|---|---|---|---|
| D147 | Rear delay 12.5 s | Paras 112a, Figs 16.31-16.34 (10-15 s) | Superseded by D184 for the default; still a choice |
| D148 | Box Delayed 45 lead check 12.5 degrees | Fig 16.31 | Not built (N3) |
| D149 | Check turn 30 default, 5-30 | Para 58 | Agrees; Turn degrees max 30 confirmed |
| D150 | Cross: first 90 at 2 G | Fig 16.21 60/2 | Agrees (2.0 G / 60.0 degrees in the run) |
| D151 | Delayed 45 wording | Paras 56-57, Fig 16.16 | Agrees with the picture; nobody exceeds 45; "wingman starts as for a 90" is not literally flown (the second aircraft flies straight), which is what the figure shows |
| D160 | Rear element shifted by the rear delay | Fig 16.30 note | Superseded by D184 |
| D161 | Cross: Lead always toward #2 | Fig 16.21 | Agrees |
| D162 | Run lasts to last turn + 10 s | none | Works (4312 Delayed 45 ran 129 s); the 75 s minimum still applies |
| D169 | Shackle/Cross two-ship only | Para 112b lists the shackle for the box | Contradicts 112b for the box; Patrick's pick; PJ-5 |
| D170 / D214 | Cross second half solved to LAB | Para 64 says 3 G | Differs at spacing above 4,000 ft; documented; PJ-2 |
| D171 | Box stagger 0 | Fig 16.30 | Agrees; opens ON SPACING |
| D172 | Stack below 1,366 | (layout) | Actually 900 px (N11) |
| D184 | Box delays solved to keep the shape | Para 112a / Figs 16.30-16.32 | Departs from 10-15 s, flagged on screen (N5) |
| D185 / D206 | Delayed 45 clock cue 4:30 / 7:30 | Fig 16.16 draws about 5 and 7 | Departs from the drawn 5/7 by half an hour to roll out LAB; documented; the select label is stale (N7) |
| D207 | Box hook nose-to-nose 31 ft, flagged | Fig 16.32 says de-conflict | Display only; agrees |

## 8. Missing tests (summary for the owner)

- A whole-matrix test that flies every button in every formation and asserts the SMM outcome (turn angle, 70/3, who first, end R/F, no dependency on the start heading): my `ts2/verdict.mjs` and `sweep.mjs` (4 s for 1,728 runs) are the model: suggested `tests/unit/turn-sim/smm-matrix.test.js`.
- N1 to N9 tests above.
- `tests/e2e/turn-sim.spec.js`: a walk through all seven Turn entries in each formation asserting the menu shows the flown turn.

## Audit (second checker, Opus, ~12:15Z; own scripts, 196 turn-sim tests pass)

| Item | Verdict | Severity | Note |
|---|---|---|---|
| Shackle 2-ship R and L | CONFIRMED fixed | - | Both turn toward each other at 71°/3 G, max 45°, cross 8 ft apart at 12.9 s (300 ft vertical flagged), #2 ends R−6039 F0 heading 000, sides swapped. Matches Fig 16.20. |
| Hook 2-ship and 4312 | CONFIRMED fixed | - | 180° together, ends abreast. Fig 16.19/16.36. |
| Cross 2-ship R and L | CONFIRMED fixed | note | Toward each other both directions; 60°/2.0 G to 90°, then 51°/1.57 G (D214, not SMM's 3 G above 4,000 ft); cross 9 ft at 11.9 s; end heading 180, #2 R+6025. Fig 16.21. |
| Delayed 45 2-ship | CONFIRMED fixed | - | Max 45°; second aircraft turns at 38.7 s after the first passes its tail (4:30/7:30 cue, D206). Fig 16.16. |
| Delayed 90 box order | CONFIRMED | - | Ends Lead, #3, #2, #4, rear ~7,000 ft aft. Fig 16.30. |
| Check turn | CONFIRMED | - | 30°, together. |
| N1 Shackle/Cross then switch to 4-ship/box | CONFIRMED | High | Saved maneuver stays shackle/cross; run.js reset() falls back to Delayed 90 and 90°, but the select still shows the greyed turn, Turn degrees shows 180/45, Direction stays greyed with the "Lead always turns toward #2" note (layout.js 301, 309-313). Fallback flies a stored Direction the pilot can't change. Likely survives reload. |
| A1 (new) "#2's side" does nothing in the two-ship | CONFIRMED | Medium | Shown in 2-ship (layout.js:327), hint says 2-ship (fields.js:61), but formationSlots mirrors only 4312/2134; default reads Left while #2 flies right. Spec line 56 says 4312 and 2134 only; line 192 implies it should matter for delayed 45 into/away. Hide it in the 2-ship or make it mirror. |
| N4 perfect turns flagged FORE/WIDE (25-99 ft) | CONFIRMED | Medium | core/standards.js:89 flags any sweep below 0° and is shared with the Debrief, so fixing it is a design call (Turn Sim-only tolerance, or aim the engine just inside the band). |
| N3 4-ship delayed 45 vs Fig 16.34 | CONFIRMED | Medium | No 10-15° check turn for the others; #4 starts at 116 s of a 129 s run. |
| N2 shackle Direction does nothing | CONFIRMED | Low-Medium | Deliberate in the engine (shackle.test.js:54; SMM para 61 has no direction); grey it out like the cross turn's. |
| N5 / D184 box rear delays outside 10-15 s | CONFIRMED, logged | Medium, pilot call | |

Verdict on the pilot's complaint: the shackle now crosses (fixed). Every turn flies as its button says in its own formation, but three controls still mislead: N1 (High), A1, N2.

## For the Turn Sim thread (go ahead per Patrick 09:31Z; log judgement calls)
1. N1: on formation change, switch the Turn menu to Delayed 90 (and Turn degrees 90) with a one-line note; take the Direction state from the flown turn. e2e next to turn-sim.spec.js:564.
2. A1: hide "#2's side" in the two-ship and fix the hint, unless mirroring is intended (then build it and test it).
3. N2: grey Direction for the shackle.
4. N4: Turn Sim-only tolerance of ~1° / 1% on FORE/WIDE, logged; readouts.test.js "default 2-ship turns end ON SPACING".
5. N3: build the 4-ship delayed 45 check-turn version as default (Fig 16.34), keep the chain as an option; log.
6. Lows N6-N11 as in the checker's list (box hook readout, Clock label for delayed 45, status lines vs warning, WebGL-off wording, overlaps, D172 breakpoint).
