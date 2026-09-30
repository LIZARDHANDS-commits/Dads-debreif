// Browser tests for the Debrief Viewer (SPEC-debrief: Testing strategy).
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

const fixture = (name) => readFileSync(new URL(`../fixtures/flight-data/${name}`, import.meta.url));
const kml = (name, file = 'basic-track.kml') => ({ name, mimeType: 'application/vnd.google-earth.kml+xml', buffer: fixture(file) });

const status = (page) => page.locator('.flight-status');
const playTime = (page) => page.locator('.playback-time');
const fileInput = (page) => page.locator('input[type="file"]');

async function loadExample(page) {
  await page.getByRole('button', { name: 'Example flight' }).click();
  await expect(status(page)).toHaveText(/^4 tracks loaded/, { timeout: 20_000 });
}

// How many map pixels are close to a colour, to see what's drawn.
function pixelsNear(page, [r, g, b]) {
  return page.locator('canvas.debrief-map').evaluate((canvas, rgb) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - rgb[0]) < 40 && Math.abs(data[i + 1] - rgb[1]) < 40 && Math.abs(data[i + 2] - rgb[2]) < 40) n++;
    }
    return n;
  }, [r, g, b]);
}

test('opens from its card with only the essentials, and nothing to play yet @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  await page.locator('a.card[href="#/debrief"]').click();
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'debrief');
  await expect(page).toHaveTitle('Debrief Viewer · DAD\'s OODA LOOP');
  await expect(page.getByText('Load tracks', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Example flight' })).toBeEnabled();
  await expect(status(page)).toHaveText('No flight loaded');
  await expect(status(page)).toBeDisabled();
  await expect(page.getByText('Load up to four track files, or the example flight, to start.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Fit' })).toBeDisabled();
  await expect(page.getByLabel('Grid (5,000 ft)')).toBeHidden(); // inside the closed Layers menu
});

test('the example flight loads fitted to the map, with the status from what loaded (R11)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await expect(page.getByText('Load up to four track files')).toBeHidden();
  // On the ramp Lead isn't moving, so nobody is judged yet (D52).
  const card = page.getByRole('list', { name: 'Formation' }).getByRole('listitem');
  await expect(card).toHaveText([
    '#2 – (Lead not moving)', '#3 – (Lead not moving)', '#4 – (Lead not moving)', /^Lead \d+ kt est\. IAS/,
  ]);
  await status(page).click();
  await expect(status(page)).toHaveAttribute('aria-expanded', 'true');
  const details = page.locator('.status-details');
  await expect(details.locator('h3')).toHaveCount(4);
  await expect(details).toContainText(/positions over \d+ min/);
  // All four tracks are on the map, #4 in white (#29).
  await expect.poll(() => pixelsNear(page, [0, 102, 255])).toBeGreaterThan(50);
  await expect.poll(() => pixelsNear(page, [255, 255, 255])).toBeGreaterThan(50);
  await expect(playTime(page)).toHaveText(/^\d\d:\d\d:\d\dZ$/);
  await expect(page.locator('#module-status')).toContainText('4 tracks loaded');
});

test('playback: play, pause, step, keys and the scrubber share one clock', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const start = await playTime(page).textContent();
  const scrubber = page.getByLabel('Flight time');
  const value = async () => Number(await scrubber.inputValue());
  const first = await value();

  await page.getByRole('button', { name: 'Ahead 1 second' }).click();
  expect(await value()).toBe(first + 1);
  await page.getByRole('button', { name: 'Back 1 second' }).click();
  expect(await value()).toBe(first);

  await page.getByLabel('Playback speed').selectOption('16');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect.poll(value).toBeGreaterThan(first + 5);
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await value();
  await page.waitForTimeout(300);
  expect(await value()).toBe(paused); // paused means paused
  expect(await page.evaluate(() => window.__ooda.stats().frames)).toBe(0); // and nothing runs (#43)

  // Keys, from the map (never while typing)
  await page.locator('canvas.debrief-map').focus();
  await page.keyboard.press('ArrowRight');
  expect(await value()).toBe(paused + 1);
  await page.keyboard.press('ArrowLeft');
  expect(await value()).toBe(paused);
  await page.keyboard.press('Home');
  expect(await value()).toBe(first);
  await expect(playTime(page)).toHaveText(start);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();

  await scrubber.fill(String(first + 100));
  expect(await value()).toBe(first + 100);
  await page.getByRole('button', { name: 'Reset' }).click();
  expect(await value()).toBe(first);
});

test('picked files get ships in order, and a ship can be changed before loading', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await fileInput(page).setInputFiles([kml('lead.kml'), kml('wing.kml')]);
  await expect(page.getByLabel('Ship for lead.kml')).toHaveValue('1');
  await expect(page.getByLabel('Ship for wing.kml')).toHaveValue('2');
  await page.getByLabel('Ship for wing.kml').selectOption('3');
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(status(page)).toHaveText('2 tracks loaded');
  await expect(page.getByRole('list', { name: 'Formation' }).getByRole('listitem').first()).toHaveText(/^#3 /);
  await status(page).click();
  await expect(page.locator('.status-details h3')).toHaveText(['#1 lead.kml', '#3 wing.kml']);
});

test('a file that can\'t be read changes nothing loaded (D54), and says which and why', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await fileInput(page).setInputFiles([kml('good.kml'), kml('broken.kml', 'not-xml.kml')]);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('broken.kml');
  await expect(page.getByRole('alert')).toContainText('Nothing was changed.');
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
});

test('more than four files are refused before any is read', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await fileInput(page).setInputFiles(['a', 'b', 'c', 'd', 'e'].map((n) => kml(`${n}.kml`)));
  await expect(page.getByRole('alert')).toHaveText('Choose up to 4 track files at once (5 were chosen). Nothing was loaded.');
  await expect(page.locator('.picker-table')).toHaveCount(0);
});

test('a hostile file name shows as plain text', async ({ page }) => {
  await openRoute(page, '#/debrief');
  const name = '<img src=x onerror="window.__pwned=1">.kml';
  await fileInput(page).setInputFiles([kml(name)]);
  await expect(page.getByRole('cell', { name })).toBeVisible();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(status(page)).toHaveText('1 track loaded');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('.debrief img').count()).toBe(0);
});

test('opened panels come back after a reload, and Reset layout restores the defaults (R22)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  const formation = page.getByRole('button', { name: 'Formation' });
  await formation.click();
  await expect(formation).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByLabel('Grid (5,000 ft)').uncheck();
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'debrief');
  await expect(formation).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByLabel('Grid (5,000 ft)')).not.toBeChecked();
  await page.getByRole('button', { name: 'Reset layout' }).click();
  await expect(formation).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Grid (5,000 ft)')).toBeChecked();
  // The menu closes with Escape, back on its button, or with a click elsewhere.
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Grid (5,000 ft)')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Layers' })).toBeFocused();
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.locator('canvas.debrief-map').click();
  await expect(page.getByLabel('Grid (5,000 ft)')).toBeHidden();
});

test('leaving the debrief while it plays stops everything it started (R4)', async ({ page }) => {
  await openRoute(page, '#/');
  const fresh = await page.evaluate(() => window.__ooda.stats());
  await page.evaluate(() => { location.hash = '#/debrief'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'debrief');
  await loadExample(page);
  await page.getByRole('button', { name: 'Play' }).click();
  expect(await page.evaluate(() => window.__ooda.stats().frames)).toBeGreaterThan(0);
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  expect(await page.evaluate(() => window.__ooda.stats())).toEqual(fresh);
  expect(await page.locator('link[href*="debrief"]').count()).toBe(0);
});

// R2: with a flight loaded and every panel open, no control covers another
// or runs off the page, at the smallest supported screen and a big one.
for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`at ${size.width} × ${size.height} with every panel open, nothing overlaps (R2)`, async ({ page }) => {
    await page.setViewportSize(size);
    await openRoute(page, '#/debrief');
    await loadExample(page);
    await status(page).click();
    await page.getByRole('button', { name: 'More detail' }).click();
    await page.getByRole('button', { name: 'Standards' }).click();
    await page.getByRole('button', { name: 'Layers' }).click();
    const problems = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('#view a[href], #view button, #view input, #view select, #view label.button')]
        .filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden]') && !el.classList.contains('visually-hidden'));
      const out = [];
      const width = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > width) out.push('the page scrolls sideways');
      const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect() }));
      const name = (el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
      for (const { el, r } of boxes) if (r.left < 0 || r.right > width + 0.5) out.push(`${name(el)} is cut off`);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 1 && h > 1) out.push(`${name(a.el)} overlaps ${name(b.el)}`);
        }
      }
      return out;
    });
    expect(problems).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('debrief.png') });
  });
}

test('in flight the Formation card judges each wingman; More detail opens the numbers and stays open (R22)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.inputValue()) + 40 * 60)); // 40 minutes in: airborne
  const card = page.getByRole('list', { name: 'Formation' }).getByRole('listitem');
  await expect(card).toHaveCount(4);
  await expect(card.nth(0)).toHaveText(/^#2 (On parameters|((WIDE|TIGHT|FORE|AFT) by [\d,]+ ft(, )?)+|GPS gap)$/);
  await expect(card.nth(3)).toHaveText(/^Lead \d+ kt est\. IAS, \d\.\d G/);

  const more = page.getByRole('button', { name: 'More detail' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Live data')).toBeHidden();
  await more.click();
  await expect(page.getByRole('heading', { name: 'Live data' })).toBeVisible();
  await expect(page.locator('.more-detail .detail-lines').first()).toContainText(/Alt [\d,]+ ft, GS \d+ kt, est\. IAS \d+ kt/);
  await expect(page.getByRole('heading', { name: 'From Lead' })).toBeVisible();
  await expect(page.locator('.more-detail')).toContainText(/#3–#4: [\d,]+ ft horizontal, [\d,]+ ft 3D, closure/);
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'debrief');
  await expect(page.getByRole('button', { name: 'More detail' })).toHaveAttribute('aria-expanded', 'true');
});

test('standards: edit, refuse a bad value, keep after a reload, reset to V6 (R18)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.inputValue()) + 30 * 60));
  const open = page.getByRole('button', { name: 'Standards' });
  await expect(open).toHaveAttribute('aria-expanded', 'false'); // closed at first (R22)
  await open.click();
  const summary = page.getByRole('list', { name: 'Standards in use' });
  await expect(summary).toContainText('Spread: 4000-6000 ft, 3/9 ±250 ft');

  const max = page.getByLabel('Spread maximum');
  await max.fill('8000');
  await max.press('Tab');
  await expect(summary).toContainText('Spread: 4000-8000 ft');
  await max.fill('50000');
  await max.press('Tab');
  await expect(max).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator(`#${await max.getAttribute('aria-describedby')}`)).toHaveText('Spread maximum must be between 0 and 20,000 ft. Kept 8000 ft.');
  await expect(summary).toContainText('Spread: 4000-8000 ft');

  // With every standard off, no wingman gets a label (#21).
  for (const name of ['Judge spread', 'Judge the offset', 'Judge Lead']) await page.getByLabel(name).uncheck();
  await expect(summary).toHaveText('All standards are off: no labels are shown.');
  const card = page.getByRole('list', { name: 'Formation' }).getByRole('listitem');
  await expect(card.nth(0)).toHaveText(/^#2 (– \(no standard on\)|GPS gap)$/);
  await expect(card.nth(3)).not.toContainText('on parameters');

  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'debrief');
  await expect(page.getByLabel('Judge spread')).not.toBeChecked();
  await expect(page.getByLabel('Spread maximum')).toHaveValue('8000');
  await page.getByRole('button', { name: 'Reset to V6 standards' }).click();
  await expect(page.getByLabel('Spread maximum')).toHaveValue('6000');
  await expect(page.getByLabel('Judge spread')).toBeChecked();
  await expect(page.getByRole('list', { name: 'Standards in use' })).toContainText('Lead: 200 ±10 kt, 1.0 ±0.20 G');
});
