// Every page of the app, for tests that walk them all.
export const ROUTES = ['#/', '#/about', '#/debrief', '#/turn-sim', '#/turn-fight', '#/traffic', '#/sof', '#/no-such-page'];

// Opens a route and waits until the shell has mounted its page and every
// stylesheet has loaded. A module adds its stylesheet while it mounts, so on a
// busy runner a test could otherwise measure unstyled blocks (two columns
// "overlapping" that are really stacked, found by Turn Fight's 5b audit).
export async function openRoute(page, hash) {
  await page.goto(`./${hash}`);
  await page.waitForFunction(() => window.__ooda?.stats().mounted);
  await stylesLoaded(page);
}

export function stylesLoaded(page) {
  return page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every((link) => link.sheet));
}
