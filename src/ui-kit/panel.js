// A collapsible section. Its header is a real button, so the mouse, Enter,
// Space and Tab all behave normally (#35), and collapsing it never covers or
// hides another panel's controls (#34). See specs/SPEC-ui-kit.md.
import { h } from './dom.js';

let nextId = 1;

/**
 * @param {{ title?: string, collapsed?: boolean, onToggle?: (collapsed: boolean) => void }} [options]
 */
export function createPanel({ title, collapsed = false, onToggle } = {}) {
  const bodyId = `panel-body-${nextId++}`;
  const button = h('button', { type: 'button', class: 'panel-toggle', 'aria-controls': bodyId }, h('span', { class: 'panel-title' }, title));
  const body = h('div', { class: 'panel-body', id: bodyId });
  const element = h('section', { class: 'panel' }, h('h2', { class: 'panel-header' }, button), body);

  let isCollapsed = false;
  const setCollapsed = (value) => {
    isCollapsed = Boolean(value);
    button.setAttribute('aria-expanded', String(!isCollapsed));
    body.hidden = isCollapsed;
    element.classList.toggle('is-collapsed', isCollapsed);
  };
  setCollapsed(collapsed);
  button.addEventListener('click', () => {
    setCollapsed(!isCollapsed);
    onToggle?.(isCollapsed);
  });

  return {
    element,
    body,
    get collapsed() {
      return isCollapsed;
    },
    setCollapsed,
  };
}
