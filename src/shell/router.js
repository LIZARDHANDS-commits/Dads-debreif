// Hash routes: #/ (home), #/about, #/<module-id>. Anything else is "not found".
// Ids match without regard to case, so #/SOF from an email opens the SOF (AF-4).
// Hash routes work on GitHub Pages and from a plain file server.
// See specs/SPEC-shell.md.

import { isBuilt } from './registry.js';

export function parseRoute(hash, moduleIds) {
  const path = String(hash ?? '')
    .replace(/^#/, '')
    .split('?')[0]
    .replace(/^\/+|\/+$/g, '');
  const id = path.toLowerCase();
  if (id === '') return { name: 'home' };
  if (id === 'about') return { name: 'about' };
  if (id === 'about-alternate') return { name: 'about-alternate' };
  if (moduleIds.includes(id)) return { name: 'module', id };
  return { name: 'not-found', path };
}

export function hrefFor(route) {
  if (route.name === 'about') return '#/about';
  if (route.name === 'about-alternate') return '#/about-alternate';
  if (route.name === 'module') return `#/${route.id}`;
  return '#/';
}

/**
 * What a route opens, and the note to show above it: a module that is not
 * built yet (`load: null`) opens home with "<title> is coming soon.", and an
 * unknown path opens home with a "no page" note.
 * @template {{ title: string }} P
 * @param {{ name: string, id?: string, path?: string }} route from parseRoute
 * @param {{ home: P, about: P, aboutAlternate?: P }} pages
 * @param {(id: string) => P & { load?: unknown }} findModule
 * @returns {{ entry: P, note: string | null }}
 */
export function pageFor(route, pages, findModule) {
  if (route.name === 'about') return { entry: pages.about, note: null };
  if (route.name === 'about-alternate') return { entry: pages.aboutAlternate ?? pages.about, note: null };
  if (route.name === 'not-found') return { entry: pages.home, note: `There's no page at "${route.path}". Here's the home screen.` };
  if (route.name === 'module') {
    const mod = findModule(String(route.id));
    if (isBuilt(mod)) return { entry: mod, note: null };
    return { entry: pages.home, note: `${mod.title} is coming soon.` };
  }
  return { entry: pages.home, note: null };
}

/**
 * Watches the address (hashchange) and shows each new page with `go(hash)`.
 * Before another page replaces the open module it may ask (app.canLeave):
 * `question()` returns the question or null. If the person says no, nothing
 * changes and history is put back as it was: a new entry (a link) is stepped
 * back over, and Back or Forward is undone by the same number of steps, using
 * an index this keeps in history.state. Returns a function that stops watching.
 * @param {{ win: any, question: () => string | null, go: (hash: string) => void }} deps
 */
export function watchAddress({ win, question, go }) {
  const hist = win.history;
  const KEY = 'shellIndex';
  const indexOf = () => (Number.isInteger(hist.state?.[KEY]) ? hist.state[KEY] : null);
  const stamp = (i) => hist.replaceState({ ...(hist.state ?? {}), [KEY]: i }, '');
  let shownHash = win.location.hash;
  let shownIndex = indexOf() ?? 0;
  stamp(shownIndex);
  const onChange = () => {
    const hash = win.location.hash;
    if (hash === shownHash) return; // back where we are, e.g. after an undo below
    const index = indexOf();
    const text = question();
    if (text && !win.confirm(text)) {
      const steps = index === null ? 1 : index - shownIndex;
      if (steps) hist.go(-steps);
      else hist.replaceState(hist.state, '', shownHash || `${win.location.pathname}${win.location.search}`);
      return;
    }
    shownIndex = index ?? shownIndex + 1;
    if (index === null) stamp(shownIndex);
    shownHash = hash;
    go(hash);
  };
  win.addEventListener('hashchange', onChange);
  return () => win.removeEventListener('hashchange', onChange);
}
