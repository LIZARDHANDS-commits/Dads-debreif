// The EP Tabletop's student's screen (docs/modules/ep-tabletop/spec.md, "The two screens"): the CT-156 front cockpit over Moose Jaw, the
// A-A-B-C-D-E-F step track, the situation and what the instructor has revealed, with the instructor's console behind an Instructor switch
// (one-screen mode, plan Step 1) or on the instructor's phone, opened by the QR code the "Instructor's phone" button shows (plan Step 2,
// EP-8 to EP-10). Moved out of index.js as it was (plan Step 3); what it adds: the console's scenario picker before Start.
//
// The student's side is drawn only from a student view (student-view.js): in one-screen mode made here from the local session, with the
// phone made on the phone and read over the link. Never on the student's side: the scenario's name, the developments to come, the causes
// set, the instructor's settings for anything not revealed, or any checklist or boldface text (EP-R3, EP-3).
import { h, clear } from '../../ui-kit/dom.js';
import { encodeQr, qrSvg } from '../../ui-kit/qr.js';
import { startSession, act, advance, valueNow, STEPS } from './scenario.js';
import { studentView, cleanStudentView } from './student-view.js';
import { SCENARIOS, scenarioById } from './scenarios.js';
import { NUMBERS, LIGHTS, WORDS, labelOf, valueWords, hudOf } from './indications.js';
import { createConsole, clockWords } from './console.js';
import { createWorld3d, startPositionFt } from './world3d.js';
import { createLink, newLinkId, consoleAddress, LOST_MS } from './link.js';

/** While running, the 3D picture is drawn at most this often (milliseconds): only the panel moves, so 10 a second is plenty (an estimate). */
const DRAW_MS = 100;

const ftWords = (n) => `${Math.round(n).toLocaleString('en-CA')} ft`;
const COMPASS_8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const nowMs = () => globalThis.performance?.now() ?? Date.now();

/** The situation the student is given at the start (spec, "Scenarios": the start state), in words, from a student view. */
function situationLines(sit) {
  const p = sit.position;
  const lines = [sit.phase];
  if (sit.altFt !== null && sit.kias !== null && sit.headingDegM !== null) {
    lines.push(`${ftWords(sit.altFt)}, ${Math.round(sit.kias)} KIAS, heading ${String(Math.round(sit.headingDegM)).padStart(3, '0')}°M`);
  }
  if (p.fromIcao) lines.push(`${Math.round(p.distNm)} NM ${COMPASS_8[Math.round(p.bearingDegT / 45) % 8]} of ${p.fromIcao}`);
  if (sit.fuelLb !== null) lines.push(`Fuel ${Math.round(sit.fuelLb).toLocaleString('en-CA')} lb`);
  lines.push(sit.weather);
  return lines.filter(Boolean);
}

// ---- The student's screen ---------------------------------------------------------------------------------------------------

const LINK_WORDS = Object.freeze({
  waiting: 'Waiting for the instructor\'s phone',
  connected: 'Instructor\'s phone connected',
  lost: 'Instructor link lost — waiting',
  unreachable: 'Can\'t reach the relay — the Instructor switch still works here',
});

export function mountScreen(root, app, { relay, version, addStylesheet }) {
  const stylesheet = addStylesheet();
  let session = startSession(SCENARIOS[0]);
  /** When the phone drives the student's side: { view (cleaned), baseAt (ms, when its clock was view.clockS) }; null in one-screen mode. */
  let remote = null;

  // ---- The student's side ----
  const view = h('div', { class: 'ep-view' });
  const hint = h('p', { class: 'ep-hint' }, 'Drag to look round · double-click to look ahead · hold Shift to zoom');
  const stepItems = STEPS.map((st) => h('li', { class: 'ep-step', dataset: { step: st.id } }, h('b', {}, st.letter), ` ${st.name}`, h('span', { class: 'ep-done', 'aria-hidden': 'true' })));
  const banner = h('p', { class: 'ep-banner', role: 'status' });
  const prompts = h('p', { class: 'ep-prompts' });
  const situationList = h('ul', { class: 'ep-situation' });
  const revealedList = h('ul', { class: 'ep-revealed' });
  const track = h('aside', { class: 'ep-track', 'aria-label': 'Step track' },
    h('h2', {}, 'Situation'),
    situationList,
    h('h2', {}, 'A-A-B-C-D-E-F'),
    h('ol', { class: 'ep-steps' }, stepItems),
    banner, prompts,
    h('h2', {}, 'Revealed'),
    revealedList);

  // ---- The instructor's phone: the QR code and the link (EP-8) ----
  const linkStatus = h('span', { class: 'ep-link-status', role: 'status', hidden: true });
  const phoneBtn = h('button', { type: 'button', class: 'ep-btn', 'aria-controls': 'ep-qr' }, 'Instructor\'s phone');
  const qrCode = h('div', { class: 'ep-qr-code' });
  const qrStatus = h('p', { class: 'ep-qr-status' });
  const hideQrBtn = h('button', { type: 'button', class: 'ep-btn ep-btn-main' }, 'Hide code');
  const stopBtn = h('button', { type: 'button', class: 'ep-btn' }, 'Stop phone link');
  const qrPanel = h('div', { class: 'ep-qr', id: 'ep-qr', hidden: true, role: 'dialog', 'aria-label': 'Instructor\'s phone code' },
    h('div', { class: 'ep-qr-card' },
      h('h2', {}, 'Instructor\'s phone'),
      qrCode,
      h('p', { class: 'ep-sub' }, 'Scan this with the instructor\'s phone camera. The console opens on the phone; this screen then shows only the result. The code hides itself once the phone is connected.'),
      qrStatus,
      h('div', { class: 'ep-row ep-qr-buttons' }, hideQrBtn, stopBtn)));
  /** @type {{ link: any, session: string, key: string } | null} */
  let phoneLink = null;

  const instructorBtn = h('button', { type: 'button', class: 'ep-btn ep-instructor-btn', 'aria-pressed': 'false', 'aria-controls': 'ep-console' }, 'Instructor');
  const showConsole = (open) => {
    consoleUi.element.hidden = !open;
    instructorBtn.setAttribute('aria-pressed', String(open));
    if (!open) instructorBtn.focus();
  };
  const consoleUi = createConsole({ dispatch, onClose: () => showConsole(false), scenarios: SCENARIOS, onScenario });
  consoleUi.element.id = 'ep-console';
  app.listen(instructorBtn, 'click', () => showConsole(consoleUi.element.hidden));

  root.append(h('section', { class: 'ep' },
    h('header', { class: 'ep-bar' }, h('h1', {}, 'EP Tabletop · Student screen'), linkStatus, h('span', { class: 'ep-version' }, version), phoneBtn, instructorBtn),
    h('div', { class: 'ep-main' }, h('div', { class: 'ep-view-wrap' }, view, hint, qrPanel), track, consoleUi.element),
    h('p', { class: 'ep-foot' }, 'The student sees only the cockpit, the step they\'re on and what the instructor has revealed. Never the script, what\'s next or the end.')));

  // ---- The student view now, and its clock ----
  const currentView = () => remote?.view ?? cleanStudentView(studentView(session));
  function clockOf(v) {
    if (!remote || !v.running) return v.clockS;
    // Between the phone's sends the clock runs on here, for no longer than the link stays fresh (then it waits, EP-R10).
    return v.clockS + Math.min(Date.now() - remote.baseAt, LOST_MS) / 1000;
  }
  const panelNow = (v, clockS) => ({ now: Object.fromEntries(Object.entries(v.panel).map(([k, x]) => [k, valueNow(x, clockS)])) });

  // ---- Drawing the student's side from a student view ----
  let situationKey = '';
  function renderTrack(v = currentView()) {
    const key = JSON.stringify(v.situation);
    if (key !== situationKey) {
      situationKey = key;
      clear(situationList);
      for (const t of situationLines(v.situation)) situationList.append(h('li', {}, t));
    }
    stepItems.forEach((li, i) => {
      const id = STEPS[i].id;
      li.classList.toggle('is-current', id === v.step);
      li.classList.toggle('is-visited', v.visited.includes(id) && id !== v.step);
      if (id === v.step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    banner.textContent = !v.started ? 'Waiting for the instructor' : v.running ? `Time running · ${clockWords(clockOf(v))}` : 'Time stands still';
    banner.className = `ep-banner${v.started && !v.running ? ' is-still' : ''}`;
    const on = [v.prompts.fever ? 'FEVER' : null, v.prompts.tccc ? 'TCCC' : null].filter(Boolean);
    prompts.textContent = on.length ? `Prompt: ${on.join(' · ')}` : '';
    prompts.hidden = !on.length;
    clear(revealedList);
    const order = [...WORDS, ...NUMBERS, ...LIGHTS].map((d) => d.key);
    const shown = order.filter((k) => k in v.panel);
    if (!shown.length) revealedList.append(h('li', { class: 'ep-faint' }, 'Nothing yet: ask about the aircraft.'));
    for (const k of shown) revealedList.append(h('li', {}, h('span', {}, labelOf(k)), h('span', {}, valueWords(k, v.panel[k]))));
  }

  // ---- The 3D view ----
  let world = null;
  let lastDraw = -Infinity;
  let drawnKey = '';
  function syncWorld(force = false) {
    if (!world) return;
    const v = currentView();
    const hud = hudOf(panelNow(v, clockOf(v)));
    world.setPose({ ...startPositionFt(v.situation.position), altFt: hud.altFt, headingDegM: hud.headingDeg, pitchDeg: hud.pitchDeg, bankDeg: hud.bankDeg });
    world.setHud(hud);
    const key = JSON.stringify(hud);
    const now = nowMs();
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
    if (remote) return; // the phone runs the scenario now
    session = act(session, action);
    refresh();
  }
  /** The instructor picks another example scenario before Start (console.js): a new session for it. */
  function onScenario(id) {
    const sc = scenarioById(id);
    if (remote || !sc || session.started) return;
    session = startSession(sc);
    refresh();
  }

  // ---- The phone link ----
  function showQr(open) {
    qrPanel.hidden = !open;
    if (open) hideQrBtn.focus();
  }
  function renderLink() {
    const status = phoneLink?.link.status ?? null;
    linkStatus.hidden = !status;
    linkStatus.textContent = status ? LINK_WORDS[status] : '';
    linkStatus.className = `ep-link-status${status === 'lost' || status === 'unreachable' ? ' is-lost' : status === 'connected' ? ' is-ok' : ''}`;
    qrStatus.textContent = status === 'connected' ? 'Connected. Scan again only if the phone loses the console.' : status ? `${LINK_WORDS[status]}.` : '';
    phoneBtn.textContent = phoneLink ? 'Show code again' : 'Instructor\'s phone';
    // While the phone runs it, the one-screen console stays shut, so the two never disagree.
    instructorBtn.disabled = Boolean(remote);
    instructorBtn.title = remote ? 'The instructor\'s phone is running the scenario. Stop phone link to use this screen\'s console.' : '';
  }
  function startPhoneLink() {
    const ids = { session: newLinkId(), key: newLinkId() };
    let qr;
    try {
      qr = encodeQr(consoleAddress(ids));
    } catch (err) {
      qrStatus.textContent = 'This page\'s address is too long for the code.';
      console.warn('EP Tabletop: QR code', err);
      return;
    }
    clear(qrCode);
    qrCode.append(qrSvg(qr, { label: 'QR code that opens the instructor\'s console on a phone' }));
    const link = createLink({ role: 'screen', ...ids, relay, timers: app.scheduler });
    phoneLink = { link, ...ids };
    let was = link.status;
    link.onStatus((status) => {
      if (status === 'connected' && was !== 'connected') showQr(false); // the phone is in: the code hides itself
      was = status;
      renderLink();
      renderTrack();
    });
    link.onState((raw, ageMs) => {
      const clean = cleanStudentView(raw);
      if (!clean) return; // not a student view: ignored, the last one stays
      const first = !remote;
      remote = { view: clean, baseAt: Date.now() - (Number(ageMs) || 0) };
      if (first) {
        showConsole(false);
        consoleUi.element.hidden = true;
      }
      renderLink();
      renderTrack();
      syncWorld(true);
    });
    renderLink();
  }
  function stopPhoneLink() {
    phoneLink?.link.close({ end: true });
    phoneLink = null;
    remote = null;
    showQr(false);
    renderLink();
    refresh();
  }
  app.listen(phoneBtn, 'click', () => {
    if (!phoneLink) startPhoneLink();
    showQr(true);
  });
  app.listen(hideQrBtn, 'click', () => {
    showQr(false);
    phoneBtn.focus();
  });
  app.listen(stopBtn, 'click', stopPhoneLink);

  // The clock: the local session's only while running (scenario.js advance does nothing otherwise); the phone's view runs its own.
  let lastSecond = -1;
  app.scheduler.frame((dtMs) => {
    if (remote) {
      const second = Math.floor(clockOf(remote.view));
      if (second !== lastSecond) {
        lastSecond = second;
        renderTrack();
      }
      syncWorld(false);
      return;
    }
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

  // Space starts, pauses and resumes for the instructor in one-screen mode; never while typing (app.keys).
  app.keys({ Space: () => dispatch({ type: session.running ? 'pause' : 'resume' }) });

  refresh();
  renderLink();

  return () => {
    closed = true;
    phoneLink?.link.close({ end: true });
    world?.dispose();
    stylesheet.remove();
  };
}
