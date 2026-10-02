# Future ideas

Not built. Add one line per new idea. Numbers are the old plan doc's FF numbers; new ideas get the next FF number (FF44 onward).

## From the plan doc

Numbers are the plan doc's FF numbers.
- FF1 PT-PT (point-to-point) Simulator, FF2 Formation Briefing Board: future, stay hidden.
- FF4 one-page printable debrief sheet; FF5 debrief library of past sorties; FF6 GPX import; FF10 drawing over the replay; FF11 cockpit video sync; FF12 report-a-problem button; FF13 touch pan and zoom; FF14 "follow ship N" 3D camera; FF15 iPad attitude calibration (tried; didn't work on the examples); FF16 graphs synced to the replay; FF17 bookmarks and an automatic event scan; FF18 two-ship geometry readouts and a measuring tool; FF19 terrain height and height above ground; FF20 real runway data (OurAirports); FF21 SOF crosswind per runway; FF22 projector view.
- FF24 METAR wind into the Traffic Sim; FF25 automatic sequencing; FF26 SIGMETs, PIREPs and GFA on the SOF (needs the relay); FF27 option at the threshold (full stop, touch-and-go, low approach, go-around); FF29 runway landing-spacing check; FF30 separate wind at pattern height; FF31 slide or break to the inner runway (SMM 4.28); FF32 early turn (SMM 4.28); FF33 uncontrolled square circuit (SMM 4.29) for other home fields; FF34 runway occupied, continue and go low approach; FF35 break-outs (SMM 4.15, 4.23); FF36 flapless aircraft (SMM 4.25, 4.26).
- FF37 SOF keeps radar and lightning all day for later debriefs; FF38 Turn Sim vertical fluid manoeuvres; FF39 rejoins; FF40 fighting wing; FF41 fluid manoeuvring (level); FF42 Turn Fight chaser picks its own pursuit; FF43 real terrain in 3D (key-free AWS tiles first).
- Traffic tasks moved here by the Streamlined build: PFLs (task 16), engine-outs (17), the prediction engine (19), live rules and commands (20), fly-through, departure-end break and closed pattern (21), set up a conflict (22), engine-out check and reach (23).
- SOF: a 12-hour all-day soak run; map extras; move the VNC chart layer into ui-kit; an information-only lightning line at 50 NM (NFM Sec VII p. 7-4).
- Done or dropped already: FF3 save a debrief file, FF7 home airfield setting, FF8 editable error standards, FF23 climbing turns (became Turn Fight's Energy mode); FF9 and FF28 dropped.

## Added after the handover

| FF | Date | Module | Idea | Why |
|---|---|---|---|---|
| FF44 | 30 Sep 2026 | Traffic Sim | Live wind input controls in playback bar | Expose wind from/speed number inputs in the bottom playback bar so users can interactively adjust wind direction/speed and observe aircraft crabbing live. *(Built in PATCH-014, commit `8d6a517`)* |
| FF45 | 01 Oct 2026 | Turn Fight | Operational service ceiling limiter at 25,000 ft MSL (D205) | In Energy Mode mutual vertical pursuit climbs, clamp energy or enforce service ceiling so aircraft cannot climb indefinitely beyond 25,000 ft MSL. |
| FF46 | 01 Oct 2026 | Turn Sim | Geometric vertical step/offset deconfliction in Offset Box Hook (D207) | Deconflict the 31-ft nose-to-nose flat proximity in offset box hook turns with authentic SMM Ch 16 vertical separation or offset adjustment rather than caution flag only. |
| FF47 | 01 Oct 2026 | Turn Fight | Unified point-mass physics engine across all modes | Merge Simple Mode's kinematic circle geometry and Energy Mode's 3D aerodynamic engine into a single unified physical simulation. |
| 2026-10-02 12:46 | Traffic | PFL: Three modes — High Key (powered climb then glide), Forced Landing Pattern (engine fail mid-circuit, intercept profile), Forced Landing Area (spawn at dist/radial/alt, glide to High Key). Good enough for now, perfect later. makePflFromArea() and PFL_HIGH_KEY plan exist in nav-plans.js. |
