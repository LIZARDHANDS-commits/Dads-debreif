# Turn Sim verification on main 94b00a1 (2026-09-30)

Checker: independent, no repo files touched. Build served with `vite preview` on port 4301, Chromium 1440x900 unless stated.
Sources: engine flown through `createRun` on main (144 runs: 4 formations x 6 turns x 2 directions x 3 timings, screen defaults 220 KTAS, 3 G, 6,000 ft, 16 s, offset box 7,000 ft aft, start heading 000, 75 s run, turn degrees as the screen sets them); SMM ch.16 figures 16.15 to 16.21 and 16.30/16.31 (images in /mnt/project-files/manuals/images/smm-formation/); paras cited by number only.
Positions below are `R` feet right of Lead, `F` feet ahead of Lead's 3/9 line, measured on Lead's final heading (same convention as the 2026-09-30 report).

Scratch: `scratchpad/ts/fly.mjs` (144 runs -> `out-main.json`, `table.txt`), `tracks.mjs`/`plot.mjs` (track pictures), `dirs.mjs`, `d45.mjs`, `w*.mjs` (browser).

## Summary

- **Part 1, engine re-fly:** every number I could compare with the report's NEXT column is identical on main (about 45 quoted end positions, start times, closest approaches and auto steps; list in section 1). Nothing changed. The engine on main is the NEXT branch as reported. So all the problems Patrick describes are still there: shackle, hook, cross, delayed 45, check turn, offset box. None of them is fixed by PR #172; the fixes are tasks 15 and 11 (both still unchecked in `tasks/turn-sim/todo.md`), and the "Turn Sim SMM fix PR (pending)" rows in `logs/decisions-for-review.md`.
- **Part 2, screen:** no dead buttons, no console errors, no controls covered at 1366x768 and up. Clock and Auto timing are now enabled and work. 2D/3D, Play/Pause/Step/Reset, speed, Fit, Layers, panels and the Reset to defaults buttons all work. New findings on the screen: a perfect formation is labelled FORE/WIDE at the default start (a bug in the label rounding), the offset box opens flagged WIDE, and below the 1366-wide spec the layout breaks.
- **Part 3, e2e flake:** reproduced 1 in 4 under load; a test race, not an app fault (section 3).

Counts (new findings this pass, excluding the known items which are listed once each):

| Severity | Count | IDs |
|---|---|---|
| High | 6 (5 known and planned, 1 new) | TS-01 shackle, TS-02 hook, TS-03 cross, TS-04 delayed 45, TS-05 offset box, TS-06 (new) perfect formation labelled FORE/WIDE |
| Medium | 5 | TS-07 offset box opens WIDE, TS-08 shackle/cross offered in 4-ship, TS-09 no Check turn, TS-10 logged delayed-45 wording, TS-11 narrow windows |
| Low | 4 | TS-12 label overlaps, TS-13 truncated select text, TS-14 mid-turn fore/aft reading, TS-15 e2e flake (test only) |
| PILOT JUDGEMENT | 4 | PJ-1 to PJ-4 |

Top five, one line each:
1. TS-01 Shackle still does not cross: 2-ship Right both turn right and stay 6,000 ft apart; Left they turn away from each other (spacing 7,799 ft). SMM Fig 16.20 wants both to turn 45 toward each other, cross, and return. Task 15.
2. TS-02 Hook turn button flies 90 degrees and ends in trail (#2 R0 F6000); SMM para 60 / Fig 16.19 is 180 degrees ending in LAB (typing 180 by hand gives #2 R-6000 F0). The Turn degrees box shows 90 for Hook. Task 15.
3. TS-03 Cross turn Left: both aircraft turn left, never cross; Right: cross at 3 ft and end 60 ft apart at 3 G throughout (SMM Fig 16.21 is 2 G to 90 then 3 G, ending about 2,000 ft apart). Task 15.
4. TS-06 (new) A perfect formation is labelled "FORE" (and sometimes "WIDE") at the default start heading 000: 4312 opens with #3 and #4 red "FORE fore/aft 0 ft"; a two-ship opens with #2 "FORE". Floating-point noise; the rounding fix in `readouts.js` does not remove it.
5. TS-05 Offset box: 16 s chain instead of the 10-15 s rear delay; left turn puts #4 21,901 ft aft; with Clock/Auto timing #3 and #4 never turn and no warning. Task 11 (the missing warning at the Auto position is not planned).

---

## 1. Engine re-fly against the report's NEXT column

Method: `createRun(settings)` with DEFAULTS plus formation, maneuver, direction, timing and turnDeg per maneuver (`TURN_DEGREES` in readouts.js), stepped to every aircraft finished + 10 s or the 75 s cap. End position on Lead's heading; start times from the first step an aircraft is `turning`.

Numbers identical to NEXT (no change): 2-ship Delayed 90 Time R/L (#2 R-5941 F+/-59, starts 0 / 16.05 s, closest 3,783); Clock (12.7 s, R-4697 F1303, other aircraft at 7.10 o'clock); Auto (16.25 s step 16.2, R-6015 F-15); 4312 Delayed 90 R (#2 R5941 F-59, #3 R-5941 F59, #4 R-11901 F99), L (#2 R5960 F40, #4 R-11882 F-118), Clock (#4 R-9394 F2606), Auto (#4 R-11994 F6); 2134 mirrors; Delayed 45 2-ship Time (R42 F2503), Clock (19.55 s, R-877 F2122), Auto (39.1 s, R-6010 F-4); Delayed 45 4-ship Time (#4 R70 F5000; L #4 R83 F-5005), Auto (#3 R-4772 F443, #4 R-530 F4686, two aircraft never turn); box Delayed 90 Time R (#3 R-4882 F-8382, #4 R-10842 F-7842, closest 1,662), L (#3 R-1059 F-9441, #4 R4901 F-21901, closest 2,935); box Clock (#3, #4 never turn, 23,512 ft and 31,702 ft aft); box Delayed 45 Time R/L (#2 R749 F+/-3210 ...); Hook (all 12 runs identical to In-place 90: 2-ship R0 F+/-6000); Shackle 2-ship R (R6000), L (R7799); 4312 Shackle R (#2 R-7799, #3 R6000, #4 R12000), L (#2 R-6000, #3 R7799, #4 R13799); box Shackle R (unchanged), L (#2 R8799, #3 R5299, #4 R11799); Cross 2-ship R (cross 3 ft, ends R60), L (R-6000, never crosses); 4312 Cross R (#3 R60); box Cross R (#2 940 ft from Lead); In-place 90 (2-ship R0 F+/-6000, 4-ship trail 6,000/6,000/12,000, box together).

Changes from NEXT: **none found.** (The report quotes those numbers only; the full 144-run result is in `scratchpad/ts/out-main.json`, so a full diff is possible if the earlier JSON is supplied.)

Sequencing and G measured this pass (2-ship, Time delay, screen defaults): every turn, every aircraft, is flown at 70.5 degrees of bank and 3.0 G (LAB 70/3). No aircraft flies the cross turn's first 90 degrees at 60/2 (see TS-03).

### Which problems are still present, and where they are planned

| Problem | Still on main? | Numbers now | Planned |
|---|---|---|---|
| Shackle does not cross | Yes | 2-ship R: both +45 then back, spacing stays 6,000, ends R6000. 2-ship L: #1 -45, #2 +45 (away from each other), ends R7799. 4312 R: #1 R, #2 L, #3 R, #4 R; L: #1 L, #2 L, #3 R, #4 R. No crossing, no swap, no hold, all over in 6.5 s | Task 15, Q44a (decision log row "Turn Sim SMM fix PR (pending)" covers cross, delayed 45, check, rear delay; the shackle is in Q44a) |
| Hook is a 90 in-place turn | Yes | Turn degrees box = 90 when Hook is picked; ends trail. With 180 typed: 2-ship #2 R-6000 F0, 4312 R6000/R-6000/R-12000 all F0 (correct LAB); box: #3 R-3500 F7000 (no rear delay) | Task 15, Q43; box delay task 11 |
| Cross turn: Left does not cross; Right at 3 G, ends 60 ft apart | Yes | See TS-03 | Task 15 (two-stage G, decision logged). The Left-turns-the-wrong-way part is not stated in the task or the log |
| Delayed 45 ends in trail | Yes | Time: #2 R42 F2503 (2-ship). Clock: R-877 F2122. Auto: 2-ship correct (R-6010 F-4); 4-ship two aircraft never turn in 75 s | Task 15 (decision logged); the 75 s cap is not planned |
| Check turn missing | Yes | No entry in Turn menu; Turn degrees 30 with In-place gives R5196 F3000 | Task 15, default 30 logged |
| Offset box delayed turns | Yes | 16 s chain; L turn #4 21,901 ft aft; Clock #3/#4 never turn with no warning | Task 11 (rear delay 12.5 s logged); the no-warning case is not planned (the warning only fires at 5:30) |

Delayed 45 heading check (asked by the manuals thread, SMM paras 56 and 57): I flew delayed 45 in every formation, both directions and all three timings. Largest heading change of any aircraft is **45.0 degrees**; nobody reaches 90. So the sim never carries the inside aircraft across in front of Lead on a 90-degree heading, which is what the SMM paragraph describes: it simply turns 45 and rolls out (in trail on Time delay).

### Bank, sequencing and geometry against the SMM figures (2-ship, side by side)

Track pictures from the sim (north up, dots every 5 s, square = end): `shots/track-s-<turn>.png` (2-ship Right and Left), `/mnt/project-files/verification/shots/turn-sim/track-t-delayed90away.png` and `track-t-delayed45away.png` (Time vs Clock vs Auto), `shots/track-b-<turn>.png` (offset box). Each picture has a note of the matching SMM figure.

| Turn | Sim picture | SMM figure | Verdict |
|---|---|---|---|
| Delayed 90 | Outside aircraft turns first, inside holds straight and turns 16.05 s later when the first is at 6.36 (right) or 5.64 (left) o'clock. Ends line abreast, sides swapped, R-5941 F+/-59, closest 3,783 ft. `track-s-delayed90away.png` | Fig 16.15, paras 52-54: outside turns first; inside turns at about 7 (right) or 5 (left) o'clock; LAB, sides swapped | Matches. The Time default is a little short of 7 o'clock (see PJ-1) |
| Delayed 45 | Outside first, inside 16 s later, both 45. Ends in trail 2,503 ft apart. `track-s-delayed45away.png` | Figs 16.16, 16.17, paras 55-57: inside carries on across to the other side, ends abreast on swapped sides | Wrong on Time and Clock; Auto correct in a 2-ship only |
| Hook | Both turn 90 together and stop, in trail. `track-s-hook90.png` | Fig 16.19, para 60: both 180 together, fuselages aligned at the 90 point, roll out LAB | Wrong |
| Shackle | Right: both turn the same way and back. Left: turn away from each other. No crossing. `track-s-shackle45.png`, `shackle-2ship-*-mid-2D.png` | Fig 16.20, paras 61-62: turn 45 toward each other, cross, turn 45 back, sides swapped | Wrong |
| Cross | Right: cross near the start of the second half, pass 3 ft apart, end 60 ft apart. Left: both turn left, never cross, ends R-6000 (a 180 hook). `track-s-cross180.png` | Fig 16.21, para 64: toward each other, 60/2 for 90 then 70/3, roll out 180 in LAB | Wrong |
| In-place 90 | Together, trail at 6,000 ft. `track-s-inplace90.png` | Fig 16.18, para 59 | Matches |

Offset box pictures (`track-b-*.png`): Delayed 90 chains #1 / #2 / #3 / #4 at 0 / 16 / 32 / 48 s. SMM Figs 16.30 and 16.31 (para 112a): #3 and #4 delay 10 to 15 s. Hook, In-place and Shackle in the box have no rear delay, which matches para 112b; delayed 45 is wrong as above.

---

## 2. Screen walkthrough

Path: home page (`/mnt/project-files/verification/shots/turn-sim/01-home.png`), click the "Formation Turn Sim" card, opens `#/turn-sim` (`/mnt/project-files/verification/shots/turn-sim/02-turnsim-open.png`). Console at every step: no errors. Only warnings seen are Chromium WebGL software-render messages in 3D (headless machine) and one about `getImageData` from my own test script.

### Controls checked and result

| Control | Result |
|---|---|
| Setup collapse, Formation card collapse (real buttons) | Work; canvas-only view possible |
| Formation (4312, 2134, Offset box, Two-ship) | Changes aircraft count and start positions; offset-box boxes (Aft spacing, Lateral stagger, #4 timing) appear only for the box |
| Turn (6 entries) | Turn degrees box follows: 90, 45, **90 for Hook**, 45 Shackle, 180 Cross, 90 In-place. Hook = 90 disagrees with the SMM (TS-02). No Check turn entry (TS-09) |
| Direction Right / Left | Mirrors the picture for Delayed 90/45, Hook, In-place. For Shackle and Cross it does not mirror the crossing (TS-01, TS-03) |
| Speed, G, Spacing, Start heading | Change the picture immediately and reset the run. Bad values (G 0, Spacing blank, heading 450) show "Enter a number from ..." with aria-invalid and the run keeps its last good value |
| Timing: Time delay / Clock position cue / Auto timing | **All three enabled** and change behaviour. Time shows Base delay; Clock shows Clock position (default "Auto (7 right, 5 left)") plus live status lines under the Formation card; Auto shows "works out each aircraft's delay itself" |
| Play / Pause / Step / Reset | Play turns into Pause, t advances at the chosen speed; Step advances 0.05 s; Reset returns to t = 0 |
| Playback speed 0.25x to 4x | 2 s of wall time gives t = 0.5, 1, 2, 4, 8.1 s |
| 2D / 3D switch | 2D default; three.js requested only after 3D is picked; run keeps time across the switch; back to 2D keeps time. `/mnt/project-files/verification/shots/turn-sim/12-3d-view.png` |
| Fit | Refits (button works) |
| Layers menu (8 boxes + Breadcrumb every + Reset layout) | Every box changes the picture; closes on Escape; the menu is a pop-up over the picture, by design |
| Aircraft errors panel | Extra G on #2 changes the flight (FORE +1,457 ft at 1 s); Reset to defaults clears it |
| Turn Sim settings panel | Turn degrees, Run length, MOA boundary, Correction model (Model and Strength appear when ticked), Paint, Clock cue aircraft / sequence / tolerance (with Clock timing), offset-box controls (with the box) all present |
| Profiles | Placeholder text only ("Saved setups and a startup default will go here"). Planned, task 13 |
| Reset to defaults (3 buttons) | Restore G 3, Turn degrees 90, 4312, Delayed 90, errors 0, Correction off |
| Header Settings (app) | Opens the app settings dialog (Times, Card videos, Airfields ...); not a Turn Sim menu |

### Layout (Patrick's V6 complaints)

- 1440x900, 1366x768: no overlaps or covered controls with panels closed. With every panel and Layers open, the only overlaps are the Layers pop-up over the picture (by design) and the scrolled Setup column passing under the app header. Nothing sits on top of Play, Step, Reset or the side panels. **PASS** for the spec's R2 at 1366x768.
- Below the spec width the layout breaks, see TS-11.

### Findings

**TS-01 (High, known, task 15) Shackle does not cross.**
Where: Turn = Shackle, Two-ship, either direction. Steps: pick Two-ship, Turn Shackle, Direction Left, Step 60 times. Expected (SMM Fig 16.20, paras 61-62): both aircraft turn about 45 degrees toward each other, cross with vertical separation, turn back, sides swapped. Actual: Right: #1 +45, #2 +45 (same way), spacing 6,000 ft throughout, ends R6000. Left: #1 -45, #2 +45 (away), spacing grows to 7,799 ft. Screenshots: `/mnt/project-files/verification/shots/turn-sim/shackle-2ship-right-mid-2D.png`, `/mnt/project-files/verification/shots/turn-sim/shackle-2ship-left-mid-2D.png` (t = 3.0 s), `/mnt/project-files/verification/shots/turn-sim/track-s-shackle45.png`. Cause per the earlier report: the wingman's "side" uses the mirrored vector. Planned: task 15 (Q44a). The 4-ship shackle is not an SMM spread-4 turn; per the pilot's 09:28Z decision it will be two-ship only (TS-08).

**TS-02 (High, known, task 15) Hook turn does 90 degrees.**
Where: Turn = Hook turn, any formation. Steps: pick Hook turn; the Turn degrees box (Turn Sim settings) says 90. Expected (SMM para 60, Fig 16.19): 180 degrees at 70/3, both together, roll out in LAB. Actual: 90, ends in trail (2-ship #2 R0 F6000), identical to In-place 90 in all 12 hook runs. With 180 typed by hand it is correct (2-ship #2 R-6000 F0). Screenshot: `/mnt/project-files/verification/shots/turn-sim/track-s-hook90.png`. Planned: task 15 (Q43); box rear delay task 11.

**TS-03 (High, known, task 15) Cross turn.**
Where: Turn = Cross turn, Two-ship. Actual: Right: #1 turns right, #2 left (toward each other), 3 G all the way, cross at 3 ft, end 60 ft apart (`/mnt/project-files/verification/shots/turn-sim/track-s-cross180.png`). Left: #1 and #2 both turn left, no crossing, ends R-6000 on the reciprocal (a hook). Expected (Fig 16.21, para 64): toward each other, 60 bank / 2 G for the first 90, then 70/3, pass with 300 ft vertical, roll out about 2,000 ft apart. Planned: task 15 two-stage G (logged as "toward each other, first 90 at 2 G"). The "Left" case (Lead follows the Direction box even when that points away from #2) is not named in the task; see PJ-2.

**TS-04 (High, known, task 15) Delayed 45.**
Time: the 16 s delay from the 90 is reused, outside first, both turn 45; ends in trail (#2 R42 F2503), never crosses. Clock: R-877 F2122. Auto: correct in a 2-ship (R-6010 F-4); 4312/2134/box with Auto: two aircraft do not turn before the 75 s run ends. Expected: Figs 16.16 and 16.17 (line abreast on the swapped side). Screenshot: `/mnt/project-files/verification/shots/turn-sim/track-s-delayed45away.png`, `/mnt/project-files/verification/shots/turn-sim/track-t-delayed45away.png`. Planned: task 15 and the logged decision. Not planned: the 75 s cap for the 4-ship Auto.

**TS-05 (High, known, task 11) Offset box.**
Delayed 90 chains the four aircraft 16 s apart; SMM para 112a says #3 and #4 delay 10-15 s. Left turn ends #4 21,901 ft aft (`/mnt/project-files/verification/shots/turn-sim/track-b-delayed90away.png`). Clock or Auto timing in the box: #3 and #4 wait for a 7 o'clock cue that never comes and fly straight on; at 48 s the screen still says "#3 watching #2 for 7 o'clock" and no warning is shown (`/mnt/project-files/verification/shots/turn-sim/16-offsetbox-clock-t48.png`). The 5:30 warning exists (e2e test) but the new default position (Auto) does not raise it. Planned: rear delay task 11 (12.5 s logged). The missing warning at Auto is not planned.

**TS-06 (High, new) A perfect formation is labelled FORE/WIDE at the default start.**
Where: Formation card, on first open. Steps: open the Turn Sim (4312, heading 000). Expected: all three wingmen ON SPACING (the card says "fore/aft 0 ft"). Actual: #2 ON SPACING, **#3 "FORE fore/aft 0 ft" (red)** and **#4 "FORE fore/aft 0 ft"**. Screenshot: `/mnt/project-files/verification/shots/turn-sim/02-turnsim-open.png`. Same at start heading 045 and 300 ("WIDE"), in a two-ship (#2 "FORE"), and in 2134 (#2 FORE); only headings 090, 180 and 270 read clean. Cause: the standard's sweep test reads a -1e-13 ft error as "less than 0 degrees" (FORE) and a 6000.0000002 ft interval as more than 6,000 (WIDE). `readouts.js` `settle()` rounds positions to a millionth of a foot, but the rotation into Lead's axes brings the noise back. Reproduce without the browser: `formationRows(createRun({...DEFAULTS}).state, {formation:'weighted'})`. Suggested fix (for the owner): compare the label tests with a small tolerance (for example 0.01 degree and 0.01 ft) in the shared classifier or in `readouts.js`, and add a test for start headings 0, 45, 300. Not in the plan or spec. This misleads a pilot on the first screen and also flags FORE at the end of a good Delayed 90 (+59 ft).

**TS-07 (Medium, new) Offset box opens flagged WIDE.**
Where: Formation = Offset box, Formation card. Actual at t = 0, no error entered: "#2 WIDE / FORE interval 7,000 ft", "#4 WIDE / FORE interval 6,500 ft"; only #3 ON SPACING. Expected: SMM Fig 16.30 and para 112 draw the box with each element 4,000-6,000 ft abreast. Cause: the default Lateral stagger (1,000 ft, V6's box) is added to the 6,000 ft spacing, so #2 sits 7,000 ft out. The FORE part is TS-06. Suggestion: default the stagger to 0 so the box opens ON SPACING; keep the setting for variations. Screenshot: `/mnt/project-files/verification/shots/turn-sim/15-offset-box.png`. Not planned.

**TS-08 (Medium, decision not built yet) Shackle and Cross are offered in 4312, 2134 and the offset box.**
The Turn menu allows them in every formation. Pilot's 09:28Z decision: two-ship only, greyed out otherwise. Not built; not counted as a bug.

**TS-09 (Medium, planned, task 15 item 1) No Check turn.**
Not in the Turn menu; In-place 90 with Turn degrees 30 flies it (R5196 F3000). SMM para 58 and Fig 16.18.

**TS-10 (Medium, decision log) Logged delayed-45 wording does not match para 56.**
`logs/decisions-for-review.md`, 09:35, Turn Sim: "Delayed 45: first aircraft turns ~90 toward, crosses, rolls out on the 45 heading". SMM para 56 (into the wingman): Lead turns **45** and rolls out; it is the **wingman**, who starts as if for a 90, who carries on across in front of Lead and picks up the 45 heading in LAB. Para 57 (away from the wingman): the wingman turns first toward Lead and rolls out on Lead's second wing flash, then Lead crosses to the other side and turns. In neither case does any aircraft complete 90 of heading change (the manuals thread's note agrees). The other four Turn Sim rows (rear delay 12.5 s, 12.5 degree lead check, check turn 30 default, cross 2 G first) agree with the SMM: 10-15 s band (Figs 16.31-16.34), Fig 16.31's 10-15 degree check, para 58 (30 degrees or less), Fig 16.21's 60/2 then 70/3. Recommendation: reword the row so "first aircraft" is spelled out per case (into: Lead 45 and the wingman crosses; away: wingman toward, Lead crosses), and have the task 15 test state the maximum heading change (45 degrees) for each aircraft.

**TS-11 (Medium, below the spec's width) Narrow windows break the layout.**
Spec R2 requires no overlap "at 1366x768 and up"; it does not cover smaller windows. At 768x1024 the picture shrinks to about 160 px wide and the Layers pop-up covers the Setup boxes (`/mnt/project-files/verification/shots/turn-sim/09-layout-open-768x1024.png`). At 390x844 the page scrolls sideways, Play/Step/Reset/Speed/Fit are under the Formation card, and Layers/More detail are off screen (`/mnt/project-files/verification/shots/turn-sim/08-layout-390x844.png`). Nothing is dead at 1366 or wider. Recommendation: either state a minimum width on the screen ("Turn Sim needs a wider window") or stack the three columns below about 1000 px; Patrick's call.

**TS-12 (Low) Labels overlap on the picture.** "12,000 ft" over the "#3" tag at the start (`/mnt/project-files/verification/shots/turn-sim/02-turnsim-open.png`); the "AFT" flag over "#2 3.0 G, R 1,515 ft" in `/mnt/project-files/verification/shots/turn-sim/shackle-2ship-left-mid-2D.png`; "11,901 ft" over "#3" at the end of a 4312 run (`/mnt/project-files/verification/shots/turn-sim/06-4312-delayed90-end.png`).

**TS-13 (Low) Truncated select text.** Timing shows "Clock position c" and the Clock position select shows "Auto (7 right, 5" in the 158-pixel boxes (`/mnt/project-files/verification/shots/turn-sim/16-offsetbox-clock-t48.png`).

**TS-14 (Low, by design) Fore/aft reads huge mid-turn.** At t = 3 s in a right shackle the card says "#2 FORE fore/aft +4,025 ft" (left: "AFT -4,558 ft") while the aircraft are abeam; the numbers are measured on Lead's rotating 3/9 line, as in V6. Consider showing the readouts only when the turn is finished, or leave as is.

### What passed

Home page card opens the module; no console errors in any flow; all controls listed above respond; Clock and Auto timing are enabled and effective (2-ship Delayed 90 ends within 60 ft of LAB on Time and within 15 ft on Auto); Direction Left mirrors Delayed 90 exactly in the 2-ship (numbers match with sign of F flipped); Delayed 90 and In-place 90 match the SMM for 2-ship, 4312 and 2134; 3D loads three.js only on first use; G/bank is 3.0 G / 70.5 degrees on every turn; invalid entries show messages; Reset to defaults works in all three panels; the 4312 Delayed 90 right ends line abreast at 5,941 ft in the browser (`/mnt/project-files/verification/shots/turn-sim/06-4312-delayed90-end.png`).

### PILOT JUDGEMENT

**PJ-1 Clock cue puts the late turner 1,303 ft ahead.** With Timing = Clock at the default Auto position (7 right / 5 left), the 2-ship Delayed 90 ends #2 R-4697 F1303, a 15.5 degree sweep, outside the 0-10 degree standard; Time (16 s, 6.4 o'clock) ends F59 and Auto (16.25 s) ends F-15. The SMM's own note (closer, turn early; wider, delay) says 7 o'clock is a guide, and at 6,000 ft spacing the wingman needs to wait longer than the cue. Question: is the 7/5 o'clock cue meant to give a good rollout at the top of the 4,000-6,000 ft band? Recommendation: keep 7/5 as the cue (it follows the SMM), show the resulting sweep at rollout, and make Auto the pilot's default recommendation for a clean LAB; no engine change.

**PJ-2 Cross turn direction.** With the wingman on Lead's right, "Left" makes Lead and #2 both turn left; nothing crosses. Question: should Direction on a Cross turn mean the way Lead turns (so a left cross needs the wingman on the left), or should Cross always turn the pair toward each other? Recommendation: always toward each other (the button says Cross); Direction picks which side #2 starts on or which aircraft is the outside one, and the same for Shackle.

**PJ-3 Offset box default width.** Should the box open at 6,000 ft abreast (stagger 0) or 7,000 ft? Recommendation: stagger 0, so #2 is at the top of the band and the box opens ON SPACING (TS-07).

**PJ-4 Hook direction on the radio.** SMM Fig 16.19: comm-out hook turns always go away from the wingman. Question: should the sim's Hook default to away, with Direction only mirroring the picture? Recommendation: keep Direction as the pilot's choice for now; add the away note to the Hook description.

---

## 3. e2e flake, `tests/e2e/turn-sim.spec.js:459` (three.js will not load)

Reproduced: `npx playwright test tests/e2e/turn-sim.spec.js --repeat-each=4` on this 4-core machine failed 1 of 4 repeats of this test (111 passed). Error: `locator.check: Clicking the checkbox did not change its state` at line 464, not in the note assertion. Cause: the test replaces `three.module.js` with a file that throws immediately, so when Playwright clicks the 3D radio the app fails to load, sets the note and switches back to 2D (`layout.update({ view: '2d' })`) before Playwright reads the radio's state after the click; `check()` then sees "not checked" and throws. It needs a busy machine (full suite, parallel workers) because it depends on the round trip being faster than that read. It is a test race, not an app fault (the note and the 2D fallback work). Suggested fix for the owner: use `click()` instead of `check()` on the 3D radio in that test (the assertions after it already check the note and that 2D is checked again).

Test-results folder from my run was removed from the worktree.

## Audit (second checker, Opus, ~10:00Z)

| ID | Verdict | Severity | Note |
|---|---|---|---|
| TS-06 FORE/WIDE at start from float noise | CONFIRMED, wider than reported | High | 4312 at 180/270: #2 FORE; 2134 at 180/270: #3/#4 FORE; only 090 is clean in all formations. Cause: readouts.js `settle()` rounds world positions but core/standards.js `formationAxes` re-adds noise via cos/sin; `spreadForeAft` compares against sweepMinDeg 0 with no tolerance. Fix in readouts.js (round the rotated values) rather than the shared classifier, which the Debrief also uses (that would need a pinning test first). Correction: the +59 ft FORE at the end of a Delayed 90 is a real 0.56° sweep, not noise. |
| TS-07 offset box opens WIDE | CONFIRMED | Medium | formation.js:67 adds boxStaggerFt (1,000, settings.js:55) to the spacing. |
| TS-08 shackle/cross offered in 4-ship | PLAUSIBLE; see note | Low | The 09:28Z "two-ship only" pick is not yet in decisions-for-review.md, the spec or tasks. SMM 16 para 112b allows the shackle in the offset box (no delay); the SMM describes no 4-ship cross. Greying out Shackle in the offset box would contradict para 112b; greying out Cross in 4-ship is consistent. |
| TS-10 logged delayed-45 wording | REJECTED (stale) | - | D151 (09:35Z) now matches paras 56-57. Also now covered: D161 cross Left always toward #2; D162 run lasts to last turn + 10 s; D147/D160 offset box sequencing. Still open: no warning when the box uses Clock or Auto timing. |
| TS-11 narrow windows | CONFIRMED | Medium (outside spec R2 1366x768+) | Conflicts with "usable by anyone, anywhere"; log a decision. |
| #172 changed none of the SMM mismatches | CONFIRMED | - | Identical relative positions before/after #172. |
| TS-01/02/03 shackle, hook, cross | CONFIRMED | High | TS-03 extra: task 15's cross test should target line abreast within 4,000-6,000 ft (Fig 16.21: adjust G to fix the spacing), not the 2,000 ft a pure 2 G/3 G flight gives. |
| PJ-1 clock cue | Agree | - | Exact cue is ~6:22 at 6,000 ft, 6:38 at 4,000 ft; 7:00 only at ~3,000 ft. Keep the SMM cue, show sweep at rollout, Auto for clean LAB. |
| PJ-2 toward each other | Agree | - | Decided for cross (D161); write the same rule for the shackle. |
| PJ-3 box stagger 0 | Agree | - | Change DEFAULTS only, keep V6_DEFAULTS pinned; opens ON SPACING only once TS-06 is fixed. |
| PJ-4 hook direction free + note | Agree | - | Para 60: radio hook either way; comm-out hook away from wingman (Fig 16.19 note). |

## For the owner (go ahead per Patrick 09:31Z, log judgement calls)
1. TS-06: fix the label noise in readouts.js with a test at headings 000, 045, 180, 270, 300 for every formation.
2. TS-07 / PJ-3: default box stagger 0 (DEFAULTS only).
3. Offset box with Clock/Auto timing: add the "can't see" warning, or fall back, when #3/#4 would never turn.
4. Task 15 cross-turn test target: line abreast 4,000-6,000 ft.
5. TS-08: check the two-ship-only pick against SMM para 112b before greying out Shackle in the offset box.
6. Flaky e2e turn-sim.spec.js:459: `check()` on the 3D radio races the instant fallback; use `click()` then assert.
