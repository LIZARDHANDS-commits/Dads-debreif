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
  if (moduleIds.includes(id)) return { name: 'module', id };
  return { name: 'not-found', path };
}

export function hrefFor(route) {
  if (route.name === 'about') return '#/about';
  if (route.name === 'module') return `#/${route.id}`;
  return '#/';
}

/**
 * What a route opens, and the note to show above it: a module that is not
 * built yet (`load: null`) opens home with "<title> is coming soon.", and an
 * unknown path opens home with a "no page" note.
 * @template {{ title: string }} P
 * @param {{ name: string, id?: string, path?: string }} route from parseRoute
 * @param {{ home: P, about: P }} pages
 * @param {(id: string) => P & { load?: unknown }} findModule
 * @returns {{ entry: P, note: string | null }}
 */
export function pageFor(route, pages, findModule) {
  if (route.name === 'about') return { entry: pages.about, note: null };
  if (route.name === 'not-found') return { entry: pages.home, note: `There's no page at "${route.path}". Here's the home screen.` };
  if (route.name === 'module') {
    const mod = findModule(String(route.id));
    if (isBuilt(mod)) return { entry: mod, note: null };
    return { entry: pages.home, note: `${mod.title} is coming soon.` };
  }
  return { entry: pages.home, note: null };
}
