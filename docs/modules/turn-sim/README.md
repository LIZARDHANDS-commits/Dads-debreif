# Turn Sim

On screen this module is called **Pat's Formation Simulator** (from V2.14). Its code name stays `turn-sim`, in the folder names, the decision prefix TS- and the tests.

This folder is the formation turn sim. From V2.6 it shows the first version of live mode: a 2-ship in line abreast that flies along, with a button for each SMM line abreast manoeuvre. From V2.7 a Setup option makes it a 4-ship (Spread 4, `spec.md` section 8). Start here, then read only the file you need.

## Where it stands

Live as a PROTOTYPE. The Turn Sim review is done (4 Oct): Patrick chose a new flying core with planned, kinematically accurate paths, and approved the first version's spec (`spec.md` Part 1; decisions TS-35 to TS-49). The first version is built (`src/modules/turn-sim/live/`); the plan-mode code stays in the repo, unused, until Patrick agrees to retire it.

Since clean-up step 2 (TS-65, V2.22) every 2-ship change the line rules cover is a kinematic line at the rejoin closure to about 500 ft from the slot, then the tracker at the close-in rate, planned again at the hand-over (`live/line-moves.js`, `live/hand-over.js`); the Rates setting (Student, Instructor, AI) is under More. Since step 3 (TS-66) the 4-ship flies the same closures and banks, with lines for its single-leg moves. Since V2.59 (TS-67, TS-68) every 2-ship turning rejoin, from line abreast or fighting wing, flies the rejoin line (`live/turning-rejoin.js`): onto the line with Lead at 10:30 or 1:30, down it, and through route into the slot in one motion; "Rejoin kind" under More picks it or the straight-ahead rejoin. Rejoins fly Patrick's 06:16Z rulings, and fluid entry is quick with #2 held to full power and cutting inside when behind.

Where things live since clean-up step 1 (TS-64): the slots for the 2- and 4-ship in `live/slots.js`, the one classifier and judge (card, roll-out verdict and tags) in `live/judge.js`, every closure rate, bank, timing and speed in `live/tuning.js`, and the tracker (the fallback for odd starts) in `live/tracker.js`.

## What is next

The plan's steps, in order: Step 1: the review (done); Step 2: the first version (built; waiting for Patrick to fly every button); Step 3: retire the plan-mode code (Patrick decides); Step 4: next features one at a time on the same core; Step 5: sign-off. Only what is in `plan.md` gets built.

## The files

| File | What it holds |
|---|---|
| `spec.md` | How the module works: screens, behaviour, data, and what happens when data fails |
| `requirements.md` | What the module must do, in Patrick's words, with how each is checked |
| `decisions.md` | Decisions in force (new IDs), replaced ones and their history, and decisions waiting on a question |
| `testing.md` | This module's testing rules, its sign-off checklist and its list of tests |
| `plan.md` | The ordered steps and checkboxes; the last step is the sign-off |
| `future.md` | Ideas not being built until Patrick moves them up |

## Open questions

Each has a working answer that the tool uses until it is settled.

### Waiting on Patrick now (also on the list in `../../PLAN.md`)

- **Fly the first version** from the default start, every button both ways (`testing.md`, "First version" checklist, a draft for Patrick's own words), and the **4-ship** (V2.7; `testing.md`, "4-ship" checklist). The 4-ship's working answers to confirm (TS-50): the delayed 45's check turn is 10°, the altitude stack is the brief's on either side, and the check leaves the first aircraft to check about 200 ft tight.
- **Fly the Change formation buttons** (TS-53, built 4 Oct, `testing.md`, "Sign-off checklist, changing formation"), and confirm the estimates: fighting wing default 750 ft at 45° and 60 ft below Lead, Lead's pause then 30° turn into #2, #2's 60° bank cap and 15 KIAS overtake, hot and cold line at 60° and 30°, the close-formation offsets.
- **Fly G-warm and the 4-ship Change formation buttons** (TS-54, V2.13, built 4 Oct; `testing.md`, "Sign-off checklist, 4-ship G-warm and changes"), and confirm the estimates in TS-54. The stack conflict is settled: you chose "come off first" (19:11Z, TS-55).
- **Fly the TS-55 moves** (V2.15, built 4 Oct; `testing.md`, "Sign-off checklist, TS-55"): the hot turning rejoin from the standard start, fighting wing turns, echelon to fighting wing, the straight-ahead rejoin to echelon, coming off the stack and the SMM station changes. Then confirm the estimates listed in TS-55.
- **Fly the TS-56 pieces** (V2.16, built 4 Oct; `testing.md`, "Sign-off checklist, TS-56"): turns in every formation, the 4-ship station changes and turning rejoin the manuals' way, the 1,000 ft straight-ahead line-up, 3D close formations, the fit-all camera with Fit, Lead's 3/9 and 7/5 o'clock lines, and the info tags. Then say which 4-ship fighting wing sweep #3 and #4 should fly (Fig 16.29 about 30°, SMM 16.38 para 104 says 60°).
- **Fly fluid manoeuvring, the baseline** (V2.17, built 4 Oct; `testing.md`, "Sign-off checklist, TS-57"): entry from fighting wing, level turns, reversal, wings level, Terminate back to fighting wing, #2 in the cone. Then confirm the estimates in TS-57 and say where #2 should sit in a turn away from him. Also try the fighting wing spacing and sweep settings ("Sign-off checklist, TS-58").
- **Fly fluid climb, descend and the loop** (V2.18, built 4 Oct; `testing.md`, "Sign-off checklist, TS-59"), with #2 holding 15° off Lead's tail (your 22:28Z ruling); you kept the loop's 20° off parallel (23:00Z). Also confirm the TS-59 estimates (15° and 2,000 ft climb, loop numbers).
- **Fly fluid vertical piece 2** (V2.19, built 4 Oct; `testing.md`, "Sign-off checklist, TS-60"): #2's side swap, the Wingovers, the Barrel roll and the Standard sequence; the cone as the wingman's aim and the distance-only tags while Lead manoeuvres (your 23:00Z-23:08Z rulings). Then confirm the TS-60 estimates, and say whether the barrel roll's bank of about 75° at the 45° points (the SMM says 90°) is right.
- **Retire the plan-mode code and its tests?** (`plan.md` Step 3).
- **The low block height** for the IAS-to-TAS conversion (8,000 ft is an estimate, TS-38), and whether the wingman passes above (the working answer) or below in the crossing turns (TS-42).
- **The hook's G change** at the 90° point is not flown when on speed and spacing (TS-48); confirm.
- **Training errors (TS-52, built 4 Oct, behind "Errors (training)")**: fly them (`testing.md`, "Sign-off checklist, training errors"); confirm which way "sucked" and "acute" go (working reading: acute = ahead, sucked = behind, the usual formation meaning); confirm "Fix it" as the default response; the fix may use bank 50 to 75° (estimate) and a roll-in delay but not a speed change (TS-38): a speed lever is your call. The settings proposal is in the project files (`turn-sim-review/errors/settings-proposal.md`).
- **Fix tools (V2.10, built 4 Oct from your 11:42Z ask)**: confirm the draft wording and limits in `spec.md` section 9 (Geometry, Vertical, Lateral spacing, Speed/power, all ticked; ±20 KIAS, slowing on power (TS-61; 1.5 kt/s until V2.20), 500 ft dive or zoom, 10° heading change: estimates). One finding: the standard 300 ft crossing-miss climb (shackle, cross turn) is flown at constant speed and at its 60 ft/s peak needs about 27 ft/s of excess power, a little more than the T-6A's full power gives at 220 KIAS and 8,000 ft (about 26). Options: leave it (it is brief), stretch the climb, or let #2 lose a knot or two in it. Working answer: leave it.
- **The two PC-only reports** (Turn Sim and Turn Fight architecture reports): where in the repo their content lands (`pf/reset/2-inventory/file-register.md:194`).

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
| TS-Q9 | Shackle and cross turn are two-ship only (D146), but the SMM allows a shackle in the offset box. Keep? | (a) two-ship only; (b) also box shackle | (a) | `docs/records/plan-decisions.md:519,542` |
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
