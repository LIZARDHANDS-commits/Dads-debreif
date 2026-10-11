// Checks: home lists every module and each card opens, About links home, addresses work in any letter case, the footer shows the version, and Settings survive a reload.
// Serves: ALL-R1, ALL-R3, ALL-R4, ALL-R18.
// Expected values: design choice: routes and the report link address typed in from the app; no card count or badge wording.

import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

test('home shows a card for every module, none planned @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  // The heading carries a version badge (ALL-R27), so it is checked to contain the name, not to equal it (ALL-R3).
  await expect(page.getByRole('heading', { level: 1 })).toContainText("OODA LOOP");
  for (const route of ['#/debrief', '#/turn-sim', '#/traffic', '#/sof', '#/turn-fight']) {
    await expect(page.locator(`a.card[href="${route}"]`)).toBeVisible();
  }
  await expect(page.locator('.card.is-planned a, a.card.is-planned')).toHaveCount(0); // every module opens (R3)
});

test('About opens from its card and links back home @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  await page.locator('a.card-about').click();
  await expect(page).toHaveURL(/#\/about$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Us');
  await page.getByRole('link', { name: '← Home' }).click();
  // The heading carries a version badge (ALL-R27), so it is checked to contain the name, not to equal it (ALL-R3).
  await expect(page.getByRole('heading', { level: 1 })).toContainText("OODA LOOP");
});

// Every registry entry now has a load (Turn Fight and the Traffic Sim were the last two), so no
// route shows the "is coming soon" notice any more; src/app.js keeps that path for future modules.

test('addresses match without regard to case, and a not-found note keeps what was typed (AF-4)', async ({ page }) => {
  await openRoute(page, '#/About');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Us');
  await openRoute(page, '#/PTPT');
  await expect(page.locator('#route-notice')).toContainText('no page at "PTPT"');
});

test('an unknown address says so and shows home', async ({ page }) => {
  await openRoute(page, '#/ptpt');
  await expect(page.locator('#route-notice')).toContainText('no page at "ptpt"');
});

test('the footer says when this copy was published, and Report a problem carries the version @smoke', async ({ page }) => {
  await openRoute(page, '#/about');
  const version = await page.locator('meta[name="app-version"]').getAttribute('content');
  expect(version).toMatch(/^\d{4}-\d{2}-\d{2} \S+$/);
  const built = await page.locator('meta[name="app-built"]').getAttribute('content');
  expect(built.slice(0, 10)).toBe(version.slice(0, 10));
  const footer = page.locator('#app-updated');
  await expect(footer).toHaveText(/^Updated \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}Z$/);
  await expect(footer).toHaveAttribute('title', `Version ${version}`);
  const href = await page.locator('#report-problem').getAttribute('href');
  const url = new URL(href);
  expect(url.pathname).toBe('/LIZARDHANDS-commits/Dads-debreif/issues/new');
  expect(url.searchParams.get('page')).toBe('About Us');
  expect(url.searchParams.get('version')).toBe(version);
});

test('Settings changes the time order and it survives a reload @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Local first, Zulu beside it').check();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Local first, Zulu beside it')).toBeChecked();
  await expect(page.locator('#settings-storage-note')).toBeHidden();
});
