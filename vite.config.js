import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { serviceWorker } from './tools/service-worker.mjs';
import { TRAFFIC_VERSION } from './src/modules/traffic/version.js';

// The version sent with bug reports and shown in the footer's tooltip: build date plus commit.
function appVersion(built) {
  const date = built.slice(0, 10);
  // The checked-out commit first: in the Pages deploy, GITHUB_SHA is main's latest
  // commit, which can be newer than the one CI passed and that is being built.
  let commit;
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    commit = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local';
  }
  return `${date} ${commit}`;
}

// Writes the version and build time into index.html as <meta name="app-version">
// and <meta name="app-built">, and stamps the header's .version-badge from
// src/modules/traffic/version.js so PRs only ever need to update version.js.
function versionMeta() {
  const built = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const version = appVersion(built);
  return {
    name: 'app-version-meta',
    transformIndexHtml: (html) => ({
      html: html.replace(
        /<span class="version-badge">[^<]*<\/span>/,
        `<span class="version-badge">${TRAFFIC_VERSION}</span>`,
      ),
      tags: [
        { tag: 'meta', attrs: { name: 'app-version', content: version }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'app-built', content: built }, injectTo: 'head' },
      ],
    }),
  };
}

export default defineConfig({
  base: './', // relative paths, so the site works under /Dads-debreif/ on GitHub Pages
  plugins: [versionMeta(), serviceWorker()],
  optimizeDeps: { entries: ['index.html'] }, // don't scan original/shell.html
  build: {
    outDir: 'dist',
    manifest: true, // read by tools/check-size.mjs
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html' } },
  },
  // The browser tests run on `vite preview`. Its CORS answer adds "Vary: Origin",
  // which GitHub Pages doesn't send; with it, the service worker's kept copy of the
  // main script never matches (that request carries an Origin header), so the
  // offline tests would test a server the app is never published on.
  preview: { cors: false },
});
