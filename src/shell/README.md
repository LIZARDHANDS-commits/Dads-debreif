# shell

The home screen and the frame around every module (spec: `specs/SPEC-shell.md`).

- `registry.js`: the list of module cards. **When a module is built,** set its `load` to `() => import('../modules/<id>/index.js')` and its card becomes clickable.
- `router.js`: turns the address (`#/`, `#/about`, `#/<module-id>`) into a page.
- `host.js`: opens one module at a time and cleans up everything it started when it closes.
- `home.js`, `about.js`: the home screen and About page. **To change About's text,** edit `about.js`.
- `header.js`: the header clock and `app.time`. Local time is Moose Jaw's (`HOME_ZONE`, America/Regina) until the airfield list arrives; the formatting itself is in `src/core/time.js`.
- `settings-dialog.js`: the Settings dialog. Shared settings and their defaults are in `src/app.js`.
- `report.js`: the Report a problem link; the form itself is `.github/ISSUE_TEMPLATE/problem.yml`.
- `update-bar.js`: registers the service worker and shows the "A new version is ready" bar.
- `sw.js`: the service worker, which keeps a copy of the app for offline use. `npm run build` fills in its file list (`tools/service-worker.mjs`); `npm run dev` never uses it. To check offline mode, run `npm run build && npm run preview`.
- `shell.css`: layout for all of the above.

Card videos and stills live in `public/media/cards/` and are made from V6's originals by `python3 tools/make_card_media.py`.

The app icons in `public/icons/` are drawn by `node tools/make_icons.mjs`; `public/manifest.webmanifest` names them for installing.

## The service worker: updates and rollback

- Every build that changes any kept file (including `index.html`, which carries the version) gives the worker a new build id. Open copies then show "A new version is ready" within the hour, even for a docs-only change.
- To roll back a bad release, revert the commit on `main`; the reverted build is simply the next new version.
- To retire the service worker entirely, don't just delete it: browsers would keep serving the last copy. Publish this as `sw.js` instead for a few weeks, then remove it:

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(`ooda:${self.registration.scope}:`)) await caches.delete(name);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
```
