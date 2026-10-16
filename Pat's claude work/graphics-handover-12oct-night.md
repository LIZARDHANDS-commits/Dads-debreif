# Graphics handover: CT-156 model work, 12 Oct 2026 night

For whoever picks up the graphics session next: a Claude Code session in `Documents/antigravity/3d-work`, with an app
worktree beside it (`wise-mendeleev/Dads-debreif-3d`, made fresh from main; the old `Dads-debreif-graphics` worktree is
gone). Read `AGENTS.md`, then `docs/modules/shared/plan.md` Step 3b, then `docs/modules/shared/graphics-handover/README.md`
(the model's history) and `tools/blender/README.md` (how to build it).

## Latest (15 Oct 2026, late): 4.5B and 4.5C built on the same draft (#1051, V2.464; was V2.462, which #1050 also claimed)

- Fix delivery `ct156-2026-10-15-6b02eca` imported. `ct156-cockpit.js` `attachScreens` draws a face into each of the 53
  rectangles in `ct156-points.json` (`loadCt156Points`), glass over the openings, the striped handles from the delivery's
  `handle-stripes` face; the old `PANEL_INSTRUMENTS` layout, `drawStaticPanel`, `drawLowerPanel` and the code body's
  layout bezels are gone; placards lettered (`PLACARD_WORDS`). The cockpit render page takes `night`, `hud`, `engine`,
  `hideFaces`, and `window.placement()` checks each quad against its delivered corners.
- **Open:** the VO / VLO speeds (dashes: which source?); the gear placard's and engine label's words are estimates; the
  delivery's `handle-stripes` puts a striped T on the rear panel, which row E1 says the rear doesn't have (the master's).

## Earlier (15 Oct 2026, evening): increment 4.2 and 4.4 built here, draft PR, V2.464 (was V2.462)

- **Branch `shared-3d-ct156-increment4`** (stacked on #1049), draft PR "V2.464 Shared 3D: the CT-156's baked pictures,
  glass, reflections and lights (increment 4.2 + 4.4)". Delivery `ct156-2026-10-15-117020e` (layout 3) imported.
- **What changed:** relief, mask and painted weathering drawn with MikkTSpace tangents (`ct156-blender.js` `loadParts`
  `tangents`, `aoShaded`), pictures loaded per level at checked sizes and switched in only when all are in
  (`shadeWhenLoaded`, the one test); panel sheen per real panel (`ct156PanelSheen`); the look sliders
  (`ct156-look-settings.js`, a "Look (3D)" menu beside Graphics in Formation and Traffic); canopy glass edges, mirror
  and paint reflections, nav and tail lenses (`ct156-model.js`, `ct156-cockpit.js`). The render pages take `?level=`,
  `look`, `envRot`, `env`, `hideGlass`, `dusk`, `sun`, `gearDown`.
- **Not done:** 4.5B/C (part 2 of the same run, next); the mirror brackets' colour (W2: the bracket is in the
  master's `grey` slot, a 3d-work change); the lamps can't be seen lit from a seat (under the wing); item 8 (the
  Graphics switch picking the files) waits, as Patrick moved it after increment 4. Run notes and pictures:
  `3d-work/scratch/increment-4/app-run/`.

## Earlier (15 Oct 2026, afternoon): increments 3.1, 4.1 and 4.5A built in `3d-work`, not yet imported here

- **Built in `3d-work`, each a draft PR stacked on the one before (#111, then #112, #113, #115), nothing merged:**
  3.1 the hand-cut Performance outside (#112; the weld fix keeps every part's triangles, delivery
  `ct156-2026-10-15-1315ace`); 4.1 the baked pictures with the painted weathering (soot, oil streaks, edge wear,
  scuffs), the wingtips and tail in high detail and real nav-light lenses (#113, delivery `ct156-2026-10-15-f3207b6`,
  verified); 4.5A the cockpit panels' hardware in the master (bezels, handles, the TAS panel, the rear VO/VLO plate) and
  53 screen rectangles in `ct156-points.json` for the app to draw into (#115, delivery `ct156-2026-10-15-117020e`).
- **4.5A's verifier failed it:** the panel plate lay in the sun-shade veil's plane and baked black. The fix (veil cut
  where the plates are) is running; it re-delivers, naming `117020e` as previous.
- **Patrick's rulings today:** Performance outside budget 25,000 triangles (was 15,000; now 25,268, logged, tweaked at
  the end); 3.2 (the Graphics switch) moved after increment 4; spend stop raised to $290.
- **Next, here:** one Opus run in this worktree, stacked on #1049, imports the 4.5A delivery (it carries 4.1's
  pictures): 4.2 + 4.4 (materials, glass, reflections, sheen, markings, lit lights), then 4.5B/C (live instrument faces
  in the delivered rectangles, the flat panel drawing retired, placards); then 4.3 look sheets (Sonnet) for Patrick's
  wear and relief picks; one fresh verifier. State: `3d-work` `ct156/increments.md` and `scratch/next-steps.md`.

## Earlier (15 Oct 2026, night): increment 2 imported, draft #1049 (V2.460)

- **Built:** `3d-work` increment 2 (draft #111 there, both audits PASS) delivered as `ct156-2026-10-15-5f132cb` and
  imported here on branch `shared-3d-ct156-increment2`, draft #1049. The app now reads layout 2: the master's stacks,
  coamings, floor, speed brake and well, flap and gear wells, tub and pilots take the code's shapes in place (the code
  shapes stay only as the no-delivery fallback, so nothing draws twice); `no_picture` parts skip the shadow picture;
  the wicks and the speed brake's slot floors are dark (slots `aileron|1`, `elevator|1`, `rudder|1`, `speedBrake|1`).
  The importer refuses paths outside the delivery and a second picture layout.
- **Pictures** (render kit, before and after, noise floor 0.000 %): `3d-work` `scratch/increment-2/run-b/`.
- **Waiting on Patrick:** merging #1049 (and `3d-work` #111). Every open PR with a version label will clash on that
  one line once it lands; #1040 (the donor) and #1032 also share the model files.
- **Next:** increment 3 (the Graphics switch picks High or Performance).

## Earlier (15 Oct 2026): round 3 on main in both repos

- **Landed.** The CT-156 Blender model through round 3 is on the app's main through #1044 (V2.441, merge commit
  91f6001) and on `3d-work` main through #104 (b00e242), after Patrick's look ("All looks good"). #1034, #1035 and
  #1036 closed as landed; #1040 (chunk 9 as Antigravity built it) kept open as the donor for increments 2 to 4.
- **#1032 still open:** eight of its commits never reached the stack (seven handover and plan updates of 13 and 14 Oct,
  and fcf5152, the delivery sheet asked for only after the model file loads). Patrick decides whether it merges.
- **Still open:** shared plan Step 3 gear item 3, the landing and taxi lights (Patrick's look had no lights view), and
  Step 3b items 6 to 8. #1030 (the Traffic CT-102) brings main in itself with `git merge -X renormalize origin/main`.
- **Next:** increment 2 of `3d-work` `ct156/increments.md`, in a fresh session.

## Earlier (13 Oct 2026, evening): the rebuild under way; read `3d-work` `ct156/plan.md` "Resume here" first

- **How it runs:** one Opus orchestrator session talks to Patrick and verifies every agent result itself; one agent per
  lane, reused for the lane's next job (Patrick: "keep reusing the agents that are already working"): A, the master
  (Opus modeller, its own worktree); B, code (Opus); C, checks and research (Sonnet).
- **Chunk 1b, the delivery command (plan 3.4): built.** `3d-work` #31 merged (`node ct156/build/deliver.mjs`); here
  #1032 (V2.427): the model files come from a delivery in `public/models/ct156/`, the code fingerprints are replaced by
  a delivery check, `npm run models:import` refuses a failing delivery and leaves the old files in place if the dev
  server holds the folder (stop it first). The first delivery put today's picture on screen (render kit: under 0.05 %
  of pixels).
- **Chunk 1, the station-change references: delivered onto #1032's branch** (`ct156-2026-10-13-f9eccd5`; master in
  `3d-work` #30): the rings streamlined, the tail point (estimate until a photo), the pitots a third of the chord back
  on a tall mast (Patrick's T-6A photo `F11`), the paddle white with its foot cap. Waiting on Patrick's look; then merge
  #30 and #1032.
- **The new look (chunk L2): approved for every 3D module at once,** built on #1032's branch after chunk 1 (a shared
  helper `src/ui-kit/ct156-look.js`; every module's world is Z up, so today's sky light and reflections point
  sideways). Then the app's `.gitattributes` (Patrick: line ends, "Yes, in both repos"; `3d-work` #32 done).
- **Rulings today** (all in `3d-work` `ct156/plan.md`'s decisions log): the delivery design ("Approve all"); the ring
  "parelell with the fusilage, stramlined into wind"; the roundel's real maple leaf; the pitot (`F11`); the eye's
  height is a seat setting Patrick will choose in game; the enhancements EN1 to EN16 kept for consideration.
- **Next:** chunk 2, the canopy (stacked on chunk 1's master).
- **Found, not ours to fix:** EP Tabletop never disposes its CT-156 (`src/modules/ep-tabletop/world3d.js`, the
  `ship` made around line 142; its `dispose()` frees the cockpit, airports, terrain, ground and sky but not the ship),
  so the shared CT-156 material kit outlives the view. That file belongs to the EP Tabletop lane (#934, #946).
- **Line ends:** the app's `.gitattributes` now stores every text file with LF (#1032's branch renormalised the 67
  files stored with CRLF, line ends only). #1030 edits `src/modules/traffic/profile.js`, one of those files, so
  whichever of #1030 and #1032 merges second should merge with `-X renormalize`.

## Earlier (13 Oct 2026, later): station-change references first; pictures wanted listed

- **Station-change references (Patrick: "its vital that we get this right", his formation slide `F07`):** the tie-down
  rings, the pitot and the aft belly paddle lead the fixes, checked from the slide's wingman positions. The hanging ring
  stays (dark, about 0.4 ft, an "8"). "Ignore the tan dome." Open: G20, the number under the left wing.
- **Pictures and measurements wanted:** `3d-work` `ct156/measurements.md` now lists P1 to P15 and M1 to M47; keep it
  up to date whenever a row waits on one (Patrick).
- **Next:** `3d-work` `ct156/plan.md`, "Resume here".

## Earlier (13 Oct 2026): every agent finding verified and ruled

- **Read `3d-work` `ct156/plan.md` first**, then `ct156/fix-list.md` (114 rows; the fix-it plan has, for each approved
  row, today's values with code lines, the targets, the checks and a labelled picture in `refs/review/`).
- **Verified and ruled with Patrick, area by area:** B4 (the sill band's shelf, trim flush) and C1 (folded into C2);
  D, E, F, H and G. Patrick changed three of his 12 Oct settings: the grab rail's lower end to about 0.3 (D6), the rear
  crest to about 1.77 ft (E3), the cockpit greys lighter (G15). The fin goes navy (G14), so the app needs another way
  to tell ships apart in a debrief.
- **New rule (Patrick):** references must be CT-156; other T-6 variants back only shared shapes (D8 is provisional).
- **Patrick's asks added:** the exhausts with textured insides (F42), the tie-downs (F43, the tail point missing), the
  belly antennas' shape, size and place (F44).
- **Waiting on Patrick:** CT-156 photos (156102 from below, 156115, an exhaust, a tie-down, a wingtip light, 123 from
  below) and M1 to M40 at work.
- **Next:** the fixes in order (plan step 7), each shown before and after; first the paint-over-photo check (G7,
  G10, G12, G13).
- **Merged:** `3d-work` #16 to #22; app #1023.

## Earlier (13 Oct 2026, about 04:20Z): first batch approved and verified

- **Read `3d-work` `ct156/plan.md` first** (the plan was split into `plan.md`, `measurements.md` and `fix-list.md` on 13 Oct):
  its "Resume here" block and decisions log; then in `fix-list.md` the **fix-it plan** (how to
  fix each approved row: targets, code lines, master parts, checks), the verified rows and M1 to M40.
- **Rule (Patrick):** an agent's finding is verified by the thread itself before it goes on the fix list; unverified
  ones wait in `ct156/agent-findings.md` (85 rows, areas B to H). Verifying changed several: two approved rows did not
  hold on the drawing and went back to Patrick.
- **Approved:** A2, A3, B2, B3, C2, C3 (12 deg), C4 (1.5 in at 14 deg), C7 (17.5 deg), F26 (stopped prop feathered), F36
  (grooves in High only); C3, C4, C7 provisional until M22.
- **Shown in Blender:** `3d-work` `ct156/build/review_drawing.py` puts the official side view behind the model, never
  saved; Patrick wants each question drawn that way, centred on it.
- **New pictures:** `A19` (profile art, low), `A20` and `B03` (near-abeam canopy photos), `C04`, `C05`, `F05`.
- **Merged:** `3d-work` #10, #11; app #1021. Patrick has authorized merging this work's pull requests.
- **Next:** verify B4, C1, then D and E, putting each verified row to Patrick in Blender; then the fixes.

## Earlier (12 Oct 2026, about 21:30): all but two areas analysed

- **Read `3d-work` `ct156/fix-list.md` first:** its "Resume here" block, the step table, the decisions log, every
  row (candidates unless marked), and the measurements M1 to M25 for Patrick's next day at work.
- **Analysed:** A by overlays (levelling approved, A1; the height check with the spinner axis level: 11 ft 0.8 in,
  rows A2 wheels and A3 fin; the fin offset on the ramp photo was perspective). B and C, D, F, G by Sonnet agents in
  parallel (Patrick: several at once is fine), each checked by the thread before filing.
- **Fixed:** F8, the right aileron and flaps at the model's origin (a seeding bug), with a mirror check in
  `check_master.py`. Merged: `3d-work` #7, #8 and the save; app #1019 (ALL-34 reworded).
- **Next:** agents for E (rear cockpit) and H (pilots); put the rows to Patrick an area at a time, A with B and C
  first, each with options and a recommendation, the canopy height (B2) among the first.
- **Usage:** two agents hit the session limit (reset 20:50) and were resumed where they stopped.

## Earlier (12 Oct 2026, night): the fix list under way

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
