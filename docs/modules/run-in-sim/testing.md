# Run-in Simulator: testing

The policy is `../../TESTING.md`. This module adds:

- **The one light test** (plan Step 5), `tests/unit/run-in-sim/pass.test.js`: a flat practice-bomb pass in still air, released at the CARP, puts the bomb on the aim point within ±100 ft (the shared margin), and the escape stays above the ground the whole way (what a pilot would recognise). Expected values: the aim point the test sets, and the ground; nothing from the code's own output or V6.
- **The air refuelling run's one light test** (plan Step 7; approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build')), `tests/unit/run-in-sim/refuel.test.js`: in still air from the run's defaults (since RS-19 the receiver takes off from CYMJ: it must leave the runway and pass the IP; since RS-22 the test's ground is at CYMJ's 1,892 ft), the stand-in receiver ends the join at the pre-contact point behind the tanker within ±50 ft (the shared table's loose formation margin: a station a pilot would call "in pre-contact", wider than the ±20 ft close one because the point itself is an estimate), it is never ahead of the tanker's wing line from the roll-out on, and the tanker is never below its set height by more than ±100 ft (the shared margin). Since RS-19 was amended (Dad, 20 Oct 2026; the Place is now the ARCP and the IP is set back from it, so the IP check stands as written): until the receiver is IP inbound (read off its own flight) the tanker stays in its hold at the ARCP, never more than one of its turn radii (standard aerodynamics, r = V² ÷ (g tan φ), at the standard day's true airspeed) plus a quarter of a mile out toward the IP. Expected values: the pre-contact point and the tanker's height the test sets, and that turn radius; nothing from the code's own output or V6.
- No test checks a leg's time, a recorded number or an exact path. No test expects the aircraft to be held at a published limit (RS-6).
- The dive CARP (RS-5) rides on `drop.js`'s existing test: no second test in the same pull request.

## Sign-off checklist (in Dad's and Patrick's words; filled in when the spec is approved)

- [ ] From the default start, open the Run-in Simulator and press Fly the pass: the CT-156 flies the orbit, the run-in, the release and the escape, and the card shows the miss and the time over target.
- [ ] Each run type: a stadium flyover, a flat and a dive practice-bomb pass, and a C-130J cargo offload over a drop zone.
- [ ] Place a target in a mountain valley: the ground is the real ground, and the lowest height in the escape reads off it.
- [ ] Add a 20 kt crosswind: the run-in crabs, the CARP moves upwind, and the load still lands near the aim point.
- [ ] Set a planning wind different from the wind met: the load misses, and the miss is in the direction the wrong wind says.
- [ ] Set an escape the aircraft can't make (too low a release in a steep dive): it is flown as best it can and flagged, not changed.
- [ ] Every camera (Chase, Cockpit, Target, Overhead, Side) and every playback speed.
- [ ] "Training only" always shows.
