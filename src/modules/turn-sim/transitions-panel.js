// The "Change formation" group of buttons and the Formation card's lines for it (Turn Sim spec
// section 10, TS-53). Everything is built with h(), so all text goes in as text. The flying is
// live/transitions.js; this file is only the screen: buttons that show only when the pair's formation can use them (a
// button it can never use is hidden; one that is only busy for a moment is greyed), a Side switch (Keep, L or R), "More" with Line astern and the rejoin kind, and the card's
// "Now:", the rejoin block (range, closure, Lead's clock position, ON LINE / HOT / COLD, height
// against Lead) and the flags. Flags are never walls: the sim flies on and says so.
// The 4-ship has its own buttons (spec section 8, TS-54; live/four-plan.js): setShips swaps them.
import { h, clear } from '../../ui-kit/dom.js';
import { rejoinReadout } from './live/judge.js';
import { REJOIN, KIAS_OUTSIDE_LAB, RATE_CHOICES, RATE_WORDS, CLOSE_IN_SEC, REJOIN_CLOSURE_KT, setRates, ratesNow } from './live/tuning.js';
import { slowWord } from './live/slow-down.js';
import { FORMATIONS, FOUR_FORMATIONS, fourWords } from './live/slots.js';
import { MOVE_IN_BAND_KEY, MOVE_IN_BAND_FORMATIONS, MOVE_STEP_FT, placeNow, clampToBand } from './live/move-in-band.js';

/** The main buttons, in screen order. Fluid manoeuvring starts from fighting wing only (spec section 10.3, TS-57). */
export const CHANGE_BUTTONS = Object.freeze([
  { key: 'lab', label: 'Line abreast' },
  { key: 'fw', label: 'Fighting wing' },
  { key: 'echelon', label: 'Echelon' },
  { key: 'route', label: 'Route' },
  { key: 'fluid', label: 'Fluid' }, // fluid manoeuvring, short so three fit a row (Patrick, 5 Oct)
]);
/** The four's buttons (spec section 8): the wide formations first, then the close ones; Line astern and Route under More. */
export const FOUR_CHANGE_BUTTONS = Object.freeze([
  { key: 'spread4', label: 'Spread 4' },
  { key: 'fw', label: 'Fighting wing' },
  { key: 'fluid4', label: 'Fluid 4' },
  { key: 'fluidMan', label: 'Fluid manoeuvring', later: true },
  { key: 'offsetBox', label: 'Offset box' },
  { key: 'finger', label: 'Finger' },
  { key: 'echelon', label: 'Echelon' },
  { key: 'box', label: 'Box' },
]);
const FOUR_MORE_BUTTONS = Object.freeze([{ key: 'trail', label: 'Line astern' }, { key: 'route', label: 'Route' }]);
/** The four's close formations, where Lead's limit is 3 G (Orders B2 ch 8), and fighting wing's 4 G. */
const FOUR_CLOSE = Object.freeze(['finger', 'echelon', 'box', 'trail', 'route']);
/** The formations where pressing L or R flies the side change at once (Patrick, 5 Oct). */
const SIDE_CHANGE_FORMATIONS = Object.freeze(['fw', 'echelon', 'route']);
const SIDES = Object.freeze([{ value: 'keep', label: 'Keep' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]); // written out (Patrick, 5 Oct)
// The Rejoin kind, from line abreast and (since V2.59, TS-67; Patrick 5 Oct 05:13Z: "FW-Esch you can pick TRJ or SARJ.
// Obviously TRJ is faster") from fighting wing to echelon or route: the turning rejoin (TRJ, the default) or straight ahead (SARJ).
// Auto (TS-76, the chooser): both are flown ahead as dry runs and the quicker that passes the checks is flown; 2-ship only.
const REJOIN_OPTIONS = Object.freeze([
  { value: 'into', label: 'Turning (TRJ), Lead turns into #2' },
  { value: 'straight', label: 'Straight ahead (SARJ)' },
  { value: 'auto', label: 'Auto, the quicker of the two' },
]);


/** "Line abreast, right" for the pair as classified now (live/judge.js classify). */
export function nowWords(where) {
  if (where.key === 'fluid') return 'Fluid manoeuvring';
  const word = FORMATIONS[where.key]?.label;
  if (!word) return 'between formations';
  if (!FORMATIONS[where.key].sided) return word;
  return `${word}, ${where.side > 0 ? 'left' : 'right'}`;
}

/**
 * The flags for the Formation card (spec section 10, "Flags, never walls"): Lead above 4 G in fighting wing and above
 * 3 G in close formation (2 CFFTS Orders B2 ch 8; Gen Book p.11), #2 at or above Lead's height in a rejoin (SMM 12.27
 * para 65), and #2 past the G rule's bank in a rejoin (5 G level, Patrick 06:16Z). Returns an array of sentences.
 */
export function changeFlags(state, where) {
  const [lead, wing] = state.aircraft;
  const flags = [];
  const limit = where.key === 'fw' ? 4 : ['echelon', 'route', 'astern'].includes(where.key) ? 3 : Infinity;
  if (lead.g > limit) flags.push(`Lead is pulling ${lead.g.toFixed(1)} G in ${FORMATIONS[where.key].label.toLowerCase()}; the limit is ${limit} G (Orders B2 ch 8).`);
  const c = state.current?.change;
  if (c?.rejoining) {
    const r = rejoinReadout(lead, wing);
    if (r.rangeFt < 2000 && r.aboveLead) flags.push('#2 is at or above Lead\'s height; a rejoin stays below him (SMM 12.27 para 65).');
  }
  if (c && Math.abs(wing.bankDeg) >= REJOIN.bankCapDeg - 0.5 && c.rejoining) flags.push(`#2 is at ${Math.round(REJOIN.bankCapDeg)}° of bank, 5 G in a level turn: the G rule's normal limit (Patrick 06:16Z; SMM 16.17 para 44a); flown anyway.`);
  return flags;
}

/** The four's flags: Lead above 4 G in fighting wing or 3 G in a close formation (2 CFFTS Orders B2 ch 8; Gen Book p.11). */
export function fourChangeFlags(state, where) {
  const lead = state.aircraft[0];
  const limit = where.key === 'fw' ? 4 : FOUR_CLOSE.includes(where.key) ? 3 : Infinity;
  return lead.g > limit ? [`Lead is pulling ${lead.g.toFixed(1)} G in ${FOUR_FORMATIONS[where.key].label.toLowerCase()}; the limit is ${limit} G (Orders B2 ch 8).`] : [];
}

/** Where #2 is against Lead, in words for the Position readout: fighting wing as range and sweep, the others fore and aft and out. */
function placeWords(key, p) {
  const height = Math.abs(p.alt) < 1 ? 'level' : `${Math.round(Math.abs(p.alt))} ft ${p.alt < 0 ? 'below' : 'above'}`;
  if (key === 'fw') {
    const range = Math.hypot(p.fwd, p.left);
    const sweep = Math.atan2(-p.fwd, Math.max(Math.abs(p.left), 1e-6)) * (180 / Math.PI);
    return `#2: ${Math.round(range)} ft, ${Math.round(sweep)}° back, ${height}`;
  }
  const fore = Math.abs(p.fwd) < 1 ? 'abeam' : `${Math.round(Math.abs(p.fwd))} ft ${p.fwd < 0 ? 'back' : 'forward'}`;
  return `#2: ${Math.round(Math.abs(p.left)).toLocaleString('en-CA')} ft out, ${fore}, ${height}`;
}

/**
 * onChange(to, { side, rejoin }): called when a button is pressed. fluidUi: the fluid manoeuvring group (fluid-panel.js),
 * shown under this one for the 2-ship, or null. Returns
 * { element, cardElement, setShips(n), update(state, where), renderCard(state, where), values() }.
 */
export function createChangeUi({ onChange, fluidUi = null }) {
  let side = 'keep';
  let rejoin = 'into';
  let four = false;
  let whereNow = null; // the formation the aircraft are in, from the last update

  const buttons = new Map(); // the pair's
  const fourButtons = new Map();
  const makeButton = (b, into = buttons) => {
    const button = h('button', {
      type: 'button',
      class: 'button ts-change-button',
      dataset: { change: b.key },
      disabled: Boolean(b.later),
      hidden: Boolean(b.later), // not built yet: hidden, not greyed (Patrick, 5 Oct fly-through item 6)
      title: b.later ? 'Coming later' : '',
      onclick: () => onChange(b.key, { side, rejoin }),
    }, h('span', {}, b.label));
    into.set(b.key, button);
    return button;
  };
  const makeFourButton = (b) => makeButton(b, fourButtons);

  const sideButtons = SIDES.map((o) => h('button', {
    type: 'button',
    class: 'button ts-side-button',
    dataset: { side: o.value },
    'aria-pressed': String(o.value === side),
    onclick: () => {
      side = o.value;
      for (const b of sideButtons) b.setAttribute('aria-pressed', String(b.dataset.side === side));
      handlers.sideChanged?.();
      // L or R in fighting wing, echelon or route changes side at once (Patrick, 5 Oct): the same change as pressing the
      // formation's own button with the other side, a station change in echelon and route (SMM 12.20 paras 44-45) or the
      // flow behind Lead in fighting wing (SMM 12.29 para 69).
      const key = whereNow?.key;
      const otherSide = side !== 'keep' && (side === 'left') !== (whereNow?.side > 0);
      if (otherSide && SIDE_CHANGE_FORMATIONS.includes(key)) onChange(key, { side, rejoin });
    },
  }, o.label));
  // The rejoin switch under Formation (Patrick, 5 Oct 07:35Z: "a switch on the left under "Formations" that has TRJ or SARJ
  // and you can toggle which will happen with the formation change"): the same choice as Rejoin kind in Settings.
  const REJOIN_SWITCH = Object.freeze([
    { value: 'into', label: 'TRJ', title: 'Turning rejoin' },
    { value: 'straight', label: 'SARJ', title: 'Straight-ahead rejoin' },
    { value: 'auto', label: 'Auto', title: 'Both rejoins are tried ahead; the quicker one is flown' },
  ]);
  const rejoinButtons = REJOIN_SWITCH.map((o) => h('button', {
    type: 'button',
    class: 'button ts-side-button',
    dataset: { rejoin: o.value },
    title: o.title,
    'aria-pressed': String(o.value === rejoin),
    onclick: () => setRejoin(o.value),
  }, o.label));
  // The rejoin kind matters only where a rejoin starts: line abreast, and fighting wing to a close formation (update).
  const rejoinRow = h('div', { class: 'ts-side ts-side-row', role: 'group', 'aria-label': 'Rejoin: turning, straight ahead or auto' }, h('span', { class: 'ts-hint' }, 'Rejoin'), rejoinButtons);
  function setRejoin(value) {
    rejoin = value;
    for (const b of rejoinButtons) b.setAttribute('aria-pressed', String(b.dataset.rejoin === rejoin));
    if (rejoinSelect.value !== rejoin) rejoinSelect.value = rejoin;
  }
  const handlers = {};

  // Position (TS-98; Patrick 5 Oct 23:54Z, 23:56Z, 6 Oct 00:04Z): #2's place against Lead, and buttons that move him inside the band of
  // the formation he is in (live/move-in-band.js). Each tap is a move the sim flies; taps stop at the band's edge and say so;
  // the next move plans from where he is. Shown in fighting wing, line abreast, echelon, route and line astern, 2-ship.
  let stateNow = null;
  let target = null; // where the taps have asked for, in Lead's frame, while a move in the band is flown
  let edgeUntil = -Infinity; // the "at the band's edge" word shows until this formation time
  const placeLine = h('p', { class: 'ts-hint ts-position-now', role: 'status' });
  const tap = (axis, sign) => {
    if (!stateNow || !whereNow || !MOVE_IN_BAND_FORMATIONS.includes(whereNow.key)) return;
    const [lead, wing] = stateNow.aircraft;
    const key = whereNow.key;
    const from = target ?? placeNow(lead, wing);
    const step = MOVE_STEP_FT[key][axis] * sign;
    const want = { ...from };
    if (axis === 'fwd') want.fwd += step;
    else if (axis === 'out') want.left += Math.sign(from.left || whereNow.side || -1) * step; // out: away from Lead on #2's side
    else want.alt += step;
    const c = clampToBand(lead, wing, key, whereNow.side, from, want, stateNow.spacingFt);
    const moved = Math.hypot(c.place.fwd - from.fwd, c.place.left - from.left, c.place.alt - from.alt) > 0.5;
    target = c.place;
    edgeUntil = c.atEdge ? stateNow.tSec + 4 : -Infinity;
    if (moved || !c.atEdge) onChange(MOVE_IN_BAND_KEY, { target, formation: key, side: key === 'astern' ? 0 : whereNow.side });
    return moved;
  };
  // Tap and hold (Patrick 6 Oct 00:04Z): a tap is one step; holding takes another step every HOLD_REPEAT_MS (an estimate for
  // the hand) until the button is let go or #2 is at the band's edge. Each step re-plans at once from where #2 is.
  const HOLD_REPEAT_MS = 250;
  let holdTimer = null;
  const stopHold = () => {
    if (holdTimer !== null) clearInterval(holdTimer);
    holdTimer = null;
  };
  const holdButton = (axis, sign, words) => h('button', {
    type: 'button',
    class: 'button ts-side-button',
    onpointerdown: (e) => {
      e.preventDefault();
      stopHold();
      if (tap(axis, sign)) holdTimer = setInterval(() => { if (!tap(axis, sign)) stopHold(); }, HOLD_REPEAT_MS);
    },
    onpointerup: stopHold,
    onpointerleave: stopHold,
    onpointercancel: stopHold,
    onclick: (e) => { if (e.detail === 0) tap(axis, sign); }, // Enter or Space: one step (a pointer's step was taken on pointerdown)
  }, words);
  const POSITION_ROWS = Object.freeze([
    { axis: 'fwd', minus: 'Aft', plus: 'Fore' },
    { axis: 'out', minus: 'In', plus: 'Out' },
    { axis: 'up', minus: 'Down', plus: 'Up' },
  ]);
  const positionRows = POSITION_ROWS.map((r) => h('div', { class: 'ts-side ts-side-row', role: 'group', 'aria-label': `${r.minus} or ${r.plus}`, dataset: { axis: r.axis } },
    holdButton(r.axis, -1, r.minus),
    holdButton(r.axis, 1, r.plus)));
  const positionGroup = h('div', { class: 'ts-change-group ts-position', hidden: true },
    h('h4', { class: 'ts-change-subtitle' }, 'Position'),
    placeLine,
    positionRows,
    h('p', { class: 'ts-hint' }, 'Moves #2 inside the band; the next move starts from there.'));

  const refusal = h('p', { class: 'ts-warning', role: 'status', hidden: true });
  const rejoinSelect = h('select', { 'aria-label': 'Rejoin kind', onchange: () => setRejoin(rejoinSelect.value) },
    REJOIN_OPTIONS.map((o) => h('option', { value: o.value, selected: o.value === rejoin }, o.label)));
  const rejoinLabel = h('span', { class: 'ts-hint' }, 'Rejoin kind');
  const PAIR_REJOIN_HINT = `From line abreast or fighting wing. Turning (TRJ): Lead turns into #2 at the press at ${REJOIN.leadBankDeg}° of bank, slowing to ${KIAS_OUTSIDE_LAB} KIAS, and holds it until #2 is in (SMM 16.20 para 65); #2 gets onto the rejoin line, Lead at his 10:30 or 1:30 and slightly high, closes down it and flows through route into the slot (SMM 12.24 paras 56-58). Straight ahead (SARJ): #2 drops onto Lead's six and runs up it (SMM 12.26 paras 62-63). Auto: both are tried ahead and the quicker one is flown; the card says which.`;
  const FOUR_REJOIN_HINT = `A turning rejoin: Lead turns into #2 at the press, slowing to ${KIAS_OUTSIDE_LAB} KIAS; #3 and #4 close at once and come in on the outside one at a time, #3 once #2 is in and #4 once #3 is (SMM 16.34 paras 95-96). Straight ahead, each closes through route in turn.`;
  const rejoinHint = h('p', { class: 'ts-hint' }, PAIR_REJOIN_HINT);
  const rejoinField = h('label', { class: 'ts-field' }, rejoinLabel, rejoinSelect);
  // Rates (clean-up steps 2 and 3, TS-65, TS-66; Patrick 5 Oct 05:46Z, 06:09Z, 06:11Z): how fast the wingmen close,
  // Student, Instructor (the default) or AI, 2-ship and 4-ship. It changes the closures only, not the banks or the G (06:07Z).
  const rateWords = (c) => `${RATE_WORDS[c]}: ${REJOIN_CLOSURE_KT[c]} kt rejoins, route to echelon in about ${CLOSE_IN_SEC[c]} s`;
  const ratesSelect = h('select', { 'aria-label': 'Rates', onchange: () => setRates(ratesSelect.value) },
    RATE_CHOICES.map((c) => h('option', { value: c, selected: c === ratesNow() }, rateWords(c))));
  const ratesField = h('label', { class: 'ts-field' }, h('span', { class: 'ts-hint' }, 'Rates'), ratesSelect);
  // The rejoin choice and Rates live in the Settings box (Patrick, 5 Oct); the rejoin's default is Lead turning into #2.
  const rejoinSettings = h('div', { class: 'ts-rejoin-setting' }, rejoinField, rejoinHint, ratesField);

  const PAIR_HINT = 'The pair flies the manuals\' transition from where it is now. The formation you are in is lit; a button this formation cannot use is hidden.';
  const FOUR_HINT = 'The four fly the manuals\' way there from where they are now, one at a time where the manuals say to wait. Side is #2\'s side; finger is named by the side #3 and #4 are on.';
  const hint = h('p', { class: 'ts-hint' }, PAIR_HINT);
  // Two groups (Patrick, 5 Oct): Tactical (line abreast, fighting wing, fluid, the four's wide formations) and Close formation.
  const TACTICAL = new Set(['lab', 'fw', 'fluid', 'spread4', 'fluid4', 'fluidMan', 'offsetBox']);
  const group = (title, buttons) => h('div', { class: 'ts-change-group' }, h('h4', { class: 'ts-change-subtitle' }, title), h('div', { class: 'ts-change-grid' }, buttons));
  const pairAll = [...CHANGE_BUTTONS, { key: 'astern', label: 'Line astern' }];
  const fourAll = [...FOUR_CHANGE_BUTTONS, ...FOUR_MORE_BUTTONS];
  const pairGrid = h('div', {},
    group('Tactical', pairAll.filter((b) => TACTICAL.has(b.key)).map((b) => makeButton(b))),
    group('Close formation', pairAll.filter((b) => !TACTICAL.has(b.key)).map((b) => makeButton(b))));
  const fourGrid = h('div', { hidden: true },
    group('Tactical', fourAll.filter((b) => TACTICAL.has(b.key)).map(makeFourButton)),
    group('Close formation', fourAll.filter((b) => !TACTICAL.has(b.key)).map(makeFourButton)));
  const element = h('section', { class: 'ts-change', 'aria-labelledby': 'ts-change-title' },
    // The FORMATION bar, the two groups, then Side, just above the manoeuvres (Patrick, 5 Oct).
    h('div', { class: 'ts-section-bar' }, h('h3', { id: 'ts-change-title' }, 'Formation')),
    pairGrid,
    fourGrid,
    h('div', { class: 'ts-side ts-side-row', role: 'group', 'aria-label': 'Station: the side #2 ends on' }, h('span', { class: 'ts-hint' }, 'Station'), sideButtons), // "Station", was "Side" (Patrick, 5 Oct)
    rejoinRow,
    positionGroup,
    refusal,
    fluidUi?.element ?? null,
    fluidUi?.lagElement ?? null, // "#2": the lag roll, in its own small group
  );

  // ---- the card's lines ----
  const nowLine = h('p', { class: 'ts-line ts-now-formation' });
  const rejoinBlock = h('ul', { class: 'ts-lines ts-rejoin', 'aria-label': 'The rejoin', hidden: true });
  const flagList = h('ul', { class: 'ts-lines ts-flags', 'aria-label': 'Flags', hidden: true });
  const cardElement = h('div', { class: 'ts-change-card' }, nowLine, rejoinBlock, flagList, fluidUi?.cardElement ?? null);

  return {
    element,
    cardElement,
    /** The fluid settings, for the Settings box (fluid-panel.js), or null. */
    fluidSettings: fluidUi?.settingsElement ?? null,
    /** The rejoin choice and its note, for the Settings box. */
    rejoinSettings,
    onSideChanged: (fn) => (handlers.sideChanged = fn),
    values: () => ({ side, rejoin }),
    /** 2-ship or 4-ship: shows that formation's buttons and words. */
    setShips(ships) {
      four = ships === 4;
      pairGrid.hidden = four;
      if (four) positionGroup.hidden = true; // the pair's only (move-in-band.js)
      fourGrid.hidden = !four;
      hint.textContent = four ? FOUR_HINT : PAIR_HINT;
      if (fluidUi) fluidUi.element.hidden = true; // the pair's shows in fluid manoeuvring and fighting wing only (update); the four's is a later piece
      if (fluidUi) fluidUi.lagElement.hidden = true; // the pair's lag roll group is shown by update
      if (fluidUi) fluidUi.settingsElement.hidden = four;
      rejoinField.hidden = false;
      rejoinHint.hidden = false;
      rejoinLabel.textContent = four ? 'Rejoin to fighting wing or finger' : 'Rejoin kind';
      rejoinSelect.options[0].textContent = four ? 'Turning, Lead turns into the others' : REJOIN_OPTIONS[0].label;
      // Auto races the 2-ship's rejoins (chooser.js); the 4-ship has no race, so it goes back to the turning rejoin.
      if (four && rejoin === 'auto') setRejoin('into');
      for (const o of rejoinSelect.options) if (o.value === 'auto') o.disabled = four;
      for (const b of rejoinButtons) if (b.dataset.rejoin === 'auto') b.hidden = four;
      rejoinHint.textContent = four ? FOUR_REJOIN_HINT : PAIR_REJOIN_HINT;
    },
    /** Greys the button for the formation the pair is in (and, for a sided one, on the side the switch asks for), and shows a refusal. */
    update(state, where) {
      whereNow = where;
      if (four) {
        for (const [key, button] of fourButtons) {
          if (FOUR_FORMATIONS[key].later) continue;
          const here = key === where.key && (!FOUR_FORMATIONS[key].sided || side === 'keep' || (side === 'left') === (where.side > 0));
          button.disabled = here;
          button.setAttribute('aria-current', String(here)); // lit as "you are here", not greyed
          button.title = here ? 'You are here' : '';
        }
        refusal.textContent = state.refusal ?? '';
        refusal.hidden = !state.refusal;
        return;
      }
      fluidUi?.update(state, where);
      // Position: only in a formation it works in, with nothing else flying (or the move in the band itself, so taps add up).
      stateNow = state;
      const nudging = state.current?.key === `change:${MOVE_IN_BAND_KEY}`;
      const showPosition = MOVE_IN_BAND_FORMATIONS.includes(where.key) && !where.manoeuvring && (!state.current || nudging);
      positionGroup.hidden = !showPosition;
      if (!showPosition) stopHold();
      if (!nudging) target = null; // once he is there, the next taps start from where he is
      if (showPosition) {
        const [lead, wing] = state.aircraft;
        const words = `${placeWords(where.key, placeNow(lead, wing))}${state.tSec < edgeUntil ? ": at the band's edge" : ''}`;
        if (placeLine.textContent !== words) placeLine.textContent = words;
        // No Up or Down in the close formations: a 5 ft step is under the tracker's least height change (move-in-band.js).
        for (const row of positionRows) row.hidden = row.dataset.axis === 'up' && ['echelon', 'route', 'astern'].includes(where.key);
      }
      // Only what the formation the pair is in can use shows (Patrick, 5 Oct, fly-through item 6): the fluid manoeuvring
      // buttons while it runs; in fighting wing Lead's level turns, climbs and descents (TS-70); the lag roll in its own "#2"
      // group in fighting wing and echelon (TS-78, fluid-panel.js). A button that is only busy for a moment is greyed.
      if (fluidUi) fluidUi.element.hidden = where.key !== 'fluid' && where.key !== 'fw';
      rejoinRow.hidden = where.key !== 'lab' && where.key !== 'fw';
      for (const [key, button] of buttons) {
        if (key === 'fluid') {
          // Fluid starts from fighting wing only (Patrick 21:44Z, spec section 10.3, formation.js startFluid), so it is hidden
          // in every other formation; once it runs it is the "you are here" button.
          const running = where.key === 'fluid';
          button.hidden = !running && where.key !== 'fw';
          const ok = where.key === 'fw' && !state.current && !where.manoeuvring;
          button.disabled = !ok;
          button.setAttribute('aria-current', String(running));
          button.title = running ? 'You are here' : ok ? '' : where.manoeuvring ? 'Wings level first; the formation buttons come back once #2 has settled' : 'Wait for the change to finish';
          continue;
        }
        if (where.key === 'fluid' || where.manoeuvring) {
          // In fluid manoeuvring Terminate is the way out; it ends in fighting wing (spec section 10.3). While Lead flies a
          // fighting wing move, Wings level, then the change once #2 has settled (TS-70). Busy for a moment: greyed, not hidden.
          button.disabled = true;
          button.setAttribute('aria-current', 'false');
          button.title = where.manoeuvring ? 'Wings level first; the formation buttons come back once #2 has settled' : 'Terminate first';
          continue;
        }
        // Every formation button shows in every formation: no rule in live/transitions.js, chooser.js or its planners refuses a
        // formation from another (the tracker flies any to any); the only refusal is "Already in ..." (the lit button).
        const here = key === where.key && (key === 'astern' || side === 'keep' || (side === 'left') === (where.side > 0));
        // Line abreast has no side change of its own: a change of side there goes through another formation first.
        const greyed = here || (key === 'lab' && where.key === 'lab');
        button.disabled = greyed;
        button.setAttribute('aria-current', String(greyed && key === where.key)); // lit as "you are here", not greyed
        button.title = greyed ? 'You are here' : '';
      }
      refusal.textContent = state.refusal ?? '';
      refusal.hidden = !state.refusal;
    },
    renderCard(state, where) {
      const text = `Now: ${four ? fourWords(where) : nowWords(where)}`;
      if (nowLine.textContent !== text) nowLine.textContent = text;
      const c = state.current?.change;
      clear(rejoinBlock);
      clear(flagList);
      if (four) {
        // The four: the time left on the change (its legs and gates are in the note above it).
        rejoinBlock.hidden = !c;
        if (c) rejoinBlock.append(h('li', {}, `About ${Math.max(0, Math.round(state.current.endSec - state.tSec))} s to go`));
        const flags = [...fourChangeFlags(state, where), ...stretchedFlags(state)];
        flagList.hidden = flags.length === 0;
        for (const f of flags) flagList.append(h('li', { class: 'tone-caution' }, f));
        return;
      }
      // The rejoin's range, closure and clock are on the data tags now (Patrick, 5 Oct); only OVERSHOOTING and the slow-down stay.
      rejoinBlock.hidden = !(c?.rejoining && (state.aircraft[1]?.overshooting || slowWord(state.aircraft[1])));
      if (c?.rejoining && !rejoinBlock.hidden) {
        // How #2 is flying it (TS-61, TS-62): OVERSHOOTING, and the speed brake or idle when he is slowing with them.
        const wing = state.aircraft[1];
        const how = [wing.overshooting ? 'OVERSHOOTING, behind and below Lead (SMM 12.27 para 65)' : null, slowWord(wing) ? `${slowWord(wing)} to control the overtake` : null].filter(Boolean);
        if (how.length) rejoinBlock.append(h('li', { class: 'tone-caution' }, `#2: ${how.join('; ')}`));
      }
      const flags = where.key === 'fluid' ? [] : [...changeFlags(state, where), ...stretchedFlags(state)]; // fluid has its own flags (fluid-panel.js)
      flagList.hidden = flags.length === 0;
      for (const f of flags) flagList.append(h('li', { class: 'tone-caution' }, f));
      fluidUi?.renderCard(state);
    },
  };
}

/**
 * The card's STRETCHED lines (TS-63, Patrick 5 Oct 02:48Z): each wingman held to full power behind the place his line wanted
 * him, who closes up as best he can once Lead's manoeuvre ends.
 */
function stretchedFlags(state) {
  return state.aircraft
    .filter((a) => a.ref != null && a.stretched)
    .map((a) => `${a.name ?? `#${a.id}`}: STRETCHED, at full power behind his place; he closes up as best he can once Lead's manoeuvre ends.`);
}
