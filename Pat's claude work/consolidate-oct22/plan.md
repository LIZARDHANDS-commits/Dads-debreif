# Plan: consolidate branches, bring main up to date and publish (22 Oct 2026)

Patrick's ask (22 Oct 2026): "consolidate all of the worktrees and get main up to date so we can publish the webpage, including deconflicting and merging the pull requests and sorting out the update fail and codeql failed."

## What was found (22 Oct 2026, main at b4c6c0a, V2.524)

- **Live-site update failed** on the 19 Oct merge (#1085): the build passed, but uploading the built site failed with "Artifact storage quota has been hit" (GitHub's storage for files kept by workflow runs is full; it is recalculated every 6–12 hours). The site still shows the 18 Oct version (#1084). #1085 was docs only, so nothing visible is missing yet.
- **CodeQL (the weekly security scan) failed** on 19 Oct after the scan itself finished: sending the results back was refused ("Resource not accessible by integration" on reading the workflow run). In a private repo the scan job needs the `actions: read` permission, which `.github/workflows/codeql.yml` doesn't give it.
- **Open pull requests:**
  - #1087, Dad: the figure 8 is flown the other way round (RS-11, RS-30, RS-31). Merges cleanly.
  - #1088, Dad: on the refuelling run, the receiver turns direct to the IP and the tanker holds at the ARCP (RS-19, RS-16, RS-21). Conflicts with #1087 in two README files only (both added a line in the same place); no code conflict.
  - #1086, Dad: CT-157 Siskin II (PC-21) in Traffic, with its own performance set and Blender model. Merges cleanly. Marked "proposed, ahead of Patrick's yes": it adds a new aircraft and new flight numbers.
  - #1089, Dependabot (the automatic dependency updater): minor version bumps of two test tools (`@playwright/test` 1.64.0 → 1.64.1, `@axe-core/playwright` 4.13.0 → 4.14.0). Merges cleanly; doesn't change the site.
- **Worktrees and branches:** this cloud session has one checkout and can't see the worktrees on Patrick's computer. GitHub has about 60 branches not merged into main. Most are leftovers whose work reached main by squash merge; some may hold work that never landed. `claude/project-thread-7hg4qo` is the pre-squash copy of #1085 (already on main). The protected `wip/open-source-performance-redesign` worktree stays untouched (rule book).

## Tasks

### Task 1: Fix CodeQL's permission (XS)
Add `actions: read` to the `analyze` job's permissions in `.github/workflows/codeql.yml`.
- Acceptance: a hand run of CodeQL (Actions > CodeQL > Run workflow) finishes green.
- Files: `.github/workflows/codeql.yml`.
- Dependencies: none.

### Task 2: Get the live-site update working (S)
Run "Deploy to GitHub Pages" again by hand. Three days have passed, so the storage count has likely been recalculated. If it still hits the quota: shorten how long CI keeps its browser-test report (`retention-days` 14 → 3 in `ci.yml`), and Patrick deletes old artifacts or raises the Actions storage limit in GitHub billing settings (a setting only he can change).
- Acceptance: the Pages run is green and the live site shows main's version label after a hard refresh.
- Files: possibly `.github/workflows/ci.yml`.
- Dependencies: none. Run it again after the merges in Task 4.

### Checkpoint A: Tasks 1–2
- [ ] CodeQL and Pages both green on main.

### Task 3: Deconflict Dad's two Run-in Simulator PRs (S)
Merge #1087 first, then bring main into #1088's branch with a merge commit (no rebase: it's Dad's branch). Resolve the two README conflicts by keeping both sides' lines (each PR's "what is next" item and each one's `pass.js`/`refuel.js` description). Check that `setup-panel.js` and `defaults.js`, which both PRs change, still build together.
- Acceptance: #1088 shows as mergeable; `npm run build` passes on the merged result; the run-in unit tests (`tests/unit/run-in-sim/`) pass.
- Files: `docs/modules/run-in-sim/README.md`, `src/modules/run-in-sim/README.md`.
- Dependencies: #1087 merged.

### Task 4: Merge the PRs (S)
In this order: #1089 (test tools), #1087, #1088, then #1086 (Patrick, 22 Oct 2026: "Merge it too"; its numbers stay marked as estimates for his later review). Each merge is titled with the version and module first, as the rule book says, and gets its tag.
- Acceptance: each PR merged; main builds; Pages publishes (Task 2); the version label on the live site moves on.
- Dependencies: Tasks 2 and 3.

### Checkpoint B: Tasks 3–4
- [ ] Main green and published; Patrick or Dad opens the Run-in Simulator's refuelling run and the figure 8 from the default start.

### Task 5: Sort the leftover branches (M, read-only, then a list for Patrick)
For each of the ~60 unmerged branches on GitHub, check whether its changes are already on main (by content, since squash merges hide this from git). Sort them into "already on main, safe to delete" and "holds work not on main", and give Patrick the list. Delete branches only after his yes (rule book: deleting a branch needs his say).
- Acceptance: a list in this folder; nothing deleted without his yes.
- Dependencies: Task 4.

### Task 6: Patrick's computer (him, with commands from me)
Hand Patrick a short set of commands for his own computer: list his worktrees, and for each one, show whether it has work that isn't committed or isn't on GitHub. The protected `Dads-debreif-open-source-perf` worktree is left alone.
- Acceptance: Patrick knows which local worktrees can go.
- Dependencies: Task 5.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Storage quota still full | Site can't publish | Shorter report retention; Patrick clears artifacts or raises the limit |
| #1087 + #1088 build but fly wrong together (both change the Run-in setup) | Medium | Build and run-in unit tests on the merged result; look at both in the app at Checkpoint B |
| CI is off, so nothing checks the merges automatically | Medium | Build and the affected unit tests run here before each merge |
| A "leftover" branch holds unmerged work | Lost work | Content check, not git ancestry; delete only on Patrick's yes |

## Answered

1. #1086 (CT-157 Siskin II in Traffic), built ahead of Patrick's yes: merge it with the rest (Patrick, 22 Oct 2026, "Merge it too").
