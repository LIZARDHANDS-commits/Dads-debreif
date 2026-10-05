# Turn Sim spec

This file has two parts. The first is the spec for the **first version of live mode**, approved by Patrick on 4 Oct 2026 at 10:03Z (decision card "Approve the Turn Sim first-version spec and screen as drafted?"), which is what the Turn Sim shows from V2.6. The second is the **plan-mode spec from before the reset**, kept unchanged below for the plan-mode code that is still in the repo but no longer on screen. Where the two disagree, the first part wins. Decisions are in `decisions.md` (TS-35 onward for this version); the review notes behind it are in the project files at `turn-sim-review/` (`compare-and-recommend.md`, `line-abreast/line-abreast.md`, `architecture/architecture.md`, `first-version/`).

# Part 1. First version: a 2-ship in line abreast with manoeuvre buttons

## 1. What it is

A 2-ship in line abreast that flies along on its own. You press a manoeuvre button and the pair flies it the way the SMM draws it, then carries on in line abreast until the next press. The camera follows the pair and each aircraft's ground track stays drawn. This is the first slice of live mode (TS-R1). From V2.7 a Setup option turns the pair into a 4-ship (Spread 4, section 8); the default stays the 2-ship. Plan mode, errors and the rest of V6's features come later, one at a time, on the same flying core (section 6).

## 2. How the aircraft fly

| # | Rule | Source |
|---|---|---|
| F1 | Every aircraft flies a pre-planned path that is kinematically accurate. The path is worked out when a button is pressed, from where each aircraft is at that moment. It is flown with realistic roll rate, bank, pitch and G, and the turn radius and rate follow from speed and G. Each manoeuvre uses the bank and G its source gives. | Patrick, 4 Oct 08:53Z (wording approved); TS-36 |
| F2 | Roll: the roll rate builds at 360°/s² up to 90°/s and eases off the same way, so 0 to 70.5° of bank takes about 1.0 s. Uses the shared `easeRoll`. | Patrick, 08:54Z and card 09:54Z; TS-37 |
| F3 | Speed: 220 KIAS held constant through every manoeuvre, flown as true airspeed at the block height (shared `iasToTasKt`). Speeds on screen say KIAS. The one exception is the training errors' Speed/power fix tool (section 9), flown with a smooth speed segment (`flight.js` `{ kind: 'speed', toKias, rateKtps }`). | Patrick card 09:54Z; 220 KIAS SMM 16.18 para 50; KIAS rule TS-R6; TS-38; Speed/power fix Patrick 4 Oct 11:42Z |
| F4 | Block height 8,000 ft for the IAS-to-TAS conversion (220 KIAS is about 248 KTAS there). **Estimate** until Patrick gives the low block height. | estimate; TS-38 |
| F5 | Turns: 70.5° bank, 3.0 G level, unless the manoeuvre says otherwise (the cross turn's first half, F6b). | SMM 16.18 para 50, Figs 16.15-16.21 "70/3"; TS-39 |
| F6 | Delayed turns use exact geometry: the second aircraft's turn start is calculated so it rolls out abeam at the starting spacing. This replaces the old Delayed 45 rule (ends slanted, then the wingman fixes). Both aircraft fly the same turn, so the wait is spacing ÷ speed × cot(half the turn) for a pair abreast; the planner uses the heading the turn really rolls out on, and rounds the wait to the 0.05 s step, so the roll-out is abeam to within a few tens of feet. | Patrick cards 09:53Z and 09:54Z; TS-40 |
| F6b | Cross turn: both turn toward each other for the first 90° at the same bank, set so they roll out abeam at the spacing they started at (about 53° and 1.7 G at 6,000 ft, near the SMM's "60/2, or as required"), then 70/3 to 180°. | SMM 16.19 para 64, Fig 16.21; TS-41 |
| F7 | Shackle and cross turn: the wingman climbs to pass 300 ft above Lead (**working answer:** above, not below), then returns to Lead's height after the cross. Lead stays level. The height change starts and ends with no climb rate and no vertical acceleration, so pitch and pitch rate carry on smoothly (shared `pitchDegFromClimb`). | Patrick card 09:52Z; SMM 16.19 paras 61, 64; 16.13 para 31; TS-42 |
| F8 | No V6 lag, lead or G-fix nudges. | Patrick card 09:53Z (settles TS-Q17); TS-43 |
| F9 | Still air. The screen says so in one line. | TS-R10 (Patrick, TS-Q6) |
| F10 | Fixed 0.05 s step, so the same presses at the same times give the same picture at any playback speed. Each step uses the mean bank over the step for the turn and the middle heading for the move, so a turn's roll-in and roll-out are mirror images. | TS-R9 |
| F11 | **Working answer:** a button pressed while a manoeuvre is still being flown is queued and flown the moment the current one ends (the screen shows "Next: Hook right"). Pressing mid-turn and re-planning from a banked state is a later step. | TS-45 |
| F12 | Every hand-over is smooth: where one part of a manoeuvre ends and the next begins (roll-in, roll-out, the cross turn's change of bank, the climb and descent, one manoeuvre to the next), position, track, bank and pitch and their rates carry straight on. A turn never snaps onto its new heading; it rolls out within a fraction of a degree of it (each turn aims at the whole degree). | Patrick 4 Oct 10:05Z (Traffic thread, carried here); TS-47 |

## 3. The manoeuvres (buttons)

Each button has a left and a right version unless noted. With #2 on Lead's right, a right turn is "into #2"; each button says into or away for the current side (SMM 16.19 paras 53-57 name them from Lead's side). R/T words are from 2 CFFTS Orders B2 ch 8 p.103.

| Button | How it is flown | Ends | Source |
|---|---|---|---|
| Delayed 90 | Outside aircraft rolls in first, 70/3, turns 90, rolls out. Inside aircraft holds straight, rolls in at the exact-geometry point, turns 90. | Line abreast on the new heading, sides swapped, same spacing | SMM 16.19 paras 52-54, Fig 16.15 |
| Delayed 45 | Outside aircraft turns 45 first; inside aircraft crosses ahead of Lead's new track, then turns 45 at the exact-geometry point. | Line abreast on the new heading, sides swapped | paras 55-57, Fig 16.16 |
| Check 20 | Both roll in together, turn 20°, roll out. **Working answer:** fixed 20° (the R/T example), angle box later (TS-46). | Same shape on the new heading; the line between them rotates 20°, so one ends ahead of abeam (spacing × sin 20°, about 2,050 ft at 6,000 ft) | para 58, Fig 16.18 |
| In place 90 | Both roll in together, turn 90, roll out. | In trail at the old spacing, judged in trail | para 59 |
| Hook | Both turn 180 the same way, 70/3. On speed and on spacing the fuselages are already lined up at the 90-degree point, so no G change is flown there; the SMM's G adjustment is the fix for an error and comes with the errors layer (TS-48). | Line abreast, same spacing, flying back the other way | para 60, Fig 16.19 |
| Shackle (one button) | Both turn 45 toward each other at 70/3; the wingman passes 300 ft above Lead; both turn back together. | Original heading, sides swapped (an X) | paras 61-63, Fig 16.20 |
| Cross turn (one button) | Both turn toward each other for the first 90° (F6b), cross with 300 ft vertical, then 70/3 to 180°. | Line abreast flying back the other way; each aircraft ends on the ground side the other started on, so #2 is still on the same hand of Lead | para 64, Fig 16.21 |

Not in the first version (later, in this order unless Patrick reorders): G-warm, entry to line abreast, rejoins, other formations. The 4-ship has its own buttons and is in section 8 (V2.7).

## 4. The screen

Picture: `turn-sim-review/first-version/screen-mockup.png` in the project files. V6's: `archive/2026-10-reset/1-requirements/agents/shots/turn-sim/v6-default.png` in the project files.

**On the screen**
- Top bar: Play/Pause, Reset, playback speed (0.25× to 4×), time, Fit (only while the camera is paused or its fit is off, section 10.2), 2D/3D, Layers.
- Left: the manoeuvre buttons (section 3), then Setup with three boxes: Formation (2-ship, the default, or 4-ship, section 8), Spacing (default 6,000 ft, the briefs' wide side; 4,000 to 6,000 is the SMM band) and "#2 on Lead's" Right or Left (default Right). Below them, one fixed line: "220 KIAS · 8,000 ft · 3 G turns (71° bank) · still air · roll 90°/s".
- Centre: the picture. The camera fits every aircraft with about 15% spare on each side and eases its zoom as they move; a pan or zoom pauses it until Fit or Reset (section 10.2). Ground tracks for the whole flight, a 1 NM ground grid, an info tag beside each aircraft, and the planned paths drawn dashed while a manoeuvre is flown.
- Layers (closed menu): ground tracks (on), Lead 3/9 line (off), Lead 7 and 5 o'clock lines (off), planned path (on), turn circles (off), info tags (on), fit all aircraft (on), 3D paint. Before V2.16 the 3/9 line was on.
- Right, the Formation card: what is being flown and who goes first; spacing, sweep and height difference now; the last roll-out judged (on spacing, wide, tight, fore, aft, with the numbers), judged only after roll-out; each aircraft's KIAS, heading, bank and G.
- Start: Lead flying 000 at 220 KIAS, #2 abeam on the right at 6,000 ft, paused at t = 0. Press Play or any button to start.
- Keys: Space plays or pauses, Home resets (only while the Turn Sim is open and not typing).
- The 3D view shows the same flight: height (the vertical miss), signed bank and pitch, the camera centred on the pair.

**Removed from the plan-mode screen** (kept in the code until the new core replaces it, then retired with Patrick's yes): formation preset, start heading, turn menu, direction, speed and G boxes, timing and clock-cue menus, the 27-box Aircraft errors panel, the 26-box Turn Sim settings menu, Profiles placeholder, Step, Fit (the camera follows instead), breadcrumbs, NM labels, spacing lines, clock marks, error labels, the MOA box, Follow Lead (always follows). 91 controls became about 20.

## 5. When things go wrong

- A Spacing typed outside 1,000 to 20,000 ft is refused with a one-line reason and the old value kept. Outside the SMM's 4,000 to 6,000 ft it is flown and flagged (references, not walls).
- Saved screen choices from the plan-mode screen are not read (the layout's version changed); the defaults are used.
- No outside data is used, so there are no stale-data cases.
- A Delayed turn pressed when the pair is not abreast (after an in-place turn, in trail) still rolls out abeam: the planner picks whichever order gives a forward wait.

## 6. Built so V6's features can bolt on later

- Aircraft are a list with "who flies off whom" (`ref`), never numbers 1 to 4 in the logic, so the 4-ship and offset box add aircraft, not rewrites.
- Every step's state is recorded in a rolling record (the last 10 minutes), which the spacing graph and the spreadsheet export will read.
- Each manoeuvre is one small path-builder in `src/modules/turn-sim/live/manoeuvres.js`; a new button is a new builder.
- The V6 feature list is on `future.md`.

Code: `src/modules/turn-sim/live/flight.js` (one aircraft, one step), `live/manoeuvres.js` (the builders), `live/formation.js` (the formation, presses, tracks), `live/slots.js` (the one slot table, 2- and 4-ship), `live/judge.js` (the one classifier and judge, which the card, the roll-out verdict and the tags read), `live/tuning.js` (every closure rate, bank, timing and speed the planners use, with sources), `live/tracker.js` (the tracker, the fallback for odd starts), `live/hand-over.js` and `live/line-moves.js` (lines, then tracker, TS-65), the closure rates and the Rates choice in `live/tuning.js` (`REJOIN_CLOSURE_KT`, `CLOSE_IN_SEC`, `HAND_OVER_FT`, TS-65), `live/four-ship.js` and `live/four-ship-card.js` (the 4-ship, section 8), `live/errors.js` (training errors, section 9), `index.js` (the mount), `layout.js` (the screen), `view.js` and `view3d.js` (the pictures). Shared math only from `src/core/` (`easeRoll`, `turnRateFromBankRadPerSec`, `gFromBankDeg`, `bankDegFromG`, `turnRadiusFromBankFt`, `pitchDegFromClimb`, `iasToTasKt`, `wrapPi`).

## 7. Checks (light, per the rule book)

Pilot-recognisable end pictures only (`tests/unit/turn-sim/live.test.js`): each button, both directions and with #2 on either side, ends in the picture in section 3 (who is where, which way they face, spacing within ±100 ft of the start, heading within ±5°); bank never passes the manoeuvre's bank by more than half a degree and G stays at 3; the shackle and cross turn keep at least 300 ft vertical at the cross; every hand-over is smooth (F12: no jump in position, track, bank or pitch, roll rate within 90°/s, its build-up within 360°/s², pitch rate never stepping by more than 0.5°/s, about 0.1 G); a press while flying is queued. No time gates. CI on the pull request is the one check. Sign-off: Patrick flies every button in the real app from the default start. The 4-ship's checks are in `tests/unit/turn-sim/four-ship.test.js` (section 8).

## 8. The 4-ship (Spread 4), from V2.7

Patrick, 4 Oct 10:51Z: "an option to transition to a 4 ship and do all the four ship manoeuvres, same set up". Decision TS-50. Everything in sections 2 to 7 holds for the four (one flying core, the same roll, bank, speed and smooth hand-overs, the follow camera, ground tracks, planned paths, the Formation card, 3D); this section says only what is different.

**The option.** Setup has a new first box, Formation: 2-ship (the default) or 4-ship. Choosing one starts again from t = 0 at that formation's default start. A mid-flight change from one to the other (the transition itself) is designed separately and is not built here.

**The start (default).** Lead flying 000 at 220 KIAS; four aircraft side by side, one spacing between neighbours (default 6,000 ft, the wide side, AFM7 and AFM8 briefs p.15); paused at t = 0.

| Item | What | Source |
|---|---|---|
| Line | Spread 4 is four-plane line abreast: #2 and #3 fly LAB off Lead, #4 flies LAB off #3. The whole line is three gaps (the SMM draws 12,000 to 18,000 ft) | SMM 16.42 paras 113, 116, Fig 16.33 |
| Sides | #2 on Lead's right (the default): from behind, left to right, #4 #3 Lead #2 (the SMM's Spread 4 "West"). #2 on Lead's left: #2 Lead #3 #4 (the SMM's "East", the briefs' picture) | SMM Fig 16.33; AFM8 brief p.14; Patrick TS-44 |
| Altitude stack | 300 ft steps, low to high 4, 3, 1, 2: #2 +300, Lead 0, #3 -300, #4 -600 against Lead, kept through every turn. Same on either side (**working answer**: the SMM says #2 sets the stack and #3 and #4 take the opposite block, and its example has #2 below) | AFM8 brief p.14-15; SMM Fig 16.33 |
| Spacing box | The one Spacing box is the gap between every neighbour pair | SMM Fig 16.33 |

**The buttons.** Delayed 90, Delayed 45, Check 20, In place 90 and Hook, each Left and Right with the same into or away words (from #2). The briefs list 90, hook and 45 (AFM8 brief p.13, p.17-18); the SMM approves in-place and check turns too (SMM 16.43 para 118). The shackle and the cross turn are not approved in Spread 4 and have no button. Each button's source is its 2-ship row in section 3 plus:

| Button | How the four fly it | Ends | Source |
|---|---|---|---|
| Delayed 90 | The aircraft on the outside of the turn goes first, then each next one in towards the turn: #2, Lead, #3, #4 for a right turn and #4, #3, Lead, #2 for a left turn with #2 on Lead's left (the mirror with #2 on the right). Each waits spacing ÷ speed × cot 45° (14.3 s at 6,000 ft and 248 KTAS) after the one before, the 2-ship's exact-geometry wait (F6), so each rolls out abeam of the one before | Line abreast on the new heading, order reversed (sides swapped), one spacing between neighbours | AFM8 brief p.17; SMM Fig 16.34, 16.19 paras 52-54 |
| Delayed 45 | #2 (the outside aircraft) turns 45 first. Every other aircraft in turn flies a 10° check turn toward the aircraft ahead of it in the order, then turns to the new heading, each waiting so that it rolls out abeam of the one before. **Working answer:** 10°, the low end of the brief's "10 to 15" | Line abreast on the new heading, sides swapped. The check's S-curve costs a little room, so the first aircraft to check rolls out a little tight of #2 (about 200 ft at 6,000 ft); the brief says fix spacing on roll-out. A Setup tick box, shown only in the 4-ship, "Delayed 45 with the check turn" (on by default), flies it without the check when cleared: a plain chain of standard 45s, each rolling out abeam of the one before at one spacing | AFM8 brief p.18; SMM Fig 16.34; kept as built and toggle asked for by Patrick, 4 Oct 11:27Z and 11:28Z |
| Check 20 | All four roll in together, as the 2-ship | The same line on the new heading, the line between neighbours turned 20° | SMM 16.19 para 58, 16.43 para 118 |
| In place 90 | All four roll in together, as the 2-ship | A column of four in trail, one spacing between each, judged in trail | SMM 16.19 para 59 |
| Hook | All four turn 180 together at 70/3. No G change on spacing, as TS-48 | Line abreast flying back the other way, same gaps | AFM8 brief p.18; SMM 16.45 para 121 |

A delayed turn pressed when the four are not abreast (after a check or an in-place turn) is flown without the check turn and still rolls each aircraft out abeam of the one before it in the order (the earliest to turn goes first).

**The screen.** Only the buttons the formation has show (the shackle and cross turn are hidden in the 4-ship), and a second fixed line under Setup gives the stack. The camera fits all four (section 10.2). The Formation card has a line for each wingman against the aircraft it flies off (#2 and #3 off Lead, #4 off #3), the heights above Lead, and the last roll-out judged for each wingman in words and numbers, by the 2-ship's rule (ON SPACING, TIGHT, WIDE, FORE, AFT; IN TRAIL after an in-place turn). 3D shows all four on their stack.

**When things go wrong.** The shackle and cross turn are refused in the 4-ship (a press throws; the screen has no button). A Spacing outside the SMM band is flown and flagged, as in section 5. Lead, #2, #3 and #4 are always the same ids, so the card, the colours (white with an outline for #4) and the tracks match the 2-ship.

**Checks (light).** `tests/unit/turn-sim/four-ship.test.js`: the start picture and stack; the end picture of every button, both ways, with #2 on either side; who turns first, and the wait between them; the delayed 45's check turn; bank and G limits for all four; no two aircraft within 300 ft vertically and horizontally of each other (SMM 16.13 para 31) and the stack held; every hand-over smooth for all four; a press while flying queued. No time gates.

### 8.1 G-warm and changing formation, 4-ship (V2.13, TS-54, built 4 Oct, not yet in Patrick's sign-off)

Patrick, 4 Oct 17:10Z and 17:19Z ("Continue four ship"): the planned part of the four-ship design (project files `turn-sim-review/four-ship/design.md`, sections 5.2, 5.5, 5.6, 6 and 7, with his answers at its end). Everything is planned at the press, like the 2-ship's changes (section 10): Lead flies ordinary segments and each wingman's path is a recorded dry run of the 2-ship's tracker flying to its place off the aircraft it flies off, through the same flight step, so the path drawn is the path flown. Numbers with no page or ruling beside them are **estimates**. Speeds are indicated (KIAS) unless they say otherwise.

**G-warm (from Spread 4).** One button, G-warm, in the 4-ship only, pressable in Spread 4 (greyed elsewhere, with the reason). All four fly it together on the stack:

| Step | What | Source |
|---|---|---|
| Standby | 15 s straight (estimate) | AFM8 brief p.16 |
| In place 90 | Toward #2, 3 G | SMM 16.22 para 71, 16.44 para 120; AFM8 brief p.16 items 1-2 |
| Push over | Half a G for 5 s, wings level: the flight path follows V dγ/dt = g(n − cos γ) at constant speed (standard aerodynamics); the G eases in over 1.5 s and out through 1.5 G (estimate) back to level flight. The four sink about 280 ft and end level (estimate: the SMM gives no figure) | SMM 16.22 para 71 |
| Hook | The other way, 4 G | SMM 16.22 para 71 |
| Complete | 4 s straight (estimate) | AFM8 brief p.16 |
| In place 90 back | 3 G, onto the starting heading | SMM 16.22 para 71 |
| Tighten | Each wingman closes to 4,000 ft off the aircraft it flies off: a 10° heading change at 30° bank (the training errors' lateral fix, estimates) | AFM8 brief p.16 item 5 |

The 4 G hook is flown as the SMM gives it; the Orders' 3 G for more than two aircraft (2 CFFTS Orders B2 ch 8 p.98) is a reference, not a wall. The card shows the step and the G it calls for, and after it the G flown against each call. After a G-warm the four's spacing is 4,000 ft until Reset or a Setup change.

**The buttons.** In the 4-ship the Change formation group has: Spread 4, Fighting wing, Fluid 4, Fluid manoeuvring (greyed, "coming later": the live build), Offset box, Finger, Echelon, Box; under More: Line astern, Route and the rejoin choice, "Turning, Lead turns into the others" (the default, Patrick 11:09Z) or "Straight ahead". The Side switch sets #2's side at the end (Keep, L, R). The button for where the four are is greyed. The manoeuvre buttons fly from Spread 4 (or a column after an in-place turn) and are greyed elsewhere, with the reason.

**The places.** One table (`live/slots.js`, shared with the 2-ship since clean-up step 1, TS-64); each wingman is placed off the aircraft it flies off:

| Formation | Places | KIAS | Source |
|---|---|---|---|
| Spread 4 | As section 8, at the spacing | 220 | Patrick 11:08Z; SMM 16.42 |
| Fighting wing | #2 off Lead at 45°, #3 off #2 at 30°, #4 off #3 at 30°, every link 650 ft (the defaults; settings, section 10.4); #3 and #4 on the side opposite #2. Entered from Spread 4 or the offset box the stack is kept; from a close formation each is 60 ft below the one it flies off (estimate) | 200 | Patrick 11:44Z (estimates until Dad says); SMM 12.29 para 69, 16.38 paras 104-107 |
| Fluid 4 | #3 abeam Lead at 6,000 ft on the side opposite #2; #2 in fighting wing on Lead, #4 in fighting wing on #3 at 45°, outside; on the stack | 200 (estimate) | AFM8 brief p.20 |
| Offset box | #2 abeam Lead at the spacing; #3 7,000 ft behind Lead, half a spacing toward #2's side; #4 abeam #3 at the spacing on #2's side; on the stack. The box is on #2's side (estimate) | 220 (estimate) | AFM8 brief pp.21-22; SMM 16.41 paras 109-110; TS-18 |
| Finger | #2 in echelon on Lead, its side; #3 in echelon on Lead, the other side; #4 in echelon on #3, outside. Named by the side #3 and #4 are on ("finger left": #3 and #4 left) | 200 | SMM 16.32; AFM7 brief p.19 |
| Echelon | All three on #2's side, each in echelon on the one ahead | 200 | SMM 16.32 paras 87-88 |
| Box | Finger with #4 in line astern on Lead | 200 | SMM 16.32 para 91; AFM7 brief p.20 |
| Line astern | Each in line astern on the one ahead | 200 | SMM 16.32 paras 89-90 |
| Route | Finger opened to route (2 wingspans out) | 200 | SMM 12.6 para 15; AFM8 brief p.9 |

The close places are the 2-ship's (section 10: echelon 45 ft out, 25 ft back, 5 ft down; line astern 10 ft nose to tail; estimates); #4 goes a further 10 ft low when it crosses (estimate).

**The moves.** A press flies the cheapest way there through the moves the manuals give (the design's section 6 graph; each move's rough cost is an estimate used only to choose the route), one leg after another, joined on the exact step. "Wait for the one ahead" (SMM 16.32 para 86, 16.34 paras 95-96; AFM7 brief p.18 item 2d) is a gate: a wingman starts when the one ahead has arrived, or a new leg starts when everyone has settled.

| From to | How | Source |
|---|---|---|
| Spread 4, offset box or no formation to fighting wing | Turning rejoin (R3, F11): Lead slows to 200 KIAS, pauses while #2 closes, then turns 30° toward #2 at 30° bank (the first of 30, 45, 20 and 60° that keeps every wingman out of the overshoot lane, as the 2-ship); #3 and #4 rejoin too, holding the stack. If no turn keeps the lane, or "Straight ahead" is chosen, Lead flies straight and the card says so | AFM7 brief p.17, AFM8 brief pp.19, 25; SMM 12.26 paras 62-63 |
| Fighting wing to finger | Turning rejoin (R2, the default): Lead turns 90° (estimate) into #2 at 30° bank; #2 joins first; #3 joins once #2 is in, coming off the stack while it waits; #4 once #3 is. Straight ahead (R1): each closes through route in turn, #2 first, the stack coming off as they close, then into finger | SMM 16.34 paras 95-96, 16.38 para 106; AFM7 brief pp.18, 21; SMM 16.15 para 38 |
| Fighting wing to route | Close through route in turn (R1) | AFM7 brief p.18 item 2 |
| Finger and route | A slide out or in, all at once | AFM8 brief p.9 |
| Finger to echelon, and back | Echelon on #2's side: #3 and #4 drop back and down, pass behind and below #2 and Lead, #4 lower and behind #3, and take echelon (F2). The other side: #3 and #4 move out first, then #2 crosses behind and below Lead (F1). Back is the reverse (estimate: the manuals give one way) | SMM 16.32 paras 87-88; AFM7 brief p.19 |
| Finger to box, and back | #4 moves back and down behind #3 into line astern on Lead | SMM 16.32 para 91; AFM7 brief p.20 |
| Finger to line astern, and back | #3 drops back, #2 crosses behind Lead, #3 behind #2, #4 behind #3; back the other way | SMM 16.32 paras 86, 89-90 |
| Finger or echelon to fighting wing | Drop back, then across into place (F6); no stack | SMM 16.32 para 92, 16.38 para 105 |
| Fighting wing or finger to Spread 4 | Lead speeds up to 220 KIAS; the wingmen open out to one spacing each, the stack going on; from finger #3 waits for #4 to start moving out (10 s, estimate) | AFM7 brief p.15, AFM8 brief p.15; SMM 16.18 para 51, 16.42 para 114 |
| Fighting wing to Fluid 4, and back | "Fluid 4, go": #3 diverges to 6,000 ft abeam Lead, #2 and #4 stay in fighting wing on the outside (F8); back is the reverse (estimate) | AFM8 brief p.20 |
| Fluid 4 to offset box | "For offset box, in place 90": both elements turn in place 90 toward #2's side, then Lead speeds up and the elements spread to line abreast with the second element 7,000 ft back (F9) | AFM8 brief pp.21-22; SMM 16.41 paras 109-110 |

Not every pair is direct: for example Spread 4 to finger is a turning rejoin to fighting wing, then a turning rejoin to finger; finger to finger on the other side goes through echelon (the SMM does not authorise finger to finger, SMM 16.33 para 93); fighting wing to echelon goes through finger (a simplification; the design has a direct rejoin). The card's note names every leg.

**Height and speed.** Stack changes average no more than 15 ft/s (900 ft/min; estimate), so they never snap. Speed changes only inside a change, with the smooth speed segment (full power up, the slow-down model down, TS-61, section 10.5; 1.5 kt/s until V2.20).

**The card.** Now: where the four are, in words. Flying: the change and the route, the note naming each leg, and about how long is left. Each wingman's line reads off the aircraft it now flies off (#3 off #2 in fighting wing, #4 off Lead in the box). The end is judged link by link (design section 7): Spread 4 and the offset box's elements on spacing (±100 ft) and sweep (0-10°), the box's second element 6,000-8,000 ft back and within 500 ft of its slot sideways (estimate), the stack ±100 ft; fighting wing links 500-1,000 ft and 30-60° with the shared ±100 ft and ±5° round them (the 30° default is the band's flat end), on the right side; the close formations by the 2-ship's table. Flags, never walls: Lead above 4 G in fighting wing or 3 G in a close formation (2 CFFTS Orders B2 ch 8).

**When things go wrong.** A press with no safe plan is refused in one line on the card and nothing moves: no route the manuals give, a plan longer than 8 minutes (a catch only), a plan that would end outside the band, or a wingman that could not settle. Fluid manoeuvring is greyed. A turning rejoin that can't keep the overshoot lane is flown straight ahead and the card says so. From a picture that is no formation (after an in-place turn) the four rejoin to fighting wing first, on the side #2 was last seen. A press during a change is queued, as the 2-ship's.

**Not built here** (`future.md`): manoeuvring inside the offset box and Fluid 4; live fighting wing and fluid manoeuvring (the next piece); fighting wing to echelon direct; finger to offset box direct and "offset box east/west" from fighting wing; rejoin mistakes; the 2-ship G-warm.

**Checks (light).** `tests/unit/turn-sim/g-warm.test.js` and `tests/unit/turn-sim/four-ship-changes.test.js` (`testing.md`, "4-ship G-warm and changes").

## 9. Training errors (TS-52, added 4 Oct, not yet in Patrick's sign-off)

A training aid, behind a closed "Errors (training)" section in the Manoeuvres panel. Default off: with every error "none" the screen and the flying are exactly as in sections 1 to 7.

| Setting | Default | Range | What it does | Source |
|---|---|---|---|---|
| Fore/aft | none | ahead, behind; amount 100 to 3,000 ft (default 1,200) | #2 starts that far ahead of ("acute") or behind ("sucked") the SMM slot, along Lead's heading. The working reading of those two words is Patrick's to confirm. | SMM 12.18 para 39 (station-keeping terms), 16.18 para 49 (bands); amount: estimate |
| Spacing | none | wide, tight; amount 100 to 3,000 ft (default 1,500) | #2 starts that far wider or closer than the Spacing box. | SMM 16.18 para 49, 16.19 para 54 NOTE; amount: estimate |
| Height | none | high, low; amount 100 to 2,000 ft (default 500) | #2 starts that far above or below Lead. | SMM 16.13 para 31; amount: estimate |
| Speed | none | fast, slow; amount 5 to 40 KIAS (default 20) | #2 starts that much faster or slower than Lead (V2.20, TS-62). In the manoeuvres he brings his speed back to Lead's in the turns; in the hot turning rejoin see section 10.5. | Patrick 19:15Z ("fast"); amount: estimate, the top of EFIG p.374's 10-20 KIAS |
| Timing | none | late, early; amount 0.5 to 10 s (default 2) | #2's first roll-in goes that late or that early. Early beyond the button press makes Lead wait, so the press time is not moved. | SMM 16.19 paras 58, 62; amount: estimate |
| Response | Fix it | Turn at normal reference, Fix it | See below. | Patrick 4 Oct 10:51Z |
| Fix tools | all four ticked | Geometry, Vertical, Lateral spacing, Speed/power, each on or off | What #2 may use to fix it (below). Shown only when the response is Fix it. | Patrick 4 Oct 11:42Z; limits: estimates |
| Random error | off | on, off | At Reset, picks one error of a random kind, a random way and a random size (fore/aft 500 to 2,500 ft, spacing 1,000 to 2,500 ft, height 300 to 1,000 ft, timing 2 to 6 s, speed 10 to 30 KIAS). The card says which. | Patrick 10:51Z (training aid); ranges: estimates |

**Turn at normal reference.** #2 flies the standard manoeuvre, standard timing and bank, from where he is. The error is carried through: the end picture is the SMM picture plus the start offset, turned with Lead's heading change. (SMM 16.19 para 52 NOTE: the wingman who does not adjust keeps the error.)

**Fix it.** #2's plan is computed at the button press, as for every other manoeuvre, to end in the SMM picture. The Geometry levers (V2.8, flown at constant speed) are: a delay before the roll-in (at most 30 s), the shackle's reversal time (plus or minus 20 s), bank on each half of the turn (50 to 75°, which is 1.6 to 3.9 G; above 3 G is flagged, not walled), and for height a smooth climb or descent (at most 60 ft/s, no step in climb rate). "Closer, turn early; wider, delay" is SMM 16.19 para 54 NOTE; "adjust the G or the anticipated heading" is para 52 NOTE; check turn gains LAB, para 58; shackle reversal timing, para 62; cross turn, para 64. The limits are estimates. A single turn is solved as two half-turns, so the bank can change at the 90° point (TS-48), with the bank change rolled smoothly (F12).

**Fix tools** (V2.10; Patrick 4 Oct 11:42Z: "I want there to be an options menu on the tools 2 can use to fix including geometry, vertical, speed/power, and changing lateral spacing"; the wording below is the draft waiting for his yes). When the response is "Fix it", a "Fix tools" list under Errors (training) sets what #2 may use. All four start ticked. Untick one to practise fixing without it. #2 uses the ticked tools in the order a pilot would, smallest change first. If the ticked tools can't take the whole error out, the card says what is left and which tool would have fixed it.

| Tool | What #2 does | Limits (all estimates unless sourced) |
|---|---|---|
| Geometry | Changes when he rolls in and how hard he turns: an earlier or later roll-in, more or less bank, the shackle's reversal point | Bank 50-75° (1.6-3.9 G), flagged above 3 G; roll-in up to 30 s late (V2.8's limits) |
| Vertical | Climbs or descends smoothly to Lead's height, and with Speed/power ticked, dives a little to gain speed or zooms to lose it | Up to 60 ft/s climb or descent; a dive or zoom of up to 500 ft, back on height after, with no more than 0.3 G of push or pull (estimates) |
| Speed/power | Adds or takes off power for a while to close a fore/aft gap, then matches Lead again. The change is a smooth ramp, the same as in formation changes | Up to ±20 KIAS from Lead's speed; speeds up at the T-6's full-power figure, slows on power (the slow-down model, section 10.5, TS-61; until V2.20 a fixed 1.5 kt/s) |
| Lateral spacing | After the roll-out, a small heading change in or out (a few degrees, then back) to open or close to the set spacing | Up to 10° heading change at 30° bank, sized so the straight leg takes about 20 s (estimates) |

Nothing is clipped or snapped: every fix is a flown path with smooth hand-overs, roll 90°/s.

How it is flown. Geometry is the V2.8 fix above. Vertical is the smooth height leg; in a crossing turn #2 still makes the 300 ft miss with Vertical unticked, he only doesn't come back to Lead's height. Lateral spacing and Speed/power are the roll-out fix ("fix any spacing or sweep errors on roll out", AFM8 brief p.18): they start when #2's own manoeuvre and its height legs are done. Lateral takes out what is left across Lead's heading (turn, hold, turn back, like the shackle); Speed/power what is left along it, including the little the heading change costs. Both are worked out from dry runs of the whole plan, so the plan is exact for what is flown. The speed change is the smallest that does it, up to 20 KIAS, then held longer. Speeding up is checked against the T-6A's full-power excess thrust (core `excessThrustPerWeight`, fitted to the sustained turn chart): about 1 KIAS/s at 220 KIAS and 8,000 ft, falling under 0.5 at 240, so 20 KIAS takes most of a minute on power alone. With Vertical ticked, a dive of about (V/g) x the speed change (about 500 ft for 20 KIAS) pays for the speed and a zoom gives it back, flown over the same seconds as the speed change, so the energy (energy height, standard aerodynamics) adds up. A gap under 50 ft is left alone (the card names nothing under 50 ft). Every number of the tools is in one constant, `FIX_LIMITS` in `errors.js`, so it is easy to change once Patrick answers.

**When the error is too big to fix.** With every tool ticked the tools reached the SMM picture (±100 ft) in every case tried (the seven buttons, each error). With some unticked, for example a fore/aft error in the check turn with only Geometry, #2 flies the nearest he can, the Formation card says "fixed part of it", gives the distance left and names the unticked tool (or the fewest tools together) that would have taken it out. Nothing is clipped or snapped.

**On the card.** The Formation card gains two lines: which errors are set and the mode, and, after roll-out, what happened ("#2 fixed it and ended in position", "#2 fixed part of it and ended 340 ft behind", or "#2 turned at the normal reference, so the error carried through"), plus any flag (G above 3, 3-D separation under 300 ft at the cross).

**Failure and stale data.** A bad or missing error value is treated as "none" or the default amount; an unreachable fix is flown as near as possible and reported, never hidden. No outside data is used.

Code: `src/modules/turn-sim/live/errors.js` (the offsets, the two modes, the Fix tools, the card text); the speed segment in `live/flight.js`; small hooks in `live/formation.js` (build, start, finish), `layout.js` (the Errors section and card lines) and `index.js` (settings and `cardFor`).

## 10. Changing formation (2-ship)

**What it does.** A new "Change formation" group of buttons sits above the manoeuvre buttons: Line abreast, Fighting wing, Echelon, Route and Fluid manoeuvring, plus a Side switch (Keep, L or R). Press one and the pair flies the manuals' transition from whatever formation they are in now. Where the manuals don't join two formations directly, the transition goes through an in-between formation, for example fighting wing to echelon through route (from-to table, `design.md` section 4). The button for the current formation is greyed out. Line astern and the rejoin options sit behind "More".

**How it flies.**
- **Planned paths:** every transition is planned when you press the button, in the same style as the manoeuvres: pre-planned paths, roll 90°/s, and smooth hand-overs with no jump in position, track, bank, roll rate, pitch rate or speed.
- **Speed:** the pair flies 200 KIAS outside line abreast and 220 KIAS in line abreast (SMM 12.23 para 53, SMM 16.18 para 49; Patrick 11:08Z). Lead slows or speeds up during the transition. Speed changes are smooth ramps, and they happen only during transitions (Patrick 11:09Z). Speeding up uses the T-6's full-power figure from the core. Slowing down uses power, the speed brake and idle in Patrick's order (section 10.5, TS-61; until V2.20 a fixed 1.5 kt/s).
- **Rejoins:**
  - The default rejoin from line abreast is a turning rejoin: Lead turns into #2, and #2 rejoins to fighting wing (SMM 16.20 para 65, Fig 16.25; AFM7 p.17; Patrick 11:09Z).
  - Pressing Echelon from line abreast flies the hot turning rejoin straight to echelon (SMM 16.20 para 66).
  - #2 overtakes Lead by 10-20 KIAS in a turning rejoin (EFIG p.374) and 20-30 KIAS straight ahead (EFIG p.371), and stays below Lead.
  - #2's bank in a rejoin is capped at 60°, an estimate, flagged on screen and never a wall.
- **Entering fluid manoeuvring:** from fighting wing only, by Lead's 30° turn, then max power (AFM7 p.17); greyed in every other formation (section 10.3, TS-57). ~~From echelon by the 2-second break (SMM 16.17 para 43); from line abreast through fighting wing.~~
- **After a change:** the manoeuvre buttons work only in line abreast for now; they are greyed out in other formations. Fighting wing and fluid manoeuvring themselves (Lead's moves, #2 staying in the cone) are a separate step.

**The positions** (the formation counts as established when #2 is inside these):

| Formation | #2's position | Source |
|---|---|---|
| Line abreast | 4,000-6,000 ft abeam, 0-10° sweep | SMM 16.18 para 49 |
| Fighting wing | 500-1,000 ft, 30-60° sweep, below Lead; default 750 ft and 45° (estimate; a setting, section 10.4) | SMM 12.29 para 69 |
| Route | 4 to 6 wingspans out on the wing-tip line, the slot 5 (Patrick 5 Oct 06:11Z, TS-65); the SMM gives 1 to 3 | SMM 12.6 para 15 |
| Echelon | about 45 ft out, 25 ft back, 5 ft down (estimate; the manual gives sight references, not feet) | SMM 12.4 paras 11-12 |
| Line astern | directly behind and below, about 10 ft nose to tail | SMM 12.5 para 13 |

**Screen.**
- **Formation card:** shows "Now:" and "Flying:". During a rejoin it adds range, closure, Lead's clock position, ON LINE, HOT or COLD (hot and cold at 60° and 30°, estimates), and height against Lead. After each change, the card judges the new formation against the table above.
- **Camera:** ~~zooms in by itself when the pair is closer than about 1,000 ft~~ replaced in V2.16 by the fit-all camera (section 10.2).

**Flags, never walls.**
- Lead above 4 G in fighting wing or fluid manoeuvring, and above 3 G in close formation (2 CFFTS Orders B2 ch 8; Gen Book p.11).
- #2 at or above Lead's height during a rejoin (SMM 12.27 para 65).
- Less than 500 ft separation in fluid manoeuvring (SMM 16.13 para 31).

**When things go wrong.**
- **A press while a change is flying** waits its turn, as the manoeuvres do (TS-45).
- **A picture that fits no formation:** the planner works out the nearest formation from the pair's real positions. If none fits, it flies a rejoin from wherever #2 is.

**Not in this step:** the Overshoot button and rejoin mistakes (to `future.md`), the 4-ship changes (their own design), fighting wing and fluid manoeuvring flying (their own design).

**Checks (light):**
- every from-to pair ends in the target formation's band;
- smooth hand-overs, including through speed changes;
- #2 never above Lead in a rejoin;
- bank never past the cap.

No time gates. A generous limit of 3 minutes per change catches a planner that never finishes (estimate).

**Confirmed by Patrick, 4 Oct 11:45Z ("Agreed").**

**As built (first build, version badge not yet bumped; all numbers below with no manual or ruling behind them are estimates).**
- **The buttons.** "Change formation" sits above the manoeuvre buttons: Line abreast, Fighting wing, Echelon, Route, Fluid manoeuvring (greyed, "coming later": live fighting wing and fluid are a later step) and the Side switch (Keep, L, R). Line astern and the rejoin choice are behind "More". The button for the formation the pair is in is greyed ("You are here"). The manoeuvre buttons are greyed in fighting wing, echelon, route and line astern, with the reason beside them; after an in-place turn (in trail) they work as before.
- **How it plans.** Lead flies ordinary segments (a speed change, and in a turning rejoin a pause then a 30° turn into #2). #2's path is worked out by a dry run in which #2 flies toward its slot in Lead's frame the way a pilot would (small heading changes for slides, bank for the rejoin), through the same flight step as every other aircraft; the bank and speed it commanded are recorded and replayed, so the path drawn is the path flown. Code: `live/transitions.js` (planner, `planGoTo`; the dry run is `live/tracker.js` since clean-up step 1), `transitions-panel.js` (buttons and card lines), small hooks in `live/formation.js`, `layout.js`, `index.js`, `view.js`.
- **The from-to routes** (design section 4): station changes between echelon, route and line astern by slides of about 5 kt (8 ft/s, estimate) crossing behind and below Lead; drop back and sweep out to fighting wing at about 12 ft/s; close through route from fighting wing at a 10-20 KIAS overtake, slowing to about 5 kt at route; entry to line abreast with Lead accelerating to 220 KIAS at full power while #2 turns away to open out; from line abreast a rejoin to fighting wing first, flown straight through it for the hot turning rejoin to echelon. A change of side (the Side switch) is made behind Lead in the formation the pair is in, never across his nose.
- **The turning rejoin.** Lead slows to 200 KIAS, pauses until #2 has closed to about 2,000 ft ("Lead will pause, allow No. 2 to establish closure", AFM8 brief p.19), then turns 30° into #2 at 30° bank (SMM 12.24 para 54). #2's bank is capped at 60° (estimate); its overtake is 15 KIAS (EFIG p.374). The planner takes the first turn that keeps the overshoot lane (inside 1,000 ft #2 never more than 100 ft ahead of Lead's 3/9 line, and below Lead inside 2,000 ft); if none does, Lead holds straight and #2 flies the straight-ahead rejoin (SMM 12.26 paras 62-63). The rejoin choice under More is "Turning, Lead turns into #2" (the default) or "Straight ahead". Turning away, in-place turns, hot and cold line choices and an overtake box are not built (`future.md`).
- **Rates** (More, 2-ship; TS-65): Student, Instructor (default) or AI sets the closures only: a rejoin's 15, 25 or 50 kt to about 500 ft from the slot, then the close-in rate (route to echelon in about 10, 5 or 2.5 s, the AI's limited by the 30° close-move bank). Numbers in `live/tuning.js`.
- **The slots** (where the planner sends #2, all estimates inside the table's bands): fighting wing 750 ft at 45° sweep by default (a setting, section 10.4), 60 ft below Lead; route 5 wingspans (about 167 ft) out, 25 ft back, 5 ft low (Patrick 5 Oct 06:11Z, TS-65; 2 wingspans until V2.22); echelon 45 ft out, 25 ft back, 5 ft down; line astern 43 ft centre to centre (10 ft nose to tail), 8 ft low; line abreast the Setup spacing.
- **The card.** "Now:" (the formation the pair is in, read from where #2 really is), the existing "Flying:" line (for a change, "Line abreast right to Echelon right (hot turning rejoin)"), the rejoin block during a rejoin from line abreast (range, closure, Lead's clock position and ON LINE / HOT / COLD at 60° and 30°, #2's height against Lead), the flags (Lead's G over 4 in fighting wing and over 3 in close formation; #2 at or above Lead's height inside 2,000 ft; #2 at the 60° bank cap), and, once the change ends, the judgement against the table above. During a rejoin the picture draws a dashed range ring around Lead and a closure arrow on #2. The camera keeps every aircraft in view (section 10.2; before V2.16 it zoomed in by itself under about 1,000 ft apart).
- **When it cannot be planned.** Nothing changes; the card says why in one line ("No safe rejoin from here: ..."), for example when the plan would take more than 3 minutes or ends outside the band. A press while a change is flying is queued, as the manoeuvres are (TS-45). A pair that fits no formation (in trail, mid-turn) is planned as a straight-ahead rejoin from where #2 is. Training errors are not applied to a change, except to the 2-ship hot turning rejoin from line abreast (V2.20, section 10.5).
- **Speed.** Lead's speed changes use `{ kind: 'speed', toKias, rateKtps }` segments; until the shared one in `live/flight.js` is swapped in, `flyStep` in `live/transitions.js` flies them itself (marked TEMPORARY there).
- **Checks.** `tests/unit/turn-sim/transitions.test.js` (a handful, no time gates): every from-to pair ends in the target's band at 200 KIAS (220 in line abreast); smooth hand-overs through speed changes; #2 below Lead and in the overshoot lane in a rejoin, bank inside the caps; the queue.

### 10.1 Hot turning rejoin, fighting wing turns and the SMM's moves (V2.15, TS-55, built 4 Oct, not yet in Patrick's sign-off)

Patrick's rulings of 4 Oct, 18:00Z to 19:26Z. Each is listed in the project files at `turn-sim-review/requirements-log.md`, rows 7-13. Numbers with no manual or ruling behind them are estimates.

**What changes on screen.** In fighting wing the turn buttons (Delayed 90, Delayed 45, Check, In place, Hook) now work; Shackle and Cross turn stay greyed there. Nothing else moves or disappears. The Flying line names the new moves: "hot turning rejoin", "drop back and sweep out, expeditious", "straight-ahead rejoin" and "station change".

**How each move flies.**
- **Planned paths** (18:00Z): every move is planned at the press and is kinematic, not flown by live physics.
  - #2 either rides a kinematic line, with each step's pose worked out at the press (`live/kinematic.js`, `live/kinematic-moves.js`), or flies a goal-seeking dry run that is recorded at the press.
  - Roll stays within 90°/s. Speed changes stay under about 3 kt/s. Nothing jumps.
- **Hot turning rejoin, from the standard start only** (18:00Z, 19:01Z; card "Standard first" 19:16Z; SMM 16.20 para 65b(2), para 66).
  - The standard start is line abreast at the Spacing setting, on the line, level, at a matched 220 KIAS. The tolerances are estimates: 100 ft across, 500 ft fore and aft, 100 ft height, 10 kt and 5°.
  - Lead turns into #2 at once at 30° of bank and slows to 200 KIAS.
  - #2 points at Lead (bank up to 60°), rolls out, and reverses when the line of sight starts to move.
  - #2 then captures fighting wing with fuselages aligned, or carries on through the fighting wing spot to echelon, route or line astern.
  - Fig 16.25 is not to scale, so the manual's text is flown, not the figure's line.
  - Any other start flies the section 10 turning rejoin, unless a training error is set: then the off-standard starts of section 10.5 (V2.20).
- **Coming off the stack** (card 19:11Z; SMM 12.27 para 65): a rejoining wingman at or above Lead's height holds his place while he steps down to 60 ft below Lead, at about 15 ft/s. Only then does he close. This applies to the 2-ship and the 4-ship.
- **Fighting wing turns** (19:12Z).
  - Fighting wing is a band: 500-1,000 ft and 30-60° of sweep from Lead's wing line (SMM Fig 12.19). #2 stays where he is inside the band.
  - When Lead turns, #2 collapses toward Lead's six on Lead's turn circle, then uses the turn in and the turn out to fix tight or stretched. Whatever is left is judged against the band.
  - Lead flies the button's own angle: Check 20°, Delayed 45, Delayed 90, In place 90, Hook 180.
  - A turn of 30° or less (the check) is flown at 30° of bank. It is gentle, so #2 keeps his side and sweep (AFM7 brief p.14 item 5a).
  - Bigger turns are flown at 45° of bank, an estimate, and #2 collapses (item 5b).
  - #2's bank is capped at 60°, and his speed stays within 15 KIAS of Lead's.
- **Echelon, route or line astern to fighting wing** (19:03Z: about 7-15 s).
  - #2 goes straight for the slot, up to 20 KIAS faster or slower than Lead, at up to 45° of bank. He is in the band in about 13 s.
  - The 4-ship drops back, then moves out, so no one cuts across the wingman beside him.
  - SMM 16.32 para 92 says "slowly"; Patrick's ruling wins.
- **Fighting wing to echelon, route or line astern** (19:04Z): a straight-ahead rejoin (SMM 12.26 paras 62-63, Fig 12.17; EFIG p.371).
  - Line up on Lead's six, about 1,000 ft back (750 ft until V2.16; SMM Fig 12.17 and Patrick's card of 19:54Z) and 20 ft below the wake.
  - Close at about 21 KIAS overtake.
  - At about 500 ft, take a small vector toward the echelon side, aiming slightly away. Slow and stabilise in route, then move up the wing-tip line into echelon.
  - In the 4-ship each wingman rejoins on the one ahead of him in echelon. #3 and #4 start once the one ahead has reached his vector point, and from V2.16 each waits lined up at 1,000 ft until the one ahead is stable in position (SMM 16.34 para 95; AFM7 brief p.21). This replaces the route through finger.
- **2-ship close station changes** (19:26Z; SMM 12.20 paras 44-47, Figs 12.12-12.13).
  - Echelon to echelon:
    - back and down into the corner, with the nose at least 10 ft behind Lead's tail (12 ft more is used, an estimate) and at line astern's height, below the prop wash; then a real stop, held 2 s;
    - across at a steady 8 ft/s, with a small heading change, slightly aft of line astern;
    - a stop directly behind the new slot;
    - then forward and up at about 5 ft/s.
  - Echelon to line astern is the first half of that; line astern to echelon is the second half.
  - No wings overlap.

**Not in this step:**
- off-standard hot rejoin starts: built in V2.20, section 10.5;
- turns in the other formations, the 4-ship station changes, 3D echelon, the fit-all camera and the info tags: built in V2.16, section 10.2.

**Checks (light).** `tests/unit/turn-sim/formation-moves.test.js` checks that each move:
- ends in the formation pressed;
- has no snaps;
- stays below Lead while closing;
- keeps its bank under the cap;
- keeps wings from overlapping in the station changes.

The quick sweep has one generous limit, with its reason beside it. No values are pinned.

### 10.2 Turns in every formation, 4-ship station changes and the screen pieces (V2.16, TS-56, built 4 Oct, not yet in Patrick's sign-off)

The rest of Patrick's 4 Oct rulings (18:00Z to 19:54Z), from the screen-piece brief. Numbers with no manual or ruling behind them are estimates. Pictures from the check runs are in the project files at `turn-sim-review/screens/` (`v216-*.png`).

**What changes on screen.**
- The turn buttons now work in every formation, not only line abreast and fighting wing: in the 2-ship in echelon, route and line astern; in the 4-ship in fighting wing, finger, echelon, box, line astern and route. Shackle, Cross turn and G-warm stay line abreast moves and are greyed elsewhere.
- A **Fit** button appears beside the View switch while the camera is paused or its fit is off.
- Each aircraft has an **info tag** beside it in 2D. The plain name label is not drawn while the tags are on.
- Layers gains **Lead 7 and 5 o'clock lines** (off), **Info tags** (on) and **Fit all aircraft** (on). The **Lead 3/9 line** is now off by default. A layout saved before V2.16 keeps every other choice.
- The card's Now lines say sweep "back from Lead's wing line" (or #2's or #3's in the 4-ship).
- Nothing else moves or disappears.

**How each piece flies or works.**
- **Straight-ahead rejoin line-up at 1,000 ft** (Patrick's card, 19:54Z; SMM Fig 12.17 point 1). The line-up behind the aircraft rejoined on moves from 750 ft to 1,000 ft. In the 4-ship each wingman holds at his line-up point until the one ahead is stable in position, then closes (SMM 16.34 para 95; AFM7 brief p.21).
- **4-ship turning rejoin to finger** (SMM 16.34 para 96; AFM7 brief p.21).
  - Lead turns into the others at 30° of bank. #2 joins inside the turn.
  - #3 and #4 take #2's cut-off line and close to a wait point behind and slightly below Lead: #3 150 ft back and 20 ft low, #4 300 ft back and 30 ft low (estimates).
  - #3 crosses about two aircraft lengths behind and slightly lower than Lead only once #2 is stable, to echelon on the outer wing. #4 crosses only once #3 is stable.
- **Turns in the close formations** (SMM 12.19 paras 41-43, Fig 12.11; 16.36 paras 99-102).
  - Lead flies the button's turn: 45° of bank (1.4 G, an estimate inside the 3 G close-formation limit of 2 CFFTS Orders B2 ch 8 p.97); 30° for the check turn and for the 4-ship's echelon (the Orders' stepped turns away at 30°).
  - Each wingman keeps his place in Lead's wing plane: stepped up on the outside of the turn, stepped down on the inside, and rolls with Lead at Lead's own roll rate. Line astern stays under the tail of the one ahead.
  - His path is a kinematic line planned at the press (TS-55). His place follows Lead's bank 3 s behind (an estimate, KINEMATIC.planeLagSec), and each roll of Lead is blended in gently, so speed changes stay under about 2.5 kt/s and height changes under about 20 ft/s.
  - In the 4-ship, #4 flies through #3 (SMM 16.37 para 103). #3 is in Lead's plane, so every wingman's place is worked out in Lead's plane.
  - A turn into a 4-ship echelon is flown and flagged: the Orders and SMM 16.36 para 101 normally turn echelon away only.
- **Turns in 4-ship fighting wing** (AFM7 brief p.14 item 5): each wingman flies the fighting wing goal off the aircraft ahead of him (#2 off Lead, #3 off #2, #4 off #3), planned in that order. In the bigger turns each collapses toward the six of the one ahead and stays clear of him ("No. 3 must ensure clear of No. 2").
- **4-ship station changes, the 2-ship's technique** (SMM 12.20 paras 44-45; 16.32 paras 86-91, 16.33 para 93; AFM7 brief pp.19-20). Each wingman moves back and down into the corner and stops (held 2 s), crosses at a steady rate to directly behind his new place and stops, then moves forward and up at about 5 ft/s.
  - **Finger to echelon on #3's side** (para 87; AFM7 p.19 item 1): #3, with #4 on his wing, moves out, back and slightly down to make room (15 ft out, 25 ft back and 5 ft down beyond his echelon place, estimates) while #2 drops into the corner. #2 crosses behind and below Lead and moves up into echelon. Then #3 and #4 regain normal spacing.
  - **Finger to echelon on #2's side, and echelon back to finger** (para 88; AFM7 p.19 item 2): #3 and #4 move back and down into a column behind #2 and Lead, #4 behind and below #3, and cross together. #4 leaves the column only once #3 is across, then moves out and up to echelon on #3.
  - **Echelon to finger with #2 changing sides**: #2 crosses first, then #3 and #4 move in. The manuals give no picture of this one (an estimate).
  - **Finger to box** (para 91; AFM7 p.20): #4 moves back and down behind #3, across to behind Lead, stabilises in a loose line astern, then moves up into line astern. Back is the same way reversed (an estimate).
  - **Finger to line astern** (paras 86, 89): #2 and #3 move back together, #3 further. #2 crosses behind Lead into line astern. Only then does #3 move across behind #2, and #4 moves into line astern on #3 as he does. Back (para 90): #2 out and up first, then #3, then #4.
  - **Finger to finger** is the one change not authorised (para 93). A press of the other finger flies through echelon, and the Flying line says so.
- **3D close formations** (SMM 12.4 Figs 12.3-12.4; 12.19 Fig 12.11): the 3D camera now zooms in to about 8 px a foot, so a close formation is drawn at its real size. Before, each aircraft was blown up to 40 px and the two overlapped. Echelon shows wings matched to Lead, #2 stepped down along the bearing line, and in a turn both banked in Lead's plane.
- **Fit-all camera** (replaces the "zoom in under about 1,000 ft" rule of section 10).
  - The camera keeps every aircraft in the picture with about 15% of it spare on each side, and never tighter than 150 ft across (estimates). The zoom eases as they move.
  - A pan or zoom in 2D, or a zoom in 3D, pauses it, and the picture stays where the person put it. Turning the 3D view round does not pause it.
  - Fit brings it back at once. Reset brings it back too.
  - With **Fit all aircraft** off, the camera stays centred on the formation at the person's zoom, and Fit fits once.
  - In 3D the zoom and the centre follow the fit; the yaw and pitch stay the person's.
- **Lead's 7 and 5 o'clock lines**: dashed lines from Lead out past his tail, 30° either side of it, so 60° of sweep back from his 3/9 line, the back edge of the fighting wing cone (SMM 12.29 para 69, Fig 12.19). 2D only, greyed in 3D, as the 3/9 line.
- **Info tags**: Fight Sim's look (a dark box, a border in the aircraft's colour, 10 px text, the title in white and the detail in the aircraft's colour). 2D only.
  - Title: the aircraft and what the formation is doing: Rejoining, Station change, Turning, or the formation it is in (Fighting wing, Echelon, Finger and so on).
  - Lead's detail: KIAS and bank.
  - A wingman's detail, judged against the aircraft he flies off in the formation being flown (or flown to, during a change):
    - fighting wing: the cone, 500-1,000 ft and 30-60° of sweep from the wing line (SMM 12.29 para 69, Fig 12.19). Inside 500 ft TIGHT, past 1,000 ft STRETCHED, outside the sweep OUT OF CONE, otherwise IN POSITION, with the range and sweep. No margin is added: the tag shows the band itself. **From V2.19 (TS-60), while Lead is manoeuvring** (over 5° of bank or pitch, or 0.2 G off 1 G: estimates), 2-ship and 4-ship, the tag judges the distance only: TIGHT inside 500 ft, STRETCHED past 1,000 ft, otherwise IN RANGE, with the range and no sweep (Patrick 23:07Z, "this is true in fighting wing as well"; 23:08Z, "during the turn all that matters is their distance from lead for spacing"). Straight and level, and at the roll-out, the full verdict shows again. Ahead of the 3/9 line of the aircraft he flies off reads AHEAD OF 3/9 either way.
    - close formations: the roll-out judgement's in-position test (the section 10 table). Too close is TIGHT, too far is STRETCHED, and any other miss shows the judgement's own word (HIGH, LOW, OFF LINE).
    - line abreast and the wide 4-ship formations: the distance abeam only.
- **Sweep, the manual's way**: measured back from the wing line of the aircraft flown off, 0° abeam (Fig 12.19). The 4-ship fighting wing places are unchanged: #2 45°, #3 and #4 30°, 650 ft, #3 and #4 on the side opposite #2 (SMM 16.38 para 104; AFM7 brief p.14; Patrick 11:44Z). The 30° matches Fig 16.29's picture. Para 104's text says "a 60 degree sweep": Patrick chose to set it himself through the setting (section 10.4, TS-58).

**Settings and their defaults.** Fit all aircraft: on. Info tags: on. Lead 3/9 line: off. Lead 7 and 5 o'clock lines: off. All are in the Layers menu; the Fit button is the only new thing outside it, and it shows only while the camera is paused or off.

**Not in this step:** off-standard hot rejoin starts; the info tags, the 3/9 line and the 7/5 lines in 3D; flat 4-ship echelon turns at up to 60° (the Orders' other echelon turn); a turn pressed during a change.

**Checks (light).**
- `formation-moves.test.js`: 2-ship close formation turns; #2 rolls with Lead, is stepped up on the outside and down on the inside once Lead holds his bank, and ends where he started.
- `four-ship-changes.test.js`: the turn buttons in every 4-ship formation, with the same checks link by link; #2 crosses to echelon only once #3 has made room; in finger to line astern #3 moves across only once #2 is in.
- `tags.test.js`: the fighting wing tag's states against the cone, and sweep measured from the wing line.
- The camera, the lines, the tags on screen and the 3D picture are checked by eye in a browser run (sign-off).

### 10.3 Fluid manoeuvring, the simplified baseline (2-ship, planned wingman) (V2.17, TS-57; climb, descend, the loop and the 15° hold V2.18, TS-59; the side swap, wingovers, barrel roll and standard sequence V2.19, TS-60; built 4 Oct, not yet in Patrick's sign-off)

Patrick 21:44Z: "lets get a working baseline thats simplified, if required, and work from there." This is that baseline. Numbers with no manual or ruling behind them are estimates. Pictures from the check run are in the project files at `turn-sim-review/screens/` (`v217-*.png`).

**What changes on screen.**
- **Fluid manoeuvring** under Change formation now works. It starts only from fighting wing; in every other formation, and in the 4-ship, it is greyed ("From fighting wing only"). This replaces section 10's entries from echelon (the 2-second break) and from line abreast.
- A new group, **Fluid manoeuvring, Lead**, sits under Change formation: Level turn L, Level turn R, Wings level, Reversal, Climb, Descend, Loop (the last three from V2.18), Wingovers L and R, Barrel roll L and R, Standard sequence L and R (these six from V2.19), Terminate. Its buttons work only while fluid manoeuvring runs.
- **Fluid settings** (behind its own "More"): Lead's level turn bank (Gentle 30°, 60/2, Steep 70/3; default 60/2); the distance, 500-1,000 ft (default 600); how #2 is flown, Planned (the default) or Live (greyed, "coming later").
- While fluid manoeuvring runs, the other Change formation buttons and the manoeuvre buttons are greyed ("Terminate first").
- The card adds the fluid lines; the tags show the fluid words (below). Nothing else moves or disappears.

**How it flies.**
- **Planned, not live** (TS-55): Lead's path is planned at each press on the shared point mass (core `stepPointMass`) with the T-6A's full-power thrust and drag, and replayed. #2's path is worked out from Lead's (below), so it is planned too. Roll stays within 90°/s for both; Lead's G builds at no more than 4 G/s (estimate).
- **Entry** (AFM7 brief p.17): Lead turns away from #2 at 30° of bank while "all call ready" (5 s, estimate), then rolls to the chosen bank at MAX. #2 collapses from his fighting wing slot into the cone (Fig 12.20, turn away), blending in over about 10 s (estimate). A Lead button pressed during the entry waits for its end.
- **Level turn** (AFM7 brief p.17, AFM8 brief p.19): at the chosen bank, level, at MAX, until the next press. 30° is the brief's first stage, 60/2 its turn, 70/3 is SMM 16.18 para 50's line abreast number used as "steep" (estimate).
- **Wings level**: Lead rolls out and holds height.
- **Reversal** (Patrick's list; not a manual manoeuvre): Lead rolls through to the same bank the other way. With Lead wings level it is refused with the reason ("press a level turn first").
- **Climb and Descend** (V2.18, TS-59; Patrick's list, design 5.1; not FM manoeuvres in the manuals): Lead changes only his pitch, 15° up or down (estimate) through 2,000 ft (estimate), then levels off and holds the new height, keeping the bank he had, so from a turn it is a climbing or descending turn. PCL stays MAX (SMM 16.17 para 43): the speed bleeds in the climb and builds in the descent. The nose moves at no more than 3°/s and the push over keeps 0.5 G (estimates; Lead keeps positive G, 2 CFFTS Orders B2 ch 8 para 1a). Cut short by the next press.
- **Loop** (V2.18, TS-59; SMM 7.5 paras 10-13 and Fig 7.2; Table 7.1; EFIG p.170-171): Lead rolls wings level on the heading he has and gets to 230 KIAS at MAX by lowering or raising the nose up to 10° (the SMM says to attain 230, not how: estimate), then pulls 3.5 G wings level (EFIG p.171, inside the SMM's 3-4 G) until near the vertical (80°, estimate), then keeps the nose moving at a constant rate: the G bleeds off with the speed, slight positive G over the top (0.5 G at least, estimate; about 100-120 KIAS there, EFIG p.171), up to 4 G coming down (the top of the SMM's 3-4 G, at the Orders' 4 G), and the pull-out to level at about 230 KIAS (para 12). It uses about 2,500 ft of height (SMM 7.1 para 6: about 3,000). A press during the loop waits for its end.
- **Wingovers** (V2.19, TS-60; SMM 16.17 para 47, the only text: no figure in the SMM or the EFIG): the speed set-up to about 230 KIAS as for the loop, then the pull up at about 3 G (para 47: "a pitch rate similar to the cloverleaf"; SMM Table 7.1 2.5-3.5 G, EFIG p.137 about 3 G), aileron blended in as the nose comes up through the horizon, the nose to about 45° above the horizon, over the top at the most bank (about 120°, para 47's "up to 120") and the highest point 90° round, about 45° below, then the pull up to level on a heading 180° from the entry. The second wingover rolls the other way and ends level on the entry heading (para 47: "ideally ... in the opposite direction of roll"). Lead flies it as a planned nose path (the heading turning 180° on a smooth curve, the nose 45° up and down) with the nose rate set for about 3 G, a little less near the stick shaker (90% of it, estimate); the bank and the 3 G come out of the path, as a pilot's would. PCL MAX. About 40 s for the two; the exit speed is shown but the SMM gives none (about 215-220 KIAS in the sim). Sided: L or R is the first wingover's roll. A press waits for its end.
- **Barrel roll** (V2.19, TS-60; SMM 14.8 paras 18-19 and Fig 14.1; Table 14.1; Patrick's picks 19:20Z rows 5 and 6): the speed set-up to 230 KIAS on the heading Lead has (the reference line), PCL MAX, a 3 G wings-level pull with the roll blended in (Table 14.1; Fig 14.1 "3G, wings level pull and begin roll"), the nose round a 45° circle about a point on the horizon 45° off the line toward the roll (para 18): 45° pitch up at 45° off the line, **level and inverted at 90° off** (para 19; row 5), 45° pitch down at 45° off, then level on the line. The back pressure comes off over the top (para 19) to 2.25 G and goes back to 3 G coming down; 2.25 is an estimate that brings the exit back to about 230 KIAS (Fig 14.1: "adjust rate as required for 230 KIAS exit"). The bank at the 45° points comes out at about 75° (the SMM says 90°): a coordinated aircraft whose nose follows the circle needs some of its lift upward there. Lead's pitch over 60° is flagged during the roll (AFM7 brief p.17, Exercise 4; row 6), never held; the roll peaks at about 48° of pitch attitude. About 20 s. Sided. A press waits for its end.
- **Standard sequence** (V2.19, TS-60; SMM 16.17 para 42, as written there): a level turn, a loop, two wingovers and a barrel roll, one after the other, each with its own speed set-up into the next. The level turn is at the chosen bank (60/2 by default; AFM7 brief p.17, Exercise 1) for 360° (V2.20, Patrick card 5 Oct 01:03Z: "360°", and "360 and the wingman uses it to set their spacing"; it was 180°, an estimate, in V2.19), so the sequence starts and ends on the entry heading. #2 sets his spacing in it: a new distance setting, or a place he is not yet on, is eased in smoothly over the rest of the turn (never quicker than the usual 6 s); already set, he just holds. L or R is the turn's way and the roll direction of the wingovers and the barrel roll. The card names each part ("Standard sequence: Loop"); a press waits for the whole sequence. About two and a half minutes.
- **#2, the planned wingman** ("go where Lead was and do what Lead did", EFIG p.391): he flies along Lead's own path a few seconds behind him at the set straight-line distance (Patrick's pick row 4: range is the straight line), with two offsets:
  - **across**: 15° off Lead's **current** tail line on his own side, in every turn, climb, descent and loop (Patrick 22:28Z, "lets go with hold 15"; V2.18, TS-59), inside the cone; never straight behind (Patrick 19:21Z). Where Lead was is turned about Lead onto that place, averaged over 6 s (estimate; 3 s in V2.18) so a roll of Lead's comes in over a few seconds; once a turn is steady #2 sits at 15° turning into him or away from him (V2.17 gave about 25° and 5°).
  - **the side swap** (V2.19, TS-60; Patrick 19:21Z, "wingman can 'swap sides' ... to fix lead/lag spacing over the top"; 22:28Z, "can swap sides if it makes sense for spacing/lead/lag"): one rule in level turns and over the top. #2 reads his drift across Lead's tail (his angle off it and how fast it changes, in Lead's level frame). If stopping that drift, at about 2°/s² (estimate), would carry him more than 2° (estimate) past Lead's tail line, the other side's 15° is nearer than his own, and he crosses behind Lead to it instead of fighting back: over 5 to 12 s (estimates; quicker the faster he is drifting), smooth, through Lead's six at the set range, never in front of Lead, positive G. Not during the entry or Terminate's blend, and not within 4 s of the last swap (estimate). His tag and the card say SWAPPING. In practice a hard reversal (60/2 at 1,000 ft, 70/3 at any range) and the wingovers bring a swap; a steady turn never does. Range in the planned wingman is held at the setting by construction, so "tight or wide" (the brief's other example) does not arise yet; it will with the Live wingman.
  - **the cone is his aim, not a wall** (V2.19, TS-60; Patrick 23:02Z: "you dont have to be perfectly in the cone for FM... just when you finish you reset to the cone (like any fighting wing maneouver)"; SMM 16.17 para 42 "the aim of the wingman", para 43): during a manoeuvre #2 may drift out of the cone; when it ends he settles back into it at 15°. Out of the cone mid-manoeuvre is information, not a caution. Only para 44's items (5 G, more than 90° of aspect with more than 90° of HCA and low line of sight, the 500 ft bubble) and Lead over 4 G are flagged. "Terminate for position" (para 46) is a later piece (`future.md`).
  - **lag, pure or lead**: outside Lead's turn is lag, on his path pure, inside it lead (SMM 12.30 paras 72-74; EFIG p.391), 10% of the range at full size (estimate). A new turn into #2 starts with lag (make the miss first), one away from him with lead (collapse to his six), for about 4 s (estimate), then pure (Fig 12.20). #2 answers each turn a few seconds after Lead makes it.
  - **in a climb or descent** he follows Lead's path, so his plane of motion follows Lead's (SMM 16.16 para 39c): lag while Lead's nose rises, lead while it falls, pure once it is steady (Patrick's loop rule carried over: estimate). The pursuit offset puts him just below Lead's path either way.
  - **in the loop** (Patrick 17:12Z: "lag on the way up, try to cross horizon with fuselages both parallel, and lead on the way down"): his point on Lead's path is turned about Lead in the loop's plane, to about 20° outside Lead's tail line going up (lag: EFIG p.391, lag puts the path outside the turn circle), across over the top, about 20° inside coming down (lead), and back in trail for the pull-out; with the 15° across he stays about 25° off Lead's tail, inside the cone. **Fully parallel over the top would take #2 to about -2 G at 600 ft**, so he crosses the horizon about 20° off parallel (on Lead's own path it would be nearly 40°); the card says PURE there. Patrick kept this (23:00Z, card "Keep 20°"): parallel over the top is a loose aim, never steered hard, flagged or tested, and never bought with negative G. All the loop numbers for #2 are estimates.
  - **in the wingovers and the barrel roll** (V2.19, TS-60; Patrick card 19:21Z, "like the loop"; 23:00Z, the same approach): LAG going up, PURE over the top, LEAD coming down, PURE for the pull-out (the breaks at 40%, 60% and 90% of each wingover or the roll are estimates), through the pursuit offset. He goes where Lead was, without the 15° hold, and drifts in the cone (up to about 30° of aspect at 600 ft), then settles back to 15° once Lead is level (Patrick 23:02Z); he may swap sides on the way. At 600 ft he pulls up to about 4.5 G; at 1,000 ft about 5.5 G at the bottom, flagged (para 44a). Over the top he is about 30-45° off parallel (a loose aim: turning him toward parallel in Lead's turning plane gave G spikes far over 5, so it was not built).
  - his wings follow his lift at no more than 90°/s; G and attitude come from his path, so they always agree with it.
- **Terminate** (SMM 16.17 paras 45-46, 48; AFM7 brief p.17; Patrick's pick row 7): Lead flies a gentle, predictable 30° turn (estimate) for 90° (estimate), the way he is already turning or away from #2 if wings level, with the power back to fighting wing's 200 KIAS (TS-53), then rolls out. #2 goes back to his fighting wing slot on the side he is on, over about 12 s (estimate). Then the pair is in fighting wing and the card judges it against the section 10 table. Rejoin to a close formation is its own Change formation button, as before (Patrick's pick row 7).

**The cone and the readouts** (Patrick's picks 19:20Z, `fluid-conflicts.md`).
- The cone is 60° in all, 30° either side of Lead's tail (row 2). Aspect is 0 at the tail (row 10; SMM 16.16 para 40b). HCA is the angle between the two headings (para 40c).
- Distance 500-1,000 ft (SMM 16.17 para 42; AFM7 p.17, AFM8 p.19), 500-750 shown as good, default 600 (row 3); a typed value outside 500-1,000 is refused and the old one kept.
- **Card lines**: Lead's manoeuvre and its phase; #2's pursuit (LAG, PURE, LEAD, SWAPPING; INTO THE CONE during the entry; BACK TO FIGHTING WING during Terminate); for the loop, the wingovers and the barrel roll, the entry and exit speeds against the SMM's ("Loop: entry 230 KIAS, exit 234 KIAS (SMM 230 in, 230 out: Table 7.1, 7.5 paras 11-12, Fig 7.2)"; the wingovers: "SMM 16.17 para 47: about 230 in, the exit not given"), shown from the set-up until Lead's next manoeuvre; his state and range; aspect, HCA and closure.
- **#2's state** (card and tag): TIGHT inside 500 ft, STRETCHED past 1,000 ft; otherwise, while Lead manoeuvres (V2.19, TS-60), IN RANGE (the distance only: Patrick 23:07Z, 23:08Z), and straight and level OUT OF CONE past 30° of aspect, otherwise IN POSITION. The tag reads AHEAD OF 3/9 if #2 is ahead of Lead's 3/9 line.
- **Tags**: Lead: the manoeuvre, its phase and KIAS. #2: his pursuit word; his state, range and aspect.

**Flags, never walls.**
- Inside the 500 ft bubble (SMM 16.17 para 44c; Gen Book p.11).
- #2 over 5 G (SMM 16.17 para 44a; Gen Book p.11); Lead over 4 G (2 CFFTS Orders B2 ch 8 para 1a; Gen Book p.11) (row 11).
- More than 90° of aspect with more than 90° of HCA and low line of sight (SMM 16.17 para 44b; "low" is under 5°/s, estimate).
- Below 3,000 ft AGL, the fluid manoeuvring minimum (2 CFFTS Orders B2 ch 8 para 1f; Gen Book p.11), taken as about 6,000 ft MSL over the Moose Jaw areas (SMM 14.6 para 16; estimate until the block height is ruled).
- At the stick shaker (the one physical limit; core `shakerG`).
- During the barrel roll, Lead's pitch over 60° (AFM7 brief p.17, Exercise 4; Patrick's pick row 6).

**When things go wrong.** Fluid manoeuvring pressed outside fighting wing, or in the 4-ship, is refused with the reason and nothing moves. A Lead button pressed during the entry waits for its end; during Terminate it is greyed. Any other button pressed during fluid manoeuvring is refused ("Terminate first"). Reset ends it.

**Not built yet** (`future.md`, later pieces): Terminate for position (SMM 16.17 para 46); Live wingman; Fluid 4 manoeuvring; cloverleaf, Cuban eight and Immelmann. The 3D view's camera looks down, so the loop is seen only in 2D from above (the 3D view is a bonus).

**Checks (light).** `tests/unit/turn-sim/fluid.test.js` (from V2.19 to Patrick's 23:02Z ruling: no "in the cone throughout"): all the time, G positive, no jumps, roll within 90°/s, #2 outside the 500 ft bubble and behind Lead's 3/9 line; after each manoeuvre #2 is back in the cone at the distance set (±100 ft) and 15° (±5°); fluid manoeuvring starts only from fighting wing; Lead's turn holds height; in a steady turn either way #2 sits 15° off Lead's tail (±5°); climb and descend end level higher and lower; the loop goes over the top and ends level on Lead's heading at 230 KIAS (±10 kt) with about 100-120 KIAS at the top; a steep reversal, where #2 may swap, only behind Lead; the wingovers 45° up and down, up to 120° of bank, about 3 G, 180° out and back on the entry heading; the barrel roll 45° up and down, level inverted 90° off the line, back on the line at 230 KIAS, under 60° of pitch; the standard sequence in the SMM's order; Terminate ends in fighting wing; a reversal from wings level is refused. `tags.test.js`: while Lead manoeuvres only the distance is judged, and ahead of the 3/9 line is flagged. The screen pieces are checked by eye in a browser run (sign-off).

**Opening the range in the pulls (V2.20, TS-60 amendment; Patrick card 5 Oct 01:01Z, "Open his path").** In the wingovers and the barrel roll at a long distance setting, #2 lets the range open during the pull so he stays under 5 G (SMM 16.17 para 44, an aim, not a wall; he aims at about 4.5 G, an estimate), ends a little wider, then closes back to the setting and 15° smoothly (at most 8% faster along Lead's path, an estimate). At the default 600 ft nothing changes. The loop is not changed by this (at 1,000 ft #2 still pulls past 5 G in the loop: a question for Patrick).

### 10.4 Fighting wing desired spacing and sweep as settings (V2.17, TS-58, built 4 Oct, not yet in Patrick's sign-off)

Patrick 21:25Z: "Can we make the 'desired sweep and spacing' a setting?"

- **Where:** Setup, behind "More: fighting wing spacing and sweep". Changing one starts again from the beginning, as the other Setup settings do.
- **The settings and their defaults** (today's places, unchanged):
  - 2-ship: #2 spacing off Lead 750 ft, sweep 45° (the middle of the SMM band; estimate).
  - 4-ship: #2 spacing off Lead 650 ft, sweep 45°; #3 and #4 spacing 650 ft, sweep 30°, each off the one ahead (Patrick 11:44Z, estimates until Dad says; read from `slots.js` FW4). Fluid 4's #4 flies off #3 with #2's pair.
  - The 2-ship's two show in the 2-ship, the 4-ship's four in the 4-ship.
- **Sweep is measured back from the wing line** of the aircraft flown off, 0° abeam (SMM 12.29 para 69, Fig 12.19; Patrick's pick row 1).
- **Flagged, never walled:** outside the SMM's 500-1,000 ft and 30-60° band (SMM 12.29 para 69), the place is flown and a line under the settings says so; the roll-out judgement and the tags still judge against the SMM band, so a place outside it ends "TOO FAR" or the like. The sim flies 450-1,250 ft and 25-65° (estimates: just inside the region where the pair is still recognised as fighting wing, so the fighting wing buttons keep working); a typed value outside that is refused and the old one kept.
- **What reads them:** the fighting wing slot for every change into fighting wing (2-ship and 4-ship), and the distance behind Lead at which fighting wing flows across to the other side.
- **Not the fluid distance.** Fluid manoeuvring's distance (500-1,000 ft, default 600, section 10.3) stays its own setting: it is how far #2 sits behind Lead in the cone while manoeuvring, a different formation from fighting wing's place (SMM 16.17 para 42 against 12.29 para 69). Fluid manoeuvring is entered from wherever #2 is in fighting wing and Terminate returns him there.

**Checks (light).** `tests/unit/turn-sim/fw-shape.test.js`: #2 settles at the spacing and sweep set (2-ship); a spacing past the band is flown there and flagged; #3 and #4 settle at their own spacing and sweep (4-ship); a place inside the band has no flag, outside it a flag, far outside it a refusal.

### 10.5 Off-standard hot turning rejoin starts, the overshoot, slowing down and power on the tags (V2.20, TS-61, TS-62, built 5 Oct, not yet in Patrick's sign-off)

Patrick's rulings of 4 Oct 19:15Z, 23:29Z and 23:37-23:38Z and 5 Oct 00:11Z-02:05Z; requirements log items 8a and 22-34 (project files `turn-sim-review/requirements-log.md`). Numbers with no manual or ruling beside them are estimates.

**What changes on screen.**
- Errors (training) gains **Speed**: none, fast or slow, amount 5 to 40 KIAS (default 20). Nothing else moves or disappears.
- With any training error set, pressing Fighting wing, Echelon, Route or Line astern from line abreast flies the hot turning rejoin from wherever #2 is (the Flying line adds "off-standard start"), and the card says at the end how #2 dealt with it.
- A wingman on an overshoot reads **OVERSHOOTING** on his tag, and the card's rejoin block adds the line.
- Every tag has a **power line** when its power is known: MAX, TQ nn%, or in red IDLE, IDLE+BOARDS or TQ nn% + BOARDS.

**Slowing down (TS-61).** The fixed 1.5 kt/s slow-down is gone. Slowing uses, in Patrick's order: geometry (the planners), power (core `excessFnFor`, its slowest the power floor at throttle 0), the speed brake (drag ÷ weight about 0.095 at 200 KIAS, about +1.7 kt/s; its size is a guess), idle (the idle prop's drag ÷ weight 0.16 at 200 KIAS, about 5 kt/s level at 200, Patrick 00:11Z), then idle and the brake. Lead's slow-down in the rejoin (220 to 200 KIAS, Fig 16.25) uses power: about 17 s where it took about 13 s at 1.5 kt/s, so the hot rejoin and the speed changes in the other moves take a few seconds longer than V2.19. Code: `live/slow-down.js`.

**The off-standard starts (TS-62 (2)).** From a roughly line abreast pair (1,000 ft or more across, within 4,000 ft fore and aft, 2,500 ft of height, 45 KIAS and 10°, wings level), as the error's Response says:
- **Fix it:** geometry first (how far he cuts off, a lag line, when and how hard he reverses), then power (to 200 KIAS, or 210 or 220 KIAS held as a set overtake, SMM 12.24 para 56), then the boards, then idle, then both; the line using the least wins. The capture onto fighting wing may take 20, 30 or 45 s.
- **Turn at normal reference:** the standard rejoin's own choices (worked out from the standard start beside Lead) flown from where he is, with his speed error kept and the standard 20 s capture; the error carries, and he uses the boards or idle only when the line needs them.
- A high start comes down at up to about 45 ft/s on average so he is below Lead inside 1,000 ft (SMM 12.27 para 65); further out, before the line-up, he may still be stepping down, flagged by the rejoin flag, not walled.
- Every line is still Fig 16.25's and para 65b(2)'s: Lead turns into #2 at 30° and slows to 200 KIAS on power; #2 points at Lead (up to 60° of bank), rolls out, reverses as the line of sight moves, and captures fighting wing or flows through it to the formation pressed (para 66).
- **When none fits:** a start that leaves #2 ahead of Lead's 3/9 line once Lead turns into him (ahead, or ahead and tight, or fast at the normal reference) flies the section 10 tracker's rejoin, as before V2.20. A question for Patrick.

**The overshoot (TS-62 (3); SMM 12.27 paras 64-66, Fig 12.18; Patrick 23:29Z).** An overshoot is #2's decision, last in the order of use:
- **Sliding to the outside** ~~is flown as an overshoot~~ (V2.21, TS-63): a line that swings across behind Lead and back is a rejoin with the normal words (the standard start's own line does it in the reversal); it must cross well behind Lead. OVERSHOOTING shows only from the decision point below.
- **At the decision point:** where the slowing a line asks inside 1,000 ft of Lead (an estimate from Fig 12.18's picture; 1,500 ft until V2.21) is more than idle and the boards give, #2 rolls wings level, slows at 90% of idle and the boards, passes behind and below to about 100 ft out and 40 ft back on the outside (never stepped up: SMM 12.27 para 65, "do not go higher than the flat turn position"), then crosses back under Lead's tail to the formation pressed (SMM 12.20 para 44b). None of the starts tried with the default amounts needs it; it is built and waiting.
- **Straight-ahead rejoin overshoot** (vertical separation and turn away) and the 4-ship's overshoot: `future.md` (training errors do not apply to those rejoins yet).

**Held to full power (V2.21, TS-63; Patrick 5 Oct 02:48Z and 03:46Z).** An off-standard capture line that asks #2 to speed up faster than full power gives at his speed, height and G is flown along the same line at the speed he can reach: the range opens, his tag and the card say **STRETCHED** while he is behind, and once he can he closes with power (at most 15 KIAS of overtake, EFIG p.374) and shows the normal state. Over the stall line or just under 7 G he slows instead (Patrick 03:05Z). Lines already inside full power, the standard start's rejoin, the formation turns, the tracker and fluid fly as in V2.20. Code: `live/full-power.js`.

**Power on the tags (TS-62 (4); Patrick 01:44Z and 02:05Z).**
- **Words:** MAX at full power; TQ nn% at part power; IDLE; IDLE+BOARDS; TQ nn% + BOARDS (power set and the speed brake out). The last three in red, the others in the tag's colour.
- **Torque:** TQ% = thrust x TAS / (eta x 1,100 shp) x 100, capped at 100. Thrust is the model's throttle x core `thrustPerWeight` x 6,000 lb (estimate); 1,100 shp is the PT6A-68's flat rating (NFM ch 1); eta 0.81 (estimate) is the model's full-power thrust power at 200 KIAS over 1,100 shp. The throttle is the model's (the share of full-power thrust that flies the speed change, climb and G), not a torque gauge reading.
- **Checks against SMM Table 8.1** (approximate, not pins): level 180 KIAS clean about 43% (SMM 40-45%); level 120 KIAS with gear and T/O flap about 36% (SMM 35%); 3° glidepath at 120 KIAS about 22% (SMM 25%).
- **Where it shows:** aircraft flown by flight.js segments (holds, turns, speed changes: the energy flown), the hot rejoin's lines (the least device that gives the slowing flown), and fluid manoeuvring (PCL MAX for both aircraft, SMM 16.17 para 43; Lead's held speeds as TQ). The tracker's rejoin and the other planned lines set no power, so their tags show none rather than a guess.

**Failure and stale data.** No outside data. A start the planner can't fly falls back to the section 10 rejoin and the card says what is flying; a planning search is bounded (a press plans in under about 5 s on a desktop, most in 1 s). A bad error amount is treated as the default.

**Checks (light).** `tests/unit/turn-sim/offstandard-rejoin.test.js`: a corrected off-standard start ends in the formation pressed, below Lead inside 1,000 ft, never slowing harder than idle and the boards, no roll-rate jumps; an overshooting #2 stays below Lead, crosses behind him, and still ends in the formation. `slow-down.test.js`: the stages are in order; idle at 200 KIAS is about 5 kt/s; a planned ramp never asks more than its stage; the core drag is unchanged. `tags.test.js`: a set power shows on the tag, red exactly for idle and the boards.

### 10.6 Rejoins on Patrick's rulings, the turning rejoin from fighting wing, quick fluid entry and cutting inside (V2.24, TS-67, built 5 Oct, not yet in Patrick's sign-off)

- **Hot turning rejoin, lines then tracker:** the line (point, reverse, line up, capture through fighting wing) flies the rejoin closure until #2 is about 500 ft from route on his side (or from the fighting wing slot when that is the target); the tracker then runs in at the close-in rate into route and on into the slot, planned again at the hand-over. Fighting wing on the other side and the decision overshoot fly their whole line.
- **The rejoin line** (SMM 12.24 paras 56-58, Fig 12.14; SMM 16.20 para 66; Patrick 04:53Z): #2 lines up only on his own side of Lead and passes through fighting wing on that side; a line that slides behind Lead to the outside of his turn is never flown; only the decision overshoot crosses.
- **Rulings (Patrick 06:16Z):** #2's bank in a rejoin has no cap but the G rule (5 G level, about 78°; flagged on the card at that bank, never a wall); reversals up to 78°; Lead holds his 30° turn until #2 is in, then rolls out (hot rejoin, the tracker's rejoin, the turning rejoin from fighting wing); no fixed descent rate, only a smooth descent within 0.5 G of push (estimate), off Lead's height before 2,000 ft (SMM 12.27 para 65); the decision point about 200 ft.
- **Rejoin kind** (More, 2-ship): Turning (TRJ, the default) or Straight ahead (SARJ), from line abreast and from fighting wing to echelon or route (Patrick 05:13Z). TRJ from fighting wing: Lead turns into #2 at the press at 30° and 200 KIAS, constant bank (SMM 16.20 para 65b), until #2 is in; #2 runs up the rejoin line into route, then echelon. Line astern from fighting wing stays straight ahead.
- **Fluid** (Patrick 04:59Z; card "Geometry: cut inside" 04:53Z): the entry and Terminate move into the cone and back at the close-in rate (at least 3 s, estimate); aerobatics start within 15 KIAS of the entry speed; #2 is held to full power (STRETCHED while behind) and, while behind, flies inside Lead's turn toward pure pursuit (at most a quarter of the range and never past 5 G, estimates), then back onto the 15° lag line.

**Failure and stale data.** No outside data. A hot rejoin whose tracker part doesn't settle flies its whole line; a turning rejoin from fighting wing that doesn't settle flies the straight-ahead rejoin; Lead turning until #2 is in falls back to the fixed turn angles in the tracker's rejoin. The live hold always returns a point on or inside the planned line.

**Checks.** None added (Patrick 06:25Z); typecheck only.

---

# Part 2. Plan mode: the spec from before the reset

Not on screen since V2.6. Kept unchanged for the plan-mode code still in the repo (`src/modules/turn-sim/engine/`, `settings.js`, `fields.js`, `readouts.js`), which is retired only with Patrick's yes.

> **Note (reset, 4 Oct 2026):** this is the spec as it stood before the reset, moved here unchanged. It is refreshed against this module's new `requirements.md` and `decisions.md` when the module's work resumes. Where it disagrees with them, they win. Lines saying the code must give "the same answer V6 gives" or must match V6 are replaced: flight math is checked against the manuals and standard aerodynamics (ALL-R22, Patrick's answer Q-ALL-4).
>
> **Replaced old decisions:** this spec still cites D6, D10, D87, D112, which are no longer in force. The "Replaced old decisions" section of `../../DECISIONS.md`, `../turn-fight/decisions.md` and `decisions.md` says what took each one's place.

## Turn Sim spec (as moved)

Moved from `specs/SPEC-turn-sim.md`.

## Spec: `turn-sim`, the Formation Turn Sim

Status: **approved by Patrick on 2026-09-30** ("Spec turn sim approved", in the Turn Sim spec thread). Patrick answered Q41 to Q47 the same day (see "Answered questions"), and this spec follows his answers. At 06:40Z he added eight formation items from the SMM (see "SMM formation additions"). Changes go through a pull request. Module id `turn-sim` in [`archive/SPEC.md`](../../../archive/SPEC.md). Requirement IDs (R#), decisions (D#) and questions (Q#) refer to the plan doc: https://claude.ai/code/artifact/29712036-a126-43c3-ac39-57ba919ff102. The questions this spec raised were TS1 to TS7, logged in the plan doc as Q41 to Q47.

Building starts after the debrief screen, when the coordinator says it's the Turn Sim's turn. Until then this spec and the task plan in [`tasks/turn-sim/`](../../../tasks/turn-sim/) are the work.

## Objective

A trainer for 2-ship and 4-ship tactical turns. The user sets up a formation (4312, 2134, offset box or two-ship), picks a turn (delayed 90 or 45, hook, shackle, cross turn), chooses how each aircraft knows when to turn (a time delay, a clock-position cue or auto timing), and watches the aircraft fly it from above. The screen shows spacing, which wingman is tight, wide, fore or aft, and the turn radius, rate and bank.

V6 does all this in its first tab, and its flight math is Dad's. The rebuild keeps that math, fixes the mistakes Dad has already signed off (D41 to D45, D48, D74), and fixes the screen: controls that did nothing, side rails and a toolbar that covered the picture (#30, #34), settings that were lost from profiles (#31), and results that changed with the screen's frame rate (#17).

Users are T-6 instructors and students on a desktop or laptop (D6). They should be able to:

1. Open the Turn Sim and see the whole formation fitted to the screen, with nothing covering it (R2, #30).
2. Change the formation, turn or timing and press Play, and see the new plan flown, never a stale one (#31).
3. Read who is on spacing and who is off, and by how much, while it flies (R9).
4. Add errors to a wingman (late, early, wide, tight, fore, aft, extra or less G) and see what that does to the rollout.
5. Save a setup as a named profile or the startup default and get back exactly what they saved (#31, R18).

## Assumptions

1. **The flight math is Dad's V6 code, ported unchanged, then fixed one decision at a time** (CLAUDE.md, D10). Every Turn Sim number is pinned to V6 by a golden test before it moves, and each approved fix lands as its own commit that changes the pinned value on purpose.
2. **Shared pieces come from `core`**: angles and the compass conversion, turn radius, rate and bank, the G limit, distance, and the standards classifier (`classifyTurnSimPosition`, `formationAxes`, `V6_STANDARDS`). **Turn-Sim-only math** (the formation slots, turn planning, cues, the rear-element check and the step-by-step flying) lives in the module's own `engine/` folder, as pure functions with no page access. SPEC.md puts "formation presets, turn planning, cues, integrator" in `turn-sim`, and no other module uses them. See "What the Turn Sim needs from `core`" for the one piece `core` holds (D74).
3. **Speed is true airspeed with no wind**, as in V6. The box keeps V6's "KTAS" label, and V6 uses it as the ground speed.
4. **The sim steps in fixed 0.05 s steps**, V6's own step (`dt = 0.05`, line 784), whatever the frame rate. V6's Step button already does exactly this, so the pinned numbers are V6's, and the result no longer depends on the screen (#17). Playback speed changes how many steps run per frame, not their size.
5. The picture stays a hand-drawn Canvas 2D, as V6's, using ui-kit `canvas-view.js` for pan and zoom. No new package.
6. **The Turn Sim judges by the debrief's edited standards** (Q46, Patrick). V6 always used its fixed numbers, which are still the default preset (`V6_STANDARDS`), so nothing changes until someone edits a standard. The golden tests pin V6 with the default preset.
7. D78 (Q39: the offset standard alone judges #3's fore/aft in the debrief) doesn't change the Turn Sim: V6's Turn Sim judges #3 by the spread standard in 4312/2134 and by the offset standard in the offset box, never both. V6's labels stay (as `core/standards.js` also notes).

## The screen

It follows Patrick's rule (2026-09-30, R22): essentials by default, and everything else behind a checkbox (off by default) or a collapsed "More …" panel. Nothing covers anything else: no side rails, no toolbar over the canvas, no Tab-key tricks (#30, #34, #35).

**What a first-time user sees:**

```
┌ Setup ──────────────────┐┌ Stage ────────────────────────────────┐┌ Formation ──────────────┐
│ Formation   4312     ▾  ││ ▶ Pause Step Reset  1× ▾  t = 12.4 s   ││ #2  ON SPACING          │
│ Spacing     6000 ft     ││ Fit   Layers ▾                        ││ #3  WIDE   interval 6,420│
│ Start hdg   360°        ││                                       ││ #4  AFT    −380 ft       │
│ Turn        Delayed 90 ▾││                                       ││ Min sep  5,980 ft        │
│ Direction   Right  Left ││         formation picture             ││ R 3,610 ft  45.0°/…  60° │
│ Speed       220 KTAS    ││                                       ││ ▸ More detail            │
│ G           3.0         ││                                       │└─────────────────────────┘
│ Timing  Time delay   ▾  ││                                       │
│ Base delay  16.0 s      ││  drag an aircraft before Play to move │
│ ▸ Aircraft errors       ││                                       │
│ ▸ More setup            ││                                       │
│ ▸ Profiles              ││                                       │
└─────────────────────────┘└───────────────────────────────────────┘
```

| Shown by default | Behind a checkbox (off by default) or a collapsed "More …" panel (R22) |
|---|---|
| **Setup:** Formation, Spacing, Start heading (compass), Turn, Direction, Speed, G, Timing, and the one field the timing needs (Base delay, or Clock position for the clock cue, or the computed auto delay shown read-only) | **More setup:** Turn degrees, Duration, MOA boundary, Clock cue tolerance, Offset box settings (aft spacing, lateral stagger, #4 timing (ground track by default, or V6's Late and Early); shown only when the offset box is picked), #2's side in 4312 and 2134 (D48), and a **Correction model** checkbox (off; opens the model, strength and G fix, Q41) |
| **Stage:** the playback bar (Play, Pause, Step, Reset, speed 0.25× to 4×, sim time) above the canvas, Fit, and the picture | **Layers** menu: Lead 3/9 line (on), turn circles (on), error labels (on), follow lead, clock marks, breadcrumbs and their interval, distances in NM |
| **Formation card:** one line per wingman (its label and the number that's off), minimum separation, and one line of turn radius, rate and bank | **More detail:** every pair's spacing (1-2, 1-3, 1-4, 3-4, 2-3, 2-4), each wingman's interval, fore/aft and measuring note, and V6's summary table (time to turn, speed) |
| | **Aircraft errors:** per wingman, delay error, G error, and the position error (tight/wide and fore/aft in feet) |
| | **Rear element check** (offset box only, inside More setup): on/off, start time, direction, angle, hold, and a live status line |
| | **Spacing graph** checkbox (off, Q41): V6's hidden graph of the chosen pair distances, minimum separation and closure over the run, each in its own colour and labelled |
| | **Solver** checkbox (off, Q41): V6's hidden solver, which finds the base delay, spacing or G that gives a target spacing |
| | **Exercises** (collapsed): G-warm (SMM additions, item 7) |
| | **Profiles:** named profiles, save and load the startup default, delete, factory reset; and Export CSV |

- **Every setting starts filled in with its default** (Patrick, 07:13Z). No box starts blank or needs typing before Play: open the Turn Sim and press Play, and a 4312 delayed 90 flies at the defaults. The same holds for every More setup, Aircraft errors, rear-check and Exercises field, and for anything added later. `settings.js` holds each default in one place, next to its SMM or V6 source, and every panel has a "Reset to defaults" that puts its own fields back.
- **Friendly, not overwhelming** (Patrick, 07:13Z; R22): plain words on every label, units shown, a one-line hint on anything not obvious, and warnings in words beside the thing they're about. New features keep to the same rule: essentials only on the first screen, the rest behind a closed panel or an off checkbox.
- **Layer defaults stay V6's** (3/9 line, turn circles and error labels on; the rest off), so the picture matches what V6 users know.
- **Open panels and layers are remembered** in this browser (`app.storage`), with a "Reset layout" in the Layers menu. They're not part of a profile, which carries the scenario.
- Only controls that apply are shown: offset-box settings and the rear-element check appear only with the offset box; the clock-cue fields only with the clock cue; the auto delay only with auto timing (#32).
- Panels are ui-kit `panel.js` sections (real buttons with `aria-expanded`), and every input is a ui-kit control bound to the module's settings, which refuses blank, non-finite and out-of-range numbers (so a huge start heading can't freeze the page, SPEC-core).
- **Keyboard** (through `app.keys`, only while the Turn Sim is open and never while typing): Space plays or pauses, → steps once, Home resets. The canvas view's arrows pan and + and − zoom.
- **Colours:** #1 blue, #2 green, #3 red as in V6. **#4 changes from black to white with a dark outline** (#29), as in the debrief. Every aircraft carries its number, and labels carry words, so colour is never the only signal.
- Three columns at 1366 × 768 and up, none covering another (R2). The side columns collapse with a real button for a canvas-only view.

## What V6 does, and what the rebuild keeps

### Defaults changed from V6 (Patrick, 2026-09-30 05:37Z, following the SMM)

- **G defaults to 3.0** (V6: 2.0, D113). The SMM flies line-abreast turns at 3 G (SMM 16.18 para 50, 16.19).
- **Offset box aft defaults to 7,000 ft** (V6: 8,000, D114), matching the offset standard of 7,000 ± 1,000 ft (SMM 16.41 para 109). The standard itself is changed in `core` `V6_STANDARDS` by the Flight math core thread, and the Turn Sim reads it through `app.standards`.
- Speed stays 220 (Patrick: 220 KIAS in the low block, 200 KIAS in the mid block). The box is the true airspeed V6 flies with no wind (Assumption 3).
- As with every change (D10), the golden tests pin V6 at its own defaults (2.0 G, 8,000 ft) first, and each new default lands as its own commit.

### Formations

| V6 formation | Slots (V6 `desiredFormationAircraft`, line 797; `s` is Spacing) | Rebuild |
|---|---|---|
| 4312 (default) | #2 `s` on Lead's left, #3 `s` right, #4 `2s` right | Kept. #2's side becomes a setting, **left by default** (D48). |
| 2134 | the mirror of 4312 | Kept, with the same #2-side setting. |
| Offset box | #1/#2 front element `s + stagger` apart; #3 in the slot `box aft` behind; #4 3,000 ft outside #2 and `box aft` behind | Kept, with V6's 1,000 ft stagger and 3,000 ft, and **box aft 7,000 ft by default** (V6: 8,000; D114; Patrick 05:37Z, SMM 16.41 para 109, matching the offset standard of 7,000 ± 1,000 ft) (named in one place). |
| Two-ship | #2 `s` on Lead's right | Kept. CSV and readouts leave out the pairs that don't exist, instead of V6's "NaN" (#17). |

Dragging an aircraft before Play moves its start position, as in V6. "Follow lead" no longer breaks dragging (#31).

V6's code-only `fluid` and `trail` layouts, never in the menu, are not ported.

### Turns

| V6 turn | What it does (V6) | Rebuild |
|---|---|---|
| Delayed 90, Delayed 45 | Each aircraft turns in the chosen direction, one after another, **outside aircraft first** (lines 1116 to 1150). The offset box has its own plan (line 994). | Kept. The on-screen note is corrected to say the outside aircraft goes first (#16; V6's note says Lead). |
| Hook turn | Everyone turns 90° at once in the chosen direction, the same as In-place 90 (line 1217). | **Rebuilt to Patrick's definition (Q43):** the aircraft turn the same direction through 180°, and the fuselages line up in the middle. V6's hook is pinned first, then the new hook lands as its own commit. The exact rollout picture (who turns when, and where each ends up) is drawn and checked with Patrick before that commit. |
| In-place 90 | Everyone turns 90° at once in the chosen direction. | Kept as V6 flies it (Q43). |
| Shackle | 45° in, then 45° back to the start heading. Both aircraft turn the same way, and the rollback delay does nothing (line 1585). | **Fixed to Dad's note and Patrick's description (Q44a):** the aircraft turn 45° into each other, hold, and roll back, so the formation ends on the original heading, at the same spacing, with each aircraft on the opposite side from where it started (an X from above). The hold is worked out so the spacing comes back the same, and is shown instead of V6's dead "rollback delay" box. If the spacing is too small for two 45° turns, the screen says so. **Two-ship only (D146**, Patrick, decision card 2026-09-30 09:28Z): in the 4-ship formations the Shackle is greyed out and the run falls back to the default turn with the reason shown. V6's shackle is pinned first (history before 41dcde2). Checked against SMM Fig 16.20. |
| Cross turn | 180°, each wingman turning away from Lead's side, Lead in the chosen direction. | **Fixed to the SMM** (16.19 para 64, Fig 16.21): Lead always turns toward #2 and #2 toward Lead, so they cross, and #2 sets its second-half G so it rolls out in LAB at the set spacing (setting, on by default); Direction does not apply and the screen says which way Lead turns. **Two-ship only** (D146, Patrick 09:28Z), greyed out in the 4-ship formations. |

**Per-wingman turn logic** (auto, selected direction, right, left, toward or away from the cue aircraft) is kept. **"Toward" and "away" are swapped back to what they say** (D41, #15).

**Turn degrees** default to the turn's own value (90, 45 or 180) when the turn changes, and a profile's saved value is kept on load (#31).

### Timing

- **Time delay:** aircraft *n* in the turning order starts at *n* × Base delay, plus its own delay error. Kept.
- **Clock position cue:** each aircraft waits until the aircraft just outside it passes the chosen clock position, within the tolerance. Kept, with:
  - The **tolerance box works**. V6 always used 4° because it read the box itself instead of its value (#32). The default stays 4°, so the default behaviour doesn't change.
  - Per-aircraft clock positions keep working, and the status line shows each aircraft's own position and who it waits on, updated live (#32).
  - **The clock cue selectors work** (Q45, Patrick). V6 had them on screen but ignored them. "Clock cue sequence: Outside-in" (the default) keeps V6's cascade, so the default flight doesn't change. "Manual targets" makes each wingman watch the aircraft picked in its "Clock target" (or "Clock cue aircraft" when it has none), turn when that aircraft reaches the clock position picked, and turn the way its own turn logic says. This lands as its own commit after V6's clock cue is pinned.
  - With the offset box, V6's #3 and #4 never turn at the default 5:30 cue (#16). The rebuild says so on screen ("#3 and #4 can't see a 5:30 cue in the offset box; pick Time delay") instead of silently flying straight (Q44c, Patrick). Which cue #3 and #4 should use is flagged for Dad and for revision later.
- **Auto timing** (4312, 2134 and two-ship, delayed turns), with Dad's fixes:
  - **The outside aircraft turns first, then each at its own time** (D43). V6 held everyone until Lead started, so the planned order was never flown (#16).
  - **The step between aircraft is spacing ÷ speed × cot(half the turn angle)** (D44), the delay that rolls out line abreast. At V6's defaults (6,000 ft, 220 KTAS, 90°) that is 16.2 s, where V6's spacing × angle ÷ speed gave 25.4 s. Turn degrees are limited to 10° to 180° so the step stays finite.
  - The computed step is **shown, not written over Base delay** (#16), so switching back to Time delay keeps the user's own value.
  - In the offset box, auto timing keeps V6's offset-box plan.
- **Offset box #4 timing** (Q44b, Patrick): **#4 solves its own delay by ground track**, as V6's note promises and its dead code started to: it searches for the delay that rolls it out 3,000 ft outside #2 and the box aft distance behind the front element, the same way V6 solves #3 (`searchDelayToTarget`, line 979). This is the new default. V6's LATE and EARLY stay as choices, pinned to V6 first, so V6's ~21,000 ft aft left-turn result is still there if picked.
- **Rear element check** (Q47, Patrick): it starts at its set time **or once #3 and #4 have finished their turns, whichever is later**, so it no longer postpones a planned turn. V6's fixed start is pinned first.
- The hidden trigger modes (Lead heading, range, bearing), which V6's menu can't reach, are not ported (#32).

### The flying (integrator)

Each 0.05 s step, per aircraft (V6 `moveAircraftList`, line 1579):

1. G = the G setting plus the aircraft's G error, limited to at least 1.01 (`core` `limitG`).
2. With the Correction model set to "G fix", a wingman's G is nudged by up to ±0.8 toward its spacing. **After that, G is limited to 1.01 again (D74)**, so the aircraft turns gently instead of V6's NaN.
3. Turn rate from speed and G (`core` `turnRateRadPerSec`), the rear-element check first, then the planned turn once its cue is met, up to its goal. The shackle's second leg follows the first.
4. The lag and lead correction models bend the direction of travel by up to 4° × strength, as in V6.
5. Move along the heading at the end of the step, as V6 does (Euler step). This is pinned, not changed.

Changes that don't change a number V6's Step button shows:

- **Fixed steps** (Assumption 4): same result at 60 Hz, 144 Hz, any playback speed, Play or Step (#17).
- **Closure** is the change in the 1-3 distance over the real step, not over a fixed 0.05 s when the step was shorter (#17). With fixed steps, the two are the same.
- **History and trails are kept by time**, not by count: the whole run is in the CSV, and the trail shows the last 60 s (#17). V6 kept 2,000 samples and 800 trail points.
- Speed below 1 kt is refused by the Speed box, so the turn radius can't become 0 and the turn rate NaN.

### Starting, continuing and changing a run

- **Play at t = 0** points every aircraft at the start heading and plans the turn, as V6 does. **Play after the turn has finished** starts a new leg from where the aircraft are, as V6 does (by design, audit b#13), and resets the rear-element check and breadcrumbs for that leg (#31, V6 didn't).
- **Any setup change stops the run and goes back to t = 0 with the new plan** (#31). V6 kept flying the old plan. Changes to layers, the view and playback speed don't stop it.
- **The start heading is a compass heading**: 000 is north, 090 east (D45). The default is 000, flying up the screen (Q42). V6's default of 0 flew east. Continuing a leg fills in the new compass heading.
- **The view fits the formation when the Turn Sim opens** and when Fit is pressed, at the real canvas size and pixel ratio (#30). V6 fitted while hidden and opened at minimum zoom.
- The **MOA box** (V6's 30 NM boundary) is drawn as in V6.

### Readouts and standards (R9)

- **Formation card:** per wingman, V6's labels from `core` `classifyTurnSimPosition` (TIGHT, WIDE, FORE, AFT, ON SPACING) and the one number that's off. The standards line is under More detail, built from the current standards (V6 printed a fixed "4,000 to 6,000 ft interval, ±250 ft of Lead's 3/9; offset box 7,000 to 9,000 ft").
- **Wide and tight position errors are measured from Lead** (D42): "Wide 1,000 ft" moves a wingman 1,000 ft further out on whichever side it flies. V6 moved every aircraft along one fixed direction, so on one side "wide" came in tighter (#15).
- The turn circles use the same G as the flying (with D74 they can no longer disagree).
- **Spacing graph, Solver and Correction model** (Q41, Patrick): V6 hid all three. They come back, each behind its own checkbox, off by default (R22). The graph draws each metric in its own colour with a legend (V6 drew all four in white) and only while open. The solver's sweep is pinned to V6 and runs only when asked, not every frame.
  Where the Solver and the Spacing graph differ from V6 (each has a test in `archive/tests/golden/turn-sim-solver.test.js` or `turn-sim-series.test.js`):
  - **Auto timing:** the port works the auto step out afresh for every trial. V6's sweep never recomputed it and read stale page state, so under Timing = auto V6's answer meant nothing. Solving for the delay under auto gives 60 identical trials (the delay is not used); solving for the spacing flies each trial as a run at that spacing with its own auto step. Logged for Patrick.
  - **Scored at the Duration:** as in V6, each trial is scored by its spacing at the end of the Duration (Lead to #2 in a two-ship, Lead to #3 otherwise), not at the turn's rollout. The port's `readout` says so ("scored at Duration (N s)"); V6's own string, which said only "Error", is kept in `valueText`, `unit` and `errText` and pinned by the golden.
  - **No 2,000-row cap:** V6 dropped the oldest history row past 2,000 (100 s of run), so a long run's graph lost its start. The port keeps every row and the graph shows the whole run.
  - **Colours:** each metric has its own colour and legend label (V6's four pair lines were all white). The six pair colours are Okabe-Ito; the minimum separation is grey and the closure is a dashed line in a blue-violet kept clear of the pair colours under protan and deutan simulation, so it does not lean on colour alone.
  - **Cost:** `solveSpacing` flies 60 whole runs (about 3.9 s at a 600 s Duration and 0.6 s at V6's 75 s, measured in Node). The screen calls it only from the Solver's button, never from a frame or a setting change, and shows a busy state while it runs.
- **Stall-limit G warning** (Patrick 06:58Z, shared T-6A model; D128). Beside the G box, and on each wingman's line when its G error takes it over, the Turn Sim warns **"More G than a T-6 can pull at this speed"** when the G flown is above `core` `stallLimitG(speed)` (SPEC-core, "API, fifth PR: T-6A performance"). It's a warning only: the aircraft still fly the set G, so the V6 turns stay pinned and nothing they show changes. The Turn Sim has no altitude and flies its Speed box with no wind (Assumption 3), so the check treats that speed as indicated airspeed. At V6's 220 kt the limit is about 6.5 G, so the default 3 G and the G-warm's 4 G hook never trigger it.
- **Standards follow the debrief's edits** (Q46, Patrick). The Turn Sim reads the same standards the debrief edits and shows them, read-only, under More detail, with a "Default standards" note when unchanged. A standard switched off judges nothing, so an aircraft it would judge shows no label. The standards need one home both modules read (for example an app-level `standards` setting instead of the debrief's own settings); where it lives is agreed with the debrief and app frame threads through the coordinator before task 5.

### Profiles and CSV (#31, #33)

- **A profile saves the whole scenario**: every Setup, More setup, Aircraft errors and rear-element check value, and each aircraft's dragged start position. Loading one gives back exactly that, including turn degrees. The settings are one versioned object (`storage/settings.js`), checked field by field on load.
- Profiles and the startup default live in `app.storage` (scope `turn-sim`), which never crashes when the browser blocks storage (#33). With storage blocked, the Profiles panel says profiles won't be kept after this visit.
- **Saving over an existing name asks first. Delete profile and Factory reset ask first**, and Factory reset puts the Turn Sim back to V6's defaults without reloading the app (#31). The name box starts empty, not "NFTC Default".
- V6's saved profiles were kept by the old single file in its own browser storage, which the new site can't read. Nothing to migrate.
- **Export CSV** (in Profiles): one row per 0.05 s step over the whole run, with time, the pair distances that exist, minimum separation and 1-3 closure in ft/s, V6's columns (`turn_spacing.csv`). The download link is released after use.

## 2D/3D switch (Patrick, 2026-09-30 07:51Z)

Patrick asked for a 2D/3D switch in every simulator ("can we just do them all in 3d/2d switch on and off now?"). The Turn Sim gets one:

- A **2D / 3D** switch on the Stage bar. **2D is the default**, and the switch is remembered in this browser with the other layout choices.
- 3D shows the same run from the same engine state: each aircraft as the shared CT-156 model (ui-kit `three-aircraft.js` and `ct156-model.js`), at its position and heading, banked by the `bankDeg` the engine reports, with its trail. The camera starts behind and above Lead, and the user can orbit, zoom and follow Lead. Everything else (playback, readouts, Formation card, Settings) is shared with 2D.
- The Turn Sim is flat, so every aircraft flies at one altitude in 3D. The crossing note in the shackle and cross turn (SMM item 6) still applies.
- three.js and the model load **only when 3D is first switched on**, so a 2D-only visit downloads nothing extra. Leaving the Turn Sim or switching back to 2D stops 3D's frames (R4).
- Each aircraft is the shared CT-156 model (ui-kit `ct156-model.js`) with its number. A **Paint** choice in the Turn Sim settings menu picks Harvard (the default, the shared `PAINT_DEFAULT`) or ship colours (#1 blue, #2 green, #3 red, #4 white). If three.js can't load, the screen says "3D needs a connection the first time" and stays in 2D.
- No flight math changes: the golden pins are untouched, and 3D only draws.

## SMM formation additions (Patrick, 2026-09-30 06:40Z)

Patrick asked what else from the SMM the Turn Sim should model, and said to include everything offered: "Includeall of this including your futur ideas". References are SMM section and paragraph numbers (and one EFIG page); the manuals' own text stays out of this repo. Items 1 to 6 change or add to turns V6 already flies, so each is pinned to V6 first (where V6 has the turn) and lands as its own commit (D10). Item 7 (G-warm) is a new exercise, built last (Phase 5, PR E). Item 8 (rejoins, fighting wing, fluid manoeuvring) is a future feature (Patrick, 06:59Z). The plan doc gets a decision number for each from the app frame thread.

What the SMM confirms in this spec as it stands: the hook is a same-direction 180° turn back to LAB (16.19 para 60), and in the offset box the fuselages line up at the 90° point (16.45 para 121), as Q43 says; the shackle's reversal is timed to arrive back in LAB (16.19 paras 61-62), as Q44a says; in spread-4 #4 keeps its position off #3 (16.42 para 116).

### Changes to the turns and timing

1. **Check turn** (16.19 para 58), a new entry in the Turn menu: every aircraft turns at once through 30° or less and rolls out. Turn degrees for it run 5° to 30°, default 30°. Larger in-place turns are the existing In-place turn. Not in V6, so there is nothing to pin; the test states the rollout (same spacing, heading changed by the set amount).
2. **Clock cue at 5 or 7 o'clock** (16.19 paras 52 and 54): the inside aircraft starts its turn when the wingman gets to the 5 or 7 o'clock position, depending on the turn direction. The clock position gets a new default, **"Auto (5 or 7 by direction)"**: 7 o'clock in a right turn and 5 o'clock in a left turn, the side the wingman comes from. Any fixed position (V6's 5:30 included) can still be picked. V6's 5:30 is pinned first; the engine's picture confirms which side is which before the commit. For the Delayed 45 the Auto position is 4:30 in a right turn and 7:30 in a left (after the first aircraft passes the tail, Fig 16.16), which rolls out abreast within about 250 ft; 5 and 7 o'clock left the pair 1,000-2,000 ft short of abreast.
3. **Delayed 45 into and away from the wingman** (16.19 paras 56-57): flown the SMM way instead of V6's "each aircraft turns 45° in order". Into the wingman: Lead turns 45° into the wingman, who starts as for a 90, carries on in front of Lead to the other side, and rolls out in LAB on the new heading. Away: the wingman starts a turn toward Lead and rolls out on the new heading at Lead's signal, and Lead crosses to the wingman's other side and takes up the new heading back in LAB. "Into" or "away" follows from the direction and #2's side. No aircraft completes 90°; the run ends in LAB on the 45° heading with sides swapped. Checked against SMM Fig 16.16 (Patrick 09:25Z: use the SMM pictures; he checks on the live site, so the picture check before the commit is waived).
4. **Cross turn in two stages** (16.19 para 64): both aircraft turn toward each other at 2 G for about the first 90°, then at 3 G to roll out after 180°. The G setting is the second stage (3.0 by default, D113); a "Cross turn first-stage G" (2.0) and the switch point (90°) go under More setup. V6 flew one G all the way, which is pinned first.
5. **Offset box delay of 10 to 15 s** (16.41 para 112): in delayed and hook turns #3 and #4 delay 10 to 15 s so they miss #1 and #2 and flow to trail. The solved delays for #3 and #4 are shown against that band, with **"outside 10-15 s"** when they fall outside it. By default ("Fly to the box slot (solved)") each of #3 and #4 has its delay solved so it rolls out box aft behind the front element in its slot (#3 between Lead and #2, #4 outside #2), which is what the SMM delay is for (Fig 16.30); when the solved delay falls outside 10-15 s (turns toward #2's side) the band readout says so. "Rear element delay (SMM)" (fixed, default 12.5 s), V6's late/early and the ground-track solve stay as choices. Under the clock cue, #3 and #4 can't see their cue in the box, so they turn on the rear element timing and the screen says why. In the box hook at 3 G the rear element passes the front element nose to nose; the screen shows "Crossing: 300 ft vertical needed" for those pairs. In in-place and check turns the rear element doesn't delay: all four turn together. V6's behaviour for those turns in the offset box is pinned first, and any change is its own commit. This also gives Dad a starting point for Q44c: the SMM times #3 and #4 by a delay, not by a clock cue.
6. **Delayed 45 with a check turn** (16.19 paras 55-57, Figs 16.17, 16.31, 16.34): a "Delayed 45 style" setting: Auto (default: the check in 4312, 2134 and the box, the plain 45 in the two-ship, where the SMM makes the check optional), Plain, or With check turn. The outside aircraft turns its 45; the others check 10-15° toward it (setting, default 12.5°) and turn their 45 when the one before has passed the tail, at 5 o'clock in a right turn and 7 in a left. It rolls out line abreast about 3,900 ft apart at the defaults, as the figure's tight wedge; "Roll in to hold the set spacing" (off) ends at the set spacing but aft of abreast. In the box the rear element's delay is solved so the box keeps its shape and the band readout flags it; the #4 timing and rear delay fields are greyed with the reason. The clock cue always flies the plain 45. Pairs passing 300-1,000 ft apart show "Close pass: N ft, #a and #b: altitude separation needed" (our threshold; the SMM separates such passes by altitude). Judgement calls are logged for Patrick's review.
6. **Separation flags** (readouts only, no flight change):
   - **"Under 300 ft"** on the Formation card when any pair is closer than 300 ft (16.13 para 31, the minimum crossing separation in LAB; also 16.23). In the shackle and cross turn, where the aircraft cross by design and the SMM has the wingman pass above or below, the flag reads **"Crossing: 300 ft vertical needed"** instead, since the sim is flat.
   - **"Mutual support lost"** when a line-abreast pair is more than 9,000 ft apart (16.18 para 49).
   - Both numbers are named constants in the engine with their SMM references. If Patrick wants them editable, they move into `app.standards` through the coordinator.

### New exercise (Phase 5, PR E)

This needs one thing the engine doesn't have yet, added as a pure engine function with unit tests: **a sequence of turns** flown one after another (each starting when the last ends, plus an optional wings-level gap). It opens from a collapsed **"Exercises"** panel in Setup (R22), so the first-time screen doesn't change, and it has its own checklist lines in `docs/checklists/turn-sim.md`.

7. **G-warm** (16.22 paras 70-71; 4-ship as spread-4, 16.44): one button sets up and flies the SMM sequence from LAB at 220 KIAS or more: an in-place 90 at 3 G toward the wingman, 5 s of the ½ G push, a 4 G hook, and an in-place 90 at 3 G back to the original heading. The push is vertical, so the sim flies it wings level for 5 s and labels it. Direction picks left or right; the 4-ship picture is checked with Patrick before its commit.

### Future features (not built now)

8. **Rejoins, fighting wing and fluid manoeuvring** (Patrick, 06:59Z: keep them as future features). Kept here so the SMM work isn't lost; each needs a wingman that flies to a position relative to Lead at its own speed (lead, pure or lag pursuit, SMM 16.16), which the engine doesn't have.
   - **Rejoins from line abreast** (16.20 para 65): straight-ahead and turning (Lead at 30° bank, into or away from #2), #2 to fighting wing on the same side, overtake 10 to 20 KIAS (ch. 12 Rejoins), with an overshoot flag.
   - **Fighting wing** (16.15; ch. 12 Fighting Wing; EFIG p.391): #2 holds 30° to 60° of sweep at 500 to 1,000 ft behind Lead through level turns and reversals.
   - **Fluid manoeuvring** (16.17 paras 42-43): #2 inside a 60° cone at 500 to 1,000 ft, with the 500 ft bubble flag (16.23). Level turns and reversals flat; the loop, wingovers and barrel roll need 3D and could reuse the Turn Fight's Energy model (D112).

## What the Turn Sim needs from `core`

Already there, used as they are: `stallLimitG` (T-6A performance, for the G warning), `limitG`, `MIN_TURN_G`, `turnRadiusFt`, `turnRateRadPerSec`, `bankDegFromG`, `ktToFtps`, `formatNm`, `distance`, `degToRad`, `radToDeg`, `wrapDeg180`, `relativeBearingDeg`, `clockToRelativeDeg`, `compassDegToHeadingRad`, `headingRadToCompassDeg`, `formationAxes`, `classifyTurnSimPosition`, `V6_STANDARDS`.

Needed from the Flight math core thread:

- **SPEC-core Task 12 (D74):** the Turn Sim's G correction (V6 line 1583) as a `core` function, pinned to V6's order first (limit, then correct, NaN below 1 G), then with the 1.01 floor after the correction as its own commit. The engine calls it in step 2 above. It's needed before engine task 7 (see the todo).

Nothing else. The rest of the Turn Sim math (slots, planning, cues, rear check, integrator) is used only here, so it stays in `src/modules/turn-sim/engine/`, pinned by this module's golden tests the same way `core` is pinned (`archive/tests/golden/v6-source.js`, read-only). If the Flight math core thread would rather hold any of it, it moves before it's written.

## Module structure

```
src/modules/turn-sim/
  README.md            what's where, and how to change common things (R8)
  index.js             mount(root, app): builds the screen, wires settings to the engine; unmount cleans up
  settings.js          the versioned settings schema and V6's defaults; no page access
  engine/              pure, Node-tested, no page access
    formation.js       slot tables, position errors (D42), #2's side (D48)
    plan.js            turning order, directions (D41), time/clock/auto timing (D43, D44), offset-box plan
    cues.js            clock-cue crossing, cue checks
    rear-check.js      the offset box's rear-element check turn
    solver.js          V6's solver sweep (Q41)
    sequence.js        turns flown one after another, with wings-level gaps (G-warm)
    step.js            one fixed step: G (core, D74), turn, move
    run.js             a run: start, continue a leg, history by time, CSV rows
  layout.js            the three columns, panels, playback bar
  view3d.js            the 3D view on ui-kit three-aircraft.js, loaded only when switched on
  view.js              drawing: grid, MOA box, trails, breadcrumbs, 3/9 lines, turn circles, clock marks, labels
  exercises.js         the Exercises panel (G-warm)
  graph.js             the spacing graph (Q41), drawn only while open
  readouts.js          Formation card and More detail rows from engine results; no page access
  profiles.js          named profiles and the startup default over app.storage
  turn-sim.css         scoped under [data-module="turn-sim"]
tests/unit/turn-sim/    engine, settings, readouts, profiles
tests/golden/turn-sim-*.test.js   engine vs V6's own functions, run unchanged
tests/e2e/turn-sim.spec.js
docs/checklists/turn-sim.md
```

## Commands

```
npm run dev                 # the Turn Sim at http://localhost:5173/#/turn-sim
npm test                    # unit and golden tests (node --test)
npm run test:e2e            # browser tests
npm run build && npm run preview   # measure a production build
python3 tools/rebuild_original.py /tmp/v6.html   # V6, to compare side by side
```

## Code style

As in `core`: plain ES modules, pure functions, units in names, and a comment naming the V6 line each ported piece came from. The engine takes a plain scenario and returns plain state, so V6's page globals (`$('spacing').value`, `ac`, `t`) become arguments.

```js
// src/modules/turn-sim/engine/plan.js
/**
 * Auto timing step between aircraft, in seconds (V6 computeAutoDelay, line 1369,
 * changed by D44 to spacing ÷ speed × cot(half the turn angle)).
 */
export function autoDelayStepSec(spacingFt, speedFtps, turnRad) {
  return (Math.abs(spacingFt) / Math.max(1, speedFtps)) / Math.tan(Math.abs(turnRad) / 2);
}
```

## Testing strategy

1. **Golden first (D10, R9).** Before any engine function is written, a golden test runs V6's own function, cut out of `original/shell.html` by `archive/tests/golden/v6-source.js` with a small fake of the page's boxes (`$`) as its prelude, next to the port. Then whole runs: every formation × turn × direction × timing at V6's defaults and a set of seeded settings, stepped at 0.05 s, compared position by position each second. Exact match, no tolerance.
2. **Each decision is its own commit** that changes the pinned value on purpose and names its D#: D41 (toward/away), D42 (wide/tight), D43 (auto order), D44 (auto step), D45 (compass heading), D48 (#2's side), D74 (G floor, in `core`). A test states each: for example, auto timing at the defaults rolls out line abreast at 6,000 ft, within a tolerance the test states and explains.
3. **Unit tests** (`tests/unit/turn-sim/`): settings (defaults, bad values refused, versioned, profile round trip keeps everything), readouts (two-ship has no NaN), history by time, a setup change resets the run, a new leg resets the rear check and breadcrumbs, the clock tolerance is used.
4. **Cross-check with V6 in a browser.** `pf/flight-math-check/turnsim.js` already drives V6's real Turn Sim in Playwright; its numbers (presets, wide/tight, toward/away, auto timing) are copied into the golden tests as a second check.
5. **Browser tests** (`tests/e2e/turn-sim.spec.js`, Playwright, failing on any console error, R7):
   - Open the Turn Sim: fitted, nothing overlapping at 1366 × 768 and 1920 × 1080, with every panel open (R2, #30).
   - A first visit shows only the essentials (R22); Reset layout restores them.
   - Every input starts with its default (none blank), and Play works on a first visit without typing anything.
   - Every button does something (R3).
   - Play, change a setting mid-run: the run stops and resets (#31).
   - Save a profile with errors and a rear check, reload, load it: identical (#31).
   - Storage blocked: the Turn Sim opens and plays (#33).
   - Leave the Turn Sim: no frames, timers or listeners left (R4, #39).
6. **Sign-off checklist** `docs/checklists/turn-sim.md` (R21), for Patrick or Dad: fly each formation and turn, compare a few rollouts with V6 side by side, and check the D41 to D45 fixes look right.

## Performance

Following performance-optimization: measure first, log each attempt in the PR. Target: 60 frames per second at 4× with all layers on at 1920 × 1080 on a mid-range laptop, and no drawing while paused. At 4× that's about 5 steps a frame, which is small; the risk is drawing (trails, breadcrumb labels), so trails are drawn as one path and readouts update at most 10 times a second.

## Security

A profile is data from this browser only, but it's still checked field by field on load (finite numbers in range, known option values), and profile names go on screen through `textContent` (ui-kit `h()`). There's no file import and no network use.

## Skills used

From `.claude/skills/README.md`, at each step:

| Step | Skill |
|---|---|
| This spec | spec-driven-development |
| The task plan (`tasks/turn-sim/`) | planning-and-task-breakdown |
| Every engine task | test-driven-development (golden test against V6 first, then each decision as its own commit), incremental-implementation |
| The screen | frontend-ui-engineering with `.claude/references/accessibility-checklist.md`, incremental-implementation, `/run` |
| Smooth animation | performance-optimization with `.claude/references/performance-checklist.md` |
| Profiles loaded from storage | security-and-hardening (checking saved data), `/security-review` |
| Red CI, a golden mismatch, a browser error | debugging-and-error-recovery |
| Before any PR leaves draft | code-review-and-quality, `/code-review` |
| Polish | code-simplification, `/simplify` |

Each PR description lists the skills it applied.

## Boundaries

- **Always:** pin V6 before moving any number; take shared math from `core`; keep the module inside `src/modules/turn-sim/`; run `npm test` before each commit; cite the V6 line.
- **Ask first:** any change to a number V6 shows beyond D41 to D45, D48, D74, D113, D114, Patrick's answers to Q41 to Q47 and the SMM formation additions; the 4-ship G-warm pictures before their commits (the hook, shackle and delayed 45 picture checks were waived by Patrick 09:25Z in favour of the SMM figures); adding a package.
- **Never:** edit `original/`, `src/core/`, `src/ui-kit/` or `src/storage/` (changes go to their threads through the coordinator); keep a timer or animation loop outside the ui-kit scheduler; touch `localStorage` directly.

## Success criteria

- Every engine function and whole-run scenario has a golden test against V6, and each of D41 to D45, D48, D74 and the flight changes from Q43 (hook), Q44 (shackle, #4 solver), Q45 (clock cue selectors) and Q47 (rear check) is its own commit with a test that states it.
- R2, R3, R4, R7 and R22 pass their browser tests on the Turn Sim route; results are the same at any frame rate and playback speed.
- Issues #15, #16, #17, #30, #31 and #32 are closed or reduced to the offset box clock cue message (Q44c, D87: #3 and #4 use the 10-15 s delay), and the Turn Sim parts of #29, #33, #34, #35, #39 and #43 are gone.
- Each SMM formation addition being built (items 1 to 7) has a test that states it, and the changes to V6's turns (items 2 to 5) are each their own commit after the V6 pin.
- Patrick or Dad signs off the checklist on the live site.

## Answered questions

Patrick answered all seven on 2026-09-30 (in the "Open questions explained" thread; mapping in `pf/questions/answers-2026-09-30.md`). Each flight change lands as its own commit after V6 is pinned (D10).

| Question | Answer | Where in this spec |
|---|---|---|
| Q41 (TS1) hidden cards | Bring back the Graph, Solver and Correction model, each behind a toggle, off by default. | The screen; Readouts |
| Q42 (TS2) start heading | 000, flying up the screen. | Starting a run |
| Q43 (TS3) hook and in-place 90 | Don't merge. Hook: same direction through 180°, fuselages lined up in the middle. In-place 90: a 90° turn. | Turns |
| Q44a (TS4) shackle | Ends on the original heading, same spacing, each aircraft on the opposite side: an X from above. | Turns |
| Q44b (TS4) offset box #4 | Finish the ground-track solver so #4 works out its own timing. | Timing |
| Q44c (TS4) offset box clock cue | Keep the on-screen message. Closed by Patrick 07:21Z (D87, "Keep those. go"): #3 and #4 use the SMM 10-15 s delay (16.41 para 112) as a setting; no question to Dad. | Timing |
| Q45 (TS5) clock cue selectors | Wire them up. | Timing |
| Q46 (TS6) standards | Follow the debrief's edited standards. | Assumptions; Readouts |
| Q47 (TS7) rear check | Start at the set time or once #3 and #4 finish turning, whichever is later. | Timing |

## Open questions

- **For Patrick, before those commits:** the rollout pictures for the 4-ship G-warm, drawn from the rebuilt engine. Judgement calls made while he was away are rows in pf/logs/decisions-for-review.md.
