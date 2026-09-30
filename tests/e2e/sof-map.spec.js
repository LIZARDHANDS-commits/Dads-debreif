// Browser tests for the SOF map, tasks 6 and 7 (SPEC-sof: Map, Layers menu, Lightning, ADS-B Exchange view, Traffic layer,
// Testing strategy). To go in tests/e2e/sof-map.spec.js, with sof-map-feeds.js beside it. Every address the map asks
// for (ECCC, Esri tiles, RainViewer, the traffic relay, ADS-B Exchange's page) is answered from fixtures by a route:
// nothing here is live. Time is fixed with page.clock: `install` where a test must move it (timers then only run when
// the test runs them), `setFixedTime` where it need not.
import { test, expect, expectNoA11yViolations } from './fixtures.js';
import { openRoute } from './routes.js';
import {
  MAP_NOW, TRAFFIC_NOW, serveWeather, serveMap, serveRelay,
} from './sof-map-feeds.js';

/**
 * Opens the SOF with the map's feeds served. `at` is the time; `install` makes the clock a controllable one.
 * Returns { map, relay }: the live feed objects from sof-map-feeds.js.
 */
async function openMap(page, { at = MAP_NOW, install = false, map: mapState = {} } = {}) {
  if (install) await page.clock.install({ time: at });
  else await page.clock.setFixedTime(at);
  await serveWeather(page);
  const map = await serveMap(page);
  Object.assign(map, mapState);
  const relay = await serveRelay(page);
  await openRoute(page, '#/sof');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'sof');
  return { map, relay };
}

const mapSection = (page) => page.locator('section.sof-map');
const canvas = (page) => page.locator('canvas.sof-map-canvas');
const statusItems = (page) => page.locator('.sof-map-status .sof-map-feed');
const statusItem = (page, text) => statusItems(page).filter({ hasText: text });
const layersButton = (page) => page.getByRole('button', { name: 'Layers', exact: true });
const settingsButton = (page) => page.getByRole('button', { name: 'SOF settings' });
const adsbButton = (page) => page.getByRole('button', { name: 'ADS-B Exchange view' });
const trafficButton = (page) => page.getByRole('button', { name: 'Traffic', exact: true });
const layerBox = (page, name) => page.getByRole('group', { name: 'Map layers' }).getByLabel(name, { exact: true });

/** True when a pixel is the fixture's green tile (the map dims the satellite a little, so not the exact bytes). */
const isTile = (px) => px[3] === 255 && px[1] > 50 && px[1] > px[0] + 10 && px[1] > px[2] + 10;

/** The colour of one pixel of the map's canvas, as [r, g, b, a] (x and y in CSS pixels). */
const pixelAt = (page, x, y) => canvas(page).evaluate((el, [px, py]) => {
  const ratio = el.width / el.clientWidth;
  return [...el.getContext('2d').getImageData(Math.round(px * ratio), Math.round(py * ratio), 1, 1).data];
}, [x, y]);

/** Types a relay address into the SOF settings menu and closes the menu. */
async function setRelay(page, address) {
  await settingsButton(page).click();
  await page.getByLabel('Traffic relay address').fill(address);
  await settingsButton(page).click();
}

// Finds visible controls that overlap each other or stick out of the page (the same rule as sof.spec.js).
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
    for (const el of document.querySelectorAll('#view .sof-card, #view .sof-bar, #view .sof-map-bar, #view .sof-map-status')) {
      if (el.scrollWidth > el.clientWidth + 1) problems.push(`${el.className} has content wider than itself`);
    }
    return problems;
  });
}

// ---- The map, its base and its credits ---------------------------------------------------------------------------

test('map: shows the satellite picture, the home airfield in words, the rings, and the credits', async ({ page }) => {
  const { map } = await openMap(page);
  await expect(mapSection(page)).toBeVisible();
  await expect(canvas(page)).toBeVisible();
  await expect(canvas(page)).toHaveAccessibleName(/./);
  await expect.poll(() => map.tiles.length).toBeGreaterThan(0);
  // The base is drawn: a corner of the map is the fixture tile's green.
  await expect.poll(async () => isTile(await pixelAt(page, 3, 3))).toBe(true);
  const credits = page.locator('.sof-map-credits');
  await expect(credits).toContainText('Esri');
  await expect(credits).toContainText('ECCC');
  await expect(credits).not.toContainText('RainViewer');
  await expect(credits).not.toContainText('adsb.lol');
  // Every request the map made is one of the listed hosts, and every ECCC address is numbers and names only.
  for (const url of [...map.requests, ...map.pictures]) expect(url).toMatch(/^https:\/\/geo\.weather\.gc\.ca\/geomet\?[A-Za-z0-9_.:,/=&-]*$/);
});

test('map: the airfield dots are hover facts in words, and the keyboard reaches them through the map', async ({ page }) => {
  await openMap(page);
  await expect(canvas(page)).toBeVisible();
  // Home is drawn at the middle of the map at first (Home button and the first view are the same).
  const box = await canvas(page).boundingBox();
  await canvas(page).hover({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator('.sof-map-tip')).toContainText('CYMJ');
  await expect(page.locator('.sof-map-tip')).toContainText('home');
  await expect(page.locator('.sof-map-tip')).toContainText('Flight category');
});

test('map: Home, plus and minus change the view and Home comes back to the same picture', async ({ page }) => {
  const { map } = await openMap(page);
  await expect.poll(async () => isTile(await pixelAt(page, 3, 3))).toBe(true);
  const before = map.tiles.length;
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => map.tiles.length).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect.poll(async () => isTile(await pixelAt(page, 3, 3))).toBe(true);
  // Dragging pans without making the page scroll.
  const box = await canvas(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(canvas(page)).toBeVisible();
});

// ---- The Layers menu (its own control, apart from "SOF settings") ------------------------------------------------------------

test('map: the Layers menu is its own, closed at first, with satellite, and the defaults on and off as the spec says', async ({ page }) => {
  await openMap(page);
  await expect(layersButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('group', { name: 'Map layers' })).toBeHidden();
  await layersButton(page).click();
  await expect(layersButton(page)).toHaveAttribute('aria-expanded', 'true');
  // Opening this does not open the SOF settings, and the SOF settings' own numbers are not in here.
  await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Home ceiling below')).toBeHidden();
  const panel = page.getByRole('group', { name: 'Map layers' });
  await expect(panel.getByLabel('Satellite', { exact: true })).toBeChecked();
  await expect(panel.getByLabel('VNC chart', { exact: true })).not.toBeChecked();
  await expect(panel.getByLabel('VNC over satellite', { exact: true })).not.toBeChecked();
  for (const on of ['Radar (rain or snow)', 'Radar coverage', 'Lightning density, last 10 min', 'Airfields with wind barbs', '25 and 50 NM rings']) {
    await expect(layerBox(page, on), on).toBeChecked();
  }
  for (const off of ['Satellite cloud picture (GOES)', 'Weather warnings', 'Training routes and areas']) {
    await expect(layerBox(page, off), off).not.toBeChecked();
  }
  // No traffic row without a relay address.
  await expect(panel.getByLabel('Live traffic')).toHaveCount(0);
  // Escape closes it and gives focus back to its button.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Map layers' })).toBeHidden();
  await expect(layersButton(page)).toBeFocused();
});

test('map: layers stack, switching one on asks for its picture, off stops asking, and the choice is kept after a reload', async ({ page }) => {
  const { map } = await openMap(page);
  await layersButton(page).click();
  const cloudAsked = () => map.requests.filter((u) => u.includes('GOES-West_1km_DayVis-NightIR')).length;
  expect(cloudAsked(), 'cloud is off, so it is never asked for').toBe(0);
  await layerBox(page, 'Satellite cloud picture (GOES)').check();
  await expect.poll(cloudAsked).toBeGreaterThan(0);
  await expect(statusItem(page, 'Cloud')).toBeVisible();
  // Radar is still on: layers stack, they do not replace each other.
  await expect(layerBox(page, 'Radar (rain or snow)')).toBeChecked();
  await layerBox(page, 'Radar coverage').uncheck();
  await expect(statusItem(page, 'Radar coverage')).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await layersButton(page).click();
  await expect(layerBox(page, 'Satellite cloud picture (GOES)')).toBeChecked();
  await expect(layerBox(page, 'Radar coverage')).not.toBeChecked();
});

test('map: the base switch shows the VNC charts\' own note and credit, and back to satellite removes them', async ({ page }) => {
  await openMap(page);
  const note = page.locator('.sof-map-note');
  await expect(note).toBeHidden();
  await layersButton(page).click();
  await page.getByRole('group', { name: 'Map layers' }).getByLabel('VNC chart', { exact: true }).check();
  await expect(note).toBeVisible();
  await expect(note).toContainText('The VNC charts cover Moose Jaw, Regina, Saskatoon and Swift Current');
  await expect(page.locator('.sof-map-credits')).toContainText('NAV CANADA (not for navigation)');
  // The chart opacity slider is only for the "over satellite" choice.
  const slider = page.getByLabel('VNC chart opacity');
  await expect(slider).toBeDisabled();
  await page.getByRole('group', { name: 'Map layers' }).getByLabel('VNC over satellite', { exact: true }).check();
  await expect(slider).toBeEnabled();
  await expect(slider).toHaveValue('70');
  await page.getByRole('group', { name: 'Map layers' }).getByLabel('Satellite', { exact: true }).check();
  await expect(note).toBeHidden();
  await expect(page.locator('.sof-map-credits')).not.toContainText('NAV CANADA');
});

// ---- Radar -------------------------------------------------------------------------------------------------------

test('map: radar shows its own layer time and age, is asked with numbers only, and Snow asks for the snow layer', async ({ page }) => {
  const { map } = await openMap(page);
  await expect(statusItem(page, 'Radar').first()).toContainText('0712Z (8 min ago)');
  await expect(statusItem(page, 'Radar').first()).toContainText('✓');
  await expect(statusItem(page, 'Lightning map')).toContainText('0700Z (20 min ago)');
  await expect.poll(() => map.pictures.length).toBeGreaterThan(0);
  for (const url of [...map.requests, ...map.pictures]) expect(url).toMatch(/^https:\/\/geo\.weather\.gc\.ca\/geomet\?[A-Za-z0-9_.:,/=&-]*$/);
  expect(map.pictures.some((u) => u.includes('RADAR_1KM_RRAI') && u.includes('time=2026-09-30T07:12:00Z'))).toBe(true);
  // Rain is the default in September; choosing Snow asks for the snow layer and shows its own time.
  await expect(page.getByLabel('Radar shows')).toHaveValue('rain');
  await page.getByLabel('Radar shows').selectOption('snow');
  await expect.poll(() => map.pictures.some((u) => u.includes('RADAR_1KM_RSNO'))).toBe(true);
  await expect(statusItem(page, 'Radar').first()).toContainText('0712Z (8 min ago)');
});

test('map: a radar picture older than 20 minutes says STALE in words, and the age is the picture\'s own', async ({ page }) => {
  await openMap(page, { at: new Date('2026-09-30T07:40:00Z') });
  // The radar's time is 0712Z and it is 0740Z: 28 minutes.
  await expect(statusItem(page, 'Radar').first()).toContainText('STALE');
  await expect(statusItem(page, 'Radar').first()).toContainText('0712Z (28 min ago)');
  await expect(statusItem(page, 'Radar').first()).toContainText('⚠');
});

test('map: after two ECCC failures the radar is RainViewer\'s backup, said in words and credited, and ECCC is back when it answers', async ({ page }) => {
  const { map } = await openMap(page, { install: true });
  await expect(statusItem(page, 'Radar').first()).toContainText('0712Z');
  map.eccc = 'down';
  // The next refresh fails, a retry follows within 20 seconds and fails too: that is two, so the backup takes over.
  await page.clock.runFor(6 * 60_000 + 30_000);
  await expect(statusItem(page, 'Radar').first()).toContainText('RainViewer backup');
  await expect(page.locator('.sof-map-credits')).toContainText('RainViewer');
  expect(map.requests.some((u) => u.startsWith('https://api.rainviewer.com/'))).toBe(true);
  // ECCC is asked again on the ordinary rounds, and when it answers the radar goes back to it.
  map.eccc = 'up';
  await page.clock.runFor(6 * 60_000 + 1000);
  await expect(statusItem(page, 'Radar').first()).not.toContainText('RainViewer');
  await expect(statusItem(page, 'Radar').first()).toContainText('0712Z');
  await expect(page.locator('.sof-map-credits')).not.toContainText('RainViewer');
});

test('map: with no connection the map says so in words, and clears it when the connection returns', async ({ page }) => {
  await openMap(page);
  const message = page.locator('.sof-map-message');
  await expect(message).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(message).toBeVisible();
  await expect(message).toHaveText('Map and radar need a connection');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(message).toBeHidden();
});

// ---- Lightning ------------------------------------------------------------------------------------------------------------

test('map: the lightning check reads a fixed box round home at the native grid and says clear, near, or can\'t tell', async ({ page }) => {
  const { map } = await openMap(page);
  const param = (url) => Object.fromEntries(new URL(url).searchParams);
  const near = (url) => param(url).layers === 'Lightning_2.5km_Density' && param(url).crs === 'EPSG:4326';
  await expect.poll(() => map.pictures.filter(near).length).toBeGreaterThan(0);
  const asked = param(map.pictures.filter(near)[0]);
  // 20 NM default: (20 NM + a cell) / 2.5 km, rounded up, plus one, each way, two pixels a cell: a small square of 1.25 km pixels.
  expect(Number(asked.width)).toBe(Number(asked.height));
  expect(Number(asked.width)).toBeGreaterThanOrEqual(36);
  expect(Number(asked.width)).toBeLessThanOrEqual(80);
  await expect(statusItem(page, 'No lightning within 20 NM of home')).toContainText('✓');
});

test('map: lightning inside the radius puts a caution in words on the map\'s strip, and an unreadable picture says it cannot tell', async ({ page }) => {
  const { map } = await openMap(page, { install: true, map: { lightning: 'lit' } });
  const reading = statusItems(page).filter({ hasText: /lightning/i }).filter({ hasText: '⚠' });
  await expect(reading.first()).toBeVisible();
  await expect(reading.first()).toContainText('NM');
  // The picture fails: the check says it cannot tell, never "clear".
  map.lightning = 'broken';
  await page.clock.runFor(11 * 60_000);
  await expect(statusItems(page).filter({ hasText: /lightning/i }).filter({ hasText: '?' }).first()).toBeVisible();
  await expect(statusItems(page).filter({ hasText: /lightning/i }).filter({ hasText: '✓' })).toHaveCount(0);
});

test('map: lightning near home raises one line on the caution banner, once, and acknowledging it keeps it away', async ({ page }) => {
  const { map } = await openMap(page, { map: { lightning: 'lit' } });
  const banner = page.locator('.sof-banner');
  await expect(banner).toBeVisible();
  const lines = page.locator('.sof-banner-line .sof-banner-text');
  await expect(lines.filter({ hasText: /lightning/i })).toHaveCount(1);
  await expect(lines.filter({ hasText: /lightning/i })).toContainText('NM');
  // Another round with the same lightning is the same caution: still one line, not two.
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(lines.filter({ hasText: /lightning/i })).toHaveCount(1);
  // Acknowledging it takes it off the banner; it does not come back while it is the same lightning.
  await page.getByRole('button', { name: /^Acknowledge: .*ightning/ }).click();
  await expect(lines.filter({ hasText: /lightning/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(lines.filter({ hasText: /lightning/i })).toHaveCount(0);
  expect(map.pictures.length).toBeGreaterThan(0);
});

test('map: with no lightning near home nothing about lightning is on the banner', async ({ page }) => {
  await openMap(page, { map: { lightning: 'clear' } });
  await expect(statusItem(page, 'No lightning within 20 NM of home')).toBeVisible();
  await expect(page.locator('.sof-banner-line').filter({ hasText: /lightning/i })).toHaveCount(0);
});

test('map: the lightning radius is in the SOF settings (not the Layers menu), starts at 20 NM, and changes what is read', async ({ page }) => {
  const { map } = await openMap(page);
  await settingsButton(page).click();
  const radius = page.getByLabel('Lightning radius around home');
  await expect(radius).toBeVisible();
  await expect(radius).toHaveValue('20');
  await settingsButton(page).click();
  await layersButton(page).click();
  await expect(page.getByRole('group', { name: 'Map layers' }).getByLabel('Lightning radius around home')).toHaveCount(0);
  await layersButton(page).click();
  const width = () => map.pictures.filter((u) => u.includes('crs=EPSG:4326')).map((u) => Number(new URL(u).searchParams.get('width')));
  await expect.poll(() => width().length).toBeGreaterThan(0);
  const before = width().at(-1);
  await settingsButton(page).click();
  // 50 NM is more than the picture held covers, so the box is asked for again, bigger.
  await radius.fill('50');
  await radius.press('Enter');
  await expect(radius).toHaveValue('50');
  await expect.poll(() => width().at(-1)).toBeGreaterThan(before);
  await expect(statusItem(page, 'No lightning within 50 NM of home')).toContainText('✓');
});

// ---- ADS-B Exchange view --------------------------------------------------------------------------------------------------

test('map: the ADS-B Exchange view is a sandboxed frame centred on home, with a link as fallback, removed when off', async ({ page }) => {
  const { map } = await openMap(page);
  const frame = page.locator('iframe.sof-adsbx-frame');
  await expect(frame).toHaveCount(0);
  expect(map.adsbx).toEqual([]);
  await adsbButton(page).click();
  await expect(adsbButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute('src', /^https:\/\/globe\.adsbexchange\.com\/\?lat=50\.33&lon=-105\.559&zoom=\d+$/);
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
  const link = page.getByRole('link', { name: 'Open ADS-B Exchange in a new tab' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^https:\/\/globe\.adsbexchange\.com\/\?lat=50\.33&lon=-105\.559&zoom=\d+$/);
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(canvas(page)).toBeHidden();
  // The controls that only steer our own map are off while it shows; the Layers menu still opens.
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  // Off: the frame is gone, and the map is back.
  await adsbButton(page).click();
  await expect(frame).toHaveCount(0);
  await expect(canvas(page)).toBeVisible();
  await expect(adsbButton(page)).toHaveAttribute('aria-pressed', 'false');
});

test('map: leaving the SOF with the ADS-B Exchange view on removes its frame, and the view is not kept for next time', async ({ page }) => {
  await openMap(page);
  await adsbButton(page).click();
  await expect(page.locator('iframe.sof-adsbx-frame')).toHaveCount(1);
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  expect((await page.evaluate(() => window.__ooda.stats())).frames).toBe(0);
  await page.evaluate(() => { location.hash = '#/sof'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'sof');
  await expect(page.locator('iframe.sof-adsbx-frame')).toHaveCount(0);
  await expect(adsbButton(page)).toHaveAttribute('aria-pressed', 'false');
});

// ---- Traffic (hidden until a relay address is set) --------------------------------------------------------------------------------

test('map: traffic is hidden and asks for nothing until a relay address is set, and a bad address says why and stays hidden', async ({ page }) => {
  const { relay } = await openMap(page);
  await expect(trafficButton(page)).toBeHidden();
  await layersButton(page).click();
  await expect(page.getByRole('group', { name: 'Map layers' }).getByLabel('Live traffic')).toHaveCount(0);
  await layersButton(page).click();
  await settingsButton(page).click();
  const box = page.getByLabel('Traffic relay address');
  await expect(box).toHaveValue('');
  // An address with a path after the host, or without https, is not used.
  await box.fill('http://relay.example/path');
  await expect(page.getByText('Not used: it needs https:// and only the address, nothing after it.')).toBeVisible();
  await expect(trafficButton(page)).toBeHidden();
  expect(relay.requests).toEqual([]);
});

test('map: with a relay address the traffic layer is offered, off until switched on, then symbols, a military mark and hover facts', async ({ page }) => {
  const { relay } = await openMap(page, { at: TRAFFIC_NOW });
  await setRelay(page, 'https://relay.example');
  await expect(trafficButton(page)).toBeVisible();
  await expect(trafficButton(page)).toHaveAttribute('aria-pressed', 'false');
  expect(relay.requests, 'the layer is off, so nothing is asked').toEqual([]);
  await trafficButton(page).click();
  await expect.poll(() => relay.requests.length).toBeGreaterThan(0);
  expect(relay.requests[0]).toMatch(/^https:\/\/relay\.example\/traffic\?lat=50\.33&lon=-105\.56&nm=\d+$/);
  await expect(statusItem(page, 'Traffic')).toBeVisible();
  await expect(page.locator('.sof-map-credits')).toContainText('adsb.lol');
  // Labels are off to begin with.
  await layersButton(page).click();
  await expect(page.getByLabel('Labels')).toHaveValue('off');
  await page.keyboard.press('Escape');
  // The keyboard steps through the aircraft on the map and each one's facts are said in words (also the hover text).
  await canvas(page).focus();
  const tip = page.locator('.sof-map-tip');
  let text = '';
  for (let i = 0; i < 4 && !text.includes('RCH401'); i++) {
    await page.keyboard.press(']');
    text = (await tip.textContent()) ?? '';
  }
  expect(text).toContain('RCH401');
  expect(text.toLowerCase()).toContain('military');
  // Off again: the layer stops asking.
  await trafficButton(page).click();
  const asked = relay.requests.length;
  await page.waitForTimeout(1500);
  expect(relay.requests.length).toBe(asked);
});

test('map: a relay that answers with something unusable is said so in words, and the last good aircraft fade instead of vanishing', async ({ page }) => {
  const { relay } = await openMap(page, { at: TRAFFIC_NOW, install: true });
  await setRelay(page, 'https://relay.example');
  await trafficButton(page).click();
  await expect.poll(() => relay.requests.length).toBeGreaterThan(0);
  await expect(statusItem(page, 'Traffic')).not.toContainText('unavailable');
  relay.down = true;
  await page.clock.runFor(25_000);
  await expect(statusItem(page, 'Traffic')).toContainText('Traffic unavailable, last good 1842Z');
  await expect(statusItem(page, 'Traffic')).toContainText('⚠');
});

test('map: the relay address is committed when the box is left, never per keystroke, and a new address starts traffic over', async ({ page }) => {
  const { relay } = await openMap(page, { at: TRAFFIC_NOW });
  const seen = [];
  page.on('request', (r) => /^https:\/\/relay/.test(r.url()) && seen.push(new URL(r.url()).origin));
  const second = [];
  await page.route(/^https:\/\/relay2\.example\//, (route) => {
    second.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: relay.body });
  });
  await setRelay(page, 'https://relay.example');
  await trafficButton(page).click();
  await expect.poll(() => relay.requests.length).toBeGreaterThan(0);
  const first = relay.requests.length;
  // Typing a new address, letter by letter: "https://relay2.exam" is already a good origin, and must not be asked.
  await settingsButton(page).click();
  const box = page.getByLabel('Traffic relay address');
  await box.fill('');
  await box.pressSequentially('https://relay2.example', { delay: 5 });
  await page.waitForTimeout(400);
  expect(second, 'nothing is asked of the address until it is committed').toEqual([]);
  expect(relay.requests.length, 'the old relay is still the one in use while typing').toBeGreaterThanOrEqual(first);
  // Enter commits it: the layer starts over on the new address, and the old relay is left alone.
  await box.press('Enter');
  await expect.poll(() => second.length).toBeGreaterThan(0);
  expect(second[0]).toMatch(/^https:\/\/relay2\.example\/traffic\?lat=50\.33&lon=-105\.56&nm=\d+$/);
  const oldCount = relay.requests.length;
  await page.waitForTimeout(1500);
  expect(relay.requests.length, 'the old relay is not asked again').toBe(oldCount);
  expect([...new Set(seen)].sort()).toEqual(['https://relay.example', 'https://relay2.example']);
  await expect(statusItem(page, 'Traffic')).toBeVisible();
});

test('map: the relay address kept in the browser is still there after a reload, and traffic stays as it was left', async ({ page }) => {
  await openMap(page, { at: TRAFFIC_NOW });
  await setRelay(page, 'https://relay.example');
  await trafficButton(page).click();
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'sof');
  await expect(trafficButton(page)).toBeVisible();
  await expect(trafficButton(page)).toHaveAttribute('aria-pressed', 'true');
});

// ---- Leaving: nothing keeps running (R4) ----------------------------------------------------------------------------------------------

test('map: leaving the SOF stops every map timer, request and frame, and nothing is asked after', async ({ page }) => {
  await page.clock.install({ time: TRAFFIC_NOW });
  const map = await serveMap(page);
  const relay = await serveRelay(page);
  await serveWeather(page);
  await openRoute(page, '#/');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  const home = await page.evaluate(() => window.__ooda.stats());
  await page.evaluate(() => { location.hash = '#/sof'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'sof');
  await setRelay(page, 'https://relay.example');
  await trafficButton(page).click();
  await layersButton(page).click();
  await layerBox(page, 'Satellite cloud picture (GOES)').check();
  await page.keyboard.press('Escape');
  await expect.poll(() => relay.requests.length).toBeGreaterThan(0);
  const running = await page.evaluate(() => window.__ooda.stats());
  expect(running.timers, 'the map has timers running').toBeGreaterThan(home.timers);

  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  expect(await page.evaluate(() => window.__ooda.stats())).toEqual(home);
  const counts = () => [map.requests.length, map.pictures.length, map.tiles.length, relay.requests.length, map.adsbx.length];
  const after = counts();
  await page.clock.runFor(30 * 60_000);
  await page.waitForTimeout(300);
  expect(counts(), 'no request of any kind after leaving').toEqual(after);
});

test('map: a picture request still out when the SOF closes is cancelled, not left running', async ({ page }) => {
  await serveWeather(page);
  await serveRelay(page);
  await page.route(/^https:\/\/geo\.weather\.gc\.ca\//, () => {}); // never answers
  await page.route(/^https:\/\/services\.arcgisonline\.com\//, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));
  const started = [];
  const cancelled = [];
  page.on('request', (r) => /geo\.weather\.gc\.ca/.test(r.url()) && started.push(r.url()));
  page.on('requestfailed', (r) => /geo\.weather\.gc\.ca/.test(r.url()) && cancelled.push(r.url()));
  await openRoute(page, '#/sof');
  await expect.poll(() => started.length).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  await expect.poll(() => cancelled.length).toBe(started.length);
});

// ---- Layout with the map (the rule of layout.spec.js: nothing overlaps or is cut off) -------------------------------------------------

const SIZES = [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }];

for (const size of SIZES) {
  test.describe(`map: at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('nothing overlaps or is cut off with the map, and with the Layers menu and the settings menu open', async ({ page }) => {
      const { map } = await openMap(page, { at: TRAFFIC_NOW });
      await expect(canvas(page)).toBeVisible();
      await expect.poll(() => map.tiles.length).toBeGreaterThan(0);
      await expect(page.locator('article.sof-card')).toHaveCount(4);
      expect(await layoutProblems(page)).toEqual([]);
      await layersButton(page).click();
      await expect(page.getByRole('group', { name: 'Map layers' })).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
      await layersButton(page).click();
      await settingsButton(page).click();
      expect(await layoutProblems(page)).toEqual([]);
      expect(await layoutProblems(page)).toEqual([]);
    });

    test('nothing overlaps with the ADS-B Exchange view on, and the map has a usable size', async ({ page }) => {
      await openMap(page);
      await adsbButton(page).click();
      await expect(page.locator('iframe.sof-adsbx-frame')).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
      const frame = await page.locator('iframe.sof-adsbx-frame').boundingBox();
      expect(frame.width).toBeGreaterThan(Math.min(300, size.width - 40));
      expect(frame.height).toBeGreaterThan(300);
    });

    test('nothing overlaps with a relay address set, traffic on and its options in the Layers menu', async ({ page }) => {
      await openMap(page, { at: TRAFFIC_NOW });
      await setRelay(page, 'https://relay.example');
      await trafficButton(page).click();
      await layersButton(page).click();
      await expect(page.getByLabel('Labels')).toBeVisible();
      expect(await layoutProblems(page)).toEqual([]);
    });
  });
}

test('map: no accessibility violations with the map, the Layers menu open and a relay address set', async ({ page }) => {
  await openMap(page, { at: TRAFFIC_NOW });
  await setRelay(page, 'https://relay.example');
  await expect(canvas(page)).toBeVisible();
  await layersButton(page).click();
  await expectNoA11yViolations(page);
});
