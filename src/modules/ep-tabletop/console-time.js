// The instructor's console (console.js): its Time section (the clock, Start / Pause / Resume, back to A, re-analyse, next step, the step
// buttons) and its Next development section (hidden from the student: the next development with Now, Later and + Add). Moved out of
// console.js as they were (plan Step 3); nothing changed in what the buttons do.
import { h } from '../../ui-kit/dom.js';
import { STEPS, stepName, nextDevelopment, LATER_S } from './scenario.js';

export const clockWords = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function whenWords(at) {
  if (Number.isFinite(at.timeS)) return `at ${clockWords(at.timeS)}`;
  if (at.step) return `at ${stepName(at.step)}`;
  return 'on tap';
}

/** The Time section. button(label, onclick, extra) makes a console button (console.js). Returns { element, update(session) }. */
export function createTimeSection({ dispatch, button }) {
  let session = null;
  const clock = h('span', { class: 'ep-clock' }, '0:00');
  const runBtn = button('Start', () => dispatch({ type: session?.running ? 'pause' : 'resume' }), { class: 'ep-btn ep-btn-main' });
  const backBtn = button('↩ Back to A', () => dispatch({ type: 'backToA' }));
  const reBtn = button('↩ Re-analyse', () => dispatch({ type: 'reanalyse' }));
  const nextBtn = button('Next step ▸', () => dispatch({ type: 'next' }));
  const stepBtns = STEPS.map((st) => button(st.id === 'AN' ? 'An' : st.letter, () => dispatch({ type: 'step', to: st.id }), { class: 'ep-btn ep-btn-small', title: st.name, 'aria-label': `Go to ${st.name}` }));
  const element = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Time ', clock),
    h('div', { class: 'ep-row' }, runBtn, backBtn, reBtn, nextBtn),
    h('div', { class: 'ep-row ep-steps-row', role: 'group', 'aria-label': 'Go to a step' }, stepBtns));

  function update(s) {
    session = s;
    clock.textContent = clockWords(s.clockS);
    runBtn.textContent = s.running ? '❚❚ Pause' : (s.started ? '▶ Resume' : '▶ Start');
    runBtn.setAttribute('aria-pressed', String(!s.running && s.started));
    backBtn.disabled = s.step === 'A';
    reBtn.disabled = s.step === 'AN';
    nextBtn.disabled = s.step === 'F';
    stepBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(STEPS[i].id === s.step)));
  }
  return { element, update };
}

/** The Next development section. Returns { element, update(session) }. */
export function createDevelopmentSection({ dispatch, button }) {
  const nextText = h('p', { class: 'ep-next' });
  const addWhen = h('select', { 'aria-label': 'When the added development happens' },
    h('option', { value: 'tap' }, 'on tap (Now)'), h('option', { value: 'later' }, `in ${LATER_S / 60} min`),
    STEPS.map((st) => h('option', { value: st.id }, `at ${st.name}`)));
  const addBtn = button('+ Add', () => dispatch({ type: 'addDevelopment', when: addWhen.value }), { title: 'Make the changes not yet applied into the next development instead' });
  const element = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Next development ', h('span', { class: 'ep-sub' }, 'hidden from the student')),
    nextText,
    h('div', { class: 'ep-row' }, button('Now', () => dispatch({ type: 'fireNext' })), button('Later', () => dispatch({ type: 'delayNext' }), { title: `${LATER_S} s later, or one step later` }), addBtn, addWhen));

  function update(s) {
    addBtn.disabled = Object.keys(s.pending).length === 0 && Object.keys(s.pendingFaults ?? {}).length === 0;
    const next = nextDevelopment(s);
    nextText.textContent = next ? `${whenWords(next.at)}: ${next.label}` : 'None left.';
  }
  return { element, update };
}
