// Checks: every visible, enabled button and link on each screen does something and causes no console error; outside links go to the expected places.
// Serves: ALL-R8.
// Expected values: design choice: the "did something" rule is written in the test (page changes, dialog opens, or the address goes to a real place).

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

// Traffic is left out of this walk on Patrick's word (4 Oct 06:54Z: "Just delete those shitty tests"). Its one
// fault here was the walk's own: it counted the buttons inside the closed "PFL From Area" panel, which keep a box
// in Chromium though no one can see them (docs/modules/traffic/plan.md, step 4). With about 70 controls, each on a
// fresh page, Traffic would make this walk heavy, so its buttons are checked by its own tests instead.
const CHECKED_ROUTES = ROUTES.filter((route) => route !== '#/traffic');

for (const route of CHECKED_ROUTES) {
  test(`every control on ${route} does something`, async ({ page }) => {
    // Each click starts from a fresh page, so nothing remembered from the last
    // one (a collapsed panel, say) moves the controls around.
    await page.addInitScript(() => {
      if (location.protocol.startsWith('http')) localStorage.clear(); // not on about:blank
    });
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
      // Find it again by its words (and which one of that name it is), not its number: some controls arrive after the
      // page mounts, such as the SOF's Acknowledge all once the weather is in, and would shift the numbers. It also waits
      // until every control of the first read is back, so one arriving late can't pass for the click doing something.
      const nth = list.slice(0, control.index).filter((c) => c.text === control.text).length;
      let again;
      await expect.poll(async () => {
        const now = await tagControls(page);
        again = now.filter((c) => c.text === control.text)[nth];
        return Boolean(again) && now.length >= list.length;
      }, { message: `"${control.text}" is on ${route} again` }).toBe(true);
      const before = await page.evaluate(() => {
        window.__changes = 0;
        new MutationObserver((m) => { window.__changes += m.length; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        return location.hash;
      });
      const target = page.locator(`[data-test-control="${again.index}"]`);
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
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Local first, Zulu beside it').check();
  await page.getByLabel('Card videos').selectOption('reduced');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ooda:v1:app:settings')).values);
  expect(saved).toEqual({ timePrimary: 'local', motion: 'reduced' });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});
