# C-130J-30 Super Hercules: sources table

Every number the build script (`build_c130j.py`) uses, with its source. The script keeps these numbers in one constants block, and each one names its row here (for example `P1`, `R10`, `E7`). Shared plan Step 3e, items 1 to 3, a first paint pass (item 5) and the first delivery (item 6) (`docs/modules/shared/plan.md`, `docs/modules/shared/c130j-plan.md`).

**Status:** first pass of the outside and the paint, 15 Oct 2026, **not yet seen by Patrick or Dad**. Dad's picks (15 Oct 2026, card answers): the stretched **C-130J-30**, in **USAF grey with the Ramstein "RS" tail** (picture C2). **No manual page is used for a number:** there is no C-130J manual in the project files. The numbers below are public figures (P), measured off the pictures Dad sent (R), read off Dad's paint pictures (D) or estimates (E). Nothing here flies: the model is a picture.

## How these were found, and what's missing

- **Public pages were read through web-search summaries only** (15 Oct 2026), as the T-38A's were; the pages themselves were not opened. Each should be checked against the page itself by someone who can open it, before the fix list closes.
- **Measured off Dad's pictures (15 Oct 2026)** in Python (PIL) at about 1 px: C1 (794 × 1030 px) to about 0.2 ft, C3 (640 × 799 px) to about 0.3 ft. The pictures, and the overlay sheets made from them, stay out of the repo: only these numbers come in. C2 (a 311 × 220 px photo) and C4 (Haryo Panji's poster) were used for paint and placement by eye only.
- **Which pictures show the stretched -30.** C1 (the line-art three-view) and C4 (the poster, an AFRC 403rd Wing aircraft) draw the **short** C-130J: their length is 0.738 and 0.756 of their span, against 0.737 for the short C-130J and 0.850 for the -30. C3 (the dimension drawing, 112 ft 9 in) draws the **-30**: 0.844. C2 is a Ramstein -30. So the shape is measured off C1, the clearest outline, and the published plugs (P4) are put in; C3 checks where they go (R1).
- **Not shown on any picture:** the wing and tail sections' exact shapes, the gear's struts and how they retract, the prop blades' shape, the flight deck inside.

## Public figures

| Row | What | Value | Source |
|---|---|---|---|
| P1 | Length, span, height (C-130J-30) | 112 ft 9 in (34.37 m), 132 ft 7 in (40.38 m), 38 ft 9 in (11.81 m) | RCAF CC-130J fact sheet (canada.ca, `rcaf-arc` "fact-sheet-cc-130j-hercules-j.pdf"); span 40.4 m on the DND CC-130J procurement page. Other figures: length 34.69 m and height 38 ft 10 in on the [403rd Wing](https://www.403wg.afrc.af.mil/About/Fact-Sheets/Display/Article/192530) and [Yokota](https://www.yokota.af.mil/About-Us/Fact-Sheets/Display/Article/1327644/c-130j-super-hercules/) fact sheets; height 39 ft 5 in on the AMC fact sheet (all as the plan lists them; see "disagree") |
| P2 | Length of the short C-130J | 97 ft 9 in | 403rd Wing fact sheet (as the plan lists it). Sets C1's scale (R1) |
| P3 | Tailplane span | 52 ft 8 in (16.05 m) | Dad's dimension drawing, picture C3 |
| P4 | The -30's stretch | 15 ft: a 100 in plug ahead of the wing and an 80 in plug behind it | [GlobalSecurity, C-130J design](https://www.globalsecurity.org/military/systems/aircraft/c-130j-design.htm) (100 in and 80 in); 15 ft on the [Lockheed Martin C-130J-30 page](https://www.lockheedmartin.com/en-us/products/c130/c-130j-30-super-hercules.html) and the [130th Airlift Wing fact sheet](https://www.130aw.ang.af.mil/About-Us/Fact-Sheets/Display/Article/4525571/fact-sheet-the-c-130j-30-super-hercules/). Search summaries; that the plugs sit ahead of and behind the wing is confirmed by C3 (R1) |
| P5 | Wing area; prop diameter | 1,745 ft² (162.1 m²); 13.5 ft (4.11 m) | Secondary pages: [Aeropedia, C-130J](https://aeropedia.com.au/content/lockheed-c-130j-hercules/) and a simulator spec table ([simviation](https://simviation.com//rinfolocc130.htm)). Size checks only; the prop diameter is used (C1 draws 13.7 ft, R9) |
| P6 | Engines and props | four Rolls-Royce AE 2100D3; six-blade Dowty R391 props | Public ([Dowty](https://www.dowty.com/news/marshall-aerospace-and-dowty-strengthen-c-130j-propeller-support-partnership)); six blades used |

## Measured: C1 and C3 (Dad, 15 Oct 2026)

**How each view was scaled (R1).** Each view is scaled from a published size on its own, as the T-38A's drawings were.

| View | Measured | Published | Scale used | Notes |
|---|---|---|---|---|
| C1 side (left side, nose left, gear down) | radome tip x 46 to the tail cone's tip x 544: 498 px | short length 97.75 ft (P2) | 5.095 px/ft | Fin top (y 59.5) to the wheels' bottoms (y 252.5): 193 px = 37.88 ft, 0.87 ft under P1's 38.75 ft (R15) |
| C1 top (nose left; the image's top is the right wing) | 498 px long; wingtips y 295 and 970: 675 px | P2; span 132.58 ft (P1) | stations 5.095 px/ft, spanwise 5.091 px/ft | At the length's scale the span would be 132.5 ft: C1's plan view is true to the published shape within 0.1% |
| C1 front (drawn turned: its x is up, its y across) | wingtips 675 px; fin top x 747 to wheels x 554: 193 px | P1 span | 5.091 px/ft across, 5.095 up | The same 193 px as the side view |
| C3 side (-30, no gear drawn) | radome tip x 113 to tail x 521: 408 px | length 112.75 ft (P1) | 3.619 px/ft | Heights tied to the fuselage top (y 207.5): no ground to tie them to |
| C3 top (-30, nose left) | radome tip x 110 to tail x 514: 404 px; wingtips y 298 and 776.5: 478.5 px | P1 | stations 3.583, spanwise 3.609 px/ft | Length over span 0.844 (-30: 0.850) |
| C3 front | wingtips x 80 and 539 (its dimension lines): 459 px | P1 span | 3.462 px/ft | Not used for heights (see the overlay check) |

**The plugs, checked on C3.** C1's wing leading edge meets the body 36.5 ft behind the radome tip and its trailing edge 53.0 ft; with the 100 in plug ahead of the wing they would sit at 44.8 and 61.3 ft. C3 measures 45.1 and 62.0 ft. C1's tail tip is 44.75 ft behind its trailing edge; with the 80 in plug, 51.4 ft; C3 measures 50.8 ft. So the plugs go ahead of and behind the wing, and the -30 is C1 with both put into its constant section (E1). The model's length comes out 112.75 ft, P1's figure, with nothing else scaled.

**The model's frame.** C1's side view: stations are feet behind the radome tip, heights feet above it (the tip at y 216), "out" feet from the centreline. C1's stations are the short C-130J's ("short stations"); the build adds the plugs (`stretch()` in the script). The flight deck is ahead of the forward plug, so its short stations are the model's.

| Row | What | Measured | Notes |
|---|---|---|---|
| R1 | Frame, scales, the plugs | as above | |
| R2 | Ground | **−7.16 ft** (the wheels' bottoms, y 252.5) | |
| R3 | Fuselage top and bottom, C1 side | Top: 0.4 +1.18; 1.18 +1.57; 1.96 +1.96; 2.75 +2.16; 3.53 +2.45 (the radome meets the windshield); then the windshield: 4.32 +3.04; 5.10 +4.12; 5.89 +4.91; 6.67 +5.69; 7.46 +6.28; 8.24 +6.87; 9.03 +7.07; 9.81 +7.26; 10.6 +7.46; 11.4 +7.65; 12.2 +7.85; 13.0 +8.05; **+8.15 from 14.1 to the tail** (the top stays level; the tail cone's tip at 97.75, +8.05). Bottom: 0.4 −1.57; 1.18 −1.96; 1.96 −2.36; 2.75 −2.75; 3.53 −2.94; 4.32 −3.34; 5.10 −3.53; 6.67 −3.93; 7.46 −4.32; 8.24 −4.51; 9.81 −4.71; 10.6 −4.91; **−5.10 from 11.4 to 56.1**; the upswept aft body: 57.7 −4.51; 60.1 −3.83; 63.2 −2.65; 66.3 −1.37; 69.5 −0.10; 72.6 +1.37; 75.8 +2.75; 78.9 +4.12; 82.0 +5.59; 85.2 +5.89; 88.3 +6.28; 91.5 +6.87; 94.6 +7.46; 96.2 +7.65 | Ahead of 12.6 ft the build smooths the rows within one pixel (0.2 ft): C1's line art steps by whole pixels there |
| R4 | Fuselage half-widths, C1 top | 0.4 1.47; 1.18 2.06; 1.96 2.46; 2.75 2.65; 3.53 3.04; 4.71 3.63; 6.28 4.42; 7.85 5.00; 9.42 5.60; 11.0 6.19; 12.6 6.58; 14.1 6.78; 15.7 6.97; **7.17 from 17.3 to 72** (14.3 ft wide); 73.4 6.78; 75.0 6.68; 76.5 6.48; 78.1 6.29; 79.7 5.99; under the tailplane hidden; 89.1 3.83; 93.8 2.65; 95.4 2.26; 97.0 1.47 | Aft of 80 ft the build eases through the hidden part (5.3 at 82.0, 4.6 at 85.2) |
| R5 | Section, C1 front | 13.1 ft tall, **14.06 ft wide**, widest **+1.19 ft** (0.475 of the way up), near round with a slightly flatter bottom | Built with superellipse powers 2.1 above and 2.4 below (by eye) |
| R6 | Main-gear sponsons | Rounded front at 30.0, −2.16 (C1 side); top +1.37 from 38.1 to 54.4; tapering into the belly by 58.7; bottom −4.9; outer side **8.0 ft out** (C1 front; C1's top view 7.7 to 8.25 at its front end); built 8.1 | Short stations; they move with the wing |
| R7 | Cargo ramp and door, closed | Ramp from its hinge at **58.44** to the joint at **67.71**; the door from there to **81.26** (C1 side: the ramp's side edge, the step between ramp and door) | Their side edges are E3 |
| R8 | Flight deck windows | Side windows: 6.28 to 9.70 at +3.61, 7.73 to 10.54 at +6.28, two panes; a lower window 6.10 to 8.15, +0.60 to +2.55 (C1 side). The windshield from the radome's joint (3.73, +2.43) to (7.18, +6.21) on the side view, in panes from 0.2 to 3.7 ft out on the top view | Pane outlines by eye on both views |
| R9 | Nacelles, spinners, props | Centres **16.6 and 33.4 ft out** (C1 top and front); hubs **+5.93** (inner) and **+6.78** (outer) (C1 front; C1 side +6.08 for the near one); prop plane at **29.13**, spinner tip 27.3 (C1 side); nacelle 3.5 ft wide (C1 top), top +2.15 above the hub, chin −2.4 below it at the front (C1 side and front), its tail at 57.9, −0.24 (C1 side: past the trailing edge, as C1's top view shows); prop discs **13.7 ft** across (C1 front's circles, 70 px) | Short stations; they move with the wing |
| R10 | Wing planform, C1 top | Leading edge **36.6 at the body** (7.2 out), swept back 0.0396 ft per ft out (38.9 at 65.3 out); trailing edge **53.0 straight across to 18.4 out**, then 0.1247 ft forward per ft out (47.4 at 63.3 out); a rounded tip from 63.3 out to the published span | Chord 16.4 ft at the body, 8.6 ft where the tip starts. Planform area 1,742 ft² against P5's 1,745 ft² |
| R11 | Wing height and thickness, C1 front | Chord plane **+7.07** across the centre wing, **flat to 14 ft out**, then rising **2.3°** to +9.13 at 65.3 out (upper surface 1.0°, lower 3.6°); thickness **3.14 ft at the centre wing (19%)**, 0.79 ft near the tip (about 10%) | **Dihedral, not anhedral** (see "disagree"). Section shape: the NACA 4-digit thickness at that ratio (an estimate standing in for the real sections) |
| R12 | Flaps and ailerons, C1 top | Flaps from the body (7.2) to **45.3 ft out**, ailerons from 45.3 to the tip (C1: 64.9; built to 63.3, where the tip starts); both the aft **30%** of the chord (the hinge line at 0.68 to 0.70) | |
| R13 | Gear, down | Main: tandem wheels at **40.5 and 45.5** short (5.0 ft apart), **4.0 ft** across, **1.6 ft** wide, centred **7.03 ft out** (track 14.06 ft) (C1 side and front). Nose: twin wheels at **11.25**, **2.94 ft** across (C1 side) | Wheelbase 40.1 ft on the -30 (nose to the tandem pair's middle) |
| R14 | Tailplane and elevators, C1 top and side | Leading edge 79.78 at 6.19 out, 84.44 at the tip (so 78.32 at the centreline, extended); trailing edge 93.23 at 3.9 out, 90.19 at the tip; elevator hinge straight across at **88.13**; C1 draws the half-span 25.93 ft, **built to P3** (26.33 ft), stretched spanwise; height **+7.95** (C1 side) | Short stations; on the -30 they move with the tail (+15 ft). Trapezoid area 558 ft² (no published figure checked) |
| R15 | Fin and rudder, C1 side | Leading edge from the dorsal fillet (58.6 at the fuselage top, +8.15) to a knee at 74.63, +11.48 and 76.40, +12.46, then straight to the top at 85.18; top flat to 90.9; trailing edge from 90.9 at the top to 95.1 at the body; rudder hinge **vertical at 89.99**, the rudder from **+8.54** to under the fin's cap. C1 draws the top at +30.71; **built to P1's height (+31.59)**: every height above the fuselage top stretched by 1.039 | C3 agrees with P1: its fin top stands 23.5 ft over its fuselage top, C1's 22.6 ft, the model 23.4 ft |

## Where the sources disagree (both written down)

| What | Values | Used in the build | Why |
|---|---|---|---|
| Length | 34.37 m (RCAF; C3's 112 ft 9 in); 34.69 m (403rd Wing, Yokota) | 112 ft 9 in | The plan's choice; C3 and the RCAF sheet agree, and C1 plus the plugs lands on it exactly |
| Height | 38 ft 9 in (RCAF, C3); 38 ft 10 in (403rd Wing, Yokota); 39 ft 5 in (AMC) | 38 ft 9 in | The plan's choice until Patrick picks |
| Span | 40.38 m (RCAF); 40.4 m (DND) | 132 ft 7 in | Rounding |
| C1's height | 37.88 ft at its length's scale, 0.87 ft under P1 | The fin stretched to P1 (R15) | C1's gear and fuselage depth fit (C3's fuselage 13.1 ft deep, C1's 13.25 ft); its fin is the short one: C3's stands 0.9 ft taller |
| **The wing's dihedral** | The brief describes "a slight anhedral as C1's front view shows"; **C1's front view draws the wing rising toward the tips** (chord plane 2.3° outboard of the centre wing), and so does C3's | As drawn: 2.3° up | The pictures are the measured source. **Question for Patrick or Dad** |
| Fuselage width | 14.34 ft (C1 top); 14.06 ft (C1 front) | 14.34 ft | The plan view is the cleaner measure; 0.14 ft a side |
| Prop diameter | 13.5 ft (P5, a secondary page); 13.7 ft (C1's circles) | 13.5 ft | The page; 1.5% |
| Tailplane span | 52 ft 8 in (P3); C1 51.9 ft; C3 measured 53.2 ft | 52 ft 8 in | The drawing's dimension |
| Wing chord at the body | 16.4 ft (C1); 16.9 ft (C3) | C1 | Its planform's area matches P5 within 0.2% |
| Fin trailing edge | Sloping forward to the top (C1); nearer upright, about 1.5 ft further aft at the top (C3) | C1 | The clearer outline; fix list 2 |
| Which wing carries which marking | "USAF" under the left wing, the star under the right (C2); "USAF" over the right wing, the star over the left (C3); C4 draws them on the opposite wings | C2 and C3 | The photo and the drawing agree with each other (D8) |
| Black on the wing | The brief: "black de-icing boots on the wing" leading edges; C2 (from below) shows none; C4 shows black patches beside each nacelle | C4's patches, on the top (D7) | The photo of the aircraft picked shows no black underneath. **Question for Dad** |
| Pylon tanks | C1 draws a tank between each pair of engines; C3 none; C2 shows none | None | The -30 drawing and the photo; fix list 7 |

## Paint: USAF grey, Ramstein "RS" (C2 photo, C4 poster; Dad's pick, 15 Oct 2026)

C2 is a photo of a USAF C-130J-30 from below, "RS" on the fin; C4 is a poster of an AFRC C-130J (the "Flying Jennies" scheme), used only for where markings sit, by eye. Both stay out of the repo and nothing is copied from them. Positions are the -30's stations. **Not yet seen by Patrick or Dad.**

| Row | What the pictures show | Value used (the script's paint block) |
|---|---|---|
| D1 | Colours (sRGB 0 to 255, read off C2) | Grey **(142, 148, 152)** (C2's fuselage reads 160, 172, 178 in sun and 138 to 151 in shade, tinted by the blue sky); black (26, 26, 28) (C2's "RS" 0 to 10; the boots read navy, 50, 93, 140, in the sky's light, taken as black); props (40, 42, 46) (C2: dark) |
| D2 | Overall grey | Every part grey but the marks below (C2, C3) |
| D3 | "U.S. AIR FORCE" in black on the forward fuselage, behind the flight deck | Centre **18.4 ft**, +3.90 ft, **11 ft** long (C4 by eye: 12.5 ft long, a third of the way down the side; C2 confirms it is there). Ahead of the forward plug, so the same station on the -30 |
| D4 | The low-visibility star-and-bar on the aft fuselage | Centre **78.0 ft** (C4's 63.0 ft on the short airframe, plus both plugs), +1.90 ft, 4.2 ft circle, 8.5 ft across the bars; drawn as a black outline (C2 shows an outline) |
| D5 | On the fin: a small flag high up, "RS" in black below it, a serial under "RS" | Flag **14.0 ft above the fuselage top** at 40% of the chord, 3.0 by 1.65 ft (C4: about two thirds up; C2: high, toward the leading edge); **"RS" 7.3 ft above the fuselage top, 3.3 ft tall**, at 42% of the chord (C2). **The serial can't be read on C2, so it is left off** |
| D6 | Black on the fin's leading edge low down, and along the tailplane's leading edge | Fin: from +9.0 to +15.0 ft, 2.4 ft back from the leading edge (C2's dark wedge, C4's black wedge); tailplane: the first **1.6 ft** of the chord along the whole span, top and bottom (C2) |
| D7 | Black beside each nacelle on the wing | On the wing's top, **2.9 ft either side of each nacelle's centre, from the leading edge to 42% of the chord** (C4 by eye). Which surface: C2 from below shows none, so the top; C4's two plan views draw the markings on the opposite wings to C2 and C3, so which of them is the top is not certain |
| D8 | "USAF" and the star-and-bar on the wings | "USAF" under the left wing and over the right; the star-and-bar under the right wing and over the left (C2, C3); centred **50 ft out at 45% of the chord**; "USAF" 12 ft long, the star 4.5 ft across with 9 ft bars; the letters' tops toward the leading edge (C3) |
| D9 | Lettering and insignia | Blender's built-in face, sized to the pictures; the star-and-bar and the flag (seven red stripes on white and a plain blue field, no stars) are simple geometric stand-ins. No artwork is copied |
| D10 | The right side | Not photographed square-on: taken as the left side's mirror (**assumption**), lettering flipped so it reads correctly |
| D11 | Gear, tyres, glass | Not seen: light grey struts, dark tyres, dark glass (**estimate**) |
| D12 | The photo-angle render | From below, ahead and to the right, a long lens: by eye, not a fitted camera |

Not drawn yet: the serial, the small stencils and walkway lines, the anti-collision and formation lights, prop tip colours (C2 shows none clearly; the brief says dark props).

## Estimates (no source yet)

Every row here is an **estimate** until a drawing, a photo, Patrick or a manual page replaces it.

| Row | What | Value | How chosen |
|---|---|---|---|
| E1 | Where the plugs go | Short stations **22.0** (forward) and **56.0** (aft), both in C1's constant section | The outline does not depend on where in the constant section a plug sits; at 56.0 the belly's upsweep starts at 71.1 ft on the -30, against about 72.7 ft on C3 |
| E2 | Sponsons' buried inner side and roundness | inner side 5.0 ft out; superellipse power 3.4 | Hidden in the fuselage; C1's front view draws rounded corners |
| E3 | Ramp and door side edges; how they move | The underside out to 35° below the widest line either side (fits C1's side edge 2.3 ft above the belly at the hinge); the ramp's aft edge swings down, the door's front edge up into the fuselage | From memory, not from a source |
| E4 | Window glass | 0.04 ft proud of the skin | So it shows |
| E5 | Nacelle section and over-wing hump | power 2.4; the top rises to +2.6 over the wing (C1's side view shows a hump there) | By eye |
| E6 | Spinner shape | an ogive from 1.1 ft radius at the prop plane to the tip | By eye |
| E7 | Prop blades | chord 0.80 ft at the root, 1.00 ft at 2.5 ft radius, 0.42 ft at the tip; section angle 42° at the root to 20° at the tip; the tip swept back 0.9 ft (the R391's curved blades, by eye on C3); each prop's blades turned a little differently (static) | Nothing measured; the props don't turn in the model |
| E8 | Gear struts, nose gear | main struts 0.22 ft radius inboard of each wheel, up into the sponson; the main gear "retracts straight up into the sponson" and the nose gear "swings forward" are from memory; nose pivot 10.6 ft, −4.2 ft; nose wheels 0.75 ft wide, 0.55 ft either side of the centre | |
| E9 | Tailplane thickness, elevators' inner end | 9%; the elevators start 1.0 ft out | C1's side view draws the tailplane about 1 ft thick |
| E10 | Fin thickness, rudder top | 2.2 ft at the body to 0.65 ft at the top; the rudder's top under the cap at +29.7 drawn (+30.6 built) | |
| E11 | Eye points | Pilot and co-pilot 7.5 ft behind the radome tip, 1.6 ft either side, +4.8 ft (mid-height of the side windows) | Named points only; no cockpit is built |

## Size checks (first pass, 15 Oct 2026)

Printed by the build:

| | Model | Source | Difference |
|---|---|---|---|
| Length (radome tip to tail cone) | 112.75 ft | 112.75 ft (P1, RCAF); 113.81 ft (403rd Wing) | 0.0 in; −12.7 in |
| Span | 132.58 ft | 132.58 ft (P1) | 0.0 in |
| Height (ground to fin top) | 38.75 ft | 38.75 ft (P1, RCAF); 39.42 ft (AMC) | 0.0 in; −8.0 in |
| Lowest point | −7.15 ft | ground −7.16 ft (R2) | +0.1 in (the wheels' faceting) |
| Wing area (planform) | 1,741.6 ft² | 1,745 ft² (P5) | −3.4 ft² (0.2%) |
| Tailplane span | 52.67 ft | 52.67 ft (P3) | 0 |
| Prop diameter | 13.50 ft | 13.70 ft (C1, R9) | −2.4 in |
| Main wheel track; wheelbase | 14.06 ft; 40.08 ft | measured only (R13) | |
| Triangles | 57,646 (High file), 21,438 (light file) | the T-38A's: 60,179 and 22,909 | |

Length, span, height and the tailplane span are built to the published figures, so those checks catch a mistake in the script (the length comes from C1's scale and the plugs, not from being set). The wing area is a real check of the measured planform.

## Overlay check (first pass, 15 Oct 2026)

The model's square-on side, top and front silhouettes (12 px per ft) laid over the pictures, each scaled as in R1: the **short outline** (`build_c130j.py ... short`, never delivered) on C1, and the -30 on C3. The sheets contain the pictures, so they stay out of the repo. By eye:

- **C1 side:** nose, flight deck, fuselage, belly upsweep, sponson, wheels and tail cone within about 1 px (0.2 ft). The fin stands 0.9 ft taller at the top, as built (R15).
- **C1 top:** wing, flaps and ailerons, nacelles (their tails past the trailing edge included), tailplane and fuselage within about 0.2 ft; C1's pylon tanks are not built; the tip's rounding differs slightly.
- **C1 front:** the wing's rise, the nacelles, sponsons, wheels and fin within about 0.2 ft; the prop discs 0.1 ft smaller in radius (P5 against R9).
- **C3 side:** nose, fuselage, the plugs' effect (wing, sponson, nacelles, upsweep) within about 0.3 ft. C3's fin trailing edge stands about 1.5 ft further aft at the top. C3 draws no gear.
- **C3 top:** wing, tailplane, nacelles and fuselage within about 0.3 ft; C3's tailplane trailing edge about 0.5 ft further aft.
- **C3 front:** drawn at its own scale and probably not square-on (its wings rise more steeply and sit about 2 ft higher against the fin's top than on C1); not used for heights.

## First fix list (from the overlays and the pictures; **not built**, for the refine pass, item 4)

1. **The wing's dihedral:** built rising 2.3° as C1 and C3 draw it; the brief said a slight anhedral. Question for Patrick or Dad.
2. **Fin trailing edge:** C1 slopes it forward toward the top, C3 draws it nearer upright (about 1.5 ft further aft at the top). Wants a photo square-on to the fin.
3. **Flight deck windows:** flat dark plates on the skin, outlines by eye; no frames; the eyebrow windows over the flight deck are not drawn.
4. **Nacelles:** no intake scoop under the spinner, no exhausts; the over-wing hump is an estimate (E5).
5. **Props:** the blades' shape, pitch and sweep are estimates (E7); static; 13.5 ft against C1's 13.7 ft.
6. **Gear:** no wheel wells or doors; the struts and how each gear retracts are estimates (E8).
7. **Pylon tanks:** C1 draws them, C3 and C2 don't; not built.
8. **Ramp and door:** their side edges are an estimate (E3); the underside of the tail cone is only the table's shape.
9. **Fuselage details not drawn:** the crew door, paratroop doors, the cargo hold's round windows (C1), antennas and lights.
10. **Paint not drawn:** the serial (can't be read on C2), stencils and walkways, lights; the flag and insignia are stand-ins; which surface C4's black wing patches are on (D7) is not certain, and the brief's wing "boots" are a question for Dad.
11. **Height:** 38 ft 9 in against 38 ft 10 in and 39 ft 5 in (P1); Patrick picks.
12. **Wing root:** the wing passes through the fuselage's top, which makes a hump like C1's root fairing; the fairing's own shape is not drawn.
