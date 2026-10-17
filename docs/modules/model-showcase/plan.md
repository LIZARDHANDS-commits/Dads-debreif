# Model Showcase: plan

Only what is here gets built. Patrick asked for this module on 15 Oct 2026 and said: "if anything is complex or requires a lot of work, don't worry about it. The main aim is to get the model some attention."

## Step 1. First version
- [x] Home card with a slow-spinning 360° of the High model (WebM, with a still), and the module folder with its README.
- [x] The CT-156 on its gear with the prop feathered (the start), or flying with the prop turning.
- [x] High or Performance graphics; the Look sliders (weathering, relief, wear).
- [x] Outside camera (orbit, scroll to zoom up close) and a camera from each seat with free look, as Formation's Cockpit view.
- [x] A simple studio backdrop with lighting.
- Built in V2.484; inspected by Patrick in the deployed app (V2.511) on 17 Oct 2026.

## Step 2. Phase 5 polish & flight choreography (Patrick, 17 Oct 2026; `3d-work` `ct156/briefs/5-polish-and-signoff.md`)
- [x] **Step 5.1 (`5-App` — Pure-JS & Model Showcase slice, runs first):** built on branch `shared-3d-phase5-app` (17 Oct 2026); not yet seen by Patrick. As built: the placard and the fin read the ship's own serial, and the Showcase's ship is #1, 156122 (Patrick, 17 Oct 2026: "Make it 156-122 and make the tail match"; the brief's 156114 had no source); the gear travels 6 s (`CT156_GEAR_TRAVEL_S`, Patrick 12 Oct 2026; the brief's ~5 s); the live engine dials show in every cockpit at High (Patrick: "All models live on high incl showcase"); the cockpit's landing gear handle does not move yet (it is part of the delivered body: a separate part for Step 5.2).
  - Fix opposite bank sign on the EADI and standby attitude indicator (`W24`).
  - Automatic gentle flight cycle when `Flying` (turns, climbs, descents with matching torque, stick, PCL, control surfaces, and instruments) + a checkbox to pause/hold steady + **Gear** (`Up`/`Down`) and **Flaps** (`UP`/`TO`/`LDG`) pill buttons in the `Aircraft` box, with smooth gear transit (`setGear`), moving exterior control surfaces/flaps (`setControls`), moving cockpit `FLAPS` gauge needle, and moving cockpit `stick` and `pcl` (`W25`).
  - Shared CT-156 JS fixes visible in Model Showcase: white cheat-line stripe clipping over roundel (`W11`), outside view switched off the flat black `floor` lid onto `fuselageCut` + `tub` + the lightweight headbox `seats` at both levels until Step 5.2's full High seats (`W12`), prop spinner blade holes aligned and rotating with the propeller (`W13`), standby compass ball seated in its `D15` bracket (`W19`), real-time ZULU (`HH:MM` UTC) on the M850 clock + live `TRQ` needle/readout and realistic companion engine/systems dial readings (`W20`), and tail-number placard (the fin's serial, 156122 on the Showcase's ship) above the engine displays (`W23`).
- [ ] **Step 5.2 (`5-Master` — Consolidated Blender Master + Bake + Meshopt Delivery + App Import):**
  - Full ejection seat buckets in High's `exterior/seats` (`W12`), recessed forward-hood NACA air intakes (`W14`), unlit pitch-black chin air intake cavity around the vertical splitter rod (`W15`), canopy det cord in `exterior/frames` (`W16`), lower-left landing gear handle detail & `EMER LDG GR PULL` plaque separation (`W17`), removal of the right-sill black wedge `pubClip` (`W18`), canopy/sill/bow gap closure (`W19`), pedal footwell mesh cleanup (`W21`), left-sill canopy locking handle reshape/seating without floating bolt blocks (`W22`), plus earlier waiting rows `W1`–`W3`, `W5`, `W7`, `W8` and Meshopt compression (`5A` delivery half). Notes from Step 5.1 for it: the app reads the delivered parts' attributes as plain floats (`takeShape`, `splitControls`), so a Meshopt delivery must be checked for quantized positions before import; a separate PCL lever node and a gear-handle node would let the app move them without splitting by position.

## Step 3. Sign-off
- [ ] Patrick reviews Model Showcase after Steps 5.1 and 5.2 land.

