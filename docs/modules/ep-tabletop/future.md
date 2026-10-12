# EP Tabletop: future (not being built until Patrick moves an item up)

- **Chair-fly F in the Traffic sim:** at Follow the plan, open the Traffic sim on the chosen pattern (ELP, straight-in, overhead) from where the emergency left the aircraft.
- **Standup mode:** a room screen for the flight watching, with the student at the front (para 1.20.1's added pressure).
- **Flying the emergency:** the aircraft responds to the student's stated control inputs with the shared T-6 flight model (Formation and Traffic's), instead of holding the scenario's state.
- **Scenario library shared between instructors** (needs storage and Patrick's yes).
- **Formation EPs:** the emergency in a formation, with knock it off and the lead change (para 1.20.3.1), using the Formation sim's aircraft.
- **Student's decision list (Dad, 12 Oct 2026):** "the Student should have a decision selection screen... turn to the nearest suitable airfield. Zoom. fly straight. almost like a huge list so the EP table starts moving until the instructor pauses again to inject more etc". The student picks what they'll do from a long list on their own screen (for example turn to the nearest suitable field, zoom, fly straight, climb, slow down, declare); once picked, time runs and the aircraft carries it out (the heading comes round, the zoom trades airspeed for height) until the instructor pauses to inject the next development. Notes for when it is moved up:
  - **Controlled content (EP-3):** the choices are plain manoeuvre words. Never boldface or checklist wording, never their numbers, and nothing shows which choice is right.
  - **The list:** the instructor can add to it and trim it per scenario.
  - **Link direction:** the student's picks have to reach the phone, but the link now runs phone to screen only (EP-8). It needs a second, screen-to-phone mailbox with its own key.
  - **Flight math:** carrying out a pick means the aircraft moves. That overlaps "Flying the emergency" below and would use the shared T-6 flight model (search `src/core/` first); it needs Opus and a written flight approach before any code.
