# SOF

This folder is the Supervisor of Flying weather desk: home field and alternates, wave timing, limits and warnings on one screen. Start here, then read only the file you need.

## Where it stands

Built and live, but Patrick's 4 October answers rebuild it to one desk screen, so the checklist runs after the rebuild; the amber "Incomplete" state is a build task (`docs/modules/sof/plan.md:7`, `archive/docs/REMEDIATION_ROADMAP.md:81`). On 10 Oct 2026 the airspace data and the 3D airspace and airfield drawing moved to the shared folders so the Debrief can draw them too (SOF-62, Dad's yes; wording waits on Patrick); the SOF draws the same airspace, and its airfields now carry the Traffic sim's runway paint.

## What is next

The plan's steps, in order: Step 1: Refresh spec.md against the new requirements; Step 2: Rebuild to one desk screen, with the everyday extras; Step 3: Build the safety and limits gaps between decided and built; Step 4: Settle the open questions when the work resumes; Step 5: Sign-off. Only what is in `plan.md` gets built.

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

### Settled when this module's work resumes

Screen and build details. Each has a working answer (the best guess) that stands until then.

| ID | Question | Options | Best guess (the working answer until it is settled) | Source |
|---|---|---|---|---|
| SOF-Q10 | Settings are in two places on the SOF: "SOF settings" on the screen (trigger, home limits, lightning radius, banner, relay address) and the app Settings dialog (home field, alternates, approaches, minima, times). R22 said each module keeps its tuning numbers in one Settings menu on its own screen. Is the split OK? | (a) Keep the split. (b) Move alternates and approaches into the SOF settings menu (still shared with the Airfields module). | (a); the airfields are used by other modules too. Tell the SOF user where the alternates are set (a one-line note in the menu). | `archive/docs/records/plan-requirements.md:18`; `archive/specs/SPEC-sof.md:202`; screenshots `new-settings-open.png`, `new-app-settings-airfields.png` |
| SOF-Q14 | The SOF checks one home limit (ceiling and visibility) for all flying. The Gen Book has other weather limits by activity (low level, formation, chase, advanced formation, a wx check flight) and a formation crosswind limit by runway state. Should the SOF check any of them? | None / low-level only / all as optional checks. | None for now; list as future optional checks. | `pf/manuals/weather-and-limits-numbers.md:44-59` (Gen Book p.9, p.10, p.11, p.34) |

### For Dad

All answered by Patrick on 4 Oct, in place of Dad: SOF-Q5 to Q8 are decisions SOF-33 to SOF-36 in `decisions.md`; SOF-Q4 and SOF-Q12 (wind and the favoured runway) are SOF-37, with both on the future list (`future.md`). The answers are also marked in `../../questions-for-dad.md`.

Dad's flying questions for every module are in `../../questions-for-dad.md`.

Old decisions held until a question is answered are listed in `decisions.md` under "Old decisions waiting on an open question".
