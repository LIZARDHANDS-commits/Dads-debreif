// The EP Tabletop, one-screen version (docs/modules/ep-tabletop/spec.md; plan Step 1): the student's screen (the CT-156 front cockpit over
// Moose Jaw, the A-A-B-C-D-E-F step track, the situation and what the instructor has revealed) with the instructor's console behind an
// Instructor switch on the same screen. mount() wires the scenario engine (scenario.js), the 3D view (world3d.js) and the console
// (console.js); everything it starts runs on the shell's scheduler and listeners, so the shell stops it all when the module closes.
//
// Never on the student's side: the scenario's name, the developments to come, the instructor's settings for anything not revealed, or any
// checklist or boldface text (EP-R3, EP-3).
import { h, clear } from '../../ui-kit/dom.js';
import { startSession, act, advance, panelOf, STEPS } from './scenario.js';
import { ENGINE_ROUGHNESS } from './scenarios.js';
import { NUMBERS, LIGHTS, WORDS, labelOf, valueWords, hudOf } from './indications.js';
import { createConsole, clockWords } from './console.js';
import { createWorld3d, startPositionFt } from './world3d.js';

const STYLESHEET = new URL('./ep-tabletop.css', import.meta.url).href;
/** The one version number of the whole tool (rule book, Git and names), shown in the bar. */
const VERSION = 'V2.369';
/** While running, the 3D picture is drawn at most this often (milliseconds): only the panel moves, so 10 a second is plenty (an estimate). */
const DRAW_MS = 100;

const ftWords = (n) => `${Math.round(n).toLocaleString('en-CA')} ft`;
const COMPASS_8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** The situation the student is given at the start (spec, "Scenarios": the start state), in words. Nothing about what comes next. */
function situationLines(start) {
  const p = start.position;
  const from = `${p.distNm} NM ${COMPASS_8[Math.round(p.bearingDegT / 45) % 8]} of ${p.fromIcao}`;
  return [
    start.phase,
    `${ftWords(start.altFt)}, ${start.kias} KIAS, heading ${String(start.headingDegM).padStart(3, '0')}°M`,
    from,
    `Fuel ${start.fuelLb.toLocaleString('en-CA')} lb`,
    start.weather,
  ];
}

function mount(root, app) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = STYLESHEET;
  document.head.append(stylesheet);

  let session = startSession(ENGINE_ROUGHNESS);

  // ---- The student's side ----
  const view = h('div', { class: 'ep-view' });
  const hint = h('p', { class: 'ep-hint' }, 'Drag to look round · double-click to look ahead · hold Shift to zoom');
  const stepItems = STEPS.map((st) => h('li', { class: 'ep-step', dataset: { step: st.id } }, h('b', {}, st.letter), ` ${st.name}`, h('span', { class: 'ep-done', 'aria-hidden': 'true' })));
  const banner = h('p', { class: 'ep-banner', role: 'status' });
  const prompts = h('p', { class: 'ep-prompts' });
  const revealedList = h('ul', { class: 'ep-revealed' });
  const track = h('aside', { class: 'ep-track', 'aria-label': 'Step track' },
    h('h2', {}, 'Situation'),
    h('ul', { class: 'ep-situation' }, situationLines(session.scenario.start).map((t) => h('li', {}, t))),
    h('h2', {}, 'A-A-B-C-D-E-F'),
    h('ol', { class: 'ep-steps' }, stepItems),
    banner, prompts,
    h('h2', {}, 'Revealed'),
    revealedList);

  const instructorBtn = h('button', { type: 'button', class: 'ep-btn ep-instructor-btn', 'aria-pressed': 'false', 'aria-controls': 'ep-console' }, 'Instructor');
  const showConsole = (open) => {
    consoleUi.element.hidden = !open;
    instructorBtn.setAttribute('aria-pressed', String(open));
    if (!open) instructorBtn.focus();
  };
  const consoleUi = createConsole({ dispatch, onClose: () => showConsole(false) });
  consoleUi.element.id = 'ep-console';
  app.listen(instructorBtn, 'click', () => showConsole(consoleUi.element.hidden));

  root.append(h('section', { class: 'ep' },
    h('header', { class: 'ep-bar' }, h('h1', {}, 'EP Tabletop · Student screen'), h('span', { class: 'ep-version' }, VERSION), instructorBtn),
    h('div', { class: 'ep-main' }, h('div', { class: 'ep-view-wrap' }, view, hint), track, consoleUi.element),
    h('p', { class: 'ep-foot' }, 'The student sees only the cockpit, the step they\'re on and what the instructor has revealed. Never the script, what\'s next or the end.')));

  // ---- Drawing the student's side from the session ----
  function renderTrack() {
    stepItems.forEach((li, i) => {
      const id = STEPS[i].id;
      li.classList.toggle('is-current', id === session.step);
      li.classList.toggle('is-visited', session.visited.includes(id) && id !== session.step);
      if (id === session.step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    banner.textContent = !session.started ? 'Waiting for the instructor' : session.running ? `Time running · ${clockWords(session.clockS)}` : 'Time stands still';
    banner.className = `ep-banner${session.started && !session.running ? ' is-still' : ''}`;
    const on = [session.prompts.fever ? 'FEVER' : null, session.prompts.tccc ? 'TCCC' : null].filter(Boolean);
    prompts.textContent = on.length ? `Prompt: ${on.join(' · ')}` : '';
    prompts.hidden = !on.length;
    clear(revealedList);
    const panel = panelOf(session);
    const order = [...WORDS, ...NUMBERS, ...LIGHTS].map((d) => d.key);
    const shown = order.filter((k) => k in panel.set);
    if (!shown.length) revealedList.append(h('li', { class: 'ep-faint' }, 'Nothing yet: ask about the aircraft.'));
    for (const k of shown) revealedList.append(h('li', {}, h('span', {}, labelOf(k)), h('span', {}, valueWords(k, panel.set[k]))));
  }

  // ---- The 3D view ----
  let world = null;
  let lastDraw = -Infinity;
  let drawnKey = '';
  const pos = startPositionFt(session.scenario.start.position);
  function syncWorld(force = false) {
    if (!world) return;
    const panel = panelOf(session);
    const hud = hudOf(panel);
    world.setPose({ ...pos, altFt: hud.altFt, headingDegM: hud.headingDeg, pitchDeg: hud.pitchDeg, bankDeg: hud.bankDeg });
    world.setHud(hud);
    const key = JSON.stringify(hud);
    const now = globalThis.performance?.now() ?? Date.now();
    if (force || (key !== drawnKey && now - lastDraw >= DRAW_MS)) {
      drawnKey = key;
      lastDraw = now;
      world.redraw();
    }
  }
  let closed = false;
  createWorld3d({ host: view, timers: app.scheduler }).then((w) => {
    if (closed) {
      w?.dispose();
      return;
    }
    world = w;
    syncWorld(true);
    // A held-back panel redraw (the cockpit redraws at most every 200 ms) gets one more picture.
    app.scheduler.after(400, () => syncWorld(true));
  }).catch((err) => {
    view.append(h('p', { class: 'ep-3d-note' }, 'The 3D cockpit could not load. The step track and the instructor\'s console still work.'));
    console.warn('EP Tabletop: 3D view failed to load', err);
  });

  function refresh() {
    renderTrack();
    consoleUi.update(session);
    syncWorld(true);
  }
  function dispatch(action) {
    session = act(session, action);
    refresh();
  }

  // The clock: only while running (scenario.js advance does nothing otherwise).
  let lastSecond = -1;
  app.scheduler.frame((dtMs) => {
    if (!session.running) return;
    const before = session;
    session = advance(session, Math.min(dtMs, 250) / 1000); // a hidden tab's long gap doesn't jump the scenario on
    if (session.log.length !== before.log.length || Math.floor(session.clockS) !== lastSecond) {
      lastSecond = Math.floor(session.clockS);
      renderTrack();
      consoleUi.update(session);
    }
    syncWorld(false);
  });

  // Space starts, pauses and resumes for the instructor; never while typing (app.keys).
  app.keys({ Space: () => dispatch({ type: session.running ? 'pause' : 'resume' }) });

  refresh();

  return () => {
    closed = true;
    world?.dispose();
    stylesheet.remove();
  };
}

export default { id: 'ep-tabletop', title: 'EP Tabletop', mount };
