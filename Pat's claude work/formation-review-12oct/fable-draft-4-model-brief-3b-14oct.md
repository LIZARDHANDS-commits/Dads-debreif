# Design review brief 3b: today's wiring, and reconciling your tables with it

*Filed 14 Oct 2026 by the Formation thread, a supplement to brief 3 (`fable-draft-4-model-brief-14oct.md`), at Patrick's ask ("like we want it to evaluate our system we're designing, right?"). To be sent to the same Fable agent once its brief 3 report has landed (never mid-run), so it has its own tables in front of it; if that agent can't be continued, a fresh run gets brief 3's report pasted in above this. Renamed terms; scrubbed with `scrub.mjs check` before filing. Source: `docs/modules/turn-sim/control-model.md` sections 1, 5 and 10.*

---

Thank you for the review. One more piece of work on the same design, using the same terms. The job is still to evaluate the design being built (the proposed structure in brief 3). Today's wiring below is the baseline, so you can check that the proposed design removes today's bad links, keeps the good ones, and does not drop one it needs.

Everything you need is in this message and your own report. Please do not open any file.

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

## What we ask

1. **Reconcile.** For each of today's cells and feeders above: kept, changed (how), or dropped (why), in the proposed design as your report modelled it.
2. **Classify.** For each cell in your proposed N² chart: does it pass physics, a limit, a request, or a decision or switch state? Flag every decision or switch-state cell, and say whether it is acceptable (for example the supervisor picking a technique) or should go.
3. **Gaps.** Any link today's design needs, or the close-formation pattern shows, that your tables lack; and any new link with no stated purpose.
4. **Re-check** C1 (one owner per control), C5 (interaction) and C6 (switches) on the reconciled tables.
5. **Revise** your tables where this changes them: give only the rows that change, with the reason.

Please give: the reconciliation table; the classification of your N² cells; the gaps; the three gate re-checks; the changed rows; and any new findings, each marked "fix before building", "can wait" or "note", with its evidence and your confidence.

You are working on your own: nobody is watching, and nobody can answer a question while you work. Finish the whole task before you stop. Don't end with a plan for what you would do next, or with a question asking whether to carry on; do that work. If a question comes up, finish everything that doesn't depend on it, state the assumption you made, and list the question at the end. The tables and findings are the deliverable: report them and stop, and don't write code. Keep to what is asked here; anything else you notice goes in a short "Notes" section at the end. Please remove all mannered prose: say what you mean in plain, direct words.
