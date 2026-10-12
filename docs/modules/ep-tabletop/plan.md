# EP Tabletop: plan

Only what is here gets built. Patrick approved `spec.md` and EP-1 to EP-3 (relayed by Dad, 12 Oct 2026), and Step 2 with the relay mailbox for EP-Q1 (relayed by Dad, 12 Oct 2026: "pat approved, start step 2 with the QR phone link").

## Step 0. Spec approved
- [x] Patrick approves `spec.md` and the wording of EP-1 to EP-3 (relayed by Dad, 12 Oct 2026: "pat approved, start building the one screen version and use the moose jaw 3d environment"). EP-Q1 (the phone link) is still open and is needed only for Step 2; EP-Q2 and EP-Q3 use their working answers until he says otherwise.

## Step 1. One-screen tabletop
- [x] Module folder, home card and README; the student screen with the shared CT-156 cockpit and the step track; the instructor console behind an Instructor switch (one-screen mode). Outside: the Moose Jaw 3D environment (EP-7).
- [x] Scenario engine: start state, developments by time, step or tap; pause ("time stands still"), apply, resume; reveal-on-ask indications; send back to A or Analyse. Its one test (testing.md).
- [x] The cockpit's engine and systems displays drawn live from the scenario (additive change in the shared cockpit; the other sims keep their static displays until they ask) (EP-4).
- Built in V2.369, with the one example scenario and the Declare boxes (brought forward from Step 3 by the thread's brief). Not yet seen by Patrick or Dad in the app.

## Step 2. The instructor's phone
- [x] QR code on the student's screen, the console on the phone, the link as EP-Q1 settles; "Instructor link lost" handling (EP-R10).
- Built in V2.404, not yet seen: the relay mailbox (EP-8 to EP-10), our own QR encoder (EP-Q2), the phone as the master sending only the student view, and its one test. The relay's `/ep-link` is live (deployed 12 Oct 2026); a real phone camera, iOS Safari and mobile networks are untried.

## Step 3. Systems model: faults drive the gauges, the gauges drive the lights (`systems-plan.md` Phase 1)
- [x] `systems.js`: the instructor sets causes (oil leak, chip, fuel imbalance, fire, generator, roughness, engine failure); gauges follow by time and severity; lights follow by thresholds; the instructor's typed values still win (EP-11). The console split into sections with a Faults section; `index.js` split into screen and phone. A second example, "Oil pressure dropping on departure". Thresholds without a page show "(estimate)" (EP-Q10 working answer).
- Built in V2.404, not yet seen by Patrick or Dad in the app. Every rate and threshold is an estimate, flagged "(estimate)" on the console. Its one test: `tests/unit/ep-tabletop/systems.test.js`.

## Step 4. Lights that flicker and the visual cues (Phase 2)
- [x] Flicker, a small cockpit shake, smoke haze and fire glow as overlays, cue words per fault, all applied by the instructor and only then seen by the student (EP-12). No 3D cues (future list). Built, not yet seen by Patrick or Dad in the app. Cue controls are a Cues section on the console; new causes "Smoke or fumes" and "Generator flickering". Every cue number is a picture choice (see the code README).

## Step 5. The aircraft flies the student's picks (Phase 3a)
- [ ] The shared point mass flies each pick (EP-13); the engine-out case and Traffic's glide footprint move to core, no second copy. Waits on EP-Q5 (the flight approach).

## Step 6. The student's decision list and plan map (Phase 3b)
- [ ] Plain manoeuvre words only, nothing marked right or wrong; a small map with the glide ring and the line to the field, so a wrong choice is seen going off the rails (EP-14).

## Step 7. Timeline, rewind, better and worse (Phase 4)
- [ ] Snapshots, rewind to any moment without leaking the setup, severity dial with Better / Worse / Hold, "student identified it", developments on a pick (EP-15).

## Step 8. The student's picks reach the phone (Phase 5)
- [ ] A second relay mailbox in the QR address, same key, no relay code change; picks cleaned as untrusted on the phone (EP-16).

## Step 9. Scenarios and log
- [ ] The example scenarios (EP-Q3), save and load of the instructor's own, Declare boxes, the debrief log and its file.

## Step 10. Sign-off
- [ ] Run the checklist in `testing.md` and send Patrick the result.
