# CT-157 Siskin II (Pilatus PC-21) model and performance: plan (proposed)

> **Status:** proposed, built ahead of Patrick's yes (Dad, 17 to 18 Oct 2026). Dad asked: "Lets build a PC-21", then "3d Model for the pattern sim like the grob". It is Step 3f here (`plan.md`) and Step 5d of Traffic's plan (`../traffic/plan.md`), built the way the CT-102B Astra II was (Step 3c, `ct102-astra-plan.md`; Traffic Step 5c): its own Blender model and its own performance set. **Patrick's yes is still needed** for all of it, and real PC-21 numbers (a manual in the project files, or his ruling) for the performance set. Nothing here has been seen by Patrick or Dad in the app yet.

## What it is

- **A 3D model** of the RCAF CT-157 Siskin II (the Pilatus PC-21), built by a Blender script in real feet, every size carrying its source in a sources table (`tools/blender/pc21/sources.md`), in the RCAF yellow and navy of aircraft 201. The app takes only the two exported files in `public/models/` (a High file for the aircraft followed, a light file for the rest), as for the Astra.
- **A performance set** (`src/core/ct157-performance.js`) through the one set of formulas every aircraft uses (`makePerformance`), never a second copy of a formula. Every number is a public figure (unchecked) or an estimate with its working, listed so the screen flags it.
- **Traffic flies it in Pattern 1**, the CT-156's overhead break (Traffic spec 4.20): it is a CT-156-class aircraft at 15 Wing, and its type profile already names Pattern 1 at the CT-156's speeds. It is offered in the spawner's Type list.

## Which aircraft

The CT-157 Siskin II is the RCAF's name for the Pilatus PC-21, the advanced turboprop trainer of the Future Aircrew Training programme (SkyAlyne), to be based at 15 Wing Moose Jaw (public news reports, read through search summaries, unchecked). The paint is the RCAF scheme of aircraft 201 (serial 157201) in the renders Dad sent.

## The public numbers

No PC-21 manual is in the project files (`/mnt/project-files/manuals/` does not exist in this session), so no number here is a manual number. Public pages could not be opened from this session (the network blocks bazl.admin.ch and pilatus-aircraft.com; Wikipedia does not resolve): every "public" number was read through web-search summaries only and is **unchecked** until someone opens the page.

| What | Value | Source |
|---|---|---|
| Length, span, height | 36 ft 10 in (11.22 m), 29 ft 11 in (9.11 m), 12 ft 4 in (3.75 m) "typical" | Dad's three-view (Pilatus drawing, 18 Oct 2026) |
| Wing area | 163.85 ft² (15.22 m²) | Dad's three-view |
| Propeller | 7 ft 10 in (2.39 m) diameter; five blades | Dad's three-view (diameter); the renders and drawing show five blades |
| Main gear track, wheelbase | 8 ft 10 in (2.69 m), 7 ft 11 in (2.41 m) | Dad's three-view |
| Tailplane span, fuselage width | 13 ft 2 in (4.00 m), 3 ft 3 in (1.00 m) | Dad's three-view |
| Engine | Pratt & Whitney Canada PT6A-68B; take-off and maximum continuous 1,600 shp at high airspeed, **1,080 shp at low airspeed** (automatic limiting with airspeed); climb and cruise 1,425 shp high, 962 shp low | FOCA (Swiss) type certificate data sheet F56-35, issue 9 (2 Feb 2026), as quoted by search; the speed where the power changes is not given |
| Basic empty weight | 2,280 kg (5,027 lb), "depending on configuration" | Pilatus PC-21 factsheet, as quoted |
| Maximum take-off weight | 3,100 kg (6,834 lb) aerobatic; 4,250 kg utility (the FOCA sheet and the RAAF page give 3,900 kg) | Pilatus factsheet; FOCA sheet; RAAF page; they disagree on the utility figure, which is not used |
| G limits | +8.0 / −4.0 aerobatic; +5.0 / −2.5 utility; +4.0 with flap out | Pilatus factsheet and FOCA sheet issue 9, as quoted |
| Stall speeds | 92 KCAS flaps and gear up; 81 KCAS flaps and gear down (weight not given) | Pilatus factsheet, as quoted |
| Rate of climb | 4,091 ft/min at sea level | Pilatus factsheet, as quoted (other sites round it to 4,000) |
| Speeds | maximum operating 370 KEAS; cruise 323 KTAS at sea level, 337 KTAS at 10,000 ft; design dive 420 kt, Mach 0.77 | Pilatus factsheet and FOCA sheet, as quoted. The brief's "about 370 KTAS at low level" is the 370 KEAS operating limit, not a level speed |
| Roll rate | 200°/s at 10,000 ft | Pilatus factsheet, as quoted; RAAF page "in excess of 200 degrees per second" |

## Reference pictures Dad sent (18 Oct 2026), measuring only

Kept in the session's scratch folder, never in the repo or on the site:

| # | What it is | Use |
|---|---|---|
| S1 | Pilatus three-view with dimensions: head-on, side, top and underside | every size above, and the outline measured off each view at its own scale (rows R in `sources.md`) |
| S2 | A side drawing with canopy stations and frames | canopy frames, gear legs and the fuselage line, by eye |
| S3 to S5 | Renders of the RCAF CT-157, number 201, from above-left, front-left and rear-right | the paint and markings, by eye (rows D in `sources.md`) |

Dad's message spoke of a separate head-on view and underside view; the folder held no files besides these five, and the three-view's own head-on and underside panels were used for both. The renders and drawings are others' artwork: only measured numbers come in, never the pictures, and the roundels, flags and leaf are simple geometric stand-ins.

## The steps (the Astra's, in order)

Each step is one piece of work in this repo by Dad's thread (one writer: `tools/blender/pc21/`, `public/models/ct157-*`, `src/ui-kit/ct157-model.js`, `src/core/ct157-performance.js`), with Patrick's yes before the next starts. Steps 1, 2, 5, 6 and the performance set were built together ahead of his yes (Dad, 17 to 18 Oct 2026).

0. **Patrick's yes**, and the answers below.
1. **Sources table:** the public numbers above, then the outline measured off S1, each view scaled on its own to its printed size; estimates marked. *Built, proposed.*
2. **First outside in Blender,** by script in real feet: fuselage with the long nose and the exhaust stacks, five-blade propeller, bubble canopy with the frame between the seats, swept fin with a dorsal fillet, ventral strakes, tailplane with slight dihedral, the tapered wing with its kinked trailing edge and upturned tips, the tricycle gear down; named points (datum, both eye points) and hinges; size checks on length, span, height, wing area, track and wheelbase. *Built, proposed.*
3. **Renders and a fix list** from Patrick and Dad (both quarters, below, square-on side, front and top over a 1 ft grid). *Renders made, kept out of the repo; the fix list is still to come.*
4. **Refine,** before and after from the same views.
5. **Paint:** the RCAF scheme of 201 (yellow over the nose, top of the forward fuselage and outer wing tops; dark navy rear fuselage, tail and inner and rear wing; a red stripe edged in white sweeping down the side and across the wings; "201", "Canada", the RCAF/ARC badge, roundels, the flag and 157201 on the fin, rescue triangles). Colours and places are estimates read off S3 to S5. *Built, proposed.*
6. **First delivery:** `public/models/ct157-exterior.glb` and `ct157-exterior-lite.glb`, loaded by `src/ui-kit/ct157-model.js` with the stand-in until the file is in; first used in Traffic (spec 4.20). *Built, proposed.*
7. **Cockpit,** later, once the outside is signed off.

## Questions for Patrick (one at a time; his idea is always an option)

1. **Is the CT-157 wanted in Traffic now, flying Pattern 1?**
   - (a) yes, in Pattern 1 at the CT-156's speeds, as built (working answer);
   - (b) yes, but with its own pattern numbers (speeds, heights) from Patrick or a PC-21 manual;
   - (c) not yet: keep the model and set, take it out of the spawner;
   - (d) your idea.
2. **Its performance numbers:** add a PC-21 manual to the project files, or rule on the numbers in Traffic spec 4.20's table. Working answer: the public figures and estimates, flagged " · est." on screen.
3. **Its manoeuvres off the pattern** (closed pattern, breakout, High Key, PFL) are flown today on the CT-156's numbers, its PFL on the T-6A's glide data. Working answer: (a) keep them, flagged; (b) hide High Key and the PFL for the CT-157 until PC-21 glide numbers come; (c) your idea.
4. **Where the paint lives** (in the file, as for the Astra, or in the app's code, as for the CT-156 under ALL-38). Working answer: in the file.

## When data fails

The model is a picture only: a missing, damaged or slow model file leaves the stand-in drawn at the CT-157's length in its colour, and the 3D view keeps running (ALL-38 (4)), as for the Astra. The performance set has every number it needs; it has no glide data and no stick-shaker margin, so those functions refuse rather than invent one (Traffic spec 4.20).

## Not in this plan

Its own cockpit and instruments, the propeller's blur disc and moving surfaces in Traffic, its own Pattern 1 track built with its own thrust and drag, its own PFL glide numbers, a Mixed scenario. Each goes on `../traffic/future.md` until Patrick moves it up.
