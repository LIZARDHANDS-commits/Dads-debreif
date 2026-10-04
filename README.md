# Dad's Debrief Tool

T-6 flight training debrief and SOF suite, being refactored from a single HTML file into a modular web app. The rule book is `AGENTS.md`. The plan is `docs/PLAN.md`, and each module's spec, plan and decisions are in `docs/modules/<module>/`; `docs/README.md` says what lives where.

## Working on the new app

Needs Node 22.12 or newer. Visitors to the site need nothing installed.

```
npm install          # once
npm run dev          # local site with live reload
npm test             # unit tests
npm run typecheck    # type-check the JavaScript from its JSDoc comments
npm run build        # builds dist/ and checks the size budget
npm run test:e2e     # browser tests against the build
```

Every push to `main` is published to GitHub Pages by `.github/workflows/pages.yml`.

## The original V6

- `original/` holds the original V6 file split into a text shell plus its embedded videos, images and KML tracks (GitHub caps files at 100 MB).
- Rebuild the exact original: `python3 tools/rebuild_original.py Dads_OODA_LOOP_Webtool_V6.html` (checks the SHA-256).
