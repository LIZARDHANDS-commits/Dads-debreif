// The modules on the home screen, in build order (SPEC.md). A module with
// `load: null` isn't built yet: its card shows "Coming soon" and can't be opened.
// When a module lands, set `load: () => import('../modules/<id>/index.js')`.
// It keeps `prototype: true` until the combined sign-off (D135), which shows
// PROTOTYPE on its card; remove the flag at sign-off. See specs/SPEC-shell.md.

const media = (id) => ({
  webm: `media/cards/${id}.webm`,
  mp4: `media/cards/${id}.mp4`,
  still: `media/cards/${id}.jpg`,
});

export const MODULES = [
  {
    id: 'debrief',
    eyebrow: 'Debrief',
    title: 'Debrief Viewer',
    blurb: 'Tracks, DFPs, EM and geometry, in 2D and 3D',
    details: {
      summary: 'Flight telemetry replay and sortie debriefing with 2D/3D track reconstruction and energy-maneuverability curves.',
      capabilities: [
        'Multi-ship GPS telemetry replay with play, pause, and scrub controls',
        'Automated Debrief Focus Points (DFPs) marking maneuver entry, apex, and rollout',
        'Energy-Maneuverability (E-M) flight envelope comparison calibrated to T-6/Harvard II charts',
        'Formation geometry, separation distance, and bearing-line analysis in 2D and 3D',
      ],
    },
    media: media('debrief'),
    load: () => import('../modules/debrief/index.js'),
  },
  {
    id: 'turn-sim',
    eyebrow: 'Formation',
    title: 'Formation Simulator',
    blurb: 'Tactical formation turns, step by step',
    details: {
      summary: 'Step-by-step procedural tactical formation turn and rejoin flight simulator.',
      capabilities: [
        'Tactical turns: Delayed 90, Check 20, Hook Turn, Shackle, Cross Turn, and In-place 90',
        'Turning Rejoins (TRJ) and Straight-Ahead Rejoins (SARJ) with vertical lane tracking',
        'Real-time station-keeping and rollout judging against 15 Wing SMM standards',
        'Dynamic 2D bird’s-eye tactical map and 3D chase perspective views',
      ],
    },
    media: media('turn-sim'),
    load: () => import('../modules/turn-sim/index.js'),
    prototype: true,
  },
  {
    id: 'turn-fight',
    eyebrow: 'BFM · v2.2',
    title: 'Fight and Turn Sim',
    blurb: '1-circle, 2-circle and 3D BFM AI fights (Harvard II 5.0 G)',
    details: {
      summary: 'Tactical Basic Fighter Maneuvers (BFM) sandbox with real-time AI adversaries.',
      capabilities: [
        '1-circle (nose-to-nose) and 2-circle (nose-to-tail) tactical turn engagements',
        'Aero flight dynamics tuned to CT-156 Harvard II 5.0 G limits and energy bleed',
        'Adaptive AI opponent reacting with authentic BFM counter-maneuvers and power control',
        '3D flight arena with HUD pitch ladder, turn circle radius, and aspect angle telemetry',
      ],
    },
    media: media('turn-fight'),
    load: () => import('../modules/turn-fight/index.js'),
    prototype: true,
  },
  {
    id: 'traffic',
    eyebrow: 'Traffic · v2.2',
    title: 'Traffic Pattern Sim',
    blurb: 'Define patterns, then fly aircraft through them',
    details: {
      summary: 'Military airfield traffic pattern and overhead break procedural simulator.',
      capabilities: [
        'Military overhead breaks, entry procedures, closed patterns, and straight-in arrivals',
        'Moose Jaw (CYMJ) runway configurations, RSU/tower calls, and spacing intervals',
        'Wind-shaped pattern tracks with realistic crab angles on base and final',
        'Multi-aircraft traffic sequencing with automated spacing conflict detection',
      ],
    },
    media: media('traffic'),
    load: () => import('../modules/traffic/index.js'),
    prototype: true,
  },
  {
    id: 'sof',
    eyebrow: 'Operations',
    title: 'SOF Dashboard',
    blurb: 'Weather, limits, radar, traffic and lightning',
    details: {
      summary: 'Real-time operational weather and flight safety monitor for the Supervisor of Flying.',
      capabilities: [
        'Live METAR and TAF decoding with automated flight category status (VFR/MVFR/IFR)',
        'Runway crosswind, headwind, and tailwind component calculations with aircraft limits',
        'Regional radar mosaic, lightning strike proximity warnings, and ceiling tracking',
        'Home field (CYMJ) and alternate recovery divert planning logic',
      ],
    },
    media: media('sof'),
    load: () => import('../modules/sof/index.js'),
    prototype: true,
  },
];

export const isBuilt = (entry) => typeof entry.load === 'function';
export const moduleIds = () => MODULES.map((m) => m.id);
export const findModule = (id) => MODULES.find((m) => m.id === id) ?? null;
