# Turn Sim: the four-ship (design only, no code)

Draft of 4 Oct 2026 for Patrick. Asked at 11:14Z, list agreed 11:15Z: (1) manoeuvring in the offset box and in fluid 4 and moving in and out of them, (2) the 4-ship fighting wing, (3) G-warm from Spread 4, (4) 4-ship rejoins to finger or echelon, turning and straight ahead, (5) close 4-ship position changes. Lost sight, overshoot and contingencies go on the training-errors list; take-offs and GULAP/initial recovery are the Traffic Sim's. Nothing here is built, decided or in the repo.

Page references only, no manual text copied (SMM = Standard Manoeuvre Manual; AFM7/AFM8 = the four-plane briefs, PDF page numbers; Orders = 2 CFFTS Orders B2 ch 8; EFIG = instructor guide). Numbers are sourced or marked **estimate**. This design builds on and does not contradict the two 2-ship designs beside it: `../transitions/design.md` (called **T** below, with its moves M1 to M10 and Patrick's answers of 4 Oct 11:08-11:09Z) and `../fighting-wing/design.md` (called **FW**, assuming its recommendations: Lead scripted, wingman live, on the point-mass model).

Pictures beside this file, all drawn by `make-pictures.mjs` in this folder (my own drawings, not the manuals' figures; I looked at every PNG):

| Picture | Shows |
|---|---|
| `fig1-close-formations.png` | finger, echelon, box, line astern, to scale |
| `fig2-big-formations.png` | Spread 4, offset box, Fluid 4, four-ship FW, and the altitude stack |
| `fig3-formation-graph.png` | how the formations join up (the from-to graph) |
| `fig4-g-warm.png` | G-warm from Spread 4, with a first-cut timeline |
| `fig5-offset-box-entry.png` | fighting wing, Fluid 4, in place 90, offset box |
| `fig6-gates.png` | who moves when: the "wait for the one ahead" rules as start times |
| `fig7-screen.png` | the lean screen with four aircraft |

Scratch arithmetic I ran for this note: `probe-delays.mjs` (the offset box delays, uses the repo's Turn Sim flight code read-only), `graph-data.mjs` (the route table). Not repo code.

## 1. The short version

- **One button per formation, as in T, with fighting wing as the hub.** Every four-ship formation joins to fighting wing by a move the manuals give (section 6); anything else goes through the hub or through finger. The from-to table is generated from that graph, so it cannot disagree with itself.
- **Two ways of flying, chosen by what the manual asks of the aircraft.** Station changes, Spread 4, offset box, G-warm and the rejoin legs are **planned paths** (the Turn Sim way, TS-36), with the manuals' "wait for the one ahead" rules turned into start times (gates). The 4-ship fighting wing and fluid manoeuvring are the only places a wingman must **react**, so they use the live wingman of FW: Lead scripted, #2, #3 and #4 each live off the aircraft ahead ("four misses three, who misses two, who misses Lead").
- **Live pursuit reuses the Fight Sim's controller, not a new one** (coordinator's note): `turn-fight/energy/moves/pursuit.js` (`controlPursuit`, `computeTcpa`, `aimPoint`) and its look-ahead. Moved into `src/core` by the core owner as a shared move with an aim provider; the four-ship supplies the aim (a slot behind the preceding aircraft) and a formation-keeping rule instead of a gun-range one (section 5.4).
- **Fluid 4 is two things in AFM8, and I treat them as two formations:** "FLUID 4, GO" makes two fighting-wing pairs 6,000 ft abreast (AFM8 p.20), and "fluid manoeuvring" is the exercise in one fighting-wing chain (AFM7 p.17, AFM8 p.19). The offset box is entered from the first, not the second (AFM8 pp.20-22).
- **G-warm** is one button in Spread 4 that flies the SMM's sequence for all four together: stand-by, in place 90 toward #2 (3 G), a 5 s half-G push over, hook the other way (4 G), in place 90 back, then tighten to 4,000 ft (about 90 s, estimate). Spread 4 starts on the 6,000 ft wide side, which is exactly its start (AFM8 p.16).
- **The offset box's second element is delayed by solved geometry, not a fixed 10-15 s.** My arithmetic with the repo's flight code: to reform the same box, #3 waits about 9.6 s after Lead starts a delayed 90, 16.7 s for a hook and about the moment #2 starts for a delayed 45 (35 s after the call); the SMM's 10-15 s fits the 90 and nearly the hook, not the 45 (section 5.3, question 5).
- **Rejoins keep the manual's order:** #2 first, then #3, then #4, each starting when the one it flies off is stable (SMM 16.34 para 96, AFM7 p.18). #2 joins the inside of the turn, #3 and #4 the outside; a rejoin from Spread 4 or the offset box goes to fighting wing first (AFM7 p.17, AFM8 pp.19, 25).
- **Sources disagree in three places** (altitude stack, offset box depth, "Fluid 4"), and a fourth I could not settle (the 10-15 s delay). Section 2 lists them; the default is the briefs' where they differ from the SMM (March 2025 briefs are the current Moose Jaw standard), flagged.
- **Build order I recommend (question 10):** G-warm, then the close changes and the Spread 4 to fighting wing and finger rejoins (all planned paths), then the offset box and Fluid 4, then the live 4-ship fighting wing and fluid last (it waits on FW question 2 and the pursuit move).
- **Ten questions for Patrick (section 13), four for Dad.** Everything unseen is listed in section 15; nothing was flown.

## 2. What the sources say that you should know

| # | Finding | What I did |
|---|---|---|
| 1 | **Altitude stack.** AFM8 p.14 (picture) and p.15: low to high 4, 3, 1, 2 in 300 ft steps, #2 +300, Lead 0, #3 -300, #4 -600, for Spread 4 and for the offset box. SMM Fig 16.33 gives a different example: #2 sets the stack and #3, #4 take the opposite block, 250 ft steps (#2 7,750, Lead 8,000, #3 8,250, #4 8,500). | The brief's, as V2.7 already flies (TS-50). The SMM's is a "More" option later. Question 2. |
| 2 | **Offset box depth.** SMM 16.41 para 109 text: second element 6,000-8,000 ft behind. SMM Fig 16.30 and AFM8 pp.21-22 arrows: 8,000-12,000 ft. | 7,000 ft default, flagged outside 6,000-8,000 (TS-18, already ruled). |
| 3 | **"Fluid 4" means two things** (AFM8 p.13 air plan lists "FM 1,3,4" and "Offset box via Fluid 4" separately). | Two formations on two buttons (question 1). |
| 4 | **The 10-15 s second-element delay** (SMM 16.41 para 112a, Figs 16.30-16.32; AFM8 p.23) does not say what it is counted from, and a fixed value does not reform the box in every turn (section 5.3). | Solve the exact delay at the press and show it against the 10-15 s band (question 5). |
| 5 | **Four-ship fighting wing.** SMM 16.38 para 104: "a 60 degree sweep off the preceding aircraft"; two-ship FW is 30 to 60 degrees (SMM 12.29 para 69). AFM7 p.14's picture marks each step 500-1,000 ft (fore-aft). SMM Fig 16.29 and the AFM7 picture both show #3 and #4 stepping to the side **opposite** #2, with #3 close to Lead's track. | Each link is the two-ship band (500-1,000 ft, 30-60 degrees) off the preceding aircraft; defaults are mine (estimate, question 3). |
| 6 | **Finger left** is #3 and #4 on the left and #2 on the right (SMM Fig 16.27; SMM 16.38 para 106: "right turn means join finger left"). | Used throughout; the screen shows "Finger left (3-4 left)". |
| 7 | **Allowed joins.** Spread 4 is entered "normally only via finger or fighting wing" (SMM 16.42 para 114); the offset box "from fighting wing or finger" (SMM 16.41 para 110) while AFM8 builds it from FW through Fluid 4; finger to finger is not authorised (SMM 16.33 para 93). | The graph in section 6. Direct finger to offset box is not built (question 4). |
| 8 | **Orders for more than two aircraft** (B2 ch 8, pp.98-99, page numbers from the text extract): normally 90 degrees bank, 45 degrees pitch, 3 G; box and vic to 120 / 60; four-ship echelon turns "stepped away" at 30 degrees bank (60 for flat turns); FW or fluid with more than three aircraft: no bank limit, 60 degrees pitch maximum, flight manual G limits; wingovers in fluid not below 3,000 ft AGL. | References, never walls (README rule). Flagged on the card (section 7). |
| 9 | **Stack in fighting wing.** TRJ to FW from Spread 4 says "while maintaining stack" (AFM7 p.17, AFM8 p.19); the finger rejoin removes the stack only near route (AFM7 p.18 item 2b). So the stack is **kept** through fighting wing when it comes from Spread 4 or the offset box. The FW design said the manuals give no stack for FW; that is true for FW entered from finger, not from Spread 4. | Stack stays on after a TRJ to FW, until the rejoin takes it off (a setting under More). |
| 10 | **Already built (V2.7, TS-50):** Spread 4 as a Setup option with the brief's stack and five buttons (delayed 90, delayed 45 with check, check, in place 90, hook), `ref` chain #2 and #3 off Lead and #4 off #3, `judgeFour`, no shackle or cross turn (SMM 16.43 para 118; TS-16). | This design extends that code and does not change what it flies. |

## 3. The four-ship formations

Frame: Lead's frame, "back" is behind Lead, "left" is Lead's left. Speeds are KIAS (indicated), compared like with like. Patrick's rule (11:08Z): **200 KIAS outside line abreast**, 220 in it, speed ramps only inside transitions. Pictures: `fig1-close-formations.png`, `fig2-big-formations.png`.

| Formation | Who flies off whom | Position and stack | KIAS | Source |
|---|---|---|---|---|
| **Spread 4** (LAB of four) | #2 and #3 off Lead, #4 off #3 | Neighbours 4,000-6,000 ft abeam, 0-10 degrees sweep, start on 6,000 (wide) before G-warm, tight side (toward 4,000) in manoeuvring; stack #2 +300, Lead 0, #3 -300, #4 -600 | 220 | SMM 16.42 paras 113, 116, Fig 16.33; AFM8 pp.14-17; SMM 16.22 para 70 (220 minimum); 16.18 para 49 |
| **Offset box** | #2 off Lead; #3 off the lead element; #4 off #3 | Each element a LAB (4,000-6,000 ft); second element 6,000-8,000 ft back (default 7,000); #3 in the slot between Lead and #2, #4 outside #2; same stack | 220 (estimate: two LABs) | SMM 16.41 paras 109-112, Figs 16.30-16.32; AFM8 pp.14, 20-24; TS-18, TS-22 |
| **Fluid 4** | #2 off Lead, #4 off #3 (each in fighting wing); #3 on Lead | #3 6,000 ft abeam of Lead (wide LAB), #2 and #4 in FW on the outside; stack once in position | 200 (estimate; FW speed) | AFM8 p.20 |
| **Fighting wing (4)** | each off the preceding aircraft | Each 500-1,000 ft and 30-60 degrees off the preceding one; #3 and #4 on the side opposite #2. Defaults: #2 at 45 degrees and 650 ft, #3 and #4 at 30 degrees and 650 ft (estimate, section 5.4); no stack unless carried from Spread 4 | 200 | SMM 16.38 paras 104-107, Fig 16.29; AFM7 p.14; FW design |
| **Fluid manoeuvring (4)** | each off the preceding aircraft | Inside a 60 degree cone behind the preceding aircraft, 500-1,000 ft, working toward 500-750; same power; 500 ft bubble | PCL max, wingover entry about 230 | SMM 16.17 paras 42-44, 16.40 para 108; AFM7 p.17; AFM8 p.19 |
| **Finger left / right** | #2 and #3 echelon on Lead (opposite sides), #4 echelon on #3 | Estimate: each echelon step 25 ft back, 45 ft out, 5 ft down (T section 2) | 200 | SMM 16.23 para 73, Fig 16.27; AFM7 p.18 |
| **Echelon left / right** | each echelon on the one ahead | All three wingmen on one side, stepping out and back | 200 | SMM Fig 16.27; AFM7 p.19 |
| **Box** | #2 and #3 echelon on Lead (both wings), #4 line astern on Lead | #4 about 45 ft back and 8 ft down (estimate: nose 10 ft behind Lead's tail, SMM 12.5 para 13) | 200 | SMM 16.23 para 73; 16.32 para 91; AFM7 p.20 |
| **Line astern (trail)** | each line astern on the one ahead | About 45 ft nose to nose and 8 ft lower per step (estimate) | 200 | SMM Fig 16.27; 12.5 para 13 |
| **Route** | finger at route spacing | 1-3 wingspans out, level or slightly low (T section 2); the stop on the way from FW to echelon references | 200 | AFM7 p.18 item 2; AFM8 p.9 (enroute: anticipate collapse to route spacing); SMM 12.6 paras 14-15 |

**Roles (element lead and wingman).** An element is a lead and its wingman; the 4-ship is two of them.

| Aircraft | Formation role | Contract | Flown as |
|---|---|---|---|
| **Lead** | formation lead and element 1 lead | predictable, calls every change; keeps +4 G or less and positive G in FW/FM (Orders B2 ch 8 p.98; AFM8 p.30) | scripted (planned path or script) |
| **#2** | wingman of element 1 | "wingmen make the miss" (AFM8 p.30); misses Lead | planned in the LAB family and in station changes; **live** in FW and FM |
| **#3** | element 2 lead, deputy lead (AFM8 p.4 roll call), calls the second element's turns in the offset box (AFM8 p.23); also a wingman of Lead for formation positions | misses #2; must stay clear of #2 in a collapse (AFM7 p.14); responsible for separation from the front element in the box (SMM 16.41 para 111) | planned as an element lead; **live** off #2 only in the full FW/FM chain |
| **#4** | wingman of element 2 | misses #3, who misses #2, who misses Lead; "flies through" #3 (SMM 16.37 para 103; AFM7 p.18) | planned in the LAB family; **live** off #3 in FW, FM and Fluid 4 |

"Flies through #3" means #4 takes its position references off #3 and its pitch and bank references off Lead. In the sim that is: #4's targets are in #3's frame, and #3's planned (smooth) path is what #4 follows, so #3's small movements do not make #4 chase them.

**How each formation is flown (planned or live).**

| | Planned path (TS-36) | Live wingman (FW design) |
|---|---|---|
| Spread 4, offset box, G-warm, all LAB turns | yes, all four | no |
| Close formations and every station change | yes | no |
| Rejoins (legs to FW, finger, echelon) | yes: each wingman's leg is a dry-run pursuit recorded as bank (T section 6, `bankTrack`) | no |
| Fluid 4 | Lead and #3 planned; **#2 and #4 live** (each keeps FW off its lead) | #2, #4 |
| Fighting wing (4) and fluid manoeuvring (4) | Lead scripted | **#2, #3, #4** in a chain |

Hand-over is FW design section 6: a wingman becomes live when the transition ends established in FW; the live controller hands back its filter state when the manoeuvre ends, so nothing steps (TS-47).

## 4. How the sim plans and flies a four-ship change

**One table of places.** Each formation has a `slots(side, settings)` function returning, for each aircraft, `{ ref, back, left, down }` in its reference's frame. The planner (targets), the judge (what "established" means), the card (labels) and the pictures all read the same function, so there is never a second copy of a position (rule book: one source of truth). `fourShipStart()` in `live/four-ship.js` is the first user (Spread 4, the V2.7 start).

**At the press** (T section 6, extended): classify the four from their real positions (nearest formation by the slots, with the side), look up the route in section 6, plan each leg from the end state of the previous leg's dry run, and join the legs into one segment list per aircraft. Everything is deterministic: the path drawn is the path flown. A press while a change is flying is queued (TS-45).

**Gates.** The manuals' "wait" rules are gates: "number three drops back but does not move laterally until number two has moved" (SMM 16.32 para 86); "number two establishes route spacing first, followed by number three, followed by number four" (AFM7 p.18 item 2d); "number three crosses behind lead only after number two has stabilised; number four not until number three has" (SMM 16.34 para 96). A gate is not sensed in flight: the planner knows each leg's end time from its dry run, so a gate is a start time (`{ kind: 'hold', untilSec }`, which `flight.js` already has). `fig6-gates.png` shows three of them with estimated durations.

**Reused as is** (T section 6 lists the 2-ship pieces; these are the four-ship's):

| What | Where | For |
|---|---|---|
| `ref` chain on each aircraft, `STACK_FT`, `planFour`, `judgeFour`, `delayedChain`, `allTogether` | `live/four-ship.js` (V2.7) | Spread 4, its turns, its judge |
| `exactWaitSec`, `dryRun`, `turnSeg`, `relativeTo`, `onStep`, `wholeDegree` | `live/manoeuvres.js` | every solved wait, G-warm, offset box delays |
| `hold`/`turn` segments, `heightAt` profile | `live/flight.js` | gates, stacks, crossunders |
| T's new pieces: speed segment, recorded-bank segment, copy-Lead's-turn, `transitions.js` | from T | rejoins, entries, speed ramps between 200 and 220 |
| The Fight Sim's pursuit controller (below) | `turn-fight/energy/moves/pursuit.js`, `lookahead.js` (read only, being refactored) | live wingmen in FW, FM and Fluid 4 |

**New pieces, all inside the Turn Sim module except the pursuit move:**

1. `live/four-ship-slots.js`: the `slots` functions above (section 3 positions, estimates labelled).
2. `live/four-ship-moves.js`: leg builders: string moves (crossunders, box, trail, route), open out to FW and close through route, FW to Spread 4, Fluid 4 spread, in place 90 then spread to the box, and the three rejoin builders. Same `{ plans, note, firstId }` shape as `planFour`.
3. `live/g-warm.js`: one builder for two or four aircraft (the SMM sequence is the same, SMM 16.22 para 71 and 16.44 para 120). It needs one new flight piece: a **push-over segment** (a vertical G profile, section 5.2).
4. Offset box turns reuse `planFour`'s chain per element plus a solved delay for the second element (section 5.3).

**The pursuit controller, reuse and not rewrite (coordinator's note).** The Fight Sim's `controlPursuit` already does the hard part of a live wingman: it turns an aim point into a G and a bank by placing the lift vector (weight carried, SMM 16.16 para 39e), and it applies the stall line (`availableG`), the shaker, the hard deck and the speed limit (VMO or Mach) as limits, not walls. `aimPoint` shows the structure (lead, pure and lag by where the aim sits), and `computeTcpa` is a closed-form time and distance of closest approach. What does not carry over as it stands:

| Fight Sim piece | Why it is gun-fight shaped | The four-ship's version |
|---|---|---|
| Aim: Curved Control Zone 1,500 ft behind the target, lead and lag weights keyed to 1,800-4,000 ft ranges and 30-60 kt closure | the FW design already found its ranges are gun ranges (FW design section 4) | **Slot provider:** the aim is the slot behind the preceding aircraft (section 5.4) and its velocity; the weights come from the slot error, as in the FW design |
| Collision avoidance: `computeTcpa` with a 3.5 s, 120 ft, 600 ft test and an 85 ft out-of-plane offset (`DECONFLICTION_OFFSET_FT`) | built for two fighters that must pass | **Formation rule:** each wingman checks **every preceding aircraft** (not only the one it flies off): a closing path with miss distance under 300 ft (estimate; the 300 ft LAB-crossing minimum, AFM7 p.26 / SMM Table 16.1) pushes its slot back and out smoothly, never a switch (FW design: a switch made the slot jump). In fluid manoeuvring the 500 ft bubble is the figure (SMM 16.17 para 44c) |
| Tuning (`chaseGainPerSec` 2 per s, deck factor 1.3, VMO margin 40 kt) | tuned for the Fight Sim's merges | keep the Fight Sim's values until the formation toy proves them; the FW design's pilot layer (reaction lag, G onset) goes on top |
| `smoothInputs` | switched off today (TF-57 PR 2 switches it on) | the four-ship needs the smoothing on (FW design section 5.3); this design depends on that PR |

So the request to the core owner is: move `controlPursuit`, `computeTcpa`, `turnPlaneNormal` and the frame helpers it uses (`frame.js`: dot, cross, unit, `velOf`, `posOf`) into `src/core` as a shared move that takes an **aim provider** and a **separation rule** as inputs (the Fight Sim passes its tactical aim and its deconfliction; the Turn Sim passes a slot and a formation rule), along with the parts of `TUNING` and `setup.js` it reads (`chaseGainPerSec`, the deck and VMO terms, `energyTopKias`). Until that move lands, the live parts of this design (section 5.4 and the two live wingmen of Fluid 4) cannot start; everything planned can.

## 5. The moves

Each move gives: manual reference, who does what, speed, end picture, sim plan, judging. Move numbers continue T's M1-M10 as F1 and on (F1-F6 close changes, F7 G-warm, F8-F11 Fluid 4 and offset box, F12-F14 fighting wing and fluid) and R1-R3 for rejoins.

### 5.1 Manoeuvring in Spread 4 (built, V2.7)

Delayed 90, delayed 45 (with the check turn), check, in place 90 and hook are built and judged link by link (`judgeFour`). SMM 16.43 para 118: approved turns are delayed 90 and 45, in place, hook and check; all turns are called by Lead on R/T (para 119); altitude is the main means of separation (SMM note under para 119; AFM8 p.18 item 6). Not changed. What this design adds to Spread 4 is **G-warm** (section 5.2), entry from fighting wing and finger (F6 in section 5.6), and exit to fighting wing (R3, section 5.5).

### 5.2 G-warm from Spread 4 (F7)

| | |
|---|---|
| Manual | SMM 16.22 paras 70-71 and Fig 16.26 (two-ship), 16.44 para 120 and Fig 16.35 (Spread 4); AFM7 p.16 and AFM8 p.16; Orders B2 ch 8 (fuel and tank balance called before a G-awareness exercise) |
| Start | Spread 4 on the wide side, about 6,000 ft (AFM8 p.16 item 1), 220 KIAS at least (SMM 16.22 para 70). The default start is already this picture |
| Sequence (all four fly the same thing) | 1 "stand-by for G-warm": PCL max, fuel check, ensure 220 KIAS, ready calls in order with fuel. 2 "In place 90" **toward #2** at 3 G (AFM8 p.16 item 2; SMM para 71 "normally towards the wingman"), on command with full power set (item 4). 3 5 s half-G push over, then Lead sees the wingmen level. 4 "Hook" the other way: 4 G, energy sustaining, PCL max, "may require a slight descent". 5 each wingman calls "complete" in order (22, 23, 24), a few seconds. 6 "In place 90" back to the original heading at 3 G. 7 tighten line abreast to about 4,000 ft (AFM8 p.16 item 5) |
| Who does what | Lead calls every step; #2, #3, #4 fly accurate G and headings and keep separation from the aircraft ahead (SMM 16.44 para 120). All turns are in place, so nothing crosses except in the hook (everyone turns the same way, same radius) |
| Geometry | In place 90 toward #2 puts the four in trail on the new heading, #2 first and #4 last, 6,000 ft apart (a line 3 NM long), the stack kept. A 4 G hook is a 180 degree turn about 2,800 ft across (my arithmetic: radius 1,410 ft at 248 KTAS), so after the hook and the turn back they are in line abreast again on the original heading, in the same order, shifted sideways by that diameter. `fig4-g-warm.png` |
| Speed | 220 KIAS held (constant, as the line abreast turns are, TS-38). Real 4 G at 220 KIAS bleeds energy (SMM 16.22 para 71 says so); the card notes it. Estimate of the card note's wording only |
| Numbers | In place 90 at 3 G (70.5 degrees of bank): 12 degrees/s, about 8 s with the roll in. Hook at 4 G (75.5 degrees): 17 degrees/s, about 11 s. Both are my arithmetic at 220 KIAS, 8,000 ft (TAS 248 kt) |
| Push over | 0.5 G for 5 s is the SMM's number. A half-G push from level sinks at 80 ft/s after 5 s (about -4,800 ft/min, 11 degrees down) and has fallen about 200 ft; getting level again at 2 G, 1.5 G or 1.3 G costs another 100, 200 or 340 ft. About **300 to 540 ft** in all, 400 ft if the recovery is at 1.5 G, my pick (arithmetic, estimate; the SMM gives no height loss). All four do the same, so the stack is kept |
| Stand-by and "complete" timing | The SMM gives no times. Stand-by 15 s and "complete" 4 s are **estimates**, shown on the card as a short countdown, not a wait for a real radio call |
| Sim plan | New `gWarm(aircraft, towardSide)` builder: `hold` (stand-by), `turnSeg` 90 at 3 G, a **push-over segment** `{ kind: 'push', g: 0.5, sec: 5, recoverG: 1.5 }` (new in `flight.js`: a vertical G profile with the gentle onset the FW design uses, so no step in vertical acceleration, TS-47), `turnSeg` hook at 4 G (bank from `bankDegFromG(4)`), `hold`, `turnSeg` back. Then the tighten: each wingman flies two short turns away from and back to the line with a hold solved from dry runs (the shackle's "guess, correct twice" method): 10 degrees heading change, about 30 s for 2,000 ft, #4 about twice as long as #3 since its move off #3 is on top of #3's (my arithmetic). The aircraft fall back about 175-190 ft along track in the move (v(1 minus cos 10 degrees) x 30 s), inside the 0-10 degree sweep; fixed by power on the roll-out (flagged, not hidden). The same builder, applied to two aircraft, is the 2-ship G-warm (TS-Q19) |
| Judged | G flown against the call at each step, within the shared ±0.5 G (SMM 16.44 para 120 "accurate G"); heading on each roll-out within ±5 degrees; after the last step line abreast re-established at 4,000 ft ±100 ft with each link in the 0-10 degree sweep, stack 300 ft kept ±100 ft. Words, never walls |

### 5.3 Offset box and Fluid 4 (F8 to F11)

**The formations.** Fluid 4 and the offset box are two pictures of the same four aircraft, joined by an in place turn and a spread (`fig5-offset-box-entry.png`, `fig2-big-formations.png`).

**F8. Fighting wing to Fluid 4 ("FLUID 4, GO", AFM8 p.20).**

| | |
|---|---|
| Who does what | Lead flies straight, level, 200 KIAS. **#3 diverges** from its FW slot to wide LAB on Lead (6,000 ft abeam, level) while **#2 and #4 stay in fighting wing on the outside**, each off its own lead (#2 off Lead, #4 off #3) |
| Stack | goes on once in position (AFM8 p.20 item 4) |
| Speed | 200 KIAS throughout (estimate: no manual speed for this move; it follows the FW speed and Patrick's 200 outside LAB) |
| Time | #3 opens about 6,000 ft: a 20 to 30 degree turn away gives 130-190 ft/s sideways at 200 KIAS (TAS 381 ft/s), so 30 to 45 s (my arithmetic, estimate), the same shape as T's entry to LAB (M8) |
| Sim plan | **Planned:** Lead (straight), #3 (turn away, hold, turn back, solved by dry run to end 6,000 ft abeam and level; the `sideways` / `dryRun` method), then the stack profile with `heightAt`. **Live:** #2 and #4 (FW controller, slot off their leads). #4's slot moves as #3 moves, so it follows #3's divergence by itself |
| Judged | #3 6,000 ft ±100 ft abeam of Lead (the shared margin); #2 and #4 inside the FW band (500-1,000 ft, 30-60 degrees) off their leads; stack on |
| Back to FW | the reverse: #3 closes back to its FW slot; the wingmen hold FW. The manuals do not give it (estimate, same builder) |

**F9. In place 90, then spread: Fluid 4 to offset box ("FOR OFFSET BOX RIGHT, IN PLACE 90 RIGHT", AFM8 pp.21-22; SMM 16.41 paras 109-110).**

| | |
|---|---|
| Manual steps | 1 Lead calls the box side and "in place 90". 2 **Both elements turn in fighting wing** to the new heading. 3 Once established on the heading, the elements spread to LAB. 4 #3 calls "IN" when the rear element is ready to manoeuvre (AFM8 p.21 items 1-4; p.22 for the left box) |
| After the turn | The two pairs are in trail: Lead's pair ahead, #3's pair 6,000 ft behind (the old abeam spacing) |
| After the spread | Each element is a LAB (4,000-6,000 ft, Lead and #2 spreading to 6,000, #3 and #4 likewise), the second element behind by the box depth, **#3 in the slot between Lead and #2 and #4 outside #2** (AFM8 pp.21-22 final panels; TS-R3). The trail grows from 6,000 to the 7,000 ft default by #3's power (estimate; AFM8 shows "6,000 ft or more"; TS-18 settles 7,000) |
| Left and right | Both calls on pp.21-22 say "in place 90 right"; the left box ends with #2 and #4 on the other side of their leads, so in the left box the wingmen flow across behind their leads during the turn (FW "flow to the other side", SMM 12.29 para 69). My reading of the pictures; a Dad question |
| Stack | #2 +300, Lead 0, #3 -300, #4 -600 (AFM8 p.14, "once in position", p.20), kept in the turn |
| Speed | 200 KIAS in Fluid 4; Lead accelerates to 220 for the LAB spread, as in T's M8 (speed ramp inside the transition only: Patrick 11:09Z). Estimate: the manuals give no offset box speed (question 9) |
| Who does what | Lead and #3 (element leads) turn in place at 3 G then open out: **planned**. #2 and #4 stay in FW through the turn: **live**, then the spread is planned for all four from the established state |
| Time | In place 90 about 8 s; the spread is two lateral moves of about 4,000-6,000 ft each (about 30 s per 2,000 ft at a 10 degree heading change, estimate): **1.5 to 2 minutes in all** (estimate) |
| Judged | Each element a LAB 4,000-6,000 ft, ±100 ft against the aimed spacing; trail inside 6,000-8,000 ft (outside it flagged, TS-18); #3 on the slot within ±500 ft laterally (estimate); stack ±100 ft; the front element's separation from the rear flagged under 300 ft vertical or 500 ft total (SMM 16.41 para 111: the rear element is responsible) |

**F10. Manoeuvring in the offset box (SMM 16.41 para 112, Figs 16.30-16.32; AFM8 pp.23-24).**

| | |
|---|---|
| Manual | Lead commands the turns for the formation, started by the first element; #3 calls the turns for the second element (AFM8 p.23 item 1). Delayed 90, 45 and hook: #3 and #4 delay by 10-15 s and "miss numbers one and two"; in place, shackle and check turns: no delay (SMM 16.41 para 112). Upon roll-out prompt power and altitude corrections, stack back on once in position; on the hook watch the other element and keep the stack (AFM8 pp.23-24). Each element flies LAB principles (SMM 16.41 para 109) |
| Who does what | Front element (Lead, #2) flies the V2.7 LAB turn with `planFour`'s two-aircraft chain. Rear element (#3, #4) flies the same turn as a pair, **delayed by a solved wait**. #3 is the rear element's lead (the delay is #3's), #4 turns at the standard LAB cue off #3 (Fig 16.30 note) |
| The delay | Using the repo's flight code at 220 KIAS, 8,000 ft (TAS 419 ft/s) and 70/3 turns, with spacing 6,000 ft and trail 7,000 ft (`probe-delays.mjs`): **delayed 90**: #3 waits 9.6 s after Lead starts its own turn to roll out in the same box (7,000 ft trail, in the slot), as (trail minus half the spacing) ÷ speed; across the SMM's 6,000-8,000 ft box and 4,000-6,000 ft spacing that is 7 to 14 s, so the 10-15 s fits. **Hook**: 16.7 s (trail ÷ speed): the SMM's 10 s would leave the second element 1,400 ft behind, 15 s about 5,600 ft. **Delayed 45**: #3 starts about when the second front aircraft starts, about 35 s after the call, and ends about 200 ft off the slot sideways. So 10-15 s is right for some and not others, and the SMM does not say what it counts from. The planner solves the delay and shows it against the band |
| Speed | 220 KIAS, constant (as in Spread 4) |
| Sim plan | Reuse `delayedChain`/`allTogether` on each pair; rear delay from `exactWaitSec` against the front element's dry run, refined by a dry run so the rear ends in the slot (the method of `probe-delays.mjs`); stack held through the turn; "re-establish stack once in position" is the stack profile after roll-out (FUTURE item in `turn-sim/future.md` for #2 setting the block) |
| Judged | As Spread 4 per element, plus trail, slot and the 6,000-8,000 ft band; the delay used and its band shown on the card |

**F11. Offset box to fighting wing (AFM8 p.25).** Lead pauses, lets #2 establish closure, then a gentle turn toward #2; #2 flies a TRJ to FW (inside) holding its stack; #3 and #4 fly TRJs to FW (outside) holding theirs; #3 positively separated from #2 and #4 from #3. It is the Spread 4 rejoin with the rear element 7,000 ft further back (section 5.5, R3). Time: the rear element needs about 7,000 ft more closure (about 7,000 ft ÷ 42 ft/s, nearly 3 minutes for a +25 kt overtake, estimate), so the card shows "Lead turns 30° at 200 KIAS" and the run limit is generous (section 9).

**Fluid 4 manoeuvring.** AFM8 gives only the in place 90 in Fluid 4 (both elements turn in FW); the SMM has no Fluid 4. So manoeuvring in Fluid 4 is **in place 90 left or right** called by Lead, each element's lead turning at 3 G and its wingman live in FW. Level turns and wingovers happen in the single FW chain (below). The offset box's own LAB turns (F10) are the manoeuvring that follows. Question 1 asks Patrick whether that is what he means.

### 5.4 Four-ship fighting wing and fluid manoeuvring (F12 to F14)

| | |
|---|---|
| Manual | Fighting wing: SMM 16.38 paras 104-107, Fig 16.29; AFM7 p.14. Fluid: SMM 16.40 para 108 ("same concepts as two-plane", restrictions in the Orders), SMM 16.17 paras 42-48; AFM7 p.17 and AFM8 p.19; Orders B2 ch 8 pp.98-99 |
| Who flies off whom | Each wingman off the preceding aircraft: #2 off Lead, #3 off #2, #4 off #3 (SMM 16.38 para 104, 16.39 para 107; "four misses three, who misses two, who misses Lead", AFM7 p.14, AFM8 p.27). #2 sets its side; **#3 and #4 fly the opposite side** (AFM7 p.14 item 4; SMM 16.38 para 104) |
| Position | Each link 500-1,000 ft and 30-60 degrees off the preceding aircraft, working toward the near end (AFM7 p.14). "Other than turns, ensure Lead can see you" (AFM7 p.14 item 3). **Default (estimate):** #2 at 45 degrees and 650 ft (the FW design's default), #3 and #4 at 650 ft and 30 degrees, the flat end of the band, so #3 sits about 100 ft across Lead's track and 785 ft back and #4 about 670 ft across and 1,110 ft back (`fig2-big-formations.png`). With 45 degrees on every link #3 would sit directly in Lead's six at 920 ft, which neither the SMM figure nor the AFM7 picture shows (question 3). Stack: none unless carried from Spread 4 (finding 9) |
| Turns | Gentle: keep side and sweep, power as required. Moderate or steep: collapse toward Lead's six as required, and **#3 must ensure clear of #2** (AFM7 p.14 item 5). All members keep every preceding aircraft in sight and ensure separation (SMM 16.39 para 107). Hard turns into a wingman that cause abrupt manoeuvring through the formation are avoided by Lead (SMM 16.36 para 100). Orders: more than three aircraft in FW or fluid, no bank limit, 60 degrees pitch maximum |
| Speed | 200 KIAS in FW (Patrick 11:08Z). Energy is real in FW and FM (FW design question 4); wingmen trim power |
| Sim plan | **Lead scripted** (FW design section 5.1 buttons). **#2, #3, #4 live**, each with the FW design's slot (stabilised against its reference's roll), controlled by the shared pursuit move with a slot as its aim (section 4). The chain means a late #2 makes #3 late, and #4 later still, the "accordion" a real four-ship has. Each wingman's reaction lag is 0.3 s (FW estimate), so #4's total lag is about three times #2's. The `ref` field already on each aircraft gives the chain |
| Separation | Each wingman checks every preceding aircraft (section 4 table), not only its reference |
| Planned stand-in | If Patrick says no to a live wingman (FW question 2), the fallback is the planned "slot follower" (each wingman copies its reference's turns with a short delay). It cannot show lead, pure or lag and cannot be late, and everything else here still holds |
| Judged | Each link IN CONE (500-1,000 ft, 30-60 degrees while Lead is steady; the collapse allowed while Lead manoeuvres), NEAR END at 750 ft or less, STRETCHED over 1,000 ft, CLOSE; **#3 and #4 on the opposite side from #2**; flags in words: inside 500 ft of any aircraft in fluid, wingmen over 5 G, Lead over 4 G, under the hard deck (FW design section 5.5; AFM8 p.30) |

**Fluid manoeuvring (4), entered from fighting wing (AFM7 p.17, AFM8 p.19).** Lead starts a 30 degree bank turn in FW and gets "ready" from each aircraft in order (#2, #3, #4; Orders B2 ch 8: a fuel and tank balance check precedes it), then increases to 60 degrees and sets PCL max for exercise 1 (60/2 level turn), 3 (wingovers) and 4 (barrel roll, 60 degrees of pitch at most). Work toward 500-750 ft. "Terminate" is called in succession, Lead flies a gentle turn while the formation re-establishes finger geometry at FW spacing. In the sim: the 4-ship FM is the FW chain with the FM cone (60 degrees wide, FW question 1) and power copied from the preceding aircraft; **first slice: the 60/2 level turn and terminate only** (FW question 3 (a): the vertical plane is unproved, and with four aircraft each doing the vertical in a chain it is riskier). Wingovers and barrel roll are added only after the FW design's vertical-plane work is proved, and keep the Orders' 3,000 ft AGL minimum and 60 degrees pitch for more than three aircraft as flags.

### 5.5 Rejoins to finger or echelon (R1 to R3)

All from SMM 16.34 paras 94-96, 16.20 para 65, AFM7 p.21, AFM8 pp.19, 25. The 2-ship moves are T's M3, M4, M5 and M6; the four-ship adds the order and the outside join. Speeds: Lead 200 KIAS, 30 degrees of bank for a turning rejoin (SMM 16.34 para 96; AFM7 p.21 item 2); rejoins at 200 KIAS if level, 180 if climbing (AFM8 p.11; SMM 12.23 para 53 via T).

| Rejoin | What happens | Gates and rules |
|---|---|---|
| **R1. Straight-ahead rejoin, FW to finger or echelon** | Lead holds heading and speed and calls the formation ("VENOMS FINGER LEFT", SMM 16.34 para 95). Each wingman flies T's M3/M4 (close through route, stack kept for an escape lane, then echelon references) | **#2 to route first, then #3, then #4**; each "maintains safe separation until the preceding aircraft is stabilised" (SMM 16.34 para 95; AFM7 p.18 item 2d, p.21). The stack comes off once stable approaching route (AFM7 p.18 item 2b). Straight-ahead overtake 20-30 KIAS (EFIG p.371 via T) |
| **R2. Turning rejoin, FW or Spread 4 to finger** | Lead rocks the wings (the number of rocks depends on start and finish) and starts a 30 degree turn; "a right turn means join finger left" (SMM 16.38 para 106; 16.34 para 96). **#2 joins the inside of the turn** by T's M5 (10:30 or 1:30 line, overtake 10-20 KIAS); **#3 and #4 join the outside**, "the same cut-off line as #2, aiming to pass about two aircraft lengths behind and slightly lower than Lead" (SMM 16.34 para 96; AFM7 p.21 items 3-4). Two aircraft lengths is about 65 ft (estimate: the CT-156 is about as long as its 33.4 ft span; not a manual number) | **Only after #2 has stabilised and is entering its position can #3 cross behind Lead; #4 not until #3 is stabilised** (SMM 16.34 para 96). Overshoot is "below and behind as per two-plane" (AFM7 p.21 item 5): not simulated here (training errors list) |
| **R3. Spread 4 or offset box to fighting wing** (the TRJ of AFM7 p.17, AFM8 pp.19, 25) | Lead **pauses** (flies straight) to let #2 establish closure, then a gentle turn **toward #2** (the 30 degree turn at 200 KIAS). #2 (inside, "hot") flies a TRJ to FW spacing holding its stack; #3 and #4 ("cold") fly TRJs to FW spacing holding theirs, #3 rejoining from the same distance as #2 but "hot for 2, cold for 3" so it stays clear of #2 (AFM7 p.17 item 4); in the box #4 stays clear of #3 too (AFM8 p.25) | The stack is the separation (AFM8 p.18 item 6 "main means of safety remains the altitude stack and lookout"), so each wingman's planned path is checked to keep at least 300 ft vertically or 500 ft total from every other aircraft until its own leg ends (estimate of the check; 300 ft is the LAB crossing minimum, AFM7 p.26). Lead's 200 KIAS means Lead slows from 220 first (T's speed segment, 1.5 kt/s estimate, about 13 s) |

**Sim plan.** T's planner (dry-run pursuit rule recorded as bank) run once per wingman, in gate order, against Lead's real planned path; for #3 and #4 the constraint set also holds the earlier wingmen's already-planned paths, so a path that would pass too close is replanned later or refused with the reason. "Copy Lead's turn" takes over once each wingman is established, as in T. First-cut times are not given: my scratch pursuit toy did not converge and I discarded it, so any duration here is arithmetic from the 2-ship numbers: a straight-ahead rejoin is about 2 minutes for the first wingman from 6,000 ft astern (T M4), the later two start on gates, so **plan on 4 to 6 minutes from Spread 4 to finger** for the planner's run limit (estimate; section 9).

**Hand-over.** R3 ends at "established in fighting wing" (FW design section 6): each link in the band, KIAS within ±10 kt and closure within ±5 kt of the preceding aircraft, for at least 5 s (FW's estimate). R1 and R2 end in finger or echelon, wings level on Lead's heading.

### 5.6 Close four-ship position changes (F1 to F6)

The manuals: SMM 16.32 paras 85-92 (formation changes, called on R/T, "FREEZE" if unsure), AFM7 pp.18-20. Estimates: slide at about 5 kt (8 ft/s, T M1), step size per section 3. Heights for a crossunder are not given in the manuals ("behind and below", paras 87-88): estimate 15 ft below Lead and #4 about 10 ft lower than #3 where it must pass lower.

| Move | Manual | What happens | Gate order |
|---|---|---|---|
| **F1. Finger to echelon, same side** | SMM 16.32 para 87; AFM7 p.19 | **#3 with #4 move out, back and slightly down to make room; #2 crosses behind and below Lead** (the crossunder, a degree or two of heading, not bank); #3 and #4 then regain spacing | #3+#4 out (about 8 s), **then** #2 crosses (about 20 s), **then** #3, #4 regain (about 8 s): about 35-40 s (estimate), `fig6-gates.png` |
| **F2. Finger to echelon, other side** | SMM 16.32 para 88 (reversed); AFM7 p.19 | **#3 and #4 move slowly back and down, pass behind and below #2 and Lead; #4 passes lower than and behind #3 and takes echelon on #3** | #3 first, #4 follows #3's path lower; #2 does not move |
| **F3. Echelon to finger** | SMM 16.32 paras 87-88 reversed (estimate) | The reverse of F1 or F2 | as F1/F2 reversed |
| **F4. Finger to box and back** | SMM 16.32 para 91; AFM7 p.20 | #2 and #3 hold; **#4 moves back and down to pass behind #3**, stabilises in a loose line astern, then power moves it into normal line astern on Lead. Lead ensures it reforms in **the same finger** | #4 only: about 40 s (estimate) |
| **F5. Finger to line astern and back** | SMM 16.32 paras 89-90 | #2 and #3 (with #4) back and slightly down. **#3 moves back far enough for #2 to take position before moving across** (para 86: finger to line astern, #3 drops back but does not move laterally until #2 is astern). #4 moves onto #3. Back: #2 moves out and up first, then #3, then #4 regains | #2, then #3, then #4: about 60 s (estimate) |
| **F6. Finger or echelon to fighting wing; finger to Spread 4; route** | SMM 16.32 para 92, 16.38 para 105, 16.42 para 114; AFM8 p.9 | Wingmen **slowly drop back and increase separation from each other** until each is stabilised behind the preceding one; "a lateral move into position can then be made". From echelon #2 normally moves out to the side it was on (SMM 16.38 para 105). For Spread 4, **#3 moves out slower than usual and waits for #4 to begin moving out first** (para 114); #4 uses a smaller heading change and a slight stack (para 115); #2 as usual | order in the SMM text above; the open-out is T's M2 with two more aircraft |

Turns in close formation (echelon turns "stepped away" at 30 degrees bank, finger and line astern turns "the same as two-plane", SMM 16.36 paras 99-101; Orders) are not in this design: the manoeuvres button group in a close formation stays as the 2-ship's (greyed) until Patrick asks.

**Sim plan.** One builder per move on T's M1 slide (two shallow turn segments with a hold between, solved by dry runs; `heightAt` for the vertical), run in gate order and joined into one list. #4's targets are in #3's frame (it "flies through" #3). The close moves are small: the camera zooms when the formation is closer than about 1,000 ft (T question 8).

## 6. The from-to table (every pair of four-ship formations)

Rows are where the four are, columns what you press. The route is the shortest path through the graph below (fig3), costs in rough seconds (estimates), picked automatically and printed here; a "via" is one press flown as several legs, planned together and joined smoothly. Sides: the wingmen keep their side unless the Side switch says otherwise; finger left and echelon right are different pictures, and the manual move for each pair of sides is in the edges table (F1 same side, F2 other side).

`fig3-formation-graph.png` is the same graph drawn.

| From \ To | Spread 4 | Offset box | Fluid 4 | Fluid manoeuvring | Fighting wing | Route | Finger | Echelon | Box | Trail |
|---|---|---|---|---|---|---|---|---|---|---|
| **Spread 4** | here | via FW, Fluid 4 | via FW | via FW | direct | via FW | via FW, route | via FW | via FW, route, finger | via FW, route, finger |
| **Offset box** | via FW | here | via FW | via FW | direct | via FW | via FW, route | via FW | via FW, route, finger | via FW, route, finger |
| **Fluid 4** | via FW | direct | here | via FW | direct | via FW | via FW, route | via FW | via FW, route, finger | via FW, route, finger |
| **Fluid manoeuvring** | via FW | via FW, Fluid 4 | via FW | here | direct | via FW | via FW, route | via FW | via FW, route, finger | via FW, route, finger |
| **Fighting wing** | direct | via Fluid 4 | direct | direct | here | direct | via route | direct | via route, finger | via route, finger |
| **Route** | via finger | via finger, FW, Fluid 4 | via finger, FW | via finger, FW | via finger | here | direct | via finger | via finger | via finger |
| **Finger** | direct | via FW, Fluid 4 | via FW | via FW | direct | direct | here | direct | direct | direct |
| **Echelon** | via FW | via FW, Fluid 4 | via FW | via FW | direct | via finger | direct | here | via finger | via finger |
| **Box** | via finger | via finger, FW, Fluid 4 | via finger, FW | via finger, FW | via finger | via finger | direct | via finger | here | via finger |
| **Trail** | via finger | via finger, FW, Fluid 4 | via finger, FW | via finger, FW | via finger | via finger | direct | via finger | via finger | here |

Generated by `graph-data.mjs` (`matrix.generated.md` has the raw output). Finger to finger on the other side goes **through echelon** (finger right to echelon right to finger left, SMM 16.32 paras 87-88), because the SMM does not authorise finger to finger (SMM 16.33 para 93). Route to Spread 4 and similar long chains are legal but long; the card says how many legs and the estimated time before it starts.

**The edges (the moves the manuals give, with the reverse where I had to estimate it).**

| From to | Move | Source | Plan |
|---|---|---|---|
| Finger to echelon, and back | crossunder: F1 same side (#2 crosses), F2 other side (#3 and #4 cross) | SMM 16.32 paras 87-88; AFM7 p.19 | gates (section 5.6) |
| Finger to box, and back | F4 | SMM 16.32 para 91; AFM7 p.20 | gates |
| Finger to trail, and back | F5 | SMM 16.32 paras 89-90 | gates |
| Finger to route, and back | collapse or open to route spacing (reverse estimate) | AFM8 p.9 | M1 slide |
| Finger or echelon to FW | F6 open out | SMM 16.32 para 92; 16.38 para 105 | M2 |
| FW to route, then finger | close through route, stack off near route | AFM7 p.18 item 2; SMM 16.15 para 38 | M3 |
| FW to finger or echelon (rejoin) | R1 straight ahead or R2 turning | SMM 16.34 paras 95-96; AFM7 p.21 | M4/M5 |
| Finger to Spread 4 | F6 variant: #3 waits for #4, both open out | SMM 16.42 para 114 | M2/M8 |
| FW to Spread 4 | from FW with finger geometry, spacing by altitude and power, stack once in position, wide side first | AFM7 p.15, AFM8 p.15 | M8 builder, stack profile |
| Spread 4 to FW | R3 TRJ | AFM7 p.17, AFM8 p.19 | R3 |
| FW to fluid manoeuvring and back | Lead 30 then 60 bank, PCL max; "terminate" | AFM7 p.17, AFM8 p.19 | FW design |
| FW to Fluid 4 | F8 ("FLUID 4, GO"); back by the reverse (estimate) | AFM8 p.20 | section 5.3 |
| Fluid 4 to offset box | F9 | AFM8 pp.21-22 | section 5.3 |
| Offset box to FW | F11 TRJ | AFM8 p.25 | R3 |
| Not allowed | finger to finger | SMM 16.33 para 93 | refused with the reason |

Not drawn: finger to offset box direct (SMM 16.41 para 110 names it; the mechanics are "as briefed"), and the SMM's own entry "OFFSET BOX EAST/WEST" from fighting wing. Question 4.

**From an unusual picture** (for example in trail after an in place turn): classify from the real slots; if none fits, treat as a rejoin from wherever the aircraft are (R1 or R2 to FW). T section 4 note 2.

## 7. What the Formation card judges (four aircraft)

Judged only when established (the existing roll-out rule, TS-49), each link against the aircraft it flies off (`judgeFour`'s idea), the labels in words. All margins are estimates unless a source is given; the shared table (±100 ft, ±5 degrees, ±10 kt, ±0.5 G) is the default, and a close formation states its own.

| Formation | What it judges | Margins |
|---|---|---|
| Spread 4 | each link spacing, fore-aft, sweep (ON SPACING, WIDE, TIGHT, FORE, AFT, as built); stack heights | ±100 ft; sweep 0-10 degrees (SMM 16.18 para 49); stack 300 ft step ±100 ft (AFM8 p.14); "tight side" preferred in manoeuvring (AFM8 p.17), shown not required |
| Offset box | each element as Spread 4; trail; #3 on the slot; stack; the delay used | trail 6,000-8,000 ft (SMM 16.41 para 109; 7,000 default); #3 ±500 ft laterally (estimate) |
| Fluid 4 | #3 abeam of Lead; #2, #4 in FW off their leads; stack | 6,000 ft ±100 ft (AFM8 p.20); FW bands below |
| Fighting wing (4) | each link range and angle; side (#3, #4 opposite #2); collapse allowed while Lead manoeuvres | 500-1,000 ft, 30-60 degrees (SMM 12.29, 16.38); NEAR END 750 ft or less (AFM7 p.14) |
| Fluid manoeuvring (4) | each link inside the cone; 500 ft bubble to every other aircraft; wingmen over 5 G; Lead over 4 G | SMM 16.17 paras 42-44; Gen Book p.11; AFM8 p.30. Flags, never walls |
| Finger, echelon, box, trail | each link lateral, fore-aft, down in feet; #4's references off #3 | ±15 ft, ±15 ft, ±10 ft (estimate, T section 7) |
| Route | lateral 1-3 wingspans (33-100 ft), level or slightly low | SMM 12.6 para 15 |
| A rejoin | gate order kept (#3 did not cross before #2 was stable, #4 before #3); passed about 2 aircraft lengths behind and slightly below (R2); nobody above Lead's height; each within the SMM band closing | SMM 16.34 para 96; AFM7 p.21; "never at or above Lead's altitude" (SMM 12.27 para 65 via T) |
| G-warm | G flown against each call; roll-out headings; line abreast at 4,000 ft | ±0.5 G, ±5 degrees, ±100 ft |

**Readouts on the card** (extending V2.7's lines): for each link range or spacing, angle and side; heights against Lead; during a change the **gate line** ("#2 stable, #3 closing, #4 waits"), the leg being flown and the estimated time left; during a rejoin T's rejoin block for the wingman in turn (range, closure, Lead's clock position, line, height against Lead); the speed target while a speed ramp runs.

**Flags in words, never walls** (README rule): separation under 500 ft in fluid or high-aspect work and 300 ft at any LAB crossing (SMM 16.13 para 31; AFM8 p.30), any aircraft above its stack height by more than 100 ft in a stack formation, Lead over 4 G or any wingman over 5 G (AFM8 p.30; Gen Book p.11), under the hard deck (3,000 ft AGL), bank or pitch beyond the Orders for more than two aircraft (B2 ch 8 p.98).

## 8. The lean screen

Picture: `fig7-screen.png`. It follows the Turn Sim layout (buttons left, picture centre, card right, one fixed line). **With two aircraft nothing changes.** With four aircraft:

- **Left, "Change formation (4-ship)"**, two columns like the manoeuvre buttons: Spread 4, Fighting wing, Fluid 4, Fluid manoeuv., Offset box, Finger, Echelon, Box; the one you are in is greyed with "(here)". A **Side: Keep | L | R** switch. Behind **More** (one switch, closed): Line astern, Route, rejoin type (turning rejoin default, straight ahead), rejoin side behaviour, stack on or off, overtake KIAS (T default 15), box depth (default 7,000), offset box side, fluid cone width (FW question 1). These four-ship buttons appear **only with four aircraft** (T section 7).
- **Left, "Manoeuvres"**: as V2.7 shows now, with **G-warm** added (Spread 4 only, greyed with a reason elsewhere). In fighting wing the buttons become Lead's FW set (level turn with bank choice, wings level, climb, descend, terminate: FW design section 5.1); in fluid manoeuvring the FM set. Shackle and cross turn stay out of the four-ship (TS-16, TS-25).
- **Centre:** nothing new, except dashed per-leg planned paths during a change, and the camera zoom for close formations (T question 8).
- **Right, the Formation card:** the V2.7 lines (each link, heights against Lead) plus the rows in section 7. Disappears: nothing from V2.7. V6 has none of these controls.
- **One fixed line** keeps its places: KIAS, height, G, stack. The **version label** changes with every published change (rule book).

## 9. When things go wrong (spec text)

| Case | What the sim does |
|---|---|
| A leg **cannot be solved** (no route within the run limit, a path would pass above Lead or inside the separation check, a bank above the cap is needed) | Nothing changes; the card says why and which aircraft, in one line ("No safe rejoin for #3 from here: #2 not stable"); the four keep flying. Run limit **8 minutes** for any four-ship change (a generous limit with its reason: Spread 4 to finger is estimated 4-6 minutes; T's limit for two aircraft is 5) |
| A **gate** never opens | Because gates are planned times, it cannot deadlock; if a live wingman has not reached its slot 120 s (estimate) after its gate, the card says "waiting on #2" and offers nothing automatic (like FW question 5 (a): flag, no auto-terminate) |
| A **press during a change** | queued (TS-45); a later press replaces the queued one |
| **Not in the formation the screen shows** | planned from the real slots; the card says "From: in trail" (or whatever it found) |
| **Finger to finger**, or a move the graph does not give | refused with the reason |
| **Spacing or trail outside the SMM band** | flown and flagged (reference, not wall) |
| **Speed outside the model** (Lead asked for under 120 or over 250 KIAS) | refused with the reason; nothing between 120 and 250 is a wall (T section 9) |
| **Speeds** | every speed on screen and in the plan is indicated airspeed (KIAS) except true airspeed where a number says TAS or KTAS; ground speed is never compared with indicated |
| A **live wingman's controller fails** or a state is missing | FW design section 5.5: dashes, hold the last command up to 1 s, ease to wings level at 1 G, freeze the wingman with a banner |
| **Overshoot, lost sight, contingencies** | not simulated here (training errors list). A rejoin that would overshoot is refused with that reason, as in T |

## 10. Light checks to write later (pilot-recognisable, no tight times)

- Each button from each formation in the table ends in that formation's picture (section 7 margins), the right aircraft on the right side, on Lead's heading.
- Finger left has #3 and #4 on the left and #2 on the right (SMM Fig 16.27); #3 and #4 in FW are on the side opposite #2 (SMM 16.38 para 104).
- Gate order: in a rejoin #3 never crosses behind Lead before #2 is stable, and #4 never before #3 (SMM 16.34 para 96); in a finger to line astern #3 never moves laterally before #2 is astern (SMM 16.32 para 86).
- In the Spread 4 rejoin each wingman stays at its stack height until its own leg ends, and no two aircraft are within 300 ft at once (a margin, not a rule in the flight code).
- G-warm: the four end in line abreast on the original heading within ±5 degrees, about 4,000 ft apart (±100 ft), the stack kept; G flown in each step within ±0.5 G of the call; the push-over sinks, then returns level.
- Offset box: after any turn with its solved delay the box reforms with #3 in the slot and trail inside 6,000-8,000 ft.
- Every change ends within 8 minutes (reason above).
- Smooth hand-overs on every new leg (the existing smoothness checks, TS-47).
- Expected values come from the manuals, standard aerodynamics, Patrick's rulings or recorded flights, never from V6 or from the code's own output.

## 11. Numbers in one place

| Number | Value | Source or estimate |
|---|---|---|
| Spread 4 spacing | 4,000-6,000 ft between neighbours; start 6,000; after G-warm 4,000 | SMM 16.42, Fig 16.33; AFM8 pp.15-16 |
| Stack | #2 +300, Lead 0, #3 -300, #4 -600 ft | AFM8 pp.14-15 (SMM Fig 16.33 differs: finding 1) |
| Offset box | LAB 4,000-6,000 ft per element; second element 6,000-8,000 ft back, default 7,000 | SMM 16.41 para 109; TS-18 |
| Fluid 4 | #3 wide LAB 6,000 ft on Lead; #2, #4 FW outside | AFM8 p.20 |
| FW (four-ship) link | 500-1,000 ft, 30-60 degrees off the preceding aircraft; opposite side for #3, #4; "near end" | SMM 12.29 para 69, 16.38 para 104; AFM7 p.14 |
| FW defaults | #2 45 degrees 650 ft; #3 and #4 30 degrees 650 ft | **estimate** |
| Fluid manoeuvring | 60 degree cone, 500-1,000 ft, work toward 500-750; 500 ft bubble; 5 G | SMM 16.17 paras 42-44; AFM7 p.17; AFM8 p.19 |
| Speeds | 220 KIAS Spread 4, G-warm minimum 220; 200 outside LAB | SMM 16.22 para 70; Patrick 11:08Z; offset box 220 and Fluid 4 200 are **estimates** |
| Turning rejoin | Lead 30 degrees bank, 200 KIAS; #3, #4 outside, pass about 2 aircraft lengths behind and slightly below | SMM 16.34 para 96; AFM7 p.21; "about 65 ft" is an **estimate** |
| G-warm | in place 90 at 3 G, 5 s half-G push over, hook 4 G, in place 90 back at 3 G | SMM 16.22 para 71, 16.44 para 120 |
| G-warm timings and dip | stand-by 15 s, calls 4 s, in place 90 about 8 s, hook about 11 s, dip about 400 ft (300-540), tighten about 30 s per 2,000 ft | **estimates**; turn times are arithmetic at 248 KTAS |
| Offset box delay | solved: 9.6 s (90), 16.7 s (hook), about 0 s after #2's start (45) at 6,000 ft spacing, 7,000 ft trail | **my arithmetic** with the repo's flight code; SMM says 10-15 s (para 112a) |
| Close offsets | echelon step 25 ft back, 45 ft out, 5 ft down; crossing aircraft about 15 ft below Lead, #4 about 10 ft below #3 | **estimates** (T section 2; no manual feet) |
| Slide rate | about 5 kt (8 ft/s) | **estimate** (T M1) |
| Separation checks | 500 ft bubble in fluid, 300 ft LAB crossing, 300 ft at any pass in a planned rejoin | SMM 16.17 para 44c, 16.13 para 31; AFM8 p.30; the planner use of 300 ft is an **estimate** |
| G flags | Lead +4, wingmen +5; Orders: more than two aircraft normally 3 G, FW/FM flight manual limits | AFM8 p.30; Gen Book p.11; Orders B2 ch 8 p.98 |
| Run limit | 8 minutes | **estimate** with its reason (section 9) |

## 12. What this depends on

| Depends on | Where | If it goes the other way |
|---|---|---|
| T's moves M1-M5, M8 and its three new flight pieces (speed segment, recorded bank, copy Lead's turn) and `transitions.js` | sections 5.5, 5.6, F6 | the four-ship adds legs to the same file; if T is not built yet, the first four-ship step is G-warm and the close changes, which need only M1 |
| Patrick's answers to T (200 KIAS outside LAB, Lead turns into #2, speed ramps only in transitions) | sections 3, 5.3, 5.5 | the speeds in section 3 change in one table |
| FW design recommendation (c) and its question 2 (wingman live) | sections 5.3 (Fluid 4's #2, #4) and 5.4 | planned slot follower stands in (section 5.4); G-warm, close changes, Spread 4 rejoin and offset box LAB turns are unaffected |
| FW question 4 (real energy in FW and FM) | sections 5.3, 5.4 | constant speed makes the wingover meaningless; FM stays level-turn only |
| FW question 1 (cone width), 3 (first Lead buttons: level turns first), 7 (defaults 45 degrees, 650 ft) | section 5.4 | my #3 and #4 defaults are separate (question 3 here) |
| The pursuit move in `src/core` and `smoothInputs` switched on (TF-57 PR 2) | section 4 | until both exist, the live wingmen wait |
| A push-over segment in `flight.js` | section 5.2 | G-warm without the dip: level, with the G on the card only (question 6 option b) |
| Core owner requests (nothing touched here) | section 4 | `controlPursuit`, `computeTcpa`, `turnPlaneNormal` and `frame.js` helpers to `src/core`, taking an aim provider and a separation rule; plus the FW design's list (`upFrom` export, `excessFnFor`, an `easeRoll` alias, a 3-D aspect helper) |

## 13. Questions for Patrick

One at a time, each with a working answer the tool uses until he answers. His own idea is always an option.

**Q1. What do you want "fluid 4" to be?** AFM8 uses it for two things: the call "FLUID 4, GO" (two fighting-wing pairs 6,000 ft abreast, the way into the offset box, p.20) and "fluid manoeuvring" with four aircraft (level turn, wingovers, barrel roll in one fighting-wing chain, AFM7 p.17, AFM8 p.19). Options: (a) both, as two formations on two buttons, **Fluid 4** and **Fluid manoeuv.**; manoeuvring in Fluid 4 is the in place 90 the brief gives (**recommended**: it follows the briefs, nothing is guessed); (b) only the AFM8 Fluid 4 and offset box path; (c) only four-ship fluid manoeuvring; (d) yours. Working answer: (a).

**Q2. Which altitude stack?** The brief draws #2 +300, Lead 0, #3 -300, #4 -600 (AFM8 p.14); the SMM's example lets #2 set it and #3, #4 take the opposite block in 250 ft steps (Fig 16.33). Options: (a) the brief's always, as V2.7 flies (**recommended**: March 2025 briefs are the current standard); (b) the brief's, with a "#2 sets the block" switch under More later; (c) the SMM's; (d) yours. Working answer: (a).

**Q3. Where do #3 and #4 sit in four-ship fighting wing?** The manuals give the band (500-1,000 ft, 30-60 degrees off the preceding aircraft, opposite side from #2) but not a default. Options: (a) #2 at 45 degrees, #3 and #4 at 30 degrees, all 650 ft (**recommended**: it puts #3 slightly across Lead's track as the SMM and AFM7 pictures do, and keeps #3 out of Lead's wake); (b) 45 degrees on every link (puts #3 dead in Lead's six, 920 ft back); (c) 60 degrees on every link; (d) Dad's numbers. Working answer: (a), flagged as an estimate.

**Q4. How should the offset box be entered?** Options: (a) only the AFM8 way, from fighting wing through Fluid 4, in place 90, spread (**recommended**: it is fully described, p.20-22); (b) also the SMM's "OFFSET BOX EAST/WEST" from fighting wing or finger, which the manual leaves "as briefed" so I would need Dad's mechanics; (c) yours. Working answer: (a); finger to offset box goes through fighting wing.

**Q5. The offset box second element's delay: solved or fixed?** The SMM says 10-15 s; my arithmetic says the right delay differs by turn (9.6 s for a delayed 90, 16.7 s for a hook, about the same moment as #2 for a delayed 45). Options: (a) solve the exact delay at the press and show it against the 10-15 s band, flag outside it (**recommended**: the same exact-geometry rule as TS-40, and the box reforms); (b) a fixed 12.5 s (middle of the band), accepting that the box reforms badly for the hook and the 45; (c) Dad says what the 10-15 s is counted from. Working answer: (a).

**Q6. G-warm push over and speed.** The SMM gives 0.5 G for 5 s and no height loss; the hook at 4 G "may require a slight descent". Options: (a) draw the push over as a real dip (about 400 ft with a 1.5 G recovery, 300 to 540 ft in all, estimate) and hold 220 KIAS through the 4 G hook, with a card note that the real aircraft would bleed energy (**recommended**: what is drawn is what is flown, and it matches line abreast); (b) keep it level and only show the G on the card (simplest, but the push over is not seen); (c) the full energy model (heavy, not needed); (d) yours. Working answer: (a).

**Q7. Rejoin order for the four-ship: strict or overlapped?** The briefs say #2 establishes route first, then #3, then #4 (AFM7 p.18 item 2d) and #3 crosses only after #2 is stable (SMM 16.34 para 96). Options: (a) strict gates, each starts when the one before is stable (**recommended**: it follows the manuals; about 4-6 minutes from Spread 4 to finger); (b) overlapped, #3 starts when #2 reaches route spacing (faster, a judgement call on safety); (c) yours. Working answer: (a).

**Q8. Close-formation offsets.** The manuals give references, not feet. Options: (a) use the 2-ship estimates (45 ft out, 25 ft back, 5 ft down per step) for the four-ship too, flagged as estimates (**recommended**; extends T question 4); (b) Dad gives the feet; (c) yours. Working answer: (a).

**Q9. Speeds for the offset box and Fluid 4.** Patrick's ruling is 200 KIAS outside line abreast, 220 in it. The offset box is two line abreasts and Fluid 4 is two fighting-wing pairs. Options: (a) offset box 220 (LAB family), Fluid 4 200 (FW), Lead speeding up inside the in place and spread transition (**recommended**); (b) 200 for both; (c) 220 for both; (d) yours. Working answer: (a).

**Q10. Build order for the four-ship.** Options: (a) G-warm; then the close changes and the Spread 4 to FW and finger rejoins (all planned paths); then the offset box and Fluid 4; then the live four-ship fighting wing and fluid manoeuvring last (**recommended**: it follows the plan's own order, `plan.md` Step 4 and the TS-Q20 question; the live part waits on FW question 2 and the pursuit move into core); (b) fighting wing first; (c) design only, build later; (d) yours. Working answer: (a). Each step gets its own short spec and Patrick's yes before it is built.

## 14. For Dad

(For `docs/questions-for-dad.md` once Patrick says so.)

1. In four-ship fighting wing, what sweep and range do #3 and #4 fly off the preceding aircraft, and does Lead see #3 near his six? (Q3 working answer: 30 degrees, 650 ft.)
2. What is the 10-15 s delay for the second element counted from, and is it right for the hook and the 45? (Q5.)
3. In the left offset box, does "in place 90 right" make #2 and #4 flow across behind their leads, as the AFM8 p.22 pictures suggest?
4. What height do you lose in the half-G push over and the 4 G hook of G-warm at 220 KIAS, and where do you start the stack back after it? (Q6.)

## 15. What I did not check, and what I was unsure about

**Unseen:** nothing here has been flown; no screen was built. I looked at the seven PNGs; they are drawings of the formations and of the design, not of the flying. **Arithmetic I ran:** `probe-delays.mjs` (the repo's Turn Sim flight code, read only, at 220 KIAS, 8,000 ft, 70/3 turns) for the offset box delays, and turn rates and radii by hand. A pursuit toy for the rejoin did not converge and was discarded, so there are no rejoin durations beyond estimates built from the 2-ship numbers.

**Unsure about:**
- Finger left and right naming (my reading of SMM Fig 16.27 and para 106); the offset box slot (read from Figs 16.30 and AFM8 pp.21-22); whether the left offset box makes the wingmen cross (Dad question 3).
- SMM 16.38 para 104 "a 60 degree sweep off the preceding aircraft" against the two-ship 30-60 degrees; my default for #3 and #4 is an estimate.
- Whether Fluid 4 is meant as a formation to manoeuvre in beyond the in place turn (Q1).
- Orders page numbers (98-99) come from the text extract, as in the FW design.
- Heights in a crossunder, the two aircraft lengths in feet, the stand-by and "complete" times, the planner's 300 ft check, the 8 minute limit: estimates, labelled.
- The Fight Sim's pursuit move is being refactored; I read `pursuit.js` and `lookahead.js` on main only. The names above may change.

**Found on the machine, not mine:** `/dev/null` in the shell I used became a symbolic link to `/home/user/Dads-debreif/node_modules` (timestamp 11:35Z), so a redirect to it fails with "Is a directory". I did not touch it; the coordinator may want to check what changed it.

## 16. Files in this folder

`design.md` (this file); `fig1-close-formations`, `fig2-big-formations`, `fig3-formation-graph`, `fig4-g-warm`, `fig5-offset-box-entry`, `fig6-gates`, `fig7-screen` (each `.svg` and `.png`); scripts `make-pictures.mjs`, `graph-data.mjs`, `render-png.mjs`, `probe-delays.mjs`; `matrix.generated.md`. Regenerate: `node make-pictures.mjs && node render-png.mjs` (uses the Node and Playwright already on the machine; `probe-delays.mjs` reads the repo's Turn Sim code read-only).

## Patrick's answers

- Q1 fluid 4: **two buttons**, Fluid 4 (pairs abreast) and Fluid manoeuvring (card, 11:43Z 4 Oct).
- Q3 4-ship FW slots: **#2 at 45 deg, #3 and #4 at 30 deg, all 650 ft**, #3 and #4 opposite #2 (estimates until Dad says; card, 11:44Z 4 Oct).
- Q10 build order: **planned first** (2-ship formation changes, G-warm, 4-ship close changes and rejoins, offset box and fluid 4), live FW/fluid last (card, 11:44Z 4 Oct).
