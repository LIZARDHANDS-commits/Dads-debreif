# Agent instructions

Read these first, every session:
1. `HANDOVER.md`: the goal, rules, module status and suggested order.
2. `.agent/memory/handoff.md`: where the last session stopped and what comes next.
3. `docs/handover/<module>.md` for the module you are working on.
4. `CLAUDE.md`: the repo's ground rules (they apply to any agent).

Commands:
- `/sync` at the start of a session (`.agent/skills/sync/SKILL.md`).
- `/save` at the end of each piece of work (`.agent/skills/save/SKILL.md`).

The workflow skills (spec-driven-development, test-driven-development and the rest) are in `.agent/skills/`, with their checklists in `.agent/references/`; `.agent/skills/README.md` says which to use when.

Never edit `original/`. The flying manuals are in `../manuals` (next to the repo; `manuals/README.md` is the index). Never copy manual text or images into the repo; page references only. No new libraries without Patrick's word.
