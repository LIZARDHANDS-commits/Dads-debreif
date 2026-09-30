import test from 'node:test';
import assert from 'node:assert/strict';
import { watchForUpdates } from '../../../src/shell/update-bar.js';

// Fakes of navigator.serviceWorker, a registration and a worker, just enough for the bar's logic.
class FakeWorker extends EventTarget {
  constructor() {
    super();
    this.state = 'installing';
    this.messages = [];
  }
  postMessage(msg) {
    this.messages.push(msg);
  }
  become(state) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  constructor() {
    super();
    this.waiting = null;
    this.installing = null;
    this.updates = 0;
  }
  async update() {
    this.updates += 1;
  }
  startInstall() {
    this.installing = new FakeWorker();
    this.dispatchEvent(new Event('updatefound'));
    return this.installing;
  }
}

function fakeContainer({ controller = {}, fails = false, empty = false } = {}) {
  const container = new EventTarget();
  container.controller = controller;
  container.registration = new FakeRegistration();
  container.registered = [];
  container.register = async (url) => {
    container.registered.push(url);
    if (fails) throw new Error('blocked');
    return empty ? undefined : container.registration;
  };
  return container;
}

function fakeTimers() {
  const timers = [];
  return { timers, every: (ms, cb) => timers.push({ ms, cb }) };
}

function setup(options) {
  const container = fakeContainer(options);
  const offers = [];
  let reloads = 0;
  const timers = fakeTimers();
  const ready = watchForUpdates({
    container,
    timers,
    onUpdate: (apply) => offers.push(apply),
    reload: () => {
      reloads += 1;
    },
  });
  return { container, offers, timers, ready, reloads: () => reloads };
}

test('without service workers it does nothing', async () => {
  assert.equal(await watchForUpdates({ container: undefined, onUpdate: () => assert.fail() }), null);
});

test('a first install is not offered as an update', async () => {
  const { container, offers, ready } = setup({ controller: null });
  await ready;
  assert.deepEqual(container.registered, ['./sw.js']);
  container.registration.startInstall().become('installed');
  assert.equal(offers.length, 0);
});

test('a new version that finishes downloading shows the bar, and Reload switches to it', async () => {
  const { container, offers, ready, reloads } = setup();
  await ready;
  const worker = container.registration.startInstall();
  assert.equal(offers.length, 0);
  worker.become('installed');
  assert.equal(offers.length, 1);
  assert.equal(reloads(), 0);
  offers[0]();
  assert.deepEqual(worker.messages, [{ type: 'skip-waiting' }]);
  container.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads(), 1);
});

test('a version already waiting when the page opens shows the bar at once', async () => {
  const container = fakeContainer();
  container.registration.waiting = new FakeWorker();
  const offers = [];
  await watchForUpdates({ container, onUpdate: (apply) => offers.push(apply), reload: () => {} });
  assert.equal(offers.length, 1);
});

test("the page doesn't reload on its own when a worker takes over", async () => {
  const { container, ready, reloads } = setup();
  await ready;
  container.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads(), 0);
});

test('it looks for a new version every hour', async () => {
  const { container, timers, ready } = setup();
  assert.equal(timers.timers.length, 1);
  assert.equal(timers.timers[0].ms, 60 * 60 * 1000);
  await ready;
  timers.timers[0].cb();
  assert.equal(container.registration.updates, 1);
});

test('coming back to the tab looks for a new version, at most every five minutes', async () => {
  const container = fakeContainer();
  const doc = new EventTarget();
  doc.visibilityState = 'hidden';
  let clock = 0;
  await watchForUpdates({ container, doc, now: () => clock, onUpdate: () => {}, reload: () => {} });
  const show = (state) => {
    doc.visibilityState = state;
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  clock = 4 * 60 * 1000;
  show('visible');
  assert.equal(container.registration.updates, 0, 'too soon after opening');
  clock = 6 * 60 * 1000;
  show('hidden');
  assert.equal(container.registration.updates, 0, 'not while hidden');
  show('visible');
  assert.equal(container.registration.updates, 1);
  clock += 60 * 1000;
  show('visible');
  assert.equal(container.registration.updates, 1, 'not again within five minutes');
});

test('a blocked registration warns and carries on', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const { ready } = setup({ fails: true });
  assert.equal(await ready, null);
  assert.equal(warn.mock.callCount(), 1);
});

// Some browsers and test runners that block service workers hand back no
// registration instead of refusing, so the page must still open.
test('a registration that comes back empty carries on without offline mode', async () => {
  const { ready } = setup({ empty: true });
  assert.equal(await ready, null);
});

test('when Reload was pressed in another tab, this tab offers a plain reload', async () => {
  const { container, offers, ready, reloads } = setup();
  await ready;
  const worker = container.registration.startInstall();
  worker.become('installed');
  assert.equal(offers.length, 1);
  // Another tab pressed Reload: the new worker takes over every tab.
  worker.become('activated');
  container.dispatchEvent(new Event('controllerchange'));
  assert.equal(reloads(), 0, 'this tab never reloads by itself');
  assert.equal(offers.length, 2, 'the bar stays, now as a plain reload');
  offers[1]();
  assert.equal(reloads(), 1);
});

test('pressing an earlier Reload after the worker is already active just reloads', async () => {
  const { container, offers, ready, reloads } = setup();
  await ready;
  const worker = container.registration.startInstall();
  worker.become('installed');
  worker.become('activated');
  offers[0]();
  assert.deepEqual(worker.messages, [], 'no message to a worker that is already active');
  assert.equal(reloads(), 1);
});

test('the first install taking control does not show the bar', async () => {
  const { container, offers, ready } = setup({ controller: null });
  await ready;
  container.controller = {};
  container.dispatchEvent(new Event('controllerchange'));
  assert.equal(offers.length, 0);
});
