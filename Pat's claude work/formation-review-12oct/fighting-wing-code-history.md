# Fighting wing on the live wingman: how the code came to be (13-14 Oct 2026)

Written by the T29t tidy (plan B5, Patrick 14 Oct 2026: "Tidy first, then round 5"). The tidy took the round-by-round story out of the code's comments, removed the options that flew worse, and folded away the switches that were always on. This note keeps what they said and did, keyed by commit, so nothing is lost. It is history, never instructions: the rule book, spec 7e and TS-233 win. Gauge tags (r4f7, r4sf and so on) are the thread's and builders' runs of `node tools/formation-gauge.mjs --only b5- --fw live --tag <tag>`; their numbers are quoted from the commit messages.

The code today: `src/modules/turn-sim/live/wingman/fighting-wing.js` (the technique), `separation.js` (the guard and the filter), `supervisor.js` (`fwJob`, the jobs), `perception.js` (`seeFw`, the sight), numbers in `live/wing-moves.js` `FW_SEE` and `FW_WING`.

## The tidy (T29t), flying unchanged

Every commit was checked the same way: every default gauge trace (Held and Live close formations, fluid, the rejoins, the Old fighting wing law) and every `--fw live` b5 trace unchanged (`gauge-trace-compare.mjs`: "all unchanged"; byte-identical in fact), the gauge text identical with the press timings taken out, and the 4-ship probe's hashes the same (`four-ship-probe.mjs`: 2d5b5a8020839796 with default options and with fwWing 'live'). The check was first shown to catch a deliberate change (FW_WING.gPerDeg 0.05 to 0.06: nine b5 traces DIFFERENT), then reverted.

| Commit | What |
|---|---|
| 1b395b73 | The four options that flew worse removed (below) |
| 03c392e2 | The eighteen always-on switches folded away; FW_WING grouped by part, every number with its source |
| f216afa1 | The guard, its predictor and the filter moved to `separation.js` |
| e670229f | `stepFwWingman` split into named parts; the filter split into its judge, its engagement and its turn search |
| the commit after | `numbers.md` regenerated (FW_WING's rows were not in it before); eight FW_WING numbers given their own source line; this note |

FW_WING went from 103 numbers, 22 on/off switches and one null (yoyo.maxFt) to 92 numbers and no switches. `stepFwWingman` went from one 582-line function to a 57-line step calling 22 named parts of 3 to 23 lines; the filter from a 180-line closure to four functions of 9 to 48 lines.

## The rounds

**T28, 9ab5a0e4: the sight and the separation guard.** Fighting wing's own sight (0.4 s late, Patrick 14 Oct 2026) and a guard that predicted the pass 5 s ahead (Lead as he is and 1.3 times tighter, #2 holding his turn). Engaged under 600 ft predicted, it flew the manual's sequence for a turn into #2: the miss (aim at where Lead was 1 s ago, power off, the vertical below Lead unless already 20 ft above him), then the reversal onto Lead's circle (aim at Lead) once the line of sight rose 2°/s over its least, with aspect under 90°, the pass outside 600 ft and closure under 15 ft/s. Released over 700 ft for 3 s. Gauge: least slant 533 to 652 ft in position, 394 to 472 ft from tight.

**T29, 06196de8: the first full technique, stopped after two tunings.** The jobs, an aim loop by range and closure, the swept place, a power PI and the quick fix. It flew worse than T28. The causes the thread found: (1) he pulled 3.5 G while rolling up to 160° in the guard's reversal, so the pull lifted him 650 ft above Lead and cost 33 KIAS; (2) the aim offset, the quick fix and power each added closure, reaching 47 ft/s, so the guard re-engaged 6-11 times a turn; (3) on the inside of a 60° turn at 200 KIAS #2 can't hold Lead's speed at his higher G (Fable F11).

**T29a, d4ae55f9: unload, roll, pull; one owner for closure; low inside at MAX.** He pulls only the lift's share along his wings while they are more than 20° off where the lift is wanted (as `fw-live.js`). In a turn, power serves only what the aim can't give (no integral there). Patrick's ruling "Drop low inside, MAX" (TS-233): short of energy in Lead's turn, 300 ft low at MAX.

**The thread, b60a4a2b: the separation filter, the arc range, Lead's circle.** The guard's miss aimed at where Lead was 1 s ago, which at a turn's start is still on Lead's old straight track, about 80° off #2's nose: he pulled 3.5 G at 90° of bank across (HCA 66-70°) and opened at over 200 ft/s to 1,500-3,800 ft. The manual says turn *slightly* toward Lead (SMM 12.29 Fig 12.20). So the guard's miss became a separation filter (`guard.filter`): his aim's turn unless its predicted pass comes inside 600 ft, then the nearest turn that keeps it outside. In a turn the range became the signed arc behind Lead (slant range can't tell behind from ahead: on a circle inside Lead's, the slant loop kept him inside past the 3/9 line, aspect 127°). He follows Lead's circle (`followCircle`), aiming at the point on it 3 s ahead, instead of Lead's place moved d inside (which cut across from inside). Notes: `b5-t29a-tuning-14oct.md`.

**Round 3 (stopped B5 agent, Fable's second review `fable-cone-turn-report-14oct.md`), each behind a switch:**
- 04ce6768 F5 `deadReckon`: Lead carried 0.4 s ahead round his turn before anything uses him; his own state as he knows it now. Into stretched ended the turn 1,398 ft (was 2,596).
- 31d304e6 F2 `guard.shakerBound`: the filter's turns stop at the stick shaker at his speed. No b5 case changed (the shaker never bound).
- d5bef644 F3 `guard.sharedLift`: the filter searches with the G his vertical leaves and counts that vertical's height in the slant. Turns away ended 621-623 ft (were 709-729), aspect 37° at most; but the filter switched on and off more (13 job switches).
- 26461ad3 F4 `guard.passLine`: the pass line 500 ft + 1.4 s × closure, at least 600 ft. Outside the cone least 704 ft (was 607).
- 0a48470d F10 `arcFrame`: (s, d) in Lead's turn-centre frame, closure from the velocities, continuous through wings level. The reversal ended 623 ft (was 1,029).
- 17f32caa F1 `arcLoop`: d = R (1 − V2/V_L) plus the wanted closure's shortfall over Lead's turn rate, wanted closure (s − 650)/10 s within ±25 ft/s near and ±60 far, d within ±400 ft, slewed 60 ft/s. The turn into him from in position still ended ahead of the 3/9 line (aspect 140°), 41 kt slow.
- 2380ce07 F7 `pathCaps`, built and off (below).

**Round 4 (a fresh Opus builder, then audited and merged, V2.433 bf101553):**
- 4251723f F6 `guard.wingLine`: the filter's second constraint, at least 100 ft behind Lead's wing line over the look; range wins when both can't hold, and the wing line out of reach is logged (lineShort). Alone it couldn't stop the gain inside Lead's turn.
- f0cfac10 F8/F9 `yoyo.on`: the high yo-yo (Patrick's card "High yo-yo, then back down") and the pitch owners' order. Aspect into in position 92° (was 137), but the speed went (−59 kt): power off all turn while the filter was on.
- 1268e5f9 `guard.offClosingOnly`: power off only while closing. Into in position −50 kt (−59).
- 050968a8 `guard.tighterAtMin`, built off; the trace logs the filter's turn against his aim's (omNomDps, omPickDps). They showed the cause at the turn into him: his aim asked a turn toward Lead's tail, and the filter, judging each turn held 5.4 s, turned him hard into Lead's turn instead.
- c67dc04e `guard.capture`: each candidate turn held 3 s, then Lead's turn. The reversal ended 678 ft.
- 4db3ca78 `behind.on`: the nose behind Lead, in and down, when the wing line binds (Patrick's ruling); `behind.onCircle` off (below). Into in position never past the 3/9 line (57°), but the turn toward Lead's tail ran on to 78° of HCA, out to 2,970 ft; least slant 453 ft for 1.2 s.
- f379224d `arcFeedForward`: the half-gain fix (the research's trap: d = d_ss + (wanted − closing)/ω settles at half). Away stretched passed.
- 32359104 `lagFirst.on` and `guard.lineShortAll`: lag first, 20° outward of Lead's circle for 2.5 s, eased over 1 s; the wing line out of reach only when no turn at all keeps him behind it.
- b1261ec6 `aimTurnCap`: the aim line's turn fed forward within 1.5 times Lead's turn rate plus 3°/s (a change of aim made the line jump, read as a turn of up to 115°/s, which the filter judged held 3 s).
- fe258241 `guard.engage`: the filter stays engaged until his aim clears both lines by 50 ft for 1 s. The flying identical; job switches 4 (8), 2 (7), 4 (8), 4 (6), 3 (9), 2 (12). It changed the job label, not the flying. `holdsPower` off (below).
- 794e5a7e `yoyo.excessFtps`, `yoyo.maxFt`: the yo-yo sized to the cone's height band (Patrick: no 400 ft cap, "as long as wg stays in the cone anything is permissable"), set off only when gaining, over once opening.
- fed616aa `guard.tighterAtMin` on: at the arc target, Lead one step tighter kept the predicted pass just under the 600 ft line, the filter on and power off (away in position −42 kt to −15).
- 2f96613f `speedFf`, built off (below).
- 2423fc47 `brakes`: idle and the boards (Patrick's ruling), with `stepLead`'s optional `ask.boards`. First thresholds stretched him after (away in position 1,232 ft and opening), so raised.
- 9e5c860f `guard.lagSide`: the lag side before the inside in Lead's turn. Into tight unchanged (2,429 ft, aspect 93): he starts inside the pass line with Lead still level, so the filter's escape is the hard turn away from Lead, to the side Lead then turns to; two tries changed nothing; the cause was reported, not tuned.
- 75f3163f `pathCaps` re-tried, still off (below).

## The four options that flew worse (removed, 1b395b73)

- **`pathCaps` (with `pathOutDeg` 20, `pathInDeg` 12, `pathOpenFt` 1,000, `pathCloseFt` 800; Fable F7).** The angle of his line to the circle's look-ahead point, off the local tangent, capped at +20° outward (steer-behind) and −12° inward (steer-ahead); in round 4 the inward cap opened beyond 1,000 ft of arc behind, eased back by 800 ft (Patrick: very stretched he may cut across). Off since round 3: with the caps the cases starting far behind or outside could not close against an offset up to 400 ft inside (r7-F7: into stretched 3,797 ft, away tight 3,023, outside the cone 3,170, against 2,215, 1,276 and 670 without). Re-tried in round 4 (r4f7 against r4ls4): away stretched passed (599 ft, 2 job switches), but away tight and the reversal gained job switches (4, 5) and away in position kissed 585 ft. **Note:** TS-233 records Patrick agreeing the 20° steer-behind and 12° steer-ahead caps; with `pathCaps` gone, only lag first's 20° carries the steer-behind, and nothing caps the steer-ahead.
- **`speedFf` (with `speedFfKt` 15).** In a turn, the speed that holds station at his offset, V_L (1 − d/R), fed forward to power, its change from Lead's speed held within 15 kt by an arctan (research: CNATRA P-357 section 310; Wang et al. 2023). Off: it cost speed where he was already short (r4sf against r4yt: into stretched −28 kt, was −18; away in position −18, was −15) for no gain in range or aspect.
- **`behind.onCircle`.** The nose behind's aim at the point on Lead's circle 650 ft behind him instead of where Lead was 1 s ago. Off: it left him ahead of the wing line (aspect 107, r4b2).
- **`guard.engage.holdsPower`.** Power off (while closing) and pass-clear's pitch held for the filter's whole engagement, not just 1 s after it last changed his turn. Off: it cost speed (into stretched −25 kt, outside the cone −42 kt; r4h).

## The always-on switches (folded, 03c392e2): what their off branch did

Each was on in every gauge case and set by no code; the live path is kept.

| Switch | Its off branch flew |
|---|---|
| `arcLoop` | T29's aim loop: wanted closure from the range error over 10 s, within ±25 ft/s, with a soft zone (P × `happyGain` 0.3 inside 600-650 ft); d = (wanted + `aimClosureGain` 1 × (wanted − closing)) / Lead's turn rate, within ±`offsetMaxFt` 250 ft, slewed 20 ft/s; power's P the wanted closure less ω × d. Spec 7e.7's aim loop as first written; the soft zone is no longer flown anywhere. |
| `arcFeedForward` | d = d_ss + (wanted − closing)/ω, which settles at half the wanted closure (the half-gain trap) |
| `arcFrame` | With `followCircle`: the arc by the angle round Lead's centre, its closure by differencing the arc, eased over 1 s (memory `arcFt`, `arcClosure`, now gone); otherwise slant range in the turn |
| `deadReckon` | Lead carried straight 0.4 s (his position only, his velocity as seen), #2's own state as seen 0.4 s late, the filter's look 0.4 s longer |
| `followCircle` | In the turn, aim at Lead's place moved d along his lift (T29a's), which cut across from inside |
| `lagFirst.on` | No lag first |
| `behind.on` | No nose behind; the wing line out of reach then also set off the yo-yo |
| `yoyo.on` | No yo-yo; pass-clear's side from the guard (above if 20 ft above Lead when it engaged, `guard.aboveFt`); low inside's MAX whoever had pitch |
| `yoyo.maxFt` (null) | Set, a cap on the climb below the band (400 and 2,000 ft were flown, r4y4 and r4yinf: no better) |
| `yoyo.excessFtps` (null branch) | The speed trigger alone, and no end of the climb on opening |
| `guard.filter` | T29a's guard phases: the miss aimed at where Lead was 1 s ago (`seeFw`'s `wasAt`), the reversal aimed at Lead, cued by the line of sight rising (`guard.losRiseDps` 2°/s, aspect under 90°, closure under `guard.reverseClosureFtps` 15 ft/s), power off during the miss, job labels guard-miss and guard-reverse |
| `guard.passLine` | The pass line fixed at 600 ft |
| `guard.sharedLift` | The filter's turns with 1 G held only; no vertical term in its predicted pass |
| `guard.shakerBound` | The filter's turns up to max(Lead + 1.5 G, the aircraft's), past the shaker when slow |
| `guard.wingLine` | The pass line alone: the nearest clearing turn, the side hysteresis, else the widest pass |
| `guard.lineShortAll` | The wing line "out of reach" whenever no turn met both lines |
| `guard.lagSide` | No lag-side preference or rescue |
| `guard.tighterAtMin` | Lead one step tighter also held to the pass line |
| `guard.capture` | Each candidate turn held the whole look |
| `guard.offClosingOnly` | Power off whenever the filter held, opening or closing (r4f8: −59 kt) |
| `guard.engage` (null branch) | Engaged only while his aim's turn failed |

Numbers that only the off branches read, retired: `happyGain`, `aimClosureGain`, `offsetMaxFt`, `guard.aboveFt`, `guard.losRiseDps`, `guard.reverseClosureFtps`. The guard's memory lost `phase`, `vert` and `losLeast`; supervisor.js's private `dot3v` became attitude.js's `dot3` (the same sum). In the brakes, the closure used was "the arc's in a turn, else the slant's", which is always the step's one closure, so it reads that.

## Left as they are, for the thread

- `FW_SEE.historySec` and `seeFw`'s `wasAt` (where Lead was) have no caller now: only the `guard.filter` off branch's miss used them. `perception.js` was outside the tidy's files unless the split needed it.
- The entry case (`job.entry`: into or away, in position, stretched or tight, SMM Figs 12.20-12.22) only names the job in the trace; nothing flies by it. The gauge's "in position" start (780 ft) is classed "stretched" (over 700 ft).
- `routeFt` only names the aim in the trace (lead, lag or pure past a quarter of it).
- The guard (`fwGuard`) and the filter each predict the pass, with different models: the guard from his seen (0.4 s old) state holding his present turn, the filter from his state now with the capture and the vertical. The architecture review takes this up.
