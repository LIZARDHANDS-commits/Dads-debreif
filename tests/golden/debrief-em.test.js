// Golden test (D10): the debrief's EM chart against V6's kmlEmIsolated script,
// run unchanged where it can be: which chart is chosen, the chart images, and
// where a point lands on the chart. The EM numbers themselves are core's
// emPoint, pinned in core's own golden tests (turn rate without /2, D39).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadV6, v6Page } from './v6-source.js';
import { seeded } from './inputs.js';
import { EM_CHARTS, EM_ALTITUDES, EM_PLOT, chooseEmChart, emToScreen } from '../../src/modules/debrief/em.js';

const MARKER = '<script id="kmlEmIsolated">';
const script = (() => {
  const src = v6Page();
  const i = src.indexOf(MARKER);
  return src.slice(i, src.indexOf('</script>', i));
})();

test('the chart is chosen as V6 chose it: by hand, or nearest the formation\'s average altitude', () => {
  const v6 = loadV6(['chooseChart'], {
    marker: MARKER,
    prelude: 'let sel="auto"; const document={ getElementById: () => ({ value: sel }) }; const pick=(s)=>{ sel=s; };',
    expose: ['pick'],
  });
  const r = seeded(51);
  for (let i = 0; i < 3000; i++) {
    const choice = ['auto', 'auto', '6500', '8000', '13000'][Math.floor(5 * r())];
    const n = Math.floor(5 * r());
    const alts = Array.from({ length: n }, () => (r() < 0.1 ? NaN : 2000 + 16000 * r()));
    const live = Object.fromEntries(alts.map((altFt, k) => [k + 1, { altFt }]));
    v6.pick(choice);
    assert.equal(chooseEmChart(choice, alts), v6.chooseChart(live), `${choice} ${alts}`);
  }
});

test('the charts, their turn-rate scales and the plot box are V6\'s', () => {
  assert.deepEqual([...EM_ALTITUDES], [6500, 8000, 13000]);
  assert.match(script, /const CFG=\{6500:\{yMax:35\},8000:\{yMax:35\},13000:\{yMax:30\}\};/);
  for (const a of EM_ALTITUDES) assert.equal(EM_CHARTS[a].turnRateMax, { 6500: 35, 8000: 35, 13000: 30 }[a]);
  assert.match(script, /const sx=c\.width\/1024,sy=c\.height\/512;const left=45\*sx,right=1015\*sx,top=67\*sy,bottom=444\*sy/);
  assert.match(script, /const px=v=>left\+\(v-70\)\/\(330-70\)\*\(right-left\),py=v=>bottom-v\/yMax\*\(bottom-top\);/);
  assert.deepEqual({ ...EM_PLOT }, { width: 1024, height: 512, left: 45, right: 1015, top: 67, bottom: 444, iasMin: 70, iasMax: 330 });
});

test('a point lands where V6\'s px and py put it, at any canvas size', () => {
  // V6's two arrow functions, built from its own text.
  const body = script.match(/const sx=c\.width\/1024[^;]*;const left=[^;]*;const px=[^;]*;/)[0];
  const v6At = new Function('c', 'CFG', 'chart', 'ias', 'tr', `${body} return [px(ias), py(tr)];`);
  const CFG = { 6500: { yMax: 35 }, 8000: { yMax: 35 }, 13000: { yMax: 30 } };
  const r = seeded(52);
  for (let i = 0; i < 3000; i++) {
    const altitude = EM_ALTITUDES[Math.floor(3 * r())];
    const width = 200 + 1800 * r(), height = 100 + 900 * r();
    const ias = 40 + 320 * r(), tr = 40 * r();
    const want = v6At({ width, height }, CFG, altitude, ias, tr);
    const got = emToScreen(ias, tr, altitude, width, height);
    assert.ok(Math.abs(got[0] - want[0]) < 1e-9 && Math.abs(got[1] - want[1]) < 1e-9, `${got} vs ${want}`);
  }
});

test('the chart images are V6\'s own files, byte for byte', () => {
  for (const a of EM_ALTITUDES) {
    const asset = script.match(new RegExp(`${a}:'data:image/jpeg;base64,@@ASSET:([0-9a-f]+\\.jpg)@@'`))[1];
    const v6 = readFileSync(new URL(`../../original/assets/${asset}`, import.meta.url));
    const ours = readFileSync(new URL(`../../public/${EM_CHARTS[a].file}`, import.meta.url));
    assert.ok(v6.equals(ours), `${a} ft chart`);
  }
});
