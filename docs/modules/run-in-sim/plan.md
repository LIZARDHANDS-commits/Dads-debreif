# Run-in Simulator: plan

Only what is here gets built. Patrick approved the plan (relayed by Dad, 16 Oct 2026: "got the yes") and the spec ("yea pat approves"), adding RS-9: the user sets a few essentials and the computer works out the rest to hit.

Dad's ask (16 Oct 2026): "Lets build a run in simulator...the target can be a stadium, a bridge, mountains etc in a 3d enviroment. the user should see an orbit and a run in and be able to set those parameters along with speed alt winds. to see how the flyover, inert bomb drop, DZ offload will go, Diving drop or flat, as well as the escape manuver". His card answers: generic shapes on real terrain; all three run types on one engine; auto-flown to the user's settings.

## Step 0. Plan approved
- [x] Patrick's yes on the plan (relayed by Dad, 16 Oct 2026).
- [x] The whole-tool decision for the new module (ALL-44), written for Patrick to confirm the wording.

## Step 1. Spec approved
- [x] `spec.md`, `requirements.md` (RS-R1 to RS-R8), `decisions.md` (RS-1 to RS-8), `testing.md` and the screen picture (`screen-mockup.png`) written (16 Oct 2026).
- [x] Patrick approves the spec, ALL-44 and RS-1 to RS-8, adding RS-9 (relayed by Dad, 16 Oct 2026). RS-Q1 to RS-Q4 use their working answers until he says otherwise; the C-130J's numbers table goes to Patrick before it flies (RS-Q1).

## Step 2. The world
- [x] Module folder, home card and README; the one screen (Setup, the 3D view with the plan view, the result column, the bar) (V2.502).
- [x] The target shapes on the shared terrain and satellite ground at a tapped place; the cameras (V2.502).

## Step 3. The flying
- [x] The pilot from core pieces on the shared point mass (RS-4): orbit, IP and run-in (flat and dive), escape; the wind's crab; the orbit exit timed for the time over target (RS-8) (V2.502).
- [x] Flags on the card for the references and for a pass that can't be made (RS-6) (V2.502).

## Step 4. The three run types
- [x] The worked-out numbers for each run (RS-9) and the hand override under More. Flyover timing; the practice-bomb pass with the CARP and the miss. `drop.js`'s CARP takes a dive release (RS-5) (V2.502).
- [ ] The cargo offload from the C-130J: waits for its performance set (RS-Q1); the engine is ready for it.
- [x] The planning wind under More (RS-7) (V2.502).

## Step 4b. Dad's first look (16 Oct 2026)
- [x] The orbit as a holding pattern or a figure 8, leaving at the IP heading inbound (RS-11) (V2.502).
- [x] The target keeps its own heading; on the bridge's deck or underneath on the card (RS-12) (V2.502).
- [x] The 2D view: plan and profile behind a 3D / 2D switch (RS-13) (V2.502).
- [ ] Dad or Patrick sees the three in the app from the default start.

## Step 5. One light test
- [x] A flat pass in still air, released at the CARP, puts the bomb on the aim point and the escape stays above the ground (`testing.md`; `tests/unit/run-in-sim/pass.test.js`, V2.502).

## Step 6. Sign-off
- [ ] Run the checklist in `testing.md` and send Patrick the result.

## Step 7. Air refuelling: the point-parallel rendezvous (approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))
Dad, 17 Oct 2026: "can we also add in the airrefueling... to the run in sim"; his picks: the rendezvous first, the point-parallel, the CT-156 as a stand-in receiver. **Built first on Dad's "Build anyway" (17 Oct 2026); Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build') followed.** Plan: [air-refuelling-plan.md](air-refuelling-plan.md) Steps 1 to 3; Step 4 (the en-route rendezvous) stays on `future.md`.
- [x] Written down first: `spec.md` "Air refuelling" with its screen picture (`air-refuelling-screen.png`), RS-15 to RS-18, RS-R10 to RS-R13, `testing.md`'s one test (17 Oct 2026).
- [x] The tanker: the KC-130J from the C-130J model with its two wing-pod drogues, flying its anchor at a set height and true airspeed, a picture with no performance set (RS-15) (V2.503).
- [x] The point-parallel worked out to hit (RS-16) and the join to pre-contact behind the left drogue (RS-17); the card, the two new cameras and the 2D plan and profile with both tracks (RS-18) (V2.503).
- [x] One light test: in still air from the defaults the receiver ends at pre-contact behind the tanker, never ahead of its wing line, and the tanker never below its height (`tests/unit/run-in-sim/refuel.test.js`, V2.503).
- [x] Patrick's yes on RS-15 to RS-18 (relayed by Dad, 17 Oct 2026: 'pat says build').
- [ ] Numbers or a manual page (ATP-56) for the estimates.
- [ ] Dad or Patrick sees it in the app; the sign-off checklist in Dad's and Patrick's words (air-refuelling-plan.md Step 5).

## Step 7b. Take-off, IP and the turn inbound from the orbit; turn range and offset (approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))
Dad, 17 Oct 2026: "Can we have the tanker in orbit while the ct156 is initial takeoff meeting at the IP then the tanker turns inbound to meet from the orbit"; "Giving turn range and offset would help too".
- [x] Written down first: spec "Change: take off from Moose Jaw...", RS-19 and RS-20, RS-R14 and RS-R15 (17 Oct 2026).
- [x] The take-off from CYMJ, the climb-out and the transit to the IP; the tanker in its orbit turning inbound, worked out from the receiver's flight (RS-19) (V2.504).
- [x] Turn range and offset leading the card, the offset by hand, both drawn (RS-20) (V2.504).
- [x] The one test updated: it leaves the runway, passes the IP, ends at pre-contact (V2.504).
- [x] Patrick's yes on RS-19 and RS-20 (relayed by Dad, 17 Oct 2026: 'pat says build').

## Step 7c. The turn inbound in the air mass; the take-off's ground; the name (approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))
Dad, 17 Oct 2026: "Is turn range/offset scalable based on altitude airspeed wind"; "takeoff isn't working"; "can we also change the name of the module to Advanced Mission Sets".
- [x] Written into the spec and RS-21 to RS-23.
- [x] The turn inbound flown in the air mass, the offset and turn range worked out for the wind, the wind on the card (RS-21) (V2.505).
- [x] The ground centred near CYMJ for the take-off, CYMJ's runways drawn, the CT-156 on its wheels with its gear (RS-22) (V2.505).
- [x] The name Advanced Mission Sets on the home card, the screen and the tab (RS-23) (V2.505).
- [x] The one test kept: its ground now at CYMJ's 1,892 ft (V2.505).
- [x] Patrick's yes on RS-21 to RS-23 (relayed by Dad, 17 Oct 2026: 'pat says build').

## Step 7d. Direct to the IP after take-off; the tanker holds at the ARCP until IP inbound (Dad's correction, within Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'); Patrick's look still to come)
Dad, 20 Oct 2026: "For the point parallel the t-6 taking off should really just turn direct the IP after takeoff. and the tanker shoould really stay in orbit at the ARCP until the reciever hits "IP inbound"".
- [x] Written down first: the spec's "Change: direct to the IP after take-off; the tanker holds at the ARCP until IP inbound", RS-19 amended with RS-16 and RS-21, RS-R19, `testing.md` (20 Oct 2026).
- [x] The receiver turns direct to the IP from 400 ft above the runway (an estimate); "After take-off" keeps the runway heading to 2,500 ft as a setting (20 Oct 2026).
- [x] The Place is the ARCP; the tanker holds there (its fix abeam the ARCP on the offset side), its orbit timed to be at the fix at IP inbound, then runs down the reciprocal track to the turn worked out to hit the trail; "The tanker" keeps the anchor as a setting; the airborne start unchanged (20 Oct 2026).
- [x] The card (IP inbound, where the tanker was, its time in orbit, the trail flagged off the plan), the time line, and the ARCP, the hold and the direct track in 2D and 3D (20 Oct 2026).
- [x] The one test kept and extended: the tanker never leaves its hold at the ARCP before IP inbound (20 Oct 2026).
- [ ] Patrick's look, and his ruling on the turn after take-off (his 6 Oct rule against Dad's direct turn); Dad or Patrick sees it in the app.

## Step 8. The anthem flyover (approved: Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))
Dad, 17 Oct 2026: "on the stadium flyover it would be nice for the user to hit national anthem starts playing...and the the aircraft gets its self over the target by national anthem completion (us or Canada as options)".
- [x] Written down first: spec "The anthem flyover", RS-24 and RS-25, RS-R16 (17 Oct 2026).
- [x] The anthem choice and Anthem starts button on the flyover; planned and live timing by the existing solver (RS-24) (V2.506).
- [x] The tune in the browser (RS-25), the card's lead line and the time line marks (V2.506). The one test unchanged (the solvers fly every existing pass exactly as before).
- [ ] Dad or Patrick checks O Canada's melody by ear (written from memory beyond its first line).

## Step 8b. The live anthem press cuts track and sets the run-in speed (within Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))
Dad, 17 Oct 2026: "adjusts speed on run in and cuts track".
- [x] Written down first: spec, RS-26 and RS-27, RS-R17 (17 Oct 2026).
- [x] The cut, the speed worked out, the pick, the card and the views (V2.507).

## Step 8c. Dad's two asks on V2.507 (within Patrick's yes (relayed by Dad, 17 Oct 2026: 'pat says build'))
Dad, 17 Oct 2026: "as well as the cutting of ground track the aircraft increase bank or g or turn towards the inbound line and skip the IP"; and, with a picture of ∞, "can the figure 8 be more like this".
- [x] Written down first: RS-11 and RS-26 amended, the spec (17 Oct 2026).
- [x] The cut at 60° bank onto an intercept of the run-in line, skipping the IP, never a loop; the card's words (V2.508).
- [x] The figure 8 as an infinity sign, its legs crossing at the IP; time over target by the last loop as before (V2.508).
- [ ] Dad or Patrick looks at both in the app.

## Step 9. Stadium crowd, field and fireworks (3D polish built ahead of Patrick's yes: Dad, 17 Oct 2026, chose "Build it now, flagged" after being told the rule book says no more 3D polish in a module still being built)
Dad, 17 Oct 2026: "can you include fireworks at the stadium at the end of the song, just for a better visual confirmation. as well as people in the seats with rows, and a football field marking with the goal posts".
- [x] Written down first: spec "Change: the stadium's crowd, field and fireworks", RS-28 (proposed, built ahead of Patrick's yes) (17 Oct 2026).
- [x] The Stadium bowl only: stepped stands with the seated crowd in rows (one instanced mesh), the football field with its lines, end zones and goal posts (Canadian for O Canada and when no anthem, US for the Star-Spangled Banner), and fireworks over the stadium from the anthem's last note, driven only by playback time; a Display switch "Stadium crowd, field and fireworks" (default on) (`stadium-scene.js`). Nothing about the flying, the time line, the card or the other targets changes. No new test (the rule book: no new 3D tests in a module still being built).
- [ ] Patrick's yes on RS-28 (or his word to take it out); Dad or Patrick sees it in the app.
## Step 8d. Dad's paint ask (proposed, built ahead of Patrick's yes (Dad, 17 Oct 2026))
Dad, 17 Oct 2026: "Can we make a paint scheme for USAF and USN".
- [x] Written down: spec, RS-29, RS-R18 and ALL-45 (17 Oct 2026).
- [x] The USAF and USN paints in the shared model, and the Paint choice in the Display box (RS-29).
- [x] Dad's follow-up (17 Oct 2026, "the usaf and usn need the wing tip triangle ref"): the wing-tip triangle on both paints and "USAF" under the left wing; corrected the same day (Dad: "White on top blue on bottom"): the USAF's upper surfaces stay white (ALL-45).
- [ ] Patrick's yes on ALL-45 and RS-29.
- [ ] Dad or Patrick looks at both paints in the app (Chase and Side cameras, and in Turn Fight's Paint).

## Not in this plan

Live weapons, real-world target data, threats, formation runs, the user flying by hand and winds aloft from the models (`future.md`). For air refuelling: contact and fuel transfer, a boom tanker, a real receiver model, fuel planning and the en-route rendezvous.
