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

## Step 7. Air refuelling: the point-parallel rendezvous (proposed, built ahead of Patrick's yes)
Dad, 17 Oct 2026: "can we also add in the airrefueling... to the run in sim"; his picks: the rendezvous first, the point-parallel, the CT-156 as a stand-in receiver. **Built ahead of Patrick's yes: Dad chose "Build anyway" (17 Oct 2026) after being told the plan waits on Patrick.** Plan: [air-refuelling-plan.md](air-refuelling-plan.md) Steps 1 to 3; Step 4 (the en-route rendezvous) stays on `future.md`.
- [x] Written down first: `spec.md` "Air refuelling" with its screen picture (`air-refuelling-screen.png`), RS-15 to RS-18 (proposed), RS-R10 to RS-R13, `testing.md`'s one test (17 Oct 2026).
- [x] The tanker: the KC-130J from the C-130J model with its two wing-pod drogues, flying its anchor at a set height and true airspeed, a picture with no performance set (RS-15) (V2.503).
- [x] The point-parallel worked out to hit (RS-16) and the join to pre-contact behind the left drogue (RS-17); the card, the two new cameras and the 2D plan and profile with both tracks (RS-18) (V2.503).
- [x] One light test: in still air from the defaults the receiver ends at pre-contact behind the tanker, never ahead of its wing line, and the tanker never below its height (`tests/unit/run-in-sim/refuel.test.js`, V2.503).
- [ ] Patrick's yes on RS-15 to RS-18, and numbers or a manual page (ATP-56) for the estimates.
- [ ] Dad or Patrick sees it in the app; the sign-off checklist in Dad's and Patrick's words (air-refuelling-plan.md Step 5).

## Not in this plan

Live weapons, real-world target data, threats, formation runs, the user flying by hand and winds aloft from the models (`future.md`). For air refuelling: contact and fuel transfer, a boom tanker, a real receiver model, fuel planning and the en-route rendezvous.
