// The example flight: V6's four ForeFlight tracks from 2026-06-02, with the
// nicknames V6 gave them (D22). The files are fetched only when someone asks
// for the example (R5), so they cost nothing otherwise. Where they are served
// from is the app's business: the caller passes a function that fetches one
// by its asset name.
import { loadFlight } from './load.js';

export const EXAMPLE_FLIGHT = [
  { slot: 1, name: '#1 Lead - ED2F5', asset: '585aab2601b787ed.kml', download: 'tracklog-ED2F5624-96C0-42E2-846E-89CCC0644750.kml' },
  { slot: 2, name: '#2 - 60DF66', asset: '3ee2a7e81a74880c.kml', download: 'tracklog-60DF664C-9776-48B1-88FB-963FC1508BE8.kml' },
  { slot: 3, name: '#3 - 8738A6C9', asset: '3085ab3861e2bae6.kml', download: 'tracklog-8738A6C9-3438-436E-A2F8-0088EC94FB5A.kml' },
  { slot: 4, name: '#4 - 083AC', asset: '46e14716b39044c4.kml', download: 'tracklog-083AC108-9FE4-4279-8AEF-F4FE1DE61294.kml' },
];

/**
 * Fetches the four example tracks with fetchText(asset) (returning their
 * text) and loads them together (loadFlight). Rejects, loading nothing, if
 * any can't be fetched or read.
 */
export async function loadExampleFlight(fetchText) {
  const texts = await Promise.all(EXAMPLE_FLIGHT.map(e => fetchText(e.asset)));
  return loadFlight(EXAMPLE_FLIGHT.map((e, i) => ({ slot: e.slot, name: e.name, text: texts[i] })));
}
