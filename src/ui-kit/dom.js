// h(tag, props, ...children) builds an element. Strings always go in as text,
// never as HTML, so a track name or label can't break the page (#25).
//
//   h('button', { class: 'primary', onclick: go, 'aria-label': 'Open' }, 'Open')
//
// props: `class`, `dataset` (object), `on<event>` (function), DOM properties such
// as `hidden`, `disabled`, `value`, `checked`; anything else becomes an attribute
// (skipped when null, undefined or false; `true` sets it empty).

const PROPERTIES = new Set(['hidden', 'disabled', 'value', 'checked', 'selected', 'tabIndex', 'open']);

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'class' || key === 'className') {
      if (value) el.setAttribute('class', value);
    } else if (key === 'dataset') {
      for (const [k, v] of Object.entries(value ?? {})) el.dataset[k] = v;
    } else if (key.startsWith('on')) {
      // Only functions: a string here would become inline script.
      if (typeof value !== 'function') throw new TypeError(`h(): ${key} must be a function`);
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (PROPERTIES.has(key)) {
      el[key] = value;
    } else if (value !== null && value !== undefined && value !== false) {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else if (typeof child === 'object') el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

// Removes everything inside an element.
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
