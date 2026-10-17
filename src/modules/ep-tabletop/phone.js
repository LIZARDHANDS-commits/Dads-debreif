// The EP Tabletop's instructor's phone (docs/modules/ep-tabletop/spec.md, "The phone link"; plan Step 2, EP-8 to EP-10): the console on
// the phone, opened by the QR code's address. The phone is the master: the scenario runs here and only the student view leaves it (EP-9).
// Moved out of index.js as it was (plan Step 3); what it adds: the console's scenario picker before Start.
import { h } from '../../ui-kit/dom.js';
import { startSession, act, advance } from './scenario.js';
import { studentView } from './student-view.js';
import { SCENARIOS, scenarioById } from './scenarios.js';
import { createConsole } from './console.js';
import { createLink } from './link.js';

// ---- The instructor's phone ---------------------------------------------------------------------------------------------------

const PHONE_WORDS = Object.freeze({
  connecting: 'Connecting to the student\'s screen…',
  connected: 'Connected',
  unreachable: 'Can\'t reach the student\'s screen: the relay isn\'t answering. Check this phone\'s network; your changes are kept and sent when it\'s back.',
  refused: 'This code no longer works. Scan the code on the student\'s screen again.',
});

export function mountPhone(root, app, ids, { relay, version, addStylesheet }) {
  const stylesheet = addStylesheet();
  // The phone is the master: the scenario runs here and only the student view leaves it (EP-9).
  let session = startSession(SCENARIOS[0]);
  const link = createLink({ role: 'phone', ...ids, relay, timers: app.scheduler, current: () => studentView(session) });
  const status = h('p', { class: 'ep-phone-status', role: 'status' });
  const consoleUi = createConsole({ dispatch, mode: 'phone', scenarios: SCENARIOS, onScenario, timers: app.scheduler });

  root.append(h('section', { class: 'ep ep-phone' },
    h('header', { class: 'ep-bar' }, h('h1', {}, 'EP Tabletop · Instructor'), h('span', { class: 'ep-version' }, version)),
    status,
    consoleUi.element));

  const renderStatus = () => {
    status.textContent = PHONE_WORDS[link.status] ?? '';
    status.className = `ep-phone-status${link.status === 'connected' ? ' is-ok' : link.status === 'connecting' ? '' : ' is-lost'}`;
  };
  link.onStatus(renderStatus);

  // Sent when something the student sees changes (not the clock alone: the screen runs that on itself), at most twice a second.
  let sentKey = '';
  function push() {
    const v = studentView(session);
    const key = JSON.stringify({ ...v, clockS: 0 });
    if (key === sentKey) return;
    sentKey = key;
    link.send(v);
  }
  function dispatch(action) {
    session = act(session, action);
    consoleUi.update(session);
    push();
  }
  /** The instructor picks another example scenario before Start (console.js): a new session for it, sent to the student's screen. */
  function onScenario(id) {
    const sc = scenarioById(id);
    if (!sc || session.started) return;
    session = startSession(sc);
    consoleUi.update(session);
    push();
  }

  let lastSecond = -1;
  app.scheduler.frame((dtMs) => {
    if (!session.running) return;
    const before = session;
    session = advance(session, Math.min(dtMs, 250) / 1000);
    // A timed development came, or a cause moved a gauge (systems.js): push sends only when the student's side changed, and the link
    // sends at most twice a second, the latest winning.
    push();
    if (session.log.length !== before.log.length || Math.floor(session.clockS) !== lastSecond) {
      lastSecond = Math.floor(session.clockS);
      consoleUi.update(session);
    }
  });

  consoleUi.update(session);
  renderStatus();
  push();

  return () => {
    link.close();
    stylesheet.remove();
  };
}
