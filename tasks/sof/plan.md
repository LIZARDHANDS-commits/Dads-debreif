# SOF Dashboard: plan

Spec: [`specs/SPEC-sof.md`](../../specs/SPEC-sof.md), a draft waiting for Patrick's approval. Tasks: [`todo.md`](todo.md).

## Waits on

| Needed for | What | Owner |
|---|---|---|
| Any code | Patrick approves the spec, and the coordinator says it's the SOF's turn (after the debrief, Turn Sim, Turn Fight and Traffic) | Patrick, coordinator |
| Tasks 1 to 5 | `wx` parsing, limits, alternates and sources; `app.airfields`; `app.time` | Weather parser and Airfields threads (merged) |
| Task 2 | The registry entry `#/sof`, `tests/e2e/sof.spec.js`, and the SOF section in the Settings dialog | App frame thread, through the coordinator |
| Task 3 | Where each caution's words sit in the raw report text, from `wx` (small addition) | Weather parser thread, through the coordinator |
| Task 6 | The page's Content Security Policy allowing the SOF's sources (listed in the spec) | App frame thread, through the coordinator |
| Task 7 | SOF-3's answer decides whether the lightning-near-home caution is built; the default is yes | Patrick |

## Order and why

1. **The decisions first, with no screen.** Wave times, calls, card results, cautions and timeline pieces are pure functions over captured replies. That's where the safety risk is (the V6 bugs were all wrong answers), and it can be proven in Node before anything is drawn. The time conversion is pinned to V6's fixed CST for Moose Jaw before it moves to the home zone.
2. **Then a working screen with live weather** (cards, SOF bar, feed status), so the SOF is useful as early as possible. Cautions and waves follow, each a slice that works on its own.
3. **Then the timeline and the map**, which draw what the earlier slices already decided.
4. **Then the extras** behind their checkboxes, and the all-day run.

Each slice leaves the SOF working, behind the registry entry, so a half-built SOF never shows up broken on the live site: the card stays "Coming soon" until task 2 ships a screen that already refreshes weather and shows ages.

## Pull requests

- PR A: tasks 1 to 3 (the pure pieces, a screen with cards and the SOF bar, the caution banner).
- PR B: tasks 4 and 5 (waves with their calls, the timeline).
- PR C: tasks 6 and 7 (the map, radar, lightning and links).
- PR D: tasks 8 to 10 (the extras, the all-day run, polish and the checklist).

Each PR is reviewed with code-review-and-quality before it leaves draft, lists the skills it applied (see the spec's Skills used), and merges on green under the merge rule once this spec is approved.

## Risks

| Risk | What we do |
|---|---|
| A feed changes its format or goes away mid-day | Every feed keeps its last good answer with its age and says it failed; radar falls back to RainViewer; captured replies make each failure a test. |
| MET Norway or ECCC stop allowing browser reads | Checked on 2026-09-30 from the live site. The e2e tests use fixtures, so a live check is a separate step at build time; a change goes to Patrick, since the only fix is a relay (D69). |
| The screen slows or grows over a 12-hour shift | No growing lists, draw on change only, timers from the scheduler scope; the simulated 12-hour run is a test, not a hope. |
| The computer sleeps and timers fire late or all at once | On wake or when the tab shows again, refresh what's due once; ages come from report times, so a late refresh never looks fresh. |
| A wave call is read as an instruction | The chip always carries its reason, and the "not for flight planning, confirm with NAV CANADA" line stays on screen. |
| Too much on one screen (R22) | Only the table's defaults show; SOF-1 asks Patrick to confirm them; the layout test checks 1366 × 768. |
| Map tiles and radar images drawn twice, once here and once in the debrief | If the debrief's tile code lands first, ask the coordinator to move a shared tile layer into ui-kit; otherwise the SOF keeps a small one of its own. |
