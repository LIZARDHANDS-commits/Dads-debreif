# CT-102B Astra II: sources table

Every number the build script (`build_ct102b.py`) uses, with its source. The script keeps these numbers in one constants block, and each one names its row here (for example `P2`, `E14`). Shared plan Step 3c, item 1 (`docs/modules/shared/plan.md`, `docs/modules/shared/ct102-astra-plan.md`).

**Status:** first pass, 13 Oct 2026, not yet seen by Patrick or Dad. **No manual page is used:** there is no Astra manual in the project files. All the numbers below are public fact-sheet figures or estimates.

## How these were found, and what's missing

- **Public pages were read through web-search summaries only.** From this cloud session the network policy blocks direct downloads from canada.ca, easa.europa.eu, caa.co.uk, grob-aircraft.com, wikipedia.org, wikimedia.org, skyalyne.com and archive.org (each returned 403 on 13 Oct 2026). The numbers in rows P1 to P8 are what the search tool quoted from each page. Each should be checked against the page itself by someone who can open it, before the fix list closes.
- **Nothing is measured off a picture yet.** No scaled three-view or photo could be downloaded, so the side-view outline, wing planform, tail, canopy and gear are all **estimates** (rows E1 onward), sized to fit the published length, span, height and wing area. The first job of the fix list (plan Step 3c item 3) is a scaled side, top and front view, or Dad's photos with a part of known size in frame, to measure them.
- **SkyAlyne:** its pages could not be reached and the search found no CT-102B size on them.

## Public figures

Units as published. Feet are worked out at 0.3048 m per foot.

| Row | What | Value | Source |
|---|---|---|---|
| P1 | Length, span, height | 8.4 m (27.56 ft), 10.3 m (33.79 ft), 2.7 m (8.86 ft) | [RCAF, CT-102B Astra II](https://www.canada.ca/en/air-force/services/aircraft/ct-102b.html) |
| P1a | Type, role, empty mass | Grob G 120TP; two-seat turboprop basic flying training and aerobatic aircraft; 1,095 kg empty | same RCAF page |
| P2 | Length, span, height, wing area | 8.42 m (27.64 ft), 10.31 m (33.83 ft), 2.64 m (8.68 ft), 13.52 m² (145.53 ft²), the feet as the sheet prints them (as quoted). The script converts the metres itself, so its EASA length is 27.62 ft and height 8.66 ft | [EASA type certificate data sheet EASA.A.565, G 120TP, issue 04, 8 Mar 2024](https://www.easa.europa.eu/en/downloads/7076/en), section A (G 120TP-A, S/N 11002 on) |
| P2a | Propeller | 5 blades, 2.10 m (82.68 in, 6.89 ft) diameter, MT-Propeller | same EASA sheet, as quoted by the search summary; the propeller model number was not confirmed |
| P3 | Length, span, height, wing area; seating | Same as P2; "two seat side by side trainer aircraft" | [UK CAA type certificate data sheet UK.TC.A.00138, issue 1, 19 May 2025](https://www.caa.co.uk/Documents/Download/3934/ca692457-336e-4190-840e-cd26cf498935/3722) |
| P4 | Length, span, height; seating | 8.42 m, 10.31 m, 2.62 m; "Side-by-Side, dual controls" | [Grob Aircraft, G 120TP](https://grob-aircraft.com/en/g-120tp.html) |
| P5 | Length, span, height; layout; propeller | 8.4 m, 10.3 m, 2.7 m (manufacturer's data); retractable tricycle landing gear, low tailplane, winglets; 5-blade MT propeller, 2.1 m | [Wikipedia, Grob G 120TP](https://en.wikipedia.org/wiki/Grob_G_120TP) |
| P6 | Canopy, gear, winglets, sitting attitude | Large bubble canopy (the G 120A's) that **slides aft**; nose leg retracts **backwards** into the fuselage, mainwheels retract **inwards** into wells in the wings and are not fully enclosed; wheel track "quite wide"; "large upswept winglets"; the production gear sits the aircraft **level** on the ground (the prototype sat slightly tail down); production glareshield 22 mm lower than the prototype's | Flight tests: [Flightglobal, "Pocket rocket" (2011)](https://www.flightglobal.com/flight-test-grob-aircraft-g120tp-pocket-rocket/98067.article); [Pilot, "The twenty-first century trainer"](https://pilotweb.aero/news/flight-test-grob-g120tp-the-twenty-first-century-trainer-6262292/) |
| P7 | Wing section | Eppler E884, given for the piston **G 120A** only | [Wikipedia, Grob G 120](https://en.wikipedia.org/wiki/Grob_G_120). Not confirmed for the G 120TP, so not used (see E10) |
| P8 | Figures that disagree | 8.1 m, 10.2 m, 2.7 m, wing area 13.3 m² ([globalmilitary.net](https://www.globalmilitary.net/aircraft/g-120/)); height 2.5 m ([doc8643.com, G12T](https://www.doc8643.com/aircraft/G12T)) | Secondary sites; not used |

## Where the sources disagree (both written down)

| What | Values | Used in the build | Why |
|---|---|---|---|
| Length | 8.4 m (RCAF P1, Wikipedia P5); 8.42 m (EASA P2, CAA P3, Grob P4) | 8.42 m | The type certificate sheets give it to the centimetre; 8.4 m is the same figure rounded. The script's size check prints the difference from both. |
| Span | 10.3 m (P1, P5); 10.31 m (P2 to P4) | 10.31 m | As above. |
| Height | **2.7 m** (RCAF P1, Wikipedia P5); **2.64 m** (EASA P2, CAA P3); **2.62 m** (Grob P4); 2.5 m (P8) | 2.64 m | Two type certificate sheets agree; 2.7 m looks rounded up. The 8 cm (0.26 ft) gap from the RCAF page is real and shows in the size check. **Question for Patrick or Dad.** |
| Wing area | 13.52 m² (P2, P3); 13.3 m² (P8) | 13.52 m² | Type certificate sheets. |

## The four things to confirm (not assumed)

| Item | What the public sources say | What the first pass builds | Status |
|---|---|---|---|
| Main gear | Retractable tricycle; mains retract inwards into wing wells, nose leg backwards (P5, P6) | Gear **down** (on the ground), with hinge points for all three legs | Two sources agree; still to see on a photo (leg positions, doors, track) |
| Propeller | 5 blades, 2.10 m diameter, MT-Propeller (P2a, P5) | 5 blades, 6.89 ft diameter | Two sources agree; blade shape, twist and spinner size are estimates (E20 to E23) |
| Seating | Side by side (P3 type certificate sheet, P4 Grob) | Side by side: two eye points, left and right seat | Two sources agree; eye height and position are estimates (E30) |
| Canopy | Large bubble canopy that slides aft (P6, two flight tests) | One bubble, no frame drawn, closed | Shape is an estimate (E5 to E7); the frame, the bow and where it slides to are not drawn yet |

## Size checks (first pass, 13 Oct 2026)

Printed by the build. Model against the RCAF page (P1) and the EASA sheet (P2), metres converted at 0.3048 m per foot:

| | Model | RCAF (P1) | Difference | EASA (P2) | Difference |
|---|---|---|---|---|---|
| Length (spinner tip to rudder trailing edge) | 27.60 ft | 27.56 ft | +0.5 in | 27.62 ft | -0.2 in |
| Span (over the winglets) | 33.83 ft | 33.79 ft | +0.4 in | 33.83 ft | 0.0 in |
| Height (ground to fin top, gear down) | 8.66 ft | 8.86 ft | -2.4 in | 8.66 ft | 0.0 in |
| Wing area (trapezoids to the winglet roots) | 145.1 ft² | | | 145.5 ft² | -0.4 ft² |

The span, height and length are built to the EASA figures, so these checks catch a mistake in the script, not a wrong shape. Only a measured picture can show whether the shape inside those sizes is right.

## Estimates (no source yet)

Every row here is an **estimate**, made in this first pass to fit the published sizes, until a measured picture, Dad's or Patrick's photo or a manual page replaces it. Stations are feet behind the spinner's tip; heights are feet above the propeller axis; "out" is feet from the centreline.

| Row | What | Value | How chosen |
|---|---|---|---|
| E1 | Propeller axis height above the ground, gear down | 4.35 ft | Gives about 0.9 ft between the blade tips (P2a) and the ground. With the height (P2), sets the fin top 4.33 ft above the axis |
| E2 | Fuselage stations: half-width, top and bottom at 15 stations from 1.7 ft to 26.6 ft | the table `FUSELAGE` in the script | Drawn to a low-wing side-by-side trainer's usual lines; widest 3.96 ft (1.21 m) at the seats, room for two side by side (P3) |
| E3 | Cowl and fuselage split | station 7.0 ft (the firewall) | Estimate |
| E4 | Section roundness (superellipse power) | 2.5 | Estimate |
| E5 | Canopy: front foot, peak, aft end | stations 7.8, 11.0 and 15.5 ft | Estimate, for a long sliding bubble (P6) |
| E6 | Canopy peak height | 3.35 ft above the axis (7.70 ft above the ground) | Estimate, kept below the fin top; not measured |
| E7 | Canopy sill | 0.6 of the way up the fuselage's side from its middle, as wide as the fuselage there | Estimate, so the bubble's sides run down into the fuselage's |
| E8 | Wing: chord-line height at the root | 1.20 ft below the axis (low wing, P5) | Estimate |
| E9 | Wing: centre section flat out to 2.0 ft, then the outer panel at 5° dihedral | 5° | Estimate; the dihedral needs a front photo |
| E10 | Wing section | NACA 2415 at the root to NACA 2412 at the tip, as a stand-in | Estimate; the G 120A's E884 (P7) is not confirmed for the TP |
| E11 | Root chord, tip chord | 5.6 ft, 3.2 ft, quarter-chord line straight across | Chosen so the wing's area comes to the published 145.5 ft² (P2); the script prints the area |
| E12 | Wing leading edge at the root | station 8.6 ft | Estimate |
| E13 | Winglets | 1.9 ft long, bending up to 72° from level over the first 0.7 ft, chord 3.0 to 1.4 ft | Estimate for the "large upswept winglets" (P6); the outer panel's tip is placed so the span over the winglets is the published 10.31 m (P2) |
| E14 | Flaps | from 2.1 to 9.0 ft out, the aft 25% of the chord | Estimate |
| E15 | Ailerons | from 9.2 to 15.4 ft out, the aft 25% of the chord | Estimate |
| E16 | Tailplane | 11.5 ft span, 0.55 ft above the axis, root chord 3.2 ft at station 22.2, tip chord 2.1 ft at station 22.8, no dihedral, NACA 0010 | Estimate; "low tailplane" (P5) |
| E17 | Elevator | the aft 38% of the tailplane's chord, full span | Estimate |
| E18 | Fin | root 0.9 ft above the axis, chord 5.74 ft from station 21.9; tip chord 2.7 ft from station 24.6; NACA 0012 | Root trailing edge placed so the overall length is the published 8.42 m (P2); the fin top from the height (P2) and E1 |
| E19 | Rudder | the aft 38% of the fin's chord, its full height | Estimate |
| E20 | Spinner | 1.7 ft long, 0.64 ft radius at its base | Estimate |
| E21 | Propeller plane | station 1.0 ft | Estimate |
| E22 | Blade chord | 0.50 ft at the root (0.55 ft out) to 0.32 ft at the tip | Estimate |
| E23 | Blade angle | 42° at the root to 14° at the tip, from the plane of the disc | Estimate; a fine-pitch look, for the picture only |
| E24 | Main gear | legs pivot 5.37 ft out under the wing, wheels 5.0 ft out (track 10.0 ft), axle at station 10.6 ft; wheel 1.30 ft across, 0.45 ft wide | Estimate for a "quite wide" track (P6) |
| E25 | Nose gear | pivot at station 3.9 ft, 1.2 ft below the axis; wheel 1.10 ft across, 0.40 ft wide | Estimate |
| E26 | Gear legs | 0.13 ft (main) and 0.12 ft (nose) radius, round | Estimate |
| E30 | Eye points, side by side | station 11.3 ft, 0.95 ft either side of the centreline, 2.55 ft above the axis | Estimate; needs the seat and a photo from the seat. Which seat the student and the instructor take is not assumed |
| E31 | Datum | the model's origin: the spinner's tip on the propeller axis | A model reference only; the aircraft's weighing datum is in the flight manual, which the project files don't hold |
