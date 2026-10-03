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
  expect(await page.locator('link[rel="stylesheet"][href*="debrief"]').count()).toBe(0);
});

test('leaving from 3D with the tennis ball open stops everything too (R4)', async ({ page }) => {
  await openRoute(page, '#/');
  const fresh = await page.evaluate(() => window.__ooda.stats());
  await page.evaluate(() => { location.hash = '#/debrief'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'debrief');
  await loadExample(page);
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('checkbox', { name: 'Tennis ball' }).check();
  await page.keyboard.press('Escape');
  await page.getByText('3D', { exact: true }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  expect(await page.evaluate(() => window.__ooda.stats().frames)).toBeGreaterThan(0);
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  expect(await page.evaluate(() => window.__ooda.stats())).toEqual(fresh);
});

// R3 with a flight loaded (buttons.spec.js clicks through the empty screen):
// every control on show does something you can see: the page changes, a map
// redraws, a file downloads, a file picker or a question opens. Each click
// starts from a fresh page, first with the default layout, then with every
// panel open, so one click (collapsing a column, say) can't hide the rest.
test('with a flight loaded, every control on show does something (R3)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    if (location.protocol.startsWith('http')) localStorage.clear();
  });
  let events = 0;
  page.on('download', () => { events++; });
  page.on('filechooser', () => { events++; });
  page.on('dialog', (dialog) => { events++; dialog.dismiss(); });
  const openAll = async () => {
    await status(page).click();
    await page.getByRole('button', { name: 'More detail' }).click();
    await page.getByRole('button', { name: 'Debrief settings' }).click();
    await page.getByRole('button', { name: 'Save, open, CSV' }).click();
    await page.getByRole('button', { name: '+ Add' }).click();
    await page.getByRole('button', { name: 'Edit DFP 1' }).click();
  };
  const tag = () => page.evaluate(() =>
    [...document.querySelectorAll('#view a[href], #view button, #view label.button')]
      .filter((el) => el.getClientRects().length > 0 && !el.disabled && !el.closest('[hidden]'))
      .map((el, index) => {
        el.dataset.testControl = String(index);
        return { index, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40) };
      }));
  const snapshot = () => page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [...document.querySelectorAll('#view canvas')].map((c) => (c.width && c.height ? c.toDataURL() : '')).join('|');
  });
  const fresh = async (setup) => {
    await page.goto('about:blank');
    await openRoute(page, '#/debrief');
    await loadExample(page);
    await setup();
    return tag();
  };
  const idle = [];
  const seen = new Set();
  for (const setup of [async () => {}, openAll]) {
    const list = await fresh(setup);
    expect(list.length).toBeGreaterThan(12);
    for (const control of list) {
      if (seen.has(control.text)) continue;
      seen.add(control.text);
      await fresh(setup);
      const target = page.locator(`[data-test-control="${control.index}"]`);
      // The same control as on the first page (the screen is built the same way each time).
      expect(await target.evaluate((el) => (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40))).toBe(control.text);
      const pictures = await snapshot();
      await page.evaluate(() => {
        window.__changes = 0;
        new MutationObserver((m) => { window.__changes += m.length; })
          .observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      });
      const eventsBefore = events;
      await target.click();
      const redrawn = (await snapshot()) !== pictures;
      const changes = await page.evaluate(() => window.__changes);
      if (!redrawn && !changes && events === eventsBefore) idle.push(control.text);
    }
  }
  expect(seen.size).toBeGreaterThan(25);
  expect(idle, 'controls that did nothing').toEqual([]);
});

// R6: after one visit the debrief opens with the network off, and the example
// flight plays again if it was loaded before. Needs the service worker, which
// the config blocks by default.
test.describe('offline copy', () => {
  test.use({ serviceWorkers: 'allow' });
  test('offline after one visit: the debrief opens and the example flight loads again (R6)', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // no card videos mid-download when the network drops
    await openRoute(page, '#/debrief');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      }
    });
    await loadExample(page);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.__ooda?.stats().mounted === 'debrief');
    await expect(status(page)).toHaveText('No flight loaded');
    await loadExample(page);
    const scrubber = page.getByLabel('Flight time');
    const before = await scrubber.inputValue();
    await page.getByRole('button', { name: 'Ahead 1 second' }).click();
    await expect(scrubber).toHaveValue(String(Number(before) + 1));
    await context.setOffline(false);
  });
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
    await page.getByRole('button', { name: 'Debrief settings' }).click();
    await page.getByRole('button', { name: 'Save, open, CSV' }).click();
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
    // And with the tennis ball open in Tools.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Tools' }).click();
    await page.getByRole('checkbox', { name: 'Tennis ball' }).check();
    expect(await overlaps()).toEqual([]);
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
  await expect(card.nth(3)).toHaveText(/^Lead \d+ kt est\. IAS \(no wind\), \d\.\d G/);

  const more = page.getByRole('button', { name: 'More detail' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Live data')).toBeHidden();
  await more.click();
  await expect(page.getByRole('heading', { name: 'Live data' })).toBeVisible();
  await expect(page.locator('.more-detail .detail-lines').first()).toContainText(/Alt [\d,]+ ft, GS \d+ kt, est\. IAS \d+ kt \(no wind\)/);
  await expect(page.getByRole('heading', { name: 'From Lead' })).toBeVisible();
  await expect(page.locator('.more-detail')).toContainText(/#3–#4: [\d,]+ ft horizontal, [\d,]+ ft 3D, closure/);
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'debrief');
  await expect(page.getByRole('button', { name: 'More detail' })).toHaveAttribute('aria-expanded', 'true');
});

test('winds aloft: an error page instead of winds is not blamed on the connection (W5; a 500 is in the unit tests, as the browser logs it as an error)', async ({ page }) => {
  await page.route(OPEN_METEO, (route) => route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: '<html>oops</html>' }));
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await page.getByRole('button', { name: 'Weather' }).click();
  await page.getByLabel('Winds aloft (model)').check();
  const wind = page.locator('.formation-card li.lead-wind');
  await expect(wind).toHaveText("HRDPS winds: Open-Meteo's answer wasn't wind data. Turn Winds aloft off and on to try again.");
  await expect(wind).not.toContainText('connection');
});

test('standards: a refusal names its own box and limit, and only the latest refusal stays on screen (#182 S1)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await page.getByRole('button', { name: 'Debrief settings' }).click();
  const messageOf = async (label) => page.locator(`#${await page.getByLabel(label, { exact: true }).getAttribute('aria-describedby')}`);
  const max = page.getByLabel('Spread maximum', { exact: true });
  const min = page.getByLabel('Spread minimum', { exact: true });

  // Below the minimum: the message under Maximum talks about the maximum and the minimum it must not go under.
  await max.fill('3000');
  await max.press('Tab');
  await expect(max).toHaveAttribute('aria-invalid', 'true');
  await expect(await messageOf('Spread maximum')).toHaveText('Spread maximum must not be less than the spread minimum (4000 ft). Kept 6000 ft.');

  // Another refusal elsewhere: the first message goes and that box shows its kept value again.
  await min.fill('-5');
  await min.press('Tab');
  await expect(await messageOf('Spread minimum')).toHaveText('Spread minimum must be between 0 and 20,000 ft. Kept 4000 ft.');
  await expect(await messageOf('Spread maximum')).toHaveText('');
  await expect(max).toHaveAttribute('aria-invalid', 'false');
  await expect(max).toHaveValue('6000');

  // The other way round: a minimum above the maximum names the maximum.
  await min.fill('7000');
  await min.press('Tab');
  await expect(await messageOf('Spread minimum')).toHaveText('Spread minimum must not be more than the spread maximum (6000 ft). Kept 4000 ft.');

  // The sweep pair says the same in its own words, with the degree sign attached.
  const most = page.getByLabel('Sweep, most', { exact: true });
  await most.fill('-1');
  await most.press('Tab');
  await expect(await messageOf('Sweep, most')).toHaveText('Sweep, most must be between 0 and 45°. Kept 10°.');
  const least = page.getByLabel('Sweep, least', { exact: true });
  await least.fill('9');
  await least.press('Tab');
  await most.fill('5');
  await most.press('Tab');
  await expect(await messageOf('Sweep, most')).toHaveText('Sweep, most must not be less than the least sweep (9°). Kept 10°.');

  // Any accepted value clears every message.
  await max.fill('8000');
  await max.press('Tab');
  await expect(max).toHaveAttribute('aria-invalid', 'false');
  for (const label of ['Spread minimum', 'Spread maximum', 'Sweep, least', 'Sweep, most']) await expect(await messageOf(label)).toHaveText('');
  await expect(most).toHaveAttribute('aria-invalid', 'false');
  await expect(most).toHaveValue('10');
});

test('standards: edit, refuse a bad value, keep after a reload, reset to the defaults (R18, D114-D116)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.inputValue()) + 30 * 60));
  const open = page.getByRole('button', { name: 'Debrief settings' });
  await expect(open).toHaveAttribute('aria-expanded', 'false'); // closed at first (R22)
  await open.click();
  const summary = page.getByRole('list', { name: 'Standards in use' });
  await expect(summary).toContainText('Spread: 4000-6000 ft, sweep 0 to 10°');

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
  await page.getByRole('button', { name: 'Reset to the default standards' }).click();
  await expect(page.getByLabel('Spread maximum')).toHaveValue('6000');
  await expect(page.getByLabel('Judge spread')).toBeChecked();
  await expect(page.getByRole('list', { name: 'Standards in use' })).toContainText('Lead: 220 kt low block, 200 kt mid, ±10 kt, 1.0 ±0.20 G');
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
  await page.getByRole('button', { name: 'Debrief settings' }).click();
  await page.getByLabel('Spread maximum').fill('7000');
  await page.getByLabel('Spread maximum').press('Tab');
  const scrubber = page.getByLabel('Flight time');
  const start = Number(await scrubber.getAttribute('min'));
  await scrubber.fill(String(start + 25 * 60));
  const shownTime = await playTime(page).textContent();

  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
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
  await page.getByRole('button', { name: 'Reset to the default standards' }).click();
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

test('Export CSV: disabled with no flight, then one row a second for all four ships (#28)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const button = page.getByRole('button', { name: 'Export CSV' });
  await expect(button).toBeDisabled();
  await loadExample(page);
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toMatch(/^debrief-\d{4}-\d\d-\d\d-\d{4}Z\.csv$/);
  const lines = readFileSync(await download.path(), 'utf8').trimEnd().split('\r\n');
  const header = lines[0].split(',');
  expect(header[0]).toBe('time (Zulu)');
  for (const slot of [1, 2, 3, 4]) expect(header).toContain(`#${slot} GPS gap`);
  const scrubber = page.getByLabel('Flight time');
  const span = Number(await scrubber.getAttribute('max')) - Number(await scrubber.getAttribute('min'));
  expect(Math.abs(lines.length - 1 - span)).toBeLessThanOrEqual(1);
  expect(lines[1].split(',')).toHaveLength(header.length);
});

test('a hostile debrief file: a 10 MB note is refused, and a script in a note is only text', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await addDfpAt(page, 10);
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  const file = JSON.parse(readFileSync(await download.path(), 'utf8'));
  await page.getByRole('button', { name: 'Close flight' }).click();
  await expect(status(page)).toHaveText('No flight loaded');

  const open = (dfps) => page.locator('input[type="file"][accept^=".json"]').setInputFiles({
    name: 'hostile.dadsdebrief.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...file, dfps })),
  });
  await open([{ ...file.dfps[0], note: `${'x'.repeat(10 * 1024 * 1024)}<script>window.__pwned=1</script>` }]);
  await expect(page.getByText(/DFP 1 is damaged/)).toBeVisible();
  await expect(status(page)).toHaveText('No flight loaded');

  const script = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
  await open([{ ...file.dfps[0], label: script, note: script }]);
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  await expect(dfpRows(page).locator('.dfp-label')).toHaveText([script]);
  await page.getByRole('button', { name: `Edit ${script}` }).click();
  await expect(page.getByLabel('Note')).toHaveValue(script);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('.debrief img, .debrief script').count()).toBe(0);
});

test('a debrief file that can\'t be read changes nothing, and says why', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await addDfpAt(page, 10);
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  await page.locator('input[type="file"][accept^=".json"]').setInputFiles({ name: 'odd.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"something else"}') });
  await expect(page.getByRole('alert')).toContainText('Nothing was changed.');
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  await expect(dfpRows(page)).toHaveCount(1);
});

test('the example track files download as ordinary .kml files', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
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

// The 3D view as seen: three.js's picture with the labels' canvas over it.
const picture3d = (page) => page.locator('canvas.debrief-3d').evaluate((canvas) => {
  const both = document.createElement('canvas');
  both.width = canvas.width;
  both.height = canvas.height;
  const ctx = both.getContext('2d');
  const picture = canvas.parentElement.querySelector('canvas.debrief-3d-picture');
  if (picture?.width) ctx.drawImage(picture, 0, 0, both.width, both.height);
  ctx.drawImage(canvas, 0, 0);
  const { data } = ctx.getImageData(0, 0, both.width, both.height);
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

  // The Harvard paint is the default; Ship colours repaints the models (D138).
  await page.getByRole('button', { name: '3D settings' }).click();
  await expect(page.getByLabel('Paint')).toHaveValue(/./);
  await expect(page.getByLabel('Paint').locator('option:checked')).toHaveText('Harvard');
  before = await picture3d(page);
  await page.getByLabel('Paint').selectOption({ label: 'Ship colours' });
  await expect.poll(() => picture3d(page)).not.toBe(before);
  await page.keyboard.press('Escape');

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


test('Tools menu: EM chart removed, tennis ball available (#37)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await page.getByRole('button', { name: 'Tools' }).click();
  await expect(page.getByRole('checkbox', { name: 'EM chart' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Tennis ball' })).toBeVisible();
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

// Past METARs from the IEM archive, made up for the window asked for: one on
// each hour and a SPECI at 22 past, so no test needs the network. As in the real
// CSV the text has no "SPECI" prefix: only the second call, report_type=4 alone,
// which lists just the specials, says which reports they are.
const IEM = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?**';
function iemReply(url) {
  const q = new URL(url).searchParams;
  const station = q.get('station');
  const from = Date.parse(`${q.get('sts').slice(0, -1)}:00Z`);
  const to = Date.parse(`${q.get('ets').slice(0, -1)}:00Z`);
  const pad = (n) => String(n).padStart(2, '0');
  const specialsOnly = q.getAll('report_type').join() === '4';
  const line = (ms, kind, body) => {
    const d = new Date(ms);
    const valid = `${d.toISOString().slice(0, 10)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    return `${station},${valid},${kind}${station} ${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z ${body}`;
  };
  const lines = ['station,valid,metar'];
  const firstHour = Math.ceil(from / 3_600_000) * 3_600_000;
  for (let ms = firstHour; ms <= to; ms += 3_600_000) {
    if (!specialsOnly) lines.push(line(ms, '', '27012KT 15SM FEW040 BKN120 12/04 A2992'));
    lines.push(line(ms + 22 * 60_000, '', '28018KT 2SM -SHRA OVC008 09/08 A2991'));
  }
  return lines.join('\n');
}

test('METAR: off at first, fetched only when on, the report in force with ticks and the raw text (SPEC-debrief: Weather)', async ({ page }) => {
  const asked = [];
  const askedAt = [];
  await page.route(IEM, (route) => {
    asked.push(route.request().url());
    askedAt.push(Date.now());
    return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: iemReply(route.request().url()) });
  });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const line = page.locator('.debrief-metar');
  const scrubber = page.getByRole('slider', { name: 'Flight time' });
  await expect(line).toBeHidden();
  expect(asked).toEqual([]); // nothing fetched while it's off (R5)

  await page.getByRole('button', { name: 'Weather' }).click();
  await page.getByLabel('METAR', { exact: true }).check();
  // The example flight is at Moose Jaw, so CYMJ is nearest; the line says the report's time and age.
  await expect(line.locator('.debrief-metar-text')).toHaveText(/^(SPECI )?CYMJ \d{4}Z \((at this moment|\d+ min before|\d+ h( \d+ min)? before)\) · /);
  expect(new URL(asked[0]).searchParams.get('station')).toBe('CYMJ');
  expect(new URL(asked[0]).searchParams.getAll('report_type')).toEqual(['3', '4']);
  // The archive's text doesn't say which is a SPECI, so a second call asks for specials alone, a second later.
  await expect.poll(() => asked.length).toBe(2);
  expect(new URL(asked[1]).searchParams.get('station')).toBe('CYMJ');
  expect(new URL(asked[1]).searchParams.getAll('report_type')).toEqual(['4']);
  expect(askedAt[1] - askedAt[0]).toBeGreaterThanOrEqual(900);
  // Each report inside the flight is a tick on the scrubber.
  await expect(scrubber).toHaveAttribute('list', 'debrief-report-ticks');
  expect(await page.locator('#debrief-report-ticks option').count()).toBeGreaterThan(0);
  // Once marked, a SPECI's tick says so in its label, and a routine report's says METAR.
  await expect(page.locator('#debrief-report-ticks option[label^="SPECI"]').first()).toHaveAttribute('label', /^SPECI \d{2}:22Z$/);
  await expect(page.locator('#debrief-report-ticks option[label^="METAR"]').first()).toHaveAttribute('label', /^METAR \d{2}:00Z$/);
  expect(await page.locator('#debrief-report-ticks option[label^="SPECI"]').evaluateAll((opts) => opts.every((o) => new Date(Number(o.value) * 1000).getUTCMinutes() === 22))).toBe(true);

  // Jump to the SPECI's own minute: it's in force from then, decoded.
  const speciT = await page.locator('#debrief-report-ticks option').evaluateAll((opts) => opts.map((o) => Number(o.value)))
    .then((ts) => ts.find((t) => new Date(t * 1000).getUTCMinutes() === 22));
  expect(speciT).toBeDefined();
  await scrubber.fill(String(speciT));
  // The line's own words say SPECI; a routine report has no prefix.
  await expect(line.locator('.debrief-metar-text')).toHaveText(/^SPECI CYMJ \d{2}22Z \(at this moment\) · IFR · wind 280\/18 kt · vis 2 SM · -SHRA · OVC008 · 09\/08 · A2991$/);
  await expect(line).toHaveAttribute('data-category', 'IFR');
  // The report as sent, a click away, as text.
  await line.getByText('Report as sent').click();
  await expect(line.locator('.debrief-metar-raw')).toHaveText(/^(SPECI )?CYMJ \d{6}Z /);

  // Another airfield by hand: its own fetch, once.
  await page.getByRole('button', { name: 'Weather' }).click();
  await page.getByLabel('METAR from').selectOption({ label: 'CYQR Regina' });
  await expect(line.locator('.debrief-metar-text')).toHaveText(/CYQR \d{4}Z/);
  const stations = (types) => asked.filter((u) => new URL(u).searchParams.getAll('report_type').join() === types).map((u) => new URL(u).searchParams.get('station'));
  expect(stations('3,4')).toEqual(['CYMJ', 'CYQR']);
  await expect.poll(() => stations('4')).toEqual(['CYMJ', 'CYQR']);

  // Off again: the line and the ticks go.
  await page.getByLabel('METAR', { exact: true }).uncheck();
  await expect(line).toBeHidden();
  await expect(scrubber).not.toHaveAttribute('list', /./);
});

// NASA GIBS GOES-West tiles, served here as a 1 × 1 green picture so no test needs the network.
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/**';

test('satellite weather: off at first, "not kept" after 90 days, then GOES frames for the playback time (SPEC-debrief: Weather)', async ({ page }) => {
  const asked = [];
  await page.route(GIBS, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: GREEN_TILE });
  });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const credit = page.locator('.map-credit');
  await page.getByRole('button', { name: 'Weather' }).click();
  // The example flight is from 2026-06-02; NASA keeps about 90 days, so today it's gone.
  await page.getByLabel('Satellite (GOES-West)').check();
  await expect(credit).toHaveText('Satellite not kept: NASA keeps about 90 days of pictures.');
  expect(asked).toEqual([]);
  await page.getByLabel('Satellite (GOES-West)').uncheck();
  await expect(credit).toBeHidden();

  // A week after the flight, the frames are there: the one at or before the playback time.
  await page.clock.setFixedTime(new Date('2026-06-09T12:00:00Z'));
  await page.getByLabel('Satellite (GOES-West)').check();
  await expect(credit).toHaveText(/^Satellite \d{2}:\d0Z, (at this moment|\d+ min before) · NASA GIBS, GOES-West$/, { timeout: 10_000 });
  await expect.poll(() => pixelsNear(page, [0, 200, 60]), { timeout: 10_000 }).toBeGreaterThan(10_000);
  expect(asked.length).toBeGreaterThan(0);
  for (const url of asked) {
    const m = url.match(/\/GOES-West_ABI_GeoColor\/default\/2026-06-02T(\d{2}):(\d{2}):00Z\/GoogleMapsCompatible_Level7\/(\d+)\/\d+\/\d+\.png$/);
    expect(m, url).not.toBeNull();
    expect(Number(m[2]) % 10).toBe(0); // on the ten-minute marks
    expect(Number(m[3])).toBeLessThanOrEqual(7); // GeoColor stops at zoom 7
  }
  // Infrared is its own layer, stopping at zoom 6.
  const before = asked.length;
  await page.getByLabel('Satellite picture').selectOption({ label: 'Infrared' });
  await expect.poll(() => asked.length).toBeGreaterThan(before);
  expect(asked.slice(before).every((u) => /Band13_Clean_Infrared\/default\/.*\/GoogleMapsCompatible_Level6\/[0-6]\//.test(u))).toBe(true);
});

// Open-Meteo's archive of past model runs, answered here with the same wind at
// every level (270°/20 kt from 500 m to 8 km) for every hour asked, so no test
// needs the network.
const OPEN_METEO = 'https://historical-forecast-api.open-meteo.com/**';
function openMeteoReply(url) {
  const q = new URL(url).searchParams;
  const levels = [925, 850, 800, 700, 600, 500, 400];
  const heights = [500, 1400, 1900, 3000, 4200, 5600, 8000];
  const time = [];
  for (let ms = Date.parse(`${q.get('start_date')}T00:00Z`); ms <= Date.parse(`${q.get('end_date')}T23:00Z`); ms += 3_600_000) {
    time.push(new Date(ms).toISOString().slice(0, 16));
  }
  const hourly = { time };
  levels.forEach((p, i) => {
    hourly[`wind_speed_${p}hPa`] = time.map(() => 20);
    hourly[`wind_direction_${p}hPa`] = time.map(() => 270);
    hourly[`geopotential_height_${p}hPa`] = time.map(() => heights[i]);
  });
  return JSON.stringify({ hourly });
}

test('winds aloft: off at first, fetched only when on, the model wind at Lead\'s altitude on its own line under Lead\'s (SPEC-debrief: Weather)', async ({ page }) => {
  const asked = [];
  await page.route(OPEN_METEO, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: openMeteoReply(route.request().url()) });
  });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const leadLine = page.locator('.formation-card li', { hasText: 'est. IAS' });
  const wind = page.locator('.formation-card li.lead-wind');
  await expect(leadLine).toBeVisible();
  await expect(wind).toHaveCount(0);
  await expect(leadLine).toContainText('est. IAS (no wind)'); // F1: the Lead line says so while there is no model wind
  expect(asked).toEqual([]); // nothing fetched while it's off (R5)

  await page.getByRole('button', { name: 'Weather' }).click();
  await page.getByLabel('Winds aloft (model)').check();
  // On the ramp Lead is under the lowest model level above the field: no blended below-ground wind (W4).
  await expect(wind).toHaveText("no HRDPS wind at 1,900 ft (below the model's lowest level: see the METAR)");
  await expect(leadLine).toContainText('est. IAS (no wind)');
  const scrubber = page.getByLabel('Flight time');
  await scrubber.fill(String(Number(await scrubber.inputValue()) + 1750));
  // Its own line straight after Lead's, so the verdict's words are not lengthened (W2).
  await expect(wind).toHaveText(/^model wind 270°T\/20 kt at [\d,]+ ft \(HRDPS \d{2}(–\d{2})?Z, Open-Meteo\)$/);
  // F1: with that wind, Lead's est. IAS is wind-corrected, and says so.
  await expect(leadLine).toContainText(/est\. IAS \(wind-corrected\)/);
  await expect(leadLine).not.toContainText('model wind');
  await expect(leadLine.locator('xpath=following-sibling::li[1]')).toHaveClass(/lead-wind/);
  expect(asked).toHaveLength(1);
  const q = new URL(asked[0]).searchParams;
  expect(q.get('models')).toBe('gem_hrdps_continental');
  expect(q.get('wind_speed_unit')).toBe('kn');

  // A neutral tone: never the Lead verdict's green or yellow.
  const colours = await page.evaluate(() => {
    const of = (el) => getComputedStyle(el).color;
    const probe = (token) => {
      const el = document.createElement('span');
      el.style.color = `var(${token})`;
      document.body.append(el);
      const c = of(el);
      el.remove();
      return c;
    };
    return { wind: of(document.querySelector('.formation-card li.lead-wind')), good: probe('--good'), caution: probe('--caution') };
  });
  expect(colours.wind).not.toBe(colours.good);
  expect(colours.wind).not.toBe(colours.caution);

  // Short enough not to run to many rows in the narrow column (W2).
  const rows = await wind.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(rows).toBeLessThanOrEqual(3);

  // The other model: its own fetch, once.
  await page.getByLabel('Wind model').selectOption({ label: 'HRRR (US, from 2018)' });
  await expect(wind).toHaveText(/\(HRRR \d{2}(–\d{2})?Z, Open-Meteo\)$/);
  expect(asked.map((u) => new URL(u).searchParams.get('models'))).toEqual(['gem_hrdps_continental', 'ncep_hrrr_conus']);

  // Off again: the words go.
  await page.getByLabel('Winds aloft (model)').uncheck();
  await expect(wind).toHaveCount(0);
  await expect(leadLine).toContainText('est. IAS (no wind)');
});

// Wind arrows on the 2D map (task 12e-2): Open-Meteo answers the grid's one request with a list, one reply per point.
function openMeteoGridReply(url) {
  const q = new URL(url).searchParams;
  const base = JSON.parse(openMeteoReply(url));
  const lats = q.get('latitude').split(',');
  const lons = q.get('longitude').split(',');
  return JSON.stringify(lats.length > 1 ? lats.map((lat, i) => ({ ...base, latitude: Number(lat), longitude: Number(lons[i]) })) : base);
}

// The arrows' colour (the ui-kit's --text-muted, #9bb8c6), as it is on the canvas: counted only where it is
// solid, since the grid's faint lines are the same colour at 16 % (the canvas is transparent under them).
const ARROW_RGB = [155, 184, 198];
const arrowPixels = (page) => page.locator('canvas.debrief-2d').evaluate((canvas, rgb) => {
  const { data, width } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let n = 0;
  let sx = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200 && Math.abs(data[i] - rgb[0]) < 6 && Math.abs(data[i + 1] - rgb[1]) < 6 && Math.abs(data[i + 2] - rgb[2]) < 6) {
      n++;
      sx += (i / 4) % width;
    }
  }
  return { n, x: n ? sx / n : 0 };
}, ARROW_RGB);

test('wind arrows: off at first, one request for nine points when on, a caption, arrows at the chosen height, none where the model has none (SPEC-debrief: Winds aloft)', async ({ page }) => {
  const asked = [];
  await page.route(OPEN_METEO, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: openMeteoGridReply(route.request().url()) });
  });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const scrubber = page.getByLabel('Flight time');
  const at = Number(await scrubber.getAttribute('min')) + 1750;
  await scrubber.fill(String(at));
  const hour = new Date(at * 1000).getUTCHours();
  const two = (n) => String(n % 24).padStart(2, '0');
  const hours = at % 3600 === 0 ? `${two(hour)}Z` : `${two(hour)}–${two(hour + 1)}Z`;
  const caption = page.locator('.map-credit');
  const note = page.locator('#debrief-wind-arrow-status');
  await expect(caption).toBeHidden();
  const before = (await arrowPixels(page)).n;
  expect(asked).toEqual([]); // nothing is fetched while it's off (R5)

  await page.getByRole('button', { name: 'Weather' }).click();
  await expect(page.getByLabel('Wind arrows (model)')).not.toBeChecked();
  await expect(page.getByLabel('Wind arrow height')).toHaveValue('8000');
  await expect(page.getByLabel('Winds aloft (model)')).not.toBeChecked(); // arrows need nothing from the Lead line's item
  await page.getByLabel('Wind arrows (model)').check();
  await expect(caption).toHaveText(`Model wind at 8,000 ft (HRDPS ${hours}, Open-Meteo)`);
  await expect(note).toHaveText('9 of 9 points have model wind');
  // The status line is read with the height box (its own range message stays too).
  const describedBy = (await page.getByLabel('Wind arrow height').getAttribute('aria-describedby')).split(' ');
  expect(describedBy).toContain(await note.getAttribute('id'));
  expect(describedBy).toHaveLength(2);
  // One request, for all nine points, in the Lead line's form; and no Lead line.
  expect(asked).toHaveLength(1);
  const q = new URL(asked[0]).searchParams;
  expect(q.get('latitude').split(',')).toHaveLength(9);
  expect(q.get('longitude').split(',')).toHaveLength(9);
  expect([...q.get('latitude').split(','), ...q.get('longitude').split(',')].every((v) => /^-?\d+\.\d\d$/.test(v))).toBe(true);
  expect(q.get('models')).toBe('gem_hrdps_continental');
  await expect(page.locator('.formation-card li.lead-wind')).toHaveCount(0);
  await expect.poll(async () => (await arrowPixels(page)).n).toBeGreaterThan(before + 200);
  const drawn = (await arrowPixels(page)).n;

  // Moving the map moves the arrows with it.
  const centre = async () => (await arrowPixels(page)).x;
  const x0 = await centre();
  await page.keyboard.press('Escape');
  // For the report: WIND_ARROWS_SHOT=<file> keeps a picture of the map with the arrows on.
  if (process.env.WIND_ARROWS_SHOT) await page.locator('.debrief-map-wrap').screenshot({ path: process.env.WIND_ARROWS_SHOT });
  const box = await page.locator('canvas.debrief-2d').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await centre()) - x0).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Fit' }).click();
  await expect.poll(async () => Math.abs((await centre()) - x0)).toBeLessThan(2);

  // A height under the model's lowest level above the ground has no wind: nothing drawn, and the status says why. No new request.
  await page.getByRole('button', { name: 'Weather' }).click();
  await page.getByLabel('Wind arrow height').fill('2000');
  await expect(note).toHaveText("no model wind at 2,000 ft here (below the model's lowest level)");
  await expect(caption).toBeHidden();
  await expect.poll(async () => (await arrowPixels(page)).n).toBeLessThan(drawn / 2);
  await page.getByLabel('Wind arrow height').fill('12500');
  await expect(caption).toHaveText(`Model wind at 12,500 ft (HRDPS ${hours}, Open-Meteo)`);
  expect(asked).toHaveLength(1);
  // A height between the steps is drawn at the nearest step, and the box says so (re-check of #213, W2).
  await page.getByLabel('Wind arrow height').fill('8250');
  await page.getByLabel('Wind arrow height').press('Tab');
  await expect(page.getByLabel('Wind arrow height')).toHaveValue('8500');
  await expect(caption).toHaveText(`Model wind at 8,500 ft (HRDPS ${hours}, Open-Meteo)`);
  // A refused height keeps what was typed and its warning; a part of it saved on the way is not written back.
  await page.getByLabel('Wind arrow height').fill('');
  await page.getByLabel('Wind arrow height').pressSequentially('31234');
  await page.getByLabel('Wind arrow height').press('Tab');
  await expect(page.getByLabel('Wind arrow height')).toHaveValue('31234');
  await expect(page.getByLabel('Wind arrow height')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Wind arrow height').fill('8500');
  await page.getByLabel('Wind arrow height').press('Tab');
  await expect(page.getByLabel('Wind arrow height')).toHaveValue('8500');
  // The arrows' checkbox sits on the same row as its height box (re-check of #213, W5).
  const rowOf = async (label) => Math.round((await page.getByLabel(label).boundingBox()).y);
  expect(Math.abs((await rowOf('Wind arrows (model)')) - (await rowOf('Wind arrow height')))).toBeLessThan(24);
  await page.getByLabel('Wind arrow height').fill('12500');
  await expect(caption).toHaveText(`Model wind at 12,500 ft (HRDPS ${hours}, Open-Meteo)`);

  // The model choice is shared with the Lead line: the other model is its own single request.
  await page.getByLabel('Wind model').selectOption({ label: 'HRRR (US, from 2018)' });
  await expect(caption).toHaveText(`Model wind at 12,500 ft (HRRR ${hours}, Open-Meteo)`);
  expect(asked.map((u) => new URL(u).searchParams.get('models'))).toEqual(['gem_hrdps_continental', 'ncep_hrrr_conus']);

  // Off again: the words and the arrows go, and nothing more is asked.
  await page.getByLabel('Wind arrows (model)').uncheck();
  await expect(caption).toBeHidden();
  await expect(note).toBeHidden();
  await expect.poll(async () => (await arrowPixels(page)).n).toBeLessThanOrEqual(before + 50);
  expect(asked).toHaveLength(2);
});

test('wind arrows: an answer that is not wind data is said in the menu (not blamed on the connection), and turning the item off and on asks again (a 429 or 500 is in the unit tests, as the browser logs it as an error)', async ({ page }) => {
  let answer = 'html';
  const asked = [];
  await page.route(OPEN_METEO, (route) => {
    asked.push(route.request().url());
    return answer === 'wind'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: openMeteoGridReply(route.request().url()) })
      : route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: '<html>oops</html>' });
  });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await page.getByRole('button', { name: 'Weather' }).click();
  await page.getByLabel('Wind arrows (model)').check();
  await expect(page.locator('#debrief-wind-arrow-status')).toHaveText("HRDPS winds: Open-Meteo's answer wasn't wind data. Turn Wind arrows off and on to try again.");
  await expect(page.locator('.map-credit')).toBeHidden();
  answer = 'wind';
  await page.getByLabel('Wind arrows (model)').uncheck();
  await page.getByLabel('Wind arrows (model)').check();
  await expect(page.locator('#debrief-wind-arrow-status')).toHaveText('9 of 9 points have model wind');
  expect(asked).toHaveLength(2);
});

test('wind arrows: in 3D nothing is fetched and the menu says they show in 2D only; back in 2D one request is made (SPEC-debrief: Winds aloft)', async ({ page }) => {
  const asked = [];
  await page.route(OPEN_METEO, (route) => {
    asked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: openMeteoGridReply(route.request().url()) });
  });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  await page.getByText('3D', { exact: true }).click();
  await expect(page.locator('canvas.debrief-3d')).toBeVisible();
  await page.getByRole('button', { name: 'Weather' }).click();
  await page.getByLabel('Wind arrows (model)').check();
  const note = page.locator('#debrief-wind-arrow-status');
  await expect(note).toHaveText('Wind arrows show in the 2D map only.');
  await expect(page.locator('.map-credit')).toBeHidden();
  // The status is drawn in the same step as the check, so a request would already be out.
  expect(asked).toEqual([]);
  // A height change in 3D still asks for nothing.
  await page.getByLabel('Wind arrow height').fill('10000');
  await expect(note).toHaveText('Wind arrows show in the 2D map only.');
  expect(asked).toEqual([]);

  await page.getByText('2D', { exact: true }).click();
  await expect(page.locator('canvas.debrief-2d')).toBeVisible();
  await expect(page.locator('.map-credit')).toHaveText(/^Model wind at 10,000 ft \(HRDPS \d{2}(–\d{2})?Z, Open-Meteo\)$/);
  expect(asked).toHaveLength(1);
  expect(new URL(asked[0]).searchParams.get('latitude').split(',')).toHaveLength(9);
  // Round again: 3D drops the caption, and 2D brings it back from what it has, with no second request.
  await page.getByText('3D', { exact: true }).click();
  await expect(page.locator('.map-credit')).toBeHidden();
  await page.getByText('2D', { exact: true }).click();
  await expect(page.locator('.map-credit')).toBeVisible();
  expect(asked).toHaveLength(1);
});

// RC-1 (verification re-check 195): from the 1280 px floor up (D183), an open toolbar menu
// stays over the map: it never makes the page scroll sideways, leaves the window, or
// covers a control in the Flight or Formation column. Measured for the one menu that is open.
// Returns how many column controls lie within the menu's vertical span, so a caller can tell
// the check had something to cover (a menu that spans no control can't fail it).
async function expectMenuOverMapOnly(page, label) {
  const found = await page.evaluate(() => {
    const body = [...document.querySelectorAll('.debrief-menu-body')].find((el) => !el.hidden);
    if (!body) return { error: 'no menu is open' };
    const box = body.getBoundingClientRect();
    const map = document.querySelector('.debrief-map-wrap').getBoundingClientRect();
    const visible = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]') && !el.classList.contains('visually-hidden');
    const name = (el) => el.textContent.trim().slice(0, 30) || el.getAttribute('aria-label') || el.tagName;
    const controls = [...document.querySelectorAll('.debrief-col button, .debrief-col input, .debrief-col select, .debrief-col summary, .debrief-col a[href], .debrief-col label.button')]
      .filter(visible)
      .map((el) => ({ name: name(el), r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.top < box.bottom && r.bottom > box.top);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      box: { left: box.left, right: box.right, bottom: box.bottom },
      map: { left: map.left, right: map.right, bottom: map.bottom },
      spanned: controls.length,
      covered: controls.filter(({ r }) => r.left < box.right && r.right > box.left).map((c) => c.name),
    };
  });
  expect(found.error, label).toBeUndefined();
  expect(found.scrollWidth, `${label}: the page scrolls sideways`).toBeLessThanOrEqual(found.innerWidth);
  expect(found.covered, `${label}: covers controls in a column`).toEqual([]);
  expect(found.box.left, `${label}: leaves the window on the left`).toBeGreaterThanOrEqual(0);
  expect(found.box.right, `${label}: leaves the window on the right`).toBeLessThanOrEqual(found.innerWidth);
  expect(found.box.left, `${label}: starts left of the map`).toBeGreaterThanOrEqual(found.map.left - 1);
  expect(found.box.right, `${label}: runs past the map`).toBeLessThanOrEqual(found.map.right + 1);
  expect(found.box.bottom, `${label}: runs below the map`).toBeLessThanOrEqual(found.map.bottom + 1);
  return found.spanned;
}

for (const size of [{ width: 1280, height: 800 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  test(`at ${size.width} × ${size.height} every toolbar menu opens over the map only, in 2D and in 3D (RC-1)`, async ({ page }) => {
    await page.setViewportSize(size);
    await openRoute(page, '#/debrief');
    await loadExample(page);

    // Each menu in turn, opened and closed. The spans say which menus reached a column control's height.
    const sweep = async (view) => {
      const spans = {};
      const names = (await page.locator('.debrief-toolbar .menu-button:visible').allTextContents()).map((n) => n.trim());
      expect(names.length, `menus in ${view}`).toBeGreaterThanOrEqual(3);
      for (const name of names) {
        const button = page.locator('.debrief-toolbar .menu-button:visible', { hasText: name });
        await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        spans[name] = await expectMenuOverMapOnly(page, `${view} ${name}`);
        await page.keyboard.press('Escape');
        await expect(button).toHaveAttribute('aria-expanded', 'false');
      }
      return spans;
    };
    const switchTo = async (view) => {
      await page.getByText(view, { exact: true }).click();
      await expect(page.locator(view === '3D' ? 'canvas.debrief-3d' : 'canvas.debrief-2d')).toBeVisible();
    };

    // First with the Formation column as it opens (More detail closed), where the Weather menu is as tall as
    // the column's buttons and would cover them: it must span at least one, or the check tests nothing.
    for (const view of ['2D', '3D']) {
      if (view === '3D') await switchTo('3D');
      const spans = await sweep(view);
      expect(spans.Weather, `${view}: the Weather menu spans no control in the columns, so covering one can't be tested`).toBeGreaterThan(0);
    }
    // Then with the column open at its fullest.
    await switchTo('2D');
    await page.getByRole('button', { name: 'More detail' }).click();
    await page.getByRole('button', { name: 'Debrief settings' }).click();
    await sweep('2D, More detail open');
    await switchTo('3D');
    await sweep('3D, More detail open');
  });
}

// A menu that is open while the toolbar or the map changes size stays over the map: the view
// switch from the keyboard hides Fit, Layers and Routes and charts, and a column opened from
// the keyboard narrows the map (audit Y1). Neither is a window resize.
test('an open menu stays over the map when the view is switched from the keyboard (RC-1)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const weather = page.getByRole('button', { name: 'Weather' });
  await weather.focus();
  await page.keyboard.press('Enter');
  await expect(weather).toHaveAttribute('aria-expanded', 'true');
  await expectMenuOverMapOnly(page, '2D Weather');
  await page.getByRole('radio', { name: '3D' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('canvas.debrief-3d')).toBeVisible();
  await expect(weather).toHaveAttribute('aria-expanded', 'true');
  await expectMenuOverMapOnly(page, '3D Weather after the keyboard switch');
  await page.getByRole('radio', { name: '2D' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('canvas.debrief-2d')).toBeVisible();
  await expectMenuOverMapOnly(page, '2D Weather after switching back');
});

test('an open menu stays over the map when a column is opened from the keyboard (RC-1)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const column = page.locator('.debrief-col-formation .panel-toggle').first();
  await column.focus();
  await page.keyboard.press('Enter'); // closes the column, so the map takes its room
  const wide = await page.locator('.debrief-map-wrap').evaluate((el) => el.getBoundingClientRect().width);
  const weather = page.getByRole('button', { name: 'Weather' });
  await weather.focus();
  await page.keyboard.press('Enter');
  await expect(weather).toHaveAttribute('aria-expanded', 'true');
  await column.focus();
  await page.keyboard.press('Enter'); // opens it again, over the room the menu was using
  await expect.poll(() => page.locator('.debrief-map-wrap').evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(wide);
  await expect(weather).toHaveAttribute('aria-expanded', 'true');
  await expectMenuOverMapOnly(page, 'Weather after the Formation column opened');
});

// RC-3: the message that 3D can't start sits by the 2D | 3D switch that was just pressed,
// not in the Flight column and not on the red file-error line.
async function expectNextToViewSwitch(page, text) {
  const message = page.locator('.debrief-toolbar').getByRole('alert');
  await expect(message).toHaveText(text);
  await expect(page.locator('.debrief-message')).toBeHidden();
  const near = await page.evaluate(() => {
    const sw = document.querySelector('.debrief-toolbar .view-switch').getBoundingClientRect();
    const m = document.querySelector('.debrief-toolbar [role="alert"]').getBoundingClientRect();
    const dx = Math.max(0, sw.left - m.right, m.left - sw.right);
    const dy = Math.max(0, sw.top - m.bottom, m.top - sw.bottom);
    return Math.hypot(dx, dy);
  });
  expect(near).toBeLessThanOrEqual(100);
}

// When 3D can't start, the screen says why and goes back to 2D (D141).
test.describe('3D that cannot start', () => {
  // The service worker would answer for the chunk, and page.route would never see the request.
  test.use({ serviceWorkers: 'block' });

  test('three.js does not load: says 3D needs a connection and goes back to 2D', async ({ page }) => {
    // A script that throws fails the import without the browser's own error line (abort() would log ERR_FAILED).
    await page.route(/three\.module-.*\.js$/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: "throw new Error('three blocked by test');" }));
    await openRoute(page, '#/debrief');
    await loadExample(page);
    await page.getByText('3D', { exact: true }).click();
    await expectNextToViewSwitch(page, /3D needs a connection/);
    await expect(page.locator('canvas.debrief-2d')).toBeVisible();
    await expect(page.locator('canvas.debrief-3d')).toBeHidden();
  });

  // A browser keeps a failed module fetch for the life of the page, so "three.js arrives on the second try" can't
  // be shown here. The second try that can work is the graphics context: the first is refused (three.js logs
  // that, which the test swallows), the next is given. The old message must go when 3D is tried again.
  test('trying 3D again clears the old message and works once the graphics context is given (RC-3)', async ({ page }) => {
    await page.addInitScript(() => {
      let refused = false;
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl2' && this.classList.contains('debrief-3d-picture') && !refused) {
          refused = true;
          return null;
        }
        return getContext.call(this, type, ...rest);
      };
      const error = console.error;
      console.error = (...args) => {
        if (!refused || !String(args[0]).startsWith('THREE.WebGLRenderer')) error.apply(console, args);
      };
    });
    await openRoute(page, '#/debrief');
    await loadExample(page);
    const alert = page.locator('.debrief-toolbar').getByRole('alert');
    await page.getByText('3D', { exact: true }).click();
    await expectNextToViewSwitch(page, /3D needs WebGL 2/);
    await expect(page.locator('canvas.debrief-3d')).toBeHidden();
    await page.getByText('3D', { exact: true }).click();
    await expect(alert).toBeHidden();
    await expect(page.locator('canvas.debrief-3d')).toBeVisible();
    await expect(page.locator('canvas.debrief-3d-picture')).toBeVisible();
    // The second try worked, so nothing brings the message back.
    await page.getByRole('button', { name: 'Ahead 1 second' }).click();
    await expect(alert).toBeHidden();
  });

  test('no WebGL 2 (WebGL 1 only): says 3D needs WebGL 2 and goes back to 2D, with no console error', async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === 'webgl2') return null;
        return getContext.call(this, type, ...rest);
      };
    });
    await openRoute(page, '#/debrief');
    await loadExample(page);
    await page.getByText('3D', { exact: true }).click();
    await expectNextToViewSwitch(page, /3D needs WebGL 2/);
    await expect(page.locator('canvas.debrief-2d')).toBeVisible();
    await expect(page.locator('canvas.debrief-3d')).toBeHidden();
  });
});

// --- Saved radar and lightning (SPEC-debrief: Saved radar and lightning, task 12f) ---------------------
// ECCC GeoMet is answered here with the shape its replies have: a layer's time list for GetCapabilities and
// small handmade pictures (a half each, so a test can tell the layers apart) for GetMap. No test needs the network.
const ECCC = 'https://geo.weather.gc.ca/**';
const ecccPicture = (name) => readFileSync(new URL(`../fixtures/debrief/${name}`, import.meta.url));
const ECCC_PICTURES = { RADAR_1KM_RRAI: ecccPicture('eccc-rain.png'), RADAR_1KM_RSNO: ecccPicture('eccc-snow.png'), 'Lightning_2.5km_Density': ecccPicture('eccc-lightning.png') };
const ECCC_CORS = { 'access-control-allow-origin': '*' };
const RAIN_RGB = [200, 0, 200]; // the left half of a rain picture
const SNOW_RGB = [0, 220, 220];
const LIGHTNING_RGB = [255, 220, 0]; // the bottom half of a lightning picture
const hhmm = (t) => new Date(t * 1000).toISOString().slice(11, 16);

/**
 * Routes ECCC. now(): the browser's clock in seconds (ECCC's lists end at the last half hour before it and reach back
 * 3 hours). hold: { promise } to keep every picture back until it settles. Returns the list of addresses asked.
 */
async function stubEccc(page, { now, hold } = {}) {
  const asked = [];
  await page.route(ECCC, async (route) => {
    const url = route.request().url();
    asked.push({ url, method: route.request().method() });
    const q = new URL(url).searchParams;
    try {
      if (q.get('request') === 'GetCapabilities') {
        const name = q.get('layer');
        const end = Math.floor(now() / 1800) * 1800; // a multiple of both 6 and 10 minutes
        const iso = (t) => new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
        const period = name === 'Lightning_2.5km_Density' ? 'PT10M' : 'PT6M';
        const body = `<WMS_Capabilities><Capability><Layer><Layer><Name>${name}</Name><Dimension name="time" units="ISO8601" default="${iso(end)}" nearestValue="0">${iso(end - 10800)}/${iso(end)}/${period}</Dimension></Layer></Layer></Capability></WMS_Capabilities>`;
        return await route.fulfill({ status: 200, contentType: 'text/xml', headers: ECCC_CORS, body });
      }
      if (hold) await hold.promise;
      return await route.fulfill({ status: 200, contentType: 'image/png', headers: ECCC_CORS, body: ECCC_PICTURES[q.get('layers')] });
    } catch {
      // The page gave the request up (cancelled, or the page closed) before the answer was sent.
    }
  });
  return asked;
}

// The flight's window from the scrubber, and the clock set to `afterS` seconds after it ends.
async function flightWindow(page) {
  const scrubber = page.getByLabel('Flight time');
  return { scrubber, startT: Number(await scrubber.getAttribute('min')), endT: Number(await scrubber.getAttribute('max')) };
}
const setNow = (page, t) => page.clock.setFixedTime(new Date(t * 1000));
const savedWxStatus = (page) => page.locator('#debrief-saved-wx-status');
const saveWxButton = (page) => page.getByRole('button', { name: 'Save radar and lightning with this debrief' });
// Opens the Weather menu if it isn't (a click anywhere else closes it).
async function openWeather(page) {
  const button = page.getByRole('button', { name: 'Weather' });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
const KEPT_LINE = /^Kept with this debrief: (\d+) radar and lightning pictures, (\d\d:\d\d)Z to (\d\d:\d\d)Z\./;

test('saved radar and lightning: offered for a flight that ended an hour ago, fetched, saved in the file, and played back with no request after reopening', async ({ page }) => {
  let nowT = 0;
  const asked = await stubEccc(page, { now: () => nowT });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, startT, endT } = await flightWindow(page);
  nowT = endT + 3600; // "ended 1 hour ago"
  await setNow(page, nowT);
  await scrubber.fill(String(startT + 25 * 60)); // draws again with the new clock, at a moment inside the flight
  const credit = page.locator('.map-credit');
  await openWeather(page);

  // Offered, off at first, and nothing is fetched by ticking the items (R5): only the button fetches.
  await expect(saveWxButton(page)).toBeVisible();
  await expect(savedWxStatus(page)).toHaveText('ECCC keeps radar for only 3 hours after a flight.');
  // What the button does is its description (and tooltip), not a second line in the menu (F1).
  await expect(saveWxButton(page)).toHaveAccessibleDescription(/only 3 hours after a flight\. This fetches every picture from the flight and keeps them in the debrief file\./);
  await expect(saveWxButton(page)).toHaveAttribute('title', 'This fetches every picture from the flight and keeps them in the debrief file.');
  await expect(page.getByLabel('Radar', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Lightning', { exact: true })).not.toBeChecked();
  await page.getByLabel('Radar', { exact: true }).check();
  await expect(credit).toHaveText('Radar not saved yet: see Weather.');
  expect(asked).toEqual([]);

  // Fetch: every frame covering the flight, as plain GETs to ECCC, the exact times, plain latitude and longitude.
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText(new RegExp(`${KEPT_LINE.source} Save the debrief to put them in the file\\.$`), { timeout: 20_000 });
  await expect(saveWxButton(page)).toBeHidden();
  const [, count, firstHm, lastHm] = (await savedWxStatus(page).textContent()).match(KEPT_LINE);
  expect(asked.every((a) => a.method === 'GET')).toBe(true);
  const maps = asked.map((a) => new URL(a.url).searchParams).filter((q) => q.get('request') === 'GetMap');
  expect(maps.length).toBe(Number(count));
  expect(maps.every((q) => q.get('crs') === 'EPSG:4326' && q.get('format') === 'image/png' && /^\d+$/.test(q.get('width')))).toBe(true);
  const times = (layer) => maps.filter((q) => q.get('layers') === layer).map((q) => Date.parse(q.get('time')) / 1000).sort((a, b) => a - b);
  const rain = times('RADAR_1KM_RRAI');
  const lightning = times('Lightning_2.5km_Density');
  expect(rain.length).toBeGreaterThan(5);
  expect(times('RADAR_1KM_RSNO').length).toBe(rain.length);
  expect(rain.every((t) => t % 360 === 0) && lightning.every((t) => t % 600 === 0)).toBe(true);
  // The last at or before the start, then every step to the end: the whole flight is covered.
  expect(rain[0]).toBeLessThanOrEqual(startT);
  expect(rain[0]).toBeGreaterThan(startT - 360);
  expect(rain.at(-1)).toBeLessThanOrEqual(endT);
  expect(rain.at(-1)).toBeGreaterThan(endT - 360);
  expect(lightning[0]).toBeLessThanOrEqual(startT);
  expect(lightning.at(-1)).toBeLessThanOrEqual(endT);
  expect(hhmm(Math.min(rain[0], lightning[0]))).toBe(firstHm);
  const box = maps[0].get('bbox').split(',').map(Number); // south, west, north, east
  expect(box[2] - box[0]).toBeGreaterThan(1); // the formation's box and 30 NM (0.5°) each side
  expect(new Set(maps.map((q) => q.get('bbox'))).size).toBe(1);
  expect(hhmm(Math.max(rain.at(-1), lightning.at(-1)))).toBe(lastHm);

  // The pictures draw, each the last frame at or before the playback moment.
  await page.getByLabel('Lightning', { exact: true }).check();
  const at = Number(await scrubber.inputValue());
  const rainT = Math.floor(at / 360) * 360;
  const lightningT = Math.floor(at / 600) * 600;
  await expect(credit).toHaveText(new RegExp(`^Radar ${hhmm(rainT)}Z, (at this moment|\\d+ min before) · Lightning ${hhmm(lightningT)}Z, (at this moment|\\d+ min before) · Data Source: Environment and Climate Change Canada$`));
  await expect.poll(() => pixelsNear(page, RAIN_RGB), { timeout: 10_000 }).toBeGreaterThan(200);
  await expect.poll(() => pixelsNear(page, SNOW_RGB)).toBeGreaterThan(200);
  await expect.poll(() => pixelsNear(page, LIGHTNING_RGB)).toBeGreaterThan(200);
  // Each item is its own toggle.
  await page.getByLabel('Radar', { exact: true }).uncheck();
  await expect.poll(() => pixelsNear(page, RAIN_RGB)).toBeLessThan(20);
  await expect.poll(() => pixelsNear(page, LIGHTNING_RGB)).toBeGreaterThan(200);
  await expect(credit).toHaveText(new RegExp(`^Lightning ${hhmm(lightningT)}Z, .* · Data Source: Environment and Climate Change Canada$`));
  await page.getByLabel('Radar', { exact: true }).check();

  // Save debrief writes them into the file; closing then asks nothing.
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  const saved = await download.path();
  // Once they are in a saved file the menu no longer asks to save the debrief (F3).
  await expect(savedWxStatus(page)).toHaveText(new RegExp(`${KEPT_LINE.source}$`));
  await expect(savedWxStatus(page)).not.toContainText('Save the debrief');
  const file = JSON.parse(readFileSync(saved, 'utf8'));
  const block = JSON.parse(file.settings.savedWeather);
  expect(block.frames.length).toBe(Number(count));
  expect(block.frames.every((f) => f.mime === 'image/png' && typeof f.data === 'string' && Number.isInteger(f.t))).toBe(true);
  expect(new Set(block.frames.map((f) => f.layer))).toEqual(new Set(['rain', 'snow', 'lightning']));
  let dialogs = 0;
  page.on('dialog', (dialog) => { dialogs++; dialog.dismiss(); });
  await page.getByRole('button', { name: 'Close flight' }).click();
  expect(dialogs).toBe(0);
  await expect(status(page)).toHaveText('No flight loaded');

  // Reopen it long after ECCC's 3 hours: the pictures come from the file, and not one request goes out.
  await setNow(page, endT + 5 * 3600);
  const before = asked.length;
  await page.locator('input[type="file"][accept^=".json"]').setInputFiles(saved);
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  await expect(scrubber).toHaveValue(String(startT + 25 * 60));
  await expect(credit).toHaveText(new RegExp(`^Radar ${hhmm(rainT)}Z, .* · Lightning ${hhmm(lightningT)}Z, .* · Data Source: Environment and Climate Change Canada$`));
  await expect.poll(() => pixelsNear(page, RAIN_RGB), { timeout: 10_000 }).toBeGreaterThan(200);
  await expect.poll(() => pixelsNear(page, LIGHTNING_RGB)).toBeGreaterThan(200);
  await openWeather(page);
  await expect(savedWxStatus(page)).toHaveText(new RegExp(`${KEPT_LINE.source}$`));
  await expect(savedWxStatus(page)).not.toContainText('Save the debrief');
  await expect(saveWxButton(page)).toBeHidden(); // nothing to offer: the flight is old and the pictures are kept
  // Playing and scrubbing through the flight fetches nothing.
  await scrubber.fill(String(endT));
  await scrubber.fill(String(startT));
  await page.getByRole('button', { name: 'Ahead 1 second' }).click();
  expect(asked.length).toBe(before);
});

test('saved radar: a fetch shows its progress and can be cancelled, and closing before the file is saved asks first', async ({ page }) => {
  let nowT = 0;
  let release;
  const hold = { promise: new Promise((resolve) => { release = resolve; }) };
  const asked = await stubEccc(page, { now: () => nowT, hold });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, endT } = await flightWindow(page);
  nowT = endT + 3600;
  await setNow(page, nowT);
  await scrubber.fill(String(endT - 60));
  await openWeather(page);

  // Held back: the line counts, and the button is Cancel.
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText(/^Saving radar and lightning: 0 of \d+$/);
  await expect(page.locator('#debrief-saved-wx')).toHaveText('Cancel');
  await page.locator('#debrief-saved-wx').click();
  await expect(saveWxButton(page)).toBeVisible();
  await expect(savedWxStatus(page)).toHaveText(/^ECCC keeps radar for only 3 hours/);
  release();
  const askedAtCancel = asked.length;
  await scrubber.fill(String(endT - 120)); // the page draws again, and nothing was kept
  await expect(savedWxStatus(page)).not.toContainText('Kept');
  expect(asked.length).toBe(askedAtCancel);

  // Try again; this time it completes.
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText(KEPT_LINE, { timeout: 20_000 });

  // The pictures aren't in a file yet, and can't be fetched again after 3 hours: leaving the page asks,
  const leaveAsks = () => page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(await leaveAsks()).toBe(true);
  // switching to another tool asks, and Cancel keeps the Debrief and its pictures,
  page.once('dialog', (dialog) => { expect(dialog.message()).toMatch(/^Leave the Debrief\? The radar and lightning/); dialog.dismiss(); });
  await page.evaluate(() => { location.hash = '#/sof'; });
  await expect(page).toHaveURL(/#\/debrief$/);
  await expect(savedWxStatus(page)).toHaveText(KEPT_LINE);
  // and closing the flight asks.
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const messages = [];
  page.once('dialog', (dialog) => { messages.push(dialog.message()); dialog.dismiss(); });
  await page.getByRole('button', { name: 'Close flight' }).click();
  expect(messages).toEqual(["Close this flight? The radar and lightning you saved aren't in a saved debrief file yet, and ECCC can't give them again after 3 hours."]);
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Close flight' }).click();
  await expect(status(page)).toHaveText('No flight loaded');
  expect(await leaveAsks()).toBe(false);
});

test('saved radar: a flight more than 3 hours old says "Not kept", fetches nothing and offers nothing', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, startT, endT } = await flightWindow(page);
  const credit = page.locator('.map-credit');
  await openWeather(page);
  // Just inside the 3 hours it is offered (ECCC is not asked yet, so nothing needs stubbing).
  await setNow(page, endT + 3 * 3600 - 60);
  await scrubber.fill(String(startT + 60));
  await expect(saveWxButton(page)).toBeVisible();
  // Just past it, it is not kept, and the items say so.
  await setNow(page, endT + 3 * 3600 + 60);
  await scrubber.fill(String(startT + 120));
  await expect(saveWxButton(page)).toBeHidden();
  await expect(savedWxStatus(page)).toHaveText('Not kept: radar is only available for 3 hours after the flight.');
  await page.getByLabel('Radar', { exact: true }).check();
  await expect(credit).toHaveText('Not kept: radar is only available for 3 hours after the flight.');
  await page.getByLabel('Lightning', { exact: true }).check();
  await expect(credit).toHaveText('Not kept: radar and lightning are only available for 3 hours after the flight.'); // one line, not two (recheck F1)
  await expect.poll(() => pixelsNear(page, RAIN_RGB)).toBeLessThan(20);
  // Off again: the line goes; the words in the menu stay for the flight.
  await page.getByLabel('Radar', { exact: true }).uncheck();
  await page.getByLabel('Lightning', { exact: true }).uncheck();
  await expect(credit).toBeHidden();
  await expect(savedWxStatus(page)).toBeVisible();
});

test('saved radar: a hostile weather block in a debrief file is left out with a line, and the rest of the debrief opens', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { startT, endT } = await flightWindow(page);
  await setNow(page, endT + 5 * 3600);
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  const file = JSON.parse(readFileSync(await download.path(), 'utf8'));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.__pwned=1"></svg>').toString('base64');
  const box = { minLat: 50, maxLat: 51, minLon: -106, maxLon: -105 };
  const hostile = [
    { layer: 'rain', t: Math.ceil(startT), mime: 'image/svg+xml', data: svg },
    { layer: 'rain', t: Math.ceil(endT) + 86_400, mime: 'image/png', data: ECCC_PICTURES.RADAR_1KM_RRAI.toString('base64') },
    { layer: 'rain', t: Math.ceil(startT), mime: 'image/png', data: `${ECCC_PICTURES.RADAR_1KM_RRAI.toString('base64')}"><script>window.__pwned=2</script>` },
  ];
  await page.getByRole('button', { name: 'Close flight' }).click();
  await expect(status(page)).toHaveText('No flight loaded');
  for (const frame of hostile) {
    const tampered = { ...file, settings: { ...file.settings, savedWeather: JSON.stringify({ v: 1, box, fetchedT: 1, frames: [frame] }) } };
    await page.locator('input[type="file"][accept^=".json"]').setInputFiles({ name: 'hostile.dadsdebrief.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
    await expect(status(page)).toHaveText(/^4 tracks loaded/);
    await expect(page.locator('.debrief-message')).toHaveText(/^The radar and lightning saved in this file couldn't be read \(.*\), so they were left out\. The rest of the debrief is as saved\.$/);
    await openWeather(page);
    await page.getByLabel('Radar', { exact: true }).check();
    await expect.poll(() => pixelsNear(page, RAIN_RGB)).toBeLessThan(20);
    await page.getByLabel('Radar', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Close flight' }).click();
    await expect(status(page)).toHaveText('No flight loaded');
  }
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

const RADAR_LOSS = "Close this flight? The radar and lightning you saved aren't in a saved debrief file yet, and ECCC can't give them again after 3 hours.";

test('saved radar: saving the debrief before the radar is fetched does not count the radar as saved (R1)', async ({ page }) => {
  let nowT = 0;
  await stubEccc(page, { now: () => nowT });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, endT } = await flightWindow(page);
  nowT = endT + 3600;
  await setNow(page, nowT);
  await scrubber.fill(String(endT - 60));
  // Save debrief first: nothing is kept yet, so nothing goes in the file.
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).settings.savedWeather).toBeUndefined();
  // Then the radar is fetched: it is not in any file, so closing must ask.
  await openWeather(page);
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText(KEPT_LINE, { timeout: 20_000 });
  const messages = [];
  page.once('dialog', (dialog) => { messages.push(dialog.message()); dialog.dismiss(); });
  await page.getByRole('button', { name: 'Close flight' }).click();
  expect(messages).toEqual([RADAR_LOSS]);
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
});

test('saved radar: saving the debrief while the fetch is still running does not count the radar as saved (R1)', async ({ page }) => {
  let nowT = 0;
  let release;
  const hold = { promise: new Promise((resolve) => { release = resolve; }) };
  await stubEccc(page, { now: () => nowT, hold });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, endT } = await flightWindow(page);
  nowT = endT + 3600;
  await setNow(page, nowT);
  await scrubber.fill(String(endT - 60));
  await openWeather(page);
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText(/^Saving radar and lightning: 0 of \d+$/);
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).settings.savedWeather).toBeUndefined();
  release();
  await openWeather(page);
  await expect(savedWxStatus(page)).toHaveText(KEPT_LINE, { timeout: 20_000 });
  const messages = [];
  page.once('dialog', (dialog) => { messages.push(dialog.message()); dialog.dismiss(); });
  await page.getByRole('button', { name: 'Close flight' }).click();
  expect(messages).toEqual([RADAR_LOSS]);
});

test('saved radar: replacing the flight (Load tracks, Open debrief, Example flight) asks first while the radar is not in a saved file (Y4)', async ({ page }) => {
  let nowT = 0;
  await stubEccc(page, { now: () => nowT });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, endT } = await flightWindow(page);
  nowT = endT + 3600;
  await setNow(page, nowT);
  await scrubber.fill(String(endT - 60));
  // A debrief file saved before the radar was fetched, to open later.
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  const plain = await download.path();
  await openWeather(page);
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText(KEPT_LINE, { timeout: 20_000 });

  const REPLACE = "Replace this flight? The radar and lightning you saved aren't in a saved debrief file yet, and ECCC can't give them again after 3 hours.";
  const messages = [];
  page.on('dialog', (dialog) => { messages.push(dialog.message()); dialog.dismiss(); });
  const stillHere = async () => {
    await expect(status(page)).toHaveText(/^4 tracks loaded/);
    await expect(savedWxStatus(page)).toHaveText(KEPT_LINE);
  };

  // Declined each time: nothing is replaced, and the pictures are still kept.
  await page.getByRole('button', { name: 'Example flight' }).click();
  await expect.poll(() => messages.length).toBe(1);
  await stillHere();
  await page.locator('input[type="file"][accept^=".json"]').setInputFiles(plain);
  await expect.poll(() => messages.length).toBe(2);
  await stillHere();
  await fileInput(page).setInputFiles([kml('lead.kml')]);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect.poll(() => messages.length).toBe(3);
  await stillHere();
  expect(messages).toEqual([REPLACE, REPLACE, REPLACE]);

  // Accepted: it goes ahead.
  page.removeAllListeners('dialog');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type="file"][accept^=".json"]').setInputFiles(plain);
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  await expect(savedWxStatus(page)).not.toHaveText(KEPT_LINE); // the file had none

  // With the pictures in a saved file, nothing asks: fetch again, save, then replace.
  await openWeather(page);
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText(KEPT_LINE, { timeout: 20_000 });
  const [withRadar] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  let asked = 0;
  page.on('dialog', (dialog) => { asked++; dialog.dismiss(); });
  await page.getByRole('button', { name: 'Example flight' }).click();
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  await page.locator('input[type="file"][accept^=".json"]').setInputFiles(await withRadar.path());
  await expect(status(page)).toHaveText(/^4 tracks loaded/);
  expect(asked).toBe(0);
});

test('saved radar: progress is written once, in the Weather menu, and told to a screen reader only at the start, about every 25 % and at the end (Y5)', async ({ page }) => {
  let nowT = 0;
  const asked = await stubEccc(page, { now: () => nowT });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, endT } = await flightWindow(page);
  nowT = endT + 3600;
  await setNow(page, nowT);
  await scrubber.fill(String(endT - 60));
  await openWeather(page);
  await page.getByLabel('Radar', { exact: true }).check();
  const live = page.locator('#debrief-saved-wx-live');
  await expect(live).toHaveAttribute('role', 'status');
  await expect(page.locator('#debrief-saved-wx-status')).not.toHaveAttribute('role', /./); // the shown line is not itself live
  // What the live region is told, and what the map's line says, while the fetch runs.
  await page.evaluate(() => {
    window.__told = [];
    window.__credit = [];
    const live = document.querySelector('#debrief-saved-wx-live');
    new MutationObserver(() => window.__told.push(live.textContent)).observe(live, { childList: true, characterData: true, subtree: true });
    const credit = document.querySelector('.map-credit');
    new MutationObserver(() => window.__credit.push(credit.textContent)).observe(credit, { childList: true, characterData: true, subtree: true });
  });
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText(KEPT_LINE, { timeout: 20_000 });
  const told = await page.evaluate(() => window.__told);
  const maps = asked.filter((a) => new URL(a.url).searchParams.get('request') === 'GetMap').length;
  expect(maps).toBeGreaterThan(20);
  expect(told.length).toBeLessThanOrEqual(7); // not one for each of the pictures
  expect(told.at(-1)).toMatch(KEPT_LINE);
  expect(told.filter((t) => /^Saving radar and lightning: \d+ of \d+$/.test(t))).toEqual([]);
  expect(told.filter((t) => /percent$/.test(t)).length).toBeLessThanOrEqual(3);
  // The map's own line never carries the progress (it is a live region too).
  const credit = await page.evaluate(() => window.__credit);
  expect(credit.filter((t) => /Saving/.test(t))).toEqual([]);
});

test('saved radar: when the button goes away, keyboard focus moves to the status line instead of being lost (Y6)', async ({ page }) => {
  let nowT = 0;
  await stubEccc(page, { now: () => nowT });
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, endT } = await flightWindow(page);
  nowT = endT + 3600;
  await setNow(page, nowT);
  await scrubber.fill(String(endT - 60));
  await openWeather(page);
  // From the keyboard: focus the button, press Enter. It becomes Cancel (still focused), then goes when the pictures are kept.
  await saveWxButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(savedWxStatus(page)).toHaveText(KEPT_LINE, { timeout: 20_000 });
  await expect(saveWxButton(page)).toBeHidden();
  await expect(savedWxStatus(page)).toBeFocused();
});

test('saved radar: a button left on screen as the 3 hours pass says "Not kept" when pressed and fetches nothing (Y8)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, endT } = await flightWindow(page);
  await setNow(page, endT + 3 * 3600 - 60);
  await scrubber.fill(String(endT - 60));
  await openWeather(page);
  await expect(saveWxButton(page)).toBeVisible();
  // The clock crosses the 3 hours while nothing redraws; the button is still there. No ECCC stub: any request fails the test.
  await setNow(page, endT + 3 * 3600 + 60);
  await expect(saveWxButton(page)).toBeVisible();
  await saveWxButton(page).click();
  await expect(savedWxStatus(page)).toHaveText('Not kept: radar is only available for 3 hours after the flight.');
  await expect(saveWxButton(page)).toBeHidden();
});

// A debrief file saved from the example flight, its saved radar block swapped for `block` (F4).
async function openWithWeatherSetting(page, file, value) {
  const tampered = { ...file, settings: { ...file.settings, savedWeather: value } };
  await page.locator('input[type="file"][accept^=".json"]').setInputFiles({ name: 'tampered.dadsdebrief.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) });
  await expect(status(page)).toHaveText(/^4 tracks loaded/, { timeout: 30_000 });
}
async function savedExampleFile(page) {
  await page.getByRole('button', { name: 'Save, open, CSV' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save debrief' }).click()]);
  return JSON.parse(readFileSync(await download.path(), 'utf8'));
}
const closeFlight = async (page) => {
  await page.getByRole('button', { name: 'Close flight' }).click();
  await expect(status(page)).toHaveText('No flight loaded');
};

test('saved radar: a block over 36 MiB, a setting that is not text and pictures outside the flight are each left out with a line (F4a, F4b)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { startT, endT } = await flightWindow(page);
  await setNow(page, endT + 5 * 3600);
  const file = await savedExampleFile(page);
  await closeFlight(page);
  const message = page.locator('.debrief-message');
  const box = { minLat: 50, maxLat: 51, minLon: -106, maxLon: -105 };
  const rain = ECCC_PICTURES.RADAR_1KM_RRAI.toString('base64');

  // (a) A block a byte over 36 MiB, and one that is not text: the file used to open with no word about either.
  await openWithWeatherSetting(page, file, 'x'.repeat(36 * 1024 * 1024 + 1));
  await expect(message).toHaveText(/^The radar and lightning saved in this file couldn't be read \(it is too big\), so they were left out\. The rest of the debrief is as saved\.$/);
  await closeFlight(page);
  await openWithWeatherSetting(page, file, 12345);
  await expect(message).toHaveText(/couldn't be read \(it is not text\), so they were left out/);
  await closeFlight(page);

  // (b) One picture outside the flight's window in an otherwise good block: kept 1, and the line says one was left out.
  const frames = [{ layer: 'rain', t: Math.ceil(startT), mime: 'image/png', data: rain }, { layer: 'rain', t: 1000, mime: 'image/png', data: rain }];
  await openWithWeatherSetting(page, file, JSON.stringify({ v: 1, box, fetchedT: 1, frames }));
  await expect(message).toHaveText('The saved radar and lightning has 1 picture outside the flight, so it was left out.');
  await openWeather(page);
  await expect(savedWxStatus(page)).toHaveText(/^Kept with this debrief: 1 radar and lightning picture, /);
  await closeFlight(page);
  // Nothing outside: no line.
  await openWithWeatherSetting(page, file, JSON.stringify({ v: 1, box, fetchedT: 1, frames: frames.slice(0, 1) }));
  await expect(message).toBeHidden();
});

// A PNG whose header says 64 by 64 and whose body is nothing: it passes the checks and cannot be decoded.
function undecodablePng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(13);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), length, Buffer.from('IHDR'), ihdr, Buffer.alloc(4), Buffer.alloc(200, 7)]);
}

test('saved radar: a picture that cannot be decoded is not named by the line under the map, and gets no credit (F4c)', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await loadExample(page);
  const { scrubber, startT, endT } = await flightWindow(page);
  await setNow(page, endT + 5 * 3600);
  const file = await savedExampleFile(page);
  await closeFlight(page);
  const box = { minLat: 50, maxLat: 51, minLon: -106, maxLon: -105 };
  const t0 = Math.ceil(startT);
  const frames = [{ layer: 'rain', t: t0, mime: 'image/png', data: undecodablePng().toString('base64') }];
  await openWithWeatherSetting(page, file, JSON.stringify({ v: 1, box, fetchedT: 1, frames }));
  await scrubber.fill(String(t0 + 60));
  const credit = page.locator('.map-credit');
  await openWeather(page);
  await page.getByLabel('Radar', { exact: true }).check();
  await expect(credit).toHaveText("Radar: the picture couldn't be drawn.");
  await expect(credit).not.toContainText('Data Source');
  await expect(credit).not.toContainText(hhmm(t0));
  // A picture that does decode is named as before.
  await closeFlight(page);
  const good = [{ layer: 'rain', t: t0, mime: 'image/png', data: ECCC_PICTURES.RADAR_1KM_RRAI.toString('base64') }];
  await openWithWeatherSetting(page, file, JSON.stringify({ v: 1, box, fetchedT: 1, frames: good }));
  await scrubber.fill(String(t0 + 60));
  await expect(credit).toHaveText(new RegExp(`^Radar ${hhmm(t0)}Z, 1 min before · Data Source: Environment and Climate Change Canada$`));
});

// The Weather menu with a flight under 3 hours old (the saved radar offer showing) and every item ticked is its
// tallest: its bottom row must be readable, not under the line beneath the map, and it must not scroll inside
// (verification re-check of #224, F1).
async function stubEveryWeatherSource(page, now) {
  await stubEccc(page, { now });
  await page.route(IEM, (route) => route.fulfill({ status: 200, contentType: 'text/plain', headers: ECCC_CORS, body: iemReply(route.request().url()) }));
  await page.route(OPEN_METEO, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: ECCC_CORS, body: openMeteoGridReply(route.request().url()) }));
  await page.route(GIBS, (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: ECCC_CORS, body: GREEN_TILE }));
}

for (const [size, age] of [
  [{ width: 1280, height: 720 }, 'recent'], [{ width: 1366, height: 768 }, 'recent'],
  [{ width: 1280, height: 720 }, 'old'], [{ width: 1366, height: 768 }, 'old'],
]) {
  test(`at ${size.width} × ${size.height} the Weather menu of a ${age} flight with every item ticked fits: last row readable, under no line, no inner scroll (F1)`, async ({ page }) => {
    let nowT = 0;
    await stubEveryWeatherSource(page, () => nowT);
    await page.setViewportSize(size);
    await openRoute(page, '#/debrief');
    await loadExample(page);
    const { scrubber, startT, endT } = await flightWindow(page);
    nowT = age === 'recent' ? endT + 3600 : endT + 5 * 3600;
    await setNow(page, nowT);
    await scrubber.fill(String(startT + 25 * 60));
    await openWeather(page);
    if (age === 'recent') await expect(saveWxButton(page)).toBeVisible(); // the offer is showing
    for (const label of ['METAR', 'Satellite (GOES-West)', 'Radar', 'Lightning', 'Winds aloft (model)', 'Wind arrows (model)']) {
      await page.getByLabel(label, { exact: true }).check();
    }
    await expect(page.locator('#debrief-wind-arrow-status')).toBeVisible();
    const credit = page.locator('.map-credit');
    await expect(credit).toBeVisible();
    await expect(credit).toContainText(age === 'recent' ? 'Radar and lightning not saved yet: see Weather.' : 'Not kept: radar and lightning are only available for 3 hours after the flight.');

    const found = await page.evaluate(() => {
      const body = [...document.querySelectorAll('.debrief-menu-body')].find((el) => !el.hidden);
      const box = body.getBoundingClientRect();
      const map = document.querySelector('.debrief-map-wrap').getBoundingClientRect();
      const shown = [...body.children].filter((el) => el.getClientRects().length > 0);
      const last = shown.at(-1).getBoundingClientRect();
      // What is on top along the last row's bottom line, and at the menu's own bottom corners: the menu's own, never the line under the map.
      const points = [last.left + 4, last.left + last.width / 2, last.right - 4].map((x) => [x, last.bottom - 3]);
      points.push([box.left + 3, box.bottom - 3], [box.right - 3, box.bottom - 3]);
      const covered = points.map(([x, y]) => document.elementFromPoint(x, y)).filter((el) => !el || !body.contains(el)).map((el) => (el ? `${el.tagName}.${el.className}` : 'nothing'));
      return {
        scrolls: body.scrollHeight > body.clientHeight,
        lastBottom: last.bottom,
        boxBottom: box.bottom,
        mapBottom: map.bottom,
        covered,
        // The line under the map takes no clicks, so what is on top is read from the stacking: the menu's is above it.
        menuZ: Number(getComputedStyle(body).zIndex),
        lineZ: Number(getComputedStyle(document.querySelector('.map-credit')).zIndex),
      };
    });
    expect(found.scrolls, 'the menu scrolls inside its box').toBe(false);
    expect(found.covered, 'the last row is covered').toEqual([]);
    expect(found.menuZ, 'the line under the map is drawn over the open menu').toBeGreaterThan(found.lineZ);
    expect(found.lastBottom).toBeLessThanOrEqual(found.boxBottom);
    expect(found.boxBottom, 'the menu runs below the map').toBeLessThanOrEqual(found.mapBottom + 1);
  });
}
