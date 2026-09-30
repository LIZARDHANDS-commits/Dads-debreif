// Browser tests for the Traffic Pattern Sim (SPEC-traffic: Testing strategy). Every test
// fails on a console error (fixtures.js, R7). Most run on a test page that mounts the sim
// on the real shell host, straight from src/ (pages/traffic.html), so they don't wait for
// the sim's entry in src/shell/registry.js. The tests that go through the route are skipped
// until that entry lands.
import { test, expect } from './fixtures.js';
import { fileURLToPath } from 'node:url';
import { serveDist } from './static-server.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let site;
test.beforeAll(async () => {
  site = await serveDist({ dir: ROOT });
});
test.afterAll(async () => {
  await site.close();
});

async function open(page) {
  await page.goto(`${site.url}tests/e2e/pages/traffic.html`);
  await page.waitForFunction(() => window.__trReady);
  // The first fit waits for the stylesheet and the map's real size, then draws.
  await expect.poll(() => pixelsDrawn(page)).toBeGreaterThan(50);
}

const map = (page) => page.locator('canvas.traffic-map');
const playButton = (page) => page.locator('.bar-play');
const clock = (page) => page.locator('.bar-clock');
const status = (page) => page.locator('.bar-status');
const button = (page, name) => page.getByRole('button', { name, exact: true });

// How many map pixels are not the plain background, to see that something is drawn.
function pixelsDrawn(page) {
  return map(page).evaluate((el) => {
    const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 2] > 200 && data[i] < 120) n++; // the blue pattern line
    return n;
  });
}

const picture = (page) => map(page).evaluate((el) => el.toDataURL());
// "0:00:12" as seconds.
const seconds = async (page) => {
  const [h, m, s] = (await clock(page).textContent()).replace('Sim time', '').trim().split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

test('opens paused at 0:00:00 with the Moose Jaw traffic ready, and one line saying what to do', async ({ page }) => {
  await open(page);
  await expect(status(page)).toHaveText('Paused');
  await expect(clock(page)).toContainText('0:00:00');
  await expect(page.getByText('Press Play to watch the Moose Jaw traffic.')).toBeVisible();
  // First look (R22): no route selected, so only the routes list on the left; the settings menu is closed.
  await expect(page.locator('[data-route-id]')).toHaveCount(9);
  await expect(page.locator('.point-table-section')).toBeHidden();
  await expect(page.getByRole('button', { name: /^Traffic settings/ })).toHaveAttribute('aria-expanded', 'false');
});

test('Play flies the traffic, Pause holds it, Reset goes back to 0:00:00', async ({ page }) => {
  await open(page);
  const start = await picture(page);
  await playButton(page).click();
  await expect(status(page)).toHaveText('Running');
  await expect.poll(() => seconds(page)).toBeGreaterThan(30); // the first aircraft starts at 0:12
  await expect(page.getByText('Press Play to watch the Moose Jaw traffic.')).toBeHidden();
  expect(await picture(page)).not.toBe(start);
  await playButton(page).click();
  await expect(status(page)).toHaveText('Paused');
  const held = await seconds(page);
  await page.waitForTimeout(300);
  expect(await seconds(page)).toBe(held);
  await button(page, 'Reset').click();
  await expect(clock(page)).toContainText('0:00:00');
  await expect(page.getByText('Press Play to watch the Moose Jaw traffic.')).toBeVisible();
});

test('Space plays and pauses, Home resets, and neither works while typing in a box', async ({ page }) => {
  await open(page);
  await page.locator('.traffic-map-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Running');
  await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Paused');
  await page.keyboard.press('Home');
  await expect(clock(page)).toContainText('0:00:00');
  await page.getByRole('button', { name: /^Traffic settings/ }).click();
  await page.getByLabel('Conflict: lateral').focus();
  await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Paused');
});

test('speed changes how fast the clock runs', async ({ page }) => {
  await open(page);
  await page.locator('.bar-speed select').selectOption('1');
  await playButton(page).click();
  await page.waitForTimeout(1500);
  await playButton(page).click();
  const slow = await seconds(page);
  expect(slow).toBeLessThanOrEqual(3);
  await button(page, 'Reset').click();
  await page.locator('.bar-speed select').selectOption('8');
  await playButton(page).click();
  await page.waitForTimeout(1500);
  await playButton(page).click();
  expect(await seconds(page)).toBeGreaterThan(slow * 3);
});

test('a bigger conflict bubble redraws the map, and the layers menu switches trails off', async ({ page }) => {
  await open(page);
  // Aircraft start at 0:12 and later, so let some fly first.
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(30);
  await playButton(page).click();
  const before = await picture(page);
  await page.getByRole('button', { name: /^Traffic settings/ }).click();
  await page.getByLabel('Conflict: lateral').fill('1500');
  await expect.poll(() => picture(page)).not.toBe(before);
  await page.getByRole('button', { name: /^Layers/ }).click();
  await expect(page.getByLabel('Trails')).toBeChecked();
  await page.getByLabel('Trails').uncheck();
  await expect(page.getByLabel('Trails')).not.toBeChecked();
});

test('closing the sim stops its frames, timers and listeners', async ({ page }) => {
  await open(page);
  await playButton(page).click();
  await expect.poll(() => page.evaluate(() => window.__tr.stats().frames)).toBeGreaterThan(0);
  await page.evaluate(() => window.__tr.close());
  const stats = await page.evaluate(() => window.__tr.stats());
  expect(stats).toMatchObject({ mounted: null, frames: 0, listeners: 0, subscriptions: 0 });
});

test('nothing overlaps or sticks out at 1366 x 768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  const problems = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('a[href], button, input, select, textarea, canvas')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    });
    const out = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width) out.push('the page scrolls sideways');
    const name = (el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
    const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (const { el, r } of boxes) if (r.left < 0 || r.right > width + 0.5) out.push(`${name(el)} is cut off at the side`);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const hgt = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 1 && hgt > 1) out.push(`${name(a.el)} overlaps ${name(b.el)}`);
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
});
