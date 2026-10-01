# Verification (independent checks of main)

Owner: the "Verification" thread. Read-only checker: reproduces problems, a second agent audits them, then the coordinator routes them to the owning thread. Manuals cited by ref only.

First full pass, 2026-09-30 09:20-10:40Z:

| Module | File | Main checked | Result |
|---|---|---|---|
| Core T-6A model | core.md | 94b00a1, re-checked 39d4abf | 0 High, 3 Med; closed by #184 except stall 86 (Patrick's pick, review row) |
| Turn Sim | turn-sim.md | 94b00a1 | Known SMM misses still present (tasks 11/15); new TS-06 High (FORE/WIDE noise), TS-07 box opens WIDE |
| Debrief | debrief.md, debrief-recheck-182-186.md, debrief-recheck-194.md | 94b00a1, 8e7cafb, 96192a2 | Numbers match V6; M2-M4 fixed by #194, M1 partly (85% TIGHT waits on a default-standards decision); W1-W5 model wind open |
| Turn Fight | turn-fight.md | f35aaad | Geometry passes; TF-1 "Sustained G" label |
| Traffic | traffic.md | f35aaad (#183 engine) | TR-01 High Reset click; TR-02 final-turn plunge plan gap; V6-pinned Mediums planned |
| SOF | sof.md | f35aaad | SOF-01 TAF window from midnight; AF-1 stale reports green (in app-frame.md) |
| Weather parser | wx.md | 6540ccf, 2c2e000 | WX-1, WX-3, WX-5, WX-7 fixed by #193; WX-2 PROB stays (D72, review) |
| App frame / airfields | app-frame.md | 6540ccf | AF-2 narrow widths; AF-4, AF-5 Low |

Re-checks after fixes (2026-09-30 10:40-12:40Z): core-t6a (#184), wx (#193, #198), debrief-recheck-194.md, debrief-recheck-204.md, debrief-recheck-182-186.md (#199), app-frame-recheck-195.md, sof-recheck-197.md, turn-sim-recheck-189.md (SMM turns fixed; N1/A1/N2 controls open), traffic-e2e-07c73e4.md (Traffic end to end), turn-fight-recheck-188.md, turn-fight-recheck-208.md (start geometry).


- 12:50Z: Turn Fight Energy engine #209 checked ([turn-fight-energy-209.md](turn-fight-energy-209.md)): F1/F2 Medium, P1 for Dad, S1 wording. Core Mach limit #211 ([core-mmo-211.md](core-mmo-211.md)): line 8-9 kt under NFM, wrong figure ref.
- 13:20Z: Core #218 re-check PASS: the Mach limit now matches NFM Fig 5-3 (see core-mmo-211.md).
- 13:40Z: Debrief #213 re-check PASS: wind arrows correct, and the live 9-point Open-Meteo reply matches the fixture's structure (see debrief-recheck-213.md). L1 is closed; 5 Low.
- 13:55Z: Traffic #216 re-check (traffic-recheck-216.md): rewind is exact (41k comparisons) and setups round-trip. RW-01 Medium: Clear/✕ rewrites the past (D265 vs spec goal 6). Rest Low.
- 14:10Z: Turn Fight #219 re-check PASS (turn-fight-recheck-219.md): TF3-1 to TF3-10 and Obs A fixed (TF3-8 partial); the graphics-reset fallback works. 11 Low.
- 15:05Z: SOF #221 re-check PASS (sof-recheck-221.md): R1, R2, R3, R5, R6, R7 and R11 fixed; 5 new Low. The live site hadn't deployed #221 at check time.
- 15:30Z: Turn Sim #215 re-check (turn-sim-recheck-215.md): N1, N2, N4 and N6-N9 pass, A1 per D249, N10 partial. F3 Medium: in-place 90 ends flagged TIGHT/FORE (pre-existing; SMM para 59).
- 15:45Z: SOF map #207 re-check (sof-recheck-207.md): 2 HIGH, F1 near-home lightning caution drops off the banner on a failed/stale refresh and F4 lightning near-invisible on satellite. Still on main.
- 15:30Z: Debrief #224 re-check PASS (debrief-recheck-224.md): the radar/lightning save round-trip is byte-exact and works offline, size limits are exact, 36 hostile files are safe, and W1/W2/W5 are fixed. F1 Medium: the Weather menu is taller at 1280x720/1366x768. 8 Low.
- 15:40Z: Turn Sim #223 re-check (turn-sim-recheck-223.md): the check turn matches SMM Figs 16.17/16.31/16.34 and N3 is closed. C1 Medium: the check is flown at any Turn degrees and breaks away from 45. C3 cue and D281 delay are for Dad.
- 15:45Z: Energy #227 re-check (turn-fight-energy-227.md): F1-F8 and S1 PASS (slow slice 0/1,224 fail; pitch back at most 180°). N1 Medium confirmed: the Mach guard flies true M0.689-0.696 (fix = modelMaxIasT6A, D328/D347).
- 16:05Z: SOF #228 (sof-recheck-228.md): marks sit on the right words (390 real checks + 71 edge cases). M3 Medium: the banner is 2x taller and the cards go below the fold at 1920. M2/L2 pilot judgement, M1 Low. SOF #221 is confirmed on the live site.
- 23:15Z: Turn Fight Milestone 2 / Gate 2 verification PASS ([turn-fight-verification.md](turn-fight-verification.md)): 504/504 unit tests green, 67/67 Playwright E2E tests green, 0 typecheck errors, build clean. 8 forensic traps neutralized, Tactical 3D Suite (D392) and Immelmann 5.0 G shaker-ride law (D393) verified. Gate 2 sign-off ready.

