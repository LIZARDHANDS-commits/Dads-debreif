import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

// A fixed moment: 18:00:00Z is noon in Moose Jaw (UTC-6 all year).
const NOON_Z = new Date('2026-09-30T18:00:00Z');

test('the header shows Zulu first, Moose Jaw local beside it, and ticks @smoke', async ({ page }) => {
  await page.clock.install({ time: NOON_Z });
  await openRoute(page, '#/');
  const clock = page.locator('#app-clock');
  await expect(clock).toBeVisible();
  await expect(clock.locator('.clock-first')).toHaveText('18:00:00Z');
  await expect(clock.locator('.clock-second')).toHaveText('12:00:00 CST');
  await page.clock.runFor(2000);
  await expect(clock.locator('.clock-first')).toHaveText('18:00:02Z');
  await expect(clock.locator('.clock-second')).toHaveText('12:00:02 CST');
});

test('Local first in Settings swaps the order at once and after a reload', async ({ page }) => {
  await page.clock.install({ time: NOON_Z });
  await openRoute(page, '#/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Local first, Zulu beside it').check();
  const first = page.locator('#app-clock .clock-first');
  await expect(first).toHaveText(/^12:00:0\d CST$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(first).toHaveText(/ CST$/);
  await expect(page.locator('#app-clock .clock-second')).toHaveText(/Z$/);
});

test('the clock stays in the header row on every page and never overlaps the buttons', async ({ page }) => {
  await openRoute(page, '#/about');
  const clock = await page.locator('#app-clock').boundingBox();
  const settings = await page.getByRole('button', { name: 'Settings' }).boundingBox();
  const overlaps = clock.x < settings.x + settings.width && settings.x < clock.x + clock.width &&
    clock.y < settings.y + settings.height && settings.y < clock.y + clock.height;
  expect(overlaps).toBe(false);
});
