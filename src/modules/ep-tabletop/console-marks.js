// The instructor's console (console.js): its Prompts and marks section (FEVER and TCCC prompts, a mark and a note for the step the student
// is on, the marks so far) and its Declare section (the student's answers, para 1.20.3.5). Moved out of console.js as they were (plan
// Step 3); nothing changed in what they do.
import { h, clear } from '../../ui-kit/dom.js';
import { STEPS, stepName, DECLARE_FIELDS } from './scenario.js';

const DECLARE_LABELS = Object.freeze({ nature: 'Nature of the emergency', fuel: 'Fuel (h:mm)', souls: 'Souls on board', plan: 'Plan', timeToLand: 'Time to landing' });
const MARKS = Object.freeze(['Good', 'Needs work']);

/** The Prompts and marks section. Returns { element, update(session) }. */
export function createMarksSection({ dispatch, button }) {
  let session = null;
  const feverBtn = button('FEVER prompt', () => dispatch({ type: 'prompt', which: 'fever', on: !session?.prompts.fever }), { 'aria-pressed': 'false' });
  const tcccBtn = button('TCCC prompt', () => dispatch({ type: 'prompt', which: 'tccc', on: !session?.prompts.tccc }), { 'aria-pressed': 'false' });
  const markBtns = MARKS.map((m) => button(m, () => dispatch({ type: 'mark', step: session.step, mark: m }), { class: 'ep-btn ep-btn-small' }));
  const noteBox = h('input', { type: 'text', class: 'ep-text', placeholder: 'Note for this step', 'aria-label': 'Note for this step' });
  const noteBtn = button('Add note', () => {
    if (!noteBox.value.trim()) return;
    dispatch({ type: 'note', step: session.step, text: noteBox.value.trim() });
    noteBox.value = '';
  }, { class: 'ep-btn ep-btn-small' });
  const markStep = h('span', { class: 'ep-sub' });
  const markList = h('div', { class: 'ep-marks' });
  const element = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Prompts and marks'),
    h('div', { class: 'ep-row' }, feverBtn, tcccBtn),
    h('div', { class: 'ep-row' }, markStep, markBtns),
    h('div', { class: 'ep-row' }, noteBox, noteBtn),
    markList);

  function update(s) {
    session = s;
    feverBtn.setAttribute('aria-pressed', String(s.prompts.fever));
    tcccBtn.setAttribute('aria-pressed', String(s.prompts.tccc));
    markStep.textContent = `${stepName(s.step)}:`;
    clear(markList);
    for (const st of STEPS) {
      const m = s.marks[st.id];
      if (!m) continue;
      markList.append(h('div', { class: 'ep-mark-row' }, h('span', {}, st.name), h('span', {}, [m.mark, m.note ? `"${m.note}"` : null].filter(Boolean).join(' · '))));
    }
  }
  return { element, update };
}

/** The Declare section: the student's answers, typed by the instructor. Returns { element, update(session) }. */
export function createDeclareSection({ dispatch }) {
  const declareBoxes = Object.fromEntries(DECLARE_FIELDS.map((f) => [f, h('input', {
    type: 'text', class: 'ep-text', 'aria-label': DECLARE_LABELS[f], onchange: (e) => dispatch({ type: 'declare', field: f, value: e.target.value }),
  })]));
  const element = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Declare ', h('span', { class: 'ep-sub' }, 'the student\'s answers')),
    DECLARE_FIELDS.map((f) => h('label', { class: 'ep-declare' }, h('span', {}, DECLARE_LABELS[f]), declareBoxes[f])));

  function update(s) {
    for (const f of DECLARE_FIELDS) if (document.activeElement !== declareBoxes[f]) declareBoxes[f].value = s.declare[f];
  }
  return { element, update };
}
