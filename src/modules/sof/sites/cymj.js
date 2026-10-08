// The Moose Jaw site profile (plan Step 2c, part A): the SOF's own base-specific data for 15 Wing Moose Jaw, in one place.
// Nothing here is new. Every field points at the module that already held the data (airspace-data.js, towns-data.js, stations-data.js, tour-model.js,
// airspace-occupancy.js, model-clouds.js, feeds.js, ...), so there is still one copy of each number. Those modules do not import the profile back
// (the screen code that reads a profile passes the value in), so there is no import cycle.
//
// `icao` is the base this data is FOR. It is also used for any other Canadian home field (sites/index.js), so it is not always the home field.
//
// The shape is the same for every profile (see generic.js, which has every optional part empty or null). A source that is `null` means "this base has no
// such service": the SOF starts no feed for it and its line says "no source for this base, can't tell", never a tick.
import { AIRSPACE } from '../airspace-data.js';
import { TOWNS } from '../towns-data.js';
import { ANCHOR_STATIONS } from '../stations-data.js';
import { TOUR_TARGETS } from '../tour-model.js';
import { LAYERS, DEFAULT_BBOX } from '../feeds.js';
import { EXTRA_LAYERS } from '../map-feeds.js';
import { WATCHED_AREAS } from '../airspace-occupancy.js';
import { MAG_VARIATION_DEG_E } from '../model-clouds.js';
import { LIGHTNING_DEFAULTS } from '../lightning.js';
import { CROSSWIND_DEFAULTS, CROSSWIND_SOURCE } from '../crosswind.js';
import { DEFAULT_LIMITS, HOME_TRIGGERS } from '../../../wx/limits.js';

export const CYMJ = Object.freeze({
  icao: 'CYMJ',
  name: '15 Wing Moose Jaw',
  // NAV CANADA's Designated Airspace Handbook, each entry with its page (SOF-41); the shape is written at the top of airspace-data.js.
  airspace: AIRSPACE,
  watchedAreas: WATCHED_AREAS, // CYA304, CYA305, CYA307 (Dad, 7 Oct)
  towns: TOWNS,
  anchorStations: ANCHOR_STATIONS,
  tourTargets: TOUR_TARGETS,
  // Degrees East, magnetic = true - this: Patrick's ruling, 4 Oct 2026 (TR-65); model-clouds.js owns the number.
  magVarDegE: Object.freeze({ value: MAG_VARIATION_DEG_E, source: "Patrick's ruling, 4 Oct 2026 (TR-65)" }),
  // Southern Saskatchewan around Moose Jaw, [west, south, east, north] degrees (feeds.js `getMapUrl`'s default box).
  bbox: DEFAULT_BBOX,
  // The VNC charts cover Moose Jaw, Regina, Saskatoon and Swift Current (map.js draws them; they are the Debrief's).
  charts: Object.freeze({ vnc: true }),
  // Which route sets this base draws: 'training' is the Debrief's routes and areas (the map's "Training routes and areas" layer),
  // 'tacnav' is the ones with TAC in the name, drawn 500 ft above the ground in 3D (SOF-41). map.js draws them from the Debrief's data.
  routes: Object.freeze(['training', 'tacnav']),
  // Where each kind of picture or report comes from for this base. `layer`/`layers` are ECCC GeoMet layer names (feeds.js `LAYERS`,
  // map-feeds.js `EXTRA_LAYERS`); `via` says the relay's route. `credit` is the words the screen shows.
  sources: Object.freeze({
    radar: Object.freeze({
      name: 'ECCC GeoMet radar',
      layers: Object.freeze({ rain: LAYERS.radarRain, snow: LAYERS.radarSnow, coverage: LAYERS.coverage }),
      backup: 'RainViewer',
      credit: 'ECCC (Open Government Licence)',
    }),
    lightning: Object.freeze({ name: 'ECCC GeoMet lightning density', layer: LAYERS.lightning, credit: 'ECCC (Open Government Licence)' }),
    satellite: Object.freeze({ name: 'ECCC GeoMet GOES cloud picture', layer: EXTRA_LAYERS.cloud, credit: 'ECCC (Open Government Licence)' }),
    warnings: Object.freeze({ name: 'ECCC GeoMet weather warnings', layer: EXTRA_LAYERS.warnings, credit: 'ECCC (Open Government Licence)' }),
    modelClouds: Object.freeze({ name: 'Open-Meteo, ECCC HRDPS and GEM', credit: 'Open-Meteo (CC BY 4.0), ECCC HRDPS and GEM (model estimate)' }),
    modelCloudMask: Object.freeze({ name: 'ECCC GeoMet HRDPS total cloud', layer: LAYERS.modelCloud, credit: 'ECCC (Open Government Licence)' }),
    notams: Object.freeze({ name: 'NAV CANADA flight weather site', via: 'relay /notam', credit: 'NAV CANADA' }),
    alerts: Object.freeze({ name: 'NAV CANADA SIGMETs, AIRMETs and PIREPs', via: 'relay /alerts', credit: 'NAV CANADA' }),
    fronts: Object.freeze({ name: 'WPC coded surface analysis (CODSUS)', via: 'relay /fronts', credit: 'WPC surface analysis' }),
  }),
  // The words of the credits line (screen-model.js `creditsFor`) and the map's (map-model.js `mapCredits`), as they read today.
  credits: Object.freeze({
    confirm: 'Confirm with NAV CANADA.',
    model: 'Model clouds and winds in the 3D view: Open-Meteo (CC BY 4.0), ECCC HRDPS and GEM (model estimate).',
    pictures: '3D fronts: WPC surface analysis; satellite, radar and lightning: ECCC.',
    mapFeeds: 'radar, lightning, cloud and warnings: ECCC (Open Government Licence)',
  }),
  // Today's Moose Jaw limits, by reference: the existing exports, not copies (their sources are named where they are defined).
  standards: Object.freeze({
    homeTriggers: HOME_TRIGGERS, // src/wx/limits.js: the local MTCA trigger and the cross-country one
    defaultLimits: DEFAULT_LIMITS, // src/wx/limits.js
    crosswind: CROSSWIND_DEFAULTS, // crosswind.js
    crosswindSource: CROSSWIND_SOURCE,
    lightning: LIGHTNING_DEFAULTS, // lightning.js (20 NM, SOF-3)
  }),
});
