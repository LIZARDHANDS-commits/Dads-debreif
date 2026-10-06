# Pat's claude work

Patrick's project-only working docs from the Claude project, copied into the repo on 6 Oct 2026 (main at Formation V2.163, DADS v2.10.122) so Antigravity and anyone else can read them while the project is off Claude.

**What these are:** working notes, reviews, designs, handovers and Fable's analysis. They are background, not instructions. The rule book still wins: `AGENTS.md`, then `docs/PLAN.md`, then `docs/modules/<module>/`. Where a note here disagrees with the repo, the repo is newer.

**Paths inside the notes:** `/mnt/project-files/<path>` and `pf/<path>` mean `Pat's claude work/<path>` here. Links to an `archive/` folder point at history that was not copied.

## Where to start

| For | Read first | Then |
|---|---|---|
| Formation (turn-sim) | [turn-sim-review/formation-sim-handover.md](turn-sim-review/formation-sim-handover.md) | [fable-findings-mapped.md](turn-sim-review/fable-findings-mapped.md), [fable-compiled.md](turn-sim-review/fable-compiled.md), the design folders |
| Fix drawn-path moves on the point-mass model | [turn-sim-review/drawn-path/handover.md](turn-sim-review/drawn-path/handover.md) | the three check scripts in that folder |
| Fable's Formation engine review | [formation-review-package/report/report.md](formation-review-package/report/report.md) | [fable-findings-mapped.md](turn-sim-review/fable-findings-mapped.md) turns its renamed terms back into ours |
| The optimiser (next after polish) | [optimiser-plan.md](formation-review-package/report/optimiser-plan.md) (route 1, for the app) | [optimiser-plan-route2.md](formation-review-package/report/optimiser-plan-route2.md) (route 2, PC yardstick) |
| Traffic PFL | [traffic-review/pfl-full-rewrite-handover.md](traffic-review/pfl-full-rewrite-handover.md) | [fable-report.md](traffic-review/fable-report.md), the drag consults |
| Fight Sim (turn-fight) | [turn-fight-review/README.md](turn-fight-review/README.md) | its reading order |
| Aircraft performance, roll and G | [manuals/performance-audit-5oct.md](manuals/performance-audit-5oct.md) | `src/core/t6-performance.js` |
| Dad's sessions (SOF, Debrief) | [dad-setup/handover-for-dads-claude.md](dad-setup/handover-for-dads-claude.md) | |

**Fable's renamed terms:** the Formation review ran on a renamed copy of the engine, so `report.md` and `BRIEF.md` say cone position (fighting wing), lead point / nose on / lag point (lead / pure / lag pursuit), pointing (pursuit), follow (chase), spread (tactical), wandering (hunting), alpha (angle of attack) and two-ship module (Turn Fight).

**Scripts:** the `.mjs` and `.js` files are the trace and check scripts the reviews used. Run them with Node from the repo root and pass the repo path where the script asks for it (for example `node "Pat's claude work/turn-sim-review/fset.mjs" .`). They read the code as it was when written, so expect drift.

## Left out, and why

Patrick (6 Oct 22:31Z): copy everything except the controlled flight manual, with no mentions of it.

- **Controlled flight-manual content and mentions:** every mention was removed or reworded from these files. The Gen Book (text, PDF and page pictures) is left out because it reproduces flight-manual tables.
- **The manual PDFs and full-text extracts:** held in the project files until Patrick decides; the Gen Book also holds a staff contact list.
- **The renamed engine copy and renamed docs** in the Formation review package (`src/`, `docs/trainer/`): a duplicate of our own code and module docs with Fable's renamed terms.
- **Archives and uploads:** history only.
- **Dad's V6 file:** too big for GitHub, and already in the repo as `original/`.

## Every file

### dad-questions/

- [answers.md](dad-questions/answers.md): Patrick's answers to the 13 questions for Dad (4 Oct). The repo's docs/questions-for-dad.md is the live copy.

### dad-setup/

- [handover-for-dads-claude.md](dad-setup/handover-for-dads-claude.md): Handover for Dad's own Claude Code sessions: how to work on SOF and Debrief by the rule book.

### formation-review-package/

- [BRIEF.md](formation-review-package/BRIEF.md): The brief Fable worked from for the Formation engine review.

### formation-review-package/report/

- [lines-removal-report.md](formation-review-package/report/lines-removal-report.md): Fable's report on removing the kinematic lines (6 Oct, at Patrick's ask). Uses the renamed terms.
- [optimiser-plan-route2.md](formation-review-package/report/optimiser-plan-route2.md): **Optimiser route 2**: collocation with a solver, phase A as a Python yardstick on the PC. Kept alongside route 1 (Patrick "keep both").
- [optimiser-plan.md](formation-review-package/report/optimiser-plan.md): **Optimiser route 1** (the one for the app): shooting on the existing step, Nelder-Mead on a score, modes by the book / chosen restrictions / unrestricted. Patrick: build after the polish.
- [report.md](formation-review-package/report/report.md): **Fable's Formation engine review (6 Oct).** Sections 1-7: faults, refactor steps, follow-up answers. Uses the renamed terms; read with turn-sim-review/fable-findings-mapped.md.

### manuals/

- [README.md](manuals/README.md): Index of the manuals: titles, dates and how to cite them.
- [energy-model-check.md](manuals/energy-model-check.md): Fight Sim energy model checked against the manuals (stall, shaker, MPT).
- [formation-and-turn-numbers.md](manuals/formation-and-turn-numbers.md): Formation, turn and G numbers with their manual pages.
- [performance-audit-5oct.md](manuals/performance-audit-5oct.md): Fable's audit of the T-6 performance model and handling (roll rate, roll acceleration, G onset), with page references.
- [questions-for-patrick.md](manuals/questions-for-patrick.md): Where the manuals and the tool disagreed, as questions for Patrick (early October).
- [traffic-pattern-numbers.md](manuals/traffic-pattern-numbers.md): Moose Jaw traffic pattern numbers with their sources.
- [weather-and-limits-numbers.md](manuals/weather-and-limits-numbers.md): Weather, alternate and limit numbers with their sources.

### manuals/images/

Manual figures and pages saved as pictures.

- [efig-p131.png](manuals/images/efig-p131.png), [efig-p132.png](manuals/images/efig-p132.png), [efig-p135.png](manuals/images/efig-p135.png), [efig-p146.png](manuals/images/efig-p146.png), [efig-p151.png](manuals/images/efig-p151.png), [efig-p152.png](manuals/images/efig-p152.png), [efig-p184.png](manuals/images/efig-p184.png), [efig-p185.png](manuals/images/efig-p185.png), [efig-p186.png](manuals/images/efig-p186.png), [efig-p201.png](manuals/images/efig-p201.png), [efig-p202.png](manuals/images/efig-p202.png), [efig-p209.png](manuals/images/efig-p209.png), [efig-p210.png](manuals/images/efig-p210.png), [efig-p211.png](manuals/images/efig-p211.png), [efig-p399.png](manuals/images/efig-p399.png), [efig-p409.png](manuals/images/efig-p409.png), [efig-p410.png](manuals/images/efig-p410.png), [efig-p442.png](manuals/images/efig-p442.png), [efig-p445.png](manuals/images/efig-p445.png), [smm-fig12-1-aspect-angle.png](manuals/images/smm-fig12-1-aspect-angle.png), [smm-fig12-15-turning-rejoin.png](manuals/images/smm-fig12-15-turning-rejoin.png), [smm-fig12-16-hot-line-and-cold-line-rejoins.png](manuals/images/smm-fig12-16-hot-line-and-cold-line-rejoins.png), [smm-fig12-17-straight-ahead-rejoin.png](manuals/images/smm-fig12-17-straight-ahead-rejoin.png), [smm-fig12-19-fighting-wing-references.png](manuals/images/smm-fig12-19-fighting-wing-references.png), [smm-fig12-2-heading-crossing-angle.png](manuals/images/smm-fig12-2-heading-crossing-angle.png), [smm-fig12-24-lead-and-lag-pursuit-curves.png](manuals/images/smm-fig12-24-lead-and-lag-pursuit-curves.png), [smm-fig16-10-maintaining-separation-in-a-turn.png](manuals/images/smm-fig16-10-maintaining-separation-in-a-turn.png), [smm-fig16-11-line-abreast.png](manuals/images/smm-fig16-11-line-abreast.png), [smm-fig16-14-line-abreast-mutual-blind-area.png](manuals/images/smm-fig16-14-line-abreast-mutual-blind-area.png), [smm-fig16-15-lab-delayed-90-turns.png](manuals/images/smm-fig16-15-lab-delayed-90-turns.png), [smm-fig16-16-delayed-45-lab-turn.png](manuals/images/smm-fig16-16-delayed-45-lab-turn.png), [smm-fig16-17-45-degree-lab-with-check.png](manuals/images/smm-fig16-17-45-degree-lab-with-check.png), [smm-fig16-18-check-and-in-place-turns.png](manuals/images/smm-fig16-18-check-and-in-place-turns.png), [smm-fig16-19-lab-hook-turn.png](manuals/images/smm-fig16-19-lab-hook-turn.png), [smm-fig16-20-shackle.png](manuals/images/smm-fig16-20-shackle.png), [smm-fig16-21-cross-turn.png](manuals/images/smm-fig16-21-cross-turn.png), [smm-fig16-24-turning-rejoin-away.png](manuals/images/smm-fig16-24-turning-rejoin-away.png), [smm-fig16-25-hot-turning-rejoin-from-lab.png](manuals/images/smm-fig16-25-hot-turning-rejoin-from-lab.png), [smm-fig16-26-2-ship-g-awareness.png](manuals/images/smm-fig16-26-2-ship-g-awareness.png), [smm-fig16-27-basic-four-plane-formations.png](manuals/images/smm-fig16-27-basic-four-plane-formations.png), [smm-fig16-28-four-plane-line-ups.png](manuals/images/smm-fig16-28-four-plane-line-ups.png), [smm-fig16-29-four-plane-fighting-wing.png](manuals/images/smm-fig16-29-four-plane-fighting-wing.png), [smm-fig16-30-offset-box-delayed-90-right.png](manuals/images/smm-fig16-30-offset-box-delayed-90-right.png), [smm-fig16-31-offset-box-delayed-45-right.png](manuals/images/smm-fig16-31-offset-box-delayed-45-right.png), [smm-fig16-32-offset-box-hook-turn.png](manuals/images/smm-fig16-32-offset-box-hook-turn.png), [smm-fig16-33-spread-4-lab.png](manuals/images/smm-fig16-33-spread-4-lab.png), [smm-fig16-34-spread-4-delayed-turns.png](manuals/images/smm-fig16-34-spread-4-delayed-turns.png), [smm-fig16-35-spread-4-g-warm.png](manuals/images/smm-fig16-35-spread-4-g-warm.png), [smm-fig16-36-spread-4-hook-turn.png](manuals/images/smm-fig16-36-spread-4-hook-turn.png), [smm-fig16-9-aspect-angle-and-heading-crossing-angle.png](manuals/images/smm-fig16-9-aspect-angle-and-heading-crossing-angle.png), [t6a-airspeed-mach-limits.png](manuals/images/t6a-airspeed-mach-limits.png), [t6a-max-glide-distance.png](manuals/images/t6a-max-glide-distance.png), [t6a-sustained-turn-radius.png](manuals/images/t6a-sustained-turn-radius.png), [t6a-sustained-turn-rate.png](manuals/images/t6a-sustained-turn-rate.png), [t6a-vn-diagram.png](manuals/images/t6a-vn-diagram.png)

### manuals/images/smm-formation/

SMM formation pages as pictures.

- [smm-part7-p10.png](manuals/images/smm-formation/smm-part7-p10.png), [smm-part7-p11.png](manuals/images/smm-formation/smm-part7-p11.png), [smm-part7-p13.png](manuals/images/smm-formation/smm-part7-p13.png), [smm-part7-p26.png](manuals/images/smm-formation/smm-part7-p26.png), [smm-part7-p28.png](manuals/images/smm-formation/smm-part7-p28.png), [smm-part7-p8.png](manuals/images/smm-formation/smm-part7-p8.png), [smm-part7-p9.png](manuals/images/smm-formation/smm-part7-p9.png), [smm-part8-p0.png](manuals/images/smm-formation/smm-part8-p0.png), [smm-part8-p2.png](manuals/images/smm-formation/smm-part8-p2.png), [smm-part8-p3.png](manuals/images/smm-formation/smm-part8-p3.png)


- [plan.md](test-trim/plan.md): Which tests would go and which stay in the test trim.

### traffic-deconfliction/

- [design.md](traffic-deconfliction/design.md): Traffic automatic deconfliction, design on paper (4 Oct).

### traffic-map-rebuild/

- [point-list.md](traffic-map-rebuild/point-list.md): Moose Jaw routes in true feet, draft point list (5 Oct).
- Other files (pictures, diagram sources, scripts, data): [crossing-runway-choice.jpg](traffic-map-rebuild/crossing-runway-choice.jpg), [draft-29L-pattern.jpg](traffic-map-rebuild/draft-29L-pattern.jpg)

### traffic-pr4/

- [cleanup-list.md](traffic-pr4/cleanup-list.md): Traffic refactor PR 4: unused code out and its tests.
- [phase-logic-inventory.md](traffic-pr4/phase-logic-inventory.md): Traffic PR 4: leftover phase logic inventory.
- [slice-e.md](traffic-pr4/slice-e.md): Touch-and-go: the one old test that expected the jump.
- [stress-5-2.md](traffic-pr4/stress-5-2.md): Breakout roll rate: the one old test that expected 90°/s.
- Other files (pictures, diagram sources, scripts, data): [cleanup.patch](traffic-pr4/cleanup.patch)

### traffic-renders/

3D renders of the circuit from the app.

- [base-from-south-east.png](traffic-renders/base-from-south-east.png), [base-from-south-west.png](traffic-renders/base-from-south-west.png), [the-window.png](traffic-renders/the-window.png)

### traffic-review/

- [fable-gear-drag-consult.md](traffic-review/fable-gear-drag-consult.md): Fable consult: gear and flap drag in the PFL (5 Oct).
- [fable-pfl-review-brief.md](traffic-review/fable-pfl-review-brief.md): The brief for that Fable review.
- [fable-report.md](traffic-review/fable-report.md): **Fable's review of the Traffic PFL and flying code.**
- [pfl-full-rewrite-handover.md](traffic-review/pfl-full-rewrite-handover.md): **Read first for PFL.** Handover for the future PFL full rewrite as a segment planner.
- [pfl-glide-drag-consult.md](traffic-review/pfl-glide-drag-consult.md): Fable consult: PFL glide drag, sources and how to model it (5 Oct).
- [pfl-rework-handover.md](traffic-review/pfl-rework-handover.md): Brief for the PFL rework thread (5 Oct): what was built and why.
- Other files (pictures, diagram sources, scripts, data): [runway-outlines-cockpit.png](traffic-review/runway-outlines-cockpit.png), [runway-paint-cockpit.png](traffic-review/runway-paint-cockpit.png), [runway-paint-vs-photo-29L.png](traffic-review/runway-paint-vs-photo-29L.png), [runway-standin-no-photo.png](traffic-review/runway-standin-no-photo.png)

### traffic-review/fable-traces/

Fable's trace scripts for the PFL review.

- [pfl-debug.js](traffic-review/fable-traces/pfl-debug.js), [trace.mjs](traffic-review/fable-traces/trace.mjs), [trace2.mjs](traffic-review/fable-traces/trace2.mjs), [trace3.mjs](traffic-review/fable-traces/trace3.mjs), [trace4.mjs](traffic-review/fable-traces/trace4.mjs)

### traffic-review/rework-traces/

PFL rework trace scripts and outputs (gear-drag/ holds the drag comparison runs).

- [after3.txt](traffic-review/rework-traces/after3.txt), [baseline.txt](traffic-review/rework-traces/baseline.txt), [cj.mjs](traffic-review/rework-traces/cj.mjs), [cp.mjs](traffic-review/rework-traces/cp.mjs), [dbg.mjs](traffic-review/rework-traces/dbg.mjs), [ft.mjs](traffic-review/rework-traces/ft.mjs), [trace.mjs](traffic-review/rework-traces/trace.mjs)

### traffic-review/rework-traces/gear-drag/

- [1-final-turn-starts.txt](traffic-review/rework-traces/gear-drag/1-final-turn-starts.txt), [1-main-chart-drag.txt](traffic-review/rework-traces/gear-drag/1-main-chart-drag.txt), [2-smm-gear-chart-flaps-30deg-orbits.txt](traffic-review/rework-traces/gear-drag/2-smm-gear-chart-flaps-30deg-orbits.txt), [3-final-turn-starts.txt](traffic-review/rework-traces/gear-drag/3-final-turn-starts.txt), [3-smm-gear-flaps-on-top-branch.txt](traffic-review/rework-traces/gear-drag/3-smm-gear-flaps-on-top-branch.txt), [4-fable-whole-polar-1nm.txt](traffic-review/rework-traces/gear-drag/4-fable-whole-polar-1nm.txt), [4-final-turn-starts.txt](traffic-review/rework-traces/gear-drag/4-final-turn-starts.txt), [5-final-turn-starts.txt](traffic-review/rework-traces/gear-drag/5-final-turn-starts.txt), [5-whole-polar-fit-30deg-orbit.txt](traffic-review/rework-traces/gear-drag/5-whole-polar-fit-30deg-orbit.txt), [need.mjs](traffic-review/rework-traces/gear-drag/need.mjs), [orbit.mjs](traffic-review/rework-traces/gear-drag/orbit.mjs)

### traffic-setup/

Before/after screenshots of the Traffic setup panel (and V6's).

- [wording.md](traffic-setup/wording.md): Traffic setup panel wording that needed Patrick's yes.
- Other files (pictures, diagram sources, scripts, data): [after.png](traffic-setup/after.png), [before.png](traffic-setup/before.png), [random.png](traffic-setup/random.png), [v6.png](traffic-setup/v6.png)

### turn-fight-review/

- [README.md](turn-fight-review/README.md): **Read first for Fight Sim.** Index of the 4 Oct architecture review and its reading order.
- [architecture.md](turn-fight-review/architecture.md): Fight Sim flow chart, every file and control, clean-up list.
- [display-proposal.md](turn-fight-review/display-proposal.md): Aircraft data display (tags) proposal.
- [flight-math-duplicates.md](turn-fight-review/flight-math-duplicates.md): Flight math duplicated outside src/core.
- [inventory.md](turn-fight-review/inventory.md): Fight Sim file inventory.
- [keep-list.md](turn-fight-review/keep-list.md): What the refactor must keep (TF-57).
- [pr2-test-rewrites.md](turn-fight-review/pr2-test-rewrites.md): PR 2 rewritten tests, for Patrick's look.
- [refactor-wording.md](turn-fight-review/refactor-wording.md): Refactor wording approved by Patrick (merged as #268).
- [review.md](turn-fight-review/review.md): The Fight Sim review: faults, options, recommendation.
- [settings-catalogue.md](turn-fight-review/settings-catalogue.md): Every Fight Sim setting and what to simplify.
- [traces.md](turn-fight-review/traces.md): 19 fights flown in Node on the old engine.
- Other files (pictures, diagram sources, scripts, data): [architecture.png](turn-fight-review/architecture.png), [architecture.svg](turn-fight-review/architecture.svg), [fingerprint.mjs](turn-fight-review/fingerprint.mjs), [step-today-vs-proposed.png](turn-fight-review/step-today-vs-proposed.png), [step-today-vs-proposed.svg](turn-fight-review/step-today-vs-proposed.svg), [trace-out-1.json](turn-fight-review/trace-out-1.json), [trace-out-2.json](turn-fight-review/trace-out-2.json), [trace.mjs](turn-fight-review/trace.mjs)

### turn-fight-review/before/

Fight Sim trace outputs before the refactor, one per case.

- [auto.json](turn-fight-review/before/auto.json), [auto140.json](turn-fight-review/before/auto140.json), [auto300.json](turn-fight-review/before/auto300.json), [avoidanceOff.json](turn-fight-review/before/avoidanceOff.json), [default.json](turn-fight-review/before/default.json), [forcedImm.json](turn-fight-review/before/forcedImm.json), [forcedPitchBack.json](turn-fight-review/before/forcedPitchBack.json), [forcedSlice.json](turn-fight-review/before/forcedSlice.json), [forcedSplitS.json](turn-fight-review/before/forcedSplitS.json), [heights.json](turn-fight-review/before/heights.json), [lagPursuit.json](turn-fight-review/before/lagPursuit.json), [leadPursuit.json](turn-fight-review/before/leadPursuit.json), [low.json](turn-fight-review/before/low.json), [m140.json](turn-fight-review/before/m140.json), [m180.json](turn-fight-review/before/m180.json), [m260.json](turn-fight-review/before/m260.json), [m300.json](turn-fight-review/before/m300.json), [tacticalPursuit.json](turn-fight-review/before/tacticalPursuit.json), [unequal.json](turn-fight-review/before/unequal.json)

### turn-sim-review/

- [README.md](turn-sim-review/README.md): Index of the Formation review folder (its archive/ was not copied).
- [code-review-brief-draft.md](turn-sim-review/code-review-brief-draft.md): Draft brief for a Formation code review (wording not confirmed).
- [fable-compiled.md](turn-sim-review/fable-compiled.md): What Fable told us across reviews, and what we did with it.
- [fable-findings-mapped.md](turn-sim-review/fable-findings-mapped.md): **Fable's engine review mapped back to our real names and files.** Read with the report.
- [formation-sim-handover.md](turn-sim-review/formation-sim-handover.md): **Read first for Formation.** Where the module stands, Patrick's rulings, lessons, open items.
- [fset-base.txt](turn-sim-review/fset-base.txt): Baseline output of fset.mjs before the refactor.
- [fset.mjs](turn-sim-review/fset.mjs): Flight set script used in the refactor: `node fset.mjs <repo root>` prints the end state after each press.
- [refactor-plan.md](turn-sim-review/refactor-plan.md): Fable's Formation refactor plan (5 Oct). The 6-step refactor finished 6 Oct (V2.155-V2.163).
- [rejoin-review-fable.md](turn-sim-review/rejoin-review-fable.md): Raw notes from Fable's rejoin review (5 Oct).
- [rendezvous-glossary.md](turn-sim-review/rendezvous-glossary.md): Wording to use in Fable briefs (Fable refuses some formation words).
- [rulings-to-ratify.md](turn-sim-review/rulings-to-ratify.md): What Patrick has to fly and ratify (V2.75-V2.84).
- [ts-96-wording.md](turn-sim-review/ts-96-wording.md): TS-96 wording for Patrick's yes.
- [ts-98-wording.md](turn-sim-review/ts-98-wording.md): TS-98 wording for Patrick's yes.

### turn-sim-review/architecture/

- [architecture.md](turn-sim-review/architecture/architecture.md): Formation architecture review of 4 Oct (background, before the live core).
- Other files (pictures, diagram sources, scripts, data): [architecture-step-loop.png](turn-sim-review/architecture/architecture-step-loop.png), [architecture-step-loop.svg](turn-sim-review/architecture/architecture-step-loop.svg), [architecture.png](turn-sim-review/architecture/architecture.png), [architecture.svg](turn-sim-review/architecture/architecture.svg)

### turn-sim-review/chooser/

- [fight-sim-pursuit-check.md](turn-sim-review/chooser/fight-sim-pursuit-check.md): Fight Sim pursuit: three suspected faults checked.
- [map.md](turn-sim-review/chooser/map.md): One chooser for the wingman: map for the review.
- [options.md](turn-sim-review/chooser/options.md): How #2 should be flown: options, requirements, clashes.
- [plan.md](turn-sim-review/chooser/plan.md): The chooser plan (sections 15-18 are the handover).
- [session-plan.md](turn-sim-review/chooser/session-plan.md): Session plan: press mid-move and the lag roll as an entry.

### turn-sim-review/chooser/formation-handover/

Work-in-progress F11 replan code and probe scripts handed over to Formation.

- [f11-replan.js](turn-sim-review/chooser/formation-handover/f11-replan.js), [f11-wip.diff](turn-sim-review/chooser/formation-handover/f11-wip.diff), [mid.mjs](turn-sim-review/chooser/formation-handover/mid.mjs), [mid2.mjs](turn-sim-review/chooser/formation-handover/mid2.mjs), [mid3.mjs](turn-sim-review/chooser/formation-handover/mid3.mjs), [mid4.mjs](turn-sim-review/chooser/formation-handover/mid4.mjs), [mid5.mjs](turn-sim-review/chooser/formation-handover/mid5.mjs), [sweep-close.mjs](turn-sim-review/chooser/formation-handover/sweep-close.mjs)

### turn-sim-review/chooser/sims/

Small Node sims used in the chooser review.

- [lag-ech.mjs](turn-sim-review/chooser/sims/lag-ech.mjs), [legs.mjs](turn-sim-review/chooser/sims/legs.mjs), [mid.mjs](turn-sim-review/chooser/sims/mid.mjs), [trace-lab.mjs](turn-sim-review/chooser/sims/trace-lab.mjs)

### turn-sim-review/drawn-path/

- [handover.md](turn-sim-review/drawn-path/handover.md): Handover for fixing drawn-path moves on the point-mass model (waits for Antigravity).
- Check scripts: [jerk.mjs](turn-sim-review/drawn-path/jerk.mjs), [lag.mjs](turn-sim-review/drawn-path/lag.mjs), [lagpm.mjs](turn-sim-review/drawn-path/lagpm.mjs)

### turn-sim-review/fighting-wing/

- [design.md](turn-sim-review/fighting-wing/design.md): Fighting wing and fluid manoeuvring design.
- [fluid-conflicts.md](turn-sim-review/fighting-wing/fluid-conflicts.md): Where the manuals disagree on fluid, and the picks.
- [manoeuvre-geometry.md](turn-sim-review/fighting-wing/manoeuvre-geometry.md): Fluid and fighting wing geometry from the manuals.
- [piece2-references.md](turn-sim-review/fighting-wing/piece2-references.md): Live wingman references and Patrick's adds.
- Other files (pictures, diagram sources, scripts, data): [fig1-cones.png](turn-sim-review/fighting-wing/fig1-cones.png), [fig1-cones.svg](turn-sim-review/fighting-wing/fig1-cones.svg), [fig2-pursuit.png](turn-sim-review/fighting-wing/fig2-pursuit.png), [fig2-pursuit.svg](turn-sim-review/fighting-wing/fig2-pursuit.svg), [fig3-design.png](turn-sim-review/fighting-wing/fig3-design.png), [fig3-design.svg](turn-sim-review/fighting-wing/fig3-design.svg), [fig4-screen.png](turn-sim-review/fighting-wing/fig4-screen.png), [fig4-screen.svg](turn-sim-review/fighting-wing/fig4-screen.svg), [make-figures.mjs](turn-sim-review/fighting-wing/make-figures.mjs), [render-png.mjs](turn-sim-review/fighting-wing/render-png.mjs), [toy-a-level180-away.png](turn-sim-review/fighting-wing/toy-a-level180-away.png), [toy-a-level180-away.svg](turn-sim-review/fighting-wing/toy-a-level180-away.svg), [toy-b-level180-into.png](turn-sim-review/fighting-wing/toy-b-level180-into.png), [toy-b-level180-into.svg](turn-sim-review/fighting-wing/toy-b-level180-into.svg), [toy-c-reversal.png](turn-sim-review/fighting-wing/toy-c-reversal.png), [toy-c-reversal.svg](turn-sim-review/fighting-wing/toy-c-reversal.svg), [toy-check.mjs](turn-sim-review/fighting-wing/toy-check.mjs), [toy-d-climb-descend.png](turn-sim-review/fighting-wing/toy-d-climb-descend.png), [toy-d-climb-descend.svg](turn-sim-review/fighting-wing/toy-d-climb-descend.svg), [toy-e-fm-level.png](turn-sim-review/fighting-wing/toy-e-fm-level.png), [toy-e-fm-level.svg](turn-sim-review/fighting-wing/toy-e-fm-level.svg), [toy-results.json](turn-sim-review/fighting-wing/toy-results.json)

### turn-sim-review/four-ship/

- [close-changes-matrix.md](turn-sim-review/four-ship/close-changes-matrix.md): Four-ship close changes: the SMM against what we script.
- [design.md](turn-sim-review/four-ship/design.md): Four-ship design.
- [matrix.generated.md](turn-sim-review/four-ship/matrix.generated.md): Generated from/to table of four-ship formation changes.
- [moves-from-the-manuals.md](turn-sim-review/four-ship/moves-from-the-manuals.md): Four-ship moves as the manuals describe them, for ratifying.
- [offset-box-review.md](turn-sim-review/four-ship/offset-box-review.md): Offset box: entry, moves, and how we model it (6 Oct).
- [rebuild-handover.md](turn-sim-review/four-ship/rebuild-handover.md): Four-ship rebuild handover (refactor PRs 6-8).
- Other files (pictures, diagram sources, scripts, data): [fig1-close-formations.png](turn-sim-review/four-ship/fig1-close-formations.png), [fig1-close-formations.svg](turn-sim-review/four-ship/fig1-close-formations.svg), [fig2-big-formations.png](turn-sim-review/four-ship/fig2-big-formations.png), [fig2-big-formations.svg](turn-sim-review/four-ship/fig2-big-formations.svg), [fig3-formation-graph.png](turn-sim-review/four-ship/fig3-formation-graph.png), [fig3-formation-graph.svg](turn-sim-review/four-ship/fig3-formation-graph.svg), [fig4-g-warm.png](turn-sim-review/four-ship/fig4-g-warm.png), [fig4-g-warm.svg](turn-sim-review/four-ship/fig4-g-warm.svg), [fig5-offset-box-entry.png](turn-sim-review/four-ship/fig5-offset-box-entry.png), [fig5-offset-box-entry.svg](turn-sim-review/four-ship/fig5-offset-box-entry.svg), [fig6-gates.png](turn-sim-review/four-ship/fig6-gates.png), [fig6-gates.svg](turn-sim-review/four-ship/fig6-gates.svg), [fig7-screen.png](turn-sim-review/four-ship/fig7-screen.png), [fig7-screen.svg](turn-sim-review/four-ship/fig7-screen.svg), [graph-data.mjs](turn-sim-review/four-ship/graph-data.mjs), [make-pictures.mjs](turn-sim-review/four-ship/make-pictures.mjs), [probe-delays.mjs](turn-sim-review/four-ship/probe-delays.mjs), [render-png.mjs](turn-sim-review/four-ship/render-png.mjs)

### turn-sim-review/fw-turn-entry/

- [fw-turn-entry.md](turn-sim-review/fw-turn-entry/fw-turn-entry.md): Fable: #2 flies wide when Lead turns away in fighting wing.

### turn-sim-review/line-abreast/

- [line-abreast.md](turn-sim-review/line-abreast/line-abreast.md): Line abreast from the manuals.

### turn-sim-review/move-in-band/

- [move-in-band.md](turn-sim-review/move-in-band/move-in-band.md): Fable: move #2 anywhere in the band, code and wiring.
- Other files (pictures, diagram sources, scripts, data): [dry-run-output.txt](turn-sim-review/move-in-band/dry-run-output.txt), [dry-run.mjs](turn-sim-review/move-in-band/dry-run.mjs), [move-in-band.js](turn-sim-review/move-in-band/move-in-band.js)

### turn-sim-review/rolling-rejoin/

- [approach.md](turn-sim-review/rolling-rejoin/approach.md): TRJ + roll: how it is flown.

### turn-sim-review/sarj-line/

- [sarj-up-the-line.md](turn-sim-review/sarj-line/sarj-up-the-line.md): Fable: straight-ahead rejoin hits the line and flows up it.
- [turning-rejoin-design.md](turn-sim-review/sarj-line/turning-rejoin-design.md): Turning rejoin: Lead fixed on the canopy to a 100 ft decision point.
- [turning-rejoin-on-the-line.md](turn-sim-review/sarj-line/turning-rejoin-on-the-line.md): Turning rejoin reaching the line at route.

### turn-sim-review/screens/

Formation app screenshots by version.

- [1-default-start.png](turn-sim-review/screens/1-default-start.png), [2-mid-turn-labels.png](turn-sim-review/screens/2-mid-turn-labels.png), [4-end-delayed-90.png](turn-sim-review/screens/4-end-delayed-90.png), [5-end-delayed-90-clock-cue.png](turn-sim-review/screens/5-end-delayed-90-clock-cue.png), [6-end-delayed-45-clock-cue.png](turn-sim-review/screens/6-end-delayed-45-clock-cue.png), [cleanup1-2ship-echelon.png](turn-sim-review/screens/cleanup1-2ship-echelon.png), [cleanup1-2ship-fw-turn.png](turn-sim-review/screens/cleanup1-2ship-fw-turn.png), [cleanup1-4ship-finger.png](turn-sim-review/screens/cleanup1-4ship-finger.png), [v216-echelon-3d-level.png](turn-sim-review/screens/v216-echelon-3d-level.png), [v216-echelon-3d-turn-left.png](turn-sim-review/screens/v216-echelon-3d-turn-left.png), [v216-tags-4ship-finger.png](turn-sim-review/screens/v216-tags-4ship-finger.png), [v216-tags-4ship-rejoin.png](turn-sim-review/screens/v216-tags-4ship-rejoin.png), [v217-fluid-level-turn.png](turn-sim-review/screens/v217-fluid-level-turn.png), [v217-fluid-reversal.png](turn-sim-review/screens/v217-fluid-reversal.png), [v217-fluid-terminated.png](turn-sim-review/screens/v217-fluid-terminated.png), [v217-fw-settings-2ship.png](turn-sim-review/screens/v217-fw-settings-2ship.png), [v217-fw-settings-4ship.png](turn-sim-review/screens/v217-fw-settings-4ship.png), [v218-climb.png](turn-sim-review/screens/v218-climb.png), [v218-loop-b.png](turn-sim-review/screens/v218-loop-b.png), [v218-loop-e.png](turn-sim-review/screens/v218-loop-e.png), [v219-barrel-roll.png](turn-sim-review/screens/v219-barrel-roll.png), [v219-check-barrel.png](turn-sim-review/screens/v219-check-barrel.png), [v219-check-fw-turn-5.png](turn-sim-review/screens/v219-check-fw-turn-5.png), [v219-check-fw-turn-9.png](turn-sim-review/screens/v219-check-fw-turn-9.png), [v219-check-reversal.png](turn-sim-review/screens/v219-check-reversal.png), [v219-check-sequence.png](turn-sim-review/screens/v219-check-sequence.png), [v219-check-wingover.png](turn-sim-review/screens/v219-check-wingover.png), [v219-sequence.png](turn-sim-review/screens/v219-sequence.png), [v219-wingover-top.png](turn-sim-review/screens/v219-wingover-top.png), [v220-check-barrel.png](turn-sim-review/screens/v220-check-barrel.png), [v220-check-fast-echelon-12.png](turn-sim-review/screens/v220-check-fast-echelon-12.png), [v220-check-fast-echelon-20.png](turn-sim-review/screens/v220-check-fast-echelon-20.png), [v220-check-fast-echelon-6.png](turn-sim-review/screens/v220-check-fast-echelon-6.png), [v220-check-fw-turn.png](turn-sim-review/screens/v220-check-fw-turn.png), [v220-check-reversal.png](turn-sim-review/screens/v220-check-reversal.png), [v220-check-sequence.png](turn-sim-review/screens/v220-check-sequence.png), [v220-check-wingover.png](turn-sim-review/screens/v220-check-wingover.png), [v220-default-start.png](turn-sim-review/screens/v220-default-start.png), [v220-offstandard-fix-1.png](turn-sim-review/screens/v220-offstandard-fix-1.png), [v220-offstandard-fix-2.png](turn-sim-review/screens/v220-offstandard-fix-2.png), [v220-offstandard-fix-3.png](turn-sim-review/screens/v220-offstandard-fix-3.png), [v220-offstandard-fix-4.png](turn-sim-review/screens/v220-offstandard-fix-4.png), [v220-offstandard-fix-5.png](turn-sim-review/screens/v220-offstandard-fix-5.png), [v220-offstandard-fix-6.png](turn-sim-review/screens/v220-offstandard-fix-6.png), [v220-offstandard-fix-end.png](turn-sim-review/screens/v220-offstandard-fix-end.png), [v220-offstandard-reference-1.png](turn-sim-review/screens/v220-offstandard-reference-1.png), [v220-offstandard-reference-2.png](turn-sim-review/screens/v220-offstandard-reference-2.png), [v220-offstandard-reference-3.png](turn-sim-review/screens/v220-offstandard-reference-3.png), [v220-offstandard-reference-4.png](turn-sim-review/screens/v220-offstandard-reference-4.png), [v220-offstandard-reference-5.png](turn-sim-review/screens/v220-offstandard-reference-5.png), [v220-offstandard-reference-6.png](turn-sim-review/screens/v220-offstandard-reference-6.png), [v220-offstandard-reference-end.png](turn-sim-review/screens/v220-offstandard-reference-end.png), [v220-power-red-1.png](turn-sim-review/screens/v220-power-red-1.png), [v221-check-fast-echelon-12.png](turn-sim-review/screens/v221-check-fast-echelon-12.png), [v221-check-fast-echelon-20.png](turn-sim-review/screens/v221-check-fast-echelon-20.png), [v221-check-fast-echelon-6.png](turn-sim-review/screens/v221-check-fast-echelon-6.png), [v222-smoke.png](turn-sim-review/screens/v222-smoke.png)

### turn-sim-review/screens-v2.88/

Formation screenshots before/after V2.88.

- [after-1-line-abreast.png](turn-sim-review/screens-v2.88/after-1-line-abreast.png), [after-2-fighting-wing.png](turn-sim-review/screens-v2.88/after-2-fighting-wing.png), [after-3-echelon.png](turn-sim-review/screens-v2.88/after-3-echelon.png), [after-4-height-in-tag-2d.png](turn-sim-review/screens-v2.88/after-4-height-in-tag-2d.png), [after-5-fluid.png](turn-sim-review/screens-v2.88/after-5-fluid.png), [after-6-lab-again.png](turn-sim-review/screens-v2.88/after-6-lab-again.png), [before-1-line-abreast.png](turn-sim-review/screens-v2.88/before-1-line-abreast.png), [before-2-fighting-wing.png](turn-sim-review/screens-v2.88/before-2-fighting-wing.png), [before-3-echelon.png](turn-sim-review/screens-v2.88/before-3-echelon.png)

### turn-sim-review/screens-v2.90/

Formation screenshots at V2.90.

- [01-mid-rejoin-3d.png](turn-sim-review/screens-v2.90/01-mid-rejoin-3d.png), [02-mid-station-change-3d.png](turn-sim-review/screens-v2.90/02-mid-station-change-3d.png), [03-settled-echelon-3d.png](turn-sim-review/screens-v2.90/03-settled-echelon-3d.png), [04-mid-rejoin-2d.png](turn-sim-review/screens-v2.90/04-mid-rejoin-2d.png), [05-settled-echelon-2d.png](turn-sim-review/screens-v2.90/05-settled-echelon-2d.png)

### turn-sim-review/transitions/

- [design.md](turn-sim-review/transitions/design.md): Changing formation design.
- [spec-draft.md](turn-sim-review/transitions/spec-draft.md): Draft spec wording for changing formation (2-ship).
- Other files (pictures, diagram sources, scripts, data): [formation-positions.png](turn-sim-review/transitions/formation-positions.png), [formation-positions.svg](turn-sim-review/transitions/formation-positions.svg), [make-pictures.mjs](turn-sim-review/transitions/make-pictures.mjs), [rejoin-from-lab-turn-away.svg](turn-sim-review/transitions/rejoin-from-lab-turn-away.svg), [rejoin-from-lab-turn-into.svg](turn-sim-review/transitions/rejoin-from-lab-turn-into.svg), [screen-change-formation.png](turn-sim-review/transitions/screen-change-formation.png), [screen-change-formation.svg](turn-sim-review/transitions/screen-change-formation.svg)
