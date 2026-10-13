# Public sources for T-6 / CT-156 handling numbers (research, 12 Oct 2026)

Method note: pages were read through a search/fetch tool; many hosts blocked it (USNI, Flightglobal, DTIC, the AETCMAN PDF, the A2A forum all returned 403 or a paywall). Rows marked "snippet" come from a search summary of a page I could not open myself and must be re-checked by a person before ratifying. Nothing here is a flight test report: no public AFFTC/JPATS roll data was found.

Credibility key: FT = flight test; STD = standard; MFR = manufacturer; PIL = pilot write-up; SIM = simulator/training site; FORUM = anecdote.

## 1. Roll rate, time to bank, time constant, aileron force

| Quantity | Value | Aircraft | Conditions | Source (title, URL, page) | Credibility | Vs ours |
|---|---|---|---|---|---|---|
| Full-deflection roll rate | about 150 deg/s | Beech Mk II (T-6A prototype, 1996) | aileron rolls started about 10 deg nose up; speed not stated (a loop at 230 KIAS in the same article) | USNI Proceedings, "Pilot's Report: Flying the JPATS Winner, The Beech Mk II", Jun 1996, https://www.usni.org/magazines/proceedings/1996/june/pilots-report-flying-jpats-winner-beech-mk-ii (403 to me; snippet only) | PIL (snippet, unverified) | Ours ~100 deg/s at 200 KIAS, cap 120: LOW by about a third if this holds |
| Full-aileron roll rate | over 200 deg/s both ways | T-6B (glass-cockpit variant) | 200 kt, series of aileron rolls | Flight International, "Flight Test: Raytheon T-6 Texan II, A better Texan", 4 Jan 2005, https://www.flightglobal.com/flight-test-raytheon-t-6-texan-ii-a-better-texan/58329.article (paywalled; snippet only; a second search could not re-find the figure) | PIL (snippet, unverified; may be a misread) | Ours well below; treat as an upper bound only |
| Max roll rate | 200 deg/s at 10,000 ft | PC-21 | datasheet | Older Pilatus spec table via search; RAAF says "in excess of 200 deg/s" https://www.airforce.gov.au/aircraft/pilatus-pc-21 ; RCAF CT-157 trade press | MFR / air force | Different, hydraulically assisted aircraft; not the T-6 |
| Max roll rate | field exists, value not shown | PC-7 MkX, PC-21 | | https://www.pilatus-aircraft.com/en/pc-7 and /en/pc-21 list "Max Roll Rate" but the value was not in the text I received | MFR | Worth opening the Technical Data page by hand |
| Roll rate | 60 deg/s | "T-6B" | no source cited | gptkb.org aggregator | Unreliable, ignore | n/a |
| Roll response, qualitative | full rate reached quickly, very little stick force, no rudder needed; low roll inertia | PC-9 (RAAF evaluation) | aileron roll | APA "PC-9 Report", https://ausairpower.net/APA-PC-9-Report.html | PIL, no numbers | Consistent with fast onset (our 0.3 s) but gives no figure |
| Roll acceptability | steady roll rate 15-20 deg/s with time constant 1.8 s or less rated satisfactory; about 40 deg/s with 0.3-0.4 s best | research aircraft (not trainers) | NASA pilot-rating study | NASA TN D-5957 (ntrs 19700029309), https://ntrs.nasa.gov/api/citations/19700029309/downloads/19700029309.pdf . Scanned PDF I could not read; figures are a search-engine summary | FT (research), second-hand | Our roll time constant of about 0.3 s sits at the "best" end; our rates are far above "satisfactory" |
| Time to bank 90 deg, Class IV Cat A, Level 1 | 1.4 s (per an AFIT paper) | high-speed combat aircraft | MIL-F-8785C / 1797A | AFIT paper aerospace_12_00012, https://scholar.afit.edu/context/facpub/article/2863/viewcontent/aerospace_12_00012_v2.pdf (403; snippet). The standard's table itself NOT confirmed. Class IV is fighters; trainers are normally Class III or set by contract | STD, second-hand | Our 0-90 deg at 100 deg/s is about 1.2 s with onset: same order as the fighter spec |
| Roll mode time constant limit, Class IV Cat A Level 1 | 1.0 s (one summary; another site says 1.0-1.4 s for Cat A) | Class IV | MIL-STD-1797A | skillsdirectory.com summary; skill-lync explainer; the spec PDFs were blocked | STD, second-hand, weak | Our roll acceleration built over 0.2 s, rate in 0.3 s: well inside |
| Aileron force | no number found | any | | | | |

Notes. The only roll figures for the actual aircraft are two unconfirmed pilot-report numbers (150 and over 200 deg/s). The Air Force and Navy fact sheets, Wikipedia (https://en.wikipedia.org/wiki/Beechcraft_T-6_Texan_II) and Textron give no roll rate. The spread between 150 and 200+ may be variant or speed; both are above ours.

## 2. Flying-qualities standards and G onset

| Quantity | Value | Context | Source | Credibility | Vs ours |
|---|---|---|---|---|---|
| Roll, bank-angle metrics | the spec uses time to reach a bank change (30, 50, 90 deg by class); for large transports 30 deg in under 4 s is "satisfactory", under 6 s "acceptable" | | NASA very-large-transport roll paper (search summary) | research | Not applicable to trainers |
| MIL-STD-1797A status | now a handbook (MIL-HDBK-1797), guidance only | | search summary of the standard's notice | STD | Matches AGENTS.md: references, not walls |
| Gradual G onset | 0.1 to 0.2 G/s | centrifuge, G-LOC studies | PMC "The +Gz-induced loss of consciousness curve", https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3710154/ | peer-reviewed | far below ours |
| Rapid onset | 1 G/s or more; time to G-LOC about 9 s, independent of rate above 1 G/s | same | same | peer-reviewed | Our 4 G/s is "rapid onset" class |
| Training rapid-onset runs | 2.5 to 3 G/s, up to 6 G/s centrifuge limit | military centrifuge | Halldale, "Pulling Gs: Humans in the Centrifuge Loop", https://www.halldale.com/defence/15493-pulling-gs-humans-in-the-centrifuge-loop ; DTIC ADA184302 | training material | Our 4 G/s is inside 3-6; our 8 G/s gate is above the highest centrifuge rate, so it is a ceiling for a snatch pull, not normal flying |
| Aerobatic or trainer pilot G onset rate | not found anywhere public | | | | Our 4 G/s is an estimate with no direct source |
| Pitch short period | spec values (CAP, damping) not retrievable | | | | |

## 3. Engine and power response

| Quantity | Value | Aircraft | Conditions | Source | Credibility | Vs ours |
|---|---|---|---|---|---|---|
| Certification power response | flight idle to 95% takeoff power in 5 s or less; also the lever moved minimum to maximum in about 1 s must not cause surge or overtemp | any certified turbine engine (Part 33) | stabilised idle | 14 CFR 33.73, summary at https://www.customsmobile.com/regulations/14/33.73 (eCFR itself blocked) | STD (a ceiling, not typical) | Our 0 to 100% in 0.2 s is far faster than idle-to-takeoff (5 s allowed). Plausible only for small changes at high power |
| Idle and high idle N1 | ground idle about 52%; acceleration is smoother and faster above about 70% N1 | PT6A family (King Air guidance) | | King Air magazine, https://kingairmagazine.com/?p=3187 | operator article | Supports: response depends on starting power |
| T-6 thrust response | "jet-like" via electronic control; PMU governs torque to 100% +/- 2% | T-6A PT6A-68 | | Arnold AFB fact sheet https://www.arnold.af.mil/Portals/49/documents/factsheet/AFD-140801-066.pdf ; USAF Vance study sheet | gov fact sheet, qualitative | No time given |
| Throttle lag at low PCL | "several seconds" of engine lag at low settings | PC-9 (older governor, no PMU) | RAAF training videos | APA PC-9 report | PIL | The T-6 PMU is meant to feel better; do not copy |
| Torque limits | 100% max, 131-132% transient 20 s (2018 sheet); a later sheet differs | T-6A | | Sheppard / Vance boldface sheets (found via search) | gov training sheet | Matches repo baseline |
| Prop governor lag | no public number | | | | | |

## 4. Aerobatic technique

| Quantity | Value | Aircraft | Source | Credibility | Vs ours |
|---|---|---|---|---|---|
| Loop | entry 230-250 KIAS, torque MAX, begin about 20 deg nose low, 3-4 G, need 3,000 ft | T-6A (MIT simulator maneuver page, not official) | https://maneuver-id.mit.edu/maneuvers-0 | SIM | Our loop at 3.5 G is mid-range |
| Aileron roll | 180-220 KIAS, 80% to MAX, nose 20-30 deg high, 1,000 ft | T-6A | same | SIM | |
| Barrel roll | 200-220 KIAS, 80% to MAX, 45 deg nose high at 90 deg bank | T-6A | same | SIM | |
| Cuban eight | 230-250 KIAS, MAX | T-6A | same | SIM | |
| Split-S | 120-140 KIAS, idle to 80%, 3-4 G pullout, 500 ft+ | T-6A | same | SIM | |
| Chandelle | 200-250 KIAS, about 3 G, 15 deg nose low entry, 40-45 deg nose high at 180 | T-6A | same | SIM | |
| Immelmann | 230-250 KIAS, 3-4 G | T-6A | same | SIM | |
| Cloverleaf | 200-220 KIAS, 2-3 G | T-6A | same | SIM | |
| Wingover | not on that page; no public numbers found | | | | |
| Basic and combination entry | 200 kt for basic, 250 kt for combinations; about 4.0 G in the first phase of the loop, stick force "very slight" | PC-9 (RAAF) | APA PC-9 report | PIL | Loop G 3.5 vs 4.0 on a sister type |
| Loop (WWII type) | entry about 190 mph (165 kt), 4 G max for a loop, about 80 mph (70 kt) at the top inverted, not below 3,000 ft | WWII AT-6/SNJ (A2A sim forum, "Dudley Henriques"), NOT a Texan II | https://a2asimulations.com/forum/viewtopic.php?p=407338 (403 to me; snippet) | FORUM, wrong aircraft | Do not use for the T-6A |
| Pull technique, constant G vs constant pitch rate | no public source states it; descriptions say "gently pull into a 4 g loop" (constant G, easing over the top) | | forum snippets | FORUM | Our constant 3.5 G is consistent |

## What I could not find
- Any measured T-6A roll rate, time to bank, roll time constant or aileron force from AFFTC, NASA or DTIC. The JPATS evaluation data is not public.
- Aileron/stick forces in lb or lb per G for any of the trainers.
- Any public pilot G onset rate for aerobatic flying.
- Idle-to-max time for the PT6A-68 in the T-6, or prop governor lag.
- The actual MIL-F-8785C / 1797A Class IV and Class III roll tables (blocked; second-hand only).
- The AETCMAN 11-248 aerobatic chapter (403).
