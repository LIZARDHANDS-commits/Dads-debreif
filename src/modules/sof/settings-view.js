// The SOF's one settings menu (R22, Patrick's rule): every tuning number sits
// behind it and it starts closed, so the screen shows only the essentials. This
// only fills ui-kit's shared Settings menu with the SOF's controls; the values
// and their defaults are in settings-model.js.
import { h } from '../../ui-kit/dom.js';
import { createControls } from '../../ui-kit/controls.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { TRIGGER_OPTIONS, MAX_RELAY_CHARS, relayAccepted, withTrigger, snapCeiling, snapVisibility } from './settings-model.js';

const hint = (text) => h('p', { class: 'sof-hint' }, text);

/** settings: the SOF's settings (createSofSettings). Returns { element, dispose }. */
export function createSettingsView({ settings }) {
  // The boxes see the numbers as typed; everything else sees them snapped (settings-model.js).
  const view = withTrigger(settings.editing);
  const controls = createControls(view);
  const menu = createSettingsMenu({ title: 'SOF settings', onReset: () => settings.reset() });

  const trigger = controls.select('trigger', { label: 'Trigger', options: TRIGGER_OPTIONS });
  // Custom is only ever what the two numbers say: it's not offered in the list, and if it is chosen anyway
  // the choice goes back to what the numbers say. (Not `disabled`, which would grey the whole control.)
  const select = trigger.querySelector('select');
  select.querySelectorAll('option')[TRIGGER_OPTIONS.findIndex((o) => o.value === 'custom')].hidden = true;
  select.addEventListener('change', () => {
    select.value = String(TRIGGER_OPTIONS.findIndex((o) => o.value === view.get().trigger));
  });
  const ceiling = controls.number('ceilingFt', { label: 'Home ceiling below', unit: 'ft', min: 0, max: 10000, step: 100 });
  const visibility = controls.number('visSm', { label: 'Home visibility below', unit: 'SM', min: 0, max: 10, step: 0.25 });
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
  const radius = controls.number('lightningNm', { label: 'Lightning radius around home', unit: 'NM', min: 5, max: 50, step: 1 });
  menu.section('Lightning near home').append(
    radius,
    hint('A caution is raised when ECCC\'s 10-minute lightning map shows lightning within this distance of home. It is an estimate on a 2.5 km grid, not individual strikes.'),
  );

  // Traffic relay (SOF-7): empty until Patrick's relay is set up; the Traffic layer stays hidden until it is a good address.
  const relay = relayField(settings);
  menu.section('Traffic').append(relay.element, hint('Leave empty to keep the Traffic layer hidden. The address is the relay only, such as https://traffic.example.workers.dev.'));

  return {
    element: menu.element,
    dispose() {
      relay.dispose();
      controls.dispose();
    },
  };
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
