# Turn Sim: future ideas

Ideas for the Turn Sim that are not being built. The review decided on 4 Oct (a new flying core, `decisions.md` TS-35); each item here is built on that core, one at a time, only once Patrick moves it into `plan.md`. An idea moves into `plan.md` only with Patrick's yes (TQ-1), and a new idea goes on this list the same day it is asked for. "Feature Ideas" numbers are from the researched list of 54 ideas, kept at https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (`pf/reset/2-inventory/agents/sources/feature-ideas.md:30`). "FF" numbers are from the old plan's future-features list (`archive/docs/records/future-ideas.md:5`).

The second wave of live mode (rejoins, fighting wing and fluid manoeuvring, old FF39 to FF41) is not listed here: Patrick put it in the plan, in the order the review sets, so its single home is `plan.md` Step 4 (`pf/reset/1-requirements/questions.md:165`). The G-warm exercise (two-ship and four-ship) is also in the plan: its question is TS-Q19 and the four-ship picture check is a Step 1 item (`pf/reset/1-requirements/questions.md:164`).

## From the old future lists

- The vertical fluid manoeuvres (loop, wingovers, barrel roll; SMM 16.17), which could reuse Turn Fight's Energy 3D model (old FF38). The Turn Sim is flat today (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:41`).
- A vertical step in the offset-box hook (old FF46, old decision D207): separate the 31 ft flat nose-to-nose pass with the SMM's own vertical separation or an offset, instead of only a caution flag. The requirement TS-R11 already says the screen warns that real aircraft would be stacked 300 ft apart where aircraft cross by design (`archive/docs/records/future-ideas.md:22`, `pf/reset/1-requirements/requirements.md:338`).
- A lead +4 G, wingmen +5 G advanced-formation limits check, as a flag with no flight change (Gen Book p.11); a requirement candidate (`pf/reset/1-requirements/scope-and-ideas.md:244`).
- A pitchout and rejoin exercise sits with the rejoins in Step 4 of the plan, not here (`pf/reset/1-requirements/scope-and-ideas.md:237`).

## Feature Ideas for the Turn Sim

- **Formation position trainer**: top-down and sight-picture views of fingertip, echelon, route, fighting wing and trail, with a quiz mode; pairs with the Formation Turn Sim (Feature Ideas idea 28; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:30`)

## Live mode: V6's features and other asks, on the new core

Patrick, 4 Oct (review thread): he wants all of V6's features eventually, added one at a time on the working 2-ship model (`spec.md` Part 1, section 6). The order of the first few is in `plan.md` Step 4; the rest wait here.

- The 4-ship's other orders (2134) and the offset box, each wingman flying off its reference aircraft. The Spread 4 itself is built (V2.7, TS-50).
- Four-ship design asked for (Patrick, 4 Oct 11:14Z, list agreed 11:15Z): manoeuvring in offset box and fluid 4 and moving in and out of them, 4-ship fighting wing, G-warm from Spread 4, 4-ship rejoins to finger or echelon, close 4-ship position changes. Being designed in /mnt/project-files/turn-sim-review/four-ship/; lost sight, overshoot and contingencies go with the training errors; take-offs and the initial recovery belong to the Traffic Sim.
- The mid-flight transition between 2-ship and 4-ship (V2.7 restarts from the default start of the mode chosen); being designed in another thread.
- The 4-ship's delayed 45 as the brief draws it: all the aircraft after #2 check together right after #2 starts its turn, then turn in sequence (AFM8 brief p.18). That cannot roll out in exact line abreast, which is what the brief's own note admits ("quickly fix any spacing or sweep errors on roll out"), so it waits for the errors layer; V2.7 flies each check and turn in sequence instead, which is exact except for a little tight on the first aircraft to check.
- The 4-ship's altitude stack chosen by #2 (the SMM: #2 sets it, #3 and #4 take the opposite block, so #2 can be below Lead) and a stack-change step before a turn ("return to stack promptly when directed by Lead", AFM8 brief p.14). V2.7 keeps the brief's stack all the time.
- Plan mode on the same core: pick a start and a manoeuvre, press Play (TS-R1).
- Errors and faults (TS-R8): late or early, more or less G, wide, tight, fore or aft; one-click faults (TS-Q16); the hook's G adjustment at the 90° point and the wingman's roll-out fixes come with them (TS-48).
- Pressing a button mid-turn and re-planning from the banked state (the first version queues it, TS-45).
- The clock cue drawn as a picture (where the other aircraft is at the turn point), and a Clock cue timing option (TS-R7, TS-40).
- An angle box for the check turn (5 to 30°; the first version flies 20°, TS-46).
- The wingman passing below instead of above in the shackle and cross turn (TS-42's working answer is above).
- Speed and block height: a low or mid block choice (220 or 200 KIAS, TS-R6), the real low block height (8,000 ft is an estimate, TS-38), and a simple speed bleed in 3 G turns (constant for now, TS-38).
- Wind (TS-R10; still air for now).
- Saved setups (TS-R18), the CSV export (TS-R19, TS-Q13), the spacing graph (TS-Q14), which read the rolling record.
- Dragging a wingman to a new start (TS-R17).
- G-warm (two-ship and four-ship; TS-Q19), entry to line abreast, rejoins (TS-Q20): first in `plan.md` Step 4.
- V6's other layers: breadcrumbs with time stamps, spacing lines, clock marks, NM labels (the drawing code is still in `view.js`).
