# CT-102B Astra II (Grob G 120TP) in Blender

Dad's ask, Patrick approved 13 Oct 2026: the CT-156's process applied to the Astra II (shared plan Step 3c, `docs/modules/shared/ct102-astra-plan.md`). This folder is the one writer's own (Dad's thread). It never edits a CT-156 file.

**Status:** first pass of the outside, 13 Oct 2026, not yet seen by Patrick or Dad. Sized to the published length, span, height and wing area; everything inside those sizes is an estimate until it is measured off a scaled picture or a photo (see `sources.md`).

| File | What it does |
|---|---|
| `sources.md` | Every number the build uses, with its source (public page, or "estimate"), where the sources disagree, the four things still to confirm (gear, prop, seating, canopy) and the size-check results. |
| `build_ct102b.py` | Builds the outside by script from the constants block at its top (each number names its row in `sources.md`), saves the master `.blend`, prints the size checks and the named points, and optionally makes the full renders. |

## What the master holds

- Real feet, the CT-156 scripts' axes: nose +X, left +Y, up +Z from the propeller axis, origin at the spinner's tip.
- **Parts:** `cowl`, `fuselage`, `canopy`, `spinner`, `blade1` to `blade5`, `wingLeft` and `wingRight` (centre section, outer panel with dihedral, winglet), `flapLeft`, `flapRight`, `aileronLeft`, `aileronRight`, `tailplane`, `elevator`, `fin`, `rudder`, and the gear, down: `gearNoseLeg`, `gearNoseWheel`, `gearMainLeftLeg`, `gearMainLeftWheel` and the right side's. Smooth-shaded, with a hard edge where faces meet at more than 40°, as the CT-156's are.
- **Named points (empties):** `datum` (the model origin), `eyeLeftSeat`, `eyeRightSeat`, and the hinges `aileronLeftHinge`, `aileronRightHinge`, `flapLeftHinge`, `flapRightHinge`, `elevatorHinge`, `rudderHinge`, `propAxis`, `gearMainLeftHinge`, `gearMainRightHinge` and `gearNoseHinge`. Each hinge's local X is its turning axis, and it carries `axis`, `positive` (which way a positive turn moves the part), `travel` and `source`. Each moving part is parented to its hinge, so turning the empty moves the part.
- No baked shadows, panel lines or paint yet: those come with refining and the High and Performance delivery (plan Step 3c items 4 and 6).

## Running it

Blender 5.2 LTS, without its window:

```
blender -b --factory-startup -P tools/blender/ct102b/build_ct102b.py -- <scratch>/ct102b.blend <scratch>/renders
```

Or with Blender as a Python module (`bpy` 5.2.2 from PyPI, in a virtual environment outside the repo; it is a tool, never a project dependency):

```
python3 -m venv <scratch>/bpy-venv
<scratch>/bpy-venv/bin/pip install bpy==5.2.2
<scratch>/bpy-venv/bin/python tools/blender/ct102b/build_ct102b.py -- <scratch>/ct102b.blend <scratch>/renders
```

Leave off the render folder to build and save only (a few seconds). With it, the saved master is opened again and six pictures are made in plain colours with Cycles on the processor (about a minute on 4 cores): `ct102b-quarter-front-left.png`, `ct102b-quarter-rear-right.png`, `ct102b-below.png`, and square-on `ct102b-side.png`, `ct102b-front.png` and `ct102b-top.png` over a 1 ft grid (heavier lines every 5 ft; lines on whole feet from the spinner's tip, the centreline and the ground).

**Keep the `.blend` and the renders out of the repo.** Model files reach the app only through the High and Performance delivery into `public/models/` (plan Step 3c item 6). Reference pictures are for measuring only and never go in the repo either.

## Where the master lives

Until Dad's sessions can reach the private repo `3d-work`, the build script and the sources table live here and the `.blend` stays in the session's scratch folder. Once they can, the master moves to `3d-work/ct102b/` with its sources table, as the CT-156's did (ALL-38), and this folder keeps only what the app's side needs.
