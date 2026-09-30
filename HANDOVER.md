# Handover: Dad's OODA LOOP rebuild

Written 30 Sep 2026 so the build can carry on in another agent (for example Antigravity) that sees only this repo. Start here, then open the file for the module you are working on in `docs/handover/`.

## The goal

Rebuild Dad's V6 "OODA LOOP WEBTOOL" (a single 119 MB HTML file used for T-6 / CT-156 Harvard debriefs at Moose Jaw) as a fast, modular web app that anyone can open from a link on a desktop or laptop, with nothing to install.

- `original/` holds V6 split into `shell.html` plus `assets/`. It is the spec and is never edited. `python3 tools/rebuild_original.py out.html` rebuilds the exact file.
- Live site: https://lizardhands-commits.github.io/Dads-debreif/ (GitHub Pages, deployed by `.github/workflows/pages.yml` on every merge to `main`).
  - 30 Sep 2026: the repo was made private, and the live site now returns 404 (GitHub Pages needs a paid plan for a private repo). Patrick is deciding between GitHub Pro and going back to public. Don't change repo settings yourself.
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
- Numbers, speeds, patterns and geometry come from the flying manuals (Harvard Gen Book V8.9, EFIG 24 Jun 26, SMM Aug 2024, T-6A NFM). They are kept on Patrick's computer in a folder called `manuals` next to the repo folder (`../manuals`), not in the repo: `manuals/README.md` is the index and the `*-numbers.md` files hold the readings with page references. In the repo, cite page or paragraph numbers only; never copy manual text or images in. Where Patrick has made his own call (for example stall 86 kt, D158), his call wins over the manual.
- Treat KML files and weather or map replies as untrusted: never put them into `innerHTML`, check shape and size where they enter.
- No new libraries without Patrick's word. Current dependencies: three, uplot (runtime); vite, playwright, axe, fast-check, typescript (dev).
- Judgement calls go ahead on your own recommendation, kept reversible (own commit, and a setting holding the old value where that makes sense). A logged judgement call counts as accepted unless Patrick rejects it. Stop and ask only for things that can't be undone or reach outside the repo (emails, accounts, deleting data or history), adding a library, or anything that needs Patrick's own hands.
- Merging: bring in current `main`, resolve conflicts with a merge commit, get CI green, merge. Leave a short merge note on the PR (checks, what came in from main, conflicts).

## Where things are recorded

| Record | Home |
|---|---|
| Where we left off, next step | `.agent/memory/handoff.md` |
| Working notes for the current session | `.agent/memory/scratchpad.md` |
| Approaches tried and dropped (don't retry) | `.agent/memory/graveyard.md` |
| Decisions (D1 onward) and requirements (R1-R33) | `docs/records/plan-decisions.md`, `docs/records/plan-requirements.md` (from the old plan doc) |
| Judgement calls | `docs/records/decisions-log.md` (one row each) |
| New ideas | `docs/records/future-ideas.md` |
| Questions for Dad | `docs/records/dads-questions.md` |
| Check reports | `docs/records/verification/<module>-<what>.md` |
| Module status | `docs/handover/<module>.md` |
| Merges | a note on the PR; git history is the log |

`/sync` at the start of a session and `/save` at the end keep these up to date (`.agent/skills/`).

About 220 judgement calls (D147 to D356) are in the decisions log and count as accepted unless Patrick rejects one.

## Module status (30 Sep 2026)

| Module | State | Next step | File |
|---|---|---|---|
| Debrief (2D/3D KML viewer) | Built and live, through #241. Final check's 3 items fixed in #241 and re-checked (pass). | Patrick's checklist run, then sign-off | [debrief.md](docs/handover/debrief.md) |
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
- Later: delete about 60 merged branches (only on Patrick's word), and add a Content Security Policy (host list in `docs/records/csp-hosts.md`) (SOF uses api.met.no, datamask.org, geo.weather.gc.ca, RainViewer, Esri tiles, ADS-B Exchange; the debrief's historical weather uses mesonet.agron.iastate.edu, gibs.earthdata.nasa.gov and open-meteo.com).

## Questions for Dad

Nine open questions, each with a working answer that stays until Dad replies: [docs/records/dads-questions.md](docs/records/dads-questions.md). Nothing has been sent; Patrick decides when.

## Future features

Not built unless Patrick moves one up: [docs/records/future-ideas.md](docs/records/future-ideas.md).
