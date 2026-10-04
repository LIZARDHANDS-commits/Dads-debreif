# How the docs are laid out

The repo is the single source of truth for everything about the tool: rules, plans, requirements, decisions, testing, specs and code. Claude and Antigravity both read it. The rule book is `../AGENTS.md`.

## What to read first

1. `../AGENTS.md`, the rule book.
2. `PLAN.md`, for the big picture: which module is being worked on, the order, and what is waiting on Patrick.
3. Only your module's folder in `modules/`, starting with its `README.md`.

You don't need to read other modules' folders or `archive/` to do your work.

## What lives where

| File | What it holds | Who changes it |
|---|---|---|
| `PLAN.md` | The overall plan: every module's status, the order, the gates, the waiting-on-Patrick list | Updated as work finishes; the order changes only with Patrick's yes |
| `FUTURE.md` | Whole-tool ideas and possible new modules, not being built | Anyone adds; Patrick moves an idea up into a plan |
| `REQUIREMENTS.md` | What the whole tool must do (ALL-R1 to ALL-R28) | Only with Patrick's yes |
| `TESTING.md` | The testing policy: what tests check, when they run, the sign-off checklist | Only with Patrick's yes |
| `DECISIONS.md` | Decisions that affect more than one module (ALL-) | A new decision gets the next number and updates what it changes in the same piece of work |
| `questions-for-dad.md` | Flying calls only Dad can settle, each with its working answer | Patrick decides when to send them |
| `references/` | Notes that point to manual pages (the SMM aerobatics catalogue, the traffic pattern matrix). Page references only, never manual text | Anyone, with a page for every number |
| `modules/<module>/` | One folder per module, the same seven files in each (below) | The module's work |

## Inside each module folder

| File | What it holds |
|---|---|
| `README.md` | Where the module stands, what's next, and its open questions |
| `spec.md` | How the module works. Refreshed against the requirements when the module's work resumes |
| `requirements.md` | What the module must do, plus the V6 feature ideas (ideas, not requirements) |
| `decisions.md` | The module's own decisions, with its prefix: DB- (Debrief), SOF- (SOF), TR- (Traffic), TF- (Turn Fight), TS- (Turn Sim), SH- (shared parts) |
| `testing.md` | What the module's tests check, its sign-off checklist, and what happens to each test file |
| `plan.md` | Ordered steps to the module's next sign-off, each with its task list |
| `future.md` | Ideas for this module that are not being built |

The modules are `debrief`, `sof`, `traffic`, `turn-fight`, `turn-sim` and `shared` (the flight core, app frame and home screen, weather, airfields, storage and the screen kit). `pt-pt-sim` and `briefing-board` are future modules with a README only: they need a full spec and a question session with Patrick first.

## How a change keeps the docs true

- Only what is in a module's `plan.md` gets built. A new idea goes to `future.md` the same day.
- A decision that changes a rule updates the module's spec, requirements or testing file in the same piece of work.
- Ticked tasks stay in `plan.md` until the module is signed off, then the step is marked done.
- Anything retired moves to `archive/` with a line in `archive/README.md` saying where its content lives now. Nothing in `archive/` is an instruction.

## Where the rest is

- **Code:** `src/` (one folder per module under `src/modules/`, shared code in `src/core/`, `src/shell/`, `src/wx/` and the other shared folders). **Tests:** `tests/`.
- **Dad's V6:** `original/`, never edited.
- **Skills:** one folder, `.agent/skills/`, with `.claude/skills` as a link to it (Patrick, 4 Oct 2026).
- **Outside the repo (private, project files):** the flying manuals, Patrick's session logs and a copy of Dad's V6 file. Never copied into the repo.

## Citations

The docs written in the October 2026 reset cite their sources as `path:line`:

- A plain path is a repo file as it stood at the reset (commit `fd0212c`). Many of those old files are now in `archive/`; the map in `archive/README.md` gives each one's new place.
- A path starting `pf/` is in the project's shared files (the reset's records, which move to `pf/archive/2026-10-reset/` when the reset ends). Not in the repo.
- `v6/sof.html` and `v6/traffic.html` are the SOF and Traffic pages inside Dad's V6 file, as `tools/extract_subapps.py` decodes them.
