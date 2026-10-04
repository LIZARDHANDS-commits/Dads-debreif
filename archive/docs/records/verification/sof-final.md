# SOF final check (light), main 8543131

**Result: PASS with 1 note (live site not yet on #238). No High, no Medium, no Low findings.**

Checker: read-only. Worktree `scratchpad/wt-sof` at 8543131. Scripts in `scratchpad/fin/` (wx.mjs, wx2.mjs, f1.mjs, f4.mjs, ltg.mjs, time.mjs, stale.mjs). No screenshots (no safety or number problem).
`npm test`: 3153 tests, 3145 pass, 0 fail, 0 skipped, 8 todo.

## Earlier HIGH findings
- **F1 (near-home lightning caution lost when the refresh fails or goes stale): FIXED** (D352, D353, #236). Drove `createLightningWatch` with a fake clock and feed and ran the banner list (`evaluate`):
  - Cell 12 NM east, radius 20: banner line raised. Next GetMap 503: line stays, same key, text "...within 20 NM (can't tell now, last seen N min ago)", still there at +60 min.
  - Acknowledged caution stays acknowledged through the outage. Picture that comes back with an old layer time (55 min): line stays. A good clear reading removes it.
  - No reading yet and feed down: plain "Lightning: can't tell" line, never clear. Clear, then a 12 min blip: no line; at 52 min: "can't tell" line (D353).
- **F4 (lightning nearly invisible on satellite): FIXED** (D355, #236). Mark is yellow (255,232,0) with a near-black (16,16,16) outline. At the default 85% layer opacity, worst of (yellow, outline) against the background is at least 4.1:1 over dark, olive, mid-grey and white backgrounds (yellow 5.8 to 7.7 on the two satellite samples from the earlier check, outline 4.1 on mid-grey, 10.6 on white); yellow to outline is 11:1. Above 3:1 everywhere at default. Stale picture fades to 40% and can drop to about 2.5:1 to 3.4:1; this is logged in D355 and the layer says STALE in words, so not a finding.

## Safety and limits (all PASS)
- Hand-made METARs, 33 cases, home 2000/3, cross-country 3000/3, alternate 600-2, 400-1, 800-2 (Gen Book p.7, D72, D111): every level as expected (below is strictly less; exactly on the limit is "at-limit", never OK-green; unknown sky or visibility is "unknown", never within). Metric 4800 m reads 2.98 SM and is below 3 SM; 5000 m is 3.1 SM and within; 0800 is 0.5 SM. M1/4SM, P6SM, VV, CB/TCU, TS, FZRA, FG (caution), BCFG and SHSN (no caution) all as in `src/wx/limits.js`. (One of my own cases was mis-typed; the tool was right.)
- TAFs, 12 alternate and 7 home cases: TEMPO, BECMG worsening, FM below, at-limit, outside window (meets), not covered, NIL and CNL (no-taf) all correct. D72: PROB30 and PROB30 TEMPO below 600-2 with landing minima unset leave the status "meets" and are listed in `probUnchecked` (as D72 and D189 decide); with landing minima 500-1 set, the same PROB is "below". D111 home trigger: TEMPO and PROB below the home limits give "below"; 2500 ft is below under 3000/3 and meets under 2000/3; no sky group gives "incomplete".
- Stale data: METAR at 74 min is fresh, at 76 min reads "Unknown: report is 1 h 16 min old" (never "Within limits"); a stale below-limits report stays "Below limits ... (STALE report)"; an ended TAF reads "STALE: valid period ended 42 min ago".
- Times: local to Zulu for waves across midnight and across DST. Regina (CST, no DST) 08:00 to 14:00Z, 20:00 to 02:00Z next day; Edmonton MDT and MST; Toronto across the 8 Mar and 1 Nov 2026 changes. Local "today" date uses the home zone. Wave window is takeoff to landing plus 1 h (Gen Book p.7). DTG `301705Z SEP 26`, zone names CST and MDT correct.
- Lightning math: distance equals an independent haversine to 0.01 NM at 0.3 to 49 NM; bearings 0/89/180/271 for N/E/S/W and the eight-point words correct. Cell centre up to 1 NM beyond the radius counts as near and is worded "at the edge of the N NM radius"; 21.5 NM with radius 20 is clear. Radius is clamped to 5 to 50 (NaN gives 20). A pixel placed 12 NM east decodes to 11.8 NM (pixel is 0.67 NM).

## Numbers against manuals
- Home triggers 2000/3 (MTCA) and 3000/3 (cross-country): Gen Book p.7 and D111, match. Alternate minima 600-2 default, 400-1, 800-2: Gen Book p.7 and D72, match. GNSS separation 100 NM: Gen Book p.7 NOTE and D73, match. Visual descent MEA + 500 ft: D80.
- Crosswind components and formation crosswind limits (15/10/5 kt, Gen Book p.10): not built in SOF (FF20 and FF21, SPEC-sof line 340). Nothing to check; not a bug.

## Note (not a finding)
- Live site at check time reports `app-version 82f39fe` and its SOF chunk has #236 (yellow mark, "can't tell now") but not #238 (no "Map key", no stored lightning episode). The Pages deploy for 8543131 was still running, so the live site is one merge behind. Everything above was checked on 8543131 source. Patrick's click-through should wait for that deploy.
- Logged calls for SOF (D72, D189, D220, D221, D223, D315, D322, D352 to D355, D278): none contradicts Gen Book p.7 or the spec.
