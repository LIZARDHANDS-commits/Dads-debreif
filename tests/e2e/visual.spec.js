// Screenshot comparison (D142): catches a change that moves or covers something
// by accident. Chromium only, at 1440 x 900. The reference pictures live in
// tests/e2e/__screenshots__/visual.spec.js/ and change only in a PR that means
// to change the look (see specs/SPEC-shell.md, Screenshots).
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

// Same instant as clock.spec.js: 18:00:00Z is noon in Moose Jaw.
const NOON_Z = new Date('2026-09-30T18:00:00Z');

// Fonts: the app asks for system-ui, which is whatever the machine has. Pin the
// two families Playwright's own Linux dependencies always install, so a
// developer machine and CI draw the same letters.
const FONTS = ":root { --font: 'Liberation Sans', Arial, sans-serif; --font-mono: 'Liberation Mono', monospace; }";

test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce', // card videos stay still pictures (see media.spec.js)
  colorScheme: 'light',
});

// A plain slate-blue pixel, stretched by the map to stand in for every satellite tile.
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMwdgkFAAF6AM0Ec3WuAAAAAElFTkSuQmCC', 'base64');

test.beforeEach(async ({ page, browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'Reference pictures are made in Chromium only.');
  test.skip(process.platform !== 'linux', 'Reference pictures are made on Linux, as CI runs.');
  // Nothing outside the preview server: tiles get a plain square, everything
  // else (weather, feeds) an empty answer, so no live data reaches a picture.
  const own = new URL(baseURL).origin;
  await page.route((url) => url.origin !== own, (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === 'services.arcgisonline.com') return route.fulfill({ status: 200, contentType: 'image/png', body: TILE });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.clock.install({ time: new Date(NOON_Z.getTime() - 1000) });
  await page.clock.pauseAt(NOON_Z);
});

// Waits for fonts and every image, then compares. The footer's build time
// changes with every build, so it is masked.
async function shot(page, name) {
  await page.addStyleTag({ content: FONTS });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((done) => { img.onload = img.onerror = done; }))));
  });
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('#app-updated')],
  });
}

test('home', async ({ page }) => {
  await openRoute(page, '#/');
  await expect(page.locator('.card-still').first()).toBeVisible();
  await shot(page, 'home.png');
});

test('about', async ({ page }) => {
  await openRoute(page, '#/about');
  await shot(page, 'about.png');
});

test('settings dialog', async ({ page }) => {
  await openRoute(page, '#/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await shot(page, 'settings.png');
});

test('debrief, nothing loaded', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await expect(page.getByText('Load up to four track files, or the example flight, to start.')).toBeVisible();
  await shot(page, 'debrief-empty.png');
});

test('debrief, example flight', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await page.getByRole('button', { name: 'Example flight' }).click();
  await expect(page.locator('.flight-status')).toHaveText(/^4 tracks loaded/, { timeout: 20_000 });
  await page.clock.runFor(1000); // the frozen clock also holds back the map's animation frames
  await shot(page, 'debrief-example.png');
});

// The SOF with the recorded reports sof.spec.js uses, at the time they were
// written for (1842Z, 29 September 2026), so every card, age and state is fixed.
const sofFixture = (name) => readFileSync(new URL(`../fixtures/sof/${name}`, import.meta.url), 'utf8');
const SOF_NOW = new Date('2026-09-29T18:42:00Z');
const CORS = { 'access-control-allow-origin': '*' };

test('sof, recorded weather', async ({ page }) => {
  // These routes come after beforeEach's catch-all, so they win for the two weather sources.
  await page.route(/^https:\/\/api\.met\.no\//, (route) => route.fulfill({
    status: 200,
    contentType: 'text/plain',
    headers: CORS,
    body: sofFixture(route.request().url().includes('/taf?') ? 'screen-metno-taf.txt' : 'screen-metno-metar.txt'),
  }));
  await page.route(/^https:\/\/datamask\.org\//, (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: sofFixture('screen-datamask-not-found.json'),
  }));
  await page.clock.setFixedTime(SOF_NOW);
  await openRoute(page, '#/sof');
  await expect(page.locator('.sof-feed')).toHaveText('Weather just now ✓');
  await expect(page.locator('article.sof-card')).toHaveCount(4);
  await shot(page, 'sof.png');
});

test('turn fight', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await expect(page.locator('.tf-play')).toBeVisible();
  // The clock is paused, so let the views draw their first frame.
  const drawn = () => page.locator('canvas.tf-topdown').evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 150) lit += 1;
    return lit;
  });
  await page.waitForFunction(() => document.querySelector('canvas.tf-topdown').width > 1);
  await page.clock.runFor(100);
  await expect.poll(drawn).toBeGreaterThan(100);
  await shot(page, 'turn-fight.png');
});
