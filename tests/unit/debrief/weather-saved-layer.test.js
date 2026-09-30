// The saved radar and lightning pictures on the map (SPEC-debrief: Saved radar
// and lightning): how a frame becomes an image, where it is drawn, and the few
// kept in memory. A fake image and canvas, so it runs in Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedWeatherLayer, imageAddress, IMAGES_KEPT } from '../../../src/modules/debrief/map2d/saved-weather.js';

const BOX = { minLat: 49.5, maxLat: 51.1, minLon: -106.79, maxLon: -104.41 };
const item = (key, patch = {}) => ({ key, mime: 'image/png', data: 'AAAA', box: BOX, alpha: 0.75, ...patch });

function fakeImages() {
  const made = [];
  const makeImage = () => {
    const image = { src: '', onload: null, onerror: null, crossOrigin: undefined };
    made.push(image);
    return image;
  };
  return { made, makeImage };
}
function fakeCtx() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1,
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  };
}
// Lat/lon to screen: 100 px a degree, north up, the origin at 51.1 N, 106.79 W.
const toScreen = (lat, lon) => [(lon - BOX.minLon) * 100, (BOX.maxLat - lat) * 100];

test('a picture is an image from a data address of its own type and bytes, never a link', () => {
  assert.equal(imageAddress({ mime: 'image/png', data: 'AAAA' }), 'data:image/png;base64,AAAA');
  assert.throws(() => imageAddress({ mime: 'image/webp', data: 'AAAA' }), 'PNG only');
  assert.throws(() => imageAddress({ mime: 'image/svg+xml', data: 'AAAA' }));
  assert.throws(() => imageAddress({ mime: 'image/png', data: 'AA"><script>' }));
  assert.throws(() => imageAddress({ mime: 'text/html', data: 'AAAA' }));
});

test('nothing is drawn until the image has loaded, then it lands on its box\'s corners at its opacity', () => {
  const { made, makeImage } = fakeImages();
  let redraws = 0;
  const layer = createSavedWeatherLayer({ makeImage, onChange: () => redraws++ });
  const ctx = fakeCtx();
  layer.draw(ctx, { items: [item('rain@1')], toScreen });
  assert.equal(made.length, 1);
  assert.equal(made[0].src, 'data:image/png;base64,AAAA');
  assert.equal(made[0].crossOrigin, undefined, 'a data address needs no CORS');
  assert.equal(ctx.calls.some((c) => c[0] === 'drawImage'), false);
  made[0].onload();
  assert.equal(redraws, 1);
  const again = fakeCtx();
  layer.draw(again, { items: [item('rain@1')], toScreen });
  const [, image, x, y, w, h] = again.calls.find((c) => c[0] === 'drawImage');
  assert.equal(image, made[0]);
  assert.ok(Math.abs(x - 0) < 1e-9 && Math.abs(y - 0) < 1e-9);
  assert.ok(Math.abs(w - 238) < 1e-6 && Math.abs(h - 160) < 1e-6, `${w} x ${h}`);
  assert.deepEqual(again.calls.filter((c) => c[0] === 'save' || c[0] === 'restore').length, 2);
});

test('opacity is set for the picture and put back, so it doesn\'t leak into the next layer', () => {
  const { made, makeImage } = fakeImages();
  const layer = createSavedWeatherLayer({ makeImage, onChange: () => {} });
  layer.draw(fakeCtx(), { items: [item('a', { alpha: 0.5 })], toScreen });
  made[0].onload();
  const seen = [];
  const ctx = { ...fakeCtx(), drawImage() { seen.push(this.globalAlpha); } };
  layer.draw(ctx, { items: [item('a', { alpha: 0.5 })], toScreen });
  assert.deepEqual(seen, [0.5]);
});

test('the same picture is one image, however many draws; the list order is the draw order', () => {
  const { made, makeImage } = fakeImages();
  const layer = createSavedWeatherLayer({ makeImage, onChange: () => {} });
  const items = [item('rain@1', { data: 'AAAA' }), item('snow@1', { data: 'BBBB' })];
  layer.draw(fakeCtx(), { items, toScreen });
  layer.draw(fakeCtx(), { items, toScreen });
  layer.draw(fakeCtx(), { items, toScreen });
  assert.equal(made.length, 2);
  made.forEach((image) => image.onload());
  const ctx = fakeCtx();
  layer.draw(ctx, { items, toScreen });
  assert.deepEqual(ctx.calls.filter((c) => c[0] === 'drawImage').map((c) => c[1].src), [
    'data:image/png;base64,AAAA', 'data:image/png;base64,BBBB',
  ]);
});

test('only the last few are kept in memory; the oldest go first, and are read again if needed', () => {
  const { made, makeImage } = fakeImages();
  const layer = createSavedWeatherLayer({ makeImage, onChange: () => {} });
  for (let i = 0; i < IMAGES_KEPT + 3; i++) layer.draw(fakeCtx(), { items: [item(`rain@${i}`)], toScreen });
  assert.equal(made.length, IMAGES_KEPT + 3);
  const before = made.length;
  layer.draw(fakeCtx(), { items: [item(`rain@${IMAGES_KEPT + 2}`)], toScreen }); // still kept
  assert.equal(made.length, before);
  layer.draw(fakeCtx(), { items: [item('rain@0')], toScreen }); // gone: read again
  assert.equal(made.length, before + 1);
  assert.equal(made[0].onload, null, 'a dropped image no longer calls back');
});

test('a picture the browser cannot decode is left out, quietly, and not asked again', () => {
  const { made, makeImage } = fakeImages();
  let redraws = 0;
  const layer = createSavedWeatherLayer({ makeImage, onChange: () => redraws++ });
  layer.draw(fakeCtx(), { items: [item('rain@1')], toScreen });
  made[0].onerror();
  const ctx = fakeCtx();
  layer.draw(ctx, { items: [item('rain@1')], toScreen });
  assert.equal(ctx.calls.some((c) => c[0] === 'drawImage'), false);
  assert.equal(made.length, 1);
  assert.equal(layer.state().failed, 1);
});

test('a picture that decodes larger than a picture we asked for is left out, and nothing is drawn from it', () => {
  const { made, makeImage } = fakeImages();
  let redraws = 0;
  const layer = createSavedWeatherLayer({ makeImage, onChange: () => redraws++ });
  layer.draw(fakeCtx(), { items: [item('rain@1')], toScreen });
  made[0].naturalWidth = 16000;
  made[0].naturalHeight = 16000;
  made[0].onload();
  assert.equal(redraws, 0);
  const ctx = fakeCtx();
  layer.draw(ctx, { items: [item('rain@1')], toScreen });
  assert.equal(ctx.calls.some((c) => c[0] === 'drawImage'), false);
  assert.equal(layer.state().failed, 1);
  layer.draw(fakeCtx(), { items: [item('rain@2')], toScreen });
  made[1].naturalWidth = 1024;
  made[1].naturalHeight = 1024;
  made[1].onload();
  assert.equal(redraws, 1, 'a picture at the limit is fine');
});

test('what the last draw found, and disposing lets go of everything', () => {
  const { made, makeImage } = fakeImages();
  const layer = createSavedWeatherLayer({ makeImage, onChange: () => {} });
  layer.draw(fakeCtx(), { items: [item('a'), item('b')], toScreen });
  assert.deepEqual(layer.state(), { wanted: 2, ready: 0, failed: 0 });
  made[0].onload();
  layer.draw(fakeCtx(), { items: [item('a'), item('b')], toScreen });
  assert.deepEqual(layer.state(), { wanted: 2, ready: 1, failed: 0 });
  layer.dispose();
  assert.equal(made[0].onload, null);
  assert.equal(made[1].onload, null);
});

test('no items draws nothing and asks for nothing', () => {
  const { made, makeImage } = fakeImages();
  const layer = createSavedWeatherLayer({ makeImage, onChange: () => {} });
  const ctx = fakeCtx();
  layer.draw(ctx, { items: [], toScreen });
  assert.equal(made.length, 0);
  assert.deepEqual(ctx.calls, []);
});
