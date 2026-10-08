// The SOF's one settings menu (R22, Patrick's rule): every tuning number sits
// behind it and it starts closed, so the screen shows only the essentials. On the one-screen SOF (SOF-38) it
// opens from the SOF bar's "SOF settings" button, as a drop-down over the screen. This
// only fills ui-kit's shared Settings menu with the SOF's controls; the values
// and their defaults are in settings-model.js.
import { h } from '../../ui-kit/dom.js';
import { createControls } from '../../ui-kit/controls.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { TRIGGER_OPTIONS, BANNER_HINT, MAX_RELAY_CHARS, relayAccepted, withTrigger, snapCeiling, snapVisibility, CROSSWIND_RANGE, CLOUD_STYLES, AREA_OPTIONS } from './settings-model.js';
import { RUNWAY_STATES, CROSSWIND_SOURCE } from './crosswind.js';
import { HOME_BASE_OPTIONS, OTHER_HOME, homeBaseSetting, homeBaseNote, canChooseHomeBase, homeBaseWords } from './home-base.js';

const hint = (text) => h('p', { class: 'sof-hint' }, text);

/**
 * settings: the SOF's settings (createSofSettings); crosswind: the crosswind levels and runway state (createCrosswindSettings), or left out; view3d: the 3D view's
 * cloud style and area (createView3dSettings), or left out. airfields: app.airfields, for the Home base choice (it sets home and the base's usual alternates
 * there, and stores nothing of its own), or left out. onToggle(collapsed): called when the menu's own header or Escape closes it. Reset to defaults resets
 * the SOF's own settings; the home field and alternates are the shared airfields setting's and are left as they are.
 * Returns { element, setOpen(open), dispose }: the menu opens from the SOF bar's button as a drop-down (layout.js).
 */
export function createSettingsView({ settings, crosswind = null, view3d = null, airfields = null, onToggle }) {
  // The boxes see the numbers as typed; everything else sees them snapped (settings-model.js).
  const view = withTrigger(settings.editing);
  const controls = createControls(view);
  const menu = createSettingsMenu({ title: 'SOF settings', onReset: () => { settings.reset(); crosswind?.reset(); view3d?.reset(); }, onToggle });

  // The Home base choice (plan Step 2c, part B): first, since everything below is about this base.
  const home = airfields ? homeBase(airfields, menu) : null;

  const trigger = controls.select('trigger', { label: 'Trigger', options: TRIGGER_OPTIONS });
  // Custom is only ever what the two numbers say: it's not offered in the list, and if it is chosen anyway
  // the choice goes back to what the numbers say. (Not `disabled`, which would grey the whole control.)
  const select = trigger.querySelector('select');
  select.querySelectorAll('option')[TRIGGER_OPTIONS.findIndex((o) => o.value === 'custom')].hidden = true;
  select.addEventListener('change', () => {
    select.value = String(TRIGGER_OPTIONS.findIndex((o) => o.value === view.get().trigger));
  });
  const ceiling = controls.number('ceilingFt', { label: 'Home ceiling below', unit: 'ft', min: 0, max: 10000, step: /** @type {any} */ (100) });
  const visibility = controls.number('visSm', { label: 'Home visibility below', unit: 'SM', min: 0, max: 10, step: /** @type {any} */ (0.25) });
  // Typing writes good numbers straight through; on commit (Enter, or leaving the box) the number snaps UP to its
  // step, the safe side, and the box shows what the check uses.
  for (const [field, key, snap] of [[ceiling, 'ceilingFt', snapCeiling], [visibility, 'visSm', snapVisibility]]) {
    field.querySelector('input').addEventListener('change', () => {
      const value = settings.editing.get()[key];
      if (snap(value) !== value) settings.update({ [key]: snap(value) }); // the control's own sync rewrites the box
    });
  }
  menu.section('Alternate trigger').append(
    trigger,
    ceiling,
    visibility,
    hint('Home needs an alternate when its forecast is below either number. Choosing a trigger fills both in; a typed number goes up to the next 100 ft or quarter mile.'),
  );

  // Lightning near home (SOF-3): the radius the check and its ring on the map use.
  const radius = controls.number('lightningNm', { label: 'Lightning radius around home', unit: 'NM', min: 5, max: 50, step: /** @type {any} */ (1) });
  menu.section('Lightning near home').append(
    radius,
    hint('A caution is raised when ECCC\'s 10-minute lightning map shows lightning within this distance of home. It is an estimate on a 2.5 km grid, not individual strikes.'),
  );

  // Crosswind per runway (SOF-R27, SOF-43): the runway state and the four levels, each a reference, not a wall.
  const xwControls = crosswind ? createControls(crosswind) : null;
  if (xwControls) {
    const knots = (key, label) => xwControls.number(key, { label, unit: 'kt', min: CROSSWIND_RANGE.min, max: CROSSWIND_RANGE.max, step: /** @type {any} */ (CROSSWIND_RANGE.step) });
    menu.section('Crosswind (references, not walls)').append(
      xwControls.select('runwayState', { label: 'Runway state', options: RUNWAY_STATES }),
      knots('xwAmberDryKt', 'Amber over, dry'),
      knots('xwAmberWetKt', 'Amber over, wet'),
      knots('xwAmberIcyKt', 'Amber over, icy'),
      knots('xwRedDryKt', 'Red over, dry'),
      hint('Each airfield card shows the headwind and crosswind on every runway from the latest METAR (gust when reported; VRB counts in full), amber over the level for the runway state chosen here and red over the red level. Red on every runway at home puts a line on the caution banner. The runway state never changes by itself; a card says when its METAR reports precipitation.'),
      hint(`Source: ${CROSSWIND_SOURCE}`),
    );
  }

  // The 3D view's height scale (SOF-39): heights are drawn this many times taller than distances on the ground.
  const heightScale = controls.number('heightScale3d', { label: '3D height scale', min: 1, max: 20, step: /** @type {any} */ (1) });
  const view3dSection = menu.section('3D view');
  view3dSection.append(
    heightScale,
    hint('The 3D view draws heights this many times taller than distances on the ground, so cloud decks are easy to see. It is an estimate for readability; the corner of the 3D view says the number in use.'),
  );
  // The 3D view's cloud style (SOF-39, Fable review 7 Oct): slabs with a base and a top (the default), or the old one sheet per model level.
  const styleControls = view3d ? createControls(view3d) : null;
  if (styleControls) {
    view3dSection.append(
      styleControls.select('cloudStyle3d', { label: '3D cloud style', options: CLOUD_STYLES }),
      hint('Slabs: the model cloud in each stage (low, mid, high) drawn from its base to its top in every model column. One sheet per model level: the old flat sheets at each pressure level, with the Layer picker. Both are model estimates.'),
    );
    // The 3D area (Dad, 8 Oct 2026): the square round home the 3D view shows.
    view3dSection.append(
      styleControls.select('area3dNm', { label: '3D area', options: AREA_OPTIONS }),
      hint('How far the 3D view reaches: a square this wide, centred on home. Bigger shows more, more coarsely: the model cloud points are further apart (37.5 NM at 450, 50 at 600, 75 at 900), and the ground and weather pictures are less sharp. Changing it builds the 3D view again and asks for the model clouds again.'),
    );
  }

  // Traffic relay (SOF-7): empty until Patrick's relay is set up; the Traffic layer stays hidden until it is a good address.
  const relay = relayField(settings);
  menu.section('Traffic').append(relay.element, hint('Leave empty to keep the Traffic layer hidden. The address is the relay only, such as https://traffic.example.workers.dev.'));

  // The new-caution banner (V6's "New-alert caution box"), on to begin with. Off, the cards still show every caution.
  menu.section('Cautions').append(
    controls.checkbox('banner', { label: 'Show the new-caution banner' }),
    hint(BANNER_HINT),
  );

  return {
    element: menu.element,
    setOpen: (open) => menu.setCollapsed(!open),
    dispose() {
      relay.dispose();
      controls.dispose();
      xwControls?.dispose();
      styleControls?.dispose();
      home?.dispose();
    },
  };
}

/**
 * The Home base section: a "Home base" choice bound to the airfields setting (home-base.js), "Other (set in Airfields)" shown only while home is a field
 * with no profile of its own, and a line that says when the base has no weather limits. It follows a home field changed in Settings → Airfields.
 * When the SOF is handed the airfields read-only (no `update`), the section names the home base and says where to change it instead of offering a
 * choice that cannot work.
 */
function homeBase(airfields, menu) {
  if (!canChooseHomeBase(airfields)) return homeBaseReadOnly(airfields, menu);
  const setting = homeBaseSetting(airfields);
  const controls = createControls(setting);
  const choice = controls.select('homeBase', { label: 'Home base', options: HOME_BASE_OPTIONS });
  const select = choice.querySelector('select');
  const other = select.querySelectorAll('option')[HOME_BASE_OPTIONS.findIndex((o) => o.value === OTHER_HOME)];
  const note = h('p', { class: 'sof-hint sof-home-note' });
  const show = () => {
    const icao = airfields.home().icao;
    other.hidden = setting.get().homeBase !== OTHER_HOME;
    const words = homeBaseNote(icao) ?? '';
    if (note.textContent !== words) note.textContent = words;
    note.hidden = !words;
  };
  // Choosing Other does nothing (it is only ever what Airfields says): the choice goes back to what home is.
  select.addEventListener('change', () => {
    select.value = String(HOME_BASE_OPTIONS.findIndex((o) => o.value === setting.get().homeBase));
  });
  show();
  const stop = airfields.subscribe(show);
  menu.section('Home base').append(
    choice,
    hint('Choosing a base sets the home field and that base\'s usual alternates in Settings, under Airfields, where each can still be changed.'),
    note,
  );
  return {
    dispose() {
      stop();
      controls.dispose();
    },
  };
}

// The home base in words, with where to change it, and the "Limits not set" line: for when the SOF cannot change the airfields setting itself.
function homeBaseReadOnly(airfields, menu) {
  const line = h('p', { class: 'sof-home-base' });
  const note = h('p', { class: 'sof-hint sof-home-note' });
  const show = () => {
    const home = airfields.home();
    const words = `Home base: ${homeBaseWords(home)}`;
    if (line.textContent !== words) line.textContent = words;
    const extra = homeBaseNote(home.icao) ?? '';
    if (note.textContent !== extra) note.textContent = extra;
    note.hidden = !extra;
  };
  show();
  const stop = airfields.subscribe(show);
  menu.section('Home base').append(line, hint('The home field and its alternates are set in Settings, under Airfields.'), note);
  return { dispose: stop };
}

let nextRelayId = 1;

// A text box for the relay's address, bound to the setting. The address is committed when the box is left or Enter is
// pressed (the `change` event), never per keystroke: half-typed addresses such as https://relay.exam are valid origins,
// and the layer would ask each of them. While typing, the message alone follows the text. It is checked and trimmed when read.
function relayField(settings) {
  const id = `sof-relay-${nextRelayId++}`;
  const messageId = `${id}-message`;
  const input = h('input', {
    type: 'text', id, class: 'sof-relay-input', inputmode: 'url', autocomplete: 'off', spellcheck: 'false',
    maxlength: MAX_RELAY_CHARS, placeholder: 'https://', 'aria-describedby': messageId,
  });
  const message = h('span', { class: 'control-message', id: messageId });
  const show = (value, { keepText = false } = {}) => {
    if (!keepText && input.value !== value) input.value = value;
    const bad = value.trim() !== '' && !relayAccepted(value);
    if (bad) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    const text = bad ? 'Not used: it needs https:// and only the address, nothing after it.' : '';
    if (message.textContent !== text) message.textContent = text;
  };
  input.addEventListener('input', () => show(input.value, { keepText: true }));
  input.addEventListener('change', () => settings.update({ trafficRelay: input.value }));
  show(settings.editing.get().trafficRelay);
  const stop = settings.editing.subscribe((values) => show(values.trafficRelay));
  return {
    element: h('div', { class: 'control control-text' }, h('label', { for: id }, 'Traffic relay address'), input, message),
    dispose: stop,
  };
}
