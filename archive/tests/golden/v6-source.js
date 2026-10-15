// Loads V6's own functions, unchanged, from original/shell.html so golden tests
// can run them side by side with the ported code in src/core/ (R9).
//
// V6 embeds the SOF Dashboard and the Traffic Pattern Sim as base64 pages; they
// are decoded the same way tools/extract_subapps.py does, so line numbers match.
import { readFileSync } from 'node:fs';

const SHELL = readFileSync(new URL('../../original/shell.html', import.meta.url), 'utf8');

const SUBAPPS = {
  sof: /window\.__SOF_DOC__=new TextDecoder\("utf-8"\)\.decode\(Uint8Array\.from\(atob\("([A-Za-z0-9+/=]+)"/,
  traffic: /const TRAFFIC_SRCDOC=new TextDecoder\(\)\.decode\(Uint8Array\.from\(atob\('([A-Za-z0-9+/=]+)'/,
};

const cache = new Map();

/** The text of one V6 page: 'shell' (main page), 'sof' or 'traffic'. */
export function v6Page(page = 'shell') {
  if (page === 'shell') return SHELL;
  if (!cache.has(page)) {
    const match = SHELL.match(SUBAPPS[page]);
    if (!match) throw new Error(`embedded ${page} page not found in original/shell.html`);
    cache.set(page, Buffer.from(match[1], 'base64').toString('utf8'));
  }
  return cache.get(page);
}

/**
 * Exact source text of `function name(...) {...}`, by brace matching.
 * Some names occur more than once in V6 (draw, loop …), so `marker` picks the
 * first occurrence after a given piece of text.
 */
export function v6FunctionText(name, { page = 'shell', marker } = {}) {
  const src = v6Page(page);
  const start = marker ? src.indexOf(marker) : 0;
  if (start < 0) throw new Error(`marker not found in ${page}: ${marker}`);
  const i = src.indexOf('function ' + name + '(', start);
  if (i < 0) throw new Error(`function not found in ${page}: ${name}`);
  const from = src.startsWith('async ', i - 6) ? i - 6 : i;
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(from, k + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/**
 * Evaluates V6 functions together in one scope and returns them by name.
 * `prelude` supplies the globals they read (constants, stubs), as V6 source text;
 * `expose` names prelude helpers to return too (to set or read those globals).
 */
export function loadV6(names, { page = 'shell', marker, prelude = '', expose = [] } = {}) {
  const body = names.map(n => v6FunctionText(n, { page, marker })).join('\n');
  return new Function(`${prelude}\n${body}\nreturn { ${[...names, ...expose].join(', ')} };`)();
}

/** A numeric constant as V6 declares it, e.g. `FT_PER_NM=6076.12`. */
export function v6Number(name, { page = 'shell', marker } = {}) {
  const src = v6Page(page);
  const start = marker ? src.indexOf(marker) : 0;
  if (start < 0) throw new Error(`marker not found in ${page}: ${marker}`);
  const re = new RegExp(`\\b${name}\\s*=\\s*(-?[0-9.]+)`, 'g');
  re.lastIndex = start;
  const m = re.exec(src);
  if (!m) throw new Error(`constant not found in ${page}: ${name}`);
  return Number(m[1]);
}
