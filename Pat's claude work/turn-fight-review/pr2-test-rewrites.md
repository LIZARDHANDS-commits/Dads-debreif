# Fight Sim PR 2: rewritten tests (for Patrick's look before merging)

G and roll now build smoothly (6 G/s, 360°/s², both estimates), so these 11 tests that expected an instant G or roll were recast as what a pilot sees. Old check → new check.

1. **Forced past the NFM line (split S).** Old: a 265 KIAS split S from 10,000 ft peaks over 316 + 1 KIAS. With G building it peaks at exactly 317, so the case now starts at 300 KIAS (still a legal merge speed). Still checks: not held at the limit, keeps flying, slows again, stays above the ground.
2. **A pull past the rolling limit shows OVER G.** Same check. The setup now turns off the chase after the head-on, which had cleared the forced G before the roll counted as rolling.
3. **316 KIAS head-on: Red picks the Immelmann.** Old: over the top at exactly 175 KIAS, and Blue picks a pitch back. New: over the top within ±10 kt of 175 (it gives 174). Blue now picks the Immelmann too (see note A), so Blue's line only checks that it names its move with a reason.
4. **The race decides when a chase from behind is on offer.** Same picks and race. The card text may now say "later" for the other move, as well as "no nose-on in N s".
5. **The split S is core's.** Old: within ±5 ft, ±0.05 G, ±3 kt, ±8°. New: the shared margins (±100 ft, ±0.5 G, ±10 kt, ±5°). The real gaps are tiny: up to 13 ft, 0.02 G, 0.5 kt, 0.1°.
6. **A pitch back holds about 5 G.** Old: every step within ±0.35 G from the first step. New: after 1 s for G to build, 5 G (4.7 G while rolling, or the shaker if lower) ±0.5 G. New check: G never changes faster than 6 G/s (no snaps).
7. **An Immelmann holds about 5 G, then the shaker.** Old: ±0.02 G from the first step. New: same as 6.
8. **A set G of 6 while rolling gives OVER G.** Old: the flag at 6.0 G. New: the flag comes on while rolling, above 4.7 G and below the 6 G set (first flag at 4.81 G), with the reason naming 4.7. The default 4 G half is unchanged (no OVER G ever).
9. **OVER G at the 7 G boundary.** Old: read after a fixed 0.4 s, when the slower roll hadn't finished. New: read once the roll has finished. Same boundary: 6.99 and 7.00 give no flag, 7.01 does.
10. **The stall reason never shows the same number twice.** Kept: "needs 4.90 G; gives 4.88 G" at 190 KIAS. Dropped: the guarantee that a 5.5 G run shows the "just over" wording, because with G building that run no longer passes that close. Every reason shown must still be two different numbers or "just over".
11. **The settings groups cover every key once.** Old: exactly 16 model settings (stale with the two new boxes). New: every key is in exactly one group. No count.

## Notes

- **A. Blue's pick at 316 KIAS head-on changed from pitch back to Immelmann.** This came from a bug fix, not from the smoothing. Auto's look-ahead copies didn't update energy height, but the tactical-advantage chase start reads it, so the race could predict a chase the real fight never had. With that fixed, neither move gets a chase in the 60 s look-ahead, and the pick goes by the geometry, like Red's.
- **B. Also fixed in PR 2:** a pitch back at 312 KIAS went near vertical because the slower roll-in let it climb past 75° before handing over. It now hands to the MPT a little earlier (look-ahead 4.0 s, was 3.7 s; a model setting, estimate), turning 190 to 279°.
- **Untested or unseen:** none of this has been seen in the app yet. The four edited test files pass locally. CI will check the whole suite.
