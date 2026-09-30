# Debrief final check (light): PASS with 3 items

Checked on 6b0ed65 (#237, live build same commit). Scope: flight numbers against the manuals (about +/-1 kt, 50 ft, 1 deg, 1%) and safety items, on the Example flight (18:19:04Z to 20:03:52Z, 4 ships). Read-only. `npm test`: 3,165 tests, 3,157 pass, 0 fail, 8 todo. Scripts: scratchpad/chk/*.mjs (own projection, own G, bank, ISA, CAS and wind-vector maths, not the app's code).

## Findings

**F1 (Medium, safety): Lead's FAST / SLOW verdict ignores wind, and the card does not say so.**
- Expected: target 220 KIAS low block, 200 KIAS mid block (Gen Book p.12; D115). The verdict compares KIAS, so GS must be turned into TAS with the wind first.
- Actual: est. IAS = GS x sqrt(density ratio) (`estIasKt`, readouts.js). "No wind" is said only under the EM chart (layout.js:450), not on the Lead line. With the Open-Meteo wind the same Lead line already quotes (192 deg / 24 kt at about 12,000 ft, 9-point fixture, own vector maths), a wind-corrected IAS differs by up to 20 kt, and the FAST/SLOW call (+/-10 kt) differs in 191 of 468 sampled Lead seconds (start+1500 to +4000, mid block). Example start+1510: GS 263 kt, card 219 kt est. IAS ("FAST, target 200"); with wind about 200 kt, on speed.
- Recommendation: add "(no wind)" to the Lead line's est. IAS wording, or wind-correct it from the model wind when that is on. Patrick or Dad decides; the caveat costs nothing.
- Missing test: tests/unit/debrief/readouts.test.js, a Lead line at 24 kt wind (headwind and tailwind) where the verdict follows TAS, or the caveat text is present.

**F2 (Medium, safety): GPS spikes show as real over-G, overspeed or a high G at a speed the aircraft cannot fly.**
- Expected: G at most 7 (V-n, formation-and-turn-numbers.md "T-6A performance charts", +7/-3.5, VMO 316 KIAS), and G below the stall line, about (KIAS/86)^2, so 0.5 G at 62 KIAS. A glitch should read "--".
- Actual (default settings, est. G): (a) start+1779 to +1783 (18:48:43Z), Lead, fixes at start+1779 and +1784 are exactly 5 s apart, so it is not a "gap" (GAP_S is "more than 5 s", clean.js:22): GS 427 kt, est. IAS 352 kt, G 6.55 to 7.0, Lead line reads "352 kt est. IAS, 7.0 G, FAST, HIGH G". (b) #2 at start+2187 to +2191 (18:55:31Z): 5.62 G at 62 kt est. IAS, 5.36 G at 120 kt, 3.24 G at 109 kt (stall-line limit 0.5, 1.9, 1.6 G). (c) 298 airborne ship-seconds have GS over 300 kt, 66 over 350 kt, maximum 583 kt (#4 at start+2352, 554 kt). Only about 10 ship-seconds of 16,778 are affected, so most of the flight is right; the wrong ones are the ones a debrief would stop on.
- Missing tests: tests/unit/debrief/readouts.test.js, over the Example flight no ship row with est. G above the stall-line G for its est. IAS, and no Lead FAST/HIGH G verdict with GS over 350 kt. tests/unit/flight-data/clean.test.js, a hole of exactly GAP_S seconds (5 s) is a gap, or at least not a turn.

**F3 (Low): bank and G beside it disagree in 2.6% of estimated seconds.**
- Expected: in a level turn bank = acos(1/G), same second (+/-1 deg; spec M2, D194).
- Actual: of 7,897 airborne seconds with estimated G and bank, 203 differ by over 1 deg, 37 by over 3, 11 by over 5; worst start+2189, #2: G 1.21 shown with bank 50 deg (physics gives 34). Cause: bank uses the one-second segment GS, G the 3 s window average.
- Missing test: tests/unit/debrief/readouts.test.js, where estimated G and bank are both shown, |bank - acos(1/G)| is 1 deg or less on the Example flight (or the GS in `shipBank` is the window's).

## Checked and PASS (within tolerance)
- Est. G vs own level-turn G = sqrt(1+(V w/g)^2): 17,319 seconds, largest difference 0.015 G. bankDegFromG(3) 70.53 deg, turn radius at 220 KTAS and 3 G 1,515 ft (V^2/(g tan phi)) and 14.04 deg/s, all exact. EM chart turn rate against the G-derived rate: median ratio 1.008 (single-second noise, quartiles 0.86 to 1.13).
- IAS/GS: est. IAS equals GS x ISA sqrt(sigma) to 0.00001 kt. Against CAS the estimate is low by 0.5 to 0.7 kt at 200 to 220 kt (inside 1 kt), 1.4 to 2.4 kt at 250 to 300 kt TAS (note only; Low block and Mid block speeds are inside).
- Spacing: own interval, fore/aft and sweep against the Formation card for 4,067 wingman readings (every 3 s): labels agree except 11 that sit within 0.1 deg or 15 ft of a limit. TIGHT under 4,000 ft, WIDE over 6,000 ft, sweep 0 to 10 deg (FORE/AFT), #3 offset 7,000 +/-1,000 ft (SMM 16.18 para 49, 16.41 para 109), #4 measured from #3 when #3 is 500 ft or more out on the same side. Range and 3D range within 0.4% (my projection); aspect and HCA follow SMM 12.2 paras 6 and 9 (aspect is Lead's, seen from the wingman; 0 at Lead's tail).
- Wind: HRDPS pressure-level blend at 8,000, 10,000, 12,500 ft at 19:10Z (live 9-point reply, own vector blend by height then by hour, levels under the ground left out) equals `windAt` to 0.1 deg and 0.1 kt; words are "from", true, to 10 deg, knots.
- Time: 18:19:04Z shows 12:19:04 CST (UTC-6, Regina, offset -360); winter and a Winnipeg home also correct.
- Saved file: example flight saved and reopened, 899 sampled seconds, every readout identical (0 differences), same start, end, DFPs and cleaning.

## Notes (no finding)
- Local time follows the home airfield's zone, not the flight's; it is labelled with the zone name, so safe.
- Dad's V6 cleaning limit is 450 kt a fix pair, which is why 350 to 450 kt spikes pass (F2).
