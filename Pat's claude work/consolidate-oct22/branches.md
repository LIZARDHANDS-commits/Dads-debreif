# Leftover branches on GitHub (checked 22 Oct 2026, main at V2.533)

67 branches (besides this session's own) weren't merged into main by git's count. Squash merges hide what landed, so each was checked by content: does main hold the exact files the branch changed, and are any files it added missing from main? **Nothing is deleted until Patrick says yes** (rule book).

## 1. Safe to delete: everything already on main (20)

Main has the exact content of these, or their PR was merged today.

`claude/project-thread-mdygmj`, `claude/project-thread-1kd06j`, `claude/project-thread-mezwbl`, `claude/project-thread-1mmjkn`, `claude/project-thread-3qokmr`, `claude/formation-refactor-step5-pw5bn5`, `claude/project-thread-sqcqwp`, `claude/project-thread-sqzjww`, `claude/project-thread-wo7d7d`, `claude/c130j-model-plan`, `claude/debrief-16-ship-plan`, `claude/debrief-drop-plan`, `claude/ep-tabletop-phone`, `claude/run-in-sim-build`, `claude/t38a-model-plan`, `docs-ct156-landing-beam`, `claude/project-thread-7hg4qo`, `claude/traffic-ct157-pc21` (#1086), `claude/refuelling-direct-ip-tanker-holds` (#1088), `claude/mission-sets-figure-8-reversed` (#1087).

## 2. Holds work that never reached main: Patrick decides (8)

| Branch | What it holds | Suggestion |
|---|---|---|
| `claude/nav-planner-plan` (16 Oct) | A whole Nav Planner module written down: 24 doc files (README, plan, spec, decisions, requirements, future) not on main | Keep, until you decide whether Nav Planner is a module |
| `claude/launch-planner-idea` (16 Oct) | A Launch Planner idea: README and plan, not on main | Keep, or move its idea to `docs/FUTURE.md` and delete |
| `claude/project-thread-swv8zh` (12 Oct) | `Pat's claude work/performance-rebuild/handover.md`, not on main; ties to your protected open-source performance worktree | Keep with the performance redesign |
| `claude/fw-rejoin-settle-mid-cone` (12 Oct) | Formation: after a rejoin into fighting wing, #2 holds where he settled ("trial, not finished") | Delete if B5 replaced it |
| `claude/fw-rejoin-turn-in-earlier` (12 Oct) | Formation: turning in earlier on the rejoin | Delete if B5 replaced it |
| `claude/lead-telegraph-close-turns` (12 Oct) | Formation: Lead telegraphs close-formation turns with a slow eased roll (TS-209), V2.414 | Check TS-209 on main, then delete |
| `claude/plan-restore-cut-lines` (16 Oct) | `docs/PLAN.md`: puts back the waiting list and lines cut short in a CI-notes commit | Check PLAN.md, then delete |
| `claude/sof-mouse-airspace` (9 Oct) | Dad's ideas for you (a CT-156 cockpit for the sims' Cockpit view) in `docs/FUTURE.md` | Check FUTURE.md, then delete |

## 3. Old and probably superseded (38)

These branches change files that main has since changed again, so they can't be compared line for line. All are from 4–17 Oct and from threads whose work was merged in later PRs (Formation B3–B5, Debrief, EP Tabletop, CT-156 rounds, Traffic). None adds a file main lacks. Suggestion: delete after you skim the names.

`claude/project-thread-32k9ei`, `claude/project-thread-lyjg93`, `claude/project-thread-9rnekb`, `claude/reset-clean-up-pyvr4u`, `claude/project-thread-odre2r`, `claude/trim-tests-hppiti`, `claude/project-thread-keenrs`, `claude/project-thread-tfiwcw`, `claude/project-thread-t1b0jn`, `traffic-real-ground-river-valley`, `claude/formation-refactor-kb0dg3`, `claude/project-thread-e0qosw`, `claude/project-thread-ocb53k`, `claude/debrief-dad-commits-onto-main-7tck6d`, `claude/project-thread-oyowpz`, `claude/debrief-cockpit-gap-fill`, `claude/debrief-altitude-check`, `claude/ct156-blender-trial-cspd06`, `claude/debrief-model-sync`, `claude/formation-architecture-review-a291b8`, `claude/project-thread-oam9kk`, `formation-gauge-and-design-tools`, `formation-docs-plan-step-12`, `claude/fluid-live-wingman-bok3ef`, `formation-hide-camera-bar-and-hud`, `claude/fix-main-formation-tests`, `formation-fighting-wing-live-only`, `claude/project-thread-4wc0kr`, `claude/ep-tabletop-build`, `shared-3d-ct156-chunk9`, `shared-3d-ct156-round3`, `shared-3d-delivery-import`, `docs-ct156-5.2-records`, `docs-ct156-future-texture`, `shared-3d-phase5-5.1b-save`, `shared-3d-phase5-save`, `claude/combined-preview`, `shared-3d-phase5-look`.

## 4. Your computer's worktrees

This cloud session can't see them. In PowerShell, in your main `Dads-debreif` folder:

```powershell
git fetch origin --prune
git worktree list
git log --oneline --branches --not --remotes
```

The last line lists commits on your computer that aren't on GitHub, on any branch. Then for each worktree path (skip `Dads-debreif-open-source-perf`, which is protected):

```powershell
git -C "<path>" status --short --ignored
```

Lines starting `!!` are ignored files (a local `.env`, Blender outputs). `git worktree remove` deletes them without asking, so copy any you need first. If nothing prints that matters, the worktree can go: `git worktree remove "<path>"`. Paste me anything that does print.

(Corrected 22 Oct 2026: the first version used `@{u}..HEAD`, which fails on a branch never pushed, and didn't show ignored files.)

## 5. Branches with no pull request keeping their commits

Deleting one of these loses it for good, so each is tagged `archive/<name>` before any deletion: `claude/fw-rejoin-settle-mid-cone`, `claude/project-thread-swv8zh`, `claude/sof-mouse-airspace`, `claude/combined-preview`, `claude/c130j-model-plan`, `claude/debrief-16-ship-plan`, `claude/debrief-drop-plan`, `claude/ep-tabletop-phone`, `claude/run-in-sim-build`, `claude/t38a-model-plan`. The other 56 match a pull request's last commit and can be restored from GitHub.
