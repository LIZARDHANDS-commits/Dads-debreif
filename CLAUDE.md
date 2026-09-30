# Dad's Debrief Tool

A browser-based T-6 flight training suite (debrief viewers, BFM, formation sim, SOF dashboard, traffic pattern sim) originally built as one ~119 MB HTML file. We are refactoring it into a modular web app.

## Ground rules
- It must stay usable by anyone, anywhere, in a normal browser with nothing to install.
- Plain JavaScript (ES modules), no UI framework, so the code stays readable to its original author.
- Never change flight math (geometry, EM, turn rate/radius, spacing, time conversions) without a test that pins the old behaviour first.
- `original/` is the untouched reference. Do not edit `original/shell.html` or `original/assets/`. `python3 tools/rebuild_original.py out.html` rebuilds the exact original file and verifies its checksum.
- Work spec-first: see `.claude/skills/spec-driven-development`. Specs live in `SPEC.md` (module map) and `specs/SPEC-<module>.md`.

## Skills in this repo
Vetted copies from addyosmani/agent-skills (MIT) at commit 2686b62: spec-driven-development, planning-and-task-breakdown, incremental-implementation, test-driven-development, code-simplification, code-review-and-quality, debugging-and-error-recovery. Which skill to use in each phase, and which ones to add later, is in `.claude/skills/README.md`. Update them deliberately, reading any diff first.
