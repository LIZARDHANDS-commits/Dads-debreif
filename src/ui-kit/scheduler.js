// The one animation loop and timer service for the whole app. Every frame
// callback and timer belongs to a scope, and the shell disposes a module's
// scope when the module closes, so nothing it started keeps running (R4).
// This is the only file allowed to call requestAnimationFrame or timers.
// See specs/SPEC-ui-kit.md.

export function createScheduler({
  raf = (cb) => globalThis.requestAnimationFrame(cb),
  caf = (id) => globalThis.cancelAnimationFrame(id),
  setTimeout = (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout = (id) => globalThis.clearTimeout(id),
  onError = (msg, err) => console.error(msg, err),
} = {}) {
  const frames = new Set(); // { cb, scope }
  const timers = new Set(); // { id, scope }
  let rafId = null;
  let lastTime = null;

  function requestLoop() {
    if (rafId === null && frames.size > 0) rafId = raf(tick);
  }

  function stopLoop() {
    if (rafId !== null) caf(rafId);
    rafId = null;
    lastTime = null;
  }

  function tick(time) {
    rafId = null;
    if (frames.size === 0) {
      lastTime = null;
      return;
    }
    const dt = lastTime === null ? 0 : time - lastTime;
    lastTime = time;
    for (const entry of [...frames]) {
      if (!frames.has(entry)) continue; // cancelled earlier in this frame
      try {
        entry.cb(dt, time);
      } catch (err) {
        frames.delete(entry);
        onError(`Animation callback in "${entry.scope}" failed and was stopped:`, err);
      }
    }
    if (frames.size > 0) requestLoop();
    else lastTime = null;
  }

  function addFrame(scopeName, cb) {
    const entry = { cb, scope: scopeName };
    frames.add(entry);
    requestLoop();
    return () => {
      frames.delete(entry);
      if (frames.size === 0) stopLoop();
    };
  }

  function addTimer(scopeName, ms, cb, repeat) {
    const entry = { id: null, scope: scopeName };
    const run = () => {
      if (!timers.has(entry)) return;
      if (repeat) entry.id = setTimeout(run, ms);
      else timers.delete(entry);
      try {
        cb();
      } catch (err) {
        cancel();
        onError(`Timer in "${scopeName}" failed and was stopped:`, err);
      }
    };
    const cancel = () => {
      if (!timers.has(entry)) return;
      timers.delete(entry);
      clearTimeout(entry.id);
    };
    timers.add(entry);
    entry.id = setTimeout(run, ms);
    return cancel;
  }

  function scope(name) {
    const cancels = new Set();
    let disposed = false;
    const track = (cancel) => {
      if (disposed) {
        cancel();
        return () => {};
      }
      const wrapped = () => {
        cancels.delete(wrapped);
        cancel();
      };
      cancels.add(wrapped);
      return wrapped;
    };
    return {
      name,
      frame: (cb) => track(addFrame(name, cb)),
      every: (ms, cb) => track(addTimer(name, ms, cb, true)),
      after(ms, cb) {
        const cancel = track(
          addTimer(name, ms, () => {
            cancels.delete(cancel); // done: nothing left to cancel
            cb();
          }, false),
        );
        return cancel;
      },
      dispose() {
        disposed = true;
        for (const cancel of [...cancels]) cancel();
      },
    };
  }

  return {
    scope,
    stats: () => ({ frames: frames.size, timers: timers.size }),
  };
}
