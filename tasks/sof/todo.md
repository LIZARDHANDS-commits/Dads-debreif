# SOF Dashboard: tasks

Spec approved by Patrick on 2026-09-30. Build starts once the coordinator says it's the SOF's turn. See [`plan.md`](plan.md). Every task also meets `.claude/references/definition-of-done.md`, and the skill for each step is in the spec's Skills used.

- [x] SPEC-sof.md drafted, with SOF-1 to SOF-7
- [x] Patrick approves SPEC-sof.md (2026-09-30 04:49Z)
- [x] SOF-1 to SOF-7 logged in the plan doc (D102 to D108)

## Build

- [ ] **1. Waves and cards, decided in Node.** `waves.js`: a wave plan to UTC times for Today or Tomorrow in the home zone, the home call and the alternate calls. `cards.js` (model only): each airfield's category, NATO state, report times and ages, stale and missing states, limit result and cautions. Tests first from captured replies.
  - Acceptance: for CYMJ the wave times equal V6's fixed `+6` h on every day of a year, midnight-crossing waves included (pinned before the code uses the zone); a daylight-saving zone gives the right UTC; each wave's call matches `homeAlternateTrigger` and `assessAlternate` with `checkOptions`; the label is built from the limits used (D59); the Local (MTCA) 2000/3 and Cross-country 3000/3 triggers each give the right call on a TAF of 2500 ft, and a hand-changed number reads as `Custom` (D111); a cancelled TAF and `LAST OBS/NXT` read as words, not errors.
  - Verify: `node --test 'tests/unit/sof/*.test.js'`.
  - Dependencies: none. Size M.
  - Files: src/modules/sof/waves.js, src/modules/sof/cards.js, tests/unit/sof/waves.test.js, tests/unit/sof/cards.test.js, tests/fixtures/sof/
- [ ] **2. A screen with live weather.** Registry entry (app frame). Mount and unmount; the SOF bar (DTG, feed status in words, Refresh; traffic is a map layer, task 7b); airfield cards with raw text and ages; `startRefresh` on the scheduler scope, restarted when the airfields change; last good reports kept in storage and shown with their age; credits line.
  - Acceptance: with every feed failing the screen says so in words and keeps the last reports (#8); leaving the module stops every timer and request (R4); no console errors (R7); nothing overlaps at 1366 × 768 (R2).
  - Verify: `npm test`; e2e with fixtures (app frame's `tests/e2e/sof.spec.js`); `npm run dev` against the live feeds once.
  - Dependencies: 1. Size M.
  - Files: src/modules/sof/{index,layout}.js, src/modules/sof/cards.js (DOM), sof.css, README.md
- [ ] **3. Limit marks and the caution banner.** Marked report words from `wx`'s positions; result lines; `cautions.js` for which cautions are new, acknowledging, and when one comes back (SOF-4 default); acknowledgements kept for the day; the banner setting.
  - Acceptance: a below-limit report and each D58 caution raise the banner, Acknowledge clears it, the same caution in the next report doesn't re-raise, and a new one does (#5); marks never use colour alone; report text is only ever text.
  - Verify: unit tests for `cautions.js`; e2e banner flow with the keyboard alone.
  - Dependencies: 2; `wx` word positions (Weather parser thread). Size M.
  - Files: src/modules/sof/cautions.js, src/modules/sof/cards.js, tests/unit/sof/cautions.test.js, src/modules/sof/layout.js

**Checkpoint A:** tests pass; code-review-and-quality; `/security-review`; open PR A.

- [ ] **4. Waves on screen.** Add, edit and remove up to 5 waves in home local time with the zone shown; Today or Tomorrow; each wave's chip with its call and first reason; the full list of hits on select; each alternate card's result for the selected wave; stored plan checked on read.
  - Acceptance: an evening wave shows and is checked (#7); no old date is ever used; every input does something (R3); the plan survives a reload.
  - Verify: `npm test`; e2e wave flow.
  - Dependencies: 3. Size M.
  - Files: src/modules/sof/waves.js, src/modules/sof/layout.js, src/modules/sof/sof.css, tests/unit/sof/waves.test.js
- [ ] **5. The 24-hour timeline.** Pieces from `tafTimeline` (pure, tested), NATO colour plus a label, a hatch for below, wave bands, landing and +1 h marks, METAR mark, now line; axis in the Settings time order; keyboard stepping and hover or focus cards; redrawn only on change.
  - Acceptance: matches `wx`'s timeline for every fixture; an evening wave shows with Zulu first (#7); editing a wave never loses focus.
  - Verify: `node --test tests/unit/sof/timeline.test.js`; e2e keyboard walk.
  - Dependencies: 4. Size M.
  - Files: src/modules/sof/timeline.js, tests/unit/sof/timeline.test.js, src/modules/sof/sof.css

**Checkpoint B:** tests pass; code-review-and-quality; open PR B.

- [ ] **6. The map with radar.** Canvas map with Satellite or VNC base (shared tile loader and VNC charts from ui-kit) and credits, airfield dots with labels, 25 and 50 NM rings, pan, zoom and Home; ECCC radar image with its own layer time, Rain or Snow, stale after 20 min; RainViewer backup after two ECCC failures; offline message.
  - Acceptance: the age shown is the radar's time, not the fetch's; ECCC failing switches to RainViewer and back; image addresses are built from numbers only; drawn on change only.
  - Verify: `node --test tests/unit/sof/feeds.test.js`; e2e with fixture images; performance log in the PR.
  - Dependencies: 2; CSP entries (app frame). Size M.
  - Files: src/modules/sof/map.js, src/modules/sof/feeds.js, tests/unit/sof/feeds.test.js, tests/fixtures/sof/
- [ ] **7. Lightning, the ADS-B Exchange view and links.** The ADS-B Exchange view switch (sandboxed frame, removed when off or on unmount, falls back to a link; read their terms first); ECCC lightning density with opacity, stale after 30 min; lightning near home (if SOF-3 is yes) as a caution with its radius setting; Lightning map link; Runway view link per card (SOF-5 default). Re-read Blitzortung's terms before shipping the link.
  - Acceptance: lightning is visible by default (#9); the near-home check finds lightning in a fixture inside the radius and none outside it; links open in a new tab with `noopener noreferrer`.
  - Verify: `node --test tests/unit/sof/lightning.test.js`; e2e.
  - Dependencies: 6. Size S to M.
  - Files: src/modules/sof/lightning.js, src/modules/sof/map.js, tests/unit/sof/lightning.test.js, src/modules/sof/cards.js

- [ ] **7b. The traffic relay and layer (SOF-7).** `relay/traffic.js` (Cloudflare Worker) with its tests first: number checks, 5 s cache, trimmed reply, CORS for the site only, size caps; adsb.lol terms read. Patrick sets up the free Cloudflare account with steps given then; the relay address goes into the build settings and the CSP (app frame, through the coordinator). The layer: symbols by track, military mark, stale fade, label options, hover facts, 10 s refresh while on, `Traffic unavailable` on failure.
  - Acceptance: the relay refuses anything but three in-range numbers; a hostile reply (huge, wrong shape, script in a callsign) draws nothing or plain text; the layer stops asking when off or unmounted (R4); the rest of the SOF works with the relay down.
  - Verify: `node --test tests/unit/relay/traffic.test.js`; `node --test tests/unit/sof/traffic.test.js`; e2e with a fixture reply; one live check against the deployed relay.
  - Dependencies: 6; Patrick's Cloudflare account. Size M.
  - Files: relay/traffic.js, relay/lib.js, relay/README.md, tests/unit/relay/traffic.test.js, src/modules/sof/traffic.js, tests/unit/sof/traffic.test.js

**Checkpoint C:** tests pass; code-review-and-quality; `/security-review`; open PR C.

- [ ] **8. The extras.** World clocks, Other airfields (fetched only while open), the NATO chart with hover and focus cards, radar loop (last hour, capped), large text, About this screen.
  - Acceptance: each checkbox shows and hides only its own piece and is off by default (R22); Other airfields stops fetching when closed; every control does something (R3).
  - Verify: e2e click-through; look at each against V6.
  - Dependencies: 7. Size M.
  - Files: src/modules/sof/layout.js, src/modules/sof/map.js, src/modules/sof/sof.css, src/modules/sof/cards.js
- [ ] **9. The all-day run.** Fake timers over 12 hours with changing, failing and recovering replies; hidden tab and wake; memory and timer counts flat.
  - Acceptance: refreshes on D67's times; stale labels and cautions right throughout; the same timers, listeners and DOM node count after hour 12 as after hour 1.
  - Verify: `node --test tests/unit/sof/all-day.test.js`; a local build left open for an hour with the performance panel.
  - Dependencies: 8. Size S.
  - Files: tests/unit/sof/all-day.test.js, src/modules/sof/index.js
- [ ] **10. Polish and sign-off checklist.** code-simplification pass; README; `docs/checklists/sof.md` for a current SOF or Patrick, run against V6 and NAV CANADA's weather on the same day (R21).

**Checkpoint D:** tests pass, build under budget; code-review-and-quality; open PR D; the checklist goes to Patrick.
