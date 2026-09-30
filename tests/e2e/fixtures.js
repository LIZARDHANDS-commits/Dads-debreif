// Shared test setup: every browser test fails if the page logs an error or
// throws (R7). Import `test` and `expect` from here instead of @playwright/test.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console error: ${msg.text()}`);
    });
    await use(page);
    expect(errors, 'the page logged errors').toEqual([]);
  },
});

export { expect };
