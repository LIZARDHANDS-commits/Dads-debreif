import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homeFiles, measure, check, HOME_CODE_BUDGET_BYTES, CARD_MEDIA_BUDGET_BYTES } from '../../../tools/check-size.mjs';

const tempDirs = [];
after(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function fakeDist({ mediaBytes = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, '.vite'));
  mkdirSync(join(dir, 'assets'));
  const manifest = {
    'index.html': { file: 'assets/index.js', isEntry: true, css: ['assets/index.css'], imports: ['_shared.js'], dynamicImports: ['src/modules/debrief/index.js'] },
    '_shared.js': { file: 'assets/shared.js' },
    'src/modules/debrief/index.js': { file: 'assets/debrief.js', isDynamicEntry: true },
  };
  writeFileSync(join(dir, '.vite', 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'index.html'), 'x'.repeat(100));
  writeFileSync(join(dir, 'assets', 'index.js'), 'x'.repeat(200));
  writeFileSync(join(dir, 'assets', 'index.css'), 'x'.repeat(50));
  writeFileSync(join(dir, 'assets', 'shared.js'), 'x'.repeat(25));
  writeFileSync(join(dir, 'assets', 'debrief.js'), 'x'.repeat(10_000));
  if (mediaBytes) {
    mkdirSync(join(dir, 'media', 'cards'), { recursive: true });
    writeFileSync(join(dir, 'media', 'cards', 'debrief.webm'), Buffer.alloc(mediaBytes));
    writeFileSync(join(dir, 'media', 'cards', 'debrief.mp4'), Buffer.alloc(mediaBytes - 1)); // fallback: only the larger counts
    writeFileSync(join(dir, 'media', 'cards', 'sof.mp4'), Buffer.alloc(100));
    writeFileSync(join(dir, 'media', 'cards', 'debrief.jpg'), Buffer.alloc(1000)); // stills don't count as video
  }
  return dir;
}

test('home files follow static imports and styles but not modules loaded on demand', () => {
  const files = homeFiles(fakeDist()).sort();
  assert.deepEqual(files, ['assets/index.css', 'assets/index.js', 'assets/shared.js', 'index.html']);
});

test('measure adds up home files, card stills and card videos', () => {
  const result = measure(fakeDist({ mediaBytes: 4321 }));
  assert.equal(result.homeBytes, 100 + 200 + 50 + 25 + 1000); // the still counts toward the home screen
  assert.equal(result.mediaBytes, 4321 + 100);
  assert.deepEqual(check(result), []);
});

test('check reports each budget that is exceeded', () => {
  const problems = check({ homeBytes: HOME_CODE_BUDGET_BYTES + 1, mediaBytes: CARD_MEDIA_BUDGET_BYTES + 1 });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /R5/);
  assert.match(problems[1], /R15/);
});
