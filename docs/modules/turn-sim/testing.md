# Turn Sim: testing and sign-off

The whole-tool testing policy in `../../TESTING.md` applies. This file adds the module's own rules, how each of its requirements is checked, its sign-off checklist, and what happens to each of its test files.

Sources in this file point to where things were on 4 Oct 2026: `pf/` means the project files (`pf/`, private), and repo paths such as `docs/records/` or `specs/` are now under `archive/` (see `archive/README.md`).


Built on TS-R1 to TS-R27, ratified by Patrick on 4 Oct 02:26Z (`pf/reset/1-requirements/requirements.md`, "## Turn Sim"), and the "Realistic kinematics means (Turn Sim)" paragraph under them. The Turn Sim review, the plan's last step, decides whether the Turn Sim is rebuilt, gets a new core, or is fixed (`pf/reset/consolidation-plan.md:261-268`). So every Turn Sim test file is marked "follows the Turn Sim review" in the test register's Turn Sim section, with the mark it would get if the code is kept and what carries over either way. The rules below hold whatever the review decides.

**Today:** 21 unit files (189 tests) and one browser file (46 runs), all passing at `6283f38` (`pf/reset/5-testing/browser-results-6283f38.md`). Passing means only that the tests match the code. Patrick found on 3 Oct that the aircraft "do not behave as per the smm" (`pf/reset/0-lessons/antigravity.md:71`), and the ratified requirements differ from what the tests pin in three places:
- The default timing is a fixed 16 s delay (`src/modules/turn-sim/settings.js:73`), where TS-R7 says the clock cue.
- The Speed box is flown as ground speed, where TS-R6 says KIAS converted to true airspeed.
- The Delayed 45 ends about 3,900 ft apart and TIGHT (`tests/unit/turn-sim/delayed-45-check.test.js:93`), where TS-R5 says the wingmen fix to line abreast on roll-out.

Other facts from the test agent's report (`pf/reset/5-testing/agents/turn-sim.md`, module summary):
- 44 unit tests and 5 browser tests gate on a time.
- 22 pin a V6 number or V6 behaviour.
- Several pin the engine's own output.
- 75 have a tolerance band typed into the test, and none uses the shared tolerance table.
- No test checks that an in-place turn ends in trail (TS-R4) or that labels wait for the roll-out (TS-R23).

## First version (live mode, `spec.md` Part 1)

The first version's checks are in `tests/unit/turn-sim/live.test.js` and follow FM1, FM2, FM5, FM6 and FM8 below: end pictures for every button both ways and with #2 on either side (who is where, which way they face, spacing within ±100 ft, heading within ±5°, against SMM 16.19 paras 52-64); bank never past the manoeuvre's bank by more than half a degree and G at 3; at least 300 ft vertical at the cross in the shackle and cross turn; every hand-over smooth (Patrick, 4 Oct 10:05Z: no jump in position, track, bank or pitch or their rates; TS-47); a press while flying is queued. No time gates. The plan-mode tests stay as they are until Step 3 of `plan.md`. The plan-mode browser test (`tests/e2e/turn-sim.spec.js`, sign-off only) checks the old screen and fails on the new one; it is retired or rewritten in Step 3 with Patrick's yes.

**Sign-off checklist, first version** (draft, for Patrick to put in his own words). Open the Turn Sim fresh, V2.6 or later, 2D:
1. The pair sits in line abreast, Lead on 000, #2 on the right at 6,000 ft, paused at t = 0; nothing covers the picture.
2. Press each button, both ways where it has sides: the pair flies it the way the SMM figure draws it and carries on in line abreast. Delayed 90 and 45 roll out abeam with sides swapped; check 20 keeps the shape turned 20°; in place 90 ends in trail; the hook comes back the other way abreast; the shackle ends on the original heading with sides swapped; the cross turn comes back the other way.
3. In the shackle and cross turn, #2 climbs over Lead (the Formation card shows about 300 ft) and comes back down.
4. Nothing jumps or snaps: rolls in and out look smooth at 0.25×, in 2D and in 3D.
5. A press during a manoeuvre shows "Next: ..." and is flown when the first ends.
6. The camera keeps both aircraft in view; ground tracks stay drawn; the planned path is dashed ahead.
7. The Formation card judges only after roll-out, in words with the numbers.
8. Change Spacing to 3,000 ft: it is flown and flagged as outside the SMM band; type 500 ft: refused with a reason. Switch #2 to the left: the start mirrors and the buttons' into/away words swap.

## 4-ship (live mode V2.7, `spec.md` section 8)

The 4-ship's checks are in `tests/unit/turn-sim/four-ship.test.js`, with the 2-ship's margins (±100 ft, ±5°): the start picture and altitude stack (AFM8 brief p.14-15, SMM Fig 16.33); the end picture of each button both ways and with #2 on either side (SMM 16.19 paras 52-60, 16.43 para 118, 16.45 para 121, Fig 16.34); who turns first and the wait between them, spacing ÷ speed × cot half the turn (AFM8 brief p.17, SMM 16.19 paras 52-57); the delayed 45's check turn of 10 to 15° (AFM8 brief p.18; one degree either side for the roll-out running on); bank and G for all four; no two aircraft within 300 ft vertically and horizontally (SMM 16.13 para 31, Gen Book p.11) with the stack held, and an **estimate** that they are never under 1,000 ft apart horizontally; every hand-over smooth for all four (TS-47); the queue; the roll-out judgement per wingman. The delayed 45's end gaps are only held to the SMM's 4,000 to 6,000 ft band (plus 100 ft) because the check turn costs room (the brief's note says fix on roll-out). No time gates.

**Sign-off checklist, 4-ship** (draft, for Patrick to put in his own words). Open the Turn Sim fresh, V2.7 or later, 2D, and choose Formation: 4-ship:
1. Four aircraft side by side facing 000, #4 #3 Lead #2 from left to right, 6,000 ft apart, on a stack (the Formation card shows #2 +300, #3 -300, #4 -600 against Lead); the shackle and cross turn buttons are gone.
2. Delayed 90 right: they turn one after another from the outside in (#4, #3, Lead, #2 with #2 on the right) and roll out abreast, sides swapped, one spacing apart. Left turns go the other way round.
3. Delayed 45 right: the outside aircraft turns 45 first; each other aircraft checks a little back toward it, then turns; all roll out abreast on the new heading, the first to check a little tight.
3b. Clear "Delayed 45 with the check turn" under Setup and fly Delayed 45 again: nobody checks away; they turn one after another and roll out abreast at one spacing.
4. Check 20 keeps the line turned 20°; in place 90 ends as a column of four; the hook comes back the other way abreast.
5. Nothing jumps; the camera keeps all four in view; ground tracks and dashed planned paths show for all four; 3D shows all four at their heights.
6. Switch back to 2-ship: it starts again from the 2-ship's default start. Switch to 4-ship again: back to the 4-ship's default start.

**Training errors (TS-52), `tests/unit/turn-sim/errors.test.js`.** Expected values are worked out in the test from the SMM pictures and plain geometry, never from the code's own output: with a start offset and no fix, #2 ends at the SMM picture plus the offset turned with Lead's heading change; a timing error moves #2 by speed times seconds times the chord of the turn. Margin ±100 ft (the shared table). "Fix it" is checked as "never worse" and "closer where a fix has something to work with", not as "always perfect": at constant speed some fore/aft errors cannot be fully fixed in the check turn, Delayed 45 and shackle (spec section 9), and the test does not pretend otherwise. The fix limits (bank 50 to 75°, 30 s delay, 60 ft/s climb) are estimates, checked only as "the flying stays inside what the plan allows"; they are not requirements. Physical limits (roll 90°/s, build-up 360°/s², constant speed) and smooth hand-overs (F12) are checked with errors on. No time gates, no browser test yet.

**Sign-off checklist, training errors** (draft, for Patrick to put in his own words; V2.6 or later, 2D). Open "Errors (training)", it starts closed and everything on it is "None":
1. With every error "None" the screen and every button behave as in the first version.
2. Set Along the 3/9 line to Ahead, response "Turn at normal reference", press Delayed 90: #2 ends ahead of abeam by about the same amount, and the Formation card says the error carried through.
3. Same error, response "Fix it": #2 delays or presses on so he ends close to abeam, and the card says what was fixed and what was left. Try Wide, Tight and Late the same way; "closer, turn early; wider, delay" should look right to you.
4. Set Height High 500 ft, press the shackle: #2 comes back to Lead's height smoothly and still clears Lead by 300 ft at the cross.
5. Nothing jumps or snaps with an error set; the bank looks smooth into and out of a stronger fix turn, and the card flags any G above 3.
6. Random error: Reset a few times; each time one error is named on the card.
7. Say if "Ahead (acute)" and "Behind (sucked)" are the right way round for how you and Dad use the words.

## Turn Sim rules on top of the whole-tool rules

- **FM1. The end picture is the test (TS-R3 to TS-R5).** For each turn, both ways, in each formation, check who is where and which way they face once every aircraft has rolled out, against the SMM figure's page reference (Figs 16.15 to 16.21 and 16.30 to 16.36). The checks are positions relative to Lead and spacing against the set spacing. Each has a stated margin and its reason. How long the turn took is never checked (T2).
- **FM2. Turn geometry is worked out in the test (TS-R6).** The test works out radius, rate and bank from speed and G (bank = acos(1/G)). It converts KIAS to true airspeed at the block height itself. The circle drawn has the radius shown, and more G at the same speed always tightens it. Constant speed through the turn is the SMM's own wording; the sustained-G question stays with TS-Q8.
- **FM3. Who turns when is checked by its rule, not by seconds (TS-R7).**
  - Clock cue: each wingman starts its turn when the aircraft beside it reaches the cue bearing, worked out in the test, outside aircraft first.
  - Time delay and Auto are teaching options. The test checks that the delay set is the delay flown, and that Auto equals spacing ÷ speed × cot(half the turn). Those are checks of a rule, like a readout, not time gates.
  - The box's 10 to 15 s band is the SMM's number, and its flag is checked at the edges.
- **FM4. The engine's own output is never the expected answer (T3).** Where the engine and the SMM picture differ, the difference is written down for Patrick and Dad, never tuned to pass (T7). An example is the Delayed 45's tight end before TS-R5.
- **FM5. Same plan, same picture (TS-R9).**
  - Playback at 0.25× and 4×, and any frame rate, gives the same end.
  - A setup change returns to time 0.
  - The same turn flown north or east is the picture turned 90°.
  - Right and left are mirror images.
- **FM6. Limits are flagged, never walls (T10, TS-R11, TS-R12).** A G the T-6 can't pull at that speed shows a warning and is still flown. Crossings and passes under 300 ft show the 300 ft vertical note.
- **FM7. Judging is fair to the turn (TS-R23, TS-R24).** Labels are judged at roll-out, and an in-place turn is judged in trail. The standards are the shared ones the Debrief edits.
- **FM8. Live mode is tested the same way when it is built (TS-R1).** Pressing any manoeuvre button at any moment gives the SMM end picture (FM1), and the formation carries on. Seeded runs of random button presses check that nothing jumps or is lost, as in Traffic's TP4. Its checks are written with the build and fail until then.

## How each Turn Sim requirement is checked

"Each change" means a unit test or one of the per-change browser checks in section 2 (smoke, layout, accessibility, buttons, leaving, offline). Checks that need the whole Turn Sim browser file run at sign-off. "New" means no test checks it today; the test is written with the change that builds it and fails until then.

| Requirement | Automatic check | When | Hands-on checklist |
|---|---|---|---|
| TS-R1 Plan mode and live mode | Plan mode: 4312, Delayed 90, Play, and the Formation card names who ended tight, wide, fore or aft. New: live mode per FM8 | Each change | A first-time user says who ended where |
| TS-R2 The SMM's turns | The turn menu offers Delayed 90, Delayed 45, check, in-place, hook, and for two-ship the shackle and cross turn; each passes FM1 | Each change | |
| TS-R3 The offset box | FM1 for the box in Delayed 90 both ways: the same box shape on the new heading | Each change | Dad looks at the box against Figs 16.30 to 16.32 |
| TS-R4 Every turn ends as the SMM says | FM1 for every turn, both ways, in 4312, the box and the two-ship. New: the in-place turn ends in trail | Each change (a few cases); sign-off (all) | Dad checks each end picture against its figure |
| TS-R5 The Delayed 45 never ends in trail | New: with time delay, clock and Auto, in every formation, the end after the roll-out fix is a line (or box) across the new heading; if a wingman isn't abreast the screen says why | Each change | |
| TS-R6 A real coordinated turn at the set G | FM2, including KIAS to true airspeed at the low (220) and mid (200) block | Each change | |
| TS-R7 Who turns when | FM3. New: a fresh open reads Clock cue | Each change | |
| TS-R8 Later layer: wingman mistakes | Wide and tight move 1,000 ft out or in on either side of Lead; each mistake changes the end picture the way its name says. **Built as the training errors (TS-52)**, checked in `tests/unit/turn-sim/errors.test.js`: errors off changes nothing; at "Turn at normal reference" each error carries to the end picture within ±100 ft; "Fix it" never ends further out than carrying, ends closer (by more than ±100 ft) where there is room, and puts #2 back in the picture where the turn gives him the room; physical limits and smooth hand-overs hold | Each change | Patrick flies each error both ways (checklist below) |
| TS-R9 Same picture every time | FM5 | Each change | |
| TS-R10 No wind, said on screen | New: the screen's one line says the air is still | Each change | |
| TS-R11 Crossings need 300 ft vertical | The two-ship shackle shows the crossing note; FM6 | Each change | |
| TS-R12 Too much G warned, still flown | 8 G at 220 kt shows the warning beside the G box and the turn is flown | Each change | |
| TS-R13 Only the essentials first | Fresh open: the Setup fields listed in TS-R13; the other panels and Layers closed | Each change | Nothing on screen you don't need first |
| TS-R14 Every field has its default | No blank box anywhere, closed panels included; Play with nothing typed flies 4312 Delayed 90 | Each change | |
| TS-R15 Playback and keys | Play, Pause, Step (exactly one 0.05 s step), Reset, 0.25× to 4×, Fit; Space, right arrow and Home, never while typing | Each change | |
| TS-R16 Only controls that apply | The every-button check; in 4312 the shackle is greyed with its reason; box options show only for the box | Each change | |
| TS-R17 Drag a wingman before Play | New: drag #3 wide, Play starts from there, Reset keeps it as that wingman's position error | Each change, when built | |
| TS-R18 Saved setups | Until built the Profiles panel is hidden (TS-R18). When built: save, reload, load gives the same setup including errors; save-over, delete and factory reset ask first; blocked storage still opens | Each change | |
| TS-R19 Export CSV (if TS-Q13 keeps it) | Export downloads a file, one row per step, with no NaN for the two-ship | Each change, when built | |
| TS-R20 Fitted, nothing covered, at 1280 | Layout check at 1280 × 800 and larger with every panel open: no control over the picture, every control reachable, no page scroll | Each change (layout) | |
| TS-R21 Colours plus numbers and words | Every aircraft has its number; #4's circle, label and trail are drawn as visibly as #1's | Each change | |
| TS-R22 The Formation card | Default 4312 at the start reads ON SPACING for all three; one turn line matching FM2; pairs under More detail | Each change | A pilot reads the card without help |
| TS-R23 Fair judging | FM7. New: a perfect in-place 90 never ends flagged; no TIGHT or AFT label mid-turn | Each change | |
| TS-R24 Shared standards | Edit a standard in the Debrief and the Turn Sim labels follow | Each change | |
| TS-R25 Layers and the 2D/3D switch | Each layer appears and disappears; the defaults on and off as listed; 3D loads only when switched on and a 2D-only visit makes no outside requests | Each change (unit); sign-off (browser) | One look at the 3D view |
| TS-R26 Plain words | Every box has a label with its unit and a hint; warnings sit beside what they are about | Each change | A pilot who has never seen it reads every label |
| TS-R27 Few settings | The settings count and each closed-panel control's reason are reported at sign-off for Patrick; no test pins the number of settings (T3) | Sign-off | Fewer controls than today, each with a reason |

**At Turn Sim sign-off:**
- The whole Turn Sim browser file.
- FM1 for every turn and formation, and FM8 over many seeds once live mode exists.
- The hands-on checklist above, with Dad's look at each end picture.
- `docs/checklists/turn-sim.md` rewritten for the ratified requirements. Today it disagrees with the code on the start heading (360 against 000), the reset button's name and the speed list (TS-Q23; `pf/reset/5-testing/agents/turn-sim.md`, conflicts 3 to 5).
- One look in real Safari at the 3D view.


## Sign-off checklist

Anyone can run it, in the real app, from the module's default start, on a laptop at 1280 wide, and send Patrick the result with the date, their name and the version shown on screen (`../../TESTING.md`, section 4). Anything not seen working is listed as unseen.

### From the ratified requirements (the hands-on column above)

- [ ] A first-time user says who ended where (TS-R1)
- [ ] Dad looks at the box against Figs 16.30 to 16.32 (TS-R3)
- [ ] Dad checks each end picture against its figure (TS-R4)
- [ ] Nothing on screen you don't need first (TS-R13)
- [ ] A pilot reads the card without help (TS-R22)
- [ ] One look at the 3D view (TS-R25)
- [ ] A pilot who has never seen it reads every label (TS-R26)
- [ ] Fewer controls than today, each with a reason (TS-R27)

> The old checklist below was written before the reset. It is refreshed against the requirements above when the module's work resumes: lines that test V6 numbers or exact times are rewritten or dropped.

### Carried over from `docs/checklists/turn-sim.md`

#### Sign-off checklist: Turn Sim (Formation Geometry Simulation) (Gate 3)

Anyone can run this in about twenty-five minutes, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/turn-sim (or `http://localhost:5173/#/turn-sim` locally)

The simulator models 2-ship and 4-ship tactical formation turns baselined on standard aerodynamics and 15 Wing Moose Jaw SMM Chapter 16 procedures.

---

### 1. First look & UI Layout

- [ ] On the home screen, the **Turn Sim** card has the short description and opens cleanly. **Home** in the header brings you back.
- [ ] Three main columns show without overlap at 1280 × 800:
  - **Setup panel** on the left (Formation, Spacing, Start heading, Turn type, Direction, Speed, G, Timing).
  - **Stage canvas** in the middle with toolbar above it (Play, Pause, Step, Reset, Speed multiplier, sim time, Fit, Layers).
  - **Formation results panel** on the right (wingman spacing status badges, minimum separation, turn kinematics: radius, rate, bank).
- [ ] Default values load on initial open: Formation `4312`, Spacing `6000 ft`, Start heading `360°`, Turn `Delayed 90`, Speed `220 KTAS`, `G: 3.0`.
- [ ] No controls overlap, no scrollbars obscure the flight canvas, and the whole formation fits cleanly on screen.

---

### 2. Playback, Step & Interactive Manipulation

- [ ] **Play / Pause:** Pressing Play starts simulation; aircraft turn and progress along their tactical flight paths. Pause halts aircraft instantaneously.
- [ ] **Step:** With simulation paused, pressing Step advances simulation clock by exactly one discrete physics step (0.05 s) per click.
- [ ] **Reset:** Clicking Reset restores simulation time to `t = 0.0 s` and returns all aircraft to their starting formation slots.
- [ ] **Speed Multipliers:** Toggle 0.5×, 1×, 2×, 4×. Aircraft kinematics scale smoothly at each rate.
- [ ] **Pre-Play Drag Interaction (D334):** Before pressing Play, click and drag a wingman (e.g. #2 or #4) on the canvas.
  - The aircraft moves to the new position.
  - Initial position error is updated in the readout.
  - Lead (#1) remains anchored.

---

### 3. Tactical Formation Geometries

- [ ] **4312 (Standard Tactical 4-Ship):**
  - Verify slot layout: #4, #3, #1, #2 in Line Abreast.
  - Spacing defaults to 6,000 ft lateral interval.
- [ ] **2134 (Inverted Tactical 4-Ship):**
  - Switching to `2134` mirrors formation layout cleanly across the flight axis.
- [ ] **Two-Ship Formation:**
  - Select `Two-Ship`: Displays Lead (#1) and Wingman (#2) abreast.
  - Kinematics and spacing badges reflect 2-ship standards.
- [ ] **Offset Box Formation (SMM Ch 16):**
  - Select `Offset Box`: Front element (#1 & #2) with trailing element (#3 & #4).
  - Trail spacing defaults to 7,000 ft aft (6,000–8,000 ft standard band per D155 / SMM 16.41).

---

### 4. Tactical Maneuvers & Aerodynamic Standards

- [ ] **Delayed 90° Turn:**
  - Aircraft outside the turn initiates; inside aircraft delay turn according to timing law.
  - Aircraft roll out in tactical Line Abreast on the new heading.
- [ ] **Delayed 45° Turn (D151):**
  - Aircraft cross paths without reaching 90°; rolls out smoothly in Line Abreast with sides swapped.
- [ ] **Hook Turn (180° Formation Turn, D84, Task 3.1):**
  - Select `Hook Turn`.
  - Verify that the formation executes a **true 180° formation reversal** per SMM Chapter 16 and Dad, rolling out on reciprocal heading (180° heading change), completely resolving the legacy V6 90° bug.
- [ ] **Shackle Formation Turn (D85):**
  - Aircraft turn toward each other, cross flight tracks forming an X, and swap sides, rolling out on original heading.
- [ ] **Cross Turn (D150, D170):**
  - Lead and wingman turn toward each other: 2 G to 90°, then solved G to roll out abreast.

---

### 5. Timing Laws & Spacing Solver

- [ ] **Timing Law Dropdown:**
  - **Time Delay:** Aircraft turn after fixed seconds (`Base delay`).
  - **Clock Cue:** Wingman turns when designated reference aircraft crosses target clock cue (e.g. 4:30 or 7:30).
  - **Auto Timing (D44, D380):** Closed-loop timing solver calculates exact delay ($\text{spacing} / \text{speed} \times \cot(\theta/2)$) so wingmen roll out abreast.
- [ ] **Spacing Solver Scoring (D385):**
  - Solver evaluates and scores station-keeping trials at maneuver rollout completion, not arbitrary clock durations.

---

### 6. Offset Box Rear Element & Vertical De-Confliction

- [ ] Select `Offset Box` and `Delayed 90` Right:
  - Trailing element (#3 & #4) delay turn to maintain box geometry.
  - When flight tracks cross within 1,000 ft lateral separation in the flat simulation, a salient caution flags:
    `"Crossing: 300 ft vertical needed"` (D207 / SMM para 111).

---

### 7. Settings Menu & Standards

- [ ] Open **Turn Sim settings**:
  - Contains **Start geometry**, **Display**, and **More setup** sections.
  - Relabeled reset button reads **Reset to Standard Defaults** (D384).
- [ ] Click **Reset to Standard Defaults**:
  - Restores certified 15 Wing SMM standards (3.0 G turn rate, 7,000 ft trail spacing, standard timing delays) without losing page responsiveness.

---

### 8. Sign-Off

**Browser and version:** _______________________  
**Date:** _______________________  
**Name:** Patrick  

**Notes / Observations:** __________________________________________________________________  

All lines ticked means Milestone 3 (Turn Sim Formation Simulation) is complete and signed off for Gate 3.


## Test files and what happens to each

**All Turn Sim test files follow the Turn Sim review** (rebuild, reuse parts or fix). The marks below apply only if the code is kept.
From the ratified test register (`pf/reset/5-testing/test-register.md`, Part B). The clean-up pull requests carry these out.

| File | Keep, rewrite or retire | Why (policy line or requirement) | What the rewrite checks instead | Runs |
|---|---|---|---|---|
| `tests/unit/turn-sim/auto-timing.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R7 keeps Auto as a teaching option. Kept: Auto never writes into Base delay (a V6 bug), and the step equals spacing ÷ speed × cot(half the turn), the formula at `:64`, a rule check (FM3). Goes: the V6 base (`:18`) and the typed 16.16 s (`:63`); the formula alone is the expectation. The speed in the formula follows TS-R6 | Carries over: the Auto formula as a rule; outside aircraft first; line abreast at the set spacing at roll-out (FM1) | Each change |
| `tests/unit/turn-sim/box-slot.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R3, TS-R7 (box #3 delays 10 to 15 s, #4 on the cue). Four time gates (T2); the "default readings" 10.9, 16.1, −0.5, 38.8, −38.2 and 18.9 s at `:131` are the engine's own (T3) | Carries over: in Delayed 90, Delayed 45 and the hook, both ways, the four roll out in the box shape on the new heading (FM1); designed crossings are listed (TS-R11); the 10 to 15 s band flag at its edges | Each change |
| `tests/unit/turn-sim/check-turn.test.js` | Follows the Turn Sim review (if kept: keep) | TS-R2, TS-R4, FM1: the two-ship check puts #2 5,196 ft right and 3,000 ft ahead (`:49`), which is 6,000 ft at 30° worked out, against SMM 16.19 para 58, Fig 16.18 (`:12`) | Carries over: the whole file's checks | Each change |
| `tests/unit/turn-sim/correction.test.js` | Follows the Turn Sim review (if kept: keep) | Whether the correction model stays is TS-Q17 (open with Dad). Nothing goes NaN at low G (TS-R12); the 0.25 G is worked out in the test (`:62`) | Carries over: no NaN and a G floor at any setting; the rest only if TS-Q17 keeps the model | Each change |
| `tests/unit/turn-sim/cross-turn.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R4 (the two turn toward each other and roll out on the reciprocal), TS-R11. Goes: the solved 1.57 G (`:113`), the engine's own (T3); the crossing time "5 to 15 s" (`:45`) becomes "they cross near the 90° point", found from heading (F6-style event). The comment's "±200 ft" against the code's 120 (`:20`, `:22`) is fixed | Carries over: the reciprocal end picture, the crossing note | Each change |
| `tests/unit/turn-sim/cues.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R7: the clock cue is the default. Kept: each wingman turns when the aircraft it watches reaches its bearing (135° at 7:30, 150° at 7 o'clock, worked out at `:75`, `:153-154`); #3 and #4 in the box can't see the cue. Goes: the Auto step of 14 to 15.5 s (`:166`, engine's own, T3) and the comparison of two engine runs called "V6's cascade" (`:94`) | Carries over: turn start by cue bearing, outside first (FM3) | Each change |
| `tests/unit/turn-sim/delayed-45-check.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R5 rules out the end this file pins: abreast but about 3,924 ft apart and tight of 6,000 (`:86`, `:93`). Eleven time gates (T2); 894 ft, 36.74 s and 0.96 s are the engine's own (`:294`, `:323`; T3) | Carries over: Delayed 45 right and left in 4312, 2134, the box and the two-ship, with each timing: the four end on a slanted line, each wingman fixes to line abreast on roll-out, and if it can't the screen says why (TS-R5, FM1) | Each change (a few cases); sign-off (all) |
| `tests/unit/turn-sim/delayed-45.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R4, TS-R5, TS-R7. Six time gates (T2). The 38.6 s delay is a formula (`:22`) but the clock cue is now the default, and the comment's 39.05 s disagrees with it. The 300 s stop (`:155`) is a run rule, tested as a rule (Q-T9, decided). "No aircraft turns past 45" stays | Carries over: the end picture as in the row above; the cue labels 4:30 right and 7:30 left (`:113-115`, Figs 16.15 and 16.16) | Each change |
| `tests/unit/turn-sim/fields.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R26 (plain words), TS-R11, TS-R16. States are built by hand. Numbers inside the strings (36.7 s, 18.9 s) are copied from other tests and go with them (T3) | Carries over: no NaN in any label; the crossing note; the greyed-out reasons | Each change |
| `tests/unit/turn-sim/formation.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R8: Wide 1,000 ft moves either side 1,000 ft further out (`:25`), the requirement's own check. "Where V6 did" (`:40`, `:64`) is relabelled to the spec's slots. Which way 4312 is drawn is TS-Q5 (open with Dad) and may move the slots | Carries over: wide and tight the same on both sides; 2134 mirrors 4312 | Each change |
| `tests/unit/turn-sim/heading.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R13, FM5: compass headings, and the same turn flown north or east is the same picture turned 90° (`:49`). V6's east default (`:38`) is relabelled as history | Carries over: compass definition; rotation gives the same picture | Each change |
| `tests/unit/turn-sim/hook.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R4: the hook is the same direction through 180° and ends line abreast (`:38`). The box test sets the old 12.5 s rear delay (`:20`, `:65`, `:72`); under TS-R7 the box #3 delays 10 to 15 s and #4 turns on the cue | Carries over: two-ship and four-ship hook end pictures; the box hook by cue | Each change |
| `tests/unit/turn-sim/offset-box.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R3. V6's LATE and EARLY are pinned (`:36`, `:54`, `:140`; T3); whether they stay is TS-Q15. Kept: #4 ends outside #2; the band edges 10 and 15 s (`:133`), a rule check; the in-place turn moves all four together (`:123`) | Carries over: the box shape at roll-out (FM1); the band flag | Each change |
| `tests/unit/turn-sim/plan.test.js` | Follows the Turn Sim review (if kept: keep) | TS-R7: "toward" and "away" turn the right way (geometry in the comments, `:23`, `:34`). The V6 swap (D41) is history only | Carries over: both checks | Each change |
| `tests/unit/turn-sim/readouts.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R22, TS-R12, TS-R24. States built by hand (`:13`). The turn line "R 1,5xx ft · 13-14°/s · bank 71°" (`:131`) changes with TS-R6's KIAS to true airspeed, so radius and rate are worked out in the test (FM2). "V6's fixed 250 ft" and "V6 order" (`:63`, `:120`) are relabelled to the spec | New beside it: labels are judged at roll-out only, an in-place turn is judged in trail (TS-R23, FM7) | Each change |
| `tests/unit/turn-sim/rear-check.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-Q24's working answer (rear check only between turns) and TS-Q16 (one rear-check button) may change it. "Limited as V6 limits them" (`:23`) is relabelled; the typed start times 35.1 and 90.1 s (`:72`, `:80`) become "once #3 and #4 finish turning" (F6-style event) | Carries over: the check swings out and back; a new leg clears it | Each change |
| `tests/unit/turn-sim/rear-delay.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R7 (box #3 10 to 15 s, #4 on the cue). Five time gates (T2); V6's 0, 16, 32 and 48 s chain (`:101`, `:107`; T3); an assert that can't fail (`:67`); the aft distance falls short of 7,000 ft (comment `:66`) | Carries over: the rear pair ends in its slots behind the front pair (FM1); the band flag | Each change |
| `tests/unit/turn-sim/run.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R9, TS-R15: fixed 0.05 s step, reset, start leg; the engine touches no page objects (`:225`). Goes: the V6-default Delayed 90 chain of 16, 32, 48 s ending at 75 s (`:79`, `:89`, `:92`), which TS-R7 replaces with the clock cue (T2, T3); the 600 s history run (`:139`) is cut down (T9) | Carries over: same plan, same picture at any step rate (FM5); a setup change returns to time 0 | Each change |
| `tests/unit/turn-sim/settings.test.js` | Follows the Turn Sim review (if kept: rewrite) | TS-R27 shrinks the settings. The change detectors that list exactly which settings differ from V6 or are new (`:24`, `:51`) and the version pin (`:125`) break on every added setting (T3). Kept: every setting has a valid default (TS-R14), bad values are refused, old saved settings still load | New: the default timing is the clock cue (TS-R7); Speed is KIAS with a low or mid block (TS-R6) | Each change |
| `tests/unit/turn-sim/shackle.test.js` | Follows the Turn Sim review (if kept: keep, with changes) | TS-R4: the shackle ends on the start heading with sides swapped. The 19.45 s hold (`:83`) comes from the engine; it becomes the formula worked out in the test from true airspeed (TS-R6, FM2) | Carries over: the shackle end picture; a short Duration never cuts it off | Each change |
| `tests/unit/turn-sim/view3d.test.js` | Follows the Turn Sim review (if kept: keep) | TS-R25: camera and attitude are geometry worked out in the test; no V6 values | Carries over: the whole file, if the 3D view stays | Each change |
| `tests/unit/turn-sim/errors.test.js` | New, keep (TS-52, training errors) | TS-R8, TS-47, F12: errors off changes nothing; each error carried at normal reference; Fix it never worse and closer where there is room; flight limits and smooth hand-overs hold; expected values from the SMM pictures and geometry | | Each change |
| `tests/unit/turn-sim/live.test.js` | New, keep (first version) | FM1, FM6, FM8, TS-R4, TS-R5, TS-R11, TS-47: end pictures, 300 ft at the cross, smooth hand-overs; expected values worked out in the test from the SMM pictures and the shared margins | | Each change |
| `tests/unit/turn-sim/four-ship.test.js` | New, keep (4-ship, V2.7) | FM1, FM6, TS-47, TS-50: the start picture and stack, end pictures of every 4-ship button, who turns first and the wait, the check turn, bank and G, 300 ft separation with the stack held, smooth hand-overs for all four; expected values from the briefs, SMM and the shared margins; one horizontal-only figure is an estimate and says so | | Each change |
| `tests/e2e/turn-sim.spec.js` | Follows the Turn Sim review (if kept: keep, with changes) | 46 of 46 pass at `6283f38`. Changes: the typed defaults include "time delay, 16 s" and 220 KTAS (`:155-160`), which TS-R7 and TS-R6 change; "Close pass: 894 ft", "954 ft", 36.7 s and 1.0 s (`:719`, `:859`, `:731-736`) are the engine's own (T3); real-time waits (`:184`, `:431`, `:433`) wait for an event instead (T2); the layout check runs at 1366 and 1920 wide (`:93`), and TS-R20 asks for 1280; stale "skipped" comments (`:15-16`, `:881`) go | Carries over: the whole-tool per-change checks for any build (smoke, layout with every panel open, keys, leaving, 3D loads only when asked). New: the still-air line (TS-R10); live mode (TS-R1) when built | Smoke, layout, buttons, leaving and offline parts each change; the whole file at sign-off |
