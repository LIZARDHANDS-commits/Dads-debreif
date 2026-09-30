# Handover: Dad's OODA LOOP rebuild

Written 30 Sep 2026 so the build can carry on in another agent (for example Antigravity) that sees only this repo. Start here, then open the file for the module you are working on in `docs/handover/`.

## The goal

Rebuild Dad's V6 "OODA LOOP WEBTOOL" (a single 119 MB HTML file used for T-6 / CT-156 Harvard debriefs at Moose Jaw) as a fast, modular web app that anyone can open from a link on a desktop or laptop, with nothing to install.

- `original/` holds V6 split into `shell.html` plus `assets/`. It is the spec and is never edited. `python3 tools/rebuild_original.py out.html` rebuilds the exact file.
- Live site: https://lizardhands-commits.github.io/Dads-debreif/ (GitHub Pages, deployed by `.github/workflows/pages.yml` on every merge to `main`).
- Owner: Patrick (GitHub `LIZARDHANDS-commits`). He is a pilot, not a developer: explain things plainly, lead with what you need from him, and ask one question at a time with a recommendation. Dad (who built V6) is also a Moose Jaw pilot; ask Patrick flying questions before parking them for Dad.

## Run, build and test

Node 22.12 or newer.

```
npm ci               # once
npm run dev          # local site with live reload
npm test             # unit and golden tests (node --test)
npm run typecheck    # tsc over the JSDoc types
npm run build        # dist/ plus the size budget check
npm run preview      # serve dist/ on port 4173
npm run test:e2e     # Playwright against the build (run npm run build first)
```

- CI (`.github/workflows/ci.yml`) runs unit, typecheck, build and Chromium e2e on every PR. Firefox and WebKit run only on a manual run (#239).
- Screenshot tests live in `tests/e2e/visual.spec.js` (1 % tolerance). When a screen changes on purpose, remake them with `npx playwright test --update-snapshots=all` and look at the new pictures before committing.
- Golden tests in `tests/golden/` run V6's own functions and pin its numbers. Change one only on purpose, and log why.

## How the code is laid out

- `SPEC.md` is the module map. `specs/SPEC-<module>.md` is each module's spec. `tasks/<module>/plan.md` and `todo.md` are each module's task list: `todo.md` is the best place to see what is done and what is left.
- `src/shell/` app frame and routes; `src/ui-kit/` shared controls (settings menu, 2D/3D switch, maps, three.js helpers); `src/core/` flight math and the T-6A performance model; `src/wx/` METAR/TAF parser and limits; `src/airfields/` home field and alternates; `src/flight-data/` KML loading and cleaning; `src/storage/` saving; `src/modules/<module>/` each screen.
- Tests: `tests/unit/<area>/`, `tests/golden/`, `tests/e2e/`.
- `docs/checklists/<module>.md` is the hands-on sign-off checklist Patrick runs on the live site.
- `.claude/skills/` holds vetted workflow skills (spec-driven-development, test-driven-development, code-review-and-quality and others). `.claude/skills/README.md` says which to use when. They are plain Markdown and worth reading even if your agent does not load them.

## Rules to keep (Patrick's, adapted for one agent)

Build rules ("Streamlined build", Patrick, 30 Sep):
- Build one module at a time. Put each round's fixes in one PR. Patrick signs off a module before the next one starts.
- Test once, at the end of each module: the full local run, screenshots, accessibility checks (axe runs inside the e2e tests) and a short check of safety items and flight numbers against the manuals. Until then a PR only needs CI green before it merges, so the live site never breaks.
- Numbers may sit within a tolerance (about ±1 kt, ±50 ft, ±1° or ±1 %) instead of matching exactly.
- Dad's already-ported math can be changed when needed. Never change flight math (geometry, energy, turn rate and radius, spacing, time conversions) without first adding a test that pins the old behaviour, and log each change as a judgement call.
- Anything new goes on the future features list (below), not into the build.
- No heavy stress runs (mutation testing, fuzzing, exact memory counts). Normal tests only.
- Browser tests: Chrome only on each PR; Chrome, Firefox and Safari once at each module's sign-off.
- The 3D view is a bonus. Keep what is built, but add no more 3D tests or polish while a module is still being built.
- Traffic builds its core only: wind, aircraft types, the break and traffic on final.

Ground rules:
- Plain JavaScript ES modules, no UI framework, built with Vite. Keep it readable to a non-developer.
- Every screen is simple and not overwhelming. Every parameter has a default. Only the essentials show by default; extras sit behind toggles or "More" panels, and each screen has one closed "<Module> settings" menu (requirement R22).
- Numbers, speeds, patterns and geometry come from the flying manuals (Harvard Gen Book V8.9, EFIG 24 Jun 26, SMM Aug 2024, T-6A NFM). This repo is public: cite manual page or paragraph numbers only. Never paste manual text or images into the repo. Where Patrick has made his own call (for example stall 86 kt, D158), his call wins over the manual.
- Treat KML files and weather or map replies as untrusted: never put them into `innerHTML`, check shape and size where they enter.
- No new libraries without Patrick's word. Current dependencies: three, uplot (runtime); vite, playwright, axe, fast-check, typescript (dev).
- Judgement calls go ahead on your own recommendation, kept reversible (own commit, and a setting holding the old value where that makes sense). A logged judgement call counts as accepted unless Patrick rejects it. Stop and ask only for things that can't be undone or reach outside the repo (emails, accounts, deleting data or history), adding a library, or anything that needs Patrick's own hands.
- Merging: bring in current `main`, resolve conflicts with a merge commit, get CI green, merge. Leave a short merge note on the PR (checks, what came in from main, conflicts).

## Where to record things (in the repo now)

The project's working notes lived in a shared folder this repo can't see. From here on, keep records in the repo:
- Judgement calls: a row in `docs/handover/decisions-log.md` (create it; columns: date | module | decision | why | other options | PR | how to undo).
- New ideas: a row in the future features list in this file (or a `docs/future-ideas.md` if you prefer).
- Questions for Dad: `docs/handover/questions.md`.
- Merges: the PR note is enough; git history is the log.

About 220 judgement calls (plan doc D147 to D356) were logged in the project's shared folder and count as accepted. The ones that shape code are already described in the specs and commit messages. Patrick has the full log if one needs checking.

## Module status (30 Sep 2026)

| Module | State | Next step | File |
|---|---|---|---|
| Debrief (2D/3D KML viewer) | Built and live, through #237. Final check passed with 3 items (F1-F3) being fixed now. | Patrick's checklist run, then sign-off | [debrief.md](docs/handover/debrief.md) |
| SOF dashboard | Built and live, through #238. Final check passed with no findings. | Patrick's checklist run, then sign-off | [sof.md](docs/handover/sof.md) |
| Traffic Pattern Sim | Part-built, through #220. #229 (photo + 3D) open and green; two paused branches. | Merge #229, then the core four | [traffic.md](docs/handover/traffic.md) |
| Turn Fight | Built, through #235, except the Energy screen. | Finish the Energy screen branch, then checklist | [turn-fight.md](docs/handover/turn-fight.md) |
| Turn Sim (formation) | Built, through #234; four paused branches. | Land the branches, then spacing graph, profiles, sequences, G-warm | [turn-sim.md](docs/handover/turn-sim.md) |
| Flight math core | Done, through #232. | None | [core.md](docs/handover/core.md) |
| Weather parser, airfields, flight data | Done. | None | [weather.md](docs/handover/weather.md) |
| App frame (shell, ui-kit, CI) | Done through #239. | Combined sign-off at the end | [app-frame.md](docs/handover/app-frame.md) |

Every paused branch is pushed as `handover/<module>-<what>`; each module file lists its own. They are behind `main`, so merge `main` in before opening a PR.

## Suggested order

1. Debrief and SOF: Patrick runs `docs/checklists/debrief.md` and `docs/checklists/sof.md` on the live site and signs off. Nothing to build unless he finds something.
2. Traffic core and Turn Fight (round 2): Traffic's #229, polish, rewind fix, then wind, aircraft types, the break and final turn, traffic on final. Turn Fight's Energy screen and its checklist.
3. Turn Sim (round 3): the paused branches, then the spacing graph, profiles, sequences and G-warm.
4. Combined sign-off: the full test run in Chrome, Firefox and Safari, remove the PROTOTYPE card flags (`prototype: true` in the module registry), and Patrick signs off the whole app.

Also open: Dependabot PR #162 (Playwright 1.56 to 1.63), left alone on purpose; merge it only with a green run.

## Open items for Patrick

- Sign-off checklist runs: Debrief, SOF, then Turn Fight when its Energy screen lands.
- Which module next, and the go to start it.
- Traffic: redraw the Moose Jaw routes with Dad (Q59, task 14). Until then the V6 routes stay.
- SOF live traffic layer needs a small relay (a Cloudflare Worker, code in `relay/`) on an account Patrick owns. The layer stays off until then. Optional.
- Later: delete about 60 merged branches (ask first), and add a Content Security Policy once every outside host is known (SOF uses api.met.no, datamask.org, geo.weather.gc.ca, RainViewer, Esri tiles, ADS-B Exchange; the debrief's historical weather uses mesonet.agron.iastate.edu, gibs.earthdata.nasa.gov and open-meteo.com).

## Questions for Dad (not sent; Patrick decides when)

Each already has a working answer in the tool, which stays until Dad replies.
1. Turn Fight: from 100 to 119 KIAS, is a slice right (about 160 KIAS in 7 s, 60° of turn, 600 to 700 ft lost), instead of Auto's split S? Now: split S below 120 (SMM Table 14.1, D144).
2. Turn Fight: should Auto's lowest Immelmann top speed go from 120 to about 140 KIAS? Now 120 (SMM 14.15, D351).
3. Turn Sim: on a Delayed 45, do wingmen roll in later than the 5 or 7 o'clock cue, or roll on the cue and fix spacing on the roll-out? Now: SMM cue plus a "fix spacing and sweep on the roll-out" note.
4. Turn Sim: box Delayed 45 with a check turn, is the rear element's 10 to 15 s delay what you fly? Now the delay is solved to keep the box's shape (D281).
5. SOF: keep a lightning caution through a feed outage until a good picture says clear? Now yes (D352, D353).
6. SOF: is a cloud picture up to 60 min old still useful? Now cloud 60, lightning 40, radar 20 min (D354).
7. SOF: is 20 NM right for the lightning caution? Now 20 NM, settable 5 to 50 (V6's number).
8. Traffic: what counts as a conflict? V6's built-in setup uses 200/200 ft (conflict) and 500/500 ft (caution); its defaults elsewhere are 1,500/500 and 2,500/1,000. Now the built-in V6 numbers.
9. Turn Sim: the "4312" picture (plan doc Q31) is still open.

## Future features (not built; from the plan doc)

Numbers are the plan doc's FF numbers.
- FF1 PT-PT (point-to-point) Simulator, FF2 Formation Briefing Board: future, stay hidden.
- FF4 one-page printable debrief sheet; FF5 debrief library of past sorties; FF6 GPX import; FF10 drawing over the replay; FF11 cockpit video sync; FF12 report-a-problem button; FF13 touch pan and zoom; FF14 "follow ship N" 3D camera; FF15 iPad attitude calibration (tried; didn't work on the examples); FF16 graphs synced to the replay; FF17 bookmarks and an automatic event scan; FF18 two-ship geometry readouts and a measuring tool; FF19 terrain height and height above ground; FF20 real runway data (OurAirports); FF21 SOF crosswind per runway; FF22 projector view.
- FF24 METAR wind into the Traffic Sim; FF25 automatic sequencing; FF26 SIGMETs, PIREPs and GFA on the SOF (needs the relay); FF27 option at the threshold (full stop, touch-and-go, low approach, go-around); FF29 runway landing-spacing check; FF30 separate wind at pattern height; FF31 slide or break to the inner runway (SMM 4.28); FF32 early turn (SMM 4.28); FF33 uncontrolled square circuit (SMM 4.29) for other home fields; FF34 runway occupied, continue and go low approach; FF35 break-outs (SMM 4.15, 4.23); FF36 flapless aircraft (SMM 4.25, 4.26).
- FF37 SOF keeps radar and lightning all day for later debriefs; FF38 Turn Sim vertical fluid manoeuvres; FF39 rejoins; FF40 fighting wing; FF41 fluid manoeuvring (level); FF42 Turn Fight chaser picks its own pursuit; FF43 real terrain in 3D (key-free AWS tiles first).
- Traffic tasks moved here by the Streamlined build: PFLs (task 16), engine-outs (17), the prediction engine (19), live rules and commands (20), fly-through, departure-end break and closed pattern (21), set up a conflict (22), engine-out check and reach (23).
- SOF: a 12-hour all-day soak run; map extras; move the VNC chart layer into ui-kit; an information-only lightning line at 50 NM (NFM Sec VII p. 7-4).
- Done or dropped already: FF3 save a debrief file, FF7 home airfield setting, FF8 editable error standards, FF23 climbing turns (became Turn Fight's Energy mode); FF9 and FF28 dropped.
