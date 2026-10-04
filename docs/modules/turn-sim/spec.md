# Turn Sim spec

This file has two parts. The first is the spec for the **first version of live mode**, approved by Patrick on 4 Oct 2026 at 10:03Z (decision card "Approve the Turn Sim first-version spec and screen as drafted?"), which is what the Turn Sim shows from V2.6. The second is the **plan-mode spec from before the reset**, kept unchanged below for the plan-mode code that is still in the repo but no longer on screen. Where the two disagree, the first part wins. Decisions are in `decisions.md` (TS-35 onward for this version); the review notes behind it are in the project files at `turn-sim-review/` (`compare-and-recommend.md`, `line-abreast/line-abreast.md`, `architecture/architecture.md`, `first-version/`).

# Part 1. First version: a 2-ship in line abreast with manoeuvre buttons

## 1. What it is

A 2-ship in line abreast that flies along on its own. You press a manoeuvre button and the pair flies it the way the SMM draws it, then carries on in line abreast until the next press. The camera follows the pair and each aircraft's ground track stays drawn. This is the first slice of live mode (TS-R1). Plan mode, the 4-ship, errors and the rest of V6's features come later, one at a time, on the same flying core (section 6).

## 2. How the aircraft fly

| # | Rule | Source |
|---|---|---|
| F1 | Every aircraft flies a pre-planned path that is kinematically accurate. The path is worked out when a button is pressed, from where each aircraft is at that moment. It is flown with realistic roll rate, bank, pitch and G, and the turn radius and rate follow from speed and G. Each manoeuvre uses the bank and G its source gives. | Patrick, 4 Oct 08:53Z (wording approved); TS-36 |
| F2 | Roll: the roll rate builds at 360°/s² up to 90°/s and eases off the same way, so 0 to 70.5° of bank takes about 1.0 s. Uses the shared `easeRoll`. | Patrick, 08:54Z and card 09:54Z; TS-37 |
| F3 | Speed: 220 KIAS held constant through every manoeuvre, flown as true airspeed at the block height (shared `iasToTasKt`). Speeds on screen say KIAS. | Patrick card 09:54Z; 220 KIAS SMM 16.18 para 50; KIAS rule TS-R6; TS-38 |
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

Not in the first version (later, in this order unless Patrick reorders): G-warm, entry to line abreast, rejoins, other formations, 4-ship.

## 4. The screen

Picture: `turn-sim-review/first-version/screen-mockup.png` in the project files. V6's: `archive/2026-10-reset/1-requirements/agents/shots/turn-sim/v6-default.png` in the project files.

**On the screen**
- Top bar: Play/Pause, Reset, playback speed (0.25× to 4×), time, 2D/3D, Layers.
- Left: the manoeuvre buttons (section 3), then Setup with two boxes: Spacing (default 6,000 ft, the briefs' wide side; 4,000 to 6,000 is the SMM band) and "#2 on Lead's" Right or Left (default Right). Below them, one fixed line: "220 KIAS · 8,000 ft · 3 G turns (71° bank) · still air · roll 90°/s".
- Centre: the picture. The camera follows the middle of the pair and eases its zoom to keep both in view with a turn circle's room each side (it stops zooming for you once you zoom yourself, until Reset). Ground tracks for the whole flight, a 1 NM ground grid, Lead's 3/9 line, and both aircraft's planned paths drawn dashed while a manoeuvre is flown.
- Layers (closed menu): ground tracks (on), 3/9 line (on), planned path (on), turn circles (off), 3D paint.
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

Code: `src/modules/turn-sim/live/flight.js` (one aircraft, one step), `live/manoeuvres.js` (the builders), `live/formation.js` (the pair, presses, tracks, judging), `live/errors.js` (training errors, section 8), `index.js` (the mount), `layout.js` (the screen), `view.js` and `view3d.js` (the pictures). Shared math only from `src/core/` (`easeRoll`, `turnRateFromBankRadPerSec`, `gFromBankDeg`, `bankDegFromG`, `turnRadiusFromBankFt`, `pitchDegFromClimb`, `iasToTasKt`, `wrapPi`).

## 7. Checks (light, per the rule book)

Pilot-recognisable end pictures only (`tests/unit/turn-sim/live.test.js`): each button, both directions and with #2 on either side, ends in the picture in section 3 (who is where, which way they face, spacing within ±100 ft of the start, heading within ±5°); bank never passes the manoeuvre's bank by more than half a degree and G stays at 3; the shackle and cross turn keep at least 300 ft vertical at the cross; every hand-over is smooth (F12: no jump in position, track, bank or pitch, roll rate within 90°/s, its build-up within 360°/s², pitch rate never stepping by more than 0.5°/s, about 0.1 G); a press while flying is queued. No time gates. CI on the pull request is the one check. Sign-off: Patrick flies every button in the real app from the default start.

## 8. Training errors (TS-52, added 4 Oct, not yet in Patrick's sign-off)

A training aid, behind a closed "Errors (training)" section in the Manoeuvres panel. Default off: with every error "none" the screen and the flying are exactly as in sections 1 to 7.

| Setting | Default | Range | What it does | Source |
|---|---|---|---|---|
| Fore/aft | none | ahead, behind; amount 100 to 3,000 ft (default 1,200) | #2 starts that far ahead of ("sucked") or behind ("acute") the SMM slot, along Lead's heading. The working reading of those two words is Patrick's to confirm. | SMM 12.18 para 39 (station-keeping terms), 16.18 para 49 (bands); amount: estimate |
| Spacing | none | wide, tight; amount 100 to 3,000 ft (default 1,500) | #2 starts that far wider or closer than the Spacing box. | SMM 16.18 para 49, 16.19 para 54 NOTE; amount: estimate |
| Height | none | high, low; amount 100 to 2,000 ft (default 500) | #2 starts that far above or below Lead. | SMM 16.13 para 31; amount: estimate |
| Timing | none | late, early; amount 0.5 to 10 s (default 2) | #2's first roll-in goes that late or that early. Early beyond the button press makes Lead wait, so the press time is not moved. | SMM 16.19 paras 58, 62; amount: estimate |
| Response | Fix it | Turn at normal reference, Fix it | See below. | Patrick 4 Oct 10:51Z |
| Random error | off | on, off | At Reset, picks one error of a random kind, a random way and a random size (fore/aft 500 to 2,500 ft, spacing 1,000 to 2,500 ft, height 300 to 1,000 ft, timing 2 to 6 s). The card says which. | Patrick 10:51Z (training aid); ranges: estimates |

**Turn at normal reference.** #2 flies the standard manoeuvre, standard timing and bank, from where he is. The error is carried through: the end picture is the SMM picture plus the start offset, turned with Lead's heading change. (SMM 16.19 para 52 NOTE: the wingman who does not adjust keeps the error.)

**Fix it.** #2's plan is computed at the button press, as for every other manoeuvre, to end in the SMM picture. The levers are only what the aircraft can do at constant speed (TS-38): a delay before the roll-in (at most 30 s), the shackle's reversal time (plus or minus 20 s), bank on each half of the turn (50 to 75°, which is 1.6 to 3.9 G; above 3 G is flagged, not walled), and for height a smooth climb or descent (at most 60 ft/s, no step in climb rate). "Closer, turn early; wider, delay" is SMM 16.19 para 54 NOTE; "adjust the G or the anticipated heading" is para 52 NOTE; check turn gains LAB, para 58; shackle reversal timing, para 62; cross turn, para 64. The limits are estimates. A single turn is solved as two half-turns, so the bank can change at the 90° point (TS-48), with the bank change rolled smoothly (F12).

**When the error is too big to fix.** Position along Lead's line (fore/aft) cannot be fully taken out at constant speed in the check turn, the Delayed 45 and the shackle; the lever there is a speed change, which TS-38 forbids. The planner flies the nearest it can, the Formation card says "fixed part of it" and gives the distance left. Nothing is clipped or snapped.

**On the card.** The Formation card gains two lines: which errors are set and the mode, and, after roll-out, what happened ("#2 fixed it and ended in position", "#2 fixed part of it and ended 340 ft behind", or "#2 turned at the normal reference, so the error carried through"), plus any flag (G above 3, 3-D separation under 300 ft at the cross).

**Failure and stale data.** A bad or missing error value is treated as "none" or the default amount; an unreachable fix is flown as near as possible and reported, never hidden. No outside data is used.

Code: `src/modules/turn-sim/live/errors.js` (the offsets, the two modes, the card text); small hooks in `live/formation.js` (build, start, finish), `layout.js` (the Errors section and card lines) and `index.js` (settings and `cardFor`).

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
