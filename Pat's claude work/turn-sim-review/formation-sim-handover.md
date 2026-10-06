# Formation Sim: the one handover (condensed 5 Oct 2026, 22:20Z, by the Fable thread at Patrick's ask)

**Wording for Fable briefs and notes:** use [rendezvous-glossary.md](rendezvous-glossary.md) (Patrick 6 Oct 03:14Z).

Read this first. It replaces reading the whole folder. Detail lives in the files it points to; the repo wins where they differ (`AGENTS.md`, then `docs/modules/turn-sim/`). Every number here is an estimate unless a manual page or Patrick's ruling is beside it. Manual text and the CFAFM never go in the repo or these files; cite pages only.

## 1. Where it stands (main at V2.84, 5 Oct 21:56Z)

Built and merged, none of it seen on screen by Patrick yet. Fly from the default start (hard refresh, badge V2.84), then say yes or what is wrong: [rulings-to-ratify.md](rulings-to-ratify.md) lists each version with the words behind it. Decisions TS-69 to TS-84 are in `docs/modules/turn-sim/decisions.md`.

| Piece | Versions |
|---|---|
| Held-command turning rejoin, SARJ, echelon to fighting wing, lag roll, fluid by energy, the rejoin rule | V2.63-V2.71 (TS-69 to TS-75) |
| One chooser scores every way #2 can change formation; auto rejoin | V2.75, V2.77 (TS-76) |
| Close turns hold the wing plane; echelon turns slow (60°, 2 G in about 4 s) | V2.76, V2.78 (TS-77, TS-78) |
| Press mid-move re-plans; done when in band and steady; opening out in a full-power dive; lag roll from echelon | V2.78, V2.79 (TS-78, TS-79) |
| In position = the band (fighting wing cone ±200 ft, line abreast SMM 16.18 para 49 band, close within 5 ft and 5 kt) | V2.80 (TS-80) |
| Re-plan at the decision point and when the picture breaks; height costs G and the vertical is a candidate; fighting wing legs end anywhere in the cone; one home for the two rate sets | V2.81-V2.84 (TS-81 to TS-84) |

Being built now (Formation thread, Opus): the core roll-rate curve and G onset, with the envelope gate and the mid-press bank-thrash fix ([manuals/performance-audit-5oct.md](../manuals/performance-audit-5oct.md) section 3; [chooser/plan.md](chooser/plan.md) section 17).

## 2. Patrick's rulings that govern the flying

- **Rejoins** (TS-75): never below 200 KIAS unless close in and hot (then a brief dip and MAX); on the line at 200-210; at least 220 up the line; slow at the decision point, where an idle stop fits. Rates = his 15/25/50 kt of close-in overtake.
- **Close formation** uses the near-Lead throttle and slow smooth rolls (Lead 30°/s; echelon about 4-5 s to 60° and 2 G). **Any tactical formation** is unrestricted: attitude, power and ancillaries (21:06Z, 21:11Z).
- **Fighting wing uses the whole cone**, high or low; the slot is only the aim. #2 can be above Lead.
- **In position = in the band** (TS-80). Close formation within 5 ft and 5 kt. "Done when in band": line abreast ends once #2 is in band while Lead speeds up; Lead holds 200 until #2 is out.
- **Form uses geometry** (cut-off, lag, height) inside the aircraft's real speed and power. The T-6 has about 1 kt/s in hand at 220 KIAS at 8,000 ft; a plan that needs #2 faster than Lead for long is fiction.
- **Mid-change press or turn = event, re-plan, nothing queues.** The vertical is a candidate when it scores quicker.
- **Manoeuvres match the manual pictures**; when sources conflict, ask Patrick. "It doesn't have to be a perfect SMM shape all the time. A lot of advanced form is art."
- **Published limits are flags, physical limits are walls** (7 G). G rule normal 5, last resort 7.
- **Keep it simple, get it to testing.** No new tests; a few troubleshooting sims are fine. One test per PR at most if ever.
- Roll and G onset: one curve in core (22:01Z, 22:04Z), estimates 0.45°/s per knot true capped near 120°/s, 0.3 s to full rate, 4 G/s, until Patrick gives real numbers.

## 3. Lessons (why earlier work was lost)

1. Name the kind of speed; compare like with like. One closure number was read three ways.
2. Formation flying happens in Lead's turning frame; a place inside the turn needs less speed than Lead.
3. Manoeuvring costs energy: clamp every planner with the full-power and slow-down rates at the G and climb it flies. Height changes cost G too (built V2.82).
4. Fly like a pilot: hold a bank and a power setting; don't re-aim every step.
5. Two failed fixes means trace the cause, not tune a number. Dry runs beat screenshots: [chooser/sims/legs.mjs](chooser/sims/legs.mjs) gives every change in one table.
6. A planner draws a path, then asks whether the aircraft can fly it. When a move looks slow, the path is asking for speed it cannot have (check `stretched` in a dry run).
7. Replayed paths must pass the same envelope as the planners (the 740°/s thrash, section 17 of the chooser plan).

## 4. Open items

Waiting on Patrick: climb-model fit to the NFM charts (only if he asks); the rulings list.

Parked until Patrick asks (Formation `future.md`): planned overshoot when too hot (SMM 12.27 paras 64-66); refuse a rejoin past about 360° of Lead's turn; lag roll in a turn (Lead's turning frame); 4-ship turning rejoin and mid-move presses; route, line astern and 4-ship turns at the slow roll; a turn pressed during a change into line abreast; moving #2 inside a band with the controls; the fluid 1,000 ft loop place; the errors panel's old lines (hot-rejoin.js) until the chooser covers them.

Refactor list (Patrick "execute" 22:13Z, order in [chooser/plan.md](chooser/plan.md) section 18): envelope gate with the ceiling PR; spec rewritten by topic after the fly-through (Sonnet); then a read-only refactor plan (candidate shape, retire hot-rejoin.js and errors.js, split tuning.js, events out of formation.js) for Patrick's yes; then Opus builds it one PR per item.

Fight Sim and Traffic: the lessons in section 3 (closure as overtake, G and climb costs, no re-aiming every step) go with their next piece of work; [chooser/fight-sim-pursuit-check.md](chooser/fight-sim-pursuit-check.md) found nothing to fix in the chooser review.

## 5. Where the detail lives

Live files in this folder:
- [rulings-to-ratify.md](rulings-to-ratify.md): what Patrick has to fly and say yes to.
- [fable-compiled.md](fable-compiled.md): the rejoin review's lessons, Used and To do (raw notes [rejoin-review-fable.md](rejoin-review-fable.md)).
- [chooser/](chooser/): the chooser review (map, options, plan with the handover sections 15-18, session plan, pursuit check, sims).
- Designs the code was built from: [fighting-wing/design.md](fighting-wing/design.md), [four-ship/design.md](four-ship/design.md), [line-abreast/line-abreast.md](line-abreast/line-abreast.md) (the manuals read), [transitions/design.md](transitions/design.md) (formation changes and rejoins), [architecture/architecture.md](architecture/architecture.md) (4 Oct, before the live core; background).
- [screens/](screens/): screenshots by version.
- [../manuals/performance-audit-5oct.md](../manuals/performance-audit-5oct.md): the T-6 model checked against the manuals; roll and G brief.

Archived in [archive/](archive/) (history, never instructions): the 4 Oct review log, the first-version spec draft, the clean-up plans and deletion review, the errors-panel proposals, the SMM-vs-code comparison, the rejoin analysis and fluid-stretch finding, the requirements log, and the parked patches.
