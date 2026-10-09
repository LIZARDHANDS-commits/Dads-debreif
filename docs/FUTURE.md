# Future: whole-tool ideas and possible new modules

Ideas that are not being built. Each module's own ideas are in its folder (`modules/<module>/future.md`). An idea moves into a plan only with Patrick's yes, and a new idea goes on a future list the same day it is asked for (`AGENTS.md:33`). Patrick's rule for every idea here: do not overwhelm the screen; extras start off and open when asked (`pf/reset/0-lessons/sources/thread-new-feature-ideas-research.md:64`).

## Where all 54 Feature Ideas are

Patrick asked on 4 Oct for all of the researched ideas, plus the page's browser-access notes, to be added to this file and to each module's future list, grouped by module, with a link back to the page (`pf/reset/2-inventory/file-register.md:49`). The page is https://claude.ai/artifact/6PMvFiKigB29hBvVSoJ2op (version 1790732504-77ff, researched 30 Sep). Its list is copied in `feature-ideas.md`: it holds 54 ideas, numbered 1 to 54 (`pf/reset/2-inventory/agents/sources/feature-ideas.md:1`, `pf/reset/2-inventory/agents/sources/feature-ideas.md:56`). Where each one went:

| Where | Ideas (Feature Ideas numbers) | Count |
|---|---|---|
| This file, whole tool | 12, 25, 30, 31, 32, 48, 49, 50, 51, 52 | 10 |
| This file, possible new modules | 29 (PT-PT Sim), 33 (Briefing Board) | 2 |
| [Debrief](modules/debrief/future.md) | 1, 2, 3, 4, 5, 6, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 46, 47, 53, 54 | 22 |
| [SOF](modules/sof/future.md) | 9, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45 | 13 |
| SOF plan, Step 3 (not a future item) | 8 crosswind per runway (its limits-matrix half is the question SOF-Q14) | 1 |
| [Traffic](modules/traffic/future.md) | 27 | 1 |
| [Turn Fight](modules/turn-fight/future.md) | 24, 26 | 2 |
| [Turn Sim](modules/turn-sim/future.md) | 28 | 1 |
| [Shared](modules/shared/future.md) | 7, 21 | 2 |
| **Total** | | **54** |

Patrick's own picks on 30 Sep were ideas 1, 2, 3, 4, 6, 7, 8 and 10 for the future list (idea 3 behind a toggle) and idea 5 as "a future feature, not for now" (`pf/reset/0-lessons/sources/thread-new-feature-ideas-research.md:69`, `pf/reset/0-lessons/sources/thread-new-feature-ideas-research.md:83`).

## Whole-tool ideas

- **Privacy mode**: swap names for callsigns on import and strip metadata before anything is shared; it must come before share-by-link (Feature Ideas idea 12; value high, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:14`)
- **Flight physics explorables**: slider pages for load factor against bank, stall speed against G, corner speed, the V-n diagram and turn radius against rate; T-6 numbers labelled as not for flight; closest to Turn Fight's purpose (`pf/reset/1-requirements/scope-and-ideas.md:197`) (Feature Ideas idea 25; value high, effort medium; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:27`)
- **Spatial disorientation demos**: animations of the leans, the somatogravic illusion and Coriolis, showing sensed attitude beside true attitude (Feature Ideas idea 30; value medium, effort medium; `pf/reset/2-inventory/agents/sources/feature-ideas.md:32`)
- **Emergency drill engine**: flashcards and random emergency scenarios with a timer; it ships empty and instructors load their own content (see the content rule below) (Feature Ideas idea 31; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:33`)
- **Radio call practice cards**: scripted prompts for circuit, overhead, formation and emergency calls with the expected call revealed; local phraseology comes from instructors (Feature Ideas idea 32; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:34`)
- **Share by link and QR code**: a small debrief compressed into a link with a QR code, the data staying in the link; it needs privacy mode first (Feature Ideas idea 48; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:50`)
- **Open files by double-click**: drop a whole four-ship at once; once installed, double-clicking a track file opens the app in Chrome (Feature Ideas idea 49; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:51`)
- **French**: a language switch with French strings and Canadian French number and date formats (Feature Ideas idea 50; value medium, effort medium; `pf/reset/2-inventory/agents/sources/feature-ideas.md:52`)
- **Keyboard and colour-blind palette**: space to play, arrows to step, number keys to pick a ship, a colour-blind-safe palette; it is partly covered by the keyboard and contrast requirement ALL-R11 already (`pf/reset/1-requirements/requirements.md:31`) (Feature Ideas idea 51; value medium, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:53`)
- **Gamepad and podium clicker**: drive the replay and camera from a game controller or a presentation clicker (Feature Ideas idea 52; value low, effort small; `pf/reset/2-inventory/agents/sources/feature-ideas.md:54`)

**Content rule.** The research page lists, under "not recommended", shipping CT-156 boldface, checklists or performance charts, because they are controlled content. Ship empty engines that instructors load their own content into (`pf/reset/2-inventory/agents/agent-4-outside.md:153`). This line belongs in the rule book next to the manuals rule; the rule book's own draft is the place to check that it is there (`AGENTS.md:46`).

- **A better-looking CT-156 model** (Patrick, 6 Oct, with two photos of the navy CT-156: "can we make the model better? ... more fidelity, better quality, without sacrificing performance"). Options laid out to Patrick: (1) a truer shape in code (T-6 cross-sections instead of a round tube, tapered wings with thickness, a real canopy with frames, nose intake and exhausts), smooth-shaded; (2) better paint and light (a sky reflection made once at start, glossy navy paint and a glass canopy); (3) near and far versions of the model, so the detailed one draws only up close; (4) a bought or commissioned 3D model file (best looking; needs a loader, a licence check and Patrick's yes for a new library). Shared by all modules (`src/ui-kit/ct156-model.js`). The rule book says no 3D polish in a module still being built, Patrick moved options 1-3 up the same day (built: Traffic v2.10.115, Formation V2.144, Turn Fight v2.18); option 4 stays here.

## Possible new modules (not started)

Both need a full spec and a question session with Patrick first, and neither shows on the home screen until built (Patrick, 4 Oct 00:14Z) (`pf/reset/1-requirements/requirements.md:363`).

- **PT-PT Sim** (point-to-point training visualisation), old FF1. Pointer: [`modules/pt-pt-sim/README.md`](modules/pt-pt-sim/README.md) (`archive/docs/records/future-ideas.md:8`). Idea to take to its question session: **Hold, TACAN arc and intercept trainer**: an HSI and moving map with random holds, arcs and radial intercepts, with wind; it could share a solver with this module (Feature Ideas idea 29; value medium, effort medium; flight math, so it needs a check first; `pf/reset/2-inventory/agents/sources/feature-ideas.md:31`)
- **Formation Briefing Board**, old FF2: an electronic board where the lead moves the planes around the screen during the brief. Pointer: [`modules/briefing-board/README.md`](modules/briefing-board/README.md) (`archive/docs/records/future-ideas.md:8`). Ideas to take to its question session: **Lineup card and fuel ladder**: a form that prints a mission card (callsigns, times, frequencies, areas, joker and bingo) and a fuel ladder from burn rates the user enters; official T-6 performance data is not shipped (Feature Ideas idea 33; value medium, effort medium; `pf/reset/2-inventory/agents/sources/feature-ideas.md:35`); and Turn Fight's BFM whiteboard idea (idea 24), which could share code with it (`pf/reset/1-requirements/scope-and-ideas.md:195`).
- The old roadmap queued both as PPQ-16, "Standalone Apps", to resume at the project switchover; that is a pointer here, not a task in the plan (`archive/docs/records/verification/swarm/POST_PROTOTYPE_QUEUE.md:60`, `archive/docs/REMEDIATION_ROADMAP.md:414`).

## What a browser can reach (the page's browser-access notes)

Checked by the research with a request from a GitHub Pages address on 30 Sep. The details below are read from the page itself (version 1790732504-77ff, read on 4 Oct); no repo or project file holds them, which is why they are copied here (`pf/reset/2-inventory/agents/agent-4-outside.md:153`). These notes decide which ideas need a relay (a small server) and which do not. They are the page's own findings, not rules; the relay decision itself is a SOF item (see `modules/sof/future.md`) (`pf/reset/0-lessons/sources/thread-new-feature-ideas-research.md:55`).

- **Works directly from a browser:** MET Norway METAR and TAF (the SOF's source; it also returns the Moose Jaw METAR remarks that carry density altitude), Environment Canada radar and lightning (GeoMet), Environment Canada text bulletins (TAF and SIGMET text), Open-Meteo (winds aloft history, elevation, freezing level, storm energy), NOAA space weather, sunrise-sunset times, free elevation tiles (AWS Terrain Tiles, Mapterhorn, NRCan 30 m elevation), NRCan topographic maps, OurAirports runways and OpenFreeMap (`pf/reset/0-lessons/sources/thread-new-feature-ideas-research.md:54`).
- **Blocked from a browser:** aviationweather.gov, NAV CANADA's flight-planning service, Environment Canada's Datamart, the Copernicus elevation model and every live ADS-B feed.
- **Needs a key (so a static page cannot hold it):** OpenAIP airspace, the NOAA declination service (use an offline World Magnetic Model library instead), Cesium Ion terrain and the FAA NOTAM service.
- **Terms to respect:** Open-Meteo's free tier is for non-commercial use, and OpenStreetMap forbids bulk tile pre-fetching, so pre-cache terrain or a regional PMTiles file instead.
- **NOTAMs, PIREPs and the forecast chart need a relay.** The cheapest ways are a GitHub job that saves the data into the site every 10 minutes (free, up to about 10 minutes old) or a free Cloudflare worker (live, but a second service to own). Several SOF ideas wait on that one decision. A live-traffic relay is already in `relay/traffic.js` (`pf/reset/0-lessons/sources/thread-new-feature-ideas-research.md:55`, `pf/reset/2-inventory/agents/agent-4-outside.md:163`).

**Ideas the research does not recommend, and why** (page text, summarised): an AI debrief summary (needs a key and a server and sends student data off the device); live ADS-B tracks (no browser access; accept an uploaded trace instead); OpenAIP airspace at runtime (key exposed; bundle a snapshot if the licence allows); Cesium Ion terrain (needs a token; free tiles do the job); Teams or Discord alerts (the webhook address is a secret); shipping controlled CT-156 content (see the content rule above); shared leaderboards and cross-device gradebooks (need a server and rank students in public; keep anything like it local and opt-in) (`pf/reset/2-inventory/agents/agent-4-outside.md:153`).

## Whole-tool ideas from the old lists

- The old future list's whole-tool rows are all placed or done: FF1 and FF2 above; FF3 (save a debrief file), FF7 (home airfield setting), FF8 (editable error standards) and FF12 (report-a-problem button) are built; FF9 (share Traffic patterns) is dropped (`archive/docs/records/future-ideas.md:14`, `pf/reset/2-inventory/agents/sources/plan-doc-future-features.md:15`).
- Phones and tablets are a bonus, not a requirement (ALL-R2); a stacked layout below 900 px stays low priority (`pf/reset/1-requirements/requirements.md:18`).

## Ideas from Dad, 8 Oct 2026 (for Patrick)

- **One shared name and shared credit.** Remove the "Dad" and "Pat" tags throughout the tool (for example "Dad's OODA Loop", "Dad's debrief") and credit both as co-founders and co-creators in the About section. The tool needs a name that works for both of them.
- **AFMAN 11-248 (USAF T-6 primary flying manual) as an option throughout.** Alongside the RCAF CT-156 references, so a module can use the USAF numbers and procedures where they differ. Manual pages are cited only; the manual itself goes to the project files first, as the rule book says.
- **A CT-156 cockpit interior for the sims' Cockpit view (Dad, 9 Oct 2026).** In the Formation Sim (and Traffic and Turn Fight) Cockpit camera, draw what the student sees: the instrument panel and glareshield, canopy bows and frame, ejection seat and headrest, and the wings and vertical tail from the eye, using the existing CT-156 model (`src/ui-kit/ct156-model.js`) and tying the bows and wings into the line-of-sight check (`src/core/canopy.js`). The RCAF CT-156 panel, to match the sims. Dad offered a one-off Fable design pass if Patrick wants it. The commercial sim picture Dad showed is a description only, never an asset. Eye position and frame angles need a source.
