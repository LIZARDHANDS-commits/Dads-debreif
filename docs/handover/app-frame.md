# App frame (shell, ui-kit, CI)

Home screen and routes (`src/shell/`), shared controls (`src/ui-kit/`), storage, CI and deploy.

- Spec: `specs/SPEC-shell.md`, `specs/SPEC-ui-kit.md`, `specs/SPEC-storage.md`. Tasks: `tasks/app-frame/`. Checklist: `docs/checklists/shell.md`.
- Done through #239 (Chrome on every PR; Firefox and WebKit on a manual run).

## Left

- Combined sign-off at the end: full e2e in Chrome, Firefox and Safari, then remove `prototype: true` from each module in `src/shell/registry.js`.
- Content Security Policy once all outside hosts are final (list in HANDOVER.md).
- Dependabot #162 (Playwright bump) open; merge only on a green run.

## Shared APIs modules use

- `createSettingsMenu` (`src/ui-kit/settings-menu.js`): one closed "<Module> settings" menu per screen.
- `viewSwitch` and the three.js helpers (`three-aircraft.js`, `ct156-model.js`, Harvard paint by default): the 2D/3D switch. three loads only in 3D.
- uPlot: `await import('uplot')` inside modules, with a text readout beside each graph.
- `app.airfields`, `app.time` (Zulu first, local beside), `app.standards`.

## Tips

- Once two modules share a chunk, Vite leaves modulepreload links: tests looking for leftovers should check stylesheets only.
- Playwright reuses a server on port 4173 locally; stop stray `vite preview` servers first.
