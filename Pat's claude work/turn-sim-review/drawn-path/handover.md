# Handover: drawn paths to point mass (Formation, 6 Oct 2026 23:00Z)

Written by the four-ship thread when Patrick stopped the work to save tokens (22:59Z: "leave a handover on how to fix the drawn path/point mass thing"). Main is at V2.167. Nothing on this list has been started in the code.

## The problem
Some wingman moves plan #2's *position* first (a "drawn path") and work out his speed afterwards, from the path's own shape. The speed is then whatever the geometry implies, not what the T-6A at that power would really do. Other moves fly the aircraft model forward: the tracker, both rejoin laws, the rejoin rolls (`rolling-rejoin.js flyRoll`) and all of Lead's manoeuvres. In those, power, drag, G and gravity produce the speed, so they are physical by construction.

## Evidence: the lag roll (Patrick asked "shouldn't they come out with the same answer?")
I flew the lag roll's own nose path (V2.167) on the T-6A point mass at full power, from the same start. The case was Instructor: echelon, then fighting wing, then the lag roll. Script: `lagpm.mjs` in this folder.

| | Drawn (V2.167) | Point mass, full power |
|---|---|---|
| Roll time | 17 s | 13 s |
| Slowest | 178 KIAS | 188 KIAS |
| End speed | 200 KIAS | 220 KIAS |
| Ends | 837 ft back | 543 ft back (level with the slot) |

Verdict: the drawn path breaks no limit, but it is too pessimistic. The V2.167 checks only stop it from speeding up faster than full power gives, or slowing faster than idle with the boards gives. Losing more speed than needed passes, so the drawn roll is in effect flown with the power partly back. At full power he ends in position.

Patrick's rulings for the lag roll:
- TS-143: start front/high in the cone.
- TS-144: full power the whole time; may land at the bottom of the cone; in the band counts as in position.
- TS-146: lower apex OK, and a flat nose-up (about 15°) is fine "as long as it's physically realistic".
- The roll starts in the cone.

## Fix 1: lag roll on the point mass (do first)
Only in `src/modules/turn-sim/live/lag-roll.js`, plus LAG_ROLL numbers in `moves.js`. Copy the pattern of `rolling-rejoin.js flyRoll`:
- Keep the set-up phase (TS-143): drawn smooth move to the cone's front corner and top, from fighting wing only.
- **The roll:**
  - start from `fluid-lead.js leadStateOf(wing-at-roll-start, blockFt)`;
  - each step, `r = followNose(st, path, mem, pullG)` then `st = stepLead(st, { g: r.g, bank: r.bank })`. No `holdKias` means full power, held under the shaker, at the T-6A's roll rate;
  - the poses come from `attitude.js poseOf3d({ x, y, altAbove: st.pm.z - blockFt, vel: st.vel, up: st.bodyUp, kias, g: st.g, rollDps: -st.rollRate })`, with `pwr = 1`. Keep `att`, so the roll draws smoothly (V2.159).
- **Nose path** (`nosePath(u => noseAt(heading(u), pitch(u)))`): up, rolling toward Lead, over his six inverted (lift toward Lead at the top), down into the cone on the other side, with the nose back near Lead's heading and level. Search a small set: heading swing, nose-up (15-45°), circle offset, and pull 2.5-3 G (LAG_ROLL.pullG).
- **Checks:**
  - never inside 500 ft once outside;
  - G at least LAG_ROLL.minG;
  - inverted over the six;
  - slowest at least LAG_ROLL.topKiasBand[0].
- **Pick:** the roll that ends in the fighting wing band (50 ft and 5° inside its far edges, any height down to the cone's bottom) soonest. If none does, take the nearest and close into the band (today's `fc` close-up).
- Keep `planLagRoll`'s return shape, so formation.js and the screens don't change.
- Check: `lag.mjs` (one run) and the flight set `fset.mjs` as a crash check. Add decision row TS-147, "(wording not yet confirmed)".
- Size: one Opus agent, medium effort, about one sitting.

## Fix 2: the lines (biggest remaining drawn path)
`hand-over.js lineRunIn` and `kinematic-moves.js` fly the first part of most station changes and the opening out, before the tracker takes over (the hand-over itself is smooth, measured 22:47Z). Today:
- the line is held to full power where it asks for more (`full-power.js holdToPower`, shown STRETCHED);
- nothing stops it slowing faster than idle with the boards (`kinematic.js speedNeeds` / `labelStages` only label the stage);
- the opening-out lines also show short boards blips from those labels (seen with `jerk.mjs`).

Two ways:
- **a. Cheap (recommended first):** add the slow-down twin of holdToPower. Where the path asks to slow faster than `slow-down.js slowKtps('idleBoards') + climbKtps`, stretch the time law there, the same way holdToPower stretches for speed-up. Give labelStages a hold of RATE_SET_SEC, as TS-145 did in `pilot.js`.
- **b. Full:** retire the line part and let the tracker (one pilot model, `pilot.js`) fly the whole move with the line's points as its aim. Fable's step 5 already did this for echelon to fighting wing and the opening out (`echelon-to-fw.js`, `open-out.js`). The station changes in `line-moves.js` are what's left. Check that each still meets the 40 s rule to fighting wing.

## Fix 3 (low value): small drawn holds
`formation-turns.js planCloseTurn` (`heldPoses`) and `replan.js` (`slideInPlane`) hold #2 in Lead's wing plane within a few feet. These are physically small; leave them unless they show on screen.

## Fluid manoeuvring wingman
`fluid-wing.js` + `full-power.js flyFluidStep`: the point he flies to is drawn, but his speed already comes from energy height at full power (TS-74, V2.69). It's half physical. Look at it only if Patrick sees a problem.

## Files here
- `lagpm.mjs`: the drawn path vs point mass comparison above.
- `lag.mjs`: one lag-roll run.
- `jerk.mjs`: jerk, roll acceleration and power-stage changes on seven 2-ship changes.
Usage: `node <script> <repo root>`.

## Rules to carry (from AGENTS.md and Patrick)
- No dry runs beyond a crash check (21:37Z).
- Never change the flight physics to pass a check.
- Geometry first, power as needed; the lag roll is at full power.
- No bank cap in formation; only physics limits.
- Any change to fighting wing within 40 s.
- The whole cone counts as in position.
- No roll snaps.
- Merge with the badge at main + 1; send the tag line to the coordinator.


## Update 6 Oct
Both fixes are DONE: V2.168 (#673, TS-147) lag roll on the point mass; V2.169 (#675, TS-148) line slow-down check and stage hold. Left: "tracker flies the whole move" (medium, line-moves.js), not started.
