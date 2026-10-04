# Traffic Pattern Sim: future ideas

Ideas for the Traffic Sim that are not being built. An idea moves into `plan.md` only with Patrick's yes (TQ-1), and a new idea goes on this list the same day it is asked for. "Feature Ideas" numbers are from the researched list of 54 ideas, kept at https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (`pf/reset/2-inventory/agents/sources/feature-ideas.md:29`). "FF" numbers are from the old plan's future-features list (`archive/docs/records/future-ideas.md:5`). "PPQ" numbers are from the old roadmap's Phase 2 queue (`archive/docs/REMEDIATION_ROADMAP.md:393`).

## Decided for the future list by Patrick

- How an aircraft comes to "miss the traffic" on final (the old plan's random 10 percent). The options were a per-aircraft setting, never, or a seeded 10 percent roll. Not decided for the first version; the move-over rule in TR-R18 stays as written. Patrick, 4 Oct 03:13Z: "Add this to futur features for traffic" (`pf/reset/4-decisions/future-items.md:7`).
- Light editing of the traffic patterns (move points, add or delete a pattern). The published Moose Jaw patterns are locked in the first version (`pf/reset/1-requirements/requirements.md:189`, `pf/reset/1-requirements/questions.md:87`).
- Other aircraft types, with their own speeds, until Patrick and Dad pick them (the first version has the CT-156 Harvard II only; the type system stays) (`pf/reset/1-requirements/requirements.md:212`).
- The "Set up a conflict" tool: an instructor builds a teaching picture. Patrick's first-version rule puts it on the future list; the old queue calls it PPQ-06 (`pf/reset/1-requirements/requirements.md:210`, `archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:50`).
- Named plans and rule checkboxes (the old "control in five layers") (`pf/reset/1-requirements/requirements.md:435`).
- A "Copy setup as text" helper for the routes, promised with the route redraw in `plan.md` Step 5 and lost; it was one of the small lost promises (`pf/reset/0-lessons/lessons.md:146`, `pf/reset/0-lessons/lessons.md:118`).
- Patrick's gear-and-flaps drag idea for the forced landing is not listed here: it is in `plan.md` Step 1 (the PFL review), which is its single home.

## The old Phase 2 queue for Traffic (PPQ-01 to PPQ-08)

The two copies of the queue name some rows differently; both names are given. Parts of PPQ-01, 02 and 05 are already built in the circuit and forced-landing work (the queue itself says so), and TR-R14, TR-R31 and TR-R32 now cover what the first version must do; what is listed here is only the part that is left (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:45`, `archive/docs/REMEDIATION_ROADMAP.md:399`).

- PPQ-01: a custom forced-landing route builder and orbit editor (queue wording) / "Practice Forced Landings" (roadmap wording). The basic PFL is in the first version (TR-R14) (`pf/reset/1-requirements/requirements.md:208`).
- PPQ-02: multi-key plan sequencing and in-flight triggers / "Simulated Engine-Outs & Glide Engine" (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:46`, `archive/docs/REMEDIATION_ROADMAP.md:400`).
- PPQ-03: a prediction engine and automated SMM rules (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:47`).
- PPQ-04: fly-through and departure-end break (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:48`).
- PPQ-05: dynamic closed-pattern hold logic (extend or unable) / "Closed Pattern Simulation (Extend/Unable)" (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:49`, `archive/docs/REMEDIATION_ROADMAP.md:403`). The closed pattern itself is in the first version (TR-R33).
- PPQ-07: an engine-out reach layer on the map and a pre-flight check (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:51`). The glide footprint ring already built shows part of it (`pf/reset/1-requirements/scope-and-ideas.md:161`).
- PPQ-08: ordered plans for several aircraft (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:52`).

## Ideas from the old future list (FF24 to FF36)

- FF24: use the latest METAR wind in the Traffic Sim instead of typing the wind in; it waits for the SOF weather store (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:27`).
- FF25: automatic sequencing, where aircraft extend or slow down to keep spacing behind the one ahead. It needs the "miss the traffic" answer above first (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:28`).
- FF30: a separate wind at pattern height (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:33`).
- FF31: slide or break to the inner runway (SMM 4.28 paras 80 to 81) (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:34`).
- FF32: early left or right turn (SMM 4.28 para 75) (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:35`).
- FF33: the uncontrolled square circuit (SMM 4.29) as the starter pattern for a home field other than Moose Jaw; it is the natural answer to TR-Q16 in `plan.md` Step 4 (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:36`, `pf/reset/1-requirements/questions.md:102`).
- FF34: runway occupied, continue and go low approach (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:37`).
- FF36: flapless as an aircraft option (SMM 4.25, 4.26, 14.2) (`pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:39`).

## Feature Ideas for the Traffic Sim

- **Overhead break explorable**: break interval, bank and G against downwind spacing, plus a puzzle about where number two is when the lead rolls out; extends the Traffic Sim (Feature Ideas idea 27; value medium, effort small; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:29`)
- Runway and airfield data for any airfield (idea 7, old FF20) is needed for TR-R26 beyond Moose Jaw; it is listed once, in `../shared/future.md`.
