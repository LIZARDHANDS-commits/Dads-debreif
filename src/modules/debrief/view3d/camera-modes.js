// The 3D view's camera choices (DB-22): which mount (Overview, Chase or Cockpit), how it aims (Boresight, Freelook or
// Padlock), which ship it rides and which ship Padlock keeps in view. They are read from, and written back to, the
// layout settings the Debrief already keeps (cam3d, cockpitShip3d, cockpitSeat3d) plus aim3d and padlockShip3d, so a
// choice saved before the bar opens as it did. Plain values, no page access. Display only: no flight math.

/** The mounts, in bar order. cam3d holds 'followLead' or 'formation' for Overview, 'chase' or 'cockpit' otherwise. */
export const MOUNTS = Object.freeze([
  { id: 'overview', label: 'Overview', title: 'The whole formation from outside' },
  { id: 'chase', label: 'Chase', title: 'Behind the chosen ship' },
  { id: 'cockpit', label: 'Cockpit', title: 'From the chosen ship\'s seat' },
]);

/** Overview's two views (the old Camera menu's first two choices). */
export const OVERVIEW_PRESETS = Object.freeze([
  { id: 'followLead', label: 'Follow Lead' },
  { id: 'formation', label: 'Centre formation' },
]);

/** How Chase and Cockpit aim. Chase calls Boresight "Trail" and Freelook "Orbit", as Traffic's Chase does. */
export const AIM_MODES = Object.freeze({
  chase: [
    { id: 'boresight', label: 'Trail', title: 'Straight behind the ship' },
    { id: 'freelook', label: 'Orbit', title: 'Drag to swing round the ship' },
    { id: 'padlock', label: 'Padlock', title: 'Keep another ship in view' },
  ],
  cockpit: [
    { id: 'boresight', label: 'Boresight', title: 'Looking along the nose' },
    { id: 'freelook', label: 'Freelook', title: 'Drag to turn your head' },
    { id: 'padlock', label: 'Padlock', title: 'Keep another ship in view' },
  ],
});

export const SEATS = Object.freeze([
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
]);

export const SLOTS = Object.freeze([1, 2, 3, 4]);
export const shipLabel = (slot) => (slot === 1 ? 'Lead' : `#${slot}`);

/** The settings keys the bar owns, with their allowed values (index.js checks saved ones against these). */
export const CAMERA_ALLOWED = Object.freeze({
  cam3d: ['followLead', 'formation', 'chase', 'cockpit'],
  aim3d: ['boresight', 'freelook', 'padlock'],
  cockpitShip3d: [...SLOTS],
  cockpitSeat3d: SEATS.map((s) => s.id),
  padlockShip3d: [0, ...SLOTS],
});

/** The bar's state from the layout values: { mount, preset, aim, ship, seat, padlock (0 = automatic) }. */
export function cameraFromSettings(v) {
  const mount = v.cam3d === 'chase' || v.cam3d === 'cockpit' ? v.cam3d : 'overview';
  return {
    mount,
    preset: v.cam3d === 'formation' ? 'formation' : 'followLead',
    aim: v.aim3d ?? 'freelook',
    ship: v.cockpitShip3d ?? 1,
    seat: v.cockpitSeat3d ?? 'front',
    padlock: v.padlockShip3d ?? 0,
  };
}

/** Whether the camera sits in a ship (Chase or Cockpit), where the picture is true scale. */
export const ridesShip = (v) => v.cam3d === 'chase' || v.cam3d === 'cockpit';

/**
 * The ship Padlock keeps in view, or null when there is none: the chosen one if it is loaded and isn't the ridden ship,
 * else Lead for a wingman and #2 for Lead (the lowest other loaded ship). loaded: the slots with a track.
 */
export function padlockTarget(v, loaded) {
  const ship = v.cockpitShip3d;
  const others = SLOTS.filter((s) => s !== ship && loaded.includes(s));
  if (!others.length) return null;
  if (v.padlockShip3d && others.includes(v.padlockShip3d)) return v.padlockShip3d;
  return others[0]; // Lead for a wingman (1 is lowest), #2 for Lead
}

/** The next (step 1) or previous (-1) ship to lock on to, among the loaded ships other than the ridden one. */
export function cycleTarget(v, loaded, step) {
  const others = SLOTS.filter((s) => s !== v.cockpitShip3d && loaded.includes(s));
  if (!others.length) return null;
  const now = padlockTarget(v, loaded);
  const i = others.indexOf(now);
  return others[(i + step + others.length) % others.length];
}

/** What happens to the settings when a pill is pressed. `lastPreset` is the Overview view to go back to. */
export function patchForMount(mount, lastPreset = 'followLead') {
  const head = { headYaw3d: 0, headPitch3d: 0 }; // a new mount starts looking straight ahead
  return { cam3d: mount === 'overview' ? lastPreset : mount, ...head };
}

/** The ship to ride when the chosen one isn't loaded: the lowest loaded slot, or null for none. */
export function shipToRide(v, loaded) {
  if (loaded.includes(v.cockpitShip3d) || !loaded.length) return null;
  return Math.min(...loaded);
}
