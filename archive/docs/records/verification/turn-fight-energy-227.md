# Turn Fight Energy engine re-check: #227 (8091f5e)

15:45Z. N1 was confirmed independently by the skills check and by my own #232 numbers (core-mmo-211.md), so no separate audit was needed.

# Turn Fight Energy engine, PR #227 (8091f5e): re-check in Node

Checked 2026-09-30 in Node (no screen). Worktree wt-core at 8091f5e, engine src/modules/turn-fight/energy-sim.js. Read only: no repo file edited. Scripts and raw runs: scratchpad/en227/ (mach1..9, f1*.mjs, f2*.mjs, fuzzF1*.mjs, small.mjs, reg*.mjs, mpt*.mjs; "old/" is HEAD~1 extracted for before/after runs). Reused: en209/ (fuzz5, r3, r9, r12) and audit209/f1b.
npm test at 8091f5e: 3,027 tests, 3,019 pass, 0 fail, 8 todo (135 s).

## Summary
High 0, Medium 1 (N1, Mach guard mixes speed bases: confirmed), Low 3 (N2 to N4), plus cosmetic notes. PILOT JUDGEMENT 1 (N3).
F1, F2 (pitch back), F3, F4, F5, F6, F7, F8, S1: all PASS. The three PR claims:
- "Top speed from core maxKiasT6A": TRUE (3 uses: merge check :323, the chaser guard :1029, the refusal text). Values 316 to 18,879 ft, 309.1 at 20,000, 279.1 at 25,000, 245.3 at 31,000 (checked).
- "CAS compared against CAS": FALSE. The engine's kias is ktas x sqrt(sigma) (energy-sim.js :654, :1104, tasToIasKt), which is equivalent airspeed; maxKiasT6A is compressible calibrated airspeed. See N1.
- "MPT_KIAS_RANGE exported and state.evenFight new": TRUE (see F8, F4).
Top 5: N1 the top speed is 3 to 4 % over Mach 0.67 (true Mach 0.689 to 0.696 at the accepted limit); N2 MPT speeds 120 to 124 are accepted but fly 125; N3 Auto Immelmann at 259 to 263 KIAS at 20,000 ft takes 501 deg / 45 s (Immelmann 241+ still 278 to 296 deg at 10,000 ft); N4 forced pitch back at 316 KIAS is 179.8 deg at 8,000 ft (0.2 deg margin) and 184 deg at 6,500 ft; N5 cosmetic stall text "5.5000 G ... 5.4995 G".

## Findings

### N1 (Medium) The Mach guard compares CAS with the model's EAS: top speed flies Mach 0.69 to 0.70, not 0.67
- Where: engine merge check (energy-sim.js :319-326), chaser guard (:1029-1030), and core maxKiasT6A doc ("compared with the model's IAS as it stands"). Already known to the coordinator, SPEC-core "Known limits" F5, and D328/D345/D347 (Turn Fight is fixing it); reproduced here with numbers.
- Steps (Node, scratchpad/en227/mach1.mjs, mach3.mjs, mach8.mjs): for each height take lim = maxKiasT6A(alt); the engine's true airspeed at that indicated speed is iasToTasKt(lim, alt); Mach = TAS / speedOfSoundKt(alt). Then start a fight at the accepted limit (blueKias = round(lim)) and read state.blue.ktas / speedOfSoundKt at T+0.
- Expected: at the limit true Mach <= 0.67 (NFM Fig 4-1-2, p.5-9: MMO 0.67) and calibrated speed <= 316 (VMO).
- Actual (analytic, and confirmed by the real fight state at T+0):
  | alt ft | maxKiasT6A | engine TAS at limit | true Mach | true CAS at that Mach |
  | 10,000 | 316.0 | 367.7 | 0.576 | 319.8 (VMO over by 3.8) |
  | 17,700 | 316.0 | | 0.672 | 324.3 |
  | 18,000 | 316.0 | 418.6 | 0.676 | 324.5 |
  | 18,879 | 316.0 | 424.8 | 0.688 | 325.1 |
  | 20,000 | 309.1 | 423.4 | 0.689 (fight T+0: 0.6891) | 318.4 |
  | 25,000 | 279.1 | 417.0 | 0.693 (fight T+0: 0.6924) | 289.2 |
  | 31,000 | 245.3 | 408.5 | 0.696 | 255.6 |
  So the model flies 12 to 15 kt of TAS over Mach 0.67 (about 3 %). Two things beyond the coordinator's note: (a) the overshoot starts at about 17,566 ft, not 18,879: at 316 model-IAS the true Mach is already 0.67 there, so the "exactly VMO below 18,879 ft" branch is itself 0.67 to 0.688 between 17,566 and 18,879 ft; (b) VMO is over too, by 3.8 kt at 10,000 ft and 8 to 9 kt at 18,000 ft, because model IAS is EAS (this is the D273 basis and was there before #227, pinned bit for bit at 17,000 ft and below).
  Exposure: only the accepted merge speed and the run-in (about 15 to 20 s of straight flight to the pass at the merge speed), and a forced move's first seconds. A 200 s random fuzz of 495 Auto fights at 14,000 to 25,000 ft peaked at true Mach 0.688 (300.7 KIAS at 21,211 ft, limit 301.7) at the start speed; no Auto move gains speed past its start.
  The correct engine-unit limit (same basis as the engine's IAS: min(VMO in EAS, IAS at true Mach 0.67)): 10,000 ft 312.3 (VMO in EAS) ; 15,000 309.8 ; 17,566 crossover ; 20,000 300.4 ; 25,000 270.0 ; 28,000 252.7 ; 31,000 236.1. This equals core's D328 modelMaxIasT6A (270 at 25,000 ft), which the PR did not use (the earlier commit in this same PR said "270 KIAS at 25,000 ft, 300 at 20,000"; the later commit switched to the NFM 279/309 figures and the Mach error came back).
- Dive check (item 3): a chaser diving from 19,000 to 25,000 ft (200 chase runs, pure and lead, auto moves, deck 2,000 to 6,000 ft): the peak chaser speed never went above limit minus 29 KIAS (guard is limit minus 40, overshoot up to 11 kt), true Mach at most 0.599, none over the limit. So the dive is capped at the right place in the model's own units; the error is the merge-speed acceptance and the guard's base, not the dive. (A forced split S from high speed can pass the limit unflagged; by design in the spec, and identical before the PR: 15 of 1,200 random forced runs, same on HEAD~1.)
- Fix: compare like with like. Either (1) hold the model to core's modelMaxIasT6A (D328/#232): merge check, the guard and the refusal text (which may also quote the NFM gauge figure, as D347 does); or (2) convert the engine's own state to the manual's basis before comparing: Mach = ktas / speedOfSoundKt(alt), CAS = machToKiasKt(Mach, alt), then test CAS <= 316 and Mach <= 0.67 (machToKiasKt already exists). Option 1 is cheaper and matches the rest of the model. Option 1 moves the crossover to about 17,566 ft, so any "exactly VMO up to 18,800 ft" test (energy-below-mmo.test.js, first test; and the "45 pinned fights at 17,000 ft and below" fingerprints, which stay clean below 17,566) must be rechecked. Also the spec lines 230, 302, 303 ("compared with the model's own IAS like VMO") need rewording.
- Already known/planned: yes (coordinator note, D328, D345, D347). Not a new find; confirmed and quantified.
- Missing test: tests/unit/turn-fight/energy-below-mmo.test.js (or energy-sim.test.js): "at the accepted top speed the true Mach (ktas / speedOfSoundKt) is <= 0.67 (+0.002) at every 500 ft from 17,600 to 25,000 ft, and 0.67 to 0.68 is never reached by the chaser guard's peak". The existing tests take their expected speeds from nfm-limit.js (the printed KIAS line), so they pin the mixed basis (their header says so) and cannot see this.

### N2 (Low) MPT speeds 120 to 124 are accepted but the MPT flies 125
- Where: MPT_KIAS_RANGE = [120, 175] (energy-sim.js :126) against the MPT bank floor MPT_BANK_MIN_DEG = 60 (:120), spec "kept within 60 to 85 deg".
- Steps: createEnergyFight({mptKias: 120, blueMove: 'mpt', redMove: 'mpt', pursuit: 'none', hardDeckFt: 2000}), 10,000 ft, from 160 KIAS; fly 120 s (scratchpad/en227/mpt.mjs, mpt2.mjs).
- Expected: the MPT holds the typed speed within about 1.3 kt (spec step 3, holds 160 +/- 5, and the audit's 1.3 kt), as it does for 130 (129.9), 160 (160.2 to 160.4), 175 (175.5 to 175.6).
- Actual: 120 flies 125.0 (124.2 to 125.7 at every altitude and entry speed), bank 60.0 deg, G 1.99 = the shaker, on the shaker; 122 gives 125.03; 124 gives 125.12; 125 gives 125.21. The 60 deg floor (2 G) cannot go slower than 125 at the shaker. mptReached still reads true (within 5 kt), so nothing flags it.
- Known/planned: no (D319/D337 chose 120 as the lower end; only the 175 end was tested).
- Recommendation: make the range 125 to 175, or lower the 60 deg bank floor when the MPT speed is under 125. Log it.
- Missing test: energy-sim.test.js, "an MPT speed at each end of MPT_KIAS_RANGE is held within 1.5 kt after 90 s at 10,000 ft".

### N3 (Low, PILOT JUDGEMENT) Auto's Immelmann at 241+ KIAS still takes 250 to 500 deg to reach the MPT
- Steps (scratchpad/en227/f2.mjs, f2c.mjs): Auto (defaults, pursuit none), merge speed k, read toMptDeg / toMptSec once mptReached. 10,000 ft: Immelmann picked 241 to 316: 278 deg at 241, 296 at 266, 267 at 301, 188 at 311 and 187 at 316. 8,000 ft: worst 302 at 258. 15,000 ft: worst 284 at 293. 20,000 ft (Immelmann 259 to 309): 501 deg / 45 s at 259 KIAS (only just over the 120 KIAS top-speed gate), 256 to 272 deg / 24 to 26 s from 264 up.
- Expected: SPEC step 2 aims under 180 deg for a pitch back or slice (SMM 14.17 para 42, 14.18 para 44); the Immelmann has no such aim (SMM 14.15: it is a large turn, a follow-on manoeuvre follows). So not a spec break; unchanged from #209 (279 to 295 deg then; 296 now at 10,000 ft) apart from the 20,000 ft figure, which #209 did not measure.
- PILOT JUDGEMENT: is a 501 deg / 45 s Immelmann-then-recovery at 259 KIAS at 20,000 ft a sensible Auto pick, when a pitch back reaches the MPT in 102 deg / 9 s from the same speed? Recommendation: keep the rule (it is the approved gate, SMM 14.15 entry 200 to 250), but raise the "Lowest Immelmann top speed" default from 120 to about 140 KIAS only if Dad agrees, and add "Auto's Immelmann above 250 KIAS: 190 to 500 deg to the MPT" to the Dad-check list. No code change until he answers.
- Missing test: energy-sim.test.js, "Auto's Immelmann pick from 241 to VMO at 8,000, 10,000, 15,000 and 20,000 ft reaches the MPT within 510 deg" (pins today's numbers; the existing 180 deg test now runs to 316 for the pitch back only).

### N4 (Low) F2's "under 180 deg" has almost no margin at 8,000 ft, and is over at the deck
- Steps: forced pitchBack, pursuit none, hard deck 2,000 ft; read toMptDeg (scratchpad/en227/f2c.mjs).
- Actual (deg to the MPT at 300/308/312/316 KIAS): 6,500 ft 168.7 / 177.2 / 180.2 / 184.2; 8,000 ft 162.2 / 170.7 / 175.1 / 179.8; 9,000 ft 160.0 / 168.7 / 173.0 / 178.0.
- Expected: spec step 2 "from 221 to 316 KIAS the pitch back reaches the MPT in under 180 deg (checked at 8,000 to 15,000 ft)", and "at the 6,000 ft deck 180 to 187 deg, held by a test to 190".
- Verdict: the spec is true as written (8,000 ft 316 KIAS 179.8 deg), with a 0.2 deg margin; a small retune breaks it. Not a break today. Recommendation: none, or note in the test.
- Test: covered (energy-sim.test.js :1112-1114, 221 to 316 KIAS before 180 deg, and :1677 at the deck to 190 deg). Nothing missing; the margin is just thin.

### N5 (Cosmetic) F5's stall text now reads "5.5000 G ... 5.4995 G"
- Steps: forced pitch back at 220 KIAS, blueForceG 5.5: "The pull needs 5.5000 G; the stall line at 202 KIAS gives 5.4995 G" (was 5.5 / 5.5). Right in that the two now differ, but four digits is heavy for a screen line. Recommendation: none needed; if wanted, two decimals with a "just" wording. Missing test: none.

### Also seen (not worth an ID)
- The MPT at 15,000 ft from a fast entry drifts up to 1.42 kt from 160 after 10 s (immelmann 230/240 KIAS, mpt 250). Identical on HEAD~1 (1.42), so not a regression; the spec's "about 1.3" is 1.4 at that height.
- Forced slice or split S from very low speed at 6,600 to 7,800 ft goes 400 to 700 ft under the hard deck (for example 40 KIAS at 6,612 ft, deck 6,000: min 5,369 ft), unflagged. Identical on HEAD~1, a forced what-if; known (D239).
- A merge at 316 KIAS at 6,500 ft: no change.

## Results by request

### 1. F1, slow forced slice: PASS
- Auditor's 1,224-case sweep (4 moves x 9 heights 10,000 to 25,000 ft x 40 to 140 KIAS x 2 MPT speeds; each case 150 s, default 6,000 ft deck; pass = min altitude >= 5,500, max KIAS <= 330, MPT reached and within 6 kt or level MPT at the deck): NEW 0 failures of 1,224. HEAD~1 on the same sweep (adding MPT 180): 6 failures of 1,836, all forced slice (60 KIAS/14,000 ft/MPT 175 and 70/14,000/180 dive to 330; 40/15,000/160; 75/16,000/180; 65/25,000/160; 90/25,000/175). Note the auditor's used MPT 160 and 180; the engine now refuses 180 (range 120 to 175), so I ran 160 and 175. The three MPT 180 cases (70/14,000, 75/16,000, 92/22,300) cannot be created on 8091f5e; the same slow-slice dive on HEAD~1 also fails at MPT 175 (60/14,000/175) and 160 (40/15,000, 65/25,000), and all pass now.
- The former failures at 160: 40 KIAS/15,000 ft: min 11,483 ft, max 171 KIAS, ends 160.3 in 150 s (MPT reached, climb -4.8 deg, 3.27 G); 65/25,000: min 17,601, max 172, ends 160.5. 92 KIAS/22,300 ft: in the sweep neighbours (90 and 100 KIAS at 22,300 ft).
- Wider fuzz: 2,500 random forced runs (slice x2 weight, mpt, pitchBack, auto; 13,000 to 25,000 ft; 40 to 180 KIAS; MPT 120 to 175; deck 2,000 to 7,500; pursuit none or pure), 150 s each. NEW: 0 anomalies (no vertical dive, no run under the deck by over 300 ft, none over the limit by over 15). HEAD~1: 6 vertical dives, min altitude -45,000 to -50,000 ft, 380 KIAS over the limit. 0 NaN in both.
- Test: the PR added it (energy-sim.test.js :1535, forced slice 40 to 90 KIAS, 15,000 to 25,000 ft, 200 s). Nothing missing; only MPT 160 and 175 are exercised (180 is now refused).

### 2. F2, pitch back over 220 KIAS: PASS (Immelmann unchanged: N3)
Forced pitch back, degrees / seconds to the MPT (HEAD~1 in brackets for 221 and 316):
| ft | 221 | 230 | 240 | 250 | 258 | 316 |
| 8,000 | 152 / 9.4 s (312) | 139 / 9.0 | 131 / 8.8 | 136 / 9.2 | 138 / 9.4 | 180 / 11.6 (405) |
| 10,000 | 144 / 9.3 (303) | 126 / 8.6 | 123 / 8.6 | 123 / 8.9 | 122 / 8.9 | 177 / 11.7 (391) |
| 15,000 | 105 / 8.0 (280) | 95 / 7.6 | 96 / 7.9 | 104 / 8.4 | 110 / 8.9 | 165 / 12.1 (360) |
| 20,000 | 80 / 7.1 (260) | 82 / 7.4 | 88 / 8.0 | 96 / 8.6 | 102 / 9.1 | 146 at 309 (327) |
Every forced pitch back from 200 to 316 KIAS (each of 4 heights): under 180 (max 179.8 at 8,000 ft 316; see N4). Auto's own pitch back range (every knot): 8,000 ft 221 to 238 KIAS, worst 154 deg at 222 (9.6 s); 10,000 ft 221 to 240, worst 144 at 221 (9.3 s); 15,000 ft 221 to 247, worst 105 at 221 (8.3 s); 20,000 ft 221 to 258, worst 102 at 258 (9.1 s). None reaches 180; none fails to reach the MPT. The band edges are unchanged from #209: Auto pitch back tops 238 / 240 / 247 / 258 KIAS at 8,000 / 10,000 / 15,000 / 20,000 ft. pickMove at 10,000 ft: 99 to 119 split S, 120 to 154 slice, 155 to 165 MPT, 166 to 220 pitch back, 221+ Immelmann (or pitch back where the top speed is under 120).
MPT hold at 160: 10,000 and 15,000 ft, entry 100 to 300 KIAS: 160.2 to 160.4 (in 90 to 120 s). Forced moves 100 to 250 KIAS x 6 moves x 2 heights: 192 of 192 reach the MPT, worst deviation 1.42 kt after 10 s, identical to HEAD~1. Immelmann at 241+: unchanged (N3).

### 3. Mach line: partly FAIL (N1)
- maxKiasT6A = 316 to 18,879 ft, 309.1 at 20,000, 279.1 at 25,000, 245.3 at 31,000: PASS (matches the NFM line within 2 kt).
- CAS versus CAS: FAIL, see N1. Other places a TAS, EAS or model-IAS is compared with the CAS limit: (1) merge speed check :323-326 (typed KIAS, model IAS = EAS, against the CAS line); (2) the chaser guard :1029-1030 (ac.kias = tasToIasKt(ktas) against maxKiasT6A - 40); (3) immelmannMinTopKias upper bound :341 (against vmoKias, EAS; harmless). Every other KIAS in the engine (stall, shaker, MPT speed) is the model's IAS by design (D273).
- 25,000 ft chaser dive: capped at the guard (limit - 40 + <=11 KIAS), true Mach at most 0.60; not a source of the error.

### 4. F3 to F8 and S1
- F3 PASS: {blueKias 70, redKias 70}: stall true and reason "70.0 KIAS is below the 86 KIAS stall speed" at T+0 and after 5 steps; 100 KIAS false; 85.9 true, 86.0 false.
- F4 PASS: state.evenFight is false at T+0, true for the default mirror fight after the nose-on (first nose-on "both" at 31.1 s, no chase; true at the 10-minute stop); false for 250 v 200 (no first-nose "both"), false with chaseAfterHeadOn (a chase starts), true with pursuit none and 230 v 230. (1 to 12 ft passes remain by design, D152.)
- F5 PASS (cosmetic N5): equal text no longer shown.
- F6 PASS: forced MPT with forced 8 G at 240 KIAS shows OVER G ("8.0 G is above +7 G") and STALL on the same first step (also 250/9 G, 200/8 G, 160/8 G); 7.5 G at 240 shows OVER G only. overGEver latches. (OVER G is one 0.02 s step; the screen needs the "ever" reading to show it.)
- F7 PASS: pickMove(119.9) "119.9 KIAS, below 120"; 120.01 slice; 220.1 "Immelmann: 220.1 KIAS, above 220"; 219.9 pitch back; integer speeds unchanged.
- F8 PASS with N2: MPT_KIAS_RANGE = [120, 175] exported; 100, 119, 176, 180, 200 refused with the range in the message; 175 from 7,000 ft over a 6,000 ft deck: min 5,998 ft (2 ft), 120 and 130 stay above the deck. D319/D337.
- S1 PASS: spec line 283 now "about 69 deg (the chart bank, D143; SMM 70 to 75)". Level MPT bank 68.5 deg.
- evenFight on the default mirror fight: set (item F4).

### 5. Regressions: all PASS
- Energy accounting (en209/r12: 6 moves x 5 speeds x 2 heights, 100 s): worst 10.5 ft (immelmann 140 KIAS, 8,000 ft), same as #209.
- Split S versus core splitST6A (en209/r3, 8 cases): loss from entry, from the top, exit KIAS and peak G agree to 5 ft, 1 kt, 0.1 s (110 KIAS/10,000 ft: 1,689 from entry, 1,976 from the top, 5.00 G; core 1,688 / 1,976 / 5.00).
- Level MPT: 146.4 KIAS / 68.5 deg / 2.72 G / 6,000.0 ft at the 6,000 ft deck; 145.3 / 68.1 / 2.68 at 8,000 ft.
- Pure/Lead/Lag ordering (en209/r9): 424 / 186 / 662 ft (100 v 220), 164 / 122 / 222 (1-circle 220 v 200), 134 / 168 / 674 (300 v 280 with head-on chase), identical to #209.
- Fuzz (en209/fuzz5 adapted to the new ranges: 1,500 extreme starts, model settings stall 60 to 110, shaker 0.7 to 1, roll 20 to 180, MPT 120 to 175, forced G 0 to 12, speeds capped at the limit for the height): 4.5 million steps, 0 NaN, 0 unexpected throws, stepping in odd chunks equals 0.02 s steps 1,500 of 1,500 (deterministic).
- npm test: 3,019 pass, 0 fail, 8 todo.

## Decision log (decisions-for-review.md)
D318 (Energy top speed = maxKiasT6A directly) is the call that N1 shows wrong; D345 reverses it (model's own limit), D328/D347 give the model-basis limit (270 at 25,000 ft, refusal quotes 279). My numbers agree with D328/D345 (270.0, 300.4). D319 (MPT box 120 to 175) needs N2 (the low end is not flown). D336/D337/D338 are screen calls for later. No logged call for this module contradicts the SMM or the manuals; D318 contradicted the spec's "model IAS" basis in the part above 17,566 ft, now being fixed.

## Missing tests, one line each (owner adds)
- N1: tests/unit/turn-fight/energy-below-mmo.test.js: true Mach (ktas / speedOfSoundKt) at the accepted top speed <= 0.67 at every 500 ft from 17,600 to 25,000 ft, and a fight at the limit shows it after 20 s.
- N2: tests/unit/turn-fight/energy-sim.test.js: the MPT holds the typed speed within 1.5 kt at both ends of MPT_KIAS_RANGE.
- N3: energy-sim.test.js: Auto's Immelmann from 241 to VMO at 8,000, 10,000, 15,000, 20,000 ft reaches the MPT within 510 deg (pins the numbers).
- N4, F1: already covered by the PR's tests (:1112-1114, :1677, :1535); none missing.
