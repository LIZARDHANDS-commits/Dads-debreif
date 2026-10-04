# Findings: weather parser (src/wx), main 6540ccf

Checker: independent, read-only. Scripts are in `findings/wx/scripts/` (a1 to a11, fuzz). Run from the worktree with plain `node`.
Authorities used: SPEC-wx (D57 to D81, D111, D140), manuals `weather-and-limits-numbers.md` (Gen Book p.7 rows), `canada-ifr-alternate-rules.md`, V6's own SOF functions via `tests/unit/wx/v6-sof.js`.
Decisions log `/mnt/project-files/logs/decisions-for-review.md` was read: it has no weather or shell rows (all Turn Sim, Turn Fight, Traffic, T-6 manuals), so nothing there contradicts the manuals or spec for this area.

Counts: High 0, Medium 3, Low 5. Four PILOT JUDGEMENT items (with recommendations) at the end.

## Findings

### WX-1 (Medium) A change group whose end is before its start raises no problem, so an unreadable TAF can read "meets"
- Where: `parseTaf` / `homeAlternateTrigger` / `assessAlternate` (src/wx/taf.js, `period()` and the "outside the valid period" check).
- Steps: `parseTaf('TAF CYMJ 291120Z 2912/3012 27010KT P6SM SKC TEMPO 2920/2916 1/2SM FG OVC002', {now: 2026-09-29T11:30Z})`, then `homeAlternateTrigger(taf, {from: 29 14Z, to: 29 17Z}, DEFAULT_LIMITS.home)`.
- Expected (SPEC-wx "TAF groups and timeline": anything that makes the forecast less than fully readable is listed in `taf.problems`; task rule: unreadable gives 'incomplete', never 'meets'): a problem is listed and the status is `incomplete`.
- Actual: `problems: []`, TEMPO is read as 29 Sep 20Z to 29 Oct 16Z (`to` is pushed a month on), and the window 14 to 17Z gives `meets`. A typo'd `TEMPO 2916/2916` becomes a 30-day group; `BECMG 2915/3100` becomes 15 Sep to 31 Oct. Only the valid-period check has a plausibility test; group periods have none.
- Screenshot: none (Node). Output in `findings/wx/scripts/a9.mjs`.
- Known/planned: not in tasks/wx/todo.md or the spec.
- Missing test that should have caught it: `tests/unit/wx/taf.test.js`: "a TEMPO, BECMG or PROB period that ends before it starts, or lasts longer than the TAF's valid period, is listed in problems and the home and alternate status is 'incomplete'".

### WX-2 (Medium, PILOT JUDGEMENT) A PROB30/40 group below the alternate minima gives status `meets` whenever landing minima are not set, and they are not set by default
- Where: `assessAlternate` (src/wx/alternates.js) with `landingMinima` absent; `probUnchecked`.
- Steps: `assessAlternate(parseTaf('TAF CYQR 291140Z 2912/3012 27010KT P6SM BKN040 PROB30 2916/2920 1SM -SHRA BR BKN005'), {from: 15Z, to: 17Z}, {})`.
- Expected (SPEC-wx says this is by design: "listed in `probUnchecked` as a warning and does not change the status"; CAP GEN / TC AIM RAC 3.13: PROB must not be below the landing minima): matches the spec.
- Actual: status `meets`, `probUnchecked` holds the 500 ft / 1 SM piece. `airfields.checkOptions` only supplies landing minima when both lowest HAT and lowest vis are typed, so by default every alternate's PROB groups are unchecked and the alternate reads green.
- Why it matters: it conflicts with the working rule "anything that cannot be checked must not say meets".
- PILOT JUDGEMENT: should a forecast that could be below the landing minima at an alternate read the same as a clean one? Recommendation: keep `meets` out of it. Return `incomplete` (amber, "PROB30 below 600-2, landing minima not set") when `probUnchecked` is non-empty, and let the SOF card say so in words. This is a one-line status change plus a spec line, so owners can act on it.
- Missing test: `tests/unit/wx/alternates.test.js`: "a PROB group below the alternate minima with no landing minima is not reported as meets" (after the decision), and `tests/unit/sof/cards.test.js`: "probUnchecked is shown on the alternate card".

### WX-3 (Medium) CAVOK in the same group as a visibility or cloud silently overwrites the worse values
- Where: `readConditions` (src/wx/conditions.js, `CAVOK` branch sets visibility, clears sky and weather).
- Steps: `parseTaf('TAF CYMJ 291120Z 2912/3012 27010KT 1SM OVC010 CAVOK')` then `homeAlternateTrigger` for 14 to 17Z.
- Expected: contradictory text is unreadable: a problem is listed, status `incomplete`.
- Actual: visibility becomes 10 km, the OVC010 is dropped, `problems: []`, status `meets`. Home limit is 2000 ft, so a 1000 ft overcast reads as clear.
- Known/planned: no. Real feeds do not send this, so the odds are low; the failure is silent and optimistic.
- Missing test: `tests/unit/wx/conditions.test.js`: "CAVOK together with a visibility, cloud or weather group in one group is listed as unread, not accepted".

### WX-4 (Low) Metric visibility is not rounded to the statute miles a pilot expects: 4800 m reads 2.98 SM, below a 3 SM limit
- Steps: `parseMetar('METAR CYMJ 291500Z 27010KT 4800 BR BKN020 ...')`; `checkConditions(..., home)`.
- Expected: ICAO/NAV CANADA treat 4800 m as the 3 SM step (Canadian METARs never use metres; the feed for KGGW etc. is statute miles too, so this only bites a non-North-American station added later).
- Actual: `VIS 4800 m < 3 SM`, level `below` (and 800 m reads 0.497 SM against a 1/2 SM limit). Same value V6 gave (2.9826), so this is pinned V6 behaviour, not a regression.
- PILOT JUDGEMENT: recommendation: leave as is until a metric station is added; then convert with the standard table (800 m = 1/2, 1600 m = 1, 4800 m = 3, 8000 m = 5).
- Missing test: `tests/unit/wx/limits.test.js`: "metric visibility on the standard SM steps (4800 m against 3 SM)".

### WX-5 (Low) Category and NATO colour say VFR/BLU when there is no cloud group at all, while the limit check says `unknown`
- Steps: `parseMetar('METAR CYMJ 291500Z 27010KT 15SM 10/08 A2995')`: `flightCategory` VFR, `natoColour` BLU, `checkConditions.level` 'unknown' (ceilingUnknown true).
- Expected (SPEC-wx "Classifications": UNK when nothing is known or a layer base is unknown; "never guess a value the report does not give"): UNK on both chips.
- Actual: green VFR / BLU chips beside an "Unknown" card level. A METAR with no sky group is malformed, so rare. Matches V6.
- Missing test: `tests/unit/wx/limits.test.js`: "no cloud group and no SKC/CLR/NSC/NCD gives category UNK and colour UNK".

### WX-6 (Low) A TAF with no issue time, or no station, reads clean
- Steps: `parseTaf('TAF CYMJ 2912/3012 27010KT P6SM SKC')` and `parseTaf('TAF 291120Z 2912/3012 ...')`: no problem listed, `meets`.
- Expected: the plausibility check "more than a day from the issue time" is skipped when there is no issue time; a TAF with no station cannot be tied to the airfield that was asked for.
- Missing test: `tests/unit/wx/taf.test.js`: "missing issue time or station is listed in problems".

### WX-7 (Low) Unusable `minima` supplied to `assessAlternate` fall back to 600-2, which is less strict than the 800-2 the caller meant
- Steps: `assessAlternate(taf, window, {minima: {ceilingFt: 'abc', visSm: 2}})` and `{minima: []}`: both check against 600-2. `arrivalWindow(x, {marginMin: '30'})` uses margin 0. `visualDescent: {meaFt: '5200', elevationFt: '2677'}` (strings) gives 'incomplete' (safe).
- Expected (SPEC-wx: "missing limits fall back to the defaults"): a fallback for missing is per spec; a supplied-but-broken value should be 'incomplete'. The Airfields panel validates numbers, so the panel cannot produce this today.
- Missing test: `tests/unit/wx/alternates.test.js`: "minima that are supplied but unusable give 'incomplete', not the 600-2 fallback".

### WX-8 (Low) Group order in the text is ignored for BECMG against FM
- Steps: `... FM291700 6SM NSC BECMG 2916/2919 OVC015` (a BECMG that starts before the FM it follows). The BECMG is clipped at the FM and its OVC015 never appears; no problem is listed. Malformed TAF; found by the fuzz run (`fuzz.mjs`), not a real-feed shape.
- Missing test: `tests/unit/wx/taf.test.js`: "a BECMG that starts before the FM it follows is listed in problems".

## What I checked that PASSED

- METAR: 55 hand-written reports through `parseMetar` + `checkConditions` + `natoColour` + `flightCategory` (a1.mjs): exact limits (3SM BKN020 = at-limit, 3SM BKN019 = below on ceiling, OVC021 = within), M3SM below, P6SM within, M1/4SM FG VV001 below/RED/LIFR, VV, `BKN015CB` ceiling, CAVOK, SKC/CLR/NSC/NCD, `BKN///`/`OVC///` = unknown never within, NIL and garbage = unknown, trend (TEMPO/BECMG/NOSIG) kept apart, RMK ignored, `LAST OBS/NXT` read, 11/2SM = 1 1/2 SM, `321500Z` gives no time (stale).
- Cautions: VCTS, `+TSRAGR`, FZFG, `-FZRAPL`, BLSN, `+FC`, SQ, FEW040CB, OVC020CB all raise `caution` (or `below` when limits are broken); VCSH, -SN, BCFG, DRSN stay in `watch`.
- TAF: 60+ hand-written TAFs (a2, a8, a10, a11): TEMPO/PROB30/PROB40/PROB40 TEMPO/BECMG/FM, leading TEMPO not stretching the base, BECMG carried past its end, BECMG worst-of during the change, SKC/NSW clearing, CAVOK then BECMG, hour 24, midnight crossing, month end (30 Sep to 1 Oct, 31 Oct to 1 Nov), year end, leap year, amended/cancelled (also doubled `TAF AMD TAF AMD`), NIL, TAF that starts after or ends before the window (`not-covered`; `below` with `covered:false` when the covered part is already below), point ETA on a group boundary (checks both sides, the safe answer), overlap edges (a TEMPO ending exactly at window start is not counted).
- Unreadable text: 45 broken group shapes (`TEMPO 291620`, `TEMPO 2916 / 2920`, `FM 291600`, `1/2 SM`, `OVC 002`, `OVC02`, `M 1/4SM`, `PROB 30`, glued keywords, and more) all give `incomplete` or `below`, never `meets`, except WX-1 and WX-3.
- Alternates: 600-2 exact = at-limit, one below = below; option lists 600-2/700-1.5/800-1 (below only when below all, at-limit when best is exactly met); TEMPO against alternate minima; PROB against landing minima; BECMG worst-of; visual descent: CYYN MEA 5200 / elev 2677 gives 3023 ft, OVC035 meets, OVC030 below, no MEA gives incomplete (D80/D81); GNSS warning at 35 NM and unknown distance, none at exactly 100 NM or when only the alternate uses GNSS; `arrivalWindow` (+/- 60 min default, single ETA with 0 margin).
- Home triggers: local 2000/3 and cross-country 3000/3 (`HOME_TRIGGERS`) both at-limit exactly and below one foot under.
- Against V6: 13 vis x 26 cloud grid, `natoColour` and `flightCategory` vs V6's `nato()`/`cat()` (a3.mjs): 64 differences, all of them the documented ones (unknown base gives UNK; M1/4SM now RED). 4000 random TAF/window pairs, `homeAlternateTrigger` vs V6 `tafHazards` (fuzz.mjs): 64 differences (1.6%), every one V6's known bugs (INITIAL running the whole TAF, BECMG lost, PROB/TEMPO time read as visibility); I read the first 20 listed and found none where the new answer is worse.
- Real samples (`/mnt/project-files/wx-sources/samples/`): all 15 MET Norway TAFs and 64 METARs parse with no problems and no unread tokens; CYQR's `VV000` and `PROB30 ... VV000` are handled; CYMJ's `CNL` reads cancelled; `LAST OBS/NXT 011000Z` gives 1 Oct 10Z.
- `sources.js` (a7.mjs) with a fake fetch: MET Norway ok, MET Norway down leads to Datamask, HTTP 500, wrong-station Datamask reply refused, 300 kB reply refused, bad ids (`../x`, `CY`, `CYQR,CYMJ`, null) never reach a URL, unknown kind refused, requests carry `cache:'no-cache'`, `credentials:'omit'`, a timeout signal and no custom headers, METAR stale at 76 min not 75, expired TAF stale, cancelled TAF `cancelled`, 12-day-old METAR stale, HTML in a report stays text.

## PILOT JUDGEMENT items, with recommendations

1. WX-2 above: PROB at an alternate with no landing minima. Recommendation: `incomplete` (amber), say so in words.
2. Cautions at an alternate (a TS or CB forecast at the alternate leaves the status `meets`, D58). Question: is green right for an alternate with TSRA/CB forecast at ETA? Recommendation: keep the status as ceiling and visibility only (CAP GEN has no CB rule when a TAF exists), but make the SOF card show the caution next to the status every time (the data is in `cautions`).
3. Home trigger wording: the Gen Book trigger is a ceiling below 3,000 ft and visibility below 3 miles. The tool triggers when the ceiling OR the visibility is below. Recommendation: keep OR, which is how the rule is flown; no change.
4. BECMG improving inside the wave window: the old (worse) conditions still count until the change period ends. Matches CAP GEN and the manuals ("improving: only after the end"). Recommendation: keep.
5. WX-4 metric rounding: leave until a metric station is added.
6. Manuals doc note: `/mnt/project-files/manuals/weather-and-limits-numbers.md` still says "≠ Q4" for the destination trigger; D111 has since resolved it (2000/3 local, 3000/3 cross-country). The doc is read-only to me; whoever owns it should update that row.

## Audit (second checker, Opus, ~10:25Z)
All 9 re-checked findings CONFIRMED on main 6540ccf; none touches flight math.

| ID | Verdict | Severity | Existing decision? | Owner | Test |
|---|---|---|---|---|---|
| WX-1 TEMPO 2920/2916 read as a month-long group, no problem, window meets | CONFIRMED | Medium | No | wx (taf.js period() ~82-86, check ~127) | Yes; also ">30 h" and "past TAF end" |
| WX-2 PROB30/40 below alternate minima reads meets when landing minima unset (default) | CONFIRMED | Medium, Patrick review | Yes: SPEC-wx 97, SPEC-airfields 79, D72 | wx + SOF wording + both specs | Test that status is not meets (SOF already lists the unchecked PROB) |
| WX-3 "1SM OVC010 CAVOK" silently clear; also in METARs (SOF shows Within limits); order-dependent | CONFIRMED, wider | Medium | No | wx (conditions.js 85-91) | Yes + METAR case |
| AF-1 stale reports keep green tick/VFR chip (also CYMJ "last observation") | CONFIRMED | Medium, Patrick review | SOF choice pinned by tests/unit/sof/cards.test.js:108; contradicts SPEC-sof 312 and sof.css comment | SOF (cards.js 127-141, cards-view.js 35-39, sof.css 277-279) | Yes; test 108 changes |
| AF-2 narrow widths | CONFIRMED | Low (outside SPEC-shell R2); Medium for Debrief if 1024 is chosen as the floor | Scope gap | App frame picks smallest width, then Debrief/Turn Sim | Once chosen |
| WX-5 no cloud group -> VFR/BLU but check unknown | CONFIRMED | Low | Spec contradicts itself | wx + spec line | Yes |
| WX-7 broken minima fall back to 600-2 | CONFIRMED | Low (not reachable from screen) | Spec silent | wx alternates.js toOptions; cards.js:175 | Yes |
| AF-4 #/SOF not found | CONFIRMED | Low | No | App frame router | Yes |
| AF-5 home = an alternate drops it silently | CONFIRMED | Low | Drop is in spec; silence is new | Airfields | Yes |

## Recommendations (go ahead per Patrick 09:31Z; log judgement calls)
1. WX-1, WX-3: flag as problems so the result is incomplete, never meets. Straight fixes under the "unreadable never meets" rule.
2. WX-2: untested PROB -> incomplete (amber) with its own words ("PROB30 below 600-2; landing minima for CYQR not set"). Gen Book p.7 makes PROB vs landing minima a condition for using the TAF. Reverses D72/spec text: log for Patrick. Do not guess landing minima.
3. AF-1: stale and not below -> "Unknown: report is N h old", grey chips; stale and below stays red. Header wording "Feeds answered just now; newest report is N h old". Reverses the SOF test at cards.test.js:108: log for Patrick.
4. AF-2: app frame to log a smallest supported width (recommend 1280); owners fix layouts to it.
5. Out of date manuals row: weather-and-limits-numbers.md still shows Q4 destination trigger open; D111 settled it (for the manuals thread).


## Re-check after #193 (2c2e000), 10:50Z
Re-ran the audit's Node checks on main:
- WX-1 FIXED: TEMPO 2920/2916 now lists "not a plausible period" and gives incomplete (not meets); 2916/2916 and BECMG 2915/3100 also flagged.
- WX-3 FIXED: "CAVOK" beside 1SM OVC010 is listed as unread; TAF gives below, METAR gives unknown (was within limits).
- WX-5 FIXED: no cloud group gives UNK chips and unknown.
- WX-7 FIXED: broken minima give incomplete instead of falling back to 600-2.
- WX-2 unchanged by decision (D72, review row): PROB 500-1 with no landing minima still reads meets.
- #198 (3b8d895) re-check 11:20Z: wx unit tests 141 pass; the audit's reproductions give identical results apart from the added span fields. Additive as claimed.
