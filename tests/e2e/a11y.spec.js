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

// Skipped until the Traffic Sim's entry in src/shell/registry.js lands (tests/e2e/traffic.spec.js
// runs the same check on its test page in the meantime).
test.skip('the Traffic Sim has no accessibility violations', async ({ page }) => { // unskip when the registry entry lands
  await openRoute(page, '#/traffic');
  await page.waitForFunction(() => window.__ooda.stats().mounted === 'traffic');
  await expectNoA11yViolations(page);
});
