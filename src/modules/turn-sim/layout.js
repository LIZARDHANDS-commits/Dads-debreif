// The Turn Sim's screen, first version (docs/modules/turn-sim/spec.md, "The
// screen"): the manoeuvre buttons and a two-box Setup on the left, the playback
// bar above the picture in the middle, and the Formation card on the right.
// Only the essentials show; the layers are in a menu. All text goes in as text
// (h), never as HTML.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';
import { ERROR_FIELDS, RESPONSE_OPTIONS, FIX_TOOLS } from './live/errors.js';

/**
 * What the screen remembers in this browser: which columns are open, which
 * layers are on, 2D or 3D, and the 3D paint. Saved choices from an older screen
 * (another version) are not read; the defaults are used instead.
 */
export const LAYOUT_DEFAULTS = Object.freeze({
  setupColumn: true,
  formationColumn: true,
  tracks: true, // each aircraft's ground track, for the whole flight
  lead39: false, // Lead's 3/9 line (off by default from layout version 3, TS-56)
  lead75: false, // Lead's 7 and 5 o'clock lines: the back edge of the fighting wing cone, 60° of sweep (SMM 12.29 para 69)
  planned: true, // the paths still to fly, dashed
  turnCircles: false,
  tags: true, // the info tag beside each aircraft: what it is doing and how it sits (spec section 10.4)
  autoFit: true, // the camera keeps every aircraft in the picture (spec section 10.3); a pan or zoom pauses it, Fit brings it back
  view: VIEW_DEFAULT, // '2d' or '3d'
  paint: PAINT_DEFAULT, // the 3D aircraft's paint: 'harvard' or 'ship'
});
export const LAYOUT_VERSION = 3; // 1 was the plan-mode screen's; 3 turned the 3/9 line off by default (TS-56)

/** A saved version 2 layout keeps every choice but the 3/9 line, which takes the new default (off). Older ones start fresh. */
export function migrateLayout(values, version) {
  if (version !== 2) return {};
  const { lead39: _lead39, ...rest } = values;
  return rest;
}

/** The layout values that only allow some choices (createSettings' `allowed`). */
export const LAYOUT_ALLOWED = /** @type {Record<string, any[]>} */ (Object.freeze({ view: [...VIEW_ALLOWED], paint: PAINT_OPTIONS.map((o) => o.value) }));

/** Layers that only the 2D picture draws; they are greyed out in 3D. */
const LAYERS_2D = ['lead39', 'lead75', 'planned', 'turnCircles', 'tags'];

export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4]);

/** The line above the buttons, for the pair and for the four. */
const PAIR_HINT = 'Press a manoeuvre and the pair flies it, then carries on in line abreast. A press while one is flying is flown next.';
const PAIR_MOVES_NOTE = 'These manoeuvres fly in line abreast. Change to line abreast first.';
const FOUR_HINT = 'Press a manoeuvre and the four fly it, then carry on in Spread 4 (line abreast). A press while one is flying is flown next.';

/** Ship colours as in V6, except #4: white with a dark outline (#29), as in the debrief. */
export const SHIP_COLORS = Object.freeze({ 1: '#0066ff', 2: '#00cc44', 3: '#ff2222', 4: '#ffffff' });
export const OUTLINED_SHIPS = Object.freeze(new Set([4]));

function swatch(id) {
  const el = h('span', { class: `ship-swatch${OUTLINED_SHIPS.has(id) ? ' is-outlined' : ''}`, 'aria-hidden': 'true' });
  el.style.setProperty('--ship', SHIP_COLORS[id]); // through the CSSOM, which a style-src policy allows
  return el;
}

/**
 * buttons: [{ key, label, sided, ships }] in screen order; `ships` lists the formations that have the button (2, 4).
 * setupControls: ui-kit controls bound to the Setup settings (ships, spacingFt, wingSide).
 * layout / layoutControls: the remembered layout and its controls.
 * listen: app.listen, so page-wide listeners end when the Turn Sim closes.
 * fixedLine: the one line of fixed numbers under Setup.
 * changeUi: the "Change formation" group and its card lines (transitions-panel.js), or null.
 */
export function createLayout({ buttons, setupControls, layout, layoutControls, listen, fixedLine, changeUi = null }) {
  const handlers = {};

  // ---- Manoeuvres: one row per manoeuvre, a Left and a Right button where it has sides ----
  const sideHints = []; // { el, dir }: the "into #2" / "away from #2" words, which follow #2's side
  const rowShips = []; // { el, ships }: which formations show each row (2-ship, 4-ship)
  const rows = buttons.map((b) => {
    const row = buttonRow(b);
    rowShips.push({ el: row, ships: b.ships ?? [2] });
    return row;
  });
  function buttonRow(b) {
    if (!b.sided) {
      return h('div', { class: 'ts-move ts-move-single' },
        h('button', { type: 'button', class: 'button ts-move-button', dataset: { move: b.key }, onclick: () => handlers.press?.(b.key, 0) }, b.label));
    }
    const side = (dir, word) => {
      const hint = h('span', { class: 'ts-move-hint' });
      sideHints.push({ el: hint, dir });
      return h('button', {
        type: 'button',
        class: 'button ts-move-button',
        dataset: { move: b.key, dir: word.toLowerCase() },
        onclick: () => handlers.press?.(b.key, dir),
      }, h('span', { class: 'visually-hidden' }, `${b.label} `), h('span', {}, word), hint); // read out as "Delayed 90 Left into #2"
    };
    return h('div', { class: 'ts-move', role: 'group', 'aria-label': b.label },
      h('span', { class: 'ts-move-name' }, b.label), side(1, 'Left'), side(-1, 'Right'));
  }
  const movesPanel = createPanel({ title: 'Manoeuvres', onToggle: (c) => layout.update({ setupColumn: !c }) });
  const queueLine = h('p', { class: 'ts-hint ts-queue', role: 'status' });
  const movesHint = h('p', { class: 'ts-hint' }, PAIR_HINT);
  const movesNote = h('p', { class: 'ts-hint ts-warning', role: 'status', hidden: true }, PAIR_MOVES_NOTE);
  movesPanel.body.append(
    ...(changeUi ? [changeUi.element] : []),
    movesHint,
    movesNote,
    ...rows,
    queueLine,
  );

  // ---- Setup: spacing and #2's side ---------------------------------------
  const spacingFlag = h('p', { class: 'ts-warning', role: 'status', hidden: true });
  const fourLine = h('p', { class: 'ts-fixed', hidden: true });
  // The 4-ship delayed 45 with or without its check turn (Patrick, 4 Oct 11:28Z); shown only in the 4-ship.
  const check45Field = h('div', { class: 'ts-check', hidden: true }, setupControls.checkbox('check45', { label: 'Delayed 45 with the check turn (SMM Fig 16.34)' }));
  const setup = h('section', { class: 'ts-setup', 'aria-labelledby': 'ts-setup-title' },
    h('h3', { class: 'ts-group-title', id: 'ts-setup-title' }, 'Setup'),
    h('div', { class: 'ts-field' }, setupControls.choice('ships', { label: 'Formation', options: [{ value: 2, label: '2-ship' }, { value: 4, label: '4-ship' }] })),
    h('div', { class: 'ts-field' }, setupControls.number('spacingFt', { label: 'Spacing', unit: 'ft', min: 1000, max: 20000, step: 100 })),
    spacingFlag,
    check45Field,
    h('div', { class: 'ts-field' }, setupControls.choice('wingSide', { label: '#2 on Lead\'s', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] })),
    h('p', { class: 'ts-hint' }, 'Changing these starts again from the beginning.'),
    h('p', { class: 'ts-fixed' }, fixedLine),
    fourLine,
  );
  movesPanel.body.append(setup);

  // ---- Errors (training): closed, and every error starts at None (TS-52) ----
  // The Fix tools #2 may use (Patrick, 4 Oct 11:42Z), all ticked; shown only when the response is Fix it.
  const fixTools = h('fieldset', { class: 'ts-fix-tools' },
    h('legend', {}, 'Fix tools'),
    ...FIX_TOOLS.map((t) => h('div', { class: 'ts-check' }, setupControls.checkbox(t.key, { label: `${t.label}: ${t.hint}` }))),
  );
  const errorsSection = h('details', { class: 'ts-errors' },
    h('summary', {}, 'Errors (training)'),
    h('p', { class: 'ts-hint' }, 'Start #2 out of position or rolling in off time, then see him carry the error or fix it. Reset puts it back.'),
    ...ERROR_FIELDS.map((f) => h('div', { class: 'ts-field ts-error-row' },
      setupControls.select(f.key, { label: f.label, options: f.options }),
      setupControls.number(f.amountKey, { label: 'Amount', unit: f.unit, min: f.min, max: f.max, step: f.step }))),
    h('div', { class: 'ts-field' }, setupControls.select('errResponse', { label: '#2 then', options: RESPONSE_OPTIONS })),
    fixTools,
    h('div', { class: 'ts-field' }, setupControls.checkbox('errRandom', { label: 'One random error at every Reset (replaces the choices above)' })),
    h('p', { class: 'ts-hint' }, 'Fix it: #2 uses the ticked Fix tools, smallest change first. Normal reference: he flies the standard turn and the error shows at the end.'),
  );
  movesPanel.body.append(errorsSection);

  // ---- Stage: the playback bar and Layers above the picture -----------------
  const playGlyph = h('span', { 'aria-hidden': 'true' }, '▶');
  const playLabel = h('span', {}, 'Play');
  const playButton = h('button', { type: 'button', class: 'button primary ts-play', onclick: () => handlers.playPause?.() }, playGlyph, playLabel);
  const resetRunButton = h('button', { type: 'button', class: 'button', title: 'Back to the start (Home)', onclick: () => handlers.resetRun?.() }, 'Reset');
  const speedSelect = h(
    'select',
    { 'aria-label': 'Playback speed', onchange: () => handlers.speed?.(Number(speedSelect.value)) },
    SPEEDS.map((x) => h('option', { value: String(x), selected: x === 1 }, `${x}×`)),
  );
  const time = h('output', { class: 'ts-time', 'aria-label': 'Simulation time' }, 't = 0.0 s');

  // A menu: a real button that opens a small panel, closed again by Escape or a click elsewhere.
  function menu(label, id, children) {
    const button = h('button', { type: 'button', class: 'button menu-button', 'aria-expanded': 'false', 'aria-controls': id }, label);
    const body = h('div', { class: 'ts-menu-body', id, hidden: true }, ...children);
    const element = h('div', { class: 'ts-menu' }, button, body);
    const setOpen = (open) => {
      body.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', () => setOpen(body.hidden));
    element.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || body.hidden) return;
      e.preventDefault();
      setOpen(false);
      button.focus();
    });
    listen(document, 'pointerdown', (e) => {
      if (!element.contains(e.target)) setOpen(false);
    });
    return { element, setOpen };
  }
  const lc = layoutControls;
  const layersMenu = menu('Layers', 'ts-layers', [
    lc.checkbox('tracks', { label: 'Ground tracks' }),
    lc.checkbox('lead39', { label: 'Lead 3/9 line' }),
    lc.checkbox('lead75', { label: 'Lead 7 and 5 o\'clock lines' }),
    lc.checkbox('planned', { label: 'Planned path' }),
    lc.checkbox('turnCircles', { label: 'Turn circles' }),
    lc.checkbox('tags', { label: 'Info tags' }),
    lc.checkbox('autoFit', { label: 'Fit all aircraft' }),
    lc.select('paint', { label: '3D paint', options: PAINT_OPTIONS }),
  ]);

  // Fit: back to the camera that keeps every aircraft in the picture, after a pan or zoom paused it (or once, when it is off).
  const fitButton = h('button', { type: 'button', class: 'button ts-fit', hidden: true, title: 'Fit every aircraft in the picture again', onclick: () => handlers.fit?.() }, 'Fit');
  const canvas = h('canvas', { class: 'ts-canvas' });
  const canvas3d = h('canvas', { class: 'ts-canvas ts-canvas3d', hidden: true }); // the 3D view's own canvas: a WebGL context can't share the 2D one
  const canvasWrap = h('div', { class: 'ts-canvas-wrap' }, canvas, canvas3d);
  const note3d = h('span', { class: 'ts-note', role: 'status', hidden: true });
  const bar = h(
    'div',
    { class: 'ts-bar', role: 'group', 'aria-label': 'Playback' },
    playButton, resetRunButton, speedSelect, time,
    h('span', { class: 'ts-bar-gap' }),
    fitButton,
    lc.viewSwitch(), note3d, layersMenu.element,
  );
  const stage = h('section', { class: 'ts-stage', 'aria-label': 'Formation from above and playback' }, bar, canvasWrap);

  // ---- Formation card -----------------------------------------------------------
  const flying = h('p', { class: 'ts-line ts-flying' });
  const flyingNote = h('p', { class: 'ts-line ts-turn' });
  const errorSet = h('p', { class: 'ts-line ts-error-set', hidden: true });
  const errorOutcome = h('p', { class: 'ts-line ts-judged ts-error-outcome', 'aria-live': 'polite', hidden: true });
  const now = h('ul', { class: 'ts-lines', 'aria-label': 'The formation now' });
  const judged = h('p', { class: 'ts-line ts-judged', 'aria-live': 'polite' });
  const ships = h('ul', { class: 'ts-card', 'aria-label': 'Each aircraft' });
  const formationPanel = createPanel({ title: 'Formation', onToggle: (c) => layout.update({ formationColumn: !c }) });
  formationPanel.body.append(
    flying, flyingNote, ...(changeUi ? [changeUi.cardElement] : []), errorSet, errorOutcome,
    h('h3', { class: 'ts-group-title' }, 'Now'), now,
    h('h3', { class: 'ts-group-title' }, 'Last roll-out'), judged,
    h('h3', { class: 'ts-group-title' }, 'Each aircraft'), ships,
  );

  const setupCol = h('aside', { class: 'ts-col ts-col-setup', 'aria-label': 'Manoeuvres and setup' }, movesPanel.element);
  const formationCol = h('aside', { class: 'ts-col ts-col-formation', 'aria-label': 'Formation' }, formationPanel.element);
  const element = h(
    'div',
    { class: 'turn-sim' },
    h('h1', { class: 'visually-hidden' }, "Pat's Formation Simulator"),
    setupCol,
    stage,
    formationCol,
  );

  function applyLayout(values) {
    movesPanel.setCollapsed(!values.setupColumn);
    formationPanel.setCollapsed(!values.formationColumn);
    setupCol.classList.toggle('is-collapsed', !values.setupColumn);
    formationCol.classList.toggle('is-collapsed', !values.formationColumn);
  }
  applyLayout(layout.get());

  let lastJudged = null;
  let lastOutcome = null;

  return {
    element,
    canvas,
    canvas3d,
    /** Which picture shows: '2d' or '3d'. */
    showView(view) {
      canvas.hidden = view === '3d';
      canvas3d.hidden = view !== '3d';
      for (const key of LAYERS_2D) lc.setDisabled(key, view === '3d');
    },
    /** A short note beside the View switch ("3D needs a connection the first time."), or '' for none. */
    setNote(text) {
      note3d.textContent = text ?? '';
      note3d.hidden = !text;
    },
    applyLayout,
    /** The into / away words on each button, for #2 on `wingSide` of Lead (SMM 16.19 paras 53-57 name them from Lead's side). */
    setSide(wingSide) {
      const wingDir = wingSide === 'left' ? 1 : -1;
      for (const { el, dir } of sideHints) el.textContent = dir === wingDir ? 'into #2' : 'away';
    },
    /** 2-ship or 4-ship: only the buttons that formation has show, and `line` (the four-ship's fixed numbers) shows under the fixed line. */
    setShips(ships, line = '') {
      for (const { el, ships: has } of rowShips) el.hidden = !has.includes(ships);
      movesHint.textContent = ships === 4 ? FOUR_HINT : PAIR_HINT;
      fourLine.textContent = ships === 4 ? line : '';
      fourLine.hidden = ships !== 4;
      check45Field.hidden = ships !== 4;
      errorsSection.hidden = ships === 4; // training errors are 2-ship only for now (TS-52)
      changeUi?.setShips(ships); // the four have their own formation buttons (spec section 8)
    },
    /** The manoeuvre buttons work in line abreast only: greyed in the other formations, with the reason beside them. */
    /**
     * @param {boolean} enabled
     * @param {(key: string) => boolean} [keyEnabled] which buttons may be pressed when enabled (G-warm only from Spread 4)
     * @param {string} [note] the reason shown when they are greyed
     */
    setMovesEnabled(enabled, keyEnabled = (_key) => true, note = PAIR_MOVES_NOTE) {
      for (const b of element.querySelectorAll('.ts-move-button')) b.disabled = !enabled || !keyEnabled(b.dataset.move);
      movesNote.textContent = note;
      movesNote.hidden = enabled;
    },
    /** The Fix tools show only when #2's response is Fix it. */
    setFixTools(visible) {
      fixTools.hidden = !visible;
    },
    /** The flag under Spacing (outside the SMM band), or null. */
    setSpacingFlag(text) {
      spacingFlag.textContent = text ?? '';
      spacingFlag.hidden = !text;
    },
    setPlaying(playing) {
      playGlyph.textContent = playing ? '❚❚' : '▶';
      playLabel.textContent = playing ? 'Pause' : 'Play';
    },
    setTime(sec) {
      const text = `t = ${sec.toFixed(1)} s`;
      if (time.textContent !== text) time.textContent = text;
      time.dataset.sec = String(Math.round(sec * 1000) / 1000); // the exact time, for tests and anything reading it
    },
    /**
     * The Formation card. r: { flying, note, queued, nowLines: [text], judged: { text, tone } | null,
     * errors: { set, outcome: { text, tone } | null } | null, ships: [{ id, name, text }] }.
     */
    renderCard(r) {
      flying.textContent = r.flying;
      flyingNote.textContent = r.note ?? '';
      flyingNote.hidden = !r.note;
      const queueText = r.queued ? `Next: ${r.queued}` : '';
      if (queueLine.textContent !== queueText) queueLine.textContent = queueText;
      clear(now);
      for (const t of r.nowLines) now.append(h('li', {}, t));
      // A live region: rewritten only when the judgement changes, so a screen reader says it once.
      const judgedText = r.judged ? r.judged.text : 'Judged once all have rolled out.';
      if (judgedText !== lastJudged) {
        lastJudged = judgedText;
        judged.textContent = judgedText;
        judged.className = `ts-line ts-judged tone-${r.judged?.tone ?? 'none'}`;
      }
      // The training error, when one is set: what it is, then (once, after the roll-out) whether #2 carried or fixed it.
      errorSet.textContent = r.errors?.set ?? '';
      errorSet.hidden = !r.errors;
      const outcomeText = r.errors?.outcome?.text ?? '';
      if (outcomeText !== lastOutcome) {
        lastOutcome = outcomeText;
        errorOutcome.textContent = outcomeText;
        errorOutcome.className = `ts-line ts-judged ts-error-outcome tone-${r.errors?.outcome?.tone ?? 'none'}`;
      }
      errorOutcome.hidden = !outcomeText;
      clear(ships);
      for (const s of r.ships) ships.append(h('li', {}, swatch(s.id), h('strong', {}, s.name), ' ', h('span', {}, s.text)));
    },
    onPress: (fn) => (handlers.press = fn),
    onPlayPause: (fn) => (handlers.playPause = fn),
    onResetRun: (fn) => (handlers.resetRun = fn),
    onSpeed: (fn) => (handlers.speed = fn),
    onFit: (fn) => (handlers.fit = fn),
    /** The Fit button shows while the fit-all camera is paused by a pan or zoom, or switched off. */
    setFitShown(shown) {
      fitButton.hidden = !shown;
    },
  };
}
