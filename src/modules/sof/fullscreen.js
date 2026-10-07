// Full screen for the whole SOF picture (Dad, 7 Oct; SOF-44): the map area (2D or 3D), the narrow airfield column and the bottom timeline strip go
// full screen together, so the airfield rows, their hover cards and the strip stay in view. One of these is made by the screen (index.js) and shared by
// the 2D map's Full screen button and the 3D view's, so there is one state and one set of words.
//
// It asks the browser's Fullscreen API for the container (`target()`), and when the browser refuses (an iframe without permission, or no fullscreen at
// all) it fills the window with CSS instead (the container gets `is-fullscreen`, sof.css draws it as a fixed layer), where Escape or the button brings the
// page back. Everything it listens to goes through the module's `listen`, so closing the module removes it; dispose() leaves full screen.

/**
 * target(): the element to fill the window (asked when the button is pressed, since the screen makes it after this). listen: the module's app.listen.
 * win: the window (a test double can stand in).
 * Returns { isFull(), toggle(), exit(), subscribe(fn) -> stop, dispose() }. Subscribers are called after every change, with no arguments.
 */
export function createFullScreen({ target, listen, win = globalThis }) {
  const doc = () => /** @type {any} */ (win.document); // `any`: the prefixed names older Safari has
  const subscribers = new Set();
  let fallback = false;
  let stopKey = null;
  let disposed = false;

  const fullElement = () => doc()?.fullscreenElement ?? doc()?.webkitFullscreenElement ?? null;
  const isFull = () => fallback || (fullElement() !== null && fullElement() === target());

  function changed() {
    const element = target();
    element?.classList.toggle('is-fullscreen', fallback);
    for (const fn of [...subscribers]) fn();
  }

  const stops = [
    listen(doc(), 'fullscreenchange', changed),
    listen(doc(), 'webkitfullscreenchange', changed),
  ];

  async function enter() {
    const element = target();
    if (!element) return;
    const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
    if (request && doc()?.fullscreenEnabled !== false) {
      try {
        await request.call(element);
        return; // fullscreenchange does the rest
      } catch {
        // The browser refused: fill the window with CSS instead.
      }
    }
    if (disposed) return;
    fallback = true;
    stopKey = listen(doc(), 'keydown', (event) => {
      if (event.key === 'Escape') exit();
    });
    changed();
  }

  function exit() {
    if (fallback) {
      fallback = false;
      stopKey?.();
      stopKey = null;
      changed();
    }
    if (fullElement() !== null && fullElement() === target()) (doc().exitFullscreen ?? doc().webkitExitFullscreen)?.call(doc())?.catch?.(() => {});
  }

  return {
    isFull,
    toggle() {
      if (isFull()) exit();
      else enter();
    },
    exit,
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    dispose() {
      if (disposed) return;
      exit();
      disposed = true;
      stopKey?.();
      for (const stop of stops) stop();
      subscribers.clear();
    },
  };
}
