# Content Security Policy hosts for the SOF (tasks 2, 6 and 7)

For the app frame thread, which owns `index.html` and the page's policy. `index.html` has no policy today, so nothing here is needed to make the SOF work now; this is the list to put in when it gets one (SPEC-sof, "What the SOF needs from other pieces"). Every host below is one the SOF's code asks for and no other host is. The SOF loads no script and no font from outside the site, sets no inline style attribute and uses no `eval`, so `script-src 'self'` is enough for it.

| Directive | Hosts | Why |
|---|---|---|
| `connect-src` | `https://api.met.no` | METAR and TAF (task 2) |
| | `https://datamask.org` | NOAA NWS reports for a station MET Norway lacks (task 2) |
| | `https://geo.weather.gc.ca` | ECCC GeoMet: radar, radar coverage, lightning density, GOES cloud, warnings, and each layer's time (`GetCapabilities`) |
| | `https://api.rainviewer.com` | RainViewer's list of radar frames, the radar backup |
| | the traffic relay's origin | Live traffic (SOF-7). Not known yet: it is the address Patrick types into "Traffic relay address" in the SOF settings, e.g. `https://traffic.<name>.workers.dev`. Until there is a relay the layer is hidden and asks for nothing. Add the origin once it exists; the setting only accepts an `https://` address with nothing after the host (or `http://` on localhost). |
| `img-src` | `'self'` | The VNC charts, once they move under the site |
| | `https://services.arcgisonline.com` | Esri satellite tiles (`ui-kit/map-tiles.js`); also Traffic's photo layer (PR C) |
| | `https://tilecache.rainviewer.com` | RainViewer radar tiles (the host in RainViewer's own list reply) |
| `frame-src` | `https://globe.adsbexchange.com` | The ADS-B Exchange view (task 7). Only while its switch is on. |
| `style-src` | `'self'` | `sof.css`, one `<link rel="stylesheet">` the module adds and removes |

Notes for whoever writes the policy:

- **ECCC and Esri pictures.** ECCC's pictures are fetched (`fetch`, then decoded with `createImageBitmap` from the bytes), so they need `connect-src` only, not `img-src`, and no `blob:` or `data:` source. Esri and RainViewer tiles are drawn from image elements, so they need `img-src`.
- **The frame.** The ADS-B Exchange frame is created with `sandbox="allow-scripts allow-same-origin"`, `referrerpolicy="no-referrer"` and an empty `allow=""`, so it gets no camera, location, or pop-up powers and cannot navigate our page. If the page ever sets `frame-ancestors` or `X-Frame-Options` on itself, that does not affect this (it governs who may frame us).
- **Map position of the tip.** The hover tip is placed with `element.style.left/top` set from script (the CSSOM), which `style-src 'self'` allows. No `style="..."` attribute is written into the page's HTML.
- **Nothing else outside.** There is no analytics, no font host, no `blob:` worker and no WebSocket. The Blitzortung "Lightning map" link and the per-card "Runway view" link (task 7) are not built yet; when they are they are plain links (no directive needed).
- **Test note.** No test reaches these hosts: `sof-map-feeds.js` answers every one of them from fixtures by a Playwright route, so the tests run the same with or without a policy.

## Other modules (added by the app frame for the page-wide policy)

- **Debrief saved radar and lightning (task 12f).** `connect-src https://geo.weather.gc.ca` (GetCapabilities and GetMap by `fetch`, already listed above) and `img-src data:` (kept frames are stored in the debrief file as base64 and load as `data:` images). No `blob:`. Debrief historical weather also needs `connect-src` for mesonet.agron.iastate.edu, historical-forecast-api.open-meteo.com and api.open-meteo.com, and `img-src` for gibs.earthdata.nasa.gov (check each against the Debrief code when the policy is written).
- **Moving the ECCC helpers to ui-kit (VNC move, SOF task 6).** The Debrief now imports `getMapUrl`, `parseLayerTimes`, `GEOMET_URL` and `LAYERS` from `src/modules/sof/feeds.js`; its imports move with them.
