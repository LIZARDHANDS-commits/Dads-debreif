// The Model Showcase (docs/modules/model-showcase/README.md; Patrick, 15 Oct 2026): the CT-156 on its own, a window on the home
// screen for looking at the model. On the ground on its gear with the prop feathered to start, or flying; High or Performance
// files; the Look sliders (weathering, relief, wear); outside (orbit, more zoom) or from either seat (look round, as in Formation).
// mount() builds the controls and the 3D view (world3d.js); everything it starts runs on the shell's scheduler and listeners, so
// the shell stops it all when the module closes. Nothing here is a flight number: it is a picture of the model.
import { h } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { createPillGroup } from '../../ui-kit/camera-bar.js';
import { ct156LookControls } from '../../ui-kit/ct156-look-settings.js';
import { setCt156Level } from '../../ui-kit/ct156-blender.js';
import { TRAFFIC_VERSION } from '../traffic/version.js';
import { createShowcaseWorld } from './world3d.js';

const STYLESHEET = new URL('./model-showcase.css', import.meta.url).href;

const VIEWS = [
  { id: 'outside', label: 'Outside', title: 'Orbit the aircraft: drag to turn, scroll to zoom' },
  { id: 'front', label: 'Front seat', title: 'The student\'s seat: drag to look round, hold Shift to zoom' },
  { id: 'rear', label: 'Rear seat', title: 'The instructor\'s seat: drag to look round, hold Shift to zoom' },
];
const POSES = [
  { id: 'ground', label: 'On the ground', title: 'Gear down, prop stopped and feathered' },
  { id: 'flying', label: 'Flying', title: 'Gear up, prop turning' },
];
const LEVELS = [
  { id: 'high', label: 'High', title: 'The full-detail files' },
  { id: 'performance', label: 'Performance', title: 'The lighter files the simulators use on slower computers' },
];
const HINTS = {
  outside: 'Drag to orbit · scroll to zoom · double-click to reset the zoom',
  front: 'Drag to look round · hold Shift to zoom · double-click to look ahead',
  rear: 'Drag to look round · hold Shift to zoom · double-click to look ahead',
};

function mount(root, app) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = STYLESHEET;
  document.head.append(stylesheet);

  // The files start at High: the best the model has. (The simulators set their own level when they open.)
  setCt156Level('high');

  let world = null;
  const view = h('div', { class: 'ms-view' });
  const hint = h('p', { class: 'ms-hint' }, HINTS.outside);

  const viewPills = createPillGroup({ prefix: 'ms', label: 'Camera', items: VIEWS, onPick: (id) => world?.setView(id) });
  const posePills = createPillGroup({ prefix: 'ms', label: 'Aircraft', items: POSES, onPick: (id) => world?.setPose(id) });
  const levelPills = createPillGroup({ prefix: 'ms', label: 'Graphics', items: LEVELS, onPick: (id) => world?.setLevel(id) });
  const spinBox = h('input', { type: 'checkbox', id: 'ms-spin', checked: true });
  const spinRow = h('label', { class: 'ms-check', for: 'ms-spin' }, spinBox, ' Slow turntable (outside)');
  app.listen(spinBox, 'change', () => world?.setSpin(spinBox.checked));

  const look = createPanel({ title: 'Look (3D): wear and grime', collapsed: false });
  const sliders = ct156LookControls();
  look.body.append(sliders);

  const group = (title, ...children) => h('section', { class: 'ms-group-box' }, h('h2', {}, title), ...children);
  const note = h('p', { class: 'ms-note' }, 'The Look sliders are the same ones as in Formation and Traffic, and are saved for every view.');
  const controls = h('aside', { class: 'ms-controls', 'aria-label': 'Model controls' },
    group('Camera', viewPills.element, spinRow),
    group('Aircraft', posePills.element),
    group('Graphics', levelPills.element),
    look.element,
    note);

  root.append(h('section', { class: 'ms' },
    h('header', { class: 'ms-bar' }, h('h1', {}, 'Model Showcase · CT-156 Harvard II'), h('span', { class: 'ms-version' }, TRAFFIC_VERSION)),
    h('div', { class: 'ms-main' }, h('div', { class: 'ms-view-wrap' }, view, hint), controls)));

  // The lit pills follow the view's state (the Graphics level can also change from outside this page, so it is read from the model's own).
  function showState() {
    if (!world) return;
    const s = world.state();
    viewPills.set(s.view);
    posePills.set(s.pose);
    levelPills.set(s.level);
    spinBox.checked = s.spin;
    spinBox.disabled = s.view !== 'outside';
    hint.textContent = HINTS[s.view];
  }
  viewPills.set('outside');
  posePills.set('ground');
  levelPills.set('high');

  let closed = false;
  createShowcaseWorld({ host: view, onChange: showState }).then((w) => {
    if (closed) {
      w?.dispose();
      return;
    }
    world = w;
    showState();
  }).catch((err) => {
    view.append(h('p', { class: 'ms-3d-note' }, 'The 3D model could not load.'));
    console.warn('Model Showcase: 3D view failed to load', err);
  });

  app.scheduler.frame((dtMs) => world?.tick(dtMs));

  return () => {
    closed = true;
    sliders.stop?.();
    world?.dispose();
    stylesheet.remove();
  };
}

export default { id: 'model-showcase', title: 'Model Showcase', mount };
