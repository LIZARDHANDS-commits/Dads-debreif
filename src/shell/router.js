// Hash routes: #/ (home), #/about, #/<module-id>. Anything else is "not found".
// Hash routes work on GitHub Pages and from a plain file server.
// See specs/SPEC-shell.md.

export function parseRoute(hash, moduleIds) {
  const path = String(hash ?? '')
    .replace(/^#/, '')
    .split('?')[0]
    .replace(/^\/+|\/+$/g, '');
  if (path === '') return { name: 'home' };
  if (path === 'about') return { name: 'about' };
  if (moduleIds.includes(path)) return { name: 'module', id: path };
  return { name: 'not-found', path };
}

export function hrefFor(route) {
  if (route.name === 'about') return '#/about';
  if (route.name === 'module') return `#/${route.id}`;
  return '#/';
}
