// Checks: the "leave?" question in a real browser: nothing unsaved asks nothing; Cancel keeps the page and address; OK leaves; Back asks too.
// Serves: ALL-R12, ALL-R17.
// Expected values: design choice: the behaviour of app.canLeave (SPEC-shell) and the question wording typed in the test page.

// The leave check (SPEC-shell, module contract: app.canLeave) in a real browser:
// host.js and router.js watchAddress wired as src/app.js wires them (one call), on a test page
// that loads them straight from src/.
import { test, expect } from './fixtures.js';
import { fileURLToPath } from 'node:url';
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
  await page.goto(`${site.url}tests/e2e/pages/leave.html#/keeper`);
  await expect(page.locator('#view')).toHaveText('Keeper');
}

test('with nothing to lose, switching pages asks nothing', async ({ page }) => {
  await open(page);
  const asked = [];
  page.on('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.evaluate(() => { location.hash = '#/other'; });
  await expect(page.locator('#view')).toHaveText('Other');
  expect(asked).toEqual([]);
});

test('with something to lose, Cancel keeps the page and puts the address back; OK leaves', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__leave.unsaved = true; });
  const asked = [];

  page.once('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await page.evaluate(() => { location.hash = '#/other'; });
  await expect.poll(() => asked).toEqual(['Leave without the radar pictures?']);
  await expect(page).toHaveURL(/#\/keeper$/);
  await expect(page.locator('#view')).toHaveText('Keeper');
  expect(await page.evaluate(() => window.__leave.shown)).toEqual(['#/keeper']);

  page.once('dialog', (d) => { asked.push(d.message()); d.accept(); });
  await page.evaluate(() => { location.hash = '#/other'; });
  await expect(page.locator('#view')).toHaveText('Other');
  await expect(page).toHaveURL(/#\/other$/);
  expect(asked).toHaveLength(2);
});

test('after Cancel, history is as it was: one Back still leaves the page', async ({ page }) => {
  await page.goto(`${site.url}tests/e2e/pages/leave.html#/other`);
  await page.evaluate(() => { location.hash = '#/keeper'; });
  await expect(page.locator('#view')).toHaveText('Keeper');
  await page.evaluate(() => { window.__leave.unsaved = true; });
  page.once('dialog', (d) => d.dismiss());
  await page.evaluate(() => { location.hash = '#/other'; });
  await expect(page).toHaveURL(/#\/keeper$/);
  await expect(page.locator('#view')).toHaveText('Keeper');

  await page.evaluate(() => { window.__leave.unsaved = false; });
  await page.goBack();
  await expect(page).toHaveURL(/#\/other$/);
  await expect(page.locator('#view')).toHaveText('Other');
});

test('the browser Back button asks too, and Cancel stays on the page', async ({ page }) => {
  await page.goto(`${site.url}tests/e2e/pages/leave.html#/other`);
  await expect(page.locator('#view')).toHaveText('Other');
  await page.evaluate(() => { location.hash = '#/keeper'; });
  await expect(page.locator('#view')).toHaveText('Keeper');
  await page.evaluate(() => { window.__leave.unsaved = true; });

  const asked = [];
  page.once('dialog', (d) => { asked.push(d.message()); d.dismiss(); });
  await page.goBack();
  await expect.poll(() => asked).toHaveLength(1);
  await expect(page).toHaveURL(/#\/keeper$/);
  await expect(page.locator('#view')).toHaveText('Keeper');
});
