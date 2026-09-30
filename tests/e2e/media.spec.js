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
  await page.waitForTimeout(500);
  expect(await loadedVideos(page)).toEqual([]);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Card videos').selectOption('on');
  await expect.poll(() => loadedVideos(page)).toEqual(['debrief', 'turn-sim', 'turn-fight']);
});

test('leaving home pauses the videos and stops watching them', async ({ page }) => {
  await openRoute(page, '#/');
  await expect.poll(() => loadedVideos(page)).not.toEqual([]);
  await page.evaluate(() => { location.hash = '#/about'; });
  await expect(page.locator('video')).toHaveCount(0);
});
