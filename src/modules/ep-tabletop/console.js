// The instructor's console (spec, "The two screens"): on the instructor's phone, opened by the QR code (plan Step 2, mode 'phone'), or
// behind the Instructor switch on the student's screen (one-screen mode, mode 'screen'). It shows the script the student must never see:
// the causes set, every indication and what it is set to, the developments to come, marks, notes and the Declare boxes. Changes wait for
// Apply unless "Apply each change at once" is ticked (spec, "Pause and live changes"). Builds its elements once; update(session) brings them
// up to date without touching a box being typed in.
//
// This file is the frame (the header, the scenario picker, the Apply bar) and puts the sections together; each section is its own file
// (plan Step 3): console-time.js (Time, Next development), console-faults.js (Faults), console-picks.js (Pick for the student, plan Step 5),
// console-indications.js (Indications), console-cues.js (Cues) and console-marks.js (Prompts and marks, Declare).
import { h } from '../../ui-kit/dom.js';
import { labelOf } from './indications.js';
import { shownOf, faultLabel } from './systems.js';
import { createTimeSection, createDevelopmentSection, clockWords } from './console-time.js';
import { createIndicationsSection } from './console-indications.js';
import { createFaultsSection } from './console-faults.js';
import { createCuesSection } from './console-cues.js';
import { createPicksSection } from './console-picks.js';
import { createMarksSection, createDeclareSection } from './console-marks.js';

export { clockWords };

/**
 * dispatch(action): scenario.js act's actions; onClose() when its Hide button is pressed (one-screen mode only).
 * mode: 'screen' (one-screen, starts hidden, with a Hide button) or 'phone' (the whole page on the instructor's phone, laid out in one
 * column with big buttons by the stylesheet). scenarios: the example scenarios to pick from (scenarios.js) and onScenario(id) when one is
 * picked; the picker shows only before Start. Returns { element, update(session) }.
 */
export function createConsole({ dispatch, onClose = () => {}, mode = 'screen', scenarios = [], onScenario = () => {} }) {
  const phone = mode === 'phone';
  let atOnce = false;
  // Every change the instructor makes goes through pending (EP-R4), and straight on to Apply when that box is ticked.
  const send = (action) => {
    dispatch(action);
    if (atOnce) dispatch({ type: 'apply' });
  };
  const stage = (key, value) => send({ type: 'stage', key, value });
  const button = (label, onclick, extra = {}) => h('button', { type: 'button', class: 'ep-btn', onclick, ...extra }, label);

  const time = createTimeSection({ dispatch, button });
  const faults = createFaultsSection({ send, button });
  const picks = createPicksSection({ dispatch, button });
  const indications = createIndicationsSection({ dispatch, button, stage, onAtOnce: (on) => { atOnce = on; } });
  const cues = createCuesSection({ button, stage });
  const developments = createDevelopmentSection({ dispatch, button });
  const marks = createMarksSection({ dispatch, button });
  const declare = createDeclareSection({ dispatch });

  const applyBtn = button('Apply', () => dispatch({ type: 'apply' }), { class: 'ep-btn ep-btn-main ep-apply' });
  const undoBtn = button('Undo', () => dispatch({ type: 'discard' }), { title: 'Drop the changes not yet applied' });
  const waiting = h('span', { class: 'ep-waiting' });

  const title = h('span', {});
  const scenarioPick = h('select', { 'aria-label': 'Scenario', onchange: (e) => onScenario(e.target.value) },
    scenarios.map((sc) => h('option', { value: sc.id }, sc.title)));
  const scenarioRow = h('label', { class: 'ep-row ep-scenario-pick', hidden: scenarios.length < 2 }, h('span', { class: 'ep-sub' }, 'Scenario'), scenarioPick);
  const element = h('aside', { class: `ep-console${phone ? ' ep-console-phone' : ''}`, 'aria-label': 'Instructor console', hidden: !phone },
    h('header', { class: 'ep-con-head' },
      h('div', { class: 'ep-row ep-con-title' }, h('h2', {}, 'Instructor · ', title), phone ? null : button('Hide', () => onClose(), { 'aria-label': 'Hide the instructor console' })),
      scenarioRow,
      h('p', { class: 'ep-sub' }, phone
        ? 'On your phone: the student\'s screen shows only what you apply and reveal, never this page.'
        : 'One-screen mode: keep this closed while the student watches, or run it from your phone with the "Instructor\'s phone" code.')),
    time.element, faults.element, picks.element, indications.element, cues.element, developments.element, marks.element, declare.element,
    // Always in sight while changes wait, so the student's screen never changes until it is pressed.
    h('div', { class: 'ep-applybar' }, waiting, applyBtn, undoBtn));

  function update(s) {
    const shown = shownOf(s);
    title.textContent = s.scenario.title;
    scenarioPick.value = s.scenario.id;
    scenarioRow.hidden = scenarios.length < 2 || s.started;
    const pendingKeys = Object.keys(s.pending);
    const pendingFaults = Object.entries(s.pendingFaults ?? {});
    const count = pendingKeys.length + pendingFaults.length;
    applyBtn.disabled = count === 0;
    undoBtn.disabled = count === 0;
    const names = [...pendingKeys.map(labelOf), ...pendingFaults.map(([id, f]) => faultLabel((f ?? s.faults.find((x) => x.id === id))?.kind))];
    waiting.textContent = count ? `${count} change${count > 1 ? 's' : ''} waiting: ${names.join(', ')}` : 'No changes waiting';
    time.update(s);
    faults.update(s);
    picks.update(s);
    indications.update(s, shown);
    cues.update(s, shown);
    developments.update(s);
    marks.update(s);
    declare.update(s);
  }

  return { element, update };
}
