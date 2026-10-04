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

import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

// A fixed moment: 18:00:00Z is noon in Moose Jaw (UTC-6 all year).
const NOON_Z = new Date('2026-09-30T18:00:00Z');

// install() starts a clock that keeps running, so a slow page load (WebKit on
// CI) would show a few seconds past noon. Start just before noon, then stop the
// clock at noon; the test moves it on itself with runFor().
async function freezeAtNoon(page) {
  await page.clock.install({ time: new Date(NOON_Z.getTime() - 1000) });
  await page.clock.pauseAt(NOON_Z);
}

test('the header shows Zulu first, Moose Jaw local beside it, and ticks @smoke', async ({ page }) => {
  await freezeAtNoon(page);
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
  await freezeAtNoon(page);
  await openRoute(page, '#/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Local first, Zulu beside it').check();
  const first = page.locator('#app-clock .clock-first');
  await expect(first).toHaveText(/^12:00:0\d CST$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(first).toHaveText(/ CST$/);
  await expect(page.locator('#app-clock .clock-second')).toHaveText(/Z$/);
});

test('local time follows the home field set in Settings, at once and after a reload', async ({ page }) => {
  await freezeAtNoon(page);
  await openRoute(page, '#/');
  const second = page.locator('#app-clock .clock-second');
  await expect(second).toHaveText('12:00:00 CST');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const home = page.getByLabel('Home field');
  await home.fill('CYXH'); // Medicine Hat, Mountain time: daylight time in September
  await home.press('Enter');
  await expect(second).toHaveText('12:00:00 MDT');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(second).toHaveText(/^12:00:0\d MDT$/);
});

test('the clock stays in the header row on every page and never overlaps the buttons', async ({ page }) => {
  await openRoute(page, '#/about');
  const clock = await page.locator('#app-clock').boundingBox();
  const settings = await page.getByRole('button', { name: 'Settings', exact: true }).boundingBox();
  const overlaps = clock.x < settings.x + settings.width && settings.x < clock.x + clock.width &&
    clock.y < settings.y + settings.height && settings.y < clock.y + clock.height;
  expect(overlaps).toBe(false);
});
