// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

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
