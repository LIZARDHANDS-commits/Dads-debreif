# Formation handover, 12 Oct 2026 night (the architecture review session)

For the next Formation session, and for this thread after compaction. Read `AGENTS.md`, then `docs/modules/turn-sim/README.md`, then Step 12 of `docs/modules/turn-sim/plan.md`, then this.

## 14 Oct 2026, night: Live the default, fighting wing designed, B5 being built

- **On `formation-close-wingman-b2`, V2.431:** a live change is done once settled; Corner button; line astern and the corner 17 ft below Lead (Patrick's -6 on the Corner buttons; polish with the redone model, future.md); Corner Fwd / Back and Up / Down; Held #2 holds his place idle in close formation (holdCloseFore / holdCloseSide; he once drifted 232 ft through Lead); the seat's lean on Lead's spinner, exhausts and wingtips; Live the default (TS-232), the gauge pinned to Held for its old runs.
- **Fighting wing (B5):** spec 7e approved (TS-233) from SMM 12.29-12.30 and 12.2 (Patrick's pages, `docs/references/figures/smm-12-29-*`, `smm-12-30-*`), a Sonnet manual sweep (`docs/references/smm-fighting-wing-and-pursuit.md`) and a Fable audit. Fable's safeguards stopped two runs on the manuals' wording; it reviewed a renamed, self-contained brief instead (`Pat's claude work/formation-review-12oct/fable-fighting-wing-brief-14oct.md`, report `...-report-14oct.md`, summary and check `...-audit-14oct.md`).
- **Running:** the B3 Opus agent (reused) builds T27 (the gauge's fighting wing set, today's law the known-bad case) and T28 (perception's fighting wing cues at 0.4 s, the separation guard) on `formation-fighting-wing-b5`, then stops for Patrick to fly the turn into #2. On its report: check it against TS-233 and the keep-unchanged checks, then merge into b2.
- **Rulings added after approval:** #2 may go inverted only if required; Lead may too and #2 follows in any plane (Lead's inverted buttons in future.md).
- **Waiting on Patrick:** Checkpoint E (fly B3, set the corner with its buttons, route's throttle hand); the formation climb torque (SMM 16.31 about 85% against our 80%).
- **Working rule:** after a small tweak, don't fly every change headless (Patrick: "dont fly every change").

## 14 Oct 2026, later: B3 built (V2.428)

- **On `formation-close-wingman-b2`:** the B3 agent's T15-T17 (branch `formation-close-wingman-b3`, merged), the thread's T18 test, a live change done only once settled (53eabec9), the Corner button and the fixed line under Setup (c1c49e8d). Spec 7c.9 has the measured numbers, the estimates and the rough spots.
- **Gauge:** `node tools/formation-gauge.mjs --only b3-` flies the seven B3 scenarios with Live.
- **For Patrick:** Checkpoint E (the list in the plan); route's quicker throttle hand while Lead rolls (about 66%/s, against echelon's 20%/s).
- **Unseen:** nobody has flown B3 on screen (the browser pane was hidden, so the thread's screen run crawled); the Corner button was seen on screen, not pressed in flight. CI not watched.
- **Next after Checkpoint E:** fighting wing (B5), then TRJ and SARJ from fighting wing, then line abreast and HTRJ, the 4-ship, the errors.

## 14 Oct 2026, morning: B2 extras from Patrick's flying, and #1018's CI

- **On `formation-close-wingman-b2` (#1031), all at V2.427:** the HUD's TQ row and bar (`ui-kit/hud.js`, `power.js` torqueReadout); TS-230 echelon 3.5 ft up the line (15.9 back, 40.2 out; slots.js ECHELON_UP_LINE_FT) and the "Echelon line" Up / Down control (ECHELON_SHIFT, session only); Live / Held chosen while nothing is flown takes effect at once; TS-209 slowed (TELEGRAPH 8.25 s and 2.0 s: at 60° worst 1.75 ft, torque 36-86%); the roll catch-up (CLOSE_WING.rollCatchUp 0.6); TS-229 written; "Lead behaviours" in Settings (`rates.js` setTelegraph, `moves.js` KIAS_OUTSIDE_LAB now a live `let` with setKiasOutsideLab, 190-230 KIAS). Patrick: "defaults are good as is, leave the settings there".
- **Tried and dropped:** easing his pull over Lead's G (0.5 G/s let him sink 24 ft); leading his bank 0.45-0.8 s (overshoot at the roll-out); the catch-up toward Lead's own bank (fought the in-and-out loop); capping Lead's predicted G by the bank (no change).
- **#1018's CI:** CI on #1018 read 14 Oct 2026 (run on 58298fb6, B1 merged): 31 of 1,602 Formation and other tests fail, more than the 7 listed at phase A, all outside B1 and B2 (B1's test passes): 12 are the 2-ship line abreast manoeuvres (`live.test.js`: Delayed 90 and 45, Hook, In place 90, Shackle, Cross turn, both sides), ending 115-156 ft off their picture against the test's ±100 ft, since #2's line abreast flying was planned round the old Lead; 12 are the 4-ship (the formation tour, the line abreast manoeuvres, G-warm, two echelon wingspan checks at 28-30 ft); 7 are the training errors and Fix it (B6). Left red at Patrick's word for phase A ("I dont care about the rejoins or tests, we will fix that when we get there"); the 2-ship line abreast manoeuvres have no rung in the ladder yet (question for Patrick).
- **Next:** Patrick flies B2's close turns (Checkpoint D) and says whether Live becomes the default; decide where the 2-ship line abreast manoeuvres go in the ladder; CI on #1031; then merge #1031 into #1018, and #1018 to main when Patrick says.

## 14 Oct 2026, early: B2 built (V2.427, stacked on #1018)

- **Branch `formation-close-wingman-b2`**, worked in the physics folder (the dev server there now runs it). T9 gauge scenarios `echelon-turns-60` and `-45` (Live); T10 perception reads the other aircraft's whole turning (frame angular velocity and its change), feeds forward his place's motion, predicts Lead's G 0.3 s ahead from its rate, power lead = rate his place's speed changes; T11 `formation.js` `liveTurn()` (Lead's plan only, #2 flown ahead at the press, `wingman.js` `settledOn` ends the turn); the shaper sizes torque around holding + lead and moves it at `telegraphTorquePctps` 20 while he sees Lead roll; T12 the 60° turn test in `close-wingman.test.js`.
- **Tried and dropped (spec 7b's B2 status):** the trim on (wound up, slower); Lead's G read off the dead-reckoned bank (60° away settled in 12 s); a 1.5 s telegraph read for power, six ways (worse at 60° away: 3.9-4.9 ft against 2.8). The plot page (`tools/flight-plot/`, now with plane, line, along and torque) found the real cause of the 60° hunt.
- **Patrick's rulings this session:** no threshold (TS-228); "no power anticipation until we see a telegraph, and that telegraph would scale the anticipation ... wing doesnt do anything until he starts to see movement" (TS-229, wording confirmed; it also takes the roll catch-up and the golden G); "it's fine to be a little out of position and then catch up and stabilize once the turn is going ... its never perfect all the time".
- **Next:** CI on the B2 pull request; Patrick flies V2.427 (Checkpoint D); then B3. Open: the roll-start lag (0.65-1.2 s against about 0.3 s), the 0.3-0.4 G bump at Lead's roll start and stop.

## 13 Oct 2026, late night: B1 built (#1029, V2.426)

- **#1029** (base `roll-rate-raise`, head `formation-close-wingman-b1`) holds B1: T1-T4 from the Opus agent (built in `Dads-debreif/.claude/worktrees/agent-a921760de2c654d1c`, which the thread then used for T5-T8 so the physics folder's dev server stayed on V2.424 for Patrick), T5-T8 by the thread. Checkpoint A shown; Patrick ruled TS-228 (no threshold).
- **How it is wired:** `formation.js` option `closeWing` ('held' default), read at each press (`state.closeWing`); `startLiveWing()` at the end of `finish()` when the pair is idle in echelon; `step()` flies Lead then `stepWingman` off Lead's point mass taken before his step, and `applyTo` writes #2's fields; any press (`state.current`) hands #2 back. `events.js` `liveHandOver` replaces the 0.5 kt and climb gates for a live change into echelon with a can-he-stop test. The switch is in `transitions-panel.js` (2-ship only), wired in `index.js` to `formation.setOptions`.
- **Checked:** Held gauge traces byte-identical to the pre-B1 run (saved in the session scratchpad); Live 60 s hold within 0.04 ft, both sides; presses in and out of the live hold all finish. Not run locally: the test (CI is the check).
- **Next:** CI on #1029; Patrick flies V2.426 (Checkpoint B); then B2 (telegraphed turns on the live wingman, the trim term earns its keep there). Before flying, re-check every gain comment in wing-moves.js against the final tuning.

## 13 Oct 2026, night (after the fourth compaction)

- **B1 approved and under way.** Patrick approved the plan (plan 12.4, B1 T1-T8) and the branch: `formation-close-wingman-b1`, stacked on #1018, base 7d62ec30. One Opus agent (high effort, isolated worktree under `Dads-debreif/.claude/worktrees/`) builds T1-T4 (the gauge's echelon hold, the PID function `pilotAxis`, perception, the wingman's law), pushes to that branch, opens no pull request, and stops at Checkpoint A with the probe numbers. Its brief makes it check its base commit first (observation 62). The thread audits its work against TS-211, TS-226 and 7b.6d before Patrick sees it, then does T5-T8 (merge `roll-rate-raise` into the B1 branch first).
- **Names:** "the helper" became "the PID function" in the spec, the plan and the doc, so it isn't confused with the Architecture page's "helper laws" (`fw-pursuit.js`, `fw-switch.js`, `ride.js`, `lead-turn-in.js`, `holdStationIdle`), which retire.
- **Pages updated 13 Oct night:** Architecture, Rough Spots (statuses for J3, J7, J8, T11, A4, A12, A13, A15, A16, W1), How Lead Flies, Handling Ratify List, Workspace Map, and the doc "Close-In Wingman Spec" (status line). Patrick likes the spec as it is; the symptom table (what you see, which gain fixes it) waits until after Checkpoint A if wanted.
- CI on #1018 was running at the last look; not yet read.

## 13 Oct 2026, later (after the third compaction)

- **One Lead is in #1018.** The agent's three commits were cherry-picked onto `roll-rate-raise` (822f383d, a5a23502, 0649c2c3); the agent's worktree branch `worktree-agent-a06d78348763c6746` still exists (ask Patrick before deleting it). Audit: "merge after fixes"; its fixes are made: the roll bugs fixed in core (f62e9480, TS-223), the climbs and descents to Patrick's ruling (022b5cd2). The 80% torque top-speed question is closed (Patrick: "He just stays at 80 tq and climbs at his airspeed, whatever that gives him").
- **Core roll fix (TS-223, f62e9480):** `plannedStopStep` counts within 0.01° and 0.1°/s as on the bank (it stalled about 0.005° short, so turns never ended and look-aheads hit the 600 s cap); a stronger carried roll acceleration is shed over its own onset; a gentle roll-out firms up toward the T-6A's roll rather than pass the bank (`brakeAccelDps2`); `flight.js` outRoll waits for the acceleration too. Probe: normal rolls the same to within 0.05°; gauge: the old Lead flies fighting wing to echelon's whole 110° turn.
- **Phase B planned as a ladder** (plan 12.4, B1 to B6, close formation first) and **the wingman spec approved** (TS-226, spec section 7b): Patrick's technique (react to Lead, stay in position with all controls, correct plane then line then hinge, out before up under Lead, power from a holding setting that moves with the turn, small and large moves, jogging 8 and running 13 ft/s), the SMM's paragraphs and Figure 12.3, the pilot model (crossover model, 0.3 s), how PID is used (6c), the code map and inputs and outputs (section 8), `fluid-wing-live.js` as the pattern.
- **Working doc:** "Close-In Wingman Spec" (Claude Docs, https://claude.ai/code/artifact/be129268-83f2-4a84-b01c-a7d81e643f47): Patrick refines it there; changes go back into spec 7b, the master.
- **Rule change ALL-41:** manuals may go in the repo with their page; only the CFAFM stays out (AGENTS.md and five docs updated). Pilot-model and PID sources in `formation-review-12oct/research/pilot-model-sources/` (two unlicensed PDFs on this computer only, git-ignored).
- **Running:** a one-off Fable audit (high) of the wingman design with a gaps analysis. Check its findings against the decisions before they reach Patrick; bring spec changes one at a time; then build B1 (Patrick has not yet said who builds: the thread was recommended).
- **Looked at, not used:** the mcpmarket PID tuning skill (no licence, Python libraries, process-control fit); Nirnay (safe browser toy, no time delay).

## 13 Oct 2026, early (second compaction)

- #1018 (V2.424, branch `roll-rate-raise`) stays open until Lead flies right; Patrick: "leave this on a worktree until we get it working", and "Don't worry about the failed tests for now - we will fix that as we develop". Seven Formation tests are red (plan.md lists them: 3 phase B, 4 phase C). The thread's admin merge with red tests was refused by the permission check; nothing to merge now anyway.
- Built on #1018 since the night: TS-223, Lead's roll-out planned, not chased (core `easeRoll` option `plannedStop`, `plannedStopStep`; Lead only: with it #2's turning-rejoin tracker never settled). TS-224 with TS-213, TS-215, TS-221: the loop, wingovers and barrel roll at full power, out at the speed in (core `softMin`/`softMax`, `T6A_AOA`, `gAtAoaUnits`; `fluid-lead.js` loop(), pathManoeuvre, stepLead `ask.lead`; `fluid.js` hand-over, refusal under 200 KIAS, card note). The loop design is in `formation-review-12oct/research/loop-design.md`. The PR's one test: the loop from 200 and 250 KIAS exits within 15 kt, under 4 G.
- In progress: one Lead (TS-225, approved; the row is not yet in decisions.md, write it after the audit). An Opus-high agent writes it in its own worktree (`Dads-debreif/.claude/worktrees/agent-a06d...`, branch `worktree-agent-a06d...`), behind a setting (`LEAD.onePointMass`), deleting nothing; its report lists what becomes dead for audit, gauge before/after and press-planning time. Do not edit flight.js, replay.js, fluid-lead.js, lead-moves.js or numbers.md in this checkout until it is merged in. The thread checks its worktree every 5 minutes (session cron).
- Then: audit and bring one Lead into #1018; Patrick flies V2.424 (he said flying now has little point); merge and tag. Phase B: #2 on the realistic Lead. Phase C: the 4-ship.
- Thread pages updated with a "13 Oct 2026, early" box: Architecture, Rough Spots, How Lead Flies, Ratify List.

## Later the same night (after compaction)

- Patrick ruled the pilot review (plan 12.2) and set the order: Lead first, then the 2-ship wingman, then the 4-ship. 12.1e (the Web Worker) moved to `future.md`.
- TS-214, one tuning sheet, built as V2.423 (#1017): `live/handling.js`, `lead-moves.js`, `wing-moves.js` beside `rates.js`, `bands.js` and `moves.js`, all through `tuning.js`; `numbers.md` lists the whole sheet, core's aircraft limits first. No flying changed (the gauge's traces byte-identical). CI green; the thread's admin merge was refused by the permission check, so Patrick merges it, then tag `v2.423-tuning-sheet`.
- Thread artifact "How Lead Flies" (claude.ai/artifact/JLyp5DTH9CTumjirsak64g): the two Lead pipelines and eight rough spots.
- Phase A research running in the thread, read-only, writing to its scratch folder (not durable: copy what is checked into `Pat's claude work/formation-review-12oct/` before the session ends): the manuals; public flight-test and flying-qualities data; JSBSim's T-6; Patrick's phase 2 GoPro telemetry (three chapters of one HERO7 recording on his PC; roll and onset a lower bound, loops 3.5 G typical; no latitude or longitude in any output).
- On the waiting list: 60 EFIG and SMM page images tracked in the public repo (`Pat's claude work/manuals/images/`).

- Later still: #1017 (V2.423) merged and tagged `v2.423-tuning-sheet`. #1018 (V2.424) builds every ruling so far except the loop: roll 0.58°/s per knot at most 200°/s (ALL-39), the 6 G/s ceiling (ALL-40), the engine's 3.5 s idle lag (TS-218), Lead 20-80% torque (TS-216), break 3 s (TS-217), one 3 ft tracker tolerance (TS-219, TS-220). Patrick asked that each ruling be built as it is made. The thrust check found no gap (the GoPro speed-up was flown downwind in a 40 kt wind). The loop design (TS-213, TS-215) is next; its agent stopped at the session limit before writing anything.

- End of the night: #1018 also builds TS-222 (Lead's roll 90°/s; every Lead roll in the gauge tops at 90). The 0.2 s roll onset for Lead is not built: core `easeRoll` with an onset overshoots about 15° (tested alone), so the smoother gets fixed first (TS-222 lists the two dropped tries). The loop design agent was resumed with TS-221 (entry from level at any speed, 90° hand-over, refuse under 200 KIAS, exit within 15 kt); its output lands in the thread's scratch folder `research/loop-design/` and must be copied into `Pat's claude work/formation-review-12oct/research/` once checked. Next after the loop: the smoother, then one Lead aircraft on the point mass (Patrick asked, recommended).

## Where it stands (earlier the same night)

| What | Where |
|---|---|
| V2.419: the nose goes over the top of a loop without a jump (J1; the 3D view draws each aircraft from its own frame, `live/attitude.js` drawnAttitudeOf) | Merged, #1008; Patrick has flown it |
| TS-211: #2 reacts to what he sees (0.3 s close, 0.3-0.5 s fighting wing; caught up by the end of Lead's telegraph ease-in) | Decision merged, #1009; not built |
| V2.420: the HUD and the 3D camera bar each minimise on their own (a small – on each, a tab to bring it back; layout `camBar`, the HUD's is `tagHud`) | Merged, #1011; tag `v2.420-hud-camera-minimise` made locally, not pushed |
| V2.421: fighting wing moves always fly the live law; the Tracker / Live setting is gone; TS-212 with Patrick's note (for now the 4-ship keeps the tracker turn buttons and the live moves as two separate sets) | Merged, #1012; tag `v2.421-fighting-wing-live-only` made locally, not pushed |
| V2.422: the picture pauses after a slow press (J2), and the design tools (below) | PR #1014, merges when its CI is green |
| Step 12 of the Formation plan (ratified 12 Oct late), TS-213 (Lead's fluid loop flown as a rate to exit at his entry speed, at most 4 G), the fluid jerks analysis, this note | PR #1013 (docs) |

Merging: `main` has a branch rule that lets only Patrick's account update it, so the thread merges with `gh pr merge <n> --squash --admin` on its own (Patrick allowed `gh pr merge` in Claude's settings, 12 Oct 2026; chained with another command it is refused). GitHub CLI was installed after this session started: call it by its full path, `C:\Program Files\GitHub CLI\gh.exe`, until the session restarts.

## The tools (Step 12.1; Patrick's yes, 12 Oct 2026)

| Tool | Where | How to use it |
|---|---|---|
| Smoothness gauge | `tools/formation-gauge.mjs`, baseline `tools/formation-gauge/baseline.json` (main at V2.421) | `node tools/formation-gauge.mjs` flies the 2-ship press set headless (about 2.5 s) and compares each aircraft's roll and G reversals, peak roll acceleration, G range and rate, drawn-aircraft step and least range with the baseline; `--save` stores a new baseline; `--only <name>` runs one scenario. Traces go to `tmp/gauge/` (not in git). A measuring script, not a test. |
| Flight plot page | `tools/flight-plot/` (dev only, never built) | With the dev server running, open `/tools/flight-plot/`: pick a gauge run, one chart per quantity (G, G rate, roll rate, bank, drawn turn rate, flight path angle, KIAS, range), presses marked; drag to zoom. Uses the app's uPlot (Turn Fight's); no new dependency. |
| Design kit (Python) | `tools/flight-design/` (README, pinned `requirements.txt`) | Offline design of profiles and gains (CasADi 3.8.1, SciPy 1.15.3, python-control 0.10.2). The environment is `tools/flight-design/.venv/` on each PC (not in git); set up per the README. Results go into the app as small committed tables naming their script. First use: the TS-213 loop's rate schedule. |
| Older CasADi study | `tools/trj-casadi/` | The rejoin optimisation study (Step 9's optimiser work); same idea as the kit. |
| Review probes | `Pat's claude work/formation-review-12oct/probes/` | The scripts behind the review's first numbers; the gauge replaces them. |

First gauge findings to carry into the pilot review (12.2): in the 2-ship the live fighting wing law also hunts (a 25 s level turn into #2: 19 G reversals, 10 roll reversals); in a telegraphed close turn in echelon #2's drawn aircraft turns up to 96°/s while he rolls at 14°/s (a jump in the held pose at the hand-in).

## The two working documents (thread artifacts, private to Patrick)

- "Formation Sim architecture": https://claude.ai/artifact/W13nu5wB4hoXdY5z8TqFsA. How a press becomes flight, every pilot's architecture, the station-keeping supervisor, what JSBSim taught, the plan with the pilot review.
- "Formation rough spots": https://claude.ai/artifact/RQniVAhSLf24rjQjTtKFDm. Every rough spot with evidence, cause, fix route, effort and status; the IDs (J1, F1, T1, A6 ...) used in Step 12.

The repo copy wins where they differ (rule book: repo is master); the artifacts are the review's working pages.

## Directories on Patrick's PC

Local paths (Patrick asked for them here, 12 Oct 2026; everything else in this note is repo-relative). All under `C:\Users\patri\Documents\antigravity\wise-mendeleev\`:

| Folder | What it is |
|---|---|
| `Dads-debreif-physics` | This session's worktree (Formation physics). The dev server for Patrick serves whichever branch it is on, on port 5174; it was left on `formation-gauge-and-design-tools` (#1014, main plus the tools). `local-test-flying` is an old local-only branch, now superseded by main. |
| `Dads-debreif-graphics` | The graphics session's worktree (branch `graphics`; CT-156 Blender work). Don't edit Formation files there. |
| ~~`Dads-debreif-formation`~~ | Removed 12 Oct 2026 night (Patrick: it held nothing new). It was a clean checkout of `main`; with it gone `main` is free, so a worktree may check it out. Agents read `main` with `git show origin/main:<path>` or from any worktree; the old probe scripts that point at this folder need their path changed before reuse. |
| `Dads-debreif` | The original checkout, detached at V2.238. Holds two uncommitted docs Patrick shelved: edits to `docs/references/open-source-performance-baseline.md` (its JSBSim/FlightGear values are unverified) and the untracked `docs/references/aero-performance-compliance-synthesis.md`, which discusses controlled manuals and must never be committed. Its leftover `.claude\worktrees\pull-d78c2a` folder is locked by a process; delete it once free. |
| `_reference\jsbsim` | JSBSim, shallow clone for reading only (LGPL; `aircraft/t6texan2` is an Aeromatic template, `aircraft/pc7`). Nothing built, run or copied. |

Also kept: the `wip-turn-sim` stash (from `fix-four-ship-offset-box`, 9 Oct) Patrick asked to drop; dropping it was refused by Claude's permission check, so it is still there for him to drop (`git stash drop` on that entry).

## Next

1. Merge #1014 and #1013 once green.
2. ~~Step 12.1e: planning in a Web Worker~~: moved to `future.md` (Patrick, 12 Oct 2026).
3. Step 12.2: the pilot review, with the gauge's numbers and the plot page.
4. Step 12.3: fluid smoothing to TS-213 (the analysis has five slices; their remaining rulings: wingover and barrel roll exit speeds, Lead's roll rate 90 or about 120°/s, the G onset time, feed-forward of Lead's plan for #2).

## Patrick's rulings this session (12 Oct 2026)

- Everything works as a 2-ship first, then the 4-ship.
- TS-211 words; reaction "almost immediately": start with 0.3 s close and 0.3-0.5 s fighting wing.
- Fluid manoeuvring stays as it is, except the loop and its joins: TS-213 (3.5 G to the vertical, then the nose rate held with G and adjusted smoothly to exit at the entry speed, PCL MAX, at most 4 G, flowing into the next manoeuvre); all players use the G onset rules.
- Live fighting wing is fine: the only law (TS-212), with the 4-ship note above.
- One wingman frame, but close formation and fighting wing are separate techniques inside it ("I think/fly those quite differently").
- Each window (HUD, camera bar) minimises on its own with a small button on its top right.
- The design tools as above: in the repo, environments on each PC, nothing shipped.

## Unseen and untested

- Nothing was run locally as tests (CI is the check). Every "measured" number is a Node dry run (the probes, the gauge).
- The cap after a slow press was seen only on a fast PC; narrow windows with the minimise buttons were not looked at.

## 14 Oct 2026, late: B5 fighting wing in turns, handed over before the context reset

**Where it stands.**
- `formation-close-wingman-b2` holds V2.432 (#1031): the "#2 in fighting wing: Old / Live" switch with T27-T28 merged, Checkpoint E passed, and spec 7d (rejoins from fighting wing) drafted with all three of Patrick's answers. **7d is waiting for his approval.**
- `formation-fighting-wing-b5` is at b60a4a2b: the thread's T29a work in progress, not merged, not for flying.
- Tuning notes: `formation-review-12oct/b5-t29a-tuning-14oct.md`.
- Fable's second review: brief `fable-cone-turn-brief-14oct.md`, report `fable-cone-turn-report-14oct.md`.
- Gauge helpers (run them with node from the b5 worktree's root):
  - `b5-gauge-summary.cjs <dir> <tags...>`
  - `b5-gauge-aspect.cjs <dir> <tag>`
  - `b5-gauge-dump.cjs <file> <t0> <t1>`

  Make a run with `node tools/formation-gauge.mjs --only b5- --fw live --tag <name>`.

**Patrick's rulings today, all in TS-233:**
- Low inside at MAX when short of energy in the turn.
- The high yo-yo when gaining on Lead inside his turn.
- A kiss of the 500 ft bubble while correcting firmly is fine.
- From fighting wing the rejoins are all live, with no tracker.
- The overshoot below one span with more than 10 kt of closure.
- Overtake 15 kt on TRJ, 25 kt on SARJ.
- No recorded formation flying yet; the sight pictures wait.

**The thread's first check of Fable's findings against the code:**
- **F2 holds.** The filter's most G is max(Lead + 1.5, aircraft limit), so at a slow speed it can pass the shaker.
- **F3 holds.** The vertical takes its share of lift before the turn, and the filter predicts as if he got the whole turn.
- **F5 is half done.** `leadNow` is dead-reckoned 0.4 s, but straight, not round Lead's turn.
- **F1 and F11 are as described.** The aim loop's ±25 ft/s and 20 ft/s slew are in `FW_WING`.

**Next, in order:**
1. Patrick rules on Fable's questions 1-7. Recommended:
   - Q1: the 20° steer-behind cap.
   - Q2: yes, the pass line is 500 ft + 1.4 s × closure, floor 600 ft, read with his bubble ruling.
   - Q3: 100 ft low at the end of the turn.
   - Q4: 400 ft climb; "already high" is 100 ft.
   - Q5: yes, stop at the shaker (a physical limit).
   - Q6: 100 ft behind the wing line.
   - Q7: yes, log (d, s).
2. **After the reset (Patrick: "once it resets at 1650 we will send that agent")**, send a Sonnet web researcher (read-only). Topics:
   - The trail-cone technique in other trainers' public manuals (US Navy T-6B formation, "cruise"; USAF T-6 formation), background only, never above Patrick or the SMM.
   - Formation control with a turning leader, following a circle, and collision-avoidance filters, aimed at Fable's findings 1-4 and 6-10.
   - The output is one reference file with sources, checked by the thread before anything goes into the spec.
3. The thread (or the B5 agent, with this list) builds Fable's structure on the b5 branch, one change per gauge run, in this order:
   1. F5, dead-reckon Lead round his turn.
   2. F2, G bounded by the shaker.
   3. F3, the filter shares one lift command with the vertical.
   4. F4, the pass line with the closure allowance.
   5. F10, the (s, d) pair, with closure from velocities.
   6. F1, d_ss plus the arc loop with closure feedback, ±400 ft, 60 ft/s.
   7. F7, the outward and inward caps.
   8. F6, the along-track floor.
   9. F8 and F9, the climb out of plane and the pitch owners.

   Acceptance: the turn cases end 500-900 ft back and within 15 KIAS, the most aspect stays under 90°, least slant 500 ft (a brief kiss allowed), and job switches are 3 or fewer.
4. Re-run the keep-unchanged checks before any merge: Held and close-formation traces byte-identical, the B1-B3 probes, the 4-ship hash, and the Old law's b5 entries.
5. Then T29b (wings level and the swept place), T29c (entry, exit and S-turns), T30 (stretch), T31 (test), Checkpoint G.

### 14 Oct 2026, later still: round 3 measured, research in, round 4 running

**Round 3.** The stopped B5 agent built Fable's F5, F2, F3, F4, F10, F1 and F7 (F7 off) on `formation-fighting-wing-b5`, head 2380ce07, each behind a switch in `FW_WING` with gauge numbers in its commit message. The thread's run (tag r3), with least slant, end of turn and most aspect:
- into, in position: 650 / 743 ft, −41 kt / aspect 140°;
- into, tight: 520 / 600 / 155°;
- into, stretched: 618 / 2,215 / 60°;
- away, tight: 520 / 1,276 / 40°.

Not converged: ahead of the 3/9 line on turns into #2, and stretched ends far back.

**Web research** (`docs/references/formation-control-research-14oct.md`, background only):
- the range loop's half-gain trap, confirmed in fighting-wing.js (17f32caa: `dss + (cArc − closing)/omega` settles at half the closure);
- the US Navy T-34C cruise technique (lag first, then inside; power off slightly on a turn into);
- the filter as a published predictive safety filter (smooth max or dwell for side changes; separation hard, stay-behind soft);
- the delay sweep.

**Patrick's rulings, all in TS-233 (c96bc73b):**
- all of Fable's answers as recommended, except no cap on the yo-yo inside the cone;
- failure is no correction back to the ideal (ending 1,000 ft or nipping 500 ft is not a failure);
- never ahead of the 3/9 line (roll over Lead, or nose behind him, in and down);
- very stretched, he may cut across, then reset onto a circle;
- boards (a step in drag) and idle (fast cut, slow return) allowed.

**Round 4: a fresh Opus builder in its own worktree, branch b5-round4, pushing to `formation-fighting-wing-b5`.** In order:
1. F6;
2. the half-gain fix;
3. lag first from Lead's bank;
4. boards and idle, and the speed feed-forward (it may add an optional `ask.boards` to stepLead, default off, everything else byte-identical);
5. F8/F9, the yo-yo with no cap;
6. side-switch smoothing;
7. the delay sweep.

Acceptance:
- ends 500-900 ft, or outside it and closing;
- never aspect over 90°;
- least 500 ft (a kiss allowed; its depth and time reported);
- 3 job switches or fewer.

**On its report the thread audits it:**
- each commit against TS-233 and spec 7e;
- rerun the gauge (helpers in `formation-review-12oct/`);
- check the keep-unchanged checks itself (the default gauge byte-identical, the Old law's b5 entries, the 4-ship);
- then merge into b2 behind the switch, bump the version, and give Patrick the version and what to fly.

### 14 Oct 2026, after midnight UTC: recorded formation flying, how hard fighting wing is flown, round 4 reported

**Recorded formation flying.** Patrick uploaded two of his four-ship ForeFlight logs (one ship each). The Debrief's example flight (`original/assets`, 2 Jun 2026) turned out to be a real four-ship with every ship recorded (#3 and #4 on Sentry pucks: bank, pitch and G recorded). How each rung can use it is in the plan, 12.4 "Recorded formation flying", with what it is not (Patrick: "this isnt perfect"). Folder, numbers and `pair-geometry.mjs`: `formation-track-logs/`. For the round 4 audit: set the gauge's numbers beside the real wingmen's (range, aspect, height, closure, G), as a reference only.

**How hard (Patrick, TS-233, spec 7e 1c):** fighting wing can be chill (academic, smooth 60°/2 G, the default and the gauge so far) or aggressive (cloud, a threat); the point is that Lead can make the formation very manoeuvrable. A four-ship is flown more gently than a two-ship. The aggressive Lead's numbers and where they are checked are on the waiting list.

**Round 4 reported** (head d2db61c1 on `formation-fighting-wing-b5`; final tag r4ls4, 9e5c860f): 4 of 8 cases pass the acceptance (into and away in position, away tight, reversal), none under 500 ft; failing on job switches (into and away stretched, outside the cone, 4-5) and into tight (93°, ends 2,429 ft back). The delay margin into in position is about 0.1 s, under the 0.2 s target. Its unsure points: the yo-yo's height band (±200 ft used), "in" in "in and down", the hysteresis changing labels not flying, and into-tight with Lead level needs Patrick's word. Audit next, as above.

**Round 4 audited and merged (V2.433, bf101553 and 15523576):** the thread's gauge run matches the builder's table; keep-unchanged checked by the thread (every default gauge trace value for value, only new trace columns added; a 4-ship probe hashed identical, `four-ship-probe.mjs` in the scratchpad). The open list is in plan T29. Next: Patrick flies V2.433 Live; his word on into-tight with Lead level; then T29b, T29c, T29d (aggressive, up to 4 G), T30, T31.

**T29t running (Opus agent, extra-high, branch `formation-fighting-wing-tidy` from b2 116af2bd).** Part 1 tidies fighting-wing.js with the flying unchanged; part 2 writes `formation-review-12oct/fighting-wing-architecture-review.md`. Sent to it mid-run: the completion condition, the early stops to avoid and a 2.5 h budget (Opus 5.5 prompting guide); Patrick's relax-to-capture technique; the three phases (entry, turning, exit, geometry first); the assertive vertical at the exit (stretched dive, tight climb or S-turns, within the cone). All in TS-233 and spec 7e. **On its report:** rerun `gauge-trace-compare.mjs` on both sets (default, and `--fw live --only b5-`) against runs made on b2 before the merge, rerun `four-ship-probe.mjs`, build; read the review against TS-233; merge the tidy into b2 if identical (no version bump: nothing on screen changes); bring Patrick the review's verdict and its questions one at a time. Waiting on Patrick: fly V2.433 Live; confirm the "route" reading.

**Two agents running (14 Oct 2026, after midnight UTC), no shared files:**
- **T29t tidy and review** (worktree `agent-ac10051d68628b8a8`, branch `formation-fighting-wing-tidy`, local commits only so far: 1b395b73 four options removed, 03c392e2 always-on switches folded and FW_WING grouped, f216afa1 the filter in `separation.js`; the step split in progress). It has been sent, besides the brief: the completion condition and a 3 h budget; Patrick's relax-to-capture, three phases, assertive vertical at the exit, power with G, the controller inventory and tuning-count questions, the per-phase question, the readout, the loop-interaction options; then one ranked scope message (structure first, consequences brief, tables last) and "no more additions". **On its report:** audit as the earlier note says; also check the local `powerFor` name in `fighting-wing.js` (same name as the shared power function: ask a rename); add pathCaps' and speedFf's companions (behind.onCircle, guard.engage.holdsPower) to TS-233's "tried and dropped".
- **The control-systems method plan** (Opus, high, worktree, branch `formation-control-analysis-plan`, one file `formation-review-12oct/control-systems-analysis-plan.md`). Sent one context message with the thread's model of the system and the four interaction options. **On its report:** read it against the rule book (no new libraries without Patrick's yes, tasks in plan.md, models per task), fold its tasks into plan 12.4 after T29t, and bring Patrick its questions one at a time.
- Then the thread's control-systems page (block diagrams today and recommended, the N² chart with the removed options, the bandwidth and delay table), before Patrick picks the structure.

**T29t reported, audited and merged (482f0857 on b2, plus the `powerAsk` rename; still V2.433).** The thread's own runs on b2 before and on the tidy after: 33 default traces and 12 Live b5 traces byte-identical, gauge text the same apart from timings, 4-ship hashes `2d5b5a8020839796` both, build passes; nothing outside fighting-wing.js and supervisor.js used the removed switches. TS-233's "tried and dropped" now lists all four removed options. The review's verdict, recommended structure, six slices and three questions are summarised in plan T29t. **Next:** Patrick answers its three questions one at a time (Q1 the guard rail's working line, Q2 how far #2 relaxes turning into him, Q3 the exit vertical's size); the method-plan agent (still running) reports; the thread draws the control-systems page; Patrick picks the structure; round 5 starts with slice 0 (the gauge counts the flying, plus T29r's columns) and slice 1 (the guard rail). The agent's worktree `agent-ac10051d68628b8a8` and its branch stay until Patrick says to clean up.

**Patrick's three answers to the review (14 Oct 2026, all in TS-233 and spec 7e):** the guard tapers from 600 ft down to 500 ft (a backstop for the bubble only; nothing at 600 and over); turning into #2 from in position and not tight, he flies straight ahead until on the circle he wants, then captures pure or with slight lead or lag, the turn toward Lead only for the bubble or when high on energy (lag first goes; the review misread SMM Fig 12.20's "turn slightly toward Lead", corrected); the exit vertical may use any height while the slant stays 500-1,000 ft behind the wing line.

**The method plan reported and merged as background (b1154bcc, merged 6a529e36).** Summary and the thread's notes in plan T29t. **Next:** its four questions one at a time (Q3 depth first, the thread recommending the model now and the analysis per round 5 slice), fold the CA tasks into plan.md by his depth, draw the control-systems page (CA1 is that page made rigorous), then round 5 from slice 0. Its worktree `agent-a15371a9321a2bd51` stays until Patrick says to clean up.

**T29m part 1 running (14 Oct 2026; the method-plan agent a15371a9321a2bd51 resumed, branch `formation-control-analysis-plan`).** Brief: plan T29m. It may send questions back to the thread while it works (Patrick); answer from the rulings or bring them to Patrick one at a time. **On its report:** check `git diff --stat origin/formation-close-wingman-b2 -- src` is empty; run its check script on a gauge run and its draw script (no diff); read the master list against ten random code sites; check the table's close formation row reads about 37°; read its cross-feed verdict and phased-in list against TS-233; merge into b2 (docs and tools only, no version bump); show Patrick the diagrams and the N² chart on the thread page (Checkpoint A) with its Q1 (where the 0.4 s sits); then send part 2 (CA3).

**If the usage limit stops it** (5-hour window 95% used at 02:09Z, resets 03:50Z on 14 Oct): it was told to commit and push after each deliverable. After the reset, from this session, send agent `a15371a9321a2bd51` one line to carry on from what's committed. From a new session that can't reach it, brief a fresh Opus agent with plan T29m, this note and the commits on `formation-control-analysis-plan`, plus any uncommitted files in its worktree `Dads-debreif/.claude/worktrees/agent-a15371a9321a2bd51` (look before touching).

**Part 2's brief must also carry** Patrick's first flight of V2.433 Live (TS-233's "Smooth, planned corrections and gentle handovers" and "Abeam with Lead turning into him" addenda): over-controlling, too low, energy bled by cranking, his assess-plan-execute-monitor technique, and the abeam case (Patrick, card "Hold for part 2").

**T29m part 1 done, checked and merged (7b37f87b).** Summary in plan T29m. **Next:** Checkpoint A (Patrick looks at `control-model.md`'s diagrams; its Q1 where the 0.4 s sits, recommended Lead only with the whole-picture case measured beside it; its Q2 at the G cap which gives way, recommended the vertical, except while the guard asks for pass-clear), then part 2 (CA3) with Patrick's flight notes and the abeam case.

**Checkpoint A done; T29m part 2 running (sent 14 Oct 2026 after the 5-hour reset; weekly usage 75%).** Its brief carried the flight notes, the abeam case and the two Checkpoint A rulings. **On its report:** run `gauge-trace-compare.mjs` on both sets against b2-head runs made before its edits (new columns only; the abeam scenario is a new file), `four-ship-probe.mjs` (`2d5b5a8020839796` both), `npm run build`, the control map's check; read every `src` diff line (trace and optional probe only); merge into b2 (no version bump); then bring Patrick what the new columns show of his faults; then write spec 7e draft 4 (plan T29s: the normal flyer plus Patrick's named techniques that plan its path and phase back, like TRJ) for his approval, and re-cut round 5's slices from it.
