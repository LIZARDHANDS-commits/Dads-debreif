// The Settings dialog: choices shared by every module. Changes apply at once.
// sections: more parts of Settings, each { element, dispose }, such as the
// Airfields section; they sit below the shell's own choices.
import { h } from '../ui-kit/dom.js';

export function createSettingsDialog({ settings, storagePersistent, sections = [] }) {
  const radio = (name, value, label) =>
    h('label', { class: 'choice' }, h('input', { type: 'radio', name, value }), ' ', label);

  const timeGroup = h(
    'fieldset',
    {},
    h('legend', {}, 'Times'),
    radio('timePrimary', 'zulu', 'Zulu first, local beside it'),
    radio('timePrimary', 'local', 'Local first, Zulu beside it'),
  );
  const motion = h(
    'select',
    { id: 'setting-motion', name: 'motion' },
    h('option', { value: 'system' }, "Follow this computer's setting"),
    h('option', { value: 'full' }, 'Play card videos'),
    h('option', { value: 'reduced' }, 'Show still pictures only'),
  );
  const storageNote = h(
    'p',
    { class: 'notice', id: 'settings-storage-note', hidden: storagePersistent() },
    "This browser isn't letting the site save anything, so these settings last until you close the tab.",
  );
  const close = h('button', { type: 'submit', class: 'primary', value: 'close' }, 'Done');

  const dialog = h(
    'dialog',
    { class: 'settings-dialog', 'aria-labelledby': 'settings-title' },
    h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'settings-title' }, 'Settings'),
      timeGroup,
      h('div', { class: 'field' }, h('label', { for: 'setting-motion' }, 'Card videos'), motion),
      ...sections.map((section) => h('div', { class: 'settings-section' }, section.element)),
      storageNote,
      h('div', { class: 'dialog-actions' }, close),
    ),
  );

  const show = () => {
    const current = settings.get();
    for (const input of timeGroup.querySelectorAll('input')) input.checked = input.value === current.timePrimary;
    motion.value = current.motion;
    storageNote.hidden = storagePersistent();
  };

  timeGroup.addEventListener('change', (e) => settings.update({ timePrimary: e.target.value }));
  motion.addEventListener('change', () => settings.update({ motion: motion.value }));

  return {
    element: dialog,
    open() {
      show();
      dialog.showModal();
    },
    dispose() {
      for (const section of sections) section.dispose?.();
      dialog.remove();
    },
  };
}
