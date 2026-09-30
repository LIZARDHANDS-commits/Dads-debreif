// Browser tests for the Formation Turn Sim (SPEC-turn-sim: Testing strategy, item 5).
// Every test fails on a console error (fixtures.js, R7). Most run on a test page that
// mounts the Turn Sim on the real shell host, straight from src/ (pages/turn-sim.html),
// so they don't wait for the Turn Sim's entry in src/shell/registry.js. The tests that
// go through the route are skipped until that entry lands.
import { test, expect } from './fixtures.js';
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
  await page.goto(`${site.url}tests/e2e/pages/turn-sim.html`);
  await page.waitForFunction(() => window.__tsReady);
  // The first fit waits for the stylesheet and the canvas's real size, then draws.
  await expect.poll(() => pixelsNear(page, [0, 102, 255])).toBeGreaterThan(20);
}

const simTime = async (page) => Number(await page.locator('.ts-time').getAttribute('data-sec'));
const canvas = (page) => page.locator('canvas.ts-canvas:not(.ts-canvas3d)');
const canvas3d = (page) => page.locator('canvas.ts-canvas3d');
const playButton = (page) => page.locator('.ts-play');
const cardLines = (page) => page.getByRole('list', { name: 'Formation', exact: true }).getByRole('listitem');
// A panel's header is a real button; its ▾ or ▸ is part of its name, so match the start.
const panel = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) });
// A box in Setup or in the settings menu, by its label.
const box = (page, label) => page.locator('.ts-col-setup').getByLabel(label, { exact: true });
const panelMenu = (page) => page.getByRole('button', { name: /^Layers/ });
const button = (page, name) => page.getByRole('button', { name, exact: true });

// How many picture pixels are close to a colour, to see what is drawn.
function pixelsNear(page, [r, g, b]) {
  return canvas(page).evaluate((el, rgb) => {
    const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - rgb[0]) < 40 && Math.abs(data[i + 1] - rgb[1]) < 40 && Math.abs(data[i + 2] - rgb[2]) < 40) n++;
    }
    return n;
  }, [r, g, b]);
}

const picture = (page) => canvas(page).evaluate((el) => el.toDataURL());

// Visible controls (and the picture) that overlap each other or stick out of the page, as layout.spec.js finds them.
// An open menu is a pop-up over the picture, like the debrief's, so a scan with a menu open leaves the picture out.
function layoutProblems(page, { picture = true } = {}) {
  return page.evaluate((withPicture) => {
    const controls = [...document.querySelectorAll(`a[href], button, input, select, textarea${withPicture ? ', canvas' : ''}`)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    });
    const problems = [];
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width) problems.push('the page scrolls sideways');
    const name = (el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
    const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (const { el, r } of boxes) if (r.left < 0 || r.right > width + 0.5) problems.push(`${name(el)} is cut off at the side`);
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
    return problems;
  }, picture);
}

for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('opens fitted, with nothing covering anything, even with every panel open (R2, #30)', async ({ page }) => {
      await open(page);
      // All four aircraft are on the picture: Lead in blue and #4 in white with its dark outline (#29).
      expect(await pixelsNear(page, [0, 102, 255])).toBeGreaterThan(20);
      expect(await pixelsNear(page, [255, 255, 255])).toBeGreaterThan(20);
      // The playback bar sits above the picture, not over it.
      const gap = await page.evaluate(() => document.querySelector('.ts-bar').getBoundingClientRect().bottom <= document.querySelector('.ts-canvas-wrap').getBoundingClientRect().top + 0.5);
      expect(gap, 'the bar is above the picture').toBe(true);
      expect(await layoutProblems(page)).toEqual([]);
      await page.$$eval('.panel-toggle[aria-expanded="false"]', (els) => els.forEach((e) => e.click()));
      expect(await layoutProblems(page)).toEqual([]);
      await panelMenu(page).click();
      expect(await layoutProblems(page, { picture: false })).toEqual([]);
    });
  });
}

test('a first visit shows only the essentials, and Reset layout brings them back (R22)', async ({ page }) => {
  await open(page);
  for (const name of ['Aircraft errors', 'Turn Sim settings', 'Profiles', 'More detail']) {
    await expect(panel(page, name)).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(panelMenu(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(box(page, 'Turn degrees')).toBeHidden(); // in the closed settings menu
  await expect(page.getByLabel('Lead 3/9 line')).toBeHidden(); // in the closed Layers menu
  // The essentials, with plain labels.
  for (const label of ['Formation', 'Spacing', 'Start heading', 'Turn', 'Speed', 'G', 'Timing', 'Base delay']) {
    await expect(box(page, label)).toBeVisible();
  }
  await expect(page.getByRole('group', { name: 'Direction' })).toBeVisible();

  // Open things up, then put the layout back.
  await panel(page, 'Turn Sim settings').click();
  await panel(page, 'More detail').click();
  await panelMenu(page).click();
  await page.getByLabel('Clock marks').check();
  await page.getByLabel('Lead 3/9 line').uncheck();
  await button(page, 'Reset layout').click();
  await expect(panel(page, 'Turn Sim settings')).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page, 'More detail')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Clock marks')).not.toBeChecked();
  await expect(page.getByLabel('Lead 3/9 line')).toBeChecked();
  await expect(page.getByLabel('Turn circles')).toBeChecked();
  await expect(page.getByLabel('Error labels')).toBeChecked();
});

test('every input starts with its default, none blank, and Play works with nothing typed (#31, R22)', async ({ page }) => {
  await open(page);
  await page.$$eval('.panel-toggle[aria-expanded="false"]', (els) => els.forEach((e) => e.click()));
  // Turn on the boxes that only show when asked for, so they're checked too.
  await page.getByLabel('Put it out of position').first().check();
  const blank = await page.evaluate(() =>
    [...document.querySelectorAll('.turn-sim input[type="number"], .turn-sim select')]
      .filter((el) => !el.closest('[hidden]'))
      .filter((el) => el.value === '')
      .map((el) => el.id),
  );
  expect(blank).toEqual([]);
  // The defaults: 4312, delayed 90, right, 220 KTAS, 3 G, time delay, 16 s (Patrick's rules; D113).
  await expect(box(page, 'Formation')).toHaveValue(/\d/);
  await expect(box(page, 'Speed')).toHaveValue('220');
  await expect(box(page, 'G')).toHaveValue('3');
  await expect(box(page, 'Base delay')).toHaveValue('16');
  await expect(box(page, 'Spacing')).toHaveValue('6000');
  await expect(page.getByRole('radio', { name: 'Right' })).toBeChecked();

  await playButton(page).click();
  await expect(playButton(page)).toHaveText(/Pause/);
  await expect.poll(() => simTime(page)).toBeGreaterThan(1);
  await playButton(page).click();
});

test('the playback bar: Play, Pause, Step and Reset, and every button does something (R3)', async ({ page }) => {
  await open(page);
  expect(await simTime(page)).toBe(0);
  await button(page, 'Step').click();
  expect(await simTime(page)).toBeCloseTo(0.05, 6); // one fixed 0.05 s step
  await button(page, 'Step').click();
  expect(await simTime(page)).toBeCloseTo(0.1, 6);
  await expect(playButton(page)).toHaveText(/Play/);

  await playButton(page).click();
  await expect(playButton(page)).toHaveText(/Pause/);
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText(/Play/);
  const paused = await simTime(page);
  await page.waitForTimeout(300);
  expect(await simTime(page)).toBe(paused); // paused means paused
  expect(await page.evaluate(() => window.__ts.stats().frames)).toBe(0); // and nothing runs

  await button(page, 'Reset').click();
  expect(await simTime(page)).toBe(0);
  await expect(cardLines(page).first()).toContainText('#2');

  // Fit puts the picture back after it's been moved.
  const fitted = await picture(page);
  await canvas(page).hover();
  await page.mouse.down();
  await page.mouse.move(300, 200, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => picture(page)).not.toBe(fitted);
  await button(page, 'Fit').click();
  await expect.poll(() => picture(page)).toBe(fitted);
});

test('speed 0.25× to 4× changes how many steps run, not their size (#17)', async ({ page }) => {
  await open(page);
  const speed = page.getByLabel('Playback speed');
  await expect(speed.locator('option')).toHaveText(['0.25×', '0.5×', '1×', '2×', '4×']);
  await speed.selectOption('4');
  await playButton(page).click();
  await expect.poll(() => simTime(page), { timeout: 10_000 }).toBeGreaterThan(8);
  await playButton(page).click();
  // Whatever moment Pause caught, the run is exactly the fixed steps up to it: Step there gives the same picture of the formation.
  const t = await simTime(page);
  const played = await cardLines(page).allTextContents();
  const playedSep = await page.locator('.ts-line').first().textContent();
  expect(Math.round(t / 0.05) * 0.05).toBeCloseTo(t, 6); // a whole number of 0.05 s steps
  await button(page, 'Reset').click();
  for (let i = 0; i < Math.round(t / 0.05); i++) await button(page, 'Step').click();
  expect(await simTime(page)).toBeCloseTo(t, 6);
  expect(await cardLines(page).allTextContents()).toEqual(played);
  expect(await page.locator('.ts-line').first().textContent()).toBe(playedSep);
});

test('changing a setting during a run stops it and goes back to the start; layers and speed do not (#31)', async ({ page }) => {
  await open(page);
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(1);
  // Layers and speed leave it running.
  await panelMenu(page).click();
  await page.getByLabel('Clock marks').check();
  await page.getByLabel('Playback speed').selectOption('2');
  await expect(playButton(page)).toHaveText(/Pause/);
  const before = await simTime(page);
  await expect.poll(() => simTime(page)).toBeGreaterThan(before);
  // A setup change stops it and resets to t = 0.
  await box(page, 'Spacing').fill('7000');
  await expect(playButton(page)).toHaveText(/Play/);
  expect(await simTime(page)).toBe(0);
  await expect(page.locator('.ts-line').first()).toHaveText('Min sep 7,000 ft');
  // And Play flies the new plan.
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
});

test('the turn changes Turn degrees to its own value, and a setting only shows when it applies (#32)', async ({ page }) => {
  await open(page);
  await panel(page, 'Turn Sim settings').click();
  await expect(box(page, 'Turn degrees')).toHaveValue('90');
  await expect(box(page, 'Aft spacing')).toBeHidden(); // the offset box's, only with the offset box
  await box(page, 'Turn').selectOption({ label: 'Delayed 45' });
  await expect(box(page, 'Turn degrees')).toHaveValue('45');
  await box(page, 'Turn').selectOption({ label: 'Hook turn' });
  await expect(box(page, 'Turn degrees')).toHaveValue('180');
  await box(page, 'Formation').selectOption({ label: 'Offset box' });
  await expect(box(page, 'Aft spacing')).toHaveValue('7000');
  // Timing: all three ways work, so none is greyed out.
  const timing = box(page, 'Timing');
  await expect(timing.locator('option')).toHaveCount(3);
  await expect(timing.locator('option:disabled')).toHaveCount(0);
});

test('the G box warns in words above what a T-6 can pull at this speed, and still flies it (D128)', async ({ page }) => {
  await open(page);
  const warning = page.locator('.ts-col-setup .ts-warning');
  await expect(warning).toBeHidden();
  await box(page, 'G').fill('7');
  await expect(warning).toHaveText('More G than a T-6 can pull at this speed');
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5); // a warning only: it flies
  await playButton(page).click();
  await box(page, 'Speed').fill('300');
  await expect(warning).toBeHidden(); // faster, the wing gives more
  await box(page, 'G').fill('3');
  await expect(warning).toBeHidden();
});

test('a two-ship has one wingman and no NaN anywhere (#17)', async ({ page }) => {
  await open(page);
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  await expect(cardLines(page)).toHaveCount(1);
  await expect(cardLines(page).first()).toContainText('#2');
  await panel(page, 'More detail').click();
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(1);
  await playButton(page).click();
  expect(await page.locator('.turn-sim').textContent()).not.toMatch(/NaN|undefined/);
});

test('the Formation card follows the standards the debrief edits, and a switched-off one judges nothing (Q46)', async ({ page }) => {
  await open(page);
  await expect(cardLines(page).first()).toHaveText('#2 ON SPACING');
  // Tighten the spread standard past 6,000 ft: every wingman is TIGHT.
  await page.evaluate(() => window.__ts.standards.update({ spread: { minFt: 6500, maxFt: 9000 } }));
  await expect(cardLines(page).first()).toContainText('TIGHT');
  await panel(page, 'More detail').click();
  await expect(page.getByText('Edited standards, as set in the Debrief.')).toBeVisible();
  // Switch it off: no label at all, in words.
  await page.evaluate(() => window.__ts.standards.update({ spread: { on: false } }));
  await expect(cardLines(page).first()).toContainText('Not judged');
  await page.evaluate(() => window.__ts.standards.reset());
  await expect(cardLines(page).first()).toHaveText('#2 ON SPACING');
  await expect(page.getByText('Default standards. Change them in the Debrief.')).toBeVisible();
});

test('Aircraft errors: a wingman turning late is what the plan flies (#31)', async ({ page }) => {
  await open(page);
  await panel(page, 'Aircraft errors').click();
  await page.getByLabel('Put it out of position').first().check();
  const wide = page.getByLabel('Side to side').first();
  await wide.selectOption({ label: 'Wide' });
  await page.getByLabel('by', { exact: true }).first().fill('1000');
  // #2's start moves out 1,000 ft: Lead and #2 are 7,000 ft apart.
  await expect(page.locator('.ts-line').first()).toHaveText(/Min sep 6,000 ft/); // #3 and Lead are still 6,000 ft
  await panel(page, 'More detail').click();
  await expect(page.getByText(/^1-2: 7,000 ft/)).toBeVisible();
  await page.getByRole('button', { name: 'Reset to defaults' }).nth(1).click(); // the errors panel's own
  await expect(page.getByText(/^1-2: 6,000 ft/)).toBeVisible();
});

test('space plays and pauses, the right arrow steps once, Home resets, and typing is left alone (R14)', async ({ page }) => {
  await open(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
  expect(await simTime(page)).toBeCloseTo(0.05, 6);
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText(/Pause/);
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText(/Play/);
  await page.keyboard.press('Home');
  expect(await simTime(page)).toBe(0);
  // In a box, the keys belong to the box.
  const spacing = box(page, 'Spacing');
  await spacing.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  expect(await simTime(page)).toBe(0);
  await expect(playButton(page)).toHaveText(/Play/);
});

test('the side columns collapse with a real button, and the picture takes the room', async ({ page }) => {
  await open(page);
  const width = () => canvas(page).evaluate((el) => el.clientWidth);
  const before = await width();
  await panel(page, 'Setup').click();
  await expect(panel(page, 'Setup')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(width).toBeGreaterThan(before + 100);
  await panel(page, 'Formation').click();
  await expect.poll(width).toBeGreaterThan(before + 200);
  await panel(page, 'Setup').click();
  await panel(page, 'Formation').click();
  await expect.poll(width).toBe(before);
});

test('the Turn Sim opens and plays when the browser blocks storage (#33)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage is disabled', 'SecurityError');
      },
    });
  });
  await open(page);
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
});

test('leaving the Turn Sim leaves no frames, timers, listeners or shortcuts behind (R4, #39)', async ({ page }) => {
  await open(page);
  await panelMenu(page).click(); // a page-wide listener while open
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.3);
  expect((await page.evaluate(() => window.__ts.stats())).listeners).toBeGreaterThan(0);
  await page.evaluate(() => window.__ts.close());
  const stats = await page.evaluate(() => window.__ts.stats());
  expect(stats).toEqual({ mounted: null, listeners: 0, subscriptions: 0, frames: 0, timers: 0 });
  await expect(page.locator('link[href*="turn-sim.css"]')).toHaveCount(0);
  // Keys do nothing any more, and the screen is gone.
  await page.keyboard.press('Space');
  await expect(page.locator('.turn-sim')).toHaveCount(0);
  // It opens again cleanly.
  await page.evaluate(() => window.__ts.open());
  await expect(page.locator('.turn-sim')).toHaveCount(1);
});

// ---- 2D | 3D switch (SPEC-turn-sim: 2D/3D switch, task 19) --------------------------------------
const viewChoice = (page, name) => page.getByRole('radio', { name, exact: true });
// click() and then check the state: check() re-reads the radio at once and fails when the view has already moved on (a 3D load that fails goes back to 2D).
const pickView = async (page, name) => {
  await viewChoice(page, name).click();
  await expect(viewChoice(page, name)).toBeChecked();
};
const threeRequests = (page) => {
  const seen = [];
  page.on('request', (r) => {
    if (/\/three\/build\/|\/three\.(module|core)\b/.test(new URL(r.url()).pathname)) seen.push(r.url()); // three.js itself, not the ui-kit's three-aircraft.js
  });
  return seen;
};
const draws3d = async (page) => Number((await canvas3d(page).getAttribute('data-draws')) ?? 0);

test('a 2D visit loads no three.js, and 2D is what opens (task 19)', async ({ page }) => {
  const seen = threeRequests(page);
  await open(page);
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(canvas3d(page)).toBeHidden();
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
  expect(seen).toEqual([]);
});

test('switching to 3D mid-run keeps the time, loads three.js once, and the choice is remembered (task 19)', async ({ page }) => {
  const seen = threeRequests(page);
  await open(page);
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(1);
  const before = await simTime(page);
  await pickView(page, '3D');
  await expect(canvas3d(page)).toBeVisible();
  await expect(canvas(page)).toBeHidden();
  // The run went on: the time didn't go back to 0, and it still advances in 3D.
  expect(await simTime(page)).toBeGreaterThanOrEqual(before);
  await expect.poll(() => simTime(page)).toBeGreaterThan(before + 0.5);
  await expect.poll(() => draws3d(page)).toBeGreaterThan(3);
  expect(seen.length).toBeGreaterThan(0);

  // Paused, the picture is still and 3D asks for no frames.
  await playButton(page).click();
  const paused = await simTime(page);
  await page.waitForTimeout(200);
  const still = await draws3d(page);
  await page.waitForTimeout(300);
  expect(await draws3d(page)).toBe(still);
  expect(await simTime(page)).toBe(paused);

  // Back to 2D: the same time, and 3D draws nothing more.
  await pickView(page, '2D');
  await expect(canvas(page)).toBeVisible();
  expect(await simTime(page)).toBe(paused);
  const atSwitch = await draws3d(page);
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(paused + 0.5);
  await playButton(page).click();
  expect(await draws3d(page)).toBe(atSwitch);

  // 3D again does not fetch three.js a second time.
  const fetched = seen.length;
  await pickView(page, '3D');
  await expect(canvas3d(page)).toBeVisible();
  expect(seen.length).toBe(fetched);

  // The choice is kept with the other layout choices: after a reload it opens in 3D.
  await page.reload();
  await page.waitForFunction(() => window.__tsReady);
  await expect(viewChoice(page, '3D')).toBeChecked();
  await expect(canvas3d(page)).toBeVisible();
});

test('the 3D picture draws the same run, and a step moves it (task 19)', async ({ page }) => {
  await open(page);
  await pickView(page, '3D');
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  const first = await canvas3d(page).screenshot();
  // Paint is a choice in the closed settings menu, not on the bar.
  await panel(page, 'Turn Sim settings').click();
  await box(page, 'Paint').selectOption({ label: 'Ship colours' });
  await expect.poll(() => draws3d(page)).toBeGreaterThan(1);
  await button(page, 'Step').click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0);
  const second = await canvas3d(page).screenshot();
  expect(second.equals(first)).toBe(false);
});

test('when three.js will not load, the note says so and 2D keeps working (task 19)', async ({ page }) => {
  // A script that fails the way an offline load does: the import rejects, and nothing is drawn.
  // (A later try after a real network failure loads; that retry is pinned in the ui-kit's loadThree test.)
  await page.route('**/three.module.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("offline");' }));
  await open(page);
  // click, not check: the failed load puts 2D back at once, which check() reads as "did not change".
  await viewChoice(page, '3D').click();
  await expect(page.locator('.ts-note')).toHaveText('3D needs a connection the first time.');
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(canvas(page)).toBeVisible();
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
});

test('leaving the Turn Sim while in 3D leaves no frames behind (task 19, R4)', async ({ page }) => {
  await open(page);
  await pickView(page, '3D');
  await playButton(page).click();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(2);
  await page.evaluate(() => window.__ts.close());
  expect(await page.evaluate(() => window.__ts.stats())).toEqual({ mounted: null, listeners: 0, subscriptions: 0, frames: 0, timers: 0 });
});

// ---- Clock and Auto timing (todo tasks 8 and 9) ----------------------------------------------------
test('the clock cue shows its position box and live status lines, and says when #3 and #4 cannot see it', async ({ page }) => {
  await open(page);
  await expect(box(page, 'Clock position').first()).toBeHidden();
  await box(page, 'Timing').selectOption({ label: 'Clock position cue' });
  await expect(box(page, 'Clock position').first()).toBeVisible();
  await expect(box(page, 'Clock position').first().locator('option:checked')).toHaveText('Auto (7 right, 5 left)'); // the default
  const cues = page.getByRole('list', { name: 'Clock cue status' });
  await expect(cues.getByRole('listitem').first()).toContainText('#1');
  await expect(cues).toContainText('watching');
  // Q44c: at 5:30 in the offset box, #3 and #4 have nothing to see.
  await box(page, 'Formation').selectOption({ label: 'Offset box' });
  await box(page, 'Clock position').first().selectOption({ label: '5:30' });
  await expect(page.getByText("can't see their clock cue")).toHaveText("#3 and #4 can't see their clock cue in the box, so they turn on the rear element timing instead.");
  // N8: the lines for #3 and #4 agree with the warning, before and while they turn.
  await expect(cues.getByRole('listitem').nth(2)).toContainText('turns on the rear element timing');
  await expect(cues.getByRole('listitem').nth(3)).toContainText('turns on the rear element timing');
  await page.getByLabel('Playback speed').selectOption('4');
  await playButton(page).click();
  await expect.poll(() => simTime(page), { timeout: 20000 }).toBeGreaterThan(30);
  await playButton(page).click();
  await expect(cues.getByRole('listitem').nth(2)).not.toContainText(/watching|cue came from/);
  await expect(cues.getByRole('listitem').nth(3)).not.toContainText(/watching|cue came from/);
  // Time delay again: the cue lines and the message are gone.
  await box(page, 'Timing').selectOption({ label: 'Time delay' });
  await expect(cues).toBeHidden();
  await expect(page.getByText("can't see their clock cue")).toBeHidden();
});

test('Auto timing shows the engine\'s step read-only and leaves Base delay alone', async ({ page }) => {
  await open(page);
  const before = await box(page, 'Base delay').inputValue();
  await box(page, 'Timing').selectOption({ label: 'Auto timing' });
  await expect(page.locator('.ts-auto')).toHaveText(/^Auto step \d+\.\d s$/);
  await expect(box(page, 'Base delay')).toBeHidden();
  await box(page, 'Timing').selectOption({ label: 'Time delay' });
  await expect(box(page, 'Base delay')).toHaveValue(before);
});

test('Start heading is a compass heading, north by default', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Compass: 0 north, 90 east.')).toBeVisible();
  await expect(box(page, 'Start heading')).toHaveValue('0');
});

test('the Correction model is a checkbox in the settings menu, off by default, and opens the model and its strength', async ({ page }) => {
  await open(page);
  await panel(page, 'Turn Sim settings').click();
  const on = page.getByRole('checkbox', { name: 'Correction model', exact: true });
  await expect(on).not.toBeChecked();
  await expect(box(page, 'Model')).toBeHidden();
  await expect(box(page, 'Correction strength')).toBeHidden();
  await on.check();
  await expect(box(page, 'Model').locator('option:checked')).toHaveText('G adjustment');
  await expect(box(page, 'Correction strength')).toBeVisible();
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
  await on.uncheck();
  await expect(box(page, 'Model')).toBeHidden();
});

test('a setup change made in 3D still fits the 2D picture when 2D comes back (audit)', async ({ page }) => {
  await open(page);
  await pickView(page, '3D');
  await expect(canvas3d(page)).toBeVisible();
  await box(page, 'Spacing').fill('2500'); // refits: the 2D canvas is hidden right now
  await expect.poll(() => simTime(page)).toBe(0);
  await pickView(page, '2D');
  await expect(canvas(page)).toBeVisible();
  // Lead (blue) is on the picture without pressing Fit.
  await expect.poll(() => pixelsNear(page, [0, 102, 255])).toBeGreaterThan(20);
});

test('the Check turn is in the Turn menu with 30 degrees, and the hook is 180 (SMM items 1 and 4)', async ({ page }) => {
  await open(page);
  await panel(page, 'Turn Sim settings').click();
  await box(page, 'Turn').selectOption({ label: 'Check turn' });
  await expect(box(page, 'Turn degrees')).toHaveValue('30');
  await expect(box(page, 'Turn degrees')).toHaveAttribute('max', '30');
  await box(page, 'Turn').selectOption({ label: 'Hook turn' });
  await expect(box(page, 'Turn degrees')).toHaveValue('180');
  await expect(box(page, 'Turn degrees')).toHaveAttribute('max', '180');
});

test('the Shackle and Cross turn are two-ship turns: greyed out in the four-ship formations, with the reason beside the menu', async ({ page }) => {
  await open(page);
  const turn = box(page, 'Turn');
  const note = page.locator('.ts-turn-note');
  for (const formation of ['4312', '2134', 'Offset box']) {
    await box(page, 'Formation').selectOption({ label: formation });
    await expect(turn.locator('option:disabled')).toHaveText(['Shackle', 'Cross turn']);
    await expect(note).toHaveText('The shackle and the cross turn are two-ship turns: pick the two-ship formation to fly them.');
  }
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  await expect(turn.locator('option:disabled')).toHaveCount(0);
  await expect(note).toBeHidden();
  await turn.selectOption({ label: 'Shackle' });
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
  // Back to four aircraft with the shackle picked: the menu moves to Delayed 90 (N1), with Turn degrees, Direction and the note.
  await box(page, 'Formation').selectOption({ label: '4312' });
  await expect(turn.locator('option:checked')).toHaveText('Delayed 90');
  await expect(box(page, 'Turn degrees')).toHaveValue('90');
  await expect(page.locator('.ts-col-setup').getByRole('group', { name: 'Direction' }).getByRole('radio').first()).toBeEnabled();
  await expect(note).toHaveText('Shackle and Cross turn are two-ship only, so this is now a Delayed 90.');
  await expect(cardLines(page)).toHaveCount(3);
  await expect(note).toHaveAttribute('role', 'status'); // announced when it appears
  // The choice is kept: back in the two-ship it stays Delayed 90, and the note is gone.
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  await expect(turn.locator('option:checked')).toHaveText('Delayed 90');
  await expect(note).toBeHidden();
});

test('with the Cross turn picked, a four-ship formation moves the menu to Delayed 90 with its note (N1)', async ({ page }) => {
  await open(page);
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  await box(page, 'Turn').selectOption({ label: 'Cross turn' });
  await expect(box(page, 'Turn degrees')).toHaveValue('180');
  const direction = page.locator('.ts-col-setup').getByRole('group', { name: 'Direction' });
  await expect(direction.getByRole('radio').first()).toBeDisabled();
  await box(page, 'Formation').selectOption({ label: 'Offset box' });
  await expect(box(page, 'Turn').locator('option:checked')).toHaveText('Delayed 90');
  await expect(box(page, 'Turn degrees')).toHaveValue('90');
  await expect(direction.getByRole('radio').first()).toBeEnabled();
  await expect(page.locator('.ts-direction-note')).toBeHidden();
  await expect(page.locator('.ts-turn-note')).toHaveText('Shackle and Cross turn are two-ship only, so this is now a Delayed 90.');
});

test('the Cross turn greys out Direction and says which way Lead turns', async ({ page }) => {
  await open(page);
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  const direction = page.locator('.ts-col-setup').getByRole('group', { name: 'Direction' });
  const note = page.locator('.ts-direction-note');
  await expect(note).toBeHidden();
  await expect(direction.getByRole('radio').first()).toBeEnabled();
  await box(page, 'Turn').selectOption({ label: 'Cross turn' });
  await expect(direction.getByRole('radio').first()).toBeDisabled();
  await expect(note).toContainText('Lead always turns toward #2');
  await expect(note).toContainText(/: (left|right) in this run/);
  await expect(direction).toHaveAccessibleDescription(/Lead always turns toward #2/);
  await box(page, 'Turn').selectOption({ label: 'Delayed 90' });
  await expect(direction.getByRole('radio').first()).toBeEnabled();
  await expect(note).toBeHidden();
  await expect(direction).not.toHaveAttribute('aria-describedby', /.+/);
});

test('the Shackle greys out Direction: both aircraft turn toward each other', async ({ page }) => {
  await open(page);
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  const direction = page.locator('.ts-col-setup').getByRole('group', { name: 'Direction' });
  const note = page.locator('.ts-direction-note');
  await box(page, 'Turn').selectOption({ label: 'Shackle' });
  await expect(direction.getByRole('radio').first()).toBeDisabled();
  await expect(note).toHaveText("Both turn toward each other; direction doesn't apply.");
  await expect(direction).toHaveAccessibleDescription("Both turn toward each other; direction doesn't apply.");
  await box(page, 'Turn').selectOption({ label: 'Delayed 90' });
  await expect(direction.getByRole('radio').first()).toBeEnabled();
  await expect(note).toBeHidden();
});

test('the Auto clock position label follows the turn (Delayed 45 is 4:30 right, 7:30 left)', async ({ page }) => {
  await open(page);
  await box(page, 'Timing').selectOption({ label: 'Clock position cue' });
  const clock = box(page, 'Clock position').first();
  await expect(clock.locator('option', { hasText: 'Auto (' })).toHaveText('Auto (7 right, 5 left)');
  await box(page, 'Turn').selectOption({ label: 'Delayed 45' });
  await expect(clock.locator('option', { hasText: 'Auto (' })).toHaveText('Auto (4:30 right, 7:30 left)');
  await box(page, 'Turn').selectOption({ label: 'Delayed 90' });
  await expect(clock.locator('option', { hasText: 'Auto (' })).toHaveText('Auto (7 right, 5 left)');
});

test('the Delayed 45 style, check turn and roll-in boxes sit in the settings menu and show only for the Delayed 45', async ({ page }) => {
  await open(page);
  await panel(page, 'Turn Sim settings').click();
  await expect(box(page, 'Delayed 45 style')).toBeHidden();
  await box(page, 'Turn').selectOption({ label: 'Delayed 45' });
  await expect(box(page, 'Delayed 45 style').locator('option')).toHaveText(['Auto (check in 4-ship, plain in two-ship)', 'Plain', 'With check turn']);
  await expect(box(page, 'Delayed 45 style').locator('option:checked')).toHaveText('Auto (check in 4-ship, plain in two-ship)');
  await expect(box(page, 'Check turn')).toHaveValue('12.5');
  await expect(box(page, 'Roll in to hold the set spacing')).not.toBeChecked();
  await box(page, 'Check turn').fill('15');
  await expect(box(page, 'Check turn')).toHaveValue('15');
  await box(page, 'Turn').selectOption({ label: 'Delayed 90' });
  await expect(box(page, 'Check turn')).toBeHidden();
});

test('when the Delayed 45 flies its check turn, the summary says so and Base delay and Auto step say they do not apply', async ({ page }) => {
  await open(page);
  const note = page.locator('.ts-check-note');
  await box(page, 'Turn').selectOption({ label: 'Delayed 45' });
  await expect(note).toHaveText('Delayed 45 with a 12.5° check (SMM Fig 16.34)'); // 4312: auto is the check
  await expect(box(page, 'Base delay')).toBeDisabled();
  await expect(box(page, 'Base delay')).toHaveAccessibleDescription(/do not apply/);
  await box(page, 'Timing').selectOption({ label: 'Auto timing' });
  await expect(page.locator('.ts-auto')).toHaveText('Auto step does not apply to the check turn.');
  await box(page, 'Timing').selectOption({ label: 'Time delay' });
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  await expect(note).toBeHidden(); // auto is the plain turn in the two-ship
  await expect(box(page, 'Base delay')).toBeEnabled();
  await expect(box(page, 'Base delay')).not.toHaveAttribute('aria-describedby', /.+/);
  await panel(page, 'Turn Sim settings').click();
  await box(page, 'Delayed 45 style').selectOption({ label: 'With check turn' });
  await expect(note).toHaveText('Delayed 45 with a 12.5° check (SMM Fig 16.17)');
  await expect(box(page, 'Base delay')).toBeDisabled();
  await box(page, 'Delayed 45 style').selectOption({ label: 'Plain' });
  await box(page, 'Formation').selectOption({ label: '4312' });
  await expect(note).toBeHidden();
  await expect(box(page, 'Base delay')).toBeEnabled();
});

test('a 15 degree check at 4,000 ft spacing in 4312 shows the close pass before Play', async ({ page }) => {
  await open(page);
  const flags = page.locator('.ts-flags li');
  await panel(page, 'Turn Sim settings').click();
  await box(page, 'Turn').selectOption({ label: 'Delayed 45' });
  await expect(flags).toHaveCount(0); // at the defaults nothing is close
  await box(page, 'Check turn').fill('15');
  await box(page, 'Spacing').fill('4000');
  await expect(flags).toHaveText(["Close pass: 894 ft, #1 and #3", "Close pass: 894 ft, #3 and #4"]); // measured: the two four-ship pairs
  await box(page, 'Spacing').fill('6000');
  await expect(flags).toHaveCount(0);
});

test('the box Delayed 45 with its check turn shows the rear shift in the band lines, with the solved wording', async ({ page }) => {
  await open(page);
  await box(page, 'Formation').selectOption({ label: 'Offset box' });
  await box(page, 'Turn').selectOption({ label: 'Delayed 45' });
  await panel(page, 'More detail').click();
  const lines = page.locator('.ts-lines li.tone-caution');
  await expect(lines).toHaveText([
    '#3 36.7 s, outside the SMM 10-15 s; solved so the box keeps its shape',
    '#4 36.7 s, outside the SMM 10-15 s; solved so the box keeps its shape',
  ]);
  await page.locator('.ts-col-setup').getByRole('group', { name: 'Direction' }).getByText('Left', { exact: true }).click();
  await expect(lines).toHaveText([
    '#3 1.0 s, outside the SMM 10-15 s; solved so the box keeps its shape',
    '#4 1.0 s, outside the SMM 10-15 s; solved so the box keeps its shape',
  ]);
});

test('the SMM settings sit in the closed Turn Sim settings menu, each at its default, shown only when they apply', async ({ page }) => {
  await open(page);
  await panel(page, 'Turn Sim settings').click();
  await expect(box(page, 'Run at least until the turn is done')).toBeChecked();
  await expect(box(page, "#2's side").locator('option:checked')).toHaveText('Left');
  await expect(box(page, 'Rear element delay')).toBeHidden();
  await expect(box(page, 'Cross turn first-stage G')).toBeHidden();
  // The offset box.
  await box(page, 'Formation').selectOption({ label: 'Offset box' });
  await expect(box(page, "#2's side")).toBeHidden();
  // A1: it only mirrors 4312 and 2134, so the two-ship hides it too.
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  await expect(box(page, "#2's side")).toBeHidden();
  await box(page, 'Formation').selectOption({ label: '2134' });
  await expect(box(page, "#2's side")).toBeVisible();
  await box(page, 'Formation').selectOption({ label: 'Offset box' });
  await expect(box(page, 'Rear element delay')).toHaveValue('12.5');
  await expect(box(page, '#4 timing').locator('option')).toHaveText(['Fly to the box slot (solved)', 'Rear element delay (SMM)', 'Solve by ground track', 'Late (V6)', 'Early (V6)']);
  await expect(box(page, '#4 timing').locator('option:checked')).toHaveText('Fly to the box slot (solved)');
  await expect(box(page, 'Wait for #3 and #4 to finish turning')).toBeChecked();
  await expect(box(page, 'Rear element check')).not.toBeChecked();
  // The cross turn.
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  await box(page, 'Turn').selectOption({ label: 'Cross turn' });
  await expect(box(page, 'Cross turn first-stage G')).toHaveValue('2');
  await expect(box(page, 'Cross turn switch point')).toHaveValue('90');
});

test('the offset box shows #3 and #4 delays against the 10-15 s band in More detail, and flags one outside it', async ({ page }) => {
  await open(page);
  await box(page, 'Formation').selectOption({ label: 'Offset box' });
  await panel(page, 'More detail').click();
  const band = page.locator('.ts-detail li', { hasText: /^#[34] / });
  await expect(band).toHaveCount(2);
  // The default, the solved box slot: #3 is judged against the band (the flag for an outside delay is pinned in the unit test).
  await expect(band.first()).toHaveText(/^#3 \d+\.\d s, (in the 10-15 s band|outside the SMM 10-15 s; solved so the box keeps its shape)$/);
  // #4 turns on the normal LAB cue off #3 (Fig 16.30): its time from #3 is information, with no flag and no minus sign.
  await expect(band.nth(1)).toHaveText(/^#4 turns \d+\.\d s (before|after) #3$/);
  await expect(band.nth(1)).not.toHaveClass(/tone-caution/);
  // The SMM's fixed rear delay: 12.5 s is in the band, and 20 s is outside it.
  await panel(page, 'Turn Sim settings').click();
  await box(page, '#4 timing').selectOption({ label: 'Rear element delay (SMM)' });
  await expect(band.first()).toHaveText('#3 12.5 s, in the 10-15 s band');
  await box(page, 'Rear element delay').fill('20');
  await expect(page.locator('.ts-detail li', { hasText: 'outside 10-15 s' }).first()).toBeVisible();
  // Not in the offset box: no band lines.
  await box(page, 'Formation').selectOption({ label: '4312' });
  await expect(page.locator('.ts-detail li', { hasText: /10-15 s/ })).toHaveCount(0);
});

// TS-11: below the design width the columns stack, so the playback buttons are never covered.
for (const [width, height] of [[1024, 768], [390, 844]]) {
  test(`at ${width} x ${height} Play, Step and Reset are visible, not covered, and nothing sticks out sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    for (const name of ['Play', 'Step', 'Reset']) {
      const el = name === 'Play' ? playButton(page) : button(page, name);
      await el.scrollIntoViewIfNeeded();
      const covered = await el.evaluate((node) => {
        const r = node.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(top === node || node.contains(top));
      });
      expect(covered, `${name} is covered`).toBe(false);
    }
    await playButton(page).click(); // a real click: Playwright refuses if something is over it
    await expect.poll(() => simTime(page)).toBeGreaterThan(0.3);
    await playButton(page).click();
    expect(await layoutProblems(page)).toEqual([]);
  });
}

test('the Cross turn shows its second-half G and roll-out spacing, in the caution colour when the G is clamped', async ({ page }) => {
  await open(page);
  await box(page, 'Formation').selectOption({ label: 'Two-ship' });
  const note = page.locator('.ts-cross-note');
  await expect(note).toBeHidden();
  await box(page, 'Turn').selectOption({ label: 'Cross turn' });
  await expect(note).toHaveText(/^Second half at \d\.\d G to roll out [\d,]+ ft apart$/);
  await expect(note).not.toHaveClass(/is-clamped/);
  // The switch lives in the settings menu, on by default.
  await panel(page, 'Turn Sim settings').click();
  await expect(box(page, 'Set second-half G for LAB roll-out')).toBeChecked();
  // Far apart, the G cannot go low enough: the note says so.
  await box(page, 'Spacing').fill('20000');
  await expect(note).toContainText('held at');
  await expect(note).toHaveClass(/is-clamped/);
  // Off flies the G setting all the way, as V6 did: no note.
  await box(page, 'Set second-half G for LAB roll-out').uncheck();
  await expect(note).toBeHidden();
});

test('the offset box hook shows which pairs cross: 300 ft vertical needed', async ({ page }) => {
  await open(page);
  const flags = page.locator('.ts-flags li');
  await expect(flags).toHaveCount(0);
  await box(page, 'Formation').selectOption({ label: 'Offset box' });
  await box(page, 'Turn').selectOption({ label: 'Hook turn' });
  // Right turn: #1 with #3 and #2 with #4 pass nose to nose. It is known before Play.
  await expect(flags).toHaveText(['Crossing: 300 ft vertical needed, #1 and #3', 'Crossing: 300 ft vertical needed, #2 and #4']);
  await box(page, 'Turn').selectOption({ label: 'Delayed 90' });
  await expect(flags).toHaveCount(0);
});

test('without WebGL2 the Turn Sim stays in 2D, says why, and never downloads three.js', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return type === 'webgl2' || type === 'webgl' ? null : original.call(this, type, ...rest);
    };
  });
  const seen = threeRequests(page);
  await open(page);
  await viewChoice(page, '3D').click(); // the choice goes back to 2D by itself, so no checked-state wait here
  await expect(page.locator('.ts-note')).toHaveText('3D needs WebGL, which this browser does not have.');
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(canvas(page)).toBeVisible();
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
  expect(seen).toEqual([]);
});

// The route tests wait for the Turn Sim's entry in src/shell/registry.js
// (load: () => import('../modules/turn-sim/index.js')); until then the card says "Coming soon".
test('opens from its card on the home screen', async ({ page }) => {
  await openRoute(page, '#/');
  await page.locator('a.card[href="#/turn-sim"]').click();
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'turn-sim');
  await expect(page).toHaveTitle("Formation Turn Sim · DAD's OODA LOOP");
  await expect(playButton(page)).toBeVisible();
  await expect.poll(() => pixelsNear(page, [0, 102, 255])).toBeGreaterThan(20);
});

test('the route opens and plays from a direct link, then leaves nothing running', async ({ page }) => {
  // The home screen keeps a few listeners of its own, so count them before going in and compare after coming back.
  await openRoute(page, '#/');
  const home = await page.evaluate(() => window.__ooda.stats());
  await page.evaluate(() => { location.hash = '#/turn-sim'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'turn-sim');
  await playButton(page).click();
  await expect.poll(() => simTime(page)).toBeGreaterThan(0.5);
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'home');
  const stats = await page.evaluate(() => window.__ooda.stats());
  expect(stats.frames).toBe(0);
  expect(stats.listeners).toBe(home.listeners);
});
