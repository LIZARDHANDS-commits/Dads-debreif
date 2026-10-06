# Fight Sim (Turn Fight) architecture review, 4 Oct 2026

Read-only review of `src/modules/turn-fight/` on main `1020583`, asked by Patrick 10:20Z ("the same architecture review and refactoring analysis on Fight Sim") and 10:21Z (a full system flow chart of inputs and outputs, as Turn Sim got). No repo changes.

Read in this order:
1. `review.md`: the answer, faults, reuse of Traffic's pieces, Turn Sim overlap, options, recommendation, questions.
2. `architecture.md` with `architecture.png` and `step-today-vs-proposed.png`: the flow chart, every file, every control, the clean-up list.
3. Appendices: `traces.md` (19 fights flown in Node), `inventory.md`, `flight-math-duplicates.md`.

Settings catalogue (Patrick 10:27Z): `settings-catalogue.md`.

Scripts: `trace.mjs` (run from the repo root: `node /mnt/project-files/turn-fight-review/trace.mjs [case]`). Raw output: `trace-out-1.json`, `trace-out-2.json`. Diagram sources: `*.svg`.

Decision log: 10:36Z Refactor pilot layer; 10:38Z Brisk inputs and an "Advanced setup" menu with a why-line per number; 10:41Z controls cut list approved. Wording draft for the repo: `refactor-wording.md` (approved 10:46Z, merged as #268).
