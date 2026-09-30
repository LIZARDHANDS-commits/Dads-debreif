// Browser tests for ui-kit controls.js and canvas-view.js (SPEC-ui-kit), on a
// test page that loads them straight from src/.
import { test, expect } from './fixtures.js';
import { fileURLToPath } from 'node:url';
import { serveDist } from './static-server.js';

// The repository, so the test page can load src/ as plain modules.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let site;
test.beforeAll(async () => {
  site = await serveDist({ dir: ROOT });
});
test.afterAll(async () => {
  await site.close();
});

async function open(page) {
  await page.goto(`${site.url}tests/e2e/pages/ui-kit.html`);
  await page.waitForFunction(() => window.__kit);
}
const setting = (page, key) => page.evaluate((k) => window.__kit.settings.get()[k], key);
const idle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

test.describe('controls', () => {
  test('a good number goes straight to its setting', async ({ page }) => {
    await open(page);
    const box = page.getByLabel('Safety bubble');
    await expect(box).toHaveValue('1000');
    await box.fill('1500');
    expect(await setting(page, 'bubbleFt')).toBe(1500);
    await expect(box).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('a bad number is refused with a message, and the setting keeps its last good value @smoke', async ({ page }) => {
    await open(page);
    const box = page.getByLabel('Safety bubble');
    for (const bad of ['99999', '5', '', '1e400']) {
      await box.fill(bad);
      await box.press('Enter');
      await expect(box, bad).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText('Enter a number from 100 to 5,000 ft.')).toBeVisible();
      expect(await setting(page, 'bubbleFt'), bad).toBe(1000);
    }
    await box.fill('250');
    await expect(box).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Enter a number from 100 to 5,000 ft.')).toBeHidden();
    expect(await setting(page, 'bubbleFt')).toBe(250);
  });

  test('slider, checkbox, select and choice update their settings', async ({ page }) => {
    await open(page);
    const slider = page.getByLabel('Chart opacity');
    await slider.focus();
    await slider.press('ArrowRight');
    expect(await setting(page, 'opacity')).toBeCloseTo(0.55);
    await expect(page.locator('output')).toHaveText('55%');

    await page.getByLabel('5,000 ft grid').uncheck();
    expect(await setting(page, 'grid')).toBe(false);

    await page.getByLabel('Trail').selectOption({ label: 'Full' });
    expect(await setting(page, 'trail')).toBe(0); // the option's own value, still a number

    await page.getByLabel('3D').check();
    expect(await setting(page, 'view')).toBe('3d');
  });

  test('controls follow the setting when something else changes it', async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__kit.settings.update({ bubbleFt: 3000, grid: false, trail: 0, view: '3d', opacity: 1 }));
    await expect(page.getByLabel('Safety bubble')).toHaveValue('3000');
    await expect(page.getByLabel('5,000 ft grid')).not.toBeChecked();
    await expect(page.getByLabel('Trail')).toHaveValue('0');
    await expect(page.getByLabel('3D')).toBeChecked();
    await expect(page.locator('output')).toHaveText('100%');
  });

  test('after dispose, controls stop following the setting', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      window.__kit.controls.dispose();
      window.__kit.settings.update({ bubbleFt: 3000 });
    });
    await expect(page.getByLabel('Safety bubble')).toHaveValue('1000');
  });
});

test.describe('canvas view', () => {
  test('dragging pans, and the world point follows the mouse @smoke', async ({ page }) => {
    await open(page);
    const box = await page.locator('#map').boundingBox();
    const start = [box.x + 300, box.y + 200];
    const before = await page.evaluate(() => window.__kit.view.screenToWorld(300, 200));
    await page.mouse.move(...start);
    await page.mouse.down();
    await page.mouse.move(start[0] + 100, start[1] + 50, { steps: 5 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__kit.view.screenToWorld(400, 250));
    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
    expect(await page.evaluate(() => window.__kit.userMoves())).toBeGreaterThan(0);
  });

  test('the wheel zooms about the pointer, within the span limits @smoke', async ({ page }) => {
    await open(page);
    const box = await page.locator('#map').boundingBox();
    await page.mouse.move(box.x + 450, box.y + 120);
    const before = await page.evaluate(() => window.__kit.view.screenToWorld(450, 120));
    const scale0 = await page.evaluate(() => window.__kit.view.view.scale);
    await page.mouse.wheel(0, -200);
    await expect.poll(() => page.evaluate(() => window.__kit.view.view.scale)).toBeGreaterThan(scale0);
    const after = await page.evaluate(() => window.__kit.view.screenToWorld(450, 120));
    expect(after[0]).toBeCloseTo(before[0], 3);
    expect(after[1]).toBeCloseTo(before[1], 3);
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -2000);
    await expect.poll(() => page.evaluate(() => { const v = window.__kit.view; return v.size.width / v.view.scale; })).toBeCloseTo(500, 6);
  });

  test('with the view focused, arrow keys pan and + and - zoom', async ({ page }) => {
    await open(page);
    const map = page.getByRole('img', { name: 'Test map' });
    await map.focus();
    const v0 = await page.evaluate(() => window.__kit.view.view);
    await page.keyboard.press('ArrowRight');
    const v1 = await page.evaluate(() => window.__kit.view.view);
    expect(v1.cx).toBeGreaterThan(v0.cx);
    await page.keyboard.press('ArrowUp');
    expect((await page.evaluate(() => window.__kit.view.view)).cy).toBeGreaterThan(v1.cy);
    await page.keyboard.press('+');
    expect((await page.evaluate(() => window.__kit.view.view)).scale).toBeCloseTo(v0.scale * 1.25, 9);
    await page.keyboard.press('-');
    expect((await page.evaluate(() => window.__kit.view.view)).scale).toBeCloseTo(v0.scale, 9);
  });

  test('a still view draws once and then uses no animation frames (#43)', async ({ page }) => {
    await open(page);
    await idle(page);
    const drawn = await page.evaluate(() => window.__kit.draws());
    expect(drawn).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__kit.stats().frames)).toBe(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__kit.draws())).toBe(drawn);
    // Several requests in one frame draw once.
    await page.evaluate(() => { const v = window.__kit.view; v.requestDraw(); v.requestDraw(); v.setCenter(10, 10); });
    await idle(page);
    expect(await page.evaluate(() => window.__kit.draws())).toBe(drawn + 1);
  });

  test('after dispose, the view stops listening and drawing', async ({ page }) => {
    await open(page);
    await idle(page);
    await page.evaluate(() => window.__kit.view.dispose());
    const before = await page.evaluate(() => ({ view: window.__kit.view.view, draws: window.__kit.draws() }));
    const box = await page.locator('#map').boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.up();
    await page.mouse.wheel(0, -500);
    await page.evaluate(() => window.__kit.view.requestDraw());
    await idle(page);
    expect(await page.evaluate(() => ({ view: window.__kit.view.view, draws: window.__kit.draws() }))).toEqual(before);
    expect(await page.evaluate(() => window.__kit.stats().frames)).toBe(0);
  });
});

test.describe('canvas view on a high-density screen', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the canvas is sharp on a high-density screen and follows its box size', async ({ page }) => {
    await open(page);
    const ratio = await page.evaluate(() => devicePixelRatio);
    expect(ratio).toBe(2);
    await page.evaluate(() => { document.getElementById('stage').style.width = '500px'; });
    const cssWidth = await page.evaluate(() => document.getElementById('map').clientWidth);
    expect(cssWidth).toBeLessThan(600);
    await expect.poll(() => page.evaluate(() => window.__kit.view.size.width)).toBe(cssWidth);
    expect(await page.evaluate(() => document.getElementById('map').width)).toBe(Math.round(cssWidth * ratio));
  });
});
