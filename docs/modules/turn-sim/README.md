# Turn Sim

On screen this module is called **Pat's Formation Simulator** (from V2.14). Its code name stays `turn-sim`, in the folder names, the decision prefix TS- and the tests.

This folder is the formation turn sim. From V2.6 it shows the first version of live mode: a 2-ship in line abreast that flies along, with a button for each SMM line abreast manoeuvre. From V2.7 a Setup option makes it a 4-ship (Spread 4, `spec.md` section 14). Start here, then read only the file you need.

## Where it stands

**13 Oct 2026, later: phase A built, phase B specified; all on #1018 (V2.424, open on its branch until it flies right).** #1018 holds the aircraft-handling rulings (ALL-39, ALL-40, TS-216 to TS-220, TS-222), Lead's planned roll-out (TS-223, fixed 13 Oct: it stalled 0.005° short so turns never ended, and a gentle roll-out could run away), the loop, wingovers and barrel roll (TS-213, TS-215, TS-221, TS-224) and one Lead aircraft (TS-225: the 2-ship Lead flies every plan on fluid's point mass, behind LEAD_PILOT.onePointMass, on; climbs at 80% and descents at 20% torque with the nose holding the airspeed). Phase B is a ladder, close formation first (plan 12.4, B1 to B6); its spec is approved (TS-226, spec section 7b, refined in the working doc "Close-In Wingman Spec"), with how PID is used, the code map and its inputs and outputs. The one-off Fable audit found it right and asked for 13 changes, all approved (spec 7b.6d); Lead now pulls as he rolls and never rolls and pulls past 4.7 G (TS-227). B1 is built on #1029 (V2.426, stacked on #1018): the live close-in wingman holds echelon straight and level behind "#2 in close formation: Held / Live" (default Held); he corrects any drift, no threshold (TS-228). Waiting on Patrick to fly it (Checkpoint B); B2, the telegraphed turns, next. The wingman's PID code is called the PID function (`pilotAxis`), not the old helper laws, which retire. Rule change: manuals may go in the repo with their page, only the CFAFM stays out (ALL-41). Seven Formation tests were red on #1018 before the roll fix, left red at Patrick's word until phases B and C; CI on the latest pushes not yet read. Untested: nothing flown by Patrick since V2.418; nothing seen in the app.

**12 Oct 2026, last thing: V2.423 in #1017 (green, waiting for Patrick's merge).** Phase A research under way, all read-only: the manuals, public flight-test and flying-qualities data, JSBSim's T-6, and the telemetry of Patrick's phase 2 GoPro flight (Aug 2022: accelerometer, gyro and GPS inside the video files). Next: check the findings, then the ratify page for the aircraft and Lead numbers.

**12 Oct 2026, late: V2.423 in its pull request.** Patrick ruled the pilot review (12.2: Lead first, then the 2-ship wingman, then the 4-ship) and TS-214, one tuning sheet: every number that tunes how Lead and the 2-ship fly now sits in `live/handling.js`, `lead-moves.js`, `wing-moves.js`, `rates.js`, `bands.js` and `moves.js`, reached through `tuning.js`, and `numbers.md` lists them all with core's aircraft limits first. No flying changed (the gauge's traces are byte-identical). Next, phase A: ratify the aircraft and Lead numbers, then fix Lead (roll onset, the 8 G/s gate, one Lead aircraft or two, the TS-213 loop).

**12 Oct 2026, night: V2.421 on main, V2.422 in #1014.** The Formation architecture review (two thread artifacts; the handover `Pat's claude work/formation-handover-12oct-night.md`) set Step 12 of `plan.md`, ratified by Patrick: smooth, realistic formation, the 2-ship first then the 4-ship. Since V2.417: the nose over the top of a loop without a jump (V2.419); TS-211 #2 reacts to what he sees (decided); the HUD and camera bar each minimise (V2.420); fighting wing always on the live law, TS-212 (V2.421); TS-213 Lead's fluid loop flown as a rate to exit at his entry speed (decided); the picture pauses after a slow press, and the smoothness gauge (`tools/formation-gauge.mjs`), the flight plot page (`tools/flight-plot/`) and the Python design kit (`tools/flight-design/`) (V2.422). Next: planning in a Web Worker (12.1e), then the pilot review (12.2).

**12 Oct 2026, evening: V2.417 on main.** Since V2.410: TS-208 fighting wing on Lead's circle for 2- and 4-ship (V2.411); 4-ship fighting wing start 650 ft, #2 60°, #3/#4 45°, 60 ft stack (V2.412, V2.415); turning rejoin drops onto Lead's plane at route spacing before echelon (V2.413); TS-209 Lead telegraphs close turns (V2.414); Wings level and Reversal in the 2-ship close formations and one version label (V2.416); fluid #2 rolls back to Lead when Lead turns into him (V2.417). Handover: `Pat's claude work/formation-handover-12oct-evening.md`. Open rough spots: `future.md` (end of list). The older history follows.

Live as a PROTOTYPE, V2.304 on main (11 Oct 2026). The flying core is in `src/modules/turn-sim/live/`. Formation's bug round closed at V2.304 (#820): the 2-ship and 4-ship turning rejoins fly to the SMM picture (TS-181 to TS-191), and the rough spots left for later are in `future.md`. Patrick flies after Fable's PASS on each renamed copy.

Now running: the refactor in `REFACTOR_HANDOVER_V2.304.md` (Fable's plan, Patrick agreed 11 Oct 10:49Z), six steps, one pull request each. Steps 1 to 4 are tidies proved by the same driver trace before and after; steps 1 to 4 are merged (V2.305 to V2.309); step 5 (the straight rejoin onto the ride, V2.310, TS-192) was built overnight on Patrick's order and approved by him 11 Oct 16:27Z; step 6 is the unsourced-numbers table (`unsourced-numbers.md`), which Patrick agreed 11 Oct 16:26Z, carried out by the clean-up in V2.311. The earlier refactor (V2.92 to V2.101) and clean-up steps 1 to 5 (V2.155 to V2.161) are merged.

How #2 is flown, in one line: every 2-ship change of formation is planned by the tracker (`live/tracker.js`; the kinematic lines are gone, TS-150), with the canopy and step-down gates inside 2,000 ft and 1,200 ft (TS-151); the turning rejoin rides the 30° line in Lead's turning frame (`rideAim`, TS-181, TS-182) to the decision point and up into the slot; and the change is planned again at events (the section below, and `spec.md`). The straight-ahead rejoin rides Lead's six the same way with Lead not turning (TS-192). The Rates setting (Student, Instructor, AI) is under More.

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
| `ARCHITECTURE_REVIEW_V2.388.md` | How Lead, the wingman's four pilots, planned and live flying, the rejoins and the tracker fit together at V2.388, their weak points, and the rough spots ranked with a proposed fix each (12 Oct 2026) |

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
| `turning-rejoin.js`, `straight-rejoin.js`, `lag-roll.js`, `rolling-rejoin.js`, `fw-pursuit.js`, `fw-switch.js` | The planners the chooser tries, and the fighting wing turn and side switch laws |
| `pilot.js` | The one pilot model every held-command planner and the tracker fly through: speed from the power at the G flown, one jerk limit, power hysteresis, shaped roll (clean-up step 5, TS-141) |
| `tracker.js` | The tracker every move is flown by: the slot law, closure, heading, height and power, and the run (`runTracker`) that calls each phase's kind |
| `ride.js` | The ride down a rejoin line in Lead's frame: the turning rejoin's, and with Lead not turning the straight rejoin's six (its aim, speed, the line's height and height counted as speed; refactor steps 3 and 5) |
| `closures.js` | Each phase's closure rate and bank cap (`onClosure`), and the shared `fromStep` and `wingFromPose` (was `hand-over.js`) |
| `kinematic.js` | Position tracks and poses shared by formation turns, fluid flight and the rejoins |
| `replay.js` | Flying a planned move one step (the replayed bank track and pose track), the dry run, recorded flights and the speed segment (clean-up step 3, from `transitions.js`) |
| `recipes.js` | The tracker's leg recipes for each move (slide, stop at a corner, close through route, rejoin, open out, drop back, sweep out, straight ahead) and `legsFor`, the legs from one formation to another (clean-up step 3, from `transitions.js`) |
| `lead-turn-in.js` | Lead's turn into #2 in a turning rejoin, held until #2 is in, and the tracker's part behind it (clean-up step 3) |
| `transitions.js` | The change limit, the words for a change, and `planGoTo`, the tracker-only planner kept as a fallback |
| `fluid.js`, `fluid-lead.js`, `fluid-wing-live.js` | Fluid manoeuvring (Lead's manoeuvres and the live wingman) |
| `four-ship.js`, `four-ship-card.js`, `g-warm.js` | The 4-ship's screen pieces |
| `four-plan.js`, `four-legs.js`, `four-close.js`, `four-rejoin.js`, `four-open.js` | The 4-ship's moves on the 2-ship's planners (refactor PRs 6 to 8): the from-to graph, the legs, close moves, rejoins, opening out |
| `errors.js` | Training errors and the Smart wingman (TS-52, TS-96) |

Files not named here (`attitude.js`, `full-power.js`, `power.js`, `slow-down.js`, `formation-turns.js`, `offset-box-turns.js`, `manoeuvres.js`) are flight helpers and move builders; read the header of the one you need.

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
- **The cockpit's sill height** (TS-155, V2.207; eye lowered 0.13 ft in V2.208, TS-156): from the front seat's estimated eye the canopy sill is now about 1.7 ft below the eye (1.8 ft before), so looking straight out to the side shows no rail (the reference pictures show it nearer shoulder height). From V2.209 (TS-157) the canopy's side frames line the glass 0.3 ft above the sill, so their top shows about 1.4 ft below the eye; the sill itself did not move. Is the eye too high, the sill too low, or is that right for the CT-156? The Camera menu's eye sliders let you try it; the eye and canopy stay as they are until you say.
- **The final-approach picture** (TS-156, V2.208): the cockpit now matches AETCMAN 11-248 Fig 2.7 (level at 200 KIAS, half ground and half sky). With the sim's attitude model (your flight number, unchanged) a 3° final shows the aim point about 5 % up the windscreen at 100 KIAS, 10 % at 105 and 15 % at 110, where the manual's chapter 5 pattern table says half (no flaps, takeoff flaps) and a third (landing flaps); the sim's final attitude is about +2 to +3.5° nose up, the table's works out about 3° below level cruise, and in the final turn the sim is about 0 to -1° against the table's 2 to 3° nose low. No cockpit shape can hold both pictures with these attitudes. Options: keep Fig 2.7 and leave the attitude model (the working answer); look again at the approach attitude (`attitudeDegFromClimb`, a flap term), a flight-model change for you to rule on; or your own call.
- **Line astern against the manual's close trail** (TS-156): the sim flies the SMM's line astern (about 10 ft nose to tail, 8 ft low), where AETCMAN 11-248 Fig 9.24 shows close trail at one to two lengths, just below the wake, with Lead wholly under the bow band from #2's cockpit; in the sim Lead's tail and fin show above the band. Both written down; no slot changed. Keep the SMM's line astern (the working answer), add close trail as its own formation, or your own call.

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
| TS-Q8 | Speed is held constant through the turn (SMM says energy-sustaining at 3 G). The data say 3 G is about the sustained limit at sea level and gone by 260 KIAS. Keep constant speed? | (a) yes with the existing stall-G warning; (b) add a sustained-G warning | (a) | `pf/manuals/formation-and-turn-numbers.md:73`; SMM 16.18 para 50 (`pf/manuals/text/smm.txt:8217`) |
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
