// The instructor's console (console.js): its Faults section (EP-11). The instructor picks a cause, adds it, and sets each cause's severity
// (a slider, 0 to 100 %) and trend (Worsening, Steady, Improving), or clears it. Like any indication, a change waits for Apply (or goes at
// once when "Apply each change at once" is ticked), and + Add can make it into the next development instead. Hidden from the student: the
// student only ever sees the gauges and lights the causes move, once revealed (EP-2). Each cause's effect says "(estimate)" until its rate
// has a source (systems.js FAULT_EFFECTS).
import { h, clear } from '../../ui-kit/dom.js';
import { FAULT_KINDS, FAULT_EFFECTS, TRENDS, faultLabel } from './systems.js';
import { faultsOf } from './scenario.js';

const TREND_WORDS = Object.freeze({ worsening: 'Worsening', steady: 'Steady', improving: 'Improving' });

/** What a cause does, in the instructor's words, with "(estimate)" where any of its numbers is one. */
function effectWords(kind) {
  const row = FAULT_EFFECTS[kind];
  const notes = row.effects.map((e) => e.note).filter(Boolean);
  const estimate = row.effects.some((e) => e.source === 'estimate');
  return { text: notes.join('; '), estimate };
}

/** send(action): dispatches a fault action, applying it at once when that box is ticked (console.js). Returns { element, update(session) }. */
export function createFaultsSection({ send, button }) {
  const kindPick = h('select', { 'aria-label': 'Cause to add' }, FAULT_KINDS.map((k) => h('option', { value: k }, faultLabel(k))));
  const sidePick = h('select', { 'aria-label': 'Which tank' }, h('option', { value: 'L' }, 'left tank'), h('option', { value: 'R' }, 'right tank'));
  const showSide = () => { sidePick.hidden = !FAULT_EFFECTS[kindPick.value].sided; };
  kindPick.addEventListener('change', showSide);
  showSide();
  const addBtn = button('+ Add cause', () => {
    const kind = kindPick.value;
    send({ type: 'addFault', kind, params: FAULT_EFFECTS[kind].sided ? { side: sidePick.value } : {} });
  }, { class: 'ep-btn ep-btn-main' });
  const list = h('div', { class: 'ep-faults' });
  const element = h('section', { class: 'ep-con-section ep-faults-section' },
    h('h3', {}, 'Faults ', h('span', { class: 'ep-sub' }, 'the cause: the gauges and lights follow by themselves; hidden from the student; changes show on Apply')),
    h('div', { class: 'ep-row' }, kindPick, sidePick, addBtn),
    list);

  // One row per cause, kept while it lives so a slider being dragged isn't rebuilt under the finger.
  const rows = new Map(); // id -> { row, update(entry) }
  function faultRow(id) {
    const name = h('span', { class: 'ep-fault-name' });
    const state = h('span', { class: 'ep-tag' });
    const sevOut = h('output', { class: 'ep-sev-out' });
    const slider = h('input', { type: 'range', min: '0', max: '100', step: '5', class: 'ep-sev', 'aria-label': 'Severity' });
    slider.addEventListener('input', () => { sevOut.textContent = `${slider.value} %`; });
    slider.addEventListener('change', () => send({ type: 'setFault', id, severity: Number(slider.value) / 100 }));
    const sevRow = h('label', { class: 'ep-row ep-sev-row' }, h('span', {}, 'Severity'), slider, sevOut);
    const trendBtns = TRENDS.map((t) => button(TREND_WORDS[t], () => send({ type: 'setFault', id, trend: t }), { class: 'ep-btn ep-btn-small', 'aria-pressed': 'false' }));
    const trendRow = h('div', { class: 'ep-row', role: 'group', 'aria-label': 'Trend' }, trendBtns);
    const clearBtn = button('Clear', () => send({ type: 'clearFault', id }), { class: 'ep-btn ep-btn-small' });
    const effect = h('p', { class: 'ep-sub ep-fault-effect' });
    const row = h('div', { class: 'ep-fault', dataset: { id } }, h('div', { class: 'ep-row' }, name, state, clearBtn), sevRow, trendRow, effect);
    function update({ fault: f, set, pending, clearing }) {
      const kind = FAULT_EFFECTS[f.kind];
      name.textContent = `${faultLabel(f.kind)}${kind.sided ? ` (${f.params?.side === 'R' ? 'right' : 'left'} tank)` : ''}`;
      state.textContent = clearing ? 'to clear on Apply' : !set ? 'to add on Apply' : pending ? 'change waiting' : 'set';
      row.classList.toggle('is-pending', pending);
      sevRow.hidden = !kind.severity;
      trendRow.hidden = !kind.trend;
      if (document.activeElement !== slider) slider.value = String(Math.round(f.severity * 100));
      sevOut.textContent = `${slider.value} %`;
      trendBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(TRENDS[i] === f.trend)));
      clearBtn.disabled = clearing;
      const e = effectWords(f.kind);
      clear(effect);
      effect.append(kind.severity || kind.trend ? e.text : `${e.text} (on while set)`, e.estimate ? h('span', { class: 'ep-estimate' }, ' (estimate)') : '');
    }
    return { row, update };
  }

  function update(s) {
    const entries = faultsOf(s);
    const ids = new Set(entries.map((e) => e.fault.id));
    for (const [id, r] of rows) if (!ids.has(id)) { r.row.remove(); rows.delete(id); }
    for (const e of entries) {
      let r = rows.get(e.fault.id);
      if (!r) {
        r = faultRow(e.fault.id);
        rows.set(e.fault.id, r);
        list.append(r.row); // added once, so a slider in use is never moved (moving it would drop the finger's hold)
      }
      r.update(e);
    }
    if (!entries.length && !list.querySelector('.ep-faint')) list.append(h('p', { class: 'ep-faint' }, 'No cause set: the gauges show the healthy start.'));
    if (entries.length) list.querySelector('.ep-faint')?.remove();
  }
  return { element, update };
}
