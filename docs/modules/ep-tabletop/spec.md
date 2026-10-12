# EP Tabletop: spec

Dad's ask (12 Oct 2026), Patrick approved as a new module (relayed by Dad; ALL-34). Source for the method: AETCMAN 11-248 (13 Aug 2025) para 1.19 to 1.20.3.7 and Fig 1.4, p.29 to 31, cited by paragraph only. **Waiting on Patrick's approval; nothing is built until he approves it.**

## What it is for

The purpose of tabletop and standup EPs is to expose student pilots to as many emergencies as possible on the ground, and the standup version adds the pressure of being watched (para 1.20.1). The objective is to use knowledge and resources to make and carry out a plan that gets the aircraft safely on the ground (para 1.20.2). This module gives the instructor the aircraft (Patrick's CT-156 cockpit and its instruments) and a way to run the emergency without the student seeing behind the scenes.

## The two screens

Picture: `screen-mockup.png` in this folder (a mock-up, not the built screen; the cockpit is today's CT-156 model). V6 had no such screen.

- **Student's screen** (a laptop or the big screen in the briefing room): the CT-156 front cockpit from the shared cockpit model (ui-kit `ct156-cockpit.js`, ALL-31 to ALL-33), its instruments showing what the scenario and the instructor say, the outside view (the shared 3D sky, terrain and airfield), and the **step track** down one side. Nothing about the script, what comes next, or how it ends ever shows here (EP-R3).
- **Instructor's console** (the instructor's phone, opened by scanning the QR code the student's screen shows at the start; EP-Q1, EP-Q2): the scenario, its planned developments, pause and resume, every indication to change, the student's questions to answer, the step marks and notes. Until the phone link is built, and whenever it isn't wanted, the same console opens on the student's screen behind an **Instructor** switch.

## The step track (EP-R2)

A-A-B-C-D-E-F, as Fig 1.4 draws it, with the current step lit:

| Step | What the student does (own words, para cited) | What the instructor can do |
|---|---|---|
| **A** Aircraft control | Say how stick, rudder and PCL hold heading, altitude and airspeed; in formation, call knock it off and take the lead (1.20.3.1) | Mark it; show the aircraft's state settling (or not) |
| **A** Analyse | Time stands still (1.20.3.2.1). Ask about the aircraft, one item at a time, "methodically and pertinently"; FEVER for engine problems (1.20.3.2.2); TCCC if an engine problem is likely (1.20.3.2.3); say "I have analysed the situation as ____" | Reveal each indication asked for (it appears on the panel); turn the FEVER and TCCC prompts on; answer "not relevant" to wasted checks (1.20.3.2.1.1); send back to A |
| **B** Boldface | Time resumes. Say each boldface step aloud and how it's done, then check whether it worked and whether another boldface applies (1.20.3.3) | Mark each step said; change the indications to show the result (fuel flow to zero, fire light out or not); loop back to A or Analyse |
| **C** Checklists | Cleanup items and other checklists, saying how the controls compensate; then the in-flight guide (1.20.3.4) | Mark; loop back to A |
| **D** Declare | Nature, fuel in hours and minutes, souls on board, plan, pattern and how the aircraft stops, time to landing (1.20.3.5) | The student's answers go in boxes; the instructor plays ATC, SOF or RSU and asks |
| **E** Egress/ejection | Review ground egress and controlled ejection; set the point to eject if it gets worse (1.20.3.6) | Mark |
| **F** Follow the plan | Chair-fly the descent, arrival and pattern to a safe landing and out of the aircraft (1.20.3.7) | Mark; later, open the Traffic sim on the chosen pattern (future) |

**Never shown, stored or shipped:** boldface text, checklist text, performance charts (rule book). The boxes for B and C hold only the instructor's ticks and notes, never the steps' words (EP-R7).

## Scenarios

A scenario is: the start (phase of flight: take-off and departure, area/contact, formation, low level, instruments or pattern; altitude, airspeed, heading, position from home field, weather, fuel), and a list of **developments**, each a set of indication changes that happens at a time, at a step, or when the instructor taps it.

**Indications the instructor can set** (the panel draws them live): torque, N1, Np, ITT, fuel flow, oil pressure and temperature, fuel quantity, volts and amps, hydraulic pressure, the warning and caution lights, the fire light, gear and flap indications, attitude, heading, altitude and airspeed; outside cues the student can ask for (smoke, flames, oil on the windscreen, roughness, noises) shown as words when revealed. Each shipped number comes from the open-source baseline (ALL-30, `docs/references/open-source-performance-baseline.md`) or is marked an estimate; the instructor can type any value (EP-Q3).

**Example scenarios** (working answer to EP-Q3: indications only, no checklist text): engine roughness with fluctuating fuel flow in the area; chip light; oil pressure dropping on departure; generator failure (volts and amps); fire light on climb-out. Instructors write and save their own (a file on their device; nothing leaves it).

## Pause and live changes (EP-R4, EP-R5)

- **Pause** freezes the student's screen ("time stands still"): the aircraft, the clocks and the planned developments stop. The step track says "Time stands still".
- While paused, or while running, the instructor can change any indication, move a development earlier or later, add one, or send the student back to Aircraft control or Analyse. The student's screen updates only when the instructor taps **Apply** (or at once if the instructor prefers), so the student never sees a change half-made.
- **Resume** restarts time.

## Debrief log (EP-R9)

Every step with its clock time, each question asked and answer revealed, each pause, each change the instructor made, each mark and note. Shown to both at the end, and saved as a file the instructor keeps. No names are needed; a callsign or initials if the instructor wants.

## The phone link (EP-Q1, EP-Q2) and when it fails (EP-R10)

Working answer (waits on Patrick): the student's screen shows a QR code with a one-time session code; the instructor scans it and the console opens on the phone. The two talk directly (WebRTC, built into browsers, no install), with two short hand-shake messages passed through our own Netlify relay; when the direct link can't be made, the phone posts the state to the relay and the student's screen reads it about once a second. The session code expires when the session ends; the relay keeps nothing after that. The relay's allowed origin stays the site's own (rule book, never "allow all"). Untrusted input: everything arriving over the link is treated as untrusted data (rule book).

- **Link drops:** the student's screen keeps the last state, shows "Instructor link lost" and waits; the phone can rescan the same code. The log keeps everything up to the drop.
- **No network:** the console opens on the student's screen behind the **Instructor** switch (one-screen mode); everything else works.

## What the module uses (no second copies)

The CT-156 cockpit and its live instruments (ui-kit, ALL-31 to ALL-33; the engine displays become live, an additive change shared with the other sims), the shared sky, terrain and airfields (ui-kit, core), the version label and settings (shell). No flight maths of its own in the first version: the aircraft holds the state the scenario gives it.
