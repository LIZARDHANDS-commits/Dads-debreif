// Accessibility checks (axe, WCAG 2.0 A and AA) on each screen (D142).
// Each module route is added here as it is hooked into the registry.
import { test, expect, expectNoA11yViolations } from './fixtures.js';
import { openRoute } from './routes.js';

test('home has no accessibility violations @smoke', async ({ page }) => {
  await openRoute(page, '#/');
  await expectNoA11yViolations(page);
});

test('About has no accessibility violations', async ({ page }) => {
  await openRoute(page, '#/about');
  await expectNoA11yViolations(page);
});

test('the Settings dialog has no accessibility violations', async ({ page }) => {
  await openRoute(page, '#/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await expectNoA11yViolations(page);
});

test('the Debrief Viewer has no accessibility violations before a flight is loaded', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'debrief');
  await expectNoA11yViolations(page);
});

test('the Debrief Viewer has no accessibility violations with the example flight loaded', async ({ page }) => {
  await openRoute(page, '#/debrief');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'debrief');
  await page.getByRole('button', { name: 'Example flight' }).click();
  await expect(page.locator('.flight-status')).toHaveText(/^4 tracks loaded/, { timeout: 20_000 });
  await expectNoA11yViolations(page);
});

test('the Traffic Sim has no accessibility violations', async ({ page }) => {
  await openRoute(page, '#/traffic');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'traffic');
  await expectNoA11yViolations(page);
});

test('the Turn Sim has no accessibility violations', async ({ page }) => {
  await openRoute(page, '#/turn-sim');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'turn-sim');
  await expectNoA11yViolations(page);
});

test('the Turn Sim has no accessibility violations with its settings, More …, and Layers open and NM rings on (audit yellow 6)', async ({ page }) => {
  await openRoute(page, '#/turn-sim');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'turn-sim');
  await page.getByRole('button', { name: 'Turn Sim settings' }).click();
  await page.getByRole('button', { name: 'More …' }).click();
  await expect(page.getByRole('heading', { name: 'Aircraft errors' })).toBeVisible();
  await page.getByLabel('Put it out of position').first().check();
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: /^Layers/ }).click();
  await page.getByLabel('NM rings').check();
  await expect(page.getByLabel('NM rings')).toBeChecked();
  await expectNoA11yViolations(page);
});

test('SOF has no accessibility violations with its recorded weather', async ({ page }) => {
  // fixtures.js answers MET Norway and Datamask from tests/fixtures/sof for every spec.
  await openRoute(page, '#/sof');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'sof');
  await expect(page.locator('article.sof-card').first()).toBeVisible();
  await expectNoA11yViolations(page);
});

test('Turn Fight has no accessibility violations', async ({ page }) => {
  await openRoute(page, '#/turn-fight');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'turn-fight');
  await expect(page.locator('.tf-play')).toBeVisible();
  await expectNoA11yViolations(page);
});
