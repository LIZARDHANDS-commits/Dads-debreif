# Lead's fluid loop, wingover and barrel roll at the entry speed: design (Step 12.3, 12 Oct 2026)

Design work only (Opus, high). No repo file was edited. Rulings designed to: TS-213, TS-215, TS-221 (Patrick, 12 Oct 2026). The laws are re-implemented in `law.mjs` on the repo's core point mass (`stepPointMass`), core `easeValue`, `t6aExcessFn`, `shakerG`, `T6A_G_ONSET` (4 G/s, 16 G/s² on this checkout) and the T-6A roll (0.58°/s per KTAS, at most 200°/s, 0.2 s onset). Scripts: `run-loop.mjs` (loop table), `run-paths.mjs` (wingover, barrel roll, sequence joins), `probe-low.mjs` (what a 200 KIAS entry needs), `make-trace.mjs` (the traces), `peek.mjs` and `peek-path.mjs` (step dumps). Raw output: `results-loop.txt`, `results-paths.txt`, `results-low-entry-probe.txt`. Run with `node <script>` from this folder.

Every number below is from our point mass, not from a flight. Everything marked "estimate" waits on Patrick.

## 1. The laws in plain words

**Loop (TS-213, TS-221).** Lead waits wings level at MAX for #2 to roll out (LEAD.loopWaitSec, unchanged), then pulls from level at whatever speed he has. Below 200 KIAS at the pull he refuses (a card note, nothing flown). He pulls 3.5 G, building at the T-6A's onset; the 3.5 G is held until it meets the stick shaker's line, and from there he rides just under the shaker (a soft limit, no corner in the G) up to the vertical. At 90° nose up he holds the nose's pitch rate he has, carrying on its rate of change, so neither the G nor the G rate steps. From then on, four times a second, he predicts the exit speed: "if I ease my nose rate to r and hold it, what KIAS will I have when the nose is back on the horizon?" (a fast run of the same physics ahead to 360°). He picks the r that gives the entry speed and moves his actual nose rate toward it no faster than 4°/s², building that change at 6°/s³. G = (nose rate × speed ÷ g) + cos(loop angle), under 4 G and the shaker, both met softly, and never below 0.5 G over the top. In the last 30° he stops re-predicting and holds the rate (nothing left to steer with).

- **Stand-alone** (the Loop button): the nose rate eases to zero as the nose reaches the horizon (a jerk-limited stop, 2°/s³), so the G comes off 4 to 1 over about 2.5 s, then level.
- **Flowing** (the standard sequence): at 360° he hands his nose rate, its rate of change and his G to the wingovers, still pulling about 4 G, no unload.

**Wingovers and barrel roll (TS-215).** Same nose paths as today (SMM 16.17 para 47; SMM 14.8 para 19). No speed set-up; they start at whatever speed Lead has (refused below a minimum, proposed 200 KIAS). The first half of each wingover and of the barrel roll is flown at the manual's G (about 3 G; the barrel roll easing to 2.25 G over the top, today's estimate). The descending half is the lever: the same exit predictor picks the nose rate that brings the exit (the nose back on the horizon) to the entry speed (a slower rate is a longer dive and a faster exit). Each wingover aims at the entry speed, so the second starts where the first began. A flowing join starts the next path where the nose already is and eases the G handed in onto the next manoeuvre's own G over 2 s (cosine), so the G rate builds from zero.

## 2. The numbers (proposed home: `lead-moves.js` LEAD)

| Name | Value | Source |
|---|---|---|
| loopG | 3.5 G | EFIG p.171; TS-213 (unchanged) |
| loopVerticalDeg | 90° (was 80) | TS-221 |
| loopMinKias | 200 KIAS, refuse below | TS-221 |
| loopExitTolKt | 15 kt | TS-221 (the design's target is the entry speed; 15 kt is the check) |
| loopDownMaxG | 4 G, flagged if the exit needs more | TS-213 (unchanged) |
| loopTopMinG | 0.5 G floor, never reached in these runs (the tops came out 0.85-1.04 G) | estimate (SMM 7.5 para 11 "slight positive") |
| loopShakerShare | 1.0: the loop rides the shaker line itself, met softly | NEW estimate. Today's stepLead clamps at shakerG too. At 0.9 a 200 KIAS entry exits 15.6 kt fast (fails TS-221) |
| pathShakerShare | 0.9 (today's LEAD.shakerShare) for the wingover and barrel roll | estimate, unchanged |
| noseRateAccelDps2 | 4°/s² | NEW estimate (today's noseAccelDps2 is 8, applied as a step) |
| noseRateJerkDps3 | 6°/s³ | NEW estimate |
| exitReplanSec | 0.25 s | NEW estimate |
| exitFreezeDeg | 30° | NEW estimate |
| endJerkDps3, endKneeDps | 2°/s³, 1.5°/s | NEW estimates (the stand-alone pull-out to level) |
| limitKneeG | 0.15 G | NEW estimate (the soft limits' knee) |
| joinBlendSec | 2 s | NEW estimate (a flowing join's G hand-over) |
| G onset build | 0.2 s (16 G/s² reached in 0.2 s) | NEW estimate, as the roll's T6A_ROLL.onsetSec (TS-196); belongs in core T6A_G_ONSET (cross-module: Patrick's yes) |
| wingoverMinKias, barrelMinKias | 200 KIAS proposed (both still exit within 10 kt from 186) | proposal for Patrick |
| wingoverG, barrelG, barrelTopG, pitch and offsets | 3, 3, 2.25, 45°, 45° | unchanged (SMM 16.17 para 47; SMM Table 14.1, 14.8 para 19; 2.25 an estimate) |

Retired by TS-221/TS-215: `speedSetUp` for the loop, wingover and barrel roll, `setupMaxPitchDeg`, `loopEntryKias` and `loopEntryBandKias` as an entry gate, `climbDamp.loopDownPerSec`, the loop's `exit` stage. `loopPullOutDeg` stays only for #2's cue words (`loopMode`).

## 3. Results: the loop (PCL MAX, entry after 3 s level; KIAS read as the nose passes the horizon)

Stand-alone (ends level). "Shaker" = where 3.5 G meets the shaker line on the way up. Quarters: mean pitch rate (°/s) for 0-90°, 90-180°, 180-270°, 270-360°.

| Alt | Entry | 3.5 G meets shaker | Vertical up: KIAS, G, °/s | Top: KIAS, G | Down 90° / 45° / 30° KIAS | Peak G | Exit (error) | Height | Time to horizon | Quarters | 4 G held |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 8,000 | 205 | 48°, 175 | 130, 2.03, 14.8 | 91, 0.95 | 160 / 197 / 205 | 3.99 | 213 (+8.4) flagged | +1,982 | 24.5 s | 12.9 17.3 18.0 12.4 | 2.8 s |
| 8,000 | 218 | 59°, 175 | 142, 2.41, 16.1 | 101, 1.02 | 167 / 202 / 211 | 3.99 | 219 (+0.4) | +2,110 | 24.5 s | 12.7 17.5 18.2 12.3 | 3.3 s |
| 8,000 | 232 | 69°, 175 | 153, 2.78, 17.2 | 110, 1.03 | 178 / 215 / 224 | 4.00 | 232 (-0.7) | +2,278 | 25.3 s | 12.3 17.3 17.0 12.1 | 4.0 s |
| 8,000 | 250 | 80°, 175 | 165, 3.23, 18.5 | 119, 1.04 | 193 / 233 / 243 | 4.00 | 250 (-0.4) | +2,568 | 26.8 s | 11.7 16.4 15.8 11.4 | 4.5 s |
| 12,000 | 204 | 46°, 175 | 128, 1.94, 13.5 | 88, 0.88 | 157 / 195 / 202 | 3.99 | 210 (+6.0) flagged | +2,240 | 26.0 s | 12.1 15.9 16.8 11.9 | 2.9 s |
| 12,000 | 218 | 57°, 175 | 140, 2.32, 14.8 | 98, 0.87 | 166 / 202 / 210 | 3.99 | 218 (-0.3) | +2,392 | 26.3 s | 11.9 15.9 16.4 11.8 | 3.7 s |
| 12,000 | 232 | 67°, 175 | 150, 2.69, 15.9 | 107, 0.92 | 177 / 215 / 224 | 4.00 | 231 (-0.6) | +2,582 | 27.1 s | 11.6 15.8 15.5 11.5 | 4.2 s |
| 12,000 | 250 | 78°, 175 | 163, 3.15, 17.1 | 116, 0.93 | 191 / 233 / 243 | 4.00 | 250 (-0.4) | +2,917 | 28.8 s | 11.0 14.9 14.4 10.8 | 4.6 s |

(The entry reads 2-5 kt above the nominal 200/215/230 because the aircraft accelerates at MAX during the 3 s level lead-in.)

- **Worst exit error: +8.4 kt (200 nominal, 8,000 ft, stand-alone)**, inside TS-221's 15 kt. Flowing exits are closer still (+4.3 and +2.4 kt at 200; within ±0.4 kt from 215 up). From 215 KIAS up every exit is within 1 kt.
- **Flag "4 G: exit fast"** shows only for the 200 KIAS entries (the last prediction +9.5 and +6.9 kt at the cap). Rule proposed: flag when the last prediction before the freeze is more than 5 kt fast while holding 4 G (estimate). With 4.2 G the 200 KIAS exit error would be +6.3 (8,000) and +4.0 (12,000) (`results-low-entry-probe.txt`).
- **Smoothness:** after the pull the G rate never exceeds 1.5-1.7 G/s (the stand-alone unload to level) or 0.6-1.1 G/s flowing, and the G acceleration stays under 4.2 G/s². The pull itself uses the full onset (4 G/s, 16 G/s²). At the 90° hand-over the G rate goes -0.62 to -0.74 G/s over 0.15 s (no step). The pull-out to level: 4.0 to 1.0 G over about 2.7 s, at most 1.6 G/s.
- **3.5 G cannot be held to the vertical at these entries.** 3.5 G meets the shaker at 175 KIAS (0.9 shaker: 183). Holding 3.5 G to 90° needs about 280 KIAS at the pull. So "3.5 G to the vertical" becomes "3.5 G, then the shaker line, to the vertical": the G at the vertical is 1.9 to 3.2 G. Patrick's own loops show 2.2-2.5 G there.
- Below 200: a 190 entry would still exit +14.6 kt and a 195 entry +11.5. So 200 leaves about 6 kt of margin.

## 4. Results: wingovers and barrel roll (stand-alone, ends level)

| | Alt | Entry | Exits (error) | G range | Pitch | Most bank, roll | Slowest | Time | Height gained, end |
|---|---|---|---|---|---|---|---|---|---|
| Wingovers | 8,000 | 186 | 190 (+3.9), 196 (+9.9), flagged | 1.00-3.76 | ±46° | 119°, 83°/s | 130 | 37.0 s | 1,124, -5 |
| | 8,000 | 205 | 205 (0.0), 205 (+0.1) | 1.00-3.94 | ±46° | 121°, 78°/s | 141 | 37.7 s | 1,231, -2 |
| | 8,000 | 232 | 232 (-0.1), 231 (-0.7) | 1.00-3.77 | ±46° | 122°, 72°/s | 158 | 41.0 s | 1,470, -277 |
| | 8,000 | 250 | 250 (-0.1), 250 (-0.7) | 1.00-3.68 | ±46° | 122°, 68°/s | 169 | 43.9 s | 1,660, -523 |
| | 12,000 | 204-250 | all within -0.8 kt | 1.00-3.90 | ±46° | 120-122° | 139-167 | 40-47 s | 1,372-1,852 |
| Barrel roll | 8,000 | 186 | 196 (+9.7), flagged | 1.00-3.67 | ±46° | 180°, 41°/s | 125 | 20.8 s | 1,213, +32 |
| | 8,000 | 205 | 204 (-0.3) | 1.00-3.93 | ±46° | 179°, 39°/s | 137 | 20.8 s | 1,348, +96 |
| | 8,000 | 232 | 232 (-0.6) | 1.00-3.82 | ±46° | 180°, 37°/s | 153 | 22.9 s | 1,652, -22 |
| | 8,000 | 250 | 250 (-0.6) | 1.00-3.72 | ±45° | 179°, 35°/s | 162 | 24.5 s | 1,880, -142 |
| | 12,000 | 204-250 | all within -0.6 kt | 1.00-3.85 | ±46° | 180° | 135-160 | 22-26 s | 1,501-2,101 |

Worst from 200 up: -0.8 kt (wingover), -0.6 kt (barrel roll). At 186 both still exit within 10 kt (at the 4 G cap). The wingovers come out with SMM 16.17 para 47's shape without being told it: 45° pitch, up to about 120° of bank, about 3 G (peaks to 3.9 on the way down to hold the exit speed). A fast entry ends the wingovers lower (-523 ft at 250 KIAS), because a lower exit is what gives the speed back. Maximum G rate 1.5-1.7 G/s, G acceleration under 6 G/s².

**The standard sequence, flowing** (loop, then two wingovers, then the barrel roll to level), from `run-paths.mjs`:

| Alt | Entry | Loop exit | Wingover exits | Barrel exit | Loop to wingover (±1 s) | Wingover to barrel (±1 s) |
|---|---|---|---|---|---|---|
| 8,000 | 205 | 209 | 209, 209 | 208 | G 3.99, no dip | G 3.81 |
| 8,000 | 232 | 232 | 232, 232 | 231 | G 4.00 to 3.8, at most 0.4 G/s | G 3.75 to 3.7 |
| 8,000 | 250 | 251 | 250, 250 | 250 | G 4.00 | G 3.67 |
| 12,000 | 204-250 | within 2 kt | within 1 kt | within 1 kt | G 4.0 | G 3.65-3.82 |

At 230 KIAS and 8,000 ft (trace `loop-sequence-proposed.json`): across the loop-to-wingover join the G goes 4.00 to 3.94 in the first 0.2 s, with the G rate building 0 to -0.37 G/s; across the wingover-to-barrel join 3.75 to 3.73. No unload, no 1 G dwell, no re-pull. Each part reads the speed the last one handed it, so the whole sequence ends within 1-4 kt of the loop's entry.

## 5. Comparison

**EFIG p.171 checkpoints, carried over in proportion to the entry KIAS.** That is the same as keeping V²/V_entry² at each checkpoint, which is what energy similarity gives for a loop flown at the same G (radius goes as V²). It is an estimate, and it breaks down where the shaker cramps the top, at low entries.

| Checkpoint (230 entry) | EFIG, scaled to 232 | Proposed, 232 at 8,000 | Patrick GoPro, 225 at about 12,500 | Sim today, 239 at 8,000 |
|---|---|---|---|---|
| Top | 101-121 at slight positive G | 110 at 1.03 G | 106 at 0.97 G | 112 at 1.12 G |
| "About 140 at the vertical" | 141 | 153 going up / 178 coming down | 158 up (G 2.39) / about 140 down (noisy) | about 160 up / about 180 down |
| 45° nose down | 182-192 | 215 | about 195 | about 214 |
| 30° nose down: 30 kt short | 202 | 224 | (noise) | about 225 |
| Exit | 232 | 232 (-0.7) | 224 (entry 225) | about 231-232 (entry 239) |
| Peak G, G down | 3.5 / 3-4 | 4.0 (coming down), 3.5 up | 3.56 up / 3.67 down | 3.5 up / 4.0 down |
| Pitch rate by quarter (°/s) | (no number) | 12.3 17.3 17.0 12.1 | 9.1 15.3 15.8 11.7 | about 10 18 17 13 |
| Time, height | | 25.3 s, +2,278 ft (12,000: 27.1 s, +2,582) | 27.7 s, about +2,000 to 2,500 | about 23.5 s |

Findings:
- **The top, the shape of the nose rate, the time and the height match Patrick's flying.** At 12,000 ft (nearer his height) the proposed quarters are 11.6, 15.8, 15.5 and 11.5 °/s against his 9.1, 15.3, 15.8 and 11.7. The top is 107 KIAS at 0.92 G against his 106 at 0.97. Time: 27.1 s against 27.7. The one difference is his first quarter (9 against 12 °/s): that is his early G bleed, which Patrick has ruled a student's error.
- **The EFIG downside checkpoints cannot all be met on our point mass with Lead at or under 4 G.** The trouble is "30 kt short at 30° nose down". To gain 30 kt in the last 30° of pitch, the pull-out must lose about 730 ft of height over that 30°, which means a radius of about 5,500 ft, about 2.1 G. A 4 G pull-out gains about 7 kt there. "About 140 at the vertical" fits our vertical going up (153). If it means coming down, the loop would have to be much tighter from the top to the vertical than any pitch rate Patrick flew. Patrick's own downside speeds (195 at 45° nose down) fall between EFIG and ours, and his 140 down-vertical figure is a noisy estimate (±20 kt). Recommendation: read EFIG's downside numbers as teaching cues, keep Patrick's data and the exit-speed rule as the check, and ask Patrick which vertical EFIG means.
- **Low entries come out fast, as Patrick's did.** At MAX the T-6 gains energy round a slow loop. His two 200-202 KIAS loops (GPS) came out at 232-234. The law holds it to +8 by flying the bottom at the 4 G cap.
- **Against the sim today** (`tmp/gauge/fluid-loop.json`, 12 Oct 20:12): today's loop sits at the shaker for about 3 s going up, holds 4 G for about 3.6 s at the bottom, then unloads 4 to 1 G at 2.2 G/s (a G rate step from 0 to -2.2 G/s in one step), holds 1 G and pulls again into the wingovers. The proposed loop has no G rate step after the pull. The cap is met through a knee, the vertical hand-over carries the rate's own rate of change, and the exit either unloads over 2.7 s (stand-alone) or hands over at 4 G (sequence).

The plot page (`tools/flight-plot/`, "Or a trace file") opens `loop-proposed.json`, which holds four aircraft on one 0.1 s base with the pull at 3.0 s: Proposed 230 at 8,000; Proposed 230 at 12,000; Sim today (239 at 8,000, the gauge's fluid-loop trace shifted 37 s); Patrick GoPro (225). `loop-sequence-proposed.json` holds the flowing sequence at 230 and 8,000.

## 6. Implementation plan (for the thread once the other writer is done with `fluid-lead.js`)

1. **core `flight-math.js`:** add `softMin(a, b, k)` and `softMax` (none exists; checked `src/`). **core `t6-performance.js`:** `T6A_G_ONSET.onsetSec: 0.2` (estimate). This is a cross-module change, so it needs Patrick's yes; until then it can live in `LEAD`.
2. **`lead-moves.js` LEAD:** the numbers in section 2 with their sources. Retire the set-up numbers for the loop, wingover and barrel roll.
3. **`fluid-lead.js`:**
   - Add `predictExit(model, now, rTarget, opts)` and a bisection `solveExitRate`, one pair for the loop's plane model and one for a nose path. Both use core `easeValue` for the eased nose rate, `t6aExcessFn`, `shakerG` and the soft limits. Keep everything in `mem` plain numbers (mem is copied step to step).
   - `loop()`: drop `speedSetUp`. Keep the `waitSec` wings-level wait. Refuse at the pull if KIAS < `loopMinKias` (`done: true`, `refused: '…KIAS, below the 200 KIAS minimum (TS-221)'`, nothing flown, Lead carries on straight and level). Stages: pull (softMin(3.5, shaker)), then the rate hold from 90° (rate and its rate of change seeded from the G flown), then the exit (stand-alone end cap to level, or flowing `handover: { r, rd, g }`). Flag `needsMoreG` from the last prediction.
   - `followNose()`: the nose rate becomes an eased value (`easeValue` with noseRateAccelDps2 and noseRateJerkDps3) in place of today's per-step clamp. Its target is the G plan's rate (first half) or the exit predictor's (descending half). Add the soft G cap, the start `s` where the nose is, the handed-in G blend, and the end test (left < 0.3°, rate < 0.3°/s).
   - `wingovers()`, `barrelRoll()`: drop `speedSetUp`. Add the minimum-speed refusal, the barrel G plan as today, and a `flow` option (the first wingover always flows into the second).
   - `sequenceParts()`: the loop flows into the wingovers, which flow into the barrel roll; the barrel roll ends level.
   - `stepLead()`: build the G acceleration (`easeValue` onsetSec, the `gAcc` state) and use softMin for the shaker clamp. It is shared with #2's live step (`fluid-wing-live.js`), so check #2's gauge numbers before and after.
4. **`fluid.js`** line 133: pass the finished controller's `handover` into the next `init(st, { wingSide, handIn: r.handover })`. Show `refused` and `needsMoreG` on the card.
5. **Spec, decisions, `numbers.md`** in the same piece of work (one source of truth).
6. **The one test** (TESTING.md): Lead's stand-alone loop from 200 and 250 KIAS at 8,000 ft exits within 15 kt of its entry, and Lead's G stays at or under 4 G (+0.05). Check before and after with `node tools/formation-gauge.mjs --only fluid` (G rate steps and G reversals for Lead and #2).
7. **Cost:** planning one manoeuvre takes about 60-100 ms in Node (the predictor runs 4 times a second of flight, about 16 runs each). If the press hitches in a browser, re-predict every 0.5 s and use 10 bisection steps.

## 7. Open questions for Patrick (one at a time, each with a recommendation)

1. **Lead's G margin in the loop.** Options: (a) up to the stick shaker line itself, met softly. Recommended: it is the only setting that meets your 15 kt from a 200 KIAS entry with margin (+8.4), and it is today's clamp. (b) 95% of it (+12.0). (c) 90% (+15.6, fails at 200).
2. **"About 140 at the vertical" (EFIG p.171): going up or coming down?** Ours is 153 going up and 178 coming down; your recorded loop gives 158 going up.
3. **Minimum entry for the wingovers and barrel roll.** Options: 200 like the loop (recommended, one number); 180 (both still exit within 10 kt); or none.
4. **The standard sequence when Lead is below 200 after the 360° turn:** wait wings level at MAX until 200 (recommended; nose level, so it is not a speed set-up), or refuse the loop and go on to the wingovers?
5. **The "slight positive" G over the top:** keep 0.5 G as the floor? The law flies 0.85-1.04 G there by itself (your loops: 0.6-1.0).

## 8. What I was unsure of, and what is untested or unseen

- The EFIG checkpoints are read from the repo's paraphrase (`research/manuals.md`), not the manual itself.
- The point-mass predictor and the flown point mass agree here because they share the model. The real T-6 would differ where our drag and thrust fit differs: `gopro.md` found the model accelerates more slowly than the aircraft at high speed.
- This checkout's T6A_G_ONSET is 4 G/s, 16 G/s². The coordinator mentioned a 6 G/s ceiling on another branch. The law never asks for more than 1.7 G/s after the pull, so only the initial pull would change.
- The 3 s level lead-in raises the entry 2-5 kt. In the app the pull starts after `loopWaitSec`, at whatever speed Lead has.
- No #2: only Lead was flown. #2's reaction to the new joins (fluid-wing-live.js, the G-plus-1.5 cap) is untested. `stepLead`'s G-acceleration build changes #2 too.
- Not seen in the browser. The gauge was not re-run (the other writer is changing fluid-lead.js); the "sim today" trace is the file of 12 Oct 20:12.
- One bug of my own was found and fixed during the work: the stand-alone predictor never reached its end (the eased rate never quite reached zero), so it predicted exits 40-60 kt fast. The end test now matches the flown law. Worth keeping that test in the build.
