# SOF end-of-module test round (Streamlined build)

Run 2026-09-30 ~17:20Z on main 8543131 (after #238), this container, Chromium.

| Check | Result |
|---|---|
| Unit tests, all modules (`node --test "tests/unit/**/*.test.js"`) | 2811 tests, 2803 pass, 0 fail, 0 skipped (8 are todo) |
| Typecheck (`npm run typecheck`) | clean |
| Build (`npm run build`) | OK |
| SOF browser tests (sof.spec.js, sof-map.spec.js) plus screenshots (visual.spec.js) | 118 passed |
| Accessibility (axe): a11y.spec.js (all modules incl. SOF), plus SOF's own axe checks inside sof.spec.js and sof-map.spec.js (banner up, wave list open, Layers menu open, ADS-B view) | all pass |
| Smoke (home lists SOF, SOF opens with essentials) | pass |
| GitHub CI on the merged head (test incl. WebKit @smoke, CodeQL) | green |
| Screenshot sof.png | unchanged by #236 and #238; normal-weather state, 1 caution (CYQR below limits) |

Not in this round (per Patrick 16:37Z/16:47Z: keep testing simple): mutation runs, fuzzing, exact memory counts, 12 h all-day run (future-ideas.md), real reload against live ECCC.

Known and logged, not bugs: traffic layer needs Patrick's Cloudflare relay (task 7b); F7 relay typed setting (review row 15:00); Dad's PJ1-PJ3 in dad-email/dads-check-list.md.

Next: Verification check, then Patrick's click-through: docs/checklists/sof.md (24 checks, ~20 min, on the live site).
