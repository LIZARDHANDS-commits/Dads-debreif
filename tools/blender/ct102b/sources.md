# CT-102B Astra II: sources table

Every number the build script (`build_ct102b.py`) uses, with its source. The script keeps these numbers in one constants block, and each one names its row here (for example `P2`, `R7`, `E21`). Shared plan Step 3c, item 1 (`docs/modules/shared/plan.md`, `docs/modules/shared/ct102-astra-plan.md`).

**Status:** first refine pass, 13 Oct 2026, not yet seen by Patrick or Dad. **No manual page is used:** there is no Astra manual in the project files. The numbers below are public fact-sheet figures (P), measured off a scaled three-view (R), Dad's photos (D) or estimates (E).

## How these were found, and what's missing

- **Public pages were read through web-search summaries only.** From this cloud session the network policy blocks direct downloads from canada.ca, easa.europa.eu, caa.co.uk, grob-aircraft.com, wikipedia.org, wikimedia.org, skyalyne.com and archive.org (each returned 403 on 13 Oct 2026). The numbers in rows P1 to P8 are what the search tool quoted from each page. Each should be checked against the page itself by someone who can open it, before the fix list closes.
- **Measured off a scaled three-view since 13 Oct 2026.** Dad sent an Aeromaquina three-view of a Fuerza Aérea Argentina G 120TP (serial E-504); the outline, wing, tail, canopy and gear are now measured off it (rows R1 onward). The picture itself, and anything traced from it, stays out of the repo: only these numbers come in. The estimates it replaced are marked "replaced" in the estimates table.
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

## Measured: Aeromaquina three-view (Dad, 13 Oct 2026)

Source for every R row: **Aeromaquina three-view (Dad, 13 Oct 2026), measured.** A 701 × 571 px drawing of a Fuerza Aérea Argentina G 120TP (E-504): top view, front view, side view and a 0–2 m / 0–6 ft scale bar. Same airframe as the RCAF CT-102B; its paint, the small antennas and anything specific to that airframe are not modelled. Measured in Python (PIL) at about 1 to 2 px, roughly 0.07 to 0.15 ft.

**Scale.** The scale bar gives 48.4 px per metre (2 m bar, 96.9 px) and 48.7 px/m (6 ft bar, 89.0 px). The drawing itself is drawn about 6% smaller than its own bar:

| View | Measured | Published (P2) | px per metre | Using the bar instead |
|---|---|---|---|---|
| Side: spinner tip to rudder trailing edge | 387.5 px | 8.42 m | 46.0 | 8.00 m |
| Side: fin top to the ground under the wheels | 120 to 122.5 px | 2.64 m | 45.5 to 46.4 | 2.50 m |
| Top: span over the winglets | 472 px | 10.31 m | 45.8 | 9.75 m |
| Top: spinner tip to rudder trailing edge | 382.5 px | 8.42 m | 45.4 | 7.90 m |
| Front: span over the winglets | 471 px | 10.31 m | 45.7 | 9.73 m |

So the three views agree with each other within about 1% and with the published sizes, and the bar is off. **Each view is scaled from its own published size** (side by its length: 14.03 px/ft; top and front by the span: 13.95 and 13.92 px/ft), not the bar. The side view's height fits EASA's 2.64 m better than the RCAF page's 2.7 m (2.7 m would put the ground 2 to 4 px below the wheels).

**What the drawing doesn't show:** no gear legs (wheels only), no propeller blades on the side and top views (the front view draws the disc), and it sits about 1.9° nose up (tail down) on a sloping ground line, the wheels' bottoms 3 px apart. P6 says the prototype sat slightly tail down and the production aircraft sits level, so the build keeps the axis level and puts both wheels on the ground.

Stations are feet behind the spinner's tip, heights feet above the propeller axis, "out" feet from the centreline.

| Row | What | Measured | Replaces | Notes |
|---|---|---|---|---|
| R1 | Propeller axis above the ground | **4.08 ft**: the height (P2, 8.66 ft) less the fin top above the axis (R13, 4.58 ft). Side view at its own scale: 4.08 ft; front view: 4.04 ft at the mains, 4.29 ft at the nose wheel (the tail-down stance) | E1 (4.35 ft) | Prop tip 0.64 ft (7.7 in) off the ground with P2a |
| R2 | Propeller disc | 98 px across on the front view, **7.04 ft** | none | P2a says 2.10 m (6.89 ft): 2 px over, about the drawn line's width. The build keeps P2a |
| R3 | Spinner | **1.7 ft** long; base radius **0.65 ft** (top view 0.65, front view 0.63, side view 0.64 just ahead of the base) | E20 (confirmed) | |
| R4 | Fuselage half-widths, top view | 0.5 ft: 0.32; 1.0: 0.53; 2.0: 0.89; 2.5: 1.10; 3.0: 1.25; 3.5: 1.39; 4.0: 1.53; 5.0: 1.71; 6.0: 1.89; 7.0: 2.04; **8 to 13: 2.20** (front view 2.15); 14.0: 1.75; 15.0: 1.53; 16.0: 1.25; 17.0: 1.03; 18.0: 0.89; 19.0: 0.67; 20.0: 0.53; 21.0: 0.43; 23 to 25: about 0.3 to 0.2 | E2 (widest 1.98) | The cockpit is 4.4 ft (1.34 m) wide outside. Aft of the wing the fuselage is narrow and deep |
| R5 | Fuselage top and bottom, side view | Top: 2.0 ft +0.73; 3.0 +0.87; 4.0 +0.94; 5 to 6 +1.01; 6.5 +1.08; behind the canopy 15 to 17 +1.44 (a raised fairing), 17.5 to 20 +1.23. Bottom: 2.0 −1.13; 3.0 −1.34; 4.0 −1.77; 5 to 7.5 about −1.9; **8.5 to 11.5 −2.2** (front view −2.16); 13 −1.91; 14 −1.84; 16 −1.70; 18 −1.55; 20 −1.48; 22 −1.40; 24 −1.25; 25 −1.1 | E2 | The first pass's tail cone rose to the axis; the drawing's belly stays low to the tail. The table `FUSELAGE` holds these, smoothed; under the canopy its top is a deck hidden inside the bubble |
| R5a | Below the tail cone, side view | A lozenge from station 18.3 to 23.9 ft, down to −1.92 ft (0.4 ft below the belly line) | none | **Not modelled.** Maybe a ventral strake or fairing; not on the top or front views. To confirm on a photo |
| R6 | Canopy | Windshield foot station **6.8** (top view 6.65), +1.23 ft; windshield frame (bow) **9.05 to 9.45** (top view 9.1 to 9.3); peak **+2.52 ft** from 9.7 to 11.5 (front view +2.42); aft end **14.8** (top view 14.3), +1.4 ft; sill (the frame's lower rail) **−0.15 ft** from 9.3 to 13.5, rising to the windshield's foot and the aft end; half-width 2.04 at 7, **2.11 from 9 to 12**, 1.88 at 13, 1.6 at 14. The front view's section is flat-topped (superellipse power 4) | E5 (7.8 / 11.0 / 15.5), E6 (peak +3.35), E7 | The first pass's canopy stood 0.83 ft too tall and 1 ft too far aft. Where the top and side views differ (aft end 14.3 or 14.8, peak +2.42 or +2.52), the build takes the side view |
| R7 | Wing planform, top view | Leading edge station **8.14** at the centreline, **8.54** at 15.44 ft out (2.2° back); trailing edge **13.89** and **11.71** (8.4° forward). Root chord 5.75 ft, chord at the winglet's root 3.17 ft. Winglet root **15.44 ft out** (front view 15.48) | E11 (5.6 / 3.2), E12 (8.6) | Root fillets (leading edge forward to 7.74 at 2.25 ft out, trailing edge aft to 14.1) not modelled |
| R8 | Flaps and ailerons, top view | Flaps **2.25 to 10.40 ft out**, aft **25%** of the chord; ailerons **10.45 to 15.30 ft out** (to the winglet root), aft **29%** | E14, E15 | Hinge lines are the forward of the drawn lines; the lines behind them may be gaps or shrouds |
| R9 | Wing height and dihedral, front view | Chord line **−1.80 ft** at the centreline; **dihedral 2.9°** from the root, no flat centre section (mid-thickness line; the upper surface reads 2.0°, the lower 3.4°) | E8 (−1.20), E9 (flat to 2 ft, then 5°) | |
| R10 | Wing thickness, front view | 0.79 to 0.90 ft near the root (15 to 17%), 0.50 to 0.54 ft near the tip (15 to 16.5%) | E10 thickness (15 / 12%) | The build uses 15% throughout. The front view also shows any incidence or twist, so this is an upper figure. The section shape is still E10 |
| R11 | Winglets | Rise **1.40 ft** over **1.33 ft** outboard on the front view, flat at the root and about 58° at the tip; root chord 3.0 ft, tip chord **1.15 ft**, trailing edge straight on, leading edge swept back 2.1 ft (top view) | E13 (1.9 ft long, 72°, tip chord 1.4) | Built as a 2.1 ft curve bending over its first 1.0 ft to 58°; the build's wing panel tip comes out at 15.45 ft, against the measured 15.44 |
| R12 | Tailplane | Span **12.35 ft** (top 12.40, front 12.28); **+0.30 ft** (front +0.32, side +0.26); leading edge **21.28** at the root, **22.00** at the tip; trailing edge **24.12** straight across; elevator hinge **23.36** straight across (an inner box to 4.1 ft out may be a trim tab) | E16 (11.5 ft, +0.55), E17 (38%) | Tip corners rounded on the drawing, square in the build |
| R13 | Fin | Top **+4.58 ft** above the axis (front view +4.45); leading edge 40° back: 22.81 at +2.01, 24.81 at +4.36; dorsal fillet from about 20.0 at the fuselage's top (+1.25) to 22.81 at +2.01; trailing edge from 26.3 near the root to **27.66** at the top (the overall length); fin and rudder reach down to **−0.90 ft**; about 0.2 ft either side of the centreline near the root (top view) | E18 | The first pass's trailing edge leaned the wrong way (forward at the top) |
| R14 | Rudder | Hinge line from station 24.45 at −0.13 ft to 26.81 at +3.72 ft (31° back): wide at the foot (about 2 ft), a sliver at the top | E19 (38% of the chord) | From the orange paint's front edge, which has a drawn line along it; a horn balance at the top may be drawn but is not modelled |
| R15 | Main wheels | Station **10.98**; **3.91 ft out** (track **7.82 ft**, 2.38 m); **1.25 ft** across (side 1.25 to 1.35, front 1.26), **0.48 ft** wide | E24 (track 10.0, station 10.6, 1.30 / 0.45) | Flightglobal (P6) calls the track "quite wide"; 2.38 m is what the drawing shows. No legs drawn: the leg and pivot stay estimates (E24, E26) |
| R16 | Nose wheel | Station **4.95**; **1.15 ft** across (side 1.18 to 1.28, front 1.08), **0.36 ft** wide | E25 (3.9, 1.10 / 0.40) | Pivot height stays an estimate (E25) |

## Where the sources disagree (both written down)

| What | Values | Used in the build | Why |
|---|---|---|---|
| Length | 8.4 m (RCAF P1, Wikipedia P5); 8.42 m (EASA P2, CAA P3, Grob P4) | 8.42 m | The type certificate sheets give it to the centimetre; 8.4 m is the same figure rounded. The script's size check prints the difference from both. |
| Span | 10.3 m (P1, P5); 10.31 m (P2 to P4) | 10.31 m | As above. |
| Height | **2.7 m** (RCAF P1, Wikipedia P5); **2.64 m** (EASA P2, CAA P3); **2.62 m** (Grob P4); 2.5 m (P8) | 2.64 m | Two type certificate sheets agree; 2.7 m looks rounded up. The 8 cm (0.26 ft) gap from the RCAF page is real and shows in the size check. **Question for Patrick or Dad.** |
| Wing area | 13.52 m² (P2, P3); 13.3 m² (P8) | 13.52 m² | Type certificate sheets. The measured planform (R7) gives 137.8 ft² to the winglet roots and 146.7 ft² with its lines carried out to the full span, against 145.5 ft²; so the published area looks like it counts the span over the winglets (an inference, not stated on the sheet). |
| Scale of the three-view | Scale bar 48.4 to 48.7 px/m; the drawing against the published sizes 45.4 to 46.0 px/m | Each view from its own published size | The bar is about 6% off; the views agree with each other and with P2 within about 1% |
| Fin top, three-view | +4.58 ft (side view); +4.45 ft (front view) | +4.58 ft | The side view is the one that shows heights square on |
| Canopy, three-view | Aft end 14.8 ft (side) or 14.3 ft (top); peak +2.52 ft (side) or +2.42 ft (front) | Side view | 0.5 ft and 0.1 ft. Wants a photo |
| Stance on the ground | Drawing about 1.9° tail down; P6: production sits level (prototype tail down) | Level | The drawing may show the prototype's stance |

## The four things to confirm (not assumed)

| Item | What the public sources say | What the first pass builds | Status |
|---|---|---|---|
| Main gear | Retractable tricycle; mains retract inwards into wing wells, nose leg backwards (P5, P6) | Gear **down** (on the ground), with hinge points for all three legs | Wheel positions, size and track measured (R15, R16); legs, doors and pivots still to see on a photo |
| Propeller | 5 blades, 2.10 m diameter, MT-Propeller (P2a, P5) | 5 blades, 6.89 ft diameter | Two sources agree; blade shape, twist and spinner size are estimates (E20 to E23) |
| Seating | Side by side (P3 type certificate sheet, P4 Grob) | Side by side: two eye points, left and right seat | **Seen on Dad's photos (D1)**, with a centre stick each; eye height and position are estimates (E30) |
| Canopy | Large bubble canopy that slides aft (P6, two flight tests) | One bubble, closed, with the windshield's bow as a band | Shape and bow measured (R6); the aft frame and where it slides to are not drawn yet |

## Dad's photos (13 Oct 2026; kept out of the repo)

Two cockpit photos of a CT-102B on the ramp, sent by Dad. They're family photos, so they stay out of the repo and nothing is copied from them; only what they show about the aircraft is written here. The canopy is open in both, and there is no square-on view, so nothing is measured off them yet.

| Row | What they show | Used for |
|---|---|---|
| D1 | Two seats side by side, each with its own centre stick between the knees | Confirms the seating (P3, P4) and sticks, not yokes; cockpit, Step 3c item 5 |
| D2 | A centre console between the seats, with the power lever and other controls on it | Cockpit layout, item 5 (no control is named here until a manual or Patrick confirms it) |
| D3 | Grey seat shells with mesh cushions, and tall dark headrest frames behind both seats | Cockpit, and what shows through the canopy from outside |
| D4 | Paint: yellow overall, with dark blue winglets and dark blue and red trim; RCAF roundel on the wing's upper surface; the number 207 on the upper surface behind the cockpit | Paint at delivery (item 6); confirms upswept, swept-back winglets (P5, P6) |
| D5 | A yellow canopy frame with a chrome grab handle, standing up beside the seats with the canopy open | The canopy frame exists; how it opens (slides aft, P6, or lifts) is still to confirm from a photo with it part-open or closed |
| D6 | An adult seated in the right seat | A rough check of cockpit width later; too oblique to measure from now |

## Size checks (first refine pass, 13 Oct 2026)

Printed by the build. Model against the RCAF page (P1) and the EASA sheet (P2), metres converted at 0.3048 m per foot:

| | Model | RCAF (P1) | Difference | EASA (P2) | Difference |
|---|---|---|---|---|---|
| Length (spinner tip to rudder trailing edge) | 27.60 ft | 27.56 ft | +0.5 in | 27.62 ft | -0.2 in |
| Span (over the winglets) | 33.83 ft | 33.79 ft | +0.4 in | 33.83 ft | 0.0 in |
| Height (ground to fin top, gear down) | 8.66 ft | 8.86 ft | -2.4 in | 8.66 ft | 0.0 in |
| Wing area, trapezoid to the winglet roots | 137.8 ft² | | | 145.5 ft² | -7.8 ft² |
| Wing area, the same lines to the full span | 146.7 ft² | | | 145.5 ft² | +1.2 ft² |

The length, span and height are built to the EASA figures, so those checks catch a mistake in the script. The wing area is now a real check of the measured planform: see "Where the sources disagree". The first pass sized its chords to the area (E11); the refine pass measures them (R7), so the to-the-winglet-roots figure dropped.

**Overlay check** (the model's outline laid over the three-view at each view's scale; sheets kept out of the repo). Remaining differences after the refine pass:

- **Side:** within about 0.1 ft (1 to 2 px) along the nose, canopy, turtle deck, fin and rudder. The lozenge below the tail cone (R5a) is up to 0.45 ft below the model, not modelled. Wheels sit up to 0.14 ft lower (mains) or 0.1 ft higher (nose wheel) than drawn, from levelling the drawing's tail-down stance. Gear legs and blades are the model's only (the drawing has none).
- **Top:** within about 0.1 ft on the wing, tailplane and fuselage; the canopy's aft end 0.5 ft behind the drawn one (side and top views disagree, R6); root fillets not modelled (up to 0.4 ft).
- **Front:** within about 0.1 ft on the wing, winglets, tailplane, fuselage and wheels; the canopy top 0.1 ft and the fin top 0.13 ft above the drawn ones (the side view's heights are used).

## Estimates (no source yet)

Every row here is an **estimate**, made in the first pass to fit the published sizes, until a measured picture, Dad's or Patrick's photo or a manual page replaces it. Rows marked **replaced** are kept for the record; the build no longer uses their values. Stations are feet behind the spinner's tip; heights are feet above the propeller axis; "out" is feet from the centreline.

| Row | What | Value | How chosen |
|---|---|---|---|
| E1 | ~~Propeller axis height above the ground, gear down~~ | 4.35 ft | Gives about 0.9 ft between the blade tips (P2a) and the ground. With the height (P2), sets the fin top 4.33 ft above the axis **Replaced by R1.** |
| E2 | ~~Fuselage stations: half-width, top and bottom at 15 stations from 1.7 ft to 26.6 ft~~ | the table `FUSELAGE` in the script | Drawn to a low-wing side-by-side trainer's usual lines; widest 3.96 ft (1.21 m) at the seats, room for two side by side (P3) **Replaced by R4, R5.** |
| E3 | Cowl and fuselage split | station 7.0 ft (the firewall) | Estimate |
| E4 | Section roundness (superellipse power) | 2.5 | Estimate |
| E5 | ~~Canopy: front foot, peak, aft end~~ | stations 7.8, 11.0 and 15.5 ft | Estimate, for a long sliding bubble (P6) **Replaced by R6.** |
| E6 | ~~Canopy peak height~~ | 3.35 ft above the axis (7.70 ft above the ground) | Estimate, kept below the fin top; not measured **Replaced by R6.** |
| E7 | ~~Canopy sill~~ | 0.6 of the way up the fuselage's side from its middle, as wide as the fuselage there | Estimate, so the bubble's sides run down into the fuselage's **Replaced by R6 (the sill is now measured, and the bubble is as wide as the fuselage at it).** |
| E8 | ~~Wing: chord-line height at the root~~ | 1.20 ft below the axis (low wing, P5) | Estimate **Replaced by R9.** |
| E9 | ~~Wing: centre section flat out to 2.0 ft, then the outer panel at 5° dihedral~~ | 5° | Estimate; the dihedral needs a front photo **Replaced by R9.** |
| E10 | Wing section | NACA 24xx stand-in, 2% camber; thickness now 15% throughout (R10) | Estimate; the G 120A's E884 (P7) is not confirmed for the TP |
| E11 | ~~Root chord, tip chord~~ | 5.6 ft, 3.2 ft, quarter-chord line straight across | Chosen so the wing's area comes to the published 145.5 ft² (P2); the script prints the area **Replaced by R7.** |
| E12 | ~~Wing leading edge at the root~~ | station 8.6 ft | Estimate **Replaced by R7.** |
| E13 | ~~Winglets~~ | 1.9 ft long, bending up to 72° from level over the first 0.7 ft, chord 3.0 to 1.4 ft | Estimate for the "large upswept winglets" (P6); the outer panel's tip is placed so the span over the winglets is the published 10.31 m (P2) **Replaced by R11 (thickness still E13).** |
| E14 | ~~Flaps~~ | from 2.1 to 9.0 ft out, the aft 25% of the chord | Estimate **Replaced by R8.** |
| E15 | ~~Ailerons~~ | from 9.2 to 15.4 ft out, the aft 25% of the chord | Estimate **Replaced by R8.** |
| E16 | ~~Tailplane~~ | 11.5 ft span, 0.55 ft above the axis, root chord 3.2 ft at station 22.2, tip chord 2.1 ft at station 22.8, no dihedral, NACA 0010 | Estimate; "low tailplane" (P5) **Replaced by R12 (thickness still E16).** |
| E17 | ~~Elevator~~ | the aft 38% of the tailplane's chord, full span | Estimate **Replaced by R12.** |
| E18 | ~~Fin~~ | root 0.9 ft above the axis, chord 5.74 ft from station 21.9; tip chord 2.7 ft from station 24.6; NACA 0012 | Root trailing edge placed so the overall length is the published 8.42 m (P2); the fin top from the height (P2) and E1 **Replaced by R13.** |
| E19 | ~~Rudder~~ | the aft 38% of the fin's chord, its full height | Estimate **Replaced by R14.** |
| E20 | ~~Spinner~~ | 1.7 ft long, 0.64 ft radius at its base | Estimate **Replaced by R3 (confirmed, radius 0.65 ft).** |
| E21 | Propeller plane | station 1.0 ft | Estimate |
| E22 | Blade chord | 0.50 ft at the root (0.55 ft out) to 0.32 ft at the tip | Estimate |
| E23 | Blade angle | 42° at the root to 14° at the tip, from the plane of the disc | Estimate; a fine-pitch look, for the picture only |
| E24 | ~~Main gear~~ | legs pivot 5.37 ft out under the wing, wheels 5.0 ft out (track 10.0 ft), axle at station 10.6 ft; wheel 1.30 ft across, 0.45 ft wide | Estimate for a "quite wide" track (P6) **Replaced by R15 (wheels; the pivot just outboard of the wheel stays an estimate).** |
| E25 | ~~Nose gear~~ | pivot at station 3.9 ft, 1.2 ft below the axis; wheel 1.10 ft across, 0.40 ft wide | Estimate **Replaced by R16 (wheel; the pivot, now 1.5 ft below the axis inside the cowl, stays an estimate).** |
| E26 | Gear legs | 0.13 ft (main) and 0.12 ft (nose) radius, round | Estimate |
| E30 | Eye points, side by side | station 11.0 ft, 0.95 ft either side of the centreline, 1.85 ft above the axis (was 11.3 ft and 2.55 ft, which put the eye at the measured canopy's top) | Estimate, from the pilot's head drawn on the three-view's side view (top about +2.2 ft, eye taken 0.35 ft below); needs the seat and a photo from the seat. Which seat the student and the instructor take is not assumed |
| E31 | Datum | the model's origin: the spinner's tip on the propeller axis | A model reference only; the aircraft's weighing datum is in the flight manual, which the project files don't hold |
