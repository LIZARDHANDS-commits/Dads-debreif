# TRJ + roll: how it is flown (approach, written before coding)

Patrick 6 Oct 16:02Z: a "barrel/lag roll" turning rejoin, #2 does the most efficient rolling aerobatic to get on the line faster; a button next to TRJ; flown only "if it makes sense". 16:05Z: build it, pass to four-ship to verify. Card: "Either, pick quicker".

## Shape
- Lead turns into #2 exactly as the plain TRJ (hand-over.js leadTurnInto, 30° bank, held until #2 is in).
- #2 flies a rolling first part, from the press to a hand-over point on the rejoin line, drawn in Lead's turning frame:
  world = Lead(t) + Lead's heading rotation x (fwd, left) + up. Velocity and acceleration from the world path itself.
  - base: a quintic from #2's place, rate and acceleration now to a point on the line (Lead at the 10:30/1:30, range R),
    moving down the line at closure c with no acceleration in Lead's frame.
  - plus an offset that starts and ends with no rate and no acceleration (angle theta = 2*pi*smooth(u), as lag-roll.js):
    yo-yo / lag roll: up only, (1 - cos theta) * H/2.
    barrel roll: around the base path, (1 - cos theta) * r up + sin theta * r to one side (either side searched).
- Lift, G and attitude from attitude.js (liftOf, poseOf3d); the wings rolled no faster than the T-6A (lag-roll.js wingsToward,
  exported, not copied).
- Then the plain TRJ's own search (turning-rejoin.js searchTurningRejoin) from the hand-over state, Lead's turn seen from that step.

## Checks on the rolling part (each a reference from an existing table, nothing new)
- G within core availableG and at least 0.3 G (LAG_ROLL.minG); roll within the T-6A's (LAG_ROLL.rollMissG).
- Never inside 500 ft of Lead (LAG_ROLL.bubbleFt).
- Energy: the path's speed change plus its climb never asks more than full power (slow-down.js fullPowerKtps) or more slowing
  than idle and boards (slowKtps 'idleBoards'). Geometry first, power as needed.
- Slowest speed: the lag roll's band floor over the top (LAG_ROLL.topKiasBand, 150 KIAS, estimate), not the 200 KIAS floor:
  a roll trades speed for geometry. This is a judgement call for Patrick, on the TS card.

## Choosing
- Search: roll length, hand-over range on the line, closure, height or radius, side. Total = roll + the TRJ from the hand-over.
- The quickest of yo-yo, barrel and the plain TRJ is flown (Patrick's card "Either, pick quicker"). A roll has to beat the plain
  TRJ by more than the chooser's half-second tie; otherwise the plain TRJ is flown and the card says why.
- 2-ship, from line abreast or fighting wing (same as TRJ). Lead's plan is the plain TRJ's.

## Files
- New: live/rolling-rejoin.js. Hooks: chooser.js one planner (options.rejoin === 'roll'), transitions-panel.js one button,
  lag-roll.js export wingsToward (one word). Spec/decisions/future lines after Patrick confirms wording.

## Update after the first dry runs (6 Oct)
- The drawn path (above) fails: from line abreast every path onto the line needs more slowing than idle and boards
  (the speed is fixed by the drawing). Dropped.
- The SMM barrel roll flown as written (fluid-lead.js barrelRoll, back to the entry heading) is far slower: 106-209 s.
- What works: the sim's own flown nose path (fluid-lead.js nosePath / followNose / stepLead, point mass with energy),
  a barrel roll whose nose circles 45° off while the heading swings 30-60° the way Lead turns, 4 G, then the plain TRJ's
  search from the roll-out.
- Dry runs to echelon (total time, plain TRJ search vs best roll):
  - line abreast 5,000 ft abeam: plain 43.5 s, roll 49 s (plain flown)
  - line abreast 2,500 ft abeam: plain 37 s, roll 57 s (plain flown)
  - 1,500 ft forward of abeam, 4,000 out: plain 109 s, roll 49 s
  - 2,500 ft forward, 3,000 out: plain 136 s, roll 47 s
  - 1,000 ft forward, 2,000 out: plain 126 s, roll 52 s
- So the roll makes sense when #2 is hot (swept forward of abeam): the known TRJ fault (110-170 s) is where it wins.

## Built (PR #634, branch claude/project-thread-u65rg0, 6 Oct)
- live/rolling-rejoin.js: 72 rolls (barrel toward/away, yo-yo; swing 30-120°, pitch 20-60°, 3-4 G) flown on the point mass,
  ranked by roll-out promise, full TRJ search on up to 6 (stop after 2 with no gain); lane-keeping rolls preferred.
- Roll poses keep #2's own TAS/KIAS ratio (else he ended 10 ft aft in echelon).
- Chooser races it only with Rejoin kind 'roll' (Patrick 16:22Z: rolls only when their button is pressed).
- Flown results: LAB 5,000 to echelon plain 39 s (roll 47, plain flown); 1,500 fwd/4,000 out echelon 47 s (plain 108);
  to FW 40 s (48); 1,000 fwd/2,000 out echelon 56 s (103). Barrel always wins over yo-yo. Slowest ~140 KIAS in the roll.
- Waiting: Patrick's yes on the TS row wording (card 6 Oct). Four-ship verifies and merges.
