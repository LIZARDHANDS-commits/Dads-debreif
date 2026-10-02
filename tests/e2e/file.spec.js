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

// Browser tests for src/storage/file.js (SPEC-storage), on a test page that
// loads it straight from src/.
import { test, expect } from './fixtures.js';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { serveDist } from './static-server.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let site;
test.beforeAll(async () => {
  site = await serveDist({ dir: ROOT });
});
test.afterAll(async () => {
  await site.close();
});

async function open(page) {
  await page.goto(`${site.url}tests/e2e/pages/file.html`);
  await page.waitForFunction(() => window.__fileReady);
}

test('downloadText saves the text under a safe name', async ({ page }) => {
  await open(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#save').click()]);
  expect(download.suggestedFilename()).toBe('my-sortie.dadsdebrief.json');
  expect(await readFile(await download.path(), 'utf8')).toBe('{"hello":"é"}');
  await expect(page.locator('a[download]')).toHaveCount(0); // the link doesn't stay on the page
});

test('pickTextFiles reads the chosen files, and refuses one over the limit', async ({ page }) => {
  await open(page);
  let [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#open').click()]);
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([
    { name: 'a.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: Buffer.from('<kml/>') },
    { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from('{}') },
  ]);
  await expect(page.locator('#result')).toHaveText(
    JSON.stringify([
      { name: 'a.kml', size: 6, text: '<kml/>' },
      { name: 'b.json', size: 2, text: '{}' },
    ]),
  );
  await expect(page.locator('input[type=file]')).toHaveCount(0);

  [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#open').click()]);
  await chooser.setFiles([{ name: 'big.kml', mimeType: 'text/plain', buffer: Buffer.alloc(2048, 'x') }]);
  await expect(page.locator('#result')).toHaveText('big.kml is too big to open (2 kB; the limit is 1 kB).');
});
