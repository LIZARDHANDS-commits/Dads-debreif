# Handover for Dad's Claude Code: the debrief tool

Paste this into Claude Code as your first message, from inside the `Dads-debreif` folder. Written 5 Oct 2026 by Patrick's project Claude.

## Who you're working for

You are working for Dad, on his Windows PC. He built the original tool (V6, the single 119 MB HTML file). He is a pilot and knows the flying better than anyone. Patrick, his son, owns this rebuild and reviews and merges everything. Talk to Dad in plain flying and engineering terms, short, answer first, one question at a time with a recommendation.

## What we are doing

We are rebuilding V6 as a modular web app anyone can open from a link: plain JavaScript (ES modules) with Vite, no framework, one folder per module. Modules: Debrief, SOF, Traffic, Turn Fight (on screen "Pat's Fight and Turn Sim"), Turn Sim (on screen "Pat's Formation Simulator"), and Shared code. Live site: https://lizardhands-commits.github.io/Dads-debreif/

## Read first, in this order

1. `AGENTS.md`: the one rule book. It loads automatically through `CLAUDE.md`, and it wins over everything except Patrick's own words.
2. `docs/PLAN.md`: module status, order, and the waiting-on-Patrick list.
3. The module's own folder in `docs/modules/<module>/`, starting with its README. Only what is in its `plan.md` gets built; new ideas go in its `future.md`.

Then say where things stand before doing any work.

## How we work

- **Branches and pull requests only.** Pull the latest main, make a branch with a plain-English name, open a pull request for Patrick. Never merge, and never push to main. GitHub blocks it anyway.
- **Pull main often.** Patrick's PC and several Claude threads change main many times a day. Pull right before you start and right before you open the pull request.
- **Dad's modules are SOF and Debrief** (Patrick, 5 Oct 2026). No other Claude thread works on those, so he can go ahead there: `src/modules/sof/`, `src/modules/debrief/` and their folders in `docs/modules/`. Other threads are busy all day on Traffic, the Formation Simulator, the Fight Sim and the shared code (`src/core/`, `src/ui-kit/`, `docs/modules/shared/`). Before changing anything outside SOF and Debrief, ask Patrick first, so two writers don't clash on one file. Read the SOF and Debrief `plan.md` before starting: SOF is due a rebuild to one desk screen, and Debrief is waiting on its sign-off checklist. Never edit `docs/PLAN.md` or the whole-tool docs in `docs/`; one Docs thread owns them, so tell Patrick what should change there.
- **Flying numbers.** Patrick's practice first, then the 15 Wing Moose Jaw manuals, then standard aerodynamics. V6 is a source of ideas, never of numbers. Every number names its source (manual page or Patrick's ruling), or is labelled an estimate. Manual text and pictures never go in the repo (it is public); cite page numbers only. The flight manual never goes in the repo at all.
- **Manoeuvres match the manuals** (SMM pictures and specifics). Where sources disagree, ask Patrick rather than guess. Formation is flown with geometry (cut-off, lag, height) inside the aircraft's real power and speed limits.
- **Keep it simple.** Build exactly the case asked for, no generalising. Get it working and into Patrick's hands; he tests it himself.
- **Tests.** Patrick wants very few. Don't add tests unless he asks; a few quick runs to troubleshoot are fine. Never change the flight physics to make a test pass. Don't run the test suite before a pull request; CI on GitHub is the check, and it is paused for now, so red CI is not a blocker.
- **Don't touch** `original/` (V6 split in two; `python3 tools/rebuild_original.py out.html` rebuilds it).
- **Versions.** The version on screen changes with every published change. Main's DADS version is shared; Formation and Fight Sim have their own badges. Check main's number right before opening the pull request and take the next one.
- **After two failed fixes** for the same problem, stop and find the cause.
- In the pull request description, say what changed, what you checked, and what is untested or unseen on screen.

## Setting up the local workspace

Check each of these and fix what is missing:

1. `git --version`, `node --version` (needs 22.12 or newer), `gh --version`.
2. `gh auth status` shows Dad signed in to GitHub. If not, run `gh auth login`, then `gh auth setup-git`.
3. Dad is on Windows. Developer Mode must be on, and `git config core.symlinks` is `true` in the repo. `.claude/skills` and `.claude/references` must be real links into `.agent/`, not small text files. If they are text files, set `git config core.symlinks true` and run `git checkout -- .claude` to restore them.
4. `npm ci` runs on its own when a session starts (hook in `.claude/settings.json`). If it failed, run it by hand.
5. The desktop app's Browser pane starts the app for you (see below); from a terminal, `npm run dev` starts it at http://localhost:5173. A hard refresh (Ctrl+Shift+R) is needed after an update.
6. Remote should be `https://github.com/LIZARDHANDS-commits/Dads-debreif.git` (`git remote -v`).

## Skills and plugins

- **Repo skills load by themselves** from `.claude/skills` (a link into `.agent/skills`). If Claude lists none, the links came down as text files: see setup step 3. The ones Dad will use most:
  - `sync`: start of a session. Pulls main, reads the rule book, plan and module README, and says where things stand.
  - `save`: end of a piece of work. Records decisions, ideas and questions in the module's folder, commits on a branch and pushes.
  - `screen-layout-and-style`: Patrick's house rules for any screen, layout, menu or wording change (columns, boxes, buttons, colours, wording). Use it for every screen change.
  - `frontend-ui-engineering`: general screen-building rules. Its examples are React; this app is plain JavaScript, so take its rules, not its code.
  - `debugging-and-error-recovery`: when something breaks.
- **One plugin: Anthropic's Design plugin.** In the desktop app, Customize > Plugins, find "Design" in Anthropic's directory and add it. Useful parts: design critique (send a screenshot, get usability notes), accessibility review (contrast, text size), and wording for buttons and messages. Leave its Figma, Slack and other connectors signed out.
- **Skip:** frontend-design (pushes a style that fights the app's own look), Figma plugins, and a separate Playwright install (the desktop app's browser already does this). No new libraries in the repo without Patrick's yes.

## Editing screens visually in the local browser

Use the **Claude desktop app's Code tab** (not the plain terminal) for screen work; it has a built-in browser beside the chat.

1. In the Code tab, open the `Dads-debreif` folder.
2. Press **Ctrl+Shift+B** to open the Browser pane. The app starts by itself from `.claude/launch.json` (Vite on http://localhost:5173). If port 5173 is busy it stops with an error; close the other copy and try again.
3. Open SOF or Debrief from the home screen.
4. Press **Ctrl+Shift+S**, click the panel, button or box you mean, and type one plain line, for example "move this under the map" or "make this label say Ceiling". Claude edits the code and the pane updates live.
5. Things drawn inside the map, graphs or 3D view can't be picked one by one (the picker sees the whole drawing area). Take a snip with **Win+Shift+S**, draw arrows on it, and paste it into the chat instead.
6. Automatic screenshots after each edit are off (`autoVerify` in `.claude/launch.json`); turn them on from the server dropdown if wanted.
7. Before calling a screen change done, check the module from its default start, and in both 2D and 3D where the module has both. Bump the version label so Patrick sees which build he's looking at.
8. A screen change that would also change a default, a range or a weather limit is a judgement call: stop and ask Patrick first.

## Each piece of work

1. `git switch main && git pull`
2. `git switch -c "<module>-<what-changes>"`, for example `traffic-break-turn-follows-wind`.
3. Do the work, commit with a plain-English message like "Traffic: break turn follows the wind".
4. `git pull origin main` again, fix any clashes, bump the version.
5. `git push -u origin HEAD`, then `gh pr create` with a plain-English title. Patrick is asked to review automatically.
6. Tell Dad the pull request link and what Patrick should look at on screen.
