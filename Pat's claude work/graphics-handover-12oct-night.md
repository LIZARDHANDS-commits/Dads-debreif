# Graphics handover: CT-156 model work, 12 Oct 2026 night

For whoever picks up the graphics session next (folder `Dads-debreif-graphics`, branch `graphics`). Read `AGENTS.md`, then
`docs/modules/shared/plan.md` Step 3b, then `docs/modules/shared/graphics-handover/README.md` (the model's history) and
`tools/blender/README.md` (how to build it).

## Where we are

- **Plan:** Shared plan Step 3b, "CT-156 model: refine, then High and Performance versions", approved by Patrick on
  12 Oct 2026 with his addition of item 3, "set up Blender". Items 1 and 2 are done, item 3 is done except the
  connector check.
- **Branch:** `graphics`, two commits ahead of main (`831d796e`), not pushed:
  - `1e9f3a9e` Shared plan: CT-156 model refine, then High and Performance versions
  - `eb1be8b2` Shared 3D: CT-156 builds on Blender 5.2 match 4.2, bake on the graphics card
- **App:** nothing in the app changed. The model files in `public/models/` are as on main.
- **Parallel session:** the formation-physics session (folder `Dads-debreif-physics`) owns the flight code and
  `src/modules/turn-sim/live/`. This session owns `src/ui-kit/ct156-*.js`, `tools/blender/` and
  `public/models/ct156-*`.

## The plan (Step 3b)

| # | Item | State |
|---|---|---|
| 1 | Measure the three model files | Done |
| 2 | Blender 5.2 check | Done |
| 3 | Set up Blender for our work | Done except the connector check |
| 4 | Fix list from Patrick (outside and inside) | Next; waiting on how he wants to give it |
| 5 | Refine | |
| 6 | One detail-level setting in each build script (High and Performance) | |
| 7 | Compress at build time (Meshopt) | |
| 8 | The Graphics switch picks the files | |
| 9 | Khronos validator on every model file | |
| 10 | Patrick sees it in the app; SH-60 wording with him | |

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
4. Next conversation: Patrick wants to talk about the environment (the 3D world around the aircraft).

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
