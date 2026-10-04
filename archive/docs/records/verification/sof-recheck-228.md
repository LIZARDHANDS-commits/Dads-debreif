# SOF #228 recheck (commit 30993b5): marked report words behind each limit, at-limit item and caution (task 3)

Checker: independent read-only sub-agent. Worktree `scratchpad/wt-sof` at 30993b5 (`npm ci`, `npm run build`, `vite preview` on port 4307, stopped at the end). Chromium via Playwright at 1440x900 (1280x800 for layout). Feeds served by `page.route` (MET Norway and Datamask), fake clock, home CYMJ (Local 2000/3), alternates CYQR, CYYN, CYXE (600-2, "approaches not set").
Scripts: `scratchpad/audit228/` (`lib.mjs`, `anno.mjs`, `cases.mjs`, `run-cases.mjs`, `run-real.mjs`, `run-real-taf.mjs`, `node-spans.mjs`, `sw.mjs`, `sw2.mjs`, `sa.mjs`, `sec.mjs`, `dm.mjs`, `extras.mjs`, `extras2.mjs`, `bh.mjs`, `esc.mjs`, `lay.mjs`). Screenshots: `/mnt/project-files/verification/shots/sof-228/` (files starting `live-` come from the live files, the rest from the local build; both behave the same).
Authorities used: SPEC-sof (Caution banner and Airfield cards, as edited by #228), `tasks/sof/todo.md` item 3, D58, D72, D189, D221, D315, `wx` limit rules in `src/wx/limits.js` only to know what a "caution" is (the expected spans were worked out by me, see below). Manuals: not needed (no flight numbers changed).

## Verdicts

| Item | Verdict |
|---|---|
| 1. Right words | PASS for every METAR case; PASS for TAF marks in the group where the report says it (with two exceptions in findings M1 and M2: marks that are right words but not what is listed). Six Low notes (L1 to L7). |
| 2. Hits, at-limit, cautions, D72 | PASS. Distinct marks, wording matches banner and card. PROB alternates: no limit mark, only dangerous weather. One Low (L1: at-limit and caution differ only by dotted or dashed). |
| 3. Stale and flown waves | FAIL in part: R3 (no wave, home line) PASS; R1 (1 h cut) is not applied to the marks on the TAF text (M1). Alternate TAF limit marks are not tied to wave windows (M2). |
| 4. Accessibility | PASS. axe 0 violations (wcag2a/2aa/21a/21aa and all rules), contrast 5.5 to 12.4, hidden words read correctly. Known incompletes only. |
| 5. Security | PASS. No innerHTML, hostile text stays text, no injection (METAR, TAF, remarks). |
| 6. Regressions | One Medium layout regression: the banner grew about 2 times taller (M3). Everything else PASS: 1280 layout, Escape, unit and e2e suites. |
| Live site | Live files (built 15:26Z, `app-version` e0942d0, later than 30993b5) contain #228; every result above reproduced on a verbatim mirror of the live files (proxy CA stops Chromium reaching github.io directly, so the files were fetched with curl and served locally). |

Counts: High 0, Medium 3 (M1 to M3), Low 7 (L1 to L7).

## Corpus and how the expected spans were made

Hosts reached: `api.met.no` (METAR and TAF text for CYMJ, CYQR, CYYN, CYXE), `aviationweather.gov` (48 h of METAR/SPECI for the four fields, and current TAFs), `datamask.org` (home page only; its API was answered by the mock, using the real JSON shape of the saved samples). Real reports were fed to the app through `page.route`; only the DDHHMMZ token of a METAR was changed, to make it 10 minutes old at the fake clock (7 characters both ways, so no offsets moved).

- Real METARs: 207 lines (CYMJ 26, CYQR 57, CYXE 48, CYYN 77; includes 29 Sep fog at CYQR with `1/4SM R13/1400V1600FT/N FG BKN001`, `3/4SM ... BR BKN001`, `1SM R13/3500VP6000FT/U BR SCT001`, AUTO reports, LAST OBS/NXT). Each line was checked twice, as an alternate (600-2) and as home (2000/3): 390 checks, 0 failures. Marks seen: 53 below, 5 at-limit, 6 caution across 46 reports. Both the card marks (exact character ranges, level) and the banner lines (one per reason, words per line) were compared.
- Real TAFs: 17 (MET Norway, 3 to 5 issues per field, plus aviationweather; FM, BECMG, TEMPO -SHRA, gusts, CNL, RMK text): no limit or caution tokens, so no marks expected; none shown, no banner line.
- Hand-made METARs: 50 cases (both checks each = 100 PASS). Hand-made TAFs: 21 cases (42 PASS), plus a per-line check of the words behind each banner line by calling `parseTaf`, `tafCautionsForBanner` and `cautionList` directly (`node-spans.mjs`, `node-th5.mjs`): all 21 agree.
- Expected spans: I annotated each hand-made report by hand (`{b:CEIL:BKN005}` means below limits, ceiling reason, this token), so the expected ranges are mine. For the real METARs I wrote a separate small oracle (`oracle.mjs`: my own tokenizer, lowest BKN/OVC/VV, fraction and P/M visibility, weather-code list from D58) and it agrees with all 50 hand-annotated METARs.
- Cases covered: ceiling from BKN, OVC, VV; lowest layer against higher layers (listed in either order); `1 1/2SM`, `M1/4SM`, `P6SM`, `P3SM`, `M3SM`, `1/2SM`, `2 1/2SM`, metric `0800`; RVR between vis and weather; TEMPO, BECMG, PROB30, PROB40 TEMPO, FM; TS, +TSRA, VCTS, TSRAGR (two reasons, one token), CB, TCU, FEW040CB, FZRA, FZDZ, FZFG, FG, BCFG, MIFG, VCFG (none), BR, +SN, DRSN, BLSN, HZ, FU, UP, VCSH (none), PL, GR, GS, SQ, FC; crosswind and gusts (no marks); RMK text containing BKN005, TSRA, FG (no marks); the same token twice in different TAF groups (two BKN010, each mark and each banner line at its own token); AUTO, COR, NIL for METAR and TAF; lowercase; doubled spaces and tabs; an astral character (emoji) before the marked words; `TAF AMD TAF AMD CYMJ ...` prefix and a multi-line indented TAF through Datamask; hostile markup.

## What passed (brief)

- METAR: every mark and banner line exactly the causing token(s), including two-token visibility `1 1/2SM`, ceiling token that is also a CB token (below wins the shared token, caution still has its own banner line), at-limit alongside below (`2SM` yellow, `OVC005` red).
- TAF: marks in the group where the words are; PREVAILING lines from FM point at the FM group's words; BECMG words also serve the PREVAILING line that follows (as wx joins it); RMK words and wind never marked; CNL, NIL and stale TAF: none; PROB alternate (D72) below-minima: no mark, no banner, wave detail keeps the unchecked note; PROB alternate with TSRA and BKN005CB: caution marks only, and the chip says `3 of 3 alternates meet (1 with caution)`.
- Home PROB: marked and listed like any home piece (the home trigger counts PROB, D315).
- Words match: banner `Below limits:` / `Caution:` and the card's result words `Below limits`, `At the limit`, `Caution` match the hidden prefixes `below limits: `, `at the limit: `, `caution: ` on the marks.
- Stale METAR (2 h 10 min): marks grey (`--text-faint` on the card and in the banner line), underline style kept, hidden words kept, card still says `(STALE report)`. Stale TAF: no marks.
- Accessibility: `ariaSnapshot` of the report reads `mark: "below limits: 1 1/2SM"`, `mark: "caution: +TSRA"`; the banner line reads `Below limits: CYMJ METAR 1750Z: CEILING ... In the report: [mark] BKN008CB`. Contrast against the card background: below 6.9, caution and at-limit 11.8, stale 5.5; in the banner 7.25 and 12.4 (all above 4.5). axe: 0 violations at 1440 with the marks visible; incomplete: `aria-prohibited-attr` x4 (timeline row labels, from #221, not new) and `color-contrast` x25 (axe cannot compute over hatch and overlays; the marks were measured by hand as above). The `::before` words are generated content, so a copied report has no hidden words (their own e2e test).
- Security: no `innerHTML` in the marks path (`marks.js`, `banner-view.js`, `cards-view.js` use `h()` text nodes; the level class comes from three fixed words). Hostile METAR and TAF text (img onerror, script, svg onload, entity text, `</mark>` breakouts, template and prototype strings) stays text; `.sof-raw` holds only `mark` elements it made; `window.__pwn` undefined; no console errors; the marks still sit on `1SM` and `BKN005` (`sec.mjs`, `sec-hostile.png`).
- Escape (`esc.mjs`): Layers menu, SOF settings, app Settings close on Escape with focus returned as before; timeline hover card unchanged.
- Suites in `wt-sof`: `npm test` 3070 tests, 3062 pass, 0 fail, 8 todo (SOF `tests/unit/sof` 760 pass, `tests/unit/wx` 141 pass). Playwright chromium `sof.spec.js`, `sof-map.spec.js`, `a11y.spec.js`, `layout.spec.js`, `visual.spec.js`: 150 passed, 1 failed (`visual.spec.js › home`, video poster frames differ by 2 percent while the machine was busy; not SOF; re-run alone: `visual.spec.js` 9 of 9 passed, including `sof, recorded weather`).

## Findings

### M1 (Medium) The marks on the TAF text are not cut when the banner cut drops the line (R1)
- Where: SOF card, TAF report line (`cards.js` `tafMarks`, window from home midnight; `bannerNotEndedBefore` is not applied).
- Steps (`t1.mjs`, `sw2.mjs` W3b/W3c): home TAF `2906/3006 ... TEMPO 2908/2910 1SM FG OVC003 FM291200 ...` at 18:00Z (fog ended 8 h ago), no wave. And with a wave flown 08:00 to 09:30 CST, TAF `TEMPO 2913/2915 1/2SM FG VV002` at 16:01Z (ended 61 min ago).
- Expected: task 3 and SPEC-sof (Caution banner): marks show the words behind what is listed; D221 and #221 R1 cut TAF lines that ended more than 1 h ago; the banner is empty in both cases.
- Actual: banner empty, but the TAF text still shows `1SM` red, `FG` amber, `OVC003` red (`live-t1-ended-tempo.png`, `t1-ended-tempo.png`, `w3-r1-flown.png`). The hidden words say "below limits:" for a forecast that ended hours ago. A pilot glancing at the card sees red in the TAF and no banner. (After 1 h the wave chip still lists the hit, by #221 design; the marks are the only place with no such reading.)
- Known/planned: not in `tasks/sof/todo.md`.
- Missing test: `tests/unit/sof/cards.test.js`: "a TAF group that ended more than an hour before now has no marks" (fixture as `t1.mjs`); `tests/e2e/sof.spec.js`: the TAF line of the fog fixture has no `mark` once the fake clock is 61 min past the end of the TEMPO.
- Suggested fix: in `tafMarks` drop pieces whose `to` is before `bannerNotEndedBefore(now)`, after the same join the banner uses (or start the window at now minus 1 h).

### M2 (Medium) An alternate's TAF is marked "below limits" for forecast times no wave lists
- Where: SOF card of an alternate, TAF line (`cards.js` `tafMarks` runs `assessAlternate` over the whole banner window).
- Steps (`sw.mjs` W5, `run-cases.mjs` ta2): CYQR `TEMPO 3003/3005 1SM BKN005`, one wave landing 20:00 to 22:00Z, now 18:00Z.
- Expected: task 3 ("marks follow what is actually listed"), SPEC-sof and D60/D315: an alternate's limit hits are wave-tied (banner and chip list only pieces in a wave's landing window); PROB (D72) is unmarked already.
- Actual: chip `3 of 3 alternates meet`, banner empty, CYQR detail `Meets minima`, but the TAF text shows `1SM` and `BKN005` in red with the hidden words "below limits:" (`w5-alt-outside.png`). Same with no wave at all (`ta2`: TEMPO 2920/2922 1SM BKN005, no banner, red marks). Home is fine (its no-wave line is D315). Marks at limit (`ta4`) behave the same way.
- Known/planned: as-built text in SPEC-sof says "The TAF is marked with wx's check over the banner's window (home limits, or the alternate's minima)", so this is what was built; it disagrees with the banner and chip, which is what this check is about.
- PILOT JUDGEMENT: should an alternate forecast that is bad only at a time you are not landing there show as "below limits" on the card? Recommendation: mark an alternate's TAF limit words (below, at-limit) only for pieces in a wave's landing window (the same pieces the wave detail lists), and keep dangerous-weather marks over the banner window as now. If Patrick wants the wider look, say so in the spec and word the hidden prefix "below minima at some time in the TAF".
- Missing test: `tests/unit/sof/cards.test.js`: "an alternate TAF piece below minima outside every wave window is not marked as a limit"; `tests/e2e/sof.spec.js`: the same with the `w5` fixture, chip and marks agree.

### M3 (Medium) The banner is now about 2 times taller: every line uses three rows and the Acknowledge button drops to its own row
- Where: caution banner (`sof.css` `.sof-banner-words { flex: 1 1 100% }` inside the wrapping `.sof-banner-line`).
- Steps (`bh.mjs`): home METAR `1 1/2SM BKN008`, CYQR `1SM BKN005`, home TAF TEMPO fog: 7 lines at 1280x800 and 1920x1080. Before/after pictures: `tests/e2e/__screenshots__/visual.spec.js/sof.png` at HEAD~1 and HEAD (`scratchpad/audit228/vis-before.png`, `vis-after.png`).
- Expected: R22 (essentials small by default), SPEC-sof "sized for a 1920 x 1080 desk monitor and still with nothing hidden": the banner should not push the waves, timeline and map off the first screen; before #228 a line was text and button on one row.
- Actual: each line 94 px (was about 42 to 50 px, text and button side by side): 7 lines 810 px, first airfield card at y 1169 (below the fold at 1080p), waves at y 1015. With the 16 lines of `sa.mjs` the banner is about 1,600 px. One caution: box 95 px to 146 px. Screenshots: `bh-1280.png`, `bh-1920.png`, `sa-dark-1440.png`, `live-sa-dark-1440.png`.
- Missing test: `tests/e2e/sof.spec.js` (or `layout.spec.js`): "a banner line is no taller than 60 px at 1280 wide and the Acknowledge button is on the line's first row" (fixture with 4 lines).
- Suggested fix: put the words on the same row as the text and let the button sit at the right (`order`), or make the words wrap inside `.sof-banner-text`'s flex item.

### L1 (Low) At-limit and caution marks are told apart only by a dotted or dashed underline
- Where: cards (`sof.css` `.sof-mark.is-at-limit` and `.is-caution` share `--caution` and weight).
- Steps: CYQR METAR `2SM -FZRA BKN006` (`card-cyqr-atlimit-caution.png`): `2SM` and `BKN006` dotted, `-FZRA` dashed.
- Expected: task 2 "visually distinct"; WCAG 1.4.1 (met for a screen reader by the hidden words, and red against amber is distinct).
- Actual: at 13 px the dotted and dashed 2 px underlines are close to identical to a sighted reader; for a colour-blind sighted reader the only cue left is dots against dashes. The result line on the card says the level in words, which softens it.
- Missing test: none needed for a rule; if fixed, `tests/e2e/sof.spec.js` compares the computed decoration style, weight or a leading symbol of the two classes.
- Recommendation: give at-limit its own cue that is visible at small size (for example a lighter weight or a wavy line), or a small symbol before the word, as the cards' result line already uses `●` and `▼`.

### L2 (Low) A visual-descent alternate: the TAF is marked against the descent minima, the METAR is not
- Where: cards of an alternate set to GNSS-only with MEA, or no-IFR.
- Steps (`extras2.mjs` E2): CYQR GNSS-only, MEA 3000 ft, elevation 1894 ft (least ceiling 1606 ft): METAR `4SM BKN012`, TAF `TEMPO 2920/2922 4SM BKN012`.
- Expected: the same rule for both reports of one card; SPEC-sof says the result is left to the wave call (`? Visual descent from MEA: see the wave call`).
- Actual: METAR has no mark (by design, code comment); TAF shows `BKN012` red with "below limits:". Cautions (`TSRA`) are marked on both.
- Missing test: `tests/unit/sof/cards.test.js`: "a visual-descent alternate marks limits on neither report" (or on both), next to the existing METAR-only test.

### L3 (Low, observation) Words under a TEMPO or BECMG line can be in an earlier group
- Steps (`node-th5.mjs`): `25010KT P6SM BKN005 TEMPO 2921/2923 1SM`. The line `TAF TEMPO 29/21Z-29/23Z: CEILING 500 FT < 2000 FT` has words `BKN005`, which is in the base group before the TEMPO keyword (the ceiling that applies in the TEMPO is the inherited one, so the words are the cause). Likewise `BECMG 2921/2923 VCTS` also raises a `PREVAILING 29/23Z-...` line pointing at the BECMG group's `VCTS`.
- Expected: exactly the causing token in the right group; this is the causing token and it is also on the PREVAILING line, so it is arguably right. The line duplicates the base line (wx behaviour before #228).
- Missing test: `tests/unit/sof/marked-cautions.test.js`: pin what a TEMPO inheriting a base ceiling points at, so a change is deliberate.
- Recommendation: keep; no change.

### L4 (Low) A spell joined from several FM groups repeats the same word
- Steps (`extras.mjs` E5): `1SM BKN005 FM292000 ... 1SM BKN005 FM292200 ... 1SM BKN005`: one line per reason, words `BKN005 BKN005 BKN005` and `1SM 1SM 1SM` (correct: each is a real cause; all three marked on the card).
- Expected: reads once. Missing test: `tests/unit/sof/marked-cautions.test.js`: banner words of a joined spell are listed once per distinct text, or once per group with its group name.

### L5 (Low) Two layers at the same base: only the first is marked
- Steps (`extras.mjs` E1): home `BKN010 OVC010`: card and banner mark `BKN010` only (wx picks the first layer at the lowest base). Both are the ceiling. Missing test: `tests/unit/wx/limits.test.js`: reasonSpans holds every layer at the ceiling base.

### L6 (Low, observation) A token that is both the ceiling and a CB layer shows only the "below" level
- Steps: `BKN008CB` (`card-cymj.png`): red, hidden words "below limits:"; the caution `CB/TCU (BKN008CB)` stays in the card's result words and has its own banner line with the token marked. A screen reader reading the report hears the caution only in the result words. Recommendation: acceptable; if wanted, the hidden words could read "below limits and caution:" for a token with two levels. Missing test: `tests/unit/sof/marks.test.js`: pin the choice.

### L7 (Low, not from #228) Bidirectional control characters in a report reach the card
- Steps (`sec.mjs`): a token `U+202E U+2066 BKN005 U+2069` stays in the raw text (it is inserted as text, safely). It can visually reorder the words after it while the marks sit on the right characters. Pre-existing (the report text has always been shown as issued). Missing test: `tests/unit/wx/sources.test.js`: control characters in a report are refused or stripped.

## Answers to the check list

1. Right words: PASS (see the corpus, and M1/M2 for right words that are not what is listed).
2. Hits against at-limit against cautions: PASS with L1. D72: PASS (`w2-alt-prob.png`, `w2b-alt-prob-ts.png`).
3. Stale and flown waves: R3 PASS (`w4-home-nowave.png`); R1 not applied to the marks (M1).
4. Accessibility: PASS.
5. Security: PASS.
6. Regressions: banner height (M3); 1280 layout otherwise clean (`lay-1280x800.png`: no horizontal scroll, no covered control; the scan's overlap flags are the visually hidden badge state spans, false positives as in the #197 and #221 checks; `.sof-tl-piece-label` ellipsis is the deliberate one); Escape PASS; unit and e2e PASS.

## Logged decisions
Read `/mnt/project-files/logs/decisions-for-review.md`. Nothing logged for the marks (D-rows for SOF: D57 to D81, D111, D189, D220 to D224, D315, D316). D221 (1 h cut) is the decision M1 measures the marks against. Nothing logged for the SOF contradicts the SMM, manuals or SPEC-sof. The as-built paragraph in SPEC-sof about marking the TAF over the banner's window (M2) has no D row; if Patrick agrees with the recommendation in M2, it should get one.

## Audit (auditor agent, read-only). Its corrections override the text above. The live site at 491d860 has the same SOF code.
| Finding | Verdict | Corrected facts |
|---|---|---|
| M1 TAF marks ignore the 1 h cut | Confirmed, lowered to Low | cards.js:172-186 tafMarks uses bannerWindow() from midnight and never applies bannerNotEndedBefore. Wider than reported: caution marks (e.g. an ended +TSRA CB) aren't cut either. It only ever over-warns. Missing test: an ended group (limit or caution) more than 1 h before now has no marks. |
| M2 alternate TAF marked outside every wave window | Confirmed, PILOT JUDGEMENT (Medium until decided) | cardModel takes no waves and judges the alternate over the banner window, as the spec's as-built line 139 says. That sits badly with spec 101/129 and D315 (alternates tied to waves). No D row. |
| M3 banner about 2x taller | Confirmed Medium, WORSE | .sof-banner-words flex 1 1 100% makes Acknowledge wrap to a third row. Identical at 1280 AND 1920: 7 lines give 810 px (was 449), and the first card is at y 1169 (was 808). At 1920x1080 the cards are now below the fold. R22 / "sized for 1920x1080". Missing test: at 1920x1080 with 4 lines, each line ≤60 px and Acknowledge on the first row. |
| L1 same amber for at-limit and caution | Confirmed Low | Spec line 138 still says amber vs yellow. |
| L2 visual-descent alternate TAF marked, METAR not | Confirmed, raised toward Medium | Same root as M2. cards.test.js:477 tests the METAR only. |
Shots: shots/sof-228/m3-1280.png, m3-1920.png, live-r5-*.png.

## SOF #221 on the live site (491d860): all six match the local check
R1, R2, R3, R5, R7 and R11 behave as locally. N1 (1 h pieces "▼ be…") and N2 (no aria-invalid) are still open.
