# Design review brief 3b: today's wiring, and reconciling your tables with it

*Filed 14 Oct 2026 by the Formation thread, a supplement to brief 3 (`fable-draft-4-model-brief-14oct.md`), at Patrick's ask ("like we want it to evaluate our system we're designing, right?"). To be sent to the same Fable agent once its brief 3 report has landed (never mid-run), so it has its own tables in front of it; if that agent can't be continued, a fresh run gets brief 3's report pasted in above this. Renamed terms; scrubbed with `scrub.mjs check` before filing. Source: `docs/modules/turn-sim/control-model.md` sections 1, 2, 5 and 10. Patrick added (14 Oct 2026): "Tell it to draw the updated systems diagram for its reccomendaiton, give it the "before" and "after" pics of our architecture and the planned model". Pictures can't go to Fable (text only; embedded images are a filter trigger, skill section 2), so the diagrams go as their boxes, the form they are drawn from, and its diagram comes back as mermaid for the thread to render.*

---

Thank you for the review. One more piece of work on the same design, using the same terms. The job is still to evaluate the design being built (the proposed structure in brief 3). Today's wiring below is the baseline, so you can check that the proposed design removes today's bad links, keeps the good ones, and does not drop one it needs.

Everything you need is in this message and your own report. Please do not open any file.

## The instructor's answers to your questions, and two corrections

These are fixed givens now; fold them into your tables and sizing.

1. **Pass clear's push (your question 1):** by urgency, smoothly, no switch: about 0.5 G for an ordinary drop, easing toward about 0 G only when the pass is close. In his words, in a turn "you can just relax some G to go out, rarely do you have to go to 0 G": relaxing some G is usually enough to go out (and a little down).
2. **The sustained turn (your question 2), and a correction:** yes, the trainer holds 200 KIAS in a 2 G level turn at 8,000 ft. The simulator's trainer model at 200 KIAS and 8,000 ft, full power, has this acceleration in hand: +1.85 kt/s at 1 G, +0.93 at 2 G, +0.24 at 2.5 G, −0.60 at 3 G, −2.75 at 4 G (sustained about 2.7 G). Brief 3's "about 1 kt/s in hand" was the 2 G figure, not the 1 G one, so your D14 does not hold at Lead's 2 G; it applies only when #2 pulls well past about 2.5 G. Also: turns in the trail cone are usually 90-180° of heading for manoeuvring, not sustained; the measuring tool's 30 s academic turns (about 250°) are longer than he flies.
3. **Pass clear's energy (your question 3):** no fixed power rule. His model: the throttle adds or subtracts energy, the stick transforms it, G uses it up, and height and speed trade it. So pass clear's energy intent is set from the picture when it is planned: power back when closure is the problem, power in when he would be stretched afterwards, like every other move.
4. **The steering (your question 4):** your gentler slope is accepted: course gain 0.5 per second, Ke 0.026° per ft (about 1 per 420 ft under the 20° cap, 1 per 250 ft under 12°). The 20° and 12° caps stand.
5. **The arc loop (your question 5):** τ_s stays 10 s.
6. **The speed brake (your question 6):** only when bleeding on purpose: out when closing over about 60 ft/s for 1 s with a bleed intent, in under about 20 ft/s, held at least 3 s.
7. **A correction to your question 7:** the climb-out-of-plane reset comes back down onto Lead's circle behind him and ends stacked low (the instructor's ruling, in brief 3's technique table); it is above Lead only during the climb.
8. **Your findings:** D3 approved (#2 runs Lead's seen bank forward by the roll rate he sees across the 0.4 s, from what he sees, never Lead's plan). D4 approved (vertical first; only when the vertical alone cannot make the pass in time, the least turn away that makes it, the guard choosing). D1, D5, D6, D7, D9, D10, D11, D12, your cubic guard taper and your C10 definition are approved too.

## Today's wiring, in the trail cone

### Who passes what to whom (today's N² chart, by source block)

| From | To | What passes |
|---|---|---|
| Lead | Perception | Lead as seen (position, velocity, body up) |
| Perception | Guard | slant range, slant closure, Lead's turn (rate, radius, centre) |
| Perception | Jobs | slant range, slant closure, height against Lead, Lead's seen bank, how far short of Lead's speed |
| Perception | Power | slant range, slant closure |
| Perception | Separation filter | slant closure, Lead's seen G, Lead's turn |
| Perception | Height owner; climb-out-of-plane | height against Lead (and Lead's turn, for the climb) |
| Perception | Turn toward Lead first | Lead's seen bank |
| Perception | Arc frame; arc loop; steering; Lead dead-reckoned | Lead's seen bank and turn |
| Perception | G cap | Lead's seen G |
| Lead dead-reckoned | Arc frame; arc loop; swept aim; nose behind; steering; vertical PD; separation filter | Lead now (position, velocity) |
| Aircraft (#2) | Arc frame; steering; vertical PD; separation filter; lift; power; swept aim | his own state, now |
| Arc frame | Arc loop | arc s behind Lead, arc closure |
| Arc frame | Climb-out-of-plane | arc s, offset d, arc closure |
| Arc frame | Power | arc closure |
| Arc loop | Power | the wanted closure, and the closure the aim can't give |
| Arc loop | Steering | the offset command and the aim point |
| Swept aim | Arc loop; power | the wanted closure (and to power, the closure the aim can't give) |
| Swept aim; turn toward Lead first; nose behind | Steering | the aim point (blended in, or replacing it) |
| Steering | Separation filter | the aim line's turn fed forward; the turn asked |
| Separation filter | Lift | the turn flown (it replaces steering's when the predicted pass fails) |
| Separation filter | G cap | "needs more G" |
| Separation filter | Nose behind | **decision:** wing line out of reach |
| Separation filter | Power | **decision:** filter hold (1 s) → power to 20% while closing |
| Separation filter | Height owner | **decision:** filter hold |
| Guard | G cap | the guard's predicted pass; guard on |
| Guard | Height owner; steering; power | **decision:** guard on (pass clear wanted; the aim not blended; the power integral frozen) |
| Jobs | Arc frame; arc loop; swept aim; nose behind; climb-out-of-plane; separation filter | **decision:** "Lead turning" (the job) |
| Jobs | Power | **decision:** "Lead turning", "low inside" (full power) |
| Jobs; height owner | Vertical PD | the height target |
| Climb-out-of-plane | Height owner | its height |
| Vertical PD | Separation filter | the vertical G asked, counted in the predicted slant (physics) |
| Vertical PD | Lift | the vertical G asked |
| G cap | Lift | the cap |
| Lift | Aircraft (#2) | the lift asked |
| Power | Speed hold | the wanted speed |
| Power | Climb-out-of-plane | **decision:** "power back" flag |
| Power; speed hold | Engine | throttle; idle and the speed brake |

### Who writes each control, and by what rule (today's resource matrix)

| Control | Writers | Rule |
|---|---|---|
| Turn G (in Lead's turn plane) | Steering (the aim line's turn fed forward + 0.05 G per degree); the separation filter (replaces it when the predicted pass fails); the lift (cuts it at the cap); the G cap (sets the cap) | Priority: the filter replaces steering (a switch with no hysteresis), then the cap cuts the turn, never the hold or the vertical |
| Up-down G (square to the turn plane) | The vertical PD on the height target; the lift's 1 G hold | Sum; both kept first at the cap |
| Height target | Pass clear (guard on and filter held) > nose behind (in and down 300 ft) > climb-out-of-plane (+100 to +200 ft) > the jobs' family (stack −50, quick fix ±150, low inside −300) | Priority, with a 2 s hold except pass clear and nose behind |
| Bank and roll | The lift (from the lift vector); the aircraft rolls there at up to 60°/s | Single |
| Throttle | Power's wanted speed through the speed hold; 20% while the filter holds and he is closing; full power when low inside; 20% on the climb's way down; the speed hold (0.2 kt/s per kt + the drag of his present G) | An if-chain of relays over the speed hold |
| Idle | Power: closure over 40 ft/s, off under 25 | Switch |
| Speed brake | Power: closure over 60 ft/s, off under 35 | Switch |
| Aim point | Arc loop (turning) or swept aim (level), then turn toward Lead first (blended in 3.5 s), then nose behind (replaces); eased 1.5 s every step | Priority |
| Arc closure (a shared signal) | Arc frame (from velocities, now) → read by the arc loop, the climb-out-of-plane test, the power cut and the brakes in a turn | Single writer, four readers |
| Slant closure (a shared signal) | Perception (1 s smoothed, 0.4 s late) → read by the filter, the guard, the jobs and power | Single writer, four readers |

For comparison, the close-formation wingman (same aircraft, different technique) writes torque as a sum (holding power fed forward + a power lead at Lead's roll-in + a small correction) and lift as a sum (Lead's lift 0.3 s ahead + his place's motion + small corrections), and phases its axis shares in and out smoothly. It is the working example of the proposed pattern.

### The feeders: physics cross-feeds today

| From → to | What it carries | Today |
|---|---|---|
| Turn G asked → power | The drag of the G he is asking for, so power leads the pull | Half there: the speed hold adds the drag of the G he already has |
| Bank → the lift that holds height | The 1 G share square to his path | There |
| Climb or the vertical asked → power | The power for his climb rate | Missing |
| Lead's roll seen → power | The coming G's drag, as a lead (from what he sees, never Lead's plan) | Missing |
| The guard → energy | A graded request to bleed | Today a 20% throttle relay instead |
| Vertical asked → the guard's prediction | His commanded height counted in the predicted slant | There |
| Lead's turn → steering | The path's own turn rate (true feed-forward) | Today the aim line's turn, which is hidden feedback |
| Speed → offset | d_ss = R(1 − V2/V_L): his speed handed to the offset | There |

### Today's harmful links (a decision or a switch state passed between controllers)

Power back → the climb-out-of-plane trigger; filter "wing line out of reach" → nose behind; filter hold → the power cut and pass clear; guard on → pass clear, the aim blend and the power integral; "low inside" → full power and −300 ft, past their owners; the aim line's turn "fed forward" (hidden feedback that jumped when the aim jumped); the arc error → power (a second owner of closure that does almost nothing, because d_ss hands it back).

### What the proposed design intends for the wiring

- The guard's only outputs are a limit on the turn and height commands and a graded request to bleed; never a throttle setting, a height-owner switch or an aim.
- Two physics feeders are added to power: the climb, and the G asked (not the G had) with a lead from Lead's seen roll, both used according to the energy intent.
- Power's arc term goes.
- At the cap, the turn and the vertical share the cap in the instructor's order, phased rather than as a priority step.
- The vertical-asked → guard-prediction feeder and the speed → offset feeder stay.
- Techniques write only the reference; the loops read only the reference.

## The architecture diagrams, written out

These are the project's block diagrams, written as their boxes. Each numbered layer feeds the next; the cross-links between boxes are the N² table above. Boxes on one line sit side by side in the same layer.

### Before: the trail cone today (level 1)

1. **Lead**: flies his own programme; never reads #2.
2. **Perception**: the picture 0.4 s late (slant, closure over 1 s, line-of-sight rate over 0.5 s, aspect, HCA, sweep, height against Lead, Lead's bank, G and turn circle) · **Lead dead-reckoned**: Lead carried 0.4 s round his seen turn (your F5); #2's own position and velocity now · **Arc frame**: in a turn, the arc s behind Lead round his circle, the offset d inside it, and the arc closure from the velocities (your F10).
3. **Guard**: a second predictor of the pass, from the 0.4 s old picture: on under 600 ft predicted or 500 ft now, off over 700 ft for 3 s; sets pass clear's depth, freezes the power integral, skips the aim blend, opens the G cap under 500 ft · **Jobs**: turning or level from Lead's seen bank; the entry case (a label only); the swept side at the exit; S-turns; the quick fix; low inside; the eased height target.
4. **Arc loop**: d = d_ss + c*/ω + kc(c* − c)/ω, c* = (s − 650)/10 s within ±25/±60 ft/s, d within ±400 ft slewed 60 ft/s; aim 3 s ahead on the circle d inside Lead's; power's P = arc error/15 s · **Swept aim**: Lead level: aim at the swept place carried 8 s ahead; power's P = how far behind his place/10 s within ±25 ft/s · **Turn toward Lead first**: on Lead's bank passing 10° toward him, aim 20° outward of Lead's circle for 2.5 s, eased out over 1 s · **Nose behind**: while the filter finds the wing line out of reach, aim where Lead was 1 s ago and go in and down 300 ft.
5. **Steering**: the aim (against Lead) eased over 1.5 s every step; the aim line's turn (0.5 s) fed forward × V, capped at 1.5 × Lead's turn rate + 3°/s; plus 0.05 G per degree to the aim line; in Lead's turn plane · **Height owner**: one owner: pass clear, in and down, the climb-out-of-plane, else the stack family; a 2 s hold except pass clear and in and down · **Vertical PD**: 0.005 G per ft and 0.02 G per ft/s on height against Lead's target, square to Lead's turn plane, within ±1 G.
6. **Separation filter**: the aim's turn, unless its predicted pass is under 500 ft + 1.4 s × closure (at least 600 ft) or within 100 ft of Lead's wing line; then the nearest of 41 turns that keeps both, steer-behind side first · **G cap**: Lead's G + 1.5 (estimate) under the stall warning; what the aircraft gives while the guard's pass is under 500 ft or the filter needs more (flagged) · **Lift**: the 1 G hold and the vertical first, the turn gives way at the cap; unload, roll, pull past 20° off; never under 0.5 G · **Power**: wanted speed = Lead's + P; the relays (filter cut, climb's way down, low inside); idle and the speed brake.
7. **Engine**: throttle travel in about 0.25 s; 3.5 s spool-up from idle · **Aircraft (#2)**: G eased at the trainer's onset, roll at the asked rate (up to 60°/s) within the trainer's, lift held under the stall warning.

### The reference design: the close-formation wingman (level 1)

1. **Lead**.
2. **Perception**: the whole picture 0.3 s late: deviation on three axes and their rates (0.1 s); Lead's bank, roll and G dead-reckoned 0.3 s; his place's motion as Lead rolls and turns.
3. **Supervisor**: on station, small move, large move (the three axes' shares eased in and out at 0.5 per second), out before up, off station; each with a dead band · **Station change and deconfliction**: the places a change flies through; never within a wingspan, ahead of the wing line or with wings overlapping.
4. **Holding power (feed-forward)**: the power model at the briefed speed + his place's speed, his G, Lead's climb, his place's climb and his own climb · **Power lead (feed-forward)**: torque for his place's acceleration as Lead's turn builds or eases · **Three axes**: a pace cascade (0.4 ft/s per ft, at most 8 ft/s, a braking taper), then P and D per axis (G on the plane, bank on the line, torque on the hinge); no I.
5. **Shaper (the hand)**: pressure sizes per job, eased between jobs; torque rate limits; trims held at a limit.
6. **Lift**: Lead's lift at his G and bank 0.3 s ahead + his place's motion + the corrections.
7. **Engine** · **Aircraft (#2)**: as above.

### The planned model: the recommended structure from the project's control model (level 1; proposed, not built)

1. **Lead**.
2. **Perception**: as today; Lead carried across the delay.
3. **Phase**: level, entry, turning, exit from Lead's roll as seen (no 1 s hold); the case read at each start; a reversal is an exit then an entry.
4. **Reference path**: Lead's circle d inside or out (turning: the arc loop), or the swept line; limits 20° out, 12° in · **Arc loop**: today's form; owns closure in a turn · **Energy intent**: keep, gain or bleed, from the phase and case and the guard's graded bleed request.
5. **Path follower**: wanted course = tangent + (2/π)χmax atan(k × distance off); the path's turn fed forward; a course gain · **Vertical (one owner)**: PD on the target of one owner (stack, exit vertical, climb-out-of-plane, pass clear); changes blended · **Power (one owner)**: drag of the G asked and of the climb fed forward + the intent + a slow trim on speed; idle and the speed brake by intent.
6. **Guard (taper)**: one predictor; nothing at or over 600 ft; 600-500 ft the allowed closing speed shrinks to none at 500 ft; the least change to turn or height; under 500 ft firm, G past the estimate flagged; asks to bleed, never sets power.
7. **Lift**: within the cap in the instructor's order.
8. **Aircraft (#2) and engine**: as today.

### After: the proposed design in brief 3 (level 1)

1. **Lead**.
2. **Perception**: Lead 0.4 s late and dead-reckoned; his own state now; every signal on this one rule.
3. **Supervisor**: the phase from Lead's roll, blended about 1.5 s; the technique picker (priority, one at a time, the no-restart time, each technique's longest run).
4. **Normal follower** (the path: Lead's circle offset d, or the swept line) · **Arc loop** (sets d, within ±250 ft) · **Technique** (when one runs: its plan, sized once) · **Energy intent** (−1 to +1).
5. **The reference**: path, approach limits, height target, energy intent, urgency, any cap change; the normal follower's and the technique's blended by a weight sliding 0 → 1 → 0.
6. **One set of loops**, reading only the reference: **steering** (the path's turn fed forward + a course gain) · **vertical** (one PD, blended targets) · **power** (G-asked and climb drag fed forward + roll-in lead + intent + slow trim).
7. **Guard**: one predictor; a constraint on the turn and height commands (gentle near 550 ft, firm close to 500 ft); a graded request to bleed.
8. **G cap and lift**: the cap opened smoothly by the guard, flagged; at the cap the turn keeps its share, the height demand gives way first, then the level-flight hold.
9. **Shaper**: G onset by urgency (about 1 to 4 G/s), roll.
10. **Engine** · **Aircraft (#2)**.

## What we ask

1. **Reconcile.** For each of today's cells and feeders above: kept, changed (how), or dropped (why), in the proposed design as your report modelled it.
2. **Classify.** For each cell in your proposed N² chart: does it pass physics, a limit, a request, or a decision or switch state? Flag every decision or switch-state cell, and say whether it is acceptable (for example the supervisor picking a technique) or should go.
3. **Gaps.** Any link today's design needs, or the close-formation pattern shows, that your tables lack; and any new link with no stated purpose.
4. **Re-check** C1 (one owner per control), C5 (interaction) and C6 (switches) on the reconciled tables.
5. **Revise** your tables where this changes them: give only the rows that change, with the reason.
6. **Draw your recommended structure** (the proposed design with your D1-D20 changes folded in, and with any changes this reconciliation brings) as a diagram the project can render: a mermaid flowchart (`flowchart TB`), one node per block, each edge labelled with what passes. Use one edge style for physics (`-->`), another for limits and requests (`-.->`) and a third for any decision or switch state (`==>`), and group the layers with subgraphs as in the level-1 diagrams above. Then give the same diagram as a short boxes-and-arrows list. If the loops need it, add a second, level-2 diagram for the loops alone (each loop's inputs, gains and output). A mermaid diagram is a drawing notation; it is fine to write, even though no code is wanted.

7. **Pass clear, re-planned with the answers:** its profile (push by urgency from about 0.5 G toward 0 G, hold, pull back to the stack), the least turn mix when the vertical alone can't reach in time, its energy intent set from the picture, its cue time and its bands; as a short plan with its numbers, each marked a guess.
8. **The build plan, re-cut by your D7:** each slice from 0 to 8b with what it builds, what it removes and its acceptance, checking that each adds one loop group or one technique family and leaves the wingman flyable; include the forced G-cap case and the abeam restriction you proposed.
9. **The rig steps for slice 0:** exactly how to measure the turn-rate lag and the G lag your margins depend on: the trims, the step sizes, what to read, and the value at which each loop's C2 verdict changes.
10. **Re-check with the corrected energy numbers:** anything in your report that rested on D14 (slice 4's "within 15 KIAS of Lead at each turn's end", the drop low inside, the power trim).

Please give: the reconciliation table; the classification of your N² cells; the gaps; the three gate re-checks; the changed rows; the diagram (mermaid, then the list); pass clear's plan; the re-cut slices; the rig steps; the energy re-check; and any new findings, each marked "fix before building", "can wait" or "note", with its evidence and your confidence.

You are working on your own: nobody is watching, and nobody can answer a question while you work. Finish the whole task before you stop. Don't end with a plan for what you would do next, or with a question asking whether to carry on; do that work. If a question comes up, finish everything that doesn't depend on it, state the assumption you made, and list the question at the end. The tables and findings are the deliverable: report them and stop, and don't write code. Keep to what is asked here; anything else you notice goes in a short "Notes" section at the end. Please remove all mannered prose: say what you mean in plain, direct words.
