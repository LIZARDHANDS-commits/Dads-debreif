import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { serviceWorker } from './tools/service-worker.mjs';

// The version shown in the footer and sent with bug reports: build date plus commit.
function appVersion() {
  const date = new Date().toISOString().slice(0, 10);
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

// Writes the version into index.html as <meta name="app-version">, so the source
// still runs as plain modules without Vite (it then reads as "dev").
function versionMeta() {
  const version = appVersion();
  return {
    name: 'app-version-meta',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'app-version', content: version }, injectTo: 'head' }],
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
  },
});
