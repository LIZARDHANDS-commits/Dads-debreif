// Builds dist/sw.js from src/shell/sw.js: fills in the list of files to keep
// for offline use and a build id that changes whenever any of them changes.
// Used by vite.config.js after every production build.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const WORKER_SOURCE = new URL('../src/shell/sw.js', import.meta.url);
export const WORKER_FILE = 'sw.js';

// Card videos stay online-only: a still picture shows in their place offline,
// and keeping them would add about 2 MB to everyone's first visit. The example
// flight's files (examples/) and the debrief's VNC charts (media/debrief/) are
// kept only once someone opens them (src/shell/sw.js), so they don't add
// 0.7 MB and 5.4 MB to every first visit either.
const SKIP = [/^\.vite\//, /^sw\.js$/, /\.map$/, /\.(webm|mp4)$/, /^examples\//, /^media\/debrief\//];

export function precacheList(files) {
  return files
    .filter((file) => !SKIP.some((re) => re.test(file)))
    .sort()
    .map((file) => `./${file}`);
}

export function buildId(entries) {
  const hash = createHash('sha256');
  for (const { path, content } of [...entries].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    hash.update(path).update('\0').update(content).update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function renderWorker(source, { id, precache }) {
  const tokens = { "'__BUILD_ID__'": JSON.stringify(id), "'__PRECACHE__'": JSON.stringify(precache, null, 2) };
  let out = source;
  for (const [token, value] of Object.entries(tokens)) {
    if (!out.includes(token)) throw new Error(`service worker source is missing ${token}`);
    out = out.replace(token, value);
  }
  return out;
}

function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

export function writeWorker(distDir) {
  const precache = precacheList(listFiles(distDir));
  const id = buildId(precache.map((path) => ({ path, content: readFileSync(join(distDir, path)) })));
  writeFileSync(join(distDir, WORKER_FILE), renderWorker(readFileSync(WORKER_SOURCE, 'utf8'), { id, precache }));
  return { id, precache };
}

// Vite plugin: runs once the build has written every file, public/ included.
export function serviceWorker() {
  let outDir;
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const { id, precache } = writeWorker(outDir);
      console.log(`Service worker: build ${id}, ${precache.length} files kept for offline use`);
    },
  };
}
