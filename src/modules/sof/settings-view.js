// The SOF's one settings menu (R22, Patrick's rule): every tuning number sits
// behind it and it starts closed, so the screen shows only the essentials. This
// only fills ui-kit's shared Settings menu with the SOF's controls; the values
// and their defaults are in settings-model.js.
import { h } from '../../ui-kit/dom.js';
import { createControls } from '../../ui-kit/controls.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { TRIGGER_OPTIONS, withTrigger } from './settings-model.js';

const hint = (text) => h('p', { class: 'sof-hint' }, text);

/** settings: the SOF's settings (storage/settings.js). Returns { element, dispose }. */
export function createSettingsView({ settings }) {
  const view = withTrigger(settings);
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
  menu.section('Alternate trigger').append(
    trigger,
    controls.number('ceilingFt', { label: 'Home ceiling below', unit: 'ft', min: 0, max: 10000, step: 100 }),
    controls.number('visSm', { label: 'Home visibility below', unit: 'SM', min: 0, max: 10, step: 0.25 }),
    hint('Home needs an alternate when its forecast is below either number. Choosing a trigger fills both in.'),
  );
  menu.section('Cautions').append(
    controls.checkbox('banner', { label: 'Show the new-caution banner' }),
    hint('Saved now. The banner itself arrives with the cautions.'),
  );
  menu.section('Lightning').append(
    controls.number('lightningNm', { label: 'Lightning radius around home', unit: 'NM', min: 5, max: 50, step: 1 }),
    hint('Saved now. Used once the lightning check is added.'),
  );

  return { element: menu.element, dispose: controls.dispose };
}
