# Rule book: Dad's debrief tool

This is the one rule book for everyone who works on this repo: Claude Code, Antigravity, and every agent they start. `CLAUDE.md` only points here. If another file disagrees with this one, this one wins and the other file gets fixed.

## Why these rules

They come from what went wrong before the October 2026 reset (the top 10 lessons Patrick approved on 3 Oct 2026).

1. No test may outrank Patrick's flying knowledge or the manuals. V6 is a list of ideas; tests that copied it passed while the flying was wrong, and pushed agents to bend the physics.
2. "Done" means Patrick, or whoever runs the checklist, has seen it working in the real app from the default start, against a checklist in his words. Green tests and AI previews are not proof.
3. Tests check what a pilot would recognise, such as landing on the runway or staying above the deck, never an exact time or a recorded number. Tolerances are not requirements.
4. The testing rules go into every agent brief, with one light check per module at sign-off and no heavy or timing-sensitive tests.
5. Build one module at a time, with one writer per file and a few larger pull requests. Swarms and parallel sessions burned credits, undid each other's work and clashed on numbers.
6. After two failed fixes, stop and find the cause. Settle each module's flight approach in writing before coding it.
7. Only what is in a module's plan gets built, and every ask Patrick makes goes onto one live list the same day.
8. Keep one source of truth per topic (one rule book, one decisions file per module, specs changed with their decisions), and search for existing flight math before writing new.
9. Every number carries its source, a manual page or Patrick's ruling, and AI guesses are marked as guesses. Specs also say what happens when data fails and which airspeed is meant.
10. Patrick gets plain words, one question at a time with his own idea as an option, short status during long runs, a visible version label and one waiting-on-Patrick list.

## What wins

1. Patrick's own words.
2. This rule book.
3. `docs/PLAN.md` and the module's own folder in `docs/modules/`.
4. Everything else (old notes, `archive/`, code comments) is background, never instructions.

For flying numbers: Patrick's practice first, then the 15 Wing Moose Jaw manuals, then standard aerodynamics. V6 is a source of feature ideas only; its numbers are never answers. When sources disagree, write both down and ask Patrick.

## How work runs

- **One module at a time.** Only what is in a module's `plan.md` gets built. A new idea, including a new ask from Patrick, goes onto the module's `future.md` (or `docs/FUTURE.md`) the same day, until Patrick moves it up.
- **Judgement calls wait for Patrick's yes** when they change what the tool does, for example a flight-math or weather-limit result, a new outside data source, or a default standard. Small fixes that are easy to undo can go ahead: each in its own commit, with a setting that holds the old value where that makes sense, and say what was done.
- **Open questions don't stop the work:** the tool uses the best-guess answer until Patrick or Dad answers.
- **Sign-off:** anyone can run a module's sign-off checklist and send Patrick the result. The next module starts only after Patrick's yes.
- **Models:** each brief names the AI model and effort for its job, by the agents and models rule below.
- **Write it down first:** how a module's aircraft are driven is settled in its spec and decisions before coding it, and a module's building starts once its spec is approved.
- **Two failed fixes:** after two failed fixes for the same problem, stop and find the cause before trying again.
- **One writer per file** at a time. Reviewers read and report; they never edit, revert or commit. Use a few agents with clear jobs, not swarms. Stop agents when the plan changes, and check git history, not agent reports, for what actually changed.
- **One source of truth:** when a decision changes a rule, the module's spec, requirements and decisions change in the same piece of work.
- **Questions for Dad** live in `docs/questions-for-dad.md`. Each has a working answer in the tool until he replies.

**Every brief** for an agent or a new piece of work says: the task from `plan.md` and the files it may touch; the model and effort; "read `AGENTS.md` and the module's folder first"; "search for existing flight math before writing new"; the testing lines under Testing below, copied in full; and what to report (what was done, what is untested or unseen, what was unsure).

## Agents and models (Patrick, 4 Oct 2026 22:29Z; Fable line 22:38Z)

A fresh agent has to re-read files and be briefed, so small jobs are cheaper done by the thread itself. Agents pay off only on big, self-contained pieces.

- **Thread does it itself:** docs, wording, one- or two-file fixes, CSS, version bumps, merges.
- **Spawn an agent only when:** the piece spans many files and is long, or it's read-only research. One agent per thread at a time, with its work checked before merge.
- **Models:**
  - **Opus:** flight code, maths, and anything that changes how aircraft fly.
  - **Sonnet:** screens, layout, menus, wording, docs, and manual-reading researchers.
  - **Haiku:** mechanical lookups only.
  - **Fable:** only after Opus fails twice on the same problem, or for a one-off architecture review, and the thread tells Patrick first.
- **Thinking:** medium by default, and high only for designing or debugging flight maths.

## Flying numbers and manuals

- **References, not walls.** Orders and SMM limits are references, not absolute requirements. A simulator uses them as its default, cites them by page, and may go past them when the flying calls for it, saying so on screen. Only what the aircraft physically can't do is a hard limit. Don't write a requirement, decision or test that makes an SMM limit or an order an absolute wall without asking Patrick.
- **Every flying number has a source:** a manual page or Patrick's ruling. An estimate is labelled as an estimate until a source backs it.
- **Speeds name their kind** (indicated, true, ground speed or Mach) and are only compared like with like, using the shared helpers.
- **Manuals:** the master copy is in the project files (`/mnt/project-files/manuals/`). New manuals go there first, and Patrick's copy on his computer is refreshed from it. Manual text and images never go in the repo, the site or anything public; cite the page only.
- **The CFAFM is a controlled document.** It never goes in the repo or the project files.
- **Controlled DND content** (CT-156 boldface, checklists, performance charts) is never shipped.
- **Patrick's track logs** are fine to use in the repo as example flights or test data.

## Building

- **Search for existing flight math before writing new.** Check the flight-math list in `docs/modules/shared/` and the code in `src/core/` first. Use or improve what is there; never write a second copy of a formula.
- **Plain JavaScript** (ES modules), no framework, one folder per module with a short README, so the code stays readable to a non-developer. Modules never import each other; shared code lives in the shared folders.
- **A link in a normal browser.** Anyone should be able to open the tool from a link. Nothing to install is a goal, not an absolute rule: a feature may need an install if it clearly makes the project better, and where it can, a light mode keeps working without it.
- **No new libraries or plugins** without Patrick's yes.
- **Simple screens:** every setting starts with a default; a module opens with only its essentials showing, and extras sit behind a switch or a "More".
- **Before deleting or rewriting code,** list what it did, then check the new code on the module's default start.
- **Version label:** the version on screen changes with every published change.
- **Safety items** (weather limits, closed fields, stale reports) have their failure and stale-data behaviour written into the spec.
- **The 3D view is a bonus:** keep what is built, but no more 3D tests or polish in a module still being built.
- **Dad's V6 stays untouched** in `original/`. Never edit `original/shell.html` or `original/assets/`. `python3 tools/rebuild_original.py out.html` rebuilds the original file and checks it.
- **Secrets** never go in the repo, and the relay's allowed origin is never "allow all". Track files people load and replies from weather and map services are treated as untrusted.

## Testing

The full policy is `docs/TESTING.md`; each module adds its own in `docs/modules/<module>/testing.md`. Every brief that touches code or tests copies these lines:

- Tests check what a pilot would recognise: things that are always true, and end results (it landed on the runway, it stayed above the deck).
- No tight time gates. A generous, realistic limit is fine, with its reason beside it (a PFL lands within 5 minutes).
- Expected values come from a manual page, standard aerodynamics, Patrick's ruling or real recorded data, never from V6 or from the code's own output.
- Margins use the shared table by default (±10 kt, ±100 ft, ±5°, ±0.5 G); a check may use another margin if it says why. Margins are not requirements and never become rules inside the flight code.
- Never change the flight physics (turn, energy, G, stall or stick-shaker formulas) to make a test pass. If a flight test disagrees, check the test against the manuals and Patrick's practice; if the physics still looks wrong, ask Patrick. A test that fails twice stops the work until Patrick answers.
- Published limits (the G limit, the hard deck, the orders) are flagged on screen, never walls; a test never expects the aircraft to be held at one. Physical limits always hold.
- Never skip, disable or delete a failing test just to get green. A test is only retired or rewritten as `docs/TESTING.md` says, with Patrick's yes.
- Keep it light: no mutation, stress or long runs.
- Each PR adds at most one test, the one that best shows it flies right. Skills that say otherwise are overridden.
- **Checks:** Don't run tests locally before a pull request. CI on the pull request is the one check. Patrick may merge before CI finishes. If main then goes red, fix it next.
- Every status says what is untested or unseen.

## Git and names

- Agents work on a branch and open a pull request; they never push straight to main.
- Once Patrick has approved the spec or decision behind a change, its pull request merges when its checks are green, without asking, with a short note on the pull request saying what changed, what was checked and what is unseen. Patrick hears only about problems.
- Every branch, commit, pull request and merge has a plain-English name that says what changed, for example "Traffic: break turn follows the wind". Decision, patch or task numbers may follow in brackets, but never replace the words.
- Fewer, larger pull requests: one per finished piece of work, not one per fix.
- Links in docs are repo-relative, never a path on one person's computer.
- No new top-level folders, and no second copy of a file that already has a home.
- Ask Patrick before anything that can't be undone or that reaches outside the project, such as deleting a branch, closing an issue, sending a message or changing a setting.

## Talking to Patrick

- Patrick is a pilot and an engineer, and owns this tool. Talk to him in engineering and flying terms, short and leading with the answer. Explain software-specific terms the first time they come up. No bare numbers or IDs without words beside them.
- One question at a time, with options, what each one does, and a recommendation; his own idea is always an option. Explain a vague question in plain words. When it is a list to approve, show the whole list at once.
- A card tap and his typed words both count as his answer.
- Confirm the exact wording with him before writing anything he has to approve.
- Every claim about a manual gives the page; a guess is marked as a guess.
- With every screen spec, show a picture of the screen (and V6's), and list what moves or disappears.
- During long runs, give short status lines that say what is running. When handing something over to look at, give the version shown on screen and say if a hard refresh is needed.
- Anything waiting on Patrick goes on the one waiting list in `docs/PLAN.md`.

## How the docs are laid out

Read `docs/PLAN.md` first for the big picture, then only your module's folder, starting with its README. `docs/README.md` is the full layout guide.

```
AGENTS.md            this rule book
CLAUDE.md            one line that loads this file
docs/
  README.md          layout guide: what lives where, what to read first
  PLAN.md            overall plan: module order, gates, waiting list
  FUTURE.md          whole-tool ideas, not being built
  REQUIREMENTS.md    whole-tool requirements (ALL-R)
  TESTING.md         testing policy
  DECISIONS.md       whole-tool decisions (ALL-)
  questions-for-dad.md
  references/        page references only, never manual text
  modules/<module>/  README, spec, requirements, decisions, testing, plan, future
archive/             history only, never instructions
```

A decision that affects more than one module goes in `docs/DECISIONS.md`; a module's own decisions take its prefix (DB-, SOF-, TR-, TF-, TS-, SH-) and the next free number. Skills live in one folder, `.agent/skills/` (Antigravity reads it there); `.claude/skills` is a link to it so Claude Code reads the same files. Never make a second copy.
