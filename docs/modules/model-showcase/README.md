# Model Showcase

A window on the home screen for looking at the CT-156 on its own. Patrick's ask (15 Oct 2026): "a MODEL SHOWCASE module where it's just the Harvard sitting on its gear or flying (toggleable), you can play with the wear/grime things, and switch between high and low", and "switch between cockpit/outside (with more zoom on outside)"; "the main aim is to get the model some attention on the module".

## Where it stands

**Built in V2.484 as the first version; not yet seen by Patrick in the app.** It opens on the ground on its gear with the prop stopped and feathered, High files, outside, with a slow turntable. The home card plays a slow 360° turn of the High model.

## What it does

- **Aircraft:** on the ground (gear down, inboard doors hanging open as parked, prop feathered), or flying (gear up, prop turning, 10° of bank).
- **Camera:** outside (drag to orbit, scroll to zoom from 5 to 140 ft, double-click to reset the zoom, an optional slow turntable), front seat or rear seat (drag to look round as in Formation's Cockpit view, hold Shift to zoom, double-click to look ahead).
- **Graphics:** High or Performance (the same files the simulators use, through `setCt156Level`).
- **Look (3D):** the weathering, relief and wear sliders and Reset (`ct156-look-settings.js`); the same saved setting as Formation and Traffic.
- A plain studio backdrop (a soft gradient, a pool of light and a shadow on the ground) with its own lights: sky and sun, a cool fill and a rim.

It is a picture only: no flight maths, no terrain, no weather and no settings of its own beyond the controls above.

## When data fails

No WebGL: a message replaces the view. A Blender file or picture that doesn't load: the ship keeps its code-drawn shape or plain paint, and `ct156-blender.js` logs it once.

## The files

| File | What it holds |
|---|---|
| `plan.md` | The steps and their checkboxes |
| `decisions.md` | Decisions in force (MS-) |
| `future.md` | Ideas not being built until Patrick moves them up |
| `../../../src/modules/model-showcase/` | The code, with its own short README |
