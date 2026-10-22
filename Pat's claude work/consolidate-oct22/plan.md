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

## Status (22 Oct 2026, evening)

- [x] Task 1: CodeQL fixed (V2.528, #1090); the hand run passes.
- [x] Task 2: the publish works again. The cause was the private repo's monthly Actions storage allowance, used up by 120–190 publishes a day on 4–6 and 11 Oct (about 60 MB each). Patrick made the repo public again (22 Oct), which lifts the limit.
- [x] Task 3: #1087 and #1088 deconflicted (two README files, both sides kept).
- [x] Task 4: all merged: #1089 (V2.529), #1087 (V2.531), #1088 (V2.532), #1086 (V2.533). Also the i-have-adhd skill (V2.530, #1091). Checked on a copy of main with all four PRs: the build passes and they add no unit-test failures. Main already fails 32 Formation unit tests (Turn at normal reference, fix tools, 4-ship tours, line-abreast turns); that's separate work, not from these PRs.
- [x] Task 5: branch report in [branches.md](branches.md). Nothing deleted; waiting on Patrick.
- [ ] Task 6: Patrick runs the worktree commands in [branches.md](branches.md) on his computer.
- [ ] Task 7: a budgeted publishing setup before going private again (below).
- [x] Six Formation unit test files parked until the redesign (V2.535, #1093, TS-237).
- [ ] Version tags: 13 versions have none on GitHub (V2.515, 516, 522, 523, 524, 528–535). This cloud session's proxy refuses tag pushes (403); Patrick pushes them (commands below).

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

## Order and risks (checked 22 Oct 2026, after Task 5)

Order matters; each step protects the next.

1. **Version tags first** (Patrick, about 5 min). Low risk. Before Task 7: if publishing ever runs on tags, tags made after that would each publish. Commits: V2.515 `ee33c10f`, V2.516 `a40a7f56`, V2.522 `7f074106`, V2.523 `d9e5b473`, V2.524 `ed2b3a1b`, V2.528 `26d82b2c`, V2.529 `02e704f2`, V2.530 `da71fa08`, V2.531 `b0609039`, V2.532 `085b01b9`, V2.533 `5dd82c7a`, V2.534 `f46ace11`, V2.535 `b03636b3`. Then `git push origin --tags`.
2. **Worktree check** (Patrick, about 5 min), before any deletion: a worktree may sit on a branch marked for deletion with commits never pushed. Use the corrected commands in `branches.md` section 4: the first version's `@{u}` check fails on a branch never pushed, and `git worktree remove` deletes ignored files (local `.env`, Blender outputs) without asking.
3. **Back up, then delete branches** (after Patrick's yes). 56 of the 66 leftover branches match a pull request's last commit, which GitHub keeps, so they can be restored. 10 don't, and deleting one loses it for good: `fw-rejoin-settle-mid-cone`, `project-thread-swv8zh`, `sof-mouse-airspace`, `combined-preview`, plus `c130j-model-plan`, `debrief-16-ship-plan`, `debrief-drop-plan`, `ep-tabletop-phone`, `run-in-sim-build` and `t38a-model-plan` (those six already on main). Tag those 10 `archive/<name>` first. Then the 20 on main, then the 8 with unlanded work one at a time (Nav Planner first), then the 38 probably replaced after Patrick skims them. Tell Dad in the bulletin, since his sessions may still have some checked out.
4. **Budgeted publishing (Task 7).** Design around: write access (keep the job that installs npm packages unable to write to the repo); repo bloat (the `gh-pages` branch keeps only the latest build, replaced each time; about 60 MB a build, repo already 280 MB); Actions minutes when private (Pro includes 3,000 a month; CI on hand runs only); CodeQL needs a paid add-on when private (weekly run off then); the site lags main by design (the bulletin's "live on main" wording changes).
5. **Private again** only after one successful publish the new way. Keep the public window short: anyone can download a copy while public. At 22 Oct: no forks, no keys or passwords found in the code.

### Task 7: Budgeted publishing, then private again (M)
Patrick (22 Oct 2026): "once we consolidate a workflow for sensical budgeted updates we will go private again". Proposal, for his yes:
1. Publish on purpose, not on every merge: the site publishes from a hand run (Actions > Deploy to GitHub Pages > Run workflow) or a version tag, not every push to main. The `PAGES_ON` variable already switches push-publishing off.
2. Publish from a `gh-pages` branch instead of an uploaded artifact, so publishing uses no Actions storage at all (Settings > Pages > Source: "Deploy from a branch").
3. Keep CI's failure report short-lived (3 days, done in V2.528) and leave CI off unless asked.
4. Check what a private repo's CodeQL needs (GitHub's code-scanning add-on), or keep CodeQL only while public.
- Acceptance: a month's normal work stays inside the private allowance; the site still publishes on demand.
- Dependencies: Patrick's yes on 1 and 2.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Storage quota still full | Site can't publish | Shorter report retention; Patrick clears artifacts or raises the limit |
| #1087 + #1088 build but fly wrong together (both change the Run-in setup) | Medium | Build and run-in unit tests on the merged result; look at both in the app at Checkpoint B |
| CI is off, so nothing checks the merges automatically | Medium | Build and the affected unit tests run here before each merge |
| A "leftover" branch holds unmerged work | Lost work | Content check, not git ancestry; delete only on Patrick's yes |

## Answered

1. #1086 (CT-157 Siskin II in Traffic), built ahead of Patrick's yes: merge it with the rest (Patrick, 22 Oct 2026, "Merge it too").
