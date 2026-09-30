# Plan: wx (weather parser)

Spec: `specs/SPEC-wx.md`. Owner: the "Weather parser" thread. Owns `src/wx/`, `tests/unit/wx/`, `specs/SPEC-wx.md`, `tasks/wx/`.

1. Spec (SPEC-wx.md), with open questions WX-1 to WX-4.
2. Shared condition parsing and merge (`conditions.js`, `dates.js`).
3. METAR (`metar.js`).
4. TAF groups and timeline (`taf.js`).
5. Limits, NATO colour, flight category (`limits.js`).
6. Home trigger and alternate at ETA (`alternates.js`).
7. Side-by-side with V6's own SOF functions (`v6-compare.test.js`).

Later, not in this PR:

- Swap the local metres-per-mile constant for `core/units.js` once the flight-math core merges.
- `sources.js`: aviationweather.gov plus a backup (D33), in an environment with network access. Add a few captured live reports to `reports.js` then.
- Apply the answers to WX-1 to WX-4 (Q27 to Q29 done; Q30 waits on the Canadian alternate rules).
