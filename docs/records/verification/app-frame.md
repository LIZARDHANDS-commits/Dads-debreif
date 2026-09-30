# Findings: app frame (shell, ui-kit, storage, airfields, flight-data), main 6540ccf

Checker: independent, read-only. Built and served from the worktree (`npm ci`, `npm run build`, `vite preview --port 4305`). Playwright Chromium, 1440x900 unless stated. Scripts in `findings/app-frame/scripts/` (b1 to b22), shots in `/mnt/project-files/verification/shots/app-frame/`.
Sandbox note: outside hosts (api.met.no, datamask.org, tile servers) fail here with certificate errors from the sandbox proxy, so weather stubs were used; those errors are not app bugs and are excluded from every "console clean" claim below.

Counts: High 0, Medium 2, Low 6.

## Findings

### AF-1 (Medium, PILOT JUDGEMENT) SOF cards show a green tick, "Within limits (STALE report)", and green VFR/BLU chips for reports 9 hours old
- Where: SOF Dashboard (#/sof), card header chips and the summary line (`src/modules/sof/cards.js` line 131, `cards-view.js`). Header also says "Weather just now ✓" in green.
- Steps: serve `metno-metar-CYMJ-CYQR-CYYN.txt` and `metno-taf-CYMJ-CYQR-CYYN.txt` from `/mnt/project-files/wx-sources/samples/` as the MET Norway replies (script b14.mjs, mode `stale`), open #/sof.
- Expected: SPEC-sof line 312 ("Never: show a stale one as current"), line 140 (stale greys the text and says `STALE: ...`). A stale report should not carry a green tick or green category chips.
- Actual: CYQR and CYYN (METAR 8 h 49 min old): body text is greyed and `STALE: 8 h 49 min old` shown in red, but the line at the bottom is a green "✓ Within limits (STALE report)" and the chips are green VFR / BLU. The "just now ✓" is the fetch time, not the data age.
- Screenshot: `/mnt/project-files/verification/shots/app-frame/sof-stale.png`.
- Known/planned: partly by design (D67 wording); the SOF logic is checked by someone else, so this is only noted as visible.
- Recommendation: when the METAR is stale, drop the tick and the green chips (grey chips, amber line "Unknown: report is 8 h 49 min old"), and keep "Within limits" only for fresh reports. Show the fetch-time line as "Feeds answered just now; newest report is 9 h old".
- Missing test: `tests/e2e/sof.spec.js`: "a card whose METAR is stale has no green tick and no green category chip" plus `tests/unit/sof/cards.test.js`: "stale METAR gives level 'unknown', not 'within'".

### AF-2 (Medium) At 1024 px wide the Debrief toolbar runs over the Formation panel title; at 768 and 390 the Debrief and Turn Sim pages scroll sideways with controls cut off and covered
- Where: #/debrief at 1024x768: the "Weather" and "Tools" buttons overlap the "Formation" panel header (55 and 89 px overlap). #/debrief at 768x1024: page is 894 px wide, Tools at x 804 to 894 is off screen. #/debrief at 390x844 and #/turn-sim at 390x844: 894 and 596 px wide, "Play", "Step", "Reset", "Fit", "More detail" covered by other panels. Home, About, SOF and the Settings dialog fit (the dialog scrolls sideways inside itself).
- Steps: set the viewport, open the route, scan controls (script b15.mjs).
- Expected: SPEC-shell R2 names 1366x768 and 1920x1080 only, and both are clean. But the Debrief is a tablet-in-briefing-room tool (iPad landscape is 1024x768 or 1180x820), and the brief says "overlapping or covered controls".
- Actual: overlap and covered controls as above.
- Screenshot: `/mnt/project-files/verification/shots/app-frame/vp1024-debrief.png`, `vp390-debrief.png`, `vp390-turn-sim.png`.
- Known/planned: not in the specs' scope list; phones are not promised anywhere, tablets are not either.
- Missing test: `tests/e2e/layout.spec.js`: add 1024x768 to the overlap scan for every route (and write the minimum supported width in SPEC-shell if 1024 is not meant to work).

### AF-3 (Low) Turn Sim default view: the "12,000 ft" spacing label overlaps the "#3" aircraft tag
- Where: #/turn-sim, first frame, 1440x900 (`/mnt/project-files/verification/shots/app-frame/card-turn-sim.png`, between aircraft 1 and 3).
- Expected: labels do not collide (R2 covers controls, not canvas labels). Turn Sim owner's file.
- Missing test: `tests/e2e/turn-sim.spec.js`: canvas label collision check on the default formation (or a screenshot in `visual.spec.js` for the Turn Sim).

### AF-4 (Low) Deep links are case-sensitive: `#/SOF` and `#/Sof` say "There's no page at SOF"
- Steps: open `.../#/SOF`. Expected: same page as `#/sof` (or a friendlier message); people type these into a URL bar or take them from an email that capitalised them. All lower-case links, `#sof`, `#/sof/`, `#/sof?x=1` work.
- Missing test: `tests/unit/shell/router.test.js`: "route ids match without regard to case".

### AF-5 (Low) Settings: setting the home field to an existing alternate quietly drops it from the alternates list
- Steps: Settings, Home field CYQR, Enter. Alternates table now shows CYYN and CYXE only; the minima line loses CYQR. No message.
- Expected: a one-line note ("CYQR is now home, so it was removed from the alternates"). Behaviour is reasonable; the silence is the issue.
- Missing test: `tests/unit/airfields/airfields.test.js` + `tests/e2e/airfields.spec.js`: "moving an alternate to home says so".

### AF-6 (Low) Only CYMJ has a field elevation in the catalog, so a GNSS-only or no-IFR alternate stays "needs field elevation" until the user types one
- Steps: Settings, CYYN, approaches "GNSS only", More airfield settings, MEA 5200: minima line reads `CYYN visual descent from MEA 5,200 ft, needs field elevation`. After typing 2677 it shows `ceiling 3,023 ft, 3 SM`, which matches SPEC-wx D81 exactly.
- Expected: not a bug (catalog says "unknown, not guessed"), but the spec's own worked example uses CYYN 2,677 ft. Recommendation: fill CYQR, CYYN, CYXE from the AIP once Patrick supplies the source, and mark them "from the AIP".
- Missing test: none needed for the current behaviour; add `tests/unit/airfields/catalog.test.js` "every default alternate has an elevation" when they are filled.

### AF-7 (Low) Settings has no "units" or "standards" section
- The review brief listed "units" and "standards" in Settings. Neither is in SPEC-shell or SPEC-airfields: the standards editor belongs to the Debrief (Standards panel, right column) and no units setting is specified anywhere. Not built and not planned, so not a bug; noted so the owner can confirm nothing was expected.

### AF-8 (Low) Going Back to the home page returns to the top, not to where you were
- Steps: scroll home 150 px, open SOF, press Back. scrollY 150 becomes 0 and focus is on the page container. SPEC-shell says a page change opens at its top, so this matches the spec; noted as a small annoyance only.

## What I checked that PASSED

- Home: six cards in spec order (Debrief, Turn Sim, Turn Fight, Traffic, SOF, About). Debrief, Turn Sim, SOF and About are links to `#/<id>` and open their page (titles, headings, document title right). PROTOTYPE badge on Turn Sim and SOF only, none on Debrief or About. Turn Fight and Traffic are non-focusable divs marked "Coming soon": click does nothing, Tab skips them, deep links `#/turn-fight` and `#/traffic` show the page-top note "X is coming soon." and the home screen, and the Home link clears the note. Screenshots `home.png`, `notice-coming-soon.png`, `notice-not-found.png`.
- Header: clock "09:39:28Z 03:39:28 CST" correct for CYMJ (UTC-6), Home/About/Settings/Report a problem all work; Report a problem builds the GitHub issue URL with the current page and version (`2026-09-30 6540ccf`), and page name is Home on the coming-soon and not-found screens.
- Footer: "Updated 30 Sep 2026, 09:33Z" (format per spec), version in the tooltip, "Source on GitHub" opens in a new tab with `noopener noreferrer`. It shows the build time of this copy, not the deploy time; fine for Pages.
- About: text, photo, contact mailto and Venmo (new tab, `noopener noreferrer`), "← Home".
- Settings dialog: opens with focus on the first radio, Esc closes and returns focus to Settings, Done closes, no focus escape while tabbing 17 stops. Zulu/local order changes the clock at once and survives a reload; card-video choice persists (`data-motion` attribute set); home field default CYMJ ("Moose Jaw · local time UTC-6"), alternates default CYQR, CYYN, CYXE with 35, 82, 119 NM (match the research doc). Adding: lower-case accepted, duplicates and the home field refused with a sentence, bad ids ("ABC", "CY1", "C YQ", "<b>") refused with a sentence, the 7th alternate refused ("Up to 6 alternates"), Enter submits. Home change to KGGW/CYXH updates the clock zone (MDT); an unknown id (CYYC) says "Add its time zone under More airfield settings; local time stays on ...". Approach types give the right minima (non-precision 800-2 with 900-1½ and 1000-1 trade-offs; HAT 1000 gives 1300-2; vis 1.25 gives 2¼; rounding at 20 ft) and range messages ("Enter a number from 0 to 5,000 ft."). Reset airfields to defaults works. Storage blocked: both notes show and no errors on any route.
- Navigation: 24 deep-link forms (`#/`, `#`, `#sof`, `#/sof/`, `#/sof?x=1`, `#//`, `#/../etc`, `#/__proto__`, `#/constructor`, `#/%E0%A4%A`, unknown ids, `#/pt-pt`, `#/briefing`) all land somewhere sensible with no error card. Back/Forward through debrief, sof, about, turn-sim restores each page correctly with the right counts.
- Module switching: 42 route changes at 120 ms, then 40 back-to-back hash changes with no wait, ended on a single mounted view with `__ooda.stats()` back to `home l3 s1 f0 t2`. Independent instrumentation (patched setInterval/setTimeout/requestAnimationFrame/addEventListener, b9.mjs) shows every interval, timeout, frame, and window/document listener returning to the home baseline after each of Debrief, Turn Sim, SOF, About, and after 12 more cycles; DOM nodes flat at about 269; canvases 0 on home.
- Keyboard only: skip link works (focus moves to the page, address unchanged); Tab order home is skip link, brand, Home, About, Settings, Report, three module cards, About card, GitHub link; every stop has a visible 2 px outline; Enter on a card opens it with focus on the page; module shortcuts (Space plays, Arrow steps, Home resets) work and do not fire while the Settings dialog is open.
- Offline / update: service worker active, 27 files cached; with the network off, #/, #/about, #/debrief, #/turn-sim, #/sof all open and reload. Publishing a changed `sw.js` showed the "A new version is ready. [Reload]" bar directly under the header (no overlap), it stayed across a route change, Reload cleared it and reloaded. (I restored `dist/sw.js` afterwards.)
- Card media: with reduced motion, no video is requested (home weighs 0.18 MB); otherwise 5 videos, about 1.15 MB total, well inside the 3 MB budget.
- File open (Debrief "Load tracks", then ship assignment, then Load): the four example KMLs from `original/assets/` load ("4 tracks loaded, 52 gaps, 4 tracks trimmed to the shared time") and draw; one file alone loads; local time shows 12:19:04 CST for the 18:19:04Z start. Bad input all gives a readable sentence and "Nothing was changed": not-XML (`line 1: text before the first element`), mismatched tag (`line 5: closing tag </Placemark> does not match <gx:Track>`), one point (`at least 2 are needed`), empty file, a PNG, HTML renamed .kml, a GPX-like file, a track with 6 positions but 2 times, an unreadable time, a good file plus a bad one (all-or-nothing), 5 files at once ("Choose up to 4 track files at once (5 were chosen). Nothing was loaded."), and a 60 MB file ("larger than 30 MB, too big for one track log. Nothing was loaded."). No console errors.
- Click-through (b17.mjs, fresh storage per click): Home 9 controls, About 8, Debrief with the example flight 41, Turn Sim 20, SOF 8: every visible enabled control changed the page, opened something, or left for an external address. The only no-change was "Example flight" pressed a second time (already loaded).
- Overlap scan at 1920x1080 and 1366x768 on home, About, Debrief, Turn Sim, SOF and the Settings dialog: clean. Home, About, SOF also clean at 1024, 768 and 390 wide.
- SOF hooked in (#178), noted only: opens, shows the four default airfields with their limits and minima, honest "No METAR / Failed, no reports yet ⚠" when the feeds are down, correct fresh-report states (CYMJ 3SM BR BKN020 gives "At the limit: CEILING 2000 FT AT LIMIT ..., VIS 3 SM AT LIMIT ..."; CYQR 1/4SM FG VV001 gives "Below limits" plus "Caution: SIGNIFICANT WX (FG)"), 7 cards wrap cleanly at 1366 wide. No console errors. See AF-1 for the one visible oddity.
- Console: zero errors and zero warnings on every route apart from the sandbox certificate errors and two `ERR_ABORTED` reports for a card video and lazy chunks cancelled by navigating away.

## PILOT JUDGEMENT items, with recommendations

1. AF-1: should a stale report ever wear a green tick? Recommendation: no; grey, amber, "Unknown (report 8 h 49 min old)".
2. AF-6: alternate field elevations (CYQR, CYYN, CYXE). Recommendation: pre-fill from the AIP so GNSS-only alternates work out of the box; until then the panel's "needs field elevation" text is honest.

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

