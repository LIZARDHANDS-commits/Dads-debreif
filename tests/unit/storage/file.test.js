import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFileName, readTextFiles, FileTooBigError } from '../../../src/storage/file.js';

const file = (name, text) => new File([text], name);

test('safeFileName keeps ordinary names and strips paths and reserved characters', () => {
  assert.equal(safeFileName('2026-09-30 sortie.dadsdebrief.json'), '2026-09-30 sortie.dadsdebrief.json');
  assert.equal(safeFileName('../../etc/passwd'), '-..-etc-passwd');
  assert.equal(safeFileName('a:b*c?"d"<e>|f\u0000g'), 'a-b-c--d--e--f-g');
  assert.equal(safeFileName('.hidden'), 'hidden');
  assert.equal(safeFileName('   '), 'download.txt');
  assert.equal(safeFileName(null, 'setup.json'), 'setup.json');
  assert.equal(safeFileName('x'.repeat(300)).length, 120);
});

test('readTextFiles reads each file as text, in order', async () => {
  const got = await readTextFiles([file('a.kml', '<kml>é</kml>'), file('b.json', '{}')]);
  assert.deepEqual(got, [
    { name: 'a.kml', size: 13, text: '<kml>é</kml>' },
    { name: 'b.json', size: 2, text: '{}' },
  ]);
  assert.deepEqual(await readTextFiles([]), []);
});

test('readTextFiles refuses a file over the limit before reading any', async () => {
  let reads = 0;
  const counted = (name, text) => Object.assign(file(name, text), { text: async () => (reads++, text) });
  const big = counted('big.kml', 'x'.repeat(2 * 1024 * 1024));
  await assert.rejects(readTextFiles([counted('ok.kml', 'ok'), big], { maxBytes: 1024 * 1024 }), (err) => {
    assert.ok(err instanceof FileTooBigError);
    assert.equal(err.file, 'big.kml');
    assert.equal(err.message, 'big.kml is too big to open (2.0 MB; the limit is 1.0 MB).');
    return true;
  });
  assert.equal(reads, 0);
});
