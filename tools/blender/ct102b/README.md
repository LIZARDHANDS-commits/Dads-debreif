# CT-102B Astra II (Grob G 120TP) in Blender

Dad's ask, Patrick approved 13 Oct 2026: the CT-156's process applied to the Astra II (shared plan Step 3c, `docs/modules/shared/ct102-astra-plan.md`). This folder is the one writer's own (Dad's thread). It never edits a CT-156 file.

**Status:** first refine pass of the outside, with the RCAF paint added, 13 Oct 2026, not yet seen by Patrick or Dad. Sized to the published length, span and height; the shape inside them is measured off the Aeromaquina three-view Dad sent (rows R1 to R16 in `sources.md`), and what the drawing doesn't show (gear legs, blades, cockpit) is still an estimate.

| File | What it does |
|---|---|
| `sources.md` | Every number the build uses, with its source (public page, measured off the three-view, Dad's photos, or "estimate"), where the sources disagree, the four things still to confirm (gear, prop, seating, canopy) and the size-check results. |
| `build_ct102b.py` | Builds the outside by script from the constants block at its top (each number names its row in `sources.md`), saves the master `.blend`, prints the size checks and the named points, and optionally makes the full renders (now painted, plus a side view from the photo's own camera). |

## What the master holds

- Real feet, the CT-156 scripts' axes: nose +X, left +Y, up +Z from the propeller axis, origin at the spinner's tip.
- **Parts:** `cowl`, `fuselage`, `canopy`, `canopyBow` (the windshield's frame), `spinner`, `blade1` to `blade5`, `wingLeft` and `wingRight` (centre section, outer panel with dihedral, winglet), `flapLeft`, `flapRight`, `aileronLeft`, `aileronRight`, `tailplane`, `elevator`, `fin`, `rudder`, and the gear, down: `gearNoseLeg`, `gearNoseWheel`, `gearMainLeftLeg`, `gearMainLeftWheel` and the right side's. Smooth-shaded, with a hard edge where faces meet at more than 40°, as the CT-156's are.
- **Named points (empties):** `datum` (the model origin), `eyeLeftSeat`, `eyeRightSeat`, and the hinges `aileronLeftHinge`, `aileronRightHinge`, `flapLeftHinge`, `flapRightHinge`, `elevatorHinge`, `rudderHinge`, `propAxis`, `gearMainLeftHinge`, `gearMainRightHinge` and `gearNoseHinge`. Each hinge's local X is its turning axis, and it carries `axis`, `positive` (which way a positive turn moves the part), `travel` and `source`. Each moving part is parented to its hinge, so turning the empty moves the part.
- **RCAF paint (13 Oct 2026, Dad's ask, not yet seen by Patrick):** navy spinner, cowl and nose with a white, red, white stripe running down the line just ahead of the windshield and aft along the lower fuselage; yellow everywhere else with a silver wing and tailplane leading edge; "202", "Canada" with a small flag, "RCAF", a roundel and "ARC" on the fuselage, a flag on the fin, roundels on the upper wings, red wheel hubs, a white light under each winglet root. Everything is read off Dad's photo of 202 (sources.md rows D7a to D7o); the roundel, flags and leaf are simple geometric stand-ins and the lettering is Blender's built-in face, so no artwork is copied. The photo's shape differences are in sources.md under "Fix list from the 202 photo", not built.
- **How it is painted:** one block of colours, boundaries and markings in the script's constants (`PAINT_RGB`, `NAVY_EDGE`, `STRIPE_BANDS`, `MARKS` and so on), drawn by the script into small generated pictures (packed into the `.blend`) and applied by position; no new libraries (it uses the numpy that `bpy` already brings).
- **This paint is for renders and checking.** For the CT-156, the paint and decals stay the app's code and the Blender file has plain colours (ALL-38). Whether the delivered Astra II carries its paint in the file or in the app is a question for Patrick at delivery (plan Step 3c item 6).
- No baked shadows or panel lines yet: those come with the High and Performance delivery (plan Step 3c item 6).

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

**The model files for the app** (Traffic plan Step 5c Phase 5; shared plan Step 3c item 6, first delivery: the outside and paint, no cockpit; Dad, 14 Oct 2026: "Export it now, refine later"): from a freshly built master,

```
<scratch>/bpy-venv/bin/python tools/blender/ct102b/export_ct102b.py -- <scratch>/ct102b.blend public/models
```

writes `public/models/ct102b-exterior.glb` (High: every part, the paint pictures full size; about 1.1 MB, about 44,000 triangles) and `ct102b-exterior-lite.glb` (the parts over 1,000 triangles decimated to 30 %, the paint pictures halved; about 0.47 MB). Both in feet, nose +X with the spinner tip at x 0, left +Y, up +Z (exported Z-up); `src/ui-kit/ct102b-model.js` loads them. Run it again after any change to the build script and commit the two files with it.

**Keep the `.blend` and the renders out of the repo.** Model files reach the app only as the two exported files above in `public/models/` (plan Step 3c item 6). Reference pictures are for measuring only and never go in the repo either, nor do overlay sheets made from them.

## Where the master lives

Until Dad's sessions can reach the private repo `3d-work`, the build script and the sources table live here and the `.blend` stays in the session's scratch folder. Once they can, the master moves to `3d-work/ct102b/` with its sources table, as the CT-156's did (ALL-38), and this folder keeps only what the app's side needs.
