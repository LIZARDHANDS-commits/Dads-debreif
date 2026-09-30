// The satellite layer on the replay (SPEC-debrief: Weather at the time of the
// flight): which GOES-West picture goes with a playback moment and where its
// tiles come from. NASA GIBS serves a frame every 10 minutes, keeps them for
// about 90 days (sources check 2026-09-30), and snaps a request back to the
// frame at or before it. Plain values; tested in Node.

/** GIBS frames are every 10 minutes, on the tens. */
export const SATELLITE_STEP_S = 600;
/** How long GIBS keeps frames: about 90 days (older times answer 404). */
export const GIBS_KEPT_S = 90 * 86_400;

/** The pictures on offer: GeoColor (colour by day, infrared-based at night), or infrared alone. */
export const SATELLITE_LAYERS = Object.freeze({
  geocolor: Object.freeze({ id: 'GOES-West_ABI_GeoColor', label: 'Colour (GeoColor)', maxZoom: 7 }),
  infrared: Object.freeze({ id: 'GOES-West_ABI_Band13_Clean_Infrared', label: 'Infrared', maxZoom: 6 }),
});

export const GIBS_CREDIT = 'NASA GIBS, GOES-West';

const isoSeconds = (t) => new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The frame at or before t: seconds since 1970, on a 10-minute mark. */
export function satelliteFrameT(t) {
  return Math.floor(t / SATELLITE_STEP_S) * SATELLITE_STEP_S;
}

/**
 * A tile source for one frame, as the ui-kit tile layer takes it:
 * { key, url(z, x, y), maxZoom, frameT }; the key names the frame. Built from a fixed host, a layer from the
 * list above and numbers only.
 */
export function gibsSource(layerKey, frameT) {
  const layer = SATELLITE_LAYERS[layerKey];
  if (!layer || !Number.isFinite(frameT)) throw new TypeError('gibsSource: a known layer and a frame time');
  const time = isoSeconds(satelliteFrameT(frameT));
  const base = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.id}/default/${time}/GoogleMapsCompatible_Level${layer.maxZoom}`;
  return Object.freeze({
    key: `${layer.id}@${time}`,
    url: (z, x, y) => `${base}/${z}/${y}/${x}.png`,
    maxZoom: layer.maxZoom,
    frameT: satelliteFrameT(frameT),
  });
}

/**
 * Whether GIBS still has this flight's frames: false once its end is more
 * than about 90 days before now (seconds since 1970).
 */
export function satelliteKept(flightEndT, nowT) {
  return nowT - flightEndT < GIBS_KEPT_S;
}

/** The corner label: "Satellite 14:30Z, 2 min before". */
export function satelliteLabel(frameT, t) {
  const d = new Date(frameT * 1000);
  const hhmm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
  const min = Math.round((t - frameT) / 60);
  return `Satellite ${hhmm}, ${min < 1 ? 'at this moment' : `${min} min before`}`;
}

/**
 * The line under the map for the satellite layer. kept: satelliteKept for
 * the flight. state: the tiles' { wanted, ready, failed } from the last draw,
 * or null. Empty when there's nothing to say.
 */
export function satelliteNote({ kept, state, frameT, t }) {
  if (!kept) return 'Satellite not kept: NASA keeps about 90 days of pictures.';
  if (!state || !state.wanted) return '';
  const label = satelliteLabel(frameT, t);
  if (state.failed === state.wanted) return `${label}: no picture for this time, or no connection.`;
  if (state.ready < state.wanted) return `${label}: loading…`;
  return `${label} · ${GIBS_CREDIT}`;
}
