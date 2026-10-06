# Straight-ahead rejoin: hit the line and flow up it (Fable, 6 Oct 2026 02:05Z)

Patrick 02:01Z: "in all cases, a rejoin should never stagnate (stop) until it's in position. 'stable' does not mean 'Stop'. SARJ should hit 'The line' (drawn between the prop spinner and wingtip, as per smm) and fluidly transition their motion up that line in to position. Right now #2 overshoots the line almost abreast with lead then moves back over."

Read-only diagnosis from a dry run on main (V2.104): fighting wing right to echelon right, straight-ahead rejoin, instructor rates. Scratch script: the Fable thread's `sarj-trace.mjs` (prints #2's place off Lead each quarter second against the wing line).

## What the dry run shows

| time | fwd (ft) | left (ft) | ahead of the wing line | closure |
|---|---|---|---|---|
| 17 s | -131 | -77 | -89 ft (behind the line) | 15 kt |
| 19.5 s | -66 | -117 | 0 (on the line) | 12 kt |
| 22.3 s | -19 | -161 | +71 ft (almost abreast, at "route") | 6 kt, bank 59° |
| 25 s | -3 | -102 | +53 ft | 0 kt |
| 29.4 s | -20 | -51 | +9 ft | -2 kt, IN POSITION |

So #2 is on the line at 19.5 s and 130 ft out, then flies on through it to the route slot at 160 ft out and only 19 ft back (almost abreast), kicks 59° of bank to stop there, and slides back in along a near-abeam path to echelon with the closure at zero from 25 s. That is the overshoot and the stagnation Patrick saw.

## The two causes

1. **Route is not on the line.** `slots.js`: echelon is 45 ft out, 25 ft back (29° aft of abeam: the spinner-to-wingtip line). Route is 167 ft out but still only 25 ft back (8.5° aft of abeam): it sits almost abreast. The planner's last legs (`transitions.js straightAhead`: close to the six, then `closeThrough` route, then `slide` to echelon) aim at that route slot, so the "line" they fly is six-to-route-to-echelon, a dog-leg through the abeam, not the wing line. If route is on the wing line (SMM 16.15 para 38 and 12.24 para 58 are the pages to check; cite, never quote), route at 167 ft out should be about 93 ft back (167 × 25/45). **Patrick's call: is route on the spinner-to-wingtip line?** (Fable's guess: yes.)

2. **The legs stop at each slot.** `closeThrough` arrives at route with its closing speed run down (vrel0 8 ft/s, decel 1, advanceTol 6 ft), then `slide` to echelon starts from rest: a stop at route, then a crawl in. "Stable" is read as "stopped".

## Proposed fix (the four-ship thread owns the files)

- `slots.js`: put route on the wing line (fwd = -167 × 25/45 ≈ -93 ft for the 2-ship; the 4-ship's route places likewise, each off the aircraft it flies off), with the SMM page beside it. One number, so Patrick sees it on the Route button too.
- `transitions.js straightAhead` (and the 4-ship's `closeFromFw` / `straightToEchelon` if they keep their own legs): after the six, aim the closing leg at a point ON the line (the vector point, about 500 ft back, is already there) and then flow UP the line: one phase whose slot is the echelon slot itself, with the reference sliding along the line (fwdRate and latRate in the line's ratio) and a floor on the closing speed so it never reaches zero before the slot (vrel0 about 10 ft/s, the close-in rate, SMM 12.24 para 58's "controlled"); route is passed through, not stopped at. advanceTol on the route leg large enough (about 60 ft) that the next leg starts while he is still moving.
- Rule for every rejoin and close move (Patrick 02:01Z): the closing speed on the last leg never falls to zero before the slot; "stable" means within 5 ft and 5 kt (TS-80), not stopped. Worth a tracker number: a floor on vrel until the final tolerance.

Numbers above are estimates unless a page is named. Not built, not tested; dry run only.

## Patrick's ruling (02:11Z)

"Route IS on the line. Just moved down from echelon 5 wingspans. It should move through route and stop at echelon. This is the same from the turning rejoin (except from the reaction point the aircraft moves down relative to lead and on to the line. It's 'down' because leads wings are banked.)"

So:
- Route = the echelon place moved 5 wingspans further out ALONG the spinner-to-wingtip line (T-6A span about 33.4 ft, so about 167 ft along the line: roughly 146 ft out and 81 ft back for a 29° line; the builder should derive it from the echelon place and the line, one source, not two numbers).
- The straight-ahead rejoin flows up the line through route and stops only at echelon (closure never zero before the slot).
- The turning rejoin is the same picture: from the decision (reaction) point #2 moves "down" relative to Lead onto the line and up it. "Down" is in Lead's banked frame: the line is in Lead's plane, so with Lead banked it is tilted and moving out along it is down. The turning rejoin's last legs (turning-rejoin.js tailLegs / acrossSixLegs, and the 4-ship's) should aim at the line in Lead's rolled frame, not at a level route slot.

Patrick 02:12Z, for EVERY move, not only the SARJ: "The aircraft never stops until it is IN position. Stable does not mean stop, it means controlled."
