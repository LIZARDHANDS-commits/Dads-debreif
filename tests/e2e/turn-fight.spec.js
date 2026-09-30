// Browser tests for the Turn Fight (SPEC-turn-fight, Testing strategy 4): every
// control does something (R3), nothing overlaps at 1366 × 768 and 1920 × 1080
// (R2), closing the module leaves no frames or timers running (R4), and no
// console errors (R7, from ./fixtures.js).
import { test, expect, expectNoA11yViolations } from './fixtures.js';
import { openRoute } from './routes.js';

const time = (page) => page.locator('.tf-time');
const phase = (page) => page.locator('.tf-phase');
const playButton = (page) => page.locator('.tf-play');
const blue = (page) => page.getByRole('group', { name: 'Blue' });
const red = (page) => page.getByRole('group', { name: 'Red' });
const result = (page) => page.getByRole('table', { name: 'Result' });
const settingsButton = (page) => page.getByRole('button', { name: 'Turn Fight settings' });
const resetDefaults = (page) => page.getByRole('button', { name: 'Reset to V6 defaults' });

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
    await expect(who.getByLabel('G', { exact: true })).toHaveValue('4');
    await expect(who.getByLabel('Pitch (°)')).toBeHidden();
  }
  for (const name of ['First nose chases', 'Climb and dive']) await expect(page.getByLabel(name)).not.toBeChecked();
  await expect(page.getByText('Two aircraft meet head-on, then turn: who gets their nose on the other first?')).toBeVisible();
  // Energy mode isn't built yet, so there is no box for it.
  await expect(page.getByLabel('Energy (T-6)')).toHaveCount(0);
  await expect(page.getByText('coming soon')).toHaveCount(0);
  await expect(page.getByLabel('Playback speed')).toHaveValue('1'); // the option at index 1 is 1×
  await expect(page.getByLabel('Playback speed').locator('option:checked')).toHaveText('1×');
  await expect(time(page)).toHaveText('T+0.0');
  await expect(phase(page)).toHaveText('HEAD-TO-HEAD');
  // Nothing opens by itself, and there's no warning at V6's defaults.
  await expect(resetDefaults(page)).toBeHidden();
  await expect(page.locator('.tf-warning')).toHaveText(['', '']); // the warnings' boxes are always there, empty
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
  await expect(page.locator('.tf-footer')).toHaveText('Simplified: constant speed and turn rate');
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
    () => red(page).getByLabel('G', { exact: true }).fill('5'),
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
  await expect(blue(page).getByLabel('G', { exact: true })).toHaveValue('4');
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
  await expect(page.getByText('opposite turn directions after the merge')).toBeVisible();
  await expect(page.getByText('same turn direction after the merge')).toBeVisible();
  await expect(page.getByText('a yellow dashed line marks the first aircraft')).toBeVisible();
  await about.click();
  await expect(page.getByText('opposite turn directions after the merge')).toBeHidden();
  // The model statement is shown once, in the stage footer.
  await expect(page.getByText('Simplified: constant speed and turn rate')).toHaveCount(1);

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
  await expect(page.getByRole('row', { name: /Time since merge/ })).toContainText('0.0 s');
  await expect(page.getByRole('row', { name: /Height change/ })).toHaveCount(0); // level fight: no height lines
  await playTo(page, 17.5);
  await expect(page.getByRole('row', { name: /Time since merge/ })).toContainText(/[1-9]\.\d s/); // merge at 16.4 s
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
  await expect(note(page)).toHaveText('3D needs WebGL, which this browser does not have.');
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
const headOnButton = (page) => page.getByRole('button', { name: 'Head-on (V6)', exact: true });
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
  await expect(passLine(page)).toHaveText('Pass at T+16.4 s');
  await expect(headOnButton(page)).toBeVisible();
  await expect(time(page)).toHaveText('T+0.0');
});

test('a beam start: HCA 180°, the fight starts over, Play turns at once with no MERGE mark; Head-on (V6) puts all six back, paused', async ({ page }) => {
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
  await expect(passLine(page)).toHaveText('Pass at T+16.4 s');
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

test('Start geometry works from the keyboard: Tab order, arrow keys change a side, Enter and Space press Head-on (V6); Space in a box does not play', async ({ page }) => {
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
  await expect(page.getByRole('img', { name: /fly toward each other and pass at the MERGE mark/ })).toHaveCount(1);
});
