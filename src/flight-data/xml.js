// A small, strict XML reader for track files.
//
// V6 used the browser's DOMParser. This reader gives the same elements and text
// for the files V6 reads, and it runs the
// same in Node's test runner. It is deliberately strict and small:
// - It refuses a <!DOCTYPE>, so no entity can ever be defined or expanded
//   (billion-laughs, external files). Only &lt; &gt; &amp; &quot; &apos; and
//   numeric references are understood, as in any XML file without a DOCTYPE.
// - Like DOMParser, it refuses anything that isn't well-formed: mismatched or
//   unclosed tags, bare "&", unquoted attributes, undeclared namespace prefixes,
//   text outside the root element.
// - Nesting deeper than MAX_DEPTH is refused, so a hostile file can't exhaust
//   the stack.

export const MAX_DEPTH = 256;

/** A file that isn't well-formed XML. `line` is 1-based. */
export class XmlError extends Error {
  constructor(reason, line) {
    super(line ? `line ${line}: ${reason}` : reason);
    this.name = 'XmlError';
    this.reason = reason;
    this.line = line;
  }
}

const NAME = /[A-Za-z_:À-￿][-A-Za-z0-9_:.·À-￿]*/y;
const SPACE = /[ \t\r\n]+/y;
const BAD_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
const NAMED = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

class Element {
  constructor(name, attrs, parent) {
    this.name = name;
    this.attrs = attrs;
    this.parent = parent;
    this.children = []; // strings (text) and Elements, in order
  }

  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }

  /** All text inside this element, as DOM textContent gives it (comments excluded). */
  get textContent() {
    let out = '';
    for (const c of this.children) out += typeof c === 'string' ? c : c.textContent;
    return out;
  }

  /** Descendants with this exact qualified name (e.g. 'gx:coord'), in document order. */
  getElementsByTagName(name) {
    if (!this.byName) {
      // One walk indexes every descendant by name; a KML file is searched for
      // about twenty names, and the tree never changes after parsing.
      this.byName = new Map();
      const walk = el => {
        for (const c of el.children) {
          if (typeof c === 'string') continue;
          const list = this.byName.get(c.name);
          if (list) list.push(c);
          else this.byName.set(c.name, [c]);
          walk(c);
        }
      };
      walk(this);
    }
    return [...(this.byName.get(name) ?? [])];
  }
}

/**
 * Parses XML text into a tree of elements. The returned document behaves like a
 * DOM Document for getElementsByTagName, getAttribute and textContent.
 */
export function parseXml(text) {
  if (typeof text !== 'string') throw new XmlError('not text');
  const bad = BAD_CHAR.exec(text);
  if (bad) throw new XmlError('contains a character XML does not allow', lineAt(text, bad.index));

  text = text.replace(/\r\n?/g, '\n'); // XML line-end handling, as DOMParser does
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let i = start;
  const doc = new Element('#document', new Map(), null);
  let current = doc;
  let depth = 0;
  let rootSeen = false;
  const scopes = [new Set(['xml', 'xmlns'])]; // declared namespace prefixes per level

  const fail = (reason, at = i) => { throw new XmlError(reason, lineAt(text, at)); };

  const readName = () => {
    NAME.lastIndex = i;
    const m = NAME.exec(text);
    if (!m) fail('expected a name');
    i = NAME.lastIndex;
    return m[0];
  };
  const skipSpace = () => {
    SPACE.lastIndex = i;
    if (SPACE.exec(text)) { i = SPACE.lastIndex; return true; }
    return false;
  };
  const checkPrefix = (name, declared, at) => {
    const parts = name.split(':');
    if (parts.length > 2 || parts.some(p => p === '')) fail(`bad name "${name}"`, at);
    if (parts.length === 2 && !declared.has(parts[0])) fail(`namespace prefix "${parts[0]}" is not declared`, at);
  };

  while (i < text.length) {
    const lt = text.indexOf('<', i);
    const end = lt < 0 ? text.length : lt;
    if (end > i) {
      const chunk = text.slice(i, end);
      if (chunk.includes(']]>')) fail('"]]>" outside a CDATA section', i + chunk.indexOf(']]>'));
      if (current === doc) {
        if (/[^ \t\r\n]/.test(chunk)) fail(rootSeen ? 'text after the end of the document' : 'text before the first element');
      } else {
        current.children.push(decode(chunk, i));
      }
      i = end;
      continue;
    }

    if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      if (close < 0) fail('comment is never closed');
      if (text.slice(i + 4, close).includes('--') || text[close - 1] === '-') fail('"--" inside a comment');
      i = close + 3;
    } else if (text.startsWith('<![CDATA[', i)) {
      if (current === doc) fail('CDATA outside the root element');
      const close = text.indexOf(']]>', i + 9);
      if (close < 0) fail('CDATA section is never closed');
      current.children.push(text.slice(i + 9, close));
      i = close + 3;
    } else if (text.startsWith('<!', i)) {
      // <!DOCTYPE …> and anything else starting "<!": never needed in KML.
      fail(text.startsWith('<!DOCTYPE', i) ? 'DOCTYPE declarations are not accepted' : 'unexpected "<!"');
    } else if (text.startsWith('<?', i)) {
      const close = text.indexOf('?>', i + 2);
      if (close < 0) fail('processing instruction is never closed');
      const target = /^[^ \t\r\n?]*/.exec(text.slice(i + 2, close))[0];
      if (!target) fail('processing instruction has no name');
      if (target.toLowerCase() === 'xml' && (i !== start || target !== 'xml')) fail('XML declaration must come first');
      i = close + 2;
    } else if (text.startsWith('</', i)) {
      const at = i;
      i += 2;
      const name = readName();
      skipSpace();
      if (text[i] !== '>') fail(`expected ">" to close </${name}`);
      i++;
      if (current === doc) fail(`closing tag </${name}> has no opening tag`, at);
      if (current.name !== name) fail(`closing tag </${name}> does not match <${current.name}>`, at);
      current = current.parent;
      scopes.pop();
      depth--;
    } else {
      const at = i;
      i++;
      const name = readName();
      if (current === doc && rootSeen) fail('more than one root element', at);
      const attrs = new Map();
      for (;;) {
        const spaced = skipSpace();
        if (text[i] === '>' || text.startsWith('/>', i)) break;
        if (i >= text.length) fail(`tag <${name}> is never closed`, at);
        if (!spaced) fail(`expected a space before an attribute in <${name}>`);
        const attrAt = i;
        const attr = readName();
        skipSpace();
        if (text[i] !== '=') fail(`attribute "${attr}" has no value`);
        i++;
        skipSpace();
        const quote = text[i];
        if (quote !== '"' && quote !== "'") fail(`attribute "${attr}" value must be in quotes`);
        const close = text.indexOf(quote, i + 1);
        if (close < 0) fail(`attribute "${attr}" value is never closed`);
        const raw = text.slice(i + 1, close);
        if (raw.includes('<')) fail(`"<" inside attribute "${attr}"`);
        if (attrs.has(attr)) fail(`attribute "${attr}" appears twice`, attrAt);
        // Attribute values normalise whitespace characters to spaces, as XML requires.
        attrs.set(attr, decode(raw, i + 1).replace(/[\t\r\n]/g, ' '));
        i = close + 1;
      }
      const selfClosing = text.startsWith('/>', i);
      i += selfClosing ? 2 : 1;

      // A new set of prefixes only where this element declares one, so a file
      // with thousands of declarations doesn't copy them for every element.
      let declared = scopes[scopes.length - 1];
      for (const [a, v] of attrs) {
        if (a.startsWith('xmlns:')) {
          if (!v) fail(`namespace prefix "${a.slice(6)}" is declared empty`, at);
          if (declared === scopes[scopes.length - 1]) declared = new Set(declared);
          declared.add(a.slice(6));
        }
      }
      checkPrefix(name, declared, at);
      for (const a of attrs.keys()) if (a !== 'xmlns' && !a.startsWith('xmlns:')) checkPrefix(a, declared, at);

      const el = new Element(name, attrs, current);
      current.children.push(el);
      if (current === doc) rootSeen = true;
      if (!selfClosing) {
        if (++depth > MAX_DEPTH) fail(`elements nested more than ${MAX_DEPTH} deep`, at);
        current = el;
        scopes.push(declared);
      }
    }
  }
  if (current !== doc) fail(`tag <${current.name}> is never closed`);
  if (!rootSeen) fail('no root element');
  return doc;

  // Replaces entity references in text, stopping at the first bad one (a
  // global replace would find every "&" in a hostile file before failing).
  function decode(chunk, offset) {
    let amp = chunk.indexOf('&');
    if (amp < 0) return chunk;
    let out = '';
    let from = 0;
    while (amp >= 0) {
      const semi = chunk.indexOf(';', amp + 1);
      const nextAmp = chunk.indexOf('&', amp + 1);
      if (semi < 0 || (nextAmp >= 0 && nextAmp < semi)) fail('"&" must be written as &amp;', offset + amp);
      const ref = chunk.slice(amp + 1, semi);
      out += chunk.slice(from, amp) + entity(ref, offset + amp);
      from = semi + 1;
      amp = chunk.indexOf('&', from);
    }
    return out + chunk.slice(from);
  }

  function entity(ref, at) {
    if (Object.hasOwn(NAMED, ref)) return NAMED[ref];
    const m = /^#(?:x([0-9A-Fa-f]+)|([0-9]+))$/.exec(ref);
    if (!m) fail(`unknown entity &${ref};`, at);
    const code = m[1] ? parseInt(m[1], 16) : parseInt(m[2], 10);
    const ok = code === 0x9 || code === 0xa || code === 0xd
      || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff);
    if (!ok) fail(`character reference &${ref}; is not allowed`, at);
    return String.fromCodePoint(code);
  }
}

function lineAt(text, index) {
  let line = 1;
  for (let k = text.indexOf('\n'); k >= 0 && k < index; k = text.indexOf('\n', k + 1)) line++;
  return line;
}
