# Shared

This folder is the shared parts every module uses: flight core (flight math), app frame, weather, airfields, storage and the ui kit. Start here, then read only the file you need.

## Where it stands

Built and merged on main. The flight-math list is written ([flight-math.md](flight-math.md)); waiting on the one-import-point review and the combined sign-off at the end (`archive/HANDOVER.md:92`, `archive/HANDOVER.md:94`).

## What is next

The plan's steps, in order: Step 1: Refresh spec.md against the new requirements; Step 2: A list of the flight math that exists, then one place to import it from (needs review); Step 3: Smaller items in the shared parts; Step 4: Sign-off, with the combined sign-off of the whole tool. Only what is in `plan.md` gets built.

## The files

| File | What it holds |
|---|---|
| `spec.md` | How the module works: screens, behaviour, data, and what happens when data fails |
| `requirements.md` | What the module must do, in Patrick's words, with how each is checked |
| `decisions.md` | Decisions in force (new IDs), replaced ones and their history, and decisions waiting on a question |
| `testing.md` | This module's testing rules, its sign-off checklist and its list of tests |
| `plan.md` | The ordered steps and checkboxes; the last step is the sign-off |
| `future.md` | Ideas not being built until Patrick moves them up |
| `flight-math.md` | Every shared flight formula, where it lives and its source: read it before writing flight math |

## Open questions

Each has a working answer that the tool uses until it is settled.

### Waiting on Patrick now (also on the list in `../../PLAN.md`)

- **PROTOTYPE flags** come off only at the combined sign-off (`archive/HANDOVER.md:103`).

Dad's flying questions for every module are in `../../questions-for-dad.md`.

Old decisions held until a question is answered are listed in `decisions.md` under "Flight numbers waiting for a source".
