# Traffic Pattern Sim: future ideas

Ideas for the Traffic Sim that are not being built. An idea moves into `plan.md` only with Patrick's yes (TQ-1), and a new idea goes on this list the same day it is asked for. "Feature Ideas" numbers are from the researched list of 54 ideas, kept at https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (`pf/reset/2-inventory/agents/sources/feature-ideas.md:29`). "FF" numbers are from the old plan's future-features list (`archive/docs/records/future-ideas.md:5`). "PPQ" numbers are from the old roadmap's Phase 2 queue (`archive/docs/REMEDIATION_ROADMAP.md:393`).

## Decided for the future list by Patrick

- How an aircraft comes to "miss the traffic" on final (the old plan's random 10 percent). The options were a per-aircraft setting, never, or a seeded 10 percent roll. Not decided for the first version; the move-over rule in TR-R18 stays as written. Patrick, 4 Oct 03:13Z: "Add this to futur features for traffic" (`pf/reset/4-decisions/future-items.md:7`).
- Light editing of the traffic patterns (move points, add or delete a pattern). The published Moose Jaw patterns are locked in the first version (`pf/reset/1-requirements/requirements.md:189`, `pf/reset/1-requirements/questions.md:87`).
- Other aircraft types, with their own speeds, until Patrick and Dad pick them (the first version has the CT-156 Harvard II only; the type system stays) (`pf/reset/1-requirements/requirements.md:212`).
- The "Set up a conflict" tool: an instructor builds a teaching picture. (Its simplest form, Spawn a conflict, was built 4 Oct; see below.) Patrick's first-version rule puts it on the future list; the old queue calls it PPQ-06 (`pf/reset/1-requirements/requirements.md:210`, `archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:50`).
- Named plans and rule checkboxes (the old "control in five layers") (`pf/reset/1-requirements/requirements.md:435`).
- A "Copy setup as text" helper for the routes, promised with the route redraw in `plan.md` Step 5 and lost; it was one of the small lost promises (`pf/reset/0-lessons/lessons.md:146`, `pf/reset/0-lessons/lessons.md:118`).
- Patrick's gear-and-flaps drag idea for the forced landing is not listed here: it is in `plan.md` Step 1 (the PFL review), which is its single home.

## Asked for by Patrick, waiting for his yes to move into the plan
- **Tune the PFL to touch down in the first third of the true-length runway** (Patrick, 5 Oct 02:01Z: "accept it and flag pfls for tuning later"). On the true runway (TR-67) the first third ends about 2,420 ft past the threshold. A PFL from Low Key (3,700 ft, 120 KIAS, heading 118°) with 20 kt from 208° touches down about 2,553 ft down the runway (the same spot as on the old 8,150 ft runway, so the glide did not change). Its other cases land 1,230 to 2,050 ft in. The check in `tests/unit/traffic/pfl.test.js` ("on profile at High Key or Low Key ... first third") allows up to 2,600 ft until this is done.
- The SI Rejoin's "Miles back from the base turn" counts from its Entry Mid. With the true-scale routes (TR-67) the SI Rejoin runs straight up the base-leg line, so there is no turn there; whether to count from the Arrow Tree Rows (where the straight-in turns base) instead is for Patrick.

- Automatic deconfliction (Patrick, 4 Oct 09:40Z). Moved into `plan.md` and built (11:54Z and 17:38Z; spec 4.12). Still open: the real 29L/29R gap for the move-over (a question for Dad). A PFL's bank away now costs it glide (TR-55, #318), and the move-over levels at 2,100 ft (TR-56, #319). The original ask, kept for reference: only when a conflict is close to happening, never far out:
  - an aircraft that gets too close to another flinches (as in the turn-fight sim), then goes into a breakout;
  - right-of-way rules: an aircraft that would perch and fly into a straight-in breaks out instead;
  - a straight-in that has to go around, or one that someone perches on by accident, goes between the runways;
  - a PFL coming in while an overhead aircraft reaches initial, where they would conflict: the PFL keeps right of way; the overhead aircraft flies through (as the orders say), makes a 90° left turn at the end of the runway and rejoins the outer downwind; if traffic on the outer downwind would then be a conflict, it breaks out instead (Patrick, 4 Oct 09:43Z);
  - traffic rejoining on an entry that would conflict breaks out and rejoins.
  It overlaps PPQ-03 (automated SMM rules) and PPQ-04 (fly-through) below, and FF25. The rules need their Flying Orders and SMM pages before it is specced.
- Formation take-offs and the initial recovery belong to Traffic, not the Turn Sim (Patrick agreed in the Turn Sim thread, 4 Oct 11:15Z): 2+2, interval and 3+1 take-offs, and GULAP. Future only; nothing is built for them yet.

## Asked for by Patrick and built straight away (4 Oct 2026)

- High Key from anywhere: a flown climb onto the run-in (09:14Z; merged in #259).
- An Aircraft size slider under settings, starting at "Realistic" (10:06Z; #259).
- The sim's name in the top left: "Pat's CYMJ Traffic & Pattern Simulator" (10:09Z; #259).
- A test that every manoeuvre's transitions are smooth (10:05Z; six limits approved 10:18Z; `smooth-transitions.test.js`).
- His oblique view over the field as the opening 3D view (10:17Z; #267), and "Over the field" first in the Camera menu (his card, 10:53Z).
- Clearer 3D (10:55Z): wider route lines with a dark edge (17:50Z: too thick and solid, now in the middle: 2 px patterns, 1.5 px the rest, a 1 px edge, both see-through), a coloured ring round each aircraft, bolder words; the PFL circle, its keys and each PFL aircraft's glide ring drawn on the 3D ground, as on the map. The PFL tag (decision and configuration) was already on the 3D aircraft; it is now easier to read.
- The left panel is "Setup" (11:05Z): five scenario buttons (Moose Jaw day, One aircraft, Full circuit, Joining traffic, and Random, which puts five aircraft at random route points at least 1 NM apart, an estimate), then the wind as a dial (click or drag round for the direction it blows from, in 10° steps) with a strength bar and a line giving 29L's head and cross wind. The wind boxes left the top bar.
- Spawn a conflict (19:24Z, his card "Build it now"): select an aircraft, pick a route, and a new aircraft is started where and when it meets the selected one (spec 7.2). And the aircraft list stays on one screen with a "More" button (19:27Z).
- A Busy circuit scenario, now the opening picture, with the wind at 260°T 15 kt (18:36Z, 18:47Z): ten aircraft at random points of Pattern 1, a PFL gliding in from the area to High Key, and a straight-in that meets an aircraft in its final turn and moves over to go around between the runways (spec 7.2).
- Built (spec 4.12, TR-50; #282, #291, #299): the automatic deconfliction above. The history: borrowing the idea of Turn Fight's collision avoidance (11:05Z; design notes in the project files, traffic-deconfliction/). Conflict resolution means breakout and move-over; who has right of way and who moves when come from the Flying Orders and the SMM, cited by page (11:06Z). Aircraft first manoeuvre as the manuals say; if a close collision is still coming, they switch to the skill (hand over to physics flight) and break out (11:07Z). The design is done, and Patrick answered its nine questions on cards (11:23-11:26Z): the perch is the point of no return; rules from 15 s, skill from 6 s, the right-of-way aircraft from 3 s; after the flinch a breakout (go-around on final, bank away only in a PFL); after a fly-through, climb straight ahead about 500 ft (estimate) then the breakout turn; move-over 500 ft toward the inner runway (estimate); on by default with a master switch and tags; rejoin on the same kind of entry; extend-downwind left out; with no rule, the higher aircraft moves, at the same height the one on the right has right of way, and downwind traffic has right of way over rejoining traffic. It is built after refactor PR 4, using the shared closest-approach helper Turn Fight puts in `src/core`.

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

- **A Base start for the overhead break** (Patrick, 4 Oct, in his list of spawn spots: Initial, In the break, Downwind, Base, Perch). The route has no spot between the inner downwind and the Perch, nor in the final turn; where Base starts is to be settled with Patrick. A new route spot is a flying change.

- **Saved scenarios with notes** (off the screen since DADS v2.10.32, Patrick, 4 Oct: "I don't think we need scenarios and notes, just a drop down for pre-made scenarios"). What it did: saved the whole setup (routes, aircraft, dice seed, settings and a notes box) by name in the browser, loaded or deleted one after asking, refused damaged or unsafe saved data, said so when the browser would not keep it, and opened on the last setup used. The code is still in `src/modules/traffic/profiles-panel.js`, `profile-store.js` and `profiles.css`, with its unit tests; bring it back as a "More" item, or delete it, when Patrick says. A file export to send a scenario to Dad is TR-Q22.

- **Overhead break explorable**: break interval, bank and G against downwind spacing, plus a puzzle about where number two is when the lead rolls out; extends the Traffic Sim (Feature Ideas idea 27; value medium, effort small; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:29`)
- A parachute animation when a PFL aircraft ejects (today a red ✕ marks the spot) (listed 4 Oct, after the 3D ground photo work, #317).
- **3D speed:** Performance graphics cut the ground photos to 2,048 px; the sharpest (zoom 18) photo layer loads only when the camera is low near the field; and a frame-time readout to see what the 3D view costs (listed 4 Oct, after #317).
- Runway and airfield data for any airfield (idea 7, old FF20) is needed for TR-R26 beyond Moose Jaw; it is listed once, in `../shared/future.md`.
- **PFL pieces not built yet** (found by the Docs thread's audit, 4 Oct; on no list until now): a check in the final turn that the aircraft will roll out lined up with the runway; the flare (SMM 13.9 para 18, 13.10 para 19); and the gear decision at the 50 ft edge, where spec 4.5 counts down to 50 ft low as still on profile (an estimate). Not built until Patrick moves them into `plan.md`.
- **PFL rework, waiting on Patrick** (Fable's review, 5 Oct; TR-85 built the rest): gear-down drag about 30% light against SMM 13.5 para 11 (F4, Q1); one zoom for plan and flight, NFM or EFIG numbers (F7, Q4); the round-out to 80-90 KIAS (F8, Q6); the unsourced constants and the copied break curve and stall-bank formula (F13, F14); staging the drag a few seconds apart (F6: tried at 5 s, it landed the normal starts long, so it was left out); an area PFL 3 NM out at 10,000 ft lands but misses the gate by 97° (as before). H2 (4,600 ft on the inner downwind, inside the circle) turns round and lands but crosses the 2,100 ft gate at about 100 KIAS: the plan's height sum and the flight disagree (F9), left for the full rewrite (Patrick, 5 Oct 23:05Z, "Leave it").
- **PFL full rewrite as a segment planner** (Patrick, 5 Oct 19:57Z; Fable's Q7 option b, F16): plan the whole glide as a chain of held-bank turns, straights and gear and flap steps, fly them as planned, and re-plan the chain at the keys or when the margin crosses its threshold, so the height-needed sum is on the path flown. The middle road (TR-85) was built instead. The handover, with Fable's documents and all the work towards it, is `pf/traffic-review/pfl-full-rewrite-handover.md`.
