# V6 audit

Date: 2026-09-29. Scope: all of V6 as stored in `original/`: the main page (`original/shell.html`) and the two sub-apps it embeds as base64, the SOF Dashboard and the Traffic Pattern Sim.

The audit is the evidence behind the module map in [`SPEC.md`](../../SPEC.md). Each problem is a GitHub issue, listed at the end of this page.

## How it was done

1. Fourteen agent scans each covered one module or one cross-cutting theme: time and Zulu, modules interfering with each other, and dead or duplicated code. Two more agents mapped the code.
2. Claude then checked every finding against the code at the cited lines. Where a finding was about a result (TAF parsing, turn rate), the V6 function was run in Node to confirm it. Duplicates across scans were merged.
3. The distinct problems were grouped into 49 GitHub issues. Each issue cites the requirement IDs (R#) from the plan doc.

## Results

| | Count |
|---|---|
| Raw findings from the scans | 365 |
| Duplicates merged | 132 |
| Distinct problems | 233 (3 critical, 35 high, 111 medium, 84 low) |

How each of the 233 was checked:

| Verdict in `findings.json` | Shown in issues as | Count | Meaning |
|---|---|---|---|
| `confirmed` | confirmed | 165 | The cited code does what the finding says. Some were also run. |
| `partial` | partly confirmed | 4 | Part of the finding holds; the note says which part. |
| `plausible` | likely, not re-run | 50 | Consistent with the code, but it depends on rendering or a long run that was not repeated. |
| `question` | needs a decision | 13 | The code fact is confirmed, but whether it is wrong depends on what Dad intended. |
| `by-design` | | 1 | Turn Sim's "continue after a completed turn" is deliberate. |

## What matters most

1. **SOF weather (#1 to #4).** V6's SOF misreads some TAFs. A `TEMPO 2916/2920 1/2SM FG` group is read as 2920 SM, BECMG conditions are dropped once the change period ends, CB/TCU layers are ignored, and `M1/4SM` is read as 4 SM. Alternate cards show green whatever the weather, unless the field is marked GNSS-only. V6's automatic alternate calls should not be relied on. The weather-limit highlighting and the NEW WEATHER LIMIT caution never run at all, because their script sits inside the Leaflet `<script src>` tag (#5). That corrects the earlier note that only the Acknowledge button was broken.
2. **Flight numbers that look wrong (#13 to #20 and #47).** The EM chart plots turn rate at half the real value. The 3D view halves and mirrors bank. The Turn Sim swaps some left/right cues, and its auto timing makes aircraft wait for #1. These change numbers V6 shows, so under CLAUDE.md each one is pinned by a test first and changed only with sign-off (Question 18 in the plan doc).
3. **Structure.** Most of the rest comes from modules sharing one page. Hidden modules keep running (#39). The side rails and the Tab key act on every module (#34, #35). Code was copied rather than shared (#43). The module map in `SPEC.md` is designed around these.

## Reading the line numbers

- `original/shell.html` lines are the repo file as it is. The agents worked on a code-only copy named `main.html` with identical line numbers, so evidence text may still say `main.html`.
- `sof.html` and `traffic.html` lines refer to the decoded sub-apps. Run `python3 tools/extract_subapps.py /tmp/v6-subapps` to get them.

## `findings.json`

Every raw finding, including the duplicates, with these fields:

- `id`: scan name and index, for example `scan-sof-c#0`. Issues cite these ids.
- `issue`: the GitHub issue number it belongs to (null for the by-design finding and its duplicate).
- `verdict` and `note`: Claude's check and what it rests on. `duplicate_of` names the finding a duplicate was merged into.
- `severity`, `category`, `module`, `file`, `lines`, `title`, `user_impact`, `evidence`, `suggested_fix`: as the scan reported them. `file` is normalised to `original/shell.html`, `sof.html` or `traffic.html`.

## Issues

| # | Issue | Worst | Requirement | Labels |
|---|---|---|---|---|
| [#1](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/1) | SOF misreads TEMPO/BECMG fractional visibility (1/2SM read as 2920 SM) | critical | R13 | bug, weather, sof, safety |
| [#2](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/2) | SOF drops BECMG conditions after the change period and stretches the initial TAF group | critical | R13 | bug, weather, sof, safety |
| [#3](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/3) | SOF ignores CB/TCU cloud layers and reads M1/4SM as 4 SM | high | R13 | bug, weather, sof, safety |
| [#4](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/4) | SOF alternate cards always show green and ignore the alternate and home limits in WX SETUP | high | R13, R16 | bug, weather, sof, safety |
| [#5](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/5) | SOF weather-limit highlighting and the NEW WEATHER LIMIT caution never run | high | R13, R7 | bug, weather, sof |
| [#6](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/6) | SOF main script crashes at startup, so DTG, TRAFFIC button, tabs and Other airfields are dead | high | R3, R7 | bug, sof |
| [#7](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/7) | SOF wave controls: no wave selector, times assumed CST, Zulu mode drops evening waves, old date kept | high | R10, R13, R16 | bug, sof, time |
| [#8](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/8) | SOF shows no data age or feed status, and a failed refresh wipes the last good METAR | medium | R13 | bug, sof |
| [#9](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/9) | SOF lightning display is hidden everywhere while its feeds keep running | high | R13, R4 | bug, sof |
| [#10](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/10) | SOF layout: page clipped by 258 px, labels and buttons overprint clocks and title, cards vanish | high | R2 | bug, sof, layout |
| [#11](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/11) | SOF keeps polling, streaming and animating after you leave it | medium | R4 | bug, sof, interference |
| [#12](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/12) | Home-screen SOF card flashes ACTION REQUIRED with no weather behind it | high | R3 | bug, shell, sof |
| [#13](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/13) | EM diagram shows turn rate at half the real value | critical | R9 | flight-math, needs-dad, debrief |
| [#14](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/14) | 3D view: bank angle is halved, drawn the wrong way, and shown in wings-level pulls | high | R9, R12 | flight-math, needs-dad, debrief |
| [#15](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/15) | Turn Sim: left/right mix-ups (toward/away inverted, wide/tight inverted on one side, 4312/2134 drawn mirrored) | high | R9 | flight-math, needs-dad, turn-sim |
| [#16](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/16) | Turn Sim auto timing: aircraft wait for #1, delay formula differs from manual, Base delay overwritten | high | R9 | flight-math, needs-dad, turn-sim |
| [#17](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/17) | Turn Sim closure rate and CSV depend on frame rate; history cut to 2000 samples; NaN in two-ship | medium | R9 | bug, flight-math, turn-sim |
| [#18](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/18) | Debrief: 200 kt target compared with ground speed; horizontal vs 3D range mixed; EM uses ground speed | high | R9 | flight-math, needs-dad, debrief |
| [#19](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/19) | Tennis-ball solution: two solvers disagree, vertical motion ignored, cone and INTERCEPT mismatch | high | R9 | flight-math, needs-dad, debrief |
| [#20](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/20) | Turn Fight: vertical mode keeps level-turn rate, angle-off ignores altitude, merge teleports, 1x/2x/4x does nothing | medium | R9, R3 | flight-math, needs-dad, turn-fight |
| [#21](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/21) | Debrief standards labels: #3 judged by two standards at once, never green, ON PARAMETERS with no standard | high | R18, R9 | bug, debrief |
| [#22](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/22) | ForeFlight data: -100000 m altitude, blank pitch read as 0, GPS gaps and spikes drawn as real | high | R11 | bug, debrief |
| [#23](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/23) | Debrief loading: example flight not fitted to view, "#3 not loaded" text, Load wipes tracks before checking, Clear leaves state | high | R11 | bug, debrief |
| [#24](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/24) | Debrief playback: Play at the end does nothing, end frames show 0 kt, jumps after a hidden tab, lat/lon not interpolated | medium | R11 | bug, debrief |
| [#25](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/25) | DFPs are one global list: they appear on other flights, duplicate labels, unsorted, unescaped | medium | R17 | bug, debrief |
| [#26](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/26) | Debrief controls that do nothing: Clock Marks and Fighting Wing Cone while paused, 3D Play/Pause, several 3D settings | high | R3 | bug, debrief |
| [#27](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/27) | 3D view drawing: far aircraft drawn over near ones, ground and arrows move with the formation, pitch drawn as a shift | medium | R12 | bug, debrief |
| [#28](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/28) | Debrief exports: combined CSV not combined, four downloads at once, tiles without Esri attribution | low | R17, R1 | bug, debrief |
| [#29](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/29) | Ship #4 is drawn black on a near-black background in every module | medium | R2 | bug, layout |
| [#30](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/30) | Turn Sim opens at minimum zoom; toolbar covers a quarter of the canvas | medium | R2 | bug, turn-sim, layout |
| [#31](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/31) | Turn Sim state: changes do not stop a running sim, profiles drop settings, Factory Reset has no confirm | high | R3 | bug, turn-sim |
| [#32](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/32) | Turn Sim controls that do nothing: clock tolerance, shackle delay, clock target selectors, status lines, 3 trigger modes | medium | R3 | bug, turn-sim |
| [#33](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/33) | Blocked browser storage stops the whole main page at startup | high | R1, R7 | bug, shell |
| [#34](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/34) | Side collapse rails and hints cover controls, show on modules where they do nothing, and hide section bars | high | R2, R4 | bug, layout, interference |
| [#35](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/35) | Tab key hides panels instead of moving between buttons | medium | R4 | bug, interference, accessibility |
| [#36](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/36) | Debrief map is not resized after panels collapse, and is taller than its box | high | R2 | bug, debrief, layout |
| [#37](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/37) | Overlapping buttons: Traffic MODULES button covers 2D/3D tabs, EM toolbar covers its chart, debug badges on every screen | high | R2 | bug, layout |
| [#38](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/38) | Auto-hide panels checkbox is added three times; the Debrief copy does nothing | medium | R3, R4 | bug, interference |
| [#39](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/39) | Hidden modules keep animating, polling and playing in the background | medium | R4 | bug, interference |
| [#40](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/40) | Dead screens and buttons: hidden splash buttons, orphaned second SOF, PT-PT and Briefing Board cards, stacked CSS | low | R3, R19 | cleanup, shell |
| [#41](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/41) | Home screen autoplays six videos (61 MB) with no reduced-motion option | low | R5, R15 | bug, shell |
| [#42](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/42) | No shared Zulu/local switch; home airfield time zone hard-coded to CST | high | R10, R16 | bug, time |
| [#43](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/43) | Duplicated code to consolidate: formation tables, standards literals, METAR parsers, timeline builds | medium | R8 | cleanup |
| [#44](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/44) | Traffic Sim editor: Build Default buttons overwrite the selected route, and deleting or inserting points breaks links | high | R14 | bug, traffic |
| [#45](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/45) | Traffic Sim spawner: Pair spawns on the wrong route, spawn dropdown follows the left panel, aircraft type does nothing | high | R14 | bug, traffic |
| [#46](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/46) | Traffic Sim rewind and +/-10 s are wrong at non-1x speed and not repeatable; clock wraps at one hour | high | R14 | bug, traffic |
| [#47](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/47) | Traffic Sim: split odds compound, aircraft jump at splits and merges, rounded turns tighter than the stated radius | medium | R14, R9 | flight-math, needs-dad, traffic |
| [#48](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/48) | Traffic Sim profiles: silent overwrite, unguarded storage, unsafe import, leftover test state in the default | medium | R14 | bug, traffic |
| [#49](https://github.com/LIZARDHANDS-commits/Dads-debreif/issues/49) | Traffic Sim layout: point table overflows the panel, labels overlap, map and 3D views need work | medium | R2, R14 | bug, traffic, layout |
