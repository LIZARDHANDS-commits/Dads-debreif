import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

test('home lists the Debrief Viewer, the Turn Sim, the Traffic Sim, SOF and Turn Fight as PROTOTYPEs, no module as coming soon, and About @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  await expect(page).toHaveTitle("DAD's OODA LOOP");
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("DAD's OODA LOOP");
  const cards = page.locator('.card');
  await expect(cards).toHaveCount(6);
  await expect(page.locator('.card.is-planned')).toHaveCount(0); // every module now opens
  await expect(page.locator('a.card[href="#/debrief"]')).toBeVisible();
  const turnSim = page.locator('a.card[href="#/turn-sim"]');
  await expect(turnSim).toBeVisible();
  await expect(turnSim.locator('.badge-prototype')).toHaveText('PROTOTYPE'); // D135
  await expect(page.locator('a.card[href="#/sof"] .badge-prototype')).toHaveText('PROTOTYPE');
  await expect(page.locator('a.card[href="#/traffic"] .badge-prototype')).toHaveText('PROTOTYPE');
  await expect(page.locator('a.card[href="#/turn-fight"] .badge-prototype')).toHaveText('PROTOTYPE');
  await expect(page.locator('a.card[href="#/debrief"] .badge-prototype')).toHaveCount(0);
  await expect(page.locator('.card.is-planned a, a.card.is-planned')).toHaveCount(0); // not clickable (R3)
  await expect(page.getByText('PT-PT', { exact: false })).toHaveCount(0); // R19
  await expect(page.getByText('Briefing Board', { exact: false })).toHaveCount(0);
});

test('About opens from its card and links back home @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  await page.locator('a.card-about').click();
  await expect(page).toHaveURL(/#\/about$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Dad');
  await page.getByRole('link', { name: '← Home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("DAD's OODA LOOP");
});

// Every registry entry now has a load (Turn Fight and the Traffic Sim were the last two), so no
// route shows the "is coming soon" notice any more; src/app.js keeps that path for future modules.

test('addresses match without regard to case, and a not-found note keeps what was typed (AF-4)', async ({ page }) => {
  await openRoute(page, '#/About');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Dad');
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
  expect(url.searchParams.get('page')).toBe('About Dad');
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
