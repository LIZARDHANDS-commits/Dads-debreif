// The service worker (D15, R6): keeps a copy of the app so it opens with the
// network off, and waits to be told before switching to a new version.
// `npm run build` copies this file to dist/sw.js and fills in BUILD_ID and
// PRECACHE (tools/service-worker.mjs). `npm run dev` doesn't use it.
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = '__PRECACHE__';

// Pages on the same site share cache storage, so names carry this app's scope.
const PREFIX = `ooda:${self.registration.scope}:`;
const CACHE = PREFIX + BUILD_ID;
const INDEX = new URL('index.html', self.registration.scope).href;

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
  // Other sites (live weather, maps) always go to the network and are never kept.
  if (new URL(request.url).origin !== self.location.origin) return;
  const lookup = request.mode === 'navigate' ? INDEX : request;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(lookup, { ignoreSearch: true }))
      .then((hit) => hit ?? fetch(request)),
  );
});
