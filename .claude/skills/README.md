# Which skill to use when

Every skill here is a vetted, unmodified copy from addyosmani/agent-skills (MIT, see `LICENSE-agent-skills`) at commit 2686b62. Project rule: read a skill in full before adding it, add them one at a time, and never bulk-install.

## Every module, every phase

Each module (shell, core, wx, flight-data, debrief, Turn Sim, Turn Fight, Traffic, SOF) goes through the same steps.

| Phase | Skill | Built-in command that helps |
|---|---|---|
| Spec | spec-driven-development | |
| Plan | planning-and-task-breakdown | |
| Build | incremental-implementation, test-driven-development (golden tests for flight math) | `/run` |
| Something breaks (red CI, golden mismatch, browser error) | debugging-and-error-recovery | |
| PR review | code-review-and-quality | `/code-review`, `/security-review` |
| Polish | code-simplification | `/simplify` |

Note: code-review-and-quality links to `security-checklist.md` and `performance-checklist.md` under `.claude/references/`. Those are not vendored yet; they arrive with the skills below that need them.

## Add when that work starts (already read, not yet added)

| When | Skill | Why, and what doesn't apply |
|---|---|---|
| ui-kit and each module screen | frontend-ui-engineering (+ accessibility-checklist) | Keyboard access, labelled controls, empty/error/stale states, colour never the only signal (SOF cautions), design tokens instead of `!important`. Its examples are React/Tailwind and mobile-first: take the rules, not the code, and target desktop. |
| flight-data (opening KML files) and SOF (live feeds) | security-and-hardening (+ security-checklist) | A KML or weather reply is untrusted text: never put it into `innerHTML`, check it where it enters, audit dependencies, set a CSP. Most of the skill (logins, databases, rate limits) doesn't apply to a static site. |
| After the first GitHub Pages deploy | performance-optimization (+ performance-checklist) | Load time and bundle size against V6's 119 MB, media budgets, offline cache size. |
| Switchover from V6 | shipping-and-launch | Its pre-launch checklist and rollback plan. Feature flags and staged rollouts are overkill here. |

## Looked at and not added

- webapp-testing (anthropics/skills): Python Playwright; this repo already uses JavaScript Playwright and `/run`.
- browser-testing-with-devtools: test-driven-development points to it for browser code, but it needs a Chrome DevTools MCP server installed (`npx chrome-devtools-mcp@latest`). The repo's Playwright tests and `/run` cover the same ground without it.
- api-and-interface-design: spec-driven-development points to it for the contract a module publishes. Its useful rules (decide what a module exports on purpose, add rather than change, check data where it enters) are already in SPEC.md's one-way dependencies and module lifecycle. The rest is REST endpoints, pagination and idempotency keys, which a static app doesn't have.
- ci-cd-and-automation: CI and the Pages deploy already exist; its examples are Vercel and Prisma.
- documentation-and-adrs: the plan doc's tabs are the decision log, and ADRs would make a second one.
- constraint-driven-development: installs Lighthouse, axe and other tools up front; revisit alongside performance-optimization.
- doubt-driven-development, idea-refine, interview-me, context-engineering, deprecation-and-migration, observability-and-instrumentation, git-workflow-and-versioning, source-driven-development, using-agent-skills: overlap with the above or don't fit a static single-user app.
