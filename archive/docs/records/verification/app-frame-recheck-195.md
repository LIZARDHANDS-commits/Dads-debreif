# Recheck of app frame #195 (main 82d23d9), independent, read-only

Checker: independent. Built 82d23d9 in wt-frame, served on 4305. Traffic is not on the home screen at 82d23d9, so I also served origin/main (3a781a0, after #196) from an exported copy on 4306 for the Traffic checks only. Playwright Chromium, sizes 1280x720, 1280x800, 1366x768. Scripts: scripts/r1.mjs to r12.mjs plus scan.mjs (overlap scan that counts headings and panel titles as well as controls, clips to scroll columns, and also checks covered controls and sideways scroll). Shots: shots-2/. Sandbox: outside hosts stubbed; certificate errors excluded from "console clean".
AF-1 (SOF stale report) skipped as instructed (fix is in #197).

## Verdict per item

| Item | Verdict |
|---|---|
| 1280 px floor (D183) with a clean scan at 1280 | PARTLY FIXED (RC-1) |
| Below 1280: clear message or graceful scroll | PARTLY (RC-2): floor is written down, but nothing tells the user |
| #/SOF, #/Sof, #/sof | FIXED |
| AF-5 note when an alternate becomes home | FIXED |
| Escape closes settings menus, focus returns | FIXED |
| openRoute waits for stylesheets | FIXED |
| webglSupported() in ui-kit | PARTLY (RC-3): helper exists and Debrief (on newer main) uses it; Turn Sim does not, and logs 4 console lines |
| AF-1 stale SOF report | not checked (see above); fix commit f635fe6 was on branch claude/sof-spec-ozvaiq, not in 82d23d9 |

## Findings

### RC-1 (Medium) Debrief 2D toolbar menus: "Tools" opens wider than the window at 1280 (page scrolls sideways 40 px); "Weather" and "Routes and charts" cover the Formation column
- Where: #/debrief with the example flight, 2D view, toolbar buttons Tools, Weather, Routes and charts.
- Steps: 1280x720 or 1280x800, load Example flight, click Tools (script r3.mjs).
- Expected: D183 / SPEC-shell R2: from 1280 up, nothing cut off, no sideways scroll, no control covered.
- Actual: the Tools menu box runs from x 894 to 1320, document width 1320 > 1280, so the page scrolls sideways (both heights). At 1366 it fits (no scroll), but the box still spills 250 px past the map. The Weather menu (x 769 to 1195) covers the Formation panel's "More detail", "+ Add" and "Debrief settings" buttons at 1280 (211 px past the map), and at 1366 (125 px) and 1440 (51 px). Routes and charts spills 8 px at 1280. All menus close on Escape and focus returns to their button (checked), so it is a temporary cover, not a trap. Layers, and every menu in 3D view, are clean.
- Screenshots: /mnt/project-files/verification/shots/app-frame-2/1280x800-2D-tools-sideways.png, /mnt/project-files/verification/shots/app-frame-2/1280x800-debrief_menu_2D_Weather.png, /mnt/project-files/verification/shots/app-frame-2/1280x800-debrief_menu_2D_Tools.png.
- Known/planned: not in todo. The #195 scan passes because it never opens a menu.
- Missing test: tests/e2e/layout.spec.js: on #/debrief at each size, open each toolbar menu in turn (Layers, Routes and charts, Weather, Tools) and assert document scrollWidth <= viewport width; optionally that a menu body's right edge stays inside the window.
- Recommendation: right-align the Tools and Weather menus (open leftward from their button) or give the menu body max-width: calc(100vw - left - 16px) so it wraps to one column; keep it over the map only.

### RC-2 (Low) Below 1280 nothing tells the user; Debrief overlaps below about 1160, and Turn Sim, Turn Fight and Debrief break at phone width
- Steps: r6.mjs and r7.mjs; sizes 1200, 1100, 1024, 768, 390.
- Actual (sideways scroll / cut off / overlaps): Home, About, SOF clean down to 390. Turn Sim and Turn Fight clean down to 768, but at 390 scroll sideways (596 and 644 px) with 4 cut off and 3 to 5 covered controls. Debrief: clean at 1180 to 1279 (checked 1279, 1240, 1200, 1180), overlaps start at 1150 (Tools over the Formation header), 6 overlaps at 1024, sideways scroll to 894 at 768 and 390. No banner or note about width at any size.
- Expected: D183 says narrower windows "may scroll sideways and are not promised", so this is per decision. But the user gets no hint. Nothing broken at iPad landscape 1180x820.
- Missing test: tests/e2e/layout.spec.js: none for the behaviour as decided; if a notice is added, "under 1180 px a one-line note says the page needs a wider window".
- Recommendation (owner acts without waiting): add a dismissible one-line note in the shell under 1180 px ("This works best on a screen at least 1280 px wide; parts may be cut off"). Low effort, and honest. PILOT JUDGEMENT: none.

### RC-3 (Low) Turn Sim with WebGL off: clear message, but four console error/warning lines; the new helper is not wired in there
- Steps: Chromium with --disable-3d-apis --disable-gpu (r8.mjs), open #/turn-sim, click 3D.
- Actual: the toolbar shows "3D needs WebGL, which this browser does not have." and stays in 2D; Play still works (t advances). Console shows 3 THREE.WebGLRenderer errors and one "WebGL could not start" warning. Debrief on 82d23d9: message "3D needs WebGL 2, which this browser doesn't have or has turned off." appears (red box in the Flight column, far from the 2D|3D switch), stays in 2D, switching back to 2D works, console empty. SPEC-ui-kit line 197 leaves the wiring to module owners; on origin/main Debrief calls webglSupported() but Turn Sim does not.
- Missing test: tests/e2e/turn-sim.spec.js: with getContext('webgl2') returning null, clicking 3D shows the message and logs no console errors (Debrief has the equivalent).
- Recommendation: Turn Sim calls webglSupported() before creating the renderer (same as Debrief); Debrief could put the message next to the view switch (Low).

### RC-4 (Low, code note) Traffic keeps its own Escape handler on top of the ui-kit one
- src/modules/traffic/settings-panel.js lines 115 to 122 repeat what createSettingsMenu now does. Harmless (the second one returns at once because the menu is already closed); behaviour tested and correct. Remove when Traffic is next touched.

## What PASSED (with evidence)

- Overlap / cut-off / covered / sideways scroll at 1280x720, 1280x800, 1366x768, default state and with every collapsible panel open: Home, About, Turn Sim (incl. Aircraft errors, Turn Sim settings, Profiles, More detail), Turn Fight (incl. Fight setup, About this model, More detail, Turn Fight settings), SOF (incl. SOF settings), Debrief empty, Debrief with example flight in 2D and in 3D (WebGL on via swiftshader), with Save/open/CSV, More detail and Debrief settings open, and Tools with the EM chart and Tennis ball panels open in 3D. All clean, zero console errors. Traffic (origin/main) also clean at all three sizes with all panels open, no console errors. (An early run flagged false overlaps from the sticky header and scrolled columns; the final scan.mjs resets scroll and clips to columns, and it does catch the real problems in RC-1 and RC-2, so clean results are not vacuous.)
- Debrief toolbar menus in 3D (Weather, 3D settings, Tools) and in 2D (Layers): clean at all three sizes.
- Route case: #/SOF, #/Sof, #/sOf/, #/SOF?x=1, #/About, #/Turn-Sim, #/DEBRIEF, #/TURN-FIGHT all open the right page with the right title and heading; the typed hash is kept in the address bar. #/Traffic and #/PTPT go to Home at 82d23d9 (coming soon / not found).
- AF-5: Settings, Home field CYQR, Enter: alternates become CYYN, CYXE and the line reads "CYQR is now home, so it was taken off the alternates." (small muted text under the field, role status, colour rgb(155,184,198) on dark, not red). It clears on the next change (home to CYMJ or KGGW shows no note). Shot: /mnt/project-files/verification/shots/app-frame-2/af5-note.png. Wording is clear.
- Escape (r4.mjs, r11.mjs, r12.mjs): Debrief settings, Turn Sim settings, Turn Fight settings, SOF settings, and Traffic settings (origin/main): (A) header focused, (B) focus on first control after Tab, (C) focus in an input or select inside: each closes the menu and puts focus on the menu header button; Escape when closed changes nothing and does not leave the page; Tab afterwards continues from the header; the header Settings dialog still closes on Escape and returns focus to its button. Toolbar menus: Debrief Layers, Routes and charts, Weather, Tools; Turn Sim Layers; Traffic Layers all close on Escape and return focus to their button.
- openRoute waits for stylesheets: `npx playwright test layout.spec.js ui-kit.spec.js` gives 45 passed, including "openRoute waits for a module stylesheet that is slow to arrive".
- Traffic is reachable only on main after #196; not reachable at 82d23d9.

## Logged calls (decisions-for-review.md)
D183 (1280 floor) is consistent with SPEC-shell and the plan; nothing contradicts the SMM, manuals or spec. It is worded as "clean scan at 1280", which RC-1 shows is true only with menus closed.
