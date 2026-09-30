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
    media: media('debrief'),
    load: () => import('../modules/debrief/index.js'),
  },
  {
    id: 'turn-sim',
    eyebrow: 'Formation',
    title: 'Formation Turn Sim',
    blurb: 'Tactical formation turns, step by step',
    media: media('turn-sim'),
    load: () => import('../modules/turn-sim/index.js'),
    prototype: true,
  },
  {
    id: 'turn-fight',
    eyebrow: 'BFM',
    title: 'Turn Fight',
    blurb: '1-circle, 2-circle and vertical fights',
    media: media('turn-fight'),
    load: null,
    prototype: true,
  },
  {
    id: 'traffic',
    eyebrow: 'Flying training',
    title: 'Traffic Pattern Sim',
    blurb: 'Define patterns, then fly aircraft through them',
    media: media('traffic'),
    load: null,
    prototype: true,
  },
  {
    id: 'sof',
    eyebrow: 'Operations',
    title: 'SOF Dashboard',
    blurb: 'Weather, limits, radar, traffic and lightning',
    media: media('sof'),
    load: () => import('../modules/sof/index.js'),
    prototype: true,
  },
];

export const isBuilt = (entry) => typeof entry.load === 'function';
export const moduleIds = () => MODULES.map((m) => m.id);
export const findModule = (id) => MODULES.find((m) => m.id === id) ?? null;
