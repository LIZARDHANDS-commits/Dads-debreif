// Checks: home is light (3 MB or less), card videos load only when shown and allowed, reduced motion loads none, and leaving home stops them.
// Serves: ALL-R9, ALL-R3.
// Expected values: design choice: the 3,000,000-byte home budget (the same number as tools/check-size.mjs); viewport sizes typed in.

// R5, R15, #41: the home screen is light, and card videos load only when shown and allowed.
import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

const loadedVideos = (page) => page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.dataset.loaded).map((v) => v.closest('.card').dataset.module));

// Short enough that only the first row of cards is on screen.
test.use({ viewport: { width: 1366, height: 500 } });

test('the home screen downloads 3 MB or less (R5)', async ({ page }) => {
  let bytes = 0;
  page.on('response', async (res) => {
    const body = await res.body().catch(() => null);
    if (body) bytes += body.length;
  });
  await openRoute(page, '#/');
  await page.waitForLoadState('networkidle');
  expect(bytes).toBeLessThanOrEqual(3_000_000);
});

test('only cards on screen load their videos, and they play', async ({ page }) => {
  await openRoute(page, '#/');
  await expect.poll(() => loadedVideos(page)).toEqual(['debrief', 'turn-sim', 'turn-fight']);
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-module="debrief"] video').paused)).toBe(false);
  await page.locator('[data-module="sof"]').scrollIntoViewIfNeeded();
  await expect.poll(() => loadedVideos(page)).toContain('sof');
});

test('with reduced motion no videos load, unless Settings turns them on (#41)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '#/');
  // Wait for what is on screen, not for a number of seconds: the cards' stills are showing, and the browser has
  // run two frames, by which time the visibility check (IntersectionObserver) has reported every card on screen.
  await expect(page.locator('.card-still').first()).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await loadedVideos(page)).toEqual([]);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Card videos').selectOption('full');
  await expect.poll(() => loadedVideos(page)).toEqual(['debrief', 'turn-sim', 'turn-fight']);
});

test('leaving home pauses the videos and stops watching them', async ({ page }) => {
  await openRoute(page, '#/');
  await expect.poll(() => loadedVideos(page)).not.toEqual([]);
  await page.evaluate(() => { location.hash = '#/about'; });
  await expect(page.locator('video')).toHaveCount(0);
});
