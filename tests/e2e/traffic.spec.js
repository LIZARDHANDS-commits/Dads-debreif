// Browser tests for the Traffic Pattern Sim (SPEC-traffic: Testing strategy). Every test
// fails on a console error (fixtures.js, R7). Most run on a test page that mounts the sim
// on the real shell host, straight from src/ (pages/traffic.html), so they don't wait for
// the sim's entry in src/shell/registry.js; the last two tests go through the route.
import { test, expect, expectNoA11yViolations } from './fixtures.js';
import { fileURLToPath } from 'node:url';
import { serveDist } from './static-server.js';
import { openRoute } from './routes.js';

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
  await page.getByLabel('Conflict: lateral').fill('8000'); // big enough to beat the 8 px smallest bubble at the fitted zoom
  await expect.poll(() => picture(page)).not.toBe(before);
  const withTrails = await picture(page);
  await page.getByRole('button', { name: /^Layers/ }).click();
  await expect(page.getByLabel('Trails')).toBeChecked();
  await page.getByLabel('Trails').uncheck();
  await expect(page.getByLabel('Trails')).not.toBeChecked();
  await expect.poll(() => picture(page)).not.toBe(withTrails); // the trails are gone from the map
});

test('spawn an aircraft and it appears in the list, waits for its delay, and flies; a bad start point says what to change', async ({ page }) => {
  await open(page);
  const rows = page.locator('.aircraft-row');
  await expect(rows).toHaveCount(7);
  await page.getByLabel('Delay', { exact: true }).fill('5');
  await button(page, '+ Spawn').click();
  await expect(rows).toHaveCount(8);
  await expect(rows.last()).toContainText('A8 CT-156 on Entry 1');
  await expect(rows.last()).toContainText('Waiting, starts at 0:05');
  await expect(page.locator('.spawn-message')).toHaveText('Added A8.');
  await playButton(page).click();
  await expect(rows.last()).toContainText('Flying');
  await playButton(page).click();
  await page.getByLabel('Start at point', { exact: true }).fill('9');
  await button(page, '+ Spawn').click();
  await expect(page.locator('.spawn-message')).toContainText('Entry 1 has 4 points');
  await expect(rows).toHaveCount(8);
});

test('the Traffic settings menu opens, and a route point can be changed on the left', async ({ page }) => {
  await open(page);
  const menu = page.getByRole('button', { name: /^Traffic settings/ });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await menu.click();
  // Pick Pattern 1: its points show, with every box filled in.
  await page.locator('[data-route-id="PAT1"]').click();
  await expect(page.locator('.point-table-title')).toHaveText('Pattern 1');
  const rows = page.locator('.point-row');
  await expect(rows).toHaveCount(13);
  const alt = rows.nth(2).getByLabel('Alt ft', { exact: true });
  await expect(alt).toHaveValue('3500');
  const before = await picture(page);
  await alt.fill('3400');
  await expect(rows.nth(2).locator('.point-data')).toContainText('3400ft');
  await expect(alt).toHaveValue('3400');
  await page.waitForTimeout(100);
  expect(await picture(page)).not.toBe(before); // the map shows the new height label
  // An out-of-range height is refused in words and the last good value stays.
  await alt.fill('99999');
  await alt.blur();
  await expect(rows.nth(2).locator('.control-message').first()).toContainText('from -1,000 to 20,000');
  await expect(rows.nth(2).locator('.point-data')).toContainText('3400ft');
});

test('+ Point and Delete point change the number of points; a new route is picked and its points show', async ({ page }) => {
  await open(page);
  await page.locator('[data-route-id="PAT1"]').click();
  const rows = page.locator('.point-row');
  await rows.nth(3).getByLabel('Point 4 label').focus();
  await button(page, '+ Point').click();
  await expect(rows).toHaveCount(14);
  await expect(page.locator('.editor-message')).toContainText('Added point 5');
  await expect(rows.nth(4).getByLabel('Point 5 label')).toHaveValue('New Point');
  await button(page, 'Delete point').click();
  await expect(rows).toHaveCount(13);
  // + New route > Entry makes Entry 5, joined to Pattern 1, and picks it.
  await button(page, '+ New route').click();
  await button(page, 'Entry').click();
  await expect(page.locator('[data-route-id]')).toHaveCount(10);
  await expect(page.locator('.point-table-title')).toHaveText('Entry 5');
  await expect(rows).toHaveCount(4);
  await expect(page.locator('.editor-link select').first()).toHaveValue('PAT1');
  // The spawner can send an aircraft down it.
  await expect(page.locator('#traffic-spawn-route option')).toHaveCount(10);
});

// Keyboard only: Tab goes left to right (routes, the bar, then the aircraft column), Space and Enter
// press Play, and Escape closes an open menu and gives focus back to its button.
test('keyboard only: Tab order, Space and Enter on Play, Escape closes the Layers and Traffic settings menus', async ({ page }) => {
  await open(page);
  const focused = () => page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute('aria-label') || el?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 30) || el?.tagName;
  });
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const order = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    order.push(await focused());
  }
  const at = (name) => order.findIndex((n) => n.includes(name));
  const inOrder = ['Routes', 'Pattern 1', 'Entry 1', '+ New route', 'Play', 'Reset', 'Layers', 'Fit', 'Aircraft'];
  const places = inOrder.map(at);
  expect(places.every((n) => n >= 0), `every stop is reached: ${order.join(' | ')}`).toBe(true);
  expect(places, `in this order: ${order.join(' | ')}`).toEqual([...places].sort((a, b) => a - b));
  // Enter and Space on the focused Play button.
  await playButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Running');
  await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Paused');
  await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Running');
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Paused');
  // Escape closes the Layers menu, and focus goes back to its button.
  const layers = page.getByRole('button', { name: /^Layers/ });
  await layers.focus();
  await page.keyboard.press('Enter');
  await expect(layers).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(layers).toHaveAttribute('aria-expanded', 'false');
  await expect(layers).toBeFocused();
  // The same for the Traffic settings menu, opened and used from the keyboard.
  const menu = page.getByRole('button', { name: /^Traffic settings/ });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Conflict: lateral')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
});

test('the routes and points are reachable and changeable from the keyboard alone', async ({ page }) => {
  await open(page);
  await page.locator('[data-route-id="ENT1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.point-table-title')).toHaveText('Entry 1');
  await page.locator('.point-row').nth(1).getByLabel('Alt ft', { exact: true }).focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('3200');
  await expect(page.locator('.point-row').nth(1).locator('.point-data')).toContainText('3200ft');
  await button(page, '+ Point').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.point-row')).toHaveCount(5);
  await expect(page.locator('.point-row').nth(2).getByLabel('Point 3 label')).toBeFocused();
});

test('no accessibility violations at first, with a route picked, and with the settings menu open', async ({ page }) => {
  await open(page);
  await expectNoA11yViolations(page);
  await page.locator('[data-route-id="SPL1"]').click();
  await expect(page.locator('.point-row')).toHaveCount(7);
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: /^Traffic settings/ }).click();
  await page.getByRole('button', { name: /^Layers/ }).click();
  await button(page, '+ Spawn').click();
  await expectNoA11yViolations(page);
});

// A hint under a box shows while the box has focus. It must never move the Reset button: the
// first click on Reset blurs the box, and if the button moved away the click was lost.
test('Reset to defaults works on the first real click after typing in a settings box, and the button never moves', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Traffic settings/ }).click();
  const lateral = page.getByLabel('Conflict: lateral');
  const reset = page.getByRole('button', { name: 'Reset to defaults' });
  // The menu is longer than the screen, so the column scrolls when a box takes focus; the button's place is
  // measured from that box, which moves with it.
  const gap = async () => (await reset.boundingBox()).y - (await lateral.boundingBox()).y;
  const gapWithout = await gap();
  await lateral.focus();
  await expect(page.locator('.settings-item:focus-within .settings-hint')).toBeVisible();
  expect(await gap(), 'the hint takes no room').toBe(gapWithout);
  await lateral.fill('350');
  await expect(lateral).toHaveValue('350');
  expect(await gap()).toBe(gapWithout);
  await reset.scrollIntoViewIfNeeded();
  await reset.click(); // one real mouse click
  await expect(lateral).toHaveValue('200');
  // The same after Enter.
  await lateral.fill('350');
  await lateral.press('Enter');
  expect(await gap()).toBe(gapWithout);
  await reset.scrollIntoViewIfNeeded();
  await reset.click();
  await expect(lateral).toHaveValue('200');
});

test('the Conflicts list says "No conflicts." until two aircraft are close, then names the pair with a word and a symbol', async ({ page }) => {
  await open(page);
  const list = page.getByRole('region', { name: 'Conflicts' });
  await expect(list).toContainText('No conflicts.');
  await button(page, '+ Spawn').click();
  await button(page, '+ Spawn').click(); // two aircraft at the same point at the same moment
  await expect(list).toContainText('⚠ CONFLICT A8/A9: 0 ft lat, 0 ft vert');
  await expect(list.locator('.conflict-none')).toBeHidden();
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

test('on a phone (390 px wide) the page does not scroll sideways and the map keeps a useful size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const box = await map(page).boundingBox();
  expect(box.height).toBeGreaterThan(250);
  expect(box.width).toBeGreaterThan(300);
  await page.locator('[data-route-id="PAT1"]').click();
  await expect(page.locator('.point-row').first()).toBeVisible();
});

// The route tests: the Traffic Sim's card opens it, and a direct link does too.
// The header's own button is named exactly 'Settings': the sim's menu is "Traffic settings".
test('opens from its card on the home screen', async ({ page }) => {
  await openRoute(page, '#/');
  await page.locator('a.card[href="#/traffic"]').click();
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'traffic');
  await expect(playButton(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('the route opens from a direct link and plays, spawns and edits a point', async ({ page }) => {
  await openRoute(page, '#/traffic');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'traffic');
  await expect(status(page)).toHaveText('Paused');
  await playButton(page).click();
  await expect(status(page)).toHaveText('Running');
  await playButton(page).click();
  await button(page, '+ Spawn').click();
  await expect(page.locator('.aircraft-row')).toHaveCount(8);
  await page.getByRole('button', { name: /^Traffic settings/ }).click();
  await page.locator('[data-route-id="PAT1"]').click();
  await page.locator('.point-row').nth(2).getByLabel('Alt ft', { exact: true }).fill('3400');
  await expect(page.locator('.point-row').nth(2).locator('.point-data')).toContainText('3400ft');
});


// ---- The satellite photo (task 8) ---------------------------------------------------------------
const ESRI = /^https:\/\/services\.arcgisonline\.com\//;
const credit = (page) => page.locator('.traffic-credit');
const layersMenu = (page) => page.getByRole('button', { name: 'Layers' });

test('the photo is on at first with Esri\'s credit on the map; Layers switches it off and on, and off asks for nothing', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => ESRI.test(r.url()) && asked.push(r.url()));
  await open(page);
  await expect(credit(page)).toHaveText(/^Imagery: Esri/);
  expect(asked.length).toBeGreaterThan(0);
  expect(asked.every((url) => /\/tile\/\d+\/\d+\/\d+$/.test(url))).toBe(true);
  await layersMenu(page).click();
  const photo = page.getByLabel('Satellite photo');
  await expect(photo).toBeChecked();
  await photo.uncheck();
  await expect(credit(page)).toBeHidden();
  await photo.check();
  await expect(credit(page)).toHaveText(/^Imagery: Esri/);
});

test('with no connection the map says the photo needs one, and the grid and the traffic still work', async ({ page }) => {
  // A broken picture fails the same way as no connection (the tile's own error path) without the browser
  // logging each aborted request as a console error, which these tests treat as a failure (R7).
  await page.route(ESRI, (route) => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: 'not a picture' }));
  await open(page);
  // Each tile is tried three times over about 8 s before the map gives up on it.
  await expect(credit(page)).toHaveText(/^Satellite photo needs a connection/, { timeout: 20_000 });
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(5);
  expect(await pixelsDrawn(page)).toBeGreaterThan(50);
});

test('the photo\'s alignment is in the settings menu, and Reset photo alignment puts back the setup\'s own', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Traffic settings/ }).click();
  const trim = page.getByLabel('Photo scale trim');
  await expect(trim).toHaveValue('1.2');
  await trim.fill('1');
  await trim.press('Enter');
  await expect(trim).toHaveValue('1');
  const east = page.getByLabel('Photo east / west offset');
  await east.fill('300');
  await east.press('Enter');
  await page.getByRole('button', { name: 'Reset photo alignment' }).click();
  await expect(trim).toHaveValue('1.2');
  await expect(east).toHaveValue('0');
});


// ---- 2D | 3D (task 8; D141) ---------------------------------------------------------------------
const viewChoice = (page, name) => page.getByRole('radio', { name, exact: true });
const canvas3d = (page) => page.locator('canvas.traffic-map3d');
const stage3d = (page) => page.locator('.traffic-3d');
const cameraButton = (page, name) => page.locator('.traffic-camera').getByRole('button', { name, exact: true });
const draws3d = async (page) => Number((await canvas3d(page).getAttribute('data-draws')) ?? 0);
const note3d = (page) => page.locator('.traffic-note3d');
const threeRequests = (page) => {
  const seen = [];
  page.on('request', (r) => {
    if (/\/three\/build\/|\/three\.(module|core)\b/.test(new URL(r.url()).pathname)) seen.push(r.url()); // three.js itself, not the ui-kit's three-aircraft.js
  });
  return seen;
};
// A picture of the 3D canvas, and waiting for it to become a different one after an action.
const shot3d = (page) => canvas3d(page).screenshot();
const changed = async (page, act) => {
  const before = await shot3d(page);
  await act();
  await expect.poll(async () => !(await shot3d(page)).equals(before), { timeout: 10_000 }).toBe(true);
};
const stats = (page) => page.evaluate(() => window.__tr.stats());

test('a 2D visit loads no three.js: 2D is what opens, with no 3D canvas and no camera buttons', async ({ page }) => {
  const seen = threeRequests(page);
  await open(page);
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(canvas3d(page)).toHaveCount(0);
  await expect(page.locator('.traffic-camera')).toBeHidden();
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(5);
  await playButton(page).click();
  expect(seen).toEqual([]);
});

test('switching to 3D mid-run keeps the time, draws the aircraft, shows the camera buttons, and switching back frees everything', async ({ page }) => {
  const seen = threeRequests(page);
  await open(page);
  const baseline = await stats(page);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(20);
  const atSwitch = await seconds(page);
  await viewChoice(page, '3D').check();
  await expect(canvas3d(page)).toBeVisible();
  await expect(map(page)).toBeHidden();
  await expect(page.locator('.traffic-camera')).toBeVisible();
  expect(seen.length).toBeGreaterThan(0); // three.js loaded now, and not before
  expect(await seconds(page)).toBeGreaterThanOrEqual(atSwitch); // the run went on
  await expect.poll(() => draws3d(page)).toBeGreaterThan(5);
  await expect(page.locator('.bar-status')).toHaveText('Running');
  await expect(note3d(page)).toBeHidden();
  // Only the layers 3D draws stay on offer.
  await page.getByRole('button', { name: 'Layers' }).click();
  await expect(page.getByLabel('Trails')).toBeDisabled();
  await expect(page.getByLabel('Satellite photo')).toBeDisabled();
  await expect(page.getByLabel('Caution rings')).toBeEnabled();
  await expect(page.getByLabel('Height and speed labels')).toBeEnabled();
  await page.keyboard.press('Escape');
  await playButton(page).click(); // pause
  // Paused, the picture is still and asks for no frames.
  await page.waitForTimeout(300);
  const still = await draws3d(page);
  await page.waitForTimeout(300);
  expect(await draws3d(page)).toBe(still);
  // Back to 2D: the same time, the map is back, and every 3D object is gone.
  const timeNow = await seconds(page);
  await viewChoice(page, '2D').check();
  await expect(map(page)).toBeVisible();
  await expect(canvas3d(page)).toHaveCount(0);
  await expect(stage3d(page)).toHaveAttribute('data-gl', 'closed'); // (what the renderer still counts is checked in the round-trip test below)
  expect(await seconds(page)).toBe(timeNow);
  await expect.poll(() => stats(page)).toEqual(baseline); // no frame, timer or listener kept (the map's one redraw has run)
  await expect.poll(() => pixelsDrawn(page)).toBeGreaterThan(50);
  // A second time round works and fetches three.js no more.
  const fetched = seen.length;
  await viewChoice(page, '3D').check();
  await expect(canvas3d(page)).toBeVisible();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  expect(seen.length).toBe(fetched);
  await viewChoice(page, '2D').check();
  await expect.poll(() => stats(page)).toEqual(baseline);
});

// What three.js still counts (geometries, textures) once the renderer is let go. Some of it is three.js's own and stays after
// the first shiny material (a lookup table, and the PMREM reflection converter's texture and planes), so the first round makes
// that baseline and every later round must come back to exactly it: a texture or geometry the view leaks shows as one more.
test('each 3D round, the full Harvard model or the plain T-6, leaves on the graphics card what the first left and no more', async ({ page }) => {
  await open(page);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(20);
  await playButton(page).click();
  const closeIn = async () => {
    await cameraButton(page, 'Low chase').click();
    const box = await canvas3d(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let notch = 0; notch < 40; notch++) await page.mouse.wheel(0, -100);
    await expect.poll(async () => Number(await canvas3d(page).getAttribute('data-plane-px')), { timeout: 10_000 }).toBeGreaterThan(120);
  };
  const round = async (zoomedIn) => {
    await viewChoice(page, '3D').check();
    await expect.poll(() => draws3d(page)).toBeGreaterThan(1);
    if (zoomedIn) await closeIn();
    await page.waitForTimeout(200);
    await viewChoice(page, '2D').check();
    await expect(stage3d(page)).toHaveAttribute('data-gl', 'closed');
    return stage3d(page).getAttribute('data-gpu');
  };
  const harvard = await round(true);
  expect(harvard).toMatch(/^\d+,\d+$/);
  expect(await round(true)).toBe(harvard);
  expect(await round(true)).toBe(harvard);
  const plain = await round(false);
  expect(await round(false)).toBe(plain);
  expect(await round(true)).toBe(harvard);
});

test('the 3D picture shows the run: the camera buttons, a drag, the wheel and Fit each change it, and so does time', async ({ page }) => {
  await open(page);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(30);
  await playButton(page).click();
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  const first = await shot3d(page);
  const box = await canvas3d(page).boundingBox();
  expect(first.length).toBeGreaterThan(4000); // something is drawn: not one flat colour
  await changed(page, () => cameraButton(page, 'High look-down').click());
  await changed(page, () => cameraButton(page, 'Low chase').click());
  await changed(page, () => cameraButton(page, 'Fit').click());
  await changed(page, async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 40, { steps: 6 });
    await page.mouse.up();
  });
  await changed(page, () => page.mouse.wheel(0, -400));
  // The bar's Fit frames the routes again, in 3D too.
  await changed(page, () => page.locator('.traffic-bar').getByRole('button', { name: 'Fit', exact: true }).click());
  // Playing moves the aircraft.
  await changed(page, () => playButton(page).click());
  await playButton(page).click();
});

test('Paint in the Traffic settings menu changes the T-6s: Harvard or Ship colours', async ({ page }) => {
  await open(page);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(20);
  await playButton(page).click();
  await viewChoice(page, '3D').check();
  await cameraButton(page, 'Low chase').click();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(1);
  // The full Harvard model, and so the paint, is for an aircraft drawn 120 px or more long: wheel right in on it.
  const box = await canvas3d(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let notch = 0; notch < 40; notch++) await page.mouse.wheel(0, -100); // 1.12 times a notch (to the limit, 4,000)
  await expect.poll(async () => Number(await canvas3d(page).getAttribute('data-plane-px')), { timeout: 10_000 }).toBeGreaterThan(120);
  await page.getByRole('button', { name: /^Traffic settings/ }).click();
  const paint = page.getByLabel('Paint');
  await expect(paint.locator('option:checked')).toHaveText('Harvard');
  await page.waitForTimeout(400);
  const harvard = await shot3d(page);
  await changed(page, () => paint.selectOption({ label: 'Ship colours' }));
  await expect(paint.locator('option:checked')).toHaveText('Ship colours');
  expect((await shot3d(page)).equals(harvard)).toBe(false);
});

test('when three.js will not load, the note says so, the setting goes back to 2D and 2D keeps working', async ({ page }) => {
  await page.route('**/three.module.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("offline");' }));
  await open(page);
  await viewChoice(page, '3D').click(); // click, not check: the failed load puts 2D back at once
  await expect(note3d(page)).toHaveText('3D needs a connection the first time.');
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(map(page)).toBeVisible();
  await expect(canvas3d(page)).toHaveCount(0);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(5);
  await playButton(page).click();
});

test('a browser with no WebGL says so before three.js is even fetched, and stays in 2D', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      return type === 'webgl2' || type === 'webgl' ? null : original.call(this, type, ...rest);
    };
  });
  const seen = threeRequests(page);
  await open(page);
  await viewChoice(page, '3D').click();
  await expect(note3d(page)).toHaveText('3D needs WebGL, which this browser does not have.');
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(map(page)).toBeVisible();
  expect(seen).toEqual([]);
});

test('closing the sim while it is in 3D leaves no frame, timer, listener or canvas behind', async ({ page }) => {
  await open(page);
  await viewChoice(page, '3D').check();
  await playButton(page).click();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(3);
  await page.evaluate(() => window.__tr.close());
  expect(await stats(page)).toEqual({ mounted: null, listeners: 0, subscriptions: 0, frames: 0, timers: 0 });
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('switching 3D on and straight off again ends in 2D with nothing left over (a late three.js load must not undo the last choice)', async ({ page }) => {
  await open(page);
  const baseline = await stats(page);
  await viewChoice(page, '3D').check();
  await viewChoice(page, '2D').check();
  await expect(map(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(canvas3d(page)).toHaveCount(0);
  await expect.poll(() => stats(page)).toEqual(baseline);
});

test('the 3D view works from the keyboard (arrow keys turn it, + and - zoom) and has no accessibility violations', async ({ page }) => {
  await open(page);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(20);
  await playButton(page).click();
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  await expectNoA11yViolations(page);
  await canvas3d(page).focus();
  await changed(page, () => page.keyboard.press('ArrowRight'));
  await changed(page, () => page.keyboard.press('ArrowUp'));
  await changed(page, () => page.keyboard.press('+'));
  await changed(page, () => page.keyboard.press('-'));
  // The camera buttons are real buttons, reachable with Tab.
  await cameraButton(page, 'Fit').focus();
  await page.keyboard.press('Tab');
  await expect(cameraButton(page, 'High look-down')).toBeFocused();
  await changed(page, () => page.keyboard.press('Enter'));
});

test('when the browser takes the graphics context away, the 2D map comes back with a note, the setting says 2D, and nothing is logged', async ({ page }) => {
  await open(page);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(5);
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(1);
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.traffic-map3d');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'); // the context three.js already made
    gl.getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(map(page)).toBeVisible();
  await expect(canvas3d(page)).toHaveCount(0);
  await expect(note3d(page)).toBeVisible();
  await expect(note3d(page)).not.toBeEmpty();
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(stage3d(page)).toHaveAttribute('data-gl', 'closed');
  await expect.poll(() => pixelsDrawn(page)).toBeGreaterThan(50);
  await page.waitForTimeout(300); // anything logged about it would have arrived by now (the fixture fails the test on errors)
  // And 3D works again after it: a new canvas and a new context.
  await viewChoice(page, '3D').check();
  await expect(canvas3d(page)).toBeVisible();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(1);
});

test('a steady 3D frame does not write the canvas size again (writing it clears the picture and rebuilds its buffer)', async ({ page }) => {
  await open(page);
  await viewChoice(page, '3D').check();
  await playButton(page).click(); // a paused, still view draws only when something changes; a run draws every frame
  await expect.poll(() => draws3d(page)).toBeGreaterThan(2);
  const writes = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas.traffic-map3d');
    const labels = document.querySelector('canvas.traffic-labels3d');
    const count = { cwidth: 0, cheight: 0, lwidth: 0, lheight: 0 };
    for (const [el, tag] of [[canvas, 'c'], [labels, 'l']]) {
      for (const key of ['width', 'height']) {
        const own = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key);
        Object.defineProperty(el, key, { configurable: true, get() { return own.get.call(this); }, set(v) { count[`${tag}${key}`] += 1; own.set.call(this, v); } });
      }
    }
    const before = Number(canvas.dataset.draws);
    await new Promise((done) => setTimeout(done, 700));
    return { frames: Number(canvas.dataset.draws) - before, count };
  });
  expect(writes.frames).toBeGreaterThan(5);
  expect(writes.count).toEqual({ cwidth: 0, cheight: 0, lwidth: 0, lheight: 0 });
});

// Rewind and the 10-second steps (task 9, #46): going back lands on the very picture the run had.
test('-10 s and +10 s move the clock 10 s and land on the same picture the run had, at 8× and 0.25×', async ({ page }) => {
  await open(page);
  for (const speed of ['8', '0.25']) {
    await button(page, 'Reset').click();
    await page.locator('.bar-speed select').selectOption(speed);
    await button(page, '+10 s').click();
    await button(page, '+10 s').click();
    await button(page, '+10 s').click(); // 30 s: aircraft A1 is flying
    await expect(status(page)).toHaveText('Paused');
    const at30 = await picture(page);
    const at30s = await seconds(page);
    await button(page, '−10 s').click();
    expect(await seconds(page)).toBeLessThan(at30s);
    expect(await picture(page)).not.toBe(at30);
    await button(page, '+10 s').click();
    expect(await picture(page)).toBe(at30);
    await button(page, '−10 s').click();
    await button(page, '−10 s').click();
    await button(page, '−10 s').click();
    await button(page, '−10 s').click(); // past the start: stops at 0
    await expect(clock(page)).toContainText('0:00:00');
  }
});

test('the [ and ] keys step back and ahead 10 s, and not while typing in a box', async ({ page }) => {
  await open(page);
  await page.locator('.traffic-map-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  const at20 = await picture(page);
  const at20s = await seconds(page);
  expect(at20s).toBe(20);
  await page.keyboard.press('[');
  expect(await seconds(page)).toBeLessThan(at20s);
  await page.keyboard.press(']');
  expect(await picture(page)).toBe(at20);
  await page.getByRole('button', { name: /^Traffic settings/ }).click();
  await page.getByLabel('Conflict: lateral').focus();
  await page.keyboard.press(']');
  expect(await picture(page)).toBe(at20);
});

test('Rewind plays the run backward to 0:00:00 and stops; Pause holds it; Play then goes forward', async ({ page }) => {
  await open(page);
  await playButton(page).click();
  await expect.poll(() => seconds(page), { timeout: 20000 }).toBeGreaterThan(60);
  await playButton(page).click();
  const top = await seconds(page);
  await button(page, 'Rewind').click();
  await expect(status(page)).toHaveText('Rewinding');
  await expect(button(page, 'Rewind')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => seconds(page)).toBeLessThan(top - 5);
  await playButton(page).click(); // Pause
  await expect(status(page)).toHaveText('Paused');
  const held = await seconds(page);
  await page.waitForTimeout(300);
  expect(await seconds(page)).toBe(held);
  // Back to the start.
  await button(page, 'Rewind').click();
  await expect(clock(page)).toContainText('0:00:00', { timeout: 20000 });
  await expect(status(page)).toHaveText('Paused');
  await expect(page.getByText('Press Play to watch the Moose Jaw traffic.')).toBeVisible();
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(5);
});

// Profiles and notes (task 7, #48): save, reload the page, load; the last profile opens next time; a browser
// that blocks storage; a hostile stored profile is refused; another home field opens V6's generic pattern.
const profilesToggle = (page) => page.getByRole('button', { name: /^Profiles and notes/ });
const profileName = (page) => page.getByLabel('Profile name', { exact: true });
const profileList = (page) => page.getByLabel('Profiles', { exact: true });
const profileMessage = (page) => page.locator('.profiles-message');
const aircraftRows = (page) => page.locator('.aircraft-row');
const confirmBox = (page) => page.locator('.profiles-confirm');

async function openProfiles(page) {
  if ((await profilesToggle(page).getAttribute('aria-expanded')) !== 'true') await profilesToggle(page).click();
}

test('Profiles and notes is closed at first, the built-in setups are listed first, and every box starts filled in', async ({ page }) => {
  await open(page);
  await expect(profilesToggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(profileName(page)).toBeHidden();
  await openProfiles(page);
  await expect(profileName(page)).toHaveValue('Setup 1');
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('');
  const options = await profileList(page).locator('option').allTextContents();
  expect(options).toEqual(['Moose Jaw (built-in)', 'Moose Jaw (V6 original)']);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
});

test('save a profile, reload the page: it opens on the last profile, and Load brings back either setup', async ({ page }) => {
  await open(page);
  await button(page, '+ Spawn').click(); // an eighth aircraft
  await expect(aircraftRows(page)).toHaveCount(8);
  await openProfiles(page);
  await profileName(page).fill('Busy Tuesday');
  await page.getByLabel('Notes', { exact: true }).fill('8 aircraft, calm');
  await button(page, 'Save').click();
  await expect(profileMessage(page)).toHaveText('Saved "Busy Tuesday".');
  // The browser has it: after a reload the sim opens on it, with its notes.
  await open(page);
  await expect(aircraftRows(page)).toHaveCount(8);
  await openProfiles(page);
  await expect(profileName(page)).toHaveValue('Busy Tuesday');
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('8 aircraft, calm');
  await expect(profileList(page)).toHaveValue('saved:Busy Tuesday');
  // Load the built-in setup: it asks first, and Cancel changes nothing.
  await profileList(page).selectOption({ label: 'Moose Jaw (built-in)' });
  await button(page, 'Load').click();
  await expect(confirmBox(page)).toBeVisible();
  await button(page, 'Cancel').click();
  await expect(aircraftRows(page)).toHaveCount(8);
  await button(page, 'Load').click();
  await confirmBox(page).getByRole('button', { name: 'Load', exact: true }).click();
  await expect(aircraftRows(page)).toHaveCount(7);
  await expect(clock(page)).toContainText('0:00:00');
  await expect(status(page)).toHaveText('Paused');
  await expect(profileName(page)).toHaveValue('Setup 1'); // the built-in is read-only: the box offers a name of its own
  // And back to the saved one.
  await profileList(page).selectOption({ label: 'Busy Tuesday (CYMJ)' });
  await button(page, 'Load').click();
  await confirmBox(page).getByRole('button', { name: 'Load', exact: true }).click();
  await expect(aircraftRows(page)).toHaveCount(8);
  await expect(profileName(page)).toHaveValue('Busy Tuesday');
  // V6's own setup is there to load, too.
  await profileList(page).selectOption({ label: 'Moose Jaw (V6 original)' });
  await button(page, 'Load').click();
  await confirmBox(page).getByRole('button', { name: 'Load', exact: true }).click();
  await expect(aircraftRows(page)).toHaveCount(7);
  // After the reload it opens on V6's setup, the last one loaded.
  await open(page);
  await openProfiles(page);
  await expect(profileList(page)).toHaveValue('built-in:moose-jaw-v6');
});

test('a loaded profile plays, and its routes, edits and settings come back as saved', async ({ page }) => {
  await open(page);
  await page.locator('[data-route-id="PAT1"]').click();
  await page.locator('.point-row').nth(2).getByLabel('Alt ft', { exact: true }).fill('3400');
  await page.locator('.bar-speed select').selectOption('2');
  await openProfiles(page);
  await profileName(page).fill('Edited');
  await button(page, 'Save').click();
  await button(page, 'Reset').click();
  // Load the built-in setup: the point is back at 3,500 ft and the speed at 8×.
  await profileList(page).selectOption({ label: 'Moose Jaw (built-in)' });
  await button(page, 'Load').click();
  await confirmBox(page).getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.bar-speed select')).toHaveValue('8');
  await page.locator('[data-route-id="PAT1"]').click();
  await expect(page.locator('.point-row').nth(2).locator('.point-data')).toContainText('3500ft');
  // Load the edited one: the edit and the speed are back, and it plays.
  await profileList(page).selectOption({ label: 'Edited (CYMJ)' });
  await button(page, 'Load').click();
  await confirmBox(page).getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('.bar-speed select')).toHaveValue('2');
  await page.locator('[data-route-id="PAT1"]').click();
  await expect(page.locator('.point-row').nth(2).locator('.point-data')).toContainText('3400ft');
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(2);
  await playButton(page).click();
});

test('Save over a name that is there asks first; Delete asks first and removes it; the built-in setups can be neither replaced nor deleted', async ({ page }) => {
  await open(page);
  await openProfiles(page);
  await profileName(page).fill('Alpha');
  await button(page, 'Save').click();
  await expect(profileMessage(page)).toHaveText('Saved "Alpha".');
  await page.getByLabel('Notes', { exact: true }).fill('second version');
  await button(page, 'Save').click();
  await expect(confirmBox(page)).toContainText('Replace the saved profile "Alpha"');
  await confirmBox(page).getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(confirmBox(page)).toBeHidden();
  await expect(profileMessage(page)).toHaveText('Saved "Alpha".');
  await profileName(page).fill('Moose Jaw (built-in)');
  await button(page, 'Save').click();
  await expect(profileMessage(page)).toContainText("is a built-in setup and can't be replaced");
  // Delete.
  await profileList(page).selectOption({ label: 'Alpha (CYMJ)' });
  await button(page, 'Delete').click();
  await expect(confirmBox(page)).toContainText('Delete the saved profile "Alpha"?');
  await page.keyboard.press('Escape');
  await expect(confirmBox(page)).toBeHidden();
  await expect(profileList(page).locator('option')).toHaveCount(3);
  await button(page, 'Delete').click();
  await confirmBox(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(profileMessage(page)).toHaveText('Deleted "Alpha".');
  await expect(profileList(page).locator('option')).toHaveCount(2);
});

test('a browser that blocks storage: the sim opens, profiles work for the visit, and the section says they will not be kept', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage is disabled', 'SecurityError'); } });
  });
  await open(page);
  await openProfiles(page);
  await expect(page.locator('.profiles-note')).toHaveText("Profiles won't be saved in this browser: they are kept only until this page is closed.");
  await profileName(page).fill('Temporary');
  await button(page, 'Save').click();
  await expect(profileMessage(page)).toContainText("this browser wouldn't keep it");
  await expect(profileList(page).locator('option')).toHaveCount(3);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(1);
});

test('a hostile or oversized profile in storage is skipped with a message, the good one still loads, and the sim opens as usual', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('ooda:v1:traffic:profiles')) return;
    const point = (i) => ({ label: `P${i}`, x: i * 100, y: 0, alt: 2500, kt: 120, g: 2 });
    const route = (id, points) => ({ id, name: id, kind: 'pattern', visible: true, color: '#58a6ff', landOdds: 0.2, points });
    const ok = (name) => ({ version: 1, name, airfield: 'CYMJ', notes: '', seed: 1, anchor: { lat: 50.33, lon: -105.56 }, routes: [route('PAT1', [point(0), point(1), point(2), point(3)])], aircraft: [], settings: {} });
    const tooManyPoints = ok('Too many points');
    tooManyPoints.routes[0].points = Array.from({ length: 101 }, (_, i) => point(i));
    const script = ok('<img src=x onerror=alert(1)>');
    script.routes[0].points[0].kt = 5000;
    localStorage.setItem('ooda:v1:traffic:profiles', JSON.stringify({ version: 1, profiles: [ok('Good one'), tooManyPoints, script, { version: 1, name: 'x'.repeat(500) }] }));
  });
  await open(page);
  await expect(aircraftRows(page)).toHaveCount(7); // the built-in Moose Jaw opened
  await openProfiles(page);
  await expect(profileList(page).locator('option')).toHaveText(['Moose Jaw (built-in)', 'Moose Jaw (V6 original)', 'Good one (CYMJ)']);
  const skipped = page.locator('.profiles-skipped li');
  await expect(skipped).toHaveCount(3);
  await expect(skipped.nth(0)).toHaveText('"Too many points" was skipped: PAT1 has 101 points (the most is 100).');
  await expect(skipped.nth(1)).toContainText('was skipped: point 1 of PAT1 has a speed outside 40 to 400 kt.');
  await expect(page.locator('img')).toHaveCount(0);
  // The good one loads.
  await profileList(page).selectOption({ label: 'Good one (CYMJ)' });
  await button(page, 'Load').click();
  await confirmBox(page).getByRole('button', { name: 'Load', exact: true }).click();
  await expect(aircraftRows(page)).toHaveCount(0);
  await expect(page.getByText('No aircraft yet. Use + Spawn on the right to add one.').first()).toBeVisible();
});

test('a home field that is not Moose Jaw opens V6\'s generic pattern there, and Moose Jaw stays in the list', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ooda:v1:airfields:setup', JSON.stringify({ version: 1, home: 'CYQR', alternates: [], fields: {} }));
  });
  await open(page);
  await expect(page.locator('[data-route-id]')).toHaveCount(1);
  await expect(page.locator('[data-route-id="PAT1"]')).toContainText('Pattern 1');
  await expect(aircraftRows(page)).toHaveCount(0);
  await expect(page.getByText('No aircraft yet. Use + Spawn on the right to add one.').first()).toBeVisible();
  await button(page, '+ Spawn').click();
  await expect(aircraftRows(page)).toHaveCount(1);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(1);
  await playButton(page).click();
  await openProfiles(page);
  await expect(profileList(page).locator('option')).toHaveText(['Moose Jaw (built-in)', 'Moose Jaw (V6 original)']);
  // Saved, it remembers its airfield.
  await profileName(page).fill('Regina circuit');
  await button(page, 'Save').click();
  await expect(profileList(page).locator('option').nth(2)).toHaveText('Regina circuit (CYQR)');
});

// A route added mid-run changes the run, so -10 s and +10 s after it land on the run that has it from 0 (#46).
test('a split added mid-run: -10 s and +10 s show the same picture as flying the new setup from the start', async ({ page }) => {
  await open(page);
  await page.locator('.traffic-map-wrap').click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 60; i++) await page.keyboard.press(']'); // 10 minutes
  await page.locator('[data-route-id="PAT1"]').click();
  await button(page, '+ New route').click();
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.locator('.traffic-map-wrap').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('[');
  await expect(status(page)).toHaveText('Paused'); // after "Replaying…"
  await page.keyboard.press(']');
  const stepped = await picture(page);
  const at = await seconds(page);
  await button(page, 'Reset').click();
  for (let i = 0; i < 60; i++) await page.keyboard.press(']');
  expect(await seconds(page)).toBe(at);
  expect(await picture(page)).toBe(stepped);
});

// After an edit the first step back flies the run again from 0: the bar says "Replaying…" while it does, and then goes back to normal.
test('the first step back after an edit says Replaying… in the bar, and the next one does not', async ({ page }) => {
  await open(page);
  await page.locator('.traffic-map-wrap').click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 40; i++) await page.keyboard.press(']'); // 400 s, past what is replayed without a word
  await page.locator('[data-route-id="PAT1"]').click();
  await button(page, '+ New route').click();
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page.locator('.traffic-map-wrap').click({ position: { x: 5, y: 5 } });
  await page.evaluate(() => {
    window.__seen = [];
    const el = document.querySelector('.bar-status');
    new MutationObserver(() => window.__seen.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.keyboard.press('[');
  await expect(status(page)).toHaveText('Paused');
  expect(await page.evaluate(() => window.__seen)).toContain('Replaying…');
  await page.evaluate(() => { window.__seen.length = 0; });
  await page.keyboard.press('[');
  await expect(clock(page)).toBeVisible();
  expect(await page.evaluate(() => window.__seen)).not.toContain('Replaying…');
});
