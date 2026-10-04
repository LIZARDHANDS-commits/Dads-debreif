# Turn Fight: future ideas

Ideas for Turn Fight that are not being built. An idea moves into `plan.md` only with Patrick's yes (TQ-1), and a new idea goes on this list the same day it is asked for. "Feature Ideas" numbers are from the researched list of 54 ideas, kept at https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (`pf/reset/2-inventory/agents/sources/feature-ideas.md:26`). "FF" numbers are from the old plan's future-features list and its later additions (`archive/docs/records/future-ideas.md:16`).

## From the old future lists

- A service-ceiling limiter at 25,000 ft MSL: in the Energy mode's mutual climbs, clamp the energy or enforce the ceiling so a jet cannot climb on for ever (old FF45, old decision D205) (`archive/docs/records/future-ideas.md:21`). Under "references, not walls" a ceiling like this would be a default shown on screen; only what the aircraft physically cannot do is a hard limit (`pf/reset/consolidation-plan.md:264`).
- One flight model for Simple and Energy modes: merge Simple's circle geometry and Energy's 3D engine into a single simulation (old FF47). The requirement ALL-R23, one shared place for each piece of flight math, points the same way, so this is a candidate to move into the plan (`archive/docs/records/future-ideas.md:23`, `pf/reset/1-requirements/requirements.md:51`).
- A solo SMM aerobatics sequence mode: loop, cloverleaf, four-point and hesitation rolls, roll-off-the-top, vertical eight and Cuban eight, with a 3D ribbon trace and an energy-gate score (old FF48, old decision D428). The SMM aerobatics reference is `docs/references/smm-aerobatics-catalog.md` (`archive/docs/records/future-ideas.md:25`, `docs/references/smm-aerobatics-catalog.md:1`).
- The chaser picking its own pursuit (old FF42, PPQ-15) is not listed: it was built (old decision D419), so the old queue row is dropped (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:59`, `pf/reset/1-requirements/scope-and-ideas.md:203`).
- The 3D fallbacks cut under the old "streamlined build" (3D is a bonus): focus after a graphics reset, a listener for a restored 3D context, canvas clean-up, the note's wording and a console recipe for testers; the handover said they go on the future list if wanted (`archive/docs/handover/turn-fight.md:122`).

## Feature Ideas for Turn Fight

- **BFM briefing whiteboard**: drag aircraft, set heading, bank and speed, draw turn circles, the lift vector and the 3/9 line, animate keyframes and save a picture; it could share code with the Formation Briefing Board (see `../../FUTURE.md`) (Feature Ideas idea 24; value high, effort medium; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:26`)
- **Pursuit geometry explorable**: lead, pure and lag pursuit with sliders for angle-off, aspect and heading crossing angle, showing closure and turn circles; the Energy mode already has Pure, Lead and Lag choices (`pf/reset/1-requirements/scope-and-ideas.md:196`) (Feature Ideas idea 26; value high, effort medium; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:28`)
- Flight-physics explorables (idea 25) are listed once, in `../../FUTURE.md`; they are closest to this module's purpose (`pf/reset/1-requirements/scope-and-ideas.md:197`).
