# Sign-off checklist: the Debrief Viewer

Anyone can run this in about half an hour, in any up-to-date browser on a desktop or laptop. Nothing needs installing. Tick each line. If one fails, use **Report a problem** in the app, say which line failed, and name your browser.

Link: https://lizardhands-commits.github.io/Dads-debreif/#/debrief

You'll want two or more of your own ForeFlight track files (.kml) from one formation sortie. For the side-by-side lines, keep V6 (the old single-file tool) open in another tab.

## First look

- [ ] The Debrief Viewer card on the home screen opens the debrief. It shows **Load tracks**, **Example flight**, a status line reading "No flight loaded", the map, the playback bar, the Formation card and DFPs. Nothing else is open, and nothing covers anything else.
- [ ] **Example flight** loads four tracks, fitted to the map, and the status line says "4 tracks loaded" with the gaps it found.
- [ ] Press the status line. It opens a list of each track: positions kept, time span, anything left out and why, GPS gaps, and time trimmed to the shared window.

## Your own tracks

- [ ] **Load tracks**, pick your files. A small table gives each file a ship number (#1 to #4) in the order picked. Change one ship number: the file that had it swaps. Press **Load**.
- [ ] The tracks show, fitted to the map. #1 is blue, #2 green, #3 red and #4 white with a dark outline. Every ship carries its number, and #4 is easy to see.
- [ ] Pick a file that isn't a track (any .txt renamed .kml). The debrief says which file and why, and what was loaded before stays loaded.

## Playback

- [ ] **Play** runs the flight. The time in the bar shows Zulu first and Moose Jaw local beside it (or the other way round if you chose that in Settings).
- [ ] **Pause**, the step buttons, the speed menu and the scrubber all move the same clock. Space plays or pauses, and ← and → step one second (not while typing in a box).
- [ ] Drag the scrubber to a busy moment. The numbers on the Formation card change with it.

## Readouts and standards

- [ ] The Formation card has one line per wingman, with its label (for example On parameters, WIDE or AFT) and the one number that's off: feet for interval and #3's offset, degrees for sweep (0 to 10° behind the 3/9 line passes, per the SMM). Lead's line shows est. IAS and G, and the target it's judged against: 220 kt in the low block, 200 kt in the mid block.
- [ ] **More detail** opens altitude, speed, G, pitch and bank with where each came from, plus aspect, HCA, closure and spacing for every pair. It stays open after a reload.
- [ ] **Debrief settings** (under the Formation card, closed at first) opens the standards editor. Change "Spread maximum", then reload: the change is kept. A silly value (a letter, or a negative number) is refused with a message. **Reset to the default standards** puts the SMM's numbers back: spread 4,000 to 6,000 ft with 0 to 10° of sweep, #3 7,000 ± 1,000 ft back, and Lead 220 kt low / 200 kt mid, ±10 kt, 1.0 ± 0.2 G.
- [ ] Compare three moments with V6 side by side (same file, same time): spacing between #1 and #2, #2's aspect and HCA, and Lead's speed. They match, except where a decision changed a number on purpose (est. IAS instead of ground speed, D31; turn rate without V6's divide by 2, D39; the SMM's sweep, offset box and lead speeds instead of V6's, D114 to D116). Note any difference and the time.

## The map

- [ ] Drag pans, the wheel zooms, and **Fit** brings the whole flight back.
- [ ] **Layers**: turn each one on and off (grid, spacing lines, trail, 3/9 lines, fighting-wing cone, clock marks, safety bubble, Follow Lead). Each shows or hides at once, even while paused. Reload: they're as you left them. **Reset layout** puts the defaults back.
- [ ] **Satellite imagery** shows imagery under the tracks with Esri's credit in the corner.
- [ ] **Routes and charts**: pick a route, then a VNC chart (South, North or Both). The chart shows under the tracks with "not for navigation" in the credit line. **Chart alignment** nudges it and **Reset alignment** puts it back.

## Weather at the time of the flight

- [ ] **Weather** → **METAR**. A line under the playback bar gives the report in force from the airfield nearest Lead, with its time and age (for example "CYMJ 1400Z (12 min before) · VFR · wind 270/12 kt …"). Small ticks on the scrubber mark each report. Drag past a tick: the line changes to that report, never to a later one.
- [ ] **Report as sent** shows the METAR exactly as issued. **METAR from** picks another airfield. Turn **METAR** off: the line and the ticks go.
- [ ] With a flight from the last 90 days, **Weather** → **Satellite (GOES-West)** lays the satellite picture under the tracks, and the line under the map says its time and age ("Satellite 14:30Z, 2 min before"). Play: the picture changes every 10 minutes of flight time. **Satellite picture** → **Infrared** swaps it. With an older flight it says "Satellite not kept".

## 3D

- [ ] The **3D** switch shows the same moment in 3D, and playback carries on without a jump. Each ship is a CT-156 Harvard in the Moose Jaw paint, with its number on the tail and nose; **3D settings** → **Paint** → **Ship colours** paints them plainly. Switching back to 2D keeps the time.
- [ ] Drag turns the view and the wheel zooms. **3D settings** changes the camera, altitude scale, model, trail and ground options. **Reset view** goes back to V6's view.

## DFPs, save and open

- [ ] **+ Add** marks this moment as a DFP. Rename it and write a note. Add another earlier one: the list stays in time order. **Next DFP** and **Previous DFP** jump between them.
- [ ] **Save, open, CSV** → **Save debrief** downloads a `.dadsdebrief.json` file.
- [ ] **Close flight**, then **Open debrief** with that file. The same tracks, DFPs (with notes), standards and time come back.
- [ ] **Export CSV** downloads a `.csv` file. It opens in a spreadsheet with one row a second and each aircraft's columns side by side, including a GPS gap column.

## Tools

- [ ] **Tools** → **EM chart** opens the T-6 EM chart below the map, with each ship's dot and a fading trail. The map gets shorter, and nothing covers it. The chart follows the formation's altitude, or pick 6,500, 8,000 or 13,000 by hand. **Close EM chart** closes it.
- [ ] **Tools** → **Tennis ball** opens its panel. Pick the shooter and target. The answer (INTERCEPT, IN CONE or OUT OF CONE) matches the arc and cone drawn on the map and in 3D. Change the ball speed or cone width and the answer and drawing change together.

## Leaving and coming back

- [ ] Go **Home** while the flight is playing, then open the debrief again. Nothing is left running (the page stays quick), and your layout is as you left it.
- [ ] Load the example flight once, then turn the network off and reload. The debrief still opens and the example flight loads and plays. Turn the network back on.

## Sign-off

Browser and version: ________  Date: ________  Name: ________

Differences from V6 noted (time, number, V6 value, new value): ________

All lines ticked means the Debrief Viewer is done (R21).
