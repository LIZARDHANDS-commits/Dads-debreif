# Model Showcase: decisions (MS-)

| ID | Decision | Files | Source |
|---|---|---|---|
| MS-1 | A home-screen module that shows only the CT-156: no flight maths, no terrain, no weather. | `src/modules/model-showcase/` | Patrick, 15 Oct 2026: "just the harvard sitting on its gear or flying (toggleable)" |
| MS-2 | It starts on the ground on its gear with the prop feathered (the prop stopped, `setPropStopped`), outside, High files. Flying is a toggle: gear up, prop turning. | `world3d.js`, `index.js` | Patrick, 15 Oct 2026: "default to the gear with the prop feathered" |
| MS-3 | The camera switches between outside and each seat (front, rear) with free look as in Formation; outside has a much longer zoom range (5 to 140 ft). | `world3d.js` | Patrick, 15 Oct 2026: "each seat camera but with freelook, like formation" |
| MS-4 | The backdrop is a plain gradient with a pool of light and a shadow, lit by the shared sky and sun plus a fill and a rim. The colours, light strengths and the 10° flying bank are tool choices, not measurements. | `world3d.js` | Patrick, 15 Oct 2026: "Simple backdrop but with lighting" |
| MS-5 | The home card is a slow 360° turn of the High model, 24 seconds a turn, as a WebM with a still (no MP4: the tool that made it writes WebM only). | `public/media/cards/model-showcase.*` | Patrick, 15 Oct 2026: "Make the cover photo a slow spinning 360 of the highest quality model we have" |
| MS-6 | The Graphics choice and the camera are not saved; the Look sliders are the shared saved ones (the same as Formation and Traffic). The Showcase sets the CT-156 files to High when it opens; the simulators set their own level when they open. | `index.js` | tool choice |
