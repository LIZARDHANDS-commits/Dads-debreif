# B5 code review (plan card `CR`), 17 Oct 2026

Read-only review of the whole B5 change (`a02010fb^..ee33c10f`, V2.515, about 46 files) against `AGENTS.md`, spec 7a and 7e, TS-233, TS-234, `control-model.md`, `numbers.md` and the Fable findings D1-D26 / R1-R15 in `b5-assumptions-decisions-log.md`. Reviewer: one Opus agent, high effort, no edits. The thread checked F1-F4 against the code before acting on them.

## Done on branch `formation-b5-review` (17 Oct 2026)

| Finding | What was done | Commit |
|---|---|---|
| F1 Live default had no ruling | Patrick 17 Oct 2026: "Keep Live, I said yes". Recorded as TS-235; plan T28 and spec 7e's slice note updated | `a4eefb32` |
| F2 screen showed Old pressed while Live flew | The "#2 in fighting wing" switch starts on Live; hint rewritten | `a4eefb32` |
| F4 escape above at any height above Lead | Guard, miss and lag-abeam now go above only when more than 100 ft above Lead (`FW_WING.yoyo.highFt`, TS-233). Gauge `b5-` set, 27 cases: identical before and after | `e139ec78` |
| F5 bubble kisses | Accepted as physics by Patrick: TS-236, spec 7.8b note | this commit |
| F3 TS-202's test widened to 400-1,100 ft | Retired at Patrick's word (17 Oct 2026: "you can just get rid of that test"); recorded in `docs/modules/turn-sim/testing.md` | `5facd2c4` |

## Still open

**Closed by ruling**
- **F5 Bubble kisses on hard turns into #2: accepted, TS-236** (Patrick 17 Oct 2026: "I'm fine with those as it is. abem lead is outsiode of the cone anyway & if you're right he turns in to you by definition/physics you kiss the bubble"). The cases: `b5-into-abeam` 229 ft (8.8 s inside 500 ft), `b5-into-tight` 379 ft (4.8 s), `b5-hard-into-tight` 330 ft (4.4 s). Don't tune or chase them. Not shown to Patrick, so not covered by the ruling, but the same kind of case: `b5-hard-into-in-position` 436 ft (2 s) and `b5-hard-4g-into` 374 ft (2.3 s, ending 1,299 ft, outside the cone 30 s after wings level).

**Should-fix**
- **F6 The rig measures a different law from the one that flies.** `fighting-wing.js:267,394,425,427`: four `!w.probe` branches switch off the 10° line cap, the 0.20 G level-turn cap, the ±65 ft height clamp and the −0.45 G floor under the rig. The rig also shows the arc loop at 1.43× the asked closure and the offset at 1.25×.
- **F7 The 0.20 G level-turn cap also binds S-turns, exit-vertical and moving-out** (`fighting-wing.js:394-397`). S-turns turn about 1°/s.
- **F8 A technique-to-technique switch steps the reference in one tick** (`supervisor.js:385-399`, `fw-reference.js:74-88`; TS-234 rule 1). The 1.5 s height-blend entry is shorter than D5's ≥4.3 s.
- **F9 About 80 inline flying numbers are not in `FW_WING`, `numbers.md` or the ledger.** They sit in `fighting-wing.js`, `separation.js`, `miss.js`, `yo-yo.js`, `lag-abeam.js` and `wingman.js`. Some change spec'd behaviour:
  - a 60 ft "stretched away" drop
  - an 80% floor on the 1 G hold
  - speed brake gated on 2.2 G / 62° / 5 kt
  - the guard horizon cut to 2.5/3.5 s
  - predFt floored to 600 in level flight
  - the miss cue window 3-4.5 s against D4's 3-10 s
  - the into-turn branch of the turn bound is dead
- **F10 `tools/control-map/tables.mjs:53-64` `sourceOf` keys rows by leaf name,** so wrong sources show in `control-model.md`.
- **F11 `control-model.md` and its SVG are stale** (`draw.mjs --check` exits 1).
- **F12 Second copies of formulas.** The throttle re-derives `power.js`. `1/cos` is used where core has `gFromBankDeg`. The height-rate profile is written six times. `32.174` is typed out instead of `G_FTPS2`.
- **F13 Nine table numbers no code reads** (`arcNearFt`, `aimSlewFtps`, `yoyo.exitArcFt`, `yoyo.onCircleFt`, `brakes.idleFtps`, `brakes.idleOffFtps`, `guard.passLineSec`, `lagAbeam.bankCueDeg`). `lagAbeam.maxSweepDeg` (20) is overridden by an inline 35°.
- **F14 lag-abeam's usual "below" case** holds heading at 0.25 of the circle's turn rate, where the T3 card says a lag path to 650 ft behind Lead.
- **F15 `errors.js:736`** returns #2 to his own end speed, under the name `leadKias`, with no decision row.
- **F16 Spec 7.10 gives techniques `cue/plan/monitor/done`;** the code has `assess/plan/step`.

**Nits**
- **F17 File headers that don't match their code:** `fighting-wing.js`, `separation.js`, `supervisor.js`, `perception.js`, the `check.mjs` banner.
- **F18 Dead state:** `sTurn`/`quick`, the yo-yo's `doneHoldSec`, the trace's `yoyoFt`, the S1 bridge fields.

**Note**
- **F19** The close formation's own law is unchanged by B5. The gauge's mid-turn reversal is 0.21 ft worse fore-aft than its baseline (cause not traced).

**Also seen by the thread:** `formation-moves.test.js`'s two other `setFluid({ fwWing: 'live' })` tests are the same no-op. They flew the old law until V2.515 and now fly Live by default.

## D1-D26 and R1-R15

- **Closed:** D1, D2, D3, D7, D9, D10, D11, D12/D23, D13, D14, D17, D18, D21, D22, D25, D26; R1-R5, R10-R13.
- **Partial:** D4 (cue window), D5 (F8), D6 (yo-yo has no done dwell), D8 (F9), D15 (inline numbers), D16 (fixed by F4), D19 (rig only), D20 (80% hold floor), D23 (F12), D24 (60 ft drop); R6, R7, R8 (two Lead models), R9 (predFt floor switch), R14 (lag-abeam's 35°).
- **Open:** R15 (Checkpoint G).

## Gates

| Run | Result |
|---|---|
| `check.mjs` in the repo | exit 1 (needs gauge traces in `tmp/gauge`) |
| `check.mjs --tag cm` after a gauge run | exit 0, 28 traces, 86/86 columns |
| `draw.mjs --check` | exit 1 (F11) |
| `fw-rig.mjs` and `turn-sim-numbers.mjs` | output identical to what is committed |

No unit tests were run locally (AGENTS.md). The app was not looked at in a browser.
