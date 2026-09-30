// The Waves part of the screen (SPEC-sof, "Waves and the alternate call"): draws
// waves-view-model.js's answer and decides nothing. Add, edit and remove up to 5 waves in
// home local time, Today or Tomorrow, a chip for each wave's call, and the list of hits
// for the selected wave.
//
// Editing never loses focus: each wave's inputs are made once and kept for as long as the
// wave is in the plan, and a refresh or a keystroke only rewrites the words around them (the
// chip, the note, the detail list). Everything typed goes in as text; nothing is HTML.
import { h } from '../../ui-kit/dom.js';

const CLOCK = /^\d{2}:\d{2}$/;

// Words are only written when they change, so a redraw that changes nothing touches nothing.
const setText = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};

/**
 * actions: { onAdd(), onEdit(id, patch), onRemove(id), onDay('today' | 'tomorrow'), onSelect(id) }: a press on a
 * wave's chip. Returns { element, title, render(model, { detailOpen }) }: the list of hits for the selected
 * wave shows only while `detailOpen`, so the screen is not crowded until asked.
 */
export function createWavesView({ onAdd, onEdit, onRemove, onDay, onSelect }) {
  const title = h('h2', { class: 'sof-waves-title', id: 'sof-waves-title', tabindex: '-1' }, 'Waves');
  const radios = {
    today: h('input', { type: 'radio', name: 'sof-day', value: 'today', onchange: () => onDay('today') }),
    tomorrow: h('input', { type: 'radio', name: 'sof-day', value: 'tomorrow', onchange: () => onDay('tomorrow') }),
  };
  const date = h('span', { class: 'sof-day-date' });
  const day = h(
    'fieldset',
    { class: 'sof-day' },
    h('legend', { class: 'visually-hidden' }, 'Day for the waves'),
    h('label', {}, radios.today, ' Today'),
    h('label', {}, radios.tomorrow, ' Tomorrow'),
    date,
  );
  const zone = h('span', { class: 'sof-waves-zone' });
  const problem = h('p', { class: 'sof-waves-problem', hidden: true });
  const list = h('ul', { class: 'sof-wave-list' });
  const empty = h('p', { class: 'sof-waves-empty' }, 'No waves yet. Add one to see the alternate call.');
  const add = h('button', { type: 'button', class: 'sof-wave-add', onclick: () => addWave() }, 'Add wave');
  const limit = h('span', { class: 'sof-wave-limit' });
  const detail = h('section', { class: 'sof-wave-detail', hidden: true });
  const element = h(
    'section',
    { class: 'sof-waves', 'aria-labelledby': 'sof-waves-title' },
    h('div', { class: 'sof-waves-head' }, title, day, zone),
    problem,
    list,
    empty,
    h('p', { class: 'sof-waves-actions' }, add, ' ', limit),
    detail,
  );

  const rows = new Map(); // wave id to its row's parts
  let detailSignature = null;

  function addWave() {
    if (add.getAttribute('aria-disabled') === 'true') return; // aria-disabled, so focus stays on the button
    const before = new Set(rows.keys());
    onAdd();
    for (const [id, row] of rows) if (!before.has(id)) row.name.focus(); // to the new wave's name
  }

  function removeWave(id) {
    const ids = [...rows.keys()];
    const at = ids.indexOf(id);
    const next = ids[at + 1] ?? ids[at - 1] ?? null;
    onRemove(id);
    // Focus never falls to the page: to the wave that took its place, else to Add wave.
    (next && rows.get(next) ? rows.get(next).name : add).focus();
  }

  function timeField(id, key, cls, row) {
    const input = h('input', { type: 'time', class: cls, autocomplete: 'off' });
    const label = h('span', { class: 'sof-wave-label' });
    input.addEventListener('input', () => {
      row.bad[key] = input.validity?.badInput || (input.value !== '' && !CLOCK.test(input.value));
      onEdit(id, { [key]: input.value });
      row.showNote();
    });
    input.addEventListener('change', () => {
      row.bad[key] = input.validity?.badInput || (input.value !== '' && !CLOCK.test(input.value));
      row.showNote();
    });
    return { input, label, field: h('label', { class: 'sof-wave-field' }, label, input) };
  }

  function makeRow(model) {
    const id = model.id;
    const row = { bad: {}, model };
    const name = h('input', { type: 'text', class: 'sof-wave-name', maxlength: 12, autocomplete: 'off', spellcheck: 'false' });
    name.addEventListener('input', () => onEdit(id, { name: name.value }));
    const nameLabel = h('span', { class: 'sof-wave-label' }, 'Wave');
    const takeoff = timeField(id, 'takeoff', 'sof-wave-takeoff', row);
    const land = timeField(id, 'land', 'sof-wave-land', row);
    const remove = h('button', { type: 'button', class: 'sof-wave-remove', onclick: () => removeWave(id) }, 'Remove');
    const note = h('p', { class: 'sof-wave-note', id: `sof-wave-note-${id}` });
    for (const input of [name, takeoff.input, land.input]) input.setAttribute('aria-describedby', note.id);
    const chipName = h('span', { class: 'visually-hidden' });
    const symbol = h('span', { class: 'sof-chip-symbol', 'aria-hidden': 'true' });
    const words = h('span', { class: 'sof-chip-words' });
    const reason = h('span', { class: 'sof-chip-reason' });
    const alts = h('span', { class: 'sof-chip-alts' });
    const chip = h(
      'button',
      { type: 'button', class: 'sof-wave-chip', hidden: true, onclick: () => onSelect(id) },
      chipName, h('span', { class: 'sof-chip-call' }, symbol, ' ', words), reason, alts,
    );
    // The note says what the wave needs: a local error in a time box first, then the model's words.
    row.showNote = () => {
      const bad = row.bad.takeoff || row.bad.land;
      setText(note, bad ? 'Enter the time as HH:MM, for example 08:30.' : row.model.note);
      for (const [input, isBad] of [[takeoff.input, row.bad.takeoff], [land.input, row.bad.land]]) {
        if (isBad) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    };
    Object.assign(row, { name, nameLabel, takeoff, land, remove, note, chip, chipName, symbol, words, reason, alts });
    name.value = model.entryName;
    takeoff.input.value = model.takeoff;
    land.input.value = model.land;
    row.li = h(
      'li',
      { class: 'sof-wave', dataset: { id } },
      h('div', { class: 'sof-wave-main' },
        h('div', { class: 'sof-wave-fields' }, h('label', { class: 'sof-wave-field sof-wave-field-name' }, nameLabel, name), takeoff.field, land.field, remove),
        note),
      chip,
    );
    return row;
  }

  function render(model, { detailOpen = false } = {}) {
    zone.textContent = model.zone ? `Times are home local time (${model.zone})` : '';
    zone.hidden = !model.zone;
    setText(date, model.dayLabel);
    for (const key of ['today', 'tomorrow']) if (radios[key].checked !== (model.day === key)) radios[key].checked = model.day === key;
    setText(problem, model.problem ?? '');
    problem.hidden = !model.problem;

    const keep = new Set(model.rows.map((r) => r.id));
    for (const [id, row] of rows) {
      if (keep.has(id)) continue;
      row.li.remove();
      rows.delete(id);
    }
    model.rows.forEach((m, index) => {
      let row = rows.get(m.id);
      if (!row) {
        row = makeRow(m);
        rows.set(m.id, row);
      }
      row.model = m;
      if (list.children[index] !== row.li) list.insertBefore(row.li, list.children[index] ?? null);
      // Only the words around the inputs change; the inputs stay as they are, so typing is never interrupted.
      row.name.placeholder = `W${index + 1}`;
      row.name.setAttribute('aria-label', `Wave ${index + 1} name`);
      row.takeoff.input.setAttribute('aria-label', `Wave ${index + 1} takeoff${model.zone ? `, ${model.zone}` : ''}`);
      row.land.input.setAttribute('aria-label', `Wave ${index + 1} landing${model.zone ? `, ${model.zone}` : ''}`);
      setText(row.takeoff.label, `Takeoff${model.zone ? ` ${model.zone}` : ''}`);
      setText(row.land.label, `Landing${model.zone ? ` ${model.zone}` : ''}`);
      row.remove.setAttribute('aria-label', `Remove ${m.name}`);
      row.showNote();
      row.chip.hidden = !m.chip;
      if (m.chip) {
        const { chip } = m;
        // Pressed means its list of hits is open; the selected wave is the one the alternate cards show.
        const selected = m.id === model.selectedId;
        row.chip.setAttribute('aria-pressed', String(selected && detailOpen));
        row.chip.className = `sof-wave-chip is-${chip.tone}${selected ? ' is-selected' : ''}`;
        setText(row.chipName, `${m.name}: `);
        setText(row.symbol, chip.symbol);
        setText(row.words, chip.words);
        setText(row.reason, chip.reason ?? '');
        row.reason.hidden = !chip.reason;
        setText(row.alts, chip.alternates ?? '');
        row.alts.hidden = !chip.alternates;
      }
    });
    empty.hidden = model.rows.length > 0;
    if (model.canAdd) add.removeAttribute('aria-disabled');
    else add.setAttribute('aria-disabled', 'true');
    setText(limit, model.limitNote);
    renderDetail(detailOpen ? model.detail : null);
  }

  // The list of hits for the selected wave. It holds no controls, so it is rewritten whenever it changes.
  function renderDetail(model) {
    const signature = JSON.stringify(model);
    if (signature === detailSignature) return;
    detailSignature = signature;
    detail.hidden = !model;
    if (!model) return detail.replaceChildren();
    const hits = (lines) => (lines.length
      ? h('ul', { class: 'sof-hit-list' }, lines.map((l) => h('li', { class: `sof-hit is-${l.level}` }, h('strong', {}, `${l.levelWords}: `), l.text)))
      : null);
    detail.setAttribute('aria-label', `${model.title}: every hit`);
    // replaceChildren would turn a null into the text "null", so the empty parts are left out.
    return detail.replaceChildren(...[
      h('h3', { class: 'sof-detail-title' }, model.title),
      h('p', { class: `sof-detail-home is-${model.home.tone}` },
        h('span', { class: 'sof-detail-symbol', 'aria-hidden': 'true' }, model.home.symbol), ' ',
        h('strong', {}, `Home, ${model.home.limits}: `), model.home.words),
      model.home.why ? h('p', { class: 'sof-note' }, model.home.why) : null,
      hits(model.home.lines),
      model.alternates.length
        ? h('p', { class: 'sof-detail-alts-title' }, h('strong', {}, `Alternates: ${model.summary}`))
        : h('p', { class: 'sof-note' }, 'No alternates are set. Add them in Settings, under Airfields.'),
      h('ul', { class: 'sof-alt-list' }, model.alternates.map((a) => h('li', { class: `sof-alt is-${a.tone}` },
        h('span', { class: 'sof-detail-symbol', 'aria-hidden': 'true' }, a.symbol), ' ',
        h('strong', {}, `${a.icao}, ${a.minima}: `), a.words,
        a.note ? h('span', { class: 'sof-note' }, ` (${a.note})`) : null,
        a.why ? h('span', { class: 'sof-note' }, ` ${a.why}`) : null,
        a.warnings.length ? h('span', { class: 'sof-note' }, ` ${a.warnings.join(' ')}`) : null,
        hits(a.lines)))),
    ].filter(Boolean));
  }

  return { element, title, render };
}
