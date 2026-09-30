import { test, expect } from './fixtures.js';
import { openRoute } from './routes.js';

test('the app still works when the browser blocks storage @smoke', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage is disabled', 'SecurityError'); },
    });
  });
  await openRoute(page, '#/');
  await expect(page.locator('.card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#settings-storage-note')).toBeVisible();
  await page.getByLabel('Local first, Zulu beside it').check();
  await expect(page.getByLabel('Local first, Zulu beside it')).toBeChecked();
});
