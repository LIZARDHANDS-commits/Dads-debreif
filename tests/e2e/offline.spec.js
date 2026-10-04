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

// R6, D15: after one visit the app opens with the network off, and a newly
// published version shows the "new version" bar instead of switching silently.
import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';
import { serveDist } from './static-server.js';

// These tests are about the service worker, so it is allowed here (the config blocks it).
// Keep them to home, About and the debrief, and out of @smoke: in WebKit a worker's
// outside requests get past the fixtures' stubs, so a screen with live data must not open here.
test.use({ serviceWorkers: 'allow' });

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
  // The heading carries a version badge (ALL-R27), so it is checked to contain the name, not to equal it (ALL-R3).
  await expect(page.getByRole('heading', { level: 1 })).toContainText("DAD's OODA LOOP");
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
  expect(text.length).toBe(2741913); // Dad's recorded track as shipped, un-gzipped: checks the file is not damaged
  expect(await keptExamples(page)).toEqual([`examples/${asset}.gz`]);

  await context.setOffline(true);
  expect(await page.evaluate((a) => window.__ooda.exampleText(a), asset)).toBe(text);
  await context.setOffline(false);
});

test('the debrief\'s VNC charts download only when shown, and then work offline', async ({ page, context }) => {
  const charts = [];
  page.on('request', (req) => req.url().includes('/media/debrief/') && charts.push(req.url()));
  await visitThenGoOffline(page, context);
  expect(charts).toEqual([]); // not part of the first visit
  await context.setOffline(false);
  const size = (file) => page.evaluate(async (f) => (await (await fetch(f)).arrayBuffer()).byteLength, file);
  const bytes = await size('media/debrief/vnc-south.webp');
  expect(bytes).toBe(2815862);
  expect(await keptExamples(page, 'media/debrief/')).toEqual(['media/debrief/vnc-south.webp']);
  await context.setOffline(true);
  expect(await size('media/debrief/vnc-south.webp')).toBe(bytes);
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

// The files in `folder` (examples/ unless given) the service worker has kept, relative to the site.
async function keptExamples(page, folder = 'examples/') {
  return page.evaluate(async (dir) => {
    const found = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) {
        const path = new URL(req.url).pathname;
        if (path.includes(`/${dir}`)) found.push(path.slice(path.indexOf(dir)));
      }
    }
    return found;
  }, folder);
}
