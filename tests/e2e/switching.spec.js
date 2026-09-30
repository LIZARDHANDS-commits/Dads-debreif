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
