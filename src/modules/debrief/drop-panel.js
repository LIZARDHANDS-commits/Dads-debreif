// The Drop box in the Formation column (DB-36, spec section "Simulated drop"): opened from Tools and closed with its own
// button, as the tennis ball's. The essentials show first (load, ship, Drop now, At time…, Place on map, the answer);
// the drop zone's size and the wind sit below, and the load's numbers (all estimates) under "More". The answer comes from
// drop.js dropWords, the same result the map and the 3D view draw, so the words and the pictures never disagree.
import { h, clear } from '../../ui-kit/dom.js';
import { LOAD_OPTIONS, DROP_LIMITS } from './drop.js';

/** The Ship list for a load of four or fewer, as always; an exercise lists every loaded ship by its label (setShips, DB-37). */
const SHIPS = [1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? '#1 Lead' : `#${n}` }));

/**
 * controls: the debrief's createControls; layout: its remembered settings.
 * on: { dropNow(), dropAt(text) → message or '', clear(), place(), cancelPlace(), preset() }.
 * Returns { element, render(words, state), setShips(list) } with words from dropWords and state { flight, placing, placed,
 * nowText, is3d }; setShips([{ value, label }]) gives the Ship list its ships (null: #1 Lead to #4, as always).
 */
export function createDropPanel({ controls, layout, on }) {
  const status = h('p', { class: 'drop-status', role: 'status' });
  const lines = h('ul', { class: 'drop-lines' });
  const L = DROP_LIMITS;

  const dropNow = h('button', { type: 'button', class: 'button primary', onclick: () => on.dropNow() }, 'Drop now');
  const atTimeButton = h('button', { type: 'button', class: 'button', 'aria-expanded': 'false', 'aria-controls': 'debrief-drop-at' }, 'At time…');
  const clearButton = h('button', { type: 'button', class: 'button', onclick: () => on.clear() }, 'Clear drop');
  const timeInput = h('input', { type: 'text', id: 'debrief-drop-time', inputmode: 'numeric', autocomplete: 'off', placeholder: 'hh:mm:ssZ', 'aria-describedby': 'debrief-drop-time-message' });
  const timeMessage = h('span', { class: 'control-message', id: 'debrief-drop-time-message' });
  const timeGo = h('button', { type: 'button', class: 'button' }, 'Drop at this time');
  const atRow = h('div', { class: 'drop-at', id: 'debrief-drop-at', hidden: true },
    h('label', { for: timeInput.id }, 'Release time (Zulu)'), timeInput, timeGo, timeMessage);
  const submitTime = () => {
    const problem = on.dropAt(timeInput.value);
    timeMessage.textContent = problem;
    if (problem) timeInput.setAttribute('aria-invalid', 'true');
    else timeInput.removeAttribute('aria-invalid');
  };
  timeGo.addEventListener('click', submitTime);
  timeInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitTime();
  });
  let lastNowText = '';
  atTimeButton.addEventListener('click', () => {
    atRow.hidden = !atRow.hidden;
    atTimeButton.setAttribute('aria-expanded', String(!atRow.hidden));
    if (!atRow.hidden) {
      if (!timeInput.value) timeInput.value = lastNowText;
      timeInput.focus();
    }
  });

  // The drop zone: placed by a tap on the 2D map, then its shape and size.
  const placeButton = h('button', { type: 'button', class: 'button', 'aria-pressed': 'false' }, 'Place on map');
  placeButton.addEventListener('click', () => (placeButton.getAttribute('aria-pressed') === 'true' ? on.cancelPlace() : on.place()));
  const placeNote = h('p', { class: 'drop-note', role: 'status' });
  const radius = controls.number('dropRadiusFt', { label: 'Radius', unit: 'ft', ...L.radiusFt });
  const length = controls.number('dropLengthFt', { label: 'Length', unit: 'ft', ...L.lengthFt });
  const width = controls.number('dropWidthFt', { label: 'Width', unit: 'ft', ...L.widthFt });
  const runIn = controls.select('dropRunIn', { label: 'Run-in', options: [
    { value: 'track', label: "The ship's track at release" },
    { value: 'set', label: 'Set heading' },
  ] });
  const runInDeg = controls.number('dropRunInDeg', { label: 'Run-in heading', unit: '°T', ...L.headingDeg });
  const zoneBox = h('div', { class: 'drop-group', role: 'group', 'aria-labelledby': 'debrief-drop-zone-title' },
    h('h3', { id: 'debrief-drop-zone-title' }, 'Drop zone'),
    h('div', { class: 'drop-row' }, placeButton),
    placeNote,
    h('div', { class: 'drop-controls' },
      controls.select('dropShape', { label: 'Shape', options: [{ value: 'circle', label: 'Circle' }, { value: 'box', label: 'Box' }] }),
      radius, length, width, runIn, runInDeg),
    h('p', { class: 'drop-note' }, 'Sizes are estimates to start from (300 ft circle; 1,000 × 300 ft box).'));

  // The wind: the Debrief's model winds aloft, or typed at the release height and the ground.
  const typed = [
    controls.number('dropWindTopDeg', { label: 'At release, from', unit: '°T', ...L.windDeg }),
    controls.number('dropWindTopKt', { label: 'At release', unit: 'kt', ...L.windKt }),
    controls.number('dropWindGroundDeg', { label: 'At the ground, from', unit: '°T', ...L.windDeg }),
    controls.number('dropWindGroundKt', { label: 'At the ground', unit: 'kt', ...L.windKt }),
  ];
  const windBox = h('div', { class: 'drop-group', role: 'group', 'aria-labelledby': 'debrief-drop-wind-title' },
    h('h3', { id: 'debrief-drop-wind-title' }, 'Wind'),
    h('div', { class: 'drop-controls' },
      controls.select('dropWind', { label: 'Source', options: [{ value: 'model', label: 'Model winds aloft' }, { value: 'typed', label: 'Typed' }] }),
      ...typed),
    h('p', { class: 'drop-note' }, 'Typed winds blend in a straight line from the ground to the release height.'));

  // More: the load's numbers, prefilled from its preset, every one an estimate (drop-plan.md).
  const chuteControls = [
    controls.number('dropOpenDelaySec', { label: 'Parachute delay (estimate)', unit: 's', ...L.delaySec }),
    controls.number('dropFillSec', { label: 'Fill time (estimate)', unit: 's', ...L.fillSec }),
    controls.number('dropCanopyCdaFt2', { label: 'Canopy Cd·A (estimate)', unit: 'ft²', ...L.canopyCdaFt2 }),
  ];
  const more = h('details', { class: 'drop-more' },
    h('summary', {}, 'More'),
    h('div', { class: 'drop-controls' },
      controls.number('dropWeightLb', { label: 'Weight (estimate)', unit: 'lb', ...L.weightLb }),
      controls.number('dropCdaFt2', { label: 'Cd·A (estimate)', unit: 'ft²', ...L.cdaFt2 }),
      ...chuteControls),
    h('p', { class: 'drop-note' }, 'Every load number is an estimate until drop-plan.md gives its page.'),
    h('button', { type: 'button', class: 'button', onclick: () => on.preset() }, "Back to the load's preset"));

  const loadControl = controls.select('dropLoad', { label: 'Load', options: LOAD_OPTIONS });
  // The Ship list: the shared select for #1 Lead to #4, as always; an exercise's own list of its loaded ships by label (DB-37).
  const fourShips = controls.select('dropShip', { label: 'Ship', options: SHIPS });
  const shipSelect = h('select', { id: 'debrief-drop-ship-ex' });
  shipSelect.addEventListener('change', () => layout.update({ dropShip: Number(shipSelect.value) }));
  const exerciseShips = h('div', { class: 'control control-select', hidden: true }, h('label', { for: shipSelect.id }, 'Ship'), shipSelect);
  const shipControl = h('div', { class: 'drop-ship' }, fourShips, exerciseShips);
  let shipsKey = '';
  function setShips(list) {
    fourShips.hidden = Boolean(list);
    exerciseShips.hidden = !list;
    const key = list ? list.map((s) => `${s.value}:${s.label}`).join('|') : '';
    if (key !== shipsKey) {
      shipsKey = key;
      clear(shipSelect);
      for (const s of list ?? []) shipSelect.append(h('option', { value: String(s.value) }, s.label));
    }
    if (list) shipSelect.value = String(layout.get().dropShip);
  }
  loadControl.classList.add('drop-wide');
  const element = h(
    'section',
    { class: 'drop-panel', 'aria-labelledby': 'debrief-drop-title', hidden: true },
    h('div', { class: 'drop-head' },
      h('h2', { id: 'debrief-drop-title' }, 'Drop'),
      h('button', { type: 'button', class: 'button', 'aria-label': 'Close drop', onclick: () => layout.update({ dropOpen: false }) }, 'Close')),
    status,
    lines,
    h('div', { class: 'drop-controls' }, loadControl, shipControl),
    h('div', { class: 'drop-row' }, dropNow, atTimeButton, clearButton),
    atRow,
    zoneBox,
    windBox,
    more,
  );

  // Only what applies shows: the circle's radius or the box's sizes, the set heading, the typed boxes, the parachute's numbers.
  function showFor(values) {
    const box = values.dropShape === 'box';
    radius.hidden = box;
    length.hidden = !box;
    width.hidden = !box;
    runIn.hidden = !box;
    runInDeg.hidden = !box || values.dropRunIn !== 'set';
    for (const el of typed) el.hidden = values.dropWind !== 'typed';
    for (const el of chuteControls) el.hidden = values.dropLoad !== 'a22g12';
  }
  showFor(layout.get());

  let last = '';
  return {
    element,
    showFor: (values) => {
      showFor(values);
      if (shipsKey) shipSelect.value = String(values.dropShip);
    },
    setShips,
    /** words: dropWords's; state: { flight, placing, placed, nowText, is3d, hasRelease }. */
    render(words, state) {
      lastNowText = state.nowText ?? '';
      dropNow.disabled = !state.flight;
      atTimeButton.disabled = !state.flight;
      timeGo.disabled = !state.flight;
      placeButton.disabled = !state.flight;
      clearButton.hidden = !state.hasRelease;
      placeButton.setAttribute('aria-pressed', String(Boolean(state.placing)));
      placeButton.textContent = state.placing ? 'Cancel placing' : state.placed ? 'Move on map' : 'Place on map';
      const note = state.placing
        ? (state.is3d ? 'Switch to 2D, then tap the map where the load should land.' : 'Tap the map where the load should land.')
        : state.placed ? 'Point of impact placed: the cross in the drop zone.' : 'No point of impact yet.';
      if (placeNote.textContent !== note) placeNote.textContent = note;
      const key = `${words.status}|${words.tone}|${words.lines.join('|')}`;
      if (key === last) return;
      last = key;
      status.textContent = words.status;
      status.hidden = !words.status;
      status.className = `drop-status tone-${words.tone}`;
      clear(lines);
      for (const line of words.lines) lines.append(h('li', {}, line));
    },
  };
}
