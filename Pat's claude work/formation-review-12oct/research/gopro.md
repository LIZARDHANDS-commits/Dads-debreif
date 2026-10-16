# Patrick's GoPro flight (CT-156, Aug 2022, phase 2): what the telemetry says

Source: GoPro HERO7 Black telemetry (accelerometer and gyro about 196 Hz, GPS about 18 Hz), chapters 2, 3 and 4 of one recording, about 1,058 s each. Times are mm:ss from each chapter's start. This is real recorded data, so it can serve as a source (AGENTS.md). No positions appear anywhere in this file or in the trace files; only time-relative quantities do.

Patrick's notes: about 90% torque; gentle aerobatics; loops "almost always 3.5 G"; roll rates and G onset softer than fluid manoeuvring or advanced flying. So treat **roll rate and G onset as lower bounds**.

Scripts: the analysis scripts stayed in the thread's scratch folder (the telemetry reader is a `future.md` item). Trace files beside this note: `gopro-loop.json` and `gopro-rolls.json` (open them on `tools/flight-plot/` with "Or a trace file"; no positions in either).

**Correction (12 Oct 2026, the thrust check, `thrust.md` beside this note):** every "KIAS" below that comes from GPS is ground speed turned into KIAS with no wind removed. A wind of about 40 kt from about 300° true (36-49 kt, fitted from four level turns in chapter 2) was blowing, so GPS-based speeds carry about ±40 kt, not ±10-15. Section 5's "accelerates faster than the model" finding is withdrawn: the speed-up was flown almost straight downwind, and in true airspeed the model at MAX matches it. The speeds worked out from the pull itself (inside the loops, and before the Cuban-eight half rolls) don't use GPS and stand, within their own ±15%.

## 1. Mount: fixed to the aircraft (high confidence)

- In steady turns the gyro's total rate matches the GPS track's turn rate: median ratio 0.97, 1.00 and 1.10 in the three chapters.
- In straight and level flight the low-passed gyro reads only 0.6 to 3 °/s rms on each axis. A helmet camera would show the pilot's lookout head movements, tens of °/s.
- Integrating the gyro through a loop brings the attitude back to wings level on the entry heading. Over three loops the pitch angle adds up to 1,091° against an expected 1,080°.
- The camera sits about 6° off the aircraft axes. I measured the misalignment from the loops (the rotation axis and the direction of the pull's G) and rotated the data into aircraft axes.
- Two oddities in chapter 2 (03:05 and 03:25): a pitch doublet of ±35 °/s with no net rotation, far too quick for the flight path. Something probably bumped the mount. They are not manoeuvres.

What this means: roll, pitch and yaw rates are the aircraft's own, to a few percent. G is the aircraft's normal G. The accelerometer reads 4 to 5% high (1.04 to 1.05 G in level flight), so **every G below is divided by that level-flight reading**. Raw numbers would be about 4% higher.

## 2. Manoeuvres found

Chapter 2 (block at about 12,000 to 13,000 ft):

| Time | What | How I know |
|---|---|---|
| 00:00-01:00 | level acceleration, about 125 to 227 KIAS | GPS speed rising, altitude flat |
| 01:01-01:25 | slowing 180° turn, about 2 to 2.7 G, about 70° bank | G, roll-in, gyro heading change 178° |
| 01:31-02:00 | slow flight, about 95 to 105 KIAS | GPS, nz about 1.0 |
| 02:01-02:19 | gentle turn at slow speed, about 1.3 G, about 95 to 115 KIAS | |
| 02:19-04:20 | acceleration back to about 245 KIAS | GPS |
| 04:25-04:56 | steep 180° turn, 2 to 2.3 G, about 70° bank | |
| 05:03-05:15, 05:20-05:30 | two 90° clearing turns, left then right, 2.6 to 3.75 G, about 70° bank | |
| **05:56-06:30** | **loop** | pitch through 360°, inverted at the top, back on heading |
| 06:44-07:02 | 90° turn, 2.1 G | |
| **07:13-07:42** | **loop**, flown straight on into | |
| 07:42-08:15 | **cloverleaf leaf** (quarter roll left on the upline, 90° heading change) | slow roll −10 to −14 °/s near the vertical, ends 87° off heading |
| 08:15-08:25 | **360° left roll** with a pause of about 3 s inverted (nose about 30° up, falling to 15° down) | two roll bursts of −176° and −171° |
| 08:26-08:47 | **Immelmann** | half loop, then a half roll right at the top, 180° reversal |
| 08:55-09:14 | **split-S** | half roll right at about 100 KIAS, then pull through at 3.5 G, 180° reversal |
| 09:54-10:24 | steep 180° turn, 2 G | |
| **10:34-11:02, 11:02-11:30** | **two loops back to back** | pitch through 720° |
| 11:32-12:01 | cloverleaf leaf | heading ends +86° |
| 12:20-12:36, 12:41-12:57 | 90° turns, 2.2 to 2.3 G | |
| 13:12-14:15 | **Cuban eight** | two 5/8 loops; half roll left, then right, on about 45 to 60° downlines; a push to −0.2 G |
| 15:06-16:11 | **Cuban eight** | the same, down to −0.3 G |

Chapter 3 (about 12,500 to 13,500 ft):

| Time | What |
|---|---|
| 02:00-02:21 | 90° turn |
| 02:59-03:32 | loop variant: pull at about 2.8 G, 0.6 G over the top, then a roll of about 100° left at about 70° nose down, pulled out 105° off heading. It may be a cloverleaf leaf with the roll on the downline, or an unfinished half Cuban. The data can't say which he meant. |
| 03:50-04:20, 14:18-14:54 | level turns, 1.5 to 1.8 G, about 150 to 180° |
| **04:37-06:38** | **two Cuban eights back to back** (four half rolls: left, right, left, right) |
| 07:06-07:25 | 90° turn, 2 G |
| **07:45-08:13** | **loop**, then a cloverleaf leaf to 08:43, a 360° left roll with a pause inverted (08:44-08:55), and an Immelmann (08:57-09:17): the same sequence as chapter 2's 07:13 |
| 09:26-09:45 | split-S |
| **15:18-15:49** | **loop**, then a cloverleaf leaf (15:49-16:21) and a 360° left roll (16:22-16:32) |
| 16:39-16:57 | Immelmann |
| 17:00-17:22 | split-S |

Chapter 4: cruise, then a descent of about 11,000 to 3,500 ft at 260 to 300 KIAS with turns (05:20-07:00), then circuit work at about 3,000 ft. That includes two **breaks** (09:18-09:42 and 16:22-16:46, 180° turns at about 2 to 2.3 G and 70° bank, 230 slowing to about 155 KIAS), several 2 G turns, and a low, slow pass at about 112 KIAS (10:51). No aerobatics.

None in these chapters: wingovers, barrel rolls, spins, stalls (slow flight bottomed out at about 95 KIAS with no stall signature).

**Totals:** 6 loops (4 standalone entries, 1 flown back to back after another, and the chapter 3 02:59 variant not counted), 4 cloverleaf leaves, 4 Cuban eights (8 half rolls), 3 Immelmanns, 3 split-Ss, and 3 360° rolls.

**Patrick's 11:42:** in chapter 2 the data puts the aerobatics from 05:56, not 11:42. At 11:42 he is in the middle of the back-to-back loops and cloverleaf. His time may come from a different clock (a combined video, for example). Worth asking him.

## 3. The loops

Method:
- **G** is the normal accelerometer axis, rotated into aircraft axes, low-passed with a 4th-order zero-phase Butterworth (2 Hz; a 5 Hz filter gives the same numbers), resampled at 10 Hz, and divided by the level-flight reading.
- **Pitch rate** is the gyro, filtered the same way at 3 Hz.
- **Loop angle** is the integrated pitch rate.
- **Entry KIAS** comes from GPS ground speed in the 1.5 s before the pull, made into KIAS with the standard atmosphere at that height (`KIAS = KTAS × √σ`, the repo's `tasToIasKt`). The wind is unknown, so allow about ±10 to 15 kt.
- **GPS loses lock or gives junk** from about 45° nose up until after the pull-out in every loop. So the speed inside the loop comes from the pull itself: `V = g (n − cos γ) / pitch rate`, with γ = entry pitch + loop angle and no allowance for angle-of-attack changes. At the bottom of loop 3 this agrees with GPS within about 5 kt (263 against about 257 KTAS). It is noisy near the top and during the G onset.
- **Height** comes from GPS at the top of one loop (chapter 2, 11:16: +2,140 ft, with the fix good), and an energy check agrees (entry about 128 m/s, top about 60 to 65 m/s TAS gives about 2,000 to 2,200 ft). Integrating the kinematic speed reads about 40% high (2,850 to 3,700 ft) and is not used. A strapdown integration (accelerometer and gyro together) drifted badly within seconds and was discarded.

| Loop | Entry KIAS (GPS; kinematic) | Peak G on the pull | G at the vertical | Top G (min) | Top KIAS (estimate) | Max G coming down | G at pull-out | Exit KIAS (kinematic) | Time |
|---|---|---|---|---|---|---|---|---|---|
| ch2 05:56 | 202; 227 | 3.49 (then about 3.0) | 1.8 | 0.59 (0.57) | 77 kinematic / 94-105 GPS | 3.21 | 3.00 | 234 | 32.7 s |
| ch2 07:13 | 222; 234 | 3.96 | 2.4 | 1.08 (0.91) | 109 | 3.94 | 3.80 | 229 | 27.9 s |
| ch2 10:35 | 200; 218 | 3.77 | 2.2 | 0.89 (0.79) | 105 | 3.56 | 3.48 | 232 | 28.3 s |
| ch2 11:03 (2nd) | no level entry; 228 | 3.88 | 2.5 | 0.85 (0.78) | 98 kinematic / 76-91 GPS | 3.53 | 3.37 | 222 (GPS after: about 212) | 27.4 s |
| ch3 07:45 | 225; 235 | 3.56 | 2.4 | 1.00 (0.95) | 107 | 3.67 | 3.62 | 229 | 27.7 s |
| ch3 15:19 | 233; 207 | 3.41 | 2.4 | 1.01 (0.95) | 106 | 3.33 | 3.18 | 229 | 29.9 s |

Summary:
- **Entry:** 200 to 233 KIAS by GPS, about 220 on average, ±10 to 15 kt for wind.
- **Pull to the vertical:** peaks of 3.4 to 4.0 G, about 3.7 on average, at 20 to 40° nose up. The G is not held: it falls steadily to about 2.2 to 2.5 G at the vertical.
- **Over the top:** 0.6 to 1.0 G, at roughly 95 to 110 KIAS (±15 kt).
- **Coming down:** 3.2 to 3.9 G.
- **Exit:** about 220 to 235 KIAS, roughly the entry speed.
- **Height gained:** about 2,000 to 2,500 ft. One loop was checked against GPS (+2,140 ft); this is an estimate.
- **Duration:** 27 to 33 s.

**Constant G or constant pitch rate?** Neither, but it is much closer to a constant pitch rate. G ranges about 4× (3.7 down to 0.8 and back to 3.6). Mean pitch rate by quarter of the loop (0-90°, 90-180°, 180-270°, 270-360°):

| Loop | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|
| ch2 05:56 | 7.8 | 12.6 | 15.1 | 9.4 |
| ch2 07:13 | 9.4 | 15.2 | 14.8 | 11.5 |
| ch2 10:35 | 8.7 | 14.6 | 15.9 | 11.7 |
| ch2 11:03 | 11.6 | 14.6 | 15.5 | 11.2 |
| ch3 07:45 | 9.1 | 15.3 | 15.8 | 11.7 |
| ch3 15:19 | 8.2 | 15.4 | 16.0 | 10.1 |

That is about 9 → 15 → 15.5 → 11 °/s. The nose rate builds from the pull to the top and eases on the pull-out, a range of under 2×. The sim's Lead has the same shape.

**G onset of the pull** (from 1 G to the first peak):

| Loop | 10-90% rise | Fastest G/s | Fastest G/s² (5 Hz filter) |
|---|---|---|---|
| ch2 05:56 | 0.8 s | 2.9 | 5 |
| ch2 07:13 | 1.2 s | 2.5 | 5 |
| ch3 07:45 | 1.2 s | 2.4 | 5 |
| ch2 10:35 | 2.9 s (progressive pull) | 2.0 | 4 |
| ch3 15:19 | 2.8 s (progressive pull) | 1.3 | 3 |

The crisp pulls take about 1 s from 10% to 90%, with peak onset about 2.5 to 3 G/s and the onset building at about 4 to 5 G/s². The 2 Hz and 5 Hz filters agree, so the filter is not what limits these numbers.

## 4. Rolls and roll-ins

Roll rate is the gyro about the aircraft's roll axis, filtered at 6 Hz (a 3 Hz filter gives the same within about 5 °/s²). Timing starts when the rate leaves 3 °/s. Speeds: GPS where it has a fix. Otherwise, for the Cuban half rolls, the pull-based estimate in the 3 s before the roll (`rollspeed.py`), which is an estimate of about ±15%.

| Kind (count) | Peak rate °/s | Held rate °/s | Time to 63% | Time to 90% | Time to peak | Peak roll acceleration °/s² | Speed |
|---|---|---|---|---|---|---|---|
| Cuban-eight half rolls (8) | 83-100 | 74-87 | 0.6-1.7 s | 0.9-2.1 s | 1.2-2.3 s | 96-131 | about 90-115 KIAS (110-140 KTAS) before the roll, estimate |
| Immelmann roll-outs (3) | 67-81 | 60-71 | 0.6-0.7 s | 1.1-1.4 s | 1.8-1.9 s | 75-101 | top of a half loop, about 100 KIAS, estimate |
| Split-S roll-ins (3) | 66-69 | 59-61 | 0.5-0.6 s | 1.0-1.1 s | 1.6-1.9 s | 93-100 | about 95-105 KIAS by GPS (one fix: 94) |
| 360° rolls, each half (6 halves) | 58-79 | 49-68 | 0.4-0.8 s | 0.7-1.3 s | 1.0-1.3 s | 84-140 | about 215-240 KIAS, estimate; pause inverted 1 to 3 s |
| Turn roll-ins and roll-outs (about 50) | 25-69 | 21-60 | 0.3-0.7 s | 0.5-1.1 s | 0.8-1.5 s | 35-146 | 200-260 KIAS by GPS |

The fastest single roll was 100 °/s (a Cuban half roll, chapter 2 15:56). The quickest build-ups (0.3 to 0.4 s to 63%, 127 to 146 °/s²) were roll-ins for the 3 to 3.75 G clearing turns at about 200 KIAS.

## 5. Power and speed changes (the acceleration finding is withdrawn: see the correction at the top)

From GPS, in straight flight with the altitude flat, at about 12,600 ft. The 5 s GPS steps jitter by about ±1.5 kt/s, so these are averages over 25 to 60 s:
- 125 → 227 KIAS in about 60 s with a 500 ft climb: about 1.7 kt/s (chapter 2, 00:00-01:00).
- 135 → 178 KIAS in 25 s: about 1.7 kt/s (chapter 2, 02:30-02:55).
- 160 → 249 KIAS in 40 s, level: about 2.2 kt/s (chapter 2, 03:35-04:15). It was still gaining 1 to 2.5 kt/s at 230 to 249 KIAS.
- Our model at maximum power and 12,600 ft (`excessThrustPerWeight`, 1 G) predicts 2.4 kt/s at 160 KIAS, 1.3 at 200 and 0.26 at 240. **The data accelerates faster at high speed than the model allows, even at Patrick's stated about 90% torque.** The rate does not depend on wind; the KIAS label shifts by ±10 to 15 kt with it. Worth a check against the manual's level-speed data before anyone acts on it.
- Slowing:
  - breaks at about 2 G with power presumably at idle: 230 → about 155 KIAS in about 25 s, roughly 3 to 4 kt/s;
  - the 180° slowing turn in chapter 2: about 212 → 117 KIAS in about 28 s, about 3.4 kt/s;
  - clearing turns at 3 to 3.75 G: 4 to 5 kt/s over 5 s.
- Through the loops the speed comes back to the entry speed within about ±15 kt, so there is no large energy loss at this power setting.

## 6. Against our numbers

| Our number (source) | Patrick's flight | Verdict |
|---|---|---|
| LEAD loop entry and exit, 230 KIAS (SMM Table 7.1, 7.5 para 11) | entry 200-233 (about 220), exit about 220-235 | agrees, ±15 kt |
| LEAD.loopG 3.5 (EFIG p.171) | peaks 3.4-4.0, about 3.7 | agrees; he peaks a little over 3.5 |
| 3.5 G held to about 80° nose up (LEAD.loopVerticalDeg, an estimate) | the G peaks at 20-40° nose up and falls to about 2.3 at the vertical | **differs**: he does not hold 3.5 G up the climb; the G bleeds off as the nose rises |
| Nose rate held (Lead's loop design) | about 9 → 15 → 15.5 → 11 °/s | agrees in shape; the sim's Lead gives 10 → 18 → 17 → 13 |
| LEAD.loopTopMinG 0.5, "slight positive G" (an estimate) | 0.6-1.0 over the top (the sim shows 1.12) | the data supports a top G of about 0.6-1.0; the sim's 1.12 is a little high |
| LEAD.loopDownMaxG 4 (SMM Table 7.1) | 3.2-3.9 | agrees; below 4 |
| Sim loop length (fluid-loop.json) | 27-33 s against the sim's 23.5 s; top about 95-110 KIAS against the sim's 112 | the sim is about 15-20% quicker round the loop: its pitch rate is higher and its pull holds the G longer |
| T6A_G_ONSET 4 G/s, 16 G/s² (an estimate) | about 2.5-2.9 G/s, 4-5 G/s² | Patrick is gentler: about 0.7× the rate and 0.3× the onset build. Phase 2 makes this a lower bound, so no change is supported |
| 8 G/s gate | at most 2.9 G/s | far inside it |
| T6A_ROLL max 120 °/s, 0.45 °/s per KTAS | 360° rolls at about 215-240 KIAS: 58-79 °/s, inside the model's limit | consistent (a lower bound) |
| T6A_ROLL at low speed | Cuban half rolls at about 110-140 KTAS: 83-100 °/s, where the model allows 50-63 °/s; split-S and Immelmann rolls at about 120-135 KTAS: 66-81 against 54-61 allowed | **differs**: the low-speed limit looks too strict. Even gentle rolls beat it. The speeds are estimates (±15%), but the gap is 30-60%. Ask Patrick |
| T6A_ROLL full rate in 0.3 s, acceleration over 0.2 s (up to 400 °/s²) | 63% in 0.4-0.8 s, 90% in 0.7-1.2 s, peak 85-146 °/s² | Patrick builds roll rate 2-4× more slowly. A lower bound, so no change is supported, but a pilot-flown roll in the sim should not look quicker than this |
| Wingover 3 G; barrel roll 3 G then 2.25 G | none flown in these chapters | no data |
| Steep turns | 2.0-2.3 G at about 70° bank; clearing turns 2.6-3.75 G | (reference) |

## 7. The trace files (open on the flight-plot page with "Or a trace file")

- `gopro-loop.json` (34 s, 0.1 s steps): the chapter 3 07:45 loop, pull at 3.0 s. Fields:
  - `g`, `gRate`, `roll` (rate) and `drawnDps` (total body rate): measured.
  - `bank` and `climbDeg` (body pitch, not flight path): integrated from the gyro.
  - `kias`: GPS before the pull, then the pull-based estimate (noisy ±20 kt, gap-filled during the onset).
  - Extra fields the page ignores: `pitchRateDps`; `dhFt` (an estimate, scaled to the one GPS-checked loop, so read it as ±400 ft).
  - `rangeFt` is null.
- `gopro-rolls.json` (12 s each, roll starts at 2.0 s): two "aircraft" on one time base. One is the chapter 3 16:23 360° left roll (about 215 KIAS, an estimate), the other the chapter 3 06:25 Cuban-eight half roll right (about 105 KIAS, an estimate). `kias` is null because GPS has no fix during either.

## 8. Limits: what the data cannot tell

- **No airspeed sensor.** KIAS comes from GPS ground speed or the pull geometry. The wind is unknown (±10-15 kt). Speeds over the top are ±15 kt.
- **GPS loses lock** from about 45° nose up until the pull-out, and inverted. Its altitude lags and spikes, so height gain rests on one loop plus an energy check.
- **No stick, torque or angle-of-attack data.** I can't say whether a rate was set by the pilot or by the aircraft. Patrick says it was the pilot, so roll rates and onsets are lower bounds.
- **Manoeuvre names are inferred** from attitude histories. The chapter 3 02:59 loop variant is ambiguous.
- **The G calibration assumes 1.00 G** in straight and level flight (the GoPro reads 1.04-1.05). Absolute G is about ±3%.
- **Bank and pitch drift** by a few degrees over 30 s or more of gyro integration; near the vertical, bank and heading are undefined.
- **One flight, one student, phase 2.** It is no envelope.

Confidence: mount, high. G, pitch and roll rates, high (±5%). Manoeuvre identification, high except the one variant. Entry and exit speeds, medium (wind). Top speed and height, low to medium.
