// The 3D view's camera bar (DB-22), laid over the bottom of the picture in the same way as the Traffic sim's: a row of
// mount pills (Overview, Chase, Cockpit), then what belongs to the mount (the two Overview views, or the aim modes),
// the seat (Cockpit only) and the ship to ride (Chase and Cockpit), a line of key hints and a note. It reads and writes
// the layout settings (camera-modes.js); it draws nothing itself and has no flight math.
import { h, clear } from '../../../ui-kit/dom.js';
import { createPillGroup, hintNodes } from '../../../ui-kit/camera-bar.js';
import {
  MOUNTS, OVERVIEW_PRESETS, AIM_MODES, SEATS, SLOTS, shipLabel,
  cameraFromSettings, padlockTarget, cycleTarget, patchForMount, shipToRide,
} from './camera-modes.js';

const PREFIX = 'debrief-cam';
const noKeys = (e) => e.altKey || e.ctrlKey || e.metaKey;
/** A key press that belongs to a field the person is typing in or choosing from. */
const inField = (e) => {
  const t = e.target;
  return Boolean(t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)));
};

/**
 * layout: the settings (get, update). listen: app.listen, so the keys end when the Debrief closes.
 * Returns { element, sync(values, loaded): shows the bar for the current settings and the loaded ship slots }.
 */
export function createCameraBar({ layout, listen }) {
  let loaded = [];
  let lastPreset = 'followLead';
  let beforePadlock = 'freelook'; // the aim P returns to

  const mounts = createPillGroup({
    prefix: PREFIX, label: 'Camera', items: MOUNTS, onPick: (id) => layout.update(patchForMount(id, lastPreset)),
  });
  const presets = createPillGroup({
    prefix: PREFIX, label: 'Overview view', items: OVERVIEW_PRESETS, onPick: (id) => layout.update({ cam3d: id }),
  });
  const aimsFor = (mount) => createPillGroup({
    prefix: PREFIX, label: 'Aim', items: AIM_MODES[mount], onPick: (id) => pickAim(id),
  });
  const aims = { chase: aimsFor('chase'), cockpit: aimsFor('cockpit') };
  const seats = createPillGroup({ prefix: PREFIX, label: 'Seat', items: SEATS, onPick: (id) => layout.update({ cockpitSeat3d: id }) });
  const ships = createPillGroup({
    prefix: PREFIX, label: 'Ship', items: SLOTS.map((s) => ({ id: s, label: shipLabel(s) })), onPick: (id) => layout.update({ cockpitShip3d: id }),
  });
  const hint = h('div', { class: `${PREFIX}-hint` });
  const note = h('span', { class: `${PREFIX}-note`, role: 'status', 'aria-live': 'polite' });
  const groups = [mounts, presets, aims.chase, aims.cockpit, seats, ships];
  const element = h('div', { class: `${PREFIX}-bar`, role: 'group', 'aria-label': '3D camera', hidden: true },
    h('div', { class: `${PREFIX}-row` }, ...groups.map((g) => g.element)),
    hint,
    note);
  // The bar sits over the picture: a press on it must not start a drag of the view underneath.
  element.addEventListener('pointerdown', (e) => e.stopPropagation());

  function pickAim(id) {
    if (id === 'padlock') beforePadlock = layout.get().aim3d === 'padlock' ? beforePadlock : layout.get().aim3d;
    layout.update({ aim3d: id, headYaw3d: 0, headPitch3d: 0 });
  }

  function sync(values, slots) {
    loaded = slots;
    const cam = cameraFromSettings(values);
    if (cam.mount === 'overview') lastPreset = cam.preset;
    // A ship saved from another flight that isn't loaded now: ride the lowest one that is.
    const ride = cam.mount !== 'overview' ? shipToRide(values, slots) : null;
    if (ride) {
      layout.update({ cockpitShip3d: ride });
      return; // update runs sync again with the new ship
    }
    const target = padlockTarget(values, slots);
    mounts.set(cam.mount);
    presets.set(cam.preset);
    presets.element.hidden = cam.mount !== 'overview';
    const noOne = { padlock: 'Needs a second ship loaded' };
    for (const mount of Object.keys(aims)) {
      aims[mount].element.hidden = cam.mount !== mount;
      aims[mount].set(cam.aim, { disabled: target ? {} : noOne });
    }
    seats.element.hidden = cam.mount !== 'cockpit';
    seats.set(cam.seat);
    ships.element.hidden = cam.mount === 'overview';
    ships.set(cam.ship, { disabled: Object.fromEntries(SLOTS.filter((s) => !slots.includes(s)).map((s) => [s, `No ${shipLabel(s)} loaded`])) });
    showHint(cam.mount, cam.aim);
    const text = cam.mount !== 'overview' && cam.aim === 'padlock'
      ? (target ? `Padlock: keeping ${shipLabel(target)} in view` : 'Padlock needs a second ship loaded') : '';
    if (note.textContent !== text) note.textContent = text;
  }

  let shownHint = null;
  function showHint(mount, aim) {
    if (shownHint === `${mount}|${aim}`) return;
    shownHint = `${mount}|${aim}`;
    clear(hint);
    const k = (key) => ({ key });
    if (mount === 'overview') hint.append('Drag orbits · Scroll zooms');
    else {
      hint.append(...hintNodes(PREFIX, [
        k('C'), ' Center look   ', k('P'), ' Toggle padlock   ', k('['), '/', k(']'), ' Padlock target  ·  ',
        aim !== 'freelook' ? 'Freelook to drag' : mount === 'chase' ? 'Drag swings round' : 'Drag turns your head',
      ]));
    }
  }

  // C, P and [ ] while the Debrief is open, 3D shows a ship's view, and nobody is typing in a field.
  listen(document, 'keydown', (e) => {
    const values = layout.get();
    if (noKeys(e) || inField(e) || values.view !== '3d' || element.hidden || values.cam3d === 'followLead' || values.cam3d === 'formation') return;
    const key = e.key.toLowerCase();
    if (key === 'c') layout.update({ headYaw3d: 0, headPitch3d: 0 });
    else if (key === 'p') {
      if (values.aim3d === 'padlock') layout.update({ aim3d: beforePadlock, headYaw3d: 0, headPitch3d: 0 });
      else if (padlockTarget(values, loaded)) {
        beforePadlock = values.aim3d;
        layout.update({ aim3d: 'padlock', headYaw3d: 0, headPitch3d: 0 });
      }
    } else if (key === '[' || key === ']') {
      const next = cycleTarget(values, loaded, key === ']' ? 1 : -1);
      if (next) layout.update({ padlockShip3d: next });
    } else return;
    e.preventDefault();
  });

  return { element, sync };
}
