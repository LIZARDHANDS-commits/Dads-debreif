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
- [ ] Module folder, home card and README; the one screen (Setup, the 3D view with the plan view, the result column, the bar).
- [ ] The target shapes on the shared terrain and satellite ground at a tapped place; the cameras.

## Step 3. The flying
- [ ] The pilot from core pieces on the shared point mass (RS-4): orbit, IP and run-in (flat and dive), escape; the wind's crab; the orbit exit timed for the time over target (RS-8).
- [ ] Flags on the card for the references and for a pass that can't be made (RS-6).

## Step 4. The three run types
- [ ] The worked-out numbers for each run (RS-9) and the hand override under More. Flyover timing; the practice-bomb pass with the CARP and the miss; the cargo offload from the C-130J (RS-Q1). `drop.js`'s CARP takes a dive release (RS-5).
- [ ] The planning wind under More (RS-7).

## Step 5. One light test
- [ ] A flat pass in still air, released at the CARP, puts the bomb on the aim point and the escape stays above the ground (`testing.md`).

## Step 6. Sign-off
- [ ] Run the checklist in `testing.md` and send Patrick the result.

## Not in this plan

Live weapons, real-world target data, threats, formation runs, the user flying by hand and winds aloft from the models (`future.md`).
