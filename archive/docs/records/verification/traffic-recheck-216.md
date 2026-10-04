# Traffic re-check: #216 (487a1d0), saved setups and exact rewind

13:50Z 2026-09-30. The PR is saved setups (profiles) plus rewind, not vertical profiles. Flight math is untouched.

# Traffic re-check: PR #216 (487a1d0) "saved setups (profiles) and exact rewind with ±10 s"

Checker: independent sub-agent, read-only. Nothing pushed, committed or edited in the repo or /mnt/project-files (except the new screenshots folder). Worktree `scratchpad/wt-others` at 487a1d0, built with `npm run build`, served with `vite preview` on port 4303, driven with Playwright Chromium at 1280x800 (also 1440x900 and 390x800 for layout). Scripts: `scratchpad/findings/scripts216/` (fuzz1, fuzz2, spawn1, clear1, perf1, geo1, b1 to b18, live1/live2). Screenshots: `/mnt/project-files/verification/shots/traffic-216/`.

## What #216 is (the coordinator's "vertical profiles")

It is **saved setups (profiles) plus exact rewind**, not vertical profiles. The commit adds `profile.js`, `profile-store.js`, `profiles-panel.js`, `profiles.css`, snapshots and `seek` in `sim.js`, Rewind / -10 s / +10 s in `clock.js`, `playback-bar.js`, `index.js`, and the spec's Security section. There is no vertical-profile (height against distance) view anywhere in it. `route.js` and `data/*.json` are not in the diff, so the engine's flight numbers are untouched.

## Summary

| Severity | Count | IDs |
|---|---|---|
| High | 0 | |
| Medium | 3 | RW-01, PR-01, PR-02 |
| Low | 9 | RW-02, RW-03, PR-03, PR-04, PR-05, PR-06, UI-01, UI-02, CL-01 (known) |
| PILOT JUDGEMENT | 0 | (nothing in this PR needs a flying call) |

Top 5:
1. RW-01 (Medium) "Clear finished" and the aircraft ✕ remove change the past of the aircraft that stay: the next -10 s shows them on other routes (the dice are shared, so a removed aircraft's rolls vanish from the replay).
2. PR-01 (Medium) Deleting a profile with the keyboard drops focus to the top of the page (Delete becomes disabled under the focus).
3. PR-02 (Medium) A saved name of 27 or more characters with no spaces widens the Profiles section; boxes and the Delete button are cut off at the column edge at 1280 px.
4. RW-02 (Low) An aircraft spawned mid-run with delay 0 (the default) sits one step (18.6 ft at 220 kt) further on after the first rewind than it was on screen before.
5. RW-03 (Low) After any edit the first step back replays from 0 on the main thread: 0.8 s for 7 aircraft, 4.3 s for 30 aircraft at 1 h.

Rewind itself is exact: 0 mismatches in every fuzz and browser walk (below). Saved setups round-trip exactly and the run after Load is identical. No hostile or corrupt stored entry broke the page.

## Test suites

| Suite | Result |
|---|---|
| `node --test tests/golden/traffic-*.test.js tests/unit/traffic/*.test.js` | 507 tests, 499 pass, 0 fail, 8 todo (the plausibility todos) |
| Traffic e2e, `PW_PORT=4303 npx playwright test tests/e2e/traffic.spec.js --project=chromium` | 30 of 30 pass |
| Full `npm test` | 2670 tests, 2662 pass, 0 fail, 8 todo |

## Findings

### RW-01 (Medium) Clear finished and ✕ remove rewrite the past of the other aircraft
- Where: right column, "Clear finished" and each aircraft's ✕; then -10 s, +10 s, Rewind or `[`.
- Steps (browser, `b11.mjs`): press +10 s 90 times (15:00, A1 and A3 have landed), note every row; press "Clear finished" ("Cleared 2 finished aircraft."); press -10 s repeatedly.
- Expected: SPEC-traffic goal 6 "Rewind or step back and forward 10 s and see exactly what happened"; the spec's Testing section "rewinding to any time gives exactly the state the run had then". Housekeeping that only hides finished aircraft should not move the others.
- Actual: at 14:40 A2 was on Split 4 at 2,073 ft, 104 kt; after the clear it is on Pattern 1 at 3,500 ft, 220 kt. A4 was on Split 2 at 4,143 ft, now Pattern 1 at 3,500 ft. All later steps back differ. In Node (`clear1.mjs`, 6 seeds, clear at 1:00:00): 186 to 339 of 360 ten-second moments show the remaining aircraft somewhere other than they were; the first one is the very first step back. Cause: `remove()` and `clearFinished()` call `forgetHistory()`; the replay from 0 has one shared dice, and the removed aircraft's landing and split rolls are missing, so every other aircraft's choices change.
- It is a documented choice (D265: any edit, including remove, drops the history and the replay shows the edited setup), but the choice contradicts goal 6 for an action people press in normal use, and the panel gives no hint that the past has changed. "Replaying…" only appears when the replay is long.
- Screenshots: `/mnt/project-files/verification/shots/traffic-216/16-after-clear-finished.png`, `/mnt/project-files/verification/shots/traffic-216/17-after-clear-and-back.png`.
- Known or planned: D265 logs the behaviour; the per-aircraft dice in task 12 would remove the cause for remove and clear.
- Recommendation (owner acts without waiting): until task 12, make remove and clear timed: keep the aircraft in the sim as "hidden from step S on" (or keep snapshots before S valid and drop only later ones), so rewinding before S shows what happened. The same idea fixes RW-02 and RW-03 for spawns.
- Missing test: `tests/unit/traffic/rewind.test.js`: "after `remove('A1')` or `clearFinished()` at step S, walking back 10 s at a time shows every remaining aircraft (state, dice, trail) as the forward run had it" (fails now; the existing 'after an aircraft is removed it stays gone' test at line 190 checks only that the removed one is gone).

### PR-01 (Medium) Keyboard Delete leaves focus on nothing
- Where: Profiles and notes, Delete.
- Steps (`b8.mjs`): Tab to Delete on a saved profile, Enter, Tab to the question's Delete, Enter.
- Expected: focus stays somewhere sensible after an action (WCAG 2.4.3 focus order; the panel's own `close(true)` intends to give focus back to the button). SPEC-traffic and D263 promise keyboard and screen-reader use.
- Actual: after "Deleted "KB one"." `document.activeElement` is BODY (the top of the page). `close(true)` focuses Delete, then `fillList()` selects a built-in setup and disables Delete, so the focus is dropped. A keyboard user has to Tab from the top of the page again (past the header and the whole routes list).
- Screenshot: none (state, not picture); numbers from `b8.mjs`.
- Known or planned: no.
- Missing test: `tests/e2e/traffic.spec.js`: "after Delete is confirmed with the keyboard, `document.activeElement` is a control inside Profiles and notes (the list or Save)"; unit twin in `tests/unit/traffic/profiles-panel.test.js`.

### PR-02 (Medium) A long name without spaces widens the section and cuts off its controls at 1280 px
- Where: Profiles and notes, after Save, Load, or the Replace question, or a skipped-profile sentence.
- Steps (`b15.mjs`, `b16.mjs`): open the section, type `WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW` (40 characters, allowed) or `Busy_Tuesday_crosswind_12ac` (27), press Save.
- Expected: layout clean at 1280 (brief; SPEC-traffic R2, nothing covered or cut). The left column is 220 px wide.
- Actual: the message `Saved "…"` cannot break, so the section grows to 542 px inside the 220 px column: the name box, the list, the notes box and the message run 334 px past the column and are clipped; the third button shows "Delet"; the Replace question is cut off. Overflow starts at about 27 characters without a space (`Busy_Tuesday_crosswind_12ac` scrollWidth 228 against 220); hyphens and spaces wrap and are fine. The same happens for a skipped stored entry with a long name (`18-unreadable-light.png`). No console error. The map stays drawn (the blank map in the full-page pictures 08, 19 and 20 is a full-page screenshot artefact; viewport pictures 22 and 23 are drawn: 2,706 map pixels before and after).
- Screenshots: `/mnt/project-files/verification/shots/traffic-216/19-long-unbroken-name.png`, `/mnt/project-files/verification/shots/traffic-216/21-realistic-name-27chars.png`, `/mnt/project-files/verification/shots/traffic-216/18-unreadable-light.png`, `/mnt/project-files/verification/shots/traffic-216/22-w40-viewport.png`.
- Known or planned: no. Likely fix: `overflow-wrap: anywhere; min-width: 0` on `.profiles` and its message, confirm and skipped text (`profiles.css`).
- Missing test: `tests/e2e/traffic.spec.js`: extend "nothing overlaps or sticks out" to run with Profiles and notes open, a route selected, and a 40-character name with no spaces after Save and in the Replace question (`parentElement.scrollWidth <= clientWidth`). The existing overlap test at line 316 only runs with the section closed.

### RW-02 (Low) A spawn with delay 0 moves one step after the first rewind
- Where: right column, "+ Spawn" with Delay 0 (the default), then -10 s and +10 s.
- Steps (`spawn1.mjs`, `b5.mjs`): +10 s ten times (100 s), "+ Spawn" on Entry 1, +10 s twice, -10 s twice, +10 s twice.
- Expected: same picture at the same time (goal 6; README "lands exactly where the forward run was").
- Actual: the map differs by one step (canvas not equal, aircraft rows equal): in Node the spawned aircraft is at 7,426.36 ft along its route at 2400 steps before the rewind and 7,444.93 ft after (18.57 ft further), and its trail has 41 points against 40. Cause: `startsAt = t` at the spawn, and the replay flies it in the step whose time equals `startsAt` (`t < a.startsAt` false), a step earlier than the first pass, when it was added after that step. A delay of 0.05 s or more is exact.
- Screenshot: none (one-step shift).
- Known or planned: partly (D265 "replays from 0"), the one-step shift is not mentioned.
- Missing test: `tests/unit/traffic/rewind.test.js`: "spawn with delay 0 at step 2000, note `distFt` and the trail length at step 2400, seek back to 1000 and to 2400: equal" (fails now). Also fixed by keeping snapshots up to the spawn step (see RW-01 recommendation).

### RW-03 (Low) The first step back after an edit freezes the page while it replays from 0
- Where: any edit (spawn, remove, point value, route option, profile load then run), then -10 s, Rewind or `[`.
- Steps (`perf1.mjs`, forward-run 1 h then `forgetHistory()` and step back 1 s): 7 aircraft 0.8 s, 30 aircraft 4.3 s, 200 aircraft 38.8 s; heap after 1 h +9, +21, +48 MB.
- Expected: SPEC-traffic performance line "rewind at 1 hour takes under 50 ms" and 30 aircraft smooth. With unedited history it is met: -10 s takes 0.6 ms (7), 0.9 ms (30), 4.3 ms (200).
- Actual: the replay runs in one synchronous call after the "Replaying…" note is drawn, so the page is frozen for the whole replay and grows with run length and aircraft count. "+ Spawn" counts as an edit, so a person who spawns after an hour and then steps back waits 4 s at 30 aircraft. Presses during the freeze are dropped (`replaying` flag).
- Screenshot: none. Known: D265 gives "about 0.7 s per hour" for the built-in 7 aircraft only.
- Missing test: `tests/unit/traffic/rewind.test.js`: a timed test "after an edit at 1 h with 30 aircraft the first seek back takes under 1 s (or is split across frames)" (fails now); or a documented limit.

### PR-03 (Low) An unparsable stored list is overwritten by Save, against D269
- Where: `profile-store.js` `list`/`save`, storage key `ooda:v1:traffic:profiles`.
- Steps (`b7.mjs`): store `{not json` (or `null`), open Traffic, save "Fresh save".
- Expected: D269 and the spec Security paragraph: "A Save or Delete never loses what this page can't read". Actual: nothing is flagged (no "unreadable" box, no skipped line); Save replaces the text. The app's storage `get` returns the fallback for text that is not JSON, so the store sees an empty list. Valid JSON of the wrong shape (a number, an array, a string, version 0 or 9) is handled correctly: listed as unreadable, Save refused, "Remove unreadable" asks first.
- Screenshot: `/mnt/project-files/verification/shots/traffic-216/06-stored-invalid-json-text.png`. Impact: only hand-damaged storage.
- Missing test: `tests/unit/traffic/profile-store.test.js`: "raw text that is not JSON in the profiles key is reported as unreadable and a Save is refused" (store test with a storage stub whose `get` returns the fallback).

### PR-04 (Low) The spawner has no cap, but Save refuses above 200 aircraft
- Steps (`b9.mjs`): press "+ Spawn" 200 times (207 aircraft), open Profiles, Save.
- Expected: limits stated where they bite (R3). Actual: the spawner adds 207 aircraft with no message; Save says "That profile can't be saved: it has 207 aircraft (the most is 200)." The message is clear, but the person has to remove seven aircraft by hand to save. Screenshot: `/mnt/project-files/verification/shots/traffic-216/09-many-aircraft-save.png`.
- Missing test: `tests/e2e/traffic.spec.js` or `tests/unit/traffic/aircraft.test.js`: "the 201st aircraft is refused at + Spawn with the same limit sentence" (or Save says which button to press).

### PR-05 (Low, not in spec) No Rename
- The brief and the coordinator ask for "rename". The section has Save, Load, Delete, Remove unreadable only; the spec (line 104, "Save, Load, Delete, and the notes box") has no Rename either, so this is not a bug. Workaround works and is exact: Load the profile (the name box takes its name), type the new name, Save (a new entry, `b12.mjs`), Delete the old one. Loading a built-in fills "Setup N".
- Recommendation: leave it; add Rename only if Dad asks. Test if added: `tests/e2e/traffic.spec.js` "rename keeps the content and removes the old name".

### PR-06 (Low) Long lists of skipped entries fill the section
- 60 valid entries in storage give 20 listed and 40 lines "was skipped: only 20 profiles are kept." (one sentence each); an empty name reads `"" was skipped`. Only from hand-edited storage. Missing test: `tests/unit/traffic/profile-store.test.js`: "skipped sentences are summarised past five".

### UI-01 (Low) The playback bar wraps at 1280 px
- With Rewind, -10 s and +10 s added, the bar is two rows at 1280 (Layers and Fit on the second row) with both side columns open. No overlap, nothing cut off. `/mnt/project-files/verification/shots/traffic-216/01-open-1280.png`. Missing test: `tests/e2e/traffic.spec.js`: "the playback bar is one row at 1280 with the columns open" if one row is wanted.

### UI-02 (Low) The section sits below the fold at 1280x800
- Opened, only "Profile name" is inside the first screen; the list, Save, Load, Delete and the message are below it and the person scrolls the page. With a route selected the section is under the 13-point table (`/mnt/project-files/verification/shots/traffic-216/10-profiles-open-1280.png`, `/mnt/project-files/verification/shots/traffic-216/11-profiles-route-1280.png`). Same family as TR-15. Missing test: `tests/e2e/traffic.spec.js`: "with Profiles and notes open the Save button is inside the first screen at 1280x800".

### CL-01 (Low, known: D157, task 12) The clock reads a second early after stepping
- Six +10 s presses read 0:00:59 (`live2.mjs`, and 0:01:39 for 100 s); three -10 s from there read 0:00:39. Ten seconds reads 0:00:10. The true-second clock is D157 (not built). The ±10 s feature makes it visible. Missing test: `tests/unit/traffic/readouts.test.js`: "after `stepBy(10)` n times the clock reads 10 n s" (with D157).

## Checked and passed

Exact rewind (item 1):
- Fuzz in Node, `fuzz1.mjs`: a forward reference run per seed (state, dice and every trail, hashed at every step for the first 2 min, at every 37th step after, and at every event step and the one before it); the fuzzed sim does 120 random moves per case (-10 s, +10 s, to 0, to the end, to an event step ±1 with and without 10 s before it, random moment, forward by `stepTo`) with snapshot caps 720, 6 and 3 (forces the thinning). 40 seeds x 15 min, 8 seeds x 1 h, 1 seed x 2.5 h (the 720 cap is passed and thins): **17,107 comparisons, 0 mismatches**, 1,379 event steps (splits, joins, landings, starts) included.
- Clock-level fuzz, `fuzz2.mjs`: random frame times 4 to 64 ms at random speeds 0.25x to 8x, play, pause, rewind, ±10 s, seek, reset: 60 seeds, **24,000 comparisons, 0 mismatches, 0 invariant breaks** (-10 s is exactly 200 steps back or to 0, +10 s exactly 200 ahead, playing carries on).
- Browser (real app, `b1.mjs`, `b3.mjs`): +10 s to 400 s at 8x, and to 1,000 s at 0.25x (crosses the landings at 8:39 and 14:44), recording rows and the map picture at every step; walk back to 0, forward again, and random hops: 0 mismatches. At t=0 -10 s stays 0:00:00 Paused; Rewind at 0 pauses itself. There is no "end": the run is unbounded and the fuzz reaches 2.5 h.
- While playing (1x): +10 s and -10 s carry on Running from the new time; -10 s twice to 0 carries on from 0. While rewinding: -10 s and +10 s stop the rewind (D264), Space stops it, Rewind twice starts and stops, Load and Reset stop it. `[` and `]` work on the map and off it and are ignored in the name box, notes, selects (`b8.mjs`, `b2.mjs`).
- An edit (a split added, a route option) then -10 s and +10 s equals flying the edited setup from 0 (existing e2e, and the spawn case above except RW-02).

Saved setups (item 2):
- Round trip (`b6.mjs`): with speed 4x, five layers changed, four conflict limits, rounded turns off, manual radius 2,500, route renamed, a label, height, speed and G changed, "+ Point", two spawns (one a pair), and notes with HTML characters: Save, Load the built-in, Load it back: the boxes, layers, settings, routes, aircraft list and notes are equal; the stored JSON of a second Save under another name is equal in every field; the 30 x 10 s run afterwards (rows and map, Fit pressed, route deselected) is identical to the one before Save. After a page reload the same profile opens (last used) and the run is identical again.
- Delete, Save over, Load: each asks with the question; Escape cancels and gives focus back to the button; Cancel has focus; a built-in name is refused; Delete is disabled on built-in setups. Load while playing or rewinding stops and shows 0:00:00 Paused.
- Rename: see PR-05 (workaround exact).
- Corrupt or old entries (`b7.mjs`, 27 cases, each in a fresh browser): invalid JSON, null, a number, an array, a string, versions 0 and 9, `profiles` not a list, entries that are null, numbers, strings or arrays, an old-version entry among good ones, a `__proto__` key, names that are objects or numbers, a 1e308 position, wrong-type and out-of-list settings, bad seeds, a 500 KB profile, 60 profiles, `last` missing or garbage or pointing at a broken entry, duplicate names, control-character and RTL-override names, a stored name equal to a built-in, duplicate route ids, a link to a missing route. In every case: the page opens, 7 aircraft and 9 routes are shown, 0 console errors or warnings, no dialogs, nothing polluted (`({}).polluted` null), the good entries are listed and load, bad ones are counted as "can't be read" and kept, and Save still works (or refuses in words for a foreign list). Exception: PR-03.
- Names and injection (`b9.mjs`): `<img src=x onerror=…>`, `<script>`, `"><svg onload=…>`, `'; DROP TABLE--`, `__proto__`, `constructor`, `toString`, `hasOwnProperty`, a right-to-left override, an emoji, leading and trailing spaces, upper and lower case: all saved and shown as text (list, messages, question, name box); `window.__xss` never set; 0 injected elements. Direction-changing characters are removed, spaces trimmed, 41 or more characters cut to 40 by the box, an empty or blank name refused in words, built-in names refused.
- Limits: the 21st profile refused ("20 profiles are saved already. Delete one to make room."); the list of 2,000,000 characters: with 8 valid 264 KB profiles (2.11 MB) stored the page loads in 0.7 s, lists all 8, and a Save is refused with the count ("would take more than 2,000,000 characters (2,120,696)"); 200-aircraft limit: PR-04. A write that the browser refuses (quota) gives "Saved …, but this browser wouldn't keep it" and shows the "won't be saved" note. Two tabs: a stale list still loads a profile the other tab deleted (loads from the copy it holds), and a Save in either tab keeps the others (no overwrite of the other tab's entries).
- Keyboard and screen reader (`b8.mjs`, `b14.mjs`): the section opens with Enter; the order is name, list, Save, Load, Delete, question, message, notes; the message is a `status` region, the question an `alert` with focus on Cancel; **axe (WCAG 2.0/2.1 A and AA) 0 violations** on first look, section open, Replace question open, unreadable box and skipped list shown with a route selected, Remove-unreadable question open, in dark and light schemes. Only PR-01 and PR-02.

Nothing else regressed (item 3):
- 29L geometry (`geo1.mjs`, engine untouched in this diff and the crosscheck tests in `npm test` pass): threshold at 1,880 ft, runway 298.4 degrees true, 8,150 ft; left-hand pattern (15,244 ft to the left, 443 ft to the right); window (0.75 NM) at 2,119 ft on Pattern 1, Entry 2 and Split 1, exactly 3.00 degrees to the threshold; Entry 2 at 2.5 NM is 2,676 ft (3.00 degrees). Same numbers as `traffic-e2e-07c73e4.md`. TR-02, TR-05 to TR-08, TR-20 are engine items not in this diff and unchanged by it.
- Settings menus with Escape: Traffic settings, Layers and the header Settings dialog all close on Escape and give focus back to their button.
- Layout at 1280x800 (first look, section open, route selected) and 1440x900: no overlap, no sideways scroll, no console error (`b10.mjs`); at 390 px the page has no sideways scroll (scrollWidth equals the width). Exceptions: PR-02, UI-01, UI-02.
- UI fuzz (`b13.mjs`): 640 random clicks and keys across Rewind, ±10 s, Play, Reset, speed, Spawn, Pair, Clear, Save, Load, Delete, route select, + Point over 4 seeds: 0 console errors, the status word and the Play button label always agree, the clock never negative.

Live site https://lizardhands-commits.github.io/Dads-debreif/#/traffic: Chromium here rejects the site's certificate through the sandbox proxy (`ERR_CERT_AUTHORITY_INVALID`), and I did not turn verification off. I fetched the deployed files with curl and the proxy's CA bundle (index.html and every file the service worker lists, 33 files, build `2026-09-30 52eaaac`, built 13:07:35Z) and served those exact bytes on 127.0.0.1:4304. 52eaaac contains 487a1d0, and `git diff 487a1d0 52eaaac` has no change under `src/modules/traffic`, `tests/unit/traffic` or the Traffic spec. On the mirror (`live2.mjs`): the bar shows Rewind, -10 s, +10 s; +10 s x6 then -10 s x2, +10 s x2 gives the same picture; Rewind runs (0:00:53 Rewinding after 0.8 s); Save "Live check", reload, the profile is listed and selected, Delete works; 0 console errors. Picture `/mnt/project-files/verification/shots/traffic-216/15-live-mirror-1280.png`. Not tested on the real host: response headers and the service worker.

## Logged decisions checked (decisions-for-review.md)

- D263 (inline questions, focus on Cancel): agrees with the spec; the focus handling after Delete is PR-01.
- D264 (±10 s keeps play or pause, a rewind stops): verified as written; no spec line contradicts it.
- D265 (any edit drops the history, replay from 0, "Replaying…"): contradicts spec goal 6 ("see exactly what happened") for remove and clear (RW-01) and leaves a one-step shift for spawns (RW-02); the freeze grows with aircraft (RW-03).
- D266 (720 snapshots, thinned): verified past the cap (2.5 h fuzz, and caps of 6 and 3): exact.
- D267 (20 profiles, 2,000,000 characters, 30 routes, 100 points, 40-character names; spec updated): verified, spec text now matches the code.
- D268 (spawner boxes and 2D/3D not kept): verified; wind is kept (`windFromDeg`, `windKt`) as the spec's "keeps … with the wind" needs.
- D269 (never overwrite what can't be read): holds for wrong-shape or wrong-version data, not for text that is not JSON (PR-03).
- No Traffic call in this range contradicts the SMM, manuals or spec on a flight number; none of them touches flight math.

## Earlier Traffic findings, status after #216

Not re-tested where the file is not in the diff (aircraft.js, layout.js, map2d.js, settings panel, route.js, data): TR-14, TR-15, TR-16, TR-17, TR-18 and the engine items TR-02 to TR-08, TR-20 are unchanged by this diff (inference from the file list, plus the geometry numbers above). TR-12/CL-01 is now visible in the ±10 s steps. The "Rewind, plus and minus 10 s" controls listed as "not present" in `traffic-e2e-07c73e4.md` are now present and work.

## Missing tests (summary for the owner)

| Finding | File and test |
|---|---|
| RW-01 | `tests/unit/traffic/rewind.test.js`: remove or clear at step S, then every remaining aircraft is as the forward run had it when walking back |
| RW-02 | `tests/unit/traffic/rewind.test.js`: spawn with delay 0 mid-run, `distFt` and trail length equal at the same step after seek back and forward |
| RW-03 | `tests/unit/traffic/rewind.test.js`: timed replay after an edit at 1 h with 30 aircraft under 1 s, or split across frames |
| PR-01 | `tests/e2e/traffic.spec.js`: after a keyboard Delete, focus is inside the section |
| PR-02 | `tests/e2e/traffic.spec.js`: section open, 40 characters with no spaces, no sideways overflow after Save and in the Replace question |
| PR-03 | `tests/unit/traffic/profile-store.test.js`: non-JSON text in the key is unreadable and a Save is refused |
| PR-04 | `tests/unit/traffic/aircraft.test.js`: the 201st spawn is refused with the limit sentence |
| PR-06 | `tests/unit/traffic/profile-store.test.js`: skipped sentences summarised past five |
| UI-01, UI-02 | `tests/e2e/traffic.spec.js`: bar is one row at 1280; Save inside the first screen with the section open |
| CL-01 | `tests/unit/traffic/readouts.test.js`: `stepBy(10)` n times reads 10 n s (with D157) |

## Audit (auditor agent, read-only). Its corrections override the text above.
| Finding | Verdict | Corrected facts |
|---|---|---|
| RW-01 Clear/✕ rewrites survivors' past | Confirmed, Medium | Clear at 15:00: A2 Split 4 at 2,073 ft, 104 kt becomes Pattern 1 at 3,500 ft, 220 kt. Node: 186-339 of 360 moments differ. Cause: shared dice (sim.js:143,154,408-419); the controls prove it. This is a logged trade-off (D265) that contradicts SPEC-traffic goal 6, rule 4, lines 409 ("per aircraft" dice), 547 and 578, and the spec was never amended. Fix: make remove/clear timed events, or per-aircraft dice (planned task 12), or amend the spec. This is for Patrick through D265. |
| PR-01 focus to body after keyboard Delete | Confirmed, lowered to Low | The next Tab goes to Notes in the section, not the page top. The harm is WCAG 2.4.3 and screen-reader context. Cause is profiles-panel.js:95-177. The unit test at profiles-panel.test.js ~205 pins the fallback, so the fix must keep it. |
| PR-02 long name widens the Profiles section | Confirmed, lowered to Low; threshold corrected | 27 characters is fine. Sideways scroll starts at 30+ characters with no spaces, and Delete passes the column edge at 33+. Content can still be reached by scrolling. The existing test runs at 1366 with the section closed; the new one should run at 1280 with it open. |
| RW-02 delay-0 spawn one step off after rewind | Confirmed, Low | +18.57 ft (one 0.05 s step). Cause: startsAt=t (sim.js:378) with the check at :194. Any delay above 0 is exact. |
| RW-03 first step back after an edit replays from 0 | Confirmed, Low | 7 aircraft 0.99 s, 30 aircraft 4.9 s, 200 aircraft 36.5 s. Presses during the freeze are queued, not dropped. Ignore the heap figures. |
