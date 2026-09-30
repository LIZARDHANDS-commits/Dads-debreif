# Core Mach limit (#211, d5ec406)

Script: scratchpad/mmo/m.mjs (worktree wt-core at d5ec406). Unit tests: 2567 pass, 0 fail.

NFM: VMO 316 KIAS up to and including 18,769 ft; above, MMO 0.67 IMN; Fig 5-3 shows 244 KT at the top (31,000 ft).
Standard compressible CAS for M0.67 (ISA) reproduces the NFM: crossover 18,879 ft, 245.3 kt at 31,000 ft.

maxKiasT6A (model IAS = TAS x sqrt(sigma), no compressibility) against the NFM:
| ft | code | NFM-style CAS |
| 17,600 | 315.8 | 316 |
| 18,769 | 308.2 | 316 |
| 20,000 | 300.4 | 309.1 |
| 25,000 | 270.0 | 279.1 |
| 31,000 | 236.1 | 245.3 (NFM 244) |
Crossover 17,566 ft vs NFM 18,769 ft.

MMO-1 (Low): the limit line is 8-9 kt under the NFM from 18,769 to 31,000 ft and bites 1,200 ft early. It's on the safe side and the code comment says so, but "a few knots" undersells 9 kt. Energy fights above 17,600 ft will cap top speed up to 9 kt low.
Recommendation: use the standard compressible CAS formula (a few lines, no library) so the line matches NFM 18,769 ft / 244 kt within about 1 kt. Otherwise log it as a review row.
Missing test: pin the NFM points (316 at 18,769 ft, 244 +/- 2 at 31,000 ft).
Passed: mmo 0.67; VMO 316 below; NaN/Infinity throw RangeError; speed of sound 661.5 kt at SL, 573.6 at 36,089+.

## Audit (auditor agent) — corrections override the text above
- Numbers confirmed: the code line is 7.8-9.2 kt low from 18,769 to 31,000 ft (7.9 kt under the NFM's 244 at 31,000 ft) and crosses 316 at 17,566 ft, against 18,769 ft.
- Corrected impact: nothing in src calls maxKiasT6A yet. The Energy VMO guard is still a flat 316 (energy-sim.js:992), so the low cap only bites once Turn Fight switches to it (planned next).
- Corrected missing test: the NFM points are already pinned through a test-only compressible formula (t6-performance.test.js:78-89), and :91-104 pins today's low line on purpose. The gap is a test holding maxKiasT6A itself to the NFM within about 1 kt; it would fail today.
- New (Low, MANUALS rule): T6A_LIMITS comment, t6-performance.test.js:61/78 and SPEC-core.md:130 cite "NFM Fig 4-1-2". The limits are NFM Fig 5-3 (text pp. 5-8/5-9); no manual contains "4-1-2".
- Recommendation: switch maxKiasT6A to the standard compressible CAS (the test already has the formula) before Energy adopts it, and fix the figure ref.

## Re-check after #218 (6866ab0), 13:20Z: PASS
- maxKiasT6A now matches the standard compressible CAS for M0.67 to 0.1 kt at every height from 0 to 31,000 ft. It holds 316 KIAS until 18,879 ft (NFM 18,769, a 110 ft difference from the NFM's own rounding) and gives 309.1 at 20,000 ft, 279.1 at 25,000 ft and 245.3 at 31,000 ft (NFM Fig 5-3: 244).
- The "Fig 4-1-2" citation is gone from src, specs and tests.
- NaN and Infinity still throw.
- npm test: 0 fail.
- Note (none): above 36,089 ft the code (199 KIAS at 40,000 ft) is more correct than my checker formula, which held pressure flat there. This is above the T-6A ceiling.

## Core #232 (2fb0de3) re-check, 15:30Z: PASS
- modelMaxIasT6A(h) (model basis) holds 316 up to 17,566 ft, then gives exactly true Mach 0.6700 (TAS ÷ speedOfSoundKt) at every height: 307.5 at 18,879, 300.4 at 20,000, 270.0 at 25,000 and 236.1 at 31,000.
- maxKiasT6A (display, compressible CAS) is unchanged and matches NFM Fig 5-3: 316 to 18,879 ft, 309.1 / 279.1 / 245.3.
- NaN and Infinity throw RangeError. No "4-1-2" left.
- The two agree in meaning: the same true Mach 0.67, on two bases. Energy must use modelMaxIasT6A against its own IAS; the #227 re-check covers that.
