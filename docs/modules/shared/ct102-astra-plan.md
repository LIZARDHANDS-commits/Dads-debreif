# CT-102 Astra model: proposed plan (not being built)

> **Status:** a proposal on the shared future list (`future.md`, "Aircraft models"). Dad asked for it on 13 Oct 2026: "Can you start the same process and plan for the CT-102 Astra", meaning the process the CT-156 model went through (`Pat's claude work/dad-setup/how-we-built-the-ct156-model.md`, ALL-31 to ALL-38). Nothing is built until Patrick moves it up. The questions are on the waiting list in `../../PLAN.md`.

## What it would be

An Astra model built the way the CT-156 is now built (ALL-38). Blender master files in the private repo `3d-work` own its shape, every size has its source in that repo's sources table, and the app takes only finished, checked model files (High and Performance), each with a delivery sheet. What moves in flight (instruments, control surfaces, prop, lights, camera) stays in the app's code, as for the CT-156.

## Which Astra (first question)

Two RCAF aircraft carry the name, and the numbers differ:

| | CT-102A Astra | CT-102B Astra II |
|---|---|---|
| Type | Grob G 120A, piston (Lycoming AEIO-540, 260 hp; EASA type certificate data sheet, Wikipedia) | Grob G 120TP, turboprop |
| Length | 8.12 m (EASA type certificate data sheet); 8.61 m (RCAF page, and Jane's 2003-04 as quoted by Wikipedia) | 8.4 m (RCAF page) |
| Span | 10.19 m (EASA, RCAF page) | 10.3 m (RCAF page) |
| Height | 2.66 m (EASA); 2.57 m (RCAF page, Jane's) | 2.7 m (RCAF page) |

The sources disagree on the CT-102A's length and height. The rule book says write both down and ask, so both stay until a measured photo or a manual page settles it. These are public fact-sheet numbers, the same kind the CT-156 started from (ALL-31); none is a manual figure.

Public pages: [RCAF CT-102A Astra](https://www.canada.ca/en/air-force/services/aircraft/ct-102a.html), [RCAF CT-102B Astra II](https://www.canada.ca/en/air-force/services/aircraft/ct-102b.html), [EASA type certificate data sheet, Grob G 120](https://www.easa.europa.eu/en/downloads/7374/en), [Wikipedia, Grob G 120](https://en.wikipedia.org/wiki/Grob_G_120).

## The steps (the CT-156's process, in order)

Each step is one pull request in `3d-work` or this repo, by the graphics session (one writer: the `3d-work` repo, `tools/blender/`, `public/models/` and `src/ui-kit/` model files), with Patrick's yes before it starts.

0. **Patrick's yes, and the answers below.** Which Astra, which modules use it, and who owns it.
1. **Sources first.**
   - The public numbers above go into a sources table.
   - Dad's and Patrick's photos come in with a scale: a part of known size (as the KLN 900 scaled the CT-156's panel), or a photo from a known seat.
   - A scaled three-view, if one is found, is used for measuring only, never copied.
   - **Manuals:** the rule book allows only manuals in the project files, and there is no Astra manual there today. Patrick would add the Astra's flight manual first if the model needs anything a fact sheet can't give (eye point, cockpit layout, limits).
2. **Master file for the outside.** It goes in `3d-work/ct102/`, in real feet, with:
   - named points: the reference datum and the eye points of both seats;
   - hinges: ailerons, elevator, rudder, flaps, prop axis, and the gear if it moves;
   - size checks: length, span and height against the sources table.
3. **Full renders and the fix list.** Outside from both quarters, below, square-on side, front and top over a 1 ft grid, in plain colours. Patrick and Dad say what's wrong; each item becomes a numbered row with its source.
4. **Refine,** with before and after from the same views every time (the CT-156's way: "judge the picture, not the numbers").
5. **Cockpit,** once the outside is signed off: seats, panel, canopy frame and the eye points. Things to confirm from photos (not assumed here): the seating layout, the panel's instruments, and whether the gear is fixed or retracts.
6. **High and Performance delivery** through the same `models:import` path as the CT-156 (shared plan Step 3b, items 3.4 and 6 to 8): the validator, size checks and the delivery sheet.
7. **Use in the app,** module by module, starting with the first module Patrick names.
   - Flying it is a separate decision. The Astra needs its own performance numbers (glide, climb, stall, limits) from a manual in the project files or Patrick's ruling.
   - Until then, the model can be drawn (for example as a replayed track in the Debrief) but not flown by the flight model.

## Questions for Patrick (one at a time; his idea is always an option)

1. **Is this wanted now, and which Astra?**
   - (a) CT-102A Astra, the piston G 120A;
   - (b) CT-102B Astra II, the turboprop G 120TP;
   - (c) both, one after the other;
   - (d) not now: it stays on the future list;
   - (e) your idea.

   Working answer: (d) until Patrick says, then whichever Dad flies or instructs on.
2. **Where it's used first:**
   - (a) the Debrief, so Astra tracks replay as an Astra;
   - (b) the EP Tabletop, with an Astra cockpit;
   - (c) Traffic or the Formation sim;
   - (d) your idea.

   Working answer: (a). The outside is all it needs, and nothing has to fly.
3. **Who builds it:**
   - (a) the graphics session that owns the CT-156 pipeline (one writer);
   - (b) a new thread under the same `3d-work` rules;
   - (c) your idea.

   Working answer: (a).

## What Dad can gather meanwhile (no code needed)

- Photos of the Astra:
  - square-on side, front and top if possible;
  - close-ups of the canopy, the panel, the seats from the pilot's eye, the antennas and the gear;
  - each with something of known size in frame.
- Which variant he flies or instructs on, and the tail numbers he knows.
