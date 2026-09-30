// The SOF's one settings menu (R22, Patrick's rule): every tuning number sits
// behind it and it starts closed, so the screen shows only the essentials. This
// only fills ui-kit's shared Settings menu with the SOF's controls; the values
// and their defaults are in settings-model.js.
import { h } from '../../ui-kit/dom.js';
import { createControls } from '../../ui-kit/controls.js';
import { createSettingsMenu } from '../../ui-kit/settings-menu.js';
import { TRIGGER_OPTIONS, withTrigger, snapCeiling, snapVisibility } from './settings-model.js';

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

  return { element: menu.element, dispose: controls.dispose };
}
