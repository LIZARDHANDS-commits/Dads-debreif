// Checks: every CT-156 model file the app ships is exactly the file its 3d-work delivery checked, and nothing else
//   sits beside them, so the models on screen are always a checked delivery, never a copy made by hand.
// Serves: ALL-38 (2) (the app takes only finished, checked model files, each with a delivery sheet); plan Step 3b
//   item 3.4.
// Expected values: the sizes and SHA-256 fingerprints written on the delivery's own sheet
//   (public/models/ct156/delivery.json), made by the delivery command in 3d-work; nothing from the app's code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = new URL('../../../public/models/ct156/', import.meta.url);

test('every CT-156 model file matches its delivery sheet, and no other file is there', () => {
  const sheet = JSON.parse(readFileSync(new URL('delivery.json', DIR), 'utf8'));
  assert.ok(!sheet.draft && !sheet.refused, `delivery ${sheet.name} is a draft or failed its checks`);
  const listed = new Set(sheet.files.map((f) => f.path));
  for (const f of sheet.files) {
    const p = new URL(f.path, DIR);
    assert.ok(existsSync(p), `${f.path} is on the sheet but missing`);
    assert.equal(statSync(p).size, f.bytes, `${f.path}: size`);
    assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'), f.sha256, `${f.path} is not the delivered file`);
  }
  for (const level of ['high', 'performance']) {
    for (const f of readdirSync(join(fileURLToPath(DIR), level))) assert.ok(listed.has(`${level}/${f}`), `${level}/${f} is not from the delivery`);
  }
});
