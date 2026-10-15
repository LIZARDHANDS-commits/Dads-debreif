# EP Tabletop: future (not being built until Patrick moves an item up)

- **Chair-fly F in the Traffic sim:** at Follow the plan, open the Traffic sim on the chosen pattern (ELP, straight-in, overhead) from where the emergency left the aircraft.
- **Standup mode:** a room screen for the flight watching, with the student at the front (para 1.20.1's added pressure).
- **Flying the emergency:** the aircraft responds to the student's stated control inputs with the shared T-6 flight model (Formation and Traffic's), instead of holding the scenario's state.
- **Scenario library shared between instructors** (needs storage and Patrick's yes).
- **Formation EPs:** the emergency in a formation, with knock it off and the lead change (para 1.20.3.1), using the Formation sim's aircraft.
- **3D cues:** smoke trail or flames outside the aircraft and oil streaks on the windscreen drawn in 3D (EP-12 keeps cues to overlays while the module is being built).

## Any setup: freeze at any point of a manoeuvre (Dad, 15 Oct 2026)

Dad's words: "I should be able to make any setup...QR code phone should have a 2d map where they drop the location and altitude. set nose up attitude and bank...basically any point in a manuver... Student responses should basically be to the effect of 'Id do a nose high recovery by rolling to the nearest horizon, max power, then pulling to the horizon, and rolling level' the instructor should have a way to move to that next end point or Enter a spin, or just continue the current attitude and power setting if the studnet does nothing then can repause as the situtaiton develops."

What it would add (to be planned with Dad, then for Patrick's yes):
- **Setup on the phone:** a 2D map where the instructor drops the aircraft's position, then sets altitude, pitch and bank, and any other state the plan needs (see the questions).
- **The student answers.** How is open (question 1).
- **The instructor's next move:**
  - fly to the end point the student described, for example a nose-high recovery to wings level on the horizon;
  - enter a spin;
  - or let the aircraft carry on at its attitude and power while the situation develops;
  - pause again at any time.

Questions for Dad, then Patrick (one at a time):
1. How the student answers: aloud to the instructor, who taps the next move; picks on the student's screen; or typed.
2. What the setup holds beyond position, altitude, pitch and bank: heading, airspeed, power, gear and flaps?
3. How "carry on" flies: the shared T-6 flight model, so a nose-high attitude loses speed and stalls as the T-6 would; or a simpler script.
4. Which end points the instructor can send it to: nose-high recovery, nose-low recovery, spin entry and recovery, straight and level, and others?
5. The spin's numbers (rotation, altitude lost a turn, recovery), from a manual page in the project files or Patrick's ruling.
6. Where it lives: a new scenario kind in the EP Tabletop, or its own module.

Dad's answers (15 Oct 2026, in the order asked):
1. **How the student answers:** aloud; the instructor taps the next move on the phone. The tool never judges right or wrong.
2. **The setup:** map position, altitude, pitch, bank, heading, indicated airspeed and power, each with a default. Gear and flaps stay up.
3. **Carry on:** the shared T-6 flight model (Formation and Traffic's), controls held, so the aircraft develops as the T-6 would.
4. **End points:** "kinda all the above...if the student describes it wrong, we should see the outcome. or if he says it right we should see a flying outcome...it could be anything really...if he describes in level flight, i want to slow down, by doing this i will select power to idle and trim the aircraft to stay level and i will slow to this speed then add power...we should be able to input that roughy...then output a new location and aircraft parameters". The instructor enters what the student described as steps, the T-6 model flies them exactly, right or wrong, and the result is a new position and aircraft state, paused.
5. **Input:** a step builder on the phone, one row per step:
   - Power: idle, max or a percentage.
   - Roll: to the nearest horizon, wings level, or to a bank angle.
   - Pitch: to the horizon or to an angle.
   - Hold: level, or a heading.
   - Until: a speed, an altitude, a heading or a number of seconds.
   A spin is its own step.
6. **Spin numbers:** searched in the manuals in the project files and cited by page, with anything not found marked an estimate until Patrick rules. Numbers only, never checklist or boldface text. The shared model cannot spin, so the spin is a set-piece flown on those numbers.
7. **Where it lives:** in the EP Tabletop, as a second scenario kind, "Any setup", beside the emergencies.
