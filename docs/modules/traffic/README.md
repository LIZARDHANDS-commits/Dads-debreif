# Traffic

This folder is the traffic pattern sim: aircraft fly the Moose Jaw circuits and procedures, shaped by the wind, for pattern and PFL practice. Start here, then read only the file you need.

## Where it stands

Built; the sign-off box is still open. The PFL review (promised in TR-R14) comes first, with six new PFL commits waiting on it (`archive/HANDOVER.md:89`, `pf/reset/6-plan-and-rules/new-since-pin.md:5`).

## What is next

The plan's steps, in order: Step 1: The PFL review (TR-R14) and what waits on it; Step 2: Refresh spec.md against the new requirements; Step 3: Fix the real faults found at the reset pin; Step 4: Build what the ratified requirements ask for and the screen lacks; Step 5: Check the camera, graphics and scenery work against the code; Step 6: Review the route.js split (a review, not the split itself); Step 7: Sign-off. Only what is in `plan.md` gets built.

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

- **PFL review items:** the new PFL work since the reset (D438 to D440), the pre-built PFL track (D436) and the PFL missing from the live manoeuvres, all held for the PFL review (`docs/modules/traffic/plan.md:13`).

### Settled when this module's work resumes

Screen and build details. Each has a working answer (the best guess) that stands until then.

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TR-Q10 | What playback speed does it open at? ASK | (a) 1x (shipped, "rebaselined from 8x"); (b) 8x (spec default and V6 built-in setup) | (a) 1x, because the opening picture should be watchable in real time. | `src/modules/traffic/defaults.js:25-26`; `archive/specs/SPEC-traffic.md:393`; `docs/references/v6-audit/findings.json:4879-4883` |
| TR-Q14 | What are the patterns called and how many does the first screen list? ASK (A16: drop PAT1 / rename to PAT_INNER / keep PAT1; the spec has PAT_SI, the shipped list has PAT1, ENT1, ENT2) | (a) pilot names ("Overhead", "Straight-in", "Closed"); (b) keep PAT1 / ENT1 / ENT2; (c) rename per the log | (a), shown as plain pilot words. | `pf/reset/0-lessons/antigravity.md:126`; `src/modules/traffic/data/moose-jaw.json`; `archive/specs/SPEC-traffic.md:278` (PAT_SI is the spec's straight-in name) |
| TR-Q15 | The satellite photo is scaled by 1.2 to fit V6's hand-drawn routes. Redraw the routes to the ground, or keep the trim? | (a) redraw (T8); (b) keep the 1.2 trim | (a) when the routes are redrawn; until then (b), but hide the alignment controls. | `src/modules/traffic/defaults.js:57-60`; `src/modules/traffic/data/moose-jaw.json:84`; `docs/references/v6-audit/findings.json:5083`; `pf/archive/2026-09/questions/traffic-questions-expanded.md:171` |
| TR-Q16 | What happens when the home airfield is not Moose Jaw? | (a) show a generic square circuit (FF33); (b) show a message and no patterns; (c) keep Moose Jaw only | (b) for now, (a) on the future list. | R16 `archive/docs/records/plan-requirements.md:47`; `pf/archive/2026-09/questions/traffic-questions-expanded.md:39`; `archive/docs/records/future-ideas.md:10` |
| TR-Q18 | Per-aircraft commands: one "Maneuvers" menu, or a landing menu plus separate buttons? ASK (A9) | (a) one Maneuvers menu; (b) landing select plus buttons (as built, D437 single-click) | (b), since the later answer is newer; check it is not crowded (TR-R29). | `pf/reset/0-lessons/antigravity.md:119`; `archive/docs/records/decisions-log.md:298`; `src/modules/traffic/aircraft.js:369-470` |
| TR-Q22 | Can a scenario be exported to a file and imported again (V6 could), and between machines? | (a) yes, with checks; (b) browser-only saving | (a) later; first make the browser saving reliable. | `v6/traffic.html:125-130`; `docs/references/v6-audit/findings.json:5168`; `src/modules/traffic/profiles-panel.js:19` |
| TR-Q23 | Where do crab angle and ground speed show for each aircraft? | (a) in the aircraft row; (b) in a "More" panel; (c) as a map label option | (b) | R23 `archive/docs/records/plan-requirements.md:19`; TR-R6 |
| TR-Q24 | The runway list shows "Runway 11R (Coming soon)". Hide it until it works? | (a) hide; (b) keep | (a), by the "no dead ends" rule. | `src/modules/traffic/defaults.js:15-18` |
| TR-Q25 | How long should the blend be when an aircraft changes from one way of flying to another, and what shape? ASK (A14) | (a) 1 s; (b) 1 to 2 s; (c) 2 to 3 s; linear or smooth | Moot if TR-Q2 is (a); otherwise (b) smooth. | `pf/reset/0-lessons/antigravity.md:124` |

### For Dad

Flying calls, kept in `../../questions-for-dad.md` and sent to him in one message when Patrick chooses. The tool uses the best guess until he answers.

- **TR-Q8:** see `../../questions-for-dad.md`
- **TR-Q11:** see `../../questions-for-dad.md`

### Decision clashes from the requirements review

Handed to the decisions review (reset thread 4); check `decisions.md` for the verdict before relying on either side.

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| TR-Q21 | Which numbering stands for the post-prototype queue and the D421-D427 decisions? Were the Traffic approvals under those numbers made by Patrick? ASK | (a) roadmap numbering PPQ-01 to 16, and give the Traffic D421-D427 new numbers; (b) the R-row numbering | (a) | scope-and-ideas.md; `archive/docs/REMEDIATION_ROADMAP.md:399-406`; `archive/docs/records/decisions-log.md:282-288`; `pf/reset/0-lessons/antigravity.md:115` |

Dad's flying questions for every module are in `../../questions-for-dad.md`.

Old decisions held until a question is answered are listed in `decisions.md` under "Old decisions waiting on an open question", "New since the reset pin, held for the PFL review".
