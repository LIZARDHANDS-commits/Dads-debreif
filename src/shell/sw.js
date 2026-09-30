// The service worker (D15, R6): keeps a copy of the app so it opens with the
// network off, and waits to be told before switching to a new version.
// `npm run build` copies this file to dist/sw.js and fills in BUILD_ID and
// PRECACHE (tools/service-worker.mjs). `npm run dev` doesn't use it.
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = '__PRECACHE__';

// Pages on the same site share cache storage, so names carry this app's scope.
const PREFIX = `ooda:${self.registration.scope}:`;
const CACHE = PREFIX + BUILD_ID;
const SCOPE = self.registration.scope;
const INDEX = new URL('index.html', SCOPE).href;
// Files kept the first time they're fetched rather than at install (the example
// flight and the debrief's VNC charts, tools/service-worker.mjs).
const ON_USE = ['examples/', 'media/debrief/'].map((p) => new URL(p, SCOPE).href);

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache, so the copy matches this build.
  const requests = PRECACHE.map((path) => new Request(path, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener('activate', (event) => {
  const oldCaches = caches
    .keys()
    .then((names) => Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n))));
  event.waitUntil(oldCaches.then(() => self.clients.claim()));
});

// Sent by the new-version bar's Reload button (src/shell/update-bar.js).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Other sites (live weather, maps) always go to the network and are never kept.
  if (url.origin !== self.location.origin) return;
  // Card videos stream in pieces (range requests); leave them to the browser.
  if (request.headers.has('range') || request.destination === 'video') return;
  // Opening the app itself gets the kept copy; any other page or file opened
  // directly (a PDF, a checklist) is looked up as itself.
  const page = url.origin + url.pathname;
  const lookup = request.mode === 'navigate' && (page === SCOPE || page === INDEX) ? INDEX : request;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(lookup, { ignoreSearch: true }))
      .then((hit) => hit ?? (ON_USE.some((p) => page.startsWith(p)) ? fetchAndKeep(request) : fetch(request))),
  );
});

async function fetchAndKeep(request) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}
