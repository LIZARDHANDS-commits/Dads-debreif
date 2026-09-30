// Shared test setup: every browser test fails if the page logs an error or
// throws (R7). Import `test` and `expect` from here instead of @playwright/test.
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

// Runs axe (WCAG 2.0 A and AA rules) on the page as it is now and fails with a
// readable list: rule id, impact, what it means, and the elements affected.
// `exclude` is a list of CSS selectors to skip; use it only for a named,
// known problem with a TODO naming the rule, never to silence a whole rule.
export async function expectNoA11yViolations(page, { exclude = [] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const report = violations.map((v) => {
    const targets = v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n');
    return `${v.id} (${v.impact}): ${v.help}\n${targets}`;
  });
  expect(report, `accessibility violations:\n${report.join('\n')}`).toEqual([]);
}
