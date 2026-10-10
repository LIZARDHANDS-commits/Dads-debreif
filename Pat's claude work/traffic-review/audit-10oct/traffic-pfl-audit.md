# Traffic and PFL audit, 10 Oct 2026

Read-only audit of main at `4bb266f` ("ANTIGRAVITY - > CLAUDE HANDOVER 10 OCT") against the last cloud PFL merge, v2.10.119 (`affff16`, #619). Nothing was built or changed in the repo. Nothing was looked at on screen.

## 1. The answer first

- **The PFL "segment planner" is not what flies.** The new chain builder, segment stepper and re-planner in `pfl.js` are never called. The aircraft still flies the 5 Oct "middle road" loop: the same join search, the same height-needed sum, and the same steer-to-the-line follower on straights. So the spec's claims that the carrot follower is gone and that Fable's F1, F9 and F16 are fixed are not true yet.
- **Three real gains did land:** the zoom now flies close to its plan and to the NFM table (Fable F7); drag goes out one step at a time, at least 5 s apart (F6); and directs now cross the 2,100 ft gate faster.
- **One start got worse in a way a pilot would call wrong:** a PFL on the inner downwind abeam the threshold in a 269/15 wind now hits the ground 171 ft short of the threshold. On v2.10.119 it landed.
- **Most normal starts now land about 500 to 1,100 ft further down the runway** than on v2.10.119. A few now land past the first third.

## 2. What changed in Traffic since v2.10.119

20 commits touch Traffic, all by Patrick (Antigravity) apart from shared Claude work. Grouped:

| Area | What changed | Commits |
|---|---|---|
| PFL | "Segment planner rewrite" (TR-112), then four fixes: speed trade only on short final below 2,100 ft, zoom-and-turn to the join restored, direct landability and join choice, terminal speed trade and final roll-out | 0473e5b, b39cecd, 367c21c, 0cee168, 94f768d |
| PFL / pattern | Wide Low Key, early gear and T/O flap, Final Key dogleg | 0f395fe |
| Circuit | Straight-in holds 120 KIAS to the Window, then 100 KIAS on final | fb86fa2 |
| Breakout | 140 KIAS full-power avoidance climb; near the runway, straight ahead to 2,500 ft first; then back to the centreline | 3723e1c |
| Envelope gate | `envelope.js`: roll rate from true airspeed, G onset ceiling 8 G/s, bank held under the stall line, for breakouts and the path follower | 5565f572 |
| Pitch | Flaps lower the drawn pitch attitude (T/O flap −1.7°, landing flap −3.3°); pattern aircraft get a gear/flap configuration by phase | 5ff526c |
| 3D | CT-156 cockpit replica in Cockpit and Padlock views; two-tier camera (drone, tower cab, runway padlock); 3D ground no longer jumps when routes are hidden | 3749f40, dda489a, 9b8e722, 1e3d7d4, 17e3ab8, 9b21571 |
| 2D | Bolder route lines, a wind card on the map, the map no longer snaps out when routes are hidden | a53cdf7, 4bb266f |
| Docs | Spec 4.5 item 3 rewritten as a segment planner; plan Step 3 and four Step 4 lines ticked; TR-111, TR-112 added | 0473e5b, 5ff526c |

## 3. PFL: the code against its spec

| # | Finding | Evidence |
|---|---|---|
| P1 | The segment chain is never flown. `buildSegmentChain`, `stepPflSegmentFollower`, `shouldReplanPfl` and `createSegmentFollowerState` are called by nothing. | grep over `src/` and `tests/`; flight loop `pfl.js:1351-1831` |
| P2 | Straights are still flown by steering at the planned line with a cross-track correction (`pfl.js:1580-1585`), and the height needed is still the old `neededFt` sum (`pfl.js:966`). F9's two offsetting errors and F16 are therefore not shown to be fixed. | code |
| P3 | Re-plans: the spec says at the keys or when 300 ft off profile. The code goes direct when the margin is more than 100 ft low after a 5 s settle, and has no 300 ft rule. | spec 4.5 item 3; `pfl.js:1685-1693` |
| P4 | Zoom: `flyZoomT6A` is imported but not called. There are still two zoom models (the plan's and the flight's), but they now agree within about 25-65 ft, and the flight is about 7% above the NFM table (was about 20% in Fable's F7). Good enough to fly; the docs overstate it. | `zoom.mjs` run: 220 KIAS at 3,500 ft plans +962, flies +1,028, NFM table +959 |
| P5 | The plan's zoom starts with 2 s straight and level before the pull. No manual page or ruling is given. | `pfl.js:405` |
| P6 | Push-over speed: the spec's item 5 still says "push over through 140" (EFIG p.408); the code uses 145 (NFM Fig 3-4). Fable's Q4 ("one zoom") was a question for Patrick. | spec 4.5 item 5; `PFL.pushOverKias` |
| P7 | An area PFL that can't make the runway now ejects on the spot at 5,000 ft. Spec item 10 (TR-53) says it glides on toward the runway to Low Key or 3,700 ft, then ejects. | trace I |
| P8 | A latent crash: if a mid-glide hand-over arrives with an "Eject" plan, the code reads `outcome`, `eject`, `notes` and `planLog` before they exist (`pfl.js:1432` before `:1446-1453`), which stops the sim with an error. Not seen in the 30 starts. | code |
| P9 | `pfl-segment-planner.js` is a two-line file that re-exports `pfl.js`, and nothing imports it. | file |
| P10 | Decision number clash: spec section 1 item 6 calls the flap pitch change "TR-106", but TR-106 is already the PFL's aim-a-fifth-down decision. The flap pitch has no row in `decisions.md`. TR-111 and TR-112 were appended after the "Never repeat" list, outside the decisions table. | spec.md line 87; decisions.md lines 117, 205-206 |
| P11 | The flap pitch offsets (−1.7°, −3.3°) and the roll rate per knot (0.45°/s per kt TAS) carry no manual page; they read as estimates and should say so. | `src/core/t6-performance.js:185-190`, `envelope.js` |

## 4. PFL: how it flies (Fable's 30 starts, main against v2.10.119)

Same script both times (`/mnt/project-files/traffic-review/fable-traces/trace.mjs`), no screen. Full output: `trace-main-4bb266f.txt` and `trace-v2.10.119-affff16.txt` in this folder. Touchdown is feet past the 29L threshold; the first third is about 2,430 ft.

| Start | v2.10.119 | main now | Read as a pilot |
|---|---|---|---|
| A. Area, 6 NM, 8,000 ft, 269/15 | lands 1,522 | lands 2,578 | long, past the first third |
| A2. Same, calm | 1,739 | 2,486 | long, past the first third |
| B. Inner downwind abeam threshold, 3,500/140, calm | direct, 969 | direct, 1,836 | fine |
| **B2. Same, 269/15** | **circle, lands 3,255** | **hits the ground 171 ft short** | **wrong: it should make the runway or go direct** |
| C. Perch | 262 | 801 | better |
| D, D2. In the final turn | 249, 43 | 586, 522 | better: no longer at the threshold edge |
| E. Initial, 220 KIAS | circle, 1,398 | direct, 2,947 | long, past the first third |
| F. Outer downwind, 220 KIAS | 1,760 | 1,837 | same |
| F2. Same, 269/15 | direct, 3,414 | circle, 1,823 | better |
| G, G3. High Key button 5,500 / 5,900 | 1,749, 1,760 | 2,223, 2,126 | longer, still in the first third |
| G5. Low Key, 20 kt from 208 | circle, 1,647 | goes direct, lands 518 steep (6.6°), 58 ft off centreline | wrong: an on-profile Low Key should stay on the circle |
| G6. Low Key 600 ft high | 2,587 | 2,475 | same |
| Low Key, −30 °C | circle, 1,461 | goes direct, 2,602 | wrong: a cold day should fly the same profile (TR-77) |
| H2. High inner downwind 4,600 ft | 1,050, gate 97 KIAS | 1,739, gate 109 KIAS | better |
| I. 8 NM, 5,000 ft | glides, ejects at 3,700 | ejects at once at 5,000 | against TR-53 (P7) |
| I3. Final 2 NM, 2,500 ft | ejects | ejects | same |

Touchdowns are all about 89-97 KIAS and in line with the runway. Gate speeds on directs are higher than before (fewer slow gates).

Main's CI run on `4bb266f` is red (memory: CI is paused and not a blocker until Patrick says).

## 5. The rest of Traffic, as a pilot would read it

- **Breakout (3723e1c):** 140 KIAS full-power climb, straight ahead to 2,500 ft near the runway, bank capped at 45° there. Reads right; matches Patrick's 6 Oct words. Unseen.
- **Envelope gate (5565f572):** sound in principle: physical limits only, nothing held at a published limit. Roll rate per knot is an estimate (P11).
- **Pattern configuration by phase (5ff526c):** downwind below 147 KIAS shows gear and T/O flap; every final turn shows landing flap. Worth Patrick's look: at Moose Jaw is landing flap normally taken in the final turn or after roll-out? A climb-out below 110 KIAS shows "T/O flap" with the gear up, a label the PFL code doesn't use.
- **Straight-in 120 KIAS to the Window, 100 on final (fb86fa2):** matches TR-R10. Unseen.
- **Plan ticks:** Step 3 and four Step 4 lines were ticked, including "Screen verified clean". AGENTS.md says done means Patrick has seen it working; these should say "unseen" until he has.

## 6. 3D: where it stands

- **Built:** CT-156 model (ui-kit, side profile from Patrick's 156101 photo), the new cockpit replica (front and rear), base buildings as boxes on photo footprints, radar dome, raised runways with 29L paint and the grey runway, landmarks (Window Farm and pigs, Sukanen Ship, Fiat Farm, Arrow tree rows), windsocks, approach marks, ejection seat and parachute, and the two-tier camera.
- **Rivers (TR-70):** the Moose Jaw River and the south creek are a 400 ft wide, 15 ft deep valley (both estimates) along centrelines traced by eye to about ±150 ft. They show only on High; Performance, the default, shows the flat photo. There is no water surface, and the trace follows the valley, not each meander. Nothing on any branch carries newer river work. If Patrick has river work on his PC that isn't pushed, it isn't on GitHub yet.
- **Open in the plan:** Dad's landmark questions, Patrick's landmark sign-off, and the rule that every 3D model sits on its photo footprint and is freed when 3D is switched off.
- **Rule book:** "The 3D view is a bonus: no more 3D polish in a module still being built." Traffic's sign-off is still open, so new 3D models need Patrick to move them into the plan first.

## 7. Proposed plan (nothing built until Patrick rules)

1. **PFL, one PR (Opus):** fix the regressions against v2.10.119: B2 short of the runway, G5 and the cold Low Key going direct, area starts landing past the first third, and P7 (glide to Low Key before ejecting). Fix P8. Then either wire the segment chain in or delete the unused code, and make spec 4.5 say what actually flies. Checked with the same 30 starts; one test (B2 makes the runway).
2. **Docs, same PR:** fix the TR-106 clash (give the flap pitch the next free number, TR-113), move TR-111/112 into the table, mark P11's numbers as estimates, and change "Screen verified clean" lines back to unseen until Patrick looks.
3. **Patrick on screen:** the default Busy circuit, a PFL from downwind, base and upwind, a breakout, and the new camera and cockpit, against a checklist in his words.
4. **3D, after his yes:** finish the rivers (Patrick's call what "finished" means: water surface, traced to the channel, shown on Performance too), then a list of new models for him to rank.

## 8. Questions for Patrick, in order

1. How to take the PFL forward: fix the regressions in today's loop and make the docs honest (recommended), finish the real segment planner, or roll `pfl.js` back to v2.10.119 and keep only the zoom and drag-spacing gains.
2. What "finished rivers" means.
3. Which new 3D models come first.
4. Landing flap in the final turn, or after roll-out, for pattern aircraft.
