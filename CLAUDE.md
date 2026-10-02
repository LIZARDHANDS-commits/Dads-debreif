# Dad's Debrief Tool

A browser-based T-6 flight training suite (debrief viewers, BFM, formation sim, SOF dashboard, traffic pattern sim) originally built as one ~119 MB HTML file. We are refactoring it into a modular web app.

## Ground rules
- It must stay usable by anyone, anywhere, in a normal browser with nothing to install.
- Plain JavaScript (ES modules), no UI framework, so the code stays readable to its original author.
- Never change flight math without tests verifying against 15 Wing Moose Jaw flight manuals (`../manuals/`) and standard aerodynamics within Pilot Domain Tolerances (D371: speeds ±10 kt, altitudes ±100 ft, angles ±5°, G ±0.5 G, merge times ±0.5 s). Zero bit-exact float matching or microsecond trajectory locking against legacy V6.
- `original/` is the untouched reference. Do not edit `original/shell.html` or `original/assets/`. `python3 tools/rebuild_original.py out.html` rebuilds the exact original file and verifies its checksum.
- Work spec-first: see `.claude/skills/spec-driven-development`. Specs live in `SPEC.md` (module map) and `specs/SPEC-<module>.md`.
- **MANDATORY FOR ALL AGENTS:** If there is an issue with tests repeatedly failing, ASK THE OPERATOR what to do before trying to tweak the physics to make it work. Never degrade aerodynamic formulas, 5.0 G SMM pull laws, stick shaker limits, or energy retention governors to satisfy brittle test assertions.

## Skills in this repo
Vetted copies from addyosmani/agent-skills (MIT) at commit 2686b62: spec-driven-development, planning-and-task-breakdown, incremental-implementation, test-driven-development, code-simplification, code-review-and-quality, debugging-and-error-recovery, frontend-ui-engineering, security-and-hardening, performance-optimization. Which skill to use in each phase, and which ones to add later, is in `.claude/skills/README.md`. Update them deliberately, reading any diff first.
