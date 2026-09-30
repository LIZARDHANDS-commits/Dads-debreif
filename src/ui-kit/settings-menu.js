// The one settings menu every module screen keeps its own tuning numbers
// behind (R22). App-wide choices stay in the header's Settings dialog. It starts closed, so the screen shows only the essentials, and it
// opens in the page flow like any other panel, so it never covers a control
// (R2, #34). Escape closes it. See specs/SPEC-ui-kit.md.
//
//   const menu = createSettingsMenu({ title: 'Turn Sim settings', onReset: () => standards.reset() });
//   menu.section('Turn').append(controls.number('g', { … }));
//   layout.append(menu.element);
import { h } from './dom.js';
import { createPanel } from './panel.js';

/**
 * @param {{ title?: string, collapsed?: boolean, onReset?: () => void, resetLabel?: string, onToggle?: (collapsed: boolean) => void }} [options]
 */
export function createSettingsMenu({ title = 'Module settings', collapsed = true, onReset, resetLabel = 'Reset to defaults', onToggle } = {}) {
  const panel = createPanel({ title, collapsed, onToggle });
  // Sections and anything else the module adds go here, ahead of the Reset button.
  const body = h('div', { class: 'settings-body' });
  panel.body.appendChild(body);
  if (onReset) {
    panel.body.appendChild(
      h('div', { class: 'settings-footer' }, h('button', { type: 'button', class: 'settings-reset', onclick: () => onReset() }, resetLabel)),
    );
  }

  // Escape inside the open menu closes it and puts focus back on its header,
  // as a dialog would. The listener lives on the menu, so it goes with it.
  panel.element.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.collapsed) return;
    event.preventDefault();
    panel.setCollapsed(true);
    onToggle?.(true);
    panel.button.focus();
  });

  // A titled group of controls. The title is text, never HTML.
  const section = (sectionTitle) => {
    const fieldset = h('fieldset', { class: 'settings-group' }, h('legend', {}, sectionTitle));
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
