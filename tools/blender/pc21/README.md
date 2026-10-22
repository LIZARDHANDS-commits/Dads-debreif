# CT-157 Siskin II (Pilatus PC-21) in Blender

Dad's ask, 17 to 18 Oct 2026 ("Lets build a PC-21", then "3d Model for the pattern sim like the grob"): the Astra's process applied to the PC-21 (shared plan Step 3f, `docs/modules/shared/pc21-plan.md`; Traffic plan Step 5d), in the RCAF paint of 201. This folder is the one writer's own (Dad's thread). It never edits a CT-156, Astra, T-38 or C-130J file.

**Status:** first pass of the outside with the RCAF paint, **proposed, built ahead of Patrick's yes, not yet seen by Patrick or Dad** (18 Oct 2026). Sized to the printed length, span and height on the Pilatus three-view Dad sent; the shape inside them is measured off that drawing (rows R in `sources.md`), each view at its own printed size; what the drawing doesn't show (gear legs, blade angles, sections) is an estimate. The drawing's own views stand about 1 ft taller than its "12 ft 4 in" label: the build takes the label and draws the fin shorter (sources.md R16, the first item on the fix list).

| File | What it does |
|---|---|
| `sources.md` | Every number the build uses, with its source (printed on the three-view, measured off it, read off Dad's renders, or "estimate"), how each view was scaled, the size checks and the fix list. |
| `build_pc21.py` | Builds the outside by script from the constants block at its top (each number names its row in `sources.md`), paints it, saves the master `.blend`, prints the size checks, the named points and the triangle count, and optionally makes the renders. |
| `export_pc21.py` | Writes the two model files the app loads from a built master (below). |

## What the master holds

- Real feet, the CT-156 scripts' and the Astra's axes: nose +X, left +Y, up +Z from the propeller axis, origin at the spinner's tip.
- **Parts:** `cowl`, `fuselage`, `canopy`, `canopyArch` (the frame between the seats), `spinner`, `blade1` to `blade5`, `exhaustLeft` and `exhaustRight`, `strakeLeft` and `strakeRight` (the ventral strakes), `wingLeft` and `wingRight` (with the kinked trailing edge and the upturned tips), `flapLeft`, `flapRight`, `aileronLeft`, `aileronRight`, `tailplane`, `elevator`, `fin` (with its dorsal fillet), `rudder`, and the gear, down: `gearNoseLeg`, `gearNoseWheel`, `hubNose`, `gearMainLeftLeg`, `gearMainLeftWheel`, `hubMainLeft` and the right side's.
- **Named points (empties):** `datum`, `eyeFrontSeat`, `eyeRearSeat`, and the hinges `aileronLeftHinge`, `aileronRightHinge`, `flapLeftHinge`, `flapRightHinge`, `elevatorHinge`, `rudderHinge`, `propAxis`, `gearMainLeftHinge`, `gearMainRightHinge`, `gearNoseHinge`, each with `axis`, `positive`, `travel` and `source`, the moving part parented to it (the Astra's way).
- **RCAF paint of 201** (rows D in `sources.md`, all by eye off Dad's renders): one block of colours, the stripe's line and the markings in the constants, drawn into small generated pictures (packed into the `.blend`) and applied by position. The roundels, flags and leaf are geometric stand-ins and the lettering is Blender's built-in face. Where the delivered model's paint lives (in the file, as here and for the Astra, or in the app, as for the CT-156 under ALL-38) is a question for Patrick (pc21-plan.md question 4).

## Running it

Blender 5.2 LTS, without its window:

```
blender -b --factory-startup -P tools/blender/pc21/build_pc21.py -- <scratch>/pc21.blend <scratch>/renders
blender -b --factory-startup -P tools/blender/pc21/export_pc21.py -- <scratch>/pc21.blend public/models
```

Or with Blender as a Python module (`bpy` 5.2.2 from PyPI, in a virtual environment outside the repo; it is a build tool, never a project dependency, and nothing is added to `package.json`). This is how the first pass was built (18 Oct 2026, Blender's site blocked from the session):

```
uv venv --python 3.13 <scratch>/bpyenv
uv pip install --python <scratch>/bpyenv bpy==5.2.2
<scratch>/bpyenv/bin/python tools/blender/pc21/build_pc21.py -- <scratch>/pc21.blend <scratch>/renders
<scratch>/bpyenv/bin/python tools/blender/pc21/export_pc21.py -- <scratch>/pc21.blend public/models
```

(`python3 -m venv` and `pip install bpy==5.2.2` work as well; bpy 5.2.2 needs Python 3.13.) Leave off the render folder to build and save only (a few seconds). With it, six pictures are made with Cycles on the processor (a few minutes): `pc21-quarter-front-left.png`, `pc21-quarter-rear-right.png`, `pc21-below.png`, and square-on `pc21-side.png`, `pc21-front.png` and `pc21-top.png` over a 1 ft grid.

**The model files for the app** (Traffic plan Step 5d, TR-168): `export_pc21.py` writes `public/models/ct157-exterior.glb` (High: every part, the paint pictures full size) and `ct157-exterior-lite.glb` (the parts over 1,000 triangles decimated to 30 %, the paint pictures halved), in feet, nose +X with the spinner tip at x 0, left +Y, up +Z (exported Z-up); `src/ui-kit/ct157-model.js` loads them. Run it again after any change to the build script and commit the two files with it. The sizes and triangle counts of the first delivery are in shared plan Step 3f.

**Keep the `.blend` and the renders out of the repo.** Model files reach the app only as the two exported files. Reference pictures are for measuring only and never go in the repo, nor do overlays made from them.

## Where the master lives

As for the Astra, until Dad's sessions can reach the private repo `3d-work`, the build script and the sources table live here and the `.blend` stays in the session's scratch folder (ALL-38 says the master belongs in `3d-work`; Patrick can ask for it to move).
