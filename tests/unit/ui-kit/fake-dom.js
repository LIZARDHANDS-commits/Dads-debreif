// Just enough of a DOM to test ui-kit helpers in Node.
class FakeNode {
  constructor(nodeName) {
    this.nodeName = nodeName;
    this.childNodes = [];
    this.parentNode = null;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  removeChild(node) {
    this.childNodes = this.childNodes.filter((n) => n !== node);
    node.parentNode = null;
    return node;
  }
  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }
}

class FakeText extends FakeNode {
  constructor(text) {
    super('#text');
    this.data = text;
  }
  get textContent() {
    return this.data;
  }
}

class FakeElement extends FakeNode {
  constructor(tag) {
    super(tag.toUpperCase());
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.hidden = false;
    const classes = new Set();
    this.classList = {
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    };
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  dispatch(type) {
    for (const fn of this.listeners[type] ?? []) fn({ type, target: this });
  }
}

export function installFakeDocument() {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text),
  };
  return globalThis.document;
}
