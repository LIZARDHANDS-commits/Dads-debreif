# C-130J-30 Super Hercules in Blender

Dad's ask, Patrick approved 15 Oct 2026 (relayed by Dad): the T-38A's process applied to the C-130J (shared plan Step 3e, `docs/modules/shared/c130j-plan.md`). Dad's picks (15 Oct 2026): the stretched C-130J-30, in USAF grey with the Ramstein "RS" tail. This folder is the one writer's own (Dad's thread). It never edits a CT-156, Astra or T-38A file.

**Status:** first pass of the outside with a first paint pass, and the first delivery into the Debrief (V2.499, DB-35), 15 Oct 2026, **not yet seen by Patrick or Dad**. Sized to the published length, span and height; the shape inside them is measured off the line-art three-view Dad sent (C1, which draws the short C-130J) with the published 100 in and 80 in plugs put in, checked against his dimension drawing of the -30 (C3) (`sources.md` rows R1 to R15). What the pictures don't show (sections, struts, prop blades) is still an estimate.

| File | What it does |
|---|---|
| `sources.md` | Every number the build uses, with its source (public page, measured off the pictures, Dad's paint pictures, or "estimate"), where the sources disagree, how each picture was scaled, the size-check results, the overlay check and the fix list. |
| `build_c130j.py` | Builds the outside by script from the constants block at its top (each number names its row in `sources.md`), saves the master `.blend`, prints the size checks and the named points, and optionally makes the full renders, plain and painted. |
| `export_c130j.py` | Writes the model files the app loads from a built master (below). |

## What the master holds

- Real feet, the CT-156, Astra and T-38A scripts' axes: nose +X, left +Y, up +Z. The origin (`datum`) is the radome's tip, and the published length runs from it to the tail cone's tip. On the ground all the wheels touch z = −7.16 ft (`GROUND_Z`).
- **The stretch:** C1's shapes are measured in its own ("short") stations; the build puts the 100 in plug at short station 22.0 and the 80 in plug at 56.0 (`stretch()`), and the wing, nacelles, sponsons and main gear move back with the first plug, the tail with both. `short` after the render folder builds the short outline instead, for the overlay check against C1 only.
- **Parts:** `fuselage` (with the level top and the upswept aft body), `sponsonLeft` and `sponsonRight` (the main-gear fairings), `cargoRamp` and `cargoDoor` (closed), `flightDeckWindows`, `wingLeft` and `wingRight` (high, straight, tapered outboard of the centre wing, rising toward the tips as C1 and C3 draw it), `flapLeft`, `flapRight`, `aileronLeft`, `aileronRight`, `nacelle1` to `nacelle4`, `spinner1` to `spinner4`, `prop1` to `prop4` (six blades each, static), `tailplane`, `elevatorLeft`, `elevatorRight`, `fin`, `rudder`, and the gear, down: `gearNoseLeg`, `gearNoseWheels`, `gearMainLeftLegs`, `gearMainLeftWheels` and the right side's (tandem wheels). Engines are numbered 1 to 4 from the left outboard. Smooth-shaded, with a hard edge where faces meet at more than 40°.
- **Named points (empties):** `datum`, `tailTip`, `eyePilot`, `eyeCopilot`, and the hinges `aileronLeftHinge`, `aileronRightHinge`, `flapLeftHinge`, `flapRightHinge`, `elevatorLeftHinge`, `elevatorRightHinge`, `rudderHinge`, `cargoRampHinge`, `cargoDoorHinge`, `gearNoseHinge`, `prop1Hub` to `prop4Hub` (the props' axes), and `gearMainLeftSlide` and `gearMainRightSlide` (the main gear moves straight up, so these are slides, not hinges). Each one's local X is its axis, and it carries `axis`, `positive` (which way a positive move goes), `travel` (none set yet) and `source`. Each moving part is parented to its point, so turning (or sliding) the empty moves the part.
- **USAF paint, Ramstein "RS" (Dad's pick, not yet seen by Patrick or Dad):** grey overall; black "RS" on the fin under a stand-in flag; "U.S. AIR FORCE" on the forward fuselage; the low-visibility star-and-bar (a black outline) on the aft fuselage and on the wings; "USAF" under the left wing and over the right; black on the fin's lower leading edge, along the tailplane's leading edge and beside each nacelle on the wing's top; dark props and spinners. Read off Dad's photo (C2) and, for where things sit, the poster (C4) (sources.md D1 to D12). The insignia and flag are simple geometric stand-ins and the lettering is Blender's built-in face, so no artwork is copied. The serial can't be read on the photo, so it is left off.
- **How it is painted:** as the T-38A's: one block of colours and markings in the script's constants (`PAINT_RGB`, `MARKS`, `FIN_MARKS`, `WING_MARKS` and so on), drawn by the script into small generated pictures packed into the `.blend` and applied by position: from the side for the fuselage, sponsons, ramp, door, fin and rudder, from above and below for the wing and tailplane (uses the numpy that `bpy` already brings). Each part also keeps its plain colour names, which the plain renders use.
- No cockpit, no baked shadows or panel lines.

## Running it

Blender 5.2 LTS, without its window:

```
blender -b --factory-startup -P tools/blender/c130j/build_c130j.py -- <scratch>/c130j.blend <scratch>/renders
```

Or with Blender as a Python module (`bpy` 5.2.2 from PyPI, in a virtual environment outside the repo; it is a tool, never a project dependency):

```
<scratch>/bpy-venv/bin/python tools/blender/c130j/build_c130j.py -- <scratch>/c130j.blend <scratch>/renders
```

Leave off the render folder to build and save only (under a minute). With it, the saved master is opened again and the pictures are made with Cycles on the processor (about 3 minutes), into `renders/painted/` and `renders/plain/`: `c130j-quarter-front-left.png`, `c130j-quarter-rear-right.png`, `c130j-below.png`, and square-on `c130j-side.png`, `c130j-front.png` and `c130j-top.png` over a 1 ft grid (heavier lines every 5 ft; lines on whole feet from the radome tip, the centreline and the ground). The painted set adds `c130j-photo-angle.png`, near the angle of Dad's photo; the plain set adds `c130j-side-alpha.png`, `c130j-top-alpha.png` and `c130j-front-alpha.png`, the silhouettes the overlay sheets are made from (12 px per ft, centred on the length's and height's middles). Add `silhouettes` after the render folder to make only those, or `short` to build the short C-130J's outline and make only its silhouettes (into `renders/short/`) for the overlay on C1.

**Keep the `.blend`, the renders, the reference pictures and the overlay sheets out of the repo.** Model files reach the app only through the delivery into `public/models/`. The pictures are for measuring only.

## Where the master lives

Until Dad's sessions can reach the private repo `3d-work`, the build script and the sources table live here and the `.blend` stays in the session's scratch folder. Once they can, the master moves to `3d-work/c130j/` with its sources table, as the CT-156's did (ALL-38), and this folder keeps only what the app's side needs.

## The model files for the app

From a freshly built master (shared plan Step 3e item 6):

```
<scratch>/bpy-venv/bin/python tools/blender/c130j/export_c130j.py -- <scratch>/c130j.blend public/models
```

writes `public/models/c130j-exterior.glb` (High: every part, the paint pictures full size; about 1.35 MB, 57,600 triangles) and `c130j-exterior-lite.glb` (parts over 1,000 triangles decimated to 30 %, paint pictures halved; about 0.57 MB, 21,400 triangles). Both in feet, nose +X with the radome tip at x 0, left +Y, up +Z, the ground at `GROUND_Z` (exported Z-up); `src/ui-kit/c130j-model.js` loads them, and the Debrief's 3D Aircraft choice "C-130J Hercules" draws them (DB-35). There is no cockpit file: with the C-130J chosen, the Cockpit camera rides the CT-156 and says so. Run the export again after any change to the build script and commit the two files with it.
