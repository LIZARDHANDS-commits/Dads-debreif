// Browser tests for the Turn Fight (SPEC-turn-fight, Testing strategy 4): every
// control does something (R3), nothing overlaps at 1366 × 768 and 1920 × 1080
// (R2), closing the module leaves no frames or timers running (R4), and no
// console errors (R7, from ./fixtures.js).
import { test, expect, expectNoA11yViolations } from './fixtures.js';
import { openRoute } from './routes.js';
import { createEnergyFight, stepEnergyFight } from '../../src/modules/turn-fight/energy-sim.js';
import { topKiasAt } from '../../src/modules/turn-fight/state.js';

const time = (page) => page.locator('.tf-time');
const phase = (page) => page.locator('.tf-phase');
const playButton = (page) => page.locator('.tf-play');
const blue = (page) => page.getByRole('group', { name: 'Blue' });
const red = (page) => page.getByRole('group', { name: 'Red' });
const result = (page) => page.getByRole('table', { name: 'Result' });
const settingsButton = (page) => page.getByRole('button', { name: 'Turn Fight settings' });
const resetDefaults = (page) => page.getByRole('button', { name: /Reset to (Standard|V6) defaults/i });

const seconds = async (page) => Number((await time(page).textContent()).replace('T+', ''));

// How many pixels of a canvas are close to a colour, to see what's drawn.
function pixelsNear(page, selector, [r, g, b]) {
  return page.locator(selector).evaluate((canvas, rgb) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200 && Math.abs(data[i] - rgb[0]) < 40 && Math.abs(data[i + 1] - rgb[1]) < 40 && Math.abs(data[i + 2] - rgb[2]) < 40) n++;
    }
    return n;
  }, [r, g, b]);
}
const BLUE = [0x58, 0xa6, 0xff];
const RED = [0xff, 0x6b, 0x6b];
const NOSE = [0xff, 0xcc, 0x66];

// A hash of a canvas, to see whether the picture changed.
const picture = (page, selector) => page.locator(selector).evaluate((canvas) => canvas.toDataURL());

async function playTo(page, atLeastSec) {
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page), { timeout: 30_000 }).toBeGreaterThan(atLeastSec);
  await playButton(page).click(); // Pause
  await expect(playButton(page)).toHaveText('Play');
}

// Finds visible controls that overlap each other or stick out of the page.
async function layoutProblems(page) {
  return page.evaluate(() => {
    const controls = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
      })
      .filter((el) => !el.classList.contains('skip-link'))
      // Controls scrolled out of a column's own scroll area aren't on screen.
      .filter((el) => {
        const col = el.closest('.tf-col');
        if (!col) return true;
        const c = col.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return r.bottom <= c.bottom + 0.5 && r.top >= c.top - 0.5;
      });
    const problems = [];
    const pageWidth = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > pageWidth) problems.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${pageWidth})`);
    const name = (el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || el.id).trim().slice(0, 30)}"`;
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
    // The three columns sit side by side, none covering another (R2).
    const cols = [...document.querySelectorAll('.tf-col, .tf-stage')].map((el) => el.getBoundingClientRect());
    for (let i = 0; i < cols.length; i++) {
      for (let j = i + 1; j < cols.length; j++) {
        if (Math.min(cols[i].right, cols[j].right) - Math.max(cols[i].left, cols[j].left) > 1) problems.push('two columns overlap');
      }
    }
    return problems;
  });
}

test('opens from its card with only the essentials, filled with V6\'s defaults @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  await page.locator('a.card[href="#/turn-fight"]').click();
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'turn-fight');
  await expect(page).toHaveTitle('Turn Fight · DAD\'s OODA LOOP');
  await expect(page.getByRole('radio', { name: '2-circle' })).toBeChecked();
  await expect(page.getByLabel('Start separation')).toHaveValue('2');
  for (const who of [blue(page), red(page)]) {
    await expect(who.getByLabel('Speed (KTAS)')).toHaveValue('220');
    await expect(who.getByLabel('G', { exact: true })).toHaveValue('5');
    await expect(who.getByLabel('Pitch (°)')).toBeHidden();
  }
  for (const name of ['First nose chases', 'Climb and dive']) await expect(page.getByLabel(name)).not.toBeChecked();
  await expect(page.getByText('Two aircraft start apart and turn, at the pass or at once: who gets their nose on the other first?')).toBeVisible();
  // Energy (T-6) is a checkbox, off, and none of its boxes show until it is ticked (R22).
  await expect(page.getByLabel(/BFM Energy Fight|Energy \(T-6\)/)).not.toBeChecked();
  await expect(page.getByLabel('Start altitude (ft)')).toHaveCount(2);
  await expect(page.getByLabel('Start altitude (ft)').first()).toBeHidden();
  await expect(page.getByText('coming soon')).toHaveCount(0);
  await expect(page.getByLabel('Playback speed')).toHaveValue('1'); // the option at index 1 is 1×
  await expect(page.getByLabel('Playback speed').locator('option:checked')).toHaveText('1×');
  await expect(time(page)).toHaveText('T+0.0');
  await expect(phase(page)).toHaveText('HEAD-TO-HEAD');
  // Nothing opens by itself, and there's no warning at V6's defaults.
  await expect(resetDefaults(page)).toBeHidden();
  await expect(page.locator('.tf-warning')).toHaveText(['', '', '']); // the warnings' boxes are always there, empty (Blue's, Red's, and Energy's start check)
  await expect(page.locator('.tf-warning').first()).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('.tf-profile')).toBeHidden();
  await expect(page.getByRole('button', { name: 'More detail' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'About this model' })).toHaveAttribute('aria-expanded', 'false');
  await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'false');
  // The Result card at T+0: 19.2°/s and 1,106 ft each, 2.00 NM apart.
  await expect(result(page).getByRole('row', { name: /Turn rate/ })).toHaveText(/19\.2°\/s.*19\.2°\/s/);
  await expect(result(page).getByRole('row', { name: /Turn radius/ })).toHaveText(/1,106 ft.*1,106 ft/);
  await expect(result(page).getByRole('row', { name: /Range/ })).toContainText('2.00 NM');
  await expect(result(page).getByRole('row', { name: /First nose-on/ })).toContainText('--');
  await expect(page.locator('.tf-footer')).toHaveText(/Turn Circle Geometry: constant-speed turn circles|Simplified: constant/);
  // The top-down view is drawn: both aircraft and the grid.
  await expect.poll(() => pixelsNear(page, 'canvas.tf-topdown', BLUE)).toBeGreaterThan(30);
  await expect.poll(() => pixelsNear(page, 'canvas.tf-topdown', RED)).toBeGreaterThan(30);
});

test('play, pause and reset, and a paused fight runs nothing', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await expect(playButton(page)).toHaveText('Play');
  const idle = await page.evaluate(() => window.__ooda.stats()); // the app's own timers (clock, updates) are in it
  expect(idle.frames).toBe(0);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => seconds(page)).toBeGreaterThan(1.5);
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  // The frame already asked for when Pause was pressed may still draw; wait for it, then nothing more may.
  await expect.poll(() => page.evaluate(() => window.__ooda.stats().frames)).toBe(0);
  const paused = await time(page).textContent();
  const pausedPicture = await picture(page, 'canvas.tf-topdown');
  await page.waitForTimeout(600);
  expect(await time(page).textContent()).toBe(paused);
  expect(await picture(page, 'canvas.tf-topdown')).toBe(pausedPicture);
  // No frame or timer keeps running while paused (R4, #43): nothing beyond what the app itself runs.
  expect(await page.evaluate(() => window.__ooda.stats())).toMatchObject({ frames: 0, timers: idle.timers });

  await playButton(page).click(); // play on from where it was
  await expect.poll(() => seconds(page)).toBeGreaterThan(Number(paused.replace('T+', '')) + 0.5);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(time(page)).toHaveText('T+0.0');
  await expect(playButton(page)).toHaveText('Play');
  await expect(phase(page)).toHaveText('HEAD-TO-HEAD');
  await expect(result(page).getByRole('row', { name: /Range/ })).toContainText('2.00 NM');
});

test('the fight flies the merge and then the turns: T+ runs on, the phase changes, both trails appear', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect(phase(page)).toHaveText('2-CIRCLE', { timeout: 15_000 }); // the merge is at T+16.4
  await playButton(page).click();
  expect(await seconds(page)).toBeGreaterThan(16.3);
  expect(await pixelsNear(page, 'canvas.tf-topdown', BLUE)).toBeGreaterThan(200);
  expect(await pixelsNear(page, 'canvas.tf-topdown', RED)).toBeGreaterThan(200);
});

test('Space plays or pauses and Home resets, but not while typing', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await page.locator('h1.visually-hidden').evaluate((el) => el.ownerDocument.body.focus());
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Play');
  await page.keyboard.press('Home');
  await expect(time(page)).toHaveText('T+0.0');
  // In a number box, Space and Home belong to the box.
  await page.getByLabel('Start separation').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Home');
  await expect(playButton(page)).toHaveText('Play');
  await expect(time(page)).toHaveText('T+0.0');
  // On the Play button itself, Space presses the button once (not twice).
  await playButton(page).focus();
  await page.keyboard.press('Space');
  await expect(playButton(page)).toHaveText('Pause');
  await page.waitForTimeout(150);
  await expect(playButton(page)).toHaveText('Pause');
});

test('a bad number is refused with a message and the fight keeps its last good setup', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  const speed = blue(page).getByLabel('Speed (KTAS)');
  const rate = result(page).getByRole('row', { name: /Turn rate/ });
  const cases = [
    [speed, '999', /Enter a number from 60 to 400 KTAS/],
    [speed, '59', /Enter a number from 60 to 400 KTAS/],
    [speed, '', /Enter a number from 60 to 400 KTAS/],
    [blue(page).getByLabel('G', { exact: true }), '0.5', /Enter a number from 1\.1 to 9 G/],
    [blue(page).getByLabel('G', { exact: true }), '10', /Enter a number from 1\.1 to 9 G/],
    [page.getByLabel('Start separation'), '11', /Enter a number from 0\.5 to 10 NM/],
    [page.getByLabel('Start separation'), '0', /Enter a number from 0\.5 to 10 NM/],
  ];
  for (const [box, value, message] of cases) {
    await box.fill(value);
    await box.blur();
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(box.locator('xpath=..').locator('.control-message')).toHaveText(message);
    await expect(rate).toHaveText(/19\.2°\/s.*19\.2°\/s/); // still the last good fight
    await expect(time(page)).toHaveText('T+0.0');
  }
  // A bad number while playing doesn't stop or jump the fight.
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);
  await speed.fill('1000');
  await speed.blur();
  await expect(playButton(page)).toHaveText('Pause');
  expect(await seconds(page)).toBeGreaterThan(0.4);
  await playButton(page).click();
  // A good number is accepted: the message goes and the fight starts again with it.
  await speed.fill('250');
  await speed.blur();
  await expect(speed).not.toHaveAttribute('aria-invalid', 'true');
  await expect(time(page)).toHaveText('T+0.0');
  await expect(rate).toHaveText(/16\.9°\/s.*19\.2°\/s/);
});

test('changing the setup starts the fight again; playback speed never does', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(1);
  const before = await seconds(page);
  await page.getByLabel('Playback speed').selectOption({ label: '2×' });
  await expect(playButton(page)).toHaveText('Pause');
  expect(await seconds(page)).toBeGreaterThanOrEqual(before);
  await page.getByText('1-circle', { exact: true }).click();
  await expect(time(page)).toHaveText('T+0.0');
  await expect(playButton(page)).toHaveText('Play');
  await expect(page.getByRole('radio', { name: '1-circle' })).toBeChecked();
  for (const change of [
    () => red(page).getByLabel('Speed (KTAS)').fill('230'),
    () => red(page).getByLabel('G', { exact: true }).fill('6'),
    () => page.getByLabel('Start separation').fill('3'),
    () => page.getByLabel('First nose chases').check(),
    () => page.getByLabel('Climb and dive').check(),
  ]) {
    await playButton(page).click();
    await expect.poll(() => seconds(page)).toBeGreaterThan(0.3);
    await change();
    await expect(time(page)).toHaveText('T+0.0');
    await expect(playButton(page)).toHaveText('Play');
  }
});

test('the T-6 limit warning shows beside a G box that is too high for the speed, and the fight still flies it', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await blue(page).getByLabel('Speed (KTAS)').fill('120');
  await expect(blue(page).getByText("4.0 G is above the T-6's stall limit at 120 kt (1.9 G)")).toBeVisible();
  await expect(red(page).locator('.tf-warning')).toHaveText('');
  await expect(result(page).getByRole('row', { name: /Turn rate/ })).toContainText('°/s'); // still a fight
  await blue(page).getByLabel('Speed (KTAS)').fill('300');
  await blue(page).getByLabel('G', { exact: true }).fill('8');
  await expect(blue(page).getByText("Above the T-6's 7 G limit")).toBeVisible();
  await blue(page).getByLabel('G', { exact: true }).fill('6.5');
  await expect(blue(page).locator('.tf-warning')).toHaveText(''); // the words go; the live region stays
});

test('Turn Fight settings is closed at first; it holds the height scale, and Reset to V6 defaults puts everything back', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await expect(page.getByText('Side view height scale')).toBeHidden();
  await settingsButton(page).click();
  await expect(settingsButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Display', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Side view height scale' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Side view height scale' }).getByRole('radio', { name: '2×' })).toBeChecked();

  // Change a lot, including a refused entry left showing in a box.
  await page.getByText('1-circle', { exact: true }).click();
  await page.getByLabel('Start separation').fill('3');
  await red(page).getByLabel('Speed (KTAS)').fill('260');
  await blue(page).getByLabel('G', { exact: true }).fill('999');
  await blue(page).getByLabel('G', { exact: true }).blur();
  await page.getByLabel('Climb and dive').check();
  await page.getByLabel('First nose chases').check();
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await page.getByRole('group', { name: 'Side view height scale' }).getByText('4×', { exact: true }).click();
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);

  await resetDefaults(page).click();
  await expect(page.getByRole('radio', { name: '2-circle' })).toBeChecked();
  await expect(page.getByLabel('Start separation')).toHaveValue('2');
  await expect(red(page).getByLabel('Speed (KTAS)')).toHaveValue('220');
  await expect(blue(page).getByLabel('G', { exact: true })).toHaveValue('5');
  await expect(blue(page).getByLabel('G', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Climb and dive')).not.toBeChecked();
  await expect(page.getByLabel('First nose chases')).not.toBeChecked();
  await expect(page.getByLabel('Playback speed').locator('option:checked')).toHaveText('1×');
  await expect(page.getByRole('group', { name: 'Side view height scale' }).getByRole('radio', { name: '2×' })).toBeChecked();
  await expect(time(page)).toHaveText('T+0.0');
  await expect(playButton(page)).toHaveText('Play');
  await expect(page.locator('.tf-profile')).toBeHidden();
  // Reset with a refused entry showing and nothing else changed also clears the box.
  await red(page).getByLabel('Speed (KTAS)').fill('999');
  await red(page).getByLabel('Speed (KTAS)').blur();
  await expect(red(page).getByLabel('Speed (KTAS)')).toHaveAttribute('aria-invalid', 'true');
  await resetDefaults(page).click();
  await expect(red(page).getByLabel('Speed (KTAS)')).toHaveValue('220');
  await expect(red(page).getByLabel('Speed (KTAS)')).not.toHaveAttribute('aria-invalid', 'true');
  // The menu closes again with its button.
  await settingsButton(page).click();
  await expect(resetDefaults(page)).toBeHidden();
});

test('settings are remembered in this browser', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await page.getByText('1-circle', { exact: true }).click();
  await blue(page).getByLabel('Speed (KTAS)').fill('240');
  await page.getByLabel('Climb and dive').check();
  await blue(page).getByLabel('Pitch (°)').fill('15');
  await page.getByLabel('Playback speed').selectOption({ label: '2×' });
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'turn-fight');
  await expect(page.getByRole('radio', { name: '1-circle' })).toBeChecked();
  await expect(blue(page).getByLabel('Speed (KTAS)')).toHaveValue('240');
  await expect(page.getByLabel('Climb and dive')).toBeChecked();
  await expect(blue(page).getByLabel('Pitch (°)')).toHaveValue('15');
  await expect(page.getByLabel('Playback speed').locator('option:checked')).toHaveText('2×');
  await expect(time(page)).toHaveText('T+0.0'); // a fight always opens at the start
});

test('Climb and dive shows pitch and the side view, and the height scale works without resetting the fight', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await expect(page.locator('.tf-profile')).toBeHidden();
  await page.getByLabel('Climb and dive').check();
  for (const who of [blue(page), red(page)]) await expect(who.getByLabel('Pitch (°)')).toHaveValue('0');
  await expect(page.locator('.tf-profile')).toBeVisible();
  await expect(page.getByLabel('First nose chases')).not.toBeChecked(); // each box shows only its own controls
  // A pitch outside ±60° is refused.
  await blue(page).getByLabel('Pitch (°)').fill('75');
  await blue(page).getByLabel('Pitch (°)').blur();
  await expect(blue(page).getByLabel('Pitch (°)').locator('xpath=..').locator('.control-message')).toHaveText(/Enter a number from -60 to 60/);
  await blue(page).getByLabel('Pitch (°)').fill('25');
  await red(page).getByLabel('Pitch (°)').fill('-25');
  await playTo(page, 22);
  const t = await seconds(page);
  await expect.poll(() => pixelsNear(page, 'canvas.tf-profile-canvas', BLUE)).toBeGreaterThan(40);
  await expect.poll(() => pixelsNear(page, 'canvas.tf-profile-canvas', RED)).toBeGreaterThan(40);
  await page.getByRole('button', { name: 'More detail' }).click();
  await expect(page.getByRole('row', { name: /Height change/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Height between/ })).toBeVisible();

  // The height scale changes the side view, and never the fight (#20).
  await settingsButton(page).click();
  const scale = page.getByRole('group', { name: 'Side view height scale' });
  await expect(scale.getByRole('radio', { name: '2×' })).toBeEnabled();
  const pictures = [];
  for (const label of ['1×', '2×', '4×']) {
    await scale.getByText(label, { exact: true }).click();
    await expect(scale.getByRole('radio', { name: label })).toBeChecked();
    await expect.poll(() => picture(page, 'canvas.tf-profile-canvas')).not.toBe(pictures.at(-1) ?? '');
    pictures.push(await picture(page, 'canvas.tf-profile-canvas'));
  }
  expect(new Set(pictures).size).toBe(3);
  expect(await time(page).textContent()).toBe(`T+${t.toFixed(1)}`);
  await expect(playButton(page)).toHaveText('Play');

  // Climb and dive off again: its boxes and the side view go.
  await page.getByLabel('Climb and dive').uncheck();
  await expect(page.locator('.tf-profile')).toBeHidden();
  await expect(blue(page).getByLabel('Pitch (°)')).toBeHidden();
  await expect(scale.getByRole('radio', { name: '2×' })).toBeDisabled(); // nothing to scale without the side view
  await expect(page.getByRole('row', { name: /Height change/ })).toHaveCount(0);
});

test('First nose chases turns the dashed first nose-on line and the result on', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await page.getByLabel('First nose chases').check();
  await playTo(page, 40);
  await expect(result(page).getByRole('row', { name: /First nose-on/ })).toHaveText(/(Blue|Red|Both) at \+\d+\.\d s/);
  await expect.poll(() => pixelsNear(page, 'canvas.tf-topdown', NOSE)).toBeGreaterThan(60);
});

test('About this model and the side columns open and close with real buttons', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  const about = page.getByRole('button', { name: 'About this model' });
  await about.click();
  await expect(about).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('each jet turns toward the other')).toBeVisible();
  await expect(page.getByText('Red turns away from Blue, so the two share one circle')).toBeVisible();
  await expect(page.getByText('a yellow dashed line marks the first aircraft')).toBeVisible();
  await about.click();
  await expect(page.getByText('each jet turns toward the other')).toBeHidden();
  // The model statement is shown once, in the stage footer.
  await expect(page.getByText(/Turn Circle Geometry: constant-speed turn circles|Simplified: constant/)).toHaveCount(1);

  const stage = page.locator('.tf-stage');
  const narrow = (await stage.boundingBox()).width;
  await page.getByRole('button', { name: 'Fight setup' }).click();
  await expect(page.getByLabel('Start separation')).toBeHidden();
  await page.getByRole('button', { name: 'Result' }).click();
  await expect(result(page)).toBeHidden();
  expect((await stage.boundingBox()).width).toBeGreaterThan(narrow + 300);
  await expect.poll(() => pixelsNear(page, 'canvas.tf-topdown', BLUE)).toBeGreaterThan(30); // the view follows its box
  await page.getByRole('button', { name: 'Fight setup' }).click();
  await page.getByRole('button', { name: 'Result' }).click();
  await expect(page.getByLabel('Start separation')).toBeVisible();
});

test('More detail holds the extra numbers and updates while playing', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await expect(page.getByRole('row', { name: /360° time/ })).toBeHidden();
  await page.getByRole('button', { name: 'More detail' }).click();
  await expect(page.getByRole('row', { name: /^Speed/ })).toHaveText(/220 kt.*220 kt/);
  await expect(page.getByRole('row', { name: /^G/ })).toHaveText(/4\.0.*4\.0/);
  await expect(page.getByRole('row', { name: /360° time/ })).toHaveText(/18\.7 s.*18\.7 s/);
  await expect(page.getByRole('row', { name: /Time since the pass/ })).toContainText('0.0 s');
  await expect(page.getByRole('row', { name: /Height change/ })).toHaveCount(0); // level fight: no height lines
  await playTo(page, 17.5);
  await expect(page.getByRole('row', { name: /Time since the pass/ })).toContainText(/[1-9]\.\d s/); // merge at 16.4 s
});

test('leaving the Turn Fight while it plays stops every frame, timer and listener (R4)', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(1);
  expect((await page.evaluate(() => window.__ooda.stats())).frames).toBeGreaterThan(0);
  await expect(page.locator('link[rel="stylesheet"][href*="turn-fight"]')).toHaveCount(1);
  await page.evaluate(() => { location.hash = '#/about'; }); // a page that starts nothing of its own
  await expect.poll(() => page.evaluate(() => window.__ooda.stats()))
    .toMatchObject({ mounted: 'about', frames: 0, listeners: 0, subscriptions: 0 });
  // Its stylesheet goes with it, and coming back starts a fresh fight.
  await expect(page.locator('link[rel="stylesheet"][href*="turn-fight"]')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/turn-fight'; });
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'turn-fight');
  await expect(time(page)).toHaveText('T+0.0');
  await expect(playButton(page)).toHaveText('Play');
});

// ---- 2D | 3D switch and the 3D view (SPEC-turn-fight, "2D and 3D views", task 5b) ---------------------------------
const viewChoice = (page, name) => page.getByRole('radio', { name, exact: true });
const topdown = (page) => page.locator('canvas.tf-topdown');
const canvas3d = (page) => page.locator('canvas.tf-3d-canvas');
const note = (page) => page.locator('.tf-note');
const draws3d = async (page) => Number((await page.locator('.tf-3d').getAttribute('data-draws')) ?? 0);

// Remembers every WebGL context the page makes, to see that each one is released (isContextLost) when 3D is left.
async function trackWebGl(page) {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    window.__gl = [];
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      const context = real.call(this, type, ...rest);
      if (context && /webgl/.test(type) && !window.__gl.includes(context)) window.__gl.push(context);
      return context;
    };
  });
}
const liveContexts = (page) => page.evaluate(() => window.__gl.filter((gl) => !gl.isContextLost()).length);
const contextsMade = (page) => page.evaluate(() => window.__gl.length);

// The requests for three.js itself (its own file, not the ui-kit's three-aircraft.js that wraps it).
function threeRequests(page) {
  const seen = [];
  page.on('request', (r) => {
    if (/\/three\.module[^/]*\.js$/.test(new URL(r.url()).pathname)) seen.push(r.url());
  });
  return seen;
}

test('the View switch opens on 2D, sits by Play, and a 2D visit loads no three.js', async ({ page }) => {
  const seen = threeRequests(page);
  await trackWebGl(page);
  await openRoute(page, '#/turn-fight');
  await expect(page.getByRole('group', { name: 'View' })).toBeVisible();
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(viewChoice(page, '3D')).not.toBeChecked();
  await expect(topdown(page)).toBeVisible();
  await expect(page.locator('.tf-3d')).toBeHidden();
  await expect(page.getByRole('group', { name: 'Camera views' })).toBeHidden();
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
  expect(seen).toEqual([]);
  expect(await contextsMade(page)).toBe(0);
  // Paint is in the Display section of the closed settings menu, greyed out while 2D shows.
  await settingsButton(page).click();
  await expect(page.getByLabel('Paint')).toBeDisabled();
  await expect(page.getByLabel('Paint').locator('option:checked')).toHaveText('Harvard');
});

test('switching to 3D and back while the fight plays never resets it, and WebGL is freed each time', async ({ page }) => {
  const seen = threeRequests(page);
  await trackWebGl(page);
  await openRoute(page, '#/turn-fight');
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(2);
  const before = await seconds(page);

  await viewChoice(page, '3D').check();
  await expect(canvas3d(page)).toBeVisible();
  await expect(topdown(page)).toBeHidden();
  await expect(page.getByRole('group', { name: 'Camera views' })).toBeVisible();
  await expect(playButton(page)).toHaveText('Pause'); // still playing: nothing was reset
  expect(await seconds(page)).toBeGreaterThanOrEqual(before);
  await expect.poll(() => seconds(page)).toBeGreaterThan(before + 1); // and it goes on in 3D
  await expect.poll(() => draws3d(page)).toBeGreaterThan(3);
  expect(seen.length).toBeGreaterThan(0);
  expect(await liveContexts(page)).toBe(1);
  // Each aircraft keeps its letter, and the merge is marked.
  await expect(page.locator('.tf-3d-label-blue')).toHaveText('B');
  await expect(page.locator('.tf-3d-label-red')).toHaveText('R');
  await expect(page.locator('.tf-3d-label-nose')).toHaveText('MERGE');

  // Back to 2D while it plays: the fight goes on, the 2D picture is drawn, and the context is released.
  await viewChoice(page, '2D').check();
  await expect(topdown(page)).toBeVisible();
  await expect(canvas3d(page)).toHaveCount(0);
  expect(await liveContexts(page)).toBe(0);
  await expect(playButton(page)).toHaveText('Pause');
  const at2d = await seconds(page);
  expect(at2d).toBeGreaterThan(before + 1);
  await expect.poll(() => seconds(page)).toBeGreaterThan(at2d + 0.5);
  await expect.poll(() => pixelsNear(page, 'canvas.tf-topdown', BLUE)).toBeGreaterThan(30);

  // 3D again: three.js is not fetched a second time, and there is exactly one live context.
  const fetched = seen.length;
  await viewChoice(page, '3D').check();
  await expect(canvas3d(page)).toBeVisible();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(1);
  expect(seen.length).toBe(fetched);
  expect(await liveContexts(page)).toBe(1);

  // Paused, 3D asks for no frames at all.
  await playButton(page).click();
  await expect(playButton(page)).toHaveText('Play');
  await expect.poll(() => page.evaluate(() => window.__ooda.stats().frames)).toBe(0); // the frame asked for at Pause may still draw
  const still = await draws3d(page);
  const idle = await page.evaluate(() => window.__ooda.stats());
  await page.waitForTimeout(300);
  expect(await draws3d(page)).toBe(still);
  expect(await page.evaluate(() => window.__ooda.stats())).toMatchObject({ frames: 0, timers: idle.timers });

  // The choice is remembered: after a reload it opens in 3D, and the fight opens at the start.
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'turn-fight');
  await expect(viewChoice(page, '3D')).toBeChecked();
  await expect(canvas3d(page)).toBeVisible();
  await expect(time(page)).toHaveText('T+0.0');
});

test('the 3D view draws the fight: it changes as the fight moves, and the first nose-on shows', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  const start = await canvas3d(page).screenshot();
  await page.getByLabel('First nose chases').check();
  await playTo(page, 40);
  await expect(page.locator('.tf-3d-first-nose')).toHaveText(/FIRST NOSE — (BLUE|RED|BOTH)/);
  await expect.poll(async () => (await canvas3d(page).screenshot()).equals(start)).toBe(false);
  // Going to 2D and back leaves the time where it was.
  const t = await time(page).textContent();
  await viewChoice(page, '2D').check();
  await viewChoice(page, '3D').check();
  await expect(canvas3d(page)).toBeVisible();
  expect(await time(page).textContent()).toBe(t);
});

test('Overhead, Chase Blue and Chase Red move the camera; dragging and the wheel change the view; none of it touches the fight', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await playTo(page, 20);
  const t = await time(page).textContent();
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  const bar = page.getByRole('group', { name: 'Camera views' });
  const shots = [await canvas3d(page).screenshot()];
  for (const name of ['Overhead', 'Chase Blue', 'Chase Red']) {
    const before = await draws3d(page);
    await bar.getByRole('button', { name }).click();
    await expect.poll(() => draws3d(page)).toBeGreaterThan(before);
    shots.push(await canvas3d(page).screenshot());
  }
  for (let i = 1; i < shots.length; i++) expect(shots[i].equals(shots[i - 1]), `view ${i} differs from the one before`).toBe(false);

  // A drag orbits and the wheel zooms; each draws and then the picture is still again.
  const box = await page.locator('.tf-3d').boundingBox();
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const beforeDrag = await canvas3d(page).screenshot();
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 80, mid.y + 30, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await canvas3d(page).screenshot()).equals(beforeDrag)).toBe(false);
  const beforeWheel = await canvas3d(page).screenshot();
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await canvas3d(page).screenshot()).equals(beforeWheel)).toBe(false);
  await page.waitForTimeout(200);
  const still = await draws3d(page);
  await page.waitForTimeout(300);
  expect(await draws3d(page)).toBe(still);

  // Not one number moved.
  expect(await time(page).textContent()).toBe(t);
  await expect(playButton(page)).toHaveText('Play');
});

test('Paint is a choice in the Display section of Turn Fight settings, and it repaints the aircraft in 3D', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  await settingsButton(page).click();
  const paint = page.getByLabel('Paint');
  await expect(paint).toBeEnabled();
  // The side view's height scale is for 2D only, so it is greyed out while 3D shows.
  await expect(page.getByRole('group', { name: 'Side view height scale' }).getByRole('radio', { name: '2×' })).toBeDisabled();
  await expect(paint.locator('option')).toHaveText(['Harvard', 'Ship colours']);
  await expect(paint.locator('option:checked')).toHaveText('Harvard'); // the default
  const harvard = await canvas3d(page).screenshot();
  const drawn = await draws3d(page);
  await paint.selectOption({ label: 'Ship colours' });
  await expect.poll(() => draws3d(page)).toBeGreaterThan(drawn);
  await expect.poll(async () => (await canvas3d(page).screenshot()).equals(harvard)).toBe(false);
  await expect(time(page)).toHaveText('T+0.0'); // a display choice never resets the fight
  // Each aircraft keeps its B or R label, and the choice is remembered.
  await expect(page.locator('.tf-3d-label-blue')).toHaveText('B');
  await expect(page.locator('.tf-3d-label-red')).toHaveText('R');
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'turn-fight');
  await settingsButton(page).click();
  await expect(page.getByLabel('Paint').locator('option:checked')).toHaveText('Ship colours');
  // Reset to V6 defaults puts Harvard back, and leaves the view where it is.
  await resetDefaults(page).click();
  await expect(page.getByLabel('Paint').locator('option:checked')).toHaveText('Harvard');
  await expect(viewChoice(page, '3D')).toBeChecked();
});

// The app's service worker can answer the request for three.js from its own cache, past page.route, so it is blocked here.
test.describe('three.js offline', () => {
  test.use({ serviceWorkers: 'block' });

  test('when three.js will not load, the note says so, it stays on 2D, and 2D keeps working', async ({ page }) => {
    await page.route('**/three.module*.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'throw new Error("offline");' }));
    await openRoute(page, '#/turn-fight');
    await viewChoice(page, '3D').click(); // not check(): the view goes back to 2D at once, before check() can see 3D stay checked
    await expect(note(page)).toHaveText('3D needs a connection the first time.');
    await expect(viewChoice(page, '2D')).toBeChecked();
    await expect(topdown(page)).toBeVisible();
    await expect(canvas3d(page)).toHaveCount(0);
    await playButton(page).click();
    await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);
    await playButton(page).click();
  });
});

test('axe is clean with the 3D view on', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  await expectNoA11yViolations(page);
});

test('with WebGL 1 only (no WebGL 2, which three.js needs), the note says so and it stays on 2D', async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      return type === 'webgl2' ? null : real.call(this, type, ...rest);
    };
  });
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').click(); // not check(): the view goes back to 2D at once, before check() can see 3D stay checked
  await expect(note(page)).toHaveText('3D needs WebGL 2, which this browser does not have.');
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(topdown(page)).toBeVisible();
});

test('with no WebGL, the note says so and it stays on 2D', async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
      return /webgl/.test(type) ? null : real.call(this, type, ...rest);
    };
  });
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').click(); // not check(): the view goes back to 2D at once, before check() can see 3D stay checked
  await expect(note(page)).toHaveText('3D needs WebGL, which this browser does not have.');
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(topdown(page)).toBeVisible();
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
});

test('when the browser takes the WebGL context away (graphics card reset), it falls back to 2D with a note and the fight plays on', async ({ page }) => {
  await trackWebGl(page);
  // Releasing a context the browser already took must not make three.js warn about WEBGL_lose_context.
  const loseWarnings = [];
  page.on('console', (msg) => {
    if (/WEBGL_lose_context/.test(msg.text())) loseWarnings.push(msg.text());
  });
  await openRoute(page, '#/turn-fight');
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(1);
  expect(await liveContexts(page)).toBe(1);
  const before = await seconds(page);

  // The graphics card resets: the browser takes the context from the 3D canvas.
  await canvas3d(page).evaluate((canvas) => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(note(page)).toHaveText('3D stopped (the graphics card was reset); showing 2D.');
  await expect(viewChoice(page, '2D')).toBeChecked();
  await expect(topdown(page)).toBeVisible();
  await expect(canvas3d(page)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Camera views' })).toBeHidden();
  expect(await liveContexts(page)).toBe(0);
  expect(loseWarnings).toEqual([]);

  // The fight never stopped or reset: it is still playing, and goes on in 2D.
  await expect(playButton(page)).toHaveText('Pause');
  await expect.poll(() => seconds(page)).toBeGreaterThan(before + 0.5);
  await expect.poll(() => pixelsNear(page, 'canvas.tf-topdown', BLUE)).toBeGreaterThan(30);

  // 3D can be switched on again: a new canvas and context, and the note goes.
  await viewChoice(page, '3D').check();
  await expect(canvas3d(page)).toBeVisible();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(1);
  await expect(note(page)).toHaveText('');
  expect(await liveContexts(page)).toBe(1);
  await expect(playButton(page)).toHaveText('Pause');

  // Leaving the page still frees everything (R4).
  await page.evaluate(() => { location.hash = '#/about'; });
  await expect.poll(() => page.evaluate(() => window.__ooda.stats()))
    .toMatchObject({ mounted: 'about', frames: 0, listeners: 0, subscriptions: 0 });
  expect(await liveContexts(page)).toBe(0);
});

test('leaving the Turn Fight while 3D plays releases WebGL and stops every frame (R4)', async ({ page }) => {
  await trackWebGl(page);
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').check();
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(3);
  expect(await liveContexts(page)).toBe(1);
  await page.evaluate(() => { location.hash = '#/about'; });
  await expect.poll(() => page.evaluate(() => window.__ooda.stats()))
    .toMatchObject({ mounted: 'about', frames: 0, listeners: 0, subscriptions: 0 });
  expect(await liveContexts(page)).toBe(0);
});

for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('nothing overlaps or is cut off, first opened and with every panel open', async ({ page }) => {
      await openRoute(page, '#/turn-fight');
      expect(await layoutProblems(page)).toEqual([]);
      await page.getByLabel('Climb and dive').check();
      await page.getByRole('button', { name: 'Turn Fight settings' }).click();
      await page.getByRole('button', { name: 'About this model' }).click();
      await page.getByRole('button', { name: 'More detail' }).click();
      await blue(page).getByLabel('Speed (KTAS)').fill('120'); // with a limit warning showing
      await blue(page).getByLabel('Speed (KTAS)').blur();
      await blue(page).getByLabel('G', { exact: true }).fill('999'); // and a refusal message
      await blue(page).getByLabel('G', { exact: true }).blur();
      expect(await layoutProblems(page)).toEqual([]);
      // The top-down view and the side view both fit their boxes.
      const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas.tf-topdown, canvas.tf-profile-canvas')].map((c) => {
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, cw: c.clientWidth, ch: c.clientHeight };
      }));
      expect(canvases).toHaveLength(2);
      for (const c of canvases) expect(c.w).toBeGreaterThan(300);
      expect(canvases[0].h).toBeGreaterThan(200);
    });

    test('the pixel size of each canvas follows its box when a column collapses', async ({ page }) => {
      await openRoute(page, '#/turn-fight');
      const box = () => page.locator('canvas.tf-topdown').evaluate((c) => ({ css: c.clientWidth, px: c.width }));
      const before = await box();
      await page.getByRole('button', { name: 'Result' }).click();
      await expect.poll(async () => (await box()).css).toBeGreaterThan(before.css + 100);
      // The canvas measures its new box on the next frame (ui-kit canvas view).
      await expect.poll(async () => { const after = await box(); return after.px - after.css; }).toBeGreaterThanOrEqual(0);
    });
  });
}

// ── Start geometry and altitudes (R28) ───────────────────────────────────────

const ataBox = (page) => page.getByLabel('Red\'s position off Blue\'s nose (ATA)');
const aaBox = (page) => page.getByLabel('Red\'s aspect angle (AA)');
const heightBox = (page) => page.getByLabel('Red starts above Blue (ft)');
const side = (page, group, name) => page.getByRole('group', { name: group }).getByRole('radio', { name });
const turnsAt = (page, name) => page.getByRole('group', { name: 'When the turns start' }).getByRole('radio', { name });
const hcaLine = (page) => page.locator('.tf-hca:not(.tf-pass)');
const passLine = (page) => page.locator('.tf-pass');
const turnsLine = (page) => page.locator('.tf-turns');
const headOnButton = (page) => page.getByRole('button', { name: 'Neutral Head-on', exact: true });
const moreButton = (page) => page.getByRole('button', { name: 'More detail' });
const moreRow = (page, name) => page.getByRole('table', { name: 'More detail' }).getByRole('row', { name });

async function openStartGeometry(page) {
  await openRoute(page, '#/turn-fight');
  await settingsButton(page).click();
  await expect(ataBox(page)).toBeVisible();
}

// The six Start geometry settings are at V6's head-on start.
async function expectHeadOn(page) {
  await expect(ataBox(page)).toHaveValue('0');
  await expect(side(page, 'ATA side', 'Left')).toBeChecked();
  await expect(aaBox(page)).toHaveValue('180');
  await expect(side(page, 'AA side', 'Left')).toBeChecked();
  await expect(heightBox(page)).toHaveValue('0');
  await expect(turnsAt(page, 'At the pass')).toBeChecked();
}

test('Start geometry in the settings menu shows the six defaults and the heading crossing angle, 180° head-on', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await expect(ataBox(page)).toBeHidden(); // closed until opened
  await settingsButton(page).click();
  await expect(page.getByText('Start geometry', { exact: true })).toBeVisible();
  await expectHeadOn(page);
  await expect(heightBox(page)).toBeDisabled(); // needs Climb and dive
  await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 180°');
  await expect(passLine(page)).toHaveText(/Pass at T\+\d+\.\d+ s/);
  await expect(headOnButton(page)).toBeVisible();
  await expect(time(page)).toHaveText('T+0.0');
});

test('a beam start: HCA 180°, the fight starts over, Play turns at once with no MERGE mark; Neutral Head-on puts all six back, paused', async ({ page }) => {
  await openStartGeometry(page);
  // The MERGE mark is drawn in the first nose-on colour; at V6's start it is there at T+0.
  await expect.poll(() => pixelsNear(page, 'canvas.tf-topdown', NOSE)).toBeGreaterThan(20);
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(1);
  await ataBox(page).fill('90');
  await aaBox(page).fill('90');
  await expect(time(page)).toHaveText('T+0.0'); // a new fight
  await expect(playButton(page)).toHaveText('Play');
  await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 180°');
  await expect(passLine(page)).toHaveText('No pass: the turns start at once');
  await expect(phase(page)).toHaveText('2-CIRCLE');
  await page.getByLabel('Playback speed').selectOption({ label: '2×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(1);
  await expect(phase(page)).toHaveText('2-CIRCLE');
  // Before first nose-on (+5 s) nothing is drawn in the MERGE colour: there is no pass to mark.
  expect(await pixelsNear(page, 'canvas.tf-topdown', NOSE)).toBe(0);
  await playButton(page).click();
  // Change the rest of the start, then one click puts all six back, and the fight waits at T+0.0.
  await side(page, 'AA side', 'Right').check();
  await side(page, 'ATA side', 'Right').check();
  await turnsAt(page, 'At once').check();
  await page.getByLabel('Climb and dive').check();
  await heightBox(page).fill('1500');
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);
  await headOnButton(page).click();
  await expectHeadOn(page);
  await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 180°');
  await expect(time(page)).toHaveText('T+0.0');
  await expect(playButton(page)).toHaveText('Play');
  await expect(phase(page)).toHaveText('HEAD-TO-HEAD');
  await expect.poll(() => pixelsNear(page, 'canvas.tf-topdown', NOSE)).toBeGreaterThan(20);
  await expect(page.getByLabel('Climb and dive')).toBeChecked(); // only the start goes back
});

test('a crossing (ATA 0°, AA 90° left) at 4×: HCA 90°, TO THE PASS until T+16.4, then 2-CIRCLE; More detail has AA and Angle-off (HCA)', async ({ page }) => {
  await openStartGeometry(page);
  await aaBox(page).fill('90');
  await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 90°');
  await expect(passLine(page)).toHaveText(/Pass at T\+\d+\.\d+ s/);
  await expect(phase(page)).toHaveText('TO THE PASS');
  await moreButton(page).click();
  await expect(moreRow(page, /Angle-off \(HCA\)/)).toHaveText(/90°/);
  await expect(moreRow(page, /Aspect angle \(AA\)/)).toHaveText(/180°.*90°/); // Blue's and Red's
  await expect(page.getByRole('table', { name: 'More detail' }).getByRole('row', { name: /Heading crossing angle/ })).toHaveCount(0);
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  // Watch every frame, so the time read is the one the phase changed at (a slow poll would read a later one at 4×).
  const flip = await page.waitForFunction(() => {
    const phaseNow = document.querySelector('.tf-phase').textContent;
    return phaseNow === 'TO THE PASS' ? false : { phaseNow, flippedAt: Number(document.querySelector('.tf-time').textContent.replace('T+', '')) };
  }, null, { polling: 'raf', timeout: 30_000 });
  const { phaseNow, flippedAt } = await flip.jsonValue();
  expect(phaseNow).toBe('2-CIRCLE');
  expect(flippedAt).toBeGreaterThanOrEqual(16.3);
  expect(flippedAt).toBeLessThan(17.2); // T+16.4 and at most a readout (0.1 s at 4×) later
  await playButton(page).click();
  await expect(moreRow(page, /Angle-off \(HCA\)/)).toHaveText(/90°/); // 2-circle: both turn the same way
});

test('Red\'s height needs Climb and dive; at 2,000 ft the side view shows Red higher and both height changes read 0 ft at T+0', async ({ page }) => {
  await openStartGeometry(page);
  await expect(heightBox(page)).toBeDisabled();
  await page.getByLabel('Climb and dive').check();
  await expect(heightBox(page)).toBeEnabled();
  await heightBox(page).fill('2000');
  await expect(time(page)).toHaveText('T+0.0');
  await moreButton(page).click();
  await expect(moreRow(page, /Height change/)).toHaveText(/0 ft.*0 ft/);
  await expect(moreRow(page, /Height between/)).toHaveText(/2,000 ft/);
  // The mean row of each aircraft's colour in the side view: Red's is nearer the top.
  const meanY = (rgb) => page.locator('canvas.tf-profile-canvas').evaluate((canvas, c) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let n = 0, sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200 && Math.abs(data[i] - c[0]) < 40 && Math.abs(data[i + 1] - c[1]) < 40 && Math.abs(data[i + 2] - c[2]) < 40) { n++; sum += Math.floor(i / 4 / canvas.width); }
    }
    return n ? sum / n : null;
  }, rgb);
  await expect.poll(async () => { const r = await meanY(RED), b = await meanY(BLUE); return r !== null && b !== null && r < b - 5; }).toBe(true);
  // Climb and dive off again: the box is greyed, its value is kept, and the fight is level.
  await page.getByLabel('Climb and dive').uncheck();
  await expect(heightBox(page)).toBeDisabled();
  await expect(heightBox(page)).toHaveValue('2000');
  await expect(result(page).getByRole('row', { name: /Range/ })).toHaveText(/2\.00 NM/);
});

test('refused start entries (blank, 200, -5, 6,000) show their message and mark the box invalid; the HCA and the fight stay', async ({ page }) => {
  await openStartGeometry(page);
  await aaBox(page).fill('120'); // HCA 120°
  await page.getByLabel('Climb and dive').check();
  await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 120°');
  const cases = [
    [ataBox(page), '', /Enter a number from 0 to 180/],
    [ataBox(page), '200', /Enter a number from 0 to 180/],
    [ataBox(page), '-5', /Enter a number from 0 to 180/],
    [aaBox(page), '', /Enter a number from 0 to 180/],
    [aaBox(page), '200', /Enter a number from 0 to 180/],
    [aaBox(page), '-5', /Enter a number from 0 to 180/],
    [heightBox(page), '', /Enter a number from -5,000 to 5,000/],
    [heightBox(page), '6000', /Enter a number from -5,000 to 5,000/],
  ];
  for (const [box, value, message] of cases) {
    await box.fill(value);
    await box.blur();
    await expect(box).toHaveAttribute('aria-invalid', 'true');
    await expect(box.locator('xpath=..').locator('.control-message')).toHaveText(message);
    await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 120°');
    await expect(time(page)).toHaveText('T+0.0');
  }
  // A good entry clears the message and starts the fight again with it.
  await aaBox(page).fill('60');
  await aaBox(page).blur();
  await expect(aaBox(page)).not.toHaveAttribute('aria-invalid', 'true');
  await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 60°');
});

test('Start geometry works from the keyboard: Tab order, arrow keys change a side, Enter and Space press Neutral Head-on; Space in a box does not play', async ({ page }) => {
  await openStartGeometry(page);
  await ataBox(page).focus();
  await page.keyboard.press('Space'); // a box: Space is not Play
  await expect(playButton(page)).toHaveText('Play');
  await expect(time(page)).toHaveText('T+0.0');
  await page.keyboard.press('Tab');
  await expect(side(page, 'ATA side', 'Left')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(side(page, 'ATA side', 'Right')).toBeChecked();
  await expect(side(page, 'ATA side', 'Right')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(aaBox(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(side(page, 'AA side', 'Left')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(side(page, 'AA side', 'Right')).toBeChecked();
  await page.keyboard.press('Tab'); // the height box is greyed, so the turns choice is next
  await expect(turnsAt(page, 'At the pass')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(turnsAt(page, 'At once')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(headOnButton(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expectHeadOn(page);
  await expect(headOnButton(page)).toBeFocused();
  // And with Space.
  await side(page, 'ATA side', 'Right').check();
  await turnsAt(page, 'At once').check();
  await headOnButton(page).focus();
  await page.keyboard.press('Space');
  await expectHeadOn(page);
  await expect(playButton(page)).toHaveText('Play'); // Space on the button did not play the fight
});

for (const scheme of ['light', 'dark']) {
  for (const climb of [false, true]) {
    test(`axe is clean with Turn Fight settings open, Climb and dive ${climb ? 'on' : 'off'}, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openStartGeometry(page);
      if (climb) await page.getByLabel('Climb and dive').check();
      await ataBox(page).fill('45');
      await aaBox(page).fill('100');
      // The disabled Red height box is marked aria-disabled by ui-kit (#202), so its greyed "ft" is exempt.
      await expectNoA11yViolations(page);
    });
  }
}

test('a beam start survives a reload, and Reset to V6 defaults puts the start geometry back', async ({ page }) => {
  await openStartGeometry(page);
  await ataBox(page).fill('90');
  await side(page, 'ATA side', 'Right').check();
  await aaBox(page).fill('90');
  await turnsAt(page, 'At once').check();
  await page.getByLabel('Climb and dive').check();
  await heightBox(page).fill('-1500');
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'turn-fight');
  await settingsButton(page).click();
  await expect(ataBox(page)).toHaveValue('90');
  await expect(side(page, 'ATA side', 'Right')).toBeChecked();
  await expect(aaBox(page)).toHaveValue('90');
  await expect(turnsAt(page, 'At once')).toBeChecked();
  await expect(heightBox(page)).toHaveValue('-1500');
  await expect(time(page)).toHaveText('T+0.0');
  await expect(phase(page)).toHaveText('2-CIRCLE'); // the beam start turns at once
  await resetDefaults(page).click();
  await expectHeadOn(page);
  await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 180°');
  await expect(phase(page)).toHaveText('HEAD-TO-HEAD');
});

test('the start picture is an image with a label and a size while the menu is open; it follows the numbers', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  const picture = page.getByRole('img', { name: /Picture of the start/ });
  await expect(picture).toHaveCount(0); // in the closed menu it is not on the page for anyone
  await settingsButton(page).click();
  await expect(picture).toHaveCount(1);
  await expect(picture).toBeVisible();
  const box = await picture.boundingBox();
  expect(box.width).toBeGreaterThan(100);
  expect(box.height).toBeGreaterThan(60);
  // Blue and Red are both drawn, and the picture changes when the start does.
  await expect.poll(() => pixelsNear(page, 'canvas.tf-start-picture', BLUE)).toBeGreaterThan(20);
  await expect.poll(() => pixelsNear(page, 'canvas.tf-start-picture', RED)).toBeGreaterThan(20);
  const before = await picture.evaluate((c) => c.toDataURL());
  await aaBox(page).fill('90');
  await expect.poll(() => picture.evaluate((c) => c.toDataURL())).not.toBe(before);
  // Closing the menu takes it out of the page (no size, nothing to draw).
  await settingsButton(page).click();
  await expect(picture).toBeHidden();
});

test('a tail chase at 221 against 220 kt turns at once and stays in view', async ({ page }) => {
  await openStartGeometry(page);
  await ataBox(page).fill('0');
  await aaBox(page).fill('0');
  await blue(page).getByLabel('Speed (KTAS)').fill('221');
  await expect(passLine(page)).toHaveText('No pass: the turns start at once');
  await expect(hcaLine(page)).toHaveText('Heading crossing angle (HCA): 0°');
  await expect(phase(page)).toHaveText('2-CIRCLE');
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page), { timeout: 30_000 }).toBeGreaterThan(6);
  await playButton(page).click();
  // Both aircraft and their trails are on the canvas, spread over a good part of it (not a speck at its edge).
  const spread = await page.locator('canvas.tf-topdown').evaluate((canvas) => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const found = { blue: [1e9, -1, 1e9, -1, 0], red: [1e9, -1, 1e9, -1, 0] };
    const want = { blue: [0x58, 0xa6, 0xff], red: [0xff, 0x6b, 0x6b] };
    for (let i = 0; i < data.length; i += 4) {
      for (const who of ['blue', 'red']) {
        const c = want[who];
        if (data[i + 3] > 200 && Math.abs(data[i] - c[0]) < 40 && Math.abs(data[i + 1] - c[1]) < 40 && Math.abs(data[i + 2] - c[2]) < 40) {
          const px = (i / 4) % canvas.width, py = Math.floor(i / 4 / canvas.width), f = found[who];
          f[0] = Math.min(f[0], px); f[1] = Math.max(f[1], px); f[2] = Math.min(f[2], py); f[3] = Math.max(f[3], py); f[4]++;
        }
      }
    }
    return { found, width: canvas.width, height: canvas.height };
  });
  for (const who of ['blue', 'red']) {
    const [x0, x1, y0, y1, n] = spread.found[who];
    expect(n, `${who} drawn`).toBeGreaterThan(50);
    expect(x0, `${who} inside`).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThan(spread.width);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(y1).toBeLessThan(spread.height);
  }
  const all = Object.values(spread.found);
  const widest = Math.max(...all.map((f) => f[1])) - Math.min(...all.map((f) => f[0]));
  expect(widest, 'the picture uses a good part of the width').toBeGreaterThan(spread.width * 0.2);
});

test('R28: in 3D the MERGE word shows where the jets pass, and not for a beam start (no pass)', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  const merge = page.locator('.tf-3d-label-nose', { hasText: 'MERGE' });
  await expect(merge).toBeVisible(); // V6's head-on start passes at the centre
  await settingsButton(page).click();
  await ataBox(page).fill('90');
  await aaBox(page).fill('90');
  await expect(merge).toBeHidden();
  await headOnButton(page).click();
  await expect(merge).toBeVisible();
  await expect(page.getByRole('img', { name: /fly toward each other and turn at the MERGE or PASS mark/ })).toHaveCount(1);
});

test('TF3-5: the mark says PASS when the jets go by more than 0.25 NM apart (a crossing start), MERGE when they meet, and nothing for a beam start', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').check();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  const mark = page.locator('.tf-3d-label-nose');
  await expect(mark).toHaveText('MERGE'); // V6's head-on start
  await settingsButton(page).click();
  await aaBox(page).fill('90'); // Red crosses Blue's nose: the closest approach is 1.4 NM
  await expect(passLine(page)).toHaveText(/Pass at T\+\d+\.\d+ s/);
  await expect(mark).toBeVisible();
  await expect(mark).toHaveText('PASS');
  await ataBox(page).fill('90'); // a beam start: no pass at all
  await expect(mark).toBeHidden();
  await headOnButton(page).click();
  await expect(mark).toHaveText('MERGE');
  await expect(mark).toBeVisible();
});

test('the intro, About and the turn line hold for any start: a tail chase never says head-on, the merge or same directions', async ({ page }) => {
  await openStartGeometry(page);
  await expect(turnsLine(page)).toHaveText('Blue turns left, Red turns left'); // head-on, 2-circle: V6's
  await page.getByRole('radio', { name: '1-circle' }).check();
  await expect(turnsLine(page)).toHaveText('Blue turns left, Red turns right');
  await page.getByRole('radio', { name: '2-circle' }).check();
  // A tail chase: ATA 30 left, AA 20 right, Red slow. Blue turns left and Red right in a 2-circle fight.
  await ataBox(page).fill('30');
  await aaBox(page).fill('20');
  await side(page, 'AA side', 'Right').check();
  await red(page).getByLabel('Speed (KTAS)').fill('150');
  await expect(turnsLine(page)).toHaveText('Blue turns left, Red turns right');
  await page.getByRole('button', { name: 'About this model' }).click();
  const text = await page.locator('.tf-col-setup').innerText();
  expect(text).toContain('Two aircraft start apart and turn, at the pass or at once');
  expect(text).toContain('each jet turns toward the other');
  for (const wrong of ['head-on, then turn', 'same turn direction', 'opposite turn directions', 'after the merge']) expect(text).not.toContain(wrong);
  await expect(page.getByText('from a head-on start a nose-on happens only if they come back exactly head-on')).toBeVisible();
});

test('TF3-6, TF3-8: the hints say what ATA, AA and HCA are and where they come from, that no side counts at 0° or 180°, and that the height is used with Climb and dive on', async ({ page }) => {
  await openStartGeometry(page);
  const menu = page.locator('.tf-col-setup');
  await expect(menu.getByText('ATA: the angle off Blue\'s nose (this tool\'s term). No side at 0° or 180°.')).toBeVisible();
  await expect(menu.getByText('AA and HCA: SMM 12.2 paras 6 and 9; sides: SMM 16 para 40b.')).toBeVisible();
  await expect(menu.getByText('Used with Climb and dive on. The start separation is measured level; Range includes height.')).toBeVisible();
  await expect(menu.getByText('It shows with Climb and dive')).toHaveCount(0);
});

test('TF3-4: flipping a side at 0° or 180° (where it means nothing) does not restart the fight; at any other angle it does', async ({ page }) => {
  await openStartGeometry(page);
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(2);
  const before = await seconds(page);
  await side(page, 'ATA side', 'Right').check(); // ATA 0°
  await side(page, 'AA side', 'Right').check(); // AA 180°
  await expect(playButton(page)).toHaveText('Pause'); // still playing
  expect(await seconds(page)).toBeGreaterThanOrEqual(before);
  // At another angle the side does change the fight, so it starts over.
  await ataBox(page).fill('30');
  await expect(time(page)).toHaveText('T+0.0');
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(1);
  await side(page, 'ATA side', 'Left').check();
  await expect(time(page)).toHaveText('T+0.0');
});

for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`TF3-10: with Climb and dive on the Speed (KTAS) label stays on one line, as tall as G's and Pitch's, at ${size.width} × ${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await openRoute(page, '#/turn-fight');
    await page.getByLabel('Climb and dive').check();
    for (const who of [blue(page), red(page)]) {
      await expect(who.getByLabel('Pitch (°)')).toBeVisible();
      const heights = await who.evaluate((fieldset) => [...fieldset.querySelectorAll('label')].map((l) => [l.textContent, Math.round(l.getBoundingClientRect().height)]));
      const speed = heights.find(([text]) => text === 'Speed (KTAS)');
      const g = heights.find(([text]) => text === 'G');
      const pitch = heights.find(([text]) => text === 'Pitch (°)');
      expect(speed[1], `Speed label height, ${JSON.stringify(heights)}`).toBe(g[1]);
      expect(pitch[1]).toBe(g[1]);
    }
    expect(await layoutProblems(page)).toEqual([]);
    // Nothing is pushed out of its row: not the Pitch box, with or without a G limit warning showing.
    const rowsFit = () => page.locator('.tf-aircraft-row').evaluateAll((rows) => rows.map((row) => [row.scrollWidth - row.clientWidth, row.closest('fieldset').getBoundingClientRect().right - Math.max(...[...row.querySelectorAll('input')].map((i) => i.getBoundingClientRect().right))]));
    for (const [over, room] of await rowsFit()) {
      expect(over).toBeLessThanOrEqual(0);
      expect(room).toBeGreaterThanOrEqual(0); // the last box ends inside the aircraft's frame
    }
    await blue(page).getByLabel('G', { exact: true }).fill('9');
    await expect(blue(page).locator('.tf-warning')).not.toBeEmpty();
    for (const [over, room] of await rowsFit()) {
      expect(over).toBeLessThanOrEqual(0);
      expect(room).toBeGreaterThanOrEqual(0);
    }
  });
}

// ---- Energy (T-6) (SPEC-turn-fight, "Energy mode", task 10, PR D) ---------------------------------------------------
// Expected numbers are the engine's own (src/modules/turn-fight/energy-sim.js), for the default Energy fight: both at 220 KIAS and
// 10,000 ft, head-on 2 NM, both on Auto. Pitch back from 220 KIAS, the jets pass at T+14.1 s, both reach the 160 KIAS MPT 9.1 s and 140°
// later, both noses come on together at +17.1 s (a tie), and at T+30 each reads 162 KIAS at 10,605 ft and 3.3 G.
const energyBox = (page) => page.getByLabel(/BFM Energy Fight|Energy \(T-6\)/);
const energyGroup = (page) => page.getByRole('group', { name: 'Energy', exact: true });
const checkGroup = (page) => page.getByRole('group', { name: 'Model settings for checking' });
const resultRow = (page, name) => result(page).getByRole('row', { name });
const moreDetail = (page) => page.getByRole('table', { name: 'More detail' });
const words = (who) => who.locator('.tf-move');
const atOnce = (page) => page.getByRole('radio', { name: 'At once', exact: true });

// The requests for uPlot's own chunk (dynamic import, only when the Energy graph starts).
function uplotRequests(page) {
  const seen = [];
  page.on('request', (r) => {
    if (/uPlot[^/]*\.js$/.test(new URL(r.url()).pathname)) seen.push(r.url());
  });
  return seen;
}

// The engine's own fight at a moment, for checking the screen against the numbers the engine gives at the time it stopped
// (a pause lands a poll after the time asked for, so a fixed T+30 cannot be counted on).
function engineAt(setup, sec) {
  const fight = createEnergyFight(setup);
  while (fight.timeSec < sec - 1e-9) stepEnergyFight(fight, 0.02);
  return fight;
}
// The whole numbers of feet in a cell of the Result table, "9,734 ft10,808 ft" -> [9734, 10808].
const feetIn = (text) => [...text.matchAll(/([\d,]+) ft/g)].map((m) => Number(m[1].replace(/,/g, '')));

test('Energy (T-6) is off at first; ticking it greys out the simple boxes with their values kept and shows Start altitude, Merge speed and the move with why; unticking puts it all back', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await blue(page).getByLabel('Speed (KTAS)').fill('240');
  await blue(page).getByLabel('G', { exact: true }).fill('6');
  await page.getByLabel('Climb and dive').check();
  await page.getByLabel('First nose chases').check();
  await expect(blue(page).getByLabel('Pitch (°)')).toBeVisible();

  await energyBox(page).check();
  for (const who of [blue(page), red(page)]) {
    await expect(who.getByLabel('Speed (KTAS)')).toBeDisabled();
    await expect(who.getByLabel('G', { exact: true })).toBeDisabled();
    await expect(who.getByLabel('Start altitude (ft)')).toHaveValue('10000');
    await expect(who.getByLabel('Merge speed (KIAS)')).toHaveValue('220');
    await expect(who.getByLabel('Pitch (°)')).toBeHidden();
    await expect(words(who)).toHaveText('Pitch back: 220 KIAS, SMM entry 160 to 220');
  }
  await expect(page.getByLabel('Climb and dive')).toBeDisabled();
  await expect(page.getByLabel('First nose chases')).toBeDisabled();
  // Greyed out, with their values kept.
  await expect(blue(page).getByLabel('Speed (KTAS)')).toHaveValue('240');
  await expect(blue(page).getByLabel('G', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('Climb and dive')).toBeChecked();
  await expect(page.getByLabel('First nose chases')).toBeChecked();
  await expect(page.locator('.tf-footer')).toHaveText(/BFM Energy Fight: full T-6 physics|Energy mode:/);
  await expect(page.locator('.tf-profile')).toBeHidden(); // Climb and dive's side view stays away: Energy has its own
  await expect(page.locator('.tf-energy-panel')).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);

  await energyBox(page).uncheck();
  for (const who of [blue(page), red(page)]) {
    await expect(who.getByLabel('Speed (KTAS)')).toBeEnabled();
    await expect(who.getByLabel('G', { exact: true })).toBeEnabled();
    await expect(who.getByLabel('Start altitude (ft)')).toBeHidden();
    await expect(who.getByLabel('Merge speed (KIAS)')).toBeHidden();
    await expect(words(who)).toBeHidden();
  }
  await expect(page.getByLabel('Climb and dive')).toBeEnabled();
  await expect(page.getByLabel('First nose chases')).toBeEnabled();
  await expect(blue(page).getByLabel('Speed (KTAS)')).toHaveValue('240');
  await expect(blue(page).getByLabel('Pitch (°)')).toBeVisible();
  await expect(page.locator('.tf-footer')).toHaveText(/Turn Circle Geometry: constant-speed turn circles|Simplified: constant/);
  await expect(page.locator('.tf-energy-panel')).toBeHidden();
  await expect(page.locator('.tf-profile')).toBeVisible();
});

test('Energy shows its defaults at T+0: 220 KIAS and 10,000 ft each, the move with why, nothing flagged, and a Result card of its own', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await expect(time(page)).toHaveText('T+0.0');
  await expect(phase(page)).toHaveText('HEAD-TO-HEAD');
  await expect(resultRow(page, /Speed \(KIAS\)/)).toHaveText(/220 KIAS.*220 KIAS/);
  await expect(resultRow(page, /Altitude/)).toHaveText(/10,000 ft.*10,000 ft/);
  await expect(resultRow(page, /^G/)).toHaveText(/1\.0.*1\.0/);
  await expect(resultRow(page, /Move/)).toHaveText(/Pitch back.*Pitch back/);
  await expect(resultRow(page, /To the MPT/)).toHaveText(/--.*--/);
  await expect(resultRow(page, /Flags/)).toHaveText(/None.*None/);
  await expect(resultRow(page, /Range/)).toContainText('2.00 NM');
  await expect(resultRow(page, /First nose-on/)).toContainText('--');
  await expect(resultRow(page, /Winner/)).toContainText('--');
  // The simple fight's turn rate and radius are for the greyed-out speed and G: not shown in Energy.
  await expect(resultRow(page, /Turn rate/)).toHaveCount(0);
  await expect(resultRow(page, /Turn radius/)).toHaveCount(0);
  // The pass is at T+14.1 s for 220 KIAS at 10,000 ft (about 260 kt true), and the start geometry says so.
  await settingsButton(page).click();
  await expect(page.locator('.tf-pass')).toHaveText(/Pass at T\+\d+\.\d+ s/);
});

test('the fight flies to the MPT: without head-on chase both read MPT, 162 KIAS, 10,605 ft and 3.3 G after 9.1 s and 140° of turn; a tie is an even fight', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await settingsButton(page).click();
  await page.getByLabel('Chase after a head-on pass').uncheck();
  await settingsButton(page).click();
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page), { timeout: 30_000 }).toBeGreaterThan(29.9);
  await playButton(page).click(); // pause
  const t = await seconds(page);
  // The engine's numbers at T+30.0 are 162 KIAS, 10,605 ft and 3.3 G; the pause lands a poll later, so the altitude is
  // held to the engine's own at the time shown (the time reads to 0.1 s, about 2 ft of height).
  expect(t).toBeLessThan(40);
  const engine = engineAt({ chaseAfterHeadOn: false }, t);
  await expect(resultRow(page, /Move/)).toHaveText(/MPT.*MPT/);
  await expect(resultRow(page, /Speed \(KIAS\)/)).toHaveText(/16[123] KIAS.*16[123] KIAS/);
  const heights = feetIn(await resultRow(page, /Altitude/).innerText());
  expect(Math.abs(heights[0] - engine.blue.altFt)).toBeLessThan(40);
  expect(Math.abs(heights[1] - engine.red.altFt)).toBeLessThan(40);
  await expect(resultRow(page, /^G/)).toHaveText(/\d+\.\d+.*\d+\.\d+/);
  await expect(resultRow(page, /To the MPT/)).toHaveText(/\d+\.\d+ s, \d+°.*\d+\.\d+ s, \d+°/);
  for (const who of [blue(page), red(page)]) await expect(words(who)).toHaveText('MPT 160 KIAS');
  await expect(phase(page)).toHaveText('2-CIRCLE');
  // More detail: TAS, climb angle, bank, Ps (ft/s) and energy height. At the MPT the bank is about 72° and the speed holds (Ps near 0).
  await page.getByRole('button', { name: 'More detail' }).click();
  await expect(moreDetail(page).getByRole('row', { name: /Speed \(TAS\)/ })).toHaveText(/\d+ kt.*\d+ kt/);
  await expect(moreDetail(page).getByRole('row', { name: /Climb angle/ })).toHaveText(/-?\d+°.*-?\d+°/);
  await expect(moreDetail(page).getByRole('row', { name: /^Bank/ })).toHaveText(/7[23]°.*7[23]°/);
  await expect(moreDetail(page).getByRole('row', { name: /Ps/ })).toHaveText(/[+-][\d,]+ ft\/s/);
  await expect(moreDetail(page).getByRole('row', { name: /Energy height/ })).toHaveText(/1\d,\d\d\d ft/);
  // Both noses came on together (a tie), so nobody won.
  await expect.poll(() => seconds(page)).toBeGreaterThan(0); // (still paused; the poll only reads)
  await playButton(page).click();
  await expect(resultRow(page, /First nose-on/)).toContainText(/Both at \+\d+\.\d+ s/, { timeout: 30_000 });
  await expect(resultRow(page, /Winner/)).toContainText('Even fight: nobody gets behind');
  await playButton(page).click();
});

test('by default (D403), the head-on pass initiates active combat pursuit: both aircraft switch to pursuit', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect(resultRow(page, /First nose-on/)).toContainText(/(?:Both|Blue|Red) at \+\d+\.\d+ s/, { timeout: 30_000 });
  await expect(resultRow(page, /Chase/)).toContainText('Chasing', { timeout: 30_000 });
  await expect(resultRow(page, /Move/)).toHaveText(/Pursuit.*Pursuit/);
  await playButton(page).click();
});

test('Turn Fight settings has Energy and Model settings for checking only with Energy on, in order, each box at the engine\'s default with its range', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await settingsButton(page).click();
  const legends = () => page.locator('.settings-group:visible > legend').allTextContents();
  expect(await legends()).toEqual(['Start geometry', 'Display']);
  await expect(page.getByLabel('Hard deck (ft MSL)')).toBeHidden();
  await energyBox(page).check();
  expect(await legends()).toEqual(['Start geometry', 'Energy', 'Display', 'Model settings for checking']);

  // More energy settings: Move per aircraft (Auto), MPT speed, Hard deck, Pursuit, Chase after a head-on pass.
  await expect(page.getByLabel('Blue\'s move')).toHaveText(/Auto.*Immelmann.*Pitch back.*Slice.*Split S.*MPT/);
  await expect(page.getByLabel('Blue\'s move').locator('option:checked')).toHaveText('Auto');
  await expect(page.getByLabel('Red\'s move').locator('option:checked')).toHaveText('Auto');
  await expect(page.getByLabel('MPT speed (KIAS)')).toHaveValue('160');
  await expect(page.getByLabel('Hard deck (ft MSL)')).toHaveValue('6000');
  await expect(page.getByLabel('Pursuit').locator('option:checked')).toHaveText('Pure');
  await expect(page.getByLabel('Chase after a head-on pass')).toBeChecked();
  await expect(energyGroup(page)).toContainText('125 to 175 KIAS, default 160 KIAS.');
  await expect(energyGroup(page)).toContainText('0 to 25,000 ft, default 6,000 ft.');
  await expect(energyGroup(page)).toContainText('SMM 14.3 para 6');
  await expect(energyGroup(page)).toContainText('3,000 ft AGL in the Moose Jaw areas (SMM 14.6 para 16)');

  // Model settings for checking: every key the spec lists, at the engine's default, with its range.
  const boxes = {
    'Stall speed (KIAS)': ['86', '60 to 120 KIAS, default 86 KIAS.'],
    'Shaker (% of the stall-line G)': ['94', '50 to 100%, default 94%.'],
    'How long a stall lasts (s)': ['1', '0 to 5 s, default 1 s.'],
    'Mid-range throttle (% of maximum thrust)': ['50', '10 to 100%, default 50%.'],
    'Lead point (s ahead)': ['1', '0 to 5 s, default 1 s.'],
    'Lag point (s behind)': ['1', '0 to 5 s, default 1 s.'],
    'Roll rate (°/s)': ['90', '30 to 180°/s, default 90°/s.'],
    'Pitch back bank at 160 KIAS (°)': ['60', '10 to 90°, default 60°.'],
    'Pitch back bank at 220 KIAS (°)': ['30', '10 to 90°, default 30°.'],
    'Auto: Immelmann or pitch back above (KIAS)': ['220', '160 to 316 KIAS, default 220 KIAS.'],
    'Auto: split S below (KIAS)': ['120', '40 to 220 KIAS, default 120 KIAS.'],
    'Immelmann off-nose angle (°)': ['120', '0 to 180°, default 120°.'],
    'Lowest Immelmann top speed (KIAS)': ['120', '0 to 316 KIAS, default 120 KIAS.'],
    'Look-ahead (s)': ['60', '0 to 120 s, default 60 s.'],
    'Deck margin (ft)': ['1000', '0 to 10,000 ft, default 1,000 ft.'],
  };
  for (const [label, [value, hint]] of Object.entries(boxes)) {
    await expect(checkGroup(page).getByLabel(label, { exact: true }), label).toHaveValue(value);
    await expect(checkGroup(page), label).toContainText(hint);
  }
  await expect(checkGroup(page).getByRole('button', { name: 'Reset to defaults', exact: true })).toBeVisible();
  await expect(checkGroup(page)).toContainText('The numbers no manual gives');
  expect(await layoutProblems(page)).toEqual([]);

  // A refused entry shows the same message as the other boxes, and the last good value stays.
  await checkGroup(page).getByLabel('Stall speed (KIAS)').fill('500');
  await checkGroup(page).getByLabel('Stall speed (KIAS)').blur();
  await expect(checkGroup(page).getByLabel('Stall speed (KIAS)')).toHaveAttribute('aria-invalid', 'true');
  await expect(checkGroup(page)).toContainText('Enter a number from 60 to 120 KIAS.');
  // Model settings' own reset puts back only those numbers.
  await checkGroup(page).getByLabel('Stall speed (KIAS)').fill('83');
  await page.getByLabel('Blue\'s move').selectOption({ label: 'Slice' });
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);
  await checkGroup(page).getByRole('button', { name: 'Reset to defaults', exact: true }).click();
  await expect(checkGroup(page).getByLabel('Stall speed (KIAS)')).toHaveValue('86');
  await expect(checkGroup(page).getByLabel('Stall speed (KIAS)')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Blue\'s move').locator('option:checked')).toHaveText('Slice');
  await expect(time(page)).toHaveText('T+0.0'); // a changed setting starts the fight again
});

test('a forced move flies from the merge whatever the speed: Split S for Blue reads "set by you", and costs height Red\'s pitch back does not', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await settingsButton(page).click();
  await page.getByLabel('Blue\'s move').selectOption({ label: 'Split S' });
  await expect(words(blue(page))).toHaveText('Split S: set by you at 220 KIAS (forced move)');
  await expect(words(red(page))).toHaveText('Pitch back: 220 KIAS, SMM entry 160 to 220');
  await expect(resultRow(page, /Move/)).toHaveText(/Split S.*Pitch back/);
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page), { timeout: 30_000, intervals: [50] }).toBeGreaterThan(19.9);
  await playButton(page).click();
  // The pause lands a poll after T+20, and the moves change on their own (Red's pitch back ends near T+23, Blue's Split S
  // goes on to an Immelmann near T+27), so no time window is pinned: the Move and Altitude rows are the engine's own at the
  // time shown. At T+20 itself the engine has Blue at 9,879 ft and Red at 10,807 ft.
  const now = await seconds(page);
  expect(now).toBeLessThan(26); // still Blue's Split S: the follow-on Immelmann starts near T+27
  const engine = engineAt({ blueMove: 'splitS' }, now);
  await expect(resultRow(page, /Move/)).toHaveText(new RegExp(`${engine.blue.moveLabel}.*${engine.red.moveLabel}`));
  expect(engine.blue.moveLabel).toBe('Split S');
  const heights = feetIn(await resultRow(page, /Altitude/).innerText());
  expect(Math.abs(heights[0] - engine.blue.altFt)).toBeLessThan(40);
  expect(Math.abs(heights[1] - engine.red.altFt)).toBeLessThan(40);
  // The Split S costs Blue height that Red's pitch back does not (the engine, at T+20: Blue 9,879 ft, Red 10,807 ft).
  expect(engineAt({ blueMove: 'splitS' }, 20).blue.altFt).toBeLessThan(engineAt({ blueMove: 'splitS' }, 20).red.altFt - 500);
  // Changing the move starts the fight again, paused.
  await page.getByLabel('Blue\'s move').selectOption({ label: 'MPT' });
  await expect(time(page)).toHaveText('T+0.0');
  await expect(words(blue(page))).toHaveText('MPT: set by you at 220 KIAS (forced move)');
});

test('STALL shows in words and colour: a slow Immelmann stalls at the top, the reason is given, and Red is not flagged', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await settingsButton(page).click();
  await page.getByLabel('Chase after a head-on pass').uncheck();
  await page.getByLabel('Blue\'s move').selectOption({ label: 'Immelmann' });
  await atOnce(page).check();
  await blue(page).getByLabel('Merge speed (KIAS)').fill('120');
  await expect(words(blue(page))).toHaveText('Immelmann: set by you at 120 KIAS (forced move)');
  // What a screen reader is told (the live line) is watched, with the reasons' text (the list): the numbers in the reasons
  // change all the time, so only the line that says which flag is on may be live, and it changes only when a flag turns on or off.
  await page.evaluate(() => {
    window.__seen = { live: [], notes: [] };
    const watch = (selector, into) => {
      const el = document.querySelector(selector);
      new MutationObserver(() => {
        if (into.at(-1) !== el.textContent) into.push(el.textContent);
      }).observe(el, { subtree: true, childList: true, characterData: true });
    };
    watch('.tf-flag-live', window.__seen.live);
    watch('.tf-flag-notes', window.__seen.notes);
  });
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  const flags = resultRow(page, /Flags/);
  // The engine has the stall from T+8.2 (86 KIAS is the stall speed) to T+21.2, while the speed is below it.
  await expect(flags.locator('td').first()).toHaveText('STALL', { timeout: 30_000 });
  await expect.poll(() => seconds(page), { timeout: 30_000, intervals: [50] }).toBeGreaterThan(12);
  await playButton(page).click();
  expect(await seconds(page)).toBeLessThan(21);
  const seen = await page.evaluate(() => window.__seen);
  expect(seen.live, 'told once, when the flag came on').toEqual(['Flags: Blue STALL']);
  expect(seen.notes.length, 'the reasons\' numbers changed while it was stalled').toBeGreaterThan(5);
  await expect(page.locator('.tf-flag-live')).toHaveText('Flags: Blue STALL');
  await expect(page.locator('.tf-flag-live')).toHaveAttribute('aria-live', 'polite');
  await expect(flags.locator('td').first()).toHaveClass('tf-flag');
  await expect(flags.locator('td').nth(1)).toHaveText('None');
  await expect(flags.locator('td').nth(1)).not.toHaveClass('tf-flag');
  // Colour beside the words, not instead: the cell is the caution red, and bold, and its text says STALL.
  const style = await flags.locator('td').first().evaluate((el) => ({ color: getComputedStyle(el).color, weight: getComputedStyle(el).fontWeight, normal: getComputedStyle(el.parentElement.querySelector('th')).color }));
  expect(style.color).toBe('rgb(255, 107, 107)');
  expect(Number(style.weight)).toBeGreaterThanOrEqual(600);
  await expect(page.locator('.tf-flag-notes')).toHaveText(/^Blue STALL: \d+(\.\d)? KIAS is below the 86 KIAS stall speed$/);
  await expect(page.locator('.tf-flag-notes')).not.toContainText('Red');
  await expect(page.locator('.tf-flag-notes')).not.toHaveAttribute('aria-live', /.+/); // the list of reasons is not live
  // Only the two flags: nothing about the deck, VMO or entry speed.
  await expect(page.locator('.tf-flag-notes li')).toHaveCount(1);
  await expect(resultRow(page, /Flags/).locator('td').first()).not.toContainText('OVER G');
});

test('OVER G is a flag of its own, none at first, and Auto never causes it', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await expect(resultRow(page, /Flags/)).toHaveText(/None.*None/);
  await expect(resultRow(page, /Flags/).locator('td.tf-flag')).toHaveCount(0);
  // Watch the whole fight, not one moment: a page-side observer notes any flag that shows while it plays.
  await page.evaluate(() => {
    window.__flagSeen = [];
    const note = () => {
      const cells = [...document.querySelectorAll('tr[data-row="flags"] td')].map((td) => td.textContent);
      const notes = document.querySelector('.tf-flag-notes')?.textContent ?? '';
      const live = document.querySelector('.tf-flag-live')?.textContent ?? '';
      if (cells.some((text) => text !== 'None') || document.querySelector('td.tf-flag') || notes || live) window.__flagSeen.push({ cells, notes, live });
    };
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page), { timeout: 30_000 }).toBeGreaterThan(29.9);
  await playButton(page).click();
  await expect(resultRow(page, /Flags/)).toHaveText(/None.*None/);
  await expect(page.locator('.tf-flag-notes li')).toHaveCount(0);
  expect(await page.evaluate(() => window.__flagSeen), 'no flag showed at any time while it played').toEqual([]);
  // And the engine says the same over the whole 30 s: neither aircraft was ever over G or stalled.
  const engine = engineAt({}, await seconds(page));
  for (const who of [engine.blue, engine.red]) {
    expect(who.overGEver).toBe(false);
    expect(who.stallEver).toBe(false);
  }
});

test('the side view is altitude against time with the hard deck as a dashed line, and has a text alternative: a line of numbers and a table', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await expect(page.locator('.tf-energy-panel')).toBeHidden();
  await energyBox(page).check();
  await blue(page).getByLabel('Merge speed (KIAS)').fill('180'); // Blue and Red then fly different heights
  const chart = page.locator('.tf-energy-chart');
  await expect(chart).toBeVisible();
  await expect(chart.locator('canvas').first()).toBeVisible();
  await expect(chart).toHaveAttribute('role', 'img');
  await expect(page.getByRole('img', { name: /each aircraft's altitude against fight time, with the hard deck as a dashed line/ })).toBeVisible();
  await expect(page.locator('.tf-energy-summary')).toHaveText('Altitude at T+0.0: Blue 10,000 ft, Red 10,000 ft. Hard deck 6,000 ft.');
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page), { timeout: 30_000 }).toBeGreaterThan(24.9);
  await playButton(page).click();
  // The pause lands a poll after T+25 (the engine has Blue at 9,951 ft and Red at 10,749 ft at T+25 itself), so the line is
  // held to the engine's own numbers at the time it shows, to 40 ft (the time shows to 0.1 s).
  const now = await seconds(page);
  const engine = engineAt({ blueKias: 180 }, now);
  const summary = await page.locator('.tf-energy-summary').innerText();
  expect(summary).toMatch(new RegExp(`^Altitude at T\\+${now.toFixed(1).replace('.', '\\.')}: Blue [\\d,]+ ft, Red [\\d,]+ ft\\. Hard deck 6,000 ft\\.$`));
  const [summaryBlue, summaryRed] = feetIn(summary);
  expect(Math.abs(summaryBlue - engine.blue.altFt)).toBeLessThan(40);
  expect(Math.abs(summaryRed - engine.red.altFt)).toBeLessThan(40);
  expect(summaryBlue).not.toBe(summaryRed); // Blue's 180 KIAS start and Red's 220 fly different heights
  // The chart is drawn in the fight's colours, and the deck in the first nose-on line's.
  await expect.poll(() => pixelsNear(page, '.tf-energy-chart canvas', BLUE)).toBeGreaterThan(20);
  await expect.poll(() => pixelsNear(page, '.tf-energy-chart canvas', RED)).toBeGreaterThan(20);
  await expect.poll(() => pixelsNear(page, '.tf-energy-chart canvas', NOSE)).toBeGreaterThan(20);
  // The key says which line is which, in words and letters as well as colour.
  await expect(page.locator('.tf-energy-key')).toContainText('BBlueRRedHard deck (dashed)');
  // The table, closed at first: a row every 10 s from T+0 and the latest point last, then the hard deck.
  const table = page.locator('.tf-energy-table');
  await expect(table.locator('table')).toBeHidden();
  await table.getByText('Altitude table').click();
  const rows = table.getByRole('row');
  await expect(rows.nth(0)).toHaveText(/T\+ \(s\)Blue \(ft\)Red \(ft\)Deck \(ft\)/);
  await expect(rows.nth(1)).toHaveText('0.010,00010,0006,000');
  await expect(rows.nth(2)).toHaveText(/^10\.010,0\d\d/);
  await expect(rows.nth(3)).toHaveText(/^20\.0/);
  // The latest point last: the time shown, and the heights the line above gave (to 40 ft: the table's latest point is a trail point, 0.1 s apart).
  const lastRow = (await rows.last().innerText()).split('\t').map((cell) => Number(cell.replace(/,/g, '')));
  expect(lastRow[0]).toBeGreaterThan(now - 0.11);
  expect(lastRow[0]).toBeLessThan(now + 0.11);
  expect(Math.abs(lastRow[1] - engine.blue.altFt)).toBeLessThan(40);
  expect(Math.abs(lastRow[2] - engine.red.altFt)).toBeLessThan(40);
  expect(lastRow[3]).toBe(6000);
  // Leaving Energy takes the graph away and frees it; ticking it again draws it again.
  await energyBox(page).uncheck();
  await expect(page.locator('.tf-energy-panel')).toBeHidden();
  await expect(chart.locator('canvas')).toHaveCount(0);
  await energyBox(page).check();
  await expect(chart.locator('canvas').first()).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
});

test('uPlot and three.js load only when needed: a 2D fight loads neither, Energy in 2D loads uPlot only', async ({ page }) => {
  const three = threeRequests(page);
  const uplot = uplotRequests(page);
  await trackWebGl(page);
  await openRoute(page, '#/turn-fight');
  await playButton(page).click();
  await expect.poll(() => seconds(page)).toBeGreaterThan(0.5);
  await playButton(page).click();
  expect(uplot, 'no graph library on a simple 2D visit').toEqual([]);
  expect(three).toEqual([]);
  // Energy in 2D fetches the graph library (once) and still no three.js.
  await energyBox(page).check();
  await expect(page.locator('.tf-energy-chart canvas').first()).toBeVisible();
  expect(uplot.length).toBe(1);
  expect(three).toEqual([]);
  expect(await contextsMade(page)).toBe(0);
  await energyBox(page).uncheck();
  await energyBox(page).check();
  expect(uplot.length, 'fetched once, then cached').toBe(1);
});

for (const scheme of ['light', 'dark']) {
  test(`axe is clean with Energy on, the settings open, the table open and a flag showing (${scheme} colour scheme)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openRoute(page, '#/turn-fight');
    await energyBox(page).check();
    await settingsButton(page).click();
    await page.getByLabel('Blue\'s move').selectOption({ label: 'Immelmann' });
    await atOnce(page).check();
    await blue(page).getByLabel('Merge speed (KIAS)').fill('120');
    await blue(page).getByLabel('Start altitude (ft)').fill('16000'); // the note beside a high start shows too
    await expect(blue(page).locator('.tf-alt-note')).toBeVisible();
    await page.getByLabel('Playback speed').selectOption({ label: '4×' });
    await playButton(page).click();
    await expect(resultRow(page, /Flags/).locator('td').first()).toHaveText('STALL', { timeout: 30_000 });
    await playButton(page).click();
    await page.locator('.tf-energy-table').getByText('Altitude table').click();
    await page.getByRole('button', { name: 'More detail' }).click();
    await page.getByRole('button', { name: 'About this model' }).click();
    await expect(page.locator('.tf-energy-chart canvas').first()).toBeVisible();
    await expectNoA11yViolations(page);
  });
}

test('Energy settings are remembered across a reload, and Reset to V6 defaults turns Energy off and puts every Energy setting back', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await settingsButton(page).click();
  await page.getByLabel('Blue\'s move').selectOption({ label: 'Slice' });
  await page.getByLabel('Hard deck (ft MSL)').fill('7000');
  await page.getByLabel('Pursuit').selectOption({ label: 'Lead' });
  await page.getByLabel('Chase after a head-on pass').uncheck();
  await checkGroup(page).getByLabel('Stall speed (KIAS)').fill('83');
  await blue(page).getByLabel('Merge speed (KIAS)').fill('150');
  await blue(page).getByLabel('Start altitude (ft)').fill('9000');
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'turn-fight');
  await expect(energyBox(page)).toBeChecked();
  await expect(blue(page).getByLabel('Merge speed (KIAS)')).toHaveValue('150');
  await expect(blue(page).getByLabel('Start altitude (ft)')).toHaveValue('9000');
  await expect(words(blue(page))).toHaveText('Slice: set by you at 150 KIAS (forced move)');
  await expect(words(red(page))).toHaveText('Pitch back: 220 KIAS, SMM entry 160 to 220');
  await settingsButton(page).click();
  await expect(page.getByLabel('Blue\'s move').locator('option:checked')).toHaveText('Slice');
  await expect(page.getByLabel('Hard deck (ft MSL)')).toHaveValue('7000');
  await expect(page.getByLabel('Pursuit').locator('option:checked')).toHaveText('Lead');
  await expect(page.getByLabel('Chase after a head-on pass')).not.toBeChecked();
  await expect(checkGroup(page).getByLabel('Stall speed (KIAS)')).toHaveValue('83');
  await expect(page.locator('.tf-energy-summary')).toHaveText('Altitude at T+0.0: Blue 9,000 ft, Red 10,000 ft. Hard deck 7,000 ft.');
  await expect(time(page)).toHaveText('T+0.0'); // a fight always opens at the start

  await resetDefaults(page).click();
  await expect(energyBox(page)).not.toBeChecked();
  await expect(blue(page).getByLabel('Merge speed (KIAS)')).toBeHidden();
  await expect(page.locator('.tf-energy-panel')).toBeHidden();
  await expect(blue(page).getByLabel('Speed (KTAS)')).toBeEnabled();
  expect(await page.locator('.settings-group:visible > legend').allTextContents()).toEqual(['Start geometry', 'Display']);
  // The Energy settings are back at their defaults too, which shows the next time Energy is ticked.
  await energyBox(page).check();
  await expect(blue(page).getByLabel('Merge speed (KIAS)')).toHaveValue('220');
  await expect(blue(page).getByLabel('Start altitude (ft)')).toHaveValue('10000');
  await expect(page.getByLabel('Blue\'s move').locator('option:checked')).toHaveText('Auto');
  await expect(page.getByLabel('Hard deck (ft MSL)')).toHaveValue('6000');
  await expect(page.getByLabel('Pursuit').locator('option:checked')).toHaveText('Pure');
  await expect(page.getByLabel('Chase after a head-on pass')).toBeChecked();
  await expect(checkGroup(page).getByLabel('Stall speed (KIAS)')).toHaveValue('86');
  // And a reload after the reset opens with Energy off.
  await energyBox(page).uncheck();
  await page.reload();
  await page.waitForFunction(() => window.__ooda?.stats().mounted === 'turn-fight');
  await expect(energyBox(page)).not.toBeChecked();
});

test('the start altitude and the hard deck have to go together: the reason is shown beside the boxes and the fight flies the default heights until it is fixed', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await settingsButton(page).click();
  await page.getByLabel('Hard deck (ft MSL)').fill('12000');
  const problem = page.locator('.tf-energy-problem');
  await expect(problem).toHaveText('Blue\'s start altitude (10,000 ft) must be from the hard deck (12,000 ft) to 25,000 ft. Until this is fixed the fight flies the default start altitudes (10,000 ft), merge speeds (220 KIAS), hard deck (6,000 ft) and separation (2 NM).');
  await expect(problem).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('.tf-energy-summary')).toContainText('Hard deck 6,000 ft');
  await blue(page).getByLabel('Start altitude (ft)').fill('13000');
  await expect(problem).toContainText('Red\'s start altitude (10,000 ft)');
  await red(page).getByLabel('Start altitude (ft)').fill('13000');
  await expect(problem).toBeEmpty();
  await expect(page.locator('.tf-energy-summary')).toHaveText('Altitude at T+0.0: Blue 13,000 ft, Red 13,000 ft. Hard deck 12,000 ft.');
  // Two heights too far apart for the separation.
  await page.getByLabel('Start separation').fill('0.5');
  await red(page).getByLabel('Start altitude (ft)').fill('20000');
  await expect(problem).toContainText('The start separation (0.5 NM) must be more than the height between the aircraft (7,000 ft).');
  // A refused entry in a box is refused as everywhere: its message, the last good value stays.
  await blue(page).getByLabel('Merge speed (KIAS)').fill('500');
  await blue(page).getByLabel('Merge speed (KIAS)').blur();
  await expect(blue(page).getByLabel('Merge speed (KIAS)')).toHaveAttribute('aria-invalid', 'true');
  await expect(blue(page)).toContainText('Enter a number from 40 to 316 KIAS.');
});

test('a merge speed above the top speed at its height is refused with the reason, and the fight, the pass and the start picture all fly the same default start: Blue at 25,000 ft and 300 KIAS', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await settingsButton(page).click();
  const problem = page.locator('.tf-energy-problem');
  await blue(page).getByLabel('Start altitude (ft)').fill('25000');
  await red(page).getByLabel('Start altitude (ft)').fill('25000');
  await expect(problem).toBeEmpty();
  await blue(page).getByLabel('Merge speed (KIAS)').fill('300');
  // No limit is written in here: it is the screen's one helper's (state.js topKiasAt), which the engine has to agree with.
  const limit = Math.round(topKiasAt(25000));
  expect(limit).toBeLessThan(300);
  await expect(problem).toHaveText(new RegExp(`^Blue's merge speed \\(300 KIAS\\) is above the T-6A's limit at 25,000 ft \\(${limit} KIAS, [^)]+\\)\\. Until this is fixed the fight flies the default start altitudes \\(10,000 ft\\), merge speeds \\(220 KIAS\\), hard deck \\(6,000 ft\\) and separation \\(2 NM\\)\\.$`));
  // The screen still shows a fight, and what shows is what flies: the default start (10,000 ft, 220 KIAS, the pass at T+14.1 s).
  await expect(page.locator('.tf-energy-summary')).toHaveText('Altitude at T+0.0: Blue 10,000 ft, Red 10,000 ft. Hard deck 6,000 ft.');
  await expect(resultRow(page, /Speed \(KIAS\)/)).toHaveText(/220 KIAS.*220 KIAS/);
  await expect(page.locator('.tf-pass')).toHaveText(/Pass at T\+\d+\.\d+ s/);
  await expect(words(blue(page))).toHaveText('Pitch back: 220 KIAS, SMM entry 160 to 220');
  // At the limit as shown it flies, from 25,000 ft.
  await blue(page).getByLabel('Merge speed (KIAS)').fill(String(limit));
  await expect(problem).toBeEmpty();
  await expect(page.locator('.tf-energy-summary')).toHaveText('Altitude at T+0.0: Blue 25,000 ft, Red 25,000 ft. Hard deck 6,000 ft.');
  await expect(resultRow(page, /Speed \(KIAS\)/)).toHaveText(new RegExp(`${limit} KIAS.*220 KIAS`));
  await expect(page.locator('.tf-pass')).not.toHaveText(/Pass at T\+14\.1 s/); // 25,000 ft is faster true airspeed
});

test('a start altitude over 15,000 ft gets one note beside its box, with SMM 14.5 para 10; the MPT bank is explained in About', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await energyBox(page).check();
  await expect(blue(page).locator('.tf-alt-note')).toBeHidden();
  // While the note is hidden it describes nothing: no "SMM 14.5" in Start altitude's description at 10,000 ft or at 15,000 ft.
  for (const who of [blue(page), red(page)]) {
    await expect(who.getByLabel('Start altitude (ft)')).not.toHaveAccessibleDescription(/SMM 14\.5/);
    await expect(who.locator('.tf-alt-note')).toBeEmpty();
  }
  await blue(page).getByLabel('Start altitude (ft)').fill('15000');
  await expect(blue(page).locator('.tf-alt-note')).toBeHidden();
  await expect(blue(page).getByLabel('Start altitude (ft)')).not.toHaveAccessibleDescription(/SMM 14\.5/);
  await blue(page).getByLabel('Start altitude (ft)').fill('15500');
  const note = blue(page).locator('.tf-alt-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText(/^Above 15,000 ft the model's sustained turn rate reads low: up to 28 % low at 20,000 ft and above near 200 KIAS \(within 0\.65°\/s at 15,000 ft and below\)\. The SMM recommends aerobatics below 16,000 ft MSL \(SMM 14\.5 para 10\)\.$/);
  await expect(blue(page).getByLabel('Start altitude (ft)')).toHaveAccessibleDescription(/SMM 14\.5 para 10/);
  await expect(red(page).locator('.tf-alt-note')).toBeHidden();
  // About: the model's MPT bank against the SMM's.
  await expect(page.locator('.tf-energy-about')).toBeHidden();
  await page.getByRole('button', { name: 'About this model' }).click();
  await expect(page.locator('.tf-energy-about')).toBeVisible();
  await expect(page.locator('.tf-energy-about')).toContainText('about 75° for the level MPT');
  await expect(page.locator('.tf-energy-about')).toContainText('about 69° at the deck');
  await expect(page.locator('.tf-energy-about')).toContainText('about 72° in the constant-speed MPT');
  await energyBox(page).uncheck();
  await expect(page.locator('.tf-energy-about')).toBeHidden();
});

test('the 3D view has the hard deck as a see-through plane in Energy mode, with its name, and none without it', async ({ page }) => {
  await trackWebGl(page);
  await openRoute(page, '#/turn-fight');
  await viewChoice(page, '3D').click(); // not check(): the view goes back to 2D at once if 3D cannot start
  await expect(viewChoice(page, '3D')).toBeChecked();
  await expect.poll(() => draws3d(page)).toBeGreaterThan(0);
  await expect(page.locator('.tf-3d-label-deck')).toBeHidden(); // the simple fight has no deck
  await energyBox(page).check();
  await expect(page.locator('.tf-3d-label-deck')).toBeVisible();
  await expect(page.locator('.tf-3d-label-deck')).toHaveText('HARD DECK');
  // The Energy graph is a 2D picture: with 3D showing it is away, and no graph library was fetched for it.
  await expect(page.locator('.tf-energy-panel')).toBeHidden();
  await page.getByLabel('Playback speed').selectOption({ label: '4×' });
  await playButton(page).click();
  await expect.poll(() => seconds(page), { timeout: 30_000 }).toBeGreaterThan(19.9);
  const before = await draws3d(page);
  await expect.poll(() => draws3d(page)).toBeGreaterThan(before);
  await playButton(page).click();
  // The plane is drawn: the yellow of the deck (at 16 % over the dark stage) shows over a wide part of the picture.
  // A WebGL canvas cannot be read back between its frames, so the page's screenshot of it is counted instead.
  const yellowish = async () => {
    const png = (await page.locator('canvas.tf-3d-canvas').screenshot()).toString('base64');
    return page.evaluate(async (b64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${b64}`;
      await image.decode();
      const copy = document.createElement('canvas');
      copy.width = image.width;
      copy.height = image.height;
      const ctx = copy.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const { data } = ctx.getImageData(0, 0, copy.width, copy.height);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 20 && data[i] > data[i + 2] + 8 && data[i + 1] > data[i + 2] + 5) n++; // yellowish
      return n;
    }, png);
  };
  const withDeck = await yellowish();
  expect(withDeck).toBeGreaterThan(1000);
  await energyBox(page).uncheck();
  await expect.poll(yellowish).toBeLessThan(withDeck / 4); // the same view without the plane is far less yellow
  await expect(page.locator('.tf-3d-label-deck')).toBeHidden();
  await viewChoice(page, '2D').check();
  await expect(page.locator('.tf-3d-label-deck')).toHaveCount(0);
});

test('Energy on at a wide and a narrow screen: nothing overlaps or is cut off, with the settings open', async ({ page }) => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await openRoute(page, '#/turn-fight');
    if (!(await energyBox(page).isChecked())) await energyBox(page).check();
    await settingsButton(page).click();
    expect(await layoutProblems(page), `${size.width} × ${size.height}`).toEqual([]);
    await playButton(page).click();
    await expect.poll(() => seconds(page)).toBeGreaterThan(1);
    await playButton(page).click();
    expect(await layoutProblems(page), `${size.width} × ${size.height}, playing`).toEqual([]);
  }
});
