# EP Tabletop (emergency procedures tabletop simulator)

This folder is the emergency procedures tabletop: an instructor runs a practice emergency on a student in the CT-156 cockpit, step by step through A-A-B-C-D-E-F, pausing, changing what the aircraft shows and sending the student back to re-analyse. Start here, then read only the file you need.

## Where it stands

**Spec written, waiting on Patrick's approval of the spec; no code yet.** Dad's ask, 12 Oct 2026; Patrick approved it as a new module (relayed by Dad the same day; ALL-34). The rule book says a module's building starts once its spec is approved, so the spec and the first questions are on the waiting list in `../../PLAN.md`.

## What is next

1. Patrick approves `spec.md` and answers EP-Q1 (how the instructor's phone links to the student's screen).
2. Then `plan.md` Step 1 onward.

## The files

| File | What it holds |
|---|---|
| `spec.md` | How the module works: screens, the instructor's controls, the A-A-B-C-D-E-F track, scenarios, what happens when the link fails |
| `requirements.md` | What the module must do, in Dad's and Patrick's words, with how each is checked |
| `decisions.md` | Decisions in force (EP-) and those waiting on a question |
| `testing.md` | This module's testing rules and its sign-off checklist |
| `plan.md` | The ordered steps and checkboxes; the last step is the sign-off |
| `future.md` | Ideas not being built until Patrick moves them up |

## Open questions

Each has a working answer the spec uses until it is settled. Also on the waiting list in `../../PLAN.md`.

| ID | Question | Options | Working answer |
|---|---|---|---|
| EP-Q1 | How does the instructor's phone link to the student's screen (Dad: the IP scans a QR code so the student never sees the setup, the end result or the changes made during pauses)? | (a) Direct link phone to screen (WebRTC, built into every browser), with two short hand-shake messages passed through our own relay; (b) the phone posts the scenario's state to our relay and the student's screen reads it about once a second; (c) a hosted real-time service (a new outside service); (d) your own idea | (a), falling back to (b) when the direct link can't be made (some networks block it). Both need a small addition to the Netlify relay; (b) needs storage on the relay (Netlify Blobs, a new library: needs your yes). Until it's built, the instructor's console can open on the same screen behind a "Instructor" switch. |
| EP-Q2 | The QR code itself: draw it with our own small QR encoder (no new library), or add a QR library? | (a) our own encoder; (b) a library (needs your yes); (c) your idea | (a) |
| EP-Q3 | What the shipped example scenarios contain, given that boldface, checklists and performance charts are never shipped (rule book) | (a) Only the aircraft's indications (gauges, lights, sounds, visual cues), with each number sourced from the open-source baseline (ALL-30) or marked an estimate, and no checklist text; (b) no example scenarios, instructors write their own; (c) your idea | (a) |
