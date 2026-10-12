# Blender CT-156

The CT-156's outside (ALL-33) and cockpit (ALL-32) are model files built here by script from the code model's own
shapes, so the code's tables stay the one source for the aircraft's shape and size. Blender adds what code can't easily:
smooth shading with sharp edges where they belong, baked soft shadows, and the panel lines and control-surface gaps.
If a file is missing, or a part's shape has changed since it was built, the code-drawn part shows.

| File | What it does |
|---|---|
| `ct156-shape.mjs` | Prints the code model's shape tables (fuselage stations, canopy, wing, tailplane, fin) as JSON. |
| `ct156-exterior-pieces.mjs` | Prints the code model's outside parts (fuselage, airframe, fin, frames, stacks and the rest) piece by piece, with each part's fingerprint. |
| `build_ct156_exterior.py` | Builds the outside: smooth-shades the parts, bakes one soft-shadow picture over all of them with the panel lines drawn in (places measured off reference side and top views and Patrick's photos, cited in the script), and exports `public/models/ct156-exterior.glb` and `ct156-exterior-ao.jpg`, plus `ct156-exterior-bump.jpg` (panel line grooves and rivets, bump-mapped) and `ct156-exterior-dirt.jpg` (exhaust soot, belly oil and grime, which darken and dull the paint). The app swaps each part in once the file loads (`src/ui-kit/ct156-model.js`); the decals, cheat line, glass, lights, pilots and prop stay the code's. |
| `ct156-cockpit-shape.mjs` | Prints the cockpit's numbers (eye, forward bow, canopy rails), worked out by the code cockpit's own helpers. |
| `ct156-cockpit-pieces.mjs` | Prints the code cockpit's solid parts (body, seat, pcl, stick) piece by piece, with each part's fingerprint, and the pictured faces that shade them. |
| `build_ct156_cockpit.py` | Builds the cockpit parts drawn as a model (ALL-32), rounds the code cockpit's pieces, bakes their soft shadows and exports `public/models/ct156-cockpit.glb` plus one `ct156-cockpit-ao-<part>.jpg` per part. The app uses these: each part replaces the code cockpit's part of the same name once the file loads (`src/ui-kit/ct156-cockpit-model.js`). |

Blender 4.2 LTS, the free official release from blender.org, run without its window.

## Rebuild the outside

Rebuild it after every change to the outside's shape in the code (ct156-model.js):

```
node tools/blender/ct156-exterior-pieces.mjs > ct156-exterior-pieces.json
node tools/blender/ct156-shape.mjs > ct156-shape.json
blender -b --factory-startup -P tools/blender/build_ct156_exterior.py -- ct156-exterior-pieces.json ct156-shape.json public/models/ct156-exterior.glb
```

The shadow bake (Cycles, on the processor) takes about five minutes. The file is used only whole: if any part's shape
has changed since it was built, the console says "out of date" and every ship stays as the code draws it.

## Rebuild the cockpit parts

```
node tools/blender/ct156-cockpit-shape.mjs > ct156-cockpit-shape.json
node tools/blender/ct156-cockpit-pieces.mjs > ct156-cockpit-pieces.json
blender -b --factory-startup -P tools/blender/build_ct156_cockpit.py -- ct156-cockpit-shape.json public/models/ct156-cockpit.glb ct156-cockpit-pieces.json public/models
```

The shadow bake takes about a minute and a half. Without the last two arguments the file has only the bow and rails, and
no shadows.

Rebuild it after every change to the cockpit in the code. Each part carries the code's fingerprint of its shape; a part
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
