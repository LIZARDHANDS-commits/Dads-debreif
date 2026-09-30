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

test('the Turn Sim has no accessibility violations', async ({ page }) => {
  await openRoute(page, '#/turn-sim');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'turn-sim');
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
