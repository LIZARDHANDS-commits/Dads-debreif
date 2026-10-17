# Dad's Items Waiting on Patrick (`docs/dad/waiting-on-patrick.md`)

> **Single-Writer Rule:** Only Dad's Claude edits this file. Each item has a working answer in the tool that stays in effect until Patrick replies. When Patrick answers, he records his ruling in [../pat/bulletin-for-dad.md](../pat/bulletin-for-dad.md) (or the module's `decisions.md`), and Dad's Claude ticks it off here on the next sync.

## Run-In Simulator & Advanced Mission Sets

- [ ] **Run-in Simulator questions (spec approved, relayed by Dad, 16 Oct 2026; [README](../modules/run-in-sim/README.md)):** RS-Q1 how the C-130J flies (working answer: its own performance set from public numbers, every number an estimate; its numbers table comes to Patrick before it flies), RS-Q2 the defaults, RS-Q3 the escape references, RS-Q4 the starting places. Each has a working answer.
- [ ] **Run-in Simulator: air refuelling & live anthem flyover (`V2.507` / `V2.512`, merged in `#1064` & `#1067`; [plan](../modules/run-in-sim/air-refuelling-plan.md)).** Point-parallel rendezvous with a KC-130J tanker on an anchor, plus the live anthem flyover with the 60° bank cut skipping the IP and the infinity-sign figure 8 (`RS-10` to `RS-27`). Live on `main` for Patrick and Dad to fly on screen.
- [ ] **Run-in Simulator: look in the app (`V2.502`, merged in `#1062`).** Flyover, Practice bomb flat and dive with the CT-156, built and live on `main`; the sign-off checklist is in [testing.md](../modules/run-in-sim/testing.md). The cargo offload waits for RS-Q1.

## Debrief & Shared 3D Aircraft

- [ ] **Large exercises, up to 16 ships: look in the app (`V2.501`, merged in `#1054`; Debrief plan Step 3c items 1 to 5, `DB-37`, [exercise-plan.md](../modules/debrief/exercise-plan.md)).** Debrief, Load tracks, pick 5 to 16 files: each file has a Flight and a Ship (four to a flight at first), and under "More" each flight's call sign and aircraft (Harvard, T-38A or C-130J). Working answers to confirm: (1) a flight has one to four ships; (2) no closest-approach readout between flights for now (on `future.md`); (3) call signs "Flight 1" to "Flight 4" until typed; (4) the tennis ball stays in Flight 1; (5) each flight's altitude check keeps that flight's own mean height.
- [ ] **Simulated CARP drop (`V2.500`, merged in `#1052`; `DB-36`, [drop-plan.md](../modules/debrief/drop-plan.md))** and **3D satellite ground tiles (`V2.508`, merged in `#1046`; `DB-34`)** and **airborne start altitude (`V2.511`, merged in `#1042`; `DB-28`):** merged and live on `main` to check on screen.
- [ ] **CT-102B Astra II model: its height, and where its files live (`#1020` & `#1038` merged; [ct102-astra-plan.md](../modules/shared/ct102-astra-plan.md), plan Step 3c).** Build script and sources table live in `tools/blender/ct102b/`; say if Patrick wants them moved next to the CT-156 under `ALL-38`. One number to rule on: its height, 2.64 m (EASA and UK CAA type sheets) against 2.7 m (RCAF page and Wikipedia) and 2.62 m (Grob); the model uses 2.64 m.
- [ ] **C-130J Super Hercules model: look in the app (`V2.499`, merged in `#1050`; [c130j-plan.md](../modules/shared/c130j-plan.md), plan Step 3e, `DB-35`).** Three things to rule on in `tools/blender/c130j/sources.md`: (1) wing rising toward the tips (~2.3° on C1) per the drawings; (2) height 38 ft 9 in; (3) black walkway patches beside each nacelle on top of the wings, and black leading edges on the fin and tailplane.
- [ ] **T-38A Talon model and rough cockpit: look in the app (`V2.497`, merged in `#1041`; [t38a-plan.md](../modules/shared/t38a-plan.md), `DB-32`/`DB-33`).** Merged and live on `main`.
- [ ] **Debrief: the wheel height under the reference point (Dad, 12 Oct 2026; `DB-31`).** Working answer: keep 6.2 ft until the height from the wheels' ground line to the spinner's axis is measured.

## EP Tabletop

- [ ] **EP Tabletop (`V2.509` & `V2.510`, merged in `#946` & `#1048`; [modules/ep-tabletop/](../modules/ep-tabletop/)):** Instructor's phone by QR, faults driving gauges and lights, Any setup, freeze at any point, attitude ball, and flying the student's steps are merged and live on `main` to check on screen.
- [ ] **EP-Q1, how the instructor's phone links to the student's screen:** Working answer (a) direct WebRTC link with relay handshake, falling back to (b) relay state polling; EP-Q2 (in-repo QR encoder) and EP-Q3 (indications only) use their working answers.

## SOF Weather Desk & Whole-Tool Ideas

- [ ] **SOF 3D MRMS radar heights (`V2.495`, merged in `#1039`) & NOAA 3D lightning strikes (`V2.496`, merged in `#1045`):** Merged and live on `main` to check on screen.
- [ ] **Offline cache and the US airspace files (Dad's session, 8 Oct; `SOF-53`):** `tools/service-worker.mjs` keeps every built file for offline use, so first visits fetch all eight airspace files (~525 KB gzipped) in the background. Working answer: left as is.
- [ ] **SOF divert aid fuel numbers (Dad decides, `SOF-47`):** Planning fuel burn and reserve for the recall and divert aid. Working answer: shows distance, bearing and time, and fuel as "needs Patrick's numbers".
- [ ] **SOF low-level traffic source (Dad decides, `SOF-47`):** Working answer (c), the relay merges `adsb.lol` and `adsb.fi`.
- [ ] **SOF 3D model clouds, stale limit and "low" ceiling (`SOF-45`, `SOF-46`):** Working answer: as built.
- [ ] **Dad's whole-tool ideas (8 Oct 2026; [FUTURE.md](../FUTURE.md)):** (1) confirm About Us co-founder blurb wording (`ALL-29`); (2) a new name for the tool that works for both; (3) AFMAN 11-248 (USAF T-6) as an option throughout, beside the RCAF references.
