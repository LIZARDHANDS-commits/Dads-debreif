// Checks: the offline-copy builder: which files are kept, the build id changing only when a kept file changes, and
//   the worker template filled in.
// Serves: ALL-R14, ALL-R27.
// Expected values: typed-in file lists and fake folders; the 12 hex character build id is a design choice; one test
//   builds the real worker source.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { precacheList, buildId, renderWorker, writeWorker } from '../../../tools/service-worker.mjs';

test('the offline copy keeps the app and stills, but not card videos, build notes, the example flight or the VNC charts (kept on first use)', () => {
  const files = [
    'index.html',
    'assets/index-abc.js',
    'assets/index-abc.js.map',
    '.vite/manifest.json',
    'sw.js',
    'media/cards/sof.jpg',
    'media/cards/sof.webm',
    'media/cards/sof.mp4',
    'manifest.webmanifest',
    'examples/585aab2601b787ed.kml.gz',
    'media/debrief/vnc-south.webp',
  ];
  assert.deepEqual(precacheList(files), [
    './assets/index-abc.js',
    './index.html',
    './manifest.webmanifest',
    './media/cards/sof.jpg',
  ]);
});

test('the build id changes when any kept file changes, and only then', () => {
  const a = [
    { path: './index.html', content: 'one' },
    { path: './app.js', content: 'two' },
  ];
  assert.equal(buildId(a), buildId([...a].reverse()));
  assert.notEqual(buildId(a), buildId([a[0], { path: './app.js', content: 'two!' }]));
  assert.notEqual(buildId(a), buildId([a[0], { path: './app2.js', content: 'two' }]));
  assert.match(buildId(a), /^[0-9a-f]{12}$/);
});

test('the worker gets its build id and file list filled in', () => {
  const source = "const BUILD_ID = '__BUILD_ID__';\nconst PRECACHE = '__PRECACHE__';\n";
  const out = renderWorker(source, { id: 'abc123', precache: ['./index.html'] });
  assert.match(out, /const BUILD_ID = "abc123";/);
  assert.match(out, /const PRECACHE = \[\n  ".\/index.html"\n\];/);
  assert.throws(() => renderWorker('nothing to fill', { id: 'x', precache: [] }), /missing '__BUILD_ID__'/);
});

test('the real worker source has both placeholders and builds into a dist folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  const first = writeWorker(dir);
  assert.deepEqual(first.precache, ['./assets/app.js', './index.html']);
  const worker = readFileSync(join(dir, 'sw.js'), 'utf8');
  assert.ok(worker.includes(`"${first.id}"`));
  assert.ok(!worker.includes('__PRECACHE__'));
  // Building again (sw.js now present) gives the same id: sw.js isn't in its own list.
  assert.equal(writeWorker(dir).id, first.id);
});
