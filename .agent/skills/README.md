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
| Any screen (ui-kit, shell, module pages) | frontend-ui-engineering, with `.agent/references/accessibility-checklist.md` | `/run` |
| Opening outside data: KML/track files (flight-data), debrief files, live weather and map feeds (SOF) | security-and-hardening, with `.agent/references/security-checklist.md` | `/security-review` |
| Speed: load time, bundle and media size, offline cache, smooth playback and animation | performance-optimization, with `.agent/references/performance-checklist.md` | `/run` |

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
