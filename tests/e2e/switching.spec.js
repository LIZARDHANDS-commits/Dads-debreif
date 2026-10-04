// Checks: after visiting every page and coming home nothing keeps running; Tab, the skip link and focus on opening a page work; still pictures set motion to zero.
// Serves: ALL-R12, ALL-R11.
// Expected values: design choice: the page compares its own counts (listeners, frames, timers) before and after, so it can fail; other values typed in.

// R4: after visiting every page, nothing from the pages you left keeps running.
import { test, expect } from './fixtures.js';
import { ROUTES, openRoute } from './routes.js';

test('visiting every page and coming home leaves nothing running @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  const fresh = await page.evaluate(() => window.__ooda.stats());
  for (const route of ROUTES) {
    await page.evaluate((hash) => { location.hash = hash; }, route);
    await page.waitForFunction(() => window.__ooda.stats().mounted);
  }
  await page.evaluate(() => { location.hash = '#/about'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'about');
  const onAbout = await page.evaluate(() => window.__ooda.stats());
  expect(onAbout).toEqual({ mounted: 'about', listeners: 0, subscriptions: 0, frames: 0, timers: fresh.timers });
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  expect(await page.evaluate(() => window.__ooda.stats())).toEqual(fresh);
});

test('Tab moves between controls instead of hiding panels (#35)', async ({ page }) => {
  await openRoute(page, '#/');
  const visibleBefore = await page.locator('main :visible').count();
  const focused = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    focused.push(await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20)));
  }
  expect(new Set(focused).size).toBeGreaterThan(3);
  expect(await page.locator('main :visible').count()).toBe(visibleBefore);
});

test('the skip link moves focus to the page without changing it @smoke', async ({ page }) => {
  await openRoute(page, '#/about');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/about$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Dad');
  await expect(page.locator('#route-notice')).toBeHidden();
  await expect(page.locator('#view')).toBeFocused();
});

test('opening a page starts at its top, with focus on the new page', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 600 });
  await openRoute(page, '#/');
  const about = page.locator('a.card-about');
  await about.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await about.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Dad');
  await expect(page.locator('#view')).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.closest('#view') !== null)).toBe(true);
});

test('choosing still pictures turns transitions off too', async ({ page }) => {
  await openRoute(page, '#/');
  const duration = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-duration')));
  expect(await duration()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Card videos').selectOption('reduced');
  expect(await duration()).toBe(0);
});
