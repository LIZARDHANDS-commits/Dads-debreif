// Spike demo: today's 2D-canvas Debrief 3D view next to the three.js one, same flight, time and settings.
import { loadExampleFlight } from '../src/flight-data/examples.js';
import { createExampleFetcher } from '../src/shell/examples.js';
import { LAYOUT_DEFAULTS } from '../src/modules/debrief/state.js';
import { createView3d } from '../src/modules/debrief/view3d/view.js';
import { createThreeView3d } from '../src/modules/debrief/view3d/three-view.js';
import { shipsIn3d } from '../src/modules/debrief/view3d/frame.js';

const params = new URLSearchParams(location.search);
const settings = { ...LAYOUT_DEFAULTS };
for (const k of Object.keys(settings)) if (params.has(k)) settings[k] = Number.isNaN(+params.get(k)) ? params.get(k) : +params.get(k);
if (params.has('three-only')) document.body.classList.add('only-three');

const fetchText = createExampleFetcher({ base: `${location.origin}/` });
const flight = await loadExampleFlight(fetchText);

// Find a moment with the lead in a hard turn.
const step = 5;
let pick = null;
for (let t = flight.startT; t < flight.endT; t += step) {
  const lead = shipsIn3d(flight, t).find((s) => s.slot === 1);
  if (lead && !lead.inGap && Math.abs(lead.bankDeg) > 30) { pick = t; break; }
}
let t = params.has('t') ? +params.get('t') : pick ?? (flight.startT + flight.endT) / 2;
const lead = shipsIn3d(flight, t).find((s) => s.slot === 1);
document.getElementById('info').textContent = `t = ${t.toFixed(0)} s, lead bank ${lead.bankDeg.toFixed(0)}° (left wing down positive), pitch ${lead.pitchDeg.toFixed(0)}°`;
console.log('PICKED_TIME', t, 'lead bank', lead.bankDeg);

const timers = {
  frame(fn) {
    const id = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(id);
  },
};
const common = { flight: () => flight, time: () => t, settings: () => settings, fieldFt: () => 1892 };
const today = createView3d(document.getElementById('today'), { timers, ...common, setCamera: () => {} });
const three = createThreeView3d(document.getElementById('three'), common);
const draw = () => { today.requestDraw(); three.render(); };
draw();
addEventListener('resize', draw);

const slider = document.getElementById('slider');
slider.value = Math.round(((t - flight.startT) / (flight.endT - flight.startT)) * 1000);
slider.addEventListener('input', () => {
  t = flight.startT + (slider.value / 1000) * (flight.endT - flight.startT);
  draw();
});

window.demo = {
  flight, three, settings,
  set(patch) { Object.assign(settings, patch); draw(); },
  setTime(v) { t = v; draw(); },
  get t() { return t; },
};
window.demoReady = true;
