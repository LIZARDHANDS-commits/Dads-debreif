# Run-in Simulator: requirements (RS-R)

Each line is in Dad's words where he gave them, with how it is checked. Source: Dad, 16 Oct 2026 (his message and his three card answers); Patrick approved the plan (relayed by Dad, 16 Oct 2026). Approved with the spec by Patrick (relayed by Dad, 16 Oct 2026).

| ID | Requirement | How it is checked |
|---|---|---|
| RS-R1 | "The target can be a stadium, a bridge, mountains etc in a 3d enviroment": generic target shapes placed anywhere on the real terrain and satellite ground (Dad's card: "Generic shapes on real terrain"). | Checklist: place each shape at Moose Jaw and in a mountain valley; the ground round it is the real ground. |
| RS-R2 | "The user should see an orbit and a run in": the orbit, the IP, the run-in (and the dive line), the release and the escape are drawn in 3D and in the plan view, and the aircraft flies them. | Checklist, from the default start. |
| RS-R3 | "Be able to set those parameters along with speed alt winds": orbit, run-in, release and escape settings, speeds (KIAS), heights and wind at two heights, each with a default. | Checklist: change each box and fly again; the pass changes the way a pilot would expect. |
| RS-R4 | "To see how the flyover, inert bomb drop, DZ offload will go": the three run types on one engine (Dad's card: "All three, one engine"), with the result in pilot terms: time over target, the miss in feet and clock from the aim point, the release against the CARP. | The one light test (testing.md) and the checklist. |
| RS-R5 | "Diving drop or flat": the practice bomb pass can be flat or a dive at a set angle from a set roll-in height. | Checklist: fly both; the dive's release point sits on the dive line. |
| RS-R6 | "As well as the escape manuver": the escape (direction, G, bank, heading change, climb) is flown and judged: the lowest height above the ground, the closest distance to the target and the peak G, each flagged against its reference, never a wall. | The one light test (the escape stays above the ground) and the checklist. |
| RS-R7 | Auto-flown to the user's settings (Dad's card: "Auto-flown, you set it") by the shared flight model, so bank, G and energy are the aircraft's. | Code review: the flying uses core's point mass and performance set, no second formula. |
| RS-R8 | Training only: inert loads, generic shapes, no real-world target data, "Training only" on screen. | Code review and the checklist. |
| RS-R9 | "The user should sset a few parameters the then the computer sets the offset or whatever variable needs adjusting to hit" (Patrick, relayed by Dad, 16 Oct 2026): for each run the user sets a few essentials and the computer works out the release point, the aim-off, the roll-in and the timing so the pass hits. | The one light test (released at the worked-out point, the bomb lands on the aim point) and the checklist. |
