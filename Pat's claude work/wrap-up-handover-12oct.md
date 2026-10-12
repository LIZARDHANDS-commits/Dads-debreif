# Wrap-up handover, 12 Oct 2026

Where the whole tool stands at the end of the 12 Oct run, for whoever picks it up next (a new Claude thread, Antigravity, Patrick or Dad). It is background, not instructions: `AGENTS.md`, then `docs/PLAN.md`, then each module's folder still win.

## Main

- **Version on main:** V2.388 (`3c1fa1e1`, #965). One version number for the whole tool, the one on the home screen.
- **Site:** https://lizardhands-commits.github.io/Dads-debreif/. Patrick runs "Deploy to GitHub Pages" himself after a flyable merge.
- **CI:** the one check. Two failures kept main red during the run: the SOF button walk (fixed by #958) and a Formation hand-over smoothness unit test from V2.381 to V2.386 (fixed by #961). V2.387's final head merged before its CI finished, so main's own run on V2.387 is the check. The type check's three.js loader warnings are warning-only (Patrick, 10 Oct).

## What merged, V2.380 to V2.388 (11 to 12 Oct)

| Version | Module | What changed |
|---|---|---|
| V2.380 | Traffic | The runway sits at the field's 1,892 ft (#949). |
| V2.381 | Formation | #2 rolls into the fighting wing cone 0.2 s sooner and ends inside it (#948). |
| V2.382 | Fluid | Live #2 waits for the loop, opens out from a tight entry, no stutter at the vertical (#950, TS-198). |
| V2.383 | Traffic | The straight-in's 3° descent point has no limit and moves with temperature (#953, TR-150). |
| V2.384 | Fluid | The live wingman is the only #2 and swaps sides on his own call; the Planned wingman is retired (#955, TS-199; leftovers out in #957). |
| V2.385 | Fluid | #2 eases with Lead at the Terminate press, no full-rate roll (#959). |
| V2.386 | Fluid | In a turn away #2 keeps the route position as height in the cone (#962, TS-200). |
| V2.387 | Formation | Hand-overs turn at the bank flown and end on Lead's speed; the 4-ship opening out keeps its climb (#961). |
| V2.388 | CT-156 model | Cockpit, canopy bow, seats and pilots match Patrick's photos: Patrick's 19-row fix list, built in seven stages with every stage's renders seen by him (#965). |

No-version merges in the same run: the import rule in `AGENTS.md` (#952), Playwright 1.64.0 and Vite 8.3.3 (#956), the SOF button-walk fix (#958), the docs for TS-198 and TS-200 (#951, #964), the hand-over estimates on the Turn Sim future list (#966), the Traffic audit handover (#967), and the plan catch-ups (#954, #960, #963).

## Open pull requests

- **#946, EP Tabletop step 2, the instructor's phone link** (Dad's). Patrick merges Dad's pull requests himself. It asks Patrick three things: the new storage library, the wording of EP-8 to EP-10, and EP-Q4.
- **#934, EP Tabletop step 1** (Dad's). Its work looks to have landed on main as V2.369 (#935); left open for Patrick to decide.
- **#829, Formation refactor step 5** (11 Oct, straight rejoin rides Lead's six). Never merged and now well behind main; left open for Patrick to decide.

## Kept off main

- **Performance rebuild:** branch `claude/project-thread-swv8zh`, its own handover at `Pat's claude work/performance-rebuild/handover.md` on that branch. Patrick (12 Oct): it stays on its own branch until it has been fully developed and compared with what is on main.
- **Patrick's local work:** branch `traffic-next` on his PC; "merge the work from my other session" means a cloud thread opens a pull request from it and merges it.

## What is open in each module

Every module keeps its ideas and rough spots in its own `future.md`. Counts are list lines on 12 Oct.

| Module | Open list | Lines |
|---|---|---|
| Whole tool | [docs/FUTURE.md](../docs/FUTURE.md) | 23 |
| Traffic | [traffic/future.md](../docs/modules/traffic/future.md) | 52 |
| Formation (turn-sim) | [turn-sim/future.md](../docs/modules/turn-sim/future.md), with "Rough spots left for later" | 83 |
| Fight Sim (turn-fight) | [turn-fight/future.md](../docs/modules/turn-fight/future.md) | 8 |
| SOF (Dad) | [sof/future.md](../docs/modules/sof/future.md) | 33 |
| Debrief (Dad) | [debrief/future.md](../docs/modules/debrief/future.md) | 31 |
| EP Tabletop (Dad) | [ep-tabletop/future.md](../docs/modules/ep-tabletop/future.md) | 5 |
| Shared (core, 3D, ui-kit) | [shared/future.md](../docs/modules/shared/future.md) | 6 |

## Notes from each module

**Traffic and core.** Every refactor step and flying change up to V2.383 was audited before merge and passed; V2.384 to V2.387 touched no Traffic, core or ui-kit flying file. Read [AUDIT_HANDOVER_V2.387.md](../docs/modules/traffic/AUDIT_HANDOVER_V2.387.md) (#967): every audit verdict, the trace baseline `traffic-main-9aa2f041`, how Traffic pull requests are checked, and three rough spots (a join's climb has no excess-thrust cap, the window height is written in five places, the PFL circle radius is fixed in the code).

**Performance rebuild.** Branch `claude/project-thread-swv8zh`, handover `Pat's claude work/performance-rebuild/handover.md` on that branch. It is off main by Patrick's order and already takes in V2.387. Its handover lists the module fixes for their owners and the open questions for Patrick; read it there rather than here. Today's ruling: idle propeller drag is full up to 220 KIAS and gone by 250.

**Formation.** V2.387 (#961) merged on Patrick's word without a second Fable review. The hand-overs (line abreast to echelon, echelon to line abreast, fighting wing to route) re-fly roll lags of 1 s or less at the bank flown; longer roll-ins, such as #4's 5.65 s in the echelon hook, still fly the planned path. The two timings are estimates (`ROLLED_MAX_SEC` 1 s, `ROLLED_BLEND_SEC` 6 s), and the item stays on the Turn Sim future list until Patrick flies it (#966). Unseen: the 3D view and Patrick's flying. The Formation branch has no open work.

**Fluid (live wingman).** Finished (Patrick, 12 Oct 07:06Z), all on main: v9 at V2.382 (#950, TS-198), the Planned wingman retired and the swap at the inverted top at V2.384 (#955, TS-199), Terminate eased at V2.385 (#959, TS-201), height in the cone at V2.386 (#962, TS-200, docs #964). TS-201 (the eased Terminate) is written up (#968, Patrick's yes 07:27Z); the next free Turn Sim row is TS-202. The open rough spots are in the "Live fluid #2 after v9" bullet of [turn-sim/future.md](../docs/modules/turn-sim/future.md). Patrick hasn't flown V2.382 to V2.386.

## Tags to push

GitHub's newest tag is `v2.215-debrief-puck-cockpit`, so the 160 versions since (V2.216 to V2.388) have no tag there. [tags-to-push.md](tags-to-push.md) has the one command if you made the tags on your PC, and the full list to paste if you didn't.

**CT-156 model and cockpit.** V2.388 (#965) changed the shape tables in `src/ui-kit/ct156-cockpit.js` and `ct156-model.js`, moved the pilots to `ct156-pilot.js`, and rebuilt the Blender files (`tools/blender/README.md`). Sizes are estimates off Patrick's photos and rulings, marked in the code. The rear eye is 6.4 in lower, putting the front headbox top on the horizon as Patrick picked. Unseen: the app in a browser after deploy. The open 3D items are in [shared/future.md](../docs/modules/shared/future.md).

## Open rulings

The one waiting list is the end of [docs/PLAN.md](../docs/PLAN.md), "Waiting on Patrick". The ones at the top of it:

- Fly Formation at V2.388 and ratify TS-76 to TS-85; say what still looks wrong in fluid manoeuvring.
- See Traffic and the PFL on screen at V2.388.
- The CT-156 cockpit sizes and three questions (TS-154 to TS-156).
- Dad's items: EP-Q1 (phone link), DB-31 (wheel height), and the SOF items he decides.

## How threads work (the rules that held this run)

- **One writer per file, one module at a time.** Reviewers read and report; they never edit.
- **Versions:** every flyable merge takes the next free version, read from main right before merging, never booked ahead. The title leads with the version and module; every version gets a lower-case tag such as `v2.387-handover-bank-speed`. Docs-only and test-only merges take no version.
- **Formation and fluid review flow:** the thread hands its pull request and head to the coordinator; a builder makes a review copy; Fable reviews it and gives a verdict; the thread merges at the next free version; the builder checks the merged copy matches. For Fable's own pull requests, the fluid thread flies the copy as the independent check.
- **No idle on long runs:** run long checks in the background in their own worktree and keep working. Compare against the stored baseline instead of re-running main's traces.
- **Wording first:** anything Patrick approves (rule book, spec, decision rows) goes to him as the exact words before it is written.
- **Public repo:** manual text and pictures never go in it; cite pages only. Checklists, boldface and performance charts are never shipped.
- **Docs keeper:** one thread keeps `docs/PLAN.md` and the whole-tool docs current after each merge. The next free whole-tool decision row is ALL-37; the next Formation row is TS-202.
