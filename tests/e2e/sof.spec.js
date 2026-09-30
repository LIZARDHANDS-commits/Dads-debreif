// Browser tests for the SOF Dashboard, tasks 2 to 5: the screen with live weather, the caution banner, the waves and the timeline
// (SPEC-sof: The screen, Testing strategy). To go in tests/e2e/sof.spec.js once the
// registry entry is in (see registry-entry.md). Every weather reply is served from
// tests/fixtures/sof/screen-*, never from a live feed, and the clock is fixed at
// 1842Z on 29 September 2026, so every report has the age it is written with here.
import { readFileSync } from 'node:fs';
import { test, expect, expectNoA11yViolations } from './fixtures.js';
import { openRoute } from './routes.js';

const fixture = (name) => readFileSync(new URL(`../fixtures/sof/${name}`, import.meta.url), 'utf8');
const NOW = new Date('2026-09-29T18:42:00Z');

const MET_NO = /^https:\/\/api\.met\.no\//;
const DATAMASK = /^https:\/\/datamask\.org\//;
const CORS = { 'access-control-allow-origin': '*' };

// page.route() cannot see a request once a service worker controls the page, and WebKit (which CI runs
// for @smoke) lets the worker's own network layer answer even a worker that never calls respondWith.
// The real MET Norway then answered in CI: reports observed "30 d 5 h" before the fixed clock. Blocking
// the worker keeps every weather reply a fixture; the offline behaviour is tested in the shell's own specs.
test.use({ serviceWorkers: 'block' });

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

test('a card whose METAR is stale has no green tick and no green category chip', async ({ page }) => {
  await openSof(page);
  const swift = card(page, 'CYYN'); // its METAR is 2 h 42 min old
  await expect(swift.locator('.sof-result')).toHaveText('? Unknown: report is 2 h 42 min old');
  await expect(swift.locator('.sof-result')).not.toContainText('✓');
  await expect(swift).not.toHaveClass(/level-within/);
  // The chip keeps its words but is grey, unlike the same VFR on a fresh report.
  await expect(swift.locator('.sof-category')).toContainText('VFR');
  await expect(swift.locator('.sof-category')).toHaveClass(/is-stale/);
  const colour = (loc) => loc.evaluate((el) => getComputedStyle(el).color);
  const fresh = await colour(card(page, 'CYMJ').locator('.sof-category'));
  expect(await colour(swift.locator('.sof-category'))).not.toBe(fresh);
  // A fresh report is as before.
  await expect(card(page, 'CYMJ').locator('.sof-result')).toContainText('✓ Within limits');
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
  // The banner switch is here from task 3, on to begin with; the lightning radius is here from task 7, 20 NM to begin with.
  await expect(page.getByLabel('Show the new-caution banner')).toBeChecked();
  await expect(page.getByLabel('Lightning radius around home')).toHaveValue('20');
  await expect(page.getByLabel('Traffic relay address')).toHaveValue('');

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
      // The bar, the banner and the waves are on the first screen of a desk monitor. (The whole page, with the
      // cards and the timeline, is taller than 1080 px until the map is beside the cards; that is scrolled, not overlapped.)
      if (size.width === 1920) {
        const bottom = await page.locator('.sof-waves').evaluate((el) => el.getBoundingClientRect().bottom);
        expect(bottom).toBeLessThanOrEqual(1080);
      }
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

// ---- Task 3: the caution banner (SPEC-sof, "Caution banner"), by keyboard alone --------------------------------

const banner = (page) => page.locator('.sof-banner');
const bannerLines = (page) => page.locator('.sof-banner-line .sof-banner-text');
const focusedClass = (page) => page.evaluate(() => document.activeElement?.className ?? '');

// Presses Tab until the focused element matches `selector`, so the walk is the keyboard's own.
async function tabTo(page, selector, limit = 12) {
  for (let i = 0; i < limit; i++) {
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Tab never reached ${selector}`);
}

test('the banner lists each new caution in words, in the page flow, and is announced as an alert', async ({ page }) => {
  await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toHaveAttribute('role', 'alert');
  await expect(banner(page).locator('.sof-banner-title')).toContainText('2 new cautions');
  await expect(bannerLines(page)).toHaveText([
    'Below limits: CYQR METAR 1800Z: CEILING 400 FT < 600 FT',
    'Caution: CYMJ METAR 1800Z: THUNDERSTORM / SEVERE WX (VCTS)',
  ]);
  // A symbol and words, never colour alone.
  await expect(banner(page).locator('.sof-banner-line').first().locator('.sof-banner-symbol')).toHaveText('▼');
  await expect(banner(page).locator('.sof-banner-line').nth(1).locator('.sof-banner-symbol')).toHaveText('⚠');
  // It takes its own row above the cards and never sits over them.
  const [b, cards] = await Promise.all([banner(page).boundingBox(), page.locator('.sof-cards').boundingBox()]);
  expect(b.y + b.height).toBeLessThanOrEqual(cards.y);
  // The cards still list every caution.
  await expect(card(page, 'CYMJ').locator('.sof-caution')).toContainText('Caution: THUNDERSTORM / SEVERE WX (VCTS)');
});

test('a caution in a TAF is on the banner with its group and times', async ({ page }) => {
  await openSof(page, { metar: fixture('ui-metno-metar-clear.txt'), taf: fixture('ui-metno-taf-fog.txt') });
  // With no wave entered the home forecast below the home limits is on the banner too (R3), before the caution.
  await expect(bannerLines(page)).toHaveText([
    'Below limits: CYMJ TAF TEMPO 29/22Z–30/00Z: CEILING 200 FT < 2000 FT',
    'Below limits: CYMJ TAF TEMPO 29/22Z–30/00Z: VIS 1/2 SM < 3 SM',
    'Caution: CYMJ TAF TEMPO 29/22Z–30/00Z: SIGNIFICANT WX (FG)',
  ]);
});

test('no cautions, no banner', async ({ page }) => {
  await openSof(page, { metar: fixture('ui-metno-metar-clear.txt') });
  await expect(banner(page)).toBeHidden();
});

test('the banner flow by keyboard: Acknowledge one, then the last, a reload, the same weather again, and a new caution', async ({ page }) => {
  const feed = await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await expect(bannerLines(page)).toHaveCount(2);
  await feedStatus(page).focus();
  await tabTo(page, '.sof-banner-ack'); // Refresh, the settings menu, then the first Acknowledge
  await expect(page.locator('.sof-banner-ack').first()).toBeFocused();
  await expect(page.locator('.sof-banner-ack').first()).toHaveAccessibleName('Acknowledge: Below limits: CYQR METAR 1800Z: CEILING 400 FT < 600 FT');

  // Enter acknowledges the first line; focus stays in the banner, on the line now in its place.
  await page.keyboard.press('Enter');
  await expect(bannerLines(page)).toHaveText(['Caution: CYMJ METAR 1800Z: THUNDERSTORM / SEVERE WX (VCTS)']);
  await expect(page.locator('.sof-banner-ack')).toBeFocused();
  await expect(banner(page).locator('.sof-banner-all')).toBeHidden(); // one line left: Acknowledge all isn't needed
  await page.keyboard.press('Enter');
  await expect(banner(page)).toBeHidden();
  expect(await focusedClass(page), 'focus is not lost to the page').not.toBe('');

  // Acknowledged stays acknowledged after a reload, and when the same weather comes in the next report.
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await expect(card(page, 'CYQR').locator('.sof-result')).toContainText('Below limits');
  await expect(banner(page)).toBeHidden();
  feed.metar = fixture('ui-metno-metar-storm.txt').replaceAll('291800Z', '291830Z');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(card(page, 'CYMJ').locator('.sof-metar .sof-report-title')).toContainText('METAR 1830Z');
  await expect(banner(page)).toBeHidden();

  // A different caution is new: only it is on the banner, and the alert role is back for it.
  feed.metar = fixture('ui-metno-metar-storm-yyn.txt');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(bannerLines(page)).toHaveText([
    'Caution: CYYN METAR 1830Z: THUNDERSTORM / SEVERE WX (TSRA)',
    'Caution: CYYN METAR 1830Z: CB/TCU (BKN040CB)',
  ]);
  await expect(banner(page)).toHaveAttribute('role', 'alert');
});

test('Acknowledge all clears every line at once, by keyboard, and the banner stays gone until something new', async ({ page }) => {
  const feed = await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await feedStatus(page).focus();
  await tabTo(page, '.sof-banner-all');
  await expect(banner(page).locator('.sof-banner-all')).toHaveText('Acknowledge all');
  await page.keyboard.press('Enter');
  await expect(banner(page)).toBeHidden();
  expect(await focusedClass(page)).not.toBe('');
  // The same reports again: nothing new, and the banner is no longer an alert.
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(feedStatus(page)).toHaveText('Weather just now ✓');
  await expect(banner(page)).toBeHidden();
  await expect(banner(page)).not.toHaveAttribute('role', 'alert');
  // A caution that clears and comes back is new again (SOF-4).
  feed.metar = fixture('ui-metno-metar-clear.txt');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(card(page, 'CYQR').locator('.sof-result')).toContainText('Within limits');
  feed.metar = fixture('ui-metno-metar-storm.txt');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(bannerLines(page)).toHaveCount(2);
});

test('the banner switch in settings turns the banner off and on, is kept, and the cards still show the cautions', async ({ page }) => {
  await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await expect(banner(page)).toBeVisible();
  await settingsButton(page).click();
  const switchBox = page.getByLabel('Show the new-caution banner');
  await expect(switchBox).toBeChecked();
  await switchBox.focus();
  await page.keyboard.press('Space');
  await expect(switchBox).not.toBeChecked();
  await expect(banner(page)).toBeHidden();
  await expect(card(page, 'CYMJ').locator('.sof-caution')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await expect(banner(page)).toBeHidden();
  await settingsButton(page).click();
  await page.getByLabel('Show the new-caution banner').check();
  await expect(banner(page)).toBeVisible();
  await expect(bannerLines(page)).toHaveCount(2);
});

for (const size of SIZES) {
  test.describe(`at ${size.width} × ${size.height}, with the banner up`, () => {
    test.use({ viewport: size });

    test('nothing overlaps and the banner pushes the screen down instead of covering it', async ({ page }) => {
      await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
      await expect(banner(page)).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
      await settingsButton(page).click();
      expect(await layoutProblems(page)).toEqual([]);
    });
  });
}

// ---- Task 4: waves on screen (SPEC-sof, "Waves and the alternate call") -----------------------------------------
// The clock is 1842Z on the 29th, 12:42 at home (CST, UTC-6). The fog TAF has a TEMPO of 1/2SM FG from 22Z to 24Z.

const CLEAR_FOG = { metar: fixture('ui-metno-metar-clear.txt'), taf: fixture('ui-metno-taf-fog.txt') };
const waveRow = (page, n) => page.locator('.sof-wave').nth(n);
const addButton = (page) => page.getByRole('button', { name: 'Add wave' });

// Adds a wave by the Add wave button and fills it in.
async function addWave(page, name, takeoff, land) {
  const at = await page.locator('.sof-wave').count();
  await addButton(page).click();
  const row = waveRow(page, at);
  await row.locator('.sof-wave-name').fill(name);
  await row.locator('.sof-wave-takeoff').fill(takeoff);
  await row.locator('.sof-wave-land').fill(land);
  return row;
}

test('the waves part starts with no waves, the zone and the date said, and Today chosen', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  await expect(page.locator('.sof-waves-title')).toHaveText('Waves');
  await expect(page.locator('.sof-waves-zone')).toHaveText('Times are home local time (CST)');
  await expect(page.locator('.sof-day-date')).toHaveText('Tue 29 Sep');
  await expect(page.getByLabel('Today')).toBeChecked();
  await expect(page.locator('.sof-waves-empty')).toBeVisible();
  await expect(page.locator('.sof-wave')).toHaveCount(0);
  // Nothing about a wave shows on the alternate cards until there is one.
  await expect(page.locator('.sof-wave-result')).toHaveCount(0);
});

test('a wave has a chip with its call in words, a symbol and the first reason; the list of hits is for the selected wave', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  const row = await addWave(page, 'Aft', '15:30', '17:00');
  const chip = row.locator('.sof-wave-chip');
  await expect(chip).toContainText('ALTERNATE REQUIRED');
  await expect(chip.locator('.sof-chip-symbol')).toHaveText('⚠');
  await expect(chip.locator('.sof-chip-reason')).toContainText('CYMJ TEMPO');
  await expect(chip.locator('.sof-chip-reason')).toContainText('from 22Z');
  await expect(chip.locator('.sof-chip-alts')).toHaveText('3 of 3 alternates meet');
  await expect(chip).toHaveAccessibleName(/^Aft: ALTERNATE REQUIRED/);
  // The list of every hit is closed until the chip is pressed, then it lists the hits and each alternate's result.
  const detail = page.locator('.sof-wave-detail');
  await expect(detail).toBeHidden();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(detail.locator('.sof-detail-title')).toHaveText('Aft 1530–1700 CST (2130–2300Z)');
  await expect(detail.locator('.sof-hit').first()).toContainText('Below limits: CYMJ TEMPO');
  await expect(detail.locator('.sof-detail-home')).toContainText('Home, Local (MTCA) 2000/3: ALTERNATE REQUIRED');
  await expect(detail.locator('.sof-alt')).toHaveCount(3);
  await expect(detail.locator('.sof-alt').first()).toContainText('CYQR, 600-2: Meets minima');
  // Each alternate card shows its own result for the wave, home's does not.
  await expect(card(page, 'CYQR').locator('.sof-wave-result')).toHaveText('Aft arrival 2200–0000Z: ✓ Meets minima');
  await expect(card(page, 'CYMJ').locator('.sof-wave-result')).toHaveCount(0);
  expect(await page.locator('.sof-waves').textContent(), 'no stray "null" text').not.toContain('null');
});

test('an alternate that does not meet its minima says so on its card for the selected wave', async ({ page }) => {
  // Regina's TAF has fog until 00Z: a wave landing at 17:00 local (23Z) is inside it.
  const taf = fixture('ui-metno-taf-fog.txt').replace(/^CYQR .*$/m, 'CYQR 291740Z 2918/3018 00000KT M1/4SM FG BKN002 FM300000 27010KT P6SM FEW040 RMK NXT FCST BY 300000Z=');
  await openSof(page, { metar: fixture('ui-metno-metar-clear.txt'), taf });
  await addWave(page, '', '15:30', '17:00');
  await expect(page.locator('.sof-wave-chip .sof-chip-alts')).toHaveText('2 of 3 alternates meet');
  await expect(card(page, 'CYQR').locator('.sof-wave-result')).toContainText('W1 arrival 2200–0000Z: ▼ Below minima');
  await expect(card(page, 'CYQR').locator('.sof-wave-result')).toContainText('CYQR');
  await expect(card(page, 'CYYN').locator('.sof-wave-result')).toContainText('✓ Meets minima');
});

test('selecting another wave by keyboard switches the list of hits and the alternate cards', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  await addWave(page, 'Early', '12:30', '14:00');
  await addWave(page, 'Aft', '15:30', '17:00');
  await expect(waveRow(page, 0).locator('.sof-wave-chip')).toContainText('No alternate needed');
  // The first wave is the one the alternate cards show, and its list of hits is closed.
  await expect(waveRow(page, 0).locator('.sof-wave-chip')).toHaveClass(/is-selected/);
  await expect(page.locator('.sof-wave-detail')).toBeHidden();
  await expect(card(page, 'CYQR').locator('.sof-wave-result')).toContainText('Early arrival');
  // Pressing the second wave's chip from the keyboard selects it and opens its hits.
  await waveRow(page, 1).locator('.sof-wave-chip').focus();
  await page.keyboard.press('Enter');
  await expect(waveRow(page, 1).locator('.sof-wave-chip')).toHaveAttribute('aria-pressed', 'true');
  await expect(waveRow(page, 0).locator('.sof-wave-chip')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.sof-detail-title')).toContainText('Aft 1530–1700 CST');
  await expect(card(page, 'CYQR').locator('.sof-wave-result')).toContainText('Aft arrival');
  await expect(waveRow(page, 1).locator('.sof-wave-chip')).toBeFocused();
  // Pressing it again closes the list; the cards keep showing that wave.
  await page.keyboard.press('Space');
  await expect(page.locator('.sof-wave-detail')).toBeHidden();
  await expect(card(page, 'CYQR').locator('.sof-wave-result')).toContainText('Aft arrival');
});

test('every input does something: the name, both times, the day and Remove', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  const row = await addWave(page, 'Aft', '15:30', '17:00');
  // The name is in the chip's name, the list, and the cards.
  await row.locator('.sof-wave-name').fill('Late');
  await expect(row.locator('.sof-wave-chip')).toHaveAccessibleName(/^Late: /);
  await row.locator('.sof-wave-chip').click();
  await expect(page.locator('.sof-detail-title')).toContainText('Late 1530–1700 CST');
  await expect(card(page, 'CYQR').locator('.sof-wave-result')).toContainText('Late arrival');
  // Times move the wave: an hour earlier is before the fog, so no alternate is needed.
  await row.locator('.sof-wave-takeoff').fill('12:30');
  await row.locator('.sof-wave-land').fill('14:00');
  await expect(row.locator('.sof-wave-chip')).toContainText('No alternate needed');
  await expect(page.locator('.sof-detail-title')).toContainText('Late 1230–1400 CST (1830–2000Z)');
  // The day moves it to tomorrow's date, where this TAF has ended.
  await page.getByLabel('Tomorrow').check();
  await expect(page.locator('.sof-day-date')).toHaveText('Wed 30 Sep');
  await expect(row.locator('.sof-wave-chip')).toContainText("TAF doesn't cover the wave");
  await page.getByLabel('Today').check();
  await expect(row.locator('.sof-wave-chip')).toContainText('No alternate needed');
  // Remove takes it away, and focus is not lost.
  await row.locator('.sof-wave-remove').click();
  await expect(page.locator('.sof-wave')).toHaveCount(0);
  await expect(addButton(page)).toBeFocused();
});

test('a wave that lands after midnight is shown and checked, not dropped (#7)', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  const row = await addWave(page, 'Night', '22:00', '00:30');
  await expect(row.locator('.sof-wave-note')).toHaveText('Lands the next day');
  await expect(row.locator('.sof-wave-chip')).toBeVisible();
  await row.locator('.sof-wave-chip').click();
  await expect(page.locator('.sof-detail-title')).toHaveText('Night 2200–0030 CST (0400–0630Z)');
});

test('a wave with no times says what is missing instead of a call', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  await addButton(page).click();
  await expect(waveRow(page, 0).locator('.sof-wave-note')).toHaveText('Takeoff time not set');
  await expect(waveRow(page, 0).locator('.sof-wave-chip')).toBeHidden();
  await waveRow(page, 0).locator('.sof-wave-takeoff').fill('08:00');
  await expect(waveRow(page, 0).locator('.sof-wave-note')).toHaveText('Landing time not set');
  // Something that is not a time is said, and does not make a call.
  await page.evaluate(() => {
    const input = document.querySelector('.sof-wave-land');
    input.type = 'text';
    input.value = 'later';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(waveRow(page, 0).locator('.sof-wave-note')).toHaveText('Enter the time as HH:MM, for example 08:30.');
  await expect(waveRow(page, 0).locator('.sof-wave-land')).toHaveAttribute('aria-invalid', 'true');
});

test('editing a wave never loses focus, even as the screen redraws around it', async ({ page }) => {
  const feed = await openSof(page, CLEAR_FOG);
  const row = await addWave(page, '', '15:30', '17:00');
  const name = row.locator('.sof-wave-name');
  await name.focus();
  await page.keyboard.type('Aft');
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Aft');
  // A new time changes the chip, the list, the cards and the banner; the box being typed in keeps focus and its text.
  const takeoff = row.locator('.sof-wave-takeoff');
  await takeoff.fill('15:00');
  await expect(takeoff).toBeFocused();
  await expect(takeoff).toHaveValue('15:00');
  // A refresh with new weather while focus is in the box changes the words around it, not the box.
  await name.focus();
  feed.taf = fixture('screen-metno-taf.txt');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(row.locator('.sof-wave-chip')).toContainText('No alternate needed');
  await name.focus();
  await page.keyboard.type('X');
  await expect(name).toHaveValue('AftX');
  await expect(name).toBeFocused();
});

test('the plan survives a reload, and Tomorrow chosen today is still Tomorrow', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  await addWave(page, 'Early', '12:30', '14:00');
  await addWave(page, 'Night', '22:00', '00:30');
  await page.getByLabel('Tomorrow').check();
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await expect(page.locator('.sof-wave')).toHaveCount(2);
  await expect(waveRow(page, 0).locator('.sof-wave-name')).toHaveValue('Early');
  await expect(waveRow(page, 0).locator('.sof-wave-takeoff')).toHaveValue('12:30');
  await expect(waveRow(page, 1).locator('.sof-wave-land')).toHaveValue('00:30');
  await expect(page.getByLabel('Tomorrow')).toBeChecked();
  await expect(page.locator('.sof-day-date')).toHaveText('Wed 30 Sep');
});

test('no old date is ever used: Tomorrow chosen yesterday is Today now, and the waves are today\'s', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  await addWave(page, 'Aft', '15:30', '17:00');
  await page.getByLabel('Tomorrow').check();
  await expect(page.locator('.sof-day-date')).toHaveText('Wed 30 Sep');
  // The next day at home (the 30th, 12:42 there): what was Tomorrow is Today.
  await page.clock.setFixedTime(new Date('2026-09-30T18:42:00Z'));
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await expect(page.getByLabel('Today')).toBeChecked();
  await expect(page.locator('.sof-day-date')).toHaveText('Wed 30 Sep');
  await expect(waveRow(page, 0).locator('.sof-wave-takeoff')).toHaveValue('15:30');
});

test('up to 5 waves: Add wave stops there, says why, and keeps focus', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  for (let i = 0; i < 5; i++) await addButton(page).click();
  await expect(page.locator('.sof-wave')).toHaveCount(5);
  await expect(page.locator('.sof-wave-limit')).toHaveText('Up to 5 waves');
  await expect(addButton(page)).toHaveAttribute('aria-disabled', 'true');
  await addButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sof-wave')).toHaveCount(5);
  await expect(addButton(page)).toBeFocused();
  // Removing one by keyboard hands focus to the wave that took its place, and Add wave works again.
  await waveRow(page, 1).locator('.sof-wave-remove').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sof-wave')).toHaveCount(4);
  await expect(waveRow(page, 1).locator('.sof-wave-name')).toBeFocused();
  await expect(addButton(page)).not.toHaveAttribute('aria-disabled', 'true');
});

test('acknowledging the last caution hands focus to the Waves heading', async ({ page }) => {
  await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await banner(page).locator('.sof-banner-all').focus();
  await page.keyboard.press('Enter');
  await expect(banner(page)).toBeHidden();
  await expect(page.locator('.sof-waves-title')).toBeFocused();
});

test('a wave over the same fog adds no second banner line for it, however many waves cover it', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  await expect(bannerLines(page)).toHaveCount(3);
  await addWave(page, '', '15:30', '17:00');
  await expect(bannerLines(page)).toHaveCount(3);
  await expect(bannerLines(page).filter({ hasText: 'Below limits: CYMJ TAF TEMPO 29/22Z–30/00Z: CEILING 200 FT < 2000 FT' })).toHaveCount(1);
  // A second wave over the same fog adds no second line for it.
  await addWave(page, '', '16:00', '17:30');
  await expect(bannerLines(page)).toHaveCount(3);
});

for (const size of SIZES) {
  test.describe(`at ${size.width} × ${size.height}, with waves`, () => {
    test.use({ viewport: size });

    test('nothing overlaps or is cut off with five waves and the list of hits open', async ({ page }) => {
      await openSof(page, CLEAR_FOG);
      for (const [name, a, b] of [['Early', '12:30', '14:00'], ['Aft', '15:30', '17:00'], ['Night', '22:00', '00:30'], ['', '13:00', '14:30'], ['Long name', '18:00', '19:30']]) {
        await addWave(page, name, a, b);
      }
      await expect(page.locator('.sof-wave')).toHaveCount(5);
      await waveRow(page, 1).locator('.sof-wave-chip').click();
      await expect(page.locator('.sof-wave-detail')).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
      await settingsButton(page).click();
      expect(await layoutProblems(page)).toEqual([]);
    });
  });
}

// ---- Task 5: the 24-hour timeline (SPEC-sof, "24-hour timeline") ---------------------------------------------------
// Home's day is 06Z on the 29th to 06Z on the 30th. The TAFs start at 18Z, so pieces are in the right half of the day.

const timeline = (page) => page.locator('.sof-timeline');
const pieces = (page, icao) => page.locator(`.sof-tl-row[data-icao="${icao}"] .sof-tl-piece`);
const tlInfo = (page) => page.locator('.sof-tl-info');

test('the timeline draws a row for each airfield, with labelled pieces, Zulu first and a local row, and the now line', async ({ page }) => {
  await openSof(page);
  await expect(timeline(page).locator('.panel-title')).toHaveText('24-hour timeline, Tue 29 Sep (CST)');
  await expect(page.locator('.sof-tl-row .sof-tl-icao')).toHaveText(['CYMJ', 'CYQR', 'CYYN', 'CYXE']);
  await expect(page.locator('.sof-tl-axis-row').nth(0).locator('.sof-tl-axis-label')).toHaveText('Zulu');
  await expect(page.locator('.sof-tl-axis-row').nth(1).locator('.sof-tl-axis-label')).toHaveText('CST');
  await expect(page.locator('.sof-tl-axis-row').nth(0)).toContainText('18Z');
  await expect(page.locator('.sof-tl-axis-row').nth(1)).toContainText('12:00');
  // Home's TAF: prevailing to 21Z, then the FM group. Each piece is labelled with its NATO colour state.
  const home = pieces(page, 'CYMJ');
  await expect(home).toHaveCount(2);
  await expect(home.first().locator('.sof-tl-piece-label')).toHaveText(/^[A-Z0-9]+$/);
  // The METAR marks and the now line.
  await expect(page.locator('.sof-tl-row[data-icao="CYMJ"] .sof-tl-metar')).toHaveAccessibleName('METAR 1800Z');
  await expect(page.locator('.sof-tl-now')).toBeVisible();
  await expect(page.locator('.sof-tl-now-label')).toHaveText('Now 1842Z');
  expect(await page.locator('.sof-timeline').textContent(), 'no stray "null" text').not.toContain('null');
});

test('a piece below the limits is hatched and says below in its label; a row with no TAF says so', async ({ page }) => {
  await openSof(page, { metar: fixture('ui-metno-metar-clear.txt'), taf: fixture('ui-metno-taf-fog.txt').split('\n').filter((l) => !l.startsWith('CYYN')).join('\n') });
  const tempo = pieces(page, 'CYMJ').filter({ hasText: 'TEMPO' });
  await expect(tempo).toHaveCount(1);
  await expect(tempo).toHaveClass(/is-hatched/);
  await expect(tempo.locator('.sof-tl-piece-label')).toContainText('below');
  await expect(pieces(page, 'CYMJ').first()).not.toHaveClass(/is-hatched/);
  await expect(page.locator('.sof-tl-row[data-icao="CYYN"] .sof-tl-words')).toHaveText('No TAF');
});

test('each wave is a band with landing and landing + 1 h marks, and an evening wave is on the day (#7)', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  await addWave(page, 'Aft', '15:30', '17:00');
  await addWave(page, 'Night', '21:30', '23:00');
  await expect(page.locator('.sof-tl-band')).toHaveCount(2);
  await expect(page.locator('.sof-tl-band-label')).toHaveText(['Aft', 'Night']);
  await expect(page.locator('.sof-tl-mark.is-landing')).toHaveCount(2);
  await expect(page.locator('.sof-tl-mark.is-plus1')).toHaveCount(2);
  // The evening wave is near the end of the Zulu-first day and is not dropped.
  const left = await page.locator('.sof-tl-band').nth(1).evaluate((el) => parseFloat(el.style.left));
  expect(left).toBeGreaterThan(85); // 21:30 local is 21.5 h into the 24 h window: 89.6%
  await expect(page.locator('.sof-tl-waves')).toContainText('Night 0330Z–0500Z, local 21:30–23:00 CST. Landing 0500Z, landing + 1 h 0600Z.');
  // Bands never take the pointer or a tab stop.
  expect(await page.locator('.sof-tl-overlay').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
});

test('the keyboard walk: one tab stop, arrows step through pieces and rows, and the card is in words', async ({ page }) => {
  await openSof(page, { metar: fixture('ui-metno-metar-clear.txt'), taf: fixture('ui-metno-taf-fog.txt') });
  await expect(tlInfo(page)).toContainText('Hover over or focus a piece');
  await timeline(page).locator('.panel-toggle').focus();
  await page.keyboard.press('Tab'); // the timeline's single tab stop: its first piece
  const first = pieces(page, 'CYMJ').first();
  await expect(first).toBeFocused();
  await expect(tlInfo(page)).toHaveText(/^CYMJ PREVAILING 29\/18Z–30\/06Z: \w+\. Zulu 1800–0600, local 12:00–00:00 CST\. Conditions: 22010KT P6SM\.$/);
  await expect(first).toHaveAccessibleName(/^CYMJ PREVAILING 29\/18Z–30\/06Z/);
  // Right steps along the row in time order: the prevailing piece, then the TEMPO that is below the limits.
  await page.keyboard.press('ArrowRight');
  await expect(pieces(page, 'CYMJ').nth(1)).toBeFocused();
  await expect(tlInfo(page)).toContainText('TEMPO 29/22Z–30/00Z');
  await expect(tlInfo(page)).toContainText('below limits');
  await expect(tlInfo(page)).toContainText('local 16:00–18:00 CST');
  // Down goes to the next row, at the same time; Up comes back.
  await page.keyboard.press('ArrowDown');
  await expect(pieces(page, 'CYQR').first()).toBeFocused();
  await expect(tlInfo(page)).toContainText('CYQR');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.sof-tl-row[data-icao="CYMJ"] .sof-tl-piece:focus')).toHaveCount(1);
  await page.keyboard.press('End');
  await expect(pieces(page, 'CYMJ').last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused(); // at the start it stays put
  // The arrows do not scroll the page.
  const y = await page.evaluate(() => scrollY);
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => scrollY)).toBe(y);
  // Tab leaves the timeline whole, and the card goes back to its hint.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.classList.contains('sof-tl-piece'))).toBe(false);
  await expect(tlInfo(page)).toContainText('Hover over or focus a piece');
});

test('hovering a piece or the METAR mark shows its card in words', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  const tempo = pieces(page, 'CYMJ').filter({ hasText: 'TEMPO' });
  await tempo.hover();
  await expect(tlInfo(page)).toContainText('CYMJ TEMPO 29/22Z–30/00Z');
  await expect(tlInfo(page)).toContainText('Conditions: 22010KT 1/2SM FG VV002.');
  await page.locator('.sof-tl-row[data-icao="CYMJ"] .sof-tl-metar').hover();
  await expect(tlInfo(page)).toHaveText('CYMJ METAR 1800Z');
  await page.mouse.move(5, 5);
  await expect(tlInfo(page)).toContainText('Hover over or focus a piece');
});

test('the timeline is redrawn only when what it shows changes; the now line moves on its own', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  await addWave(page, 'Aft', '15:30', '17:00');
  const mark = () => page.evaluate(() => { window.__piece = document.querySelector('.sof-tl-piece'); return true; });
  await mark();
  const still = () => page.evaluate(() => window.__piece.isConnected);
  const nowLeft = () => page.locator('.sof-tl-now').evaluate((el) => el.style.left);
  const before = await nowLeft();
  // Five minutes later, with the same reports: the same nodes, and the now line has moved.
  await page.clock.setFixedTime(new Date('2026-09-29T18:47:00Z'));
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.locator('.sof-tl-now-label')).toHaveText('Now 1847Z');
  expect(await nowLeft()).not.toBe(before);
  expect(await still(), 'not redrawn for the clock').toBe(true);
  // A wave changes what is drawn.
  await waveRow(page, 0).locator('.sof-wave-land').fill('17:30');
  await expect.poll(still).toBe(false);
});

test('editing a wave redraws the timeline without taking focus from the box being typed in', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  const row = await addWave(page, '', '15:30', '17:00');
  const name = row.locator('.sof-wave-name');
  await name.focus();
  await page.keyboard.type('Aft');
  await expect(page.locator('.sof-tl-band-label')).toHaveText('Aft');
  await expect(name).toBeFocused();
  const land = row.locator('.sof-wave-land');
  await land.fill('18:00');
  await expect(land).toBeFocused();
  await expect(page.locator('.sof-tl-waves')).toContainText('Aft 2130Z–0000Z');
});

test('a piece that has focus keeps it when the timeline is redrawn by a new report', async ({ page }) => {
  const feed = await openSof(page, CLEAR_FOG);
  await timeline(page).locator('.panel-toggle').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  const second = pieces(page, 'CYMJ').nth(1);
  await expect(second).toBeFocused();
  feed.taf = fixture('ui-metno-taf-fog.txt').replace('P6SM SKC TEMPO', 'P6SM FEW100 TEMPO');
  await page.getByRole('button', { name: 'Refresh' }).dispatchEvent('click'); // a real click would move focus
  await expect(pieces(page, 'CYMJ').first().locator('.sof-tl-piece-label')).toBeVisible();
  await expect(pieces(page, 'CYMJ').nth(1)).toBeFocused();
  await expect(tlInfo(page)).toContainText('TEMPO 29/22Z–30/00Z');
});

test('the timeline can be closed and the choice is kept; Tomorrow shows tomorrow\'s day', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  const toggle = timeline(page).locator('.panel-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sof-tl-rows')).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await expect(timeline(page).locator('.panel-toggle')).toHaveAttribute('aria-expanded', 'false');
  await timeline(page).locator('.panel-toggle').click();
  await page.getByLabel('Tomorrow').check();
  await expect(timeline(page).locator('.panel-title')).toHaveText('24-hour timeline, Wed 30 Sep (CST)');
  await expect(page.locator('.sof-tl-now')).toBeHidden(); // now is not on tomorrow
});

test('Local first in the app Settings puts the local row first on the timeline axis', async ({ page }) => {
  await openSof(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Local first, Zulu beside it').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sof-tl-axis-row').nth(0).locator('.sof-tl-axis-label')).toHaveText('CST');
  await expect(page.locator('.sof-tl-axis-row').nth(1).locator('.sof-tl-axis-label')).toHaveText('Zulu');
});

for (const size of SIZES) {
  test.describe(`at ${size.width} × ${size.height}, with the timeline`, () => {
    test.use({ viewport: size });

    test('nothing overlaps or is cut off with waves on the timeline, a piece focused and the card open', async ({ page }) => {
      await openSof(page, CLEAR_FOG);
      await addWave(page, 'Aft', '15:30', '17:00');
      await addWave(page, 'Night', '21:30', '23:00');
      await timeline(page).locator('.panel-toggle').focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowRight');
      await expect(tlInfo(page)).toContainText('TEMPO');
      expect(await layoutProblems(page)).toEqual([]);
      // Bands and marks are drawn over the rows, but never over a control: the pieces are the only tab stop and sit under nothing that takes the pointer.
      expect(await page.locator('.sof-timeline').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    });
  });
}

// ---- Focus and the switch survive a redraw (audit) ------------------------------------------------------------

const STORM_NO_LOW_CYQR = () => fixture('ui-metno-metar-storm.txt').replace('2SM BR BKN004', '15SM FEW080');

test('an Acknowledge button that has focus keeps it when a refresh redraws the banner, and focus moves on after the last', async ({ page }) => {
  const feed = await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await feedStatus(page).focus();
  await tabTo(page, '.sof-banner-ack');
  await page.keyboard.press('Tab'); // the second line's button: the thunderstorm at home
  await expect(page.locator('.sof-banner-ack').nth(1)).toBeFocused();
  // The low ceiling at Regina clears: the banner is redrawn with one line, and focus stays on the same caution's button.
  feed.metar = STORM_NO_LOW_CYQR();
  await page.getByRole('button', { name: 'Refresh' }).dispatchEvent('click'); // a real click would move focus
  await expect(bannerLines(page)).toHaveText(['Caution: CYMJ METAR 1800Z: THUNDERSTORM / SEVERE WX (VCTS)']);
  await expect(page.locator('.sof-banner-ack')).toBeFocused();
  // The last Acknowledge: the banner goes and focus moves on to the Waves heading, never to the page.
  await page.keyboard.press('Enter');
  await expect(banner(page)).toBeHidden();
  await expect(page.locator('.sof-waves-title')).toBeFocused();
});

test('when the line that had focus goes, focus takes the line now in its place', async ({ page }) => {
  const feed = await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await feedStatus(page).focus();
  await tabTo(page, '.sof-banner-ack');
  await expect(page.locator('.sof-banner-ack').first()).toBeFocused(); // the low ceiling at Regina
  feed.metar = STORM_NO_LOW_CYQR();
  await page.getByRole('button', { name: 'Refresh' }).dispatchEvent('click');
  await expect(bannerLines(page)).toHaveCount(1);
  await expect(page.locator('.sof-banner-ack')).toBeFocused();
  // And when there is nothing left to take, focus goes past the banner, not to the page.
  feed.metar = fixture('ui-metno-metar-clear.txt');
  await page.getByRole('button', { name: 'Refresh' }).dispatchEvent('click');
  await expect(banner(page)).toBeHidden();
  await expect(page.locator('.sof-waves-title')).toBeFocused();
});

test('a timeline piece that has focus and then goes gives focus to the piece that is the tab stop now', async ({ page }) => {
  const feed = await openSof(page, CLEAR_FOG);
  await timeline(page).locator('.panel-toggle').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await expect(pieces(page, 'CYMJ').nth(1)).toBeFocused(); // the fog TEMPO
  feed.taf = fixture('ui-metno-taf-fog.txt').replace(' TEMPO 2922/2924 1/2SM FG VV002', '');
  await page.getByRole('button', { name: 'Refresh' }).dispatchEvent('click');
  await expect(pieces(page, 'CYMJ')).toHaveCount(1);
  await expect(pieces(page, 'CYMJ').first()).toBeFocused();
  await expect(tlInfo(page)).toContainText('CYMJ PREVAILING');
});

test('the banner switched off and on again does not bring back what was acknowledged', async ({ page }) => {
  const feed = await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await banner(page).locator('.sof-banner-all').press('Enter');
  await expect(banner(page)).toBeHidden();
  await settingsButton(page).click();
  const switchBox = page.getByLabel('Show the new-caution banner');
  await switchBox.uncheck();
  // The same weather comes in while the banner is off, and once with a caution gone: acknowledgements are kept right.
  await page.getByRole('button', { name: 'Refresh' }).dispatchEvent('click');
  await expect(feedStatus(page)).toHaveText('Weather just now ✓');
  await switchBox.check();
  await expect(banner(page)).toBeHidden();
  // A caution that goes while it is off is new when it comes back, which is the rule with the banner on.
  await switchBox.uncheck();
  feed.metar = fixture('ui-metno-metar-clear.txt');
  await page.getByRole('button', { name: 'Refresh' }).dispatchEvent('click');
  await expect(card(page, 'CYQR').locator('.sof-result')).toContainText('Within limits');
  feed.metar = fixture('ui-metno-metar-storm.txt');
  await page.getByRole('button', { name: 'Refresh' }).dispatchEvent('click');
  await switchBox.check();
  await expect(bannerLines(page)).toHaveCount(2);
});

test('no accessibility violations with the caution banner up (the storm reports)', async ({ page }) => {
  await openSof(page, { metar: fixture('ui-metno-metar-storm.txt') });
  await expect(page.locator('.sof-banner')).toBeVisible();
  await expectNoA11yViolations(page);
});

test('no accessibility violations with a wave and its list of hits open', async ({ page }) => {
  await openSof(page, CLEAR_FOG);
  const row = await addWave(page, 'Aft', '15:30', '17:00');
  await row.locator('.sof-wave-chip').click();
  await expect(page.locator('.sof-wave-detail')).toBeVisible();
  await expectNoA11yViolations(page);
});

// ---- R5: a piece's label is never wider than the piece, and "below" comes first ------------------------------

for (const size of [{ width: 1280, height: 800 }, { width: 1366, height: 768 }]) {
  test.describe(`at ${size.width} × ${size.height}, timeline labels`, () => {
    test.use({ viewport: size });

    test('no piece is cut off by its own label, and a narrow hatched piece still shows the symbol and below first', async ({ page }) => {
      // A 1 h TEMPO and a 2 h TEMPO, both below the limits.
      const taf = 'CYMJ 291740Z 2918/3006 22010KT P6SM SKC TEMPO 2922/2923 1SM BR OVC003 TEMPO 3001/3003 1/2SM FG VV002\n';
      await openSof(page, { metar: fixture('ui-metno-metar-clear.txt'), taf });
      const over = await page.locator('.sof-tl-piece').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => `${el.dataset.id}: ${el.scrollWidth} > ${el.clientWidth}`));
      expect(over).toEqual([]);
      const hatched = page.locator('.sof-tl-row[data-icao="CYMJ"] .sof-tl-piece.is-hatched');
      expect(await hatched.count()).toBeGreaterThan(1);
      for (const label of await hatched.locator('.sof-tl-piece-label').all()) await expect(label).toContainText('▼');
    });
  });
}

test('a wave flown this morning does not keep its fog on the banner all day', async ({ page }) => {
  const taf = 'CYMJ 291140Z 2912/3006 22010KT P6SM SKC TEMPO 2914/2916 1/2SM FG VV002\n';
  await openSof(page, { metar: fixture('ui-metno-metar-clear.txt'), taf });
  await addWave(page, '', '08:00', '09:30'); // 1400Z to 1530Z; the fog ended at 1600Z, 2 h 42 min ago
  await expect(waveRow(page, 0)).toBeVisible();
  await expect(banner(page)).toBeHidden();
});

test('a stale METAR greys the at-the-limit edge and the chips, and keeps the red edge for below the limits (D220)', async ({ page }) => {
  // CYMJ fresh below, CYQR stale at the limit (600-2), CYYN stale below, CYXE fresh at the limit.
  const metar = [
    'CYMJ 291800Z 25010KT 1SM BR BKN003 15/14 A2952',
    'CYQR 290900Z 26005KT 2SM BKN006 10/08 A2995',
    'CYYN 290900Z 24010KT 1SM BR BKN003 15/14 A2951',
    'CYXE 291800Z 28010KT 2SM BKN006 16/03 A2952',
  ].join('\n');
  await openSof(page, { metar });
  const edge = (icao) => card(page, icao).evaluate((el) => getComputedStyle(el).borderLeftColor);
  const chip = (icao) => card(page, icao).locator('.sof-category').evaluate((el) => getComputedStyle(el).color);
  await expect(card(page, 'CYQR').locator('.sof-result')).toContainText('At the limit');
  await expect(card(page, 'CYYN').locator('.sof-result')).toContainText('Below limits');
  expect(await edge('CYQR'), 'the at-the-limit edge greys when stale').not.toBe(await edge('CYXE'));
  expect(await edge('CYYN'), 'below keeps its red edge when stale').toBe(await edge('CYMJ'));
  expect(await chip('CYQR'), 'the chips grey too').not.toBe(await chip('CYXE'));
  expect(await chip('CYYN')).not.toBe(await chip('CYMJ'));
  await expect(card(page, 'CYYN').locator('.sof-category')).toContainText('LIFR');
});
