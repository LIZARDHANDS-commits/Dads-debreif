// The profile for any home field the SOF has no data for (plan Step 2c, part A): every optional part is empty or null, so nothing is drawn from
// Moose Jaw's data and no feed is started for a service this base has not been given. A `null` source reads "no source for this base, can't tell",
// never a tick (an ECCC picture outside Canada comes back empty and must never read as "no lightning").
//
// `standards` is null: the SOF has no weather limits for this base, and says "Limits not set" rather than "within limits" (Step B).
export const GENERIC = Object.freeze({
  icao: null,
  name: 'No site profile',
  airspace: Object.freeze([]),
  watchedAreas: Object.freeze([]),
  towns: Object.freeze([]),
  anchorStations: Object.freeze([]),
  tourTargets: Object.freeze([]),
  // Not known for this base. 0 is only a stand-in so the arithmetic works; the source says so, and the screen words say "not set for this base".
  magVarDegE: Object.freeze({ value: 0, source: 'unknown (estimate)' }),
  bbox: null,
  charts: Object.freeze({ vnc: false }),
  routes: Object.freeze([]),
  sources: Object.freeze({
    radar: null,
    lightning: null,
    satellite: null,
    warnings: null,
    modelClouds: null,
    modelCloudMask: null,
    notams: null,
    alerts: null,
    fronts: null,
  }),
  credits: Object.freeze({ confirm: null, model: null, pictures: null, mapFeeds: null }),
  standards: null,
});
