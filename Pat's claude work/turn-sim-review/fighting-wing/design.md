# Fighting wing and fluid manoeuvring: simulation design

Design only, 4 Oct 2026, for Patrick. Nothing here is built, decided or in the repo. Written against main at the Turn Sim V2.6 state (`src/modules/turn-sim/live/`). Numbers marked **estimate** are my guesses; everything else carries a manual page or Patrick's ruling. Manual text is cited by page only (SMM = Harvard II Standard Manoeuvre Manual, AFM7 and AFM8 = the four-plane briefs, Orders = 2 CFFTS Orders, EFIG, Gen Book).

Pictures beside this file (all drawn by scripts in this folder, nothing installed):

| Picture | What it shows |
|---|---|
| `fig1-cones.png` | The fighting wing wedge and the fluid manoeuvring cone, with the 500 ft bubble |
| `fig2-pursuit.png` | Staying on Lead's turn circle (aspect X, HCA 2X) and lead, pure and lag pursuit |
| `fig3-design.png` | The recommended design in boxes |
| `fig4-screen.png` | The lean screen |
| `toy-*.png` | A scratch simulation of the recommended design (section 7), five runs |

## 1. The short answer

- **Fighting wing is a reactive pursuit problem, so the wingman must fly live.** A planned path cannot show the thing the exercise teaches: being late, stretched or tight and choosing lead, pure or lag pursuit to fix it.
- **Recommendation (c): Lead flies a scripted manoeuvre, the wingman flies a live pursuit controller, both on the same point-mass flight model** (`stepPointMass` plus the T-6A thrust and drag already in `src/core`). Lead's script is still worked out at the button press and can be dry-run to draw the planned path, as Turn Sim does today. Only the wingman is reactive.
- **Smoothness comes from one rule: nothing the pilot layer asks for reaches the aircraft except through a rate-limited chain.** Roll goes through the existing `easeRoll` (90°/s, 360°/s², Patrick's ruling TS-37). G goes through the same function with a G-onset limit (estimate 4 G/s). The Fight Sim review found G applied as asked (1.9 to 5.0 G in one 0.02 s step, about 155 to 200 G/s) and roll going from 0 to 90°/s in one step. In the toy run the wingman's G never changed faster than 4 G/s and its roll never faster than 90°/s with the roll rate building at no more than 360°/s².
- **Energy is real in this mode** (speed bleeds in turns, 3-D manoeuvres trade speed for height), because fluid manoeuvring needs "both aircraft maintain the same power setting" (SMM 16.17 para 42) and a vertical manoeuvre is meaningless on constant speed. This departs from the constant speed ruled for line abreast (TS-38), so it is a question for Patrick (Q4).
- **What I could not prove:** the vertical plane. A scratch loop failed (the wingman fell far behind), and the toy's G and range tuning is rough (one run ended 6 ft inside the 500 ft bubble). Section 7 says exactly what was and was not seen.

## 2. What the manuals say

### Fighting wing (two-ship)

| What | Value | Source |
|---|---|---|
| Position | #2 holds a 30 to 60° sweep from Lead at 500 to 1,000 ft | SMM 12.29 para 69, Fig 12.19; EFIG p.391 |
| Sweep is measured | back from Lead's 3/9 line, so a 30° sweep is 60° off Lead's tail and a 60° sweep is 30° off the tail (read from Fig 12.19) | SMM Fig 12.19 |
| Range | "work toward the near end of the range" | AFM7 brief p.14 |
| [manual text left out; see the page cited] the opposite side | AFM7 brief p.14 |
| Visibility | other than turns, make sure Lead can see you | AFM7 brief p.14 |
| After roll-out | sweep enough that Lead can manoeuvre aggressively into the wingman | EFIG p.391 |
| When Lead manoeuvres | #2 is free to do what it takes to stay behind Lead and keep separation: collapse to Lead's six o'clock, flow to the other side, use the vertical, adjust power, or any mix. When it stops, #2 goes back to the swept position, not necessarily on the same side | SMM 12.29 para 69 |
| Gentle turns | keep side and sweep, use power as required | AFM7 brief p.14 |
| Moderate or steep turns | collapse toward Lead's six as required | AFM7 brief p.14 |
| Lead's freedom | Lead is free to manoeuvre in any plane | SMM 12.29 para 69 |

### Fluid manoeuvring (FM, "fluid 4" with four aircraft)

| What | Value | Source |
|---|---|---|
| What it is | an exercise where the wingman reacts to the preceding aircraft and uses lead, lag and pure pursuit to stay inside a defined area behind it | SMM 16.17 para 42 |
| Wingman's aim | stay inside a **60° cone** behind Lead at 500 to 1,000 ft; both aircraft hold the same power; the swept 30 to 60° position is never required and would be outside the parameters | SMM 16.17 para 42 |
| Spacing in the manoeuvres | work toward 500 to 750 ft | AFM7 brief p.17; AFM8 brief p.19 |
| Sequence | a level turn, a loop, two wingovers, a barrel roll, "a non-regimented sequence" | SMM 16.17 para 42 |
| The briefs list | Exercise 1 60/2 level turn, Exercise 3 wingovers, Exercise 4 barrel roll (max 60° of pitch). Exercise 2 is not listed; I infer it is the loop | AFM7 brief p.17; AFM8 brief p.19 |
| Entry | Lead starts a 30° bank turn in fighting wing and gets a ready call from each aircraft, then increases to 60° bank and sets PCL max | AFM7 brief p.17 |
| Entry (academic) | from echelon with a 2 s break; later from fighting wing or line abreast | SMM 16.17 para 43 |
| Out of position at the start | use the first planned manoeuvre to get into the parameters | SMM 16.17 para 43 |
| Restrictions | structural limits plus **5 G at all times**; never more than 90° of aspect together with more than 90° of HCA and low line of sight; a **500 ft bubble** at all times | SMM 16.17 para 44; Gen Book p.11 (500 ft bubble, lead +4 G, wingmen +5 G) |
| Terminate | "TERMINATE" if a restriction is broken (all manoeuvring stops, each aircraft acknowledges); "TERMINATE FOR POSITION" if the wingman is outside the parameters and cannot regain them quickly (Lead then flies a predictable turn until "Cleared to manoeuvre") | SMM 16.17 paras 45 and 46 |
| Wingover | entry about 230 KIAS; about 45° [manual text left out; see the page cited]° of bank, about 3 G; exits about 180° from the entry heading; then another wingover rolling the other way. Predictability is Lead's main job | SMM 16.17 para 47 |
| Adjustments | pursuit may need changes to speed, G and bank, while respecting CFAFM limits | SMM 16.17 para 47 note |
| After the exercise | Lead flies a gentle turn while the wingman re-establishes FW spacing | AFM7 brief p.17 |
| Orders | Lead not above +4 G in FW and FM and keeps positive G; two aircraft in FW/FM have no bank or pitch limits; more than three aircraft: no bank limit, 60° pitch maximum; minimum height for formation wingovers and aerobatics in FM 3,000 ft AGL | Orders B2 ch 8 pp.98-99 (page numbers read from the text extract, check against the PDF) |

### Pursuit curves, aspect and heading crossing angle

| What | Value | Source |
|---|---|---|
| Lead pursuit | nose in front of Lead; most closure; aspect goes up | SMM 12.30 para 72 |
| Pure pursuit | nose on Lead; closure (less than lead pursuit); aspect goes up; line of sight zero | SMM 12.30 para 73 |
| Lag pursuit | nose behind Lead; less closure, more separation, lower aspect | SMM 12.30 para 74 |
| The aim | fly on, or around, Lead's turn circle; lead or lag as required to stay on it | SMM 12.30 para 74 |
| Turn circle factors | radius (from true airspeed and G), [manual text left out; see the page cited] | SMM 16.16 para 39 |
| Plane of motion | a change from a level turn to a vertical or oblique manoeuvre can keep the radius but changes the plane, so the pursuer's flight path must change too | SMM 16.16 para 39c |
| Aspect | angle from Lead's tail to the wingman, 0° directly behind, 180° in front of Lead | SMM 16.16 para 40b, Fig 16.9 |
| HCA | difference between the two headings | SMM 16.16 para 40c, Fig 16.9 |
| On the same turn circle | aspect = X, HCA about 2X, line of sight zero, closure zero | SMM Fig 16.10 |
| Line of sight, closure | how fast Lead crosses the windscreen; how fast range changes; judged by how fast Lead's image grows | SMM 16.16 para 40d, e |
| Inside / outside | lead pursuit uses bank and pitch to put the flight path ahead of Lead, inside its circle; lag puts it behind Lead, outside the circle. Once in position, keep range by following Lead's flight path | EFIG p.391 |
| When Lead is aggressive | [manual text left out; see the page cited] | EFIG p.391 |
| Lift vector | shows where the aircraft will go; place it on the point you want | SMM 16.16 para 39e |

**High plane and low plane.** The manuals I read do not use these words. They say only "utilizing the vertical" (SMM 12.29 para 69) and that pursuit must follow a changed plane of motion (SMM 16.16 para 39c). What I build is standard fighter technique and is an **estimate to confirm with Dad**: a wingman too close in a turn goes above Lead's plane (a lag move that turns speed into height and cuts closure); a wingman too far back goes below it (a lead-pursuit move that gains speed). The controller does this by itself because its aim point has a height part (section 5.2); there is no separate "yo-yo" mode.

**Four aircraft (not in this design).** [manual text left out; see the page cited] (AFM7 brief p.14); No. 3 must stay clear of No. 2 (p.14). Offset box via fluid 4: No. 3 diverges to wide line abreast (6,000 ft), Nos. 2 and 4 hold fighting wing on the outside (AFM8 brief pp.20-22). The controller below takes "the aircraft I miss" as an input so a four-ship can reuse it.

## 3. How the wingman stays in the cone (the rules the controller follows)

Picture: `fig1-cones.png` and `fig2-pursuit.png`.

| Manual rule | What the controller does |
|---|---|
| Hold 30 to 60° sweep, 500 to 1,000 ft, near end of the range (SMM 12.29; AFM7 p.14) | A **slot** in Lead's frame: range and sweep from the settings (my defaults 650 ft and 45°, estimates) |
| Gentle turns keep side and sweep; moderate and steep collapse toward Lead's six (AFM7 p.14) | The slot's sweep eases from the set sweep toward about 10° (estimate) as Lead's bank goes from 30° to 60° (estimates; AFM7 p.17 uses 30° and 60° as its two bank stages) |
| After the manoeuvre go back to the swept position, maybe on the other side (SMM 12.29 para 69) | The sweep eases back out. The side is kept until Lead is steady and the wingman is clearly (over 300 ft, estimate) on the other side; the slot's sideways offset moves smoothly so a change of side crosses behind Lead without a jump |
| Match Lead's turn rate and fly the same circle (SMM 16.16 para 39d, 74; Fig 16.10) | Lead's own turn rate (rotation of its velocity vector) is added to the wingman's commanded turn: "do what Lead did" |
| Lead pursuit to close, lag to open, pure in between (SMM 12.30) | No mode switch. The wingman steers toward a desired velocity that is the slot's velocity plus a catch-up toward the slot. Ahead of the slot gives lag, behind it gives lead pursuit. The screen names what the nose is doing by comparing the velocity vector with the line of sight |
| Use bank and pitch to project the path (EFIG p.391) | The lift vector is placed on the aim (SMM 16.16 para 39e): G and bank follow from the aim and from weight, in 3-D, so the same law flies a level turn and a wingover |
| Use the vertical (SMM 12.29 para 69) | Height error is part of the aim, so high and low plane happen naturally |
| Power (FW: adjust power; FM: same power as Lead) (SMM 12.29 para 69; 16.17 para 42) | FW: the wingman trims power to hold its speed plus the speed the aim asks for. FM: the wingman's power is copied from Lead |
| 500 ft bubble (SMM 16.17 para 44c) | A smooth push of the slot back (up to 250 ft, estimate) when closing near 500 ft. Never a switch: a switch made the slot jump and the toy wingman chatter |
| 5 G (SMM 16.17 para 44a) | The wingman aims to stay under 5 G; if the aim needs more, it asks for 5 and the card flags a stretched position. The 5 G is a published limit: it is the pilot's aim and a flag, not a wall. The only hard G limit is the shaker line (physical) |

## 4. How to simulate it: three options

The current Turn Sim flies fixed paths worked out at the button press (TS-36, Patrick 4 Oct 08:53Z). The architecture review's own guess for the open question was "Lead on a planned path, wingmen live" (`turn-sim-review/README.md`, question A). Fighting wing is where that guess matters.

| | (a) Pre-planned paths for both | (b) Everything live (Lead and wingman both pilot controllers) | (c) Lead scripted, wingman live, one flight model |
|---|---|---|---|
| **What it is** | Each Lead manoeuvre has a hand-built wingman path, worked out at the press | Both aircraft fly step by step on `stepPointMass`, each with a pilot layer, like the Fight Sim | Lead flies a script of bank, G and power through the point-mass model (open loop, repeatable, can be dry-run for the planned path). The wingman flies the pursuit controller on the same model |
| **Realism** | Low to medium. The wingman is never late, stretched or tight, so the lead, pure and lag choices never show. It cannot react to Lead doing something unplanned | High, but Lead also behaves "reactively", which is the wrong thing to teach from: Lead's job is predictability (SMM 16.17 para 47) | High where it matters: the wingman reacts, Lead is predictable |
| **Smoothness** (no jumps in bank, roll rate, G onset, pitch rate: TS-47) | Best. Hand-built curves, nothing to tune | Depends on the chain. The Fight Sim was jerky (G about 155 to 200 G/s, roll 0 to 90°/s in one step). Fixable with the chain below, but two controllers to tune | Same chain as (b). Lead's script is smooth by construction; only the wingman needs tuning |
| **Energy** (speed bleed in turns, vertical manoeuvres) | None unless I also hand-build speed profiles for each manoeuvre; a kinematic loop has no check that the energy exists | Full | Full, and both aircraft share one model, so a wingman cannot out-turn Lead for free |
| **Effort** (my estimate, relative) | Medium to start, but it grows with every Lead manoeuvre and every sequence (the SMM's FM is "non-regimented"): a new wingman plan per manoeuvre, plus new 3-D geometry for wingover, barrel roll and loop that I would have to hand-write | Highest: two controllers, Lead's repeatability lost, preview of Lead's path lost | Medium to high. The one new risk is the controller; the Fight Sim's `tacticalAimCalculation` (lag, pure, lead blend, `energy-sim.js` line 1437) shows the idea but its ranges are gun ranges (1,800 to 4,000 ft) and not reusable as numbers |
| **Fits TS-36** | Yes | No | Mostly: Lead's path is planned at the press. The wingman is the one exception, by design |

**Recommendation: (c).** It keeps Lead predictable and previewable as today, gives the wingman the problem the exercise is about, and uses one flight model so energy is honest. Because it changes TS-36 for the wingman it needs Patrick's yes (Q2). A cheaper stepping stone inside (c): build and prove the wingman controller on Lead's level turns, reversals and climbs first (the toy suggests it works there), then add the three-dimensional Lead scripts.

**What the wingman must not know.** It reacts to Lead's present state (position, velocity, bank, turn rate), not to Lead's planned path. A pilot reacts to what he sees: [manual text left out; see the page cited] (SMM 16.17 para 42). The only advance warning is what Lead calls and shows: "standby", the 30° bank stage in FM entry (AFM7 p.17), and [manual text left out; see the page cited] (SMM 12.31 para 75). The sim can show these as a short on-screen cue before the manoeuvre starts (about 2 s, estimate).

## 5. The design

Picture: `fig3-design.png`.

### 5.1 Lead's buttons

Each button is a script of bank, G target and power, started at the press. Lead keeps positive G (Orders B2 ch 8 p.98; the toy used a 0.7 G floor, estimate) and should stay at or under +4 G (Orders; flagged if not).

| Button | What Lead flies | Source |
|---|---|---|
| Level turn left / right, with a bank choice Gentle 30°, 60/2, Steep 70/3 | Rolls to the bank and holds height; stays in the turn until the next button. In FM it sets PCL max | 30° then 60° with PCL max: AFM7 p.17. 60° = 2 G: EFIG p.183. 70° = 3 G: SMM 16.18 para 50 (a line abreast number, used here for "steep", estimate) |
| Wings level | Rolls out and holds heading | needed to end a turn (mine) |
| Reversal | Rolls through to the same bank the other way | not in the manuals; from Patrick's list of Lead manoeuvres |
| Climb / Descend | Holds a climb or descent angle (default 15°, estimate). Descent power not below 20% torque | SMM 12.31 para 75 (20% torque in formation descents); angle is an estimate |
| Wingover (two, opposite roll) | About 45° of pitch up and down, up to 120° of bank, about 3 G, about 230 KIAS entry, exits about 180° from entry | SMM 16.17 para 47 |
| Barrel roll left / right | Entry about 230 KIAS at about 3 G, pitch no more than 60° | SMM Table 14.1 (through `formation-and-turn-numbers.md`); AFM7 p.17 |
| Loop | Pull through 360° of pitch; entry at least 200 KIAS, about 3 to 4 G | EFIG p.433; SMM Table 14.1 (slow-speed loop) |
| Power up / down (FW only) | A power change, announced by the power reduction signal | SMM 12.31 para 75 |
| Terminate | Lead eases to a gentle level turn and the wingman re-establishes the FW position. In FM it returns the formation to fighting wing | SMM 16.17 paras 45 and 48; AFM7 p.17 |
| "FM standard sequence" (later) | One press flies the SMM's sequence: level turn, loop, two wingovers, barrel roll | SMM 16.17 para 42 |

**Not here:** G-warm is flown from spread 4 or line abreast, not from fighting wing (AFM7 p.13 "Spread 4 from FW for G-warm"; SMM 16.22 paras 70-71). It belongs with the line abreast and transition work (Q8).

### 5.2 The wingman controller (new, three layers)

**1. Slot: where I want to be.** A point in a frame that follows Lead's flight path but is **stabilised against Lead's roll**: forward is Lead's velocity, "up" is the world's up with the vertical carried the same way `point-mass.js` carries it (`upFrom`). So in a loop the slot stays in the loop's plane and in a barrel roll the wingman does not corkscrew around Lead. Slot position = Lead minus (range × cos of the sweep) along Lead's track, plus (range × sin of the sweep) to the chosen side, plus the stack height (default level; the manuals give no stack for FW, and SMM 16.15 para 38 says level or slightly below only for the rejoin through route).

**2. Pursuit: how I get there.**
- Desired velocity = the slot's velocity + (slot position minus my position) ÷ 5 s, the catch-up capped at about 90 ft/s (all estimates).
- Commanded turn = Lead's own rotation rate (do what Lead did) + a correction that turns my velocity toward the desired one over about 1 s (estimate).
- Lift vector: the acceleration needed square to my path, plus the share of weight square to my path, gives the lift vector. Its size is the G, and its direction from my own "up" is the bank (SMM 16.16 para 39e). This is the existing `stepPointMass` control (G along the lift, bank from the horizon), so loops and wingovers need no special case.
- When the lift needed is small (under about 0.6 G) the direction hardly matters, so bank eases to wings level and never rolls the long way round; when the answer is about 180° from the current bank, the roll keeps the direction already chosen. (Both were fixes for real faults in the toy: a wingman that rolled through 400° of bank.)
- Power: FW trims power to hold the speed the aim asks for (`levelThrottle`-style trim plus the catch-up speed); FM copies Lead.

**3. Pilot layer.** A reaction lag (0.3 s, estimate) on G, bank and power; the G aim capped at 5 (SMM 16.17 para 44a, a flag not a wall); the bubble push (section 3).

### 5.3 The smoothing chain (how it avoids a jerky pilot)

The same chain flies Lead and the wingman. Nothing reaches the aircraft that has not been through it.

| Step | Limit | Source |
|---|---|---|
| Roll | `easeRoll`: rate up to 90°/s, built at no more than 360°/s² (0 to 70.5° bank in about 1 s), slows in time to stop on target | Patrick 08:54Z and card 09:54Z (TS-37); existing `easeRoll`, `flight-math.js` line 221 |
| G onset | The same `easeRoll` used on G: up to 4 G/s, built at no more than 16 G/s² | **estimate**. The Fight Sim review found 155 to 200 G/s and roll 0 to 90°/s in one step (4,500°/s² at 0.02 s) |
| Power | first-order lag, 1.5 s | **estimate** |
| G ceiling | the shaker line (`shakerG`): the one physical limit. Published limits (4 G Lead, 5 G wingman, 7 G, 4.7 G rolling) are flagged | `t6-performance.js`; rule book "Published limits are flagged on screen, never walls" |
| Hand-over from a kinematic aircraft | the chain's own state (bank, roll rate, G, G rate, power) is set from the aircraft it takes over, so nothing steps (TS-47) | Patrick 10:05Z |

Pitch rate cannot jump either: with bank and G continuous the point-mass step's pitch rate is continuous.

A **skill setting** maps to three estimate sets: Smooth (reaction 0.5 s, catch-up 7 s, G onset 3 G/s), Normal (0.3 s, 5 s, 4 G/s), Sharp (0.2 s, 3.5 s, 6 G/s). All estimates until Dad or Patrick tunes them against how a good wingman flies.

### 5.4 Numbers in one place

| Number | Value | Source or estimate |
|---|---|---|
| Fighting wing position | 30 to 60° sweep, 500 to 1,000 ft | SMM 12.29 para 69 |
| Default sweep and range, FW | 45° and 650 ft | estimate (middle of the sweep, near end of the range, AFM7 p.14) |
| Default range, FM | 600 ft | estimate (AFM7 p.17: work toward 500 to 750 ft) |
| FM cone | 60° wide in all (see Q1) | SMM 16.17 para 42 and my reading |
| Collapsed sweep | about 10° | estimate |
| Collapse bank range | 30° to 60° | estimate; stages from AFM7 p.17 |
| Bubble | 500 ft | SMM 16.17 para 44c; Gen Book p.11 |
| Wingman G aim | 5 | SMM 16.17 para 44a; Gen Book p.11 |
| Lead G | not above +4, positive | Orders B2 ch 8 p.98; Gen Book p.11 |
| Roll | 90°/s, 360°/s² | Patrick (TS-37) |
| Speed, height | 220 KIAS, 8,000 ft (block height is an estimate) | TS-38 (Patrick card 09:54Z; height estimate) |
| Wingover entry | about 230 KIAS | SMM 16.17 para 47 |
| Step | 0.05 s, fixed | TS-R9; `flight.js` `STEP_SEC` |
| G onset 4 G/s, 16 G/s²; power lag 1.5 s; reaction 0.3 s; catch-up 5 s, 90 ft/s; turn correction 1 s; slot move 2 s | | all estimates, tuned only in the toy |
| Hard deck | 3,000 ft AGL (about 6,000 ft MSL in the Moose Jaw areas) | Gen Book p.11; `formation-and-turn-numbers.md` |

### 5.5 What the Formation card judges

The judge reads the aircraft; it never steers them (picture `fig4-screen.png`).

| Item | Rule | Source |
|---|---|---|
| IN CONE (FW) | range 500 to 1,000 ft, and 30 to 60° off Lead's tail while Lead is steady; while Lead is manoeuvring anything from the tail out to 60° counts (collapse is allowed) | SMM 12.29 para 69; AFM7 p.14 |
| IN CONE (FM) | range 500 to 1,000 ft and inside the 60° cone | SMM 16.17 para 42 |
| NEAR END | range 750 ft or less shown as good | AFM7 p.14, p.17 |
| STRETCHED / CLOSE | range over 1,000 ft / under 750 ft but over 500 | SMM 12.29 (figure names "stretched", "tight") |
| OUT OF CONE | off-tail angle outside the allowed one | as above |
| Readouts | range, angle off tail and side, aspect, HCA, closure (kt), line-of-sight rate, height difference, pursuit now (lead, pure, lag from the velocity vector against the line of sight), each aircraft's KIAS, bank and G | SMM 16.16 para 40; the existing `aspectAngleDeg` and `headingCrossAngleDeg` in `src/core/angles.js` are horizontal only, a 3-D version is new |
| Flags (words, never walls) | inside the 500 ft bubble; wingman above 5 G; Lead above 4 G; aspect over 90° and HCA over 90° with low line of sight (low is an **estimate**: under 5°/s); below the hard deck; at the shaker | SMM 16.17 para 44; Orders B2 ch 8 p.98; Gen Book p.11 |
| Terminate suggested | shown when a restriction flag is up or range stays over 1,500 ft for 20 s (estimate): "TERMINATE" or "TERMINATE FOR POSITION" | SMM 16.17 paras 45 and 46 |
| Judged | while Lead is steady and after each manoeuvre; during a manoeuvre the card shows the numbers but only the flags can go red (Turn Sim already hit the problem of scolding mid-turn: TS-Q21) | Turn Sim review |

**When data fails.** If a position or velocity is missing, not a number, or Lead's speed is below a floor, the card shows dashes and no label. The wingman holds its last command for up to 1 s, then eases to wings level at 1 G. If the controller throws, the sim freezes the wingman and shows a banner. At the shaker the wingman's G is held at the shaker line and the card says AT SHAKER. If the wingman cannot get back into the cone (range over 1,500 ft for 20 s, estimate) the card suggests TERMINATE FOR POSITION; the sim does not stop by itself (Q5).

### 5.6 Wingman settings (essentials only)

| Setting | Values | Default |
|---|---|---|
| Mode | Fighting wing / Fluid manoeuvring | Fighting wing |
| Side | Right / Left | Right |
| Range target | 500 to 1,000 ft | 650 ft FW, 600 ft FM (estimates) |
| Sweep target (FW) | 30 to 60° | 45° (estimate) |
| Wingman skill | Smooth / Normal / Sharp | Normal |
| Behind "More" | wingman power (FW: auto or fixed), stack height, G aim, reaction time, overlays | |

Fluid manoeuvring locks the wingman's power to Lead's and changes the cone; nothing else changes.

### 5.7 The screen

Picture: `fig4-screen.png`. It follows the Turn Sim's own layout (top bar, buttons on the left, picture in the middle, Formation card on the right, one fixed line under the setup). Disappears or hides compared with a full formation screen: spacing and line abreast settings, the 4-ship presets, error settings. Added: Lead's FW/FM buttons, the cone overlay, a "pursuit marks" layer.

## 6. Hand-over to the transitions agent

I start from **established in fighting wing**. That means, for at least 5 s (estimate):

| Part | Value | Margin |
|---|---|---|
| Range | 500 to 1,000 ft | shared table ±100 ft |
| Off Lead's tail | 30 to 60° on the set side | ±5° |
| Height | within ±100 ft of Lead (or the set stack) | ±100 ft |
| Speed | within ±10 kt of Lead | ±10 kt (shared table) |
| Closure | within ±5 kt (estimate) | |
| Both | wings level, Lead straight and level at the briefed speed | ±5° |

What I own: Lead's manoeuvres in FW and FM, the wingman controller, the FW to FM change (the 30° bank stage then 60° with PCL max, AFM7 p.17), Terminate back to FW, the card and the settings.

What the other agent owns, and the facts I found for them:

- LAB to FW and back: check turns over 30° and in-place turns [manual text left out; see the page cited] (SMM 16.19 para 58). Rejoins from LAB go to fighting wing first, on the same side the wingman left; the call is "BLACKS ... FIGHTING WING" or one wing rock (SMM 16.20 para 65; turning rejoin: lead holds 30° bank and a briefed speed).
- FW to echelon: a straight-ahead rejoin or closing through route, level or slightly below Lead (SMM 16.15 para 38).
- Echelon to FW: wingman keeps visual separation through the transition (EFIG p.390).
- Four-ship: Spread 4 from FW and back (AFM7 pp.13, 17), offset box via fluid 4 (AFM8 pp.20-22).
- Academic FM entry from echelon with a 2 s break (SMM 16.17 para 43).

The contract I propose (names are placeholders):

- **In:** Lead state, wingman state (position, velocity vector, up, bank, roll rate, G, G rate, power), side, mode, settings.
- **Out:** the wingman's full state and the judge's result.
- **Slot provider.** The controller's only input about "where to be" is a moving slot point and its velocity. FW's slot is the cone slot above. A rejoin or a LAB to FW transition can pass its own slot (a path blending from the LAB position to the FW slot over a set time) and reuse the same pilot layer and smoothing, so a transition into FW is just a slot that moves. One controller, one smoothing chain.
- **Hand-over from the Turn Sim's kinematic aircraft:** its `{x, y, altAboveFt, headingRad, tasFtps, climbFtps, bankDeg, rollRateDps}` converts to the point-mass state with `pointMassState`, then the bank sets `up`. G and G rate start from the current G and its change. Speed becomes free (energy) the moment the point mass takes over, so going back to a planned LAB path needs the wingman trimmed to Lead's speed first (their decision).
- **Release:** the call that ends FW returns the wingman's state with the chain's filter values so the next controller starts without a step (TS-47).

## 7. Toy check (what I saw, and what I did not)

`toy-check.mjs` is a scratch Node script in this folder, not repo code. It imports the repo's core read-only (`stepPointMass`, `t6aExcessFn` pieces, `easeRoll`, `dampedClimbG`, `shakerG`) and flies Lead on a script and the wingman on the controller of section 5, at 220 KIAS and 8,000 ft, 0.05 s steps, repeated runs gave the same numbers. Pictures: `toy-a-level180-away.png`, `toy-b-level180-into.png`, `toy-c-reversal.png`, `toy-d-climb-descend.png`, `toy-e-fm-level.png`; numbers in `toy-results.json`. Every controller number is an estimate. The wingman starts about 1,400 ft out; "judged" is after 12 s.

| Run | Time with range 500 to 1,000 ft | Range min to max (ft) | Wingman peak G | Notes |
|---|---|---|---|---|
| A. FW, Lead 60/2 level turn away from the wingman (180°) | 99% | 516 to 1,024 | 2.1 | on the outside, sweep stayed at or under 63° |
| B. FW, same turn toward the wingman | 90% | 508 to 1,024 | 4.7 | pulled 4.7 G for a 2 G Lead turn when it crossed the slot |
| C. FW, reversal (90° right, 180° left) | 74% | 494 to 1,070 | 4.7 | ended 6 ft inside the bubble: closure after the last turn not damped enough |
| D. FW, climbing turn then descending reversal (3-D) | 50% | 431 to 1,470 | 4.2 | gets stretched in the climb; wingman bleeds to 121 KIAS against Lead's 158; bubble breached |
| E. FM (power copied), 60/2 level turn | 79% | 846 to 1,088 | 2.8 | wingman stayed inside the 60° cone (up to 18° off the tail), speeds within 5 kt of Lead |

**What this shows.** The chain works as designed: in every run the wingman's G rate stayed at or under 4 G/s (the limit), roll rate at or under 90°/s, roll build-up at or under 360°/s², and G, bank and height were smooth curves. The wingman follows level turns toward and away from itself and a reversal in the right sense, collapses toward Lead's six and goes back out, and in FM holds Lead's circle at nearly Lead's G. HCA stayed under 35° in the turns.

**What it does not show.**
- **The vertical plane.** I tried a scripted loop. Lead's script was poor (it ended in a dive) and the wingman fell about 5,000 ft behind. I left it out of the run list rather than show a bad test. Loops, wingovers and barrel rolls are unproven. D (a climbing turn) is a weak pass: the wingman gets stretched and breaches the bubble, so the high and low plane behaviour needs real work.
- **Tuning.** Runs B, C and D show over-aggressive G and weak closure damping. These are gain and limit problems, not a design failure, but they are not solved.
- **Anything in the real app.** It is the core's model with my script on top: no screen, no 3-D, no wind. Nothing has been seen by Patrick or flown from the default start.
- **Two faults found and fixed on the way** are worth keeping as lessons for the build: a hard switch on the bubble guard made the slot jump (use a smooth push), and a bank command taken from a tiny lift vector rolled the wingman the long way round (blend toward wings level when little lift is needed).

## 8. Checks a pilot would recognise (for a later `testing.md`)

Written to the rule book's testing lines: end pictures and things always true, no tight time gates, expected values from a manual, standard aerodynamics or Patrick, margins from the shared table, nothing that makes a published limit a wall, and one light check per module at sign-off.

- After Lead's 60/2 level turn and wings level, #2 ends between 500 and 1,000 ft behind Lead, on a side, within ±100 ft of height. (SMM 12.29)
- On a steady level turn with both aircraft settled, HCA is about twice the aspect, within ±5° (SMM Fig 16.10).
- The wingman never stays inside 500 ft for more than a moment on a run that starts in position (a flag check, not a wall).
- Roll rate never above 90°/s and G never changes faster than the chain's limit between steps (the smoothness rule, TS-47).
- Speed never below the shaker speed in a turn; if it would be, G falls to the shaker line.
- With the same presses at the same times the same picture comes out (TS-R9).
- In FM the wingman's power equals Lead's every step (SMM 16.17 para 42).
- A generous run limit with its reason (a 60/2 level turn of 180° takes about 24 s at 248 KTAS: the wingman is back in the cone within 30 s of roll-out, estimate).

## 9. Questions for Patrick

One at a time, each with a working answer that the tool uses until he answers. His own idea is always an option.

**Q1. How wide is the fluid manoeuvring cone?** SMM 16.17 para 42 says "a 60 degree cone" and also that the 30 to 60° swept position is outside it. Options: (a) 60° wide in all, 30° either side of Lead's tail; (b) 60° either side of the tail (120° wide); (c) your own reading. Recommend (a): only (a) leaves the swept position outside, as the manual says (`fig1-cones.png`). Working answer: (a). Dad could settle it in one line.

**Q2. May the wingman fly live while Lead stays on a planned script (option c)?** It changes TS-36 ("every aircraft flies a pre-planned path") for the wingman only. Options: (a) planned paths for both, simpler but the wingman never reacts; (b) both live; (c) Lead scripted and previewable, wingman live; (d) your own idea. Recommend (c). Working answer: (c) for fighting wing and fluid manoeuvring only; line abreast stays as it is.

**Q3. Which Lead buttons first?** Options: (a) level turns (three banks), wings level, reversal, climb and descend, terminate, then wingover, barrel roll and loop in a second step; (b) all of them at once; (c) your own list. Recommend (a): the toy only supports the first group; the vertical manoeuvres are unproven. Also: the briefs list exercises 1, 3 and 4, and the SMM adds the loop; include the loop? Recommend yes, in the second step.

**Q4. Real energy or constant speed in fighting wing and fluid?** Line abreast holds 220 KIAS (TS-38). Options: (a) real energy with the T-6A thrust and drag (speed bleeds in turns, vertical manoeuvres trade height), (b) constant speed as line abreast, (c) your own idea. Recommend (a): FM is defined by "same power" (SMM 16.17 para 42), and a wingover on constant speed has no meaning. The cost is that line abreast and fighting wing behave differently in the same app. Working answer: (a).

**Q5. What happens on a "terminate" trigger (bubble, 5 G, aspect with HCA)?** Options: (a) flag in words only, Lead's Terminate button is yours; (b) flag and Lead eases to a level turn by itself; (c) pause the sim; (d) your own idea. Recommend (a): published limits are flags, never walls. Working answer: (a).

**Q6. A deliberately poor wingman?** For training or debriefs, a wingman that starts stretched, tight or late. Options: (a) one good wingman now (Smooth, Normal, Sharp skill only); (b) one-click faults (stretched, tight, late on the reversal) as a later layer, like the line abreast errors idea; (c) your own idea. Recommend (a) now and (b) later.

**Q7. Default position.** My defaults are 45° sweep and 650 ft (estimates, near the middle of the sweep and the near end of the range). Options: (a) keep them; (b) 30°; (c) 60°; (d) your numbers. Recommend (a) until Dad says what he flies.

**Q8. Where does G-warm go?** It starts from spread 4 or line abreast, not fighting wing (AFM7 p.13; SMM 16.22). Options: (a) the line abreast and transitions work; (b) here as a Lead button; (c) your own idea. Recommend (a).

**For Dad** (kept in `docs/questions-for-dad.md` once Patrick says so): what stack, if any, he uses in fighting wing; whether the "high plane / low plane" technique matches what he teaches; how much of a Lead's bank counts as "moderate" and "steep" for the collapse (my 30° to 60°); whether he wants the first loop or the first wingover as the standard FM test.

## 10. What I did not check, and what I was unsure about

- I read the SMM text and the two figures I drew from (12.19, 12.24, 16.9, 16.10) but not the figures 12.20 to 12.23 (turn entries and exit) beyond their names; they are not extracted as images.
- Orders B2 ch 8 page numbers (98 and 99) come from the text extract; the PDF was not at hand.
- EFIG p.391 is a slide with few words; "do what Lead did" is its phrase and my rule is built on it.
- No AFM page gives a stack for fighting wing, a descent angle, or a number for "moderate" and "steep".
- The toy runs are one script on the repo's core model; they are not the real app and not a test.

## 11. Requests for the core owner (nothing touched here)

- Export the up-vector helper `upFrom` from `src/core/point-mass.js` (the controller's slot frame uses the same rule; a second copy would break the rule book).
- Move the energy-sim's `excessFnFor(throttle)` (`src/modules/turn-fight/energy-sim.js` line 230) into `src/core/t6-performance.js`; both modules need power below maximum.
- Rename or alias `easeRoll` so it reads as a general rate-and-onset limiter; it already works on any quantity (the toy uses it for G).
- A 3-D aspect and HCA helper beside the horizontal `aspectAngleDeg` and `headingCrossAngleDeg` in `src/core/angles.js`.

## 12. Files in this folder

`design.md` (this file); `fig1-cones`, `fig2-pursuit`, `fig3-design`, `fig4-screen` (each `.svg` and `.png`); `toy-a` to `toy-e` (`.svg` and `.png`); `toy-results.json`; scripts `make-figures.mjs`, `toy-check.mjs`, `render-png.mjs` (`node make-figures.mjs && node toy-check.mjs && node render-png.mjs`; they use the Node and Playwright already on the machine and the repo's `src/core` read-only).

## Note added 11:17Z 4 Oct (Turn Sim thread)

Before building the wingman pursuit controller, look at Fight Sim's on main since #271: src/modules/turn-fight/energy/moves/pursuit.js (lead, pure, lag aim, collision avoidance via computeTcpa) and src/modules/turn-fight/energy/lookahead.js. Fight Sim is refactoring them: read only. Any sharing goes through the coordinator, which sequences a move into src/core. Do not write a second pursuit controller.

## Patrick's answers

- Q4 energy in FW and fluid manoeuvring: **real energy** (point-mass with T-6 thrust and drag); line abreast stays constant speed (card, 11:27Z 4 Oct).
- Q2 how the aircraft fly: **Lead scripted, wingman live** (pursuit controller), FW and fluid only; changes TS-36 for the wingman in those formations (card, 11:43Z 4 Oct).
