# Roadmap
(Plain-text copy of Claude Doc tab "Roadmap" node ced7d1ee-c732, rev 11, read 3 Oct 2026. Hand-transcribed; tables flattened.)
Everything left from here to switchover, in build order (D14). For each piece: what it waits on, and what it can run alongside. Up to three pieces are built at once; the limit is how fast you can review, not the code. Updated 2026-09-30.
## Running now
- App frame: signed off 2026-09-30 and live at https://lizardhands-commits.github.io/Dads-debreif/. The map canvas and controls the debrief needs are merged (#65).
- Flight math core, part 2 (#61, draft): turn math, EM chart, closure, estimated G and both tennis-ball solvers. Waits on your review.
- Flight data (#58): spec approved; the code is being written now.
- Debrief screen: a new thread is writing SPEC-debrief.md for your approval.
## Can start now, in parallel
- Airfields: in progress in its own thread (spec first). It unblocks Traffic, the SOF and the clock's home time zone.
- Turn Fight: spec approved 2026-09-30 (#76), build next in its own thread.
- Turn Sim: spec approved 2026-09-30 (#77), build next in its own thread.
## Only you can do these
- Review #61 (core part 2), and approve each new spec as it arrives.
- (struck through) Send Dad the second email. Dropped 2026-09-30: you answered all five questions yourself (D77 to D81), so no email is needed. The questions stay on record in the project files (dad-email/round-2-questions.md). You answered the Turn Sim and Turn Fight questions too (D82 to D94). Only the offset-box cue for #3 and #4 (D87) still waits on Dad.
- Before the SOF: set up an environment whose network reaches the weather and map sites, in Project settings.
## Every remaining piece
| # | Piece | What it covers | Waits on | Can run alongside |
| 1 | App frame | Shell, settings, storage, offline, clock | Done: you ran the sign-off checklist on the live link and every line passed (2026-09-30, R21) | Everything |
| 2 | Airfields | Home airfield and alternates as a setting, CYMJ by default (D17, R16), each with its alternate and landing minima (D71, D73) | A short spec for your approval | Everything |
| 3 | Core part 2 (#61) | Turn math, EM chart with D39 fixed, closure, estimated G, both tennis-ball solvers | Your review of #61 | Everything |
| 4 | Core part 3 | Formation standards and V6's default preset (D23). Later, the 3D attitude estimate (D40, D47) with the debrief screen | #61 merged | Flight data, debrief spec, airfields |
| 5 | Flight data (#58) | Loading ForeFlight tracks, GPS checks (D32, D49 to D54), one playback clock, saving a debrief (R17) | Nothing: spec approved, three PRs to come | Everything |
| 6 | Debrief screen | 2D map and 3D as one screen (D16), spacing readouts, EM chart, one tennis ball, DFPs, charts, CSV | Its spec; #58 and #61 merged. Before sign-off: Q32 and Q33 to Q37 (tennis ball) | Turn Sim, Turn Fight |
| 7 | Turn Sim | Presets, turn planning, cues, readouts, profiles, with Dad's fixes D41 to D45 and D48 | Spec approved 2026-09-30 (#77); the build is next. You answered Q41 to Q47 on 2026-09-30 (D82 to D90) | Debrief, Turn Fight |
| 8 | Turn Fight | 1-circle, 2-circle and vertical fights | Spec approved 2026-09-30 (#76); the build is next. You answered Q48 to Q51 on 2026-09-30 (D91 to D94) | Debrief, Turn Sim |
| 9 | Traffic | Patterns on the left, aircraft flying them on the right (D25), true circular arcs (D46) | Spec approved 2026-09-30 06:43Z (#96); builds alongside the Turn Sim, Turn Fight and SOF (D133). Decided on approval: D119 (Q52) and R24-R27, R29-R32. Open, with placeholders: Q59 (route redraw), Q74 and Q76-Q77 for Dad, Q75 for you | Any screen |
| 10 | SOF | Weather sources (D33), airfield cards, wave plan and timeline, alternates, radar, lightning (D34), cautions, stale-data warnings (D24) | Builds alongside the other three (D133, 2026-09-30; was last by design, D14). A network-enabled environment from you; airfields; the weather parser (done). Before sign-off: Q27 to Q30 | Polish of the other screens |
| 11 | Polish | Speed pass (performance-optimization skill), accessibility checklist, overlap and click tests on every screen, each audit issue #1 to #49 closed with a test or a decision | Each screen merged | SOF |
| 12 | Switchover | Every screen's sign-off checklist run (D28, R21), R1 to R21 checked, launch steps (shipping-and-launch skill, added at that point), a v1.0 release and the link shared. V6 stays in original/ as the reference | Everything above, and your go | Nothing |
## Order at a glance
1. Now: flight data code, core part 2 review, debrief spec, plus airfields.
2. Next: core part 3, then the debrief screen build, with the Turn Fight and Turn Sim specs.
3. Then the Turn Sim, Turn Fight, Traffic and SOF all build at once (D133, 2026-09-30). Each slice merges as it passes, and there is one combined sign-off at the end.
4. Last: the SOF (once the network environment is set up), polish, switchover.
Open questions for Dad don't block building. Each has a default (V6's behaviour), and his answer lands later as its own tested change (D10).
