# Fluid manoeuvring jerks: analysis and fix plan (12 Oct 2026)

An Opus agent's read-only analysis for Step 12.3 of `docs/modules/turn-sim/plan.md`, on main at `831d796e` (Standard sequence R from the default start, dry runs in Node, prototypes in scratch copies only). Background for Patrick's rulings, not instructions. Checked by the thread before it went to Patrick: Lead's loop entry and exit are 230 KIAS (`live/fluid-lead.js` FLUID_MOVES.loop, SMM Table 7.1); Lead's downside G is capped at 4 (`LEAD.loopDownMaxG`, the Orders' figure); #2's lift cap follows Lead's G plus 1.5 each step (`live/fluid-wing-live.js`).

## Is Lead flying a rate to exit at 220 KIAS?

Only partly. From the vertical over the top Lead flies the SMM's constant pitch rate (about 17°/s; 1.06 G at 110 KIAS at the top). Nothing picks that rate to give an exit speed, and on the back side the G reaches Lead's 4 G cap and is held. About 10° nose low a separate level-off takes over: he unloads 4 to 1 G (up to 3.1 G/s), sits at 1 G wings level for about 2.3 s, then pulls again 1 to 3 G into the wingover. He comes out at 233-234 KIAS. Going up he is at the stick shaker for about 3 s (61-64 s).

| t after the press (s) | Phase | G | Path pitch rate (°/s) | KIAS |
|---|---|---|---|---|
| 55.2-56.0 | pull, G building at 4 G/s | 1.0 to 3.5 | 0 to 10.3 | 236 |
| 61.3-64.5 | at the stick shaker, up through the vertical | 3.4 to 1.9 | 17.5 | 171 to 124 |
| 67.0 | top | 1.06 | 17.3 | 110 |
| 74.5-78.1 | 4.0 G held (cap) | 4.0 | 16.5 to 12.7 | 204 to 231 |
| 78.1-79.0 | level-off, unload | 4.0 to 1.9 | 12.7 to 4.0 | 231 |
| 79.5-81.8 | wings level, about 1 G | 1.5 to 1.04 | 2 to 0 | 232-234 |
| 81.85-83.0 | wingover pull | 1.0 to 3.0 | to 8.3 | 234 |

Sources disagree, for Patrick to rule: the repo's sources give 230 in and 230 out with back pressure adjusted for the exit (SMM 7.5 paras 10-13, Fig 7.2, Table 7.1; EFIG p.170-171, 3.5 G pull, 100-120 KIAS at the top; SMM 7.12 para 28b allows 200-250); Patrick (12 Oct 2026) says a rate to exit at 220.

A rate loop on our point mass at MAX (prototype on the repo's `stepLead`): 3.5 G to about 70-80° nose up, then about 17-19°/s held and re-set each second; 1.1-1.3 G at the top at 106-112 KIAS (shaker 1.29-1.38 G there). From a 230 KIAS entry it exits at 220.1 KIAS still pulling 4.0 G. The sequence actually enters at 235.6 (the ±15 kt set-up band plus the 5 s wait at MAX); from there the slowest exit at 4 G is 221-225 KIAS, and 220 needs 4.5 G. Either way the last ~60° is at the G cap for 3-4.7 s (estimates).

## The joins

- Loop to wingover, prototyped "flowing": the loop ends at the horizon still pulling, the wingover takes over Lead's nose rate and G, blending 4 to 3 G over about 1.5 s (estimate), no 1 G set-up while in the speed band: G 4.0 to 3.0 at no more than 0.8 G/s, pitch rate 12.9 to 9.1°/s smoothly.
- Wingover to barrel roll: today 3 to 1 to 3 G; the same flow applies. After a 220-225 exit the wingovers end at 212-214 KIAS, below the barrel roll's 230 ±15 band, and the barrel roll then exits about 220 against the SMM's 230.
- Level turn to loop: keep the 5 s wait (TS-198); only the roll-out and pull shapes change.

## Where G and bank can step (`src/modules/turn-sim/live/`)

- `fluid-lead.js` `stepLead`: G held to 4 G/s and 16 G/s² (core `T6A_G_ONSET`) but the G acceleration jumps 0 to ±16 G/s² in one step; no roll onset; a hard shaker clamp. Every Lead controller asks for step targets (level turn, speed set-up, loop pull, held rate, the law switch at 330°, wingover, barrel roll, Terminate, `followNose` at a path's end).
- `fluid.js`: each next controller starts from scratch at a join; a press re-plans from scratch; #2 reads Lead's present step.
- `fluid-wing-live.js`: Lead's turn direction and plane snap once his turn passes 0.1 G; the side swap flips the aim; #2's G cap is Lead's G + 1.5 every step, which drives #2's unload at the loop bottom; aim easing exists only for fighting wing.

| Player | G onset | Roll onset |
|---|---|---|
| Lead, fluid (`stepLead`) | rate and acceleration, the acceleration not built up | no |
| Lead, planned (`flight.js`) | only rolling steeper (8 G/s); vertical pulls use `T6A_G_ONSET` | no |
| #2, live fluid | as Lead | no |
| Fighting wing live (`fw-live.js`) | as Lead | no; 60°/s cap |
| Tracker (`pilot.js`) | rolling in only | yes |

## #2 after the pull-out (13 s round the loop bottom)

| Run | #2 G | Max G change | G reversals | Roll max |
|---|---|---|---|---|
| main | 1.19-4.35 | 1.66 G/s | 6 | 45°/s |
| Lead rate loop + flowing joins | 2.47-4.14 | 1.37 G/s | 7 | 47°/s |
| + onsets + #2's cap eased + aim eased (150 ft/s) + 0.5 s feed-forward | 2.45-4.09 | 0.74 G/s | 3 | 41°/s |

A second-order filter on #2's lift (ω 4 rad/s) made it worse (4.77 G, 1,189 ft); not recommended. Left after the Lead fix: #2's roll wag at Lead's pull (-12° to +2° to -7° at up to 71°/s), his deliberate lag into the loop (about 2 s, then 4.1-4.2 G), and one step as his nose passes straight down where the point mass's up reference flips (inferred). #2 never came inside 500 ft in any run (least 515-532 ft).

## Fix plan (slices), with Patrick's rulings needed

| # | Files | What changes | Should move | Patrick rules |
|---|---|---|---|---|
| 1 | `fluid-lead.js` loop; spec; decisions; numbers.md | Up-pull held under 90% of the shaker; pitch rate chosen to reach the exit speed (re-set each second, changing at most 6°/s², estimate); Lead's G under his cap | shaker margin -0.03 to +0.13 G; exit 234 to 225-228 (220 from a 230 entry) | exit 220 or 230; Lead past 4 G (4.5 gives 220) or a tighter 230 entry |
| 2 | `fluid-lead.js` sequence, wingovers, barrel roll, `followNose`; spec | The next part takes over the nose rate and G; no 1 G pause when in the band | Lead G reversals 9 to 5; no 1 G dwell at the joins; sequence ~7 s shorter | barrel roll entry below its band; wingover and barrel roll exit speeds |
| 3 | `fluid-lead.js` `stepLead`; `flight.js`; `pilot.js` | Build the G acceleration over an onset (est. 0.2 s); roll onset for every player; soft shaker limit; a cap on Lead's roll | G-acceleration steps 16 to 3-4 G/s² per step; Lead roll 118 to 95°/s with a 90°/s cap | Lead's roll rate (TS-37's 90 or ~120); the G onset time |
| 4 | `fluid-wing-live.js`, `fluid.js` | #2's cap falls at most 1 G/s (est.); aim eased in Lead's frame (est. 150-200 ft/s); the turn direction blended | #2 G reversals 18 to 9-15; roll 71 to 33-52°/s; sensitive | feed-forward of Lead's plan, yes or no |
| 5 | `fluid-lead.js` `carryBank`, core `upFrom` | The one-step glitch as #2's nose passes straight down | 4.65 to under 1°/s | none |

Suggested one test for slices 1-2: across the loop's bottom into the wingover Lead's G stays above about 2 G, and the loop exits within ±10 kt of the ruled speed.

Unseen: the browser (the padlock picture); only sequence R, the default 600 ft and one standalone loop; all numbers are scratch-copy estimates, #2's tuning sensitive. The agent's scratch scripts were in the session's temporary folder and are not kept.
