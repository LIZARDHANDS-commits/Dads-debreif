// R3: every visible button and link does something, and causes no errors.
import { test, expect } from './fixtures.js';
import { ROUTES, openRoute } from './routes.js';

// Marks every visible, enabled control (outside closed dialogs) with a number
// and returns what each one is.
async function tagControls(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href], button')]
      .filter((el) => el.getClientRects().length > 0 && !el.disabled && !el.closest('dialog:not([open])') && !el.classList.contains('skip-link'))
      .map((el, index) => {
        el.dataset.testControl = String(index);
        return { index, href: el.getAttribute('href'), target: el.getAttribute('target'), text: el.textContent.trim() };
      }),
  );
}

for (const route of ROUTES) {
  test(`every control on ${route} does something`, async ({ page }) => {
    await openRoute(page, route);
    const list = await tagControls(page);
    expect(list.length).toBeGreaterThan(0);

    for (const control of list) {
      if (control.href && /^(https?:|mailto:)/.test(control.href)) {
        // Outside links: check the address instead of leaving the app.
        expect(control.href, control.text).toMatch(/^(https:\/\/(github\.com|www\.venmo\.com)\/|mailto:\S+@\S+)/);
        if (control.href.startsWith('http')) expect(control.target, `${control.text} opens in a new tab`).toBe('_blank');
        continue;
      }
      await page.goto('about:blank'); // a fresh page each time, so an open dialog can't carry over
      await openRoute(page, route);
      await tagControls(page);
      const before = await page.evaluate(() => {
        window.__changes = 0;
        new MutationObserver((m) => { window.__changes += m.length; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        return location.hash;
      });
      const target = page.locator(`[data-test-control="${control.index}"]`);
      await expect(target).toHaveText(control.text);
      await target.click();
      const after = await page.evaluate(() => ({ hash: location.hash, changes: window.__changes, dialog: Boolean(document.querySelector('dialog[open]')) }));
      // A link to the page you're already on counts: it's where it says it goes.
      const didSomething = after.hash !== before || after.dialog || after.changes > 0 || control.href === before;
      expect(didSomething, `"${control.text}" did nothing on ${route}`).toBe(true);
    }
  });
}

test('the Settings dialog controls change settings, and Done closes it', async ({ page }) => {
  await openRoute(page, '#/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Local first, Zulu beside it').check();
  await page.getByLabel('Card videos').selectOption('reduced');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ooda:v1:app:settings')).values);
  expect(saved).toEqual({ timePrimary: 'local', motion: 'reduced' });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});
