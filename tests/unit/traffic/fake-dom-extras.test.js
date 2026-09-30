// The stand-in DOM's listener rules the traffic tests lean on: capture listeners run first, in the order they were added;
// `{ once: true }` is not a capture listener and runs once; `{ capture: true }` and `true` both mean capture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fake-dom-extras.js';

test('capture as a boolean or as { capture: true } runs before the other listeners, in the order added', () => {
  const document = installFakeDom();
  const el = document.createElement('button');
  const order = [];
  el.addEventListener('click', () => order.push('plain'));
  el.addEventListener('click', () => order.push('first'), true);
  el.addEventListener('click', () => order.push('second'), { capture: true });
  el.dispatch('click');
  assert.deepEqual(order, ['first', 'second', 'plain']);
});

test('an options object without capture is not a capture listener, and once runs it once', () => {
  const document = installFakeDom();
  const el = document.createElement('button');
  const order = [];
  el.addEventListener('click', () => order.push('plain'));
  el.addEventListener('click', () => order.push('once'), { once: true });
  el.addEventListener('click', () => order.push('captured'), { capture: true, once: true });
  el.dispatch('click');
  el.dispatch('click');
  assert.deepEqual(order, ['captured', 'plain', 'once', 'plain'], 'the once listener is after the plain one, and neither once runs again');
});

test('removeEventListener finds a once listener by the function it was added with', () => {
  const document = installFakeDom();
  const el = document.createElement('button');
  let n = 0;
  const fn = () => { n++; };
  el.addEventListener('click', fn, { once: true, capture: true });
  el.removeEventListener('click', fn);
  el.addEventListener('click', () => { n += 10; }, true);
  el.dispatch('click');
  assert.equal(n, 10);
});
