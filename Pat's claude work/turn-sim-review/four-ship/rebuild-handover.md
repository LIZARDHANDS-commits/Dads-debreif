# Four-ship rebuild: handover for the fresh thread (refactor PRs 6-8)

Written by the Formation Sim thread, 6 Oct 2026 about 00:00Z. Patrick tapped "Yes, fresh thread" at 23:57Z.

## Start when
V2.93-V2.96 (refactor PRs 2-5) are on main. Before then the turn-sim files are still changing under the Formation thread (one writer per file). Branch from main after V2.96 merges.

## Read first
1. AGENTS.md, then docs/modules/turn-sim/ (README, decisions TS-93..TS-97).
2. /mnt/project-files/turn-sim-review/refactor-plan.md (the "Then: 4-ship" section).
3. /mnt/project-files/turn-sim-review/chooser/plan.md section 20 (Fable's diagnosis and the five changes).
4. /mnt/project-files/turn-sim-review/four-ship/moves-from-the-manuals.md (the RATIFIED moves table, Q1-Q6 answered 23:03-23:04Z).
5. /mnt/project-files/turn-sim-review/formation-sim-handover.md.

## What exists after V2.96 (use it, don't rewrite it)
- live/flight.js gateRoll (TS-93): roll, G onset (4 G/s normal, 8 G/s ceiling), stall. The four's pose tracks (lineFirst/poseTrack in four-ship-moves.js) still bypass it: that's where the 80-90 G/s onsets come from.
- live/chooser.js candidateOf: one candidate shape (TS-94). Planners: turning-rejoin.js, straight-rejoin.js, echelon-to-fw.js, open-out.js, line-moves, replan.js planFromHere, lag-roll.js.
- turning-rejoin.js flyToDecision({ wing, rec, ... }) flies a wingman against ANY recorded reference `rec` (not only Lead): usable per link. flyWith builds Lead's turn with leadTurnInto internally; a per-link version needs `into` passed in (Lead's real turn held until #4 is in).
- tracker.js runTracker/trackTwice take refs = { id: recordedFlight }, so tracker legs already work per link. FW_FOLLOW phases carry coneAlt (TS-96): on the power profile the tracker manages FW energy with the cone's height. FW_FOLLOW_FOUR does not have it yet.
- events.js (TS-97): a change with plan.holdsPlan skips the re-plan events. startChange sets holdsPlan for every 4-ship change today; item 4 of section 20 (mid-press re-plan in the four) means clearing that for the four's plans that can re-plan.
- live/rates.js / bands.js / moves.js: the numbers (TS-95). docs/modules/turn-sim/numbers.md lists them.

## Baseline, measured on main V2.91 code (scratch four5.mjs below), Instructor rates, default start
| Change | Time | Lowest KIAS | Max G | G onset | Max roll | End |
|---|---|---|---|---|---|---|
| Spread 4 -> fighting wing | 291 s | 94 | 8.3 | 85 G/s | 117 | IN POSITION |
| fighting wing -> finger | 86 s | 184 | 3.0 | 11 | 104 | IN POSITION |
| finger -> echelon | 55 s | 189 | 2.0 | 2.6 | 104 | IN POSITION |
| echelon -> box | 80 s | 192 | 2.0 | 2.6 | 103 | IN POSITION |
| box -> trail | 104 s | 191 | 2.0 | 2.7 | 102 | IN POSITION |
| trail -> route | 94 s | 198 | 2.0 | 2.7 | 103 | IN POSITION |
| route -> finger | 15 s | 200 | 2.0 | 2.7 | 102 | IN POSITION |
| finger -> Spread 4 | 287 s | 155 | 12.1 | 82 | 133 | IN POSITION |
| Spread 4 -> Fluid 4 | 372 s | 94 | 8.8 | 85 | 754 | #2 OFF STACK |
| Fluid 4 -> offset box | 187 s | 186 | 8.5 | 87 | 741 | IN POSITION |
| offset box -> Spread 4 | 528 s | 94 | 8.5 | 100 | 145 | #2 AFT |
| Spread 4 -> fighting wing (2nd), fw -> echelon, echelon -> Spread 4 | REFUSED: "#3 could not settle in its place inside 8 minutes" |

The formation key for line astern in the four is `trail` (not `astern`). The 2-ship's turning rejoin does line abreast to fighting wing in 29 s.

## The script (copy to your scratchpad)
```js
const W = process.env.WT ?? '/home/user/Dads-debreif';
const L = W + '/src/modules/turn-sim/live';
const F = await import(L + '/formation.js');
const T = await import(L + '/tuning.js');
T.setRates?.('instructor');
const DT = 0.05;
function run(f, to, label) {
  const t0 = f.state.tSec;
  const r = f.change(to, {});
  if (r !== 'started' && r !== true) { console.log(label, 'REFUSED', f.state.refusal); return; }
  let minK = 999, maxG = 0, maxRoll = 0, maxOn = 0;
  let prev = f.state.aircraft.map((a) => ({ bank: a.bankDeg, g: a.g }));
  while (f.state.current && f.state.tSec - t0 < 600) {
    f.step();
    f.state.aircraft.forEach((a, i) => {
      if (i === 0) return;
      minK = Math.min(minK, a.kias); maxG = Math.max(maxG, a.g);
      maxRoll = Math.max(maxRoll, Math.abs(((a.bankDeg - prev[i].bank + 540) % 360) - 180) / DT);
      maxOn = Math.max(maxOn, (a.g - prev[i].g) / DT);
      prev[i] = { bank: a.bankDeg, g: a.g };
    });
  }
  console.log(label, Math.round(f.state.tSec - t0), 's', Math.round(minK), 'KIAS', maxG.toFixed(1), 'G', maxOn.toFixed(1), 'G/s', Math.round(maxRoll), 'deg/s', f.state.judged?.labels?.join(','));
}
const f = F.createFormation({ ships: 4 });
let from = 'spread4';
for (const to of 'fw,finger,echelon,box,trail,route,finger,spread4,fluid4,offsetBox,spread4,fw,echelon,spread4'.split(',')) { run(f, to, `${from}->${to}`); from = to; }
```

## The design idea I was starting on (not built)
- Rejoins from Spread 4 / Fluid 4 / offset box (M11, M16, M22; Q5 direct to finger or echelon allowed): Lead turns into #2 at 30 deg, held until #4 is in. #2 flies the 2-ship turning rejoin (planTurningRejoin's flyWith) against Lead. #3 and #4 go full power toward Lead's turn circle and rejoin on the outside one at a time (Patrick 05:34Z), each flying flyToDecision against Lead's recording toward its place in Lead's frame (four-ship-moves.js inLeadFrame), gated on the one ahead being in, then the tracker settle onto its real reference (FW: #3 off #2, #4 off #3). Stacks held as separation (AFM8 p.18 item 6).
- Opening out to Spread 4 / offset box: open-out.js's full-power held planner per wingman, off its own reference.
- Close changes: keep the shapes and gates; put them on the close rate set.
- Retire the EDGES graph and lineFirst pose tracks once every move has a home (list what each did first, rule book Building).

## Standing rules for every Formation brief (from memory)
Manoeuvres match the manuals (ask Patrick when sources conflict); form uses geometry; fighting wing uses the whole cone; cone first, S-turns, power last; FW rejoins never below 200 KIAS, extra into height; keep it simple and get to testing; no new tests (dry-run sims only); one version bump per PR; Fable reads each PR before merge (via the coordinator); every merge titled "Formation V2.xx: ..." with a tag name sent to the coordinator.
