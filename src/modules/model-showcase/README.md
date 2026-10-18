# Model Showcase (code)

The CT-156 on its own, a window on the home screen. What it does and why: `docs/modules/model-showcase/` (start with its README).

| File | What it does |
|---|---|
| `index.js` | The screen: the controls (camera; aircraft with its gear, flaps and Manoeuvre; Graphics; the Look sliders) beside the 3D view. Runs the frame loop on the shell's scheduler. |
| `world3d.js` | The 3D view: one CT-156 on a studio backdrop with lights; on the ground (gear down, prop feathered, engine off) or flying `flight-cycle.js`'s cycle, the gear and flaps travelling, the surfaces, stick and power lever moving; an orbit camera outside and a head-turning camera from each seat; draws only when something changed, the prop is turning or pictures are still arriving. |
| `flight-cycle.js` | The gentle flight the aircraft flies in the air (MS-7): turns, a climb, cruise and a descent, and the panel's numbers and the stick from it. A picture, not a flight model; pure (no three.js), tested in `tests/unit/model-showcase/`. |
| `model-showcase.css` | The screen's layout and look (tokens from `src/ui-kit/tokens.css`). |

Shared code it uses, never copies: `src/ui-kit/ct156-model.js`, `ct156-cockpit.js`, `ct156-blender.js`, `ct156-look-settings.js`, `three-aircraft.js`, `camera-bar.js`, `panel.js`, `dom.js`. It imports `src/modules/traffic/version.js` for the one version number and no other module.

The home card's film (`public/media/cards/model-showcase.webm` and its still) is a slow 360° of the High model on the ground, 24 seconds a turn, made from this page's own orbit.
