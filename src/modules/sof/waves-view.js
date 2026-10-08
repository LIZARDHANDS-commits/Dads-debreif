// The Waves part of the screen (SPEC-sof, "Waves and the alternate call"): draws
// waves-view-model.js's answer and decides nothing. On the one-screen SOF (SOF-38) it lives in the timeline's
// header: Today or Tomorrow, a chip for each wave with its call in words, and + Wave. Pressing a chip opens that
// wave's edit boxes (name, takeoff, landing, Remove) and the list of every hit in a panel that drops over the
// screen. Up to 5 waves in home local time.
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
 * wave's chip (its call is the one the alternate cards show). dropdowns: dropdown.js's createDropdowns, for the panel.
 * Returns { element, title, render(model) }: the list of hits for the selected wave shows in the panel with
 * that wave's boxes, so the screen is not crowded until asked.
 */
export function createWavesView({ onAdd, onEdit, onRemove, onDay, onSelect, dropdowns }) {
  const title = h('h2', { class: 'sof-waves-title', id: 'sof-waves-title', tabindex: '-1' }, 'Waves');
  const radios = {
    today: h('input', { type: 'radio', name: 'sof-day', value: 'today', onchange: () => onDay('today') }),
    tomorrow: h('input', { type: 'radio', name: 'sof-day', value: 'tomorrow', onchange: () => onDay('tomorrow') }),
  };
  // The date is in the timeline's own title; here it is the radios' hover words.
  const day = h(
    'fieldset',
    { class: 'sof-day' },
    h('legend', { class: 'visually-hidden' }, 'Day for the waves'),
    h('label', {}, radios.today, ' Today'),
    h('label', {}, radios.tomorrow, ' Tomorrow'),
  );
  const zone = h('p', { class: 'sof-waves-zone' });
  const problem = h('p', { class: 'sof-waves-problem', hidden: true });
  const chips = h('div', { class: 'sof-wave-chips' });
  const list = h('ul', { class: 'sof-wave-list' });
  const empty = h('span', { class: 'sof-waves-empty' }, 'No waves yet. Add one to see the alternate call.');
  const add = h('button', { type: 'button', class: 'sof-wave-add', onclick: () => addWave() }, '+ Wave');
  const limit = h('span', { class: 'sof-wave-limit' });
  const detail = h('section', { class: 'sof-wave-detail', hidden: true });
  const closeButton = h('button', { type: 'button', class: 'sof-wave-close', onclick: () => closePanel(true) }, 'Close');
  const panel = h(
    'div',
    { class: 'sof-wave-pop', id: 'sof-wave-pop', role: 'group', 'aria-label': 'Edit the wave', hidden: true },
    h('div', { class: 'sof-wave-pop-head' }, zone, closeButton),
    problem,
    list,
    detail,
  );
  const element = h(
    'div',
    { class: 'sof-waves', role: 'group', 'aria-labelledby': 'sof-waves-title' },
    title,
    day,
    chips,
    empty,
    add,
    limit,
    panel,
  );

  const rows = new Map(); // wave id to its row's parts
  let openId = null; // the wave whose boxes and hits are in the panel
  let detailSignature = null;
  const drop = dropdowns.create({
    scope: element,
    onToggle: (open) => {
      if (!open) openId = null;
      syncPanel();
    },
    focusTarget: () => rows.get(lastOpened)?.chip ?? add,
  });
  let lastOpened = null;

  function syncPanel() {
    const shown = drop.isOpen && openId !== null && rows.has(openId);
    panel.hidden = !shown;
    for (const [id, row] of rows) {
      row.li.hidden = id !== openId;
      row.chip.setAttribute('aria-expanded', String(shown && id === openId));
    }
    if (shown) syncDetail();
  }

  function closePanel(focus = false) {
    drop.close({ focus });
  }

  // A chip makes its wave the one the alternate cards show, and opens its boxes; the open wave's chip closes them.
  function pressChip(id) {
    if (drop.isOpen && openId === id) return closePanel(true);
    openId = id;
    lastOpened = id;
    onSelect(id);
    drop.open();
    syncPanel();
    rows.get(id)?.name.focus({ preventScroll: true }); // into the boxes it opened
  }

  function addWave() {
    if (add.getAttribute('aria-disabled') === 'true') return; // aria-disabled, so focus stays on the button
    const before = new Set(rows.keys());
    onAdd();
    for (const [id] of rows) if (!before.has(id)) pressChip(id); // the new wave's boxes open, name first
  }

  function removeWave(id) {
    const ids = [...rows.keys()];
    const at = ids.indexOf(id);
    const next = ids[at + 1] ?? ids[at - 1] ?? null;
    closePanel();
    onRemove(id);
    // Focus never falls to the page: to the chip of the wave that took its place, else to + Wave.
    (next && rows.get(next) ? rows.get(next).chip : add).focus();
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
    // A polite live region that is always in the page (empty when there is nothing to say), so a new refusal is spoken.
    const note = h('p', { class: 'sof-wave-note', id: `sof-wave-note-${id}`, role: 'status' });
    for (const input of [name, takeoff.input, land.input]) input.setAttribute('aria-describedby', note.id);
    // The chip in the timeline's header: the wave's name and times, then its call in words, its reason and the alternates' count.
    const chipTitle = h('span', { class: 'sof-chip-title' });
    const symbol = h('span', { class: 'sof-chip-symbol', 'aria-hidden': 'true' });
    const words = h('span', { class: 'sof-chip-words' });
    const reason = h('span', { class: 'sof-chip-reason' });
    const alts = h('span', { class: 'sof-chip-alts' });
    const chip = h(
      'button',
      { type: 'button', class: 'sof-wave-chip', 'aria-controls': 'sof-wave-pop', 'aria-expanded': 'false', onclick: () => pressChip(id) },
      chipTitle, h('span', { class: 'sof-chip-call' }, symbol, ' ', words), reason, alts,
    );
    // The note says what the wave needs: a local error in a time box first, then the model's words.
    row.showNote = () => {
      const bad = row.bad.takeoff || row.bad.land;
      setText(note, bad ? 'Enter the time as HH:MM, for example 08:30.' : row.model.note);
      note.classList.toggle('is-problem', Boolean(bad || row.model.problem)); // red words, not the muted grey of a plain note
      // Equal times refuse the wave: both boxes are marked, since either one may be the slip.
      for (const [input, isBad] of [[takeoff.input, row.bad.takeoff || row.model.problem], [land.input, row.bad.land || row.model.problem]]) {
        if (isBad) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
      }
    };
    Object.assign(row, { name, nameLabel, takeoff, land, remove, note, chip, chipTitle, symbol, words, reason, alts });
    name.value = model.entryName;
    takeoff.input.value = model.takeoff;
    land.input.value = model.land;
    row.li = h(
      'li',
      { class: 'sof-wave', dataset: { id }, hidden: true },
      h('div', { class: 'sof-wave-main' },
        h('div', { class: 'sof-wave-fields' }, h('label', { class: 'sof-wave-field sof-wave-field-name' }, nameLabel, name), takeoff.field, land.field, remove),
        note),
    );
    return row;
  }

  function render(model) {
    setText(zone, model.zone ? `Times are home local time (${model.zone})` : '');
    zone.hidden = !model.zone;
    setText(problem, model.problem ?? '');
    problem.hidden = !model.problem;
    for (const key of ['today', 'tomorrow']) if (radios[key].checked !== (model.day === key)) radios[key].checked = model.day === key;
    day.title = model.dayLabel ?? '';

    const keep = new Set(model.rows.map((r) => r.id));
    for (const [id, row] of rows) {
      if (keep.has(id)) continue;
      row.li.remove();
      row.chip.remove();
      rows.delete(id);
    }
    model.rows.forEach((m, index) => {
      let row = rows.get(m.id);
      if (!row) {
        row = makeRow(m);
        rows.set(m.id, row);
      }
      row.model = m;
      if (chips.children[index] !== row.chip) chips.insertBefore(row.chip, chips.children[index] ?? null);
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
      // A wave with no call yet (its times are not set) still has a chip, so its boxes can be opened.
      const chip = m.chip ?? { tone: 'none', symbol: '–', words: m.note || 'Set its times', reason: null, alternates: null };
      const selected = m.id === model.selectedId;
      row.chip.className = `sof-wave-chip is-${chip.tone}${selected ? ' is-selected' : ''}`;
      // Pressed means the wave is the one the alternate cards show.
      row.chip.setAttribute('aria-pressed', String(selected && m.chip !== null));
      setText(row.chipTitle, m.title);
      setText(row.symbol, chip.symbol);
      setText(row.words, chip.words);
      setText(row.reason, chip.reason ? `: ${chip.reason}` : '');
      row.reason.hidden = !chip.reason;
      setText(row.alts, chip.alternates ?? '');
      row.alts.hidden = !chip.alternates;
      // At a base with no weather limits the key line says what "Limits not set" means.
      row.chip.title = [m.title, `${chip.words}${chip.reason ? `: ${chip.reason}` : ''}`, chip.alternates, chip.keyLine].filter(Boolean).join(' ');
    });
    empty.hidden = model.rows.length > 0;
    if (model.canAdd) add.removeAttribute('aria-disabled');
    else add.setAttribute('aria-disabled', 'true');
    setText(limit, model.limitNote);
    limit.hidden = !model.limitNote;
    if (openId !== null && !rows.has(openId)) closePanel();
    lastDetail = openId !== null && openId === model.selectedId ? model.detail : null;
    syncPanel();
  }

  // The list of hits for the open wave (the selected wave's). It holds no controls, so it is rewritten whenever it changes.
  let lastDetail = null;
  function syncDetail() {
    renderDetail(lastDetail);
  }

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
        h('strong', {}, model.home.limits ? `Home, ${model.home.limits}: ` : 'Home: '), model.home.words),
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
