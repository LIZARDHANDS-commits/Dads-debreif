# EP Tabletop (emergency procedures tabletop simulator)

This folder is the emergency procedures tabletop: an instructor runs a practice emergency on a student in the CT-156 cockpit, step by step through A-A-B-C-D-E-F, pausing, changing what the aircraft shows and sending the student back to re-analyse. Start here, then read only the file you need.

## Where it stands

**Step 2, the instructor's phone, built in V2.383; Step 1, the one-screen tabletop, built in V2.369; neither yet seen by Patrick or Dad in the app.** Step 2: the student's screen's "Instructor's phone" button shows a QR code; the phone opens the console, runs the scenario and sends only the student view through the relay's new `/ep-link` mailbox (EP-8 to EP-10). The relay needs Dad's redeploy before the phone link works on the live site; until then the screen says "Can't reach the relay" and the Instructor switch works as before. Patrick approved the spec (relayed by Dad, 12 Oct 2026: "pat approved, start building the one screen version and use the moose jaw 3d environment"). Open EP Tabletop from the home screen: the student's CT-156 cockpit over Moose Jaw with the step track; the Instructor switch opens the console. Build choices EP-4 to EP-7 wait for Patrick's wording. The code is in `src/modules/ep-tabletop/`.

## What is next

1. Patrick or Dad runs "Engine roughness in the area" with a phone scanning the code, and on the one screen, and says what to change.
2. Patrick answers EP-Q4 (the direct link and its STUN server) when he wants to.
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
| `../../../relay/ep-link.js` | The relay's phone link mailbox (`/ep-link`), with its section in `relay/README.md` |

## Open questions

Each has a working answer the spec uses until it is settled. Also on the waiting list in `../../PLAN.md`.

| ID | Question | Options | Working answer |
|---|---|---|---|
| EP-Q1 | How does the instructor's phone link to the student's screen? | **Answered** (Patrick, relayed by Dad, 12 Oct 2026): (b), the phone posts the student view to our relay and the student's screen reads it about once a second, with Netlify Blobs on the relay. Built in V2.383 (EP-8 to EP-10). | (b) |
| EP-Q4 | Should we add the direct link, (a) WebRTC phone straight to screen, which needs a public STUN server (a new outside service) to find a way between the two networks? | (a) add it, with the relay mailbox as the fallback when it can't be made; (b) keep the relay mailbox only; (c) your idea | (b): the mailbox only, until it has been tried in the briefing room |
| EP-Q2 | The QR code itself: draw it with our own small QR encoder (no new library), or add a QR library? | (a) our own encoder; (b) a library (needs your yes); (c) your idea | (a) |
| EP-Q3 | What the shipped example scenarios contain, given that boldface, checklists and performance charts are never shipped (rule book) | (a) Only the aircraft's indications (gauges, lights, sounds, visual cues), with each number sourced from the open-source baseline (ALL-30) or marked an estimate, and no checklist text; (b) no example scenarios, instructors write their own; (c) your idea | (a) |
