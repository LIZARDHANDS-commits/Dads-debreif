# EP Tabletop: spec

Dad's ask (12 Oct 2026), Patrick approved as a new module (relayed by Dad; ALL-36). Source for the method: AETCMAN 11-248 (13 Aug 2025) para 1.19 to 1.20.3.7 and Fig 1.4, p.29 to 31, cited by paragraph only. **Approved by Patrick (relayed by Dad, 12 Oct 2026): "start building the one screen version and use the moose jaw 3d environment".**

## What it is for

The purpose of tabletop and standup EPs is to expose student pilots to as many emergencies as possible on the ground, and the standup version adds the pressure of being watched (para 1.20.1). The objective is to use knowledge and resources to make and carry out a plan that gets the aircraft safely on the ground (para 1.20.2). This module gives the instructor the aircraft (Patrick's CT-156 cockpit and its instruments) and a way to run the emergency without the student seeing behind the scenes.

## The two screens

Picture: `screen-mockup.png` in this folder (a mock-up, not the built screen; the cockpit is today's CT-156 model). V6 had no such screen.

- **Student's screen** (a laptop or the big screen in the briefing room): the CT-156 front cockpit from the shared cockpit model (ui-kit `ct156-cockpit.js`, ALL-31 to ALL-33), its instruments showing what the scenario and the instructor say, the outside view (the Moose Jaw 3D environment: the shared terrain, satellite picture, runways and sky round CYMJ, EP-7), and the **step track** down one side, with the situation the student is given at the start and a Revealed list. The view looks along the nose (Boresight); dragging turns the head a little, double-click looks ahead again, Shift zooms (EP-4). Nothing about the script, what comes next, or how it ends ever shows here (EP-R3).
- **Instructor's console** (the instructor's phone, opened by scanning the QR code the student's screen shows when its **Instructor's phone** button is pressed; EP-8, EP-Q2): the scenario, its planned developments, pause and resume, every indication to change, the student's questions to answer, the step marks and notes. Whenever the phone isn't wanted or can't connect, the same console opens on the student's screen behind an **Instructor** switch.

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

**Indications the instructor can set** (the panel draws them live; one not yet revealed shows as the static panel does, needle at rest and dashes, and the flight instruments always show, EP-4): torque, N1, Np, ITT, fuel flow, oil pressure and temperature, fuel quantity, volts and amps, hydraulic pressure, the warning and caution lights, the fire light, gear and flap indications, attitude, heading, altitude and airspeed; outside cues the student can ask for (smoke, flames, oil on the windscreen, roughness, noises) shown as words when revealed. Each shipped number comes from the open-source baseline (ALL-30, `docs/references/open-source-performance-baseline.md`) or is marked an estimate; the instructor can type any value (EP-Q3).

**Example scenarios** (working answer to EP-Q3: indications only, no checklist text): engine roughness with fluctuating fuel flow in the area; chip light; oil pressure dropping on departure; generator failure (volts and amps); fire light on climb-out. Instructors write and save their own (a file on their device; nothing leaves it).

## Pause and live changes (EP-R4, EP-R5)

- **Pause** freezes the student's screen ("time stands still"): the aircraft, the clocks and the planned developments stop. The step track says "Time stands still". Going to Analyse pauses and going to Boldface resumes by itself; the instructor can override either (EP-5).
- While paused, or while running, the instructor can change any indication, move a development earlier or later, add one, or send the student back to Aircraft control or Analyse. The student's screen updates only when the instructor taps **Apply** (or at once if the instructor prefers), so the student never sees a change half-made.
- **Resume** restarts time.

## Debrief log (EP-R9)

Every step with its clock time, each question asked and answer revealed, each pause, each change the instructor made, each mark and note. Shown to both at the end, and saved as a file the instructor keeps. No names are needed; a callsign or initials if the instructor wants.

## The phone link (EP-Q1, EP-Q2) and when it fails (EP-R10)

As built in V2.382 (EP-8 to EP-10; EP-Q1 answered by Patrick, relayed by Dad, 12 Oct 2026: the relay mailbox, option (b)). Not yet seen in the app, and the relay's `/ep-link` waits on Dad's redeploy.

- **The code.** The student's screen has an **Instructor's phone** button. It makes a session id and a key (each 128 random bits) and shows a QR code (our own encoder, `src/ui-kit/qr.js`, EP-Q2) for this page's own address with `#/ep-tabletop?console&s=<session>&k=<key>`. Scanning it opens the instructor's console on the phone, laid out in one column with big buttons. The key is only in the code's address, after the "#", so the page's own server never sees it.
- **Who runs what.** The phone is the master: the scenario runs on it, and it sends only the **student view** (EP-9): the situation given at the start, the step and the steps visited, whether time runs and the clock, the FEVER and TCCC prompts, and the panel's settings for the flight instruments and for what has been revealed. Never the scenario's name or script, the developments to come, edits not yet applied, marks, notes, the Declare answers, the log or the end (EP-2). The one-screen mode draws the student's side from the same function.
- **The mailbox.** The phone PUTs the student view to our Netlify relay (`/ep-link`, the relay's address shared with the SOF, `src/wx/relay.js`) when something the student sees changes, at most twice a second with the latest winning, and again every 4 s; the student's screen GETs it about once a second and runs the clock on between reads. The relay keeps a hash of the key from the first PUT and refuses another key; it keeps each session at most 6 hours, nothing else, and logs nothing about who asked (EP-10). The relay's allowed origins stay the site's own (rule book, never "allow all").
- **Untrusted input.** The student's screen checks everything that arrives: only known fields and indications, numbers kept to their gauges' ranges, words to short plain text, all drawn as text (rule book).
- **The code hides itself** once the phone is connected (its first view arrives); the bar then says "Instructor's phone connected", and the button becomes **Show code again**, so the phone can rescan the same code. **Stop phone link** ends the session on the relay and goes back to one-screen mode. While the phone runs the scenario, the screen's own Instructor switch is greyed out, so the two never disagree.
- **Link drops:** with no fresh view for about 10 s (the phone's network off, the phone asleep, the relay down), the student's screen keeps the last state, says "Instructor link lost — waiting" and carries on reading; when the phone comes back, or rescans the code, it picks up again. The phone says "Can't reach the student's screen" when the relay doesn't answer, and keeps its changes to send when it's back. The phone holds the scenario and its log, so nothing is lost from the log by a drop.
- **No network, or the relay not reached:** the student's screen says "Can't reach the relay" and the console still opens on the student's screen behind the **Instructor** switch (one-screen mode); everything else works.
- **Not built:** the direct link (option (a), WebRTC), which needs a public STUN server, a new outside service (EP-Q4). The link sits behind one small interface so it can be added later. A phone that reloads its page starts the scenario again (it is held in the phone's memory only).

## What the module uses (no second copies)

The CT-156 cockpit and its live instruments (ui-kit, ALL-31 to ALL-33; the engine displays become live, an additive change shared with the other sims), the shared sky, terrain and airfields (ui-kit, core), the version label and settings (shell). No flight maths of its own in the first version: the aircraft holds the state the scenario gives it.
