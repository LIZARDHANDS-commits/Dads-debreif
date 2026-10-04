// The Turn Sim's screen, first version (docs/modules/turn-sim/spec.md, "The
// screen"): the manoeuvre buttons and a two-box Setup on the left, the playback
// bar above the picture in the middle, and the Formation card on the right.
// Only the essentials show; the layers are in a menu. All text goes in as text
// (h), never as HTML.
import { h, clear } from '../../ui-kit/dom.js';
import { createPanel } from '../../ui-kit/panel.js';
import { VIEW_DEFAULT, VIEW_ALLOWED } from '../../ui-kit/controls.js';
import { PAINT_DEFAULT, PAINT_OPTIONS } from '../../ui-kit/ct156-model.js';

/**
 * What the screen remembers in this browser: which columns are open, which
 * layers are on, 2D or 3D, and the 3D paint. Saved choices from an older screen
 * (another version) are not read; the defaults are used instead.
 */
export const LAYOUT_DEFAULTS = Object.freeze({
  setupColumn: true,
  formationColumn: true,
  tracks: true, // each aircraft's ground track, for the whole flight
  lead39: true,
  planned: true, // the paths still to fly, dashed
  turnCircles: false,
  view: VIEW_DEFAULT, // '2d' or '3d'
  paint: PAINT_DEFAULT, // the 3D aircraft's paint: 'harvard' or 'ship'
});
export const LAYOUT_VERSION = 2; // 1 was the plan-mode screen's

/** The layout values that only allow some choices (createSettings' `allowed`). */
export const LAYOUT_ALLOWED = /** @type {Record<string, any[]>} */ (Object.freeze({ view: [...VIEW_ALLOWED], paint: PAINT_OPTIONS.map((o) => o.value) }));

/** Layers that only the 2D picture draws; they are greyed out in 3D. */
const LAYERS_2D = ['lead39', 'planned', 'turnCircles'];

export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4]);

/** The line above the buttons, for the pair and for the four. */
const PAIR_HINT = 'Press a manoeuvre and the pair flies it, then carries on in line abreast. A press while one is flying is flown next.';
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
 */
export function createLayout({ buttons, setupControls, layout, layoutControls, listen, fixedLine }) {
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
  movesPanel.body.append(
    movesHint,
    ...rows,
    queueLine,
  );

  // ---- Setup: spacing and #2's side ---------------------------------------
  const spacingFlag = h('p', { class: 'ts-warning', role: 'status', hidden: true });
  const fourLine = h('p', { class: 'ts-fixed', hidden: true });
  const setup = h('section', { class: 'ts-setup', 'aria-labelledby': 'ts-setup-title' },
    h('h3', { class: 'ts-group-title', id: 'ts-setup-title' }, 'Setup'),
    h('div', { class: 'ts-field' }, setupControls.choice('ships', { label: 'Formation', options: [{ value: 2, label: '2-ship' }, { value: 4, label: '4-ship' }] })),
    h('div', { class: 'ts-field' }, setupControls.number('spacingFt', { label: 'Spacing', unit: 'ft', min: 1000, max: 20000, step: 100 })),
    spacingFlag,
    h('div', { class: 'ts-field' }, setupControls.choice('wingSide', { label: '#2 on Lead\'s', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }] })),
    h('p', { class: 'ts-hint' }, 'Changing these starts again from the beginning.'),
    h('p', { class: 'ts-fixed' }, fixedLine),
    fourLine,
  );
  movesPanel.body.append(setup);

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
    lc.checkbox('planned', { label: 'Planned path' }),
    lc.checkbox('turnCircles', { label: 'Turn circles' }),
    lc.select('paint', { label: '3D paint', options: PAINT_OPTIONS }),
  ]);

  const canvas = h('canvas', { class: 'ts-canvas' });
  const canvas3d = h('canvas', { class: 'ts-canvas ts-canvas3d', hidden: true }); // the 3D view's own canvas: a WebGL context can't share the 2D one
  const canvasWrap = h('div', { class: 'ts-canvas-wrap' }, canvas, canvas3d);
  const note3d = h('span', { class: 'ts-note', role: 'status', hidden: true });
  const bar = h(
    'div',
    { class: 'ts-bar', role: 'group', 'aria-label': 'Playback' },
    playButton, resetRunButton, speedSelect, time,
    h('span', { class: 'ts-bar-gap' }),
    lc.viewSwitch(), note3d, layersMenu.element,
  );
  const stage = h('section', { class: 'ts-stage', 'aria-label': 'Formation from above and playback' }, bar, canvasWrap);

  // ---- Formation card -----------------------------------------------------------
  const flying = h('p', { class: 'ts-line ts-flying' });
  const flyingNote = h('p', { class: 'ts-line ts-turn' });
  const now = h('ul', { class: 'ts-lines', 'aria-label': 'The formation now' });
  const judged = h('p', { class: 'ts-line ts-judged', 'aria-live': 'polite' });
  const ships = h('ul', { class: 'ts-card', 'aria-label': 'Each aircraft' });
  const formationPanel = createPanel({ title: 'Formation', onToggle: (c) => layout.update({ formationColumn: !c }) });
  formationPanel.body.append(
    flying, flyingNote,
    h('h3', { class: 'ts-group-title' }, 'Now'), now,
    h('h3', { class: 'ts-group-title' }, 'Last roll-out'), judged,
    h('h3', { class: 'ts-group-title' }, 'Each aircraft'), ships,
  );

  const setupCol = h('aside', { class: 'ts-col ts-col-setup', 'aria-label': 'Manoeuvres and setup' }, movesPanel.element);
  const formationCol = h('aside', { class: 'ts-col ts-col-formation', 'aria-label': 'Formation' }, formationPanel.element);
  const element = h(
    'div',
    { class: 'turn-sim' },
    h('h1', { class: 'visually-hidden' }, 'Formation Turn Sim'),
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
     * ships: [{ id, name, text }] }.
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
      clear(ships);
      for (const s of r.ships) ships.append(h('li', {}, swatch(s.id), h('strong', {}, s.name), ' ', h('span', {}, s.text)));
    },
    onPress: (fn) => (handlers.press = fn),
    onPlayPause: (fn) => (handlers.playPause = fn),
    onResetRun: (fn) => (handlers.resetRun = fn),
    onSpeed: (fn) => (handlers.speed = fn),
  };
}
