# SOF #221 recheck (commit 097df77): fixes for the #197 recheck items

Checker: independent sub-agent, read-only. Build of 097df77 in `wt-sof2`, `vite preview` on port 4308, Chromium (Playwright) at 1440x900 unless stated, MET Norway and Datamask served by `page.route` (hand-made METAR/TAF text, fake clock). Scripts: `findings/scripts/sof221/*.mjs` (r1, r2, r2b, r3, r3b, r5, r5b, r7, r11, d72, esc, chip, axe, axe2, lay, lay2, live, plus af1, sof01, sof01b re-run). Screenshots: `/mnt/project-files/verification/shots/sof-221/`.
Authorities: SPEC-sof (as edited by #221), decisions D57 to D81, D111, D189, D220 to D224, D315, D316, `weather-and-limits-numbers.md` (refs only). Nothing pushed or edited in the repo.
Environment note: the proxy CA makes Chromium refuse `geo.weather.gc.ca` and `services.arcgisonline.com` (map picture and radar); those `ERR_CERT_AUTHORITY_INVALID` lines are filtered out of every run and are not app faults.

## Verdicts

| Item | Verdict | Note |
|---|---|---|
| R1 flown-wave fog cut | PASS | cut at 1 h after the period ends, 1 wave and 3 waves, home and alternate |
| R3 home below-limits line, no wave | PASS (review note) | matches D315; uses the Settings trigger |
| R5 timeline labels | PASS for 2 h pieces; Low residual for 1 h pieces (new finding N1) | "▼" and hatch always visible; the word "below" is still cut on 1 h pieces below 1920 px |
| R7 equal takeoff/landing refused | PASS on behaviour and wording; Low accessibility finding (N2) | |
| R2 stale METAR in the bar | PASS on threshold and time zones; two Low residuals (N3, N4) | |
| R6 chips grey when stale | PASS as a spec correction (review note: D220 row not amended) | |
| R11 "(N with caution)" | PASS | one Low observation (N5) |
| Live site | NOT YET DEPLOYED: live build 4af0e1bcd6ce (Last-Modified 13:56Z) still shows every #197 behaviour | re-check after the Pages deploy of 097df77 |

Regressions: AF-1, SOF-01, D72 PROB, axe, Escape, 1280 layout, unit and e2e suites all PASS (details below).

Summary of new findings: High 0, Medium 0, Low 5 (N1 to N5). Nothing contradicts a pick Patrick made himself; review notes are at the end.

## Confirmed fixes

### R1 (was Medium): flown-wave below-limit TAF lines are cut. PASS
Steps (r1.mjs): home TAF `TEMPO 2914/2916 1/2SM FG VV002` (ends 16:00Z), wave W1 08:00 to 09:30 CST (14:00Z to 15:30Z). Banner read at each time (the harness adds 1 s after the stated time):
- 15:29Z, 15:30Z (wave end), 15:31Z: fog lines listed (period still running), same as before.
- 16:59Z (59 min after the period ended): `Below limits: CYMJ TAF TEMPO 29/14Z-29/16Z: CEILING 200 FT < 2000 FT`, the VIS line and the FG caution still listed.
- 17:00:01Z and 17:01Z: banner empty. With and without the wave, the same. (Was: listed until local midnight with a wave, empty without.)
- Fog ending exactly at the wave landing (2913/2915, wave 08:00 to 09:00 CST): listed at 15:00Z and 15:59Z, gone at 16:00Z.
- Three waves (r1c, now 22:00Z): W1 fog ended 6 h ago and W2 fog ended 2 h ago are gone; W3 fog starting 23Z is the only banner group. With only W1 and W2 the banner is empty. The wave chips still say `ALTERNATE REQUIRED ... from 14Z`, `from 18Z`, `from 23Z`, so the hit stays in the wave detail (as the recheck recommended).
- A long fog TEMPO 15Z to 19Z, wave flown 14Z to 15:30Z, now 17:30Z: still listed (one span, one key).
- Alternate CYQR `TEMPO 2914/2916 3SM BKN005` in the flown wave: line present at 15:30Z, gone at 22:00Z.
Screenshot: `/mnt/project-files/verification/shots/sof-221/r1c-three-waves.png`, `sof01-j-wave-hit-elapsed.png` (now empty).
Decision check: D221 (1 h cut) extended to below-limit lines, which is what the earlier audit called a straight fix. No conflict.

### R3 (was Medium, PILOT JUDGEMENT): home below-limits line with no wave. PASS
Steps (r3.mjs, r3b.mjs, br.mjs, no wave, now 18:00Z, default Local 2000/3):
- `TEMPO 2921/2923 1SM BR OVC003`: `Below limits: CYMJ TAF TEMPO 29/21Z-29/23Z: CEILING 300 FT < 2000 FT` and the VIS line. FM prevailing (`FM292100 ... 1SM BR OVC003`): `TAF PREVAILING 29/21Z-30/18Z` lines. PROB30 fog and BECMG worsening also listed.
- Boundaries: 2000 ft exactly (BKN020): no line. 1900 ft: line. 2500 ft: no line on Local, line on Cross-country (`2500 FT < 3000 FT`). VIS 2 SM: line. Custom ceiling 1000: OVC003 line, BKN015 none.
- Window: a TEMPO 11 h ahead is listed, 15 h ahead is not. Ended more than 1 h ago: cut (R1).
- Alternate CYQR `TEMPO 1SM BR OVC003` with home fine and no wave: no line (alternates stay wave-tied, D315 as stated).
- Home METAR below: METAR lines as before, no duplicates. With a wave over the same fog (F1) the banner has the same 2 lines, not extra ones. A blank wave (no times) behaves like no wave.
Screenshot: `r3-b2-xc.png`, `r3-f1-wave-and-nowave.png`, `r3-i-default.png`.
Review note: the home limits used come from the SOF Settings trigger (Local 2000/3 by default). With no wave, the banner therefore warns at 2000/3 even though the alternate trigger for a cross-country is 3000/3 (D111). That follows the setting and D315's words; a pilot may want to know. Not a contradiction.

### R5 (was Medium): timeline labels keep the "below" signal. PASS for 2 h and longer; residual Low N1
Steps (r5.mjs, 1280x800, 1366x768, 1440x900, 1920x1080; r5b.mjs with a 40-character alternate name): labels now read `▼ below TEMPO YLO2`, the label never wider than its piece, ellipsis at the end when short (`text-overflow: ellipsis`).
- 2 h pieces: 1280 (91 px) `▼ below TEM...`; 1366 (98 px) `▼ below TEMP...`; 1440 (104 px) `▼ below TEMPO...`; all show the symbol and the whole word "below". (Was `TEMPO YLO1 b`.)
- Pieces 273 px and wider show the whole label.
- Long station names: the timeline row label is only `ICAO ROLE`, so a name cannot lengthen it; a custom alternate with a 40-character name (`Saskatoon John G. Diefenbaker Intl Airpo`) wraps in its card header, no horizontal scroll, no overlap at 1280 or 1440 (`r5b-longname-1280.png`, `r5b-longname-1440.png`). The hover card names the group and times only.
- No label overflows its piece (0 of 12 at every width). The e2e "no piece is cut off by its own label" passes.
Screenshots: `r5-tl-1280.png`, `r5-tl-1366.png`, `r5-tl-1440.png`, `r5-tl-1920.png`.

### R7 (was Low): equal takeoff and landing refused. PASS on behaviour, wording; Low finding N2 on accessibility
Steps (r7.mjs): landing = takeoff at 08:00, 00:00 and 23:59, and by editing the takeoff to match:
- Note under the row: `Landing is the same time as takeoff: set a later time, or an earlier one for the next day`. The wave chip is hidden, no call, no timeline band, no banner line from it. One minute later gives a normal wave; one minute earlier gives `Lands the next day`.
- With two waves and W2 equal, W1's chip and band stay and only W2 says why.
- The note is linked to all three inputs with `aria-describedby` (reading the landing box speaks it). Wording is clear and says how to fix it.
Screenshot: `r7-equal.png`, `r7-two-waves.png`.

### R2 (was Medium): stale newest METAR in the bar. PASS on threshold and time zones; residuals N3, N4
Steps (af1.mjs, r2.mjs, r2b.mjs):
- Every METAR stale (1 d 9 h): `Weather just now, newest METAR observed 1 d 9 h ago ⚠`, red, no tick. Cards all `? Unknown`. (Was `Weather just now ✓`.) At 10 h old: `newest METAR observed 10 h ago ⚠`.
- Fresh newest METAR with stale others (scenario A, mixed): plain `Weather just now ✓` (the wording says "newest", by design, unit-tested as "one current report is enough").
- Threshold matches D67 and the cards: at 74.5 min the bar is `✓` and CYMJ reads `Within limits`; at 75.5 min the bar shows the warning and CYMJ reads `Unknown: report is 1 h 16 min old`. Same function, same instant.
- Time zones: the age comes from the observation time in UTC (`r.time`), not the home zone. A METAR 2350Z read at 01:30Z the next UTC day (and across a month end) reads `1 h 40 min`; no local-time effect. The DTG and text use Zulu only.
- Old wording wanted by the AF-1 audit was `newest report is N h old`; the built wording is close and carries the age.
Screenshot: `af1-c-closed-past.png`, `r2-stale-12h.png`.

### R6 (was Low): stale chips. PASS as a spec correction
Steps (af1.mjs A): stale below (CYYN): red card edge kept (rgb 255,107,107), chips LIFR and RED grey, words `Below limits ... (STALE report)`. Stale at-limit (CYXE): edge grey, chips grey, words kept. Stale within: `? Unknown: report is 8 h 42 min old`, grey.
The #221 change here is text only: SPEC-sof (Stale bullet) now says below keeps its red edge, and the at-limit edge and every chip go grey. Behaviour matches the new spec text. See review note 2 (D220 row not amended).
Screenshot: `af1-a-stale.png`.

### R11 (was Low, PILOT JUDGEMENT): alternates that meet with a caution. PASS
Steps (r11.mjs): CYQR `TEMPO 2920/2922 4SM TSRA BKN040CB` at landing: chip `3 of 3 alternates meet (1 with caution)`; the detail summary says the same and lists `Caution: CYQR TEMPO THUNDERSTORM / SEVERE WX (TSRA), CB/TCU (BKN040CB) from 20Z`. Two alternates with TS: `(2 with caution)`. FG only: `(1 with caution)`. PROB30 TSRA: `(1 with caution)`. TS outside the landing window: no words. All clean: no words. TS plus below (BKN005): `2 of 3 alternates meet`, no words (not counted as meeting). At the limit plus TS: counted as meeting and cautioned.
Screenshot: `r11-d.png`.

## New findings (all Low)

### N1 (Low) A 1 h piece still loses the word "below" below 1920 px
- Where: timeline pieces, `.sof-tl-piece-label`.
- Steps (r5.mjs): TEMPO 1 h long, hatched below.
- Expected: SPEC-sof (24-hour timeline, first bullet): a piece below the limits has a hatch and `below` in its label.
- Actual: label cut to `▼ bel...` (1280, 46 px), `▼ bel...` (1366, 49 px), `▼ belo...` (1440, 52 px); `▼ below ` fits only at 1920 (72 px). The symbol, the hatch and the ellipsis stay, and the full words are in the hover/focus card and aria-label, so nothing is lost for a screen reader and colour is not the only signal. It meets the recheck's own suggestion (symbol plus hatch) but not the spec's literal wording.
- Screenshot: `/mnt/project-files/verification/shots/sof-221/r5-tl-1280.png`, `r5-tl-1440.png`.
- Known/planned: the e2e title says "still shows the symbol and below first" but only asserts the start.
- Missing test: `tests/e2e/sof.spec.js` at 1280x800 and 1440x900: a 1 h hatched piece's visible text starts with `▼` and the legend under the timeline says what `▼` means. Suggested fix: the legend line ("Hatched and marked 'below'") add "▼" so the symbol alone is explained.

### N2 (Low) The equal-times refusal is silent to a screen reader and not marked invalid
- Where: wave rows, `.sof-wave-note`.
- Steps (r7.mjs): type the same time in both boxes.
- Expected: WCAG 3.3.1 error identification; the bad-time case already sets `aria-invalid` and the note is tied by `aria-describedby`.
- Actual: the note appears in muted grey (rgb 155,184,198, same as the ordinary "Lands the next day" note), `role` and `aria-live` are absent, `aria-invalid` is not set on either box (`invalid: [null,null,null]`). The reason is spoken only when the landing box is focused again; someone who tabs away hears nothing and the chip has just vanished.
- Screenshot: `/mnt/project-files/verification/shots/sof-221/r7-equal.png`.
- Missing test: `tests/e2e/sof.spec.js`: "equal takeoff and landing marks the landing box aria-invalid and the note is announced (role status or aria-live polite)"; `tests/unit/sof/waves-view-model.test.js`: row exposes a `problem` flag as well as the note text.

### N3 (Low) The bar warns about a closed field's last observation that the card accepts
- Where: SOF bar `.sof-feed` against the home card.
- Steps (r2b.mjs): only CYMJ reports, `LAST OBS/NXT 011000Z`, METAR 0027Z, now 01:55Z (and again 08:55Z, NXT still ahead).
- Expected: D220 and SPEC-sof: a closed field's last observation is not stale; card reads `Within limits at last observation (field closed until 1000Z)`.
- Actual: card says that, but the bar reads `Weather just now, newest METAR observed 1 h 28 min ago ⚠` (8 h 28 min at 08:55Z), red. The bar uses `staleness('metar')` without the closed-field rule. In normal use alternates that report overnight hide it (the bar names the newest one), so it shows only when every reporting station is closed or old.
- Screenshot: `/mnt/project-files/verification/shots/sof-221/r2-closed-cymj-only.png`, `r2-closed-8h.png`.
- Missing test: `tests/unit/sof/screen-model.test.js`: "feed status: the newest METAR is a closed field's last observation with a future NXT: no warning (or the wording says closed)".
- Recommendation: skip the warning when the newest report is a closed-field last observation with NXT ahead, as the cards do.

### N4 (Low) When the refresh fails, the bar and the alert still speak only of the fetch age
- Where: `.sof-feed` and the feeds-failed alert.
- Steps (r2b.mjs): all METARs 8 h 42 min old, then both feeds fail for one round.
- Actual: the bar changes from `Weather just now, newest METAR observed 8 h 42 min ago ⚠` to `Weather Failed, showing 5 min old ⚠`, and the alert says `Showing the last reports, 5 min old.` although the newest METAR is 8 h old. The failed branch does not get the R2 wording; the cards still say STALE.
- Screenshot: `/mnt/project-files/verification/shots/sof-221/r2-stale-and-failed.png`.
- Missing test: `tests/unit/sof/screen-model.test.js`: feed status with a failed round and a stale newest METAR names the observation age too.

### N5 (Low) The alternate's card line still says "Meets minima" with no caution
- Steps (r11.mjs D): CYQR TS at landing. The chip and detail say `(1 with caution)` and `Caution: CYQR ...`, and the banner lines appear, but the CYQR card line reads `W1 arrival 2000-2200Z: ✓ Meets minima` alone.
- Expected: same "not all-clear" cue where the alternate is looked at (the recheck R11 wording was for the chip; the card line is a second place).
- Missing test: `tests/unit/sof/waves-view-model.test.js` (altLines): line for an alternate that meets with cautions says so.
- Screenshot: `/mnt/project-files/verification/shots/sof-221/r11-d.png`.

## Regressions

- AF-1 (af1.mjs A to D): unchanged. Stale within reads Unknown with grey chips, stale below and at-limit keep their words and `(STALE report)`, closed field reads `Within limits at last observation (field closed until 1000Z)` with `No obs until 1000Z`, and turns `Unknown: report is 1 d 10 h old` once NXT has passed; closed last obs with VCTS still raises the stale caution.
- SOF-01 (sof01.mjs, sof01b.mjs): unchanged. TS ended 3 h and 13 h ago: none; 30 min and 59 min: listed; 61 min: gone; in progress, 11 h and 12.5 h ahead: listed, 14 h ahead: not; FM/PROB30/alternate TS ended 3 h ago: none; a long prevailing TS group: one line.
- D72 (d72.mjs): CYQR `PROB30 2920/2922 1SM BKN005` with landing minima not set: `3 of 3 alternates meet`, no banner line, detail `PROB not checked against landing minima: CYQR PROB30 CEILING 500 FT < 600 FT, VIS 1 SM < 2 SM from 20Z`. The same as TEMPO reads `2 of 3 alternates meet`, `Below minima`. Unchanged from D189 (D72 kept; the "PROB unchecked is incomplete" option is still not taken). Home PROB30 no wave now gives a banner line (the home trigger counts PROB, not D72's alternate rule).
- axe (axe.mjs, 1280 and 1440, banner with 4 lines, 2 waves one of them equal-times, hit list open, timeline open, stale bar): 0 violations for wcag2a/2aa/21a/21aa and for all rules. Incomplete: `color-contrast` (banner symbols, zoom glyph, and timeline labels over hatch, which axe cannot compute) and `aria-prohibited-attr` on `div[aria-label=...]` (the timeline row labels, `sof-tl-label`, a plain div with `aria-label`, so the "CYQR alternate, latest METAR 2250Z" text is not exposed; this predates #221 and was not raised before). Needs a manual look; suggest `role="rowheader"` or `role="group"` on those divs.
- Escape (esc.mjs): Layers menu closes on Escape from its button and from a checkbox inside it, focus returns to the Layers button. SOF settings panel closes on Escape from a control inside it and from its toggle (focus on the toggle). The app Settings dialog closes on Escape, focus back on Settings. The wave hit list is a toggle (`aria-pressed`), not a menu: Escape leaves it open, as before; the timeline hover card stays with focus. No console errors.
- Layout 1280x800, 1366x768, 1920x1080 (lay.mjs, lay2.mjs): no horizontal scroll, no covered control; the scan's overlap flags are the visually hidden "Flight category/NATO colour state" spans (false positive, as in the #197 check; the card ends at x=428 and Layers starts at 440); labels flagged "clipped" are the deliberate ellipsis. `lay-1280x800.png`, `lay-1280-viewport.png`.
- Suites in `wt-sof2`: `node --test tests/unit/sof/*.test.js` 717 pass, 0 fail. `PW_PORT=4308 npx playwright test tests/e2e/sof.spec.js tests/e2e/sof-map.spec.js --project=chromium` 99 passed, 0 failed. (Count is higher than the 563/56 of the #197 check because the map, traffic and lightning tests joined.)

## Live site (https://lizardhands-commits.github.io/Dads-debreif/#/sof)
The live build is `4af0e1bcd6ce` (Last-Modified Wed 30 Sep 2026 13:56:09 GMT), older than #221 (committed 14:31Z). The published SOF bundle has no `newest METAR observed`, `▼ below`, `with caution` or same-time refusal text. Reproduced against a verified mirror of the live files (served locally on port 4318): the flown-wave fog is still on the banner (R1), no home line with no wave (R3), `Weather just now ✓` over 10 h old METARs (R2), label `TEMPO YLO1 below` unshortened (R5), equal times give `Lands the next day` and a 24 h wave (R7), chip without `(with caution)` (R11). So none of the fixes are live yet; repeat this re-check after the Pages deploy. Screenshots: `live-r1.png`, `live-r2.png`.

## Logged decisions and review notes
Read `/mnt/project-files/logs/decisions-for-review.md`. Rows relevant: D220 to D224 (#197), D315 (R3) and D316 (R2, R5, R7). No row for R6 or R11.
1. R3 (D315) is the recommendation from the earlier check; it does not touch D111 (Patrick's trigger pick), D70/D72 (alternate rules; alternates stay wave-tied and PROB against landing minima is unchanged) or D222 (blank wave times). The banner follows the Settings limits (see the R3 review note above).
2. R6: the code was left and SPEC-sof was edited to match it (at-limit edge and all chips grey when stale). D220's log row still says "below and at-limit stay as they are", and no new row records the correction. Flag for Patrick: ask him to confirm grey chips and a grey at-limit edge on a stale report, and amend or add a row (an at-limit stale card is now a little quieter; its words still say `At the limit ... (STALE report)`).
3. R11: chip wording `(N with caution)` is new wording with no log row. It agrees with Gen Book p.7 (minima are ceiling and visibility only) and does not touch D72.
4. D316 bundles R7 as "unlike V6's 24 h reading". Log wording is accurate; the wording of the on-screen refusal is not logged (fine).
5. Nothing logged for the SOF contradicts the SMM, manuals or spec. No PILOT JUDGEMENT items remain open from this recheck; the R3 note is a wording question only (recommendation: keep as built).

## Live site check (491d860, 16:05Z): PASS. R1, R2, R3, R5, R7 and R11 match the local results. N1 and N2 are still open. See sof-recheck-228.md.
