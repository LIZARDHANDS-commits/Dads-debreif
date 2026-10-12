# Formation architecture review at V2.388

Written 12 Oct 2026 by a fresh Formation thread on Patrick's ask (08:01Z: "let's start by an architectural review of how the form module works for fluid manoeuvring and rejoins and tracking, then look at the rough spots and figure out how to fix it"). It reads main at V2.388 and measures it from the default start. It changes no code. The fixes in section 5 are proposals; nothing is built until Patrick picks.

Measurements are this thread's own dry runs of `createFormation()` on main at V2.388 (the scripts and their output are in the project files, `formation-architecture-review/`). Where a number comes from an earlier flight it says whose. The 3D view and Patrick's own flying are unseen.

## 1. The short answer

- The Formation Sim flies #2 with **four different pilots**: the tracker (a 2D heading-and-speed chaser, flown ahead as a dry run and replayed) for every change, rejoin and fighting wing turn; held poses in Lead's wing plane for close-formation turns; a path drawn in Lead's frame for the lag roll; and the live wingman (a 3D lift-vector pursuit law on the shared point mass) for fluid manoeuvring only.
- The roughest thing Patrick will see first is **fighting wing's own turns**, not fluid or the rejoins. In the 2-ship, Lead's fighting wing moves (flown by the tracker) roll #2 at 96-99°/s, pull 5.07 G in a turn into him and in every reversal, and at Wings level roll him 34° past wings level the wrong way. In the 4-ship's fighting wing the turn buttons are worse: #2 goes from -4.1 G to 5.7 G and #3 and #4 reach 5.1 G (section 4, item 1).
- The live wingman flies the **same Lead turn** (60°, into #2) at 20°/s and 2.4 G at most. That is the strongest case for Fable's idea of putting fighting wing on the live wingman's law (section 3): yes, one pilot law for fighting wing and fluid makes sense, starting with the 2-ship fighting wing turns behind a switch.
- The rejoins work and end in position. Their roughness is a family of roll flicks at phase hand-overs (81-98°/s) and the turning rejoin into fighting wing at 5.0-5.16 G. Most of it has one cause: the tracker picks a bank each step as if the roll were instant, and its aim jumps when one phase hands to the next.

## 2. How it fits together

### 2.1 The step loop (`live/formation.js`)

One session holds the aircraft, takes the presses and flies 0.05 s steps. It is in one of three states:

| State | Who flies Lead | Who flies #2 | Planned ahead? |
|---|---|---|---|
| A manoeuvre, a change of formation, a fighting wing turn or move | `flight.js` segments (a heading, a signed bank, a height profile, a speed ramp) | a plan worked out at the press as a dry run, then replayed step by step (`replay.js` `flyStep`) | yes, all of it; the drawn path is the path flown (spec F1) |
| Fluid manoeuvring | the shared 3D point mass (`fluid-lead.js`, core `stepPointMass`), planned about 20 s ahead and re-planned at each press | the live wingman (`fluid-wing-live.js`), one step at a time, reading Lead as he is | Lead only; #2 has no path ahead |
| Nothing pressed | his last plan, then straight | his last plan, then straight, with `holdStationIdle` easing him onto Lead's heading and speed | no |

A press mid-move is planned again at once from where the pair is (spec F11, `events.js`, `replan.js`). The "picture breaking" re-plan exists but never fires: nothing in the sim moves an aircraft off its plan.

### 2.2 Lead

Lead never reacts to #2 except where a decision says so: in a turning rejoin he turns into #2 at 30° and holds it until #2 is in (`lead-turn-in.js`); Terminate's gentle turn rolls out when #2 is due back (TS-197). Outside fluid he flies `flight.js` segments; inside fluid, planned point-mass controllers at MAX power.

### 2.3 The four pilots of #2

1. **The tracker** (`tracker.js`, 1,080 lines, with `pilot.js`, `ride.js`, `closures.js`, `recipes.js`). A list of phases, each chasing a place in the frame of the aircraft he flies off. Each step: an aim (the place, or the ride's line, or a `pursuit` override such as `fw-pursuit.js`), a heading wanted from the closure law, a bank from a heading-error loop with feed-forward, a speed from the power model (`pilot.js`: full power to idle and the boards, the torque's jerk limit), and a height from a separate profile (a planned leg, the cone's energy, the rejoin line's depth). It flies every 2-ship and 4-ship change, every rejoin (the turning rejoin's 30° line as `ride`), the fighting wing turns and moves, the side switch and move in the band. A phase can carry any of about 90 fields that the tracker, the ride and the closures read (`goal`, `pursuit`, `exit`, `alongFrom`, `coneEase`, `targetBankDeg`, `refJerkFtps3`, `handOverHere` and more).
2. **Held poses** (`formation-turns.js` `heldPoses`, `holdInPlane`): in a close-formation turn #2's place is held in Lead's wing plane and his pose worked out from that track, with the roll-lag re-fly of V2.387 (`ROLLED_MAX_SEC`, `ROLLED_BLEND_SEC`).
3. **A path in Lead's frame** (`lag-roll.js`, and the roll part of `rolling-rejoin.js` on the point mass): a 3D manoeuvre worked out at the press and replayed as poses.
4. **The live wingman** (`fluid-wing-live.js`, TS-194 to TS-201): a real aircraft on the point mass at MAX power. Each step he aims his lift at Lead plus a 15° side offset, slid inside or outside Lead's turn by lead, pure or lag (from Lead's cue word, the range error and the closure, scaled by how hard Lead is turning), with the side offset faded onto Lead's circle in a turn (kept as height on the outside, TS-200), the 500 ft bubble as full lag, his own side swaps, and the lift capped at Lead's G plus 1.5 and the stick shaker. In Terminate, with Lead holding 200 KIAS, power flies his place in the fighting wing slot.

### 2.4 The chooser and the rejoins

`chooser.js` (TS-76) runs every planner that applies (turning rejoin, straight-ahead rejoin, echelon or route out to fighting wing, opening out, the tracker's legs, "from here"), each a search of dry runs, and flies the quickest that passes the pilot's checks (in position at the end, behind Lead's 3/9 line close in, the 5 G rule). The turning rejoin (`turning-rejoin.js`, 1,044 lines) is a pointing turn, the ride down the 30° line in Lead's turning frame (`ride.js`, TS-181), the decision point at 210 KIAS, and the capture into the slot or the cone; the straight-ahead rejoin rides Lead's six the same way with Lead not turning (TS-192). All of it is the tracker underneath.

### 2.5 Fighting wing

Holding: nothing flies the hold; with Lead straight #2 flies his finished plan on and `holdStationIdle` trims him. Turns: a turn button or fighting wing move plans #2 as one tracker goal phase (`fwGoal`: stay in the band, collapse to Lead's six on his circle past 30-45° of bank), with `fw-pursuit.js` (TS-100) steering the turn, `fwBubbleCommand` (TS-132, TS-134) diving him below Lead when the bubble is predicted, `fwExit` choosing his side at Lead's roll-out (Fig 12.23) and the cone energy taking speed as height. That is four laws stitched into one phase, in 2D, with the height as a profile beside the turn.

### 2.6 The hand-overs between pilots

- Fighting wing to fluid: the live wingman starts from the 2D aircraft as it is (`startLiveWing`); a press while #2 is still rolling out of a change hands over a rolling aircraft.
- Fluid back to fighting wing: at the end of Terminate the pose is set level on Lead's heading and speed. Measured on six Terminates: at most 1.1° of bank, 0.26° of heading and 2 kt are set in one step, too small to see.
- Fluid to a change: refused while Lead is past 90° of bank or 30° of climb; otherwise the planners start from the 2D state.
- Inside the tracker, phase to phase: the aim jumps to the new phase's place, and the heading loop's last command is reset. This is where most roll flicks come from (section 4).

## 3. Weak points

1. **One job, several pilots.** Keeping fighting wing is flown by the tracker; fluid, which is fighting wing with Lead manoeuvring harder, by the live wingman. Each has its own tuning, its own fixes and its own rough spots, and the hand-over between them is a change of aircraft model (2D to 3D).
2. **Bank from a heading error, as if the roll were instant.** The tracker turns a heading error into a bank and lets the roll limiter catch up. Only when lining up does it allow for the heading he will gain while rolling out (`headingChangeRollingOut`). Everywhere else a quick change in the aim asks for a bank he cannot reach in time, so he rolls at full rate and overshoots. TS-196 shaped the roll itself; the steering was never retuned for it (future.md, "#2's roll onset").
3. **G is a by-product, not a command.** In the tracker the turn comes from the bank and the height from a separate profile, so a dive or zoom laid over a turn shows as whatever G the two add up to. That is how a fighting wing check turn reaches -1.67 G and a hook 0.18 G (section 4, item 1). The live wingman commands his lift directly and is capped, so it cannot.
4. **A phase per fix.** The tracker's options grow with each fix (pursuit, goal, exit, along a line, cone ease, target bank, place jerk, hand-over here). Behaviour has become sensitive to small changes (V2.282: "a 45° roll cap works, 60° fails to settle"; the break rejoin's line-up resisted five tries).
5. **Hand-over patches instead of continuity.** Several fixes re-fly or blend across a hand-over with an estimated window (`ROLLED_MAX_SEC` 1 s, `ROLLED_BLEND_SEC` 6 s, `circleBackSec` 12 s, `handsFadeSec` 3 s). Each fixes its case; none fixes the cause (the command jumping).
6. **Planned and replayed.** Fine while nothing disturbs the aircraft, and it keeps the drawn path honest and lets the chooser race candidates. A live law can keep both by being flown ahead as a dry run, as the tracker is.
7. **Proof lives outside the repo.** Smoothness is checked by scratch drivers in the project files and Fable's flights; the unit tests check end pictures. That is the rule book's intent (light tests), but it means a smoothness regression is only seen when someone flies it.

### Does one pilot law for fighting wing and fluid make sense? (Fable's idea, 12 Oct 04:10Z)

Yes, for the 2-ship's fighting wing (holding and Lead's turns), for these reasons:

- It is the same picture. EFIG p.390-391 and SMM 12.29-12.30 (paras 69-74, Figs 12.19-12.23) describe fighting wing as lead, pure and lag pursuit on Lead's turn circle, in the cone, power as needed; the live wingman is built on exactly those pages.
- It is already half built. Terminate is the live wingman flying fighting wing with Lead holding 200 KIAS: power flies his place in the slot (`fluid-wing-live.js`, the `holding` branch), and it settles inside the band (TS-197).
- It flies the same Lead turn far better (section 4, item 1): 20°/s and 2.4 G where the tracker rolls at 99°/s and pulls 5.07 G.
- It removes four stitched laws (pursuit, bubble dive, exit side, cone energy) from the tracker's fighting wing phase.

What it needs, and the risks:

- **Keep the drawn path and the chooser.** Fly the live law ahead as a dry run against Lead's planned path and replay it, as the tracker is; Lead's path is already planned, so it is the same law and the same result.
- **A fighting wing aim.** With Lead straight, the cone's middle (750 ft, 45°, slots.js) with the whole cone counting as in position (Patrick 5 Oct 08:54Z); with Lead manoeuvring, his circle at the fighting wing range. Fluid's 15° offset and 600 ft stay for fluid.
- **Power.** Outside fluid Lead holds 200 KIAS, so #2's power flies his place; that is Terminate's branch, the least exercised part of the law, and its gains (`placeKtPerFt`, `closeKtPerKt`) are estimates that may need tuning, and again after the performance rebuild.
- **Its own leftovers come with it:** the Terminate roll-out's 10° overshoot and the reversal's 0.68 G moment (future.md, "Live fluid #2 after v9").
- **The 4-ship stays on the tracker** until stage 3: #3 and #4 fly off a wingman who is himself manoeuvring.
- **Rejoins and close formation stay on the tracker.** A held technique far out (the ride) is how a pilot flies a rejoin (TS-76); only the capture into the cone would hand to the live law (stage 2).

## 4. The rough spots, in the order Patrick would see them

Ranked by what he meets first from the default start (line abreast, 2-ship): change to fighting wing, fly Lead's turns, then fluid, then the other changes, then the 4-ship. Each has its measurement and a proposed fix.

1. **Fighting wing turns and moves, new on this list.** On screen the 2-ship's fighting wing shows Lead's fighting wing moves (Level turn, Reversal, Wings level, Climb, Descend; spec section 8), not the turn buttons; the turn buttons show in the 4-ship's fighting wing, where #2 flies off Lead by the same law. Measured on V2.388 from a settled fighting wing:
   - 2-ship, Lead's moves (`fwmoves.out`, `fw4.out`): roll-ins at 88-99°/s; a level turn into #2 and every reversal reach **5.07 G**; at Wings level out of a 60° turn #2 rolls 34° past wings level the wrong way at 96°/s, then back.
   - 4-ship, the turn buttons (`fw4.out`): #2 from **-4.1 G** to 5.7 G, #3 and #4 to 5.06-5.08 G, all at 95-101°/s.
   - The same law with no #3 and #4 (the 2-ship code with a turn button, not on screen; `fwturns.out`, `checkr.mjs`) shows where it comes from:
     - At Lead's roll-out #2 rolls 24-73° past wings level the wrong way at about 100°/s, then back (hook left: +63° to -64° to +38° in the 3.5 s after Lead rolls out; delayed 45 left: 73° the other way).
     - Check turn right, into #2: he first rolls away from the turn to +56° while pushing to **-1.67 G** and diving at 50 ft/s, then rolls 130° back at 97°/s to 75° of bank at 4 G (`checkr.mjs`).
     - Delayed 90, in-place 90 and hook left: about 9 s after Lead rolls out he pushes from 2.9 G to **0.18 G** for a second with 10° of bank on (the cone's height coming off).
     - Most turns into #2 (delayed 45, delayed 90, in-place 90, the level turn) and every reversal: **5.07 G**; hook right 5.63 G (over the 5 G caution, under 7).
   - Cause: the four stitched laws of section 2.5 in a 2D chaser (weak points 2 and 3). The negative G is the bubble dive laid over the turn as a height profile; the wrong-way roll is the exit's side choice with the heading loop's turn still fed forward.
   - **Fix (recommended): fighting wing on the live wingman's law, stage 1** (2-ship: Lead's fighting wing moves, behind a switch, Tracker the default until Patrick has flown Live). The same Lead turn into #2 in fluid: 20°/s, 0.99-2.38 G. The other way, patching the tracker's bubble dive and exit, is cheaper but repeats the patch rounds that weak point 4 describes.
2. **Turning rejoin into fighting wing from line abreast** (the first change he presses). Measured: the pointing turn reaches 4.99 G (TS-182 rules 4.5 G at most), then 5.0-5.16 G for about 2 s at 920-1,250 ft as he swings into the cone, 93°/s, five bank reversals, in position at 21 s (future.md has the same from Fable's flights). **Fix:** hold the pointing turn to 4.5 G (the planner already caps the pointing turn's bank for 4.5 G, `pointingPhases` `capNow`; inferred: the pull of the height change comes on top of it) and, with item 1 built, hand the last part (inside about 1,250 ft, the cone's far edge) to the live law instead of the tracker's cone capture, which also takes the "ends on the cone's edge" item.
3. **Roll flicks at the hand-overs of the other changes.** Measured: fighting wing to echelon and route 98°/s with a 0.72 G dip; fighting wing to line abreast 85°/s, 78° of bank at 4.78 G (Fable's earlier flight: a check turn to 77° at 4.7 G within 1.8 s); echelon to line abreast 4.88 G; straight-ahead rejoin 83°/s (the vector flick at about 340 ft, future.md); 4-ship ships at 81-89°/s in nearly every rejoin (drivers at #961). **Fix:** one change in the tracker's steering, written up first: (a) carry the heading command across a phase hand-over and move it to the new aim at a rate the roll can follow, instead of jumping; (b) allow for the heading gained while rolling in every phase, not only when lining up (the existing `headingChangeRollingOut`). It is the "retune the steering for the roll's build-up" item of future.md, and it touches every planned move, so it is proved on the stored driver set before and after.
4. **The 3D picture inverted.** The nose is drawn about 5° low inverted, with a one-step jump of about 5° at the vertical (`attitude.js` `poseOf3d`; future.md). Patrick sees it in every loop and barrel roll in the cockpit view. **Fix:** turn the 2.6° datum with the bank. Small and on its own, but it changes the drawn pose of every aircraft, so it is its own PR.
5. **Fluid manoeuvring.** Patrick called fluid good (12 Oct 07:06Z). Left on main: the entry, if pressed while #2 is still rolling out of the change, wags him about ±30° in the first 5 s with Lead still straight (measured from a fresh fighting wing: 84°/s, +33° then -23°); the Terminate roll-out overshoot of about 10°; canopies 29° apart at the loop top; 0.68 G for a moment at the reversal. **Fix:** only if he asks; the entry wag goes away if the fluid press waits until #2 is steady (or, after item 1, he is already on the same law).
6. **The 4-ship** (future.md's list: the element from fighting wing, #4 dipping to 0.7 G as Lead rolls out, the Away echelon bob, far roll-ins at 60-100°/s, Fluid 4's #2 at the decision point). **Fix:** most should shrink with item 3; the element's ride is its own item. After the 2-ship.

## 5. Proposed plan

| Step | What | Size | Needs |
|---|---|---|---|
| 1 | This review (docs only) | done | nothing |
| 2 | Write the "fighting wing on the live law" plan: the aim, power, the switch, the dry run for the drawn path, what is measured before and after; spec and decision words for Patrick's yes | small | Patrick's yes to the words |
| 3 | Build stage 1: the 2-ship's fighting wing moves (Lead's level turn, reversal, wings level, climb, descend) on the live law, behind a switch (Tracker the default); one test: a level turn into #2 and its reversal stay under 5 G, positive and in the cone | one PR | Patrick flies Live and picks the default |
| 4 | The tracker's steering across hand-overs (item 3), written up first, proved on the stored driver set | one PR | Patrick's yes to the write-up |
| 5 | The turning rejoin into fighting wing: 4.5 G pointing cap, the capture handed to the live law (item 2) | one PR | step 3 merged |
| 6 | Stage 2 (holding and fighting wing to and from line abreast on the live law), then stage 3 (the 4-ship's fighting wing turns, where #2's -4.1 G is) | later | Patrick's call |

The nose-low pose (item 4) can go in any time as its own small PR. Fluid (item 5) waits for Patrick.

Recommendation: steps 2 and 3 first, because item 1 is what he meets first after the first rejoin and it is where the two laws differ most. Rule book: two failed fixes on one item stop the work until Patrick answers.

## 6. What the performance rebuild would change

The rebuild (branch `claude/project-thread-swv8zh`, kept off main) changes only `src/core/t6-performance.js` (thrust, drag, the turn data). The laws above do not change. What moves with it: the speeds over the top in fluid (both at MAX), how quickly a rejoin at full power closes, the power and torque shown on the tags, and the live law's power-for-place gains, which are estimates tuned on today's drag. The fixes proposed here do not depend on it; re-measure items 1 to 3 once it lands.

## 7. Unseen and unsure

- The 3D view and Patrick's own flying of V2.388 are unseen; every number here is from dry runs of the session in Node.
- The causes in section 4 come from reading the code and the traces; the -1.67 G check turn (2-ship code, not on screen) is traced step by step, the wrong-way roll-outs and the 0.18 G pushes are measured but their cause is inferred.
- Some measurements press a button the moment the previous change counted as done, while #2 may still be rolling out; Patrick can do the same, but a press after a pause may fly cleaner.
- Not reviewed: training errors (`errors.js`), the offset box and G-warm, the cockpit and 3D files.
