# Turn Sim

On screen this module is called **Pat's Formation Simulator** (from V2.14). Its code name stays `turn-sim`, in the folder names, the decision prefix TS- and the tests.

This folder is the formation turn sim. From V2.6 it shows the first version of live mode: a 2-ship in line abreast that flies along, with a button for each SMM line abreast manoeuvre. From V2.7 a Setup option makes it a 4-ship (Spread 4, `spec.md` section 14). Start here, then read only the file you need.

## Where it stands

Live as a PROTOTYPE, Formation V2.102 on main. The Turn Sim review is done (4 Oct): Patrick chose a new flying core with planned, kinematically accurate paths, and approved the first version's spec (`spec.md` Part 1; decisions TS-35 to TS-49). The flying core is in `src/modules/turn-sim/live/`. The plan-mode code was retired in #407 (Patrick's yes, 5 Oct 01:36Z). Nothing since V2.91 has been flown by Patrick yet (as of 6 Oct).

The refactor plan's steps 1 to 5 are merged: V2.92 envelope gate (#495, TS-93); V2.93 one candidate shape, hot rejoin retired (#496, TS-94); V2.94 numbers register (#501, TS-95); V2.95 Smart wingman, fighting wing cone energy and move #2 in the band (#505, TS-96, TS-98); V2.96 events file (#506, TS-97). The four-ship rebuild, refactor PRs 6 to 8, is merged too: V2.97 close moves (#510, TS-99), V2.99 rejoins and the rejoin height fix (#515, TS-101), V2.101 opening out, `four-ship-moves.js` retired (#518, TS-99). Fable's fighting wing fixes in between: V2.98 fighting wing turns on pursuit curves (#512, TS-100) and V2.100 the fast side switch (#517, TS-102), which holds its spacing geometry first since V2.102 (#521). The refactor plan is complete.

How #2 is flown, in one line: every 2-ship change of formation is planned by the unified tracker (kinematic lines completely removed, TS-150), with doctrinal canopy and step-down gates enforced inside 2,000 ft and 1,200 ft (TS-151), the turning rejoin capturing the 45° X line without overshooting and displaying the 45° X guide line in bright green dashed (TS-152, TS-153, V2.198), and planned again at events (the section below, and `spec.md`). The Rates setting (Student, Instructor, AI) is under More.

Where things live (TS-64, TS-95, TS-97): the slots for the 2- and 4-ship in `live/slots.js`, the one classifier and judge (card, roll-out verdict and tags) in `live/judge.js`, the numbers in `live/rates.js` (with the Rates experience profile, TS-141), `live/bands.js` and `live/moves.js` (with the one speed table, TS-141) (listed with sources in `numbers.md`; `live/tuning.js` only re-exports them), the tracker (the fallback for odd starts) in `live/tracker.js`, and the events that plan a change again in `live/events.js`.

## How #2 is planned now (V2.75 to V2.101)

Read this before changing any 2-ship move. The decisions say why; this is the picture.

- **One chooser** (`live/chooser.js`, TS-76): every "Change formation" press runs every planner that applies (turning rejoin, straight-ahead rejoin, drop back, line then tracker, tracker, and "from here", TS-94), checks each like a pilot would (the aircraft's envelope, the G rule, never ahead of Lead's 3/9 line inside 1,000 ft, never through Lead; TS-93), and flies the quickest that passes. The vertical is one of the turning rejoin's tries (TS-82).
- **Re-planned at events, never queued** (spec F1 and F11): at the press, the hand-over, the decision point and when the picture breaks, the change is planned again from where the pair is (`live/replan.js`, `live/events.js`). A turn or a new change pressed mid-move flies at once (TS-78, TS-79).
- **Done when in the band, not on a spot** (TS-78, TS-80): tactical formations anywhere in their band (fighting wing anywhere in the cone, line abreast 4,000-6,000 ft, 0-10°, 2,000 ft stack); close formations within 5 ft and 5 kt. Fighting wing legs aim for the cone, not a slot (TS-83).
- **Two rate sets** (`live/rates.js` `RATE_SETS`, TS-84): holding close formation is slow and smooth so #2 can stay in place (echelon turns about 4-5 s to 60°, 2 G); everything tactical is unrestricted, the aircraft's own handling.
- **Energy is real:** a climb costs speed, a descent gives it, and the pull of a height change is charged as G (TS-82). Power is worked out at the G and climb being flown.
- **Geometry first, power as needed** (Patrick 6 Oct 01:24Z: "if they want to swap sides they have to do what they need to with geometry, then power, to maintain position. this is fundamental for any formation movement"; 01:25Z: "geometry includes the vertical"). Fighting wing turns fly pursuit curves (TS-100) and the side switch is a fast S-turn at 60° (TS-102).
- **The 4-ship flies on the same planners** (TS-99, TS-101): every wingman's legs go through the one envelope gate, off the aircraft he flies off.

## Lessons (Fable's reviews and the Formation thread, 5 Oct)

1. **Name the kind of speed.** Rates are overtake in KIAS above Lead, not range rate; compare like with like.
2. **Fly in Lead's turning frame.** In a turn Lead's turn does most of the closing; a place inside his turn needs less speed than his.
3. **Manoeuvring costs energy.** Clamp every plan with the full-power and slow-down rates at the G and climb being flown. At 220 KIAS and 8,000 ft the T-6 has only about 1 kt/s in hand, so use geometry and height first and power last.
4. **Fly like a pilot, not a controller.** Set a bank and a power and hold them; avoid re-aiming every step.
5. **Finish on the band, not the slot.** Creeping onto one spot is what made changes slow.
6. **Rate caps live in Lead's frame;** keep arrival and departure rates apart. When a move looks slow, check the STRETCHED flag in a dry run before touching rates.
7. **Write the method down first; after two failed fixes, find the cause** by reading the whole chain end to end. The patch rounds of V2.22 to V2.62 only moved the problem around.

The full notes, outside the repo: `turn-sim-review/fable-compiled.md` and `turn-sim-review/chooser/plan.md` (sections 9-15) in the project files.

## What is next

The plan's steps, in order: Step 1: the review (done); Step 2: the first version (built); Step 3: retire the plan-mode code (done, #407); Step 4: next features one at a time on the same core; Step 5: sign-off. The refactor plan is complete (V2.101). Next, once Patrick has flown it: click to place #2 (`future.md`, queued by Fable with Patrick, 6 Oct). Only what is in `plan.md` gets built.

## The files

| File | What it holds |
|---|---|
| `spec.md` | How the module works: screens, behaviour, data, and what happens when data fails |
| `requirements.md` | What the module must do, in Patrick's words, with how each is checked |
| `decisions.md` | Decisions in force (new IDs), replaced ones and their history, and decisions waiting on a question |
| `testing.md` | This module's testing rules, its sign-off checklist and its list of tests |
| `plan.md` | The ordered steps and checkboxes; the last step is the sign-off |
| `future.md` | Ideas not being built until Patrick moves them up |
| `numbers.md` | Every flying number with its source; made by `tools/turn-sim-numbers.mjs`, not edited by hand |

The flying core, `src/modules/turn-sim/live/` (each file's header says its job):

| File | Its job |
|---|---|
| `formation.js` | The pair: presses, tracks, rolling record, roll-out judging; calls `events.js` each step |
| `formation-words.js` | The screen words: a press's label, into or away from #2, the compass heading and G-warm's G flown (clean-up step 3, from `formation.js`) |
| `events.js` | The events that plan a change again (decision point, picture breaking), a turn pressed mid-change, and "done" in band and steady (TS-97) |
| `chooser.js` | One chooser: scores every planner and flies the quickest that passes (TS-76) |
| `replan.js` | The "from here" candidate: a press mid-move is planned again at once, nothing queued (TS-78, TS-79) |
| `flight.js` | One aircraft per step; the envelope gate (TS-85, TS-93) |
| `judge.js`, `slots.js` | The one judge and classifier; the formations' places and bands |
| `rates.js` | The G rule, the two rate sets, the Rates setting, roll and bank limits (TS-95) |
| `bands.js` | What "in position" and "done" mean (TS-95) |
| `moves.js` | Each move's numbers: speeds, rejoins, lines, fighting wing turns, tracker, fluid, opening out, lag roll (TS-95) |
| `tuning.js` | Re-exports `rates.js`, `bands.js` and `moves.js`; holds no numbers |
| `move-in-band.js` | Moves #2 anywhere in the band when he is in position (TS-98) |
| `turning-rejoin.js`, `straight-rejoin.js`, `echelon-to-fw.js`, `open-out.js`, `lag-roll.js`, `rolling-rejoin.js` | The planners the chooser tries |
| `rejoin-law.js` | The one rejoin law both rejoins fly down the line to the decision point, and the one check for Lead's 3/9 line (clean-up step 4, TS-139) |
| `pilot.js` | The one pilot model every held-command planner and the tracker fly through: speed from the power at the G flown, one jerk limit, power hysteresis, shaped roll (clean-up step 5, TS-141) |
| `kinematic.js`, `kinematic-moves.js`, `line-moves.js`, `hand-over.js`, `tracker.js` | Lines, hand-overs and the tracker |
| `replay.js` | Flying a planned move one step (the replayed bank track and pose track), the dry run, recorded flights and the speed segment (clean-up step 3, from `transitions.js`) |
| `recipes.js` | The tracker's leg recipes for each move (slide, stop at a corner, close through route, rejoin, open out, drop back, sweep out, straight ahead) and `legsFor`, the legs from one formation to another (clean-up step 3, from `transitions.js`) |
| `lead-turn-in.js` | Lead's turn into #2 in a turning rejoin, held until #2 is in, and the tracker's part behind it (clean-up step 3, from `hand-over.js`) |
| `transitions.js` | The change limit, the words for a change, and `planGoTo`, the tracker-only planner kept as a fallback |
| `fluid.js`, `fluid-lead.js`, `fluid-wing.js` | Fluid manoeuvring |
| `four-ship.js`, `four-ship-card.js`, `g-warm.js` | The 4-ship's screen pieces |
| `four-plan.js`, `four-legs.js`, `four-close.js`, `four-rejoin.js`, `four-open.js` | The 4-ship's moves on the 2-ship's planners (refactor PRs 6 to 8): the from-to graph, the legs, close moves, rejoins, opening out |
| `errors.js` | Training errors and the Smart wingman (TS-52, TS-96) |

Files not named here (`attitude.js`, `full-power.js`, `power.js`, `slow-down.js`, `formation-turns.js`, `manoeuvres.js`) are flight helpers and move builders; read the header of the one you need.

## Open questions

Each has a working answer that the tool uses until it is settled.

### Waiting on Patrick now (also on the list in `../../PLAN.md`)

- **Fly the rebuilt 4-ship** (V2.101): every Change formation press from Spread 4, fighting wing, finger and Fluid 4, against `testing.md`'s 4-ship list.
- **Fly the first version** from the default start, every button both ways (`testing.md`, "First version" checklist, a draft for Patrick's own words), and the **4-ship** (V2.7; `testing.md`, "4-ship" checklist). The 4-ship's working answers to confirm (TS-50): the delayed 45's check turn is 10°, the altitude stack is the brief's on either side, and the check leaves the first aircraft to check about 200 ft tight.
- **Fly the Change formation buttons** (TS-53, built 4 Oct, `testing.md`, "Sign-off checklist, changing formation"), and confirm the estimates: fighting wing default 750 ft at 45° and 60 ft below Lead, Lead's pause then 30° turn into #2, #2's 60° bank cap and 15 KIAS overtake, hot and cold line at 60° and 30°, the close-formation offsets.
- **Fly G-warm and the 4-ship Change formation buttons** (TS-54, V2.13, built 4 Oct; `testing.md`, "Sign-off checklist, 4-ship G-warm and changes"), and confirm the estimates in TS-54. The stack conflict is settled: you chose "come off first" (19:11Z, TS-55).
- **Fly the TS-55 moves** (V2.15, built 4 Oct; `testing.md`, "Sign-off checklist, TS-55"): ~~the hot turning rejoin from the standard start~~ (retired, TS-94), fighting wing turns, echelon to fighting wing, the straight-ahead rejoin to echelon, coming off the stack and the SMM station changes. Then confirm the estimates listed in TS-55.
- **Fly the TS-56 pieces** (V2.16, built 4 Oct; `testing.md`, "Sign-off checklist, TS-56"): turns in every formation, the 4-ship station changes and turning rejoin the manuals' way, the 1,000 ft straight-ahead line-up, 3D close formations, the fit-all camera with Fit, Lead's 3/9 and 7/5 o'clock lines, and the info tags. Then say which 4-ship fighting wing sweep #3 and #4 should fly (Fig 16.29 about 30°, SMM 16.38 para 104 says 60°).
- **Fly fluid manoeuvring, the baseline** (V2.17, built 4 Oct; `testing.md`, "Sign-off checklist, TS-57"): entry from fighting wing, level turns, reversal, wings level, Terminate back to fighting wing, #2 in the cone. Then confirm the estimates in TS-57 and say where #2 should sit in a turn away from him. Also try the fighting wing spacing and sweep settings ("Sign-off checklist, TS-58").
- **Fly fluid climb, descend and the loop** (V2.18, built 4 Oct; `testing.md`, "Sign-off checklist, TS-59"), with #2 holding 15° off Lead's tail (your 22:28Z ruling); you kept the loop's 20° off parallel (23:00Z). Also confirm the TS-59 estimates (15° and 2,000 ft climb, loop numbers).
- **Fly fluid vertical piece 2** (V2.19, built 4 Oct; `testing.md`, "Sign-off checklist, TS-60"): #2's side swap, the Wingovers, the Barrel roll and the Standard sequence; the cone as the wingman's aim and the distance-only tags while Lead manoeuvres (your 23:00Z-23:08Z rulings). Then confirm the TS-60 estimates, and say whether the barrel roll's bank of about 75° at the 45° points (the SMM says 90°) is right.
- ~~**Retire the plan-mode code and its tests?** (`plan.md` Step 3).~~ Answered: Patrick approved (card "Approve, all 4", 5 Oct 01:36Z) and it was retired in #407.
- **The low block height** for the IAS-to-TAS conversion (8,000 ft is an estimate, TS-38), and whether the wingman passes above (the working answer) or below in the crossing turns (TS-42).
- **The hook's G change** at the 90° point is not flown when on speed and spacing (TS-48); confirm.
- **Training errors (TS-52, built 4 Oct, behind "Errors (training)")**: fly them (`testing.md`, "Sign-off checklist, training errors"); confirm which way "sucked" and "acute" go (working reading: acute = ahead, sucked = behind, the usual formation meaning); confirm "Fix it" as the default response; the fix may use bank 50 to 75° (estimate) and a roll-in delay but not a speed change (TS-38): a speed lever is your call. The settings proposal is in the project files (`turn-sim-review/errors/settings-proposal.md`).
- **Fix tools (V2.10, built 4 Oct from your 11:42Z ask)**: confirm the draft wording and limits in `spec.md` section 10 (Geometry, Vertical, Lateral spacing, Speed/power, all ticked; ±20 KIAS, slowing on power (TS-61; 1.5 kt/s until V2.20), 500 ft dive or zoom, 10° heading change: estimates). One finding: the standard 300 ft crossing-miss climb (shackle, cross turn) is flown at constant speed and at its 60 ft/s peak needs about 27 ft/s of excess power, a little more than the T-6A's full power gives at 220 KIAS and 8,000 ft (about 26). Options: leave it (it is brief), stretch the climb, or let #2 lose a knot or two in it. Working answer: leave it.
- **The two PC-only reports** (Turn Sim and Turn Fight architecture reports): where in the repo their content lands (`pf/reset/2-inventory/file-register.md:194`).
- **The cockpit's sill height** (TS-155, V2.207): from the front seat's estimated eye the canopy sill is about 1.8 ft below the eye, so looking straight out to the side shows no rail (the reference pictures show it nearer shoulder height). Is the eye too high, the sill too low, or is that right for the CT-156? The Camera menu's eye sliders let you try it; the eye and canopy stay as they are until you say.

### Deferred to the Turn Sim review

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TS-Q2 | **Decided 4 Oct 09:54Z: a new flying core, keeping and trimming the screen (`decisions.md` TS-35).** Deferred by Patrick, 4 Oct 02:16Z: the Turn Sim gets two modes (plan mode, roughly today's, and live mode with manoeuvre buttons); rebuild vs new core vs fix is decided in a Turn Sim review step added to the end of the plan, after ratification, using the two reviews below and more repo documents.** Earlier, Patrick 4 Oct 02:03Z: examine the current architecture, code and assumptions first, then decide between rebuilding from the ground up, reusing parts, or fixing what is there. Review running: agents/turn-sim-architecture-review.md, with the manoeuvre list in agents/turn-sim-manoeuvre-catalogue.md.** Your 3 Oct note says the Turn Sim needs a full overhaul. The status papers say it is about 75% done and only needs four branches merged. The bloat report (written 2 Oct, before your note) proposes a 3-tier screen, no late/early/lag/lead/gfix, and a closed-form solver. Overhaul, or finish and trim? | (a) rebuild turn sequencing and trajectory on the SMM figures; (b) merge the four branches, then trim; (c) merge nothing until the SMM end pictures are agreed | (a) for the turn sequencing only; keep the screen shell and the verified formulas | `archive/docs/handover/turn-sim.md:3-7`; `archive/docs/records/verification/swarm/STATUS_RECONCILIATION.md:22`; `archive/docs/REMEDIATION_ROADMAP.md:366-376`; report `pf/reset/inputs/turn-sim-architecture-and-bloat-report.md:1,17-26` |
| TS-Q10 | **Moved to the Turn Sim review step, 4 Oct 02:25Z (with TS-Q24, which Patrick deferred).** Dad's first email (the source of D41-D45) is not in the archive; only his check list and round-2 questions are, and neither is mostly about this module. Can you supply it? And do you want his two Turn Sim questions sent (Delayed 45 cue; box rear delay)? | send now / after TS-Q1 and TS-Q4 | after TS-Q1 and TS-Q4 | `pf/archive/2026-09/dad-email/`; `archive/docs/records/plan-decisions.md:414-418`; `pf/archive/2026-09/dad-email/dads-check-list.md:23-33` |

Also deferred there: the settings count in TS-R27 and Dad's three four-ship working answers (TS-Q24); see `plan.md`, step 1.

### Settled when this module's work resumes

Screen and build details. Each has a working answer (the best guess) that stands until then.

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TS-Q8 | Speed is held constant through the turn (SMM says energy-sustaining at 3 G). The charts say 3 G is about the sustained limit at sea level and gone by 260 KIAS. Keep constant speed? | (a) yes with the existing stall-G warning; (b) add a sustained-G warning | (a) | `pf/manuals/formation-and-turn-numbers.md:73`; SMM 16.18 para 50 (`pf/manuals/text/smm.txt:8217`) |
| TS-Q9 | Shackle and cross turn are two-ship only (D146), but the SMM allows a shackle in the offset box. Keep? | (a) two-ship only; (b) also box shackle | (b), built V2.151 (TS-135) | `docs/records/plan-decisions.md:519,542` |
| TS-Q11 | Saved setups: build them, or hide the placeholder panel now? The shell also does not yet offer the store the Turn Sim expects. | build in the first slice / hide now, build later | hide now, build with Phase 1 if simple | `src/modules/turn-sim/layout.js:198-201`; `archive/docs/records/verification/swarm/CENSUS.md:41`; `archive/docs/REMEDIATION_ROADMAP.md:99` |
| TS-Q12 | Merge the four paused branches (dragging, in-trail judging, check-turn guard, sequences) or rebuild alongside the overhaul in TS-Q2? | merge in order / cherry-pick the useful parts / leave | cherry-pick dragging and the in-trail judge | `archive/docs/handover/turn-sim.md:14-29`; `pf/archive/2026-09/turn-sim/paused/turn-sim-paused-branches.bundle` (exists; not unpacked) |
| TS-Q13 | Export CSV: keep, drop, or Dad's call? | keep / drop | keep as a small button | `original/shell.html:2097`; `specs/SPEC-turn-sim.md:175` |
| TS-Q14 | Spacing graph and solver: first release or later? When built, score at roll-out (D385) or at Duration (spec, D325)? | later / now; roll-out / duration | later; roll-out | `docs/records/plan-decisions.md:697,698,758`; `archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:54` |
| TS-Q15 | Remove V6's LATE and EARLY #4 timings (the spec keeps them as choices)? | remove / keep | remove | `specs/SPEC-turn-sim.md:125`; report `:271-299` (review material); `docs/references/v6-audit/findings.json:5593` |
| TS-Q16 | Replace the per-wingman error grid and six-field rear check with a few one-click faults and one rear-check button? | yes / keep the grid behind a panel | yes, with a "custom" panel kept closed | report `:359-362,427-440`; `src/modules/turn-sim/fields.js:75-88`; `archive/docs/records/plan-requirements.md:18` |
| TS-Q19 | G-warm: first release or Phase 2 (the swarm deferred it; you asked for it)? | first / Phase 2 | Phase 2 | `specs/SPEC-turn-sim.md:190`; `archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:53` |
| TS-Q21 | Labels such as "#2 TIGHT / AFT" appear mid-turn. Judge only when the turn is finished? Also: the Turn Sim ignores FORE under 1 degree and WIDE/TIGHT within 1% while the Debrief does not (D251). One standard or two? | judge at roll-out only; same rule as Debrief | roll-out only; one standard | `docs/records/plan-decisions.md:624,715-716,462`; `agents/shots/turn-sim/new-3d-mid.png` |
| TS-Q22 | Keep the MOA purple box? | keep / drop | drop unless Dad uses it | `original/shell.html:588,1807-1826` |
| TS-Q23 | The sign-off checklist and the code disagree (Start heading 360 vs 0; "Reset to Standard Defaults" vs "Reset to defaults"; drag and the settings-menu sections it names; "closed-loop" auto timing). Who corrects which? | fix the checklist / fix the app | fix the checklist after TS-Q2 | `docs/checklists/turn-sim.md:18,29-32,74,91-95`; `archive/docs/records/plan-decisions.md:757`; `src/modules/turn-sim/layout.js:167` |
| TS-Q25 | **Decided 4 Oct 08:53Z: pre-planned, kinematically accurate paths (`decisions.md` TS-36).** How is the Turn Sim driven? Patrick, 4 Oct: probably the same smooth, wind-shaped paths as Traffic. Not decided yet. | wind-shaped planned paths / full physics / a mix | wind-shaped planned paths, as Patrick leans | Patrick, 4 Oct 00:10Z in this thread; Traffic wording TR-R30 |

### For Dad

Flying calls, kept in `../../questions-for-dad.md` and sent to him in one message when Patrick chooses. The tool uses the best guess until he answers.

- **TS-Q5:** see `../../questions-for-dad.md`
- **TS-Q7:** see `../../questions-for-dad.md`
- **TS-Q17:** see `../../questions-for-dad.md`

Dad's flying questions for every module are in `../../questions-for-dad.md`.

Old decisions held until a question is answered are listed in `decisions.md` under "Old decisions waiting on an open question", "Old decisions that follow the Turn Sim review".
