# T-38A Talon in Blender

Dad's ask, Patrick approved 14 Oct 2026 (relayed by Dad): the Astra's process applied to the T-38A (shared plan Step 3d, `docs/modules/shared/t38a-plan.md`), in the Beale AFB 9th Reconnaissance Wing paint. This folder is the one writer's own (Dad's thread). It never edits a CT-156 or Astra file.

**Status:** first pass of the outside with a first paint pass, and a first pass of the rough front and rear cockpits (plan Step 3d item 7; Dad, 14 Oct 2026: "now lets workout the rough T-38A cockpit"), 14 Oct 2026, **not yet seen by Patrick or Dad**. Sized to the published length, span and height; the wing is the textbook planform (`sources.md` P3); the shape inside them is measured off the two scaled drawings Dad sent (Peeters' 1/72 drawings and Cullen's three-view; rows R1 to R12), and what the drawings don't show (gear pivots, sections, the cockpit) is still an estimate.

| File | What it does |
|---|---|
| `sources.md` | Every number the build uses, with its source (public page, measured off the drawings, Dad's Beale pictures, or "estimate"), where the sources disagree, how each drawing was scaled, the size-check results, the overlay check and the fix list. |
| `build_t38.py` | Builds the outside and the two cockpits by script from the constants block at its top (each number names its row in `sources.md`), saves the master `.blend`, prints the cockpit's eye checks, the size checks and the named points, and optionally makes the full renders, plain and painted, or only the cockpit renders. |
| `export_t38.py` | Writes the model files the app loads from a built master (below). |

## What the master holds

- Real feet, the CT-156 and Astra scripts' axes: nose +X, left +Y, up +Z. The origin (`datum`) is the radome's tip, where the pitot boom starts; the boom reaches 2.16 ft ahead of it, and the published length runs to the boom's tip. The X axis is the ground line of Peeters' side view: on the ground, all three wheels touch z = −4.71 ft.
- **Parts:** `fuselage` (with the area-ruled waist), `spine` (the dorsal fairing behind the canopy), `intakeLeft` and `intakeRight` (with open ducts), `pitot`, `windshield`, `canopyFront`, `canopyRear` and their frames (`canopyFrameWindshield`, `canopyFrameSplit`, `canopyFrameAft`, `canopySill`), `wingLeft` and `wingRight`, `flapLeft`, `flapRight`, `aileronLeft`, `aileronRight`, `tailplane` (all-moving, one piece), `fin`, `rudder`, `nozzleLeft` and `nozzleRight` (bare metal, open), `speedBrakeLeft` and `speedBrakeRight` (closed), and the gear, down: `gearNoseLeg`, `gearNoseWheel`, `gearMainLeftLeg`, `gearMainLeftDoor`, `gearMainLeftWheel` and the right side's. Smooth-shaded, with a hard edge where faces meet at more than 40°, as the CT-156's are.
- **Named points (empties):** `datum`, `pitotTip`, `eyeFront`, `eyeRear`, and the hinges `aileronLeftHinge`, `aileronRightHinge`, `flapLeftHinge`, `flapRightHinge`, `tailplanePivot`, `rudderHinge`, `speedBrakeLeftHinge`, `speedBrakeRightHinge`, `gearNoseHinge`, `gearMainLeftHinge` and `gearMainRightHinge`. Each hinge's local X is its turning axis, and it carries `axis`, `positive` (which way a positive turn moves the part), `travel` (none set yet) and `source`. Each moving part is parented to its hinge, so turning the empty moves the part.
- **Beale paint (14 Oct 2026, Dad's pick, not yet seen by Patrick or Dad):** gloss black overall; red "U.S. AIR FORCE" on the intake, a red outline star-and-bar, a red code letter "U" aft, a red rescue arrow and stencil block under the canopy; on the fin a red top band with five dark stars, a small red shield outline for the unit badge, red "BB" and the serial "247" with a small "AF"; bare-metal tail cone and nozzles; clear canopy with black frames. Read off Dad's profile print (T6) and photo (T7) (sources.md D1 to D13). The badge and insignia are simple geometric stand-ins and the lettering is Blender's built-in face, so no artwork is copied. The serial's year digits can't be read on the photo, so they are left off.
- **How it is painted:** as the Astra's: one block of colours and markings in the script's constants (`PAINT_RGB`, `MARKS`, `FIN_MARKS` and so on), drawn by the script into small generated pictures packed into the `.blend` and applied by position (uses the numpy that `bpy` already brings). Each part also keeps its plain colour names, which the plain renders use.
- **This paint is for renders and checking.** Whether the delivered T-38A carries its paint in the file or in the app is a question for Patrick at delivery (plan Step 3d item 6).
- **Cockpits (first pass, "rough": shapes and layout, no working instruments; not yet seen by Patrick or Dad):** in the `cockpit` collection, front and rear, each with `cockpit<Seat>Panel` (the instrument panel's face, its gauges drawn as simple flat faces into a generated picture in the positions read off Dad's cockpit pictures), `GlareShield`, `Pedestal`, `FootwellCeiling`, the AOA indexer and its lamps, `ConsoleLeft` and `ConsoleRight` with their pictured tops, the throttles, the seat (`SeatCushions`, `SeatFrame`, `SeatHeadPad`, `Harness`, `Buckle`, `SeatHandles`), the stick (`StickBoot`, `StickShaft`, `StickGrip`), `Pedals` and `Floor`; the rear one adds `cockpitRearShroud` over the front seat's back. The front cockpit adds the gear lever and its knob, the bow's two mirrors and the standby compass; `cockpitInterWindscreen` is the rear cockpit's own windscreen. The rear cockpit is the front one moved with the eye points, its panel a little higher (`sources.md` K8). Every size is an estimate (E12 to E22); what sits where is read by eye off Dad's pictures (K1 to K11), nothing copied.
- **The outside's part of it:** the fuselage's top is cut away over the cockpits and `cockpitWell`, a plain tub (walls, floor with the rear seat's step, the footwell's front, the bulkhead behind the rear seat), closes it; the canopy glass is an open shell and the bows (`canopyFrame…`) are arches, so they read right from a seat.
- No baked shadows or panel lines yet.

## Running it

Blender 5.2 LTS, without its window:

```
blender -b --factory-startup -P tools/blender/t38/build_t38.py -- <scratch>/t38.blend <scratch>/renders
```

Or with Blender as a Python module (`bpy` 5.2.2 from PyPI, in a virtual environment outside the repo; it is a tool, never a project dependency):

```
python3 -m venv <scratch>/bpy-venv
<scratch>/bpy-venv/bin/pip install bpy==5.2.2
<scratch>/bpy-venv/bin/python tools/blender/t38/build_t38.py -- <scratch>/t38.blend <scratch>/renders
```

Leave off the render folder to build and save only (under a minute). With `cockpit` after the render folder, only the cockpit renders are made (about 6 minutes), into `renders/cockpit/`: `t38-eye-front.png` and `t38-eye-rear.png` from each eye looking ahead (55° across the picture's height, as the Debrief's Cockpit camera starts), `-down` versions 15° down onto the panel, `t38-above-behind.png` from above and behind the front seat with the canopies away (near Dad's photo T9), and `t38-cutaway-side.png`, square-on from the left, sliced 0.75 ft left of the centreline. With it, the saved master is opened again and the pictures are made with Cycles on the processor (about 15 minutes on 4 cores), into `renders/painted/` and `renders/plain/`: `t38-quarter-front-left.png`, `t38-quarter-rear-right.png`, `t38-below.png`, and square-on `t38-side.png`, `t38-front.png` and `t38-top.png` over a 1 ft grid (heavier lines every 5 ft; lines on whole feet from the radome's tip, the centreline and the ground). The painted set adds `t38-photo-angle.png`, near the angle of Dad's photo; the plain set adds `t38-side-alpha.png` and `t38-top-alpha.png`, the silhouettes the overlay sheets are made from (40 px per ft, centred on the length's and height's middles). Add `silhouettes` after the render folder to make only those two (about a minute), when fitting the shape to the drawings.

**Keep the `.blend`, the renders, the reference pictures and the overlay sheets out of the repo.** Model files reach the app only through the delivery into `public/models/` (plan Step 3d item 6). The drawings and photos are for measuring only.

## Where the master lives

Until Dad's sessions can reach the private repo `3d-work`, the build script and the sources table live here and the `.blend` stays in the session's scratch folder. Once they can, the master moves to `3d-work/t38/` with its sources table, as the CT-156's did (ALL-38), and this folder keeps only what the app's side needs.

## The model files for the app

From a freshly built master (shared plan Step 3d item 6; Dad, 14 Oct 2026: "add it into the KML as a choice for how to display aircraft"):

```
<scratch>/bpy-venv/bin/python tools/blender/t38/export_t38.py -- <scratch>/t38.blend public/models
```

writes `public/models/t38a-exterior.glb` (High: every part, the paint pictures full size; about 1.4 MB), `t38a-exterior-lite.glb` (parts over 1,000 triangles decimated to 30 %, paint pictures halved; about 0.5 MB) and `t38a-cockpit.glb` (the `cockpit` collection only, about 0.3 MB). The cockpit is its own file so it loads only when the Debrief's Cockpit camera first rides a T-38A (DB-33), and both outside files stay free of its detail (they keep only the opening and the plain tub). Both in feet, nose +X with the radome tip at x 0, left +Y, up +Z, the ground at `GROUND_Z` (exported Z-up); `src/ui-kit/t38a-model.js` loads them. Run it again after any change to the build script and commit the two files with it.
