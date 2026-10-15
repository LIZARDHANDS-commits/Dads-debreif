# C-130J Super Hercules model: plan (approved)

> **Status:** approved: Patrick said yes (relayed by Dad, 15 Oct 2026: "pat  yes"). Dad asked on 15 Oct 2026: "lets do a model for KML viewer for the C-130J", with four reference pictures. It would be Step 3e of `plan.md`, built the way the T-38A is (Step 3d, `t38a-plan.md`), which follows the Astra's (Step 3c) and the CT-156's process (`Pat's claude work/dad-setup/how-we-built-the-ct156-model.md`, ALL-31 to ALL-38).

## What it would be

A C-130J model built by a Blender script in real feet, with every size carrying its source in a sources table. The app takes only the exported model files (a High file for the aircraft followed, a light file for the rest). The first delivery is the outside and paint; no cockpit unless Patrick asks for one. Like the T-38A and the Astra, it lives in `tools/blender/c130j/` while Dad's sessions can't reach `3d-work` (ALL-38 says the master belongs there; Patrick can ask for it to move).

## Where it would be used

Dad's pick: the Debrief (the KML viewer). The 3D settings' Aircraft select (DB-32, built with the T-38A) gains "C-130J Hercules" beside "Harvard (CT-156)", "T-38A Talon" and "Flat marker": every ship is drawn as the C-130J at its own size, in the overview and in Chase. Nothing flies: the track gives position and height. The SOF's live traffic could follow later (its stand-in today draws any non-T-6, C-130s included).

## The public numbers (first rows of the sources table)

| | C-130J-30 (stretched) | C-130J (short) |
|---|---|---|
| Length | 112 ft 9 in (34.37 m, RCAF CC-130J fact sheet; 403rd Wing fact sheet 34.69 m) | 97 ft 9 in (403rd Wing fact sheet) |
| Span | 132 ft 7 in (40.38 m, RCAF CC-130J fact sheet; 40.4 m, DND procurement page) | same |
| Height | 38 ft 9 in (11.81 m, RCAF CC-130J fact sheet); 38 ft 10 in (403rd Wing, Yokota); 39 ft 5 in (AMC fact sheet) | same |
| Tailplane span | 52 ft 8 in (16.05 m, the dimension drawing Dad sent, picture C3) | same |
| Engines and props | four Rolls-Royce AE 2100D3, six-blade props (public; to be checked against a fact sheet) | same |

Sources: the RCAF CC-130J fact sheet (canada.ca, rcaf-arc fact-sheet-cc-130j-hercules-j.pdf), the DND CC-130J procurement page, and the USAF fact sheets of the 403rd Wing, Yokota AB and AMC, read through search summaries on 15 Oct 2026, not yet opened page by page. The heights disagree by up to 8 in; the model would use 38 ft 9 in (RCAF, and Dad's drawing) until Patrick picks. None is a manual figure.

## Reference pictures Dad sent (15 Oct 2026), measuring only

Kept in the session's scratch folder, never in the repo or on the site:

| # | What it is | Use |
|---|---|---|
| C1 | A line-art three-view (side, top, front), "Lockheed_C-130J_Hercules_3-svg vector file" | the clearest outline: plan view, side profile, front view with the prop discs; each view scaled on its own to the public length and span |
| C2 | A photo of a USAF C-130J-30 in flight from below, "RS" tail (Ramstein), "USAF" under the wing | paint as flown: overall grey, black tail code, the national insignia and "U.S. AIR FORCE" placement |
| C3 | A rendered three-view with dimensions: span 132 ft 7 in, length 112 ft 9 in, height 38 ft 9 in, tailplane 52 ft 8 in | the C-130J-30's proportions and a cross-check of C1's scale |
| C4 | Haryo Panji's six-view poster of an AFRC C-130J, 815th Airlift Squadron "Flying Jennies", 403rd Wing (deviantArt, 2014) | paint and markings layout by eye: grey with a darker grey camouflage on the nose, the red tail band with "Flying Jennies", the black de-icing boots on the wings and tail, prop tip colours |

Only measured numbers go into the sources table (as R-rows, like the T-38A's), never the pictures. Commercial drawings and posters are references, never copied.

## The steps (the T-38A's, in order)

Each step is one pull request in this repo by Dad's thread (one writer: `tools/blender/c130j/`, `public/models/c130j-*`, `src/ui-kit/c130j-model.js`), under Patrick's yes on this plan.

0. **Patrick's yes** (given 15 Oct 2026, relayed by Dad), **and the answers below** (working answers until Dad picks).
1. **Sources table:** the public numbers above, then sizes measured off C1 and C3, each view scaled on its own to the public length, span and height; estimates marked.
2. **First outside in Blender,** built by script in real feet: the fuselage with its upswept tail and the cargo ramp, the high straight wing with its taper, the four nacelles and six-blade props, the fin and the tailplane, the sponsons with the main gear, the nose gear, the flight deck windows, named points (datum, the flight deck eye points) and hinges (ailerons, flaps, elevators, rudder, ramp and door, gear). Size checks on length, span and height.
3. **Renders and a fix list:** both quarters, below, square-on side, front and top over a 1 ft grid, in plain colours; overlays on C1 and C3; Patrick and Dad say what is wrong, each item a numbered row.
4. **Refine,** before and after from the same views.
5. **Paint** for the scheme chosen (question 2), for renders and the app.
6. **First delivery:** export the High and light files into `public/models/` (as `tools/blender/t38/export_t38.py` does), loaded by a small `src/ui-kit/c130j-model.js`, with the CT-156 shown until the file is in; the Debrief's Aircraft select gains "C-130J Hercules" (a new DB- decision, written before the code).

## Questions (one at a time; Patrick's yes on the whole plan)

1. **Which C-130J:**
   - (a) the C-130J-30, the stretched one (112 ft 9 in): what Dad's dimension drawing (C3) and the Ramstein photo (C2) show, and what the RCAF flies as the CC-130J;
   - (b) the short C-130J (97 ft 9 in);
   - (c) one model with both lengths, the stretch a plug;
   - (d) Dad's or Patrick's idea.

   Working answer: (a), until Dad picks.
2. **Paint:**
   - (a) USAF grey with the Ramstein "RS" tail (C2);
   - (b) the AFRC 815th Airlift Squadron "Flying Jennies" scheme (C4);
   - (c) RCAF CC-130J grey;
   - (d) Dad's or Patrick's idea.

   Working answer: (a), until Dad picks.
3. **Who builds it:** Dad's thread, in its own files, never editing a CT-156, Astra or T-38A file except the Debrief's Aircraft select and the shared aircraft-mesh dispose line, as the T-38A did. Working answer.

## When data fails

The model is a picture only: a missing, damaged or slow model file leaves the ship drawn as the CT-156 and the 3D view running (ALL-38 (4)), as for the T-38A.

## Not in this plan

Flying the C-130J (performance numbers from a manual or Patrick's ruling), a cockpit, the ramp or doors moving, and its own pattern in Traffic. Each would be its own plan item if Patrick wants it.
