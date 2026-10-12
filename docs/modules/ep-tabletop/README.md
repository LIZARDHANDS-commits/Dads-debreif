# EP Tabletop (emergency procedures tabletop simulator)

This folder is the emergency procedures tabletop: an instructor runs a practice emergency on a student in the CT-156 cockpit, step by step through A-A-B-C-D-E-F, pausing, changing what the aircraft shows and sending the student back to re-analyse. Start here, then read only the file you need.

## Where it stands

**Step 1, the one-screen tabletop, built in V2.365 (branch `claude/ep-tabletop-spec`); not yet seen by Patrick or Dad in the app.** Patrick approved the spec (relayed by Dad, 12 Oct 2026: "pat approved, start building the one screen version and use the moose jaw 3d environment"). Open EP Tabletop from the home screen: the student's CT-156 cockpit over Moose Jaw with the step track; the Instructor switch opens the console. Build choices EP-4 to EP-7 wait for Patrick's wording. The code is in `src/modules/ep-tabletop/`.

## What is next

1. Patrick or Dad runs "Engine roughness in the area" on the one screen and says what to change.
2. Patrick answers EP-Q1 (how the instructor's phone links to the student's screen) before Step 2.
3. The proposal below (Traffic's Moose Jaw buildings in a shared home), if Patrick wants it.

## Proposal for Patrick: Traffic's Moose Jaw world in a shared home (EP-7)

The EP Tabletop's Moose Jaw is the shared terrain, satellite picture and runways; Traffic's buildings, landmarks, runway paint, furniture and roads are not in it. Moving them to a shared home (for example `src/ui-kit/cymj-world/`) as plain file moves wasn't possible without changing Traffic:
- The builders read Traffic's own numbers from `src/modules/traffic/airfield.js` (the runway heading, the threshold elevation), which also holds Traffic's flight numbers (flare, PFL keys), so that file would have to be split.
- The world is put together inside Traffic's `view3d.js` scene kit, mixed with Traffic's own layers (its photo tiers, ground heights draping the landmarks, roads and shadows), so a shared entry both could call means rewriting part of Traffic's 3D view.
- The scripts that make some of those files (`tools/airfield/`, `tools/blender/`, `tools/osm/`) write into Traffic's folder.

Options: (a) a separate piece of work that splits `airfield.js`, moves the builders and their tools, and gives Traffic and the EP Tabletop one `createMooseJawWorld`, checked by before-and-after pictures of Traffic; (b) keep it as it is (the EP Tabletop's Moose Jaw has no buildings); (c) your idea. Recommendation: (b) for now, since from 8,000 ft in the area the buildings barely show, and (a) when the Traffic sim is next quiet.

## The files

| File | What it holds |
|---|---|
| `spec.md` | How the module works: screens, the instructor's controls, the A-A-B-C-D-E-F track, scenarios, what happens when the link fails |
| `requirements.md` | What the module must do, in Dad's and Patrick's words, with how each is checked |
| `decisions.md` | Decisions in force (EP-) and those waiting on a question |
| `testing.md` | This module's testing rules and its sign-off checklist |
| `plan.md` | The ordered steps and checkboxes; the last step is the sign-off |
| `future.md` | Ideas not being built until Patrick moves them up |
| `../../../src/modules/ep-tabletop/` | The code, with its own short README |

## Open questions

Each has a working answer the spec uses until it is settled. Also on the waiting list in `../../PLAN.md`.

| ID | Question | Options | Working answer |
|---|---|---|---|
| EP-Q1 | How does the instructor's phone link to the student's screen (Dad: the IP scans a QR code so the student never sees the setup, the end result or the changes made during pauses)? | (a) Direct link phone to screen (WebRTC, built into every browser), with two short hand-shake messages passed through our own relay; (b) the phone posts the scenario's state to our relay and the student's screen reads it about once a second; (c) a hosted real-time service (a new outside service); (d) your own idea | (a), falling back to (b) when the direct link can't be made (some networks block it). Both need a small addition to the Netlify relay; (b) needs storage on the relay (Netlify Blobs, a new library: needs your yes). Until it's built, the instructor's console can open on the same screen behind a "Instructor" switch. |
| EP-Q2 | The QR code itself: draw it with our own small QR encoder (no new library), or add a QR library? | (a) our own encoder; (b) a library (needs your yes); (c) your idea | (a) |
| EP-Q3 | What the shipped example scenarios contain, given that boldface, checklists and performance charts are never shipped (rule book) | (a) Only the aircraft's indications (gauges, lights, sounds, visual cues), with each number sourced from the open-source baseline (ALL-30) or marked an estimate, and no checklist text; (b) no example scenarios, instructors write their own; (c) your idea | (a) |
