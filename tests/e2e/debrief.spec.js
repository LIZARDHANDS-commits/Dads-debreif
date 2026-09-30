// Browser tests for the Debrief Viewer (SPEC-debrief: Testing strategy).
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

const fixture = (name) => readFileSync(new URL(`../fixtures/flight-data/${name}`, import.meta.url));
const kml = (name, file = 'basic-track.kml') => ({ name, mimeType: 'application/vnd.google-earth.kml+xml', buffer: fixture(file) });

const status = (page) => page.locator('.flight-status');
const playTime = (page) => page.locator('.playback-time');
const fileInput = (page) => page.locator('input[type="file"][multiple]');

async function loadExample(page) {
  await page.getByRole('button', { name: 'Example flight' }).click();
  await expect(status(page)).toHaveText(/^4 tracks loaded/, { timeout: 20_000 });
}

// How many map pixels are close to a colour, to see what's drawn.
function pixelsNear(page, [r, g, b]) {
  return page.locator('canvas.debrief-2d').evaluate((canvas, rgb) => {
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
  await page.locator('canvas.debrief-2d').focus();
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
  const map = page.locator('canvas.debrief-2d');
  const box = await map.boundingBox();
  await map.click({ position: { x: box.width - 10, y: box.height - 10 } }); // clear of the open menu
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
    await page.getByRole('button', { name: 'Save, open, examples' }).click();
    await page.getByRole('button', { name: '+ Add' }).click();
    await page.getByRole('button', { name: 'Edit DFP 1' }).click();
    await page.getByRole('button', { name: 'Layers' }).click();
    const overlaps = () => page.evaluate(() => {
      const controls = [...document.querySelectorAll('#view a[href], #view button, #view input, #view select, #view label.button')]
        .filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden]') && !el.classList.contains('visually-hidden'));
      const out = [];
      const width = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > width) out.push('the page scrolls sideways');
      // A control scrolled out of sight inside a scrolling menu isn't on the screen; one partly in sight counts where it shows.
      const shown = (el) => {
        const r = el.getBoundingClientRect();
        let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (!/(auto|scroll)/.test(getComputedStyle(p).overflowY)) continue;
          const c = p.getBoundingClientRect();
          box = { left: Math.max(box.left, c.left), right: Math.min(box.right, c.right), top: Math.max(box.top, c.top), bottom: Math.min(box.bottom, c.bottom) };
        }
        return box.right > box.left && box.bottom > box.top ? box : null;
      };
      const boxes = controls.map((el) => ({ el, r: shown(el) })).filter((b) => b.r);
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
    expect(await overlaps()).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('debrief.png') });
    await page.getByRole('button', { name: 'Routes and charts' }).click();
    await page.getByText('Chart alignment').click();
    expect(await overlaps()).toEqual([]);
    // And with the EM chart open below the map (#37).
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('checkbox', { name: 'EM chart' }).check();
    await page.getByRole('checkbox', { name: 'Tennis ball' }).check();
    expect(await overlaps()).toEqual([]);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: test.info().outputPath('debrief-em.png') });
    // The same in 3D, with its settings open.
    await page.keyboard.press('Escape');
    await page.getByText('3D', { exact: true }).click();
    await page.getByRole('button', { name: '3D settings' }).click();
    expect(await overlaps()).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('debrief-3d.png') });
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

const dfpRows = (page) => page.getByRole('list', { name: 'DFPs' }).getByRole('listitem');

async function addDfpAt(page, minutes) {
  const scrubber = page.getByLabel('Flight time');
  const start = Number(await scrubber.getAttribute('min'));
  await scrubber.fill(String(start + minutes * 60));
  await page.getByRole('button', { name: '+ Add' }).click();
}

test('DFPs: add, rename, note, step through in time order, delete; kept for this flight only (R17, #25)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await expect(page.getByText('Load a flight to mark debrief focus points.')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add' })).toBeDisabled();
  await loadExample(page);
  await expect(page.getByText('Press + Add to mark this moment.')).toBeVisible();
  await addDfpAt(page, 30);
  await addDfpAt(page, 10);
  await expect(dfpRows(page).locator('.dfp-label')).toHaveText(['DFP 1', 'DFP 2']); // time order

  // A hostile label is only ever text.
  const hostile = '<img src=x onerror="window.__pwned=1">';
  await page.getByRole('button', { name: 'Edit DFP 2' }).click();
  await page.getByLabel('Name').fill(hostile);
  await page.getByLabel('Name').press('Tab');
  await expect(page.getByLabel('Note')).toBeFocused();
  await page.getByLabel('Note').fill('Late on the rejoin');
  await page.getByLabel('Note').press('Tab');
  await expect(dfpRows(page).locator('.dfp-label')).toHaveText(['DFP 1', hostile]);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('.debrief img').count()).toBe(0);

  const scrubber = page.getByLabel('Flight time');
  const start = Number(await scrubber.getAttribute('min'));
  await scrubber.fill(String(start));
  await page.getByRole('button', { name: 'Next DFP' }).click();
  await expect(scrubber).toHaveValue(String(start + 600));
  await page.getByRole('button', { name: 'Next DFP' }).click();
  await expect(scrubber).toHaveValue(String(start + 1800));
  await page.getByRole('button', { name: 'Previous DFP' }).click();
  await expect(scrubber).toHaveValue(String(start + 600));
  await page.getByRole('button', { name: /^DFP 1 / }).click();
  await expect(scrubber).toHaveValue(String(start + 600));

  // Kept in this browser for this flight...
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'debrief');
  await loadExample(page);
  await expect(dfpRows(page).locator('.dfp-label')).toHaveText(['DFP 1', hostile]);
  await page.getByRole('button', { name: `Edit ${hostile}` }).click();
  await expect(page.getByLabel('Note')).toHaveValue('Late on the rejoin');
  await page.getByRole('button', { name: `Delete ${hostile}` }).click();
  await expect(dfpRows(page)).toHaveCount(1);

  // ...and never shown on another flight (#25).
  await fileInput(page).setInputFiles([kml('lead.kml')]);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(status(page)).toHaveText('1 track loaded');
  await expect(dfpRows(page)).toHaveCount(0);
});

test('save a debrief, close it, open it again: same tracks, DFPs, standards and time (R17)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await addDfpAt(page, 20);
  await page.getByRole('button', { name: 'Edit DFP 1' }).click();
  await page.getByLabel('Name').fill('Rejoin');
  await page.getByLabel('Name').press('Tab');
  await page.getByRole('button', { name: 'Standards' }).click();
  await page.getByLabel('Spread maximum').fill('7000');
  await page.getByLabel('Spread maximum').press('Tab');
  const scrubber = page.getByLabel('Flight time');
  const start = Number(await scrubber.getAttribute('min'));
  await scrubber.fill(String(start + 25 * 60));
  const shownTime = await playTime(page).textContent();

  await page.getByRole('button', { name: 'Save, open, examples' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^debrief-\d{4}-\d\d-\d\d-\d{4}Z\.dadsdebrief\.json$/);
  const saved = await download.path();

  // Closing with the DFPs saved asks nothing.
  let asked = 0;
  page.on('dialog', (dialog) => { asked++; dialog.accept(); });
  await page.getByRole('button', { name: 'Close flight' }).click();
  expect(asked).toBe(0);
  await expect(status(page)).toHaveText('No flight loaded');
  await expect(dfpRows(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset to V6 standards' }).click();
  await expect(page.getByLabel('Spread maximum')).toHaveValue('6000');

  await page.locator('input[type="file"][accept^=".json"]').setInputFiles(saved);
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  await expect(dfpRows(page).locator('.dfp-label')).toHaveText(['Rejoin']);
  await expect(scrubber).toHaveValue(String(start + 25 * 60));
  await expect(playTime(page)).toHaveText(shownTime);
  await expect(page.getByLabel('Spread maximum')).toHaveValue('7000');

  // A change not yet saved asks before closing; saying no keeps the flight.
  await addDfpAt(page, 5);
  page.removeAllListeners('dialog');
  page.once('dialog', (dialog) => { asked++; dialog.dismiss(); });
  await page.getByRole('button', { name: 'Close flight' }).click();
  expect(asked).toBe(1);
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
});

test('a debrief file that can\'t be read changes nothing, and says why', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await addDfpAt(page, 10);
  await page.getByRole('button', { name: 'Save, open, examples' }).click();
  await page.locator('input[type="file"][accept^=".json"]').setInputFiles({ name: 'odd.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"something else"}') });
  await expect(page.getByRole('alert')).toContainText('Nothing was changed.');
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  await expect(dfpRows(page)).toHaveCount(1);
});

test('the example track files download as ordinary .kml files', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await page.getByRole('button', { name: 'Save, open, examples' }).click();
  const link = page.locator('.example-files button').first();
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toBe(await link.textContent());
  expect(download.suggestedFilename()).toMatch(/\.kml$/);
});

// A short fingerprint of what the map shows, to see a layer change it.
const mapPicture = (page) => page.locator('canvas.debrief-2d').evaluate((canvas) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let hash = 0;
  for (let i = 0; i < data.length; i += 7) hash = (hash * 31 + data[i]) | 0;
  return hash;
});

test('every map layer redraws at once while paused, and comes back after a reload (#26, R3)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.getAttribute('min')) + 40 * 60)); // airborne, paused
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add' }).click(); // a DFP flag on the map
  await page.getByRole('button', { name: 'Layers' }).click();
  // V6's defaults: full tracks, spacing lines, grid and Lead's 3/9 line on.
  await expect(page.getByLabel('Trail', { exact: true })).toHaveValue('0');
  for (const name of ['Spacing lines', 'Grid (5,000 ft)', 'Lead 3/9 line']) await expect(page.getByLabel(name)).toBeChecked();
  for (const name of ['#3 3/9 line', 'Fighting-wing cone', 'Clock marks', 'Safety bubble', 'Follow Lead']) await expect(page.getByLabel(name)).not.toBeChecked();

  const changes = async (act) => {
    const before = await mapPicture(page);
    await act();
    await expect.poll(() => mapPicture(page)).not.toBe(before);
  };
  await page.getByRole('button', { name: 'Routes and charts' }).click();
  await changes(() => page.getByLabel('Route', { exact: true }).selectOption({ label: 'TACNAV 1' }));
  await changes(() => page.getByLabel('Route opacity').fill('30'));
  await page.getByRole('button', { name: 'Layers' }).click();
  // The cone is small, so it's checked zoomed in on Lead.
  await changes(() => page.getByLabel('Follow Lead').check());
  const zoomBefore = await mapPicture(page);
  await page.locator('canvas.debrief-2d').focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('+');
  await expect.poll(() => mapPicture(page)).not.toBe(zoomBefore);
  for (const name of ['Spacing lines', 'Grid (5,000 ft)', 'Lead 3/9 line']) await changes(() => page.getByLabel(name).uncheck());
  for (const name of ['#3 3/9 line', 'Fighting-wing cone', 'Clock marks', 'Safety bubble']) await test.step(name, () => changes(() => page.getByLabel(name).check()));
  await changes(async () => {
    await page.getByLabel('Bubble radius').fill('1500');
  });
  await changes(() => page.getByLabel('Trail', { exact: true }).selectOption({ label: 'History only' }));
  await changes(() => page.getByLabel('Trail', { exact: true }).selectOption({ label: 'Last 60 s' }));
  // Follow Lead keeps Lead in the middle as time moves.
  await changes(() => page.getByRole('button', { name: 'Ahead 1 second' }).click());

  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'debrief');
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByLabel('Trail', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Fighting-wing cone')).toBeChecked();
  await expect(page.getByLabel('Bubble radius')).toHaveValue('1500');
  await page.getByRole('button', { name: 'Reset layout' }).click();
  await expect(page.getByLabel('Fighting-wing cone')).not.toBeChecked();
  await expect(page.getByLabel('Spacing lines')).toBeChecked();
});

test('a built-in route shows on its own before any flight is loaded', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await page.getByRole('button', { name: 'Routes and charts' }).click();
  const route = page.getByLabel('Route', { exact: true });
  await expect(route.locator('option')).toHaveCount(20); // None and V6's 19
  const before = await mapPicture(page);
  await route.selectOption({ label: 'South A1' });
  await expect.poll(() => mapPicture(page)).not.toBe(before);
  await expect.poll(() => pixelsNear(page, [255, 204, 102])).toBeGreaterThan(50); // V6's amber
});

// A 1 × 1 green PNG (0, 200, 60), served in place of Esri's tiles so the tests don't need the network.
const GREEN_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgOGEDAAHQAQV8fabtAAAAAElFTkSuQmCC', 'base64');
const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/**';

test('satellite imagery: off at first, Esri\'s tiles under the tracks with Esri\'s credit (#28)', async ({ page }) => {
  const asked = [];
  await page.route(ESRI, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: GREEN_TILE });
  });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const credit = page.locator('.map-credit');
  await expect(credit).toBeHidden();
  expect(asked).toEqual([]); // nothing fetched while it's off (R5)
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByLabel('Satellite imagery').check();
  await expect(credit).toHaveText(/^Imagery: Esri/);
  // The green tiles, a little darkened as in V6, fill the map.
  await expect.poll(() => pixelsNear(page, [1, 158, 51]), { timeout: 10_000 }).toBeGreaterThan(10_000);
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every((url) => /\/tile\/\d+\/\d+\/\d+$/.test(url))).toBe(true);
  await page.getByLabel('Satellite imagery').uncheck();
  await expect(credit).toBeHidden();
});

test('with no connection, the map says satellite imagery needs one and keeps the grid', async ({ page }) => {
  // A broken picture fails the same way as no connection, without the browser's own error line.
  await page.route(ESRI, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: 'not a picture' }));
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await page.getByRole('button', { name: 'Layers' }).click();
  await page.getByLabel('Satellite imagery').check();
  // Each tile is tried three times over about 8 s before the map gives up on it.
  await expect(page.locator('.map-credit')).toHaveText(/needs a connection/, { timeout: 20_000 });
});

const picture3d = (page) => page.locator('canvas.debrief-3d').evaluate((canvas) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let hash = 0;
  for (let i = 0; i < data.length; i += 7) hash = (hash * 31 + data[i]) | 0;
  return hash;
});

test('2D and 3D are one switch on one clock: switching while playing keeps the time (#27, R12)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  // With no flight, 3D shows the ground and says what to do, never a blank box.
  await page.getByText('3D', { exact: true }).click();
  await expect(page.locator('canvas.debrief-3d')).toBeVisible();
  await expect(page.locator('canvas.debrief-2d')).toBeHidden();
  await expect(page.locator('.debrief-empty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Layers' })).toBeHidden();
  await loadExample(page);
  await expect(page.locator('.debrief-empty')).toBeHidden();
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.getAttribute('min')) + 40 * 60));
  const before = await picture3d(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => picture3d(page)).not.toBe(before); // the formation moves in 3D
  await page.getByText('2D', { exact: true }).click();
  await expect(page.locator('canvas.debrief-2d')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible(); // still playing
  await page.getByRole('button', { name: 'Pause' }).click();
  const at = await playTime(page).textContent();
  await page.getByText('3D', { exact: true }).click();
  await expect(playTime(page)).toHaveText(at);
  await page.getByText('2D', { exact: true }).click();
  await expect(playTime(page)).toHaveText(at);
});

test('3D: drag turns it, the wheel zooms, settings are kept, Reset view goes back to V6\'s view', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.getAttribute('min')) + 40 * 60));
  await page.getByText('3D', { exact: true }).click();
  const canvas = page.locator('canvas.debrief-3d');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  let before = await picture3d(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 40, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => picture3d(page)).not.toBe(before);

  await page.getByRole('button', { name: '3D settings' }).click();
  await expect(page.getByLabel('Turn', { exact: true })).toHaveValue('13'); // -35 + 120 × 0.4
  await expect(page.getByLabel('Look down', { exact: true })).toHaveValue('42'); // 52 − 40 × 0.25
  await page.keyboard.press('Escape');

  before = await picture3d(page);
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => picture3d(page)).not.toBe(before);
  await canvas.focus();
  before = await picture3d(page);
  await page.keyboard.press('-');
  await expect.poll(() => picture3d(page)).not.toBe(before);

  for (const name of ['Altitude sticks', 'Ground grid', 'Bank and pitch', 'Altitude scale', 'Compass', 'Landscape']) {
    await test.step(name, async () => {
      await page.getByRole('button', { name: '3D settings' }).click();
      const b = await picture3d(page);
      await page.getByLabel(name).uncheck();
      await expect.poll(() => picture3d(page)).not.toBe(b);
      await page.keyboard.press('Escape');
    });
  }

  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'debrief');
  await page.getByRole('button', { name: '3D settings' }).click();
  await expect(page.getByLabel('Turn', { exact: true })).toHaveValue('13');
  await expect(page.getByLabel('Altitude sticks')).not.toBeChecked();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.getByLabel('Turn', { exact: true })).toHaveValue('-35');
  await expect(page.getByLabel('Look down', { exact: true })).toHaveValue('52');
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('70');
  await expect(page.getByLabel('Altitude sticks')).not.toBeChecked(); // Reset view is the camera only
});

test('VNC charts: off at first, fetched only when chosen, "Not for navigation", opacity and alignment redraw (#43, R5)', async ({ page }) => {
  const asked = [];
  page.on('request', (req) => req.url().includes('/media/debrief/') && asked.push(new URL(req.url()).pathname.split('/').pop()));
  await openRoute(page, '#/debrief');
  await page.getByRole('button', { name: 'Routes and charts' }).click();
  const chart = page.getByLabel('VNC chart');
  await expect(chart.locator('option:checked')).toHaveText('Off');
  expect(asked).toEqual([]);
  const credit = page.locator('.map-credit');
  const before = await mapPicture(page);
  await chart.selectOption({ label: 'South (Moose Jaw, Regina)' });
  await expect(credit).toHaveText(/not for navigation/i, { timeout: 15_000 });
  await expect.poll(() => mapPicture(page)).not.toBe(before);
  expect(asked).toEqual(['vnc-south.webp']);

  const changes = async (act) => {
    const b = await mapPicture(page);
    await act();
    await expect.poll(() => mapPicture(page)).not.toBe(b);
  };
  await changes(() => page.getByLabel('Chart opacity').fill('30'));
  await page.getByText('Chart alignment').click();
  await changes(() => page.getByLabel('East / West').fill('5'));
  await changes(() => page.getByLabel('Chart scale').fill('101'));
  await page.getByRole('button', { name: 'Reset alignment' }).click();
  await expect(page.getByLabel('East / West')).toHaveValue('0');
  await expect(page.getByLabel('Chart scale')).toHaveValue('100');
  await chart.selectOption({ label: 'Both' });
  await expect.poll(() => asked.length).toBe(2);
  await chart.selectOption({ label: 'Off' });
  await expect(credit).toBeHidden();
});


const emPicture = (page) => page.locator('canvas.debrief-em-canvas').evaluate((canvas) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let hash = 0;
  for (let i = 0; i < data.length; i += 7) hash = (hash * 31 + data[i]) | 0;
  return hash;
});

test('EM chart: closed at first, opened from Tools below the map, charts fetched only when shown (#37, R5)', async ({ page }) => {
  const asked = [];
  page.on('request', (req) => /\/em-\d+\.jpg$/.test(req.url()) && asked.push(req.url().split('/').pop()));
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.getAttribute('min')) + 40 * 60));
  const panel = page.locator('.debrief-em');
  await expect(panel).toBeHidden();
  expect(asked).toEqual([]);
  const mapBefore = await page.locator('.debrief-map-wrap').boundingBox();
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('checkbox', { name: 'EM chart' }).check();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  // The map shrinks to make room; the panel sits below it, not over it.
  const mapAfter = await page.locator('.debrief-map-wrap').boundingBox();
  const emBox = await panel.boundingBox();
  expect(mapAfter.height).toBeLessThan(mapBefore.height);
  expect(emBox.y).toBeGreaterThanOrEqual(mapAfter.y + mapAfter.height);
  await expect(page.locator('.debrief-em-note')).toHaveText(/^\d{1,2},\d{3} ft chart\./);
  await expect.poll(() => asked.length).toBe(1);

  const changes = async (act) => {
    const b = await emPicture(page);
    await act();
    await expect.poll(() => emPicture(page)).not.toBe(b);
  };
  await changes(() => page.getByRole('button', { name: 'Ahead 1 second' }).click());
  await changes(() => page.getByLabel('Trail (60 s)').uncheck());
  await changes(() => page.getByLabel('Chart', { exact: true }).selectOption({ label: '6,500 ft' }));
  await expect(page.locator('.debrief-em-note')).toHaveText(/^6,500 ft chart\./);
  await page.getByRole('button', { name: 'Close EM chart' }).click();
  await expect(panel).toBeHidden();
  // Closed, it draws nothing while playing (#39).
  await page.getByRole('button', { name: 'Play' }).click();
  const still = await emPicture(page);
  await page.waitForTimeout(300);
  expect(await emPicture(page)).toBe(still);
});

test('tennis ball: opened from Tools, one answer in the panel, on the map and in 3D (#19)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.getAttribute('min')) + 40 * 60));
  const panel = page.locator('.tennis-panel');
  await expect(panel).toBeHidden();
  const before = await mapPicture(page);
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('checkbox', { name: 'Tennis ball' }).check();
  await page.keyboard.press('Escape');
  await expect(panel).toBeVisible();
  const status = page.locator('.tennis-status');
  await expect(status).toHaveText(/^(INTERCEPT|IN CONE|OUT OF CONE|GPS GAP|NOT MOVING)$/);
  // #2 is in a GPS gap here, so #3 throws at Lead, and the map shows it.
  await page.getByLabel('Shooter', { exact: true }).selectOption({ label: '#3' });
  await expect(status).toHaveText(/^(INTERCEPT|IN CONE|OUT OF CONE)$/);
  await expect.poll(() => mapPicture(page)).not.toBe(before);
  // V6's settings.
  await expect(page.getByLabel('Ball speed')).toHaveValue('350');
  await expect(page.getByLabel('Cone width')).toHaveValue('6');
  await expect(page.getByLabel('Time of flight')).toHaveValue('3');
  await expect(page.getByLabel('Hit radius')).toHaveValue('250');
  await expect(page.getByLabel('Gravity drop')).toBeChecked();
  // Lead at #3: the words follow the choice.
  await page.getByLabel('Shooter', { exact: true }).selectOption({ label: '#1 Lead' });
  await page.getByLabel('Target', { exact: true }).selectOption({ label: '#3' });
  await expect(page.locator('.tennis-lines li').first()).toHaveText(/^#1 at #3, range [\d,]+ ft$/);
  await page.getByLabel('Target', { exact: true }).selectOption({ label: '#1 Lead' });
  await expect(status).toHaveText('PICK TWO');
  await page.getByLabel('Target', { exact: true }).selectOption({ label: '#3' });
  // The same solution in 3D.
  await page.getByText('3D', { exact: true }).click();
  const with3d = await picture3d(page);
  await page.getByRole('button', { name: 'Close tennis ball' }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => picture3d(page)).not.toBe(with3d);
});
