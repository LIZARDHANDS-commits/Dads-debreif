# Plan: step 1, app frame (storage, ui-kit, shell)

Specs: `specs/SPEC-storage.md`, `specs/SPEC-ui-kit.md`, `specs/SPEC-shell.md`. Tasks: `tasks/app-frame/todo.md`.

This is one of three workstreams running side by side (D14). The others are flight math (`src/core/`, `tasks/flight-math/`) and the weather parser (`src/wx/`, `tasks/wx/`). This workstream alone edits `package.json`, `vite.config.js` and `.github/workflows/`.

## Order

1. **Setup (first pull request).** Specs, this plan, `package.json`, Vite, `npm test` over `tests/unit` and `tests/golden`, Playwright, CI on every pull request, the GitHub Pages deploy on every push to `main`, and the size budget. The page is a placeholder. Patrick turns Pages on in the repo settings (Settings, Pages, Source: GitHub Actions) when this merges.
2. **Storage** with unit tests.
3. **ui-kit:** tokens, base styles, `h()`, scheduler, panel, plus the source-rules test.
4. **Shell core:** router, registry, host with the module contract, all unit-tested with a fake module.
5. **Shell screens:** home with "Coming soon" cards, About, header, Settings, Report a problem form, footer version.
6. **Browser tests:** smoke in three browsers, overlap scan, click-through, module switching, storage blocked.
7. **Card media:** re-encode the V6 card loops and stills into `public/media/cards/`, lazy-load them, respect reduced motion.
8. **Offline:** manifest, icons, generated service worker, new-version bar, offline test.
9. **Clock:** wire the header time to `core/time.js` once the flight-math workstream merges it.
10. **Sign-off:** READMEs, `docs/checklists/shell.md`, Patrick runs it on the live link.

Tasks 2 and 3 don't depend on each other. Task 9 waits on the flight-math workstream; everything else here depends only on earlier tasks.

## Skills used

From `.claude/skills/` (see its README for when each applies). Each pull request lists the ones it applied.

| Skill | Used for |
|---|---|
| spec-driven-development | SPEC-shell, SPEC-storage and SPEC-ui-kit, approved by Patrick before the code |
| planning-and-task-breakdown | This plan and `todo.md` |
| incremental-implementation, test-driven-development | One task per pull request, with its unit and browser tests |
| frontend-ui-engineering, with the accessibility checklist | Every screen and control: keyboard access, labels, focus, empty and error states, not overwhelming (R22) |
| performance-optimization, with the performance checklist | Home screen size budget (R5), card videos (R15), the offline cache and update checks, drawing only on change |
| security-and-hardening, with the security checklist | Text-safe `h()` instead of `innerHTML`, and a Content Security Policy when one is added |
| debugging-and-error-recovery | Red CI and flaky tests: reproduce first, then fix the cause (the clock test in #66) |
| code-review-and-quality | A five-axis review of every pull request before it leaves draft, with `/code-review` |
| code-simplification | The polish step, with `/simplify` |

## Risks

- **Pages isn't on yet.** The deploy job fails until Patrick switches Pages to GitHub Actions. It's one setting, asked for in the setup pull request.
- **Browser versions.** Local runs use the sandbox's Chromium, so `@playwright/test` is pinned to 1.56.1 to match it. CI installs its own browsers, including Firefox and WebKit.
- **Service worker caching an old version.** Mitigated by the new-version bar and a build id in the cache name; the offline test also checks that a new build replaces the old one.
- **Shared files.** If another workstream needs a script or CI change, it asks here rather than editing `package.json` itself.

## Checkpoints

- After 1: CI green on the pull request, and the placeholder is live on Pages once it's switched on.
- After 6: every browser test passes on the empty shell.
- After 10: Patrick signs off the shell checklist on the live link.
