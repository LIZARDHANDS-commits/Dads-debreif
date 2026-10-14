# T-38A Talon: sources table

Every number the build script (`build_t38.py`) uses, with its source. The script keeps these numbers in one constants block, and each one names its row here (for example `P3`, `R7`, `E8`). Shared plan Step 3d, items 1 to 3, a first paint pass (item 5) and the rough cockpits (item 7) (`docs/modules/shared/plan.md`, `docs/modules/shared/t38a-plan.md`).

**Status:** first pass of the outside and the Beale paint, and a first pass of the rough cockpits, 14 Oct 2026, **not yet seen by Patrick or Dad**. **No manual page is used for a number:** there is no T-38 manual in the project files. The numbers below are public figures (P), measured off the scaled drawings Dad sent (R), read off Dad's Beale pictures (D), the cockpit's layout read by eye off Dad's cockpit pictures (K) or estimates (E).

## How these were found, and what's missing

- **Public pages were read through web-search summaries only.** From this cloud session the pages themselves could not be opened (af.mil, ntps.edu, globalspec.com and migflug.com did not resolve on 14 Oct 2026). The numbers in rows P1 to P4 are what the search tool quoted. Each should be checked against the page itself by someone who can open it, before the fix list closes.
- **Measured off Dad's drawings (14 Oct 2026).** T2 (Scott Cullen's three-view, 608 × 504 px) and T3 (Willy Peeters' 1/72 drawings, 478 × 418 px) were measured in Python (PIL) at about 1 to 2 px, about 0.1 to 0.25 ft. The pictures themselves, and the overlay sheets made from them, stay out of the repo: only these numbers come in. T1 (the decal four-view) was used for one cross-check (the fin), T4 and T5 (model plans) only to look at.
- **Not shown on any drawing:** the gear legs' pivots, the wing and tail sections' exact shapes, the cockpit, and the intake ducts behind the lip.

## Public figures

| Row | What | Value | Source |
|---|---|---|---|
| P1 | Length, span, height; engines; seats | 46 ft 4 in (14.12 m), 25 ft 3 in (7.70 m), 12 ft 10 in (3.91 m); two General Electric J85 with afterburner; two seats, tandem | USAF fact sheets: [Holloman AFB, T-38 Talon](https://www.holloman.af.mil/About/Fact-Sheets/Display/Article/317293/t-38-talon/), [Vance AFB fact sheet](https://www.vance.af.mil/Portals/61/Docs/Fact%20Sheets/T-38%20Talon%20Fact%20Sheet.pdf), [af.mil fact sheet, archived 2004](https://webharvest.gov/peth04/20041023184005/http://www.af.mil/factsheets/factsheet.asp?fsID=126); the same three sizes on the [Smithsonian's T-38 fuselage page](https://si.edu/object/fuselage-northrop-t-38-talon:nasm_A20040215000) |
| P2 | Length and height as other pages give them | 46 ft 4.5 in "including the nose probe", 12 ft 10.5 in; wing area 15.79 m² (170 ft²) | A spec page, [migflug.com](https://migflug.com/aircraft/t-38-talon/), and [NTPS](https://ntps.edu/?p=3326) (46 ft 4.5 in, 170 ft²), as quoted by the search summary. Secondary; used for the check that the length includes the pitot boom, which the drawings confirm (R1) |
| P3 | Wing and tail geometry, gear tread | Wing: area 170 ft², span 25 ft 3 in, aspect ratio 3.75, taper ratio 0.20, quarter-chord sweep 24°, NACA 65A004.8, dihedral 0. Horizontal tail total area 59.0 ft² (exposed 33.34 ft²); vertical tail total 41.42 ft² (exposed 41.07 ft²). Tread 10 ft 9 in | Yechout et al., *Introduction to Aircraft Flight Mechanics* (AIAA), Appendix D "T-38 performance data", as quoted by the search summary of its [GlobalSpec excerpt](https://www.globalspec.com/reference/36777/203279/appendix-d-t-38-performance-data). Area, span and aspect ratio agree with each other (25.25² / 3.75 = 170.0 ft²) |
| P4 | Wheelbase, track | about 19 ft 5 in, 3.28 m (10 ft 9.1 in) | [Ultimate Specs, T-38 Talon](https://www.ultimatespecs.com/aircraft-specs/northrop-grumman/northrop-grumman-t-38-talon-1961), a general spec site; the size check only |

**What P3 gives the build** (worked out by the script): root chord at the centreline 11.22 ft, tip chord 2.24 ft, leading edge 31.9° back, trailing edge 5.0° forward. T2's top view measures 32.5° and 4.9° on its own, so the textbook and the drawing agree.

## Measured: T2 and T3 (Dad, 14 Oct 2026)

**How each view was scaled (R1).** Each view is scaled from a published size on its own, as the Astra's three-view was; neither drawing carries a usable scale bar at this size.

| View | Measured | Published | Scale used | Notes |
|---|---|---|---|---|
| T3 side (right side, ground line drawn) | pitot tip x 409 to nozzle exit x 14: 395 px | length 46.33 ft (P1) | 8.526 px/ft | Fin top (y 189) to the ground line under the wheels (y 298.5): 109.5 px = **12.84 ft**, against P1's 12.83 ft. So T3's side view fits the published length and height together |
| T3 underside (nose to the right) | pitot tip x 407.5 to exit x 13: 394.5 px; wingtips y 16.5 and 229.5: 213 px | length (P1); span 25.25 ft (P1) | stations 8.515 px/ft, spanwise 8.436 px/ft | At the length's scale the span would be 25.01 ft (1% short) |
| T2 side (left side, no gear, no ground) | pitot tip x 44 to the nozzle petals' end x 592.5: 548.5 px | length (P1) | 11.84 px/ft; turned 1.2° (see below) | |
| T2 top | pitot tip x 44 to exit x 592.5: 548.5 px; wingtips y 13.5 and 312: 298.5 px | length, span (P1) | stations 11.84 px/ft, spanwise 11.82 px/ft | At the length's scale the span is 25.21 ft (0.2% short) |
| T2 front | wingtips x 10 and 308: 298 px | span (P1) | 11.80 px/ft | |

T2's proportions match the published sizes within 0.2%; T3's span is 1% short of its length, so each plan view is scaled along its length by the length and across by the span. **Both drawings' lengths only fit the published span-to-length ratio when the length runs to the pitot boom's tip** (T3 0.540, T2 0.544 against 0.545; without the boom 0.555 and 0.571), which matches P2's "including the nose probe". T2's nozzles end in light-grey petals that a first reading missed (taking the exit at x 581); every T2 number below uses the corrected 11.84 px/ft.

**The model's frame.** T3's side view has its ground line and wheels drawn; its radome tip and nozzle centre lie on one level line. T2's side view is drawn with its belly sloping up toward the tail by about 1.2° relative to T3 (its nose tip sits about 0.9 ft below its nozzle centre). The model's X axis is T3's ground line, and T2's side view is turned 1.2° onto it (aligned on its radome tip and nozzle centre) before it is compared; turned so, its outline lies on T3's within about 0.2 ft. Which line is the aircraft's own fuselage reference line is not known: **question for Patrick** (it would only tilt the model about 1.2° when the app pitches it).

Stations are feet behind the radome tip (the nose cone's point, where the pitot boom starts); heights are feet above it; "out" is feet from the centreline.

| Row | What | Measured | Notes |
|---|---|---|---|
| R1 | Frame, ground | Ground **−4.71 ft** (T3: 40.2 px below the radome tip) | Fin top then at +8.12 ft from P1's height; T3 alone gives +8.13 |
| R2 | Ends | Radome tip to the nozzles' exit **44.17 ft** (T3 44.22, T2 44.13); pitot boom **2.16 ft** (P1 length less 44.17; T3 2.11, T2 2.20) | T2 draws the boom 2 px above the nose's centre; built on the centre |
| R3 | Fuselage top and bottom, T3 side | Top: 0.7 ft +0.35; 1.9 +0.45; 3.0 +0.62; 4.2 +0.86; 5.4 +1.15; 6.6 +1.38; windshield foot 7.5 +1.56. Behind the canopy the dorsal spine: 21.8 +3.55; 23.0 +3.38; 24.2 +3.14; 25.3 +3.03; 26.5 +2.85; 27.7 +2.67; 28.9 +2.50; 30.0 +2.32; 31.2 +2.15; 32.4 +2.03, into the fin's fillet; under the fin the body's top **+1.27** to 40.5, +1.15 at 41.8. Bottom: 0.7 −0.49; 1.9 −0.67; 3.0 −0.79; 4.2 −0.90; 5.4 −1.02; 6.6 −1.14; **7.7 to 24 −1.22** (flat); 28.5 −1.31; 31 −1.43; **33 to 36 −1.49**; then up to −1.12 by 39 | The radome tip is blunt on T3 (0.65 ft tall where the boom starts); built as a small round tip. The belly's rise at 36 to 38 ft is drawn on both T3 (0.35 ft) and T2 (0.5 ft) |
| R4 | Fuselage half-widths, T2 top | 0.2 ft 0.23; 0.8 0.49; 1.5 0.66; 2.2 0.82; 2.9 0.99; 3.6 1.08; 4.2 1.25; 4.9 1.33; 5.6 1.42; 6.3 1.50; 6.9 1.59; 7.6 1.65; **8.3 to 17.8 1.70** (cockpit 3.4 ft wide). The waist over the wing: intakes' outer edge 2.84 at the lip, **2.98** at 19.1 to 19.8, 2.86 at 21.1, 2.69 at 22.5, 2.52 at 23.8, 2.31 at 25.2, narrowing to **2.14 at 26.5**; the engine bay 2.26 at 28.5, **2.52 from 31.3 to 34.6**, then 2.31 at 36.7, 2.09 at 39.4, 1.84 at 41.4 to 42.1 (the body's end), the nozzles 1.73 out at 42.7 | The "Coke-bottle" (area-ruled) waist. The spine's own half-width (T2 top): 1.33 at 21.1, 0.95 at 27.9, 0.57 at 31.3, 0.45 at 32.6, 0.30 at 34.0. The underside view (T3) agrees within its line's width (overlay) |
| R5 | Canopy | Windshield foot **7.5**; windshield frame **10.6 to 10.8**; front and rear canopies meet at **14.8** (a 0.3 ft frame); aft end **20.3**. Top (T3): 8.8 +2.15; 9.5 +2.50; 10.1 +2.85; 10.7 +3.20; 11.8 +3.55; 13.0 +3.79; 14.8 +3.96; **17.1 +4.02**; 18.8 +3.96; 20.3 +3.78. Sill **+1.90** (T3's line under the canopy; T2 front +1.83). Width: **1.25 ft** either side (T2 front 1.27, T2 top 1.23); section rounded | T2 side: windshield foot 7.2, frame 10.1, split 14.4, aft end 19.6 (0.3 to 0.7 ft ahead of T3's). Turned onto T3's line, T2's canopy top lies within about 0.2 ft of T3's. **Disagreement:** the canopy top lies 4.1 ft below the fin top on T3, about 4.4 ft on T2 (turned onto T3's line) and 5.2 ft on T1 (the decal four-view, drawn by eye). The build takes T3 |
| R6 | Intakes | Lip at **18.2** (T2 top 18.2, T3 side 18.2), slanted, its top **1.0 ft** ahead of its bottom (T2 1.1, T3 0.9); centre **2.3 ft out**, opening **1.15 ft** wide and **1.36 ft** tall inside the lip (T2 front); lip outer edge 2.86 to 2.98 out (T2 top); centre height **−0.10** (T2 front −0.20, T3 +0.03) | The splitter gap between intake and fuselage (T2 top, about 0.15 ft) is not modelled |
| R7 | Wing position and surfaces | Leading edge meets the body (2.65 ft out) at **21.95** (T2 21.87, T3 21.96), so at the centreline **20.3** with P3's sweep (T2's root mid-chord gives 20.32, T3's 20.21); tip leading edge 28.2 (T2 28.21, T3 27.7); chord plane **−0.67** (T3 side, the root section drawn edge-on; T2 side about 0.4 ft above the belly there, similar); flat (T2 front, P3). Flaps **2.65 to 6.32 ft out**, ailerons **6.32 to 8.86** (T3: 6.4 and 9.0), both the aft **28%** of the chord (T2's hinge line at 0.69 to 0.74 of the chord) | T2 draws the root chord 9.63 ft and T3 9.04 ft, against P3's trapezoid 9.36 ft there. A full-chord line at 10.4 ft out on both drawings is not modelled (a panel line, maybe the tip fairing's joint) |
| R8 | Tailplane | Half-span **7.0** (T2 top 7.0, T2 front 6.99, T3 7.0); leading edge 36.13 at the body (2.35 out; T2 36.32, T3 35.94), **39.07** at the tip (T2 39.27, T3 38.87); trailing edge **41.0 to 40.9**, near straight (T2 41.2 to 41.05, T3 40.75); so 34.64 at the centreline (extended); height **−1.55** (T3 side −1.6) | Its trapezoid is 57.3 ft² against P3's 59.0 (−2.8%). **Disagreement:** T2's front view puts it 0.5 ft below the wing (−1.17); built nearer T3 |
| R9 | Fin and rudder, T3 side | Top **+8.13** from **37.5 to 40.5** (tip chord 2.9 ft); leading edge **30.3°** back; trailing edge from 40.5 at the top to **42.1** at the body (+1.27); dorsal fillet from the spine (32.0, +2.05) to the leading edge (34.4, +2.8). Rudder hinge **vertical at 39.8**, rudder from the body (+1.27) to **+4.73** | Its area above the body is 41.8 ft² against P3's 41.42. T2 agrees on the top (37.75 to 40.29), the trailing edge's root (42.06) and the rudder hinge (39.78, its top 3.38 ft above the root). **Disagreement:** T2 sweeps the leading edge 38.7° (T1 31°, T3 30.3°), so its fin root reaches about 0.5 ft further forward |
| R10 | Nozzles and tail cone | Two nozzle shrouds side by side, centres **0.88 ft** out, at **−0.15**; from **42.0** to the exit, **0.95 ft** radius at the root tapering to **0.80** at the exit (T3 side 1.88 to 1.52 ft tall; T2 top 1.84 to 1.73 out at the outer edge) | T2 shows the body ending in a step at 42.1 with the shrouds beyond it, their light-grey petals to the exit |
| R11 | Gear (down) | Nose wheel at **7.33**, **1.45 ft** across; main wheels at **27.15**, **1.65 ft** across (T3 side); widths 0.40 and 0.58 ft from the proportions on T3's undercarriage details; the main leg is inboard of its wheel with a door outboard of the wheel (T3 detail "Main gear port, front view"), the door from 26.4 to 28.5 ft and from −0.85 to −3.70 (T3 side) | Track from P3 (10.75 ft). The wheelbase comes out 19.82 ft against P4's 19 ft 5 in (19.42; a secondary site) |
| R12 | Speed brakes (closed) | Two panels under the fuselage, **23.8 to 25.4** ft, **0.6 to 1.55 ft** out each side (T3 underside, by eye) | That these two panels are the speed brakes is **a guess** from where they sit; no drawing labels them |

## Where the sources disagree (both written down)

| What | Values | Used in the build | Why |
|---|---|---|---|
| Length | 46 ft 4 in (P1); 46 ft 4.5 in (P2) | 46 ft 4 in, to the pitot boom's tip | Fact sheets; both drawings confirm the boom is included (R1) |
| Height | 12 ft 10 in (P1); 12 ft 10.5 in (P2) | 12 ft 10 in | Fact sheets; T3 gives 12.84 ft |
| Span against length | T3 1% short of P1, T2 within 0.2% | Each view scaled both ways (R1) | |
| Side views' level | T2's belly slopes up aft about 1.2° against T3's | T3's ground line | T3 has the ground and wheels drawn; question for Patrick on the fuselage reference line |
| Canopy height against the fin | Canopy top to fin top 4.1 ft (T3), about 4.4 ft (T2, turned), 5.2 ft (T1) | T3 | The model's frame; T1 is a decal maker's drawing by eye |
| Canopy stations | T2 0.3 to 0.7 ft ahead of T3 (windshield foot 7.2 against 7.5, aft end 19.6 against 20.3) | T3 | The model's frame |
| Wing root chord | 9.63 ft (T2), 9.04 ft (T3) | P3's planform (9.36 ft there) at the drawings' mean position | P3's area and planform are a published source; the drawings set only where it sits |
| Tailplane area | 57.3 ft² (T2 and T3's mean planform), 59.0 ft² (P3, "total") | The drawings | 2.8%; P3's total may count the part inside the body differently |
| Fin leading-edge sweep | 30.3° (T3), 31° (T1), 38.7° (T2) | 30.3° | Two of three agree; T3's fin area then matches P3 within 1% |
| Tailplane height | −1.6 (T3 side), −1.17 (T2 front) | −1.55 | The model's frame is T3's |
| Fin-band stars | Dark (black) on T6 and T7; the plan's description says white | Dark (`STAR_COLOUR`) | Followed the pictures. **Question for Dad** |
| Wheelbase | 19.82 ft (T3), 19 ft 5 in (P4) | T3 | P4 is a secondary site |

## Paint: the Beale AFB scheme (T6 profile print, T7 photo; Dad, 14 Oct 2026)

T6 is a side-view print of a Beale AFB 9th Reconnaissance Wing T-38 (left side, nose left); T7 is a photo of a Beale T-38 in flight, "BB" on the tail, near side-on, also from the left. Both stay out of the repo and nothing is copied from them; colours and positions are read off them. Positions come from T6, scaled to its own length (pitot tip x 51 to exit x 459: 8.81 px/ft; the radome tip at x 69), stations from the radome tip. T7 is perspective, so it confirms what is there rather than where. **Not yet seen by Patrick or Dad.**

| Row | What the pictures show | Value used (the script's paint block) |
|---|---|---|
| D1 | Colours (sRGB 0 to 255, read off T7 away from reflections) | Gloss black (20, 20, 23) (T7 reads 8, 7, 14 in shade); red (180, 28, 36) (T7: "BB" 165, 27, 38; the fin band 173, 23, 27); bare metal (185, 180, 174) (T7: 197, 180, 170 in the sun) |
| D2 | Bare-metal tail cone and nozzles | From **41.1 ft** aft (T7 about 3.7 ft and T6 about 2.7 ft ahead of the exit; the mean) |
| D3 | A red band across the fin's top, with five small stars | Band the top **0.5 ft** (T6); five stars, **dark** (T6 and T7; see "disagree") |
| D4 | "U.S. AIR FORCE" in red on the intake's side | Centre **25.3 ft**, +0.10 ft, **4.6 ft** long (T6) |
| D5 | A red low-visibility star-and-bar behind it | Centre **29.6 ft**, +0.20 ft, 1.8 ft across the bars, 0.9 ft circle (T6); drawn as a red outline |
| D6 | A red code letter "U" low on the aft fuselage | Centre **34.5 ft**, −0.55 ft, 0.75 ft tall (T6, T7) |
| D7 | A red rescue arrow and a red stencil block below the canopy split | Arrow at 14.5 ft, +1.5 ft, 0.35 ft; block at 14.3 ft, +0.7 ft, 1.1 by 0.14 ft (T6; T7 shows both). The stencil's words are not drawn |
| D8 | On the fin, top down: the band, a small badge, "BB", then the serial on T7 ("9th RW" on T6) | Badge (a plain red shield outline) 2.84 ft below the top at 35% of the chord, 0.7 ft tall; "BB" 4.08 ft below, at 38%, **0.9 ft** tall; "247" 5.27 ft below at 42%, 0.62 ft tall; a small "AF" ahead of it. T7's serial reads "247" with two small lines of letters ahead of it: the top line is taken as "AF"; **the year digits can't be read, so they are left off** (the full serial is not known) |
| D9 | Lettering and insignia | Blender's built-in face, sized to the pictures; the badge and star-and-bar are simple geometric stand-ins. The real stencil face and the unit badge artwork are not copied |
| D10 | The right side | Not photographed; taken as the left side's mirror (**assumption**), lettering flipped so it reads correctly |
| D11 | Gear legs, wheels | Not seen (T7 is in flight, T6 shows none): light grey legs and dark tyres, **estimate** |
| D12 | The photo-angle render | The left side, a little ahead and above, long lens: by eye, not a fitted camera |
| D13 | Canopy | Clear, with black frames (T6, T7); drawn as a thin see-through surface with a slight tint (**estimate**) |

Not drawn yet: the small red marking above the badge, the white light on the fin (T6), the red line along the fuselage side (T6), the warning stencils and the canopy's red tips seen on T7.

## Cockpit: what sits where (K rows; shared plan Step 3d item 7, first pass, 14 Oct 2026)

Dad, 14 Oct 2026: "It works now...great work...now lets workout the rough T-38A cockpit". "Rough" means shapes and layout, no working instruments. The pictures below are references for **where things are and their proportions, read by eye**; none carries a scale, so every size in the cockpit is an estimate (E12 to E22). They stay out of the repo, and nothing is copied or traced from them: the gauge faces, panels and placards are simple shapes drawn by the script in the positions read off them. **Not yet seen by Patrick or Dad.**

| # | Reference picture (Dad, 14 Oct 2026) | Use |
|---|---|---|
| T8 | A photo of a T-38 front cockpit straight on: glare shield, main panel, consoles, stick | the panel's layout and the gauges' relative sizes, colours |
| T9 | An airliners.net photo of a front cockpit from above and behind (canopy open) | seat, harness, consoles, throttles on the left console, stick and boot, colours |
| T10 | A flight-sim screenshot of the front cockpit from the pilot's eye | the eye's height against the glare shield and the windshield bow, mirrors and standby compass; a cross-check only |
| T11 | T.O. 1T-38A-1, Fig. 1-6 sheet 1, p. 1-7 (Dad's picture, 14 Oct 2026; not in the project files: layout by eye only, no numbers taken from it) | what sits where: instrument panel, left and right subpanels, landing gear lever, throttle quadrant on the left console, pedestal, control stick, consoles, AOA indexer, standby compass, rear-vision mirrors |
| T12 | PaperTrainer's "U.S. Air Force Northrop T-38 Cockpit Configuration Trainer" poster (copyright, for the Air Force Association) | the panel's and consoles' straight-on proportions and every gauge's place and relative size; never copied or traced |

Precedence for layout (the coordinator, 14 Oct 2026): T11 and the photos first for what is where, T12 for the panel's straight-on proportions, T10 only as a cross-check.

| Row | What | Read off | Used in the build |
|---|---|---|---|
| K1 | The main instrument panel under a glare shield, the lower panel below it, a pedestal down the middle to the floor with the stick ahead of it, consoles each side | T8, T11, T12 | `board`, `glare_shield`, `pedestal`, `console` |
| K2 | The panel's outline: a flat top over the middle, sloping shoulders, the main panel's foot | T12 (flat to 0.47 ft either side, shoulders to 1.075 ft out and 0.31 ft down, foot 0.83 ft down at E14's scale), T8 | `PANEL_TOP_FLAT_U`, `PANEL_SHOULDER`, `PANEL_MAIN_BOTTOM_V`; past the shoulders the panel reaches to the glass and walls |
| K3 | The lower panel, wider, with two knee wells either side of the pedestal; black switch panels on it and the radio heads on the pedestal | T12, T8, T11 | `PANEL_LOWER`, `PANEL_BLOCKS` |
| K4 | Gauges: the attitude indicator top centre (its centre 0.07 ft left of the centreline, on T12 and T8 alike), the HSI under it; airspeed and Mach left of the attitude indicator, the altimeter right of it, the vertical velocity right of the HSI; small gauges in a column on the left; on the right the engine gauges in two columns, then four columns lower down, and a larger gauge far right | T12 positions and sizes, T8, T10 | `PANEL_GAUGES`, `PANEL_FRAMES` (square black backings of the five main instruments) |
| K5 | The fire lights at both ends of the main panel, warning lights on top, three gear lights and the landing gear lever upper left; red lights on the lower panel | T12, T11, T8 | `PANEL_LAMPS`, `GEAR_LEVER` |
| K6 | The AOA indexer on the glare shield's top centre; the standby compass hung from the windshield bow upper right; a rear-view mirror on the bow each side | T11, T12, T10 | `AOA_INDEXER_Y`, `STANDBY_COMPASS`, `MIRRORS` |
| K7 | Left console: a panel, the throttle quadrant with two levers side by side, a trim strip, more panels; right console: a caution-light panel, switch panels and the map case aft | T12, T11, T9 | `CONSOLE`, `THROTTLE`, `CONSOLE_PANELS` |
| K8 | The rear cockpit: the same layout, moved with the eye (E10: 5.0 ft aft, 0.35 ft up); its panel higher again (E21), under a shroud over the front seat's back, with its own windscreen on top (E20). No picture of the rear cockpit was sent; "check the drawings": the outside drawings (T2, T3) show only the canopy, so this row is a copy of the front with estimates | E10, E20, E21 | `REAR_SHIFT`, `REAR_PANEL_RAISE`, `shroud`, `inter_windscreen` |
| K9 | The ejection seat: cushion and bucket, back, headbox; khaki harness straps; yellow handgrips at the front of the seat's sides | T9 | `SEAT`, `harness`, `seat_handles` |
| K10 | The stick in the middle with a black boot; rudder pedals in the footwells either side of the pedestal | T8, T9, T11 | `STICK`, `PEDALS` |
| K11 | Colours: medium grey walls and consoles, light grey panel, black glare shield and switch panels, grey seat cushions, khaki harness, yellow handles | T8, T9 (by eye) | `COCKPIT_RGB`, `PANEL_INK` |

**The outside changes that come with it:** the fuselage's top is cut away over the cockpit (E12) and a plain tub (`cockpitWell`, E13) closes it, so the outside files never show a hole; the canopy glass is an open shell (no floor across the sill, no ends), and the three bows are arches standing in from the glass (E19), so from a seat they read as glass and frames. The rear cockpit's own windscreen (first fix list, item 4) is drawn as an estimate (E20).

**Eye checks** (printed by the build, 14 Oct 2026; E10's eye points unchanged):

| | Front | Rear |
|---|---|---|
| Eye over the sill | 1.10 ft | 1.45 ft |
| Eye over the seat cushion (E16) | 2.55 ft (about 31 in, a seated eye height) | 2.55 ft |
| Glass over the eye; over a helmet (0.45 ft over the eye, E16) | 0.67 ft; 0.29 ft | 0.67 ft; 0.21 ft |
| Glare shield's lip below the eye line (seen over it) | 13.0° (yes) | 8.7° (yes) |
| Bow's inside top above the eye line | windshield bow +4.6° | own windscreen +13.5° |
| The front seat's headbox from the rear eye | | level with the eye (0.0°): straight ahead the rear seat looks at it, over the rear glare shield |

Cross-check against T10 (by eye): the sim's view puts about 20° between the windshield bow's inside top and the glare shield; the model has 17.6° (+4.6° to −13.0°). Close; an eye about 0.1 ft lower would match. Left as built until Patrick or Dad looks from the seat.

## Estimates (no source yet)

Every row here is an **estimate** until a drawing, a photo, Patrick or a manual page replaces it.

| Row | What | Value | How chosen |
|---|---|---|---|
| E1 | Wing section shape | NACA 4-digit symmetric thickness at 4.8% | Stands in for P3's NACA 65A004.8 (same thickness, a slightly different shape) |
| E2 | Dorsal spine's buried base and roundness | base +0.9 ft, superellipse power 2.4 | Hidden inside the body |
| E3 | Intake section roundness and duct | power 2.6; inner lip 85% of the outer, duct end 75%, 1.6 ft deep, dark | To show an opening; the real duct is not drawn |
| E4 | Tailplane thickness | 4% | Thin, as the wing |
| E5 | Tailplane pivot | 37.6 ft, at the tailplane's height | The quarter-chord of its mean chord |
| E6 | Fin root (buried) and thickness | +0.9 ft; 4.5% | |
| E7 | Nozzle inner wall | 0.70 ft radius at the exit, 0.62 ft 1.0 ft inside, dark | |
| E8 | Gear pivots and legs | Nose pivot 7.0 ft, −1.0 ft; main pivot at the wing's lower skin (−0.95 ft), 0.45 ft inboard of the wheel; legs 0.17 ft (main) and 0.12 ft (nose) radius. The main gear folds inwards and the nose gear forwards: **not confirmed** | |
| E9 | Pitot boom shape | 0.11 ft radius for the first 0.55 ft, tapering to 0.045 ft, 0.04 ft at the tip | |
| E10 | Eye points | Front 12.3 ft, +3.0 ft; rear 17.3 ft, +3.35 ft (the rear seat sits higher) | Under the canopy's peak; needs the seats and a photo from each |
| E11 | Datum | the model's origin: the radome tip | A model reference only; the aircraft's weighing datum is in the flight manual, which the project files don't hold |
| E12 | Cockpit opening | the fuselage's top cut away from 9.6 to 19.9 ft, at the sill (R5, +1.90 ft) | From under the glare shield to the spine's front |
| E13 | Tub | walls 0.08 ft in from the skin; floor −0.75 ft in front, −0.40 ft behind a step at 13.9 ft (the rear seat 0.35 ft higher, E10); the footwell's front at 9.0 ft, its ceiling at +1.33 ft (the knee wells' top) | Built round the eye and seat heights (E16) inside the measured fuselage (R3, R4) |
| E14 | Panel scale | 2.15 ft across the main panel's shoulders: the attitude indicator's frame then 4.7 in, the airspeed indicator 2.9 in across, the engine gauges about 1.8 in | Between T8 scaled by a 5 in attitude indicator (2.27 ft) and what fits inside the canopy (R5) |
| E15 | Panel and glare shield | panel's top centre 10.05 ft, +2.47 ft, its face leaning 12° back from upright; glare shield from 9.5 ft (the deck) to a lip 0.3 ft aft of the panel's top and 0.08 ft over it, 0.1 ft thick | The panel about 2.3 ft ahead of the front eye, the glare shield seen over at 13° down (eye checks) |
| E16 | Seat | cushion top +0.45 ft (2.55 ft under the eye), pan from 11.35 to 12.75 ft, 1.24 ft wide (bucket 1.44 ft); back to 13.08 ft, +2.55 ft, about 9° back; headbox 13.05 to 13.65 ft, +2.55 to +3.35 ft, 0.84 ft wide; a helmet's top 0.45 ft over the eye (for the check only) | A seated eye height of about 31 in; the headbox inside the canopy |
| E17 | Consoles, throttles | consoles from 10.45 to 12.80 ft, tops +0.97 ft, from 1.17 ft out to the wall (about 0.4 ft wide, T12's proportion); throttles at 11.25 ft, 1.28 and 1.44 ft out, grips up to +1.30 ft, in a slot from 10.91 to 11.60 ft | |
| E18 | Stick, pedals | stick from the floor at 11.15 ft to its grip's top at 11.08 ft, +0.90 ft; pedals at 9.45 ft, 0.40 ft either side, −0.70 to −0.25 ft, hung from the footwell's ceiling | Reach from the seat (E16) |
| E19 | Canopy bows | standing in from the glass 0.12 ft (the windshield bow, thick on T10) and 0.08 ft (the split and the aft frame) | |
| E20 | The rear cockpit's own windscreen | a flat pane at 14.98 ft, the canopy's inside section above the rear panel's shroud | The first fix list (item 4) names it; its shape and place are not measured |
| E21 | Rear panel, shroud | the rear panel 0.15 ft higher than the front one moved with the eye (its top +2.97 ft); its shroud from behind the front headbox (13.75 ft, top +2.55 ft) rising to the rear panel's top | So the rear glare shield sits over the front seat's back |
| E22 | Standby compass, mirrors | compass at 10.85 ft, 0.55 ft right, +2.82 ft, 0.16 ft across, on a rod from the bow; mirrors at 10.82 ft, 0.70 ft out, +2.85 ft, 0.28 by 0.14 ft, on rods out to the bow | Placed by eye to T10 and T11 |

## Size checks (first pass, 14 Oct 2026)

Printed by the build:

| | Model | Source | Difference |
|---|---|---|---|
| Length (pitot tip to nozzle exit) | 46.33 ft | 46.33 ft (P1); 46.38 ft (P2) | 0.0 in; −0.5 in |
| Span | 25.25 ft | 25.25 ft (P1) | 0.0 in |
| Height (ground to fin top) | 12.83 ft | 12.83 ft (P1); 12.88 ft (P2) | 0.0 in; −0.5 in |
| Wing area (trapezoid) | 170.0 ft² | 170 ft² (P3) | 0 |
| Tailplane area (trapezoid, measured) | 57.3 ft² | 59.0 ft² (P3) | −1.7 ft² |
| Fin area above the body (measured, fillet included) | 41.8 ft² | 41.42 ft² (P3) | +0.4 ft² |
| Main wheel track | 10.75 ft | 10.75 ft (P3) | 0 |
| Wheelbase | 19.82 ft | 19.42 ft (P4) | +4.8 in |

Length, span, height, wing area and track are built to the published figures, so those checks catch a mistake in the script. The tailplane, fin and wheelbase are real checks of the measured shapes.

## Overlay check (first pass, 14 Oct 2026)

The model's square-on side and top silhouettes (40 px per ft) laid over the drawings, each drawing scaled as in R1: the side on T3 and on T2 (T2 turned 1.2° onto T3's line through its radome tip and nozzle centre), the top on T2 and on T3's underside (mirrored). The sheets contain the drawings, so they stay out of the repo. By eye, at the drawings' line widths (about 0.1 to 0.2 ft):

- **Top, on both:** wing, tailplane, the waist, the intakes and the nose within about 0.1 to 0.2 ft; T3's outer wing leading edge about 0.2 ft ahead of the model's.
- **Side, on T3:** nose, canopy, spine, fin, belly, nozzles and both wheels within about 0.1 to 0.2 ft. The main gear door is a flat plate in the model where T3 draws a rounded fairing.
- **Side, on T2:** within about 0.2 ft, except the fin's leading edge near its root (T2 about 0.5 ft further forward, the sweep disagreement in R9) and the canopy's frames (T2 0.3 to 0.7 ft further forward, R5).

## First fix list (from the overlays and the drawings; **not built**, for the refine pass, item 4)

1. **Fin leading edge:** T2 sweeps it 38.7°, T3 30.3°, T1 31°; the model follows T3. Wants a photo square-on to the fin.
2. **Main gear:** the leg's door is a flat plate; T3 draws a rounded fairing tapering to the wheel. The pivots, the leg's rake and which way each leg folds are estimates (E8); the wheel wells and doors under the fuselage are not drawn.
3. **Intakes:** no splitter plate or boundary-layer gap (about 0.15 ft on T2's top view); the lip is a plain rounded ring.
4. **Canopy:** frame stations differ by 0.3 to 0.7 ft between T2 and T3 (R5); the canopy's hinges and the frames' detail are not drawn. The rear cockpit's own windscreen is drawn since the first cockpit pass, as an estimate (E20).
5. **Tailplane:** 2.8% under P3's area; its height is −1.6 on T3 and −1.17 on T2's front view (R8). A fairing at its root on both side views is not drawn.
6. **Tail end:** T2 draws the body ending in a step at 42.1 ft with petalled nozzles beyond; the model's shrouds are plain tapered tubes, and the fairing between the two nozzles is not shaped.
7. **Wing:** the section is a stand-in (E1); no root fillet; the full-chord line at 10.4 ft out is not drawn.
8. **Lower aft fuselage:** both side views draw a long shallow fairing under the aft fuselage from about 33 to 41 ft; the model's belly only rises behind 36 ft. What the fairing is (engine-bay doors?) is not known.
9. **Wheelbase:** 19.82 ft off T3 against 19 ft 5 in on a secondary site (P4).
10. **Which line is level:** T3's ground line or T2's drawing line (1.2° apart) as the model's X axis: question for Patrick (R1).
11. **Paint not drawn yet:** the small red marking above the badge, the fin's white light, the red line along the fuselage side (T6), warning stencils, the canopy's red tips (T7); the badge and star-and-bar are stand-ins; the fin band's stars are dark on both pictures where the plan said white (question for Dad).

## Cockpit fix list (first pass; **not built**, for Patrick and Dad to look at)

1. **No scale:** none of the cockpit pictures carries one, so every size is an estimate (E12 to E22); a tape measurement, a scaled drawing of the cockpit or Patrick's or Dad's eye from the seat would settle the panel's width, the seat's height and the eye points (E10).
2. **Eye height:** against T10 the model's front eye may sit about 0.1 ft high (eye checks).
3. **Rear cockpit:** a copy of the front (K8); the real rear panel, its shroud and its own windscreen (E20, E21) want a picture of the rear cockpit.
4. **Gauges:** flat faces with ticks, no needles, numbers or placards; the attitude indicator and HSI are simple; nothing moves (the app says so).
5. **Subpanels:** drawn in the panel's plane; T11 shows the left and right subpanels angled toward the pilot.
6. **Not drawn:** the canopy breaker tool, canopy locking lever, utility light, compass correction card holders, landing gear alternate release handle (all on T11), the seat's rails, oxygen hose and canopy breakers, the canopy's hinges and inside frames, the rear cockpit's gear lever.
7. **Seats** are blocks: cushions, back and headbox, a hint of the harness.
