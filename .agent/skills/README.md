# Which skill to use when

This is the one skills folder. Antigravity reads it here, and `.claude/skills` is a link to it so Claude Code reads the same files. Never make a second copy (rule book, `../../AGENTS.md`).

The ten workflow skills in the tables below are vetted, unmodified copies from addyosmani/agent-skills (MIT, see `LICENSE-agent-skills`) at commit 2686b62. Project rule: read a skill in full before adding it, add them one at a time, and never bulk-install.

The other four are this project's own:

- `sync`: start of a session. Read the rule book, the plan and the module README, then say what's next and what waits on Patrick.
- `save`: end of a piece of work. Update the module's README and `plan.md`, commit on a work branch with a plain-English name, and push.
- `verification-swarm`: Patrick's skill for running a team of agents that cross-checks reports or a body of work, every claim cited and checked.
- `wind-shaped-flight-paths`: how to build smooth, wind-corrected flight paths (circuits, breaks, forced landings). Its High Key and PFL parts (pillars 3, 6, 9, 11 and 12) are reviewed at the Traffic PFL review.

## Every module, every phase

Each module (shell, core, wx, flight-data, debrief, Turn Sim, Turn Fight, Traffic, SOF) goes through the same steps.

| Phase | Skill | Built-in command that helps |
|---|---|---|
| Spec | spec-driven-development | |
| Plan | planning-and-task-breakdown | |
| Build | incremental-implementation, test-driven-development (expected values from a manual page, standard aerodynamics, Patrick's ruling or recorded data; see `docs/TESTING.md`) | `/run` |
| Something breaks (red CI, a failing test, browser error) | debugging-and-error-recovery | |
| PR review | code-review-and-quality | `/code-review`, `/security-review` |
| Polish | code-simplification | `/simplify` |
| Any screen (ui-kit, shell, module pages) | frontend-ui-engineering, with `.agent/references/accessibility-checklist.md` | `/run` |
| Opening outside data: KML/track files (flight-data), debrief files, live weather and map feeds (SOF) | security-and-hardening, with `.agent/references/security-checklist.md` | `/security-review` |
| Speed: load time, bundle and media size, offline cache, smooth playback and animation | performance-optimization, with `.agent/references/performance-checklist.md` | `/run` |

Where the project's layout differs from a skill's defaults:

- spec-driven-development: the spec is the module's `docs/modules/<module>/spec.md`, not a root `SPEC.md`.
- planning-and-task-breakdown: the plan and its task list go in the module's `docs/modules/<module>/plan.md`, not `tasks/plan.md` or `tasks/todo.md`.

frontend-ui-engineering covers keyboard access, labelled controls, empty, error and stale states, colour never being the only signal (SOF cautions), and design tokens instead of `!important`. Its examples are React/Tailwind and mobile-first: take the rules, not the code, and target desktop.

security-and-hardening: a KML file or a weather reply is untrusted text. Never put it into `innerHTML` (use `textContent`, or the ui-kit's text-safe `h()` from #54), check its shape and size where it enters, audit dependencies before a release, and set a Content Security Policy. Most of the skill (logins, passwords, databases, rate limits, SSRF) doesn't apply to a static site with no server.

performance-optimization: measure first, change one thing, re-measure, and revert anything that doesn't beat the noise. Log each attempt, kept or reverted, in the PR description. Useful here: the Core Web Vitals targets, bundle and image budgets, lazy-loading modules and media, long tasks in playback and animation loops, and the offline cache. Skip the database, API, connection-pool and React sections. Its `npx lighthouse`, `bundlesize` and `lhci` commands add tools, so ask before adding them. Thread sandboxes can't reach github.io: measure a local `vite build` served with `npm run preview`, and ask Patrick for numbers from the live site.

## Add when that work starts (already read, not yet added)

| When | Skill | Why, and what doesn't apply |
|---|---|---|
| Switchover from V6 | shipping-and-launch | Its pre-launch checklist and rollback plan. Feature flags and staged rollouts are overkill here. |

## Looked at and not added

- webapp-testing (anthropics/skills): Python Playwright; this repo already uses JavaScript Playwright and `/run`.
- browser-testing-with-devtools: test-driven-development points to it for browser code, but it needs a Chrome DevTools MCP server installed (`npx chrome-devtools-mcp@latest`). The repo's Playwright tests and `/run` cover the same ground without it.
- api-and-interface-design: spec-driven-development points to it for the contract a module publishes. Its useful rules (decide what a module exports on purpose, add rather than change, check data where it enters) are already in SPEC.md's one-way dependencies and module lifecycle. The rest is REST endpoints, pagination and idempotency keys, which a static app doesn't have.
- ci-cd-and-automation: CI and the Pages deploy already exist; its examples are Vercel and Prisma.
- documentation-and-adrs: the plan doc's tabs are the decision log, and ADRs would make a second one.
- constraint-driven-development: installs Lighthouse, axe and other tools up front; revisit alongside performance-optimization.
- doubt-driven-development, idea-refine, interview-me, context-engineering, deprecation-and-migration, observability-and-instrumentation, git-workflow-and-versioning, source-driven-development, using-agent-skills: overlap with the above or don't fit a static single-user app.
