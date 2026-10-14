# Formation handover, 14 Oct 2026: the live wingman's fighting wing, redesign stage

For the next Formation session. Read `AGENTS.md`, `docs/PLAN.md` (its waiting list) and `docs/modules/turn-sim/README.md`, then this page. The long handover before it, `formation-handover-12oct-night.md`, is history: use it only to look something up.

## Where it stands

- **Branch** `formation-close-wingman-b2` (PR #1031, its CI not read). On screen: **V2.433**. Phase B never goes to main without Patrick.
- **Close formation (B1-B3):** flown and approved, and Live is the default.
- **Fighting wing (B5):** the live technique is behind "#2 in fighting wing: Live", with Old the default. It is rounds 1-4, tidied (T29t) with the flying byte-identical.
  - Patrick flew it on 14 Oct: it over-controls the aim point, roll and G; it sits too low too often; it bleeds energy by cranking; abeam, it matches Lead's bank instead of going to lag pursuit.
  - The architecture review explains why: the guard's lines sit on the ideal range, eleven add-ons answer one root problem, and the switches cause the fragility.
- **The control model (T29m part 1)** is merged: the master list, block diagrams, N² chart, tuning ledger, switching map and a first-cut bandwidth and delay table. The linear loops have 1.3-16 s of extra-delay margin, so the trouble is the switches.
- **Running when this was written:** T29m part 2 (trace columns, the injection hook, the scripted-Lead rig, the abeam baseline), by the control-systems Opus agent on `formation-control-analysis-plan`. Its report also goes to `formation-review-12oct/t29m-part2-report.md`. *(The thread updates this line when part 2 is merged.)*

## Next, in order (plan B5 in `docs/modules/turn-sim/plan.md`)

1. **Part 2, if not yet merged:**
   - read every `src` diff line (trace and optional probe only);
   - run the keep-unchanged checks below against runs made at b2's head before its commits;
   - merge into b2, with no version bump;
   - show Patrick, case by case, what the new columns show of his faults.
2. **T29s, spec 7e draft 4, written by the thread.** One clean design in place of the stacked "7. Ruling" paragraphs:
   - a normal flyer (a gentle circle or line follower) for nearly all the flying;
   - a few named techniques from the manual and his rulings: the miss (vertical first, below), lag pursuit from abeam, the high yo-yo, the exit dive or climb, S-turns, the very-stretched cut-across;
   - each technique on one card: source, assess, plan (sized once from the error and his energy), execute, monitor, hand back with a blend, 3-5 numbers, its gauge case;
   - techniques plan the path and the energy intent, and the same loops fly it;
   - phased handovers everywhere, and the guard as a barrier;
   - G onset smooth, constant and deliberate;
   - all TS-233 rulings folded in, with a picture.
3. **An Opus agent audits the draft,** read-only, against the control model and the rig (Patrick: "Spec 7e, then he will audit it"). In a new session, brief a fresh agent from the control model, the method plan and the review. Then Patrick approves.
4. **Round 5, re-cut from draft 4, in slices behind Live** (Old the default). Each slice must meet gates C1-C11 (`control-systems-analysis-plan.md` §7) before Patrick flies it. If one struggles, stop, analyse, and Patrick ratifies the fix. Run the method plan's measurements on each slice. The tapered guard comes first.
5. **Then** T29b-T29d (the climbs and descents, entry and exit, the aggressive Lead to 4 G), T29r's HUD readout, T30 (blended hand-overs), and T31 with Checkpoint G (Patrick flies fighting wing).
6. **B4 after that:** spec 7d is rewritten with TRJ and SARJ as techniques. TRJ keeps flying as it does today, and moves only if the live one flies at least as well.

## Patrick's rulings on 14 Oct (all in TS-233's row in `decisions.md`, and as "7. Ruling" paragraphs in spec 7e)

- **Fighting wing is turn entry, turning and turn exit,** geometry first in each. Inside Lead's circle and gaining, relax and recapture his circle.
- **The guard tapers:** nothing at 600 ft and over; firmer toward 500 ft; the miss below inside it. It's a backstop, not the pilot.
- **Turning into him from in position, not tight:** fly straight ahead until on the circle he wants, then capture pure, or with a slight lead or lag. He turns toward Lead only for the bubble, or when high on energy. Lag first goes.
- **From tight with Lead turning in:** vertical first, below.
- **Abeam with Lead turning in:** lag pursuit toward Lead's tail, the miss, then reverse and capture. This is the thread's reading of his note, to confirm.
- **The exit vertical** may use any height while the slant stays 500-1,000 ft behind the wing line; he settles back in TS-80's 200 ft band.
- **Power:** pull G, add power, unless bleeding energy on purpose. Power is the last tool.
- **At the G cap:** airspeed gives way first, then the vertical, then the turn. G onset is smooth, constant and deliberate, and the cap should be rare.
- **The 0.4 s delay** stays on Lead only, dead-reckoned; he knows his own state at once. Round 5 brings the whole-picture signals onto this rule.
- **Smooth, planned corrections:** "assess the error, make a plan, smoothly execute the plan/monitor perofmrance/adjust as requied". Gentle handovers at every switch; low only when needed.
- **The aggressive Lead** (up to 4 G, 90°/s roll) is part of B5, as T29d.
- **Analysis and gates:** build the model now and run the analysis on each slice; each slice meets C1-C11 before he flies it.

## The documents

| What | Where |
|---|---|
| The plan, tasks and acceptance | `docs/modules/turn-sim/plan.md`: B5 (T29, T29t, T29m, T29s, round 5's slices, T29r, T29d, T30, T31) and B4 |
| The design and the rulings | `docs/modules/turn-sim/spec.md` 7e (and 7d, to be rewritten); `decisions.md` TS-233 |
| The control model (block diagrams, N² chart, ledger, switching map, bandwidth table) | `docs/modules/turn-sim/control-model.md`, with its SVGs in `control-model/`. It is drawn from `tools/control-map/signals.mjs`; never hand-edit the drawings |
| How we model and analyse the controllers (gates C1-C11, methods, tasks CA0-CA8) | `Pat's claude work/formation-review-12oct/control-systems-analysis-plan.md` |
| The architecture review (verdict, findings F1-F12, recommended structure, slices) | `…/formation-review-12oct/fighting-wing-architecture-review.md` |
| What every removed option and folded switch did | `…/formation-review-12oct/fighting-wing-code-history.md` |
| Part 2's report | `…/formation-review-12oct/t29m-part2-report.md` |
| Fable's reviews | `…/formation-review-12oct/research/wingman-audit-fable-13oct.md`, `fable-fighting-wing-audit-14oct.md`, `fable-fighting-wing-report-14oct.md`, `fable-cone-turn-report-14oct.md` |
| The research (barriers, the pilot model, the delay budget) | `docs/references/formation-control-research-14oct.md`; the manual sweep in `docs/references/smm-fighting-wing-and-pursuit.md` |
| Recorded formation flying (a reference only) | `Pat's claude work/formation-track-logs/README.md` |
| Every tuning number and its source | `docs/modules/turn-sim/numbers.md` (`tools/turn-sim-numbers.mjs`); the tables are in `src/modules/turn-sim/live/wing-moves.js` |
| The code | `src/modules/turn-sim/live/wingman/`: `fighting-wing.js` (the technique, split into named parts), `separation.js` (the guard and the filter), `supervisor.js`, `perception.js`, `close-formation.js` |

## The checks (run in the background; the gauge is a measuring tool, not a test)

- **Gauge:** `node tools/formation-gauge.mjs` (the default set) and `node tools/formation-gauge.mjs --fw live --only b5-`, with traces in `tmp/gauge`. Copy the folder after each run.
- **Flying unchanged:**
  - `node "Pat's claude work/formation-review-12oct/gauge-trace-compare.mjs" <before> <after>`; show it catching a deliberate change first;
  - `node "Pat's claude work/formation-review-12oct/four-ship-probe.mjs" file:///C:/<repo>/` must give `2d5b5a8020839796` for both lines.
- **The control model:** `node tools/control-map/check.mjs --tag <tag>` on a tagged gauge run, and `node tools/control-map/draw.mjs --check` (no diff).
- **Build:** `npm run build`. No local tests: CI on the PR is the one check.

## How to work (the rules that bit this stretch)

- **Agents only when Patrick asks.** One at a time, checked before merge (git, not the agent's report), Opus for flight code. A long brief states its completion condition, the early stops to avoid, and a time budget.
- **Before talking to Patrick:** check every agent proposal against TS-233 and the headers of the files it touches. This stretch the review misread SMM Fig 12.20, and listed two estimates as rulings.
- **Talking to Patrick:**
  - plain words and pilot terms;
  - one question at a time, with his own idea as an option;
  - when he asks what you mean, explain the options and their effects before asking again;
  - record every ruling the same day in TS-233 and spec 7e, and changes in the plan and the waiting list.
- **Clean-up:** ask before deleting worktrees or branches. Four finished agent worktrees are waiting for his yes.
- **Usage:** the weekly limit was at 75% on 14 Oct, resetting 18 Oct 16:00Z. Part 1 cost about 1% of the weekly limit.
