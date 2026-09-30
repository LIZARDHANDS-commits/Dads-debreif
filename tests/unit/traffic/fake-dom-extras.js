// The stand-in DOM from the ui-kit tests only reads text. The Traffic Sim's screen tests
// need a few more things a browser has: setting text, looking inside an element, moving
// focus, a style property, appending several children, ids, and starting values for
// boxes. They are added here once, for every traffic test file.
//
//   const document = installFakeDom();   // use in place of installFakeDocument()
//
// Safe when all the test files run in one process (--experimental-test-isolation=none):
// the additions are made once, and nothing in them keeps hold of a document. Focus is
// kept on whichever document is current (globalThis.document), so a test file that
// installs its own later doesn't change where focus goes.
import { installFakeDocument } from '../ui-kit/fake-dom.js';

let added = false;

function addExtras(sample) {
  const elementProto = Object.getPrototypeOf(sample);
  const nodeProto = Object.getPrototypeOf(elementProto);

  const readText = Object.getOwnPropertyDescriptor(nodeProto, 'textContent').get;
  Object.defineProperty(nodeProto, 'textContent', {
    configurable: true,
    get: readText,
    set(value) {
      this.childNodes = [];
      if (value !== '') this.appendChild(globalThis.document.createTextNode(value));
    },
  });

  Object.defineProperty(elementProto, 'id', {
    configurable: true,
    get() {
      return this.attributes.id;
    },
    set(value) {
      this.attributes.id = String(value);
    },
  });
  Object.defineProperty(elementProto, 'style', {
    configurable: true,
    get() {
      this.styleProps ??= {};
      return { setProperty: (name, value) => (this.styleProps[name] = value) };
    },
  });

  elementProto.append = function append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  };
  elementProto.contains = function contains(node) {
    return node === this || this.childNodes.some((child) => child.contains?.(node));
  };
  elementProto.focus = function focus() {
    globalThis.document.activeElement = this;
  };
  elementProto.removeAttribute = function removeAttribute(name) {
    delete this.attributes[name];
  };
  // A browser runs the capture listeners on the target first, in the order they were added, then the others.
  // (The ui-kit stand-in runs the last-added capture listener first, which matters when two of them meet.)
  elementProto.addEventListener = function addEventListener(type, fn, capture = false) {
    const list = (this.listeners[type] ??= []);
    const captures = (this.captureCounts ??= {});
    if (capture) list.splice(captures[type] ?? 0, 0, fn), (captures[type] = (captures[type] ?? 0) + 1);
    else list.push(fn);
  };
  elementProto.removeEventListener = function removeEventListener(type, fn) {
    const list = this.listeners[type] ?? [];
    const at = list.indexOf(fn);
    if (at >= 0 && at < (this.captureCounts?.[type] ?? 0)) this.captureCounts[type]--;
    this.listeners[type] = list.filter((f) => f !== fn);
  };
  // A fresh input or select starts with an empty value, unchecked and enabled.
  elementProto.value = '';
  elementProto.checked = false;
  elementProto.disabled = false;
}

/** Installs the fake document with the extras, and returns it. Calling it again is harmless. */
export function installFakeDom() {
  const document = installFakeDocument();
  if (!added) {
    added = true;
    addExtras(document.createElement('div'));
  }
  return document;
}
