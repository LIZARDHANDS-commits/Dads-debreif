// Checks: the host gives each module its own tools and, when a module closes, fails, throws or is replaced, removes every frame, timer, listener and subscription.
// Serves: ALL-R12, ALL-R11.
// Expected values: design choice: counts of what was started and removed are worked out in the test from the host's contract.

import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDocument } from '../ui-kit/fake-dom.js';
import { createAirfields } from '../../../src/airfields/airfields.js';
import { createHost } from '../../../src/shell/host.js';
import { createScheduler } from '../../../src/ui-kit/scheduler.js';
import { createStore } from '../../../src/storage/store.js';
import { createStandards } from '../../../src/storage/standards.js';
import { DEFAULT_STANDARDS } from '../../../src/core/standards.js';
import { createSettings } from '../../../src/storage/settings.js';

const doc = installFakeDocument();

// An event target that counts its listeners.
function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) { listeners.set(fn, type); },
    removeEventListener(type, fn) { listeners.delete(fn); },
    fire(type, event) { for (const [fn, t] of [...listeners]) if (t === type) fn(event); },
  };
}

function setup() {
  const scheduler = createScheduler({ raf: () => 1, caf: () => {}, setTimeout: () => 1, clearTimeout: () => {} });
  const store = createStore(undefined);
  const settings = createSettings(store.scope('app'), { timePrimary: 'zulu' });
  const win = target();
  const statuses = [];
  const root = doc.createElement('main');
  const host = createHost({ root, scheduler, store, settings, keyTarget: win, time: { tag: 'time' }, onStatus: (t) => statuses.push(t) });
  return { host, scheduler, settings, store, win, root, statuses };
}

// A module that starts one of everything the shell is meant to clean up.
function busyModule(log, extra = target()) {
  return {
    id: 'busy',
    title: 'Busy',
    mount(root, app) {
      root.appendChild(doc.createElement('canvas'));
      app.scheduler.frame(() => {});
      app.scheduler.every(1000, () => {});
      app.listen(extra, 'resize', () => log.push('resize'));
      app.keys({ KeyP: () => log.push('P') });
      app.settings.subscribe((s) => log.push(`settings:${s.timePrimary}`));
      app.storage.set('last', 1);
      app.status('ready');
      return () => log.push('cleanup');
    },
  };
}

test('mounting hands the module its scoped tools', async () => {
  const { host, root, statuses, store } = setup();
  let seen;
  await host.open({ id: 'debrief', load: async () => ({ default: { id: 'debrief', mount: (r, app) => { seen = app; } } }) });
  assert.equal(root.dataset.module, 'debrief');
  assert.equal(host.current, 'debrief');
  assert.deepEqual(seen.time, { tag: 'time' });
  seen.storage.set('x', 5);
  assert.equal(store.scope('debrief').get('x'), 5);
  assert.equal(store.get('x', 'not in app scope'), 'not in app scope');
  seen.status('hello');
  assert.deepEqual(statuses, ['hello']);
});

test('closing a module removes everything it started (R4)', async () => {
  const { host, scheduler, settings, win, root } = setup();
  const log = [];
  const extra = target();
  await host.open({ id: 'busy', load: async () => ({ default: busyModule(log, extra) }) });
  assert.deepEqual(scheduler.stats(), { frames: 1, timers: 1 });
  assert.equal(extra.listeners.size, 1);
  assert.equal(win.listeners.size, 1);
  win.fire('keydown', { code: 'KeyP', key: 'p', target: {}, preventDefault() {} });
  settings.update({ timePrimary: 'local' });
  assert.deepEqual(log, ['P', 'settings:local']);

  host.close();
  assert.deepEqual(log, ['P', 'settings:local', 'cleanup']);
  assert.deepEqual(scheduler.stats(), { frames: 0, timers: 0 });
  assert.equal(extra.listeners.size, 0);
  assert.equal(win.listeners.size, 0);
  assert.equal(root.childNodes.length, 0);
  assert.equal(root.dataset.module, undefined);
  assert.equal(host.current, null);
  settings.update({ timePrimary: 'zulu' });
  assert.equal(log.length, 3, 'no settings calls after closing');
  assert.deepEqual(host.stats(), { mounted: null, listeners: 0, subscriptions: 0 });
});

test('opening another module closes the current one first', async () => {
  const { host, scheduler } = setup();
  const log = [];
  await host.open({ id: 'busy', load: async () => ({ default: busyModule(log) }) });
  await host.open({ id: 'quiet', load: async () => ({ default: { id: 'quiet', mount() {} } }) });
  assert.ok(log.includes('cleanup'));
  assert.equal(host.current, 'quiet');
  assert.deepEqual(scheduler.stats(), { frames: 0, timers: 0 });
});

test('shortcuts are ignored while typing in a field or with modifier keys', async () => {
  const { host, win } = setup();
  const log = [];
  await host.open({ id: 'busy', load: async () => ({ default: busyModule(log) }) });
  win.fire('keydown', { code: 'KeyP', key: 'p', target: { tagName: 'INPUT' }, preventDefault() {} });
  win.fire('keydown', { code: 'KeyP', key: 'p', target: { isContentEditable: true }, preventDefault() {} });
  win.fire('keydown', { code: 'KeyP', key: 'p', ctrlKey: true, target: {}, preventDefault() {} });
  win.fire('keydown', { code: 'KeyP', key: 'p', target: {}, repeat: false, preventDefault() {} });
  assert.deepEqual(log, ['P']);
});

test('a module that fails to mount is cleaned up and the host stays usable', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { host, scheduler, win } = setup();
  const broken = { id: 'broken', mount(root, app) { app.scheduler.frame(() => {}); app.keys({ KeyX: () => {} }); throw new Error('boom'); } };
  await assert.rejects(host.open({ id: 'broken', load: async () => ({ default: broken }) }), /boom/);
  assert.equal(host.current, null);
  assert.deepEqual(scheduler.stats(), { frames: 0, timers: 0 });
  assert.equal(win.listeners.size, 0);
  await host.open({ id: 'quiet', load: async () => ({ default: { id: 'quiet', mount() {} } }) });
  assert.equal(host.current, 'quiet');
});

test('a module whose cleanup throws is still fully closed', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { host, scheduler } = setup();
  const mod = { id: 'm', mount(root, app) { app.scheduler.every(10, () => {}); return () => { throw new Error('bad cleanup'); }; } };
  await host.open({ id: 'm', load: async () => ({ default: mod }) });
  host.close();
  assert.equal(host.current, null);
  assert.deepEqual(scheduler.stats(), { frames: 0, timers: 0 });
});

test('if the user navigates away while a module is loading, it never mounts', async () => {
  const { host } = setup();
  let release;
  let mounted = false;
  const slow = host.open({ id: 'slow', load: () => new Promise((r) => { release = () => r({ default: { id: 'slow', mount() { mounted = true; } } }); }) });
  host.close();
  release();
  await slow;
  assert.equal(mounted, false);
  assert.equal(host.current, null);
});

test('shortcuts stay out of the way of dialogs, pressed buttons and handled keys', async () => {
  const { host, win } = setup();
  const log = [];
  await host.open({ id: 'keys', load: async () => ({ default: { id: 'keys', mount(r, app) { app.keys({ Space: () => log.push('space'), KeyP: () => log.push('P') }); } } }) });
  const inside = (selector) => ({ closest: (s) => (s.includes(selector) ? {} : null) });
  let prevented = 0;
  const key = (code, k, target, extra = {}) => win.fire('keydown', { code, key: k, target, preventDefault() { prevented += 1; }, ...extra });
  key('KeyP', 'p', inside('dialog[open]')); // behind the open Settings dialog
  key('Space', ' ', inside('button')); // Space is pressing a focused button
  key('Space', ' ', {}, { defaultPrevented: true }); // something else already handled it
  assert.deepEqual(log, []);
  assert.equal(prevented, 0, 'the button still gets its Space');
  key('KeyP', 'p', inside('button')); // letters still work with a button focused
  key('Space', ' ', {});
  assert.deepEqual(log, ['P', 'space']);
});

test('stopping a listener twice does not hide a leak, and keys works when app is destructured', async () => {
  const { host } = setup();
  const extra = target();
  let stopTwice;
  await host.open({
    id: 'm',
    load: async () => ({
      default: {
        id: 'm',
        mount(root, { listen, keys }) {
          stopTwice = listen(extra, 'click', () => {});
          listen(extra, 'input', () => {}); // left for the host to clean up
          keys({ KeyP: () => {} });
        },
      },
    }),
  });
  stopTwice();
  stopTwice();
  assert.equal(host.stats().listeners, 2);
  host.close();
  assert.equal(extra.listeners.size, 0);
});

test('a load that fails after the user has moved on is ignored', async () => {
  const { host } = setup();
  let fail;
  const slow = host.open({ id: 'slow', load: () => new Promise((resolve, reject) => { fail = () => reject(new Error('offline')); }) });
  await host.open({ id: 'quiet', load: async () => ({ default: { id: 'quiet', mount() {} } }) });
  fail();
  await slow; // resolves quietly instead of reporting an error for a page nobody is on
  assert.equal(host.current, 'quiet');
});

test('modules read the airfields setting, and their airfields subscriptions end on close (R4)', async () => {
  const scheduler = createScheduler({ raf: () => 1, caf: () => {}, setTimeout: () => 1, clearTimeout: () => {} });
  const store = createStore(undefined);
  const settings = createSettings(store.scope('app'), { timePrimary: 'zulu' });
  const airfields = createAirfields({ store: store.scope('airfields') });
  const host = createHost({ root: doc.createElement('main'), scheduler, store, settings, time: {}, airfields, keyTarget: target() });
  const seen = [];
  let app;
  await host.open({ id: 'sof', load: async () => ({ default: { id: 'sof', mount: (r, a) => { app = a; a.airfields.subscribe((af) => seen.push(af.home().icao)); } } }) });
  assert.equal(app.airfields.home().icao, 'CYMJ');
  assert.deepEqual(app.airfields.stations(), ['CYMJ', 'CYQR', 'CYYN', 'CYXE']);
  assert.equal(typeof app.airfields.update, 'function', 'a module may change home and alternates, through the same checks as Settings (SOF Home base, 10 Oct 2026)');
  airfields.update({ home: 'CYXH' });
  assert.deepEqual(seen, ['CYXH']);
  assert.equal(host.stats().subscriptions, 1);
  host.close();
  airfields.update({ home: 'CYMJ' });
  assert.deepEqual(seen, ['CYXH'], 'no calls after closing');
  assert.equal(host.stats().subscriptions, 0);
});

test('modules share one set of standards, can change and reset them, and their subscriptions end on close (R4, D89)', async () => {
  const scheduler = createScheduler({ raf: () => 1, caf: () => {}, setTimeout: () => 1, clearTimeout: () => {} });
  const store = createStore(undefined);
  const settings = createSettings(store.scope('app'), { timePrimary: 'zulu' });
  const standards = createStandards({ store: store.scope('standards') });
  const host = createHost({ root: doc.createElement('main'), scheduler, store, settings, time: {}, standards, keyTarget: target() });
  const seen = [];
  let app;
  await host.open({ id: 'debrief', load: async () => ({ default: { id: 'debrief', mount: (r, a) => { app = a; a.standards.subscribe((s) => seen.push(s.offset.aftTargetFt)); } } }) });
  assert.deepEqual(app.standards.get(), DEFAULT_STANDARDS);
  assert.ok(Object.isFrozen(app.standards.get().offset));
  assert.equal(app.standards.limits.offset.aftTargetFt.step, 100);
  assert.equal(app.standards.update({ offset: { aftTargetFt: -1 } }).ok, false);
  assert.equal(app.standards.update({ offset: { aftTargetFt: 9000 } }).ok, true);
  assert.equal(standards.get().offset.aftTargetFt, 9000, 'one shared copy');
  assert.equal(host.stats().subscriptions, 1);
  host.close();
  standards.reset();
  assert.deepEqual(seen, [9000], 'no calls after closing');
  assert.equal(host.stats().subscriptions, 0);
  assert.deepEqual(standards.get(), DEFAULT_STANDARDS);
});

test('modules get the example flight fetcher as app.exampleText', async () => {
  const scheduler = createScheduler({ raf: () => 1, caf: () => {}, setTimeout: () => 1, clearTimeout: () => {} });
  const store = createStore(undefined);
  const settings = createSettings(store.scope('app'), { timePrimary: 'zulu' });
  const exampleText = async (asset) => `text of ${asset}`;
  const host = createHost({ root: doc.createElement('main'), scheduler, store, settings, time: {}, exampleText, keyTarget: target() });
  let app;
  await host.open({ id: 'debrief', load: async () => ({ default: { id: 'debrief', mount: (r, a) => { app = a; } } }) });
  assert.equal(await app.exampleText('585aab2601b787ed.kml'), 'text of 585aab2601b787ed.kml');
  host.close();
});

test('canLeave: the open module can ask before it is closed, a broken check still asks, and checks end with the module', async (t) => {
  const { host } = setup();
  t.mock.method(console, 'error', () => {});
  assert.equal(host.leaveQuestion(), null, 'nothing open, nothing to ask');
  let unsaved = false;
  let stop;
  await host.open({ id: 'debrief', load: async () => ({ default: { mount: (root, app) => {
    app.canLeave(() => '   ');
    stop = app.canLeave(() => (unsaved ? 'Leave without the radar?' : null));
  } } }) });
  assert.equal(host.leaveQuestion(), null, 'nothing unsaved (a blank answer asks nothing)');
  unsaved = true;
  assert.equal(host.leaveQuestion(), 'Leave without the radar?');
  stop();
  assert.equal(host.leaveQuestion(), null, 'a stopped check is not asked');
  stop = null;

  await host.open({ id: 'debrief', load: async () => ({ default: { mount: (root, app) => { app.canLeave(() => { throw new Error('broken'); }); } } }) });
  assert.equal(host.leaveQuestion(), "This page couldn't check for unsaved work. Leave anyway?", 'a broken check still asks');
  assert.equal(console.error.mock.callCount(), 1, 'and is reported');

  await host.open({ id: 'debrief', load: async () => ({ default: { mount: (root, app) => { app.canLeave(() => 'Still here?'); } } }) });
  assert.equal(host.leaveQuestion(), 'Still here?');
  host.close();
  assert.equal(host.leaveQuestion(), null, 'closing the module drops its checks');
});
