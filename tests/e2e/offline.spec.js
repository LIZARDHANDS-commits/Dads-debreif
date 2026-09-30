// R6, D15: after one visit the app opens with the network off, and a newly
// published version shows the "new version" bar instead of switching silently.
import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';
import { serveDist } from './static-server.js';

// Waits until the service worker has kept its copy and controls the page.
async function waitForOfflineCopy(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
  });
}

test('after one visit, home and About open with the network off', async ({ page, context }) => {
  await openRoute(page, '#/');
  await waitForOfflineCopy(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("DAD's OODA LOOP");
  await expect(page.locator('.card')).toHaveCount(6);
  await page.locator('a.card-about').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Dad');
  const photo = page.locator('.about-photo img');
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await context.setOffline(false);
});

test('a newly published version shows the bar, and Reload switches to it', async ({ page }) => {
  // Stand-in for publishing a new build: the same worker with a different build id.
  let published = false;
  const site = await serveDist({
    rewrite: (path, body) =>
      path === '/sw.js' && published ? body.replace(/const BUILD_ID = "([0-9a-f]+)";/, 'const BUILD_ID = "$1-new";') : body,
  });
  try {
    await page.goto(site.url);
    await page.waitForFunction(() => window.__ooda?.stats().mounted);
    await waitForOfflineCopy(page);
    const bar = page.locator('.update-bar');
    await expect(bar).toBeHidden();
    expect(await cacheNames(page)).toEqual([expect.not.stringMatching(/-new$/)]);

    published = true;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('A new version is ready.');

    await Promise.all([page.waitForEvent('load'), bar.getByRole('button', { name: 'Reload' }).click()]);
    await page.waitForFunction(() => window.__ooda?.stats().mounted);
    await expect(page.locator('.update-bar')).toBeHidden();
    expect(await cacheNames(page)).toEqual([expect.stringMatching(/-new$/)]); // the old copy is gone
  } finally {
    await site.close();
  }
});

async function cacheNames(page) {
  return page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('ooda:')));
}
