// The instructor's console (spec, "The two screens"): on the instructor's phone, opened by the QR code (plan Step 2, mode 'phone'), or
// behind the Instructor switch on the student's screen (one-screen mode, mode 'screen'). It shows the script the student must never see: every indication and what it is set to,
// the developments to come, marks, notes and the Declare boxes. Changes wait for Apply unless "Apply each change at once" is ticked (spec,
// "Pause and live changes"). Builds its elements once; update(session) brings them up to date without touching a box being typed in.
import { h, clear } from '../../ui-kit/dom.js';
import { STEPS, stepName, nextDevelopment, DECLARE_FIELDS, LATER_S } from './scenario.js';
import { NUMBERS, LIGHTS, MAIN_LIGHTS, WORDS, FLIGHT, labelOf, valueWords } from './indications.js';

const DECLARE_LABELS = Object.freeze({ nature: 'Nature of the emergency', fuel: 'Fuel (h:mm)', souls: 'Souls on board', plan: 'Plan', timeToLand: 'Time to landing' });
const MARKS = Object.freeze(['Good', 'Needs work']);

export const clockWords = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function whenWords(at) {
  if (Number.isFinite(at.timeS)) return `at ${clockWords(at.timeS)}`;
  if (at.step) return `at ${stepName(at.step)}`;
  return 'on tap';
}

/**
 * dispatch(action): scenario.js act's actions; onClose() when its Hide button is pressed (one-screen mode only).
 * mode: 'screen' (one-screen, starts hidden, with a Hide button) or 'phone' (the whole page on the instructor's phone, laid out in one
 * column with big buttons by the stylesheet). Returns { element, update(session) }.
 */
export function createConsole({ dispatch, onClose = () => {}, mode = 'screen' }) {
  const phone = mode === 'phone';
  let session = null;
  let atOnce = false;
  const stage = (key, value) => {
    dispatch({ type: 'stage', key, value });
    if (atOnce) dispatch({ type: 'apply' });
  };
  const button = (label, onclick, extra = {}) => h('button', { type: 'button', class: 'ep-btn', onclick, ...extra }, label);

  // ---- Time and the step track ----
  const clock = h('span', { class: 'ep-clock' }, '0:00');
  const runBtn = button('Start', () => dispatch({ type: session?.running ? 'pause' : 'resume' }), { class: 'ep-btn ep-btn-main' });
  const backBtn = button('↩ Back to A', () => dispatch({ type: 'backToA' }));
  const reBtn = button('↩ Re-analyse', () => dispatch({ type: 'reanalyse' }));
  const nextBtn = button('Next step ▸', () => dispatch({ type: 'next' }));
  const stepBtns = STEPS.map((st) => button(st.id === 'AN' ? 'An' : st.letter, () => dispatch({ type: 'step', to: st.id }), { class: 'ep-btn ep-btn-small', title: st.name, 'aria-label': `Go to ${st.name}` }));
  const timeSection = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Time ', clock),
    h('div', { class: 'ep-row' }, runBtn, backBtn, reBtn, nextBtn),
    h('div', { class: 'ep-row ep-steps-row', role: 'group', 'aria-label': 'Go to a step' }, stepBtns));

  // ---- Indications: what the student asked about, and what each is set to ----
  const applyBtn = button('Apply', () => dispatch({ type: 'apply' }), { class: 'ep-btn ep-btn-main ep-apply' });
  const undoBtn = button('Undo', () => dispatch({ type: 'discard' }), { title: 'Drop the changes not yet applied' });
  const waiting = h('span', { class: 'ep-waiting' });
  const atOnceBox = h('input', { type: 'checkbox', onchange: (e) => { atOnce = e.target.checked; } });
  const rows = new Map(); // key -> { row, revealBtn, now, inputs: { set(value, pendingValue) } }

  function revealButton(key) {
    return button('Reveal', () => dispatch({ type: 'reveal', key }), { class: 'ep-btn ep-btn-small', 'aria-label': `Reveal ${labelOf(key)}` });
  }
  function numberRow(d, revealable = true) {
    const value = h('input', { type: 'number', step: String(d.step), class: 'ep-num', 'aria-label': `${d.label}, ${d.unit}` });
    const swing = d.swing ? h('input', { type: 'number', step: String(d.step), min: '0', class: 'ep-num ep-swing', placeholder: '±', 'aria-label': `${d.label} fluctuates by ±` }) : null;
    const read = () => {
      const v = Number(value.value);
      if (!Number.isFinite(v) || value.value === '') return;
      const sw = swing ? Number(swing.value) : 0;
      stage(d.key, sw > 0 ? { v, swing: sw } : v);
    };
    value.addEventListener('change', read);
    swing?.addEventListener('change', read);
    const set = (v) => {
      const obj = v && typeof v === 'object';
      if (document.activeElement !== value) value.value = String(obj ? v.v : v ?? '');
      if (swing && document.activeElement !== swing) swing.value = obj && v.swing ? String(v.swing) : '';
    };
    return addRow(d.key, h('span', { class: 'ep-edit' }, value, swing ? h('span', { class: 'ep-pm' }, '±') : null, swing, h('span', { class: 'ep-unit' }, d.unit)), set, revealable);
  }
  function lightRow(d) {
    const box = h('input', { type: 'checkbox', 'aria-label': `${d.label} on`, onchange: (e) => stage(d.key, e.target.checked) });
    return addRow(d.key, h('label', { class: 'ep-edit' }, box, ' ON'), (v) => { box.checked = Boolean(v); });
  }
  function wordsRow(d) {
    const box = h('input', { type: 'text', class: 'ep-text', 'aria-label': d.label, onchange: (e) => stage(d.key, e.target.value) });
    return addRow(d.key, h('span', { class: 'ep-edit' }, box), (v) => { if (document.activeElement !== box) box.value = String(v ?? ''); });
  }
  function addRow(key, edit, set, revealable = true) {
    const revealBtn = revealable ? revealButton(key) : null;
    const tag = h('span', { class: 'ep-tag' }, revealable ? 'Revealed' : 'Always shown');
    const row = h('div', { class: 'ep-ind-row', dataset: { key } }, h('span', { class: 'ep-ind-label' }, labelOf(key)), edit, h('span', { class: 'ep-ind-reveal' }, revealBtn, tag));
    rows.set(key, { row, revealBtn, tag, set, revealable });
    return row;
  }

  const moreLights = h('details', { class: 'ep-more' }, h('summary', {}, 'More lights'), LIGHTS.filter((d) => !MAIN_LIGHTS.includes(d.key)).map(lightRow));
  const indSection = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Indications ', h('span', { class: 'ep-sub' }, 'the student sees one only once you reveal it; changes show on Apply')),
    h('div', { class: 'ep-row' }, h('label', { class: 'ep-check' }, atOnceBox, ' Apply each change at once')),
    h('h4', {}, 'Engine and systems'), NUMBERS.map((d) => numberRow(d)),
    h('h4', {}, 'Lights'), LIGHTS.filter((d) => MAIN_LIGHTS.includes(d.key)).map(lightRow), moreLights,
    h('h4', {}, 'Outside, gear and flaps (words)'), WORDS.map(wordsRow),
    h('h4', {}, 'Flight instruments'), FLIGHT.map((d) => numberRow(d, false)));

  // ---- The next development (hidden from the student) ----
  const nextText = h('p', { class: 'ep-next' });
  const addWhen = h('select', { 'aria-label': 'When the added development happens' },
    h('option', { value: 'tap' }, 'on tap (Now)'), h('option', { value: 'later' }, `in ${LATER_S / 60} min`),
    STEPS.map((st) => h('option', { value: st.id }, `at ${st.name}`)));
  const addBtn = button('+ Add', () => dispatch({ type: 'addDevelopment', when: addWhen.value }), { title: 'Make the changes not yet applied into the next development instead' });
  const devSection = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Next development ', h('span', { class: 'ep-sub' }, 'hidden from the student')),
    nextText,
    h('div', { class: 'ep-row' }, button('Now', () => dispatch({ type: 'fireNext' })), button('Later', () => dispatch({ type: 'delayNext' }), { title: `${LATER_S} s later, or one step later` }), addBtn, addWhen));

  // ---- Prompts, marks and notes ----
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
  const markSection = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Prompts and marks'),
    h('div', { class: 'ep-row' }, feverBtn, tcccBtn),
    h('div', { class: 'ep-row' }, markStep, markBtns),
    h('div', { class: 'ep-row' }, noteBox, noteBtn),
    markList);

  // ---- Declare (para 1.20.3.5) ----
  const declareBoxes = Object.fromEntries(DECLARE_FIELDS.map((f) => [f, h('input', {
    type: 'text', class: 'ep-text', 'aria-label': DECLARE_LABELS[f], onchange: (e) => dispatch({ type: 'declare', field: f, value: e.target.value }),
  })]));
  const declareSection = h('section', { class: 'ep-con-section' },
    h('h3', {}, 'Declare ', h('span', { class: 'ep-sub' }, 'the student\'s answers')),
    DECLARE_FIELDS.map((f) => h('label', { class: 'ep-declare' }, h('span', {}, DECLARE_LABELS[f]), declareBoxes[f])));

  const title = h('span', {});
  const element = h('aside', { class: `ep-console${phone ? ' ep-console-phone' : ''}`, 'aria-label': 'Instructor console', hidden: !phone },
    h('header', { class: 'ep-con-head' },
      h('div', { class: 'ep-row ep-con-title' }, h('h2', {}, 'Instructor · ', title), phone ? null : button('Hide', () => onClose(), { 'aria-label': 'Hide the instructor console' })),
      h('p', { class: 'ep-sub' }, phone
        ? 'On your phone: the student\'s screen shows only what you apply and reveal, never this page.'
        : 'One-screen mode: keep this closed while the student watches, or run it from your phone with the "Instructor\'s phone" code.')),
    timeSection, indSection, devSection, markSection, declareSection,
    // Always in sight while changes wait, so the student's screen never changes until it is pressed.
    h('div', { class: 'ep-applybar' }, waiting, applyBtn, undoBtn));

  function update(s) {
    session = s;
    title.textContent = s.scenario.title;
    clock.textContent = clockWords(s.clockS);
    runBtn.textContent = s.running ? '❚❚ Pause' : (s.started ? '▶ Resume' : '▶ Start');
    runBtn.setAttribute('aria-pressed', String(!s.running && s.started));
    backBtn.disabled = s.step === 'A';
    reBtn.disabled = s.step === 'AN';
    nextBtn.disabled = s.step === 'F';
    stepBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(STEPS[i].id === s.step)));
    const pendingKeys = Object.keys(s.pending);
    applyBtn.disabled = pendingKeys.length === 0;
    undoBtn.disabled = pendingKeys.length === 0;
    addBtn.disabled = pendingKeys.length === 0;
    waiting.textContent = pendingKeys.length ? `${pendingKeys.length} change${pendingKeys.length > 1 ? 's' : ''} waiting: ${pendingKeys.map(labelOf).join(', ')}` : 'No changes waiting';
    for (const [key, r] of rows) {
      const pending = key in s.pending;
      r.set(pending ? s.pending[key] : s.shown[key]);
      r.row.classList.toggle('is-pending', pending);
      r.row.title = pending ? `Not applied yet: the student still sees ${valueWords(key, s.shown[key])}` : '';
      const revealed = !r.revealable || s.revealed.includes(key);
      if (r.revealBtn) r.revealBtn.hidden = revealed;
      r.tag.hidden = !revealed;
    }
    const lit = LIGHTS.filter((d) => !MAIN_LIGHTS.includes(d.key) && s.shown[d.key]);
    if (lit.length) moreLights.open = true;
    const next = nextDevelopment(s);
    nextText.textContent = next ? `${whenWords(next.at)}: ${next.label}` : 'None left.';
    feverBtn.setAttribute('aria-pressed', String(s.prompts.fever));
    tcccBtn.setAttribute('aria-pressed', String(s.prompts.tccc));
    markStep.textContent = `${stepName(s.step)}:`;
    clear(markList);
    for (const st of STEPS) {
      const m = s.marks[st.id];
      if (!m) continue;
      markList.append(h('div', { class: 'ep-mark-row' }, h('span', {}, st.name), h('span', {}, [m.mark, m.note ? `"${m.note}"` : null].filter(Boolean).join(' · '))));
    }
    for (const f of DECLARE_FIELDS) if (document.activeElement !== declareBoxes[f]) declareBoxes[f].value = s.declare[f];
  }

  return { element, update };
}
