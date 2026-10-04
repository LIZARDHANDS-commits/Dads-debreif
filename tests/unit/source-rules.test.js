// Checks: house rules over every file in src/: no !important, no setInterval, timers and frames only through the
//   scheduler, three.js only loaded on demand, storage only through the store, no raw HTML.
// Serves: ALL-R12, ALL-R9, ALL-R17.
// Expected values: design choice: the house rules in SPEC.md (Code style) and specs/SPEC-ui-kit.md; a scan of the
//   source files.

// House rules for everything in src/ (SPEC.md "Code style", specs/SPEC-ui-kit.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = join(ROOT, 'src');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : /\.(js|css)$/.test(d.name) ? [join(dir, d.name)] : [],
  );
}

const sources = [...files(SRC), join(ROOT, 'index.html')].map((path) => ({
  path: relative(ROOT, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

function offenders(pattern, allowed = () => false) {
  return sources.filter((f) => !allowed(f.path) && pattern.test(f.text)).map((f) => f.path);
}

test('no !important anywhere', () => {
  assert.deepEqual(offenders(/!important/), []);
});

test('no setInterval anywhere, and animation frames only in the scheduler', () => {
  assert.deepEqual(offenders(/\bsetInterval\s*\(/), []);
  assert.deepEqual(offenders(/\brequestAnimationFrame\b/, (p) => p === 'src/ui-kit/scheduler.js'), []);
});

test('three is never imported statically (it loads with import(), only inside 3D views)', () => {
  // Catches `import x from 'three'`, `export * from 'three'` and 'three/addons/...'; import('three') is allowed.
  assert.deepEqual(offenders(/^\s*(import|export)\b[^(]*from\s*['"]three(\/[^'"]*)?['"]/m), []);
  assert.deepEqual(offenders(/^\s*import\s*['"]three(\/[^'"]*)?['"]/m), []);
});

test('only storage/ touches localStorage', () => {
  assert.deepEqual(offenders(/\blocalStorage\b/, (p) => p.startsWith('src/storage/')), []);
});

test('no innerHTML: text goes in through h() or textContent', () => {
  assert.deepEqual(offenders(/\.innerHTML\s*=|insertAdjacentHTML/), []);
});
