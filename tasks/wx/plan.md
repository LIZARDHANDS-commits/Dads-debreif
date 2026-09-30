# Plan: wx (weather parser)

Spec: `specs/SPEC-wx.md`.

## Skills used

From `.claude/skills/` (map in its README):
- **spec-driven-development**: SPEC-wx first, and every change to it okayed by Patrick (2026-09-30: spec, Q30 alternates, Sources).
- **test-driven-development**: failing tests first for every change. Audit issues #1 to #5 each have a test, and live replies are tested from captured fixtures.
- **code-review-and-quality**: a five-axis review before each PR leaves draft (13 findings fixed in #53; self-review on #63, #68, #69 and #71).
- **security-and-hardening**: MET Norway and Datamask replies are untrusted input. Size caps, station checks, no cookies and a minimum refresh interval are in `sources.js`.
- **code-simplification**: for no-behaviour-change edits such as the units check.
- **debugging-and-error-recovery**: for CI failures (the WebKit clock flake was traced this way and fixed in #66).

Owner: the "Weather parser" thread. Owns `src/wx/`, `tests/unit/wx/`, `specs/SPEC-wx.md`, `tasks/wx/`.

1. Spec (SPEC-wx.md), with open questions WX-1 to WX-4.
2. Shared condition parsing and merge (`conditions.js`, `dates.js`).
3. METAR (`metar.js`).
4. TAF groups and timeline (`taf.js`).
5. Limits, NATO colour, flight category (`limits.js`).
6. Home trigger and alternate at ETA (`alternates.js`).
7. Side-by-side with V6's own SOF functions (`v6-compare.test.js`).

Later, not in this PR:

- The local metres-per-mile constant stays: `core/units.js` has no statute mile (checked 2026-09-30).
- `sources.js`: done in #69 (MET Norway, Datamask backup), hardened in #71.
- Apply the answers to WX-1 to WX-5: done (#63, #68, #78). WX-5 was answered by D79: military alternates use the same rules as civil.
