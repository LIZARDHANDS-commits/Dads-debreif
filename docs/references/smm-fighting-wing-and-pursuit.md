# Fighting wing, pursuit curves and formation visual cues: what the manuals say

**What this is.** Everything the manuals say that bears on the live wingman flying fighting wing (spec 7e of the Formation Sim, `docs/modules/turn-sim/spec.md`): the visual cues, the fighting wing position and its references, lead, lag and pure pursuit, turn entry and exit, the vertical and energy, separation, and the 4-ship and rejoin hand-overs. It also lists what spec 7e is missing or gets wrong, and where sources disagree.

**Date:** 14 Oct 2026. Researcher: Sonnet, read-only job. Nothing in the spec or code was changed.

**Sources and how they are cited.**
- **SMM**: CT-156 Harvard II Standard Manoeuvre Manual, Change 3, 28 Aug 2024. Cited by section, paragraph and figure ("SMM 12.30 para 72, Fig 12.24"). The printed page is given where the SMM's own index gives it (12.29 starts p.198; 12.30 p.199; 12.2 p.176-177; 16.15 p.265; 16.16 p.265-268; 16.17 p.269). Otherwise the location is the split PDF's part and page ("part 7 PDF p.27"). The SMM may be quoted in the repo with its page (Patrick, 13 Oct 2026, ALL-41); quotes here are short and everything else is paraphrased.
- **EFIG**: instructor guide slides, 24 Jun 26, cited "EFIG p.N" (PDF page; the slide's own footer reads "2/3 - Mar 2025" on p.391).
- **Gen Book** V8.9: cited "Gen Book p.11" (Advanced Formation Training Rules).
- Not used: the T-6A NFM (an aircraft manual, not technique), the CFAFM (controlled document, never cited), AETCMAN 11-248 (searched: it has no fighting wing, pursuit or tactical formation text; its T-6 formation sight pictures are in `docs/references/aetcman11-248-cockpit.md`).
- Files read: SMM text `smm.txt` lines 4830-5650 (12.1-12.31 in full), 7570-9350 (chapter 16 in full, 17.2-17.5 where formation is named), 6895-7245 (14.4, 14.8, 14.12-14.14), whole-file greps of all four texts (fighting wing, pursuit, lag, aspect, closure, line of sight, HCA, sweep, cone, collapse, stack, yo-yo, S-turn, miss, bubble, offset, flow); EFIG pp.72-76, 94-100, 370-384, 390-393 and the whole-file grep; Gen Book p.10-11; the five fighting wing figure crops in `docs/references/figures/`; the figure images 12.19, 16.10, 16.29 and EFIG slides p.390-391 (rendered).
- Marks: **(inferred)** = my reading, not stated by the source. **(not found)** = I searched and the manuals do not say it.

---

## 1. Everything found, by topic

### 1.1 The visual cues (the pilot's cross-check)

| # | What it says | Reference |
|---|---|---|
| C1 | Five cues are "foundational" for an effective cross-check in close formation, tactical formation and rejoining: closure, aspect angle, range, line of sight (LOS), heading crossing angle (HCA). Know them as concepts and as words, so you can talk to the instructor. | SMM 12.2 para 4, p.176 |
| C2 | **Closure**: how fast the range to the other aircraft is shrinking or growing. Highest when both approach head-on. In pursuit, judge it by how fast the other aircraft grows in size. Getting big quickly = high closure. The change from low to high closure is subtle, so watch it all the time; in close formation, spotting subtle closure early helps stop position errors growing. | SMM 12.2 para 5, pp.176-177 |
| C3 | Closure is "Vc". Highest possible closure is head-on: 180° HCA, 180° aspect, zero LOS. Same size-growth way to judge it. | SMM 16.16 para 40e, part 7 PDF p.3 |
| C4 | **Aspect angle (AA)**: your place measured from the line through the other aircraft's long axis. It belongs to the target and does not depend on your own heading. Target heading away = low aspect; heading toward you = high aspect. In rejoins slightly higher than ideal is "hot", lower is "cold". | SMM 12.2 para 6, Fig 12.1 |
| C5 | Aspect in numbers: AA is the angle from the target's tail to the fighter, "the fighter's view of the target". Directly behind the target's tail (its 6 o'clock) is 0°. Directly ahead of it is 180°, whatever your heading. On the target's right side = right aspect, left side = left aspect. Also called Angle of Tail (AOT). | SMM 16.16 para 40b, Fig 16.9, part 7 PDF p.2-3 |
| C6 | **Range**: the distance. Judge it by the other aircraft's size in your canopy against cockpit features, for example the spacing of the warning lights, at known distances. | SMM 12.2 para 7 |
| C7 | **Line of sight (LOS)**: how fast the other aircraft moves across your windscreen. Slow = low LOS, fast = high LOS. If you hold a constant range while staying on the target's turn circle, LOS is zero. If flight paths are matched, LOS is zero. | SMM 12.2 para 8; SMM 16.16 para 40d |
| C8 | **Heading crossing angle (HCA)**: the angular difference between your heading and the other aircraft's heading (para 9 is a single sentence; the paste in 7e stopped before its end). Fig 12.2 and Fig 16.9 draw it. | SMM 12.2 para 9, Fig 12.2; SMM 16.16 para 40c, Fig 16.9 |
| C9 | **On the turn circle, the cues have a fixed relationship**: Fig 16.10 labels a pursuer on the turn circle of the leader with LOS = 0, Vc = 0, aspect = X, HCA about 2 times X. | SMM Fig 16.10, part 7 PDF p.4 |
| C10 | Your visual cues "will dictate your actions as a pilot (lead, lag and pure pursuit) to maintain and/or regain position". The cues drive the pursuit choice; fluid manoeuvring is where it is practised. | SMM 16.16 para 41 |
| C11 | Tools to assess your place against the leader's turn circle at this stage: aspect angle, HCA, LOS, closure. | SMM 16.16 para 40a |
| C12 | A "definite increase in the line of sight" is the cue to reverse the turn when rejoining to fighting wing with lead turning into you. | SMM 16.20 para 65b(2), part 7 PDF p.15 |
| C13 | EFIG teaches the cues as the aim of the formation blocks: "recognize and respond to visual cues such as closure, aspect, range, and line of sight", and of Block B "while working in coordination with another aircraft". | EFIG p.72, p.74, p.76 |
| C14 | In a head-on-style danger ("90 aspect, zero LOS, and high closure") the call is Knock-It-Off, not Terminate. | SMM Table 16.1, part 7 PDF p.18; Gen Book p.11 |
| C15 | Lookout: about three quarters of the time on the primary area, the rest on the remaining sky; scan sectors of 3-5 s; avoid staring at lead although holding position is the wingman's job. Applies in fighting wing too ("no less important", though rear coverage is poor). | SMM 16.14 paras 33-34 |

### 1.2 The fighting wing position and its references

| # | What it says | Reference |
|---|---|---|
| P1 | Purpose: primarily an offensive formation (tactical fighters, helicopters, transport); extremely fluid and manoeuvrable; some mutual support. Also useful in departure, enroute and arrival domestic manoeuvring because each member can relax and keep a good lookout while keeping formation integrity. | SMM 12.29 para 68, p.198 |
| P2 | Fighting wing is "characterized by simplicity, manoeuvrability and good forward look-out but poor visual coverage of the rear hemisphere", so it is the offensive formation; line abreast is the defensive one. | SMM 16.13 para 31, part 6 PDF p.32 |
| P3 | The wingman is "primarily responsible for making the miss and maintaining position" in both fighting wing and line abreast, and both let him clear the area for the formation. | SMM 16.13 para 31 |
| P4 | Optimum position: number two 30 to 60 degrees of sweep from lead, 500 to 1,000 ft. | SMM 12.29 para 69; EFIG p.391 ("30-60 sweep (ideally)", "500-1000'") |
| P5 | Fig 12.19 draws the cone in plan view: a dotted line through lead's wing line, a 30° and a 60° line out from lead, arcs at 500 ft and 1,000 ft. The sweep is therefore measured at lead, back from his wing line, 0° abeam. | SMM Fig 12.19, p.198 |
| P6 | Fig 12.19's "sweep references": two photos of lead from the wingman's side and a top view, with two red lines drawn from lead's spinner at 30° and 60°. Where each line crosses lead's wing is the picture. EFIG's words for the two pictures are "nose wingtip" and "nose mid wing". The mapping 30° = nose on wingtip, 60° = nose on mid wing is **(inferred)** from the top view (the 30° line meets the wing near the tip, the 60° near the middle); neither source says it in words. | SMM Fig 12.19; EFIG p.391 |
| P7 | EFIG's range references: "flat part of inst panel and fire lights" at 500-1000 ft. This reads as the cockpit features lead's size is compared with (**inferred**: the fire-warning lights on the glareshield; the slide does not say which size goes with which range). It is the EFIG's version of SMM 12.2 para 7's "distance between warning lights". | EFIG p.391 |
| P8 | After roll-out, sweep out "enough to allow lead to aggressively manoeuvre into wingman". This is a reason for the sweep, stated as a reference. | EFIG p.391 |
| P9 | Once lead manoeuvres, number two is free to manoeuvre as required **to stay behind lead and keep separation**: collapse to lead's 6 o'clock, flow to the opposite side, use the vertical, adjust power, or any combination. | SMM 12.29 para 69 |
| P10 | Once manoeuvring stops, the wingman moves back to the swept position, "not necessarily on the same side of lead as prior to manoeuvring". | SMM 12.29 para 69 |
| P11 | With lead, lag and pure pursuit used well, lead is "free to manoeuvre in any plane with minimal impact" on the wingman's position. Before aggressive fighting wing manoeuvring you are first taught lead, lag and pure pursuit. | SMM 12.29 paras 69-70 |
| P12 | Fluid manoeuvring is a different box: a 60° cone behind the leader (30° each side of his tail) at 500-1,000 ft, both aircraft at the same power, and "never any requirement" to use the 30-60° swept place, since that would be outside the FM limits. | SMM 16.17 para 42 |
| P13 | **Stack (height).** When rejoining from fighting wing through route to echelon, "establish level or slightly below lead (for safe separation below and behind in the event of misjudged closure)" and go to route spacing; once there with safe closure, "remove the stack". This implies a fighting wing stack slightly below lead (**inferred**); no number is given. | SMM 16.15 para 38, part 6 PDF p.34 |
| P14 | Other manual height facts nearby: a turning rejoin is flown "just slightly below lead" (12.24 para 58); during an overshoot never climb to or above lead's altitude (12.27 para 65); spread-4 uses a slight altitude stack, and Fig 16.33's example is Lead 8,000, #2 7,750, #3 8,250, #4 8,500 ft. | SMM 12.24 para 58, 12.27 para 65, 16.42 para 115, Fig 16.33 |
| P15 | Descent profiles: lead picks the position (fighting wing or echelon); a minimum torque of 20% is recommended "to provide some measure of PCL response for the wingman"; power changes smooth; significant ones prefaced with the power-reduction signal. | SMM 12.31 para 75, p.202 |
| P16 | Formation climb: lead sets torque "as required allowing the wingmen to maintain station (normally approximately 85%)". In fighting wing no signal is needed to complete the checks. Join-up: lead element 180 KIAS and about 80% torque. A "Gimme 1" call asks lead to reduce torque slightly "but not below 80%" to give the wingman power authority (take-off). | SMM 16.31 para 84; 16.30 para 81; 16.2 paras 5-6 |
| P17 | Fighting wing is the normal enroute position after "on top" in a 4-ship, the usual transit to a TAC NAV hack, a marshall position (with LAB, at 200 KIAS), and the RTB position until the final run-in. | SMM 16.46 para 124 (part 8 PDF p.4-5), 17.2 para 3a, TAC NAV marshall para 9 (part 8 PDF p.8; section number not read), 17.5 para 32 |

### 1.3 Pursuit curves

| # | What it says | Reference |
|---|---|---|
| U1 | Keeping separation from a manoeuvring aircraft "is not an exact science" because most parameters keep changing; the tools are lead, lag and pure pursuit. | SMM 12.30 para 71, p.199 |
| U2 | **Lead pursuit**: project your flight path in front of the preceding aircraft; nose in front of it, the other aircraft in the **bottom** of the windscreen. Normally generates closure; lets a pursuer of equal performance keep or reduce separation. Pulling lead normally increases aspect angle and changes the line of sight. | SMM 12.30 para 72, Fig 12.24-12.25, p.201 |
| U3 | **Pure pursuit**: flight path onto the preceding aircraft; nose on it, the other aircraft in the **middle** of the windscreen. Generates closure, but not as much as lead; keeps or closes the separation. Normally increases aspect and gives **zero LOS**. | SMM 12.30 para 73 |
| U4 | **Lag pursuit**: flight path behind the preceding aircraft; nose behind it, the other aircraft in the **top** of the windscreen. Used to cut closure or open separation, and to reduce the higher aspect that lead and pure create. | SMM 12.30 para 74 |
| U5 | How much lead, lag or pure is "based solely on the severity of the manoeuvring". The prime objective at this stage is to keep separation by flying "on, or around, the preceding aircraft's turn circle", leading or lagging as needed to stay on or around the defined turn circle. | SMM 12.30 para 74 |
| U6 | EFIG definitions by the turn circle: lead pursuit = use bank and pitch to project the path **ahead of lead, inside lead's turn circle**; lag pursuit = path **behind lead, outside lead's turn circle**; "once in position maintain range by following lead's flight path (maintain lead's turn circle)"; "to maintain position when lead's manoeuvring aggressively go to where lead was and do what lead did". Use lead, lag, pure "to achieve position. Power if required". Link to the FW slide: lead, lag, pure curves; reference: closure. | EFIG p.390-391 |
| U7 | Fig 12.24 shows lead pursuit as a curve ahead of the leader and lag pursuit as a curve behind him. Fig 12.25 shows four front-cockpit pictures, each a forward view with the other aircraft at a different place: lag (high), pure (middle), lead (low), and "maintaining distance". Our crops are in `docs/references/figures/`. | SMM Figs 12.24-12.25, p.201 |
| U8 | You cannot simply point at the aircraft ahead: depending on how hard lead manoeuvres, that gives excessive closure or flight-path crossing angles well over 90°. The key is to assess the leader's turn circle and fly in relation to it. If a pursuer matched performance on the same circle the separation would stay constant, but in a dynamic fight the circle is constantly redefined, so assess it constantly. | SMM 16.16 para 39 |
| U9 | What defines the turn circle (the factors "of prime importance" for this stage): turn radius (set by TAS and G), flight path, plane of motion, lift vector, turn rate, total G, pursuit curves. | SMM 16.16 para 39a-g, Figs 16.7-16.8 |
| U10 | Turn radius R = V squared / (g times radial G); turn rate W = g times radial G / V (V in ft/s, g = 32.2). Same TAS and G give the same radius. | SMM 16.16 para 39a; 14.13 paras 29-30 |
| U11 | **Plane of motion**: changing from a level turn to a vertical or oblique one can keep the radius but change the plane, so a pursuer no longer on the same circle stays off it unless his path changes. | SMM 16.16 para 39c |
| U12 | **Turn rate** dictates how fast an aircraft can redefine its circle: a sudden 10°/s increase "drastically" redefines it, making it harder to keep separation. Two aircraft on the same circle at the same rate keep constant range, but in practice the rate rarely stays constant. | SMM 16.16 para 39d |
| U13 | **Lift vector (LV)** points straight up through the canopy, perpendicular to the wings: where the lift is directed and where the aircraft will end up. In a high-G turn the LV defines the plane of motion and "always points at the centre of the turn circle" (14.12). The pilot reads it by looking up through the canopy. | SMM 16.16 para 39e; SMM 14.12 para 28 |
| U14 | The Harvard II's optimum turn rate is about 160 KIAS at 17 units AOA; most advanced exercises manage energy to capture it. Level max-performance turn speed settles at about 150 KIAS minus altitude in thousands of feet, at about 75° of bank. | SMM 14.13 para 31; 14.14 paras 34-35 |
| U15 | Fluid manoeuvring (FM) is the exercise to practise pursuit curves; the wingman reacts and uses lead, lag and pure to hold separation. Restrictions: 5 G limit at all times (plus structural limits); never more than 90° of aspect together with more than 90° of HCA and low LOS while using lead, lag or pure; a 500 ft bubble at all times. Break any of these and the call is TERMINATE. | SMM 16.17 paras 42-45, part 7 PDF p.4-5 |

### 1.4 Turn entry (Figs 12.20-12.22)

Three starting states, each with "lead turns away" and "lead turns into you". All paragraphs sit under SMM 12.29 para 70 and 12.30 para 71; all are paraphrased from the figures' own boxes.

| # | State | Lead turns away | Lead turns into you | Reference |
|---|---|---|---|---|
| E1 | In position | Collapse to lead's 6 by promptly aiming inside the turn circle (lead pursuit); stops the range increasing. | Collapse to the 6 by turning slightly toward lead (lag pursuit); reverse and promptly capture the turn circle by matching lead's turn (pure). Note: "as required, make the miss" with pursuit curves and/or altitude separation. Step 1 is labelled "Make the miss (lag pursuit / altitude separation)". | Fig 12.20, p.199 |
| E2 | Stretched / aft | Lead turning away creates range problems. Aim well inside the turn circle at once (lead), then use geometry; stops the range increasing and starts closure. | An opportunity to correct position: slowly collapse by delaying your turn (lead), then progressively capture the circle by matching lead's turn (pure). Step 1 reads "Delay the turn". | Fig 12.21, p.199 |
| E3 | Tight / forward | An opportunity to correct position: promptly aim at lead's tail (pure) and capture the circle with geometry; the extra distance travelled fixes the closer range. | Closure and angle problems. First make the miss: a climbing turn above lead or a descending turn below lead are both good. Because of the angular cut-off you will likely end up outside the circle, so recapture it promptly by matching lead's turn (pure). | Fig 12.22, p.200 |

### 1.5 In the turn

| # | What it says | Reference |
|---|---|---|
| T1 | Stay on or around lead's turn circle, using lead and lag as needed (U5, U6). | SMM 12.30 para 74; EFIG p.391 |
| T2 | In a turn, #2 may still be moving: free to collapse to the 6, flow across, use the vertical, adjust power (P9). | SMM 12.29 para 69 |
| T3 | Lead must not make "hard turns into a wingman" in 3- and 4-plane fighting wing, as that causes abrupt manoeuvring through the formation. (Turns in fighting wing "may be more aggressive" than in finger.) | SMM 16.36 para 100, part 7 PDF p.26 |
| T4 | Any member may call TERMINATE to make lead stop manoeuvring; all acknowledge in order; expect lead to go to a level turn; manoeuvring restarts on lead's direction. The 4-ship text says this is "as in two-plane fighting wing". | SMM 16.39 para 107, part 7 PDF p.28 |
| T5 | Wingmen keep all preceding aircraft in sight and ensure separation while holding position on the aircraft ahead. | SMM 16.39 para 107 |
| T6 | G-limits during advanced formation: Lead +4 G, wingmen +5 G. | SMM Table 16.1; Gen Book p.11 |
| T7 | Training rules for manoeuvring: wingman makes the miss (high if low level); lead stays predictable and transmits his flight path; "nose high goes high if able"; no crossing flight paths; head-on, clear right; 500 ft bubble in fluid manoeuvring and high aspect. | SMM Table 16.1 (16.21 para 69); Gen Book p.11 |
| T8 | In FM the manual's wingover is about 230 KIAS entry, 45° pitch, up to 120° bank, about 3 G (lead's manoeuvre, relevant only to fluid). Predictability is lead's main focus. | SMM 16.17 para 47 |

### 1.6 Turn exit (Fig 12.23)

| # | What it says | Reference |
|---|---|---|
| X1 | Tight, or with high closure: flowing out to the **outside** of the turn gives a longer path and helps control range or closure. | Fig 12.23, p.200 |
| X2 | Stretched, or range increasing: flowing to the **inside** of the turn is the shortest distance and helps minimise any range increase. | Fig 12.23 |
| X3 | Good range, no closure: "pick the side you want" and regain position. | Fig 12.23 |
| X4 | Then back to the swept position on either side (P10). | SMM 12.29 para 69 |

### 1.7 The vertical and energy

| # | What it says | Reference |
|---|---|---|
| V1 | The vertical is one of the named tools (P9) and the way to "make the miss": climb above or descend below lead (E1, E3). | SMM 12.29 para 69; Figs 12.20, 12.22 |
| V2 | **Energy cost of the miss (a lesson from the cross turn, applied to fighting wing as a principle; inferred as applicable):** energy is lost climbing or gained descending to make the miss; compensate after crossing, for example climb at the start, then descend after to get the energy back, which cuts geometry errors at the end. | SMM 16.19 para 64 (cross turn), part 7 PDF p.13 |
| V3 | In a LAB delayed turn the wingman "must crosscheck lead during turn to potentially adjust G and/or anticipated heading to help with fixing spacing errors prior to roll out"; leftovers are fixed on roll-out. | SMM 16.19 para 52 note, part 7 PDF p.8 |
| V4 | Power: lead, lag and pure "to achieve position. Power if required". Fighting wing has "adjusting power" as one of the tools; in FM both aircraft hold the same power instead. | EFIG p.391; SMM 12.29 para 69; 16.17 paras 42-43 |
| V5 | Check turns are energy-sustaining, with PCL "as required to maintain airspeed". (LAB, but the usual phrase for how the formation holds speed through a turn.) | SMM 16.19 paras 52, 58 |
| V6 | **(not found)** S-turns, weaving, yo-yos (high or low), scissors, or any technique of bleeding energy by turning side to side in fighting wing. I searched SMM, EFIG and Gen Book for S-turn, weave, scissor, yo-yo and found none. Patrick's S-turns across the cone are his own technique (spec 7e item 6), not the manuals'. | greps of `smm.txt`, `efig.txt`, `genbook.txt` |
| V7 | **(not found)** Any rule that puts power ahead of or behind geometry beyond "power if required" (EFIG p.391) and the tool list (SMM 12.29 para 69). The order "aim point, vertical, power as last resort" is Patrick's (TS-96). | as above |
| V8 | **(not found)** Any numbers for the fighting wing stack (how far below lead), how hard the vertical may be used, or a quick-fix threshold. | as above |

### 1.7a Separation and deconfliction

| # | What it says | Reference |
|---|---|---|
| D1 | The prime objective at this stage is to maintain separation, by flying on or around the preceding aircraft's turn circle (U5). | SMM 12.30 para 74 |
| D2 | Bubbles and minima: a 500 ft bubble at all times in fluid manoeuvring and high aspect (it is a fluid rule; no manual line sets 500 ft as a wall for the swept fighting wing, whose lower edge is the cone's 500 ft); a minimum 300 ft crossing separation (vertical and/or horizontal) in all line abreast manoeuvres; the shackle and cross turn pass at minimum 300 ft vertical (Fig 16.20-16.21). | SMM 16.17 para 44c; 16.13 para 31; Table 16.1; Gen Book p.11 |
| D3 | 4-ship rule of thumb: "four misses three, who misses two, who misses lead". | SMM 16.39 para 107 |
| D4 | Lead's turn circle matters to the rejoin: always join to the inside of the turn; on the outside, plan to pass one to two aircraft lengths behind and below. Overshoot: never at or above lead's altitude; pass behind and below. | SMM 12.24 para 59; 12.27 paras 65-66 |
| D5 | The wingman who loses visual or SA manoeuvres away from lead's last known position and calls BLIND with altitude; lead manoeuvres predictably. | Table 16.1; Gen Book p.11 |

### 1.8 4-ship and element fighting wing

| # | What it says | Reference |
|---|---|---|
| F1 | Three- and four-plane fighting wing is "a very manoeuvrable semi-tactical formation" with an active lookout. As in two-plane, all members fly a **60° sweep** off the preceding aircraft and may manoeuvre within their assigned area; #3 and #4 "normally alternating on the side of the cone opposite to that being flown by number two". No distance is given in this paragraph. | SMM 16.38 para 104, Fig 16.29, part 7 PDF p.27 |
| F2 | Normal entry from finger or echelon; from echelon #2 normally moves out to the same side he held in close formation. May be used immediately after take-off. A radio call changes the formation ("FIGHTING WING"); lead calls "FINGER RIGHT" to resume close formation. | SMM 16.38 para 105 |
| F3 | Entering fighting wing from finger or echelon: the wingmen "slowly drop back from lead and simultaneously increase separation from each other"; the spacing grows until each is stabilised in a fighting wing position behind the preceding aircraft; a lateral move can then be made. | SMM 16.32 para 92, part 7 PDF p.24-25 |
| F4 | Comms-out rejoin: a wing rock followed by a 30° bank turn means rejoin to finger; the turn direction gives the finger; #2 joins to the inside of the turn. | SMM 16.38 para 106 |
| F5 | Offset box and spread-4 are normally entered from fighting wing or finger. | SMM 16.41 para 110; 16.42 para 114 |
| F6 | #4 keeps visual on #3 and ideally lead and #2; reduced heading changes and a slight altitude stack help. | SMM 16.42 para 115 |

### 1.9 Rejoins and hand-overs that touch fighting wing

| # | What it says | Reference |
|---|---|---|
| R1 | Rejoin from fighting wing to echelon: straight-ahead, or by closing through route. Through route: level or slightly below lead (stack), route spacing, remove the stack, then route to echelon in the normal way. | SMM 16.15 para 38 |
| R2 | Rejoin from LAB: unless told otherwise, the wingman rejoins to fighting wing first. Straight-ahead: #2 turns into lead slightly to set a rejoin line to a fighting wing place, on the same side as the LAB place he left; his final vector must clearly aim **away** from lead. | SMM 16.20 para 65a, Fig 16.22 |
| R3 | Turning rejoin from LAB: lead turns at constant AOB (30° bank on his call) and IAS. Lead turns away: simply cross lead's turn circle to set a rejoin line with ample closure. Lead turns **toward** #2: aggressively turn to point at lead, roll out, monitor; once a definite increase in LOS is seen, reverse the turn to capture fighting wing, anticipating the reversal so the fuselage lines up with lead's on intercept, while watching closure. | SMM 16.20 para 65b(1)-(2), Fig 16.24 |
| R4 | To echelon directly from LAB, the path must pass through the fighting wing position (the overshoot lane) ("hot turning rejoin"). | SMM 16.20 para 66, Fig 16.25 |
| R5 | In-place turns (more than 30°) transition the formation from LAB to fighting wing or back. The check turn is 30° or less. | SMM 16.19 para 58, Fig 16.18 |
| R6 | During TAC NAV training, rejoins from LAB or fighting wing can be done by collapsing to close formation through the route position. | SMM 17.5 para 34, part 8 PDF p.8 |
| R7 | Turning rejoin (to echelon): lead's heading and speed constant; the rejoin line puts lead at the 10:30 or 1:30 position, slightly above the horizon; overtake 10-20 KIAS later in training (EFIG says 10-20, recommended); straight-ahead rejoin: about 500 ft behind lead turn slightly toward the echelon to make a vector slightly away; overtake 20-30 KIAS (EFIG); lead's size grows and "bloom" at the route. | SMM 12.24 paras 54-58; 12.26 para 63; EFIG p.371, p.374 |
| R8 | EFIG straight-ahead rejoin line-up sight picture: lead's approximately one fist above the instrument panel, horizontal stabiliser cutting the bottom of lead's canopy bow, just below lead's wake. This is a rejoin cue (the range gauge in 7e is from the straight-ahead rejoin). | EFIG p.371 |
| R9 | EFIG route: "controlled closure (approx. the rate of movement of a station change)", "monitor nose/wingtip line"; route station keeping reference is wingtip on spinner laterally and vertically, one to three wingspans longitudinally ("aircraft size"). | EFIG p.374, p.384; SMM 12.24 para 58 |

---

## 2. Gaps against spec 7e

The right-hand column is a suggestion only. 7e's section numbers are the ones in the spec (1 purpose ... 12 open questions); "7e item 6" means the section-6 bullet list "How Patrick flies it".

| # | Item | What the manuals say (ref) | What 7e says or misses | Suggested addition |
|---|---|---|---|---|
| G1 | Pursuit defined by the turn circle | Lead pursuit = path ahead of lead, **inside** lead's turn circle; lag = behind lead, **outside** it (EFIG p.391, U6). Matches SMM 12.30 para 74 "on or around the turn circle". | 7e section 3 defines the three only by the windscreen picture (Lead low, middle, high). The turn-circle definition is used in the table (section 4) but not stated for section 3 or for the aim loop. | Add EFIG p.391's turn-circle definition beside the windscreen one; the aim loop can use "inside / on / outside Lead's circle" as its quantity. |
| G2 | "Go where lead was and do what lead did" | EFIG p.391: to hold position when lead manoeuvres aggressively, go to where lead was and do what lead did; once in position, follow his flight path (maintain lead's circle). | Not cited in 7e. The live moves already do this (TS-208, section 8 live paragraph), but 7e's new technique does not name it as the fallback when the cone is lost. | Cite EFIG p.391 and say it is the fallback law (fly his path) in the aim loop. |
| G3 | Range and sweep references | EFIG p.391: sweep references "nose wingtip / nose mid wing"; range "flat part of inst panel and fire lights" (P6, P7). SMM 12.2 para 7: warning lights spacing. | 7e's rough range gauge cites an unconfirmed "manual figure from the straight-ahead rejoin" and Lead's span in degrees; it does not use the EFIG references; sweep is only an angle. | Use EFIG p.391's two named sweep pictures and its two range references as the cockpit cues for the sight-picture renders (11) and for what perception can "see". The rejoin figure (page to confirm) is probably EFIG p.371-372 or SMM Fig 12.17: confirm and cite. |
| G4 | Why the swept place sits where it does | EFIG p.391: sweep out enough after roll-out for lead to turn aggressively into the wingman (P8). | 7e's swept place (625 ft, 45°) is Patrick's pick; no manual reason given. | Cite P8 as the stated reason, and as a check on any choice near 30° (too little room for a turn into). |
| G5 | Aspect angle, in numbers | 0° at lead's tail, 180° in front, right or left aspect, independent of own heading (C5, SMM 16.16 para 40b). | 7e para-6 gist only (low/high, hot/cold). It lists aspect among perception outputs but no sign convention or numbers. | Add C5 so perception's aspect has a definition (and a sign), and the loops can cite it. |
| G6 | Heading crossing angle | Full definition (C8). HCA is about twice the aspect when on the turn circle with LOS 0 and Vc 0 (Fig 16.10, C9). | 7e says "the paste stops at its start". The definition is one sentence. The Fig 16.10 relation is not in 7e at all. | Complete the HCA line; add the Fig 16.10 relation as a pilot-recognisable check ("on the circle" test) for a test or a flag. |
| G7 | "Definite increase in LOS" as a reversal trigger | In a rejoin to fighting wing with lead turning into you, reverse the turn on a definite increase in LOS (C12, R3). | 7e uses LOS only as an input and "zero on the circle"; no trigger. | Candidate threshold-free trigger for the in-position "turn into" reverse (7e section 4), or for the opening hand-over from LAB. |
| G8 | Lead's turn circle as seen: what a pilot actually reads | The LV points at the circle centre (14.12 para 28; 16.16 para 39e); the circle's radius comes from TAS and G (39a); turn rate redefines it (39d); a change of plane changes it (39c). | 7e perception lists "Lead's turn circle as seen (his centre and radius from the turn Lead is flying)" but does not say how, nor that a sudden change of rate or plane means the estimate is stale. | Say the circle is estimated from Lead's wing plane (bank) and speed, re-estimated when his bank, G or plane changes; and add a stale-data rule (7e section 3 of the rule book: safety items state their failure behaviour). |
| G9 | Miss costs energy | Climbing to make the miss costs energy, descending gains it; compensate after crossing (V2, SMM 16.19 para 64). | 7e says the vertical bleeds or fixes energy and is "quick fix" but does not say a climbing miss must be paid back with a descent afterwards. | Add V2 to the Vertical loop and its stack-return law; it fits "stack slightly below" because the descent after a climb ends there. |
| G10 | Stack | SMM 16.15 para 38: level or slightly below lead; "remove the stack" (P13); spread-4 stack numbers (P14). | 7e: stack 50 ft below Lead, Patrick's pick; "50-100 ft below" earlier. Manual gives no number, only "slightly below". | Cite P13 as manual support for stacking below; keep Patrick's number marked as his ruling. |
| G11 | Entry from close formation (the move out) | #2 normally moves out to the same side he had in close formation (16.38 para 105). The 4-ship text: "slowly drop back and simultaneously increase separation... a lateral move into position can then be made" (16.32 para 92). | 7e says only "an off-station move into the swept position", flown by him. | Add: drop back first, then go out; go to the side he is on (matches Patrick's "side he is on"). Both paragraphs are for finger and echelon, so say the 2-ship case is inferred. |
| G12 | Safety on the transition | EFIG p.390: the wingman maintains visual separation through the transition from echelon to fighting wing (and "look out/avoidance"). | Not in 7e. | Add a deconflict line for the hand-over: stays behind and below Lead through the move out (consistent with 12.24 para 58). |
| G13 | Terminate in fighting wing | Any member may call TERMINATE; lead goes to a level turn; manoeuvring restarts on lead's direction (16.39 para 107; written as "as in two-plane fighting wing"). FM has TERMINATE and TERMINATE FOR POSITION (16.17 paras 45-46). | 7e has no "I cannot hold this" outcome; section 10 only says "in the cone and steady". Section 8 of the spec covers Terminate for fluid, not for fighting wing. | Add a failure behaviour: when the supervisor's deconflict cannot hold 500 ft or he loses the picture, he calls Terminate and Lead goes to a gentle level turn. Needs Patrick's yes (changes what the tool does). |
| G14 | Wingman's responsibility | SMM 16.13 para 31: the wingman is primarily responsible for making the miss and holding position; Table 16.1: wingman makes the miss (high if low level); "nose high goes high if able". | 7e deconflict has "climbing above, descending below" but not these rules. | Add as references: if Lead is nose-high, go high; at low level, go high. |
| G15 | 4-ship sweep | 16.38 para 104: "all formation members fly a 60 degree sweep off the preceding aircraft"; #3 and #4 alternate sides opposite to #2 (F1). No range given. | 7e section 9 leaves the 4-ship alone, fine. But spec section 8 (the live paragraph) cites "SMM 16.38 para 104" for "about 650 ft of arc behind the one ahead": the paragraph gives no distance. | See Conflicts C1 below. |
| G16 | Hard turns into a wingman | In 3/4-ship fighting wing lead avoids hard turns into a wingman (16.36 para 100). | 7e's turn-entry table allows Lead turning into #2, which is the 2-ship case. | Note it in 7e section 9 (4-ship rung): Lead's turns into a wingman are limited for 3 and 4 aircraft. |
| G17 | G limits | Lead +4 G, wingmen +5 G in advanced formation (Table 16.1; Gen Book p.11). | 7e section 8 says "his G at most Lead's plus 1.5 G and the G rule's 5 G" (guess). The wingman's 5 G is the manual's; the +4 G for Lead is already in section 9 of the spec (fluid). | Cite Table 16.1 for the 5 G, so it is a reference not a guess. |
| G18 | Power authority and lead's power | A climb at about 85% torque lets the wingman hold station (16.31 para 84); lead not below 80% torque on a "Gimme 1" (16.2); descent minimum 20% torque (12.31 para 75). | 7e: wingman's power "within 15 KIAS of Lead (TS-208)". Spec section 8: lead's climb at no more than 80% torque (TS-203/204). | Cite 16.31 para 84 (85%) next to TS-204's 80%; see Conflicts C4. |
| G19 | FM versus FW | FM: both aircraft hold the same power; FM cone is 60° behind lead; 30-60° swept place not used in FM (16.17 para 42). | 7e section 9 says fluid is unchanged; no statement that the fighting wing technique and FM's "same power" rule are different jobs. | One line in 7e section 9: FW's loops are not used in FM, where power is held equal (para 43). |
| G20 | Tool order | SMM 12.29 para 69 lists the tools as a set ("or any combination"); EFIG p.391: lead, lag, pure first, "power if required". | 7e says aim point first, vertical for quick fixes, power last (Patrick's order, TS-96). Consistent with EFIG; the SMM does not order them. | Cite EFIG p.391 for "power if required", so the order has a manual source for the last step. |
| G21 | Which cues are inputs | SMM 16.16 para 41: closure, aspect, range and LOS "dictate your actions" (lead, lag, pure). | 7e design note: "Whether the loops close on these cues, or on positions worked out from them, is for the Fable audit". | Add C10 to the note as the manual's own statement that the cues drive the choice; an argument for cue-based loops (suggestion only; the choice is Patrick's and the audit's). |
| G22 | Lookout | SMM 16.14 paras 33-34 (C15). | Not applicable to a sim, but the 0.4 s reaction and the "he cannot see behind" fact (poor rear coverage, P2) matter for what he can see when Lead is far across the cone. | Optional: note that fighting wing's poor rear view is why #2 flies behind and keeps Lead in the forward view. |

---

## 3. Conflicts

Patrick's word wins in this project. Both sides are listed.

| # | The disagreement | Side A | Side B | Note |
|---|---|---|---|---|
| K1 | **650 ft cited to the wrong paragraph.** | Spec section 8 (live moves) says the 4-ship wingman "aims about 650 ft of arc behind the one ahead (SMM 16.38 para 104)". | SMM 16.38 para 104 gives a 60° sweep and the side alternation only; no 650 ft or any range (F1). 650 ft is not in SMM chapter 16 (I searched "650" in `smm.txt`: no match). It matches Patrick's 14 Oct happy range (600-650 ft) and TS-208. | It is a Patrick/TS-208 number, not a manual number. Fix the cite when 7e is approved. |
| K2 | **Sweep: 30-60 against 60.** | 2-ship: 30-60° (SMM 12.29 para 69; EFIG p.391). | 3/4-ship: "all formation members fly a 60 degree sweep" (SMM 16.38 para 104) "as in two-plane fighting wing". | Reads as the same cone, with the maximum quoted in the 4-ship text (inferred). Patrick's pick 45° for the 2-ship sits inside both. |
| K3 | **FM cone against FW cone.** | FM: 60° cone behind lead (30° either side of his tail), 500-1,000 ft (SMM 16.17 para 42). | FW: 30-60° sweep back from lead's wing line, 500-1,000 ft (12.29 para 69). | Different geometry on purpose (FM says the swept place is outside its limits). 7e uses FW's, section 9 FM's; both already in the spec. |
| K4 | **Torque: 80% against 85%.** | Spec/TS-203, TS-204: lead's climb no more than 80% torque in fighting wing moves. | SMM 16.31 para 84: formation climb "normally approximately 85%" so wingmen can hold station; "Gimme 1" lead not below 80% (16.2). | Not strictly a conflict (different phases). Patrick's number is the project's. |
| K5 | **500 ft: wall or reference.** | 7e section 7: deconflict "predicted range will pass inside 500 ft" and section 12: "never inside 500 ft less the margin" (test). | The manuals' 500 ft bubble is an FM and high-aspect rule (16.17 para 44c; Table 16.1); for fighting wing 500 ft is the cone's inner edge, not a stated wall. AGENTS.md "References, not walls". | Patrick ruled 500 ft as the closest (TS-208 "never closer than 500 ft", 5 Oct 16:49Z, 17:32Z). List both. |
| K6 | **Lead turning into the wingman.** | 7e turn-entry table treats it as a normal case. | 3/4-ship: lead avoids hard turns into a wingman (16.36 para 100). EFIG p.391 expects lead to "aggressively manoeuvre into wingman" in 2-ship. | Not a conflict: 2-ship allows it, 3/4-ship limits it. |
| K7 | **Where the cues come from.** | 7e para 3b: aspect is "low when the other is heading away, high toward him" (SMM 12.2). | SMM 16.16 para 40b adds "the angle from the target's tail to the fighter", with 0° at the tail. | Same thing, one is a word and the other a number. Not a conflict. |
| K8 | **"Stretched" and "tight" have no numbers in the manuals.** | 7e uses 1,000 ft and 500 ft as the edges of "in position". | SMM Figs 12.20-12.23 give states, not numbers; the cone's 500-1,000 ft is the in-position band by 12.29 para 69. Patrick says stretched/tight is "visual". | Fine. Note only that the 700 and 500 "lead/lag" numbers are Patrick's guesses, the 600-650 "happy" his pick. |
| K9 | **Stack: the manuals give no number.** | 7e: 50 ft below Lead. | SMM: "level or slightly below lead" (16.15 para 38) and "just slightly below" (12.24 para 58), no number. | Patrick's ruling stands. |
| K10 | **Lag pursuit and "crossing".** | Fig 12.20 in-position "turn into": the lag pursuit collapses by turning slightly toward lead, then reverses. | Table 16.1: "no crossing flight paths" (a line abreast rule). | The picture's blue path does not cross lead's path (it stays behind his track); the rule is not contradicted. Noted so the check is not forgotten. |

---

## 4. Pictures worth having as sight-picture references

| Figure | What it shows | Where it is |
|---|---|---|
| SMM Fig 12.19 (p.198) | The cone in plan, 30°, 60°, 500 ft, 1,000 ft; two photos and a top view of the sweep references from lead's spinner | **In the repo**: `docs/references/figures/smm-12-29-fig-12-19-fighting-wing-references.png`. Also private copy `images/smm-fig12-19-fighting-wing-references.png` |
| SMM Figs 12.20-12.21 (p.199) | Turn entry, in position and stretched, both lead-turns-away and lead-turns-into | **In the repo**: `smm-12-29-figs-12-20-12-21-turn-entry-in-position-stretched.png` |
| SMM Figs 12.22-12.23 (p.200) | Turn entry tight; turn exit (tight, good, stretched) | **In the repo**: `smm-12-30-figs-12-22-12-23-turn-entry-tight-turn-exit.png` |
| SMM Figs 12.24-12.25 (p.201) | Pursuit curves in plan, and four cockpit pictures: lag, pure, lead, maintaining distance. **The best sight-picture reference for the windscreen cue** | **In the repo**: `smm-12-30-figs-12-24-12-25-pursuit-curves.png`, `smm-12-30-paras-73-74-pure-lag.png`. Also `images/smm-fig12-24-lead-and-lag-pursuit-curves.png` |
| SMM Fig 12.1 / 12.2 / 16.9 | Aspect angle and heading crossing angle drawn | **Not in the repo.** In `images/`: `smm-fig12-1-aspect-angle.png`, `smm-fig12-2-heading-crossing-angle.png`, `smm-fig16-9-aspect-angle-and-heading-crossing-angle.png` |
| SMM Fig 16.10 | A pursuer on the turn circle: LOS = 0, Vc = 0, HCA = 2 x aspect | **Not in the repo.** In `images/smm-fig16-10-maintaining-separation-in-a-turn.png` |
| SMM Fig 12.14 (turning rejoin cockpit view) | Lead at 10:30 or 1:30 from the cockpit | **Not extracted.** Part 5 PDF p.17 of the SMM (not in `images/`) |
| SMM Figs 12.15-12.17 | Turning rejoin, hot/cold lines, straight-ahead rejoin | Not in the repo; in `images/` (`smm-fig12-15-...`, `-12-16-...`, `-12-17-...`) |
| SMM Fig 16.22 | Straight-ahead rejoin to fighting wing | Not extracted (part 7 PDF p.15) |
| SMM Fig 16.29 | Four-plane fighting wing, plan view (a rough diagram) | Not in the repo. In `images/smm-fig16-29-four-plane-fighting-wing.png` |
| EFIG p.390-391 | FW slides: references and closure; p.391 repeats Fig 12.19 as a picture | **Not in `images/`**. I rendered both pages to a scratch folder (not in the repo). Suggest copying `efig-p391.png` into `images/` and the repo with the page cited |
| EFIG p.371-372, 374-376 | Rejoin line-up and route sight pictures (the straight-ahead rejoin range gauge in 7e is probably here or in SMM Fig 12.17) | Not in `images/` |
| Gen Book p.11 | Advanced formation training rules | Text only |

The five fighting wing figure crops already in `docs/references/figures/` cover every SMM figure the spec cites for 7e (12.19-12.25).
