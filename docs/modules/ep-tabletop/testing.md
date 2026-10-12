# EP Tabletop: testing

The policy is `../../TESTING.md`. This module adds:

- The one light test when the scenario engine is built: a scenario's development changes the panel only when its time or step comes or the instructor applies it, and a pause stops the clock (what an instructor would recognise). Expected values come from the scenario itself.
- No test checks a checklist or boldface step: none is stored (EP-3).

## Sign-off checklist (in Dad's and Patrick's words; filled in when the spec is approved)

- [ ] From the default start, open the EP Tabletop, scan the code with a phone, and run "engine roughness in the area" from A to F.
- [ ] The student's screen never shows the script, what comes next or the end.
- [ ] Pause on the phone, change fuel flow and the chip light, resume: the student sees only the result.
- [ ] Send the student back to Aircraft control from Analyse, Boldface and Checklists.
- [ ] Turn the phone's network off: the student's screen says "Instructor link lost" and keeps its state; rescan and carry on.
- [ ] The debrief log shows every step, pause, change and note, and saves to a file.
- [ ] No boldface or checklist text anywhere on either screen.
