// Browser tests for the SOF Dashboard, task 2, "a screen with live weather"
// (SPEC-sof: The screen, Testing strategy). To go in tests/e2e/sof.spec.js once the
// registry entry is in (see registry-entry.md). Every weather reply is served from
// tests/fixtures/sof/screen-*, never from a live feed, and the clock is fixed at
// 1842Z on 29 September 2026, so every report has the age it is written with here.
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

const fixture = (name) => readFileSync(new URL(`../fixtures/sof/${name}`, import.meta.url), 'utf8');
const NOW = new Date('2026-09-29T18:42:00Z');

const MET_NO = /^https:\/\/api\.met\.no\//;
const DATAMASK = /^https:\/\/datamask\.org\//;
const CORS = { 'access-control-allow-origin': '*' };

/**
 * Serves MET Norway and Datamask from fixtures. The returned object is live:
 * change `metar`, `taf` or `down` between steps, and read `requests` for every address asked.
 *
 * `down` makes both sources fail the way wx sees a failure: an answer it can't use (MET Norway's
 * too large to read, Datamask's not JSON). An HTTP error or an aborted request would do the same
 * to the screen, but Chrome logs those as console errors, which fixtures.js counts as bugs.
 * For the same reason Datamask says "not found" in a 200 reply body, not a 404, for a station it lacks.
 */
async function serveFeeds(page, overrides = {}) {
  const feed = {
    metar: fixture('screen-metno-metar.txt'),
    taf: fixture('screen-metno-taf.txt'),
    down: false,
    requests: [],
    ...overrides,
  };
  await page.route(MET_NO, (route) => {
    const url = route.request().url();
    feed.requests.push(url);
    const body = feed.down ? 'x'.repeat(300_000) : url.includes('/taf?') ? feed.taf : feed.metar;
    return route.fulfill({ status: 200, contentType: 'text/plain', headers: CORS, body });
  });
  await page.route(DATAMASK, (route) => {
    feed.requests.push(route.request().url());
    const body = feed.down ? 'not json' : fixture('screen-datamask-not-found.json');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body });
  });
  return feed;
}

async function openSof(page, overrides) {
  await page.clock.setFixedTime(NOW);
  const feed = await serveFeeds(page, overrides);
  await openRoute(page, '#/sof');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'sof');
  return feed;
}

const card = (page, icao) => page.locator(`article.sof-card[data-icao="${icao}"]`);
const feedStatus = (page) => page.locator('.sof-feed');
const settingsButton = (page) => page.getByRole('button', { name: 'SOF settings' });

// Finds visible controls that overlap each other or stick out of the page (the same rule as layout.spec.js).
async function layoutProblems(page) {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll('#view a[href], #view button, #view input, #view select, #view [role="button"]')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    });
    const problems = [];
    const pageWidth = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > pageWidth) problems.push('page scrolls sideways');
    const name = (el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
    const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (const { el, r } of boxes) if (r.left < 0 || r.right > pageWidth + 0.5) problems.push(`${name(el)} is cut off at the side`);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 1 && h > 1) problems.push(`${name(a.el)} overlaps ${name(b.el)}`);
      }
    }
    // Text must not spill out of its own card either.
    for (const el of document.querySelectorAll('#view .sof-card, #view .sof-bar')) {
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${el.className} has content wider than itself`);
    }
    return problems;
  });
}

test('opens from its card with only the essentials: the bar, four cards, and a closed settings menu @smoke', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await serveFeeds(page);
  await openRoute(page, '#/');
  await page.locator('a.card[href="#/sof"]').click();
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'sof');
  await expect(page).toHaveTitle('SOF Dashboard · DAD\'s OODA LOOP');
  await expect(page.locator('.sof-dtg')).toHaveText('291842Z SEP 26');
  await expect(feedStatus(page)).toHaveText('Weather just now ✓');
  await expect(page.locator('article.sof-card')).toHaveCount(4);
  await expect(page.locator('article.sof-card .sof-icao')).toHaveText(['CYMJ', 'CYQR', 'CYYN', 'CYXE']);
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  // The feed status is reachable by keyboard and says where the weather came from and when it asks again.
  await feedStatus(page).focus();
  await expect(feedStatus(page)).toBeFocused();
  await expect(feedStatus(page)).toHaveAccessibleDescription('Answered by MET Norway. Asks again about 1847Z.');
  await expect(page.getByRole('link', { name: /Traffic/ })).toHaveCount(0); // traffic is a map layer (SOF-7), not a link
  await expect(page.locator('.sof-credits')).toContainText('Not for flight planning. Confirm with NAV CANADA.');
  // Every tuning number is behind the one closed menu (R22).
  await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Home ceiling below')).toBeHidden();
  await expect(page.locator('.sof-alert')).toBeHidden();
});

test('each card shows the report as text, its age, and the state in words', async ({ page }) => {
  await openSof(page);
  const home = card(page, 'CYMJ');
  await expect(home.locator('.sof-role')).toHaveText('HOME');
  await expect(home.locator('.sof-limits')).toHaveText('Limits: Local (MTCA) 2000/3');
  await expect(home.locator('.sof-metar .sof-report-title')).toContainText('METAR 1800Z (42 min ago)');
  await expect(home.locator('.sof-metar .sof-raw')).toHaveText('CYMJ 291800Z 25018G25KT 15SM BKN025 18/02 A2952 RMK SC6 SLP003');
  await expect(home.locator('.sof-taf .sof-report-title')).toContainText('TAF 1740Z, valid 29/18–30/06');
  await expect(home.locator('.sof-category')).toContainText('VFR');
  await expect(home.locator('.sof-result')).toContainText('Within limits');
  expect(await home.textContent(), 'no stray "null" text').not.toContain('null');

  // Regina is below its minima; its approaches aren't set, so 600-2 is used and it says so.
  const regina = card(page, 'CYQR');
  await expect(regina.locator('.sof-category')).toContainText('IFR');
  await expect(regina.locator('.sof-result')).toContainText('Below limits: CEILING 400 FT < 600 FT');
  await expect(regina.locator('.sof-note').first()).toHaveText('Approaches not set in Settings: checked against 600-2');

  // Swift Current's METAR is from 1600Z: stale by its own time, said in words and greyed.
  const swift = card(page, 'CYYN');
  await expect(swift.locator('.sof-metar .sof-note')).toHaveText('STALE: 2 h 42 min old');
  await expect(swift.locator('.sof-metar')).toHaveClass(/is-stale/);

});

test('a station neither source has a report for says so, with the time of the last try', async ({ page }) => {
  // The other three have reports; Saskatoon has none from either source.
  const without = (text) => text.split('\n').filter((line) => line && !line.startsWith('CYXE')).join('\n');
  await openSof(page, { metar: without(fixture('screen-metno-metar.txt')), taf: without(fixture('screen-metno-taf.txt')) });
  const saskatoon = card(page, 'CYXE');
  await expect(saskatoon.locator('.sof-metar .sof-note')).toHaveText('No METAR from MET Norway or Datamask (last tried 1842Z)');
  await expect(saskatoon.locator('.sof-taf .sof-note')).toHaveText('No TAF from MET Norway or Datamask (last tried 1842Z)');
  await expect(saskatoon.locator('.sof-result')).toContainText('No METAR');
  await expect(card(page, 'CYMJ').locator('.sof-metar .sof-raw')).toBeVisible();
});

test('report text is only ever text, even when it looks like HTML', async ({ page }) => {
  await openSof(page, { metar: fixture('screen-metno-metar-hostile.txt') });
  const raw = card(page, 'CYMJ').locator('.sof-metar .sof-raw');
  await expect(raw).toContainText('<img src=x onerror=window.__pwned=1>');
  await expect(raw).toContainText('<script>window.__pwned=1</script>');
  await expect(page.locator('#view img, #view script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('Refresh asks again and the new report replaces the old', async ({ page }) => {
  const feed = await openSof(page);
  await expect(card(page, 'CYMJ').locator('.sof-metar .sof-report-title')).toContainText('METAR 1800Z');
  const before = feed.requests.length;
  feed.metar = fixture('screen-metno-metar-later.txt');
  await page.clock.setFixedTime(new Date('2026-09-29T19:05:00Z'));
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(card(page, 'CYMJ').locator('.sof-metar .sof-report-title')).toContainText('METAR 1900Z (5 min ago)');
  await expect(card(page, 'CYQR').locator('.sof-result')).toContainText('Within limits');
  expect(feed.requests.length).toBeGreaterThan(before);
});

test('every feed failing says so in words and keeps the last reports (#8)', async ({ page }) => {
  const feed = await openSof(page);
  await expect(card(page, 'CYMJ').locator('.sof-metar .sof-raw')).toBeVisible();
  feed.down = true;
  await page.clock.setFixedTime(new Date('2026-09-29T18:54:00Z'));
  await page.getByRole('button', { name: 'Refresh' }).click();

  const alert = page.getByRole('alert').filter({ hasText: 'Weather feeds are not answering' });
  await expect(alert).toHaveText('⚠ Weather feeds are not answering (MET Norway and NOAA NWS via Datamask both failed at 1854Z). Showing the last reports, 12 min old.');
  await expect(feedStatus(page)).toHaveText('Weather Failed, showing 12 min old ⚠');
  // The reports are still there, with their own age and a note that the refresh failed.
  const home = card(page, 'CYMJ');
  await expect(home.locator('.sof-metar .sof-raw')).toHaveText('CYMJ 291800Z 25018G25KT 15SM BKN025 18/02 A2952 RMK SC6 SLP003');
  await expect(home.locator('.sof-metar .sof-report-title')).toContainText('METAR 1800Z (54 min ago)');
  await expect(home.locator('.sof-metar .sof-note').filter({ hasText: 'Last refresh failed (tried 1854Z)' })).toBeVisible();

  // The next round that works clears the message.
  feed.down = false;
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(alert).toBeHidden();
  await expect(feedStatus(page)).toHaveText('Weather just now ✓');
});

test('reports kept from the last visit show, with their age, when every feed is down on the next one', async ({ page }) => {
  const feed = await openSof(page);
  await expect(card(page, 'CYMJ').locator('.sof-metar .sof-raw')).toBeVisible();
  feed.down = true;
  await page.clock.setFixedTime(new Date('2026-09-29T19:20:00Z'));
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await expect(page.getByRole('alert').filter({ hasText: 'Weather feeds are not answering' })).toContainText('Showing the last reports, 38 min old.');
  const home = card(page, 'CYMJ');
  await expect(home.locator('.sof-metar .sof-raw')).toHaveText('CYMJ 291800Z 25018G25KT 15SM BKN025 18/02 A2952 RMK SC6 SLP003');
  await expect(home.locator('.sof-metar .sof-report-title')).toContainText('METAR 1800Z (1 h 20 min ago)');
  await expect(home.locator('.sof-metar .sof-note').first()).toContainText('STALE: 1 h 20 min old');
  await expect(home.locator('.sof-taf .sof-raw')).toBeVisible();
});

test('the weather is asked for again every 5 minutes, and leaving stops every timer and request (R4)', async ({ page }) => {
  await page.clock.install({ time: NOW });
  const feed = await serveFeeds(page);
  await openRoute(page, '#/');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  const home = await page.evaluate(() => window.__ooda.stats());

  await page.evaluate(() => { location.hash = '#/sof'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'sof');
  await expect(card(page, 'CYMJ').locator('.sof-metar .sof-raw')).toBeVisible();
  const first = feed.requests.length;
  await page.clock.runFor(4 * 60_000);
  expect(feed.requests.length, 'nothing before 5 minutes').toBe(first);
  await page.clock.runFor(61_000);
  await expect.poll(() => feed.requests.length).toBeGreaterThan(first);
  const mounted = await page.evaluate(() => window.__ooda.stats());
  expect(mounted.timers, 'the refresh and the clock tick are running').toBeGreaterThan(home.timers);

  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  expect(await page.evaluate(() => window.__ooda.stats())).toEqual(home);
  const after = feed.requests.length;
  await page.clock.runFor(15 * 60_000);
  await page.waitForTimeout(300);
  expect(feed.requests.length, 'no request after leaving').toBe(after);
});

test('a request still out when the module closes is cancelled', async ({ page }) => {
  const started = [];
  const cancelled = [];
  page.on('request', (r) => MET_NO.test(r.url()) && started.push(r.url()));
  page.on('requestfailed', (r) => MET_NO.test(r.url()) && cancelled.push(r.url()));
  await page.route(MET_NO, () => {}); // never answers
  await page.route(DATAMASK, () => {});
  await openRoute(page, '#/sof');
  await expect.poll(() => started.length).toBeGreaterThanOrEqual(2);
  await expect(feedStatus(page)).toContainText('Refreshing…');
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  await expect.poll(() => cancelled.length).toBe(started.length);
});

test('the settings menu holds every tuning number, starts at the defaults, and changes the home limits', async ({ page }) => {
  await openSof(page);
  await settingsButton(page).click();
  await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Trigger', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Trigger', { exact: true }).locator('option:checked')).toHaveText('Local (MTCA) 2000/3');
  await expect(page.getByLabel('Home ceiling below')).toHaveValue('2000');
  await expect(page.getByLabel('Home visibility below')).toHaveValue('3');
  // The banner switch and the lightning radius have no controls until tasks 3 and 7.
  await expect(page.getByLabel('Show the new-caution banner')).toHaveCount(0);
  await expect(page.getByLabel('Lightning radius around home')).toHaveCount(0);

  // Home's METAR has a 2,500 ft ceiling: within Local's 2,000, below Cross-country's 3,000.
  const home = card(page, 'CYMJ');
  await expect(home.locator('.sof-result')).toContainText('Within limits');
  await page.getByLabel('Trigger', { exact: true }).selectOption({ label: 'Cross-country 3000/3' });
  await expect(page.getByLabel('Home ceiling below')).toHaveValue('3000');
  await expect(home.locator('.sof-limits')).toHaveText('Limits: Cross-country 3000/3');
  await expect(home.locator('.sof-result')).toContainText('Below limits: CEILING 2500 FT < 3000 FT');

  // A number changed by hand reads as Custom, and the card says so too.
  await page.getByLabel('Home ceiling below').fill('2500');
  await expect(page.getByLabel('Trigger', { exact: true }).locator('option:checked')).toHaveText('Custom');
  await expect(home.locator('.sof-limits')).toHaveText('Limits: Custom 2500/3');

  // Reset puts every setting back.
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await expect(page.getByLabel('Home ceiling below')).toHaveValue('2000');
  await expect(home.locator('.sof-limits')).toHaveText('Limits: Local (MTCA) 2000/3');
  await settingsButton(page).click();
  await expect(page.getByLabel('Home ceiling below')).toBeHidden();
});

test('a hand-typed limit snaps up to its step, and the box, the card label and the check agree (R1)', async ({ page }) => {
  await openSof(page);
  await settingsButton(page).click();
  const ceiling = page.getByLabel('Home ceiling below');
  const home = card(page, 'CYMJ');
  await ceiling.fill('2049');
  await ceiling.press('Enter');
  await expect(ceiling).toHaveValue('2100');
  await expect(home.locator('.sof-limits')).toHaveText('Limits: Custom 2100/3');
  // Home's ceiling is 2,500 ft: 2450 rounds up to 2500, which the report meets exactly. Rounding to the nearest would have said within.
  await ceiling.fill('2450');
  await ceiling.press('Enter');
  await expect(ceiling).toHaveValue('2500');
  await expect(home.locator('.sof-limits')).toHaveText('Limits: Custom 2500/3');
  await expect(home.locator('.sof-result')).toContainText('At the limit: CEILING 2500 FT AT LIMIT 2500 FT');
  const vis = page.getByLabel('Home visibility below');
  await vis.fill('2.8');
  await vis.press('Enter');
  await expect(vis).toHaveValue('3');
  // While typing, the box is left alone: "2" on the way to "2000" is not rewritten to 100.
  await ceiling.fill('');
  await ceiling.pressSequentially('2', { delay: 0 });
  await expect(ceiling).toHaveValue('2');
});

test('a setting kept in the browser is still there after a reload', async ({ page }) => {
  await openSof(page);
  await settingsButton(page).click();
  await page.getByLabel('Trigger', { exact: true }).selectOption({ label: 'Cross-country 3000/3' });
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await expect(card(page, 'CYMJ').locator('.sof-limits')).toHaveText('Limits: Cross-country 3000/3');
});

const SIZES = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }];

for (const size of SIZES) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('nothing overlaps or is cut off, with the settings menu closed or open', async ({ page }) => {
      await openSof(page);
      await expect(page.locator('article.sof-card')).toHaveCount(4);
      expect(await layoutProblems(page)).toEqual([]);
      await settingsButton(page).click();
      expect(await layoutProblems(page)).toEqual([]);
      await settingsButton(page).click();
      // The bar, the cards and the credits line fit on one screen without scrolling.
      if (size.width === 1920) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    });
  });

  test.describe(`at ${size.width} × ${size.height}, every feed failing`, () => {
    test.use({ viewport: size });

    test('nothing overlaps and the message is in the page flow', async ({ page }) => {
      const feed = await openSof(page);
      feed.down = true;
      await page.getByRole('button', { name: 'Refresh' }).click();
      const alert = page.getByRole('alert').filter({ hasText: 'Weather feeds are not answering' });
      await expect(alert).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
      // The message pushes the cards down; it never sits over them.
      const [alertBox, cardsBox] = await Promise.all([alert.boundingBox(), page.locator('.sof-cards').boundingBox()]);
      expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(cardsBox.y);
    });
  });
}
