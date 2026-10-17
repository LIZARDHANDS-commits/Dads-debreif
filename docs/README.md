# How the docs are laid out

The repo is the single source of truth for everything about the tool: rules, plans, requirements, decisions, testing, specs and code. Claude and Antigravity both read it. The rule book is `../AGENTS.md`.

## Single-Writer Tracking Split (`docs/dad/` and `docs/pat/`)

To prevent merge conflicts between Dad's sessions and Patrick's sessions, tracking, status logs, waiting lists, and handovers are split into two single-writer folders (**Read-Both, Write-Own**):

| Folder | Who Writes It | What It Holds |
|---|---|---|
| **`dad/`** (`dad/status-and-plan.md`, `dad/waiting-on-patrick.md`) | **Only Dad's Claude** | Dad's active status, completed PR log, next steps, and questions/items waiting on Patrick |
| **`pat/`** (`pat/bulletin-for-dad.md`, `pat/status-and-plan.md`) | **Only Patrick's Claude / Antigravity** | Patrick's live messages/approvals for Dad, Patrick's active work, and ramp/flight measurement queues |
| **`modules/<module>/`** | **The module's writer** | Single source of truth for each simulator (`README.md`, `spec.md`, `requirements.md`, `decisions.md`, `testing.md`, `plan.md`, `future.md`) |

- **On `/sync`:** Dad's Claude reads `pat/bulletin-for-dad.md` (and shows Patrick's message to Dad first); Patrick's sessions read `dad/waiting-on-patrick.md`.
- **On `/save`:** Dad's Claude writes only to `dad/*` and `modules/<module>/*`; Patrick's sessions write only to `pat/*` and `modules/<module>/*`. Neither side edits `PLAN.md` on feature branches.

## What to read first

1. `../AGENTS.md`, the rule book.
2. `pat/bulletin-for-dad.md` (for Dad's sessions) or `dad/waiting-on-patrick.md` (for Patrick's sessions).
3. Only your module's folder in `modules/`, starting with its `README.md`.

You don't need to read other modules' folders or `archive/` to do your work.

## What lives where

| File / Folder | What it holds | Who changes it |
|---|---|---|
| `dad/` | Dad's status, plan, and waiting-on-Patrick list (`status-and-plan.md`, `waiting-on-patrick.md`) | Only Dad's Claude |
| `pat/` | Patrick's bulletin for Dad and Patrick's status/measurement queue (`bulletin-for-dad.md`, `status-and-plan.md`) | Only Patrick's sessions |
| `PLAN.md` | Whole-tool overview and history from the October 2026 reset (points to `dad/` and `pat/` for live waiting lists) | Read-only on feature branches (never edited by routine PRs) |
| `FUTURE.md` | Whole-tool ideas and possible new modules, not being built | Anyone adds; Patrick moves an idea up into a plan |
| `REQUIREMENTS.md` | What the whole tool must do (ALL-R1 to ALL-R28) | Only with Patrick's yes |
| `TESTING.md` | The testing policy: what tests check, when they run, the sign-off checklist | Only with Patrick's yes |
| `DECISIONS.md` | Decisions that affect more than one module (ALL-) | A new decision gets the next number and updates what it changes in the same piece of work |
| `questions-for-dad.md` | Flying calls only Dad can settle, each with its working answer | Patrick decides when to send them |
| `references/` | Notes that point to manual pages (the SMM aerobatics catalogue, the traffic pattern matrix). Page references and manual extracts, each with its page; never the CFAFM (ALL-41) | Anyone, with a page for every number |
| `modules/<module>/` | One folder per module, the same seven files in each (below) | The module's work |

## Inside each module folder

| File | What it holds |
|---|---|
| `README.md` | Where the module stands, what's next, and its open questions |
| `spec.md` | How the module works. Refreshed against the requirements when the module's work resumes |
| `requirements.md` | What the module must do, plus the V6 feature ideas (ideas, not requirements) |
| `decisions.md` | The module's own decisions, with its prefix: DB- (Debrief), SOF- (SOF), EP- (EP Tabletop), RS- (Run-In Sim), TR- (Traffic), TF- (Turn Fight), TS- (Turn Sim), SH- (shared parts) |
| `testing.md` | What the module's tests check, its sign-off checklist, and what happens to each test file |
| `plan.md` | Ordered steps to the module's next sign-off, each with its task list |
| `future.md` | Ideas for this module that are not being built |

The modules are `debrief`, `ep-tabletop`, `model-showcase`, `run-in-sim`, `sof`, `traffic`, `turn-fight`, `turn-sim` and `shared` (the flight core, app frame and home screen, weather, airfields, storage and the screen kit). `pt-pt-sim` and `briefing-board` are future modules with a README only: they need a full spec and a question session with Patrick first.

## How a change keeps the docs true

- Only what is in a module's `plan.md` gets built. A new idea goes to `future.md` the same day.
- A decision that changes a rule updates the module's spec, requirements or testing file in the same piece of work.
- Ticked tasks stay in `plan.md` until the module is signed off, then the step is marked done.
- Anything retired moves to `archive/` with a line in `archive/README.md` saying where its content lives now. Nothing in `archive/` is an instruction.

## Where the rest is

- **Code:** `src/` (one folder per module under `src/modules/`, shared code in `src/core/`, `src/shell/`, `src/wx/` and the other shared folders). **Tests:** `tests/`.
- **Dad's V6:** `original/`, never edited.
- **Skills:** one folder, `.agent/skills/`, with `.claude/skills` as a link to it (Patrick, 4 Oct 2026). On Windows, the link needs Developer Mode on and `git config core.symlinks true` before checkout; otherwise Claude Code sees no skills.
- **Outside the repo (private, project files):** the flying manuals, Patrick's session logs and a copy of Dad's V6 file. Never copied into the repo.

## Citations

The docs written in the October 2026 reset cite their sources as `path:line`:

- A plain path is a repo file as it stood at the reset (commit `fd0212c`). Paths to files that later moved (most to `archive/`) were updated to the new place in the links clean-up; line numbers are as the file stood at the reset. The map in `archive/README.md` gives each moved file's new place.
- A path starting `pf/` is in the project's shared files (the reset's records, which move to `pf/archive/2026-10-reset/` when the reset ends, so `pf/reset/X` then reads `pf/archive/2026-10-reset/X`). Not in the repo.
- `v6/sof.html` and `v6/traffic.html` are the SOF and Traffic pages inside Dad's V6 file, as `tools/extract_subapps.py` decodes them.
