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

// One online visit, then the network goes off. Card videos stay off until
// then: a video still downloading when the network drops logs a browser error
// that has nothing to do with what these tests check.
async function visitThenGoOffline(page, context) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '#/');
  await waitForOfflineCopy(page);
  await context.setOffline(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

test('after one visit, home and About open with the network off', async ({ page, context }) => {
  await visitThenGoOffline(page, context);
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

test('offline, the home cards show their stills and fetch no videos', async ({ page, context }) => {
  await visitThenGoOffline(page, context);
  const failed = [];
  page.on('requestfailed', (req) => failed.push(req.url()));
  await page.reload();
  await expect(page.locator('.card')).toHaveCount(6);
  // Give the cards' visibility checks a few frames to run.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
  await expect(page.locator('.card-video.is-playing')).toHaveCount(0);
  await expect(page.locator('.card-video source')).toHaveCount(0);
  expect(failed).toEqual([]);
  await context.setOffline(false);
});

test('the example flight downloads only when asked, and then works offline', async ({ page, context }) => {
  const examples = [];
  page.on('request', (req) => req.url().includes('/examples/') && examples.push(req.url()));
  await visitThenGoOffline(page, context);
  expect(examples).toEqual([]); // not part of the first visit
  expect(await keptExamples(page)).toEqual([]);
  await context.setOffline(false);

  const asset = '585aab2601b787ed.kml';
  const text = await page.evaluate((a) => window.__ooda.exampleText(a), asset);
  expect(text.startsWith('<?xml')).toBe(true);
  expect(text.length).toBe(2741913); // V6's file, un-gzipped
  expect(await keptExamples(page)).toEqual([`examples/${asset}.gz`]);

  await context.setOffline(true);
  expect(await page.evaluate((a) => window.__ooda.exampleText(a), asset)).toBe(text);
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

// The example files the service worker has kept, relative to the site.
async function keptExamples(page) {
  return page.evaluate(async () => {
    const found = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) {
        const path = new URL(req.url).pathname;
        if (path.includes('/examples/')) found.push(path.slice(path.indexOf('examples/')));
      }
    }
    return found;
  });
}
