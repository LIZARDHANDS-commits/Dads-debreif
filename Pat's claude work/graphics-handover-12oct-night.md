# Graphics handover: CT-156 model work, 12 Oct 2026 night

For whoever picks up the graphics session next (folder `Dads-debreif-graphics`, branch `graphics`). Read `AGENTS.md`, then
`docs/modules/shared/plan.md` Step 3b, then `docs/modules/shared/graphics-handover/README.md` (the model's history) and
`tools/blender/README.md` (how to build it).

## Where we are

- **Decision ALL-38 (Patrick, 12 Oct 2026):** Blender owns the CT-156's shape. The master file is
  `ct156/ct156.blend` in the private repo `LIZARDHANDS-commits/3d-work` (on this PC `Documentsntigravityd-work`,
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
- **Pull request [#1010](https://github.com/LIZARDHANDS-commits/Dads-debreif/pull/1010)** (`graphics` → main): the plan,
  the Blender 5.2 fixes, the rule-book line, ALL-38, the points exporter, `three-performance` and these notes. CI green on
  the first run; the merge needs Patrick (auto mode refused a merge without review).
- **3d-work slip:** four commits went straight to its main on 12 Oct before the branch rule was applied there; from
  then on, branches and pull requests (task-observer 0057).
- **Parallel session:** the formation-physics session (`Dads-debreif-physics`) owns the flight code and
  `src/modules/turn-sim/live/`. The graphics work owns `src/ui-kit/ct156-*.js`, `tools/blender/`,
  `public/models/ct156-*` and `3d-work`.

## The plan (Step 3b)

| # | Item | State |
|---|---|---|
| 1 | Measure the three model files | Done |
| 2 | Blender 5.2 check | Done |
| 3 | Set up Blender for our work | Done except the connector check |
| 3.1 | Decision ALL-38 written, related rows and spec changed | Done |
| 3.2 | Private repo `3d-work` | Done |
| 3.3 | Master Blender file with named points, sources table; nothing changes on screen | **Started**; code-only parts still to bring in |
| 3.4 | Delivery command in `3d-work`; `npm run models:import` in the app | |
| 3.5 | App reads named points, one module at a time | |
| 3.6 | Our own skill `ct156-model-pipeline` in `3d-work` | Done (first version) |
| 4 | Fix list from Patrick (outside and inside), made in Blender; first row: height on its wheels | Waiting on how he gives it |
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

1. Merge pull request #1010.
2. The Blender connector checked end to end: Blender open, its MCP server started, then a new session.
3. How to give the fix list (item 4): walk-through renders to mark up, his photos or scaled diagrams from the
   internet, or flying it in the app.
4. Carried over: sill height (from scaled pictures until tape measurements), the rear seat after V2.403, paint grain,
   the dark left wall (lighting, its own yes), and tags `v2.385` to `v2.417` to push.

## Untested or unseen

- Nothing on screen changed; the master file has been checked by numbers and test renders only, not in the app.
- The connector has not been run end to end; the new skills have not been used on a real task yet.
- No tests were run (rule book: CI on the pull request is the one check).

## To resume

1. Model work: a Claude Code session in `Documentsntigravityd-work`, with the app's `Dads-debreif-graphics`
   folder added as a second folder, so one session can open pull requests in both repos. Read `3d-work/AGENTS.md`
   and the `ct156-model-pipeline` skill.
2. App-side work (items 3.4 app half, 3.5, 8): the same session, in the `Dads-debreif-graphics` folder; run `/sync`
   there first (in a worktree, merge `origin/main`).
3. Pick up at Step 3b item 3.3: bring the code-only parts into the master file, then 3.4, delivery.
