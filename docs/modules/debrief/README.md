# Debrief

This folder is the flight debrief viewer: load a sortie's tracks, replay them on the map and in 3D, with graphs, events and the weather at the time. Start here, then read only the file you need.

## Where it stands

Built and live; the next step is Patrick (or anyone) running its checklist. The roadmap and the handover disagree on whether it was already signed off (see the order section) (`archive/HANDOVER.md:87`).

## What is next

The plan's steps, in order: Step 1: Refresh spec.md against the new requirements; Step 2: Close the gaps between the ratified requirements and the built screen; Step 3: Settle the open screen questions when the work resumes; Step 4: Check the Debrief's tests match the new rules; Step 5: Sign-off. Only what is in `plan.md` gets built.

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

- **DB-Q4:** no smoothing of the estimated G (D219) or a 3-point median filter (D383); neither is built (`pf/reset/1-requirements/questions.md:17`, `docs/modules/debrief/plan.md:37`).

### Settled when this module's work resumes

Screen and build details. Each has a working answer (the best guess) that stands until then.

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| DB-Q3 | Is the model wind at one point (Lead's position halfway through the flight), blended by hour and height, good enough for the whole sortie? | (a) Yes, labelled "model wind"; (b) also let the instructor type a wind; (c) use the METAR wind at low level | (a) now, (b) as a later option | `archive/specs/SPEC-debrief.md:200` |
| DB-Q6 | The Debrief hides or refuses several numbers by its own judgement calls: no verdicts under 80 kt est. IAS; Lead judged only from 6,000 to 15,500 ft; ground speed over 350 kt and G over +7 or above the stall line shown as "--"; a 5 s hole counted as a gap. Keep these? | (a) Keep; (b) keep but show a one-line reason always; (c) change numbers | (b) | `archive/specs/SPEC-debrief.md:137-144`, `src/modules/debrief/readouts.js:24`, `src/modules/debrief/readouts.js:33-34`, `src/modules/debrief/readouts.js:86`, `src/modules/debrief/readouts.js:94` |
| DB-Q7 | Should the card and More detail show each wingman's actual interval (ft), sweep (°) and #3's distance aft, not only "TIGHT by 2,959 ft"? V6 printed them. | (a) Yes in More detail; (b) yes on the card; (c) no | (a) | `original/shell.html:3240-3243`, `src/modules/debrief/readouts.js:275` |
| DB-Q8 | V6 showed the iPad's own "Native G" next to the estimated G and the difference. The new app reads recorded G but has no switch to show it. Add a switch (off by default), or leave it out? | (a) Add under Debrief settings; (b) leave out | (a), off by default | `original/shell.html:3249`, `archive/specs/SPEC-flight-data.md:52`, `src/modules/debrief/readouts.js:308` (the option is never passed in `index.js`: no line, because it is an absence) |
| DB-Q9 | Map zoom is mouse wheel or + / − keys only; there is no zoom slider or button. Add visible + / − buttons? | (a) Yes; (b) no, wheel is enough | (a) | `src/ui-kit/canvas-view.js:194-200`, `agents/shots/debrief/new-default.png` |
| DB-Q10 | After loading, the map shows the whole sortie, so a 4-ship formation is a few dots (labels overprint); in 3D the default view shows tiny ships with overlapping labels and #4 off to the side. Should the first view frame the formation, with the whole sortie one click away? | (a) Whole sortie then Follow Lead zoom (as now: Fit); (b) frame the formation at the playback moment on load and on 3D open; (c) keep and add a "Zoom to formation" button | (c) | `agents/shots/debrief/new-2d-mid.png`, `agents/shots/debrief/new-3d.png`, `src/modules/debrief/state.js:108-109` |
| DB-Q11 | Trail mode starts on "Full tracks" (V6's default), which draws the whole 105-minute sortie as a tangle with #4 drawn thick. Better default? | (a) Keep V6's; (b) "Last 60 s"; (c) "History only" | (b) or (c) | `src/modules/debrief/state.js:24-40` (trail 'full'), `archive/specs/SPEC-debrief.md:60`, `agents/shots/debrief/new-default.png` |
| DB-Q13 | Weather menu has extra choices besides the toggles (airfield picker, SPECI ticks, satellite opacity and Infrared, wind model, arrow height). Keep all, or trim to toggles with sensible defaults? | (a) Keep; (b) toggles only, extras in a "More" line | (b) | `src/modules/debrief/layout.js:209-228`, `archive/docs/records/plan-requirements.md:29`, `agents/shots/debrief/new-menu-weather.png` |
| DB-Q14 | The standards label (TIGHT, WIDE, FORE, AFT) prints at every moment of the sortie, including the circuit and rejoins where line abreast does not apply (D218 saw 85% of readings TIGHT on the example). Should judging be limited to a stretch the instructor picks, or only when the formation is in line abreast? | (a) As now; (b) instructor picks a time window; (c) detect line abreast | (b) | `archive/docs/records/decisions-log.md:80`, `archive/specs/SPEC-debrief.md:137-138` |
| DB-Q15 | Vertical separation between ships is not shown anywhere (V6's 3D tab listed "ΔAlt"); the SMM line-abreast picture has ±2,000 ft vertical. Show it and judge it? | (a) Show in More detail only; (b) show and judge against ±2,000 ft; (c) no | (a) | `original/shell.html:3260`, `pf/manuals/formation-and-turn-numbers.md:9` (SMM 16.18 para 49) |
| DB-Q16 | The replay plays only the time all four tracks overlap and drops the rest (up to 2 min 33 s at one end of the example). A debrief may want the start-up and taxi of the early ships. Keep the shared window? | (a) Keep; (b) play from the earliest start, ships not yet recorded drawn as "no data" | (a) | `archive/specs/SPEC-flight-data.md:51` (C8), `src/modules/debrief/state.js:137-163` (observed status) |
| DB-Q17 | Est. G only reads the sideways turn, so a pull-up or loop reads about 1 G. Label it "turn G" for now, or add the vertical pull (change in climb angle)? | (a) Label "turn G"; (b) add vertical component | (a) now, (b) later | `src/flight-data/flight.js:206-229`, `docs/references/v6-audit/findings.json:4103-4118` |
| DB-Q18 | Space (play/pause) is ignored when a button has the focus (it presses the button). Fine, or should the playback keys work after any click? | (a) Fine; (b) always work except when typing | (a) | `src/modules/debrief/index.js:599-603` (observed) |

### Decision clashes from the requirements review

Handed to the decisions review (reset thread 4); check `decisions.md` for the verdict before relying on either side.

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| DB-Q4 | **ASK (conflict).** D219 (no smoothing of est. G, the 21 one-second G dips stay) and D383 (3-point median filtering of G dips, "planned") disagree. Neither is in the code. Which stands? | (a) No smoothing (D219); (b) 3-point median (D383); (c) none now, decide after seeing real use | (c) | `archive/docs/records/decisions-log.md:81`, `archive/docs/records/decisions-log.md:240`, `archive/docs/REMEDIATION_ROADMAP.md:83`; code has no median (`src/modules/debrief`, searched) |

Dad's flying questions for every module are in `../../questions-for-dad.md`.

Old decisions held until a question is answered are listed in `decisions.md` under "Old decisions waiting on an open question".
