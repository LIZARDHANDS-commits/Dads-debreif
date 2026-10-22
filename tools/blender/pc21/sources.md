# CT-157 Siskin II (Pilatus PC-21): sources table

Every number the build script (`build_pc21.py`) uses, with its source. The script keeps these numbers in one constants block, and each one names its row here (for example `S1`, `R7`, `E12`, `D2`). Shared plan Step 3f, items 1, 2 and 5 (`docs/modules/shared/plan.md`, `docs/modules/shared/pc21-plan.md`).

**Status:** first pass of the outside with the RCAF paint of 201, proposed, built ahead of Patrick's yes (Dad, 17 to 18 Oct 2026), **not yet seen by Patrick or Dad**. **No manual page is used:** there is no PC-21 manual in the project files. The numbers below are printed on the Pilatus three-view Dad sent (S), measured off it (R), read off Dad's renders by eye (D) or estimates (E).

## The pictures Dad sent (18 Oct 2026), measuring only

None of these is copied into the repo or the site; only numbers measured off them come in.

| # | What | Use |
|---|---|---|
| S1 | Pilatus three-view with dimensions (2000 × 1413 px): head-on view top left, side view top right, underside view bottom left, top view bottom right | the printed sizes (rows S1) and the measured outline (rows R) |
| S2 | A side drawing with canopy stations (CAN 1 to CAN 5) and frames, the gear and an "empty weight" ground line | canopy frames, gear legs, by eye |
| S3 | A render of RCAF CT-157 201 seen from above, nose left | the paint and markings (rows D) |
| S4 | A render of 201 from ahead and to the left | the paint and markings |
| S5 | A render of 201 from behind and to the right | the paint, the right side's markings, the right wing's "201" |

Dad's message also spoke of a head-on view and an underside view; the session's folder held only these five pictures, so the three-view's own head-on and underside panels stood in for them.

## Printed on the three-view (S1)

Units as printed; feet at 0.3048 m per foot.

| Row | What | Value |
|---|---|---|
| S1 | Length (spinner tip to tail cone) | 36 ft 10 in (11.22 m) |
| S1 | Span | 29 ft 11 in (9.11 m) |
| S1 | Height | 12 ft 4 in (3.75 m) "typical" (see R16: the drawing itself measures about 13 ft 4 in) |
| S1 | Wing area | 163.85 ft² (15.22 m²) |
| S1 | Propeller diameter | 7 ft 10 in (2.39 m); five blades on the head-on and side views |
| S1 | Main wheel track | 8 ft 10 in (2.69 m) |
| S1 | Wheelbase | 7 ft 11 in (2.41 m) |
| S1 | Tailplane span | 13 ft 2 in (4.00 m) |
| S1 | Fuselage width | 3 ft 3 in (1.00 m) |

Public figures used by the performance set (not by the model) are in `src/core/ct157-performance.js` and Traffic spec 4.20.

## Measured off the three-view (R)

Measured in Python (PIL) on the 2000 px picture, at about 1 to 2 px (0.05 to 0.1 ft). **How each view was scaled:** the views agree with each other and with their printed sizes within about 4%, but not exactly, so each is scaled by its own printed size, as the Astra's three-view was: the side view by its length (855 px between the dimension's extension lines: 23.21 px/ft), the top view by its length and span (852 px and 690 px: 23.1 px/ft), the head-on view by its span (676 px: 22.60 px/ft). The prop disc on the head-on view is round (175 by 173 px), so the picture is not stretched. Stations are feet behind the spinner's tip, heights feet above the propeller's axis, "out" feet from the centreline.

| Row | What | Measured | Notes |
|---|---|---|---|
| R1 | Propeller axis above the ground | **4.72 ft** (side view, the spinner tip at y 252, the ground line at 361.5); head-on 4.80 ft | Prop tip 0.81 ft (9.7 in) off the ground |
| R2 | Spinner and blades | A long pointed spinner: radius 0.36 ft at 0.5 ft, 0.55 at 1.0, 0.70 at 1.5, 0.80 at 2.0, 0.88 at 2.5, 0.90 at 2.75 (side and top views agree within 0.05 ft). Blades' plane at **2.26 ft**; blade about 0.5 to 0.6 ft wide | The spinner's own join to the cowl is not drawn; the build ends it at 2.75 ft |
| R3 | Fuselage half-widths, top view | 0.5 ft: 0.37; 1.0: 0.54; 2.0: 0.80; 3.0: 0.95; 3.5: 1.04; (4 to 5 hidden by the exhausts); 5.5: 1.34; 6.0: 1.43; 7.0: 1.56; 7.5 to 19.5: 1.60 to 1.69; 20: 1.64; 22: 1.56; 24: 1.38; 26: 1.21; 27.5: 1.08; then inside the tailplane's lines to the tip at 36.85 | The build trims the widest to 1.625 ft so the width is the printed 3 ft 3 in |
| R4 | Fuselage top and bottom, side view | Top: 3.0 ft +1.03; 4.0 +1.21; 5.0 +1.38; 6.0 +1.55; 7.0 +1.68; 8.0 +1.85; 9.0 +1.98; windshield foot 9.5 +2.07; behind the canopy the spine 21.5 +4.05, 23 +3.75, 24.5 +3.62, then the fuselage's top under the fin falling to +2.42 at the rudder (34.6); the tail cone's tip at 36.85, +2.0. Bottom: the chin steps down from −0.9 at 3.0 ft to −1.59 at 3.5; −1.81 from 5 to 14 ft; aft of the wing the belly sweeps up: 20 −1.38, 22 −1.08, 23.5 −0.82, 25.5 −0.43, 28 0.0, 30 +0.15, 34 +0.5, to the tip | The rear fuselage is deep and narrow and its tip sits high, as the renders show |
| R5 | Canopy | One piece from the windshield's foot (9.5 ft, +2.07) to its aft end (21.3 ft); top +2.95 at 10.8, +3.53 at 12, +4.26 at 14, **+4.74 from 17 to 18**, +4.44 at 20, +4.16 at 21. The sill (the frame's lower edge) dips to +1.68 at 10.8 ft and rises aft in a straight line to +2.97 at 20 ft. Top view: 9.6 to 22.3 ft, about 2.5 ft wide | The build makes the bubble as wide as the fuselage at the sill's height (E3) |
| R5a | Frame between the seats | Side view: a double line from 15.3 to 16.0 ft (slanting forward at its foot); top view: 15.4 to 16.1 ft. Built 15.45 to 15.85 ft | |
| R6 | Exhaust stacks | Side view: an oval from 3.2 to 5.2 ft, about 0.9 ft tall, level with the axis; top view: out to 2.33 ft at 4.5 ft, curving aft from the cowl's side | Built as a bent pipe; the real stacks' shape and their bronze colour are by eye |
| R7 | Wing planform, top view | Leading edge at **11.31 ft** on the centreline, swept back **0.250 ft per ft out (14.0°)**; trailing edge at **18.97 ft**, nearly straight (forward 0.036 ft per ft); the root fillet kinks the trailing edge aft to about 19.7 ft at the fuselage's side (1.65 ft out); the leading edge rounds into the tip from 14.2 ft out | Area by straight lines to the tip 165.2 ft² against the printed 163.85 (+0.8%); with the root kink and through the fuselage 169 ft² |
| R8 | Wing heights, head-on view | The chord line at −1.19 ft at 2.7 ft out and −0.44 ft at 13.4 ft out: **4.0° of dihedral**, −1.38 ft on the centreline; thickness about 1.0 ft at the root and 0.48 ft near the tip (about 13%); outboard of about 13.9 ft the tip bends up (−0.13 ft at the tip against −0.33 on the line), built as **15°** | |
| R9 | Flaps and ailerons, top view | Flaps from 2.4 to 8.3 ft out, the aft 25%; ailerons from 8.4 to 13.9 ft out, the aft 27% | Read off the drawing's grey lines; the hinges' travel has no source |
| R10 | Tailplane planform, top view | Leading edge at **31.78 ft** on the centreline, swept **0.278 ft per ft (15.5°)**; trailing edge at about **36.0 ft**, nearly straight; tip rounded from 6.0 ft out; elevator hinge straight across at **34.9 ft**. Span 13.26 ft measured against the printed 13 ft 2 in (13.17): the build uses the printed span | |
| R11 | Tailplane height | +1.86 ft (head-on), +1.94 ft (side view's lozenge); built at **+1.90**; about level on the head-on view | E7 adds 1° of dihedral |
| R12 | Fin, side view | Dorsal fillet's leading edge from +3.62 ft at 24.5 ft to +4.45 ft at 29.8 ft; the fin's leading edge from there to +8.06 ft at 31.73 ft (about 28° back from upright), rounding into a flat top at **+8.66 ft** from 32.6 to 34.6 ft; the rudder's trailing edge upright at **34.6 ft** | Heights as drawn; the build lowers them (R16) |
| R13 | Rudder hinge, side view | From 33.07 ft at +7.07 ft to 32.42 ft at +2.76 ft (heights as drawn) | |
| R14 | Ventral strakes | Side view: small fins below the belly at about 23.5 to 25.5 ft; underside view: a pair either side of the centreline | Built as two canted plates (E12 for the size and cant) |
| R15 | Wheels and legs | Nose wheel about **1.64 ft** across, main wheel about **1.90 ft**; main tyre about 0.6 ft wide (head-on). Drawn wheel centres at 7.54 ft (nose) and 15.83 ft (mains): 8.29 ft apart against the printed 7 ft 11 in. The build keeps the printed wheelbase centred on the drawn pair: **7.73 ft and 15.65 ft** | Legs: E13 to E15 |
| R16 | **Height: the drawing against its own label** | Side view at its length's scale: the fin's top 8.66 ft above the axis, 4.72 ft below to the ground: **13.38 ft (4.08 m)**. Head-on view at its span's scale: **13.24 ft (4.04 m)**. The label says 12 ft 4 in (3.75 m) "typical" | The two views agree with each other and not with the label (about 1 ft taller). **The build takes the printed 12 ft 4 in** (the Astra's rule: printed sizes are the targets) by lowering everything on the fin above +3.0 ft by 0.815 (`FIN_SCALE`), keeping the measured fuselage, canopy, gear and prop clearance. **To rule (Patrick or Dad):** set `HEIGHT_FT` to 13.38 to build the fin as drawn |

## Estimates (E)

| Row | What | Value | Why |
|---|---|---|---|
| E1 | Blade root | 0.70 ft out from the axis | where the blade leaves the spinner |
| E2 | Blade angles | 48° at the root, 18° at the tip, from the disc's plane | a feathering propeller at rest is coarser; for the look only |
| E3 | Deck under the canopy | the fuselage's top 0.45 ft above the sill | so the bubble's base is about the top view's 2.5 ft wide |
| E4 | Fuselage section | superellipse power 2.5 | the head-on view's rounded square |
| E5 | Canopy section | superellipse power 3.0 | rounded, a little flatter than a circle |
| E6 | Wing section | NACA 4-digit, 13.5% at the root, 13% at the tip, 2% camber | the thicknesses are R8; the section itself has no source |
| E7 | Tailplane dihedral | 1° | the drawing shows it about level; Dad's brief says "slight dihedral" |
| E8, E10 | Tailplane and fin thickness | 10% and 0.11 ft | |
| E9 | Fin root | built down into the fuselage from +2.0 ft | |
| E11 | Where the fin's lowering starts | +3.0 ft, about the fuselage's top under the fin | R16 |
| E12 | Strakes | 3.6 ft long, 0.55 ft deep, canted out 35°, 0.55 ft either side of the centreline | R14 places them; their size is by eye |
| E13 to E15 | Gear legs | main leg from under the wing just outboard of the wheel, 0.14 ft radius; nose leg from 1.55 ft below the axis, 0.12 ft radius; both fold as the Astra's are said to (not confirmed for the PC-21) | the drawings show the legs only roughly (S2) |
| E16 | Eye points | front seat at 14.3 ft, +3.25 ft; rear seat at 18.3 ft, +3.65 ft (raised: tandem, stepped) | from the pilots in the renders and the side drawing; for later cameras |
| E17 | Datum | the model's origin, the spinner tip on the axis | not the weighing datum |

## Paint of 201 (D, read off S3 to S5 by eye; every colour and place is an estimate)

| Row | What | As built |
|---|---|---|
| D1 | Spinner and blades | yellow spinner, dark blades to the tip |
| D2 | The fuselage's yellow and navy | yellow over the nose, the top of the forward fuselage and round the canopy; navy below and behind a line from low behind the spinner (2.6 ft, −0.8) rising gently under the canopy (14 ft, +0.58; 19 ft, +1.38) and sweeping up over the top just behind the canopy (21.4 ft, +3.5) |
| D3 | The stripe | white 0.06 ft, red 0.28 ft, white 0.06 ft, along that line on the navy side |
| D4a, D4b | Nose | "201" in navy on the yellow below the windshield (8.0 ft); a white bar ahead of it near the top (6.4 ft) |
| D4c | Rescue triangles | red, point down, white-edged, below each cockpit (12.6 ft and 18.6 ft) |
| D4d | "Canada" | navy, under the rear cockpit (15.9 ft), a small flag at the end of the word |
| D4e | RCAF badge | "RCAF", a roundel and "ARC" in white on the navy rear fuselage (23 to 26 ft), with a white bar under; on the right side the words read the same left to right (RCAF aft), as S5 shows |
| D4f | Fin | a Canadian flag with "157201" under it, white, mid-fin |
| D5 | Wings' top | yellow ahead of and outboard of a straight stripe (the fuselage's stripe colours) from the root at 45% of the chord to the trailing edge 10 ft out; navy inboard and behind; a roundel near the left wing's tip; "201" in navy on the right wing, reading from behind |
| D6 | Undersides | navy, with yellow wingtips (outboard of 13.2 ft) and tailplane tips (outboard of 5.6 ft) |
| D7 | Not drawn | the white bar along the fin's leading edge, the walkway and stencils, antennas, lights, the "Canada" on the wings' undersides the renders seem to show |

The roundels, flags and leaf are simple geometric stand-ins (rings, bands, an 11-lobed star) and the lettering is Blender's built-in face: no artwork is copied.

## Size checks (build output, 18 Oct 2026)

| What | Model | Printed (S1) | Difference |
|---|---|---|---|
| Length | 36.78 ft | 36.83 ft | −0.05 ft (−0.6 in): the tail cone's last ring is 0.03 ft short of its point |
| Span | 29.84 ft | 29.92 ft | −0.08 ft (−1.0 in): the rounded tip's last section |
| Height | 12.31 ft | 12.33 ft | −0.02 ft (R16: the drawing's 13.4 ft is not built) |
| Tailplane span | 13.17 ft | 13.17 ft | 0 |
| Main track, wheelbase | 8.83 ft, 7.92 ft | 8.83 ft, 7.92 ft | 0 |
| Prop diameter | 7.83 ft | 7.83 ft | 0 |
| Fuselage width | 3.25 ft | 3.25 ft | 0 (trimmed, R3) |
| Wing area | 165.2 ft² (straight lines to the tip); 169 ft² with the root kink, through the fuselage | 163.85 ft² | +0.8% / +3% |

## Fix list (for Patrick and Dad, from the renders)

1. **Height** (R16): the label's 12 ft 4 in or the drawing's 13 ft 4 in fin.
2. The wing root fairing and the root fillet ahead of the leading edge are not modelled.
3. The gear legs, doors and the main gear's trailing link are simple rods (S2 shows them roughly).
4. The spinner's join, the cowl's intake under the spinner and the exhausts' real shape are by eye.
5. Paint places are by eye; the stripe's run onto the wing root, and the markings' sizes, to be checked against photos.
6. No cockpit, no lights, no antennas; the canopy is opaque tinted glass.
