# Dad's Debrief Tool: Refactor Plan
(Plain-text copy of Claude Doc tab "Refactor Plan" node ca42dc01-e7f7, rev 17, read 3 Oct 2026. Hand-transcribed from the tool output; tables flattened to "|" rows. The embedded diagram "refactor plan · 7 steps, 6 approval gates" (node 0b9b161d-eb6d) was not read.)
2026-09-29 · Patrick Korhonen
## Summary
We keep every working feature, cut the dead weight, and rebuild the tool as a fast, modular website in six steps, each ending with a check you approve. Nothing is thrown away until the new version matches the old one on Dad's real flight tracks.
- Why it needs it: the file is 119 MB, and 96% of that is videos, map images and example tracks. The actual code is under 1 MB but has been patched over many times: the SOF 24-hour weather timeline alone is written five times, each version replacing the last.
- What's broken today: a test run of all 9 modules found 3 confirmed bugs, several layout problems, and code that points at buttons that no longer exist (details below).
- How we'll know it works: we record what the current tool calculates for the 4 example tracks, then the new version must produce the same numbers. Each module gets its full test run once, when it is finished; until then GitHub's automatic tests guard every change.
## What I found
All 9 modules open, and the core debrief tools work: the KML viewer loaded the 4 example tracks (23,400 points) and played them back. The problems are in the SOF dashboard, the layout, and the weight of the file. I opened each module in a headless Chrome browser on 2026-09-29 and recorded errors and screenshots.
| Module | Result | Problems seen |
| SOF Dashboard | Opens, with errors | Bug: the "New weather limit" caution's Acknowledge / Clear button never works. Its code runs before the button exists (error: sofLimitAck is not defined). Bug: if the Leaflet map library can't be downloaded, the map crashes (L is not defined) instead of saying so. Relies on 9 outside services. |
| KML Viewer | Works | Bug: after loading the example flight it says "#3 not loaded" even though all 4 tracks load (hard-coded text, line 2411). Tracks aren't zoomed to fit, so they sit at the edge of the view. |
| Turn Sim | Works | Aircraft labels overlap each other. The right-hand panel is cut off on a 1600 px wide screen. |
| 3D Viewer | Works | Toolbar labels are hidden behind the sliders. Shows a blank view until tracks are loaded in the KML viewer. |
| Turn Fight | Works | None seen. |
| Traffic Pattern | Works | Satellite map needs ArcGIS online. |
| About | Works | None seen. |
| PT-PT, Briefing Board | Placeholders | Click shows "under construction" only. |
| All screens | Layout | The "Hide controls" and "Hide metrics" side tabs cover panel headings, and also appear on the home screen. The layout needs at least 1,240 px of width, so it doesn't fit a tablet or phone. |
In the code:
- The SOF dashboard is 35 separate script blocks and 37 style blocks layered on top of each other, with 217 forced style overrides (!important), 7 page watchers and 28 timers. That layering is where most of its fragility comes from.
- Code in both the main tool and SOF looks up 13 buttons and panels I can't find anywhere in the page, for example threeDPlay and threeDPause.
- The weather comes from two different places: the main tool calls aviationweather.gov, and SOF calls datamask.org.
What I couldn't test: my test browser has no internet access, so live weather, radar, lightning and map tiles still need checking on a real connection. It also can't play the module-card videos.
## Trim
The biggest win is size: the home screen should load in about 3 MB instead of 119 MB, and nothing Dad uses goes away.
| What | Today | Plan |
| Module-card background videos (6) | 61.6 MB, all downloaded up front | Re-encode as silent 960 px loops (about 2.3 MB for all six, tested) that load only when their card is on screen, with a still image first. Not GIFs: see below. |
| Map images (4) | 14.8 MB of PNG | Convert to WebP (about a third of the size) and load with the module that uses them. |
| Example flight tracks (4) | 11.2 MB | Download only when someone presses Load Example Flight. |
| SOF weather timeline | 5 copies, 4 of them dead | Keep the newest version only. |
| Patch-on-patch code and styles | 35 script and 37 style blocks in SOF, 348 forced overrides across the tool | One clean file per module plus shared styles. The layering goes away as each module moves. |
| Lookups of missing buttons | 13 | Delete. |
| PT-PT and Briefing Board | Full-size cards that open nothing | Hide until they're built, or show as a small "coming soon" row. |
| Weather sources | Two METAR/TAF providers and 9 outside services in SOF | Keep the ones Dad actually uses, with one fallback each. |
Why not GIFs: I converted all six card videos on 2026-09-29. As GIFs they came to 69.5 MB, bigger than today's 61.6 MB even at lower quality (640 px wide, 15 frames a second, 128 colours). GIF stores every frame almost whole, while modern video only stores what changes between frames.
| Format (all six videos) | Total size | Quality |
| Today's MP4s (up to 1504 px, with unused audio) | 61.6 MB | Full |
| GIF, 640 px | 69.5 MB | Visibly worse: banding, choppier |
| MP4, 960 px, no audio | 2.9 MB | Looks the same at card size |
| WebM, 960 px, no audio | 2.3 MB | Looks the same at card size |
| Still image per card | 0.2 MB | No motion |
The re-encoded videos are 95% smaller because today's are much larger than the cards they fill, carry soundtracks that never play (the cards are muted), and use a high bitrate. We'd ship WebM with the MP4 as a fallback for older Safari.
## User-friendliness
The aim is that someone who has never seen the tool can open a link on any device and debrief a flight in under a minute.
1. Fast first open. The home screen shows within a few seconds on a phone connection. Heavy parts load only when a module is opened.
2. Fits any screen. Every panel fits on desktop and laptop screens down to 1366 × 768 without being cut off. Tablets and phones get a usable stacked layout, but they come second. The side tabs stop covering headings.
3. Tracks you can see. The KML and 3D views zoom to fit the loaded flight automatically. Aircraft labels move apart instead of overlapping.
4. Try it instantly. A "Load example flight" button in every debrief module, not just the KML viewer, so the 3D view is never blank.
5. Clear messages when something's down. If a weather or map service can't be reached, the panel says which one and when it last updated, instead of going blank.
6. One way around. The same Modules button and layout everywhere, the tool remembers the last module used, and Zulu/local time is one setting that applies to every module.
7. Works offline after the first visit. It can be installed like an app. Everything except live weather keeps working with no signal.
## Verify and test
Test plan changed 30 Sep 2026 (Patrick, D357 to D367). We build one module at a time and test it once, at the end. Until a module is finished, a PR only needs GitHub's automatic tests to pass before it merges, so the live site never breaks. Dad's own run-through is still the final sign-off for each module. The table below is what the end-of-module test proves.
- End of each module: the full local test run, screenshots, accessibility checks, and one short Verification check covering only safety items and flight numbers against the manuals. The separate skills check has stopped.
- Numbers: new numbers may sit within a tolerance (about ±1 kt, ±50 ft, ±1° or ±1%) rather than match exactly. Dad's already-ported math may be changed when needed, logged as a judgement call.
- No heavy stress runs: no mutation runs, fuzzing or exact memory counts. Normal tests only.
- 3D is a bonus: what's built stays, but no more 3D tests or polish in modules still being built.
| Requirement | How it's proven |
| Opens anywhere with nothing to install | Automated runs in Chrome, Safari and Firefox engines, at laptop, tablet and phone sizes, against the live web address. |
| Flight math unchanged | Before any code moves, record what the current tool outputs for the 4 example tracks at fixed times: spacing, fore/aft, aspect, HCA, closure, G, turn rate and radius. The new version must match within a stated tolerance, or we note why it changed. |
| Every module works | A scripted click-through of every module and its main buttons (the same test I ran today), with zero browser errors allowed. |
| SOF alerts behave | Tests that a new weather-limit caution appears, can be acknowledged and clears. Also tests that a weather service being down shows a message rather than crashing. |
| Times are right | Zulu/local conversion tests. Moose Jaw stays on CST (UTC-6) all year, so local time must never shift for daylight saving. |
| Loads fast | A size budget checked automatically: the home screen stays under about 3 MB. |
| Works offline | A test that turns the network off after the first visit and checks every module still opens. |
| Dad approves | A short checklist per module that Dad runs on his own device before that module counts as done. |
## The steps
[embedded diagram: refactor plan · 7 steps, 6 approval gates]
Nothing moves to the next step until you've approved the gate on the right. Step 1 can start now: I'll record the flight-math baseline while you and Dad gather known bugs.
## Source manuals
The tool's numbers, speeds, patterns and geometry come from these manuals ("follow the SMM"). None of them is public, so the repo gives page references only, never text or images. The readings and page references are indexed in the project's manuals folder (manuals/README.md).
- Gen Book: 2 CFFTS Harvard II Gen Book, Version 8.9. Cited as "Gen Book p.7".
- EFIG: instructor guide slides, 24 Jun 26. Cited as "EFIG p.151".
- SMM: A-12-HVD-000/PT-D01, CT-156 Harvard II Standard Manoeuvre Manual, Change 3, 28 Aug 2024. Cited as "SMM 4.14 para 32".
- NFM: A1-T6AAA-NFM-100, T-6A NATOPS Flight Manual (USN/USAF, not Moose Jaw orders), linked by Patrick 2026-09-30 06:38Z. Cited as "NFM Fig 3-4, p.3-12". Its charts are images, so their numbers are read by hand.
## Open questions
Open questions and my recommendations are in @Questions. Answers you've already given are logged in @Decisions and @Requirements, and ideas for later go in @Future features.
