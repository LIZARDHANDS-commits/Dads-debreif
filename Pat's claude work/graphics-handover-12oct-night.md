# Graphics handover: CT-156 model work, 12 Oct 2026 night

For whoever picks up the graphics session next: a Claude Code session in `Documents/antigravity/3d-work`, with an app
worktree beside it (`wise-mendeleev/Dads-debreif-3d`, made fresh from main; the old `Dads-debreif-graphics` worktree is
gone). Read `AGENTS.md`, then `docs/modules/shared/plan.md` Step 3b, then `docs/modules/shared/graphics-handover/README.md`
(the model's history) and `tools/blender/README.md` (how to build it).

## Latest (12 Oct 2026, night): the fix list under way

- **The working plan for item 4 is `3d-work` `ct156/fix-list.md`:** steps and state, Patrick's decisions, the M list
  of measurements for work, every fix row. Read it first.
- **References:** 43 pictures renamed by area (`3d-work` `ct156/references.md`), the Moose Jaw CT-156 video (39 best
  frames, all front seat); the RC build-guide video dropped. Panel version: before PF-25 (Patrick).
- **Manuals read page by page** by Sonnet agents (CFAFM used, never cited; SMM; case study): printed elevator, rudder
  and flap travel, prop 97 in, tailplane 11 ft 4 in, the type certificate's levelling (canopy rail at -6.00°).
- **Levelling settled:** the EADI's 2.5° on the gear is the datum's; the spinner axis sits about level; ALL-34
  reworded. The height check now measures with the spinner axis level: 11 ft 0.8 in against 10 ft 8 in (rows A2
  wheels, A3 fin).
- **Agents running** on areas F, G, B and C, and D; their rows are checked against the master before they reach
  Patrick.
- Dropped from the waiting list (Patrick): the cloud project pointer and the tags.

## Earlier (12 Oct 2026, late evening)

- **3.3 done** (`3d-work` #4, merged): the parts the code drew itself are in the master: speed brake and well, five gear
  wells, four flap wells, prop blades (19th hinge, `hinge.prop`), exhaust stacks, floor and coamings seen from outside,
  the tub seen from the seats, and both pilots (collection Pilots). Each part marks which view shows it (`ct156_shown`),
  as the app's `setCockpitView`. Size checks unchanged; mesh checks pass on 55 parts.
- **Item 3 done:** the Blender connector works end to end. It had failed with "Connection closed" because its path in
  `~/.claude.json` had been written through a shell, which turned the backslashes into escape codes; now forward
  slashes (backup `~/.claude.json.bak-blender-path-fix`). The same fault had put control characters into this note's
  paths; fixed.
- **Item 4, how (Patrick):** "for the fix list we will look at a full blender render of th outside and inside cockpits
  and work from that". `3d-work` `ct156/build/render_views.py` renders ten views from the master with Cycles: both
  quarters, below, side, front and top over a 1 ft grid, the front seat forward and down at the panel, the rear seat,
  and both cockpits from above. Plain colours: paint, instruments and glass are the app's. Next: Patrick reads them and
  says what is wrong; each item becomes a numbered row.
- **Next after the fix list starts:** 3.4, the delivery command.

## Where we were earlier the same night

- **Decision ALL-38 (Patrick, 12 Oct 2026):** Blender owns the CT-156's shape. The master file is
  `ct156/ct156.blend` in the private repo `LIZARDHANDS-commits/3d-work` (on this PC `Documents/antigravity/3d-work`,
  which is already the local clone). The app takes finished, checked files and keeps in code what moves in flight.
  What the code does and where each part goes: `docs/modules/shared/graphics-handover/README.md` section 0.
- **Plan Step 3b:** done 1, 2, 3.1, 3.2, 3.6; 3 done except the connector check; **3.3 started**: the master file in
  real feet with the outside, gear (down), cockpit, 14 named points, 18 hinges and 10 instrument faces, size checks and
  the sources table. Still to bring into it: speed brake panel, gear and flap wells, prop blades, pilots.
- **Size checks on the master file:** length 33 ft 3.4 in, span 33 ft 5.1 in and both eye points pass; **height on its
  wheels 10 ft 1 in against the public 10 ft 8 in fails**, already true of the app's model; on the fix list (item 4).
- **Skills (our own, from the analyzed third-party skills):** `three-performance` in the app's `.agent/skills`,
  `ct156-model-pipeline` in `3d-work/.agent/skills`.
- **App repo:** stays public (Patrick, 12 Oct 2026).
- **Merged 12 Oct:** app [#1010](https://github.com/LIZARDHANDS-commits/Dads-debreif/pull/1010) (ALL-38, the plan,
  the Blender 5.2 fixes, the points exporter, `three-performance`); `3d-work` #1 (README), #2 (mesh checks; our own hooks:
  session-start tool check, master-changed reminder, a guard refusing pushes to main that hands on to Git LFS) and #3
  (`sync` and `save` for `3d-work`). Open: app #1015, the rule book's new "project and its repos" section, the CFAFM
  rule and long runs (from the cloud project's instructions, which become a pointer); it merges when CI is green.
- **Working arrangement:** sessions run in `3d-work` with the app folder added; `3d-work`'s `sync` and `save` keep the
  plan, waiting list and handover here in the app. In each `3d-work` clone: `git config core.hooksPath .githooks`.
- **3d-work slip:** four commits went straight to its main on 12 Oct before the branch rule was applied there; the
  guard in `.githooks/` now refuses it (task-observer 0057, closed).
- **Parallel session:** the formation-physics session (`Dads-debreif-physics`) owns the flight code and
  `src/modules/turn-sim/live/`. The graphics work owns `src/ui-kit/ct156-*.js`, `tools/blender/`,
  `public/models/ct156-*` and `3d-work`.

## The plan (Step 3b)

| # | Item | State |
|---|---|---|
| 1 | Measure the three model files | Done |
| 2 | Blender 5.2 check | Done |
| 3 | Set up Blender for our work | Done |
| 3.1 | Decision ALL-38 written, related rows and spec changed | Done |
| 3.2 | Private repo `3d-work` | Done |
| 3.3 | Master Blender file with named points, sources table; nothing changes on screen | Done (`3d-work` #4) |
| 3.4 | Delivery command in `3d-work`; `npm run models:import` in the app | |
| 3.5 | App reads named points, one module at a time | |
| 3.6 | Our own skill `ct156-model-pipeline` in `3d-work` | Done (first version) |
| 4 | Fix list from Patrick (outside and inside), made in Blender; first row: height on its wheels | Renders made; waiting on Patrick's read of them |
| 5 | Refine | |
| 6 | High and Performance from the same master file | |
| 7 | Compress at delivery (Meshopt) | |
| 8 | The Graphics switch picks the files | |
| 10 | Patrick sees it in every module, then the code CT-156 is retired | |

## Also done this session

- **Prompt-injection audit** of every skill, plugin, hook and connector both tools load, the repo and the Blender
  connector: clean. Scanner at `~/.claude/tools/` (`bash ~/.claude/tools/scan-mine.sh`).
- **Antigravity's `agentic-awesome-skills` connector removed** (it ran the newest npm version on every start, unpinned);
  backup `~/.gemini/config/mcp_config.json.bak-2026-10-12-aas`. Takes effect when Antigravity restarts.
- **Rule book:** third-party skills, plugins and connectors only after a read and a scan, pinned, without hooks.
- **Clones for reading** in `3d-work/clones/` (not in git): `three-agent-skills` and `claudedesignskills`, both scanned
  clean. Borrow list: graphics memory over file size, Meshopt, draw-call readout, joining static cockpit parts,
  environment reflections, normal-map baking; Decimate rejected (breaks thin parts).

## What was found

**Measurements (item 1):**

| File | Triangles | Size | Validator |
|---|---|---|---|
| Outside | 19,825 | 0.6 MB | 0 errors, 0 warnings |
| Gear | 5,592 | 0.2 MB | 0 errors, 0 warnings |
| Cockpit | 143,088 | 5.2 MB | 0 errors, 0 warnings |

The cockpit is the weight: canopy bow 30,600 triangles, body 61,700, power lever 20,100, canopy rails 19,800. All
attributes are stored uncompressed (32-bit floats). The baked pictures add about 3.5 MB.

**Blender 5.2 check (item 2):** on 5.2 the three files have the same parts, materials and triangles as the 4.2 files,
and the seat and outside renders are under 0.1% of pixels apart. One real difference: Blender 5 saved the outside's
bump (rivets and panel lines) and dirt pictures and the gear's shadow picture as linear values, much darker (bump mean
150 became 79, dirt 15 became 1.5, gear 137 became 111). The renders didn't show it. Fixed by saving those pictures
marked as data (Non-Color); they now match 4.2 within about 1%. 5.2 warns that `Material.use_nodes` goes in Blender 6.0;
it still works.

**Graphics card (item 3):** `tools/blender/bake_device.py` bakes on the card when Blender finds one (OptiX, CUDA, HIP)
and on the processor otherwise. On Patrick's RTX 3070 all three files build in 66 s instead of about 3.5 min, with the
same pictures (mean difference 0.03 of 255). `CT156_BAKE_DEVICE=CPU` forces the processor.

## Tools on Patrick's PC (outside the repo)

- glTF-Transform 4.5.1, global npm (`gltf-transform inspect <file>`).
- Khronos glTF Validator 2.0.0-dev.3.10: `C:\Users\patri\tools\gltf-validator\gltf_validator.exe -o <file>`.
- Blender 5.2.2 LTS: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
- Official Blender Lab connector v1.0.3: server in `C:\Users\patri\tools\blender-mcp\venv`, add-on installed and
  enabled in Blender 5.2, registered with Claude Code as `blender` (user scope; backup of the settings file at
  `C:\Users\patri\.claude.json.bak-blender-mcp`). Blender's page warns it runs AI-written code with no guards.
- Dev server for this session: `dads-ooda-loop-5181` in `.claude/launch.json` (port 5181), because the physics session
  uses 5173.
- Render kit: `tools/blender/render/`. Playwright here wants a newer browser than is installed; set
  `CHROMIUM_PATH` to `%LOCALAPPDATA%\ms-playwright\chromium-1194\chrome-win\chrome.exe` instead of downloading.

## Waiting on Patrick

1. Paste the pointer text into the cloud project's instructions (it is in the rule book's new first section's spirit:
   read `AGENTS.md` first). App #1015 merged.
2. Read the ten full renders (item 4) and say what is wrong outside and in each cockpit; each item becomes a row.
3. Carried over: sill height (from scaled pictures until tape measurements), the rear seat after V2.403, paint grain,
   the dark left wall (lighting, its own yes), and tags `v2.385` to `v2.417` to push.

## Untested or unseen

- Nothing on screen changed; the master file has been checked by numbers and test renders only, not in the app.
- The connector has not been run end to end; the new skills have not been used on a real task yet.
- No tests were run (rule book: CI on the pull request is the one check).

## To resume

1. Model work: a Claude Code session in `Documents/antigravity/3d-work`, with the app's `Dads-debreif-graphics`
   folder added as a second folder, so one session can open pull requests in both repos. Read `3d-work/AGENTS.md`
   and the `ct156-model-pipeline` skill.
2. App-side work (items 3.4 app half, 3.5, 8): the same session, in the `Dads-debreif-graphics` folder; run `/sync`
   there first (in a worktree, merge `origin/main`).
3. Pick up at Step 3b item 3.3: bring the code-only parts into the master file, then 3.4, delivery.
