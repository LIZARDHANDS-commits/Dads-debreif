// Every page of the app, for tests that walk them all.
export const ROUTES = ['#/', '#/about', '#/debrief', '#/turn-sim', '#/turn-fight', '#/traffic', '#/sof', '#/no-such-page'];

// Opens a route and waits until the shell has mounted its page.
export async function openRoute(page, hash) {
  await page.goto(`./${hash}`);
  await page.waitForFunction(() => window.__ooda?.stats().mounted);
}
