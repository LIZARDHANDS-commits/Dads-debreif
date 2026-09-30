// Hash routes: #/ (home), #/about, #/<module-id>. Anything else is "not found".
// Ids match without regard to case, so #/SOF from an email opens the SOF (AF-4).
// Hash routes work on GitHub Pages and from a plain file server.
// See specs/SPEC-shell.md.

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
