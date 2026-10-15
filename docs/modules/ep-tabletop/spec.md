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

As built in V2.384 (EP-8 to EP-10; EP-Q1 answered by Patrick, relayed by Dad, 12 Oct 2026: the relay mailbox, option (b)). Not yet seen in the app, and the relay's `/ep-link` waits on Dad's redeploy.

- **The code.** The student's screen has an **Instructor's phone** button. It makes a session id and a key (each 128 random bits) and shows a QR code (our own encoder, `src/ui-kit/qr.js`, EP-Q2) for this page's own address with `#/ep-tabletop?console&s=<session>&k=<key>`. Scanning it opens the instructor's console on the phone, laid out in one column with big buttons. The key is only in the code's address, after the "#", so the page's own server never sees it.
- **Who runs what.** The phone is the master: the scenario runs on it, and it sends only the **student view** (EP-9): the situation given at the start, the step and the steps visited, whether time runs and the clock, the FEVER and TCCC prompts, and the panel's settings for the flight instruments and for what has been revealed. Never the scenario's name or script, the developments to come, edits not yet applied, marks, notes, the Declare answers, the log or the end (EP-2). The one-screen mode draws the student's side from the same function.
- **The mailbox.** The phone PUTs the student view to our Netlify relay (`/ep-link`, the relay's address shared with the SOF, `src/wx/relay.js`) when something the student sees changes, at most twice a second with the latest winning, and again every 4 s; the student's screen GETs it about once a second and runs the clock on between reads. The relay keeps a hash of the key from the first PUT and refuses another key; it keeps each session at most 6 hours, nothing else, and logs nothing about who asked (EP-10). The relay's allowed origins stay the site's own (rule book, never "allow all").
- **Untrusted input.** The student's screen checks everything that arrives: only known fields and indications, numbers kept to their gauges' ranges, words to short plain text, all drawn as text (rule book).
- **The code hides itself** once the phone is connected (its first view arrives); the bar then says "Instructor's phone connected", and the button becomes **Show code again**, so the phone can rescan the same code. **Stop phone link** ends the session on the relay and goes back to one-screen mode. While the phone runs the scenario, the screen's own Instructor switch is greyed out, so the two never disagree.
- **Link drops:** with no fresh view for about 10 s (the phone's network off, the phone asleep, the relay down), the student's screen keeps the last state, says "Instructor link lost — waiting" and carries on reading; when the phone comes back, or rescans the code, it picks up again. The phone says "Can't reach the student's screen" when the relay doesn't answer, and keeps its changes to send when it's back. The phone holds the scenario and its log, so nothing is lost from the log by a drop.
- **No network, or the relay not reached:** the student's screen says "Can't reach the relay" and the console still opens on the student's screen behind the **Instructor** switch (one-screen mode); everything else works.
- **Not built:** the direct link (option (a), WebRTC), which needs a public STUN server, a new outside service (EP-Q4). The link sits behind one small interface so it can be added later. A phone that reloads its page starts the scenario again (it is held in the phone's memory only).

## Faults, cues, the student's picks and rewind (Steps 3 to 8; EP-11 to EP-16)

Dad's asks of 12 Oct 2026, in his words: "certain pressures should trigger a light... certain conditions that an IP can prompt should trigger instruments and visual cues. Student should be able to see their plan as they go, so if they make a wrong choice they see it go off the rails. Instructors can pause, rewind, make things better or worse if the student IDs it or not." The detailed design, with every number's source status, is `systems-plan.md`.

- **Faults (EP-11):** the instructor sets causes with a severity and a trend; the gauges follow; the lights follow from thresholds; typed values still win. Unsourced thresholds and rates show "(estimate)".
- **Cues (EP-12):** words, flicker, a small shake, smoke haze and fire glow overlays, each seen by the student only once applied.
- **Flight (EP-13):** the shared point mass flies each pick (plan Step 5, built on EP-Q5's working answer (a) while it stays open; `systems-plan.md` 4.2). Gear and flaps picks change the configuration; Declare marks D; Eject ends the flight. The ground is the nearest field's elevation: on a runway "landed", anywhere else "touched down off the runway" with where, in words only. A typed altitude, airspeed or heading puts the aircraft there; pitch and bank are flown. In phone mode the student's screen carries the phone's last flight on by dead reckoning between sends (the engine's state, a cause, never reaches it).
- **Decisions and plan (EP-14):** plain manoeuvre words only; a small map with the glide ring and the line to the field; nothing says right or wrong, the consequences show it.
- **Rewind, better and worse (EP-15):** rewind to any moment shows the student only what they saw then; Better / Worse / Hold by the instructor's hand.
- **Picks to the phone (EP-16):** a second relay mailbox; picks are untrusted.
- **When data fails:** a fault rate or threshold with no source runs as its estimate, flagged; a pick that fails the phone's check is dropped and the console says so; picks not reaching the phone show "Picks not reaching the instructor" on the student's screen and are kept to send.

## Any setup: freeze at any point of a manoeuvre (Step 5b; EP-17 to EP-19, EP-R11)

Dad, 15 Oct 2026: "I should be able to make any setup...basically any point in a manuver... the instructor should have a way to move to that next end point or Enter a spin, or just continue the current attitude and power setting if the studnet does nothing then can repause as the situtaiton develops"; and on the end points: "if the student describes it wrong, we should see the outcome. or if he says it right we should see a flying outcome...it could be anything really... we should be able to input that roughy...then output a new location and aircraft parameters". Dad's answers to the six questions are in `future.md`; Patrick approved (relayed by Dad, 15 Oct 2026: "pat approved"), and Dad asked for it before Steps 6 to 8.

- **A second scenario kind, "Any setup",** beside the emergencies. Nothing about the emergencies changes.
- **The setup (on the phone or the console):**
  - a 2D map of the Moose Jaw area (the shared satellite tiles and airfields), where a tap drops the aircraft;
  - altitude (ft MSL), heading (°M), indicated airspeed (KIAS), power (PCL %), pitch attitude (°, + nose up) and bank (°, + right);
  - gear and flaps up. Every value has a default (the ones that take a default are listed in EP-17).
  - **Freeze** puts the student's cockpit at that state, paused. The student answers aloud; the tool never judges.
- **The instructor's next move:**
  - **Carry on:** the aircraft flies with the controls held: the same G, bank and power as at the freeze. It develops as the shared T-6 point mass says. A nose-high attitude loses speed and the nose falls through (the G is capped by what the wing gives, core `stallLimitG`; a stall is said in words). A nose-low attitude builds speed and loses height.
  - **Steps:** the instructor enters what the student described, one row per step, and taps Fly. The aircraft flies them in order, exactly, right or wrong, then pauses at the end and shows the new position and state. A row is:
    - Power: idle, max, or a percentage.
    - Roll: to the nearest horizon, wings level, or to a bank angle.
    - Pitch: to the horizon, or to an attitude.
    - Hold: level, or a heading.
    - Until: a speed, an altitude, a heading, a number of seconds, or "done" (the row's targets reached).
    - A row may set any of these. Unset parts carry on as they were.
    - **Spin** (direction, turns) and **Spin recovery** are rows of their own (EP-19).
  - **Pause** at any moment, then any of the moves again.
- **How the rows are flown (EP-18):** each row is a small pilot on the shared point mass, as the emergency picks are (`manoeuvres.js`), asking every step for G, bank and throttle. It never passes the T-6A's roll and G onset (core) or what the wing gives.
  - Pitch is attitude: flight path plus the angle of attack the model gives (core `attitudeDegFromClimb`). A freeze at a set attitude starts on the flight path that gives it.
  - "The nearest horizon" rolls toward the horizon that is nearer along the present bank, up to 90° (an estimate) while the nose is above the horizon.
  - The published limits (the 7 G, VMO) are flagged on screen, never held.
- **When it can't fly what was asked:**
  - The ground ends the flight in words, as for the emergencies.
  - Below the stall the G is what the wing gives, so a "pull" that can't happen doesn't.
  - A row that would never end (for example "Until 300 KIAS" in a climb) stops after 60 s of flight time, said in words (an estimate).
- **Spin (EP-19):** the shared point mass cannot spin, so a spin is a set-piece flown on numbers. The numbers are rotation, height lost a turn, the nose attitude and the airspeed in the spin, and the turns and height to recover. They come from the manuals in the project files, cited by page. None could be read when this was written (the project files were not reachable from the session), so every spin number is an estimate, shown "(estimate)" until a page or Patrick's ruling backs it.

**As built, V2.459 (not yet seen by Patrick or Dad in the app).** The code is `steps.js` (the setup, the rows and their pilot, the spin numbers), `flight.js` (the freeze, the setup's step, the spin set-piece), `scenario.js` (the actions freeze, carryOn and flySteps), `scenarios.js` ("Any setup" in the scenario list), `console-setup.js` and `setup-map.js` (the console section and its map). The emergencies fly exactly as before (checked side by side with the previous version over 400 s of picks and an engine failure). Where the spec left a choice open, the simplest safe option was taken; each is an estimate, labelled so in the code and on the console:
- **Defaults:** the drop 12 NM south-west of Moose Jaw (the area example's position); "the heading out of the area" is the heading away from Moose Jaw along the bearing the drop lies on (216°M for the default drop), and it follows the drop until the instructor types a heading. Calm wind.
- **The freeze's G:** the G that keeps the flight path straight at that bank, cos(path) ÷ cos(bank), never more than 2 G (past 60° of bank, or inverted, the path curves), and never more than the wing gives. The flight path is solved from the set attitude with core `attitudeDegFromClimb`, so the attitude shown is the one set.
- **Carry on** holds that G, the bank and the power. A very nose-high freeze holds very little G (0.2 G at 80° nose up), so after the nose falls through it dives steeply until the ground: that is "the same G" as written. Holding the stick still instead (the angle of attack held, so the G grows as the speed comes back) would pull out of the dive; a question for Patrick.
- **Rows:** what a row leaves out carries on from the row before (a "pitch to the horizon" is still flown while the next row rolls wings level); a new roll drops a heading held before, a new pitch drops a height held before; Fly starts from the controls as they are. A roll target comes before a heading hold in the same row, and a pitch target before a height hold. "Done" means every target being flown is reached at once: bank within 3° and rolling under 10°/s, attitude within 2°, heading within 3°, height within 50 ft and the path within 2° of level.
- **The pilot's pull:** in the stick shaker (core `shakerG`), at most 5 G (Patrick's split S, core `T6A_MANOEUVRE.splitSMaxG`), never below 0 G; the nose moves at the module's pilot rate (0.5 rad/s). At a steep bank a pull turns the nose sideways and gravity brings it down; inverted, a pull lowers it. Carry on's held G is not kept in the shaker: it may stall, said in words.
- **The nearest horizon:** from wings level it rolls right. Once the nose is at the horizon (or the bank at 90°) it holds the bank it has.
- **A row that never ends** stops at 60 s, said in the log, and the next row starts; a row "for N seconds" runs its N (up to 600 s).
- **The spin:** the spin step first flies its own entry, power idle, wings level and the nose held 20° up, to the 1 G stall; then 2.5 s and 450 ft a turn, nose 50° down, 15° of bank into the spin, 110 KIAS, 1 G. It keeps spinning after its turns until a Spin recovery step (other steps can't be flown while spinning; their "until" and 60 s cap still count). The recovery takes 1.5 more turns, then leaves the aircraft wings level, nose 40° down at 120 KIAS, and flies the pull-out to the horizon on the point mass. Every one of these is an estimate; replace with the manual page.
- **No tail slide:** a point mass slowed almost to a stop (a near-vertical freeze) is held at 20 KTAS and its path tipped over toward the ground at the rate gravity would turn it.
- **The student's screen** shows only the cockpit and the situation at the freeze. The rows, a spin the instructor springs and a stall are said on the console and in the log, never on the student's screen, so the student reads them from the instruments. The pitch shown in an Any setup flight has its angle of attack tilted with the bank (only its cos(bank) share lifts the nose, as the Turn Sim does, TR-91), so a steep or inverted attitude reads right; the emergencies keep their plain formula (up to about 1° apart in a turn), a question for Patrick.
- **The phone:** the setup and the rows stay on the phone, which runs the scenario (EP-9); they are checked as untrusted where they come in (`cleanSetup`, `cleanRows`, as `cleanPick`), and the student view carries only the flight (its turn-rate range widened to ±360°/s for the spin). The emergency picks don't apply to an Any setup session; its console hides the picks and the developments.
- **Seen and unseen:** the map, the setup boxes, the step builder, a freeze, a nose-high recovery and a spin were driven in a headless browser with no page errors, and the cockpit pictures looked right. Not seen: a real phone, the phone's one-column layout, touch on the map, and the instructor running it with a student.

## What the module uses (no second copies)

The CT-156 cockpit and its live instruments (ui-kit, ALL-31 to ALL-33; the engine displays become live, an additive change shared with the other sims), the shared sky, terrain and airfields (ui-kit, core), the version label and settings (shell). No flight maths of its own: since plan Step 5 the aircraft flies on the shared core's point mass and T-6 numbers (EP-13), with Traffic's glide ring imported as it is.
