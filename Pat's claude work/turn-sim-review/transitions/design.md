# Turn Sim: changing formation (design only, no code)

Draft of 4 Oct 2026 for Patrick. Asked at 10:51Z: "transition in and out of two-ship line abreast and fighting wing and/or echelon (hot turning rejoin etc)", and at 10:51:59Z: "hit a button and transition from echelon, fluid manoeuvring, line abreast, or other formations as per the manuals". Design only; nothing in the repo changes. Page references only, no manual text copied (SMM = Standard Manoeuvre Manual; AFM7/AFM8 = the four-plane briefs; EFIG = instructor guide). Numbers are sourced or marked **estimate**.

Pictures beside this file (made by `make-pictures.mjs`, plain SVG, open in a browser; I could not render them here, so they are **unseen**):
- `formation-positions.svg` where #2 sits in each formation, at three scales.
- `screen-change-formation.svg` the screen with the new control.
- `rejoin-from-lab-turn-into.svg`, `rejoin-from-lab-turn-away.svg` rough sketches of the turning rejoin (not the planner).

## 1. The short version

- One new group on the left of the screen: **Change formation**, one button per formation. Press one and the pair flies the manual's transition from wherever they are now. Lead keeps flying; only #2 manoeuvres, except where the manual has Lead turn or slow down (turning rejoins, entries to line abreast, the fluid manoeuvring break).
- Each button uses a small set of **moves** taken from the manuals (section 3). Between formations the manuals do not join directly, the route goes through an in-between formation (for example fighting wing to echelon goes through route). Section 4 gives the full from-to table.
- Everything is planned at the press, in the existing style: each aircraft flies a pre-planned path, roll 90°/s, smooth hand-overs (TS-47). It needs **three small new flight pieces** (section 6): a speed change, a recorded-bank path for the pursuit-style rejoins, and "copy Lead's turn" for after the join. Nothing in `src/core/` needs to change.
- The speed change is the one real departure from V2.6: today every aircraft holds its speed (Patrick card 09:54Z). A rejoin cannot work at constant speed (Lead slows to 200 KIAS, #2 overtakes by 10 to 20 KIAS). Question 1 and 3.
- Hand-over to the fighting wing / fluid manoeuvring design: this design stops when #2 is "established in fighting wing" (section 8).

## 2. The formations (what "established" means)

Sweep is measured back from Lead's 3/9 line, as the SMM does. Default speeds are the manual's, with 200 KIAS for everything except line abreast (question 1).

| Formation | Where #2 is | Source | Lead speed default |
|---|---|---|---|
| Echelon L/R (close) | wing-tip to spinner, abeam the rudder hinge line, slightly below; offsets in feet are **estimate** (about 45 ft lateral, 25 ft aft, 5 ft low) | SMM 12.4 paras 11-12 | 200 KIAS, SMM 12.23 para 53 (rejoins "unless otherwise briefed") |
| Route L/R | on the extended wing-tip line, 1 to 3 wingspans out (CT-156 span 33.4 ft, from the repo's energy-sim note) | SMM 12.6 paras 14-15 | 200 |
| Line astern | directly behind and below, nose to tail about 10 ft | SMM 12.5 para 13 | 200 |
| Fighting wing (FW) | 30° to 60° sweep, 500 to 1,000 ft; AFM7 says work toward the near end of the range and "other than turns, ensure Lead can see you"; side: No. 2 sets it | SMM 12.29 para 69; AFM7 p.14 | 200 |
| Fluid manoeuvring (FM) | inside a 60° cone behind Lead at 500 to 1,000 ft, same power setting, 500 ft bubble | SMM 16.17 paras 42, 44 | per the FM design |
| Line abreast (LAB) | 4,000 to 6,000 ft lateral, 0 to 10° sweep, ±2,000 ft vertical | SMM 16.18 para 49 | 220 KIAS, SMM 16.18 para 49 |

4-ship only (section 5): finger left/right, box, Spread 4 (LAB of four, 300 ft altitude stack), offset box (second element 6,000 to 8,000 ft back with an offset, SMM 16.41 para 109).

## 3. The moves (building blocks)

Closure and overtake numbers are KIAS differences between #2 and Lead. G and bank are for the wingman unless stated.

### M1. Station slide (echelon, route, line astern, other side)

| | |
|---|---|
| Manual | SMM 12.20 paras 44-47, Figs 12.12-12.13; route SMM 12.6; Gen signals Table 12.1 |
| Geometry | Echelon to route: move straight out sideways to 1 to 3 wingspans, same height or slightly low. Echelon to line astern: drop back and down until the nose is at least 10 ft behind Lead's tail and below the prop wash, then slide across (first half of echelon to echelon, para 46). Echelon to the other side: carry on through line astern and move forward and up to the new echelon (para 45). Always cross below and behind Lead (para 44b). |
| Speed | No speed change for the pilot except small power changes. Rate of movement is "controlled", no number given; the sim uses a closing/opening speed of about 5 kt (8 ft/s) = **estimate**, so a slide of 100 ft takes about 12 s |
| Lead | Straight and level, nothing to do |
| #2 | Slides; cross-over by a heading change of a degree or two, not by bank (para 45) |
| End picture | The target formation's position, wings level |
| Sim plan | Two shallow turn segments with a hold between (like the shackle's build: turn, hold, turn back, solved by dry runs of `dryRun`/`sideways`), plus a small height profile (`heightAt`, `missProfile` pattern) for "below and behind". Moves under 100 ft are invisible at the normal zoom, so the camera needs an auto-zoom when the pair is close (question 8) |

### M2. Drop back and sweep out (echelon, route, line astern to fighting wing)

| | |
|---|---|
| Manual | SMM 16.32 para 92 ("slowly drop back from the lead and increase separation ... until stabilised in a fighting wing position behind the preceding aircraft; a lateral move into position can then be made"); SMM 16.38 para 105 (from echelon, No. 2 normally moves out to the same side as in close formation); signal "shallow porpoising", Table 12.1 |
| Geometry | #2 ends at 30° to 60° sweep, 500 to 1,000 ft. Default 45° sweep, 750 ft (middle of both bands; **estimate** of the default, the bands are the manual's) |
| Speed | Drops back with a few knots less than Lead (about 5 KIAS = estimate), then matches |
| Lead | Straight and level |
| #2 | Drop back first, then lateral move to the sweep; stays level or slightly below until established |
| End picture | Established in FW on the same side as before (section 8 hand-over) |
| Sim plan | Same builder as M1 (turn, hold, turn back + a speed ramp), solved against Lead's known path |

### M3. Close from fighting wing (through route, or straight ahead)

| | |
|---|---|
| Manual | SMM 16.15 para 38; AFM7 p.18 "Finger" item 2: close through route, use an altitude stack to keep a safe escape lane, remove the stack once stabilised approaching route, then to echelon references |
| Geometry | #2 closes along the FW cone to route spacing, level or slightly below Lead (stack below and behind), then moves from route to echelon |
| Speed | Overtake 10 to 20 KIAS while closing, reduced to a stabilised closure of about the speed of a station change (about 5 kt, estimate) at route (SMM 12.24 para 58; EFIG p.374) |
| Lead | Straight and level at 200 KIAS |
| #2 | As above; at route spacing "removes the stack" (climbs the last feet to Lead's level) |
| End picture | Route, then echelon, same side |
| Sim plan | Speed ramps (M-speed, section 6) plus the M1 slide; height with `heightAt` |

### M4. Straight-ahead rejoin (SAR)

| | |
|---|---|
| Manual | SMM 12.26 paras 62-63, Fig 12.17; EFIG p.371; from LAB SMM 16.20 para 65a, Figs 16.22-16.23 |
| Geometry | From trail: line up on Lead's six, max power, 20 to 30 KIAS overtake; at about 500 ft behind, a small vector toward the echelon side; reduce overtake; stabilise in route; then echelon. From LAB: #2 turns into Lead slightly onto a rejoin line to FW, on the same side as the LAB position just left; the final vector must aim away from Lead; to echelon it goes through the FW position and aims away on the final vector (16.20 para 65a) |
| Speed | Lead steady at 200 KIAS (SMM 12.23 para 53). #2 +20 to +30 KIAS at first (EFIG p.371), closure reduced from about 500 ft |
| Bank, G | Shallow heading changes only (a few degrees; bank under 15° = estimate) |
| End picture | FW (default from LAB, para 65) or echelon |
| Time | From 6,000 ft astern at +25 KIAS the closure is about 42 ft/s, so about 2 minutes: the manual calls turning rejoins "the most expeditious" for that reason (SMM 12.23 para 53). From LAB abeam, first-cut arithmetic gives about 25° of heading change toward Lead and 30 to 35 s (**my arithmetic, estimate**) |
| Sim plan | Heading segments solved with dry runs (the `delayed()` formula `wait = (rel · h1)/(V (1 − h0 · h1))` is not needed; this is a vector solve) plus speed ramps. Overshoot lane: the planned path never goes ahead of or above Lead |

### M5. Turning rejoin (TRJ), cold line, hot line

| | |
|---|---|
| Manual | SMM 12.24 paras 54-59, Fig 12.15 (and 12.14 cockpit view); SMM 12.25 Fig 12.16 hot and cold line; SMM 12.2 para 6 (hot = slightly higher aspect than ideal, cold = lower); EFIG p.373-374; SMM 16.34 paras 94-96 (four-ship); AFM7 p.21 "Turning Rejoins" |
| Lead | Wing rock or R/T, then a **30° bank** turn at **200 KIAS** (SMM 12.24 para 54, 12.23 para 53; AFM7 p.21). Holds bank and speed until #2 is stabilised in route, then rolls out |
| #2 | "Same or more bank as Lead" to put Lead at **10:30 or 1:30**, slightly above the horizon; hold that line by varying bank; overtake **10 to 20 KIAS** (recommended; early training none, para 56; EFIG p.374); join to the inside of the turn unless told otherwise (para 59); stay level or slightly below; at route spacing remove the overtake, then echelon |
| Aspect and line | The "ideal line" is the constant-bearing line with Lead 45° off the nose (10:30 or 1:30, para 56). Hot = a higher-aspect line (wider inside, a steeper cut-off), cold = lower aspect (nearer Lead's track), Fig 12.16. The manual gives no number for hot or cold, the sim uses **bearing 60° for hot and 30° for cold (estimate)** and reports the bearing and aspect it flew |
| Bank | Lead 30° (1.15 G). #2 up to about 60° at the start (estimate; "excessive bank can result in losing sight of the lead", para 58) and averaging near Lead's. Never "a steep turn inside Lead's circle to arrest closure" (para 58 caution) |
| Overshoot | Roll wings level, reduce power, pass behind and below, never climb to Lead's height (SMM 12.27 para 65). Not in this slice (question 6) |
| End picture | Echelon on the inside of the turn, or FW, wings level on Lead's heading after Lead rolls out |
| Sketch numbers | Rough sketch (`rejoin-from-lab-turn-into.svg`, Lead 200 KIAS at 30° bank, #2 at 220 KIAS, a constant-bearing pursuit, bank limited to 70°): Lead turns into #2 about 40-45° and the closure takes about 15 s, **before** the route stabilisation, so a real one is longer; Lead turns away about 145° and it takes about 50 s, which matches the roughly 180° turn of Fig 12.15. These are sketch figures, **estimate** |
| Sim plan | The planner flies #2 in a **dry run with a pursuit rule** (hold Lead's bearing at the ideal angle by commanding bank, capped at the bank limit, closure reduced inside about 1,500 ft), records bank against time and the speed ramp, and hands both to the aircraft as "recorded bank" and "speed" segments. The dry run uses the same `stepAircraft` as the real flight, so the path drawn is the path flown (F1). Lead's own plan is known at the press (a 30° turn segment + speed ramp), so #2's dry run chases Lead's real dry-run path |

### M6. Turning rejoin from line abreast (to fighting wing, or "hot" directly to echelon)

| | |
|---|---|
| Manual | SMM 16.20 paras 65b, 66, 67, Figs 16.24 (Lead turns away) and 16.25 ("hot turning rejoin" when cleared **directly** to echelon, from the double attack picture); AFM7 p.17 and AFM8 p.19 "TRJ to FW from Spread 4" |
| Naming | Two different "hot": the **hot turning rejoin** (SMM 16.20 para 66) is the one that goes direct to echelon; the **hot line** (SMM 12.25, Fig 12.16) is a rejoin line with a higher aspect than ideal. The screen uses the SMM's names |
| Lead | Wing rock or "BLACKS ... FIGHTING WING", then a 30° bank turn while setting the briefed speed (200 KIAS); may turn **into** or **away from** #2 (para 65b). AFM7/8 TRJ from Spread 4: "Lead will pause, allow No. 2 to establish closure, then a gentle turn toward No. 2". A small check turn away first is allowed to help a novice (para 67) |
| #2, Lead turns away | Cross Lead's turn circle to set up a normal rejoin line with ample closure (Fig 16.24). #2 ends **on the turn side** of Lead (the inside), which is not the side it left |
| #2, Lead turns into | "Aggressively turn to point at Lead", roll out, watch the line of sight; when it clearly increases, reverse the turn to capture the FW position, with the fuselage aligned on arrival (Fig 16.25) |
| To echelon | Must arrive through a flight path that passes through the FW position, to give an overshoot lane (para 66); then the M5 finish |
| End picture | FW on the inside of the turn (default), or echelon (hot turning rejoin) |
| Sim plan | M5's dry-run pursuit, with two phases: "point at Lead" until the line of sight rate rises, then "reverse to the ideal line". The hot turning rejoin adds a waypoint at the FW position |

### M7. Break and rejoin (practice rejoin)

| | |
|---|---|
| Manual | SMM 12.25 paras 60-61; EFIG p.374 |
| What | Lead 180° at 60° bank, 2 G; #2 delays the briefed time and turns 60/2 to roll out behind; Lead delays and then calls the rejoin; #2 then flies M5 or M4 as above |
| Plan | An optional "Break and rejoin" entry at the end of the list under More; a Lead turn segment (60° bank, existing `turnSeg`) and a delayed copy for #2 (the `delayed()` pattern: wait then the same turn). **Briefed delay is not given in the manual, estimate 5 s (about 2,000 ft in trail)**; Patrick's call |

### M8. Entry to line abreast (from echelon, route or fighting wing)

| | |
|---|---|
| Manual | SMM 16.18 para 51; "move to line abreast" signal Table 12.1; check turns "may be used to help a wingman gain LAB position" SMM 16.19 para 58 |
| Simple entry | Lead establishes the heading first and flies straight and level at 220 KIAS; #2 moves out to the spacing and up to the 0-10° sweep line |
| Dynamic entry | Both manoeuvre onto a new heading together (Lead's call). Not in the first version of this change |
| Speed | Lead accelerates from 200 to 220 KIAS before and during (SMM 16.18 para 49 gives 220). Max power acceleration at 8,000 ft from the repo's thrust fit is about 1.9 kt/s true airspeed at 200 KIAS, 1.2 kt/s at 220 (section 7), so 20 kt takes about 13 to 16 s |
| #2 | Turns away from Lead about 30° to 45° to open the spacing (lateral rate 210 to 300 ft/s at 220 KIAS true speed), then turns back parallel; opening 5,500 ft takes about 20 to 30 s (my arithmetic, estimate). Default spacing is the Setup value (6,000 ft, the wide side) |
| End picture | LAB on the same side as before, spacing within ±100 ft of Setup, sweep 0-10° (the existing `judgePair`) |
| Sim plan | The M2/M1 builder with larger angles and a speed ramp; end judged by `judgePair` unchanged |

### M9. Line abreast to fighting wing and back by in-place turns

| | |
|---|---|
| Manual | SMM 16.19 para 58: check turns of more than 30° "are often called in-place turns and are used to transition from LAB to fighting wing formation or vice-versa" |
| Geometry | LAB to FW: both turn in place (existing `inPlace90`), turning **away** from #2 leaves #2 6,000 ft astern in trail, then #2 closes to FW by M4 (a straight-ahead rejoin). FW to LAB: #2 first opens out (M8), and the in-place turn is used to point the pair on a new heading |
| Use | An alternative to M6 and M8, behind the "Rejoin: ..." option in More. Not the default (question 2) |

### M10. Fluid manoeuvring: enter and leave

| | |
|---|---|
| Manual | SMM 16.17 paras 43, 45-46, 48; AFM7 p.17 "Fluid Manoeuvring"; AFM8 p.19 |
| Enter from echelon | The academic entry: **a 2-second break for spacing** (SMM 16.17 para 43): Lead breaks into a level turn, #2 follows 2 s later. At 220 KIAS that is about 840 ft behind, at 200 KIAS about 760 ft (true speed ft/s times 2 s), inside the 500-1,000 ft FM range. Lead and #2 keep the same power setting from here (para 43) |
| Enter from FW | Lead starts a 30° bank turn in FW and all call ready; Lead then increases to 60° bank and max power (AFM7 p.17) |
| Enter from LAB | SMM 16.17 para 43 says "may also enter from fighting wing or line abreast"; the sim goes LAB, then rejoin to the cone (M6 to FW), then the FW entry |
| Leave | "Terminate" (SMM 16.17 paras 45, 48): Lead recovers to level flight (a gentle turn while re-establishing finger geometry at FW spacing, AFM7 p.17), then #2 is in FW; to close up, a turning or straight-ahead rejoin (para 48) |
| Sim plan | The break entry is `delayed()` with a 2 s wait on identical turns; the manoeuvring itself is the other agent's. Leaving = the other agent's "terminate" ending in FW, then this design takes over |

## 4. The from-to table (every pair, two ships)

Rows are where the pair is now, columns what you pressed. "s" is the side #2 is on now; "keep" means the side does not change unless the Side switch says L or R. A route with "→" is flown as one press: the legs are planned together at the press and the hand-overs between them are smooth (section 6). Where the manual does not name the move, the cell says **est.** and gives the reason.

| From \ To | Echelon | Route | Line astern | Fighting wing | Line abreast | Fluid manoeuvring |
|---|---|---|---|---|---|---|
| **Echelon s** | same side: nothing. Other side: M1 through line astern (SMM 12.20 para 45) | M1 slide out (12.6) | M1 first half (12.20 para 46) | M2 same side (16.38 para 105) | M8 simple entry (16.18 para 51) | 2 s break (16.17 para 43) |
| **Route s** | M1 slide in (12.24 para 58 "route then echelon"). Other side: slide in, cross via line astern | nothing | M1 cross to astern (12.20 para 44b, **est.** at route spacing) | M2 (16.38 para 105; **est.** from route) | M8 (16.18 para 51 names route) | 2 s break (**est.**: manual names echelon) |
| **Line astern** | M1 move out and up (12.20 para 47) | M1 out to route (**est.**) | nothing | M2 drop back and out (**est.**) | via echelon → M8 (**est.**; para 51 does not list line astern) | 2 s break (**est.**) |
| **Fighting wing s** | M3 close through route (16.15 para 38; AFM7 p.18), or M4. Other side: through route, cross via line astern | M3 first half | M3 then M1 cross (**est.**) | same side: nothing. Other side: "flow to the opposite side" behind Lead (12.29 para 69) | M8 (16.18 para 51); alternative M9 | start FM: Lead 30° turn, all ready, then FM (AFM7 p.17). The FM design takes over |
| **Line abreast s** | M6 hot turning rejoin direct to echelon (16.20 para 66), or M4 straight ahead (16.20 para 65a). Default: through FW, so M6/M4 to FW then M3 | M6/M4 to FW then M3 first half (**est.**: manual rejoins to FW first, para 65) | via FW then M3 + M1 (**est.**) | M6 turning rejoin to FW (16.20 para 65) or M4; alternative M9 | nothing. Spacing change: a slide (M8 geometry) | via FW (M6) then FM entry from FW (16.17 para 43) |
| **Fluid manoeuvring** | terminate, FW, then M3 (16.17 para 48; 16.15 para 38) | same, stop at route | terminate, then close from the cone behind Lead (**est.**: through Lead's six, M4 style) | terminate then re-establish FW spacing (AFM7 p.17) | terminate, FW, then M8 (**est.** route, no direct manual line) | nothing |

Notes:

1. **Side.** The wingman keeps its side unless the Side switch says otherwise. A turning rejoin ends on the **turn side** of Lead (SMM 12.24 para 59; para 106 "right turn means join finger left" which puts No. 2 on the right), so Lead's turn direction sets the end side for M6. For the LAB-to-echelon default, Lead turns into #2 so #2 keeps its side (AFM7 p.17).
2. **From any unusual picture** (for example in trail after an in-place turn) the planner classifies the pair from its real positions (nearest formation by range and bearing) and routes from that, not from the label the screen last showed. If it fits none, it behaves as a rejoin from wherever #2 is (M4 or M5 to FW).
3. **Echelon left or right** is one button with the Side switch (the same way the manoeuvre buttons come in left and right).

## 5. Two ships and four ships (element join, Spread 4)

This is for the next step (the 4-ship); the two-ship design above is written so the 4-ship adds aircraft and routes, not rewrites (spec section 6 already keeps a `ref` chain). All rows are SMM 16 unless stated.

| From → To | Route | Manual |
|---|---|---|
| Finger → echelon (same side) | #3 (with #4) moves out, back, slightly down to make room; #2 crosses behind and below Lead; #3 and #4 regain spacing | 16.32 para 87 |
| Echelon → finger (other side) | #3 and #4 move slowly back and down, pass behind and below #2 and Lead; #4 passes lower than #3 and takes echelon on #3 | para 88 |
| Finger → line astern, and back | #2 and #3 (with #4) back and down; #3 waits for #2 to reach astern before moving across | paras 89-90 |
| Finger → box | #2 and #3 hold; #4 moves back and down behind #3 and then in as line astern on Lead; back to the same finger | para 91 |
| Finger or echelon → FW | wingmen slowly drop back and increase separation from each other; 3-4 ship FW is a 60° sweep off the preceding aircraft; #3 and #4 alternate sides | para 92; 16.38 paras 104-105; AFM7 p.14 |
| FW → Spread 4 | Start from FW with finger geometry; use altitude and power to make spacing; **300 ft stacks (low to high 4, 3, 1, 2)** once in position; initial spacing on the wide side (6,000 ft) | AFM7 p.15; AFM8 p.15; SMM Fig 16.33 (4,000-6,000 ft between each adjacent pair) |
| Spread 4 → FW | Lead pauses, lets #2 establish closure, gentle turn toward #2; #2 flies a TRJ to FW spacing (inside) holding its stack; #3 and #4 fly cold TRJs to FW spacing (outside); #3 must keep clear of #2 ("hot for 2, cold for 3") | AFM7 p.17; AFM8 p.19; 16.34 para 96 |
| FW → offset box | "FLUID 4, GO": #3 diverges to wide LAB (6,000 ft) on Lead, #2 and #4 stay FW on the outside; or in-place 90 in FW then elements spread to LAB | AFM8 pp.20-22; 16.41 para 110 |
| Element join (2+2 to 4) | Second element joins from FW or in close; rejoin to the briefed position by the rejoin rules; #3 and #4 normally join the outside of Lead on a turning rejoin, passing about two aircraft lengths behind and slightly below | 16.30 paras 81-83; 16.34 para 94 |
| Not allowed | Finger to finger | 16.33 para 93 |

For the sim: "join the second element" is the M5/M6 planner run for #3 against Lead's path with the stack offsets as a vertical profile, and #4 flies off #3 (its `ref`). Spread 4 is M2/M8 with four aircraft and the stack profile. The altitude stack's own failure mode (an aircraft not at its block) is judged, not enforced.

## 6. How the sim would plan it

**At the press** (the same moment the existing `press()` plans, `formation.js` `start()`): classify the pair (note 2 above), look up the route in section 4 (a list of legs), plan each leg from the end state of the previous leg's dry run, join the legs into one list of segments per aircraft, then dry-run each aircraft for the planned path and end time. Everything is deterministic, so the path drawn is the path flown. A press while a change is being flown is queued, as V2.6 does now (TS-45).

**Reused as is**

| What | Where | For |
|---|---|---|
| `stepAircraft`, `hold` and `turn` segments, `easeRoll`, 90°/s roll | `live/flight.js`, `core/flight-math.js` | all paths |
| `heightAt` profile (smootherstep, no climb rate at the ends) | `live/flight.js` | "below and behind", stacks, removing the stack |
| `dryRun`, `relativeTo`, `onStep`, `wholeDegree`, `turnSeg`, the shackle's "guess then correct with two dry runs" | `live/manoeuvres.js` | slides, solved geometry |
| `delayed()`'s wait rule for identical turns | `live/manoeuvres.js` | the break entry for FM, the break and rejoin |
| `missProfile` pattern | `live/manoeuvres.js` | #2 passes above or below |
| `judgePair`, `LIVE_DEFAULTS`, `SPACING_BAND_FT`, `SWEEP_MAX_DEG` | `live/formation.js` | judging line abreast, setup |
| `turnRateFromBankRadPerSec`, `bankDegFromG`, `gFromBankDeg`, `turnRadiusFromBankFt`, `closureKt` | `core/flight-math.js` | pursuit rule, readouts |
| `aspectAngleDeg`, `relativeBearingDeg`, `headingCrossAngleDeg` | `core/angles.js` | rejoin line, hot or cold, aspect |
| `iasToTasKt`, `excessThrustPerWeight` | `core/t6-performance.js` | speed conversion, acceleration limit |

(`sideways()` in `manoeuvres.js` is private to that file today and would need exporting; that is inside the Turn Sim module, not core.)

**New, all inside the Turn Sim module, small**

1. **Speed segment** `{ kind: 'speed', toKias, rateKtps }` in `flight.js`: changes `kias` and `tasFtps` on a smootherstep like `heightAt` so acceleration starts and ends at zero (F12), keeps flying the path at the new true speed, and feeds the pitch formula (it already reads `kias`). Level flight only in this slice.
2. **Recorded-bank segment** `{ kind: 'bankTrack', points: [[t, bank], …] }`: the planner flies a closed-loop pursuit rule in a dry run, records the bank it commanded, and the real aircraft replays it through `easeRoll`. The path is then identical by construction.
3. **Copy-Lead's-turn segment**: once #2 is established, its remaining plan is Lead's remaining turn segments with the same heading targets (what `together()` already does for check, in-place and hook turns).
4. A new file `src/modules/turn-sim/live/transitions.js` holding the leg builders (slide, drop back and out, close through route, straight-ahead rejoin, turning rejoin, entry to line abreast, break entry) and `planGoTo(pair, from, to, options)` returning the same `{ plans, note, firstId }` shape as `planManoeuvre`. No core change. If Patrick wants the speed segment shared with the Traffic Sim later, it would move to core then.

**Speed and energy: what exists**

| Need | Exists? |
|---|---|
| Turn rate, radius, G from bank and speed | yes, `core/flight-math.js` |
| Indicated to true airspeed | yes, `iasToTasKt` |
| Acceleration at **max power** | yes: `excessThrustPerWeight(kias, alt, g)` × g; fitted to the T-6A turn and glide charts |
| Deceleration at **idle or with speed brake** | **no**: the core has full-power thrust and clean drag only |
| A full energy step | `src/modules/turn-fight/energy-sim.js` is a 3D energy-mode simulation (point mass, moves like Immelmann and slice); it is not needed here and is not a module this one may import |

Figures from the core at 8,000 ft, G = 1 (my run of `excessThrustPerWeight` for this design, true airspeed change): 160 KIAS 3.1 kt/s, 180 KIAS 2.5, 200 KIAS 1.85, 210 KIAS 1.5, 220 KIAS 1.2, 230 KIAS 0.85, 250 KIAS 0.2. At 3 G the same function gives a loss of about 0.8 kt/s at 220 KIAS (consistent with the SMM's "minor loss in airspeed" in a 3 G LAB turn, 16.18 para 50), which V2.6 ignores on purpose (card 09:54Z). For slowing, with zero thrust the drag figure is an upper bound of about 2.7 kt/s at 220 KIAS and 1 G; the idle thrust and the speed brake are not modelled, so **the planner uses 1.5 kt/s for "smoothly slows to 200 KIAS" (estimate)**, about 13 s for 20 kt. If Patrick wants this checked against real behaviour, an idle drag figure from the NFM is the one missing number.

**Smooth hand-overs.** Every leg starts and ends wings level and at a steady speed except the turning rejoins, which end by "copy Lead's turn" (so bank, track and rates carry on) and the speed segments, which end at zero acceleration. The existing smoothness check (position, track, bank, roll rate, pitch rate carry straight on) applies to the new legs unchanged.

## 7. Screen

Picture: `screen-change-formation.svg`. V6 has no control like this (it only starts in a chosen preset), so nothing is removed and nothing moves except the Formation card gaining a few lines.

**Left, new group "Change formation"** above the manoeuvre buttons (two columns, like the manoeuvre buttons):
- Always visible, two-ship: **Line abreast, Fighting wing, Echelon, Fluid manoeuv., Route** and a small **Side: Keep | L | R** switch. The button for the formation you are in is greyed ("you are here").
- Behind **More** (one switch, closed by default): Line astern; **Rejoin** type (turning into, turning away, straight ahead, in-place turns; default turning into, question 2); rejoin line (ideal, hot, cold); overtake KIAS (default 15 = middle of EFIG p.374's 10-20); bank cap (default 60°, estimate); Break and rejoin. The four-ship buttons (Finger, Box, Spread 4, Offset box) appear only when four aircraft exist.
- The manoeuvre buttons already there keep working in line abreast and are greyed in other formations (their echelon, FW and FM versions come later).

**Right, the Formation card** keeps its lines and adds, while a change is being flown only:
- "Now: Line abreast, right" and "Flying: Line abreast to Echelon right (hot turning rejoin)".
- Lead and #2: KIAS, bank, G (already there), and the speed segment's target.
- A **Rejoin block** (only during a rejoin): range, closure (kt), Lead's clock position (target 10:30 or 1:30 for a turning rejoin), the line (**ON LINE / HOT / COLD**), and height against Lead (green below, amber if #2 is above Lead: SMM 12.27 para 65 "never at or above Lead's altitude").
- Judged when established (the existing "judged only after roll-out" rule):

| Formation | What it judges | Margins (all **estimate** except where sourced) |
|---|---|---|
| Line abreast | spacing, fore/aft, sweep (existing labels: ON SPACING, WIDE, TIGHT, FORE, AFT) | ±100 ft; 0-10° sweep (SMM 16.18 para 49) |
| Fighting wing | range 500-1,000 ft and sweep 30-60° (labels IN BAND, TOO CLOSE, TOO FAR, TOO FLAT (under 30°), TOO FAR BACK (over 60°)) | the manual's bands (SMM 12.29 para 69) |
| Echelon | lateral, fore/aft, down (feet) | ±15 ft, ±15 ft, ±10 ft (estimate; the shared ±100 ft table makes no sense at this scale, so the check states its own) |
| Route | lateral 1-3 wingspans (33-100 ft), level or slightly low | SMM 12.6 para 15 |
| Line astern | nose to tail about 10 ft, directly behind and below | SMM 12.5 para 13; ±10 ft (estimate) |
| Fluid manoeuvring | inside the cone, 500-1,000 ft, 500 ft bubble | the other agent's design |

Flags, never walls: separation under **500 ft** in FM and high-aspect work and **300 ft** minimum in line abreast crossings are flagged (SMM 16.13 para 31; Gen Book p.11; AFM7 p.26), but close formation, route and a rejoin legitimately go below those, so the flag applies only to the formations that name it. **Lead's G** over 4 in FW/FM and 3 in close formation is flagged (2 CFFTS Orders B2 ch 8 "Formation Limitations - Mutual" para 1a; Gen Book p.11), never limited.

**Centre:** nothing new except, during a rejoin, a dashed range ring and a closure arrow on #2. The camera auto-zooms in when the pair is closer than about 1,000 ft so the close formations can be seen (question 8).

## 8. Hand-over to the fighting wing and fluid manoeuvring design

This design ends with #2 **established** in each formation; the other agent owns what #2 does inside FW or FM.

| Hand-over | Condition when this design finishes | Who flies it from then |
|---|---|---|
| Established in fighting wing | #2 within range 500-1,000 ft and sweep 30-60° (SMM 12.29 para 69), matched KIAS (within ±5 KIAS), Lead's bank copied, vertical separation below Lead (stack) | the FW design's "hold fighting wing" controller, started with `(lead, wing, side)` |
| Established for fluid manoeuvring | inside the 60° cone at 500-1,000 ft, same power, Lead's call ready | the FM design |
| Leaving FM or FW | their "terminate" (FM) or "close up" ends with wings level and speed matched; this design then takes `(lead, wing)` from wherever they are | this design (the classify step, section 4 note 2) |

Interface I would ask them to meet: one function each, `holdFightingWing(lead, wing, side)` and `enterFluid(lead, wing)`, returning plans in the same `{ segments, profile }` form, and a `leaveFluid()` that ends wings level in FW. Nothing here depends on how they steer inside the cone.

## 9. When things go wrong (spec text)

- **Cannot solve** (no rejoin line within 5 minutes at the set overtake, #2 would have to pass above Lead, or a bank above the cap is needed): nothing changes, the Formation card says why in one line ("No safe rejoin from here: overtake 0, open Rejoin options"), and the pair keeps flying. 5 minutes is a generous limit with its reason: the slowest straight-ahead rejoin from 6,000 ft is about 2 minutes.
- **Press while changing**: queued, as TS-45; a later press replaces the queued one.
- **Press when the pair is not in the formation shown**: planned from the real geometry (section 4 note 2); the card says "From: in trail".
- **Spacing outside the SMM band**: flown and flagged, as now.
- **Speed outside the model** (Lead asked for under 120 or over 250 KIAS): refused with a reason; nothing between 120 and 250 is a wall (the SMM and orders are references).
- **Overshoot is not simulated in this slice**: if the dry run finds #2 would pass ahead of or above Lead the plan is refused with that reason.

## 10. Light checks to write later (pilot-recognisable, no tight times)

- Each button from each formation ends in the formation's picture (section 7 margins), the aircraft on the right side and on Lead's heading.
- #2 is never above Lead's height during any rejoin and never ahead of Lead's 3/9 line while closing inside 1,000 ft (the overshoot lane).
- Closure inside 500 ft is under 20 kt for a turning rejoin and under 30 kt for a straight-ahead rejoin (EFIG p.374 and p.371 overtake bands; margin ±10 kt shared table).
- Turning rejoin: Lead stays at about 30° bank and 200 KIAS (±10 kt, ±5° shared margins) until #2 is in route.
- Every change ends within 5 minutes (reason: a generous limit over the slowest case).
- Smooth hand-overs for every new leg (the existing F12 checks).
- Expected values come from the manuals, never from V6 or from the code's own output.

## 11. Questions for Patrick (one at a time; each with options and my recommendation)

1. **Speed outside line abreast.** After a rejoin the pair is at 200 KIAS (SMM 12.23 para 53); line abreast is 220. What should echelon, route, FW and line astern fly? (a) 200 everywhere except line abreast, with Lead slowing or speeding up inside the transition (**recommended**: it follows the manuals); (b) 220 everywhere, Lead never slows (simplest, but a rejoin then has no manual-style overtake); (c) your own number per formation.
2. **Default rejoin from line abreast.** (a) Turning rejoin, Lead turning into #2, to fighting wing (**recommended**: AFM7 p.17, AFM8 p.19 and Fig 16.25 show it, the SMM says the wingman rejoins to FW first); (b) turning rejoin away from #2; (c) straight-ahead; (d) in-place turn then close; (e) yours. Also, should "echelon" from line abreast be the **hot turning rejoin** direct to echelon (SMM 16.20 para 66) while the others go through FW first? (**recommended: yes**).
3. **Speed model.** (a) A planner-only speed ramp, using the repo's full-power acceleration and an estimated 1.5 kt/s slow-down, no energy model (**recommended**: it matches the "kinematic path" style and the card 09:54Z); (b) keep constant speed everywhere and fake the overtake with path geometry only (can't show the speeds the manual quotes); (c) the full energy model (heavy, not needed). May the speed change only in the transitions while everything else stays constant speed?
4. **Close-formation offsets.** The manuals give references (wing-tip on spinner, rudder hinge line), not feet. (a) Use my estimates (about 45 ft lateral, 25 ft aft, 5 ft low for echelon; 1-3 spans for route) and flag them as estimates (**recommended**); (b) Dad gives the feet; (c) yours.
5. **Entering fluid manoeuvring.** (a) From echelon by the 2 s break (the manual's way) and from FW by the 30° turn then max power (AFM7 p.17), from line abreast through FW; route and line astern treated like echelon (**recommended**); (b) the same but only from echelon and FW (refuse others); (c) yours.
6. **Overshoot, bid and errors.** Should the first slice include an Overshoot button and rejoin mistakes (too hot, too much bank), SMM 12.27? (a) Not yet: rejoins always work, overshoot goes on `future.md` (**recommended**: fewest moving parts to fly and judge first); (b) include Overshoot (a roll level, pass behind and below path, then cross-over); (c) include both.
7. **Four-ship order.** (a) Two-ship transitions first (section 4), four-ship (section 5) as the next module step (**recommended**); (b) design both for one build; (c) four-ship first.
8. **Camera for close formations.** At 6,000 ft width the close formations are invisible. (a) Auto-zoom in when the pair is closer than about 1,000 ft, back out when they open (**recommended**); (b) a second close-up inset window; (c) no change.
9. **Hot and cold line numbers.** The SMM draws hot and cold but gives no angles. (a) Use my 60° and 30° bearing and let the screen show the bearing flown (**recommended**); (b) Patrick or Dad gives the angles; (c) drop hot and cold, keep only the ideal line.
10. **Wingman bank cap in a rejoin.** The SMM says "same or more bank" and warns about losing sight. (a) 60° cap, estimate (**recommended**; it is the break's own bank, Orders / EFIG p.374); (b) the 70° / 3 G LAB bank; (c) yours.

Unsure about: the exact end side for a turn-away rejoin (SMM 16.20 para 65b(1) does not say which side #2 ends on; I read it as the turn side from para 59); whether route is allowed as a direct entry to line abreast (para 51 lists echelon, route and FW, so yes); and the estimate columns above. Also **unseen**: the SVGs were not rendered here, and no flight code was run beyond the rough sketch script and a read of the core's thrust fit.

## Patrick's answers

- Q1 speed outside line abreast: **200 KIAS**, Lead slows or speeds up inside the transition (card, 11:08Z 4 Oct).
- Q2 default rejoin from line abreast: **Lead turns into #2**, #2 rejoins to fighting wing; Echelon goes direct by the hot turning rejoin (card, 11:09Z 4 Oct).
- Q3 speed model: **speed ramps** planned only inside transitions, constant speed otherwise; slow-down 1.5 kt/s is an estimate (card, 11:09Z 4 Oct).
- Q4-Q10: running on the recommendations above until Patrick says otherwise.
