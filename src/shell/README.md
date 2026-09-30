# shell

The home screen and the frame around every module (spec: `specs/SPEC-shell.md`).

- `registry.js`: the list of module cards. **When a module is built,** set its `load` to `() => import('../modules/<id>/index.js')` and its card becomes clickable.
- `router.js`: turns the address (`#/`, `#/about`, `#/<module-id>`) into a page.
- `host.js`: opens one module at a time and cleans up everything it started when it closes.
- `home.js`, `about.js`: the home screen and About page. **To change About's text,** edit `about.js`.
- `settings-dialog.js`: the Settings dialog. Shared settings and their defaults are in `src/app.js`.
- `report.js`: the Report a problem link; the form itself is `.github/ISSUE_TEMPLATE/problem.yml`.
- `shell.css`: layout for all of the above.

Card videos and stills live in `public/media/cards/` and are made from V6's originals by `python3 tools/make_card_media.py`.
