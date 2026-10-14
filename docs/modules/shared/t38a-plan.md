# T-38A Talon model: plan (proposed)

> **Status:** proposed, waiting on Patrick's yes. Dad asked on 14 Oct 2026: "Lets use the same logic to create a 3D model for a T-38A. Lets come up with our plan." It would be Step 3d of `plan.md`, built the way the CT-102B Astra II is (Step 3c, `ct102-astra-plan.md`), which follows the CT-156's process (`Pat's claude work/dad-setup/how-we-built-the-ct156-model.md`, ALL-31 to ALL-38). Nothing is built until Patrick says yes.

## What it would be

A T-38 model built by a Blender script in real feet, with every size carrying its source in a sources table. The app takes only the exported model files (a High file for the aircraft followed, a light file for the rest). The first delivery is the outside and paint; the cockpit comes later. Like the Astra, it lives in `tools/blender/t38/` while Dad's sessions can't reach `3d-work` (ALL-38 says the master belongs there; Patrick can ask for it to move).

## Why a T-38 (where it would be used)

The seven US T-6 bases in the SOF (Step 2c of `../sof/plan.md`) share their airspace with T-38s: Columbus, Laughlin, Vance, Randolph and Sheppard fly the T-38C today (public). Today any aircraft in the SOF's live traffic that isn't a T-6 is drawn as the plain stand-in. A T-38 model would let the SOF's 3D traffic, and later Traffic or the Formation sim, draw them as T-38s.

## The public numbers (first rows of the sources table)

| | T-38 Talon (public figures; checked only through search summaries, unchecked) |
|---|---|
| Length | 46 ft 4 in (14.1 m) (USAF fact sheet, T-38C) |
| Span | 25 ft 3 in (7.7 m) (USAF fact sheet) |
| Height | 12 ft 10 in (3.9 m) (USAF fact sheet) |
| Engines | two General Electric J85 with afterburner (USAF fact sheet) |
| Seats | two, tandem (USAF fact sheet) |

These are fact-sheet numbers, the same kind the CT-156 and the Astra started from; none is a manual figure. The T-38A and T-38C share the airframe; the C's differences are inside (glass cockpit, avionics) and in small fittings, to be listed as they are found.

## Reference pictures Dad sent (14 Oct 2026), measuring only

Kept in the session's scratch folder, never in the repo or on the site:

| # | What it is | Use |
|---|---|---|
| T1 | A decal maker's four-view of a ROCAF T-38A (Hobby Search) | paint layout and panel positions, by eye |
| T2 | A three-view by Scott Cullen, 2022: top, front and side, USAF white | the clearest outline: plan view, side profile, canopy shape; scaled to the public length and span, each view on its own (as the Astra's three-view was) |
| T3 | Willy Peeters' 1/72 scale drawings (Dacoverlay): top, bottom, side, undercarriage details, AT-38 panel differences | the best measured source: scaled drawing with gear details; scale checked against the public length before use |
| T4 | An RC model plan of the USAF T-38A (balsa formers and sections) | fuselage cross-sections, by eye only (a model plan, not a scale drawing) |
| T5 | Dave Rees' RC model plan "T-38 Talon" | outline cross-check only |

Only measured numbers go into the sources table (as R-rows, like the Astra's), never the pictures. Commercial drawings and model plans are references, never copied.

## The steps (the Astra's, in order)

Each step is one pull request in this repo by Dad's thread (one writer: `tools/blender/t38/`, `public/models/t38-*`), with Patrick's yes before it starts.

0. **Patrick's yes, and the answers below.**
1. **Sources table:** the public numbers above, then sizes measured off T2 and T3, each view scaled on its own to the public length, span and height; estimates marked.
2. **First outside in Blender,** built by script in real feet: fuselage with its area-ruled waist, the thin low-aspect wing, all-moving tailplane, fin and rudder, the twin intakes and exhausts, the two-piece canopy, the gear (down), named points (datum, both eye points) and hinges (ailerons, flaps, tailplane, rudder, speed brakes, gear). Size checks on length, span and height.
3. **Renders and a fix list:** both quarters, below, square-on side, front and top over a 1 ft grid, in plain colours; overlays on T2 and T3; Patrick and Dad say what is wrong, each item a numbered row.
4. **Refine,** before and after from the same views.
5. **Paint** for the variant and scheme chosen (question 3), for renders and the app.
6. **First delivery:** export the High and light files into `public/models/` (as `tools/blender/ct102b/export_ct102b.py` does), loaded by a small `src/ui-kit/t38-model.js` with the stand-in until the file is in. First use in the module Patrick names (question 2).
7. **Cockpit,** later, once the outside is signed off.

## Questions for Patrick (one at a time; his idea is always an option)

1. **Which T-38:**
   - (a) T-38A only;
   - (b) T-38C, what the US bases fly today;
   - (c) one outside for both, with the paint and small fittings as the difference;
   - (d) your idea.

   **Dad's pick: (a) T-38A only** (14 Oct 2026: "T-38A only"), exactly as in his drawings; needs Patrick's yes with the plan.
2. **Where it is used first:**
   - (a) the SOF's 3D live traffic at the US bases, for aircraft the feed identifies as T-38s;
   - (b) Traffic, as another type;
   - (c) the Formation sim;
   - (d) your idea.

   Working answer: (a). Nothing has to fly; the feed gives position and height.
3. **Paint:**
   - (a) USAF white with national insignia (T2);
   - (b) today's AETC scheme at the US bases;
   - (c) your idea.

   Working answer: (a) until a photo of a base's own scheme comes in.
4. **Who builds it:** Dad's thread, in its own files (`tools/blender/t38/`), never editing a CT-156 or Astra file. Working answer.

## When data fails

The model is a picture only: a missing, damaged or slow model file leaves the stand-in drawn and the 3D view running (ALL-38 (4)), as for the Astra.

## Not in this plan

Flying the T-38 (performance numbers from a manual in the project files or Patrick's ruling), its cockpit instruments, and its own pattern in Traffic. Each would be its own plan item if Patrick wants it.
