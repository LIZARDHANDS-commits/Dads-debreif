// The one Settings menu every module screen keeps its tuning numbers behind
// (R22). It starts closed, so the screen shows only the essentials, and it
// opens in the page flow like any other panel, so it never covers a control
// (R2, #34). See specs/SPEC-ui-kit.md.
//
//   const settings = createSettingsMenu({ onReset: () => standards.reset() });
//   settings.section('Turn').append(controls.number('g', { … }));
//   layout.append(settings.element);
import { h } from './dom.js';
import { createPanel } from './panel.js';

export function createSettingsMenu({ title = 'Settings', collapsed = true, onReset, resetLabel = 'Reset to defaults', onToggle } = {}) {
  const panel = createPanel({ title, collapsed, onToggle });
  // Sections and anything else the module adds go here, ahead of the Reset button.
  const body = h('div', { class: 'settings-body' });
  panel.body.appendChild(body);
  if (onReset) {
    panel.body.appendChild(
      h('div', { class: 'settings-footer' }, h('button', { type: 'button', class: 'settings-reset', onclick: () => onReset() }, resetLabel)),
    );
  }
  panel.element.classList.toggle('settings-menu', true);

  // A titled group of controls. The title is text, never HTML.
  const section = (sectionTitle) => {
    const fieldset = h('fieldset', { class: 'settings-section' }, h('legend', {}, sectionTitle));
    body.appendChild(fieldset);
    return fieldset;
  };

  return {
    element: panel.element,
    body,
    section,
    get collapsed() {
      return panel.collapsed;
    },
    setCollapsed: panel.setCollapsed,
  };
}
