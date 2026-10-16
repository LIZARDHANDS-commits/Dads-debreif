# Run-in Simulator: decisions (RS-)

Approved with the spec by Patrick (relayed by Dad, 16 Oct 2026: "yea pat approves"); RS-9 is his addition.

| ID | Decision | Files | Source |
|---|---|---|---|
| RS-1 | **Its own module, one screen** (ALL-44): Setup on the left, the 3D view with a plan view in the middle, the result on the right, playback and cameras under the view (house rules). Its home card shows once Step 2 is built. | `docs/modules/run-in-sim/`, `src/modules/run-in-sim/` | Dad, 16 Oct 2026 (plan's working answer); Patrick's yes on the plan. |
| RS-2 | **Generic target shapes on the real ground, training only.** A stadium bowl, a bridge, a tower, a range circle and a drop zone, sized as estimates, placed anywhere on the shared terrain and satellite picture; no outside building or target data; inert loads only; "Training only" always on screen. | spec, Targets | Dad's card, 16 Oct 2026: "Generic shapes on real terrain". |
| RS-3 | **One engine, three run types.** Flyover, practice bomb (flat or dive) and cargo offload share the five legs: orbit, IP and run-in, dive, release, escape. | spec, The pass | Dad's card, 16 Oct 2026: "All three, one engine". |
| RS-4 | **Auto-flown on the shared point mass by a pilot built from core pieces** (`stepPointMass` with the aircraft's performance set; `easeRoll`, `easeValue`, `dampedClimbG`, `liftTowardAim`, `windTriangle`); gains are the module's own estimates; no new flight formula. | spec, How it flies | Dad's card, 16 Oct 2026: "Auto-flown, you set it"; rule book, search before writing flight math. |
| RS-5 | **The load is core `drop.js`** (DB-36); its CARP is improved in place to take a dive release (the release velocity's vertical part, the release point slid along the dive line). | `src/core/drop.js`, flight-math list | Rule book, one copy of each formula. |
| RS-6 | **Limits flag, never stop.** The stall line, the roll limit and the G onset always hold; the published G limit and VMO and the module's escape references (lowest height, distance from the target, the flyover's height over the target's top) are flagged on the result card; a setting past them is flown as set; a pass the aircraft can't make is flown as best it can and flagged, never silently changed. | spec | Rule book, "References, not walls". |
| RS-7 | **Wind and temperature are typed**, at the release height and the ground, linear between; a "planning wind" under More works out the CARP when it differs from the wind met. No outside weather source. | spec, Setup | Dad, 16 Oct 2026: "speed alt winds" set by the user; rule book, new outside sources need Patrick's yes. |
| RS-8 | **The pilot times the orbit's exit to make the planned time over target**; when no exit can, it flies the soonest and the card says how late. | spec, The pass | Build choice (time over target is the flyover's point); approved with the spec. |
| RS-9 | **The user sets a few essentials; the computer works out the rest to hit.** For each run a short list of settings is the user's (spec table); the release point, the aim-off for the wind, the roll-in point, the IP turn and the orbit exit are worked out so the load lands on the aim point (or the flypast is on time and height). Under More any worked-out number can be set by hand, and the card shows the miss that results. | spec, What the user sets | Patrick, relayed by Dad, 16 Oct 2026: "the user should sset a few parameters the then the computer sets the offset or whatever variable needs adjusting to hit". |

## Waiting on a question

RS-Q1 (which aircraft fly, and the C-130J's flying), RS-Q2 (the defaults), RS-Q3 (the escape references), RS-Q4 (the starting places): see the README.
