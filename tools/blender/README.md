# Blender CT-156

**The CT-156's model files come from `3d-work` (ALL-38, plan Step 3b item 3.4).** Blender master files in the private
repo `3d-work` own the shape. Its delivery command (`node ct156/build/deliver.mjs`) builds the outside, gear and cockpit
files in High and Performance from the master, bakes their pictures, checks them (the Khronos validator, the sizes,
triangle budgets, the seams between neighbouring parts, the named points) and writes a delivery folder with its sheet.
The app takes a delivery only through:

```
npm run models:import -- <delivery folder>            check it, then copy it into public/models/ct156/
npm run models:import -- <delivery folder> --check    check only
```

`models-import.mjs` refuses a delivery that failed its checks or is a draft, or whose files are not the ones its sheet
checked (sizes and SHA-256 fingerprints, no extra files), and re-reads each model file as the app does (its parts,
normals and picture corners, no transform left on a node, triangles as the sheet says). It runs the Khronos glTF
validator again when this computer has it (set `GLTF_VALIDATOR` to its path, or have `gltf_validator` on the path);
without it the sheet's result stands. Nothing is copied on a refusal. It writes:

| Path | What it is |
|---|---|
| `public/models/ct156/high/` | The files the app loads today: `ct156-exterior.glb` with `-ao`, `-mask`, `-normal` and `-weather` pictures, `ct156-gear.glb` with `-ao`, `ct156-cockpit.glb` with one `ct156-cockpit-ao-<part>.jpg` per part and `ct156-cockpit-normal-body.png`, and `ct156-pilots.glb` |
| `public/models/ct156/performance/` | The same names, with fewer triangles and smaller pictures; loaded when the Graphics switch is on Performance |
| `public/models/ct156/delivery.json` | The delivery's sheet: its name, the master commit, every check, every file's fingerprint. The app loads a file only when each of its parts carries this delivery's name (`ct156-blender.js` `loadDelivered`); this replaced the code's fingerprints, since the file's shape may now differ from the code's on purpose |
| `public/models/ct156/ct156-points.json` | The named points in feet: eyes, reference points, hinges, the faces the app draws on, and each gear part's place gear down (for 3.5) |

An import that changes the files changes the version on screen in its pull request (rule book). The import prints the
points that differ from the code's own (`ct156-points.mjs`), the to-do list for 3.5. The console says
`CT-156 models: delivery <name>` once the files attach. If a file is missing or not from the delivery, the code-drawn
part shows (ALL-38 (4) and (5)). The test `tests/unit/ui-kit/ct156-delivery.test.js` checks every file against the sheet.

**The build scripts below no longer write the app's files.** They built the files from the code's tables before
ALL-38 and seeded the master files; they stay as the record until the code-drawn CT-156 is retired under ALL-38 (5).
The delivery's bake is ported from them (`3d-work` `ct156/build/exterior_pictures.py`).

| File | What it does |
|---|---|
| `ct156-shape.mjs` | Prints the code model's shape tables (fuselage stations, canopy, wing, tailplane, fin) as JSON. |
| `ct156-exterior-pieces.mjs` | Prints the code model's outside parts (fuselage, airframe, fin, frames, stacks and the rest) piece by piece, with each part's fingerprint. |
| `build_ct156_exterior.py` | Builds the outside: smooth-shades the parts, bakes one soft-shadow picture over all of them with the panel lines drawn in (places measured off reference side and top views and Patrick's photos, cited in the script), and exports `public/models/ct156-exterior.glb` and `ct156-exterior-ao.jpg`, plus `ct156-exterior-bump.jpg` (panel line grooves and rivets, bump-mapped) and `ct156-exterior-dirt.jpg` (exhaust soot, belly oil and grime, which darken and dull the paint). The app swaps each part in once the file loads (`src/ui-kit/ct156-model.js`); the decals, cheat line, glass, lights, pilots and prop stay the code's. |
| `ct156-gear-pieces.mjs` | Prints the code model's landing gear (main leg and wheel, leg door, inboard door, nose leg and wheel, nose door; the left side's, each in its hinge's own frame) piece by piece, with each part's fingerprint and its place gear down. |
| `build_ct156_gear.py` | Builds the gear: smooth-shades the parts, sets each in its place gear down with the right side's gear and the fuselage and wings round it, bakes one soft-shadow picture, puts each part back in its hinge's frame and exports `public/models/ct156-gear.glb` and `ct156-gear-ao.jpg`. The app swaps each part in once the file loads and swings it with `setGear`. |
| `ct156-cockpit-shape.mjs` | Prints the cockpit's numbers (eye, forward bow, canopy rails), worked out by the code cockpit's own helpers. The build still reads it, but since 12 Oct 2026 no part is drawn from it. |
| `ct156-cockpit-pieces.mjs` | Prints the code cockpit's solid parts (forward bow, canopy rails, body, seat, pcl, stick) piece by piece, with each part's fingerprint, and the pictured faces that shade them. Until 12 Oct 2026 the bow and rails were drawn in Blender from a few numbers with no fingerprint, so the app showed them whatever the code drew. |
| `ct156-points.mjs` | Prints the CT-156's named points in feet from the code model (eyes, reference points, every hinge with its axis, the cockpit faces the app draws on) to seed the Blender master file in `3d-work` (ALL-38). |
| `build_ct156_cockpit.py` | Builds the cockpit parts drawn as a model (ALL-32), rounds the code cockpit's pieces, bakes their soft shadows and exports `public/models/ct156-cockpit.glb` plus one `ct156-cockpit-ao-<part>.jpg` per part. The app uses these: each part replaces the code cockpit's part of the same name once the file loads (`src/ui-kit/ct156-cockpit-model.js`). |

Blender 4.2 LTS or 5.2 LTS, the free official release from blender.org, run without its window. The CT-156 files were
first built on 4.2 in the cloud; on 12 Oct 2026 all three were rebuilt on 5.2 on Patrick's PC and match: same parts,
materials and triangles, the same baked pictures (each picture's mean brightness within about 1%, the rest is bake
grain) and seat and outside renders under 0.1% of pixels apart. Blender 5 saves a picture set pixel by pixel as linear,
much darker, unless it is marked as data (Non-Color); the outside's bump and dirt pictures and the gear's shadow picture
are now saved that way, so 4.2 and 5.2 write the same files. 5.2 prints a warning that `Material.use_nodes` goes in
Blender 6.0; it still works.

## Setting up Blender for this work

- **Graphics card.** `bake_device.py` bakes on the graphics card when Blender finds one (OptiX, CUDA or HIP) and on
  the processor otherwise, as in the cloud. Each build prints `bake device: ...`. On an RTX 3070 the three files take
  about 66 s instead of about 3.5 min, with the same pictures. Set `CT156_BAKE_DEVICE=CPU` to force the processor.
- **On Windows** Blender is not on the path: use `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"` in
  place of `blender` below, with Windows paths for the output file.
- **Check every file you build.** `gltf-transform inspect <file>` (glTF-Transform, `npm install -g @gltf-transform/cli`)
  lists triangles, sizes and draw calls; the Khronos glTF Validator (`gltf_validator -o <file>`, from the Khronos
  glTF-Validator releases on GitHub) must report 0 errors and 0 warnings. Both run on the computer, not in the app.
- **Blender connector (optional).** The official Blender Lab MCP server (Blender 5.1 or newer) lets a Claude session
  drive an open Blender: the add-on from `https://lab.blender.org/`, the server registered with Claude Code. Blender's
  own page warns that it runs AI-written code in Blender with no guards: open only project files while it runs, and
  stop it when not in use. The build scripts never need it. Register the server's path with forward slashes
  (`C:/Users/.../blender-mcp.exe`): written through a shell, backslashes turn into escape codes (`\t`, `\v`) and every
  session shows "Connection closed". With the add-on's Auto Start on, open Blender before starting the session.

To look at the result, the render scripts in `render/` take pictures from the seats and outside, and from past versions (see `render/README.md`).

## Rebuild the outside (before 3.4; not for the app's files now)

Rebuild it after every change to the outside's shape in the code (ct156-model.js):

```
node tools/blender/ct156-exterior-pieces.mjs > ct156-exterior-pieces.json
node tools/blender/ct156-shape.mjs > ct156-shape.json
blender -b --factory-startup -P tools/blender/build_ct156_exterior.py -- ct156-exterior-pieces.json ct156-shape.json public/models/ct156-exterior.glb
```

The shadow bake (Cycles, on the processor) takes about five minutes. The file is used only whole: if any part's shape
has changed since it was built, the console says "out of date" and every ship stays as the code draws it.

## Rebuild the landing gear (before 3.4; not for the app's files now)

Rebuild it after every change to the gear's shape in the code (ct156-model.js):

```
node tools/blender/ct156-gear-pieces.mjs > ct156-gear-pieces.json
node tools/blender/ct156-exterior-pieces.mjs > ct156-exterior-pieces.json
node tools/blender/ct156-shape.mjs > ct156-shape.json
blender -b --factory-startup -P tools/blender/build_ct156_gear.py -- ct156-gear-pieces.json ct156-exterior-pieces.json ct156-shape.json public/models/ct156-gear.glb
```

The shadow bake takes under a minute. As with the outside, the file is used only whole: if any gear part's shape has
changed since it was built, the console says "out of date" and the code's own gear shows.

## Rebuild the cockpit parts (before 3.4; not for the app's files now)

```
node tools/blender/ct156-cockpit-shape.mjs > ct156-cockpit-shape.json
node tools/blender/ct156-cockpit-pieces.mjs > ct156-cockpit-pieces.json
blender -b --factory-startup -P tools/blender/build_ct156_cockpit.py -- ct156-cockpit-shape.json public/models/ct156-cockpit.glb ct156-cockpit-pieces.json public/models
```

The shadow bake takes about a minute and a half. Without the last two arguments the file has only the bow and rails, and
no shadows.

Rebuild it after every change to the cockpit in the code, and rebuild the outside and gear files too when the
model's shape tables change (the cockpit follows the canopy's shape). To check a change, open Turn Sim from the default
start, choose the cockpit view, front seat, and look ahead and to both sides, then the rear seat; give the model a few
seconds to load, or the code's own parts show first. Each part carries the code's fingerprint of its shape; a part
whose shape has changed since the file was built is skipped (the console says "out of date") and the code's own part
shows instead, so a forgotten rebuild loses the rounding and shadows but never shows a stale shape.

The first whole-aircraft trial (build_ct156.py, its parameters file, ct156.glb and the side-by-side trial page) was
retired when the outside file went in; its renders stay in `Pat's claude work/blender-trial/`.

# Traffic scenery (shadows and showpiece buildings)

| File | What it does |
|---|---|
| `export-buildings.mjs` | Exports Traffic's still scenery as an OBJ (feet from the ARP, z up) and the patches to bake, from the 3D view's own code. |
| `bake-shadows.py` | Bakes the buildings' and landmarks' shadows onto the ground with the 3D view's sun (TR-133 to TR-135). |
| `export-showpieces.mjs` | Writes the showpiece buildings' traced shapes as JSON (TR-142). |
| `build-showpieces.py` | Builds Hangars 1 to 3, 5 and 6, the Mess, the Glass Palace and the tower with recessed windows, ribbed doors, parapets and roofs, and exports `public/media/traffic-models/showpieces.glb`. |

## Rebuild the showpieces

Re-run when a showpiece's footprint changes (Blender 5.2 LTS, absolute paths):

```
node tools/blender/export-showpieces.mjs showpieces.json
blender -b -P tools/blender/build-showpieces.py -- showpieces.json <repo>/public/media/traffic-models/showpieces.glb
```

# Roads and power lines (OpenStreetMap)

`tools/osm/build-osm.mjs raw.json --fetch` downloads the pattern square's roads and power lines once from OpenStreetMap's Overpass
API and writes `src/modules/traffic/osm-features.js`; `tools/osm/make-road-textures.py` makes the road pictures (TR-147).
© OpenStreetMap contributors, ODbL: the 3D view shows the credit.
