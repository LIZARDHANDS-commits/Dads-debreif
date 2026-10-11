# Blender CT-156 (trial)

A trial of building the CT-156 in Blender instead of in code. Nothing in the app uses it yet: the code model
(`src/ui-kit/ct156-model.js`) is still the aircraft in every module. The trial page shows the two side by side.

| File | What it does |
|---|---|
| `ct156-shape.mjs` | Prints the code model's shape tables (fuselage stations, canopy, wing, tailplane, fin) as JSON, so both models use one set of numbers. |
| `build_ct156.py` | Blender script, run without Blender's window: builds the aircraft from those tables and exports `public/models/ct156.glb`. |
| `ct156-params.json` | Moves the nose top line, the canopy peak and the forward canopy bow, in feet. `null` keeps the code tables. |
| `ct156-cockpit-shape.mjs` | Prints the cockpit's numbers (eye, forward bow, canopy rails), worked out by the code cockpit's own helpers. |
| `build_ct156_cockpit.py` | Builds the cockpit parts drawn as a model (ALL-32) and exports `public/models/ct156-cockpit.glb`. The app uses this one: each part replaces the code cockpit's part of the same name once the file loads (`src/ui-kit/ct156-cockpit-model.js`). |

## Rebuild the model

Blender 4.2 LTS, the free official release from blender.org.

```
node tools/blender/ct156-shape.mjs > ct156-shape.json
blender -b --factory-startup -P tools/blender/build_ct156.py -- ct156-shape.json tools/blender/ct156-params.json public/models/ct156.glb
```

## Rebuild the cockpit parts

```
node tools/blender/ct156-cockpit-shape.mjs > ct156-cockpit-shape.json
blender -b --factory-startup -P tools/blender/build_ct156_cockpit.py -- ct156-cockpit-shape.json public/models/ct156-cockpit.glb
```

Rebuild it whenever the eye, the bow or the canopy changes in the code, so the parts still fit.

## The parameters (feet, from the spinner's axis)

- `noseTopFt`: `[at the spinner, at the windscreen's foot]`, the cowling's top line.
- `canopyPeakFt`: the canopy's highest point above the spinner's axis.
- `forwardBowCrestFt`: `[aft of the spinner tip, above the spinner's axis]`, the windscreen bow's crest.

The code tables carry the T-6A-1 side drawing's numbers from V2.235 (ALL-31: bow crest 11.3 ft aft of the spinner tip
and 2.75 ft up, canopy peak 3.45 ft, nose top line 0.85 to 1.45 ft), so the file holds `null` and the model follows the
code. Set a value only to try other numbers, such as measurements from the seat, before they go into the code tables.

## See it

`src/ui-kit/ct156-trial.html` (in the dev server, or `src/ui-kit/ct156-trial.html` on the built site): the code model on
the left, the Blender model on the right, same camera and light, with each one's render time, draw calls and triangles,
for one ship or 25.

## What the Blender model has and lacks

Has: the same fuselage, canopy, helmets, wings (3° dihedral), tailplane, fin, ventral fin, chrome spinner, 97 in four-blade prop
with twist and red tips, exhaust stacks, canopy bows, cheat line and position lights. The fin takes each ship's colour.

Lacks so far: the decals (roundels, Canada, ship numbers, serial, red triangles), the cockpit (seats, panel, tub),
the far and near detail switch, and the prop disc.

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
API and writes `src/modules/traffic/osm-features.js`; `tools/osm/make-road-textures.py` makes the road pictures (TR-144).
© OpenStreetMap contributors, ODbL: the 3D view shows the credit.
