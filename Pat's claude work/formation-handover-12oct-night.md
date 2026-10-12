# Formation handover, 12 Oct 2026 night (the architecture review session)

For the next Formation session, and for this thread after compaction. Read `AGENTS.md`, then `docs/modules/turn-sim/README.md`, then Step 12 of `docs/modules/turn-sim/plan.md`, then this.

## Where it stands

| What | Where |
|---|---|
| V2.419: the nose goes over the top of a loop without a jump (J1; the 3D view draws each aircraft from its own frame, `live/attitude.js` drawnAttitudeOf) | Merged, #1008; Patrick has flown it |
| TS-211: #2 reacts to what he sees (0.3 s close, 0.3-0.5 s fighting wing; caught up by the end of Lead's telegraph ease-in) | Decision merged, #1009; not built |
| V2.420: the HUD and the 3D camera bar each minimise on their own (a small – on each, a tab to bring it back; layout `camBar`, the HUD's is `tagHud`) | PR #1011, waiting for Patrick's merge |
| V2.421: fighting wing moves always fly the live law; the Tracker / Live setting is gone; TS-212 with Patrick's note (for now the 4-ship keeps the tracker turn buttons and the live moves as two separate sets) | PR #1012, waiting for Patrick's merge (after #1011; renumber if not) |
| Step 12 of the Formation plan (ratified 12 Oct late) and the waiting-list line | This docs PR |

GitHub blocks merges by the thread (a repository rule): Patrick merges.

## Working setup

- Worktree `Dads-debreif-physics` (this session). Patrick flies a local-only branch `local-test-flying` that combines #1011 and #1012, served on port 5174 (the Browser pane's launch file runs `npm --prefix <worktree> run dev -- --port 5174`). The graphics session uses 5173.
- Two thread artifacts hold the review: "Formation Sim architecture" (how a press becomes flight, every pilot's architecture, the station-keeping supervisor, what JSBSim taught, the plan) and "Formation rough spots" (55 rows, IDs used in Step 12).
- JSBSim is cloned for reading only, outside every repo, beside the worktrees in `_reference/jsbsim`. Nothing from it is built, run or copied (LGPL; ideas only, written from the maths).
- An Opus agent was analysing the fluid manoeuvring jerks (Step 12.3): whether Lead flies the loop as a rate to exit at 220 KIAS, the joins, and G onset for every player. Its report goes to Patrick before anything is built.

## Next

1. Step 12.1: the press-lurch cap (J2) and the smoothness gauge; Patrick agrees the gauge's press set.
2. Step 12.2: the pilot review with the gauge's numbers.
3. Step 12.3: fluid smoothing from the agent's plan, once Patrick rules the loop technique.

## Patrick's rulings this session (12 Oct 2026)

- Everything works as a 2-ship first, then the 4-ship.
- TS-211 words; reaction "almost immediately": start with 0.3 s close and 0.3-0.5 s fighting wing.
- Fluid manoeuvring stays as it is, except the loop and its joins: Lead flies a rate to exit at 220 KIAS, less G over the top and more at the bottom, smoothly into the wingover (SMM); all players use the G onset rules.
- Live fighting wing is fine: the only law (TS-212), with the 4-ship note above.
- One wingman frame, but close formation and fighting wing are separate techniques inside it ("I think/fly those quite differently").
- Each window (HUD, camera bar) minimises on its own with a small button on its top right.

## Unseen and untested

- Nothing was run locally as tests (CI is the check). The gauge does not exist yet; every "measured" number in the artifacts is a Node dry run.
- The 2D view with the minimise buttons was looked at once; narrow windows were not.
