# Formation Sim refactor plan (Fable, read-only, 5 Oct 2026 23:20Z)

**Approved by Patrick 23:18Z ("agreed"). 23:26Z: no fly-through stops; build PRs 1-8 straight through, then the docs rewrite while Patrick tests.** Built by the Formation thread (Opus), one PR per item, in this order. Starts once V2.90 (#2's error-and-fix tag) is on main. No tests; a few dry-run sims per PR are fine. Patrick tests once PR 8 is on main, while the docs are rewritten.

Everything here keeps the rulings in `formation-sim-handover.md` and `chooser/plan.md` sections 17-21. Nothing changes how the aircraft fly except where a ruling already says so (TS-87 cone energy, ALL-28 roll ceiling).

## The problem in one line

There are three generations of wingman code living side by side: the chooser and its planners (new, 2-ship standard moves), the errors and hot-rejoin layer (older, its own solver and its own rejoin), and the 4-ship graph (oldest, tracker legs). Each has its own idea of "in position", its own rate limits and its own numbers. Every ruling now has to be applied three times.

## What the end state looks like

- **One envelope gate** in the step loop: every replayed track, bank track and tracker segment goes through the same roll, G and speed limits from `src/core/t6-performance.js`. A planner can plan anything; the aircraft only ever flies what a T-6 can.
- **One candidate shape**: every planner (standard 2-ship, lag roll, errors, odd starts, 4-ship) returns the same `candidate` object and the one scoreboard in `chooser.js` picks. Passing means in band and lane OK (TS-80), as now.
- **One judge**: `judge.js` bands are the only definition of "in position" for every formation, 2-ship and 4-ship.
- **Errors = a start state + a Smart wingman switch.** Off: #2 flies the normal references and does not fix the error. On: the chooser plans from where he actually is and the band judges, with the Fix tools (TS-52) as allowed candidates. Fighting wing fixes use the cone first, then S-turns, power last (TS-87, section 21).
- **Numbers in one place** with their source beside each, split by rate set and move family so a ruling changes one line.
- **Events in one file**: press, re-plan, finish, queue.

## The PRs

### PR 1. Envelope gate finished (flight code, Opus, medium)
What: `holdToEnvelope` (flight.js:39) today only eases roll on poseTrack replays, and bankTrack goes through `easeRoll` in `flyStep`. Make one gate, called once per step for every aircraft whatever drives it (poseTrack, bankTrack, tracker, Lead's own turns): roll rate and roll onset from `rollLimitsT6A`, G onset `T6A_G_ONSET`, speed held inside the envelope (stall and VMO from the shared table). Lead's roll-in (144°/s in the mid.mjs case, plan.md section 17) goes through it too.
Why: the "line, then tracker" bank thrash (−5 → −56 → +42 → −37° in a second) and Lead's roll-in both bypass the limiter. With one gate the planners can be simpler, because they no longer have to be careful about rates.
Files: flight.js, transitions.js (flyStep), kinematic.js (applyPose stays a pose; the gate follows it), formation-turns.js (Lead). Source: ALL-28 (Patrick's ruling 22:01Z).
Dry run: mid.mjs case 6; Lead's roll-in; one fluid entry. Unseen until Patrick flies it.

### PR 2. One candidate shape, retire the old layers (flight code, Opus, medium-high)
What: every planner returns `{ name, segments | track, timeSec, maxG, inBand, laneOk, fallback, roughness, words }` and `candidateOf` is the only place that scores. Fold into that shape: lag roll (lag-roll.js, today a direct press path), hot-rejoin.js (odd starts: becomes "plan from here" with `replan.js` planFromHere as the start-state reader), the errors solver (errors.js solveKnobs: becomes the Fix-tool candidates), and the tracker fallback. Then delete hot-rejoin.js and the planning half of errors.js.
Before deleting, the PR description lists what each did (rule book, Building): hot-rejoin: offStandardStart, planHotRejoinChange, offStandardOutcome/words for the tag; errors: start-state offsets, reference/fix mode, Fix tools, solveKnobs on manoeuvres.js builders, 2-ship only, LAB turn buttons only. Everything on that list either has a new home in the PR or goes on `future.md`.
Files: chooser.js, replan.js, lag-roll.js, hot-rejoin.js (deleted), errors.js (split: panel stays, planning goes), formation.js (callers at 20/285/309/362/468/509), manoeuvres.js.
Dry run: the four chooser sims (legs, mid, lag-ech, trace-lab) and one off-standard start.

### PR 3. Smart wingman (flight code, Opus, medium) — Patrick's errors ask
What: the Errors panel keeps its start-state offsets (induce an error: wide, acute, sucked, high, low, stretched in FW). A **Smart wingman** switch, ON by default, and when ON a choice **Fix now / Fix on next manoeuvre**, default **Fix on next manoeuvre** (Patrick 23:34Z) (Patrick 23:33Z: "smart wingman means they CORRECT THE ERROR (Now or on next manoeuver, two options)"; "with smart wingman OFF they turn at the normal refs").
- **OFF, normal references** (Patrick's card 23:30Z "Same as standard"): #2 flies the standard move exactly as coded today (same trigger off Lead, same bank, same timing) from wherever the error put him, and makes no correction. The error carries through the turn as the geometry dictates and the tag shows what it became.
- **Fix now**: the chooser plans from his actual position straight away, aiming at the band, with the Fix tools as the allowed candidates: for LAB, a cut or a check turn toward or away, a few seconds of power; for FW, cone height first (climb or descend into the cone), then S-turns, power last (TS-87, section 21). The band judges; "Done when in band".
- **Fix on next manoeuvre**: #2 holds the error until Lead's next turn (or the next button), then flies that turn with the fix folded in: turning early or late, cutting off or lagging, as the Fix tools allow for the move, so he comes out of the turn in the band.
Why: this is the training use of the sim: see the error, see the fix now, see the fix on the next turn, or see what happens when nobody fixes it (OFF).
Files: errors.js (panel), chooser.js (allowed-candidate list per setting), a new `energy-follower.js` for the FW cone-energy follower (replaces the tracker's speed loop pulling throttle in FW), formation.js events (the "next manoeuvre" hook: the fix candidate is planned at the next press or Lead turn), tuning.js (the allowed Fix tools per formation, each with its source).
Decision TS-9x records the switch and its two fix choices; wording to Patrick before it is written.

### PR 4. Numbers register (tuning.js split; docs-ish, Sonnet, low)
What: tuning.js (670 lines) splits into one file per family: `rates.js` (RATE_SETS close/tactical, ROLL, RUN_IN), `slots.js` stays, `bands.js` (judge bands, TS-80), `moves.js` (per-move numbers: rejoin line angle, FW cone, LAB spacing, fluid entry). Every number keeps its source comment (manual page, Patrick's ruling with time, or "estimate"). `docs/modules/turn-sim/numbers.md` lists them all in one table generated by a small script in `tools/`.
Why: rule book "every number carries its source"; today a ruling means hunting through 670 lines.
No behaviour change. Unseen risk: an import missed; CI typecheck catches it.

### PR 5. Events out of formation.js (flight code, Opus, low-medium)
What: formation.js (754 lines) keeps the public surface (reset, press, change, lagRoll, where, pressFw, pressFluid, setFluid, clearQueue, step). `replanAtEvents`, `startChange`, `inBandAndSteady`, the decision-point and picture-breaking checks, PICTURE_RETRY_SEC, the queue move to `events.js`. Fluid and 4-ship stop being special cases there: they skip re-plans by a flag on the candidate, not by name.
Why: so PR 6 (4-ship) adds to the chooser, not to formation.js.

### Then: 4-ship (three PRs, Opus, high thinking for the planners)
From `four-ship/moves-from-the-manuals.md` (ratified 23:04Z) and `chooser/plan.md` section 20. 4-ship becomes: slots.js references for the ten formations (already there, checked in section 20), the same planners per aircraft in order (#2, then #3, then #4, each off his reference), the one envelope gate, the one judge. four-ship-moves.js (858 lines, the EDGES graph and tracker legs) is retired after its list is written, same rule as PR 2. Fluid 4 = two elements line abreast at the Spacing setting, each wingman in fighting wing off his element lead.
PR 6 formations and references + the 2-ship-like moves (echelon, finger, box, trail, route). PR 7 the rejoins (TRJ: Lead turns into #2 at once, #3/#4 to the turn circle at full power, rejoin outside one at a time, 05:34Z ruling; SARJ). PR 8 Spread 4 / Fluid 4 and the sequence. Sign-off checklist after PR 8.

### Last: docs rewrite (Sonnet, low)
Spec rewritten by topic, testing.md trimmed, decisions numbered through, future.md tidied. Pinged to the Docs keeper. Nothing in this PR changes code.

## Order and who

| # | Piece | Who | Starts when |
|---|---|---|---|
| 1 | Envelope gate | Formation, Opus | V2.91 on main (started 23:26Z) |
| 2 | One candidate shape, retire old layers | Formation, Opus | 1 merged |
| 3 | Smart wingman (OFF = normal refs; ON = Fix now / Fix on next manoeuvre) | Formation, Opus | 2 merged |
| 4 | Numbers register | Formation, Sonnet | any time after 2 |
| 5 | Events file | Formation, Opus | after 3 |
| 6-8 | 4-ship | Formation, Opus | after 5 |
| 9 | Docs rewrite | Formation, Sonnet | after 8 |

Fable (this thread) reads each PR before merge and reports; it does not edit. No fly-through stops (Patrick 23:26Z). Badge bumps one per PR.

## What this plan does not do
- No new tests (Patrick 21:06Z). Dry runs only.
- No change to the roll numbers (ALL-28) or any flying number without a ruling.
- No 3D work.
- Fluid 2-ship stays as flown in V2.86 (entry, 360 on Sequence).

## Patrick's ask 23:54Z (where to fit it waits on his pick)

**Nudge #2 inside the band:** when #2 is in position, show his offset from Lead (forward, across, up) and let Patrick move it (nudge buttons or a drag on the 2D view) to anywhere in the band, the edge of the envelope, or out to 6,000 ft in line abreast; the sim flies it as a move (tracker to that spot); every move after plans from there (PR 2) and judges by the band, so "in position" is anywhere in the band, not where he started. Simple after PR 2: one PR, Opus, about PR 1's size. Patrick 23:55Z: fold into PR 3. Written by Fable (planner + wiring + dry run) in `move-in-band/`, handed to Formation 00:05Z 6 Oct. Control on the left panel with the formation-position options, dynamic to the formation (23:56Z).

## Waiting on Patrick
1. The move-in-band decision wording (asked 00:04Z 6 Oct).
2. PR 3: the exact wording of the decision, when Formation drafts it.
