# T29m part 2: the measuring kit (CA3), report (14 Oct 2026)

Opus agent, high effort, on `formation-control-analysis-plan` (fast-forwarded to b2 c65159fe first). Written here as well as handed back, so a new session can pick it up (the thread's request). The full page is `docs/modules/turn-sim/control-model.md` (section 13 is part 2).

## What was done

| Deliverable | Where | State |
|---|---|---|
| 1. Trace columns: each loop's terms, each control's ask against its grant, the winner, limits; Patrick's faults per press | `fighting-wing.js` trace `ctl`; `close-formation.js` `terms` through `wingman.js`; `tools/formation-gauge.mjs` columns, `faults` key, printed lines | Done |
| 2. Optional probe and the delay flags | `fighting-wing.js` `setFwAnalysis` (probe at `cWant`, `aimLateral`, `heightTarget`, `wantKias`; delay mode `picture`); `perception.js` extra delay per wingman; gauge `--extra-delay s`, `--delay-mode lead\|picture` | Done; never set in flying |
| 3. The scripted-Lead rig | `tools/fw-rig.mjs` → `tools/flight-design/results/fw-rig.json` | Done |
| 4. Gauge counts | Per press: each control's owner changes and mean hold, each loop's time at a limit, each switch's count | Done |
| 5. The abeam case | `b5-into-abeam` in the gauge's b5 set | Done, at 20° of sweep (see R14) |
| 6. Part 1's table against the rig (C11) | `fw_loops.py` `rig_check` → `results/fw-rig-check.md` | Done |
| 7. Phase-plane view on the plot page | - | **Left** (budget); the columns it needs (`sFt`, `dFt`, the switch columns) are all in the traces |
| 8. Master list, check and drawings current | `tools/control-map/` (CONTROLLER_COLUMNS, R13-R15, answered and new questions, `faults.mjs`), `control-model.md` section 13 | Done |

**Commits:** 6a72f489 (trace columns, probe, flags, abeam case, gauge counts, rig), then the last commit with the abeam set-up fix, the rig check, the master list and drawings, and this report.

## Keep-unchanged evidence

- `gauge-trace-compare.mjs` shown catching a deliberate change first: one #2 G value changed by 0.01 in a copy of the live baseline → `b5-into-in-position.json DIFFERENT .aircraft.#2.g values differ`, exit 1.
- Against runs made at b2's head (c65159fe) before any edit:
  - every default trace: **32 of 32 unchanged** (13 byte-identical, 19 new columns only);
  - every `--fw live --only b5-` trace: **11 of 11 unchanged** (new columns only).
  - The new `b5-into-abeam` is a new file (33rd default, 12th live), reported separately.
  - After that proof, the gauge changed once more, only inside the abeam case's own set-up (5 s more in the cone before placing him).
- `four-ship-probe.mjs` (repo passed as a `file:///C:/...` URL): `2d5b5a8020839796` for `{}` and for `{"fwWing":"live"}`, before and after.
- `npm run build` passes. `check.mjs --tag cm` passes: 13 traces, 86 columns seen, 86 claimed. `draw.mjs --check`: no diff.

## The rig against part 1's table (C11)

| Rig case | Rig: final, overshoot, 63% | Linear model | Verdict |
|---|---|---|---|
| Vertical, straight and level (40 ft step in the height target) | 1.00, 1%, 4.85 s | 1.00, 1%, 4.62 s | **Holds**, after one model fix: the code's D acts on his height rate, not on the error, so a change of target goes through P only (the first cut read 19% overshoot at 1.3 s). The loop's margins are unchanged by the fix. |
| Steering on the swept line (60 ft step in the aim) | 0.98, 0%, 9.25 s | 0.99, 0%, 7.45 s | **Holds** (within 30%) |
| Speed hold, straight and level (3 KIAS step in the wanted speed) | returns to −0.14, peak 0.56 at about 2.5 s | −0.14, peak 0.58 at 2.6 s | **Holds** |
| Offset d in Lead's 60° turn (60 ft step in the aim's offset) | - | - | **Not checkable linearly**: the filter acts 217 of 400 recorded steps at the trim the code settles to (604 ft of arc, 102 ft inside, 228 ft low) |
| Arc closure in Lead's 60° turn (5 ft/s step in the wanted closure) | - | - | **Not checkable linearly**: the filter acts 199 of 400 steps |

So the linear models hold where the filter is quiet. In the turn, the filter flying him at the trim is the review's F3 measured on a single loop.

## What the new columns show of Patrick's faults (today's code, the cm run)

Per academic turn, 30 s:
- **G onset** (smoothed): 1.7-3.3 G/s at most in every turn; 1-5 s a turn over 1 G/s. Lead's own academic roll-in builds about 1 G over his roll.
- **Over Lead's G + 0.5:** 3-25 s of the 30 s (into tight 24.5 s).
- **Aim jumps** (over 25 ft against Lead in one 0.05 s step): 2-137 a turn (into tight 137, into stretched 33, turns away 38). The aim line's turn reaches up to 109°/s before its cap.
- **Wrong-way roll:** 2.9 s into from in position; 1.5-1.9 s into stretched, outside the cone, the reversal.
- **Torque swings** (30 points or more): up to 33-36 a turn (away in position, away tight, into stretched).
- **Time low** (more than 100 ft below the stack): 8-25 s a turn, lowest 240-315 ft, and 7-30 s in the settles after wings level.
- **Energy:** into tight loses 27 kt against Lead for 40 G·s over Lead's G. The turns away lose 4-5 kt for 7-12 G·s.
- **The filter's share of the flying:** 8-48% of a turn.
- **The throttle's owner** changes up to 37 times a turn. The turn's winner flips steering ↔ filter up to 16 times in a wings-level settle.

**The abeam baseline** (Lead turning into him from nearly abeam, 625 ft, 20° swept):
- In the first 10 s #2 banks the same way as Lead 92% of the time (to 52-90° against Lead's 60°): Patrick's "he just matches his bank".
- The filter flies 98% of the turn.
- He ends 49° ahead of Lead's 3/9 line, 302 ft low and 23.5 kt slow.
- The throttle's owner changes 37 times; G onset 3.2 G/s.
- Truly abeam (0-15° at 625 ft) the formation reads "other" and refuses the turn press, so the case sits at 20°, the nearest it accepts.

**Switch wobble** (`ripple.mjs`, 12 traces):
- the filter's line is crossed 132 times, with a 50 ft wobble and no band;
- the power cut's zero-closure line is crossed 42 times;
- idle's band is 0.7 times its trigger's wobble, the boards' 1.0.

## Untested, unseen, unsure

- Nothing flown or seen in the app. No version bump: nothing on screen changed.
- **The thresholds are estimates** (gauge header): 1 G/s onset, 25 ft aim jump, 30° wrong-way, 0.5 G over Lead, −150 ft low, 30-point torque swing. They are measures, never rules in flight code.
- **The rig's tolerance for "holds"** (30% in time, 10 points of overshoot) is an estimate; the shared margins have no time entry.
- **The T2 rig cases** are flown from a straight start with Lead rolling in, so the trim is wherever today's code settles, not the ideal 650 ft on the circle.
- **The `picture` delay mode** reads his position and velocity from the late picture but keeps what he feels (G, bank, speed) as now. It is run-tested only through the code path, not swept across cases yet.
- **The rig's probe time** is the wingman's own clock; the formation's co-simulated drawn path is not used by the rig.
- **The phase-plane view** is not built (deliverable 7).
- **Unsure:** whether "abeam" in Patrick's flight came from a drift during a move already running (where the press check doesn't apply). The gauge's 20° stand-in may not be exactly his case.

## Questions for Patrick (one at a time)

**Q1. What G onset is "smooth, constant and deliberate" for #2 in fighting wing?** Today he reaches 1.7-3.3 G/s in every academic turn.
- (a) About Lead's own academic roll-in, about 1 G/s at most (the gauge's working line).
- (b) Gentler, about 0.5 G/s.
- (c) The aircraft's onset (4 G/s) only when the guard needs it, about 1 G/s otherwise.
- (d) His own number.
- *Recommended:* (c), as round 5's working line in the academic set.

**Q2. Truly abeam (0-15° of sweep at 625 ft) the formation calls #2 "other", not fighting wing, and refuses Lead's turn presses.** Should abeam count as fighting wing for Lead's moves?
- (a) Yes: anywhere behind Lead's 3/9 line within the cone's range counts, so Lead can always manoeuvre (TS-233: Lead never waits for #2).
- (b) No: keep today's band; the gauge's abeam case sits at 20°.
- (c) His own.
- *Recommended:* (a), a formation change for the thread, not this kit.

## Friction for the thread to log

- Observation 0069 again: plain one-command calls and the file tool worked throughout.
- The gauge-trace compare treats arrays as atomic, so per-press summaries can't be added inside `presses`. They went in a new top-level `faults` key. Worth a line in the compare's header for the next agent.
- The gauge's abeam case first ran "refused" with no reason printed: the gauge doesn't print `state.refusal`. A one-line print would have saved a scratch probe.
- Mid-run additions from the coordinator (the report file, the usage-limit note) were easy to fold in because each deliverable was committed as it landed.
