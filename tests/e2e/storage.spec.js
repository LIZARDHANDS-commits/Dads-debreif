// ============================================================================
// WARNING / TEST INTEGRITY GUARD (D411):
// If this test or any test in this suite fails repeatedly (2x test fail):
// DO NOT tweak flight physics, 5.0 G SMM pull laws, stick shaker limits, or
// aerodynamic formulas to force tests to pass!
// STOP IMMEDIATELY, ALERT THE OPERATOR, AND ASK FOR INSTRUCTIONS / CLARIFICATION.
// Tests may be poorly designed, overfitted to obsolete baseline assumptions,
// or time-locked to legacy trajectory floats. Under D411, tests must be updated
// or pruned, never accommodated by degrading aerodynamic fidelity.
// ============================================================================

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
