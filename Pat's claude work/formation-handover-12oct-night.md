# Formation handover, 12 Oct 2026 night (the architecture review session)

For the next Formation session, and for this thread after compaction. Read `AGENTS.md`, then `docs/modules/turn-sim/README.md`, then Step 12 of `docs/modules/turn-sim/plan.md`, then this.

## Where it stands

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
| `Dads-debreif-formation` | A clean checkout of `main`, read by agents and probes. Fast-forward it before reading. |
| `Dads-debreif` | The original checkout, detached at V2.238. Holds two uncommitted docs Patrick shelved: edits to `docs/references/open-source-performance-baseline.md` (its JSBSim/FlightGear values are unverified) and the untracked `docs/references/aero-performance-compliance-synthesis.md`, which discusses controlled manuals and must never be committed. Its leftover `.claude\worktrees\pull-d78c2a` folder is locked by a process; delete it once free. |
| `_reference\jsbsim` | JSBSim, shallow clone for reading only (LGPL; `aircraft/t6texan2` is an Aeromatic template, `aircraft/pc7`). Nothing built, run or copied. |

Also kept: the `wip-turn-sim` stash (from `fix-four-ship-offset-box`, 9 Oct) Patrick asked to drop; dropping it was refused by Claude's permission check, so it is still there for him to drop (`git stash drop` on that entry).

## Next

1. Merge #1014 and #1013 once green.
2. Step 12.1e: planning in a Web Worker, so a press never stalls the picture.
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
