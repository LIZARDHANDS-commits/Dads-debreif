# Graphics handover: CT-156 model work, 12 Oct 2026 night

For whoever picks up the graphics session next (folder `Dads-debreif-graphics`, branch `graphics`). Read `AGENTS.md`, then
`docs/modules/shared/plan.md` Step 3b, then `docs/modules/shared/graphics-handover/README.md` (the model's history) and
`tools/blender/README.md` (how to build it).

## Where we are

- **Decision ALL-38 (Patrick, 12 Oct 2026):** Blender owns the CT-156's shape. Master Blender files live in the
  private repo `LIZARDHANDS-commits/3d-work` (on this PC: `Documentsntigravityd-work`); the app takes finished,
  checked files and keeps in code what moves in flight. The code-drawn CT-156 stays until the Blender files are seen
  working in every module. ALL-32 to ALL-35, the shared spec and Step 3b were changed to match.
- **Plan:** Shared plan Step 3b, "CT-156: Blender owns the shape, then refine, then High and Performance". Done: 1, 2,
  3.1, 3.2; item 3 except the connector check. **Next: 3.3, the master Blender files.**
- **Branch:** `graphics`, with a pull request to main for the plan, the Blender 5.2 fixes, the rule-book line on
  third-party skills and ALL-38.
- **App:** nothing on screen changed. The model files in `public/models/` are as on main.
- **Parallel session:** the formation-physics session (folder `Dads-debreif-physics`) owns the flight code and
  `src/modules/turn-sim/live/`. This session owns `src/ui-kit/ct156-*.js`, `tools/blender/`,
  `public/models/ct156-*` and the `3d-work` repo.

## The plan (Step 3b)

| # | Item | State |
|---|---|---|
| 1 | Measure the three model files | Done |
| 2 | Blender 5.2 check | Done |
| 3 | Set up Blender for our work | Done except the connector check |
| 3.1 | Decision ALL-38 written, related rows and spec changed | Done |
| 3.2 | Private repo `3d-work` | Done |
| 3.3 | Master Blender files with named points, sources table; nothing changes on screen | **Next** |
| 3.4 | Delivery command in `3d-work`; `npm run models:import` in the app | |
| 3.5 | App reads named points, one module at a time | |
| 3.6 | Our own skill `ct156-model-pipeline` in `3d-work` (draft in `3d-work/scratch/`) | |
| 4 | Fix list from Patrick (outside and inside), made in Blender | Waiting on how he gives it |
| 5 | Refine | |
| 6 | High and Performance from the same master files | |
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

1. How to give the step 4 fix list: walk-through renders to mark up (recommended), his photos first, or flying it in
   the app.
2. The Blender connector checked end to end: a new session, Blender open, the MCP server started.
3. Already open from the earlier handover: sill height (his tape measurements of the bow), the rear seat after V2.403,
   paint grain, the pilots in Blender, the dark left wall (lighting, waits on its own yes), and tags `v2.385` to
   `v2.417` to push.
4. The development-environment talk is done: it led to ALL-38 and `3d-work`.

## Untested or unseen

- Nothing new has been seen in the app; nothing in the app changed.
- The connector has not been run end to end.
- The rebuilt 5.2 files were compared by numbers and renders only; they were not shipped.
- No tests were run (rule book: CI on the pull request is the one check).

## To resume

1. Open a Claude Code session in `Dads-debreif-graphics`, run `/sync` (in a worktree, merge `origin/main`; main is
   checked out in another folder).
2. Start the 5181 dev server, and Blender with the MCP server if the work needs it.
3. Pick up at Step 3b item 4.
