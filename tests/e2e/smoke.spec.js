import { test, expect } from './fixtures.js';

test('home page opens with its title and build version @smoke', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle("DAD's OODA LOOP");
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("DAD's OODA LOOP");
  const version = await page.locator('meta[name="app-version"]').getAttribute('content');
  expect(version).toMatch(/^\d{4}-\d{2}-\d{2} \S+$/);
  await expect(page.locator('#app-version')).toHaveText(version);
});
